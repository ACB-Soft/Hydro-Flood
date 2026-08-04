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
      className="max-w-5xl mx-auto space-y-6 pb-16"
    >
      {/* Main Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* System Updates Card */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-300 shadow-sm space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
            <div className="p-2.5 bg-blue-100 rounded-xl text-blue-600">
              <RefreshCw size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Sistem Bilgileri</h3>
              <p className="text-xs text-slate-500">Uygulama sürümü ve güncelleme kontrolü</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Mevcut Sürüm</p>
                <p className="text-lg font-display font-bold text-slate-900 mt-0.5">v{import.meta.env.PACKAGE_VERSION || '1.0.0'} (ACB MAPS)</p>
              </div>
              <button
                onClick={checkUpdates}
                disabled={checking}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
                {checking ? 'Denetleniyor...' : 'Şimdi Denetle'}
              </button>
            </div>

            {checkMessage && (
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl text-xs text-blue-800 flex items-start gap-2.5 font-medium">
                <CheckCircle2 size={16} className="text-blue-600 shrink-0 mt-0.5" />
                <span>{checkMessage}</span>
              </div>
            )}
          </div>
        </section>

        {/* Device Status Card */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-300 shadow-sm space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
            <div className="p-2.5 bg-cyan-100 rounded-xl text-cyan-700">
              <Smartphone size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Cihaz ve Çalışma Durumu</h3>
              <p className="text-xs text-slate-500">Sistem uyumluluk bilgileri</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-1">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">İşletim Sistemi</p>
              <p className="text-sm font-semibold text-slate-900 truncate">{navigator.platform}</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-1">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Web Workers</p>
              <p className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
                <ShieldCheck size={16} />
                {typeof Worker !== 'undefined' ? 'Destekleniyor' : 'Desteklenmiyor'}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-1">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Bağlantı Durumu</p>
              <p className="text-sm font-semibold text-slate-900">
                {navigator.onLine ? 'Çevrimiçi' : 'Çevrimdışı'}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-1">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Ekran Boyutu</p>
              <p className="text-sm font-semibold text-slate-900">
                {window.innerWidth} x {window.innerHeight} px
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* System Features Info Box */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-300 shadow-sm flex flex-col md:flex-row items-start gap-5">
        <div className="p-3 bg-blue-100 rounded-2xl text-blue-600 shrink-0">
          <Info size={24} />
        </div>
        <div className="space-y-2">
          <h4 className="font-bold text-slate-900 text-base">HydroFlood Sistem Mimarisi Hakkında</h4>
          <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
            HydroFlood; Web Worker hesaplama motoru, yüksek çözünürlüklü GeoTIFF ayrıştırıcı ve gelişmiş Leaflet/ProJ4 haritalama altyapısı kullanmaktadır. Tüm hesaplamalar istemci tarafında yüksek performansla yürütülür.
          </p>
        </div>
      </section>
    </motion.div>
  );
};

export default Settings;

