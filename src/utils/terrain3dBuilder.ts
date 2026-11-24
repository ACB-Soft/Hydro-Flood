import * as THREE from 'three';
import proj4 from 'proj4';
import {
  CrossSection,
  HydraulicStructure,
  RoutingResult,
  loadDEM,
} from './OneDEngine';

export interface StaticDEMInput {
  data: Float32Array;
  width: number;
  height: number;
  min: number;
  max: number;
  xll: number;
  yll: number;
  cellSize: number;
}

export interface Terrain3DGrid {
  gridW: number;
  gridH: number;
  srcWidth: number;
  srcHeight: number;
  elevations: Float32Array; // Downsampled elevation grid (row-major, row 0 = North)
  minElev: number;
  maxElev: number;
  spanMetersX: number;
  spanMetersZ: number;
  metersToWorld: number;
  worldWidth: number;
  worldDepth: number;
  xll: number;
  yll: number;
  xur: number;
  yur: number;
  isGeographic: boolean;
  effectiveCrsDef: string;
  wgs84Bounds: [[number, number], [number, number]];
}

export interface MeshBufferData {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
  triangleCount: number;
}

export interface StaticWaterMeshResult {
  buffers: MeshBufferData | null;
  wetVertexCount: number;
  maxDepth: number;
  floodAreaM2: number;
}

export interface ReachGridMapping {
  secA: Int32Array; // -1 if outside reach quads
  secB: Int32Array;
  longT: Float32Array; // 0..1 interpolation along reach from secA to secB
  seedIndices: Int32Array; // centerline pixel indices to seed BFS
}

const WORLD_MAX_SPAN = 120;
const TARGET_MAX_GRID = 240;

const HYPSO_STOPS = [
  { pos: 0.0, color: [26, 130, 56] },    // Deep valley green
  { pos: 0.2, color: [88, 178, 82] },    // Meadow green
  { pos: 0.42, color: [224, 214, 114] }, // Warm ochre yellow
  { pos: 0.65, color: [192, 134, 72] },  // Ridge tan
  { pos: 0.84, color: [138, 74, 42] },   // High rock brown
  { pos: 1.0, color: [242, 244, 248] },  // Peak snow
];

const _tmpColor = new THREE.Color();

export function sampleHypsometricColor(tNorm: number): [number, number, number] {
  const val = Math.max(0, Math.min(1, tNorm));
  let r = 242;
  let g = 244;
  let b = 248;
  for (let s = 0; s < HYPSO_STOPS.length - 1; s++) {
    const s1 = HYPSO_STOPS[s];
    const s2 = HYPSO_STOPS[s + 1];
    if (val >= s1.pos && val <= s2.pos) {
      const frac = (val - s1.pos) / Math.max(1e-6, s2.pos - s1.pos);
      r = s1.color[0] + (s2.color[0] - s1.color[0]) * frac;
      g = s1.color[1] + (s2.color[1] - s1.color[1]) * frac;
      b = s1.color[2] + (s2.color[2] - s1.color[2]) * frac;
      break;
    }
  }
  _tmpColor.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  return [_tmpColor.r, _tmpColor.g, _tmpColor.b];
}

export function sampleWaterDepthColor(depthM: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, depthM / 4.5));
  // Shallow bright cyan (#38bdf8) -> medium sky (#0284c7) -> deep cobalt (#1e3a8a)
  let r: number;
  let g: number;
  let b: number;
  if (t < 0.45) {
    const f = t / 0.45;
    r = 56 + (2 - 56) * f;
    g = 189 + (132 - 189) * f;
    b = 248 + (199 - 248) * f;
  } else {
    const f = (t - 0.45) / 0.55;
    r = 2 + (24 - 2) * f;
    g = 132 + (58 - 132) * f;
    b = 199 + (148 - 199) * f;
  }
  _tmpColor.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  return [_tmpColor.r, _tmpColor.g, _tmpColor.b];
}

function computeGeographicBoundsAndMetricSpan(
  bbox: [number, number, number, number],
  crsDef: string
): {
  isGeographic: boolean;
  effectiveCrsDef: string;
  wgs84Bounds: [[number, number], [number, number]];
  spanMetersX: number;
  spanMetersZ: number;
} {
  const [xll, yll, xur, yur] = bbox;
  const isGeographic =
    Math.abs(xll) <= 180 &&
    Math.abs(xur) <= 180 &&
    Math.abs(yll) <= 90 &&
    Math.abs(yur) <= 90;

  const effectiveCrsDef = isGeographic
    ? '+proj=longlat +datum=WGS84 +no_defs'
    : crsDef || '+proj=longlat +datum=WGS84 +no_defs';

  let wgs84Bounds: [[number, number], [number, number]];
  if (isGeographic) {
    wgs84Bounds = [
      [Math.min(yll, yur), Math.min(xll, xur)],
      [Math.max(yll, yur), Math.max(xll, xur)],
    ];
  } else {
    try {
      const toCRS = '+proj=longlat +datum=WGS84 +no_defs';
      const pSW = proj4(effectiveCrsDef, toCRS, [xll, yll]);
      const pNW = proj4(effectiveCrsDef, toCRS, [xll, yur]);
      const pNE = proj4(effectiveCrsDef, toCRS, [xur, yur]);
      const pSE = proj4(effectiveCrsDef, toCRS, [xur, yll]);
      const lats = [pSW[1], pNW[1], pNE[1], pSE[1]];
      const lons = [pSW[0], pNW[0], pNE[0], pSE[0]];
      wgs84Bounds = [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ];
    } catch {
      wgs84Bounds = [
        [39.0, 35.0],
        [39.01, 35.01],
      ];
    }
  }

  const rawSpanX = Math.max(1e-6, Math.abs(xur - xll));
  const rawSpanY = Math.max(1e-6, Math.abs(yur - yll));
  const midLatRad = (((wgs84Bounds[0][0] + wgs84Bounds[1][0]) / 2) * Math.PI) / 180;
  const spanMetersX = isGeographic ? rawSpanX * 111320 * Math.cos(midLatRad) : rawSpanX;
  const spanMetersZ = isGeographic ? rawSpanY * 111320 : rawSpanY;

  return {
    isGeographic,
    effectiveCrsDef,
    wgs84Bounds,
    spanMetersX: Math.max(1, spanMetersX),
    spanMetersZ: Math.max(1, spanMetersZ),
  };
}

