import * as turf from '@turf/turf';
import * as GeoTIFF from 'geotiff';
import proj4 from 'proj4';
import { Feature, LineString } from 'geojson';

export interface ProfilePoint {
  x: number;
  z: number;
  type: 'LOB' | 'MAIN' | 'ROB';
}

export interface CrossSection {
  station: number;
  profile: ProfilePoint[];
  centerCoord?: [number, number]; // [lat, lon]
  cutLine?: [[number, number], [number, number]]; // [[latLeft, lonLeft], [latRight, lonRight]]
  minElevation: number;
  maxElevation: number;
  bankLeftX: number;
  bankRightX: number;
  angleAdjustment?: number; // deg rotasyon sapması (örn: -7°, +9°)
  isTrimmed?: boolean;      // kesişmeyi önlemek için boyu güvenle kısaltıldı mı?
  isIntersecting?: boolean; // hâlâ komşu bir kesitle kesişiyor mu?
}

export interface RoutingResult {
  station: number;
  waterElevation: number;
  maxDepth: number;
  area: number;
  velocity: number;
  wettedPerimeter: number;
  topWidth: number;
  froudeNumber: number;
  isOverbank: boolean;
  energyElevation: number;
  bedElevation: number;
  waterLeftX: number;
  waterRightX: number;
  overbankAreaLOB: number;
  overbankAreaROB: number;
  bankLeftZ: number;
  bankRightZ: number;
  structureEffect?: {
    structureName: string;
    flowState: 'free' | 'pressure' | 'overtopping';
    backwaterRise: number;
  };
}

export type StructureType = 'bridge' | 'box_culvert' | 'pipe_culvert';

export interface HydraulicStructure {
  id: string;
  name: string;
  type: StructureType;
  station: number; // m
  coordinates?: [number, number]; // [lat, lon]
  roadElevation: number; // High chord (m)
  lowChordElevation: number; // Low chord (m)
  invertElevation: number; // Bed invert (m)
  openingWidth: number; // Net span width (m)
  openingHeight?: number; // Height for culverts (m)
  barrelCount: number; // Number of spans/barrels
  pierCount: number; // Bridge piers
  pierWidth: number; // Pier thickness (m)
  orificeCoefficient: number; // Cd (e.g. 0.8)
  weirCoefficient: number; // Cw (e.g. 1.7)
  isActive: boolean;
}

export interface StructureHydraulicResult {
  structure: HydraulicStructure;
  station: number;
  flowState: 'free' | 'pressure' | 'overtopping';
  upstreamWSE: number;
  downstreamWSE: number;
  backwaterRise: number;
  freeboard: number;
  isOvertopped: boolean;
  weirDischarge: number;
  culvertDischarge: number;
  throughVelocity: number;
}

export async function parseKML(file: File): Promise<Feature<LineString>> {
  const text = await file.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'text/xml');
  const coordinatesNode = xml.getElementsByTagName('coordinates')[0];
  
  if (!coordinatesNode || !coordinatesNode.textContent) {
    throw new Error("KML dosyasında koordinat bulunamadı. Lütfen geçerli bir LineString içeren KML yükleyin.");
  }
  
  const coordsText = coordinatesNode.textContent.trim();
  const coordPairs = coordsText.split(/\s+/);
  const coords: number[][] = [];
  
  for (const pair of coordPairs) {
    const [lon, lat] = pair.split(',').map(Number);
    if (!isNaN(lon) && !isNaN(lat)) {
      coords.push([lon, lat]);
    }
  }
  
  if (coords.length < 2) {
    throw new Error("Geçerli bir aks (LineString) oluşturmak için yeterli koordinat yok.");
  }
  
  return turf.lineString(coords);
}

export interface BankLineItem {
  id: string;
  name: string;
  side: 'left' | 'right';
  coords: [number, number][]; // [lat, lon] Leaflet format
}

export interface BankLinesParseResult {
  leftBank?: BankLineItem;
  rightBank?: BankLineItem;
  allLines: BankLineItem[];
  totalPoints: number;
}

export async function parseKMLCoordinates(file: File): Promise<[number, number][]> {
  const text = await file.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'text/xml');
  const coordinatesNodes = Array.from(xml.getElementsByTagName('coordinates'));
  
  if (coordinatesNodes.length === 0) {
    return [];
  }
  
  const coords: [number, number][] = [];
  for (const node of coordinatesNodes) {
    if (!node.textContent) continue;
    const coordPairs = node.textContent.trim().split(/\s+/);
    for (const pair of coordPairs) {
      const [lon, lat] = pair.split(',').map(Number);
      if (!isNaN(lon) && !isNaN(lat)) {
        coords.push([lat, lon]);
      }
    }
  }
  return coords;
}

export async function parseKMLBankLines(
  file: File, 
  centerlineCoords?: [number, number][]
): Promise<BankLinesParseResult> {
  const text = await file.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'text/xml');
  
  // Extract lines from Placemarks to retain line names (e.g. 'Sol Kıyı', 'Sağ Kıyı', 'Left Bank', etc.)
  const placemarks = Array.from(xml.getElementsByTagName('Placemark'));
  const rawLines: { name: string; coords: [number, number][] }[] = [];

  if (placemarks.length > 0) {
    for (let i = 0; i < placemarks.length; i++) {
      const pm = placemarks[i];
      const nameNode = pm.getElementsByTagName('name')[0];
      const name = nameNode?.textContent?.trim() || `Kıyı Çizgisi ${i + 1}`;
      
      const coordNodes = Array.from(pm.getElementsByTagName('coordinates'));
      for (const cn of coordNodes) {
        if (!cn.textContent) continue;
        const coordPairs = cn.textContent.trim().split(/\s+/);
        const pts: [number, number][] = [];
        for (const pair of coordPairs) {
          const [lon, lat] = pair.split(',').map(Number);
          if (!isNaN(lat) && !isNaN(lon)) {
            pts.push([lat, lon]);
          }
        }
        if (pts.length >= 2) {
          rawLines.push({ name, coords: pts });
        }
      }
    }
  }

  // Fallback: If no placemarks yielded lines, search all <coordinates> elements directly
  if (rawLines.length === 0) {
    const allCoordNodes = Array.from(xml.getElementsByTagName('coordinates'));
    for (let i = 0; i < allCoordNodes.length; i++) {
      const cn = allCoordNodes[i];
      if (!cn.textContent) continue;
      const coordPairs = cn.textContent.trim().split(/\s+/);
      const pts: [number, number][] = [];
      for (const pair of coordPairs) {
        const [lon, lat] = pair.split(',').map(Number);
        if (!isNaN(lat) && !isNaN(lon)) {
          pts.push([lat, lon]);
        }
      }
      if (pts.length >= 2) {
        rawLines.push({ name: `Kıyı Çizgisi ${i + 1}`, coords: pts });
      }
    }
  }

  if (rawLines.length === 0) {
    throw new Error("KML dosyasında kıyı çizgisi (LineString koordinatları) bulunamadı.");
  }

  // Classify each line as 'left' or 'right'
  const classified: BankLineItem[] = [];
  let leftItem: BankLineItem | undefined;
  let rightItem: BankLineItem | undefined;

  // 1st Pass: Check name conventions (Turkish & English)
  for (let i = 0; i < rawLines.length; i++) {
    const r = rawLines[i];
    const lower = r.name.toLocaleLowerCase('tr-TR');
    
    if (/(sol|left|lob|\blb\b|sol_sahil|sol_kiyi)/i.test(lower) && !leftItem) {
      leftItem = { id: `bank_left_${i}`, name: r.name, side: 'left', coords: r.coords };
      classified.push(leftItem);
    } else if (/(sa[gğ]|right|rob|\brb\b|sag_sahil|sag_kiyi)/i.test(lower) && !rightItem) {
      rightItem = { id: `bank_right_${i}`, name: r.name, side: 'right', coords: r.coords };
      classified.push(rightItem);
    }
  }

  // 2nd Pass: Centerline cross-product lateral detection if not found by name
  const unassigned = rawLines.filter(r => !classified.some(c => c.coords === r.coords));
  if (unassigned.length > 0 && centerlineCoords && centerlineCoords.length >= 2) {
    const clLine = turf.lineString(centerlineCoords.map(([lat, lon]) => [lon, lat]));

    for (const r of unassigned) {
      if (leftItem && rightItem) break;
      let leftScore = 0;
      let rightScore = 0;
      const sampleIndices = [0, Math.floor(r.coords.length / 2), r.coords.length - 1];

      for (const idx of sampleIndices) {
        const pt = r.coords[idx];
        const turfPt = turf.point([pt[1], pt[0]]);
        const snapped = turf.nearestPointOnLine(clLine, turfPt);
        const snappedIndex = snapped.properties?.index || 0;
        const pA = centerlineCoords[snappedIndex];
        const pB = centerlineCoords[Math.min(centerlineCoords.length - 1, snappedIndex + 1)];
        if (pA && pB) {
          const dx = pB[1] - pA[1];
          const dy = pB[0] - pA[0];
          const px = pt[1] - pA[1];
          const py = pt[0] - pA[0];
          const crossProduct = dx * py - dy * px;
          if (crossProduct > 0) leftScore++;
          else if (crossProduct < 0) rightScore++;
        }
      }

      const side: 'left' | 'right' = leftScore >= rightScore ? 'left' : 'right';
      if (side === 'left' && !leftItem) {
        leftItem = { id: `bank_left_${classified.length}`, name: r.name || 'Sol Kıyı', side: 'left', coords: r.coords };
        classified.push(leftItem);
      } else if (side === 'right' && !rightItem) {
        rightItem = { id: `bank_right_${classified.length}`, name: r.name || 'Sağ Kıyı', side: 'right', coords: r.coords };
        classified.push(rightItem);
      } else if (!leftItem) {
        leftItem = { id: `bank_left_${classified.length}`, name: r.name || 'Sol Kıyı', side: 'left', coords: r.coords };
        classified.push(leftItem);
      } else if (!rightItem) {
        rightItem = { id: `bank_right_${classified.length}`, name: r.name || 'Sağ Kıyı', side: 'right', coords: r.coords };
        classified.push(rightItem);
      }
    }
  }

  // 3rd Pass: If still not assigned and we have multiple lines
  if (!leftItem && rawLines.length > 0) {
    leftItem = { id: 'bank_left_0', name: rawLines[0].name || 'Sol Kıyı', side: 'left', coords: rawLines[0].coords };
    classified.push(leftItem);
  }
  if (!rightItem && rawLines.length > 1) {
    const second = rawLines.find(r => r !== rawLines[0]) || rawLines[1];
    rightItem = { id: 'bank_right_1', name: second.name || 'Sağ Kıyı', side: 'right', coords: second.coords };
    classified.push(rightItem);
  }

  const allLines: BankLineItem[] = [
    ...(leftItem ? [leftItem] : []),
    ...(rightItem ? [rightItem] : [])
  ];

  const totalPoints = allLines.reduce((acc, l) => acc + l.coords.length, 0);

  return {
    leftBank: leftItem,
    rightBank: rightItem,
    allLines,
    totalPoints
  };
}

