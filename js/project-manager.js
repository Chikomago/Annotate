/**
 * 项目管理器
 * 管理标注项目的创建、加载和保存
 * 需求: 3.1, 3.4
 * 
 * 使用 IndexedDB 存储大型图像数据，LocalStorage 存储项目元数据
 */

class ProjectManager {
    constructor() {
        this.storageKey = 'projects';
        this.apiBaseUrl = '/api/projects';
        this.dbName = 'AnnotateDB';
        this.dbVersion = 2;
        this.imageStoreName = 'images';
        this.deepSceneStoreName = 'deepScenes';
        this.db = null;
        this._initIndexedDB();
    }
    
    /**
     * 初始化 IndexedDB
     * @private
     */
    _initIndexedDB() {
        if (!window.indexedDB) {
            this._dbReady = Promise.resolve(false);
            return;
        }
        
        this._dbReady = new Promise((resolve) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = (event) => {
                resolve(false);
            };
            request.onblocked = () => resolve(false);
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                this._dbReady = Promise.resolve(true);
                resolve(true);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.imageStoreName)) {
                    db.createObjectStore(this.imageStoreName, { keyPath: 'projectId' });
                }
                if (!db.objectStoreNames.contains(this.deepSceneStoreName)) {
                    db.createObjectStore(this.deepSceneStoreName, { keyPath: 'projectId' });
                }
            };
        });
    }
    
    /**
     * 等待 IndexedDB 就绪
     * @returns {Promise<boolean>}
     */
    async waitForDB() {
        if (!this._dbReady) return false;
        return Promise.race([
            this._dbReady,
            new Promise(resolve => setTimeout(() => resolve(false), 5000))
        ]);
    }

    async saveRichImage(blob) {
        if (!await this.waitForDB() || !this.db) return null;
        const id = `rich_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        return new Promise(resolve => {
            try {
                const tx = this.db.transaction([this.imageStoreName], 'readwrite');
                tx.objectStore(this.imageStoreName).put({ projectId: id, blob });
                tx.oncomplete = () => resolve(id);
                tx.onerror = () => resolve(null);
                tx.onabort = () => resolve(null);
            } catch (_) { resolve(null); }
        });
    }

    async loadRichImage(id) {
        if (!await this.waitForDB() || !this.db) return null;
        return new Promise(resolve => {
            try {
                const request = this.db.transaction([this.imageStoreName], 'readonly')
                    .objectStore(this.imageStoreName).get(id);
                request.onsuccess = () => resolve(request.result?.blob || null);
                request.onerror = () => resolve(null);
            } catch (_) { resolve(null); }
        });
    }

    /** Deep canvas scenes include image data and live in IndexedDB. */
    async saveDeepScene(projectId, scene) {
        if (!await this.waitForDB() || !this.db) return false;
        return new Promise(resolve => {
            try {
                const transaction = this.db.transaction([this.deepSceneStoreName], 'readwrite');
                transaction.objectStore(this.deepSceneStoreName).put({ projectId, scene });
                transaction.oncomplete = () => resolve(true);
                transaction.onerror = () => resolve(false);
                transaction.onabort = () => resolve(false);
            } catch (_) { resolve(false); }
        });
    }

    async loadDeepScene(projectId) {
        if (!await this.waitForDB() || !this.db) return null;
        return new Promise(resolve => {
            try {
                const request = this.db.transaction([this.deepSceneStoreName], 'readonly')
                    .objectStore(this.deepSceneStoreName).get(projectId);
                request.onsuccess = () => resolve(request.result?.scene || null);
                request.onerror = () => resolve(null);
            } catch (_) { resolve(null); }
        });
    }

    async deleteDeepScene(projectId) {
        if (!await this.waitForDB() || !this.db) return false;
        return new Promise(resolve => {
            try {
                const transaction = this.db.transaction([this.deepSceneStoreName], 'readwrite');
                transaction.objectStore(this.deepSceneStoreName).delete(projectId);
                transaction.oncomplete = () => resolve(true);
                transaction.onerror = () => resolve(false);
                transaction.onabort = () => resolve(false);
            } catch (_) { resolve(false); }
        });
    }
    
    /**
     * 保存图像到 IndexedDB
     * @param {string} projectId - 项目ID
     * @param {string} imageData - Base64图像数据
     * @returns {Promise<boolean>}
     * @private
     */
    async _saveImageToIndexedDB(projectId, imageData) {
        await this.waitForDB();
        
        if (!this.db) {
            return false;
        }
        
        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction([this.imageStoreName], 'readwrite');
                const store = transaction.objectStore(this.imageStoreName);
                store.put({ projectId, imageData });
                transaction.oncomplete = () => resolve(true);
                transaction.onerror = () => resolve(false);
                transaction.onabort = () => resolve(false);
            } catch (e) {
                resolve(false);
            }
        });
    }
    
    /**
     * 从 IndexedDB 加载图像
     * @param {string} projectId - 项目ID
     * @returns {Promise<string|null>}
     * @private
     */
    async _loadImageFromIndexedDB(projectId) {
        await this.waitForDB();
        
        if (!this.db) return null;
        
        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction([this.imageStoreName], 'readonly');
                const store = transaction.objectStore(this.imageStoreName);
                const request = store.get(projectId);
                
                request.onsuccess = () => {
                    resolve(request.result?.imageData || null);
                };
                request.onerror = () => {
                    resolve(null);
                };
            } catch (e) {
                resolve(null);
            }
        });
    }
    
    /**
     * 从 IndexedDB 删除图像
     * @param {string} projectId - 项目ID
     * @returns {Promise<boolean>}
     * @private
     */
    async _deleteImageFromIndexedDB(projectId) {
        await this.waitForDB();
        
        if (!this.db) {
            return false;
        }
        
        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction([this.imageStoreName], 'readwrite');
                const store = transaction.objectStore(this.imageStoreName);
                const request = store.delete(projectId);
                
                request.onsuccess = () => resolve(true);
                request.onerror = () => resolve(false);
            } catch (e) {
                resolve(false);
            }
        });
    }

    /**
     * 生成唯一项目ID
     * @returns {string} 项目ID
     * @private
     */
    _generateId() {
        return 'project_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * 创建新项目
     * @param {string} name - 项目名称
     * @returns {Object} 创建的项目对象
     */
    createProject(name = '新项目', mode = 'pim') {
        const now = new Date().toISOString();
        const project = {
            id: this._generateId(),
            name: name,
            mode: mode === 'deep' ? 'deep' : 'pim',
            imageData: null,
            drawingElements: [],
            dividerLines: [],
            textBoxes: [],
            createdAt: now,
            updatedAt: now
        };

        // 保存到LocalStorage
        this.saveProject(project);

        return project;
    }

    /**
     * 保存项目元数据。带图像的同步调用只在 LocalStorage 能容纳时才成功。
     * @param {Object} project - 项目对象
     * @returns {boolean} 是否保存成功
     */
    saveProject(project) {
        if (!project || !project.id) {
            return false;
        }

        try {
            // 更新时间戳
            project.updatedAt = new Date().toISOString();

            // 获取现有项目
            const projects = this._getProjectsFromStorage();
            
            const projectToSave = { ...project };
            if (projectToSave.textBoxes) {
                projectToSave.textBoxes = projectToSave.textBoxes.map(box => ({
                    ...box,
                    content: (box.content || '').replace(/<img\b[^>]*>/gi, tag =>
                        /data-annotate-image-id=["'][^"']+["']/i.test(tag)
                            ? tag.replace(/\s+src=["']blob:[^"']*["']/i, '')
                            : tag)
                }));
            }
            if (projectToSave.imageData) projectToSave.imageInIndexedDB = false;

            // 更新或添加项目
            projects[project.id] = projectToSave;

            // 保存回LocalStorage
            localStorage.setItem(this.storageKey, JSON.stringify(projects));

            return true;
        } catch (e) {
            console.error('项目保存失败:', e);
            return false;
        }
    }

    /** Only publish the IndexedDB pointer after the image transaction commits. */
    async saveProjectWithImage(project) {
        if (!project?.id || !project.imageData) return false;
        if (project.imageOnServer) {
            return this.saveProject({ ...project, imageData: null, imageInIndexedDB: false });
        }
        const saved = await this._saveImageToIndexedDB(project.id, project.imageData);
        if (saved) {
            return this.saveProject({ ...project, imageData: null, imageInIndexedDB: true });
        }
        return this.saveProject({ ...project, imageInIndexedDB: false });
    }
    
    /**
     * 仅保存项目元数据（不包含图像）
     * @param {Object} project - 项目对象
     * @returns {boolean}
     * @private
     */
    _saveProjectMetadataOnly(project) {
        try {
            const projects = this._getProjectsFromStorage();
            const projectToSave = { ...project };
            projectToSave.imageData = null;
            projectToSave.imageInIndexedDB = !!project.imageInIndexedDB;
            
            projects[project.id] = projectToSave;
            localStorage.setItem(this.storageKey, JSON.stringify(projects));
            
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * 从LocalStorage加载项目（图像数据从IndexedDB加载）
     * @param {string} projectId - 项目ID
     * @returns {Object|null} 项目对象或null
     */
    loadProject(projectId) {
        if (!projectId) {
            return null;
        }

        try {
            const projects = this._getProjectsFromStorage();
            const project = projects[projectId] || null;
            
            if (project) {
                // 确保项目有名称
                if (!project.name) {
                    project.name = '新项目';
                }
                
                // 如果项目存在且图像在 IndexedDB 中，异步加载图像
                if (project.imageInIndexedDB && this.db) {
                    // 返回项目，图像将通过 loadProjectWithImage 异步加载
                    return project;
                }
            }
            
            return project;
        } catch (e) {
            return null;
        }
    }
    
    /**
     * 加载项目及其图像数据（异步）
     * @param {string} projectId - 项目ID
     * @returns {Promise<Object|null>} 项目对象或null
     */
    async loadProjectWithImage(projectId) {
        const project = this.loadProject(projectId);
        if (!project) return null;

        if (project.imageOnServer) {
            try {
                const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/image`, { cache: 'no-store' });
                if (response.ok) {
                    const blob = await response.blob();
                    project.imageData = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = () => reject(reader.error);
                        reader.readAsDataURL(blob);
                    });
                    return project;
                }
            } catch (_) {
                // Older projects can still have an IndexedDB copy.
            }
        }
        
        // 如果图像在 IndexedDB 中，加载它
        if (project.imageInIndexedDB) {
            // 等待 IndexedDB 初始化完成
            const dbReady = await this.waitForDB();
            
            if (dbReady && this.db) {
                const imageData = await this._loadImageFromIndexedDB(projectId);
                if (imageData) {
                    project.imageData = imageData;
                }
            }
        }
        
        return project;
    }

    /**
     * 获取所有项目列表
     * @returns {Array} 项目数组（按更新时间降序排列）
     */
    listProjects() {
        try {
            const projects = this._getProjectsFromStorage();
            const projectList = Object.values(projects);

            // 按更新时间降序排序
            projectList.sort((a, b) => {
                return new Date(b.updatedAt) - new Date(a.updatedAt);
            });

            return projectList;
        } catch (e) {
            return [];
        }
    }

    /**
     * 删除项目
     * @param {string} projectId - 项目ID
     * @returns {boolean} 是否删除成功
     */
    deleteProject(projectId) {
        if (!projectId) {
            return false;
        }

        try {
            const projects = this._getProjectsFromStorage();

            if (!projects[projectId]) {
                return false;
            }

            const imageOnServer = projects[projectId].imageOnServer;
            delete projects[projectId];
            localStorage.setItem(this.storageKey, JSON.stringify(projects));
            
            // 同时删除 IndexedDB 中的图像
            this._deleteImageFromIndexedDB(projectId);
            this.deleteDeepScene(projectId);
            if (imageOnServer) {
                fetch(`/api/projects/${encodeURIComponent(projectId)}/image`, { method: 'DELETE' }).catch(() => {});
            }
            
            // 同时删除历史记录
            this.clearProjectHistory(projectId);

            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * 更新项目名称
     * @param {string} projectId - 项目ID
     * @param {string} newName - 新名称
     * @returns {boolean} 是否更新成功
     */
    updateProjectName(projectId, newName) {
        const project = this.loadProject(projectId);
        if (!project) {
            return false;
        }

        project.name = newName;
        return this.saveProject(project);
    }

    /**
     * 更新项目图像数据
     * @param {string} projectId - 项目ID
     * @param {string} imageData - Base64编码的图像数据
     * @returns {boolean} 是否更新成功
     */
    updateProjectImage(projectId, imageData) {
        const project = this.loadProject(projectId);
        if (!project) {
            return false;
        }

        project.imageData = imageData;
        return this.saveProject(project);
    }

    /**
     * 更新项目绘制元素
     * @param {string} projectId - 项目ID
     * @param {Array} drawingElements - 绘制元素数组
     * @returns {boolean} 是否更新成功
     */
    updateDrawingElements(projectId, drawingElements) {
        const project = this.loadProject(projectId);
        if (!project) {
            return false;
        }

        project.drawingElements = drawingElements;
        return this.saveProject(project);
    }

    /**
     * 更新项目分割线
     * @param {string} projectId - 项目ID
     * @param {Array} dividerLines - 分割线数组
     * @returns {boolean} 是否更新成功
     */
    updateDividerLines(projectId, dividerLines) {
        const project = this.loadProject(projectId);
        if (!project) {
            return false;
        }

        project.dividerLines = dividerLines;
        return this.saveProject(project);
    }

    /**
     * 更新项目文本框
     * @param {string} projectId - 项目ID
     * @param {Array} textBoxes - 文本框数组
     * @returns {boolean} 是否更新成功
     */
    updateTextBoxes(projectId, textBoxes) {
        const project = this.loadProject(projectId);
        if (!project) {
            return false;
        }

        project.textBoxes = textBoxes;
        return this.saveProject(project);
    }

    /**
     * 从LocalStorage获取所有项目
     * @returns {Object} 项目对象映射
     * @private
     */
    _getProjectsFromStorage() {
        const data = localStorage.getItem(this.storageKey);
        if (!data) {
            return {};
        }

        try {
            return JSON.parse(data);
        } catch (e) {
            return {};
        }
    }
    
    /**
     * 保存项目快照到历史记录
     * @param {string} projectId - 项目ID
     * @param {string} saveType - 保存类型 ('manual' | 'auto')
     * @returns {boolean} 是否保存成功
     */
    saveProjectSnapshot(projectId, saveType = 'manual') {
        if (!projectId) return false;
        
        try {
            const project = this.loadProject(projectId);
            if (!project) return false;
            
            const historyKey = `project_history_${projectId}`;
            const historyData = localStorage.getItem(historyKey);
            let history = [];
            
            if (historyData) {
                try {
                    history = JSON.parse(historyData);
                } catch (e) {
                    history = [];
                }
            }
            
            // 创建快照（不包含图像数据，太大了）
            const snapshot = {
                id: 'snapshot_' + Date.now(),
                timestamp: new Date().toISOString(),
                saveType: saveType,
                data: {
                    drawingElements: project.drawingElements || [],
                    dividerLines: project.dividerLines || [],
                    textBoxes: project.textBoxes || []
                }
            };
            
            // 添加到历史记录
            history.unshift(snapshot);
            
            // 限制历史记录数量（最多保留20条）
            if (history.length > 20) {
                history = history.slice(0, 20);
            }
            
            localStorage.setItem(historyKey, JSON.stringify(history));
            return true;
        } catch (e) {
            return false;
        }
    }
    
    /**
     * 获取项目历史记录
     * @param {string} projectId - 项目ID
     * @returns {Array} 历史记录数组
     */
    getProjectHistory(projectId) {
        if (!projectId) return [];
        
        try {
            const historyKey = `project_history_${projectId}`;
            const historyData = localStorage.getItem(historyKey);
            
            if (historyData) {
                return JSON.parse(historyData);
            }
            return [];
        } catch (e) {
            return [];
        }
    }
    
    /**
     * 恢复项目到指定快照
     * @param {string} projectId - 项目ID
     * @param {string} snapshotId - 快照ID
     * @returns {Object|null} 恢复的数据或null
     */
    restoreProjectSnapshot(projectId, snapshotId) {
        if (!projectId || !snapshotId) return null;
        
        try {
            const history = this.getProjectHistory(projectId);
            const snapshot = history.find(s => s.id === snapshotId);
            
            if (!snapshot) {
                return null;
            }
            
            // 加载当前项目
            const project = this.loadProject(projectId);
            if (!project) return null;
            
            // 恢复数据
            project.drawingElements = snapshot.data.drawingElements || [];
            project.dividerLines = snapshot.data.dividerLines || [];
            project.textBoxes = snapshot.data.textBoxes || [];
            
            // 保存恢复后的项目
            this.saveProject(project);
            
            return snapshot.data;
        } catch (e) {
            return null;
        }
    }
    
    /**
     * 清除项目历史记录
     * @param {string} projectId - 项目ID
     * @returns {boolean} 是否清除成功
     */
    clearProjectHistory(projectId) {
        if (!projectId) return false;
        
        try {
            const historyKey = `project_history_${projectId}`;
            localStorage.removeItem(historyKey);
            return true;
        } catch (e) {
            return false;
        }
    }
    
    /**
     * 删除单条项目快照
     * @param {string} projectId - 项目ID
     * @param {string} snapshotId - 快照ID
     * @returns {boolean} 是否删除成功
     */
    deleteProjectSnapshot(projectId, snapshotId) {
        if (!projectId || !snapshotId) return false;
        
        try {
            const historyKey = `project_history_${projectId}`;
            const historyData = localStorage.getItem(historyKey);
            
            if (!historyData) return false;
            
            let history = JSON.parse(historyData);
            history = history.filter(item => item.id !== snapshotId);
            
            localStorage.setItem(historyKey, JSON.stringify(history));
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * 同步项目到后端（可选）
     * @param {Object} project - 项目对象
     * @returns {Promise<boolean>} 是否同步成功
     */
    async syncToServer(project) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/${project.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ project })
            });

            const result = await response.json();
            return result.success;
        } catch (e) {
            return false;
        }
    }

    /**
     * 从后端加载项目（可选）
     * @param {string} projectId - 项目ID
     * @returns {Promise<Object|null>} 项目对象或null
     */
    async loadFromServer(projectId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/${projectId}`, {
            });

            const result = await response.json();
            if (result.project) {
                // 同时保存到LocalStorage
                this.saveProject(result.project);
                return result.project;
            }
            return null;
        } catch (e) {
            return null;
        }
    }
}

// 创建全局实例
const projectManager = new ProjectManager();

// 导出到全局作用域（浏览器环境）
if (typeof window !== 'undefined') {
    window.ProjectManager = ProjectManager;
}

// 导出到 Node.js 环境
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProjectManager;
}
