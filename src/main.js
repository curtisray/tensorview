import './style.css';
import { Rank3Tensor } from './tensor.js';
import { TensorThreeScene } from './threeScene.js';
import { DatasetView } from './datasetView.js';
import { COLORMAPS, normalizeValue } from './colormaps.js';
import { LearningExperience } from './learningExperience.js';
import { FrontView } from './frontView.js';

// Application State
const state = {
  tensor: null,
  threeScene: null,
  datasetView: null,
  frontView: null,
  learningExpInstance: null,
  isPlaying: false,
  currentTime: 0,
  playbackSpeed: 1.0, // Seconds per slice multiplier
  isLooping: true,
  colormap: 'plasma',
  modalDimensions: { T: 4, H: 4, W: 4 },
  animationTimer: null,
  lastAnimTimestamp: 0,
};

function init() {
  // 1. Initialize Tensor Model
  state.tensor = new Rank3Tensor(4, 4, 4);

  // 2. Initialize Front View (Left: 2D Frontal Animation)
  const frontContainer = document.getElementById('front-view-container');
  state.frontView = new FrontView(frontContainer, state.tensor, {
    colormap: state.colormap,
  });

  // 3. Initialize Three.js Volumetric Cube Scene (Center: 3D Space)
  const threeContainer = document.getElementById('three-container');
  state.threeScene = new TensorThreeScene(threeContainer, state.tensor, {
    colormap: state.colormap,
  });

  // 4. Initialize Dataset View (Right: Editing / Numbers Panel)
  const datasetContainer = document.getElementById('dataset-container');
  state.datasetView = new DatasetView(datasetContainer, state.tensor, {
    colormap: state.colormap,
  });

  // 4. Setup Bi-directional Sync
  setupInteractivitySync();

  // 5. Setup UI Event Listeners
  setupHeaderControls();
  setupPlaybackControls();
  setupCameraControls();
  setupSliceFilters();
  setupModals();
  setupCustomFormula();

  // Initial UI Sync
  updateTimeUI(0);
  triggerMathJax();
}

/**
 * Bi-directional interactivity between 3D scene and Dataset table
 */
