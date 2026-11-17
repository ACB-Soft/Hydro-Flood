/**
 * Unified 100% browser-native CAD parser supporting:
 * - .DXF (dxf-parser with UTF-8 / Windows-1254 auto-detection)
 * - .DWG (LibreDWG WebAssembly in dedicated Web Worker)
 * - .DGN (gdal3.js / OGR DGN WebAssembly driver)
 */
import initGdalJs from 'gdal3.js';
import DwgWorker from '../workers/dwg-worker?worker';
import { fixTurkishDxfText } from './cadGeometry';
import { parseDXFBuffer, ExtractedLayer } from './dxfUtils';

export type CADFormat = 'DXF' | 'DWG' | 'DGN';

export interface CADParseResult {
  parsed: any;
  extractedLayers: ExtractedLayer[];
  format: CADFormat;
  warnings: string[];
  stats: {
    entityCount: number;
    blockCount: number;
    version?: string;
  };
}

let cachedGdalPromise: Promise<any> | null = null;

function getWasmBaseUrl(): string {
  if (typeof document !== 'undefined' && document.baseURI) {
    return new URL('./wasm', document.baseURI).href.replace(/\/$/, '');
  }
  return '/wasm';
}

async function getGdalInstance(): Promise<any> {
  if (!cachedGdalPromise) {
    const baseUrl = getWasmBaseUrl();
    const gdalInitFn: any = typeof initGdalJs === 'function' ? initGdalJs : (initGdalJs as any)?.default;
    cachedGdalPromise = gdalInitFn({
      path: baseUrl,
      paths: {
        wasm: 'gdal3WebAssembly.wasm',
        data: 'gdal3WebAssembly.data',
        js: 'gdal3.js',
      },
    }).catch((err) => {
      cachedGdalPromise = null;
      throw err;
    });
  }
  return cachedGdalPromise;
}

function detectFormat(file: File): CADFormat {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.dwg')) return 'DWG';
  if (lower.endsWith('.dgn')) return 'DGN';
  if (lower.endsWith('.dxf')) return 'DXF';
  throw new Error('Desteklenmeyen dosya uzantısı. Lütfen .dxf, .dwg veya .dgn uzantılı bir CAD dosyası seçin.');
}

function resolveDwgEntityColor(entity: any): number | undefined {
  if (typeof entity?.color === 'number' && entity.color >= 0) {
    // LibreDWG true color integer (RGB > 255 fits existing getAciColor hex path)
    return entity.color > 255 ? entity.color : entity.color;
  }
  if (typeof entity?.colorIndex === 'number' && entity.colorIndex !== 256 && entity.colorIndex !== 0) {
    return Math.abs(entity.colorIndex);
  }
  return undefined;
}

