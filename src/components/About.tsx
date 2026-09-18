import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  BarChart3, 
  Globe, 
  Settings, 
  FileText, 
  Play, 
  Waves, 
  ShieldCheck, 
  Cpu, 
  Layers,
  Compass,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Milestone,
  Sliders,
  Table,
  HelpCircle,
  FileSpreadsheet,
  Download,
  Info,
  Maximize2
} from 'lucide-react';

const About: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'1d' | '2d-bathtub' | 'tech' | 'faq'>('1d');

  return (
    <motion.div
      key="about"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="space-y-6 pb-16 max-w-5xl mx-auto"
      id="about-help-container"
    >
      {/* Top Banner / Navigation Selector */}
      <div className="bg-white border border-slate-300 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
              <HelpCircle className="text-cyan-700" size={24} />
              Yardım & Teknik Dokümantasyon
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              HydroFlood hidrolik analiz modülleri, kuramsal modeller ve adım adım kullanım rehberi.
            </p>
          </div>
          <div className="flex items-center gap-1.5 self-start sm:self-auto bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <span className="px-2.5 py-1 text-slate-700">Versiyon 2.4</span>
            <span className="px-2 py-0.5 bg-cyan-700 text-white rounded-lg text-[10px] uppercase font-bold tracking-wider">1B & 2B</span>
          </div>
        </div>

        {/* Section Navigation Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            id="tab-1d-guide"
            onClick={() => setActiveSection('1d')}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${
              activeSection === '1d'
                ? 'bg-cyan-700 text-white border-cyan-800 shadow-sm'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <Waves size={16} />
            <span>1B Hidrolik Analiz</span>
          </button>

          <button
            id="tab-2d-bathtub"
            onClick={() => setActiveSection('2d-bathtub')}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${
              activeSection === '2d-bathtub'
                ? 'bg-cyan-700 text-white border-cyan-800 shadow-sm'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <Layers size={16} />
            <span>2B Çanak (Bathtub)</span>
          </button>

          <button
            id="tab-tech-specs"
            onClick={() => setActiveSection('tech')}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${
              activeSection === 'tech'
                ? 'bg-cyan-700 text-white border-cyan-800 shadow-sm'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <Cpu size={16} />
            <span>Teknik Altyapı & EPSG</span>
          </button>

          <button
            id="tab-faq-tips"
            onClick={() => setActiveSection('faq')}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${
              activeSection === 'faq'
                ? 'bg-cyan-700 text-white border-cyan-800 shadow-sm'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <Info size={16} />
            <span>SSS & Mühendislik İpuçları</span>
          </button>
        </div>
      </div>

      {/* ==================== 1D ANALYSIS SECTION ==================== */}
      {activeSection === '1d' && (
        <div className="space-y-6">
          {/* 1D Overview Card */}
          <div className="bg-white border border-slate-300 rounded-2xl p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-cyan-100 rounded-xl border border-cyan-200 text-cyan-800">
                <Waves size={24} />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                  1 Boyutlu (1B) Hidrolik Analiz Modülü Nedir?
                </h3>
                <p className="text-xs sm:text-sm text-cyan-800 font-semibold">
                  HEC-RAS Uyumlu Standart Adım Yöntemi (Standard Step Method) & Enerji Denklemi Çözücüsü
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-700 leading-relaxed">
              1 Boyutlu Dinamik ve Kararlı Akış Analiz Modülü, doğal nehir yatakları ve taşkın kanalları boyunca su yüzü profilini (Water Surface Profile - WSP) <strong>Bernoulli Enerji Korunumu</strong> ve <strong>Manning Sürtünme Kaybı</strong> denklemlerini kullanarak çözen mühendislik aracıdır. 
              Enkesitler arasındaki enerji denge durumunu iteratif olarak hesaplayarak su kotlarını, akış hızlarını, Froude sayılarını ve taşkın sınırlarını hassas biçimde üretir.
            </p>

            {/* Core Hydraulic Equations Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-800 block">1. Enerji Denklemi</span>
                <p className="font-mono text-xs font-bold text-slate-900 bg-white px-2 py-1 rounded border border-slate-200">
                  Z₁ + Y₁ + α₁(V₁²/2g) = Z₂ + Y₂ + α₂(V₂²/2g) + hₑ
                </p>
                <p className="text-[11px] text-slate-600 leading-tight">
                  İki ardışık enkesit arasındaki toplam enerji seviyesini (EGL) ve hız yüksekliğini dengeler.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">2. Sürtünme Kaybı (Manning)</span>
                <p className="font-mono text-xs font-bold text-slate-900 bg-white px-2 py-1 rounded border border-slate-200">
                  h_f = S_f · L = [ (Q · n) / (A · R^(2/3)) ]² · L
                </p>
                <p className="text-[11px] text-slate-600 leading-tight">
                  Yatak pürüzlülüğü ($n$), ıslak alan ($A$) ve hidrolik yarıçap ($R$) esaslı enerji gradyanı kaybı.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">3. Sanat Yapısı Kayıpları</span>
                <p className="font-mono text-xs font-bold text-slate-900 bg-white px-2 py-1 rounded border border-slate-200">
                  h_ce = C |(V₁²/2g) - (V₂²/2g)| + h_bridge
                </p>
                <p className="text-[11px] text-slate-600 leading-tight">
                  Köprü ayak daralmaları, tabliye boğulması, orifis akışı ve ani enkesit değişim kayıpları.
                </p>
              </div>
            </div>
          </div>

          {/* Step-by-step How-To Guide */}
          <div className="bg-white border border-slate-300 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Milestone size={20} className="text-cyan-700" />
                Adım Adım 1B Hidrolik Analiz Nasıl Yapılır?
              </h3>
              <span className="text-xs text-slate-500 font-semibold">6 Adımlı İş Akışı</span>
            </div>

            <div className="space-y-4">
              {/* Step 1 */}
              <div className="border border-slate-200 rounded-xl p-4.5 bg-slate-50/70 hover:bg-slate-50 transition-colors space-y-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-cyan-700 text-white font-bold text-xs flex items-center justify-center shrink-0">
                    1
                  </span>
                  <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                    Projeksiyon (CRS) ve DEM Yükleme
                  </h4>
                </div>
                <div className="text-xs text-slate-700 pl-9.5 space-y-1.5 leading-relaxed">
                  <p>
                    • <strong>Koordinat Sistemi:</strong> Projenizin bulunduğu bölgeye ait projeksiyonu seçin (Örn: Türkiye için <em>TUREF / TM36 (3°) EPSG:5256</em> veya ilgili 6° UTM / ED50 dilimi). Doğru CRS seçimi KML hatlarınızın DEM ile kusursuz çakışmasını sağlar.
                  </p>
                  <p>
                    • <strong>DEM Yükleme:</strong> Dere yatağı ve vadi topografyasını içeren GeoTIFF (<code>.tif</code>) veya ESRI Grid (<code>.asc</code>) dosyanızı yükleyiniz. Piksel çözünürlüğü ve zemin kotları otomatik okunacaktır.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="border border-slate-200 rounded-xl p-4.5 bg-slate-50/70 hover:bg-slate-50 transition-colors space-y-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-cyan-700 text-white font-bold text-xs flex items-center justify-center shrink-0">
                    2
                  </span>
                  <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                    Nehir Ekseni (Centerline) ve Kıyı Hatları (Banks) Yükleme
                  </h4>
                </div>
                <div className="text-xs text-slate-700 pl-9.5 space-y-1.5 leading-relaxed">
                  <p>
                    • <strong>Dere Ekseni (Centerline KML):</strong> Google Earth veya CAD ortamında çizilmiş talveg/akış yönü çizgisini yükleyin. 
                    <span className="text-cyan-900 font-bold ml-1 bg-cyan-100 px-1.5 py-0.5 rounded">Kritik Kural:</span> Çizgi <strong>membadan mansaba doğru (akış yönünde)</strong> çizilmiş olmalıdır.
                  </p>
                  <p>
                    • <strong>Kıyı Şev Üstü Çizgileri (Banks KML - Opsiyonel):</strong> Dere ana yatağı ile sağ/sol taşkın ovalarını (overbanks) birbirinden ayıran çizgilerdir. Yüklendiğinde pürüzlülük katsayısı bölgelere göre otomatik ayrıştırılır.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="border border-slate-200 rounded-xl p-4.5 bg-slate-50/70 hover:bg-slate-50 transition-colors space-y-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-cyan-700 text-white font-bold text-xs flex items-center justify-center shrink-0">
                    3
                  </span>
                  <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                    Enkesitlerin Üretilmesi (Otomatik veya Manuel KML)
                  </h4>
                </div>
                <div className="text-xs text-slate-700 pl-9.5 space-y-1.5 leading-relaxed">
                  <p>
                    • <strong>Otomatik Kesit Üretimi:</strong> Eksen çizgisi boyunca belirlediğiniz aralıkta (Örn: her 25m, 50m veya 100m) ve genişlikte (Örn: 80m - 150m) eksene dik enkesitler DEM üzerinden otomatik olarak kesilir ve zemin kotları çıkarılır.
                  </p>
                  <p>
                    • <strong>Manuel Enkesit KML Modu:</strong> Projenize özel belirlenmiş enkesit hatlarınız varsa, "Manuel KML" moduna geçerek kendi enkesit çizgilerinizi yükleyebilirsiniz.
                  </p>
                  <p>
                    • Sağ paneldeki <strong>"Enkesit"</strong> sekmesinden kesitleri tek tek seçip doğal yatak geometrisini, taban kotunu ve şevleri inceleyebilirsiniz.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="border border-slate-200 rounded-xl p-4.5 bg-slate-50/70 hover:bg-slate-50 transition-colors space-y-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-cyan-700 text-white font-bold text-xs flex items-center justify-center shrink-0">
                    4
                  </span>
                  <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                    Sanat Yapılarının (Köprü & Menfez) Tanımlanması
                  </h4>
                </div>
                <div className="text-xs text-slate-700 pl-9.5 space-y-2 leading-relaxed">
                  <p>
                    Güzergah üzerinde yer alan karayolu/demiryolu köprüleri ile kutu veya boru menfezleri ekleyerek yapının membasındaki geri kabarma (backwater) seviyesini ve köprü altı boğulma durumunu simüle edebilirsiniz.
                  </p>
                  <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1.5">
                    <strong className="text-slate-900 block text-[11px]">Sanat Yapısı Konumlandırmada 4 Pratik Yöntem:</strong>
                    <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
                      <li><strong>Mevcut Enkesitlerden Seçim:</strong> Modal içerisindeki açılır menüden kesit seçildiğinde istasyon, koordinat, taban kotu ve kiriş altı kotu otomatik senkronize edilir.</li>
                      <li><strong>Haritada Tıkla ve Seç:</strong> "Haritada Tıkla ve Seç" butonu ile harita üzerinde köprünün yer alacağı noktaya tek tıklamayla konum verilir.</li>
                      <li><strong>Enkesit Sekmesinden Hızlı Ekle:</strong> Enkesit önizleme başlığındaki <code>+ Köprü Ekle</code> veya <code>+ Menfez Ekle</code> butonlarına basarak aktif kesite doğrudan yapı bağlanır.</li>
                      <li><strong>Metraj Girişi:</strong> İstasyon kutucuğuna doğrudan kilometre/metre değeri (Örn: <code>350</code>) yazılabilir.</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Step 5 */}
              <div className="border border-slate-200 rounded-xl p-4.5 bg-slate-50/70 hover:bg-slate-50 transition-colors space-y-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-cyan-700 text-white font-bold text-xs flex items-center justify-center shrink-0">
                    5
                  </span>
                  <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                    Hidrolik Parametreler, Debi ve Sınır Şartları
                  </h4>
                </div>
                <div className="text-xs text-slate-700 pl-9.5 space-y-1.5 leading-relaxed">
                  <p>
                    • <strong>Debi Rejimi:</strong> Sabit Kararlı Debi ($Q$ m³/s) veya zamana bağlı saatlik hidrograf eğrisi (Excel / manuel tablo) seçilebilir.
                  </p>
                  <p>
                    • <strong>Manning Pürüzlülük Katsayıları ($n$):</strong> Ana kanal yatağı için (örn: beton kanalda 0.015, doğal temiz derede 0.030, çakıllı/otlu derede 0.040) ve taşkın ovaları için (0.050 - 0.080) değerler atanır.
                  </p>
                  <p>
                    • <strong>Mansap Sınır Şartı (Downstream Boundary):</strong>
                    <span className="block mt-1 pl-2 border-l-2 border-cyan-500 space-y-0.5 text-slate-600">
                      <span>- <em>Normal Derinlik:</em> Manning taban eğimi ($S_0$, örn: 0.005) girilerek hesaplanır (en sık kullanılan yöntem).</span><br />
                      <span>- <em>Kritik Derinlik ($y_c$):</em> Dik eğimler ve şelale/düşü mansaplarında kullanılır.</span><br />
                      <span>- <em>Bilinen Su Kotu (WSE):</em> Mansapta göl, deniz veya bilinen baraj rezervuar seviyesi olduğunda kullanılır.</span>
                    </span>
                  </p>
                </div>
              </div>

              {/* Step 6 */}
              <div className="border border-slate-200 rounded-xl p-4.5 bg-slate-50/70 hover:bg-slate-50 transition-colors space-y-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-cyan-700 text-white font-bold text-xs flex items-center justify-center shrink-0">
                    6
                  </span>
                  <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                    Simülasyon Çözümü ve Sonuçların Değerlendirilmesi
                  </h4>
                </div>
                <div className="text-xs text-slate-700 pl-9.5 space-y-2 leading-relaxed">
                  <p>
                    "1B Hidrolik Analizi Başlat" butonuna tıkladığınızda tüm enkesitler taranır ve saniyeler içinde sonuç ekranına geçilir:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="font-bold text-slate-900 block text-[11px] mb-1">📈 Boykesit Profili</span>
                      <p className="text-[10px] text-slate-600">
                        Talveg çizgisi, su yüzeyi çizgisi (WSE), kritik derinlik ($y_c$) ve enerji çizgisi (EGL). Köprü tabliye ve kiriş altı seviyeleriyle su teması net olarak izlenir.
                      </p>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="font-bold text-slate-900 block text-[11px] mb-1">📐 Enkesit Detayları</span>
                      <p className="text-[10px] text-slate-600">
                        İstasyon bazında su derinliği, taşkın genişliği, froude sayısı ve akış hızı dağılımı grafik üzerinde anlık incelenir.
                      </p>
                    </div>

                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="font-bold text-slate-900 block text-[11px] mb-1">🗺️ 2B Taşkın Haritası</span>
                      <p className="text-[10px] text-slate-600">
                        Hesaplanan taşkın genişlikleri otomatik poligonlaştırılarak uydu haritası üzerinde görselleştirilir ve KML olarak dışa aktarılabilir.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Export and Reporting Info */}
          <div className="bg-white border border-slate-300 rounded-2xl p-6 sm:p-8 space-y-4 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Download size={20} className="text-cyan-700" />
              1B Analiz Çıktıları ve Dışa Aktarım Formatları
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-1">
                <span className="font-bold text-slate-900 flex items-center gap-1.5 text-emerald-800">
                  <FileSpreadsheet size={15} /> Excel Hidrolik Tablosu
                </span>
                <p className="text-[11px] text-slate-600">
                  Tüm istasyonlar için Km, Su Kotu (WSE), Enerji Kotu, Hız (V), Froude sayısı ve Islak Alan parametrelerini içeren resmi rapor tablosu.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-1">
                <span className="font-bold text-slate-900 flex items-center gap-1.5 text-blue-800">
                  <Globe size={15} /> Google Earth KML
                </span>
                <p className="text-[11px] text-slate-600">
                  Taşkın yayılım sınır poligonları, nehir ekseni ve köprü lokasyonlarını içeren 3B uyumlu coğrafi KML katmanı.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-1">
                <span className="font-bold text-slate-900 flex items-center gap-1.5 text-indigo-800">
                  <Layers size={15} /> AutoCAD DXF Çizimi
                </span>
                <p className="text-[11px] text-slate-600">
                  Enkesit geometrileri ve boykesit profilini CAD ortamına doğrudan aktarmak için katmanlı DXF dosyası.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-1">
                <span className="font-bold text-slate-900 flex items-center gap-1.5 text-rose-800">
                  <FileText size={15} /> PDF Teknik Rapor
                </span>
                <p className="text-[11px] text-slate-600">
                  Mühendislik hesap özetleri, köprü güvenlik tahkikleri ve hidrolik boykesit diyagramlarını içeren yazdırılabilir rapor.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 2D BATHTUB SECTION ==================== */}
      {activeSection === '2d-bathtub' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-300 rounded-2xl p-6 sm:p-8 space-y-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-cyan-100 rounded-xl border border-cyan-200 text-cyan-800">
                <Layers size={22} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  2B Statik Çanak Simülasyon Modeli (Bathtub Model)
                </h3>
                <p className="text-xs text-cyan-800 font-semibold">
                  Hydrological Connectivity & Breadth-First Search (BFS)
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-700 leading-relaxed">
              Bathtub (Çanak) modeli, topografyadaki hidrolojik bağlantıyı esas alan yüksek performanslı bir "yayılma" algoritmasıdır. Kaynak noktasından itibaren suyun ulaşabileceği tüm bağlantılı çukur alanlar, belirlenen su seviyesine kadar doldurulur. Bu yaklaşım, karmaşık 2B Saint-Venant diferansiyel çözücülerine kıyasla saniyeler içinde kararlı sonuç verir ve bölgesel risk ön değerlendirmesi için idealdir.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {[
                { step: '01', title: 'Kaynak Analizi', desc: 'Harita üzerinden seçilen kaynak noktasının başlangıç piksel yüksekliği (Z_source) tespit edilir.' },
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

            <div className="p-4 bg-slate-50 rounded-xl border-l-4 border-cyan-600 text-xs sm:text-sm text-slate-700 leading-relaxed space-y-1 shadow-sm">
              <strong className="text-cyan-900 font-bold block uppercase text-[11px] tracking-wider">
                Bağlantılı Çanak Metodolojisi Avantajları:
              </strong>
              <p>
                Sadece topografik çukurları dolduran basit yöntemlerin aksine, bu model kaynak noktası ile kesintisiz bağlantıyı doğrular. Dolayısıyla, çevresinden alçakta olmasına rağmen arada kalan yüksek seddeler ve sırtlar sebebiyle suyun fiziksel olarak ulaşamayacağı alanlar taşkın dışı bırakılır; bu sayede gerçeğe çok daha yakın bir yayılım simüle edilir.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TECH SPECS & EPSG SECTION ==================== */}
      {activeSection === 'tech' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-300 rounded-2xl p-6 sm:p-8 space-y-4 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Cpu size={20} className="text-cyan-700" />
              Sistem Özellikleri ve Teknik Altyapı
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              HydroFlood, tarayıcı üzerinde istemci taraflı (client-side) çalışan WebAssembly, Web Worker ve gelişmiş GIS motorlarını bir araya getiren modern bir mühendislik mimarisine sahiptir.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-1">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Globe size={13} className="text-blue-600" /> Projeksiyon Motoru
                </p>
                <p className="text-sm font-bold text-slate-900">Proj4JS Entegre</p>
                <p className="text-[10px] text-slate-600">TUREF, UTM, ED50 ve WGS84 dönüşümleri</p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-1">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Cpu size={13} className="text-emerald-600" /> Hesaplama Motoru
                </p>
                <p className="text-sm font-bold text-slate-900">Web Worker Paralel</p>
                <p className="text-[10px] text-slate-600">Arayüzü dondurmayan arka plan çözücü</p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-1">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers size={13} className="text-indigo-600" /> Katman Yönetimi
                </p>
                <p className="text-sm font-bold text-slate-900">CAD & GIS Desteği</p>
                <p className="text-[10px] text-slate-600">DXF, GeoTIFF, KML ve GeoJSON işleme</p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-1">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-cyan-600" /> Dışa Aktarım
                </p>
                <p className="text-sm font-bold text-slate-900">Rapor & Veri İhracı</p>
                <p className="text-[10px] text-slate-600">Excel (XLSX), DXF, KML, PDF ve PNG</p>
              </div>
            </div>

            {/* EPSG Info Table */}
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-2 mt-4">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-slate-700">
                Sık Kullanılan Türkiye Koordinat Sistemleri
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="text-[11px] text-slate-500 uppercase bg-slate-200/60">
                    <tr>
                      <th className="px-3 py-1.5 font-bold">EPSG Kodu</th>
                      <th className="px-3 py-1.5 font-bold">Projeksiyon Adı</th>
                      <th className="px-3 py-1.5 font-bold">Kullanım Bölgesi (Meridyen)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-[11px]">
                    <tr><td className="px-3 py-1.5 font-mono font-bold text-cyan-800">EPSG:5253</td><td className="px-3 py-1.5">TUREF / TM27 (3°)</td><td className="px-3 py-1.5">27° Doğu (İzmir, Balıkesir vb.)</td></tr>
                    <tr><td className="px-3 py-1.5 font-mono font-bold text-cyan-800">EPSG:5254</td><td className="px-3 py-1.5">TUREF / TM30 (3°)</td><td className="px-3 py-1.5">30° Doğu (İstanbul Anadolu, Kocaeli, Antalya vb.)</td></tr>
                    <tr><td className="px-3 py-1.5 font-mono font-bold text-cyan-800">EPSG:5255</td><td className="px-3 py-1.5">TUREF / TM33 (3°)</td><td className="px-3 py-1.5">33° Doğu (Ankara, Konya vb.)</td></tr>
                    <tr><td className="px-3 py-1.5 font-mono font-bold text-cyan-800">EPSG:5256</td><td className="px-3 py-1.5">TUREF / TM36 (3°)</td><td className="px-3 py-1.5">36° Doğu (Samsun, Kayseri, Adana vb.)</td></tr>
                    <tr><td className="px-3 py-1.5 font-mono font-bold text-cyan-800">EPSG:5257</td><td className="px-3 py-1.5">TUREF / TM39 (3°)</td><td className="px-3 py-1.5">39° Doğu (Trabzon, Erzurum, Malatya vb.)</td></tr>
                    <tr><td className="px-3 py-1.5 font-mono font-bold text-cyan-800">EPSG:5258</td><td className="px-3 py-1.5">TUREF / TM42 (3°)</td><td className="px-3 py-1.5">42° Doğu (Van, Diyarbakır, Batman vb.)</td></tr>
                    <tr><td className="px-3 py-1.5 font-mono font-bold text-cyan-800">EPSG:5259</td><td className="px-3 py-1.5">TUREF / TM45 (3°)</td><td className="px-3 py-1.5">45° Doğu (Iğdır, Hakkari vb.)</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== FAQ & TIPS SECTION ==================== */}
      {activeSection === 'faq' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-300 rounded-2xl p-6 sm:p-8 space-y-4 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Info size={20} className="text-cyan-700" />
              Sıkça Sorulan Sorular ve Hidrolik Mühendisliği İpuçları
            </h3>

            <div className="space-y-3 text-xs sm:text-sm text-slate-700">
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-1.5">
                <h4 className="font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                  Nehir ekseni (Centerline) çizerken nelere dikkat etmeliyim?
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Çizginizi daima <strong>akış yönünde (membadan mansaba doğru)</strong> çizmelisiniz. Ters yönde çizilmiş eksenlerde su kotları ters akış olarak değerlendirileceğinden boykesit hesapları doğru sonuç vermez. Ayrıca eksen talveg hattını (en derin vadi tabanını) takip etmelidir.
                </p>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-1.5">
                <h4 className="font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                  Enkesit genişliği ne kadar seçilmelidir?
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Enkesitlerin iki ucu, taşkın anında su seviyesinin ulaşabileceği en yüksek kotun üzerinde kalmalı (serbest kuru zemin) ve vadi yamaçlarına kadar uzanmalıdır. Aksi halde su enkesit sınırlarından taşarak hesapta sınır hatası verebilir.
                </p>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-1.5">
                <h4 className="font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                  Köprü memba ve mansabında serbest enkesit bulunmalı mıdır?
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Evet. Hidrolik modelleme standardı gereği, bir köprünün yaklaşım akımını doğru hesaplayabilmek için köprünün yaklaşık 5-15 metre membasında ve mansabında temsil edici doğal dere enkesitleri bulunmalıdır.
                </p>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-1.5">
                <h4 className="font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                  Manning pürüzlülük katsayısı ($n$) nasıl seçilir?
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Düzgün beton kanallar için <code>0.013 - 0.015</code>, düzenli temiz dere yatakları için <code>0.030</code>, çakıllı/taşlı doğal dereler için <code>0.035 - 0.040</code>, sazlık ve yoğun bitkili taşkın ovaları için <code>0.050 - 0.080</code> katsayıları DSİ standartları uyarınca tavsiye edilir.
                </p>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-1.5">
                <h4 className="font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                  1B Analiz ile 2B Bathtub modeli arasındaki fark nedir?
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  <strong>1B Analiz;</strong> gerçek debi ($m^3/s$), yatak sürtünmesi, eğim, köprü daralması ve enerji dengesini çözerek akış hızlarını ve su yüzü profilini dinamik olarak hesaplar. <br />
                  <strong>2B Bathtub;</strong> belirli bir su yükselmesi senaryosunda topografyadaki çanak alanların hidrolojik bağlantılı olarak dolmasını görselleştiren statik bir yayılma analizidir.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default About;

