/**
 * Automated Hydrograph Data Acquisition & SCS-CN Rainfall-Runoff Engine
 * Supports:
 * 1. Open-Meteo Flood API (Copernicus GloFAS v4) - Global river discharge (m3/s)
 * 2. Open-Meteo Forecast Weather API + NRCS SCS-CN Unit Hydrograph - Hourly rainfall-runoff
 * 3. USGS Water Services (NWIS Instantaneous Values & bBox site discovery) - Real-time US gauges
 */

export type HydrographSourceType = 'glofas' | 'scs_rain' | 'usgs';
export type GloFASMetric =
  | 'river_discharge'
  | 'river_discharge_mean'
  | 'river_discharge_median'
  | 'river_discharge_max';

export interface HydrographTimePoint {
  time: number; // Hours from t = 0
  flow: number; // m3/s
  timestamp?: string;
}

export interface RainfallBarPoint {
  time: number; // Hour offset
  precipMm: number;
  excessMm: number;
  timestamp?: string;
}

export interface HydrographPreviewResult {
  source: HydrographSourceType;
  sourceTitle: string;
  subtitle: string;
  lat: number;
  lon: number;
  points: HydrographTimePoint[];
  rainfallBars?: RainfallBarPoint[];
  peakFlowM3s: number;
  minFlowM3s: number;
  totalVolumeM3: number;
  durationHours: number;
  warnings: string[];
  meta: {
    startIso?: string;
    endIso?: string;
    stationCode?: string;
    stationName?: string;
    totalPrecipMm?: number;
    effectiveRunoffMm?: number;
    retentionSMm?: number;
    initialAbstractionMm?: number;
    tpHours?: number;
  };
}

export interface USGSSiteCandidate {
  siteCode: string;
  siteName: string;
  lat: number;
  lon: number;
  distanceKm: number;
  latestFlowM3s: number | null;
  latestTimestamp?: string;
}

export interface ParsedKMLPointResult {
  lat: number;
  lon: number;
  elevation?: number;
  label: string;
  warning?: string;
}

const CFS_TO_M3S = 0.028316846592;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseKmlCoordTuple(rawText: string): { lat: number; lon: number; elevation?: number } | null {
  const tokens = rawText.trim().split(/\s+/);
  for (const token of tokens) {
    if (!token) continue;
    const parts = token.split(',').map((s) => Number(s.trim()));
    if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      const lon = parts[0];
      const lat = parts[1];
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        return {
          lat,
          lon,
          elevation: parts.length >= 3 && Number.isFinite(parts[2]) ? parts[2] : undefined,
        };
      }
    }
  }
  return null;
}

/**
 * Parses a KML file and extracts a point coordinate (prefers <Point><coordinates>, falls back to first coordinate).
 */
export async function parseHydrographPointKML(file: File): Promise<ParsedKMLPointResult> {
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');

  const parseError = doc.getElementsByTagName('parsererror');
  if (parseError.length > 0) {
    throw new Error('KML dosyası XML olarak okunamadı. Lütfen geçerli bir .kml dosyası seçiniz.');
  }

  const placemarks = Array.from(doc.getElementsByTagName('Placemark'));
  for (const pm of placemarks) {
    const pointNodes = pm.getElementsByTagName('Point');
    if (pointNodes.length > 0) {
      const coordNode = pointNodes[0].getElementsByTagName('coordinates')[0];
      if (coordNode?.textContent) {
        const parsed = parseKmlCoordTuple(coordNode.textContent);
        if (parsed) {
          const nameNode = pm.getElementsByTagName('name')[0];
          const label = nameNode?.textContent?.trim() || file.name.replace(/\.kml$/i, '');
          return { ...parsed, label };
        }
      }
    }
  }

  const allPoints = Array.from(doc.getElementsByTagName('Point'));
  for (const pt of allPoints) {
    const coordNode = pt.getElementsByTagName('coordinates')[0];
    if (coordNode?.textContent) {
      const parsed = parseKmlCoordTuple(coordNode.textContent);
      if (parsed) {
        return { ...parsed, label: file.name.replace(/\.kml$/i, '') };
      }
    }
  }

  const fallbackCoords = Array.from(doc.getElementsByTagName('coordinates'));
  for (const node of fallbackCoords) {
    if (node.textContent) {
      const parsed = parseKmlCoordTuple(node.textContent);
      if (parsed) {
        return {
          ...parsed,
          label: file.name.replace(/\.kml$/i, ''),
          warning: 'KML dosyasında doğrudan Nokta (Point) etiketi bulunamadı; ilk geometri koordinatı kullanıldı.',
        };
      }
    }
  }

  throw new Error('KML dosyasında geçerli WGS84 koordinat bilgisi bulunamadı.');
}

