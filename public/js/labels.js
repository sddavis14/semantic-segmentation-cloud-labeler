/**
 * LabelManager - Handles label definitions and per-point labels
 */
class LabelManager {
    constructor() {
        this.labels = [];
        this.pointLabels = null;
        this.pointCount = 0;
        this.dirty = false;
        this.onLabelsChanged = null;
    }

    async loadConfig() {
        try {
            const response = await fetch('/api/config/labels');
            const config = await response.json();
            this.labels = config.labels || [];
        } catch (err) {
            console.error('Failed to load label config:', err);
            this.labels = this.getDefaultLabels();
        }
    }

    async saveConfig() {
        try {
            await fetch('/api/config/labels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ labels: this.labels })
            });
        } catch (err) {
            console.error('Failed to save label config:', err);
        }
    }

    getDefaultLabels() {
        return [
            { id: 0, name: 'unlabeled', color: '#808080', shortcut: '0' },
            { id: 1, name: 'ground', color: '#8B4513', shortcut: '1' },
            { id: 2, name: 'vegetation', color: '#228B22', shortcut: '2' },
            { id: 3, name: 'building', color: '#4169E1', shortcut: '3' },
            { id: 4, name: 'vehicle', color: '#DC143C', shortcut: '4' },
            { id: 5, name: 'pedestrian', color: '#FFD700', shortcut: '5' },
            { id: 6, name: 'pole', color: '#FF69B4', shortcut: '6' },
            { id: 7, name: 'road', color: '#2F4F4F', shortcut: '7' },
            { id: 8, name: 'other', color: '#9932CC', shortcut: '8' }
        ];
    }

    initForPointCloud(numPoints) {
        this.pointCount = numPoints;
        this.pointLabels = new Uint8Array(numPoints);
        this.dirty = false;
    }

    setPointLabels(labels) {
        if (labels && labels.length === this.pointCount) {
            this.pointLabels = new Uint8Array(labels);
        }
    }

    getPointLabels() {
        return this.pointLabels;
    }

    getLabelById(id) {
        return this.labels.find(l => l.id === id);
    }

    getLabelByShortcut(key) {
        return this.labels.find(l => l.shortcut === key);
    }

    /**
     * Assign label to selected points
     * @param {Set<number>} selectedIndices - Set of point indices
     * @param {number} labelId - Label ID to assign
     */
    assignLabel(selectedIndices, labelId) {
        if (!selectedIndices || selectedIndices.size === 0) return;

        // Apply new labels
        selectedIndices.forEach(idx => {
            this.pointLabels[idx] = labelId;
        });

        this.dirty = true;
        if (this.onLabelsChanged) {
            this.onLabelsChanged();
        }
    }

    isDirty() {
        return this.dirty;
    }

    markClean() {
        this.dirty = false;
    }
}

window.LabelManager = LabelManager;
