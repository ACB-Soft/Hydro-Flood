import React from 'react';
import { motion } from 'motion/react';
import { BookOpen, MapPin, Upload, Sliders, Play, Layers, Download, CheckCircle, Info } from 'lucide-react';

const HowItWorks: React.FC = () => {
  const steps = [
    {
      number: '01',
      title: 'Simülasyon Yöntemini Seçin',
      desc: 'Ana ekrandan (Dashboard) Statik Simülasyon (Bathtub Model) seçeneğine tıklayarak analiz modülüne giriş yapın.',
      icon: <Layers className="w-5 h-5 text-cyan-400" />,
    },
    {
      number: '02',
      title: 'DEM ve KML Verilerini Yükleyin',
      desc: 'Çalışma alanınıza ait Sayısal Yükseklik Modelini (DEM .tif veya .asc) yükleyin. Dilerseniz taşkın kaynak çizgisi veya alan sınırı KML dosyalarını ekleyin.',
      icon: <Upload className="w-5 h-5 text-blue-400" />,
    },
    {
      number: '03',
      title: 'Koordinat ve Kaynak Noktası Belirleyin',
      desc: 'Projeksiyon sistemini doğrulayın. Harita üzerinden taşkının başlayacağı noktayı tıklayarak veya KML verisinden otomatik kaynak seçerek belirleyin.',
      icon: <MapPin className="w-5 h-5 text-indigo-400" />,
    },
    {
      number: '04',
      title: 'Su Seviyesi ve Parametreleri Ayarlayın',
      desc: 'Simüle edilmek istenen su seviyesi artış miktarını (metre cinsinden) ve hidrolojik bağlantı parametrelerini tanımlayın.',
      icon: <Sliders className="w-5 h-5 text-teal-400" />,
    },
    {
      number: '05',
      title: 'Simülasyonu Çalıştırın',
      desc: '"Simülasyonu Başlat" butonuna tıklayın. Yüksek performanslı Web Worker algoritması su yayılımını canlı olarak hesaplar.',
      icon: <Play className="w-5 h-5 text-emerald-400" />,
    },
    {
      number: '06',
      title: 'Sonuçları İnceleyin ve Aktarın',
      desc: 'Haritadaki taşkın su haritasını, derinlik katmanını ve etkilenen alan istatistiklerini (m², ha) görüntüleyin. Sonuçları KML formatında indirin.',
      icon: <Download className="w-5 h-5 text-sky-400" />,
    },
  ];

  return (
    <motion.div
      key="how-it-works"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="space-y-6 pb-12 max-w-4xl mx-auto"
    >
      {/* Header section */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-600/20 rounded-xl border border-blue-500/30 text-blue-400">
            <BookOpen size={24} />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-display font-bold text-white">
              Simülasyon Kullanım Rehberi
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              HydroFlood taşkın analiz modülünü adım adım nasıl kullanacağınızı öğrenin.
            </p>
          </div>
        </div>
      </div>

      {/* Step by Step Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {steps.map((step) => (
          <div
            key={step.number}
            className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex gap-4 items-start"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-center shrink-0">
              {step.icon}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-blue-400 font-mono">{step.number}</span>
                <h3 className="font-bold text-white text-sm sm:text-base">{step.title}</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Practical Tips Section */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Info size={18} className="text-cyan-400" />
          <h3 className="text-base font-bold text-white">Pratik İpuçları</h3>
        </div>
        <div className="space-y-2 text-xs sm:text-sm text-slate-300">
          <div className="flex items-start gap-2.5">
            <CheckCircle size={16} className="text-emerald-400 shrink-0 mt-0.5" />
            <span>Harita üzerinde doğrudan tıklama yaparak anlık nokta yüksekliğini öğrenebilirsiniz.</span>
          </div>
          <div className="flex items-start gap-2.5">
            <CheckCircle size={16} className="text-emerald-400 shrink-0 mt-0.5" />
            <span>Çalışma Alanı KML dosyası yükleyerek simülasyon bölgesini kısıtlayabilir ve işlem süresini kısaltabilirsiniz.</span>
          </div>
          <div className="flex items-start gap-2.5">
            <CheckCircle size={16} className="text-emerald-400 shrink-0 mt-0.5" />
            <span>Oluşturulan taşkın kapsama poligonlarını Google Earth veya QGIS/ArcGIS yazılımlarına doğrudan aktarabilirsiniz.</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default HowItWorks;
