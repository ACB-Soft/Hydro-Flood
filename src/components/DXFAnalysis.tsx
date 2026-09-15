import React, { useState, useRef, useEffect } from 'react';
import { Upload, Eye, FileCode, CheckCircle, RefreshCw, Layers, ZoomIn, ZoomOut, Compass, RotateCcw, Sliders, Mountain, Globe, Map as MapIcon, Sun, Moon, MousePointerClick, Info, X, Search } from 'lucide-react';
import DxfParser from 'dxf-parser';
import proj4 from 'proj4';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { parseDXFBuffer, fixTurkishDxfText } from '../utils/dxfUtils';

function distToSegmentSquared(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return (px - x1) * (px - x1) + (py - y1) * (py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return (px - projX) * (px - projX) + (py - projY) * (py - projY);
}

function getEntityTypeLabel(type: string): string {
  switch (type) {
    case 'POINT': return 'Nokta (POINT)';
    case 'LINE': return 'Çizgi (LINE)';
    case 'LWPOLYLINE': return 'Çoklu Çizgi (LWPOLYLINE)';
    case 'POLYLINE': return 'Çoklu Çizgi (POLYLINE)';
    case 'SPLINE': return 'Eğri / Esnek Çizgi (SPLINE)';
    case 'CIRCLE': return 'Daire (CIRCLE)';
    case 'ARC': return 'Yay (ARC)';
    case 'TEXT': return 'Yazı (TEXT)';
    case 'MTEXT': return 'Çok Satırlı Metin (MTEXT)';
    case '3DFACE': return '3D Yüzey (3DFACE)';
    case 'HATCH': return 'Tarama / Alan (HATCH)';
    case 'DIMENSION': return 'Ölçü Çizgisi (DIMENSION)';
    case 'INSERT': return 'Blok Eklemleme (INSERT)';
    default: return type ? `${type}` : 'Bilinmeyen Obje';
  }
}

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

const getAciColor = (colorNum?: any, defaultColor = '#38bdf8', isLightBg = false): string => {
  if (colorNum === undefined || colorNum === null) return defaultColor;
  
  // Direct hex strings (e.g. "#FF0000" or "FF0000")
  if (typeof colorNum === 'string') {
    if (colorNum.startsWith('#')) {
      if (isLightBg && (colorNum.toLowerCase() === '#ffffff' || colorNum.toLowerCase() === '#fff')) {
        return '#0f172a';
      }
      return colorNum;
    }
    const parsed = parseInt(colorNum, 16);
    if (!isNaN(parsed)) {
      const hex = '#' + parsed.toString(16).padStart(6, '0');
      if (isLightBg && hex.toLowerCase() === '#ffffff') return '#0f172a';
      return hex;
    }
    return defaultColor;
  }
  
  // True color integer (> 255 e.g. 0x00FF0000)
  if (typeof colorNum === 'number' && colorNum > 255) {
    const hex = '#' + (colorNum & 0xFFFFFF).toString(16).padStart(6, '0');
    if (isLightBg && hex.toLowerCase() === '#ffffff') return '#0f172a';
    return hex;
  }
  
  let aci = Math.abs(Math.round(Number(colorNum)));
  if (isNaN(aci) || aci === 0 || aci === 256) return defaultColor;
  
  // Standard AutoCAD Color Index (ACI 1-9)
  const baseAci: Record<number, string> = {
    1: '#ff0000', // Red
    2: isLightBg ? '#ca8a04' : '#ffff00', // Yellow
    3: '#16a34a', // Green
    4: isLightBg ? '#0284c7' : '#00ffff', // Cyan
    5: '#2563eb', // Blue
    6: '#d946ef', // Magenta
    7: isLightBg ? '#0f172a' : '#ffffff', // White (ACI 7) -> Dark Slate on Light canvas
    8: '#64748b', // Dark Gray
    9: '#94a3b8', // Light Gray
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

    const hex = hslToHex(hue, s, l);
    if (isLightBg && hex.toLowerCase() === '#ffffff') return '#0f172a';
    return hex;
  }
  
  // Gray scale range 250..255
  if (aci >= 250 && aci <= 255) {
    const grayVal = Math.round(50 + (aci - 250) * 40);
    if (isLightBg && grayVal > 220) return '#0f172a';
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
  const [canvasTheme, setCanvasTheme] = useState<'dark' | 'light'>('dark');

  // Object Inspection / Query State
  const [isInspectMode, setIsInspectMode] = useState<boolean>(false);
  const [selectedEntity, setSelectedEntity] = useState<any | null>(null);
  const [selectedEntityInfo, setSelectedEntityInfo] = useState<{
    typeLabel: string;
    layer: string;
    colorHex: string;
    details: Array<{ label: string; value: string }>;
  } | null>(null);

  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(1);
  const touchStartPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
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
          const buffer = e.target?.result as ArrayBuffer;
          const { parsed, extractedLayers } = parseDXFBuffer(buffer);
          
          updateDxfData(parsed);
          propsSetDxfFileName?.(pendingFile.name);
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
      reader.readAsArrayBuffer(pendingFile);
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

    const isLightBg = canvasTheme === 'light' && basemap === 'none';

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
      ctx.fillStyle = isLightBg ? '#ffffff' : '#0b1329';
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
            let calculatedZoom = 15;
            if (crs === 'EPSG:4326') {
              calculatedZoom = Math.log2(fitScale * zoom * 1.40625);
            } else {
              const metersPerPixel = 1 / (fitScale * zoom);
              const latRad = (lat * Math.PI) / 180;
              const earthTileMetersAtZoom0 = 156543.03392 * Math.cos(latRad);
              calculatedZoom = Math.log2(earthTileMetersAtZoom0 / metersPerPixel);
            }
            const clampedZoom = Math.max(2, Math.min(20, calculatedZoom));

            setMapCenter(prev => {
              if (Math.abs(prev[0] - lat) < 1e-7 && Math.abs(prev[1] - lon) < 1e-7) return prev;
              return [lat, lon];
            });
            setMapZoom(prev => {
              if (Math.abs(prev - clampedZoom) < 1e-4) return prev;
              return clampedZoom;
            });
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

    // Draw entities with their original layer/entity colors
    if (dxfData.entities) {
      dxfData.entities.forEach((entity: any) => {
        const layer = layers.find(l => l.name === entity.layer);
        if (layer && !layer.visible) return;

        // Determine entity color (entity color override vs layer color)
        const layerColorHex = getAciColor(layer?.color, isLightBg ? '#0284c7' : '#38bdf8', isLightBg);
        const entityRawColor = entity.color ?? entity.colorNumber ?? entity.trueColor;
        const strokeColor = (entityRawColor !== undefined && entityRawColor !== 256) 
          ? getAciColor(entityRawColor, layerColorHex, isLightBg) 
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
            let rawStr = fixTurkishDxfText(
              String(entity.text)
                .replace(/\\P/g, ' ')
                .replace(/\\{[^}]*\}|\\[a-zA-Z0-9]+;/g, '')
                .replace(/[\{\}]/g, '')
                .trim()
            );
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

    // Highlight selected entity if present
    if (selectedEntity) {
      ctx.save();
      ctx.strokeStyle = '#facc15'; // bright yellow highlight
      ctx.fillStyle = '#facc15';
      ctx.lineWidth = Math.max(3.5 / zoom, 2);

      if (selectedEntity.type === 'LINE') {
        const v0 = selectedEntity.vertices ? selectedEntity.vertices[0] : selectedEntity.startPoint;
        const v1 = selectedEntity.vertices ? selectedEntity.vertices[1] : selectedEntity.endPoint;
        if (v0 && v1) {
          const sx0 = (v0.x - midX) * fitScale;
          const sy0 = -(v0.y - midY) * fitScale;
          const sx1 = (v1.x - midX) * fitScale;
          const sy1 = -(v1.y - midY) * fitScale;
          ctx.beginPath();
          ctx.moveTo(sx0, sy0);
          ctx.lineTo(sx1, sy1);
          ctx.stroke();

          // Endpoint handles
          ctx.beginPath();
          ctx.arc(sx0, sy0, 4 / zoom, 0, 2 * Math.PI);
          ctx.arc(sx1, sy1, 4 / zoom, 0, 2 * Math.PI);
          ctx.fill();
        }
      } else if (selectedEntity.type === 'LWPOLYLINE' || selectedEntity.type === 'POLYLINE' || selectedEntity.type === 'SPLINE') {
        if (selectedEntity.vertices && selectedEntity.vertices.length > 0) {
          ctx.beginPath();
          selectedEntity.vertices.forEach((v: any, i: number) => {
            const sx = (v.x - midX) * fitScale;
            const sy = -(v.y - midY) * fitScale;
            if (i === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          });
          if (selectedEntity.shape || selectedEntity.closed) ctx.closePath();
          ctx.stroke();

          // Vertex handles
          selectedEntity.vertices.forEach((v: any) => {
            const sx = (v.x - midX) * fitScale;
            const sy = -(v.y - midY) * fitScale;
            ctx.beginPath();
            ctx.arc(sx, sy, 3.5 / zoom, 0, 2 * Math.PI);
            ctx.fill();
          });
        }
      } else if (selectedEntity.type === 'POINT') {
        const pt = selectedEntity.position || (selectedEntity.vertices && selectedEntity.vertices[0]);
        if (pt) {
          const px = (pt.x - midX) * fitScale;
          const py = -(pt.y - midY) * fitScale;
          ctx.beginPath();
          ctx.arc(px, py, 10 / zoom, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(px, py, 4 / zoom, 0, 2 * Math.PI);
          ctx.fill();
        }
      } else if (selectedEntity.type === 'CIRCLE') {
        if (selectedEntity.center) {
          const cx = (selectedEntity.center.x - midX) * fitScale;
          const cy = -(selectedEntity.center.y - midY) * fitScale;
          const r = (selectedEntity.radius || 1) * fitScale;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx, cy, 4 / zoom, 0, 2 * Math.PI);
          ctx.fill();
        }
      } else if (selectedEntity.type === 'ARC') {
        if (selectedEntity.center) {
          const cx = (selectedEntity.center.x - midX) * fitScale;
          const cy = -(selectedEntity.center.y - midY) * fitScale;
          const r = (selectedEntity.radius || 1) * fitScale;
          const startAngle = -(selectedEntity.endAngle || 0);
          const endAngle = -(selectedEntity.startAngle || 0);
          ctx.beginPath();
          ctx.arc(cx, cy, r, startAngle, endAngle);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx, cy, 4 / zoom, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    ctx.restore();

  }, [dxfData, isParsed, zoom, pan, layers, mobileTab, canvasTheme, basemap, crs, selectedEntity]);

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsPanning(true);
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setPan({
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y
      });
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mouseDownPosRef.current) {
      const distMoved = Math.hypot(e.clientX - mouseDownPosRef.current.x, e.clientY - mouseDownPosRef.current.y);
      if (distMoved < 6 && isInspectMode) {
        handleCanvasInspectClick(e.clientX, e.clientY);
      }
    }
    setIsPanning(false);
  };

  const buildEntityInfo = (entity: any, clickX: number, clickY: number) => {
    const layerObj = layers.find(l => l.name === entity.layer);
    const colorVal = entity.color ?? entity.colorNumber ?? entity.trueColor ?? layerObj?.color;
    const colorHex = getAciColor(colorVal, '#38bdf8', canvasTheme === 'light' && basemap === 'none');

    let details: Array<{ label: string; value: string }> = [];

    // Basic props
    details.push({ label: 'Obje Tipi', value: getEntityTypeLabel(entity.type) });
    details.push({ label: 'Katman (Layer)', value: entity.layer || '0 (Varsayılan)' });
    details.push({ label: 'Renk (ACI / Hex)', value: colorVal !== undefined ? `ACI ${colorVal} (${colorHex})` : 'Katmandan (ByLayer)' });

    if (entity.lineWeight || layerObj?.lineWeight) {
      const lw = entity.lineWeight || layerObj?.lineWeight;
      details.push({ label: 'Çizgi Kalınlığı', value: `${(lw / 100).toFixed(2)} mm` });
    }

    // Geometry details
    if (entity.type === 'LINE') {
      const v0 = entity.vertices ? entity.vertices[0] : entity.startPoint;
      const v1 = entity.vertices ? entity.vertices[1] : entity.endPoint;
      if (v0 && v1) {
        const len = Math.hypot(v1.x - v0.x, v1.y - v0.y, (v1.z || 0) - (v0.z || 0));
        details.push({ label: 'Başlangıç (X, Y, Z)', value: `${v0.x.toFixed(3)}, ${v0.y.toFixed(3)}, ${(v0.z || 0).toFixed(3)}` });
        details.push({ label: 'Bitiş (X, Y, Z)', value: `${v1.x.toFixed(3)}, ${v1.y.toFixed(3)}, ${(v1.z || 0).toFixed(3)}` });
        details.push({ label: 'Uzunluk', value: `${len.toFixed(3)} m` });
      }
    } else if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE' || entity.type === 'SPLINE') {
      if (entity.vertices && entity.vertices.length > 0) {
        let totalLen = 0;
        for (let i = 0; i < entity.vertices.length - 1; i++) {
          const vA = entity.vertices[i];
          const vB = entity.vertices[i + 1];
          totalLen += Math.hypot(vB.x - vA.x, vB.y - vA.y, (vB.z || 0) - (vA.z || 0));
        }
        if (entity.shape || entity.closed) {
          const vA = entity.vertices[entity.vertices.length - 1];
          const vB = entity.vertices[0];
          totalLen += Math.hypot(vB.x - vA.x, vB.y - vA.y, (vB.z || 0) - (vA.z || 0));
        }
        details.push({ label: 'Köşe (Nokta) Sayısı', value: `${entity.vertices.length} adet` });
        details.push({ label: 'Kapalı Geometri (Poligon)', value: (entity.shape || entity.closed) ? 'Evet' : 'Hayır' });
        details.push({ label: 'Toplam Uzunluk', value: `${totalLen.toFixed(3)} m` });
      }
    } else if (entity.type === 'POINT') {
      const pt = entity.position || (entity.vertices && entity.vertices[0]);
      if (pt) {
        details.push({ label: 'Doğu (X)', value: pt.x.toFixed(3) });
        details.push({ label: 'Kuzey (Y)', value: pt.y.toFixed(3) });
        details.push({ label: 'Kot / Yükseklik (Z)', value: `${(pt.z || 0).toFixed(3)} m` });
      }
    } else if (entity.type === 'CIRCLE') {
      if (entity.center) {
        const r = entity.radius || 0;
        const circ = 2 * Math.PI * r;
        const area = Math.PI * r * r;
        details.push({ label: 'Merkez (X, Y, Z)', value: `${entity.center.x.toFixed(3)}, ${entity.center.y.toFixed(3)}, ${(entity.center.z || 0).toFixed(3)}` });
        details.push({ label: 'Yarıçap (R)', value: `${r.toFixed(3)} m` });
        details.push({ label: 'Çevre', value: `${circ.toFixed(3)} m` });
        details.push({ label: 'Alan', value: `${area.toFixed(3)} m²` });
      }
    } else if (entity.type === 'ARC') {
      if (entity.center) {
        const r = entity.radius || 0;
        details.push({ label: 'Merkez (X, Y, Z)', value: `${entity.center.x.toFixed(3)}, ${entity.center.y.toFixed(3)}, ${(entity.center.z || 0).toFixed(3)}` });
        details.push({ label: 'Yarıçap (R)', value: `${r.toFixed(3)} m` });
        details.push({ label: 'Açı Aralığı', value: `${(entity.startAngle || 0).toFixed(1)}° - ${(entity.endAngle || 0).toFixed(1)}°` });
      }
    } else if (entity.type === 'TEXT' || entity.type === 'MTEXT') {
      const pt = entity.startPoint || entity.position || (entity.vertices && entity.vertices[0]);
      let cleanText = fixTurkishDxfText(
        String(entity.text || '')
          .replace(/\\P/g, ' ')
          .replace(/\\{[^}]*\}|\LW[a-zA-Z0-9]+;/g, '')
          .replace(/[\{\}]/g, '')
          .trim()
      );
      details.push({ label: 'Metin / Yazı', value: cleanText || '(Boş)' });
      details.push({ label: 'Yazı Yüksekliği', value: `${(entity.height || entity.textHeight || 0).toFixed(3)} m` });
      if (pt) {
        details.push({ label: 'Konum (X, Y, Z)', value: `${pt.x.toFixed(3)}, ${pt.y.toFixed(3)}, ${(pt.z || 0).toFixed(3)}` });
      }
    }

    if (crs !== 'NONE') {
      const crsItem = CRS_LIST.find(c => c.code === crs);
      if (crsItem?.def) {
        try {
          const [lon, lat] = proj4(crsItem.def, 'EPSG:4326', [clickX, clickY]);
          if (!isNaN(lat) && !isNaN(lon)) {
            details.push({ label: 'Coğrafi Konum (Enlem, Boylam)', value: `${lat.toFixed(6)}°, ${lon.toFixed(6)}°` });
          }
        } catch (e) {
          // ignore
        }
      }
    }

    setSelectedEntityInfo({
      typeLabel: getEntityTypeLabel(entity.type),
      layer: entity.layer,
      colorHex,
      details
    });
  };

  const handleCanvasInspectClick = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !dxfData) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    const width = rect.width;
    const height = rect.height;

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
    if (minX === Infinity) { minX = 0; minY = 0; maxX = 100; maxY = 100; }
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const fitScale = Math.min((width * 0.85) / spanX, (height * 0.85) / spanY) || 1;

    const centerX = width / 2 + pan.x;
    const centerY = height / 2 + pan.y;

    const clickWorldX = (mouseX - centerX) / (zoom * fitScale) + midX;
    const clickWorldY = -(mouseY - centerY) / (zoom * fitScale) + midY;

    const maxScreenDist = 20; // 20px threshold
    let closestEntity: any = null;
    let minDistScreen = Infinity;

    if (dxfData.entities) {
      dxfData.entities.forEach((entity: any) => {
        const layer = layers.find(l => l.name === entity.layer);
        if (layer && !layer.visible) return;

        let distWorld = Infinity;

        if (entity.type === 'LINE') {
          const v0 = entity.vertices ? entity.vertices[0] : entity.startPoint;
          const v1 = entity.vertices ? entity.vertices[1] : entity.endPoint;
          if (v0 && v1) {
            distWorld = Math.sqrt(distToSegmentSquared(clickWorldX, clickWorldY, v0.x, v0.y, v1.x, v1.y));
          }
        } else if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE' || entity.type === 'SPLINE') {
          if (entity.vertices && entity.vertices.length > 0) {
            for (let i = 0; i < entity.vertices.length - 1; i++) {
              const v0 = entity.vertices[i];
              const v1 = entity.vertices[i + 1];
              const d = Math.sqrt(distToSegmentSquared(clickWorldX, clickWorldY, v0.x, v0.y, v1.x, v1.y));
              if (d < distWorld) distWorld = d;
            }
            if (entity.shape || entity.closed) {
              const v0 = entity.vertices[entity.vertices.length - 1];
              const v1 = entity.vertices[0];
              const d = Math.sqrt(distToSegmentSquared(clickWorldX, clickWorldY, v0.x, v0.y, v1.x, v1.y));
              if (d < distWorld) distWorld = d;
            }
          }
        } else if (entity.type === 'POINT') {
          const pt = entity.position || (entity.vertices && entity.vertices[0]);
          if (pt) {
            distWorld = Math.hypot(clickWorldX - pt.x, clickWorldY - pt.y);
          }
        } else if (entity.type === 'CIRCLE') {
          if (entity.center) {
            const r = entity.radius || 0;
            const dCenter = Math.hypot(clickWorldX - entity.center.x, clickWorldY - entity.center.y);
            distWorld = Math.abs(dCenter - r);
          }
        } else if (entity.type === 'ARC') {
          if (entity.center) {
            const r = entity.radius || 0;
            const dCenter = Math.hypot(clickWorldX - entity.center.x, clickWorldY - entity.center.y);
            distWorld = Math.abs(dCenter - r);
          }
        } else if (entity.type === 'TEXT' || entity.type === 'MTEXT') {
          const pt = entity.startPoint || entity.position || (entity.vertices && entity.vertices[0]);
          if (pt) {
            distWorld = Math.hypot(clickWorldX - pt.x, clickWorldY - pt.y);
          }
        }

        const dScreen = distWorld * fitScale * zoom;
        if (dScreen <= maxScreenDist && dScreen < minDistScreen) {
          minDistScreen = dScreen;
          closestEntity = entity;
        }
      });
    }

    if (closestEntity) {
      setSelectedEntity(closestEntity);
      buildEntityInfo(closestEntity, clickWorldX, clickWorldY);
    } else {
      setSelectedEntity(null);
      setSelectedEntityInfo(null);
    }
  };

  // Touch pan & pinch zoom handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      setIsPanning(true);
      setStartPan({ x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y });
      touchStartDistRef.current = null;
    } else if (e.touches.length === 2) {
      setIsPanning(false);
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
      touchStartZoomRef.current = zoom;
      touchStartPanRef.current = { ...pan };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (isPanning && e.touches.length === 1) {
      setPan({
        x: e.touches[0].clientX - startPan.x,
        y: e.touches[0].clientY - startPan.y
      });
    } else if (e.touches.length === 2 && touchStartDistRef.current && canvasRef.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (dist > 0) {
        const rect = canvasRef.current.getBoundingClientRect();
        const touchCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const touchCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

        const zoomRatio = dist / touchStartDistRef.current;
        const newZoom = Math.max(0.05, Math.min(100, touchStartZoomRef.current * zoomRatio));
        const oldZoom = zoom;

        if (newZoom !== oldZoom && oldZoom > 0) {
          const scaleRatio = newZoom / oldZoom;
          const width = rect.width;
          const height = rect.height;

          const newPanX = (touchCenterX - width / 2) - scaleRatio * (touchCenterX - width / 2 - pan.x);
          const newPanY = (touchCenterY - height / 2) - scaleRatio * (touchCenterY - height / 2 - pan.y);

          setZoom(newZoom);
          setPan({ x: newPanX, y: newPanY });
        }
      }
    }
  };

  const handleTouchEnd = () => {
    setIsPanning(false);
    touchStartDistRef.current = null;
  };

  // Zoom towards cursor location
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = 1.15;
    const oldZoom = zoom;
    let newZoom = oldZoom;

    if (e.deltaY < 0) {
      newZoom = Math.min(oldZoom * zoomFactor, 100);
    } else {
      newZoom = Math.max(oldZoom / zoomFactor, 0.05);
    }

    if (newZoom === oldZoom) return;

    const scaleRatio = newZoom / oldZoom;
    const width = rect.width;
    const height = rect.height;

    // Keep point under cursor fixed during zoom
    const newPanX = (mouseX - width / 2) - scaleRatio * (mouseX - width / 2 - pan.x);
    const newPanY = (mouseY - height / 2) - scaleRatio * (mouseY - height / 2 - pan.y);

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  const zoomIn = () => {
    const oldZoom = zoom;
    const newZoom = Math.min(oldZoom * 1.25, 100);
    if (newZoom === oldZoom) return;
    const scaleRatio = newZoom / oldZoom;
    setPan((prev) => ({
      x: prev.x * scaleRatio,
      y: prev.y * scaleRatio,
    }));
    setZoom(newZoom);
  };

  const zoomOut = () => {
    const oldZoom = zoom;
    const newZoom = Math.max(oldZoom / 1.25, 0.05);
    if (newZoom === oldZoom) return;
    const scaleRatio = newZoom / oldZoom;
    setPan((prev) => ({
      x: prev.x * scaleRatio,
      y: prev.y * scaleRatio,
    }));
    setZoom(newZoom);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0 overflow-hidden">
      
      {/* Mobile Tab Navigation (< lg screen width) */}
      <div className="flex lg:hidden bg-slate-200 border border-slate-300 rounded-xl p-1 mb-2 shrink-0">
        <button
          onClick={() => setMobileTab('controls')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all relative ${
            mobileTab === 'controls'
              ? 'bg-cyan-700 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/50'
          }`}
        >
          <Sliders size={13} />
          <span>Dosya & Katman Paneli</span>
          {pendingFile && !isParsed && (
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse absolute top-1 right-2" />
          )}
          {isParsed && (
            <span className="text-[9px] bg-cyan-100 text-cyan-800 border border-cyan-300 px-1.5 py-0.5 rounded-full font-mono font-bold">
              {layers.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setMobileTab('map')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            mobileTab === 'map'
              ? 'bg-cyan-700 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/50'
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
                        style={{ backgroundColor: getAciColor(l.color, '#38bdf8', canvasTheme === 'light' && basemap === 'none') }}
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
          <div className="px-3 py-2 bg-slate-100 border-b border-slate-300 flex flex-wrap items-center justify-between gap-2 z-10 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-600 animate-pulse" />
              <h3 className="text-xs font-bold text-slate-900">2D CAD Görüntüleme Ekranı</h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Canvas Theme Selector (Dark / White) */}
              <div className="flex items-center bg-white border border-slate-300 rounded-lg p-0.5 shadow-sm">
                <button
                  onClick={() => setCanvasTheme('dark')}
                  className={`px-2 py-1 text-xs font-medium rounded-md flex items-center gap-1 transition-all ${
                    canvasTheme === 'dark'
                      ? 'bg-slate-900 text-cyan-400 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Koyu Tuval (Siyah Arkaplan)"
                >
                  <Moon size={12} />
                  <span>Koyu Tuval</span>
                </button>
                <button
                  onClick={() => setCanvasTheme('light')}
                  className={`px-2 py-1 text-xs font-medium rounded-md flex items-center gap-1 transition-all ${
                    canvasTheme === 'light'
                      ? 'bg-cyan-700 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Açık Tuval (Beyaz Arkaplan)"
                >
                  <Sun size={12} />
                  <span>Beyaz Tuval</span>
                </button>
              </div>

              {/* Satellite Basemap Selector */}
              <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-slate-300 shadow-sm">
                <Globe size={13} className="text-cyan-600" />
                <select
                  value={basemap}
                  onChange={(e) => setBasemap(e.target.value as any)}
                  className="bg-transparent text-xs text-slate-800 font-medium outline-none cursor-pointer"
                >
                  <option value="none" className="bg-white text-slate-900">Uydu Altlığı: Kapalı</option>
                  <option value="hybrid" className="bg-white text-slate-900">Uydu Hibrit (Google)</option>
                  <option value="satellite" className="bg-white text-slate-900">Uydu Saf (Google)</option>
                  <option value="esri" className="bg-white text-slate-900">Esri World Imagery</option>
                  <option value="street" className="bg-white text-slate-900">Sokak Haritası (OSM)</option>
                </select>
              </div>

              {/* Obje Sorgulama Button */}
              {isParsed && (
                <button
                  onClick={() => {
                    const nextMode = !isInspectMode;
                    setIsInspectMode(nextMode);
                    if (!nextMode) {
                      setSelectedEntity(null);
                      setSelectedEntityInfo(null);
                    }
                  }}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all shadow-sm border cursor-pointer ${
                    isInspectMode
                      ? 'bg-amber-500 text-slate-950 border-amber-400 animate-pulse'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                  }`}
                  title="Harita üzerindeki objelerin katman, tip ve koordinat bilgilerini sorgulayın"
                >
                  <MousePointerClick size={13} />
                  <span>Obje Sorgula</span>
                </button>
              )}

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

              <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-300 shadow-sm">
                <button
                  onClick={zoomOut}
                  disabled={!isParsed}
                  className="p-1 hover:bg-slate-100 disabled:opacity-40 text-slate-700 rounded-md transition-colors cursor-pointer"
                  title="Uzaklaş (-)"
                >
                  <ZoomOut size={13} />
                </button>
                <span className="text-[11px] font-mono text-cyan-800 font-bold px-1 min-w-[42px] text-center select-none">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={zoomIn}
                  disabled={!isParsed}
                  className="p-1 hover:bg-slate-100 disabled:opacity-40 text-slate-700 rounded-md transition-colors cursor-pointer"
                  title="Yakınlaş (+)"
                >
                  <ZoomIn size={13} />
                </button>
              </div>
              <button
                onClick={resetView}
                disabled={!isParsed}
                className="p-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 border border-slate-300 rounded-lg transition-colors cursor-pointer"
                title="Görünümü Sıfırla"
              >
                <RotateCcw size={13} />
              </button>
            </div>
          </div>

          {/* Canvas Container */}
          <div className={`flex-1 relative w-full h-full min-h-0 ${
            canvasTheme === 'light' && basemap === 'none' ? 'bg-white' : 'bg-slate-900'
          }`}>
            {/* Satellite Basemap Background Layer */}
            {isParsed && basemap !== 'none' && mapCenter && (
              <div className="absolute inset-0 z-0 opacity-90 overflow-hidden pointer-events-none">
                <MapContainer
                  center={mapCenter}
                  zoom={mapZoom}
                  zoomSnap={0}
                  zoomDelta={0.1}
                  zoomControl={false}
                  attributionControl={false}
                  dragging={false}
                  scrollWheelZoom={false}
                  doubleClickZoom={false}
                  touchZoom={false}
                  className="w-full h-full"
                >
                  <TileLayer url={BASEMAP_URLS[basemap] || BASEMAP_URLS.hybrid} maxNativeZoom={19} maxZoom={22} />
                  <LeafletCenterUpdater center={mapCenter} zoom={mapZoom} />
                </MapContainer>
              </div>
            )}

            {isParsed && basemap !== 'none' && crs === 'NONE' && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-amber-500 text-slate-950 px-3 py-1 rounded-full font-bold text-[11px] shadow-lg flex items-center gap-1.5 pointer-events-none">
                <span>💡 Uydu altlığının çiziminizle birebir eşleşmesi için sol panelden Koordinat Sistemini (CRS) seçiniz.</span>
              </div>
            )}

            {/* Obje Sorgulama Bilgi Paneli / Overlay Card */}
            {isInspectMode && (
              <div className="absolute top-3 left-3 z-30 max-w-xs w-80 bg-white/95 backdrop-blur-md border border-slate-300 rounded-2xl shadow-xl overflow-hidden text-xs">
                {/* Header */}
                <div className="bg-slate-900 text-white px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Search size={13} className="text-amber-400" />
                    <span>Obje Sorgulama</span>
                  </div>
                  <button
                    onClick={() => {
                      setIsInspectMode(false);
                      setSelectedEntity(null);
                      setSelectedEntityInfo(null);
                    }}
                    className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                    title="Kapat"
                  >
                    <X size={13} />
                  </button>
                </div>

                {/* Content */}
                <div className="p-3 space-y-2.5 max-h-80 overflow-y-auto custom-scrollbar">
                  {!selectedEntityInfo ? (
                    <div className="text-slate-600 text-[11px] leading-relaxed flex items-start gap-2 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                      <Info size={15} className="text-amber-600 shrink-0 mt-0.5" />
                      <span>Ekranda bilgilerini görmek istediğiniz bir obje (çizgi, nokta, polyline, yazı vb.) üzerine tıklayınız.</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2 rounded-xl bg-slate-100 border border-slate-200">
                        <span className="font-bold text-slate-900 text-xs">{selectedEntityInfo.typeLabel}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3.5 h-3.5 rounded-full border border-slate-400 shadow-xs shrink-0" style={{ backgroundColor: selectedEntityInfo.colorHex }} />
                          <span className="text-[10px] font-mono text-slate-700 font-bold">{selectedEntityInfo.layer}</span>
                        </div>
                      </div>

                      <div className="space-y-1.5 divide-y divide-slate-100">
                        {selectedEntityInfo.details.map((item, i) => (
                          <div key={i} className="pt-1.5 first:pt-0 flex items-start justify-between gap-2">
                            <span className="text-slate-500 font-medium text-[11px] shrink-0">{item.label}:</span>
                            <span className="text-slate-900 font-semibold text-right text-[11px] break-all font-mono">{item.value}</span>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={() => {
                          setSelectedEntity(null);
                          setSelectedEntityInfo(null);
                        }}
                        className="w-full mt-2 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-xl border border-slate-300 transition-colors cursor-pointer"
                      >
                        Sorguyu Temizle
                      </button>
                    </div>
                  )}
                </div>
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