/**
 * Computes trapezoidal hydrograph volume (m3) and peak/min flow summaries.
 */
function summarizeSeries(points: HydrographTimePoint[]) {
  if (points.length === 0) {
    return { peakFlowM3s: 0, minFlowM3s: 0, totalVolumeM3: 0, durationHours: 0 };
  }
  const sorted = [...points].sort((a, b) => a.time - b.time);
  let peak = -Infinity;
  let min = Infinity;
  let volumeM3 = 0;

  for (let i = 0; i < sorted.length; i++) {
    const q = sorted[i].flow;
    if (q > peak) peak = q;
    if (q < min) min = q;
    if (i > 0) {
      const dtSec = Math.max(0, sorted[i].time - sorted[i - 1].time) * 3600;
      volumeM3 += 0.5 * (sorted[i].flow + sorted[i - 1].flow) * dtSec;
    }
  }

  return {
    peakFlowM3s: Number(peak.toFixed(2)),
    minFlowM3s: Number(min.toFixed(2)),
    totalVolumeM3: Math.round(volumeM3),
    durationHours: Number((sorted[sorted.length - 1].time - sorted[0].time).toFixed(2)),
  };
}

/**
 * Fritsch-Carlson Monotone Piecewise Cubic Hermite Interpolation (PCHIP).
 * Smooths daily discharge into hourly steps without negative undershoot or Runge ringing.
 */
function pchipEvaluate(xs: number[], ys: number[], queryXs: number[]): number[] {
  const n = xs.length;
  if (n === 0) return [];
  if (n === 1) return queryXs.map(() => Math.max(0, ys[0]));
  if (n === 2) {
    const slope = (ys[1] - ys[0]) / Math.max(1e-9, xs[1] - xs[0]);
    return queryXs.map((x) => Math.max(0, ys[0] + slope * (x - xs[0])));
  }

  const h: number[] = new Array(n - 1);
  const delta: number[] = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    h[i] = Math.max(1e-9, xs[i + 1] - xs[i]);
    delta[i] = (ys[i + 1] - ys[i]) / h[i];
  }

  const d: number[] = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] * delta[i] > 0) {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      d[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
    } else {
      d[i] = 0;
    }
  }

  const endSlope = (h0: number, h1: number, d0: number, d1: number) => {
    let val = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (Math.sign(val) !== Math.sign(d0)) val = 0;
    else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(val) > Math.abs(3 * d0)) val = 3 * d0;
    return val;
  };
  d[0] = endSlope(h[0], h[1], delta[0], delta[1]);
  d[n - 1] = endSlope(h[n - 2], h[n - 3], delta[n - 2], delta[n - 3]);

  return queryXs.map((x) => {
    if (x <= xs[0]) return Math.max(0, ys[0]);
    if (x >= xs[n - 1]) return Math.max(0, ys[n - 1]);

    let idx = 0;
    for (let i = 0; i < n - 1; i++) {
      if (x >= xs[i] && x <= xs[i + 1]) {
        idx = i;
        break;
      }
    }

    const t = (x - xs[idx]) / h[idx];
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    const y = h00 * ys[idx] + h10 * h[idx] * d[idx] + h01 * ys[idx + 1] + h11 * h[idx] * d[idx + 1];
    return Math.max(0, Number(y.toFixed(2)));
  });
}

