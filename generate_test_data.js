/**
 * Generate synthetic PCD files for testing
 * Run with: node generate_test_data.js
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'sample_data');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Generate a PCD file with random points
 */
function generatePCD(filename, pointCount, options = {}) {
    const {
        xRange = [-50, 50],
        yRange = [-50, 50],
        zRange = [0, 10],
        hasIntensity = true
    } = options;

    const points = [];

    for (let i = 0; i < pointCount; i++) {
        const x = xRange[0] + Math.random() * (xRange[1] - xRange[0]);
        const y = yRange[0] + Math.random() * (yRange[1] - yRange[0]);
        const z = zRange[0] + Math.random() * (zRange[1] - zRange[0]);
        const intensity = hasIntensity ? Math.random() : 0;

        points.push({ x, y, z, intensity });
    }

    writePCD(path.join(OUTPUT_DIR, filename), points, hasIntensity);
    console.log(`Generated ${filename} with ${pointCount} points`);
}

/**
 * Generate a scene with ground plane, buildings, and vegetation
 */
function generateScene(filename, options = {}) {
    const points = [];

    // Ground plane (dense)
    for (let i = 0; i < 5000; i++) {
        const x = -50 + Math.random() * 100;
        const y = -50 + Math.random() * 100;
        const z = (Math.random() - 0.5) * 0.3; // Slight variation
        const intensity = 0.3 + Math.random() * 0.2;
        points.push({ x, y, z, intensity });
    }

    // Buildings (several boxes)
    const buildings = [
        { cx: 15, cy: 20, width: 10, depth: 15, height: 8 },
        { cx: -20, cy: -10, width: 8, depth: 8, height: 12 },
        { cx: 30, cy: -25, width: 12, depth: 10, height: 6 },
    ];

    buildings.forEach(b => {
        // Walls
        for (let i = 0; i < 800; i++) {
            const side = Math.floor(Math.random() * 4);
            let x, y, z;
            z = Math.random() * b.height;

            if (side === 0) {
                x = b.cx - b.width / 2;
                y = b.cy - b.depth / 2 + Math.random() * b.depth;
            } else if (side === 1) {
                x = b.cx + b.width / 2;
                y = b.cy - b.depth / 2 + Math.random() * b.depth;
            } else if (side === 2) {
                x = b.cx - b.width / 2 + Math.random() * b.width;
                y = b.cy - b.depth / 2;
            } else {
                x = b.cx - b.width / 2 + Math.random() * b.width;
                y = b.cy + b.depth / 2;
            }

            points.push({ x, y, z, intensity: 0.7 + Math.random() * 0.3 });
        }

        // Roof
        for (let i = 0; i < 200; i++) {
            const x = b.cx - b.width / 2 + Math.random() * b.width;
            const y = b.cy - b.depth / 2 + Math.random() * b.depth;
            const z = b.height;
            points.push({ x, y, z, intensity: 0.8 + Math.random() * 0.2 });
        }
    });

    // Trees (conical clusters)
    const trees = [
        { cx: -35, cy: 30, radius: 3, height: 6 },
        { cx: -30, cy: 35, radius: 2.5, height: 5 },
        { cx: 40, cy: 15, radius: 4, height: 7 },
        { cx: 5, cy: -40, radius: 3, height: 5 },
        { cx: -10, cy: 25, radius: 2, height: 4 },
    ];

    trees.forEach(t => {
        for (let i = 0; i < 500; i++) {
            const z = 0.5 + Math.random() * t.height;
            const radiusAtZ = t.radius * (1 - z / t.height);
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * radiusAtZ;

            const x = t.cx + Math.cos(angle) * r;
            const y = t.cy + Math.sin(angle) * r;

            points.push({ x, y, z, intensity: 0.4 + Math.random() * 0.3 });
        }
    });

    // Vehicles (boxes on ground)
    const vehicles = [
        { cx: 0, cy: 5, width: 4, depth: 2, height: 1.5 },
        { cx: -8, cy: -3, width: 5, depth: 2, height: 2 },
    ];

    vehicles.forEach(v => {
        for (let i = 0; i < 150; i++) {
            const x = v.cx - v.width / 2 + Math.random() * v.width;
            const y = v.cy - v.depth / 2 + Math.random() * v.depth;
            const z = Math.random() * v.height;
            points.push({ x, y, z, intensity: 0.5 + Math.random() * 0.3 });
        }
    });

    // Pedestrians (small clusters)
    const pedestrians = [
        { cx: 10, cy: 0 },
        { cx: 12, cy: 2 },
        { cx: -15, cy: 10 },
    ];

    pedestrians.forEach(p => {
        for (let i = 0; i < 30; i++) {
            const x = p.cx + (Math.random() - 0.5) * 0.5;
            const y = p.cy + (Math.random() - 0.5) * 0.5;
            const z = Math.random() * 1.8;
            points.push({ x, y, z, intensity: 0.6 + Math.random() * 0.2 });
        }
    });

    writePCD(path.join(OUTPUT_DIR, filename), points, true);
    console.log(`Generated ${filename} with ${points.length} points`);
}

/**
 * Write points to PCD file (ASCII format)
 */
function writePCD(filepath, points, hasIntensity) {
    const fields = hasIntensity ? 'x y z intensity' : 'x y z';
    const size = hasIntensity ? '4 4 4 4' : '4 4 4';
    const type = hasIntensity ? 'F F F F' : 'F F F';
    const count = hasIntensity ? '1 1 1 1' : '1 1 1';

    let header = `# .PCD v0.7 - Point Cloud Data file format
VERSION 0.7
FIELDS ${fields}
SIZE ${size}
TYPE ${type}
COUNT ${count}
WIDTH ${points.length}
HEIGHT 1
VIEWPOINT 0 0 0 1 0 0 0
POINTS ${points.length}
DATA ascii
`;

    const data = points.map(p => {
        if (hasIntensity) {
            return `${p.x.toFixed(4)} ${p.y.toFixed(4)} ${p.z.toFixed(4)} ${p.intensity.toFixed(4)}`;
        }
        return `${p.x.toFixed(4)} ${p.y.toFixed(4)} ${p.z.toFixed(4)}`;
    }).join('\n');

    fs.writeFileSync(filepath, header + data);
}

// Generate test files
console.log('\nGenerating synthetic point cloud test data...\n');

// Simple random point clouds
generatePCD('random_small.pcd', 1000);
generatePCD('random_medium.pcd', 10000);
generatePCD('random_large.pcd', 50000);

// Structured scenes
generateScene('urban_scene_1.pcd');
generateScene('urban_scene_2.pcd');
generateScene('urban_scene_3.pcd');

console.log(`\nDone! Test files created in ${OUTPUT_DIR}`);
