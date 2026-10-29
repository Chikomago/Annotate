/**
 * 路由管理器
 * 管理单页应用的路由和页面切换
 */

class Router {
    constructor() {
        this.routes = new Map();
        this.currentPage = null;
        this.pageContainer = null;
        this.onNavigateCallbacks = [];
        
        // 绑定hashchange事件
        this._boundHashChangeHandler = this._handleHashChange.bind(this);
        window.addEventListener('hashchange', this._boundHashChangeHandler);
        
        // 初始化时处理当前hash
        window.addEventListener('load', () => {
            this._handleHashChange();
        });
    }
    
    /**
     * 设置页面容器
     * @param {HTMLElement} container - 页面内容容器
     */
    setContainer(container) {
        this.pageContainer = container;
    }
    
    /**
     * 注册路由
     * @param {string} path - 路由路径
     * @param {Function|Object} handler - 路由处理函数或配置对象
     */
    registerRoute(path, handler) {
        if (typeof handler === 'function') {
            this.routes.set(path, { render: handler });
        } else {
            this.routes.set(path, handler);
        }
    }
    
    /**
     * 批量注册路由
     * @param {Object} routes - 路由配置对象 { path: handler }
     */
    registerRoutes(routes) {
        Object.entries(routes).forEach(([path, handler]) => {
            this.registerRoute(path, handler);
        });
    }
    
    /**
     * 导航到指定页面
     * @param {string} pageName - 页面名称
     * @param {Object} params - 可选参数
     */
    navigate(pageName, params = {}) {
        // 构建hash URL
        let hash = `#${pageName}`;
        if (Object.keys(params).length > 0) {
            const queryString = Object.entries(params)
                .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
                .join('&');
            hash += `?${queryString}`;
        }
        
        // 更新URL hash
        window.location.hash = hash;
    }

    /**
     * 获取当前页面
     * @returns {string} 当前页面名称
     */
    getCurrentPage() {
        return this.currentPage;
    }
    
    /**
     * 获取当前路由参数
     * @returns {Object} 路由参数对象
     */
    getParams() {
        const hash = window.location.hash.slice(1);
        const [, queryString] = hash.split('?');
        
        if (!queryString) return {};
        
        const params = {};
        queryString.split('&').forEach(pair => {
            const [key, value] = pair.split('=');
            params[decodeURIComponent(key)] = decodeURIComponent(value || '');
        });
        
        return params;
    }
    
    /**
     * 添加导航回调
     * @param {Function} callback - 导航时调用的回调函数
     */
    onNavigate(callback) {
        if (typeof callback === 'function') {
            this.onNavigateCallbacks.push(callback);
        }
    }
    
    /**
     * 移除导航回调
     * @param {Function} callback - 要移除的回调函数
     */
    offNavigate(callback) {
        const index = this.onNavigateCallbacks.indexOf(callback);
        if (index > -1) {
            this.onNavigateCallbacks.splice(index, 1);
        }
    }
    
    /**
     * 处理hash变化
     * @private
     */
    _handleHashChange() {
        const hash = window.location.hash.slice(1);
        const [pageName] = hash.split('?');
        
        // 如果没有hash，导航到默认页面
        if (!pageName) {
            this.navigate('home');
            return;
        }
        
        this._loadPage(pageName);
    }
    
    /**
     * 加载页面内容
     * @param {string} pageName - 页面名称
     * @private
     */
    _loadPage(pageName) {
        const route = this.routes.get(pageName);
        
        if (!route) {
            // 如果路由不存在，尝试导航到home
            if (pageName !== 'home') {
                this.navigate('home');
            }
            return;
        }
        
        const previousPage = this.currentPage;
        this.currentPage = pageName;
        
        // 调用路由处理函数渲染页面
        if (this.pageContainer && route.render) {
            const content = route.render(this.getParams());
            
            if (typeof content === 'string') {
                this.pageContainer.innerHTML = content;
            } else if (content instanceof HTMLElement) {
                this.pageContainer.innerHTML = '';
                this.pageContainer.appendChild(content);
            }
            
            // 添加页面切换淡入动画
            this.pageContainer.classList.remove('page-fade-in');
            void this.pageContainer.offsetWidth; // 触发回流以重启动画
            this.pageContainer.classList.add('page-fade-in');
        }
        
        // 触发导航回调
        this.onNavigateCallbacks.forEach(callback => {
            try {
                callback(pageName, previousPage, this.getParams());
            } catch (error) {
            }
        });
    }
    
    /**
     * 手动触发当前路由重新加载
     */
    reload() {
        this._handleHashChange();
    }
    
    /**
     * 检查路由是否已注册
     * @param {string} path - 路由路径
     * @returns {boolean}
     */
    hasRoute(path) {
        return this.routes.has(path);
    }
    
    /**
     * 获取所有已注册的路由
     * @returns {string[]} 路由路径数组
     */
    getRoutes() {
        return Array.from(this.routes.keys());
    }
    
    /**
     * 销毁路由器实例
     */
    destroy() {
        window.removeEventListener('hashchange', this._boundHashChangeHandler);
        this.routes.clear();
        this.onNavigateCallbacks = [];
        this.currentPage = null;
        this.pageContainer = null;
    }
}

// 导出到全局作用域（浏览器环境）
if (typeof window !== 'undefined') {
    window.Router = Router;
}

// 导出到 Node.js 环境
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Router;
}
