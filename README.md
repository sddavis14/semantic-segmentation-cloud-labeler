# Point Cloud Labeler

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A modern, web-based tool for labeling 3D LiDAR point clouds for semantic segmentation. Built with Three.js and a high-performance native C++ PCD parser.

![Point Cloud Labeler Interface](sample_data/screenshot.png)

## ✨ Features

- **High-Performance Parsing**: Native C++ addon for fast PCD file loading
- **Multiple Save Formats**: ASCII, Binary, and LZF-compressed Binary
- **Dynamic Colorization**: Color by label, RGB, intensity, or any field
- **View Plane Switching**: Quickly snap to XY, XZ, or YZ orthogonal views  
- **Selection Tools**: Box and lasso selection for precise labeling
- **Configurable Labels**: Add custom labels with unique colors
- **Keyboard Shortcuts**: Full keyboard navigation (press `H` for cheat sheet)
- **Modern UI**: Dark theme with glassmorphism design

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+**
- **C++ compiler** (Xcode CLI tools on macOS, build-essential on Linux)

### Installation

```bash
# Clone and install
git clone <repository-url>
cd labeling_tool
npm install

# Start the server
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Open a Folder

```bash
# Start with a specific folder
npm start -- --dir /path/to/pcd/files
```

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `H` or `?` | Show keyboard shortcuts |
| `N` / `→` | Next file |
| `P` / `←` | Previous file |
| `Ctrl+S` | Save labels |
| `Ctrl+O` | Open folder |
| `0-9` | Quick assign label |
| `Escape` | Clear selection |
| `B` | Box select mode |
| `L` | Lasso select mode |
| `R` | Reset camera |
| `C` | Cycle colorization |

## 🖱️ Mouse Controls

- **Left click + drag**: Select points (box or lasso)
- **Right click + drag**: Orbit camera
- **Middle click + drag**: Pan camera
- **Scroll**: Zoom in/out

## 💾 Save Formats

Use the **Format** dropdown to choose output format:

| Format | Description |
|--------|-------------|
| Auto | Preserves original file format |
| ASCII | Human-readable text format |
| Binary | Efficient binary format |
| Compressed | LZF-compressed binary (smallest) |

## 🎨 View Planes

Switch between orthogonal views for precise labeling:

- **Free**: Default 3D orbit view
- **XY (Top)**: Bird's eye view, looking down Z-axis
- **XZ (Front)**: Front view, looking down Y-axis
- **YZ (Side)**: Side view, looking down X-axis

The grid automatically rotates to match the selected view plane.

## 📁 Project Structure

```
labeling_tool/
├── native/src/           # C++ native addon
│   ├── pcd_parser.cpp    # PCD parser with LZF compression
│   └── bindings.cpp      # Node.js N-API bindings
├── public/               # Frontend
│   ├── js/               # JavaScript modules
│   └── css/              # Stylesheets
├── sample_data/          # Example PCD files
├── server.js             # Express server
└── labels.yaml           # Label configuration
```

## 🔧 Troubleshooting

### Native addon build errors

```bash
# Ensure node-gyp is installed
npm install -g node-gyp

# Clean rebuild
rm -rf build node_modules
npm install
```

### "Native parser not available"

The C++ addon failed to build. Ensure you have:
- A C++ compiler (`g++` or `clang++`)
- Python 3 (required by node-gyp)

## 📄 License

[MIT](LICENSE) © Spencer Pao
