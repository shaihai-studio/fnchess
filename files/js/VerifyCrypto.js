/**
 * VerifyCrypto - 排行榜防作弊签名工具（方案A）
 *
 * 纯 JS SHA-256 / HMAC-SHA256（file:// 本地打开环境下没有 crypto.subtle，因此不依赖 WebCrypto）。
 * 必须与 server/index.js 中的实现【逐字一致】，任何改动需两端同步，否则验签失败。
 *
 * 自测锚点（两端一致性校验）：
 *   sha256("abc")                        = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
 *   hmac("key","The quick brown fox...")  = f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8
 *   sha256(utf8"中文")                    = 72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21
 */
class VerifyCrypto {
    static utf8Bytes(str) {
        const out = [];
        for (let i = 0; i < str.length; i++) {
            let c = str.charCodeAt(i);
            if (c < 0x80) out.push(c);
            else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
            else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
        }
        return out;
    }

    static bytesToLatin1(b) {
        let s = '';
        for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
        return s;
    }

    static bytesToHex(b) {
        let s = '';
        for (let i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
        return s;
    }

    static hexToBytes(hex) {
        const out = [];
        for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.substr(i, 2), 16));
        return out;
    }

    /** sha256Hex(ascii) —— ascii 必须为 latin1（每字符 1 字节） */
    static sha256Hex(ascii) {
        const rotr = (v, n) => (v >>> n) | (v << (32 - n));
        const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
            0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc,
            0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351,
            0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e,
            0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585,
            0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
            0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
        const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
        const ml = ascii.length * 8;
        let msg = ascii + '\x80';
        while (msg.length % 64 !== 56) msg += '\x00';
        const hi = Math.floor(ml / 4294967296) >>> 0;
        const lo = ml >>> 0;
        msg += String.fromCharCode((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
            (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
        const w = new Array(64).fill(0);
        const h = H0.slice();
        for (let ci = 0; ci < msg.length; ci += 64) {
            for (let i = 0; i < 16; i++) {
                const o = ci + i * 4;
                w[i] = (msg.charCodeAt(o) << 24) | (msg.charCodeAt(o + 1) << 16) | (msg.charCodeAt(o + 2) << 8) | msg.charCodeAt(o + 3);
            }
            for (let i = 16; i < 64; i++) {
                const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
                const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
            }
            let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
            for (let i = 0; i < 64; i++) {
                const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
                const ch = (e & f) ^ (~e & g);
                const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
                const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
                const maj = (a & b) ^ (a & c) ^ (b & c);
                const t2 = (S0 + maj) | 0;
                hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
            }
            h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
            h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
        }
        // 逐字提取 4 字节（h 可能为负数，须按无符号取字节；数字 toString(16) 会丢前导 0）
        const out = new Array(32);
        for (let i = 0; i < 8; i++) {
            const v = h[i] >>> 0;
            out[i * 4] = (v >>> 24) & 255;
            out[i * 4 + 1] = (v >>> 16) & 255;
            out[i * 4 + 2] = (v >>> 8) & 255;
            out[i * 4 + 3] = v & 255;
        }
        return VerifyCrypto.bytesToHex(out);
    }

    static hmacSHA256Hex(keyStr, msgStr) {
        let key = VerifyCrypto.utf8Bytes(keyStr);
        if (key.length > 64) key = VerifyCrypto.hexToBytes(VerifyCrypto.sha256Hex(VerifyCrypto.bytesToLatin1(key)));
        const k = new Array(64).fill(0);
        for (let i = 0; i < key.length && i < 64; i++) k[i] = key[i];
        const ipad = k.map(x => x ^ 0x36);
        const opad = k.map(x => x ^ 0x5c);
        const inner = VerifyCrypto.sha256Hex(VerifyCrypto.bytesToLatin1([...ipad, ...VerifyCrypto.utf8Bytes(msgStr)]));
        return VerifyCrypto.sha256Hex(VerifyCrypto.bytesToLatin1([...opad, ...VerifyCrypto.hexToBytes(inner)]));
    }

    /** 长度口径（§5）：原始 token、不化简；与 FunctionParser.analyzeFunctionType 完全一致 */
    static tokenCount(expr) {
        const s = String(expr).replace(/\s+/g, '').replace(/[()（）]/g, '');
        const re = /(sin|cos|tan|asin|acos|atan|abs|ln|sqrt|factorial)|(\d+(?:\.\d+)?)|(PI|π|e|i)|([+\-*/^!])|(x)/gi;
        let n = 0, m;
        while ((m = re.exec(s)) !== null) n++;
        if (n === 0 && s.length > 0) n = s.length;
        return n;
    }

    /** 计算上报签名（与 server verifySig 的拼串规则一致） */
    static sign(nonce, playerId, boardType, value, payload) {
        const levelsHash = VerifyCrypto.sha256Hex(VerifyCrypto.bytesToLatin1(VerifyCrypto.utf8Bytes(JSON.stringify(payload))));
        return VerifyCrypto.hmacSHA256Hex(
            'fnchess-lb-secret-2026-08-05',
            [String(nonce || ''), String(playerId || ''), String(boardType || ''), String(value === undefined ? '' : value), levelsHash].join('|')
        );
    }
}

if (typeof window !== 'undefined') window.VerifyCrypto = VerifyCrypto;
if (typeof module !== 'undefined' && module.exports) module.exports = VerifyCrypto;
