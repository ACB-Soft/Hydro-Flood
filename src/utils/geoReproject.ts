import proj4 from 'proj4';

export interface DEMInfo {
  width: number;
  height: number;
  xll: number;
  yll: number;
  cellSize: number;
  cellSizeY?: number;
}

/**
 * Reprojects a source raster canvas (rendered in DEM's native projected CRS)
 * into an exact WGS84 (EPSG:4326) image aligned with Leaflet's ImageOverlay bounds.
 *
 * This completely eliminates coordinate shifts, skew, and rotation offsets
 * between raster layers (DEM/Flood/Relief) and true WGS84 vectors (KML, GPS, Markers).
 */
export function reprojectCanvasToWgs84(
  sourceCanvas: HTMLCanvasElement,
  dem: DEMInfo,
  crsDef: string | undefined,
  wgs84Bounds: [[number, number], [number, number]] | null
): string {
  if (!wgs84Bounds || !crsDef || crsDef.includes('+proj=longlat')) {
    return sourceCanvas.toDataURL();
  }

  const [southWest, northEast] = wgs84Bounds;
  const [minLat, minLon] = southWest;
  const [maxLat, maxLon] = northEast;

  const srcCtx = sourceCanvas.getContext('2d');
  if (!srcCtx) return sourceCanvas.toDataURL();
  const srcWidth = sourceCanvas.width;
  const srcHeight = sourceCanvas.height;
  const srcData = srcCtx.getImageData(0, 0, srcWidth, srcHeight).data;

  // Determine output resolution:
  // Matches native grid resolution, clamped between 512 and 1280 for fast rendering and crisp detail
  const outW = Math.min(Math.max(srcWidth, 512), 1280);
  const outH = Math.min(Math.max(srcHeight, 512), 1280);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return sourceCanvas.toDataURL();

  const outImageData = outCtx.createImageData(outW, outH);
  const outData = outImageData.data;

  // 16x16 pixel blocks with exact proj4 tie points for bilinear interpolation
  const BLOCK = 16;
  const numBlocksX = Math.ceil(outW / BLOCK);
  const numBlocksY = Math.ceil(outH / BLOCK);

  // Precompute grid tie points in projected coordinates
  const gridProj = new Float64Array((numBlocksX + 1) * (numBlocksY + 1) * 2);
  for (let gy = 0; gy <= numBlocksY; gy++) {
    const py = Math.min(gy * BLOCK, outH - 1);
    const lat = maxLat - (py / (outH - 1)) * (maxLat - minLat);
    for (let gx = 0; gx <= numBlocksX; gx++) {
      const px = Math.min(gx * BLOCK, outW - 1);
      const lon = minLon + (px / (outW - 1)) * (maxLon - minLon);
      try {
        const [projX, projY] = proj4('EPSG:4326', crsDef, [lon, lat]);
        const gIdx = (gy * (numBlocksX + 1) + gx) * 2;
        gridProj[gIdx] = projX;
        gridProj[gIdx + 1] = projY;
      } catch (e) {
        const gIdx = (gy * (numBlocksX + 1) + gx) * 2;
        gridProj[gIdx] = dem.xll;
        gridProj[gIdx + 1] = dem.yll;
      }
    }
  }

  const { xll, yll, cellSize, cellSizeY } = dem;
  const invCellX = 1 / cellSize;
  const invCellY = 1 / (cellSizeY ?? cellSize);

  // Interpolate inside each block
  for (let gy = 0; gy < numBlocksY; gy++) {
    const yStart = gy * BLOCK;
    const yEnd = Math.min(yStart + BLOCK, outH);
    const blockH = yEnd - yStart;

    const gRowTop = gy * (numBlocksX + 1);
    const gRowBot = (gy + 1) * (numBlocksX + 1);

    for (let gx = 0; gx < numBlocksX; gx++) {
      const xStart = gx * BLOCK;
      const xEnd = Math.min(xStart + BLOCK, outW);
      const blockW = xEnd - xStart;

      const tlIdx = (gRowTop + gx) * 2;
      const trIdx = (gRowTop + gx + 1) * 2;
      const blIdx = (gRowBot + gx) * 2;
      const brIdx = (gRowBot + gx + 1) * 2;

      const tlX = gridProj[tlIdx],     tlY = gridProj[tlIdx + 1];
      const trX = gridProj[trIdx],     trY = gridProj[trIdx + 1];
      const blX = gridProj[blIdx],     blY = gridProj[blIdx + 1];
      const brX = gridProj[brIdx],     brY = gridProj[brIdx + 1];

      for (let y = yStart; y < yEnd; y++) {
        const v = (y - yStart) / blockH;
        const leftX = tlX + (blX - tlX) * v;
        const leftY = tlY + (blY - tlY) * v;
        const rightX = trX + (brX - trX) * v;
        const rightY = trY + (brY - trY) * v;

        const rowOffset = y * outW;

        for (let x = xStart; x < xEnd; x++) {
          const u = (x - xStart) / blockW;
          const pX = leftX + (rightX - leftX) * u;
          const pY = leftY + (rightY - leftY) * u;

          // Convert projected coordinates (X, Y) to DEM cell index
          const sX = Math.floor((pX - xll) * invCellX);
          const sY = Math.floor(srcHeight - (pY - yll) * invCellY);

          const outIdx = (rowOffset + x) * 4;

          if (sX >= 0 && sX < srcWidth && sY >= 0 && sY < srcHeight) {
            const sIdx = (sY * srcWidth + sX) * 4;
            outData[outIdx] = srcData[sIdx];
            outData[outIdx + 1] = srcData[sIdx + 1];
            outData[outIdx + 2] = srcData[sIdx + 2];
            outData[outIdx + 3] = srcData[sIdx + 3];
          } else {
            outData[outIdx + 3] = 0; // Transparent outside DEM footprint
          }
        }
      }
    }
  }

  outCtx.putImageData(outImageData, 0, 0);
  return outCanvas.toDataURL();
}