function buildDownsampledGrid(
  rawData: Float32Array | Int16Array | Uint16Array,
  srcWidth: number,
  srcHeight: number,
  noDataVal: number,
  bbox: [number, number, number, number],
  crsDef: string
): Terrain3DGrid | null {
  if (!rawData || srcWidth < 2 || srcHeight < 2) return null;

  const scale = Math.min(1, TARGET_MAX_GRID / Math.max(srcWidth, srcHeight));
  const gridW = Math.max(2, Math.round(srcWidth * scale));
  const gridH = Math.max(2, Math.round(srcHeight * scale));

  const elevations = new Float32Array(gridW * gridH);
  let minElev = Infinity;
  let maxElev = -Infinity;

  for (let y = 0; y < gridH; y++) {
    const sy = Math.min(srcHeight - 1, Math.floor(((y + 0.5) / gridH) * srcHeight));
    const srcRow = sy * srcWidth;
    const dstRow = y * gridW;
    for (let x = 0; x < gridW; x++) {
      const sx = Math.min(srcWidth - 1, Math.floor(((x + 0.5) / gridW) * srcWidth));
      const v = rawData[srcRow + sx];
      if (isNaN(v) || v <= -9000 || v > 20000 || v === noDataVal) {
        elevations[dstRow + x] = NaN;
      } else {
        elevations[dstRow + x] = v;
        if (v < minElev) minElev = v;
        if (v > maxElev) maxElev = v;
      }
    }
  }

  if (!isFinite(minElev) || !isFinite(maxElev)) {
    return null;
  }

  const geo = computeGeographicBoundsAndMetricSpan(bbox, crsDef);
  const maxSpanM = Math.max(geo.spanMetersX, geo.spanMetersZ);
  const metersToWorld = WORLD_MAX_SPAN / maxSpanM;

  return {
    gridW,
    gridH,
    srcWidth,
    srcHeight,
    elevations,
    minElev,
    maxElev,
    spanMetersX: geo.spanMetersX,
    spanMetersZ: geo.spanMetersZ,
    metersToWorld,
    worldWidth: geo.spanMetersX * metersToWorld,
    worldDepth: geo.spanMetersZ * metersToWorld,
    xll: bbox[0],
    yll: bbox[1],
    xur: bbox[2],
    yur: bbox[3],
    isGeographic: geo.isGeographic,
    effectiveCrsDef: geo.effectiveCrsDef,
    wgs84Bounds: geo.wgs84Bounds,
  };
}

export function buildTerrainGridFromStaticDEM(
  dem: StaticDEMInput,
  crsDef: string
): Terrain3DGrid | null {
  const bbox: [number, number, number, number] = [
    dem.xll,
    dem.yll,
    dem.xll + dem.width * dem.cellSize,
    dem.yll + dem.height * dem.cellSize,
  ];
  return buildDownsampledGrid(dem.data, dem.width, dem.height, -9999, bbox, crsDef);
}

export async function buildTerrainGridFromFile(
  demFile: File,
  crsDef: string
): Promise<Terrain3DGrid | null> {
  const loaded = await loadDEM(demFile);
  const bbox: [number, number, number, number] = [
    loaded.bbox[0],
    loaded.bbox[1],
    loaded.bbox[2],
    loaded.bbox[3],
  ];
  return buildDownsampledGrid(
    loaded.data,
    loaded.width,
    loaded.height,
    loaded.noDataVal,
    bbox,
    crsDef
  );
}

/**
 * Generates indexed BufferGeometry buffers for the hypsometric DEM terrain mesh
 * and a dark basalt perimeter skirt down to baseY so the block feels grounded.
 */
