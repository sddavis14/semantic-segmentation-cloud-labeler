/**
 * Point Cloud Labeling Tool - Main Application
 */
class App {
    constructor() {
        this.viewer = null;
        this.labelManager = new LabelManager();
        this.selectionManager = null;
        this.fileBrowser = new FileBrowser();
        this.activeLabel = 0; // Currently active label ID for assignment

        this.init();
    }

    async init() {
        // Initialize viewer
        const viewport = document.getElementById('viewport');
        this.viewer = new PointCloudViewer(viewport);

        // Initialize selection manager
        this.selectionManager = new SelectionManager(this.viewer);

        // Load label configuration
        await this.labelManager.loadConfig();
        this.viewer.setLabelColors(this.labelManager.labels);

        // Build label buttons
        this.buildLabelButtons();

        // Setup event handlers
        this.setupUIEvents();
        this.setupKeyboardShortcuts();
        this.setupSelectionEvents();

        // Setup callbacks
        this.fileBrowser.onFileChanged = (file) => this.loadFile(file);
        this.labelManager.onLabelsChanged = () => this.onLabelsChanged();
        this.selectionManager.onSelectionChanged = () => this.onSelectionChanged();

        // Check for startup config (initial directory from CLI)
        await this.checkStartupConfig();
    }

    async checkStartupConfig() {
        try {
            const response = await fetch('/api/config/startup');
            const config = await response.json();

            if (config.initialDirectory) {
                // Auto-open the initial directory
                const count = await this.fileBrowser.loadDirectory(config.initialDirectory);
                if (count > 0) {
                    await this.buildFileTree(config.initialDirectory);
                    this.fileBrowser.goToFirst();
                }
            }
        } catch (err) {
            console.log('No startup config');
        }
    }

    buildLabelButtons() {
        const container = document.getElementById('label-buttons');
        container.innerHTML = '';

        this.labelManager.labels.forEach(label => {
            const btn = document.createElement('button');
            btn.className = 'label-btn';
            btn.dataset.labelId = label.id;
            btn.innerHTML = `
                <span class="label-color" style="background-color: ${label.color}"></span>
                <span class="label-name">${label.name}</span>
                <span class="label-shortcut">${label.shortcut}</span>
            `;
            btn.addEventListener('click', () => {
                this.setActiveLabel(label.id);
                this.assignLabelToSelection(label.id);
            });
            container.appendChild(btn);
        });

        // Set initial active label
        this.updateActiveLabelUI();
    }

    setActiveLabel(labelId) {
        this.activeLabel = labelId;
        this.updateActiveLabelUI();
    }

