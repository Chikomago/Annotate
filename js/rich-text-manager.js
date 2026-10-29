/**
 * 富文本管理器 - RichTextManager
 * 管理富文本框的创建、同步和编辑
 * 需求: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7
 */

/**
 * 文本框数据结构
 * @typedef {Object} TextBox
 * @property {string} id - 唯一标识符
 * @property {string} regionId - 对应的图像区域ID
 * @property {string} content - HTML内容
 * @property {string} title - 区域标题
 * @property {number} height - 高度
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

class RichTextManager {
    // 每个文本框的最大字符数限制
    static MAX_CHARS = 1000;
    
    /**
     * 构造函数
     * @param {HTMLElement} container - 富文本容器元素
     */
    constructor(container) {
        this.container = container;
        this.textBoxes = new Map(); // 存储所有文本框
        this.regions = []; // 当前图像区域
        this.onContentChangeCallback = null;
        this.initialized = false;
        this.lastActiveEditor = null; // 最近聚焦的编辑器
        this.savedSelection = null; // 保存的选区
        this.isLoading = false; // 是否正在加载数据（用于禁用内容变化通知）
        
        this.init();
    }
    
    /**
     * 初始化富文本管理器
     */
    init() {
        if (!this.container) {
            return;
        }
        
        // 清空容器并创建文本框容器结构
        this.setupContainer();
        this.initialized = true;
    }
    
    /**
     * 设置容器结构
     */
    setupContainer() {
        // 创建文本框包装器
        this.textBoxWrapper = this.container.querySelector('#text-box-wrapper');
        if (!this.textBoxWrapper) {
            this.textBoxWrapper = document.createElement('div');
            this.textBoxWrapper.id = 'text-box-wrapper';
            this.textBoxWrapper.className = 'flex flex-col w-full h-full';
            
            // 清空现有内容并添加包装器
            const existingEditor = this.container.querySelector('#rich-text-editor');
            if (existingEditor) {
                existingEditor.remove();
            }
            
            // 直接添加到容器，不使用内部容器
            this.container.innerHTML = '';
            this.container.appendChild(this.textBoxWrapper);
        }
        
        // 初始化时创建一个默认文本框（无分割线时）
        this.createDefaultTextBox();
    }
    
    /**
     * 创建默认文本框（无分割线时使用）
     */
    createDefaultTextBox() {
        const defaultRegion = {
            id: 'region_0',
            index: 0,
            startY: 0,
            endY: 0,
            height: 0
        };
        
        this.createTextBox(defaultRegion, true);
    }

    
    /**
     * 根据图像区域同步文本框
     * 需求: 7.2, 7.3
     * @param {ImageRegion[]} regions - 图像区域数组
     * @param {boolean} skipSave - 是否跳过保存（用于图像加载前的临时同步）
     */
    syncWithRegions(regions, skipSave = false) {
        
        debugLogger.call('syncWithRegions', { regionCount: regions?.length, skipSave });
        debugLogger.checkpoint('syncWithRegions 开始前', { 
            currentTextBoxCount: this.textBoxes.size,
            isLoading: this.isLoading
        });
        
        // 如果需要跳过保存，设置加载标志
        const wasLoading = this.isLoading;
        if (skipSave) {
            this.isLoading = true;
            debugLogger.step('设置 isLoading = true（skipSave）');
        }
        
        if (!regions || !Array.isArray(regions)) {
            regions = [{
                id: 'region_0',
                index: 0,
                startY: 0,
                endY: 0,
                height: 0
            }];
            debugLogger.branch('是否有有效区域数据', false, { usingDefault: true });
        } else {
            debugLogger.branch('是否有有效区域数据', true, { regionCount: regions.length });
        }
        
        this.regions = regions;
        
        // 获取当前文本框的regionId列表
        const currentTextBoxIds = new Set();
        for (const textBox of this.textBoxes.values()) {
            currentTextBoxIds.add(textBox.id);
        }
        
        const newRegionIds = new Set(regions.map(r => r.id));
        const expectedTextBoxIds = new Set(regions.map(r => 'textbox_' + r.id));
        
        debugLogger.checkpoint('文本框和区域对比', {
            currentTextBoxIds: Array.from(currentTextBoxIds),
            newRegionIds: Array.from(newRegionIds),
            expectedTextBoxIds: Array.from(expectedTextBoxIds)
        });
        
        // 删除不再需要的文本框（regionId不在新区域列表中）
        let deletedCount = 0;
        for (const textBox of this.textBoxes.values()) {
            if (!newRegionIds.has(textBox.regionId)) {
                debugLogger.step(`删除文本框: ${textBox.id}`);
                this.removeTextBox(textBox.id);
                deletedCount++;
            }
        }
        if (deletedCount > 0) {
            debugLogger.checkpoint('删除文本框完成', { deletedCount });
        }
        
        // 创建或更新文本框
        let updatedCount = 0;
        let createdCount = 0;
        regions.forEach((region, index) => {
            const textBoxId = 'textbox_' + region.id;
            const existingTextBox = this.textBoxes.get(textBoxId);
            
            if (existingTextBox) {
                debugLogger.step(`更新文本框: ${textBoxId}`);
                debugLogger.checkpoint('更新前后对比', { 
                    id: textBoxId,
                    oldHeight: existingTextBox.height, 
                    newHeight: region.height,
                    heightChanged: existingTextBox.height !== region.height,
                    hasContent: !!existingTextBox.content
                });
                // 只更新高度，不重新渲染（保留内容）
                if (existingTextBox.height !== region.height) {
                    this.updateTextBoxHeight(existingTextBox.id, region.height);
                }
                // 更新区域索引
                existingTextBox.title = existingTextBox.title || `模块 ${region.index + 1}`;
                updatedCount++;
            } else {
                debugLogger.step(`创建新文本框: ${textBoxId}`);
                debugLogger.checkpoint('新文本框信息', { 
                    id: textBoxId, 
                    regionId: region.id,
                    height: region.height,
                    isFirst: index === 0 && this.textBoxes.size === 0
                });
                // 创建新文本框
                this.createTextBox(region, index === 0 && this.textBoxes.size === 0);
                createdCount++;
            }
        });
        
        
        debugLogger.checkpoint('文本框处理完成', { updatedCount, createdCount });
        
        // 重新排序文本框
        debugLogger.step('重新排序文本框');
        this.reorderTextBoxes();
        
        
        // 恢复加载标志
        if (skipSave) {
            this.isLoading = wasLoading;
            debugLogger.step(`恢复 isLoading = ${wasLoading}`);
        }
        
        debugLogger.checkpoint('syncWithRegions 完成', { 
            finalTextBoxCount: this.textBoxes.size,
            isLoading: this.isLoading
        });
        debugLogger.return('syncWithRegions');
    }
    
    /**
     * 创建文本框
     * @param {ImageRegion} region - 图像区域
     * @param {boolean} isFirst - 是否是第一个文本框
     * @returns {TextBox} 创建的文本框
     */
    createTextBox(region, isFirst = false) {
        const textBoxId = 'textbox_' + region.id;
        
        // 检查是否已存在
        if (this.textBoxes.has(textBoxId)) {
            return this.textBoxes.get(textBoxId);
        }
        
        const regionIndex = region.index !== undefined ? region.index + 1 : 1;
        
        const textBox = {
            id: textBoxId,
            regionId: region.id,
            content: '',
            title: `模块 ${regionIndex}`,
            height: region.height || 0
        };
        
        this.textBoxes.set(textBoxId, textBox);
        this.renderTextBox(textBox, isFirst);
        
        return textBox;
    }
    
    /**
     * 移除文本框
     * @param {string} textBoxId - 文本框ID
     * @returns {boolean} 是否成功移除
     */
    removeTextBox(textBoxId) {
        const textBox = this.textBoxes.get(textBoxId);
        if (!textBox) return false;
        
        // 移除DOM元素
        const domElement = this.textBoxWrapper?.querySelector(`[data-textbox-id="${textBoxId}"]`);
        if (domElement) {
            domElement.remove();
        }
        
        // 从Map中移除
        this.textBoxes.delete(textBoxId);
        
        return true;
    }
    
    /**
     * 根据区域ID获取文本框
     * @param {string} regionId - 区域ID
     * @returns {TextBox|undefined} 文本框
     */
    getTextBoxByRegionId(regionId) {
        for (const textBox of this.textBoxes.values()) {
            if (textBox.regionId === regionId) {
                return textBox;
            }
        }
        return undefined;
    }
    
    /**
     * 获取文本框
     * @param {string} textBoxId - 文本框ID
     * @returns {TextBox|undefined} 文本框数据
     */
    getTextBox(textBoxId) {
        return this.textBoxes.get(textBoxId);
    }
    
    /**
     * 获取所有文本框
     * @returns {TextBox[]} 所有文本框（按区域索引排序）
     */
    getAllTextBoxes() {
        const textBoxArray = Array.from(this.textBoxes.values());
        
        // 按区域索引排序
        return textBoxArray.sort((a, b) => {
            const regionA = this.regions.find(r => r.id === a.regionId);
            const regionB = this.regions.find(r => r.id === b.regionId);
            const indexA = regionA ? regionA.index : 0;
            const indexB = regionB ? regionB.index : 0;
            return indexA - indexB;
        });
    }
    
    /**
     * 更新文本框内容
     * @param {string} regionId - 区域ID
     * @param {string} content - HTML内容
     */
    updateTextBox(regionId, content) {
        const textBox = this.getTextBoxByRegionId(regionId);
        if (!textBox) return;
        
        textBox.content = content;
        this.notifyContentChange();
    }
    
    /**
     * 更新文本框高度
     * 需求: 7.4
     * @param {string} textBoxId - 文本框ID
     * @param {number} height - 新高度
     */
    updateTextBoxHeight(textBoxId, height) {
        debugLogger.call('updateTextBoxHeight', { textBoxId, height });
        
        const textBox = this.textBoxes.get(textBoxId);
        if (!textBox) {
            debugLogger.logError('updateTextBoxHeight - 文本框不存在', { textBoxId });
            debugLogger.return('updateTextBoxHeight', false);
            return;
        }
        
        debugLogger.checkpoint('更新高度前', { 
            textBoxId,
            oldHeight: textBox.height, 
            newHeight: height,
            heightChanged: textBox.height !== height
        });
        
        textBox.height = height;
        
        // 更新DOM元素高度
        const domElement = this.textBoxWrapper?.querySelector(`[data-textbox-id="${textBoxId}"]`);
        debugLogger.branch('DOM元素是否存在', !!domElement, { textBoxId });
        debugLogger.branch('高度是否有效', height > 0, { height });
        
        if (domElement && height > 0) {
            // 设置精确高度以匹配图像区域
            domElement.style.minHeight = height + 'px';
            domElement.style.height = height + 'px';
            
            debugLogger.checkpoint('DOM高度已更新', { textBoxId, height });
            
            // 更新编辑器高度 - 减去标签高度（约30px）
            const editor = domElement.querySelector('.text-box-editor');
            if (editor) {
                const editorHeight = Math.max(100, height - 30);
                editor.style.minHeight = editorHeight + 'px';
                editor.style.height = editorHeight + 'px';
                debugLogger.checkpoint('编辑器高度已更新', { textBoxId, editorHeight });
            } else {
                debugLogger.logError('编辑器元素不存在', { textBoxId });
            }
        } else {
            debugLogger.logError('无法更新DOM高度', { 
                textBoxId, 
                height,
                domExists: !!domElement,
                heightValid: height > 0
            });
        }
        
        // 只有在非加载状态下才通知内容变化（触发保存）
        debugLogger.branch('是否触发保存', !this.isLoading, { isLoading: this.isLoading });
        if (!this.isLoading) {
            this.notifyContentChange();
        }
        
        debugLogger.return('updateTextBoxHeight', true);
    }

    
    /**
     * 渲染文本框到DOM
     * @param {TextBox} textBox - 文本框数据
     * @param {boolean} isFirst - 是否是第一个文本框
     */
    renderTextBox(textBox, isFirst = false) {
        
        if (!this.textBoxWrapper) {
            return;
        }
        
        // 移除已存在的DOM元素
        const existingDom = this.textBoxWrapper.querySelector(`[data-textbox-id="${textBox.id}"]`);
        if (existingDom) {
            existingDom.remove();
        }
        
        const domElement = this.createTextBoxDom(textBox, isFirst);
        if (domElement) {
            this.textBoxWrapper.appendChild(domElement);
        } else {
        }
    }
    
    /**
     * 创建文本框DOM元素
     * @param {TextBox} textBox - 文本框数据
     * @param {boolean} isFirst - 是否是第一个文本框
     * @returns {HTMLElement} DOM元素
     */
    createTextBoxDom(textBox, isFirst = false) {
        const wrapper = document.createElement('div');
        wrapper.className = 'text-box-wrapper relative box-border overflow-hidden flex flex-col';
        wrapper.dataset.textboxId = textBox.id;
        wrapper.dataset.regionId = textBox.regionId;
        
        // 设置高度（如果有）- 不添加额外间距
        if (textBox.height > 0) {
            wrapper.style.minHeight = textBox.height + 'px';
            wrapper.style.height = textBox.height + 'px';
            wrapper.style.maxHeight = textBox.height + 'px';
        } else {
            wrapper.style.minHeight = '200px'; // 默认最小高度
        }
        
        // 添加分隔线（非第一个文本框）
        if (!isFirst) {
            const divider = document.createElement('div');
            divider.className = 'text-box-divider absolute left-0 right-0 top-0 z-10';
            wrapper.appendChild(divider);
        }
        
        // 添加字符计数器（右上角）
        const charCounter = document.createElement('div');
        charCounter.className = 'char-counter absolute top-1 right-2 text-xs text-gray-500 z-10';
        wrapper.appendChild(charCounter);
        
        // 区域标签（可编辑标题）
        const label = document.createElement('div');
        label.className = 'text-box-label flex items-center gap-2 px-2 py-1 flex-shrink-0';
        
        const region = this.regions.find(r => r.id === textBox.regionId);
        const regionIndex = region ? region.index + 1 : 1;
        const defaultTitle = textBox.title || `区域 ${regionIndex}`;
        
        label.innerHTML = `
            <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold">${regionIndex}</span>
            <input type="text" class="region-title-input workbench-title-focus text-sm font-medium text-gray-400 bg-transparent border-none outline-none" value="${this._escapeHtml(defaultTitle)}" placeholder="输入标题..." />
        `;
        wrapper.appendChild(label);
        
        // 绑定标题编辑事件
        const titleInput = label.querySelector('.region-title-input');
        if (titleInput) {
            titleInput.addEventListener('input', () => {
                textBox.title = titleInput.value;
                this.notifyContentChange();
            });
            titleInput.addEventListener('blur', () => {
                textBox.title = titleInput.value;
                this.notifyContentChange();
            });
        }
        
        
        // 普通文本编辑区域 - 使用flex-1填充剩余空间
        const editor = document.createElement('div');
        editor.className = 'text-box-editor workbench-editor-focus editor-content prose dark:prose-invert prose-blue max-w-none outline-none px-2 py-1 bg-transparent transition-colors flex-1 overflow-auto';
        editor.contentEditable = 'true';
        editor.dataset.placeholder = '在此输入区域 ' + regionIndex + ' 的文本说明...';
        
        
        editor.innerHTML = textBox.content || '';
        
        
        // 绑定编辑事件
        this.bindEditorEvents(editor, textBox);
        
        wrapper.appendChild(editor);
        
        // 初始化字符计数器显示
        const currentLength = this._getPlainTextLength(editor);
        this._updateCharCounterElement(charCounter, currentLength);
        
        return wrapper;
    }
    
    /**
     * HTML转义
     * @param {string} text - 原始文本
     * @returns {string} 转义后的文本
     * @private
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * 绑定编辑器事件
     * @param {HTMLElement} editor - 编辑器元素
     * @param {TextBox} textBox - 文本框数据
     */
    bindEditorEvents(editor, textBox) {
        
        // 内容变化事件（含字符限制检查）
        editor.addEventListener('input', () => {
            const plainText = this._getPlainTextLength(editor);
            if (plainText > RichTextManager.MAX_CHARS) {
                // 超出限制，截断内容
                this._truncateContent(editor, RichTextManager.MAX_CHARS);
            }
            this._updateCharCounter(editor, plainText);
            
            // 直接更新 Map 中的文本框对象
            const textBoxInMap = this.textBoxes.get(textBox.id);
            if (textBoxInMap) {
                textBoxInMap.content = editor.innerHTML;
            }
            
            this.notifyContentChange();
        });
        
        // 获得焦点时保存引用
        editor.addEventListener('focus', () => {
            this.lastActiveEditor = editor;
            // 不要清空内容！只有当内容是单个<br>时才清空
            if (editor.innerHTML === '<br>') {
                editor.innerHTML = '';
            }
        });
        
        // 失去焦点时保存内容和选区
        editor.addEventListener('blur', () => {
            
            // 直接更新 Map 中的文本框对象
            const textBoxInMap = this.textBoxes.get(textBox.id);
            if (textBoxInMap) {
                textBoxInMap.content = editor.innerHTML;
            }
            
            this.notifyContentChange();
            // 不要清空内容！只有当内容是单个<br>时才清空
            if (editor.innerHTML === '<br>') {
                editor.innerHTML = '';
            }
        });
        
        // 选区变化时保存选区并更新工具栏状态
        editor.addEventListener('mouseup', () => {
            this.saveSelection();
            this.updateToolbarState();
        });
        
        editor.addEventListener('keyup', () => {
            this.saveSelection();
            this.updateToolbarState();
        });
        
        // 粘贴事件处理 - 始终去除所有外部样式，只粘贴纯文本
        editor.addEventListener('paste', (e) => {
            // 允许粘贴图片
            const items = e.clipboardData?.items;
            if (items) {
                for (const item of items) {
                    if (item.type.indexOf('image') !== -1) {
                        e.preventDefault();
                        const blob = item.getAsFile();
                        this.insertImage(editor, blob);
                        return;
                    }
                }
            }
            
            // 始终阻止默认粘贴行为，确保去除所有外部样式
            e.preventDefault();
            e.stopPropagation();
            
            // 获取纯文本（优先使用text/plain，确保无任何格式）
            let clipboardText = e.clipboardData?.getData('text/plain') || '';
            if (!clipboardText) {
                // 如果没有纯文本，尝试从HTML中提取纯文本
                const htmlText = e.clipboardData?.getData('text/html') || '';
                if (htmlText) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = htmlText;
                    clipboardText = tempDiv.textContent || tempDiv.innerText || '';
                }
            }
            if (!clipboardText) return;
            
            // 检查粘贴后是否会超出字符限制
            const currentLength = this._getPlainTextLength(editor);
            
            if (currentLength + clipboardText.length > RichTextManager.MAX_CHARS) {
                // 只粘贴允许的字符数
                const allowedChars = RichTextManager.MAX_CHARS - currentLength;
                if (allowedChars > 0) {
                    document.execCommand('insertText', false, clipboardText.substring(0, allowedChars));
                }
                this._updateCharCounter(editor, RichTextManager.MAX_CHARS);
            } else {
                // 正常粘贴纯文本
                document.execCommand('insertText', false, clipboardText);
            }
        });
    }
    
    /**
     * 获取编辑器纯文本长度（不含HTML标签）
     * @param {HTMLElement} editor - 编辑器元素
     * @returns {number} 纯文本字符数
     * @private
     */
    _getPlainTextLength(editor) {
        return (editor.textContent || editor.innerText || '').length;
    }
    
    /**
     * 截断编辑器内容到指定字符数
     * @param {HTMLElement} editor - 编辑器元素
     * @param {number} maxChars - 最大字符数
     * @private
     */
    _truncateContent(editor, maxChars) {
        const text = editor.textContent || editor.innerText || '';
        if (text.length <= maxChars) return;
        
        // 保存光标位置
        const selection = window.getSelection();
        const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        
        // 简单截断：只保留纯文本的前maxChars个字符
        // 这会丢失格式，但能防止卡死
        editor.textContent = text.substring(0, maxChars);
        
        // 尝试恢复光标到末尾
        if (range) {
            const newRange = document.createRange();
            newRange.selectNodeContents(editor);
            newRange.collapse(false);
            selection.removeAllRanges();
            selection.addRange(newRange);
        }
    }
    
    /**
     * 更新字符计数器显示
     * @param {HTMLElement} editor - 编辑器元素
     * @param {number} currentLength - 当前字符数
     * @private
     */
    _updateCharCounter(editor, currentLength) {
        const wrapper = editor.closest('.text-box-wrapper');
        if (!wrapper) return;
        
        const counter = wrapper.querySelector('.char-counter');
        if (counter) {
            this._updateCharCounterElement(counter, currentLength);
        }
    }
    
    /**
     * 更新字符计数器元素
     * @param {HTMLElement} counter - 计数器元素
     * @param {number} currentLength - 当前字符数
     * @private
     */
    _updateCharCounterElement(counter, currentLength) {
        const remaining = RichTextManager.MAX_CHARS - currentLength;
        counter.textContent = `${currentLength}/${RichTextManager.MAX_CHARS}`;
        
        // 移除所有颜色类
        counter.classList.remove('text-red-500', 'text-yellow-500', 'text-gray-500');
        
        if (remaining <= 0) {
            counter.classList.add('text-red-500');
        } else if (remaining <= 100) {
            counter.classList.add('text-yellow-500');
        } else {
            counter.classList.add('text-gray-500');
        }
    }
    
    /**
     * 插入图片到编辑器
     * @param {HTMLElement} editor - 编辑器元素
     * @param {Blob} blob - 图片Blob
     */
    insertImage(editor, blob) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.className = 'rounded my-2 cursor-pointer hover:ring-2 hover:ring-primary';
            
            // 图片加载完成后设置默认50%大小
            img.onload = () => {
                const originalWidth = img.naturalWidth;
                const originalHeight = img.naturalHeight;
                const defaultWidth = Math.round(originalWidth * 0.5);
                const defaultHeight = Math.round(originalHeight * 0.5);
                
                img.style.width = defaultWidth + 'px';
                img.style.height = defaultHeight + 'px';
                img.style.maxWidth = 'none';
                img.setAttribute('width', defaultWidth);
                img.setAttribute('height', defaultHeight);
                
                // 触发内容变化
                editor.dispatchEvent(new Event('input'));
            };
            
            // 点击打开调整大小弹窗
            img.addEventListener('click', (event) => {
                event.stopPropagation();
                this.showImageResizer(img, editor);
            });
            
            // 插入到光标位置
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.insertNode(img);
                range.collapse(false);
            } else {
                editor.appendChild(img);
            }
        };
        reader.readAsDataURL(blob);
    }
    
    /**
     * 显示图片调整大小弹窗
     * @param {HTMLImageElement} img - 图片元素
     * @param {HTMLElement} editor - 编辑器元素
     */
    showImageResizer(img, editor) {
        // 移除已存在的弹窗
        const existingModal = document.querySelector('.image-resizer-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // 获取当前图片尺寸
        const currentWidth = img.width || img.naturalWidth;
        const currentHeight = img.height || img.naturalHeight;
        const originalWidth = img.naturalWidth;
        const originalHeight = img.naturalHeight;
        const aspectRatio = originalWidth / originalHeight;
        
        // 创建弹窗
        const modal = document.createElement('div');
        modal.className = 'image-resizer-modal fixed inset-0 bg-black/50 flex items-center justify-center z-[200]';
        modal.innerHTML = `
            <div class="bg-[#1c2127] rounded-xl shadow-2xl w-[320px] p-4">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-white font-medium text-sm">调整图片大小</h3>
                    <button class="close-btn text-gray-400 hover:text-white">
                        <span class="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>
                <div class="space-y-3">
                    <div class="flex items-center gap-2">
                        <label class="text-gray-400 text-xs w-12">宽度:</label>
                        <input type="number" id="img-width" class="flex-1 bg-[#283039] text-white text-sm px-3 py-2 rounded border border-[#3b4754] focus:border-primary outline-none" value="${currentWidth}" min="10" max="2000">
                        <span class="text-gray-400 text-xs">px</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <label class="text-gray-400 text-xs w-12">高度:</label>
                        <input type="number" id="img-height" class="flex-1 bg-[#283039] text-white text-sm px-3 py-2 rounded border border-[#3b4754] focus:border-primary outline-none" value="${currentHeight}" min="10" max="2000">
                        <span class="text-gray-400 text-xs">px</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <input type="checkbox" id="keep-ratio" class="rounded" checked>
                        <label for="keep-ratio" class="text-gray-400 text-xs">保持宽高比</label>
                    </div>
                    <div class="flex gap-2 mt-4">
                        <button class="preset-btn flex-1 py-1.5 text-xs bg-[#283039] text-gray-300 rounded hover:bg-[#3b4754]" data-percent="25">25%</button>
                        <button class="preset-btn flex-1 py-1.5 text-xs bg-[#283039] text-gray-300 rounded hover:bg-[#3b4754]" data-percent="50">50%</button>
                        <button class="preset-btn flex-1 py-1.5 text-xs bg-[#283039] text-gray-300 rounded hover:bg-[#3b4754]" data-percent="75">75%</button>
                        <button class="preset-btn flex-1 py-1.5 text-xs bg-[#283039] text-gray-300 rounded hover:bg-[#3b4754]" data-percent="100">100%</button>
                    </div>
                </div>
                <div class="flex gap-2 mt-4">
                    <button class="cancel-btn flex-1 py-2 bg-[#283039] text-white text-sm rounded hover:bg-[#3b4754]">取消</button>
                    <button class="apply-btn flex-1 py-2 bg-primary text-white text-sm rounded hover:bg-primary/90">应用</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const widthInput = modal.querySelector('#img-width');
        const heightInput = modal.querySelector('#img-height');
        const keepRatioCheckbox = modal.querySelector('#keep-ratio');
        
        // 宽度变化时同步高度
        widthInput.addEventListener('input', () => {
            if (keepRatioCheckbox.checked) {
                const newWidth = parseInt(widthInput.value) || originalWidth;
                heightInput.value = Math.round(newWidth / aspectRatio);
            }
        });
        
        // 高度变化时同步宽度
        heightInput.addEventListener('input', () => {
            if (keepRatioCheckbox.checked) {
                const newHeight = parseInt(heightInput.value) || originalHeight;
                widthInput.value = Math.round(newHeight * aspectRatio);
            }
        });
        
        // 预设按钮
        modal.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const percent = parseInt(btn.dataset.percent) / 100;
                widthInput.value = Math.round(originalWidth * percent);
                heightInput.value = Math.round(originalHeight * percent);
            });
        });
        
        // 关闭按钮
        const closeModal = () => modal.remove();
        modal.querySelector('.close-btn').addEventListener('click', closeModal);
        modal.querySelector('.cancel-btn').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        
        // 应用按钮
        modal.querySelector('.apply-btn').addEventListener('click', () => {
            const newWidth = parseInt(widthInput.value);
            const newHeight = parseInt(heightInput.value);
            
            if (newWidth > 0 && newHeight > 0) {
                img.style.width = newWidth + 'px';
                img.style.height = newHeight + 'px';
                img.style.maxWidth = 'none';
                img.setAttribute('width', newWidth);
                img.setAttribute('height', newHeight);
                
                // 触发内容变化
                if (editor) {
                    editor.dispatchEvent(new Event('input'));
                }
            }
            closeModal();
        });
    }
    
    /**
     * 重新排序文本框
     */
    reorderTextBoxes() {
        
        if (!this.textBoxWrapper) return;
        
        const sortedTextBoxes = this.getAllTextBoxes();
        
        
        // 按顺序重新添加DOM元素
        sortedTextBoxes.forEach((textBox, index) => {
            const domElement = this.textBoxWrapper.querySelector(`[data-textbox-id="${textBox.id}"]`);
            if (domElement) {
                // 检查DOM中的编辑器内容
                const editor = domElement.querySelector('.text-box-editor');
                
                this.textBoxWrapper.appendChild(domElement);
                
                // 更新区域标签（保留用户自定义标题）
                const label = domElement.querySelector('.text-box-label');
                if (label) {
                    const regionIndex = index + 1;
                    const titleInput = label.querySelector('.region-title-input');
                    const currentTitle = titleInput ? titleInput.value : textBox.title;
                    
                    // 更新序号圆圈
                    const indexSpan = label.querySelector('span:first-child');
                    if (indexSpan) {
                        indexSpan.textContent = regionIndex;
                    }
                }
                
                // 更新分隔线显示
                const divider = domElement.querySelector('.text-box-divider');
                if (index === 0 && divider) {
                    divider.remove();
                } else if (index > 0 && !divider) {
                    const newDivider = document.createElement('div');
                    newDivider.className = 'text-box-divider absolute left-0 right-0 top-0 z-10';
                    domElement.insertBefore(newDivider, domElement.firstChild);
                }
                
                // 再次验证内容
                const editorAfter = domElement.querySelector('.text-box-editor');
            }
        });
        
    }

    
    /**
     * 应用文本格式到指定区域
     * 需求: 8.1, 8.2, 8.3
     * @param {string} regionId - 区域ID
     * @param {string} format - 格式类型 ('bold', 'italic', 'underline', 'h1', 'h2', 'ul', 'ol')
     * @returns {boolean} 是否成功应用格式
     */
    applyFormat(regionId, format) {
        const textBox = this.getTextBoxByRegionId(regionId);
        if (!textBox) return false;
        
        const editor = this.textBoxWrapper?.querySelector(`[data-textbox-id="${textBox.id}"] .text-box-editor`);
        if (!editor) return false;
        
        // 确保编辑器获得焦点
        editor.focus();
        this.lastActiveEditor = editor;
        
        // 应用格式
        let success = false;
        switch (format) {
            case 'bold':
                success = document.execCommand('bold', false, null);
                break;
            case 'italic':
                success = document.execCommand('italic', false, null);
                break;
            case 'underline':
                success = document.execCommand('underline', false, null);
                break;
            case 'h1':
                success = document.execCommand('formatBlock', false, 'h1');
                break;
            case 'h2':
                success = document.execCommand('formatBlock', false, 'h2');
                break;
            case 'ul':
                success = document.execCommand('insertUnorderedList', false, null);
                break;
            case 'ol':
                success = document.execCommand('insertOrderedList', false, null);
                break;
            default:
                return false;
        }
        
        // 更新内容
        textBox.content = editor.innerHTML;
        this.notifyContentChange();
        
        // 更新工具栏状态
        this.updateToolbarState();
        
        return success;
    }
    
    /**
     * 应用格式到当前焦点的编辑器
     * 需求: 8.1, 8.2, 8.3
     * @param {string} format - 格式类型 ('bold', 'italic', 'underline', 'ul', 'ol')
     * @returns {boolean} 是否成功应用格式
     */
    applyFormatToActive(format) {
        let activeEditor = this.getActiveEditor();
        if (!activeEditor) {
            return false;
        }
        
        // 确保编辑器获得焦点
        activeEditor.focus();
        
        // 恢复之前保存的选区
        if (this.savedSelection) {
            try {
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(this.savedSelection);
            } catch (e) {
                // 选区恢复失败，创建新选区
            }
        }
        
        // 如果没有选区，将光标放在编辑器末尾
        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) {
            // 确保光标在编辑器内
            const range = document.createRange();
            if (activeEditor.lastChild) {
                range.selectNodeContents(activeEditor);
                range.collapse(false);
            } else {
                range.setStart(activeEditor, 0);
                range.collapse(true);
            }
            selection.removeAllRanges();
            selection.addRange(range);
        }
        
        // 应用格式
        let success = false;
        switch (format) {
            case 'bold':
                success = document.execCommand('bold', false, null);
                break;
            case 'italic':
                success = document.execCommand('italic', false, null);
                break;
            case 'underline':
                success = document.execCommand('underline', false, null);
                break;
            case 'ul':
                // 无序列表 - 使用自定义实现添加序号
                success = this.applyListFormat(activeEditor, 'ul');
                break;
            case 'ol':
                // 有序列表 - 使用自定义实现添加序号
                success = this.applyListFormat(activeEditor, 'ol');
                break;
            default:
                return false;
        }
        
        // 更新对应文本框的内容
        const wrapper = activeEditor.closest('[data-textbox-id]');
        if (wrapper) {
            const textBoxId = wrapper.dataset.textboxId;
            const textBox = this.textBoxes.get(textBoxId);
            if (textBox) {
                textBox.content = activeEditor.innerHTML;
                this.notifyContentChange();
            }
        }
        
        // 保存新的选区
        this.saveSelection();
        
        // 更新工具栏状态
        this.updateToolbarState();
        
        return success;
    }
    
    /**
     * 应用列表格式（给每行添加序号，保留原有格式）
     * @param {HTMLElement} editor - 编辑器元素
     * @param {string} listType - 列表类型 ('ul' 或 'ol')
     * @returns {boolean} 是否成功
     */
    applyListFormat(editor, listType) {
        const html = editor.innerHTML;
        if (!html.trim()) return false;
        
        // 将HTML按行分割，保留每行的HTML格式
        const htmlLines = this._splitHtmlIntoLines(html);
        
        if (htmlLines.length === 0) return false;
        
        // 检查是否已经有序号前缀（检查纯文本）
        const hasPrefix = htmlLines.some(line => {
            const text = this._stripHtmlTags(line).trim();
            return /^(\d+[\.\、\)]|•|\-)\s/.test(text);
        });
        
        // 处理每一行
        const resultLines = [];
        let lineNumber = 1;
        
        for (let i = 0; i < htmlLines.length; i++) {
            let lineHtml = htmlLines[i];
            const plainText = this._stripHtmlTags(lineHtml).trim();
            
            // 空行保持原样
            if (!plainText) {
                resultLines.push(lineHtml);
                continue;
            }
            
            if (hasPrefix) {
                // 移除已有的序号前缀
                lineHtml = this._removeListPrefix(lineHtml);
                resultLines.push(lineHtml);
            } else {
                // 添加序号前缀
                const prefix = listType === 'ol' ? `${lineNumber}. ` : '• ';
                lineHtml = this._addPrefixToLine(lineHtml, prefix);
                resultLines.push(lineHtml);
                lineNumber++;
            }
        }
        
        // 重新组合为HTML，使用<div>包裹每行
        editor.innerHTML = resultLines.map(line => `<div>${line || '<br>'}</div>`).join('');
        
        return true;
    }
    
    /**
     * 将HTML内容按行分割，保留每行的HTML格式
     * @param {string} html - HTML内容
     * @returns {string[]} HTML行数组
     * @private
     */
    _splitHtmlIntoLines(html) {
        // 标准化换行标记
        let content = html;
        
        // 将<br>替换为特殊标记
        content = content.replace(/<br\s*\/?>/gi, '{{LINE_BREAK}}');
        
        // 将</div><div>替换为换行标记
        content = content.replace(/<\/div>\s*<div[^>]*>/gi, '{{LINE_BREAK}}');
        
        // 将</p><p>替换为换行标记
        content = content.replace(/<\/p>\s*<p[^>]*>/gi, '{{LINE_BREAK}}');
        
        // 移除开头和结尾的div/p标签
        content = content.replace(/^<(div|p)[^>]*>/gi, '');
        content = content.replace(/<\/(div|p)>$/gi, '');
        
        // 处理剩余的单独div/p标签
        content = content.replace(/<(div|p)[^>]*>/gi, '{{LINE_BREAK}}');
        content = content.replace(/<\/(div|p)>/gi, '');
        
        // 按换行标记分割
        const lines = content.split('{{LINE_BREAK}}');
        
        // 过滤并返回
        return lines.map(line => line.trim());
    }
    
    /**
     * 移除HTML标签，只保留纯文本
     * @param {string} html - HTML内容
     * @returns {string} 纯文本
     * @private
     */
    _stripHtmlTags(html) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        return tempDiv.textContent || tempDiv.innerText || '';
    }
    
    /**
     * 移除行首的列表前缀
     * @param {string} lineHtml - 行HTML
     * @returns {string} 移除前缀后的HTML
     * @private
     */
    _removeListPrefix(lineHtml) {
        // 找到第一个文本节点并移除前缀
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = lineHtml;
        
        const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null, false);
        const firstTextNode = walker.nextNode();
        
        if (firstTextNode) {
            firstTextNode.textContent = firstTextNode.textContent.replace(/^(\s*)(\d+[\.\、\)]|•|\-)\s*/, '$1');
        }
        
        return tempDiv.innerHTML;
    }
    
    /**
     * 在行首添加前缀，保留HTML格式
     * @param {string} lineHtml - 行HTML
     * @param {string} prefix - 前缀
     * @returns {string} 添加前缀后的HTML
     * @private
     */
    _addPrefixToLine(lineHtml, prefix) {
        // 如果行是空的或只有空白，直接返回前缀
        const plainText = this._stripHtmlTags(lineHtml).trim();
        if (!plainText) {
            return prefix;
        }
        
        // 找到第一个文本节点并在其前面添加前缀
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = lineHtml;
        
        const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null, false);
        const firstTextNode = walker.nextNode();
        
        if (firstTextNode) {
            // 保留行首空格
            const leadingSpaces = firstTextNode.textContent.match(/^(\s*)/)[1];
            const restContent = firstTextNode.textContent.trimStart();
            firstTextNode.textContent = leadingSpaces + prefix + restContent;
        } else {
            // 没有文本节点，在开头插入前缀
            tempDiv.insertBefore(document.createTextNode(prefix), tempDiv.firstChild);
        }
        
        return tempDiv.innerHTML;
    }
    
    /**
     * 应用字体大小到当前选区
     * @param {number} size - 字体大小（像素）
     * @returns {boolean} 是否成功
     */
    applyFontSize(size) {
        let activeEditor = this.getActiveEditor();
        if (!activeEditor) {
            return false;
        }
        
        // 确保编辑器获得焦点
        activeEditor.focus();
        
        // 恢复之前保存的选区
        if (this.savedSelection) {
            try {
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(this.savedSelection);
            } catch (e) {
            }
        }
        
        const selection = window.getSelection();
        if (!selection.rangeCount) {
            return false;
        }
        
        // 如果有选中文本，包装在span中设置字体大小
        if (!selection.isCollapsed) {
            const range = selection.getRangeAt(0);
            const span = document.createElement('span');
            span.style.fontSize = size + 'px';
            
            try {
                range.surroundContents(span);
            } catch (e) {
                // 如果surroundContents失败（跨越多个元素），使用execCommand
                document.execCommand('fontSize', false, '7');
                // 找到所有font标签并替换为span
                const fonts = activeEditor.querySelectorAll('font[size="7"]');
                fonts.forEach(font => {
                    const newSpan = document.createElement('span');
                    newSpan.style.fontSize = size + 'px';
                    newSpan.innerHTML = font.innerHTML;
                    font.parentNode.replaceChild(newSpan, font);
                });
            }
        }
        
        // 更新对应文本框的内容
        const wrapper = activeEditor.closest('[data-textbox-id]');
        if (wrapper) {
            const textBoxId = wrapper.dataset.textboxId;
            const textBox = this.textBoxes.get(textBoxId);
            if (textBox) {
                textBox.content = activeEditor.innerHTML;
                this.notifyContentChange();
            }
        }
        
        this.saveSelection();
        return true;
    }
    
    /**
     * 应用字体颜色到当前选区
     * @param {string} color - 颜色值（HEX格式）
     * @returns {boolean} 是否成功
     */
    applyFontColor(color) {
        let activeEditor = this.getActiveEditor();
        if (!activeEditor) {
            return false;
        }
        
        // 确保编辑器获得焦点
        activeEditor.focus();
        
        // 恢复之前保存的选区
        if (this.savedSelection) {
            try {
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(this.savedSelection);
            } catch (e) {
            }
        }
        
        const selection = window.getSelection();
        if (!selection.rangeCount) {
            return false;
        }
        
        // 对选中文本使用span包裹设置颜色，确保只影响选中的字符
        if (!selection.isCollapsed) {
            const range = selection.getRangeAt(0);
            const span = document.createElement('span');
            span.style.color = color;
            
            try {
                range.surroundContents(span);
            } catch (e) {
                // 如果surroundContents失败（选区跨越多个元素），使用execCommand作为回退
                document.execCommand('foreColor', false, color);
            }
        } else {
            // 没有选中文本时，使用execCommand设置颜色（影响后续输入）
            document.execCommand('foreColor', false, color);
        }
        
        // 更新对应文本框的内容
        const wrapper = activeEditor.closest('[data-textbox-id]');
        if (wrapper) {
            const textBoxId = wrapper.dataset.textboxId;
            const textBox = this.textBoxes.get(textBoxId);
            if (textBox) {
                textBox.content = activeEditor.innerHTML;
                this.notifyContentChange();
            }
        }
        
        this.saveSelection();
        return true;
    }
    
    /**
     * 获取当前活动的编辑器
     * @returns {HTMLElement|null} 活动的编辑器元素
     */
    getActiveEditor() {
        // 首先检查当前焦点元素
        const activeElement = document.activeElement;
        if (activeElement && activeElement.classList.contains('text-box-editor')) {
            this.lastActiveEditor = activeElement;
            return activeElement;
        }
        
        // 检查选区是否在某个编辑器内
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const container = range.commonAncestorContainer;
            const editor = container.nodeType === Node.ELEMENT_NODE 
                ? container.closest('.text-box-editor')
                : container.parentElement?.closest('.text-box-editor');
            if (editor) {
                this.lastActiveEditor = editor;
                return editor;
            }
        }
        
        // 返回最近聚焦的编辑器
        if (this.lastActiveEditor && document.body.contains(this.lastActiveEditor)) {
            return this.lastActiveEditor;
        }
        
        // 查找第一个编辑器作为回退
        const editors = this.textBoxWrapper?.querySelectorAll('.text-box-editor');
        if (editors && editors.length > 0) {
            this.lastActiveEditor = editors[0];
            return editors[0];
        }
        
        return null;
    }
    
    /**
     * 保存当前选区
     */
    saveSelection() {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            this.savedSelection = selection.getRangeAt(0).cloneRange();
        }
    }
    
    /**
     * 恢复保存的选区
     */
    restoreSelection() {
        if (this.savedSelection) {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(this.savedSelection);
        }
    }
    
    /**
     * 检查当前选区是否应用了指定格式
     * @param {string} format - 格式类型
     * @returns {boolean} 是否应用了该格式
     */
    isFormatActive(format) {
        switch (format) {
            case 'bold':
                return document.queryCommandState('bold');
            case 'italic':
                return document.queryCommandState('italic');
            case 'underline':
                return document.queryCommandState('underline');
            case 'ul':
                return document.queryCommandState('insertUnorderedList');
            case 'ol':
                return document.queryCommandState('insertOrderedList');
            default:
                return false;
        }
    }
    
    /**
     * 更新工具栏按钮状态
     * 需求: 8.5
     */
    updateToolbarState() {
        const formatButtons = document.querySelectorAll('.rich-format-btn');
        
        formatButtons.forEach(btn => {
            const format = btn.dataset.format;
            if (format) {
                const isActive = this.isFormatActive(format);
                if (isActive) {
                    btn.classList.add('bg-[#283039]', 'text-white');
                    btn.classList.remove('text-[#9dabb9]');
                } else {
                    btn.classList.remove('bg-[#283039]', 'text-white');
                    btn.classList.add('text-[#9dabb9]');
                }
            }
        });
    }
    
    /**
     * 设置内容变化回调
     * @param {Function} callback - 回调函数
     */
    onContentChange(callback) {
        this.onContentChangeCallback = callback;
    }
    
    /**
     * 通知内容变化
     */
    notifyContentChange() {
        // 加载数据时不触发回调
        if (this.isLoading) {
            return;
        }
        
        
        // 在通知前，从 DOM 同步最新内容到 Map
        this.syncContentFromDOM();
        
        if (this.onContentChangeCallback) {
            const textBoxes = this.getAllTextBoxes();
            this.onContentChangeCallback(textBoxes);
        }
        
        // 更新文本框选择器
        this.updateTextboxSelectorDisplay();
    }
    
    /**
     * 更新文本框选择器显示
     */
    updateTextboxSelectorDisplay() {
        const textboxSelector = document.getElementById('textbox-selector');
        if (!textboxSelector) return;
        
        const textBoxes = this.getAllTextBoxes();
        
        // 清空现有选项（保留第一个默认选项）
        textboxSelector.innerHTML = '<option value="">选择模块</option>';
        
        // 添加文本框选项
        textBoxes.forEach((textBox, index) => {
            const option = document.createElement('option');
            option.value = textBox.id;
            option.textContent = textBox.title || `区域 ${index + 1}`;
            textboxSelector.appendChild(option);
        });
    }
    
    /**
     * 滚动到指定文本框
     * @param {string} textboxId - 文本框ID
     */
    scrollToTextBox(textboxId) {
        const textBox = this.textBoxes.get(textboxId);
        if (!textBox) return;
        
        const domElement = this.textBoxWrapper?.querySelector(`[data-textbox-id="${textboxId}"]`);
        if (domElement) {
            // 滚动到文本框位置
            domElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // 聚焦到编辑器
            const editor = domElement.querySelector('.text-box-editor');
            if (editor) {
                setTimeout(() => {
                    editor.focus();
                    this.lastActiveEditor = editor;
                }, 300);
            }
        }
    }
    
    /**
     * 从数据加载文本框
     * @param {TextBox[]} textBoxes - 文本框数组
     */
    loadTextBoxes(textBoxes) {
        if (!textBoxes || !Array.isArray(textBoxes)) {
            return;
        }
        
        // 设置加载标志，禁用内容变化通知
        this.isLoading = true;
        
        // 清空现有文本框
        this.clearAllTextBoxes();
        
        // 加载文本框数据
        textBoxes.forEach((textBox, index) => {
            // 确保内容被正确保存到Map中
            const textBoxCopy = {
                id: textBox.id,
                regionId: textBox.regionId,
                content: textBox.content || '',
                title: textBox.title || '',
                height: textBox.height || 0
            };
            
            
            this.textBoxes.set(textBoxCopy.id, textBoxCopy);
            this.renderTextBox(textBoxCopy, index === 0);
            
            // 验证Map中的数据
            const verifyTextBox = this.textBoxes.get(textBoxCopy.id);
        });
        
        
        // 恢复加载标志
        this.isLoading = false;
    }
    
    /**
     * 导出文本框数据
     * @returns {TextBox[]} 文本框数组
     */
    exportTextBoxes() {
        
        // 在导出前，从 DOM 同步所有文本框的最新内容
        this.syncContentFromDOM();
        
        const textBoxes = this.getAllTextBoxes();
        
        
        return textBoxes;
    }
    
    /**
     * 从 DOM 同步所有文本框的内容到 Map
     * 确保在保存前获取最新的编辑器内容
     */
    syncContentFromDOM() {
        
        if (!this.textBoxWrapper) {
            return;
        }
        
        let syncedCount = 0;
        
        // 遍历所有文本框
        for (const [textBoxId, textBox] of this.textBoxes.entries()) {
            const domElement = this.textBoxWrapper.querySelector(`[data-textbox-id="${textBoxId}"]`);
            if (domElement) {
                const editor = domElement.querySelector('.text-box-editor');
                if (editor) {
                    const currentContent = editor.innerHTML;
                    
                    // 更新 Map 中的内容
                    textBox.content = currentContent;
                    syncedCount++;
                }
            }
        }
        
    }
    
    /**
     * 清除所有文本框
     */
    clearAllTextBoxes() {
        this.textBoxes.clear();
        if (this.textBoxWrapper) {
            this.textBoxWrapper.innerHTML = '';
        }
    }
    
    /**
     * 重新绑定容器（用于页面切换时保留状态）
     * @param {HTMLElement} container - 新的容器元素
     */
    rebindContainer(container) {
        // 保存当前状态
        const currentTextBoxes = Array.from(this.textBoxes.entries());
        const currentRegions = [...this.regions];
        
        // 更新容器引用
        this.container = container;
        
        // 重新查找文本框包装器
        this.textBoxWrapper = container.querySelector('#text-box-wrapper');
        if (!this.textBoxWrapper) {
            this.textBoxWrapper = document.createElement('div');
            this.textBoxWrapper.id = 'text-box-wrapper';
            this.textBoxWrapper.className = 'flex flex-col w-full h-full';
            container.innerHTML = '';
            container.appendChild(this.textBoxWrapper);
        }
        
        // 恢复区域数据
        this.regions = currentRegions;
        
        // 重新渲染所有文本框
        this.textBoxes.clear();
        this.textBoxWrapper.innerHTML = '';
        
        currentTextBoxes.forEach(([id, textBox], index) => {
            this.textBoxes.set(id, textBox);
            this.renderTextBox(textBox, index === 0);
        });
        
        // 更新文本框选择器显示
        this.updateTextboxSelectorDisplay();
    }
    
    /**
     * 获取文本框数量
     * @returns {number} 文本框数量
     */
    getTextBoxCount() {
        return this.textBoxes.size;
    }
    
    /**
     * 销毁富文本管理器
     */
    destroy() {
        this.clearAllTextBoxes();
        this.textBoxWrapper = null;
        this.container = null;
        this.regions = [];
        this.initialized = false;
        this.lastActiveEditor = null;
        this.savedSelection = null;
    }
}

// 导出到全局作用域（浏览器环境）
if (typeof window !== 'undefined') {
    window.RichTextManager = RichTextManager;
}

// 导出到 Node.js 环境
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RichTextManager };
}
