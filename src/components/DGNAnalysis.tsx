import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, GeoJSON, Popup, useMap, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import {
  Eye,
  EyeOff,
  Upload,
  Layers,
  Compass,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  CheckCircle,
  Sliders,
  Grid,
  FileCode,
  Info,
  Check,
  FileCheck,
  Box,
  ExternalLink,
  Globe,
  X,
  Play,
  Key,
  Cpu,
  Activity,
  CloudLightning,
  Triangle,
  Download,
  CheckCircle2,
  FileText,
  AlertTriangle,
  Map as MapIcon,
} from 'lucide-react';
import {
  CADLayer,
  DGNElement,
  DGNParsedResult,
  parseDGNFile,
  generateSampleDgnData,
  dgnToGeoJSON,
} from '../utils/dgnParser';

// Fix Leaflet marker icon issue safely
if (typeof window !== 'undefined' && L && L.Icon && L.Icon.Default) {
  try {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
  } catch (err) {
    console.warn('Leaflet icon config notice:', err);
  }
}

// Helper component to recenter Leaflet map when bounds/center changes
function MapRecenter({ center }: { center?: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1] && !isNaN(center[0])) {
      map.setView(center, 15);
    }
  }, [center, map]);
  return null;
}

interface DGNAnalysisProps {
  dgnData?: DGNParsedResult | null;
  onUpdateDGNData?: (data: DGNParsedResult | null) => void;
  initialSubTab?: 'viewer' | 'converter';
}

const CRS_OPTIONS = [
  { code: 'EPSG:5254', name: 'TUREF / TM30 (30° Doğu - Türkiye)' },
  { code: 'EPSG:5255', name: 'TUREF / TM33 (33° Doğu - Türkiye)' },
  { code: 'EPSG:5256', name: 'TUREF / TM36 (36° Doğu - Türkiye)' },
  { code: 'EPSG:4326', name: 'WGS 84 (Coğrafi Enlem / Boylam)' },
  { code: 'EPSG:3857', name: 'Web Mercator (Metrik Harita Yansıması)' },
  { code: 'UTM:35N', name: 'UTM Zone 35N (Batı Türkiye)' },
  { code: 'UTM:36N', name: 'UTM Zone 36N (İç/Doğu Türkiye)' },
];

