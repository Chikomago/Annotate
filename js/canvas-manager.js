/**
 * 画布管理器 - CanvasManager
 * 管理图像显示和标注元素的绘制
 * 需求: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
 */

/**
 * 工具类型枚举
 */
const ToolType = {
    SELECT: 'select',
    RECTANGLE: 'rectangle',
    TEXT: 'text',
    STEP: 'step',
    DIVIDER: 'divider'
};

/**
 * 分割线数据结构
 * @typedef {Object} DividerLine
 * @property {string} id - 唯一标识符
 * @property {number} yPosition - 相对于图像顶部的像素位置
 * @property {boolean} isDragging - 是否正在拖拽
 */

/**
 * 图像区域数据结构
 * @typedef {Object} ImageRegion
 * @property {string} id - 唯一标识符
 * @property {number} index - 区域索引
 * @property {number} startY - 起始Y坐标
 * @property {number} endY - 结束Y坐标
 * @property {number} height - 区域高度
 */

/**
 * 绘制元素数据结构
 * @typedef {Object} DrawingElement
 * @property {string} id - 唯一标识符
 * @property {'rectangle'|'text'|'step'} type - 元素类型
 * @property {number} x - X坐标（相对于图像）
 * @property {number} y - Y坐标（相对于图像）
 * @property {number} width - 宽度
 * @property {number} height - 高度
 * @property {ElementStyle} style - 样式配置
 * @property {string} [content] - 文本内容（用于文本和步骤）
 * @property {number} [stepNumber] - 步骤编号（用于步骤标注）
 */

/**
 * 元素样式数据结构
 * @typedef {Object} ElementStyle
 * @property {string} color - 颜色
 * @property {number} [fontSize] - 字体大小
 * @property {string} [fontFamily] - 字体
 * @property {string} [fontWeight] - 字体粗细
 * @property {number} [borderWidth] - 边框宽度
 */

class CanvasManager {
    /**
     * 构造函数
     * @param {HTMLElement} container - 画布容器元素
     */
    constructor(container) {
        this.container = container;
        this.imageWrapper = null;
        this.drawingElementsContainer = null;
        this.currentTool = ToolType.SELECT;
        this.elements = new Map(); // 存储所有绘制元素
        this.selectedElement = null;
        this.stepCounter = 1; // 步骤计数器
        this.isDrawing = false;
        this.startX = 0;
        this.startY = 0;
        this.currentColor = '#FFFF00'; // 默认黄色（文案可编辑）
        this.currentFontSize = 24; // 默认24px
        this.currentFontFamily = '系统默认';
        
        // 分割线相关
        this.dividerLines = new Map(); // 存储所有分割线
        this.dividerLinesContainer = null;
        
        // 撤销/重做历史栈
        this.historyStack = [];
        this.historyIndex = -1;
        this.maxHistorySize = 50;
        this.isUndoRedoing = false;
        this.onHistoryChangeCallback = null;
        
        // 回调函数
        this.onElementChangeCallback = null;
        this.onSelectionChangeCallback = null;
        this.onDividerChangeCallback = null;
        
        // 性能优化相关
        this.renderQueue = [];
        this.isRendering = false;
        this.rafId = null;
        this.debouncedNotifyChange = this._debounce(this._notifyElementChangeImmediate.bind(this), 100);
        
        // 加载状态标志（用于禁用变化通知）
        this.isLoading = false;

        this.lastDisplaySize = null;
        
        this.init();
    }
    
