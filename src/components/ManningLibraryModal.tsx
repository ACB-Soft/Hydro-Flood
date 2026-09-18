import React, { useState, useEffect } from 'react';
import { 
  Droplets, 
  Check, 
  Sparkles, 
  Info, 
  X, 
  Layers, 
  Search, 
  ChevronRight,
  RotateCcw
} from 'lucide-react';

export interface ManningPreset {
  id: string;
  name: string;
  category: 'natural' | 'engineered' | 'mountain' | 'urban';
  description: string;
  nLOB: number;
  nMain: number;
  nROB: number;
  badge: string;
}

export interface ManningMaterial {
  id: string;
  category: 'concrete' | 'earth' | 'rock' | 'natural_channel' | 'floodplain';
  categoryLabel: string;
  name: string;
  minN: number;
  typicalN: number;
  maxN: number;
  description: string;
  applicableTo: ('main' | 'floodplain')[];
}

export const MANNING_PRESETS: ManningPreset[] = [
  {
    id: 'natural_gravel',
    name: 'Doğal Çakıllı Dere Yatağı (Standart)',
    category: 'natural',
    description: 'Temiz, çakıllı/taşlı doğal nehir yatağı ve orta çalılı taşkın ovaları. (DSİ / HEC-RAS Tipik)',
    nMain: 0.035,
    nLOB: 0.060,
    nROB: 0.060,
    badge: 'En Çok Tercih Edilen'
  },
  {
    id: 'concrete_trapezoid',
    name: 'Beton Kaplamalı Trapez Islah Kanalı',
    category: 'engineered',
    description: 'Düzgün perdahlı beton kaplama yatak ve betonlaşmış seddeler (DSİ Tip Islah Kanalı).',
    nMain: 0.014,
    nLOB: 0.020,
    nROB: 0.020,
    badge: 'Yapay Kanal'
  },
  {
    id: 'stone_masonry',
    name: 'Harçlı Taş Pere / Taş Tahkimat Kanal',
    category: 'engineered',
    description: 'Harçlı veya kuru taş pere kaplama yatak tabanı ve taş tahkimatlı şevler.',
    nMain: 0.025,
    nLOB: 0.045,
    nROB: 0.045,
    badge: 'Taş Kaplama'
  },
  {
    id: 'gabion_riprap',
    name: 'Gabion Şilteli & Kaya Dolgulu Kanal',
    category: 'engineered',
    description: 'Tel kafes gabion şilte veya rip-rap kaya dolgu ile tahkim edilmiş nehir yatağı.',
    nMain: 0.032,
    nLOB: 0.055,
    nROB: 0.055,
    badge: 'Gabion & Riprap'
  },
  {
    id: 'clean_earth',
    name: 'Düz Toprak Kanal & Tarımsal Taşkın Ovası',
    category: 'natural',
    description: 'Temiz kazılmış silt/kil tabanlı toprak yatak ve ekili tarım arazisi taşkın sahası.',
    nMain: 0.025,
    nLOB: 0.045,
    nROB: 0.045,
    badge: 'Toprak / Tarım'
  },
  {
    id: 'mountain_stream',
    name: 'Dağ Deresi & İri Bloklu / Kayalık Yatak',
    category: 'mountain',
    description: 'Dik eğimli, iri kaya blokları, basamak ve havuzlar içeren dik dağ deresi.',
    nMain: 0.050,
    nLOB: 0.080,
    nROB: 0.080,
    badge: 'Dağlık Havza'
  },
  {
    id: 'dense_vegetation',
    name: 'Yoğun Bitkili & Ormanlık Taşkın Sahası',
    category: 'natural',
    description: 'Yatak içinde yoğun sazlık ve yosun, taşkın ovasında sık söğütlük, meşe ve orman örtüsü.',
    nMain: 0.045,
    nLOB: 0.095,
    nROB: 0.095,
    badge: 'Yoğun Bitki'
  },
  {
    id: 'urban_mixed',
    name: 'Kentsel Taşkın Alanı & Karma Islah',
    category: 'urban',
    description: 'Kısmen taş/beton duvarlı yatak, taşkın sahasında yapılar, bahçeler, yollar ve kentsel engeller.',
    nMain: 0.028,
    nLOB: 0.070,
    nROB: 0.070,
    badge: 'Kentsel / Meskun'
  }
];