function setupInteractivitySync() {
  const hudInspector = document.getElementById('hud-inspector');
  const hudContent = document.getElementById('hud-content');

  const updateHUD = (t, i, j, val, isLocked = false) => {
    if (t === null || i === null || j === null) {
      hudInspector.className = 'hud-card idle';
      hudContent.innerHTML = `<span class="hud-prompt">Hover or click any 3D voxel or dataset cell to inspect</span>`;
      return;
    }

    const stats = state.tensor.stats();
    const norm = normalizeValue(val, stats.min, stats.max);
    const pct = (norm * 100).toFixed(0);

    hudInspector.className = `hud-card ${isLocked ? 'locked' : 'active'}`;
    hudContent.innerHTML = `
      <div class="hud-index-badge">
        <span>\\(\\mathcal{T}[${t}, ${i}, ${j}]\\)</span>
        ${isLocked ? '<span style="font-size: 0.65rem; color: #ec4899; text-transform: uppercase;">[Locked]</span>' : ''}
      </div>
      <div class="hud-value-row">
        <span class="hud-value-num">${val >= 0 ? '+' : ''}${val.toFixed(3)}</span>
        <span style="font-size: 0.72rem; color: #94a3b8;">(${pct}% intensity)</span>
      </div>
      <div class="hud-intensity-bar">
        <div class="hud-intensity-fill" style="width: ${pct}%;"></div>
      </div>
      <div style="font-size: 0.7rem; color: #64748b; margin-top: 3px;">
        Slice: Time t=${t} &bull; Row i=${i} &bull; Col j=${j}
      </div>
    `;
    triggerMathJax();
  };

  // Three.js -> Dataset View & Front View
  state.threeScene.onHoverCallback = (hit) => {
    if (!hit) {
      if (!state.threeScene.selectedVoxel) {
        updateHUD(null, null, null);
      }
      state.datasetView.highlightCell(null, null, null);
      if (state.frontView) state.frontView.highlightCell(null, null, null);
    } else {
      updateHUD(hit.t, hit.i, hit.j, hit.val, false);
      state.datasetView.highlightCell(hit.t, hit.i, hit.j);
      if (state.frontView) state.frontView.highlightCell(hit.t, hit.i, hit.j);
    }
  };

  state.threeScene.onSelectCallback = (selected) => {
    if (!selected) {
      state.datasetView.selectCell(null, null, null);
      updateHUD(null, null, null);
    } else {
      const val = state.tensor.get(selected.t, selected.i, selected.j);
      state.datasetView.selectCell(selected.t, selected.i, selected.j);
      updateHUD(selected.t, selected.i, selected.j, val, true);
    }
  };

  // Dataset View -> Three.js & Front View
  state.datasetView.onCellHover = (t, i, j) => {
    state.threeScene.highlightVoxel(t, i, j);
    if (state.frontView) state.frontView.highlightCell(t, i, j);
    if (t !== null) {
      const val = state.tensor.get(t, i, j);
      updateHUD(t, i, j, val, false);
    } else if (!state.threeScene.selectedVoxel) {
      updateHUD(null, null, null);
    }
  };

  state.datasetView.onCellSelect = (t, i, j) => {
    state.threeScene.selectVoxel(t, i, j);
    if (t !== null) {
      const val = state.tensor.get(t, i, j);
      updateHUD(t, i, j, val, true);
    } else {
      updateHUD(null, null, null);
    }
  };

  // Front View -> Three.js & Dataset View
  if (state.frontView) {
    state.frontView.onCellHover = (t, i, j) => {
      state.threeScene.highlightVoxel(t, i, j);
      state.datasetView.highlightCell(t, i, j);
      if (t !== null) {
        const val = state.tensor.get(t, i, j);
        updateHUD(t, i, j, val, false);
      } else if (!state.threeScene.selectedVoxel) {
        updateHUD(null, null, null);
      }
    };

    state.frontView.onCellSelect = (t, i, j) => {
      state.threeScene.selectVoxel(t, i, j);
      state.datasetView.selectCell(t, i, j);
      if (t !== null) {
        const val = state.tensor.get(t, i, j);
        updateHUD(t, i, j, val, true);
      } else {
        updateHUD(null, null, null);
      }
    };
  }

  // Dataset View Slice Change -> Sync Time Slider
  state.datasetView.onSliceSelect = (sliceIdx) => {
    if (state.datasetView.sliceMode === 0) {
      setTimeStep(sliceIdx);
    }
  };
}

/**
 * Header Controls (Presets, Colormaps, Shapes)
 */
function setupHeaderControls() {
  // Preset selector
  const presetSelect = document.getElementById('preset-select');
  const customFormulaBar = document.getElementById('custom-formula-bar');

  presetSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'custom') {
      customFormulaBar.classList.remove('hidden');
    } else {
      customFormulaBar.classList.add('hidden');
      state.tensor.applyPreset(val);
      state.threeScene.refreshColors();
      state.datasetView.updateValues();
      state.datasetView.updateStats();
      if (state.frontView) state.frontView.drawFrame();
    }
  });

  // Colormap selector
  const colormapSelect = document.getElementById('colormap-select');
  colormapSelect.addEventListener('change', (e) => {
    state.colormap = e.target.value;
    state.threeScene.setColormap(state.colormap);
    state.datasetView.setColormap(state.colormap);
    if (state.frontView) state.frontView.setColormap(state.colormap);
  });

  // Reset Camera View
  const resetCamBtn = document.getElementById('reset-cam-btn');
  resetCamBtn.addEventListener('click', () => {
    state.threeScene.setCameraIsometric();
    setActiveCameraPill('iso');
  });

  // Guided Learning Experience from Scratch
  const openLearningBtn = document.getElementById('open-learning-btn');
  const learningView = document.getElementById('learning-experience-view');

  openLearningBtn.addEventListener('click', () => {
    // Pause explorer playback if running
    if (state.isPlaying) togglePlayPause();

    learningView.classList.remove('hidden');
    state.learningExpInstance = new LearningExperience(learningView, () => {
      learningView.classList.add('hidden');
      state.learningExpInstance = null;
      // Trigger resize on main three scene
      if (state.threeScene) state.threeScene.onWindowResize();
    });
  });
}

/**
 * Camera preset pills
 */
