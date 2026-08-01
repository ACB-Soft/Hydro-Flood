import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Eye, FileCode, CheckCircle, RefreshCw, Layers, ZoomIn, Compass } from 'lucide-react';
import DxfParser from 'dxf-parser';

interface DXFAnalysisProps {
  // We can add props later if needed
}

interface CADLayer {
  name: string;
  color: number;
  visible: boolean;
}

const CRS_LIST = [
  { code: 'EPSG:5253', name: 'TUREF / TM27 (3°)' },
  { code: 'EPSG:5254', name: 'TUREF / TM30 (3°)' },
  { code: 'EPSG:5255', name: 'TUREF / TM33 (3°)' },
  { code: 'EPSG:5256', name: 'TUREF / TM36 (3°)' },
];

const DXFAnalysis: React.FC<DXFAnalysisProps> = () => {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [crs, setCrs] = useState<string>('EPSG:5254');
  const [isParsing, setIsParsing] = useState(false);
  const [isParsed, setIsParsed] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [dxfData, setDxfData] = useState<any>(null);
  const [layers, setLayers] = useState<CADLayer[]>([]);
  
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
    setUploadMessage(`Dosya seçildi: ${file.name}. Lütfen Koordinat Sistemini seçin ve 'Dosyayı Aç / Ayrıştır' butonuna tıklayın.`);
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
                   color: layerDict[layerName].color || 7, // default color
                   visible: true
                });
             }
          }
          setLayers(extractedLayers);
          
          setZoom(1);
          setPan({ x: 0, y: 0 });
          setIsParsed(true);
          setUploadMessage(`DXF Başarıyla Açıldı! ${extractedLayers.length} katman bulundu.`);
        } catch (err) {
          console.error("DXF Parse Error:", err);
          setUploadMessage("DXF dosyası ayrıştırılamadı. Format desteklenmiyor veya dosya bozuk.");
        } finally {
          setIsParsing(false);
        }
      };
      reader.readAsText(pendingFile);
    } catch (err) {
      console.error(err);
      setIsParsing(false);
      setUploadMessage("Dosya okunurken bir hata oluştu.");
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
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Dark theme background
    ctx.fillStyle = '#0f172a'; // slate-900
    ctx.fillRect(0, 0, width, height);

    // Calculate extents
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    if (dxfData.entities && dxfData.entities.length > 0) {
       dxfData.entities.forEach((entity: any) => {
          if (entity.vertices) {
             entity.vertices.forEach((v: any) => {
                if (v.x < minX) minX = v.x;
                if (v.y < minY) minY = v.y;
                if (v.x > maxX) maxX = v.x;
                if (v.y > maxY) maxY = v.y;
             });
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

    const fitScale = Math.min((width * 0.8) / spanX, (height * 0.8) / spanY) || 1;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(zoom, zoom);

    // Draw entities
    if (dxfData.entities) {
      dxfData.entities.forEach((entity: any) => {
        const layer = layers.find(l => l.name === entity.layer);
        if (layer && !layer.visible) return;

        ctx.strokeStyle = '#38bdf8'; // Default cyan
        ctx.lineWidth = 1 / zoom;

        if (entity.type === 'LINE') {
          ctx.beginPath();
          ctx.moveTo((entity.vertices[0].x - midX) * fitScale, -(entity.vertices[0].y - midY) * fitScale);
          ctx.lineTo((entity.vertices[1].x - midX) * fitScale, -(entity.vertices[1].y - midY) * fitScale);
          ctx.stroke();
        } else if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
          if (entity.vertices && entity.vertices.length > 0) {
            ctx.beginPath();
            entity.vertices.forEach((v: any, i: number) => {
              const sx = (v.x - midX) * fitScale;
              const sy = -(v.y - midY) * fitScale;
              if (i === 0) ctx.moveTo(sx, sy);
              else ctx.lineTo(sx, sy);
            });
            if (entity.shape) ctx.closePath(); // closed polyline
            ctx.stroke();
          }
        }
      });
    }

    ctx.restore();

  }, [dxfData, isParsed, zoom, pan, layers]);

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

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    if (e.deltaY < 0) {
      setZoom((prev) => Math.min(prev * zoomFactor, 50));
    } else {
      setZoom((prev) => Math.max(prev / zoomFactor, 0.1));
    }
  };

  const toggleLayer = (name: string) => {
    setLayers(prev => prev.map(l => l.name === name ? { ...l, visible: !l.visible } : l));
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
          <FileCode className="text-cyan-400" />
          DXF Dosya Analizleri
        </h2>
        <button
          disabled={!isParsed}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-lg ${
            isParsed
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/25'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-750'
          }`}
        >
          <Layers size={14} />
          <span>Katmanları DEM Üreticiye Aktar</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-md">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Upload size={16} className="text-cyan-400" />
              1. DXF Dosyası Seç
            </h3>
            {pendingFile && (
              <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 flex items-center gap-1">
                <CheckCircle size={12} /> Seçildi
              </span>
            )}
          </div>
          
          <label className="border-2 border-dashed border-slate-700 hover:border-cyan-500/50 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all bg-slate-800/50 hover:bg-slate-800">
            <input type="file" accept=".dxf" className="hidden" onChange={handleFileUpload} />
            <div className="w-10 h-10 bg-cyan-500/10 rounded-full flex items-center justify-center text-cyan-400 mb-2">
              <Upload size={20} />
            </div>
            <p className="text-xs font-semibold text-slate-200 text-center">
              {pendingFile ? pendingFile.name : 'DXF dosyası seçin veya sürükleyin'}
            </p>
          </label>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 space-y-4 lg:col-span-2 shadow-md">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Compass size={16} className="text-indigo-400" />
              2. Koordinat Sistemi & Ayrıştırma
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Harita Projeksiyonu (CRS)</label>
              <select
                value={crs}
                onChange={(e) => setCrs(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                {CRS_LIST.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <button
                onClick={handleParse}
                disabled={!pendingFile || isParsing}
                className={`w-full py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg ${
                  !pendingFile || isParsing
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-750'
                    : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/25 border border-cyan-400'
                }`}
              >
                {isParsing ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Ayrıştırılıyor...</span>
                  </>
                ) : (
                  <>
                    <Eye size={14} />
                    <span>Dosyayı Aç / Ayrıştır</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {uploadMessage && (
            <div className={`text-[11px] p-2.5 rounded-xl border ${
              isParsed 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                : 'bg-slate-800/50 border-slate-700 text-slate-300'
            }`}>
              {uploadMessage}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-[400px] grid grid-cols-1 lg:grid-cols-4 gap-4 pb-4">
        <div className="lg:col-span-3 bg-slate-900/60 border border-slate-800 rounded-3xl overflow-hidden relative shadow-inner">
          <div className="absolute top-4 left-4 z-10 flex gap-2">
            <div className="bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-xs font-bold text-white flex items-center gap-2">
              <ZoomIn size={14} className="text-cyan-400" />
              <span>{Math.round(zoom * 100)}%</span>
            </div>
          </div>
          
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            className="w-full h-full cursor-grab active:cursor-grabbing"
            style={{ display: isParsed ? 'block' : 'none' }}
          />

          {!isParsed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-3">
              <FileCode size={48} className="opacity-20" />
              <p className="text-sm font-medium">Görüntüleme için DXF dosyası ayrıştırın</p>
            </div>
          )}
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-4 flex flex-col shadow-md">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <Layers size={16} className="text-cyan-400" />
            Katman Yöneticisi
          </h3>
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
            {layers.length === 0 ? (
              <p className="text-xs text-slate-500 text-center mt-4">Katman bulunamadı.</p>
            ) : (
              layers.map((l, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-slate-800/50 border border-slate-750">
                  <span className="text-xs text-slate-200 truncate pr-2">{l.name}</span>
                  <button
                    onClick={() => toggleLayer(l.name)}
                    className={`w-8 h-4 rounded-full relative transition-colors ${l.visible ? 'bg-cyan-500' : 'bg-slate-600'}`}
                  >
                    <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all ${l.visible ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DXFAnalysis;
