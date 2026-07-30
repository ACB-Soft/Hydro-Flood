import React from 'react';

const Footer: React.FC = () => {
  const version = import.meta.env.PACKAGE_VERSION || '1.0.0';

  return (
    <footer className="w-full shrink-0 border-t border-white/10 bg-slate-950/90 backdrop-blur-md py-3 px-6 z-40">
      <div className="max-w-7xl mx-auto flex items-center justify-center text-center">
        <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">
          ACB MAPS - HydroFlood v{version}
        </span>
      </div>
    </footer>
  );
};

export default Footer;

