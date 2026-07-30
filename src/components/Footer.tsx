import React from 'react';
import { ExternalLink } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="w-full py-8 border-t border-white/5 flex flex-col items-center justify-center gap-4 bg-slate-950/20 backdrop-blur-sm mt-12">
      <div className="flex flex-col items-center gap-1">
        <div className="text-sm font-semibold tracking-wider text-slate-400 hover:text-white transition-colors duration-300">
          ACB MAPS - HydroFlood v1.0
        </div>
      </div>
      
      <button
        onClick={() => window.open(window.location.href, '_blank')}
        className="flex items-center gap-2 text-[11px] font-bold text-slate-500 hover:text-cyan-400 transition-colors bg-white/5 px-4 py-2 rounded-full border border-white/10"
      >
        <ExternalLink size={12} />
        Yeni Sekmede Aç
      </button>
    </footer>
  );
};

export default Footer;
