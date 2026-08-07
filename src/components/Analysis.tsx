import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  BarChart3, 
  Droplets, 
  FileText, 
  Globe, 
  MapPin, 
  Map as MapIcon, 
  Download, 
  RefreshCw, 
  Info,
  Play,
  Layers as LayersIcon,
  ArrowLeft,
  CheckCircle2,
  Sliders,
  Check,
  Compass,
  Layers,
  ChevronDown,
  Eye
} from 'lucide-react';
import { MapContainer, TileLayer, ImageOverlay, Polyline, CircleMarker, Polygon } from 'react-leaflet';
import { MapAutoCenter, MapClickHandler } from './MapHelpers';

interface AnalysisProps {
  currentStep: number;
  setCurrentStep: (step: number) => void;
  dem: any;
  setDem: (dem: any) => void;
  params: any;
  setParams: (params: any) => void;
  coords: any;
  setCoords: (coords: any) => void;
  selectedCRS: any;
  setSelectedCRS: (crs: any) => void;
  isSimulating: boolean;
  setIsSimulating: (isSimulating: boolean) => void;
  progress: number;
  setProgress: (progress: number) => void;
  waterDepth: any;
  setWaterDepth: (waterDepth: any) => void;
  outflowType: string;
  setOutflowType: (type: 'free' | 'normal') => void;
  showStats: boolean;
  setShowStats: (show: boolean) => void;
  simMethod: 'hydraulic' | 'bathtub' | null;
  setSimMethod: (method: 'hydraulic' | 'bathtub' | null) => void;
  bathtubLevel: number;
  setBathtubLevel: (level: number) => void;
  flowThreshold: number;
  setFlowThreshold: (threshold: number) => void;
  floodImage: string | null;
  setFloodImage: (image: string | null) => void;
  elevationImage: string | null;
  setElevationImage: (image: string | null) => void;
  reliefImage: string | null;
  streamImage: string | null;
  setStreamImage: (image: string | null) => void;
  viewMode: 'height' | 'slope' | 'flow';
  setViewMode: (mode: 'height' | 'slope' | 'flow') => void;
  flowAcc: any;
  setFlowAcc: (flowAcc: any) => void;
  riverKml: any;
  setRiverKml: (riverKml: any) => void;
  sourceKmlName: string | null;
  setSourceKmlName: (name: string | null) => void;
  sourceWgs: [number, number] | null;
  setSourceWgs: (wgs: [number, number] | null) => void;
  areaKml: any;
  setAreaKml: (areaKml: any) => void;
  areaMask: any;
  setAreaMask: (areaMask: any) => void;
  stats: any;
  wgs84Bounds: any;
  demBoundaryWgs?: number[][][];
  startSimulation: () => void;
  handleKmlUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSourceKmlUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAreaKmlUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleMapClick: (lat: number, lon: number) => void;
  exportToKml: () => void;
  handleDemUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  CRS_LIST: any[];
  MANNING_PRESETS: any[];
  workerRef: React.MutableRefObject<Worker | null>;
}

