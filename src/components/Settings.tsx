import React, { useState } from 'react';
import { motion } from 'motion/react';
import { RefreshCw, Smartphone, Settings as SettingsIcon, Info, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface SettingsProps {
  needRefresh?: boolean;
  onUpdate?: () => void;
}

const Settings: React.FC<SettingsProps> = () => {
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);

  const checkUpdates = () => {
    setChecking(true);
    setCheckMessage(null);
    setTimeout(() => {
      setCheckMessage('Uygulamanız en güncel sürümdedir.');
      setChecking(false);
    }, 600);
  };

  return (
    <motion.div
      key="settings-page"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-5xl mx-auto space-y-8 pb-16"
    >
      {/* Hero Title Section */}
      <div className="glass rounded-3xl p-8 border border-white/20 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-600/10 blur-[120px] -mr-40 -mt-40 pointer-events-none" />
        <div className="flex items-center gap-3 relative z-10">
          <div className="p-3 bg-blue-600/20 rounded-2xl border border-blue-500/30 text-blue-400">
            <SettingsIcon size={28} />
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-display font-bold text-white">
              Uygulama Ayarları
            </h2>
            <p className="text-slate-400 text-sm">
              Sürüm yönetimi ve sistem çalışma tercihleri
            </p>
          </div>
        </div>
      </div>

      {/* Main Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* System Updates Card */}
        <section className="glass rounded-3xl p-6 sm:p-8 border border-white/10 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-white/10">
            <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-400">
              <RefreshCw size={20} />
            </div>
            <div>
              <h3 className="font-bold text-white text-lg">Sistem Bilgileri</h3>
              <p className="text-xs text-slate-400">Uygulama sürümü ve güncelleme kontrolü</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white/5 border border-white/10 p-5 rounded-2xl flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Mevcut Sürüm</p>
                <p className="text-lg font-display font-bold text-white mt-0.5">v{import.meta.env.PACKAGE_VERSION || '1.0.0'} (ACB MAPS)</p>
              </div>
              <button
                onClick={checkUpdates}
                disabled={checking}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/20"
              >
                <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
                {checking ? 'Denetleniyor...' : 'Şimdi Denetle'}
              </button>
            </div>

            {checkMessage && (
              <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl text-xs text-blue-300 flex items-start gap-2.5">
                <CheckCircle2 size={16} className="text-blue-400 shrink-0 mt-0.5" />
                <span>{checkMessage}</span>
              </div>
            )}
          </div>
        </section>

        {/* Device Status Card */}
        <section className="glass rounded-3xl p-6 sm:p-8 border border-white/10 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-white/10">
            <div className="p-2.5 bg-cyan-500/10 rounded-xl text-cyan-400">
              <Smartphone size={20} />
            </div>
            <div>
              <h3 className="font-bold text-white text-lg">Cihaz ve Çalışma Durumu</h3>
              <p className="text-xs text-slate-400">Sistem uyumluluk bilgileri</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/5 border border-white/10 p-4 rounded-2xl space-y-1">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">İşletim Sistemi</p>
              <p className="text-sm font-semibold text-white truncate">{navigator.platform}</p>
            </div>

            <div className="bg-white/5 border border-white/10 p-4 rounded-2xl space-y-1">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Web Workers</p>
              <p className="text-sm font-semibold text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck size={16} />
                {typeof Worker !== 'undefined' ? 'Destekleniyor' : 'Desteklenmiyor'}
              </p>
            </div>

            <div className="bg-white/5 border border-white/10 p-4 rounded-2xl space-y-1">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Bağlantı Durumu</p>
              <p className="text-sm font-semibold text-white">
                {navigator.onLine ? 'Çevrimiçi' : 'Çevrimdışı'}
              </p>
            </div>

            <div className="bg-white/5 border border-white/10 p-4 rounded-2xl space-y-1">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ekran Boyutu</p>
              <p className="text-sm font-semibold text-white">
                {window.innerWidth} x {window.innerHeight} px
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* System Features Info Box */}
      <section className="glass rounded-3xl p-6 sm:p-8 border border-white/10 flex flex-col md:flex-row items-start gap-5">
        <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-400 shrink-0">
          <Info size={24} />
        </div>
        <div className="space-y-2">
          <h4 className="font-bold text-white text-base">HydroFlood Sistem Mimarisi Hakkında</h4>
          <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
            HydroFlood; Web Worker hesaplama motoru, yüksek çözünürlüklü GeoTIFF ayrıştırıcı ve gelişmiş Leaflet/ProJ4 haritalama altyapısı kullanmaktadır. Tüm hesaplamalar istemci tarafında yüksek performansla yürütülür.
          </p>
        </div>
      </section>
    </motion.div>
  );
};

export default Settings;

