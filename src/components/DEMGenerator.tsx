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

  // Global & Web Standard Systems
  { code: 'EPSG:4326', name: 'WGS 84 (Coğrafi - Global)', def: '+proj=longlat +datum=WGS84 +no_defs' },
  { code: 'EPSG:3857', name: 'WGS 84 / Pseudo-Mercator (Web Mercator)', def: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs' },
  
  // Turkey TUREF / TM (3-Degree)
  { code: 'EPSG:5253', name: 'TUREF / TM27 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=27 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5254', name: 'TUREF / TM30 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=30 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5255', name: 'TUREF / TM33 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=33 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5256', name: 'TUREF / TM36 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=36 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5257', name: 'TUREF / TM39 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=39 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5258', name: 'TUREF / TM42 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=42 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5259', name: 'TUREF / TM45 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=45 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },

  // WGS 84 / UTM Northern Hemisphere (6-Degree)
  { code: 'EPSG:32635', name: 'WGS 84 / UTM Zone 35N (6°)', def: '+proj=utm +zone=35 +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32636', name: 'WGS 84 / UTM Zone 36N (6°)', def: '+proj=utm +zone=36 +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32637', name: 'WGS 84 / UTM Zone 37N (6°)', def: '+proj=utm +zone=37 +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32638', name: 'WGS 84 / UTM Zone 38N (6°)', def: '+proj=utm +zone=38 +datum=WGS84 +units=m +no_defs' },

  // ED50 (European Datum 1950) 3-Degree (TM)
  { code: 'EPSG:5220', name: 'ED50 / TM27 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=27 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5221', name: 'ED50 / TM30 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=30 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5222', name: 'ED50 / TM33 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=33 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5223', name: 'ED50 / TM36 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=36 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5224', name: 'ED50 / TM39 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=39 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5225', name: 'ED50 / TM42 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=42 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5226', name: 'ED50 / TM45 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=45 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },

  // ED50 (European Datum 1950) 6-Degree (UTM)
  { code: 'EPSG:23035', name: 'ED50 / UTM Zone 35N (6°)', def: '+proj=utm +zone=35 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:23036', name: 'ED50 / UTM Zone 36N (6°)', def: '+proj=utm +zone=36 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:23037', name: 'ED50 / UTM Zone 37N (6°)', def: '+proj=utm +zone=37 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:23038', name: 'ED50 / UTM Zone 38N (6°)', def: '+proj=utm +zone=38 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
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

  // Render canvas whenever DEM result changes
  useEffect(() => {
    if (demResult && demCanvasRef.current) {
      renderDEMToCanvas(demCanvasRef.current, demResult);
    }
  }, [demResult]);

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
      <div className="lg:hidden flex items-center bg-white border border-slate-300 p-1 rounded-xl shrink-0 shadow-sm">
        <button
          onClick={() => setMobileTab('controls')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            mobileTab === 'controls' ? 'bg-cyan-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sliders size={14} />
          <span>Ayarlar & Katmanlar</span>
        </button>
        <button
          onClick={() => setMobileTab('preview')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            mobileTab === 'preview' ? 'bg-cyan-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
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
          <div className="bg-white border border-slate-300 rounded-2xl p-3 shrink-0 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <FileCode size={14} className="text-cyan-700" />
                1. DXF Dosya Kaynağı
              </h3>
              {dxfFileName && (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-mono font-bold border border-emerald-300">
                  Yüklendi
                </span>
              )}
            </div>

            {dxfData ? (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium">Dosya:</span>
                  <span className="text-slate-900 font-mono font-bold truncate max-w-[150px]">{dxfFileName || 'CAD_Map.dxf'}</span>
                </div>

                {/* CRS Selection Dropdown */}
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-600 font-semibold block">Koordinat Sistemi (CRS):</label>
                  <select
                    value={crs || 'NONE'}
                    onChange={(e) => setCrs(e.target.value)}
                    className="w-full bg-white border border-slate-300 focus:border-cyan-600 rounded-xl px-2 py-1.5 text-xs font-bold text-cyan-900 outline-none cursor-pointer transition-all shadow-sm"
                  >
                    <option value="NONE" className="bg-white text-slate-900">Seçilmedi (Yerel Koordinat)</option>
                    <optgroup label="TUREF / TM (3° - Türkiye)">
                      {CRS_LIST.filter(c => c.code.startsWith('EPSG:525')).map(item => (
                        <option key={item.code} value={item.code} className="bg-white text-slate-900">
                          {item.code} - {item.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="ED50 / TM (3° - Türkiye)">
                      {CRS_LIST.filter(c => c.code.startsWith('EPSG:522')).map(item => (
                        <option key={item.code} value={item.code} className="bg-white text-slate-900">
                          {item.code} - {item.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="WGS 84 / UTM (6° - Türkiye & Bölgesel)">
                      {CRS_LIST.filter(c => ['EPSG:32635', 'EPSG:32636', 'EPSG:32637', 'EPSG:32638'].includes(c.code)).map(item => (
                        <option key={item.code} value={item.code} className="bg-white text-slate-900">
                          {item.code} - {item.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="ED50 / UTM (6° - Türkiye & Bölgesel)">
                      {CRS_LIST.filter(c => ['EPSG:23035', 'EPSG:23036', 'EPSG:23037', 'EPSG:23038'].includes(c.code)).map(item => (
                        <option key={item.code} value={item.code} className="bg-white text-slate-900">
                          {item.code} - {item.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Global & Standartlar">
                      {CRS_LIST.filter(c => ['EPSG:4326', 'EPSG:3857'].includes(c.code)).map(item => (
                        <option key={item.code} value={item.code} className="bg-white text-slate-900">
                          {item.code} - {item.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200">
                  <span className="text-slate-600 font-medium">Aktif Katman:</span>
                  <span className="text-emerald-700 font-bold">{activeLayers.length} / {layers.length}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="border-2 border-dashed border-slate-300 hover:border-cyan-600 bg-slate-50 hover:bg-slate-100/80 rounded-xl p-3 text-center cursor-pointer block transition-colors shadow-sm">
                  <Upload size={20} className="mx-auto text-slate-500 mb-1" />
                  <span className="text-xs text-slate-800 font-bold block">.dxf Dosyası Seçin</span>
                  <span className="text-[10px] text-slate-500 block">CAD / GIS Harita Verisi</span>
                  <input type="file" accept=".dxf" onChange={handleFileUpload} className="hidden" />
                </label>

                {pendingFile && (
                  <button
                    onClick={handleParseDXF}
                    disabled={isParsing}
                    className="w-full py-2 bg-cyan-700 hover:bg-cyan-800 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    {isParsing ? <RefreshCw size={13} className="animate-spin" /> : <Eye size={13} />}
                    <span>{isParsing ? 'Ayrıştırılıyor...' : 'DXF Ayrıştır'}</span>
                  </button>
                )}

                {uploadMessage && (
                  <div className="text-[10px] p-2 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 font-medium">
                    {uploadMessage}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Card 2: Katman Yöneticisi */}
          {dxfData && (
            <div className="bg-white border border-slate-300 rounded-2xl p-3 flex flex-col flex-1 min-h-0 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between mb-2 shrink-0">
                <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Layers size={13} className="text-cyan-700" />
                  2. Kullanılacak Katmanlar
                </h3>
                <span className="text-[10px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full font-semibold border border-slate-200">
                  {layers.length} Katman
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1 pr-1 min-h-0 custom-scrollbar">
                {layers.map((l, idx) => (
                  <div key={idx} className="flex items-center justify-between p-1.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span 
                        className="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-300 shadow-sm" 
                        style={{ backgroundColor: getAciColor(l.color) }}
                      />
                      <span className="text-xs text-slate-800 font-semibold truncate">{l.name}</span>
                    </div>
                    <button
                      onClick={() => toggleLayer(l.name)}
                      className={`w-8 h-4 rounded-full relative transition-colors shrink-0 ${l.visible ? 'bg-cyan-600' : 'bg-slate-300'}`}
                    >
                      <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all shadow-sm ${l.visible ? 'left-[18px]' : 'left-0.5'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Card 3: Kot (Z) Yükseklik Filtresi & İstatistikleri */}
          <div className="bg-white border border-slate-300 rounded-2xl p-3 shrink-0 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Sliders size={13} className="text-cyan-700" />
                3. Kot (Z) Yükseklik Filtresi
              </label>
              {(minZFilter || maxZFilter) && (
                <button
                  onClick={() => { setMinZFilter(''); setMaxZFilter(''); }}
                  className="text-[10px] text-cyan-700 hover:underline font-mono font-bold"
                >
                  Filtreyi Temizle
                </button>
              )}
            </div>

            {/* Detected Stats Info Box */}
            {dxfData && detectedMinZ !== null && detectedMaxZ !== null && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600 font-medium">Aktif Katman Kotları:</span>
                  <span className="font-mono font-bold text-cyan-800">
                    {detectedMinZ.toFixed(1)}m — {detectedMaxZ.toFixed(1)}m
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-600">
                  <span>Toplam Nokta: <strong className="text-slate-900">{totalDetectedPoints}</strong></span>
                  {zeroCount > 0 && (
                    <span className="text-amber-700 font-bold">Kot 0 olan: {zeroCount} nokta</span>
                  )}
                </div>

                {zeroCount > 0 && nonZeroMinZ !== null && (
                  <button
                    onClick={() => {
                      setMinZFilter(String(Math.floor(nonZeroMinZ)));
                    }}
                    className="w-full mt-1 py-1 px-2 bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-900 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-all"
                  >
                    <span>⚡ Sıfır (0m) Kotları Filtrele (Min {Math.floor(nonZeroMinZ)}m Yap)</span>
                  </button>
                )}
              </div>
            )}

            {/* Min Z & Max Z Input Fields */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-600 block">Min Kot Z (m)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    placeholder={detectedMinZ !== null ? String(detectedMinZ.toFixed(1)) : 'Min'}
                    value={minZFilter}
                    onChange={(e) => setMinZFilter(e.target.value)}
                    className="w-full bg-white border border-slate-300 focus:border-cyan-600 text-xs text-slate-900 px-2 py-1.5 rounded-xl outline-none font-mono shadow-sm"
                  />
                  {minZFilter && (
                    <button 
                      onClick={() => setMinZFilter('')} 
                      className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-700 text-xs font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-600 block">Max Kot Z (m)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    placeholder={detectedMaxZ !== null ? String(detectedMaxZ.toFixed(1)) : 'Max'}
                    value={maxZFilter}
                    onChange={(e) => setMaxZFilter(e.target.value)}
                    className="w-full bg-white border border-slate-300 focus:border-cyan-600 text-xs text-slate-900 px-2 py-1.5 rounded-xl outline-none font-mono shadow-sm"
                  />
                  {maxZFilter && (
                    <button 
                      onClick={() => setMaxZFilter('')} 
                      className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-700 text-xs font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Çözünürlük (Cell Size) Seçici */}
          <div className="bg-white border border-slate-300 rounded-2xl p-3 shrink-0 shadow-sm space-y-2">
            <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Grid size={13} className="text-cyan-700" />
              4. Grid Çözünürlüğü (Cell Size)
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-1.5">
              {CELL_SIZES.map((cs) => (
                <button
                  key={cs.value}
                  onClick={() => setCellSize(cs.value)}
                  className={`p-2 rounded-xl border text-left transition-all ${
                    cellSize === cs.value
                      ? 'bg-cyan-100 border-cyan-500 text-cyan-900 font-bold shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="text-xs font-bold flex items-center justify-between">
                    <span>{cs.value}m</span>
                    {cellSize === cs.value && <div className="w-1.5 h-1.5 rounded-full bg-cyan-700" />}
                  </div>
                  <div className="text-[9px] text-slate-500 truncate mt-0.5">
                    {cs.label.split('(')[1]?.replace(')', '') || ''}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Card 5: DEM Oluştur Butonu */}
          <div className="bg-white border border-slate-300 rounded-2xl p-3 shrink-0 shadow-sm space-y-2">
            <button
              onClick={handleGenerateDEM}
              disabled={isGenerating || !dxfData || activeLayers.length === 0}
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm ${
                isGenerating || !dxfData || activeLayers.length === 0
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : 'bg-gradient-to-r from-cyan-700 via-blue-700 to-cyan-800 hover:from-cyan-800 hover:to-blue-800 text-white shadow-md border border-cyan-600 cursor-pointer'
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
              <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-[11px] font-semibold flex items-center gap-1.5">
                <AlertTriangle size={14} className="shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: DEM Map Viewer & Results Panel (3/4 Layout = lg:col-span-9) */}
        <div className={`lg:col-span-9 bg-white border border-slate-300 rounded-2xl overflow-hidden flex flex-col relative shadow-sm h-full min-h-0 ${
          mobileTab === 'preview' ? 'flex' : 'hidden lg:flex'
        }`}>
          
          {/* Viewer Toolbar Header */}
          <div className="px-3.5 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between z-10 shrink-0 text-white">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                Topoğrafik Yükseklik Haritası
                {demResult && (
                  <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-md font-mono border border-cyan-500/30">
                    TIN Surface ({demResult.cols}x{demResult.rows})
                  </span>
                )}
              </h3>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="bg-slate-800 px-2 py-1 rounded-lg border border-slate-700 text-[11px] font-mono text-cyan-300 flex items-center gap-1">
                <ZoomIn size={12} />
                <span>{Math.round(zoom * 100)}%</span>
              </div>
              <button
                onClick={resetView}
                disabled={!demResult}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg transition-colors cursor-pointer"
                title="Görünümü Sıfırla"
              >
                <RotateCcw size={13} />
              </button>
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
                <div className="absolute bottom-3 left-3 right-3 bg-slate-900/90 border border-slate-700 backdrop-blur-md rounded-xl p-2.5 shadow-xl space-y-1 max-w-lg mx-auto pointer-events-none">
                  <div className="h-2.5 rounded-full w-full bg-gradient-to-r from-[#10b981] via-[#a3e635] via-[#eab308] via-[#b45309] to-[#ffffff] border border-white/10" />
                  <div className="flex justify-between text-[10px] text-slate-200 font-mono">
                    <span className="text-emerald-400 font-bold">{demResult.minZ.toFixed(1)} m (Düşük)</span>
                    <span className="text-amber-300">{(demResult.minZ + (demResult.maxZ - demResult.minZ) / 2).toFixed(1)} m</span>
                    <span className="text-white font-bold">{demResult.maxZ.toFixed(1)} m (Yüksek)</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-3 p-6 text-center">
                <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-400 shadow-xl">
                  <Mountain size={32} />
                </div>
                <div className="space-y-1 max-w-sm">
                  <p className="text-sm font-semibold text-slate-200">Sayısal Yükseklik Modeli Hazır</p>
                  <p className="text-xs text-slate-400">
                    Sol taraftaki panelden çözünürlüğü seçip &apos;Sayısal Yükseklik Modeli Üret&apos; butonuna basarak 3D arazi yüzeyinizi oluşturabilirsiniz.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Results & Export Footer Bar */}
          {demResult && (
            <div className="p-3 bg-slate-50 border-t border-slate-300 shrink-0 space-y-2.5">
              
              {/* Statistic Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <div className="bg-white border border-slate-300 rounded-xl p-2 shadow-sm">
                  <p className="text-[9px] text-slate-500 font-bold uppercase">Minimum Kot (Z-Min)</p>
                  <p className="text-xs font-bold text-emerald-700 font-mono mt-0.5">{demResult.minZ.toFixed(2)} m</p>
                </div>

                <div className="bg-white border border-slate-300 rounded-xl p-2 shadow-sm">
                  <p className="text-[9px] text-slate-500 font-bold uppercase">Maksimum Kot (Z-Max)</p>
                  <p className="text-xs font-bold text-amber-700 font-mono mt-0.5">{demResult.maxZ.toFixed(2)} m</p>
                </div>

                <div className="bg-white border border-slate-300 rounded-xl p-2 shadow-sm">
                  <p className="text-[9px] text-slate-500 font-bold uppercase">Ortalama Kot (Z-Ort)</p>
                  <p className="text-xs font-bold text-cyan-700 font-mono mt-0.5">{demResult.meanZ.toFixed(2)} m</p>
                </div>

                <div className="bg-white border border-slate-300 rounded-xl p-2 shadow-sm">
                  <p className="text-[9px] text-slate-500 font-bold uppercase">Matris Çözünürlüğü</p>
                  <p className="text-xs font-bold text-slate-800 font-mono mt-0.5">{demResult.cols} x {demResult.rows}</p>
                </div>

                <div className="bg-white border border-slate-300 rounded-xl p-2 shadow-sm">
                  <p className="text-[9px] text-slate-500 font-bold uppercase">Nokta Sayısı</p>
                  <p className="text-xs font-bold text-purple-700 font-mono mt-0.5">{demResult.pointCount}</p>
                </div>

                <div className="bg-white border border-slate-300 rounded-xl p-2 shadow-sm">
                  <p className="text-[9px] text-slate-500 font-bold uppercase">TIN Üçgen Sayısı</p>
                  <p className="text-xs font-bold text-indigo-700 font-mono mt-0.5">{demResult.triangleCount}</p>
                </div>
              </div>

              {/* Export Buttons */}
              <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-slate-200">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => exportDEMToASC(demResult, `DEM_${cellSize}m.asc`)}
                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  >
                    <FileText size={13} />
                    <span>ESRI ASCII (.asc) İndir</span>
                  </button>

                  <button
                    onClick={() => exportDEMToCSV(demResult, `DEM_points_${cellSize}m.csv`)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  >
                    <BarChart2 size={13} />
                    <span>CSV Noktaları</span>
                  </button>

                  <button
                    onClick={downloadCanvasImage}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
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
                    className="px-3.5 py-1.5 bg-gradient-to-r from-blue-700 to-cyan-700 hover:from-blue-800 hover:to-cyan-800 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
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