export function buildTerrainMeshBuffers(grid: Terrain3DGrid): {
  terrain: MeshBufferData;
  skirt: MeshBufferData | null;
} {
  const { gridW, gridH, elevations, minElev, maxElev, worldWidth, worldDepth, metersToWorld } = grid;
  const totalVerts = gridW * gridH;
  const positions = new Float32Array(totalVerts * 3);
  const colors = new Float32Array(totalVerts * 3);
  const range = Math.max(0.01, maxElev - minElev);

  const halfW = worldWidth * 0.5;
  const halfD = worldDepth * 0.5;

  for (let y = 0; y < gridH; y++) {
    const zNorm = y / Math.max(1, gridH - 1);
    const wz = (zNorm - 0.5) * worldDepth; // Row 0 (North) => -halfD, South => +halfD
    const rowOff = y * gridW;
    for (let x = 0; x < gridW; x++) {
      const i = rowOff + x;
      const xNorm = x / Math.max(1, gridW - 1);
      const wx = (xNorm - 0.5) * worldWidth; // Col 0 (West) => -halfW, East => +halfW
      const elev = elevations[i];
      const valid = !isNaN(elev);
      const wy = valid ? (elev - minElev) * metersToWorld : 0;

      positions[i * 3] = wx;
      positions[i * 3 + 1] = wy;
      positions[i * 3 + 2] = wz;

      if (valid) {
        const [r, g, b] = sampleHypsometricColor((elev - minElev) / range);
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
      } else {
        colors[i * 3] = 0.1;
        colors[i * 3 + 1] = 0.12;
        colors[i * 3 + 2] = 0.15;
      }
    }
  }

  const maxIndices = (gridW - 1) * (gridH - 1) * 6;
  const tempIndices = new Uint32Array(maxIndices);
  let idxCount = 0;

  for (let y = 0; y < gridH - 1; y++) {
    const r0 = y * gridW;
    const r1 = (y + 1) * gridW;
    for (let x = 0; x < gridW - 1; x++) {
      const tl = r0 + x;
      const tr = tl + 1;
      const bl = r1 + x;
      const br = bl + 1;

      if (
        !isNaN(elevations[tl]) &&
        !isNaN(elevations[tr]) &&
        !isNaN(elevations[bl])
      ) {
        tempIndices[idxCount++] = tl;
        tempIndices[idxCount++] = bl;
        tempIndices[idxCount++] = tr;
      }
      if (
        !isNaN(elevations[tr]) &&
        !isNaN(elevations[bl]) &&
        !isNaN(elevations[br])
      ) {
        tempIndices[idxCount++] = tr;
        tempIndices[idxCount++] = bl;
        tempIndices[idxCount++] = br;
      }
    }
  }

  const indices = tempIndices.slice(0, idxCount);

  // Build crisp boundary skirt along valid outer edges down to y = -2.2
  const skirtBaseY = -Math.max(1.8, Math.min(4.5, (maxElev - minElev) * metersToWorld * 0.12));
  const skirtPosList: number[] = [];
  const skirtColList: number[] = [];
  const skirtIdxList: number[] = [];

  const isCellValid = (cx: number, cy: number): boolean => {
    if (cx < 0 || cx >= gridW || cy < 0 || cy >= gridH) return false;
    return !isNaN(elevations[cy * gridW + cx]);
  };

  const addSkirtSegment = (idxA: number, idxB: number) => {
    const baseVert = skirtPosList.length / 3;
    const ax = positions[idxA * 3];
    const ay = positions[idxA * 3 + 1];
    const az = positions[idxA * 3 + 2];
    const bx = positions[idxB * 3];
    const by = positions[idxB * 3 + 1];
    const bz = positions[idxB * 3 + 2];

    // Top A, Top B, Bottom A, Bottom B
    skirtPosList.push(ax, ay, az, bx, by, bz, ax, skirtBaseY, az, bx, skirtBaseY, bz);
    const topC = [0.22, 0.27, 0.34];
    const botC = [0.09, 0.12, 0.17];
    skirtColList.push(
      topC[0], topC[1], topC[2],
      topC[0], topC[1], topC[2],
      botC[0], botC[1], botC[2],
      botC[0], botC[1], botC[2]
    );
    skirtIdxList.push(baseVert, baseVert + 2, baseVert + 1, baseVert + 1, baseVert + 2, baseVert + 3);
  };

  // Perimeter edges of valid cells where neighbor quad is empty
  for (let y = 0; y < gridH - 1; y++) {
    for (let x = 0; x < gridW - 1; x++) {
      const tl = y * gridW + x;
      const tr = tl + 1;
      const bl = (y + 1) * gridW + x;
      const br = bl + 1;
      const hasQuad = isCellValid(x, y) && isCellValid(x + 1, y) && isCellValid(x, y + 1) && isCellValid(x + 1, y + 1);
      if (!hasQuad) continue;

      if (y === 0 || !(isCellValid(x, y - 1) && isCellValid(x + 1, y - 1))) {
        addSkirtSegment(tr, tl); // North edge outward
      }
      if (y === gridH - 2 || !(isCellValid(x, y + 2) && isCellValid(x + 1, y + 2))) {
        addSkirtSegment(bl, br); // South edge outward
      }
      if (x === 0 || !(isCellValid(x - 1, y) && isCellValid(x - 1, y + 1))) {
        addSkirtSegment(tl, bl); // West edge outward
      }
      if (x === gridW - 2 || !(isCellValid(x + 2, y) && isCellValid(x + 2, y + 1))) {
        addSkirtSegment(br, tr); // East edge outward
      }
    }
  }

  const skirt: MeshBufferData | null =
    skirtIdxList.length > 0
      ? {
          positions: new Float32Array(skirtPosList),
          colors: new Float32Array(skirtColList),
          indices: new Uint32Array(skirtIdxList),
          vertexCount: skirtPosList.length / 3,
          triangleCount: skirtIdxList.length / 3,
        }
      : null;

  void halfW;
  void halfD;

  return {
    terrain: {
      positions,
      colors,
      indices,
      vertexCount: totalVerts,
      triangleCount: indices.length / 3,
    },
    skirt,
  };
}

/**
 * Builds the 3D water surface mesh for Static Flood Simulation using the exact
 * connected flood mask and waterDepth raster.
 */
