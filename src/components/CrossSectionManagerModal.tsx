import React, { useState, useMemo, Component, ErrorInfo, ReactNode } from 'react';
import {
  X,
  Trash2,
  RotateCcw,
  Search,
  Ruler,
  Layers,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { CrossSection } from '../utils/OneDEngine';

interface ModalErrorBoundaryProps {
  children: ReactNode;
  onClose: () => void;
}

interface ModalErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class ModalErrorBoundary extends Component<ModalErrorBoundaryProps, ModalErrorBoundaryState> {
  public override state: ModalErrorBoundaryState = {
    hasError: false,
    errorMessage: ''
  };

  public static getDerivedStateFromError(error: Error): ModalErrorBoundaryState {
    return { hasError: true, errorMessage: error.message || 'Bilinmeyen bir hata' };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('CrossSectionManagerModal error:', error, errorInfo);
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-red-200 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertCircle size={24} />
            </div>
            <h3 className="text-base font-bold text-slate-900">Enkesit Yöneticisi Yüklenemedi</h3>
            <p className="text-xs text-slate-600">
              Kesit verileri listelenirken bir hata ile karşılaşıldı:
            </p>
            <div className="p-2.5 bg-red-50 text-red-800 text-[11px] font-mono rounded-lg border border-red-100 text-left overflow-x-auto max-h-24">
              {this.state.errorMessage}
            </div>
            <button
              type="button"
              onClick={this.props.onClose}
              className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Pencereyi Kapat
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface CrossSectionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  sections?: CrossSection[];
  deletedSections?: CrossSection[];
  onDeleteSection: (indexOrStation: number) => void;
  onBulkDeleteSections: (stations: number[]) => void;
  onRestoreSection: (station: number) => void;
  onRestoreAll: () => void;
  selectedSectionIdx: number;
  onSelectSection: (index: number) => void;
}

// Format utilities with null / NaN checks
const fmtNum = (val: number | undefined | null, dec: number = 2, fallback: string = '-'): string => {
  return val != null && !isNaN(val) ? val.toFixed(dec) : fallback;
};

const fmtKm = (station: number | undefined | null): string => {
  return station != null && !isNaN(station) ? (station / 1000).toFixed(3) : '-';
};

const fmtM = (station: number | undefined | null): string => {
  return station != null && !isNaN(station) ? station.toFixed(0) : '-';
};

const CrossSectionManagerModalContent: React.FC<CrossSectionManagerModalProps> = ({
  isOpen,
  onClose,
  sections = [],
  deletedSections = [],
  onDeleteSection,
  onBulkDeleteSections,
  onRestoreSection,
  onRestoreAll,
  selectedSectionIdx,
  onSelectSection
}) => {
  const [activeTab, setActiveTab] = useState<'active' | 'deleted'>('active');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedStations, setSelectedStations] = useState<Set<number>>(new Set());
  const [previewStation, setPreviewStation] = useState<number | null>(null);

  // Range selection helpers
  const [rangeStartKm, setRangeStartKm] = useState<string>('');
  const [rangeEndKm, setRangeEndKm] = useState<string>('');

  // Filtered active sections based on search term
  const filteredActiveSections = useMemo(() => {
    const list = Array.isArray(sections) ? sections : [];
    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase().trim();
    return list.filter((s, idx) => {
      if (!s) return false;
      const kmStr = fmtKm(s.station);
      const mStr = fmtM(s.station);
      const idxStr = (idx + 1).toString();
      return kmStr.includes(term) || mStr.includes(term) || idxStr === term;
    });
  }, [sections, searchTerm]);

  // Filtered deleted sections
  const filteredDeletedSections = useMemo(() => {
    const list = Array.isArray(deletedSections) ? deletedSections : [];
    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase().trim();
    return list.filter((s) => {
      if (!s) return false;
      const kmStr = fmtKm(s.station);
      const mStr = fmtM(s.station);
      return kmStr.includes(term) || mStr.includes(term);
    });
  }, [deletedSections, searchTerm]);

  // Handle single checkbox toggle
  const toggleSelectStation = (station: number | undefined) => {
    if (station == null) return;
    const next = new Set(selectedStations);
    if (next.has(station)) {
      next.delete(station);
    } else {
      next.add(station);
    }
    setSelectedStations(next);
  };

  // Select all visible
  const selectAllVisible = () => {
    const next = new Set(selectedStations);
    filteredActiveSections.forEach((s) => {
      if (s && s.station != null) next.add(s.station);
    });
    setSelectedStations(next);
  };

  // Deselect all
  const deselectAll = () => {
    setSelectedStations(new Set());
  };

  // Select alternate (tek/çift - 1 atlayarak)
  const selectAlternate = (mode: 'even' | 'odd') => {
    const next = new Set<number>();
    filteredActiveSections.forEach((s, i) => {
      if (s && s.station != null) {
        if (mode === 'even' && i % 2 === 0) next.add(s.station);
        if (mode === 'odd' && i % 2 !== 0) next.add(s.station);
      }
    });
    setSelectedStations(next);
  };

  // Apply Range selection (Km start to end)
  const applyRangeSelection = () => {
    const startM = parseFloat(rangeStartKm.replace(',', '.')) * 1000;
    const endM = parseFloat(rangeEndKm.replace(',', '.')) * 1000;
    if (isNaN(startM) || isNaN(endM)) return;

    const minM = Math.min(startM, endM);
    const maxM = Math.max(startM, endM);

    const next = new Set(selectedStations);
    sections.forEach((s) => {
      if (s && s.station != null && s.station >= minM && s.station <= maxM) {
        next.add(s.station);
      }
    });
    setSelectedStations(next);
  };

  // Execute bulk delete
  const executeBulkDelete = () => {
    if (selectedStations.size === 0) return;
    if (
      window.confirm(
        `Seçili ${selectedStations.size} adet enkesiti hidrolik modelden silmek istediğinize emin misiniz?`
      )
    ) {
      onBulkDeleteSections(Array.from(selectedStations));
      setSelectedStations(new Set());
    }
  };

  // Section currently focused for preview
  const focusedSection = useMemo(() => {
    if (previewStation !== null) {
      return (
        sections.find((s) => s && s.station === previewStation) ||
        deletedSections.find((s) => s && s.station === previewStation) ||
        sections[selectedSectionIdx] ||
        sections[0] ||
        null
      );
    }
    return sections[selectedSectionIdx] || sections[0] || null;
  }, [previewStation, sections, deletedSections, selectedSectionIdx]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white w-full max-w-5xl h-[88vh] max-h-[820px] rounded-2xl shadow-2xl border border-slate-300 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-500/20 text-cyan-300 rounded-xl border border-cyan-500/30">
              <Layers size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-white">1B Enkesit Yönetimi & Silme</h3>
                <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {sections.length} Aktif Kesit
                </span>
                {deletedSections.length > 0 && (
                  <span className="bg-red-500/20 text-red-300 border border-red-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {deletedSections.length} Silinen
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Modeldeki istenmeyen, daralan veya hatalı enkesitleri tek tek ya da toplu olarak kaldırabilirsiniz.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            title="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab & Toolbar Bar */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          
          {/* Active vs Deleted Tabs */}
          <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl border border-slate-300">
            <button
              type="button"
              onClick={() => setActiveTab('active')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'active'
                  ? 'bg-cyan-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Ruler size={13} />
              <span>Aktif Kesitler ({sections.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('deleted')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'deleted'
                  ? 'bg-red-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Trash2 size={13} />
              <span>Silinen Kesitler ({deletedSections.length})</span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="İstasyon / Km Ara (örn: 250)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl pl-8 pr-3 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-cyan-600 shadow-2xs"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Actions on Active Tab */}
          {activeTab === 'active' && (
            <div className="flex items-center gap-2 flex-wrap">
              {selectedStations.size > 0 && (
                <button
                  type="button"
                  onClick={executeBulkDelete}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer animate-in fade-in"
                >
                  <Trash2 size={13} />
                  <span>Seçilen {selectedStations.size} Kesiti Sil</span>
                </button>
              )}

              {deletedSections.length > 0 && (
                <button
                  type="button"
                  onClick={onRestoreAll}
                  className="px-3 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                  title="Tüm silinen kesitleri orijinal konumlarına geri getirir"
                >
                  <RotateCcw size={13} />
                  <span>Tümünü Geri Yükle ({deletedSections.length})</span>
                </button>
              )}
            </div>
          )}

          {/* Actions on Deleted Tab */}
          {activeTab === 'deleted' && deletedSections.length > 0 && (
            <button
              type="button"
              onClick={onRestoreAll}
              className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw size={13} />
              <span>Tüm Silinenleri Geri Yükle ({deletedSections.length})</span>
            </button>
          )}
        </div>

        {/* Quick Range & Multi-select Sub-Toolbar for Active Tab */}
        {activeTab === 'active' && sections.length > 0 && (
          <div className="px-5 py-2 bg-slate-100/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700 shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-600 text-[11px]">Hızlı Seçim:</span>
              <button
                type="button"
                onClick={selectAllVisible}
                className="px-2 py-0.5 bg-white hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-300 text-[10px] font-bold cursor-pointer transition-colors"
              >
                Tümünü Seç ({filteredActiveSections.length})
              </button>
              <button
                type="button"
                onClick={deselectAll}
                className="px-2 py-0.5 bg-white hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-300 text-[10px] font-bold cursor-pointer transition-colors"
              >
                Seçimi Temizle
              </button>
              <button
                type="button"
                onClick={() => selectAlternate('odd')}
                className="px-2 py-0.5 bg-white hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-300 text-[10px] font-bold cursor-pointer transition-colors"
                title="Kesit sıklığını yarıya düşürmek için her 2 kesitten birini seçer"
              >
                1 Atlayarak Seç (Seyreltme)
              </button>
            </div>

            {/* Km Range Selector */}
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-600 text-[11px]">Km Aralığı:</span>
              <input
                type="text"
                placeholder="Başlangıç Km"
                value={rangeStartKm}
                onChange={(e) => setRangeStartKm(e.target.value)}
                className="w-20 bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-[11px] font-mono text-center font-bold"
              />
              <span>-</span>
              <input
                type="text"
                placeholder="Bitiş Km"
                value={rangeEndKm}
                onChange={(e) => setRangeEndKm(e.target.value)}
                className="w-20 bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-[11px] font-mono text-center font-bold"
              />
              <button
                type="button"
                onClick={applyRangeSelection}
                className="px-2 py-0.5 bg-cyan-700 hover:bg-cyan-800 text-white rounded-lg text-[10px] font-bold cursor-pointer shadow-2xs"
              >
                Aralığı Seç
              </button>
            </div>
          </div>
        )}

        {/* Modal Main Body (Split into Table on Left, Live SVG Preview on Right) */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
          
          {/* Table Column (col-span-8) */}
          <div className="lg:col-span-8 border-r border-slate-200 flex flex-col min-h-0 bg-white">
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {activeTab === 'active' ? (
                filteredActiveSections.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 space-y-2">
                    <p className="font-bold text-sm">Kesit bulunamadı</p>
                    <p className="text-xs">
                      {searchTerm ? 'Arama kriterlerinize uyan kesit yok.' : 'Henüz enkesit çıkarılmadı.'}
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={
                              filteredActiveSections.length > 0 &&
                              filteredActiveSections.every((s) => s && selectedStations.has(s.station))
                            }
                            onChange={(e) => {
                              if (e.target.checked) selectAllVisible();
                              else deselectAll();
                            }}
                            className="rounded text-cyan-600 focus:ring-0 cursor-pointer"
                          />
                        </th>
                        <th className="py-2 px-2.5 w-12 text-center text-slate-500">#</th>
                        <th className="py-2 px-3">İstasyon (Km)</th>
                        <th className="py-2 px-3">Taban Kotu</th>
                        <th className="py-2 px-3">Tepe Kotu</th>
                        <th className="py-2 px-3">Genişlik (B)</th>
                        <th className="py-2 px-3">Noktalar</th>
                        <th className="py-2 px-3 text-right">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredActiveSections.map((sec, idx) => {
                        if (!sec) return null;
                        const originalIndex = sections.findIndex((s) => s && s.station === sec.station);
                        const isSelected = selectedStations.has(sec.station);
                        const isFocused = focusedSection?.station === sec.station;
                        const profile = Array.isArray(sec.profile) ? sec.profile : [];
                        const width =
                          profile.length > 1
                            ? Math.abs(profile[profile.length - 1].x - profile[0].x)
                            : 0;

                        return (
                          <tr
                            key={sec.station ?? idx}
                            onClick={() => {
                              if (sec.station != null) setPreviewStation(sec.station);
                              if (originalIndex !== -1) onSelectSection(originalIndex);
                            }}
                            className={`cursor-pointer transition-colors ${
                              isFocused
                                ? 'bg-cyan-50/90 font-medium'
                                : isSelected
                                ? 'bg-red-50/50'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <td
                              className="py-2 px-3 text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectStation(sec.station)}
                                className="rounded text-cyan-600 focus:ring-0 cursor-pointer"
                              />
                            </td>
                            <td className="py-2 px-2.5 text-center font-mono text-slate-400 text-[11px]">
                              {originalIndex + 1}
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-900">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1.5">
                                  <span>Km {fmtKm(sec.station)}</span>
                                  <span className="text-[10px] text-slate-400 font-normal">
                                    ({fmtM(sec.station)}m)
                                  </span>
                                </div>
                                {(sec.angleAdjustment || sec.isIntersecting) ? (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    {sec.isIntersecting && (
                                      <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.2 rounded font-bold">
                                        Kesişiyor
                                      </span>
                                    )}
                                    {sec.angleAdjustment && (
                                      <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold font-mono">
                                        {sec.angleAdjustment > 0 ? '+' : ''}{sec.angleAdjustment}° Düzeltildi (Yeşil)
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-bold font-mono">
                                      Orijinal (Mavi)
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3 font-mono font-bold text-cyan-900">
                              {fmtNum(sec.minElevation)} m
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-600">
                              {fmtNum(sec.maxElevation)} m
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-700">
                              {fmtNum(width, 1)} m
                            </td>
                            <td className="py-2 px-3 text-slate-500 text-[11px]">
                              {profile.length} nokta
                            </td>
                            <td className="py-2 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => onDeleteSection(originalIndex !== -1 ? originalIndex : sec.station)}
                                className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer inline-flex items-center gap-1"
                                title="Bu kesiti sil"
                              >
                                <Trash2 size={12} />
                                <span>Sil</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )
              ) : (
                /* DELETED SECTIONS TAB */
                filteredDeletedSections.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 space-y-2">
                    <p className="font-bold text-sm">Silinen kesit yok</p>
                    <p className="text-xs">Modelden silinmiş herhangi bir enkesit bulunmuyor.</p>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">İstasyon (Km)</th>
                        <th className="py-2 px-3">Taban Kotu</th>
                        <th className="py-2 px-3">Genişlik (B)</th>
                        <th className="py-2 px-3">Nokta Sayısı</th>
                        <th className="py-2 px-3 text-right">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredDeletedSections.map((sec, idx) => {
                        if (!sec) return null;
                        const isFocused = focusedSection?.station === sec.station;
                        const profile = Array.isArray(sec.profile) ? sec.profile : [];
                        const width =
                          profile.length > 1
                            ? Math.abs(profile[profile.length - 1].x - profile[0].x)
                            : 0;

                        return (
                          <tr
                            key={sec.station ?? idx}
                            onClick={() => {
                              if (sec.station != null) setPreviewStation(sec.station);
                            }}
                            className={`cursor-pointer transition-colors ${
                              isFocused ? 'bg-amber-50 font-medium' : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-2 px-3 font-bold text-slate-800">
                              <div className="flex items-center gap-1.5">
                                <span className="line-through text-slate-400">
                                  Km {fmtKm(sec.station)}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono">
                                  ({fmtM(sec.station)}m)
                                </span>
                              </div>
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-700">
                              {fmtNum(sec.minElevation)} m
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-700">{fmtNum(width, 1)} m</td>
                            <td className="py-2 px-3 text-slate-500">{profile.length} nokta</td>
                            <td className="py-2 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => onRestoreSection(sec.station)}
                                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-[11px] font-bold transition-colors cursor-pointer inline-flex items-center gap-1"
                                title="Bu kesiti modele geri yükle"
                              >
                                <RotateCcw size={12} />
                                <span>Geri Yükle</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )
              )}
            </div>
          </div>

          {/* Right Live Preview Column (col-span-4) */}
          <div className="lg:col-span-4 bg-slate-50 p-4 flex flex-col justify-between overflow-hidden">
            {focusedSection ? (
              <div className="flex-1 flex flex-col justify-between space-y-3 min-h-0">
                <div className="border-b border-slate-200 pb-2 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Enkesit Önizleme: Km {fmtKm(focusedSection.station)}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      İstasyon: {fmtM(focusedSection.station)} m
                    </span>
                  </div>
                  <span className="bg-cyan-100 text-cyan-900 text-[10px] font-bold px-2 py-0.5 rounded-full border border-cyan-200">
                    Taban: {fmtNum(focusedSection.minElevation)}m
                  </span>
                </div>

                {/* SVG Visualizer */}
                <div className="flex-1 w-full bg-white border border-slate-300 rounded-xl p-3 flex items-center justify-center relative overflow-hidden shadow-inner min-h-[160px]">
                  {(() => {
                    const sec = focusedSection;
                    const profile = Array.isArray(sec.profile) ? sec.profile : [];
                    if (profile.length < 2) {
                      return (
                        <div className="text-slate-400 text-xs text-center p-4">
                          Profil noktaları yetersiz.
                        </div>
                      );
                    }

                    const xs = profile.map((p) => p.x);
                    const zs = profile.map((p) => p.z);
                    const minX = Math.min(...xs);
                    const maxX = Math.max(...xs);
                    const minZ = sec.minElevation != null ? sec.minElevation : Math.min(...zs);
                    const maxZ = (sec.maxElevation != null ? sec.maxElevation : Math.max(...zs)) + 1;
                    const rangeX = maxX - minX || 1;
                    const rangeZ = maxZ - minZ || 1;

                    const mapX = (x: number) => 30 + ((x - minX) / rangeX) * 440;
                    const mapZ = (z: number) => 195 - ((z - minZ) / rangeZ) * 155;

                    const getElevAt = (xVal: number) => {
                      if (xVal <= profile[0].x) return profile[0].z;
                      if (xVal >= profile[profile.length - 1].x) return profile[profile.length - 1].z;
                      for (let k = 0; k < profile.length - 1; k++) {
                        const p1 = profile[k];
                        const p2 = profile[k + 1];
                        if (xVal >= p1.x && xVal <= p2.x) {
                          const frac = (xVal - p1.x) / Math.max(1e-6, p2.x - p1.x);
                          return p1.z + frac * (p2.z - p1.z);
                        }
                      }
                      return minZ;
                    };

                    let talvegPt = profile[0];
                    for (const pt of profile) {
                      if (pt.z < talvegPt.z) talvegPt = pt;
                    }

                    const bLeft = sec.bankLeftX != null && !isNaN(sec.bankLeftX)
                      ? sec.bankLeftX
                      : minX + rangeX * 0.3;
                    const bRight = sec.bankRightX != null && !isNaN(sec.bankRightX)
                      ? sec.bankRightX
                      : minX + rangeX * 0.7;

                    const bLeftZ = getElevAt(bLeft);
                    const bRightZ = getElevAt(bRight);

                    const bLeftSvgX = mapX(bLeft);
                    const bRightSvgX = mapX(bRight);
                    const talvegSvgX = mapX(talvegPt.x);
                    const bLeftSvgY = mapZ(bLeftZ);
                    const bRightSvgY = mapZ(bRightZ);
                    const talvegSvgY = mapZ(talvegPt.z);

                    const distLFromTalveg = Math.abs(talvegPt.x - bLeft);
                    const distRFromTalveg = Math.abs(bRight - talvegPt.x);
                    const totalChannelWidth = Math.abs(bRight - bLeft);

                    const spillElevation = Math.min(bLeftZ, bRightZ);
                    let spillLeftX = bLeft;
                    if (bLeftZ > spillElevation) {
                      const talvegIdx = profile.indexOf(talvegPt);
                      for (let k = talvegIdx; k >= 1; k--) {
                        const p1 = profile[k];
                        const p2 = profile[k - 1];
                        if (p1.z <= spillElevation && p2.z >= spillElevation) {
                          const frac = (spillElevation - p1.z) / Math.max(1e-6, p2.z - p1.z);
                          spillLeftX = p1.x + frac * (p2.x - p1.x);
                          break;
                        }
                      }
                    }
                    let spillRightX = bRight;
                    if (bRightZ > spillElevation) {
                      const talvegIdx = profile.indexOf(talvegPt);
                      for (let k = talvegIdx; k < profile.length - 1; k++) {
                        const p1 = profile[k];
                        const p2 = profile[k + 1];
                        if (p1.z <= spillElevation && p2.z >= spillElevation) {
                          const frac = (spillElevation - p1.z) / Math.max(1e-6, p2.z - p1.z);
                          spillRightX = p1.x + frac * (p2.x - p1.x);
                          break;
                        }
                      }
                    }
                    const bankfullWidth = Math.max(0.5, spillRightX - spillLeftX);
                    const spillSvgL = mapX(spillLeftX);
                    const spillSvgR = mapX(spillRightX);
                    const spillSvgY = mapZ(spillElevation);

                    const groundPath =
                      `M 30 195 ` +
                      profile.map((p) => `L ${mapX(p.x)} ${mapZ(p.z)}`).join(' ') +
                      ` L 470 195 Z`;

                    return (
                      <svg
                        width="100%"
                        height="100%"
                        viewBox="0 0 500 220"
                        preserveAspectRatio="none"
                        className="w-full h-full"
                      >
                        <defs>
                          <linearGradient id="groundGradModal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f8fafc" stopOpacity="0.9" />
                            <stop offset="100%" stopColor="#e2e8f0" stopOpacity="0.7" />
                          </linearGradient>
                        </defs>

                        {/* Zone shading */}
                        <rect x={30} y={15} width={Math.max(0, bLeftSvgX - 30)} height={180} fill="#f0fdf4" fillOpacity="0.4" />
                        <rect x={bLeftSvgX} y={15} width={Math.max(0, bRightSvgX - bLeftSvgX)} height={180} fill="#ecfeff" fillOpacity="0.5" />
                        <rect x={bRightSvgX} y={15} width={Math.max(0, 470 - bRightSvgX)} height={180} fill="#fffbeb" fillOpacity="0.4" />

                        {/* Total Channel Width Dimension */}
                        {bRightSvgX - bLeftSvgX > 20 && (
                          <g>
                            <line x1={bLeftSvgX} y1={36} x2={bRightSvgX} y2={36} stroke="#0284c7" strokeWidth="1.2" />
                            <rect x={(bLeftSvgX + bRightSvgX) / 2 - 40} y={29} width={80} height={13} rx={2} fill="#ffffff" stroke="#bae6fd" strokeWidth="1" />
                            <text x={(bLeftSvgX + bRightSvgX) / 2} y={38} fontSize="7" textAnchor="middle" fill="#0369a1" fontWeight="bold">
                              Toplam Yatak: {totalChannelWidth.toFixed(1)}m
                            </text>
                          </g>
                        )}

                        {/* Bankfull Spill Line */}
                        {spillSvgR - spillSvgL > 20 && (
                          <g>
                            <line x1={spillSvgL} y1={spillSvgY} x2={spillSvgR} y2={spillSvgY} stroke="#ea580c" strokeWidth="1.4" strokeDasharray="3 2" />
                            <rect x={(spillSvgL + spillSvgR) / 2 - 45} y={44} width={90} height={13} rx={2} fill="#fff7ed" stroke="#fed7aa" strokeWidth="1" />
                            <text x={(spillSvgL + spillSvgR) / 2} y={53} fontSize="7" textAnchor="middle" fill="#c2410c" fontWeight="bold">
                              Taşma: {bankfullWidth.toFixed(1)}m
                            </text>
                          </g>
                        )}

                        <path
                          d={groundPath}
                          fill="url(#groundGradModal)"
                          stroke="#0f172a"
                          strokeWidth="2.5"
                          strokeLinejoin="round"
                        />

                        {/* 1. Sol Şev Üstü */}
                        <line
                          x1={bLeftSvgX}
                          y1="15"
                          x2={bLeftSvgX}
                          y2="195"
                          stroke="#059669"
                          strokeWidth="1.8"
                          strokeDasharray="4 3"
                        />
                        <circle cx={bLeftSvgX} cy={bLeftSvgY} r="4" fill="#10b981" stroke="#064e3b" strokeWidth="1.5" />
                        <g transform={`translate(${Math.max(35, bLeftSvgX)}, 14)`}>
                          <rect x="-40" y="-10" width="80" height="13" rx="3" fill="#ecfdf5" stroke="#a7f3d0" strokeWidth="1" />
                          <text x="0" y="-1" fontSize="7" textAnchor="middle" fill="#065f46" fontWeight="bold">
                            🌿 Sol (-{distLFromTalveg.toFixed(1)}m)
                          </text>
                        </g>

                        {/* 2. Dere Ekseni / Taban */}
                        <line
                          x1={talvegSvgX}
                          y1="18"
                          x2={talvegSvgX}
                          y2="195"
                          stroke="#0284c7"
                          strokeWidth="1.8"
                          strokeDasharray="5 3"
                        />
                        <circle cx={talvegSvgX} cy={talvegSvgY} r="4.5" fill="#0284c7" stroke="#0c4a6e" strokeWidth="1.5" />
                        <g transform={`translate(${Math.max(50, Math.min(450, talvegSvgX))}, 192)`}>
                          <rect x="-35" y="-10" width="70" height="12" rx="3" fill="#e0f2fe" stroke="#7dd3fc" strokeWidth="1" />
                          <text x="0" y="-1" fontSize="7" textAnchor="middle" fill="#0369a1" fontWeight="bold">
                            🌊 Talveg ({talvegPt.z.toFixed(2)}m)
                          </text>
                        </g>

                        {/* 3. Sağ Şev Üstü */}
                        <line
                          x1={bRightSvgX}
                          y1="15"
                          x2={bRightSvgX}
                          y2="195"
                          stroke="#d97706"
                          strokeWidth="1.8"
                          strokeDasharray="4 3"
                        />
                        <circle cx={bRightSvgX} cy={bRightSvgY} r="4" fill="#f59e0b" stroke="#78350f" strokeWidth="1.5" />
                        <g transform={`translate(${Math.min(465, bRightSvgX)}, 14)`}>
                          <rect x="-40" y="-10" width="80" height="13" rx="3" fill="#fffbeb" stroke="#fde68a" strokeWidth="1" />
                          <text x="0" y="-1" fontSize="7" textAnchor="middle" fill="#92400e" fontWeight="bold">
                            🌾 Sağ (+{distRFromTalveg.toFixed(1)}m)
                          </text>
                        </g>
                      </svg>
                    );
                  })()}
                </div>

                {/* Section Stats Grid */}
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block">Taban / Zmin:</span>
                    <span className="font-bold text-slate-800 text-xs">
                      {fmtNum(focusedSection.minElevation)} m
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block">Tepe / Zmax:</span>
                    <span className="font-bold text-slate-800 text-xs">
                      {fmtNum(focusedSection.maxElevation)} m
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block">Sol Bank İstasyonu:</span>
                    <span className="font-bold text-slate-800 text-xs">
                      {fmtNum(focusedSection.bankLeftX, 1)} m
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block">Sağ Bank İstasyonu:</span>
                    <span className="font-bold text-slate-800 text-xs">
                      {fmtNum(focusedSection.bankRightX, 1)} m
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs text-center p-4">
                Önizlemek için soldaki tablodan bir kesit seçiniz.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Sparkles size={13} className="text-cyan-600" />
            <span>
              Kesitler güncellendiğinde mansap hidrolik yatak eğimi otomatik olarak yeniden hesaplanır.
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            Tamam / Kapat
          </button>
        </div>

      </div>
    </div>
  );
};

export const CrossSectionManagerModal: React.FC<CrossSectionManagerModalProps> = (props) => {
  if (!props.isOpen) return null;
  return (
    <ModalErrorBoundary onClose={props.onClose}>
      <CrossSectionManagerModalContent {...props} />
    </ModalErrorBoundary>
  );
};
