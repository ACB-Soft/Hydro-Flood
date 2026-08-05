import DxfParser from 'dxf-parser';

/**
 * Normalizes Turkish characters from DXF text / layer names.
 * Handles AutoCAD \U+XXXX unicode escapes, \M+5XXXX MIF escapes,
 * and fixes CP1254 characters mis-decoded into ISO-8859-1 (Latin-1).
 */
export function fixTurkishDxfText(text: string | null | undefined): string {
  if (!text) return '';
  let s = text;

  // 1. Unescape AutoCAD \U+XXXX (e.g. \U+015E -> Ş, \U+0130 -> İ, \U+011F -> Ğ)
  s = s.replace(/\\U\+([0-9A-Fa-f]{4})/gi, (_, hex) => {
    try {
      return String.fromCharCode(parseInt(hex, 16));
    } catch {
      return _;
    }
  });

  // 2. Unescape AutoCAD MIF \M+5XXXX escapes
  s = s.replace(/\\M\+5([0-9A-Fa-f]{4})/gi, (_, hex) => {
    try {
      return String.fromCharCode(parseInt(hex, 16));
    } catch {
      return _;
    }
  });

  // 3. Fix CP1254 bytes mistakenly decoded as ISO-8859-1 (Latin-1)
  // 0xDE (Þ) -> Ş, 0xFE (þ) -> ş
  // 0xD0 (Ð) -> Ğ, 0xF0 (ð) -> ğ
  // 0xDD (Ý) -> İ, 0xFD (ý) -> ı
  s = s
    .replace(/Þ/g, 'Ş')
    .replace(/þ/g, 'ş')
    .replace(/Ð/g, 'Ğ')
    .replace(/ð/g, 'ğ')
    .replace(/Ý/g, 'İ')
    .replace(/ý/g, 'ı');

  return s;
}

export interface ExtractedLayer {
  name: string;
  color: number;
  visible: boolean;
}

/**
 * Reads array buffer from DXF file, auto-detects UTF-8 / Windows-1254 encoding,
 * parses with DxfParser, and normalizes all Turkish character strings in layers and entities.
 */
export function parseDXFBuffer(arrayBuffer: ArrayBuffer): { parsed: any; extractedLayers: ExtractedLayer[] } {
  let content = '';

  // Step A: Decode Buffer.
  // First attempt UTF-8 with fatal: true.
  // If it throws because of non-UTF-8 single-byte characters (e.g. CP1254), fallback to windows-1254.
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    content = utf8Decoder.decode(arrayBuffer);

    // If header explicitly mentions 1254, ISO-8859-9, or CP1254, decode as windows-1254
    if (content.includes('$DWGCODEPAGE') && (content.includes('1254') || content.includes('8859-9') || content.includes('ANSI_1254'))) {
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

  // Step B: Normalize Layers
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
      extractedLayers.push({
        name: fixedName,
        color: layerObj?.color || 7,
        visible: true,
      });
    }
    parsed.tables.layer.layers = newLayerDict;
  }

  // Step C: Normalize Entities
  if (parsed && Array.isArray(parsed.entities)) {
    parsed.entities.forEach((entity: any) => {
      if (entity.layer) {
        entity.layer = fixTurkishDxfText(entity.layer);
      }
      if (entity.text) {
        entity.text = fixTurkishDxfText(entity.text);
      }
      if (entity.string) {
        entity.string = fixTurkishDxfText(entity.string);
      }
    });
  }

  return { parsed, extractedLayers };
}