export function buildStaticWaterMesh(
  grid: Terrain3DGrid,
  srcDem: StaticDEMInput,
  waterDepth: Float32Array | null | undefined,
  connectedMask?: Uint8Array | null
): StaticWaterMeshResult {
  if (!waterDepth || waterDepth.length !== srcDem.width * srcDem.height) {
    return { buffers: null, wetVertexCount: 0, maxDepth: 0, floodAreaM2: 0 };
  }

  const { gridW, gridH, elevations, minElev, worldWidth, worldDepth, metersToWorld } = grid;
  const totalVerts = gridW * gridH;
  const sampledDepth = new Float32Array(totalVerts);
  const isWet = new Uint8Array(totalVerts);
  let wetVertexCount = 0;
  let maxDepth = 0;
  let rawWetCells = 0;

  for (let i = 0; i < waterDepth.length; i++) {
    if (waterDepth[i] > 0.01 && (!connectedMask || connectedMask[i] === 1)) {
      rawWetCells++;
    }
  }

  for (let y = 0; y < gridH; y++) {
    const sy = Math.min(srcDem.height - 1, Math.floor(((y + 0.5) / gridH) * srcDem.height));
    const srcRow = sy * srcDem.width;
    const dstRow = y * gridW;
    for (let x = 0; x < gridW; x++) {
      const sx = Math.min(srcDem.width - 1, Math.floor(((x + 0.5) / gridW) * srcDem.width));
      const sIdx = srcRow + sx;
      const dIdx = dstRow + x;
      const depth = waterDepth[sIdx];
      const conn = !connectedMask || connectedMask[sIdx] === 1;
      if (!isNaN(elevations[dIdx]) && conn && depth > 0.01) {
        sampledDepth[dIdx] = depth;
        isWet[dIdx] = 1;
        wetVertexCount++;
        if (depth > maxDepth) maxDepth = depth;
      }
    }
  }

  if (wetVertexCount === 0) {
    return { buffers: null, wetVertexCount: 0, maxDepth: 0, floodAreaM2: 0 };
  }

  const positions = new Float32Array(totalVerts * 3);
  const colors = new Float32Array(totalVerts * 3);
  const featherOffset = Math.max(0.02, 0.06 * metersToWorld);

  for (let y = 0; y < gridH; y++) {
    const wz = (y / Math.max(1, gridH - 1) - 0.5) * worldDepth;
    const rowOff = y * gridW;
    for (let x = 0; x < gridW; x++) {
      const i = rowOff + x;
      const wx = (x / Math.max(1, gridW - 1) - 0.5) * worldWidth;
      const terrElev = elevations[i];
      const valid = !isNaN(terrElev);

      positions[i * 3] = wx;
      positions[i * 3 + 2] = wz;

      if (valid && isWet[i]) {
        const wse = terrElev + sampledDepth[i];
        positions[i * 3 + 1] = (wse - minElev) * metersToWorld;
        const [r, g, b] = sampleWaterDepthColor(sampledDepth[i]);
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
      } else {
        positions[i * 3 + 1] = valid
          ? (terrElev - minElev) * metersToWorld - featherOffset
          : -10;
        const [r, g, b] = sampleWaterDepthColor(0.05);
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
      }
    }
  }

  const tempIndices = new Uint32Array((gridW - 1) * (gridH - 1) * 6);
  let idxCount = 0;

  for (let y = 0; y < gridH - 1; y++) {
    const r0 = y * gridW;
    const r1 = (y + 1) * gridW;
    for (let x = 0; x < gridW - 1; x++) {
      const tl = r0 + x;
      const tr = tl + 1;
      const bl = r1 + x;
      const br = bl + 1;

      if (
        !isNaN(elevations[tl]) &&
        !isNaN(elevations[tr]) &&
        !isNaN(elevations[bl]) &&
        (isWet[tl] || isWet[tr] || isWet[bl])
      ) {
        tempIndices[idxCount++] = tl;
        tempIndices[idxCount++] = bl;
        tempIndices[idxCount++] = tr;
      }
      if (
        !isNaN(elevations[tr]) &&
        !isNaN(elevations[bl]) &&
        !isNaN(elevations[br]) &&
        (isWet[tr] || isWet[bl] || isWet[br])
      ) {
        tempIndices[idxCount++] = tr;
        tempIndices[idxCount++] = bl;
        tempIndices[idxCount++] = br;
      }
    }
  }

  return {
    buffers:
      idxCount > 0
        ? {
            positions,
            colors,
            indices: tempIndices.slice(0, idxCount),
            vertexCount: totalVerts,
            triangleCount: idxCount / 3,
          }
        : null,
    wetVertexCount,
    maxDepth,
    floodAreaM2: rawWetCells * srcDem.cellSize * srcDem.cellSize,
  };
}

/**
 * Converts geographic [lat, lon] to terrain-grid normalized [gx, gy] pixel space.
 */
export function wgs84ToTerrainGridPixel(
  grid: Terrain3DGrid,
  lat: number,
  lon: number
): [number, number] {
  let px = lon;
  let py = lat;
  if (!grid.isGeographic) {
    try {
      [px, py] = proj4('EPSG:4326', grid.effectiveCrsDef, [lon, lat]);
    } catch {
      // fallback
    }
  }
  const spanX = Math.max(1e-9, grid.xur - grid.xll);
  const spanY = Math.max(1e-9, grid.yur - grid.yll);
  const gx = ((px - grid.xll) / spanX) * (grid.gridW - 1);
  const gy = ((grid.yur - py) / spanY) * (grid.gridH - 1);
  return [gx, gy];
}

