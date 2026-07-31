/**
 * Flow Accumulation Web Worker
 * Handles D8 flow accumulation calculations strictly within valid DEM data.
 */

self.onmessage = function(e) {
  const { dem, width, height, params } = e.data;
  const accumulation = new Float32Array(width * height).fill(1); // Each cell starts with 1 unit of area
  
  // Sort indices by elevation descending, putting NaN / NoData at the end
  const indices = new Int32Array(width * height);
  for (let i = 0; i < indices.length; i++) indices[i] = i;
  indices.sort((a, b) => {
    const ea = dem[a];
    const eb = dem[b];
    const validA = !isNaN(ea) && ea > -9000;
    const validB = !isNaN(eb) && eb > -9000;
    if (!validA && !validB) return 0;
    if (!validA) return 1;
    if (!validB) return -1;
    return eb - ea;
  });

  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    const elev = dem[idx];
    if (isNaN(elev) || elev <= -9000) continue;

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
        const nElev = dem[ni];
        if (isNaN(nElev) || nElev <= -9000) continue;

        const dist = (dx !== 0 && dy !== 0) ? Math.SQRT2 : 1;
        const drop = (elev - nElev) / dist;
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

