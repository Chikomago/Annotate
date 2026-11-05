/**
 * 图像标注系统 - 主应用入口
 * 需求: 3.1, 3.2, 3.3, 3.4
 */

// 检查必需的类是否已加载
(function checkDependencies() {
    const requiredClasses = [
        'DebugLogger',
        'Router',
        'Sidebar',
        'ProjectManager',
        'ImageUploader',
        'CanvasManager',
        'RichTextManager',
        'AutoSaveManager',
        'DataSerializer',
        'ModalDialog'
    ];

    const missing = requiredClasses.filter(className => typeof window[className] === 'undefined');

    if (missing.length > 0) {
    } else {
    }
})();

// 全局应用实例
let app = null;

class App {
    constructor() {
        this.router = null;
        this.sidebar = null;
        this.projectManager = null;
        this.imageUploader = null;
        this.autoSaveManager = null;
        this.currentProjectId = null;
        this.deepCanvasManager = null;
        this.initialized = false;

        // 图像缓存，避免切换页面时重复加载
        this.imageCache = new Map(); // projectId -> { imageData, width, height }

        // 每个项目有自己的 CanvasManager 和 RichTextManager 实例
        this.projectManagers = new Map(); // projectId -> { canvasManager, richTextManager }
    }

    /**
     * 获取当前项目的管理器
     */
    getCurrentProjectManagers() {
        if (!this.currentProjectId) return null;
        return this.projectManagers.get(this.currentProjectId);
    }

    /**
     * 获取或创建项目的管理器
     */
    getOrCreateProjectManagers(projectId) {
        if (!projectId) return null;

        if (!this.projectManagers.has(projectId)) {
            this.projectManagers.set(projectId, {
                canvasManager: null,
                richTextManager: null
            });
        }

        return this.projectManagers.get(projectId);
    }

    /**
     * 获取当前项目的 CanvasManager
     */
    get canvasManager() {
        const managers = this.getCurrentProjectManagers();
        return managers ? managers.canvasManager : null;
    }

    /**
     * 设置当前项目的 CanvasManager
     */
    set canvasManager(value) {
        const managers = this.getOrCreateProjectManagers(this.currentProjectId);
        if (managers) {
            managers.canvasManager = value;
        }
    }

    /**
     * 获取当前项目的 RichTextManager
     */
    get richTextManager() {
        const managers = this.getCurrentProjectManagers();
        return managers ? managers.richTextManager : null;
    }

    /**
     * 设置当前项目的 RichTextManager
     */
    set richTextManager(value) {
        const managers = this.getOrCreateProjectManagers(this.currentProjectId);
        if (managers) {
            managers.richTextManager = value;
        }
    }

    /**
     * 初始化应用
     */
    init() {
        if (this.initialized) return;

        // 初始化项目管理器
        this.initProjectManager();

        // 初始化自动保存管理器
        this.initAutoSaveManager();

        // 初始化侧边栏
        this.initSidebar();

        // 初始化路由
        this.initRouter();

        // 初始化全局事件监听器
        this.initGlobalEventListeners();

        this.initialized = true;
    }

    /**
     * 初始化全局事件监听器
     */
    initGlobalEventListeners() {
        // 使用事件委托处理重置序号按钮点击
        document.body.addEventListener('click', (e) => {
            const resetBtn = e.target.closest('#tool-reset-steps');
            if (resetBtn) {
                e.stopPropagation();
                e.preventDefault();

                if (this.canvasManager) {
                    try {
                        const count = this.canvasManager.resetStepCounter();
                        this.showSaveNotification('success', count > 0 ? `已重置 ${count} 个步骤的序号` : '步骤计数器已重置为 1');
                    } catch (error) {
                        console.error('Reset failed:', error);
                        this.showSaveNotification('error', '重置失败，请查看控制台日志');
                    }
                } else {
                    console.error('CanvasManager not found');
                    this.showSaveNotification('error', '未找到画布管理器');
                }
            }
        });
    }

    /**
     * 初始化项目管理器
     */
    initProjectManager() {
        // 使用全局实例或创建新实例
        if (typeof ProjectManager !== 'undefined') {
            this.projectManager = typeof projectManager !== 'undefined' ? projectManager : new ProjectManager();
        }
    }

    /**
     * 初始化自动保存管理器
     * 需求: 11.1, 11.2
     */
    initAutoSaveManager() {
        if (typeof AutoSaveManager !== 'undefined') {
            this.autoSaveManager = getAutoSaveManager({
                interval: 60000, // 1分钟
                onSave: (projectId) => this.performSave(projectId),
                onStatusChange: (status, data) => this.onAutoSaveStatusChange(status, data)
            });

            // 设置自动保存成功回调，用于保存快照
            this.autoSaveManager.onAutoSaveSuccess((projectId) => {
                if (this.projectManager) {
                    this.projectManager.saveProjectSnapshot(projectId, 'auto');
                }
            });
        }
    }

    /**
     * 执行保存操作
     * 需求: 11.3, 11.4, 11.5, 11.6
     * @param {string} projectId - 项目ID
     * @returns {boolean} 是否保存成功
     */
    async performSave(projectId) {
        debugLogger.call('performSave', { projectId });
        debugLogger.step('开始保存项目');

        if (!projectId || !this.projectManager) {
            debugLogger.logError('保存失败：缺少必要参数', { projectId, hasProjectManager: !!this.projectManager });
            debugLogger.return('performSave', false);
            return false;
        }

        const project = this.projectManager.loadProject(projectId);
        if (!project) {
            debugLogger.logError('保存失败：项目不存在', { projectId });
            debugLogger.return('performSave', false);
            return false;
        }

        debugLogger.checkpoint('项目加载成功', { projectId, projectName: project.name });

        // 将旧项目的内嵌贴图迁移到 IndexedDB 后再写入项目记录。
        try {
            await this.richTextManager?.persistInlineImages();
        } catch (error) {
            debugLogger.logError('贴图保存失败', { message: error.message });
            return false;
        }

        // 收集所有数据
        debugLogger.step('收集项目数据');
        const saveData = this.collectProjectData();
        debugLogger.checkpoint('数据收集完成', {
            hasDrawingElements: !!saveData.drawingElements,
            drawingElementCount: saveData.drawingElements?.length || 0,
            hasDividerLines: !!saveData.dividerLines,
            dividerLineCount: saveData.dividerLines?.length || 0,
            hasTextBoxes: !!saveData.textBoxes,
            textBoxCount: saveData.textBoxes?.length || 0
        });

        // 合并数据到项目
        Object.assign(project, saveData);

        // 保存项目
        debugLogger.step('保存到存储');
        const success = this.projectManager.saveProject(project);
        debugLogger.checkpoint('保存结果', { success });

        if (success) {
            debugLogger.logSave('项目保存成功', { projectId, projectName: project.name });
        } else {
            debugLogger.logError('项目保存失败', { projectId });
        }

        debugLogger.return('performSave', success);
        return success;
    }

    /**
     * 收集项目数据
     * 需求: 11.3, 11.4, 11.5, 11.6
     * @returns {Object} 项目数据
     */
    collectProjectData() {
        debugLogger.call('collectProjectData');
        const data = {};

        // 收集绘制元素 (需求: 11.3)
        if (this.canvasManager) {
            const elements = this.canvasManager.getAllElements();
            debugLogger.checkpoint('收集绘制元素', { elementCount: elements.length });
            data.drawingElements = typeof DataSerializer !== 'undefined'
                ? DataSerializer.serializeDrawingElements(elements)
                : elements;

            // 收集分割线 (需求: 11.4)
            const dividerLines = this.canvasManager.exportDividerLines();
            debugLogger.checkpoint('收集分割线', { dividerLineCount: dividerLines.length });
            data.dividerLines = typeof DataSerializer !== 'undefined'
                ? DataSerializer.serializeDividerLines(dividerLines)
                : dividerLines;
        }

        // 收集富文本内容 (需求: 11.5)
        if (this.richTextManager) {
            const textBoxes = this.richTextManager.exportTextBoxes();
            debugLogger.checkpoint('收集文本框', { textBoxCount: textBoxes.length });
            data.textBoxes = typeof DataSerializer !== 'undefined'
                ? DataSerializer.serializeTextBoxes(textBoxes)
                : textBoxes;
        }

        // 图像数据已在上传时保存 (需求: 11.6)

        debugLogger.return('collectProjectData', data);
        return data;
    }

    /**
     * 自动保存状态变化回调
     * @param {string} status - 状态
     * @param {Object} data - 状态数据
     */
    onAutoSaveStatusChange(status, data) {
        this.updateSaveStatusDisplay(status);
    }

    /**
     * 更新保存状态显示
     * @param {string} status - 状态
     */
    updateSaveStatusDisplay(status) {
        const saveStatus = document.getElementById('save-status');
        if (!saveStatus) return;

        switch (status) {
            case 'saving':
                saveStatus.textContent = '保存中...';
                saveStatus.className = 'text-xs text-yellow-500';
                break;
            case 'saved':
                const now = new Date();
                const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                saveStatus.textContent = `已保存 ${timeStr}`;
                saveStatus.className = 'text-xs text-green-500';
                break;
            case 'unsaved':
                saveStatus.textContent = '未保存';
                saveStatus.className = 'text-xs text-[#586472]';
                break;
            case 'error':
                saveStatus.textContent = '保存失败';
                saveStatus.className = 'text-xs text-red-500';
                break;
            case 'disabled':
                saveStatus.textContent = '自动保存已关闭';
                saveStatus.className = 'text-xs text-[#586472]';
                break;
            default:
                saveStatus.textContent = '未保存';
                saveStatus.className = 'text-xs text-[#586472]';
        }
    }

    /**
     * 恢复保存状态显示（根据 AutoSaveManager 的实际状态）
     */
    restoreSaveStatus() {
        const saveStatus = document.getElementById('save-status');
        if (!saveStatus) return;

        if (this.autoSaveManager) {
            // 根据 AutoSaveManager 的实际状态恢复显示
            if (this.autoSaveManager.hasUnsavedChanges()) {
                this.updateSaveStatusDisplay('unsaved');
            } else {
                const lastSaveTime = this.autoSaveManager.getLastSaveTime();
                if (lastSaveTime) {
                    // 显示上次保存时间
                    const timeStr = `${String(lastSaveTime.getHours()).padStart(2, '0')}:${String(lastSaveTime.getMinutes()).padStart(2, '0')}`;
                    saveStatus.textContent = `已保存 ${timeStr}`;
                    saveStatus.className = 'text-xs text-green-500';
                } else {
                    // 没有保存记录，显示未保存
                    this.updateSaveStatusDisplay('unsaved');
                }
            }
        } else {
            this.updateSaveStatusDisplay('unsaved');
        }
    }

    /**
     * 标记数据已变化（触发自动保存）
     */
    markDataDirty() {
        if (this.autoSaveManager) {
            this.autoSaveManager.markDirty();
        }
    }

    /**
     * 初始化路由系统
     */
    initRouter() {
        this.router = new Router();

        // 设置页面容器
        const pageContainer = document.getElementById('page-container');
        if (pageContainer) {
            this.router.setContainer(pageContainer);
        }

        // 注册路由
        this.router.registerRoutes({
            'home': () => Pages.home(),
            'settings': () => Pages.settings(),
            'annotation': (params) => this.projectManager?.loadProject(params.id)?.mode === 'deep'
                ? Pages.deepCanvas(params) : Pages.annotation(params)
        });

        // 监听路由变化，更新导航高亮
        this.router.onNavigate((pageName, _previousPage, params) => {
            // 更新侧边栏高亮
            if (this.sidebar) {
                this.sidebar.highlightActive(pageName, params);
            }
            this.onPageChange(pageName, params);
        });

        // 手动触发初始路由
        this.router.reload();
    }

    /**
     * 初始化侧边栏
     */
    initSidebar() {
        const sidebarElement = document.getElementById('sidebar');
        if (!sidebarElement) return;

        this.sidebar = new Sidebar(sidebarElement);

        // 设置新建项目回调
        this.sidebar.onNewProject(() => {
            this.showCreateProjectDialog();
        });

        // 设置导航回调
        this.sidebar.onNavigate((pageName, params) => {
            if (this.router) {
                this.router.navigate(pageName, params);
            }
        });

        // 加载已保存的项目列表
        this.loadProjectList();
    }

    /**
     * 加载项目列表
     * 需求: 3.3
     */
    loadProjectList() {
        if (!this.sidebar) return;

        let projects = [];

        // 优先使用ProjectManager
        if (this.projectManager) {
            const allProjects = this.projectManager.listProjects();
            projects = allProjects.map(p => ({
                id: p.id,
                name: p.name,
                mode: p.mode || 'pim',
                updatedAt: p.updatedAt
            }));
        } else {
            // 回退到直接读取LocalStorage
            const projectsData = localStorage.getItem('projects');
            if (projectsData) {
                try {
                    const projectsObj = JSON.parse(projectsData);
                    projects = Object.values(projectsObj).map(p => ({
                        id: p.id,
                        name: p.name,
                        mode: p.mode || 'pim',
                        updatedAt: p.updatedAt
                    }));
                    // 按更新时间排序
                    projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                } catch (e) {
                }
            }
        }

        this.sidebar.updateProjectList(projects);
    }

    /**
     * 页面切换回调
     */
    onPageChange(pageName, params) {
        this.homeAbortController?.abort();
        this.homeAbortController = pageName === 'home' ? new AbortController() : null;
        if (this.deepCanvasManager) {
            this.pendingDeepSave = this.deepCanvasManager.destroy();
            this.deepCanvasManager = null;
        }
        const isDeep = pageName === 'annotation' && this.projectManager?.loadProject(params?.id)?.mode === 'deep';
        if (isDeep && this._globalHotkeyHandler) {
            document.removeEventListener('keydown', this._globalHotkeyHandler);
            this._globalHotkeyHandler = null;
        }
        // 更新当前项目ID
        if (pageName === 'annotation' && params && params.id) {
            this.currentProjectId = params.id;
            // 设置自动保存的项目ID并启动
            if (this.autoSaveManager && !isDeep) {
                this.autoSaveManager.setProjectId(params.id);
                this.autoSaveManager.start();
            } else if (this.autoSaveManager) {
                this.autoSaveManager.setProjectId(null);
                this.autoSaveManager.stop();
            }
        } else {
            this.currentProjectId = null;
            // 停止自动保存
            if (this.autoSaveManager) {
                this.autoSaveManager.setProjectId(null);
                this.autoSaveManager.stop();
            }
        }

        // 根据页面类型执行特定初始化
        switch (pageName) {
            case 'home':
                this.initHomePage();
                break;
            case 'annotation':
                if (isDeep) this.initDeepCanvasPage(params);
                else this.initAnnotationPage(params);
                break;
            case 'settings':
                this.initSettingsPage();
                break;
        }
    }

    /**
     * 初始化主页
     */
    initHomePage() {
        // 主页特定初始化逻辑
        document.getElementById('home-new-project-btn')?.addEventListener('click', () => this.showCreateProjectDialog());

        // 检测后端服务状态
        this.checkBackendStatus();

        // 初始化统计数据
        this.initStatistics();

        // 初始化查看更多按钮
        this.initViewMoreButton();

    }

    /**
     * 初始化查看更多按钮
     */
    initViewMoreButton() {
        const viewMoreBtn = document.getElementById('view-more-btn');
        if (!viewMoreBtn) return;

        viewMoreBtn.addEventListener('click', () => {
            this.showStatisticsDetailModal();
        });
    }

