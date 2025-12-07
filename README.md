# Point Cloud Labeling Tool

Interactive web-based tool for labeling LiDAR point clouds for semantic segmentation.

## Prerequisites

This tool requires **Node.js 18+** and a **C++ compiler** for the native PCD parser addon.

### macOS

```bash
# Install Xcode command line tools (for C++ compiler)
xcode-select --install

# Or via nvm (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
\. "$HOME/.nvm/nvm.sh"
nvm install 24
```

### Ubuntu/Debian Linux

```bash
# Install build essentials (for C++ compiler)
sudo apt-get install -y build-essential python3

# Or via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
\. "$HOME/.nvm/nvm.sh"
nvm install 24
```

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd labeling_tool

# Install dependencies (includes building native C++ addon)
npm install

# The native addon will be automatically built during npm install
# If it fails, you can manually rebuild:
npm run build
```

## Quick Start

```bash
# Start the server
npm start
```

Then open `http://localhost:3000` in your browser.

## Troubleshooting

### Native Addon Build Errors

If you see errors like "'napi.h' file not found" during `npm install`:

```bash
# Ensure node-gyp is installed globally
npm install -g node-gyp

# Clean and rebuild
rm -rf build node_modules
npm install
```

### Server Shows "Native parser not available"

The C++ native addon failed to build. Check the build output and ensure:
- C++ compiler is installed (`g++` or `clang++`)
- Python 3 is installed (required by node-gyp)

## Features

- **Native PCD Parser**: High-performance C++ PCD file parsing
- **PCD Format Support**: Reads ASCII and binary PCD formats
- **Dynamic Colorization**: Color by any field (label, intensity, RGB, reflectivity, etc.)
- **Selection Tools**: Box select and lasso select for choosing points
- **Semantic Labeling**: Assign labels to selected points
- **Configurable Labels**: Add/edit/remove labels with custom colors
- **RGB Colorization**: When R, G, B fields are present, shows actual colors
- **File Navigation**: Browse through PCD files in a folder
- **Label Persistence**: Labels are embedded directly in PCD files
- **Format Conversion**: Convert between ASCII and binary PCD formats

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
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

## Mouse Controls

- **Left click + drag**: Select points (box or lasso)
- **Right click + drag**: Orbit camera
- **Scroll**: Zoom in/out
- **Middle click + drag**: Pan camera

## Label Storage

Labels are embedded directly in PCD files as a `label` field:
- When you save (Ctrl+S), the label values are written into the PCD file
- Labels persist with the point cloud data

## Configuring Labels

Click the ⚙️ button in the label panel to add, edit, or remove labels.
Labels are saved to `labels.yaml` in the project root.

## Test Data

Sample PCD files are provided in `sample_data/`:
- `urban_scene.pcd` - Urban scene with buildings, cars, pedestrians
- `small_scene.pcd` - Smaller test scene
- `rgb_demo.pcd` - Demo with RGB color fields

## Project Structure

```
labeling_tool/
├── native/src/           # C++ native addon source
│   ├── pcd_parser.h      # PCD parser header
│   ├── pcd_parser.cpp    # PCD parser implementation
│   └── bindings.cpp      # Node.js N-API bindings
├── public/               # Frontend files
│   ├── js/               # JavaScript modules
│   └── css/              # Stylesheets
├── sample_data/          # Sample PCD files
├── server.js             # Express server
├── binding.gyp           # Node-gyp build config
└── package.json
```
