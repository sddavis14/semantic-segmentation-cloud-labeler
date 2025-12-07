/**
 * SelectionManager - Handles box and lasso selection of points
 */
class SelectionManager {
    constructor(viewer) {
        this.viewer = viewer;
        this.mode = 'box'; // 'box' or 'lasso'
        this.selectedIndices = new Set();
        this.isSelecting = false;
        this.startPoint = null;
        this.lassoPoints = [];

        this.overlay = document.getElementById('selection-overlay');
        this.ctx = this.overlay.getContext('2d');

        this.onSelectionChanged = null;

        this.resizeOverlay();
        window.addEventListener('resize', () => this.resizeOverlay());
    }

    resizeOverlay() {
        this.overlay.width = window.innerWidth;
        this.overlay.height = window.innerHeight;
    }

    setMode(mode) {
        this.mode = mode;
        this.cancelSelection();
    }

    getMode() {
        return this.mode;
    }

    startSelection(x, y) {
        this.isSelecting = true;
        this.startPoint = { x, y };
        this.lassoPoints = [{ x, y }];
    }

    updateSelection(x, y) {
        if (!this.isSelecting) return;

        this.clearOverlay();

        if (this.mode === 'box') {
            this.drawBox(this.startPoint, { x, y });
        } else if (this.mode === 'lasso') {
            this.lassoPoints.push({ x, y });
            this.drawLasso(this.lassoPoints);
        }
    }

    endSelection(x, y) {
        if (!this.isSelecting) return;
        this.isSelecting = false;

        let polygon;
        if (this.mode === 'box') {
            polygon = this.boxToPolygon(this.startPoint, { x, y });
        } else {
            polygon = this.lassoPoints;
        }

        this.clearOverlay();

        // Find points inside the polygon
        const newSelection = this.selectPointsInPolygon(polygon);

        // Toggle selection: deselect if already selected, select if not
        newSelection.forEach(idx => {
            if (this.selectedIndices.has(idx)) {
                this.selectedIndices.delete(idx); // Deselect
            } else {
                this.selectedIndices.add(idx); // Select
            }
        });

        if (this.onSelectionChanged) {
            this.onSelectionChanged(this.selectedIndices);
        }
    }

    cancelSelection() {
        this.isSelecting = false;
        this.clearOverlay();
        this.lassoPoints = [];
    }

    clearSelection() {
        this.selectedIndices.clear();
        if (this.onSelectionChanged) {
            this.onSelectionChanged(this.selectedIndices);
        }
    }

    getSelectedIndices() {
        return this.selectedIndices;
    }

    getSelectedCount() {
        return this.selectedIndices.size;
    }

    clearOverlay() {
        this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    }

    drawBox(start, end) {
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const w = Math.abs(end.x - start.x);
        const h = Math.abs(end.y - start.y);

        this.ctx.strokeStyle = '#e94560';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.strokeRect(x, y, w, h);

        this.ctx.fillStyle = 'rgba(233, 69, 96, 0.1)';
        this.ctx.fillRect(x, y, w, h);
    }

    drawLasso(points) {
        if (points.length < 2) return;

        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            this.ctx.lineTo(points[i].x, points[i].y);
        }
        this.ctx.closePath();

        this.ctx.strokeStyle = '#e94560';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.stroke();

        this.ctx.fillStyle = 'rgba(233, 69, 96, 0.1)';
        this.ctx.fill();
    }

    boxToPolygon(start, end) {
        return [
            { x: start.x, y: start.y },
            { x: end.x, y: start.y },
            { x: end.x, y: end.y },
            { x: start.x, y: end.y }
        ];
    }

    /**
     * Find all points whose screen projection falls inside the polygon
     */
    selectPointsInPolygon(polygon) {
        const selected = new Set();

        if (!this.viewer.points || polygon.length < 3) {
            return selected;
        }

        const positions = this.viewer.getPositions();
        if (!positions) return selected;

        const pointCount = positions.length / 3;
        const camera = this.viewer.camera;
        const tempVec = new THREE.Vector3();

        // Get viewport bounds
        const viewport = this.viewer.renderer.domElement;
        const rect = viewport.getBoundingClientRect();

        for (let i = 0; i < pointCount; i++) {
            tempVec.set(
                positions[i * 3],
                positions[i * 3 + 1],
                positions[i * 3 + 2]
            );

            // Project to screen coordinates
            tempVec.project(camera);

            // Check if point is behind camera
            if (tempVec.z > 1) continue;

            // Convert to screen coordinates
            const screenX = (tempVec.x * 0.5 + 0.5) * rect.width + rect.left;
            const screenY = (-tempVec.y * 0.5 + 0.5) * rect.height + rect.top;

            if (this.pointInPolygon(screenX, screenY, polygon)) {
                selected.add(i);
            }
        }

        return selected;
    }

    /**
     * Ray casting algorithm for point-in-polygon test
     */
    pointInPolygon(x, y, polygon) {
        let inside = false;
        const n = polygon.length;

        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;

            if (((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }

        return inside;
    }
}

window.SelectionManager = SelectionManager;
