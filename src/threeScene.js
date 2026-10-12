import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getColorForNorm, normalizeValue } from './colormaps.js';

export class TensorThreeScene {
  constructor(containerElement, tensor, options = {}) {
    this.container = containerElement;
    this.tensor = tensor;
    this.colormap = options.colormap || 'plasma';
    this.activeTimeSlice = 0;
    this.sliceSpacing = 0.45; // Separation along the time axis
    this.allSpacing = 0.15; // Spacing between individual elements
    this.ghostInactive = true;
    this.showOnlyActiveSlice = false;
    this.threshold = -Infinity; // Filter out voxels below threshold
    this.hoveredVoxel = null; // {t, i, j}
    this.selectedVoxel = null; // {t, i, j}

    // Callbacks
    this.onHoverCallback = null;
    this.onSelectCallback = null;

    // Three.js instances
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.voxelsGroup = null;
    this.sliceOutlineGroup = null;
    this.axesGroup = null;

    // Voxel mesh mapping: key `${t}_${i}_${j}` -> { mesh, edges, t, i, j }
    this.voxelMap = new Map();
    this.voxelMeshes = [];

    // Raycasting
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(-999, -999);

    // Animation & rendering
    this.animationFrameId = null;
    this.clock = new THREE.Clock();

    this.init();
    this.buildScene();
    this.setupEventListeners();
    this.startLoop();
  }

