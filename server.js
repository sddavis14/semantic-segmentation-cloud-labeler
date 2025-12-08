const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Parse CLI arguments for initial directory
const args = process.argv.slice(2);
let initialDirectory = null;
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) {
        initialDirectory = args[i + 1];
        // Expand ~
        if (initialDirectory.startsWith('~')) {
            initialDirectory = initialDirectory.replace(/^~/, process.env.HOME || '/');
        }
        initialDirectory = path.resolve(initialDirectory);
    }
}

// Import native C++ PCD parser
let pcdParser = null;
try {
    pcdParser = require('./build/Release/pcd_parser.node');
    console.log('✅ Native PCD parser loaded');
} catch (err) {
    console.warn('⚠️  Native PCD parser not available, cannot load point clouds', err.message);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static('public'));

// API: Get startup config (initial directory, etc.)
app.get('/api/config/startup', (req, res) => {
    res.json({
        initialDirectory: initialDirectory
    });
});

// API: Parse PCD file using native parser
app.get('/api/pcd/parse', (req, res) => {
    const filePath = req.query.path;

    if (!filePath) {
        return res.status(400).json({ error: 'Path required' });
    }

    const resolvedPath = path.resolve(filePath);

    if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    if (!pcdParser) {
        return res.status(500).json({ error: 'Native parser not available' });
    }

    try {
        const data = pcdParser.parse(resolvedPath);

        // Get field names from the fields object
        const fieldNames = data.fields ? Object.keys(data.fields) : [];

        // Convert fields to regular arrays for JSON serialization
        const fields = {};
        if (data.fields) {
            for (const [name, typedArray] of Object.entries(data.fields)) {
                fields[name] = Array.from(typedArray);
            }
        }

        res.json({
            header: {
                ...data.header,
                fieldNames: fieldNames
            },
            positions: Array.from(data.positions),
            labels: Array.from(data.labels),
            fields: fields,
            hasRGB: data.hasRGB || false,
            rgb: data.rgb ? Array.from(data.rgb) : null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Update labels in PCD file using native parser
app.post('/api/pcd/update-labels', (req, res) => {
    const { pcdPath, labels, format } = req.body;

    if (!pcdPath || !labels) {
        return res.status(400).json({ error: 'pcdPath and labels required' });
    }

    const resolvedPath = path.resolve(pcdPath);

    if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    if (!pcdParser) {
        return res.status(500).json({ error: 'Native parser not available' });
    }

    try {
        const labelsArray = new Uint32Array(labels);
        // Use format-aware save if format specified, otherwise auto-detect
        if (format && format !== '') {
            pcdParser.updateLabelsWithFormat(resolvedPath, labelsArray, format);
        } else {
            pcdParser.updateLabels(resolvedPath, labelsArray);
        }
        res.json({ success: true, format: format || 'auto' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Convert PCD file format (ASCII <-> Binary)
app.post('/api/pcd/convert-format', (req, res) => {
    const { pcdPath, targetFormat } = req.body;

    if (!pcdPath || !targetFormat) {
        return res.status(400).json({ error: 'pcdPath and targetFormat required' });
    }

    if (!['ascii', 'binary'].includes(targetFormat)) {
        return res.status(400).json({ error: 'targetFormat must be "ascii" or "binary"' });
    }

    const resolvedPath = path.resolve(pcdPath);

    if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    if (!pcdParser) {
        return res.status(500).json({ error: 'Native parser not available' });
    }

    try {
        const toBinary = targetFormat === 'binary';
        pcdParser.convertFormat(resolvedPath, toBinary);
        res.json({ success: true, format: targetFormat });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Browse directories (for folder picker)
app.get('/api/browse', (req, res) => {
    let dirPath = req.query.dir || process.env.HOME || '/';

    // Expand ~ to home directory
    if (dirPath.startsWith('~')) {
        dirPath = dirPath.replace(/^~/, process.env.HOME || '/');
    }

    const resolvedPath = path.resolve(dirPath);

    if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: 'Directory not found' });
    }

    try {
        const stat = fs.statSync(resolvedPath);
        if (!stat.isDirectory()) {
            return res.status(400).json({ error: 'Not a directory' });
        }

        const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
        const directories = [];
        let pcdCount = 0;

        entries.forEach(entry => {
            if (entry.name.startsWith('.')) return; // Skip hidden files

            if (entry.isDirectory()) {
                // Count PCD files in this subdirectory
                let subPcdCount = 0;
                try {
                    const subPath = path.join(resolvedPath, entry.name);
                    const subEntries = fs.readdirSync(subPath);
                    subPcdCount = subEntries.filter(e => e.toLowerCase().endsWith('.pcd')).length;
                } catch (e) {
                    // Ignore permission errors
                }

                directories.push({
                    name: entry.name,
                    path: path.join(resolvedPath, entry.name),
                    pcdCount: subPcdCount
                });
            } else if (entry.name.toLowerCase().endsWith('.pcd')) {
                pcdCount++;
            }
        });

        directories.sort((a, b) => a.name.localeCompare(b.name));

        res.json({
            current: resolvedPath,
            parent: path.dirname(resolvedPath),
            directories,
            pcdCount
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: List PCD files in a directory
app.get('/api/files', (req, res) => {
    const dirPath = req.query.dir;

    if (!dirPath) {
        return res.status(400).json({ error: 'Directory path required' });
    }

    const resolvedPath = path.resolve(dirPath);

    if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: 'Directory not found' });
    }

    try {
        const files = fs.readdirSync(resolvedPath)
            .filter(file => file.toLowerCase().endsWith('.pcd'))
            .map(file => ({
                name: file,
                path: path.join(resolvedPath, file)
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        res.json({ directory: resolvedPath, files });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Serve a PCD file
app.get('/api/file', (req, res) => {
    const filePath = req.query.path;

    if (!filePath) {
        return res.status(400).json({ error: 'File path required' });
    }

    const resolvedPath = path.resolve(filePath);

    if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    res.sendFile(resolvedPath);
});

// API: Load labels for a PCD file
app.get('/api/labels', (req, res) => {
    const pcdPath = req.query.path;

    if (!pcdPath) {
        return res.status(400).json({ error: 'PCD path required' });
    }

    const labelsPath = pcdPath.replace(/\.pcd$/i, '.labels.json');

    if (!fs.existsSync(labelsPath)) {
        return res.json({ exists: false });
    }

    try {
        const data = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
        res.json({ exists: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Save labels for a PCD file (legacy JSON format)
app.post('/api/labels', (req, res) => {
    const { pcdPath, labels } = req.body;

    if (!pcdPath || !labels) {
        return res.status(400).json({ error: 'PCD path and labels required' });
    }

    const labelsPath = pcdPath.replace(/\.pcd$/i, '.labels.json');

    try {
        fs.writeFileSync(labelsPath, JSON.stringify(labels, null, 2));
        res.json({ success: true, path: labelsPath });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Get label configuration (supports YAML and JSON)
app.get('/api/config/labels', (req, res) => {
    const yamlPath = path.join(__dirname, 'labels.yaml');
    const jsonPath = path.join(__dirname, 'label-config.json');

    // Try YAML first
    if (fs.existsSync(yamlPath)) {
        try {
            const config = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
            return res.json(config);
        } catch (err) {
            console.error('Failed to parse labels.yaml:', err.message);
        }
    }

    // Fallback to JSON
    if (fs.existsSync(jsonPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            return res.json(config);
        } catch (err) {
            console.error('Failed to parse label-config.json:', err.message);
        }
    }

    // Return default configuration
    const defaultConfig = {
        labels: [
            { id: 0, name: 'unlabeled', color: '#808080', shortcut: '0' },
            { id: 1, name: 'ground', color: '#8B4513', shortcut: '1' },
            { id: 2, name: 'vegetation', color: '#228B22', shortcut: '2' },
            { id: 3, name: 'building', color: '#4169E1', shortcut: '3' },
            { id: 4, name: 'vehicle', color: '#DC143C', shortcut: '4' },
            { id: 5, name: 'pedestrian', color: '#FFD700', shortcut: '5' },
            { id: 6, name: 'pole', color: '#FF69B4', shortcut: '6' },
            { id: 7, name: 'road', color: '#2F4F4F', shortcut: '7' },
            { id: 8, name: 'other', color: '#9932CC', shortcut: '8' }
        ]
    };
    res.json(defaultConfig);
});

// API: Save label configuration (saves to YAML)
app.post('/api/config/labels', (req, res) => {
    const { labels } = req.body;
    const yamlPath = path.join(__dirname, 'labels.yaml');

    try {
        const yamlContent = yaml.dump({ labels }, { indent: 2, quotingType: '"' });
        fs.writeFileSync(yamlPath, yamlContent);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Load label configuration from uploaded YAML content
app.post('/api/config/labels/load', (req, res) => {
    const { content, filename } = req.body;
    const yamlPath = path.join(__dirname, 'labels.yaml');

    try {
        // Parse YAML to validate it
        const config = yaml.load(content);

        if (!config || !config.labels || !Array.isArray(config.labels)) {
            return res.status(400).json({ error: 'Invalid label config: missing labels array' });
        }

        // Save to current labels.yaml (overwrites)
        fs.writeFileSync(yamlPath, content);

        res.json({ success: true, filename });
    } catch (err) {
        res.status(400).json({ error: 'Invalid YAML: ' + err.message });
    }
});

app.listen(PORT, () => {
    console.log(`\n🚀 Point Cloud Labeling Tool`);
    console.log(`   Server running at http://localhost:${PORT}`);
    console.log(`\n   Open the URL above in your browser to start labeling.\n`);
});