    updateActiveLabelUI() {
        // Remove active class from all buttons
        document.querySelectorAll('.label-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        // Add active class to the active label button
        const activeBtn = document.querySelector(`.label-btn[data-label-id="${this.activeLabel}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    }

    setupUIEvents() {
        // Open folder
        document.getElementById('btn-open').addEventListener('click', () => this.showFolderModal());
        document.getElementById('btn-folder-open').addEventListener('click', () => this.openFolder());
        document.getElementById('btn-folder-cancel').addEventListener('click', () => this.hideFolderModal());
        document.getElementById('btn-folder-close').addEventListener('click', () => this.hideFolderModal());

        // Folder path input (in footer)
        document.getElementById('folder-path-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const path = e.target.value.trim();
                if (path) this.browseTo(path);
            }
            if (e.key === 'Escape') this.hideFolderModal();
        });

        // Folder filter input
        document.getElementById('folder-filter-input').addEventListener('input', (e) => {
            this.filterFolders(e.target.value);
        });

        // Sidebar favorites
        document.querySelectorAll('#folder-favorites .sidebar-item').forEach(item => {
            item.addEventListener('click', () => {
                const path = item.dataset.path;
                this.browseTo(path);
            });
        });

        // Folder list keyboard navigation
        document.getElementById('folder-list').addEventListener('keydown', (e) => {
            this.handleFolderListKeydown(e);
        });

        // Save
        document.getElementById('btn-save').addEventListener('click', () => this.saveLabels());

        // Navigation
        document.getElementById('btn-prev').addEventListener('click', () => this.previousFile());
        document.getElementById('btn-next').addEventListener('click', () => this.nextFile());

        // Selection tools
        document.getElementById('btn-box-select').addEventListener('click', () => this.setSelectionMode('box'));
        document.getElementById('btn-lasso-select').addEventListener('click', () => this.setSelectionMode('lasso'));

        // Colorization
        document.getElementById('colorize-mode').addEventListener('change', (e) => {
            this.viewer.setColorMode(e.target.value);
            this.updateColors();
        });

        // Point size slider
        document.getElementById('point-size').addEventListener('input', (e) => {
            const size = parseFloat(e.target.value);
            document.getElementById('point-size-value').textContent = size;
            this.viewer.setPointSize(size);
        });

        // Reset view
        document.getElementById('btn-reset-view').addEventListener('click', () => this.viewer.resetView());

        // Clear selection
        document.getElementById('btn-clear-selection').addEventListener('click', () => this.clearSelection());

        // Label configuration
        document.getElementById('btn-edit-labels').addEventListener('click', () => this.showLabelConfigModal());
        document.getElementById('btn-add-label').addEventListener('click', () => this.addLabelConfigItem());
        document.getElementById('btn-save-config').addEventListener('click', () => this.saveLabelConfig());
        document.getElementById('btn-cancel-config').addEventListener('click', () => this.hideLabelConfigModal());

        // Config file management
        document.getElementById('btn-load-config').addEventListener('click', () => this.loadConfigFromFile());
        document.getElementById('btn-new-config').addEventListener('click', () => this.createNewConfig());
        document.getElementById('btn-save-config-as').addEventListener('click', () => this.saveConfigAsFile());

        // Convert PCD format
        document.getElementById('btn-convert-format').addEventListener('click', () => this.convertPCDFormat());
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ignore if in modal or input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (!document.getElementById('folder-modal').classList.contains('hidden')) return;
            if (!document.getElementById('label-config-modal').classList.contains('hidden')) return;

            const key = e.key.toLowerCase();

            // Navigation
            if (key === 'n' || key === 'arrowright') {
                e.preventDefault();
                this.nextFile();
                return;
            }
            if (key === 'p' || key === 'arrowleft') {
                e.preventDefault();
                this.previousFile();
                return;
            }

            // Save
            if (e.ctrlKey && key === 's') {
                e.preventDefault();
                this.saveLabels();
                return;
            }

            // Open
            if (e.ctrlKey && key === 'o') {
                e.preventDefault();
                this.showFolderModal();
                return;
            }

            // Clear selection
            if (key === 'escape') {
                this.clearSelection();
                return;
            }

            // Selection modes
            if (key === 'b') {
                this.setSelectionMode('box');
                return;
            }
            if (key === 'l') {
                this.setSelectionMode('lasso');
                return;
            }

            // Reset view
            if (key === 'r') {
                this.viewer.resetView();
                return;
            }

            // Cycle colorization
            if (key === 'c') {
                this.cycleColorMode();
                return;
            }

            // Quick label assignment (0-9)
            const label = this.labelManager.getLabelByShortcut(key);
            if (label) {
                this.setActiveLabel(label.id);
                this.assignLabelToSelection(label.id);
                return;
            }
        });
    }

    setupSelectionEvents() {
        const viewportElement = document.getElementById('viewport');
        const canvas = this.viewer.renderer.domElement;
        let isDragging = false;

        // Use pointer events - OrbitControls blocks mouse events but not pointer events
        canvas.addEventListener('pointerdown', (e) => {

            // Right click (button 2) - let OrbitControls handle for orbit
            if (e.button === 2) return;
            // Middle click - ignore
            if (e.button === 1) return;
            // Only handle left click (button 0)
            if (e.button !== 0) return;

            // Capture pointer to ensure we get all events
            canvas.setPointerCapture(e.pointerId);

            isDragging = true;
            this.selectionManager.startSelection(e.clientX, e.clientY);
        });

        canvas.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            if (this.selectionManager.isSelecting) {
                this.selectionManager.updateSelection(e.clientX, e.clientY);
            }
        });

        canvas.addEventListener('pointerup', (e) => {
            if (e.button !== 0) return;
            if (!isDragging) return;

            canvas.releasePointerCapture(e.pointerId);
            isDragging = false;
            this.selectionManager.endSelection(e.clientX, e.clientY);
        });

        // Prevent context menu on viewport
        viewportElement.addEventListener('contextmenu', (e) => {
            // Allow right-click for orbit controls
        });
    }

    async showFolderModal() {
        // Show server folder browser modal
        document.getElementById('folder-modal').classList.remove('hidden');
        const startPath = this.lastBrowsePath || '';
        await this.browseTo(startPath);
    }

    hideFolderModal() {
        document.getElementById('folder-modal').classList.add('hidden');
    }

    async browseTo(dirPath) {
        try {
            const url = `/api/browse?dir=${encodeURIComponent(dirPath)}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.error) {
                console.error(data.error);
                return;
            }

            // Update state
            document.getElementById('folder-path-input').value = data.current;
            this.currentBrowsePath = data.current;
            this.lastBrowsePath = data.current;
            this.folderListData = data.directories; // Store for filtering
            this.focusedFolderIndex = -1;

            // Update breadcrumb
            this.updateBreadcrumb(data.current);

            // Add to recent folders
            this.addRecentFolder(data.current);

            // Render folder list
            this.renderFolderList(data.directories, data.parent, data.current);

            // Update info
            const info = document.getElementById('folder-info');
            if (data.pcdCount > 0) {
                info.textContent = `📁 ${data.pcdCount} .pcd file(s) in this folder`;
                info.style.color = 'var(--success)';
                this.selectedBrowsePath = data.current;
            } else {
                info.textContent = 'No .pcd files here. Double-click a folder to navigate.';
                info.style.color = 'var(--text-secondary)';
            }

            // Clear filter
            document.getElementById('folder-filter-input').value = '';

        } catch (err) {
            console.error('Failed to browse:', err);
        }
    }

