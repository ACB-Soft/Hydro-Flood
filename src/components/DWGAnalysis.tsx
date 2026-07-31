import React from 'react';
import { motion } from 'motion/react';
import { FileCode, Globe, Info, Construction, ChevronLeft } from 'lucide-react';

const DWGAnalysis: React.FC = () => {
  return (
    <motion.div
      key="dwg-analysis"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="space-y-6 pb-12 max-w-4xl mx-auto"
    >
      {/* Header Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-4 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-2xl border border-amber-500/30 text-amber-400 shadow-md">
              <FileCode className="animate-pulse text-amber-400" size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-display font-bold text-white tracking-tight">
                  DWG Dosya Analizleri
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                  Geliştirme Aşamasında
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                AutoCAD DWG formatındaki çizimlerinizi web tabanlı görüntüleme, katman analizi ve Sayısal Yükseklik Modeli (DEM) entegrasyonu hazırlık aşamasındadır.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Body Content Placeholder */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-8 text-center space-y-6 shadow-lg flex flex-col items-center justify-center min-h-[350px]">
        <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-400">
          <Construction size={32} />
        </div>
        
        <div className="space-y-2 max-w-md">
          <h3 className="text-lg font-bold text-slate-200">DWG Modülü Yakında Aktif Edilecek</h3>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            Şu anda DGN (MicroStation) harita okuma, 2D/3D analiz ve TIN interpolasyon modülleri aktiftir. DWG formatı için parser motoru ve katman filtreleme altyapısı bu bölüm altında tasarlanacaktır.
          </p>
        </div>

        <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 font-mono">
          <Info size={14} className="text-amber-400 shrink-0" />
          <span>dwgParser.ts & AutoCAD Binary SDK entegrasyonu bekleniyor</span>
        </div>
      </div>
    </motion.div>
  );
};

export default DWGAnalysis;