export function calibrateSectionsWithBankLines(
  sections: CrossSection[],
  leftBankCoords?: [number, number][],
  rightBankCoords?: [number, number][]
): CrossSection[] {
  if (sections.length === 0 || (!leftBankCoords && !rightBankCoords)) {
    return sections;
  }

  let leftGeo: Feature<LineString> | null = null;
  if (leftBankCoords && leftBankCoords.length >= 2) {
    leftGeo = turf.lineString(leftBankCoords.map(([lat, lon]) => [lon, lat]));
  }

  let rightGeo: Feature<LineString> | null = null;
  if (rightBankCoords && rightBankCoords.length >= 2) {
    rightGeo = turf.lineString(rightBankCoords.map(([lat, lon]) => [lon, lat]));
  }

  return sections.map(sec => {
    if (!sec.cutLine || !sec.profile || sec.profile.length < 2) return sec;
    const [ptL, ptR] = sec.cutLine; // [lat, lon]
    const cutGeo = turf.lineString([[ptL[1], ptL[0]], [ptR[1], ptR[0]]]);
    const cutStartPt = turf.point([ptL[1], ptL[0]]);

    const minX = sec.profile[0].x;
    const maxX = sec.profile[sec.profile.length - 1].x;
    const totalW = maxX - minX;

    let candidateLeftX = sec.bankLeftX;
    let candidateRightX = sec.bankRightX;

    if (leftGeo) {
      const intersectL = turf.lineIntersect(cutGeo, leftGeo);
      if (intersectL.features.length > 0) {
        // Pick intersection closest to the left side or valid station
        const distances = intersectL.features.map(f => turf.distance(cutStartPt, f, { units: 'meters' }));
        const validDist = distances.find(d => d >= minX + 1 && d <= maxX - 1) ?? distances[0];
        if (validDist > minX && validDist < maxX) {
          candidateLeftX = validDist;
        }
      }
    }

    if (rightGeo) {
      const intersectR = turf.lineIntersect(cutGeo, rightGeo);
      if (intersectR.features.length > 0) {
        const distances = intersectR.features.map(f => turf.distance(cutStartPt, f, { units: 'meters' }));
        const validDist = distances.find(d => d >= minX + 1 && d <= maxX - 1) ?? distances[0];
        if (validDist > minX && validDist < maxX) {
          candidateRightX = validDist;
        }
      }
    }

    // Ensure Left < Right ordering
    let finalBankLeftX = Math.min(candidateLeftX, candidateRightX);
    let finalBankRightX = Math.max(candidateLeftX, candidateRightX);

    // If both collided or identical, ensure minimum separation
    if (finalBankRightX - finalBankLeftX < 2) {
      finalBankLeftX = Math.max(minX + 1, finalBankLeftX - 2.5);
      finalBankRightX = Math.min(maxX - 1, finalBankRightX + 2.5);
    }

    // Bound within cross section limits
    finalBankLeftX = Math.max(minX + 0.5, Math.min(maxX - 2, finalBankLeftX));
    finalBankRightX = Math.max(finalBankLeftX + 1.5, Math.min(maxX - 0.5, finalBankRightX));

    // Re-assign profile point types (LOB, MAIN, ROB)
    const newProfile = sec.profile.map(p => {
      let type: 'LOB' | 'MAIN' | 'ROB' = 'MAIN';
      if (p.x < finalBankLeftX) type = 'LOB';
      else if (p.x > finalBankRightX) type = 'ROB';
      return { ...p, type };
    });

    return {
      ...sec,
      bankLeftX: Number(finalBankLeftX.toFixed(2)),
      bankRightX: Number(finalBankRightX.toFixed(2)),
      profile: newProfile
    };
  });
}

export function calculateDownstreamSlopeFromDEM(
  sections: CrossSection[]
): {
  slope: number;
  percent: number;
  method: string;
  deltaZ: number;
  reachLength: number;
  upstreamZ: number;
  downstreamZ: number;
} {
  if (sections.length < 2) {
    return {
      slope: 0.001,
      percent: 0.1,
      method: 'Varsayılan sabit eğim (kesit yetersiz)',
      deltaZ: 0,
      reachLength: 0,
      upstreamZ: 0,
      downstreamZ: 0
    };
  }

  const sStart = sections[0];
  const sEnd = sections[sections.length - 1];
  const totalDist = Math.abs(sEnd.station - sStart.station);
  
  // Check elevation trend to determine downstream end
  const startIsUpstream = sStart.minElevation >= sEnd.minElevation;
  const dsEndSec = startIsUpstream ? sEnd : sStart;
  
  // Target downstream reach length: last 150m - 800m or 25% of river reach
  const targetDsLength = Math.max(150, Math.min(800, totalDist * 0.25));
  
  let dsStartSec = dsEndSec;
  if (startIsUpstream) {
    for (let i = sections.length - 2; i >= 0; i--) {
      const d = Math.abs(sections[i].station - dsEndSec.station);
      dsStartSec = sections[i];
      if (d >= targetDsLength) break;
    }
  } else {
    for (let i = 1; i < sections.length; i++) {
      const d = Math.abs(sections[i].station - dsEndSec.station);
      dsStartSec = sections[i];
      if (d >= targetDsLength) break;
    }
  }

  const dsDeltaZ = dsStartSec.minElevation - dsEndSec.minElevation;
  const dsDist = Math.abs(dsStartSec.station - dsEndSec.station);

  let rawSlope = 0.001;
  let method = '';

  if (dsDeltaZ > 0.05 && dsDist > 10) {
    rawSlope = dsDeltaZ / dsDist;
    method = `Mansap son ${Math.round(dsDist)} m yatak taban kot farkından (ΔZ = ${dsDeltaZ.toFixed(2)} m) hesaplandı.`;
  } else {
    // If downstream local bed has adverse slope or ponding, use overall river bed slope
    const overallDeltaZ = Math.abs(sStart.minElevation - sEnd.minElevation);
    rawSlope = overallDeltaZ / Math.max(1, totalDist);
    method = `Toplam akarsu menzili ortalama taban kot farkından (ΔZ = ${overallDeltaZ.toFixed(2)} m, L = ${Math.round(totalDist)} m) hesaplandı.`;
  }

  const boundedSlope = Math.max(0.0001, Math.min(0.15, rawSlope));
  const finalSlope = Number(boundedSlope.toFixed(5));
  const percent = Number((finalSlope * 100).toFixed(3));

  return {
    slope: finalSlope,
    percent,
    method,
    deltaZ: dsDeltaZ > 0 ? dsDeltaZ : Math.abs(sStart.minElevation - sEnd.minElevation),
    reachLength: dsDist > 10 ? dsDist : totalDist,
    upstreamZ: Number(dsStartSec.minElevation.toFixed(2)),
    downstreamZ: Number(dsEndSec.minElevation.toFixed(2))
  };
}

export async function loadDEM(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
  const image = await tiff.getImage();
  const bbox = image.getBoundingBox(); // [minX, minY, maxX, maxY]
  const width = image.getWidth();
  const height = image.getHeight();
  const rasters = await image.readRasters();
  const data = rasters[0] as Float32Array | Int16Array | Uint16Array;
  
  return { bbox, width, height, data };
}

export function getElevation(dem: any, lon: number, lat: number, crsDef?: string): number {
  const { bbox, width, height, data } = dem;
  let targetX = lon;
  let targetY = lat;

  // If DEM bounding box is in projected coordinates (meters, > 180 or > 90) and crsDef is provided
  if (crsDef && (Math.abs(bbox[0]) > 180 || Math.abs(bbox[1]) > 90 || Math.abs(bbox[2]) > 180 || Math.abs(bbox[3]) > 90)) {
    try {
      const [px, py] = proj4('EPSG:4326', crsDef, [lon, lat]);
      targetX = px;
      targetY = py;
    } catch (err) {
      // Fallback to lon, lat
    }
  }

  if (targetX < bbox[0] || targetX > bbox[2] || targetY < bbox[1] || targetY > bbox[3]) {
    return NaN;
  }
  
  const px = Math.floor(((targetX - bbox[0]) / (bbox[2] - bbox[0])) * width);
  const py = Math.floor(((bbox[3] - targetY) / (bbox[3] - bbox[1])) * height);
  
  if (px < 0 || px >= width || py < 0 || py >= height) return NaN;
  
  const val = data[py * width + px];
  if (val < -10000 || val > 10000) return NaN; // nodata filter
  return val;
}

export interface ThalwegDetectionResult {
  originalCoords: [number, number][]; // [lat, lon]
  adjustedCoords: [number, number][]; // [lat, lon] (Thalweg points detected from DEM)
  totalShiftDistance: number;         // Average lateral shift in meters
  maxShiftDistance: number;           // Max lateral shift in meters
  elevationGain: number;              // Average bed depth gained (drop in elevation, e.g. 1.25m deeper)
  pointsSampled: number;
  pointsShifted: number;
  method: string;
}

/**
 * Detects the true river thalweg (deepest channel axis) from DEM within a lateral corridor around the initial KML axis.
 * Performs orthogonal cross-swaths along the line to find local minimum elevation points and applies Savitzky-Golay / moving window smoothing.
 */
