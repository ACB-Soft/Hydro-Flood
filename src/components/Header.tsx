import React from 'react';
import { ChevronLeft } from 'lucide-react';

interface HeaderProps {
  activeTab: 'dashboard' | 'analysis' | 'about' | 'settings' | 'dxf-analysis' | 'dem-generator';
  setActiveTab: (tab: 'dashboard' | 'analysis' | 'about' | 'settings' | 'dxf-analysis' | 'dem-generator') => void;
  currentStep: number;
  setCurrentStep: React.Dispatch<React.SetStateAction<number>>;
  isSimulating: boolean;
  progress: number;
  simMethod?: 'hydraulic' | 'bathtub' | null;
}

const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  currentStep,
  setCurrentStep,
  isSimulating,
  progress,
  simMethod,
}) => {
  const handleBack = () => {
    if (activeTab === 'analysis' && currentStep === 5) {
      setCurrentStep(1);
    } else if (activeTab === 'dem-generator') {
      setActiveTab('dxf-analysis');
    } else {
      setActiveTab('dashboard');
      setCurrentStep(1);
    }
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case 'settings':
        return 'Uygulama Ayarları';
      case 'about':
        return 'Yardım & Hakkında';
      case 'dxf-analysis':
        return 'DXF Dosya Analizleri';
      case 'dem-generator':
        return 'Sayısal Yükseklik Modeli (DEM) Üretici';
      case 'analysis':
        if (currentStep === 5) {
          return 'Statik Simülasyon Sonucu';
        }
        return simMethod === 'bathtub' ? 'Statik Taşkın Simülasyonu' : 'Hidrolik Taşkın Simülasyonu';
      default:
        return '';
    }
  };

  return (
    <header className="w-full shrink-0 z-50 glass border-b border-white/10 px-4 sm:px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3 sm:gap-4">
          {activeTab !== 'dashboard' && (
            <button
              onClick={handleBack}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors text-blue-400 border border-white/10"
              title="Geri Dön"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <h1 className="text-xl sm:text-2xl font-display font-bold text-white tracking-tight">
            {getPageTitle()}
          </h1>

          {isSimulating && (
            <div className="hidden sm:flex items-center gap-3 bg-blue-500/10 px-4 py-2 rounded-xl border border-blue-500/20 animate-pulse ml-4">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-ping" />
              <span className="text-xs font-bold text-blue-400">Simülasyon Çalışıyor... %{Math.round(progress)}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {isSimulating && (
            <div className="sm:hidden flex items-center gap-2 bg-blue-500/10 p-2 rounded-lg border border-blue-500/20">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-ping" />
              <span className="text-[10px] font-bold text-blue-400">%{Math.round(progress)}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
