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
  CheckCircle2
} from 'lucide-react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

interface OneDAnalysisProps {
  onBackToDashboard: () => void;
}

const OneDAnalysis: React.FC<OneDAnalysisProps> = ({ onBackToDashboard }) => {
  const [step, setStep] = useState<number>(1);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationComplete, setSimulationComplete] = useState(false);

  // Step 1: Geometry
  const [crossSectionType, setCrossSectionType] = useState<'trapezoidal' | 'rectangular' | 'triangular' | 'natural'>('trapezoidal');
  const [bottomWidth, setBottomWidth] = useState<number>(10);
  const [sideSlope, setSideSlope] = useState<number>(2);

  // Step 2: Material
  const [manningOption, setManningOption] = useState<string>('0.022');
  const [customManning, setCustomManning] = useState<string>('0.035');

  // Step 3: Boundary Conditions
  const [upstreamType, setUpstreamType] = useState<'peak' | 'hydrograph'>('peak');
  const [peakFlow, setPeakFlow] = useState<number>(150);
  const [downstreamType, setDownstreamType] = useState<'critical' | 'normal' | 'fixed'>('critical');
  const [downstreamSlope, setDownstreamSlope] = useState<number>(0.001);

  // Step 4: Simulation Settings
  const [simDuration, setSimDuration] = useState<number>(24);
  const [routingStepType, setRoutingStepType] = useState<'auto' | 'custom'>('auto');
  const [routingStepSeconds, setRoutingStepSeconds] = useState<number>(5);
  const [reportingStepMinutes, setReportingStepMinutes] = useState<number>(1);

  const handleNext = () => setStep(prev => Math.min(prev + 1, 4));
  const handlePrev = () => setStep(prev => Math.max(prev - 1, 1));

  const runSimulation = () => {
    setIsSimulating(true);
    setStep(5);
    // Fake simulation time
    setTimeout(() => {
      setIsSimulating(false);
      setSimulationComplete(true);
    }, 3000);
  };

  return (
    <motion.div
      key="1d-analysis"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
      className="max-w-5xl mx-auto space-y-6 py-4 px-2"
    >
      {/* Header */}
      <div className="bg-white border border-slate-300 rounded-2xl p-6 shadow-sm relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 sm:h-14 sm:w-14 bg-emerald-100 border border-emerald-300 rounded-2xl flex items-center justify-center text-emerald-700 shrink-0 shadow-sm">
            <Activity size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              1B Dinamik Akış Analizi (1D Routing)
            </h1>
            <p className="text-xs font-medium text-slate-600 mt-1">
              EPA SWMM / Saint-Venant 1D Denklemleri Tabanlı Taşkın Simülatörü
            </p>
          </div>
        </div>
        <button
          onClick={onBackToDashboard}
          className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl border border-slate-300 transition-all flex items-center gap-2"
        >
          <ArrowLeft size={16} />
          <span>Kapat</span>
        </button>
      </div>

      {/* Stepper Wizard Indicator */}
      {step < 5 && (
        <div className="bg-white border border-slate-300 rounded-2xl p-4 shadow-sm flex items-center justify-between relative">
          <div className="absolute top-1/2 left-8 right-8 h-1 bg-slate-100 -translate-y-1/2 z-0 rounded-full" />
          <div className="absolute top-1/2 left-8 h-1 bg-emerald-500 -translate-y-1/2 z-0 rounded-full transition-all duration-500" style={{ width: `${((step - 1) / 3) * 100}%`, maxWidth: 'calc(100% - 4rem)' }} />
          
          {[
            { num: 1, label: 'Geometri', icon: Ruler },
            { num: 2, label: 'Malzeme', icon: Settings2 },
            { num: 3, label: 'Taşkın (Sınır)', icon: Droplets },
            { num: 4, label: 'Simülasyon', icon: Clock }
          ].map((s) => {
            const isActive = step === s.num;
            const isCompleted = step > s.num;
            return (
              <div key={s.num} className="relative z-10 flex flex-col items-center gap-2">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-colors ${
                  isActive ? 'bg-emerald-600 border-emerald-600 text-white shadow-md' :
                  isCompleted ? 'bg-emerald-100 border-emerald-500 text-emerald-700' :
                  'bg-white border-slate-300 text-slate-400'
                }`}>
                  {isCompleted ? <CheckCircle2 size={20} /> : <s.icon size={18} />}
                </div>
                <span className={`text-[10px] uppercase tracking-wider font-bold ${isActive || isCompleted ? 'text-slate-800' : 'text-slate-400'}`}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Wizard Content */}
      <div className="bg-white border border-slate-300 rounded-2xl p-6 shadow-sm min-h-[400px]">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div className="border-b border-slate-100 pb-3 mb-4">
                <h2 className="text-lg font-bold text-slate-800">1. Topografik ve Geometrik Girdiler</h2>
                <p className="text-xs text-slate-500">Nehir aksını ve kanal enkesit geometrisini (Cross-Section) belirleyin.</p>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2"><MapIcon size={16} /> Nehir Merkez Hattı (Aks)</h3>
                  <div className="h-48 bg-slate-100 rounded-xl border border-slate-300 overflow-hidden relative">
                    <MapContainer center={[39.92, 32.85]} zoom={12} className="w-full h-full" zoomControl={false}>
                      <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                    </MapContainer>
                    <div className="absolute inset-0 bg-white/40 flex items-center justify-center z-[1000] backdrop-blur-[1px]">
                      <button className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg shadow-lg hover:bg-slate-800 transition-colors">
                        + Harita Üzerinde Aks Çiz
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500">* [CONDUITS] ve [JUNCTIONS] ağ yapısı, çizilen hat üzerinden PWA tarafından otomatik oluşturulacaktır.</p>
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Ruler size={16} /> Enkesit Geometrisi</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'trapezoidal', label: 'Yamuk Kesit' },
                      { id: 'rectangular', label: 'Dikdörtgen Kesit' },
                      { id: 'triangular', label: 'Üçgen Kesit' },
                      { id: 'natural', label: 'Doğal Kesit (DEM)' }
                    ].map(type => (
                      <button
                        key={type.id}
                        onClick={() => setCrossSectionType(type.id as any)}
                        className={`p-3 text-xs font-bold rounded-xl border ${crossSectionType === type.id ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-emerald-300'}`}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>

                  {crossSectionType !== 'natural' && (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4 mt-4">
                      {crossSectionType !== 'triangular' && (
                        <div>
                          <label className="text-xs font-bold text-slate-700 flex justify-between mb-1">
                            <span>Taban Genişliği (b)</span>
                            <span className="text-emerald-600">{bottomWidth} m</span>
                          </label>
                          <input type="range" min="1" max="50" step="0.5" value={bottomWidth} onChange={(e) => setBottomWidth(parseFloat(e.target.value))} className="w-full accent-emerald-600" />
                        </div>
                      )}
                      {crossSectionType !== 'rectangular' && (
                        <div>
                          <label className="text-xs font-bold text-slate-700 flex justify-between mb-1">
                            <span>Şev Eğimi (z)</span>
                            <span className="text-emerald-600">1:{sideSlope}</span>
                          </label>
                          <input type="range" min="0.5" max="5" step="0.5" value={sideSlope} onChange={(e) => setSideSlope(parseFloat(e.target.value))} className="w-full accent-emerald-600" />
                        </div>
                      )}
                    </div>
                  )}

                  {crossSectionType === 'natural' && (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 mt-4 flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-600">Raster DEM verisinden otomatik çıkarım yapılacaktır.</span>
                      <button className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg shadow-sm">DEM Yükle</button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div className="border-b border-slate-100 pb-3 mb-4">
                <h2 className="text-lg font-bold text-slate-800">2. Hidrolik Direnç (Pürüzlülük)</h2>
                <p className="text-xs text-slate-500">Suyun akış yatağı boyunca karşılaşacağı sürtünme değerlerini (Manning n) belirleyin.</p>
              </div>

              <div className="max-w-lg space-y-4">
                <label className="text-sm font-bold text-slate-700 block">Kanal Malzemesi / Yüzey Tipi</label>
                <select
                  value={manningOption}
                  onChange={(e) => setManningOption(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer"
                >
                  <option value="0.013">Beton Kanal (n = 0.013)</option>
                  <option value="0.022">Temiz Toprak Kanal (n = 0.022)</option>
                  <option value="0.030">Çakıllı/Taşlı Dere Yatağı (n = 0.030)</option>
                  <option value="0.040">Otlu/Çalılık Doğal Dere (n = 0.040)</option>
                  <option value="custom">Özel Değer Gir...</option>
                </select>

                {manningOption === 'custom' && (
                  <div className="pt-2">
                    <label className="text-xs font-bold text-slate-600 block mb-1">Özel Manning (n) Değeri</label>
                    <input
                      type="number" step="0.001" min="0.005" max="0.2"
                      value={customManning}
                      onChange={(e) => setCustomManning(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div className="border-b border-slate-100 pb-3 mb-4">
                <h2 className="text-lg font-bold text-slate-800">3. Hidrolojik ve Sınır Şartları</h2>
                <p className="text-xs text-slate-500">Suyun nereden, ne kadar girip nereden çıkacağını belirten hidrodinamik sınır şartları.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Upstream */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-700 border-b border-slate-200 pb-2">Menba (Giriş) Şartı</h3>
                  <div className="flex gap-2">
                    <button onClick={() => setUpstreamType('peak')} className={`flex-1 py-2 text-xs font-bold rounded-lg border ${upstreamType === 'peak' ? 'bg-blue-50 border-blue-500 text-blue-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>Pik Debi</button>
                    <button onClick={() => setUpstreamType('hydrograph')} className={`flex-1 py-2 text-xs font-bold rounded-lg border ${upstreamType === 'hydrograph' ? 'bg-blue-50 border-blue-500 text-blue-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>Zaman Serisi (Hidrograf)</button>
                  </div>

                  {upstreamType === 'peak' ? (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <label className="text-xs font-bold text-slate-700 flex justify-between mb-1">
                        <span>Sabit / Pik Debi (Q)</span>
                        <span className="text-blue-600">{peakFlow} m³/s</span>
                      </label>
                      <input type="range" min="1" max="1000" step="5" value={peakFlow} onChange={(e) => setPeakFlow(parseFloat(e.target.value))} className="w-full accent-blue-600" />
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col items-center justify-center text-center gap-2 h-24">
                      <p className="text-xs text-slate-500">CSV veya Excel formatında hidrograf tablosu yükleyin (Saat vs Debi).</p>
                      <button className="px-3 py-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-lg shadow-sm">Dosya Seç</button>
                    </div>
                  )}
                </div>

                {/* Downstream */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-700 border-b border-slate-200 pb-2">Mansap (Çıkış) Şartı</h3>
                  <select
                    value={downstreamType}
                    onChange={(e) => setDownstreamType(e.target.value as any)}
                    className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                  >
                    <option value="critical">Kritik Derinlik (Serbest Dökülme)</option>
                    <option value="normal">Normal Derinlik (Kanal Eğimine Göre)</option>
                    <option value="fixed">Sabit/Zamana Bağlı Su Kotu</option>
                  </select>

                  {downstreamType === 'normal' && (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <label className="text-xs font-bold text-slate-700 block mb-1">Mansap Kanal Eğimi (S₀)</label>
                      <input type="number" step="0.001" min="0.0001" value={downstreamSlope} onChange={(e) => setDownstreamSlope(parseFloat(e.target.value))} className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm" />
                    </div>
                  )}
                  {downstreamType === 'fixed' && (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <label className="text-xs font-bold text-slate-700 block mb-1">Sabit Su Kotu (m)</label>
                      <input type="number" defaultValue={0} className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm" />
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div className="border-b border-slate-100 pb-3 mb-4">
                <h2 className="text-lg font-bold text-slate-800">4. Simülasyon Zaman Ayarları</h2>
                <p className="text-xs text-slate-500">1D Dinamik dalga modeli çözücüsü (Routing) için zaman adımları.</p>
              </div>

              <div className="max-w-xl space-y-5">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Toplam Simülasyon Süresi (Saat)</label>
                  <input type="number" min="1" max="720" value={simDuration} onChange={(e) => setSimDuration(parseFloat(e.target.value))} className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold" />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Hesaplama Zaman Adımı (Routing Time Step)</label>
                  <div className="flex gap-2 mb-2">
                    <button onClick={() => setRoutingStepType('auto')} className={`flex-1 py-2 text-xs font-bold rounded-lg border ${routingStepType === 'auto' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>Otomatik (Courant Kriteri)</button>
                    <button onClick={() => setRoutingStepType('custom')} className={`flex-1 py-2 text-xs font-bold rounded-lg border ${routingStepType === 'custom' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>Özel (Saniye)</button>
                  </div>
                  {routingStepType === 'custom' && (
                    <input type="number" min="1" max="60" value={routingStepSeconds} onChange={(e) => setRoutingStepSeconds(parseFloat(e.target.value))} className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold" placeholder="Saniye cinsinden" />
                  )}
                  {routingStepType === 'auto' && (
                    <p className="text-[10px] text-slate-500 bg-slate-100 p-2 rounded-lg">CFL (Courant-Friedrichs-Lewy) koşuluna göre adım saniyeleri modelin dengesini (stabilite) sağlamak adına otomatik ayarlanacaktır.</p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Raporlama Zaman Adımı (Dakika)</label>
                  <input type="number" min="1" max="60" value={reportingStepMinutes} onChange={(e) => setReportingStepMinutes(parseFloat(e.target.value))} className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold" />
                </div>
              </div>
            </motion.div>
          )}

          {step === 5 && (
            <motion.div key="step5" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="h-64 flex flex-col items-center justify-center text-center space-y-4">
              {isSimulating ? (
                <>
                  <div className="w-16 h-16 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin"></div>
                  <h2 className="text-xl font-bold text-slate-800">1D Dinamik Dalga Çözülüyor...</h2>
                  <p className="text-xs text-slate-500 max-w-sm">Diferansiyel momentum ve kütle denklemleri seçili ağ düğümleri (nodes) ve kanallar (conduits) üzerinde hesaplanıyor.</p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shadow-md">
                    <CheckCircle2 size={32} />
                  </div>
                  <h2 className="text-xl font-bold text-slate-800">Analiz Tamamlandı!</h2>
                  <p className="text-xs text-slate-500 mb-4">Sonuçlar başarıyla hesaplandı. Profiller ve su kütle değişimleri hazır.</p>
                  <button onClick={() => setStep(1)} className="px-6 py-2 bg-slate-800 text-white font-bold text-sm rounded-xl hover:bg-slate-700 transition-colors">Yeni Analiz Başlat</button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation Buttons */}
      {step < 5 && (
        <div className="flex items-center justify-between pt-2">
          {step > 1 ? (
            <button onClick={handlePrev} className="px-5 py-3 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-xl border border-slate-300 shadow-sm transition-all flex items-center gap-2">
              <ArrowLeft size={16} /> Önceki Adım
            </button>
          ) : <div></div>}

          {step < 4 ? (
            <button onClick={handleNext} className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl border border-emerald-500 shadow-sm transition-all flex items-center gap-2">
              Sonraki Adım <ArrowRight size={16} />
            </button>
          ) : (
            <button onClick={runSimulation} className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl shadow-lg transition-all flex items-center gap-2">
              <PlayCircle size={18} /> Dinamik Simülasyonu Başlat
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default OneDAnalysis;

