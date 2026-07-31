/**
 * Bathtub Flood Simulation Web Worker
 * Handles static water level calculations strictly within valid DEM data boundaries.
 */

self.onmessage = function(e) {
  const { dem, width, height, areaMask, params } = e.data;
  const { sourceX, sourceY, waterLevel } = params;
  
  const bathtubDepth = new Float32Array(width * height).fill(0);
  const visited = new Uint8Array(width * height);
  
  const startIdx = sourceY * width + sourceX;
  if (startIdx < 0 || startIdx >= width * height) {
    self.postMessage({ type: 'complete', waterDepth: bathtubDepth });
    return;
  }

  const sourceElev = dem[startIdx];
  if (isNaN(sourceElev) || sourceElev <= -9000) {
    self.postMessage({ type: 'complete', waterDepth: bathtubDepth });
    return;
  }

  const targetElevation = sourceElev + waterLevel;
  
  const queue = [startIdx];
  visited[startIdx] = 1;
  
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const x = idx % width;
    const y = Math.floor(idx / width);

    const cellElev = dem[idx];
    if (isNaN(cellElev) || cellElev <= -9000) continue;
    
    // Calculate water depth for current cell
    bathtubDepth[idx] = Math.max(0, targetElevation - cellElev);
    
  // 4 neighbors
  const neighbors = [
    { nx: x + 1, ny: y },
    { nx: x - 1, ny: y },
    { nx: x, ny: y + 1 },
    { nx: x, ny: y - 1 }
  ];
  
  for (const { nx, ny } of neighbors) {
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
      const nIdx = ny * width + nx;

      // Strict boundary validation:
      // 1. Must not be visited
      // 2. Must be a valid DEM cell (not NoData, NaN, or <= -9000)
      // 3. Terrain elevation must be <= targetElevation
      const nElev = dem[nIdx];
      const isValidCell = !isNaN(nElev) && nElev > -9000;

      if (!visited[nIdx] && isValidCell && nElev <= targetElevation) {
        visited[nIdx] = 1;
        queue.push(nIdx);
      }
    }
  }
  
  // Periodic progress for very large areas
  if (head % 10000 === 0) {
    self.postMessage({ type: 'progress', step: head, total: width * height });
  }
}

// If areaMask is provided, clip bathtubDepth to the study area mask
if (areaMask && areaMask.length === bathtubDepth.length) {
  for (let i = 0; i < bathtubDepth.length; i++) {
    if (areaMask[i] === 0) {
      bathtubDepth[i] = 0;
    }
  }
}

self.postMessage({ type: 'complete', waterDepth: bathtubDepth });
};

