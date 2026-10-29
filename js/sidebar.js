/**
 * 全局侧边栏组件
 * 提供全局导航和项目列表
 * 需求: 2.2, 2.4, 3.3
 */

class Sidebar {
    constructor(container) {
        this.container = container;
        this.projects = [];
        this.activePage = null;
        this.activeProjectId = null;
        this.isCollapsed = false;
        this.onNewProjectCallback = null;
        this.onNavigateCallback = null;
        
        // 虚拟滚动相关
        this.virtualScroller = null;
        this.useVirtualScroll = false;
        this.VIRTUAL_SCROLL_THRESHOLD = 50; // 超过50个项目启用虚拟滚动
        
        // 绑定事件处理器
        this._bindEvents();
    }
    
    /**
     * 绑定DOM事件
     * @private
     */
    _bindEvents() {
        if (!this.container) return;
        
        // New Project按钮
        const newProjectBtn = this.container.querySelector('#new-project-btn');
        if (newProjectBtn) {
            newProjectBtn.addEventListener('click', () => {
                if (this.onNewProjectCallback) {
                    this.onNewProjectCallback();
                }
            });
        }
        
        // 主页导航
        const navHome = this.container.querySelector('#nav-home');
        if (navHome) {
            navHome.addEventListener('click', (e) => {
                e.preventDefault();
                this._handleNavigate('home');
                this._closeMobileSidebar();
            });
        }
        
        // 设置导航
        const navSettings = this.container.querySelector('#nav-settings');
        if (navSettings) {
            navSettings.addEventListener('click', (e) => {
                e.preventDefault();
                this._handleNavigate('settings');
                this._closeMobileSidebar();
            });
        }
        
        // 侧边栏折叠/展开
        const toggleBtn = this.container.querySelector('#sidebar-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.toggleCollapse();
            });
        }
        
        // 更多功能展开/收起
        const moreFeaturesBtn = this.container.querySelector('#more-features-btn');
        if (moreFeaturesBtn) {
            moreFeaturesBtn.addEventListener('click', () => {
                this._toggleMoreFeatures();
            });
        }
        
        // 监听窗口大小变化
        this._boundResizeHandler = this._handleResize.bind(this);
        window.addEventListener('resize', this._boundResizeHandler);
        
        // 初始化移动端状态
        this._initMobileState();
    }
    
    /**
     * 切换更多功能展开/收起
     * @private
     */
    _toggleMoreFeatures() {
        const content = this.container?.querySelector('#more-features-content');
        const arrow = this.container?.querySelector('#more-features-arrow');
        
        if (content && arrow) {
            content.classList.toggle('hidden');
            arrow.style.transform = content.classList.contains('hidden') ? '' : 'rotate(180deg)';
        }
    }
    
    /**
     * 初始化移动端状态
     * @private
     */
    _initMobileState() {
        const isMobile = window.innerWidth < 768;
        if (isMobile) {
            // 移动端默认折叠
            this.isCollapsed = true;
            this.container?.classList.add('-translate-x-full');
            this.container?.classList.remove('translate-x-0');
        }
    }
    
    /**
     * 处理窗口大小变化
     * @private
     */
    _handleResize() {
        const isMobile = window.innerWidth < 768;
        const overlay = document.getElementById('sidebar-overlay');
        
        if (isMobile) {
            // 切换到移动端模式
            if (!this.isCollapsed) {
                this.container?.classList.remove('-translate-x-full');
                this.container?.classList.add('translate-x-0');
                if (overlay) overlay.classList.remove('hidden');
            } else {
                this.container?.classList.add('-translate-x-full');
                this.container?.classList.remove('translate-x-0');
                if (overlay) overlay.classList.add('hidden');
            }
            // 恢复宽度
            this.container?.classList.remove('w-16');
            this.container?.classList.add('w-52');
            // 显示文本
            const textElements = this.container?.querySelectorAll('.sidebar-text');
            textElements?.forEach(el => el.classList.remove('hidden'));
        } else {
            // 切换到桌面端模式
            this.container?.classList.remove('-translate-x-full');
            this.container?.classList.remove('translate-x-0');
            if (overlay) overlay.classList.add('hidden');
            
            // 应用折叠状态
            if (this.isCollapsed) {
                this.container?.classList.remove('w-52');
                this.container?.classList.add('w-16');
                const textElements = this.container?.querySelectorAll('.sidebar-text');
                textElements?.forEach(el => el.classList.add('hidden'));
            } else {
                this.container?.classList.remove('w-16');
                this.container?.classList.add('w-52');
                const textElements = this.container?.querySelectorAll('.sidebar-text');
                textElements?.forEach(el => el.classList.remove('hidden'));
            }
        }
    }
    
    /**
     * 关闭移动端侧边栏
     * @private
     */
    _closeMobileSidebar() {
        const isMobile = window.innerWidth < 768;
        if (isMobile && !this.isCollapsed) {
            this.setCollapsed(true);
        }
    }
    
    /**
     * 处理导航事件
     * @param {string} pageName - 页面名称
     * @param {Object} params - 可选参数
     * @private
     */
    _handleNavigate(pageName, params = {}) {
        if (this.onNavigateCallback) {
            this.onNavigateCallback(pageName, params);
        }
    }
    
    /**
     * 更新项目列表
     * @param {Array} projects - 项目数组 [{id, name, updatedAt}]
     */
    updateProjectList(projects) {
        this.projects = projects || [];
        this._renderProjectList();
    }
    
    /**
     * 渲染项目列表
     * @private
     */
    _renderProjectList() {
        const projectListContainer = this.container?.querySelector('#project-list');
        if (!projectListContainer) return;
        
        // 控制"任务列表"标题的显示/隐藏
        const taskListTitle = this.container?.querySelector('.task-list-title');
        
        if (this.projects.length === 0) {
            // 销毁虚拟滚动（如果存在）
            if (this.virtualScroller) {
                this.virtualScroller.destroy();
                this.virtualScroller = null;
            }
            projectListContainer.innerHTML = '';
            // 隐藏任务列表标题
            if (taskListTitle) {
                taskListTitle.classList.add('hidden');
            }
            return;
        }
        
        // 显示任务列表标题
        if (taskListTitle) {
            taskListTitle.classList.remove('hidden');
        }
        
        // 检查是否需要虚拟滚动
        if (this.projects.length >= this.VIRTUAL_SCROLL_THRESHOLD && typeof VirtualScroller !== 'undefined') {
            this._renderWithVirtualScroll(projectListContainer);
        } else {
            // 销毁虚拟滚动（如果存在）
            if (this.virtualScroller) {
                this.virtualScroller.destroy();
                this.virtualScroller = null;
            }
            this._renderProjectListNormal(projectListContainer);
        }
    }
    
    /**
     * 使用虚拟滚动渲染项目列表
     * @param {HTMLElement} container - 容器元素
     * @private
     */
    _renderWithVirtualScroll(container) {
        // 设置容器高度以启用滚动
        container.style.maxHeight = '400px';
        container.style.overflow = 'hidden';
        
        const renderItem = (project, index) => {
            return this._createProjectElement(project);
        };
        
        if (this.virtualScroller) {
            // 更新现有虚拟滚动
            this.virtualScroller.updateItems(this.projects);
        } else {
            // 创建新的虚拟滚动
            this.virtualScroller = new VirtualScroller(container, this.projects, renderItem, {
                itemHeight: 44,
                bufferSize: 5
            });
        }
    }
    
    /**
     * 普通渲染项目列表（无虚拟滚动）
     * @param {HTMLElement} container - 容器元素
     * @private
     */
    _renderProjectListNormal(container) {
        const projectsHtml = this.projects.map(project => {
            const isActive = this.activeProjectId === project.id;
            const activeClass = isActive 
                ? 'bg-[#283039] text-white' 
                : 'text-gray-400 hover:text-white hover:bg-[#283039]';
            const iconStyle = isActive ? "font-variation-settings: 'FILL' 1;" : '';
            const collapsedClass = this.isCollapsed ? 'justify-center' : 'gap-3';
            const textHiddenClass = this.isCollapsed ? 'hidden' : '';
            
            return `
                <a href="#annotation?id=${encodeURIComponent(project.id)}&name=${encodeURIComponent(project.name)}" 
                   data-project-id="${project.id}"
                   class="project-item nav-item flex items-center ${collapsedClass} px-3 py-2 rounded-lg ${activeClass} cursor-pointer transition-colors group">
                    <span class="material-symbols-outlined text-[22px] group-hover:text-primary transition-colors" style="${iconStyle}">${project.mode === 'deep' ? 'dashboard_customize' : 'description'}</span>
                    <p class="text-sm font-medium truncate ${textHiddenClass}">${this._escapeHtml(project.name)}</p>
                    <span class="project-mode-label ${textHiddenClass}">${project.mode === 'deep' ? '深绘' : 'PIM'}</span>
                </a>
            `;
        }).join('');
        
        container.innerHTML = projectsHtml;
        
        // 绑定项目点击事件
        this._bindProjectClickEvents(container);
    }
    
    /**
     * 创建单个项目元素
     * @param {Object} project - 项目对象
     * @returns {HTMLElement} 项目元素
     * @private
     */
    _createProjectElement(project) {
        const isActive = this.activeProjectId === project.id;
        const activeClass = isActive 
            ? 'bg-[#283039] text-white' 
            : 'text-gray-400 hover:text-white hover:bg-[#283039]';
        const iconStyle = isActive ? "font-variation-settings: 'FILL' 1;" : '';
        const collapsedClass = this.isCollapsed ? 'justify-center' : 'gap-3';
        const textHiddenClass = this.isCollapsed ? 'hidden' : '';
        
        const element = document.createElement('a');
        element.href = `#annotation?id=${encodeURIComponent(project.id)}&name=${encodeURIComponent(project.name)}`;
        element.dataset.projectId = project.id;
        element.className = `project-item nav-item flex items-center ${collapsedClass} px-3 py-2 rounded-lg ${activeClass} cursor-pointer transition-colors group`;
        element.innerHTML = `
            <span class="material-symbols-outlined text-[22px] group-hover:text-primary transition-colors" style="${iconStyle}">${project.mode === 'deep' ? 'dashboard_customize' : 'description'}</span>
            <p class="text-sm font-medium truncate ${textHiddenClass}">${this._escapeHtml(project.name)}</p>
            <span class="project-mode-label ${textHiddenClass}">${project.mode === 'deep' ? '深绘' : 'PIM'}</span>
        `;
        
        // 绑定点击事件
        element.addEventListener('click', (e) => {
            e.preventDefault();
            this._handleNavigate('annotation', { id: project.id, name: project.name });
        });
        
        return element;
    }
    
    /**
     * 绑定项目点击事件
     * @param {HTMLElement} container - 容器元素
     * @private
     */
    _bindProjectClickEvents(container) {
        const projectItems = container.querySelectorAll('.project-item');
        projectItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const projectId = item.dataset.projectId;
                const project = this.projects.find(p => p.id === projectId);
                if (project) {
                    this._handleNavigate('annotation', { id: project.id, name: project.name });
                }
            });
        });
    }
    
    /**
     * 高亮当前激活页面
     * @param {string} pageName - 页面名称
     * @param {Object} params - 可选参数（包含项目ID等）
     */
    highlightActive(pageName, params = {}) {
        this.activePage = pageName;
        this.activeProjectId = params.id || null;
        
        // 移除所有导航项的高亮
        const navItems = this.container?.querySelectorAll('.nav-item');
        navItems?.forEach(item => {
            item.classList.remove('bg-[#283039]', 'text-white');
            item.classList.add('text-gray-400');
            
            // 重置图标样式
            const icon = item.querySelector('.material-symbols-outlined');
            if (icon) {
                icon.style.fontVariationSettings = '';
            }
        });
        
        // 高亮当前页面对应的导航项
        let activeNav = null;
        if (pageName === 'home') {
            activeNav = this.container?.querySelector('#nav-home');
        } else if (pageName === 'settings') {
            activeNav = this.container?.querySelector('#nav-settings');
        } else if (pageName === 'annotation' && params.id) {
            // 使用安全的方式查找项目元素，避免CSS选择器注入
            const projectItems = this.container?.querySelectorAll('[data-project-id]');
            if (projectItems) {
                for (const item of projectItems) {
                    if (item.dataset.projectId === params.id) {
                        activeNav = item;
                        break;
                    }
                }
            }
        }
        
        if (activeNav) {
            activeNav.classList.remove('text-gray-400');
            activeNav.classList.add('bg-[#283039]', 'text-white');
            
            // 设置图标填充
            const icon = activeNav.querySelector('.material-symbols-outlined');
            if (icon) {
                icon.style.fontVariationSettings = "'FILL' 1";
            }
        }
        
        // 重新渲染项目列表以更新高亮状态
        this._renderProjectList();
        
        // 重新应用折叠状态以确保图标居中
        if (this.isCollapsed) {
            this._applyCollapseState();
        }
    }
    
    /**
     * 添加项目到列表
     * @param {Object} project - 项目对象 {id, name, updatedAt}
     */
    addProject(project) {
        // 检查是否已存在
        const existingIndex = this.projects.findIndex(p => p.id === project.id);
        if (existingIndex >= 0) {
            this.projects[existingIndex] = project;
        } else {
            this.projects.unshift(project); // 新项目添加到顶部
        }
        this._renderProjectList();
    }
    
    /**
     * 从列表中移除项目
     * @param {string} projectId - 项目ID
     */
    removeProject(projectId) {
        this.projects = this.projects.filter(p => p.id !== projectId);
        this._renderProjectList();
    }
    
    /**
     * 更新项目名称
     * @param {string} projectId - 项目ID
     * @param {string} newName - 新名称
     */
    updateProjectName(projectId, newName) {
        const project = this.projects.find(p => p.id === projectId);
        if (project) {
            project.name = newName;
            this._renderProjectList();
        }
    }
    
    /**
     * 新建项目回调
     * @param {Function} callback - 回调函数
     */
    onNewProject(callback) {
        this.onNewProjectCallback = callback;
    }
    
    /**
     * 导航回调
     * @param {Function} callback - 回调函数 (pageName, params) => void
     */
    onNavigate(callback) {
        this.onNavigateCallback = callback;
    }
    
    /**
     * 切换侧边栏折叠状态
     */
    toggleCollapse() {
        this.isCollapsed = !this.isCollapsed;
        this._applyCollapseState();
    }
    
    /**
     * 设置侧边栏折叠状态
     * @param {boolean} collapsed - 是否折叠
     */
    setCollapsed(collapsed) {
        this.isCollapsed = collapsed;
        this._applyCollapseState();
    }
    
    /**
     * 应用折叠状态到DOM
     * @private
     */
    _applyCollapseState() {
        if (!this.container) return;
        
        const overlay = document.getElementById('sidebar-overlay');
        const isMobile = window.innerWidth < 768; // md breakpoint
        
        if (this.isCollapsed) {
            if (isMobile) {
                // 移动端：滑出屏幕
                this.container.classList.add('-translate-x-full');
                this.container.classList.remove('translate-x-0');
                if (overlay) overlay.classList.add('hidden');
            } else {
                // 桌面端：收缩宽度
                this.container.classList.remove('w-52');
                this.container.classList.add('w-16');
                
                // 隐藏文本元素
                const textElements = this.container.querySelectorAll('.sidebar-text');
                textElements.forEach(el => {
                    el.classList.add('hidden');
                });
                
                // 居中导航项图标
                const navItems = this.container.querySelectorAll('.nav-item, #new-project-btn, #more-features-btn, #sidebar-toggle');
                navItems.forEach(item => {
                    item.classList.add('justify-center');
                    item.classList.remove('gap-3');
                });
                
                // 居中项目列表中的图标
                const projectItems = this.container.querySelectorAll('.project-item');
                projectItems.forEach(item => {
                    item.classList.add('justify-center');
                    item.classList.remove('gap-3');
                    // 隐藏项目名称文本
                    const textEl = item.querySelector('p');
                    if (textEl) {
                        textEl.classList.add('hidden');
                    }
                });
            }
            
            // 更新切换按钮图标和文字
            const toggleIcon = this.container.querySelector('#sidebar-toggle .material-symbols-outlined');
            if (toggleIcon) {
                toggleIcon.textContent = 'keyboard_double_arrow_right';
            }
            const toggleText = this.container.querySelector('#sidebar-toggle .sidebar-text');
            if (toggleText) {
                toggleText.textContent = '展开';
            }
        } else {
            if (isMobile) {
                // 移动端：滑入屏幕
                this.container.classList.remove('-translate-x-full');
                this.container.classList.add('translate-x-0');
                if (overlay) overlay.classList.remove('hidden');
            } else {
                // 桌面端：展开宽度
                this.container.classList.remove('w-16');
                this.container.classList.add('w-52');
                
                // 显示文本元素
                const textElements = this.container.querySelectorAll('.sidebar-text');
                textElements.forEach(el => {
                    el.classList.remove('hidden');
                });
                
                // 恢复导航项布局
                const navItems = this.container.querySelectorAll('.nav-item, #new-project-btn, #more-features-btn, #sidebar-toggle');
                navItems.forEach(item => {
                    item.classList.remove('justify-center');
                    item.classList.add('gap-3');
                });
                
                // 恢复项目列表布局
                const projectItems = this.container.querySelectorAll('.project-item');
                projectItems.forEach(item => {
                    item.classList.remove('justify-center');
                    item.classList.add('gap-3');
                    // 显示项目名称文本
                    const textEl = item.querySelector('p');
                    if (textEl) {
                        textEl.classList.remove('hidden');
                    }
                });
            }
            
            // 更新切换按钮图标和文字
            const toggleIcon = this.container.querySelector('#sidebar-toggle .material-symbols-outlined');
            if (toggleIcon) {
                toggleIcon.textContent = 'keyboard_double_arrow_left';
            }
            const toggleText = this.container.querySelector('#sidebar-toggle .sidebar-text');
            if (toggleText) {
                toggleText.textContent = '收起';
            }
        }
    }
    
    /**
     * 获取当前状态（用于测试）
     * @returns {Object} 侧边栏状态
     */
    getState() {
        return {
            projects: [...this.projects],
            activePage: this.activePage,
            activeProjectId: this.activeProjectId,
            isCollapsed: this.isCollapsed
        };
    }
    
    /**
     * 销毁侧边栏实例，清理事件监听器
     */
    destroy() {
        if (this._boundResizeHandler) {
            window.removeEventListener('resize', this._boundResizeHandler);
        }
        // 销毁虚拟滚动
        if (this.virtualScroller) {
            this.virtualScroller.destroy();
            this.virtualScroller = null;
        }
        this.projects = [];
        this.activePage = null;
        this.activeProjectId = null;
        this.onNewProjectCallback = null;
        this.onNavigateCallback = null;
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
}

// 导出到全局作用域（浏览器环境）
if (typeof window !== 'undefined') {
    window.Sidebar = Sidebar;
}

// 导出到 Node.js 环境
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Sidebar;
}
