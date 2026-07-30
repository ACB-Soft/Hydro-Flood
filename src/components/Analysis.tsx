import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart3, 
  Droplets, 
  Layers, 
  Settings, 
  FileText, 
  ChevronRight, 
  AlertCircle, 
  Globe, 
  MapPin, 
  Map as MapIcon, 
  X, 
  Download, 
  RefreshCw, 
  Info,
  Play,
  Layers as LayersIcon
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
    currentStep, setCurrentStep, dem, setDem, params, setParams, coords, setCoords,
    selectedCRS, setSelectedCRS, isSimulating, setIsSimulating, progress, setProgress,
    waterDepth, setWaterDepth, outflowType, setOutflowType, showStats, setShowStats,
    simMethod, setSimMethod, bathtubLevel, setBathtubLevel, flowThreshold, setFlowThreshold,
    floodImage, setFloodImage, elevationImage, setElevationImage, reliefImage, streamImage, setStreamImage,
    viewMode, setViewMode, flowAcc, setFlowAcc, riverKml, setRiverKml, sourceKmlName, setSourceKmlName,
    sourceWgs, setSourceWgs, areaKml, setAreaKml, areaMask, setAreaMask, stats, wgs84Bounds,
    startSimulation, handleKmlUpload, handleSourceKmlUpload, handleAreaKmlUpload, handleMapClick,
    exportToKml, handleDemUpload, CRS_LIST, MANNING_PRESETS, workerRef
  } = props;

  const [crsSearch, setCrsSearch] = React.useState('');
  const filteredCRSList = CRS_LIST.filter(crs => 
    crs.code.toLowerCase().includes(crsSearch.toLowerCase()) ||
    crs.name.toLowerCase().includes(crsSearch.toLowerCase())
  );

  const steps = [
    { id: 1, label: 'Topografya Verisi Yükle', icon: <LayersIcon size={18} /> },
    { id: 2, label: 'Koordinat Sistemi Seç', icon: <Globe size={18} /> },
    { id: 3, label: 'KML Verileri Seç', icon: <FileText size={18} /> },
    { id: 4, label: 'Analiz Parametreleri', icon: <Settings size={18} /> },
    { id: 5, label: 'Sonuçlar', icon: <BarChart3 size={18} /> }
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      {/* Step Indicator */}
      <div className="flex items-center justify-between px-4 max-w-2xl mx-auto">
        {steps.map((step, idx) => (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-1.5 sm:gap-3">
              <div 
                className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all duration-500 ${
                  currentStep >= step.id 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' 
                    : 'bg-white/5 text-blue-400/40 border border-white/10'
                }`}
              >
                {step.icon}
              </div>
              <span className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-center hidden sm:block ${
                currentStep >= step.id ? 'text-blue-400' : 'text-slate-500'
              }`}>
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div className={`flex-1 h-[2px] mx-1 sm:mx-4 -mt-4 sm:-mt-8 transition-colors duration-500 ${
                currentStep > step.id ? 'bg-blue-600' : 'bg-white/10'
              }`} />
            )}
          </React.Fragment>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {currentStep === 1 && (
          <motion.div 
            key="step1"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8"
          >
            <div className="space-y-6">
              <div className="space-y-2 px-1 sm:px-0">
                <h2 className="text-2xl sm:text-3xl font-display font-bold text-white">Topografya Verisi Yükle</h2>
                <p className="text-sm text-slate-400">Analiz için dijital yükseklik modelini (DEM) yükleyin.</p>
              </div>
              
              <div className="glass rounded-2xl sm:rounded-[2.5rem] p-5 sm:p-8 space-y-6 border border-white/20 shadow-xl">
                <label className="flex flex-col items-center justify-center w-full h-40 sm:h-48 border-2 border-dashed border-white/10 rounded-2xl sm:rounded-[2rem] hover:bg-white/5 transition-all cursor-pointer group bg-white/5">
                  <div className="flex flex-col items-center justify-center p-4 sm:p-6 text-center">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-blue-600/10 rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform">
                      <Download className="text-blue-400 w-5 h-5 sm:w-7 sm:h-7" />
                    </div>
                    <p className="text-sm sm:text-base font-bold text-slate-200">DEM Dosyası Seçin</p>
                    <p className="text-[10px] sm:text-xs text-slate-500 mt-1 px-2">.tif veya .asc formatında dosyaları sürükleyin veya tıklayın</p>
                  </div>
                  <input type="file" accept=".tif,.tiff,.asc" onChange={handleDemUpload} className="hidden" />
                </label>
              </div>
            </div>

            <div className="space-y-6">
              <div className="glass rounded-2xl sm:rounded-[2.5rem] p-5 sm:p-8 border border-white/20 shadow-xl h-full flex flex-col justify-center">
                {dem ? (
                  <div className="space-y-6 sm:space-y-8">
                    <div className="flex items-center gap-4 p-4 sm:p-6 bg-white/5 rounded-2xl sm:rounded-3xl border border-white/10">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-blue-400 shadow-sm shrink-0">
                        <FileText size={20} />
                      </div>
                      <div className="overflow-hidden">
                        <h4 className="text-sm sm:text-base font-bold text-white">Veri Yüklendi</h4>
                        <p className="text-[10px] sm:text-xs text-slate-500 truncate">{dem.width}x{dem.height} Hücre • {dem.cellSize.toFixed(2)}m Çözünürlük</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white/5 p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-white/10 shadow-sm">
                        <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase mb-1">Min Yükseklik</p>
                        <p className="text-lg sm:text-xl font-display font-bold text-blue-400">{dem.min.toFixed(2)} m</p>
                      </div>
                      <div className="bg-white/5 p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-white/10 shadow-sm">
                        <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase mb-1">Max Yükseklik</p>
                        <p className="text-lg sm:text-xl font-display font-bold text-blue-400">{dem.max.toFixed(2)} m</p>
                      </div>
                    </div>

                    <div className="p-4 sm:p-6 bg-blue-500/5 rounded-2xl sm:rounded-3xl border border-blue-500/10">
                      <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                        Topografya verisi başarıyla işlendi. Bir sonraki adımda koordinat sistemini belirleyebilirsiniz.
                      </p>
                    </div>

                    <button 
                      onClick={() => setCurrentStep(2)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 sm:py-5 rounded-xl sm:rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-blue-500/30 group text-sm sm:text-base"
                    >
                      Sonraki Adım <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-4 p-6 sm:p-8">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white/5 rounded-full flex items-center justify-center text-slate-700">
                      <LayersIcon size={32} />
                    </div>
                    <div className="space-y-2">
                       <h4 className="font-bold text-slate-500 text-sm sm:text-base">Veri Bekleniyor</h4>
                      <p className="text-xs sm:text-sm text-slate-600 max-w-xs leading-normal">Lütfen sol taraftan bir DEM dosyası yükleyin.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {currentStep === 2 && dem && (
          <motion.div 
            key="step2-crs"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8"
          >
            <div className="space-y-6">
              <div className="space-y-2 px-1 sm:px-0">
                <h2 className="text-2xl sm:text-3xl font-display font-bold text-white">Koordinat Sistemi Seç</h2>
                <p className="text-sm text-slate-400">Yüklenen topografya verisinin referans koordinat sistemini (CRS) belirtin.</p>
              </div>

              <div className="glass rounded-2xl sm:rounded-[2.5rem] p-5 sm:p-8 space-y-4 border border-white/20 shadow-xl">
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-2">
                    <label className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest block">Koordinat Sistemi (CRS) Listesi</label>
                    <span className="text-[10px] text-slate-400 font-medium">Toplam {filteredCRSList.length} sistem</span>
                  </div>

                  {/* Search Input Box */}
                  <div className="px-2">
                    <input
                      type="text"
                      placeholder="Kod veya isim ile hızlı ara... Örn: WGS, TUREF, UTM 35, 4326"
                      value={crsSearch}
                      onChange={(e) => setCrsSearch(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all font-medium backdrop-blur-md"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] sm:max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {filteredCRSList.length > 0 ? (
                      filteredCRSList.map((crs) => (
                        <button
                          key={crs.name}
                          onClick={() => setSelectedCRS(crs)}
                          className={`w-full flex items-center justify-between p-3 sm:p-4 rounded-xl border transition-all ${
                            selectedCRS.name === crs.name 
                              ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20' 
                              : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'
                          }`}
                        >
                          <div className="flex flex-col items-start overflow-hidden text-left">
                            <span className="text-[11px] sm:text-xs font-bold truncate w-full">{crs.name}</span>
                            <span className={`text-[9px] font-mono truncate w-full ${selectedCRS.name === crs.name ? 'text-blue-100' : 'text-slate-500'}`}>
                              {crs.code}
                            </span>
                          </div>
                          {selectedCRS.name === crs.name && <div className="w-2 h-2 bg-white rounded-full shrink-0 ml-2 animate-pulse" />}
                        </button>
                      ))
                    ) : (
                      <div className="col-span-full py-8 text-center">
                        <p className="text-xs text-slate-500">Aramanıza uygun koordinat sistemi bulunamadı.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="glass rounded-2xl sm:rounded-[2.5rem] p-5 sm:p-8 border border-white/20 shadow-xl h-full flex flex-col justify-center">
                <div className="space-y-6 sm:space-y-8">
                  <div className="flex items-center gap-4 p-4 sm:p-6 bg-blue-500/5 rounded-2xl sm:rounded-3xl border border-blue-500/10">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-600/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-blue-400 shadow-sm shrink-0 font-display font-black">
                      CRS
                    </div>
                    <div className="overflow-hidden">
                      <h4 className="text-sm sm:text-base font-bold text-white">Seçilen Sistem</h4>
                      <p className="text-[12px] sm:text-sm text-blue-400 font-bold">{selectedCRS.name}</p>
                      <p className="text-[10px] sm:text-xs text-slate-500 font-mono mt-0.5">{selectedCRS.code}</p>
                    </div>
                  </div>
                  
                  <div className="p-4 sm:p-6 bg-white/5 rounded-2xl sm:rounded-3xl border border-white/10">
                    <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                      Doğru koordinat sistemi seçimi, projedeki KML katmanlarının ve taşkın alanlarının haritada tam konumunda görüntülenmesini sağlar.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button 
                      onClick={() => setCurrentStep(1)} 
                      className="flex-1 bg-white/10 hover:bg-white/20 text-white py-3.5 sm:py-4 rounded-xl sm:rounded-2xl text-sm font-bold transition-all border border-white/20 shadow-xl backdrop-blur-md"
                    >
                      Geri
                    </button>
                    <button 
                      onClick={() => setCurrentStep(3)} 
                      className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white py-3.5 sm:py-4 rounded-xl sm:rounded-2xl text-sm font-bold transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 group font-bold font-sans"
                    >
                      Sonraki Adım <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {currentStep === 3 && dem && (
          <motion.div 
            key="step3-kml"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8"
          >
            <div className="space-y-6">
              <div className="space-y-2 px-1 sm:px-0">
                <h2 className="text-2xl sm:text-3xl font-display font-bold text-white">KML Verileri Seç</h2>
                <p className="text-sm text-slate-400">Kaynak noktası ve inceleme alanı verilerini yükleyin.</p>
              </div>

              <div className="glass rounded-2xl sm:rounded-[2.5rem] p-5 sm:p-8 space-y-4 sm:space-y-6 border border-white/20 shadow-xl">
                {[
                  { id: 'source', label: 'Kaynak Noktası (Point)', icon: <MapPin className="text-red-400" />, handler: handleSourceKmlUpload, data: sourceKmlName, show: true },
                  { id: 'area', label: 'İnceleme Alanı (Polygon)', icon: <LayersIcon className="text-emerald-400" />, handler: handleAreaKmlUpload, data: areaKml, show: true }
                ].filter(item => item.show).map((item) => (
                  <div key={item.id} className="space-y-2">
                    <div className="flex items-center justify-between px-2">
                      <h3 className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest">{item.label}</h3>
                      {item.data && (
                        <span className="text-[9px] sm:text-[10px] text-emerald-400 font-bold flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          <AlertCircle size={8} /> Yüklendi
                        </span>
                      )}
                    </div>
                    <label className={`flex items-center gap-3 sm:gap-4 p-4 sm:p-5 rounded-xl sm:rounded-2xl border-2 border-dashed transition-all cursor-pointer group ${
                      item.data ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}>
                      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center shadow-sm border shrink-0 ${
                        item.data ? 'bg-white/10 border-emerald-500/20' : 'bg-white/10 border-white/10'
                      }`}>
                        {item.icon}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-xs sm:text-sm font-bold text-slate-200 truncate pr-2">
                          {item.data ? (typeof item.data === 'string' ? item.data : item.data.name) : 'Dosya Seçin'}
                        </p>
                        <p className="text-[9px] sm:text-[10px] text-slate-500 uppercase font-semibold">KML Formatında</p>
                      </div>
                      <input type="file" accept=".kml" onChange={item.handler} className="hidden" />
                    </label>
                  </div>
                ))}

                <div className="pt-4 sm:pt-6 border-t border-white/10 space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <label className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest">Kaynak Bilgisi</label>
                    <span className="text-[9px] sm:text-[10px] text-blue-400 font-bold">Haritadan Seçilebilir</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-white/5 border border-white/10 p-4 sm:p-5 rounded-xl sm:rounded-2xl">
                      <p className="text-[9px] sm:text-[10px] font-bold text-blue-400 uppercase mb-1">Grid Konumu</p>
                      <p className="text-sm sm:text-lg font-display font-bold text-white">X: {params.sourceX}, Y: {params.sourceY}</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 p-4 sm:p-5 rounded-xl sm:rounded-2xl">
                      <p className="text-[9px] sm:text-[10px] font-bold text-blue-400 uppercase mb-1">Yükseklik</p>
                      <p className="text-sm sm:text-lg font-display font-bold text-blue-300">
                        {dem ? dem.data[params.sourceY * dem.width + params.sourceX]?.toFixed(2) : '0.00'} m
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="glass rounded-2xl sm:rounded-[2.5rem] p-3 sm:p-4 border border-white/20 shadow-xl h-full min-h-[350px] sm:min-h-[450px] overflow-hidden relative">
                <MapContainer 
                  center={[sourceWgs ? sourceWgs[0] : coords.lat, sourceWgs ? sourceWgs[1] : coords.lon]} 
                  zoom={15} 
                  maxZoom={24}
                  className="w-full h-full rounded-xl sm:rounded-[2rem]"
                >
                  <TileLayer
                    url="https://{s}.tile.opentopomap.org/{z}/{y}/{x}.png"
                    attribution='&copy; OpenStreetMap contributors'
                    maxZoom={24}
                    maxNativeZoom={17}
                  />
                  {elevationImage && wgs84Bounds && (
                    <ImageOverlay
                      url={elevationImage}
                      bounds={wgs84Bounds}
                      opacity={1.0}
                    />
                  )}
                  <MapClickHandler onMapClick={handleMapClick} />
                  {riverKml && <Polyline positions={riverKml.coords} color="#3b82f6" weight={4} />}
                  {areaKml && <Polygon positions={areaKml.coords} color="#10b981" weight={2} fillOpacity={0.2} />}
                  {sourceWgs && (
                    <CircleMarker 
                      center={sourceWgs} 
                      radius={10} 
                      fillColor="#3b82f6" 
                      color="white" 
                      weight={3} 
                      fillOpacity={1} 
                    />
                  )}
                  {wgs84Bounds && <MapAutoCenter bounds={wgs84Bounds} />}
                </MapContainer>
              </div>
            </div>

            <div className="lg:col-span-2 flex gap-3 mt-4 w-full">
              <button onClick={() => setCurrentStep(2)} className="flex-1 bg-white/10 hover:bg-white/20 text-white py-3.5 sm:py-4 rounded-xl sm:rounded-2xl text-sm font-bold transition-all border border-white/20 shadow-xl backdrop-blur-md">Geri</button>
              <button onClick={() => setCurrentStep(4)} className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white py-3.5 sm:py-4 rounded-xl sm:rounded-2xl text-sm font-bold transition-all shadow-lg shadow-blue-500/30">Sonraki Adım</button>
            </div>
          </motion.div>
        )}

        {currentStep === 4 && dem && (
          <motion.div 
            key="step4-params"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-4xl mx-auto space-y-6 sm:space-y-8"
          >
            <div className="text-center space-y-2 px-1">
              <h2 className="text-2xl sm:text-3xl font-display font-bold text-white">Analiz Parametreleri</h2>
              <p className="text-sm text-slate-400">
                Statik simülasyon (Bathtub) için belirlenecek su seviyesi artışını ayarlayın.
              </p>
            </div>

            <div className="glass rounded-2xl sm:rounded-[2.5rem] p-5 sm:p-10 border border-white/20 shadow-xl">
              <div className="space-y-8">
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-5 p-5 sm:p-8 bg-cyan-500/5 rounded-2xl sm:rounded-[2rem] border border-cyan-500/20"
                >
                  <div className="flex justify-between items-center">
                    <label className="text-xs sm:text-sm font-bold text-cyan-400 uppercase tracking-widest">Su Seviyesi Artışı</label>
                    <span className="text-xl sm:text-2xl font-display font-bold text-cyan-300">{bathtubLevel}m</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.1" 
                    max="20" 
                    step="0.1"
                    value={bathtubLevel} 
                    onChange={(e) => setBathtubLevel(parseFloat(e.target.value))}
                    className="w-full h-3 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-500 border border-white/10"
                  />
                  <p className="text-[11px] sm:text-xs text-cyan-400/60 leading-relaxed">
                    Kaynak noktasından itibaren bu yüksekliğe kadar olan tüm çukur alanlar anında su altında kalacaktır.
                  </p>
                </motion.div>

                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-4 border-t border-white/10">
                  <button onClick={() => setCurrentStep(3)} className="w-full sm:flex-1 bg-white/5 hover:bg-white/10 text-slate-300 py-3.5 sm:py-5 rounded-xl sm:rounded-2xl font-bold transition-all border border-white/10 shadow-lg text-sm">Geri</button>
                  <button 
                    onClick={() => { startSimulation(); setCurrentStep(5); }} 
                    className="w-full sm:flex-[2] bg-blue-600 hover:bg-blue-700 text-white py-3.5 sm:py-5 rounded-xl sm:rounded-2xl font-bold transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center gap-3 text-sm"
                  >
                    <Play size={18} /> Simülasyonu Başlat
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {currentStep === 5 && dem && (
          <motion.div 
            key="step5-results"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="space-y-6 sm:space-y-8"
          >
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 sm:px-4">
              <div className="space-y-1 text-center sm:text-left">
                <h2 className="text-2xl sm:text-3xl font-display font-bold text-white">Analiz Sonuçları</h2>
                <p className="text-xs sm:text-sm text-slate-400">Taşkın simülasyonu verilerini inceleyin ve raporlayın.</p>
              </div>
              <button 
                onClick={() => setCurrentStep(4)} 
                className="px-3.5 py-2 bg-white/5 hover:bg-white/10 text-blue-400 rounded-xl text-xs font-bold border border-white/10 shadow-sm transition-all"
              >
                Parametreleri Düzenle
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="glass rounded-2xl sm:rounded-[2.5rem] p-2 sm:p-4 border border-white/40 shadow-2xl h-[320px] sm:h-[450px] lg:h-[65vh] relative overflow-hidden">
                  <MapContainer 
                    center={[coords.lat, coords.lon]} 
                    zoom={13} 
                    maxZoom={24}
                    className="w-full h-full rounded-xl sm:rounded-[2rem]"
                  >
                    <TileLayer
                      url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
                      attribution='&copy; Google'
                      maxZoom={24}
                      maxNativeZoom={20}
                    />
                    {reliefImage && wgs84Bounds && (
                      <ImageOverlay
                        url={reliefImage}
                        bounds={wgs84Bounds}
                        opacity={0.6}
                        className="relief-layer"
                      />
                    )}
                    {floodImage && wgs84Bounds && (
                      <ImageOverlay
                        url={floodImage}
                        bounds={wgs84Bounds}
                        opacity={0.8}
                      />
                    )}
                    {riverKml && <Polyline positions={riverKml.coords} color="#3b82f6" weight={4} opacity={0.7} />}
                    {areaKml && <Polygon positions={areaKml.coords} color="#10b981" weight={2} fillOpacity={0.2} />}
                    {wgs84Bounds && (
                      <Polygon 
                        positions={[
                          [wgs84Bounds[0][0], wgs84Bounds[0][1]],
                          [wgs84Bounds[1][0], wgs84Bounds[0][1]],
                          [wgs84Bounds[1][0], wgs84Bounds[1][1]],
                          [wgs84Bounds[0][0], wgs84Bounds[1][1]]
                        ]}
                        color="#3b82f6"
                        weight={2}
                        fill={false}
                        dashArray="10, 10"
                      />
                    )}
                    {wgs84Bounds && <MapAutoCenter bounds={wgs84Bounds} />}
                  </MapContainer>

                  <div className="absolute top-4 right-4 sm:top-8 sm:right-8 flex flex-col gap-2">
                    {[
                      { id: 'height', label: 'Derinlik', icon: <Droplets size={12} />, show: true },
                      { id: 'flow', label: 'Akış', icon: <RefreshCw size={12} />, show: simMethod === 'hydraulic' }
                    ].filter(m => m.show).map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => setViewMode(mode.id as any)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold transition-all border ${
                          viewMode === mode.id 
                            ? 'bg-blue-600 border-blue-600 text-white shadow-lg' 
                            : 'bg-slate-900/80 backdrop-blur-md border-white/10 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {mode.icon}
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="glass rounded-2xl sm:rounded-[2.5rem] p-5 sm:p-8 border border-white/20 shadow-xl space-y-6 sm:space-y-8">
                  <div className="space-y-3 sm:space-y-4">
                    <h3 className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest px-2">Analiz Özeti</h3>
                    <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 sm:gap-4">
                      <div className="bg-white/5 border border-white/10 p-4 sm:p-6 rounded-2xl sm:rounded-3xl">
                        <p className="text-[9px] sm:text-[10px] font-bold text-blue-400 uppercase mb-1 sm:mb-2">Toplam Taşkın Alanı</p>
                        <p className="text-sm sm:text-xl md:text-2xl lg:text-3xl font-display font-bold text-white truncate">{stats?.totalArea?.toLocaleString() || '0'} m²</p>
                      </div>
                      <div className="bg-white/5 border border-white/10 p-4 sm:p-6 rounded-2xl sm:rounded-3xl">
                        <p className="text-[9px] sm:text-[10px] font-bold text-cyan-400 uppercase mb-1 sm:mb-2">Seçilen Su Seviyesi</p>
                        <p className="text-sm sm:text-xl md:text-2xl lg:text-3xl font-display font-bold text-white truncate">
                          +{bathtubLevel.toFixed(1)} m
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 sm:space-y-4">
                    <h3 className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest px-2">Dışa Aktar</h3>
                    <button 
                      onClick={exportToKml}
                      className="w-full flex items-center justify-between p-4 sm:p-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl sm:rounded-2xl transition-all group"
                    >
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                          <MapIcon size={20} />
                        </div>
                        <div className="text-left">
                          <h4 className="text-xs sm:text-sm font-bold text-white">Taşkın Alanı Sınırları</h4>
                          <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">Vektörel KML formatında indirin, CBS yazılımlarına aktarın.</p>
                        </div>
                      </div>
                      <span className="text-[10px] sm:text-xs font-bold text-blue-400 uppercase bg-blue-500/10 px-2.5 py-1 rounded-md shrink-0">KML</span>
                    </button>
                  </div>

                  <button 
                    onClick={() => setShowStats(true)}
                    className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10 py-4 sm:py-5 rounded-xl sm:rounded-2xl font-bold transition-all flex items-center justify-center gap-3 text-sm"
                  >
                    <Info size={18} /> Tüm İstatistikler
                  </button>
                </div>

                {isSimulating && (
                  <div className="glass rounded-2xl sm:rounded-[2.5rem] p-5 sm:p-8 border border-blue-500/30 shadow-xl space-y-4 sm:space-y-6 bg-blue-500/5">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] sm:text-xs font-bold text-blue-400 uppercase tracking-widest">Simülasyon Durumu</span>
                      <span className="text-base sm:text-lg font-display font-bold text-white">%{Math.round(progress)}</span>
                    </div>
                    <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden border border-white/10">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        className="h-full bg-gradient-to-r from-blue-600 to-cyan-500"
                      />
                    </div>
                    <div className="flex items-center justify-center gap-3">
                      <RefreshCw size={14} className="text-blue-400 animate-spin" />
                      <p className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-bold tracking-wider">Hesaplamalar devam ediyor...</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Analysis;
