# TensorView 🧊

> **Interactive 3D Mathematical Rank-3 Tensor Visualizer for Learning**  
> Built with Three.js, Vite, and Vanilla JavaScript.

---

## 🌟 Overview

**TensorView** provides an intuitive, interactive bridge between the **abstract mathematical formulation** of a 3rd-order tensor and its **physical spatiotemporal reality**.

It visualizes a Rank-3 tensor $\mathcal{T} \in \mathbb{R}^{T \times H \times W}$ simultaneously in two synchronized representations:
1. **The Dataset View (The Numbers):** An interactive matrix view displaying the discrete numbers across time and space, complete with heatmaps, inline editing, canonical slicing (frontal, horizontal, lateral), and statistical decomposition metrics.
2. **The Cube View (The 3D Volumetric Animation):** A 3D Three.js voxel lattice displaying how values evolve over the time dimension ($t$ in seconds), with time-travel playback controls, laser scanplanes, and an **Explode Slices** slider to inspect internal structures.

---

## 🚀 Quick Start

Ensure you have Node.js installed, then from this folder:

```bash
# Install dependencies
npm install

# Start local development server
npm run dev
```

Then open your browser at the provided local URL (typically `http://localhost:5173` or `http://localhost:5174`).

---

## ✨ Key Features

### 1. Synchronized Dual Views
* **3D Volumetric Cube:**
  * Rendered with Three.js physical materials, specular lighting, and sharp edge geometries.
  * Orbit, pan, and zoom freely with smooth damping.
  * Instant camera presets: **Isometric 3D**, **Frontal ($t$)**, **Top ($XZ$)**, and **Side ($ZY$)**.
* **Dataset Numerical Lattice:**
  * Shows exact floating-point numbers formatted to 3 decimal places.
  * Cells dynamically tinted according to selected colormaps.
  * **Live Editing:** Click or double-click any cell in the table to modify values on the fly—the 3D cube immediately reflects the update!
* **Bi-directional Sync:** Hovering over any number in the table highlights its corresponding 3D voxel with a glow and displays an analytical HUD overlay. Hovering over a 3D block highlights the cell in the table.

### 2. Time Dimension Animation & Playback
* **Time Playback:** Press **Play (▶)** to animate through the time dimension ($t \in [0, T-1]$).
* **Timeline Scrubber:** Drag the time slider to smoothly scrub forward and backward through tensor time slices.
* **Speed Control:** Play at `0.5x`, `1.0x` (1s per slice), `2.0x`, or `4.0x`.
* **Laser Scanplane:** An ethereal glowing boundary frames the active time slice.
* **Ghost Inactive Slices:** Toggle translucent glass rendering on inactive layers to peer deep into the internal tensor core.
* **Isolate Current Slice:** Focus solely on the active 2D matrix slice in 3D space.

### 3. Slice Separation / Explode Slices
* Rank-3 tensors can be difficult to inspect when voxels are packed into a solid cube.
* Adjust the **Explode Slices** slider to pull the time slices apart like an accordion, clearly revealing interior values and showing how 2D matrices stack to form a 3D tensor.

### 4. Canonical Slicing Modes
Toggle between the three canonical multilinear algebra slices:
* **Frontal Slices $\mathcal{T}[t, :, :]$:** Mode-1 time/depth slices (snapshots across time).
* **Horizontal Slices $\mathcal{T}[:, i, :]$:** Mode-2 row slices.
* **Lateral Slices $\mathcal{T}[:, :, j]$:** Mode-3 column slices.

### 5. Mathematical Presets & Custom Formulas
* 🌊 **Standing 3D Wave:** Harmonic wave with spatial propagation.
* 🔥 **Heat Diffusion:** Gaussian temperature dispersal radiating outward over time.
* ⚡ **Traveling Soliton:** 3D wavepacket traversing the diagonal.
* 🔄 **Rotating Dipole:** 3D rotating harmonic oscillator field.
* ✨ **Superdiagonal (CP-Rank 1):** Kronecker delta / superdiagonal tensor illustrating CP tensor decomposition rank-1 components.
* 🎲 **Random Normal:** Box-Muller Gaussian noise.
* ✏️ **Custom Expression:** Type any custom function $f(t, y, x)$ using variables `t, y, x, T, H, W, PI, sin, cos, exp, sqrt, abs, pow`.

### 6. Dynamic Resizing
* Click the **Shape** pill in the top header (`[T: 4 × H: 4 × W: 4]`) to dynamically resize dimensions from $2 \times 2 \times 2$ up to $6 \times 6 \times 6$.

### 7. Colormaps
* Choose between **Plasma (Neon)**, **Viridis (Scientific)**, **Coolwarm (Diverging $\pm$)**, **Cyberpunk Glow**, and **Emerald Matrix**.

---

## 📐 Mathematical Background

In multilinear algebra, a rank-3 tensor is an element of the tensor product space:

$$\mathcal{T} \in \mathbb{R}^{T \times H \times W}$$

Where:
* Mode-1 ($t$): Time / Depth index ($0 \le t < T$)
* Mode-2 ($i$): Row / Height index ($0 \le i < H$)
* Mode-3 ($j$): Column / Width index ($0 \le j < W$)

Summary statistics computed live:
* **Frobenius Norm:** $\|\mathcal{T}\|_F = \sqrt{\sum_{t=0}^{T-1} \sum_{i=0}^{H-1} \sum_{j=0}^{W-1} \mathcal{T}_{t,i,j}^2}$
* **Sparsity:** Percentage of elements with magnitude near zero ($|\mathcal{T}_{t,i,j}| < 10^{-5}$).

---

## 🛠 Project Structure

```
tensorview/
├── index.html            # Main semantic HTML structure & MathJax integration
├── src/
│   ├── main.js           # Application orchestrator & bi-directional event bus
│   ├── tensor.js         # Rank3Tensor mathematical model, stats & presets
│   ├── threeScene.js     # Three.js 3D volumetric scene, OrbitControls, raycaster
│   ├── datasetView.js    # Numerical table, live cell editing & slice gallery
│   ├── colormaps.js      # Colormaps (Plasma, Viridis, Coolwarm, Cyberpunk, Emerald)
│   └── style.css         # Dark glassmorphic design system & responsive layout
└── package.json
```