export async function detectThalwegCenterline(
  demFile: File,
  centerlineFile: File,
  searchCorridorWidth: number = 60, // Total corridor width in meters (e.g. 60m = +/- 30m)
  sampleInterval: number = 10,       // Distance between thalweg probing points in meters
  crsDef?: string
): Promise<ThalwegDetectionResult> {
  const dem = await loadDEM(demFile);
  const centerline = await parseKML(centerlineFile);
  const totalLength = turf.length(centerline, { units: 'meters' });

  if (totalLength < 5) {
    throw new Error("Nehir aksı çok kısa.");
  }

  const halfCorridor = Math.max(5, searchCorridorWidth / 2);
  const lateralStep = 1.5; // Probe DEM every 1.5m across the perpendicular transect

  const rawThalwegPoints: {
    origCoord: [number, number]; // [lat, lon]
    thalwegCoord: [number, number]; // [lat, lon]
    origElev: number;
    minElev: number;
    shiftDist: number;
    distanceAlong: number;
  }[] = [];

  const actualStep = Math.max(5, sampleInterval);

  for (let d = 0; d <= totalLength; d += actualStep) {
    const pt = turf.along(centerline, d, { units: 'meters' });
    const ptNext = turf.along(centerline, Math.min(d + 1, totalLength), { units: 'meters' });
    const bearing = turf.bearing(pt, ptNext);

    const angleLeft = bearing - 90;
    const angleRight = bearing + 90;

    const [origLon, origLat] = pt.geometry.coordinates;
    const origZ = getElevation(dem, origLon, origLat, crsDef);

    let lowestZ = isNaN(origZ) ? 999999 : origZ;
    let bestLon = origLon;
    let bestLat = origLat;
    let bestOffset = 0; // meters from center (+ = right, - = left)

    // Scan laterally perpendicular to river axis
    for (let offset = -halfCorridor; offset <= halfCorridor; offset += lateralStep) {
      let probePt;
      if (offset < 0) {
        probePt = turf.destination(pt, Math.abs(offset), angleLeft, { units: 'meters' });
      } else if (offset > 0) {
        probePt = turf.destination(pt, offset, angleRight, { units: 'meters' });
      } else {
        probePt = pt;
      }

      const [pLon, pLat] = probePt.geometry.coordinates;
      const z = getElevation(dem, pLon, pLat, crsDef);

      if (!isNaN(z)) {
        // We look for deeper points than current lowest
        if (z < lowestZ) {
          lowestZ = z;
          bestLon = pLon;
          bestLat = pLat;
          bestOffset = offset;
        }
      }
    }

    const shiftDist = Math.abs(bestOffset);
    rawThalwegPoints.push({
      origCoord: [origLat, origLon],
      thalwegCoord: [bestLat, bestLon],
      origElev: isNaN(origZ) ? lowestZ : origZ,
      minElev: lowestZ,
      shiftDist,
      distanceAlong: d
    });
  }

  // Ensure last point of line is included
  if (rawThalwegPoints.length > 0 && rawThalwegPoints[rawThalwegPoints.length - 1].distanceAlong < totalLength - 2) {
    const ptEnd = turf.along(centerline, totalLength, { units: 'meters' });
    const [eLon, eLat] = ptEnd.geometry.coordinates;
    const eZ = getElevation(dem, eLon, eLat, crsDef);
    rawThalwegPoints.push({
      origCoord: [eLat, eLon],
      thalwegCoord: [eLat, eLon],
      origElev: isNaN(eZ) ? 0 : eZ,
      minElev: isNaN(eZ) ? 0 : eZ,
      shiftDist: 0,
      distanceAlong: totalLength
    });
  }

  // Hydrodynamic line smoothing: River thalwegs do not zigzag abruptly.
  // Apply a 5-point moving window smoothing to the detected coordinates
  const smoothedCoords: [number, number][] = [];
  const windowRadius = 2; // window of 5 points

  for (let i = 0; i < rawThalwegPoints.length; i++) {
    let sumLat = 0;
    let sumLon = 0;
    let count = 0;

    for (let w = -windowRadius; w <= windowRadius; w++) {
      const idx = i + w;
      if (idx >= 0 && idx < rawThalwegPoints.length) {
        const weight = windowRadius + 1 - Math.abs(w); // Triangular smoothing weight
        sumLat += rawThalwegPoints[idx].thalwegCoord[0] * weight;
        sumLon += rawThalwegPoints[idx].thalwegCoord[1] * weight;
        count += weight;
      }
    }

    smoothedCoords.push([sumLat / count, sumLon / count]);
  }

  // Calculate statistics
  let totalShift = 0;
  let maxShift = 0;
  let totalElevGain = 0;
  let validElevGainCount = 0;
  let shiftedCount = 0;

  for (let i = 0; i < rawThalwegPoints.length; i++) {
    const item = rawThalwegPoints[i];
    totalShift += item.shiftDist;
    if (item.shiftDist > maxShift) maxShift = item.shiftDist;
    if (item.shiftDist > 1.0) shiftedCount++;

    const deltaElev = item.origElev - item.minElev;
    if (deltaElev > 0 && deltaElev < 50) {
      totalElevGain += deltaElev;
      validElevGainCount++;
    }
  }

  const avgShift = rawThalwegPoints.length > 0 ? totalShift / rawThalwegPoints.length : 0;
  const avgElevGain = validElevGainCount > 0 ? totalElevGain / validElevGainCount : 0;

  return {
    originalCoords: rawThalwegPoints.map(p => p.origCoord),
    adjustedCoords: smoothedCoords,
    totalShiftDistance: Number(avgShift.toFixed(2)),
    maxShiftDistance: Number(maxShift.toFixed(2)),
    elevationGain: Number(avgElevGain.toFixed(2)),
    pointsSampled: rawThalwegPoints.length,
    pointsShifted: shiftedCount,
    method: `DEM taban taraması (±${halfCorridor}m koridor, ${lateralStep}m adım) ve hidrodinamik yumuşatma uygulandı.`
  };
}

/**
 * Converts a list of Leaflet [lat, lon] coordinates into a KML string and File object.
 */
export function coordsToKMLFile(coords: [number, number][], fileName: string = 'dem_tespit_dere_ekseni.kml'): File {
  const coordString = coords.map(([lat, lon]) => `${lon.toFixed(7)},${lat.toFixed(7)},0`).join(' ');
  const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${fileName.replace('.kml', '')}</name>
    <description>DEM Yatak Tabanı (Thalweg) Taraması ile Düzeltilmiş Dere Ekseni</description>
    <Style id="thalwegStyle">
      <LineStyle>
        <color>ff00aaff</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Placemark>
      <name>Gerçek Dere Ekseni (Thalweg)</name>
      <styleUrl>#thalwegStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
          ${coordString}
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

  const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
  return new File([blob], fileName, { type: 'application/vnd.google-earth.kml+xml' });
}

export interface BankTopsDetectionResult {
  leftBankCoords: [number, number][];   // [lat, lon]
  rightBankCoords: [number, number][];  // [lat, lon]
  avgChannelWidth: number;              // Average top width in meters
  minChannelWidth: number;              // Minimum top width in meters
  maxChannelWidth: number;              // Maximum top width in meters
  avgBankHeight: number;                // Average bank height above bed in meters
  pointsSampled: number;
  method: string;
}

/**
 * Robust slope and curvature analysis on a discrete elevation profile.
 * Identifies the true physical bank stations (şev üstleri / breaklines) and the thalweg.
 */
export function detectBankStationsFromProfile(
  profilePoints: { x: number; z: number }[],
  expectedCenterOffset?: number
): {
  bankLeftX: number;
  bankRightX: number;
  talvegX: number;
  talvegZ: number;
  bankLeftZ: number;
  bankRightZ: number;
  channelWidth: number;
} {
  const n = profilePoints.length;
  if (n < 3) {
    const defaultX = profilePoints[0]?.x ?? 0;
    const defaultZ = profilePoints[0]?.z ?? 0;
    return {
      bankLeftX: defaultX,
      bankRightX: defaultX,
      talvegX: defaultX,
      talvegZ: defaultZ,
      bankLeftZ: defaultZ,
      bankRightZ: defaultZ,
      channelWidth: 0
    };
  }

  const minX = profilePoints[0].x;
  const maxX = profilePoints[n - 1].x;
  const totalW = maxX - minX;

  // 1. Identify Thalweg (lowest bed point)
  // If expectedCenterOffset is provided, favor lowest point near channel center
  let minIdx = 0;
  let minZ = profilePoints[0].z;

  // Search window for thalweg (middle 60% of section by default)
  const leftSearchBound = minX + totalW * 0.15;
  const rightSearchBound = maxX - totalW * 0.15;

  let bestThalwegScore = 999999;
  for (let i = 0; i < n; i++) {
    const pt = profilePoints[i];
    if (pt.x >= leftSearchBound && pt.x <= rightSearchBound) {
      if (pt.z < minZ) {
        minZ = pt.z;
        minIdx = i;
      }
    }
  }

  // Fallback if middle search didn't catch minimum
  if (minIdx === 0) {
    for (let i = 0; i < n; i++) {
      if (profilePoints[i].z < minZ) {
        minZ = profilePoints[i].z;
        minIdx = i;
      }
    }
  }

  const talvegX = profilePoints[minIdx].x;
  const talvegZ = profilePoints[minIdx].z;

  // 2. Determine Left Bank Top (scan leftwards from minIdx towards profile start)
  let bestLeftIdx = Math.max(1, Math.floor(minIdx * 0.5));
  let maxLeftScore = -999999;

  for (let i = minIdx - 1; i >= 1; i--) {
    const cur = profilePoints[i];
    const nextCloserToBed = profilePoints[i + 1];
    const prevFurtherLeft = profilePoints[i - 1];

    const distFromBed = Math.abs(talvegX - cur.x);
    if (distFromBed < Math.max(2.0, totalW * 0.03)) continue; // Minimum channel half-width
    if (distFromBed > totalW * 0.45) continue; // Do not push into extreme valley edges

    const dxInner = Math.max(0.1, nextCloserToBed.x - cur.x);
    const dxOuter = Math.max(0.1, cur.x - prevFurtherLeft.x);

    const slopeInner = (cur.z - nextCloserToBed.z) / dxInner;   // Slope towards bed (should be positive rising away from bed)
    const slopeOuter = (prevFurtherLeft.z - cur.z) / dxOuter;   // Slope of overbank floodplain
    const curvature = slopeInner - slopeOuter;                  // Convex curvature (breakline peak)

    const heightAboveBed = cur.z - talvegZ;
    if (heightAboveBed < -0.1) continue;

    let score = curvature * 4.0;
    // Reward significant flattening on the overbank side
    if (slopeInner > 0.05 && slopeOuter <= 0.04) {
      score += 6.0;
    }
    // Reward slope reversal (spill into flat terrain)
    if (slopeInner > 0.04 && slopeOuter < 0) {
      score += 8.0;
    }
    // Reward reasonable bank height
    if (heightAboveBed > 0.3) {
      score += Math.min(5.0, heightAboveBed * 1.5);
    }

    if (score > maxLeftScore) {
      maxLeftScore = score;
      bestLeftIdx = i;
    }
  }

  // 3. Determine Right Bank Top (scan rightwards from minIdx towards profile end)
  let bestRightIdx = Math.min(n - 2, minIdx + Math.max(2, Math.floor((n - 1 - minIdx) * 0.5)));
  let maxRightScore = -999999;

  for (let i = minIdx + 1; i < n - 1; i++) {
    const cur = profilePoints[i];
    const prevCloserToBed = profilePoints[i - 1];
    const nextFurtherRight = profilePoints[i + 1];

    const distFromBed = Math.abs(cur.x - talvegX);
    if (distFromBed < Math.max(2.0, totalW * 0.03)) continue; // Minimum channel half-width
    if (distFromBed > totalW * 0.45) continue; // Do not push into extreme valley edges

    const dxInner = Math.max(0.1, cur.x - prevCloserToBed.x);
    const dxOuter = Math.max(0.1, nextFurtherRight.x - cur.x);

    const slopeInner = (cur.z - prevCloserToBed.z) / dxInner;   // Slope towards bed (positive rising away)
    const slopeOuter = (nextFurtherRight.z - cur.z) / dxOuter;  // Slope of overbank floodplain
    const curvature = slopeInner - slopeOuter;

    const heightAboveBed = cur.z - talvegZ;
    if (heightAboveBed < -0.1) continue;

    let score = curvature * 4.0;
    if (slopeInner > 0.05 && slopeOuter <= 0.04) {
      score += 6.0;
    }
    if (slopeInner > 0.04 && slopeOuter < 0) {
      score += 8.0;
    }
    if (heightAboveBed > 0.3) {
      score += Math.min(5.0, heightAboveBed * 1.5);
    }

    if (score > maxRightScore) {
      maxRightScore = score;
      bestRightIdx = i;
    }
  }

  let bankLeftX = profilePoints[bestLeftIdx].x;
  let bankRightX = profilePoints[bestRightIdx].x;

  // Fallback defaults if profile is completely flat or noisy
  if (bankRightX <= bankLeftX || (bankRightX - bankLeftX) < 2.0) {
    const defaultHalfW = Math.min(totalW * 0.2, Math.max(6, totalW * 0.1));
    bankLeftX = Math.max(minX + 1.0, talvegX - defaultHalfW);
    bankRightX = Math.min(maxX - 1.0, talvegX + defaultHalfW);
  }

  // Ensure left < right strictly
  if (bankLeftX >= bankRightX) {
    bankLeftX = Math.max(minX + 0.5, talvegX - 5);
    bankRightX = Math.min(maxX - 0.5, talvegX + 5);
  }

  const bankLeftZ = profilePoints.find(p => Math.abs(p.x - bankLeftX) < 1.0)?.z ?? talvegZ + 1.0;
  const bankRightZ = profilePoints.find(p => Math.abs(p.x - bankRightX) < 1.0)?.z ?? talvegZ + 1.0;

  return {
    bankLeftX: Number(bankLeftX.toFixed(2)),
    bankRightX: Number(bankRightX.toFixed(2)),
    talvegX: Number(talvegX.toFixed(2)),
    talvegZ: Number(talvegZ.toFixed(2)),
    bankLeftZ: Number(bankLeftZ.toFixed(2)),
    bankRightZ: Number(bankRightZ.toFixed(2)),
    channelWidth: Number((bankRightX - bankLeftX).toFixed(2))
  };
}

