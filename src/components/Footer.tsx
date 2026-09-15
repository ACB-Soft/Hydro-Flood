import React from 'react';

const Footer: React.FC = () => {
  const version = '1.0';

  return (
    <footer 
      id="app-footer"
      className="w-full fixed bottom-0 left-0 right-0 z-50 bg-slate-200/95 backdrop-blur-md border-t border-slate-300 py-2 sm:py-2.5 px-4 sm:px-6 shadow-sm md:relative md:bg-slate-200 md:shadow-none shrink-0 transition-all"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-center text-center">
        <span className="text-[11px] sm:text-xs font-semibold text-slate-600 tracking-wider uppercase">
          ACB MAPS - HydroFlood v{version}
        </span>
      </div>
    </footer>
  );
};

export default Footer;

