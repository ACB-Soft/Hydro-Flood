import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  X,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Compass,
  Grid,
  Droplets,
  Mountain,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import {
  CrossSection,
  DynamicRoutingResult,
  HydraulicStructure,
  RoutingResult,
} from '../utils/OneDEngine';
import {
  ReachGridMapping,
  StaticDEMInput,
  Terrain3DGrid,
  build1DWaterMeshForResults,
  buildStaticWaterMesh,
  buildTerrainGridFromFile,
  buildTerrainGridFromStaticDEM,
  buildTerrainMeshBuffers,
  drapePolylineOverTerrain,
  precompute1DReachGridMapping,
  resolveStructureWorldPositions,
  sampleElevationAtGrid,
  wgs84ToTerrainGridPixel,
  wgs84ToWorldPoint,
  worldXZToLatLon,
} from '../utils/terrain3dBuilder';

export interface Terrain3DModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  mode: 'static' | 'dynamic1d';
  crsDef: string;

  // Static Flood Inputs
  staticDem?: StaticDEMInput | null;
  waterDepth?: Float32Array | null;
  connectedFloodMask?: Uint8Array | null;
  sourceWgs?: [number, number] | null;
  sourceElevation?: number | null;
  staticWse?: number | null;
  staticRiverCoords?: [number, number][];
  staticAreaCoords?: [number, number][];

  // 1D Dynamic Analysis Inputs
  demFile?: File | null;
  sections?: CrossSection[];
  selectedSectionIdx?: number;
  centerlineCoords?: [number, number][];
  leftBankCoords?: [number, number][];
  rightBankCoords?: [number, number][];
  structures?: HydraulicStructure[];
  studyAreaPolygons?: [number, number][][];
  dynamicResults?: DynamicRoutingResult | null;
  static1DResults?: RoutingResult[];
  currentStepIdx?: number;
  onChangeStepIdx?: (idx: number) => void;
  resultDisplayMode?: 'dynamic' | 'peak';
  onChangeResultDisplayMode?: (mode: 'dynamic' | 'peak') => void;
}

type CameraPreset = 'isometric' | 'top' | 'valley';

interface CursorReadout {
  lat: number;
  lon: number;
  terrainZ: number;
  waterZ: number | null;
  depthM: number | null;
}

// Pre-allocated math helpers (Zero GC in render loop)
const _camGoalPos = new THREE.Vector3();
const _camGoalTarget = new THREE.Vector3();
const _rayMouse = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function disposeObject3DTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const anyObj = obj as any;
    if (anyObj.geometry && typeof anyObj.geometry.dispose === 'function') {
      anyObj.geometry.dispose();
    }
    if (anyObj.material) {
      if (Array.isArray(anyObj.material)) {
        anyObj.material.forEach((m: any) => m?.dispose?.());
      } else {
        anyObj.material.dispose?.();
      }
    }
  });
}

function createStaticSourceBeaconGroup(): THREE.Group {
  const group = new THREE.Group();

  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    roughness: 0.35,
    metalness: 0.4,
  });
  const stemMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.28,
    metalness: 0.72,
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x0891b2,
    emissiveIntensity: 0.6,
    roughness: 0.2,
    metalness: 0.15,
  });

  // 1. Grounded base collar
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.35, 0.35, 24), ringMat);
  base.position.y = 0.175;
  group.add(base);

  // 2. Vertical mast
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 4.2, 12), stemMat);
  mast.position.y = 2.35;
  group.add(mast);

  // 3. Beacon octahedron head
  const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.95, 0), headMat);
  head.position.y = 5.0;
  group.add(head);

  return group;
}

function createStructureGroup(
  widthWorld: number,
  isBridge: boolean,
  yawRad: number
): THREE.Group {
  const group = new THREE.Group();
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.65,
    metalness: 0.12,
  });
  const deckMat = new THREE.MeshStandardMaterial({
    color: isBridge ? 0xf59e0b : 0xfbbf24,
    roughness: 0.42,
    metalness: 0.25,
  });
  const railMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    roughness: 0.3,
    metalness: 0.6,
  });

  const span = Math.max(2.6, widthWorld);
  const deckDepth = 1.6;
  const pierH = 2.0;

  // 1 & 2. Left / Right abutment piers
  const pierGeo = new THREE.BoxGeometry(0.65, pierH, deckDepth * 0.9);
  const leftPier = new THREE.Mesh(pierGeo, concreteMat);
  leftPier.position.set(-span * 0.45, -pierH * 0.5, 0);
  group.add(leftPier);

  const rightPier = new THREE.Mesh(pierGeo, concreteMat);
  rightPier.position.set(span * 0.45, -pierH * 0.5, 0);
  group.add(rightPier);

  // 3. Deck slab
  const deck = new THREE.Mesh(new THREE.BoxGeometry(span, 0.4, deckDepth), deckMat);
  deck.position.y = 0.2;
  group.add(deck);

  // 4 & 5. Safety guard rails
  const railGeo = new THREE.BoxGeometry(span, 0.22, 0.14);
  const frontRail = new THREE.Mesh(railGeo, railMat);
  frontRail.position.set(0, 0.51, deckDepth * 0.44);
  group.add(frontRail);

  const backRail = new THREE.Mesh(railGeo, railMat);
  backRail.position.set(0, 0.51, -deckDepth * 0.44);
  group.add(backRail);

  group.rotation.y = -yawRad;
  return group;
}

