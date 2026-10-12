import { getHexColor, normalizeValue, getColormapCssGradient } from './colormaps.js';

export class DatasetView {
  constructor(containerElement, tensor, options = {}) {
    this.container = containerElement;
    this.tensor = tensor;
    this.colormap = options.colormap || 'plasma';
    this.activeSliceIndex = 0;
    this.sliceMode = 0; // 0 = Frontal T[t, :, :], 1 = Horizontal T[:, i, :], 2 = Lateral T[:, :, j]
    this.hoveredCell = null; // {t, i, j}
    this.selectedCell = { t: 0, i: 0, j: 0 }; // Default to first voxel
    this.activeIntensity = 0.75;
    this.isPainting = false;
    this.isMouseDown = false;

    // Callbacks
    this.onCellHover = null;
    this.onCellSelect = null;
    this.onSliceSelect = null;

    this.render();
    this.tensor.subscribe((event) => {
      this.updateValues();
      this.updateStats();
      this.syncSelectedCubeDisplay();
      if (event === 'shape_changed') {
        this.selectedCell = { t: 0, i: 0, j: 0 };
        this.render();
      }
    });

    // Track global mouse up for drag-painting
    window.addEventListener('pointerup', () => {
      this.isMouseDown = false;
    });
  }

  setColormap(cmap) {
    this.colormap = cmap;
    this.updateValues();
    this.syncSelectedCubeDisplay();
  }

  setActiveSlice(index) {
    const maxIdx = this.sliceMode === 0 ? this.tensor.T : this.sliceMode === 1 ? this.tensor.H : this.tensor.W;
    this.activeSliceIndex = Math.max(0, Math.min(maxIdx - 1, Math.round(index)));
    // Keep selected cell's slice in sync if frontal
    if (this.sliceMode === 0 && this.selectedCell) {
      this.selectedCell.t = this.activeSliceIndex;
    }
    this.updateActiveSliceTable();
    this.updateGalleryHighlights();
    this.syncSelectedCubeDisplay();
  }

  setSliceMode(mode) {
    this.sliceMode = mode;
    this.activeSliceIndex = 0;
    this.render();
    if (this.onSliceSelect) this.onSliceSelect(0);
  }

  highlightCell(t, i, j) {
    this.hoveredCell = (t !== null && i !== null && j !== null) ? { t, i, j } : null;
    this.updateCellHighlightStyles();
  }

  selectCell(t, i, j) {
    if (t !== null && i !== null && j !== null) {
      this.selectedCell = { t, i, j };
      this.activeIntensity = this.tensor.get(t, i, j);
    } else {
      this.selectedCell = null;
    }
    this.updateCellHighlightStyles();
    this.syncSelectedCubeDisplay();
  }