const BASEMAP_OPTIONS = [
  { id: 'hybrid', label: 'Uydu Hibrit (Google)', url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', attribution: '&copy; Google Maps' },
  { id: 'satellite', label: 'Uydu Saf (Google)', url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', attribution: '&copy; Google Maps' },
  { id: 'esri', label: 'Esri World Imagery', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '&copy; Esri' },
  { id: 'topo', label: 'Topografik (OpenTopo)', url: 'https://{s}.tile.opentopomap.org/{z}/{y}/{x}.png', attribution: '&copy; OpenTopoMap' },
  { id: 'street', label: 'Standart Sokak (OSM)', url: 'https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png', attribution: '&copy; OpenStreetMap' }
];

const Analysis: React.FC<AnalysisProps> = (props) => {
  const {
    currentStep, setCurrentStep, dem, params, coords, selectedCRS, setSelectedCRS,
    isSimulating, progress, bathtubLevel, setBathtubLevel, floodImage,
    elevationImage, reliefImage, riverKml, sourceKmlName,
    sourceWgs, areaKml, stats, wgs84Bounds, demBoundaryWgs, startSimulation, handleSourceKmlUpload,
    handleAreaKmlUpload, handleMapClick, exportToKml, handleDemUpload, CRS_LIST,
    setShowStats
  } = props;

  const [activeBasemap, setActiveBasemap] = useState<string>('hybrid');
  const [showBasemapMenu, setShowBasemapMenu] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<'controls' | 'map'>('controls');
  const [isFileOpened, setIsFileOpened] = useState<boolean>(false);

  const currentBasemap = BASEMAP_OPTIONS.find(b => b.id === activeBasemap) || BASEMAP_OPTIONS[0];

  const handleStartAnalysis = () => {
    if (!dem) {
      alert("Lütfen önce bir DEM (Topografya) dosyası yükleyin.");
      return;
    }
    startSimulation();
    setCurrentStep(5);
    setMobileTab('map');
  };

  const isResultPage = currentStep === 5;

  return (
    <div className="w-full h-full flex flex-col min-h-0 overflow-hidden">
      {/* ----------------- RESULT PAGE ----------------- */}
      {isResultPage ? (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full h-full flex flex-col min-h-0 space-y-2 overflow-hidden"
        >
          {/* Top Bar Action */}
          <div className="flex items-center justify-between gap-3 bg-white p-2.5 sm:p-3 rounded-2xl border border-slate-300 shadow-sm shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-cyan-100 text-cyan-800 rounded-xl">
                <BarChart3 size={18} />
              </div>
              <div>
                <h2 className="text-xs sm:text-sm font-bold text-slate-900">Taşkın Simülasyonu Sonuçları</h2>
                <p className="text-[10px] text-slate-600 hidden sm:block">Hidrolojik yükseklik modeli ve vektör sınırları üzerinde elde edilen veriler</p>
              </div>
            </div>
            <button 
              onClick={() => {
                setCurrentStep(1);
                setMobileTab('controls');
              }} 
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs border border-slate-300 transition-all flex items-center gap-1.5 shadow-sm shrink-0 cursor-pointer"
            >
              <ArrowLeft size={14} />
              <span>Düzenle</span>
            </button>
          </div>

          {/* Mobile Tab Navigation for Results (< lg screen width) */}
          <div className="flex lg:hidden bg-white border border-slate-300 rounded-xl p-1 shrink-0 shadow-sm">
            <button
              onClick={() => setMobileTab('controls')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                mobileTab === 'controls' ? 'bg-cyan-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 size={13} />
              <span>Analiz Özeti & İndir</span>
            </button>
            <button
              onClick={() => setMobileTab('map')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                mobileTab === 'map' ? 'bg-cyan-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MapIcon size={13} />
              <span>Taşkın Haritası</span>
            </button>
          </div>

          {/* Results Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 h-full min-h-0 flex-1">
            
            {/* Map Viewer */}
            <div className={`lg:col-span-9 bg-white rounded-2xl p-2 sm:p-2.5 border border-slate-300 shadow-sm relative overflow-hidden flex flex-col h-full min-h-0 ${
              mobileTab === 'map' ? 'flex' : 'hidden lg:flex'
            }`}>
              {isSimulating && (
                <div className="absolute inset-0 z-[500] bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-4">
                  <div className="p-4 bg-cyan-500/20 text-cyan-400 rounded-full">
                    <RefreshCw size={36} className="animate-spin" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Simülasyon Hesaplanıyor...</h3>
                    <p className="text-slate-400 text-xs mt-1">Hidrolojik matris üzerinde taşkın çözümleniyor</p>
                  </div>
                  <div className="w-64 bg-slate-800 rounded-full h-2.5 overflow-hidden border border-white/10">
                    <div 
                      className="bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-400 h-full transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono font-bold text-cyan-300">%{Math.round(progress)}</span>
                </div>
              )}

              {/* Basemap Picker Overlay */}
              <div className="absolute top-4 right-4 z-[400]">
                <div className="relative">
                  <button
                    onClick={() => setShowBasemapMenu(!showBasemapMenu)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900/90 hover:bg-slate-900 text-white border border-slate-700 shadow-xl backdrop-blur-md transition-all cursor-pointer"
                  >
                    <Layers size={14} className="text-cyan-400" />
                    <span>{currentBasemap.label}</span>
                  </button>

                  {showBasemapMenu && (
                    <div className="absolute right-0 mt-2 w-56 bg-slate-900/95 border border-slate-700 rounded-2xl p-2 shadow-2xl backdrop-blur-xl z-[450] space-y-1">
                      <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Altlık Harita Katmanı</div>
                      {BASEMAP_OPTIONS.map((bm) => (
                        <button
                          key={bm.id}
                          onClick={() => {
                            setActiveBasemap(bm.id);
                            setShowBasemapMenu(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                            activeBasemap === bm.id
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold'
                              : 'text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          <span>{bm.label}</span>
                          {activeBasemap === bm.id && <Check size={14} className="text-cyan-400" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 w-full h-full min-h-0 rounded-xl overflow-hidden relative">
                <MapContainer 
                  center={[coords.lat, coords.lon]} 
                  zoom={13} 
                  maxZoom={24}
                  className="w-full h-full"
                >
                  <TileLayer
                    key={currentBasemap.id}
                    url={currentBasemap.url}
                    attribution={currentBasemap.attribution}
                    maxZoom={24}
                    maxNativeZoom={20}
                  />
                  {reliefImage && wgs84Bounds && (
                    <ImageOverlay
                      url={reliefImage}
                      bounds={wgs84Bounds}
                      opacity={0.6}
                    />
                  )}
                  {floodImage && wgs84Bounds && (
                    <ImageOverlay
                      url={floodImage}
                      bounds={wgs84Bounds}
                      opacity={0.85}
                    />
                  )}
                  {riverKml && <Polyline positions={riverKml.coords} color="#3b82f6" weight={4} opacity={0.8} />}
                  {areaKml ? (
                    <Polygon positions={areaKml.coords} color="#10b981" weight={2.5} fillOpacity={0.25} />
                  ) : demBoundaryWgs && demBoundaryWgs.length > 0 ? (
                    demBoundaryWgs.map((loop, idx) => (
                      <Polygon key={idx} positions={loop.map(([lon, lat]) => [lat, lon])} color="#10b981" weight={2.5} fillOpacity={0.2} />
                    ))
                  ) : null}
                  {wgs84Bounds && <MapAutoCenter bounds={wgs84Bounds} />}
                </MapContainer>
              </div>

              {/* Map Legend Overlay */}
              <div className="absolute bottom-4 left-4 z-[400] bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-[11px] text-slate-200 border border-slate-700 shadow-xl flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 border border-blue-300 inline-block"></span>
                  <span className="text-slate-200 font-medium">Taşkın Alanı</span>
                </div>
                {areaKml && (
                  <div className="flex items-center gap-1.5 border-l border-slate-700 pl-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 border border-red-300 inline-block animate-pulse"></span>
                    <span className="text-red-300 font-bold">Riskli Alan</span>
                  </div>
                )}
                {areaKml && (
                  <div className="flex items-center gap-1.5 border-l border-slate-700 pl-2.5">
                    <span className="w-2.5 h-2.5 rounded-sm border-2 border-emerald-400 bg-emerald-500/30 inline-block"></span>
                    <span className="text-emerald-300 font-medium">İnceleme Sınırı</span>
                  </div>
                )}
              </div>
            </div>

            {/* Summary & Export */}
            <div className={`lg:col-span-3 space-y-3 overflow-y-auto h-full min-h-0 custom-scrollbar ${
              mobileTab === 'controls' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'
            }`}>
              <div className="bg-white rounded-2xl p-4 border border-slate-300 shadow-sm space-y-4">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Info size={15} className="text-cyan-700" />
                  Analiz Özeti
                </h3>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                    <p className="text-[10px] font-bold text-cyan-800 uppercase">Toplam Taşkın Alanı</p>
                    <p className="text-base font-display font-bold text-slate-900 mt-1">
                      {stats?.totalArea ? stats.totalArea.toLocaleString() : '0'} m²
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                    <p className="text-[10px] font-bold text-blue-800 uppercase">Su Seviyesi Artışı</p>
                    <p className="text-base font-display font-bold text-slate-900 mt-1">
                      +{bathtubLevel.toFixed(1)} m
                    </p>
                  </div>
                </div>

                {areaKml && (
                  <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl space-y-2">
                    <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                      <CheckCircle2 size={15} className="text-emerald-600" />
                      İnceleme Alanı ({areaKml.name})
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white p-2 rounded-lg border border-emerald-200">
                        <span className="text-slate-600 block text-[10px] font-medium">Riskli Alan:</span>
                        <span className="font-bold text-emerald-800 text-xs">{stats?.areaFloodedM2?.toLocaleString() || 0} m²</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-emerald-200">
                        <span className="text-slate-600 block text-[10px] font-medium">Risk Oranı:</span>
                        <span className="font-bold text-emerald-800 text-xs">%{stats?.areaRiskPercent?.toFixed(1) || 0}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-1 space-y-2">
                  <button 
                    onClick={exportToKml}
                    className="w-full py-2.5 px-3 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    <MapIcon size={16} />
                    Taşkın Sınırlarını KML İndir
                  </button>

                  <button 
                    onClick={() => setShowStats(true)}
                    className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    <Info size={15} />
                    Tüm Detaylı İstatistikler
                  </button>
                </div>
              </div>
            </div>

          </div>
        </motion.div>
      ) : (
        /* ----------------- SINGLE PAGE SETUP ----------------- */
        <div className="w-full h-full flex flex-col min-h-0 space-y-2 overflow-hidden">
          
          {/* Mobile Tab Navigation (< lg screen width) */}
          <div className="flex lg:hidden bg-white border border-slate-300 rounded-xl p-1 shrink-0 shadow-sm">
            <button
              onClick={() => setMobileTab('controls')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all relative ${
                mobileTab === 'controls' ? 'bg-cyan-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders size={13} />
              <span>Dosya & Parametre Paneli</span>
              {dem && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse absolute top-1 right-2" />
              )}
            </button>
            <button
              onClick={() => setMobileTab('map')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                mobileTab === 'map' ? 'bg-cyan-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye size={13} />
              <span>Harita & Simülasyon</span>
            </button>
          </div>

          {/* Main Grid Container */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 h-full min-h-0 flex-1">
            
            {/* LEFT PANEL: OPTIONS (Visible on Desktop OR when MobileTab === 'controls') */}
            <div className={`lg:col-span-3 flex flex-col gap-2.5 h-full min-h-0 overflow-y-auto custom-scrollbar ${
              mobileTab === 'controls' ? 'flex' : 'hidden lg:flex'
            }`}>
              
              {/* 1. DEM & CRS SELECTION + DOSYAYI AÇ BUTTON */}
              <section className="bg-white rounded-2xl p-3 border border-slate-300 shadow-sm space-y-2.5 shrink-0">
                <div className="pb-1.5 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <FileText size={14} className="text-cyan-700" />
                    <span>1. Topografya & Koordinat Sistemi</span>
                  </h2>
                  {isFileOpened && (
                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full border border-emerald-300 flex items-center gap-0.5">
                      <CheckCircle2 size={10} />
                      Açık
                    </span>
                  )}
                </div>

                {/* DEM File Selector */}
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">Topografya Dosyası (DEM):</label>
                  {dem ? (
                    <div className="bg-emerald-50 border border-emerald-200 p-2 rounded-xl flex items-center justify-between gap-2">
                      <div className="space-y-0.5 overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                          <span className="font-bold text-slate-900 text-xs truncate">DEM Yüklendi</span>
                        </div>
                        <p className="text-[10px] text-slate-600 truncate">
                          {dem.width}x{dem.height} px • Çöz: {dem.cellSize.toFixed(2)}m
                        </p>
                      </div>

                      <label className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-800 rounded-lg text-[10px] font-bold cursor-pointer border border-slate-300 shrink-0 transition-all shadow-sm">
                        Değiştir
                        <input type="file" accept=".tif,.tiff,.asc" onChange={(e) => { handleDemUpload(e); setIsFileOpened(false); }} className="hidden" />
                      </label>
                    </div>
                  ) : (
                    <label className="flex items-center justify-between gap-2 p-2 border border-dashed border-slate-300 rounded-xl hover:bg-slate-100 transition-all cursor-pointer bg-slate-50 group">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className="p-1 bg-cyan-100 text-cyan-800 rounded-lg group-hover:scale-105 transition-transform shrink-0">
                          <Download size={14} />
                        </div>
                        <span className="font-bold text-xs text-slate-800 truncate">DEM Dosyası Seçin</span>
                      </div>
                      <span className="px-2 py-0.5 bg-cyan-700 text-white rounded-lg text-[10px] font-bold shrink-0 shadow-sm">
                        Gözat
                      </span>
                      <input type="file" accept=".tif,.tiff,.asc" onChange={handleDemUpload} className="hidden" />
                    </label>
                  )}
                </div>

                {/* CRS Selection */}
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">Koordinat Sistemi (CRS):</label>
                  <div className="relative">
                    <select
                      value={selectedCRS.code}
                      onChange={(e) => {
                        const found = CRS_LIST.find(c => c.code === e.target.value);
                        if (found) setSelectedCRS(found);
                      }}
                      className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-cyan-600 appearance-none cursor-pointer transition-all pr-7 shadow-sm"
                    >
                      <optgroup label="TUREF / TM (3° - Türkiye)">
                        {CRS_LIST.filter(c => c.code.startsWith('EPSG:525')).map(crs => (
                          <option key={crs.code} value={crs.code} className="bg-white text-slate-900 py-1">
                            {crs.code} - {crs.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="ED50 / TM (3° - Türkiye)">
                        {CRS_LIST.filter(c => c.code.startsWith('EPSG:522')).map(crs => (
                          <option key={crs.code} value={crs.code} className="bg-white text-slate-900 py-1">
                            {crs.code} - {crs.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="WGS 84 / UTM (6° - Türkiye & Bölgesel)">
                        {CRS_LIST.filter(c => ['EPSG:32635', 'EPSG:32636', 'EPSG:32637', 'EPSG:32638'].includes(c.code)).map(crs => (
                          <option key={crs.code} value={crs.code} className="bg-white text-slate-900 py-1">
                            {crs.code} - {crs.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="ED50 / UTM (6° - Türkiye & Bölgesel)">
                        {CRS_LIST.filter(c => ['EPSG:23035', 'EPSG:23036', 'EPSG:23037', 'EPSG:23038'].includes(c.code)).map(crs => (
                          <option key={crs.code} value={crs.code} className="bg-white text-slate-900 py-1">
                            {crs.code} - {crs.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Global & Standartlar">
                        {CRS_LIST.filter(c => ['EPSG:4326', 'EPSG:3857'].includes(c.code)).map(crs => (
                          <option key={crs.code} value={crs.code} className="bg-white text-slate-900 py-1">
                            {crs.code} - {crs.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-600">
                      <ChevronDown size={13} />
                    </div>
                  </div>
                </div>

                {/* DOSYAYI AÇ BUTTON */}
                <button
                  onClick={() => {
                    if (!dem) {
                      alert("Lütfen önce bir DEM (Topografya) dosyası yükleyin.");
                      return;
                    }
                    setIsFileOpened(true);
                    setMobileTab('map');
                  }}
                  className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer ${
                    isFileOpened
                      ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                      : 'bg-cyan-700 hover:bg-cyan-800 text-white'
                  }`}
                >
                  <Eye size={15} />
                  <span>{isFileOpened ? 'Harita Görünümü Aktif (Açık)' : 'Dosyayı Aç (Haritada Göster)'}</span>
                </button>
              </section>

              {/* 2. VECTOR DATA UPLOADS (İnceleme Alanı ve Kaynak Nokta) */}
              <section className="bg-white rounded-2xl p-3 border border-slate-300 shadow-sm space-y-2 shrink-0">
                <div className="pb-1 border-b border-slate-200">
                  <h2 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <MapPin size={14} className="text-cyan-700" />
                    <span>2. Vektör Verileri (KML)</span>
                  </h2>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {/* İnceleme Alanı Poligon KML */}
                  <label className={`p-2 border rounded-xl cursor-pointer transition-all flex flex-col items-center justify-center text-center ${
                    areaKml ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}>
                    <FileText className={areaKml ? "text-emerald-700 mb-0.5" : "text-slate-500 mb-0.5"} size={16} />
                    <span className="text-[10px] font-bold text-slate-900 truncate w-full">
                      {areaKml ? areaKml.name : 'İnceleme Alanı'}
                    </span>
                    <span className="text-[9px] text-slate-500">Poligon KML</span>
                    <input type="file" accept=".kml" onChange={handleAreaKmlUpload} className="hidden" />
                  </label>

                  {/* Kaynak Nokta KML */}
                  <label className={`p-2 border rounded-xl cursor-pointer transition-all flex flex-col items-center justify-center text-center ${
                    sourceKmlName ? 'bg-blue-50 border-blue-300' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}>
                    <MapPin className={sourceKmlName ? "text-blue-700 mb-0.5" : "text-slate-500 mb-0.5"} size={16} />
                    <span className="text-[10px] font-bold text-slate-900 truncate w-full">
                      {sourceKmlName ? sourceKmlName : 'Kaynak Nokta'}
                    </span>
                    <span className="text-[9px] text-slate-500">Nokta KML</span>
                    <input type="file" accept=".kml" onChange={handleSourceKmlUpload} className="hidden" />
                  </label>
                </div>
              </section>

              {/* 3. WATER LEVEL PARAMETER */}
              <section className="bg-white rounded-2xl p-3 border border-slate-300 shadow-sm space-y-2 shrink-0">
                <div className="pb-1 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Droplets size={14} className="text-cyan-700" />
                    <span>3. Su Seviyesi Artışı</span>
                  </h2>
                  <span className="text-xs font-display font-bold text-cyan-800 bg-cyan-50 px-2 py-0.5 rounded-lg border border-cyan-200">
                    +{bathtubLevel.toFixed(1)} m
                  </span>
                </div>

                <div className="space-y-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <input 
                    type="range" 
                    min="0.1" 
                    max="20" 
                    step="0.1"
                    value={bathtubLevel} 
                    onChange={(e) => setBathtubLevel(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-300 rounded-full appearance-none cursor-pointer accent-cyan-700"
                  />
                  <div className="grid grid-cols-6 gap-1 pt-0.5">
                    {[1.0, 2.0, 3.0, 4.0, 5.0, 10.0].map((val) => (
                      <button
                        key={val}
                        onClick={() => setBathtubLevel(val)}
                        className={`py-1 rounded-lg text-[10px] font-bold border transition-all text-center cursor-pointer ${
                          bathtubLevel === val 
                            ? 'bg-cyan-100 border-cyan-500 text-cyan-900 shadow-sm' 
                            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        +{val}m
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {/* 4. START ANALYSIS BUTTON (MOVED TO LEFT PANEL) */}
              <div className="pt-1 mt-auto shrink-0">
                <button
                  onClick={handleStartAnalysis}
                  className="w-full py-2.5 px-3 bg-cyan-700 hover:bg-cyan-800 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <Play size={15} className="fill-white" />
                  <span>Analizi Başlat (Taşkın Simülasyonu)</span>
                </button>
              </div>

            </div>

            {/* RIGHT PANEL: FULL-SIZE INTERACTIVE MAP (Visible on Desktop OR when MobileTab === 'map') */}
            <div className={`lg:col-span-9 flex flex-col gap-2.5 h-full min-h-0 ${
              mobileTab === 'map' ? 'flex' : 'hidden lg:flex'
            }`}>
              
              {/* Interactive Map Header Card */}
              <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-300 shadow-sm relative overflow-hidden flex-1 flex flex-col gap-2 min-h-0">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 shrink-0">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <Compass className="text-cyan-700" size={15} />
                    <span>Harita Üzerinden Kaynak Noktası Seçimi ve Önizleme</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* Quick Mobile Panel Open Button */}
                    <button
                      onClick={() => setMobileTab('controls')}
                      className="lg:hidden px-2.5 py-1 bg-cyan-50 text-cyan-800 border border-cyan-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                    >
                      <Sliders size={12} />
                      <span>Paneli Aç</span>
                    </button>

                    {/* Basemap Switcher Dropdown */}
                    <div className="relative">
                      <button
                        onClick={() => setShowBasemapMenu(!showBasemapMenu)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 shadow-sm transition-all cursor-pointer"
                      >
                        <Layers size={13} />
                        <span>{currentBasemap.label}</span>
                      </button>

                      {showBasemapMenu && (
                        <div className="absolute right-0 mt-2 w-52 bg-slate-900 border border-slate-700 rounded-xl p-1.5 shadow-2xl z-[500] space-y-1">
                          <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Harita Katmanı</div>
                          {BASEMAP_OPTIONS.map((bm) => (
                            <button
                              key={bm.id}
                              onClick={() => {
                                setActiveBasemap(bm.id);
                                setShowBasemapMenu(false);
                              }}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                                activeBasemap === bm.id
                                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold'
                                  : 'text-slate-300 hover:bg-white/10'
                              }`}
                            >
                              <span>{bm.label}</span>
                              {activeBasemap === bm.id && <Check size={13} className="text-cyan-400" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Map View */}
                <div className="flex-1 w-full min-h-0 rounded-xl overflow-hidden border border-slate-300 relative shadow-inner">
                  <MapContainer 
                    center={[sourceWgs ? sourceWgs[0] : coords.lat, sourceWgs ? sourceWgs[1] : coords.lon]} 
                    zoom={13} 
                    maxZoom={24}
                    className="w-full h-full"
                  >
                    <TileLayer
                      key={currentBasemap.id}
                      url={currentBasemap.url}
                      attribution={currentBasemap.attribution}
                      maxZoom={24}
                      maxNativeZoom={20}
                    />
                    {elevationImage && wgs84Bounds && (
                      <ImageOverlay url={elevationImage} bounds={wgs84Bounds} opacity={0.85} />
                    )}
                    <MapClickHandler onMapClick={handleMapClick} />
                    {riverKml && <Polyline positions={riverKml.coords} color="#3b82f6" weight={3.5} opacity={0.9} />}
                    {areaKml ? (
                      <Polygon positions={areaKml.coords} color="#10b981" weight={2.5} fillOpacity={0.25} />
                    ) : demBoundaryWgs && demBoundaryWgs.length > 0 ? (
                      demBoundaryWgs.map((loop, idx) => (
                        <Polygon key={idx} positions={loop.map(([lon, lat]) => [lat, lon])} color="#10b981" weight={2.5} fillOpacity={0.2} />
                      ))
                    ) : null}
                    {sourceWgs && (
                      <CircleMarker 
                        center={sourceWgs} 
                        radius={8} 
                        fillColor="#06b6d4" 
                        color="white" 
                        weight={2} 
                        fillOpacity={1} 
                        
                      />
                    )}
                    {wgs84Bounds && <MapAutoCenter bounds={wgs84Bounds} />}
                  </MapContainer>

                  {/* Top Notification Banner inside Map */}
                  <div className="absolute top-2.5 left-2.5 z-[400] bg-slate-900/90 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] text-slate-100 border border-slate-700 flex items-center gap-1.5 shadow-md">
                    <MapPin className="text-cyan-400 shrink-0" size={13} />
                    <span>Haritaya tıklayarak su kaynak noktasını değiştirebilirsiniz</span>
                  </div>

                  {/* Bottom Status Bar inside Map */}
                  <div className="absolute bottom-2.5 left-2.5 right-2.5 z-[400] flex flex-wrap items-center justify-between gap-1.5 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-[11px] text-slate-200 border border-slate-700 shadow-xl">
                    <div className="flex items-center gap-3 text-[10px]">
                      <span><strong className="text-cyan-400">Grid:</strong> X: {params.sourceX}, Y: {params.sourceY}</span>
                      {sourceWgs && (
                        <span><strong className="text-emerald-400">Coğrafi:</strong> {sourceWgs[0].toFixed(4)}°, {sourceWgs[1].toFixed(4)}°</span>
                      )}
                    </div>
                    {areaKml && (
                      <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.2 rounded-full text-[9px] font-bold border border-emerald-500/30">
                        İnceleme Alanı Aktif ({areaKml.name})
                      </span>
                    )}
                  </div>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default Analysis;
