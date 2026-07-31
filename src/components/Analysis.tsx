import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  ChevronDown
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
    elevationImage, reliefImage, viewMode, setViewMode, riverKml, sourceKmlName,
    sourceWgs, areaKml, stats, wgs84Bounds, startSimulation, handleSourceKmlUpload,
    handleAreaKmlUpload, handleMapClick, exportToKml, handleDemUpload, CRS_LIST,
    setShowStats
  } = props;

  const [crsSearch, setCrsSearch] = useState('');
  const [activeBasemap, setActiveBasemap] = useState<string>('hybrid');
  const [showBasemapMenu, setShowBasemapMenu] = useState<boolean>(false);

  const currentBasemap = BASEMAP_OPTIONS.find(b => b.id === activeBasemap) || BASEMAP_OPTIONS[0];

  const filteredCRSList = CRS_LIST.filter(crs => 
    crs.code.toLowerCase().includes(crsSearch.toLowerCase()) ||
    crs.name.toLowerCase().includes(crsSearch.toLowerCase())
  );

  const handleStartAnalysis = () => {
    if (!dem) {
      alert("Lütfen önce bir DEM (Topografya) dosyası yükleyin.");
      return;
    }
    startSimulation();
    setCurrentStep(5);
  };

  const isResultPage = currentStep === 5;

  return (
    <div className="w-full max-w-[1920px] mx-auto space-y-6 px-1 sm:px-2">
      {/* ----------------- RESULT PAGE ----------------- */}
      {isResultPage ? (
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Top Bar Action */}
          <div className="flex items-center justify-between gap-4 glass p-4 rounded-2xl border border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/20 text-cyan-400 rounded-xl">
                <BarChart3 size={20} />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Taşkın Simülasyonu ve Etki Alanı Analiz Sonuçları</h2>
                <p className="text-xs text-slate-400">Hidrolojik yükseklik modeli ve vektör sınırları üzerinde elde edilen veriler</p>
              </div>
            </div>
            <button 
              onClick={() => setCurrentStep(1)} 
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition-all flex items-center gap-2 shadow-sm shrink-0"
            >
              <ArrowLeft size={16} />
              Girdi Parametrelerini Düzenle
            </button>
          </div>

          {/* Results Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Map Viewer */}
            <div className="lg:col-span-8 xl:col-span-9 glass rounded-3xl p-3 border border-white/20 shadow-xl h-[580px] lg:h-[680px] relative overflow-hidden flex flex-col">
              {isSimulating && (
                <div className="absolute inset-0 z-[500] bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-4">
                  <div className="p-4 bg-cyan-500/20 text-cyan-400 rounded-full">
                    <RefreshCw size={36} className="animate-spin" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Simülasyon Hesaplanıyor...</h3>
                    <p className="text-slate-400 text-xs mt-1">Hidrolojik matris ve KML alan sınırları üzerinde taşkın çözümleniyor</p>
                  </div>
                  <div className="w-72 bg-slate-800 rounded-full h-3 overflow-hidden border border-white/10">
                    <div 
                      className="bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-400 h-full transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono font-bold text-cyan-300">%{Math.round(progress)}</span>
                </div>
              )}

              {/* Basemap Picker Overlay */}
              <div className="absolute top-5 right-5 z-[400]">
                <div className="relative">
                  <button
                    onClick={() => setShowBasemapMenu(!showBasemapMenu)}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900/90 hover:bg-slate-900 text-white border border-white/20 shadow-xl backdrop-blur-md transition-all"
                  >
                    <Layers size={15} className="text-cyan-400" />
                    <span>Harita Katmanı: {currentBasemap.label}</span>
                  </button>

                  {showBasemapMenu && (
                    <div className="absolute right-0 mt-2 w-56 bg-slate-900/95 border border-white/20 rounded-2xl p-2 shadow-2xl backdrop-blur-xl z-[450] space-y-1">
                      <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Altlık Harita Katmanı</div>
                      {BASEMAP_OPTIONS.map((bm) => (
                        <button
                          key={bm.id}
                          onClick={() => {
                            setActiveBasemap(bm.id);
                            setShowBasemapMenu(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all ${
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

              <MapContainer 
                center={[coords.lat, coords.lon]} 
                zoom={13} 
                maxZoom={24}
                className="w-full h-full rounded-2xl"
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
                {areaKml && <Polygon positions={areaKml.coords} color="#10b981" weight={2.5} fillOpacity={0.25} />}
                {wgs84Bounds && <MapAutoCenter bounds={wgs84Bounds} />}
              </MapContainer>

              {/* Map Legend Overlay */}
              <div className="absolute bottom-4 left-4 z-[400] bg-slate-900/90 backdrop-blur-md px-3.5 py-2 rounded-xl text-[11px] text-slate-200 border border-white/15 shadow-xl flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-blue-500 border border-blue-300 inline-block"></span>
                  <span className="text-slate-200 font-medium">Taşkın Alanı</span>
                </div>
                {areaKml && (
                  <div className="flex items-center gap-1.5 border-l border-white/15 pl-3">
                    <span className="w-3 h-3 rounded-full bg-red-500 border border-red-300 inline-block animate-pulse"></span>
                    <span className="text-red-300 font-bold">Kesişim / Riskli Alan</span>
                  </div>
                )}
                {areaKml && (
                  <div className="flex items-center gap-1.5 border-l border-white/15 pl-3">
                    <span className="w-3 h-3 rounded-sm border-2 border-emerald-400 bg-emerald-500/30 inline-block"></span>
                    <span className="text-emerald-300 font-medium">İnceleme Sınırı</span>
                  </div>
                )}
              </div>
            </div>

            {/* Summary & Export */}
            <div className="lg:col-span-4 xl:col-span-3 space-y-6">
              <div className="glass rounded-3xl p-6 border border-white/20 shadow-xl space-y-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Info size={16} className="text-cyan-400" />
                  Analiz Özeti
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
                    <p className="text-[10px] font-bold text-cyan-400 uppercase">Toplam Taşkın Alanı</p>
                    <p className="text-lg sm:text-xl font-display font-bold text-white mt-1">
                      {stats?.totalArea ? stats.totalArea.toLocaleString() : '0'} m²
                    </p>
                  </div>

                  <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
                    <p className="text-[10px] font-bold text-blue-400 uppercase">Su Seviyesi Artışı</p>
                    <p className="text-lg sm:text-xl font-display font-bold text-white mt-1">
                      +{bathtubLevel.toFixed(1)} m
                    </p>
                  </div>
                </div>

                {areaKml && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl space-y-3">
                    <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 size={16} />
                      İnceleme Alanı ({areaKml.name})
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
                        <span className="text-slate-400 block text-[10px]">Riskli Alan:</span>
                        <span className="font-bold text-emerald-300 text-sm">{stats?.areaFloodedM2?.toLocaleString() || 0} m²</span>
                      </div>
                      <div className="bg-white/5 p-2.5 rounded-xl border border-white/5">
                        <span className="text-slate-400 block text-[10px]">Risk Oranı:</span>
                        <span className="font-bold text-emerald-300 text-sm">%{stats?.areaRiskPercent?.toFixed(1) || 0}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2 space-y-3">
                  <button 
                    onClick={exportToKml}
                    className="w-full py-3.5 px-4 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 text-cyan-300 border border-cyan-500/40 rounded-2xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/10"
                  >
                    <MapIcon size={18} />
                    Taşkın Sınırlarını KML İndir
                  </button>

                  <button 
                    onClick={() => setShowStats(true)}
                    className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-2"
                  >
                    <Info size={16} />
                    Tüm Detaylı İstatistikler
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        /* ----------------- SINGLE PAGE SETUP ----------------- */
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Main 2-Column Split: Left Options, Right Map & Action */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            
            {/* LEFT PANEL: OPTIONS (5 Cols on LG, 4 Cols on XL) */}
            <div className="lg:col-span-5 xl:col-span-4 flex flex-col justify-between space-y-3.5">
              
              {/* 1. DEM UPLOAD */}
              <section className="glass rounded-3xl p-4 border border-white/20 shadow-xl space-y-3">
                <div className="flex items-center gap-3 pb-2.5 border-b border-white/10">
                  <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-xl shrink-0">
                    <LayersIcon size={18} />
                  </div>
                  <div>
                    <h2 className="font-bold text-white text-sm">1. Topografya Verisi (DEM)</h2>
                    <p className="text-[11px] text-slate-400">Dijital Yükseklik Modelini yükleyin (.tif, .asc)</p>
                  </div>
                </div>

                {dem ? (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-2xl flex items-center justify-between gap-3">
                    <div className="space-y-0.5 overflow-hidden">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                        <span className="font-bold text-white text-xs">DEM Yüklendi</span>
                      </div>
                      <p className="text-[10px] text-slate-400 truncate">
                        {dem.width}x{dem.height} px • Çözünürlük: {dem.cellSize.toFixed(2)}m • {dem.min.toFixed(1)}m - {dem.max.toFixed(1)}m
                      </p>
                    </div>

                    <label className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[11px] font-bold cursor-pointer border border-white/10 shrink-0 transition-all">
                      Değiştir
                      <input type="file" accept=".tif,.tiff,.asc" onChange={handleDemUpload} className="hidden" />
                    </label>
                  </div>
                ) : (
                  <label className="flex items-center justify-between gap-3 p-3 border-2 border-dashed border-white/10 rounded-2xl hover:bg-white/5 transition-all cursor-pointer bg-white/5 group">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-xl group-hover:scale-105 transition-transform shrink-0">
                        <Download size={20} />
                      </div>
                      <div className="overflow-hidden">
                        <span className="font-bold text-xs text-slate-200 block truncate">DEM Dosyası Seçin</span>
                        <span className="text-[10px] text-slate-400 font-normal block truncate">.tif veya .asc formatı</span>
                      </div>
                    </div>
                    <span className="px-3 py-1.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-xl text-[11px] font-bold shrink-0">
                      Gözat
                    </span>
                    <input type="file" accept=".tif,.tiff,.asc" onChange={handleDemUpload} className="hidden" />
                  </label>
                )}
              </section>

              {/* 2. CRS SELECTOR */}
              <section className="glass rounded-3xl p-4 border border-white/20 shadow-xl space-y-3">
                <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-cyan-500/20 text-cyan-400 rounded-xl shrink-0">
                      <Globe size={18} />
                    </div>
                    <div>
                      <h2 className="font-bold text-white text-sm">2. Koordinat Sistemi (CRS)</h2>
                      <p className="text-[11px] text-slate-400">Proje referans coğrafi / projeksiyon sistemi</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-full text-[10px] font-bold shrink-0">
                    {selectedCRS.code}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="relative">
                    <select
                      value={selectedCRS.code}
                      onChange={(e) => {
                        const found = CRS_LIST.find(c => c.code === e.target.value);
                        if (found) setSelectedCRS(found);
                      }}
                      className="w-full bg-slate-900/90 border border-white/20 rounded-xl px-3 py-2.5 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 appearance-none cursor-pointer transition-all pr-9 shadow-lg"
                    >
                      <optgroup label="TUREF / TM (3° - Türkiye)">
                        {CRS_LIST.filter(c => c.code.startsWith('EPSG:525')).map(crs => (
                          <option key={crs.code} value={crs.code} className="bg-slate-900 text-white py-1">
                            {crs.code} - {crs.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="ED50 / TM (3° - Türkiye)">
                        {CRS_LIST.filter(c => c.code.startsWith('EPSG:522')).map(crs => (
                          <option key={crs.code} value={crs.code} className="bg-slate-900 text-white py-1">
                            {crs.code} - {crs.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="WGS 84 / UTM (6° - Türkiye & Bölgesel)">
                        {CRS_LIST.filter(c => ['EPSG:32635', 'EPSG:32636', 'EPSG:32637', 'EPSG:32638'].includes(c.code)).map(crs => (
                          <option key={crs.code} value={crs.code} className="bg-slate-900 text-white py-1">
                            {crs.code} - {crs.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="ED50 / UTM (6° - Türkiye & Bölgesel)">
                        {CRS_LIST.filter(c => ['EPSG:23035', 'EPSG:23036', 'EPSG:23037', 'EPSG:23038'].includes(c.code)).map(crs => (
                          <option key={crs.code} value={crs.code} className="bg-slate-900 text-white py-1">
                            {crs.code} - {crs.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Global & Standartlar">
                        {CRS_LIST.filter(c => ['EPSG:4326', 'EPSG:3857'].includes(c.code)).map(crs => (
                          <option key={crs.code} value={crs.code} className="bg-slate-900 text-white py-1">
                            {crs.code} - {crs.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Diğer Uluslararası Sistemler">
                        {CRS_LIST.filter(c => 
                          !c.code.startsWith('EPSG:525') &&
                          !c.code.startsWith('EPSG:522') &&
                          !['EPSG:32635', 'EPSG:32636', 'EPSG:32637', 'EPSG:32638', 'EPSG:23035', 'EPSG:23036', 'EPSG:23037', 'EPSG:23038', 'EPSG:4326', 'EPSG:3857'].includes(c.code)
                        ).map(crs => (
                          <option key={crs.code} value={crs.code} className="bg-slate-900 text-white py-1">
                            {crs.code} - {crs.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-cyan-400">
                      <ChevronDown size={15} />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    Seçili: <span className="text-cyan-300 font-medium">{selectedCRS.name}</span>
                  </p>
                </div>
              </section>

              {/* 3. WATER LEVEL PARAMETER */}
              <section className="glass rounded-3xl p-4 border border-white/20 shadow-xl space-y-3">
                <div className="flex items-center gap-3 pb-2.5 border-b border-white/10">
                  <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-xl shrink-0">
                    <Droplets size={18} />
                  </div>
                  <div>
                    <h2 className="font-bold text-white text-sm">3. Su Seviyesi Parametresi</h2>
                    <p className="text-[11px] text-slate-400">Bathtub simülasyonu su artış miktarı</p>
                  </div>
                </div>

                <div className="space-y-2.5 bg-white/5 p-3 rounded-2xl border border-white/10">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Su Seviyesi Artışı</label>
                    <span className="text-lg font-display font-bold text-cyan-400">+{bathtubLevel.toFixed(1)} m</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.1" 
                    max="20" 
                    step="0.1"
                    value={bathtubLevel} 
                    onChange={(e) => setBathtubLevel(parseFloat(e.target.value))}
                    className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-400"
                  />
                  <div className="flex gap-1.5 pt-0.5">
                    {[1.0, 2.0, 3.0, 5.0, 10.0].map((val) => (
                      <button
                        key={val}
                        onClick={() => setBathtubLevel(val)}
                        className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                          bathtubLevel === val 
                            ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300' 
                            : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                        }`}
                      >
                        +{val}m
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {/* 4. KML UPLOADS */}
              <section className="glass rounded-3xl p-4 border border-white/20 shadow-xl space-y-3">
                <div className="flex items-center gap-3 pb-2.5 border-b border-white/10">
                  <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-xl shrink-0">
                    <MapPin size={18} />
                  </div>
                  <div>
                    <h2 className="font-bold text-white text-sm">4. Konum ve Vektör Verileri</h2>
                    <p className="text-[11px] text-slate-400">Kaynak ve İnceleme Alanı KML'si yükleyin</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <label className={`p-2.5 border rounded-2xl cursor-pointer transition-all flex flex-col items-center text-center ${
                    sourceKmlName ? 'bg-blue-500/10 border-blue-500/30' : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}>
                    <MapPin className={sourceKmlName ? "text-blue-400 mb-0.5" : "text-slate-400 mb-0.5"} size={18} />
                    <span className="text-[11px] font-bold text-slate-200 truncate w-full">
                      {sourceKmlName ? sourceKmlName : 'Kaynak KML Yükle'}
                    </span>
                    <span className="text-[9px] text-slate-500">Nokta Vektörü</span>
                    <input type="file" accept=".kml" onChange={handleSourceKmlUpload} className="hidden" />
                  </label>

                  <label className={`p-2.5 border rounded-2xl cursor-pointer transition-all flex flex-col items-center text-center ${
                    areaKml ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}>
                    <FileText className={areaKml ? "text-emerald-400 mb-0.5" : "text-slate-400 mb-0.5"} size={18} />
                    <span className="text-[11px] font-bold text-slate-200 truncate w-full">
                      {areaKml ? areaKml.name : 'İnceleme Alanı KML'}
                    </span>
                    <span className="text-[9px] text-slate-500">Poligon Vektörü</span>
                    <input type="file" accept=".kml" onChange={handleAreaKmlUpload} className="hidden" />
                  </label>
                </div>
              </section>

            </div>

            {/* RIGHT PANEL: FULL-SIZE INTERACTIVE MAP & ACTION BUTTON (7 Cols on LG, 8 Cols on XL) */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col justify-between space-y-3.5 h-full">
              
              {/* Interactive Map Header Card */}
              <div className="glass rounded-3xl p-3.5 border border-white/20 shadow-2xl relative overflow-hidden flex-1 flex flex-col space-y-2.5 min-h-[480px]">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                    <Compass className="text-cyan-400" size={16} />
                    <span>Harita Üzerinden Kaynak Noktası Seçimi ve Önizleme</span>
                  </div>
                  
                  {/* Basemap Switcher Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setShowBasemapMenu(!showBasemapMenu)}
                      className="flex items-center gap-2 px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-900/90 hover:bg-slate-900 text-cyan-300 border border-cyan-500/30 shadow-lg backdrop-blur-md transition-all"
                    >
                      <Layers size={14} />
                      <span>{currentBasemap.label}</span>
                    </button>

                    {showBasemapMenu && (
                      <div className="absolute right-0 mt-2 w-56 bg-slate-900/95 border border-white/20 rounded-2xl p-2 shadow-2xl backdrop-blur-xl z-[500] space-y-1">
                        <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Harita Katmanı</div>
                        {BASEMAP_OPTIONS.map((bm) => (
                          <button
                            key={bm.id}
                            onClick={() => {
                              setActiveBasemap(bm.id);
                              setShowBasemapMenu(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all ${
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

                {/* Map View */}
                <div className="flex-1 w-full min-h-[380px] rounded-2xl overflow-hidden border border-white/10 relative shadow-inner">
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
                    {areaKml && <Polygon positions={areaKml.coords} color="#10b981" weight={2.5} fillOpacity={0.25} />}
                    {sourceWgs && (
                      <CircleMarker 
                        center={sourceWgs} 
                        radius={9} 
                        fillColor="#06b6d4" 
                        color="white" 
                        weight={2.5} 
                        fillOpacity={1} 
                      />
                    )}
                    {wgs84Bounds && <MapAutoCenter bounds={wgs84Bounds} />}
                  </MapContainer>

                  {/* Top Notification Banner inside Map */}
                  <div className="absolute top-3 left-3 z-[400] bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-xl text-[11px] text-slate-200 border border-white/15 flex items-center gap-2 shadow-lg">
                    <MapPin className="text-cyan-400 shrink-0" size={14} />
                    <span>Haritaya tıklayarak su kaynak noktasını doğrudan değiştirebilirsiniz</span>
                  </div>

                  {/* Bottom Status Bar inside Map */}
                  <div className="absolute bottom-3 left-3 right-3 z-[400] flex flex-wrap items-center justify-between gap-2 bg-slate-900/90 backdrop-blur-md px-3.5 py-2 rounded-xl text-xs text-slate-300 border border-white/15 shadow-xl">
                    <div className="flex items-center gap-4 text-[11px]">
                      <span><strong className="text-cyan-400">Grid:</strong> X: {params.sourceX}, Y: {params.sourceY}</span>
                      {sourceWgs && (
                        <span><strong className="text-emerald-400">Coğrafi:</strong> {sourceWgs[0].toFixed(5)}°, {sourceWgs[1].toFixed(5)}°</span>
                      )}
                    </div>
                    {areaKml && (
                      <span className="bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-emerald-500/30">
                        İnceleme Alanı Sınırı Aktif ({areaKml.name})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ACTION BUTTON RIGHT ON THE MAIN PANEL */}
              <button
                onClick={handleStartAnalysis}
                className="w-full py-3.5 px-6 bg-gradient-to-r from-cyan-500 via-blue-600 to-cyan-500 hover:from-cyan-400 hover:to-blue-500 text-white rounded-2xl font-display font-bold text-sm sm:text-base transition-all shadow-xl shadow-cyan-500/25 flex items-center justify-center gap-2.5 shrink-0 hover:scale-[1.002] active:scale-[0.998]"
              >
                <Play size={20} className="fill-white" />
                <span>Analizi Başlat (Bathtub Taşkın Simülasyonu)</span>
              </button>

            </div>

          </div>
        </motion.div>
      )}
    </div>
  );
};

export default Analysis;
