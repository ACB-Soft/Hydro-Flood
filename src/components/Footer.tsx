import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="w-full py-8 border-t border-white/5 flex flex-col items-center justify-center gap-4 bg-slate-950/20 backdrop-blur-sm mt-12">
      <div className="flex flex-col items-center gap-1">
        <div className="text-sm font-semibold tracking-wider text-slate-400 hover:text-white transition-colors duration-300">
          ACB MAPS - HydroFlood v1.0
        </div>
      </div>
    </footer>
  );
};

export default Footer;
