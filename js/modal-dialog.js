/**
 * 自定义模态对话框
 * 替代浏览器原生的 alert() 和 confirm()
 */

class ModalDialog {
    constructor() {
        this.modalContainer = null;
        this.init();
    }
    
    init() {
        // 创建模态容器
        this.modalContainer = document.createElement('div');
        this.modalContainer.id = 'modal-dialog-container';
        this.modalContainer.className = 'fixed inset-0 z-[9999] hidden';
        document.body.appendChild(this.modalContainer);
    }
    
    /**
     * 显示提示框（替代 alert）
     * @param {string} message - 提示消息
     * @param {string} title - 标题（可选）
     * @returns {Promise<void>}
     */
    alert(message, title = '提示') {
        return new Promise((resolve) => {
            this.show({
                title,
                message,
                type: 'alert',
                confirmText: '确定',
                onConfirm: () => resolve()
            });
        });
    }
    
    /**
     * 显示确认框（替代 confirm）
     * @param {string} message - 确认消息
     * @param {string} title - 标题（可选）
     * @returns {Promise<boolean>}
     */
    confirm(message, title = '确认') {
        return new Promise((resolve) => {
            this.show({
                title,
                message,
                type: 'confirm',
                confirmText: '确定',
                cancelText: '取消',
                onConfirm: () => resolve(true),
                onCancel: () => resolve(false)
            });
        });
    }
    
    /**
     * 显示模态框
     * @param {Object} options - 配置选项
     */
    show(options) {
        const {
            title = '提示',
            message = '',
            type = 'alert',
            confirmText = '确定',
            cancelText = '取消',
            onConfirm = () => {},
            onCancel = () => {}
        } = options;
        
        // 处理消息中的换行符
        const formattedMessage = message.replace(/\n/g, '<br>');
        
        const modalHtml = `
            <div class="modal-overlay fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
                <div class="modal-content bg-[#1c2127] rounded-xl shadow-2xl border border-gray-700 max-w-md w-full transform animate-scaleIn">
                    <div class="px-6 py-4 border-b border-gray-700">
                        <h3 class="text-lg font-semibold text-white">${title}</h3>
                    </div>
                    <div class="px-6 py-5">
                        <p class="text-gray-300 text-sm leading-relaxed">${formattedMessage}</p>
                    </div>
                    <div class="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                        ${type === 'confirm' ? `
                            <button class="modal-cancel-btn px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-700 transition-colors">
                                ${cancelText}
                            </button>
                        ` : ''}
                        <button class="modal-confirm-btn px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">
                            ${confirmText}
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        this.modalContainer.innerHTML = modalHtml;
        this.modalContainer.classList.remove('hidden');
        
        // 绑定事件
        const confirmBtn = this.modalContainer.querySelector('.modal-confirm-btn');
        const cancelBtn = this.modalContainer.querySelector('.modal-cancel-btn');
        const overlay = this.modalContainer.querySelector('.modal-overlay');
        
        const close = () => {
            this.modalContainer.classList.add('hidden');
            this.modalContainer.innerHTML = '';
        };
        
        confirmBtn?.addEventListener('click', () => {
            close();
            onConfirm();
        });
        
        cancelBtn?.addEventListener('click', () => {
            close();
            onCancel();
        });
        
        // 点击遮罩关闭（仅对 alert 类型）
        overlay?.addEventListener('click', (e) => {
            if (e.target === overlay && type === 'alert') {
                close();
                onConfirm();
            }
        });
        
        // ESC 键关闭
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                close();
                if (type === 'confirm') {
                    onCancel();
                } else {
                    onConfirm();
                }
                document.removeEventListener('keydown', handleKeyDown);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        
        // 聚焦确认按钮
        confirmBtn?.focus();
    }
}

// 创建全局实例
const modalDialog = new ModalDialog();

// 导出到全局作用域（浏览器环境）
if (typeof window !== 'undefined') {
    window.ModalDialog = ModalDialog;
    window.modalDialog = modalDialog;
}

// 导出到 Node.js 环境
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ModalDialog, modalDialog };
}
