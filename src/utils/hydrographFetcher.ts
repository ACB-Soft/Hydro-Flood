/**
 * Automated Hydrograph Data Acquisition Engine
 * Supports Open-Meteo Flood API (Copernicus GloFAS v4) - Global river discharge (m3/s)
 */

export type HydrographSourceType = 'glofas';
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

export interface HydrographPreviewResult {
  source: HydrographSourceType;
  sourceTitle: string;
  subtitle: string;
  lat: number;
  lon: number;
  points: HydrographTimePoint[];
  peakFlowM3s: number;
  minFlowM3s: number;
  totalVolumeM3: number;
  durationHours: number;
  warnings: string[];
  meta: {
    startIso?: string;
    endIso?: string;
  };
}

export interface ParsedKMLPointResult {
  lat: number;
  lon: number;
  elevation?: number;
  label: string;
  warning?: string;
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
  const safeForecast = Math.max(1, Math.min(90, Math.round(forecastDays)));

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
    warnings.push(
      'Bu ~5 km GloFAS hücresinde debi çok düşük görünüyor. Noktayı ana akarsu yatağı üzerine kaydırmayı veya Topluluk Maksimumu istatistiğini seçmeyi deneyebilirsiniz.'
    );
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

