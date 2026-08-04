import React from 'react';

const Footer: React.FC = () => {
  const version = '1.0';

  return (
    <footer className="w-full shrink-0 border-t border-slate-300 bg-slate-200 py-3 px-6 z-40">
      <div className="max-w-7xl mx-auto flex items-center justify-center text-center">
        <span className="text-xs font-semibold text-slate-600 tracking-wider uppercase">
          ACB MAPS - HydroFlood v{version}
        </span>
      </div>
    </footer>
  );
};

export default Footer;

