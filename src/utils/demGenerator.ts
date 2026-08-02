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
 * Color mapper for terrain heightmaps (Hypsometric Terrain Palette)
 */
export function getElevationColor(z: number, minZ: number, maxZ: number): { r: number; g: number; b: number } {
  if (isNaN(z)) {
    return { r: 15, g: 23, b: 42 }; // Dark background for no-data
  }

  const range = maxZ - minZ;
  const t = range <= 0 ? 0.5 : Math.max(0, Math.min(1, (z - minZ) / range));

  // Hypsometric tint stops: Deep Blue -> Emerald -> Yellow/Green -> Yellow -> Brown -> White
  if (t < 0.2) {
    const factor = t / 0.2;
    return {
      r: Math.round(16 + factor * (34 - 16)),
      g: Math.round(185 + factor * (197 - 185)),
      b: Math.round(129 + factor * (94 - 129))
    }; // Deep Green/Emerald
  } else if (t < 0.4) {
    const factor = (t - 0.2) / 0.2;
    return {
      r: Math.round(34 + factor * (163 - 34)),
      g: Math.round(197 + factor * (230 - 197)),
      b: Math.round(94 + factor * (53 - 94))
    }; // Greenish-Yellow
  } else if (t < 0.65) {
    const factor = (t - 0.4) / 0.25;
    return {
      r: Math.round(163 + factor * (234 - 163)),
      g: Math.round(230 + factor * (179 - 230)),
      b: Math.round(53 + factor * (8 - 53))
    }; // Yellow to Warm Amber
  } else if (t < 0.85) {
    const factor = (t - 0.65) / 0.2;
    return {
      r: Math.round(234 + factor * (180 - 234)),
      g: Math.round(179 + factor * (83 - 179)),
      b: Math.round(8 + factor * (9 - 8))
    }; // Amber to Saddle Brown
  } else {
    const factor = (t - 0.85) / 0.15;
    return {
      r: Math.round(180 + factor * (255 - 180)),
      g: Math.round(83 + factor * (255 - 83)),
      b: Math.round(9 + factor * (255 - 9))
    }; // Brown to Snow White
  }
}

/**
 * Renders DEM Grid onto HTML Canvas
 */
export function renderDEMToCanvas(
  canvas: HTMLCanvasElement,
  dem: DEMResult,
  showContours = true,
  contourInterval = 5
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = dem.cols;
  const height = dem.rows;

  canvas.width = width;
  canvas.height = height;

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  // Render row-by-row (y inverted for standard map orientation)
  for (let r = 0; r < height; r++) {
    const mapR = height - 1 - r; // Canvas top is Y=0, map Y goes upwards
    for (let c = 0; c < width; c++) {
      const idx = (r * width + c) * 4;
      const z = dem.grid[mapR * width + c];

      if (isNaN(z)) {
        data[idx] = 15;
        data[idx + 1] = 23;
        data[idx + 2] = 42;
        data[idx + 3] = 0; // Transparent no-data
      } else {
        const { r: cr, g: cg, b: cb } = getElevationColor(z, dem.minZ, dem.maxZ);
        data[idx] = cr;
        data[idx + 1] = cg;
        data[idx + 2] = cb;
        data[idx + 3] = 255;

        // Contour lines overlay
        if (showContours && contourInterval > 0) {
          const mod = Math.abs(z % contourInterval);
          if (mod < (dem.maxZ - dem.minZ) / 200 || mod > contourInterval - ((dem.maxZ - dem.minZ) / 200)) {
            data[idx] = 0;
            data[idx + 1] = 0;
            data[idx + 2] = 0;
            data[idx + 3] = 180;
          }
        }
      }
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
