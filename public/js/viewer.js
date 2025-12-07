/**
 * PointCloudViewer - Three.js scene management and point cloud rendering
 * Uses native C++ parser for PCD file loading via server API
 */
class PointCloudViewer {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.points = null;
        this.positions = null;
        this.fieldData = null; // All field data from native parser
        this.colorizer = new Colorizer();

        this.init();
        this.animate();
    }

    init() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a1a);

        // Camera
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 10000);
        this.camera.position.set(0, 0, 50);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // TrackballControls - allows free rotation in any direction
        // Default: Left = rotate, Middle = zoom, Right = pan
        this.controls = new THREE.TrackballControls(this.camera, this.renderer.domElement);
        this.controls.rotateSpeed = 2.0;
        this.controls.zoomSpeed = 1.2;
        this.controls.panSpeed = 0.8;
        this.controls.staticMoving = false;
        this.controls.dynamicDampingFactor = 0.15;

        // Grid helper
        this.gridHelper = new THREE.GridHelper(100, 100, 0x333333, 0x222222);
        this.gridHelper.rotation.x = Math.PI / 2;
        this.scene.add(this.gridHelper);

        // Axes helper
        const axesHelper = new THREE.AxesHelper(5);
        this.scene.add(axesHelper);

        // Handle resize
        window.addEventListener('resize', () => this.onWindowResize());
    }

    onWindowResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Load point cloud data from native parser API
     * @param {object} data - Parsed PCD data from server
     * @returns {object} - { pointCount, labels, fieldNames }
     */
    loadFromData(data) {
        // Remove existing points
        if (this.points) {
            this.scene.remove(this.points);
            this.points.geometry.dispose();
            this.points.material.dispose();
        }

        // Store positions and field data
        this.positions = new Float32Array(data.positions);
        this.fieldData = data.fields || {};

        // Create geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

        // Add color attribute
        const pointCount = this.positions.length / 3;
        const colors = new Float32Array(pointCount * 3);
        for (let i = 0; i < colors.length; i++) {
            colors[i] = 0.5;
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // Create point material
        const material = new THREE.PointsMaterial({
            size: 0.5,
            vertexColors: true,
            sizeAttenuation: true
        });

        // Create points mesh
        this.points = new THREE.Points(geometry, material);
        this.scene.add(this.points);

        // Set field data in colorizer for dynamic colorization
        this.colorizer.setFieldData(this.fieldData);

        // Center camera on point cloud
        this.fitCameraToPoints();

        // Return metadata
        return {
            pointCount,
            labels: data.labels ? new Uint32Array(data.labels) : null,
            fieldNames: data.header?.fieldNames || Object.keys(this.fieldData)
        };
    }

    fitCameraToPoints() {
        if (!this.points) return;

        const box = new THREE.Box3().setFromObject(this.points);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.5;

        this.camera.position.set(center.x, center.y - maxDim, center.z + cameraZ / 2);
        this.controls.target.copy(center);
        this.controls.update();
    }

    resetView() {
        this.fitCameraToPoints();
    }

    getPositions() {
        return this.positions;
    }

    getPointCount() {
        return this.positions ? this.positions.length / 3 : 0;
    }

    updateColors(labels, selectedIndices) {
        if (!this.points) return;

        const colors = this.colorizer.colorize(
            this.positions,
            labels,
            selectedIndices
        );

        this.points.geometry.attributes.color.array.set(colors);
        this.points.geometry.attributes.color.needsUpdate = true;
    }

    setColorMode(mode) {
        this.colorizer.setMode(mode);
    }

    setLabelColors(labelDefinitions) {
        this.colorizer.setLabelColors(labelDefinitions);
    }

    setPointSize(size) {
        if (this.points && this.points.material) {
            this.points.material.size = size;
        }
    }

    enableControls(enabled) {
        this.controls.enabled = enabled;
    }

    /**
     * Set whether to invert the camera view direction
     * @param {boolean} inverted - true to view from opposite side
     */
    setInvertView(inverted) {
        if (!this.points) return;

        // Calculate bounding box to position camera appropriately
        const geometry = this.points.geometry;
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;
        const center = new THREE.Vector3();
        bbox.getCenter(center);

        const size = new THREE.Vector3();
        bbox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const distance = maxDim * 2;

        // Reset controls target to center
        this.controls.target.copy(center);

        // Y-up for consistent orbit behavior
        this.camera.up.set(0, 1, 0);

        // Isometric view - from opposite corner when inverted
        const sign = inverted ? -1 : 1;
        this.camera.position.set(
            center.x + sign * distance * 0.7,
            center.y + distance * 0.7,
            center.z + sign * distance * 0.7
        );

        this.camera.lookAt(center);
        this.controls.update();
    }
}

window.PointCloudViewer = PointCloudViewer;
