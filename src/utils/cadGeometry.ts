/**
 * Shared CAD geometry helpers for MTEXT cleanup, numeric kot parsing,
 * recursive INSERT block transformation, and entity bounding boxes.
 */

export interface CADPoint3D {
  x: number;
  y: number;
  z?: number;
}

/**
 * Normalizes Turkish characters from CAD text / layer names.
 * Handles AutoCAD \U+XXXX unicode escapes, \M+5XXXX MIF escapes,
 * and fixes CP1254 characters mis-decoded into ISO-8859-1 (Latin-1).
 */
export function fixTurkishDxfText(text: string | null | undefined): string {
  if (!text) return '';
  let s = String(text);

  s = s.replace(/\\U\+([0-9A-Fa-f]{4})/gi, (_, hex) => {
    try {
      return String.fromCharCode(parseInt(hex, 16));
    } catch {
      return _;
    }
  });

  s = s.replace(/\\M\+5([0-9A-Fa-f]{4})/gi, (_, hex) => {
    try {
      return String.fromCharCode(parseInt(hex, 16));
    } catch {
      return _;
    }
  });

  s = s
    .replace(/Þ/g, 'Ş')
    .replace(/þ/g, 'ş')
    .replace(/Ð/g, 'Ğ')
    .replace(/ð/g, 'ğ')
    .replace(/Ý/g, 'İ')
    .replace(/ý/g, 'ı');

  return s;
}

/**
 * Strips MTEXT formatting codes (\P, \f..., \H..., \{, \}) and returns clean plain text.
 */
