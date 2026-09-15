import React from 'react';
import { motion } from 'motion/react';
import { 
  Droplets, 
  Settings, 
  HelpCircle, 
  Waves, 
  Layers, 
  Mountain, 
  Activity, 
  ArrowRight
} from 'lucide-react';

interface DashboardProps {
  onSelectMethod: (method: 'hydraulic' | 'bathtub') => void;
  onOpenAbout: () => void;
  onOpenSettings: () => void;
  onOpenDXFAnalysis: () => void;
  onOpenDEMGenerator?: () => void;
  onOpenDynamicFlood?: () => void;
  isSimulating?: boolean;
  progress?: number;
}

const Dashboard: React.FC<DashboardProps> = ({
  onSelectMethod,
  onOpenAbout,
  onOpenSettings,
  onOpenDXFAnalysis,
  onOpenDEMGenerator,
  onOpenDynamicFlood,
  isSimulating,
  progress,
}) => {
  return (
    <motion.div
      key="dashboard"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
      className="max-w-6xl mx-auto space-y-6 py-2 px-1 relative"
    >
      {/* Top Header & Branding Section */}
      <div className="bg-white border border-slate-300 rounded-2xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 sm:h-14 sm:w-14 bg-gradient-to-br from-blue-700 via-cyan-700 to-blue-800 rounded-2xl flex items-center justify-center shadow-md border border-blue-500/30 text-white shrink-0">
                <Droplets size={28} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-black tracking-tight text-slate-900">
                    HydroFlood GIS
                  </h1>
                  <span className="text-[11px] font-bold text-cyan-800 bg-cyan-100 px-2.5 py-0.5 rounded-full border border-cyan-300">
                    v1.0
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2.5 shrink-0 self-start md:self-auto">
            {isSimulating && (
              <div className="flex items-center gap-2 bg-blue-100 px-3 py-2 rounded-xl border border-blue-300 text-xs font-bold text-blue-800 shadow-sm animate-pulse">
                <div className="w-2.5 h-2.5 bg-blue-700 rounded-full animate-ping" />
                <span>%{Math.round(progress || 0)} Simülasyon Devam Ediyor</span>
              </div>
            )}

            <button
              onClick={onOpenSettings}
              className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-800 hover:text-slate-900 hover:bg-slate-100 transition-all font-semibold text-xs sm:text-sm flex items-center gap-2 shadow-sm cursor-pointer"
              title="Sistem Ayarları"
            >
              <Settings size={16} className="text-slate-600" />
              <span>Ayarlar</span>
            </button>

            <button
              onClick={onOpenAbout}
              className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-800 hover:text-slate-900 hover:bg-slate-100 transition-all font-semibold text-xs sm:text-sm flex items-center gap-2 shadow-sm cursor-pointer"
              title="Metodoloji & Kullanım Rehberi"
            >
              <HelpCircle size={16} className="text-slate-600" />
              <span>Metodoloji</span>
            </button>
          </div>
        </div>
      </div>

      {/* Core CBS Module Grid */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* 1. Statik Taşkın Simülasyonu (Bathtub Model) */}
          <div className="bg-white border border-slate-300 hover:border-blue-500 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all space-y-4 flex flex-col justify-between group">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="p-3 bg-blue-100 rounded-xl text-blue-700 border border-blue-200 shrink-0">
                  <Waves size={24} />
                </div>
                <span className="text-xs font-bold text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                  Bathtub Model
                </span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                  Statik Taşkın Simülasyonu
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed mt-1">
                  Topografik yükseklik verileri (DEM) ve hidrolojik BFS bağlantı algoritması kullanarak belirlenen su seviyesi artışına göre çukur alan doldurma, taşkın yayılımı ve risk alanı hesaplaması.
                </p>
              </div>
            </div>

            <button
              onClick={() => onSelectMethod('bathtub')}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-xl border border-blue-500 shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>Simülasyon Modülünü Aç</span>
              <ArrowRight size={16} />
            </button>
          </div>

          {/* 2. Dinamik Taşkın Simülasyonu (Geliştirme Aşamasında) */}
          <div className="bg-white border border-slate-300 hover:border-amber-500 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all space-y-4 flex flex-col justify-between group">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="p-3 bg-amber-100 rounded-xl text-amber-800 border border-amber-200 shrink-0">
                  <Activity size={24} />
                </div>
                <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse" />
                  Geliştirme Aşamasında (v2.0)
                </span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-amber-700 transition-colors">
                  2B Dinamik Hidrodinamik Model
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed mt-1">
                  Manning pürüzsüzlük katsayıları ve debi hidrografı ile 2 boyutlu sığ su denklemleri (Shallow Water Equations - SWE) zamana bağlı su yayılım simülatörü.
                </p>
              </div>
            </div>

            <button
              onClick={onOpenDynamicFlood}
              className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs sm:text-sm rounded-xl border border-amber-500 shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>Dinamik Modülü İncele (Yapım Aşamasında)</span>
              <ArrowRight size={16} />
            </button>
          </div>

          {/* 3. DXF CAD / CBS Harita Analizleri */}
          <div className="bg-white border border-slate-300 hover:border-indigo-500 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all space-y-4 flex flex-col justify-between group">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="p-3 bg-indigo-100 rounded-xl text-indigo-700 border border-indigo-200 shrink-0">
                  <Layers size={24} />
                </div>
                <span className="text-xs font-bold text-indigo-800 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                  CAD & GIS Vector
                </span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">
                  DXF Dosya & CBS Harita Analizleri
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed mt-1">
                  CAD (.dxf) harita çizimlerini yükleyin, katman yönetimini yapın, EPSG projeksiyon dönüşümü ile Google Earth / Esri / OSM altlıkları üzerinde 2D vektör harita analizi gerçekleştirin.
                </p>
              </div>
            </div>

            <button
              onClick={onOpenDXFAnalysis}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm rounded-xl border border-indigo-500 shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>DXF Portalı Aç</span>
              <ArrowRight size={16} />
            </button>
          </div>

          {/* 4. DEM & Topografya Üretici */}
          <div className="bg-white border border-slate-300 hover:border-cyan-500 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all space-y-4 flex flex-col justify-between group">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="p-3 bg-cyan-100 rounded-xl text-cyan-800 border border-cyan-200 shrink-0">
                  <Mountain size={24} />
                </div>
                <span className="text-xs font-bold text-cyan-800 bg-cyan-50 px-2.5 py-1 rounded-lg border border-cyan-200">
                  Raster Generator
                </span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-cyan-700 transition-colors">
                  DEM & Topografya Üretici
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed mt-1">
                  CAD projelerinizdeki kot noktalarından (Point) ve eşyükselti eğrilerinden (Izohips) 3D sayısal yükseklik matrisi (GeoTIFF) oluşturun.
                </p>
              </div>
            </div>

            <button
              onClick={() => onOpenDEMGenerator ? onOpenDEMGenerator() : onOpenDXFAnalysis()}
              className="w-full py-2.5 px-4 bg-cyan-700 hover:bg-cyan-800 text-white font-bold text-xs sm:text-sm rounded-xl border border-cyan-600 shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>DEM Üretici Aç</span>
              <ArrowRight size={16} />
            </button>
          </div>

        </div>
      </div>
    </motion.div>
  );
};

export default Dashboard;
