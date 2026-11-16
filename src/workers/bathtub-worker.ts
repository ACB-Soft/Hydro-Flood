/**
 * Bathtub Flood Simulation Web Worker
 * Handles static water level calculations strictly within valid DEM data boundaries,
 * using a unified minimum depth threshold and guaranteed 4-neighbor source connectivity.
 */

import { MIN_FLOOD_DEPTH, enforceSourceConnectedFloodMask } from '../utils/floodMask';

self.onmessage = function(e) {
  const { dem, width, height, params } = e.data;
  const { sourceX, sourceY, waterLevel, levelMode, targetElevation: explicitTargetElev } = params;

  const size = width * height;
  const bathtubDepth = new Float32Array(size);
  const visited = new Uint8Array(size);

  if (
    width <= 0 ||
    height <= 0 ||
    sourceX < 0 ||
    sourceX >= width ||
    sourceY < 0 ||
    sourceY >= height
  ) {
    self.postMessage({ type: 'complete', waterDepth: bathtubDepth, sourceX, sourceY, floodedCount: 0 });
    return;
  }

  const startIdx = sourceY * width + sourceX;
  const sourceElev = dem[startIdx];
  if (isNaN(sourceElev) || sourceElev <= -9000) {
    self.postMessage({ type: 'complete', waterDepth: bathtubDepth, sourceX, sourceY, floodedCount: 0 });
    return;
  }

  // Calculate target water surface elevation:
  // - 'targetElev' mode: fills water strictly up to the given absolute elevation (e.g. 6.0m or 106.0m)
  // - 'increase' mode: fills water up to (source ground elevation + delta increase)
  let targetElevation: number;
  if (levelMode === 'targetElev' && typeof explicitTargetElev === 'number' && !isNaN(explicitTargetElev)) {
    targetElevation = explicitTargetElev;
  } else {
    targetElevation = sourceElev + (typeof waterLevel === 'number' ? waterLevel : 2.0);
  }

  // Propagate only through cells that strictly exceed MIN_FLOOD_DEPTH so shallow (0..1cm)
  // invisible bridge cells cannot carry water into visually disconnected pockets.
  const sourceDepth = targetElevation - sourceElev;
  if (!(sourceDepth > MIN_FLOOD_DEPTH)) {
    self.postMessage({ type: 'complete', waterDepth: bathtubDepth, sourceX, sourceY, floodedCount: 0 });
    return;
  }

  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;

  queue[tail++] = startIdx;
  visited[startIdx] = 1;

  while (head < tail) {
    const idx = queue[head++];
    const x = idx % width;
    const y = (idx - x) / width;

    const cellElev = dem[idx];
    if (isNaN(cellElev) || cellElev <= -9000) continue;

    const cellDepth = targetElevation - cellElev;
    if (!(cellDepth > MIN_FLOOD_DEPTH)) continue;

    bathtubDepth[idx] = cellDepth;

    // 4 edge-adjacent neighbors (N/S/E/W)
    if (x + 1 < width) {
      const nIdx = idx + 1;
      if (visited[nIdx] === 0) {
        const nElev = dem[nIdx];
        if (!isNaN(nElev) && nElev > -9000 && targetElevation - nElev > MIN_FLOOD_DEPTH) {
          visited[nIdx] = 1;
          queue[tail++] = nIdx;
        }
      }
    }

    if (x > 0) {
      const nIdx = idx - 1;
      if (visited[nIdx] === 0) {
        const nElev = dem[nIdx];
        if (!isNaN(nElev) && nElev > -9000 && targetElevation - nElev > MIN_FLOOD_DEPTH) {
          visited[nIdx] = 1;
          queue[tail++] = nIdx;
        }
      }
    }

    if (y + 1 < height) {
      const nIdx = idx + width;
      if (visited[nIdx] === 0) {
        const nElev = dem[nIdx];
        if (!isNaN(nElev) && nElev > -9000 && targetElevation - nElev > MIN_FLOOD_DEPTH) {
          visited[nIdx] = 1;
          queue[tail++] = nIdx;
        }
      }
    }

    if (y > 0) {
      const nIdx = idx - width;
      if (visited[nIdx] === 0) {
        const nElev = dem[nIdx];
        if (!isNaN(nElev) && nElev > -9000 && targetElevation - nElev > MIN_FLOOD_DEPTH) {
          visited[nIdx] = 1;
          queue[tail++] = nIdx;
        }
      }
    }

    // Periodic progress for very large areas
    if (head % 10000 === 0) {
      self.postMessage({ type: 'progress', step: head, total: size });
    }
  }

  // Deterministic connected-component verification anchored at (sourceX, sourceY)
  const connectedMask = enforceSourceConnectedFloodMask(
    bathtubDepth,
    dem,
    width,
    height,
    sourceX,
    sourceY,
    MIN_FLOOD_DEPTH
  );

  let floodedCount = 0;
  for (let i = 0; i < size; i++) {
    if (connectedMask[i] === 1) {
      floodedCount++;
    } else {
      bathtubDepth[i] = 0;
    }
  }

  self.postMessage({ type: 'complete', waterDepth: bathtubDepth, sourceX, sourceY, floodedCount });
};
