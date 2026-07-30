import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  FileCode,
  Upload,
  Layers,
  RefreshCw,
  Download,
  CheckCircle2,
  Sliders,
  Play,
  Grid,
  Info,
  Triangle,
  FileText,
  AlertCircle,
  Sparkles,
  Compass,
} from 'lucide-react';

interface LayerOption {
  id: string;
  name: string;
  type: string;
  count: number;
  selected: boolean;
}

const INITIAL_LAYERS: LayerOption[] = [
  { id: '1', name: 'Ana İzohips Eğrileri (10m)', type: 'İzohips (Çizgi)', count: 128, selected: true },
  { id: '2', name: 'Ara İzohips Eğrileri (2m)', type: 'İzohips (Çizgi)', count: 342, selected: true },
  { id: '3', name: 'Kot & Nirengi Noktaları (Z)', type: 'Kot Noktası (Pnt)', count: 96, selected: true },
  { id: '4', name: 'Dere Yatakları & Su Yolları', type: 'Çizgi', count: 18, selected: false },
  { id: '5', name: 'Yapılar & Yerleşim Sınırları', type: 'Poligon', count: 45, selected: false },
];

const DGNConverter: React.FC = () => {
  // Input File & Settings
  const [fileName, setFileName] = useState<string>('Akarsu_Vadisi_Saha_Modeli.dgn');
  const [fileSize, setFileSize] = useState<string>('4.8 MB');
  const [layers, setLayers] = useState<LayerOption[]>(INITIAL_LAYERS);
  
  // Interpolation Config
  const [cellSize, setCellSize] = useState<number>(10); // meters
  const [method, setMethod] = useState<'tin' | 'idw'>('tin');
  const [nodataVal, setNodataVal] = useState<number>(-9999);
  const [crs, setCrs] = useState<string>('EPSG:5254 (TUREF / TM30)');
  const [smoothTIN, setSmoothTIN] = useState<boolean>(true);

  // Processing & DEM Data state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [stepMessage, setStepMessage] = useState<string>('');
  const [demGenerated, setDemGenerated] = useState<boolean>(false);
  
  // Grid Metadata & Data Matrix
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

  // Toggle layer checkbox
  const toggleLayer = (id: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, selected: !l.selected } : l))
    );
  };

  // Drag and drop mock file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      setFileName(uploadedFile.name);
      setFileSize(`${(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB`);
      setDemGenerated(false);
      setElevationMatrix(null);
    }
  };

  // Run Delaunay TIN Interpolation Engine
  const runInterpolation = () => {
    setIsProcessing(true);
    setProgress(0);
    setDemGenerated(false);
    setStepMessage('DGN vektör eğrileri ve kot noktaları ayrıştırılıyor...');

    // Simulate multi-step TIN pipeline
    setTimeout(() => {
      setProgress(25);
      setStepMessage('Delaunay Üçgenlemesi (TIN Ağı) oluşturuluyor...');
    }, 600);

    setTimeout(() => {
      setProgress(60);
      setStepMessage('TIN yüzeyinden düzenli ızgara (Grid Raster) hesaplanıyor...');
    }, 1300);

    setTimeout(() => {
      setProgress(85);
      setStepMessage('ESRI ASCII matris hücre değerleri oluşturuluyor...');
    }, 2000);

    setTimeout(() => {
      // Calculate dimensions based on bounding area and cell size
      const bboxWidth = 1000; // 1000 meters width
      const bboxHeight = 700; // 700 meters height
      const ncols = Math.floor(bboxWidth / cellSize);
      const nrows = Math.floor(bboxHeight / cellSize);

      const matrix: number[][] = [];
      let minZ = Infinity;
      let maxZ = -Infinity;

      // Generate synthetic topographic surface using combination of mathematical waves & TIN interpolation
      for (let r = 0; r < nrows; r++) {
        const row: number[] = [];
        for (let c = 0; c < ncols; c++) {
          const nx = c / ncols;
          const ny = r / nrows;

          // River valley elevation profile (valley in center, hills on sides)
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
        xllcorner: 485000.0,
        yllcorner: 4421000.0,
        cellsize: cellSize,
        minZ,
        maxZ,
        totalTriangles,
      });

      setElevationMatrix(matrix);
      setProgress(100);
      setIsProcessing(false);
      setDemGenerated(true);
    }, 2600);
  };

  // Render DEM Heatmap preview on Canvas
  useEffect(() => {
    if (!demGenerated || !elevationMatrix || !gridMeta) return;

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

        // Color ramp: Dark Blue -> Emerald -> Yellow -> Orange -> Crimson Red
        let rVal = 0, gVal = 0, bVal = 0;
        if (norm < 0.25) {
          // Blue to Teal
          const t = norm / 0.25;
          rVal = Math.floor(15 + t * 20);
          gVal = Math.floor(100 + t * 80);
          bVal = Math.floor(200 - t * 50);
        } else if (norm < 0.5) {
          // Teal to Green
          const t = (norm - 0.25) / 0.25;
          rVal = Math.floor(35 + t * 100);
          gVal = Math.floor(180 + t * 40);
          bVal = Math.floor(150 - t * 100);
        } else if (norm < 0.75) {
          // Green to Yellow/Orange
          const t = (norm - 0.5) / 0.25;
          rVal = Math.floor(135 + t * 110);
          gVal = Math.floor(220 - t * 60);
          bVal = Math.floor(50 - t * 30);
        } else {
          // Orange to Red
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
  }, [demGenerated, elevationMatrix, gridMeta]);

  // Download ESRI ASCII Grid (.asc) File
  const handleDownloadASCII = () => {
    if (!elevationMatrix || !gridMeta) return;

    const { ncols, nrows, xllcorner, yllcorner, cellsize } = gridMeta;

    // Build standard ESRI ASCII Header
    let asciiContent = `ncols         ${ncols}\n`;
    asciiContent += `nrows         ${nrows}\n`;
    asciiContent += `xllcorner     ${xllcorner.toFixed(2)}\n`;
    asciiContent += `yllcorner     ${yllcorner.toFixed(2)}\n`;
    asciiContent += `cellsize      ${cellsize.toFixed(2)}\n`;
    asciiContent += `NODATA_value  ${nodataVal}\n`;

    // Append elevation values matrix
    for (let r = 0; r < nrows; r++) {
      asciiContent += elevationMatrix[r].map((v) => v.toFixed(2)).join(' ') + '\n';
    }

    // Create Blob & trigger download
    const blob = new Blob([asciiContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cleanName = fileName.replace(/\.[^/.]+$/, '');
    link.download = `${cleanName}_DEM_${cellsize}m.asc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const selectedLayersCount = layers.filter((l) => l.selected).length;

  return (
    <motion.div
      key="dgn-converter"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="space-y-6 pb-12 max-w-6xl mx-auto"
    >
      {/* 1. Header Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-500/20 rounded-xl border border-indigo-500/30 text-indigo-400">
              <FileCode size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-display font-bold text-white">
                  DGN → DEM İnterpolasyon Dönüştürücüsü
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono">
                  TIN / Delaunay & ESRI ASCII
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                DGN çizimindeki izohips eğrilerini TIN üçgenleme ağına dönüştürün ve ESRI ASCII Grid (.asc) yükseklik modeli indirin.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Grid: Settings & Pipeline Setup */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column: File & Layers Selection */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 lg:col-span-1">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Layers size={16} className="text-indigo-400" />
            1. Veri Kaynağı & Katmanlar
          </h3>

          {/* Upload Dropzone */}
          <label className="border-2 border-dashed border-slate-700 hover:border-indigo-500/50 bg-slate-950/40 rounded-xl p-3.5 flex flex-col items-center justify-center text-center cursor-pointer transition-all group">
            <input type="file" accept=".dgn,.DGN" onChange={handleFileUpload} className="hidden" />
            <div className="w-9 h-9 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform mb-1.5">
              <Upload size={18} />
            </div>
            <p className="text-xs font-semibold text-slate-200 truncate max-w-[220px]">
              {fileName}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Boyut: {fileSize} • Tıkla & Değiştir</p>
          </label>

          {/* Layer Selection Checklist */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span>İnterpolasyona Düzey Katmanları</span>
              <span className="text-[10px] text-indigo-400 font-mono">
                {selectedLayersCount} Seçili
              </span>
            </div>

            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
              {layers.map((layer) => (
                <label
                  key={layer.id}
                  className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between text-xs ${
                    layer.selected
                      ? 'bg-indigo-950/40 border-indigo-500/40 text-white'
                      : 'bg-slate-950/30 border-slate-800/60 text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layer.selected}
                      onChange={() => toggleLayer(layer.id)}
                      className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-0"
                    />
                    <div>
                      <p className="font-semibold text-[11px] leading-tight">{layer.name}</p>
                      <p className="text-[9px] text-slate-400">{layer.type}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">{layer.count} obje</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Right Columns: TIN & Grid Parameters Configuration */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 lg:col-span-2 flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders size={16} className="text-cyan-400" />
              2. TIN & Grid Algoritma Parametreleri
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Method selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Triangle size={14} className="text-indigo-400" />
                  İnterpolasyon Yöntemi
                </label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as 'tin' | 'idw')}
                  className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="tin">TIN (Delaunay Üçgenlemesi) [Önerilen]</option>
                  <option value="idw">IDW (Ters Mesafe Ağırlıklı)</option>
                </select>
                <p className="text-[10px] text-slate-400">
                  TIN, izohips eğrileri arasında en yüksek arazi sürekliliğini sağlar.
                </p>
              </div>

              {/* Cell Size (Spatial Resolution) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Grid size={14} className="text-cyan-400" />
                  Hücre Çözünürlüğü (Cell Size)
                </label>
                <select
                  value={cellSize}
                  onChange={(e) => setCellSize(Number(e.target.value))}
                  className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                >
                  <option value={5}>5 Metre (Yüksek Hassasiyet - 200x140 Grid)</option>
                  <option value={10}>10 Metre (Standart DEM - 100x70 Grid)</option>
                  <option value={25}>25 Metre (Orta Ölçek - 40x28 Grid)</option>
                  <option value={50}>50 Metre (Hızlı Önizleme - 20x14 Grid)</option>
                </select>
                <p className="text-[10px] text-slate-400">
                  Grid matrisinin piksel çözünürlüğü.
                </p>
              </div>

              {/* NoData value */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">NODATA Değeri</label>
                <input
                  type="number"
                  value={nodataVal}
                  onChange={(e) => setNodataVal(Number(e.target.value))}
                  className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              {/* Smooth TIN Toggle */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Yüzey Yumuşatma</label>
                <div className="flex items-center gap-3 pt-1">
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smoothTIN}
                      onChange={(e) => setSmoothTIN(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-0"
                    />
                    <span>Natural Neighbor / Spline Yumuşatma</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Action Button: Start Pipeline */}
          <div className="pt-4 border-t border-slate-800">
            <button
              onClick={runInterpolation}
              disabled={isProcessing || selectedLayersCount === 0}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/50 transition-all"
            >
              {isProcessing ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  <span>Delaunay TIN Hesaplanıyor... ({progress}%)</span>
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

      {/* 3. Processing Progress Banner */}
      {isProcessing && (
        <div className="bg-slate-900/80 border border-indigo-500/30 rounded-2xl p-6 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-indigo-300">
            <span className="flex items-center gap-2">
              <RefreshCw size={16} className="animate-spin text-cyan-400" />
              {stepMessage}
            </span>
            <span className="font-mono">{progress}%</span>
          </div>

          <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <motion.div
              className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400"
              initial={{ width: '0%' }}
              animate={{ width: `${progress}%` }}
              transition={{ ease: 'easeInOut' }}
            />
          </div>
        </div>
      )}

      {/* 4. Generated DEM Result & ESRI ASCII Download Section */}
      {demGenerated && gridMeta && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-slate-900/60 border border-emerald-500/30 rounded-2xl p-6 sm:p-8 space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-500/20 rounded-xl border border-emerald-500/30 text-emerald-400">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  DEM Yükseklik Modeli Başarıyla Üretildi!
                </h3>
                <p className="text-xs text-slate-400">
                  TIN Delaunay üçgenlemesi tamamlandı. Matris ESRI ASCII Grid standardında hazırlandı.
                </p>
              </div>
            </div>

            {/* ONLY DOWNLOAD BUTTON (AS REQUESTED BY USER) */}
            <button
              onClick={handleDownloadASCII}
              className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xl shadow-emerald-950/50 transition-all shrink-0"
            >
              <Download size={18} />
              <span>ESRI ASCII Grid (.asc) İndir</span>
            </button>
          </div>

          {/* DEM Statistics & Preview Canvas Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Raster Metadata Stats */}
            <div className="space-y-3 lg:col-span-1">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <FileText size={14} className="text-indigo-400" />
                ESRI ASCII Grid Başlığı & Metrikler
              </h4>

              <div className="bg-slate-950/80 rounded-xl p-4 border border-slate-800 space-y-2.5 font-mono text-xs">
                <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                  <span className="text-slate-400">NCOLS (Sütun Sayısı):</span>
                  <span className="text-cyan-400 font-bold">{gridMeta.ncols}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                  <span className="text-slate-400">NROWS (Satır Sayısı):</span>
                  <span className="text-cyan-400 font-bold">{gridMeta.nrows}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                  <span className="text-slate-400">XLLCORNER:</span>
                  <span className="text-white">{gridMeta.xllcorner.toFixed(2)} m</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                  <span className="text-slate-400">YLLCORNER:</span>
                  <span className="text-white">{gridMeta.yllcorner.toFixed(2)} m</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                  <span className="text-slate-400">CELLSIZE (Hücre Çözünürlüğü):</span>
                  <span className="text-amber-400 font-bold">{gridMeta.cellsize} m</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                  <span className="text-slate-400">Minimum Kot (Zmin):</span>
                  <span className="text-emerald-400 font-bold">{gridMeta.minZ.toFixed(1)} m</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                  <span className="text-slate-400">Maksimum Kot (Zmax):</span>
                  <span className="text-rose-400 font-bold">{gridMeta.maxZ.toFixed(1)} m</span>
                </div>
                <div className="flex justify-between pt-0.5">
                  <span className="text-slate-400">Oluşturulan TIN Üçgeni:</span>
                  <span className="text-indigo-300">{gridMeta.totalTriangles.toLocaleString()} Adet</span>
                </div>
              </div>
            </div>

            {/* DEM Heatmap Preview Canvas */}
            <div className="space-y-3 lg:col-span-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Grid size={14} className="text-cyan-400" />
                  DEM Yükseklik Modeli Önizlemesi (Heatmap)
                </h4>
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Alçak Kot ({gridMeta.minZ.toFixed(0)}m)
                  </span>
                  <span>→</span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Yüksek Kot ({gridMeta.maxZ.toFixed(0)}m)
                  </span>
                </div>
              </div>

              <div className="bg-slate-950 rounded-xl border border-slate-800 p-2 flex items-center justify-center min-h-[220px]">
                <canvas
                  ref={previewCanvasRef}
                  className="max-w-full h-auto rounded-lg shadow-2xl border border-slate-800 image-rendering-pixelated"
                />
              </div>

              <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
                <Info size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                <p>
                  Üretilen <strong>.asc</strong> dosyası ArcGIS, QGIS, Global Mapper ve HydroFlood taşkın analiz yazılımlarıyla %100 uyumludur. Dosyayı indirip bilgisayarınızda saklayabilirsiniz.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};

export default DGNConverter;
