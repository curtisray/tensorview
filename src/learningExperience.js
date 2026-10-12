import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class LearningExperience {
  constructor(overlayContainer, onCloseCallback) {
    this.overlay = overlayContainer;
    this.onClose = onCloseCallback;
    this.currentStep = 0;

    // Three.js instances
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.animId = null;
    this.stepGroup = null; // Group containing objects specific to current step

    // Step state values (reactive)
    this.state = {
      // Step 0: Scalar
      scalarVal: 3.5,
      // Step 1: Vector
      vectorCoords: [2.5, 3.0, 1.5],
      // Step 2: Matrix
      matrixSpread: 1.0,
      matrixData: [
        [1.5, 0.5, 0.0],
        [0.2, 2.0, 0.8],
        [0.0, 0.4, 1.8],
      ],
      // Step 3: Tensor Stacking
      tensorStackProgress: 0.65, // 0 = fully separated sheets, 1 = fused cube
      // Step 4: Slices & Fibers
      selectedExtraction: 'fiber', // 'fiber' | 'slice' | 'element'
      fiberCoords: { i: 1, j: 1 },
      sliceIdx: 1,
    };

    this.steps = [
      {
        id: 'scalar',
        rank: 0,
        title: 'Rank-0 Tensor: The Scalar',
        subtitle: 'Pure magnitude with zero spatial direction',
      },
      {
        id: 'vector',
        rank: 1,
        title: 'Rank-1 Tensor: The Vector',
        subtitle: 'A directed arrow in 1D/3D coordinate space',
      },
      {
        id: 'matrix',
        rank: 2,
        title: 'Rank-2 Tensor: The Matrix',
        subtitle: 'Stacking vectors into 2D planes & linear transformations',
      },
      {
        id: 'tensor',
        rank: 3,
        title: 'Rank-3 Tensor: The Volumetric Cube',
        subtitle: 'Stacking 2D matrices across a third axis (Time / Depth)',
      },
      {
        id: 'slicing',
        rank: 3,
        title: 'Tensor Slicing & Fibers',
        subtitle: 'How tensors break down into matrices, vectors, and scalars',
      },
    ];

    this.initDOM();
    this.initThree();
    this.loadStep(0);
  }

  initDOM() {
    this.overlay.innerHTML = `
      <div class="learning-container">
        <!-- Top Navigation Bar -->
        <header class="learning-topbar">
          <div class="learning-topbar-left">
            <button class="back-to-explorer-btn" id="learn-exit-btn">
              <span>&larr;</span> Back to Explorer
            </button>
            <div class="learning-step-badge">
              STEP <span id="current-step-num">1</span> OF ${this.steps.length}
            </div>
          </div>

          <div class="learning-progress-track">
            ${this.steps
              .map(
                (s, idx) => `
              <div class="progress-step-pill ${idx === 0 ? 'active' : ''}" data-step="${idx}">
                <span class="pill-dot"></span>
                <span class="pill-text">${s.title.split(':')[0]}</span>
              </div>
            `
              )
              .join('')}
          </div>

          <div class="learning-topbar-right">
            <span class="learning-keyboard-hint">Use ‹ and › keys to navigate</span>
          </div>
        </header>

        <!-- Main Split Workspace -->
        <div class="learning-split-workspace">
          <!-- Left: Vector Space (3D Visualization) -->
          <div class="learning-vector-space" id="learn-three-viewport">
            <div class="vector-space-banner">
              <span class="banner-tag">GEOMETRIC VECTOR SPACE</span>
              <span class="banner-sub" id="vector-space-legend">Orbit &bull; Pan &bull; Zoom</span>
            </div>
          </div>

          <!-- Right: The Numbers (Math & Numerical Representation) -->
          <div class="learning-numbers-panel" id="learn-numbers-panel">
            <!-- Dynamically populated by renderNumbersPanel() -->
          </div>
        </div>
      </div>
    `;

    // Bind navigation buttons
    this.overlay.querySelector('#learn-exit-btn').addEventListener('click', () => {
      this.destroy();
      if (this.onClose) this.onClose();
    });

    const pills = this.overlay.querySelectorAll('.progress-step-pill');
    pills.forEach((p) => {
      p.addEventListener('click', () => {
        const step = parseInt(p.dataset.step, 10);
        this.loadStep(step);
      });
    });

    // Keyboard navigation
    this.keyListener = (e) => {
      if (e.key === 'ArrowRight' && this.currentStep < this.steps.length - 1) {
        this.loadStep(this.currentStep + 1);
      } else if (e.key === 'ArrowLeft' && this.currentStep > 0) {
        this.loadStep(this.currentStep - 1);
      }
    };
    window.addEventListener('keydown', this.keyListener);
  }

  initThree() {
    const viewport = this.overlay.querySelector('#learn-three-viewport');
    const width = viewport.clientWidth || 600;
    const height = viewport.clientHeight || 500;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070a12);
    this.scene.fog = new THREE.FogExp2(0x070a12, 0.04);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(4.5, 3.8, 6.0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    viewport.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.target.set(0, 0, 0);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(8, 10, 8);
    this.scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.8);
    rimLight.position.set(-6, -4, -6);
    this.scene.add(rimLight);

    // Group for objects
    this.stepGroup = new THREE.Group();
    this.scene.add(this.stepGroup);

    // Grid Floor
    const grid = new THREE.GridHelper(12, 12, 0x1e293b, 0x0f172a);
    grid.position.y = -1.8;
    this.scene.add(grid);

    // Loop
    const animate = () => {
      this.animId = requestAnimationFrame(animate);
      if (this.controls) this.controls.update();

      // Subtle rotation for vitality
      if (this.currentStep === 0) {
        // Pulse scalar sphere slightly
        const t = performance.now() * 0.002;
        const orb = this.stepGroup.getObjectByName('scalarOrb');
        if (orb) {
          const s = 1.0 + Math.sin(t) * 0.05;
          orb.scale.set(s, s, s);
        }
      }

      this.renderer.render(this.scene, this.camera);
    };
    animate();

    this.resizeListener = () => {
      if (!viewport || !this.renderer) return;
      const w = viewport.clientWidth;
      const h = viewport.clientHeight;
      if (w === 0 || h === 0) return;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', this.resizeListener);
  }

  loadStep(stepIndex) {
    this.currentStep = stepIndex;

    // Update Topbar
    this.overlay.querySelector('#current-step-num').textContent = stepIndex + 1;
    const pills = this.overlay.querySelectorAll('.progress-step-pill');
    pills.forEach((p, idx) => {
      p.classList.toggle('active', idx === stepIndex);
      p.classList.toggle('completed', idx < stepIndex);
    });

    // Clear 3D step group
    while (this.stepGroup.children.length > 0) {
      const c = this.stepGroup.children[0];
      this.stepGroup.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
        else c.material.dispose();
      }
    }

    // Build 3D vector space geometry & Right-side numbers panel
    switch (stepIndex) {
      case 0:
        this.buildStep0_Scalar();
        break;
      case 1:
        this.buildStep1_Vector();
        break;
      case 2:
        this.buildStep2_Matrix();
        break;
      case 3:
        this.buildStep3_Tensor();
        break;
      case 4:
        this.buildStep4_Slicing();
        break;
    }

    this.renderNumbersPanel();
    this.triggerMathJax();
  }

  // =========================================================================
  // STEP 0: THE SCALAR (RANK-0)
  // =========================================================================
  buildStep0_Scalar() {
    this.camera.position.set(0, 1.5, 5.5);
    this.controls.target.set(0, 0, 0);

    const val = this.state.scalarVal;
    const radius = 0.35 + Math.abs(val) * 0.18;

    // 1D Number Line Axis along X
    const axisGeo = new THREE.CylinderGeometry(0.02, 0.02, 6, 16);
    const axisMat = new THREE.MeshBasicMaterial({ color: 0x475569 });
    const axisMesh = new THREE.Mesh(axisGeo, axisMat);
    axisMesh.rotation.z = Math.PI / 2;
    this.stepGroup.add(axisMesh);

    // Number line tick marks
    for (let t = -3; t <= 3; t++) {
      const tickGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.25, 8);
      const tickMesh = new THREE.Mesh(tickGeo, axisMat);
      tickMesh.position.set(t, 0, 0);
      this.stepGroup.add(tickMesh);
    }

    // Glowing Scalar Orb
    const orbGeo = new THREE.SphereGeometry(radius, 32, 32);
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.1,
    });
    const orbMesh = new THREE.Mesh(orbGeo, orbMat);
    orbMesh.name = 'scalarOrb';
    orbMesh.position.set(val * 0.6, 0, 0);
    this.stepGroup.add(orbMesh);

    // Glow halo
    const haloGeo = new THREE.RingGeometry(radius * 1.1, radius * 1.35, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.copy(orbMesh.position);
    this.stepGroup.add(halo);
  }

  // =========================================================================
  // STEP 1: THE VECTOR (RANK-1)
  // =========================================================================
  buildStep1_Vector() {
    this.camera.position.set(4.0, 3.2, 5.0);
    this.controls.target.set(0, 1.0, 0);

    const [vx, vy, vz] = this.state.vectorCoords;
    const origin = new THREE.Vector3(0, 0, 0);
    const dir = new THREE.Vector3(vx, vy, vz);
    const length = dir.length();
    const normalizedDir = dir.clone().normalize();

    // 3D Coordinate Frame Axes
    const axisX = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, 3.8, 0xf43f5e, 0.25, 0.12);
    const axisY = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), origin, 3.8, 0x10b981, 0.25, 0.12);
    const axisZ = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), origin, 3.8, 0x38bdf8, 0.25, 0.12);
    this.stepGroup.add(axisX, axisY, axisZ);

    // Primary Vector Arrow
    const vectorArrow = new THREE.ArrowHelper(normalizedDir, origin, length, 0xfbbf24, 0.4, 0.22);
    this.stepGroup.add(vectorArrow);

    // Head sphere marker
    const headGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.set(vx, vy, vz);
    this.stepGroup.add(headMesh);

    // Dashed projection drop lines to the planes
    const points = [
      new THREE.Vector3(vx, vy, vz),
      new THREE.Vector3(vx, 0, vz), // Drop to floor
      new THREE.Vector3(0, 0, vz),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(vx, 0, 0),
      new THREE.Vector3(vx, 0, vz),
    ];
    const dropGeo = new THREE.BufferGeometry().setFromPoints(points);
    const dropMat = new THREE.LineDashedMaterial({
      color: 0x94a3b8,
      dashSize: 0.15,
      gapSize: 0.1,
      transparent: true,
      opacity: 0.6,
    });
    const dropLines = new THREE.Line(dropGeo, dropMat);
    dropLines.computeLineDistances();
    this.stepGroup.add(dropLines);
  }

  // =========================================================================
  // STEP 2: THE MATRIX (RANK-2)
  // =========================================================================
  buildStep2_Matrix() {
    this.camera.position.set(3.8, 3.5, 4.8);
    this.controls.target.set(0, 0, 0);

    const m = this.state.matrixData;
    const spacing = 0.85 * this.state.matrixSpread;
    const boxGeo = new THREE.BoxGeometry(0.65, 0.65, 0.15);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);

    // 2D Matrix sheet lying in the XY plane
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const val = m[r][c];
        const norm = Math.max(0, Math.min(1, val / 2.5));

        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(0.55 + norm * 0.35, 0.9, 0.5),
          roughness: 0.2,
          metalness: 0.1,
          transparent: true,
          opacity: 0.9,
        });

        const mesh = new THREE.Mesh(boxGeo, mat);
        mesh.position.set((c - 1) * spacing, (1 - r) * spacing, 0);

        const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
        mesh.add(new THREE.LineSegments(edgesGeo, edgeMat));

        this.stepGroup.add(mesh);
      }
    }

    // Sheet boundary frame
    const frameGeo = new THREE.BoxGeometry(3 * spacing + 0.2, 3 * spacing + 0.2, 0.25);
    const frameEdges = new THREE.EdgesGeometry(frameGeo);
    const frameLine = new THREE.LineSegments(
      frameEdges,
      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.7 })
    );
    this.stepGroup.add(frameLine);
  }

  // =========================================================================
  // STEP 3: THE TENSOR (RANK-3)
  // =========================================================================
  buildStep3_Tensor() {
    this.camera.position.set(5.2, 4.2, 5.8);
    this.controls.target.set(0, 0, 0);

    const tProg = this.state.tensorStackProgress; // 0 = separated sheets, 1 = fused cube
    const spacingXY = 0.75;
    const spacingZ = 0.75 + (1.0 - tProg) * 1.5; // Expands outward when separated

    const boxGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);

    // 3 sheets of 3x3 matrices = 27 voxels
    for (let t = 0; t < 3; t++) {
      const zPos = (t - 1) * spacingZ;

      // Glowing outline for each sheet
      const sheetFrameGeo = new THREE.BoxGeometry(3 * spacingXY + 0.1, 3 * spacingXY + 0.1, 0.68);
      const sheetFrameMat = new THREE.LineBasicMaterial({
        color: t === 0 ? 0x38bdf8 : t === 1 ? 0xa855f7 : 0xec4899,
        transparent: true,
        opacity: 0.8,
      });
      const sheetOutline = new THREE.LineSegments(new THREE.EdgesGeometry(sheetFrameGeo), sheetFrameMat);
      sheetOutline.position.set(0, 0, zPos);
      this.stepGroup.add(sheetOutline);

      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const val = Math.sin(t * 1.2 + i * 0.8 + j * 0.5) * 0.5 + 0.5;
          const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(0.55 + val * 0.4, 0.85, 0.5),
            roughness: 0.25,
            metalness: 0.1,
            transparent: true,
            opacity: 0.88,
          });

          const mesh = new THREE.Mesh(boxGeo, mat);
          mesh.position.set((j - 1) * spacingXY, (1 - i) * spacingXY, zPos);

          const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
          mesh.add(new THREE.LineSegments(edgesGeo, edgeMat));

          this.stepGroup.add(mesh);
        }
      }
    }
  }

  // =========================================================================
  // STEP 4: TENSOR SLICING & FIBERS
  // =========================================================================
  buildStep4_Slicing() {
    this.camera.position.set(5.2, 4.0, 5.6);
    this.controls.target.set(0, 0, 0);

    const mode = this.state.selectedExtraction;
    const spacing = 0.82;
    const boxGeo = new THREE.BoxGeometry(0.62, 0.62, 0.62);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);

    for (let t = 0; t < 3; t++) {
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          let isHighlighted = false;

          if (mode === 'fiber') {
            // Mode-1 Tube fiber: fixed i and j across all t
            isHighlighted = i === this.state.fiberCoords.i && j === this.state.fiberCoords.j;
          } else if (mode === 'slice') {
            // Frontal slice: fixed t
            isHighlighted = t === this.state.sliceIdx;
          } else if (mode === 'element') {
            // Single scalar element
            isHighlighted = t === 1 && i === 1 && j === 1;
          }

          const mat = new THREE.MeshStandardMaterial({
            color: isHighlighted ? (mode === 'fiber' ? 0xfbbf24 : 0xec4899) : 0x334155,
            emissive: isHighlighted ? (mode === 'fiber' ? 0xd97706 : 0xbe185d) : 0x000000,
            emissiveIntensity: isHighlighted ? 0.6 : 0,
            roughness: 0.25,
            metalness: 0.1,
            transparent: true,
            opacity: isHighlighted ? 1.0 : 0.15,
          });

          const mesh = new THREE.Mesh(boxGeo, mat);
          mesh.position.set((j - 1) * spacing, (1 - i) * spacing, (t - 1) * spacing);

          if (isHighlighted) {
            mesh.scale.set(1.12, 1.12, 1.12);
            const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
            mesh.add(new THREE.LineSegments(edgesGeo, edgeMat));
          } else {
            const edgeMat = new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.1 });
            mesh.add(new THREE.LineSegments(edgesGeo, edgeMat));
          }

          this.stepGroup.add(mesh);
        }
      }
    }
  }

  // =========================================================================
  // RIGHT PANEL: THE NUMBERS & INTERACTIVE CONTROLS
  // =========================================================================
  renderNumbersPanel() {
    const panel = this.overlay.querySelector('#learn-numbers-panel');
    const step = this.steps[this.currentStep];

    let contentHtml = '';

    if (this.currentStep === 0) {
      // Step 0: Scalar
      contentHtml = `
        <div class="learn-header-card">
          <div class="rank-indicator">RANK-0 TENSOR</div>
          <h2 class="learn-title">${step.title}</h2>
          <p class="learn-desc">
            A <strong>scalar</strong> is the simplest tensor: just a single number with <em>no direction</em> and <em>0 dimensions</em>.
          </p>
        </div>

        <div class="math-box-card">
          <div class="math-formula-large">\\(s \\in \\mathbb{R}\\)</div>
          <div class="math-legend">Dimension: \\(0\\) &bull; Coordinates required: \\(0\\)</div>
        </div>

        <!-- Interactive Numbers Box -->
        <div class="numbers-display-card">
          <div class="card-subtitle">The Numerical Value</div>
          <div class="single-scalar-value" id="scalar-val-display">${this.state.scalarVal.toFixed(2)}</div>
          
          <div class="learn-slider-group">
            <label>Drag to change scalar magnitude \\(s\\):</label>
            <input type="range" id="learn-scalar-slider" min="-5" max="5" step="0.1" value="${this.state.scalarVal}">
          </div>
        </div>

        <div class="analogy-card">
          <div class="analogy-title">💡 Physical Intuitions</div>
          <p>Temperature at a thermometer (\(72^\\circ\\text{F}\)), mass (\(12\\text{kg}\)), or time elapsed (\(5\\text{s}\)).</p>
        </div>
      `;
    } else if (this.currentStep === 1) {
      // Step 1: Vector
      const [vx, vy, vz] = this.state.vectorCoords;
      const mag = Math.sqrt(vx * vx + vy * vy + vz * vz).toFixed(2);
      contentHtml = `
        <div class="learn-header-card">
          <div class="rank-indicator">RANK-1 TENSOR</div>
          <h2 class="learn-title">${step.title}</h2>
          <p class="learn-desc">
            A <strong>vector</strong> has both <em>magnitude</em> and <em>direction</em>. In 3D space, we describe it using a 1D list of 3 coordinates.
          </p>
        </div>

        <div class="math-box-card">
          <div class="math-formula-large">\\(\\mathbf{v} = \\begin{bmatrix} v_1 \\\\ v_2 \\\\ v_3 \\end{bmatrix} \\in \\mathbb{R}^3\\)</div>
          <div class="math-legend">Dimension: \\(1\\) &bull; Mode-1 indices: \\(v_i\\) where \\(i \\in \\{1, 2, 3\\}\\)</div>
        </div>

        <!-- Interactive Numbers Box -->
        <div class="numbers-display-card">
          <div class="card-subtitle">Numerical Coordinates Vector</div>
          <div class="vector-columns-layout">
            <div class="vector-bracket">[</div>
            <div class="vector-elements">
              <div class="vec-item"><span class="vec-axis axis-x">x:</span> <span class="vec-val">${vx.toFixed(2)}</span></div>
              <div class="vec-item"><span class="vec-axis axis-y">y:</span> <span class="vec-val">${vy.toFixed(2)}</span></div>
              <div class="vec-item"><span class="vec-axis axis-z">z:</span> <span class="vec-val">${vz.toFixed(2)}</span></div>
            </div>
            <div class="vector-bracket">]</div>
          </div>
          <div class="vec-magnitude-badge">Magnitude: \\(|\\mathbf{v}\\| = ${mag}\\)</div>

          <div class="vector-sliders">
            <div class="slider-row">
              <span class="axis-pill x">X (v₁)</span>
              <input type="range" class="vec-slider" data-coord="0" min="-3" max="3" step="0.1" value="${vx}">
            </div>
            <div class="slider-row">
              <span class="axis-pill y">Y (v₂)</span>
              <input type="range" class="vec-slider" data-coord="1" min="0" max="3.5" step="0.1" value="${vy}">
            </div>
            <div class="slider-row">
              <span class="axis-pill z">Z (v₃)</span>
              <input type="range" class="vec-slider" data-coord="2" min="-3" max="3" step="0.1" value="${vz}">
            </div>
          </div>
        </div>

        <div class="analogy-card">
          <div class="analogy-title">💡 Physical Intuitions</div>
          <p>Wind velocity (speed + direction), 3D spatial velocity, or word embedding vectors in NLP.</p>
        </div>
      `;
    } else if (this.currentStep === 2) {
      // Step 2: Matrix
      const m = this.state.matrixData;
      contentHtml = `
        <div class="learn-header-card">
          <div class="rank-indicator">RANK-2 TENSOR</div>
          <h2 class="learn-title">${step.title}</h2>
          <p class="learn-desc">
            A <strong>matrix</strong> is formed by stacking vectors into a 2D grid. Each entry needs <em>two coordinates</em>: Row (\(i\)) and Column (\(j\)).
          </p>
        </div>

        <div class="math-box-card">
          <div class="math-formula-large">\\(M \\in \\mathbb{R}^{3 \\times 3}, \\quad M_{i,j}\\)</div>
          <div class="math-legend">Requires 2 indices: \\(i\\) (Rows) and \\(j\\) (Columns)</div>
        </div>

        <!-- Interactive Numbers Box -->
        <div class="numbers-display-card">
          <div class="card-subtitle">2D Numerical Matrix Table</div>
          <table class="learn-matrix-table">
            <thead>
              <tr><th></th><th>j=1</th><th>j=2</th><th>j=3</th></tr>
            </thead>
            <tbody>
              ${m
                .map(
                  (row, r) => `
                <tr>
                  <th>i=${r + 1}</th>
                  ${row.map((val) => `<td class="learn-mat-cell">${val.toFixed(2)}</td>`).join('')}
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>

          <div class="learn-slider-group">
            <label>Adjust Spatial Spread of 2D Grid:</label>
            <input type="range" id="learn-matrix-spread" min="0.5" max="1.5" step="0.05" value="${this.state.matrixSpread}">
          </div>
        </div>

        <div class="analogy-card">
          <div class="analogy-title">💡 Physical Intuitions</div>
          <p>A grayscale image (Height &times; Width pixels), stress/strain tensor in mechanics, or linear transformations that stretch space.</p>
        </div>
      `;
    } else if (this.currentStep === 3) {
      // Step 3: Tensor
      const tProg = this.state.tensorStackProgress;
      contentHtml = `
        <div class="learn-header-card">
          <div class="rank-indicator rank-3">RANK-3 TENSOR</div>
          <h2 class="learn-title">${step.title}</h2>
          <p class="learn-desc">
            A <strong>rank-3 tensor</strong> is formed by stacking multiple 2D matrices along a <em>third dimension</em> (such as Time, Depth, or Channels).
          </p>
        </div>

        <div class="math-box-card">
          <div class="math-formula-large">\\(\\mathcal{T} \\in \\mathbb{R}^{3 \\times 3 \\times 3}, \\quad \\mathcal{T}_{t,i,j}\\)</div>
          <div class="math-legend">Three indices: \\(t\\) (Time/Depth), \\(i\\) (Rows), \\(j\\) (Columns)</div>
        </div>

        <!-- Interactive Stacking Slider -->
        <div class="numbers-display-card">
          <div class="card-subtitle">Interactive Sheet Stacking Demonstration</div>
          <div class="sheet-stack-slider-box">
            <div class="stack-slider-labels">
              <span>Separated 2D Matrices</span>
              <span>Unified 3D Tensor Cube</span>
            </div>
            <input type="range" id="learn-stack-slider" min="0" max="1" step="0.01" value="${tProg}">
          </div>

          <div class="stacked-matrices-preview">
            <div class="sheet-pill sheet-0">Sheet 1: \\(T[0, :, :]\\)</div>
            <div class="sheet-pill sheet-1">Sheet 2: \\(T[1, :, :]\\)</div>
            <div class="sheet-pill sheet-2">Sheet 3: \\(T[2, :, :]\\)</div>
          </div>
        </div>

        <div class="analogy-card">
          <div class="analogy-title">💡 Physical Intuitions</div>
          <p>Video clip (Time &times; Height &times; Width), Color image (RGB channels &times; Height &times; Width), or 3D Medical MRI scans.</p>
        </div>
      `;
    } else if (this.currentStep === 4) {
      // Step 4: Slicing & Fibers
      const mode = this.state.selectedExtraction;
      contentHtml = `
        <div class="learn-header-card">
          <div class="rank-indicator rank-3">TENSOR SLICING & FIBERS</div>
          <h2 class="learn-title">${step.title}</h2>
          <p class="learn-desc">
            How do we inspect the inside of a 3D tensor? We fix one or more indices to extract <strong>slices (2D matrices)</strong> or <strong>fibers (1D vectors)</strong>.
          </p>
        </div>

        <div class="extraction-selector-row">
          <button class="extract-btn ${mode === 'fiber' ? 'active' : ''}" data-mode="fiber">
            Extract 1D Fiber \\(\\mathcal{T}[:, i, j]\\)
          </button>
          <button class="extract-btn ${mode === 'slice' ? 'active' : ''}" data-mode="slice">
            Extract 2D Slice \\(\\mathcal{T}[t, :, :]\\)
          </button>
          <button class="extract-btn ${mode === 'element' ? 'active' : ''}" data-mode="element">
            Extract Scalar \\(\\mathcal{T}[t, i, j]\\)
          </button>
        </div>

        <div class="numbers-display-card">
          <div class="card-subtitle">Multilinear Extraction Summary</div>
          ${
            mode === 'fiber'
              ? `
            <div class="extraction-detail">
              <span class="extract-highlight-badge">1D Tube Fiber (Rank 1 Vector)</span>
              <p>Fixing row \\(i=1\\) and col \\(j=1\\) pierces straight through time \\(t\\), yielding a 1D vector of numbers across seconds!</p>
              <div class="extracted-values-box">\\(\\mathbf{v} = [\\mathcal{T}_{0,1,1}, \\; \\mathcal{T}_{1,1,1}, \\; \\mathcal{T}_{2,1,1}]^T\\)</div>
            </div>
          `
              : mode === 'slice'
              ? `
            <div class="extraction-detail">
              <span class="extract-highlight-badge">2D Frontal Slice (Rank 2 Matrix)</span>
              <p>Fixing time slice \\(t=1\\) cuts out an entire 2D matrix representing that instant in time.</p>
              <div class="extracted-values-box">\\(M = \\mathcal{T}[1, :, :] \\in \\mathbb{R}^{3 \\times 3}\\)</div>
            </div>
          `
              : `
            <div class="extraction-detail">
              <span class="extract-highlight-badge">0D Element (Rank 0 Scalar)</span>
              <p>Fixing all three indices selects a single point value in the 3D grid.</p>
              <div class="extracted-values-box">\\(s = \\mathcal{T}[1, 1, 1] \\in \\mathbb{R}\\)</div>
            </div>
          `
          }
        </div>

        <div class="completion-banner">
          <div class="completion-title">🎉 You Understand Rank-3 Tensors!</div>
          <p>You're ready to explore custom mathematical wave equations, colormaps, and time animations in the main explorer.</p>
          <button class="primary-btn pulse-glow" id="launch-full-explorer-btn">Launch 3D Explorer &rarr;</button>
        </div>
      `;
    }

    // Step navigation footer
    contentHtml += `
      <div class="learning-nav-footer">
        <button class="secondary-btn" id="learn-prev-btn" ${this.currentStep === 0 ? 'disabled' : ''}>
          &larr; Previous Step
        </button>
        ${
          this.currentStep < this.steps.length - 1
            ? `<button class="primary-btn" id="learn-next-btn">Next Step &rarr;</button>`
            : `<button class="primary-btn" id="learn-finish-btn">Finish Tutorial</button>`
        }
      </div>
    `;

    panel.innerHTML = contentHtml;
    this.bindNumbersPanelInteractions();
  }

  bindNumbersPanelInteractions() {
    const panel = this.overlay.querySelector('#learn-numbers-panel');

    // Prev / Next
    const prevBtn = panel.querySelector('#learn-prev-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.currentStep > 0) this.loadStep(this.currentStep - 1);
      });
    }

    const nextBtn = panel.querySelector('#learn-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (this.currentStep < this.steps.length - 1) this.loadStep(this.currentStep + 1);
      });
    }

    const finishBtn = panel.querySelector('#learn-finish-btn');
    if (finishBtn) {
      finishBtn.addEventListener('click', () => {
        this.destroy();
        if (this.onClose) this.onClose();
      });
    }

    const launchBtn = panel.querySelector('#launch-full-explorer-btn');
    if (launchBtn) {
      launchBtn.addEventListener('click', () => {
        this.destroy();
        if (this.onClose) this.onClose();
      });
    }

    // Step 0: Scalar slider
    const scalarSlider = panel.querySelector('#learn-scalar-slider');
    if (scalarSlider) {
      scalarSlider.addEventListener('input', (e) => {
        this.state.scalarVal = parseFloat(e.target.value);
        const display = panel.querySelector('#scalar-val-display');
        if (display) display.textContent = this.state.scalarVal.toFixed(2);
        this.buildStep0_Scalar();
      });
    }

    // Step 1: Vector sliders
    const vecSliders = panel.querySelectorAll('.vec-slider');
    vecSliders.forEach((slider) => {
      slider.addEventListener('input', (e) => {
        const coordIdx = parseInt(e.target.dataset.coord, 10);
        this.state.vectorCoords[coordIdx] = parseFloat(e.target.value);
        this.buildStep1_Vector();
        this.renderNumbersPanel();
        this.triggerMathJax();
      });
    });

    // Step 2: Matrix spread
    const matrixSpreadSlider = panel.querySelector('#learn-matrix-spread');
    if (matrixSpreadSlider) {
      matrixSpreadSlider.addEventListener('input', (e) => {
        this.state.matrixSpread = parseFloat(e.target.value);
        this.buildStep2_Matrix();
      });
    }

    // Step 3: Tensor Stacking slider
    const stackSlider = panel.querySelector('#learn-stack-slider');
    if (stackSlider) {
      stackSlider.addEventListener('input', (e) => {
        this.state.tensorStackProgress = parseFloat(e.target.value);
        this.buildStep3_Tensor();
      });
    }

    // Step 4: Extraction buttons
    const extractBtns = panel.querySelectorAll('.extract-btn');
    extractBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.state.selectedExtraction = btn.dataset.mode;
        this.buildStep4_Slicing();
        this.renderNumbersPanel();
        this.triggerMathJax();
      });
    });
  }

  triggerMathJax() {
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise().catch(() => {});
    }
  }

  destroy() {
    if (this.animId) cancelAnimationFrame(this.animId);
    if (this.keyListener) window.removeEventListener('keydown', this.keyListener);
    if (this.resizeListener) window.removeEventListener('resize', this.resizeListener);
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.remove();
    }
  }
}