function computeMTextRotationDeg(entity: any): number {
  if (typeof entity?.rotation === 'number' && entity.rotation !== 0) {
    return (entity.rotation * 180) / Math.PI;
  }
  const dir = entity?.direction;
  if (dir && typeof dir.x === 'number' && typeof dir.y === 'number' && (dir.x !== 0 || dir.y !== 0)) {
    return (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
  }
  return 0;
}

function normalizeDwgEntity(entity: any): any | null {
  if (!entity || !entity.type) return null;

  const layer = fixTurkishDxfText(entity.layer || '0') || '0';
  const color = resolveDwgEntityColor(entity);
  const lineWeight = typeof entity.lineweight === 'number' ? entity.lineweight : entity.lineWeight;
  const base: any = {
    ...entity,
    layer,
    ...(color !== undefined ? { color } : {}),
    ...(lineWeight !== undefined ? { lineWeight } : {}),
  };

  switch (entity.type) {
    case 'POINT': {
      return {
        ...base,
        position: entity.position || { x: entity.x || 0, y: entity.y || 0, z: entity.z || 0 },
      };
    }
    case 'LINE': {
      return {
        ...base,
        startPoint: entity.startPoint,
        endPoint: entity.endPoint,
      };
    }
    case 'LWPOLYLINE': {
      const elev = typeof entity.elevation === 'number' && Number.isFinite(entity.elevation) ? entity.elevation : 0;
      const closed = Boolean((entity.flag ?? 0) & 1);
      const vertices = Array.isArray(entity.vertices)
        ? entity.vertices.map((v: any) => ({
            ...v,
            z: typeof v.z === 'number' && Number.isFinite(v.z) ? v.z : elev,
          }))
        : [];
      return {
        ...base,
        type: 'LWPOLYLINE',
        elevation: elev,
        closed,
        shape: closed,
        vertices,
      };
    }
    case 'POLYLINE2D': {
      const elev = typeof entity.elevation === 'number' && Number.isFinite(entity.elevation) ? entity.elevation : 0;
      const closed = Boolean((entity.flag ?? 0) & 1);
      const vertices = Array.isArray(entity.vertices)
        ? entity.vertices.map((v: any) => ({
            ...v,
            z: typeof v.z === 'number' && Number.isFinite(v.z) && v.z !== 0 ? v.z : elev,
          }))
        : [];
      return {
        ...base,
        type: 'POLYLINE',
        elevation: elev,
        closed,
        shape: closed,
        vertices,
      };
    }
    case 'POLYLINE3D': {
      const closed = Boolean((entity.flag ?? 0) & 1);
      return {
        ...base,
        type: 'POLYLINE',
        closed,
        shape: closed,
        vertices: Array.isArray(entity.vertices) ? entity.vertices : [],
      };
    }
    case 'SPLINE': {
      const fit = Array.isArray(entity.fitPoints) && entity.fitPoints.length > 0 ? entity.fitPoints : null;
      const ctrl = Array.isArray(entity.controlPoints) && entity.controlPoints.length > 0 ? entity.controlPoints : [];
      return {
        ...base,
        vertices: fit || ctrl,
      };
    }
    case '3DFACE': {
      const corners = [entity.corner1, entity.corner2, entity.corner3, entity.corner4].filter(
        (c) => c && typeof c.x === 'number' && typeof c.y === 'number'
      );
      if (corners.length === 4) {
        const c3 = corners[2];
        const c4 = corners[3];
        if (Math.hypot((c4.x ?? 0) - (c3.x ?? 0), (c4.y ?? 0) - (c3.y ?? 0), (c4.z ?? 0) - (c3.z ?? 0)) < 1e-6) {
          corners.pop();
        }
      }
      return {
        ...base,
        type: '3DFACE',
        closed: true,
        shape: true,
        vertices: corners,
      };
    }
    case 'SOLID':
    case 'TRACE': {
      const corners = [entity.corner1, entity.corner2, entity.corner3, entity.corner4].filter(
        (c) => c && typeof c.x === 'number' && typeof c.y === 'number'
      );
      return {
        ...base,
        type: 'POLYLINE',
        closed: true,
        shape: true,
        vertices: corners,
      };
    }
    case 'TEXT': {
      const z = typeof entity.elevation === 'number' && Number.isFinite(entity.elevation)
        ? entity.elevation
        : (entity.startPoint?.z ?? 0);
      const startPoint = entity.startPoint ? { ...entity.startPoint, z } : undefined;
      return {
        ...base,
        text: fixTurkishDxfText(entity.text),
        startPoint,
        position: startPoint,
        height: entity.textHeight,
        rotation: typeof entity.rotation === 'number' ? (entity.rotation * 180) / Math.PI : 0,
      };
    }
    case 'MTEXT': {
      return {
        ...base,
        text: fixTurkishDxfText(entity.text),
        position: entity.insertionPoint || entity.position,
        height: entity.textHeight,
        rotation: computeMTextRotationDeg(entity),
      };
    }
    case 'ATTRIB': {
      const txtObj = entity.text && typeof entity.text === 'object' ? entity.text : null;
      const textVal = fixTurkishDxfText(txtObj ? txtObj.text : entity.text);
      const sp = txtObj?.startPoint || entity.startPoint || entity.position;
      const z = typeof txtObj?.elevation === 'number' && Number.isFinite(txtObj.elevation)
        ? txtObj.elevation
        : (sp?.z ?? entity.elevation ?? 0);
      return {
        ...base,
        text: textVal,
        tag: fixTurkishDxfText(entity.tag),
        startPoint: sp ? { ...sp, z } : undefined,
        position: sp ? { ...sp, z } : undefined,
        height: txtObj?.textHeight ?? entity.textHeight,
        rotation: typeof txtObj?.rotation === 'number' ? (txtObj.rotation * 180) / Math.PI : 0,
      };
    }
    case 'INSERT': {
      const attribs = Array.isArray(entity.attribs)
        ? entity.attribs.map((a: any) => normalizeDwgEntity(a)).filter(Boolean)
        : [];
      return {
        ...base,
        name: fixTurkishDxfText(entity.name),
        position: entity.insertionPoint || entity.position,
        xScale: entity.xScale ?? 1,
        yScale: entity.yScale ?? 1,
        zScale: entity.zScale ?? 1,
        rotation: typeof entity.rotation === 'number' ? (entity.rotation * 180) / Math.PI : 0,
        attribs,
      };
    }
    case 'CIRCLE':
    case 'ARC': {
      return base;
    }
    default:
      return base;
  }
}

async function parseDWGFile(file: File): Promise<CADParseResult> {
  const buffer = await file.arrayBuffer();
  const wasmBasePath = getWasmBaseUrl();

  const rawPayload: any = await new Promise((resolve, reject) => {
    const worker = new DwgWorker();
    const requestId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

    worker.onmessage = (e: MessageEvent) => {
      if (e.data?.id !== requestId) return;
      worker.terminate();
      if (e.data.success) {
        resolve(e.data.payload);
      } else {
        reject(new Error(e.data.error || 'DWG dosyası ayrıştırılamadı.'));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(err.message || 'DWG Worker çalıştırma hatası.'));
    };

    worker.postMessage({ id: requestId, buffer, wasmBasePath }, [buffer]);
  });

  const layerDict: Record<string, any> = {};
  const extractedLayers: ExtractedLayer[] = [];
  const seenLayerNames = new Set<string>();

  const rawLayers: any[] = Array.isArray(rawPayload?.layers) ? rawPayload.layers : [];
  for (const l of rawLayers) {
    const fixedName = fixTurkishDxfText(l?.name || '0') || '0';
    if (seenLayerNames.has(fixedName)) continue;
    seenLayerNames.add(fixedName);

    const resolvedColor =
      typeof l?.color === 'number' && l.color > 255
        ? l.color
        : typeof l?.colorIndex === 'number' && l.colorIndex !== 0
          ? Math.abs(l.colorIndex)
          : 7;

    const isVisible = !(l?.off === true || l?.frozen === true);
    const layerObj = {
      name: fixedName,
      color: resolvedColor,
      lineWeight: l?.lineweight,
      visible: isVisible,
    };
    layerDict[fixedName] = layerObj;
    extractedLayers.push({
      name: fixedName,
      color: resolvedColor,
      visible: isVisible,
      lineWeight: l?.lineweight,
    });
  }

  // Ensure at least one layer is visible so user doesn't see an empty canvas if all CAD layers were frozen
  if (extractedLayers.length > 0 && extractedLayers.every((l) => !l.visible)) {
    extractedLayers.forEach((l) => {
      l.visible = true;
    });
  }

  const normalizedEntities: any[] = [];
  for (const rawEnt of rawPayload?.entities || []) {
    const norm = normalizeDwgEntity(rawEnt);
    if (!norm) continue;
    normalizedEntities.push(norm);
    if (norm.layer && !seenLayerNames.has(norm.layer)) {
      seenLayerNames.add(norm.layer);
      layerDict[norm.layer] = { name: norm.layer, color: 7, visible: true };
      extractedLayers.push({ name: norm.layer, color: 7, visible: true });
    }
  }

  const blocksDict: Record<string, any> = {};
  for (const rawBlock of rawPayload?.blocks || []) {
    const blockName = fixTurkishDxfText(rawBlock?.name);
    if (!blockName) continue;
    blocksDict[blockName] = {
      name: blockName,
      position: rawBlock.basePoint || { x: 0, y: 0, z: 0 },
      entities: (rawBlock.entities || []).map((e: any) => normalizeDwgEntity(e)).filter(Boolean),
    };
  }

  const header = {
    ...(rawPayload?.header || {}),
    $PDSIZE: rawPayload?.header?.PDSIZE,
    $TEXTSIZE: rawPayload?.header?.TEXTSIZE,
  };

  const warnings: string[] = [];
  if (rawPayload?.unknownEntityCount > 0) {
    warnings.push(`${rawPayload.unknownEntityCount} adet özel/proxy DWG objesi atlandı.`);
  }
  if (normalizedEntities.length === 0) {
    warnings.push('Model alanında çizim objesi bulunamadı.');
  }

  return {
    parsed: {
      header,
      tables: { layer: { layers: layerDict } },
      blocks: blocksDict,
      entities: normalizedEntities,
      metadata: {
        format: 'DWG',
        version: rawPayload?.version || undefined,
      },
    },
    extractedLayers,
    format: 'DWG',
    warnings,
    stats: {
      entityCount: normalizedEntities.length,
      blockCount: Object.keys(blocksDict).length,
      version: rawPayload?.version || undefined,
    },
  };
}

function isOle2V8DgnHeader(bytes: Uint8Array): boolean {
  const oleMagic = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (bytes.length < oleMagic.length) return false;
  return oleMagic.every((b, idx) => bytes[idx] === b);
}

async function parseDGNFile(file: File): Promise<CADParseResult> {
  const headBuf = await file.slice(0, 16).arrayBuffer();
  const headBytes = new Uint8Array(headBuf);
  if (isOle2V8DgnHeader(headBytes)) {
    throw new Error(
      "Bu dosya MicroStation V8 (.dgn) formatındadır. Tarayıcı tabanlı açık kaynak GDAL/OGR sürücüsü yalnızca MicroStation V7 DGN formatını doğrudan okuyabilmektedir. Lütfen CAD yazılımınızdan 'Save As -> V7 DGN' veya '.DXF / .DWG' olarak kaydedip tekrar yükleyin."
    );
  }

  const Gdal = await getGdalInstance();
  const opened = await Gdal.open(file);

  if (opened?.errors?.length && (!opened.datasets || opened.datasets.length === 0)) {
    const errText = opened.errors.join(' ');
    if (errText.toLowerCase().includes('v8') || errText.toLowerCase().includes('not recognized')) {
      throw new Error(
        'DGN dosyası açılamadı (yalnızca MicroStation V7 DGN desteklenmektedir; V8 dosyalar için DXF/DWG dışa aktarımı kullanın).'
      );
    }
    throw new Error(`DGN dosyası açılamadı: ${errText}`);
  }

  const dataset = opened?.datasets?.[0];
  if (!dataset) {
    throw new Error('DGN veri seti açılamadı veya dosya boş.');
  }

  let geojson: any;
  try {
    const outPath = await Gdal.ogr2ogr(dataset, ['-f', 'GeoJSON']);
    const bytes = await Gdal.getFileBytes(outPath);
    const text = new TextDecoder('utf-8').decode(bytes);
    geojson = JSON.parse(text);
  } finally {
    await Gdal.close(dataset).catch(() => {});
  }

  const features: any[] = Array.isArray(geojson?.features) ? geojson.features : [];
  const entities: any[] = [];
  const layerDict: Record<string, any> = {};
  const extractedLayers: ExtractedLayer[] = [];
  const seenLayers = new Set<string>();

  const ensureLayer = (name: string, colorIndex?: number, weight?: number) => {
    const safeColor = typeof colorIndex === 'number' && colorIndex > 0 ? Math.min(255, colorIndex) : 7;
    if (!seenLayers.has(name)) {
      seenLayers.add(name);
      const lineWeight = typeof weight === 'number' && weight > 0 ? weight * 25 : undefined;
      layerDict[name] = { name, color: safeColor, visible: true, lineWeight };
      extractedLayers.push({ name, color: safeColor, visible: true, lineWeight });
    }
  };

  const toPt = (coord: number[]) => ({
    x: Number(coord[0]) || 0,
    y: Number(coord[1]) || 0,
    z: coord.length >= 3 && Number.isFinite(Number(coord[2])) ? Number(coord[2]) : 0,
  });

  const emitGeometry = (geom: any, props: any, layerName: string, color?: number, lineWeight?: number) => {
    if (!geom) return;
    const textProp = props?.Text !== undefined && props?.Text !== null ? fixTurkishDxfText(String(props.Text)).trim() : '';

    switch (geom.type) {
      case 'Point': {
        if (!Array.isArray(geom.coordinates)) return;
        const pt = toPt(geom.coordinates);
        if (textProp) {
          entities.push({
            type: 'TEXT',
            layer: layerName,
            color,
            text: textProp,
            position: pt,
            startPoint: pt,
            height: Number(props?.TextHeight) || undefined,
            rotation: Number(props?.TextRotation) || 0,
          });
        } else {
          entities.push({
            type: 'POINT',
            layer: layerName,
            color,
            position: pt,
          });
        }
        break;
      }
      case 'MultiPoint': {
        for (const coord of geom.coordinates || []) {
          const pt = toPt(coord);
          entities.push({ type: 'POINT', layer: layerName, color, position: pt });
        }
        break;
      }
      case 'LineString': {
        const coords: number[][] = geom.coordinates || [];
        if (coords.length === 2) {
          entities.push({
            type: 'LINE',
            layer: layerName,
            color,
            lineWeight,
            startPoint: toPt(coords[0]),
            endPoint: toPt(coords[1]),
          });
        } else if (coords.length > 2) {
          entities.push({
            type: 'POLYLINE',
            layer: layerName,
            color,
            lineWeight,
            closed: false,
            vertices: coords.map(toPt),
          });
        }
        break;
      }
      case 'MultiLineString': {
        for (const lineCoords of geom.coordinates || []) {
          if (Array.isArray(lineCoords) && lineCoords.length >= 2) {
            entities.push({
              type: 'POLYLINE',
              layer: layerName,
              color,
              lineWeight,
              closed: false,
              vertices: lineCoords.map(toPt),
            });
          }
        }
        break;
      }
      case 'Polygon': {
        for (const ring of geom.coordinates || []) {
          if (Array.isArray(ring) && ring.length >= 3) {
            entities.push({
              type: 'POLYLINE',
              layer: layerName,
              color,
              lineWeight,
              closed: true,
              shape: true,
              vertices: ring.map(toPt),
            });
          }
        }
        break;
      }
      case 'MultiPolygon': {
        for (const poly of geom.coordinates || []) {
          for (const ring of poly || []) {
            if (Array.isArray(ring) && ring.length >= 3) {
              entities.push({
                type: 'POLYLINE',
                layer: layerName,
                color,
                lineWeight,
                closed: true,
                shape: true,
                vertices: ring.map(toPt),
              });
            }
          }
        }
        break;
      }
      case 'GeometryCollection': {
        for (const subGeom of geom.geometries || []) {
          emitGeometry(subGeom, props, layerName, color, lineWeight);
        }
        break;
      }
    }
  };

  for (const feat of features) {
    const props = feat?.properties || {};
    const rawLayer =
      props.Layer !== undefined && props.Layer !== null && String(props.Layer).trim() !== ''
        ? fixTurkishDxfText(String(props.Layer))
        : props.Level !== undefined && props.Level !== null
          ? `Level ${props.Level}`
          : 'Level 1';

    const colorIdx = typeof props.ColorIndex === 'number' && props.ColorIndex > 0 ? props.ColorIndex : undefined;
    const lineWeight = typeof props.Weight === 'number' && props.Weight > 0 ? props.Weight * 25 : undefined;
    ensureLayer(rawLayer, colorIdx, props.Weight);
    emitGeometry(feat.geometry, props, rawLayer, colorIdx, lineWeight);
  }

  const warnings: string[] = [];
  if (entities.length === 0) {
    warnings.push('DGN dosyasında vektör obje bulunamadı.');
  }

  return {
    parsed: {
      header: {},
      tables: { layer: { layers: layerDict } },
      blocks: {},
      entities,
      metadata: {
        format: 'DGN',
        version: 'V7',
      },
    },
    extractedLayers,
    format: 'DGN',
    warnings,
    stats: {
      entityCount: entities.length,
      blockCount: 0,
      version: 'MicroStation V7 DGN',
    },
  };
}

/**
 * Unified entry point for parsing .dxf, .dwg, or .dgn CAD files into a normalized structure.
 */
export async function parseCADFile(file: File): Promise<CADParseResult> {
  const format = detectFormat(file);

  if (format === 'DXF') {
    const buffer = await file.arrayBuffer();
    const { parsed, extractedLayers } = parseDXFBuffer(buffer);
    const warnings: string[] = [];
    if (!parsed?.entities?.length) {
      warnings.push('DXF dosyasında çizim objesi bulunamadı.');
    }
    return {
      parsed: {
        ...parsed,
        metadata: {
          format: 'DXF',
          version: parsed?.header?.$ACADVER,
        },
      },
      extractedLayers,
      format: 'DXF',
      warnings,
      stats: {
        entityCount: Array.isArray(parsed?.entities) ? parsed.entities.length : 0,
        blockCount: parsed?.blocks ? Object.keys(parsed.blocks).length : 0,
        version: parsed?.header?.$ACADVER,
      },
    };
  }

  if (format === 'DWG') {
    return parseDWGFile(file);
  }

  return parseDGNFile(file);
}
