import React, { useState, useRef, useEffect } from 'react';
import { Upload, Eye, FileCode, CheckCircle, RefreshCw, Layers, ZoomIn, Compass, RotateCcw, Sliders, Mountain, Globe, Map as MapIcon } from 'lucide-react';
import DxfParser from 'dxf-parser';
import proj4 from 'proj4';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export interface CADLayer {
  name: string;
  color: number;
  visible: boolean;
  lineWeight?: number;
}

interface DXFAnalysisProps {
  dxfData?: any;
  setDxfData?: (data: any) => void;
  layers?: CADLayer[];
  setLayers?: React.Dispatch<React.SetStateAction<CADLayer[]>>;
  crs?: string;
  setCrs?: (crs: string) => void;
  dxfFileName?: string | null;
  setDxfFileName?: (name: string | null) => void;
  onNavigateToDEMGenerator?: () => void;
}

const getAciColor = (colorNum?: any, defaultColor = '#38bdf8'): string => {
  if (colorNum === undefined || colorNum === null) return defaultColor;
  
  // Direct hex strings (e.g. "#FF0000" or "FF0000")
  if (typeof colorNum === 'string') {
    if (colorNum.startsWith('#')) return colorNum;
    const parsed = parseInt(colorNum, 16);
    if (!isNaN(parsed)) return '#' + parsed.toString(16).padStart(6, '0');
    return defaultColor;
  }
  
  // True color integer (> 255 e.g. 0x00FF0000)
  if (typeof colorNum === 'number' && colorNum > 255) {
    const hex = (colorNum & 0xFFFFFF).toString(16).padStart(6, '0');
    return `#${hex}`;
  }
  
  let aci = Math.abs(Math.round(Number(colorNum)));
  if (isNaN(aci) || aci === 0 || aci === 256) return defaultColor;
  
  // Standard AutoCAD Color Index (ACI 1-9)
  const baseAci: Record<number, string> = {
    1: '#ff0000', // Red
    2: '#ffff00', // Yellow
    3: '#00ff00', // Green
    4: '#00ffff', // Cyan
    5: '#0000ff', // Blue
    6: '#ff00ff', // Magenta
    7: '#ffffff', // White
    8: '#7f7f7f', // Dark Gray
    9: '#c0c0c0', // Light Gray
  };
  
  if (baseAci[aci]) return baseAci[aci];
  
  // Algorithmic ACI (10..249)
  if (aci >= 10 && aci <= 249) {
    const hueIndex = Math.floor((aci - 10) / 10);
    const hue = (hueIndex * 15) % 360;
    
    const shade = (aci - 10) % 10;
    let s = 1.0;
    let l = 0.5;
    
    if (shade === 0 || shade === 1) { s = 1.0; l = 0.5; }
    else if (shade === 2 || shade === 3) { s = 1.0; l = 0.65; }
    else if (shade === 4 || shade === 5) { s = 1.0; l = 0.8; }
    else if (shade === 6 || shade === 7) { s = 0.7; l = 0.5; }
    else if (shade === 8 || shade === 9) { s = 0.4; l = 0.3; }

    return hslToHex(hue, s, l);
  }
  
  // Gray scale range 250..255
  if (aci >= 250 && aci <= 255) {
    const grayVal = Math.round(50 + (aci - 250) * 40);
    const hex = grayVal.toString(16).padStart(2, '0');
    return `#${hex}${hex}${hex}`;
  }

  return defaultColor;
};

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (0 <= h && h < 60) { r = c; g = x; b = 0; }
  else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
  else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
  else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
  else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
  else if (300 <= h && h < 360) { r = c; g = 0; b = x; }

  const rHex = Math.round((r + m) * 255).toString(16).padStart(2, '0');
  const gHex = Math.round((g + m) * 255).toString(16).padStart(2, '0');
  const bHex = Math.round((b + m) * 255).toString(16).padStart(2, '0');

  return `#${rHex}${gHex}${bHex}`;
}

