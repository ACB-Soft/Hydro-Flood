/**
 * Flow Accumulation Web Worker
 * Handles D8 flow accumulation calculations
 */

self.onmessage = function(e) {
  const { dem, width, height, params } = e.data;
  const { cellSize = 10 } = params;
  const accumulation = new Float32Array(width * height).fill(1); // Each cell starts with 1 unit of area
  
  // Sort indices by elevation descending
  const indices = new Int32Array(width * height);
  for (let i = 0; i < indices.length; i++) indices[i] = i;
  indices.sort((a, b) => dem[b] - dem[a]);

  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    const x = idx % width;
    const y = Math.floor(idx / width);

    if (x === 0 || x === width - 1 || y === 0 || y === height - 1) continue;

    // Find steepest neighbor (D8)
    let maxDrop = -1;
    let targetIdx = -1;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const ni = (y + dy) * width + (x + dx);
        const dist = (dx !== 0 && dy !== 0) ? Math.SQRT2 : 1;
        const drop = (dem[idx] - dem[ni]) / dist;
        if (drop > maxDrop) {
          maxDrop = drop;
          targetIdx = ni;
        }
      }
    }

    if (targetIdx !== -1 && maxDrop > 0) {
      accumulation[targetIdx] += accumulation[idx];
    }
  }

  self.postMessage({ type: 'flow_accumulation_complete', accumulation });
};
