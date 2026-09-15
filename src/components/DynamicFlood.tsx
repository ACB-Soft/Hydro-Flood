import React from 'react';
import { motion } from 'motion/react';
import { 
  Activity, 
  Clock, 
  Construction, 
  Waves, 
  Sparkles, 
  ArrowLeft, 
  CheckCircle2, 
  Cpu, 
  Gauge, 
  Layers, 
  ShieldAlert,
  Sliders
} from 'lucide-react';

interface DynamicFloodProps {
  onBackToDashboard: () => void;
}

const DynamicFlood: React.FC<DynamicFloodProps> = ({ onBackToDashboard }) => {
  return (
    <motion.div
      key="dynamic-flood"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
      className="max-w-5xl mx-auto space-y-6 py-4 px-2"
    >
      {/* Hero Header Card */}
      <div className="bg-white border border-slate-300 rounded-2xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 sm:h-14 sm:w-14 bg-amber-100 border border-amber-300 rounded-2xl flex items-center justify-center text-amber-700 shrink-0 shadow-sm">
                <Activity size={28} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight">
                    2B Dinamik Hidrodinamik Taşkın Modeli
                  </h1>
                </div>
                <p className="text-xs sm:text-sm font-medium text-slate-600 mt-1">
                  2D Shallow Water Equations (SWE) & Zamana Bağlı Debi Hidrografı Simülatörü
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={onBackToDashboard}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm rounded-xl border border-slate-300 shadow-sm flex items-center gap-2 transition-all self-start md:self-auto cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span>Dashboard'a Dön</span>
          </button>
        </div>
      </div>

      {/* Main Under Construction Notice Banner */}
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-50 to-orange-500/10 border-2 border-amber-400 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="p-4 bg-amber-500 text-slate-950 rounded-2xl shadow-md border border-amber-400 shrink-0">
            <Construction size={32} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 bg-amber-600 text-white font-black text-xs uppercase tracking-wider rounded-md shadow-sm">
                Yapım Aşamasında
              </span>
              <span className="text-xs font-bold text-amber-800">
                Geliştirme Versiyonu: v2.0-Alpha
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              Bu Modül Aktif Olarak Geliştirilmektedir
            </h2>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              2 Boyutlu Dinamik Hidrodinamik Taşkın Modeli (SWE Motoru) henüz test ve optimizasyon aşamasındadır. Yakın zamanda GPU/WebAssembly hızlandırmalı sığ su diferansiyel denklem çözücüsü ile hizmetinize sunulacaktır.
            </p>
          </div>
        </div>

        {/* Progress status indicators */}
        <div className="bg-white/80 border border-amber-300 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-center gap-3">
            <Clock size={20} className="text-amber-700 shrink-0" />
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase">Tahmini Tamamlanma</p>
              <p className="text-xs font-bold text-slate-900">v2.0 Güncellemesi ile</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Cpu size={20} className="text-amber-700 shrink-0" />
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase">Hesaplama Motoru</p>
              <p className="text-xs font-bold text-slate-900">Wasm C++ / SWE 2D</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Gauge size={20} className="text-amber-700 shrink-0" />
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase">Geliştirme Durumu</p>
              <p className="text-xs font-bold text-amber-800 font-semibold">%65 Tamamlandı</p>
            </div>
          </div>
        </div>
      </div>

      {/* Planned Feature Breakdown Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 px-1">
          <Sparkles size={16} className="text-cyan-600" />
          Hazırlanan Dinamik Simülasyon Özellikleri
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1 */}
          <div className="bg-white border border-slate-300 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-100 rounded-xl border border-blue-200 text-blue-700 shrink-0">
                <Waves size={20} />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">2B Sığ Su Denklemleri (Shallow Water Equations)</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Kütle ve korunum momentum denklemlerini (Saint-Venant 2D) hücre bazında çözerek taşkın dalgasının zamana bağlı yayılımını, hızını (u, v) ve derinliğini hesaplar.
            </p>
            <div className="flex items-center gap-2 text-[11px] font-semibold text-emerald-700">
              <CheckCircle2 size={14} /> Algoritma Çekirdeği Hazırlandı
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-white border border-slate-300 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-cyan-100 rounded-xl border border-cyan-200 text-cyan-700 shrink-0">
                <Sliders size={20} />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Zamana Bağlı Debi Hidrografı (Q-t Curve)</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Belirli debi giriş noktalarından zaman serili (m³/s) fırtına ötelenme hidrografları tanımlayarak taşkın pik anı ve çekilme süreleri simüle edilir.
            </p>
            <div className="flex items-center gap-2 text-[11px] font-semibold text-emerald-700">
              <CheckCircle2 size={14} /> Hidrograf Arayüzü Aşamasında
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-white border border-slate-300 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-100 rounded-xl border border-indigo-200 text-indigo-700 shrink-0">
                <Layers size={20} />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Manning Pürüzsüzlük Katman Haritası</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Arazi kullanım tipine (bina, yol, tarım, orman vb.) göre mekansal olarak değişkenlik gösteren Manning pürüzsüzlük katsayısı (n) matrisi uygulanır.
            </p>
            <div className="flex items-center gap-2 text-[11px] font-semibold text-amber-700">
              <Clock size={14} /> Test Aşamaları Sürüyor
            </div>
          </div>

          {/* Card 4 */}
          <div className="bg-white border border-slate-300 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-100 rounded-xl border border-purple-200 text-purple-700 shrink-0">
                <ShieldAlert size={20} />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Vektörel Su Hızı & Risk Vektörleri</h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Hücre bazında suyun akış hızı (m/s) ve yönü oklu vektörlerle görselleştirilerek insan ve yapı güvenliği açısından tehlike haritaları oluşturulur.
            </p>
            <div className="flex items-center gap-2 text-[11px] font-semibold text-amber-700">
              <Clock size={14} /> Görselleştirme Testi
            </div>
          </div>
        </div>
      </div>

      {/* Return to Dashboard CTA */}
      <div className="bg-white border border-slate-300 rounded-2xl p-6 text-center space-y-3 shadow-sm">
        <p className="text-xs text-slate-600">
          Mevcut topografik yükseklik verileri ve hidrolojik bağlantı analizi ile hızlı sonuç almak için Statik (Bathtub) Taşkın Simülasyonu modülünü kullanabilirsiniz.
        </p>
        <button
          onClick={onBackToDashboard}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-xl border border-blue-500 shadow-sm inline-flex items-center gap-2 transition-all cursor-pointer"
        >
          <ArrowLeft size={16} />
          <span>Dashboard Ekranına Dön</span>
        </button>
      </div>
    </motion.div>
  );
};

export default DynamicFlood;