export const MANNING_MATERIALS: ManningMaterial[] = [
  // Beton & Harç
  {
    id: 'concrete_smooth',
    category: 'concrete',
    categoryLabel: 'Beton & Çimento',
    name: 'Düzgün Perdahlı Beton Yüzey',
    minN: 0.011,
    typicalN: 0.013,
    maxN: 0.015,
    description: 'Çelik kalıpla dökülmüş, perdahlı pürüzsüz beton kanallar.',
    applicableTo: ['main']
  },
  {
    id: 'concrete_rough',
    category: 'concrete',
    categoryLabel: 'Beton & Çimento',
    name: 'Pürüzlü / Ahşap Kalıplı Beton',
    minN: 0.014,
    typicalN: 0.016,
    maxN: 0.018,
    description: 'Pürüzlü tahta kalıplı veya yaşlanmış, aşınmış beton kanal.',
    applicableTo: ['main']
  },
  {
    id: 'gunite_shotcrete',
    category: 'concrete',
    categoryLabel: 'Beton & Çimento',
    name: 'Püskürtme Beton (Püskürtme Shotcrete)',
    minN: 0.016,
    typicalN: 0.019,
    maxN: 0.023,
    description: 'Yüzeyi düzeltilmemiş pürüzlü püskürtme beton kaplama.',
    applicableTo: ['main']
  },

  // Toprak & Kazı
  {
    id: 'earth_straight_clean',
    category: 'earth',
    categoryLabel: 'Toprak Açık Kanallar',
    name: 'Düzgün Kazılmış Temiz Toprak Kanal',
    minN: 0.018,
    typicalN: 0.022,
    maxN: 0.025,
    description: 'Bitkisiz, temiz kazılmış üniform kil/silt toprak açık kanal.',
    applicableTo: ['main']
  },
  {
    id: 'earth_gravelly',
    category: 'earth',
    categoryLabel: 'Toprak Açık Kanallar',
    name: 'Çakıllı / İnce Taşlı Toprak Kanal',
    minN: 0.022,
    typicalN: 0.025,
    maxN: 0.030,
    description: 'Yatak tabanında ince çakıl tabakası bulunan toprak yatak.',
    applicableTo: ['main']
  },
  {
    id: 'earth_weedy',
    category: 'earth',
    categoryLabel: 'Toprak Açık Kanallar',
    name: 'Yabani Otlu & Hafif Sazlıklı Toprak Kanal',
    minN: 0.025,
    typicalN: 0.030,
    maxN: 0.035,
    description: 'Yatak şevlerinde otlanma ve sazlık başlamış toprak kanal.',
    applicableTo: ['main', 'floodplain']
  },

  // Taş & Pere & Gabion
  {
    id: 'stone_pitched_mortared',
    category: 'rock',
    categoryLabel: 'Taş Tahkimat & Pere',
    name: 'Harçlı Taş Pere Kaplama',
    minN: 0.020,
    typicalN: 0.025,
    maxN: 0.030,
    description: 'Harçla derzlenmiş kesme veya moloz taş pere ıslah kaplaması.',
    applicableTo: ['main']
  },
  {
    id: 'dry_rubble_masonry',
    category: 'rock',
    categoryLabel: 'Taş Tahkimat & Pere',
    name: 'Kuru Taş Tahkimat (Harçsız)',
    minN: 0.025,
    typicalN: 0.032,
    maxN: 0.036,
    description: 'Harçsız kuru taş dolgu, riprap taş dizisi.',
    applicableTo: ['main', 'floodplain']
  },
  {
    id: 'gabion_mattress',
    category: 'rock',
    categoryLabel: 'Taş Tahkimat & Pere',
    name: 'Tel Kafes Gabion Şilte',
    minN: 0.028,
    typicalN: 0.032,
    maxN: 0.035,
    description: 'Tel örgü içerisine yerleştirilmiş kırma taş gabion yapısı.',
    applicableTo: ['main', 'floodplain']
  },
  {
    id: 'heavy_riprap',
    category: 'rock',
    categoryLabel: 'Taş Tahkimat & Pere',
    name: 'Ağır Blok Kaya Riprap Tahkimatı',
    minN: 0.035,
    typicalN: 0.040,
    maxN: 0.050,
    description: 'Büyük çaplı kırma blok taş tahkimat ve mahmuzlar.',
    applicableTo: ['main']
  },

  // Doğal Akarsu Yatakları (Ana Kanal)
  {
    id: 'natural_clean_sand',
    category: 'natural_channel',
    categoryLabel: 'Doğal Dere Yatakları',
    name: 'Temiz Kum Tabakalı Doğal Yatak',
    minN: 0.025,
    typicalN: 0.030,
    maxN: 0.033,
    description: 'Düzgün akışlı, kum tabanlı, az menderesli doğal dere.',
    applicableTo: ['main']
  },
  {
    id: 'natural_gravel_cobble',
    category: 'natural_channel',
    categoryLabel: 'Doğal Dere Yatakları',
    name: 'Çakıllı ve Taşlı Tipik Doğal Nehir',
    minN: 0.030,
    typicalN: 0.035,
    maxN: 0.040,
    description: 'Yuvarlak çakıl ve yumruk büyüklüğünde taşlı, kıvrımlı doğal dere (DSİ standart referans).',
    applicableTo: ['main']
  },
  {
    id: 'natural_boulder_rough',
    category: 'natural_channel',
    categoryLabel: 'Doğal Dere Yatakları',
    name: 'Blok Taşlı, Çalılı ve Kütük Kalıntılı Yatak',
    minN: 0.040,
    typicalN: 0.048,
    maxN: 0.055,
    description: 'Düzensiz kesitli, yatak içinde kütük, moloz ve taş birikintili dere.',
    applicableTo: ['main']
  },
  {
    id: 'mountain_torrent',
    category: 'natural_channel',
    categoryLabel: 'Doğal Dere Yatakları',
    name: 'Dik Eğimli Dağ Deresi & Çağlayanlar',
    minN: 0.050,
    typicalN: 0.065,
    maxN: 0.080,
    description: 'Büyük kaya blokları, basamak-havuz yapılı dik dağ suları.',
    applicableTo: ['main']
  },

  // Taşkın Ovaları (LOB & ROB)
  {
    id: 'fp_pasture_short_grass',
    category: 'floodplain',
    categoryLabel: 'Taşkın Sahası & Bitki',
    name: 'Kısa Çim, Mera ve Otlak Alan',
    minN: 0.025,
    typicalN: 0.035,
    maxN: 0.040,
    description: 'Düzenli otlatılan kısa çayırlık, düzgün zeminli taşkın sahası.',
    applicableTo: ['floodplain']
  },
  {
    id: 'fp_cultivated_crops',
    category: 'floodplain',
    categoryLabel: 'Taşkın Sahası & Bitki',
    name: 'Ekili Tarım Arazisi (Buğday, Mısır vb.)',
    minN: 0.035,
    typicalN: 0.045,
    maxN: 0.055,
    description: 'Tarımsal ürün ekili, pulluk izli taşkın ovası.',
    applicableTo: ['floodplain']
  },
  {
    id: 'fp_scattered_brush',
    category: 'floodplain',
    categoryLabel: 'Taşkın Sahası & Bitki',
    name: 'Seyrek Çalılık ve Dağınık Fidanlar',
    minN: 0.040,
    typicalN: 0.055,
    maxN: 0.070,
    description: 'Aralıklı çalılar, genç fidanlar ve yabani yüksek otlar.',
    applicableTo: ['floodplain']
  },
  {
    id: 'fp_dense_willow_brush',
    category: 'floodplain',
    categoryLabel: 'Taşkın Sahası & Bitki',
    name: 'Yoğun Söğütlük ve Çalılık Alan',
    minN: 0.060,
    typicalN: 0.075,
    maxN: 0.090,
    description: 'Su kenarında sık yetişmiş söğüt, ılgın ve dikenli çalı kümesi.',
    applicableTo: ['floodplain']
  },
  {
    id: 'fp_dense_forest',
    category: 'floodplain',
    categoryLabel: 'Taşkın Sahası & Bitki',
    name: 'Sık Ormanlık ve Yaşlı Ağaç Örtüsü',
    minN: 0.080,
    typicalN: 0.100,
    maxN: 0.130,
    description: 'Yere devrilmiş kütükler ve sık sarmaşıklı olgun orman arazisi.',
    applicableTo: ['floodplain']
  },
  {
    id: 'fp_urban_settlement',
    category: 'floodplain',
    categoryLabel: 'Taşkın Sahası & Bitki',
    name: 'Kentsel Alan (Binalar, Yollar, Bahçeler)',
    minN: 0.050,
    typicalN: 0.070,
    maxN: 0.090,
    description: 'Taşkın yayılımını bloke eden yapılar, kaldırımlar ve bahçe duvarları.',
    applicableTo: ['floodplain']
  }
];

