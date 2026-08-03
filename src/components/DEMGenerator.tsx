import React, { useState, useEffect, useRef } from 'react';
import { 
  Layers, Play, Download, CheckCircle, AlertTriangle, 
  RefreshCw, BarChart2, Eye, Grid, Mountain, Sparkles, FileText,
  Upload, FileCode, Sliders, ZoomIn, ZoomOut, RotateCcw, ArrowRight,
  Droplets, Check
} from 'lucide-react';
import DxfParser from 'dxf-parser';
import { 
  extractPointsFromDXF, 
  generateTINDEM, 
  renderDEMToCanvas, 
  exportDEMToASC, 
  exportDEMToCSV, 
  DEMResult 
} from '../utils/demGenerator';

export interface CADLayer {
  name: string;
  color: number;
  visible: boolean;
}

interface DEMGeneratorProps {
  dxfData: any;
  setDxfData: (data: any) => void;
  layers: CADLayer[];
  setLayers: React.Dispatch<React.SetStateAction<CADLayer[]>>;
  crs: string;
  setCrs: (crs: string) => void;
  dxfFileName: string | null;
  setDxfFileName: (name: string | null) => void;
  onTransferToSimulation?: (demResult: DEMResult, ascText: string) => void;
}

const CELL_SIZES = [
  { value: 0.5, label: '0.5m (Çok Yüksek)' },
  { value: 1.0, label: '1.0m (Standart)' },
  { value: 2.0, label: '2.0m (Önerilen)' },
  { value: 3.0, label: '3.0m (Orta)' },
  { value: 4.0, label: '4.0m (Hızlı)' },
  { value: 5.0, label: '5.0m (Genel)' },
];

const CRS_LIST = [
  { code: 'NONE', name: 'Seçilmedi (Yerel Koordinat)' },
  { code: 'EPSG:5253', name: 'TUREF / TM27 (3°)' },
  { code: 'EPSG:5254', name: 'TUREF / TM30 (3°)' },
  { code: 'EPSG:5255', name: 'TUREF / TM33 (3°)' },
  { code: 'EPSG:5256', name: 'TUREF / TM36 (3°)' },
];

const getAciColor = (colorNum?: any, defaultColor = '#38bdf8'): string => {
  if (colorNum === undefined || colorNum === null) return defaultColor;
  if (typeof colorNum === 'string') {
    if (colorNum.startsWith('#')) return colorNum;
    const parsed = parseInt(colorNum, 16);
    if (!isNaN(parsed)) return '#' + parsed.toString(16).padStart(6, '0');
    return defaultColor;
  }
  if (typeof colorNum === 'number' && colorNum > 255) {
    const hex = (colorNum & 0xFFFFFF).toString(16).padStart(6, '0');
    return `#${hex}`;
  }
  const aci = Math.abs(Math.round(Number(colorNum)));
  const baseAci: Record<number, string> = {
    1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff',
    5: '#0000ff', 6: '#ff00ff', 7: '#ffffff', 8: '#7f7f7f', 9: '#c0c0c0',
  };
  return baseAci[aci] || defaultColor;
};