const CRS_LIST = [
  { code: 'NONE', name: 'Seçilmedi (Yerel Koordinat)' },
  { code: 'EPSG:4326', name: 'WGS 84 (Coğrafi - Global)', def: '+proj=longlat +datum=WGS84 +no_defs' },
  { code: 'EPSG:3857', name: 'WGS 84 / Pseudo-Mercator (Web Mercator)', def: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs' },
  { code: 'EPSG:5253', name: 'TUREF / TM27 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=27 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5254', name: 'TUREF / TM30 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=30 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5255', name: 'TUREF / TM33 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=33 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5256', name: 'TUREF / TM36 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=36 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5257', name: 'TUREF / TM39 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=39 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5258', name: 'TUREF / TM42 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=42 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5259', name: 'TUREF / TM45 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=45 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:32635', name: 'WGS 84 / UTM Zone 35N (6°)', def: '+proj=utm +zone=35 +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32636', name: 'WGS 84 / UTM Zone 36N (6°)', def: '+proj=utm +zone=36 +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32637', name: 'WGS 84 / UTM Zone 37N (6°)', def: '+proj=utm +zone=37 +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32638', name: 'WGS 84 / UTM Zone 38N (6°)', def: '+proj=utm +zone=38 +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:5220', name: 'ED50 / TM27 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=27 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5221', name: 'ED50 / TM30 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=30 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5222', name: 'ED50 / TM33 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=33 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5223', name: 'ED50 / TM36 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=36 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5224', name: 'ED50 / TM39 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=39 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5225', name: 'ED50 / TM42 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=42 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5226', name: 'ED50 / TM45 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=45 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:23035', name: 'ED50 / UTM Zone 35N (6°)', def: '+proj=utm +zone=35 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:23036', name: 'ED50 / UTM Zone 36N (6°)', def: '+proj=utm +zone=36 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:23037', name: 'ED50 / UTM Zone 37N (6°)', def: '+proj=utm +zone=37 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:23038', name: 'ED50 / UTM Zone 38N (6°)', def: '+proj=utm +zone=38 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
];

const BASEMAP_URLS: Record<string, string> = {
  hybrid: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
  satellite: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
  esri: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  street: 'https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png'
};

function LeafletCenterUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: false });
  }, [center, zoom, map]);
  return null;
}