interface ManningLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLOB: number;
  currentMain: number;
  currentROB: number;
  onApply: (lob: number, main: number, rob: number) => void;
}

export const ManningLibraryModal: React.FC<ManningLibraryModalProps> = ({
  isOpen,
  onClose,
  currentLOB,
  currentMain,
  currentROB,
  onApply
}) => {
  const [activeTab, setActiveTab] = useState<'presets' | 'materials'>('presets');
  const [selectedTarget, setSelectedTarget] = useState<'both_banks' | 'main' | 'lob' | 'rob'>('both_banks');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Working state inside modal
  const [tempLOB, setTempLOB] = useState<number>(currentLOB);
  const [tempMain, setTempMain] = useState<number>(currentMain);
  const [tempROB, setTempROB] = useState<number>(currentROB);

  useEffect(() => {
    if (isOpen) {
      setTempLOB(currentLOB);
      setTempMain(currentMain);
      setTempROB(currentROB);
    }
  }, [isOpen, currentLOB, currentMain, currentROB]);

  if (!isOpen) return null;

  // Apply a full preset combination
  const handleApplyPreset = (preset: ManningPreset) => {
    setTempLOB(preset.nLOB);
    setTempMain(preset.nMain);
    setTempROB(preset.nROB);
  };

  // Apply specific material to target
  const handleApplyMaterial = (material: ManningMaterial, valueType: 'typical' | 'min' | 'max' = 'typical') => {
    const val = valueType === 'typical' ? material.typicalN : (valueType === 'min' ? material.minN : material.maxN);
    if (selectedTarget === 'both_banks') {
      setTempLOB(val);
      setTempROB(val);
    } else if (selectedTarget === 'lob') {
      setTempLOB(val);
    } else if (selectedTarget === 'rob') {
      setTempROB(val);
    } else if (selectedTarget === 'main') {
      setTempMain(val);
    }
  };

  const handleResetToDefault = () => {
    setTempLOB(0.060);
    setTempMain(0.035);
    setTempROB(0.060);
  };

  const handleSaveAndClose = () => {
    onApply(
      Number(tempLOB.toFixed(4)),
      Number(tempMain.toFixed(4)),
      Number(tempROB.toFixed(4))
    );
    onClose();
  };

  // Filter materials
  const filteredMaterials = MANNING_MATERIALS.filter((mat) => {
    const matchesSearch = mat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          mat.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          mat.categoryLabel.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || mat.category === selectedCategory;
    
    // Check applicable target
    if (selectedTarget === 'main') {
      return matchesSearch && matchesCategory && mat.applicableTo.includes('main');
    } else if (selectedTarget === 'lob' || selectedTarget === 'rob' || selectedTarget === 'both_banks') {
      return matchesSearch && matchesCategory && mat.applicableTo.includes('floodplain');
    }
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-cyan-50/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-700 text-white rounded-2xl shadow-sm">
              <Droplets size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 font-display">
                  Manning Pürüzlülük Katsayısı (n) Kütüphanesi
                </h2>
                <span className="text-[10px] bg-cyan-100 text-cyan-800 font-bold px-2 py-0.5 rounded-full border border-cyan-300">
                  Chow & HEC-RAS Standartları
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Akarsu ana yatağı ve taşkın sahaları için hidrolik pürüzlülük katsayılarını seçin veya özelleştirin
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            title="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        {/* Live Active Values Pill Card */}
        <div className="bg-slate-100/90 px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Layers size={14} className="text-cyan-700" />
            <span>Aktif Kesit Pürüzlülük Değerleri:</span>
          </span>

          <div className="flex items-center gap-2">
            {/* LOB */}
            <div className="bg-white border border-slate-300 px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Sol Taşkın (LOB):</span>
              <input
                type="number"
                step="0.005"
                min="0.01"
                max="0.2"
                value={tempLOB}
                onChange={(e) => setTempLOB(Number(e.target.value))}
                className="w-14 text-center font-bold text-xs text-slate-900 bg-slate-50 rounded border border-slate-200 py-0.5"
              />
            </div>

            {/* MAIN */}
            <div className="bg-cyan-50 border border-cyan-300 px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-xs">
              <span className="text-[10px] font-bold text-cyan-800 uppercase">Ana Kanal (Main):</span>
              <input
                type="number"
                step="0.005"
                min="0.01"
                max="0.2"
                value={tempMain}
                onChange={(e) => setTempMain(Number(e.target.value))}
                className="w-14 text-center font-bold text-xs text-cyan-950 bg-white rounded border border-cyan-400 py-0.5"
              />
            </div>

            {/* ROB */}
            <div className="bg-white border border-slate-300 px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Sağ Taşkın (ROB):</span>
              <input
                type="number"
                step="0.005"
                min="0.01"
                max="0.2"
                value={tempROB}
                onChange={(e) => setTempROB(Number(e.target.value))}
                className="w-14 text-center font-bold text-xs text-slate-900 bg-slate-50 rounded border border-slate-200 py-0.5"
              />
            </div>

            <button
              onClick={handleResetToDefault}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
              title="Varsayılan değerlere sıfırla (0.060 - 0.035 - 0.060)"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-white px-6 pt-2 shrink-0 gap-2">
          <button
            onClick={() => setActiveTab('presets')}
            className={`pb-2.5 px-4 font-bold text-xs flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'presets'
                ? 'border-cyan-700 text-cyan-800 font-display'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sparkles size={14} className={activeTab === 'presets' ? 'text-cyan-700' : 'text-slate-400'} />
            <span>Hazır Tipik Yatak Paketleri ({MANNING_PRESETS.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('materials')}
            className={`pb-2.5 px-4 font-bold text-xs flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'materials'
                ? 'border-cyan-700 text-cyan-800 font-display'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers size={14} className={activeTab === 'materials' ? 'text-cyan-700' : 'text-slate-400'} />
            <span>Ayrıntılı Malzeme Kütüphanesi ({MANNING_MATERIALS.length})</span>
          </button>
        </div>

        {/* Modal Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'presets' ? (
            /* TAB 1: PRESET PACKAGES */
            <div className="space-y-3">
              <div className="bg-amber-50/80 border border-amber-200 p-3 rounded-2xl flex items-start gap-2.5">
                <Info size={16} className="text-amber-700 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-900 leading-relaxed">
                  Aşağıdaki hazır paketler hidrolik mühendisliğinde en sık kullanılan nehir morfolojisi ve ıslah tipi kombinasyonlarıdır. Bir paketi seçtiğinizde hem ana kanal hem de taşkın sahaları (LOB/ROB) için uygun pürüzlülük katsayıları tek hamlede atanır.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {MANNING_PRESETS.map((preset) => {
                  const isMatch = tempMain === preset.nMain && tempLOB === preset.nLOB && tempROB === preset.nROB;
                  return (
                    <div
                      key={preset.id}
                      onClick={() => handleApplyPreset(preset)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer text-left flex flex-col justify-between group ${
                        isMatch
                          ? 'bg-cyan-50/70 border-cyan-500 shadow-md ring-1 ring-cyan-500'
                          : 'bg-white border-slate-200 hover:border-cyan-300 hover:bg-slate-50/80 shadow-xs'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-bold text-xs text-slate-900 group-hover:text-cyan-800 transition-colors">
                            {preset.name}
                          </span>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                            {preset.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed mb-3">
                          {preset.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2.5 border-t border-slate-200/80 mt-auto">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-500">
                            LOB: <strong className="text-slate-800">{preset.nLOB.toFixed(3)}</strong>
                          </span>
                          <span className="text-slate-300">|</span>
                          <span className="text-[10px] font-bold text-cyan-800 bg-cyan-100/70 px-1.5 py-0.5 rounded-md">
                            Ana: <strong>{preset.nMain.toFixed(3)}</strong>
                          </span>
                          <span className="text-slate-300">|</span>
                          <span className="text-[10px] font-bold text-slate-500">
                            ROB: <strong className="text-slate-800">{preset.nROB.toFixed(3)}</strong>
                          </span>
                        </div>

                        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-all flex items-center gap-1 ${
                          isMatch 
                            ? 'bg-cyan-700 text-white shadow-xs' 
                            : 'bg-slate-100 text-slate-700 group-hover:bg-cyan-700 group-hover:text-white'
                        }`}>
                          {isMatch ? <Check size={11} /> : null}
                          <span>{isMatch ? 'Seçili' : 'Paketi Uygula'}</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* TAB 2: DETAILED MATERIALS LIBRARY */
            <div className="space-y-3.5">
              {/* Target Selector Banner */}
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800">Seçimi Hangi Bölgeye Uygulayacaksınız?</span>
                </div>
                <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-300">
                  <button
                    onClick={() => setSelectedTarget('both_banks')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedTarget === 'both_banks'
                        ? 'bg-cyan-700 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Sol & Sağ Taşkın (LOB + ROB)
                  </button>
                  <button
                    onClick={() => setSelectedTarget('main')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedTarget === 'main'
                        ? 'bg-cyan-700 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Ana Kanal (Main)
                  </button>
                  <button
                    onClick={() => setSelectedTarget('lob')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedTarget === 'lob'
                        ? 'bg-cyan-700 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Yalnız Sol (LOB)
                  </button>
                  <button
                    onClick={() => setSelectedTarget('rob')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedTarget === 'rob'
                        ? 'bg-cyan-700 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Yalnız Sağ (ROB)
                  </button>
                </div>
              </div>

              {/* Search & Category Filter */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative flex-1 min-w-[220px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Malzeme adı veya açıklama ara (beton, riprap, söğüt, otlak)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-cyan-600"
                  />
                </div>

                <div className="flex items-center gap-1 overflow-x-auto pb-1">
                  {[
                    { id: 'all', label: 'Tümü' },
                    { id: 'concrete', label: 'Beton' },
                    { id: 'earth', label: 'Toprak' },
                    { id: 'rock', label: 'Taş & Gabion' },
                    { id: 'natural_channel', label: 'Doğal Yatak' },
                    { id: 'floodplain', label: 'Taşkın Sahası' }
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                        selectedCategory === cat.id
                          ? 'bg-slate-800 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Material Cards List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {filteredMaterials.map((mat) => (
                  <div
                    key={mat.id}
                    className="bg-white border border-slate-200 p-3.5 rounded-2xl hover:border-cyan-300 hover:bg-slate-50/60 transition-all flex flex-col justify-between group shadow-xs"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-bold text-xs text-slate-900 group-hover:text-cyan-900 transition-colors">
                          {mat.name}
                        </span>
                        <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200">
                          {mat.categoryLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed mb-3">
                        {mat.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-500 font-medium">Aralık:</span>
                        <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                          {mat.minN.toFixed(3)} - {mat.maxN.toFixed(3)}
                        </span>
                        <span className="text-[10px] font-bold text-cyan-800 bg-cyan-50 px-1.5 py-0.5 rounded border border-cyan-200" title="Önerilen tipik tasarım katsayısı">
                          Tipik: {mat.typicalN.toFixed(3)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleApplyMaterial(mat, 'typical')}
                          className="px-2 py-1 bg-cyan-700 hover:bg-cyan-800 text-white rounded-lg text-[10px] font-bold shadow-xs cursor-pointer transition-all"
                          title={`${selectedTarget} alanına tipik ${mat.typicalN.toFixed(3)} değerini ata`}
                        >
                          Seç ({mat.typicalN.toFixed(3)})
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {filteredMaterials.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-xs">
                  Arama kriterlerine veya seçilen hedef bölgeye uygun malzeme bulunamadı.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-600 flex items-center gap-2">
            <span className="font-bold text-slate-800">Seçilen Değerler:</span>
            <span>LOB: <strong className="text-slate-900">{tempLOB.toFixed(3)}</strong></span>
            <span>•</span>
            <span>Ana: <strong className="text-cyan-800">{tempMain.toFixed(3)}</strong></span>
            <span>•</span>
            <span>ROB: <strong className="text-slate-900">{tempROB.toFixed(3)}</strong></span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              İptal
            </button>
            <button
              onClick={handleSaveAndClose}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-cyan-700 hover:bg-cyan-800 text-white shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Check size={14} />
              <span>Pürüzlülüğü Kesitlere Uygula</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManningLibraryModal;
