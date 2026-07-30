import React from 'react';
import { motion } from 'motion/react';
import { Droplets, Layers, ChevronRight, Settings, HelpCircle } from 'lucide-react';

interface DashboardProps {
  onSelectMethod: (method: 'hydraulic' | 'bathtub') => void;
  onOpenAbout: () => void;
  onOpenSettings: () => void;
  isSimulating?: boolean;
  progress?: number;
}

const Dashboard: React.FC<DashboardProps> = ({
  onSelectMethod,
  onOpenAbout,
  onOpenSettings,
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Droplets className="text-white" size={26} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
              HydroFlood
            </h1>
            <p className="text-[11px] text-slate-400 font-semibold tracking-wider uppercase">
              ACB MAPS GIS Systems
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          {isSimulating && (
            <div className="flex items-center gap-2 bg-blue-500/10 px-3 py-2 rounded-xl border border-blue-500/20 text-xs font-bold text-blue-400">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-ping" />
              <span>%{Math.round(progress || 0)}</span>
            </div>
          )}

          <button
            onClick={onOpenSettings}
            className="px-4 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all font-bold text-xs sm:text-sm flex items-center gap-2 shadow-sm"
            title="Ayarlar"
          >
            <Settings size={18} />
            <span>Ayarlar</span>
          </button>

          <button
            onClick={onOpenAbout}
            className="px-4 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all font-bold text-xs sm:text-sm flex items-center gap-2 shadow-sm"
            title="Yardım & Hakkında"
          >
            <HelpCircle size={18} />
            <span>Yardım</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <motion.button 
          whileHover={{ md: { x: 8, scale: 1.01 } }}
          whileTap={{ scale: 0.99 }}
          onClick={() => onSelectMethod('bathtub')}
          className="group relative glass rounded-2xl md:rounded-[2.5rem] p-6 md:p-10 text-left overflow-hidden border border-white/20 hover:border-cyan-500/40 transition-all duration-300 shadow-2xl w-full"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-600/10 blur-[100px] -mr-32 -mt-32 group-hover:bg-cyan-600/25 transition-all duration-700" />
          
          <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl sm:rounded-2xl border border-cyan-400/30 flex items-center justify-center shadow-lg shadow-cyan-500/30 shrink-0">
              <Layers className="text-white w-6 h-6 sm:w-8 sm:h-8" />
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-lg sm:text-2xl font-display font-bold text-white group-hover:text-cyan-400 transition-colors flex flex-col items-start gap-1">
                <span className="flex items-center gap-2">
                  Statik Simülasyon
                  <ChevronRight size={20} className="hidden sm:inline opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                </span>
                <span className="text-xs sm:text-base text-slate-400 font-normal font-sans group-hover:text-cyan-400/80 transition-colors">
                  (Bathtub Model)
                </span>
              </h3>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed max-w-2xl">
                Karar destek süreçleri ve hızlı ön değerlendirme için, belirlenen su seviyesi artışına göre hidrolojik bağlantılı çukur alanların dolmasını hesaplar.
              </p>
            </div>
          </div>
        </motion.button>
      </div>
    </motion.div>
  );
};

export default Dashboard;
