import { getColorForNorm, getHexColor, normalizeValue } from './colormaps.js';

/**
 * FrontView: Dedicated 2D frontal time-slice animation view (Left panel)
 * Visualizes T[t, :, :] as a continuous animated spatiotemporal screen/video frame.
 */
export class FrontView {
  constructor(containerElement, tensor, options = {}) {
    this.container = containerElement;
    this.tensor = tensor;
    this.colormap = options.colormap || 'plasma';
    this.activeTimeSlice = 0;
    this.interpolate = false; // Discrete grid vs smooth interpolation
    this.hoveredCell = null; // { i, j }

    // Callbacks for bi-directional sync
    this.onCellHover = null;
    this.onCellSelect = null;

    this.canvas = null;
    this.ctx = null;

    this.renderDOM();
    this.initCanvas();
    this.drawFrame();

    // Subscribe to tensor data changes
    this.tensor.subscribe((event) => {
      this.drawFrame();
      if (event === 'shape_changed') {
        this.renderDOM();
        this.initCanvas();
        this.drawFrame();
      }
    });
  }

  setColormap(cmap) {
    this.colormap = cmap;
    this.drawFrame();
  }

  setTimeSlice(t) {
    this.activeTimeSlice = Math.max(0, Math.min(this.tensor.T - 1, t));
    this.updateHeaderInfo();
    this.drawFrame();
  }

  setInterpolate(val) {
    this.interpolate = val;
    this.drawFrame();
  }

  highlightCell(t, i, j) {
    if (t === Math.round(this.activeTimeSlice) && i !== null && j !== null) {
      this.hoveredCell = { i, j };
    } else {
      this.hoveredCell = null;
    }
    this.drawFrame();
  }

