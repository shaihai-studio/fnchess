/**
 * 函数棋 - Function Chess
 * Copyright (C) 2024 shaihai-studio
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * SeedCrypto - 关卡种子加密/解密模块（二进制优化版本）
 *
 * 编码格式：
 * - mapSize索引(4bit) + 压缩地图 + 锁定掩码(16bit) + token数(12bit) + padding + 签名(32bit)
 * - mapSize档位: 实际游戏使用的14个档位
 * - 地图用混合RLE压缩: 自动选择RLE/Bitmap/Raw
 * - 锁定元素用16bit掩码
 */
class SeedCrypto {
    constructor() {
        this._printWarningIfNeeded();
        this.key = this._deriveKey();
        // 编辑器使用的gridSize档位（range: 5,10,15,...,50 对应 gridSize=range*2）
        this.MAP_SIZES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
        // 注意：新元素必须追加在数组末尾，保持既有索引不变，兼容已生成的种子
        this.ELEMENTS = ['x','+','-','*','/','ln','sin','cos','tan','sqrt','abs','^','e','π','i','!','.','0','1','2','3','4','5','6','7','8','9','arcsin','arccos','arctan'];
    }

    /**
     * 检测非正常使用并显示警告
     */
    _printWarningIfNeeded() {
        // 如果在控制台直接调用，显示警告
        if (!window._seedCryptoWarningShown) {
            console.log(
                '欢迎使用关卡编辑器(level-editor.html)创建关卡！\n' +
                '如需技术交流，请访问项目主页。\n\n',
                'color: #51cf66; font-weight: bold;',
                'color: #adb5bd;',
                'color: #ffd43b; font-weight: bold;',
                'color: #adb5bd;'
            );
            window._seedCryptoWarningShown = true;
        }
    }

    /**
     * 动态派生密钥（增加逆向难度）
     */
    _deriveKey() {
        const base = 'FNCHESS_SHAIHAI_FEAT_KEYE3TUIDO';
        const derived = [];
        for (let i = 0; i < base.length; i++) {
            derived.push(base.charCodeAt(i) ^ (i * 7 + 13));
        }
        return derived;
    }

    /**
     * 计算字节数组签名（防篡改）
     */
    _computeSignature(bytes) {
        let hash = 0x811c9dc5; // FNV-1a 初始值
        for (let i = 0; i < bytes.length; i++) {
            hash ^= bytes[i];
            hash = Math.imul(hash, 0x01000193);
        }
        return hash >>> 0;
    }

    /**
     * 加密关卡数据为种子（二进制优化版）
     * @param {Object} levelData - 关卡数据
     * @param {Object} options - 选项 { allowZeroToken: boolean }
     */
    encrypt(levelData, options = {}) {
        if (!levelData.targetCells || levelData.targetCells.length === 0) {
            throw new Error('关卡必须包含至少一个目标格');
        }

        // 默认要求有效解决方案，除非显式允许零token（随机关卡生成模式）
        if (!options.allowZeroToken) {
            if (!levelData.solutionTokens || levelData.solutionTokens <= 0) {
                throw new Error('必须提供有效的解决方案');
            }
        } else {
            // 允许零token时，确保字段存在
            if (levelData.solutionTokens === undefined || levelData.solutionTokens === null) {
                levelData.solutionTokens = 0;
            }
        }

        const bs = new BitStream();

        // 1. mapSize索引(4bit)
        const mapSize = levelData.mapSize || 20;
        const sizeIdx = this.MAP_SIZES.indexOf(mapSize);
        if (sizeIdx < 0) throw new Error('不支持的地图尺寸');
        bs.writeBits(sizeIdx, 4);

        // 2. 构建地图数组（从左下到右上，横向优先）
        const totalCells = mapSize * mapSize;
        const map = new Array(totalCells).fill(0);
        const half = mapSize / 2;

        for (const c of levelData.targetCells) {
            const row = half - 1 - c.y;
            const col = c.x + half;
            const idx = row * mapSize + col;
            if (idx < 0 || idx >= totalCells || row < 0 || row >= mapSize || col < 0 || col >= mapSize) {
                throw new Error(`坐标越界: (${c.x}, ${c.y}), mapSize=${mapSize}`);
            }
            map[idx] = 1;
        }
        for (const c of (levelData.forbiddenCells || [])) {
            const row = half - 1 - c.y;
            const col = c.x + half;
            const idx = row * mapSize + col;
            if (idx < 0 || idx >= totalCells || row < 0 || row >= mapSize || col < 0 || col >= mapSize) {
                throw new Error(`坐标越界: (${c.x}, ${c.y}), mapSize=${mapSize}`);
            }
            map[idx] = 2;
        }

        // 3. 自适应混合压缩地图
        const compressedMap = AdaptiveRLE.encode(map);
        const mapBitLen = compressedMap.getBitLength();
        bs.writeBits(mapBitLen, 16); // 地图位长度

        // 写入地图数据（按位）
        const mapBs = compressedMap;
        for (let i = 0; i < mapBitLen; i++) {
            const byteIdx = Math.floor(i / 8);
            const bitIdx = 7 - (i % 8);
            const bit = (mapBs.bytes[byteIdx] >> bitIdx) & 1;
            bs.writeBits(bit, 1);
        }

        // 地图数据对齐到字节边界
        const mapEndPos = bs.getBitLength();
        const mapPadding = (8 - (mapEndPos % 8)) % 8;
        if (mapPadding > 0) {
            bs.writeBits(0, mapPadding);
        }

        // 4. 锁定元素掩码(32bit，支持最多32个元素)
        let lockMask = 0;
        for (const elem of (levelData.lockedElements || [])) {
            const idx = this.ELEMENTS.indexOf(elem);
            if (idx >= 0) lockMask |= (1 << idx);
        }
        bs.writeBits(lockMask, 32);

        // 5. token数(16bit，支持0-65535)
        bs.writeBits(levelData.solutionTokens, 16);

        // 6. 对齐到字节边界
        const bitPos = bs.getBitLength();
        const paddingBits = (8 - (bitPos % 8)) % 8;
        if (paddingBits > 0) {
            bs.writeBits(0, paddingBits);
        }

        // 7. 生成随机盐（4字节）
        const salt = new Uint8Array(4);
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(salt);
        } else {
            // 降级方案：使用Math.random（不够安全但能用）
            for (let i = 0; i < 4; i++) {
                salt[i] = Math.floor(Math.random() * 256);
            }
        }