export function cleanCADTextString(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  const fixed = fixTurkishDxfText(String(raw));
  return fixed
    .replace(/\\P/gi, ' ')
    .replace(/\\~/g, ' ')
    .replace(/\\[A-Za-z][^;{}]*;/g, '')
    .replace(/\\L|\\O|\\K|\\l|\\o|\\k/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses numeric elevation (kot) from CAD TEXT/MTEXT/ATTRIB strings.
 * Examples supported: "142.58", "142,58", "K=142.58", "KOT: 142,50", "Z=142.5", "142.58 m".
 */
export function parseNumericElevationFromText(raw: unknown): number | null {
  const cleaned = cleanCADTextString(raw);
  if (!cleaned) return null;

  // Pattern A: Explicit Kot/Z prefix (e.g. "K=142.58", "KOT: 142,50", "EL: -3.20 m")
  const prefixMatch = cleaned.match(
    /^(?:kot|k|z|el|elev)\s*[:=]?\s*([+-]?\d{1,5}(?:[.,]\d{1,4})?)\s*m?$/i
  );
  if (prefixMatch) {
    const val = Number(prefixMatch[1].replace(',', '.'));
    if (Number.isFinite(val) && val >= -500 && val <= 9000) {
      return val;
    }
    return null;
  }

  // Pattern B: Standalone numeric kot (e.g. "142.58", "+12.40", "142,58m")
  const normalized = cleaned.replace(/^±\s*/, '');
  const numericMatch = normalized.match(/^([+-]?\d{1,5}(?:[.,]\d{1,4})?)\s*m?$/i);
  if (numericMatch) {
    const val = Number(numericMatch[1].replace(',', '.'));
    if (Number.isFinite(val) && val >= -500 && val <= 9000) {
      return val;
    }
  }

  return null;
}

interface Affine2DPlusZ {
  bx: number;
  by: number;
  bz: number;
  ix: number;
  iy: number;
  iz: number;
  xScale: number;
  yScale: number;
  zScale: number;
  cosR: number;
  sinR: number;
  rotDeg: number;
}

function transformPoint(pt: any, m: Affine2DPlusZ): { x: number; y: number; z: number } {
  const px = typeof pt?.x === 'number' && Number.isFinite(pt.x) ? pt.x : 0;
  const py = typeof pt?.y === 'number' && Number.isFinite(pt.y) ? pt.y : 0;
  const pz = typeof pt?.z === 'number' && Number.isFinite(pt.z) ? pt.z : 0;

  const lx = (px - m.bx) * m.xScale;
  const ly = (py - m.by) * m.yScale;
  const lz = (pz - m.bz) * m.zScale;

  const rx = lx * m.cosR - ly * m.sinR;
  const ry = lx * m.sinR + ly * m.cosR;

  return {
    x: m.ix + rx,
    y: m.iy + ry,
    z: m.iz + lz,
  };
}

function cloneAndTransformEntity(entity: any, m: Affine2DPlusZ, inheritedLayer: string): any {
  const resolvedLayer = !entity.layer || entity.layer === '0' ? inheritedLayer : entity.layer;
  const next: any = {
    ...entity,
    layer: resolvedLayer,
    _fromBlock: true,
  };

  const baseElev = typeof entity.elevation === 'number' && Number.isFinite(entity.elevation)
    ? entity.elevation
    : undefined;

  if (baseElev !== undefined) {
    next.elevation = m.iz + (baseElev - m.bz) * m.zScale;
  }

  if (entity.position) {
    const posWithZ = {
      x: entity.position.x,
      y: entity.position.y,
      z: entity.position.z ?? baseElev ?? 0,
    };
    next.position = transformPoint(posWithZ, m);
  }
  if (entity.startPoint) {
    const spWithZ = {
      x: entity.startPoint.x,
      y: entity.startPoint.y,
      z: entity.startPoint.z ?? baseElev ?? 0,
    };
    next.startPoint = transformPoint(spWithZ, m);
  }
  if (entity.endPoint) {
    const epWithZ = {
      x: entity.endPoint.x,
      y: entity.endPoint.y,
      z: entity.endPoint.z ?? baseElev ?? 0,
    };
    next.endPoint = transformPoint(epWithZ, m);
  }
  if (entity.center) {
    const cWithZ = {
      x: entity.center.x,
      y: entity.center.y,
      z: entity.center.z ?? baseElev ?? 0,
    };
    next.center = transformPoint(cWithZ, m);
    if (typeof entity.radius === 'number') {
      const avgScale = (Math.abs(m.xScale) + Math.abs(m.yScale)) / 2;
      next.radius = entity.radius * avgScale;
    }
    if (entity.type === 'ARC' && m.rotDeg !== 0) {
      const rotRad = (m.rotDeg * Math.PI) / 180;
      next.startAngle = (entity.startAngle || 0) + rotRad;
      next.endAngle = (entity.endAngle || 0) + rotRad;
    }
  }
  if (Array.isArray(entity.vertices)) {
    next.vertices = entity.vertices.map((v: any) =>
      transformPoint({ x: v.x, y: v.y, z: v.z ?? baseElev ?? 0 }, m)
    );
  }
  if (typeof entity.rotation === 'number') {
    next.rotation = entity.rotation + m.rotDeg;
  } else if (m.rotDeg !== 0 && (entity.type === 'TEXT' || entity.type === 'MTEXT')) {
    next.rotation = m.rotDeg;
  }
  if (typeof entity.height === 'number') {
    next.height = entity.height * Math.abs(m.yScale);
  }
  if (typeof entity.textHeight === 'number') {
    next.textHeight = entity.textHeight * Math.abs(m.yScale);
  }

  return next;
}

/**
 * Expands INSERT entities recursively using dxfData.blocks so both
 * 2D Canvas viewer/inspector and DEM extractor handle block geometries uniformly.
 */
export function expandCADEntities(
  entities: any[],
  blocks: Record<string, any> | undefined,
  options: { expandInserts?: boolean; maxDepth?: number } = {}
): any[] {
  const { expandInserts = true, maxDepth = 6 } = options;
  if (!Array.isArray(entities) || entities.length === 0) return [];
  if (!expandInserts) {
    return entities;
  }
  const blockMap = blocks || {};

  const out: any[] = [];

  const visit = (ent: any, depth: number, visitedBlocks: Set<string>, parentLayer?: string) => {
    if (!ent) return;
    if (ent.type !== 'INSERT') {
      out.push(ent);
      return;
    }

    const blockName = ent.name;
    const block = blockName ? blockMap[blockName] : undefined;
    const resolvedInsertLayer = (!ent.layer || ent.layer === '0') && parentLayer ? parentLayer : (ent.layer || '0');

    // Emit any ATTRIBs attached to this INSERT (they are already in parent/world space)
    if (Array.isArray(ent.attribs)) {
      for (const attrib of ent.attribs) {
        if (!attrib) continue;
        out.push({
          ...attrib,
          type: attrib.type || 'ATTRIB',
          layer: !attrib.layer || attrib.layer === '0' ? resolvedInsertLayer : attrib.layer,
        });
      }
    }

    if (!block || !Array.isArray(block.entities) || block.entities.length === 0 || depth >= maxDepth || visitedBlocks.has(blockName)) {
      // Keep raw INSERT as fallback marker if block definition has no entities
      out.push(ent);
      return;
    }

    const insPt = ent.position || ent.insertionPoint || { x: 0, y: 0, z: 0 };
    const basePt = block.position || block.basePoint || { x: 0, y: 0, z: 0 };
    const xScale = typeof ent.xScale === 'number' && ent.xScale !== 0 ? ent.xScale : 1;
    const yScale = typeof ent.yScale === 'number' && ent.yScale !== 0 ? ent.yScale : 1;
    const zScale = typeof ent.zScale === 'number' && ent.zScale !== 0 ? ent.zScale : 1;
    const rotDeg = typeof ent.rotation === 'number' && Number.isFinite(ent.rotation) ? ent.rotation : 0;
    const rotRad = (rotDeg * Math.PI) / 180;

    const cols = Math.max(1, Math.min(50, Number(ent.columnCount) || 1));
    const rows = Math.max(1, Math.min(50, Number(ent.rowCount) || 1));
    const colSpacing = Number(ent.columnSpacing) || 0;
    const rowSpacing = Number(ent.rowSpacing) || 0;
    const totalInstances = cols * rows <= 250 ? cols * rows : 1;

    const cosR = Math.cos(rotRad);
    const sinR = Math.sin(rotRad);

    const nextVisited = new Set(visitedBlocks);
    nextVisited.add(blockName);

    let emitted = 0;
    for (let r = 0; r < rows && emitted < totalInstances; r++) {
      for (let c = 0; c < cols && emitted < totalInstances; c++) {
        emitted++;
        const offsetLocalX = c * colSpacing;
        const offsetLocalY = r * rowSpacing;
        const offsetX = offsetLocalX * cosR - offsetLocalY * sinR;
        const offsetY = offsetLocalX * sinR + offsetLocalY * cosR;

        const matrix: Affine2DPlusZ = {
          bx: basePt.x || 0,
          by: basePt.y || 0,
          bz: basePt.z || 0,
          ix: (insPt.x || 0) + offsetX,
          iy: (insPt.y || 0) + offsetY,
          iz: insPt.z || 0,
          xScale,
          yScale,
          zScale,
          cosR,
          sinR,
          rotDeg,
        };

        for (const child of block.entities) {
          if (!child) continue;
          if (child.type === 'ATTDEF') continue; // ATTDEF inside block template shouldn't be plotted as literal placeholder
          const transformed = cloneAndTransformEntity(child, matrix, resolvedInsertLayer);
          if (transformed.type === 'INSERT') {
            visit(transformed, depth + 1, nextVisited, resolvedInsertLayer);
          } else {
            out.push(transformed);
          }
        }
      }
    }
  };

  for (const entity of entities) {
    visit(entity, 0, new Set<string>());
  }

  return out;
}
