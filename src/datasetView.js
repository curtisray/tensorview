import { getHexColor, normalizeValue } from './colormaps.js';

export class DatasetView {
  constructor(containerElement, tensor, options = {}) {
    this.container = containerElement;
    this.tensor = tensor;
    this.colormap = options.colormap || 'plasma';
    this.activeSliceIndex = 0;
    this.sliceMode = 0; // 0 = Frontal T[t, :, :], 1 = Horizontal T[:, i, :], 2 = Lateral T[:, :, j]
    this.hoveredCell = null; // {t, i, j}
    this.selectedCell = null; // {t, i, j}

    // Callbacks
    this.onCellHover = null;
    this.onCellSelect = null;
    this.onSliceSelect = null;

    this.render();
    this.tensor.subscribe((event) => {
      this.updateValues();
      this.updateStats();
      if (event === 'shape_changed') {
        this.render();
      }
    });
  }

  setColormap(cmap) {
    this.colormap = cmap;
    this.updateValues();
  }

  setActiveSlice(index) {
    const maxIdx = this.sliceMode === 0 ? this.tensor.T : this.sliceMode === 1 ? this.tensor.H : this.tensor.W;
    this.activeSliceIndex = Math.max(0, Math.min(maxIdx - 1, Math.round(index)));
    this.updateActiveSliceTable();
    this.updateGalleryHighlights();
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
    this.selectedCell = (t !== null && i !== null && j !== null) ? { t, i, j } : null;
    this.updateCellHighlightStyles();
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

        <!-- Slice Scrubber Bar -->
        <div class="slice-scrubber-row">
          <div class="slice-info-badge" id="active-slice-label">
            ${this.getSliceLabel()}
          </div>
          <div class="slice-scrubber-controls">
            <button class="icon-btn-small" id="prev-slice-btn" title="Previous slice">‹</button>
            <input type="range" class="slice-slider" id="slice-slider" 
              min="0" max="${this.getMaxSliceIndex()}" value="${this.activeSliceIndex}" step="1">
            <button class="icon-btn-small" id="next-slice-btn" title="Next slice">›</button>
          </div>
        </div>

        <!-- Active Matrix Table Container -->
        <div class="active-matrix-card">
          <div class="matrix-card-header">
            <span class="matrix-card-title">Active 2D Matrix Slice</span>
            <span class="matrix-hint">Click any cell to edit value &bull; Hover to highlight in 3D</span>
          </div>
          <div class="matrix-scroll-wrapper" id="matrix-table-container">
            <!-- Injected by updateActiveSliceTable -->
          </div>
        </div>

        <!-- All Slices Mini Gallery (Only shown for Frontal/Time mode) -->
        <div class="all-slices-section" id="all-slices-gallery">
          <div class="all-slices-header">
            <span>Time Dimension Slices \\(t = 0 \\dots ${this.tensor.T - 1}\\)</span>
            <span class="subtext">Click any slice to jump</span>
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
  }

  getMaxSliceIndex() {
    if (this.sliceMode === 0) return this.tensor.T - 1;
    if (this.sliceMode === 1) return this.tensor.H - 1;
    return this.tensor.W - 1;
  }

  getSliceLabel() {
    if (this.sliceMode === 0) {
      return `Frontal Slice \\(t = ${this.activeSliceIndex}\\) &bull; Mode-1`;
    } else if (this.sliceMode === 1) {
      return `Horizontal Slice \\(i = ${this.activeSliceIndex}\\) &bull; Mode-2`;
    } else {
      return `Lateral Slice \\(j = ${this.activeSliceIndex}\\) &bull; Mode-3`;
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

    // Slider
    const slider = this.container.querySelector('#slice-slider');
    if (slider) {
      slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.setActiveSlice(val);
        if (this.onSliceSelect) this.onSliceSelect(val);
      });
    }

    const prevBtn = this.container.querySelector('#prev-slice-btn');
    const nextBtn = this.container.querySelector('#next-slice-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.activeSliceIndex > 0) {
          this.setActiveSlice(this.activeSliceIndex - 1);
          if (slider) slider.value = this.activeSliceIndex;
          if (this.onSliceSelect) this.onSliceSelect(this.activeSliceIndex);
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (this.activeSliceIndex < this.getMaxSliceIndex()) {
          this.setActiveSlice(this.activeSliceIndex + 1);
          if (slider) slider.value = this.activeSliceIndex;
          if (this.onSliceSelect) this.onSliceSelect(this.activeSliceIndex);
        }
      });
    }
  }

  updateActiveSliceTable() {
    const tableContainer = this.container.querySelector('#matrix-table-container');
    const labelBadge = this.container.querySelector('#active-slice-label');
    const slider = this.container.querySelector('#slice-slider');
    if (slider) slider.value = this.activeSliceIndex;
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
        const formattedVal = val.toFixed(3);
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

      // Hover
      cell.addEventListener('mouseenter', () => {
        this.hoveredCell = { t, i, j };
        this.updateCellHighlightStyles();
        if (this.onCellHover) this.onCellHover(t, i, j);
      });

      cell.addEventListener('mouseleave', () => {
        if (this.hoveredCell && this.hoveredCell.t === t && this.hoveredCell.i === i && this.hoveredCell.j === j) {
          this.hoveredCell = null;
          this.updateCellHighlightStyles();
          if (this.onCellHover) this.onCellHover(null, null, null);
        }
      });

      // Click to edit
      cell.addEventListener('click', (e) => {
        // Toggle selection
        if (this.selectedCell && this.selectedCell.t === t && this.selectedCell.i === i && this.selectedCell.j === j) {
          // If already selected, open edit prompt
          this.openCellInlineEditor(cell, t, i, j);
        } else {
          this.selectedCell = { t, i, j };
          this.updateCellHighlightStyles();
          if (this.onCellSelect) this.onCellSelect(t, i, j);
        }
      });

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
