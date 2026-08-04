import proj4 from 'proj4';

export interface DEMData {
  data: Float32Array;
  width: number;
  height: number;
  xll: number;
  yll: number;
  cellSize: number;
}

/**
 * Extracts exact outer boundary polygon(s) of valid (non-NaN) DEM grid cells.
 * Replaces simple 4-corner bounding box logic with exact boundary loop tracing.
 * Returns array of loops where each loop is an array of [lon, lat] points in WGS84.
 */
export function extractDemBoundaryPolygons(
  dem: DEMData,
  crsDef?: string
): number[][][] {
  const { data, width, height, xll, yll, cellSize } = dem;
  if (!data || width <= 0 || height <= 0) return [];

  // 1. Create a boolean mask of valid cells
  const valid = new Uint8Array(width * height);
  let validCount = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (!isNaN(v) && v > -9000) {
      valid[i] = 1;
      validCount++;
    }
  }

  if (validCount === 0) return [];

  // 2. Extract directed boundary edges
  interface Edge {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }

  const edges: Edge[] = [];

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      if (!valid[rowOffset + x]) continue;

      // Top edge (y-1 invalid or boundary)
      if (y === 0 || !valid[(y - 1) * width + x]) {
        edges.push({ x1: x, y1: y, x2: x + 1, y2: y });
      }
      // Right edge (x+1 invalid or boundary)
      if (x === width - 1 || !valid[rowOffset + (x + 1)]) {
        edges.push({ x1: x + 1, y1: y, x2: x + 1, y2: y + 1 });
      }
      // Bottom edge (y+1 invalid or boundary)
      if (y === height - 1 || !valid[(y + 1) * width + x]) {
        edges.push({ x1: x + 1, y1: y + 1, x2: x, y2: y + 1 });
      }
      // Left edge (x-1 invalid or boundary)
      if (x === 0 || !valid[rowOffset + (x - 1)]) {
        edges.push({ x1: x, y1: y + 1, x2: x, y2: y });
      }
    }
  }

  if (edges.length === 0) return [];

  // 3. Assemble directed edges into closed polygon loops
  const adjMap = new Map<string, Edge[]>();
  for (const edge of edges) {
    const key = `${edge.x1},${edge.y1}`;
    let list = adjMap.get(key);
    if (!list) {
      list = [];
      adjMap.set(key, list);
    }
    list.push(edge);
  }

  const visited = new Set<Edge>();
  const rawLoops: [number, number][][] = [];

  for (const edge of edges) {
    if (visited.has(edge)) continue;

    const loop: [number, number][] = [];
    let curr: Edge | null = edge;

    while (curr && !visited.has(curr)) {
      visited.add(curr);
      loop.push([curr.x1, curr.y1]);

      const nextKey = `${curr.x2},${curr.y2}`;
      const candidates = adjMap.get(nextKey);
      curr = candidates ? (candidates.find(e => !visited.has(e)) || null) : null;
    }

    if (loop.length >= 3) {
      loop.push([loop[0][0], loop[0][1]]); // Close ring
      rawLoops.push(loop);
    }
  }

  // 4. Transform grid corner (gx, gy) -> WGS84 [lon, lat] & simplify colinear points
  const transformPoint = (gx: number, gy: number): [number, number] => {
    const px = xll + gx * cellSize;
    const py = yll + (height - gy) * cellSize;

    if (!crsDef || crsDef === 'NONE' || crsDef === 'EPSG:4326') {
      return [px, py];
    }
    try {
      const p = proj4(crsDef, 'EPSG:4326', [px, py]);
      if (p && !isNaN(p[0]) && !isNaN(p[1])) {
        return [p[0], p[1]]; // [lon, lat]
      }
    } catch (e) {
      // Fallback
    }
    return [px, py];
  };

  const finalWgsLoops: number[][][] = [];

  for (const rawLoop of rawLoops) {
    const simplified: [number, number][] = [];
    for (let i = 0; i < rawLoop.length - 1; i++) {
      const pPrev = simplified.length > 0 ? simplified[simplified.length - 1] : rawLoop[rawLoop.length - 2];
      const pCurr = rawLoop[i];
      const pNext = rawLoop[i + 1];

      const dx1 = pCurr[0] - pPrev[0];
      const dy1 = pCurr[1] - pPrev[1];
      const dx2 = pNext[0] - pCurr[0];
      const dy2 = pNext[1] - pCurr[1];

      const cross = dx1 * dy2 - dy1 * dx2;
      if (simplified.length === 0 || cross !== 0) {
        simplified.push(pCurr);
      }
    }

    if (simplified.length >= 3) {
      simplified.push(simplified[0]);
      const wgsLoop = simplified.map(([gx, gy]) => transformPoint(gx, gy));
      finalWgsLoops.push(wgsLoop);
    }
  }

  // Sort loops by vertex count descending so primary outer boundary loop comes first
  finalWgsLoops.sort((a, b) => b.length - a.length);

  return finalWgsLoops;
}
