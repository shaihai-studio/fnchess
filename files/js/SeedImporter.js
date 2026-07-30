/**
 * SeedImporter - 种子导入器
 * 职责：导入种子对话框、种子验证、解密
 */
class SeedImporter {
    constructor(crypto, onImportSuccess, onCancel) {
        this.crypto = crypto;
        this.onImportSuccess = onImportSuccess;
        this.onCancel = onCancel;
    }

    showDialog() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>导入种子</h2>
                <textarea id="random-seed-input" style="width: 100%; height: 100px; margin: 10px 0;"></textarea>
                <div id="random-seed-info" style="margin: 10px 0; color: #666;"></div>
                <div style="display: flex; gap: 10px;">
                    <button id="random-import-confirm-btn" class="btn btn-primary">导入</button>
                    <button id="random-import-cancel-btn" class="btn btn-secondary">取消</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const input = modal.querySelector('#random-seed-input');
        const info = modal.querySelector('#random-seed-info');

        input.addEventListener('input', () => {
            try {
                const seed = input.value.trim();
                if (!seed) {
                    info.textContent = '';
                    info.style.color = '#666';
                    return;
                }
                const data = this.crypto.decrypt(seed);
                const validation = SeedImporter.validateLockedElements(data.lockedElements);
                let status = `目标格: ${data.targetCells.length}, 禁止格: ${data.forbiddenCells.length}, Token: ${data.solutionTokens || 0}`;
                if (!validation.valid) {
                    status += `\n⚠️ ${validation.reason}`;
                    info.style.color = '#ef4444';
                } else {
                    info.style.color = '#666';
                }
                info.textContent = status;
            } catch (e) {
                info.textContent = '无效种子';
                info.style.color = '#666';
            }
        });

        modal.querySelector('#random-import-confirm-btn').addEventListener('click', () => {
            try {
                const seed = input.value.trim();
                const data = this.crypto.decrypt(seed);
                const validation = SeedImporter.validateLockedElements(data.lockedElements);
                if (!validation.valid) {
                    alert('种子不合法: ' + validation.reason);
                    return;
                }
                document.body.removeChild(modal);
                if (this.onImportSuccess) this.onImportSuccess(data);
            } catch (e) {
                alert('导入失败: ' + e.message);
            }
        });

        modal.querySelector('#random-import-cancel-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
            if (this.onCancel) this.onCancel();
        });
    }

    static validateLockedElements(lockedElements) {
        if (!lockedElements || !Array.isArray(lockedElements)) {
            return { valid: false, reason: '数据格式错误' };
        }

        if (lockedElements.includes('(') || lockedElements.includes(')')) {
            return { valid: false, reason: '括号不能被禁用' };
        }

        const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        const xLocked = lockedElements.includes('x');
        const allDigitsLocked = digits.every(d => lockedElements.includes(d));

        if (xLocked && allDigitsLocked) {
            return { valid: false, reason: 'x 和常数(0-9) 不能同时全部禁用' };
        }

        return { valid: true };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SeedImporter;
}
