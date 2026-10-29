/** A lightweight, unbounded world-coordinate canvas for deep drawing tasks. */
class DeepCanvasManager {
    constructor(app, project) {
        this.app = app;
        this.project = project;
        this.viewport = document.getElementById('deep-viewport');
        this.canvas = document.getElementById('deep-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.objects = [];
        this.images = new Map();
        this.minimapThumbs = new Map();
        this.view = { x: 0, y: 0, zoom: 1 };
        this.tool = 'select';
        this.defaultFontSize = 50;
        this.defaultStrokeWidth = 5;
        this.defaultColor = '#287db4';
        this.selectedId = null;
        this.drag = null;
        this.draft = null;
        this.undoStack = [];
        this.redoStack = [];
        this.writeQueue = Promise.resolve();
        this.revision = 0;
        this.saveTimer = null;
        this.disposed = false;
        this.spaceHeld = false;
        this.navigationLocked = false;
        this.listeners = [];
    }

    async init() {
        this.bindControls();
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.viewport);
        this.resize();
        const scene = await this.app.projectManager.loadDeepScene(this.project.id);
        if (this.disposed) return;
        if (!scene && this.project.deepSceneSaved) {
            this.loadFailed = true;
            this.notify('画布读取失败，请先检查本地存储', true);
        }
        if (scene?.objects) this.objects = scene.objects;
        for (const object of this.objects) if (object.type === 'image') this.getImage(object.src);
        this.updateEmpty();
        if (this.objects.length) {
            if (this.objects.some(object => object.type === 'image')) this.locateImage();
            else this.fit();
        }
        else { this.view.x = this.viewport.clientWidth / 2; this.view.y = this.viewport.clientHeight / 2; this.render(); }
    }

    listen(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        this.listeners.push(() => target.removeEventListener(type, handler, options));
    }

