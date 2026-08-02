import React from 'react';
import { motion } from 'motion/react';
import { Droplets, ChevronRight, Settings, HelpCircle, ArrowUpRight, Sparkles } from 'lucide-react';

interface DashboardProps {
  onSelectMethod: (method: 'hydraulic' | 'bathtub') => void;
  onOpenAbout: () => void;
  onOpenSettings: () => void;
  onOpenDXFAnalysis: () => void;
  onOpenDEMGenerator?: () => void;
  isSimulating?: boolean;
  progress?: number;
}

const Dashboard: React.FC<DashboardProps> = ({
  onSelectMethod,
  onOpenAbout,
  onOpenSettings,
  onOpenDXFAnalysis,
  onOpenDEMGenerator,
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
      className="max-w-4xl mx-auto space-y-7 py-3 relative"
    >
      {/* Background Ambient Glow Accents */}
      <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-96 h-96 bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none -z-10" />
      <div className="absolute top-1/2 -right-24 w-80 h-80 bg-blue-600/10 blur-[100px] rounded-full pointer-events-none -z-10" />

      {/* Dashboard Top Branding & Action Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-white/10 backdrop-blur-sm">
        <div className="flex items-center justify-center gap-3.5">
          <div className="h-12 sm:h-14 w-12 sm:w-14 bg-gradient-to-br from-blue-600 via-cyan-500 to-blue-500 rounded-2xl flex items-center justify-center shadow-xl shadow-cyan-500/25 border border-cyan-300/30 shrink-0 group">
            <Droplets className="text-white w-6 h-6 sm:w-7 sm:h-7 transition-transform group-hover:scale-110" />
          </div>
          <h1 className="h-12 sm:h-14 flex items-center text-3xl sm:text-4xl md:text-5xl font-display font-extrabold tracking-tight leading-none bg-gradient-to-r from-blue-400 via-cyan-300 to-cyan-100 bg-clip-text text-transparent drop-shadow-sm">
            HydroFlood
          </h1>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3 justify-end">
          {isSimulating && (
            <div className="flex items-center gap-2 bg-cyan-500/15 px-3 py-2 rounded-xl border border-cyan-400/30 text-xs font-bold text-cyan-300 shadow-sm animate-pulse">
              <div className="w-2 h-2 bg-cyan-400 rounded-full animate-ping" />
              <span>%{Math.round(progress || 0)} Simülasyon</span>
            </div>
          )}

          <button
            onClick={onOpenSettings}
            className="px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800/90 hover:border-cyan-500/40 transition-all font-semibold text-xs sm:text-sm flex items-center gap-2 shadow-md hover:shadow-cyan-500/10 active:scale-95"
            title="Ayarlar"
          >
            <Settings size={17} className="text-slate-400 group-hover:text-cyan-400" />
            <span>Ayarlar</span>
          </button>

          <button
            onClick={onOpenAbout}
            className="px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800/90 hover:border-cyan-500/40 transition-all font-semibold text-xs sm:text-sm flex items-center gap-2 shadow-md hover:shadow-cyan-500/10 active:scale-95"
            title="Yardım & Hakkında"
          >
            <HelpCircle size={17} className="text-slate-400 group-hover:text-cyan-400" />
            <span>Yardım</span>
          </button>
        </div>
      </div>

      {/* 3 Analysis Cards */}
      <div className="space-y-4 pt-1">
        
        {/* 1. Statik Taşkın Simülasyonu */}
        <motion.button 
          whileHover={{ x: 4, scale: 1.006 }}
          whileTap={{ scale: 0.994 }}
          onClick={() => onSelectMethod('bathtub')}
          className="group relative bg-slate-900/70 backdrop-blur-xl rounded-2xl p-6 text-left overflow-hidden border border-white/10 hover:border-cyan-400/50 transition-all duration-300 shadow-xl hover:shadow-2xl hover:shadow-cyan-500/15 w-full flex flex-col justify-center min-h-[104px]"
        >
          {/* Ambient Card Radial Glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-cyan-500/15 to-blue-600/5 blur-[90px] -mr-28 -mt-28 group-hover:from-cyan-500/25 transition-all duration-700" />
          <div className="absolute left-0 bottom-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

          <div className="relative z-10 space-y-1.5 w-full">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base sm:text-lg font-display font-bold text-white group-hover:text-cyan-300 transition-colors flex items-center gap-2.5">
                Statik Taşkın Simülasyonu
                <span className="text-xs text-cyan-400/80 font-normal font-sans bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20">
                  Bathtub Model
                </span>
              </h3>
              <div className="w-8 h-8 rounded-full bg-slate-800/80 group-hover:bg-cyan-500/20 border border-slate-700/80 group-hover:border-cyan-400/40 flex items-center justify-center transition-all shrink-0">
                <ChevronRight size={18} className="text-slate-400 group-hover:text-cyan-300 transition-transform group-hover:translate-x-0.5" />
              </div>
            </div>
            <p className="text-slate-400 text-xs sm:text-sm leading-relaxed max-w-2xl">
              Su seviyesi artışına göre çukur alan dolumunu ve taşkın yayılımını hesaplar.
            </p>
          </div>
        </motion.button>

        {/* 2. Dinamik Taşkın Simülasyonu (Yapım Aşamasında) */}
        <motion.div 
          whileHover={{ scale: 1.002 }}
          className="group relative bg-slate-950/50 backdrop-blur-lg rounded-2xl p-6 text-left overflow-hidden border border-amber-500/20 transition-all duration-300 shadow-md w-full flex flex-col justify-center min-h-[104px] cursor-not-allowed"
        >
          <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/5 blur-[80px] -mr-24 -mt-24" />
          
          <div className="relative z-10 space-y-1.5 w-full">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-display font-bold text-slate-300 flex items-center gap-2">
                Dinamik Taşkın Simülasyonu
              </h3>
            </div>
            <p className="text-amber-400/90 text-xs sm:text-sm font-semibold leading-relaxed flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Yapım Aşamasında
            </p>
          </div>
        </motion.div>

        {/* 3. DXF Dosya Analizleri */}
        <motion.button
          whileHover={{ x: 4, scale: 1.006 }}
          whileTap={{ scale: 0.994 }}
          onClick={onOpenDXFAnalysis}
          className="group relative bg-slate-900/70 backdrop-blur-xl rounded-2xl p-6 text-left overflow-hidden border border-white/10 hover:border-indigo-400/50 transition-all duration-300 shadow-xl hover:shadow-2xl hover:shadow-indigo-500/15 w-full flex flex-col justify-center min-h-[104px]"
        >
          {/* Ambient Card Radial Glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-indigo-500/15 to-blue-600/5 blur-[90px] -mr-28 -mt-28 group-hover:from-indigo-500/25 transition-all duration-700" />
          <div className="absolute left-0 bottom-0 w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

          <div className="relative z-10 space-y-1.5 w-full">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base sm:text-lg font-display font-bold text-white group-hover:text-indigo-300 transition-colors flex items-center gap-2.5">
                DXF Dosya Analizleri
                <span className="text-xs text-indigo-400/80 font-normal font-sans bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
                  CAD / GIS
                </span>
              </h3>
              <div className="w-8 h-8 rounded-full bg-slate-800/80 group-hover:bg-indigo-500/20 border border-slate-700/80 group-hover:border-indigo-400/40 flex items-center justify-center transition-all shrink-0">
                <ChevronRight size={18} className="text-slate-400 group-hover:text-indigo-300 transition-transform group-hover:translate-x-0.5" />
              </div>
            </div>
            <p className="text-slate-400 text-xs sm:text-sm leading-relaxed max-w-2xl">
              CAD haritalarını görüntüleyin, katman yönetimi ve koordinatlandırma yapın.
            </p>
          </div>
        </motion.button>

      </div>
    </motion.div>
  );
};

export default Dashboard;