  renderDOM() {
    this.container.innerHTML = `
      <div class="front-view-panel">
        <!-- Header -->
        <div class="front-view-header">
          <div class="panel-tag-group">
            <span class="panel-tag-accent">VIEW 1 &bull; 2D PROJECTION</span>
            <h3 class="panel-headline">Frontal Animation</h3>
          </div>
          <div class="front-slice-indicator" id="front-slice-tag">
            t = ${this.activeTimeSlice}
          </div>
        </div>

        <div class="front-view-subbar">
          <span class="front-math-label">Plane: \\(\\mathcal{T}[t, :, :] \\in \\mathbb{R}^{${this.tensor.H} \\times ${this.tensor.W}}\\)</span>
          <div class="front-view-toggles">
            <button class="icon-toggle-pill ${this.interpolate ? 'active' : ''}" id="front-interp-toggle" title="Toggle bilinear color smoothing">
              Smooth
            </button>
          </div>
        </div>

        <!-- Canvas Monitor Screen Container -->
        <div class="screen-monitor-box">
          <div class="monitor-glare"></div>
          <canvas id="front-view-canvas" class="front-canvas"></canvas>
          <div class="screen-scanline"></div>
          
          <!-- Hover HUD Overlay on Canvas -->
          <div class="front-hud-tooltip hidden" id="front-canvas-tooltip">
            <span class="tooltip-index" id="tooltip-idx">[0, 0]</span>
            <span class="tooltip-val" id="tooltip-val">0.00</span>
          </div>
        </div>

        <!-- Matrix Dimensions & Coordinate Axes Info -->
        <div class="front-axis-info">
          <div class="axis-guide-row">
            <span class="guide-axis-y">&uarr; Row Axis (i = 0 &hellip; ${this.tensor.H - 1})</span>
            <span class="guide-axis-x">Col Axis (j = 0 &hellip; ${this.tensor.W - 1}) &rarr;</span>
          </div>
        </div>

        <!-- Quick Time-Slice Progress Bar -->
        <div class="front-timeline-strip">
          <div class="strip-header">
            <span>Time Dimension Progress</span>
            <span id="front-time-pct">${((this.activeTimeSlice / (this.tensor.T - 1 || 1)) * 100).toFixed(0)}%</span>
          </div>
          <div class="strip-track">
            <div class="strip-fill" id="front-strip-fill" style="width: ${((this.activeTimeSlice / (this.tensor.T - 1 || 1)) * 100)}%;"></div>
          </div>
        </div>

        <!-- Educational Hint Box -->
        <div class="front-hint-box">
          <div class="hint-icon">💡</div>
          <p class="hint-text">
            This frontal view displays the 2D video/matrix snapshot at the current time second \\(t\\). 
            Watch how values ripple across the spatial grid as playback advances!
          </p>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  initCanvas() {
    this.canvas = this.container.querySelector('#front-view-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    this.resizeCanvas();
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.drawFrame();
    });
  }

  resizeCanvas() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.min(rect.width - 24, 340);

    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;

    this.ctx.scale(dpr, dpr);
    this.displaySize = size;
  }

  bindEvents() {
    const toggleBtn = this.container.querySelector('#front-interp-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        this.setInterpolate(!this.interpolate);
        toggleBtn.classList.toggle('active', this.interpolate);
      });
    }

    const canvas = this.container.querySelector('#front-view-canvas');
    const tooltip = this.container.querySelector('#front-canvas-tooltip');
    const tooltipIdx = this.container.querySelector('#tooltip-idx');
    const tooltipVal = this.container.querySelector('#tooltip-val');

    if (canvas) {
      canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const cellW = rect.width / this.tensor.W;
        const cellH = rect.height / this.tensor.H;

        const j = Math.max(0, Math.min(this.tensor.W - 1, Math.floor(mouseX / cellW)));
        const i = Math.max(0, Math.min(this.tensor.H - 1, Math.floor(mouseY / cellH)));

        this.hoveredCell = { i, j };
        this.drawFrame();

        const currentT = Math.round(this.activeTimeSlice);
        const val = this.tensor.get(currentT, i, j);

        if (tooltip) {
          tooltip.classList.remove('hidden');
          tooltip.style.left = `${Math.min(rect.width - 90, Math.max(10, mouseX - 35))}px`;
          tooltip.style.top = `${Math.max(10, mouseY - 45)}px`;
          tooltipIdx.textContent = `T[${currentT}, ${i}, ${j}]`;
          tooltipVal.textContent = (val >= 0 ? '+' : '') + val.toFixed(3);
        }

        if (this.onCellHover) this.onCellHover(currentT, i, j);
      });

      canvas.addEventListener('mouseleave', () => {
        this.hoveredCell = null;
        this.drawFrame();
        if (tooltip) tooltip.classList.add('hidden');
        if (this.onCellHover) this.onCellHover(null, null, null);
      });

      canvas.addEventListener('click', (e) => {
        if (!this.hoveredCell) return;
        const currentT = Math.round(this.activeTimeSlice);
        if (this.onCellSelect) this.onCellSelect(currentT, this.hoveredCell.i, this.hoveredCell.j);
      });
    }
  }

  updateHeaderInfo() {
    const tag = this.container.querySelector('#front-slice-tag');
    const fill = this.container.querySelector('#front-strip-fill');
    const pct = this.container.querySelector('#front-time-pct');

    const currentT = Math.round(this.activeTimeSlice);
    if (tag) tag.textContent = `t = ${currentT}`;

    const progress = (this.activeTimeSlice / (this.tensor.T - 1 || 1)) * 100;
    if (fill) fill.style.width = `${progress}%`;
    if (pct) pct.textContent = `${progress.toFixed(0)}%`;
  }

  drawFrame() {
    if (!this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    const size = this.displaySize || 300;
    const { H, W } = this.tensor;
    const stats = this.tensor.stats();
    const currentT = Math.round(this.activeTimeSlice);

    ctx.clearRect(0, 0, size, size);

    const cellW = size / W;
    const cellH = size / H;

    if (this.interpolate) {
      // Smooth interpolated rendering via offscreen canvas
      const offCanvas = document.createElement('canvas');
      offCanvas.width = W;
      offCanvas.height = H;
      const offCtx = offCanvas.getContext('2d');
      const imgData = offCtx.createImageData(W, H);

      for (let i = 0; i < H; i++) {
        for (let j = 0; j < W; j++) {
          const val = this.tensor.get(currentT, i, j);
          const norm = normalizeValue(val, stats.min, stats.max);
          const c = getColorForNorm(norm, this.colormap);
          const pixelIdx = (i * W + j) * 4;
          imgData.data[pixelIdx] = Math.round(c.r * 255);
          imgData.data[pixelIdx + 1] = Math.round(c.g * 255);
          imgData.data[pixelIdx + 2] = Math.round(c.b * 255);
          imgData.data[pixelIdx + 3] = 255;
        }
      }
      offCtx.putImageData(imgData, 0, 0);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(offCanvas, 0, 0, size, size);

      // Draw subtle grid overlay
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      for (let j = 0; j <= W; j++) {
        ctx.beginPath();
        ctx.moveTo(j * cellW, 0);
        ctx.lineTo(j * cellW, size);
        ctx.stroke();
      }
      for (let i = 0; i <= H; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * cellH);
        ctx.lineTo(size, i * cellH);
        ctx.stroke();
      }
    } else {
      // Discrete high-contrast pixel block grid
      for (let i = 0; i < H; i++) {
        for (let j = 0; j < W; j++) {
          const val = this.tensor.get(currentT, i, j);
          const norm = normalizeValue(val, stats.min, stats.max);
          const hex = getHexColor(norm, this.colormap);

          const x = j * cellW;
          const y = i * cellH;

          // Fill cell
          ctx.fillStyle = hex;
          ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);

          // Value number label if cells are large enough
          if (cellW > 38 && cellH > 38) {
            ctx.fillStyle = norm > 0.45 && norm < 0.85 ? '#000000' : '#ffffff';
            ctx.font = `600 ${Math.max(9, Math.min(13, cellW * 0.24))}px JetBrains Mono, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(val.toFixed(2), x + cellW / 2, y + cellH / 2);
          }
        }
      }
    }

    // Highlight hovered cell
    if (this.hoveredCell) {
      const { i, j } = this.hoveredCell;
      const hx = j * cellW;
      const hy = i * cellH;

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 10;
      ctx.strokeRect(hx + 1.5, hy + 1.5, cellW - 3, cellH - 3);
      ctx.shadowBlur = 0;
    }
  }
}
