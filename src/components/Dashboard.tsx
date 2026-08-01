import React from 'react';
import { motion } from 'motion/react';
import { Droplets, Layers, ChevronRight, Settings, HelpCircle, Globe, Activity, Construction } from 'lucide-react';

interface DashboardProps {
  onSelectMethod: (method: 'hydraulic' | 'bathtub') => void;
  onOpenAbout: () => void;
  onOpenSettings: () => void;
  onOpenDXFAnalysis: () => void;
  isSimulating?: boolean;
  progress?: number;
}

const Dashboard: React.FC<DashboardProps> = ({
  onSelectMethod,
  onOpenAbout,
  onOpenSettings,
  onOpenDXFAnalysis,
  isSimulating,
  progress,
}) => {
  return (
    <motion.div
      key="dashboard"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-4xl mx-auto space-y-6 py-2"
    >
      {/* Dashboard Top Branding & Action Bar (Replaces Global Header on Dashboard) */}
      <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div className="sm:absolute sm:left-1/2 sm:-translate-x-1/2 flex items-center justify-center gap-3.5 w-full sm:w-auto">
          <div className="h-12 sm:h-14 w-12 sm:w-14 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0">
            <Droplets className="text-white w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <h1 className="h-12 sm:h-14 flex items-center text-3xl sm:text-4xl md:text-5xl font-display font-extrabold tracking-tight leading-none bg-gradient-to-r from-blue-400 via-cyan-300 to-cyan-200 bg-clip-text text-transparent text-center">
            HydroFlood
          </h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-end ml-auto">
          {isSimulating && (
            <div className="flex items-center gap-2 bg-blue-500/10 px-3 py-2 rounded-xl border border-blue-500/20 text-xs font-bold text-blue-400">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-ping" />
              <span>%{Math.round(progress || 0)}</span>
            </div>
          )}

          <button
            onClick={onOpenSettings}
            className="px-3.5 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all font-bold text-xs sm:text-sm flex items-center gap-2 shadow-sm"
            title="Ayarlar"
          >
            <Settings size={18} />
            <span>Ayarlar</span>
          </button>

          <button
            onClick={onOpenAbout}
            className="px-3.5 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all font-bold text-xs sm:text-sm flex items-center gap-2 shadow-sm"
            title="Yardım & Hakkında"
          >
            <HelpCircle size={18} />
            <span>Yardım</span>
          </button>
        </div>
      </div>

      {/* 3 Analysis Buttons */}
      <div className="space-y-3.5 pt-2">
        {/* 1. Statik Taşkın Simülasyonu */}
        <motion.button 
          whileHover={{ x: 4, scale: 1.005 }}
          whileTap={{ scale: 0.995 }}
          onClick={() => onSelectMethod('bathtub')}
          className="group relative glass rounded-2xl p-5 text-left overflow-hidden border border-white/15 hover:border-cyan-500/40 transition-all duration-300 shadow-xl w-full flex flex-col justify-center min-h-[96px]"
        >
          <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-600/10 blur-[80px] -mr-24 -mt-24 group-hover:bg-cyan-600/25 transition-all duration-700" />
          
          <div className="relative z-10 space-y-1 w-full">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base sm:text-lg font-display font-bold text-white group-hover:text-cyan-400 transition-colors flex items-center gap-2">
                Statik Taşkın Simülasyonu
                <span className="text-xs text-slate-400 font-normal font-sans">
                  (Bathtub Model)
                </span>
              </h3>
              <ChevronRight size={18} className="text-slate-400 opacity-60 group-hover:opacity-100 group-hover:text-cyan-400 transition-all group-hover:translate-x-1 shrink-0" />
            </div>
            <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
              Su seviyesi artışına göre çukur alan dolumunu ve taşkın yayılımını hesaplar.
            </p>
          </div>
        </motion.button>

        {/* 2. Dinamik Taşkın Simülasyonu (Yapım Aşamasında) */}
        <motion.div 
          whileHover={{ scale: 1.002 }}
          className="group relative glass rounded-2xl p-5 text-left overflow-hidden border border-white/10 opacity-85 transition-all duration-300 shadow-md w-full flex flex-col justify-center min-h-[96px] bg-slate-900/40 cursor-not-allowed"
        >
          <div className="relative z-10 space-y-1 w-full">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-display font-bold text-slate-300 flex items-center gap-2">
                Dinamik Taşkın Simülasyonu
              </h3>
            </div>
            <p className="text-amber-400/90 text-xs sm:text-sm font-medium leading-relaxed">
              Yapım Aşamasında
            </p>
          </div>
        </motion.div>

        {/* 3. DXF Dosya Analizleri */}
        <motion.button
          whileHover={{ x: 4, scale: 1.005 }}
          whileTap={{ scale: 0.995 }}
          onClick={onOpenDXFAnalysis}
          className="group relative glass rounded-2xl p-5 text-left overflow-hidden border border-white/15 hover:border-cyan-500/40 transition-all duration-300 shadow-xl w-full flex flex-col justify-center min-h-[96px]"
        >
          <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/10 blur-[80px] -mr-24 -mt-24 group-hover:bg-cyan-500/20 transition-all duration-700" />
          
          <div className="relative z-10 space-y-1 w-full">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base sm:text-lg font-display font-bold text-white group-hover:text-cyan-400 transition-colors flex items-center gap-2">
                DXF Dosya Analizleri
              </h3>
              <ChevronRight size={18} className="text-slate-400 opacity-60 group-hover:opacity-100 group-hover:text-cyan-400 transition-all group-hover:translate-x-1 shrink-0" />
            </div>
            <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
              CAD haritalarını görüntüleyin, koordinatlandırın ve DEM üretin.
            </p>
          </div>
        </motion.button>
      </div>
    </motion.div>
  );
};

export default Dashboard;