  render() {
    this.container.innerHTML = `
      <div class="dataset-panel">
        <!-- Panel Header -->
        <div class="dataset-header">
          <div class="dataset-title-group">
            <div class="dataset-tag">DATASET VIEW</div>
            <h2 class="dataset-title">Rank-3 Numerical Lattice</h2>
            <div class="math-notation">
              <span>\\(\\mathcal{T} \\in \\mathbb{R}^{${this.tensor.T} \\times ${this.tensor.H} \\times ${this.tensor.W}}\\)</span>
            </div>
          </div>
          
          <div class="slice-mode-tabs" role="tablist">
            <button class="slice-mode-btn ${this.sliceMode === 0 ? 'active' : ''}" data-mode="0" title="Frontal Slice T[t, :, :] (Time/Depth)">
              Frontal <span class="subtext">T[t, :, :]</span>
            </button>
            <button class="slice-mode-btn ${this.sliceMode === 1 ? 'active' : ''}" data-mode="1" title="Horizontal Slice T[:, i, :] (Row/Height)">
              Horizontal <span class="subtext">T[:, i, :]</span>
            </button>
            <button class="slice-mode-btn ${this.sliceMode === 2 ? 'active' : ''}" data-mode="2" title="Lateral Slice T[:, :, j] (Col/Width)">
              Lateral <span class="subtext">T[:, :, j]</span>
            </button>
          </div>
        </div>

        <!-- Frame Navigation & Animation Authoring Toolbar -->
        <div class="slice-toolbar-row">
          <div class="slice-frame-nav">
            <button class="icon-btn-small" id="prev-slice-btn" title="Previous slice">‹</button>
            <span class="slice-frame-label" id="active-slice-label">${this.getSliceLabel()}</span>
            <button class="icon-btn-small" id="next-slice-btn" title="Next slice">›</button>
          </div>

          <div class="frame-anim-actions">
            <button class="anim-action-btn primary-action" id="copy-slice-next-btn" title="Duplicate this slice to next frame (t+1) to animate easily">
              📋 Copy to Next
            </button>
            <button class="anim-action-btn" id="shift-slice-left-btn" title="Shift pattern left">⬅</button>
            <button class="anim-action-btn" id="shift-slice-right-btn" title="Shift pattern right">➡</button>
            <button class="anim-action-btn" id="invert-slice-btn" title="Invert positive/negative values">🔄 Invert</button>
            <button class="anim-action-btn danger" id="clear-slice-btn" title="Set all values in this slice to zero">🧹 Clear</button>
          </div>
        </div>

        <!-- Selected Cube Intensity & Color Studio (Replaced old slider) -->
        <div class="cube-intensity-card">
          <div class="intensity-card-header">
            <div class="selected-cube-badge-group">
              <span class="intensity-target-label">Selected Cube:</span>
              <span class="selected-cube-coords" id="selected-cube-coords">
                ${this.selectedCell ? `T[${this.selectedCell.t}, ${this.selectedCell.i}, ${this.selectedCell.j}]` : 'None'}
              </span>
              <span class="selected-color-swatch" id="selected-color-swatch"></span>
            </div>

            <div class="intensity-value-badge">
              <span class="intensity-hint-label">Value:</span>
              <span class="intensity-num" id="selected-intensity-num">+0.00</span>
            </div>
          </div>

          <!-- Color Spectrum Slider Track -->
          <div class="intensity-slider-wrapper">
            <input type="range" class="intensity-color-slider" id="cube-intensity-slider" 
              min="-1" max="1" step="0.02" value="0.0"
              title="Drag to change intensity & color of selected cube" />
          </div>

          <!-- Quick Value Stops & Paint Mode Toggle -->
          <div class="intensity-palette-bar">
            <div class="palette-swatches">
              <button class="swatch-btn" data-val="-1.0" title="Set to -1.00 (Min)">-1.0</button>
              <button class="swatch-btn" data-val="-0.5" title="Set to -0.50">-0.5</button>
              <button class="swatch-btn" data-val="0.0" title="Set to 0.00 (Zero)">0.0</button>
              <button class="swatch-btn" data-val="0.5" title="Set to +0.50">+0.5</button>
              <button class="swatch-btn" data-val="1.0" title="Set to +1.00 (Max)">+1.0</button>
            </div>

            <div class="paint-toggle-wrapper">
              <button class="paint-mode-btn ${this.isPainting ? 'active' : ''}" id="paint-mode-toggle" title="Click & drag to paint this intensity onto matrix cells">
                🖌️ Paint Mode
              </button>
            </div>
          </div>
        </div>

        <!-- Active Matrix Table Container -->
        <div class="active-matrix-card">
          <div class="matrix-card-header">
            <span class="matrix-card-title">Active 2D Matrix Slice</span>
            <span class="matrix-hint">Click to select cube &bull; Drag to paint &bull; Scroll wheel to nudge</span>
          </div>
          <div class="matrix-scroll-wrapper" id="matrix-table-container">
            <!-- Injected by updateActiveSliceTable -->
          </div>
        </div>

        <!-- All Slices Mini Gallery (Only shown for Frontal/Time mode) -->
        <div class="all-slices-section" id="all-slices-gallery">
          <div class="all-slices-header">
            <span>Time Dimension Keyframes \\(t = 0 \\dots ${this.tensor.T - 1}\\)</span>
            <span class="subtext">Click any frame to jump &amp; edit</span>
          </div>
          <div class="mini-slices-carousel" id="mini-slices-container">
            <!-- Injected by updateGallery -->
          </div>
        </div>

        <!-- Mathematical Stats & Tensor Decomposition -->
        <div class="tensor-stats-grid" id="tensor-stats">
          <!-- Injected by updateStats -->
        </div>
      </div>
    `;

    this.bindEvents();
    this.updateActiveSliceTable();
    this.updateGallery();
    this.updateStats();
    this.syncSelectedCubeDisplay();
  }