    updateBreadcrumb(path) {
        const breadcrumb = document.getElementById('folder-breadcrumb');
        breadcrumb.innerHTML = '';

        const parts = path.split('/').filter(p => p);
        let currentPath = '';

        // Add root
        const rootItem = document.createElement('span');
        rootItem.className = 'breadcrumb-item';
        rootItem.textContent = '🏠';
        rootItem.addEventListener('click', () => this.browseTo('/'));
        breadcrumb.appendChild(rootItem);

        parts.forEach((part, index) => {
            currentPath += '/' + part;
            const pathForClick = currentPath;

            // Separator
            const sep = document.createElement('span');
            sep.className = 'breadcrumb-separator';
            sep.textContent = '›';
            breadcrumb.appendChild(sep);

            // Path part
            const item = document.createElement('span');
            item.className = 'breadcrumb-item';
            if (index === parts.length - 1) {
                item.classList.add('current');
            }
            item.textContent = part;
            item.addEventListener('click', () => this.browseTo(pathForClick));
            breadcrumb.appendChild(item);
        });
    }

    renderFolderList(directories, parent, current) {
        const list = document.getElementById('folder-list');
        list.innerHTML = '';

        // Add parent directory option
        if (parent && parent !== current) {
            const parentItem = document.createElement('div');
            parentItem.className = 'folder-item';
            parentItem.dataset.path = parent;
            parentItem.innerHTML = `
                <span class="folder-icon">�</span>
                <span class="folder-name">..</span>
            `;
            parentItem.addEventListener('click', () => this.selectFolderItem(parentItem, parent));
            parentItem.addEventListener('dblclick', () => this.browseTo(parent));
            list.appendChild(parentItem);
        }

        // Add directories
        directories.forEach(dir => {
            const item = document.createElement('div');
            item.className = 'folder-item';
            item.dataset.path = dir.path;
            item.dataset.name = dir.name.toLowerCase();

            const pcdBadge = dir.pcdCount > 0
                ? `<span class="folder-pcd-count">${dir.pcdCount} PCD</span>`
                : '';

            item.innerHTML = `
                <span class="folder-icon">📁</span>
                <span class="folder-name">${dir.name}</span>
                ${pcdBadge}
            `;
            item.addEventListener('click', () => this.selectFolderItem(item, dir.path));
            item.addEventListener('dblclick', () => this.browseTo(dir.path));
            list.appendChild(item);
        });
    }

