/**
 * 数据序列化器 - DataSerializer
 * 处理项目数据的序列化和反序列化
 * 需求: 11.3, 11.4, 11.5, 11.6
 */

class DataSerializer {
    /**
     * 序列化绘制元素
     * 需求: 11.3 - 保存绘制元素的位置、大小和样式
     * @param {Array} elements - 绘制元素数组
     * @returns {Array} 序列化后的元素数组
     */
    static serializeDrawingElements(elements) {
        if (!elements || !Array.isArray(elements)) {
            return [];
        }
        
        return elements.map(element => ({
            id: element.id,
            type: element.type,
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
            style: {
                color: element.style?.color || '#137fec',
                fontSize: element.style?.fontSize || 14,
                fontFamily: element.style?.fontFamily || '微软雅黑',
                fontWeight: element.style?.fontWeight || 'normal',
                borderWidth: element.style?.borderWidth || 2
            },
            content: element.content || '',
            stepNumber: element.stepNumber || null
        }));
    }
    
    /**
     * 反序列化绘制元素
     * @param {Array} data - 序列化的元素数据
     * @returns {Array} 绘制元素数组
     */
    static deserializeDrawingElements(data) {
        if (!data || !Array.isArray(data)) {
            return [];
        }
        
        return data.map(item => ({
            id: item.id,
            type: item.type,
            x: Number(item.x) || 0,
            y: Number(item.y) || 0,
            width: Number(item.width) || 0,
            height: Number(item.height) || 0,
            style: {
                color: item.style?.color || '#137fec',
                fontSize: Number(item.style?.fontSize) || 14,
                fontFamily: item.style?.fontFamily || '微软雅黑',
                fontWeight: item.style?.fontWeight || 'normal',
                borderWidth: Number(item.style?.borderWidth) || 2
            },
            content: item.content || '',
            stepNumber: item.stepNumber ? Number(item.stepNumber) : null
        }));
    }
    
    /**
     * 序列化分割线
     * 需求: 11.4 - 保存分割线的位置
     * @param {Array} dividerLines - 分割线数组
     * @returns {Array} 序列化后的分割线数组
     */
    static serializeDividerLines(dividerLines) {
        if (!dividerLines || !Array.isArray(dividerLines)) {
            return [];
        }
        
        return dividerLines.map(line => ({
            id: line.id,
            yPosition: line.yPosition,
            isDragging: false // 保存时重置拖拽状态
        }));
    }
    
    /**
     * 反序列化分割线
     * @param {Array} data - 序列化的分割线数据
     * @returns {Array} 分割线数组
     */
    static deserializeDividerLines(data) {
        if (!data || !Array.isArray(data)) {
            return [];
        }
        
        return data.map(item => ({
            id: item.id,
            yPosition: Number(item.yPosition) || 0,
            isDragging: false
        }));
    }
    
    /**
     * 序列化插入图片框
     * 需求: 13.14 - 保存插入图片框的Y坐标位置、图片数据和尺寸信息
    /**
     * 序列化富文本框
     * 需求: 11.5 - 保存富文本框的内容和格式
     * @param {Array} textBoxes - 文本框数组
     * @returns {Array} 序列化后的文本框数组
     */
    static serializeTextBoxes(textBoxes) {
        if (!textBoxes || !Array.isArray(textBoxes)) {
            return [];
        }
        
        return textBoxes.map(box => ({
            id: box.id,
            regionId: box.regionId,
            content: box.content || '',
            title: box.title || '',
            height: box.height || 0
        }));
    }
    
    /**
     * 反序列化富文本框
     * @param {Array} data - 序列化的文本框数据
     * @returns {Array} 文本框数组
     */
    static deserializeTextBoxes(data) {
        if (!data || !Array.isArray(data)) {
            return [];
        }
        
        return data.map(item => ({
            id: item.id,
            regionId: item.regionId,
            content: item.content || '',
            title: item.title || '',
            height: Number(item.height) || 0
        }));
    }
    
    /**
     * 序列化图像数据
     * 需求: 11.6 - 保存上传的图像数据
     * @param {Object} imageInfo - 图像信息
     * @returns {Object} 序列化后的图像信息
     */
    static serializeImageData(imageInfo) {
        if (!imageInfo) {
            return null;
        }
        
        return {
            imageData: imageInfo.imageData || null,
            imageUrl: imageInfo.imageUrl || null,
            imageWidth: Number(imageInfo.imageWidth) || 0,
            imageHeight: Number(imageInfo.imageHeight) || 0,
            originalFormat: imageInfo.originalFormat || null
        };
    }
    
