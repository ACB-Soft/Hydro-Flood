import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Eye,
  EyeOff,
  Upload,
  Layers,
  Compass,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Move,
  RefreshCw,
  CheckCircle,
  Sliders,
  ArrowRight,
  Grid,
  FileCode,
  Info,
  Check,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

interface DGNViewerProps {
  onNavigateToConverter?: () => void;
}

export interface CADLayer {
  id: string;
  level: number;
  name: string;
  color: string;
  type: 'contour_major' | 'contour_minor' | 'elevation_points' | 'water' | 'buildings' | 'boundary';
  visible: boolean;
  count: number;
  minZ: number;
  maxZ: number;
}

const SAMPLE_LAYERS: CADLayer[] = [
  { id: '1', level: 1, name: 'Ana İzohips Eğrileri (10m)', color: '#06b6d4', type: 'contour_major', visible: true, count: 128, minZ: 100, maxZ: 380 },
  { id: '2', level: 2, name: 'Ara İzohips Eğrileri (2m)', color: '#38bdf8', type: 'contour_minor', visible: true, count: 342, minZ: 102, maxZ: 378 },
  { id: '3', level: 3, name: 'Kot & Nirengi Noktaları (Z)', color: '#f59e0b', type: 'elevation_points', visible: true, count: 96, minZ: 98, maxZ: 385 },
  { id: '4', level: 4, name: 'Dere Yatakları & Su Yolları', color: '#10b981', type: 'water', visible: true, count: 18, minZ: 98, maxZ: 210 },
  { id: '5', level: 5, name: 'Yapılar & Yerleşim Sınırları', color: '#f43f5e', type: 'buildings', visible: true, count: 45, minZ: 110, maxZ: 160 },
  { id: '6', level: 6, name: 'Çalışma Sahası Sınırı (KML/CAD)', color: '#a855f7', type: 'boundary', visible: true, count: 1, minZ: 0, maxZ: 0 },
];

const CRS_OPTIONS = [
  { code: 'EPSG:5254', name: 'TUREF / TM30 (30° Doğu - Türkiye)' },
  { code: 'EPSG:5255', name: 'TUREF / TM33 (33° Doğu - Türkiye)' },
  { code: 'EPSG:5256', name: 'TUREF / TM36 (36° Doğu - Türkiye)' },
  { code: 'EPSG:4326', name: 'WGS 84 (Coğrafi Enlem / Boylam)' },
  { code: 'EPSG:3857', name: 'Web Mercator (Metrik Harita Yansıması)' },
  { code: 'UTM:35N', name: 'UTM Zone 35N (Batı Türkiye)' },
  { code: 'UTM:36N', name: 'UTM Zone 36N (İç/Doğu Türkiye)' },
];

