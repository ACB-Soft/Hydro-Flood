import React from 'react';
import { motion } from 'motion/react';
import { BarChart3, Droplets, Layers, Info, Globe, MapPin, Settings, FileText, ChevronRight, Play, Cpu, Waves, ShieldCheck } from 'lucide-react';

const About: React.FC = () => {
  return (
    <motion.div
      key="about"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-12 pb-20 max-w-5xl mx-auto"
    >
      <div className="text-center space-y-4 px-4 sm:px-0">
        <h2 className="text-2xl md:text-4xl font-display font-bold text-white tracking-tight">Teknik Dokümantasyon ve Metodoloji</h2>
        <p className="text-sm md:text-base text-slate-400 leading-relaxed max-w-3xl mx-auto">
          HydroFlood, yüzey topografyasını ve hidrolojik bağlantıları analiz etmek için statik ve hidrolojik yöntemler kullanan gelişmiş bir mühendislik aracıdır. Uygulama, topografya verilerinden hareketle taşkın risk alanlarını belirleyen yüksek performanslı bir Statik Çanak (Bathtub) modeli sunar.
        </p>
      </div>

      <div className="grid gap-8 md:gap-10">
        {/* Çanak Modeli Bölümü */}
        <section className="glass rounded-2xl md:rounded-[2.5rem] p-5 md:p-10 border border-white/20 shadow-2xl space-y-6 md:space-y-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-600/10 blur-[100px] -mr-32 -mt-32 group-hover:bg-cyan-600/20 transition-all duration-700" />
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 relative">
            <div className="p-3 md:p-4 bg-cyan-600/20 rounded-xl md:rounded-2xl border border-cyan-500/30">
              <Waves className="text-cyan-400 w-6 h-6 md:w-8 md:h-8" />
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-display font-bold text-white">Statik Simülasyon Modeli (Bathtub Model)</h3>
              <p className="text-cyan-400/60 text-[10px] md:text-xs font-bold uppercase tracking-widest mt-1">Hydrological Connectivity & Breadth-First Search</p>
            </div>
          </div>
          
          <div className="space-y-4 md:space-y-6 text-slate-300 leading-relaxed relative">
            <p className="text-sm md:text-lg">
              Bathtub (Çanak) modeli, topografyadaki hidrolojik bağlantıyı esas alan bir "yayılma" algoritmasıdır. Kaynak noktasından itibaren suyun ulaşabileceği tüm bağlantılı çukur alanlar, belirlenen su seviyesine kadar doldurulur. Bu yaklaşım, karmaşık sığ su denklemlerine oranla çok daha hızlı ve özellikle ilk değerlendirme aşamaları için oldukça kararlıdır.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              {[
                { step: '01', title: 'Kaynak Analizi', desc: 'Belirlenen kaynak noktasının başlangıç piksel yüksekliği (Z_source) tespit edilir.' },
                { step: '02', title: 'Hedef Seviye Tanımı', desc: 'H_target = Z_source + d_input formülü ile su sınırı yükseklik eşiği çizilir.' },
                { step: '03', title: 'BFS Yayılımı', desc: 'BFS (Enine Arama) algoritması ile her piksel için kesintisiz hidrolojik bağlantı kontrol edilir.' },
                { step: '04', title: 'Alan İşaretleme', desc: 'H_target değerinden düşük ve hidrolojik olarak kaynak ile bağlantılı tüm komşu hücreler taşkın alanı olarak işaretlenir.' }
              ].map((item) => (
                <div key={item.step} className="bg-white/5 p-4 md:p-6 rounded-2xl md:rounded-3xl border border-white/10 flex gap-4">
                   <span className="text-xl md:text-2xl font-display font-bold text-cyan-500/30">{item.step}</span>
                  <div>
                    <h4 className="font-bold text-white text-sm md:text-base mb-1">{item.title}</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 md:p-6 bg-cyan-500/5 rounded-2xl md:rounded-3xl border-l-4 border-cyan-500/50 pl-6 md:pl-8">
              <p className="text-xs md:text-sm italic text-slate-400 leading-relaxed">
                <strong className="text-cyan-400 not-italic block mb-2 uppercase text-[10px] md:text-xs tracking-widest">Bağlantılı Çanak Metodolojisi Avantajları:</strong>
                Sadece topografik çukurları dolduran basit yöntemlerin aksine, bu model kaynak noktası ile kesintisiz bağlantıyı doğrular. Dolayısıyla, çevresinden alçakta olmasına rağmen arada kalan yüksek engeller sebebiyle suyun fiziksel olarak ulaşamayacağı alanlar taşkın dışı bırakılır; bu sayede gerçeğe çok daha yakın bir yayılım simüle edilir.
              </p>
            </div>
          </div>
        </section>

        {/* İş Akışı Bölümü */}
        <section className="space-y-6 md:space-y-10 pt-4 md:pt-10">
          <div className="flex items-center gap-4">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10" />
            <h3 className="text-lg md:text-2xl font-display font-bold text-white flex items-center gap-2 md:gap-3 text-center">
              <ShieldCheck className="text-cyan-500 shrink-0" size={24} />
              Uygulama İş Akışı (Workflow)
            </h3>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10" />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 relative">
            {[
              { title: 'Veri Hazırlığı', desc: 'DEM ve KML yükleme, koordinat dönüşümü.', icon: <Globe size={20} /> },
              { title: 'Ön İşleme', desc: 'D8 algoritması ile sistem analizi.', icon: <BarChart3 size={20} /> },
              { title: 'Parametreler', desc: 'Bathtub su seviyesi artışı tanımlama.', icon: <Settings size={20} /> },
              { title: 'Simülasyon', desc: 'Web Worker ile paralel BFS yayılma hesabı.', icon: <Play size={20} /> },
              { title: 'Raporlama', desc: 'Görselleştirme ve GIS veri dışa aktarımı.', icon: <FileText size={20} /> }
            ].map((step, idx) => (
              <div key={idx} className="group relative">
                <div className="glass p-4 md:p-6 rounded-2xl md:rounded-[2rem] border border-white/10 h-full flex flex-col items-center text-center space-y-3 md:space-y-4 hover:border-cyan-500/50 transition-all duration-500 hover:-translate-y-1">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-cyan-600/10 rounded-xl md:rounded-2xl flex items-center justify-center text-cyan-400 group-hover:bg-cyan-600 group-hover:text-white transition-all duration-500">
                    {step.icon}
                  </div>
                  <div className="space-y-1 md:space-y-2">
                    <h4 className="text-xs md:text-sm font-bold text-white">{step.title}</h4>
                    <p className="text-[9px] md:text-[10px] text-slate-500 leading-relaxed font-medium uppercase tracking-tight">{step.desc}</p>
                  </div>
                </div>
                {idx < 4 && (
                  <div className="hidden md:block absolute top-1/2 -right-2 translate-x-1/2 -translate-y-1/2 z-10">
                    <ChevronRight className="text-white/20" size={20} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </motion.div>
  );
};

export default About;
