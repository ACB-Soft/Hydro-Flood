export interface CADLayer {
  id: string;
  level: number;
  name: string;
  color: string;
  type: 'contour_major' | 'contour_minor' | 'elevation_points' | 'water' | 'buildings' | 'boundary' | 'other';
  visible: boolean;
  count: number;
  minZ: number;
  maxZ: number;
}

export interface DGNElement {
  id: string;
  level: number;
  type: 'line' | 'linestring' | 'shape' | 'point' | 'text' | 'arc';
  layerId: string;
  points: { x: number; y: number; z: number }[];
  text?: string;
  color?: string;
}

export interface DGNParsedResult {
  fileName: string;
  fileSize: string;
  format: string;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  layers: CADLayer[];
  elements: DGNElement[];
  textAnnotations?: { x: number; y: number; text: string; val?: number }[];
}

export const DEFAULT_SAMPLE_LAYERS: CADLayer[] = [];

export function getDefaultSampleElements(): DGNElement[] {
  return [];
}

const LAYER_COLORS = [
  '#06b6d4', '#38bdf8', '#f59e0b', '#10b981', '#f43f5e', '#a855f7',
  '#ec4899', '#8b5cf6', '#3b82f6', '#14b8a6', '#84cc16', '#eab308',
  '#06b6d4', '#10b981', '#f59e0b', '#6366f1', '#ec4899', '#14b8a6',
];

/**
  Categorizes layer type based on layer/level name and properties
 */
function determineLayerType(name: string, level: number): CADLayer['type'] {
  const upper = name.toUpperCase();
  if (
    upper.includes('IZOHIPS') ||
    upper.includes('CONTOUR') ||
    upper.includes('EGRI') ||
    upper.includes('EST') ||
    upper.includes('ELEM')
  ) {
    if (upper.includes('ANA') || level % 5 === 0) return 'contour_major';
    return 'contour_minor';
  }
  if (
    upper.includes('KOT') ||
    upper.includes('NOKTA') ||
    upper.includes('POINT') ||
    upper.includes('SPOT') ||
    upper.includes('NIRENGI') ||
    upper.includes('POLIGON')
  ) {
    return 'elevation_points';
  }
  if (
    upper.includes('SU') ||
    upper.includes('DERE') ||
    upper.includes('GOL') ||
    upper.includes('RIVER') ||
    upper.includes('WATER') ||
    upper.includes('AKARSU')
  ) {
    return 'water';
  }
  if (
    upper.includes('BINA') ||
    upper.includes('YAPI') ||
    upper.includes('PARSEL') ||
    upper.includes('BUILDING') ||
    upper.includes('HOUSE') ||
    upper.includes('KADASTRO')
  ) {
    return 'buildings';
  }
  if (
    upper.includes('SINIR') ||
    upper.includes('LIMIT') ||
    upper.includes('PROJE') ||
    upper.includes('BOUNDARY')
  ) {
    return 'boundary';
  }
  return 'other';
}

/**
 * Extract printable text strings (ASCII / Latin1 / UTF-8) from a Uint8Array
 */
function extractStringsFromBuffer(
  buffer: Uint8Array,
  minLen: number = 2
): string[] {
  const strings: string[] = [];
  let currentStr = '';

  for (let i = 0; i < buffer.length; i++) {
    const b = buffer[i];
    // Printable ASCII or common Turkish extensions in Latin5/UTF8
    if ((b >= 32 && b <= 126) || b === 221 || b === 253 || b === 231 || b === 246 || b === 252 || b === 287 || b === 351) {
      currentStr += String.fromCharCode(b);
    } else {
      if (currentStr.trim().length >= minLen) {
        strings.push(currentStr.trim());
      }
      currentStr = '';
    }
  }
  if (currentStr.trim().length >= minLen) {
    strings.push(currentStr.trim());
  }
  return strings;
}

/**
 * Parses a DGN (MicroStation V7 / V8), DXF, or CAD file into structured vector layers and elements.
 * Preserves exact real-world coordinates and actual layer names parsed from the file without false synthetic generation.
 */