const DGNViewer: React.FC<DGNViewerProps> = ({ onNavigateToConverter }) => {
  // State management
  const [file, setFile] = useState<{ name: string; size: string; format: string } | null>({
    name: 'Akarsu_Vadisi_Saha_Modeli.dgn',
    size: '4.8 MB',
    format: 'MicroStation V8 DGN',
  });
  const [crs, setCrs] = useState<string>('EPSG:5254');
  const [unit, setUnit] = useState<string>('Meter');
  const [layers, setLayers] = useState<CADLayer[]>(SAMPLE_LAYERS);
  
  // Canvas Viewport State
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [startPan, setStartPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number; z: number }>({ x: 485230, y: 4421500, z: 142.5 });
  
  // Canvas settings
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [canvasBg, setCanvasBg] = useState<'dark' | 'blueprint'>('dark');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Render CAD geometries on HTML5 canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI
    const width = canvas.parentElement?.clientWidth || 800;
    const height = 480;
    canvas.width = width;
    canvas.height = height;

    // Background fill
    ctx.fillStyle = canvasBg === 'dark' ? '#0f172a' : '#0b192c';
    ctx.fillRect(0, 0, width, height);

    ctx.save();

    // Center origin
    const centerX = width / 2 + pan.x;
    const centerY = height / 2 + pan.y;
    ctx.translate(centerX, centerY);
    ctx.scale(zoom, zoom);

    // Grid lines
    if (showGrid) {
      ctx.strokeStyle = canvasBg === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(56,189,248,0.1)';
      ctx.lineWidth = 1 / zoom;
      const gridSize = 40;
      for (let x = -600; x <= 600; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, -400);
        ctx.lineTo(x, 400);
        ctx.stroke();
      }
      for (let y = -400; y <= 400; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(-600, y);
        ctx.lineTo(600, y);
        ctx.stroke();
      }
    }

    const layerMap = new Map<string, CADLayer>(layers.map((l) => [l.id, l]));

    // 1. Render Contour Lines (İzohips)
    const renderContours = (isMajor: boolean) => {
      const layerId = isMajor ? '1' : '2';
      const l = layerMap.get(layerId);
      if (!l || !l.visible) return;

      ctx.strokeStyle = l.color;
      ctx.lineWidth = (isMajor ? 2 : 1) / zoom;

      const numCurves = isMajor ? 6 : 18;
      for (let i = 0; i < numCurves; i++) {
        const radius = 60 + i * (isMajor ? 35 : 12);
        const zVal = 100 + i * (isMajor ? 20 : 5);

        ctx.beginPath();
        for (let angle = 0; angle <= Math.PI * 2; angle += 0.1) {
          // Perturb radius slightly to simulate natural terrain contours
          const noise = Math.sin(angle * 3) * 15 + Math.cos(angle * 5) * 8;
          const r = radius + noise;
          const px = Math.cos(angle) * r;
          const py = Math.sin(angle) * r * 0.7; // slight elliptical perspective
          if (angle === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();

        // Render Z elevation text labels along contour
        if (showLabels && (isMajor || i % 2 === 0)) {
          ctx.fillStyle = l.color;
          ctx.font = `${Math.max(9, 11 / zoom)}px monospace`;
          ctx.fillText(`${zVal}m`, Math.cos(0.8) * (radius + 10), Math.sin(0.8) * (radius + 10) * 0.7);
        }
      }
    };

    renderContours(false); // Minor contours
    renderContours(true);  // Major contours

    // 2. Waterways / Rivers (Level 4)
    const waterLayer = layerMap.get('4');
    if (waterLayer && waterLayer.visible) {
      ctx.strokeStyle = waterLayer.color;
      ctx.lineWidth = 3 / zoom;
      ctx.beginPath();
      ctx.moveTo(-280, -220);
      ctx.bezierCurveTo(-100, -100, -50, 50, 220, 260);
      ctx.stroke();

      if (showLabels) {
        ctx.fillStyle = waterLayer.color;
        ctx.font = `${Math.max(9, 11 / zoom)}px sans-serif`;
        ctx.fillText('Dere Yatağı (Akarsu)', -80, -70);
      }
    }

    // 3. Buildings & Structures (Level 5)
    const bldgLayer = layerMap.get('5');
    if (bldgLayer && bldgLayer.visible) {
      ctx.fillStyle = 'rgba(244, 63, 94, 0.2)';
      ctx.strokeStyle = bldgLayer.color;
      ctx.lineWidth = 1.5 / zoom;

      const buildings = [
        { x: -140, y: 80, w: 30, h: 20 },
        { x: -100, y: 110, w: 25, h: 25 },
        { x: 120, y: -90, w: 40, h: 25 },
        { x: 150, y: -120, w: 20, h: 20 },
      ];

      buildings.forEach((b) => {
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
      });
    }

    // 4. Elevation & Survey Points (Level 3)
    const ptsLayer = layerMap.get('3');
    if (ptsLayer && ptsLayer.visible) {
      ctx.fillStyle = ptsLayer.color;
      const pts = [
        { x: 0, y: 0, z: 142.5 },
        { x: -180, y: -120, z: 210.0 },
        { x: 190, y: 150, z: 115.8 },
        { x: -90, y: 180, z: 125.4 },
        { x: 140, y: -180, z: 295.2 },
      ];

      pts.forEach((pt) => {
        // Draw cross marker
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3 / zoom, 0, Math.PI * 2);
        ctx.fill();

        if (showLabels) {
          ctx.font = `${Math.max(8, 10 / zoom)}px monospace`;
          ctx.fillText(`+${pt.z}m`, pt.x + 5 / zoom, pt.y - 4 / zoom);
        }
      });
    }

    // 5. Boundary (Level 6)
    const boundLayer = layerMap.get('6');
    if (boundLayer && boundLayer.visible) {
      ctx.strokeStyle = boundLayer.color;
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([8 / zoom, 4 / zoom]);
      ctx.strokeRect(-290, -230, 580, 460);
      ctx.setLineDash([]);
    }

    ctx.restore();

    // Scale bar overlay
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fillRect(15, height - 35, 140, 22);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.strokeRect(15, height - 35, 140, 22);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '10px sans-serif';
    ctx.fillText(`Ölçek: ${(100 / zoom).toFixed(0)} m`, 25, height - 20);
  }, [zoom, pan, layers, showGrid, showLabels, canvasBg]);

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsPanning(true);
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate real world coordinates
    const width = canvas.width;
    const height = canvas.height;
    const worldX = Math.round(485000 + (mouseX - width / 2 - pan.x) / zoom * 2);
    const worldY = Math.round(4421000 + (height / 2 + pan.y - mouseY) / zoom * 2);

    // Dynamic Z approximation based on distance from center
    const dist = Math.sqrt(Math.pow(mouseX - width / 2, 2) + Math.pow(mouseY - height / 2, 2));
    const calculatedZ = Math.round(100 + dist * 0.4 * 10) / 10;

    setCursorPos({ x: worldX, y: worldY, z: calculatedZ });

    if (isPanning) {
      setPan({
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y,
      });
    }
  };

  const handleMouseUp = () => setIsPanning(false);

  // Toggle single layer visibility
  const toggleLayer = (id: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
    );
  };

  // Toggle all layers
  const setAllLayers = (visible: boolean) => {
    setLayers((prev) => prev.map((l) => ({ ...l, visible })));
  };

  // Drag and drop mock file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      setFile({
        name: uploadedFile.name,
        size: `${(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB`,
        format: 'MicroStation DGN (Yüklenen)',
      });
    }
  };

  // Load sample demo files
  const loadSampleFile = (sampleName: string, sizeStr: string) => {
    setFile({
      name: sampleName,
      size: sizeStr,
      format: 'MicroStation V8 DGN',
    });
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };

  const activeLayerCount = layers.filter((l) => l.visible).length;
  const totalElements = layers.filter((l) => l.visible).reduce((acc, curr) => acc + curr.count, 0);

  return (
    <motion.div
      key="dgn-viewer"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="space-y-6 pb-12 max-w-6xl mx-auto"
    >
      {/* 1. Header Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-cyan-500/20 rounded-xl border border-cyan-500/30 text-cyan-400">
              <Eye size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-display font-bold text-white">
                  DGN Dosya Görüntüleyici
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
                  CAD Vektör & Katman Modülü
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                MicroStation (.dgn) çizimlerini interaktif tuval üzerinde inceleyin, koordinatlandırın ve katmanları yönetin.
              </p>
            </div>
          </div>

          {/* Forward to DEM Converter action */}
          {onNavigateToConverter && (
            <button
              onClick={onNavigateToConverter}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/40 transition-all shrink-0"
            >
              <FileCode size={18} />
              <span>DGN → DEM Dönüştürücüye Aktar</span>
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>

      {/* 2. Controls Grid: File Upload & CRS Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* File Upload Box */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 lg:col-span-1">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Upload size={16} className="text-cyan-400" />
              1. DGN Dosyası Yükleme
            </h3>
            {file && (
              <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 flex items-center gap-1">
                <CheckCircle size={12} /> Yüklendi
              </span>
            )}
          </div>

          {/* Upload Drop Zone */}
          <label className="border-2 border-dashed border-slate-700 hover:border-cyan-500/50 bg-slate-950/40 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all group">
            <input type="file" accept=".dgn,.DGN" onChange={handleFileUpload} className="hidden" />
            <div className="w-10 h-10 bg-cyan-500/10 border border-cyan-500/20 rounded-xl flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform mb-2">
              <Upload size={20} />
            </div>
            <p className="text-xs font-semibold text-slate-200">
              DGN dosyası seçin veya buraya sürükleyin
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              Desteklenen formatlar: MicroStation V7 / V8 (.dgn)
            </p>
          </label>

          {/* Preset Samples */}
          <div className="space-y-1.5 pt-1">
            <p className="text-[11px] font-semibold text-slate-400">Hazır Örnek DGN Haritaları:</p>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => loadSampleFile('Akarsu_Vadisi_Saha_Modeli.dgn', '4.8 MB')}
                className="text-left text-xs px-3 py-1.5 bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 rounded-lg border border-slate-700/50 flex items-center justify-between transition-colors"
              >
                <span>Akarsu_Vadisi_Saha_Modeli.dgn</span>
                <span className="text-[10px] text-slate-500 font-mono">4.8 MB</span>
              </button>
              <button
                onClick={() => loadSampleFile('Izohips_ve_Kot_Noktalari_v2.dgn', '8.2 MB')}
                className="text-left text-xs px-3 py-1.5 bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 rounded-lg border border-slate-700/50 flex items-center justify-between transition-colors"
              >
                <span>Izohips_ve_Kot_Noktalari_v2.dgn</span>
                <span className="text-[10px] text-slate-500 font-mono">8.2 MB</span>
              </button>
            </div>
          </div>
        </div>

        {/* CRS Coordinate System Selector */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Compass size={16} className="text-indigo-400" />
              2. Koordinat Sistemi (CRS) & Birim Ayarları
            </h3>
            <span className="text-[11px] text-indigo-300 font-mono bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
              {crs}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* CRS Select */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Koordinat Referans Sistemi (CRS)</label>
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

            {/* Measurement Unit Select */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Çizim Metrik Birimi</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="Meter">Metre (m) [Varsayılan]</option>
                <option value="Centimeter">Santimetre (cm)</option>
                <option value="Foot">Ayak / Feet (ft)</option>
              </select>
            </div>
          </div>

          {/* Active File Summary Stats */}
          {file && (
            <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-400 text-[10px] block">Aktif Dosya:</span>
                <span className="text-white font-bold truncate block">{file.name}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">Format:</span>
                <span className="text-cyan-400 font-semibold block">{file.format}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">Toplam Eleman:</span>
                <span className="text-amber-400 font-bold block">{totalElements} obje</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">Z Yükseklik Aralığı:</span>
                <span className="text-emerald-400 font-bold block">98m - 385m</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Interactive CAD / Map Canvas & Layers Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Interactive Canvas Viewer (3 cols) */}
        <div className="lg:col-span-3 space-y-3">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
            {/* Canvas Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/80 rounded-xl p-2.5 border border-slate-800">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setZoom((z) => Math.min(z + 0.25, 4))}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                  title="Yakınlaş (Zoom In)"
                >
                  <ZoomIn size={16} />
                </button>
                <button
                  onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                  title="Uzaklaş (Zoom Out)"
                >
                  <ZoomOut size={16} />
                </button>
                <button
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-1 text-xs font-semibold px-2"
                  title="Görünümü Sıfırla"
                >
                  <Maximize2 size={14} />
                  <span>Sığdır</span>
                </button>
              </div>

              {/* Display Toggles */}
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) => setShowGrid(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0"
                  />
                  <span>Grid Kareraj</span>
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
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium"
                >
                  {canvasBg === 'dark' ? 'Koyu Arka Plan' : 'Blueprint Mavi'}
                </button>
              </div>
            </div>

            {/* Canvas Render Area */}
            <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 cursor-grab active:cursor-grabbing">
              <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className="w-full h-[480px] block"
              />

              {/* Canvas HUD Overlay bottom */}
              <div className="absolute bottom-3 left-3 right-3 bg-slate-950/85 backdrop-blur border border-slate-800 rounded-xl px-4 py-2 flex flex-wrap items-center justify-between text-xs font-mono text-slate-300 gap-2">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-slate-500 text-[10px] block">KOORDİNAT X:</span>
                    <span className="text-cyan-400 font-bold">{cursorPos.x.toLocaleString()} m</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">KOORDİNAT Y:</span>
                    <span className="text-cyan-400 font-bold">{cursorPos.y.toLocaleString()} m</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] block">KOT / YÜKSEKLİK (Z):</span>
                    <span className="text-amber-400 font-bold">{cursorPos.z.toFixed(1)} m</span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 flex items-center gap-2">
                  <Move size={14} className="text-cyan-400" />
                  <span>Sürükleyerek Pan Yapın</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Katman (Level / Layer) Yönetim Paneli (1 col) */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-4 lg:col-span-1 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers size={16} className="text-cyan-400" />
                Katman Yönetimi
              </h3>
              <span className="text-[10px] font-mono text-slate-400">
                {activeLayerCount} / {layers.length} Katman
              </span>
            </div>

            {/* Select All / Clear All Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAllLayers(true)}
                className="flex-1 text-[11px] font-semibold py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
              >
                Tümünü Aç
              </button>
              <button
                onClick={() => setAllLayers(false)}
                className="flex-1 text-[11px] font-semibold py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
              >
                Tümünü Kapat
              </button>
            </div>

            {/* Layer Items List */}
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {layers.map((layer) => (
                <div
                  key={layer.id}
                  onClick={() => toggleLayer(layer.id)}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                    layer.visible
                      ? 'bg-slate-800/80 border-slate-700 text-white'
                      : 'bg-slate-950/40 border-slate-800/60 text-slate-500 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLayer(layer.id);
                      }}
                      className="text-slate-400 hover:text-white"
                    >
                      {layer.visible ? (
                        <Eye size={16} className="text-cyan-400" />
                      ) : (
                        <EyeOff size={16} className="text-slate-600" />
                      )}
                    </button>

                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: layer.color }}
                    />

                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate leading-tight">{layer.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        Seviye {layer.level} • {layer.count} obje
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Forward to Converter Action Button */}
          {onNavigateToConverter && (
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <button
                onClick={onNavigateToConverter}
                className="w-full py-2.5 px-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-bold text-xs flex items-center justify-center gap-2 transition-all"
              >
                <Sparkles size={16} />
                <span>DEM Dönüştürücüye Aktar</span>
                <ArrowRight size={14} />
              </button>
              <p className="text-[10px] text-slate-500 text-center leading-tight">
                Seçili izohips ve kot katmanları DEM üretimi için otomatik aktarılır.
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default DGNViewer;
