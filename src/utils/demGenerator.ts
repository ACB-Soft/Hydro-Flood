import Delaunator from 'delaunator';

export interface DEMPoint {
  x: number;
  y: number;
  z: number;
}

export interface DEMResult {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  meanZ: number;
  cols: number;
  rows: number;
  cellSize: number;
  grid: Float32Array; // 1D array of size cols * rows, NaN for no-data
  pointCount: number;
  triangleCount: number;
  points: DEMPoint[];
}

/**
 * Extracts 3D points from active layers of parsed DXF data
 */
export function extractPointsFromDXF(dxfData: any, activeLayerNames: Set<string>): DEMPoint[] {
  if (!dxfData || !dxfData.entities || !Array.isArray(dxfData.entities)) {
    return [];
  }

  const points: DEMPoint[] = [];

  const addPoint = (x: number, y: number, z: number | undefined) => {
    if (typeof x === 'number' && !isNaN(x) && typeof y === 'number' && !isNaN(y)) {
      const elevation = (typeof z === 'number' && !isNaN(z)) ? z : 0;
      points.push({ x, y, z: elevation });
    }
  };

  dxfData.entities.forEach((entity: any) => {
    if (!entity.layer || !activeLayerNames.has(entity.layer)) {
      return;
    }

    const type = entity.type;
    const entityElev = typeof entity.elevation === 'number' ? entity.elevation : undefined;

    if (type === 'POINT') {
      const pos = entity.position || (entity.vertices && entity.vertices[0]);
      if (pos) {
        addPoint(pos.x, pos.y, pos.z ?? entityElev);
      }
    } else if (type === 'LINE') {
      const v0 = entity.vertices ? entity.vertices[0] : entity.startPoint;
      const v1 = entity.vertices ? entity.vertices[1] : entity.endPoint;
      if (v0) addPoint(v0.x, v0.y, v0.z ?? entityElev);
      if (v1) addPoint(v1.x, v1.y, v1.z ?? entityElev);
    } else if (type === 'LWPOLYLINE' || type === 'POLYLINE' || type === '3DFACE' || type === 'SPLINE') {
      if (Array.isArray(entity.vertices)) {
        entity.vertices.forEach((v: any) => {
          addPoint(v.x, v.y, v.z ?? entityElev);
        });
      }
    } else if (type === 'TEXT' || type === 'MTEXT') {
      // Use text element Z coordinate if explicitly set, no string-to-number parsing
      const pt = entity.position || entity.startPoint || (entity.vertices && entity.vertices[0]);
      if (pt) {
        const explicitZ = pt.z ?? entityElev;
        if (typeof explicitZ === 'number' && !isNaN(explicitZ) && explicitZ !== 0) {
          addPoint(pt.x, pt.y, explicitZ);
        }
      }
    } else if (type === 'CIRCLE' || type === 'ARC') {
      if (entity.center) {
        addPoint(entity.center.x, entity.center.y, entity.center.z ?? entityElev);
      }
    }
  });

  return points;
}

/**
 * Deduplicates near-identical points to prevent Delaunator degeneracy
 */
export function deduplicatePoints(points: DEMPoint[], tol = 1e-5): DEMPoint[] {
  if (points.length <= 1) return points;

  const pointMap = new Map<string, DEMPoint>();
  
  for (const pt of points) {
    // Quantize to grid key
    const key = `${Math.round(pt.x / tol)}_${Math.round(pt.y / tol)}`;
    if (!pointMap.has(key)) {
      pointMap.set(key, pt);
    }
  }

  return Array.from(pointMap.values());
}

/**
 * Generates DEM using Delaunay Triangulation & TIN Rasterization
 */