/**
 * Extracts continuous geospatial line coordinates (Left Bank, Centerline/Thalweg, Right Bank)
 * directly from an array of cross-sections so they are 100% consistent with the profile markers.
 */
export function extractBankLinesFromSections(sections: CrossSection[]): {
  leftBankCoords: [number, number][];
  centerlineCoords: [number, number][];
  rightBankCoords: [number, number][];
} {
  const leftBankCoords: [number, number][] = [];
  const centerlineCoords: [number, number][] = [];
  const rightBankCoords: [number, number][] = [];

  for (const sec of sections) {
    if (!sec.cutLine || sec.cutLine.length < 2 || !sec.profile || sec.profile.length < 2) continue;
    const [ptL, ptR] = sec.cutLine; // [lat, lon]
    const lineGeo = turf.lineString([[ptL[1], ptL[0]], [ptR[1], ptR[0]]]);
    const minX = sec.profile[0].x;
    const maxX = sec.profile[sec.profile.length - 1].x;
    const totalW = maxX - minX;

    if (totalW <= 0) continue;

    // Fractional position along cutLine
    const fracLeft = Math.max(0, Math.min(1, (sec.bankLeftX - minX) / totalW));
    const fracRight = Math.max(0, Math.min(1, (sec.bankRightX - minX) / totalW));

    const totalDistMeters = turf.length(lineGeo, { units: 'meters' });

    // Left Bank geographic position
    const leftPt = turf.along(lineGeo, totalDistMeters * fracLeft, { units: 'meters' });
    const [lLon, lLat] = leftPt.geometry.coordinates;
    leftBankCoords.push([lLat, lLon]);

    // Centerline / Thalweg geographic position
    let talvegFrac = 0.5;
    let minZ = sec.profile[0].z;
    let minXVal = sec.profile[0].x;
    for (const p of sec.profile) {
      if (p.z < minZ) {
        minZ = p.z;
        minXVal = p.x;
      }
    }
    talvegFrac = Math.max(0, Math.min(1, (minXVal - minX) / totalW));
    const centerPt = turf.along(lineGeo, totalDistMeters * talvegFrac, { units: 'meters' });
    const [cLon, cLat] = centerPt.geometry.coordinates;
    centerlineCoords.push([cLat, cLon]);

    // Right Bank geographic position
    const rightPt = turf.along(lineGeo, totalDistMeters * fracRight, { units: 'meters' });
    const [rLon, rLat] = rightPt.geometry.coordinates;
    rightBankCoords.push([rLat, rLon]);
  }

  return { leftBankCoords, centerlineCoords, rightBankCoords };
}

/**
 * Automatically detects river bank tops / top of slopes (dere şev üstleri / breaklines)
 * from DEM and river centerline using orthogonal lateral transect slope and curvature analysis.
 */
export async function detectBankTopsFromDEM(
  demFile: File,
  centerlineCoordsOrFile: [number, number][] | File,
  searchCorridorWidth: number = 80, // Total lateral search corridor in meters (e.g. 80m = ±40m)
  sampleInterval: number = 10,      // Sampling along river in meters
  crsDef?: string
): Promise<BankTopsDetectionResult> {
  const dem = await loadDEM(demFile);
  
  let centerlineGeo: Feature<LineString>;
  if (centerlineCoordsOrFile instanceof File) {
    centerlineGeo = await parseKML(centerlineCoordsOrFile);
  } else {
    if (centerlineCoordsOrFile.length < 2) {
      throw new Error("Geçerli bir dere ekseni bulunamadı.");
    }
    centerlineGeo = turf.lineString(centerlineCoordsOrFile.map(([lat, lon]) => [lon, lat]));
  }

  const totalLength = turf.length(centerlineGeo, { units: 'meters' });
  if (totalLength < 5) {
    throw new Error("Dere ekseni çok kısa.");
  }

  const halfCorridor = Math.max(10, searchCorridorWidth / 2);
  const lateralStep = 1.0; // Probe DEM every 1m across transect for fine slope gradient

  const rawLeftPoints: { coord: [number, number]; offset: number; height: number; distAlong: number }[] = [];
  const rawRightPoints: { coord: [number, number]; offset: number; height: number; distAlong: number }[] = [];
  const channelWidths: number[] = [];
  const bankHeights: number[] = [];

  const actualStep = Math.max(5, sampleInterval);

  for (let d = 0; d <= totalLength; d += actualStep) {
    const pt = turf.along(centerlineGeo, d, { units: 'meters' });
    const ptNext = turf.along(centerlineGeo, Math.min(d + 1, totalLength), { units: 'meters' });
    const bearing = turf.bearing(pt, ptNext);

    const angleLeft = bearing - 90;
    const angleRight = bearing + 90;

    // Sample lateral profile from -halfCorridor (left) to +halfCorridor (right)
    const samples: { offset: number; pt: any; x: number; z: number }[] = [];

    for (let offset = -halfCorridor; offset <= halfCorridor; offset += lateralStep) {
      let probePt;
      if (offset < 0) {
        probePt = turf.destination(pt, Math.abs(offset), angleLeft, { units: 'meters' });
      } else if (offset > 0) {
        probePt = turf.destination(pt, offset, angleRight, { units: 'meters' });
      } else {
        probePt = pt;
      }

      const [pLon, pLat] = probePt.geometry.coordinates;
      const z = getElevation(dem, pLon, pLat, crsDef);
      samples.push({ offset, pt: probePt, x: offset + halfCorridor, z });
    }

    // Fill NaN elevations
    const validElevs = samples.filter(s => !isNaN(s.z)).map(s => s.z);
    const avgValid = validElevs.length > 0 ? validElevs.reduce((a, b) => a + b, 0) / validElevs.length : 100;
    for (let i = 0; i < samples.length; i++) {
      if (isNaN(samples[i].z)) {
        let leftZ: number | null = null;
        for (let l = i - 1; l >= 0; l--) { if (!isNaN(samples[l].z)) { leftZ = samples[l].z; break; } }
        let rightZ: number | null = null;
        for (let r = i + 1; r < samples.length; r++) { if (!isNaN(samples[r].z)) { rightZ = samples[r].z; break; } }
        if (leftZ !== null && rightZ !== null) samples[i].z = (leftZ + rightZ) / 2;
        else if (leftZ !== null) samples[i].z = leftZ;
        else if (rightZ !== null) samples[i].z = rightZ;
        else samples[i].z = avgValid;
      }
    }

    // Use robust bank station detector
    const detected = detectBankStationsFromProfile(samples, halfCorridor);

    // Map detected stations back to lateral offsets
    const leftOffset = detected.bankLeftX - halfCorridor;
    const rightOffset = detected.bankRightX - halfCorridor;

    let lGeoPt;
    if (leftOffset < 0) {
      lGeoPt = turf.destination(pt, Math.abs(leftOffset), angleLeft, { units: 'meters' });
    } else if (leftOffset > 0) {
      lGeoPt = turf.destination(pt, leftOffset, angleRight, { units: 'meters' });
    } else {
      lGeoPt = pt;
    }

    let rGeoPt;
    if (rightOffset < 0) {
      rGeoPt = turf.destination(pt, Math.abs(rightOffset), angleLeft, { units: 'meters' });
    } else if (rightOffset > 0) {
      rGeoPt = turf.destination(pt, rightOffset, angleRight, { units: 'meters' });
    } else {
      rGeoPt = pt;
    }

    const [lLon, lLat] = lGeoPt.geometry.coordinates;
    const [rLon, rLat] = rGeoPt.geometry.coordinates;

    const width = Math.abs(rightOffset - leftOffset);
    const avgH = ((detected.bankLeftZ - detected.talvegZ) + (detected.bankRightZ - detected.talvegZ)) / 2;

    rawLeftPoints.push({
      coord: [lLat, lLon],
      offset: leftOffset,
      height: detected.bankLeftZ - detected.talvegZ,
      distAlong: d
    });

    rawRightPoints.push({
      coord: [rLat, rLon],
      offset: rightOffset,
      height: detected.bankRightZ - detected.talvegZ,
      distAlong: d
    });

    channelWidths.push(width);
    bankHeights.push(Math.max(0.1, avgH));
  }

  // Hydrodynamic line smoothing on left and right coordinates
  const smoothBankCoords = (rawList: { coord: [number, number] }[]): [number, number][] => {
    const smoothed: [number, number][] = [];
    const windowRadius = 2; // 5-point smoothing

    for (let i = 0; i < rawList.length; i++) {
      let sumLat = 0;
      let sumLon = 0;
      let count = 0;

      for (let w = -windowRadius; w <= windowRadius; w++) {
        const idx = i + w;
        if (idx >= 0 && idx < rawList.length) {
          const weight = windowRadius + 1 - Math.abs(w);
          sumLat += rawList[idx].coord[0] * weight;
          sumLon += rawList[idx].coord[1] * weight;
          count += weight;
        }
      }
      smoothed.push([sumLat / count, sumLon / count]);
    }
    return smoothed;
  };

  const smoothedLeft = smoothBankCoords(rawLeftPoints);
  const smoothedRight = smoothBankCoords(rawRightPoints);

  const avgWidth = channelWidths.length > 0 ? channelWidths.reduce((a, b) => a + b, 0) / channelWidths.length : 15;
  const minWidth = channelWidths.length > 0 ? Math.min(...channelWidths) : 10;
  const maxWidth = channelWidths.length > 0 ? Math.max(...channelWidths) : 25;
  const avgHeight = bankHeights.length > 0 ? bankHeights.reduce((a, b) => a + b, 0) / bankHeights.length : 1.5;

  return {
    leftBankCoords: smoothedLeft,
    rightBankCoords: smoothedRight,
    avgChannelWidth: Number(avgWidth.toFixed(2)),
    minChannelWidth: Number(minWidth.toFixed(2)),
    maxChannelWidth: Number(maxWidth.toFixed(2)),
    avgBankHeight: Number(avgHeight.toFixed(2)),
    pointsSampled: rawLeftPoints.length,
    method: `DEM şev eğimi ve bükeylik (curvature) analizi (±${halfCorridor}m koridor) ile otomatik tespit edildi.`
  };
}

