import React from 'react';
import { motion } from 'motion/react';
import { BarChart3, Globe, Settings, FileText, Play, Waves, ShieldCheck, Cpu, Layers } from 'lucide-react';

const About: React.FC = () => {
  return (
    <motion.div
      key="about"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="space-y-6 pb-12 max-w-4xl mx-auto"
    >
      {/* Intro section */}
      <div className="bg-white border border-slate-300 rounded-2xl p-6 sm:p-8 space-y-3 shadow-sm">
        <p className="text-sm text-slate-700 leading-relaxed">
          HydroFlood, yüzey topografyasını ve hidrolojik bağlantıları analiz etmek için statik ve hidrolojik yöntemler kullanan gelişmiş bir mühendislik aracıdır. Uygulama, topografya verilerinden hareketle taşkın risk alanlarını belirleyen yüksek performanslı bir Statik Çanak (Bathtub) modeli sunar.
        </p>
      </div>

      {/* System Features Section */}
      <div className="bg-white border border-slate-300 rounded-2xl p-6 sm:p-8 space-y-4 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900">
          Sistem Özellikleri ve Teknik Altyapı
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-1">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Globe size={13} className="text-blue-600" /> Projeksiyon
            </p>
            <p className="text-sm font-bold text-slate-900">EPSG Desteği Aktif</p>
            <p className="text-[10px] text-slate-600">Projeksiyon Dönüştürücü</p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-1">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu size={13} className="text-emerald-600" /> BFS Algoritması
            </p>
            <p className="text-sm font-bold text-slate-900">Enine Arama Bağlantısı</p>
            <p className="text-[10px] text-slate-600">Hidrolojik Matris Çözücü</p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-1">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Layers size={13} className="text-indigo-600" /> Katman Yönetimi
            </p>
            <p className="text-sm font-bold text-slate-900">DXF CAD & GIS</p>
            <p className="text-[10px] text-slate-600">Vektör ve Izohips Desteği</p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-1">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-cyan-600" /> Dışa Aktarım
            </p>
            <p className="text-sm font-bold text-slate-900">KML & GeoJSON</p>
            <p className="text-[10px] text-slate-600">Google Earth Uyumlu Rapor</p>
          </div>
        </div>
      </div>

      {/* Main Method section */}
      <div className="bg-white border border-slate-300 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-cyan-100 rounded-xl border border-cyan-200 text-cyan-700">
            <Waves size={22} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Statik Simülasyon Modeli (Bathtub Model)
            </h3>
            <p className="text-xs text-cyan-700 font-semibold">
              Hydrological Connectivity & Breadth-First Search
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-700 leading-relaxed">
          Bathtub (Çanak) modeli, topografyadaki hidrolojik bağlantıyı esas alan bir "yayılma" algoritmasıdır. Kaynak noktasından itibaren suyun ulaşabileceği tüm bağlantılı çukur alanlar, belirlenen su seviyesine kadar doldurulur. Bu yaklaşım, karmaşık sığ su denklemlerine oranla çok daha hızlı ve özellikle ilk değerlendirme aşamaları için oldukça kararlıdır.
        </p>

        {/* 4 Steps Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {[
            { step: '01', title: 'Kaynak Analizi', desc: 'Belirlenen kaynak noktasının başlangıç piksel yüksekliği (Z_source) tespit edilir.' },
            { step: '02', title: 'Hedef Seviye Tanımı', desc: 'H_target = Z_source + d_input formülü ile su sınırı yükseklik eşiği çizilir.' },
            { step: '03', title: 'BFS Yayılımı', desc: 'BFS (Enine Arama) algoritması ile her piksel için kesintisiz hidrolojik bağlantı kontrol edilir.' },
            { step: '04', title: 'Alan İşaretleme', desc: 'H_target değerinden düşük ve hidrolojik olarak kaynak ile bağlantılı tüm komşu hücreler taşkın alanı olarak işaretlenir.' }
          ].map((item) => (
            <div key={item.step} className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3 shadow-sm">
              <span className="text-sm font-bold text-cyan-700 shrink-0">{item.step}</span>
              <div>
                <h4 className="font-semibold text-slate-900 text-sm mb-1">{item.title}</h4>
                <p className="text-xs text-slate-600 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Advantage Callout */}
        <div className="p-4 bg-slate-50 rounded-xl border-l-4 border-cyan-600 text-xs sm:text-sm text-slate-700 leading-relaxed space-y-1 shadow-sm">
          <strong className="text-cyan-800 font-bold block uppercase text-[11px] tracking-wider">
            Bağlantılı Çanak Metodolojisi Avantajları:
          </strong>
          <p>
            Sadece topografik çukurları dolduran basit yöntemlerin aksine, bu model kaynak noktası ile kesintisiz bağlantıyı doğrular. Dolayısıyla, çevresinden alçakta olmasına rağmen arada kalan yüksek engeller sebebiyle suyun fiziksel olarak ulaşamayacağı alanlar taşkın dışı bırakılır; bu sayede gerçeğe çok daha yakın bir yayılım simüle edilir.
          </p>
        </div>
      </div>

      {/* Workflow section */}
      <div className="bg-white border border-slate-300 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={20} className="text-cyan-600 shrink-0" />
          <h3 className="text-lg font-bold text-slate-900">
            Uygulama İş Akışı (Workflow)
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {[
            { title: 'Veri Hazırlığı', desc: 'DEM ve KML yükleme, koordinat dönüşümü.', icon: <Globe size={18} /> },
            { title: 'Ön İşleme', desc: 'D8 algoritması ile sistem analizi.', icon: <BarChart3 size={18} /> },
            { title: 'Parametreler', desc: 'Bathtub su seviyesi artışı tanımlama.', icon: <Settings size={18} /> },
            { title: 'Simülasyon', desc: 'Web Worker ile paralel BFS yayılma hesabı.', icon: <Play size={18} /> },
            { title: 'Raporlama', desc: 'Görselleştirme ve GIS veri dışa aktarımı.', icon: <FileText size={18} /> }
          ].map((step, idx) => (
            <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col items-center text-center space-y-2 shadow-sm">
              <div className="w-9 h-9 bg-cyan-100 rounded-lg flex items-center justify-center text-cyan-700">
                {step.icon}
              </div>
              <h4 className="text-xs font-semibold text-slate-900">{step.title}</h4>
              <p className="text-[11px] text-slate-600 leading-tight">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default About;