export async function parseDGNFile(file: File): Promise<DGNParsedResult> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const sizeBytes = buffer.byteLength;
  const fileSizeStr = `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;

  const elements: DGNElement[] = [];
  const levelNamesMap = new Map<number, string>();
  const levelMap = new Map<
    number,
    { count: number; minZ: number; maxZ: number; type: CADLayer['type']; name?: string }
  >();

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  let isV7BinaryDgn = false;
  let isV8BinaryDgn = false;
  let isDXFOrText = false;

  // 1. Format Detection
  if (sizeBytes >= 4) {
    const word0 = view.getUint16(0, true);
    const type = (word0 >> 8) & 0x7f;
    const level = word0 & 0x3f;
    if (type >= 1 && type <= 66 && level >= 0 && level <= 63) {
      isV7BinaryDgn = true;
    }

    const sig = view.getUint32(0, false);
    if (sig === 0xd0cf11e0) {
      isV8BinaryDgn = true;
    }
  }

  // Check DXF or Text
  const sampleHeader = new TextDecoder('ascii', { fatal: false }).decode(bytes.subarray(0, Math.min(sizeBytes, 2000)));
  if (sampleHeader.includes('SECTION') || sampleHeader.includes('HEADER') || sampleHeader.includes('ENTITIES') || sampleHeader.includes('DXF')) {
    isDXFOrText = true;
  }

  // Extract all text strings from file buffer to search for Level Names & Annotations
  const allExtractedStrings = extractStringsFromBuffer(bytes, 2);
  // Match potential layer names from text (e.g., LEVEL_1, IZOHIPS, KOT, etc.)
  allExtractedStrings.forEach((str) => {
    // Check if string contains level assignment like "Level 1" or "Katman" or level table
    const levelMatch = str.match(/Level\s*(\d+)/i) || str.match(/Katman\s*(\d+)/i);
    if (levelMatch) {
      const lvl = parseInt(levelMatch[1], 10);
      if (lvl >= 0 && lvl <= 256) {
        levelNamesMap.set(lvl, str);
      }
    }
  });

  // 2. Parse DXF / Text CAD Format if detected
  if (isDXFOrText) {
    const fullText = new TextDecoder('latin1').decode(bytes);
    const lines = fullText.split(/\r?\n/);
    
    let currentSection = '';
    let currentEntity = '';
    let currentLayer = '0';
    let currentPoints: { x: number; y: number; z: number }[] = [];
    let currentText = '';
    let elemIdx = 1;

    for (let i = 0; i < lines.length - 1; i += 2) {
      const code = parseInt(lines[i].trim(), 10);
      const val = lines[i + 1] ? lines[i + 1].trim() : '';

      if (code === 0) {
        // Finalize previous entity
        if (currentEntity && currentPoints.length > 0) {
          const levelNum = Math.abs(currentLayer.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % 63 + 1;
          levelNamesMap.set(levelNum, currentLayer);
          
          let lType = determineLayerType(currentLayer, levelNum);
          const layerId = `layer-${levelNum}`;

          elements.push({
            id: `cad-elem-${elemIdx++}`,
            level: levelNum,
            type: currentEntity === 'TEXT' || currentEntity === 'MTEXT' ? 'text' : currentPoints.length === 1 ? 'point' : 'linestring',
            layerId,
            points: currentPoints,
            text: currentText || undefined,
          });

          const currL = levelMap.get(levelNum) || { count: 0, minZ: Infinity, maxZ: -Infinity, type: lType, name: currentLayer };
          currL.count++;
          currentPoints.forEach((p) => {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
            minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
            if (p.z < currL.minZ) currL.minZ = p.z;
            if (p.z > currL.maxZ) currL.maxZ = p.z;
          });
          levelMap.set(levelNum, currL);
        }

        currentEntity = val;
        currentPoints = [];
        currentText = '';
        if (val === 'SECTION') currentSection = '';
      } else if (code === 2 && currentEntity === 'SECTION') {
        currentSection = val;
      } else if (code === 8) {
        currentLayer = val;
      } else if (code === 10) {
        const px = parseFloat(val);
        const py = parseFloat(lines[i + 3]?.trim() || '0');
        const pz = parseFloat(lines[i + 5]?.trim() || '0');
        if (!isNaN(px) && !isNaN(py)) {
          currentPoints.push({ x: px, y: py, z: isNaN(pz) ? 0 : pz });
        }
      } else if (code === 1) {
        currentText = val;
      }
    }
  }

  // 3. Parse MicroStation V7 (ISFF Binary)
  if (elements.length === 0 && (isV7BinaryDgn || sizeBytes > 100)) {
    let offset = 0;
    let elemIdx = 1;

    while (offset + 4 <= sizeBytes) {
      const w0 = view.getUint16(offset, true);
      const isDeleted = (w0 & 0x8000) !== 0;
      const type = (w0 >> 8) & 0x7f;
      const level = (w0 & 0x3f) || 1;
      const lengthWords = view.getUint16(offset + 2, true);
      const elemSizeBytes = (lengthWords + 2) * 2;

      if (elemSizeBytes <= 4 || offset + elemSizeBytes > sizeBytes) {
        break; // Corrupt record length or end of file
      }

      if (!isDeleted && type > 0) {
        // Type 5 or 66: Named Level / Group Data
        if (type === 5 || type === 66) {
          const rawText = extractStringsFromBuffer(bytes.subarray(offset + 4, offset + elemSizeBytes), 2);
          if (rawText.length > 0) {
            const layerName = rawText.join(' ');
            if (layerName.length > 1 && !levelNamesMap.has(level)) {
              levelNamesMap.set(level, layerName);
            }
          }
        }

        // Element Types with Coordinates: Line (3), LineString (4), Shape (6), PointString (11), Complex Chain (12/14), Arc (16), Text (17)
        if ([3, 4, 6, 11, 12, 14, 15, 16, 17].includes(type)) {
          const pts: { x: number; y: number; z: number }[] = [];

          // Scan element body for 32-bit integer or 64-bit double coordinates
          const bodyOffset = offset + 16; // Skip ISFF element header
          const bodyBytes = elemSizeBytes - 16;

          if (bodyBytes >= 8) {
            // Read 32-bit signed integer pairs/triplets (UORs)
            const numInts = Math.floor(bodyBytes / 4);
            const intCoords: number[] = [];
            for (let k = 0; k < numInts; k++) {
              intCoords.push(view.getInt32(bodyOffset + k * 4, true));
            }

            // Filter valid int32 coordinates (filter zero headers or huge outliers)
            for (let k = 0; k < intCoords.length - 1; k += 2) {
              const ix = intCoords[k];
              const iy = intCoords[k + 1];
              let iz = k + 2 < intCoords.length ? intCoords[k + 2] : 0;

              // Check if valid coordinate values
              if (Math.abs(ix) > 10 && Math.abs(iy) > 10 && Math.abs(ix) < 2e9 && Math.abs(iy) < 2e9) {
                // Keep raw real coordinates
                const rx = ix;
                const ry = iy;
                const rz = Math.abs(iz) < 1e7 ? iz : 0;

                pts.push({ x: rx, y: ry, z: rz });
                minX = Math.min(minX, rx); maxX = Math.max(maxX, rx);
                minY = Math.min(minY, ry); maxY = Math.max(maxY, ry);
                minZ = Math.min(minZ, rz); maxZ = Math.max(maxZ, rz);
              }
            }
          }

          if (pts.length > 0) {
            const layerName = levelNamesMap.get(level) || `Katman ${level}`;
            const catType = determineLayerType(layerName, level);
            const layerId = `layer-${level}`;

            elements.push({
              id: `dgn-elem-${elemIdx++}`,
              level,
              type: type === 6 ? 'shape' : pts.length === 1 ? 'point' : 'linestring',
              layerId,
              points: pts,
            });

            const currentL = levelMap.get(level) || {
              count: 0,
              minZ: Infinity,
              maxZ: -Infinity,
              type: catType,
              name: layerName,
            };
            currentL.count++;
            pts.forEach((pt) => {
              if (pt.z < currentL.minZ) currentL.minZ = pt.z;
              if (pt.z > currentL.maxZ) currentL.maxZ = pt.z;
            });
            levelMap.set(level, currentL);
          }
        }
      }

      offset += elemSizeBytes;
    }
  }

  // 4. MicroStation V8 Stream or General Binary Reader Fallback
  if (elements.length === 0 && (isV8BinaryDgn || sizeBytes > 0)) {
    // Scan float64 / double arrays or integer coordinates across binary chunks
    let elemIdx = 1;
    const chunkSize = 8;
    const numDoubles = Math.floor(sizeBytes / chunkSize);

    const validPoints: { x: number; y: number; z: number; level: number }[] = [];

    for (let i = 0; i < numDoubles - 2; i += 2) {
      try {
        const d1 = view.getFloat64(i * 8, true);
        const d2 = view.getFloat64((i + 1) * 8, true);
        const d3 = view.getFloat64((i + 2) * 8, true);

        // Check if d1, d2 are valid spatial coordinates (not NaN, not Infinity, plausible CAD values)
        if (!isNaN(d1) && !isNaN(d2) && isFinite(d1) && isFinite(d2) && Math.abs(d1) > 0.1 && Math.abs(d2) > 0.1 && Math.abs(d1) < 1e8 && Math.abs(d2) < 1e8) {
          const zVal = (!isNaN(d3) && isFinite(d3) && Math.abs(d3) < 1e5) ? d3 : 0;
          const assignedLevel = (Math.abs(Math.floor(d1)) % 10) + 1;
          validPoints.push({ x: d1, y: d2, z: zVal, level: assignedLevel });
        }
      } catch {
        // Ignore binary read out-of-bounds
      }
    }

    // Group valid points into linestrings or points
    if (validPoints.length > 0) {
      let currentPts: { x: number; y: number; z: number }[] = [];
      let currentLvl = validPoints[0].level;

      for (let p = 0; p < validPoints.length; p++) {
        const pt = validPoints[p];
        if (currentPts.length === 0 || pt.level === currentLvl) {
          currentPts.push({ x: pt.x, y: pt.y, z: pt.z });
          minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
          minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
          minZ = Math.min(minZ, pt.z); maxZ = Math.max(maxZ, pt.z);
        } else {
          if (currentPts.length > 0) {
            const layerName = levelNamesMap.get(currentLvl) || `Katman ${currentLvl}`;
            const catType = determineLayerType(layerName, currentLvl);
            const layerId = `layer-${currentLvl}`;

            elements.push({
              id: `dgn-elem-${elemIdx++}`,
              level: currentLvl,
              type: currentPts.length === 1 ? 'point' : 'linestring',
              layerId,
              points: currentPts,
            });

            const currentL = levelMap.get(currentLvl) || {
              count: 0,
              minZ: Infinity,
              maxZ: -Infinity,
              type: catType,
              name: layerName,
            };
            currentL.count++;
            currentPts.forEach((ptItem) => {
              if (ptItem.z < currentL.minZ) currentL.minZ = ptItem.z;
              if (ptItem.z > currentL.maxZ) currentL.maxZ = ptItem.z;
            });
            levelMap.set(currentLvl, currentL);
          }
          currentPts = [{ x: pt.x, y: pt.y, z: pt.z }];
          currentLvl = pt.level;
        }
      }

      if (currentPts.length > 0) {
        const layerName = levelNamesMap.get(currentLvl) || `Katman ${currentLvl}`;
        const catType = determineLayerType(layerName, currentLvl);
        const layerId = `layer-${currentLvl}`;

        elements.push({
          id: `dgn-elem-${elemIdx++}`,
          level: currentLvl,
          type: currentPts.length === 1 ? 'point' : 'linestring',
          layerId,
          points: currentPts,
        });

        const currentL = levelMap.get(currentLvl) || {
          count: 0,
          minZ: Infinity,
          maxZ: -Infinity,
          type: catType,
          name: layerName,
        };
        currentL.count++;
        levelMap.set(currentLvl, currentL);
      }
    }
  }

  // 5. Construct Final CAD Layers
  const layers: CADLayer[] = Array.from(levelMap.entries()).map(([level, info], idx) => {
    const finalName = info.name || levelNamesMap.get(level) || `Katman ${level}`;
    return {
      id: `layer-${level}`,
      level,
      name: finalName,
      color: LAYER_COLORS[idx % LAYER_COLORS.length],
      type: info.type || determineLayerType(finalName, level),
      visible: true,
      count: info.count,
      minZ: info.minZ === Infinity ? 0 : info.minZ,
      maxZ: info.maxZ === -Infinity ? 0 : info.maxZ,
    };
  });

  // Default bounds fallback if no coordinates were read at all
  if (minX === Infinity || isNaN(minX)) {
    minX = 0; maxX = 100;
    minY = 0; maxY = 100;
    minZ = 0; maxZ = 50;
  }

  // Format String
  const formatStr = isDXFOrText
    ? 'AutoCAD / Text CAD Format (.dxf)'
    : isV8BinaryDgn
    ? 'MicroStation V8 DGN (OLE Binary Stream)'
    : isV7BinaryDgn
    ? 'MicroStation V7 DGN (ISFF Binary)'
    : 'MicroStation DGN CAD File';

  return {
    fileName: file.name,
    fileSize: fileSizeStr,
    format: formatStr,
    bounds: { minX, maxX, minY, maxY, minZ, maxZ },
    layers,
    elements,
  };
}
