import React, { useState, useMemo, useRef } from 'react';
import {
  X,
  Upload,
  Crosshair,
  Waves,
  RefreshCw,
  AlertTriangle,
  Check,
  Navigation,
  ArrowRight,
} from 'lucide-react';
import {
  GloFASMetric,
  HydrographPreviewResult,
  parseHydrographPointKML,
  fetchGloFASDischarge,
} from '../utils/hydrographFetcher';

export interface HydrographSourceCoord {
  lat: number;
  lon: number;
  label?: string;
}

interface HydrographSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceCoord: HydrographSourceCoord | null;
  onChangeSourceCoord: (next: HydrographSourceCoord) => void;
  onStartMapPick: () => void;
  centerlineCoords: [number, number][];
  onApplyHydrograph: (points: { time: number; flow: number }[], label: string) => void;
}

function formatVolume(m3: number): string {
  if (m3 >= 1_000_000) return `${(m3 / 1_000_000).toFixed(2)}M m³`;
  if (m3 >= 1_000) return `${(m3 / 1_000).toFixed(1)}K m³`;
  return `${m3.toLocaleString('tr-TR')} m³`;
}

export const HydrographSourceModal: React.FC<HydrographSourceModalProps> = ({
  isOpen,
  onClose,
  sourceCoord,
  onChangeSourceCoord,
  onStartMapPick,
  centerlineCoords,
  onApplyHydrograph,
}) => {
  const [kmlStatusNote, setKmlStatusNote] = useState<string | null>(null);
  const [coordError, setCoordError] = useState<string | null>(null);

  // Copernicus GloFAS v4 Parameters
  const [glofasPastDays, setGlofasPastDays] = useState<number>(14);
  const [glofasForecastDays, setGlofasForecastDays] = useState<number>(7);
  const [glofasMetric, setGlofasMetric] = useState<GloFASMetric>('river_discharge');
  const [glofasStepHours, setGlofasStepHours] = useState<1 | 3 | 6 | 24>(1);
  const [glofasPeakWindowOnly, setGlofasPeakWindowOnly] = useState<boolean>(false);

  // Fetch & Preview State
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<HydrographPreviewResult | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const effectiveCoord = useMemo(() => {
    if (sourceCoord) return sourceCoord;
    if (centerlineCoords.length > 0) {
      return {
        lat: Number(centerlineCoords[0][0].toFixed(5)),
        lon: Number(centerlineCoords[0][1].toFixed(5)),
        label: 'Nehir Aksı Başlangıcı',
      };
    }
    return { lat: 39.925, lon: 32.836, label: 'Varsayılan Koordinat' };
  }, [sourceCoord, centerlineCoords]);

  const handleKmlUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoordError(null);
    setKmlStatusNote(null);
    try {
      const parsed = await parseHydrographPointKML(file);
      onChangeSourceCoord({
        lat: Number(parsed.lat.toFixed(6)),
        lon: Number(parsed.lon.toFixed(6)),
        label: `KML: ${parsed.label}`,
      });
      if (parsed.warning) {
        setKmlStatusNote(parsed.warning);
      } else {
        setKmlStatusNote(`"${parsed.label}" noktası KML dosyasından başarıyla alındı.`);
      }
      setPreviewResult(null);
    } catch (err: any) {
      setCoordError(err?.message || 'KML noktası okunamadı.');
    } finally {
      e.target.value = '';
    }
  };

  const handleFetchAndPreview = async () => {
    setIsFetching(true);
    setFetchError(null);
    setHoverIdx(null);

    try {
      const result = await fetchGloFASDischarge({
        lat: effectiveCoord.lat,
        lon: effectiveCoord.lon,
        pastDays: glofasPastDays,
        forecastDays: glofasForecastDays,
        metric: glofasMetric,
        stepHours: glofasStepHours,
        peakWindowOnly: glofasPeakWindowOnly,
      });
      setPreviewResult(result);
    } catch (err: any) {
      setFetchError(err?.message || 'GloFAS hidrograf verisi çekilirken bir hata oluştu.');
    } finally {
      setIsFetching(false);
    }
  };

  const handleConfirmTransfer = () => {
    if (!previewResult || previewResult.points.length < 2) return;
    const transferPoints = previewResult.points.map((pt) => ({
      time: pt.time,
      flow: pt.flow,
    }));
    onApplyHydrograph(transferPoints, previewResult.sourceTitle);
    onClose();
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!previewResult || previewResult.points.length < 2 || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const normX = ((e.clientX - rect.left) / rect.width) * 760;
    const plotLeft = 60;
    const plotRight = 700;
    const clampedX = Math.max(plotLeft, Math.min(plotRight, normX));
    const ratio = (clampedX - plotLeft) / (plotRight - plotLeft);
    const maxT = Math.max(...previewResult.points.map((p) => p.time), 1);
    const targetT = ratio * maxT;

    let closest = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < previewResult.points.length; i++) {
      const diff = Math.abs(previewResult.points[i].time - targetT);
      if (diff < bestDiff) {
        bestDiff = diff;
        closest = i;
      }
    }
    setHoverIdx(closest);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-slate-900">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              Otomatik Akım Hidrografı Oluşturucu (GloFAS v4)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Copernicus GloFAS v4 küresel nehir debisi servisinden geçmiş ve tahmin verisi çekin, ön izleyin ve saatlik hidrografa aktarın
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer"
            title="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5 bg-white">
          {/* 1. Location Selector Strip */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-slate-800">
                  Hedef Konum (WGS84)
                </div>
                <div className="text-xs text-slate-500 font-mono tabular-nums">
                  {effectiveCoord.label || 'Koordinat'} · {effectiveCoord.lat.toFixed(5)}°, {effectiveCoord.lon.toFixed(5)}°
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onStartMapPick}
                  className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Crosshair size={14} />
                  <span>Haritadan Nokta Seç</span>
                </button>

                <label className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0">
                  <Upload size={14} className="text-cyan-700" />
                  <span>Kaynak Nokta KML Yükle</span>
                  <input type="file" accept=".kml" onChange={handleKmlUpload} className="hidden" />
                </label>

                {centerlineCoords.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setKmlStatusNote(null);
                      setCoordError(null);
                      onChangeSourceCoord({
                        lat: Number(centerlineCoords[0][0].toFixed(6)),
                        lon: Number(centerlineCoords[0][1].toFixed(6)),
                        label: 'Nehir Aksı Başlangıcı (Memba)',
                      });
                      setPreviewResult(null);
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Navigation size={13} className="text-slate-600" />
                    <span>Aks Başlangıcını Al</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-200/80">
              <div className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                <label className="text-xs font-medium text-slate-600 whitespace-nowrap">Enlem (Lat):</label>
                <input
                  type="number"
                  step="0.0001"
                  min="-90"
                  max="90"
                  value={effectiveCoord.lat}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isNaN(v) && v >= -90 && v <= 90) {
                      onChangeSourceCoord({ lat: v, lon: effectiveCoord.lon, label: 'Manuel Koordinat' });
                    }
                  }}
                  className="w-32 text-right font-mono tabular-nums text-xs font-semibold text-slate-900 focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                <label className="text-xs font-medium text-slate-600 whitespace-nowrap">Boylam (Lon):</label>
                <input
                  type="number"
                  step="0.0001"
                  min="-180"
                  max="180"
                  value={effectiveCoord.lon}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isNaN(v) && v >= -180 && v <= 180) {
                      onChangeSourceCoord({ lat: effectiveCoord.lat, lon: v, label: 'Manuel Koordinat' });
                    }
                  }}
                  className="w-32 text-right font-mono tabular-nums text-xs font-semibold text-slate-900 focus:outline-none"
                />
              </div>
            </div>

            {kmlStatusNote && (
              <p className="text-xs text-cyan-800 font-medium">{kmlStatusNote}</p>
            )}
            {coordError && (
              <p className="text-xs text-rose-700 font-medium">{coordError}</p>
            )}
          </div>

          {/* 2. Copernicus GloFAS v4 Configuration */}
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                  <Waves size={15} className="text-cyan-700 shrink-0" />
                  <span>Copernicus GloFAS v4 — Küresel Nehir Debisi (~5 km grid)</span>
                </div>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={glofasPeakWindowOnly}
                    onChange={(e) => setGlofasPeakWindowOnly(e.target.checked)}
                    className="rounded border-slate-300 text-cyan-700 focus:ring-cyan-600"
                  />
                  <span>Pik dalgası odaklı (±3 gün) kes</span>
                </label>
              </div>

              <p className="text-xs text-slate-600">
                Günlük toplam nehir debisi (m³/s) verisini çeker ve seçilen adıma monoton kübik interpolasyon (PCHIP) ile dönüştürür.
              </p>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Geçmiş Gün (0–92)</label>
                  <input
                    type="number"
                    min={0}
                    max={92}
                    value={glofasPastDays}
                    onChange={(e) => setGlofasPastDays(Math.max(0, Math.min(92, Number(e.target.value) || 0)))}
                    className="w-full font-mono tabular-nums text-sm font-semibold text-slate-900 focus:outline-none"
                  />
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Tahmin Günü (1–90)</label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={glofasForecastDays}
                    onChange={(e) => setGlofasForecastDays(Math.max(1, Math.min(90, Number(e.target.value) || 7)))}
                    className="w-full font-mono tabular-nums text-sm font-semibold text-slate-900 focus:outline-none"
                  />
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Topluluk İstatistiği</label>
                  <select
                    value={glofasMetric}
                    onChange={(e) => setGlofasMetric(e.target.value as GloFASMetric)}
                    className="w-full text-xs font-semibold text-slate-900 bg-transparent focus:outline-none"
                  >
                    <option value="river_discharge">Standart (Seamless)</option>
                    <option value="river_discharge_mean">Ortalama (Mean)</option>
                    <option value="river_discharge_median">Medyan (Median)</option>
                    <option value="river_discharge_max">Maksimum Senaryo</option>
                  </select>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Saatlik Örnekleme</label>
                  <select
                    value={glofasStepHours}
                    onChange={(e) => setGlofasStepHours(Number(e.target.value) as 1 | 3 | 6 | 24)}
                    className="w-full text-xs font-semibold text-slate-900 bg-transparent focus:outline-none font-mono"
                  >
                    <option value={1}>1 saat (PCHIP Pürüzsüz)</option>
                    <option value={3}>3 saat (PCHIP)</option>
                    <option value={6}>6 saat (PCHIP)</option>
                    <option value={24}>24 saat (Ham Günlük)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={handleFetchAndPreview}
                disabled={isFetching}
                className="px-5 py-2.5 bg-cyan-700 hover:bg-cyan-800 disabled:bg-slate-300 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                {isFetching ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    <span>GloFAS Verisi Çekiliyor...</span>
                  </>
                ) : (
                  <>
                    <span>Veriyi Getir ve Ön İzle</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 3. Fetch Error */}
          {fetchError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-rose-800">
              <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Veri Alınamadı</p>
                <p>{fetchError}</p>
              </div>
            </div>
          )}

          {/* 4. Interactive Preview & Validation Area */}
          {previewResult && (
            <div className="border border-slate-200 rounded-xl bg-slate-50/70 p-4 space-y-3">
              {/* Unboxed Metadata + Quantitative Summary */}
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-2.5">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{previewResult.sourceTitle}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{previewResult.subtitle}</p>
                </div>
                <div className="text-xs font-mono tabular-nums text-slate-700">
                  Pik: <strong className="text-slate-900">{previewResult.peakFlowM3s} m³/s</strong>
                  <span className="mx-2 text-slate-300">·</span>
                  Hacim: <strong className="text-slate-900">{formatVolume(previewResult.totalVolumeM3)}</strong>
                  <span className="mx-2 text-slate-300">·</span>
                  Süre: <strong className="text-slate-900">{previewResult.durationHours} sa</strong>
                  <span className="mx-2 text-slate-300">·</span>
                  <span>{previewResult.points.length} nokta</span>
                </div>
              </div>

              {/* Warnings (non-blocking) */}
              {previewResult.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900 space-y-0.5">
                  {previewResult.warnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </div>
              )}

              {/* Crosshair Readout Bar */}
              <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-600 min-h-[20px]">
                {hoverIdx !== null && previewResult.points[hoverIdx] ? (
                  <div>
                    <span>Saat {previewResult.points[hoverIdx].time}</span>
                    {previewResult.points[hoverIdx].timestamp && (
                      <>
                        <span className="mx-2 text-slate-300">·</span>
                        <span>{previewResult.points[hoverIdx].timestamp}</span>
                      </>
                    )}
                    <span className="mx-2 text-slate-300">·</span>
                    <strong className="text-cyan-800">{previewResult.points[hoverIdx].flow.toFixed(2)} m³/s</strong>
                  </div>
                ) : (
                  <span className="text-slate-400">
                    Saatlik değerleri incelemek için grafik üzerinde gezininiz.
                  </span>
                )}
                {previewResult.meta.startIso && previewResult.meta.endIso && (
                  <span className="text-slate-500 hidden sm:inline">
                    {previewResult.meta.startIso} → {previewResult.meta.endIso}
                  </span>
                )}
              </div>

              {/* Lab SVG Preview Chart */}
              <div className="w-full h-56 bg-white border border-slate-200 rounded-xl p-2">
                <svg
                  ref={svgRef}
                  viewBox="0 0 760 220"
                  preserveAspectRatio="none"
                  onMouseMove={handleSvgMouseMove}
                  onMouseLeave={() => setHoverIdx(null)}
                  className="w-full h-full cursor-crosshair"
                >
                  {(() => {
                    const pts = previewResult.points;
                    const maxT = Math.max(...pts.map((p) => p.time), 1);
                    const maxQ = Math.max(...pts.map((p) => p.flow), 1);
                    const mapX = (t: number) => 60 + (t / maxT) * 640;
                    const mapY = (q: number) => 192 - (q / maxQ) * 140;

                    const lineStr = pts.map((p) => `${mapX(p.time)},${mapY(p.flow)}`).join(' ');
                    const areaStr = `60,192 ${lineStr} ${mapX(pts[pts.length - 1].time)},192`;

                    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => ({
                      val: maxQ * r,
                      y: mapY(maxQ * r),
                    }));
                    const xTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => ({
                      val: maxT * r,
                      x: mapX(maxT * r),
                    }));

                    return (
                      <>
                        {yTicks.map((tk, i) => (
                          <g key={`py-${i}`}>
                            <line x1="60" y1={tk.y} x2="700" y2={tk.y} stroke="#E2E8F0" strokeDasharray="3 3" />
                            <text x="53" y={tk.y + 3} fontSize="9.5" textAnchor="end" fill="#64748B" fontFamily="monospace">
                              {tk.val >= 100 ? tk.val.toFixed(0) : tk.val.toFixed(1)}
                            </text>
                          </g>
                        ))}

                        {/* Axes */}
                        <line x1="60" y1="192" x2="700" y2="192" stroke="#94A3B8" strokeWidth="1" />
                        <line x1="60" y1="20" x2="60" y2="192" stroke="#94A3B8" strokeWidth="1" />

                        {xTicks.map((tk, i) => (
                          <text key={`px-${i}`} x={tk.x} y="209" fontSize="9.5" textAnchor="middle" fill="#64748B" fontFamily="monospace">
                            {tk.val.toFixed(0)}s
                          </text>
                        ))}

                        <text x="14" y="108" fontSize="9" fill="#475569" fontFamily="monospace" transform="rotate(-90 14 108)" textAnchor="middle">
                          Q (m³/s)
                        </text>

                        {/* Flow Area & Curve */}
                        <polygon points={areaStr} fill="#0284C7" fillOpacity="0.14" />
                        <polyline
                          points={lineStr}
                          fill="none"
                          stroke="#0284C7"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        {/* Hover Crosshair */}
                        {hoverIdx !== null && pts[hoverIdx] && (
                          <g>
                            <line
                              x1={mapX(pts[hoverIdx].time)}
                              y1="20"
                              x2={mapX(pts[hoverIdx].time)}
                              y2="192"
                              stroke="#0F172A"
                              strokeWidth="1"
                              strokeDasharray="3 3"
                            />
                            <circle
                              cx={mapX(pts[hoverIdx].time)}
                              cy={mapY(pts[hoverIdx].flow)}
                              r="4.5"
                              fill="#0284C7"
                              stroke="#FFFFFF"
                              strokeWidth="2"
                            />
                          </g>
                        )}
                      </>
                    );
                  })()}
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <span className="text-xs text-slate-500">
            {previewResult
              ? 'Aktarım mevcut tablodaki saat-debi satırlarını günceller.'
              : 'Ön izleme sonrasında veriyi saatlik tabloya aktarabilirsiniz.'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={handleConfirmTransfer}
              disabled={!previewResult || previewResult.points.length < 2}
              className="px-4 py-2 bg-cyan-700 hover:bg-cyan-800 disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Check size={14} />
              <span>Saatlik Hidrograf Tablosuna Aktar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HydrographSourceModal;
