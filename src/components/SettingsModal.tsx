import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, RefreshCw, Smartphone, Settings, Info, Bell } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  needRefresh: boolean;
  onUpdate: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, needRefresh, onUpdate }) => {
  const [isChecking, setIsChecking] = React.useState(false);

  const checkUpdates = async () => {
    if (!('serviceWorker' in navigator)) {
      alert('Tarayıcınız servis çalışanlarını desteklemiyor.');
      return;
    }

    setIsChecking(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        // Trigger the update check
        await registration.update();
        
        // Wait a bit to simulate checking if it's too fast
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        if (!registration.waiting && !registration.installing) {
          alert('Uygulamanız güncel. Herhangi bir yeni sürüm bulunamadı.');
        }
      } else {
        alert('Servis çalışanı kaydı bulunamadı. Lütfen sayfayı yenileyin.');
      }
    } catch (err) {
      console.error('Update check failed:', err);
      alert('Güncelleme denetimi sırasında bir hata oluştu.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-lg glass rounded-[2.5rem] overflow-hidden border border-white/20 shadow-2xl"
          >
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-8 text-white">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Settings className="text-blue-400" size={20} />
                    <h3 className="text-2xl font-display font-bold">Ayarlar</h3>
                  </div>
                  <p className="text-slate-400 text-sm">Uygulama tercihleri ve sistem bilgileri</p>
                </div>
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-400"
                >
                  <X size={24} />
                </button>
              </div>
            </div>
            
            <div className="p-8 space-y-6">
              {/* PWA Update Section */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <RefreshCw size={14} className={isChecking ? 'animate-spin' : ''} />
                  Sistem Güncellemeleri
                </h4>
                
                <div className="bg-white/5 border border-white/10 p-5 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-white">Uygulama Sürümü</p>
                      <p className="text-xs text-slate-400">Mevcut sürüm: v1.0.0</p>
                    </div>
                    <button 
                      onClick={checkUpdates}
                      disabled={isChecking}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                        isChecking 
                          ? 'bg-slate-700/50 text-slate-500 border-slate-700 cursor-not-allowed'
                          : 'bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border-blue-600/30'
                      }`}
                    >
                      <RefreshCw size={14} className={isChecking ? 'animate-spin' : ''} />
                      {isChecking ? 'Denetleniyor...' : 'Güncellemeleri Denetle'}
                    </button>
                  </div>

                  {needRefresh && (
                    <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Bell className="text-blue-400 animate-bounce" size={18} />
                        <p className="text-xs text-blue-100 font-medium">Yeni bir sürüm mevcut!</p>
                      </div>
                      <button 
                        onClick={onUpdate}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-bold shadow-lg shadow-blue-600/20"
                      >
                        Şimdi Güncelle
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* About App */}
              <div className="space-y-4 pt-2">
                <div className="bg-slate-900/50 p-4 rounded-2xl flex gap-4 items-start border border-white/5">
                  <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                    <Info size={16} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-white">HydroFlood PWA</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Bu uygulama çevrimdışı çalışma ve yüksek performans için Progressive Web App teknolojisini kullanır. Yeni bir güncelleme olduğunda sistem sizi otomatik olarak uyaracaktır.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-8 bg-white/5 border-t border-white/10 flex justify-end">
              <button 
                onClick={onClose}
                className="px-6 py-3 bg-slate-800 text-white rounded-xl text-sm font-bold hover:bg-slate-700 transition-all border border-white/10"
              >
                Kapat
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SettingsModal;
