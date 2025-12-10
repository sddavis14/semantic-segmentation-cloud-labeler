/**
 * Point Cloud Labeling Tool - Main Application
 */
class App {
    constructor() {
        this.viewer = null;
        this.labelManager = new LabelManager();
        this.selectionManager = null;
        this.fileBrowser = new FileBrowser();
        this.folderModal = new FolderModal();
        this.activeLabel = 0;
        this.lastSelectionCount = 0;
        this.currentFormat = '';

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
        // Note: fileBrowser.onFileChanged is intentionally not used - navigation is handled
        // directly via nextFile/previousFile/loadFile to ensure proper dirty state checking
        this.labelManager.onLabelsChanged = () => this.onLabelsChanged();
        this.selectionManager.onSelectionChanged = () => this.onSelectionChanged();
        this.folderModal.onFolderSelected = (path) => this.openFolderPath(path);

        // Check for startup config (initial directory from CLI)
        await this.checkStartupConfig();
    }

    async checkStartupConfig() {
        try {
            console.log('Checking startup config...');
            const response = await fetch('/api/config/startup');
            const config = await response.json();
            console.log('Startup config:', config);

            if (config.initialDirectory) {
                // Auto-open the initial directory
                console.log('Loading directory:', config.initialDirectory);
                const count = await this.fileBrowser.loadDirectory(config.initialDirectory);
                console.log('Loaded files:', count);
                if (count > 0) {
                    await this.buildFileTree(config.initialDirectory);
                    await this.loadFirstFile();
                }
            }
        } catch (err) {
            console.error('Startup config error:', err);
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
        // Open folder - delegate to FolderModal
        document.getElementById('btn-open').addEventListener('click', () => this.folderModal.show());

        // Note: folder modal internal events (cancel, close, path input, filter, keyboard)
        // are now handled by FolderModal.setupEventListeners()

        // Save
        document.getElementById('btn-save').addEventListener('click', () => this.saveLabels());

        // Reset (discard changes and reload)
        document.getElementById('btn-reset').addEventListener('click', () => this.resetCurrentFile());

        // Navigation
        document.getElementById('btn-prev').addEventListener('click', () => this.previousFile());
        document.getElementById('btn-next').addEventListener('click', () => this.nextFile());

        // Selection tools
        document.getElementById('btn-box-select').addEventListener('click', () => this.setSelectionMode('box'));
        document.getElementById('btn-lasso-select').addEventListener('click', () => this.setSelectionMode('lasso'));

        // Colorization
        document.getElementById('colorize-mode').addEventListener('change', (e) => {
            this.viewer.setColorMode(e.target.value);
            this.updateColorBoundsControls();
            this.updateColors();
        });

        // Color bounds sliders
        document.getElementById('color-min').addEventListener('input', (e) => {
            this.onColorBoundsChange();
        });
        document.getElementById('color-max').addEventListener('input', (e) => {
            this.onColorBoundsChange();
        });
        document.getElementById('btn-reset-bounds').addEventListener('click', () => {
            this.resetColorBounds();
        });

        // Point size slider with logarithmic scaling
        // Slider: 0-1 linear -> Point size: 0.001-1.0 logarithmic
        const sliderToPointSize = (sliderVal) => {
            // Map 0-1 to 0.001-1.0 logarithmically
            const minSize = 0.001;
            const maxSize = 1.0;
            return minSize * Math.pow(maxSize / minSize, sliderVal);
        };

        document.getElementById('point-size').addEventListener('input', (e) => {
            const sliderVal = parseFloat(e.target.value);
            const size = sliderToPointSize(sliderVal);
            document.getElementById('point-size-value').textContent = size.toFixed(3);
            this.viewer.setPointSize(size);
        });

        // Store conversion function for use elsewhere
        this.sliderToPointSize = sliderToPointSize;

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

            // Clear selection / close shortcuts
            if (key === 'escape') {
                const shortcutsOverlay = document.getElementById('shortcuts-overlay');
                if (!shortcutsOverlay.classList.contains('hidden')) {
                    shortcutsOverlay.classList.add('hidden');
                    return;
                }
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

            // Show keyboard shortcuts (? or h for help)
            if (e.key === '?' || key === 'h') {
                this.toggleShortcutsOverlay();
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

            // Auto-apply active label if there's a selection and an active label
            const selectedIndices = this.selectionManager.getSelectedIndices();
            if (selectedIndices.size > 0 && this.activeLabel !== null && this.activeLabel !== undefined) {
                this.assignLabelToSelection(this.activeLabel);
            }
        });

        // Prevent context menu on viewport
        viewportElement.addEventListener('contextmenu', (e) => {
            // Allow right-click for orbit controls
        });
    }

    // Called when user selects a folder from FolderModal
    async openFolderPath(dirPath) {
        if (!dirPath) {
            alert('Please select a folder');
            return;
        }

        // Check for unsaved changes before switching folders
        if (!this.confirmDiscardChanges()) {
            return;
        }

        try {
            const count = await this.fileBrowser.loadDirectory(dirPath);

            if (count > 0) {
                await this.buildFileTree(dirPath);
                await this.loadFirstFile();
            } else {
                alert('No .pcd files found in the directory');
            }
        } catch (err) {
            alert(`Failed to open folder: ${err.message}`);
        }
    }

    // Load first file in directory (for initial/folder change)
    async loadFirstFile() {
        if (this.fileBrowser.files.length === 0) return;

        const firstFile = this.fileBrowser.files[0];
        const success = await this.loadFileInternal(firstFile);
        if (success) {
            this.fileBrowser.currentIndex = 0;
            this.updateFileTreeSelection();
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
                <span class="tree-file-dirty" title="Unsaved changes">●</span>
            `;
            fileNode.addEventListener('click', async () => {
                // Load file via server API
                const targetFile = this.fileBrowser.files[index];
                const success = await this.loadFile(targetFile);
                if (success !== false) {
                    // Only update index and selection if load succeeded
                    this.fileBrowser.currentIndex = index;
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

    // Check if user confirms discarding unsaved changes
    // Returns true if no changes or user confirmed, false if user cancelled
    confirmDiscardChanges() {
        if (!this.labelManager.isDirty()) {
            return true;
        }
        if (confirm('You have unsaved label changes that will be DISCARDED.\n\nContinue without saving?')) {
            this.clearDirtyIndicator();
            this.labelManager.markClean();
            return true;
        }
        return false;
    }

    async loadFile(file) {
        if (!file) return false;

        // Check for unsaved changes
        if (!this.confirmDiscardChanges()) {
            return false; // User cancelled
        }

        return await this.loadFileInternal(file);
    }

    // Internal file loading - assumes dirty check already done
    async loadFileInternal(file) {
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

            // Apply current point size from slider
            const sliderVal = parseFloat(document.getElementById('point-size').value);
            const currentPointSize = this.sliderToPointSize(sliderVal);
            this.viewer.setPointSize(currentPointSize);

            // Update UI
            this.updateStatusBar();
            this.updateFileProgress();
            this.updateFileTreeSelection();

            // Update format badge from the parse response header
            this.currentFormat = data.header.dataType || '';
            this.updatePCDFormatLabel();

            console.log(`Loaded ${file.name} with ${result.pointCount} points using native parser`);
            return true;
        } catch (err) {
            console.error('Failed to load file:', err);
            alert(`Failed to load file: ${err.message}`);
            return false;
        }
    }

    async previousFile() {
        if (!this.fileBrowser.hasPrevious()) return;

        // Check dirty BEFORE updating index
        if (!this.confirmDiscardChanges()) {
            return; // User cancelled - index unchanged
        }

        // Now safe to navigate
        const prevIndex = this.fileBrowser.currentIndex - 1;
        const prevFile = this.fileBrowser.files[prevIndex];
        const success = await this.loadFileInternal(prevFile);
        if (success) {
            this.fileBrowser.currentIndex = prevIndex;
            this.updateFileTreeSelection();
        }
    }

    async nextFile() {
        if (!this.fileBrowser.hasNext()) return;

        // Check dirty BEFORE updating index
        if (!this.confirmDiscardChanges()) {
            return; // User cancelled - index unchanged
        }

        // Now safe to navigate
        const nextIndex = this.fileBrowser.currentIndex + 1;
        const nextFile = this.fileBrowser.files[nextIndex];
        const success = await this.loadFileInternal(nextFile);
        if (success) {
            this.fileBrowser.currentIndex = nextIndex;
            this.updateFileTreeSelection();
        }
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
            // Get selected format from dropdown
            const format = document.getElementById('save-format').value;

            // Use native parser API to update labels in PCD file  
            const response = await fetch('/api/pcd/update-labels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pcdPath: filePath,
                    labels: Array.from(this.labelManager.pointLabels),
                    format: format  // '' = auto (preserve original), or 'ascii'/'binary'/'binary_compressed'
                })
            });

            const result = await response.json();
            if (result.success) {
                this.labelManager.markClean();
                this.clearDirtyIndicator();
                this.updateStatusBar();

                // Update format if a specific format was selected
                if (format) {
                    this.currentFormat = format;
                }
                this.updatePCDFormatLabel();

                const fileName = filePath.split('/').pop();
                this.showNotification(`Labels saved to ${fileName}`, 'success');
            } else {
                alert('Failed to save labels: ' + (result.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Failed to save labels:', err);
            alert('Failed to save labels: ' + err.message);
        }
    }

    async resetCurrentFile() {
        const currentFile = this.fileBrowser.getCurrentFile();
        if (!currentFile) {
            alert('No file loaded');
            return;
        }

        // Confirm reset
        if (this.labelManager.isDirty()) {
            if (!confirm('Discard all unsaved changes and reload from file?')) {
                return;
            }
        }

        // Clear dirty state first
        this.clearDirtyIndicator();
        this.labelManager.markClean();
        this.selectionManager.clearSelection();

        // Reload the file
        try {
            const response = await fetch(`/api/pcd/parse?path=${encodeURIComponent(currentFile.path)}`);
            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            // Load data into viewer
            const result = this.viewer.loadFromData(data);

            // Initialize labels
            this.labelManager.initForPointCloud(result.pointCount);

            // Apply embedded labels from PCD if present
            if (data.labels && data.labels.length > 0) {
                this.labelManager.setPointLabels(data.labels);
            }

            this.updateColors();

            // Apply current point size from slider
            const sliderVal = parseFloat(document.getElementById('point-size').value);
            const currentPointSize = this.sliderToPointSize(sliderVal);
            this.viewer.setPointSize(currentPointSize);

            this.updateStatusBar();
            this.showNotification('File reloaded - changes discarded', 'info');
        } catch (err) {
            console.error('Failed to reload file:', err);
            alert('Failed to reload file: ' + err.message);
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

    updatePCDFormatLabel() {
        const formatBadge = document.getElementById('pcd-format-badge');

        if (!formatBadge) return;

        if (this.currentFormat) {
            formatBadge.textContent = this.currentFormat.toUpperCase();
            formatBadge.classList.remove('hidden');
        } else {
            formatBadge.classList.add('hidden');
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

    onLabelsChanged() {
        this.updateColors();
        this.updateStatusBar();
        this.updateDirtyIndicator();
    }

    updateDirtyIndicator(forceShow = false) {
        const currentFile = this.fileBrowser.getCurrentFile();
        if (!currentFile) return;

        const currentPath = currentFile.path || currentFile.name;
        const isDirty = forceShow || this.labelManager.isDirty();

        // Find the file node in the tree
        const fileNodes = document.querySelectorAll('.tree-file');
        fileNodes.forEach(node => {
            if (node.dataset.path === currentPath) {
                node.classList.toggle('dirty', isDirty);
            }
        });
    }

    clearDirtyIndicator() {
        const currentFile = this.fileBrowser.getCurrentFile();
        if (!currentFile) return;

        const currentPath = currentFile.path || currentFile.name;
        const fileNodes = document.querySelectorAll('.tree-file');
        fileNodes.forEach(node => {
            if (node.dataset.path === currentPath) {
                node.classList.remove('dirty');
            }
        });
    }

    onSelectionChanged() {
        // Track the last selection count for display (before it gets cleared)
        const currentCount = this.selectionManager.getSelectedCount();
        if (currentCount > 0) {
            this.lastSelectionCount = currentCount;
        }

        this.updateColors();
        this.updateStatusBar();

        // Show dirty indicator if there are active selections (pending changes)
        const hasSelection = this.selectionManager.getSelectedIndices().size > 0;
        if (hasSelection) {
            this.updateDirtyIndicator(true); // Force show indicator
        } else if (!this.labelManager.isDirty()) {
            this.clearDirtyIndicator();
        }
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

        // Check if synthetic _color field exists (C++ parser adds this for RGB data)
        const hasColorField = (fieldNames || []).includes('_color');

        // Add RGB Color option if _color field is available
        if (hasColorField) {
            const rgbOption = document.createElement('option');
            rgbOption.value = '_color';
            rgbOption.textContent = 'RGB Color';
            select.appendChild(rgbOption);
        }

        // Add field options (raw fields as scalars)
        if (fieldNames && fieldNames.length > 0) {
            for (const name of fieldNames) {
                const lower = name.toLowerCase();
                // Skip coordinates and label (not useful for colorization)
                // Skip synthetic _color field (already added as "RGB Color")
                if (['x', 'y', 'z', 'label', '_color'].includes(lower)) continue;

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

        // Apply the color mode and update controls
        this.viewer.setColorMode(select.value);
        this.updateColorBoundsControls();
    }

    cycleColorMode() {
        const select = document.getElementById('colorize-mode');
        const options = Array.from(select.options);
        const currentIndex = options.findIndex(opt => opt.selected);
        const nextIndex = (currentIndex + 1) % options.length;
        select.selectedIndex = nextIndex;

        this.viewer.setColorMode(select.value);
        this.updateColorBoundsControls();
        this.updateColors();
    }

    // Update color bounds controls visibility and values based on current mode
    updateColorBoundsControls() {
        const mode = document.getElementById('colorize-mode').value;
        const controlsDiv = document.getElementById('color-bounds-controls');

        // Show controls only for scalar fields (not label or synthetic _color)
        const isScalarField = mode !== 'label' && mode !== '_color';
        controlsDiv.style.display = isScalarField ? 'flex' : 'none';

        if (isScalarField) {
            // Get field bounds from colorizer
            const bounds = this.viewer.colorizer.fieldBounds[mode];
            if (bounds) {
                const minSlider = document.getElementById('color-min');
                const maxSlider = document.getElementById('color-max');

                // Set slider range to field bounds
                minSlider.min = bounds.min;
                minSlider.max = bounds.max;
                minSlider.step = (bounds.max - bounds.min) / 1000;
                minSlider.value = bounds.min;

                maxSlider.min = bounds.min;
                maxSlider.max = bounds.max;
                maxSlider.step = (bounds.max - bounds.min) / 1000;
                maxSlider.value = bounds.max;

                // Update display values
                document.getElementById('color-min-value').textContent = bounds.min.toFixed(2);
                document.getElementById('color-max-value').textContent = bounds.max.toFixed(2);
            }
        }
    }

    // Handle color bounds slider changes
    onColorBoundsChange() {
        const minSlider = document.getElementById('color-min');
        const maxSlider = document.getElementById('color-max');

        let minVal = parseFloat(minSlider.value);
        let maxVal = parseFloat(maxSlider.value);

        // Ensure min < max
        if (minVal >= maxVal) {
            minVal = maxVal - parseFloat(minSlider.step);
            minSlider.value = minVal;
        }

        // Update display values
        document.getElementById('color-min-value').textContent = minVal.toFixed(2);
        document.getElementById('color-max-value').textContent = maxVal.toFixed(2);

        // Apply custom bounds to colorizer
        this.viewer.colorizer.setCustomBounds(minVal, maxVal);
        this.updateColors();
    }

    // Reset color bounds to auto-detected values
    resetColorBounds() {
        this.viewer.colorizer.clearCustomBounds();
        this.updateColorBoundsControls();
        this.updateColors();
    }

    updateStatusBar() {
        const fileName = this.fileBrowser.getCurrentFileName() || 'No file loaded';
        const pointCount = this.viewer.getPointCount();
        const dirty = this.labelManager.isDirty() ? ' *' : '';

        document.getElementById('status-file').textContent = fileName + dirty;
        document.getElementById('status-points').textContent = `${pointCount.toLocaleString()} points`;
        document.getElementById('status-selection').textContent = `${this.lastSelectionCount.toLocaleString()} selected`;
    }

    updateFileProgress() {
        document.getElementById('file-progress').textContent = this.fileBrowser.getProgressString();
    }

    // Keyboard Shortcuts Overlay
    toggleShortcutsOverlay() {
        const overlay = document.getElementById('shortcuts-overlay');
        overlay.classList.toggle('hidden');
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
