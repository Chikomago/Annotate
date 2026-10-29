/**
 * 性能优化器 - PerformanceOptimizer
 * 提供图像加载优化、绘制元素渲染优化和虚拟滚动功能
 * 任务: 19.2 性能优化
 */

class PerformanceOptimizer {
    /**
     * 图像加载配置
     */
    static IMAGE_CONFIG = {
        // 大图像阈值（超过此尺寸进行优化）
        LARGE_IMAGE_THRESHOLD: 2000,
        // 预览图最大尺寸
        PREVIEW_MAX_SIZE: 800,
        // 图像质量（0-1）
        QUALITY: 0.85,
        // 渐进式加载步骤
        PROGRESSIVE_STEPS: [0.25, 0.5, 0.75, 1.0]
    };

    /**
     * 渲染优化配置
     */
    static RENDER_CONFIG = {
        // 批量渲染阈值
        BATCH_SIZE: 20,
        // 渲染延迟（毫秒）
        RENDER_DELAY: 16, // ~60fps
        // 防抖延迟
        DEBOUNCE_DELAY: 100,
        // 节流间隔
        THROTTLE_INTERVAL: 50
    };

    /**
     * 虚拟滚动配置
     */
    static VIRTUAL_SCROLL_CONFIG = {
        // 启用虚拟滚动的项目数阈值
        THRESHOLD: 50,
        // 每项高度（像素）
        ITEM_HEIGHT: 44,
        // 缓冲区大小（可见区域外额外渲染的项数）
        BUFFER_SIZE: 5,
        // 滚动防抖延迟
        SCROLL_DEBOUNCE: 16
    };

    constructor() {
        this.imageCache = new Map();
        this.renderQueue = [];
        this.isRendering = false;
        this.rafId = null;
    }

    // ==================== 图像加载优化 ====================

    /**
     * 优化加载大图像
     * @param {string} imageData - 图像数据（Base64或URL）
     * @param {HTMLImageElement} imgElement - 图像元素
     * @param {Object} options - 配置选项
     * @returns {Promise<void>}
     */
    async loadImageOptimized(imageData, imgElement, options = {}) {
        const {
            onProgress = null,
            useProgressive = true,
            maxSize = null
        } = options;

        // 检查缓存
        const cacheKey = this.generateCacheKey(imageData);
        if (this.imageCache.has(cacheKey)) {
            imgElement.src = this.imageCache.get(cacheKey);
            return;
        }

        try {
            // 创建临时图像获取尺寸
            const tempImg = await this.loadImageAsync(imageData);
            const { width, height } = tempImg;

            // 判断是否为大图像
            const isLargeImage = Math.max(width, height) > PerformanceOptimizer.IMAGE_CONFIG.LARGE_IMAGE_THRESHOLD;

            if (isLargeImage && useProgressive) {
                // 渐进式加载大图像
                await this.loadImageProgressively(imageData, imgElement, tempImg, onProgress);
            } else {
                // 直接加载
                imgElement.src = imageData;
            }

            // 缓存处理后的图像
            this.imageCache.set(cacheKey, imgElement.src);

        } catch (error) {
            // 回退到直接加载
            imgElement.src = imageData;
        }
    }

    /**
     * 渐进式加载图像
     * @param {string} imageData - 原始图像数据
     * @param {HTMLImageElement} imgElement - 目标图像元素
     * @param {HTMLImageElement} tempImg - 临时图像（已加载）
     * @param {Function} onProgress - 进度回调
     */
    async loadImageProgressively(imageData, imgElement, tempImg, onProgress) {
        const { width, height } = tempImg;
        const steps = PerformanceOptimizer.IMAGE_CONFIG.PROGRESSIVE_STEPS;

        for (let i = 0; i < steps.length; i++) {
            const scale = steps[i];
            const scaledWidth = Math.round(width * scale);
            const scaledHeight = Math.round(height * scale);

            // 创建缩放后的图像
            const scaledData = await this.resizeImage(tempImg, scaledWidth, scaledHeight);
            imgElement.src = scaledData;

            // 报告进度
            if (onProgress) {
                onProgress((i + 1) / steps.length * 100);
            }

            // 最后一步不需要延迟
            if (i < steps.length - 1) {
                await this.delay(50);
            }
        }
    }

