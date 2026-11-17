/**
 * Web Worker for parsing AutoCAD DWG binary files in the browser
 * using LibreDWG WebAssembly (@mlightcad/libredwg-web).
 */
import { LibreDwg, Dwg_File_Type } from '@mlightcad/libredwg-web';

let cachedLibreDwg: any = null;
let cachedWasmPath: string | null = null;

async function getLibreDwg(wasmBasePath: string) {
  if (cachedLibreDwg && cachedWasmPath === wasmBasePath) {
    return cachedLibreDwg;
  }
  cachedLibreDwg = await LibreDwg.create(wasmBasePath);
  cachedWasmPath = wasmBasePath;
  return cachedLibreDwg;
}

/**
 * Recursively strips BigInt values or non-clonable types so structured cloning never fails.
 */
function sanitizeValue(val: any, depth = 0): any {
  if (depth > 12 || val === null || val === undefined) return val;
  const t = typeof val;
  if (t === 'bigint') return val.toString();
  if (t === 'number' || t === 'string' || t === 'boolean') return val;
  if (Array.isArray(val)) return val.map((item) => sanitizeValue(item, depth + 1));
  if (val instanceof Uint8Array || val instanceof ArrayBuffer) return undefined;
  if (t === 'object') {
    const out: Record<string, any> = {};
    for (const key of Object.keys(val)) {
      if (key === 'xdata' || key === 'bmpPreview' || key === 'thumbnailImage' || key === 'binaryData') {
        continue;
      }
      const next = sanitizeValue(val[key], depth + 1);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  return undefined;
}

self.onmessage = async (e: MessageEvent) => {
  const { id, buffer, wasmBasePath } = e.data;

  try {
    const libredwg = await getLibreDwg(wasmBasePath);
    const dwgData = libredwg.dwg_read_data(buffer, Dwg_File_Type.DWG);

    if (!dwgData) {
      throw new Error('DWG dosyası LibreDWG WASM motoru tarafından okunamadı. Dosya bozuk veya desteklenmeyen çok eski bir sürüm olabilir.');
    }

    let db: any;
    let versionInfo: any = null;
    let unknownEntityCount = 0;

    try {
      versionInfo = libredwg.dwg_get_version_type(dwgData);
      const converted = libredwg.convertEx(dwgData);
      db = converted.database;
      unknownEntityCount = converted.stats?.unknownEntityCount || 0;
    } finally {
      libredwg.dwg_free(dwgData);
    }

    const blockEntries: any[] = db?.tables?.BLOCK_RECORD?.entries || [];
    const modelSpaceRecord = blockEntries.find(
      (b) => typeof b?.name === 'string' && b.name.toUpperCase() === '*MODEL_SPACE'
    );

    const paperSpaceHandles = new Set<string>(
      blockEntries
        .filter((b) => typeof b?.name === 'string' && b.name.toUpperCase().startsWith('*PAPER_SPACE'))
        .map((b) => String(b.handle))
    );

    let modelEntities: any[] = [];
    if (modelSpaceRecord && Array.isArray(modelSpaceRecord.entities) && modelSpaceRecord.entities.length > 0) {
      modelEntities = [...modelSpaceRecord.entities];
    } else if (Array.isArray(db?.entities)) {
      modelEntities = db.entities.filter(
        (ent: any) => !paperSpaceHandles.has(String(ent?.ownerBlockRecordSoftId))
      );
    }

    const blockDefs = blockEntries
      .filter((b) => {
        const upper = String(b?.name || '').toUpperCase();
        return upper && upper !== '*MODEL_SPACE' && !upper.startsWith('*PAPER_SPACE');
      })
      .map((b) => ({
        name: b.name,
        basePoint: b.basePoint || { x: 0, y: 0, z: 0 },
        entities: Array.isArray(b.entities) ? b.entities : [],
      }));

    const payload = sanitizeValue({
      header: db?.header || {},
      layers: db?.tables?.LAYER?.entries || [],
      blocks: blockDefs,
      entities: modelEntities,
      version: versionInfo ? String(versionInfo.type || db?.header?.ACADVER || '') : String(db?.header?.ACADVER || ''),
      unknownEntityCount,
    });

    self.postMessage({ id, success: true, payload });
  } catch (err: any) {
    self.postMessage({
      id,
      success: false,
      error: err?.message || 'DWG ayrıştırma sırasında beklenmeyen bir hata oluştu.',
    });
  }
};