/**
 * Converts Left & Right bank tops into a dual-line KML file.
 */
export function bankCoordsToKMLFile(
  leftBankCoords: [number, number][],
  rightBankCoords: [number, number][],
  fileName: string = 'dem_tespit_sev_ustleri.kml'
): File {
  const leftCoordStr = leftBankCoords.map(([lat, lon]) => `${lon.toFixed(7)},${lat.toFixed(7)},0`).join(' ');
  const rightCoordStr = rightBankCoords.map(([lat, lon]) => `${lon.toFixed(7)},${lat.toFixed(7)},0`).join(' ');

  const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${fileName.replace('.kml', '')}</name>
    <description>DEM Eğrilik ve Şev Kırığı Analiziyle Otomatik Tespit Edilen Dere Şev Üstleri (Bank Tops)</description>
    <Style id="leftBankStyle">
      <LineStyle>
        <color>ff10b981</color>
        <width>3.5</width>
      </LineStyle>
    </Style>
    <Style id="rightBankStyle">
      <LineStyle>
        <color>fff59e0b</color>
        <width>3.5</width>
      </LineStyle>
    </Style>
    <Placemark>
      <name>Sol Şev Üstü (Left Bank Top)</name>
      <styleUrl>#leftBankStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${leftCoordStr}</coordinates>
      </LineString>
    </Placemark>
    <Placemark>
      <name>Sağ Şev Üstü (Right Bank Top)</name>
      <styleUrl>#rightBankStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${rightCoordStr}</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

  const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
  return new File([blob], fileName, { type: 'application/vnd.google-earth.kml+xml' });
}

export interface IntersectionCheckResult {
  hasIntersections: boolean;
  intersectingPairs: [number, number][]; // index pairs of intersecting sections
  intersectingIndices: number[];         // unique list of intersecting section indices
  totalIntersections: number;
}

/**
 * Checks all adjacent and near-neighbor cross-sections for mutual cut-line intersections.
 */
export function checkCrossSectionIntersections(sections: CrossSection[]): IntersectionCheckResult {
  const intersectingPairs: [number, number][] = [];
  const indexSet = new Set<number>();

  for (let i = 0; i < sections.length; i++) {
    const secA = sections[i];
    if (!secA.cutLine || secA.cutLine.length < 2) continue;
    const lineA = turf.lineString([
      [secA.cutLine[0][1], secA.cutLine[0][0]],
      [secA.cutLine[1][1], secA.cutLine[1][0]]
    ]);

    // Check against near neighbors (up to 4 sections upstream/downstream)
    const maxNeighbor = Math.min(sections.length, i + 5);
    for (let j = i + 1; j < maxNeighbor; j++) {
      const secB = sections[j];
      if (!secB.cutLine || secB.cutLine.length < 2) continue;
      const lineB = turf.lineString([
        [secB.cutLine[0][1], secB.cutLine[0][0]],
        [secB.cutLine[1][1], secB.cutLine[1][0]]
      ]);

      const isect = turf.lineIntersect(lineA, lineB);
      if (isect.features.length > 0) {
        intersectingPairs.push([i, j]);
        indexSet.add(i);
        indexSet.add(j);
      }
    }
  }

  const intersectingIndices = Array.from(indexSet).sort((a, b) => a - b);
  return {
    hasIntersections: intersectingPairs.length > 0,
    intersectingPairs,
    intersectingIndices,
    totalIntersections: intersectingPairs.length
  };
}

/**
 * Samples DEM elevations along a straight cut-line defined by center point, streamwise bearing,
 * angle offset (±10° relative to normal 90°), and left/right arm lengths.
 */
export function sampleCrossSectionProfile(
  dem: any,
  pt: Feature<any>,
  bearing: number,
  angleOffset: number,
  leftLength: number,
  rightLength: number,
  crsDef?: string,
  resolution: number = 2
): {
  profile: ProfilePoint[];
  cutLine: [[number, number], [number, number]];
  minElevation: number;
  maxElevation: number;
  bankLeftX: number;
  bankRightX: number;
} {
  const angleLeft = bearing - 90 + angleOffset;
  const angleRight = bearing + 90 + angleOffset;

  const rawSamples: { x: number; z: number }[] = [];

  // Left arm samples (from -leftLength to 0)
  for (let dist = -leftLength; dist < 0; dist += resolution) {
    const samplePt = turf.destination(pt, Math.abs(dist), angleLeft, { units: 'meters' });
    const [lon, lat] = samplePt.geometry.coordinates;
    const z = getElevation(dem, lon, lat, crsDef);
    rawSamples.push({ x: dist + leftLength, z });
  }

  // Center point
  const [cLon, cLat] = pt.geometry.coordinates;
  rawSamples.push({ x: leftLength, z: getElevation(dem, cLon, cLat, crsDef) });

  // Right arm samples (from resolution to rightLength)
  for (let dist = resolution; dist <= rightLength; dist += resolution) {
    const samplePt = turf.destination(pt, dist, angleRight, { units: 'meters' });
    const [lon, lat] = samplePt.geometry.coordinates;
    const z = getElevation(dem, lon, lat, crsDef);
    rawSamples.push({ x: leftLength + dist, z });
  }

  // Ensure right endpoint is included
  if (rawSamples[rawSamples.length - 1].x < leftLength + rightLength - 0.5) {
    const endPt = turf.destination(pt, rightLength, angleRight, { units: 'meters' });
    const [lon, lat] = endPt.geometry.coordinates;
    rawSamples.push({ x: leftLength + rightLength, z: getElevation(dem, lon, lat, crsDef) });
  }

  // Fill any NaN elevations
  const validElevs = rawSamples.filter(s => !isNaN(s.z)).map(s => s.z);
  const avgValid = validElevs.length > 0 ? validElevs.reduce((a, b) => a + b, 0) / validElevs.length : 100;

  for (let i = 0; i < rawSamples.length; i++) {
    if (isNaN(rawSamples[i].z)) {
      let leftZ: number | null = null;
      for (let l = i - 1; l >= 0; l--) { if (!isNaN(rawSamples[l].z)) { leftZ = rawSamples[l].z; break; } }
      let rightZ: number | null = null;
      for (let r = i + 1; r < rawSamples.length; r++) { if (!isNaN(rawSamples[r].z)) { rightZ = rawSamples[r].z; break; } }
      if (leftZ !== null && rightZ !== null) rawSamples[i].z = (leftZ + rightZ) / 2;
      else if (leftZ !== null) rawSamples[i].z = leftZ;
      else if (rightZ !== null) rawSamples[i].z = rightZ;
      else rawSamples[i].z = avgValid;
    }
  }

  // Identify Thalweg & Bank Stations with robust terrain breakline detection
  const detected = detectBankStationsFromProfile(rawSamples, leftLength);
  const bankLeftX = detected.bankLeftX;
  const bankRightX = detected.bankRightX;

  const profile: ProfilePoint[] = rawSamples.map(s => {
    let type: 'LOB' | 'MAIN' | 'ROB' = 'MAIN';
    if (s.x < bankLeftX) type = 'LOB';
    else if (s.x > bankRightX) type = 'ROB';
    return { x: Number(s.x.toFixed(2)), z: Number(s.z.toFixed(2)), type };
  });

  const ptLeft = turf.destination(pt, leftLength, angleLeft, { units: 'meters' });
  const ptRight = turf.destination(pt, rightLength, angleRight, { units: 'meters' });
  const cutLine: [[number, number], [number, number]] = [
    [ptLeft.geometry.coordinates[1], ptLeft.geometry.coordinates[0]],
    [ptRight.geometry.coordinates[1], ptRight.geometry.coordinates[0]]
  ];

  const elevations = profile.map(p => p.z);
  return {
    profile,
    cutLine,
    minElevation: Math.min(...elevations),
    maxElevation: Math.max(...elevations),
    bankLeftX: Number(bankLeftX.toFixed(2)),
    bankRightX: Number(bankRightX.toFixed(2))
  };
}

export interface DeconflictReport {
  initialCollisions: number;
  angleAdjustedCount: number;
  trimmedCount: number;
  deletedCount?: number;
  deletedStations?: number[];
  remainingCollisions: number;
  summary: string;
}

interface InternalSectionDraft {
  station: number;
  pt: Feature<any>;
  centerCoord: [number, number];
  bearing: number;
  angleOffset: number; // starts at 0° (90° normal)
  leftLength: number;
  rightLength: number;
  channelHalfW: number;
  isTrimmed: boolean;
}

function getDraftGeoLine(draft: InternalSectionDraft): Feature<LineString> {
  const aL = draft.bearing - 90 + draft.angleOffset;
  const aR = draft.bearing + 90 + draft.angleOffset;
  const pL = turf.destination(draft.pt, draft.leftLength, aL, { units: 'meters' });
  const pR = turf.destination(draft.pt, draft.rightLength, aR, { units: 'meters' });
  return turf.lineString([pL.geometry.coordinates, pR.geometry.coordinates]);
}

function checkDraftsIntersection(draftA: InternalSectionDraft, draftB: InternalSectionDraft): Feature<any> | null {
  const lA = getDraftGeoLine(draftA);
  const lB = getDraftGeoLine(draftB);
  const isect = turf.lineIntersect(lA, lB);
  return isect.features.length > 0 ? isect.features[0] : null;
}

/**
 * Core deconfliction logic:
 * Performs PURELY rotational angle adjustment (within ±maxAngleAdjustment from 90° normal).
 * Absolutely NO length trimming or cutline shortening is performed.
 * Max scientific limit for 1D river hydraulics (HEC-RAS standard) is ±30°, recommended safe limit is ±15°.
 */
