/**
 * 图像上传器类
 * 需求: 4.1, 4.2, 4.3, 4.9
 * 
 * 处理图像文件的上传，支持拖拽和点击选择
 * 包含错误处理、重试机制和进度显示
 */

class ImageUploader {
    /**
     * 支持的图像格式
     */
    static SUPPORTED_FORMATS = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/gif': '.gif',
        'image/webp': '.webp'
    };
    
    /**
     * 支持的扩展名（用于PSD/PSB检测）
     */
    static SUPPORTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.psd', '.psb'];
    
    /**
     * 最大文件大小（50MB，考虑PSD/PSB文件较大）
     */
    static MAX_FILE_SIZE = 50 * 1024 * 1024;
    
    /**
     * 大图像阈值（超过此尺寸进行优化）
     */
    static LARGE_IMAGE_THRESHOLD = 2000;
    
    /**
     * API端点
     */
    static API_ENDPOINT = '/api/upload/image';
    
    /**
     * 最大重试次数
     */
    static MAX_RETRIES = 3;
    
    /**
     * 重试延迟（毫秒）
     */
    static RETRY_DELAY = 1000;
    
    /**
     * 错误类型
     */
    static ERROR_TYPES = {
        VALIDATION: 'validation',
        NETWORK: 'network',
        SERVER: 'server',
        TIMEOUT: 'timeout',
        UNKNOWN: 'unknown'
    };
    
    /**
     * 构造函数
     * @param {HTMLElement} dropZone - 拖拽上传区域元素
     * @param {Object} options - 配置选项
     */
    constructor(dropZone, options = {}) {
        this.dropZone = dropZone;
        this.fileInput = options.fileInput || null;
        this.projectId = options.projectId || null;
        this.onUploadCallback = null;
        this.onProgressCallback = null;
        this.onErrorCallback = null;
        this.onRetryCallback = null;
        this.currentXhr = null;
        this.isUploading = false;
        
        this._init();
    }
    
    /**
     * 初始化上传器
     * @private
     */
    _init() {
        if (!this.dropZone) return;
        
        // 绑定拖拽事件
        this.dropZone.addEventListener('dragover', this._handleDragOver.bind(this));
        this.dropZone.addEventListener('dragleave', this._handleDragLeave.bind(this));
        this.dropZone.addEventListener('drop', this._handleDrop.bind(this));
        
        // 绑定点击事件
        this.dropZone.addEventListener('click', this._handleClick.bind(this));
        
        // 绑定文件输入事件
        if (this.fileInput) {
            this.fileInput.addEventListener('change', this._handleFileSelect.bind(this));
        }
    }

    
    /**
     * 处理拖拽悬停
     * @private
     * @param {DragEvent} e - 拖拽事件
     */
    _handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.add('border-primary', 'bg-primary/5');
    }
    
    /**
     * 处理拖拽离开
     * @private
     * @param {DragEvent} e - 拖拽事件
     */
    _handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.remove('border-primary', 'bg-primary/5');
    }
    
    /**
     * 处理文件放置
     * @private
     * @param {DragEvent} e - 拖拽事件
     */
    _handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dropZone.classList.remove('border-primary', 'bg-primary/5');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this._processFile(files[0]);
        }
    }
    
    /**
     * 处理点击上传
     * @private
     */
    _handleClick() {
        if (this.fileInput) {
            this.fileInput.click();
        }
    }
    
    /**
     * 处理文件选择
     * @private
     * @param {Event} e - 变更事件
     */
    _handleFileSelect(e) {
        const files = e.target.files;
        if (files.length > 0) {
            this._processFile(files[0]);
        }
        // 重置input以允许重复选择同一文件
        e.target.value = '';
    }
    
    /**
     * 处理文件
     * @private
     * @param {File} file - 文件对象
     */
    async _processFile(file) {
        // 防止重复上传
        if (this.isUploading) {
            this._triggerError('正在上传中，请稍候...', ImageUploader.ERROR_TYPES.VALIDATION);
            return;
        }
        
        // 验证文件
        const validation = this.validateImage(file);
        if (!validation.valid) {
            this._triggerError(validation.error, ImageUploader.ERROR_TYPES.VALIDATION);
            return;
        }
        
        // 上传到服务器（带重试机制）
        this.isUploading = true;
        try {
            const projectId = this.projectId;
            const result = await this.uploadWithRetry(file, projectId);
            if (result.success) {
                result.projectId = projectId;
                this._triggerUpload(result);
            } else {
                this._triggerError(result.message || '上传失败', ImageUploader.ERROR_TYPES.SERVER);
            }
        } catch (error) {
            this._triggerError(error.message || '网络错误，请重试', error.type || ImageUploader.ERROR_TYPES.UNKNOWN);
        } finally {
            this.isUploading = false;
        }
    }
    
    /**
     * 验证图像文件
     * @param {File} file - 文件对象
     * @returns {Object} 验证结果 {valid: boolean, error?: string}
     */
    validateImage(file) {
        if (!file) {
            return { valid: false, error: '请选择文件' };
        }
        
        // 检查文件类型
        const isValidMimeType = Object.keys(ImageUploader.SUPPORTED_FORMATS).includes(file.type);
        const fileName = file.name.toLowerCase();
        const isValidExtension = ImageUploader.SUPPORTED_EXTENSIONS.some(ext => fileName.endsWith(ext));
        
        if (!isValidMimeType && !isValidExtension) {
            return { 
                valid: false, 
                error: '不支持的文件格式。请上传 PNG, JPG, JPEG, GIF, WebP, PSD 或 PSB 文件。' 
            };
        }
        
        // 不限制文件大小
        return { valid: true };
    }

    
    /**
     * 上传文件到服务器
     * @param {File} file - 文件对象
     * @param {string} projectId - 项目ID
     * @returns {Promise<Object>} 上传结果
     */
    async uploadToServer(file, projectId) {
        const formData = new FormData();
        formData.append('file', file);
        if (projectId) {
            formData.append('projectId', projectId);
        }
        
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            this.currentXhr = xhr;
            
            // 进度事件
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    this._triggerProgress(percent, e.loaded, e.total);
                }
            });
            
            // 完成事件
            xhr.addEventListener('load', () => {
                this.currentXhr = null;
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        resolve(response);
                    } catch (e) {
                        const error = new Error('服务器响应格式错误');
                        error.type = ImageUploader.ERROR_TYPES.SERVER;
                        reject(error);
                    }
                } else {
                    try {
                        const errorResponse = JSON.parse(xhr.responseText);
                        const error = new Error(errorResponse.message || `上传失败 (${xhr.status})`);
                        error.type = ImageUploader.ERROR_TYPES.SERVER;
                        error.status = xhr.status;
                        reject(error);
                    } catch (e) {
                        const error = new Error(`上传失败 (${xhr.status})`);
                        error.type = ImageUploader.ERROR_TYPES.SERVER;
                        error.status = xhr.status;
                        reject(error);
                    }
                }
            });
            
            // 错误事件
            xhr.addEventListener('error', () => {
                this.currentXhr = null;
                const error = new Error('网络错误，请检查网络连接');
                error.type = ImageUploader.ERROR_TYPES.NETWORK;
                reject(error);
            });
            
            // 超时事件
            xhr.addEventListener('timeout', () => {
                this.currentXhr = null;
                const error = new Error('上传超时，请重试');
                error.type = ImageUploader.ERROR_TYPES.TIMEOUT;
                reject(error);
            });
            
            // 中止事件
            xhr.addEventListener('abort', () => {
                this.currentXhr = null;
                const error = new Error('上传已取消');
                error.type = ImageUploader.ERROR_TYPES.UNKNOWN;
                reject(error);
            });
            
            // 设置超时（5分钟，考虑大文件）
            xhr.timeout = 5 * 60 * 1000;
            
            // 发送请求
            xhr.open('POST', ImageUploader.API_ENDPOINT);
            xhr.send(formData);
        });
    }
    
    /**
     * 带重试机制的上传
     * @param {File} file - 文件对象
     * @param {string} projectId - 项目ID
     * @param {number} retryCount - 当前重试次数
     * @returns {Promise<Object>} 上传结果
     */
    async uploadWithRetry(file, projectId, retryCount = 0) {
        try {
            return await this.uploadToServer(file, projectId);
        } catch (error) {
            // 只对网络错误和超时进行重试
            const shouldRetry = (
                error.type === ImageUploader.ERROR_TYPES.NETWORK ||
                error.type === ImageUploader.ERROR_TYPES.TIMEOUT
            ) && retryCount < ImageUploader.MAX_RETRIES;
            
            if (shouldRetry) {
                const nextRetry = retryCount + 1;
                
                // 触发重试回调
                this._triggerRetry(nextRetry, ImageUploader.MAX_RETRIES, error.message);
                
                // 等待一段时间后重试
                await this._delay(ImageUploader.RETRY_DELAY * nextRetry);
                
                return this.uploadWithRetry(file, projectId, nextRetry);
            }
            
            throw error;
        }
    }
    
    /**
     * 延迟函数
     * @private
     * @param {number} ms - 延迟毫秒数
     * @returns {Promise<void>}
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * 取消当前上传
     */
    cancelUpload() {
        if (this.currentXhr) {
            this.currentXhr.abort();
            this.currentXhr = null;
            this.isUploading = false;
        }
    }
    
    /**
     * 设置图像上传回调
     * @param {Function} callback - 回调函数 (result) => void
     */
    onImageUpload(callback) {
        this.onUploadCallback = callback;
    }
    
    /**
     * 设置上传进度回调
     * @param {Function} callback - 回调函数 (percent, loaded, total) => void
     */
    onProgress(callback) {
        this.onProgressCallback = callback;
    }
    
    /**
     * 设置错误回调
     * @param {Function} callback - 回调函数 (error, errorType) => void
     */
    onError(callback) {
        this.onErrorCallback = callback;
    }
    
    /**
     * 设置重试回调
     * @param {Function} callback - 回调函数 (retryCount, maxRetries, errorMessage) => void
     */
    onRetry(callback) {
        this.onRetryCallback = callback;
    }
    
    /**
     * 设置项目ID
     * @param {string} projectId - 项目ID
     */
    setProjectId(projectId) {
        this.projectId = projectId;
    }
    
    /**
     * 触发上传完成回调
     * @private
     * @param {Object} result - 上传结果
     */
    _triggerUpload(result) {
        if (this.onUploadCallback) {
            this.onUploadCallback(result);
        }
    }
    
    /**
     * 触发进度回调
     * @private
     * @param {number} percent - 进度百分比
     * @param {number} loaded - 已上传字节数
     * @param {number} total - 总字节数
     */
    _triggerProgress(percent, loaded, total) {
        if (this.onProgressCallback) {
            this.onProgressCallback(percent, loaded, total);
        }
    }
    
    /**
     * 触发错误回调
     * @private
     * @param {string} error - 错误消息
     * @param {string} errorType - 错误类型
     */
    _triggerError(error, errorType = ImageUploader.ERROR_TYPES.UNKNOWN) {
        if (this.onErrorCallback) {
            this.onErrorCallback(error, errorType);
        } else {
            // 使用自定义模态对话框（如果可用）
            if (typeof modalDialog !== 'undefined') {
                modalDialog.alert(error);
            }
        }
    }
    
    /**
     * 触发重试回调
     * @private
     * @param {number} retryCount - 当前重试次数
     * @param {number} maxRetries - 最大重试次数
     * @param {string} errorMessage - 错误消息
     */
    _triggerRetry(retryCount, maxRetries, errorMessage) {
        if (this.onRetryCallback) {
            this.onRetryCallback(retryCount, maxRetries, errorMessage);
        }
    }
    
    /**
     * 销毁上传器
     */
    destroy() {
        if (this.dropZone) {
            this.dropZone.removeEventListener('dragover', this._handleDragOver);
            this.dropZone.removeEventListener('dragleave', this._handleDragLeave);
            this.dropZone.removeEventListener('drop', this._handleDrop);
            this.dropZone.removeEventListener('click', this._handleClick);
        }
        
        if (this.fileInput) {
            this.fileInput.removeEventListener('change', this._handleFileSelect);
        }
    }
}

// 导出到全局作用域（浏览器环境）
if (typeof window !== 'undefined') {
    window.ImageUploader = ImageUploader;
}

// 导出到 Node.js 环境
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageUploader;
}