/**
 * Fetches Copernicus GloFAS daily discharge via Open-Meteo Flood API and samples it to hourly steps.
 */
export async function fetchGloFASDischarge(params: {
  lat: number;
  lon: number;
  pastDays: number;
  forecastDays: number;
  metric: GloFASMetric;
  stepHours: 1 | 3 | 6 | 24;
  peakWindowOnly?: boolean;
}): Promise<HydrographPreviewResult> {
  const { lat, lon, pastDays, forecastDays, metric, stepHours, peakWindowOnly = false } = params;
  const safePast = Math.max(0, Math.min(92, Math.round(pastDays)));
  const safeForecast = Math.max(1, Math.min(210, Math.round(forecastDays)));

  const url =
    `https://flood-api.open-meteo.com/v1/flood` +
    `?latitude=${lat.toFixed(5)}&longitude=${lon.toFixed(5)}` +
    `&daily=river_discharge,river_discharge_mean,river_discharge_median,river_discharge_max` +
    `&past_days=${safePast}&forecast_days=${safeForecast}`;

  const res = await fetch(url);
  if (!res.ok) {
    let detail = '';
    try {
      const errJson = await res.json();
      detail = errJson?.reason || '';
    } catch {
      // ignore json parse fallback
    }
    throw new Error(detail ? `GloFAS API hatası: ${detail}` : `GloFAS API yanıt vermedi (HTTP ${res.status}).`);
  }

  const json = await res.json();
  const times: string[] = json?.daily?.time || [];
  const rawSeries: Array<number | null> = json?.daily?.[metric] || json?.daily?.river_discharge || [];

  const validDays: { timeStr: string; flow: number }[] = [];
  for (let i = 0; i < times.length; i++) {
    const v = rawSeries[i];
    if (typeof v === 'number' && Number.isFinite(v)) {
      validDays.push({ timeStr: times[i], flow: Math.max(0, v) });
    }
  }

  if (validDays.length < 2) {
    throw new Error(
      'Seçili koordinat için GloFAS nehir hücresinde geçerli debi verisi bulunamadı (nokta deniz/okyanus veya akarsu dışı alan olabilir).'
    );
  }

  let workingDays = validDays;
  const warnings: string[] = [];

  if (peakWindowOnly && validDays.length > 7) {
    let peakIdx = 0;
    for (let i = 1; i < validDays.length; i++) {
      if (validDays[i].flow > validDays[peakIdx].flow) peakIdx = i;
    }
    const startIdx = Math.max(0, peakIdx - 3);
    const endIdx = Math.min(validDays.length, peakIdx + 4);
    workingDays = validDays.slice(startIdx, endIdx);
    warnings.push(
      `Pik taşkın dalgası odaklı ±3 günlük pencere (${workingDays[0].timeStr} – ${workingDays[workingDays.length - 1].timeStr}) seçildi.`
    );
  }

  const dailyHours = workingDays.map((_, idx) => idx * 24);
  const dailyFlows = workingDays.map((d) => d.flow);
  const totalHours = (workingDays.length - 1) * 24;

  const queryHours: number[] = [];
  for (let h = 0; h <= totalHours; h += stepHours) {
    queryHours.push(h);
  }

  const sampledFlows =
    stepHours === 24 ? dailyFlows.map((v) => Number(v.toFixed(2))) : pchipEvaluate(dailyHours, dailyFlows, queryHours);

  const startDateMs = Date.parse(`${workingDays[0].timeStr}T00:00:00Z`);
  const points: HydrographTimePoint[] = queryHours.map((hr, idx) => ({
    time: hr,
    flow: sampledFlows[idx],
    timestamp: Number.isFinite(startDateMs)
      ? new Date(startDateMs + hr * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ')
      : undefined,
  }));

  const stats = summarizeSeries(points);
  if (stats.peakFlowM3s < 0.05) {
    warnings.push('Bu 5 km GloFAS hücresinde debi neredeyse sıfır görünüyor. Küçük dere havzası için Yağış-Akış (SCS-CN) sekmesini deneyin.');
  }

  const metricNames: Record<GloFASMetric, string> = {
    river_discharge: 'Standart Debi',
    river_discharge_mean: 'Topluluk Ortalaması',
    river_discharge_median: 'Topluluk Medyanı',
    river_discharge_max: 'Topluluk Maksimumu',
  };

  return {
    source: 'glofas',
    sourceTitle: `GloFAS v4 · ${metricNames[metric]}`,
    subtitle: `Koordinat (${Number(json.latitude ?? lat).toFixed(3)}, ${Number(json.longitude ?? lon).toFixed(3)}) · ~5 km nehir hücresi`,
    lat,
    lon,
    points,
    ...stats,
    warnings,
    meta: {
      startIso: workingDays[0].timeStr,
      endIso: workingDays[workingDays.length - 1].timeStr,
    },
  };
}

/**
 * Official NRCS/SCS Dimensionless Curvilinear Unit Hydrograph table (t/Tp vs q/qp)
 */
const SCS_DIMLESS_RATIOS: Array<[number, number]> = [
  [0.0, 0.0],
  [0.1, 0.03],
  [0.2, 0.1],
  [0.3, 0.19],
  [0.4, 0.31],
  [0.5, 0.47],
  [0.6, 0.66],
  [0.7, 0.82],
  [0.8, 0.93],
  [0.9, 0.99],
  [1.0, 1.0],
  [1.1, 0.99],
  [1.2, 0.93],
  [1.3, 0.86],
  [1.4, 0.78],
  [1.5, 0.68],
  [1.6, 0.56],
  [1.7, 0.46],
  [1.8, 0.39],
  [1.9, 0.33],
  [2.0, 0.28],
  [2.2, 0.207],
  [2.4, 0.147],
  [2.6, 0.107],
  [2.8, 0.077],
  [3.0, 0.055],
  [3.2, 0.04],
  [3.4, 0.029],
  [3.6, 0.021],
  [3.8, 0.015],
  [4.0, 0.011],
  [4.5, 0.005],
  [5.0, 0.0],
];

function interpolateScsDimless(ratioT: number): number {
  if (ratioT <= 0 || ratioT >= 5.0) return 0;
  for (let i = 0; i < SCS_DIMLESS_RATIOS.length - 1; i++) {
    const [t0, q0] = SCS_DIMLESS_RATIOS[i];
    const [t1, q1] = SCS_DIMLESS_RATIOS[i + 1];
    if (ratioT >= t0 && ratioT <= t1) {
      const f = (ratioT - t0) / (t1 - t0);
      return q0 + f * (q1 - q0);
    }
  }
  return 0;
}

/**
 * Fetches hourly precipitation from Open-Meteo Forecast API and converts it
 * into an hourly flood hydrograph via NRCS SCS-CN abstraction & unit hydrograph convolution.
 */
export async function fetchOpenMeteoPrecipitationAndComputeSCS(params: {
  lat: number;
  lon: number;
  pastDays: number;
  forecastDays: number;
  basinAreaKm2: number;
  curveNumber: number;
  tcHours: number;
  baseFlowM3s: number;
}): Promise<HydrographPreviewResult> {
  const { lat, lon, pastDays, forecastDays, basinAreaKm2, curveNumber, tcHours, baseFlowM3s } = params;
  const safePast = Math.max(0, Math.min(92, Math.round(pastDays)));
  const safeForecast = Math.max(1, Math.min(16, Math.round(forecastDays)));
  const safeArea = Math.max(0.05, basinAreaKm2);
  const safeCN = Math.max(30, Math.min(98, curveNumber));
  const safeTc = Math.max(0.25, tcHours);
  const safeBase = Math.max(0, baseFlowM3s);

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat.toFixed(5)}&longitude=${lon.toFixed(5)}` +
    `&hourly=precipitation` +
    `&past_days=${safePast}&forecast_days=${safeForecast}&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) {
    let detail = '';
    try {
      const errJson = await res.json();
      detail = errJson?.reason || '';
    } catch {
      // ignore
    }
    throw new Error(detail ? `Open-Meteo Yağış API hatası: ${detail}` : `Yağış API yanıt vermedi (HTTP ${res.status}).`);
  }

  const json = await res.json();
  const times: string[] = json?.hourly?.time || [];
  const precipRaw: Array<number | null> = json?.hourly?.precipitation || [];

  if (times.length < 2) {
    throw new Error('Seçili konum için saatlik yağış zaman serisi alınamadı.');
  }

  const precip = precipRaw.map((p) => (typeof p === 'number' && Number.isFinite(p) ? Math.max(0, p) : 0));

  // 1. SCS-CN Cumulative Effective Runoff
  const S = (25400 / safeCN) - 254; // mm
  const Ia = 0.2 * S; // mm

  let cumP = 0;
  let prevPe = 0;
  const excessRain: number[] = new Array(precip.length).fill(0);
  const rainfallBars: RainfallBarPoint[] = [];

  for (let i = 0; i < precip.length; i++) {
    cumP += precip[i];
    const cumPe = cumP > Ia ? Math.pow(cumP - Ia, 2) / (cumP - Ia + S) : 0;
    const dPe = Math.max(0, cumPe - prevPe);
    prevPe = cumPe;
    excessRain[i] = dPe;
    rainfallBars.push({
      time: i,
      precipMm: Number(precip[i].toFixed(2)),
      excessMm: Number(dPe.toFixed(2)),
      timestamp: times[i]?.replace('T', ' '),
    });
  }

  // 2. 1-hour SCS Dimensionless Unit Hydrograph normalized for exact mass conservation
  const dt = 1; // 1 hour step
  const tLag = 0.6 * safeTc;
  const tp = dt / 2 + tLag;
  const qp = (0.208 * safeArea) / tp; // m3/s per mm effective rain

  const uhDurationHours = Math.max(3, Math.ceil(5.0 * tp));
  const uh: number[] = [];
  for (let k = 0; k <= uhDurationHours; k++) {
    uh.push(qp * interpolateScsDimless(k / tp));
  }

  // Normalize UH sum so SUM(uh) * 3600s == 1000 * A (m3 per 1 mm over A km2)
  const rawUhSum = uh.reduce((acc, v) => acc + v, 0);
  const targetUhSum = (1000 * safeArea) / 3600;
  const normFactor = rawUhSum > 1e-9 ? targetUhSum / rawUhSum : 1;
  const normUh = uh.map((v) => v * normFactor);

  // 3. Discrete convolution including storm recession tail
  const tailHours = Math.min(24, Math.ceil(3 * tp));
  const totalOutHours = precip.length + tailHours;
  const directRunoff = new Array(totalOutHours).fill(0);

  for (let t = 0; t < excessRain.length; t++) {
    const pe = excessRain[t];
    if (pe <= 0) continue;
    for (let k = 0; k < normUh.length; k++) {
      const idx = t + k;
      if (idx < totalOutHours) {
        directRunoff[idx] += pe * normUh[k];
      }
    }
  }

  const startMs = Date.parse(times[0]);
  const points: HydrographTimePoint[] = directRunoff.map((qd, hr) => ({
    time: hr,
    flow: Number((safeBase + qd).toFixed(2)),
    timestamp:
      times[hr]?.replace('T', ' ') ||
      (Number.isFinite(startMs) ? new Date(startMs + hr * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ') : undefined),
  }));

  const stats = summarizeSeries(points);
  const totalPrecipMm = Number(cumP.toFixed(1));
  const effectiveRunoffMm = Number(prevPe.toFixed(1));

  const warnings: string[] = [];
  if (totalPrecipMm === 0) {
    warnings.push('Seçili tarih penceresinde bölgede hiç yağış saptanmadı (0.0 mm). Sadece taban akışı gösteriliyor.');
  } else if (effectiveRunoffMm < 0.05) {
    warnings.push(
      `Toplam ${totalPrecipMm} mm yağış, SCS başlangıç kaybı eşiğinin (Ia = ${Ia.toFixed(1)} mm) altında kaldığı için yüzeysel akış oluşmadı. Geçmiş gün sayısını veya CN değerini artırabilirsiniz.`
    );
  }

  return {
    source: 'scs_rain',
    sourceTitle: `SCS-CN Yağış-Akış (${safeArea} km² · CN=${safeCN})`,
    subtitle: `Saatlik Yağış (Open-Meteo) · Tp=${tp.toFixed(2)} sa · Taban Q=${safeBase} m³/s`,
    lat,
    lon,
    points,
    rainfallBars,
    ...stats,
    warnings,
    meta: {
      startIso: times[0]?.replace('T', ' '),
      endIso: times[times.length - 1]?.replace('T', ' '),
      totalPrecipMm,
      effectiveRunoffMm,
      retentionSMm: Number(S.toFixed(1)),
      initialAbstractionMm: Number(Ia.toFixed(1)),
      tpHours: Number(tp.toFixed(2)),
    },
  };
}

/**
 * Discovers active USGS stream gauges within a bounding box around (lat, lon) measuring discharge (00060).
 */
export async function discoverUSGSStationsNearPoint(
  lat: number,
  lon: number,
  radiusDeg = 0.35
): Promise<USGSSiteCandidate[]> {
  const safeRadius = Math.max(0.05, Math.min(2.0, radiusDeg));
  const west = Math.max(-180, lon - safeRadius).toFixed(4);
  const south = Math.max(-90, lat - safeRadius).toFixed(4);
  const east = Math.min(180, lon + safeRadius).toFixed(4);
  const north = Math.min(90, lat + safeRadius).toFixed(4);

  const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&bBox=${west},${south},${east},${north}&parameterCd=00060`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`USGS istasyon araması başarısız oldu (HTTP ${res.status}).`);
  }

  const json = await res.json();
  const timeSeries: any[] = json?.value?.timeSeries || [];
  const seenSites = new Set<string>();
  const candidates: USGSSiteCandidate[] = [];

  for (const ts of timeSeries) {
    const info = ts?.sourceInfo;
    const siteCode = info?.siteCode?.[0]?.value;
    if (!siteCode || seenSites.has(siteCode)) continue;
    seenSites.add(siteCode);

    const sLat = Number(info?.geoLocation?.geogLocation?.latitude);
    const sLon = Number(info?.geoLocation?.geogLocation?.longitude);
    if (!Number.isFinite(sLat) || !Number.isFinite(sLon)) continue;

    const rawVals: any[] = ts?.values?.[0]?.value || [];
    const lastEntry = rawVals[rawVals.length - 1];
    const lastCfs = lastEntry ? Number(lastEntry.value) : NaN;
    const latestFlowM3s =
      Number.isFinite(lastCfs) && lastCfs >= 0 ? Number((lastCfs * CFS_TO_M3S).toFixed(2)) : null;

    candidates.push({
      siteCode,
      siteName: info?.siteName || `USGS ${siteCode}`,
      lat: sLat,
      lon: sLon,
      distanceKm: Number(haversineKm(lat, lon, sLat, sLon).toFixed(1)),
      latestFlowM3s,
      latestTimestamp: lastEntry?.dateTime,
    });
  }

  candidates.sort((a, b) => a.distanceKm - b.distanceKm);
  return candidates.slice(0, 15);
}

/**
 * Fetches 15-min instantaneous discharge from a specific USGS gauge and resamples to hourly steps (m3/s).
 */
export async function fetchUSGSDischarge(params: {
  siteCode: string;
  period: 'P1D' | 'P3D' | 'P7D' | 'P14D';
  stepHours: 0.5 | 1 | 3;
}): Promise<HydrographPreviewResult> {
  const cleanCode = params.siteCode.trim();
  if (!cleanCode) {
    throw new Error('Lütfen geçerli bir USGS İstasyon Kodu giriniz.');
  }

  const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${encodeURIComponent(
    cleanCode
  )}&parameterCd=00060&period=${params.period}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`USGS verisi alınamadı (HTTP ${res.status}). İstasyon kodunu kontrol ediniz.`);
  }

  const json = await res.json();
  const ts = json?.value?.timeSeries?.[0];
  if (!ts) {
    throw new Error(`USGS istasyonu (${cleanCode}) için debi (00060) zaman serisi bulunamadı.`);
  }

  const siteName: string = ts?.sourceInfo?.siteName || `USGS ${cleanCode}`;
  const lat = Number(ts?.sourceInfo?.geoLocation?.geogLocation?.latitude) || 0;
  const lon = Number(ts?.sourceInfo?.geoLocation?.geogLocation?.longitude) || 0;

  const rawPoints: Array<{ ms: number; flow: number; iso: string }> = [];
  for (const item of ts?.values?.[0]?.value || []) {
    const valCfs = Number(item?.value);
    const ms = Date.parse(item?.dateTime);
    // USGS sentinel values like -999999 indicate Ice/Eqp failure
    if (Number.isFinite(valCfs) && valCfs >= 0 && Number.isFinite(ms)) {
      rawPoints.push({
        ms,
        flow: valCfs * CFS_TO_M3S,
        iso: String(item.dateTime),
      });
    }
  }

  if (rawPoints.length < 2) {
    throw new Error(`USGS istasyonu (${cleanCode}) son dönemde geçerli debi ölçümü yayınlamadı.`);
  }

  rawPoints.sort((a, b) => a.ms - b.ms);
  const startMs = rawPoints[0].ms;
  const totalHours = (rawPoints[rawPoints.length - 1].ms - startMs) / 3600000;

  const step = params.stepHours;
  const points: HydrographTimePoint[] = [];

  for (let hr = 0; hr <= totalHours + 1e-6; hr += step) {
    const targetMs = startMs + hr * 3600000;
    // Linear interpolation between surrounding 15-min measurements
    let flow = rawPoints[rawPoints.length - 1].flow;
    if (targetMs <= rawPoints[0].ms) {
      flow = rawPoints[0].flow;
    } else {
      for (let i = 0; i < rawPoints.length - 1; i++) {
        if (targetMs >= rawPoints[i].ms && targetMs <= rawPoints[i + 1].ms) {
          const span = Math.max(1, rawPoints[i + 1].ms - rawPoints[i].ms);
          const f = (targetMs - rawPoints[i].ms) / span;
          flow = rawPoints[i].flow + f * (rawPoints[i + 1].flow - rawPoints[i].flow);
          break;
        }
      }
    }
    points.push({
      time: Number(hr.toFixed(2)),
      flow: Number(flow.toFixed(2)),
      timestamp: new Date(targetMs).toISOString().slice(0, 16).replace('T', ' '),
    });
  }

  const stats = summarizeSeries(points);
  return {
    source: 'usgs',
    sourceTitle: `USGS ${cleanCode} · ${siteName}`,
    subtitle: `Gerçek zamanlı 15 dk ölçüm · ${step} sa adımlı m³/s dönüşümü`,
    lat,
    lon,
    points,
    ...stats,
    warnings: [],
    meta: {
      stationCode: cleanCode,
      stationName: siteName,
      startIso: rawPoints[0].iso.slice(0, 16).replace('T', ' '),
      endIso: rawPoints[rawPoints.length - 1].iso.slice(0, 16).replace('T', ' '),
    },
  };
}