export function generateTINDEM(pointsInput: DEMPoint[], cellSize: number): DEMResult {
  const points = deduplicatePoints(pointsInput);

  if (points.length < 3) {
    throw new Error('DEM üretmek için en az 3 geçerli koordinat (nokta) gereklidir.');
  }

  // Calculate Bounding Box & Elevation Range
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  let sumZ = 0;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
    sumZ += p.z;
  }

  const meanZ = sumZ / points.length;

  // Grid dimensions
  const width = Math.max(cellSize, maxX - minX);
  const height = Math.max(cellSize, maxY - minY);

  const cols = Math.max(1, Math.ceil(width / cellSize));
  const rows = Math.max(1, Math.ceil(height / cellSize));

  const grid = new Float32Array(cols * rows);
  grid.fill(NaN); // NaN represents no-data / uninterpolated cell

  // Delaunay Triangulation
  const coords = new Float64Array(points.length * 2);
  for (let i = 0; i < points.length; i++) {
    coords[2 * i] = points[i].x;
    coords[2 * i + 1] = points[i].y;
  }

  const delaunay = new Delaunator(coords);
  const triangles = delaunay.triangles; // Uint32Array [i0, i1, i2, ...]
  const triangleCount = Math.floor(triangles.length / 3);

  // Rasterize each triangle onto grid
  for (let t = 0; t < triangleCount; t++) {
    const i0 = triangles[3 * t];
    const i1 = triangles[3 * t + 1];
    const i2 = triangles[3 * t + 2];

    const p0 = points[i0];
    const p1 = points[i1];
    const p2 = points[i2];

    // Triangle Bounding Box in Grid Coordinates
    const triMinX = Math.min(p0.x, p1.x, p2.x);
    const triMaxX = Math.max(p0.x, p1.x, p2.x);
    const triMinY = Math.min(p0.y, p1.y, p2.y);
    const triMaxY = Math.max(p0.y, p1.y, p2.y);

    const cMin = Math.max(0, Math.floor((triMinX - minX) / cellSize));
    const cMax = Math.min(cols - 1, Math.ceil((triMaxX - minX) / cellSize));
    const rMin = Math.max(0, Math.floor((triMinY - minY) / cellSize));
    const rMax = Math.min(rows - 1, Math.ceil((triMaxY - minY) / cellSize));

    const denom = (p1.y - p2.y) * (p0.x - p2.x) + (p2.x - p1.x) * (p0.y - p2.y);
    if (Math.abs(denom) < 1e-12) continue; // Ignore degenerate triangle

    for (let r = rMin; r <= rMax; r++) {
      const py = minY + (r + 0.5) * cellSize;
      for (let c = cMin; c <= cMax; c++) {
        const px = minX + (c + 0.5) * cellSize;

        // Barycentric weights
        const w0 = ((p1.y - p2.y) * (px - p2.x) + (p2.x - p1.x) * (py - p2.y)) / denom;
        const w1 = ((p2.y - p0.y) * (px - p2.x) + (p0.x - p2.x) * (py - p2.y)) / denom;
        const w2 = 1 - w0 - w1;

        if (w0 >= -1e-5 && w1 >= -1e-5 && w2 >= -1e-5) {
          const z = w0 * p0.z + w1 * p1.z + w2 * p2.z;
          grid[r * cols + c] = z;
        }
      }
    }
  }

  // Fallback for empty cells (optional IDW fill for small gaps inside convex hull boundary)
  // Re-calculate minZ and maxZ based on grid
  let actualMinZ = Infinity;
  let actualMaxZ = -Infinity;
  let gridSumZ = 0;
  let validCellCount = 0;

  for (let i = 0; i < grid.length; i++) {
    const val = grid[i];
    if (!isNaN(val)) {
      if (val < actualMinZ) actualMinZ = val;
      if (val > actualMaxZ) actualMaxZ = val;
      gridSumZ += val;
      validCellCount++;
    }
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    minZ: actualMinZ === Infinity ? minZ : actualMinZ,
    maxZ: actualMaxZ === -Infinity ? maxZ : actualMaxZ,
    meanZ: validCellCount > 0 ? gridSumZ / validCellCount : meanZ,
    cols,
    rows,
    cellSize,
    grid,
    pointCount: points.length,
    triangleCount,
    points
  };
}

/**
 * Color mapper for terrain heightmaps with Hypsometric Relief Gradient
 */
export function getElevationColor(z: number, minZ: number, maxZ: number): { r: number; g: number; b: number } {
  if (isNaN(z)) {
    return { r: 15, g: 23, b: 42 };
  }

  const range = Math.max(0.001, maxZ - minZ);
  const val = Math.max(0, Math.min(1, (z - minZ) / range));

  const stops = [
    { pos: 0.00, color: [16, 124, 65] },   // Deep Valley / Basin Green
    { pos: 0.15, color: [70, 175, 90] },   // Meadow Green
    { pos: 0.35, color: [235, 215, 110] }, // Sunlit Lowland Gold
    { pos: 0.55, color: [205, 125, 45] },  // Terracotta Hillside
    { pos: 0.75, color: [140, 75, 35] },   // High Mountain Brown
    { pos: 0.90, color: [160, 165, 175] }, // Alpine Slate Ridge
    { pos: 1.00, color: [250, 250, 255] }  // Summit Snow White
  ];

  let r = 255, g_col = 255, b_col = 255;
  for (let s = 0; s < stops.length - 1; s++) {
    const s1 = stops[s];
    const s2 = stops[s + 1];
    if (val >= s1.pos && val <= s2.pos) {
      const f = (val - s1.pos) / (s2.pos - s1.pos);
      r = s1.color[0] + (s2.color[0] - s1.color[0]) * f;
      g_col = s1.color[1] + (s2.color[1] - s1.color[1]) * f;
      b_col = s1.color[2] + (s2.color[2] - s1.color[2]) * f;
      break;
    }
  }

  return { r, g: g_col, b: b_col };
}

/**
 * Renders DEM Grid onto HTML Canvas with Horn's 3x3 Hillshade & Hypsometric Tinting
 */