function runDeconflictEngine(
  drafts: InternalSectionDraft[],
  maxAngleAdjustment: number = 15
): DeconflictReport {
  let initialCollisions = 0;
  let angleAdjustedCount = 0;

  // Count initial collisions
  for (let i = 0; i < drafts.length; i++) {
    const maxN = Math.min(drafts.length, i + 5);
    for (let j = i + 1; j < maxN; j++) {
      if (checkDraftsIntersection(drafts[i], drafts[j])) {
        initialCollisions++;
      }
    }
  }

  if (initialCollisions === 0) {
    return {
      initialCollisions: 0,
      angleAdjustedCount: 0,
      trimmedCount: 0,
      remainingCollisions: 0,
      summary: "Kesişen enkesit tespit edilmedi. Tüm kesitler akış eksenine tam 90° dik konumlandırıldı."
    };
  }

  // Generate angle candidate deviations (fine 1-degree steps from center outwards)
  const angleCandidates: number[] = [0];
  for (let a = 1; a <= maxAngleAdjustment; a += 1) {
    angleCandidates.push(a);
    angleCandidates.push(-a);
  }

  // Multi-pass iterative rotational relaxation across all drafts
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < drafts.length; i++) {
      // Check if draft i collides with any close neighbor
      const minN = Math.max(0, i - 4);
      const maxN = Math.min(drafts.length, i + 5);

      const hasCollision = () => {
        for (let k = minN; k < maxN; k++) {
          if (k !== i && checkDraftsIntersection(drafts[i], drafts[k])) {
            return true;
          }
        }
        return false;
      };

      if (hasCollision()) {
        const origAngle = drafts[i].angleOffset;
        let bestAngle = origAngle;
        let bestCollisions = 999;

        for (const cand of angleCandidates) {
          drafts[i].angleOffset = cand;
          let colls = 0;
          for (let k = minN; k < maxN; k++) {
            if (k !== i && checkDraftsIntersection(drafts[i], drafts[k])) {
              colls++;
            }
          }

          if (colls === 0) {
            bestAngle = cand;
            bestCollisions = 0;
            break; // Found complete resolution for this section
          }

          if (colls < bestCollisions) {
            bestCollisions = colls;
            bestAngle = cand;
          }
        }

        drafts[i].angleOffset = bestAngle;
      }
    }
  }

  // Count adjusted sections after rotational pass
  for (let i = 0; i < drafts.length; i++) {
    if (drafts[i].angleOffset !== 0) {
      angleAdjustedCount++;
    }
  }

  // Fallback deconfliction logic:
  // "Açı düzeltmesine rağmen kesişen enkesitler varsa önce çizilen enkesiti koru sonraki enkesiti sil.
  // Önceki enkesiti ise orijinal açısına (0°) geri getir."
  const deletedStations: number[] = [];
  let hasIntersections = true;
  let safetyLoop = 0;

  while (hasIntersections && drafts.length > 1 && safetyLoop < 500) {
    safetyLoop++;
    hasIntersections = false;

    for (let i = 0; i < drafts.length; i++) {
      const maxN = Math.min(drafts.length, i + 6);
      let foundPairIdx = -1;

      for (let j = i + 1; j < maxN; j++) {
        if (checkDraftsIntersection(drafts[i], drafts[j])) {
          foundPairIdx = j;
          break;
        }
      }

      if (foundPairIdx !== -1) {
        hasIntersections = true;
        // 1. Önce çizilen kesitin (i) açısını orijinal açısına (0° normal) geri getir
        drafts[i].angleOffset = 0;

        // 2. Kesişen sonraki kesiti (foundPairIdx) sil
        const deletedDraft = drafts.splice(foundPairIdx, 1)[0];
        if (deletedDraft) {
          deletedStations.push(deletedDraft.station);
        }

        // Listeden silme yapıldığı için indekslerin kaymaması adına döngüyü baştan kontrol et
        break;
      }
    }
  }

  // Recalculate adjusted count after fallback restorations
  angleAdjustedCount = 0;
  for (let i = 0; i < drafts.length; i++) {
    if (drafts[i].angleOffset !== 0) {
      angleAdjustedCount++;
    }
  }

  // Count final remaining collisions
  let remainingCollisions = 0;
  for (let i = 0; i < drafts.length; i++) {
    const maxN = Math.min(drafts.length, i + 5);
    for (let j = i + 1; j < maxN; j++) {
      if (checkDraftsIntersection(drafts[i], drafts[j])) {
        remainingCollisions++;
      }
    }
  }

  const deletedCount = deletedStations.length;
  let summary = "";
  if (remainingCollisions === 0) {
    if (deletedCount === 0) {
      summary = `Kesişen ${initialCollisions} adet enkesit, sadece açı düzeltmesiyle (maks ±${maxAngleAdjustment}°) başarıyla giderildi. Kesit boyları orijinal genişliklerinde korundu.`;
    } else {
      summary = `Açı düzeltmesine rağmen kesişen ${deletedCount} adet sonraki enkesit silindi, önceki enkesitler orijinal açısına geri getirilerek tüm çakışmalar başarıyla çözüldü (${angleAdjustedCount} kesitte açı düzeltmesi korundu).`;
    }
  } else {
    summary = `${initialCollisions} adet kesişmeden ${initialCollisions - remainingCollisions} adedi çözüldü (${deletedCount} kesit silindi). ${remainingCollisions} kesişim haritada işaretlendi.`;
  }

  return {
    initialCollisions,
    angleAdjustedCount,
    trimmedCount: 0,
    deletedCount,
    deletedStations,
    remainingCollisions,
    summary
  };
}

export async function generateCrossSections(
  demFile: File,
  centerlineFile: File,
  leftBankFile: File | null,
  rightBankFile: File | null,
  dx: number,
  sectionWidth: number = 200, // Default 200m width
  crsDef?: string,
  autoDeconflict: boolean = true,
  maxAngleAdjustment: number = 10
): Promise<{ sections: CrossSection[]; deletedSections: CrossSection[]; report?: DeconflictReport }> {
  const dem = await loadDEM(demFile);
  const centerline = await parseKML(centerlineFile);
  
  const length = turf.length(centerline, { units: 'meters' });
  const halfWidth = sectionWidth / 2;
  const channelHalfW = Math.min(sectionWidth * 0.2, Math.max(10, sectionWidth * 0.08));

  // 1. Initial 90° normal section drafts along centerline
  const drafts: InternalSectionDraft[] = [];

  for (let d = 0; d <= length; d += dx) {
    const pt = turf.along(centerline, d, { units: 'meters' });
    const ptNext = turf.along(centerline, Math.min(d + 1, length), { units: 'meters' });
    const bearing = turf.bearing(pt, ptNext);
    const [centerLon, centerLat] = pt.geometry.coordinates;

    drafts.push({
      station: Math.round(d),
      pt,
      centerCoord: [centerLat, centerLon],
      bearing,
      angleOffset: 0,
      leftLength: halfWidth,
      rightLength: halfWidth,
      channelHalfW,
      isTrimmed: false
    });
  }

  // Keep a copy of initial drafts to sample any auto-deleted sections so they can be viewed/restored in the UI
  const initialDraftsMap = new Map<number, InternalSectionDraft>();
  for (const draft of drafts) {
    initialDraftsMap.set(draft.station, { ...draft });
  }

  // 2. If auto-deconflict is enabled, resolve intersections (±10° angle adjustment, then fallback deletion)
  let report: DeconflictReport | undefined;
  if (autoDeconflict && drafts.length > 1) {
    report = runDeconflictEngine(drafts, maxAngleAdjustment);
  }

  // 3. Sample DEM elevations along final active cut-lines
  const sections: CrossSection[] = [];

  for (const draft of drafts) {
    const sampled = sampleCrossSectionProfile(
      dem,
      draft.pt,
      draft.bearing,
      draft.angleOffset,
      draft.leftLength,
      draft.rightLength,
      crsDef,
      2
    );

    sections.push({
      station: draft.station,
      profile: sampled.profile,
      centerCoord: draft.centerCoord,
      cutLine: sampled.cutLine,
      minElevation: sampled.minElevation,
      maxElevation: sampled.maxElevation,
      bankLeftX: sampled.bankLeftX,
      bankRightX: sampled.bankRightX,
      angleAdjustment: draft.angleOffset !== 0 ? draft.angleOffset : undefined
    });
  }

  // 4. Sample DEM elevations for any auto-deleted sections so they appear in CrossSectionManagerModal & map
  const deletedSections: CrossSection[] = [];
  if (report?.deletedStations && report.deletedStations.length > 0) {
    for (const delStation of report.deletedStations) {
      const draft = initialDraftsMap.get(delStation);
      if (draft) {
        const sampled = sampleCrossSectionProfile(
          dem,
          draft.pt,
          draft.bearing,
          0, // original 0° angle
          draft.leftLength,
          draft.rightLength,
          crsDef,
          2
        );
        deletedSections.push({
          station: draft.station,
          profile: sampled.profile,
          centerCoord: draft.centerCoord,
          cutLine: sampled.cutLine,
          minElevation: sampled.minElevation,
          maxElevation: sampled.maxElevation,
          bankLeftX: sampled.bankLeftX,
          bankRightX: sampled.bankRightX
        });
      }
    }
  }

  // 5. Mark remaining intersections if any
  const check = checkCrossSectionIntersections(sections);
  if (check.hasIntersections) {
    for (const idx of check.intersectingIndices) {
      sections[idx].isIntersecting = true;
    }
  }
  
  return { sections, deletedSections, report };
}

/**
 * Resolves intersections on existing cross-sections (e.g. from manual KML or previously generated)
 * applying the ±10° angle adjustment and safe trimming rules.
 */
export async function deconflictExistingCrossSections(
  sections: CrossSection[],
  demFile: File,
  crsDef?: string,
  maxAngleAdjustment: number = 10
): Promise<{ sections: CrossSection[]; report: DeconflictReport }> {
  if (sections.length < 2) {
    return {
      sections,
      report: {
        initialCollisions: 0,
        angleAdjustedCount: 0,
        trimmedCount: 0,
        remainingCollisions: 0,
        summary: "Düzeltilecek yeterli enkesit yok."
      }
    };
  }

  const dem = await loadDEM(demFile);
  const drafts: InternalSectionDraft[] = [];

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    if (!sec.cutLine || sec.cutLine.length < 2) continue;

    const [ptL, ptR] = sec.cutLine; // [[latL, lonL], [latR, lonR]]
    const pLeft = turf.point([ptL[1], ptL[0]]);
    const pRight = turf.point([ptR[1], ptR[0]]);

    let centerPt: Feature<any>;
    if (sec.centerCoord) {
      centerPt = turf.point([sec.centerCoord[1], sec.centerCoord[0]]);
    } else {
      centerPt = turf.midpoint(pLeft, pRight);
    }

    const [cLon, cLat] = centerPt.geometry.coordinates;
    const leftLen = turf.distance(centerPt, pLeft, { units: 'meters' });
    const rightLen = turf.distance(centerPt, pRight, { units: 'meters' });

    // Approximate stream bearing perpendicular to cut-line
    const cutBearing = turf.bearing(pLeft, pRight);
    const bearing = cutBearing - 90; // river flowing perpendicular
    const channelHalfW = Math.max(10, (sec.bankRightX - sec.bankLeftX) / 2 || 15);

    drafts.push({
      station: sec.station,
      pt: centerPt,
      centerCoord: [cLat, cLon],
      bearing,
      angleOffset: sec.angleAdjustment || 0,
      leftLength: leftLen,
      rightLength: rightLen,
      channelHalfW,
      isTrimmed: sec.isTrimmed || false
    });
  }

  const report = runDeconflictEngine(drafts, maxAngleAdjustment);

  const updatedSections: CrossSection[] = [];
  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i];
    const sampled = sampleCrossSectionProfile(
      dem,
      draft.pt,
      draft.bearing,
      draft.angleOffset,
      draft.leftLength,
      draft.rightLength,
      crsDef,
      2
    );

    updatedSections.push({
      station: draft.station,
      profile: sampled.profile,
      centerCoord: draft.centerCoord,
      cutLine: sampled.cutLine,
      minElevation: sampled.minElevation,
      maxElevation: sampled.maxElevation,
      bankLeftX: sampled.bankLeftX,
      bankRightX: sampled.bankRightX,
      angleAdjustment: draft.angleOffset !== 0 ? draft.angleOffset : undefined
    });
  }

  const check = checkCrossSectionIntersections(updatedSections);
  if (check.hasIntersections) {
    for (const idx of check.intersectingIndices) {
      updatedSections[idx].isIntersecting = true;
    }
  }

  return { sections: updatedSections, report };
}