    /**
     * 调整图像大小
     * @param {HTMLImageElement} img - 源图像
     * @param {number} targetWidth - 目标宽度
     * @param {number} targetHeight - 目标高度
     * @returns {Promise<string>} Base64图像数据
     */
    resizeImage(img, targetWidth, targetHeight) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;

            const ctx = canvas.getContext('2d');
            
            // 使用高质量缩放
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

            resolve(canvas.toDataURL('image/jpeg', PerformanceOptimizer.IMAGE_CONFIG.QUALITY));
        });
    }

    /**
     * 创建图像预览（用于快速显示）
     * @param {string} imageData - 图像数据
     * @returns {Promise<string>} 预览图像数据
     */
    async createImagePreview(imageData) {
        const img = await this.loadImageAsync(imageData);
        const { width, height } = img;
        const maxSize = PerformanceOptimizer.IMAGE_CONFIG.PREVIEW_MAX_SIZE;

        if (Math.max(width, height) <= maxSize) {
            return imageData;
        }

        const scale = maxSize / Math.max(width, height);
        const targetWidth = Math.round(width * scale);
        const targetHeight = Math.round(height * scale);

        return this.resizeImage(img, targetWidth, targetHeight);
    }

    /**
     * 异步加载图像
     * @param {string} src - 图像源
     * @returns {Promise<HTMLImageElement>}
     */
    loadImageAsync(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    /**
     * 生成缓存键
     * @param {string} data - 数据
     * @returns {string} 缓存键
     */
    generateCacheKey(data) {
        // 使用数据的前100个字符和长度作为键
        return `${data.substring(0, 100)}_${data.length}`;
    }

    /**
     * 清除图像缓存
     */
    clearImageCache() {
        this.imageCache.clear();
    }

    // ==================== 绘制元素渲染优化 ====================

    /**
     * 批量渲染元素（使用requestAnimationFrame）
     * @param {Array} elements - 要渲染的元素数组
     * @param {Function} renderFn - 渲染函数
     * @param {Function} onComplete - 完成回调
     */
    batchRender(elements, renderFn, onComplete = null) {
        if (!elements || elements.length === 0) {
            if (onComplete) onComplete();
            return;
        }

        const batchSize = PerformanceOptimizer.RENDER_CONFIG.BATCH_SIZE;
        let index = 0;

        const renderBatch = () => {
            const endIndex = Math.min(index + batchSize, elements.length);
            
            // 渲染当前批次
            for (let i = index; i < endIndex; i++) {
                renderFn(elements[i], i);
            }

            index = endIndex;

            if (index < elements.length) {
                // 继续下一批
                this.rafId = requestAnimationFrame(renderBatch);
            } else {
                // 完成
                if (onComplete) onComplete();
            }
        };

        // 开始渲染
        this.rafId = requestAnimationFrame(renderBatch);
    }

    /**
     * 取消批量渲染
     */
    cancelBatchRender() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    /**
     * 创建防抖函数
     * @param {Function} fn - 原函数
     * @param {number} delay - 延迟时间
     * @returns {Function} 防抖函数
     */
    debounce(fn, delay = PerformanceOptimizer.RENDER_CONFIG.DEBOUNCE_DELAY) {
        let timeoutId = null;
        
        return function(...args) {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            
            timeoutId = setTimeout(() => {
                fn.apply(this, args);
                timeoutId = null;
            }, delay);
        };
    }

    /**
     * 创建节流函数
     * @param {Function} fn - 原函数
     * @param {number} interval - 间隔时间
     * @returns {Function} 节流函数
     */
    throttle(fn, interval = PerformanceOptimizer.RENDER_CONFIG.THROTTLE_INTERVAL) {
        let lastTime = 0;
        let timeoutId = null;

        return function(...args) {
            const now = Date.now();
            const remaining = interval - (now - lastTime);

            if (remaining <= 0) {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                lastTime = now;
                fn.apply(this, args);
            } else if (!timeoutId) {
                timeoutId = setTimeout(() => {
                    lastTime = Date.now();
                    timeoutId = null;
                    fn.apply(this, args);
                }, remaining);
            }
        };
    }

    /**
     * 使用DocumentFragment批量添加DOM元素
     * @param {HTMLElement} container - 容器元素
     * @param {Array} elements - 要添加的元素数组
     * @param {Function} createElementFn - 创建元素的函数
     */
    batchAppendDOM(container, elements, createElementFn) {
        const fragment = document.createDocumentFragment();
        
        elements.forEach((element, index) => {
            const domElement = createElementFn(element, index);
            if (domElement) {
                fragment.appendChild(domElement);
            }
        });

        container.appendChild(fragment);
    }

    // ==================== 虚拟滚动 ====================

    /**
     * 创建虚拟滚动列表
     * @param {HTMLElement} container - 滚动容器
     * @param {Array} items - 数据项数组
     * @param {Function} renderItem - 渲染单项的函数
     * @param {Object} options - 配置选项
     * @returns {VirtualScroller} 虚拟滚动实例
     */
    createVirtualScroller(container, items, renderItem, options = {}) {
        return new VirtualScroller(container, items, renderItem, options);
    }

    // ==================== 工具方法 ====================

    /**
     * 延迟函数
     * @param {number} ms - 毫秒数
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 检测是否支持IntersectionObserver
     * @returns {boolean}
     */
    supportsIntersectionObserver() {
        return 'IntersectionObserver' in window;
    }

    /**
     * 检测是否支持requestIdleCallback
     * @returns {boolean}
     */
    supportsIdleCallback() {
        return 'requestIdleCallback' in window;
    }

    /**
     * 在空闲时执行任务
     * @param {Function} task - 任务函数
     * @param {Object} options - 配置选项
     */
    runWhenIdle(task, options = { timeout: 1000 }) {
        if (this.supportsIdleCallback()) {
            requestIdleCallback(task, options);
        } else {
            setTimeout(task, 0);
        }
    }
}

