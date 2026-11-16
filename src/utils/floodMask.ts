/**
 * Shared flood threshold and source-connectivity utilities.
 * Ensures the simulation worker, map canvas, statistics, and KML export
 * all use the exact same flooding rule and connected-component mask.
 */

export const MIN_FLOOD_DEPTH = 0.01; // meters (1 cm)

export function isCellFlooded(depth: number, minDepth: number = MIN_FLOOD_DEPTH): boolean {
  return Number.isFinite(depth) && depth > minDepth;
}

/**
 * Extracts a strictly 4-connected binary flood mask anchored at (sourceX, sourceY).
 * Only cells with valid DEM elevations and waterDepth > minDepth reachable
 * via edge-adjacent (N/S/E/W) flooded neighbors from the source cell are kept.
 */
export function enforceSourceConnectedFloodMask(
  waterDepth: Float32Array,
  demData: Float32Array,
  width: number,
  height: number,
  sourceX: number,
  sourceY: number,
  minDepth: number = MIN_FLOOD_DEPTH
): Uint8Array {
  const size = width * height;
  const mask = new Uint8Array(size);

  if (
    width <= 0 ||
    height <= 0 ||
    waterDepth.length !== size ||
    demData.length !== size ||
    sourceX < 0 ||
    sourceX >= width ||
    sourceY < 0 ||
    sourceY >= height
  ) {
    return mask;
  }

  const startIdx = sourceY * width + sourceX;
  const startDem = demData[startIdx];
  if (isNaN(startDem) || startDem <= -9000 || !(waterDepth[startIdx] > minDepth)) {
    return mask;
  }

  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;

  mask[startIdx] = 1;
  queue[tail++] = startIdx;

  while (head < tail) {
    const idx = queue[head++];
    const x = idx % width;
    const y = (idx - x) / width;

    // Left
    if (x > 0) {
      const nIdx = idx - 1;
      if (mask[nIdx] === 0 && waterDepth[nIdx] > minDepth) {
        const nElev = demData[nIdx];
        if (!isNaN(nElev) && nElev > -9000) {
          mask[nIdx] = 1;
          queue[tail++] = nIdx;
        }
      }
    }

    // Right
    if (x + 1 < width) {
      const nIdx = idx + 1;
      if (mask[nIdx] === 0 && waterDepth[nIdx] > minDepth) {
        const nElev = demData[nIdx];
        if (!isNaN(nElev) && nElev > -9000) {
          mask[nIdx] = 1;
          queue[tail++] = nIdx;
        }
      }
    }

    // Up
    if (y > 0) {
      const nIdx = idx - width;
      if (mask[nIdx] === 0 && waterDepth[nIdx] > minDepth) {
        const nElev = demData[nIdx];
        if (!isNaN(nElev) && nElev > -9000) {
          mask[nIdx] = 1;
          queue[tail++] = nIdx;
        }
      }
    }

    // Down
    if (y + 1 < height) {
      const nIdx = idx + width;
      if (mask[nIdx] === 0 && waterDepth[nIdx] > minDepth) {
        const nElev = demData[nIdx];
        if (!isNaN(nElev) && nElev > -9000) {
          mask[nIdx] = 1;
          queue[tail++] = nIdx;
        }
      }
    }
  }

  return mask;
}
