/**
 * Colorizer - Point cloud colorization strategies with dynamic field support
 */
class Colorizer {
    constructor() {
        this.mode = 'label'; // 'label', 'rgb', or any field name
        this.labelColors = new Map();
        this.fieldData = {}; // Dynamic field data from native parser
        this.fieldBounds = {}; // Min/max for each field (auto-detected)
        this.customBounds = null; // User-overridden {min, max} for current field
        this.hasRGB = false; // Whether R, G, B fields are present
    }

    setMode(mode) {
        this.mode = mode;
        // Clear custom bounds when mode changes
        this.customBounds = null;
    }

    // Set custom min/max bounds for gradient colorization
    setCustomBounds(min, max) {
        this.customBounds = { min, max };
    }

    // Clear custom bounds (use auto-detected)
    clearCustomBounds() {
        this.customBounds = null;
    }

    // Get current effective bounds for the active mode
    getEffectiveBounds() {
        if (this.customBounds) {
            return this.customBounds;
        }
        return this.fieldBounds[this.mode] || { min: 0, max: 1 };
    }

    setLabelColors(labelDefinitions) {
        this.labelColors.clear();
        labelDefinitions.forEach(label => {
            this.labelColors.set(label.id, this.hexToRgb(label.color));
        });
    }

    // Set field data from native parser
    setFieldData(fields) {
        this.fieldData = fields || {};

        // Detect RGB fields (case-insensitive)
        const fieldNames = Object.keys(this.fieldData).map(n => n.toLowerCase());

        // Check for separate R, G, B fields
        this.hasRGB = fieldNames.includes('r') && fieldNames.includes('g') && fieldNames.includes('b');

        // Check for packed RGB field (PCL format - single field named 'rgb')
        this.hasPackedRGB = fieldNames.includes('rgb');

        // Compute bounds for all numeric fields
        this.fieldBounds = {};
        for (const [name, data] of Object.entries(this.fieldData)) {
            if (data && data.length > 0) {
                let min = Infinity;
                let max = -Infinity;
                for (let i = 0; i < data.length; i++) {
                    const v = data[i];
                    if (v < min) min = v;
                    if (v > max) max = v;
                }
                this.fieldBounds[name] = { min, max };
            }
        }
    }

    // Check if RGB colorization is available
    hasRGBFields() {
        return this.hasRGB || this.hasPackedRGB;
    }

    // Get available field names for colorization
    getAvailableFields() {
        return Object.keys(this.fieldData);
    }

    // Get field data by name (case-insensitive)
    getField(name) {
        const lower = name.toLowerCase();
        for (const [key, data] of Object.entries(this.fieldData)) {
            if (key.toLowerCase() === lower) return data;
        }
        return null;
    }

    // Get field bounds by name (case-insensitive)
    getFieldBounds(name) {
        const lower = name.toLowerCase();
        for (const [key, bounds] of Object.entries(this.fieldBounds)) {
            if (key.toLowerCase() === lower) return bounds;
        }
        return null;
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16) / 255,
            g: parseInt(result[2], 16) / 255,
            b: parseInt(result[3], 16) / 255
        } : { r: 0.5, g: 0.5, b: 0.5 };
    }

    /**
     * Generate colors for all points
     * @param {Float32Array} positions - Point positions (x,y,z,x,y,z,...)
     * @param {Uint8Array} labels - Per-point labels
     * @param {Set} selectedIndices - Indices of selected points
     * @returns {Float32Array} Colors (r,g,b,r,g,b,...)
     */
    colorize(positions, labels, selectedIndices) {
        const pointCount = positions.length / 3;
        const colors = new Float32Array(pointCount * 3);

        // Get RGB data if in RGB mode
        let rData = null, gData = null, bData = null;
        let packedRgbData = null;
        if (this.mode === 'rgb') {
            if (this.hasRGB) {
                rData = this.getField('r');
                gData = this.getField('g');
                bData = this.getField('b');
            } else if (this.hasPackedRGB) {
                packedRgbData = this.getField('rgb');
            }
        }

        for (let i = 0; i < pointCount; i++) {
            let r, g, b;

            if (selectedIndices && selectedIndices.has(i)) {
                // Highlight selected points
                r = 1.0;
                g = 1.0;
                b = 0.0;
            } else if (this.mode === 'label') {
                // Color by label
                const label = labels ? labels[i] : 0;
                const color = this.labelColors.get(label) || { r: 0.5, g: 0.5, b: 0.5 };
                r = color.r;
                g = color.g;
                b = color.b;
            } else if (this.mode === 'rgb' && rData && gData && bData) {
                // Use actual RGB values from point cloud (separate channels)
                const rVal = rData[i];
                const gVal = gData[i];
                const bVal = bData[i];

                // Get bounds using case-insensitive lookup
                const rBounds = this.getFieldBounds('r');
                if (rBounds && rBounds.max > 1) {
                    // 0-255 range
                    r = rVal / 255;
                    g = gVal / 255;
                    b = bVal / 255;
                } else {
                    // Already 0-1 range
                    r = rVal;
                    g = gVal;
                    b = bVal;
                }
            } else if (this.mode === 'rgb' && packedRgbData) {
                // PCL packed RGB format: float bits represent uint32 with 0x00RRGGBB
                const packedFloat = packedRgbData[i];

                // Reinterpret float bits as integer
                const buffer = new ArrayBuffer(4);
                const floatView = new Float32Array(buffer);
                const intView = new Uint32Array(buffer);
                floatView[0] = packedFloat;
                const rgb = intView[0];

                // Extract R, G, B bytes
                r = ((rgb >> 16) & 0xFF) / 255;
                g = ((rgb >> 8) & 0xFF) / 255;
                b = (rgb & 0xFF) / 255;
            } else {
                // Color by field value (gradient)
                const fieldData = this.fieldData[this.mode];
                const bounds = this.getEffectiveBounds();

                if (fieldData && fieldData.length > i) {
                    const value = fieldData[i];
                    const range = bounds.max - bounds.min;
                    const norm = range > 0 ? Math.max(0, Math.min(1, (value - bounds.min) / range)) : 0.5;
                    ({ r, g, b } = this.rainbowGradient(norm));
                } else {
                    r = g = b = 0.5;
                }
            }

            colors[i * 3] = r;
            colors[i * 3 + 1] = g;
            colors[i * 3 + 2] = b;
        }

        return colors;
    }

    rainbowGradient(t) {
        // HSL to RGB where H goes from blue (low) to red (high)
        const h = (1 - t) * 0.7; // 0.7 = blue, 0 = red
        return this.hslToRgb(h, 1, 0.5);
    }

    hslToRgb(h, s, l) {
        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }
        return { r, g, b };
    }
}

window.Colorizer = Colorizer;