    selectFolderItem(item, path) {
        const list = document.getElementById('folder-list');
        list.querySelectorAll('.folder-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        this.selectedBrowsePath = path;

        // Update focus index
        const items = Array.from(list.querySelectorAll('.folder-item'));
        this.focusedFolderIndex = items.indexOf(item);
    }

    filterFolders(query) {
        const list = document.getElementById('folder-list');
        const items = list.querySelectorAll('.folder-item');
        const q = query.toLowerCase();

        items.forEach(item => {
            const name = item.dataset.name || '';
            if (name.includes(q) || name === '..') {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    }

    handleFolderListKeydown(e) {
        const list = document.getElementById('folder-list');
        const items = Array.from(list.querySelectorAll('.folder-item')).filter(i => i.style.display !== 'none');

        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.focusedFolderIndex = Math.min(this.focusedFolderIndex + 1, items.length - 1);
            this.focusFolderItem(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.focusedFolderIndex = Math.max(this.focusedFolderIndex - 1, 0);
            this.focusFolderItem(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (this.focusedFolderIndex >= 0 && this.focusedFolderIndex < items.length) {
                const item = items[this.focusedFolderIndex];
                this.browseTo(item.dataset.path);
            }
        } else if (e.key === 'Backspace') {
            e.preventDefault();
            const current = this.currentBrowsePath;
            const parent = current.split('/').slice(0, -1).join('/') || '/';
            if (parent !== current) {
                this.browseTo(parent);
            }
        }
    }

    focusFolderItem(items) {
        items.forEach(i => i.classList.remove('focused'));
        if (this.focusedFolderIndex >= 0 && this.focusedFolderIndex < items.length) {
            const item = items[this.focusedFolderIndex];
            item.classList.add('focused');
            item.scrollIntoView({ block: 'nearest' });
            this.selectFolderItem(item, item.dataset.path);
        }
    }

    addRecentFolder(path) {
        if (!this.recentFolders) {
            this.recentFolders = [];
        }

        // Remove if already exists
        this.recentFolders = this.recentFolders.filter(p => p !== path);

        // Add to front
        this.recentFolders.unshift(path);

        // Keep only last 5
        this.recentFolders = this.recentFolders.slice(0, 5);

        // Update UI
        this.updateRecentFolders();
    }

    updateRecentFolders() {
        const container = document.getElementById('folder-recent');
        container.innerHTML = '';

        this.recentFolders.forEach(path => {
            const name = path.split('/').pop() || path;
            const item = document.createElement('div');
            item.className = 'sidebar-item';
            item.innerHTML = `
                <span class="sidebar-icon">📂</span>
                <span>${name}</span>
            `;
            item.addEventListener('click', () => this.browseTo(path));
            container.appendChild(item);
        });
    }

    async openFolder() {
        const dirPath = this.selectedBrowsePath || document.getElementById('folder-path-input').value.trim();

        if (!dirPath) {
            alert('Please select or enter a folder path');
            return;
        }

        try {
            const count = await this.fileBrowser.loadDirectory(dirPath);
            this.hideFolderModal();

            if (count > 0) {
                // Build file tree
                await this.buildFileTree(dirPath);
                this.fileBrowser.goToFirst();
            } else {
                alert('No .pcd files found in the directory');
            }
        } catch (err) {
            alert(`Failed to open folder: ${err.message}`);
        }
    }

    async buildFileTree(rootPath) {
        const treeContainer = document.getElementById('file-tree');
        treeContainer.innerHTML = '';

        // Create root folder node
        const rootName = rootPath.split('/').pop() || rootPath;
        const rootFolder = this.createFolderNode(rootName, rootPath, this.fileBrowser.files);
        treeContainer.appendChild(rootFolder);
    }

    createFolderNode(name, path, files) {
        const folder = document.createElement('div');
        folder.className = 'tree-folder';

        const header = document.createElement('div');
        header.className = 'tree-folder-header';
        header.innerHTML = `
            <span class="tree-folder-toggle">▼</span>
            <span class="tree-folder-icon">📁</span>
            <span class="tree-folder-name">${name}</span>
        `;
        header.addEventListener('click', () => {
            folder.classList.toggle('collapsed');
            header.querySelector('.tree-folder-toggle').textContent =
                folder.classList.contains('collapsed') ? '▶' : '▼';
        });
        folder.appendChild(header);

        const children = document.createElement('div');
        children.className = 'tree-folder-children';

        // Add PCD files
        files.forEach((file, index) => {
            const fileNode = document.createElement('div');
            fileNode.className = 'tree-file';
            fileNode.dataset.index = index;
            fileNode.dataset.path = file.path || file.name;
            fileNode.innerHTML = `
                <span class="tree-file-icon">📄</span>
                <span class="tree-file-name">${file.name}</span>
            `;
            fileNode.addEventListener('click', async () => {
                if (file.handle) {
                    // File System Access API - load from handle
                    this.fileBrowser.currentIndex = index;
                    await this.loadFileFromHandle(file);
                    this.updateFileTreeSelection();
                } else {
                    // Server-based file loading
                    this.fileBrowser.goToIndex(index);
                    this.updateFileTreeSelection();
                }
            });
            children.appendChild(fileNode);
        });

        folder.appendChild(children);
        return folder;
    }

    updateFileTreeSelection() {
        const currentPath = this.fileBrowser.getCurrentFilePath();
        document.querySelectorAll('.tree-file').forEach(node => {
            node.classList.toggle('active', node.dataset.path === currentPath);
        });
    }

    async loadFile(file) {
        if (!file) return;

        // Check for unsaved changes
        if (this.labelManager.isDirty()) {
            if (!confirm('You have unsaved changes. Continue without saving?')) {
                return;
            }
        }

        try {
            // Fetch PCD data from native parser API
            const response = await fetch(`/api/pcd/parse?path=${encodeURIComponent(file.path)}`);
            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            // Load data into viewer
            const result = this.viewer.loadFromData(data);

            // Initialize labels for this point cloud
            this.labelManager.initForPointCloud(result.pointCount);

            // Apply embedded labels from PCD if present
            if (result.labels) {
                this.labelManager.setPointLabels(Array.from(result.labels));
            }

            // Update colorize dropdown with available fields
            this.updateColorizeOptions(result.fieldNames);

            // Update colors
            this.updateColors();

            // Update UI
            this.updateStatusBar();
            this.updateFileProgress();
            this.updateFileTreeSelection();
            this.updatePCDFormatLabel();

            console.log(`Loaded ${file.name} with ${result.pointCount} points using native parser`);
        } catch (err) {
            console.error('Failed to load file:', err);
            alert(`Failed to load file: ${err.message}`);
        }
    }

    previousFile() {
        this.fileBrowser.goToPrevious();
    }

    nextFile() {
        this.fileBrowser.goToNext();
    }

    async saveLabels() {
        const currentFile = this.fileBrowser.getCurrentFile();
        if (!currentFile) {
            alert('No file loaded');
            return;
        }

        // For server-based files, use native parser API
        const filePath = currentFile.path;
        if (!filePath || filePath.startsWith('fs:')) {
            // File System Access API - not yet supported for native save
            alert('Saving labels for browser-selected files requires server access. Please use the folder browser modal.');
            return;
        }

        try {
            // Use native parser API to update labels in PCD file  
            const response = await fetch('/api/pcd/update-labels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pcdPath: filePath,
                    labels: Array.from(this.labelManager.pointLabels)
                })
            });

            const result = await response.json();
            if (result.success) {
                this.labelManager.markClean();
                this.updateStatusBar();
                this.showNotification('Labels saved successfully!', 'success');
            } else {
                alert('Failed to save labels: ' + (result.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Failed to save labels:', err);
            alert('Failed to save labels: ' + err.message);
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        // Style the notification
        Object.assign(notification.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '12px 24px',
            borderRadius: '8px',
            color: 'white',
            fontWeight: '500',
            zIndex: '10000',
            opacity: '0',
            transform: 'translateY(20px)',
            transition: 'all 0.3s ease',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        });

        // Set background color based on type
        if (type === 'success') {
            notification.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        } else if (type === 'error') {
            notification.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
        } else {
            notification.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)';
        }

        document.body.appendChild(notification);

        // Animate in
        requestAnimationFrame(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
        });

        // Auto-remove after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(20px)';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    async updatePCDFormatLabel() {
        const currentFile = this.fileBrowser.getCurrentFile();
        if (!currentFile || !currentFile.path) {
            document.getElementById('pcd-format-label').textContent = '---';
            return;
        }

        try {
            const response = await fetch(`/api/pcd/format?path=${encodeURIComponent(currentFile.path)}`);
            const data = await response.json();
            if (data.format) {
                document.getElementById('pcd-format-label').textContent = data.format.toUpperCase();
            }
        } catch (err) {
            console.error('Failed to get PCD format:', err);
        }
    }

    async convertPCDFormat() {
        const currentFile = this.fileBrowser.getCurrentFile();
        if (!currentFile || !currentFile.path) {
            alert('No file loaded');
            return;
        }

        // Get current format
        const formatLabel = document.getElementById('pcd-format-label').textContent.toLowerCase();
        const targetFormat = formatLabel === 'ascii' ? 'binary' : 'ascii';

        if (!confirm(`Convert "${currentFile.name}" to ${targetFormat.toUpperCase()} format?`)) {
            return;
        }

        try {
            const response = await fetch('/api/pcd/convert-format', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pcdPath: currentFile.path,
                    targetFormat: targetFormat
                })
            });

            const result = await response.json();
            if (result.success) {
                this.showNotification(`Converted to ${result.format.toUpperCase()} format!`, 'success');
                // Reload the file to get the new format and updated data
                await this.loadFile(currentFile);
            } else {
                alert('Failed to convert format: ' + (result.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Failed to convert format:', err);
            alert('Failed to convert format: ' + err.message);
        }
    }

    setSelectionMode(mode) {
        this.selectionManager.setMode(mode);

        // Update UI
        document.getElementById('btn-box-select').classList.toggle('active', mode === 'box');
        document.getElementById('btn-lasso-select').classList.toggle('active', mode === 'lasso');
        document.getElementById('status-mode').textContent = mode === 'box' ? 'Box Select' : 'Lasso Select';
    }

    clearSelection() {
        this.selectionManager.clearSelection();
    }

    assignLabelToSelection(labelId) {
        const selected = this.selectionManager.getSelectedIndices();
        if (selected.size === 0) {
            return;
        }

        this.labelManager.assignLabel(selected, labelId);
        this.selectionManager.clearSelection();
    }

    onSelectionChanged() {
        this.updateColors();
        this.updateStatusBar();
    }

    updateColors() {
        this.viewer.updateColors(
            this.labelManager.getPointLabels(),
            this.selectionManager.getSelectedIndices()
        );
    }

    // Update colorize dropdown with available fields from PCD
    updateColorizeOptions(fieldNames) {
        const select = document.getElementById('colorize-mode');
        const currentValue = select.value;

        // Clear existing options except "label"
        select.innerHTML = '<option value="label">Label</option>';

        // Check if RGB fields are present
        const lowerNames = (fieldNames || []).map(n => n.toLowerCase());
        const hasRGB = lowerNames.includes('r') && lowerNames.includes('g') && lowerNames.includes('b');

        // Add RGB option if available
        if (hasRGB) {
            const rgbOption = document.createElement('option');
            rgbOption.value = 'rgb';
            rgbOption.textContent = 'RGB Color';
            select.appendChild(rgbOption);
        }

        // Add field options
        if (fieldNames && fieldNames.length > 0) {
            for (const name of fieldNames) {
                const lower = name.toLowerCase();
                // Skip x, y, z as they're not useful for colorization
                // Skip r, g, b if RGB mode is available (grouped into RGB option)
                if (['x', 'y', 'z'].includes(lower)) continue;
                if (hasRGB && ['r', 'g', 'b'].includes(lower)) continue;

                const option = document.createElement('option');
                option.value = name;
                option.textContent = name.charAt(0).toUpperCase() + name.slice(1);
                select.appendChild(option);
            }
        }

        // Restore previous selection if still available
        if (Array.from(select.options).some(opt => opt.value === currentValue)) {
            select.value = currentValue;
        }
    }

    cycleColorMode() {
        const select = document.getElementById('colorize-mode');
        const options = Array.from(select.options);
        const currentIndex = options.findIndex(opt => opt.selected);
        const nextIndex = (currentIndex + 1) % options.length;
        select.selectedIndex = nextIndex;

        this.viewer.setColorMode(select.value);
        this.updateColors();
    }

    updateStatusBar() {
        const fileName = this.fileBrowser.getCurrentFileName() || 'No file loaded';
        const pointCount = this.viewer.getPointCount();
        const selectedCount = this.selectionManager.getSelectedCount();
        const dirty = this.labelManager.isDirty() ? ' *' : '';

        document.getElementById('status-file').textContent = fileName + dirty;
        document.getElementById('status-points').textContent = `${pointCount.toLocaleString()} points`;
        document.getElementById('status-selection').textContent = `${selectedCount.toLocaleString()} selected`;
    }

    updateFileProgress() {
        document.getElementById('file-progress').textContent = this.fileBrowser.getProgressString();
    }

    // Label Configuration Modal
    showLabelConfigModal() {
        const list = document.getElementById('label-config-list');
        list.innerHTML = '';

        this.labelManager.labels.forEach((label, index) => {
            this.addLabelConfigRow(list, label, index);
        });

        document.getElementById('label-config-modal').classList.remove('hidden');
    }

    addLabelConfigRow(container, label, index) {
        const row = document.createElement('div');
        row.className = 'label-config-item';
        row.dataset.index = index;
        row.innerHTML = `
            <input type="color" value="${label.color}" />
            <input type="text" value="${label.name}" placeholder="Label name" />
            <input type="text" value="${label.shortcut}" placeholder="Key" style="width: 40px" />
            <button class="btn-remove" title="Remove">×</button>
        `;

        row.querySelector('.btn-remove').addEventListener('click', () => row.remove());
        container.appendChild(row);
    }

    addLabelConfigItem() {
        const list = document.getElementById('label-config-list');
        const newId = this.labelManager.labels.length;
        const newLabel = {
            id: newId,
            name: 'new_label',
            color: '#888888',
            shortcut: ''
        };
        this.addLabelConfigRow(list, newLabel, newId);
    }

    async saveLabelConfig() {
        const rows = document.querySelectorAll('#label-config-list .label-config-item');
        const labels = [];

        rows.forEach((row, index) => {
            const color = row.querySelector('input[type="color"]').value;
            const name = row.querySelectorAll('input[type="text"]')[0].value.trim();
            const shortcut = row.querySelectorAll('input[type="text"]')[1].value.trim();

            if (name) {
                labels.push({ id: index, name, color, shortcut });
            }
        });

        this.labelManager.labels = labels;
        await this.labelManager.saveConfig();

        this.viewer.setLabelColors(labels);
        this.buildLabelButtons();
        this.updateColors();

        this.hideLabelConfigModal();
    }

    hideLabelConfigModal() {
        document.getElementById('label-config-modal').classList.add('hidden');
    }

    async loadConfigFromFile() {
        // Use File System Access API to pick a YAML file
        if (!('showOpenFilePicker' in window)) {
            alert('File picker not supported in this browser. Please use Chrome or Edge.');
            return;
        }

        try {
            const [fileHandle] = await window.showOpenFilePicker({
                types: [{
                    description: 'YAML files',
                    accept: { 'text/yaml': ['.yaml', '.yml'] }
                }]
            });

            const file = await fileHandle.getFile();
            const content = await file.text();

            // Parse YAML on client side (simple approach - just send to server)
            // For now, we'll use a simple approach: reload via server or parse locally
            try {
                // Send to server to parse and store
                const response = await fetch('/api/config/labels/load', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content, filename: file.name })
                });

                if (response.ok) {
                    await this.labelManager.loadConfig();
                    this.buildLabelButtons();
                    this.updateColors();
                    this.updateConfigName(file.name);
                } else {
                    const error = await response.json();
                    alert('Failed to load config: ' + (error.error || 'Unknown error'));
                }
            } catch (err) {
                alert('Failed to parse config file: ' + err.message);
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Failed to open file:', err);
            }
        }
    }