const DXFAnalysis: React.FC<DXFAnalysisProps> = ({
  dxfData: propsDxfData,
  setDxfData: propsSetDxfData,
  layers: propsLayers,
  setLayers: propsSetLayers,
  crs: propsCrs,
  setCrs: propsSetCrs,
  dxfFileName: propsDxfFileName,
  setDxfFileName: propsSetDxfFileName,
  onNavigateToDEMGenerator,
}) => {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [localCrs, setLocalCrs] = useState<string>('NONE');
  const [isParsing, setIsParsing] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [localDxfData, setLocalDxfData] = useState<any>(null);
  const [localLayers, setLocalLayers] = useState<CADLayer[]>([]);
  
  const dxfData = propsDxfData ?? localDxfData;
  const layers = propsLayers ?? localLayers;
  const crs = propsCrs ?? localCrs;
  const isParsed = Boolean(dxfData);

  const updateDxfData = (data: any) => {
    setLocalDxfData(data);
    propsSetDxfData?.(data);
  };

  const updateLayers = (newLayers: CADLayer[] | ((prev: CADLayer[]) => CADLayer[])) => {
    if (typeof newLayers === 'function') {
      setLocalLayers(prev => {
        const updated = newLayers(prev);
        propsSetLayers?.(updated);
        return updated;
      });
    } else {
      setLocalLayers(newLayers);
      propsSetLayers?.(newLayers);
    }
  };

  const updateCrs = (c: string) => {
    setLocalCrs(c);
    propsSetCrs?.(c);
  };

  // Mobile Tab State: 'controls' (default so user uploads/parses file first) or 'map'
  const [mobileTab, setMobileTab] = useState<'controls' | 'map'>('controls');
  const [basemap, setBasemap] = useState<'none' | 'hybrid' | 'satellite' | 'esri' | 'street'>('none');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [mapCenter, setMapCenter] = useState<[number, number]>([39.9208, 32.8541]);
  const [mapZoom, setMapZoom] = useState<number>(15);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    updateDxfData(null);
    setUploadMessage(`Dosya seçildi: ${file.name}`);
  };

  const handleParse = async () => {
    if (!pendingFile) return;
    setIsParsing(true);
    setUploadMessage('DXF dosyası ayrıştırılıyor...');

    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const parser = new DxfParser();
          const parsed = parser.parseSync(content);
          
          updateDxfData(parsed);
          propsSetDxfFileName?.(pendingFile.name);
          
          // Extract layers
          const extractedLayers: CADLayer[] = [];
          if (parsed.tables && parsed.tables.layer && parsed.tables.layer.layers) {
             const layerDict = parsed.tables.layer.layers;
             for (const layerName in layerDict) {
                extractedLayers.push({
                   name: layerName,
                   color: layerDict[layerName].color || 7,
                   visible: true
                });
             }
          }
          updateLayers(extractedLayers);
          
          setZoom(1);
          setPan({ x: 0, y: 0 });
          setUploadMessage(`DXF Açıldı: ${extractedLayers.length} katman bulundu.`);
          // Switch to map view automatically on mobile after parsing
          setMobileTab('map');
        } catch (err) {
          console.error("DXF Parse Error:", err);
          setUploadMessage("DXF dosyası ayrıştırılamadı. Geçerli bir DXF seçtiğinizden emin olun.");
        } finally {
          setIsParsing(false);
        }
      };
      reader.readAsText(pendingFile);
    } catch (err) {
      console.error(err);
      setUploadMessage("Dosya okuma hatası oluştu.");
      setIsParsing(false);
    }
  };

  const toggleLayer = (layerName: string) => {
    updateLayers(prev =>
      prev.map(l => l.name === layerName ? { ...l, visible: !l.visible } : l)
    );
  };

  // Rendering DXF on Canvas
  useEffect(() => {
    if (!canvasRef.current || !dxfData || !isParsed) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    if (basemap === 'none') {
      ctx.fillStyle = '#0b1329';
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = 'rgba(11, 19, 41, 0.25)';
      ctx.fillRect(0, 0, width, height);
    }

    // Calculate extents
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    if (dxfData.entities && dxfData.entities.length > 0) {
       dxfData.entities.forEach((entity: any) => {
          const layer = layers.find(l => l.name === entity.layer);
          if (layer && !layer.visible) return;

          if (entity.vertices) {
             entity.vertices.forEach((v: any) => {
                if (v.x < minX) minX = v.x;
                if (v.y < minY) minY = v.y;
                if (v.x > maxX) maxX = v.x;
                if (v.y > maxY) maxY = v.y;
             });
          } else if (entity.center && entity.radius) {
             if (entity.center.x - entity.radius < minX) minX = entity.center.x - entity.radius;
             if (entity.center.y - entity.radius < minY) minY = entity.center.y - entity.radius;
             if (entity.center.x + entity.radius > maxX) maxX = entity.center.x + entity.radius;
             if (entity.center.y + entity.radius > maxY) maxY = entity.center.y + entity.radius;
          } else if (entity.position) {
             if (entity.position.x < minX) minX = entity.position.x;
             if (entity.position.y < minY) minY = entity.position.y;
             if (entity.position.x > maxX) maxX = entity.position.x;
             if (entity.position.y > maxY) maxY = entity.position.y;
          } else if (entity.startPoint && entity.endPoint) {
             if (entity.startPoint.x < minX) minX = entity.startPoint.x;
             if (entity.startPoint.y < minY) minY = entity.startPoint.y;
             if (entity.startPoint.x > maxX) maxX = entity.startPoint.x;
             if (entity.startPoint.y > maxY) maxY = entity.startPoint.y;
             if (entity.endPoint.x < minX) minX = entity.endPoint.x;
             if (entity.endPoint.y < minY) minY = entity.endPoint.y;
             if (entity.endPoint.x > maxX) maxX = entity.endPoint.x;
             if (entity.endPoint.y > maxY) maxY = entity.endPoint.y;
          }
       });
    }

    if (minX === Infinity) {
       minX = 0; minY = 0; maxX = 100; maxY = 100;
    }

    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const centerX = width / 2 + pan.x;
    const centerY = height / 2 + pan.y;

    const fitScale = Math.min((width * 0.85) / spanX, (height * 0.85) / spanY) || 1;

    // Project world center for Satellite Basemap synchronization
    const worldMidX = midX - (pan.x / (fitScale * zoom));
    const worldMidY = midY + (pan.y / (fitScale * zoom));

    if (crs !== 'NONE') {
      const crsItem = CRS_LIST.find(c => c.code === crs);
      if (crsItem?.def) {
        try {
          const [lon, lat] = proj4(crsItem.def, 'EPSG:4326', [worldMidX, worldMidY]);
          if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            setMapCenter([lat, lon]);
            setMapZoom(Math.max(2, Math.min(19, Math.round(15 + Math.log2(zoom)))));
          }
        } catch (e) {
          // proj4 fallback
        }
      }
    } else if (worldMidX >= 25 && worldMidX <= 45 && worldMidY >= 35 && worldMidY <= 42) {
      setMapCenter([worldMidY, worldMidX]);
    }

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(zoom, zoom);

    // Grid background
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1 / zoom;
    const gridSize = Math.max(10, Math.round(spanX / 10));
    for (let x = minX - spanX; x <= maxX + spanX; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo((x - midX) * fitScale, -(minY - spanY - midY) * fitScale);
      ctx.lineTo((x - midX) * fitScale, -(maxY + spanY - midY) * fitScale);
      ctx.stroke();
    }
    for (let y = minY - spanY; y <= maxY + spanY; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo((minX - spanX - midX) * fitScale, -(y - midY) * fitScale);
      ctx.lineTo((maxX + spanX - midX) * fitScale, -(y - midY) * fitScale);
      ctx.stroke();
    }

    // Draw entities with their original layer/entity colors
    if (dxfData.entities) {
      dxfData.entities.forEach((entity: any) => {
        const layer = layers.find(l => l.name === entity.layer);
        if (layer && !layer.visible) return;

        // Determine entity color (entity color override vs layer color)
        const layerColorHex = getAciColor(layer?.color, '#38bdf8');
        const entityRawColor = entity.color ?? entity.colorNumber ?? entity.trueColor;
        const strokeColor = (entityRawColor !== undefined && entityRawColor !== 256) 
          ? getAciColor(entityRawColor, layerColorHex) 
          : layerColorHex;

        // Determine line weight from DXF entity or layer
        const entityLw = entity.lineWeight ?? entity.lineweight;
        const layerLw = layer?.lineWeight;
        let lwMM = 0.25; // Default 0.25mm
        if (typeof entityLw === 'number' && entityLw > 0) {
          lwMM = entityLw / 100;
        } else if (typeof layerLw === 'number' && layerLw > 0) {
          lwMM = layerLw / 100;
        }
        // Convert mm to pixels (~3.78 px per mm), adjusted for zoom
        const calcLineWidth = Math.max(1 / zoom, (lwMM * 3.5) / zoom);

        ctx.strokeStyle = strokeColor;
        ctx.fillStyle = strokeColor;
        ctx.lineWidth = calcLineWidth;

        if (entity.type === 'LINE') {
          const v0 = entity.vertices ? entity.vertices[0] : entity.startPoint;
          const v1 = entity.vertices ? entity.vertices[1] : entity.endPoint;
          if (v0 && v1) {
            ctx.beginPath();
            ctx.moveTo((v0.x - midX) * fitScale, -(v0.y - midY) * fitScale);
            ctx.lineTo((v1.x - midX) * fitScale, -(v1.y - midY) * fitScale);
            ctx.stroke();
          }
        } else if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE' || entity.type === 'SPLINE') {
          if (entity.vertices && entity.vertices.length > 0) {
            ctx.beginPath();
            entity.vertices.forEach((v: any, i: number) => {
              const sx = (v.x - midX) * fitScale;
              const sy = -(v.y - midY) * fitScale;
              if (i === 0) ctx.moveTo(sx, sy);
              else ctx.lineTo(sx, sy);
            });
            if (entity.shape || entity.closed) ctx.closePath();
            ctx.stroke();
          }
        } else if (entity.type === 'CIRCLE') {
          if (entity.center) {
            const cx = (entity.center.x - midX) * fitScale;
            const cy = -(entity.center.y - midY) * fitScale;
            const r = (entity.radius || 1) * fitScale;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, 2 * Math.PI);
            ctx.stroke();
          }
        } else if (entity.type === 'ARC') {
          if (entity.center) {
            const cx = (entity.center.x - midX) * fitScale;
            const cy = -(entity.center.y - midY) * fitScale;
            const r = (entity.radius || 1) * fitScale;
            const startAngle = -(entity.endAngle || 0);
            const endAngle = -(entity.startAngle || 0);
            ctx.beginPath();
            ctx.arc(cx, cy, r, startAngle, endAngle);
            ctx.stroke();
          }
        } else if (entity.type === 'POINT') {
          const pt = entity.position || (entity.vertices && entity.vertices[0]);
          if (pt) {
            const px = (pt.x - midX) * fitScale;
            const py = -(pt.y - midY) * fitScale;
            
            // Read $PDSIZE from DXF header if available
            const pdSizeHeader = dxfData.header?.$PDSIZE ?? 0;
            let pdWorldSize = 0;
            if (pdSizeHeader > 0) {
              pdWorldSize = pdSizeHeader;
            } else if (pdSizeHeader < 0) {
              pdWorldSize = (Math.abs(pdSizeHeader) / 100) * spanX;
            } else {
              pdWorldSize = spanX * 0.003; // Fallback ~0.3% of drawing width
            }
            const ptRadius = Math.max(2 / zoom, (pdWorldSize * fitScale) / 2);

            ctx.beginPath();
            ctx.arc(px, py, ptRadius, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(px, py, Math.max(1 / zoom, ptRadius * 0.25), 0, 2 * Math.PI);
            ctx.fill();
          }
        } else if (entity.type === 'TEXT' || entity.type === 'MTEXT') {
          const pt = entity.startPoint || entity.position || (entity.vertices && entity.vertices[0]);
          if (pt && entity.text) {
            const tx = (pt.x - midX) * fitScale;
            const ty = -(pt.y - midY) * fitScale;
            
            // Clean MTEXT formatting codes (\P, \f..., \H..., \W..., \{, \})
            let rawStr = String(entity.text)
              .replace(/\\P/g, ' ')
              .replace(/\\{[^}]*\}|\\[a-zA-Z0-9]+;/g, '')
              .replace(/[\{\}]/g, '')
              .trim();
            if (!rawStr) return;

            // Read CAD text height directly from DXF entity (height / textHeight / nominalTextHeight)
            let cadTextHeight = entity.height || entity.textHeight || entity.nominalTextHeight;
            if (!cadTextHeight || cadTextHeight <= 0) {
              cadTextHeight = dxfData.header?.$TEXTSIZE || (spanX * 0.005);
            }

            // Calculate exact font size in canvas space
            const fontCanvasPx = cadTextHeight * fitScale;

            ctx.save();
            ctx.translate(tx, ty);

            // Apply rotation if defined in DXF entity (in degrees)
            if (entity.rotation) {
              const rotRad = -(entity.rotation * Math.PI) / 180;
              ctx.rotate(rotRad);
            }

            ctx.font = `${fontCanvasPx}px sans-serif`;
            ctx.textBaseline = 'bottom';
            ctx.fillText(rawStr, 0, 0);
            ctx.restore();
          }
        }
      });
    }

    ctx.restore();

  }, [dxfData, isParsed, zoom, pan, layers, mobileTab]);

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsPanning(true);
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setPan({
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Touch pan handlers for mobile
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      setIsPanning(true);
      setStartPan({ x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y });
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (isPanning && e.touches.length === 1) {
      setPan({
        x: e.touches[0].clientX - startPan.x,
        y: e.touches[0].clientY - startPan.y
      });
    }
  };

  const handleTouchEnd = () => {
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    if (e.deltaY < 0) {
      setZoom((prev) => Math.min(prev * zoomFactor, 50));
    } else {
      setZoom((prev) => Math.max(prev / zoomFactor, 0.1));
    }
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0 overflow-hidden">
      
      {/* Mobile Tab Navigation (< lg screen width) */}
      <div className="flex lg:hidden bg-slate-900 border border-slate-800 rounded-xl p-1 mb-2 shrink-0">
        <button
          onClick={() => setMobileTab('controls')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all relative ${
            mobileTab === 'controls' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Sliders size={13} />
          <span>Dosya & Katman Paneli</span>
          {pendingFile && !isParsed && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse absolute top-1 right-2" />
          )}
          {isParsed && (
            <span className="text-[9px] bg-slate-950 text-emerald-400 px-1.5 py-0.2 rounded-full font-mono">
              {layers.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setMobileTab('map')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            mobileTab === 'map' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Eye size={13} />
          <span>2D CAD Harita Ekranı</span>
        </button>
      </div>

      {/* Main Grid Container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full min-h-0">
        
        {/* LEFT COLUMN: Controls Panel (Visible on Desktop OR when MobileTab === 'controls') */}
        <div className={`lg:col-span-3 flex flex-col gap-2.5 h-full min-h-0 overflow-y-auto lg:overflow-hidden ${
          mobileTab === 'controls' ? 'flex' : 'hidden lg:flex'
        }`}>
          
          {/* 1. Ultra Compact Dosya Seçici */}
          <div className="bg-white border border-slate-300 rounded-2xl p-2.5 shrink-0 shadow-sm space-y-1.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Upload size={13} className="text-cyan-600" />
                1. DXF Dosyası Seç
              </h3>
              {pendingFile && (
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                  <CheckCircle size={10} /> Seçildi
                </span>
              )}
            </div>
            
            <label className="border border-dashed border-slate-300 hover:border-cyan-500 rounded-xl px-2.5 py-1.5 flex items-center gap-2 cursor-pointer transition-all bg-slate-50 hover:bg-slate-100">
              <input type="file" accept=".dxf" className="hidden" onChange={handleFileUpload} />
              <div className="w-6 h-6 bg-cyan-100 rounded-lg flex items-center justify-center text-cyan-700 shrink-0">
                <Upload size={13} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-800 truncate">
                  {pendingFile ? pendingFile.name : 'DXF Seç veya Sürükle'}
                </p>
              </div>
            </label>
          </div>

          {/* 2. Projeksiyon Tanımlayıcı (İsteğe Bağlı) */}
          <div className="bg-white border border-slate-300 rounded-2xl p-2.5 shrink-0 shadow-sm space-y-1">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Compass size={13} className="text-indigo-600" />
                2. Projeksiyon / CRS
              </h3>
              <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-medium">İsteğe Bağlı</span>
            </div>
            <select
              value={crs}
              onChange={(e) => updateCrs(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-cyan-500"
            >
              {CRS_LIST.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Dosyayı Aç / Ayrıştır Butonu */}
          <div className="bg-white border border-slate-300 rounded-2xl p-2.5 shrink-0 shadow-sm space-y-1.5">
            <button
              onClick={handleParse}
              disabled={!pendingFile || isParsing}
              className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm ${
                !pendingFile || isParsing
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                  : 'bg-cyan-600 hover:bg-cyan-700 text-white border border-cyan-500'
              }`}
            >
              {isParsing ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>Ayrıştırılıyor...</span>
                </>
              ) : (
                <>
                  <Eye size={13} />
                  <span>Dosyayı Aç / Ayrıştır</span>
                </>
              )}
            </button>

            {uploadMessage && (
              <div className={`text-[10px] p-1.5 rounded-xl border leading-tight ${
                isParsed 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-medium' 
                  : 'bg-slate-100 border-slate-200 text-slate-700'
              }`}>
                {uploadMessage}
              </div>
            )}
          </div>

          {/* 4. Katman Yöneticisi - En Fazla Yüksekliği Kaplar */}
          <div className="bg-white border border-slate-300 rounded-2xl p-2.5 flex flex-col flex-1 min-h-0 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Layers size={13} className="text-cyan-600" />
                4. Katman Yöneticisi
              </h3>
              {layers.length > 0 && (
                <span className="text-[10px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                  {layers.length} Katman
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-1 min-h-0 custom-scrollbar">
              {layers.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs">
                  Ayrıştırılmış katman verisi yok.
                </div>
              ) : (
                layers.map((l, idx) => (
                  <div key={idx} className="flex items-center justify-between p-1.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span 
                        className="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-300 shadow-sm" 
                        style={{ backgroundColor: getAciColor(l.color) }}
                        title={`Renk Kodu: ${l.color}`}
                      />
                      <span className="text-xs text-slate-800 truncate font-medium">{l.name}</span>
                    </div>
                    <button
                      onClick={() => toggleLayer(l.name)}
                      className={`w-8 h-4 rounded-full relative transition-colors shrink-0 ${l.visible ? 'bg-cyan-600' : 'bg-slate-300'}`}
                    >
                      <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all ${l.visible ? 'left-[18px]' : 'left-0.5'}`} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => onNavigateToDEMGenerator?.()}
              disabled={!isParsed}
              className={`w-full mt-2 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border shadow-sm shrink-0 ${
                isParsed
                  ? 'bg-blue-600 hover:bg-blue-700 border-blue-500 text-white cursor-pointer'
                  : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Mountain size={13} />
              <span>Katmanları DEM Üreticiye Aktar</span>
            </button>
          </div>

        </div>

        {/* RIGHT COLUMN: CAD Canvas Viewer (Visible on Desktop OR when MobileTab === 'map') */}
        <div className={`lg:col-span-9 bg-white border border-slate-300 rounded-2xl overflow-hidden flex flex-col relative shadow-sm h-full min-h-0 ${
          mobileTab === 'map' ? 'flex' : 'hidden lg:flex'
        }`}>
          
          {/* Canvas Toolbar Header */}
          <div className="px-3 py-2 bg-slate-100 border-b border-slate-300 flex items-center justify-between z-10 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-600 animate-pulse" />
              <h3 className="text-xs font-bold text-slate-900">2D CAD Görüntüleme Ekranı</h3>
            </div>

            <div className="flex items-center gap-2">
              {/* Satellite Basemap Selector */}
              <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-slate-300">
                <Globe size={13} className="text-cyan-600" />
                <select
                  value={basemap}
                  onChange={(e) => setBasemap(e.target.value as any)}
                  className="bg-transparent text-xs text-slate-800 font-medium outline-none cursor-pointer"
                >
                  <option value="none" className="bg-white text-slate-900">Uydu Altlığı: Kapalı (Koyu Tuval)</option>
                  <option value="hybrid" className="bg-white text-slate-900">Uydu Hibrit (Google)</option>
                  <option value="satellite" className="bg-white text-slate-900">Uydu Saf (Google)</option>
                  <option value="esri" className="bg-white text-slate-900">Esri World Imagery</option>
                  <option value="street" className="bg-white text-slate-900">Sokak Haritası (OSM)</option>
                </select>
              </div>

              {isParsed && (
                <button
                  onClick={() => onNavigateToDEMGenerator?.()}
                  className="px-2.5 py-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 shadow-sm border border-cyan-500 transition-all cursor-pointer"
                >
                  <Mountain size={13} />
                  <span>DEM Üret</span>
                </button>
              )}

              {/* Quick Mobile Settings Button */}
              <button
                onClick={() => setMobileTab('controls')}
                className="lg:hidden px-2.5 py-1 bg-cyan-100 hover:bg-cyan-200 text-cyan-800 border border-cyan-300 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
              >
                <Sliders size={12} />
                <span>Paneli Aç</span>
              </button>

              <div className="bg-slate-100 px-2 py-1 rounded-lg border border-slate-300 text-[11px] font-mono text-cyan-700 font-bold flex items-center gap-1">
                <ZoomIn size={12} />
                <span>{Math.round(zoom * 100)}%</span>
              </div>
              <button
                onClick={resetView}
                disabled={!isParsed}
                className="p-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 border border-slate-300 rounded-lg transition-colors"
                title="Sıfırla"
              >
                <RotateCcw size={12} />
              </button>
            </div>
          </div>

          {/* Canvas Container */}
          <div className="flex-1 relative w-full h-full min-h-0 bg-slate-900">
            {/* Satellite Basemap Background Layer */}
            {isParsed && basemap !== 'none' && mapCenter && (
              <div className="absolute inset-0 z-0 opacity-90 overflow-hidden pointer-events-none">
                <MapContainer
                  center={mapCenter}
                  zoom={mapZoom}
                  zoomControl={false}
                  attributionControl={false}
                  dragging={false}
                  scrollWheelZoom={false}
                  className="w-full h-full"
                >
                  <TileLayer url={BASEMAP_URLS[basemap] || BASEMAP_URLS.hybrid} />
                  <LeafletCenterUpdater center={mapCenter} zoom={mapZoom} />
                </MapContainer>
              </div>
            )}

            {isParsed && basemap !== 'none' && crs === 'NONE' && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-amber-500 text-slate-950 px-3 py-1 rounded-full font-bold text-[11px] shadow-lg flex items-center gap-1.5 pointer-events-none">
                <span>💡 Uydu altlığının çiziminizle birebir eşleşmesi için sol panelden Koordinat Sistemini (CRS) seçiniz.</span>
              </div>
            )}

            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onWheel={handleWheel}
              className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing touch-none z-10"
              style={{ display: isParsed ? 'block' : 'none' }}
            />

            {!isParsed && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 gap-3 p-6 text-center bg-slate-100">
                <div className="w-14 h-14 rounded-2xl bg-white border border-slate-300 flex items-center justify-center text-slate-500 shadow-sm">
                  <FileCode size={28} />
                </div>
                <div className="space-y-1 max-w-sm">
                  <p className="text-sm font-semibold text-slate-900">2D CAD Görüntüleyici Hazır</p>
                  <p className="text-xs text-slate-600">
                    {mobileTab === 'map' ? (
                      <>
                        Üstteki <span className="text-cyan-700 font-bold">Paneli Aç</span> butonundan bir .dxf dosyası seçip haritanızı ekrana yükleyebilirsiniz.
                      </>
                    ) : (
                      <>
                        Sol taraftaki panelden bir .dxf dosyası seçip &apos;Dosyayı Aç / Ayrıştır&apos; butonuna basarak haritanızı ekrana yükleyebilirsiniz.
                      </>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};

export default DXFAnalysis;
