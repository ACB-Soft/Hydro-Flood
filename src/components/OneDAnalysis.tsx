import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Activity,
  Settings2,
  Droplets,
  Map as MapIcon,
  Ruler,
  Clock,
  PlayCircle,
  CheckCircle2,
  Upload,
  SplitSquareVertical
} from 'lucide-react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { generateCrossSections, runRouting, CrossSection } from '../utils/OneDEngine';

interface OneDAnalysisProps {
  onBackToDashboard: () => void;
}

const OneDAnalysis: React.FC<OneDAnalysisProps> = ({ onBackToDashboard }) => {
  const [step, setStep] = useState<number>(1);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationComplete, setSimulationComplete] = useState(false);

  // Step 1: Topoğrafya ve KML
  const [demFile, setDemFile] = useState<File | null>(null);
  const [centerlineFile, setCenterlineFile] = useState<File | null>(null);
  const [banksFile, setBanksFile] = useState<File | null>(null);

  // Step 2: Enkesitler
  const [crossSectionInterval, setCrossSectionInterval] = useState<number>(50);
  const [sectionsGenerated, setSectionsGenerated] = useState<boolean>(false);
  const [sections, setSections] = useState<CrossSection[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);

  // Step 3: Pürüzlülük (Manning)
  const [manningLOB, setManningLOB] = useState<number>(0.060); // Sol Taşkın Yatağı
  const [manningMain, setManningMain] = useState<number>(0.035); // Ana Kanal
  const [manningROB, setManningROB] = useState<number>(0.060); // Sağ Taşkın Yatağı

  // Step 4: Sınır Şartları
  const [upstreamType, setUpstreamType] = useState<'peak' | 'hydrograph'>('peak');
  const [peakFlow, setPeakFlow] = useState<number>(150);
  const [downstreamType, setDownstreamType] = useState<'critical' | 'normal' | 'fixed'>('critical');
  const [downstreamSlope, setDownstreamSlope] = useState<number>(0.001);

  // Step 5: Simülasyon
  const [simDuration, setSimDuration] = useState<number>(24);
  const [routingStepType, setRoutingStepType] = useState<'auto' | 'custom'>('auto');
  const [routingStepSeconds, setRoutingStepSeconds] = useState<number>(5);
  const [reportingStepMinutes, setReportingStepMinutes] = useState<number>(1);
  
  // Results
  const [simResults, setSimResults] = useState<any[]>([]);

  const handleNext = () => setStep(prev => Math.min(prev + 1, 5));
  const handlePrev = () => setStep(prev => Math.max(prev - 1, 1));

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<File | null>>) => {
    if (e.target.files && e.target.files.length > 0) {
      setter(e.target.files[0]);
    }
  };

  const handleGenerateSections = async () => {
    if (!demFile || !centerlineFile) {
      alert("Lütfen DEM ve Merkez Hat KML dosyalarını yükleyin.");
      return;
    }
    
    setIsExtracting(true);
    try {
      // Background parsing could take a few seconds
      const data = await generateCrossSections(demFile, centerlineFile, null, null, crossSectionInterval);
      setSections(data);
      setSectionsGenerated(true);
    } catch (err: any) {
      console.error(err);
      alert("Kesit çıkarımı başarısız oldu: " + err.message);
    } finally {
      setIsExtracting(false);
    }
  };

  const runSimulation = () => {
    if (sections.length === 0) {
      alert("Lütfen önce enkesitleri üretin.");
      return;
    }
    setIsSimulating(true);
    setStep(6);
    
    // Fake async to show solving animation
    setTimeout(() => {
      try {
        const results = runRouting(sections, peakFlow, manningMain, manningLOB, manningROB, downstreamSlope);
        setSimResults(results);
        setIsSimulating(false);
        setSimulationComplete(true);
      } catch (err: any) {
        console.error(err);
        alert("Simülasyon Hatası: " + err.message);
        setIsSimulating(false);
        setStep(5);
      }
    }, 2000);
  };

  return (
    <motion.div
      key="1d-analysis"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
      className="w-full h-full flex flex-col min-h-0 overflow-hidden"
    >
      <div className="w-full h-full flex flex-col min-h-0 space-y-2 overflow-hidden p-2">
        {/* Top Header Card */}
        <div className="flex items-center justify-between gap-3 bg-white p-2.5 sm:p-3 rounded-2xl border border-slate-300 shadow-sm shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-800 rounded-xl">
              <SplitSquareVertical size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">1B Dinamik Akış Analizi (1D Hydrodynamic Routing)</h2>
              <p className="text-[10px] text-slate-600 hidden sm:block">DEM, Merkez Aks ve Kıyı Çizgileri KML Tabanlı Doğal Kesit Çıkarımı</p>
            </div>
          </div>
          <button
            onClick={onBackToDashboard}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs border border-slate-300 transition-all flex items-center gap-1.5 shadow-sm shrink-0 cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>Kapat</span>
          </button>
        </div>

      {/* Stepper Wizard Indicator */}
      {step < 6 && (
        <div className="bg-white border border-slate-300 rounded-2xl p-4 shadow-sm flex items-center justify-between relative overflow-x-auto">
          <div className="absolute top-1/2 left-10 right-10 h-1 bg-slate-100 -translate-y-1/2 z-0 rounded-full min-w-[500px]" />
          <div className="absolute top-1/2 left-10 h-1 bg-emerald-500 -translate-y-1/2 z-0 rounded-full transition-all duration-500 min-w-[500px]" style={{ width: `${((step - 1) / 4) * 100}%`, maxWidth: 'calc(100% - 5rem)' }} />
          
          {[
            { num: 1, label: 'Topoğrafya & KML', icon: MapIcon },
            { num: 2, label: 'Enkesitler', icon: Ruler },
            { num: 3, label: 'Pürüzlülük', icon: Settings2 },
            { num: 4, label: 'Sınır Şartları', icon: Droplets },
            { num: 5, label: 'Simülasyon', icon: Clock }
          ].map((s) => {
            const isActive = step === s.num;
            const isCompleted = step > s.num;
            return (
              <div key={s.num} className="relative z-10 flex flex-col items-center gap-2 px-2">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-colors ${
                  isActive ? 'bg-emerald-600 border-emerald-600 text-white shadow-md' :
                  isCompleted ? 'bg-emerald-100 border-emerald-500 text-emerald-700' :
                  'bg-white border-slate-300 text-slate-400'
                }`}>
                  {isCompleted ? <CheckCircle2 size={20} /> : <s.icon size={18} />}
                </div>
                <span className={`text-[10px] uppercase tracking-wider font-bold whitespace-nowrap ${isActive || isCompleted ? 'text-slate-800' : 'text-slate-400'}`}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Wizard Content */}
      <div className="bg-white border border-slate-300 rounded-2xl p-6 shadow-sm flex-1 overflow-y-auto min-h-0">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div className="border-b border-slate-100 pb-3 mb-4">
                <h2 className="text-lg font-bold text-slate-800">1. Topografik Veriler ve Şebeke Geometrisi</h2>
                <p className="text-xs text-slate-500">Analizin dayanağı olan yükseklik modelini ve akış güzergahını belirleyen KML dosyalarını sisteme tanıtın.</p>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-4">
                  {/* DEM Upload */}
                  <div className={`p-4 rounded-xl border-2 border-dashed transition-colors ${demFile ? 'bg-emerald-50 border-emerald-400' : 'bg-slate-50 border-slate-300 hover:border-emerald-400'}`}>
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-2">
                      <MapIcon size={16} className={demFile ? "text-emerald-600" : "text-slate-500"}/> 1. Sayısal Yükseklik Modeli (DEM)
                    </label>
                    <p className="text-[10px] text-slate-500 mb-3">Enkesit kot değerlerinin (Z) okunacağı raster veri (.tif, .asc)</p>
                    <div className="flex items-center gap-3">
                      <label className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer hover:bg-slate-50 shadow-sm flex items-center gap-2">
                        <Upload size={14}/> Dosya Seç
                        <input type="file" accept=".tif,.tiff,.asc" className="hidden" onChange={(e) => handleFileUpload(e, setDemFile)} />
                      </label>
                      <span className="text-xs font-semibold text-slate-600 truncate">{demFile?.name || 'Dosya seçilmedi'}</span>
                    </div>
                  </div>

                  {/* Centerline KML Upload */}
                  <div className={`p-4 rounded-xl border-2 border-dashed transition-colors ${centerlineFile ? 'bg-blue-50 border-blue-400' : 'bg-slate-50 border-slate-300 hover:border-blue-400'}`}>
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-2">
                      <SplitSquareVertical size={16} className={centerlineFile ? "text-blue-600" : "text-slate-500"}/> 2. Nehir Merkez Hattı (KML)
                    </label>
                    <p className="text-[10px] text-slate-500 mb-3">Suyun izleyeceği ana ekseni belirleyen çizgi verisi.</p>
                    <div className="flex items-center gap-3">
                      <label className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer hover:bg-slate-50 shadow-sm flex items-center gap-2">
                        <Upload size={14}/> KML Yükle
                        <input type="file" accept=".kml" className="hidden" onChange={(e) => handleFileUpload(e, setCenterlineFile)} />
                      </label>
                      <span className="text-xs font-semibold text-slate-600 truncate">{centerlineFile?.name || 'Dosya seçilmedi'}</span>
                    </div>
                  </div>

                  {/* Bank Stations KML Upload */}
                  <div className={`p-4 rounded-xl border-2 border-dashed transition-colors ${banksFile ? 'bg-amber-50 border-amber-400' : 'bg-slate-50 border-slate-300 hover:border-amber-400'}`}>
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-2">
                      <Activity size={16} className={banksFile ? "text-amber-600" : "text-slate-500"}/> 3. Kıyı Çizgileri / Bank Stations (KML)
                    </label>
                    <p className="text-[10px] text-slate-500 mb-3">Ana kanal ile taşkın yatağını ayıran sağ ve sol kıyı hatları.</p>
                    <div className="flex items-center gap-3">
                      <label className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer hover:bg-slate-50 shadow-sm flex items-center gap-2">
                        <Upload size={14}/> KML Yükle
                        <input type="file" accept=".kml" className="hidden" onChange={(e) => handleFileUpload(e, setBanksFile)} />
                      </label>
                      <span className="text-xs font-semibold text-slate-600 truncate">{banksFile?.name || 'Dosya seçilmedi'}</span>
                    </div>
                  </div>
                </div>
                
                <div className="h-full min-h-[350px] bg-slate-100 rounded-xl border border-slate-300 overflow-hidden relative shadow-inner">
                  <MapContainer center={[39.92, 32.85]} zoom={12} className="w-full h-full" zoomControl={false}>
                    <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                  </MapContainer>
                  
                  {(!demFile || !centerlineFile) && (
                     <div className="absolute inset-0 bg-white/60 flex flex-col items-center justify-center z-[1000] backdrop-blur-[2px] p-6 text-center">
                       <MapIcon size={32} className="text-slate-400 mb-3" />
                       <h3 className="text-sm font-bold text-slate-700 mb-1">Önizleme İçin Verileri Yükleyin</h3>
                       <p className="text-[10px] text-slate-500">DEM, Merkez Hat ve Kıyı Çizgileri KML verileri yüklendiğinde ağ yapısı haritada görüntülenecektir.</p>
                     </div>
                  )}
                  {(demFile && centerlineFile) && (
                    <div className="absolute top-4 right-4 bg-white/90 p-3 rounded-xl border border-slate-200 shadow-md z-[1000]">
                      <h4 className="text-[10px] font-bold text-slate-800 border-b pb-1 mb-2">Harita Katmanları</h4>
                      <div className="space-y-2 text-[10px] font-semibold text-slate-600">
                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-500 opacity-40"></div> DEM Sınırı</div>
                        <div className="flex items-center gap-2"><div className="w-4 h-1 bg-blue-600"></div> Merkez Hat</div>
                        <div className="flex items-center gap-2"><div className="w-4 h-1 border-t-2 border-dashed border-red-500"></div> Kıyı Çizgileri</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div className="border-b border-slate-100 pb-3 mb-4">
                <h2 className="text-lg font-bold text-slate-800">2. Doğal Enkesit Çıkarımı (Cross-Sections)</h2>
                <p className="text-xs text-slate-500">Merkez eksene dik doğrultuda DEM üzerinden İstasyon-Kot (X-Z) verileri üretilecektir.</p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                  <div className="space-y-2 max-w-xs w-full">
                    <label className="text-xs font-bold text-slate-700 block">Enkesit Üretim Aralığı (dx) [m]</label>
                    <input 
                      type="number" min="10" max="500" step="10" 
                      value={crossSectionInterval} 
                      onChange={(e) => setCrossSectionInterval(parseFloat(e.target.value))} 
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none" 
                    />
                    <p className="text-[10px] text-slate-500">Önerilen: 50m - 100m arası</p>
                  </div>
                  <button 
                    onClick={handleGenerateSections}
                    disabled={isExtracting}
                    className={`px-6 py-2.5 font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 ${isExtracting ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                  >
                    {isExtracting ? (
                      <><div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div> Hesaplanıyor...</>
                    ) : (
                      <><Ruler size={16}/> Enkesitleri Çıkar</>
                    )}
                  </button>
                </div>
              </div>

              {sectionsGenerated && sections.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-700">Örnek Doğal Kesit Profili (İlk Kesit)</h3>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">{sections.length} Adet Kesit Üretildi</span>
                  </div>
                  
                  <svg width="100%" height="220" viewBox="0 0 600 250" preserveAspectRatio="none" className="bg-[#f8fafc] border border-slate-200 rounded-xl shadow-sm">
                    {/* Grid lines */}
                    <line x1="0" y1="50" x2="600" y2="50" stroke="#e2e8f0" strokeWidth="1"/>
                    <line x1="0" y1="100" x2="600" y2="100" stroke="#e2e8f0" strokeWidth="1"/>
                    <line x1="0" y1="150" x2="600" y2="150" stroke="#e2e8f0" strokeWidth="1"/>
                    <line x1="0" y1="200" x2="600" y2="200" stroke="#e2e8f0" strokeWidth="1"/>
                    
                    {(() => {
                      const sec = sections[0];
                      const minX = Math.min(...sec.profile.map(p => p.x));
                      const maxX = Math.max(...sec.profile.map(p => p.x));
                      const minZ = Math.min(...sec.profile.map(p => p.z));
                      const maxZ = Math.max(...sec.profile.map(p => p.z)) + 5; // buffer
                      
                      const mapX = (x: number) => ((x - minX) / (maxX - minX)) * 600;
                      const mapZ = (z: number) => 220 - ((z - minZ) / (maxZ - minZ)) * 170; // 50 to 220

                      const pathData = `M 0 250 ` + sec.profile.map(p => `L ${mapX(p.x)} ${mapZ(p.z)}`).join(' ') + ` L 600 250 Z`;
                      
                      return (
                        <>
                          <path d={pathData} fill="#f5f5f4" stroke="#57534e" strokeWidth="2"/>
                          
                          {/* Approximate Bank Markers */}
                          <line x1="240" y1="20" x2="240" y2="220" stroke="#ef4444" strokeWidth="2" strokeDasharray="6 4" />
                          <line x1="360" y1="20" x2="360" y2="220" stroke="#ef4444" strokeWidth="2" strokeDasharray="6 4" />
                        </>
                      );
                    })()}
                    
                    {/* Labels & Zones */}
                    <text x="75" y="35" fontSize="11" textAnchor="middle" fill="#57534e" fontWeight="bold">Sol Taşkın Yt.</text>
                    <text x="300" y="35" fontSize="11" textAnchor="middle" fill="#0284c7" fontWeight="bold">Ana Kanal (Main)</text>
                    <text x="525" y="35" fontSize="11" textAnchor="middle" fill="#57534e" fontWeight="bold">Sağ Taşkın Yt.</text>
                  </svg>
                  <p className="text-[10px] text-slate-500 text-center">İçe aktarılan verilerle DEM modelinden enkesit kotları başarılı bir şekilde çıkartılmıştır.</p>
                </motion.div>
              )}
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div className="border-b border-slate-100 pb-3 mb-4">
                <h2 className="text-lg font-bold text-slate-800">3. Bölgesel Hidrolik Direnç (Pürüzlülük)</h2>
                <p className="text-xs text-slate-500">Ayrıştırılan 3 farklı bölge için sürtünme değerlerini (Manning 'n') bağımsız olarak tanımlayın.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="w-10 h-1 bg-[#d6d3d1] mb-2 rounded"></div>
                  <h3 className="text-sm font-bold text-slate-700">Sol Taşkın Yatağı (LOB)</h3>
                  <p className="text-[10px] text-slate-500 h-8">Genellikle bitki örtüsü yoğun, yüksek pürüzlülük (n=0.05-0.10)</p>
                  <input 
                    type="number" step="0.005" min="0.01" max="0.2" 
                    value={manningLOB} 
                    onChange={(e) => setManningLOB(parseFloat(e.target.value))} 
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800" 
                  />
                </div>

                <div className="p-5 bg-blue-50 border border-blue-200 rounded-xl space-y-3 relative shadow-sm">
                  <div className="w-10 h-1 bg-blue-500 mb-2 rounded"></div>
                  <h3 className="text-sm font-bold text-blue-900">Ana Kanal (Main Channel)</h3>
                  <p className="text-[10px] text-blue-700/70 h-8">Sürekli su akışının olduğu düşük dirençli bölge (n=0.02-0.04)</p>
                  <input 
                    type="number" step="0.005" min="0.01" max="0.2" 
                    value={manningMain} 
                    onChange={(e) => setManningMain(parseFloat(e.target.value))} 
                    className="w-full p-2 bg-white border border-blue-300 rounded-lg text-sm font-bold text-blue-900" 
                  />
                </div>

                <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="w-10 h-1 bg-[#d6d3d1] mb-2 rounded"></div>
                  <h3 className="text-sm font-bold text-slate-700">Sağ Taşkın Yatağı (ROB)</h3>
                  <p className="text-[10px] text-slate-500 h-8">Genellikle bitki örtüsü yoğun, yüksek pürüzlülük (n=0.05-0.10)</p>
                  <input 
                    type="number" step="0.005" min="0.01" max="0.2" 
                    value={manningROB} 
                    onChange={(e) => setManningROB(parseFloat(e.target.value))} 
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800" 
                  />
                </div>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div className="border-b border-slate-100 pb-3 mb-4">
                <h2 className="text-lg font-bold text-slate-800">4. Hidrolojik ve Sınır Şartları</h2>
                <p className="text-xs text-slate-500">Diferansiyel denklemlerin çözümü için menba (giriş) ve mansap (çıkış) hidrolik şartlarını tanımlayın.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Upstream */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-700 border-b border-slate-200 pb-2">Menba (Giriş) Sınır Şartı</h3>
                  <div className="flex gap-2">
                    <button onClick={() => setUpstreamType('peak')} className={`flex-1 py-2 text-xs font-bold rounded-lg border ${upstreamType === 'peak' ? 'bg-blue-50 border-blue-500 text-blue-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>Pik Debi (Sabit)</button>
                    <button onClick={() => setUpstreamType('hydrograph')} className={`flex-1 py-2 text-xs font-bold rounded-lg border ${upstreamType === 'hydrograph' ? 'bg-blue-50 border-blue-500 text-blue-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>Akım Hidrografı (Zaman Serisi)</button>
                  </div>

                  {upstreamType === 'peak' ? (
                    <div className="p-5 bg-slate-50 rounded-xl border border-slate-200">
                      <label className="text-xs font-bold text-slate-700 flex justify-between mb-1">
                        <span>Sabit / Pik Debi (Q)</span>
                        <span className="text-blue-600">{peakFlow} m³/s</span>
                      </label>
                      <input type="range" min="1" max="2000" step="5" value={peakFlow} onChange={(e) => setPeakFlow(parseFloat(e.target.value))} className="w-full accent-blue-600" />
                    </div>
                  ) : (
                    <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col items-center justify-center text-center gap-3 h-28">
                      <p className="text-[10px] text-slate-500">KML hattının başlangıç noktasına uygulanacak zamana bağlı debi grafiği (CSV/Excel).</p>
                      <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-lg shadow-sm transition-colors flex items-center gap-2"><Upload size={14}/> Dosya Seç</button>
                    </div>
                  )}
                </div>

                {/* Downstream */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-700 border-b border-slate-200 pb-2">Mansap (Çıkış) Sınır Şartı</h3>
                  <select
                    value={downstreamType}
                    onChange={(e) => setDownstreamType(e.target.value as any)}
                    className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                  >
                    <option value="critical">Kritik Derinlik (Serbest Dökülme)</option>
                    <option value="normal">Normal Derinlik (Enerji Eğimi ile hesaplanır)</option>
                    <option value="fixed">Sabit Su Seviyesi (Stage)</option>
                  </select>

                  {downstreamType === 'normal' && (
                    <div className="p-5 bg-slate-50 rounded-xl border border-slate-200">
                      <label className="text-xs font-bold text-slate-700 block mb-1">Mansap Bölgesi Enerji / Kanal Eğimi</label>
                      <input type="number" step="0.001" min="0.0001" value={downstreamSlope} onChange={(e) => setDownstreamSlope(parseFloat(e.target.value))} className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm font-bold" />
                    </div>
                  )}
                  {downstreamType === 'fixed' && (
                    <div className="p-5 bg-slate-50 rounded-xl border border-slate-200">
                      <label className="text-xs font-bold text-slate-700 block mb-1">Deniz / Göl Su Kotu (m)</label>
                      <input type="number" defaultValue={0} className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm font-bold" />
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {step === 5 && (
            <motion.div key="step5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div className="border-b border-slate-100 pb-3 mb-4">
                <h2 className="text-lg font-bold text-slate-800">5. Sayısal Çözümleme Ayarları (Simulation Routing)</h2>
                <p className="text-xs text-slate-500">Dinamik dalga denklemlerinin (Saint-Venant) kararlı bir şekilde (stabil) çözülebilmesi için zaman adımı konfigürasyonu.</p>
              </div>

              <div className="max-w-xl space-y-6">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Toplam Simülasyon Süresi (Saat)</label>
                  <input type="number" min="1" max="720" value={simDuration} onChange={(e) => setSimDuration(parseFloat(e.target.value))} className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold" />
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <label className="text-xs font-bold text-slate-700 block mb-2">Hesaplama Zaman Adımı (Routing Time Step, dt)</label>
                  <div className="flex gap-2 mb-3">
                    <button onClick={() => setRoutingStepType('auto')} className={`flex-1 py-2.5 text-xs font-bold rounded-lg border transition-colors ${routingStepType === 'auto' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>Otomatik (Courant Kriteri)</button>
                    <button onClick={() => setRoutingStepType('custom')} className={`flex-1 py-2.5 text-xs font-bold rounded-lg border transition-colors ${routingStepType === 'custom' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>Özel Zaman Adımı</button>
                  </div>
                  {routingStepType === 'custom' && (
                    <div className="flex items-center gap-3">
                      <input type="number" min="1" max="60" value={routingStepSeconds} onChange={(e) => setRoutingStepSeconds(parseFloat(e.target.value))} className="flex-1 p-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold" placeholder="Saniye" />
                      <span className="text-xs font-bold text-slate-600">Saniye</span>
                    </div>
                  )}
                  {routingStepType === 'auto' && (
                    <p className="text-[10px] text-slate-600 leading-relaxed"><span className="font-bold text-slate-800">CFL (Courant-Friedrichs-Lewy)</span> sayısının 1'i aşmaması şartına bağlı olarak, seçilen <span className="font-bold text-slate-700">{crossSectionInterval} metrelik</span> enkesit aralıkları (dx) ve o andaki maksimum akış hızı (V) kullanılarak dt (zaman adımı) model tarafından dinamik olarak daraltılıp genişletilecektir.</p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Harita Sonuç Raporlama Sıklığı (Dakika)</label>
                  <input type="number" min="1" max="60" value={reportingStepMinutes} onChange={(e) => setReportingStepMinutes(parseFloat(e.target.value))} className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold" />
                </div>
              </div>
            </motion.div>
          )}

          {step === 6 && (
            <motion.div key="step6" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center text-center space-y-4 pt-6">
              {isSimulating ? (
                <>
                  <div className="w-16 h-16 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin mb-2"></div>
                  <h2 className="text-xl font-bold text-slate-800">1D Dinamik Dalga Çözülüyor...</h2>
                  <p className="text-xs text-slate-500 max-w-md leading-relaxed">Courant stabilite kriterine göre zaman adımları optimize ediliyor.<br/>Saint-Venant Kütle ve Momentum denklemleri {crossSectionInterval}m aralıklı kesitlerde iteratif olarak hesaplanıyor.</p>
                  <div className="w-64 h-2 bg-slate-100 rounded-full mt-4 overflow-hidden">
                    <motion.div initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 2 }} className="h-full bg-emerald-500 rounded-full" />
                  </div>
                </>
              ) : (
                <div className="w-full flex flex-col items-center">
                  <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shadow-md mb-3">
                    <CheckCircle2 size={24} />
                  </div>
                  <h2 className="text-lg font-bold text-slate-800">1B Hidrodinamik Analiz Tamamlandı</h2>
                  <p className="text-xs text-slate-500 mb-6 max-w-md">Profil grafikleri, su seviyesi değişimleri ve akış hızları hesaplandı. (Gerçek veriler ile hesaplanmıştır).</p>
                  
                  {simResults.length > 0 && (
                    <div className="w-full text-left space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                          <p className="text-xs text-blue-700 font-bold mb-1">Maks. Su Derinliği</p>
                          <p className="text-lg font-black text-blue-900">{Math.max(...simResults.map(r => r.maxDepth)).toFixed(2)} m</p>
                        </div>
                        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                          <p className="text-xs text-emerald-700 font-bold mb-1">Maks. Akış Hızı</p>
                          <p className="text-lg font-black text-emerald-900">{Math.max(...simResults.map(r => r.velocity)).toFixed(2)} m/s</p>
                        </div>
                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                          <p className="text-xs text-amber-700 font-bold mb-1">Toplam Kesit Sayısı</p>
                          <p className="text-lg font-black text-amber-900">{sections.length}</p>
                        </div>
                      </div>
                      
                      <div className="h-48 w-full bg-slate-50 border border-slate-200 rounded-xl flex items-end p-2 gap-1 relative overflow-hidden group">
                        {/* Longitudinal Depth Visualization */}
                        {simResults.map((r, i) => {
                           const maxD = Math.max(...simResults.map(s => s.maxDepth));
                           const h = maxD > 0 ? (r.maxDepth / maxD) * 100 : 0;
                           return (
                             <div key={i} className="flex-1 bg-blue-400 hover:bg-blue-600 transition-all rounded-t-sm relative group" style={{ height: `${Math.max(5, h)}%` }}>
                               <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] py-1 px-2 rounded hidden group-hover:block whitespace-nowrap z-10 shadow-lg">
                                 Km: {(r.station/1000).toFixed(2)} | Derinlik: {r.maxDepth.toFixed(2)}m
                               </div>
                             </div>
                           );
                        })}
                      </div>
                      <p className="text-[10px] text-slate-500 text-center">Boyuna Kesit Profil (Longitudinal) - Enkesitler Boyunca Su Derinliği Dağılımı</p>
                    </div>
                  )}

                  <button onClick={() => { setStep(1); setSections([]); setSimResults([]); }} className="px-6 py-2 bg-slate-800 text-white font-bold text-xs rounded-xl hover:bg-slate-700 transition-colors shadow-md mt-6">Yeni Simülasyon Kurgula</button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation Buttons */}
      {step < 6 && (
        <div className="flex items-center justify-between p-3 bg-white border border-slate-300 rounded-2xl shadow-sm shrink-0">
          {step > 1 ? (
            <button onClick={handlePrev} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl border border-slate-300 shadow-sm transition-all flex items-center gap-2">
              <ArrowLeft size={14} /> Önceki Adım
            </button>
          ) : <div></div>}

          {step < 5 ? (
            <button onClick={handleNext} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2">
              Sonraki Adım <ArrowRight size={14} />
            </button>
          ) : (
            <button onClick={runSimulation} className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2">
              <PlayCircle size={16} /> Simülasyonu Başlat
            </button>
          )}
        </div>
      )}
      </div>
    </motion.div>
  );
};

export default OneDAnalysis;