/**
 * Samples terrain elevation (meters) at grid coordinates via bilinear interpolation.
 */
export function sampleElevationAtGrid(
  grid: Terrain3DGrid,
  gx: number,
  gy: number
): number | null {
  const x0 = Math.max(0, Math.min(grid.gridW - 1, Math.floor(gx)));
  const y0 = Math.max(0, Math.min(grid.gridH - 1, Math.floor(gy)));
  const x1 = Math.min(grid.gridW - 1, x0 + 1);
  const y1 = Math.min(grid.gridH - 1, y0 + 1);
  const fx = Math.max(0, Math.min(1, gx - x0));
  const fy = Math.max(0, Math.min(1, gy - y0));

  const z00 = grid.elevations[y0 * grid.gridW + x0];
  const z10 = grid.elevations[y0 * grid.gridW + x1];
  const z01 = grid.elevations[y1 * grid.gridW + x0];
  const z11 = grid.elevations[y1 * grid.gridW + x1];

  const vals = [
    { z: z00, w: (1 - fx) * (1 - fy) },
    { z: z10, w: fx * (1 - fy) },
    { z: z01, w: (1 - fx) * fy },
    { z: z11, w: fx * fy },
  ];
  let sum = 0;
  let wSum = 0;
  for (const item of vals) {
    if (!isNaN(item.z)) {
      sum += item.z * item.w;
      wSum += item.w;
    }
  }
  return wSum > 0.01 ? sum / wSum : null;
}

/**
 * Samples terrain elevation (meters) directly on the exact DEM triangle plane
 * rendered by buildTerrainMeshBuffers, with fallback to nearest valid cell near NoData borders.
 */
export function sampleTerrainMeshSurfaceElev(
  grid: Terrain3DGrid,
  gx: number,
  gy: number
): number | null {
  const { gridW, gridH, elevations } = grid;
  const cx = Math.max(0, Math.min(gridW - 1, gx));
  const cy = Math.max(0, Math.min(gridH - 1, gy));

  const x0 = Math.min(gridW - 2, Math.floor(cx));
  const y0 = Math.min(gridH - 2, Math.floor(cy));
  const fx = Math.max(0, Math.min(1, cx - x0));
  const fy = Math.max(0, Math.min(1, cy - y0));

  const tl = elevations[y0 * gridW + x0];
  const tr = elevations[y0 * gridW + (x0 + 1)];
  const bl = elevations[(y0 + 1) * gridW + x0];
  const br = elevations[(y0 + 1) * gridW + (x0 + 1)];

  // Exact match with buildTerrainMeshBuffers triangle split:
  // Upper-left tri: (tl, bl, tr) when fx + fy <= 1
  // Lower-right tri: (tr, bl, br) when fx + fy > 1
  if (fx + fy <= 1) {
    if (!isNaN(tl) && !isNaN(bl) && !isNaN(tr)) {
      const wTL = 1 - fx - fy;
      const wBL = fy;
      const wTR = fx;
      return wTL * tl + wBL * bl + wTR * tr;
    }
  } else {
    if (!isNaN(tr) && !isNaN(bl) && !isNaN(br)) {
      const wTR = 1 - fy;
      const wBL = 1 - fx;
      const wBR = fx + fy - 1;
      return wTR * tr + wBL * bl + wBR * br;
    }
  }

  // Fallback to valid bilinear corners inside this cell
  const bilinear = sampleElevationAtGrid(grid, cx, cy);
  if (bilinear !== null) return bilinear;

  // Fallback for KML vertices touching NoData/outer edge: nearest valid cell
  const ix = Math.round(cx);
  const iy = Math.round(cy);
  let bestDist = Infinity;
  let bestElev: number | null = null;
  for (let r = 1; r <= 16; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const nx = ix + dx;
        const ny = iy + dy;
        if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
        const v = elevations[ny * gridW + nx];
        if (!isNaN(v)) {
          const d = dx * dx + dy * dy;
          if (d < bestDist) {
            bestDist = d;
            bestElev = v;
          }
        }
      }
    }
    if (bestElev !== null) return bestElev;
  }

  return null;
}

/**
 * Converts geographic [lat, lon] to Three.js world space (x, baseY_at_1x, z).
 */
export function wgs84ToWorldPoint(
  grid: Terrain3DGrid,
  lat: number,
  lon: number,
  overrideElevationM?: number | null
): [number, number, number] | null {
  const [gx, gy] = wgs84ToTerrainGridPixel(grid, lat, lon);
  const wx = (gx / Math.max(1, grid.gridW - 1) - 0.5) * grid.worldWidth;
  const wz = (gy / Math.max(1, grid.gridH - 1) - 0.5) * grid.worldDepth;
  const elev =
    overrideElevationM !== undefined && overrideElevationM !== null
      ? overrideElevationM
      : sampleTerrainMeshSurfaceElev(grid, gx, gy);
  const wy =
    elev !== null ? (elev - grid.minElev) * grid.metersToWorld : 0;
  return [wx, wy, wz];
}

/**
 * Converts Three.js world coordinates (wx, wz) back to geographic [lat, lon].
 */
