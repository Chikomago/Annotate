/**
 * 调试日志系统
 * 可通过 localStorage.setItem('debugMode', 'true') 启用
 */

class DebugLogger {
    constructor() {
        this.enabled = localStorage.getItem('debugMode') === 'true';
        this.logs = [];
        this.maxLogs = 1000; // 最多保存1000条日志
        this.stepCounter = 0; // 步骤计数器
        this.categories = {
            IMAGE: '图像加载',
            TEXTBOX: '文本框',
            CANVAS: '画布',
            SYNC: '同步',
            SAVE: '保存',
            HISTORY: '历史记录',
            PERFORMANCE: '性能',
            ERROR: '错误',
            STEP: '步骤追踪'
        };
        
        if (this.enabled) {
        }
        
        // 暴露到全局
        window.debugLogger = this;
    }
    
    /**
     * 记录日志
     * @param {string} category - 日志分类
     * @param {string} message - 日志消息
     * @param {*} data - 附加数据
     */
    log(category, message, data = null) {
        if (!this.enabled) return;
        
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            category,
            message,
            data: data ? JSON.parse(JSON.stringify(data)) : null,
            stack: new Error().stack // 添加调用栈信息
        };
        
        this.logs.push(logEntry);
        
        // 限制日志数量
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
        
        // 输出到控制台
        const categoryName = this.categories[category] || category;
        const color = this._getCategoryColor(category);
            `%c[${categoryName}]%c ${message}`,
            `color: ${color}; font-weight: bold;`,
            'color: inherit;',
            data || ''
        ;
    }
    
    /**
     * 记录步骤（用于追踪执行流程）
     * @param {string} stepName - 步骤名称
     * @param {*} data - 步骤数据
     */
    step(stepName, data = null) {
        if (!this.enabled) return;
        
        this.stepCounter++;
        const stepInfo = {
            stepNumber: this.stepCounter,
            stepName,
            data
        };
        
        this.log('STEP', `步骤 ${this.stepCounter}: ${stepName}`, stepInfo);
        return this.stepCounter;
    }
    
    /**
     * 记录检查点（用于验证状态）
     * @param {string} checkpointName - 检查点名称
     * @param {Object} state - 当前状态
     */
    checkpoint(checkpointName, state) {
        if (!this.enabled) return;
        
        this.log('STEP', `✓ 检查点: ${checkpointName}`, {
            checkpoint: checkpointName,
            state,
            timestamp: Date.now()
        });
    }
    
    /**
     * 记录条件分支（用于追踪代码执行路径）
     * @param {string} condition - 条件描述
     * @param {boolean} result - 条件结果
     * @param {*} data - 相关数据
     */
    branch(condition, result, data = null) {
        if (!this.enabled) return;
        
        const symbol = result ? '✓' : '✗';
        this.log('STEP', `${symbol} 条件: ${condition} = ${result}`, {
            condition,
            result,
            data
        });
    }
    
    /**
     * 记录函数调用（用于追踪函数执行）
     * @param {string} functionName - 函数名
     * @param {*} args - 函数参数
     */
    call(functionName, args = null) {
        if (!this.enabled) return;
        
        this.log('STEP', `→ 调用: ${functionName}`, {
            function: functionName,
            arguments: args
        });
    }
    
    /**
     * 记录函数返回（用于追踪函数执行结果）
     * @param {string} functionName - 函数名
     * @param {*} result - 返回值
     */
    return(functionName, result = null) {
        if (!this.enabled) return;
        
        this.log('STEP', `← 返回: ${functionName}`, {
            function: functionName,
            result
        });
    }
    
    /**
     * 记录图像加载相关日志
     */
    logImage(message, data) {
        this.log('IMAGE', message, data);
    }
    
    /**
     * 记录文本框相关日志
     */
    logTextBox(message, data) {
        this.log('TEXTBOX', message, data);
    }
    
    /**
     * 记录画布相关日志
     */
    logCanvas(message, data) {
        this.log('CANVAS', message, data);
    }
    
    /**
     * 记录同步相关日志
     */
    logSync(message, data) {
        this.log('SYNC', message, data);
    }
    
    /**
     * 记录保存相关日志
     */
    logSave(message, data) {
        this.log('SAVE', message, data);
    }
    
    /**
     * 记录历史记录相关日志
     */
    logHistory(message, data) {
        this.log('HISTORY', message, data);
    }
    
    /**
     * 记录性能相关日志
     */
    logPerformance(message, data) {
        this.log('PERFORMANCE', message, data);
    }
    
    /**
     * 记录错误
     */
    logError(message, error) {
        this.log('ERROR', message, {
            message: error?.message,
            stack: error?.stack,
            error: error
        });
    }
    
    /**
     * 记录用户操作
     * @param {string} action - 操作名称
     * @param {*} data - 操作数据
     */
    logAction(action, data = null) {
        if (!this.enabled) return;
        
        this.log('STEP', `🎯 操作: ${action}`, {
            action,
            data,
            timestamp: Date.now()
        });
    }
    
    /**
     * 获取分类颜色
     */
    _getCategoryColor(category) {
        const colors = {
            IMAGE: '#3b82f6',
            TEXTBOX: '#8b5cf6',
            CANVAS: '#f59e0b',
            SYNC: '#10b981',
            SAVE: '#06b6d4',
            HISTORY: '#ec4899',
            PERFORMANCE: '#6366f1',
            ERROR: '#ef4444',
            STEP: '#14b8a6'
        };
        return colors[category] || '#6b7280';
    }
    
    /**
     * 导出日志
     */
    export() {
        const data = {
            exportTime: new Date().toISOString(),
            debugMode: this.enabled,
            totalLogs: this.logs.length,
            totalSteps: this.stepCounter,
            logs: this.logs,
            userAgent: navigator.userAgent,
            localStorage: this._getLocalStorageInfo(),
            summary: this._generateSummary()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `debug-log-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
    }
    
    /**
     * 生成日志摘要
     */
    _generateSummary() {
        const summary = {
            totalLogs: this.logs.length,
            totalSteps: this.stepCounter,
            byCategory: {},
            errors: [],
            lastSteps: []
        };
        
        this.logs.forEach(log => {
            // 按分类统计
            if (!summary.byCategory[log.category]) {
                summary.byCategory[log.category] = 0;
            }
            summary.byCategory[log.category]++;
            
            // 收集错误
            if (log.category === 'ERROR') {
                summary.errors.push({
                    timestamp: log.timestamp,
                    message: log.message,
                    data: log.data
                });
            }
            
            // 收集最近的步骤
            if (log.category === 'STEP') {
                summary.lastSteps.push({
                    timestamp: log.timestamp,
                    message: log.message
                });
            }
        });
        
        // 只保留最近10个步骤
        summary.lastSteps = summary.lastSteps.slice(-10);
        
        return summary;
    }
    
    /**
     * 获取 LocalStorage 信息（不包含敏感数据）
     */
    _getLocalStorageInfo() {
        const info = {};
        try {
            info.keys = Object.keys(localStorage);
            info.size = JSON.stringify(localStorage).length;
            info.projects = localStorage.getItem('projects') ? 
                JSON.parse(localStorage.getItem('projects')) : null;
        } catch (e) {
            info.error = e.message;
        }
        return info;
    }
    
    /**
     * 清空日志
     */
    clear() {
        this.logs = [];
        this.stepCounter = 0;
    }
    
    /**
     * 获取日志统计
     */
    getStats() {
        const stats = {
            total: this.logs.length,
            totalSteps: this.stepCounter,
            byCategory: {}
        };
        
        this.logs.forEach(log => {
            if (!stats.byCategory[log.category]) {
                stats.byCategory[log.category] = 0;
            }
            stats.byCategory[log.category]++;
        });
        
        console.table(stats.byCategory);
        return stats;
    }
    
    /**
     * 搜索日志
     */
    search(keyword) {
        const results = this.logs.filter(log => 
            log.message.toLowerCase().includes(keyword.toLowerCase()) ||
            JSON.stringify(log.data).toLowerCase().includes(keyword.toLowerCase())
        );
        
        results.forEach(log => {
        });
        
        return results;
    }
    
    /**
     * 按分类过滤日志
     */
    filterByCategory(category) {
        const results = this.logs.filter(log => log.category === category);
        results.forEach(log => {
        });
        return results;
    }
    
    /**
     * 获取最近的日志
     */
    getRecent(count = 10) {
        const recent = this.logs.slice(-count);
        recent.forEach(log => {
        });
        return recent;
    }
    
    /**
     * 获取执行流程（仅步骤日志）
     */
    getFlow() {
        const steps = this.logs.filter(log => log.category === 'STEP');
        steps.forEach((log, index) => {
        });
        return steps;
    }
}

// 创建全局实例
const debugLogger = new DebugLogger();

// 导出到全局作用域（浏览器环境）
if (typeof window !== 'undefined') {
    window.DebugLogger = DebugLogger;
    window.debugLogger = debugLogger;
}

// 导出到 Node.js 环境
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DebugLogger, debugLogger };
}