        // 8. 计算签名（包含盐）
        const dataBytes = bs.toBytes();
        const saltedData = new Uint8Array([...salt, ...dataBytes]);
        const sig = this._computeSignature(saltedData);
        bs.writeBits(sig, 32);

        // 9. XOR加密
        const encrypted = this._xorEncrypt(bs.toBytes());

        // 10. 拼接盐和密文：[盐4字节][密文]
        const final = new Uint8Array([...salt, ...encrypted]);
        return this._bytesToBase64(final);
    }

    /**
     * 解密种子为关卡数据
     */
    decrypt(seed) {
        try {
            const allBytes = this._base64ToBytes(seed);

            // 1. 提取盐（前4字节）
            const salt = allBytes.slice(0, 4);

            // 2. 提取密文
            const encrypted = allBytes.slice(4);

            // 3. XOR解密
            const bytes = this._xorDecrypt(encrypted);
            const bs = new BitStream(bytes);

            // 读取mapSize
            const sizeIdx = bs.readBits(4);
            const mapSize = this.MAP_SIZES[sizeIdx];

            // 读取压缩地图
            const mapBitLen = bs.readBits(16);
            const mapBytes = [];

            // 按位读取地图数据
            for (let i = 0; i < mapBitLen; i++) {
                const bit = bs.readBits(1);
                const byteIdx = Math.floor(i / 8);
                const bitIdx = 7 - (i % 8);
                if (byteIdx >= mapBytes.length) mapBytes.push(0);
                mapBytes[byteIdx] |= (bit << bitIdx);
            }

            // 跳过地图对齐padding
            const mapEndPos = bs.bitPos;
            const mapPadding = (8 - (mapEndPos % 8)) % 8;
            if (mapPadding > 0) {
                bs.readBits(mapPadding);
            }

            const mapBs = new BitStream(new Uint8Array(mapBytes));
            const map = AdaptiveRLE.decode(mapBs, mapSize * mapSize);

            // 还原坐标
            const targetCells = [];
            const forbiddenCells = [];
            const half = mapSize / 2;
            for (let i = 0; i < map.length; i++) {
                if (map[i] !== 0) {
                    const row = Math.floor(i / mapSize);
                    const col = i % mapSize;
                    const x = col - half;
                    const y = half - 1 - row;
                    if (map[i] === 1) targetCells.push({x, y});
                    else forbiddenCells.push({x, y});
                }
            }

            // 读取锁定掩码(32bit)
            const lockMask = bs.readBits(32);
            const lockedElements = [];
            for (let i = 0; i < 32; i++) {
                if (lockMask & (1 << i)) {
                    if (i < this.ELEMENTS.length) {
                        lockedElements.push(this.ELEMENTS[i]);
                    }
                }
            }

            // 读取token数
            const solutionTokens = bs.readBits(16);

            // 对齐到字节边界（跳过padding）
            const bitPos = bs.bitPos;
            const paddingBits = (8 - (bitPos % 8)) % 8;
            if (paddingBits > 0) {
                bs.readBits(paddingBits);
            }

            // 验证签名（包含盐）
            const dataByteLen = Math.ceil(bs.bitPos / 8);
            const dataBytes = bytes.slice(0, dataByteLen);
            const saltedData = new Uint8Array([...salt, ...dataBytes]);
            const expectedSig = this._computeSignature(saltedData);
            const providedSig = bs.readBits(32) >>> 0; // 转为无符号

            if (providedSig !== expectedSig) {
                throw new Error('签名验证失败');
            }

            return {targetCells, forbiddenCells, lockedElements, solutionTokens, mapSize};
        } catch (e) {
            throw new Error('种子解密失败');
        }
    }

    /**
     * XOR加密
     */
    _xorEncrypt(bytes) {
        const result = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) {
            result[i] = bytes[i] ^ this.key[i % this.key.length];
        }
        return result;
    }

    /**
     * XOR解密（与加密相同）
     */
    _xorDecrypt(bytes) {
        return this._xorEncrypt(bytes);
    }

    /**
     * 字符串转字节数组
     */
    _stringToBytes(str) {
        const encoder = new TextEncoder();
        return encoder.encode(str);
    }

    /**
     * 字节数组转字符串
     */
    _bytesToString(bytes) {
        const decoder = new TextDecoder();
        return decoder.decode(bytes);
    }

    /**
     * 字节数组转Base64
     */
    _bytesToBase64(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Base64转字节数组
     */
    _base64ToBytes(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }
}