    createNewConfig() {
        // Reset to default labels
        this.labelManager.labels = this.labelManager.getDefaultLabels();
        this.buildLabelButtons();
        this.updateColors();
        this.updateConfigName('new (unsaved)');

        // Open the edit modal to customize
        this.showLabelConfigModal();
    }

    async saveConfigAsFile() {
        if (!('showSaveFilePicker' in window)) {
            alert('File picker not supported in this browser. Please use Chrome or Edge.');
            return;
        }

        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: 'labels.yaml',
                types: [{
                    description: 'YAML files',
                    accept: { 'text/yaml': ['.yaml', '.yml'] }
                }]
            });

            // Convert labels to YAML format
            const yamlContent = this.labelsToYaml(this.labelManager.labels);

            const writable = await handle.createWritable();
            await writable.write(yamlContent);
            await writable.close();

            this.updateConfigName(handle.name);
            alert('Config saved successfully!');
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Failed to save file:', err);
                alert('Failed to save config: ' + err.message);
            }
        }
    }

    labelsToYaml(labels) {
        // Simple YAML serialization
        let yaml = '# Point Cloud Labeling Tool - Label Configuration\n\nlabels:\n';
        labels.forEach(label => {
            yaml += `  - id: ${label.id}\n`;
            yaml += `    name: ${label.name}\n`;
            yaml += `    color: "${label.color}"\n`;
            if (label.shortcut) {
                yaml += `    shortcut: "${label.shortcut}"\n`;
            }
            yaml += '\n';
        });
        return yaml;
    }

    updateConfigName(name) {
        document.getElementById('current-config-name').textContent = name.replace(/\.(yaml|yml)$/i, '');
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