const DEMGenerator: React.FC<DEMGeneratorProps> = ({
  dxfData,
  setDxfData,
  layers,
  setLayers,
  crs,
  setCrs,
  dxfFileName,
  setDxfFileName,
  onTransferToSimulation
}) => {
  const [mobileTab, setMobileTab] = useState<'controls' | 'preview'>('controls');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const [cellSize, setCellSize] = useState<number>(2.0);
  const [showContours, setShowContours] = useState<boolean>(true);
  const [contourInterval, setContourInterval] = useState<number>(5);

  const [minZFilter, setMinZFilter] = useState<string>('');
  const [maxZFilter, setMaxZFilter] = useState<string>('');
  const [detectedMinZ, setDetectedMinZ] = useState<number | null>(null);
  const [detectedMaxZ, setDetectedMaxZ] = useState<number | null>(null);
  const [zeroCount, setZeroCount] = useState<number>(0);
  const [totalDetectedPoints, setTotalDetectedPoints] = useState<number>(0);
  const [nonZeroMinZ, setNonZeroMinZ] = useState<number | null>(null);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [demResult, setDemResult] = useState<DEMResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Canvas Viewport Transforms
  const demCanvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  const activeLayers = layers.filter(l => l.visible);
  const activeLayerNames = new Set(activeLayers.map(l => l.name));

  // Detect Z statistics from active layers
  useEffect(() => {
    if (!dxfData) {
      setDetectedMinZ(null);
      setDetectedMaxZ(null);
      setZeroCount(0);
      setTotalDetectedPoints(0);
      setNonZeroMinZ(null);
      return;
    }

    const points = extractPointsFromDXF(dxfData, activeLayerNames);
    if (points.length === 0) {
      setDetectedMinZ(null);
      setDetectedMaxZ(null);
      setZeroCount(0);
      setTotalDetectedPoints(0);
      setNonZeroMinZ(null);
      return;
    }

    let minZ = Infinity;
    let maxZ = -Infinity;
    let posMinZ = Infinity;
    let zeros = 0;

    points.forEach(p => {
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
      if (Math.abs(p.z) < 1e-3) {
        zeros++;
      } else if (p.z > 0 && p.z < posMinZ) {
        posMinZ = p.z;
      }
    });

    setDetectedMinZ(minZ === Infinity ? null : minZ);
    setDetectedMaxZ(maxZ === -Infinity ? null : maxZ);
    setZeroCount(zeros);
    setTotalDetectedPoints(points.length);
    setNonZeroMinZ(posMinZ === Infinity ? null : posMinZ);
  }, [dxfData, layers]);

  // Render canvas whenever DEM result or contour settings change
  useEffect(() => {
    if (demResult && demCanvasRef.current) {
      renderDEMToCanvas(demCanvasRef.current, demResult, showContours, contourInterval);
    }
  }, [demResult, showContours, contourInterval]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setUploadMessage(`Dosya seçildi: ${file.name}`);
  };

  const handleParseDXF = async () => {
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
          setDxfFileName(pendingFile.name);

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
          setUploadMessage(`Ayrıştırma başarılı! ${extractedLayers.length} katman bulundu.`);
        } catch (err: any) {
          setUploadMessage(`Ayrıştırma hatası: ${err.message || 'Geçersiz DXF'}`);
        } finally {
          setIsParsing(false);
        }
      };
      reader.readAsText(pendingFile);
    } catch (err: any) {
      setUploadMessage(`Hata: ${err.message}`);
      setIsParsing(false);
    }
  };

  const toggleLayer = (layerName: string) => {
    setLayers(prev => prev.map(l => l.name === layerName ? { ...l, visible: !l.visible } : l));
  };

  const handleGenerateDEM = async () => {
    if (!dxfData) {
      setErrorMsg('Lütfen önce geçerli bir DXF dosyası yükleyin.');
      return;
    }

    setIsGenerating(true);
    setErrorMsg(null);
    setDemResult(null);

    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      let points = extractPointsFromDXF(dxfData, activeLayerNames);

      // Apply Min Z & Max Z Filter
      if (minZFilter.trim() !== '' && !isNaN(Number(minZFilter))) {
        const minVal = Number(minZFilter);
        points = points.filter(p => p.z >= minVal);
      }
      if (maxZFilter.trim() !== '' && !isNaN(Number(maxZFilter))) {
        const maxVal = Number(maxZFilter);
        points = points.filter(p => p.z <= maxVal);
      }

      if (points.length < 3) {
        throw new Error(
          `Seçili katmanlarda ve uygulanan Z filtresine (${minZFilter || '-∞'}m - ${maxZFilter || '+∞'}m) uyan en az 3 adet 3D nokta bulunamadı.`
        );
      }

      const result = generateTINDEM(points, cellSize);
      setDemResult(result);

      // Auto contour interval calculation
      const range = result.maxZ - result.minZ;
      if (range > 100) setContourInterval(20);
      else if (range > 50) setContourInterval(10);
      else if (range > 10) setContourInterval(5);
      else setContourInterval(1);

      // Automatically switch to preview tab on mobile
      setMobileTab('preview');
      setZoom(1);
      setPan({ x: 0, y: 0 });

    } catch (err: any) {
      console.error('DEM Generation Error:', err);
      setErrorMsg(err.message || 'DEM üretilirken beklenmeyen bir hata oluştu.');
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadCanvasImage = () => {
    if (!demCanvasRef.current) return;
    const link = document.createElement('a');
    link.download = `DEM_Haritasi_${cellSize}m.png`;
    link.href = demCanvasRef.current.toDataURL('image/png');
    link.click();
  };

  // Canvas Pan & Zoom Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsPanning(true);
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
  };

  const handleMouseUp = () => setIsPanning(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    setZoom(prev => Math.min(Math.max(0.5, prev * zoomFactor), 8));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden space-y-2 sm:space-y-3">
      
      {/* Mobile Tab Switcher */}
      <div className="lg:hidden flex items-center bg-slate-900 border border-slate-800 p-1 rounded-xl shrink-0">
        <button
          onClick={() => setMobileTab('controls')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            mobileTab === 'controls' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Sliders size={14} />
          <span>Ayarlar & Katmanlar</span>
        </button>
        <button
          onClick={() => setMobileTab('preview')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            mobileTab === 'preview' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Mountain size={14} />
          <span>DEM Haritası {demResult && '✓'}</span>
        </button>
      </div>

      {/* Main Grid: 1/4 Left Controls Sidebar (3/12) & 3/4 Right Main Viewer (9/12) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-h-0 overflow-hidden">
        
        {/* LEFT COLUMN: Controls & Parameters (1/4 Layout = lg:col-span-3) */}
        <div className={`lg:col-span-3 flex flex-col h-full min-h-0 space-y-2.5 overflow-hidden ${
          mobileTab === 'controls' ? 'flex' : 'hidden lg:flex'
        }`}>
          
          {/* Card 1: DXF Dosya Yükleme veya Aktif Dosya Bilgisi */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 shrink-0 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <FileCode size={14} className="text-cyan-400" />
                1. DXF Dosya Kaynağı
              </h3>
              {dxfFileName && (
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-mono border border-emerald-500/30">
                  Yüklendi
                </span>
              )}
            </div>

            {dxfData ? (
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Dosya:</span>
                  <span className="text-white font-mono font-bold truncate max-w-[150px]">{dxfFileName || 'CAD_Map.dxf'}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Projeksiyon:</span>
                  <span className="text-cyan-400 font-mono font-bold">{crs}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Aktif Katman:</span>
                  <span className="text-emerald-400 font-bold">{activeLayers.length} / {layers.length}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="border-2 border-dashed border-slate-700 hover:border-cyan-500/60 bg-slate-950/60 rounded-xl p-3 text-center cursor-pointer block transition-colors">
                  <Upload size={20} className="mx-auto text-slate-400 mb-1" />
                  <span className="text-xs text-slate-300 font-medium block">.dxf Dosyası Seçin</span>
                  <span className="text-[10px] text-slate-500 block">CAD / GIS Harita Verisi</span>
                  <input type="file" accept=".dxf" onChange={handleFileUpload} className="hidden" />
                </label>

                {pendingFile && (
                  <button
                    onClick={handleParseDXF}
                    disabled={isParsing}
                    className="w-full py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20"
                  >
                    {isParsing ? <RefreshCw size={13} className="animate-spin" /> : <Eye size={13} />}
                    <span>{isParsing ? 'Ayrıştırılıyor...' : 'DXF Ayrıştır'}</span>
                  </button>
                )}

                {uploadMessage && (
                  <div className="text-[10px] p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
                    {uploadMessage}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Card 2: Katman Yöneticisi */}
          {dxfData && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 flex flex-col flex-1 min-h-0 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between mb-2 shrink-0">
                <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Layers size={13} className="text-cyan-400" />
                  2. Kullanılacak Katmanlar
                </h3>
                <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                  {layers.length} Katman
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1 pr-1 min-h-0 custom-scrollbar">
                {layers.map((l, idx) => (
                  <div key={idx} className="flex items-center justify-between p-1.5 rounded-xl bg-slate-800/50 border border-slate-750">
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span 
                        className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20 shadow-sm" 
                        style={{ backgroundColor: getAciColor(l.color) }}
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
                ))}
              </div>
            </div>
          )}

          {/* Card 3: Kot (Z) Yükseklik Filtresi & İstatistikleri */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 shrink-0 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Sliders size={13} className="text-cyan-400" />
                3. Kot (Z) Yükseklik Filtresi
              </label>
              {(minZFilter || maxZFilter) && (
                <button
                  onClick={() => { setMinZFilter(''); setMaxZFilter(''); }}
                  className="text-[10px] text-cyan-400 hover:underline font-mono"
                >
                  Filtreyi Temizle
                </button>
              )}
            </div>

            {/* Detected Stats Info Box */}
            {dxfData && detectedMinZ !== null && detectedMaxZ !== null && (
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Aktif Katman Kotları:</span>
                  <span className="font-mono font-bold text-cyan-300">
                    {detectedMinZ.toFixed(1)}m — {detectedMaxZ.toFixed(1)}m
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>Toplam Nokta: <strong className="text-slate-200">{totalDetectedPoints}</strong></span>
                  {zeroCount > 0 && (
                    <span className="text-amber-400 font-medium">Kot 0 olan: {zeroCount} nokta</span>
                  )}
                </div>

                {zeroCount > 0 && nonZeroMinZ !== null && (
                  <button
                    onClick={() => {
                      setMinZFilter(String(Math.floor(nonZeroMinZ)));
                    }}
                    className="w-full mt-1 py-1 px-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-all"
                  >
                    <span>⚡ Sıfır (0m) Kotları Filtrele (Min {Math.floor(nonZeroMinZ)}m Yap)</span>
                  </button>
                )}
              </div>
            )}

            {/* Min Z & Max Z Input Fields */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-400 block">Min Kot Z (m)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    placeholder={detectedMinZ !== null ? String(detectedMinZ.toFixed(1)) : 'Min'}
                    value={minZFilter}
                    onChange={(e) => setMinZFilter(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 text-xs text-white px-2 py-1.5 rounded-xl outline-none font-mono"
                  />
                  {minZFilter && (
                    <button 
                      onClick={() => setMinZFilter('')} 
                      className="absolute right-2 top-1.5 text-slate-500 hover:text-white text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-medium text-slate-400 block">Max Kot Z (m)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    placeholder={detectedMaxZ !== null ? String(detectedMaxZ.toFixed(1)) : 'Max'}
                    value={maxZFilter}
                    onChange={(e) => setMaxZFilter(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 text-xs text-white px-2 py-1.5 rounded-xl outline-none font-mono"
                  />
                  {maxZFilter && (
                    <button 
                      onClick={() => setMaxZFilter('')} 
                      className="absolute right-2 top-1.5 text-slate-500 hover:text-white text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Çözünürlük (Cell Size) Seçici */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 shrink-0 shadow-sm space-y-2">
            <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Grid size={13} className="text-cyan-400" />
              4. Grid Çözünürlüğü (Cell Size)
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-1.5">
              {CELL_SIZES.map((cs) => (
                <button
                  key={cs.value}
                  onClick={() => setCellSize(cs.value)}
                  className={`p-2 rounded-xl border text-left transition-all ${
                    cellSize === cs.value
                      ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="text-xs font-bold flex items-center justify-between">
                    <span>{cs.value}m</span>
                    {cellSize === cs.value && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
                  </div>
                  <div className="text-[9px] text-slate-400 truncate mt-0.5">
                    {cs.label.split('(')[1]?.replace(')', '') || ''}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Card 5: DEM Oluştur Butonu */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 shrink-0 shadow-sm space-y-2">
            <button
              onClick={handleGenerateDEM}
              disabled={isGenerating || !dxfData || activeLayers.length === 0}
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg ${
                isGenerating || !dxfData || activeLayers.length === 0
                  ? 'bg-slate-800 text-slate-500 border border-slate-750 cursor-not-allowed'
                  : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-cyan-500/25 border border-cyan-300 cursor-pointer'
              }`}
            >
              {isGenerating ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>TIN DEM Hesaplanıyor...</span>
                </>
              ) : (
                <>
                  <Play size={14} className="fill-current" />
                  <span>Sayısal Yükseklik Modeli Üret</span>
                </>
              )}
            </button>

            {errorMsg && (
              <div className="p-2 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-[11px] flex items-center gap-1.5">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: DEM Map Viewer & Results Panel (3/4 Layout = lg:col-span-9) */}
        <div className={`lg:col-span-9 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden flex flex-col relative shadow-inner h-full min-h-0 ${
          mobileTab === 'preview' ? 'flex' : 'hidden lg:flex'
        }`}>
          
          {/* Viewer Toolbar Header */}
          <div className="px-3.5 py-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between z-10 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                Topoğrafik Yükseklik Haritası
                {demResult && (
                  <span className="text-[10px] bg-cyan-500/15 text-cyan-300 px-2 py-0.5 rounded-md font-mono border border-cyan-500/30">
                    TIN Surface ({demResult.cols}x{demResult.rows})
                  </span>
                )}
              </h3>
            </div>

            <div className="flex items-center gap-3">
              {demResult && (
                <div className="flex items-center gap-2.5 border-r border-slate-800 pr-3">
                  <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={showContours} 
                      onChange={(e) => setShowContours(e.target.checked)}
                      className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                    />
                    <span>İzohips Eğrileri</span>
                  </label>

                  {showContours && (
                    <select
                      value={contourInterval}
                      onChange={(e) => setContourInterval(Number(e.target.value))}
                      className="bg-slate-900 border border-slate-700 text-[11px] text-white px-2 py-0.5 rounded-lg focus:outline-none focus:border-cyan-500"
                    >
                      <option value={1}>1m Aralık</option>
                      <option value={2}>2m Aralık</option>
                      <option value={5}>5m Aralık</option>
                      <option value={10}>10m Aralık</option>
                      <option value={25}>25m Aralık</option>
                    </select>
                  )}
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <div className="bg-slate-900 px-2 py-1 rounded-lg border border-slate-750 text-[11px] font-mono text-cyan-400 flex items-center gap-1">
                  <ZoomIn size={12} />
                  <span>{Math.round(zoom * 100)}%</span>
                </div>
                <button
                  onClick={resetView}
                  disabled={!demResult}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg transition-colors"
                  title="Görünümü Sıfırla"
                >
                  <RotateCcw size={13} />
                </button>
              </div>
            </div>
          </div>

          {/* Canvas Display Body */}
          <div className="flex-1 relative w-full h-full min-h-0 bg-slate-950 flex items-center justify-center overflow-hidden">
            
            {demResult ? (
              <div 
                className="relative w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing p-4"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
              >
                <div 
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transition: isPanning ? 'none' : 'transform 0.1s ease-out',
                  }}
                  className="max-w-full max-h-full flex items-center justify-center"
                >
                  <canvas 
                    ref={demCanvasRef} 
                    className="max-w-full max-h-[65vh] object-contain rounded-xl shadow-2xl border border-slate-800"
                  />
                </div>

                {/* Color Elevation Legend Overlay Bar */}
                <div className="absolute bottom-3 left-3 right-3 bg-slate-950/90 border border-slate-800 backdrop-blur-md rounded-xl p-2.5 shadow-xl space-y-1 max-w-lg mx-auto pointer-events-none">
                  <div className="h-2.5 rounded-full w-full bg-gradient-to-r from-[#10b981] via-[#a3e635] via-[#eab308] via-[#b45309] to-[#ffffff] border border-white/10" />
                  <div className="flex justify-between text-[10px] text-slate-300 font-mono">
                    <span className="text-emerald-400 font-bold">{demResult.minZ.toFixed(1)} m (Düşük)</span>
                    <span className="text-amber-300">{(demResult.minZ + (demResult.maxZ - demResult.minZ) / 2).toFixed(1)} m</span>
                    <span className="text-white font-bold">{demResult.maxZ.toFixed(1)} m (Yüksek)</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-3 p-6 text-center">
                <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-400 shadow-xl">
                  <Mountain size={32} />
                </div>
                <div className="space-y-1 max-w-sm">
                  <p className="text-sm font-semibold text-slate-300">Sayısal Yükseklik Modeli Hazır</p>
                  <p className="text-xs text-slate-500">
                    Sol taraftaki panelden çözünürlüğü seçip &apos;Sayısal Yükseklik Modeli Üret&apos; butonuna basarak 3D arazi yüzeyinizi oluşturabilirsiniz.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Results & Export Footer Bar */}
          {demResult && (
            <div className="p-3 bg-slate-950/90 border-t border-slate-800 shrink-0 space-y-2.5">
              
              {/* Statistic Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2">
                  <p className="text-[9px] text-slate-400 font-medium">Minimum Kot (Z-Min)</p>
                  <p className="text-xs font-bold text-emerald-400 font-mono mt-0.5">{demResult.minZ.toFixed(2)} m</p>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2">
                  <p className="text-[9px] text-slate-400 font-medium">Maksimum Kot (Z-Max)</p>
                  <p className="text-xs font-bold text-amber-400 font-mono mt-0.5">{demResult.maxZ.toFixed(2)} m</p>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2">
                  <p className="text-[9px] text-slate-400 font-medium">Ortalama Kot (Z-Ort)</p>
                  <p className="text-xs font-bold text-cyan-400 font-mono mt-0.5">{demResult.meanZ.toFixed(2)} m</p>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2">
                  <p className="text-[9px] text-slate-400 font-medium">Matris Çözünürlüğü</p>
                  <p className="text-xs font-bold text-slate-200 font-mono mt-0.5">{demResult.cols} x {demResult.rows}</p>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2">
                  <p className="text-[9px] text-slate-400 font-medium">Nokta Sayısı</p>
                  <p className="text-xs font-bold text-purple-400 font-mono mt-0.5">{demResult.pointCount}</p>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-2">
                  <p className="text-[9px] text-slate-400 font-medium">TIN Üçgen Sayısı</p>
                  <p className="text-xs font-bold text-indigo-400 font-mono mt-0.5">{demResult.triangleCount}</p>
                </div>
              </div>

              {/* Export Buttons */}
              <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-slate-850">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => exportDEMToASC(demResult, `DEM_${cellSize}m.asc`)}
                    className="px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <FileText size={13} />
                    <span>ESRI ASCII (.asc) İndir</span>
                  </button>

                  <button
                    onClick={() => exportDEMToCSV(demResult, `DEM_points_${cellSize}m.csv`)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <BarChart2 size={13} />
                    <span>CSV Noktaları</span>
                  </button>

                  <button
                    onClick={downloadCanvasImage}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Eye size={13} />
                    <span>PNG Görseli</span>
                  </button>
                </div>

                {onTransferToSimulation && (
                  <button
                    onClick={() => {
                      // Format to ASC text string
                      const lines: string[] = [
                        `ncols         ${demResult.cols}`,
                        `nrows         ${demResult.rows}`,
                        `xllcorner     ${demResult.minX.toFixed(3)}`,
                        `yllcorner     ${demResult.minY.toFixed(3)}`,
                        `cellsize      ${demResult.cellSize}`,
                        `NODATA_value  -9999`
                      ];
                      for (let r = demResult.rows - 1; r >= 0; r--) {
                        const rowVals: string[] = [];
                        for (let c = 0; c < demResult.cols; c++) {
                          const val = demResult.grid[r * demResult.cols + c];
                          rowVals.push(isNaN(val) ? '-9999' : val.toFixed(2));
                        }
                        lines.push(rowVals.join(' '));
                      }
                      onTransferToSimulation(demResult, lines.join('\n'));
                    }}
                    className="px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-slate-950 font-bold text-xs rounded-lg flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                  >
                    <Droplets size={14} />
                    <span>Taşkın Simülasyonunda Kullan</span>
                    <ArrowRight size={13} />
                  </button>
                )}
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};

export default DEMGenerator;