export async function parseManualCrossSections(
  demFile: File,
  kmlFile: File,
  crsDef?: string
): Promise<CrossSection[]> {
  const dem = await loadDEM(demFile);
  const text = await kmlFile.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'text/xml');
  const placemarks = xml.getElementsByTagName('Placemark');
  
  const sections: CrossSection[] = [];
  const resolution = 2; // sample DEM every 2 meters
  const elements = placemarks.length > 0 ? Array.from(placemarks) : Array.from(xml.getElementsByTagName('LineString'));

  let cumulativeStation = 0;

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const coordsNode = el.getElementsByTagName('coordinates')[0];
    if (!coordsNode || !coordsNode.textContent) continue;

    const coordsText = coordsNode.textContent.trim();
    const pairs = coordsText.split(/\s+/);
    const lineCoords: number[][] = [];
    for (const p of pairs) {
      const [lon, lat] = p.split(',').map(Number);
      if (!isNaN(lon) && !isNaN(lat)) {
        lineCoords.push([lon, lat]);
      }
    }
    if (lineCoords.length < 2) continue;

    const line = turf.lineString(lineCoords);
    const lineLen = turf.length(line, { units: 'meters' });
    if (lineLen < 5) continue; // skip too short lines

    let station = cumulativeStation;
    const nameNode = el.getElementsByTagName('name')[0];
    if (nameNode && nameNode.textContent) {
      const match = nameNode.textContent.match(/\d+(\.\d+)?/);
      if (match) {
        station = parseFloat(match[0]);
      }
    }

    const rawSamples: { x: number; z: number }[] = [];
    for (let d = 0; d <= lineLen; d += resolution) {
      const pt = turf.along(line, d, { units: 'meters' });
      const [lon, lat] = pt.geometry.coordinates;
      const z = getElevation(dem, lon, lat, crsDef);
      rawSamples.push({ x: d, z });
    }

    // Clean NaN elevations
    const validElevs = rawSamples.filter(s => !isNaN(s.z)).map(s => s.z);
    const avgValid = validElevs.length > 0 ? validElevs.reduce((a, b) => a + b, 0) / validElevs.length : 100;
    for (let j = 0; j < rawSamples.length; j++) {
      if (isNaN(rawSamples[j].z)) rawSamples[j].z = avgValid;
    }

    // Detect Talveg & Bank Stations using slope curvature analysis
    const detected = detectBankStationsFromProfile(rawSamples);
    const bankLeftX = detected.bankLeftX;
    const bankRightX = detected.bankRightX;

    const profile: ProfilePoint[] = rawSamples.map(s => {
      let type: 'LOB' | 'MAIN' | 'ROB' = 'MAIN';
      if (s.x < bankLeftX) type = 'LOB';
      else if (s.x > bankRightX) type = 'ROB';
      return { x: s.x, z: s.z, type };
    });

    const elevations = profile.map(p => p.z);
    const minElevation = elevations.length > 0 ? Math.min(...elevations) : 0;
    const maxElevation = elevations.length > 0 ? Math.max(...elevations) : 0;

    const firstPt = lineCoords[0];
    const lastPt = lineCoords[lineCoords.length - 1];

    sections.push({
      station: Math.round(station),
      profile,
      centerCoord: [(firstPt[1] + lastPt[1]) / 2, (firstPt[0] + lastPt[0]) / 2],
      cutLine: [
        [firstPt[1], firstPt[0]],
        [lastPt[1], lastPt[0]]
      ],
      minElevation,
      maxElevation,
      bankLeftX,
      bankRightX
    });

    cumulativeStation += 50;
  }

  sections.sort((a, b) => a.station - b.station);
  return sections;
}

export function computeNormalDepth(
  section: CrossSection,
  Q: number,
  nMain: number,
  nLOB: number,
  nROB: number,
  S0: number
): Omit<RoutingResult, 'station'> {
  const profile = section.profile;
  if (!profile || profile.length < 2) {
    return {
      waterElevation: 0,
      maxDepth: 0,
      area: 0,
      velocity: 0,
      wettedPerimeter: 0,
      topWidth: 0,
      froudeNumber: 0,
      isOverbank: false,
      energyElevation: 0,
      bedElevation: 0,
      waterLeftX: 0,
      waterRightX: 0,
      overbankAreaLOB: 0,
      overbankAreaROB: 0,
      bankLeftZ: 0,
      bankRightZ: 0
    };
  }

  // 1. Locate Talveg (deepest bed elevation)
  let minIdx = 0;
  let minZ = profile[0].z;
  for (let i = 0; i < profile.length; i++) {
    if (profile[i].z < minZ) {
      minZ = profile[i].z;
      minIdx = i;
    }
  }
  const talvegX = profile[minIdx].x;

  // 2. Validate Bank Stations
  let bLeftX = section.bankLeftX;
  let bRightX = section.bankRightX;
  if (bLeftX >= talvegX || bRightX <= talvegX || isNaN(bLeftX) || isNaN(bRightX)) {
    const totalW = profile[profile.length - 1].x - profile[0].x;
    const channelHalfW = Math.min(25, Math.max(6, totalW * 0.12));
    bLeftX = Math.max(profile[0].x + 0.5, talvegX - channelHalfW);
    bRightX = Math.min(profile[profile.length - 1].x - 0.5, talvegX + channelHalfW);
  }

  // Helper to interpolate elevation at any station X along the cross section
  const getElevationAtX = (xVal: number): number => {
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

  const bankLeftZ = getElevationAtX(bLeftX);
  const bankRightZ = getElevationAtX(bRightX);
  const bankMinZ = Math.min(bankLeftZ, bankRightZ);

  // 3. Exact Hydraulic Geometry Solver for candidate water level WSE
  const evaluateGeometry = (WSE: number) => {
    if (WSE <= minZ) {
      return {
        areaMAIN: 0, pMAIN: 0, wMAIN: 0,
        areaLOB: 0, pLOB: 0, wLOB: 0,
        areaROB: 0, pROB: 0, wROB: 0,
        totalArea: 0, totalP: 0, totalW: 0,
        waterLeftX: talvegX, waterRightX: talvegX,
        Q_calc: 0
      };
    }

    // Hydrologically connected flow boundary tracing outward from talveg:
    // Left boundary:
    let leftWetX = talvegX;
    for (let i = minIdx; i > 0; i--) {
      const curr = profile[i];
      const prev = profile[i - 1];
      if (prev.z >= WSE) {
        const frac = (WSE - curr.z) / Math.max(1e-6, prev.z - curr.z);
        leftWetX = curr.x - frac * (curr.x - prev.x);
        break;
      } else {
        leftWetX = prev.x;
      }
    }

    // Right boundary:
    let rightWetX = talvegX;
    for (let i = minIdx; i < profile.length - 1; i++) {
      const curr = profile[i];
      const next = profile[i + 1];
      if (next.z >= WSE) {
        const frac = (WSE - curr.z) / Math.max(1e-6, next.z - curr.z);
        rightWetX = curr.x + frac * (next.x - curr.x);
        break;
      } else {
        rightWetX = next.x;
      }
    }

    // Subdivided flow geometry
    let areaMAIN = 0, pMAIN = 0, wMAIN = 0;
    let areaLOB = 0, pLOB = 0, wLOB = 0;
    let areaROB = 0, pROB = 0, wROB = 0;

    for (let i = 0; i < profile.length - 1; i++) {
      const p1 = profile[i];
      const p2 = profile[i + 1];

      const segX1 = Math.max(p1.x, leftWetX);
      const segX2 = Math.min(p2.x, rightWetX);
      if (segX2 <= segX1) continue; // No submerged water in this segment

      const zSeg1 = p1.z + ((segX1 - p1.x) / Math.max(1e-6, p2.x - p1.x)) * (p2.z - p1.z);
      const zSeg2 = p1.z + ((segX2 - p1.x) / Math.max(1e-6, p2.x - p1.x)) * (p2.z - p1.z);

      const h1 = Math.max(0, WSE - zSeg1);
      const h2 = Math.max(0, WSE - zSeg2);
      const dx = segX2 - segX1;
      const dz = zSeg2 - zSeg1;
      const a = ((h1 + h2) / 2) * dx;
      const p = Math.sqrt(dx * dx + dz * dz);

      const midX = (segX1 + segX2) / 2;
      if (midX < bLeftX) {
        areaLOB += a;
        pLOB += p;
        wLOB += dx;
      } else if (midX > bRightX) {
        areaROB += a;
        pROB += p;
        wROB += dx;
      } else {
        areaMAIN += a;
        pMAIN += p;
        wMAIN += dx;
      }
    }

    // Manning Conveyance K = (1/n) * A * R^(2/3)
    const computeK = (A: number, P: number, n: number) => {
      if (A <= 0 || P <= 0 || n <= 0) return 0;
      return (1 / n) * A * Math.pow(A / P, 2 / 3);
    };

    const kMain = computeK(areaMAIN, pMAIN, nMain);
    const kLOB = computeK(areaLOB, pLOB, nLOB);
    const kROB = computeK(areaROB, pROB, nROB);
    const K_total = kMain + kLOB + kROB;

    const effSlope = Math.max(0.00005, S0);
    const Q_calc = K_total * Math.sqrt(effSlope);

    return {
      areaMAIN, pMAIN, wMAIN,
      areaLOB, pLOB, wLOB,
      areaROB, pROB, wROB,
      totalArea: areaMAIN + areaLOB + areaROB,
      totalP: pMAIN + pLOB + pROB,
      totalW: wMAIN + wLOB + wROB,
      waterLeftX: leftWetX,
      waterRightX: rightWetX,
      Q_calc
    };
  };

  // 4. Guaranteed Monotonic Bisection Search for WSE
  let lowWSE = minZ + 0.001;
  let highWSE = minZ + 2.0;

  // Bracket upper bound until Q_calc exceeds requested Q
  const maxAllowableZ = Math.max(...profile.map(p => p.z)) + 25;
  while (evaluateGeometry(highWSE).Q_calc < Q && highWSE < maxAllowableZ) {
    highWSE += 2.0;
  }

  let finalGeom = evaluateGeometry(highWSE);
  let bestWSE = highWSE;

  for (let iter = 0; iter < 65; iter++) {
    const midWSE = (lowWSE + highWSE) / 2;
    const geom = evaluateGeometry(midWSE);
    bestWSE = midWSE;
    finalGeom = geom;

    if (Math.abs(geom.Q_calc - Q) < 0.005 || (highWSE - lowWSE) < 0.0005) {
      break;
    }

    if (geom.Q_calc < Q) {
      lowWSE = midWSE;
    } else {
      highWSE = midWSE;
    }
  }

  const finalArea = finalGeom.totalArea;
  const finalVel = finalArea > 0 ? Q / finalArea : 0;
  const hydraulicDepth = finalGeom.totalW > 0 ? finalArea / finalGeom.totalW : Math.max(0.1, bestWSE - minZ);
  const froudeNumber = hydraulicDepth > 0 ? finalVel / Math.sqrt(9.81 * hydraulicDepth) : 0;
  const velocityHead = (finalVel * finalVel) / (2 * 9.81);
  const energyElevation = bestWSE + velocityHead;

  // Overbank flood occurs ONLY IF water breaches the bank crest AND discharges onto the floodplain
  const isOverbank = bestWSE > bankMinZ && (finalGeom.areaLOB > 0.05 || finalGeom.areaROB > 0.05);

  return {
    waterElevation: bestWSE,
    maxDepth: Math.max(0, bestWSE - minZ),
    area: finalArea,
    velocity: finalVel,
    wettedPerimeter: finalGeom.totalP,
    topWidth: finalGeom.totalW,
    froudeNumber,
    isOverbank,
    energyElevation,
    bedElevation: minZ,
    waterLeftX: finalGeom.waterLeftX,
    waterRightX: finalGeom.waterRightX,
    overbankAreaLOB: finalGeom.areaLOB,
    overbankAreaROB: finalGeom.areaROB,
    bankLeftZ,
    bankRightZ
  };
}

export async function parseKMLStructures(
  file: File,
  sections: CrossSection[],
  centerlineCoords?: [number, number][]
): Promise<HydraulicStructure[]> {
  const text = await file.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'text/xml');
  const placemarks = xml.getElementsByTagName('Placemark');

  const structures: HydraulicStructure[] = [];
  const elements = placemarks.length > 0 ? Array.from(placemarks) : Array.from(xml.getElementsByTagName('Point'));

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const coordsNode = el.getElementsByTagName('coordinates')[0];
    if (!coordsNode || !coordsNode.textContent) continue;

    const coordsText = coordsNode.textContent.trim();
    const parts = coordsText.split(',').map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) continue;

    const lon = parts[0];
    const lat = parts[1];
    const elevInKml = parts.length >= 3 && !isNaN(parts[2]) ? parts[2] : null;

    // Extract name
    let name = `Sanat Yapısı ${i + 1}`;
    const nameNode = el.getElementsByTagName('name')[0];
    if (nameNode && nameNode.textContent?.trim()) {
      name = nameNode.textContent.trim();
    }

    // Determine type: bridge or culvert based on name
    let type: StructureType = 'bridge';
    const lowerName = name.toLowerCase();
    if (lowerName.includes('menfez') || lowerName.includes('culvert') || lowerName.includes('kutu')) {
      type = 'box_culvert';
    } else if (lowerName.includes('boru') || lowerName.includes('pipe')) {
      type = 'pipe_culvert';
    }

    // Find closest station from sections or centerline
    let matchedStation = i * 200 + 100;
    let closestDist = Infinity;
    let refBedElevation = elevInKml || 100;

    if (sections.length > 0) {
      for (const sec of sections) {
        if (sec.centerCoord) {
          const dLat = sec.centerCoord[0] - lat;
          const dLon = sec.centerCoord[1] - lon;
          const dist = Math.sqrt(dLat * dLat + dLon * dLon);
          if (dist < closestDist) {
            closestDist = dist;
            matchedStation = sec.station;
            refBedElevation = sec.minElevation;
          }
        }
      }
    }

    // Reasonable default geometry based on type and bed elevation
    const bedZ = refBedElevation;
    const defaultLowChord = type === 'bridge' ? bedZ + 3.0 : bedZ + 2.0;
    const defaultRoadElev = defaultLowChord + (type === 'bridge' ? 1.2 : 0.8);
    const defaultWidth = type === 'bridge' ? 15.0 : 6.0;

    structures.push({
      id: `struct_${Date.now()}_${i}`,
      name,
      type,
      station: matchedStation,
      coordinates: [lat, lon],
      invertElevation: Number(bedZ.toFixed(2)),
      lowChordElevation: Number(defaultLowChord.toFixed(2)),
      roadElevation: Number(defaultRoadElev.toFixed(2)),
      openingWidth: defaultWidth,
      openingHeight: type === 'bridge' ? 3.0 : 2.0,
      barrelCount: 1,
      pierCount: type === 'bridge' ? 1 : 0,
      pierWidth: 0.8,
      orificeCoefficient: 0.8,
      weirCoefficient: 1.7,
      isActive: true
    });
  }

  // Sort structures by station
  structures.sort((a, b) => a.station - b.station);
  return structures;
}