export function worldXZToLatLon(
  grid: Terrain3DGrid,
  wx: number,
  wz: number
): [number, number] {
  const u = Math.max(0, Math.min(1, wx / grid.worldWidth + 0.5));
  const v = Math.max(0, Math.min(1, wz / grid.worldDepth + 0.5));
  const px = grid.xll + u * (grid.xur - grid.xll);
  const py = grid.yur - v * (grid.yur - grid.yll);
  if (grid.isGeographic) {
    return [py, px];
  }
  try {
    const [lon, lat] = proj4(grid.effectiveCrsDef, 'EPSG:4326', [px, py]);
    return [lat, lon];
  } catch {
    return [py, px];
  }
}

/**
 * Precomputes quad-based reach mapping so any 1D time step can update the 3D water mesh in < 2 ms.
 */
export function precompute1DReachGridMapping(
  grid: Terrain3DGrid,
  sections: CrossSection[]
): ReachGridMapping | null {
  if (!sections || sections.length < 2) return null;

  const { gridW, gridH } = grid;
  const totalVerts = gridW * gridH;
  const secA = new Int32Array(totalVerts);
  const secB = new Int32Array(totalVerts);
  const longT = new Float32Array(totalVerts);
  secA.fill(-1);
  secB.fill(-1);

  interface GridSec {
    idx: number;
    lx: number;
    ly: number;
    cx: number;
    cy: number;
    rx: number;
    ry: number;
  }

  const gSecs: GridSec[] = [];
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    if (!sec.cutLine) continue;
    const [lx, ly] = wgs84ToTerrainGridPixel(grid, sec.cutLine[0][0], sec.cutLine[0][1]);
    const [rx, ry] = wgs84ToTerrainGridPixel(grid, sec.cutLine[1][0], sec.cutLine[1][1]);
    const cCoord = sec.centerCoord || [
      (sec.cutLine[0][0] + sec.cutLine[1][0]) / 2,
      (sec.cutLine[0][1] + sec.cutLine[1][1]) / 2,
    ];
    const [cx, cy] = wgs84ToTerrainGridPixel(grid, cCoord[0], cCoord[1]);
    gSecs.push({ idx: i, lx, ly, cx, cy, rx, ry });
  }

  if (gSecs.length < 2) return null;

  const rasterizeTri = (
    x0: number, y0: number, t0: number,
    x1: number, y1: number, t1: number,
    x2: number, y2: number, t2: number,
    idxA: number,
    idxB: number
  ) => {
    const minPx = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxPx = Math.min(gridW - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minPy = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxPy = Math.min(gridH - 1, Math.ceil(Math.max(y0, y1, y2)));
    const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (Math.abs(denom) < 1e-6) return;

    for (let py = minPy; py <= maxPy; py++) {
      const rowOff = py * gridW;
      for (let px = minPx; px <= maxPx; px++) {
        const w0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / denom;
        const w1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / denom;
        const w2 = 1 - w0 - w1;
        if (w0 >= -0.005 && w1 >= -0.005 && w2 >= -0.005) {
          const cell = rowOff + px;
          secA[cell] = idxA;
          secB[cell] = idxB;
          longT[cell] = Math.max(0, Math.min(1, w0 * t0 + w1 * t1 + w2 * t2));
        }
      }
    }
  };

  for (let i = 0; i < gSecs.length - 1; i++) {
    const a = gSecs[i];
    const b = gSecs[i + 1];
    rasterizeTri(a.lx, a.ly, 0, b.lx, b.ly, 1, b.rx, b.ry, 1, a.idx, b.idx);
    rasterizeTri(a.lx, a.ly, 0, b.rx, b.ry, 1, a.rx, a.ry, 0, a.idx, b.idx);
  }

  // Precompute centerline seed indices
  const seedSet = new Set<number>();
  for (let i = 0; i < gSecs.length - 1; i++) {
    const a = gSecs[i];
    const b = gSecs[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.cx - a.cx, b.cy - a.cy)));
    for (let s = 0; s <= steps; s++) {
      const f = s / steps;
      const sx = Math.round(a.cx + f * (b.cx - a.cx));
      const sy = Math.round(a.cy + f * (b.cy - a.cy));
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = sx + dx;
          const ny = sy + dy;
          if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) {
            seedSet.add(ny * gridW + nx);
          }
        }
      }
    }
  }

  return {
    secA,
    secB,
    longT,
    seedIndices: Int32Array.from(seedSet),
  };
}

/**
 * Generates 3D water mesh buffers for a given 1D routing result snapshot (time step or peak).
 */
