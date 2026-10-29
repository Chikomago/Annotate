/**
 * 页面内容模板
 * 定义各个页面的HTML内容
 */

const Pages = {
    /**
     * 主页内容
     */
    home: () => `
        <header class="home-topbar flex-shrink-0 border-b border-gray-800/50 bg-background-dark/95 backdrop-blur px-8 flex items-center justify-between z-10">
            <div class="flex items-center gap-4">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-gray-400">calendar_today</span>
                    <h2 class="text-white text-base font-medium tracking-tight">${Pages.getCurrentDate()} <span class="text-gray-500 mx-2">|</span> ${Pages.getCurrentTime()}</h2>
                </div>
            </div>
            <div class="flex items-center gap-4">
                <div id="frontend-status" class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    <div class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                    <span class="text-xs font-medium text-emerald-400">前端服务：运行中</span>
                </div>
                <div id="backend-status" class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-500/10 border border-gray-500/20">
                    <div class="w-2 h-2 rounded-full bg-gray-500 animate-pulse"></div>
                    <span class="text-xs font-medium text-gray-400">后端服务：异常</span>
                </div>
            </div>
        </header>
        <div class="home-main flex-1 overflow-y-auto p-8">
            <div class="max-w-6xl mx-auto flex flex-col gap-8 pb-10">
                <section class="home-hero">
                    <div class="home-hero-copy">
                        <h1>双系统工作流</h1>
                        <button id="home-new-project-btn" type="button" class="hero-action"><span class="material-symbols-outlined">add</span>新建任务</button>
                    </div>
                    <div class="home-hero-art" aria-hidden="true"><div class="hero-sheet"><span class="hero-sheet-line"></span><span class="hero-sheet-line short"></span><span class="hero-sheet-box"></span><span class="hero-sheet-step">01</span></div></div>
                </section>
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    <div class="lg:col-span-1 flex flex-col gap-4">
                        <div class="flex items-center justify-between h-8">
                            <h3 class="text-lg font-bold text-white">任务进度</h3>
                            <div class="flex items-center gap-2">
                                <div class="statistics-month-picker">
                                    <input id="statistics-month" type="hidden" />
                                    <button id="statistics-month-trigger" type="button" aria-label="选择统计月份" aria-haspopup="dialog" aria-expanded="false"></button>
                                    <div id="statistics-month-popover" class="statistics-month-popover" role="dialog" aria-label="选择统计月份" hidden>
                                        <div class="statistics-month-header"><button type="button" data-year-step="-1" aria-label="上一年">‹</button><span id="statistics-month-year"></span><button type="button" data-year-step="1" aria-label="下一年">›</button></div>
                                        <div id="statistics-month-grid" class="statistics-month-grid"></div>
                                    </div>
                                </div>
                                <button id="view-more-btn" class="text-xs text-primary hover:text-primary/80 transition-colors">查看更多</button>
                            </div>
                        </div>
                        <div class="task-progress-card bg-surface-dark rounded-xl p-6 border border-gray-800 flex flex-col justify-center relative overflow-hidden">
                            <div class="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                            <div class="flex items-center justify-between mb-6">
                                <div>
                                    <p class="text-gray-400 text-sm">任务数</p>
                                    <p id="total-tasks" class="text-3xl font-bold text-white">0</p>
                                </div>
                                <div class="h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">
                                    <span class="material-symbols-outlined">trending_up</span>
                                </div>
                            </div>
                            <div class="space-y-4">
                                <div>
                                    <div class="flex justify-between text-sm mb-1">
                                        <span class="text-gray-300">已完成</span>
                                        <span id="completed-tasks" class="text-white font-medium">0</span>
                                    </div>
                                    <div class="task-progress-track w-full bg-gray-700 h-2 rounded-full">
                                        <div id="completed-progress" class="bg-green-500 h-2 rounded-full transition-all" style="width: 0%"></div>
                                    </div>
                                </div>
                                <div>
                                    <div class="flex justify-between text-sm mb-1">
                                        <span class="text-gray-300">进行中</span>
                                        <span id="pending-tasks" class="text-white font-medium">0</span>
                                    </div>
                                    <div class="task-progress-track w-full bg-gray-700 h-2 rounded-full">
                                        <div id="pending-progress" class="bg-yellow-500 h-2 rounded-full transition-all" style="width: 0%"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 更新日志 -->
                    <div class="lg:col-span-2 flex flex-col gap-4 relative">
                        <div class="flex items-center justify-between h-8">
                            <h3 class="text-lg font-bold text-white">更新日志</h3>
                        </div>
                        <div class="absolute top-12 bottom-0 left-0 right-0 bg-surface-dark rounded-xl p-6 border border-gray-800 overflow-y-auto">
                            <div class="relative">
                                <div class="relative pl-8 pb-6">
                                    <div class="absolute left-[11px] top-6 bottom-0 w-px bg-gray-700/60"></div>
                                    <div class="absolute left-0 top-0 w-6 h-6 rounded-full bg-primary/20 border border-primary/50 flex items-center justify-center z-10">
                                        <div class="w-2 h-2 rounded-full bg-primary"></div>
                                    </div>
                                    <div class="flex flex-col gap-3">
                                        <span class="text-sm font-bold text-primary leading-6">2.0.0 · 2026.10.12</span>
                                        <div class="bg-[#283039]/50 rounded-lg p-4 border border-gray-800">
                                            <ul class="space-y-2 text-sm text-gray-300">
                                                <li>新增 PIM 与深绘两种任务工作流</li>
                                                <li>新增浅色、深色和跟随系统外观</li>
                                                <li>优化主页、设置与画布操作界面</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                                <!-- 时间轴项: 2026.4.24 -->
                                <div class="relative pl-8 pb-6">
                                    <!-- 竖线 -->
                                    <div class="absolute left-[11px] top-6 bottom-0 w-px bg-gray-700/60"></div>
                                    <!-- 圆点 -->
                                    <div class="absolute left-0 top-0 w-6 h-6 rounded-full bg-primary/20 border border-primary/50 flex items-center justify-center z-10">
                                        <div class="w-2 h-2 rounded-full bg-primary shadow-[0_0_6px_rgba(59,130,246,0.6)]"></div>
                                    </div>
                                    <!-- 内容 -->
                                    <div class="flex flex-col gap-3">
                                        <span class="text-sm font-bold text-primary leading-6">2026.4.24</span>
                                        <div class="bg-[#283039]/50 rounded-lg p-4 border border-gray-800">
                                            <ul class="space-y-2 text-sm text-gray-300">
                                                <li class="flex items-start gap-2">
                                                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0"></span>
                                                    <span>修复富文本框粘贴格式化问题，从外部复制粘贴文本时自动去除所有外部样式</span>
                                                </li>
                                                <li class="flex items-start gap-2">
                                                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0"></span>
                                                    <span>修复图片占位符导出异常，支持同一段落中的所有图片占位符</span>
                                                </li>
                                                <li class="flex items-start gap-2">
                                                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0"></span>
                                                    <span>修复字体颜色设置范围错误，颜色现在只应用到选中的字符</span>
                                                </li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                                <!-- 时间轴项: 2026.3.26 -->
                                <div class="relative pl-8 pb-6">
                                    <!-- 竖线 -->
                                    <div class="absolute left-[11px] top-6 bottom-0 w-px bg-gray-700/60"></div>
                                    <!-- 圆点 -->
                                    <div class="absolute left-0 top-0 w-6 h-6 rounded-full bg-primary/20 border border-primary/50 flex items-center justify-center z-10">
                                        <div class="w-2 h-2 rounded-full bg-primary shadow-[0_0_6px_rgba(59,130,246,0.6)]"></div>
                                    </div>
                                    <!-- 内容 -->
                                    <div class="flex flex-col gap-3">
                                        <span class="text-sm font-bold text-primary leading-6">2026.3.26</span>
                                        <div class="bg-[#283039]/50 rounded-lg p-4 border border-gray-800">
                                            <ul class="space-y-2 text-sm text-gray-300">
                                                <li class="flex items-start gap-2">
                                                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0"></span>
                                                    <span>修复rebindContainer将lastDisplaySize设置为0x0计算错误，导致元素偏移问题</span>
                                                </li>
                                            </ul>
                                        </div>
                                    </div>
                                    <div class="flex flex-col gap-3">
                                        <span class="text-sm font-bold text-primary leading-6">2026.2.26</span>
                                        <div class="bg-[#283039]/50 rounded-lg p-4 border border-gray-800">
                                            <ul class="space-y-2 text-sm text-gray-300">
                                                <li class="flex items-start gap-2">
                                                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0"></span>
                                                    <span>修复导出 Word 时富文本中 HTML 实体字符（&amp;gt; &amp;lt; &amp;amp; 等）未解码问题</span>
                                                </li>
    
                                                <li class="flex items-start gap-2">
                                                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0"></span>
                                                    <span>优化持久化存储</span>
                                                </li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                                <!-- 时间轴项: 2026.2.3 -->
                                <div class="relative pl-8 pb-0">
                                    <!-- 圆点 -->
                                    <div class="absolute left-0 top-0 w-6 h-6 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center z-10">
                                        <div class="w-2 h-2 rounded-full bg-primary"></div>
                                    </div>
                                    <!-- 内容 -->
                                    <div class="flex flex-col gap-3">
                                        <span class="text-sm font-bold text-primary leading-6">2026.2.3</span>
                                        <div class="bg-[#283039]/50 rounded-lg p-4 border border-gray-800">
                                            <ul class="space-y-2 text-sm text-gray-300">
                                                <li class="flex items-start gap-2">
                                                    <span class="w-1.5 h-1.5 rounded-full bg-gray-500 mt-1.5 flex-shrink-0"></span>
                                                    <span>添加步骤标注重置序号功能</span>
                                                </li>
                                                <li class="flex items-start gap-2">
                                                    <span class="w-1.5 h-1.5 rounded-full bg-gray-500 mt-1.5 flex-shrink-0"></span>
                                                    <span>修复模板路径读取问题，并内置模板文件</span>
                                                </li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `,

    /**
     * 标注页面内容
     */
    annotation: (params) => `
        <header class="annotation-header workbench-topbar border-b workbench-border workbench-toolbar flex items-center justify-between px-4 sm:px-6 shrink-0 z-10">
            <div class="flex items-center text-sm sm:text-base">
                <span class="deep-mode-badge">PIM</span>
                <input id="project-name" type="text" aria-label="项目名称" class="text-white font-medium bg-transparent border-none outline-none workbench-hover workbench-focus focus:ring-1 focus:ring-primary rounded px-2 py-1" style="width: auto; min-width: 80px; max-width: 400px;" value="${params.name || '未命名项目'}" />
            </div>
            <div class="workbench-topbar-actions flex items-center gap-2">
                <button id="complete-btn" class="annotation-action flex items-center justify-center h-8 px-3 rounded-md text-xs font-medium transition-colors">
                    <span class="material-symbols-outlined text-[16px] mr-1">check_circle</span>
                    完成
                </button>
                <button id="export-btn" class="annotation-action flex items-center justify-center h-8 px-3 rounded-md text-xs font-medium transition-colors">
                    <span class="material-symbols-outlined text-[16px] mr-1">download</span>
                    导出
                </button>
                <button id="save-btn" class="annotation-action flex items-center justify-center h-8 px-3 rounded-md text-xs font-medium transition-colors">
                    <span class="material-symbols-outlined text-[16px] mr-1">save</span>
                    保存
                </button>
                <button id="delete-btn" class="annotation-action flex items-center justify-center h-8 px-3 rounded-md text-xs font-medium transition-colors">
                    <span class="material-symbols-outlined text-[16px] mr-1">delete</span>
                    删除
                </button>
            </div>
        </header>
        <div class="annotation-workspace flex-1 flex flex-col lg:flex-row overflow-hidden">
            <!-- 图像标注区域 -->
            <section class="canvas-panel flex flex-col w-full lg:w-[600px] shrink-0 border-r workbench-border workbench-canvas-panel overflow-hidden">
                <div class="pim-toolbar workbench-tools p-3 border-b workbench-border workbench-toolbar flex flex-wrap items-center gap-3 z-10">
                    <div class="workbench-tool-group flex items-center gap-1 workbench-muted rounded-lg p-1">
                        <button id="tool-rectangle" class="tool-btn size-8 flex items-center justify-center rounded workbench-muted-text workbench-hover hover:text-white transition-colors" title="矩形工具">
                            <span class="material-symbols-outlined text-[20px]">crop_square</span><span class="tool-label">矩形</span>
                        </button>
                        <button id="tool-text" class="tool-btn size-8 flex items-center justify-center rounded workbench-muted-text workbench-hover hover:text-white transition-colors" title="文本工具">
                            <span class="material-symbols-outlined text-[20px]">title</span><span class="tool-label">文字</span>
                        </button>
                        <button id="tool-step" class="tool-btn size-8 flex items-center justify-center rounded workbench-muted-text workbench-hover hover:text-white transition-colors" title="步骤标注">
                            <span class="material-symbols-outlined text-[20px]">looks_one</span><span class="tool-label">步骤</span>
                        </button>
                        <button id="tool-reset-steps" class="tool-btn size-8 flex items-center justify-center rounded workbench-muted-text workbench-hover hover:text-white transition-colors hidden" title="重置序号 (从1开始重新编号)">
                            <span class="material-symbols-outlined text-[20px]">restart_alt</span>
                        </button>
                        <button id="tool-divider" class="tool-btn size-8 flex items-center justify-center rounded workbench-muted-text workbench-hover hover:text-white transition-colors" title="分割工具">
                            <span class="material-symbols-outlined text-[20px]">horizontal_rule</span><span class="tool-label">分割</span>
                        </button>
                        <button id="tool-clear" class="tool-btn size-8 flex items-center justify-center rounded workbench-muted-text hover:bg-red-500/20 hover:text-red-400 transition-colors" title="清除所有绘制">
                            <span class="material-symbols-outlined text-[20px]">delete_sweep</span>
                        </button>
                    </div>
                    <div class="w-px h-8 workbench-muted"></div>
                    <div class="workbench-tool-group flex items-center gap-1 workbench-muted rounded-lg p-1 shrink-0">
                        <button id="tool-undo" class="tool-btn size-6 flex items-center justify-center rounded workbench-muted-text workbench-hover hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed" title="撤销 (Ctrl+Z)" disabled>
                            <span class="material-symbols-outlined text-[18px]">undo</span>
                        </button>
                        <button id="tool-redo" class="tool-btn size-6 flex items-center justify-center rounded workbench-muted-text workbench-hover hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed" title="重做 (Ctrl+Y)" disabled>
                            <span class="material-symbols-outlined text-[18px]">redo</span>
                        </button>
                    </div>
                    <div id="text-element-tools" class="flex items-center gap-2 hidden shrink-0">
                        <select id="font-size" class="workbench-muted text-white text-xs h-8 rounded px-2 border-none focus:ring-1 focus:ring-primary outline-none w-16">
                            <option value="12">12px</option>
                            <option value="14">14px</option>
                            <option value="16">16px</option>
                            <option value="18">18px</option>
                            <option value="20">20px</option>
                            <option value="24" selected>24px</option>
                            <option value="28">28px</option>
                            <option value="32">32px</option>
                            <option value="36">36px</option>
                            <option value="48">48px</option>
                        </select>
                    </div>
                    <div class="color-tools-scroll flex items-center gap-3 flex-1 overflow-x-auto">
                        <div class="flex items-center gap-1.5 pl-2 border-l workbench-border">
                            <label class="color-picker size-6 rounded-full border-2 border-[#3b4754] cursor-pointer hover:scale-110 transition-transform bg-[#FFFF00] ring-2 ring-white/20" data-color="#FFFF00" title="文案可编辑"></label>
                            <label class="color-picker size-6 rounded-full border-2 border-[#3b4754] cursor-pointer hover:scale-110 transition-transform bg-[#16DCDB]" data-color="#16DCDB" title="文案导入"></label>
                            <label class="color-picker size-6 rounded-full border-2 border-[#3b4754] cursor-pointer hover:scale-110 transition-transform bg-[#FF0100]" data-color="#FF0100" title="文案映射"></label>
                            <label class="color-picker size-6 rounded-full border-2 border-[#3b4754] cursor-pointer hover:scale-110 transition-transform bg-[#97CC02]" data-color="#97CC02" title="读取SKU颜色文案"></label>
                            <label class="color-picker size-6 rounded-full border-2 border-[#3b4754] cursor-pointer hover:scale-110 transition-transform bg-[#F31CF4]" data-color="#F31CF4" title="读取图片命名文案"></label>
                            <label class="color-picker size-6 rounded-full border-2 border-[#3b4754] cursor-pointer hover:scale-110 transition-transform bg-[#3894E4]" data-color="#3894E4" title="读取模特配置文案"></label>
                            <div class="relative">
                                <input type="color" id="element-color" class="absolute opacity-0 w-0 h-0" value="#FFFF00" />
                                <label for="element-color" id="custom-color-btn" class="size-6 rounded-full border-2 border-[#3b4754] cursor-pointer hover:scale-110 transition-transform flex items-center justify-center" style="background-color: #FFFF00;" title="自定义颜色">
                                    <span class="material-symbols-outlined text-[12px] text-black/60">palette</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="canvas-container" class="flex-1 workbench-canvas relative overflow-auto">
                    <!-- 图像上传区域 -->
                    <div id="image-upload-zone" class="w-full h-full min-h-[400px] border-2 border-dashed border-gray-600 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors workbench-canvas">
                        <span class="material-symbols-outlined text-[48px] text-gray-500 mb-4">cloud_upload</span>
                        <p class="text-gray-400 text-sm mb-2">拖拽图像到此处或点击上传</p>
                        <p class="text-gray-500 text-xs mb-4">支持 PNG, JPG, JPEG, GIF, WebP, PSD, PSB</p>
                        <!-- 上传进度条 -->
                        <div id="upload-progress-container" class="hidden w-64">
                            <div class="flex justify-between text-xs text-gray-400 mb-1">
                                <span id="upload-status-text">上传中...</span>
                                <span id="upload-progress-text">0%</span>
                            </div>
                            <div class="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
                                <div id="upload-progress-bar" class="bg-primary h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
                            </div>
                            <p id="upload-size-text" class="text-xs text-gray-500 mt-1 text-center"></p>
                        </div>
                        <!-- 错误提示区域 -->
                        <div id="upload-error-container" class="hidden w-80 mt-4">
                            <div class="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                                <span class="material-symbols-outlined text-red-500 text-[20px] flex-shrink-0">error</span>
                                <div class="flex-1">
                                    <p id="upload-error-text" class="text-red-400 text-sm"></p>
                                    <button id="upload-retry-btn" class="hidden mt-2 text-xs text-primary hover:underline">点击重试</button>
                                </div>
                            </div>
                        </div>
                        <input type="file" id="image-input" class="hidden" accept=".png,.jpg,.jpeg,.gif,.webp,.psd,.psb">
                    </div>
                    <!-- 图像显示区域（上传后显示） -->
                    <div id="image-display" class="hidden w-full h-full">
                        <div id="image-wrapper" class="relative w-full h-full">
                            <img id="annotation-image" alt="标注图像" class="block select-none w-full h-full opacity-0 transition-opacity duration-200" style="object-fit: contain;"/>
                            <!-- 绘制元素容器 -->
                            <div id="drawing-elements" class="absolute inset-0 pointer-events-none"></div>
                            <!-- 分割工具容器 -->
                            <div id="divider-lines" class="absolute inset-0 pointer-events-none"></div>
                        </div>
                    </div>
                </div>
            </section>
            <!-- 富文本编辑区域 -->
            <section class="notes-panel flex-1 flex flex-col bg-background-light dark:bg-background-dark relative overflow-hidden">
                <div class="flex items-center justify-between px-6 py-3 border-b workbench-border workbench-toolbar z-10">
                    <div class="flex items-center gap-1 workbench-muted-text">
                        <button class="rich-format-btn p-1.5 workbench-hover hover:text-white rounded transition-colors" data-format="bold" title="加粗">
                            <span class="material-symbols-outlined text-[20px]">format_bold</span>
                        </button>
                        <button class="rich-format-btn p-1.5 workbench-hover hover:text-white rounded transition-colors" data-format="italic" title="斜体">
                            <span class="material-symbols-outlined text-[20px]">format_italic</span>
                        </button>
                        <button class="rich-format-btn p-1.5 workbench-hover hover:text-white rounded transition-colors" data-format="underline" title="下划线">
                            <span class="material-symbols-outlined text-[20px]">format_underlined</span>
                        </button>
                        <div class="w-px h-5 workbench-muted mx-1"></div>
                        <button class="rich-format-btn p-1.5 workbench-hover hover:text-white rounded transition-colors" data-format="ul" title="无序列表">
                            <span class="material-symbols-outlined text-[20px]">format_list_bulleted</span>
                        </button>
                        <button class="rich-format-btn p-1.5 workbench-hover hover:text-white rounded transition-colors" data-format="ol" title="有序列表">
                            <span class="material-symbols-outlined text-[20px]">format_list_numbered</span>
                        </button>
                        <div class="w-px h-5 workbench-muted mx-1"></div>
                        <div class="relative flex items-center">
                            <button id="quick-text-btn" class="rich-format-btn p-1.5 workbench-hover hover:text-white rounded transition-colors" title="快捷文本">
                                <span class="material-symbols-outlined text-[20px]">note_add</span>
                            </button>
                        </div>
                        <div class="w-px h-5 workbench-muted mx-1"></div>
                        <div class="relative flex items-center">
                            <input type="color" id="rich-font-color" class="absolute opacity-0 w-0 h-0" value="#ffffff" />
                            <button id="rich-font-color-btn" class="-mt-2 rich-format-btn h-8 px-2 workbench-hover rounded transition-colors flex items-center gap-1.5" title="字体颜色">
                                <span class="material-symbols-outlined text-[18px]">format_color_text</span>
                                <span id="rich-font-color-preview" class="w-4 h-4 rounded border border-white/30 shrink-0" style="background-color: #ffffff;"></span>
                            </button>
                        </div>
                    </div>
                    <div class="flex items-center gap-3">
                        <select id="textbox-selector" class="workbench-muted text-white text-xs h-8 rounded px-2 border-none focus:ring-1 focus:ring-primary outline-none max-w-[80px]" title="跳转到模块">
                            <option value="">选择模块</option>
                        </select>
                        <button id="history-btn" class="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors" title="保存历史记录">
                            <span class="material-symbols-outlined text-[16px]">history</span><span class="history-label">历史</span>
                        </button>
                    </div>
                </div>
                <div id="rich-text-container" class="flex-1 overflow-y-auto">
                    <div class="w-full h-full">
                        <div id="rich-text-editor" class="editor-content prose dark:prose-invert prose-blue max-w-none outline-none min-h-[500px]" contenteditable="true" placeholder="在此输入文本说明...">
                        </div>
                    </div>
                </div>
            </section>
        </div>
    `,

    /**
     * 设置页面内容
     */
    deepCanvas: (params) => `
        <div class="deep-page">
            <header class="deep-header workbench-topbar">
                <div class="deep-heading"><span class="deep-mode-badge">深绘</span><input id="deep-project-name" type="text" aria-label="任务名称" value="${String(params.name || '新项目').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}" /></div>
                <div class="deep-actions workbench-topbar-actions"><button id="deep-save" type="button" class="deep-button deep-button-primary"><span class="material-symbols-outlined">save</span>保存</button><button id="deep-export" type="button" class="deep-button"><span class="material-symbols-outlined">download</span>导出图像</button><button id="deep-complete" type="button" class="deep-button"><span class="material-symbols-outlined">check_circle</span>完成</button><button id="deep-delete" type="button" class="deep-button deep-button-danger" title="删除任务"><span class="material-symbols-outlined">delete</span>删除</button></div>
            </header>
            <div class="deep-toolbar workbench-tools" role="toolbar" aria-label="深绘工具">
                <div class="deep-tool-group workbench-tool-group"><button type="button" data-deep-tool="select" class="deep-tool active" title="选择 · V"><span class="material-symbols-outlined">arrow_selector_tool</span><span>选择</span></button></div>
                <span class="deep-toolbar-divider"></span>
                <div class="deep-tool-group workbench-tool-group"><button type="button" data-deep-tool="rectangle" class="deep-tool" title="矩形 · R"><span class="material-symbols-outlined">crop_square</span><span>矩形</span></button><button type="button" data-deep-tool="text" class="deep-tool" title="文字 · T"><span class="material-symbols-outlined">text_fields</span><span>文字</span></button><button type="button" id="deep-import" class="deep-tool" title="导入图片 · I"><span class="material-symbols-outlined">add_photo_alternate</span><span>图片</span></button><input id="deep-image-input" type="file" accept=".psd,.psb,.webp,.png,.jpg,.jpeg,.gif,image/webp,image/png,image/jpeg,image/gif" multiple hidden /></div>
                <span class="deep-toolbar-divider"></span><div class="deep-tool-group workbench-tool-group"><button type="button" id="deep-undo" class="deep-icon-button" title="撤销 · Ctrl/⌘ Z"><span class="material-symbols-outlined">undo</span></button><button type="button" id="deep-redo" class="deep-icon-button" title="重做 · Ctrl/⌘ Shift Z"><span class="material-symbols-outlined">redo</span></button></div>
            </div>
            <div id="deep-viewport" class="deep-viewport" tabindex="0" aria-label="无限画布；双指滚动平移，捏合缩放，空格拖动平移">
                <canvas id="deep-canvas"></canvas>
                <div id="deep-context-menu" class="deep-context-menu" role="menu" aria-label="画布操作" hidden><button type="button" role="menuitem" data-deep-add="rectangle"><span class="material-symbols-outlined">crop_square</span>矩形</button><button type="button" role="menuitem" data-deep-add="text"><span class="material-symbols-outlined">text_fields</span>文字</button><button type="button" role="menuitem" data-deep-add="image"><span class="material-symbols-outlined">add_photo_alternate</span>图片</button><button type="button" role="menuitem" data-deep-add="delete" hidden><span class="material-symbols-outlined">delete</span>删除</button></div>
                <div id="deep-empty" class="deep-empty"><span class="material-symbols-outlined">dashboard_customize</span><strong>从一张图开始，或直接绘制</strong><span>支持 PSD、PSB、WebP、PNG、JPG、GIF；也可拖放或粘贴图像</span><button type="button" id="deep-empty-import">导入图像</button></div>
                <textarea id="deep-text-editor" class="deep-text-editor" aria-label="直接编辑画布文字" wrap="off" spellcheck="false" hidden></textarea>
                <div id="deep-object-properties" class="deep-object-properties" role="group" aria-label="元素属性" hidden>
                    <div class="deep-color-control"><span>颜色</span><button id="deep-color-trigger" class="deep-color-trigger" type="button" aria-label="选择颜色" aria-expanded="false" aria-controls="deep-color-palette"><span id="deep-color-current" class="deep-color-current"></span></button>
                        <div id="deep-color-palette" class="deep-color-palette" role="group" aria-label="调色板" hidden>
                            <div class="deep-color-swatches">
                                <button type="button" data-deep-color="#1f2937" aria-label="深灰"></button><button type="button" data-deep-color="#ffffff" aria-label="白色"></button><button type="button" data-deep-color="#64748b" aria-label="灰蓝"></button><button type="button" data-deep-color="#287db4" aria-label="蓝色"></button>
                                <button type="button" data-deep-color="#ef4444" aria-label="红色"></button><button type="button" data-deep-color="#f97316" aria-label="橙色"></button><button type="button" data-deep-color="#eab308" aria-label="黄色"></button><button type="button" data-deep-color="#22c55e" aria-label="绿色"></button>
                                <button type="button" data-deep-color="#06b6d4" aria-label="青色"></button><button type="button" data-deep-color="#3b82f6" aria-label="亮蓝"></button><button type="button" data-deep-color="#8b5cf6" aria-label="紫色"></button><button type="button" data-deep-color="#ec4899" aria-label="粉色"></button>
                            </div>
                            <label class="deep-color-custom">自定义 <input id="deep-color" type="color" value="#287db4" aria-label="自定义颜色" /></label>
                        </div>
                    </div>
                    <label class="deep-property-label" id="deep-font-size-label" for="deep-font-size" hidden>字号 <select id="deep-font-size"><option value="12">12 px</option><option value="16">16 px</option><option value="20">20 px</option><option value="24">24 px</option><option value="32">32 px</option><option value="40">40 px</option><option value="48">48 px</option><option value="50" selected>50 px</option><option value="64">64 px</option><option value="72">72 px</option><option value="96">96 px</option><option value="128">128 px</option><option value="200">200 px</option></select></label>
                    <label class="deep-property-label" id="deep-stroke-width-label" for="deep-stroke-width" hidden>线宽 <select id="deep-stroke-width"><option value="1">1 px</option><option value="2">2 px</option><option value="3">3 px</option><option value="5" selected>5 px</option><option value="8">8 px</option><option value="10">10 px</option><option value="12">12 px</option><option value="16">16 px</option><option value="24">24 px</option><option value="32">32 px</option><option value="50">50 px</option></select></label>
                </div>
                <div class="deep-minimap" hidden><button type="button" id="deep-minimap-surface" class="deep-minimap-surface" aria-label="画布内容预览；点击回到内容左侧并上下定位，方向键上下移动"><canvas id="deep-minimap-canvas" width="128" height="1" aria-hidden="true"></canvas></button></div>
                <div class="deep-zoom-controls"><button type="button" id="deep-navigation-lock" aria-label="锁定视图" aria-pressed="false" title="锁定缩放和平移，只保留上下滚动"><span class="material-symbols-outlined">lock_open</span></button><button type="button" id="deep-zoom-out" aria-label="缩小">−</button><button type="button" id="deep-zoom-value" title="定位图像">100%</button><button type="button" id="deep-zoom-in" aria-label="放大">+</button><button type="button" id="deep-zoom-fit" title="适应全部内容">适应</button></div>
            </div>
            <div id="deep-export-dialog" class="deep-export-overlay" hidden><div class="deep-export-panel" role="dialog" aria-modal="true" aria-labelledby="deep-export-title"><h2 id="deep-export-title">导出整个画布</h2><fieldset><legend>图像格式</legend><label><input type="radio" name="deep-format" value="jpg" checked /> JPG</label><label><input type="radio" name="deep-format" value="png" /> PNG</label></fieldset><div class="deep-export-size"><label for="deep-export-width">画布宽度 <span class="deep-export-width-field"><input id="deep-export-width" type="number" min="1" step="1" inputmode="numeric" /> px</span></label><label for="deep-export-scale">缩放倍率 <output id="deep-export-scale-value" for="deep-export-scale">100%</output></label><input id="deep-export-scale" type="range" min="1" max="100" value="100" aria-label="导出缩放倍率" /><div id="deep-export-size-summary" class="deep-export-size-summary" role="status"></div></div><div class="deep-export-actions"><button type="button" id="deep-export-cancel" class="deep-button">取消</button><button type="button" id="deep-export-confirm" class="deep-button deep-button-primary">导出</button></div></div></div>
        </div>
    `,

    settings: () => `
        <div class="settings-page flex-1 w-full max-w-5xl mx-auto p-4 md:p-8 lg:p-12 pb-24 overflow-y-auto">
            <header class="flex flex-col gap-3 mb-10">
                <h1 class="text-slate-900 dark:text-white text-4xl font-black leading-tight tracking-[-0.033em]">设置</h1>
            </header>
            <section class="mb-10" aria-labelledby="theme-heading">
                <h2 id="theme-heading" class="text-slate-900 dark:text-white text-[22px] font-bold leading-tight pb-4 border-b border-gray-200 dark:border-border-dark mb-6">外观模式</h2>
                <p class="theme-help">选择浅色或深色；跟随系统会自动响应设备外观变化。</p>
                <div class="theme-options" role="group" aria-label="外观模式">
                    <button type="button" class="theme-card" data-theme-choice="light" aria-pressed="false">
                        <span class="theme-preview theme-preview-light" aria-hidden="true"><span></span><i></i><b></b></span>
                        <span class="theme-card-footer"><strong>浅色</strong><span class="theme-selected">已选用</span></span>
                        <span class="theme-card-note">明亮的白色界面</span>
                    </button>
                    <button type="button" class="theme-card" data-theme-choice="dark" aria-pressed="false">
                        <span class="theme-preview theme-preview-dark" aria-hidden="true"><span></span><i></i><b></b></span>
                        <span class="theme-card-footer"><strong>深色</strong><span class="theme-selected">已选用</span></span>
                        <span class="theme-card-note">柔和的深色界面</span>
                    </button>
                    <button type="button" class="theme-card" data-theme-choice="system" aria-pressed="false">
                        <span class="theme-preview theme-preview-system" aria-hidden="true"><span></span><i></i><b></b></span>
                        <span class="theme-card-footer"><strong>跟随系统</strong><span class="theme-selected">已选用</span></span>
                        <span class="theme-card-note">随设备设置自动切换</span>
                    </button>
                </div>
            </section>
            <section class="mb-10">
                <h2 class="text-slate-900 dark:text-white text-[22px] font-bold leading-tight tracking-[-0.015em] pb-4 border-b border-gray-200 dark:border-border-dark mb-6">
                    通用设置
                </h2>
                <div class="grid gap-6">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-white dark:bg-surface-dark border border-gray-200 dark:border-border-dark shadow-sm">
                        <div class="flex flex-col gap-1">
                            <p class="text-slate-900 dark:text-white text-base font-medium leading-normal">热键</p>
                            <p class="text-slate-500 dark:text-text-secondary text-sm font-normal leading-normal">设置快捷功能热键</p>
                        </div>
                        <button id="edit-hotkeys-btn" class="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-[#283039] hover:bg-slate-200 dark:hover:bg-[#3b4754] text-slate-900 dark:text-white rounded-lg transition-colors font-medium text-sm">
                            <span class="material-symbols-outlined text-[20px]">keyboard</span>
                            <span>编辑</span>
                        </button>
                    </div>
                </div>
            </section>
            <section class="mb-10">
                <div class="grid gap-6">
                    <div class="flex items-center justify-between p-5 rounded-xl bg-white dark:bg-surface-dark border border-gray-200 dark:border-border-dark shadow-sm">
                        <div class="flex flex-col pr-4">
                            <p class="text-slate-900 dark:text-white text-base font-medium">自动保存</p>
                            <p class="text-slate-500 dark:text-text-secondary text-xs mt-1">每隔1分钟自动保存</p>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input id="auto-save-toggle" class="sr-only peer" type="checkbox" value=""/>
                            <div class="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary border border-gray-300 dark:border-transparent"></div>
                        </label>
                    </div>
                </div>
            </section>
            <section class="mb-10">
                <h2 class="text-slate-900 dark:text-white text-[22px] font-bold leading-tight tracking-[-0.015em] pb-4 border-b border-gray-200 dark:border-border-dark mb-6">
                    导出设置
                </h2>
                <div class="grid gap-6">
                    <div class="flex flex-col p-5 rounded-xl bg-white dark:bg-surface-dark border border-gray-200 dark:border-border-dark shadow-sm">
                        <div class="flex items-center justify-between mb-4">
                            <div class="flex flex-col pr-4">
                                <p class="text-slate-900 dark:text-white text-base font-medium">压缩质量</p>
                                <p class="text-slate-500 dark:text-text-secondary text-xs mt-1">调整导出Word文档压缩质量，质量越低文件越小</p>
                            </div>
                            <span id="image-quality-value" class="text-primary text-lg font-semibold min-w-[50px] text-right">85%</span>
                        </div>
                        <div class="flex items-center gap-4">
                            <span class="text-slate-500 dark:text-text-secondary text-xs">低</span>
                            <input id="image-quality-slider" type="range" min="50" max="100" value="85" step="5" 
                                class="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary"/>
                            <span class="text-slate-500 dark:text-text-secondary text-xs">高</span>
                        </div>
                    </div>
                </div>
            </section>
            <section class="mb-10">
                <h2 class="text-slate-900 dark:text-white text-[22px] font-bold leading-tight tracking-[-0.015em] pb-4 border-b border-gray-200 dark:border-border-dark mb-6">
                    开发者选项
                </h2>
                <div class="grid gap-6">
                    <div class="flex items-center justify-between p-5 rounded-xl bg-white dark:bg-surface-dark border border-gray-200 dark:border-border-dark shadow-sm">
                        <div class="flex flex-col pr-4">
                            <p class="text-slate-900 dark:text-white text-base font-medium">调试模式</p>
                            <p class="text-slate-500 dark:text-text-secondary text-xs mt-1">启用后会记录详细日志，用于问题排查，非必要不开启，可能会导致内存或储存占用甚至卡顿</p>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input id="debug-mode-toggle" class="sr-only peer" type="checkbox" value=""/>
                            <div class="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary border border-gray-300 dark:border-transparent"></div>
                        </label>
                    </div>
                    <div id="debug-actions" class="hidden gap-3 p-5 rounded-xl bg-white dark:bg-surface-dark border border-gray-200 dark:border-border-dark shadow-sm">
                        <button id="export-debug-log-btn" class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors font-medium text-sm">
                            <span class="material-symbols-outlined text-[20px]">download</span>
                            <span>导出调试日志</span>
                        </button>
                        <button id="view-debug-stats-btn" class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-[#283039] hover:bg-slate-200 dark:hover:bg-[#3b4754] text-slate-900 dark:text-white rounded-lg transition-colors font-medium text-sm">
                            <span class="material-symbols-outlined text-[20px]">analytics</span>
                            <span>查看统计</span>
                        </button>
                        <button id="clear-debug-log-btn" class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-[#283039] hover:bg-slate-200 dark:hover:bg-[#3b4754] text-slate-900 dark:text-white rounded-lg transition-colors font-medium text-sm">
                            <span class="material-symbols-outlined text-[20px]">delete_sweep</span>
                            <span>清空日志</span>
                        </button>
                    </div>
                </div>
            </section>
            <section class="mb-10">
                <h2 class="text-slate-900 dark:text-white text-[22px] font-bold leading-tight tracking-[-0.015em] pb-4 border-b border-gray-200 dark:border-border-dark mb-6">
                    关于
                </h2>
                <div class="grid gap-4">
                    <div class="flex items-center justify-between p-5 rounded-xl bg-white dark:bg-surface-dark border border-gray-200 dark:border-border-dark shadow-sm">
                        <div class="flex flex-col">
                            <p class="text-slate-900 dark:text-white text-base font-medium">版本</p>
                        </div>
                        <p class="text-slate-500 dark:text-text-secondary text-sm">2.0.0</p>
                    </div>
                    <div class="p-5 rounded-xl bg-white dark:bg-surface-dark border border-gray-200 dark:border-border-dark shadow-sm">
                        <p class="text-slate-500 dark:text-text-secondary text-sm text-center">
                            © 梅雨. All rights reserved.
                        </p>
                    </div>
                </div>
            </section>
        </div>
    `,

    /**
     * 获取当前日期
     */
    getCurrentDate: () => {
        const now = new Date();
        return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${'日一二三四五六'[now.getDay()]}`;
    },

    /**
     * 获取当前时间
     */
    getCurrentTime: () => {
        const now = new Date();
        return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }
};

// 导出到全局作用域（浏览器环境）
if (typeof window !== 'undefined') {
    window.Pages = Pages;
}

// 导出到 Node.js 环境
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Pages;
}