    bindControls() {
        const $ = id => document.getElementById(id);
        this.editor = $('deep-text-editor');
        this.objectProperties = $('deep-object-properties');
        this.colorTrigger = $('deep-color-trigger');
        this.colorPalette = $('deep-color-palette');
        this.colorInput = $('deep-color');
        this.contextMenu = $('deep-context-menu');
        this.nameInput = $('deep-project-name');
        this.exportDialog = $('deep-export-dialog');
        this.minimapSurface = $('deep-minimap-surface');
        this.minimapCanvas = $('deep-minimap-canvas');
        this.minimapCtx = this.minimapCanvas.getContext('2d');
        this.listen(this.nameInput, 'change', () => {
            const name = this.nameInput.value.trim() || '新项目';
            this.nameInput.value = name;
            this.project.name = name;
            this.app.projectManager.saveProject(this.project);
            this.app.loadProjectList();
        });
        this.listen($('deep-save'), 'click', () => this.saveNow());
        this.listen($('deep-complete'), 'click', async () => {
            const name = this.nameInput.value.trim() || '未命名项目';
            const confirmed = await modalDialog.confirm(`确定要将项目"${name}"标记为完成吗？\n\n完成后项目将被删除，统计数据将保留。`);
            if (!confirmed) return;
            this.deleted = true;
            clearTimeout(this.saveTimer);
            await this.writeQueue;
            this.app.addStatisticsRecord(this.project.id, name, 'completed');
            if (this.app.deleteProject(this.project.id)) {
                this.app.showSaveNotification('success', '项目已完成');
                this.app.router.navigate('home');
            }
        });
        this.listen($('deep-delete'), 'click', async () => {
            if (!await modalDialog.confirm('确定要删除此任务吗？此操作不可撤销。')) return;
            this.deleted = true;
            clearTimeout(this.saveTimer);
            await this.writeQueue;
            this.app.deleteProject(this.project.id);
            this.app.router.navigate('home');
        });
        this.listen($('deep-export'), 'click', () => {
            if (!this.objects.length) return this.notify('画布还没有内容', true);
            this.updateExportSize(true);
            this.exportDialog.hidden = false;
            $('deep-export-confirm').focus();
        });
        this.listen($('deep-export-scale'), 'input', () => this.updateExportSize());
        this.listen($('deep-export-width'), 'input', () => this.updateExportSize(false, true));
        this.listen($('deep-export-cancel'), 'click', () => { this.exportDialog.hidden = true; });
        this.listen(this.exportDialog, 'click', event => { if (event.target === this.exportDialog) this.exportDialog.hidden = true; });
        this.listen($('deep-export-confirm'), 'click', () => this.exportImage());
        this.listen($('deep-import'), 'click', () => { this.pendingImportPoint = null; $('deep-image-input').click(); });
        this.listen($('deep-empty-import'), 'click', () => { this.pendingImportPoint = null; $('deep-image-input').click(); });
        this.listen($('deep-image-input'), 'change', async event => {
            const at = this.pendingImportPoint;
            this.pendingImportPoint = null;
            await this.importFiles([...event.target.files], at);
            event.target.value = '';
        });
        this.listen(this.canvas, 'contextmenu', event => this.openContextMenu(event));
        this.listen(this.contextMenu, 'click', event => {
            const button = event.target.closest('[data-deep-add]');
            if (button) this.addFromContextMenu(button.dataset.deepAdd);
        });
        this.listen(document, 'pointerdown', event => {
            if (!this.contextMenu.contains(event.target)) this.hideContextMenu();
        });
        for (const button of document.querySelectorAll('[data-deep-tool]')) {
            this.listen(button, 'click', () => this.setTool(button.dataset.deepTool));
        }
        this.listen(this.colorTrigger, 'click', () => {
            const opening = this.colorPalette.hidden;
            this.colorPalette.hidden = !opening;
            this.colorTrigger.setAttribute('aria-expanded', String(opening));
            this.colorPaletteObjectId = opening ? this.selectedId : null;
            if (opening) this.positionColorPalette();
        });
        for (const swatch of this.colorPalette.querySelectorAll('[data-deep-color]')) {
            swatch.style.backgroundColor = swatch.dataset.deepColor;
            this.listen(swatch, 'click', () => {
                this.applyColor(swatch.dataset.deepColor);
                this.hideColorPalette();
            });
        }
        this.listen(this.colorInput, 'input', event => this.applyColor(event.target.value, true));
        this.listen(this.colorInput, 'change', event => { this.applyColor(event.target.value, true); this.colorGestureSnapshot = false; });
        this.listen(this.colorInput, 'blur', () => { this.colorGestureSnapshot = false; });
        this.listen(document, 'pointerdown', event => {
            if (!this.objectProperties.contains(event.target)) this.hideColorPalette();
        });
        this.listen(this.objectProperties, 'keydown', event => {
            if (event.key !== 'Escape' || this.colorPalette.hidden) return;
            event.preventDefault();
            event.stopPropagation();
            this.hideColorPalette();
            (this.editing ? this.editor : this.colorTrigger).focus({ preventScroll: true });
        });
        this.listen($('deep-font-size'), 'change', event => {
            const size = Math.max(8, Math.min(200, Number(event.target.value) || 50));
            event.target.value = size;
            this.defaultFontSize = size;
            const object = this.objects.find(item => item.id === this.selectedId && item.type === 'text');
            if (!object || object.fontSize === size) return;
            this.snapshot();
            object.fontSize = size;
            this.measureText(object);
            this.changed();
            if (this.editing === object) this.editor.focus({ preventScroll: true });
        });
        this.listen($('deep-stroke-width'), 'change', event => {
            const width = Math.max(1, Math.min(50, Number(event.target.value) || 5));
            event.target.value = width;
            this.defaultStrokeWidth = width;
            const object = this.objects.find(item => item.id === this.selectedId && item.type === 'rect');
            if (!object || (object.strokeWidth || 2) === width) return;
            this.snapshot();
            object.strokeWidth = width;
            this.changed();
        });
        this.listen($('deep-undo'), 'click', () => this.undo());
        this.listen($('deep-redo'), 'click', () => this.redo());
        this.listen($('deep-zoom-in'), 'click', () => this.zoomAt(1.25, { x: this.viewport.clientWidth / 2, y: this.viewport.clientHeight / 2 }));
        this.listen($('deep-zoom-out'), 'click', () => this.zoomAt(.8, { x: this.viewport.clientWidth / 2, y: this.viewport.clientHeight / 2 }));
        this.listen($('deep-zoom-fit'), 'click', () => this.fit());
        this.listen($('deep-zoom-value'), 'click', () => this.locateImage());
        this.listen($('deep-navigation-lock'), 'click', () => this.setNavigationLocked(!this.navigationLocked));
        this.listen(this.minimapSurface, 'pointerdown', event => {
            event.preventDefault();
            this.minimapDragging = true;
            this.minimapDragMetrics = this.minimapMetrics;
            this.minimapSurface.setPointerCapture(event.pointerId);
            this.panFromMinimap(event);
        });
        this.listen(this.minimapSurface, 'pointermove', event => {
            if (this.minimapDragging) this.panFromMinimap(event);
        });
        this.listen(this.minimapSurface, 'wheel', event => event.stopPropagation(), { passive: true });
        const stopMinimapDrag = event => {
            this.minimapDragging = false;
            this.minimapDragMetrics = null;
            if (this.minimapSurface.hasPointerCapture(event.pointerId)) this.minimapSurface.releasePointerCapture(event.pointerId);
        };
        this.listen(this.minimapSurface, 'pointerup', stopMinimapDrag);
        this.listen(this.minimapSurface, 'pointercancel', stopMinimapDrag);
        this.listen(this.minimapSurface, 'keydown', event => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            this.view.y += (event.key === 'ArrowUp' ? 1 : -1) * this.viewport.clientHeight * .25;
            this.render();
        });
        this.listen(this.minimapSurface, 'click', event => {
            if (event.detail !== 0 || !this.minimapMetrics) return;
            const map = this.minimapMetrics;
            if (!this.navigationLocked) this.view.x = 36 - map.box.left * this.view.zoom;
            this.view.y = -(map.box.top + map.travel / 2) * this.view.zoom;
            this.render();
        });
        this.listen(this.viewport, 'pointerdown', event => this.pointerDown(event));
        this.listen(this.viewport, 'pointermove', event => this.pointerMove(event));
        this.listen(this.viewport, 'pointerup', event => this.pointerUp(event));
        this.listen(this.viewport, 'pointercancel', event => this.pointerUp(event));
        this.listen(this.viewport, 'dblclick', event => this.handleCanvasDoubleClick(event));
        this.listen(this.viewport, 'wheel', event => this.handleWheel(event), { passive: false });
        const page = this.viewport.closest('.deep-page');
        this.listen(page, 'dragover', event => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
        this.listen(page, 'drop', async event => {
            if (!event.dataTransfer?.files.length) return;
            event.preventDefault();
            const point = this.localPoint(event);
            const inside = point.x >= 0 && point.y >= 0 && point.x <= this.viewport.clientWidth && point.y <= this.viewport.clientHeight;
            await this.importFiles([...event.dataTransfer.files], inside ? this.screenToWorld(point) : undefined);
        });
        this.listen(document, 'keydown', event => this.keyDown(event));
        this.listen(document, 'paste', event => this.handlePaste(event));
        this.listen(document, 'keyup', event => { if (event.code === 'Space') this.spaceHeld = false; });
        this.listen(this.editor, 'keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); this.finishTextEdit(false); }
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); this.finishTextEdit(true); }
        });
        this.listen(this.editor, 'blur', event => {
            if (!this.objectProperties.contains(event.relatedTarget)) this.finishTextEdit(true);
        });
        this.listen(this.objectProperties, 'focusout', event => {
            if (this.editing && event.relatedTarget !== this.editor && !this.objectProperties.contains(event.relatedTarget)) this.finishTextEdit(true);
        });
        this.listen(this.editor, 'input', () => { this.sizeTextEditor(); this.updateStyleControls(); });
        this.setTool('select');
    }

    destroy() {
        this.disposed = true;
        this.finishTextEdit(true);
        clearTimeout(this.saveTimer);
        if (this.resizeObserver) this.resizeObserver.disconnect();
        this.listeners.forEach(off => off());
        this.listeners = [];
        if (!this.deleted && (this.objects.length || this.undoStack.length)) return this.saveNow();
        return this.writeQueue;
    }

    notify(message, error = false) {
        if (error) this.showImportError(message);
    }

    snapshot() {
        this.undoStack.push(this.objects.map(object => ({ ...object })));
        if (this.undoStack.length > 30) this.undoStack.shift();
        this.redoStack = [];
    }

    undo() {
        if (!this.undoStack.length) return;
        this.redoStack.push(this.objects.map(object => ({ ...object })));
        this.objects = this.undoStack.pop();
        this.selectedId = null;
        this.changed();
    }

    redo() {
        if (!this.redoStack.length) return;
        this.undoStack.push(this.objects.map(object => ({ ...object })));
        this.objects = this.redoStack.pop();
        this.selectedId = null;
        this.changed();
    }

    changed() {
        if (this.disposed) return;
        this.revision++;
        this.updateEmpty();
        this.render();
        this.notify('未保存');
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.saveNow(), 600);
    }

    saveNow() {
        if (this.loadFailed) return Promise.resolve(false);
        clearTimeout(this.saveTimer);
        const scene = { version: 1, objects: this.objects.map(object => ({ ...object })) };
        const revision = this.revision;
        this.notify('保存中…');
        this.writeQueue = this.writeQueue.catch(() => false).then(async () => {
            if (this.deleted) return false;
            const saved = await this.app.projectManager.saveDeepScene(this.project.id, scene);
            if (!saved) { if (!this.disposed) this.notify('保存失败，请检查存储空间', true); return false; }
            this.project.deepSceneSaved = true;
            this.project.updatedAt = new Date().toISOString();
            if (!this.app.projectManager.saveProject(this.project)) {
                if (!this.disposed) this.notify('任务信息保存失败', true);
                return false;
            }
            if (!this.disposed && revision === this.revision) this.notify('已保存');
            return true;
        });
        return this.writeQueue;
    }

    setTool(tool) {
        this.finishTextEdit(true);
        this.tool = tool;
        this.canvas.style.cursor = '';
        this.viewport.dataset.tool = tool;
        document.querySelectorAll('[data-deep-tool]').forEach(button => button.classList.toggle('active', button.dataset.deepTool === tool));
        this.updateStyleControls();
    }

    resize() {
        const rect = this.viewport.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
        this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        this.dpr = dpr;
        this.render();
    }

    localPoint(event) {
        const rect = this.viewport.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    screenToWorld(point) { return { x: (point.x - this.view.x) / this.view.zoom, y: (point.y - this.view.y) / this.view.zoom }; }
    worldToScreen(point) { return { x: point.x * this.view.zoom + this.view.x, y: point.y * this.view.zoom + this.view.y }; }

    setNavigationLocked(locked) {
        this.navigationLocked = locked;
        if (locked) {
            this.spaceHeld = false;
            if (this.drag?.kind === 'pan') this.drag = null;
        }
        const button = document.getElementById('deep-navigation-lock');
        button.setAttribute('aria-pressed', String(locked));
        button.setAttribute('aria-label', locked ? '解锁视图' : '锁定视图');
        button.title = locked ? '解锁缩放和平移' : '锁定缩放和平移，只保留上下滚动';
        button.querySelector('.material-symbols-outlined').textContent = locked ? 'lock' : 'lock_open';
        for (const id of ['deep-zoom-in', 'deep-zoom-out', 'deep-zoom-fit']) document.getElementById(id).disabled = locked;
        this.render();
    }

    zoomAt(factor, point) {
        if (this.navigationLocked) return;
        const world = this.screenToWorld(point);
        this.view.zoom = Math.max(.001, Math.min(8, this.view.zoom * factor));
        this.view.x = point.x - world.x * this.view.zoom;
        this.view.y = point.y - world.y * this.view.zoom;
        this.render();
    }

    handleWheel(event) {
        event.preventDefault();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.viewport.clientHeight : 1;
        if (this.navigationLocked) {
            if (!event.ctrlKey && !event.metaKey && !event.shiftKey) this.view.y -= event.deltaY * unit;
            this.render();
            return;
        }
        if (event.ctrlKey || event.metaKey) {
            this.zoomAt(Math.exp(-event.deltaY * unit * .001), this.localPoint(event));
            return;
        }
        this.view.x -= (event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX) * unit;
        this.view.y -= (event.shiftKey && !event.deltaX ? 0 : event.deltaY) * unit;
        this.render();
    }

    bounds(objects = this.objects) {
        if (!objects.length) return null;
        return objects.reduce((box, object) => ({
            left: Math.min(box.left, object.x), top: Math.min(box.top, object.y),
            right: Math.max(box.right, object.x + object.w), bottom: Math.max(box.bottom, object.y + object.h)
        }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    }

    fit() {
        if (this.navigationLocked) return;
        const box = this.bounds();
        if (!box) { this.view = { x: this.viewport.clientWidth / 2, y: this.viewport.clientHeight / 2, zoom: 1 }; this.render(); return; }
        const width = Math.max(1, box.right - box.left), height = Math.max(1, box.bottom - box.top);
        this.view.zoom = Math.max(.001, Math.min(2, Math.min(Math.max(1, this.viewport.clientWidth - 120) / width, Math.max(1, this.viewport.clientHeight - 120) / height)));
        this.view.x = this.viewport.clientWidth / 2 - (box.left + width / 2) * this.view.zoom;
        this.view.y = this.viewport.clientHeight / 2 - (box.top + height / 2) * this.view.zoom;
        this.render();
    }

    locateImage(image) {
        if (this.navigationLocked) return;
        const selected = this.objects.find(object => object.id === this.selectedId && object.type === 'image');
        image = image || selected || this.objects.find(object => object.type === 'image');
        if (!image) { this.notify('画布中还没有图像', true); return; }
        const margin = 36;
        this.view.zoom = Math.max(.001, Math.min(2, (this.viewport.clientWidth - margin * 2) * .5 / Math.max(1, image.w)));
        this.view.x = margin - image.x * this.view.zoom;
        this.view.y = margin - image.y * this.view.zoom;
        this.selectedId = image.id;
        this.render();
    }

    minimapLayout() {
        const box = this.bounds();
        if (!box) return null;
        const worldWidth = Math.max(1, box.right - box.left);
        const worldHeight = Math.max(1, box.bottom - box.top);
        const height = Math.max(1, Math.round(this.minimapCanvas.width * worldHeight / worldWidth));
        const visibleHeight = this.viewport.clientHeight / this.view.zoom;
        const indicatorHeight = Math.min(height, Math.max(12, visibleHeight / worldHeight * height));
        return { box, height, indicatorHeight, travel: Math.max(0, worldHeight - visibleHeight), trackHeight: height - indicatorHeight, scale: this.minimapCanvas.width / worldWidth };
    }

    panFromMinimap(event) {
        const map = this.minimapDragMetrics || this.minimapMetrics;
        if (!map) return;
        const rect = this.minimapSurface.getBoundingClientRect();
        const py = (event.clientY - rect.top) * this.minimapCanvas.height / rect.height;
        const fraction = map.trackHeight ? Math.max(0, Math.min(1, (py - map.indicatorHeight / 2) / map.trackHeight)) : 0;
        if (!this.navigationLocked) this.view.x = 36 - map.box.left * this.view.zoom;
        this.view.y = -(map.box.top + fraction * map.travel) * this.view.zoom;
        this.render();
    }

    renderMinimap() {
        if (!this.minimapCtx) return;
        const ctx = this.minimapCtx, canvas = this.minimapCanvas, map = this.minimapLayout();
        this.minimapSurface.parentElement.hidden = !map;
        this.minimapMetrics = map;
        if (!map) return;
        if (canvas.height !== map.height) canvas.height = map.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(map.scale, map.scale);
        ctx.translate(-map.box.left, -map.box.top);
        for (const object of this.objects) {
            if (object.type === 'image') {
                const image = this.getImage(object.src);
                if (!image.complete || !image.naturalWidth) continue;
                let preview = this.minimapThumbs.get(object.src);
                if (!preview) {
                    preview = document.createElement('canvas');
                    const scale = Math.min(128 / image.naturalWidth, 512 / image.naturalHeight);
                    preview.width = Math.max(1, Math.round(image.naturalWidth * scale));
                    preview.height = Math.max(1, Math.round(image.naturalHeight * scale));
                    try {
                        preview.getContext('2d').drawImage(image, 0, 0, preview.width, preview.height);
                        this.minimapThumbs.set(object.src, preview);
                    } catch (_) { preview = null; }
                }
                if (preview) ctx.drawImage(preview, object.x, object.y, object.w, object.h);
            } else if (object.type === 'rect') {
                ctx.strokeStyle = object.color || '#4ca9ee';
                ctx.lineWidth = Math.max(object.strokeWidth || 2, 1 / map.scale);
                ctx.strokeRect(object.x, object.y, object.w, object.h);
            } else if (object.type === 'text' && object.text) {
                ctx.fillStyle = object.color || '#333';
                ctx.font = `${object.fontSize || 24}px Inter, sans-serif`;
                ctx.textBaseline = 'top';
                object.text.split('\n').forEach((line, index) => ctx.fillText(line, object.x, object.y + index * (object.fontSize || 24) * 1.3));
            }
        }
        ctx.restore();
        const visibleTop = -this.view.y / this.view.zoom;
        const vy = map.travel ? Math.max(0, Math.min(1, (visibleTop - map.box.top) / map.travel)) * map.trackHeight : 0;
        if (map.travel) {
            ctx.fillStyle = 'rgba(76, 169, 238, .16)';
            ctx.fillRect(0, vy, canvas.width, map.indicatorHeight);
            ctx.strokeStyle = '#4ca9ee'; ctx.lineWidth = 2;
            ctx.strokeRect(1, vy + 1, canvas.width - 2, Math.max(1, map.indicatorHeight - 2));
        }
    }

    hideColorPalette() {
        if (!this.colorPalette || this.colorPalette.hidden) return;
        this.colorPalette.hidden = true;
        this.colorTrigger.setAttribute('aria-expanded', 'false');
        this.colorPaletteObjectId = null;
        this.colorGestureSnapshot = false;
    }

    positionColorPalette() {
        if (this.colorPalette.hidden) return;
        const above = this.objectProperties.offsetTop;
        const below = this.viewport.clientHeight - above - this.objectProperties.offsetHeight;
        this.colorPalette.classList.toggle('below', above < this.colorPalette.offsetHeight + 8 && below > above);
    }

    applyColor(color, continuous = false) {
        if (!/^#[0-9a-f]{6}$/i.test(color)) return;
        this.defaultColor = color;
        const object = this.objects.find(item => item.id === this.selectedId);
        if (!object || (object.type !== 'text' && object.type !== 'rect') || object.color === color) return;
        if (!continuous || !this.colorGestureSnapshot) this.snapshot();
        this.colorGestureSnapshot = continuous;
        object.color = color;
        this.changed();
        if (this.editing === object && !continuous) this.editor.focus({ preventScroll: true });
    }

    updateStyleControls() {
        const object = this.objects.find(item => item.id === this.selectedId);
        const visible = (this.tool === 'select' || this.editing === object) && (object?.type === 'text' || object?.type === 'rect');
        this.objectProperties.hidden = !visible;
        if (!visible) { this.hideColorPalette(); return; }
        if (!this.colorPalette.hidden && this.colorPaletteObjectId !== object.id) this.hideColorPalette();
        document.getElementById('deep-font-size-label').hidden = object.type !== 'text';
        document.getElementById('deep-stroke-width-label').hidden = object.type !== 'rect';
        const setPreset = (id, value) => {
            const select = document.getElementById(id);
            select.querySelector('option[data-custom]')?.remove();
            if (![...select.options].some(option => Number(option.value) === value)) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = `${value} px`;
                option.dataset.custom = '';
                select.appendChild(option);
            }
            select.value = value;
        };
        if (object.type === 'text') setPreset('deep-font-size', object.fontSize || 24);
        if (object.type === 'rect') setPreset('deep-stroke-width', object.strokeWidth || 2);
        const color = object.color || this.defaultColor;
        this.colorInput.value = color;
        document.getElementById('deep-color-current').style.backgroundColor = color;
        this.colorTrigger.setAttribute('aria-label', `选择颜色，当前 ${color}`);
        this.colorPalette.querySelectorAll('[data-deep-color]').forEach(swatch => swatch.setAttribute('aria-pressed', String(swatch.dataset.deepColor.toLowerCase() === color.toLowerCase())));
        const screen = this.editing === object
            ? { x: this.editor.offsetLeft, y: this.editor.offsetTop }
            : this.worldToScreen(object);
        const width = this.viewport.clientWidth, height = this.viewport.clientHeight;
        const objectWidth = this.editing === object ? this.editor.offsetWidth : object.w * this.view.zoom;
        const objectHeight = this.editing === object ? this.editor.offsetHeight : object.h * this.view.zoom;
        const right = screen.x + objectWidth, bottom = screen.y + objectHeight;
        if (right < 0 || screen.x > width || bottom < 0 || screen.y > height) {
            this.objectProperties.hidden = true;
            return;
        }
        const bar = this.objectProperties;
        const left = screen.x + objectWidth / 2 - bar.offsetWidth / 2;
        const above = screen.y - bar.offsetHeight - 10;
        const top = above >= 8 ? above : bottom + 10;
        bar.style.left = `${Math.max(8, Math.min(width - bar.offsetWidth - 8, left))}px`;
        bar.style.top = `${Math.max(8, Math.min(height - bar.offsetHeight - 8, top))}px`;
        this.positionColorPalette();
    }

    hitTest(point) {
        for (let i = this.objects.length - 1; i >= 0; i--) {
            const object = this.objects[i];
            const pad = 5 / this.view.zoom;
            if (point.x >= object.x - pad && point.x <= object.x + object.w + pad && point.y >= object.y - pad && point.y <= object.y + object.h + pad) return object;
        }
        return null;
    }

    resizeHandleHit(point, object) {
        if (!object || object.type === 'text') return false;
        const radius = 10 / this.view.zoom;
        return Math.abs(point.x - (object.x + object.w)) <= radius && Math.abs(point.y - (object.y + object.h)) <= radius;
    }

    handleCanvasDoubleClick(event) {
        if (this.tool !== 'select' || this.loadFailed || (event.target !== this.canvas && event.target !== this.viewport)) return;
        const screen = this.localPoint(event);
        const object = this.hitTest(this.screenToWorld(screen));
        if (object?.type !== 'text') return;
        event.preventDefault();
        this.selectedId = object.id;
        this.startTextEdit(object, screen);
    }

    pointerDown(event) {
        if (this.loadFailed) return;
        if (event.target !== this.canvas || event.button > 1) return;
        if (this.navigationLocked && (event.button === 1 || this.spaceHeld)) return;
        this.finishTextEdit(true);
        const screen = this.localPoint(event), world = this.screenToWorld(screen);
        this.viewport.focus();
        this.viewport.setPointerCapture(event.pointerId);
        if (event.button === 1 || this.spaceHeld) {
            this.drag = { kind: 'pan', screen, x: this.view.x, y: this.view.y };
        } else if (this.tool === 'select') {
            const selected = this.objects.find(item => item.id === this.selectedId);
            if (this.resizeHandleHit(world, selected)) {
                this.snapshot();
                this.drag = { kind: 'resize', world, object: selected, w: selected.w, h: selected.h };
            } else {
                const object = this.hitTest(world);
                this.selectedId = object?.id || null;
                this.updateStyleControls();
                if (object?.type === 'text') this.drag = { kind: 'text-pending', screen, world, object, x: object.x, y: object.y };
                else if (object) { this.snapshot(); this.drag = { kind: 'move', screen, world, object, x: object.x, y: object.y }; }
                else if (!this.navigationLocked) this.drag = { kind: 'pan', screen, x: this.view.x, y: this.view.y };
            }
        } else if (this.tool === 'rectangle') {
            this.snapshot();
            this.draft = { id: this.newId(), type: 'rect', x: world.x, y: world.y, w: 0, h: 0, color: this.defaultColor, strokeWidth: this.defaultStrokeWidth };
            this.drag = { kind: 'rect', world };
        } else if (this.tool === 'text') {
            event.preventDefault();
            this.snapshot();
            const fontSize = this.defaultFontSize;
            const object = { id: this.newId(), type: 'text', x: world.x, y: world.y, w: 210, h: fontSize * 1.3, color: this.defaultColor, fontSize, text: '' };
            this.objects.push(object);
            this.selectedId = object.id;
            this.changed();
            this.startTextEdit(object);
        }
        this.render();
    }

    pointerMove(event) {
        const screen = this.localPoint(event), world = this.screenToWorld(screen);
        if (!this.drag) {
            const selected = this.objects.find(item => item.id === this.selectedId);
            this.canvas.style.cursor = this.tool === 'select' && this.resizeHandleHit(world, selected) ? 'nwse-resize' : '';
            return;
        }
        if (this.drag.kind === 'text-pending') {
            if (Math.hypot(screen.x - this.drag.screen.x, screen.y - this.drag.screen.y) < 5) return;
            this.snapshot();
            this.drag.kind = 'move';
        }
        if (this.drag.kind === 'pan') {
            if (!this.navigationLocked) {
                this.view.x = this.drag.x + screen.x - this.drag.screen.x;
                this.view.y = this.drag.y + screen.y - this.drag.screen.y;
            }
        } else if (this.drag.kind === 'move') {
            this.drag.object.x = this.drag.x + world.x - this.drag.world.x;
            this.drag.object.y = this.drag.y + world.y - this.drag.world.y;
        } else if (this.drag.kind === 'resize') {
            const object = this.drag.object;
            object.w = Math.max(10, this.drag.w + world.x - this.drag.world.x);
            object.h = object.type === 'image' ? object.w * this.drag.h / this.drag.w : Math.max(10, this.drag.h + world.y - this.drag.world.y);
        } else if (this.drag.kind === 'rect') {
            this.draft.x = Math.min(this.drag.world.x, world.x);
            this.draft.y = Math.min(this.drag.world.y, world.y);
            this.draft.w = Math.abs(world.x - this.drag.world.x);
            this.draft.h = Math.abs(world.y - this.drag.world.y);
        }
        this.render();
    }

    pointerUp(event) {
        if (!this.drag) {
            if (this.viewport.hasPointerCapture(event.pointerId)) this.viewport.releasePointerCapture(event.pointerId);
            return;
        }
        if (this.drag.kind === 'move') {
            if (this.drag.object.x !== this.drag.x || this.drag.object.y !== this.drag.y) this.changed();
            else this.undoStack.pop();
        } else if (this.drag.kind === 'resize') {
            if (this.drag.object.w !== this.drag.w || this.drag.object.h !== this.drag.h) this.changed();
            else this.undoStack.pop();
        } else if (this.drag.kind === 'rect') {
            if (this.draft?.w >= 3 && this.draft?.h >= 3) {
                this.objects.push(this.draft);
                this.selectedId = this.draft.id;
                this.changed();
            } else this.undoStack.pop();
            this.draft = null;
        }
        this.drag = null;
        if (this.viewport.hasPointerCapture(event.pointerId)) this.viewport.releasePointerCapture(event.pointerId);
        this.render();
    }

    keyDown(event) {
        if (this.disposed || this.exportDialog && !this.exportDialog.hidden) {
            if (event.key === 'Escape' && this.exportDialog) this.exportDialog.hidden = true;
            return;
        }
        if (event.key === 'Escape' && !this.contextMenu.hidden) {
            event.preventDefault();
            this.hideContextMenu();
            this.viewport.focus();
            return;
        }
        if (event.target.matches('input,textarea,select,[contenteditable="true"]')) return;
        if (event.code === 'Space' && !this.navigationLocked) { event.preventDefault(); this.spaceHeld = true; return; }
        const command = event.metaKey || event.ctrlKey;
        if (command && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) this.redo(); else this.undo(); return; }
        if (command && event.key.toLowerCase() === 'y') { event.preventDefault(); this.redo(); return; }
        if (event.key === 'Delete' || event.key === 'Backspace') {
            if (!this.selectedId) return;
            this.snapshot();
            this.objects = this.objects.filter(object => object.id !== this.selectedId);
            this.selectedId = null;
            this.changed();
            return;
        }
        if (event.key === 'Escape') { this.selectedId = null; this.setTool('select'); this.render(); return; }
        const key = event.key.toLowerCase();
        if (key === 'v') this.setTool('select');
        if (key === 'r') this.setTool('rectangle');
        if (key === 't') this.setTool('text');
        if (key === 'i') { this.pendingImportPoint = null; document.getElementById('deep-image-input').click(); }
    }

    newId() { return 'object_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }

    openContextMenu(event) {
        event.preventDefault();
        if (this.disposed || this.loadFailed) return;
        this.finishTextEdit(true);
        const screen = this.localPoint(event);
        this.contextMenuPoint = this.screenToWorld(screen);
        const target = this.hitTest(this.contextMenuPoint);
        this.contextMenuTargetId = target && ['rect', 'text', 'image'].includes(target.type) ? target.id : null;
        this.contextMenu.querySelector('[data-deep-add="delete"]').hidden = !this.contextMenuTargetId;
        this.contextMenu.hidden = false;
        const left = Math.max(8, Math.min(screen.x, this.viewport.clientWidth - this.contextMenu.offsetWidth - 8));
        const top = Math.max(8, Math.min(screen.y, this.viewport.clientHeight - this.contextMenu.offsetHeight - 8));
        this.contextMenu.style.left = `${left}px`;
        this.contextMenu.style.top = `${top}px`;
        this.contextMenu.querySelector('button').focus({ preventScroll: true });
    }

    hideContextMenu() {
        this.contextMenu.hidden = true;
        this.contextMenuTargetId = null;
    }

    addFromContextMenu(type) {
        const point = this.contextMenuPoint;
        const targetId = this.contextMenuTargetId;
        this.hideContextMenu();
        if (type === 'delete') {
            const target = this.objects.find(object => object.id === targetId && ['rect', 'text', 'image'].includes(object.type));
            if (!target) return;
            this.snapshot();
            this.objects = this.objects.filter(object => object.id !== targetId);
            if (this.selectedId === targetId) this.selectedId = null;
            this.changed();
            return;
        }
        if (!point) return;
        if (type === 'image') {
            this.pendingImportPoint = point;
            document.getElementById('deep-image-input').click();
            return;
        }
        if (type !== 'rectangle' && type !== 'text') return;
        this.snapshot();
        const object = type === 'rectangle'
            ? { id: this.newId(), type: 'rect', x: point.x, y: point.y, w: 200, h: 120, color: this.defaultColor, strokeWidth: this.defaultStrokeWidth }
            : { id: this.newId(), type: 'text', x: point.x, y: point.y, w: 210, h: this.defaultFontSize * 1.3, color: this.defaultColor, fontSize: this.defaultFontSize, text: '' };
        this.objects.push(object);
        this.selectedId = object.id;
        this.changed();
        this.setTool('select');
        if (type === 'text') this.startTextEdit(object);
    }

    updateEmpty() { const empty = document.getElementById('deep-empty'); if (empty) empty.hidden = this.objects.length > 0; }

    showImportError(message) {
        const notice = document.createElement('div');
        notice.className = 'deep-import-notice';
        notice.setAttribute('role', 'alert');
        notice.textContent = message;
        this.viewport.appendChild(notice);
        setTimeout(() => notice.remove(), 5000);
    }

    showImportProgress(message) {
        if (!this.importNotice) {
            this.importNotice = document.createElement('div');
            this.importNotice.className = 'deep-import-progress';
            this.importNotice.setAttribute('role', 'status');
            this.viewport.appendChild(this.importNotice);
        }
        this.importNotice.textContent = message;
    }

    handlePaste(event) {
        if (this.disposed || this.loadFailed || event.target.closest?.('input,textarea,[contenteditable="true"]')) return;
        const files = [...(event.clipboardData?.items || [])]
            .filter(item => item.kind === 'file')
            .map(item => item.getAsFile())
            .filter(file => file && (/^image\/(png|jpeg|webp|gif)$/.test(file.type) || /\.(psd|psb|png|jpe?g|webp|gif)$/i.test(file.name)));
        if (!files.length) return;
        event.preventDefault();
        this.importFiles(files);
    }

    async readImageSource(file) {
        const extension = file.name.toLowerCase().match(/\.([^.]+)$/)?.[1];
        if (extension === 'psd' || extension === 'psb') {
            const form = new FormData();
            form.append('file', file);
            form.append('projectId', this.project.id);
            let response;
            try { response = await fetch('/api/upload/image', { method: 'POST', body: form }); }
            catch (_) { throw new Error('PSD/PSB 导入需要运行图像处理后端'); }
            const result = await response.json();
            if (!response.ok || !result.success || !result.imageData) throw new Error(result.message || 'PSD/PSB 转换失败');
            return result.imageData;
        }
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('无法读取图像文件'));
            reader.readAsDataURL(file);
        });
    }

    async importFiles(files, at) {
        if (this.disposed || this.loadFailed) return;
        const supportedExtensions = new Set(['psd', 'psb', 'webp', 'png', 'jpg', 'jpeg', 'gif']);
        const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
        const images = files.filter(file => supportedExtensions.has(file.name.toLowerCase().match(/\.([^.]+)$/)?.[1]) || supportedTypes.has(file.type));
        if (!images.length) { if (files.length) this.showImportError('支持 PSD、PSB、WebP、PNG、JPG、JPEG 和 GIF'); return; }
        const center = at || this.screenToWorld({ x: this.viewport.clientWidth / 2, y: this.viewport.clientHeight / 2 });
        this.snapshot();
        let added = 0;
        let lastImage = null;
        const errors = [];
        for (const file of images) {
            if (this.disposed) break;
            try {
                this.showImportProgress(`正在导入 ${file.name}…`);
                const src = await this.readImageSource(file);
                this.showImportProgress(`正在显示 ${file.name}…`);
                const image = await new Promise((resolve, reject) => {
                    const element = new Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error('浏览器无法解码转换后的图像')); element.src = src;
                });
                if (this.disposed) break;
                const w = image.naturalWidth, h = image.naturalHeight;
                const object = { id: this.newId(), type: 'image', src, x: center.x - w / 2 + added * 30, y: center.y - h / 2 + added * 30, w, h };
                this.images.set(src, image);
                this.objects.push(object);
                this.selectedId = object.id;
                lastImage = object;
                added++;
            } catch (error) { errors.push(`${file.name}: ${error.message || '无法导入'}`); }
        }
        if (added) { this.changed(); this.locateImage(lastImage); }
        else this.undoStack.pop();
        this.importNotice?.remove();
        this.importNotice = null;
        if (errors.length) this.showImportError(errors.join('；'));
    }

    getImage(src) {
        if (this.images.has(src)) return this.images.get(src);
        const image = new Image();
        image.onload = () => this.render();
        image.src = src;
        this.images.set(src, image);
        return image;
    }

    measureText(object, ctx = this.ctx) {
        const lines = (object.text || '').split('\n');
        ctx.save(); ctx.font = `${object.fontSize || 24}px Inter, sans-serif`;
        const w = Math.max(20, ...lines.map(line => ctx.measureText(line || ' ').width));
        ctx.restore();
        object.w = Math.ceil(w);
        object.h = Math.max(1, lines.length) * (object.fontSize || 24) * 1.3;
    }

    sizeTextEditor() {
        if (!this.editing) return;
        const object = this.editing;
        const lines = this.editor.value.split('\n');
        this.ctx.save();
        this.ctx.font = `${object.fontSize || 24}px Inter, sans-serif`;
        const textWidth = Math.max(0, ...lines.map(line => this.ctx.measureText(line).width));
        this.ctx.restore();
        const screen = this.worldToScreen(object);
        const fontSize = (object.fontSize || 24) * this.view.zoom;
        const top = screen.y - fontSize * .15;
        const desiredWidth = Math.max(12, textWidth * this.view.zoom + 8);
        const desiredHeight = Math.max(1, lines.length) * fontSize * 1.3 + 4;
        const maxWidth = Math.max(12, this.viewport.clientWidth - Math.max(0, screen.x) - 8);
        const maxHeight = Math.max(fontSize * 1.3 + 4, this.viewport.clientHeight - Math.max(0, top) - 8);
        this.editor.style.left = `${screen.x}px`;
        this.editor.style.top = `${top}px`;
        this.editor.style.fontSize = `${fontSize}px`;
        this.editor.style.color = object.color;
        this.editor.style.width = `${Math.min(desiredWidth, maxWidth)}px`;
        this.editor.style.height = `${Math.min(desiredHeight, maxHeight)}px`;
        this.editor.style.overflowX = desiredWidth > maxWidth ? 'auto' : 'hidden';
        this.editor.style.overflowY = desiredHeight > maxHeight ? 'auto' : 'hidden';
    }

    textCaretIndex(object, point) {
        if (!point) return this.editor.value.length;
        const lines = this.editor.value.split('\n');
        const screen = this.worldToScreen(object);
        const editorTop = screen.y - (object.fontSize || 24) * this.view.zoom * .15;
        const lineIndex = Math.max(0, Math.min(lines.length - 1, Math.floor((point.y - editorTop) / ((object.fontSize || 24) * this.view.zoom * 1.3))));
        const x = (point.x - screen.x) / this.view.zoom;
        this.ctx.save();
        this.ctx.font = `${object.fontSize || 24}px Inter, sans-serif`;
        let index = lines.slice(0, lineIndex).reduce((total, line) => total + line.length + 1, 0);
        let prefix = '';
        for (const character of lines[lineIndex]) {
            const next = prefix + character;
            if (x < (this.ctx.measureText(prefix).width + this.ctx.measureText(next).width) / 2) break;
            prefix = next;
            index += character.length;
        }
        this.ctx.restore();
        return index;
    }

    startTextEdit(object, point) {
        this.finishTextEdit(true);
        this.editing = object;
        this.editOriginal = object.text;
        this.editor.value = object.text;
        const caret = this.textCaretIndex(object, point);
        const screen = this.worldToScreen(object);
        const firstLineHeight = (object.fontSize || 24) * this.view.zoom * 1.3;
        const minTop = (this.objectProperties.offsetHeight || 42) + 18 + (object.fontSize || 24) * this.view.zoom * .15;
        const maxTop = Math.max(minTop, this.viewport.clientHeight - firstLineHeight - 8);
        this.view.y += Math.max(minTop, Math.min(maxTop, screen.y)) - screen.y;
        this.editor.hidden = false;
        this.sizeTextEditor();
        this.editor.focus({ preventScroll: true });
        this.editor.setSelectionRange(caret, caret);
        this.render();
    }

    finishTextEdit(commit) {
        if (!this.editing) return;
        const object = this.editing, text = this.editor.value.trim();
        this.editing = null;
        this.editor.hidden = true;
        if (!commit) {
            object.text = this.editOriginal;
            if (!object.text) this.objects = this.objects.filter(item => item !== object);
        } else if (!text) {
            this.objects = this.objects.filter(item => item !== object);
        } else {
            if (text !== this.editOriginal && this.editOriginal) this.snapshot();
            object.text = text;
            this.measureText(object);
        }
        if (object.text === this.editOriginal && this.objects.includes(object)) this.render();
        else this.changed();
    }

    drawObjects(ctx, objects, selected = false) {
        for (const object of objects) {
            if (object.type === 'image') {
                const image = this.getImage(object.src);
                if (image.complete && image.naturalWidth) ctx.drawImage(image, object.x, object.y, object.w, object.h);
            } else if (object.type === 'rect') {
                ctx.strokeStyle = object.color;
                ctx.lineWidth = object.strokeWidth || 2;
                ctx.strokeRect(object.x, object.y, object.w, object.h);
            } else if (object.type === 'text' && object.text && object !== this.editing) {
                ctx.fillStyle = object.color;
                ctx.font = `${object.fontSize || 24}px Inter, sans-serif`;
                ctx.textBaseline = 'top';
                object.text.split('\n').forEach((line, index) => ctx.fillText(line, object.x, object.y + index * (object.fontSize || 24) * 1.3));
            }
            if (selected && object.id === this.selectedId && object !== this.editing) {
                ctx.strokeStyle = '#4ca9ee'; ctx.lineWidth = 1 / this.view.zoom;
                ctx.setLineDash([5 / this.view.zoom, 3 / this.view.zoom]);
                ctx.strokeRect(object.x - 3 / this.view.zoom, object.y - 3 / this.view.zoom, object.w + 6 / this.view.zoom, object.h + 6 / this.view.zoom);
                ctx.setLineDash([]);
                if (object.type !== 'text') {
                    const handle = 8 / this.view.zoom;
                    ctx.fillStyle = '#4ca9ee';
                    ctx.fillRect(object.x + object.w - handle / 2, object.y + object.h - handle / 2, handle, handle);
                }
            }
        }
    }

    render() {
        if (this.disposed || !this.ctx || !this.viewport.clientWidth) return;
        const ctx = this.ctx, dpr = this.dpr || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, this.viewport.clientWidth, this.viewport.clientHeight);
        ctx.fillStyle = getComputedStyle(this.viewport).backgroundColor;
        ctx.fillRect(0, 0, this.viewport.clientWidth, this.viewport.clientHeight);
        const grid = 40 * Math.max(1, 2 ** Math.ceil(Math.log2(.6 / this.view.zoom)));
        ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--canvas-700');
        ctx.globalAlpha = .45; ctx.lineWidth = 1;
        for (let x = ((this.view.x % (grid * this.view.zoom)) + grid * this.view.zoom) % (grid * this.view.zoom); x < this.viewport.clientWidth; x += grid * this.view.zoom) { ctx.beginPath(); ctx.moveTo(Math.round(x) + .5, 0); ctx.lineTo(Math.round(x) + .5, this.viewport.clientHeight); ctx.stroke(); }
        for (let y = ((this.view.y % (grid * this.view.zoom)) + grid * this.view.zoom) % (grid * this.view.zoom); y < this.viewport.clientHeight; y += grid * this.view.zoom) { ctx.beginPath(); ctx.moveTo(0, Math.round(y) + .5); ctx.lineTo(this.viewport.clientWidth, Math.round(y) + .5); ctx.stroke(); }
        ctx.globalAlpha = 1;
        ctx.translate(this.view.x, this.view.y);
        ctx.scale(this.view.zoom, this.view.zoom);
        this.drawObjects(ctx, this.draft ? [...this.objects, this.draft] : this.objects, true);
        if (this.editing) this.sizeTextEditor();
        const zoomValue = document.getElementById('deep-zoom-value');
        if (zoomValue) {
            zoomValue.textContent = (this.view.zoom < .1 ? (this.view.zoom * 100).toFixed(1) : Math.round(this.view.zoom * 100)) + '%';
            zoomValue.disabled = this.navigationLocked || !this.objects.some(object => object.type === 'image');
            zoomValue.setAttribute('aria-label', `定位图像，当前缩放 ${zoomValue.textContent}`);
        }
        this.updateStyleControls();
        this.renderMinimap();
    }

    updateExportSize(reset = false, fromWidth = false) {
        const box = this.bounds();
        if (!box) return;
        const baseWidth = Math.max(1, Math.ceil(box.right - box.left));
        const baseHeight = Math.max(1, box.bottom - box.top);
        const slider = document.getElementById('deep-export-scale');
        const widthInput = document.getElementById('deep-export-width');
        widthInput.max = String(baseWidth);
        if (reset) slider.value = '100';
        let scale = Number(slider.value) / 100;
        if (fromWidth) {
            const requestedWidth = Number(widthInput.value);
            if (!Number.isFinite(requestedWidth) || requestedWidth <= 0) {
                document.getElementById('deep-export-confirm').disabled = true;
                return;
            }
            const selectedWidth = Math.min(baseWidth, Math.max(1, Math.round(requestedWidth)));
            scale = selectedWidth / baseWidth;
            widthInput.value = String(selectedWidth);
            slider.value = String(Math.max(1, Math.round(scale * 100)));
        } else widthInput.value = String(Math.max(1, Math.round(baseWidth * scale)));
        document.getElementById('deep-export-confirm').disabled = false;
        this.exportScale = scale;
        const width = Math.ceil(baseWidth * scale) + 200;
        const height = Math.ceil(baseHeight * scale) + 200;
        document.getElementById('deep-export-scale-value').textContent = `${Math.round(scale * 1000) / 10}%`;
        document.getElementById('deep-export-size-summary').textContent = `导出尺寸 ${width.toLocaleString()} × ${height.toLocaleString()} px（含留白）`;
    }

    async exportImage() {
        const box = this.bounds();
        if (!box) return;
        const contentWidth = Math.max(1, box.right - box.left);
        const contentHeight = Math.max(1, box.bottom - box.top);
        if (!Number.isFinite(contentWidth * contentHeight)) return this.notify('画布尺寸无效，无法导出', true);
        const scale = Math.max(0.000001, Math.min(1, Number(this.exportScale) || 1));
        const width = Math.ceil(contentWidth * scale) + 200;
        const height = Math.ceil(contentHeight * scale) + 200;
        const format = document.querySelector('input[name="deep-format"]:checked')?.value === 'jpg' ? 'jpg' : 'png';
        const button = document.getElementById('deep-export-confirm');
        button.disabled = true;
        button.textContent = '导出中…';
        try {
            await Promise.all(this.objects.filter(object => object.type === 'image').map(object => new Promise((resolve, reject) => {
                const image = this.getImage(object.src);
                if (image.complete) return image.naturalWidth ? resolve() : reject(new Error('图片损坏'));
                image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', reject, { once: true });
            })));
            const output = document.createElement('canvas');
            output.width = width; output.height = height;
            const ctx = output.getContext('2d');
            if (!ctx) throw new Error('浏览器无法创建该尺寸的画布，请降低缩放倍率');
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
            ctx.translate(100, 100);
            ctx.scale(scale, scale);
            ctx.translate(-box.left, -box.top);
            this.drawObjects(ctx, this.objects);
            const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
            const blob = await new Promise(resolve => output.toBlob(resolve, mime, .92));
            if (!blob) throw new Error('图像生成失败，请降低缩放倍率');
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url; link.download = `${this.project.name || '深绘画布'}.${format}`;
            document.body.appendChild(link); link.click(); link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
            this.exportDialog.hidden = true;
            this.notify('导出完成');
        } catch (error) { this.notify('导出失败：' + error.message, true); }
        finally { button.disabled = false; button.textContent = '导出'; }
    }
}
