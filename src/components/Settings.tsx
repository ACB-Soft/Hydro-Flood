import React, { useState } from 'react';
import { motion } from 'motion/react';
import { RefreshCw, Smartphone, Settings as SettingsIcon, Info, Bell, ShieldCheck, CheckCircle2, Download, MonitorCheck, Laptop } from 'lucide-react';

interface SettingsProps {
  needRefresh: boolean;
  onUpdate: () => void;
  deferredPrompt?: any;
  isInstalled?: boolean;
  onInstallPWA?: () => void;
}

const Settings: React.FC<SettingsProps> = ({
  needRefresh,
  onUpdate,
  deferredPrompt,
  isInstalled,
  onInstallPWA,
}) => {
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);

  const checkUpdates = async () => {
    setChecking(true);
    setCheckMessage(null);
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.update();
          setCheckMessage('Güncelleme denetimi tamamlandı. Yeni sürüm mevcutsa sistem otomatik bildirecektir.');
        } else {
          // Register SW if not registered
          await navigator.serviceWorker.register('./sw.js', { scope: './' });
          setCheckMessage('Servis çalışanı (Service Worker) başarıyla kaydedildi.');
        }
      } else {
        setCheckMessage('Tarayıcınız PWA Servis Çalışanı teknolojisini desteklemiyor.');
      }
    } catch (err) {
      setCheckMessage('Güncelleme denetlenirken bir hata oluştu.');
    } finally {
      setChecking(false);
    }
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
              Uygulama Ayarları & PWA Kurulumu
            </h2>
            <p className="text-slate-400 text-sm">
              Masaüstü PWA yükleme, güncellemeler ve sistem çalışma tercihleri
            </p>
          </div>
        </div>
      </div>

      {/* PWA Desktop Installation Banner Card */}
      <section className="glass rounded-3xl p-6 sm:p-8 border border-cyan-500/30 space-y-6 relative overflow-hidden bg-gradient-to-r from-cyan-950/40 via-slate-900/60 to-blue-950/40">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-cyan-500/20 rounded-2xl text-cyan-400 border border-cyan-500/30 shrink-0 mt-1">
              <Laptop size={28} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-lg sm:text-xl">
                  HydroFlood Masaüstü Uygulaması (PWA)
                </h3>
                {isInstalled ? (
                  <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-[10px] font-bold flex items-center gap-1">
                    <MonitorCheck size={12} /> Yüklü
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-full text-[10px] font-bold">
                    Kuruluma Hazır
                  </span>
                )}
              </div>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                HydroFlood'u bilgisayarınıza bağımsız bir masaüstü yazılımı olarak yükleyin. Tarayıcı çubuğu olmadan tam ekran çalışır, çevrimdışı önbellekleme desteği sunar.
              </p>
            </div>
          </div>

          <div className="shrink-0 w-full sm:w-auto">
            <button
              onClick={onInstallPWA}
              disabled={isInstalled}
              className={`w-full sm:w-auto px-6 py-3.5 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all shadow-lg ${
                isInstalled
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 cursor-default'
                  : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/25 hover:scale-[1.02]'
              }`}
            >
              <Download size={18} />
              <span>{isInstalled ? 'Masaüstüne Yüklendi' : 'Bilgisayara Yükle (PWA)'}</span>
            </button>
          </div>
        </div>

        {!isInstalled && (
          <div className="pt-4 border-t border-white/10 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-300">
            <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-1">
              <p className="font-bold text-cyan-400">1. Chrome / Edge</p>
              <p className="text-slate-400">Adres çubuğundaki (URL) sağ köşedeki 'Uygulamayı Yükle' simgesine tıklayın.</p>
            </div>
            <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-1">
              <p className="font-bold text-cyan-400">2. Tarayıcı Menüsü</p>
              <p className="text-slate-400">Sağ üst 3 noktadan 'Kaydet ve Paylaş' → 'HydroFlood Yükle' adımlarını izleyin.</p>
            </div>
            <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-1">
              <p className="font-bold text-cyan-400">3. Tam Ekran Performans</p>
              <p className="text-slate-400">Başlat menüsü veya masaüstü kısayolundan tek tıkla başlatın.</p>
            </div>
          </div>
        )}
      </section>

      {/* Main Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* PWA & System Updates Card */}
        <section className="glass rounded-3xl p-6 sm:p-8 border border-white/10 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-white/10">
            <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-400">
              <RefreshCw size={20} />
            </div>
            <div>
              <h3 className="font-bold text-white text-lg">Sistem Güncellemeleri</h3>
              <p className="text-xs text-slate-400">PWA ve uygulama sürüm yönetimi</p>
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

            {needRefresh && (
              <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-5 rounded-2xl text-white space-y-3 shadow-xl">
                <div className="flex items-center gap-3">
                  <Bell className="animate-bounce" size={20} />
                  <div>
                    <p className="font-bold text-sm">Yeni bir güncelleme hazır!</p>
                    <p className="text-xs text-blue-100">En son iyileştirmeleri yüklemek için güncelleyin.</p>
                  </div>
                </div>
                <button
                  onClick={onUpdate}
                  className="w-full py-2.5 bg-white text-blue-700 hover:bg-blue-50 rounded-xl text-xs font-bold transition-colors shadow-sm"
                >
                  Uygulamayı Hemen Güncelle
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Device & PWA Status Card */}
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
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">PWA Desteği</p>
              <p className="text-sm font-semibold text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck size={16} />
                {'serviceWorker' in navigator ? 'Aktif' : 'Desteklenmiyor'}
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

      {/* PWA Features Info Box */}
      <section className="glass rounded-3xl p-6 sm:p-8 border border-white/10 flex flex-col md:flex-row items-start gap-5">
        <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-400 shrink-0">
          <Info size={24} />
        </div>
        <div className="space-y-2">
          <h4 className="font-bold text-white text-base">HydroFlood PWA Teknolojisi Hakkında</h4>
          <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
            HydroFlood, çevrimdışı çalışabilen Progressive Web App (PWA) mimarisi ile geliştirilmiştir. Harita önbellekleme, Web Worker hesaplama altyapısı ve yerel depolama sayesinde internet bağlantısı olmadan da simülasyonlarınızı güvenle çalıştırabilirsiniz.
          </p>
        </div>
      </section>
    </motion.div>
  );
};

export default Settings;