    /**
     * 显示统计详情弹窗
     */
    async showStatisticsDetailModal() {
        const monthInput = document.getElementById('statistics-month');
        const month = monthInput?.value || new Date().toISOString().slice(0, 7);

        // 获取统计数据
        const [year, monthNum] = month.split('-').map(Number);
        const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
        let endYear = year;
        let endMonth = monthNum + 1;
        if (endMonth > 12) {
            endMonth = 1;
            endYear++;
        }
        const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

        try {
            const response = await fetch(`/api/statistics?start_date=${startDate}&end_date=${endDate}`);
            const result = await response.json();

            if (!result.success) {
                await modalDialog.alert('获取数据失败');
                return;
            }

            const records = result.data.records || [];

            // 创建弹窗
            const modal = document.createElement('div');
            modal.className = 'statistics-detail-modal fixed inset-0 bg-black/50 flex items-center justify-center z-[100]';
            modal.innerHTML = `
                <div class="bg-[#1c2127] rounded-xl shadow-2xl w-[800px] max-h-[80vh] flex flex-col">
                    <div class="flex items-center justify-between p-4 border-b border-[#283039]">
                        <h3 class="text-white font-medium">任务详情 - ${year}年${monthNum}月</h3>
                        <div class="flex items-center gap-2">
                            <button id="add-record-btn" class="px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90">
                                <span class="material-symbols-outlined text-[16px] mr-1">add</span>新增记录
                            </button>
                            <button id="close-statistics-modal" class="text-gray-400 hover:text-white">
                                <span class="material-symbols-outlined">close</span>
                            </button>
                        </div>
                    </div>
                    <div class="flex-1 overflow-y-auto p-4">
                        <table class="w-full text-sm">
                            <thead class="text-gray-400 border-b border-[#283039]">
                                <tr>
                                    <th class="text-left py-2 px-2">任务名称</th>
                                    <th class="text-left py-2 px-2">状态</th>
                                    <th class="text-left py-2 px-2">工作量</th>
                                    <th class="text-left py-2 px-2">公司名</th>
                                    <th class="text-left py-2 px-2">模板编号</th>
                                    <th class="text-left py-2 px-2">日期</th>
                                    <th class="text-center py-2 px-2">操作</th>
                                </tr>
                            </thead>
                            <tbody id="statistics-table-body" class="text-white">
                                ${this.renderStatisticsRows(records)}
                            </tbody>
                        </table>
                        ${records.length === 0 ? '<div class="text-center text-gray-500 py-8">暂无数据</div>' : ''}
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // 关闭按钮
            modal.querySelector('#close-statistics-modal').addEventListener('click', () => {
                modal.remove();
            });

            // 点击背景关闭
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                }
            });

            // 新增记录按钮
            modal.querySelector('#add-record-btn').addEventListener('click', () => {
                this.showAddRecordForm(modal, month);
            });

            // 绑定编辑和删除事件
            this.bindStatisticsTableEvents(modal, month);

        } catch (e) {
            await modalDialog.alert('获取数据失败');
        }
    }

    /**
     * 渲染统计表格行
     * @param {Array} records - 记录数组
     * @returns {string} HTML字符串
     */
    renderStatisticsRows(records) {
        return records.map(record => `
            <tr class="border-b border-[#283039] hover:bg-[#283039]/50" data-record-id="${record.id}">
                <td class="py-2 px-2">
                    <input type="text" class="record-field bg-transparent border-none outline-none w-full text-sm" data-field="projectName" value="${this._escapeHtml(record.projectName || '')}" />
                </td>
                <td class="py-2 px-2 min-w-[90px]">
                    <select class="record-field bg-[#283039] text-white text-xs h-7 rounded px-2 border-none w-full" data-field="status">
                        <option value="pending" ${record.status === 'pending' ? 'selected' : ''}>进行中</option>
                        <option value="completed" ${record.status === 'completed' ? 'selected' : ''}>已完成</option>
                    </select>
                </td>
                <td class="py-2 px-2">
                    <input type="text" class="record-field bg-transparent border-none outline-none w-full text-sm" data-field="workload" value="${this._escapeHtml(record.workload || '')}" placeholder="-" />
                </td>
                <td class="py-2 px-2">
                    <input type="text" class="record-field bg-transparent border-none outline-none w-full text-sm" data-field="company" value="${this._escapeHtml(record.company || '')}" placeholder="-" />
                </td>
                <td class="py-2 px-2">
                    <input type="text" class="record-field bg-transparent border-none outline-none w-full text-sm" data-field="templateId" value="${this._escapeHtml(record.templateId || '')}" placeholder="-" />
                </td>
                <td class="py-2 px-2 text-gray-400 text-sm whitespace-nowrap">${record.date ? record.date.slice(0, 10) : '-'}</td>
                <td class="py-2 px-2 text-center">
                    <button class="delete-record-btn text-red-400 hover:text-red-300" data-record-id="${record.id}">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    /**
     * 绑定统计表格事件
     * @param {HTMLElement} modal - 弹窗元素
     * @param {string} month - 月份
     */
    bindStatisticsTableEvents(modal, month) {
        const tbody = modal.querySelector('#statistics-table-body');
        if (!tbody) return;

        // 字段变化时自动保存
        tbody.querySelectorAll('.record-field').forEach(field => {
            field.addEventListener('change', async () => {
                const row = field.closest('tr');
                const recordId = row.dataset.recordId;
                const fieldName = field.dataset.field;
                const value = field.value;

                await this.updateStatisticsRecord(recordId, { [fieldName]: value });
            });
        });

        // 删除按钮
        tbody.querySelectorAll('.delete-record-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const recordId = btn.dataset.recordId;
                const confirmed = await modalDialog.confirm('确定要删除此记录吗？');
                if (confirmed) {
                    await this.deleteStatisticsRecordById(recordId);
                    btn.closest('tr').remove();
                    // 刷新主页统计
                    this.loadStatistics(month);
                }
            });
        });
    }

    /**
     * 显示新增记录表单
     * @param {HTMLElement} modal - 弹窗元素
     * @param {string} month - 月份
     */
    async showAddRecordForm(modal, month) {
        const form = document.createElement('div');
        form.className = 'statistics-record-form fixed inset-0 bg-black/50 flex items-center justify-center z-[110]';
        form.innerHTML = `
            <div class="bg-[#1c2127] rounded-xl shadow-2xl w-[400px] p-4">
                <h4 class="text-white font-medium mb-4">新增记录</h4>
                <div class="space-y-3">
                    <div>
                        <label class="text-gray-400 text-xs mb-1 block">任务名称</label>
                        <input type="text" id="new-record-name" class="w-full bg-[#283039] text-white text-sm h-9 rounded px-3 border-none focus:ring-1 focus:ring-primary outline-none" />
                    </div>
                    <div>
                        <label class="text-gray-400 text-xs mb-1 block">状态</label>
                        <select id="new-record-status" class="w-full bg-[#283039] text-white text-sm h-9 rounded px-3 border-none focus:ring-1 focus:ring-primary outline-none">
                            <option value="pending">进行中</option>
                            <option value="completed">已完成</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-gray-400 text-xs mb-1 block">工作量</label>
                        <input type="text" id="new-record-workload" class="w-full bg-[#283039] text-white text-sm h-9 rounded px-3 border-none focus:ring-1 focus:ring-primary outline-none" />
                    </div>
                    <div>
                        <label class="text-gray-400 text-xs mb-1 block">公司名</label>
                        <input type="text" id="new-record-company" class="w-full bg-[#283039] text-white text-sm h-9 rounded px-3 border-none focus:ring-1 focus:ring-primary outline-none" />
                    </div>
                    <div>
                        <label class="text-gray-400 text-xs mb-1 block">模板编号</label>
                        <input type="text" id="new-record-template" class="w-full bg-[#283039] text-white text-sm h-9 rounded px-3 border-none focus:ring-1 focus:ring-primary outline-none" />
                    </div>
                </div>
                <div class="flex gap-2 mt-4">
                    <button id="cancel-new-record" class="flex-1 py-2 bg-[#283039] text-white rounded-lg hover:bg-[#3b4754]">取消</button>
                    <button id="save-new-record" class="flex-1 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">保存</button>
                </div>
            </div>
        `;

        document.body.appendChild(form);

        // 取消按钮
        form.querySelector('#cancel-new-record').addEventListener('click', () => {
            form.remove();
        });

        // 保存按钮
        form.querySelector('#save-new-record').addEventListener('click', async () => {
            const name = form.querySelector('#new-record-name').value.trim();
            const status = form.querySelector('#new-record-status').value;
            const workload = form.querySelector('#new-record-workload').value.trim();
            const company = form.querySelector('#new-record-company').value.trim();
            const templateId = form.querySelector('#new-record-template').value.trim();

            if (!name) {
                await modalDialog.alert('请输入任务名称');
                return;
            }

            try {
                const response = await fetch('/api/statistics/record', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        projectId: 'manual_' + Date.now(),
                        projectName: name,
                        status,
                        workload,
                        company,
                        templateId
                    })
                });

                const result = await response.json();
                if (result.success) {
                    form.remove();
                    // 刷新表格
                    this.showStatisticsDetailModal();
                    // 刷新主页统计
                    this.loadStatistics(month);
                } else {
                    await modalDialog.alert('保存失败');
                }
            } catch (e) {
                await modalDialog.alert('保存失败');
            }
        });
    }

    /**
     * 更新统计记录
     * @param {string} recordId - 记录ID
     * @param {Object} data - 更新数据
     */
    async updateStatisticsRecord(recordId, data) {
        try {
            await fetch(`/api/statistics/record/${recordId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } catch (e) {
        }
    }

    /**
     * 根据ID删除统计记录
     * @param {string} recordId - 记录ID
     */
    async deleteStatisticsRecordById(recordId) {
        try {
            await fetch(`/api/statistics/record/${recordId}`, {
                method: 'DELETE'
            });
        } catch (e) {
        }
    }

    /**
     * 初始化统计数据
     */
    async initStatistics() {
        const monthInput = document.getElementById('statistics-month');
        const trigger = document.getElementById('statistics-month-trigger');
        const popover = document.getElementById('statistics-month-popover');
        const yearLabel = document.getElementById('statistics-month-year');
        const grid = document.getElementById('statistics-month-grid');
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        if (monthInput && trigger && popover && yearLabel && grid) {
            monthInput.value = currentMonth;
            let displayYear = now.getFullYear();
            const close = () => {
                popover.hidden = true;
                trigger.setAttribute('aria-expanded', 'false');
            };
            const render = () => {
                const selected = monthInput.value;
                trigger.textContent = `${selected.slice(0, 4)}年${Number(selected.slice(5))}月`;
                yearLabel.textContent = `${displayYear}年`;
                grid.replaceChildren();
                for (let month = 1; month <= 12; month++) {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.textContent = `${month}月`;
                    const value = `${displayYear}-${String(month).padStart(2, '0')}`;
                    button.classList.toggle('selected', value === selected);
                    button.setAttribute('aria-pressed', String(value === selected));
                    button.addEventListener('click', () => {
                        monthInput.value = value;
                        render();
                        close();
                        trigger.focus();
                        this.loadStatistics(value);
                    });
                    grid.appendChild(button);
                }
            };
            render();
            trigger.addEventListener('click', () => {
                if (!popover.hidden) return close();
                displayYear = Number(monthInput.value.slice(0, 4));
                render();
                popover.hidden = false;
                trigger.setAttribute('aria-expanded', 'true');
            });
            popover.querySelectorAll('[data-year-step]').forEach(button => {
                button.addEventListener('click', () => {
                    displayYear += Number(button.dataset.yearStep);
                    render();
                });
            });
            document.addEventListener('pointerdown', event => {
                if (!popover.hidden && !event.target.closest('.statistics-month-picker')) close();
            }, { signal: this.homeAbortController?.signal });
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape' && !popover.hidden) {
                    close();
                    trigger.focus();
                }
            }, { signal: this.homeAbortController?.signal });
        }

        // 加载当前月统计
        this.loadStatistics(currentMonth);
    }

    /**
     * 加载统计数据
     * @param {string} month - 月份 (YYYY-MM格式)
     */
    async loadStatistics(month) {
        try {
            // 计算月份的开始和结束日期
            const [year, monthNum] = month.split('-').map(Number);
            const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;

            // 计算下个月的第一天
            let endYear = year;
            let endMonth = monthNum + 1;
            if (endMonth > 12) {
                endMonth = 1;
                endYear++;
            }
            const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

            const response = await fetch(`/api/statistics?start_date=${startDate}&end_date=${endDate}`);
            const result = await response.json();

            if (result.success) {
                const { completed, pending, total } = result.data.summary;

                // 更新UI
                const totalEl = document.getElementById('total-tasks');
                const completedEl = document.getElementById('completed-tasks');
                const pendingEl = document.getElementById('pending-tasks');
                const completedProgress = document.getElementById('completed-progress');
                const pendingProgress = document.getElementById('pending-progress');

                if (totalEl) totalEl.textContent = total;
                if (completedEl) completedEl.textContent = completed;
                if (pendingEl) pendingEl.textContent = pending;

                const completedPercent = total > 0 ? (completed / total * 100) : 0;
                const pendingPercent = total > 0 ? (pending / total * 100) : 0;

                if (completedProgress) completedProgress.style.width = `${completedPercent}%`;
                if (pendingProgress) pendingProgress.style.width = `${pendingPercent}%`;
            }
        } catch (e) {
        }
    }

    /**
     * 检测后端服务状态
     */
    async checkBackendStatus() {
        const backendStatus = document.getElementById('backend-status');
        if (!backendStatus) return;

        try {
            const response = await fetch('/api/projects', {
                method: 'GET'
            });

            // 只要能收到响应（无论状态码），说明后端在运行
            if (response) {
                backendStatus.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20';
                backendStatus.innerHTML = `
                    <div class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                    <span class="text-xs font-medium text-emerald-400">后端服务：运行中</span>
                `;
            }
        } catch (error) {
            // 网络错误，后端未运行
            backendStatus.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20';
            backendStatus.innerHTML = `
                <div class="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
                <span class="text-xs font-medium text-red-400">后端服务：未运行</span>
            `;
        }
    }

    /**
     * 初始化标注页面
     * 需求: 3.2, 3.4, 5.1, 5.2, 5.3
     */
    async initAnnotationPage(params) {
        // 设置加载标志，防止加载期间触发保存
        this.isLoadingProject = true;

        // 加载项目数据
        if (params && params.id && this.projectManager) {
            const project = this.projectManager.loadProject(params.id);
            if (project) {
                // 更新项目名称输入框
                const projectNameInput = document.getElementById('project-name');
                if (projectNameInput) {
                    projectNameInput.value = project.name;
                }
            }
        }

        // 初始化画布管理器（先初始化，但不加载数据）
        this.initCanvasManager();

        // 初始化富文本管理器（先初始化，但不加载数据）
        this.initRichTextManager();

        // 初始化图像上传区域（会异步加载图像和数据）
        this.initImageUpload();

        // 初始化工具栏
        this.initToolbar();

        // 初始化富文本工具栏
        this.initRichTextToolbar();

        // 初始化保存按钮
        this.initSaveButton();

        // 初始化历史记录按钮
        this.initHistoryButton();

        // 初始化删除按钮
        this.initDeleteButton();

        // 初始化导出按钮
        this.initExportButton();

        // 初始化完成按钮
        this.initCompleteButton();

        // 恢复保存状态显示（根据 AutoSaveManager 的实际状态）
        this.restoreSaveStatus();
    }

    /**
     * 初始化画布管理器
     * 需求: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4
     */
    initCanvasManager() {
        const canvasContainer = document.getElementById('canvas-container');
        if (!canvasContainer) return;

        // 检查 CanvasManager 是否已定义
        if (typeof CanvasManager === 'undefined') {
            return;
        }

        // 获取或创建当前项目的管理器
        const managers = this.getOrCreateProjectManagers(this.currentProjectId);
        if (!managers) return;

        // 如果当前项目已有 CanvasManager，重新绑定容器
        if (managers.canvasManager) {
            managers.canvasManager.rebindContainer(canvasContainer);
            this.setupCanvasManagerCallbacks();
            return;
        }

        // 创建新的 CanvasManager 实例
        managers.canvasManager = new CanvasManager(canvasContainer);

        // 设置回调函数
        this.setupCanvasManagerCallbacks();
    }

    /**
     * 设置 CanvasManager 的回调函数
     */
    setupCanvasManagerCallbacks() {
        if (!this.canvasManager) return;

        // 设置元素变化回调
        this.canvasManager.onElementChange((elements) => {

            // 标记数据已变化
            this.markDataDirty();

            const imageWrapper = document.getElementById('image-wrapper');
            if (this.canvasManager && imageWrapper) {
                this.canvasManager.lastDisplaySize = {
                    width: imageWrapper.clientWidth,
                    height: imageWrapper.clientHeight
                };
            }

            // 保存到当前项目（同时保存当前显示尺寸，供下次加载时校正坐标）
            if (this.currentProjectId && this.projectManager) {
                const project = this.projectManager.loadProject(this.currentProjectId);
                if (project) {
                    project.drawingElements = elements;
                    if (imageWrapper && imageWrapper.clientWidth && imageWrapper.clientHeight) {
                        project.displayWidth = imageWrapper.clientWidth;
                        project.displayHeight = imageWrapper.clientHeight;
                    }
                    this.projectManager.saveProject(project);
                }
            }
        });

        // 设置分割线变化回调 - 连接RichTextManager
        // 需求: 7.4
        this.canvasManager.onDividerChange((dividerLines, regions) => {
            // 如果正在加载项目，不保存
            if (this.isLoadingProject) {
                // 但仍然同步富文本框（跳过保存）
                if (this.richTextManager) {
                    this.richTextManager.syncWithRegions(regions, true);
                }
                return;
            }

            // 同步富文本框（正常编辑时会触发保存）
            if (this.richTextManager) {
                this.richTextManager.syncWithRegions(regions);
            }

            const imageWrapper = document.getElementById('image-wrapper');
            if (this.canvasManager && imageWrapper) {
                this.canvasManager.lastDisplaySize = {
                    width: imageWrapper.clientWidth,
                    height: imageWrapper.clientHeight
                };
            }

            // 标记数据已变化
            this.markDataDirty();

            // 保存到当前项目（同时保存当前显示尺寸，供下次加载时校正坐标）
            if (this.currentProjectId && this.projectManager) {
                const project = this.projectManager.loadProject(this.currentProjectId);
                if (project) {
                    project.dividerLines = dividerLines;
                    if (imageWrapper && imageWrapper.clientWidth && imageWrapper.clientHeight) {
                        project.displayWidth = imageWrapper.clientWidth;
                        project.displayHeight = imageWrapper.clientHeight;
                    }
                    this.projectManager.saveProject(project);
                }
            }
        });

        // 设置选择变化回调
        this.canvasManager.onSelectionChange((element) => {
            this.updateToolbarForSelection(element);
        });

        // 设置历史变化回调（更新撤销/重做按钮状态）
        this.canvasManager.onHistoryChange(({ canUndo, canRedo }) => {
            const undoBtn = document.getElementById('tool-undo');
            const redoBtn = document.getElementById('tool-redo');

            if (undoBtn) {
                undoBtn.disabled = !canUndo;
            }
            if (redoBtn) {
                redoBtn.disabled = !canRedo;
            }
        });
    }

    /**
     * 初始化工具栏
     * 需求: 5.1, 5.2, 5.3, 5.7, 6.1
     */
    initToolbar() {
        // 工具按钮
        const toolButtons = document.querySelectorAll('.tool-btn');
        toolButtons.forEach(btn => {
            // 排除特殊功能按钮
            if (['tool-reset-steps', 'tool-clear', 'tool-undo', 'tool-redo'].includes(btn.id)) {
                return;
            }

            btn.addEventListener('click', () => {
                const toolId = btn.id;

                let tool = ToolType.SELECT;

                switch (toolId) {
                    case 'tool-rectangle':
                        tool = ToolType.RECTANGLE;
                        break;
                    case 'tool-text':
                        tool = ToolType.TEXT;
                        break;
                    case 'tool-step':
                        tool = ToolType.STEP;
                        break;
                    case 'tool-divider':
                        tool = ToolType.DIVIDER;
                        break;
                    case 'tool-image-box':
                        tool = ToolType.IMAGE_BOX;
                        break;
                }

                this.setActiveTool(tool, btn);
            });
        });

        // 清除所有绘制按钮（不包括分割线）
        const clearBtn = document.getElementById('tool-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', async () => {
                const confirmed = await modalDialog.confirm('确定要清除所有绘制元素吗？（不包括分割线）此操作不可撤销。');
                if (confirmed) {
                    if (this.canvasManager) {
                        this.canvasManager.clearAllElements();
                        // 不再清除分割线
                        // this.canvasManager.clearAllDividerLines();
                    }
                    this.showSaveNotification('success', '已清除所有绘制元素');
                }
            });
        }

        // 撤销/重做按钮
        const undoBtn = document.getElementById('tool-undo');
        const redoBtn = document.getElementById('tool-redo');

        if (undoBtn) {
            undoBtn.addEventListener('click', () => {
                if (this.canvasManager && this.canvasManager.canUndo()) {
                    this.canvasManager.undo();
                }
            });
        }

        if (redoBtn) {
            redoBtn.addEventListener('click', () => {
                if (this.canvasManager && this.canvasManager.canRedo()) {
                    this.canvasManager.redo();
                }
            });
        }

        // 初始化全局热键处理
        this.initGlobalHotkeys();

        // 颜色选择器
        const colorPickers = document.querySelectorAll('.color-picker');
        colorPickers.forEach(picker => {
            picker.addEventListener('click', () => {
                const color = picker.dataset.color;
                this.setActiveColor(color, picker);
            });
        });

        // 自定义颜色选择器
        const elementColor = document.getElementById('element-color');
        if (elementColor) {
            elementColor.addEventListener('input', (e) => {
                const color = e.target.value;
                this.setActiveColor(color, null);
                // 更新自定义颜色按钮的背景色
                const customColorBtn = document.getElementById('custom-color-btn');
                if (customColorBtn) {
                    customColorBtn.style.backgroundColor = color;
                }
            });
        }

        // 字体大小选择器
        const fontSize = document.getElementById('font-size');
        if (fontSize) {
            // 设置默认值为24px
            fontSize.value = '24';
            if (this.canvasManager) {
                this.canvasManager.setFontSize(24);
            }
            fontSize.addEventListener('change', () => {
                if (this.canvasManager) {
                    const size = parseInt(fontSize.value);
                    this.canvasManager.setFontSize(size);
                }
            });
        }

        // 初始化项目名称编辑
        this.initProjectNameEdit();
    }

    /**
     * 加载本地浏览器字体列表
     * @param {HTMLSelectElement} selectElement - 字体选择器元素
     */
    async loadLocalFonts(selectElement) {
        // 默认字体列表
        const defaultFonts = [
            '系统默认',
            'Arial',
            'Helvetica',
            'Times New Roman',
            'Georgia',
            'Verdana',
            'Courier New',
            '微软雅黑',
            '宋体',
            '黑体',
            '楷体',
            '仿宋'
        ];

        // 清空现有选项
        selectElement.innerHTML = '';

        // 尝试使用 Local Font Access API
        if ('queryLocalFonts' in window) {
            try {
                const fonts = await window.queryLocalFonts();
                const fontFamilies = new Set();

                fonts.forEach(font => {
                    fontFamilies.add(font.family);
                });

                // 添加系统默认选项
                const defaultOption = document.createElement('option');
                defaultOption.value = '系统默认';
                defaultOption.textContent = '系统默认';
                selectElement.appendChild(defaultOption);

                // 按字母顺序排序并添加字体
                Array.from(fontFamilies).sort().forEach(family => {
                    const option = document.createElement('option');
                    option.value = family;
                    option.textContent = family;
                    selectElement.appendChild(option);
                });

                return;
            } catch (e) {
            }
        }

        // 回退到默认字体列表
        defaultFonts.forEach(font => {
            const option = document.createElement('option');
            option.value = font;
            option.textContent = font;
            selectElement.appendChild(option);
        });
    }

    /**
     * 初始化项目名称编辑功能
     */
    initProjectNameEdit() {
        const projectNameInput = document.getElementById('project-name');

        if (projectNameInput) {
            // 自动调整输入框宽度
            const adjustInputWidth = () => {
                // 创建临时span来测量文本宽度
                const span = document.createElement('span');
                span.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:inherit;';
                span.textContent = projectNameInput.value || projectNameInput.placeholder || '';
                document.body.appendChild(span);
                const width = Math.max(80, Math.min(span.offsetWidth + 24, 400)); // 加上padding，限制最大宽度
                document.body.removeChild(span);
                projectNameInput.style.width = width + 'px';
            };

            // 初始化宽度
            adjustInputWidth();

            // 输入时调整宽度
            projectNameInput.addEventListener('input', adjustInputWidth);

            // 输入框失去焦点时保存
            projectNameInput.addEventListener('blur', () => {
                this.saveProjectName(projectNameInput.value);
            });

            // 按回车键保存
            projectNameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    projectNameInput.blur();
                }
            });
        }

    }

    /**
     * 保存项目名称
     * @param {string} newName - 新名称
     */
    saveProjectName(newName) {
        if (!this.currentProjectId || !this.projectManager || !newName.trim()) return;

        const project = this.projectManager.loadProject(this.currentProjectId);
        if (project && project.name !== newName.trim()) {
            project.name = newName.trim();
            this.projectManager.saveProject(project);

            // 更新侧边栏中的项目名称
            if (this.sidebar) {
                this.sidebar.updateProjectName(this.currentProjectId, newName.trim());
            }

        }
    }

    /**
     * 初始化富文本管理器
     * 需求: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7
     */
    initRichTextManager() {
        const richTextContainer = document.getElementById('rich-text-container');
        if (!richTextContainer) return;

        // 检查 RichTextManager 是否已定义
        if (typeof RichTextManager === 'undefined') {
            return;
        }

        // 获取或创建当前项目的管理器
        const managers = this.getOrCreateProjectManagers(this.currentProjectId);
        if (!managers) return;

        // 如果当前项目已有 RichTextManager，重新绑定容器
        if (managers.richTextManager) {
            debugLogger.step('重新绑定RichTextManager容器');
            debugLogger.checkpoint('绑定前状态', {
                projectId: this.currentProjectId,
                textBoxCount: managers.richTextManager.textBoxes.size,
                textBoxes: Array.from(managers.richTextManager.textBoxes.entries()).map(([id, tb]) => ({
                    id,
                    regionId: tb.regionId,
                    height: tb.height
                }))
            });

            managers.richTextManager.rebindContainer(richTextContainer);

            debugLogger.checkpoint('绑定后状态', {
                textBoxCount: managers.richTextManager.textBoxes.size
            });

            // 重新同步区域高度（从 CanvasManager 获取最新的区域信息）
            // 使用 skipSave=true 防止在图像加载前保存错误的高度
            if (this.canvasManager) {
                const regions = this.canvasManager.getImageRegions();
                debugLogger.step('重新绑定后同步区域（skipSave=true）');
                debugLogger.checkpoint('区域数据（临时同步）', {
                    regionCount: regions.length,
                    imageHeight: this.canvasManager.getImageHeight()
                });
                managers.richTextManager.syncWithRegions(regions, true); // skipSave=true
            }

            // 重新初始化滚动同步（因为容器被重新绑定）
            this.initScrollSync();
            return;
        }

        // 创建新的 RichTextManager 实例
        managers.richTextManager = new RichTextManager(richTextContainer);

        // 初始化时设置为加载状态，防止触发保存
        managers.richTextManager.isLoading = true;

        // 设置内容变化回调
        this.richTextManager.onContentChange((textBoxes) => {
            // 标记数据已变化（不自动保存，等待手动保存或自动保存定时器）
            this.markDataDirty();

            // 保存到当前项目
            if (this.currentProjectId && this.projectManager) {
                const project = this.projectManager.loadProject(this.currentProjectId);
                if (project) {
                    project.textBoxes = textBoxes;
                    this.projectManager.saveProject(project);
                }
            }
        });

        // 如果已有分割线数据，同步文本框
        if (this.canvasManager) {
            const regions = this.canvasManager.getImageRegions();
            this.richTextManager.syncWithRegions(regions);
        }

        // 加载已保存的文本框数据
        this.loadSavedTextBoxes();

        // 初始化滚动同步
        this.initScrollSync();
    }

    /**
     * 初始化图像和文本区域的滚动同步
     */
    initScrollSync() {
        const canvasContainer = document.getElementById('canvas-container');
        const richTextContainer = document.getElementById('rich-text-container');

        if (!canvasContainer || !richTextContainer) return;

        // 移除旧的事件监听器（如果存在）
        if (this._scrollSyncHandlers) {
            if (this._scrollSyncHandlers.canvasContainer && this._scrollSyncHandlers.canvasHandler) {
                this._scrollSyncHandlers.canvasContainer.removeEventListener('scroll', this._scrollSyncHandlers.canvasHandler);
            }
            if (this._scrollSyncHandlers.richTextContainer && this._scrollSyncHandlers.richTextHandler) {
                this._scrollSyncHandlers.richTextContainer.removeEventListener('scroll', this._scrollSyncHandlers.richTextHandler);
            }
        }

        let isSyncing = false;

        // 计算滚动比例的辅助函数
        const getScrollRatio = (element) => {
            const maxScroll = element.scrollHeight - element.clientHeight;
            if (maxScroll <= 0) return 0;
            return element.scrollTop / maxScroll;
        };

        // 设置滚动位置的辅助函数
        const setScrollByRatio = (element, ratio) => {
            const maxScroll = element.scrollHeight - element.clientHeight;
            if (maxScroll <= 0) return;
            element.scrollTop = ratio * maxScroll;
        };

        // 图像区域滚动时同步文本区域
        const canvasScrollHandler = () => {
            if (isSyncing) return;
            isSyncing = true;

            const ratio = getScrollRatio(canvasContainer);
            setScrollByRatio(richTextContainer, ratio);

            requestAnimationFrame(() => {
                isSyncing = false;
            });
        };

        // 文本区域滚动时同步图像区域
        const richTextScrollHandler = () => {
            if (isSyncing) return;
            isSyncing = true;

            const ratio = getScrollRatio(richTextContainer);
            setScrollByRatio(canvasContainer, ratio);

            requestAnimationFrame(() => {
                isSyncing = false;
            });
        };

        // 添加新的事件监听器
        canvasContainer.addEventListener('scroll', canvasScrollHandler);
        richTextContainer.addEventListener('scroll', richTextScrollHandler);

        // 保存事件处理器引用，以便后续移除
        this._scrollSyncHandlers = {
            canvasContainer: canvasContainer,
            canvasHandler: canvasScrollHandler,
            richTextContainer: richTextContainer,
            richTextHandler: richTextScrollHandler
        };
    }

    /**
     * 初始化富文本工具栏
     * 需求: 8.1, 8.2, 8.3, 8.5
     */
    initRichTextToolbar() {
        const formatButtons = document.querySelectorAll('.rich-format-btn');

        formatButtons.forEach(btn => {
            // 跳过字体大小选择器
            if (btn.tagName === 'SELECT') return;

            // 使用 mousedown 而不是 click，防止编辑器失去焦点
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault(); // 阻止默认行为，防止编辑器失去焦点
                const format = btn.dataset.format;
                if (this.richTextManager && format) {
                    this.richTextManager.applyFormatToActive(format);
                }
            });
        });

        // 富文本字体颜色选择器
        const richFontColor = document.getElementById('rich-font-color');
        const richFontColorBtn = document.getElementById('rich-font-color-btn');
        const richFontColorPreview = document.getElementById('rich-font-color-preview');

        if (richFontColor && richFontColorBtn) {
            richFontColorBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // 在点击按钮时保存当前选区，防止颜色选择器弹出后选区丢失
                if (this.richTextManager) {
                    this.richTextManager.saveSelection();
                }
                richFontColor.click();
            });

            richFontColor.addEventListener('input', () => {
                const color = richFontColor.value;
                if (richFontColorPreview) {
                    richFontColorPreview.style.backgroundColor = color;
                }
                if (this.richTextManager) {
                    this.richTextManager.applyFontColor(color);
                }
            });
        }

        // 文本框选择器 - 跳转到指定区域
        const textboxSelector = document.getElementById('textbox-selector');
        if (textboxSelector) {
            textboxSelector.addEventListener('change', () => {
                const textboxId = textboxSelector.value;
                if (textboxId && this.richTextManager) {
                    this.richTextManager.scrollToTextBox(textboxId);
                }
            });
        }

        // 初始化文本框选择器选项
        this.updateTextboxSelector();

        // 初始化快捷文本功能
        this.initQuickTextFeature();
    }

    /**
     * 初始化快捷文本功能
     */
    initQuickTextFeature() {
        const quickTextBtn = document.getElementById('quick-text-btn');
        if (!quickTextBtn) return;

        // 创建快捷文本弹出菜单
        const popup = document.createElement('div');
        popup.id = 'quick-text-popup';
        popup.className = 'absolute top-full left-0 mt-1 bg-[#1c2127] border border-[#283039] rounded-lg shadow-xl z-50 hidden min-w-[280px]';
        popup.innerHTML = `
            <div class="p-2 border-b border-[#283039]">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs text-gray-400 font-medium">快捷文本</span>
                    <button id="quick-text-manage" class="text-xs text-primary hover:text-primary/80">管理</button>
                </div>
                <div id="quick-text-list" class="max-h-[200px] overflow-y-auto space-y-1">
                    <!-- 快捷文本列表 -->
                </div>
            </div>
            <div class="p-2 space-y-2">
                <div class="flex items-center gap-2">
                    <input type="text" id="quick-text-input" class="flex-1 bg-[#283039] text-white text-xs h-7 rounded px-2 border-none focus:ring-1 focus:ring-primary outline-none min-w-0" placeholder="输入文本..." />
                    <button id="quick-text-add" class="shrink-0 px-3 h-7 bg-primary text-white text-xs rounded hover:bg-primary/90 whitespace-nowrap">添加</button>
                </div>
                <button id="quick-text-add-selection" class="w-full h-7 bg-[#283039] text-gray-300 text-xs rounded hover:bg-[#3b4754] flex items-center justify-center gap-1">
                    <span class="material-symbols-outlined text-[14px]">add_circle</span>
                    <span>添加选中文本</span>
                </button>
            </div>
        `;

        quickTextBtn.parentElement.appendChild(popup);

        // 加载快捷文本
        this.loadQuickTexts();

        // 切换弹出菜单
        quickTextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            popup.classList.toggle('hidden');
            this.loadQuickTexts();
        });

        // 点击外部关闭
        document.addEventListener('click', (e) => {
            if (!popup.contains(e.target) && e.target !== quickTextBtn) {
                popup.classList.add('hidden');
            }
        });

        // 添加快捷文本
        const addBtn = popup.querySelector('#quick-text-add');
        const input = popup.querySelector('#quick-text-input');

        addBtn.addEventListener('click', () => {
            const text = input.value.trim();
            if (text) {
                this.addQuickText(text);
                input.value = '';
                this.loadQuickTexts();
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                addBtn.click();
            }
        });

        // 添加选中文本按钮
        const addSelectionBtn = popup.querySelector('#quick-text-add-selection');
        addSelectionBtn.addEventListener('click', () => {
            this.addSelectedTextToQuickTexts();
        });

        // 管理按钮
        const manageBtn = popup.querySelector('#quick-text-manage');
        manageBtn.addEventListener('click', () => {
            this.showQuickTextManager();
        });
    }

    /**
     * 添加选中文本到快捷文本（保留格式和换行）
     */
    addSelectedTextToQuickTexts() {
        if (!this.richTextManager) return;

        const activeEditor = this.richTextManager.getActiveEditor();
        if (!activeEditor) {
            this.showSaveNotification('error', '请先选择一个编辑区域');
            return;
        }

        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) {
            this.showSaveNotification('error', '请先选中要添加的文本');
            return;
        }

        // 获取选中的HTML内容（保留格式）
        const range = selection.getRangeAt(0);
        const container = document.createElement('div');
        container.appendChild(range.cloneContents());
        const htmlContent = container.innerHTML;

        if (!htmlContent.trim()) {
            this.showSaveNotification('error', '选中的内容为空');
            return;
        }

        // 保存HTML格式的快捷文本
        this.addQuickText(htmlContent, true);
        this.loadQuickTexts();
        this.showSaveNotification('success', '已添加到快捷文本');
    }

    /**
     * 加载快捷文本列表
     */
    loadQuickTexts() {
        const list = document.getElementById('quick-text-list');
        if (!list) return;

        const quickTexts = JSON.parse(localStorage.getItem('quickTexts') || '[]');

        if (quickTexts.length === 0) {
            list.innerHTML = '<div class="text-xs text-gray-500 py-2 text-center">暂无快捷文本</div>';
            return;
        }

        list.innerHTML = quickTexts.map((item, index) => {
            // 支持新旧格式：旧格式是字符串，新格式是对象 {text, isHtml}
            const text = typeof item === 'string' ? item : item.text;
            const isHtml = typeof item === 'object' && item.isHtml;
            // 显示时去除HTML标签，只显示纯文本预览
            const displayText = isHtml ? text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ') : text;
            return `
                <div class="quick-text-item flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#283039] cursor-pointer group" data-index="${index}">
                    <span class="flex-1 text-xs text-white truncate" title="${this._escapeHtml(displayText)}">${this._escapeHtml(displayText.substring(0, 50))}${displayText.length > 50 ? '...' : ''}</span>
                    <button class="quick-text-delete opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity shrink-0" data-index="${index}">
                        <span class="material-symbols-outlined text-[14px]">close</span>
                    </button>
                </div>
            `;
        }).join('');

        // 绑定点击插入事件
        list.querySelectorAll('.quick-text-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.quick-text-delete')) return;
                const index = parseInt(item.dataset.index);
                const quickTextItem = quickTexts[index];
                const text = typeof quickTextItem === 'string' ? quickTextItem : quickTextItem.text;
                const isHtml = typeof quickTextItem === 'object' && quickTextItem.isHtml;
                this.insertQuickText(text, isHtml);
                document.getElementById('quick-text-popup')?.classList.add('hidden');
            });
        });

        // 绑定删除事件
        list.querySelectorAll('.quick-text-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                this.removeQuickText(index);
                this.loadQuickTexts();
            });
        });
    }

    /**
     * 添加快捷文本
     * @param {string} text - 文本内容
     * @param {boolean} isHtml - 是否是HTML格式
     */
    addQuickText(text, isHtml = false) {
        const quickTexts = JSON.parse(localStorage.getItem('quickTexts') || '[]');
        const newItem = isHtml ? { text, isHtml: true } : text;

        // 检查是否已存在
        const exists = quickTexts.some(item => {
            const itemText = typeof item === 'string' ? item : item.text;
            return itemText === text;
        });

        if (!exists) {
            quickTexts.push(newItem);
            localStorage.setItem('quickTexts', JSON.stringify(quickTexts));
        }
    }

    /**
     * 移除快捷文本
     * @param {number} index - 索引
     */
    removeQuickText(index) {
        const quickTexts = JSON.parse(localStorage.getItem('quickTexts') || '[]');
        quickTexts.splice(index, 1);
        localStorage.setItem('quickTexts', JSON.stringify(quickTexts));
    }

    /**
     * 插入快捷文本到当前编辑器
     * @param {string} text - 文本内容
     * @param {boolean} isHtml - 是否是HTML格式
     */
    insertQuickText(text, isHtml = false) {
        if (this.richTextManager) {
            const activeEditor = this.richTextManager.getActiveEditor();
            if (activeEditor) {
                activeEditor.focus();
                if (isHtml) {
                    document.execCommand('insertHTML', false, text);
                } else {
                    document.execCommand('insertText', false, text);
                }
            }
        }
    }

    /**
     * 显示快捷文本管理器
     */
    async showQuickTextManager() {
        const quickTexts = JSON.parse(localStorage.getItem('quickTexts') || '[]');

        // 创建管理弹窗
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[100]';
        modal.innerHTML = `
            <div class="bg-[#1c2127] rounded-xl shadow-2xl w-[500px] max-h-[80vh] flex flex-col">
                <div class="flex items-center justify-between p-4 border-b border-[#283039]">
                    <h3 class="text-white font-medium">管理快捷文本</h3>
                    <button id="close-quick-text-manager" class="text-gray-400 hover:text-white">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div class="flex-1 overflow-y-auto p-4">
                    <div id="quick-text-manager-list" class="space-y-3">
                        ${quickTexts.map((item, index) => {
            // 支持新旧格式
            const text = typeof item === 'string' ? item : item.text;
            const isHtml = typeof item === 'object' && item.isHtml;
            // 显示时去除HTML标签，保留换行
            const displayText = isHtml ? text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?(p|div)[^>]*>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : text;
            return `
                                <div class="flex gap-2 p-2 bg-[#283039] rounded-lg" data-is-html="${isHtml}">
                                    <textarea class="quick-text-edit flex-1 bg-transparent text-white text-sm border-none outline-none resize-none min-h-[60px]" data-index="${index}" data-original="${this._escapeHtml(text)}" data-is-html="${isHtml}">${this._escapeHtml(displayText)}</textarea>
                                    <button class="quick-text-manager-delete text-red-400 hover:text-red-300 self-start mt-1" data-index="${index}">
                                        <span class="material-symbols-outlined text-[18px]">delete</span>
                                    </button>
                                </div>
                            `;
        }).join('')}
                    </div>
                </div>
                <div class="p-4 border-t border-[#283039]">
                    <button id="save-quick-texts" class="w-full py-2 bg-primary text-white rounded-lg hover:bg-primary/90">保存</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 关闭按钮
        modal.querySelector('#close-quick-text-manager').addEventListener('click', () => {
            modal.remove();
        });

        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // 删除按钮
        modal.querySelectorAll('.quick-text-manager-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.flex').remove();
            });
        });

        // 保存按钮
        modal.querySelector('#save-quick-texts').addEventListener('click', () => {
            const textareas = modal.querySelectorAll('.quick-text-edit');
            const newQuickTexts = Array.from(textareas).map(textarea => {
                const text = textarea.value.trim();
                if (!text) return null;
                // 将换行转换为 <br> 保存为 HTML 格式
                if (text.includes('\n')) {
                    return { text: text.replace(/\n/g, '<br>'), isHtml: true };
                }
                return text;
            }).filter(item => item !== null);
            localStorage.setItem('quickTexts', JSON.stringify(newQuickTexts));
            this.loadQuickTexts();
            modal.remove();
            this.showSaveNotification('success', '快捷文本已保存');
        });
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
     * 更新文本框选择器选项
     */
    updateTextboxSelector() {
        const textboxSelector = document.getElementById('textbox-selector');
        if (!textboxSelector || !this.richTextManager) return;

        const textBoxes = this.richTextManager.getAllTextBoxes();

        // 清空现有选项（保留第一个默认选项）
        textboxSelector.innerHTML = '<option value="">选择模块</option>';

        // 添加文本框选项
        textBoxes.forEach((textBox, index) => {
            const option = document.createElement('option');
            option.value = textBox.id;
            option.textContent = textBox.title || `模块 ${index + 1}`;
            textboxSelector.appendChild(option);
        });
    }

    /**
     * 初始化保存按钮
     * 需求: 11.2 - 点击保存按钮立即保存
     */
    initSaveButton() {
        const saveBtn = document.getElementById('save-btn');
        if (!saveBtn) return;

        saveBtn.addEventListener('click', () => {
            this.handleManualSave();
        });
    }

    /**
     * 初始化历史记录按钮
     */
    initHistoryButton() {
        const historyBtn = document.getElementById('history-btn');
        if (!historyBtn) return;

        historyBtn.addEventListener('click', () => {
            this.showHistoryModal();
        });
    }

    /**
     * 显示历史记录弹窗
     */
    showHistoryModal() {
        if (!this.currentProjectId || !this.projectManager) {
            modalDialog.alert('请先选择一个项目');
            return;
        }

        const history = this.projectManager.getProjectHistory(this.currentProjectId);

        // 创建弹窗
        const modal = document.createElement('div');
        modal.className = 'history-modal fixed inset-0 flex items-center justify-center z-[100]';
        modal.innerHTML = `
            <div class="history-dialog rounded-xl shadow-2xl w-[500px] max-h-[70vh] flex flex-col">
                <div class="history-dialog-header flex items-center justify-between p-4 border-b">
                    <h3 class="font-medium">保存历史记录</h3>
                    <button id="close-history-modal" class="history-close" aria-label="关闭历史记录">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div id="history-list-container" class="flex-1 overflow-y-auto p-4">
                    ${this._renderHistoryList(history)}
                </div>
                ${history.length > 0 ? `
                    <div class="history-dialog-footer p-4 border-t">
                        <button id="clear-history-btn" class="history-danger w-full py-2 text-sm transition-colors">
                            清除所有历史记录
                        </button>
                    </div>
                ` : ''}
            </div>
        `;

        document.body.appendChild(modal);

        // 关闭按钮
        modal.querySelector('#close-history-modal').addEventListener('click', () => {
            modal.remove();
        });

        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // 绑定列表事件
        this._bindHistoryListEvents(modal);

        // 清除历史记录按钮
        const clearBtn = modal.querySelector('#clear-history-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', async () => {
                const confirmed = await modalDialog.confirm('确定要清除所有历史记录吗？此操作不可恢复。');
                if (confirmed) {
                    this.projectManager.clearProjectHistory(this.currentProjectId);
                    modal.remove();
                    this.showSaveNotification('success', '历史记录已清除');
                }
            });
        }
    }

    /**
     * 渲染历史记录列表
     * @param {Array} history - 历史记录数组
     * @returns {string} HTML字符串
     * @private
     */
    _renderHistoryList(history) {
        if (history.length === 0) {
            return `
                <div class="history-empty text-center py-8">
                    <span class="material-symbols-outlined text-[48px] mb-2">history</span>
                    <p>暂无保存记录</p>
                    <p class="text-xs mt-1">点击保存按钮后会自动记录</p>
                </div>
            `;
        }

        return `
            <div class="space-y-2">
                ${history.map(item => {
            const date = new Date(item.timestamp);
            const timeStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
            const typeLabel = item.saveType === 'manual' ? '手动保存' : '自动保存';
            const typeClass = item.saveType === 'manual' ? 'history-type-manual' : 'history-type-auto';

            return `
                        <div class="history-item flex items-center justify-between p-3 rounded-lg transition-colors group" data-snapshot-id="${item.id}">
                            <div class="flex items-center gap-3">
                                <span class="history-muted material-symbols-outlined">schedule</span>
                                <div>
                                    <div class="history-time text-sm">${timeStr}</div>
                                    <span class="text-xs px-2 py-0.5 rounded ${typeClass}">${typeLabel}</span>
                                </div>
                            </div>
                            <div class="history-item-actions flex items-center gap-2 transition-all">
                                <button class="restore-btn px-2 py-1 text-xs" data-snapshot-id="${item.id}" title="恢复此记录">
                                    <span class="material-symbols-outlined text-[18px]">restore</span>
                                </button>
                                <button class="delete-snapshot-btn history-danger px-2 py-1 text-xs" data-snapshot-id="${item.id}" title="删除此记录">
                                    <span class="material-symbols-outlined text-[18px]">delete</span>
                                </button>
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    }

    /**
     * 绑定历史记录列表事件
     * @param {HTMLElement} modal - 弹窗元素
     * @private
     */
    _bindHistoryListEvents(modal) {
        const container = modal.querySelector('#history-list-container');
        if (!container) return;

        // 恢复按钮
        container.querySelectorAll('.restore-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const snapshotId = btn.dataset.snapshotId;
                const confirmed = await modalDialog.confirm('确定要恢复到此时间点吗？当前未保存的更改将会丢失。');
                if (confirmed) {
                    this.restoreFromSnapshot(snapshotId);
                    modal.remove();
                }
            });
        });

        // 删除按钮
        container.querySelectorAll('.delete-snapshot-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const snapshotId = btn.dataset.snapshotId;
                const confirmed = await modalDialog.confirm('确定要删除此记录吗？');
                if (confirmed) {
                    this.projectManager.deleteProjectSnapshot(this.currentProjectId, snapshotId);
                    // 重新渲染列表
                    const history = this.projectManager.getProjectHistory(this.currentProjectId);
                    container.innerHTML = this._renderHistoryList(history);
                    this._bindHistoryListEvents(modal);

                    // 如果没有记录了，隐藏清除按钮
                    if (history.length === 0) {
                        const clearBtn = modal.querySelector('#clear-history-btn');
                        if (clearBtn) {
                            clearBtn.parentElement.remove();
                        }
                    }
                }
            });
        });
    }

    /**
     * 从快照恢复项目
     * @param {string} snapshotId - 快照ID
     */
    restoreFromSnapshot(snapshotId) {
        if (!this.currentProjectId || !this.projectManager) return;

        const restoredData = this.projectManager.restoreProjectSnapshot(this.currentProjectId, snapshotId);
        if (!restoredData) {
            this.showSaveNotification('error', '恢复失败');
            return;
        }

        // 重新加载绘制元素
        if (this.canvasManager) {
            this.canvasManager.loadElements(restoredData.drawingElements || []);
            this.canvasManager.loadDividerLines(restoredData.dividerLines || []);
        }

        // 重新加载文本框
        if (this.richTextManager) {
            this.richTextManager.loadTextBoxes(restoredData.textBoxes || []);
        }

        // 更新保存状态
        this.updateSaveStatusDisplay('saved');
        this.showSaveNotification('success', '已恢复到所选时间点');
    }

    /**
     * 处理手动保存
     * 需求: 11.2
     */
    async handleManualSave() {
        if (!this.currentProjectId) {
            this.showSaveNotification('error', '无法保存：未选择项目');
            return;
        }

        const projectName = document.getElementById('project-name')?.value || '未命名项目';

        // 使用AutoSaveManager进行保存
        if (this.autoSaveManager) {
            const success = await this.autoSaveManager.manualSave();
            if (success) {
                // 保存快照到历史记录
                if (this.projectManager) {
                    this.projectManager.saveProjectSnapshot(this.currentProjectId, 'manual');
                }
                this.showSaveNotification('success', '保存成功');
                // 添加进行中统计记录
                this.addStatisticsRecord(this.currentProjectId, projectName, 'pending');
            } else {
                this.showSaveNotification('error', '保存失败');
            }
        } else {
            // 回退到直接保存
            const success = await this.performSave(this.currentProjectId);
            if (success) {
                // 保存快照到历史记录
                if (this.projectManager) {
                    this.projectManager.saveProjectSnapshot(this.currentProjectId, 'manual');
                }
                this.showSaveNotification('success', '保存成功');
                this.updateSaveStatusDisplay('saved');
                // 添加进行中统计记录
                this.addStatisticsRecord(this.currentProjectId, projectName, 'pending');
            } else {
                this.showSaveNotification('error', '保存失败');
                this.updateSaveStatusDisplay('error');
            }
        }
    }

    /**
     * 显示保存通知
     * @param {string} type - 通知类型 ('success', 'error')
     * @param {string} message - 通知消息
     */
    showSaveNotification(type, message) {
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 transition-all duration-300 transform translate-x-full`;

        if (type === 'success') {
            notification.classList.add('bg-green-500', 'text-white');
            notification.innerHTML = `
                <span class="material-symbols-outlined text-[20px]">check_circle</span>
                <span class="text-sm font-medium">${message}</span>
            `;
        } else {
            notification.classList.add('bg-red-500', 'text-white');
            notification.innerHTML = `
                <span class="material-symbols-outlined text-[20px]">error</span>
                <span class="text-sm font-medium">${message}</span>
            `;
        }

        document.body.appendChild(notification);

        // 动画显示
        requestAnimationFrame(() => {
            notification.classList.remove('translate-x-full');
        });

        // 3秒后自动消失
        setTimeout(() => {
            notification.classList.add('translate-x-full');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }

    /**
     * 初始化删除按钮
     */
    initDeleteButton() {
        const deleteBtn = document.getElementById('delete-btn');
        if (!deleteBtn) return;

        deleteBtn.addEventListener('click', async () => {
            if (!this.currentProjectId) return;

            const confirmed = await modalDialog.confirm('确定要删除此任务吗？此操作不可撤销。');
            if (confirmed) {
                // 删除统计记录
                this.deleteStatisticsRecord(this.currentProjectId);

                const success = this.deleteProject(this.currentProjectId);
                if (success) {
                    // 导航回主页
                    this.router.navigate('home');
                }
            }
        });
    }

    /**
     * 初始化完成按钮
     */
    initCompleteButton() {
        const completeBtn = document.getElementById('complete-btn');
        if (!completeBtn) return;

        completeBtn.addEventListener('click', async () => {
            if (!this.currentProjectId) return;

            const projectName = document.getElementById('project-name')?.value || '未命名项目';

            const confirmed = await modalDialog.confirm(`确定要将项目"${projectName}"标记为完成吗？\n\n完成后项目将被删除，统计数据将保留。`);
            if (confirmed) {
                // 添加完成统计记录
                this.addStatisticsRecord(this.currentProjectId, projectName, 'completed');

                // 删除项目
                const success = this.deleteProject(this.currentProjectId);
                if (success) {
                    this.showSaveNotification('success', '项目已完成');
                    // 导航回主页
                    this.router.navigate('home');
                }
            }
        });
    }

    /**
     * 添加统计记录
     * @param {string} projectId - 项目ID
     * @param {string} projectName - 项目名称
     * @param {string} status - 状态 ('completed' 或 'pending')
     */
    async addStatisticsRecord(projectId, projectName, status) {
        try {
            await fetch('/api/statistics/record', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, projectName, status })
            });
        } catch (e) {
        }
    }

    /**
     * 删除统计记录
     * @param {string} projectId - 项目ID
     */
    async deleteStatisticsRecord(projectId) {
        try {
            await fetch(`/api/statistics/by-project/${projectId}`, {
                method: 'DELETE'
            });
        } catch (e) {
        }
    }

    /**
     * 初始化导出按钮
     */
    initExportButton() {
        const exportBtn = document.getElementById('export-btn');
        if (!exportBtn) return;

        exportBtn.addEventListener('click', () => {
            this.handleExport();
        });
    }

    /**
     * 处理导出
     * 需求: 9.1
     */
    async handleExport() {
        debugLogger.call('handleExport', { projectId: this.currentProjectId });
        debugLogger.step('开始导出项目');

        if (!this.currentProjectId) {
            debugLogger.logError('导出失败：未选择项目');
            await modalDialog.alert('请先选择一个项目');
            debugLogger.return('handleExport', false);
            return;
        }

        try {
            const templateResponse = await fetch('/api/export/template');
            if (!templateResponse.ok) throw new Error('无法读取模板状态');
            const template = await templateResponse.json();
            if (!template.uploaded) {
                document.querySelector('.export-notification')?.remove();
                const goToSettings = await modalDialog.confirm('请先在设置中上传 Word 模板。现在前往设置？', '缺少模板');
                if (goToSettings) this.router.navigate('settings');
                debugLogger.return('handleExport', false);
                return;
            }
        } catch (error) {
            this.showExportNotification('error', '无法检查模板，请确认服务已启动');
            debugLogger.return('handleExport', false);
            return;
        }

        // 浏览器数据库异常时不能让导出按钮无限等待。
        debugLogger.step('加载项目数据');
        const storedProject = this.projectManager.loadProject(this.currentProjectId);
        if (!storedProject) {
            await modalDialog.alert('项目数据无法读取');
            debugLogger.return('handleExport', false);
            return;
        }
        let imageLoadTimer;
        let project;
        try {
            project = await Promise.race([
                this.projectManager.loadProjectWithImage(this.currentProjectId),
                new Promise(resolve => {
                    imageLoadTimer = setTimeout(() => resolve(null), 5000);
                })
            ]);
        } catch (error) {
            debugLogger.logError('图像读取失败', { error: error.message });
        } finally {
            clearTimeout(imageLoadTimer);
        }
        project ||= storedProject;

        let exportData;
        try {
            exportData = this.collectExportData(project);
        } catch (error) {
            this.showExportNotification('error', '读取标注内容失败: ' + error.message);
            debugLogger.return('handleExport', false);
            return;
        }
        if (!project.imageData) {
            const hasText = exportData.textBoxes.some(box => box.content?.trim());
            if (!hasText) {
                await modalDialog.alert('没有可导出的图像或文字');
                debugLogger.return('handleExport', false);
                return;
            }
            if (project.imageInIndexedDB) {
                const confirmed = await modalDialog.confirm('图像暂时无法从浏览器存储读取。是否仅导出文字说明？');
                if (!confirmed) {
                    debugLogger.return('handleExport', false);
                    return;
                }
            }
        }

        debugLogger.checkpoint('项目数据加载成功', {
            projectId: project.id,
            projectName: project.name,
            hasImage: !!project.imageData
        });

        // 显示导出中提示
        this.showExportNotification('loading', '正在导出...');

        try {
            // 收集导出数据
            debugLogger.step('收集导出数据');
            // 添加图片质量参数
            const imageQuality = parseInt(localStorage.getItem('imageQuality') || '85');
            exportData.imageQuality = imageQuality;
            await this.restoreRichImagesForExport(exportData.textBoxes);

            debugLogger.checkpoint('导出数据收集完成', {
                projectName: exportData.projectName,
                dividerLineCount: exportData.dividerLines?.length || 0,
                textBoxCount: exportData.textBoxes?.length || 0,
                drawingElementCount: exportData.drawingElements?.length || 0,
                imageRegionCount: exportData.imageRegions?.length || 0,
                imageQuality: imageQuality,
                displaySize: {
                    width: exportData.displayWidth,
                    height: exportData.displayHeight
                }
            });

            // 调用后端API - 直接返回文件流
            debugLogger.step('调用后端导出API');
            const response = await fetch('/api/export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(exportData)
            });

            debugLogger.checkpoint('API响应', {
                status: response.status,
                ok: response.ok,
                statusText: response.statusText
            });

            if (response.ok) {
                // 从响应头获取文件名
                const contentDisposition = response.headers.get('Content-Disposition');
                let filename = `${project.name || '未命名项目'}_模板说明.docx`;
                if (contentDisposition) {
                    const filenameMatch = contentDisposition.match(/filename\*?=['"]?(?:UTF-8'')?([^;\n"']+)/i);
                    if (filenameMatch && filenameMatch[1]) {
                        filename = decodeURIComponent(filenameMatch[1]);
                    }
                }

                debugLogger.step('下载文件', { filename });

                // 获取blob并触发下载
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);

                this.showExportNotification('success', '导出成功');
                debugLogger.logAction('导出项目成功', {
                    projectId: project.id,
                    projectName: project.name,
                    filename,
                    fileSize: blob.size
                });
                debugLogger.return('handleExport', true);
            } else {
                // 尝试解析错误信息
                const result = await response.json();
                if (result.code === 'TEMPLATE_MISSING') {
                    document.querySelector('.export-notification')?.remove();
                    const goToSettings = await modalDialog.confirm('请先在设置中上传 Word 模板。现在前往设置？', '缺少模板');
                    if (goToSettings) this.router.navigate('settings');
                    debugLogger.return('handleExport', false);
                    return;
                }
                debugLogger.logError('导出失败：API返回错误', {
                    status: response.status,
                    message: result.message
                });
                this.showExportNotification('error', result.message || '导出失败');
                debugLogger.return('handleExport', false);
            }
        } catch (error) {
            debugLogger.logError('导出失败：异常', {
                error: error.message,
                stack: error.stack
            });
            this.showExportNotification('error', '导出失败: ' + error.message);
            debugLogger.return('handleExport', false);
        }
    }

    /**
     * 收集导出数据
     * @param {Object} project - 项目数据
     * @returns {Object} 导出数据
     */
    async restoreRichImagesForExport(textBoxes) {
        for (const box of textBoxes) {
            if (!box.content?.includes('data-annotate-image-id')) continue;
            const container = document.createElement('div');
            container.innerHTML = box.content;
            for (const img of container.querySelectorAll('img[data-annotate-image-id]')) {
                const blob = await this.projectManager.loadRichImage(img.dataset.annotateImageId);
                if (!blob) throw new Error('富文本贴图无法读取，请检查浏览器数据');
                img.src = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => reject(reader.error);
                    reader.readAsDataURL(blob);
                });
                img.removeAttribute('data-annotate-image-id');
            }
            box.content = container.innerHTML;
        }
    }

    collectExportData(project) {
        const exportData = {
            projectId: project.id,
            projectName: project.name || '未命名项目',
            imageData: project.imageData,
            imageRegions: [],
            textBoxes: [],
            dividerLines: [],
            drawingElements: [],
            displayWidth: null,
            displayHeight: null
        };

        // 获取当前显示的图像尺寸（用于坐标转换）
        const imageWrapper = document.getElementById('image-wrapper');
        if (imageWrapper) {
            exportData.displayWidth = imageWrapper.clientWidth;
            exportData.displayHeight = imageWrapper.clientHeight;
        }

        // 收集分割线数据和绘制元素
        if (this.canvasManager) {
            exportData.dividerLines = this.canvasManager.exportDividerLines();
            exportData.imageRegions = this.canvasManager.getImageRegions();
            exportData.drawingElements = this.canvasManager.exportElements();
        } else {
            if (project.dividerLines) {
                exportData.dividerLines = project.dividerLines;
            }
            if (project.drawingElements) {
                exportData.drawingElements = project.drawingElements;
            }
            if (project.imageRegions) {
                exportData.imageRegions = project.imageRegions;
            }
        }

        // 收集富文本数据
        if (this.richTextManager) {
            exportData.textBoxes = this.richTextManager.exportTextBoxes().map(box => ({ ...box }));
        } else if (project.textBoxes) {
            exportData.textBoxes = project.textBoxes.map(box => ({ ...box }));
        }

        return exportData;
    }

    /**
     * 显示导出通知
     * @param {string} type - 通知类型 ('loading', 'success', 'error')
     * @param {string} message - 通知消息
     */
    showExportNotification(type, message) {
        // 移除之前的导出通知
        const existingNotification = document.querySelector('.export-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = 'export-notification fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 transition-all duration-300 transform translate-x-full';

        if (type === 'loading') {
            notification.classList.add('bg-blue-500', 'text-white');
            notification.innerHTML = `
                <span class="material-symbols-outlined text-[20px] animate-spin">sync</span>
                <span class="text-sm font-medium">${message}</span>
            `;
        } else if (type === 'success') {
            notification.classList.add('bg-green-500', 'text-white');
            notification.innerHTML = `
                <span class="material-symbols-outlined text-[20px]">check_circle</span>
                <span class="text-sm font-medium">${message}</span>
            `;
        } else {
            notification.classList.add('bg-red-500', 'text-white');
            notification.innerHTML = `
                <span class="material-symbols-outlined text-[20px]">error</span>
                <span class="text-sm font-medium">${message}</span>
            `;
        }

        document.body.appendChild(notification);

        // 动画显示
        requestAnimationFrame(() => {
            notification.classList.remove('translate-x-full');
        });

        // 非loading状态3秒后自动消失
        if (type !== 'loading') {
            setTimeout(() => {
                notification.classList.add('translate-x-full');
                setTimeout(() => {
                    notification.remove();
                }, 300);
            }, 3000);
        }
    }

    /**
     * 加载已保存的文本框数据
     */
    loadSavedTextBoxes() {
        if (!this.currentProjectId || !this.projectManager || !this.richTextManager) return;

        const project = this.projectManager.loadProject(this.currentProjectId);

        if (project && project.textBoxes) {
            this.richTextManager.loadTextBoxes(project.textBoxes);
        }
    }

    /**
     * 更新撤销/重做按钮状态
     */
    updateUndoRedoButtons() {
        if (!this.canvasManager) return;

        const undoBtn = document.getElementById('tool-undo');
        const redoBtn = document.getElementById('tool-redo');

        const canUndo = this.canvasManager.canUndo();
        const canRedo = this.canvasManager.canRedo();

        if (undoBtn) {
            undoBtn.disabled = !canUndo;
        }
        if (redoBtn) {
            redoBtn.disabled = !canRedo;
        }
    }

    /**
     * 设置活动工具
     * @param {string} tool - 工具类型
     * @param {HTMLElement} btn - 按钮元素
     */
    setActiveTool(tool, btn) {
        if (this.canvasManager) {
            this.canvasManager.setTool(tool);
        }

        // 更新按钮样式
        const toolButtons = document.querySelectorAll('.tool-btn');
        toolButtons.forEach(b => {
            b.classList.remove('bg-primary', 'text-white', 'shadow-sm');
            b.classList.add('text-[#9dabb9]');
        });

        if (btn) {
            btn.classList.remove('text-[#9dabb9]');
            btn.classList.add('bg-primary', 'text-white', 'shadow-sm');
        }

        // 控制重置序号按钮的显示/隐藏
        const resetStepsBtn = document.getElementById('tool-reset-steps');
        if (resetStepsBtn) {
            if (tool === ToolType.STEP) {
                resetStepsBtn.classList.remove('hidden');
            } else {
                resetStepsBtn.classList.add('hidden');
            }
        }
    }

    /**
     * 设置活动颜色
     * @param {string} color - 颜色值
     * @param {HTMLElement} picker - 颜色选择器元素
     */
    setActiveColor(color, picker) {
        if (this.canvasManager) {
            this.canvasManager.setColor(color);
        }

        // 更新颜色选择器样式
        const colorPickers = document.querySelectorAll('.color-picker');
        colorPickers.forEach(p => {
            p.classList.remove('ring-2', 'ring-white/20');
        });

        if (picker) {
            picker.classList.add('ring-2', 'ring-white/20');
        }
    }

    /**
     * 根据选择更新工具栏
     * @param {Object|null} element - 选中的元素
     */
    updateToolbarForSelection(element) {
        // 显示/隐藏文本元素工具（只对文本元素显示）
        const textElementTools = document.getElementById('text-element-tools');
        if (textElementTools) {
            if (element && element.type === 'text') {
                textElementTools.classList.remove('hidden');
            } else {
                textElementTools.classList.add('hidden');
            }
        }

        if (!element) return;

        // 更新颜色选择器
        const colorPickers = document.querySelectorAll('.color-picker');
        colorPickers.forEach(p => {
            p.classList.remove('ring-2', 'ring-white/20');
            if (p.dataset.color === element.style.color) {
                p.classList.add('ring-2', 'ring-white/20');
            }
        });

        // 只对文本元素更新字体设置
        if (element.type === 'text') {
            // 更新字体选择器
            if (element.style.fontFamily) {
                const fontFamily = document.getElementById('font-family');
                if (fontFamily) {
                    fontFamily.value = element.style.fontFamily;
                }
            }

            // 更新字体大小
            if (element.style.fontSize) {
                const fontSize = document.getElementById('font-size');
                if (fontSize) {
                    fontSize.value = element.style.fontSize;
                }
            }
        }
    }

    /**
     * 加载已保存的绘制元素和分割线
     */
    loadSavedDrawingElements() {
        if (!this.currentProjectId || !this.projectManager || !this.canvasManager) return;

        const project = this.projectManager.loadProject(this.currentProjectId);
        if (project) {
            // 加载绘制元素
            if (project.drawingElements) {
                this.canvasManager.loadElements(project.drawingElements);
            }
            // 加载分割线
            if (project.dividerLines) {
                this.canvasManager.loadDividerLines(project.dividerLines);
            }
        }
    }

    /**
     * 初始化设置页面
     */
    initSettingsPage() {
        debugLogger.call('initSettingsPage');
        debugLogger.step('开始初始化设置页面');

        // 等待 DOM 渲染完成后再初始化
        setTimeout(() => {
            debugLogger.step('DOM渲染完成，开始初始化各项设置');

            // 设置页面特定初始化逻辑
            ThemeManager.initSettings();

            // 初始化自动保存开关
            debugLogger.step('初始化自动保存开关');
            this.initAutoSaveToggle();

            // 初始化热键设置
            debugLogger.step('初始化热键设置');
            this.initHotkeySettings();

            // 初始化调试模式开关
            debugLogger.step('初始化调试模式开关');
            this.initDebugModeToggle();

            // 初始化图片质量滑块
            debugLogger.step('初始化图片质量滑块');
            this.initImageQualitySlider();
            this.initPimTemplateSetting();

            debugLogger.checkpoint('设置页面初始化完成');
            debugLogger.return('initSettingsPage');
        }, 0);
    }

    /**
     * 初始化热键设置
     */
    initHotkeySettings() {
        const editHotkeysBtn = document.getElementById('edit-hotkeys-btn');
        if (!editHotkeysBtn) return;

        editHotkeysBtn.addEventListener('click', () => {
            this.showHotkeySettingsModal();
        });
    }

    /**
     * 初始化全局热键处理
     */
    initGlobalHotkeys() {
        // 移除之前的监听器（如果存在）
        if (this._globalHotkeyHandler) {
            document.removeEventListener('keydown', this._globalHotkeyHandler);
        }

        this._globalHotkeyHandler = (e) => {
            // 如果正在输入文本，不处理热键（除了特定的组合键）
            const activeElement = document.activeElement;
            const isTyping = activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.isContentEditable ||
                activeElement.closest('[contenteditable="true"]')
            );

            // 获取热键配置
            const hotkeys = this.getHotkeyConfig();

            // 检查是否匹配任何热键
            for (const [actionId, config] of Object.entries(hotkeys)) {
                if (this.matchHotkey(e, config)) {
                    // 如果正在输入，只允许带修饰键的热键
                    if (isTyping && !config.ctrl && !config.alt) {
                        continue;
                    }

                    e.preventDefault();
                    e.stopPropagation();
                    this.executeHotkeyAction(actionId);
                    return;
                }
            }
        };

        document.addEventListener('keydown', this._globalHotkeyHandler);
    }

    /**
     * 获取热键配置
     */
    getHotkeyConfig() {
        // 默认热键配置 - 全部为空，用户自行设置
        const defaultHotkeys = {
            // 标注工具
            'tool-rectangle': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '矩形工具', group: '标注工具' },
            'tool-text': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '文本工具', group: '标注工具' },
            'tool-step': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '步骤标注', group: '标注工具' },
            'tool-reset-steps': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '重置序号', group: '标注工具' },
            'tool-divider': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '分割线工具', group: '标注工具' },
            'tool-image-box': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '图片框工具', group: '标注工具' },
            'tool-clear': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '清除所有', group: '标注工具' },
            'tool-undo': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '撤销', group: '标注工具' },
            'tool-redo': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '重做', group: '标注工具' },
            'draw-color-cycle': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '切换颜色', group: '标注工具' },
            // 富文本工具
            'richtext-color': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '文本颜色', group: '富文本工具' },
            'richtext-fontsize-up': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '增大字号', group: '富文本工具' },
            'richtext-fontsize-down': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '减小字号', group: '富文本工具' },
            'richtext-quick-text': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '快捷文本', group: '富文本工具' },
            // 任务操作
            'save': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '保存', group: '任务操作' },
            'export': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '导出', group: '任务操作' }
        };

        // 加载已保存的热键配置，只合并热键设置，保留默认的 label 和 group
        const savedHotkeys = JSON.parse(localStorage.getItem('hotkeys') || '{}');
        const result = { ...defaultHotkeys };

        // 只合并热键相关的属性，不覆盖 label 和 group
        Object.keys(savedHotkeys).forEach(id => {
            if (result[id]) {
                const saved = savedHotkeys[id];
                result[id] = {
                    ...result[id],
                    key: saved.key || '',
                    code: saved.code || '',
                    ctrl: saved.ctrl || false,
                    alt: saved.alt || false,
                    shift: saved.shift || false
                };
            }
        });

        return result;
    }

    /**
     * 检查按键事件是否匹配热键配置
     * @param {KeyboardEvent} e - 键盘事件
     * @param {Object} config - 热键配置
     * @returns {boolean} 是否匹配
     */
    matchHotkey(e, config) {
        // 如果热键未设置，跳过
        if (!config.key && !config.code) {
            return false;
        }

        // 检查修饰键
        const ctrlMatch = config.ctrl === (e.ctrlKey || e.metaKey);
        const altMatch = config.alt === e.altKey;
        const shiftMatch = config.shift === e.shiftKey;

        if (!ctrlMatch || !altMatch || !shiftMatch) {
            return false;
        }

        // 使用 code 来匹配按键（避免 Option+字母 产生特殊字符的问题）
        if (config.code && e.code) {
            return e.code === config.code;
        }

        // 回退到 key 匹配
        if (config.key) {
            const pressedKey = e.key.toLowerCase();
            const configKey = config.key.toLowerCase();
            return pressedKey === configKey;
        }

        return false;
    }

    /**
     * 执行热键对应的操作
     * @param {string} actionId - 操作ID
     */
    executeHotkeyAction(actionId) {
        // 标注绘制颜色预设列表（循环切换用，与工具栏颜色一致）
        const drawColorList = [
            '#FFFF00', // 黄色 - 文案可编辑
            '#16DCDB', // 青色 - 文案导入
            '#FF0100', // 红色 - 文案映射
            '#97CC02', // 绿色 - 读取SKU颜色文案
            '#F31CF4', // 紫色 - 读取图片命名文案
            '#3894E4'  // 蓝色 - 读取模特配置文案
        ];

        switch (actionId) {
            case 'tool-rectangle':
                this.setActiveTool(ToolType.RECTANGLE, document.getElementById('tool-rectangle'));
                break;
            case 'tool-text':
                this.setActiveTool(ToolType.TEXT, document.getElementById('tool-text'));
                break;
            case 'tool-step':
                this.setActiveTool(ToolType.STEP, document.getElementById('tool-step'));
                break;
            case 'tool-reset-steps':
                document.getElementById('tool-reset-steps')?.click();
                break;
            case 'tool-divider':
                this.setActiveTool(ToolType.DIVIDER, document.getElementById('tool-divider'));
                break;
            case 'tool-image-box':
                this.setActiveTool(ToolType.IMAGE_BOX, document.getElementById('tool-image-box'));
                break;
            case 'tool-clear':
                document.getElementById('tool-clear')?.click();
                break;
            case 'tool-undo':
                if (this.canvasManager && this.canvasManager.canUndo()) {
                    this.canvasManager.undo();
                }
                break;
            case 'tool-redo':
                if (this.canvasManager && this.canvasManager.canRedo()) {
                    this.canvasManager.redo();
                }
                break;
            // 标注绘制颜色循环切换
            case 'draw-color-cycle':
                if (this.canvasManager) {
                    const currentColor = (this.canvasManager.currentColor || '#FFFF00').toUpperCase();
                    let currentIndex = drawColorList.findIndex(c => c.toUpperCase() === currentColor);
                    if (currentIndex === -1) currentIndex = 0;
                    const nextIndex = (currentIndex + 1) % drawColorList.length;
                    const nextColor = drawColorList[nextIndex];

                    this.canvasManager.setColor(nextColor);
                    // 更新颜色选择器显示
                    const colorPicker = document.getElementById('element-color');
                    if (colorPicker) {
                        colorPicker.value = nextColor;
                    }
                    // 更新颜色预设按钮的选中状态
                    this.updateColorPickerSelection(nextColor);
                }
                break;
            // 富文本文本颜色
            case 'richtext-color':
                // 打开颜色选择器
                document.getElementById('rich-font-color')?.click();
                break;
            // 快捷文本
            case 'richtext-quick-text':
                document.getElementById('quick-text-btn')?.click();
                break;
            case 'save':
                this.handleManualSave();
                break;
            case 'export':
                document.getElementById('export-btn')?.click();
                break;
        }
    }

    /**
     * 更新颜色选择器的选中状态
     * @param {string} color - 颜色值
     */
    updateColorPickerSelection(color) {
        const colorPickers = document.querySelectorAll('.color-picker');
        colorPickers.forEach(picker => {
            const pickerColor = picker.dataset.color?.toUpperCase();
            if (pickerColor === color.toUpperCase()) {
                picker.classList.add('ring-2', 'ring-white/20');
            } else {
                picker.classList.remove('ring-2', 'ring-white/20');
            }
        });
    }

    /**
     * 调整富文本字号
     * @param {number} delta - 字号变化量
     */
    adjustRichTextFontSize(delta) {
        const fontSizeSelect = document.getElementById('richtext-font-size');
        if (!fontSizeSelect) return;

        const currentSize = parseInt(fontSizeSelect.value) || 24;
        const newSize = Math.max(12, Math.min(72, currentSize + delta));
        fontSizeSelect.value = newSize;

        if (this.richTextManager) {
            this.richTextManager.applyFontSize(newSize);
        }
    }

    /**
     * 显示热键设置弹窗
     */
    showHotkeySettingsModal() {
        // 检测是否是 Mac
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0 || navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;

        // 默认热键配置 - 全部为空
        const defaultHotkeys = {
            // 标注工具
            'tool-rectangle': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '矩形工具', group: '标注工具' },
            'tool-text': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '文本工具', group: '标注工具' },
            'tool-step': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '步骤标注', group: '标注工具' },
            'tool-divider': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '分割线工具', group: '标注工具' },
            'tool-image-box': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '图片框工具', group: '标注工具' },
            'tool-clear': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '清除所有', group: '标注工具' },
            'tool-undo': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '撤销', group: '标注工具' },
            'tool-redo': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '重做', group: '标注工具' },
            'draw-color-cycle': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '切换颜色', group: '标注工具' },
            // 富文本工具
            'richtext-color': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '文本颜色', group: '富文本工具' },
            'richtext-fontsize-up': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '增大字号', group: '富文本工具' },
            'richtext-fontsize-down': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '减小字号', group: '富文本工具' },
            'richtext-quick-text': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '快捷文本', group: '富文本工具' },
            // 任务操作
            'save': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '保存', group: '任务操作' },
            'export': { key: '', code: '', ctrl: false, alt: false, shift: false, label: '导出', group: '任务操作' }
        };

        // 加载已保存的热键配置
        const savedHotkeys = JSON.parse(localStorage.getItem('hotkeys') || '{}');
        const hotkeys = { ...defaultHotkeys, ...savedHotkeys };

        // 按分组组织热键
        const groups = {};
        Object.entries(hotkeys).forEach(([id, config]) => {
            const group = config.group || '绘制工具';
            if (!groups[group]) groups[group] = [];
            groups[group].push({ id, ...config });
        });

        // 创建弹窗
        const modal = document.createElement('div');
        modal.id = 'hotkey-settings-modal';
        modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[100]';
        modal.innerHTML = `
            <div class="bg-[#1c2127] rounded-xl shadow-2xl w-[500px] max-h-[80vh] flex flex-col">
                <div class="flex items-center justify-between p-4 border-b border-[#283039]">
                    <h3 class="text-white font-medium">热键设置</h3>
                    <button id="close-hotkey-modal" class="text-gray-400 hover:text-white">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div class="flex-1 overflow-y-auto p-4">
                    <div id="hotkey-list" class="space-y-4">
                        ${Object.entries(groups).map(([groupName, items]) => `
                            <div class="space-y-2">
                                <div class="text-xs text-gray-500 font-medium px-1">${groupName}</div>
                                ${items.map(item => `
                                    <div class="flex items-center justify-between p-3 bg-[#283039] rounded-lg" data-hotkey-id="${item.id}">
                                        <span class="text-white text-sm">${item.label}</span>
                                        <div class="flex items-center gap-2">
                                            <div class="hotkey-display flex items-center gap-1 px-3 py-1.5 bg-[#1c2127] rounded text-xs text-gray-300 cursor-pointer hover:bg-[#3b4754] min-w-[80px] justify-center" data-hotkey-id="${item.id}">
                                                ${this.formatHotkeyDisplay(item)}
                                            </div>
                                            <button class="reset-hotkey text-gray-400 hover:text-white" data-hotkey-id="${item.id}" title="清除">
                                                <span class="material-symbols-outlined text-[16px]">close</span>
                                            </button>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        `).join('')}
                    </div>
                    <div id="hotkey-conflict" class="hidden mt-3 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm">
                        <span class="material-symbols-outlined text-[16px] mr-1">warning</span>
                        <span id="conflict-message"></span>
                    </div>
                </div>
                <div class="p-4 border-t border-[#283039] flex gap-2">
                    <button id="reset-all-hotkeys" class="flex-1 py-2 bg-[#283039] text-white rounded-lg hover:bg-[#3b4754]">清除全部</button>
                    <button id="save-hotkeys" class="flex-1 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">保存</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 当前编辑的热键
        let editingHotkeyId = null;
        let tempHotkeys = JSON.parse(JSON.stringify(hotkeys));

        // 关闭按钮
        modal.querySelector('#close-hotkey-modal').addEventListener('click', () => {
            modal.remove();
        });

        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // 点击热键显示区域开始编辑
        modal.querySelectorAll('.hotkey-display').forEach(display => {
            display.addEventListener('click', () => {
                editingHotkeyId = display.dataset.hotkeyId;
                display.textContent = '按下新热键...';
                display.classList.add('ring-2', 'ring-primary');
            });
        });

        // 修饰键列表 - 包括所有可能的修饰键名称
        const modifierKeys = new Set([
            'Control', 'Alt', 'Shift', 'Meta',
            'CapsLock', 'NumLock', 'ScrollLock',
            'OS', 'Fn', 'FnLock', 'Hyper', 'Super', 'Symbol', 'SymbolLock'
        ]);

        // 当前按下的修饰键状态
        let currentModifiers = { ctrl: false, alt: false, shift: false };

        // 监听键盘输入
        const handleKeyDown = (e) => {
            if (!editingHotkeyId) return;

            e.preventDefault();
            e.stopPropagation();

            // 更新当前修饰键状态
            currentModifiers = {
                ctrl: e.ctrlKey || e.metaKey,
                alt: e.altKey,
                shift: e.shiftKey
            };

            // 如果只按下了修饰键，不确认，等待按下其他键
            if (modifierKeys.has(e.key)) {
                // 更新显示当前按下的修饰键
                const parts = [];
                if (currentModifiers.ctrl) parts.push(isMac ? '⌘' : 'Ctrl');
                if (currentModifiers.alt) parts.push(isMac ? '⌥' : 'Alt');
                if (currentModifiers.shift) parts.push(isMac ? '⇧' : 'Shift');
                const display = modal.querySelector(`.hotkey-display[data-hotkey-id="${editingHotkeyId}"]`);
                if (parts.length > 0) {
                    display.textContent = parts.join(isMac ? '' : ' + ') + (isMac ? '' : ' + ') + '...';
                } else {
                    display.textContent = '按下新热键...';
                }
                return;
            }

            // 从 code 获取实际按键（避免 Option+字母 产生特殊字符）
            let actualKey = e.key;
            if (e.code && e.code.startsWith('Key')) {
                actualKey = e.code.replace('Key', '').toLowerCase();
            } else if (e.code && e.code.startsWith('Digit')) {
                actualKey = e.code.replace('Digit', '');
            }

            const newConfig = {
                key: actualKey,
                code: e.code,
                ctrl: currentModifiers.ctrl,
                alt: currentModifiers.alt,
                shift: currentModifiers.shift,
                label: tempHotkeys[editingHotkeyId].label
            };

            // 检测冲突
            const conflict = this.checkHotkeyConflict(tempHotkeys, editingHotkeyId, newConfig);
            const conflictEl = modal.querySelector('#hotkey-conflict');
            const conflictMsg = modal.querySelector('#conflict-message');

            if (conflict) {
                conflictEl.classList.remove('hidden');
                conflictMsg.textContent = `与"${conflict.label}"冲突`;
                // 标红冲突的热键显示
                const display = modal.querySelector(`.hotkey-display[data-hotkey-id="${editingHotkeyId}"]`);
                display.classList.add('ring-2', 'ring-red-500', 'text-red-400');
            } else {
                conflictEl.classList.add('hidden');
                tempHotkeys[editingHotkeyId] = newConfig;
            }

            // 更新显示
            const display = modal.querySelector(`.hotkey-display[data-hotkey-id="${editingHotkeyId}"]`);
            display.innerHTML = this.formatHotkeyDisplay(newConfig);
            display.classList.remove('ring-2', 'ring-primary', 'ring-red-500', 'text-red-400');

            editingHotkeyId = null;
        };

        // 监听键盘松开 - 当松开修饰键时重置显示
        const handleKeyUp = (e) => {
            if (!editingHotkeyId) return;

            // 如果松开的是修饰键，更新显示
            if (modifierKeys.has(e.key)) {
                const parts = [];
                if (e.ctrlKey || e.metaKey) parts.push(isMac ? '⌘' : 'Ctrl');
                if (e.altKey) parts.push(isMac ? '⌥' : 'Alt');
                if (e.shiftKey) parts.push(isMac ? '⇧' : 'Shift');
                const display = modal.querySelector(`.hotkey-display[data-hotkey-id="${editingHotkeyId}"]`);
                if (parts.length > 0) {
                    display.textContent = parts.join(isMac ? '' : ' + ') + (isMac ? '' : ' + ') + '...';
                } else {
                    display.textContent = '按下新热键...';
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);

        // 重置单个热键
        modal.querySelectorAll('.reset-hotkey').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.hotkeyId;
                tempHotkeys[id] = { ...defaultHotkeys[id] };
                const display = modal.querySelector(`.hotkey-display[data-hotkey-id="${id}"]`);
                display.innerHTML = this.formatHotkeyDisplay(tempHotkeys[id]);
            });
        });

        // 重置全部
        modal.querySelector('#reset-all-hotkeys').addEventListener('click', () => {
            tempHotkeys = JSON.parse(JSON.stringify(defaultHotkeys));
            Object.entries(tempHotkeys).forEach(([id, config]) => {
                const display = modal.querySelector(`.hotkey-display[data-hotkey-id="${id}"]`);
                if (display) {
                    display.innerHTML = this.formatHotkeyDisplay(config);
                }
            });
            modal.querySelector('#hotkey-conflict').classList.add('hidden');
        });

        // 保存
        modal.querySelector('#save-hotkeys').addEventListener('click', () => {
            localStorage.setItem('hotkeys', JSON.stringify(tempHotkeys));
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('keyup', handleKeyUp);
            modal.remove();
            this.showSaveNotification('success', '热键设置已保存');
        });

        // 清理
        modal.addEventListener('remove', () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('keyup', handleKeyUp);
        });
    }

    /**
     * 格式化热键显示
     * @param {Object} config - 热键配置
     * @returns {string} 格式化的热键字符串
     */
    formatHotkeyDisplay(config) {
        // 如果热键未设置，显示"未设置"
        if (!config.key && !config.code) {
            return '<span class="text-gray-500">未设置</span>';
        }

        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0 || navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
        const parts = [];
        if (config.ctrl) parts.push(isMac ? '⌘' : 'Ctrl');
        if (config.alt) parts.push(isMac ? '⌥' : 'Alt');
        if (config.shift) parts.push(isMac ? '⇧' : 'Shift');

        // 格式化特殊键名
        let keyDisplay = config.key;
        if (config.key && config.key.length === 1) {
            keyDisplay = config.key.toUpperCase();
        } else if (config.key) {
            // 特殊键名映射
            const keyMap = {
                'Delete': isMac ? '⌫' : 'Del',
                'Backspace': isMac ? '⌫' : 'Backspace',
                'Enter': isMac ? '↵' : 'Enter',
                'Escape': 'Esc',
                'ArrowUp': '↑',
                'ArrowDown': '↓',
                'ArrowLeft': '←',
                'ArrowRight': '→',
                'Tab': isMac ? '⇥' : 'Tab',
                ' ': 'Space'
            };
            keyDisplay = keyMap[config.key] || config.key;
        }
        if (keyDisplay) {
            parts.push(keyDisplay);
        }
        return parts.join(isMac ? '' : ' + ');
    }

    /**
     * 检测热键冲突
     * @param {Object} hotkeys - 热键配置对象
     * @param {string} currentId - 当前编辑的热键ID
     * @param {Object} newConfig - 新的热键配置
     * @returns {Object|null} 冲突的热键配置，无冲突返回null
     */
    checkHotkeyConflict(hotkeys, currentId, newConfig) {
        // 如果新配置是空的，不检测冲突
        if (!newConfig.key && !newConfig.code) {
            return null;
        }

        for (const [id, config] of Object.entries(hotkeys)) {
            if (id === currentId) continue;

            // 跳过空热键
            if (!config.key && !config.code) continue;

            // 优先使用 code 进行比较
            const codeMatch = config.code && newConfig.code && config.code === newConfig.code;
            const keyMatch = config.key && newConfig.key && config.key.toLowerCase() === newConfig.key.toLowerCase();

            if ((codeMatch || keyMatch) &&
                config.ctrl === newConfig.ctrl &&
                config.alt === newConfig.alt &&
                config.shift === newConfig.shift) {
                return config;
            }
        }
        return null;
    }

    /**
     * 初始化图像上传
     * 需求: 4.1, 4.2, 4.3, 4.6, 4.7, 4.9
     */
    initImageUpload() {
        const uploadZone = document.getElementById('image-upload-zone');
        const imageInput = document.getElementById('image-input');
        const imageDisplay = document.getElementById('image-display');
        const annotationImage = document.getElementById('annotation-image');
        const progressContainer = document.getElementById('upload-progress-container');
        const progressBar = document.getElementById('upload-progress-bar');
        const progressText = document.getElementById('upload-progress-text');
        const statusText = document.getElementById('upload-status-text');
        const sizeText = document.getElementById('upload-size-text');
        const errorContainer = document.getElementById('upload-error-container');
        const errorText = document.getElementById('upload-error-text');
        const retryBtn = document.getElementById('upload-retry-btn');

        if (!uploadZone || !imageInput) return;

        // 保存当前文件引用（用于重试）
        let currentFile = null;

        // 销毁之前的上传器实例
        if (this.imageUploader) {
            this.imageUploader.destroy();
        }

        // 创建新的ImageUploader实例
        this.imageUploader = new ImageUploader(uploadZone, {
            fileInput: imageInput,
            projectId: this.currentProjectId
        });

        // 隐藏错误提示的辅助函数
        const hideError = () => {
            if (errorContainer) {
                errorContainer.classList.add('hidden');
            }
            if (retryBtn) {
                retryBtn.classList.add('hidden');
            }
        };

        // 显示错误提示的辅助函数
        const showError = (message, showRetry = false) => {
            if (errorContainer && errorText) {
                errorContainer.classList.remove('hidden');
                errorText.textContent = message;
            }
            if (retryBtn) {
                if (showRetry) {
                    retryBtn.classList.remove('hidden');
                } else {
                    retryBtn.classList.add('hidden');
                }
            }
        };

        // 格式化文件大小
        const formatFileSize = (bytes) => {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        };

        // 设置上传成功回调
        this.imageUploader.onImageUpload(async (result) => {
            currentFile = null;
            const uploadedProjectId = result.projectId || this.currentProjectId;
            const uploadedImageData = result.imageData || result.imageUrl;
            if (uploadedProjectId && uploadedImageData) {
                this.imageCache.set(uploadedProjectId, {
                    imageData: uploadedImageData,
                    width: result.width,
                    height: result.height
                });
            }

            // 隐藏进度条和错误提示
            if (progressContainer) {
                progressContainer.classList.add('hidden');
            }
            hideError();

            // 隐藏上传区域，显示图像
            if (uploadZone && imageDisplay && annotationImage) {
                uploadZone.classList.add('hidden');
                imageDisplay.classList.remove('hidden');

                // 确保图像初始隐藏，避免闪烁
                annotationImage.classList.add('opacity-0');
                annotationImage.classList.remove('opacity-100');

                // 设置图像源
                if (result.imageData) {
                    annotationImage.src = result.imageData;
                } else if (result.imageUrl) {
                    annotationImage.src = result.imageUrl;
                }

                // 图像加载完成后自动缩放
                annotationImage.onload = () => {
                    this.autoScaleImage(annotationImage, result.width, result.height);

                    // 缩放完成后显示图像
                    annotationImage.classList.remove('opacity-0');
                    annotationImage.classList.add('opacity-100');

                    // 初始化画布管理器的图像包装器
                    if (this.canvasManager) {
                        const imageWrapper = document.getElementById('image-wrapper');
                        if (imageWrapper) {
                            this.canvasManager.setImageWrapper(imageWrapper);
                            this.canvasManager.setDisplaySize(imageWrapper.clientWidth, imageWrapper.clientHeight);
                            // 加载已保存的绘制元素
                            this.loadSavedDrawingElements();
                        }
                    }
                };

                // 保存图像数据到当前项目
                if (uploadedProjectId && this.projectManager) {
                    const project = this.projectManager.loadProject(uploadedProjectId);
                    if (project) {
                        project.imageData = uploadedImageData;
                        project.imageWidth = result.width;
                        project.imageHeight = result.height;
                        project.originalFormat = result.originalFormat;
                        project.imageOnServer = result.imageStored === true;
                        const saved = await this.projectManager.saveProjectWithImage(project);
                        if (!saved) {
                            this.showUploadNotification('error', '图像已导入，但本地保存失败。请勿关闭页面，检查浏览器存储空间后重试。');
                            return;
                        }
                    }
                }
            }

            // 显示成功通知
            this.showUploadNotification('success', '图像上传成功');
        });

        // 设置进度回调
        this.imageUploader.onProgress((percent, loaded, total) => {

            // 隐藏错误提示
            hideError();

            // 显示进度条
            if (progressContainer) {
                progressContainer.classList.remove('hidden');
            }
            if (progressBar) {
                progressBar.style.width = percent + '%';
                // 根据进度改变颜色
                progressBar.classList.remove('bg-yellow-500');
                progressBar.classList.add('bg-primary');
            }
            if (progressText) {
                progressText.textContent = percent + '%';
            }
            if (statusText) {
                statusText.textContent = '上传中...';
            }
            if (sizeText && loaded && total) {
                sizeText.textContent = `${formatFileSize(loaded)} / ${formatFileSize(total)}`;
            }
        });

        // 设置重试回调
        this.imageUploader.onRetry((retryCount, maxRetries, errorMessage) => {

            if (statusText) {
                statusText.textContent = `重试中 (${retryCount}/${maxRetries})...`;
            }
            if (progressBar) {
                progressBar.classList.remove('bg-primary');
                progressBar.classList.add('bg-yellow-500');
            }
        });

        // 设置错误回调
        this.imageUploader.onError((error, errorType) => {
            currentFile = imageInput.files[0] || currentFile;

            // 隐藏进度条
            if (progressContainer) {
                progressContainer.classList.add('hidden');
            }
            if (progressBar) {
                progressBar.style.width = '0%';
            }

            // 根据错误类型决定是否显示重试按钮
            const canRetry = errorType === ImageUploader.ERROR_TYPES.NETWORK ||
                errorType === ImageUploader.ERROR_TYPES.TIMEOUT ||
                errorType === ImageUploader.ERROR_TYPES.SERVER;

            // 显示错误提示
            showError(error, canRetry && currentFile);

            // 显示错误通知
            this.showUploadNotification('error', error);
        });

        // 重试按钮事件
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                if (currentFile && this.imageUploader) {
                    hideError();
                    this.imageUploader._processFile(currentFile);
                }
            });
        }

        // 检查是否有已保存的图像数据
        this.loadSavedImage();
    }

    /**
     * 显示上传通知
     * @param {string} type - 通知类型 ('success', 'error')
     * @param {string} message - 通知消息
     */
    showUploadNotification(type, message) {
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 transition-all duration-300 transform translate-x-full`;

        if (type === 'success') {
            notification.classList.add('bg-green-500', 'text-white');
            notification.innerHTML = `
                <span class="material-symbols-outlined text-[20px]">check_circle</span>
                <span class="text-sm font-medium">${message}</span>
            `;
        } else {
            notification.classList.add('bg-red-500', 'text-white');
            notification.innerHTML = `
                <span class="material-symbols-outlined text-[20px]">error</span>
                <span class="text-sm font-medium">${message}</span>
            `;
        }

        document.body.appendChild(notification);

        // 动画显示
        requestAnimationFrame(() => {
            notification.classList.remove('translate-x-full');
        });

        // 3秒后自动消失
        setTimeout(() => {
            notification.classList.add('translate-x-full');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }

    /**
     * 自动缩放图像以铺满容器
     * 需求: 4.6, 4.7
     * @param {HTMLImageElement} img - 图像元素
     * @param {number} originalWidth - 原始宽度
     * @param {number} originalHeight - 原始高度
     */
    autoScaleImage(img, originalWidth, originalHeight) {
        const container = document.getElementById('canvas-container');
        const imageWrapper = document.getElementById('image-wrapper');
        const imageDisplay = document.getElementById('image-display');

        if (!container || !imageWrapper || !imageDisplay) return;

        // 获取容器尺寸
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;

        // 计算缩放比例，使图像铺满容器宽度
        const scale = containerWidth / originalWidth;
        const newWidth = containerWidth;
        const newHeight = Math.floor(originalHeight * scale);

        // 设置图像显示区域铺满容器
        imageDisplay.style.width = '100%';
        imageDisplay.style.height = newHeight > containerHeight ? 'auto' : '100%';

        // 设置图像包装器尺寸
        imageWrapper.style.width = newWidth + 'px';
        imageWrapper.style.height = newHeight + 'px';

        // 图像铺满wrapper
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'fill';

    }

    /**
     * 加载已保存的图像
     */
    async loadSavedImage() {
        if (!this.currentProjectId || !this.projectManager) return;

        // === 关键：在任何 await 之前捕获当前项目 ID ===
        // await 期间用户可能切换到另一个项目，此时 this.currentProjectId 已改变。
        // 捕获后续在 await 恢复时用来比对，防止把 A 项目的数据加载进 B 项目的 canvas。
        const intendedProjectId = this.currentProjectId;

        // 先检查缓存（同步，无竞态问题）
        if (this.imageCache.has(this.currentProjectId)) {
            const cached = this.imageCache.get(this.currentProjectId);

            // 仍然需要加载项目数据（分割线、文本框等），但不加载图像
            const project = this.projectManager.loadProject(this.currentProjectId);
            if (project) {
                project.imageData = cached.imageData;
                project.imageWidth = cached.width;
                project.imageHeight = cached.height;
                this._displayImage(cached.imageData, cached.width, cached.height, project);
            }
            return;
        }

        // 使用异步方法加载项目（包含图像数据）
        const project = await this.projectManager.loadProjectWithImage(intendedProjectId);

        // === await 恢复后：检查用户是否已切换到其他项目 ===
        // 若已切换，丢弃本次加载结果，避免把旧项目的数据串进新项目的 CanvasManager。
        if (this.currentProjectId !== intendedProjectId) {
            return;
        }

        if (!project) {
            this.isLoadingProject = false;
            return;
        }

        if (project.imageData) {
            // 缓存图像数据
            this.imageCache.set(this.currentProjectId, {
                imageData: project.imageData,
                width: project.imageWidth,
                height: project.imageHeight
            });

            this._displayImage(project.imageData, project.imageWidth, project.imageHeight, project);
        } else {
            this.isLoadingProject = false;
        }
    }

    /**
     * 显示图像
     * @private
     */
    _displayImage(imageData, imageWidth, imageHeight, project = null) {
        const uploadZone = document.getElementById('image-upload-zone');
        const imageDisplay = document.getElementById('image-display');
        const annotationImage = document.getElementById('annotation-image');

        if (uploadZone && imageDisplay && annotationImage) {
            uploadZone.classList.add('hidden');
            imageDisplay.classList.remove('hidden');

            // 确保图像初始隐藏，避免闪烁
            annotationImage.classList.add('opacity-0');

            annotationImage.src = imageData;

            // 在注册回调前，捕获当前时刻对应的 projectId 和管理器实例。
            // 这样即使用户在图像加载期间切换了项目，回调也不会操作错误的项目。
            const capturedProjectId = this.currentProjectId;
            const capturedCanvasManager = this.canvasManager;
            const capturedRichTextManager = this.richTextManager;

            // 图像加载完成后自动缩放并加载绘制元素
            annotationImage.onload = () => {
                // 若用户在图像加载期间切换了项目，丢弃此次回调，避免数据串台。
                if (this.currentProjectId !== capturedProjectId) {
                    return;
                }

                this.autoScaleImage(
                    annotationImage,
                    imageWidth || annotationImage.naturalWidth,
                    imageHeight || annotationImage.naturalHeight
                );

                // 缩放完成后显示图像
                annotationImage.classList.remove('opacity-0');
                annotationImage.classList.add('opacity-100');

                // 只在首次加载时加载绘制数据
                if (project) {
                    // 初始化画布管理器的图像包装器
                    if (capturedCanvasManager) {
                        const imageWrapper = document.getElementById('image-wrapper');
                        if (imageWrapper) {
                            capturedCanvasManager.setImageWrapper(imageWrapper);

                            const currentW = imageWrapper.clientWidth;
                            const currentH = imageWrapper.clientHeight;

                            // 只有当 CanvasManager 是空的时候才从存储加载数据
                            if (capturedCanvasManager && capturedCanvasManager.elements.size === 0) {
                                if (project.drawingElements && project.drawingElements.length > 0) {
                                    capturedCanvasManager.loadElements(project.drawingElements);
                                }
                                if (project.dividerLines && project.dividerLines.length > 0) {
                                    capturedCanvasManager.loadDividerLines(project.dividerLines);
                                }

                                // 元素坐标是保存时相对于 project.displayWidth/Height 的像素值。
                                // 先把 lastDisplaySize 还原为保存时的显示尺寸，再用
                                // syncDisplaySize 缩放到当前显示尺寸（处理滚动条等引起的差异）。
                                if (project.displayWidth && project.displayHeight) {
                                    capturedCanvasManager.lastDisplaySize = {
                                        width: project.displayWidth,
                                        height: project.displayHeight
                                    };
                                }
                                capturedCanvasManager.syncDisplaySize(currentW, currentH);

                                // 先加载保存的文本框数据（包含内容）
                                if (capturedRichTextManager && project.textBoxes && project.textBoxes.length > 0) {

                                    debugLogger.step('开始加载文本框数据');
                                    debugLogger.logTextBox('文本框数量', { count: project.textBoxes.length });

                                    capturedRichTextManager.loadTextBoxes(project.textBoxes);
                                    debugLogger.checkpoint('文本框加载完成', {
                                        loadedCount: capturedRichTextManager.textBoxes.size
                                    });


                                    // 等待DOM渲染完成后再同步区域高度
                                    requestAnimationFrame(() => {

                                        debugLogger.step('DOM渲染完成，开始同步区域高度');
                                        const regions = capturedCanvasManager.getImageRegions();
                                        debugLogger.checkpoint('获取区域数据', {
                                            regionCount: regions.length,
                                            regions: regions.map(r => ({ id: r.id, height: r.height }))
                                        });


                                        // 加载时跳过保存，避免覆盖刚加载的数据
                                        capturedRichTextManager.syncWithRegions(regions, true);


                                        debugLogger.checkpoint('区域同步完成', {
                                            finalTextBoxCount: capturedRichTextManager.textBoxes.size
                                        });
                                    });
                                } else if (capturedRichTextManager) {
                                    // 如果没有保存的文本框，直接同步区域
                                    debugLogger.step('没有保存的文本框，直接同步区域');
                                    const regions = capturedCanvasManager.getImageRegions();
                                    debugLogger.branch('是否有区域数据', regions && regions.length > 0, { regionCount: regions?.length });
                                    capturedRichTextManager.syncWithRegions(regions);
                                }
                            } else {
                                // 元素已在内存中（rebindContainer 路径）。
                                // 调用 syncDisplaySize 确保若显示尺寸有变化（如滚动条宽度引起的差异），
                                // 坐标能被正确比例缩放。若尺寸未变则为无操作。
                                capturedCanvasManager.syncDisplaySize(currentW, currentH);

                                // 图像加载完成后，重新同步区域高度（因为图像高度现在才是正确的）
                                if (capturedRichTextManager) {
                                    debugLogger.step('页面切换，重新同步区域高度');
                                    const regions = capturedCanvasManager.getImageRegions();
                                    debugLogger.checkpoint('获取区域数据（页面切换）', {
                                        regionCount: regions.length,
                                        imageHeight: capturedCanvasManager.getImageHeight()
                                    });
                                    // 页面切换时跳过保存，避免触发不必要的保存
                                    capturedRichTextManager.syncWithRegions(regions, true);
                                }
                            }
                        }
                    }

                    // 数据加载完成后，重置脏标记并恢复保存状态显示
                    if (this.autoSaveManager) {
                        this.autoSaveManager.isDirty = false;
                    }
                    this.restoreSaveStatus();

                    // 数据加载完成，允许保存
                    if (capturedRichTextManager) {
                        capturedRichTextManager.isLoading = false;
                    }
                }

                // 清除加载标志，允许保存
                this.isLoadingProject = false;
            };

            // 添加错误处理
            annotationImage.onerror = () => {
                this.isLoadingProject = false;
            };
        } else {
            this.isLoadingProject = false;
        }
    }

    /**
     * 初始化自动保存开关
     * 需求: 11.1, 11.7
     */
    initAutoSaveToggle() {
        const toggle = document.getElementById('auto-save-toggle');
        if (!toggle) return;

        // 从AutoSaveManager加载设置
        if (this.autoSaveManager) {
            toggle.checked = this.autoSaveManager.isAutoSaveEnabled();
        } else {
            // 回退到直接读取LocalStorage
            toggle.checked = localStorage.getItem('autoSave') === 'true';
        }

        toggle.addEventListener('change', () => {
            if (this.autoSaveManager) {
                if (toggle.checked) {
                    this.autoSaveManager.enable();
                } else {
                    this.autoSaveManager.disable();
                }
            } else {
                localStorage.setItem('autoSave', toggle.checked);
            }
        });
    }

    /**
     * 初始化调试模式开关
     */
    initDebugModeToggle() {
        debugLogger.call('initDebugModeToggle');
        debugLogger.step('查找调试模式相关DOM元素');

        const toggle = document.getElementById('debug-mode-toggle');
        const debugActions = document.getElementById('debug-actions');
        const exportBtn = document.getElementById('export-debug-log-btn');
        const statsBtn = document.getElementById('view-debug-stats-btn');
        const clearBtn = document.getElementById('clear-debug-log-btn');

        debugLogger.checkpoint('DOM元素查找结果', {
            hasToggle: !!toggle,
            hasDebugActions: !!debugActions,
            hasExportBtn: !!exportBtn,
            hasStatsBtn: !!statsBtn,
            hasClearBtn: !!clearBtn
        });

        if (!toggle) {
            debugLogger.logError('调试模式开关元素未找到', {
                toggleId: 'debug-mode-toggle',
                pageContent: document.getElementById('page-container')?.innerHTML?.substring(0, 200)
            });
            debugLogger.return('initDebugModeToggle', false);
            return;
        }

        // 加载当前设置
        const isDebugMode = localStorage.getItem('debugMode') === 'true';
        toggle.checked = isDebugMode;

        debugLogger.checkpoint('调试模式状态', {
            isDebugMode,
            toggleChecked: toggle.checked
        });

        // 显示/隐藏调试操作按钮
        if (debugActions) {
            if (isDebugMode) {
                debugActions.classList.remove('hidden');
                debugActions.classList.add('flex', 'flex-col', 'sm:flex-row');
                debugLogger.step('显示调试操作按钮');
            } else {
                debugActions.classList.add('hidden');
                debugActions.classList.remove('flex', 'flex-col', 'sm:flex-row');
                debugLogger.step('隐藏调试操作按钮');
            }
        }

        // 切换调试模式
        toggle.addEventListener('change', async () => {
            const enabled = toggle.checked;
            debugLogger.logAction('切换调试模式', { enabled });

            if (enabled) {
                localStorage.setItem('debugMode', 'true');
                if (debugActions) {
                    debugActions.classList.remove('hidden');
                    debugActions.classList.add('flex', 'flex-col', 'sm:flex-row');
                }

                // 提示需要刷新
                const confirmed = await modalDialog.confirm(
                    '调试模式已启用，需要刷新页面才能生效。是否立即刷新？',
                    '刷新页面',
                    '稍后刷新'
                );

                if (confirmed) {
                    location.reload();
                }
            } else {
                localStorage.removeItem('debugMode');
                if (debugActions) {
                    debugActions.classList.add('hidden');
                    debugActions.classList.remove('flex', 'flex-col', 'sm:flex-row');
                }

                // 提示需要刷新
                const confirmed = await modalDialog.confirm(
                    '调试模式已关闭，需要刷新页面才能生效。是否立即刷新？',
                    '刷新页面',
                    '稍后刷新'
                );

                if (confirmed) {
                    location.reload();
                }
            }
        });

        // 导出调试日志
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                debugLogger.logAction('导出调试日志');
                if (window.debugLogger) {
                    debugLogger.export();
                    this.showSaveNotification('success', '调试日志已导出');
                } else {
                    this.showSaveNotification('error', '调试模式未启用，请刷新页面');
                }
            });
        }

        // 查看统计
        if (statsBtn) {
            statsBtn.addEventListener('click', () => {
                debugLogger.logAction('查看调试统计');
                if (window.debugLogger) {
                    debugLogger.getStats();
                    this.showSaveNotification('success', '统计信息已输出到控制台（按F12查看）');
                } else {
                    this.showSaveNotification('error', '调试模式未启用，请刷新页面');
                }
            });
        }

        // 清空日志
        if (clearBtn) {
            clearBtn.addEventListener('click', async () => {
                if (window.debugLogger) {
                    const confirmed = await modalDialog.confirm('确定要清空所有调试日志吗？');
                    if (confirmed) {
                        debugLogger.clear();
                        this.showSaveNotification('success', '调试日志已清空');
                    }
                } else {
                    this.showSaveNotification('error', '调试模式未启用，请刷新页面');
                }
            });
        }
    }

    /**
     * 初始化图片质量滑块
     */
    async initPimTemplateSetting() {
        const input = document.getElementById('pim-template-input');
        const status = document.getElementById('pim-template-status');
        const uploadLabel = document.getElementById('pim-template-upload-label');
        if (!input || !status || !uploadLabel) return;
        try {
            const response = await fetch('/api/export/template');
            if (!response.ok) throw new Error('无法读取模板状态');
            const data = await response.json();
            if (status.isConnected) {
                status.textContent = data.uploaded ? '已上传' : '未上传模板，PIM 导出前请先上传 .docx 文件';
                uploadLabel.textContent = data.uploaded ? '重新上传' : '上传模板';
            }
        } catch (error) {
            if (status.isConnected) status.textContent = '无法读取模板状态，请检查服务连接';
        }
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) return;
            if (!file.name.toLowerCase().endsWith('.docx')) {
                status.textContent = '请选择 .docx 模板文件';
                input.value = '';
                return;
            }
            const form = new FormData();
            form.append('file', file);
            status.textContent = '正在上传模板…';
            try {
                const response = await fetch('/api/export/template', { method: 'POST', body: form });
                const result = await response.json();
                if (!response.ok) throw new Error(result.message || '上传失败');
                status.textContent = '已上传';
                uploadLabel.textContent = '重新上传';
            } catch (error) {
                status.textContent = error.message || '上传失败，请重新选择文件';
            } finally {
                input.value = '';
            }
        });
    }

    initImageQualitySlider() {
        const slider = document.getElementById('image-quality-slider');
        const valueDisplay = document.getElementById('image-quality-value');

        if (!slider || !valueDisplay) {
            return;
        }

        // 加载保存的设置，默认85%
        const savedQuality = localStorage.getItem('imageQuality') || '85';
        slider.value = savedQuality;
        valueDisplay.textContent = `${savedQuality}%`;

        // 监听滑块变化
        slider.addEventListener('input', (e) => {
            const value = e.target.value;
            valueDisplay.textContent = `${value}%`;
            localStorage.setItem('imageQuality', value);
        });
    }

    /**
     * 创建新项目
     * 需求: 3.1, 3.2
     */
    showCreateProjectDialog() {
        document.getElementById('create-project-dialog')?.remove();
        const overlay = document.createElement('div');
        overlay.id = 'create-project-dialog';
        overlay.className = 'create-project-overlay';
        overlay.innerHTML = `
            <div class="create-project-panel" role="dialog" aria-modal="true" aria-labelledby="create-project-title">
                <div class="create-project-heading"><h2 id="create-project-title">选择任务</h2><button type="button" class="create-project-close" aria-label="关闭">×</button></div>
                <div class="create-project-options">
                    <button type="button" data-create-mode="pim" class="create-mode-card"><span class="material-symbols-outlined">view_sidebar</span><strong>PIM</strong></button>
                    <button type="button" data-create-mode="deep" class="create-mode-card"><span class="material-symbols-outlined">dashboard_customize</span><strong>深绘</strong></button>
                </div>
            </div>`;
        const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
        const onKey = event => { if (event.key === 'Escape') close(); };
        overlay.addEventListener('click', event => { if (event.target === overlay || event.target.closest('.create-project-close')) close(); });
        overlay.querySelectorAll('[data-create-mode]').forEach(button => button.addEventListener('click', () => {
            const mode = button.dataset.createMode;
            close();
            this.createNewProject(mode);
        }));
        document.body.appendChild(overlay);
        document.addEventListener('keydown', onKey);
        overlay.querySelector('[data-create-mode="pim"]')?.focus();
    }

    async initDeepCanvasPage(params) {
        if (this.pendingDeepSave) await this.pendingDeepSave;
        const project = this.projectManager?.loadProject(params?.id);
        if (!project || !document.getElementById('deep-canvas')) return;
        this.deepCanvasManager = new DeepCanvasManager(this, project);
        await this.deepCanvasManager.init();
    }

    createNewProject(mode = 'pim') {
        let project;

        if (this.projectManager) {
            // 使用ProjectManager创建项目
            project = this.projectManager.createProject('新项目', mode);
        } else {
            // 回退到直接操作LocalStorage
            const projectId = 'project_' + Date.now();
            const projectName = '新项目';
            const now = new Date().toISOString();

            project = {
                id: projectId,
                name: projectName,
                mode,
                createdAt: now,
                updatedAt: now
            };

            // 保存到LocalStorage
            const projectsData = localStorage.getItem('projects');
            let projects = {};
            if (projectsData) {
                try {
                    projects = JSON.parse(projectsData);
                } catch (e) {
                }
            }
            projects[project.id] = project;
            localStorage.setItem('projects', JSON.stringify(projects));
        }

        // 更新侧边栏 - 立即显示新项目
        if (this.sidebar) {
            this.sidebar.addProject({
                id: project.id,
                name: project.name,
                mode: project.mode || 'pim',
                updatedAt: project.updatedAt
            });
        }

        // 导航到标注页面
        this.router.navigate('annotation', { id: project.id, name: project.name });

        return project;
    }

    /**
     * 删除项目
     * @param {string} projectId - 项目ID
     */
    deleteProject(projectId) {
        if (!projectId) return false;

        let success = false;

        if (this.projectManager) {
            success = this.projectManager.deleteProject(projectId);
        } else {
            // 回退到直接操作LocalStorage
            const projectsData = localStorage.getItem('projects');
            if (projectsData) {
                try {
                    const projects = JSON.parse(projectsData);
                    if (projects[projectId]) {
                        delete projects[projectId];
                        localStorage.setItem('projects', JSON.stringify(projects));
                        success = true;
                    }
                } catch (e) {
                }
            }
        }

        if (success && this.sidebar) {
            this.sidebar.removeProject(projectId);
        }

        return success;
    }

    /**
     * 保存当前项目
     */
    saveCurrentProject(data) {
        if (!this.currentProjectId || !this.projectManager) return false;

        const project = this.projectManager.loadProject(this.currentProjectId);
        if (!project) return false;

        // 合并更新数据
        Object.assign(project, data);

        return this.projectManager.saveProject(project);
    }

    /**
     * 获取当前项目
     */
    getCurrentProject() {
        if (!this.currentProjectId || !this.projectManager) return null;
        return this.projectManager.loadProject(this.currentProjectId);
    }

    /**
     * 获取路由实例
     */
    getRouter() {
        return this.router;
    }

    /**
     * 获取侧边栏实例
     */
    getSidebar() {
        return this.sidebar;
    }

    /**
     * 获取项目管理器实例
     */
    getProjectManager() {
        return this.projectManager;
    }

    /**
     * 获取富文本管理器实例
     */
    getRichTextManager() {
        return this.richTextManager;
    }

    /**
     * 获取画布管理器实例
     */
    getCanvasManager() {
        return this.canvasManager;
    }

    /**
     * 获取自动保存管理器实例
     */
    getAutoSaveManager() {
        return this.autoSaveManager;
    }
}

// 应用初始化
document.addEventListener('DOMContentLoaded', () => {
    app = new App();
    app.init();
});

// 导出App类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = App;
}