export const Terrain3DModal: React.FC<Terrain3DModalProps> = ({
  isOpen,
  onClose,
  title,
  mode,
  crsDef,
  staticDem,
  waterDepth,
  connectedFloodMask,
  sourceWgs,
  sourceElevation,
  staticWse,
  staticRiverCoords,
  staticAreaCoords,
  demFile,
  sections = [],
  selectedSectionIdx = 0,
  centerlineCoords = [],
  leftBankCoords = [],
  rightBankCoords = [],
  structures = [],
  studyAreaPolygons = [],
  dynamicResults,
  static1DResults = [],
  currentStepIdx = 0,
  onChangeStepIdx,
  resultDisplayMode = 'dynamic',
  onChangeResultDisplayMode,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  const [terrainGrid, setTerrainGrid] = useState<Terrain3DGrid | null>(null);
  const [isLoadingTerrain, setIsLoadingTerrain] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [webglLost, setWebglLost] = useState<boolean>(false);

  // Interactive Controls
  const [zExaggeration, setZExaggeration] = useState<number>(2.5);
  const [activePreset, setActivePreset] = useState<CameraPreset>('isometric');
  const [showWater, setShowWater] = useState<boolean>(true);
  const [showCenterline, setShowCenterline] = useState<boolean>(true);
  const [showSections, setShowSections] = useState<boolean>(true);
  const [showStructures, setShowStructures] = useState<boolean>(true);
  const [showWireframe, setShowWireframe] = useState<boolean>(false);
  const [isDockCollapsed, setIsDockCollapsed] = useState<boolean>(false);
  const [isPlaying3D, setIsPlaying3D] = useState<boolean>(false);
  const [cursorInfo, setCursorInfo] = useState<CursorReadout | null>(null);
  const [waterStats, setWaterStats] = useState<{ maxDepth: number; areaM2: number; hasWater: boolean }>({
    maxDepth: 0,
    areaM2: 0,
    hasWater: false,
  });

  // Scene refs for imperative updates without tearing down WebGL
  const sceneRefs = useRef<{
    renderer: THREE.WebGLRenderer | null;
    scene: THREE.Scene | null;
    camera: THREE.PerspectiveCamera | null;
    controls: OrbitControls | null;
    terrainRootGroup: THREE.Group | null;
    terrainMesh: THREE.Mesh | null;
    wireframeMesh: THREE.Mesh | null;
    skirtMesh: THREE.Mesh | null;
    waterMesh: THREE.Mesh | null;
    vectorGroup: THREE.Group | null;
    markersGroup: THREE.Group | null;
    sourceBeacon: THREE.Group | null;
    structureItems: Array<{ group: THREE.Group; baseY: number }>;
    requestRender: (() => void) | null;
    isAnimatingCam: boolean;
    targetZExag: number;
    currentZExag: number;
    targetCamPos: THREE.Vector3;
    targetCamLook: THREE.Vector3;
    lastWaterWseAtGrid: Float32Array | null;
  }>({
    renderer: null,
    scene: null,
    camera: null,
    controls: null,
    terrainRootGroup: null,
    terrainMesh: null,
    wireframeMesh: null,
    skirtMesh: null,
    waterMesh: null,
    vectorGroup: null,
    markersGroup: null,
    sourceBeacon: null,
    structureItems: [],
    requestRender: null,
    isAnimatingCam: false,
    targetZExag: 2.5,
    currentZExag: 2.5,
    targetCamPos: new THREE.Vector3(95, 70, 95),
    targetCamLook: new THREE.Vector3(0, 6, 0),
    lastWaterWseAtGrid: null,
  });

  // Keep latest grid + water info in refs for throttled pointer raycasting
  const terrainGridRef = useRef<Terrain3DGrid | null>(null);
  terrainGridRef.current = terrainGrid;
  const active1DResultsRef = useRef<RoutingResult[] | null>(null);
  const active1DMappingRef = useRef<ReachGridMapping | null>(null);

  // Build Terrain3DGrid when modal opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoadError(null);
    setCursorInfo(null);

    if (mode === 'static') {
      if (!staticDem) {
        setTerrainGrid(null);
        setLoadError('3B görünüm için yüklenmiş DEM verisi bulunamadı.');
        return;
      }
      const grid = buildTerrainGridFromStaticDEM(staticDem, crsDef);
      if (!grid) {
        setLoadError('DEM matrisi 3B yüzeye dönüştürülemedi.');
      }
      setTerrainGrid(grid);
      return;
    }

    // 1D mode loads from demFile (already WeakMap cached in loadDEM)
    if (!demFile) {
      setTerrainGrid(null);
      setLoadError('3B görünüm için önce 1B analiz panelinden bir DEM dosyası yükleyin.');
      return;
    }

    setIsLoadingTerrain(true);
    buildTerrainGridFromFile(demFile, crsDef)
      .then((grid) => {
        if (cancelled) return;
        if (!grid) {
          setLoadError('DEM dosyası okunamadı veya geçerli yükseklik değeri içermiyor.');
        }
        setTerrainGrid(grid);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err?.message || 'DEM 3B dönüştürme sırasında hata oluştu.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingTerrain(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, mode, staticDem, demFile, crsDef]);

  // Precompute 1D reach mapping once when terrainGrid & sections change
  const reachMapping = useMemo<ReachGridMapping | null>(() => {
    if (mode !== 'dynamic1d' || !terrainGrid || sections.length < 2) return null;
    return precompute1DReachGridMapping(terrainGrid, sections);
  }, [mode, terrainGrid, sections]);

  active1DMappingRef.current = reachMapping;

  // Determine active 1D results snapshot (dynamic step vs peak vs steady)
  const active1DResults = useMemo<RoutingResult[]>(() => {
    if (mode !== 'dynamic1d') return [];
    if (dynamicResults) {
      if (resultDisplayMode === 'peak') return dynamicResults.peakResults;
      const step = dynamicResults.timeSteps[currentStepIdx];
      return step ? step.results : dynamicResults.peakResults;
    }
    return static1DResults;
  }, [mode, dynamicResults, resultDisplayMode, currentStepIdx, static1DResults]);

  active1DResultsRef.current = active1DResults;

  // Keyboard shortcuts: Esc closes modal, H toggles bottom dock
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'h' || e.key === 'H') {
        setIsDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // 1D Dynamic playback timer inside 3D viewer
  useEffect(() => {
    if (!isOpen || !isPlaying3D || mode !== 'dynamic1d' || !dynamicResults || !onChangeStepIdx) {
      return;
    }
    const maxIdx = Math.max(0, dynamicResults.timeSteps.length - 1);
    const id = window.setInterval(() => {
      const next = currentStepIdx + 1;
      if (next > maxIdx) {
        setIsPlaying3D(false);
      } else {
        onChangeResultDisplayMode?.('dynamic');
        onChangeStepIdx(next);
      }
    }, 450);
    return () => window.clearInterval(id);
  }, [isOpen, isPlaying3D, mode, dynamicResults, currentStepIdx, onChangeStepIdx, onChangeResultDisplayMode]);

  // Helper to compute camera preset positions relative to terrain height
  const computePresetCamera = (
    preset: CameraPreset,
    grid: Terrain3DGrid,
    exag: number
  ): { pos: THREE.Vector3; target: THREE.Vector3 } => {
    const midY = ((grid.maxElev - grid.minElev) * grid.metersToWorld * exag) * 0.35;
    const target = new THREE.Vector3(0, midY, 0);

    if (preset === 'top') {
      return {
        pos: new THREE.Vector3(0, 148, 0.5),
        target: new THREE.Vector3(0, midY * 0.5, 0),
      };
    }
    if (preset === 'valley' && mode === 'dynamic1d' && centerlineCoords.length >= 2) {
      const pStart = wgs84ToWorldPoint(grid, centerlineCoords[0][0], centerlineCoords[0][1]);
      const pEnd = wgs84ToWorldPoint(
        grid,
        centerlineCoords[centerlineCoords.length - 1][0],
        centerlineCoords[centerlineCoords.length - 1][1]
      );
      if (pStart && pEnd) {
        const dx = pStart[0] - pEnd[0];
        const dz = pStart[2] - pEnd[2];
        const len = Math.max(1, Math.hypot(dx, dz));
        const nx = dx / len;
        const nz = dz / len;
        const lookAt = new THREE.Vector3(
          (pStart[0] + pEnd[0]) * 0.5,
          ((pStart[1] + pEnd[1]) * 0.5) * exag,
          (pStart[2] + pEnd[2]) * 0.5
        );
        const camPos = new THREE.Vector3(
          pEnd[0] - nx * 42 + nz * 18,
          Math.max(26, pEnd[1] * exag + 32),
          pEnd[2] - nz * 42 - nx * 18
        );
        return { pos: camPos, target: lookAt };
      }
    }
    // Isometric default
    return {
      pos: new THREE.Vector3(88, Math.max(58, midY + 55), 88),
      target,
    };
  };

  // Trigger camera preset animation
  const handleSelectPreset = (preset: CameraPreset) => {
    setActivePreset(preset);
    if (!terrainGrid) return;
    const { pos, target } = computePresetCamera(preset, terrainGrid, zExaggeration);
    sceneRefs.current.targetCamPos.copy(pos);
    sceneRefs.current.targetCamLook.copy(target);
    sceneRefs.current.isAnimatingCam = true;
    sceneRefs.current.requestRender?.();
  };

  // Initialize Three.js WebGL scene once when modal mounts + terrainGrid is ready
  useEffect(() => {
    if (!isOpen || !terrainGrid || !canvasMountRef.current) return;

    const mountEl = canvasMountRef.current;
    const isSoftwareGl = detectSoftwareWebGL();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(mountEl.clientWidth || 960, mountEl.clientHeight || 600);
    mountEl.innerHTML = '';
    mountEl.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b111a);
    scene.fog = new THREE.FogExp2(0x0b111a, 0.0017);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      45,
      (mountEl.clientWidth || 960) / Math.max(1, mountEl.clientHeight || 600),
      0.5,
      1200
    );

    const initCam = computePresetCamera('isometric', terrainGrid, zExaggeration);
    camera.position.copy(initCam.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(initCam.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minPolarAngle = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 14;
    controls.maxDistance = 320;
    controls.update();

    // 3-Point Warm / Cool Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x9bd1ff, 0x26201a, 0.8);
    hemiLight.position.set(0, 120, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff3de, 1.5);
    keyLight.position.set(-75, 110, -55);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 10;
      keyLight.shadow.camera.far = 320;
      keyLight.shadow.camera.left = -80;
      keyLight.shadow.camera.right = 80;
      keyLight.shadow.camera.top = 80;
      keyLight.shadow.camera.bottom = -80;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.42);
    rimLight.position.set(85, 55, 80);
    scene.add(rimLight);

    // Subtle reference ground grid beneath terrain block
    const gridHelper = new THREE.GridHelper(180, 24, 0x1e293b, 0x111a29);
    gridHelper.position.y = -4.6;
    scene.add(gridHelper);

    // Terrain root group (scaled vertically by Z exaggeration)
    const terrainRootGroup = new THREE.Group();
    terrainRootGroup.scale.y = zExaggeration;
    scene.add(terrainRootGroup);

    // Build terrain mesh + skirt
    const { terrain: terrBuf, skirt: skirtBuf } = buildTerrainMeshBuffers(terrainGrid);
    const terrGeo = new THREE.BufferGeometry();
    terrGeo.setAttribute('position', new THREE.BufferAttribute(terrBuf.positions, 3));
    terrGeo.setAttribute('color', new THREE.BufferAttribute(terrBuf.colors, 3));
    terrGeo.setIndex(new THREE.BufferAttribute(terrBuf.indices, 1));
    terrGeo.computeVertexNormals();
    terrGeo.computeBoundingBox();
    terrGeo.computeBoundingSphere();

    const terrMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });
    const terrainMesh = new THREE.Mesh(terrGeo, terrMat);
    terrainMesh.receiveShadow = !isSoftwareGl;
    terrainMesh.castShadow = !isSoftwareGl;
    terrainMesh.layers.enable(1); // Raycasting inspection target
    terrainRootGroup.add(terrainMesh);

    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
      wireframe: true,
      transparent: true,
      opacity: 0.16,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const wireframeMesh = new THREE.Mesh(terrGeo, wireMat);
    wireframeMesh.visible = showWireframe;
    terrainRootGroup.add(wireframeMesh);

    let skirtMesh: THREE.Mesh | null = null;
    if (skirtBuf) {
      const skirtGeo = new THREE.BufferGeometry();
      skirtGeo.setAttribute('position', new THREE.BufferAttribute(skirtBuf.positions, 3));
      skirtGeo.setAttribute('color', new THREE.BufferAttribute(skirtBuf.colors, 3));
      skirtGeo.setIndex(new THREE.BufferAttribute(skirtBuf.indices, 1));
      skirtGeo.computeVertexNormals();
      const skirtMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.92,
        metalness: 0.05,
        side: THREE.DoubleSide,
      });
      skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
      terrainRootGroup.add(skirtMesh);
    }

    // Water surface mesh (populated dynamically by separate effect)
    const waterGeo = new THREE.BufferGeometry();
    const waterMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      roughness: 0.16,
      metalness: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.renderOrder = 5;
    waterMesh.visible = showWater;
    terrainRootGroup.add(waterMesh);

    const vectorGroup = new THREE.Group();
    terrainRootGroup.add(vectorGroup);

    const markersGroup = new THREE.Group();
    scene.add(markersGroup);

    // Populate refs
    sceneRefs.current = {
      ...sceneRefs.current,
      renderer,
      scene,
      camera,
      controls,
      terrainRootGroup,
      terrainMesh,
      wireframeMesh,
      skirtMesh,
      waterMesh,
      vectorGroup,
      markersGroup,
      sourceBeacon: null,
      structureItems: [],
      targetZExag: zExaggeration,
      currentZExag: zExaggeration,
      targetCamPos: initCam.pos.clone(),
      targetCamLook: initCam.target.clone(),
      isAnimatingCam: false,
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // On-demand render scheduler + smooth damp transition loop
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;
    let lastClockMs = performance.now();

    function afterDraw(cb: () => void) {
      try {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (!gl || typeof gl.fenceSync !== 'function') {
          frameId = window.setTimeout(cb, 80);
          return;
        }
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } catch {
        frameId = window.setTimeout(cb, 80);
      }
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame((nowMs) => {
        if (disposed) return;
        renderDirty = false;
        const dt = Math.min(0.1, Math.max(0.001, (nowMs - lastClockMs) / 1000));
        lastClockMs = nowMs;

        const refs = sceneRefs.current;
        let needsFollowUp = false;

        // Smoothly damp Z exaggeration
        if (Math.abs(refs.currentZExag - refs.targetZExag) > 0.004) {
          refs.currentZExag = THREE.MathUtils.damp(
            refs.currentZExag,
            refs.targetZExag,
            10,
            dt
          );
          if (Math.abs(refs.currentZExag - refs.targetZExag) <= 0.004) {
            refs.currentZExag = refs.targetZExag;
          } else {
            needsFollowUp = true;
          }
          if (refs.terrainRootGroup) {
            refs.terrainRootGroup.scale.y = refs.currentZExag;
          }
          if (refs.sourceBeacon) {
            refs.sourceBeacon.position.y =
              (refs.sourceBeacon.userData.baseY || 0) * refs.currentZExag;
          }
          for (const st of refs.structureItems) {
            st.group.position.y = st.baseY * refs.currentZExag;
          }
        }

        // Smoothly damp camera preset transitions
        if (refs.isAnimatingCam) {
          camera.position.x = THREE.MathUtils.damp(camera.position.x, refs.targetCamPos.x, 7.5, dt);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, refs.targetCamPos.y, 7.5, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, refs.targetCamPos.z, 7.5, dt);

          controls.target.x = THREE.MathUtils.damp(controls.target.x, refs.targetCamLook.x, 7.5, dt);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, refs.targetCamLook.y, 7.5, dt);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, refs.targetCamLook.z, 7.5, dt);

          const distPos = camera.position.distanceTo(refs.targetCamPos);
          const distTarget = controls.target.distanceTo(refs.targetCamLook);
          if (distPos < 0.12 && distTarget < 0.12) {
            camera.position.copy(refs.targetCamPos);
            controls.target.copy(refs.targetCamLook);
            refs.isAnimatingCam = false;
          } else {
            needsFollowUp = true;
          }
        }

        if (controls.update()) {
          needsFollowUp = true;
        }

        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (disposed) return;
          if (renderDirty || needsFollowUp) {
            requestRender();
          }
        };

        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    sceneRefs.current.requestRender = requestRender;

    const onControlsChange = () => requestRender();
    const onControlsStart = () => {
      sceneRefs.current.isAnimatingCam = false;
    };
    controls.addEventListener('change', onControlsChange);
    controls.addEventListener('start', onControlsStart);

    // Throttled pointermove raycasting on Terrain layer (1)
    let lastRaycastMs = 0;
    const onPointerMove = (ev: PointerEvent) => {
      const now = performance.now();
      if (now - lastRaycastMs < 50) return;
      lastRaycastMs = now;

      const gridNow = terrainGridRef.current;
      const tMesh = sceneRefs.current.terrainMesh;
      if (!gridNow || !tMesh) return;

      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      _rayMouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      _rayMouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

      _raycaster.layers.set(1);
      _raycaster.setFromCamera(_rayMouse, camera);
      const hits = _raycaster.intersectObject(tMesh, false);
      if (hits.length === 0) {
        setCursorInfo(null);
        return;
      }

      const pt = hits[0].point;
      const [lat, lon] = worldXZToLatLon(gridNow, pt.x, pt.z);
      const [gx, gy] = wgs84ToTerrainGridPixel(gridNow, lat, lon);
      const terrainZ = sampleElevationAtGrid(gridNow, gx, gy);
      if (terrainZ === null) {
        setCursorInfo(null);
        return;
      }

      // Check water elevation at point
      let waterZ: number | null = null;
      let depthM: number | null = null;
      const wMesh = sceneRefs.current.waterMesh;
      if (wMesh && wMesh.visible && wMesh.geometry.attributes.position) {
        const ix = Math.max(0, Math.min(gridNow.gridW - 1, Math.round(gx)));
        const iy = Math.max(0, Math.min(gridNow.gridH - 1, Math.round(gy)));
        const vIdx = iy * gridNow.gridW + ix;
        const posAttr = wMesh.geometry.attributes.position as THREE.BufferAttribute;
        if (vIdx < posAttr.count) {
          const waterBaseY = posAttr.getY(vIdx);
          const candidateWse = gridNow.minElev + waterBaseY / gridNow.metersToWorld;
          if (candidateWse - terrainZ > 0.015) {
            waterZ = candidateWse;
            depthM = candidateWse - terrainZ;
          }
        }
      }

      setCursorInfo({ lat, lon, terrainZ, waterZ, depthM });
    };

    const onPointerLeave = () => setCursorInfo(null);

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglLost(true);
    };
    const onContextRestored = () => {
      setWebglLost(false);
      requestRender();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const resizeObserver = new ResizeObserver(() => {
      if (disposed || !mountEl) return;
      const w = mountEl.clientWidth;
      const h = mountEl.clientHeight;
      if (w <= 0 || h <= 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    });
    resizeObserver.observe(mountEl);

    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('change', onControlsChange);
      controls.removeEventListener('start', onControlsStart);
      controls.dispose();

      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      disposeObject3DTree(scene);
      envTarget.dispose();
      renderer.dispose();
      mountEl.innerHTML = '';

      sceneRefs.current.renderer = null;
      sceneRefs.current.scene = null;
      sceneRefs.current.camera = null;
      sceneRefs.current.controls = null;
      sceneRefs.current.requestRender = null;
    };
  }, [isOpen, terrainGrid]);

  // Sync Z exaggeration target
  useEffect(() => {
    sceneRefs.current.targetZExag = zExaggeration;
    sceneRefs.current.requestRender?.();
  }, [zExaggeration]);

  // Sync wireframe visibility
  useEffect(() => {
    if (sceneRefs.current.wireframeMesh) {
      sceneRefs.current.wireframeMesh.visible = showWireframe;
      sceneRefs.current.requestRender?.();
    }
  }, [showWireframe]);

  // Sync water visibility
  useEffect(() => {
    if (sceneRefs.current.waterMesh) {
      sceneRefs.current.waterMesh.visible = showWater;
      sceneRefs.current.requestRender?.();
    }
  }, [showWater]);

  // Rebuild vector overlays (Centerline, Bank lines, Cross-sections, Study area, Source Beacon, Structures)
  useEffect(() => {
    const { vectorGroup, markersGroup, requestRender } = sceneRefs.current;
    if (!terrainGrid || !vectorGroup || !markersGroup) return;

    // Clear previous vectors
    while (vectorGroup.children.length > 0) {
      const ch = vectorGroup.children[0];
      vectorGroup.remove(ch);
      disposeObject3DTree(ch);
    }
    while (markersGroup.children.length > 0) {
      const ch = markersGroup.children[0];
      markersGroup.remove(ch);
      disposeObject3DTree(ch);
    }
    sceneRefs.current.sourceBeacon = null;
    sceneRefs.current.structureItems = [];

    // 1. River Centerline
    const riverLineCoords = mode === 'static' ? staticRiverCoords : centerlineCoords;
    if (showCenterline && riverLineCoords && riverLineCoords.length >= 2) {
      const pts = drapePolylineOverTerrain(terrainGrid, riverLineCoords, 0.35, 10);
      if (pts) {
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
        const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8 });
        const line = new THREE.Line(lineGeo, lineMat);
        line.renderOrder = 6;
        vectorGroup.add(line);
      }
    }

    // 2. Bank Lines (1D)
    if (mode === 'dynamic1d' && showCenterline) {
      for (const bank of [leftBankCoords, rightBankCoords]) {
        if (bank && bank.length >= 2) {
          const pts = drapePolylineOverTerrain(terrainGrid, bank, 0.25, 6);
          if (pts) {
            const bGeo = new THREE.BufferGeometry();
            bGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
            const bMat = new THREE.LineBasicMaterial({
              color: 0x34d399,
              transparent: true,
              opacity: 0.75,
            });
            vectorGroup.add(new THREE.Line(bGeo, bMat));
          }
        }
      }
    }

    // 3. Cross-sections (1D)
    if (mode === 'dynamic1d' && showSections && sections.length > 0) {
      sections.forEach((sec, idx) => {
        if (!sec.cutLine) return;
        const pts = drapePolylineOverTerrain(
          terrainGrid,
          [sec.cutLine[0], sec.cutLine[1]],
          0.3,
          12
        );
        if (!pts) return;
        const isSelected = idx === selectedSectionIdx;
        const sGeo = new THREE.BufferGeometry();
        sGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
        const sMat = new THREE.LineBasicMaterial({
          color: isSelected ? 0xfbbf24 : 0x94a3b8,
          transparent: true,
          opacity: isSelected ? 1.0 : 0.6,
        });
        const sLine = new THREE.Line(sGeo, sMat);
        sLine.renderOrder = isSelected ? 8 : 4;
        vectorGroup.add(sLine);
      });
    }

    // 4. Study Area Boundary (Static or 1D)
    const areaRings =
      mode === 'static'
        ? staticAreaCoords && staticAreaCoords.length >= 3
          ? [staticAreaCoords]
          : []
        : studyAreaPolygons;
    for (const ring of areaRings) {
      if (ring.length >= 3) {
        const closed = [...ring, ring[0]];
        const pts = drapePolylineOverTerrain(terrainGrid, closed, 0.35, 6);
        if (pts) {
          const aGeo = new THREE.BufferGeometry();
          aGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
          const aMat = new THREE.LineBasicMaterial({
            color: 0x10b981,
            transparent: true,
            opacity: 0.9,
          });
          vectorGroup.add(new THREE.Line(aGeo, aMat));
        }
      }
    }

    // 5. Static Source Point Beacon
    if (mode === 'static' && sourceWgs) {
      const wp = wgs84ToWorldPoint(terrainGrid, sourceWgs[0], sourceWgs[1], sourceElevation);
      if (wp) {
        const beacon = createStaticSourceBeaconGroup();
        beacon.userData.baseY = wp[1];
        beacon.position.set(wp[0], wp[1] * sceneRefs.current.currentZExag, wp[2]);
        markersGroup.add(beacon);
        sceneRefs.current.sourceBeacon = beacon;
      }
    }

    // 6. Hydraulic Structures (1D Bridges / Culverts)
    if (mode === 'dynamic1d' && showStructures && structures.length > 0) {
      const placed = resolveStructureWorldPositions(terrainGrid, structures, sections);
      const list: Array<{ group: THREE.Group; baseY: number }> = [];
      for (const item of placed) {
        const grp = createStructureGroup(
          item.widthWorld,
          item.structure.type === 'bridge',
          item.yawRad
        );
        grp.position.set(
          item.x,
          item.baseY * sceneRefs.current.currentZExag,
          item.z
        );
        markersGroup.add(grp);
        list.push({ group: grp, baseY: item.baseY });
      }
      sceneRefs.current.structureItems = list;
    }

    requestRender?.();
  }, [
    terrainGrid,
    mode,
    showCenterline,
    showSections,
    showStructures,
    staticRiverCoords,
    staticAreaCoords,
    sourceWgs,
    sourceElevation,
    centerlineCoords,
    leftBankCoords,
    rightBankCoords,
    sections,
    selectedSectionIdx,
    studyAreaPolygons,
    structures,
  ]);

  // Update 3D water surface mesh when flood results or time step changes
  useEffect(() => {
    const { waterMesh, requestRender } = sceneRefs.current;
    if (!terrainGrid || !waterMesh) return;

    let result = { buffers: null as any, wetVertexCount: 0, maxDepth: 0, floodAreaM2: 0 };

    if (mode === 'static' && staticDem) {
      result = buildStaticWaterMesh(terrainGrid, staticDem, waterDepth, connectedFloodMask);
    } else if (mode === 'dynamic1d' && reachMapping && active1DResults.length >= 2) {
      result = build1DWaterMeshForResults(terrainGrid, reachMapping, active1DResults);
    }

    if (!result.buffers) {
      waterMesh.visible = false;
      setWaterStats({ maxDepth: 0, areaM2: 0, hasWater: false });
      requestRender?.();
      return;
    }

    const geo = waterMesh.geometry;
    geo.setAttribute('position', new THREE.BufferAttribute(result.buffers.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(result.buffers.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(result.buffers.indices, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    waterMesh.visible = showWater;
    setWaterStats({
      maxDepth: result.maxDepth,
      areaM2: result.floodAreaM2,
      hasWater: true,
    });
    requestRender?.();
  }, [
    terrainGrid,
    mode,
    staticDem,
    waterDepth,
    connectedFloodMask,
    reachMapping,
    active1DResults,
    showWater,
  ]);

  if (!isOpen) return null;

  const activeTimeStep =
    mode === 'dynamic1d' && dynamicResults && dynamicResults.timeSteps.length > 0
      ? dynamicResults.timeSteps[currentStepIdx] || dynamicResults.timeSteps[0]
      : null;

  return (
    <div className="fixed inset-0 z-[1200] bg-slate-950/75 flex items-center justify-center p-3 sm:p-5">
      {/* Framed CAD-Viewer Sized Window */}
      <div className="w-full max-w-[1380px] h-[82vh] max-h-[840px] bg-[#0B111A] border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col relative select-none text-slate-100">
        {/* Top Metadata & Close Strip (zero pills, tabular-nums, no backdrop-filter over WebGL) */}
        <div className="h-12 px-4 bg-[#0F172A] border-b border-slate-800 flex items-center justify-between gap-4 shrink-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <Mountain size={16} className="text-cyan-400 shrink-0" />
            <h3 className="text-xs sm:text-sm font-bold text-slate-100 whitespace-nowrap truncate">
              {title}
            </h3>
            {terrainGrid && (
              <div className="hidden md:flex items-center gap-2 text-[11px] font-mono tabular-nums text-slate-400 whitespace-nowrap">
                <span aria-hidden="true">·</span>
                <span>
                  {Math.round(terrainGrid.spanMetersX)} × {Math.round(terrainGrid.spanMetersZ)} m
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Kot: {terrainGrid.minElev.toFixed(1)} – {terrainGrid.maxElev.toFixed(1)} m
                </span>
                {waterStats.hasWater && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-cyan-300">
                      Maks. Derinlik: {waterStats.maxDepth.toFixed(2)} m
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Cursor Raycast Telemetry + Close */}
          <div className="flex items-center gap-4 shrink-0">
            {cursorInfo && (
              <div className="hidden sm:flex items-center gap-2.5 text-[11px] font-mono tabular-nums text-slate-300">
                <span>
                  Z: <strong className="text-amber-300">{cursorInfo.terrainZ.toFixed(2)} m</strong>
                </span>
                {cursorInfo.waterZ !== null && cursorInfo.depthM !== null && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      WSE: <strong className="text-cyan-300">{cursorInfo.waterZ.toFixed(2)} m</strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      h: <strong className="text-sky-400">{cursorInfo.depthM.toFixed(2)} m</strong>
                    </span>
                  </>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              title="3B Pencereyi Kapat (ESC)"
            >
              <X size={14} />
              <span>Kapat</span>
            </button>
          </div>
        </div>

        {/* 3D WebGL Viewport Container */}
        <div className="flex-1 w-full min-h-0 relative bg-[#0B111A]">
          {/* Dedicated isolated canvas mount */}
          <div ref={canvasMountRef} className="w-full h-full" />

          {/* Loading or Error Overlay */}
          {isLoadingTerrain && (
            <div className="absolute inset-0 z-30 bg-[#0B111A]/90 flex flex-col items-center justify-center gap-3 text-center p-6">
              <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <div className="text-xs font-semibold text-slate-200">
                3B Arazi ve Taşkın Geometrisi Hazırlanıyor...
              </div>
            </div>
          )}

          {(loadError || webglLost) && !isLoadingTerrain && (
            <div className="absolute inset-0 z-30 bg-[#0B111A]/95 flex flex-col items-center justify-center gap-3 text-center p-6">
              <AlertTriangle size={28} className="text-amber-400" />
              <div className="text-sm font-bold text-slate-100">
                {webglLost
                  ? 'WebGL Grafik Bağlamı Kesintiye Uğradı'
                  : '3B Sahne Oluşturulamadı'}
              </div>
              <p className="text-xs text-slate-400 max-w-md">
                {loadError ||
                  'Tarayıcı grafik sürücüsü sıfırlandı. Pencereyi kapatıp tekrar açabilirsiniz.'}
              </p>
            </div>
          )}

          {/* Subtle Mouse Helper Hint (Top-Left, non-obstructive) */}
          {terrainGrid && !loadError && !webglLost && (
            <div className="absolute top-3 left-3 z-10 pointer-events-none text-[11px] text-slate-400 bg-[#0F172A]/85 border border-slate-800 rounded-lg px-2.5 py-1.5 flex items-center gap-2 font-sans">
              <span>Sol Sürükle: Döndür</span>
              <span aria-hidden="true">·</span>
              <span>Sağ Sürükle: Kaydır</span>
              <span aria-hidden="true">·</span>
              <span>Tekerlek: Yakınlaş</span>
            </div>
          )}

          {/* Static WSE Info (Top-Right if available and not occluded) */}
          {mode === 'static' && staticWse !== null && staticWse !== undefined && terrainGrid && (
            <div className="absolute top-3 right-3 z-10 pointer-events-none text-[11px] font-mono tabular-nums text-slate-200 bg-[#0F172A]/85 border border-slate-800 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <Droplets size={13} className="text-cyan-400 shrink-0" />
              <span>Hedef WSE: {staticWse.toFixed(2)} m</span>
              {waterStats.hasWater && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Alan: {Math.round(waterStats.areaM2).toLocaleString()} m²</span>
                </>
              )}
            </div>
          )}

          {/* Collapsible Bottom Control Dock */}
          {terrainGrid && !loadError && (
            <div
              className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center transition-transform duration-200 ${
                isDockCollapsed ? 'translate-y-[calc(100%-32px)]' : 'translate-y-0'
              }`}
              style={{ maxWidth: 'min(960px, 95%)' }}
            >
              {/* Collapse / Expand Tab */}
              <button
                type="button"
                onClick={() => setIsDockCollapsed((p) => !p)}
                className="px-3 py-1 bg-[#0F172A]/95 hover:bg-slate-800 text-slate-300 border border-b-0 border-slate-700 rounded-t-lg text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Kontrol Panelini Gizle/Göster (H)"
              >
                {isDockCollapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                <span>{isDockCollapsed ? 'Kontrolleri Göster' : 'Kontrolleri Gizle'}</span>
              </button>

              {/* Main Control Bar */}
              <div className="w-full bg-[#0F172A]/95 border border-slate-700 rounded-xl p-2.5 shadow-2xl space-y-2">
                {/* Row 1: Z Exaggeration + Camera Presets + Layer Toggles */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Z Exaggeration Slider */}
                  <div className="flex items-center gap-2.5 bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1.5">
                    <span className="text-[11px] font-semibold text-slate-300 whitespace-nowrap">
                      Düşey Abartı (Z)
                    </span>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="0.25"
                      value={zExaggeration}
                      onChange={(e) => setZExaggeration(Number(e.target.value))}
                      className="w-24 sm:w-28 h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-cyan-500"
                    />
                    <span className="text-[11px] font-mono tabular-nums font-bold text-cyan-300 w-9 text-right">
                      {zExaggeration.toFixed(1)}x
                    </span>
                  </div>

                  {/* Camera Presets */}
                  <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-lg p-1">
                    <Compass size={13} className="text-slate-400 mx-1 shrink-0" />
                    {(
                      [
                        { id: 'isometric', label: 'İzometrik' },
                        { id: 'top', label: 'Kuşbakışı' },
                        ...(mode === 'dynamic1d' && centerlineCoords.length >= 2
                          ? [{ id: 'valley', label: 'Vadi Boyu' }]
                          : []),
                      ] as Array<{ id: CameraPreset; label: string }>
                    ).map((cam) => (
                      <button
                        key={cam.id}
                        type="button"
                        onClick={() => handleSelectPreset(cam.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                          activePreset === cam.id
                            ? 'bg-cyan-700 text-white'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        {cam.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleSelectPreset(activePreset)}
                      className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
                      title="Kamerayı Sıfırla"
                    >
                      <RotateCcw size={12} />
                    </button>
                  </div>

                  {/* Layer Toggles */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {waterStats.hasWater && (
                      <button
                        type="button"
                        onClick={() => setShowWater((v) => !v)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                          showWater
                            ? 'bg-cyan-700 text-white border-cyan-600'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        <Droplets size={12} />
                        <span>Su Yüzeyi</span>
                      </button>
                    )}

                    {((mode === 'static' && staticRiverCoords && staticRiverCoords.length >= 2) ||
                      (mode === 'dynamic1d' && centerlineCoords.length >= 2)) && (
                      <button
                        type="button"
                        onClick={() => setShowCenterline((v) => !v)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                          showCenterline
                            ? 'bg-sky-700 text-white border-sky-600'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        Dere Aksı
                      </button>
                    )}

                    {mode === 'dynamic1d' && sections.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowSections((v) => !v)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                          showSections
                            ? 'bg-amber-700 text-white border-amber-600'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        Enkesitler
                      </button>
                    )}

                    {mode === 'dynamic1d' && structures.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowStructures((v) => !v)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                          showStructures
                            ? 'bg-orange-700 text-white border-orange-600'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        Yapılar ({structures.length})
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowWireframe((v) => !v)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                        showWireframe
                          ? 'bg-slate-700 text-white border-slate-500'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <Grid size={12} />
                      <span>Tel Kafes</span>
                    </button>
                  </div>
                </div>

                {/* Row 2: 1D Dynamic Time Animation Controls */}
                {mode === 'dynamic1d' && dynamicResults && dynamicResults.timeSteps.length > 0 && onChangeStepIdx && (
                  <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsPlaying3D(false);
                          onChangeResultDisplayMode?.('dynamic');
                          onChangeStepIdx(Math.max(0, currentStepIdx - 1));
                        }}
                        disabled={currentStepIdx === 0}
                        className="p-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-200 rounded-md border border-slate-800 cursor-pointer"
                        title="Önceki Zaman Adımı"
                      >
                        <SkipBack size={13} />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (isPlaying3D) {
                            setIsPlaying3D(false);
                          } else {
                            onChangeResultDisplayMode?.('dynamic');
                            if (currentStepIdx >= dynamicResults.timeSteps.length - 1) {
                              onChangeStepIdx(0);
                            }
                            setIsPlaying3D(true);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-md text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                          isPlaying3D
                            ? 'bg-amber-600 hover:bg-amber-700 text-white'
                            : 'bg-cyan-700 hover:bg-cyan-600 text-white'
                        }`}
                      >
                        {isPlaying3D ? <Pause size={12} /> : <Play size={12} className="fill-white" />}
                        <span>{isPlaying3D ? 'Durdur' : 'Oynat'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsPlaying3D(false);
                          onChangeResultDisplayMode?.('dynamic');
                          onChangeStepIdx(
                            Math.min(dynamicResults.timeSteps.length - 1, currentStepIdx + 1)
                          );
                        }}
                        disabled={currentStepIdx >= dynamicResults.timeSteps.length - 1}
                        className="p-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-200 rounded-md border border-slate-800 cursor-pointer"
                        title="Sonraki Zaman Adımı"
                      >
                        <SkipForward size={13} />
                      </button>
                    </div>

                    <div className="flex items-center gap-2.5 flex-1 min-w-[180px]">
                      <input
                        type="range"
                        min="0"
                        max={Math.max(1, dynamicResults.timeSteps.length - 1)}
                        step="1"
                        value={currentStepIdx}
                        onChange={(e) => {
                          setIsPlaying3D(false);
                          onChangeResultDisplayMode?.('dynamic');
                          onChangeStepIdx(Number(e.target.value));
                        }}
                        className="flex-1 h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-cyan-500"
                      />
                    </div>

                    <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-slate-300 whitespace-nowrap">
                      <span>
                        {resultDisplayMode === 'peak'
                          ? 'Pik Zarfı'
                          : activeTimeStep?.timeFormatted || `Saat ${currentStepIdx}`}
                      </span>
                      {activeTimeStep && resultDisplayMode !== 'peak' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            Giriş: <strong className="text-cyan-300">{activeTimeStep.inflowQ} m³/s</strong>
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            Çıkış: <strong className="text-emerald-300">{activeTimeStep.outflowQ} m³/s</strong>
                          </span>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setIsPlaying3D(false);
                          onChangeResultDisplayMode?.(
                            resultDisplayMode === 'peak' ? 'dynamic' : 'peak'
                          );
                        }}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold font-sans border transition-colors cursor-pointer ${
                          resultDisplayMode === 'peak'
                            ? 'bg-amber-600 text-white border-amber-500'
                            : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                        }`}
                      >
                        Pik Zarfı
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Terrain3DModal;