export function renderDEMToCanvas(
  canvas: HTMLCanvasElement,
  dem: DEMResult
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = dem.cols;
  const height = dem.rows;

  canvas.width = width;
  canvas.height = height;

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  // Hillshade Sun parameters (Azimuth: 315 deg NW, Altitude/Zenith: 45 deg)
  const zenith_rad = (90 - 45) * Math.PI / 180;
  const azimuth_rad = (360 - 315 + 90) * Math.PI / 180;
  const zFactor = 1.0;
  const cellSize = dem.cellSize;

  // Render row-by-row (y inverted for standard map orientation)
  for (let r = 0; r < height; r++) {
    const mapR = height - 1 - r; // Canvas top is Y=0, map Y goes upwards
    for (let c = 0; c < width; c++) {
      const idx = (r * width + c) * 4;
      const cellVal = dem.grid[mapR * width + c];

      if (isNaN(cellVal)) {
        data[idx] = 15;
        data[idx + 1] = 23;
        data[idx + 2] = 42;
        data[idx + 3] = 0; // Transparent no-data
        continue;
      }

      // 1. Calculate Hillshade using Horn's 3x3 neighborhood algorithm
      let hillshade = 1.0;
      if (c > 0 && c < width - 1 && mapR > 0 && mapR < height - 1) {
        const getSafe = (row: number, col: number) => {
          const v = dem.grid[row * width + col];
          return (!isNaN(v)) ? v : cellVal;
        };

        const a = getSafe(mapR - 1, c - 1);
        const b = getSafe(mapR - 1, c);
        const ch = getSafe(mapR - 1, c + 1);
        const d_val = getSafe(mapR, c - 1);
        const f = getSafe(mapR, c + 1);
        const g = getSafe(mapR + 1, c - 1);
        const h = getSafe(mapR + 1, c);
        const k = getSafe(mapR + 1, c + 1);

        const dz_dx = ((ch + 2 * f + k) - (a + 2 * d_val + g)) / (8 * cellSize);
        const dz_dy = ((g + 2 * h + k) - (a + 2 * b + ch)) / (8 * cellSize);

        const slope_rad = Math.atan(zFactor * Math.sqrt(dz_dx * dz_dx + dz_dy * dz_dy));
        let aspect_rad = 0;
        if (dz_dx !== 0) {
          aspect_rad = Math.atan2(dz_dy, -dz_dx);
          if (aspect_rad < 0) aspect_rad += 2 * Math.PI;
        } else {
          if (dz_dy > 0) aspect_rad = Math.PI / 2;
          else if (dz_dy < 0) aspect_rad = 2 * Math.PI - Math.PI / 2;
          else aspect_rad = 0;
        }

        hillshade = Math.max(0, Math.cos(zenith_rad) * Math.cos(slope_rad) +
                    Math.sin(zenith_rad) * Math.sin(slope_rad) * Math.cos(azimuth_rad - aspect_rad));
      }

      // 2. Hypsometric Elevation Color
      const { r: cr, g: cg, b: cb } = getElevationColor(cellVal, dem.minZ, dem.maxZ);

      // 3. Blend Hypsometric Tint with Hillshade Light Intensity
      const factor = 0.6 + (hillshade * 0.5);
      data[idx] = Math.min(255, cr * factor);
      data[idx + 1] = Math.min(255, cg * factor);
      data[idx + 2] = Math.min(255, cb * factor);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Export DEM as ESRI ASCII Raster (.asc)
 */
export function exportDEMToASC(dem: DEMResult, filename = 'dem_export.asc') {
  const lines: string[] = [
    `ncols         ${dem.cols}`,
    `nrows         ${dem.rows}`,
    `xllcorner     ${dem.minX.toFixed(3)}`,
    `yllcorner     ${dem.minY.toFixed(3)}`,
    `cellsize      ${dem.cellSize}`,
    `NODATA_value  -9999`
  ];

  for (let r = dem.rows - 1; r >= 0; r--) {
    const rowVals: string[] = [];
    for (let c = 0; c < dem.cols; c++) {
      const val = dem.grid[r * dem.cols + c];
      rowVals.push(isNaN(val) ? '-9999' : val.toFixed(2));
    }
    lines.push(rowVals.join(' '));
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Export DEM as CSV (X, Y, Elevation)
 */
export function exportDEMToCSV(dem: DEMResult, filename = 'dem_points.csv') {
  const lines: string[] = ['X,Y,Elevation'];

  for (let r = 0; r < dem.rows; r++) {
    const py = dem.minY + (r + 0.5) * dem.cellSize;
    for (let c = 0; c < dem.cols; c++) {
      const px = dem.minX + (c + 0.5) * dem.cellSize;
      const z = dem.grid[r * dem.cols + c];
      if (!isNaN(z)) {
        lines.push(`${px.toFixed(3)},${py.toFixed(3)},${z.toFixed(2)}`);
      }
    }
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