export function computeStructureHydraulics(
  structure: HydraulicStructure,
  tailwaterWSE: number,
  bedElevation: number,
  Q: number
): StructureHydraulicResult {
  const B_net = Math.max(1, structure.openingWidth - (structure.pierCount * structure.pierWidth));
  const H_open = Math.max(0.5, structure.lowChordElevation - bedElevation);
  const A_open = B_net * H_open * Math.max(1, structure.barrelCount);
  const Cd = structure.orificeCoefficient || 0.8;
  const Cw = structure.weirCoefficient || 1.7;
  const g = 9.81;

  let flowState: 'free' | 'pressure' | 'overtopping' = 'free';
  let upstreamWSE = tailwaterWSE;
  let isOvertopped = false;
  let weirDischarge = 0;
  let culvertDischarge = Q;

  // Case 1: Low Flow (Free Surface)
  if (tailwaterWSE < structure.lowChordElevation - 0.2) {
    const V_approx = Q / Math.max(1, A_open * 0.7);
    const dH_pier = (structure.pierCount * 0.15 + 0.1) * ((V_approx * V_approx) / (2 * g));
    const backwater = Math.max(0.08, Math.min(2.0, dH_pier));
    upstreamWSE = tailwaterWSE + backwater;

    if (upstreamWSE >= structure.lowChordElevation) {
      flowState = 'pressure';
    } else {
      flowState = 'free';
    }
  } else {
    // Case 2: Surcharged / Pressure Flow through bridge opening
    // Q = Cd * A * sqrt(2g * deltaH) -> deltaH = Q^2 / (2g * (Cd * A)^2)
    const dH_orifice = Math.pow(Q, 2) / (2 * g * Math.pow(Cd * A_open, 2));
    upstreamWSE = Math.max(structure.lowChordElevation + 0.1, tailwaterWSE + dH_orifice);
    flowState = 'pressure';
  }

  // Case 3: Overtopping / Weir Flow over road deck
  if (upstreamWSE > structure.roadElevation) {
    isOvertopped = true;
    flowState = 'overtopping';

    // Iterative balance of orifice flow and weir flow
    // Q = Q_orifice + Q_weir
    const deltaH_deck = Math.max(0.2, structure.roadElevation - structure.lowChordElevation);
    const Q_max_orifice = Cd * A_open * Math.sqrt(2 * g * deltaH_deck);
    culvertDischarge = Math.min(Q, Q_max_orifice);
    weirDischarge = Math.max(0, Q - culvertDischarge);

    const roadWidth = Math.max(10, structure.openingWidth * 1.5);
    const H_weir = Math.pow(weirDischarge / Math.max(0.1, Cw * roadWidth), 2 / 3);
    upstreamWSE = structure.roadElevation + H_weir;
  }

  const backwaterRise = Math.max(0, upstreamWSE - tailwaterWSE);
  const freeboard = structure.lowChordElevation - upstreamWSE;
  const throughVelocity = culvertDischarge / Math.max(0.5, A_open);

  return {
    structure,
    station: structure.station,
    flowState,
    upstreamWSE,
    downstreamWSE: tailwaterWSE,
    backwaterRise,
    freeboard,
    isOvertopped,
    weirDischarge,
    culvertDischarge,
    throughVelocity
  };
}

export function runRouting(
  sections: CrossSection[],
  peakFlow: number,
  nMain: number,
  nLOB: number,
  nROB: number,
  S0: number,
  structures: HydraulicStructure[] = []
): { results: RoutingResult[]; structureResults: StructureHydraulicResult[] } {
  // Step 1: Base normal depth calculation for each section
  const baseResults: RoutingResult[] = sections.map(sec => {
    const res = computeNormalDepth(sec, peakFlow, nMain, nLOB, nROB, S0);
    return {
      station: sec.station,
      ...res
    };
  });

  const activeStructures = structures.filter(s => s.isActive);
  const structureResults: StructureHydraulicResult[] = [];

  if (activeStructures.length === 0) {
    return { results: baseResults, structureResults: [] };
  }

  // Step 2: Compute hydraulic backwater for each structure
  // Create mutable working copy
  const finalResults = baseResults.map(r => ({ ...r }));

  for (const struct of activeStructures) {
    // Find closest section to structure
    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < sections.length; i++) {
      const diff = Math.abs(sections[i].station - struct.station);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }

    const sec = sections[closestIdx];
    const tailwater = finalResults[closestIdx].waterElevation;
    const structHyd = computeStructureHydraulics(struct, tailwater, sec.minElevation, peakFlow);
    structureResults.push(structHyd);

    // Apply backwater upstream of structure (upstream = station < struct.station in downstream flow)
    const backwaterSurge = structHyd.backwaterRise;
    if (backwaterSurge > 0.02) {
      const normalDepth = Math.max(1, tailwater - sec.minElevation);
      // Backwater reach length L_backwater ~= 2.5 * y_n / S0 (capped between 200m and 3000m)
      const L_reach = Math.max(300, Math.min(3000, (2.5 * normalDepth) / Math.max(0.0005, S0)));

      for (let i = closestIdx; i >= 0; i--) {
        const distUpstream = struct.station - sections[i].station;
        if (distUpstream < 0) continue;
        if (distUpstream > L_reach) break;

        const decay = Math.exp(-2.5 * (distUpstream / L_reach));
        const addedWSE = backwaterSurge * decay;

        if (addedWSE > 0.02) {
          finalResults[i].waterElevation += addedWSE;
          finalResults[i].maxDepth = finalResults[i].waterElevation - finalResults[i].bedElevation;
          finalResults[i].energyElevation += addedWSE * 0.9;
          
          const profile = sections[i].profile;
          const newWSE = finalResults[i].waterElevation;
          let minZ = profile[0].z, minIdx = 0;
          for (let pIdx = 0; pIdx < profile.length; pIdx++) {
            if (profile[pIdx].z < minZ) { minZ = profile[pIdx].z; minIdx = pIdx; }
          }
          let leftWet = profile[minIdx].x;
          for (let k = minIdx; k > 0; k--) {
            if (profile[k - 1].z >= newWSE) {
              const frac = (newWSE - profile[k].z) / Math.max(1e-6, profile[k - 1].z - profile[k].z);
              leftWet = profile[k].x - frac * (profile[k].x - profile[k - 1].x);
              break;
            } else {
              leftWet = profile[k - 1].x;
            }
          }
          let rightWet = profile[minIdx].x;
          for (let k = minIdx; k < profile.length - 1; k++) {
            if (profile[k + 1].z >= newWSE) {
              const frac = (newWSE - profile[k].z) / Math.max(1e-6, profile[k + 1].z - profile[k].z);
              rightWet = profile[k].x + frac * (profile[k + 1].x - profile[k].x);
              break;
            } else {
              rightWet = profile[k + 1].x;
            }
          }
          finalResults[i].waterLeftX = leftWet;
          finalResults[i].waterRightX = rightWet;
          finalResults[i].topWidth = Math.max(0.5, rightWet - leftWet);

          const bankMin = Math.min(finalResults[i].bankLeftZ, finalResults[i].bankRightZ);
          finalResults[i].isOverbank = newWSE > bankMin;

          finalResults[i].structureEffect = {
            structureName: struct.name,
            flowState: structHyd.flowState,
            backwaterRise: addedWSE
          };
        }
      }
    }
  }

  return { results: finalResults, structureResults };
}