  getMaxSliceIndex() {
    if (this.sliceMode === 0) return this.tensor.T - 1;
    if (this.sliceMode === 1) return this.tensor.H - 1;
    return this.tensor.W - 1;
  }

  getSliceLabel() {
    if (this.sliceMode === 0) {
      return `Frame t = ${this.activeSliceIndex} / ${this.tensor.T - 1} &bull; Mode-1`;
    } else if (this.sliceMode === 1) {
      return `Horizontal Slice i = ${this.activeSliceIndex} &bull; Mode-2`;
    } else {
      return `Lateral Slice j = ${this.activeSliceIndex} &bull; Mode-3`;
    }
  }

  bindEvents() {
    // Slice mode tabs
    const modeBtns = this.container.querySelectorAll('.slice-mode-btn');
    modeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = parseInt(btn.dataset.mode, 10);
        this.setSliceMode(mode);
      });
    });

    // Frame Navigation Previous / Next
    const prevBtn = this.container.querySelector('#prev-slice-btn');
    const nextBtn = this.container.querySelector('#next-slice-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.activeSliceIndex > 0) {
          this.setActiveSlice(this.activeSliceIndex - 1);
          if (this.onSliceSelect) this.onSliceSelect(this.activeSliceIndex);
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (this.activeSliceIndex < this.getMaxSliceIndex()) {
          this.setActiveSlice(this.activeSliceIndex + 1);
          if (this.onSliceSelect) this.onSliceSelect(this.activeSliceIndex);
        }
      });
    }

    // Animation Authoring Actions
    const copyNextBtn = this.container.querySelector('#copy-slice-next-btn');
    if (copyNextBtn) {
      copyNextBtn.addEventListener('click', () => {
        const currentT = this.activeSliceIndex;
        const nextT = (currentT + 1) % this.tensor.T;
        this.tensor.copySlice(currentT, nextT);
        this.setActiveSlice(nextT);
        if (this.onSliceSelect) this.onSliceSelect(nextT);
      });
    }

    const clearBtn = this.container.querySelector('#clear-slice-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.tensor.clearSlice(this.activeSliceIndex);
        this.updateActiveSliceTable();
      });
    }

    const invertBtn = this.container.querySelector('#invert-slice-btn');
    if (invertBtn) {
      invertBtn.addEventListener('click', () => {
        this.tensor.invertSlice(this.activeSliceIndex);
        this.updateActiveSliceTable();
      });
    }

    const shiftLeftBtn = this.container.querySelector('#shift-slice-left-btn');
    if (shiftLeftBtn) {
      shiftLeftBtn.addEventListener('click', () => {
        this.tensor.shiftSlice(this.activeSliceIndex, 0, -1);
        this.updateActiveSliceTable();
      });
    }

    const shiftRightBtn = this.container.querySelector('#shift-slice-right-btn');
    if (shiftRightBtn) {
      shiftRightBtn.addEventListener('click', () => {
        this.tensor.shiftSlice(this.activeSliceIndex, 0, 1);
        this.updateActiveSliceTable();
      });
    }

    // Cube Intensity Slider (Direct Color & Value Control)
    const intensitySlider = this.container.querySelector('#cube-intensity-slider');
    if (intensitySlider) {
      intensitySlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.activeIntensity = val;
        if (this.selectedCell) {
          const { t, i, j } = this.selectedCell;
          this.tensor.set(t, i, j, val);
          this.updateActiveSliceTable();
          this.syncSelectedCubeDisplay();
          if (this.onCellSelect) this.onCellSelect(t, i, j);
        }
      });
    }

    // Quick Palette Swatch Buttons
    const swatchBtns = this.container.querySelectorAll('.swatch-btn');
    swatchBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = parseFloat(btn.dataset.val);
        this.activeIntensity = val;
        if (intensitySlider) intensitySlider.value = val;
        if (this.selectedCell) {
          const { t, i, j } = this.selectedCell;
          this.tensor.set(t, i, j, val);
          this.updateActiveSliceTable();
          this.syncSelectedCubeDisplay();
          if (this.onCellSelect) this.onCellSelect(t, i, j);
        }
      });
    });

    // Paint Mode Toggle
    const paintToggle = this.container.querySelector('#paint-mode-toggle');
    if (paintToggle) {
      paintToggle.addEventListener('click', () => {
        this.isPainting = !this.isPainting;
        paintToggle.classList.toggle('active', this.isPainting);
      });
    }
  }

  syncSelectedCubeDisplay() {
    const coordsEl = this.container.querySelector('#selected-cube-coords');
    const swatchEl = this.container.querySelector('#selected-color-swatch');
    const numEl = this.container.querySelector('#selected-intensity-num');
    const sliderEl = this.container.querySelector('#cube-intensity-slider');
    if (!coordsEl || !swatchEl || !numEl || !sliderEl) return;

    // Update gradient background of the slider track based on current colormap
    sliderEl.style.background = getColormapCssGradient(this.colormap);

    if (!this.selectedCell) {
      coordsEl.textContent = 'None';
      swatchEl.style.backgroundColor = 'transparent';
      numEl.textContent = '--';
      return;
    }

    const { t, i, j } = this.selectedCell;
    const val = this.tensor.get(t, i, j);
    const stats = this.tensor.stats();
    const norm = normalizeValue(val, stats.min, stats.max);
    const hex = getHexColor(norm, this.colormap);

    coordsEl.textContent = `T[${t}, ${i}, ${j}]`;
    swatchEl.style.backgroundColor = hex;
    swatchEl.style.boxShadow = `0 0 10px ${hex}`;
    numEl.textContent = (val >= 0 ? '+' : '') + val.toFixed(2);
    sliderEl.value = val;
  }

  updateActiveSliceTable() {
    const tableContainer = this.container.querySelector('#matrix-table-container');
    const labelBadge = this.container.querySelector('#active-slice-label');
    if (labelBadge) labelBadge.innerHTML = this.getSliceLabel();
    if (!tableContainer) return;

    const slice = this.tensor.getSlice(this.sliceMode, this.activeSliceIndex);
    const stats = this.tensor.stats();

    let colHeaderName = 'j (Col)';
    let rowHeaderName = 'i (Row)';
    if (this.sliceMode === 1) {
      rowHeaderName = 't (Time)';
      colHeaderName = 'j (Col)';
    } else if (this.sliceMode === 2) {
      rowHeaderName = 't (Time)';
      colHeaderName = 'i (Row)';
    }

    let html = `
      <table class="tensor-matrix-table">
        <thead>
          <tr>
            <th class="matrix-corner">${rowHeaderName} \\ ${colHeaderName}</th>
    `;

    for (let c = 0; c < slice.cols; c++) {
      html += `<th class="matrix-col-header">c${c}</th>`;
    }
    html += `</tr></thead><tbody>`;

    for (let r = 0; r < slice.rows; r++) {
      html += `<tr><th class="matrix-row-header">r${r}</th>`;
      for (let c = 0; c < slice.cols; c++) {
        const val = slice.matrix[r][c];
        const norm = normalizeValue(val, stats.min, stats.max);
        const hex = getHexColor(norm, this.colormap);

        // Derive coordinates (t, i, j)
        let t, i, j;
        if (this.sliceMode === 0) {
          t = this.activeSliceIndex;
          i = r;
          j = c;
        } else if (this.sliceMode === 1) {
          t = r;
          i = this.activeSliceIndex;
          j = c;
        } else {
          t = r;
          i = c;
          j = this.activeSliceIndex;
        }

        const cellId = `cell_${t}_${i}_${j}`;
        const formattedVal = val.toFixed(2);
        const textColor = norm > 0.45 && norm < 0.85 ? '#000000' : '#ffffff';

        html += `
          <td class="matrix-cell" 
              id="${cellId}" 
              data-t="${t}" data-i="${i}" data-j="${j}" 
              data-val="${val}"
              style="background-color: ${hex}26; border-color: ${hex}55;"
              title="T[${t}, ${i}, ${j}] = ${val}">
            <div class="cell-content">
              <span class="cell-indices">[${t},${i},${j}]</span>
              <span class="cell-value" style="color: ${textColor}; text-shadow: 0 1px 3px rgba(0,0,0,0.8);">${formattedVal}</span>
            </div>
          </td>
        `;
      }
      html += `</tr>`;
    }
    html += `</tbody></table>`;

    tableContainer.innerHTML = html;
    this.bindCellInteractions(tableContainer);
    this.updateCellHighlightStyles();
  }

  bindCellInteractions(tableContainer) {
    const cells = tableContainer.querySelectorAll('.matrix-cell');
    cells.forEach((cell) => {
      const t = parseInt(cell.dataset.t, 10);
      const i = parseInt(cell.dataset.i, 10);
      const j = parseInt(cell.dataset.j, 10);

      // Pointer down: Select or Paint
      cell.addEventListener('pointerdown', (e) => {
        this.isMouseDown = true;
        this.selectedCell = { t, i, j };

        if (this.isPainting) {
          // Stamp active intensity immediately
          this.tensor.set(t, i, j, this.activeIntensity);
          this.updateActiveSliceTable();
        } else {
          this.activeIntensity = this.tensor.get(t, i, j);
        }

        this.updateCellHighlightStyles();
        this.syncSelectedCubeDisplay();
        if (this.onCellSelect) this.onCellSelect(t, i, j);
      });

      // Pointer enter: Hover or Drag-to-Paint
      cell.addEventListener('pointerenter', () => {
        this.hoveredCell = { t, i, j };
        this.updateCellHighlightStyles();
        if (this.onCellHover) this.onCellHover(t, i, j);

        // If mouse is held down and paint mode is on (or drag-painting)
        if (this.isMouseDown && this.isPainting) {
          this.selectedCell = { t, i, j };
          this.tensor.set(t, i, j, this.activeIntensity);
          this.updateActiveSliceTable();
          this.syncSelectedCubeDisplay();
          if (this.onCellSelect) this.onCellSelect(t, i, j);
        }
      });

      cell.addEventListener('pointerleave', () => {
        if (this.hoveredCell && this.hoveredCell.t === t && this.hoveredCell.i === i && this.hoveredCell.j === j) {
          this.hoveredCell = null;
          this.updateCellHighlightStyles();
          if (this.onCellHover) this.onCellHover(null, null, null);
        }
      });

      // Mouse wheel: Quick intensity nudge up/down
      cell.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.05 : -0.05;
        const current = this.tensor.get(t, i, j);
        const nextVal = Math.round((current + delta) * 100) / 100;
        this.tensor.set(t, i, j, nextVal);
        this.selectedCell = { t, i, j };
        this.activeIntensity = nextVal;
        this.updateActiveSliceTable();
        this.syncSelectedCubeDisplay();
        if (this.onCellSelect) this.onCellSelect(t, i, j);
      }, { passive: false });

      // Double-click still opens exact inline number input
      cell.addEventListener('dblclick', () => {
        this.openCellInlineEditor(cell, t, i, j);
      });
    });
  }

  openCellInlineEditor(cellElement, t, i, j) {
    const currentVal = this.tensor.get(t, i, j);
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.value = currentVal.toFixed(3);
    input.className = 'inline-cell-input';

    const finishEdit = () => {
      const newVal = parseFloat(input.value);
      if (!isNaN(newVal)) {
        this.tensor.set(t, i, j, newVal);
        this.activeIntensity = newVal;
        this.syncSelectedCubeDisplay();
      }
      this.updateActiveSliceTable();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        finishEdit();
      } else if (e.key === 'Escape') {
        this.updateActiveSliceTable();
      }
    });

    input.addEventListener('blur', finishEdit);

    cellElement.innerHTML = '';
    cellElement.appendChild(input);
    input.focus();
    input.select();
  }

  updateCellHighlightStyles() {
    const allCells = this.container.querySelectorAll('.matrix-cell');
    allCells.forEach((c) => {
      const t = parseInt(c.dataset.t, 10);
      const i = parseInt(c.dataset.i, 10);
      const j = parseInt(c.dataset.j, 10);

      const isHovered = this.hoveredCell && this.hoveredCell.t === t && this.hoveredCell.i === i && this.hoveredCell.j === j;
      const isSelected = this.selectedCell && this.selectedCell.t === t && this.selectedCell.i === i && this.selectedCell.j === j;

      if (isSelected) {
        c.classList.add('selected');
        c.classList.remove('hovered');
      } else if (isHovered) {
        c.classList.add('hovered');
        c.classList.remove('selected');
      } else {
        c.classList.remove('hovered');
        c.classList.remove('selected');
      }
    });
  }

  updateGallery() {
    const gallery = this.container.querySelector('#mini-slices-container');
    if (!gallery) return;

    const stats = this.tensor.stats();
    let html = '';

    for (let t = 0; t < this.tensor.T; t++) {
      const isActive = t === this.activeSliceIndex;
      html += `
        <div class="mini-slice-card ${isActive ? 'active' : ''}" data-slice-index="${t}">
          <div class="mini-slice-badge">t = ${t}</div>
          <div class="mini-grid" style="grid-template-columns: repeat(${this.tensor.W}, 1fr)">
      `;

      for (let i = 0; i < this.tensor.H; i++) {
        for (let j = 0; j < this.tensor.W; j++) {
          const val = this.tensor.get(t, i, j);
          const norm = normalizeValue(val, stats.min, stats.max);
          const hex = getHexColor(norm, this.colormap);
          html += `<div class="mini-cell" style="background-color: ${hex};" title="T[${t},${i},${j}] = ${val.toFixed(2)}"></div>`;
        }
      }

      html += `</div></div>`;
    }

    gallery.innerHTML = html;

    const cards = gallery.querySelectorAll('.mini-slice-card');
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.sliceIndex, 10);
        this.setActiveSlice(idx);
        if (this.onSliceSelect) this.onSliceSelect(idx);
      });
    });
  }

  updateGalleryHighlights() {
    const cards = this.container.querySelectorAll('.mini-slice-card');
    cards.forEach((card) => {
      const idx = parseInt(card.dataset.sliceIndex, 10);
      if (idx === this.activeSliceIndex) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
  }

  updateValues() {
    this.updateActiveSliceTable();
    this.updateGallery();
  }

  updateStats() {
    const statsContainer = this.container.querySelector('#tensor-stats');
    if (!statsContainer) return;

    const stats = this.tensor.stats();
    statsContainer.innerHTML = `
      <div class="stat-card">
        <span class="stat-label">Frobenius Norm \\(\\|\\mathcal{T}\\|_F\\)</span>
        <span class="stat-value highlight-cyan">${stats.frobeniusNorm.toFixed(3)}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Value Range [Min, Max]</span>
        <span class="stat-value">[${stats.min.toFixed(2)}, ${stats.max.toFixed(2)}]</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Mean &plusmn; Std</span>
        <span class="stat-value">${stats.mean.toFixed(2)} &plusmn; ${stats.std.toFixed(2)}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Sparsity (% zeros)</span>
        <span class="stat-value highlight-pink">${stats.sparsity.toFixed(1)}%</span>
      </div>
    `;
  }
}