    /**
     * 防抖函数
     * @param {Function} fn - 原函数
     * @param {number} delay - 延迟时间
     * @returns {Function} 防抖函数
     * @private
     */
    _debounce(fn, delay) {
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
     * 初始化画布管理器
     */
    init() {
        this.imageWrapper = this.container.querySelector('#image-wrapper');
        this.drawingElementsContainer = this.container.querySelector('#drawing-elements');
        
        if (!this.drawingElementsContainer && this.imageWrapper) {
            // 如果不存在绘制元素容器，创建一个
            this.drawingElementsContainer = document.createElement('div');
            this.drawingElementsContainer.id = 'drawing-elements';
            this.drawingElementsContainer.className = 'absolute inset-0';
            this.drawingElementsContainer.style.pointerEvents = 'none';
            this.imageWrapper.appendChild(this.drawingElementsContainer);
        }
        
        // 创建分割线容器
        this.dividerLinesContainer = this.container.querySelector('#divider-lines');
        if (!this.dividerLinesContainer && this.imageWrapper) {
            this.dividerLinesContainer = document.createElement('div');
            this.dividerLinesContainer.id = 'divider-lines';
            this.dividerLinesContainer.className = 'absolute inset-0';
            this.dividerLinesContainer.style.pointerEvents = 'none';
            this.dividerLinesContainer.style.zIndex = '10';
            this.imageWrapper.appendChild(this.dividerLinesContainer);
        }
        
        // 绑定事件处理函数（保存引用以便移除）
        this._boundHandleMouseDown = this.handleMouseDown.bind(this);
        this._boundHandleMouseMove = this.handleMouseMove.bind(this);
        this._boundHandleMouseUp = this.handleMouseUp.bind(this);
        this._boundHandleClick = this.handleClick.bind(this);
        this._boundHandleKeyDown = this.handleKeyDown.bind(this);
        
        this.bindEvents();
        
        // 初始化历史记录
        this.initHistory();
    }

    
    /**
     * 绑定事件监听器
     */
    bindEvents() {
        if (!this.imageWrapper) return;
        
        // 先解绑，防止重复绑定
        this.unbindEvents();
        
        // 鼠标事件
        this.imageWrapper.addEventListener('mousedown', this._boundHandleMouseDown);
        this.imageWrapper.addEventListener('mousemove', this._boundHandleMouseMove);
        this.imageWrapper.addEventListener('mouseup', this._boundHandleMouseUp);
        this.imageWrapper.addEventListener('mouseleave', this._boundHandleMouseUp);
        
        // 点击事件（用于选择和文本/步骤工具）
        this.imageWrapper.addEventListener('click', this._boundHandleClick);
        
        // 键盘事件（用于删除）
        document.addEventListener('keydown', this._boundHandleKeyDown);
        
        this._eventsBound = true;
    }
    
    /**
     * 解绑事件监听器
     */
    unbindEvents() {
        if (!this._eventsBound) return;
        
        if (this.imageWrapper) {
            this.imageWrapper.removeEventListener('mousedown', this._boundHandleMouseDown);
            this.imageWrapper.removeEventListener('mousemove', this._boundHandleMouseMove);
            this.imageWrapper.removeEventListener('mouseup', this._boundHandleMouseUp);
            this.imageWrapper.removeEventListener('mouseleave', this._boundHandleMouseUp);
            this.imageWrapper.removeEventListener('click', this._boundHandleClick);
        }
        document.removeEventListener('keydown', this._boundHandleKeyDown);
        
        this._eventsBound = false;
    }
    
    /**
     * 获取鼠标相对于图像的坐标
     * @param {MouseEvent} e - 鼠标事件
     * @returns {{x: number, y: number}} 坐标
     */
    getMousePosition(e) {
        if (!this.imageWrapper) return { x: 0, y: 0 };
        
        const rect = this.imageWrapper.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }
    
    /**
     * 处理鼠标按下事件
     * @param {MouseEvent} e - 鼠标事件
     */
    handleMouseDown(e) {
        // 检查是否点击了分割线区域
        if (e.target.closest('.divider-line-wrapper')) {
            return;
        }
        
        // 检查是否点击了绘制元素
        if (e.target.closest('.drawing-element')) {
            return;
        }
        
        if (this.currentTool !== ToolType.RECTANGLE) return;
        
        const pos = this.getMousePosition(e);
        this.isDrawing = true;
        this.startX = pos.x;
        this.startY = pos.y;
        
        // 取消选择
        this.deselectAll();
        
        e.preventDefault();
    }
    
    /**
     * 处理鼠标移动事件
     * @param {MouseEvent} e - 鼠标事件
     */
    handleMouseMove(e) {
        if (!this.isDrawing || this.currentTool !== ToolType.RECTANGLE) return;
        
        const pos = this.getMousePosition(e);
        
        // 创建或更新临时矩形
        let tempRect = this.container.querySelector('.temp-rectangle');
        if (!tempRect) {
            tempRect = document.createElement('div');
            tempRect.className = 'temp-rectangle absolute border-2 border-dashed pointer-events-none';
            tempRect.style.borderColor = this.currentColor;
            tempRect.style.backgroundColor = this.hexToRgba(this.currentColor, 0.1);
            this.drawingElementsContainer.appendChild(tempRect);
        }
        
        const width = pos.x - this.startX;
        const height = pos.y - this.startY;
        
        tempRect.style.left = (width >= 0 ? this.startX : pos.x) + 'px';
        tempRect.style.top = (height >= 0 ? this.startY : pos.y) + 'px';
        tempRect.style.width = Math.abs(width) + 'px';
        tempRect.style.height = Math.abs(height) + 'px';
    }
    
    /**
     * 处理鼠标释放事件
     * @param {MouseEvent} e - 鼠标事件
     */
    handleMouseUp(e) {
        if (!this.isDrawing) return;
        
        this.isDrawing = false;
        
        // 移除临时矩形
        const tempRect = this.container.querySelector('.temp-rectangle');
        if (tempRect) {
            tempRect.remove();
        }
        
        if (this.currentTool === ToolType.RECTANGLE) {
            const pos = this.getMousePosition(e);
            const width = Math.abs(pos.x - this.startX);
            const height = Math.abs(pos.y - this.startY);
            
            // 只有当矩形足够大时才创建
            if (width > 10 && height > 10) {
                const x = Math.min(this.startX, pos.x);
                const y = Math.min(this.startY, pos.y);
                
                this.addRectangle(x, y, width, height);
            }
        }
    }
    
    /**
     * 处理点击事件
     * @param {MouseEvent} e - 鼠标事件
     */
    handleClick(e) {
        // 检查是否点击了分割线区域，如果是则不处理（由分割线自己的事件处理）
        if (e.target.closest('.divider-line-wrapper')) {
            return;
        }
        
        // 检查是否点击了绘制元素，如果是则不处理（由元素自己的事件处理）
        if (e.target.closest('.drawing-element')) {
            return;
        }
        
        const pos = this.getMousePosition(e);
        
        // 检查是否点击了现有元素
        const clickedElement = this.getElementAtPosition(pos.x, pos.y);
        
        if (clickedElement) {
            // 如果是文本工具且点击了已有元素，只选择不新增
            if (this.currentTool === ToolType.TEXT) {
                this.selectElement(clickedElement.id);
                return;
            }
            this.selectElement(clickedElement.id);
            return;
        }
        
        // 根据当前工具添加元素
        switch (this.currentTool) {
            case ToolType.TEXT:
                this.addText(pos.x, pos.y);
                break;
            case ToolType.STEP:
                this.addStep(pos.x, pos.y);
                break;
            case ToolType.DIVIDER:
                this.addDividerLine(pos.y);
                break;
            case ToolType.SELECT:
                this.deselectAll();
                break;
        }
    }
    
    /**
     * 处理键盘事件
     * @param {KeyboardEvent} e - 键盘事件
     */
    handleKeyDown(e) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (this.selectedElement && !this.isEditingText()) {
                this.removeDrawingElement(this.selectedElement);
                e.preventDefault();
            }
        } else if (e.key === 'Escape') {
            this.deselectAll();
        }
    }
    
    /**
     * 处理右键菜单事件
     * 需求: 13.1
     * @param {MouseEvent} e - 鼠标事件
     */
    handleContextMenu(e) {
        // 阻止默认浏览器右键菜单
        e.preventDefault();
        
        // 获取鼠标相对于图像的坐标
        const pos = this.getMousePosition(e);
        
        // 将画布Y坐标转换为原图Y坐标
        const originalY = this.calculateOriginalY(pos.y);
        
        // 显示自定义右键菜单
        this.showContextMenu(e.clientX, e.clientY, originalY);
    }
    
    /**
     * 检查是否正在编辑文本
     * @returns {boolean}
     */
    isEditingText() {
        const activeElement = document.activeElement;
        return activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.contentEditable === 'true'
        );
    }

    
    /**
     * 设置当前工具
     * @param {string} tool - 工具类型
     */
    setTool(tool) {
        this.currentTool = tool;
        
        // 更新光标样式
        if (this.imageWrapper) {
            switch (tool) {
                case ToolType.RECTANGLE:
                    this.imageWrapper.style.cursor = 'crosshair';
                    break;
                case ToolType.TEXT:
                case ToolType.STEP:
                    this.imageWrapper.style.cursor = 'text';
                    break;
                case ToolType.DIVIDER:
                    this.imageWrapper.style.cursor = 'row-resize';
                    break;
                default:
                    this.imageWrapper.style.cursor = 'default';
            }
        }
        
        // 取消选择
        if (tool !== ToolType.SELECT) {
            this.deselectAll();
        }
    }
    
    /**
     * 获取当前工具
     * @returns {string} 当前工具类型
     */
    getTool() {
        return this.currentTool;
    }
    
    /**
     * 设置当前颜色
     * @param {string} color - 颜色值
     */
    setColor(color) {
        this.currentColor = color;
        
        // 如果有选中的元素，更新其颜色
        if (this.selectedElement) {
            this.updateDrawingElement(this.selectedElement, {
                style: { color: color }
            });
        }
    }
    
    /**
     * 设置字体大小
     * @param {number} size - 字体大小
     */
    setFontSize(size) {
        this.currentFontSize = size;
        
        if (this.selectedElement) {
            this.updateDrawingElement(this.selectedElement, {
                style: { fontSize: size }
            });
        }
    }
    
    /**
     * 设置字体
     * @param {string} family - 字体名称
     */
    setFontFamily(family) {
        this.currentFontFamily = family;
        
        if (this.selectedElement) {
            this.updateDrawingElement(this.selectedElement, {
                style: { fontFamily: family }
            });
        }
    }
    
    /**
     * 生成唯一ID
     * @returns {string} 唯一ID
     */
    generateId() {
        return 'element_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    /**
     * 添加绘制元素
     * @param {DrawingElement} element - 绘制元素数据
     * @returns {DrawingElement} 添加的元素
     */
    addDrawingElement(element) {
        debugLogger.call('addDrawingElement', { elementType: element.type, elementId: element.id });
        debugLogger.step('开始添加绘制元素');
        
        // 保存操作前的状态
        this.pushHistory();
        
        if (!element.id) {
            element.id = this.generateId();
            debugLogger.step('生成元素ID', { id: element.id });
        }
        
        this.elements.set(element.id, element);
        debugLogger.checkpoint('元素已添加到Map', { 
            elementId: element.id,
            elementType: element.type,
            totalElements: this.elements.size
        });
        
        this.renderElement(element);
        debugLogger.step('元素已渲染到DOM');
        
        this.notifyElementChange();
        debugLogger.logAction('添加绘制元素', {
            elementId: element.id,
            elementType: element.type,
            position: { x: element.x, y: element.y },
            size: { width: element.width, height: element.height },
            color: element.style?.color
        });
        
        debugLogger.return('addDrawingElement', element);
        return element;
    }
    
    /**
     * 移除绘制元素
     * @param {string} id - 元素ID
     * @returns {boolean} 是否成功移除
     */
    removeDrawingElement(id) {
        debugLogger.call('removeDrawingElement', { elementId: id });
        debugLogger.step('开始删除绘制元素');
        
        const element = this.elements.get(id);
        if (!element) {
            debugLogger.logError('删除失败：元素不存在', { elementId: id });
            debugLogger.return('removeDrawingElement', false);
            return false;
        }
        
        debugLogger.checkpoint('找到要删除的元素', {
            elementId: id,
            elementType: element.type,
            position: { x: element.x, y: element.y }
        });
        
        // 保存操作前的状态
        this.pushHistory();
        
        // 移除DOM元素
        const domElement = this.drawingElementsContainer.querySelector(`[data-element-id="${id}"]`);
        if (domElement) {
            domElement.remove();
            debugLogger.step('DOM元素已移除');
        }
        
        // 从Map中移除
        this.elements.delete(id);
        debugLogger.step('元素已从Map中移除', { remainingElements: this.elements.size });
        
        // 如果删除的是步骤，不自动重新编号，等待用户手动点击重置按钮
        // if (element.type === 'step') {
        //     debugLogger.step('删除的是步骤元素，重新编号所有步骤');
        //     this.renumberSteps();
        // }
        
        // 清除选择
        if (this.selectedElement === id) {
            this.selectedElement = null;
            this.notifySelectionChange(null);
            debugLogger.step('清除选中状态');
        }
        
        this.notifyElementChange();
        debugLogger.logAction('删除绘制元素', {
            elementId: id,
            elementType: element.type,
            wasSelected: this.selectedElement === id
        });
        
        debugLogger.return('removeDrawingElement', true);
        return true;
    }
    
    /**
     * 更新绘制元素
     * @param {string} id - 元素ID
     * @param {Partial<DrawingElement>} updates - 更新数据
     * @returns {boolean} 是否成功更新
     */
    updateDrawingElement(id, updates) {
        const element = this.elements.get(id);
        if (!element) return false;
        
        // 合并更新
        if (updates.style) {
            element.style = { ...element.style, ...updates.style };
            delete updates.style;
        }
        Object.assign(element, updates);
        
        // 重新渲染元素
        this.renderElement(element);
        this.notifyElementChange();
        
        return true;
    }
    
    /**
     * 获取绘制元素
     * @param {string} id - 元素ID
     * @returns {DrawingElement|undefined} 元素数据
     */
    getDrawingElement(id) {
        return this.elements.get(id);
    }
    
    /**
     * 获取所有绘制元素
     * @returns {DrawingElement[]} 所有元素
     */
    getAllElements() {
        return Array.from(this.elements.values());
    }
    
    /**
     * 清除所有绘制元素
     */
    clearAllElements() {
        // 保存历史记录
        this.pushHistory();
        
        this.elements.clear();
        if (this.drawingElementsContainer) {
            this.drawingElementsContainer.innerHTML = '';
        }
        this.stepCounter = 1;
        this.selectedElement = null;
        this.notifyElementChange();
    }
    
    // ==================== 撤销/重做相关方法 ====================
    
    /**
     * 初始化历史记录（保存初始空状态）
     */
    initHistory() {
        this.historyStack = [];
        this.historyIndex = -1;
        
        // 保存初始空状态
        const initialState = {
            elements: [],
            stepCounter: 1
        };
        this.historyStack.push(initialState);
        this.historyIndex = 0;
        this.notifyHistoryChange();
    }
    
    /**
     * 保存当前状态到历史栈（在操作之前调用）
     */
    pushHistory() {
        if (this.isUndoRedoing) return;
        
        // 如果当前不在历史栈末尾，删除后面的记录
        if (this.historyIndex < this.historyStack.length - 1) {
            this.historyStack = this.historyStack.slice(0, this.historyIndex + 1);
        }
        
        // 创建当前状态的深拷贝
        const state = {
            elements: JSON.parse(JSON.stringify(Array.from(this.elements.entries()))),
            stepCounter: this.stepCounter
        };
        
        this.historyStack.push(state);
        this.historyIndex++;
        
        // 限制历史栈大小
        if (this.historyStack.length > this.maxHistorySize) {
            this.historyStack.shift();
            this.historyIndex--;
        }
        
        this.notifyHistoryChange();
    }
    
    /**
     * 保存操作后的状态（在操作完成后调用，用于支持重做）
     */
    saveCurrentState() {
        if (this.isUndoRedoing) return;
        
        // 如果当前不在历史栈末尾，删除后面的记录
        if (this.historyIndex < this.historyStack.length - 1) {
            this.historyStack = this.historyStack.slice(0, this.historyIndex + 1);
        }
        
        // 创建当前状态的深拷贝
        const state = {
            elements: JSON.parse(JSON.stringify(Array.from(this.elements.entries()))),
            stepCounter: this.stepCounter
        };
        
        this.historyStack.push(state);
        this.historyIndex++;
        
        // 限制历史栈大小
        if (this.historyStack.length > this.maxHistorySize) {
            this.historyStack.shift();
            this.historyIndex--;
        }
        
        this.notifyHistoryChange();
    }
    
    /**
     * 撤销操作
     * @returns {boolean} 是否成功撤销
     */
    undo() {
        if (!this.canUndo()) return false;
        
        // 如果当前在历史栈末尾，先保存当前状态以便重做
        if (this.historyIndex === this.historyStack.length - 1) {
            const currentState = {
                elements: JSON.parse(JSON.stringify(Array.from(this.elements.entries()))),
                stepCounter: this.stepCounter
            };
            this.historyStack.push(currentState);
        }
        
        this.historyIndex--;
        this.restoreState(this.historyStack[this.historyIndex]);
        this.notifyHistoryChange();
        return true;
    }
    
    /**
     * 重做操作
     * @returns {boolean} 是否成功重做
     */
    redo() {
        if (!this.canRedo()) return false;
        
        this.historyIndex++;
        this.restoreState(this.historyStack[this.historyIndex]);
        this.notifyHistoryChange();
        return true;
    }
    
    /**
     * 检查是否可以撤销
     * @returns {boolean}
     */
    canUndo() {
        return this.historyIndex > 0;
    }
    
    /**
     * 检查是否可以重做
     * @returns {boolean}
     */
    canRedo() {
        return this.historyIndex < this.historyStack.length - 1;
    }
    
    /**
     * 恢复状态（仅恢复绘制元素，不影响分割线）
     * @param {Object} state - 状态对象
     */
    restoreState(state) {
        this.isUndoRedoing = true;
        
        // 清除当前绘制元素
        this.elements.clear();
        if (this.drawingElementsContainer) {
            this.drawingElementsContainer.innerHTML = '';
        }
        
        // 恢复绘制元素
        state.elements.forEach(([id, element]) => {
            this.elements.set(id, element);
            this.renderElement(element);
        });
        
        this.stepCounter = state.stepCounter;
        this.selectedElement = null;
        
        this.isUndoRedoing = false;
        
        // 通知变化
        this.notifyElementChange();
    }
    
    /**
     * 设置历史变化回调
     * @param {Function} callback - 回调函数
     */
    onHistoryChange(callback) {
        this.onHistoryChangeCallback = callback;
    }
    
    /**
     * 通知历史变化
     */
    notifyHistoryChange() {
        if (this.onHistoryChangeCallback) {
            this.onHistoryChangeCallback({
                canUndo: this.canUndo(),
                canRedo: this.canRedo()
            });
        }
    }

    
    /**
     * 添加矩形元素
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     * @param {number} width - 宽度
     * @param {number} height - 高度
     * @param {string} [label] - 标签文本（不再使用）
     * @returns {DrawingElement} 创建的矩形元素
     */
    addRectangle(x, y, width, height, label = '') {
        const element = {
            id: this.generateId(),
            type: 'rectangle',
            x: x,
            y: y,
            width: width,
            height: height,
            style: {
                color: this.currentColor,
                borderWidth: 2
            },
            content: ''
        };
        
        return this.addDrawingElement(element);
    }
    
    /**
     * 添加文本元素
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     * @param {string} [content] - 文本内容
     * @returns {DrawingElement} 创建的文本元素
     */
    addText(x, y, content = '') {
        const element = {
            id: this.generateId(),
            type: 'text',
            x: x,
            y: y,
            width: 150,
            height: 30,
            style: {
                color: this.currentColor,
                fontSize: this.currentFontSize,
                fontFamily: this.currentFontFamily,
                fontWeight: 'normal'
            },
            content: content || '点击编辑文本'
        };
        
        const addedElement = this.addDrawingElement(element);
        
        // 自动选中并进入编辑模式
        this.selectElement(addedElement.id);
        
        return addedElement;
    }
    
    /**
     * 添加步骤标注元素
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     * @returns {DrawingElement} 创建的步骤元素
     */
    addStep(x, y) {
        const stepNumber = this.getNextStepNumber();
        
        const element = {
            id: this.generateId(),
            type: 'step',
            x: x - 16, // 居中显示
            y: y - 16,
            width: 32,
            height: 32,
            style: {
                color: this.currentColor,
                fontSize: 14,
                fontWeight: 'bold'
            },
            content: String(stepNumber),
            stepNumber: stepNumber
        };
        
        this.stepCounter = stepNumber + 1;
        return this.addDrawingElement(element);
    }
    
    /**
     * 获取下一个步骤编号
     * @returns {number} 下一个步骤编号
     */
    getNextStepNumber() {
        // 直接返回维护的计数器，避免因遍历计算导致的问题（如删除中间步骤后序号被复用，或重置后序号未正确衔接）
        // stepCounter 在 addStep, renumberSteps, loadElements 等处均有维护
        if (!this.stepCounter || this.stepCounter < 1) {
            this.stepCounter = 1;
        }
        
        return this.stepCounter;
    }
    
    /**
     * 重新编号所有步骤
     * @returns {number} 重置的步骤数量
     */
    renumberSteps() {
        // 检查容器状态
        if (!this.drawingElementsContainer || !this.drawingElementsContainer.isConnected) {
            console.warn('[CanvasManager] Container disconnected, attempting to rebind...');
            this.drawingElementsContainer = document.getElementById('drawing-elements');
            if (!this.drawingElementsContainer) {
                console.error('[CanvasManager] Fatal: Could not find #drawing-elements in DOM');
                return 0;
            }
        }

        // 1. 强制清理所有步骤DOM元素（防止幽灵元素）
        if (this.drawingElementsContainer) {
            const stepDoms = this.drawingElementsContainer.querySelectorAll('.step-element');
            stepDoms.forEach(dom => dom.remove());
        }

        // 2. 获取所有步骤数据
        // 不需要排序，保持添加顺序（Map 迭代顺序）
        const steps = Array.from(this.elements.values())
            .filter(e => e.type === 'step');
        
        if (steps.length === 0) {
            this.stepCounter = 1;
            return 0;
        }

        // 3. 更新数据并重新渲染
        steps.forEach((step, index) => {
            const newNumber = index + 1;
            
            // 始终更新并重新渲染，确保一致性
            step.stepNumber = newNumber;
            step.content = String(newNumber);
            
            // renderElement 会创建新的DOM并附加
            this.renderElement(step);
            
            // 验证DOM是否成功创建
            const dom = this.drawingElementsContainer.querySelector(`[data-element-id="${step.id}"]`);
            if (!dom) {
                console.error(`[CanvasManager] Failed to render step ${step.id} (Number: ${newNumber})`);
            } else {
                // 验证 DOM 是否在文档中
                if (!dom.isConnected) {
                     console.error(`[CanvasManager] Step ${newNumber} created but not in document! Container connected: ${this.drawingElementsContainer.isConnected}`);
                }
            }
        });
        
        this.stepCounter = steps.length + 1;
        this.notifyHistoryChange();
        
        return steps.length;
    }

    /**
     * 重置步骤序号计数器
     * 如果存在步骤元素，则重新编号；如果不存在，则重置计数器为1
     * @returns {number} 重置的步骤数量
     */
    resetStepCounter() {
        // 纯粹重置计数器，不修改现有步骤
        this.stepCounter = 1;
        
        // 通知UI更新（虽然数据没变，但可能需要触发一些状态更新）
        this.notifyElementChange();
        
        // 返回0表示没有修改任何现有步骤，只重置了计数器
        return 0;
    }

    // ==================== 分割线相关方法 ====================
    
    /**
     * 生成分割线唯一ID
     * @returns {string} 唯一ID
     */
    generateDividerId() {
        return 'divider_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    /**
     * 添加分割线
     * @param {number} yPosition - Y坐标位置（相对于图像顶部）
     * @returns {DividerLine} 创建的分割线
     */
    addDividerLine(yPosition) {
        debugLogger.call('addDividerLine', { yPosition });
        debugLogger.step('开始添加分割线');
        
        // 获取图像高度以限制分割线位置
        const imageHeight = this.getImageHeight();
        const clampedY = Math.max(10, Math.min(yPosition, imageHeight - 10));
        
        debugLogger.checkpoint('分割线位置计算', {
            requestedY: yPosition,
            clampedY,
            imageHeight,
            wasAdjusted: yPosition !== clampedY
        });
        
        const dividerLine = {
            id: this.generateDividerId(),
            yPosition: clampedY,
            isDragging: false
        };
        
        this.dividerLines.set(dividerLine.id, dividerLine);
        debugLogger.step('分割线已添加到Map', { 
            dividerId: dividerLine.id,
            totalDividers: this.dividerLines.size
        });
        
        this.renderDividerLine(dividerLine);
        debugLogger.step('分割线已渲染到DOM');
        
        this.notifyDividerChange();
        debugLogger.logAction('添加分割线', {
            dividerId: dividerLine.id,
            yPosition: clampedY,
            totalDividers: this.dividerLines.size
        });
        
        debugLogger.return('addDividerLine', dividerLine);
        return dividerLine;
    }
    
    /**
     * 移除分割线
     * @param {string} id - 分割线ID
     * @returns {boolean} 是否成功移除
     */
    removeDividerLine(id) {
        debugLogger.call('removeDividerLine', { dividerId: id });
        debugLogger.step('开始删除分割线');
        
        const dividerLine = this.dividerLines.get(id);
        if (!dividerLine) {
            debugLogger.logError('删除失败：分割线不存在', { dividerId: id });
            debugLogger.return('removeDividerLine', false);
            return false;
        }
        
        debugLogger.checkpoint('找到要删除的分割线', {
            dividerId: id,
            yPosition: dividerLine.yPosition
        });
        
        // 移除DOM元素
        const domElement = this.dividerLinesContainer?.querySelector(`[data-divider-id="${id}"]`);
        if (domElement) {
            domElement.remove();
            debugLogger.step('DOM元素已移除');
        }
        
        // 从Map中移除
        this.dividerLines.delete(id);
        debugLogger.step('分割线已从Map中移除', { remainingDividers: this.dividerLines.size });
        
        this.notifyDividerChange();
        debugLogger.logAction('删除分割线', {
            dividerId: id,
            yPosition: dividerLine.yPosition,
            remainingDividers: this.dividerLines.size
        });
        
        debugLogger.return('removeDividerLine', true);
        return true;
    }
    
    /**
     * 更新分割线位置
     * @param {string} id - 分割线ID
     * @param {number} yPosition - 新的Y坐标位置
     * @returns {boolean} 是否成功更新
     */
    updateDividerLine(id, yPosition) {
        const dividerLine = this.dividerLines.get(id);
        if (!dividerLine) return false;
        
        // 限制在图像范围内
        const imageHeight = this.getImageHeight();
        const clampedY = Math.max(10, Math.min(yPosition, imageHeight - 10));
        
        const oldY = dividerLine.yPosition;
        dividerLine.yPosition = clampedY;
        this.renderDividerLine(dividerLine);
        this.notifyDividerChange();
        
        // 只在拖拽结束时记录日志（避免拖拽过程中产生大量日志）
        if (!dividerLine.isDragging) {
            debugLogger.logAction('移动分割线', {
                dividerId: id,
                from: oldY,
                to: clampedY,
                distance: Math.abs(clampedY - oldY).toFixed(2)
            });
        }
        
        return true;
    }
    
    /**
     * 获取分割线
     * @param {string} id - 分割线ID
     * @returns {DividerLine|undefined} 分割线数据
     */
    getDividerLine(id) {
        return this.dividerLines.get(id);
    }
    
    /**
     * 获取所有分割线
     * @returns {DividerLine[]} 所有分割线（按yPosition排序）
     */
    getAllDividerLines() {
        return Array.from(this.dividerLines.values())
            .sort((a, b) => a.yPosition - b.yPosition);
    }
    
    /**
     * 清除所有分割线
     */
    clearAllDividerLines() {
        this.dividerLines.clear();
        if (this.dividerLinesContainer) {
            this.dividerLinesContainer.innerHTML = '';
        }
        // 只在非加载状态下通知变化
        if (!this.isLoading) {
            this.notifyDividerChange();
        }
    }
    
    /**
     * 渲染分割线到DOM
     * @param {DividerLine} dividerLine - 分割线数据
     */
    
    renderDividerLine(dividerLine) {
        if (!this.dividerLinesContainer) return;
        
        // 移除已存在的DOM元素
        const existingDom = this.dividerLinesContainer.querySelector(`[data-divider-id="${dividerLine.id}"]`);
        if (existingDom) {
            existingDom.remove();
        }
        
        const domElement = this.createDividerLineDom(dividerLine);
        if (domElement) {
            this.dividerLinesContainer.appendChild(domElement);
        }
    }
    
    /**
     * 创建分割线DOM元素
     * @param {DividerLine} dividerLine - 分割线数据
     * @returns {HTMLElement} DOM元素
     */
    createDividerLineDom(dividerLine) {
        const wrapper = document.createElement('div');
        wrapper.className = 'divider-line-wrapper absolute left-0 right-0 group';
        wrapper.dataset.dividerId = dividerLine.id;
        wrapper.style.cssText = `
            top: ${dividerLine.yPosition}px;
            transform: translateY(-50%);
            height: 20px;
            pointer-events: auto;
            cursor: row-resize;
            z-index: 20;
        `;
        
        // 分割线本身
        const line = document.createElement('div');
        line.className = 'divider-line absolute left-0 right-0 top-1/2 transform -translate-y-1/2';
        line.style.cssText = `
            height: 2px;
            background: linear-gradient(90deg, transparent 0%, #f59e0b 10%, #f59e0b 90%, transparent 100%);
            box-shadow: 0 0 8px rgba(245, 158, 11, 0.5);
        `;
        wrapper.appendChild(line);
        
        // 左侧拖拽手柄
        const leftHandle = document.createElement('div');
        leftHandle.className = 'divider-handle absolute left-2 top-1/2 transform -translate-y-1/2';
        leftHandle.style.cssText = `
            width: 24px;
            height: 12px;
            background-color: #f59e0b;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        `;
        leftHandle.innerHTML = `
            <span style="color: white; font-size: 10px; line-height: 1;">≡</span>
        `;
        wrapper.appendChild(leftHandle);
        
        // 删除按钮
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'divider-delete-btn absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity';
        deleteBtn.style.cssText = `
            width: 20px;
            height: 20px;
            background-color: #ef4444;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            border: none;
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        `;
        deleteBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 12px; color: white;">close</span>';
        deleteBtn.title = '删除分割线';
        wrapper.appendChild(deleteBtn);
        
        // 绑定事件
        this.bindDividerLineEvents(wrapper, dividerLine);
        
        return wrapper;
    }
    
    /**
     * 绑定分割线事件
     * @param {HTMLElement} domElement - DOM元素
     * @param {DividerLine} dividerLine - 分割线数据
     */
    bindDividerLineEvents(domElement, dividerLine) {
        // 删除按钮点击
        const deleteBtn = domElement.querySelector('.divider-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeDividerLine(dividerLine.id);
            });
        }
        
        // 拖拽事件
        domElement.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('divider-delete-btn') || e.target.closest('.divider-delete-btn')) {
                return;
            }
            e.stopPropagation();
            this.startDividerDrag(dividerLine, e);
        });
    }
    
    /**
     * 开始拖拽分割线
     * @param {DividerLine} dividerLine - 分割线数据
     * @param {MouseEvent} e - 鼠标事件
     */
    startDividerDrag(dividerLine, e) {
        dividerLine.isDragging = true;
        const startY = e.clientY;
        const startPosition = dividerLine.yPosition;
        
        const handleMouseMove = (moveEvent) => {
            const deltaY = moveEvent.clientY - startY;
            const newY = startPosition + deltaY;
            this.updateDividerLine(dividerLine.id, newY);
        };
        
        const handleMouseUp = () => {
            dividerLine.isDragging = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }
    
    /**
     * 获取图像高度
     * @returns {number} 图像高度
     */
    getImageHeight() {
        const img = this.container.querySelector('#annotation-image');
        if (img && img.naturalHeight) {
            return img.clientHeight || img.naturalHeight;
        }
        // 如果没有图像，返回容器高度
        return this.imageWrapper?.clientHeight || 600;
    }
    
    /**
     * 获取图像宽度
     * @returns {number} 图像宽度
     */
    getImageWidth() {
        const img = this.container.querySelector('#annotation-image');
        if (img && img.naturalWidth) {
            return img.clientWidth || img.naturalWidth;
        }
        return this.imageWrapper?.clientWidth || 800;
    }
    
    /**
     * 根据分割线计算图像区域
     * @returns {ImageRegion[]} 图像区域数组
     */
    getImageRegions() {
        debugLogger.call('getImageRegions');
        
        const imageHeight = this.getImageHeight();
        const sortedDividers = this.getAllDividerLines();
        const regions = [];
        
        debugLogger.checkpoint('图像和分割线信息', { 
            imageHeight, 
            dividerCount: sortedDividers.length,
            dividers: sortedDividers.map(d => ({ id: d.id, yPosition: d.yPosition }))
        });
        
        // 如果没有分割线，返回整个图像作为一个区域
        if (sortedDividers.length === 0) {
            regions.push({
                id: 'region_0',
                index: 0,
                startY: 0,
                endY: imageHeight,
                height: imageHeight
            });
            debugLogger.branch('是否有分割线', false, { 
                message: '无分割线，返回单个区域',
                regionHeight: imageHeight 
            });
            debugLogger.return('getImageRegions', regions);
            return regions;
        }
        
        // 创建第一个区域（从0到第一条分割线）
        regions.push({
            id: 'region_0',
            index: 0,
            startY: 0,
            endY: sortedDividers[0].yPosition,
            height: sortedDividers[0].yPosition
        });
        
        // 创建中间区域（分割线之间）
        for (let i = 0; i < sortedDividers.length - 1; i++) {
            const startY = sortedDividers[i].yPosition;
            const endY = sortedDividers[i + 1].yPosition;
            regions.push({
                id: `region_${i + 1}`,
                index: i + 1,
                startY: startY,
                endY: endY,
                height: endY - startY
            });
        }
        
        // 创建最后一个区域（最后一条分割线到图像底部）
        const lastDivider = sortedDividers[sortedDividers.length - 1];
        regions.push({
            id: `region_${sortedDividers.length}`,
            index: sortedDividers.length,
            startY: lastDivider.yPosition,
            endY: imageHeight,
            height: imageHeight - lastDivider.yPosition
        });
        
        debugLogger.checkpoint('区域计算完成', { 
            regionCount: regions.length,
            regions: regions.map(r => ({ 
                id: r.id, 
                index: r.index,
                height: r.height,
                startY: r.startY,
                endY: r.endY
            }))
        });
        
        debugLogger.return('getImageRegions', regions);
        return regions;
    }
    
    /**
     * 设置分割线变化回调
     * @param {Function} callback - 回调函数
     */
    onDividerChange(callback) {
        this.onDividerChangeCallback = callback;
    }
    
    /**
     * 通知分割线变化
     */
    notifyDividerChange() {
        // 加载数据时不触发回调
        if (this.isLoading) return;
        if (this.onDividerChangeCallback) {
            this.onDividerChangeCallback(this.getAllDividerLines(), this.getImageRegions());
        }
    }
    
    /**
     * 从数据加载分割线
     * @param {DividerLine[]} dividerLines - 分割线数组
     */
    loadDividerLines(dividerLines) {
        // 设置加载标志，禁用变化通知
        this.isLoading = true;
        
        this.clearAllDividerLines();
        
        if (!dividerLines || !Array.isArray(dividerLines)) {
            this.isLoading = false;
            return;
        }
        
        dividerLines.forEach(dividerLine => {
            this.dividerLines.set(dividerLine.id, dividerLine);
            this.renderDividerLine(dividerLine);
        });
        
        // 恢复加载标志
        this.isLoading = false;
        
        // 加载时不触发变化通知，避免覆盖已保存的数据
        // this.notifyDividerChange();
    }
    
    /**
     * 导出分割线数据
     * @returns {DividerLine[]} 分割线数组
     */
    exportDividerLines() {
        return this.getAllDividerLines();
    }

    
    /**
     * 渲染单个元素到DOM
     * @param {DrawingElement} element - 元素数据
     */
    renderElement(element) {
        if (!this.drawingElementsContainer) return;
        
        // 移除已存在的DOM元素
        const existingDom = this.drawingElementsContainer.querySelector(`[data-element-id="${element.id}"]`);
        if (existingDom) {
            existingDom.remove();
        }
        
        let domElement;
        
        switch (element.type) {
            case 'rectangle':
                domElement = this.createRectangleDom(element);
                break;
            case 'text':
                domElement = this.createTextDom(element);
                break;
            case 'step':
                domElement = this.createStepDom(element);
                break;
            default:
                return;
        }
        
        if (domElement) {
            domElement.dataset.elementId = element.id;
            this.drawingElementsContainer.appendChild(domElement);
            
            // 如果是选中状态，添加选中样式
            if (this.selectedElement === element.id) {
                domElement.classList.add('selected');
            }
        }
    }
    
    /**
     * 创建矩形DOM元素
     * @param {DrawingElement} element - 元素数据
     * @returns {HTMLElement} DOM元素
     */
    createRectangleDom(element) {
        const div = document.createElement('div');
        div.className = 'drawing-element rectangle absolute cursor-move group';
        div.style.cssText = `
            left: ${element.x}px;
            top: ${element.y}px;
            width: ${element.width}px;
            height: ${element.height}px;
            border: ${element.style.borderWidth || 2}px solid ${element.style.color};
            background-color: ${this.hexToRgba(element.style.color, 0.1)};
            border-radius: 4px;
            pointer-events: auto;
        `;
        
        // 删除按钮（不显示标签文字）
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn absolute -top-3 -right-3 size-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity';
        deleteBtn.innerHTML = '<span class="material-symbols-outlined text-[12px]">close</span>';
        deleteBtn.title = '删除';
        div.appendChild(deleteBtn);
        
        // 调整大小手柄
        this.addResizeHandles(div, element);
        
        // 绑定事件
        this.bindElementEvents(div, element);
        
        return div;
    }
    
    /**
     * 创建文本DOM元素
     * @param {DrawingElement} element - 元素数据
     * @returns {HTMLElement} DOM元素
     */
    createTextDom(element) {
        const div = document.createElement('div');
        div.className = 'drawing-element text-element absolute cursor-move group';
        div.style.cssText = `
            left: ${element.x}px;
            top: ${element.y}px;
            min-width: 50px;
            pointer-events: auto;
        `;
        
        // 拖拽手柄（用于移动）
        const dragHandle = document.createElement('div');
        dragHandle.className = 'drag-handle absolute -left-6 top-0 bottom-0 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-move';
        dragHandle.innerHTML = '<span class="material-symbols-outlined text-[14px] text-gray-400">drag_indicator</span>';
        div.appendChild(dragHandle);
        
        // 文本内容
        const textContent = document.createElement('div');
        textContent.className = 'text-content px-2 py-1 rounded';
        textContent.style.cssText = `
            color: ${element.style.color};
            font-size: ${element.style.fontSize || 24}px;
            font-family: ${element.style.fontFamily || '系统默认'};
            font-weight: ${element.style.fontWeight || 'normal'};
            background-color: ${this.hexToRgba(element.style.color, 0.1)};
            border: 1px solid ${this.hexToRgba(element.style.color, 0.3)};
            outline: none;
        `;
        textContent.contentEditable = 'true';
        textContent.textContent = element.content || '';
        
        // 保存原始文本用于比较
        let originalText = element.content || '';
        
        // 文本编辑开始时保存历史
        textContent.addEventListener('focus', () => {
            originalText = element.content || '';
            this.pushHistory();
        });
        
        // 文本编辑事件
        textContent.addEventListener('blur', () => {
            const newText = textContent.textContent;
            // 只有文本真正改变时才保存
            if (newText !== originalText) {
                element.content = newText;
                this.saveCurrentState();
                this.notifyElementChange();
            }
        });
        
        textContent.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                textContent.blur();
            }
            e.stopPropagation();
        });
        
        // 阻止文本内容区域的mousedown冒泡，防止触发拖拽
        textContent.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
        
        div.appendChild(textContent);
        
        // 删除按钮
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn absolute -top-3 -right-3 size-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity';
        deleteBtn.innerHTML = '<span class="material-symbols-outlined text-[12px]">close</span>';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeDrawingElement(element.id);
        });
        div.appendChild(deleteBtn);
        
        // 绑定拖拽事件到拖拽手柄和整个元素（除了文本区域）
        dragHandle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.startDrag(element, e);
        });
        
        // 绑定其他事件
        this.bindElementEvents(div, element);
        
        return div;
    }
    
    /**
     * 创建步骤标注DOM元素
     * @param {DrawingElement} element - 元素数据
     * @returns {HTMLElement} DOM元素
     */
    createStepDom(element) {
        const div = document.createElement('div');
        div.className = 'drawing-element step-element absolute cursor-move group';
        div.style.cssText = `
            left: ${element.x}px;
            top: ${element.y}px;
            width: ${element.width}px;
            height: ${element.height}px;
            pointer-events: auto;
        `;
        
        // 步骤圆圈
        const circle = document.createElement('div');
        circle.className = 'step-circle size-8 rounded-full flex items-center justify-center font-bold text-sm shadow-md border-2 border-white/20 hover:scale-110 transition-transform';
        circle.style.cssText = `
            background-color: ${element.style.color};
            color: white;
        `;
        circle.textContent = element.content || element.stepNumber || '1';
        div.appendChild(circle);
        
        // 删除按钮
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn absolute -top-2 -right-2 size-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity';
        deleteBtn.innerHTML = '<span class="material-symbols-outlined text-[10px]">close</span>';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeDrawingElement(element.id);
        });
        div.appendChild(deleteBtn);
        
        // 绑定事件
        this.bindElementEvents(div, element);
        
        return div;
    }

    
    /**
     * 添加调整大小手柄
     * @param {HTMLElement} domElement - DOM元素
     * @param {DrawingElement} element - 元素数据
     */
    addResizeHandles(domElement, element) {
        const positions = ['nw', 'ne', 'sw', 'se'];
        
        positions.forEach(pos => {
            const handle = document.createElement('div');
            handle.className = `resize-handle resize-${pos} absolute size-2 bg-white border border-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity`;
            
            switch (pos) {
                case 'nw':
                    handle.style.cssText = 'top: -4px; left: -4px; cursor: nw-resize;';
                    break;
                case 'ne':
                    handle.style.cssText = 'top: -4px; right: -4px; cursor: ne-resize;';
                    break;
                case 'sw':
                    handle.style.cssText = 'bottom: -4px; left: -4px; cursor: sw-resize;';
                    break;
                case 'se':
                    handle.style.cssText = 'bottom: -4px; right: -4px; cursor: se-resize;';
                    break;
            }
            
            // 调整大小事件
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                this.startResize(element, pos, e);
            });
            
            domElement.appendChild(handle);
        });
    }
    
    /**
     * 开始调整大小
     * @param {DrawingElement} element - 元素数据
     * @param {string} position - 手柄位置
     * @param {MouseEvent} e - 鼠标事件
     */
    startResize(element, position, e) {
        debugLogger.call('startResize', { 
            elementId: element.id,
            elementType: element.type,
            handlePosition: position,
            startSize: { width: element.width, height: element.height }
        });
        debugLogger.step('开始调整元素大小');
        
        // 保存调整大小前的状态
        this.pushHistory();
        
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = element.width;
        const startHeight = element.height;
        const startLeft = element.x;
        const startTop = element.y;
        
        debugLogger.checkpoint('调整大小初始状态', {
            mouseStart: { x: startX, y: startY },
            elementStart: { x: startLeft, y: startTop, width: startWidth, height: startHeight }
        });
        
        let resizeCount = 0;
        
        const handleMouseMove = (moveEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const deltaY = moveEvent.clientY - startY;
            
            let newWidth = startWidth;
            let newHeight = startHeight;
            let newX = startLeft;
            let newY = startTop;
            
            switch (position) {
                case 'se':
                    newWidth = Math.max(20, startWidth + deltaX);
                    newHeight = Math.max(20, startHeight + deltaY);
                    break;
                case 'sw':
                    newWidth = Math.max(20, startWidth - deltaX);
                    newHeight = Math.max(20, startHeight + deltaY);
                    newX = startLeft + (startWidth - newWidth);
                    break;
                case 'ne':
                    newWidth = Math.max(20, startWidth + deltaX);
                    newHeight = Math.max(20, startHeight - deltaY);
                    newY = startTop + (startHeight - newHeight);
                    break;
                case 'nw':
                    newWidth = Math.max(20, startWidth - deltaX);
                    newHeight = Math.max(20, startHeight - deltaY);
                    newX = startLeft + (startWidth - newWidth);
                    newY = startTop + (startHeight - newHeight);
                    break;
            }
            
            // 更新但不保存历史（避免每次移动都保存）
            element.x = newX;
            element.y = newY;
            element.width = newWidth;
            element.height = newHeight;
            this.renderElement(element);
            
            resizeCount++;
        };
        
        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            
            debugLogger.checkpoint('调整大小结束', {
                elementId: element.id,
                startSize: { width: startWidth, height: startHeight },
                endSize: { width: element.width, height: element.height },
                startPosition: { x: startLeft, y: startTop },
                endPosition: { x: element.x, y: element.y },
                resizeCount
            });
            
            // 调整大小结束后保存当前状态（用于重做）
            this.saveCurrentState();
            this.notifyElementChange();
            
            debugLogger.logAction('调整元素大小', {
                elementId: element.id,
                elementType: element.type,
                handlePosition: position,
                from: { width: startWidth, height: startHeight },
                to: { width: element.width, height: element.height },
                sizeChange: {
                    width: element.width - startWidth,
                    height: element.height - startHeight
                }
            });
            
            debugLogger.return('startResize');
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }
    
    /**
     * 绑定元素事件
     * @param {HTMLElement} domElement - DOM元素
     * @param {DrawingElement} element - 元素数据
     */
    bindElementEvents(domElement, element) {
        // 点击选择
        domElement.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectElement(element.id);
        });
        
        // 拖拽移动
        domElement.addEventListener('mousedown', (e) => {
            // 忽略调整大小手柄和删除按钮
            if (e.target.classList.contains('resize-handle') || 
                e.target.classList.contains('delete-btn') ||
                e.target.closest('.delete-btn') ||
                e.target.contentEditable === 'true') {
                return;
            }
            
            e.stopPropagation();
            this.startDrag(element, e);
        });
        
        // 删除按钮
        const deleteBtn = domElement.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeDrawingElement(element.id);
            });
        }
    }
    
    /**
     * 开始拖拽
     * @param {DrawingElement} element - 元素数据
     * @param {MouseEvent} e - 鼠标事件
     */
    startDrag(element, e) {
        debugLogger.call('startDrag', { 
            elementId: element.id, 
            elementType: element.type,
            startPosition: { x: element.x, y: element.y }
        });
        debugLogger.step('开始拖拽元素');
        
        // 保存拖拽前的状态
        this.pushHistory();
        
        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = element.x;
        const startTop = element.y;
        
        debugLogger.checkpoint('拖拽初始状态', {
            mouseStart: { x: startX, y: startY },
            elementStart: { x: startLeft, y: startTop }
        });
        
        let moveCount = 0;
        
        const handleMouseMove = (moveEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const deltaY = moveEvent.clientY - startY;
            
            // 限制在图像范围内
            const wrapperRect = this.imageWrapper.getBoundingClientRect();
            let newX = Math.max(0, Math.min(startLeft + deltaX, wrapperRect.width - element.width));
            let newY = Math.max(0, Math.min(startTop + deltaY, wrapperRect.height - element.height));
            
            // 更新位置但不保存历史（避免每次移动都保存）
            element.x = newX;
            element.y = newY;
            this.renderElement(element);
            
            moveCount++;
        };
        
        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            
            const finalDeltaX = element.x - startLeft;
            const finalDeltaY = element.y - startTop;
            
            debugLogger.checkpoint('拖拽结束', {
                elementId: element.id,
                startPosition: { x: startLeft, y: startTop },
                endPosition: { x: element.x, y: element.y },
                delta: { x: finalDeltaX, y: finalDeltaY },
                moveCount
            });
            
            // 拖拽结束后保存当前状态（用于重做）
            this.saveCurrentState();
            this.notifyElementChange();
            
            debugLogger.logAction('移动元素', {
                elementId: element.id,
                elementType: element.type,
                from: { x: startLeft, y: startTop },
                to: { x: element.x, y: element.y },
                distance: Math.sqrt(finalDeltaX * finalDeltaX + finalDeltaY * finalDeltaY).toFixed(2)
            });
            
            debugLogger.return('startDrag');
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }
    
    /**
     * 编辑矩形标签
     * @param {DrawingElement} element - 元素数据
     * @param {HTMLElement} labelElement - 标签DOM元素
     */
    editLabel(element, labelElement) {
        // 保存编辑前的状态
        this.pushHistory();
        
        const originalText = element.content || '';
        labelElement.contentEditable = 'true';
        labelElement.focus();
        
        // 选中所有文本
        const range = document.createRange();
        range.selectNodeContents(labelElement);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        
        const handleBlur = () => {
            labelElement.contentEditable = 'false';
            const newText = labelElement.textContent || originalText;
            
            // 只有文本真正改变时才保存
            if (newText !== originalText) {
                element.content = newText;
                this.saveCurrentState();
                this.notifyElementChange();
            }
            
            labelElement.removeEventListener('blur', handleBlur);
            labelElement.removeEventListener('keydown', handleKeyDown);
        };
        
        const handleKeyDown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                labelElement.blur();
            } else if (e.key === 'Escape') {
                labelElement.textContent = originalText;
                labelElement.blur();
            }
            e.stopPropagation();
        };
        
        labelElement.addEventListener('blur', handleBlur);
        labelElement.addEventListener('keydown', handleKeyDown);
    }

    
    /**
     * 选择元素
     * @param {string} id - 元素ID
     */
    selectElement(id) {
        // 取消之前的选择
        this.deselectAll();
        
        const element = this.elements.get(id);
        if (!element) return;
        
        this.selectedElement = id;
        
        // 添加选中样式 - 使用高亮发光效果
        const domElement = this.drawingElementsContainer.querySelector(`[data-element-id="${id}"]`);
        if (domElement) {
            domElement.classList.add('selected');
            domElement.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.8), 0 0 12px rgba(59, 130, 246, 0.6), 0 0 20px rgba(59, 130, 246, 0.4)';
            domElement.style.outline = 'none';
        }
        
        this.notifySelectionChange(element);
    }
    
    /**
     * 取消所有选择
     */
    deselectAll() {
        if (this.selectedElement) {
            const domElement = this.drawingElementsContainer?.querySelector(`[data-element-id="${this.selectedElement}"]`);
            if (domElement) {
                domElement.classList.remove('selected');
                domElement.style.boxShadow = 'none';
                domElement.style.outline = 'none';
            }
        }
        
        this.selectedElement = null;
        this.notifySelectionChange(null);
    }
    
    /**
     * 获取选中的元素
     * @returns {DrawingElement|null} 选中的元素
     */
    getSelectedElement() {
        if (!this.selectedElement) return null;
        return this.elements.get(this.selectedElement);
    }
    
    /**
     * 获取指定位置的元素
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     * @returns {DrawingElement|null} 元素
     */
    getElementAtPosition(x, y) {
        // 从后往前遍历（后添加的在上层）
        const elementsArray = Array.from(this.elements.values()).reverse();
        
        for (const element of elementsArray) {
            if (this.isPointInElement(x, y, element)) {
                return element;
            }
        }
        
        return null;
    }
    
    /**
     * 检查点是否在元素内
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     * @param {DrawingElement} element - 元素
     * @returns {boolean}
     */
    isPointInElement(x, y, element) {
        return x >= element.x && 
               x <= element.x + element.width && 
               y >= element.y && 
               y <= element.y + element.height;
    }
    
    /**
     * 加载图像
     * @param {string} imageData - 图像数据（URL或Base64）
     */
    loadImage(imageData) {
        const img = this.container.querySelector('#annotation-image');
        if (img) {
            img.src = imageData;
        }
    }
    
    /**
     * 设置图像包装器
     * @param {HTMLElement} wrapper - 图像包装器元素
     */
    setImageWrapper(wrapper) {
        // 先解绑旧的事件
        this.unbindEvents();
        
        this.imageWrapper = wrapper;
        this.drawingElementsContainer = wrapper.querySelector('#drawing-elements');
        
        if (!this.drawingElementsContainer) {
            this.drawingElementsContainer = document.createElement('div');
            this.drawingElementsContainer.id = 'drawing-elements';
            this.drawingElementsContainer.className = 'absolute inset-0';
            this.drawingElementsContainer.style.pointerEvents = 'none';
            wrapper.appendChild(this.drawingElementsContainer);
        }
        
        // 创建分割线容器
        this.dividerLinesContainer = wrapper.querySelector('#divider-lines');
        if (!this.dividerLinesContainer) {
            this.dividerLinesContainer = document.createElement('div');
            this.dividerLinesContainer.id = 'divider-lines';
            this.dividerLinesContainer.className = 'absolute inset-0';
            this.dividerLinesContainer.style.pointerEvents = 'none';
            this.dividerLinesContainer.style.zIndex = '10';
            wrapper.appendChild(this.dividerLinesContainer);
        }
        
        // 确保绑定函数已初始化
        if (!this._boundHandleMouseDown) {
            this._boundHandleMouseDown = this.handleMouseDown.bind(this);
            this._boundHandleMouseMove = this.handleMouseMove.bind(this);
            this._boundHandleMouseUp = this.handleMouseUp.bind(this);
            this._boundHandleClick = this.handleClick.bind(this);
            this._boundHandleKeyDown = this.handleKeyDown.bind(this);
        }
        
        this.bindEvents();
    }
    
    /**
     * 从数据加载元素（使用批量渲染优化）
     * @param {DrawingElement[]} elements - 元素数组
     */
    loadElements(elements) {
        // 设置加载标志，禁用变化通知
        this.isLoading = true;
        
        this.clearAllElements();
        
        if (!elements || !Array.isArray(elements)) {
            // 重新初始化历史记录
            this.initHistory();
            this.isLoading = false;
            return;
        }
        
        // 使用批量渲染优化大量元素
        const BATCH_SIZE = 20;
        
        if (elements.length > BATCH_SIZE && typeof performanceOptimizer !== 'undefined') {
            // 使用批量渲染
            this._batchLoadElements(elements);
        } else {
            // 直接渲染
            elements.forEach(element => {
                this.elements.set(element.id, element);
                this.renderElement(element);
                
                // 更新步骤计数器
                if (element.type === 'step' && element.stepNumber >= this.stepCounter) {
                    this.stepCounter = element.stepNumber + 1;
                }
            });
        }
        
        // 重新初始化历史记录（以当前加载的元素为初始状态）
        this.historyStack = [];
        this.historyIndex = -1;
        const initialState = {
            elements: JSON.parse(JSON.stringify(Array.from(this.elements.entries()))),
            stepCounter: this.stepCounter
        };
        this.historyStack.push(initialState);
        this.historyIndex = 0;
        this.notifyHistoryChange();
        
        // 恢复加载标志
        this.isLoading = false;
    }
    
    /**
     * 批量加载元素（性能优化）
     * @param {DrawingElement[]} elements - 元素数组
     * @private
     */
    _batchLoadElements(elements) {
        // 先将所有元素添加到Map
        elements.forEach(element => {
            this.elements.set(element.id, element);
            
            // 更新步骤计数器
            if (element.type === 'step' && element.stepNumber >= this.stepCounter) {
                this.stepCounter = element.stepNumber + 1;
            }
        });
        
        // 使用DocumentFragment批量渲染
        const fragment = document.createDocumentFragment();
        const tempContainer = document.createElement('div');
        
        elements.forEach(element => {
            let domElement;
            
            switch (element.type) {
                case 'rectangle':
                    domElement = this.createRectangleDom(element);
                    break;
                case 'text':
                    domElement = this.createTextDom(element);
                    break;
                case 'step':
                    domElement = this.createStepDom(element);
                    break;
                default:
                    return;
            }
            
            if (domElement) {
                domElement.dataset.elementId = element.id;
                fragment.appendChild(domElement);
            }
        });
        
        // 一次性添加所有元素
        if (this.drawingElementsContainer) {
            this.drawingElementsContainer.appendChild(fragment);
        }
    }
    
    /**
     * 导出元素数据
     * @returns {DrawingElement[]} 元素数组
     */
    exportElements() {
        return Array.from(this.elements.values());
    }

    syncDisplaySize(width, height) {
        const nextWidth = Number(width) || 0;
        const nextHeight = Number(height) || 0;
        if (!nextWidth || !nextHeight) return false;

        const prev = this.lastDisplaySize;
        if (!prev || !prev.width || !prev.height) {
            this.lastDisplaySize = { width: nextWidth, height: nextHeight };
            return false;
        }

        if (prev.width === nextWidth && prev.height === nextHeight) {
            return false;
        }

        const scaleX = nextWidth / prev.width;
        const scaleY = nextHeight / prev.height;
        if (!isFinite(scaleX) || !isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
            this.lastDisplaySize = { width: nextWidth, height: nextHeight };
            return false;
        }

        this.elements.forEach((element) => {
            if (!element) return;
            if (element.type === 'rectangle') {
                element.x = element.x * scaleX;
                element.y = element.y * scaleY;
                element.width = element.width * scaleX;
                element.height = element.height * scaleY;
            } else {
                element.x = element.x * scaleX;
                element.y = element.y * scaleY;
            }
        });

        this.dividerLines.forEach((dividerLine) => {
            if (!dividerLine) return;
            const scaledY = dividerLine.yPosition * scaleY;
            dividerLine.yPosition = Math.max(10, Math.min(scaledY, nextHeight - 10));
        });

        if (this.drawingElementsContainer) {
            this.drawingElementsContainer.innerHTML = '';
        }
        this.elements.forEach((element) => {
            this.renderElement(element);
        });

        if (this.dividerLinesContainer) {
            this.dividerLinesContainer.innerHTML = '';
        }
        this.dividerLines.forEach((dividerLine) => {
            this.renderDividerLine(dividerLine);
        });

        this.lastDisplaySize = { width: nextWidth, height: nextHeight };
        return true;
    }
    
    /**
     * 仅更新显示尺寸基准，不对元素坐标进行缩放。
     * 用于在切换项目时设置初始基准，避免后续 syncDisplaySize 以错误尺寸计算比例。
     * @param {number} width - 当前显示宽度
     * @param {number} height - 当前显示高度
     */
    setDisplaySize(width, height) {
        const w = Number(width) || 0;
        const h = Number(height) || 0;
        if (w && h) {
            this.lastDisplaySize = { width: w, height: h };
        }
    }
    
    /**
     * 设置元素变化回调
     * @param {Function} callback - 回调函数
     */
    onElementChange(callback) {
        this.onElementChangeCallback = callback;
    }
    
    /**
     * 设置选择变化回调
     * @param {Function} callback - 回调函数
     */
    onSelectionChange(callback) {
        this.onSelectionChangeCallback = callback;
    }
    
    /**
     * 通知元素变化（使用防抖优化）
     */
    notifyElementChange() {
        // 加载数据时不触发回调
        if (this.isLoading) return;
        this.debouncedNotifyChange();
    }
    
    /**
     * 立即通知元素变化
     * @private
     */
    _notifyElementChangeImmediate() {
        // 加载数据时不触发回调
        if (this.isLoading) return;
        if (this.onElementChangeCallback) {
            this.onElementChangeCallback(this.exportElements());
        }
    }
    
    /**
     * 通知选择变化
     * @param {DrawingElement|null} element - 选中的元素
     */
    notifySelectionChange(element) {
        if (this.onSelectionChangeCallback) {
            this.onSelectionChangeCallback(element);
        }
    }
    
    /**
     * 将十六进制颜色转换为RGBA
     * @param {string} hex - 十六进制颜色
     * @param {number} alpha - 透明度
     * @returns {string} RGBA颜色
     */
    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    
    /**
     * 重新绑定容器（用于页面切换时保留历史记录）
     * @param {HTMLElement} container - 新的容器元素
     */
    rebindContainer(container) {
        const currentElements = Array.from(this.elements.entries());
        const currentDividerLines = Array.from(this.dividerLines.entries());
        const currentStepCounter = this.stepCounter;
        const currentTool = this.currentTool;
        const currentColor = this.currentColor;
        const currentFontSize = this.currentFontSize;
        const currentFontFamily = this.currentFontFamily;

        this.container = container;

        const imageWrapper = container.querySelector('#image-wrapper');
        if (imageWrapper) {
            this.setImageWrapper(imageWrapper);
        }

        this.stepCounter = currentStepCounter;
        this.currentTool = currentTool;
        this.currentColor = currentColor;
        this.currentFontSize = currentFontSize;
        this.currentFontFamily = currentFontFamily;

        if (this.imageWrapper) {
            const w = this.imageWrapper.clientWidth;
            const h = this.imageWrapper.clientHeight;
            if (w && h) {
                this.lastDisplaySize = { width: w, height: h };
            }
        }

        this.elements.clear();
        currentElements.forEach(([id, element]) => {
            this.elements.set(id, element);
            this.renderElement(element);
        });

        this.dividerLines.clear();
        currentDividerLines.forEach(([id, dividerLine]) => {
            this.dividerLines.set(id, dividerLine);
            this.renderDividerLine(dividerLine);
        });

        this.setTool(currentTool);

        this.notifyHistoryChange();
    }
    
    /**
     * 销毁画布管理器
     */
    destroy() {
        // 取消任何待处理的渲染
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.unbindEvents();
        this.clearAllElements();
        this.clearAllDividerLines();
        this.imageWrapper = null;
        this.drawingElementsContainer = null;
        this.dividerLinesContainer = null;
    }
}

// 导出到全局作用域（浏览器环境）
if (typeof window !== 'undefined') {
    window.CanvasManager = CanvasManager;
    window.ToolType = ToolType;
}

// 导出到 Node.js 环境
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CanvasManager, ToolType };
}
