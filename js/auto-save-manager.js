/**
 * 自动保存管理器 - AutoSaveManager
 * 实现定时自动保存功能
 * 需求: 11.1, 11.2
 */

class AutoSaveManager {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {number} options.interval - 自动保存间隔（毫秒），默认60000（1分钟）
     * @param {Function} options.onSave - 保存回调函数
     * @param {Function} options.onStatusChange - 状态变化回调函数
     */
    constructor(options = {}) {
        this.interval = options.interval || 60000; // 默认1分钟
        this.onSaveCallback = options.onSave || null;
        this.onStatusChangeCallback = options.onStatusChange || null;
        this.onAutoSaveSuccessCallback = null;
        
        this.timerId = null;
        this.isEnabled = false;
        this.isDirty = false; // 数据是否有变化
        this.lastSaveTime = null;
        this.projectId = null;
        
        // 从LocalStorage加载设置
        this.loadSettings();
    }
    
    /**
     * 从LocalStorage加载自动保存设置
     */
    loadSettings() {
        const settings = localStorage.getItem('settings');
        if (settings) {
            try {
                const parsed = JSON.parse(settings);
                this.isEnabled = parsed.autoSave === true;
                // 恢复上次保存时间
                if (parsed.lastSaveTime) {
                    this.lastSaveTime = new Date(parsed.lastSaveTime);
                }
            } catch (e) {
                this.isEnabled = false;
            }
        } else {
            // 检查旧的存储方式
            this.isEnabled = localStorage.getItem('autoSave') === 'true';
        }
    }
    
    /**
     * 保存自动保存设置到LocalStorage
     */
    saveSettings() {
        let settings = {};
        const existingSettings = localStorage.getItem('settings');
        if (existingSettings) {
            try {
                settings = JSON.parse(existingSettings);
            } catch (e) {
                settings = {};
            }
        }
        settings.autoSave = this.isEnabled;
        settings.autoSaveInterval = this.interval;
        // 保存上次保存时间
        if (this.lastSaveTime) {
            settings.lastSaveTime = this.lastSaveTime.toISOString();
        }
        localStorage.setItem('settings', JSON.stringify(settings));
        
        // 同时保存到旧的存储位置以保持兼容性
        localStorage.setItem('autoSave', this.isEnabled.toString());
    }
    
    /**
     * 启用自动保存
     */
    enable() {
        this.isEnabled = true;
        this.saveSettings();
        this.start();
        this.notifyStatusChange('enabled');
    }
    
    /**
     * 禁用自动保存
     */
    disable() {
        this.isEnabled = false;
        this.saveSettings();
        this.stop();
        this.notifyStatusChange('disabled');
    }
    
    /**
     * 切换自动保存状态
     * @returns {boolean} 新的启用状态
     */
    toggle() {
        if (this.isEnabled) {
            this.disable();
        } else {
            this.enable();
        }
        return this.isEnabled;
    }
    
    /**
     * 设置当前项目ID
     * @param {string} projectId - 项目ID
     */
    setProjectId(projectId) {
        this.projectId = projectId;
        // 切换项目时重置脏标记
        this.isDirty = false;
    }
    
    /**
     * 启动自动保存定时器
     */
    start() {
        if (!this.isEnabled) return;
        
        // 清除现有定时器
        this.stop();
        
        // 启动新定时器
        this.timerId = setInterval(() => {
            this.autoSave();
        }, this.interval);
        
    }
    
