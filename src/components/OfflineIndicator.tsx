import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[90] flex items-center gap-2.5 rounded-xl bg-slate-900/95 text-white px-3.5 py-2 text-xs font-medium shadow-xl border border-slate-700 backdrop-blur-xs animate-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400">
        <WifiOff size={14} />
      </div>
      <div className="flex flex-col">
        <span className="font-semibold text-slate-100">Çevrimdışı Mod</span>
        <span className="text-[11px] text-slate-300">Önbellekteki veriler ve GIS araçları devrede.</span>
      </div>
      <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse ml-1" />
    </div>
  );
};