function setupCameraControls() {
  const pills = document.querySelectorAll('.cam-pill');
  pills.forEach((pill) => {
    pill.addEventListener('click', () => {
      const preset = pill.dataset.preset;
      pills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');

      if (preset === 'iso') state.threeScene.setCameraIsometric();
      else if (preset === 'front') state.threeScene.setCameraFront();
      else if (preset === 'top') state.threeScene.setCameraTop();
      else if (preset === 'side') state.threeScene.setCameraSide();
    });
  });
}

function setActiveCameraPill(preset) {
  const pills = document.querySelectorAll('.cam-pill');
  pills.forEach((p) => {
    p.classList.toggle('active', p.dataset.preset === preset);
  });
}

/**
 * Time Animation & Playback Controls
 */
function setupPlaybackControls() {
  const playBtn = document.getElementById('play-pause-btn');
  const timeScrubber = document.getElementById('time-scrubber');
  const fpsSelect = document.getElementById('fps-select');
  const loopBtn = document.getElementById('loop-btn');

  // Play / Pause
  playBtn.addEventListener('click', () => {
    togglePlayPause();
  });

  // Time scrubber manual drag
  timeScrubber.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    setTimeStep(val);
  });

  // Playback speed
  fpsSelect.addEventListener('change', (e) => {
    state.playbackSpeed = parseFloat(e.target.value);
  });

  // Loop toggle
  loopBtn.addEventListener('click', () => {
    state.isLooping = !state.isLooping;
    loopBtn.classList.toggle('active', state.isLooping);
  });
}

function togglePlayPause() {
  state.isPlaying = !state.isPlaying;
  const playBtn = document.getElementById('play-pause-btn');

  if (state.isPlaying) {
    playBtn.innerHTML = '<span class="play-icon">❚❚</span>';
    playBtn.classList.add('playing');
    state.lastAnimTimestamp = performance.now();
    startPlaybackLoop();
  } else {
    playBtn.innerHTML = '<span class="play-icon">▶</span>';
    playBtn.classList.remove('playing');
    if (state.animationTimer) cancelAnimationFrame(state.animationTimer);
  }
}

function startPlaybackLoop() {
  let accumulatedTime = 0;

  const loop = (timestamp) => {
    if (!state.isPlaying) return;

    const delta = (timestamp - state.lastAnimTimestamp) / 1000;
    state.lastAnimTimestamp = timestamp;
    accumulatedTime += delta;

    // Time per slice frame in seconds
    const interval = 1.0 / state.playbackSpeed;

    if (accumulatedTime >= interval) {
      accumulatedTime = 0;
      let nextTime = state.currentTime + 1;

      if (nextTime >= state.tensor.T) {
        if (state.isLooping) {
          nextTime = 0;
        } else {
          togglePlayPause();
          return;
        }
      }
      setTimeStep(nextTime);
    }

    state.animationTimer = requestAnimationFrame(loop);
  };

  state.animationTimer = requestAnimationFrame(loop);
}

function setTimeStep(t) {
  state.currentTime = t;
  updateTimeUI(t);
  state.threeScene.setActiveTimeSlice(t);
  if (state.frontView) state.frontView.setTimeSlice(t);

  // If DatasetView is in frontal slice mode (mode 0), keep in sync
  if (state.datasetView.sliceMode === 0) {
    state.datasetView.setActiveSlice(t);
  }
}

function updateTimeUI(t) {
  const timeScrubber = document.getElementById('time-scrubber');
  const timeDisplay = document.getElementById('current-time-display');

  if (timeScrubber) {
    timeScrubber.max = state.tensor.T - 1;
    timeScrubber.value = t;
  }

  if (timeDisplay) {
    const seconds = (t * 1.0).toFixed(2);
    timeDisplay.textContent = `t = ${t} / ${state.tensor.T - 1} (${seconds}s)`;
  }
}

/**
 * 3D Viewport Dock Slice Filters & Sliders
 */
