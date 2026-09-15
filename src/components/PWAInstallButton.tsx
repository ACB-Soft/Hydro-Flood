import React, { useState } from 'react';
import { Download, Smartphone, X, Share, PlusSquare, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'dashboard';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'header' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already installed or running as standalone app, show a subtle active badge or hide
  if (isInstalled) {
    if (variant === 'dashboard') {
      return (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
          <CheckCircle2 size={14} className="text-emerald-600" />
          <span>Uygulama Yüklü</span>
        </div>
      );
    }
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    if (variant === 'dashboard') {
      return (
        <button
          onClick={install}
          className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white transition-all font-semibold text-xs sm:text-sm flex items-center gap-2 shadow-sm shadow-blue-500/20 cursor-pointer"
          title="Uygulamayı Cihaza Yükle (PWA)"
        >
          <Download size={16} />
          <span>Uygulamayı Yükle</span>
        </button>
      );
    }

    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-sm transition-colors cursor-pointer"
        title="Uygulamayı Cihazınıza Yükleyin"
      >
        <Download size={14} />
        <span>PWA Yükle</span>
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not supported by WebKit)
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className={`flex items-center gap-1.5 rounded-xl transition-all font-semibold text-xs cursor-pointer ${
            variant === 'dashboard'
              ? 'px-3.5 py-2.5 bg-white border border-slate-300 text-slate-800 hover:bg-slate-100 shadow-sm'
              : 'px-3 py-1.5 border border-slate-300 text-slate-700 bg-white hover:bg-slate-100'
          }`}
          title="iPhone / iPad'e Yükle"
        >
          <Smartphone size={14} className="text-slate-600" />
          <span>iOS'a Yükle</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 text-slate-900 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                    <Smartphone size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">iPhone / iPad'e Yükle</h3>
                    <p className="text-xs text-slate-500">HydroFlood PWA Kurulumu</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3 text-sm text-slate-700">
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="p-1.5 bg-white rounded-lg border border-slate-200 text-blue-600 shrink-0">
                    <Share size={16} />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">1. Adım:</span> Safari alt araç çubuğundaki <strong className="text-blue-600">Paylaş</strong> butonuna dokunun.
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="p-1.5 bg-white rounded-lg border border-slate-200 text-blue-600 shrink-0">
                    <PlusSquare size={16} />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-900">2. Adım:</span> Açılan menüyü aşağı kaydırıp <strong className="text-blue-600">Ana Ekrana Ekle</strong> seçeneğini seçin.
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
              >
                Anladım
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  const [showInfoModal, setShowInfoModal] = useState(false);

  // If running in desktop browser where beforeinstallprompt hasn't fired yet or not supported
  if (variant === 'dashboard') {
    return (
      <>
        <button
          onClick={() => setShowInfoModal(true)}
          className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-all font-semibold text-xs sm:text-sm flex items-center gap-2 shadow-sm cursor-pointer"
          title="PWA Çevrimdışı & Yükleme Özelliği"
        >
          <Download size={16} className="text-cyan-600" />
          <span>PWA Özellikleri</span>
        </button>

        {showInfoModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 text-slate-900 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-cyan-50 rounded-xl text-cyan-600">
                    <Download size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">PWA Kurulumu</h3>
                    <p className="text-xs text-slate-500">Masaüstü & Mobil Kurulum</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowInfoModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed">
                HydroFlood, <strong>Progressive Web App (PWA)</strong> mimarisindedir. Tarayıcınızın adres çubuğundaki (URL barı) <strong>Yükle</strong> veya <strong>Uygulamayı Kur</strong> simgesine tıklayarak doğrudan cihazınıza tam ekran uygulama olarak yükleyebilirsiniz.
              </p>

              <button
                onClick={() => setShowInfoModal(false)}
                className="w-full rounded-xl bg-cyan-600 py-2.5 text-sm font-semibold text-white hover:bg-cyan-700 transition-colors"
              >
                Anladım
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
