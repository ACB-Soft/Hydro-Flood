import DxfParser from 'dxf-parser';
import { fixTurkishDxfText } from './cadGeometry';

export { fixTurkishDxfText };

export interface ExtractedLayer {
  name: string;
  color: number;
  visible: boolean;
  lineWeight?: number;
}

function normalizeDxfEntity(entity: any) {
  if (!entity || typeof entity !== 'object') return;
  if (entity.layer) {
    entity.layer = fixTurkishDxfText(entity.layer);
  } else {
    entity.layer = '0';
  }
  if (entity.text) {
    entity.text = fixTurkishDxfText(entity.text);
  }
  if (entity.string) {
    entity.string = fixTurkishDxfText(entity.string);
  }
  if (entity.type === 'SPLINE' && !Array.isArray(entity.vertices)) {
    if (Array.isArray(entity.fitPoints) && entity.fitPoints.length > 0) {
      entity.vertices = entity.fitPoints;
    } else if (Array.isArray(entity.controlPoints) && entity.controlPoints.length > 0) {
      entity.vertices = entity.controlPoints;
    }
  }
  if (Array.isArray(entity.attribs)) {
    entity.attribs.forEach((attrib: any) => normalizeDxfEntity(attrib));
  }
}

/**
 * Reads array buffer from DXF file, auto-detects UTF-8 / Windows-1254 encoding,
 * parses with DxfParser, and normalizes Turkish characters, blocks, and SPLINE vertices.
 */
export function parseDXFBuffer(arrayBuffer: ArrayBuffer): { parsed: any; extractedLayers: ExtractedLayer[] } {
  let content = '';

  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    content = utf8Decoder.decode(arrayBuffer);

    if (
      content.includes('$DWGCODEPAGE') &&
      (content.includes('1254') || content.includes('8859-9') || content.includes('ANSI_1254'))
    ) {
      const cp1254Decoder = new TextDecoder('windows-1254');
      content = cp1254Decoder.decode(arrayBuffer);
    }
  } catch {
    const cp1254Decoder = new TextDecoder('windows-1254');
    content = cp1254Decoder.decode(arrayBuffer);
  }

  const parser = new DxfParser();
  const parsed = parser.parseSync(content);

  const extractedLayers: ExtractedLayer[] = [];
  const seenLayers = new Set<string>();

  if (parsed && parsed.tables && parsed.tables.layer && parsed.tables.layer.layers) {
    const layerDict = parsed.tables.layer.layers;
    const newLayerDict: Record<string, any> = {};

    for (const rawLayerName in layerDict) {
      const fixedName = fixTurkishDxfText(rawLayerName);
      const layerObj = layerDict[rawLayerName];
      if (layerObj) {
        layerObj.name = fixedName;
        newLayerDict[fixedName] = layerObj;
      }
      seenLayers.add(fixedName);
      extractedLayers.push({
        name: fixedName,
        color: layerObj?.color ?? 7,
        visible: true,
        lineWeight: (layerObj as any)?.lineWeight,
      });
    }
    parsed.tables.layer.layers = newLayerDict;
  }

  if (parsed && Array.isArray(parsed.entities)) {
    parsed.entities.forEach((entity: any) => {
      normalizeDxfEntity(entity);
      if (entity.layer && !seenLayers.has(entity.layer)) {
        seenLayers.add(entity.layer);
        extractedLayers.push({
          name: entity.layer,
          color: 7,
          visible: true,
        });
      }
    });
  }

  if (parsed && parsed.blocks && typeof parsed.blocks === 'object') {
    for (const blockKey of Object.keys(parsed.blocks)) {
      const block = parsed.blocks[blockKey];
      if (block && Array.isArray(block.entities)) {
        block.entities.forEach((entity: any) => normalizeDxfEntity(entity));
      }
    }
  }

  return { parsed, extractedLayers };
}
