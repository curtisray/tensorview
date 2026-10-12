/**
 * Rank3Tensor: Core Mathematical Model for a 3rd-order tensor T \in R^(T x H x W)
 * Axes:
 *   t: Mode-1 (Time / Depth dimension), size T
 *   i: Mode-2 (Row / Height dimension), size H
 *   j: Mode-3 (Column / Width dimension), size W
 */
export class Rank3Tensor {
  constructor(T = 4, H = 4, W = 4) {
    this.T = T;
    this.H = H;
    this.W = W;
    this.data = new Float32Array(T * H * W);
    this.listeners = new Set();
    this.currentPreset = 'standing_wave';
    this.customFormula = 'sin(2 * PI * t / T - sqrt((x - W/2)**2 + (y - H/2)**2))';
    this.applyPreset(this.currentPreset);
  }

  get shape() {
    return [this.T, this.H, this.W];
  }

  get totalElements() {
    return this.T * this.H * this.W;
  }

  getIndex(t, i, j) {
    if (t < 0 || t >= this.T || i < 0 || i >= this.H || j < 0 || j >= this.W) {
      return -1;
    }
    return t * (this.H * this.W) + i * this.W + j;
  }

  get(t, i, j) {
    const idx = this.getIndex(t, i, j);
    if (idx === -1) return 0;
    return this.data[idx];
  }

  set(t, i, j, value) {
    const idx = this.getIndex(t, i, j);
    if (idx !== -1) {
      this.data[idx] = Number(value);
      this.notify('cell_updated', { t, i, j, value: this.data[idx] });
    }
  }

