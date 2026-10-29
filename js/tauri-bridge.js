/**
 * Tauri API 桥接层
 * 
 * 架构说明：
 * - Tauri 壳启动 Flask 后端作为子进程
 * - 前端（WebView）仍然通过 HTTP 访问 Flask API
 * - 仅在需要原生能力（如文件保存对话框）时使用 Tauri invoke
 * - 这样前端代码几乎零修改即可在 Tauri 和浏览器环境下运行
 */

class TauriBridge {
    constructor() {
        this._isTauri = this._detectTauri();
        this._serverReady = false;
        this._readyCallbacks = [];
        
        if (this._isTauri) {
            this._listenForServerReady();
        }
    }

    _detectTauri() {
        return typeof window !== 'undefined' && 
               window.__TAURI_INTERNALS__ !== undefined;
    }

    get isTauri() {
        return this._isTauri;
    }

    async _listenForServerReady() {
        try {
            const { listen } = window.__TAURI_INTERNALS__.event;
            await listen('server-ready', (event) => {
                console.log('[TauriBridge] 后端服务已就绪:', event.payload);
                this._serverReady = true;
                this._readyCallbacks.forEach(cb => cb(event.payload));
                this._readyCallbacks = [];
            });
            await listen('server-error', (event) => {
                console.error('[TauriBridge] 后端服务启动失败:', event.payload);
            });
        } catch (e) {
            console.warn('[TauriBridge] 事件监听失败:', e);
        }
    }

    /**
     * 等待后端服务就绪
     */
    async waitForReady(timeout = 30000) {
        if (!this._isTauri || this._serverReady) return true;
        
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('后端服务启动超时'));
            }, timeout);
            
            this._readyCallbacks.push((payload) => {
                clearTimeout(timer);
                resolve(payload);
            });
        });
    }

    /**
     * 使用 Tauri invoke 调用 Rust 命令
     */
    async invoke(command, args = {}) {
        if (!this._isTauri) {
            throw new Error('当前不在 Tauri 环境中');
        }
        try {
            const { invoke } = window.__TAURI_INTERNALS__.core;
            return await invoke(command, args);
        } catch (e) {
            console.error(`[TauriBridge] invoke('${command}') 失败:`, e);
            throw e;
        }
    }

    // ============ 原生功能封装 ============

    /**
     * 保存文件对话框 - 使用 Tauri 原生对话框
     * @param {string} defaultPath - 默认文件名
     * @param {Array} filters - 文件过滤器
     * @returns {string|null} 选择的文件路径
     */
    async saveDialog(defaultPath, filters = []) {
        if (!this._isTauri) return null;
        
        try {
            const { save } = window.__TAURI_INTERNALS__.dialog;
            return await save({
                defaultPath,
                filters
            });
        } catch (e) {
            console.error('[TauriBridge] 保存对话框失败:', e);
            return null;
        }
    }

    /**
     * 写入二进制文件 - 使用 Tauri 文件系统
     * @param {string} path - 文件路径
     * @param {Uint8Array} data - 二进制数据
     */
    async writeBinaryFile(path, data) {
        if (!this._isTauri) return false;
        
        try {
            const { writeBinaryFile } = window.__TAURI_INTERNALS__.fs;
            await writeBinaryFile(path, data);
            return true;
        } catch (e) {
            console.error('[TauriBridge] 写入文件失败:', e);
            return false;
        }
    }

    /**
     * 导出 Word 文档 - Tauri 使用原生对话框保存，浏览器使用下载
     */
    async exportDocx(exportData) {
        if (this._isTauri) {
            // Tauri 模式：先通过 HTTP 获取文件，再用原生对话框保存
            const resp = await fetch('/api/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(exportData)
            });
            
            if (resp.ok) {
                const blob = await resp.blob();
                const arrayBuffer = await blob.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);
                const filename = (exportData.projectName || '标注文档') + '.docx';
                
                const filePath = await this.saveDialog(filename, [{
                    name: 'Word 文档',
                    extensions: ['docx']
                }]);
                
                if (filePath) {
                    const success = await this.writeBinaryFile(filePath, bytes);
                    return { success, filePath: success ? filePath : null };
                }
                return { success: false, message: '已取消保存' };
            } else {
                const error = await resp.json();
                return { success: false, message: error.message || '导出失败' };
            }
        }
        
        // 浏览器模式：直接下载
        const resp = await fetch('/api/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(exportData)
        });
        
        if (resp.ok) {
            const blob = await resp.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = (exportData.projectName || '标注文档') + '.docx';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            return { success: true };
        } else {
            const error = await resp.json();
            return { success: false, message: error.message || '导出失败' };
        }
    }

    // ============ 工具函数 ============

    _arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    _base64ToUint8Array(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }
}

// 创建全局实例
const tauriBridge = new TauriBridge();