    /**
     * 反序列化图像数据
     * @param {Object} data - 序列化的图像数据
     * @returns {Object} 图像信息
     */
    static deserializeImageData(data) {
        if (!data) {
            return null;
        }
        
        return {
            imageData: data.imageData || null,
            imageUrl: data.imageUrl || null,
            imageWidth: Number(data.imageWidth) || 0,
            imageHeight: Number(data.imageHeight) || 0,
            originalFormat: data.originalFormat || null
        };
    }
    
    /**
     * 序列化完整项目数据
     * @param {Object} project - 项目对象
     * @returns {Object} 序列化后的项目数据
     */
    static serializeProject(project) {
        if (!project) {
            return null;
        }
        
        return {
            id: project.id,
            name: project.name,
            imageData: project.imageData || null,
            imageWidth: project.imageWidth || 0,
            imageHeight: project.imageHeight || 0,
            originalFormat: project.originalFormat || null,
            drawingElements: this.serializeDrawingElements(project.drawingElements),
            dividerLines: this.serializeDividerLines(project.dividerLines),
            textBoxes: this.serializeTextBoxes(project.textBoxes),
            createdAt: project.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }
    
    /**
     * 反序列化完整项目数据
     * @param {Object} data - 序列化的项目数据
     * @returns {Object} 项目对象
     */
    static deserializeProject(data) {
        if (!data) {
            return null;
        }
        
        return {
            id: data.id,
            name: data.name,
            imageData: data.imageData || null,
            imageWidth: Number(data.imageWidth) || 0,
            imageHeight: Number(data.imageHeight) || 0,
            originalFormat: data.originalFormat || null,
            drawingElements: this.deserializeDrawingElements(data.drawingElements),
            dividerLines: this.deserializeDividerLines(data.dividerLines),
            textBoxes: this.deserializeTextBoxes(data.textBoxes),
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt || new Date().toISOString()
        };
    }
    
    /**
     * 验证项目数据完整性
     * @param {Object} project - 项目对象
     * @returns {Object} 验证结果 { valid: boolean, errors: string[] }
     */
    static validateProject(project) {
        const errors = [];
        
        if (!project) {
            return { valid: false, errors: ['项目数据为空'] };
        }
        
        if (!project.id) {
            errors.push('缺少项目ID');
        }
        
        if (!project.name) {
            errors.push('缺少项目名称');
        }
        
        // 验证绘制元素
        if (project.drawingElements && Array.isArray(project.drawingElements)) {
            project.drawingElements.forEach((element, index) => {
                if (!element.id) {
                    errors.push(`绘制元素 ${index} 缺少ID`);
                }
                if (!element.type) {
                    errors.push(`绘制元素 ${index} 缺少类型`);
                }
            });
        }
        
        // 验证分割线
        if (project.dividerLines && Array.isArray(project.dividerLines)) {
            project.dividerLines.forEach((line, index) => {
                if (!line.id) {
                    errors.push(`分割线 ${index} 缺少ID`);
                }
                if (typeof line.yPosition !== 'number') {
                    errors.push(`分割线 ${index} 缺少有效的Y位置`);
                }
            });
        }
        
        // 验证文本框
        if (project.textBoxes && Array.isArray(project.textBoxes)) {
            project.textBoxes.forEach((box, index) => {
                if (!box.id) {
                    errors.push(`文本框 ${index} 缺少ID`);
                }
                if (!box.regionId) {
                    errors.push(`文本框 ${index} 缺少区域ID`);
                }
            });
        }
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    }
    
    /**
     * 计算项目数据大小（字节）
     * @param {Object} project - 项目对象
     * @returns {number} 数据大小（字节）
     */
    static calculateDataSize(project) {
        try {
            const json = JSON.stringify(project);
            return new Blob([json]).size;
        } catch (e) {
            return 0;
        }
    }
    
    /**
     * 格式化数据大小显示
     * @param {number} bytes - 字节数
     * @returns {string} 格式化后的大小字符串
     */
    static formatDataSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const units = ['B', 'KB', 'MB', 'GB'];
        const k = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
    }
}

// 导出到全局作用域（浏览器环境）
if (typeof window !== 'undefined') {
    window.DataSerializer = DataSerializer;
}

// 导出到 Node.js 环境
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DataSerializer };
}
