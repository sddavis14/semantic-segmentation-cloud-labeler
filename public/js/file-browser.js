/**
 * FileBrowser - Handles file navigation within a directory
 */
class FileBrowser {
    constructor() {
        this.directory = null;
        this.files = [];
        this.tree = null; // Hierarchical structure of folders and files
        this.currentIndex = -1;
        this.onFileChanged = null;
    }

    async loadDirectory(dirPath) {
        try {
            const response = await fetch(`/api/files?dir=${encodeURIComponent(dirPath)}`);
            const result = await response.json();

            if (result.error) {
                throw new Error(result.error);
            }

            this.directory = result.directory;
            this.files = result.files;
            this.tree = result.tree || null; // Store tree if available
            this.currentIndex = -1;

            return this.files.length;
        } catch (err) {
            console.error('Failed to load directory:', err);
            throw err;
        }
    }

    getFileCount() {
        return this.files.length;
    }

    getCurrentIndex() {
        return this.currentIndex;
    }

    getCurrentFile() {
        if (this.currentIndex >= 0 && this.currentIndex < this.files.length) {
            return this.files[this.currentIndex];
        }
        return null;
    }

    getCurrentFilePath() {
        const file = this.getCurrentFile();
        return file ? file.path : null;
    }

    getCurrentFileName() {
        const file = this.getCurrentFile();
        return file ? file.name : null;
    }

    getProgressString() {
        if (this.files.length === 0) {
            return 'No files';
        }
        if (this.currentIndex < 0) {
            return `0 / ${this.files.length}`;
        }
        return `${this.currentIndex + 1} / ${this.files.length}`;
    }

    hasNext() {
        return this.currentIndex < this.files.length - 1;
    }

    hasPrevious() {
        return this.currentIndex > 0;
    }

    goToFirst() {
        if (this.files.length > 0) {
            this.currentIndex = 0;
            this._notifyChange();
            return true;
        }
        return false;
    }

    goToNext() {
        if (this.hasNext()) {
            this.currentIndex++;
            this._notifyChange();
            return true;
        }
        return false;
    }

    goToPrevious() {
        if (this.hasPrevious()) {
            this.currentIndex--;
            this._notifyChange();
            return true;
        }
        return false;
    }

    goToIndex(index) {
        if (index >= 0 && index < this.files.length) {
            this.currentIndex = index;
            this._notifyChange();
            return true;
        }
        return false;
    }

    _notifyChange() {
        if (this.onFileChanged) {
            this.onFileChanged(this.getCurrentFile());
        }
    }
}

window.FileBrowser = FileBrowser;
