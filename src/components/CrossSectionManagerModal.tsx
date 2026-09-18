import React, { useState, useMemo } from 'react';
import {
  X,
  Trash2,
  RotateCcw,
  CheckSquare,
  Square,
  Search,
  Eye,
  Ruler,
  Layers,
  ArrowDownUp,
  AlertTriangle,
  Check,
  Sparkles
} from 'lucide-react';
import { CrossSection } from '../utils/OneDEngine';

interface CrossSectionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  sections: CrossSection[];
  deletedSections: CrossSection[];
  onDeleteSection: (indexOrStation: number) => void;
  onBulkDeleteSections: (stations: number[]) => void;
  onRestoreSection: (station: number) => void;
  onRestoreAll: () => void;
  selectedSectionIdx: number;
  onSelectSection: (index: number) => void;
}

export const CrossSectionManagerModal: React.FC<CrossSectionManagerModalProps> = ({
  isOpen,
  onClose,
  sections,
  deletedSections,
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

  if (!isOpen) return null;

  // Filtered active sections based on search term
  const filteredActiveSections = useMemo(() => {
    if (!searchTerm.trim()) return sections;
    const term = searchTerm.toLowerCase().trim();
    return sections.filter((s, idx) => {
      const kmStr = (s.station / 1000).toFixed(3);
      const mStr = s.station.toFixed(0);
      const idxStr = (idx + 1).toString();
      return kmStr.includes(term) || mStr.includes(term) || idxStr === term;
    });
  }, [sections, searchTerm]);

  // Filtered deleted sections
  const filteredDeletedSections = useMemo(() => {
    if (!searchTerm.trim()) return deletedSections;
    const term = searchTerm.toLowerCase().trim();
    return deletedSections.filter((s) => {
      const kmStr = (s.station / 1000).toFixed(3);
      const mStr = s.station.toFixed(0);
      return kmStr.includes(term) || mStr.includes(term);
    });
  }, [deletedSections, searchTerm]);

  // Handle single checkbox toggle
  const toggleSelectStation = (station: number) => {
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
    filteredActiveSections.forEach((s) => next.add(s.station));
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
      if (mode === 'even' && i % 2 === 0) next.add(s.station);
      if (mode === 'odd' && i % 2 !== 0) next.add(s.station);
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
      if (s.station >= minM && s.station <= maxM) {
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
        sections.find((s) => s.station === previewStation) ||
        deletedSections.find((s) => s.station === previewStation) ||
        sections[selectedSectionIdx] ||
        sections[0]
      );
    }
    return sections[selectedSectionIdx] || sections[0];
  }, [previewStation, sections, deletedSections, selectedSectionIdx]);

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
                placeholder="Başlangıç Km (örn 0.2)"
                value={rangeStartKm}
                onChange={(e) => setRangeStartKm(e.target.value)}
                className="w-20 bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-[11px] font-mono text-center font-bold"
              />
              <span>-</span>
              <input
                type="text"
                placeholder="Bitiş Km (örn 0.6)"
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
                              filteredActiveSections.every((s) => selectedStations.has(s.station))
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
                        const originalIndex = sections.findIndex((s) => s.station === sec.station);
                        const isSelected = selectedStations.has(sec.station);
                        const isFocused = focusedSection?.station === sec.station;
                        const width =
                          sec.profile.length > 1
                            ? sec.profile[sec.profile.length - 1].x - sec.profile[0].x
                            : 0;

                        return (
                          <tr
                            key={sec.station}
                            onClick={() => {
                              setPreviewStation(sec.station);
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
                              <div className="flex items-center gap-1.5">
                                <span>Km {(sec.station / 1000).toFixed(3)}</span>
                                <span className="text-[10px] text-slate-400 font-normal">
                                  ({sec.station.toFixed(0)}m)
                                </span>
                              </div>
                            </td>
                            <td className="py-2 px-3 font-mono font-bold text-cyan-900">
                              {sec.minElevation.toFixed(2)} m
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-600">
                              {sec.maxElevation.toFixed(2)} m
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-700">
                              {width.toFixed(1)} m
                            </td>
                            <td className="py-2 px-3 text-slate-500 text-[11px]">
                              {sec.profile.length} nokta
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
                      {filteredDeletedSections.map((sec) => {
                        const isFocused = focusedSection?.station === sec.station;
                        const width =
                          sec.profile.length > 1
                            ? sec.profile[sec.profile.length - 1].x - sec.profile[0].x
                            : 0;

                        return (
                          <tr
                            key={sec.station}
                            onClick={() => setPreviewStation(sec.station)}
                            className={`cursor-pointer transition-colors ${
                              isFocused ? 'bg-amber-50 font-medium' : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-2 px-3 font-bold text-slate-800">
                              <div className="flex items-center gap-1.5">
                                <span className="line-through text-slate-400">
                                  Km {(sec.station / 1000).toFixed(3)}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono">
                                  ({sec.station.toFixed(0)}m)
                                </span>
                              </div>
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-700">
                              {sec.minElevation.toFixed(2)} m
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-700">{width.toFixed(1)} m</td>
                            <td className="py-2 px-3 text-slate-500">{sec.profile.length} nokta</td>
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
                      Enkesit Önizleme: Km {(focusedSection.station / 1000).toFixed(3)}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      İstasyon: {focusedSection.station.toFixed(0)} m
                    </span>
                  </div>
                  <span className="bg-cyan-100 text-cyan-900 text-[10px] font-bold px-2 py-0.5 rounded-full border border-cyan-200">
                    Taban: {focusedSection.minElevation.toFixed(2)}m
                  </span>
                </div>

                {/* SVG Visualizer */}
                <div className="flex-1 w-full bg-white border border-slate-300 rounded-xl p-3 flex items-center justify-center relative overflow-hidden shadow-inner min-h-[160px]">
                  <svg
                    width="100%"
                    height="100%"
                    viewBox="0 0 500 220"
                    preserveAspectRatio="none"
                    className="w-full h-full"
                  >
                    {(() => {
                      const sec = focusedSection;
                      const minX = Math.min(...sec.profile.map((p) => p.x));
                      const maxX = Math.max(...sec.profile.map((p) => p.x));
                      const minZ = sec.minElevation;
                      const maxZ = sec.maxElevation + 1;

                      const mapX = (x: number) => 25 + ((x - minX) / (maxX - minX || 1)) * 450;
                      const mapZ = (z: number) => 195 - ((z - minZ) / (maxZ - minZ || 1)) * 165;

                      const groundPath =
                        `M 25 195 ` +
                        sec.profile.map((p) => `L ${mapX(p.x)} ${mapZ(p.z)}`).join(' ') +
                        ` L 475 195 Z`;

                      return (
                        <>
                          <path
                            d={groundPath}
                            fill="#f8fafc"
                            stroke="#0f172a"
                            strokeWidth="2.5"
                            strokeLinejoin="round"
                          />
                          <line
                            x1={mapX(sec.bankLeftX)}
                            y1="25"
                            x2={mapX(sec.bankLeftX)}
                            y2="195"
                            stroke="#ef4444"
                            strokeWidth="1.5"
                            strokeDasharray="4 3"
                          />
                          <line
                            x1={mapX(sec.bankRightX)}
                            y1="25"
                            x2={mapX(sec.bankRightX)}
                            y2="195"
                            stroke="#ef4444"
                            strokeWidth="1.5"
                            strokeDasharray="4 3"
                          />
                          <text
                            x={mapX(sec.bankLeftX) - 15}
                            y="20"
                            fontSize="9"
                            fill="#64748b"
                            fontWeight="bold"
                          >
                            Sol
                          </text>
                          <text
                            x={mapX((sec.bankLeftX + sec.bankRightX) / 2)}
                            y="20"
                            fontSize="9"
                            textAnchor="middle"
                            fill="#0284c7"
                            fontWeight="bold"
                          >
                            Ana Yatak
                          </text>
                          <text
                            x={mapX(sec.bankRightX) + 15}
                            y="20"
                            fontSize="9"
                            fill="#64748b"
                            fontWeight="bold"
                          >
                            Sağ
                          </text>
                        </>
                      );
                    })()}
                  </svg>
                </div>

                {/* Section Stats Grid */}
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block">Taban / Zmin:</span>
                    <span className="font-bold text-slate-800 text-xs">
                      {focusedSection.minElevation.toFixed(2)} m
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block">Tepe / Zmax:</span>
                    <span className="font-bold text-slate-800 text-xs">
                      {focusedSection.maxElevation.toFixed(2)} m
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block">Sol Bank İstasyonu:</span>
                    <span className="font-bold text-slate-800 text-xs">
                      {focusedSection.bankLeftX.toFixed(1)} m
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block">Sağ Bank İstasyonu:</span>
                    <span className="font-bold text-slate-800 text-xs">
                      {focusedSection.bankRightX.toFixed(1)} m
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