function setupSliceFilters() {
  // Explode slider
  const explodeSlider = document.getElementById('explode-slider');
  const explodeValue = document.getElementById('explode-value');
  explodeSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    explodeValue.textContent = val.toFixed(2);
    state.threeScene.setSliceSpacing(val);
  });

  // Ghost inactive toggle
  const ghostToggle = document.getElementById('ghost-toggle');
  ghostToggle.addEventListener('change', (e) => {
    state.threeScene.setGhostInactive(e.target.checked);
  });

  // Isolate current slice toggle
  const isolateToggle = document.getElementById('isolate-toggle');
  isolateToggle.addEventListener('change', (e) => {
    state.threeScene.setShowOnlyActiveSlice(e.target.checked);
  });
}

/**
 * Custom Math Expression Evaluation
 */
function setupCustomFormula() {
  const formulaInput = document.getElementById('custom-formula-input');
  const applyBtn = document.getElementById('apply-formula-btn');

  const applyFormula = () => {
    const expr = formulaInput.value.trim();
    if (!expr) return;
    state.tensor.customFormula = expr;
    state.tensor.applyPreset('custom', expr);
    state.threeScene.refreshColors();
    state.datasetView.updateValues();
    state.datasetView.updateStats();
    if (state.frontView) state.frontView.drawFrame();
  };

  applyBtn.addEventListener('click', applyFormula);
  formulaInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applyFormula();
  });
}

/**
 * Modals: Dimension Configuration and Math Guide
 */
function setupModals() {
  // Dimension Modal
  const dimModal = document.getElementById('dimension-modal');
  const openDimBtn = document.getElementById('dimension-modal-btn');
  const closeDimBtn = document.getElementById('close-dim-modal');
  const cancelDimBtn = document.getElementById('cancel-dim-btn');
  const applyDimBtn = document.getElementById('apply-dim-btn');
  const headerShapeDisplay = document.getElementById('header-shape-display');

  const valT = document.getElementById('dim-val-t');
  const valH = document.getElementById('dim-val-h');
  const valW = document.getElementById('dim-val-w');
  const modalTotal = document.getElementById('modal-total-elements');

  const syncModalVals = () => {
    valT.textContent = state.modalDimensions.T;
    valH.textContent = state.modalDimensions.H;
    valW.textContent = state.modalDimensions.W;
    const total = state.modalDimensions.T * state.modalDimensions.H * state.modalDimensions.W;
    modalTotal.textContent = total;
  };

  openDimBtn.addEventListener('click', () => {
    state.modalDimensions = {
      T: state.tensor.T,
      H: state.tensor.H,
      W: state.tensor.W,
    };
    syncModalVals();
    dimModal.classList.remove('hidden');
    triggerMathJax();
  });

  const closeDim = () => dimModal.classList.add('hidden');
  closeDimBtn.addEventListener('click', closeDim);
  cancelDimBtn.addEventListener('click', closeDim);

  // Stepper buttons
  const stepBtns = dimModal.querySelectorAll('.step-btn');
  stepBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const dim = btn.dataset.dim.toUpperCase();
      const delta = parseInt(btn.dataset.delta, 10);
      const current = state.modalDimensions[dim];
      const next = Math.max(2, Math.min(6, current + delta)); // Safe range 2 to 6
      state.modalDimensions[dim] = next;
      syncModalVals();
    });
  });

  // Apply dimensions
  applyDimBtn.addEventListener('click', () => {
    const { T, H, W } = state.modalDimensions;
    state.tensor.resize(T, H, W);
    state.threeScene.buildScene();
    headerShapeDisplay.innerHTML = `${T} &times; ${H} &times; ${W}`;
    setTimeStep(0);
    closeDim();
    triggerMathJax();
  });

  // Guide Modal
  const guideModal = document.getElementById('guide-modal');
  const openGuideBtn = document.getElementById('guide-modal-btn');
  const closeGuideBtn = document.getElementById('close-guide-modal');
  const gotItBtn = document.getElementById('got-it-guide-btn');

  openGuideBtn.addEventListener('click', () => {
    guideModal.classList.remove('hidden');
    triggerMathJax();
  });

  const closeGuide = () => guideModal.classList.add('hidden');
  closeGuideBtn.addEventListener('click', closeGuide);
  gotItBtn.addEventListener('click', closeGuide);

  // Close modals on clicking backdrop
  [dimModal, guideModal].forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });
}

function triggerMathJax() {
  if (window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetPromise().catch(() => {});
  }
}

// Start application on DOM ready
window.addEventListener('DOMContentLoaded', init);
