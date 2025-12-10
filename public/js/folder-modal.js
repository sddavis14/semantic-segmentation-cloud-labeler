// FolderModal - Handles folder browser modal UI
// Extracted from App class for better separation of concerns

class FolderModal {
    constructor() {
        this.currentBrowsePath = '';
        this.lastBrowsePath = '';
        this.selectedBrowsePath = null;
        this.folderListData = [];
        this.focusedFolderIndex = -1;
        this.recentFolders = [];

        // Callback when user confirms folder selection
        this.onFolderSelected = null;

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Folder path input
        document.getElementById('folder-path-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const path = e.target.value.trim();
                if (path) this.browseTo(path);
            }
            if (e.key === 'Escape') this.hide();
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

        // Modal buttons
        document.getElementById('btn-folder-open').addEventListener('click', () => this.confirmSelection());
        document.getElementById('btn-folder-cancel').addEventListener('click', () => this.hide());
        document.getElementById('btn-folder-close').addEventListener('click', () => this.hide());
    }

    async show() {
        document.getElementById('folder-modal').classList.remove('hidden');
        const startPath = this.lastBrowsePath || '';
        await this.browseTo(startPath);
    }

    hide() {
        document.getElementById('folder-modal').classList.add('hidden');
    }

    confirmSelection() {
        if (this.onFolderSelected && this.selectedBrowsePath) {
            this.onFolderSelected(this.selectedBrowsePath);
        }
        this.hide();
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
            this.folderListData = data.directories;
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
                info.textContent = `📁 ${data.pcdCount} .pcd file(s) found`;
                info.style.color = 'var(--success)';
                this.selectedBrowsePath = data.current;
            } else {
                info.textContent = 'No .pcd files found. Subfolders are scanned automatically.';
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
                <span class="folder-icon">📁</span>
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
}

window.FolderModal = FolderModal;
