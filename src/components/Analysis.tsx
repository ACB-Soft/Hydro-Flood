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
  Check
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
    <div className="max-w-6xl mx-auto space-y-8">
      {/* ----------------- RESULT PAGE ----------------- */}
      {isResultPage ? (
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Top Bar Action */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <BarChart3 size={16} className="text-cyan-400" />
              <span>Taşkın yayılımı ve alan analizi sonuçları</span>
            </div>
            <button 
              onClick={() => setCurrentStep(1)} 
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition-all flex items-center gap-2 shadow-sm shrink-0"
            >
              <ArrowLeft size={14} />
              Girdi Parametrelerini Düzenle
            </button>
          </div>

          {/* Results Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Map Viewer */}
            <div className="lg:col-span-2 glass rounded-3xl p-3 border border-white/20 shadow-xl h-[400px] sm:h-[520px] relative overflow-hidden">
              {isSimulating && (
                <div className="absolute inset-0 z-[500] bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-4">
                  <div className="p-4 bg-cyan-500/20 text-cyan-400 rounded-full">
                    <RefreshCw size={32} className="animate-spin" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Simülasyon Hesaplanıyor...</h3>
                    <p className="text-slate-400 text-xs mt-1">Hidrolojik matris ve KML sınırları üzerinde taşkın çözümleniyor</p>
                  </div>
                  <div className="w-64 bg-slate-800 rounded-full h-2.5 overflow-hidden border border-white/10">
                    <div 
                      className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono font-bold text-cyan-300">%{Math.round(progress)}</span>
                </div>
              )}

              <MapContainer 
                center={[coords.lat, coords.lon]} 
                zoom={13} 
                maxZoom={24}
                className="w-full h-full rounded-2xl"
              >
                <TileLayer
                  url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
                  attribution='&copy; Google Maps'
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
                {areaKml && <Polygon positions={areaKml.coords} color="#10b981" weight={2} fillOpacity={0.2} />}
                {wgs84Bounds && <MapAutoCenter bounds={wgs84Bounds} />}
              </MapContainer>

              <div className="absolute top-6 right-6 flex items-center gap-2 z-[400]">
                {['height'].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode as any)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900/90 text-cyan-300 border border-cyan-500/30 shadow-lg backdrop-blur-md"
                  >
                    <Droplets size={14} />
                    Su Derinliği
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Summary & Export */}
            <div className="space-y-6">
              <div className="glass rounded-3xl p-6 border border-white/20 shadow-xl space-y-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Analiz Özeti
                </h3>

                <div className="grid grid-cols-2 gap-4">
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
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl space-y-2">
                    <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 size={14} />
                      İnceleme Alanı ({areaKml.name})
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Riskli Alan:</span>
                        <span className="font-bold text-emerald-300">{stats?.areaFloodedM2?.toLocaleString() || 0} m²</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Risk Oranı:</span>
                        <span className="font-bold text-emerald-300">%{stats?.areaRiskPercent?.toFixed(1) || 0}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2 space-y-3">
                  <button 
                    onClick={exportToKml}
                    className="w-full py-3.5 px-4 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-2xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-sm"
                  >
                    <MapIcon size={16} />
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

              {isSimulating && (
                <div className="glass rounded-3xl p-6 border border-cyan-500/30 bg-cyan-500/5 space-y-4">
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="text-cyan-400">Hesaplanıyor...</span>
                    <span className="text-white">%{Math.round(progress)}</span>
                  </div>
                  <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-cyan-500 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Column 1: Topo & CRS */}
            <div className="space-y-6">
              {/* STEP 1: DEM */}
              <section className="glass rounded-3xl p-6 border border-white/20 shadow-xl space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                  <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
                    <LayersIcon size={20} />
                  </div>
                  <div>
                    <h2 className="font-bold text-white text-base">1. Topografya Verisi (DEM)</h2>
                    <p className="text-xs text-slate-400">Dijital Yükseklik Modelini yükleyin (.tif, .asc)</p>
                  </div>
                </div>

                {dem ? (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl flex items-center justify-between gap-4">
                    <div className="space-y-1 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                        <span className="font-bold text-white text-xs sm:text-sm">DEM Dosyası Yüklendi</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {dem.width}x{dem.height} px • Çözünürlük: {dem.cellSize.toFixed(2)}m • Yükseklik: {dem.min.toFixed(1)}m - {dem.max.toFixed(1)}m
                      </p>
                    </div>

                    <label className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold cursor-pointer border border-white/10 shrink-0 transition-all">
                      Değiştir
                      <input type="file" accept=".tif,.tiff,.asc" onChange={handleDemUpload} className="hidden" />
                    </label>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-white/10 rounded-2xl hover:bg-white/5 transition-all cursor-pointer bg-white/5 group">
                    <Download className="text-cyan-400 mb-2 group-hover:scale-110 transition-transform" size={28} />
                    <span className="font-bold text-sm text-slate-200">DEM Dosyası Seçin</span>
                    <span className="text-[11px] text-slate-500 mt-0.5">.tif veya .asc formatı</span>
                    <input type="file" accept=".tif,.tiff,.asc" onChange={handleDemUpload} className="hidden" />
                  </label>
                )}
              </section>

              {/* STEP 2: CRS */}
              <section className="glass rounded-3xl p-6 border border-white/20 shadow-xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-cyan-500/20 text-cyan-400 rounded-xl">
                      <Globe size={20} />
                    </div>
                    <div>
                      <h2 className="font-bold text-white text-base">2. Koordinat Sistemi (CRS)</h2>
                      <p className="text-xs text-slate-400">Proje referans sistemini belirleyin</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-full text-xs font-bold">
                    {selectedCRS.name}
                  </span>
                </div>

                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Kod veya isim ile ara... Örn: WGS, TUREF, UTM, 4326"
                    value={crsSearch}
                    onChange={(e) => setCrsSearch(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                    {filteredCRSList.map((crs) => (
                      <button
                        key={crs.name}
                        onClick={() => setSelectedCRS(crs)}
                        className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                          selectedCRS.name === crs.name
                            ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300 font-bold'
                            : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'
                        }`}
                      >
                        <div className="overflow-hidden">
                          <p className="text-xs truncate">{crs.name}</p>
                          <p className="text-[10px] text-slate-500 font-mono truncate">{crs.code}</p>
                        </div>
                        {selectedCRS.name === crs.name && <Check size={14} className="text-cyan-400 shrink-0 ml-1" />}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {/* STEP 4: PARAMETER */}
              <section className="glass rounded-3xl p-6 border border-white/20 shadow-xl space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                  <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
                    <Droplets size={20} />
                  </div>
                  <div>
                    <h2 className="font-bold text-white text-base">4. Su Seviyesi Parametresi</h2>
                    <p className="text-xs text-slate-400">Bathtub simülasyonu su seviyesi artış miktarı</p>
                  </div>
                </div>

                <div className="space-y-3 bg-white/5 p-4 rounded-2xl border border-white/10">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Su Seviyesi Artışı</label>
                    <span className="text-xl font-display font-bold text-cyan-400">+{bathtubLevel.toFixed(1)} m</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.1" 
                    max="20" 
                    step="0.1"
                    value={bathtubLevel} 
                    onChange={(e) => setBathtubLevel(parseFloat(e.target.value))}
                    className="w-full h-2.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-400"
                  />
                  <p className="text-[11px] text-slate-400">
                    Kaynak noktasından itibaren bu seviyeye kadar olan çukur alanlar su altında kalacaktır.
                  </p>
                </div>
              </section>
            </div>

            {/* Column 2: KML & Map Preview */}
            <div className="space-y-6 flex flex-col justify-between">
              {/* STEP 3: KML & MAP */}
              <section className="glass rounded-3xl p-6 border border-white/20 shadow-xl space-y-4 flex-1">
                <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                  <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                    <MapPin size={20} />
                  </div>
                  <div>
                    <h2 className="font-bold text-white text-base">3. Konum ve Vektör Verileri</h2>
                    <p className="text-xs text-slate-400">Kaynak noktası veya alan sınır KML'si yükleyin</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="p-3 bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl cursor-pointer transition-all flex flex-col items-center text-center">
                    <MapPin className="text-blue-400 mb-1" size={20} />
                    <span className="text-xs font-bold text-slate-200">
                      {sourceKmlName ? sourceKmlName : 'Kaynak KML Yükle'}
                    </span>
                    <span className="text-[9px] text-slate-500 mt-0.5">Nokta Vektörü</span>
                    <input type="file" accept=".kml" onChange={handleSourceKmlUpload} className="hidden" />
                  </label>

                  <label className="p-3 bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl cursor-pointer transition-all flex flex-col items-center text-center">
                    <FileText className="text-emerald-400 mb-1" size={20} />
                    <span className="text-xs font-bold text-slate-200">
                      {areaKml ? areaKml.name : 'İnceleme Alanı KML'}
                    </span>
                    <span className="text-[9px] text-slate-500 mt-0.5">Poligon Vektörü</span>
                    <input type="file" accept=".kml" onChange={handleAreaKmlUpload} className="hidden" />
                  </label>
                </div>

                {/* Map Preview */}
                <div className="h-[260px] sm:h-[300px] rounded-2xl overflow-hidden border border-white/10 relative">
                  <MapContainer 
                    center={[sourceWgs ? sourceWgs[0] : coords.lat, sourceWgs ? sourceWgs[1] : coords.lon]} 
                    zoom={13} 
                    maxZoom={24}
                    className="w-full h-full"
                  >
                    <TileLayer
                      url="https://{s}.tile.opentopomap.org/{z}/{y}/{x}.png"
                      attribution='&copy; OpenTopoMap'
                    />
                    {elevationImage && wgs84Bounds && (
                      <ImageOverlay url={elevationImage} bounds={wgs84Bounds} opacity={0.9} />
                    )}
                    <MapClickHandler onMapClick={handleMapClick} />
                    {riverKml && <Polyline positions={riverKml.coords} color="#3b82f6" weight={3} />}
                    {areaKml && <Polygon positions={areaKml.coords} color="#10b981" weight={2} fillOpacity={0.2} />}
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
                  <div className="absolute bottom-2 left-2 z-[400] bg-slate-900/80 px-2.5 py-1 rounded-lg text-[10px] text-slate-300 backdrop-blur-sm border border-white/10">
                    Grid Konumu: X:{params.sourceX}, Y:{params.sourceY}
                  </div>
                </div>
              </section>

              {/* ACTION BUTTON */}
              <button
                onClick={handleStartAnalysis}
                className="w-full py-4 px-6 bg-gradient-to-r from-cyan-500 via-blue-600 to-cyan-500 hover:from-cyan-400 hover:to-blue-500 text-white rounded-2xl font-display font-bold text-base sm:text-lg transition-all shadow-xl shadow-cyan-500/25 flex items-center justify-center gap-3 hover:scale-[1.01]"
              >
                <Play size={22} className="fill-white" />
                <span>Analizi Başlat</span>
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default Analysis;