/**
 * 虚拟滚动类
 * 用于高效渲染大量列表项
 */
class VirtualScroller {
    constructor(container, items, renderItem, options = {}) {
        this.container = container;
        this.items = items || [];
        this.renderItem = renderItem;
        
        // 配置
        this.itemHeight = options.itemHeight || PerformanceOptimizer.VIRTUAL_SCROLL_CONFIG.ITEM_HEIGHT;
        this.bufferSize = options.bufferSize || PerformanceOptimizer.VIRTUAL_SCROLL_CONFIG.BUFFER_SIZE;
        
        // 状态
        this.scrollTop = 0;
        this.visibleStart = 0;
        this.visibleEnd = 0;
        
        // DOM元素
        this.viewport = null;
        this.content = null;
        this.spacerTop = null;
        this.spacerBottom = null;
        this.itemsContainer = null;
        
        // 绑定方法
        this.handleScroll = this.handleScroll.bind(this);
        
        this.init();
    }

    /**
     * 初始化虚拟滚动
     */
    init() {
        // 检查是否需要虚拟滚动
        if (this.items.length < PerformanceOptimizer.VIRTUAL_SCROLL_CONFIG.THRESHOLD) {
            // 项目数量少，直接渲染所有项
            this.renderAllItems();
            return;
        }

        this.setupDOM();
        this.bindEvents();
        this.updateVisibleRange();
        this.render();
    }

