import React, { useState, useRef, useEffect } from 'react';
import { Upload, Eye, FileCode, CheckCircle, RefreshCw, Layers, ZoomIn, Compass, RotateCcw, Sliders } from 'lucide-react';
import DxfParser from 'dxf-parser';

interface CADLayer {
  name: string;
  color: number;
  visible: boolean;
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
  { code: 'NONE', name: 'Seçilmedi (Varsayılan Yerel Koordinat)' },
  { code: 'EPSG:5253', name: 'TUREF / TM27 (3°)' },
  { code: 'EPSG:5254', name: 'TUREF / TM30 (3°)' },
  { code: 'EPSG:5255', name: 'TUREF / TM33 (3°)' },
  { code: 'EPSG:5256', name: 'TUREF / TM36 (3°)' },
];

const DXFAnalysis: React.FC = () => {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [crs, setCrs] = useState<string>('NONE');
  const [isParsing, setIsParsing] = useState(false);
  const [isParsed, setIsParsed] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [dxfData, setDxfData] = useState<any>(null);
  const [layers, setLayers] = useState<CADLayer[]>([]);
  
  // Mobile Tab State: 'controls' (default so user uploads/parses file first) or 'map'
  const [mobileTab, setMobileTab] = useState<'controls' | 'map'>('controls');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setIsParsed(false);
    setDxfData(null);
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
          
          setDxfData(parsed);
          
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
          setLayers(extractedLayers);
          
          setZoom(1);
          setPan({ x: 0, y: 0 });
          setIsParsed(true);
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
      setIsParsing(false);
      setUploadMessage("Dosya okunurken hata oluştu.");
    }
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

    // Dark theme background
    ctx.fillStyle = '#0b1329';
    ctx.fillRect(0, 0, width, height);

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

        ctx.strokeStyle = strokeColor;
        ctx.fillStyle = strokeColor;
        ctx.lineWidth = 1.5 / zoom;

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
            ctx.beginPath();
            ctx.arc(px, py, 2.5 / zoom, 0, 2 * Math.PI);
            ctx.fill();
          }
        } else if (entity.type === 'TEXT' || entity.type === 'MTEXT') {
          const pt = entity.startPoint || entity.position || (entity.vertices && entity.vertices[0]);
          if (pt && entity.text) {
            const tx = (pt.x - midX) * fitScale;
            const ty = -(pt.y - midY) * fitScale;
            const fontSize = Math.max(10, Math.min(24, (entity.textHeight || 10) * fitScale));
            ctx.font = `${fontSize}px sans-serif`;
            ctx.fillText(entity.text, tx, ty);
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

  const toggleLayer = (name: string) => {
    setLayers(prev => prev.map(l => l.name === name ? { ...l, visible: !l.visible } : l));
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
            mobileTab === 'map' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
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
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-2.5 shrink-0 shadow-sm space-y-1.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Upload size={13} className="text-cyan-400" />
                1. DXF Dosyası Seç
              </h3>
              {pendingFile && (
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md border border-emerald-500/20 flex items-center gap-1">
                  <CheckCircle size={10} /> Seçildi
                </span>
              )}
            </div>
            
            <label className="border border-dashed border-slate-700 hover:border-cyan-500/50 rounded-xl px-2.5 py-1.5 flex items-center gap-2 cursor-pointer transition-all bg-slate-800/40 hover:bg-slate-800">
              <input type="file" accept=".dxf" className="hidden" onChange={handleFileUpload} />
              <div className="w-6 h-6 bg-cyan-500/10 rounded-lg flex items-center justify-center text-cyan-400 shrink-0">
                <Upload size={13} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-200 truncate">
                  {pendingFile ? pendingFile.name : 'DXF Seç veya Sürükle'}
                </p>
              </div>
            </label>
          </div>

          {/* 2. Projeksiyon Tanımlayıcı (İsteğe Bağlı) */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-2.5 shrink-0 shadow-sm space-y-1">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Compass size={13} className="text-indigo-400" />
                2. Projeksiyon / CRS
              </h3>
              <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">İsteğe Bağlı</span>
            </div>
            <select
              value={crs}
              onChange={(e) => setCrs(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
            >
              {CRS_LIST.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Dosyayı Aç / Ayrıştır Butonu */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-2.5 shrink-0 shadow-sm space-y-1.5">
            <button
              onClick={handleParse}
              disabled={!pendingFile || isParsing}
              className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-md ${
                !pendingFile || isParsing
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-750'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/25 border border-cyan-400'
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
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                  : 'bg-slate-800/50 border-slate-700 text-slate-300'
              }`}>
                {uploadMessage}
              </div>
            )}
          </div>

          {/* 4. Katman Yöneticisi - En Fazla Yüksekliği Kaplar */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-2.5 flex flex-col flex-1 min-h-0 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Layers size={13} className="text-cyan-400" />
                4. Katman Yöneticisi
              </h3>
              {layers.length > 0 && (
                <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
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
                  <div key={idx} className="flex items-center justify-between p-1.5 rounded-xl bg-slate-800/50 border border-slate-750">
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span 
                        className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20 shadow-sm" 
                        style={{ backgroundColor: getAciColor(l.color) }}
                        title={`Renk Kodu: ${l.color}`}
                      />
                      <span className="text-xs text-slate-200 truncate">{l.name}</span>
                    </div>
                    <button
                      onClick={() => toggleLayer(l.name)}
                      className={`w-8 h-4 rounded-full relative transition-colors shrink-0 ${l.visible ? 'bg-cyan-500' : 'bg-slate-600'}`}
                    >
                      <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all ${l.visible ? 'left-[18px]' : 'left-0.5'}`} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <button
              disabled={!isParsed}
              className={`w-full mt-2 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border shadow-sm shrink-0 ${
                isParsed
                  ? 'bg-blue-600 hover:bg-blue-500 border-blue-400 text-white shadow-blue-500/20'
                  : 'bg-slate-800/80 border-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Layers size={13} />
              <span>Katmanları DEM Üreticiye Aktar</span>
            </button>
          </div>

        </div>

        {/* RIGHT COLUMN: CAD Canvas Viewer (Visible on Desktop OR when MobileTab === 'map') */}
        <div className={`lg:col-span-9 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden flex flex-col relative shadow-inner h-full min-h-0 ${
          mobileTab === 'map' ? 'flex' : 'hidden lg:flex'
        }`}>
          
          {/* Canvas Toolbar Header */}
          <div className="px-3 py-2 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between z-10 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <h3 className="text-xs font-bold text-white">2D CAD Görüntüleme Ekranı</h3>
            </div>

            <div className="flex items-center gap-2">
              {/* Quick Mobile Settings Button */}
              <button
                onClick={() => setMobileTab('controls')}
                className="lg:hidden px-2.5 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
              >
                <Sliders size={12} />
                <span>Paneli Aç</span>
              </button>

              <div className="bg-slate-900/90 px-2 py-1 rounded-lg border border-slate-700 text-[11px] font-mono text-cyan-400 flex items-center gap-1">
                <ZoomIn size={12} />
                <span>{Math.round(zoom * 100)}%</span>
              </div>
              <button
                onClick={resetView}
                disabled={!isParsed}
                className="p-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg transition-colors"
                title="Sıfırla"
              >
                <RotateCcw size={12} />
              </button>
            </div>
          </div>

          {/* Canvas Container */}
          <div className="flex-1 relative w-full h-full min-h-0">
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
              className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing touch-none"
              style={{ display: isParsed ? 'block' : 'none' }}
            />

            {!isParsed && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-3 p-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-slate-800/60 border border-slate-700 flex items-center justify-center text-slate-400">
                  <FileCode size={28} />
                </div>
                <div className="space-y-1 max-w-sm">
                  <p className="text-sm font-semibold text-slate-300">2D CAD Görüntüleyici Hazır</p>
                  <p className="text-xs text-slate-500">
                    {mobileTab === 'map' ? (
                      <>
                        Üstteki <span className="text-cyan-400 font-bold">Paneli Aç</span> butonundan bir .dxf dosyası seçip haritanızı ekrana yükleyebilirsiniz.
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