export function build1DWaterMeshForResults(
  grid: Terrain3DGrid,
  mapping: ReachGridMapping,
  results: RoutingResult[]
): StaticWaterMeshResult {
  if (!results || results.length < 2) {
    return { buffers: null, wetVertexCount: 0, maxDepth: 0, floodAreaM2: 0 };
  }

  const { gridW, gridH, elevations, minElev, worldWidth, worldDepth, metersToWorld, spanMetersX, spanMetersZ } = grid;
  const totalVerts = gridW * gridH;
  const { secA, secB, longT, seedIndices } = mapping;

  const candidateWet = new Uint8Array(totalVerts);
  const wseArr = new Float32Array(totalVerts);
  wseArr.fill(NaN);

  for (let i = 0; i < totalVerts; i++) {
    const a = secA[i];
    const b = secB[i];
    if (a < 0 || b < 0 || a >= results.length || b >= results.length) continue;
    const demZ = elevations[i];
    if (isNaN(demZ)) continue;
    const wse = (1 - longT[i]) * results[a].waterElevation + longT[i] * results[b].waterElevation;
    wseArr[i] = wse;
    if (wse - demZ > 0.01) {
      candidateWet[i] = 1;
    }
  }

  // 8-connected BFS from channel centerline so isolated terrain depressions stay dry
  const connectedWet = new Uint8Array(totalVerts);
  const queue = new Int32Array(totalVerts);
  let qHead = 0;
  let qTail = 0;

  for (let s = 0; s < seedIndices.length; s++) {
    const idx = seedIndices[s];
    if (candidateWet[idx] && !connectedWet[idx]) {
      connectedWet[idx] = 1;
      queue[qTail++] = idx;
    }
  }

  const dirs = [-1, 1, -gridW, gridW, -gridW - 1, -gridW + 1, gridW - 1, gridW + 1];
  while (qHead < qTail) {
    const cur = queue[qHead++];
    const cx = cur % gridW;
    for (let k = 0; k < dirs.length; k++) {
      const nxt = cur + dirs[k];
      if (nxt < 0 || nxt >= totalVerts) continue;
      if (Math.abs((nxt % gridW) - cx) > 1) continue;
      if (candidateWet[nxt] && !connectedWet[nxt]) {
        connectedWet[nxt] = 1;
        queue[qTail++] = nxt;
      }
    }
  }

  if (qTail === 0) {
    return { buffers: null, wetVertexCount: 0, maxDepth: 0, floodAreaM2: 0 };
  }

  const positions = new Float32Array(totalVerts * 3);
  const colors = new Float32Array(totalVerts * 3);
  const featherOffset = Math.max(0.02, 0.06 * metersToWorld);
  let maxDepth = 0;

  for (let y = 0; y < gridH; y++) {
    const wz = (y / Math.max(1, gridH - 1) - 0.5) * worldDepth;
    const rowOff = y * gridW;
    for (let x = 0; x < gridW; x++) {
      const i = rowOff + x;
      const wx = (x / Math.max(1, gridW - 1) - 0.5) * worldWidth;
      const demZ = elevations[i];
      const valid = !isNaN(demZ);

      positions[i * 3] = wx;
      positions[i * 3 + 2] = wz;

      if (valid && connectedWet[i]) {
        const wse = wseArr[i];
        const depth = Math.max(0.01, wse - demZ);
        if (depth > maxDepth) maxDepth = depth;
        positions[i * 3 + 1] = (wse - minElev) * metersToWorld;
        const [r, g, b] = sampleWaterDepthColor(depth);
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
      } else {
        positions[i * 3 + 1] = valid
          ? (demZ - minElev) * metersToWorld - featherOffset
          : -10;
        const [r, g, b] = sampleWaterDepthColor(0.05);
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
      }
    }
  }

  const tempIndices = new Uint32Array((gridW - 1) * (gridH - 1) * 6);
  let idxCount = 0;

  for (let y = 0; y < gridH - 1; y++) {
    const r0 = y * gridW;
    const r1 = (y + 1) * gridW;
    for (let x = 0; x < gridW - 1; x++) {
      const tl = r0 + x;
      const tr = tl + 1;
      const bl = r1 + x;
      const br = bl + 1;

      if (
        !isNaN(elevations[tl]) &&
        !isNaN(elevations[tr]) &&
        !isNaN(elevations[bl]) &&
        (connectedWet[tl] || connectedWet[tr] || connectedWet[bl])
      ) {
        tempIndices[idxCount++] = tl;
        tempIndices[idxCount++] = bl;
        tempIndices[idxCount++] = tr;
      }
      if (
        !isNaN(elevations[tr]) &&
        !isNaN(elevations[bl]) &&
        !isNaN(elevations[br]) &&
        (connectedWet[tr] || connectedWet[bl] || connectedWet[br])
      ) {
        tempIndices[idxCount++] = tr;
        tempIndices[idxCount++] = bl;
        tempIndices[idxCount++] = br;
      }
    }
  }

  const cellAreaM2 =
    (spanMetersX / Math.max(1, gridW - 1)) * (spanMetersZ / Math.max(1, gridH - 1));

  return {
    buffers:
      idxCount > 0
        ? {
            positions,
            colors,
            indices: tempIndices.slice(0, idxCount),
            vertexCount: totalVerts,
            triangleCount: idxCount / 3,
          }
        : null,
    wetVertexCount: qTail,
    maxDepth,
    floodAreaM2: qTail * cellAreaM2,
  };
}

/**
 * Samples a polyline of [lat, lon] points at full DEM grid density so 3D lines hug
 * the exact terrain triangle surface without floating across valleys or cutting ridges.
 */
export function drapePolylineOverTerrain(
  grid: Terrain3DGrid,
  coords: [number, number][],
  verticalLiftWorld = 0.035,
  minSamplesPerSegment = 6
): Float32Array | null {
  if (!coords || coords.length < 2) return null;
  const pts: number[] = [];

  for (let i = 0; i < coords.length - 1; i++) {
    const [lat0, lon0] = coords[i];
    const [lat1, lon1] = coords[i + 1];
    const [gx0, gy0] = wgs84ToTerrainGridPixel(grid, lat0, lon0);
    const [gx1, gy1] = wgs84ToTerrainGridPixel(grid, lat1, lon1);
    const pixDist = Math.hypot(gx1 - gx0, gy1 - gy0);
    if (pixDist < 1e-5 && i < coords.length - 2) continue;

    const steps = Math.max(minSamplesPerSegment, Math.min(300, Math.ceil(pixDist * 2.5)));
    const endStep = i === coords.length - 2 ? steps : steps - 1;
    for (let s = 0; s <= endStep; s++) {
      const f = s / steps;
      const lat = lat0 + f * (lat1 - lat0);
      const lon = lon0 + f * (lon1 - lon0);
      const wp = wgs84ToWorldPoint(grid, lat, lon);
      if (wp) {
        pts.push(wp[0], wp[1] + verticalLiftWorld, wp[2]);
      }
    }
  }

  return pts.length >= 6 ? new Float32Array(pts) : null;
}

