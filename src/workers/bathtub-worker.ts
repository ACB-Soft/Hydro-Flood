/**
 * Bathtub Flood Simulation Web Worker
 * Handles static water level calculations
 */

self.onmessage = function(e) {
  const { dem, width, height, params } = e.data;
  const { sourceX, sourceY, waterLevel } = params;
  
  const bathtubDepth = new Float32Array(width * height).fill(0);
  const visited = new Uint8Array(width * height);
  
  const startIdx = sourceY * width + sourceX;
  const targetElevation = dem[startIdx] + waterLevel;
  
  const queue = [startIdx];
  visited[startIdx] = 1;
  
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const x = idx % width;
    const y = Math.floor(idx / width);
    
    bathtubDepth[idx] = Math.max(0, targetElevation - dem[idx]);
    
    // Check 4 neighbors
    const neighbors = [
      { nx: x + 1, ny: y },
      { nx: x - 1, ny: y },
      { nx: x, ny: y + 1 },
      { nx: x, ny: y - 1 }
    ];
    
    for (const { nx, ny } of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIdx = ny * width + nx;
        if (!visited[nIdx] && dem[nIdx] <= targetElevation) {
          visited[nIdx] = 1;
          queue.push(nIdx);
        }
      }
    }
    
    // Periodic progress for very large areas
    if (head % 10000 === 0) {
      self.postMessage({ type: 'progress', step: head, total: width * height, waterDepth: bathtubDepth });
    }
  }
  
  self.postMessage({ type: 'complete', waterDepth: bathtubDepth });
};