    /**
     * 设置DOM结构
     */
    setupDOM() {
        // 清空容器
        this.container.innerHTML = '';
        
        // 创建视口
        this.viewport = document.createElement('div');
        this.viewport.className = 'virtual-scroll-viewport';
        this.viewport.style.cssText = 'overflow-y: auto; height: 100%;';
        
        // 创建内容容器
        this.content = document.createElement('div');
        this.content.className = 'virtual-scroll-content';
        this.content.style.cssText = 'position: relative;';
        
        // 设置总高度
        const totalHeight = this.items.length * this.itemHeight;
        this.content.style.height = `${totalHeight}px`;
        
        // 创建项目容器
        this.itemsContainer = document.createElement('div');
        this.itemsContainer.className = 'virtual-scroll-items';
        this.itemsContainer.style.cssText = 'position: absolute; left: 0; right: 0;';
        
        this.content.appendChild(this.itemsContainer);
        this.viewport.appendChild(this.content);
        this.container.appendChild(this.viewport);
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        this.viewport.addEventListener('scroll', this.handleScroll, { passive: true });
    }

    /**
     * 处理滚动事件
     */
    handleScroll() {
        this.scrollTop = this.viewport.scrollTop;
        this.updateVisibleRange();
        this.render();
    }

    /**
     * 更新可见范围
     */
    updateVisibleRange() {
        const viewportHeight = this.viewport.clientHeight;
        
        // 计算可见项的起始和结束索引
        const startIndex = Math.floor(this.scrollTop / this.itemHeight);
        const visibleCount = Math.ceil(viewportHeight / this.itemHeight);
        
        // 添加缓冲区
        this.visibleStart = Math.max(0, startIndex - this.bufferSize);
        this.visibleEnd = Math.min(this.items.length, startIndex + visibleCount + this.bufferSize);
    }

    /**
     * 渲染可见项
     */
    render() {
        // 清空项目容器
        this.itemsContainer.innerHTML = '';
        
        // 设置项目容器的位置
        const offsetTop = this.visibleStart * this.itemHeight;
        this.itemsContainer.style.top = `${offsetTop}px`;
        
        // 使用DocumentFragment批量添加
        const fragment = document.createDocumentFragment();
        
        for (let i = this.visibleStart; i < this.visibleEnd; i++) {
            const item = this.items[i];
            const element = this.renderItem(item, i);
            
            if (element) {
                element.style.height = `${this.itemHeight}px`;
                fragment.appendChild(element);
            }
        }
        
        this.itemsContainer.appendChild(fragment);
    }

    /**
     * 直接渲染所有项（项目数量少时使用）
     */
    renderAllItems() {
        const fragment = document.createDocumentFragment();
        
        this.items.forEach((item, index) => {
            const element = this.renderItem(item, index);
            if (element) {
                fragment.appendChild(element);
            }
        });
        
        this.container.appendChild(fragment);
    }

    /**
     * 更新数据
     * @param {Array} newItems - 新数据
     */
    updateItems(newItems) {
        this.items = newItems || [];
        
        if (this.items.length < PerformanceOptimizer.VIRTUAL_SCROLL_CONFIG.THRESHOLD) {
            // 切换到普通渲染
            this.destroy();
            this.renderAllItems();
            return;
        }
        
        if (!this.viewport) {
            this.init();
            return;
        }
        
        // 更新总高度
        const totalHeight = this.items.length * this.itemHeight;
        this.content.style.height = `${totalHeight}px`;
        
        this.updateVisibleRange();
        this.render();
    }

    /**
     * 滚动到指定项
     * @param {number} index - 项索引
     */
    scrollToIndex(index) {
        if (!this.viewport) return;
        
        const targetTop = index * this.itemHeight;
        this.viewport.scrollTop = targetTop;
    }

    /**
     * 销毁虚拟滚动
     */
    destroy() {
        if (this.viewport) {
            this.viewport.removeEventListener('scroll', this.handleScroll);
        }
        this.container.innerHTML = '';
        this.viewport = null;
        this.content = null;
        this.itemsContainer = null;
    }
}

// 创建全局实例
const performanceOptimizer = new PerformanceOptimizer();

// 导出到全局作用域（浏览器环境）
if (typeof window !== 'undefined') {
    window.PerformanceOptimizer = PerformanceOptimizer;
    window.VirtualScroller = VirtualScroller;
}

// 导出到 Node.js 环境
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PerformanceOptimizer, VirtualScroller };
}