  init() {
    const width = this.container.clientWidth || 600;
    const height = this.container.clientHeight || 500;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0d14);
    this.scene.fog = new THREE.FogExp2(0x0a0d14, 0.035);

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.setCameraIsometric();

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // Orbit Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = 28;
    this.controls.target.set(0, 0, 0);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight1.position.set(8, 12, 10);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x6366f1, 0.6); // Indigo rim light
    dirLight2.position.set(-8, -6, -8);
    this.scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0x38bdf8, 1.2, 15); // Cyan accent light
    pointLight.position.set(0, 5, 0);
    this.scene.add(pointLight);

    // Groups
    this.voxelsGroup = new THREE.Group();
    this.scene.add(this.voxelsGroup);

    this.sliceOutlineGroup = new THREE.Group();
    this.scene.add(this.sliceOutlineGroup);

    this.axesGroup = new THREE.Group();
    this.scene.add(this.axesGroup);

    // Subtle dark grid floor for orientation
    const gridHelper = new THREE.GridHelper(16, 16, 0x1e293b, 0x0f172a);
    gridHelper.position.y = -3.2;
    this.scene.add(gridHelper);
  }

  setCameraIsometric() {
    this.camera.position.set(5.5, 4.5, 7.5);
    if (this.controls) this.controls.target.set(0, 0, 0);
  }

  setCameraFront() {
    // Looking straight at the Frontal slice (Time axis facing camera)
    this.camera.position.set(0, 0, 8.5);
    if (this.controls) this.controls.target.set(0, 0, 0);
  }

  setCameraTop() {
    // Looking down from above
    this.camera.position.set(0, 8.5, 0.01);
    if (this.controls) this.controls.target.set(0, 0, 0);
  }

  setCameraSide() {
    // Looking from the lateral side
    this.camera.position.set(8.5, 0, 0);
    if (this.controls) this.controls.target.set(0, 0, 0);
  }

  /**
   * Builds all voxel 3D meshes based on tensor shape and data
   */
  buildScene() {
    // Clear existing
    while (this.voxelsGroup.children.length > 0) {
      const child = this.voxelsGroup.children[0];
      this.voxelsGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    }
    this.voxelMap.clear();
    this.voxelMeshes = [];

    const [T, H, W] = this.tensor.shape;
    const stats = this.tensor.stats();
    const voxelSize = 0.7;
    const boxGeometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
    const edgesGeometry = new THREE.EdgesGeometry(boxGeometry);

    for (let t = 0; t < T; t++) {
      for (let i = 0; i < H; i++) {
        for (let j = 0; j < W; j++) {
          const val = this.tensor.get(t, i, j);
          const norm = normalizeValue(val, stats.min, stats.max);
          const color = getColorForNorm(norm, this.colormap);

          // Rich physical/standard material for voxels
          const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(color.r, color.g, color.b),
            roughness: 0.25,
            metalness: 0.1,
            transparent: true,
            opacity: 0.88,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
          });

          const mesh = new THREE.Mesh(boxGeometry, material);
          mesh.userData = { t, i, j, val, baseColor: new THREE.Color(color.r, color.g, color.b) };

          // Glowing wireframe border lines
          const edgeMaterial = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.35,
          });
          const edges = new THREE.LineSegments(edgesGeometry, edgeMaterial);
          mesh.add(edges);

          this.voxelsGroup.add(mesh);
          this.voxelMeshes.push(mesh);
          this.voxelMap.set(`${t}_${i}_${j}`, { mesh, edges, material, edgeMaterial, t, i, j });
        }
      }
    }

    this.updateVoxelPositions();
    this.updateSliceIndicator();
    this.updateAxesLabels();
    this.applyVoxelVisualStates();
  }

  /**
   * Computes 3D coordinates of each voxel based on spacing & explosion slider
   */
  updateVoxelPositions() {
    const [T, H, W] = this.tensor.shape;
    const voxelSize = 0.7;
    const baseSpacing = voxelSize + this.allSpacing;
    const timeSliceSpacing = voxelSize + this.allSpacing + this.sliceSpacing * 1.5;

    // Center offsets
    const totalW = (W - 1) * baseSpacing;
    const totalH = (H - 1) * baseSpacing;
    const totalT = (T - 1) * timeSliceSpacing;

    for (let t = 0; t < T; t++) {
      for (let i = 0; i < H; i++) {
        for (let j = 0; j < W; j++) {
          const item = this.voxelMap.get(`${t}_${i}_${j}`);
          if (!item) continue;

          // X is column j (left to right)
          // Y is row i (inverted so i=0 is top)
          // Z is time t (front to back)
          const posX = j * baseSpacing - totalW / 2;
          const posY = (H - 1 - i) * baseSpacing - totalH / 2;
          const posZ = t * timeSliceSpacing - totalT / 2;

          item.mesh.position.set(posX, posY, posZ);
        }
      }
    }
  }

  /**
   * Refreshes voxel colors when values or colormap change
   */
  refreshColors() {
    const stats = this.tensor.stats();
    for (const [key, item] of this.voxelMap.entries()) {
      const val = this.tensor.get(item.t, item.i, item.j);
      const norm = normalizeValue(val, stats.min, stats.max);
      const color = getColorForNorm(norm, this.colormap);

      item.mesh.userData.val = val;
      item.mesh.userData.baseColor.setRGB(color.r, color.g, color.b);
      item.material.color.setRGB(color.r, color.g, color.b);
    }
    this.applyVoxelVisualStates();
  }

  /**
   * Highlights, opacity, and ghosting depending on active time slice and hover/selection
   */
  applyVoxelVisualStates() {
    const currentActiveT = Math.round(this.activeTimeSlice);

    for (const [key, item] of this.voxelMap.entries()) {
      const { t, i, j } = item;
      const isSliceActive = t === currentActiveT;
      const isHovered = this.hoveredVoxel && this.hoveredVoxel.t === t && this.hoveredVoxel.i === i && this.hoveredVoxel.j === j;
      const isSelected = this.selectedVoxel && this.selectedVoxel.t === t && this.selectedVoxel.i === i && this.selectedVoxel.j === j;

      // Filter by threshold
      if (item.mesh.userData.val < this.threshold) {
        item.mesh.visible = false;
        continue;
      }

      // Filter by "only active slice"
      if (this.showOnlyActiveSlice && !isSliceActive) {
        item.mesh.visible = false;
        continue;
      }
      item.mesh.visible = true;

      // Reset base color
      item.material.color.copy(item.mesh.userData.baseColor);

      if (isHovered || isSelected) {
        // Pop and glow
        item.mesh.scale.set(1.18, 1.18, 1.18);
        item.material.opacity = 1.0;
        item.material.emissive.set(isSelected ? 0xff007f : 0x00f0ff);
        item.material.emissiveIntensity = 0.55;
        item.edgeMaterial.color.set(0xffffff);
        item.edgeMaterial.opacity = 1.0;
        item.edgeMaterial.linewidth = 2;
      } else {
        item.mesh.scale.set(1.0, 1.0, 1.0);
        item.material.emissive.set(0x000000);
        item.material.emissiveIntensity = 0;

        if (isSliceActive) {
          // Vibrant for active slice
          item.material.opacity = 0.95;
          item.edgeMaterial.color.set(0x93c5fd); // Light blue border
          item.edgeMaterial.opacity = 0.75;
        } else if (this.ghostInactive) {
          // Semi-translucent glass for inactive slices to reveal inner tensors
          item.material.opacity = 0.22;
          item.edgeMaterial.color.set(0x475569);
          item.edgeMaterial.opacity = 0.15;
        } else {
          item.material.opacity = 0.85;
          item.edgeMaterial.color.set(0xffffff);
          item.edgeMaterial.opacity = 0.35;
        }
      }
    }
  }

  /**
   * Draws a glowing laser box framing the active time slice
   */
  updateSliceIndicator() {
    // Clear previous outline
    while (this.sliceOutlineGroup.children.length > 0) {
      const child = this.sliceOutlineGroup.children[0];
      this.sliceOutlineGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }

    const [T, H, W] = this.tensor.shape;
    const currentActiveT = Math.round(this.activeTimeSlice);
    if (currentActiveT < 0 || currentActiveT >= T) return;

    const voxelSize = 0.7;
    const baseSpacing = voxelSize + this.allSpacing;
    const timeSliceSpacing = voxelSize + this.allSpacing + this.sliceSpacing * 1.5;

    const totalW = W * baseSpacing + 0.15;
    const totalH = H * baseSpacing + 0.15;
    const depth = voxelSize + 0.15;

    const totalT = (T - 1) * timeSliceSpacing;
    const posZ = currentActiveT * timeSliceSpacing - totalT / 2;

    // Glowing wireframe box framing active slice
    const frameGeo = new THREE.BoxGeometry(totalW, totalH, depth);
    const frameEdges = new THREE.EdgesGeometry(frameGeo);
    const frameMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8, // Vibrant Cyan
      linewidth: 2,
      transparent: true,
      opacity: 0.85,
    });
    const frameLine = new THREE.LineSegments(frameEdges, frameMat);
    frameLine.position.set(0, 0, posZ);

    // Subtle translucent laser sheet
    const planeGeo = new THREE.PlaneGeometry(totalW, totalH);
    const planeMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
    });
    const planeMesh = new THREE.Mesh(planeGeo, planeMat);
    planeMesh.position.set(0, 0, posZ);

    this.sliceOutlineGroup.add(frameLine);
    this.sliceOutlineGroup.add(planeMesh);
  }

  /**
   * Creates labeled 3D axis arrows for t (Time), i (Height), j (Width)
   */
  updateAxesLabels() {
    while (this.axesGroup.children.length > 0) {
      const child = this.axesGroup.children[0];
      this.axesGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }

    const [T, H, W] = this.tensor.shape;
    const voxelSize = 0.7;
    const baseSpacing = voxelSize + this.allSpacing;
    const timeSliceSpacing = voxelSize + this.allSpacing + this.sliceSpacing * 1.5;

    const totalW = (W - 1) * baseSpacing;
    const totalH = (H - 1) * baseSpacing;
    const totalT = (T - 1) * timeSliceSpacing;

    const origin = new THREE.Vector3(-totalW / 2 - 0.9, -totalH / 2 - 0.9, -totalT / 2 - 0.9);

    // Axis arrows:
    // X = Col (j) [Red/Coral]
    const dirX = new THREE.Vector3(1, 0, 0);
    const arrowX = new THREE.ArrowHelper(dirX, origin, 1.4, 0xf43f5e, 0.35, 0.2);

    // Y = Row (i) [Green/Emerald]
    const dirY = new THREE.Vector3(0, 1, 0);
    const arrowY = new THREE.ArrowHelper(dirY, origin, 1.4, 0x10b981, 0.35, 0.2);

    // Z = Time (t) [Cyan/Sky]
    const dirZ = new THREE.Vector3(0, 0, 1);
    const arrowZ = new THREE.ArrowHelper(dirZ, origin, 1.4, 0x06b6d4, 0.35, 0.2);

    this.axesGroup.add(arrowX);
    this.axesGroup.add(arrowY);
    this.axesGroup.add(arrowZ);
  }

  // --- External interactive hooks ---

  setActiveTimeSlice(t) {
    this.activeTimeSlice = Math.max(0, Math.min(this.tensor.T - 1, t));
    this.updateSliceIndicator();
    this.applyVoxelVisualStates();
  }

  setColormap(cmap) {
    this.colormap = cmap;
    this.refreshColors();
  }

  setSliceSpacing(val) {
    this.sliceSpacing = Number(val);
    this.updateVoxelPositions();
    this.updateSliceIndicator();
    this.updateAxesLabels();
  }

  setGhostInactive(bool) {
    this.ghostInactive = bool;
    this.applyVoxelVisualStates();
  }

  setShowOnlyActiveSlice(bool) {
    this.showOnlyActiveSlice = bool;
    this.applyVoxelVisualStates();
  }

  setThreshold(val) {
    this.threshold = Number(val);
    this.applyVoxelVisualStates();
  }

  highlightVoxel(t, i, j) {
    if (t === null || i === null || j === null) {
      this.hoveredVoxel = null;
    } else {
      this.hoveredVoxel = { t, i, j };
    }
    this.applyVoxelVisualStates();
  }

  selectVoxel(t, i, j) {
    if (t === null || i === null || j === null) {
      this.selectedVoxel = null;
    } else {
      this.selectedVoxel = { t, i, j };
    }
    this.applyVoxelVisualStates();
  }

  setupEventListeners() {
    const dom = this.renderer.domElement;

    // Mouse move for 3D raycasting
    dom.addEventListener('pointermove', (e) => {
      const rect = dom.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.checkRaycast(e);
    });

    dom.addEventListener('pointerleave', () => {
      this.mouse.set(-999, -999);
      if (this.hoveredVoxel) {
        this.hoveredVoxel = null;
        this.applyVoxelVisualStates();
        if (this.onHoverCallback) this.onHoverCallback(null);
      }
    });

    // Click to select/lock voxel
    dom.addEventListener('pointerdown', (e) => {
      // Only handle primary left click
      if (e.button !== 0) return;
      this.checkRaycast(e, true);
    });

    // Window resize
    window.addEventListener('resize', () => this.onWindowResize());
  }

  checkRaycast(event, isClick = false) {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.voxelMeshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      const { t, i, j, val } = hit.userData;

      if (isClick) {
        if (this.selectedVoxel && this.selectedVoxel.t === t && this.selectedVoxel.i === i && this.selectedVoxel.j === j) {
          this.selectedVoxel = null; // Toggle off
        } else {
          this.selectedVoxel = { t, i, j };
        }
        if (this.onSelectCallback) this.onSelectCallback(this.selectedVoxel);
        this.applyVoxelVisualStates();
      } else {
        if (!this.hoveredVoxel || this.hoveredVoxel.t !== t || this.hoveredVoxel.i !== i || this.hoveredVoxel.j !== j) {
          this.hoveredVoxel = { t, i, j };
          this.applyVoxelVisualStates();
          if (this.onHoverCallback) {
            this.onHoverCallback({
              t,
              i,
              j,
              val,
              clientX: event.clientX,
              clientY: event.clientY,
            });
          }
        }
      }
    } else {
      if (!isClick && this.hoveredVoxel) {
        this.hoveredVoxel = null;
        this.applyVoxelVisualStates();
        if (this.onHoverCallback) this.onHoverCallback(null);
      }
    }
  }

  onWindowResize() {
    if (!this.container || !this.renderer) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  startLoop() {
    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate);

      if (this.controls) {
        this.controls.update();
      }

      // Gentle floating oscillation for visual vitality
      const elapsedTime = this.clock.getElapsedTime();
      this.voxelsGroup.position.y = Math.sin(elapsedTime * 0.8) * 0.05;
      this.sliceOutlineGroup.position.y = this.voxelsGroup.position.y;
      this.axesGroup.position.y = this.voxelsGroup.position.y;

      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  destroy() {
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.remove();
    }
  }
}