    /**
     * 停止自动保存定时器
     */
    stop() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
    }
    
    /**
     * 标记数据已变化
     * 需求: 11.1 - 监听数据变化
     */
    markDirty() {
        this.isDirty = true;
        this.notifyStatusChange('unsaved');
    }
    
    /**
     * 标记数据已保存
     */
    markClean() {
        this.isDirty = false;
        this.lastSaveTime = new Date();
        // 持久化保存时间
        this.saveSettings();
        this.notifyStatusChange('saved');
    }
    
    /**
     * 执行自动保存
     * 需求: 11.1 - 在1分钟内自动保存
     */
    async autoSave() {
        if (!this.isDirty) {
            return;
        }
        
        if (!this.projectId) {
            return;
        }
        
        this.notifyStatusChange('saving');
        
        // 调用保存回调
        if (this.onSaveCallback) {
            try {
                const result = await this.onSaveCallback(this.projectId);
                if (result !== false) {
                    this.markClean();
                    // 通知自动保存成功
                    if (this.onAutoSaveSuccessCallback) {
                        this.onAutoSaveSuccessCallback(this.projectId);
                    }
                } else {
                    this.notifyStatusChange('error');
                }
            } catch (e) {
                this.notifyStatusChange('error');
            }
        }
    }
    
    /**
     * 设置自动保存成功回调
     * @param {Function} callback - 回调函数
     */
    onAutoSaveSuccess(callback) {
        this.onAutoSaveSuccessCallback = callback;
    }
    
    /**
     * 手动保存
     * 需求: 11.2 - 点击保存按钮立即保存
     * @returns {boolean} 是否保存成功
     */
    async manualSave() {
        if (!this.projectId) {
            return false;
        }
        
        this.notifyStatusChange('saving');
        
        if (this.onSaveCallback) {
            try {
                const result = await this.onSaveCallback(this.projectId);
                if (result !== false) {
                    this.markClean();
                    return true;
                } else {
                    this.notifyStatusChange('error');
                    return false;
                }
            } catch (e) {
                this.notifyStatusChange('error');
                return false;
            }
        }
        
        return false;
    }
    
    /**
     * 设置保存回调
     * @param {Function} callback - 保存回调函数
     */
    onSave(callback) {
        this.onSaveCallback = callback;
    }
    
    /**
     * 设置状态变化回调
     * @param {Function} callback - 状态变化回调函数
     */
    onStatusChange(callback) {
        this.onStatusChangeCallback = callback;
    }
    
    /**
     * 通知状态变化
     * @param {string} status - 状态 ('enabled', 'disabled', 'saving', 'saved', 'unsaved', 'error')
     */
    notifyStatusChange(status) {
        if (this.onStatusChangeCallback) {
            this.onStatusChangeCallback(status, {
                isEnabled: this.isEnabled,
                isDirty: this.isDirty,
                lastSaveTime: this.lastSaveTime,
                projectId: this.projectId
            });
        }
    }
    
    /**
     * 获取保存状态文本
     * @returns {string} 状态文本
     */
    getStatusText() {
        if (!this.isEnabled) {
            return '自动保存已关闭';
        }
        
        if (this.isDirty) {
            return '未保存';
        }
        
        if (this.lastSaveTime) {
            const now = new Date();
            const diff = now - this.lastSaveTime;
            
            if (diff < 60000) {
                return '刚刚保存';
            } else if (diff < 3600000) {
                const minutes = Math.floor(diff / 60000);
                return `${minutes}分钟前保存`;
            } else {
                const hours = String(this.lastSaveTime.getHours()).padStart(2, '0');
                const minutes = String(this.lastSaveTime.getMinutes()).padStart(2, '0');
                return `已保存 ${hours}:${minutes}`;
            }
        }
        
        return '未保存';
    }
    
    /**
     * 检查是否启用
     * @returns {boolean} 是否启用
     */
    isAutoSaveEnabled() {
        return this.isEnabled;
    }
    
    /**
     * 检查是否有未保存的变化
     * @returns {boolean} 是否有未保存的变化
     */
    hasUnsavedChanges() {
        return this.isDirty;
    }
    
    /**
     * 获取上次保存时间
     * @returns {Date|null} 上次保存时间
     */
    getLastSaveTime() {
        return this.lastSaveTime;
    }
    
    /**
     * 设置自动保存间隔
     * @param {number} interval - 间隔（毫秒）
     */
    setInterval(interval) {
        this.interval = interval;
        this.saveSettings();
        
        // 如果正在运行，重启定时器
        if (this.timerId) {
            this.stop();
            this.start();
        }
    }
    
    /**
     * 销毁自动保存管理器
     */
    destroy() {
        this.stop();
        this.onSaveCallback = null;
        this.onStatusChangeCallback = null;
        this.projectId = null;
    }
}

// 创建全局实例
let autoSaveManager = null;

/**
 * 获取自动保存管理器实例（单例模式）
 * @param {Object} options - 配置选项
 * @returns {AutoSaveManager} 自动保存管理器实例
 */
function getAutoSaveManager(options = {}) {
    if (!autoSaveManager) {
        autoSaveManager = new AutoSaveManager(options);
    }
    return autoSaveManager;
}

// 导出到全局作用域（浏览器环境）
if (typeof window !== 'undefined') {
    window.AutoSaveManager = AutoSaveManager;
    window.getAutoSaveManager = getAutoSaveManager;
}

// 导出到 Node.js 环境
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AutoSaveManager, getAutoSaveManager };
}