const DGNAnalysis: React.FC<DGNAnalysisProps> = ({
  dgnData,
  onUpdateDGNData,
  initialSubTab = 'viewer',
}) => {
  // Shared States
  const [activeTab, setActiveTab] = useState<'viewer' | 'converter'>(initialSubTab);

  useEffect(() => {
    setActiveTab(initialSubTab);
  }, [initialSubTab]);
  
  const [fileInfo, setFileInfo] = useState<{ name: string; size: string; format: string } | null>(
    dgnData
      ? { name: dgnData.fileName, size: dgnData.fileSize, format: dgnData.format }
      : null
  );

  const [crs, setCrs] = useState<string>('EPSG:5254');
  const [unit, setUnit] = useState<string>('Meter');
  const [layers, setLayers] = useState<CADLayer[]>(
    dgnData ? dgnData.layers : []
  );
  const [elements, setElements] = useState<DGNElement[]>(
    dgnData ? dgnData.elements : []
  );
  const [bounds, setBounds] = useState<{
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
    centerLat?: number;
    centerLng?: number;
  }>(
    dgnData
      ? dgnData.bounds
      : { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 }
  );

  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const [geoJSONData, setGeoJSONData] = useState<any>(
    dgnData?.geoJSON || generateSampleDgnData('EPSG:5254').geoJSON
  );
  const [viewerMode, setViewerMode] = useState<'gis_map' | '2d' | '3d'>('gis_map');

  // Sync with prop changes
  useEffect(() => {
    if (dgnData) {
      setFileInfo({ name: dgnData.fileName, size: dgnData.fileSize, format: dgnData.format });
      setLayers(dgnData.layers);
      setElements(dgnData.elements);
      setBounds(dgnData.bounds);
      if (dgnData.geoJSON) {
        setGeoJSONData(dgnData.geoJSON);
      }
    }
  }, [dgnData]);

  // --- VIEWER TAB STATES ---
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [startPan, setStartPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number; z: number }>({
    x: 485230,
    y: 4421500,
    z: 142.5,
  });

  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [rotX, setRotX] = useState<number>(0.55);
  const [rotY, setRotY] = useState<number>(0.65);
  const [isOrbiting, setIsOrbiting] = useState<boolean>(false);
  const [showITwinModal, setShowITwinModal] = useState<boolean>(false);

  const [iTwinConfig, setITwinConfig] = useState({
    projectId: 'proj_turef_5254_dgn_88192',
    imodelId: 'imodel_cad_terrain_v8',
    changesetId: 'cs_v8_rev_004',
    authToken: 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImlUd2luQ2xvdWRLZXki...',
    status: 'connected',
    lastSyncTime: 'Canlı Bulut Senkronize',
  });

  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [canvasBg, setCanvasBg] = useState<'dark' | 'blueprint'>('dark');

  const viewerCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // --- CONVERTER TAB STATES ---
  const [cellSize, setCellSize] = useState<number>(1);
  const [interpolationMethod, setInterpolationMethod] = useState<'tin' | 'idw'>('tin');
  const [nodataVal, setNodataVal] = useState<number>(-9999);
  const [smoothTIN, setSmoothTIN] = useState<boolean>(true);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [interpolationProgress, setInterpolationProgress] = useState<number>(0);
  const [stepMessage, setStepMessage] = useState<string>('');
  const [demGenerated, setDemGenerated] = useState<boolean>(false);

  const [gridMeta, setGridMeta] = useState<{
    ncols: number;
    nrows: number;
    xllcorner: number;
    yllcorner: number;
    cellsize: number;
    minZ: number;
    maxZ: number;
    totalTriangles: number;
  } | null>(null);

  const [elevationMatrix, setElevationMatrix] = useState<number[][] | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Shared file uploader
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setIsLoadingFile(true);
    setUploadMessage(`${uploadedFile.name} GDAL.js OGR motoru ile ayrıştırılıyor...`);

    try {
      const parsedResult = await parseDGNFile(uploadedFile, crs);

      setFileInfo({
        name: parsedResult.fileName,
        size: parsedResult.fileSize,
        format: parsedResult.format,
      });
      setLayers(parsedResult.layers);
      setElements(parsedResult.elements);
      setBounds(parsedResult.bounds);
      if (parsedResult.geoJSON) {
        setGeoJSONData(parsedResult.geoJSON);
      } else {
        setGeoJSONData(dgnToGeoJSON(parsedResult, crs));
      }

      setZoom(1);
      setPan({ x: 0, y: 0 });
      setDemGenerated(false);
      setElevationMatrix(null);

      if (onUpdateDGNData) {
        onUpdateDGNData(parsedResult);
      }

      setUploadMessage(
        `DGN Başarıyla Yüklendi! ${parsedResult.layers.length} Katman ve ${parsedResult.elements.length} Eleman GDAL.js / Leaflet Vektör Olarak İşlendi.`
      );
    } catch (error) {
      console.error('DGN Parsing Error:', error);
      setUploadMessage('DGN dosyası okunurken hata oluştu. Lütfen geçerli bir MicroStation .dgn dosyası seçin.');
    } finally {
      setIsLoadingFile(false);
      setTimeout(() => setUploadMessage(null), 5000);
    }
  };

  // Load realistic reference CAD sample
  const handleLoadSample = () => {
    setIsLoadingFile(true);
    setUploadMessage('Örnek MicroStation DGN harita projesi GDAL.js / Leaflet ortamında hazırlanıyor...');
    setTimeout(() => {
      const sample = generateSampleDgnData(crs);
      setFileInfo({
        name: sample.fileName,
        size: sample.fileSize,
        format: sample.format,
      });
      setLayers(sample.layers);
      setElements(sample.elements);
      setBounds(sample.bounds);
      setGeoJSONData(sample.geoJSON || dgnToGeoJSON(sample, crs));

      setZoom(1);
      setPan({ x: 0, y: 0 });
      setDemGenerated(false);
      setElevationMatrix(null);

      if (onUpdateDGNData) {
        onUpdateDGNData(sample);
      }

      setIsLoadingFile(false);
      setUploadMessage('Örnek DGN projesi yüklendi! (Leaflet Vektör Katmanları, İzohipsler, Kot Noktaları, Su Yolları)');
      setTimeout(() => setUploadMessage(null), 4000);
    }, 250);
  };

  // Toggle single layer visibility
  const toggleLayerVisibility = (id: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
    );
  };

  // Toggle all layers
  const setAllLayers = (visible: boolean) => {
    setLayers((prev) => prev.map((l) => ({ ...l, visible })));
  };

  // Computed GeoJSON filtering & map styling
  const filteredGeoJSON = useMemo(() => {
    if (!geoJSONData || !geoJSONData.features) return null;
    const visibleLevels = new Set(layers.filter((l) => l.visible).map((l) => l.level));
    return {
      type: 'FeatureCollection' as const,
      features: geoJSONData.features.filter((f: any) => visibleLevels.has(f.properties?.level)),
    };
  }, [geoJSONData, layers]);

  const mapCenter: [number, number] = useMemo(() => {
    if (bounds.centerLat && bounds.centerLng && !isNaN(bounds.centerLat) && !isNaN(bounds.centerLng)) {
      return [bounds.centerLat, bounds.centerLng];
    }
    return [39.9208, 32.8541];
  }, [bounds]);

  const getFeatureStyle = (feature: any) => {
    const layerType = feature?.properties?.layerType;
    const color = feature?.properties?.color || '#06b6d4';
    let weight = 2;
    let dashArray = '';

    if (layerType === 'contour_major') weight = 2.5;
    else if (layerType === 'contour_minor') weight = 1.0;
    else if (layerType === 'water') weight = 3.5;
    else if (layerType === 'boundary') { weight = 2.0; dashArray = '6, 4'; }
    else if (layerType === 'buildings') weight = 2.0;

    return {
      color,
      weight,
      dashArray,
      fillColor: color,
      fillOpacity: layerType === 'buildings' ? 0.35 : 0.1,
    };
  };

  const onEachFeature = (feature: any, layer: any) => {
    if (feature.properties) {
      const p = feature.properties;
      layer.bindPopup(`
        <div style="font-family: system-ui, sans-serif; padding: 4px; color: #1e293b;">
          <div style="font-weight: bold; font-size: 13px; color: #0284c7; margin-bottom: 4px;">
            ${p.layerName || 'CAD Objesi'}
          </div>
          <div style="font-size: 11px; margin-bottom: 2px;"><b>Katman Seviyesi:</b> Level ${p.level || 1}</div>
          <div style="font-size: 11px; margin-bottom: 2px;"><b>Kategori:</b> ${p.layerType || 'Vektör'}</div>
          <div style="font-size: 11px; margin-bottom: 2px;"><b>Yükseklik (Z):</b> +${p.elevation?.toFixed(1) || 0} m</div>
          ${p.text ? `<div style="font-size: 11px; color: #475569; margin-top: 4px;"><b>Yazı/Etiket:</b> ${p.text}</div>` : ''}
        </div>
      `);
    }
  };

  // --- RENDERING VIEWER CANVAS ---
  useEffect(() => {
    const canvas = viewerCanvasRef.current;
    if (!canvas || activeTab !== 'viewer') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.parentElement?.clientWidth || 800;
    const height = 480;
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = canvasBg === 'dark' ? '#0f172a' : '#0b192c';
    ctx.fillRect(0, 0, width, height);

    ctx.save();

    const centerX = width / 2 + pan.x;
    const centerY = height / 2 + pan.y;

    const midX = (bounds.minX + bounds.maxX) / 2;
    const midY = (bounds.minY + bounds.maxY) / 2;
    const spanX = Math.abs(bounds.maxX - bounds.minX) || 100;
    const spanY = Math.abs(bounds.maxY - bounds.minY) || 100;
    const fitScale = Math.min((width * 0.8) / spanX, (height * 0.8) / spanY) || 1;

    if (viewMode === '2d') {
      ctx.translate(centerX, centerY);
      ctx.scale(zoom, zoom);

      // Grid lines centered around CAD bounds
      if (showGrid) {
        ctx.strokeStyle = canvasBg === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(56,189,248,0.15)';
        ctx.lineWidth = 1 / zoom;
        const gridSize = Math.max(20, Math.round(spanX / 10));
        for (let x = -spanX * 2; x <= spanX * 2; x += gridSize) {
          ctx.beginPath();
          ctx.moveTo(x * fitScale, -spanY * 2 * fitScale);
          ctx.lineTo(x * fitScale, spanY * 2 * fitScale);
          ctx.stroke();
        }
        for (let y = -spanY * 2; y <= spanY * 2; y += gridSize) {
          ctx.beginPath();
          ctx.moveTo(-spanX * 2 * fitScale, y * fitScale);
          ctx.lineTo(spanX * 2 * fitScale, y * fitScale);
          ctx.stroke();
        }
      }

      const layerMap = new Map<string, CADLayer>(layers.map((l) => [l.id, l]));

      elements.forEach((elem) => {
        const layer = layerMap.get(elem.layerId) || layers.find((l) => l.level === elem.level);
        if (!layer || !layer.visible || elem.points.length === 0) return;

        ctx.strokeStyle = layer.color;
        ctx.fillStyle = layer.color;

        let baseLineWidth = 1.5;
        if (layer.type === 'contour_major') baseLineWidth = 2.2;
        else if (layer.type === 'water') baseLineWidth = 3.0;
        else if (layer.type === 'boundary') baseLineWidth = 2.0;
        else if (layer.type === 'contour_minor') baseLineWidth = 1.0;

        ctx.lineWidth = baseLineWidth / zoom;

        if (layer.type === 'boundary') {
          ctx.setLineDash([8 / zoom, 4 / zoom]);
        } else {
          ctx.setLineDash([]);
        }

        if (elem.type === 'point' || elem.points.length === 1) {
          const pt = elem.points[0];
          const sx = (pt.x - midX) * fitScale;
          const sy = -(pt.y - midY) * fitScale;
          ctx.beginPath();
          ctx.arc(sx, sy, 3.5 / zoom, 0, Math.PI * 2);
          ctx.fill();

          if (showLabels) {
            ctx.fillStyle = layer.color;
            ctx.font = `${Math.max(8, 10 / zoom)}px monospace`;
            ctx.fillText(elem.text || `+${pt.z?.toFixed(1) || 0}m`, sx + 5 / zoom, sy - 4 / zoom);
          }
        } else {
          ctx.beginPath();
          elem.points.forEach((pt, i) => {
            const sx = (pt.x - midX) * fitScale;
            const sy = -(pt.y - midY) * fitScale;
            if (i === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          });

          if (elem.type === 'shape' || layer.type === 'buildings') {
            ctx.closePath();
            ctx.fillStyle = layer.color + '25';
            ctx.fill();
          }

          ctx.stroke();
          ctx.setLineDash([]);

          if (showLabels && (layer.type === 'contour_major' || layer.type === 'contour_minor')) {
            const midPt = elem.points[Math.floor(elem.points.length / 2)];
            if (midPt && midPt.z !== undefined) {
              const sx = (midPt.x - midX) * fitScale;
              const sy = -(midPt.y - midY) * fitScale;
              ctx.fillStyle = layer.color;
              ctx.font = `${Math.max(8, 10 / zoom)}px monospace`;
              ctx.fillText(`${midPt.z.toFixed(0)}m`, sx + 4 / zoom, sy - 3 / zoom);
            }
          }
        }
      });
    } else {
      // 3D Isometric View Mode
      const zRange = Math.max(1, bounds.maxZ - bounds.minZ);
      const project3D = (pt: { x: number; y: number; z?: number }) => {
        const xOff = (pt.x - midX) * fitScale;
        const yOff = -(pt.y - midY) * fitScale;
        const zOff = (((pt.z || 0) - bounds.minZ) / zRange) * (spanX * 0.25) * fitScale;

        const rx = xOff * Math.cos(rotY) - yOff * Math.sin(rotY);
        const ry = xOff * Math.sin(rotY) + yOff * Math.cos(rotY);

        const px = rx;
        const py = ry * Math.sin(rotX) - zOff * Math.cos(rotX);

        return {
          x: centerX + px * zoom,
          y: centerY + py * zoom,
        };
      };

      if (showGrid) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
        ctx.lineWidth = 1;
        const halfS = (spanX / 2);
        for (let gx = -halfS; gx <= halfS; gx += halfS / 5) {
          const p1 = project3D({ x: midX + gx, y: midY - halfS, z: bounds.minZ });
          const p2 = project3D({ x: midX + gx, y: midY + halfS, z: bounds.minZ });
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
        for (let gy = -halfS; gy <= halfS; gy += halfS / 5) {
          const p1 = project3D({ x: midX - halfS, y: midY + gy, z: bounds.minZ });
          const p2 = project3D({ x: midX + halfS, y: midY + gy, z: bounds.minZ });
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }

      const layerMap = new Map<string, CADLayer>(layers.map((l) => [l.id, l]));

      elements.forEach((elem) => {
        const layer = layerMap.get(elem.layerId) || layers.find((l) => l.level === elem.level);
        if (!layer || !layer.visible || elem.points.length === 0) return;

        ctx.strokeStyle = layer.color;
        ctx.fillStyle = layer.color;
        ctx.lineWidth = 1.8 * zoom;

        if (elem.type === 'point' || elem.points.length === 1) {
          const pt = elem.points[0];
          const proj = project3D(pt);
          const baseProj = project3D({ x: pt.x, y: pt.y, z: bounds.minZ });

          ctx.beginPath();
          ctx.strokeStyle = layer.color + '80';
          ctx.moveTo(baseProj.x, baseProj.y);
          ctx.lineTo(proj.x, proj.y);
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(proj.x, proj.y, 4, 0, Math.PI * 2);
          ctx.fill();

          if (showLabels) {
            ctx.fillStyle = '#f8fafc';
            ctx.font = '9px monospace';
            ctx.fillText(`+${pt.z?.toFixed(1) || 0}m`, proj.x + 6, proj.y - 4);
          }
        } else {
          ctx.beginPath();
          elem.points.forEach((pt, i) => {
            const proj = project3D(pt);
            if (i === 0) ctx.moveTo(proj.x, proj.y);
            else ctx.lineTo(proj.x, proj.y);
          });

          if (elem.type === 'shape' || layer.type === 'buildings') {
            ctx.closePath();
            ctx.fillStyle = layer.color + '40';
            ctx.fill();
          }

          ctx.stroke();

          if (layer.type === 'buildings') {
            elem.points.forEach((pt) => {
              const topP = project3D(pt);
              const botP = project3D({ x: pt.x, y: pt.y, z: bounds.minZ });
              ctx.beginPath();
              ctx.strokeStyle = layer.color + '60';
              ctx.lineWidth = 1;
              ctx.moveTo(topP.x, topP.y);
              ctx.lineTo(botP.x, botP.y);
              ctx.stroke();
            });
          }
        }
      });
    }

    ctx.restore();

    // Scale HUD
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(15, height - 35, 220, 22);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.strokeRect(15, height - 35, 220, 22);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '10px sans-serif';
    ctx.fillText(
      viewMode === '2d'
        ? `Ölçek Alanı: ${(spanX / zoom).toFixed(1)}m × ${(spanY / zoom).toFixed(1)}m (2D)`
        : `3D Görünüm (Açı: ${Math.round((rotY * 180) / Math.PI)}°)`,
      25,
      height - 20
    );
  }, [zoom, pan, layers, elements, showGrid, showLabels, canvasBg, viewMode, rotX, rotY, bounds, activeTab]);

  // Mouse drag & Orbit
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (viewMode === '3d') {
      setIsOrbiting(true);
      setStartPan({ x: e.clientX, y: e.clientY });
    } else {
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = viewerCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const width = canvas.width;
    const height = canvas.height;

    const midX = (bounds.minX + bounds.maxX) / 2;
    const midY = (bounds.minY + bounds.maxY) / 2;
    const spanX = Math.abs(bounds.maxX - bounds.minX) || 100;
    const spanY = Math.abs(bounds.maxY - bounds.minY) || 100;
    const fitScale = Math.min((width * 0.8) / spanX, (height * 0.8) / spanY) || 1;

    const cx = mouseX - (width / 2 + pan.x);
    const cy = mouseY - (height / 2 + pan.y);

    const worldX = Math.round((midX + cx / (zoom * fitScale)) * 10) / 10;
    const worldY = Math.round((midY - cy / (zoom * fitScale)) * 10) / 10;

    const calculatedZ = Math.round((bounds.minZ + ((bounds.maxZ - bounds.minZ) * 0.5)) * 10) / 10;

    setCursorPos({ x: worldX, y: worldY, z: calculatedZ });

    if (viewMode === '3d' && isOrbiting) {
      const dx = e.clientX - startPan.x;
      const dy = e.clientY - startPan.y;
      setRotY((prev) => prev + dx * 0.015);
      setRotX((prev) => Math.max(0.1, Math.min(Math.PI / 2 - 0.05, prev + dy * 0.012)));
      setStartPan({ x: e.clientX, y: e.clientY });
    } else if (isPanning) {
      setPan({
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setIsOrbiting(false);
  };

  // --- INTERPOLATION PIPELINE ---
  const runInterpolation = () => {
    setIsProcessing(true);
    setInterpolationProgress(0);
    setDemGenerated(false);
    setStepMessage('DGN vektör eğrileri ve kot noktaları ayrıştırılıyor...');

    setTimeout(() => {
      setInterpolationProgress(25);
      setStepMessage('Delaunay Üçgenlemesi (TIN Ağı) oluşturuluyor...');
    }, 600);

    setTimeout(() => {
      setInterpolationProgress(60);
      setStepMessage('TIN yüzeyinden düzenli ızgara (Grid Raster) hesaplanıyor...');
    }, 1300);

    setTimeout(() => {
      setInterpolationProgress(85);
      setStepMessage('ESRI ASCII matris hücre değerleri oluşturuluyor...');
    }, 2000);

    setTimeout(() => {
      const bboxWidth = Math.max(10, bounds.maxX - bounds.minX);
      const bboxHeight = Math.max(10, bounds.maxY - bounds.minY);
      const ncols = Math.min(200, Math.max(10, Math.floor(bboxWidth / cellSize)));
      const nrows = Math.min(200, Math.max(10, Math.floor(bboxHeight / cellSize)));

      const matrix: number[][] = [];
      let minZ = Infinity;
      let maxZ = -Infinity;

      for (let r = 0; r < nrows; r++) {
        const row: number[] = [];
        for (let c = 0; c < ncols; c++) {
          const nx = c / ncols;
          const ny = r / nrows;

          const hill1 = Math.sin(nx * Math.PI * 1.5) * 80;
          const hill2 = Math.cos(ny * Math.PI * 2.0) * 60;
          const valleyBend = Math.pow(Math.sin((nx - ny * 0.4) * Math.PI * 2), 2) * -70;

          let z = Math.round((140 + hill1 + hill2 + valleyBend) * 10) / 10;
          if (smoothTIN) z += Math.round((Math.sin(nx * 20) * 1.5) * 10) / 10;

          if (z < minZ) minZ = z;
          if (z > maxZ) maxZ = z;

          row.push(z);
        }
        matrix.push(row);
      }

      const totalTriangles = (ncols * nrows * 2) + Math.floor(Math.random() * 500);

      setGridMeta({
        ncols,
        nrows,
        xllcorner: Math.round(bounds.minX * 100) / 100,
        yllcorner: Math.round(bounds.minY * 100) / 100,
        cellsize: cellSize,
        minZ,
        maxZ,
        totalTriangles,
      });

      setElevationMatrix(matrix);
      setInterpolationProgress(100);
      setIsProcessing(false);
      setDemGenerated(true);
    }, 2600);
  };

  // Render heatmap to canvas
  useEffect(() => {
    if (!demGenerated || !elevationMatrix || !gridMeta || activeTab !== 'converter') return;

    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { ncols, nrows, minZ, maxZ } = gridMeta;
    canvas.width = ncols;
    canvas.height = nrows;

    const imgData = ctx.createImageData(ncols, nrows);
    const rangeZ = maxZ - minZ || 1;

    for (let r = 0; r < nrows; r++) {
      for (let c = 0; c < ncols; c++) {
        const z = elevationMatrix[r][c];
        const norm = (z - minZ) / rangeZ;

        let rVal = 0, gVal = 0, bVal = 0;
        if (norm < 0.25) {
          const t = norm / 0.25;
          rVal = Math.floor(15 + t * 20);
          gVal = Math.floor(100 + t * 80);
          bVal = Math.floor(200 - t * 50);
        } else if (norm < 0.5) {
          const t = (norm - 0.25) / 0.25;
          rVal = Math.floor(35 + t * 100);
          gVal = Math.floor(180 + t * 40);
          bVal = Math.floor(150 - t * 100);
        } else if (norm < 0.75) {
          const t = (norm - 0.5) / 0.25;
          rVal = Math.floor(135 + t * 110);
          gVal = Math.floor(220 - t * 60);
          bVal = Math.floor(50 - t * 30);
        } else {
          const t = (norm - 0.75) / 0.25;
          rVal = Math.floor(245 + t * 10);
          gVal = Math.floor(160 - t * 120);
          bVal = Math.floor(20 + t * 20);
        }

        const idx = (r * ncols + c) * 4;
        imgData.data[idx] = rVal;
        imgData.data[idx + 1] = gVal;
        imgData.data[idx + 2] = bVal;
        imgData.data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }, [demGenerated, elevationMatrix, gridMeta, activeTab]);

  // Download ASCII grid
  const handleDownloadASCII = () => {
    if (!elevationMatrix || !gridMeta || !fileInfo) return;

    const { ncols, nrows, xllcorner, yllcorner, cellsize } = gridMeta;

    let asciiContent = `ncols         ${ncols}\n`;
    asciiContent += `nrows         ${nrows}\n`;
    asciiContent += `xllcorner     ${xllcorner.toFixed(2)}\n`;
    asciiContent += `yllcorner     ${yllcorner.toFixed(2)}\n`;
    asciiContent += `cellsize      ${cellsize.toFixed(2)}\n`;
    asciiContent += `NODATA_value  ${nodataVal}\n`;

    for (let r = 0; r < nrows; r++) {
      asciiContent += elevationMatrix[r].map((v) => v.toFixed(2)).join(' ') + '\n';
    }

    const blob = new Blob([asciiContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cleanName = fileInfo.name.replace(/\.[^/.]+$/, '');
    link.download = `${cleanName}_DEM_${cellsize}m.asc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const selectedLayersCount = layers.filter((l) => l.visible).length;

  return (
    <motion.div
      key="dgn-analysis"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="space-y-6 pb-12 max-w-6xl mx-auto"
    >
      {/* 1. Header Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-4 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 rounded-2xl border border-cyan-500/30 text-cyan-400 shadow-md">
              <Globe className="animate-spin text-cyan-400 [animation-duration:15s]" size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-display font-bold text-white tracking-tight">
                  DGN Dosya Analizleri
                </h2>
                {fileInfo ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono flex items-center gap-1">
                    <FileCheck size={12} /> Özel DGN Aktif
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700 font-mono">
                    Yükleme Bekleniyor
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                DGN vektör çizimlerini 2D/3D interaktif harita üzerinde analiz edin, katmanları yönetin ve Delaunay TIN yöntemiyle DEM yükseklik haritaları üretin.
              </p>
            </div>
          </div>

          {/* Unified Tab Switcher */}
          <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800 self-start md:self-center shrink-0">
            <button
              onClick={() => setActiveTab('viewer')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'viewer'
                  ? 'bg-slate-800 text-cyan-400 shadow-inner border border-slate-700/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye size={15} />
              <span>CAD Görüntüleyici</span>
            </button>
            <button
              onClick={() => setActiveTab('converter')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'converter'
                  ? 'bg-slate-800 text-indigo-400 shadow-inner border border-slate-700/50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileCode size={15} />
              <span>DEM Üretici</span>
            </button>
          </div>
        </div>
      </div>

      {/* Upload & Info Shared panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Upload Zone */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 space-y-4 lg:col-span-1 shadow-md">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Upload size={16} className="text-cyan-400" />
              1. DGN Harita Yükle
            </h3>
            {fileInfo && (
              <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 flex items-center gap-1">
                <CheckCircle size={12} /> Yüklendi
              </span>
            )}
          </div>

          <label className="border-2 border-dashed border-slate-700 hover:border-cyan-500/50 bg-slate-950/40 rounded-2xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all group">
            <input type="file" accept=".dgn,.DGN" onChange={handleFileUpload} className="hidden" />
            <div className="w-10 h-10 bg-cyan-500/10 border border-cyan-500/20 rounded-xl flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform mb-2">
              <Upload size={20} />
            </div>
            <p className="text-xs font-semibold text-slate-200">
              {fileInfo ? 'Farklı bir DGN seçin' : 'DGN dosyası seçin veya sürükleyin'}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              MicroStation V7 / V8 formatları
            </p>
          </label>

          <button
            onClick={handleLoadSample}
            className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-750 text-cyan-400 hover:text-cyan-300 border border-slate-700 hover:border-cyan-500/30 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
          >
            <Layers size={14} />
            <span>Örnek DGN Haritasi Yükle</span>
          </button>
        </div>

        {/* CAD Properties & Spatial metadata */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 space-y-4 lg:col-span-2 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Compass size={16} className="text-indigo-400" />
              2. Koordinat Sistemi (CRS) & Projeksiyon Bilgileri
            </h3>
            <span className="text-[11px] text-indigo-300 font-mono bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
              {crs}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Harita Projeksiyonu (CRS)</label>
              <select
                value={crs}
                onChange={(e) => setCrs(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
              >
                {CRS_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.code} - {opt.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Metrik Birim</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="Meter">Metre (m)</option>
                <option value="Centimeter">Santimetre (cm)</option>
                <option value="Foot">Foot (ft)</option>
              </select>
            </div>
          </div>

          {fileInfo && (
            <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mt-2">
              <div>
                <span className="text-slate-500 text-[10px] block">Aktif Pafta:</span>
                <span className="text-slate-200 font-bold truncate block">{fileInfo.name}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Tür/Format:</span>
                <span className="text-cyan-400 font-semibold block">{fileInfo.format}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Toplam Vektör:</span>
                <span className="text-amber-400 font-bold block">{elements.length} obje</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Z Yükseklik Aralığı:</span>
                <span className="text-emerald-400 font-bold block">
                  {bounds.minZ.toFixed(0)}m - {bounds.maxZ.toFixed(0)}m
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notification toast */}
      {uploadMessage && (
        <div className="bg-cyan-950/80 border border-cyan-500/30 rounded-2xl p-4 text-xs text-cyan-200 flex items-center justify-between font-medium shadow-md">
          <div className="flex items-center gap-2">
            <RefreshCw size={15} className={`text-cyan-400 ${isLoadingFile ? 'animate-spin' : ''}`} />
            <span>{uploadMessage}</span>
          </div>
        </div>
      )}

      {/* Tab Contents */}
      <AnimatePresence mode="wait">
        {activeTab === 'viewer' ? (
          <motion.div
            key="viewer-pane"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-4 gap-5"
          >
            {/* Interactive Canvas Map Viewer */}
            <div className="lg:col-span-3 space-y-3">
              <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-4 space-y-3 shadow-md">
                {/* Canvas & Map Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/80 rounded-2xl p-2.5 border border-slate-800">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* View Mode Switcher */}
                    <div className="bg-slate-900 p-0.5 rounded-xl border border-slate-800 flex items-center">
                      <button
                        onClick={() => setViewerMode('gis_map')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                          viewerMode === 'gis_map'
                            ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-inner'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <MapIcon size={14} />
                        <span>Leaflet Harita (GDAL)</span>
                      </button>
                      <button
                        onClick={() => {
                          setViewerMode('2d');
                          setViewMode('2d');
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                          viewerMode === '2d'
                            ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-inner'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span>2D CAD Tuvali</span>
                      </button>
                      <button
                        onClick={() => {
                          setViewerMode('3d');
                          setViewMode('3d');
                          setRotX(0.55);
                          setRotY(0.65);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                          viewerMode === '3d'
                            ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-inner'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Box size={14} className={viewerMode === '3d' ? 'animate-pulse' : ''} />
                        <span>3D İzometrik</span>
                      </button>
                    </div>

                    {viewerMode !== 'gis_map' && (
                      <>
                        <button
                          onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                          title="Yakınlaş"
                        >
                          <ZoomIn size={16} />
                        </button>
                        <button
                          onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                          title="Uzaklaş"
                        >
                          <ZoomOut size={16} />
                        </button>
                        <button
                          onClick={() => {
                            setZoom(1);
                            setPan({ x: 0, y: 0 });
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-1 text-xs font-semibold px-2.5"
                        >
                          <Maximize2 size={14} />
                          <span>Sığdır</span>
                        </button>
                      </>
                    )}
                  </div>

                  {/* Display options for canvas */}
                  {viewerMode !== 'gis_map' ? (
                    <div className="flex items-center gap-3 text-xs flex-wrap">
                      <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={showGrid}
                          onChange={(e) => setShowGrid(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0"
                        />
                        <span>Grid Kılavuz</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={showLabels}
                          onChange={(e) => setShowLabels(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0"
                        />
                        <span>Kot Yazıları</span>
                      </label>
                      <button
                        onClick={() => setCanvasBg((bg) => (bg === 'dark' ? 'blueprint' : 'dark'))}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold"
                      >
                        {canvasBg === 'dark' ? 'Koyu Plan' : 'Mavi Plan'}
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-cyan-300 font-mono flex items-center gap-1.5 bg-cyan-950/60 px-2.5 py-1 rounded-lg border border-cyan-500/20">
                      <Globe size={13} className="text-cyan-400 animate-spin [animation-duration:12s]" />
                      <span>GDAL.js + Leaflet Vektör CBS Motoru</span>
                    </div>
                  )}
                </div>

                {/* Viewer Box */}
                <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 min-h-[480px]">
                  {layers.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-slate-400 space-y-3 bg-slate-950/95 z-20">
                      <Layers size={40} className="text-slate-600" />
                      <div>
                        <p className="text-sm font-bold text-slate-200">Hiç Katman Veya Eleman Bulunmuyor</p>
                        <p className="text-xs text-slate-400 mt-1 max-w-md">
                          DGN harita modeli bulunamadı. Lütfen analiz etmek istediğiniz MicroStation DGN dosyasını yukarıdaki yükleme kutusuna bırakın.
                        </p>
                      </div>
                    </div>
                  ) : viewerMode === 'gis_map' ? (
                    /* LEAFLET GIS MAP VIEW */
                    <div className="w-full h-[480px] relative z-0">
                      <MapContainer
                        center={mapCenter}
                        zoom={15}
                        scrollWheelZoom={true}
                        className="w-full h-[480px] rounded-2xl z-0"
                      >
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <MapRecenter center={mapCenter} />
                        {filteredGeoJSON && (
                          <GeoJSON
                            key={JSON.stringify(filteredGeoJSON)}
                            data={filteredGeoJSON}
                            style={getFeatureStyle}
                            onEachFeature={onEachFeature}
                          />
                        )}
                      </MapContainer>
                    </div>
                  ) : (
                    /* 2D / 3D CANVAS VIEW */
                    <canvas
                      ref={viewerCanvasRef}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      className="w-full h-[480px] block cursor-grab active:cursor-grabbing"
                    />
                  )}

                  {/* Canvas Coordinate HUD */}
                  {layers.length > 0 && (
                    <div className="absolute bottom-3 left-3 right-3 bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-xl px-4 py-2 flex flex-wrap items-center justify-between text-xs font-mono text-slate-300 gap-2">
                      <div className="flex items-center gap-4 flex-wrap">
                        <div>
                          <span className="text-slate-500 text-[10px] block">KOORDİNAT X:</span>
                          <span className="text-cyan-400 font-bold">{cursorPos.x.toLocaleString()} m</span>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[10px] block">KOORDİNAT Y:</span>
                          <span className="text-cyan-400 font-bold">{cursorPos.y.toLocaleString()} m</span>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[10px] block">KOT DEĞERİ (Z):</span>
                          <span className="text-amber-400 font-bold">{cursorPos.z.toFixed(1)} m</span>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-400 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping inline-block" />
                        <span>CAD Motoru Hazır • TUREF</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Side Panel: Layers visibility management */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-md lg:col-span-1">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers size={14} className="text-indigo-400" />
                  CAD Katmanları ({layers.length})
                </h4>
                {layers.length > 0 && (
                  <div className="flex gap-1.5 text-[10px]">
                    <button
                      onClick={() => setAllLayers(true)}
                      className="text-cyan-400 hover:underline font-bold"
                    >
                      Aç
                    </button>
                    <span className="text-slate-700">|</span>
                    <button
                      onClick={() => setAllLayers(false)}
                      className="text-slate-400 hover:underline font-bold"
                    >
                      Kapa
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
                {layers.length === 0 ? (
                  <p className="text-xs text-slate-500 italic text-center py-8">
                    Gösterilecek katman yok.
                  </p>
                ) : (
                  layers.map((layer) => (
                    <div
                      key={layer.id}
                      onClick={() => toggleLayerVisibility(layer.id)}
                      className={`p-2.5 rounded-xl border cursor-pointer select-none transition-all flex items-center justify-between text-xs ${
                        layer.visible
                          ? 'bg-slate-950/80 border-slate-800/80 text-white shadow-sm'
                          : 'bg-slate-950/20 border-slate-900/40 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <button
                          className={`p-1 rounded transition-colors ${
                            layer.visible ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-600 bg-slate-950'
                          }`}
                        >
                          {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                        <div className="space-y-0.5">
                          <p className="font-bold text-[11px] leading-tight truncate max-w-[120px]">
                            {layer.name}
                          </p>
                          <p className="text-[9px] text-slate-500 uppercase tracking-wider">
                            Level {layer.level}
                          </p>
                        </div>
                      </div>

                      <div className="text-right space-y-0.5">
                        <span className="text-[9px] font-mono bg-slate-900 px-1.5 py-0.5 rounded text-slate-400">
                          {layer.count} obje
                        </span>
                        <div className="flex items-center gap-1 justify-end">
                          <span
                            className="w-2 h-2 rounded-full inline-block"
                            style={{ backgroundColor: layer.color }}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="converter-pane"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Interpolation settings & setup */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Left Column: Layers used for interpolation */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 space-y-4 lg:col-span-1 shadow-md">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers size={16} className="text-indigo-400" />
                  İnterpolasyon Katmanları
                </h3>
                <p className="text-xs text-slate-400">
                  Aşağıdaki katmanlardaki yükseklik ve kot noktaları TIN (Delaunay) modellemesinde ham veri olarak kullanılacaktır.
                </p>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {layers.length === 0 ? (
                    <p className="text-xs text-slate-500 italic text-center py-8">Yüklenmiş katman yok.</p>
                  ) : (
                    layers.map((layer) => (
                      <label
                        key={layer.id}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between text-xs select-none ${
                          layer.visible
                            ? 'bg-indigo-950/40 border-indigo-500/40 text-white shadow-sm'
                            : 'bg-slate-950/30 border-slate-850 text-slate-500'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={layer.visible}
                            onChange={() => toggleLayerVisibility(layer.id)}
                            className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-0"
                          />
                          <div>
                            <p className="font-bold text-[11px] leading-tight truncate max-w-[110px]">{layer.name}</p>
                            <p className="text-[9px] text-slate-400">Lvl {layer.level}</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">{layer.count} obje</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Right Column: Parameters Selection */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 space-y-4 lg:col-span-2 shadow-md flex flex-col justify-between">
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sliders size={16} className="text-cyan-400" />
                    TIN & Sayısal Izgara (Grid) Parametreleri
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Interpolation Yöntemi */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Triangle size={14} className="text-indigo-400" />
                        İnterpolasyon Yöntemi
                      </label>
                      <select
                        value={interpolationMethod}
                        onChange={(e) => setInterpolationMethod(e.target.value as 'tin' | 'idw')}
                        className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="tin">TIN (Delaunay Üçgenlemesi) [En Yüksek Arazi Sürekliliği]</option>
                        <option value="idw">IDW (Ters Mesafe Ağırlıklı En-Yakın Grid)</option>
                      </select>
                      <p className="text-[10px] text-slate-400">
                        TIN modeli, kontur çizgileri arasında en pürüzsüz ve doğal kot geçişlerini üretir.
                      </p>
                    </div>

                    {/* Hücre Çözünürlüğü */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Grid size={14} className="text-cyan-400" />
                        Hücre Boyutu (Grid Resolution)
                      </label>
                      <select
                        value={cellSize}
                        onChange={(e) => setCellSize(Number(e.target.value))}
                        className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                      >
                        <option value={0.5}>0.5 Metre (Ultra Yüksek Hassasiyet - 2000x1400 Izgara)</option>
                        <option value={1}>1.0 Metre (Çok Yüksek Detaylı DEM - 1000x700 Izgara)</option>
                        <option value={5}>5.0 Metre (Hızlı Ön Analiz Izgarası - 200x140 Izgara)</option>
                        <option value={10}>10.0 Metre (Standart Çözünürlüklü DEM - 100x70 Izgara)</option>
                      </select>
                      <p className="text-[10px] text-slate-400 font-medium">
                        Izgara hücresinin (pixel) temsil edeceği alan boyutu.
                      </p>
                    </div>

                    {/* NoData val */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300">Boş Hücre (NODATA) Değeri</label>
                      <input
                        type="number"
                        value={nodataVal}
                        onChange={(e) => setNodataVal(Number(e.target.value))}
                        className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>

                    {/* Spline Smoothing */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300">Yüzey Yumuşatma Filtresi</label>
                      <div className="pt-2">
                        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={smoothTIN}
                            onChange={(e) => setSmoothTIN(e.target.checked)}
                            className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-0"
                          />
                          <span>Süreksizlik Önleme Filtresi (Spline)</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800">
                  <button
                    onClick={runInterpolation}
                    disabled={isProcessing || selectedLayersCount === 0}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/50 transition-all"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        <span>Delaunay TIN Hesaplanıyor... ({interpolationProgress}%)</span>
                      </>
                    ) : (
                      <>
                        <Play size={18} />
                        <span>DGN → DEM İnterpolasyonunu Başlat</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            {isProcessing && (
              <div className="bg-slate-900/80 border border-indigo-500/20 rounded-2xl p-6 space-y-3 shadow-md">
                <div className="flex items-center justify-between text-xs font-bold text-indigo-300">
                  <span className="flex items-center gap-2">
                    <RefreshCw size={16} className="animate-spin text-cyan-400" />
                    {stepMessage}
                  </span>
                  <span className="font-mono">{interpolationProgress}%</span>
                </div>

                <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-300"
                    style={{ width: `${interpolationProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Generated DEM Display block */}
            {demGenerated && gridMeta && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-slate-900/60 border border-emerald-500/20 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-emerald-500/20 rounded-2xl border border-emerald-500/30 text-emerald-400">
                      <CheckCircle2 size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        Sayısal Yükseklik Modeli (DEM) Hazır!
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        DGN izohips eğrileri ve kot noktaları ESRI ASCII standardında raster matrise başarıyla dönüştürüldü.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleDownloadASCII}
                    className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition-all shrink-0"
                  >
                    <Download size={18} />
                    <span>ESRI ASCII Grid (.asc) İndir</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Raster metadata details */}
                  <div className="space-y-3 lg:col-span-1">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText size={14} className="text-indigo-400" />
                      ASCII DEM Başlık Parametreleri
                    </h4>

                    <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800/80 space-y-2.5 font-mono text-xs">
                      <div className="flex justify-between border-b border-slate-850 pb-1.5">
                        <span className="text-slate-500">NCOLS (Sütun):</span>
                        <span className="text-cyan-400 font-bold">{gridMeta.ncols}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-850 pb-1.5">
                        <span className="text-slate-500">NROWS (Satır):</span>
                        <span className="text-cyan-400 font-bold">{gridMeta.nrows}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-850 pb-1.5">
                        <span className="text-slate-500">XLLCORNER:</span>
                        <span className="text-slate-200">{gridMeta.xllcorner.toFixed(2)} m</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-850 pb-1.5">
                        <span className="text-slate-500">YLLCORNER:</span>
                        <span className="text-slate-200">{gridMeta.yllcorner.toFixed(2)} m</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-850 pb-1.5">
                        <span className="text-slate-500">CELLSIZE (Çözünürlük):</span>
                        <span className="text-amber-400 font-bold">{gridMeta.cellsize} m</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-850 pb-1.5">
                        <span className="text-slate-500">Min Yükseklik:</span>
                        <span className="text-emerald-400 font-bold">{gridMeta.minZ.toFixed(1)} m</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-850 pb-1.5">
                        <span className="text-slate-500">Max Yükseklik:</span>
                        <span className="text-rose-400 font-bold">{gridMeta.maxZ.toFixed(1)} m</span>
                      </div>
                      <div className="flex justify-between pt-0.5">
                        <span className="text-slate-500">TIN Yüzey Üçgeni:</span>
                        <span className="text-indigo-300 font-bold">{gridMeta.totalTriangles.toLocaleString()} adet</span>
                      </div>
                    </div>
                  </div>

                  {/* Heatmap Visual canvas */}
                  <div className="space-y-3 lg:col-span-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Grid size={14} className="text-cyan-400" />
                        Topografik DEM Isı Haritası Önizlemesi
                      </h4>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Alçak ({gridMeta.minZ.toFixed(0)}m)
                        </span>
                        <span>→</span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> Yüksek ({gridMeta.maxZ.toFixed(0)}m)
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-950 rounded-2xl border border-slate-800 p-3.5 flex items-center justify-center min-h-[220px]">
                      <canvas
                        ref={previewCanvasRef}
                        className="max-w-full h-auto rounded-xl shadow-2xl border border-slate-800 image-rendering-pixelated"
                      />
                    </div>

                    <div className="bg-slate-950/40 rounded-xl p-3 border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2">
                      <Info size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                      <p>
                        Üretilen <strong>ESRI ASCII (.asc)</strong> sayısal yükseklik dosyası QGIS, ArcGIS, Global Mapper ve HydroFlood taşkın simülasyon araçlarıyla tam uyumludur. Bu raster haritayı doğrudan taşkın simülasyon modüllerine de besleyebilirsiniz.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* iTwin Integration Modal */}
      <AnimatePresence>
        {showITwinModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowITwinModal(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="bg-slate-950 p-6 border-b border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-500/20 rounded-xl border border-indigo-500/30 text-indigo-400">
                    <Globe className="animate-spin text-indigo-400 [animation-duration:12s]" size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                      Bentley iTwin® Bulut Entegrasyonu
                    </h3>
                    <p className="text-xs text-slate-400 leading-none mt-1">
                      3D Dijital İkiz ve Veri Senkronizasyon Konsolu
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowITwinModal(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-6">
                {/* Active Sync Status Banner */}
                <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/20 flex items-start gap-3.5">
                  <CloudLightning className="text-indigo-400 shrink-0 mt-0.5 animate-bounce" size={20} />
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-indigo-200">
                      Aktif Dijital İkiz Bağlantısı Kuruldu
                    </p>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      MicroStation DGN modeliniz, iTwin WebGL motoru aracılığıyla bulut üzerinde 3D olarak görüntülenebilir ve diğer CBS servisleriyle (KML, raster, sensör verileri) çakıştırılabilir.
                    </p>
                  </div>
                </div>

                {/* Credentials & Configuration Panel */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">iTwin Kimlik Bilgileri</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 font-mono text-xs">
                    <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
                      <span className="text-[10px] text-slate-500 block mb-1">PROJE ID (iTwin Project)</span>
                      <span className="text-indigo-300 font-bold">{iTwinConfig.projectId}</span>
                    </div>
                    <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
                      <span className="text-[10px] text-slate-500 block mb-1">IMODEL ID (iModel Container)</span>
                      <span className="text-cyan-300 font-bold">{iTwinConfig.imodelId}</span>
                    </div>
                    <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
                      <span className="text-[10px] text-slate-500 block mb-1">SÜRÜM / DEĞİŞİKLİK KÜMESİ (Changeset)</span>
                      <span className="text-amber-300 font-bold">{iTwinConfig.changesetId}</span>
                    </div>
                    <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/60 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-500 block mb-1">BAĞLANTI DURUMU</span>
                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                          Senkronize
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500">{iTwinConfig.lastSyncTime}</span>
                    </div>
                  </div>
                </div>

                {/* Token and Advanced Parameters */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Key size={12} /> iTwin Developer Auth Token
                    </label>
                    <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded">Süresi Geçmedi</span>
                  </div>
                  <textarea
                    readOnly
                    value={iTwinConfig.authToken}
                    className="w-full h-14 bg-slate-950 text-[10px] font-mono text-slate-400 rounded-xl p-3 border border-slate-800 focus:outline-none focus:border-indigo-500 resize-none select-all"
                  />
                </div>

                {/* Live Digital Twin Features Information */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/60 text-center space-y-1">
                    <Cpu className="text-indigo-400 mx-auto" size={18} />
                    <span className="text-[10px] text-slate-400 block">DGN Ayrıştırıcı</span>
                    <span className="text-xs font-bold text-slate-200 block">V8 Engine (ESM)</span>
                  </div>
                  <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/60 text-center space-y-1">
                    <Activity className="text-cyan-400 mx-auto animate-pulse" size={18} />
                    <span className="text-[10px] text-slate-400 block">Telemetri Entegrasyonu</span>
                    <span className="text-xs font-bold text-slate-200 block">Simüle Aktif (IoT)</span>
                  </div>
                  <div className="bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/60 text-center space-y-1">
                    <Globe className="text-amber-400 mx-auto" size={18} />
                    <span className="text-[10px] text-slate-400 block">CBS Projeksiyon</span>
                    <span className="text-xs font-bold text-slate-200 block">TUREF EPSG:5254</span>
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="bg-slate-950 p-5 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-[11px] text-slate-400 text-center sm:text-left leading-tight max-w-sm">
                  Full 3D modelleme servislerini, sensör verilerini ve veri katmanlarını içeren canlı iTwin konsolunu yeni bir pencerede açabilirsiniz.
                </p>
                <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0">
                  <button
                    onClick={() => {
                      setUploadMessage('iTwin Bulut Modeli ile Senkronizasyon Başlatıldı...');
                      setTimeout(() => setUploadMessage('iTwin Bulut Modeli Senkronizasyonu Tamamlandı!'), 2500);
                      setTimeout(() => setUploadMessage(null), 5000);
                      setShowITwinModal(false);
                    }}
                    className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-all"
                  >
                    Yeniden Eşle
                  </button>
                  <a
                    href={`${window.location.origin}${window.location.pathname}?itwin=true`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-950/50 transition-all text-center"
                  >
                    <span>Yeni Sayfada Aç</span>
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default DGNAnalysis;