/**
 * Builds a continuous terrain-anchored boundary ribbon (curtain strip rooted into the DEM surface)
 * for KML study area polygons so the perimeter is visibly pinned to the 3D terrain relief.
 */
export function buildDrapedBoundaryRibbonBuffers(
  grid: Terrain3DGrid,
  coords: [number, number][],
  bottomOffsetWorld = -0.04,
  topOffsetWorld = 0.12
): { positions: Float32Array; indices: Uint32Array } | null {
  if (!coords || coords.length < 3) return null;

  const first = coords[0];
  const last = coords[coords.length - 1];
  const isClosed = Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-7;
  const ring = isClosed ? coords : [...coords, first];

  const samples: Array<[number, number, number]> = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const [lat0, lon0] = ring[i];
    const [lat1, lon1] = ring[i + 1];
    const [gx0, gy0] = wgs84ToTerrainGridPixel(grid, lat0, lon0);
    const [gx1, gy1] = wgs84ToTerrainGridPixel(grid, lat1, lon1);
    const pixDist = Math.hypot(gx1 - gx0, gy1 - gy0);
    if (pixDist < 1e-5 && i < ring.length - 2) continue;

    const steps = Math.max(4, Math.min(300, Math.ceil(pixDist * 2.5)));
    const endStep = i === ring.length - 2 ? steps : steps - 1;
    for (let s = 0; s <= endStep; s++) {
      const f = s / steps;
      const lat = lat0 + f * (lat1 - lat0);
      const lon = lon0 + f * (lon1 - lon0);
      const wp = wgs84ToWorldPoint(grid, lat, lon);
      if (wp) samples.push(wp);
    }
  }

  if (samples.length < 2) return null;

  const positions = new Float32Array(samples.length * 2 * 3);
  const indices = new Uint32Array((samples.length - 1) * 6);

  for (let i = 0; i < samples.length; i++) {
    const [x, y, z] = samples[i];
    const base = i * 6;
    // Bottom vertex anchored inside terrain surface
    positions[base] = x;
    positions[base + 1] = y + bottomOffsetWorld;
    positions[base + 2] = z;
    // Top vertex slightly above terrain surface
    positions[base + 3] = x;
    positions[base + 4] = y + topOffsetWorld;
    positions[base + 5] = z;
  }

  for (let i = 0; i < samples.length - 1; i++) {
    const b0 = i * 2;
    const t0 = b0 + 1;
    const b1 = b0 + 2;
    const t1 = b0 + 3;
    const idxOff = i * 6;
    indices[idxOff] = b0;
    indices[idxOff + 1] = b1;
    indices[idxOff + 2] = t0;
    indices[idxOff + 3] = t0;
    indices[idxOff + 4] = b1;
    indices[idxOff + 5] = t1;
  }

  return { positions, indices };
}

/**
 * Resolves 3D world placement for hydraulic structures (bridges / culverts).
 */
export function resolveStructureWorldPositions(
  grid: Terrain3DGrid,
  structures: HydraulicStructure[],
  sections: CrossSection[]
): Array<{
  structure: HydraulicStructure;
  x: number;
  baseY: number;
  z: number;
  yawRad: number;
  widthWorld: number;
}> {
  if (!structures || structures.length === 0) return [];
  const out: Array<{
    structure: HydraulicStructure;
    x: number;
    baseY: number;
    z: number;
    yawRad: number;
    widthWorld: number;
  }> = [];

  for (const st of structures) {
    let coord = st.coordinates;
    let yawRad = 0;
    let nearestSec: CrossSection | null = null;
    let minDiff = Infinity;
    for (const sec of sections) {
      const d = Math.abs(sec.station - st.station);
      if (d < minDiff) {
        minDiff = d;
        nearestSec = sec;
      }
    }
    if (!coord && nearestSec?.centerCoord) {
      coord = nearestSec.centerCoord;
    }
    if (!coord) continue;

    if (nearestSec?.cutLine) {
      const pL = wgs84ToWorldPoint(grid, nearestSec.cutLine[0][0], nearestSec.cutLine[0][1]);
      const pR = wgs84ToWorldPoint(grid, nearestSec.cutLine[1][0], nearestSec.cutLine[1][1]);
      if (pL && pR) {
        yawRad = Math.atan2(pR[2] - pL[2], pR[0] - pL[0]);
      }
    }

    const wp = wgs84ToWorldPoint(grid, coord[0], coord[1], st.roadElevation);
    if (!wp) continue;

    const spanM = Math.max(8, st.openingWidth * Math.max(1, st.barrelCount) + 4);
    out.push({
      structure: st,
      x: wp[0],
      baseY: wp[1],
      z: wp[2],
      yawRad,
      widthWorld: spanM * grid.metersToWorld,
    });
  }

  return out;
}