  /**
   * Resizes the tensor to new dimensions and repopulates
   */
  resize(T, H, W) {
    this.T = Math.max(2, Math.min(8, Math.floor(T)));
    this.H = Math.max(2, Math.min(8, Math.floor(H)));
    this.W = Math.max(2, Math.min(8, Math.floor(W)));
    this.data = new Float32Array(this.T * this.H * this.W);
    this.applyPreset(this.currentPreset);
    this.notify('shape_changed', { shape: this.shape });
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify(event, payload) {
    for (const listener of this.listeners) {
      try {
        listener(event, payload, this);
      } catch (err) {
        console.error('Tensor listener error:', err);
      }
    }
  }

  /**
   * Computes mathematical summary metrics
   */
  stats() {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let sumSq = 0;
    let zeroCount = 0;
    const len = this.data.length;

    for (let k = 0; k < len; k++) {
      const v = this.data[k];
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
      sumSq += v * v;
      if (Math.abs(v) < 1e-5) zeroCount++;
    }

    const mean = sum / len;
    let variance = 0;
    for (let k = 0; k < len; k++) {
      const diff = this.data[k] - mean;
      variance += diff * diff;
    }
    variance /= len;

    const frobeniusNorm = Math.sqrt(sumSq);
    const sparsity = (zeroCount / len) * 100;

    return {
      min: isFinite(min) ? min : 0,
      max: isFinite(max) ? max : 0,
      mean,
      std: Math.sqrt(variance),
      frobeniusNorm,
      sparsity,
      count: len,
    };
  }

  /**
   * Extracts a 2D matrix slice
   * mode 0 = frontal slice T[t, :, :]
   * mode 1 = horizontal slice T[:, i, :]
   * mode 2 = lateral slice T[:, :, j]
   */
  getSlice(mode, index) {
    if (mode === 0) {
      // Frontal slice: T[index, :, :] -> shape (H, W)
      const t = Math.max(0, Math.min(this.T - 1, index));
      const matrix = [];
      for (let i = 0; i < this.H; i++) {
        const row = [];
        for (let j = 0; j < this.W; j++) {
          row.push(this.get(t, i, j));
        }
        matrix.push(row);
      }
      return { matrix, rows: this.H, cols: this.W, sliceType: 'frontal', index: t, label: `T[${t}, :, :]` };
    } else if (mode === 1) {
      // Horizontal slice: T[:, index, :] -> shape (T, W)
      const i = Math.max(0, Math.min(this.H - 1, index));
      const matrix = [];
      for (let t = 0; t < this.T; t++) {
        const row = [];
        for (let j = 0; j < this.W; j++) {
          row.push(this.get(t, i, j));
        }
        matrix.push(row);
      }
      return { matrix, rows: this.T, cols: this.W, sliceType: 'horizontal', index: i, label: `T[:, ${i}, :]` };
    } else {
      // Lateral slice: T[:, :, index] -> shape (T, H)
      const j = Math.max(0, Math.min(this.W - 1, index));
      const matrix = [];
      for (let t = 0; t < this.T; t++) {
        const row = [];
        for (let i = 0; i < this.H; i++) {
          row.push(this.get(t, i, j));
        }
        matrix.push(row);
      }
      return { matrix, rows: this.T, cols: this.H, sliceType: 'lateral', index: j, label: `T[:, :, ${j}]` };
    }
  }

  /**
   * Interpolate between time slices for smooth visual transitions
   */
  interpolateAtTime(timeContinuous, i, j) {
    const t0 = Math.floor(timeContinuous) % this.T;
    const t1 = (t0 + 1) % this.T;
    const frac = timeContinuous - Math.floor(timeContinuous);
    const v0 = this.get(t0, i, j);
    const v1 = this.get(t1, i, j);
    return v0 + frac * (v1 - v0);
  }

  /**
   * Populate tensor with mathematical presets
   */
  applyPreset(presetName, customParam = null) {
    this.currentPreset = presetName;
    const { T, H, W } = this;
    const cx = (W - 1) / 2;
    const cy = (H - 1) / 2;

    for (let t = 0; t < T; t++) {
      for (let i = 0; i < H; i++) {
        for (let j = 0; j < W; j++) {
          let val = 0;
          const x = j;
          const y = i;
          const r = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
          const maxR = Math.sqrt(cx ** 2 + cy ** 2) || 1;
          const normR = r / maxR;
          const timeFrac = t / (T || 1);

          switch (presetName) {
            case 'standing_wave': {
              // 3D standing wave with spatial harmonics
              const phase = 2 * Math.PI * timeFrac;
              val = Math.sin(phase - 2.5 * normR) * Math.cos(1.2 * (x / W - 0.5) * Math.PI);
              break;
            }

            case 'heat_diffusion': {
              // Heat diffusing outwards from center as time t progresses
              const sigma = 0.5 + 1.2 * timeFrac;
              const amp = 1.0 / Math.sqrt(1 + timeFrac * 2);
              val = amp * Math.exp(-(r * r) / (2 * sigma * sigma));
              // rescale to [0, 1] range nicely
              break;
            }

            case 'traveling_pulse': {
              // Soliton wavepacket traversing the diagonal over time
              const targetX = (W - 1) * timeFrac;
              const targetY = (H - 1) * (1 - timeFrac);
              const distSq = (x - targetX) ** 2 + (y - targetY) ** 2;
              val = Math.exp(-distSq / 1.5) * 1.5 - 0.2;
              break;
            }

            case 'rotating_dipole': {
              // Rotating harmonic oscillator / vector field slice
              const angle = 2 * Math.PI * timeFrac;
              const rotX = Math.cos(angle) * (x - cx) - Math.sin(angle) * (y - cy);
              val = rotX / (maxR || 1);
              break;
            }

            case 'superdiagonal': {
              // Superdiagonal / CP-rank-1 Kronecker delta tensor (i == j == t)
              val = (t === i && i === j) ? 1.0 : (t === i || i === j) ? 0.2 : -0.1;
              break;
            }

            case 'random_normal': {
              // Box-Muller normal distribution
              const u1 = Math.random() || 0.001;
              const u2 = Math.random() || 0.001;
              val = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2) * 0.5;
              break;
            }

            case 'custom': {
              val = this.evaluateCustomFormula(t, i, j, customParam || this.customFormula);
              break;
            }

            default:
              val = Math.sin(t + i + j);
          }

          // Round to 3 decimal places for mathematical clarity
          this.data[this.getIndex(t, i, j)] = Math.round(val * 1000) / 1000;
        }
      }
    }

    this.notify('data_reset', { preset: presetName });
  }

  evaluateCustomFormula(t, i, j, expr) {
    try {
      const scope = {
        t,
        y: i,
        x: j,
        i,
        j,
        T: this.T,
        H: this.H,
        W: this.W,
        PI: Math.PI,
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        sqrt: Math.sqrt,
        exp: Math.exp,
        abs: Math.abs,
        pow: Math.pow,
        min: Math.min,
        max: Math.max,
        log: Math.log,
      };

      // Safe evaluation of sanitized math expression
      const func = new Function(...Object.keys(scope), `return (${expr});`);
      const res = Number(func(...Object.values(scope)));
      return isNaN(res) ? 0 : Math.max(-10, Math.min(10, res));
    } catch {
      return 0;
    }
  }
}
