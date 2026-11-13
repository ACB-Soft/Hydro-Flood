import * as turf from '@turf/turf';
import * as GeoTIFF from 'geotiff';
import proj4 from 'proj4';
import { Feature, LineString } from 'geojson';
import { reprojectCanvasToWgs84 } from './geoReproject';

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
  channelBedElevation?: number; // Ana kanal [bankLeftX, bankRightX] içindeki gerçek taban kotu
  maxElevation: number;
  bankLeftX: number;
  bankRightX: number;
  centerlineX?: number;     // Yüklenen dere ekseni istasyonu (Centerline intersection station)
  talvegX?: number;         // En derin yatak istasyonu (Thalweg station)
  nMain?: number;           // Kesite özgü ana kanal Manning pürüzlülüğü
  nLOB?: number;            // Kesite özgü sol taşkın ovası Manning pürüzlülüğü
  nROB?: number;            // Kesite özgü sağ taşkın ovası Manning pürüzlülüğü
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
  discharge?: number;
  alpha?: number;
  criticalWSE?: number;
  flowRegime?: 'subcritical' | 'critical' | 'supercritical' | 'jump';
  structureEffect?: {
    structureName: string;
    flowState: 'free' | 'pressure' | 'overtopping';
    backwaterRise: number;
  };
}

export function computeChannelBedElevation(
  profile: ProfilePoint[],
  bankLeftX: number,
  bankRightX: number,
  fallbackMinZ?: number
): number {
  if (!profile || profile.length === 0) return fallbackMinZ ?? 0;
  let minBedZ = Infinity;
  for (const pt of profile) {
    if (pt.x >= bankLeftX && pt.x <= bankRightX) {
      if (pt.z < minBedZ) minBedZ = pt.z;
    }
  }
  if (minBedZ < Infinity) return Number(minBedZ.toFixed(2));
  const midX = (bankLeftX + bankRightX) / 2;
  let closestZ = profile[0].z;
  let closestDist = Infinity;
  for (const pt of profile) {
    const d = Math.abs(pt.x - midX);
    if (d < closestDist) {
      closestDist = d;
      closestZ = pt.z;
    }
  }
  return Number((fallbackMinZ !== undefined ? Math.min(closestZ, fallbackMinZ) : closestZ).toFixed(2));
}

export function getChannelBedElevation(section: CrossSection): number {
  if (section.channelBedElevation != null && !isNaN(section.channelBedElevation)) {
    return section.channelBedElevation;
  }
  return computeChannelBedElevation(
    section.profile || [],
    section.bankLeftX,
    section.bankRightX,
    section.minElevation
  );
}

/**
 * Determines river flow direction across all sections using least-squares linear regression
 * of main-channel bed elevations vs stationing.
 * Returns true if sections[0] is upstream and sections[N-1] is downstream.
 */
export function detectFlowDirection(sections: CrossSection[]): boolean {
  if (sections.length < 2) return true;
  const n = sections.length;
  let sumX = 0;
  let sumZ = 0;
  const pts = sections.map(s => {
    const x = s.station;
    const z = getChannelBedElevation(s);
    sumX += x;
    sumZ += z;
    return { x, z };
  });
  const meanX = sumX / n;
  const meanZ = sumZ / n;
  let covXZ = 0;
  let varX = 0;
  for (const p of pts) {
    const dx = p.x - meanX;
    covXZ += dx * (p.z - meanZ);
    varX += dx * dx;
  }
  if (varX > 1e-6) {
    const slope = covXZ / varX;
    if (Math.abs(slope) > 1e-7) {
      return slope < 0; // Negative dZ/dStation => higher station is downstream
    }
  }
  const third = Math.max(1, Math.floor(n / 3));
  const avgStart = pts.slice(0, third).reduce((a, b) => a + b.z, 0) / third;
  const avgEnd = pts.slice(n - third).reduce((a, b) => a + b.z, 0) / third;
  return avgStart >= avgEnd;
}

export interface DynamicTimeStepResult {
  timeHours: number;
  timeFormatted: string;
  inflowQ: number;
  outflowQ: number;
  results: RoutingResult[];
  structureResults: StructureHydraulicResult[];
}

export interface DynamicRoutingResult {
  peakResults: RoutingResult[];
  structureResults: StructureHydraulicResult[];
  timeSteps: DynamicTimeStepResult[];
  peakTimeHours: number;
  maxFloodAreaM2: number;
  upstreamHydrograph: { time: number; flow: number }[];
  downstreamHydrograph: { time: number; flow: number }[];
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

export interface StudyAreaKMLData {
  name: string;
  polygons: [number, number][][]; // Array of outer boundary rings in [lat, lon] Leaflet format
  areaM2: number;
  areaHa: number;
}

/**
 * Parses a KML file containing one or more Polygon / outerBoundaryIs rings
 * representing the investigation/study area (İnceleme Alanı).
 */
export async function parseStudyAreaKML(file: File): Promise<StudyAreaKMLData> {
  const text = await file.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'text/xml');

  const parseCoordsText = (raw: string | null): [number, number][] => {
    if (!raw) return [];
    const pts: [number, number][] = [];
    const tokens = raw.trim().split(/\s+/);
    for (const token of tokens) {
      const parts = token.split(',');
      const lon = Number(parts[0]);
      const lat = Number(parts[1]);
      if (!Number.isNaN(lon) && !Number.isNaN(lat)) {
        pts.push([lat, lon]);
      }
    }
    return pts;
  };

  const polygons: [number, number][][] = [];

  // Prefer explicit <Polygon> -> <outerBoundaryIs> rings first
  const polygonNodes = Array.from(xml.getElementsByTagName('Polygon'));
  for (const polyNode of polygonNodes) {
    const outerNode = polyNode.getElementsByTagName('outerBoundaryIs')[0] || polyNode;
    const coordNode = outerNode.getElementsByTagName('coordinates')[0];
    const pts = parseCoordsText(coordNode?.textContent ?? null);
    if (pts.length >= 3) {
      polygons.push(pts);
    }
  }

  // Fallback to any <coordinates> nodes with >= 3 points if no <Polygon> tags existed
  if (polygons.length === 0) {
    const coordNodes = Array.from(xml.getElementsByTagName('coordinates'));
    for (const cn of coordNodes) {
      const pts = parseCoordsText(cn.textContent);
      if (pts.length >= 3) {
        polygons.push(pts);
      }
    }
  }

  let totalAreaM2 = 0;
  for (const ring of polygons) {
    try {
      const lonLat = ring.map(([lat, lon]) => [lon, lat]);
      const first = lonLat[0];
      const last = lonLat[lonLat.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        lonLat.push([...first]);
      }
      if (lonLat.length >= 4) {
        totalAreaM2 += turf.area(turf.polygon([lonLat]));
      }
    } catch {
      // ignore invalid ring area
    }
  }

  return {
    name: file.name,
    polygons,
    areaM2: totalAreaM2,
    areaHa: totalAreaM2 / 10000
  };
}

export interface StudyAreaClippedReach<T> {
  source: T;
  coords: [number, number][];
  areaM2: number;
}

/**
 * Intersects 1D reach flood polygons against uploaded study area polygon(s)
 * to calculate inundated area inside the study boundary and optionally clip map polygons.
 */
export function computeStudyAreaFloodOverlap<
  T extends { coords: [number, number][]; isOverbank: boolean }
>(
  reachPolygons: T[],
  studyAreaPolygons: [number, number][][]
): {
  clippedReaches: StudyAreaClippedReach<T>[];
  insideFloodAreaM2: number;
  insideOverbankAreaM2: number;
  insideWaterAreaM2: number;
} {
  if (reachPolygons.length === 0 || studyAreaPolygons.length === 0) {
    return {
      clippedReaches: [],
      insideFloodAreaM2: 0,
      insideOverbankAreaM2: 0,
      insideWaterAreaM2: 0
    };
  }

  const toClosedTurfPoly = (ring: [number, number][]) => {
    const lonLat = ring.map(([lat, lon]) => [lon, lat]);
    if (lonLat.length < 3) return null;
    const first = lonLat[0];
    const last = lonLat[lonLat.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      lonLat.push([...first]);
    }
    if (lonLat.length < 4) return null;
    return turf.polygon([lonLat]);
  };

  const studyTurfPolys = studyAreaPolygons
    .map(toClosedTurfPoly)
    .filter((p): p is NonNullable<typeof p> => p !== null);

  if (studyTurfPolys.length === 0) {
    return {
      clippedReaches: [],
      insideFloodAreaM2: 0,
      insideOverbankAreaM2: 0,
      insideWaterAreaM2: 0
    };
  }

  const clippedReaches: StudyAreaClippedReach<T>[] = [];
  let insideWaterAreaM2 = 0;
  let insideOverbankAreaM2 = 0;

  for (const reach of reachPolygons) {
    const reachPoly = toClosedTurfPoly(reach.coords);
    if (!reachPoly) continue;

    for (const studyPoly of studyTurfPolys) {
      try {
        const intersected = turf.intersect(turf.featureCollection([reachPoly, studyPoly]));
        if (!intersected || !intersected.geometry) continue;

        const geom = intersected.geometry;
        const extractOuterRings = (rings: number[][][]) => {
          if (!rings || rings.length === 0 || rings[0].length < 3) return;
          const coordsLatLon: [number, number][] = rings[0].map(([lon, lat]) => [lat, lon]);
          let partAreaM2 = 0;
          try {
            partAreaM2 = turf.area(turf.polygon([rings[0]]));
          } catch {
            partAreaM2 = 0;
          }
          if (partAreaM2 > 0.1) {
            insideWaterAreaM2 += partAreaM2;
            if (reach.isOverbank) {
              insideOverbankAreaM2 += partAreaM2;
            }
            clippedReaches.push({
              source: reach,
              coords: coordsLatLon,
              areaM2: partAreaM2
            });
          }
        };

        if (geom.type === 'Polygon') {
          extractOuterRings(geom.coordinates);
        } else if (geom.type === 'MultiPolygon') {
          for (const polyCoords of geom.coordinates) {
            extractOuterRings(polyCoords);
          }
        }
      } catch {
        // Skip invalid self-intersecting sliver geometry gracefully
      }
    }
  }

  const insideFloodAreaM2 = insideOverbankAreaM2 > 0 ? insideOverbankAreaM2 : insideWaterAreaM2;

  return {
    clippedReaches,
    insideFloodAreaM2,
    insideOverbankAreaM2,
    insideWaterAreaM2
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

    // Set talvegX strictly to the lowest elevation point between Left and Right bank tops
    let talvegX = sec.talvegX ?? (finalBankLeftX + finalBankRightX) / 2;
    let minBedZ = Infinity;
    for (const p of newProfile) {
      if (p.x >= finalBankLeftX && p.x <= finalBankRightX) {
        if (p.z < minBedZ) {
          minBedZ = p.z;
          talvegX = p.x;
        }
      }
    }

    const resolvedBedZ = minBedZ < Infinity ? Number(minBedZ.toFixed(2)) : sec.minElevation;

    return {
      ...sec,
      bankLeftX: Number(finalBankLeftX.toFixed(2)),
      bankRightX: Number(finalBankRightX.toFixed(2)),
      talvegX: Number(talvegX.toFixed(2)),
      channelBedElevation: resolvedBedZ,
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

  // Determine true physical flow direction across all channel beds
  const startIsUpstream = detectFlowDirection(sections);
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

  const dsStartBed = getChannelBedElevation(dsStartSec);
  const dsEndBed = getChannelBedElevation(dsEndSec);
  const sStartBed = getChannelBedElevation(sStart);
  const sEndBed = getChannelBedElevation(sEnd);

  const dsDeltaZ = dsStartBed - dsEndBed;
  const dsDist = Math.abs(dsStartSec.station - dsEndSec.station);

  let rawSlope = 0.001;
  let method = '';

  if (dsDeltaZ > 0.05 && dsDist > 10) {
    rawSlope = dsDeltaZ / dsDist;
    method = `Mansap son ${Math.round(dsDist)} m ana kanal taban kot farkından (ΔZ = ${dsDeltaZ.toFixed(2)} m) hesaplandı.`;
  } else {
    const overallDeltaZ = Math.abs(sStartBed - sEndBed);
    rawSlope = overallDeltaZ / Math.max(1, totalDist);
    method = `Toplam akarsu menzili ana kanal taban kot farkından (ΔZ = ${overallDeltaZ.toFixed(2)} m, L = ${Math.round(totalDist)} m) hesaplandı.`;
  }

  const boundedSlope = Math.max(0.0001, Math.min(0.15, rawSlope));
  const finalSlope = Number(boundedSlope.toFixed(5));
  const percent = Number((finalSlope * 100).toFixed(3));

  return {
    slope: finalSlope,
    percent,
    method,
    deltaZ: dsDeltaZ > 0 ? dsDeltaZ : Math.abs(sStartBed - sEndBed),
    reachLength: dsDist > 10 ? dsDist : totalDist,
    upstreamZ: Number(dsStartBed.toFixed(2)),
    downstreamZ: Number(dsEndBed.toFixed(2))
  };
}

export interface LoadedDEMRaster {
  bbox: number[];
  width: number;
  height: number;
  data: Float32Array | Int16Array | Uint16Array;
  noDataVal: number;
}

const demRasterCache = new WeakMap<File, Promise<LoadedDEMRaster>>();

export async function loadDEM(file: File): Promise<LoadedDEMRaster> {
  const cached = demRasterCache.get(file);
  if (cached) return cached;

  const promise = (async (): Promise<LoadedDEMRaster> => {
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.asc')) {
      const text = await file.text();
      const lines = text.trim().split(/\r?\n/);
      let ncols = 0, nrows = 0, xllcorner = 0, yllcorner = 0, cellsize = 10, noDataVal = -9999;
      let isCenter = false;
      let dataStartIdx = 0;
      for (let i = 0; i < Math.min(12, lines.length); i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length < 2) continue;
        const key = parts[0].toLowerCase();
        const val = Number(parts[1]);
        if (key === 'ncols') { ncols = val; dataStartIdx = i + 1; }
        else if (key === 'nrows') { nrows = val; dataStartIdx = i + 1; }
        else if (key === 'xllcorner') { xllcorner = val; dataStartIdx = i + 1; }
        else if (key === 'xllcenter') { xllcorner = val; isCenter = true; dataStartIdx = i + 1; }
        else if (key === 'yllcorner') { yllcorner = val; dataStartIdx = i + 1; }
        else if (key === 'yllcenter') { yllcorner = val; isCenter = true; dataStartIdx = i + 1; }
        else if (key === 'cellsize') { cellsize = val; dataStartIdx = i + 1; }
        else if (key === 'nodata_value') { noDataVal = val; dataStartIdx = i + 1; }
        else break;
      }
      if (isCenter) {
        xllcorner -= cellsize * 0.5;
        yllcorner -= cellsize * 0.5;
      }
      const parsed = new Float32Array(Math.max(1, ncols * nrows));
      parsed.fill(NaN);
      let idx = 0;
      for (let i = dataStartIdx; i < lines.length && idx < parsed.length; i++) {
        const tokens = lines[i].trim().split(/\s+/);
        for (let j = 0; j < tokens.length && idx < parsed.length; j++) {
          if (tokens[j] === '') continue;
          const num = Number(tokens[j]);
          parsed[idx++] = num === noDataVal ? NaN : num;
        }
      }
      return {
        bbox: [xllcorner, yllcorner, xllcorner + ncols * cellsize, yllcorner + nrows * cellsize],
        width: ncols,
        height: nrows,
        data: parsed,
        noDataVal
      };
    }

    const arrayBuffer = await file.arrayBuffer();
    const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
    const image = await tiff.getImage();
    const bbox = image.getBoundingBox(); // [minX, minY, maxX, maxY]
    const width = image.getWidth();
    const height = image.getHeight();
    const noDataVal = image.getGDALNoData() ?? -9999;
    const rasters = await image.readRasters();
    const data = rasters[0] as Float32Array | Int16Array | Uint16Array;

    return { bbox, width, height, data, noDataVal };
  })();

  demRasterCache.set(file, promise);
  return promise;
}

export interface DEMReliefOverlays {
  elevationImage: string;
  reliefImage: string;
  wgs84Bounds: [[number, number], [number, number]];
  minElev: number;
  maxElev: number;
}

/**
 * Generates hypsometric shaded-relief (kabartma) and grayscale hillshade images from a DEM file
 * matching the Static Flood Simulation visual style, accurately reprojected to WGS84.
 */
export async function buildDEMReliefOverlays(
  demFile: File,
  crsDef: string
): Promise<DEMReliefOverlays | null> {
  let rawWidth = 0;
  let rawHeight = 0;
  let bbox: number[] = [0, 0, 0, 0];
  let rawData: Float32Array | Int16Array | Uint16Array | null = null;
  let noDataVal = -9999;

  const lowerName = demFile.name.toLowerCase();
  if (lowerName.endsWith('.asc')) {
    const text = await demFile.text();
    const lines = text.trim().split(/\r?\n/);
    let ncols = 0, nrows = 0, xllcorner = 0, yllcorner = 0, cellsize = 10;
    let isCenter = false;
    let dataStartIdx = 0;
    for (let i = 0; i < Math.min(12, lines.length); i++) {
      const parts = lines[i].trim().split(/\s+/);
      if (parts.length < 2) continue;
      const key = parts[0].toLowerCase();
      const val = Number(parts[1]);
      if (key === 'ncols') { ncols = val; dataStartIdx = i + 1; }
      else if (key === 'nrows') { nrows = val; dataStartIdx = i + 1; }
      else if (key === 'xllcorner') { xllcorner = val; dataStartIdx = i + 1; }
      else if (key === 'xllcenter') { xllcorner = val; isCenter = true; dataStartIdx = i + 1; }
      else if (key === 'yllcorner') { yllcorner = val; dataStartIdx = i + 1; }
      else if (key === 'yllcenter') { yllcorner = val; isCenter = true; dataStartIdx = i + 1; }
      else if (key === 'cellsize') { cellsize = val; dataStartIdx = i + 1; }
      else if (key === 'nodata_value') { noDataVal = val; dataStartIdx = i + 1; }
      else break;
    }
    if (ncols <= 1 || nrows <= 1) return null;
    if (isCenter) {
      xllcorner -= cellsize * 0.5;
      yllcorner -= cellsize * 0.5;
    }
    rawWidth = ncols;
    rawHeight = nrows;
    bbox = [xllcorner, yllcorner, xllcorner + ncols * cellsize, yllcorner + nrows * cellsize];
    const parsed = new Float32Array(ncols * nrows);
    parsed.fill(NaN);
    let idx = 0;
    for (let i = dataStartIdx; i < lines.length && idx < parsed.length; i++) {
      const tokens = lines[i].trim().split(/\s+/);
      for (let j = 0; j < tokens.length && idx < parsed.length; j++) {
        if (tokens[j] === '') continue;
        parsed[idx++] = Number(tokens[j]);
      }
    }
    rawData = parsed;
  } else {
    const arrayBuffer = await demFile.arrayBuffer();
    const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
    const image = await tiff.getImage();
    bbox = image.getBoundingBox();
    rawWidth = image.getWidth();
    rawHeight = image.getHeight();
    noDataVal = image.getGDALNoData() ?? -9999;
    const rasters = await image.readRasters();
    rawData = rasters[0] as Float32Array | Int16Array | Uint16Array;
  }

  if (!rawData || rawWidth < 2 || rawHeight < 2) return null;

  // Downsample visualization grid to max 1024px per side for crisp hillshade without UI stalls
  const maxDim = 1024;
  const scale = Math.min(1, maxDim / Math.max(rawWidth, rawHeight));
  const width = Math.max(2, Math.round(rawWidth * scale));
  const height = Math.max(2, Math.round(rawHeight * scale));

  const xll = bbox[0];
  const yll = bbox[1];
  const spanX = Math.abs(bbox[2] - bbox[0]);
  const spanY = Math.abs(bbox[3] - bbox[1]);
  const cellSizeX = spanX / width;
  const cellSizeY = spanY / height;

  const data = new Float32Array(width * height);
  let minElev = Infinity;
  let maxElev = -Infinity;

  for (let y = 0; y < height; y++) {
    const sy = Math.min(rawHeight - 1, Math.floor(((y + 0.5) / height) * rawHeight));
    const srcRow = sy * rawWidth;
    const dstRow = y * width;
    for (let x = 0; x < width; x++) {
      const sx = Math.min(rawWidth - 1, Math.floor(((x + 0.5) / width) * rawWidth));
      const v = rawData[srcRow + sx];
      if (isNaN(v) || v <= -9000 || v > 20000 || v === noDataVal) {
        data[dstRow + x] = NaN;
      } else {
        data[dstRow + x] = v;
        if (v < minElev) minElev = v;
        if (v > maxElev) maxElev = v;
      }
    }
  }

  if (!isFinite(minElev) || !isFinite(maxElev)) {
    minElev = 0;
    maxElev = 1;
  }

  // Determine WGS84 geographic bounds and effective cell size in meters
  const isGeographicBbox =
    Math.abs(bbox[0]) <= 180 &&
    Math.abs(bbox[2]) <= 180 &&
    Math.abs(bbox[1]) <= 90 &&
    Math.abs(bbox[3]) <= 90;

  const effectiveCrsDef = isGeographicBbox
    ? '+proj=longlat +datum=WGS84 +no_defs'
    : crsDef;

  let wgs84Bounds: [[number, number], [number, number]];
  if (isGeographicBbox) {
    wgs84Bounds = [
      [Math.min(bbox[1], bbox[3]), Math.min(bbox[0], bbox[2])],
      [Math.max(bbox[1], bbox[3]), Math.max(bbox[0], bbox[2])]
    ];
  } else {
    try {
      const toCRS = '+proj=longlat +datum=WGS84 +no_defs';
      const pSW = proj4(effectiveCrsDef, toCRS, [bbox[0], bbox[1]]);
      const pNW = proj4(effectiveCrsDef, toCRS, [bbox[0], bbox[3]]);
      const pNE = proj4(effectiveCrsDef, toCRS, [bbox[2], bbox[3]]);
      const pSE = proj4(effectiveCrsDef, toCRS, [bbox[2], bbox[1]]);
      const lats = [pSW[1], pNW[1], pNE[1], pSE[1]];
      const lons = [pSW[0], pNW[0], pNE[0], pSE[0]];
      wgs84Bounds = [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)]
      ];
    } catch {
      return null;
    }
  }

  const midLatRad = (((wgs84Bounds[0][0] + wgs84Bounds[1][0]) / 2) * Math.PI) / 180;
  const effectiveCellX = isGeographicBbox ? cellSizeX * 111320 * Math.cos(midLatRad) : cellSizeX;
  const effectiveCellY = isGeographicBbox ? cellSizeY * 111320 : cellSizeY;

  const elevCanvas = document.createElement('canvas');
  elevCanvas.width = width;
  elevCanvas.height = height;
  const elevCtx = elevCanvas.getContext('2d');

  const reliefCanvas = document.createElement('canvas');
  reliefCanvas.width = width;
  reliefCanvas.height = height;
  const reliefCtx = reliefCanvas.getContext('2d');

  if (!elevCtx || !reliefCtx) return null;

  const elevImageData = elevCtx.createImageData(width, height);
  const reliefImageData = reliefCtx.createImageData(width, height);
  const ed = elevImageData.data;
  const rd = reliefImageData.data;

  // Hillshade parameters identical to Static Flood Simulation (App.tsx)
  const azimuth = 315;
  const altitude = 45;
  const zFactor = 2.0;
  const zenith_rad = ((90 - altitude) * Math.PI) / 180;
  const azimuth_math = 360.0 - azimuth + 90.0;
  const azimuth_rad = ((azimuth_math > 360 ? azimuth_math - 360 : azimuth_math) * Math.PI) / 180;

  const stops = [
    { pos: 0.0, color: [20, 120, 20] },
    { pos: 0.2, color: [80, 180, 80] },
    { pos: 0.4, color: [230, 230, 120] },
    { pos: 0.6, color: [200, 150, 80] },
    { pos: 0.8, color: [140, 70, 30] },
    { pos: 1.0, color: [255, 255, 255] }
  ];

  const range = Math.max(0.001, maxElev - minElev);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const idx = i * 4;
      const cellVal = data[i];

      if (isNaN(cellVal) || cellVal <= -9000) {
        ed[idx + 3] = 0;
        rd[idx + 3] = 0;
        continue;
      }

      // Horn's 3x3 Hillshade
      let hillshade = 0.707;
      if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        const getSafe = (index: number) => {
          const v = data[index];
          return !isNaN(v) && v > -9000 ? v : cellVal;
        };
        const a = getSafe((y - 1) * width + (x - 1));
        const b = getSafe((y - 1) * width + x);
        const c = getSafe((y - 1) * width + (x + 1));
        const d_val = getSafe(y * width + (x - 1));
        const f = getSafe(y * width + (x + 1));
        const g = getSafe((y + 1) * width + (x - 1));
        const h = getSafe((y + 1) * width + x);
        const k = getSafe((y + 1) * width + (x + 1));

        const dz_dx = ((c + 2 * f + k) - (a + 2 * d_val + g)) / (8 * Math.max(0.01, effectiveCellX));
        const dz_dy = ((g + 2 * h + k) - (a + 2 * b + c)) / (8 * Math.max(0.01, effectiveCellY));

        const slope_rad = Math.atan(zFactor * Math.sqrt(dz_dx * dz_dx + dz_dy * dz_dy));
        let aspect_rad = 0;
        if (dz_dx !== 0) {
          aspect_rad = Math.atan2(dz_dy, -dz_dx);
          if (aspect_rad < 0) aspect_rad += 2 * Math.PI;
        } else {
          if (dz_dy > 0) aspect_rad = Math.PI / 2;
          else if (dz_dy < 0) aspect_rad = 2 * Math.PI - Math.PI / 2;
          else aspect_rad = 0;
        }

        hillshade = Math.max(
          0,
          Math.cos(zenith_rad) * Math.cos(slope_rad) +
            Math.sin(zenith_rad) * Math.sin(slope_rad) * Math.cos(azimuth_rad - aspect_rad)
        );
      }

      // Hypsometric Tinting blended with Hillshade
      const val = Math.max(0, Math.min(1, (cellVal - minElev) / range));
      let r = 255, g_col = 255, b_col = 255;
      for (let s = 0; s < stops.length - 1; s++) {
        const s1 = stops[s];
        const s2 = stops[s + 1];
        if (val >= s1.pos && val <= s2.pos) {
          const frac = (val - s1.pos) / (s2.pos - s1.pos);
          r = s1.color[0] + (s2.color[0] - s1.color[0]) * frac;
          g_col = s1.color[1] + (s2.color[1] - s1.color[1]) * frac;
          b_col = s1.color[2] + (s2.color[2] - s1.color[2]) * frac;
          break;
        }
      }

      const factor = 0.6 + hillshade * 0.5;
      ed[idx] = Math.min(255, r * factor);
      ed[idx + 1] = Math.min(255, g_col * factor);
      ed[idx + 2] = Math.min(255, b_col * factor);
      ed[idx + 3] = 255;

      // Grayscale Relief for Satellite/Flood Blending
      const gray = Math.max(0, Math.min(255, 128 + (hillshade - 0.707) * 180));
      rd[idx] = gray;
      rd[idx + 1] = gray;
      rd[idx + 2] = gray;
      rd[idx + 3] = 255;
    }
  }

  elevCtx.putImageData(elevImageData, 0, 0);
  reliefCtx.putImageData(reliefImageData, 0, 0);

  const visDemInfo = {
    width,
    height,
    xll,
    yll,
    cellSize: cellSizeX,
    cellSizeY
  };

  const warpedElev = reprojectCanvasToWgs84(elevCanvas, visDemInfo, effectiveCrsDef, wgs84Bounds);
  const warpedRelief = reprojectCanvasToWgs84(reliefCanvas, visDemInfo, effectiveCrsDef, wgs84Bounds);

  return {
    elevationImage: warpedElev,
    reliefImage: warpedRelief,
    wgs84Bounds,
    minElev: Number(minElev.toFixed(2)),
    maxElev: Number(maxElev.toFixed(2))
  };
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
  usedBankConstraints: boolean;       // Whether scan was bounded by explicit bank lines / sections
  method: string;
}

export interface ThalwegDetectionOptions {
  leftBankCoords?: [number, number][];   // [lat, lon]
  rightBankCoords?: [number, number][];  // [lat, lon]
  sections?: CrossSection[];
}

/**
 * Detects the true river thalweg (deepest channel axis) from DEM strictly within the detected stream bed.
 * If bank lines (left/right bank tops) or generated cross-sections exist, scans ONLY between the left and right banks.
 * Otherwise, automatically detects the local channel bed & bank crests around the axis and stops at bank ridges so it never jumps to distant floodplain pits.
 */
export async function detectThalwegCenterline(
  demFile: File,
  centerlineFile: File,
  searchCorridorWidth: number = 60, // Fallback outer search width in meters when no bank lines exist
  sampleInterval: number = 10,       // Distance between thalweg probing points in meters
  crsDef?: string,
  options?: ThalwegDetectionOptions
): Promise<ThalwegDetectionResult> {
  const dem = await loadDEM(demFile);
  const centerline = await parseKML(centerlineFile);
  const totalLength = turf.length(centerline, { units: 'meters' });

  if (totalLength < 5) {
    throw new Error("Nehir aksı çok kısa.");
  }

  // Resolve stream bed boundaries (Left & Right Bank Tops) if available
  let leftBankCoords = options?.leftBankCoords && options.leftBankCoords.length >= 2 ? options.leftBankCoords : [];
  let rightBankCoords = options?.rightBankCoords && options.rightBankCoords.length >= 2 ? options.rightBankCoords : [];

  if ((leftBankCoords.length < 2 || rightBankCoords.length < 2) && options?.sections && options.sections.length >= 2) {
    const extracted = extractBankLinesFromSections(options.sections);
    if (leftBankCoords.length < 2) leftBankCoords = extracted.leftBankCoords;
    if (rightBankCoords.length < 2) rightBankCoords = extracted.rightBankCoords;
  }

  const hasExplicitBanks = leftBankCoords.length >= 2 && rightBankCoords.length >= 2;
  const leftBankGeo = hasExplicitBanks
    ? turf.lineString(leftBankCoords.map(([lat, lon]) => [lon, lat]))
    : null;
  const rightBankGeo = hasExplicitBanks
    ? turf.lineString(rightBankCoords.map(([lat, lon]) => [lon, lat]))
    : null;

  const fallbackHalfCorridor = Math.max(5, Math.min(30, searchCorridorWidth / 2));
  const lateralStep = 1.0; // Probe DEM every 1.0m across the perpendicular transect

  const getSignedOffset = (centerPt: Feature<any>, targetPt: Feature<any>, angleRightDeg: number): number => {
    const dist = turf.distance(centerPt, targetPt, { units: 'meters' });
    if (dist < 0.01) return 0;
    const b = turf.bearing(centerPt, targetPt);
    const diffRad = ((b - angleRightDeg) * Math.PI) / 180;
    return dist * Math.cos(diffRad);
  };

  const getPointAtOffset = (centerPt: Feature<any>, offset: number, angleLeft: number, angleRight: number): Feature<any> => {
    if (offset < -0.001) {
      return turf.destination(centerPt, Math.abs(offset), angleLeft, { units: 'meters' });
    } else if (offset > 0.001) {
      return turf.destination(centerPt, offset, angleRight, { units: 'meters' });
    }
    return centerPt;
  };

  const rawThalwegPoints: {
    origPt: Feature<any>;
    origCoord: [number, number]; // [lat, lon]
    thalwegCoord: [number, number]; // [lat, lon]
    origElev: number;
    minElev: number;
    shiftDist: number;
    bestOffset: number;
    minBoundOffset: number;
    maxBoundOffset: number;
    hasExplicitBounds: boolean;
    angleLeft: number;
    angleRight: number;
    distanceAlong: number;
  }[] = [];

  const actualStep = Math.max(5, sampleInterval);
  const sampleDistances: number[] = [];
  for (let d = 0; d <= totalLength; d += actualStep) {
    sampleDistances.push(d);
  }
  if (sampleDistances.length === 0 || totalLength - sampleDistances[sampleDistances.length - 1] > 1.5) {
    sampleDistances.push(totalLength);
  }

  let bankConstrainedStations = 0;
  let prevBestOffset = 0;

  for (let sIdx = 0; sIdx < sampleDistances.length; sIdx++) {
    const d = sampleDistances[sIdx];
    const pt = turf.along(centerline, d, { units: 'meters' });
    const dPrev = Math.max(0, d - 1);
    const dNext = Math.min(totalLength, d + 1);
    const ptPrev = turf.along(centerline, dPrev, { units: 'meters' });
    const ptNext = turf.along(centerline, dNext, { units: 'meters' });
    const bearing = turf.bearing(ptPrev, ptNext);

    const angleLeft = bearing - 90;
    const angleRight = bearing + 90;

    const [origLon, origLat] = pt.geometry.coordinates;
    const origZ = getElevation(dem, origLon, origLat, crsDef);

    // 1. Determine Stream Bed Bounds [minScanOffset, maxScanOffset] at this station
    let minScanOffset = -fallbackHalfCorridor;
    let maxScanOffset = fallbackHalfCorridor;
    let stationHasExplicitBounds = false;

    if (leftBankGeo && rightBankGeo) {
      const probeSpan = 300; // meters each side to locate bank lines reliably
      const leftEnd = turf.destination(pt, probeSpan, angleLeft, { units: 'meters' });
      const rightEnd = turf.destination(pt, probeSpan, angleRight, { units: 'meters' });
      const transectLine = turf.lineString([leftEnd.geometry.coordinates, rightEnd.geometry.coordinates]);

      const findBankOffset = (bankGeo: Feature<LineString>): number | null => {
        const isects = turf.lineIntersect(transectLine, bankGeo);
        if (isects.features.length > 0) {
          let bestOff: number | null = null;
          let bestAbs = Infinity;
          for (const f of isects.features) {
            const off = getSignedOffset(pt, f, angleRight);
            if (Math.abs(off) < bestAbs) {
              bestAbs = Math.abs(off);
              bestOff = off;
            }
          }
          if (bestOff !== null) return bestOff;
        }
        // Fallback near reach ends: orthogonal projection of nearest bank vertex
        const nearest = turf.nearestPointOnLine(bankGeo, pt);
        const nDist = turf.distance(pt, nearest, { units: 'meters' });
        if (nDist <= probeSpan) {
          return getSignedOffset(pt, nearest, angleRight);
        }
        return null;
      };

      const lOff = findBankOffset(leftBankGeo);
      const rOff = findBankOffset(rightBankGeo);

      if (lOff !== null && rOff !== null) {
        const rawMin = Math.min(lOff, rOff);
        const rawMax = Math.max(lOff, rOff);
        const bedWidth = rawMax - rawMin;

        // Sanity guard: bank width must be physically reasonable (1m .. 300m)
        if (bedWidth >= 1.0 && bedWidth <= 300) {
          minScanOffset = rawMin;
          maxScanOffset = rawMax;
          stationHasExplicitBounds = true;
          bankConstrainedStations++;
        }
      }
    }

    // 2. Sample DEM laterally across the transect (finer resolution between explicit bank lines)
    const sampleMin = stationHasExplicitBounds ? minScanOffset : -fallbackHalfCorridor;
    const sampleMax = stationHasExplicitBounds ? maxScanOffset : fallbackHalfCorridor;
    const scanStep = stationHasExplicitBounds
      ? Math.min(0.5, Math.max(0.2, (sampleMax - sampleMin) / 40))
      : lateralStep;

    const samples: { offset: number; x: number; z: number; lat: number; lon: number }[] = [];
    for (let offset = sampleMin; offset <= sampleMax + 1e-4; offset += scanStep) {
      const clampedOff = Math.min(offset, sampleMax);
      const probePt = getPointAtOffset(pt, clampedOff, angleLeft, angleRight);
      const [pLon, pLat] = probePt.geometry.coordinates;
      const z = getElevation(dem, pLon, pLat, crsDef);
      if (!isNaN(z)) {
        samples.push({
          offset: clampedOff,
          x: clampedOff - sampleMin,
          z,
          lat: pLat,
          lon: pLon
        });
      }
      if (clampedOff >= sampleMax) break;
    }

    // 3. If no explicit banks exist, constrain to local detected stream channel & bank-crest barrier
    let bedSearchMin = sampleMin;
    let bedSearchMax = sampleMax;

    if (!stationHasExplicitBounds && samples.length >= 5) {
      // Detect channel banks from the profile anchored around offset = 0
      const zeroX = -sampleMin;
      const detected = detectBankStationsFromProfile(
        samples.map(s => ({ x: s.x, z: s.z })),
        zeroX
      );

      let localMinOff = detected.bankLeftX + sampleMin;
      let localMaxOff = detected.bankRightX + sampleMin;

      // Locate initial bed anchor near offset=0 (or tracked prevBestOffset)
      const anchorOff = sIdx > 0 ? Math.max(-10, Math.min(10, prevBestOffset)) : 0;
      const anchorRadius = 8.0;
      let anchorIdx = 0;
      let anchorMinZ = Infinity;
      for (let i = 0; i < samples.length; i++) {
        if (Math.abs(samples[i].offset - anchorOff) <= anchorRadius && samples[i].z < anchorMinZ) {
          anchorMinZ = samples[i].z;
          anchorIdx = i;
        }
      }
      if (anchorMinZ === Infinity) {
        let closestD = Infinity;
        for (let i = 0; i < samples.length; i++) {
          const distToAnchor = Math.abs(samples[i].offset - anchorOff);
          if (distToAnchor < closestD) {
            closestD = distToAnchor;
            anchorIdx = i;
            anchorMinZ = samples[i].z;
          }
        }
      }

      // Bank-crest / levee barrier guard:
      // Walk left and right from local bed anchor; stop if we climb over a bank ridge (>0.45m rise then drop)
      let leftCrestOff = samples[0].offset;
      let maxLeftZ = anchorMinZ;
      for (let i = anchorIdx - 1; i >= 0; i--) {
        if (samples[i].z > maxLeftZ) maxLeftZ = samples[i].z;
        if (maxLeftZ - anchorMinZ > 0.45 && samples[i].z < maxLeftZ - 0.15) {
          leftCrestOff = samples[i + 1].offset;
          break;
        }
      }

      let rightCrestOff = samples[samples.length - 1].offset;
      let maxRightZ = anchorMinZ;
      for (let i = anchorIdx + 1; i < samples.length; i++) {
        if (samples[i].z > maxRightZ) maxRightZ = samples[i].z;
        if (maxRightZ - anchorMinZ > 0.45 && samples[i].z < maxRightZ - 0.15) {
          rightCrestOff = samples[i - 1].offset;
          break;
        }
      }

      // Search strictly between the detected Left and Right Bank Tops (or crest barriers if narrower)
      bedSearchMin = Math.max(localMinOff, -fallbackHalfCorridor);
      bedSearchMax = Math.min(localMaxOff, fallbackHalfCorridor);

      if (bedSearchMin > bedSearchMax) {
        bedSearchMin = Math.max(leftCrestOff, -10);
        bedSearchMax = Math.min(rightCrestOff, 10);
      }
    }

    // 4. Find lowest DEM elevation strictly inside [bedSearchMin, bedSearchMax]
    let lowestZ = Infinity;
    let bestLon = origLon;
    let bestLat = origLat;
    let bestOffset = 0;

    for (const s of samples) {
      if (s.offset >= bedSearchMin - 1e-4 && s.offset <= bedSearchMax + 1e-4) {
        if (
          s.z < lowestZ - 1e-4 ||
          (Math.abs(s.z - lowestZ) <= 1e-4 && Math.abs(s.offset - prevBestOffset) < Math.abs(bestOffset - prevBestOffset))
        ) {
          lowestZ = s.z;
          bestLon = s.lon;
          bestLat = s.lat;
          bestOffset = s.offset;
        }
      }
    }

    if (lowestZ === Infinity) {
      lowestZ = isNaN(origZ) ? 0 : origZ;
      bestOffset = Math.max(bedSearchMin, Math.min(bedSearchMax, 0));
      const clampedPt = getPointAtOffset(pt, bestOffset, angleLeft, angleRight);
      bestLon = clampedPt.geometry.coordinates[0];
      bestLat = clampedPt.geometry.coordinates[1];
    }

    prevBestOffset = bestOffset;
    const shiftDist = Math.abs(bestOffset);

    rawThalwegPoints.push({
      origPt: pt,
      origCoord: [origLat, origLon],
      thalwegCoord: [bestLat, bestLon],
      origElev: isNaN(origZ) ? lowestZ : origZ,
      minElev: lowestZ,
      shiftDist,
      bestOffset,
      minBoundOffset: bedSearchMin,
      maxBoundOffset: bedSearchMax,
      hasExplicitBounds: stationHasExplicitBounds,
      angleLeft,
      angleRight,
      distanceAlong: d
    });
  }

  // When Left & Right Bank Top lines exist, preserve the exact lowest elevation point between them;
  // otherwise apply gentle moving-window smoothing clamped within detected local bank bounds.
  const smoothedCoords: [number, number][] = [];
  const windowRadius = 2; // window of 5 points

  for (let i = 0; i < rawThalwegPoints.length; i++) {
    const item = rawThalwegPoints[i];
    if (item.hasExplicitBounds) {
      smoothedCoords.push(item.thalwegCoord);
      continue;
    }

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

    let sLat = sumLat / count;
    let sLon = sumLon / count;

    // Guarantee smoothed vertex never escapes the detected stream bed bounds
    const smoothedPt = turf.point([sLon, sLat]);
    const smoothedOffset = getSignedOffset(item.origPt, smoothedPt, item.angleRight);
    if (smoothedOffset < item.minBoundOffset || smoothedOffset > item.maxBoundOffset) {
      const clampedOffset = Math.max(item.minBoundOffset, Math.min(item.maxBoundOffset, smoothedOffset));
      const clampedPt = getPointAtOffset(item.origPt, clampedOffset, item.angleLeft, item.angleRight);
      sLon = clampedPt.geometry.coordinates[0];
      sLat = clampedPt.geometry.coordinates[1];
    }

    smoothedCoords.push([sLat, sLon]);
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
  const usedBankConstraints = bankConstrainedStations > 0;

  return {
    originalCoords: rawThalwegPoints.map(p => p.origCoord),
    adjustedCoords: smoothedCoords,
    totalShiftDistance: Number(avgShift.toFixed(2)),
    maxShiftDistance: Number(maxShift.toFixed(2)),
    elevationGain: Number(avgElevGain.toFixed(2)),
    pointsSampled: rawThalwegPoints.length,
    pointsShifted: shiftedCount,
    usedBankConstraints,
    method: usedBankConstraints
      ? `Tespit edilen dere yatağı (Sol-Sağ Şev Üstü) içerisinde (${bankConstrainedStations}/${rawThalwegPoints.length} kesitte yatak içi sınırlandırma, ${lateralStep}m adım) tarandı.`
      : `Otomatik dere yatağı sınırlandırması (şev kırığı ve sedde eşiği kontrollü ±${Math.min(fallbackHalfCorridor, 20)}m tarama, ${lateralStep}m adım) uygulandı.`
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
  avgBankfullWidth?: number;            // Average spillway / bankfull width in meters
  minBankfullWidth?: number;            // Minimum bankfull width in meters
  maxBankfullWidth?: number;            // Maximum bankfull width in meters
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
  centerlineX: number;
  centerlineZ: number;
  talvegX: number;
  talvegZ: number;
  bankLeftZ: number;
  bankRightZ: number;
  channelWidth: number;          // Total bank-to-bank width (W_total = distLeftFromTalveg + distRightFromTalveg)
  distLeftFromCenterline: number;// Distance from Centerline to Left Bank
  distRightFromCenterline: number;// Distance from Centerline to Right Bank
  distLeftFromTalveg: number;    // Distance from Thalweg to Left Bank
  distRightFromTalveg: number;   // Distance from Thalweg to Right Bank
  spillElevation: number;        // Lower bank elevation (Z_min_bank)
  bankfullWidth: number;         // Horizontal width at lower bank elevation (Taşma Genişliği)
  spillLeftX: number;            // Left intersection station at spill elevation
  spillRightX: number;           // Right intersection station at spill elevation
} {
  const n = profilePoints.length;
  if (n < 3) {
    const defaultX = profilePoints[0]?.x ?? 0;
    const defaultZ = profilePoints[0]?.z ?? 0;
    return {
      bankLeftX: defaultX,
      bankRightX: defaultX,
      centerlineX: defaultX,
      centerlineZ: defaultZ,
      talvegX: defaultX,
      talvegZ: defaultZ,
      bankLeftZ: defaultZ,
      bankRightZ: defaultZ,
      channelWidth: 0,
      distLeftFromCenterline: 0,
      distRightFromCenterline: 0,
      distLeftFromTalveg: 0,
      distRightFromTalveg: 0,
      spillElevation: defaultZ,
      bankfullWidth: 0,
      spillLeftX: defaultX,
      spillRightX: defaultX
    };
  }

  const minX = profilePoints[0].x;
  const maxX = profilePoints[n - 1].x;
  const totalW = maxX - minX;

  // Elevation helper for precise cross-profile interpolation
  const getElevAt = (xVal: number) => {
    if (xVal <= profilePoints[0].x) return profilePoints[0].z;
    if (xVal >= profilePoints[n - 1].x) return profilePoints[n - 1].z;
    for (let k = 0; k < n - 1; k++) {
      const p1 = profilePoints[k];
      const p2 = profilePoints[k + 1];
      if (xVal >= p1.x && xVal <= p2.x) {
        const frac = (xVal - p1.x) / Math.max(1e-6, p2.x - p1.x);
        return p1.z + frac * (p2.z - p1.z);
      }
    }
    return profilePoints[0].z;
  };

  // 1. Identify User's Dere Ekseni (Centerline) Position
  const centerlineX = (expectedCenterOffset !== undefined && !isNaN(expectedCenterOffset))
    ? Math.max(minX + 0.5, Math.min(maxX - 0.5, expectedCenterOffset))
    : (minX + maxX) / 2;
  const centerlineZ = getElevAt(centerlineX);

  // 2. Identify Channel Bed / Local Thalweg within the stream corridor around the user's Dere Ekseni
  // The stream bed MUST be located in the immediate vicinity of the digitized centerline (+/- 15-25m max),
  // NEVER in an arbitrary overbank pit or distant excavation ditch!
  const channelSearchRadius = Math.max(5.0, Math.min(totalW * 0.15, 25.0));
  const channelLeftLimit = Math.max(minX + 0.5, centerlineX - channelSearchRadius);
  const channelRightLimit = Math.min(maxX - 0.5, centerlineX + channelSearchRadius);

  let minIdx = -1;
  let minZ = Infinity;
  for (let i = 0; i < n; i++) {
    const pt = profilePoints[i];
    if (pt.x >= channelLeftLimit && pt.x <= channelRightLimit) {
      if (pt.z < minZ) {
        minZ = pt.z;
        minIdx = i;
      }
    }
  }

  // Fallback to point closest to centerlineX
  if (minIdx === -1) {
    let closestDist = Infinity;
    minIdx = 0;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(profilePoints[i].x - centerlineX);
      if (d < closestDist) {
        closestDist = d;
        minIdx = i;
      }
    }
    minZ = profilePoints[minIdx].z;
  }

  const talvegX = profilePoints[minIdx].x;
  const talvegZ = profilePoints[minIdx].z;

  // 3. Determine Left Bank Top (scan leftwards from minIdx / centerline towards profile start)
  const leftStartIdx = Math.max(1, Math.min(minIdx, n - 2));
  let bestLeftIdx = 0;
  let maxLeftScore = -999999;

  for (let i = leftStartIdx - 1; i >= 1; i--) {
    const cur = profilePoints[i];
    const nextCloserToBed = profilePoints[i + 1];
    const prevFurtherLeft = profilePoints[i - 1];

    const distFromBed = Math.abs(centerlineX - cur.x);
    if (distFromBed < Math.max(2.0, totalW * 0.02)) continue; // Minimum channel half-width
    if (distFromBed > totalW * 0.45) continue; // Do not push into extreme valley edges

    const dxInner = Math.max(0.1, nextCloserToBed.x - cur.x);
    const dxOuter = Math.max(0.1, cur.x - prevFurtherLeft.x);

    const slopeInner = (cur.z - nextCloserToBed.z) / dxInner;
    const slopeOuter = (prevFurtherLeft.z - cur.z) / dxOuter;
    const curvature = slopeInner - slopeOuter;

    const heightAboveBed = cur.z - talvegZ;
    if (heightAboveBed < -0.1) continue;

    let score = curvature * 4.0;
    if (slopeInner > 0.05 && slopeOuter <= 0.04) score += 6.0;
    if (slopeInner > 0.04 && slopeOuter < 0) score += 8.0;
    if (heightAboveBed > 0.3) score += Math.min(5.0, heightAboveBed * 1.5);

    if (score > maxLeftScore) {
      maxLeftScore = score;
      bestLeftIdx = i;
    }
  }

  // 4. Determine Right Bank Top (scan rightwards from minIdx / centerline towards profile end)
  const rightStartIdx = Math.min(n - 2, Math.max(minIdx, 1));
  let bestRightIdx = n - 1;
  let maxRightScore = -999999;

  for (let i = rightStartIdx + 1; i < n - 1; i++) {
    const cur = profilePoints[i];
    const prevCloserToBed = profilePoints[i - 1];
    const nextFurtherRight = profilePoints[i + 1];

    const distFromBed = Math.abs(cur.x - centerlineX);
    if (distFromBed < Math.max(2.0, totalW * 0.02)) continue;
    if (distFromBed > totalW * 0.45) continue;

    const dxInner = Math.max(0.1, cur.x - prevCloserToBed.x);
    const dxOuter = Math.max(0.1, nextFurtherRight.x - cur.x);

    const slopeInner = (cur.z - prevCloserToBed.z) / dxInner;
    const slopeOuter = (nextFurtherRight.z - cur.z) / dxOuter;
    const curvature = slopeInner - slopeOuter;

    const heightAboveBed = cur.z - talvegZ;
    if (heightAboveBed < -0.1) continue;

    let score = curvature * 4.0;
    if (slopeInner > 0.05 && slopeOuter <= 0.04) score += 6.0;
    if (slopeInner > 0.04 && slopeOuter < 0) score += 8.0;
    if (heightAboveBed > 0.3) score += Math.min(5.0, heightAboveBed * 1.5);

    if (score > maxRightScore) {
      maxRightScore = score;
      bestRightIdx = i;
    }
  }

  let bankLeftX = bestLeftIdx > 0 ? profilePoints[bestLeftIdx].x : minX + 5;
  let bankRightX = bestRightIdx < n - 1 ? profilePoints[bestRightIdx].x : maxX - 5;

  // Crucial: The Ana Kanal MUST enclose the user's Dere Ekseni (bankLeftX < centerlineX < bankRightX)
  const defaultHalfW = Math.min(totalW * 0.2, Math.max(6, totalW * 0.08));
  if (bankLeftX >= centerlineX - 1.5 || bankLeftX <= minX) {
    bankLeftX = Math.max(minX + 0.5, centerlineX - defaultHalfW);
  }
  if (bankRightX <= centerlineX + 1.5 || bankRightX >= maxX) {
    bankRightX = Math.min(maxX - 0.5, centerlineX + defaultHalfW);
  }

  // Ensure left < right strictly
  if (bankLeftX >= bankRightX - 2.0) {
    bankLeftX = Math.max(minX + 0.5, centerlineX - 5);
    bankRightX = Math.min(maxX - 0.5, centerlineX + 5);
  }

  // Recompute talveg strictly as the lowest elevation point between bankLeftX and bankRightX
  let finalTalvegIdx = minIdx;
  let finalTalvegZ = Infinity;
  for (let i = 0; i < n; i++) {
    const pt = profilePoints[i];
    if (pt.x >= bankLeftX && pt.x <= bankRightX) {
      if (pt.z < finalTalvegZ) {
        finalTalvegZ = pt.z;
        finalTalvegIdx = i;
      }
    }
  }
  const finalTalvegX = finalTalvegZ < Infinity ? profilePoints[finalTalvegIdx].x : talvegX;
  const resolvedTalvegZ = finalTalvegZ < Infinity ? finalTalvegZ : talvegZ;

  const bankLeftZ = getElevAt(bankLeftX);
  const bankRightZ = getElevAt(bankRightX);

  // Distances relative to the Centerline and Thalweg
  const distLeftFromCenterline = Number(Math.abs(centerlineX - bankLeftX).toFixed(2));
  const distRightFromCenterline = Number(Math.abs(bankRightX - centerlineX).toFixed(2));
  const distLeftFromTalveg = Number(Math.abs(finalTalvegX - bankLeftX).toFixed(2));
  const distRightFromTalveg = Number(Math.abs(bankRightX - finalTalvegX).toFixed(2));
  const totalChannelWidth = Number((bankRightX - bankLeftX).toFixed(2));

  // Spillway Analysis: Bankfull Spill Elevation is min(bankLeftZ, bankRightZ)
  const spillElevation = Math.min(bankLeftZ, bankRightZ);
  let spillLeftX = bankLeftX;
  if (bankLeftZ > spillElevation) {
    for (let k = finalTalvegIdx; k >= 1; k--) {
      const p1 = profilePoints[k];
      const p2 = profilePoints[k - 1];
      if (p1.z <= spillElevation && p2.z >= spillElevation) {
        const frac = (spillElevation - p1.z) / Math.max(1e-6, p2.z - p1.z);
        spillLeftX = p1.x + frac * (p2.x - p1.x);
        break;
      }
    }
  }

  let spillRightX = bankRightX;
  if (bankRightZ > spillElevation) {
    for (let k = finalTalvegIdx; k < n - 1; k++) {
      const p1 = profilePoints[k];
      const p2 = profilePoints[k + 1];
      if (p1.z <= spillElevation && p2.z >= spillElevation) {
        const frac = (spillElevation - p1.z) / Math.max(1e-6, p2.z - p1.z);
        spillRightX = p1.x + frac * (p2.x - p1.x);
        break;
      }
    }
  }

  const bankfullWidth = Number(Math.max(0.5, spillRightX - spillLeftX).toFixed(2));

  return {
    bankLeftX: Number(bankLeftX.toFixed(2)),
    bankRightX: Number(bankRightX.toFixed(2)),
    centerlineX: Number(centerlineX.toFixed(2)),
    centerlineZ: Number(centerlineZ.toFixed(2)),
    talvegX: Number(finalTalvegX.toFixed(2)),
    talvegZ: Number(resolvedTalvegZ.toFixed(2)),
    bankLeftZ: Number(bankLeftZ.toFixed(2)),
    bankRightZ: Number(bankRightZ.toFixed(2)),
    channelWidth: totalChannelWidth,
    distLeftFromCenterline,
    distRightFromCenterline,
    distLeftFromTalveg,
    distRightFromTalveg,
    spillElevation: Number(spillElevation.toFixed(2)),
    bankfullWidth,
    spillLeftX: Number(spillLeftX.toFixed(2)),
    spillRightX: Number(spillRightX.toFixed(2))
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

    // Centerline / Channel Axis geographic position
    let axisX = sec.centerlineX;
    if (axisX === undefined || isNaN(axisX)) {
      let minZ = Infinity;
      axisX = (sec.bankLeftX + sec.bankRightX) / 2;
      for (const p of sec.profile) {
        if (p.x >= sec.bankLeftX && p.x <= sec.bankRightX && p.z < minZ) {
          minZ = p.z;
          axisX = p.x;
        }
      }
    }
    const axisFrac = Math.max(0, Math.min(1, (axisX - minX) / totalW));
    const centerPt = turf.along(lineGeo, totalDistMeters * axisFrac, { units: 'meters' });
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
  const bankfullWidths: number[] = [];
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
    bankfullWidths.push(detected.bankfullWidth);
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
  const avgBankfull = bankfullWidths.length > 0 ? bankfullWidths.reduce((a, b) => a + b, 0) / bankfullWidths.length : avgWidth;
  const minBankfull = bankfullWidths.length > 0 ? Math.min(...bankfullWidths) : minWidth;
  const maxBankfull = bankfullWidths.length > 0 ? Math.max(...bankfullWidths) : maxWidth;
  const avgHeight = bankHeights.length > 0 ? bankHeights.reduce((a, b) => a + b, 0) / bankHeights.length : 1.5;

  return {
    leftBankCoords: smoothedLeft,
    rightBankCoords: smoothedRight,
    avgChannelWidth: Number(avgWidth.toFixed(2)),
    minChannelWidth: Number(minWidth.toFixed(2)),
    maxChannelWidth: Number(maxWidth.toFixed(2)),
    avgBankfullWidth: Number(avgBankfull.toFixed(2)),
    minBankfullWidth: Number(minBankfull.toFixed(2)),
    maxBankfullWidth: Number(maxBankfull.toFixed(2)),
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
  channelBedElevation: number;
  maxElevation: number;
  bankLeftX: number;
  bankRightX: number;
  centerlineX: number;
  talvegX: number;
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
  const minElevation = Math.min(...elevations);
  const channelBedElevation = computeChannelBedElevation(profile, bankLeftX, bankRightX, minElevation);

  return {
    profile,
    cutLine,
    minElevation,
    channelBedElevation,
    maxElevation: Math.max(...elevations),
    bankLeftX: Number(bankLeftX.toFixed(2)),
    bankRightX: Number(bankRightX.toFixed(2)),
    centerlineX: Number(leftLength.toFixed(2)),
    talvegX: Number(detected.talvegX.toFixed(2))
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
      channelBedElevation: sampled.channelBedElevation,
      maxElevation: sampled.maxElevation,
      bankLeftX: sampled.bankLeftX,
      bankRightX: sampled.bankRightX,
      centerlineX: sampled.centerlineX,
      talvegX: sampled.talvegX,
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
          channelBedElevation: sampled.channelBedElevation,
          maxElevation: sampled.maxElevation,
          bankLeftX: sampled.bankLeftX,
          bankRightX: sampled.bankRightX,
          centerlineX: sampled.centerlineX,
          talvegX: sampled.talvegX
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

    const origSec = sections.find(s => Math.abs(s.station - draft.station) < 1);
    updatedSections.push({
      station: draft.station,
      profile: sampled.profile,
      centerCoord: draft.centerCoord,
      cutLine: sampled.cutLine,
      minElevation: sampled.minElevation,
      channelBedElevation: sampled.channelBedElevation,
      maxElevation: sampled.maxElevation,
      bankLeftX: sampled.bankLeftX,
      bankRightX: sampled.bankRightX,
      centerlineX: sampled.centerlineX,
      talvegX: sampled.talvegX,
      nMain: origSec?.nMain,
      nLOB: origSec?.nLOB,
      nROB: origSec?.nROB,
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

function parseStationFromLabel(rawName: string | null | undefined): number | null {
  if (!rawName) return null;
  const trimmed = rawName.trim();
  // Match Km+m format like "1+250", "0+050.5", "Km 2+100"
  const kmPlusMatch = trimmed.match(/(\d+)\s*\+\s*(\d+(?:[.,]\d+)?)/);
  if (kmPlusMatch) {
    const kmPart = parseFloat(kmPlusMatch[1]);
    const mPart = parseFloat(kmPlusMatch[2].replace(',', '.'));
    if (!isNaN(kmPart) && !isNaN(mPart)) {
      return kmPart * 1000 + mPart;
    }
  }
  // Match explicit numeric with optional "m" or "km" unit
  const numMatch = trimmed.match(/(?:km\s*)?(\d+(?:[.,]\d+)?)\s*(km|m)?\b/i);
  if (numMatch) {
    const val = parseFloat(numMatch[1].replace(',', '.'));
    const unit = numMatch[2]?.toLowerCase();
    if (!isNaN(val)) {
      return unit === 'km' ? val * 1000 : val;
    }
  }
  return null;
}

export async function parseManualCrossSections(
  demFile: File,
  kmlFile: File,
  crsDef?: string,
  centerlineCoords?: [number, number][]
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
  let prevMidPt: Feature<any> | null = null;

  let centerlineGeo: Feature<LineString> | null = null;
  let clStartPt: Feature<any> | null = null;
  if (centerlineCoords && centerlineCoords.length >= 2) {
    const clLonLat = centerlineCoords.map(([lat, lon]) => [lon, lat]);
    centerlineGeo = turf.lineString(clLonLat);
    clStartPt = turf.point(clLonLat[0]);
  }

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

    const midPt = turf.along(line, lineLen / 2, { units: 'meters' });

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

    // Determine intersection & TRUE river centerline chainage (station) if Dere Ekseni is uploaded
    let centerlineX = lineLen / 2;
    let stationFromCenterline: number | null = null;
    if (centerlineGeo && clStartPt) {
      const cutStartPt = turf.point(lineCoords[0]);
      const intersect = turf.lineIntersect(line, centerlineGeo);
      if (intersect.features.length > 0) {
        const isectPt = intersect.features[0];
        const distOnCut = turf.distance(cutStartPt, isectPt, { units: 'meters' });
        if (distOnCut > 0 && distOnCut < lineLen) {
          centerlineX = distOnCut;
        }
        try {
          const sliced = turf.lineSlice(clStartPt, isectPt, centerlineGeo);
          stationFromCenterline = turf.length(sliced, { units: 'meters' });
        } catch {
          const snapped = turf.nearestPointOnLine(centerlineGeo, isectPt, { units: 'meters' });
          stationFromCenterline = snapped.properties?.location ?? null;
        }
      } else {
        // Snap midpoint perpendicularly onto river centerline to obtain true station
        const snapped = turf.nearestPointOnLine(centerlineGeo, midPt, { units: 'meters' });
        if (snapped.properties?.location != null && !isNaN(snapped.properties.location)) {
          stationFromCenterline = snapped.properties.location;
        }
      }
    }

    let station: number;
    if (stationFromCenterline !== null && !isNaN(stationFromCenterline)) {
      station = Math.round(stationFromCenterline);
    } else {
      const nameNode = el.getElementsByTagName('name')[0];
      const parsedFromName = parseStationFromLabel(nameNode?.textContent);
      if (parsedFromName !== null) {
        station = Math.round(parsedFromName);
      } else {
        if (prevMidPt) {
          cumulativeStation += turf.distance(prevMidPt, midPt, { units: 'meters' });
        }
        station = Math.round(cumulativeStation);
      }
    }
    prevMidPt = midPt;

    // Detect Talveg & Bank Stations anchored around the user's Dere Ekseni
    const detected = detectBankStationsFromProfile(rawSamples, centerlineX);
    const bankLeftX = detected.bankLeftX;
    const bankRightX = detected.bankRightX;

    const profile: ProfilePoint[] = rawSamples.map(s => {
      let type: 'LOB' | 'MAIN' | 'ROB' = 'MAIN';
      if (s.x < bankLeftX) type = 'LOB';
      else if (s.x > bankRightX) type = 'ROB';
      return { x: Number(s.x.toFixed(2)), z: Number(s.z.toFixed(2)), type };
    });

    const elevations = profile.map(p => p.z);
    const minElevation = elevations.length > 0 ? Math.min(...elevations) : 0;
    const maxElevation = elevations.length > 0 ? Math.max(...elevations) : 0;
    const channelBedElevation = computeChannelBedElevation(profile, bankLeftX, bankRightX, minElevation);

    const firstPt = lineCoords[0];
    const lastPt = lineCoords[lineCoords.length - 1];
    const centerCoordPt = turf.along(line, centerlineX, { units: 'meters' });

    sections.push({
      station,
      profile,
      centerCoord: [centerCoordPt.geometry.coordinates[1], centerCoordPt.geometry.coordinates[0]],
      cutLine: [
        [firstPt[1], firstPt[0]],
        [lastPt[1], lastPt[0]]
      ],
      minElevation,
      channelBedElevation,
      maxElevation,
      bankLeftX: Number(bankLeftX.toFixed(2)),
      bankRightX: Number(bankRightX.toFixed(2)),
      centerlineX: Number(centerlineX.toFixed(2)),
      talvegX: Number(detected.talvegX.toFixed(2))
    });
  }

  sections.sort((a, b) => a.station - b.station);
  // Guarantee strictly unique integer stations after sorting
  for (let i = 1; i < sections.length; i++) {
    if (sections[i].station <= sections[i - 1].station) {
      sections[i].station = sections[i - 1].station + 1;
    }
  }
  return sections;
}

export function calibrateSectionsWithCenterline(
  sections: CrossSection[],
  centerlineCoords: [number, number][],
  recomputeStations: boolean = false
): CrossSection[] {
  if (!sections || sections.length === 0 || !centerlineCoords || centerlineCoords.length < 2) {
    return sections;
  }
  const clLonLat = centerlineCoords.map(([lat, lon]) => [lon, lat]);
  const centerlineGeo = turf.lineString(clLonLat);
  const clStartPt = turf.point(clLonLat[0]);

  const calibrated = sections.map(sec => {
    if (!sec.cutLine || !sec.profile || sec.profile.length < 2) return sec;
    const [ptL, ptR] = sec.cutLine; // [lat, lon]
    const cutGeo = turf.lineString([[ptL[1], ptL[0]], [ptR[1], ptR[0]]]);
    const cutStartPt = turf.point([ptL[1], ptL[0]]);

    const minX = sec.profile[0].x;
    const maxX = sec.profile[sec.profile.length - 1].x;

    let centerlineX = sec.centerlineX;
    let nextStation = sec.station;
    const intersect = turf.lineIntersect(cutGeo, centerlineGeo);
    if (intersect.features.length > 0) {
      const isectPt = intersect.features[0];
      const dist = turf.distance(cutStartPt, isectPt, { units: 'meters' });
      if (dist >= minX && dist <= maxX) {
        centerlineX = Number(dist.toFixed(2));
      }
      if (recomputeStations) {
        try {
          const sliced = turf.lineSlice(clStartPt, isectPt, centerlineGeo);
          nextStation = Math.round(turf.length(sliced, { units: 'meters' }));
        } catch {
          const snapped = turf.nearestPointOnLine(centerlineGeo, isectPt, { units: 'meters' });
          if (snapped.properties?.location != null) {
            nextStation = Math.round(snapped.properties.location);
          }
        }
      }
    } else if (recomputeStations) {
      const midPt = turf.midpoint(cutStartPt, turf.point([ptR[1], ptR[0]]));
      const snapped = turf.nearestPointOnLine(centerlineGeo, midPt, { units: 'meters' });
      if (snapped.properties?.location != null) {
        nextStation = Math.round(snapped.properties.location);
      }
    }

    if (centerlineX === undefined) {
      centerlineX = Number(((minX + maxX) / 2).toFixed(2));
    }

    // Ensure banks enclose the centerline strictly
    let bankLeftX = sec.bankLeftX;
    let bankRightX = sec.bankRightX;
    const defaultHalfW = Math.max(5, (bankRightX - bankLeftX) / 2 || 10);
    if (bankLeftX >= centerlineX - 1.5) {
      bankLeftX = Math.max(minX + 0.5, centerlineX - defaultHalfW);
    }
    if (bankRightX <= centerlineX + 1.5) {
      bankRightX = Math.min(maxX - 0.5, centerlineX + defaultHalfW);
    }

    // Re-assign profile point types (LOB, MAIN, ROB)
    const newProfile = sec.profile.map(p => {
      let type: 'LOB' | 'MAIN' | 'ROB' = 'MAIN';
      if (p.x < bankLeftX) type = 'LOB';
      else if (p.x > bankRightX) type = 'ROB';
      return { ...p, type };
    });

    // Set talvegX strictly to the lowest elevation point between bankLeftX and bankRightX
    let talvegX = centerlineX;
    let minBedZ = Infinity;
    for (const p of newProfile) {
      if (p.x >= bankLeftX && p.x <= bankRightX) {
        if (p.z < minBedZ) {
          minBedZ = p.z;
          talvegX = p.x;
        }
      }
    }
    const channelBedElevation = minBedZ < Infinity ? Number(minBedZ.toFixed(2)) : sec.minElevation;

    return {
      ...sec,
      station: nextStation,
      centerlineX,
      talvegX: Number(talvegX.toFixed(2)),
      channelBedElevation,
      bankLeftX: Number(bankLeftX.toFixed(2)),
      bankRightX: Number(bankRightX.toFixed(2)),
      profile: newProfile
    };
  });

  if (recomputeStations) {
    calibrated.sort((a, b) => a.station - b.station);
    for (let i = 1; i < calibrated.length; i++) {
      if (calibrated[i].station <= calibrated[i - 1].station) {
        calibrated[i].station = calibrated[i - 1].station + 1;
      }
    }
  }
  return calibrated;
}

export interface CrossSectionGeometry {
  areaMAIN: number;
  pMAIN: number;
  wMAIN: number;
  areaLOB: number;
  pLOB: number;
  wLOB: number;
  areaROB: number;
  pROB: number;
  wROB: number;
  totalArea: number;
  totalP: number;
  totalW: number;
  waterLeftX: number;
  waterRightX: number;
  kMain: number;
  kLOB: number;
  kROB: number;
  kTotal: number;
  alpha: number;
  hydraulicDepth: number;
  hydrostaticForceMoment: number; // A * y_bar (m^3) for Momentum M = Q^2/(gA) + A*y_bar
  bedElevation: number;
  talvegX: number;
  bankLeftZ: number;
  bankRightZ: number;
  bankMinZ: number;
}

export function evaluateCrossSectionGeometry(
  section: CrossSection,
  WSE: number,
  nMain: number,
  nLOB: number,
  nROB: number
): CrossSectionGeometry {
  const profile = section.profile;
  if (!profile || profile.length < 2) {
    return {
      areaMAIN: 0, pMAIN: 0, wMAIN: 0,
      areaLOB: 0, pLOB: 0, wLOB: 0,
      areaROB: 0, pROB: 0, wROB: 0,
      totalArea: 0, totalP: 0, totalW: 0,
      waterLeftX: 0, waterRightX: 0,
      kMain: 0, kLOB: 0, kROB: 0, kTotal: 0,
      alpha: 1, hydraulicDepth: 0, hydrostaticForceMoment: 0,
      bedElevation: 0, talvegX: 0,
      bankLeftZ: 0, bankRightZ: 0, bankMinZ: 0
    };
  }

  const effMainN = Math.max(0.01, section.nMain ?? nMain);
  const effLobN = Math.max(0.01, section.nLOB ?? nLOB);
  const effRobN = Math.max(0.01, section.nROB ?? nROB);

  // Anchor on user-defined Dere Ekseni (centerlineX)
  const axisX = (section.centerlineX !== undefined && !isNaN(section.centerlineX))
    ? section.centerlineX
    : (section.bankLeftX !== undefined && section.bankRightX !== undefined && !isNaN(section.bankLeftX) && !isNaN(section.bankRightX))
      ? (section.bankLeftX + section.bankRightX) / 2
      : (profile[0].x + profile[profile.length - 1].x) / 2;

  // Validate Bank Stations around axisX
  let bLeftX = section.bankLeftX;
  let bRightX = section.bankRightX;
  if (bLeftX >= axisX - 1.0 || bRightX <= axisX + 1.0 || isNaN(bLeftX) || isNaN(bRightX)) {
    const totalW = profile[profile.length - 1].x - profile[0].x;
    const channelHalfW = Math.min(25, Math.max(6, totalW * 0.12));
    bLeftX = Math.max(profile[0].x + 0.5, axisX - channelHalfW);
    bRightX = Math.min(profile[profile.length - 1].x - 0.5, axisX + channelHalfW);
  }

  // Locate Talveg (channel bed deepest point) strictly inside the main channel [bLeftX, bRightX]
  let minIdx = -1;
  let minBedZ = Infinity;
  for (let i = 0; i < profile.length; i++) {
    const pt = profile[i];
    if (pt.x >= bLeftX && pt.x <= bRightX) {
      if (pt.z < minBedZ) {
        minBedZ = pt.z;
        minIdx = i;
      }
    }
  }

  // Fallback to point closest to axisX if no profile point lies within [bLeftX, bRightX]
  if (minIdx === -1) {
    let closestDist = Infinity;
    for (let i = 0; i < profile.length; i++) {
      const d = Math.abs(profile[i].x - axisX);
      if (d < closestDist) {
        closestDist = d;
        minIdx = i;
        minBedZ = profile[i].z;
      }
    }
  }

  const talvegX = profile[minIdx].x;
  const bedElevation = minBedZ;

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
    return bedElevation;
  };

  const bankLeftZ = getElevationAtX(bLeftX);
  const bankRightZ = getElevationAtX(bRightX);
  const bankMinZ = Math.min(bankLeftZ, bankRightZ);

  if (WSE <= bedElevation) {
    return {
      areaMAIN: 0, pMAIN: 0, wMAIN: 0,
      areaLOB: 0, pLOB: 0, wLOB: 0,
      areaROB: 0, pROB: 0, wROB: 0,
      totalArea: 0, totalP: 0, totalW: 0,
      waterLeftX: talvegX, waterRightX: talvegX,
      kMain: 0, kLOB: 0, kROB: 0, kTotal: 0,
      alpha: 1, hydraulicDepth: 0, hydrostaticForceMoment: 0,
      bedElevation, talvegX,
      bankLeftZ, bankRightZ, bankMinZ
    };
  }

  // Hydrologically connected flow boundary tracing outward from talveg
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

  let areaMAIN = 0, pMAIN = 0, wMAIN = 0;
  let areaLOB = 0, pLOB = 0, wLOB = 0;
  let areaROB = 0, pROB = 0, wROB = 0;
  let hydrostaticForceMoment = 0;

  for (let i = 0; i < profile.length - 1; i++) {
    const p1 = profile[i];
    const p2 = profile[i + 1];

    const segX1 = Math.max(p1.x, leftWetX);
    const segX2 = Math.min(p2.x, rightWetX);
    if (segX2 <= segX1) continue;

    const zSeg1 = p1.z + ((segX1 - p1.x) / Math.max(1e-6, p2.x - p1.x)) * (p2.z - p1.z);
    const zSeg2 = p1.z + ((segX2 - p1.x) / Math.max(1e-6, p2.x - p1.x)) * (p2.z - p1.z);

    const h1 = Math.max(0, WSE - zSeg1);
    const h2 = Math.max(0, WSE - zSeg2);
    const dx = segX2 - segX1;
    const dz = zSeg2 - zSeg1;
    const a = ((h1 + h2) / 2) * dx;
    const p = Math.sqrt(dx * dx + dz * dz);

    // Exact integral of 0.5 * h(x)^2 dx across linear segment
    hydrostaticForceMoment += (dx / 6) * (h1 * h1 + h1 * h2 + h2 * h2);

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

  const computeK = (A: number, P: number, n: number) => {
    if (A <= 0 || P <= 0 || n <= 0) return 0;
    return (1 / n) * A * Math.pow(A / P, 2 / 3);
  };

  const kMain = computeK(areaMAIN, pMAIN, effMainN);
  const kLOB = computeK(areaLOB, pLOB, effLobN);
  const kROB = computeK(areaROB, pROB, effRobN);
  const kTotal = kMain + kLOB + kROB;

  const totalArea = areaMAIN + areaLOB + areaROB;
  const totalP = pMAIN + pLOB + pROB;
  const totalW = wMAIN + wLOB + wROB;

  // Coriolis kinetic energy distribution coefficient:
  // alpha = (Sum(Ki^3 / Ai^2)) / (Ktotal^3 / Atotal^2)
  let alpha = 1.0;
  if (totalArea > 1e-6 && kTotal > 1e-6) {
    let sumSub = 0;
    if (areaMAIN > 1e-6 && kMain > 0) sumSub += Math.pow(kMain, 3) / (areaMAIN * areaMAIN);
    if (areaLOB > 1e-6 && kLOB > 0) sumSub += Math.pow(kLOB, 3) / (areaLOB * areaLOB);
    if (areaROB > 1e-6 && kROB > 0) sumSub += Math.pow(kROB, 3) / (areaROB * areaROB);
    const denom = Math.pow(kTotal, 3) / (totalArea * totalArea);
    if (denom > 1e-12 && sumSub > 0) {
      alpha = Math.max(1.0, Math.min(2.5, sumSub / denom));
    }
  }

  const hydraulicDepth = totalW > 1e-4 ? totalArea / totalW : Math.max(0.05, WSE - bedElevation);

  return {
    areaMAIN, pMAIN, wMAIN,
    areaLOB, pLOB, wLOB,
    areaROB, pROB, wROB,
    totalArea,
    totalP,
    totalW,
    waterLeftX: leftWetX,
    waterRightX: rightWetX,
    kMain,
    kLOB,
    kROB,
    kTotal,
    alpha,
    hydraulicDepth,
    hydrostaticForceMoment,
    bedElevation,
    talvegX,
    bankLeftZ,
    bankRightZ,
    bankMinZ
  };
}

/**
 * Computes Critical Water Surface Elevation (WSE_c) by minimizing Specific Energy
 * E(WSE) = WSE + alpha * (Q / A)^2 / (2g), which handles compound floodplain transitions robustly.
 */
export function computeCriticalDepth(
  section: CrossSection,
  Q: number,
  nMain: number,
  nLOB: number,
  nROB: number
): { criticalWSE: number; minEnergy: number } {
  const bedZ = getChannelBedElevation(section);
  const maxProfZ = section.maxElevation || Math.max(...section.profile.map(p => p.z));
  const lo = bedZ + 0.02;
  const hi = Math.max(lo + 5, maxProfZ + 20);
  const g = 9.81;

  const evalSpecE = (wse: number): number => {
    const gm = evaluateCrossSectionGeometry(section, wse, nMain, nLOB, nROB);
    const a = Math.max(1e-4, gm.totalArea);
    const v = Q / a;
    return wse + gm.alpha * ((v * v) / (2 * g));
  };

  // Coarse scan to find global minimum bracket (avoids compound bank local minima)
  const steps = 60;
  let bestWSE = lo + 0.5;
  let bestE = Infinity;
  const gridWSE: number[] = [];
  const gridE: number[] = [];
  for (let i = 0; i <= steps; i++) {
    // Non-linear spacing denser near the bed
    const t = i / steps;
    const w = lo + (hi - lo) * (t * t);
    const e = evalSpecE(w);
    gridWSE.push(w);
    gridE.push(e);
    if (e < bestE) {
      bestE = e;
      bestWSE = w;
    }
  }

  let bestIdx = gridE.indexOf(bestE);
  let a = gridWSE[Math.max(0, bestIdx - 1)];
  let b = gridWSE[Math.min(steps, bestIdx + 1)];

  // Golden-section search to refine WSE_c to ~0.001 m
  const phi = (Math.sqrt(5) - 1) / 2;
  let c = b - phi * (b - a);
  let d = a + phi * (b - a);
  let fc = evalSpecE(c);
  let fd = evalSpecE(d);

  for (let iter = 0; iter < 32; iter++) {
    if (b - a < 0.001) break;
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - phi * (b - a);
      fc = evalSpecE(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + phi * (b - a);
      fd = evalSpecE(d);
    }
  }

  const criticalWSE = (a + b) / 2;
  const minEnergy = Math.min(bestE, evalSpecE(criticalWSE));
  return {
    criticalWSE: Number(criticalWSE.toFixed(3)),
    minEnergy: Number(minEnergy.toFixed(3))
  };
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
      bankRightZ: 0,
      alpha: 1,
      criticalWSE: 0,
      flowRegime: 'subcritical',
      discharge: Q
    };
  }

  const bedZ = getChannelBedElevation(section);
  const effSlope = Math.max(0.00005, Math.abs(S0));

  let lowWSE = bedZ + 0.001;
  let highWSE = bedZ + 2.0;
  const maxAllowableZ = Math.max(...profile.map(p => p.z)) + 25;

  while (
    evaluateCrossSectionGeometry(section, highWSE, nMain, nLOB, nROB).kTotal * Math.sqrt(effSlope) < Q &&
    highWSE < maxAllowableZ
  ) {
    highWSE += 2.0;
  }

  let bestWSE = highWSE;
  let finalGeom = evaluateCrossSectionGeometry(section, highWSE, nMain, nLOB, nROB);

  for (let iter = 0; iter < 65; iter++) {
    const midWSE = (lowWSE + highWSE) / 2;
    const geom = evaluateCrossSectionGeometry(section, midWSE, nMain, nLOB, nROB);
    const qCalc = geom.kTotal * Math.sqrt(effSlope);
    bestWSE = midWSE;
    finalGeom = geom;

    if (Math.abs(qCalc - Q) < 0.005 || (highWSE - lowWSE) < 0.0005) {
      break;
    }

    if (qCalc < Q) {
      lowWSE = midWSE;
    } else {
      highWSE = midWSE;
    }
  }

  const finalArea = finalGeom.totalArea;
  const finalVel = finalArea > 0 ? Q / finalArea : 0;
  const hydraulicDepth = finalGeom.hydraulicDepth;
  const froudeNumber = hydraulicDepth > 0
    ? finalVel / Math.sqrt((9.81 * hydraulicDepth) / Math.max(1, finalGeom.alpha))
    : 0;
  const velocityHead = finalGeom.alpha * ((finalVel * finalVel) / (2 * 9.81));
  const energyElevation = bestWSE + velocityHead;
  const isOverbank = bestWSE > finalGeom.bankMinZ && (finalGeom.areaLOB > 0.05 || finalGeom.areaROB > 0.05);

  return {
    waterElevation: bestWSE,
    maxDepth: Math.max(0, bestWSE - bedZ),
    area: finalArea,
    velocity: finalVel,
    wettedPerimeter: finalGeom.totalP,
    topWidth: finalGeom.totalW,
    froudeNumber,
    isOverbank,
    energyElevation,
    bedElevation: bedZ,
    waterLeftX: finalGeom.waterLeftX,
    waterRightX: finalGeom.waterRightX,
    overbankAreaLOB: finalGeom.areaLOB,
    overbankAreaROB: finalGeom.areaROB,
    bankLeftZ: finalGeom.bankLeftZ,
    bankRightZ: finalGeom.bankRightZ,
    alpha: finalGeom.alpha,
    flowRegime: froudeNumber > 1.02 ? 'supercritical' : froudeNumber < 0.98 ? 'subcritical' : 'critical',
    discharge: Q
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

  let clGeo: Feature<LineString> | null = null;
  if (centerlineCoords && centerlineCoords.length >= 2) {
    clGeo = turf.lineString(centerlineCoords.map(([lat, lon]) => [lon, lat]));
  }

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

    let name = `Sanat Yapısı ${i + 1}`;
    const nameNode = el.getElementsByTagName('name')[0];
    if (nameNode && nameNode.textContent?.trim()) {
      name = nameNode.textContent.trim();
    }

    let type: StructureType = 'bridge';
    const lowerName = name.toLowerCase();
    if (lowerName.includes('menfez') || lowerName.includes('culvert') || lowerName.includes('kutu')) {
      type = 'box_culvert';
    } else if (lowerName.includes('boru') || lowerName.includes('pipe')) {
      type = 'pipe_culvert';
    }

    let matchedStation = i * 200 + 100;
    if (clGeo) {
      const snapped = turf.nearestPointOnLine(clGeo, turf.point([lon, lat]), { units: 'meters' });
      if (snapped.properties?.location != null && !isNaN(snapped.properties.location)) {
        matchedStation = Math.round(snapped.properties.location);
      }
    }

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
            if (!clGeo) matchedStation = sec.station;
            refBedElevation = getChannelBedElevation(sec);
          }
        }
      }
    }

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

  structures.sort((a, b) => a.station - b.station);
  return structures;
}

export function computeStructureHydraulics(
  structure: HydraulicStructure,
  tailwaterWSE: number,
  bedElevation: number,
  Q: number
): StructureHydraulicResult {
  const effBed = structure.invertElevation != null && !isNaN(structure.invertElevation)
    ? Math.max(bedElevation, structure.invertElevation)
    : bedElevation;
  const B_net = Math.max(1, structure.openingWidth - (structure.pierCount * structure.pierWidth));
  const H_open = Math.max(0.5, structure.lowChordElevation - effBed);
  const A_open = B_net * H_open * Math.max(1, structure.barrelCount);
  const Cd = structure.orificeCoefficient || 0.8;
  const Cw = structure.weirCoefficient || 1.7;
  const g = 9.81;

  let flowState: 'free' | 'pressure' | 'overtopping' = 'free';
  let upstreamWSE = tailwaterWSE;
  let isOvertopped = false;
  let weirDischarge = 0;
  let culvertDischarge = Q;

  // Case 1: Low Flow (Free Surface) - Yarnell pier contraction / momentum headloss
  const effDepth = Math.max(0.2, Math.min(H_open, tailwaterWSE - effBed));
  const flowAreaFree = Math.max(0.5, B_net * effDepth * Math.max(1, structure.barrelCount));

  if (tailwaterWSE < structure.lowChordElevation - 0.15) {
    const V_through = Q / flowAreaFree;
    const froude2 = (V_through * V_through) / (g * Math.max(0.2, effDepth));
    const blockageRatio = Math.min(0.45, (structure.pierCount * structure.pierWidth) / Math.max(1, structure.openingWidth));
    const K_yarnell = 1.05;
    const dH_pier = Math.max(
      0.02,
      effDepth * K_yarnell * (K_yarnell + 5 * froude2 - 0.6) * (blockageRatio + 15 * blockageRatio * blockageRatio * blockageRatio * blockageRatio) * froude2
    );
    const expansionLoss = 0.25 * ((V_through * V_through) / (2 * g));
    upstreamWSE = tailwaterWSE + Math.min(2.5, dH_pier + expansionLoss);

    if (upstreamWSE >= structure.lowChordElevation) {
      flowState = 'pressure';
    } else {
      flowState = 'free';
    }
  } else {
    // Case 2: Pressure Flow (Orifice equation)
    const dH_orifice = Math.pow(Q, 2) / (2 * g * Math.pow(Cd * A_open, 2));
    upstreamWSE = Math.max(structure.lowChordElevation + 0.05, tailwaterWSE + dH_orifice);
    flowState = 'pressure';
  }

  // Case 3: Overtopping / Combined Orifice + Broad-Crested Weir over Road Deck (bisection energy balance)
  if (upstreamWSE > structure.roadElevation) {
    isOvertopped = true;
    flowState = 'overtopping';

    const roadWidth = Math.max(10, structure.openingWidth * 1.5);
    const submergenceCoeff = (hw: number) => {
      const tw = tailwaterWSE - structure.roadElevation;
      const head = Math.max(0.01, hw - structure.roadElevation);
      if (tw <= 0 || tw / head <= 0.67) return 1.0;
      const ratio = Math.min(0.99, tw / head);
      return Math.max(0.15, 1 - Math.pow((ratio - 0.67) / 0.33, 1.5));
    };

    const evalCombinedQ = (hw: number): { qOrf: number; qWeir: number } => {
      const hOrf = Math.max(0.05, hw - Math.max(tailwaterWSE, (structure.lowChordElevation + effBed) * 0.5));
      const qOrf = Cd * A_open * Math.sqrt(2 * g * hOrf);
      const hWeir = Math.max(0, hw - structure.roadElevation);
      const qWeir = Cw * submergenceCoeff(hw) * roadWidth * Math.pow(hWeir, 1.5);
      return { qOrf, qWeir };
    };

    let lo = structure.roadElevation;
    let hi = structure.roadElevation + 10;
    while (lo + 0.001 < hi) {
      const { qOrf, qWeir } = evalCombinedQ(hi);
      if (qOrf + qWeir >= Q || hi > structure.roadElevation + 30) break;
      hi += 5;
    }

    let solvedHW = hi;
    for (let it = 0; it < 36; it++) {
      const mid = (lo + hi) / 2;
      const { qOrf, qWeir } = evalCombinedQ(mid);
      solvedHW = mid;
      if (Math.abs(qOrf + qWeir - Q) < 0.01 || (hi - lo) < 0.001) {
        culvertDischarge = qOrf;
        weirDischarge = qWeir;
        break;
      }
      if (qOrf + qWeir < Q) lo = mid;
      else hi = mid;
      culvertDischarge = qOrf;
      weirDischarge = qWeir;
    }
    upstreamWSE = solvedHW;
  }

  const backwaterRise = Math.max(0, upstreamWSE - tailwaterWSE);
  const freeboard = structure.lowChordElevation - upstreamWSE;
  const throughVelocity = culvertDischarge / Math.max(0.5, flowState === 'free' ? flowAreaFree : A_open);

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

function buildRoutingResultFromGeom(
  sec: CrossSection,
  wse: number,
  q: number,
  geom: CrossSectionGeometry,
  criticalWSE: number,
  flowRegime: 'subcritical' | 'critical' | 'supercritical' | 'jump',
  structureEffect?: RoutingResult['structureEffect']
): RoutingResult {
  const bedZ = geom.bedElevation;
  const area = geom.totalArea;
  const vel = area > 1e-4 ? q / area : 0;
  const hydDepth = Math.max(0.05, geom.hydraulicDepth);
  const froude = (hydDepth > 0 && area > 1e-4)
    ? vel / Math.sqrt((9.81 * hydDepth) / Math.max(1, geom.alpha))
    : 0;
  const velocityHead = geom.alpha * ((vel * vel) / (2 * 9.81));
  const energyElevation = wse + velocityHead;
  const isOverbank = wse > geom.bankMinZ && (geom.areaLOB > 0.05 || geom.areaROB > 0.05);

  return {
    station: sec.station,
    waterElevation: wse,
    maxDepth: Math.max(0, wse - bedZ),
    area,
    velocity: vel,
    wettedPerimeter: geom.totalP,
    topWidth: Math.max(0.5, geom.totalW),
    froudeNumber: froude,
    isOverbank,
    energyElevation,
    bedElevation: bedZ,
    waterLeftX: geom.waterLeftX,
    waterRightX: geom.waterRightX,
    overbankAreaLOB: geom.areaLOB,
    overbankAreaROB: geom.areaROB,
    bankLeftZ: geom.bankLeftZ,
    bankRightZ: geom.bankRightZ,
    discharge: q,
    alpha: Number(geom.alpha.toFixed(3)),
    criticalWSE,
    flowRegime,
    ...(structureEffect ? { structureEffect } : {})
  };
}

function mapStructuresToSections(
  sections: CrossSection[],
  structures: HydraulicStructure[]
): Map<number, HydraulicStructure[]> {
  const map = new Map<number, HydraulicStructure[]>();
  const active = structures.filter(s => s.isActive);
  if (sections.length === 0 || active.length === 0) return map;

  for (const struct of active) {
    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < sections.length; i++) {
      const diff = Math.abs(sections[i].station - struct.station);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    const existing = map.get(bestIdx) || [];
    existing.push(struct);
    map.set(bestIdx, existing);
  }
  return map;
}

/**
 * 1D Mixed-Regime Standard Step Backwater & Energy Equation Solver
 * - Uses Coriolis energy coefficient alpha
 * - Removes artificial WSE clamp
 * - Integrates hydraulic structures directly into the energy sweep
 * - Solves both subcritical (downstream -> upstream) and supercritical (upstream -> downstream)
 *   branches and resolves hydraulic jumps using Specific Force conservation.
 */
export function solveStandardStepBackwater(
  sections: CrossSection[],
  discharges: number | number[],
  nMain: number,
  nLOB: number,
  nROB: number,
  S0: number,
  structures: HydraulicStructure[] = []
): RoutingResult[] {
  if (sections.length === 0) return [];

  const getQ = (idx: number): number => {
    if (Array.isArray(discharges)) {
      return discharges[idx] !== undefined ? Math.max(0.5, discharges[idx]) : 100;
    }
    return Math.max(0.5, discharges);
  };

  // 1. Precompute baseline normal depths & critical elevations
  const critData = sections.map((sec, idx) => computeCriticalDepth(sec, getQ(idx), nMain, nLOB, nROB));
  const normalResults: RoutingResult[] = sections.map((sec, idx) => {
    const q = getQ(idx);
    const nd = computeNormalDepth(sec, q, nMain, nLOB, nROB, S0);
    return {
      station: sec.station,
      ...nd,
      criticalWSE: critData[idx].criticalWSE,
      discharge: q
    };
  });

  if (sections.length === 1) {
    return normalResults;
  }

  const N = sections.length;
  const g = 9.81;
  const isForward = detectFlowDirection(sections); // true => 0 is upstream, N-1 is downstream

  // Upstream -> Downstream ordering
  const forwardOrder: number[] = [];
  if (isForward) {
    for (let i = 0; i < N; i++) forwardOrder.push(i);
  } else {
    for (let i = N - 1; i >= 0; i--) forwardOrder.push(i);
  }
  // Downstream -> Upstream ordering
  const reverseOrder = [...forwardOrder].reverse();

  const structMap = mapStructuresToSections(sections, structures);

  // --- PASS A: Subcritical Backwater Sweep (Downstream -> Upstream) ---
  const subWSE = new Float64Array(N);
  const subForce = new Float64Array(N);
  const subStructEffect = new Map<number, RoutingResult['structureEffect']>();
  const supercriticalForced = new Uint8Array(N);

  const dsIdx0 = reverseOrder[0];
  const dsInitWSE = Math.max(normalResults[dsIdx0].waterElevation, critData[dsIdx0].criticalWSE);
  subWSE[dsIdx0] = dsInitWSE;
  const dsGeom0 = evaluateCrossSectionGeometry(sections[dsIdx0], dsInitWSE, nMain, nLOB, nROB);
  subForce[dsIdx0] = (getQ(dsIdx0) * getQ(dsIdx0)) / (g * Math.max(0.05, dsGeom0.totalArea)) + dsGeom0.hydrostaticForceMoment;

  for (let step = 1; step < reverseOrder.length; step++) {
    const uIdx = reverseOrder[step];
    const dIdx = reverseOrder[step - 1];
    const secU = sections[uIdx];
    const secD = sections[dIdx];
    const qU = getQ(uIdx);
    const qD = getQ(dIdx);

    const wseD = subWSE[dIdx];
    const geomD = evaluateCrossSectionGeometry(secD, wseD, nMain, nLOB, nROB);
    const aD = Math.max(0.05, geomD.totalArea);
    const vD = qD / aD;
    const vHeadD = geomD.alpha * ((vD * vD) / (2 * g));
    const E_d = wseD + vHeadD;
    const Sf_d = Math.pow(qD / Math.max(0.05, geomD.kTotal), 2);
    const dx = Math.max(1, Math.abs(secU.station - secD.station));
    const critU = critData[uIdx].criticalWSE;
    const bedU = getChannelBedElevation(secU);

    // Integrate structure directly into step if present on uIdx
    const structsAtU = structMap.get(uIdx);
    let structUpstreamWSE = -Infinity;
    if (structsAtU && structsAtU.length > 0) {
      let currentTW = wseD;
      for (const st of structsAtU) {
        const sHyd = computeStructureHydraulics(st, currentTW, bedU, qU);
        if (sHyd.upstreamWSE > structUpstreamWSE) {
          structUpstreamWSE = sHyd.upstreamWSE;
          subStructEffect.set(uIdx, {
            structureName: st.name,
            flowState: sHyd.flowState,
            backwaterRise: Number(sHyd.backwaterRise.toFixed(3))
          });
        }
        currentTW = sHyd.upstreamWSE;
      }
    }

    const evalEnergyDiff = (wseCand: number): number => {
      const geomU = evaluateCrossSectionGeometry(secU, wseCand, nMain, nLOB, nROB);
      const aU = Math.max(0.05, geomU.totalArea);
      const vU = qU / aU;
      const vHeadU = geomU.alpha * ((vU * vU) / (2 * g));
      const Eu = wseCand + vHeadU;
      const Sf_u = Math.pow(qU / Math.max(0.05, geomU.kTotal), 2);
      const Sf_bar = (Sf_d + Sf_u) / 2;
      const deltaVhead = vHeadU - vHeadD;
      const lossCoeff = deltaVhead >= 0 ? 0.1 : 0.3;
      return Eu - (E_d + Sf_bar * dx + lossCoeff * Math.abs(deltaVhead));
    };

    const diffAtCrit = evalEnergyDiff(critU);
    let targetWSE: number;

    if (diffAtCrit > 0.002 && structUpstreamWSE <= critU) {
      // Required downstream+friction energy is less than minimum critical specific energy at U:
      // Flow passes through critical depth (chute/steep drop) -> mark supercritical candidate
      targetWSE = critU;
      supercriticalForced[uIdx] = 1;
    } else {
      let lowW = critU;
      let highW = Math.max(lowW + 2.0, normalResults[uIdx].waterElevation + 3.0, wseD + 3.0);
      while (evalEnergyDiff(highW) < 0 && highW < bedU + 40) {
        highW += 3.0;
      }
      let solvedWSE = highW;
      for (let iter = 0; iter < 48; iter++) {
        const mid = (lowW + highW) / 2;
        const diff = evalEnergyDiff(mid);
        solvedWSE = mid;
        if (Math.abs(diff) < 0.002 || (highW - lowW) < 0.0005) break;
        if (diff < 0) lowW = mid;
        else highW = mid;
      }
      targetWSE = Math.max(critU, solvedWSE);
    }

    if (structUpstreamWSE > targetWSE) {
      targetWSE = structUpstreamWSE;
      supercriticalForced[uIdx] = 0;
    }

    subWSE[uIdx] = targetWSE;
    const gU = evaluateCrossSectionGeometry(secU, targetWSE, nMain, nLOB, nROB);
    subForce[uIdx] = (qU * qU) / (g * Math.max(0.05, gU.totalArea)) + gU.hydrostaticForceMoment;
  }

  // --- PASS B: Supercritical Forward Sweep (Upstream -> Downstream) ---
  const supWSE = new Float64Array(N);
  const supForce = new Float64Array(N);
  const hasSupercritical = new Uint8Array(N);

  const usIdx0 = forwardOrder[0];
  if (normalResults[usIdx0].froudeNumber > 1.02 || supercriticalForced[usIdx0] === 1) {
    supWSE[usIdx0] = Math.min(critData[usIdx0].criticalWSE - 0.01, normalResults[usIdx0].waterElevation);
    hasSupercritical[usIdx0] = 1;
    const g0 = evaluateCrossSectionGeometry(sections[usIdx0], supWSE[usIdx0], nMain, nLOB, nROB);
    supForce[usIdx0] = (getQ(usIdx0) * getQ(usIdx0)) / (g * Math.max(0.05, g0.totalArea)) + g0.hydrostaticForceMoment;
  }

  for (let step = 1; step < forwardOrder.length; step++) {
    const dIdx = forwardOrder[step];
    const uIdx = forwardOrder[step - 1];
    const secU = sections[uIdx];
    const secD = sections[dIdx];
    const qU = getQ(uIdx);
    const qD = getQ(dIdx);
    const bedD = getChannelBedElevation(secD);
    const critD = critData[dIdx].criticalWSE;

    // Start supercritical branch if upstream is supercritical OR normal depth at dIdx is supercritical
    const canStartFromU = hasSupercritical[uIdx] === 1 || supercriticalForced[uIdx] === 1;
    if (!canStartFromU && normalResults[dIdx].froudeNumber <= 1.02) continue;

    // Structures force subcritical pool upstream; clear supercritical jump past bridge/culvert unless unsubmerged
    if (subStructEffect.has(dIdx)) continue;

    const startWSE_u = hasSupercritical[uIdx] === 1 ? supWSE[uIdx] : critData[uIdx].criticalWSE;
    const geomU = evaluateCrossSectionGeometry(secU, startWSE_u, nMain, nLOB, nROB);
    const aU = Math.max(0.05, geomU.totalArea);
    const vU = qU / aU;
    const vHeadU = geomU.alpha * ((vU * vU) / (2 * g));
    const E_u = startWSE_u + vHeadU;
    const Sf_u = Math.pow(qU / Math.max(0.05, geomU.kTotal), 2);
    const dx = Math.max(1, Math.abs(secD.station - secU.station));

    // On supercritical branch (bedD < wse < critD), E decreases as wse increases!
    const evalSuperEnergyDiff = (wseCand: number): number => {
      const geomD = evaluateCrossSectionGeometry(secD, wseCand, nMain, nLOB, nROB);
      const aD = Math.max(0.05, geomD.totalArea);
      const vD = qD / aD;
      const vHeadD = geomD.alpha * ((vD * vD) / (2 * g));
      const Ed = wseCand + vHeadD;
      const Sf_d = Math.pow(qD / Math.max(0.05, geomD.kTotal), 2);
      const Sf_bar = (Sf_u + Sf_d) / 2;
      const deltaVhead = vHeadD - vHeadU;
      const lossCoeff = deltaVhead >= 0 ? 0.1 : 0.3;
      return (Ed + Sf_bar * dx + lossCoeff * Math.abs(deltaVhead)) - E_u;
    };

    const lo = bedD + 0.04;
    const hi = Math.max(lo + 0.02, critD - 0.005);
    const diffHi = evalSuperEnergyDiff(hi);
    if (diffHi <= 0) {
      let lowW = lo;
      let highW = hi;
      let solvedSup = highW;
      for (let it = 0; it < 42; it++) {
        const mid = (lowW + highW) / 2;
        const dVal = evalSuperEnergyDiff(mid);
        solvedSup = mid;
        if (Math.abs(dVal) < 0.002 || (highW - lowW) < 0.0005) break;
        // Supercritical: higher WSE -> lower E -> lower (Ed + loss)
        if (dVal > 0) lowW = mid;
        else highW = mid;
      }
      supWSE[dIdx] = solvedSup;
      hasSupercritical[dIdx] = 1;
      const gD = evaluateCrossSectionGeometry(secD, solvedSup, nMain, nLOB, nROB);
      supForce[dIdx] = (qD * qD) / (g * Math.max(0.05, gD.totalArea)) + gD.hydrostaticForceMoment;
    }
  }

  // --- PASS C: Specific Force Momentum Comparison & Hydraulic Jump Detection ---
  const finalResults: RoutingResult[] = new Array(N);
  let prevWasSuper = false;
  for (let step = 0; step < forwardOrder.length; step++) {
    const idx = forwardOrder[step];
    const sec = sections[idx];
    const q = getQ(idx);
    const critWSE = critData[idx].criticalWSE;

    let chosenWSE = subWSE[idx];
    let regime: 'subcritical' | 'critical' | 'supercritical' | 'jump' = 'subcritical';

    if (hasSupercritical[idx] === 1 && !subStructEffect.has(idx)) {
      if (supForce[idx] > subForce[idx] * 1.005 || supercriticalForced[idx] === 1) {
        chosenWSE = supWSE[idx];
        regime = 'supercritical';
        prevWasSuper = true;
      } else {
        chosenWSE = subWSE[idx];
        regime = prevWasSuper ? 'jump' : 'subcritical';
        prevWasSuper = false;
      }
    } else {
      if (Math.abs(chosenWSE - critWSE) <= 0.03) {
        regime = 'critical';
      } else if (prevWasSuper) {
        regime = 'jump';
      }
      prevWasSuper = false;
    }

    const geom = evaluateCrossSectionGeometry(sec, chosenWSE, nMain, nLOB, nROB);
    finalResults[idx] = buildRoutingResultFromGeom(
      sec,
      chosenWSE,
      q,
      geom,
      critWSE,
      regime,
      subStructEffect.get(idx)
    );
  }

  return finalResults;
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
  if (sections.length === 0) {
    return { results: [], structureResults: [] };
  }

  // Integrated 1D Mixed-Regime Standard Step + Direct Structure Coupling
  const results = solveStandardStepBackwater(sections, peakFlow, nMain, nLOB, nROB, S0, structures);

  const activeStructures = structures.filter(s => s.isActive);
  if (activeStructures.length === 0) {
    return { results, structureResults: [] };
  }

  const isForward = detectFlowDirection(sections);
  const structureResults: StructureHydraulicResult[] = activeStructures.map(struct => {
    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < sections.length; i++) {
      const diff = Math.abs(sections[i].station - struct.station);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    const dsNeighborIdx = isForward
      ? Math.min(sections.length - 1, closestIdx + 1)
      : Math.max(0, closestIdx - 1);
    const tailwater = results[dsNeighborIdx]?.waterElevation ?? results[closestIdx].waterElevation;
    const bedZ = getChannelBedElevation(sections[closestIdx]);
    const hyd = computeStructureHydraulics(struct, tailwater, bedZ, peakFlow);
    return {
      ...hyd,
      upstreamWSE: Math.max(hyd.upstreamWSE, results[closestIdx].waterElevation)
    };
  });

  return { results, structureResults };
}

/**
 * Generate a realistic synthetic flood hydrograph (SCS / Gamma distribution style)
 */
export function generateSyntheticHydrograph(
  peakFlow: number,
  simDuration: number
): { time: number; flow: number }[] {
  const points: { time: number; flow: number }[] = [];
  const totalHours = Math.max(6, Math.min(168, Math.round(simDuration)));
  const tPeak = Math.max(2, Math.round(totalHours * 0.4));
  const baseFlow = Math.max(2, Math.round(peakFlow * 0.12));

  for (let t = 0; t <= totalHours; t += (totalHours > 48 ? 2 : 1)) {
    let q = baseFlow;
    if (t <= tPeak) {
      const frac = t / tPeak;
      q = baseFlow + (peakFlow - baseFlow) * Math.pow(frac, 2.2);
    } else {
      const k = 2.5 / (totalHours - tPeak);
      const decay = Math.exp(-k * (t - tPeak));
      q = baseFlow + (peakFlow - baseFlow) * decay;
    }
    points.push({ time: t, flow: Math.max(baseFlow, Math.round(q * 10) / 10) });
  }

  return points;
}

interface HydTable {
  levels: Float64Array;
  A: Float64Array;
  B: Float64Array;
  K: Float64Array;
  alpha: Float64Array;
  bedZ: number;
}

function buildSectionHydraulicTable(
  sec: CrossSection,
  nMain: number,
  nLOB: number,
  nROB: number
): HydTable {
  const bedZ = getChannelBedElevation(sec);
  const maxProfZ = sec.maxElevation || Math.max(...sec.profile.map(p => p.z));
  const span = Math.max(8, (maxProfZ - bedZ) + 18);
  const count = 48;
  const levels = new Float64Array(count);
  const A = new Float64Array(count);
  const B = new Float64Array(count);
  const K = new Float64Array(count);
  const alpha = new Float64Array(count);

  for (let i = 0; i < count; i++) {
    const frac = i / (count - 1);
    const wse = bedZ + 0.02 + span * Math.pow(frac, 1.35);
    const gm = evaluateCrossSectionGeometry(sec, wse, nMain, nLOB, nROB);
    levels[i] = wse;
    A[i] = Math.max(0.05, gm.totalArea);
    B[i] = Math.max(0.5, gm.totalW);
    K[i] = Math.max(0.05, gm.kTotal);
    alpha[i] = gm.alpha;
  }

  return { levels, A, B, K, alpha, bedZ };
}

function lookupHydTable(
  tbl: HydTable,
  wse: number
): { A: number; B: number; K: number; alpha: number } {
  const n = tbl.levels.length;
  if (wse <= tbl.levels[0]) {
    return { A: tbl.A[0], B: tbl.B[0], K: tbl.K[0], alpha: tbl.alpha[0] };
  }
  const last = n - 1;
  if (wse >= tbl.levels[last]) {
    const dh = wse - tbl.levels[last];
    const extraA = tbl.B[last] * dh;
    const totA = tbl.A[last] + extraA;
    const slopeK = (tbl.K[last] - tbl.K[last - 1]) / Math.max(1e-4, tbl.levels[last] - tbl.levels[last - 1]);
    return {
      A: totA,
      B: tbl.B[last],
      K: tbl.K[last] + Math.max(0, slopeK) * dh,
      alpha: tbl.alpha[last]
    };
  }
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (tbl.levels[mid] <= wse) lo = mid;
    else hi = mid;
  }
  const f = (wse - tbl.levels[lo]) / Math.max(1e-6, tbl.levels[hi] - tbl.levels[lo]);
  return {
    A: tbl.A[lo] + f * (tbl.A[hi] - tbl.A[lo]),
    B: tbl.B[lo] + f * (tbl.B[hi] - tbl.B[lo]),
    K: tbl.K[lo] + f * (tbl.K[hi] - tbl.K[lo]),
    alpha: tbl.alpha[lo] + f * (tbl.alpha[hi] - tbl.alpha[lo])
  };
}

/**
 * Solves A * x = b for a banded square matrix (full dense array size N*N with small N, partial pivoting)
 * Optimized via sparse/banded skip over zeros since Preissmann 4-point matrix has half-bandwidth 3.
 */
function solveBandedLinearSystem(mat: Float64Array, rhs: Float64Array, n: number): Float64Array {
  const bw = 4; // Preissmann bandwidth <= 3; keep margin of 4 for row pivoting
  for (let k = 0; k < n; k++) {
    let pivotRow = k;
    let maxVal = Math.abs(mat[k * n + k]);
    const rLimit = Math.min(n, k + bw + 1);
    for (let r = k + 1; r < rLimit; r++) {
      const v = Math.abs(mat[r * n + k]);
      if (v > maxVal) {
        maxVal = v;
        pivotRow = r;
      }
    }
    if (maxVal < 1e-12) continue;
    if (pivotRow !== k) {
      const cLimit = Math.min(n, k + 2 * bw + 1);
      for (let c = k; c < cLimit; c++) {
        const tmp = mat[k * n + c];
        mat[k * n + c] = mat[pivotRow * n + c];
        mat[pivotRow * n + c] = tmp;
      }
      const tmpB = rhs[k];
      rhs[k] = rhs[pivotRow];
      rhs[pivotRow] = tmpB;
    }
    const diag = mat[k * n + k];
    const cMax = Math.min(n, k + 2 * bw + 1);
    for (let r = k + 1; r < rLimit; r++) {
      const factor = mat[r * n + k] / diag;
      if (Math.abs(factor) < 1e-14) continue;
      mat[r * n + k] = 0;
      for (let c = k + 1; c < cMax; c++) {
        mat[r * n + c] -= factor * mat[k * n + c];
      }
      rhs[r] -= factor * rhs[k];
    }
  }
  const sol = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let sum = rhs[r];
    const cMax = Math.min(n, r + 2 * bw + 1);
    for (let c = r + 1; c < cMax; c++) {
      sum -= mat[r * n + c] * sol[c];
    }
    const diag = mat[r * n + r];
    sol[r] = Math.abs(diag) > 1e-12 ? sum / diag : 0;
  }
  return sol;
}

/**
 * 1D Unsteady Preissmann 4-Point Implicit Saint-Venant Solver
 * Solves conservation of mass & momentum dynamically with storage attenuation and coupled structures.
 */
export function runDynamicRouting(
  sections: CrossSection[],
  hydrograph: { time: number; flow: number }[],
  peakFlow: number,
  simDuration: number,
  nMain: number,
  nLOB: number,
  nROB: number,
  S0: number,
  structures: HydraulicStructure[] = []
): DynamicRoutingResult {
  if (sections.length === 0) {
    return {
      peakResults: [],
      structureResults: [],
      timeSteps: [],
      peakTimeHours: 0,
      maxFloodAreaM2: 0,
      upstreamHydrograph: [],
      downstreamHydrograph: []
    };
  }

  let hydroPoints = hydrograph && hydrograph.length >= 2
    ? [...hydrograph]
    : generateSyntheticHydrograph(peakFlow, simDuration);
  hydroPoints.sort((a, b) => a.time - b.time);

  const maxT = Math.max(simDuration, hydroPoints[hydroPoints.length - 1].time);
  const getInflowAtT = (t: number): number => {
    if (t <= hydroPoints[0].time) return Math.max(0.5, hydroPoints[0].flow);
    if (t >= hydroPoints[hydroPoints.length - 1].time) return Math.max(0.5, hydroPoints[hydroPoints.length - 1].flow);
    for (let i = 0; i < hydroPoints.length - 1; i++) {
      const p1 = hydroPoints[i];
      const p2 = hydroPoints[i + 1];
      if (t >= p1.time && t <= p2.time) {
        const frac = (t - p1.time) / Math.max(1e-6, p2.time - p1.time);
        return Math.max(0.5, p1.flow + frac * (p2.flow - p1.flow));
      }
    }
    return Math.max(0.5, hydroPoints[0].flow);
  };

  // Fallback for 1 section
  if (sections.length === 1) {
    const reportIntervalH = maxT > 48 ? 2 : 1;
    const steps: DynamicTimeStepResult[] = [];
    const upH: { time: number; flow: number }[] = [];
    const dnH: { time: number; flow: number }[] = [];
    let bestRes: RoutingResult | null = null;
    for (let t = 0; t <= maxT; t += reportIntervalH) {
      const q = getInflowAtT(t);
      const { results, structureResults } = runRouting(sections, q, nMain, nLOB, nROB, S0, structures);
      upH.push({ time: t, flow: Math.round(q * 10) / 10 });
      dnH.push({ time: t, flow: Math.round(q * 10) / 10 });
      steps.push({
        timeHours: t,
        timeFormatted: `Saat ${String(t).padStart(2, '0')}:00`,
        inflowQ: Math.round(q * 10) / 10,
        outflowQ: Math.round(q * 10) / 10,
        results,
        structureResults
      });
      if (!bestRes || results[0].waterElevation > bestRes.waterElevation) {
        bestRes = results[0];
      }
    }
    return {
      peakResults: bestRes ? [bestRes] : [],
      structureResults: steps[0]?.structureResults || [],
      timeSteps: steps,
      peakTimeHours: 0,
      maxFloodAreaM2: 0,
      upstreamHydrograph: upH,
      downstreamHydrograph: dnH
    };
  }

  const N = sections.length;
  const isForward = detectFlowDirection(sections);
  const flowOrder: number[] = [];
  if (isForward) {
    for (let i = 0; i < N; i++) flowOrder.push(i);
  } else {
    for (let i = N - 1; i >= 0; i--) flowOrder.push(i);
  }

  const orderedSecs = flowOrder.map(idx => sections[idx]);
  const tables = orderedSecs.map(sec => buildSectionHydraulicTable(sec, nMain, nLOB, nROB));
  const reachDx = new Float64Array(N - 1);
  for (let j = 0; j < N - 1; j++) {
    reachDx[j] = Math.max(5, Math.abs(orderedSecs[j + 1].station - orderedSecs[j].station));
  }

  // Map active structures onto ordered reach index j (link between j and j+1, or node j)
  const activeStructs = structures.filter(s => s.isActive);
  const structByReach = new Map<number, HydraulicStructure>();
  for (const st of activeStructs) {
    let bestJ = 0;
    let minD = Infinity;
    for (let j = 0; j < N - 1; j++) {
      const midSt = (orderedSecs[j].station + orderedSecs[j + 1].station) / 2;
      const d = Math.abs(midSt - st.station);
      if (d < minD) {
        minD = d;
        bestJ = j;
      }
    }
    structByReach.set(bestJ, st);
  }

  // Initialize steady flow at t = 0
  const q0 = getInflowAtT(0);
  const initRun = solveStandardStepBackwater(sections, q0, nMain, nLOB, nROB, S0, structures);
  let curWSE = new Float64Array(N);
  let curQ = new Float64Array(N);
  for (let j = 0; j < N; j++) {
    const origIdx = flowOrder[j];
    curWSE[j] = initRun[origIdx].waterElevation;
    curQ[j] = q0;
  }

  // Preissmann implicit parameters
  const theta = 0.65;
  const g = 9.81;
  const effS0Ds = Math.max(0.0001, Math.abs(S0));
  const reportIntervalH = maxT > 48 ? 2 : 1;
  // Adaptive hydraulic sub-stepping (~3–6 min step, bounded so runtime < ~120ms)
  const subStepsPerHour = Math.max(4, Math.min(12, Math.ceil(3600 / Math.max(300, Math.min(...Array.from(reachDx)) * 8))));
  const dt = 3600 / subStepsPerHour;
  const totalSubSteps = Math.round(maxT * subStepsPerHour);

  const timeSteps: DynamicTimeStepResult[] = [];
  const upstreamHydrograph: { time: number; flow: number }[] = [];
  const downstreamHydrograph: { time: number; flow: number }[] = [];

  const peakEnvelope: RoutingResult[] = new Array(N);
  for (let i = 0; i < N; i++) {
    peakEnvelope[i] = {
      ...initRun[i],
      waterElevation: -Infinity,
      maxDepth: 0,
      velocity: 0,
      topWidth: 0,
      discharge: 0
    };
  }
  const peakStructEnvelope = new Map<string, StructureHydraulicResult>();

  const recordSnapshot = (tHours: number, wseVec: Float64Array, qVec: Float64Array) => {
    const qIn = qVec[0];
    const qOut = qVec[N - 1];
    upstreamHydrograph.push({ time: tHours, flow: Math.round(qIn * 10) / 10 });
    downstreamHydrograph.push({ time: tHours, flow: Math.round(qOut * 10) / 10 });

    const stepResults = new Array<RoutingResult>(N);
    const critCache = orderedSecs.map((sec, j) => computeCriticalDepth(sec, Math.max(0.5, qVec[j]), nMain, nLOB, nROB));

    const stepStructs: StructureHydraulicResult[] = [];
    for (const [jReach, st] of structByReach.entries()) {
      const tw = wseVec[jReach + 1];
      const bed = tables[jReach].bedZ;
      const sh = computeStructureHydraulics(st, tw, bed, Math.max(0.5, qVec[jReach]));
      stepStructs.push(sh);
      const prevBest = peakStructEnvelope.get(st.id);
      if (!prevBest || sh.upstreamWSE > prevBest.upstreamWSE) {
        peakStructEnvelope.set(st.id, sh);
      }
    }

    for (let j = 0; j < N; j++) {
      const origIdx = flowOrder[j];
      const sec = orderedSecs[j];
      const wse = wseVec[j];
      const q = Math.max(0.5, qVec[j]);
      const geom = evaluateCrossSectionGeometry(sec, wse, nMain, nLOB, nROB);
      const crit = critCache[j].criticalWSE;
      const vel = geom.totalArea > 1e-4 ? q / geom.totalArea : 0;
      const fr = geom.hydraulicDepth > 0
        ? vel / Math.sqrt((g * geom.hydraulicDepth) / Math.max(1, geom.alpha))
        : 0;
      const regime: RoutingResult['flowRegime'] =
        Math.abs(wse - crit) <= 0.03 ? 'critical' : fr > 1.02 ? 'supercritical' : 'subcritical';

      const stAtJ = structByReach.get(j);
      const stResAtJ = stAtJ ? stepStructs.find(sr => sr.structure.id === stAtJ.id) : undefined;
      const sEffect = stResAtJ && stResAtJ.backwaterRise > 0.01
        ? {
            structureName: stResAtJ.structure.name,
            flowState: stResAtJ.flowState,
            backwaterRise: Number(stResAtJ.backwaterRise.toFixed(3))
          }
        : undefined;

      stepResults[origIdx] = buildRoutingResultFromGeom(sec, wse, q, geom, crit, regime, sEffect);

      const res = stepResults[origIdx];
      if (res.waterElevation > peakEnvelope[origIdx].waterElevation) {
        peakEnvelope[origIdx] = {
          ...res,
          velocity: Math.max(peakEnvelope[origIdx].velocity, res.velocity),
          topWidth: Math.max(peakEnvelope[origIdx].topWidth, res.topWidth),
          discharge: Math.max(peakEnvelope[origIdx].discharge || 0, res.discharge || 0),
          isOverbank: res.isOverbank || peakEnvelope[origIdx].isOverbank
        };
      }
    }

    timeSteps.push({
      timeHours: tHours,
      timeFormatted: `Saat ${String(tHours).padStart(2, '0')}:00`,
      inflowQ: Math.round(qIn * 10) / 10,
      outflowQ: Math.round(qOut * 10) / 10,
      results: stepResults,
      structureResults: stepStructs
    });
  };

  recordSnapshot(0, curWSE, curQ);

  // Reusable buffers for Newton-Raphson Preissmann step
  const dim = 2 * N;
  const mat = new Float64Array(dim * dim);
  const rhs = new Float64Array(dim);
  const fBase = new Float64Array(dim);
  const fPert = new Float64Array(dim);

  const evalResiduals = (
    wNew: Float64Array,
    qNew: Float64Array,
    wOld: Float64Array,
    qOld: Float64Array,
    qUpBound: number,
    outF: Float64Array
  ) => {
    const hNew = new Array<{ A: number; B: number; K: number; alpha: number }>(N);
    const hOld = new Array<{ A: number; B: number; K: number; alpha: number }>(N);
    for (let j = 0; j < N; j++) {
      hNew[j] = lookupHydTable(tables[j], wNew[j]);
      hOld[j] = lookupHydTable(tables[j], wOld[j]);
    }

    // Row 0: Upstream inflow boundary Q_0^{n+1} - Q_in(t) = 0
    outF[0] = qNew[0] - qUpBound;

    for (let j = 0; j < N - 1; j++) {
      const dx = reachDx[j];
      const A_j0 = hOld[j].A, A_j1 = hOld[j + 1].A;
      const A_j0N = hNew[j].A, A_j1N = hNew[j + 1].A;

      // Row 2j + 1: Preissmann Continuity Equation
      const dAdt = (A_j0N + A_j1N - A_j0 - A_j1) / (2 * dt);
      const dQdx = (theta * (qNew[j + 1] - qNew[j]) + (1 - theta) * (qOld[j + 1] - qOld[j])) / dx;
      outF[2 * j + 1] = dAdt + dQdx;

      // Row 2j + 2: Momentum Equation or Coupled Structure Headloss Equation
      const st = structByReach.get(j);
      if (st) {
        const sHyd = computeStructureHydraulics(st, wNew[j + 1], tables[j].bedZ, Math.max(0.5, qNew[j]));
        // Scale to momentum residual units for clean Newton conditioning
        outF[2 * j + 2] = (wNew[j] - sHyd.upstreamWSE) * g * Math.max(5, 0.5 * (A_j0N + A_j1N)) / dx;
      } else {
        const dQdt = (qNew[j] + qNew[j + 1] - qOld[j] - qOld[j + 1]) / (2 * dt);
        const mom0N = (hNew[j].alpha * qNew[j] * Math.abs(qNew[j])) / Math.max(0.1, A_j0N);
        const mom1N = (hNew[j + 1].alpha * qNew[j + 1] * Math.abs(qNew[j + 1])) / Math.max(0.1, A_j1N);
        const mom0O = (hOld[j].alpha * qOld[j] * Math.abs(qOld[j])) / Math.max(0.1, A_j0);
        const mom1O = (hOld[j + 1].alpha * qOld[j + 1] * Math.abs(qOld[j + 1])) / Math.max(0.1, A_j1);
        const conv = (theta * (mom1N - mom0N) + (1 - theta) * (mom1O - mom0O)) / dx;

        const A_bar = theta * 0.5 * (A_j0N + A_j1N) + (1 - theta) * 0.5 * (A_j0 + A_j1);
        const dWdx = (theta * (wNew[j + 1] - wNew[j]) + (1 - theta) * (wOld[j + 1] - wOld[j])) / dx;

        const sf0N = (qNew[j] * Math.abs(qNew[j])) / Math.max(0.01, hNew[j].K * hNew[j].K);
        const sf1N = (qNew[j + 1] * Math.abs(qNew[j + 1])) / Math.max(0.01, hNew[j + 1].K * hNew[j + 1].K);
        const sf0O = (qOld[j] * Math.abs(qOld[j])) / Math.max(0.01, hOld[j].K * hOld[j].K);
        const sf1O = (qOld[j + 1] * Math.abs(qOld[j + 1])) / Math.max(0.01, hOld[j + 1].K * hOld[j + 1].K);
        const sf_bar = theta * 0.5 * (sf0N + sf1N) + (1 - theta) * 0.5 * (sf0O + sf1O);

        outF[2 * j + 2] = dQdt + conv + g * A_bar * (dWdx + sf_bar);
      }
    }

    // Row 2N - 1: Downstream normal-depth rating curve boundary Q_{N-1} - K_{N-1} * sqrt(S0) = 0
    outF[dim - 1] = qNew[N - 1] - hNew[N - 1].K * Math.sqrt(effS0Ds);
  };

  for (let sub = 1; sub <= totalSubSteps; sub++) {
    const tNextH = sub / subStepsPerHour;
    const qInNext = getInflowAtT(tNextH);

    const wNew = new Float64Array(curWSE);
    const qNew = new Float64Array(curQ);
    qNew[0] = qInNext;

    for (let newton = 0; newton < 6; newton++) {
      evalResiduals(wNew, qNew, curWSE, curQ, qInNext, fBase);

      let maxNorm = 0;
      for (let r = 0; r < dim; r++) {
        maxNorm = Math.max(maxNorm, Math.abs(fBase[r]));
      }
      if (maxNorm < 0.02) break;

      mat.fill(0);
      for (let r = 0; r < dim; r++) rhs[r] = -fBase[r];

      // Build banded finite-difference Jacobian cleanly
      for (let j = 0; j < N; j++) {
        // Variable 2j: WSE_j
        const epsW = 1e-4;
        const origW = wNew[j];
        wNew[j] = origW + epsW;
        evalResiduals(wNew, qNew, curWSE, curQ, qInNext, fPert);
        wNew[j] = origW;
        const colW = 2 * j;
        const rMinW = Math.max(0, colW - 3);
        const rMaxW = Math.min(dim, colW + 4);
        for (let r = rMinW; r < rMaxW; r++) {
          mat[r * dim + colW] = (fPert[r] - fBase[r]) / epsW;
        }

        // Variable 2j + 1: Q_j
        const epsQ = Math.max(1e-3, Math.abs(qNew[j]) * 1e-4);
        const origQ = qNew[j];
        qNew[j] = origQ + epsQ;
        evalResiduals(wNew, qNew, curWSE, curQ, qInNext, fPert);
        qNew[j] = origQ;
        const colQ = 2 * j + 1;
        const rMinQ = Math.max(0, colQ - 3);
        const rMaxQ = Math.min(dim, colQ + 4);
        for (let r = rMinQ; r < rMaxQ; r++) {
          mat[r * dim + colQ] = (fPert[r] - fBase[r]) / epsQ;
        }
      }

      const delta = solveBandedLinearSystem(mat, rhs, dim);

      // Damped physical update so WSE stays above bed and Q stays positive
      let stepScale = 1.0;
      for (let j = 0; j < N; j++) {
        const dW = delta[2 * j];
        if (Math.abs(dW) > 1.0) {
          stepScale = Math.min(stepScale, 1.0 / Math.abs(dW));
        }
      }
      for (let j = 0; j < N; j++) {
        const nextW = wNew[j] + stepScale * delta[2 * j];
        wNew[j] = Math.max(tables[j].bedZ + 0.03, Math.min(tables[j].bedZ + 55, nextW));
        qNew[j] = Math.max(0.25, qNew[j] + stepScale * delta[2 * j + 1]);
      }
      qNew[0] = qInNext;
    }

    curWSE = wNew;
    curQ = qNew;

    if (sub % (subStepsPerHour * reportIntervalH) === 0) {
      recordSnapshot(Math.round(tNextH), curWSE, curQ);
    }
  }

  let maxInflow = -Infinity;
  let peakTimeHours = 0;
  for (const pt of hydroPoints) {
    if (pt.flow > maxInflow) {
      maxInflow = pt.flow;
      peakTimeHours = pt.time;
    }
  }

  const overallStructureResults = activeStructs.map(st => {
    const best = peakStructEnvelope.get(st.id);
    if (best) return best;
    return computeStructureHydraulics(st, curWSE[0], tables[0].bedZ, peakFlow);
  });

  return {
    peakResults: peakEnvelope,
    structureResults: overallStructureResults,
    timeSteps,
    peakTimeHours,
    maxFloodAreaM2: 0,
    upstreamHydrograph,
    downstreamHydrograph
  };
}

export interface DEMFloodDepthOverlay {
  imageUrl: string;
  wgs84Bounds: [[number, number], [number, number]];
  pixelFloodAreaM2: number;
  pixelFloodAreaHa: number;
  studyAreaPixelFloodM2?: number;
  studyAreaPixelFloodHa?: number;
  maxPixelDepth: number;
  wetPixelCount: number;
}

/**
 * RAS Mapper Style DEM Flood Depth Rasterizer:
 * Interpolates 1D solved WSE linearly along reach quads onto DEM cells, subtracts terrain elevation
 * (h = WSE - DEM), applies 8-connected channel connectivity to remove isolated dry-ridge ponds,
 * and computes exact flooded pixel area and Study Area pixel overlap.
 */
export async function buildDEMFloodDepthOverlay(
  demFile: File,
  sections: CrossSection[],
  results: RoutingResult[],
  crsDef: string,
  studyAreaPolygons?: [number, number][][]
): Promise<DEMFloodDepthOverlay | null> {
  if (!demFile || sections.length < 2 || results.length < 2) return null;

  const rawDem = await loadDEM(demFile);
  const { bbox, width: rawWidth, height: rawHeight, data: rawData, noDataVal } = rawDem;
  if (!rawData || rawWidth < 2 || rawHeight < 2) return null;

  // Downsample working raster to max 900px per side for crisp pixels & fast connectivity BFS
  const maxDim = 900;
  const scale = Math.min(1, maxDim / Math.max(rawWidth, rawHeight));
  const width = Math.max(2, Math.round(rawWidth * scale));
  const height = Math.max(2, Math.round(rawHeight * scale));

  const xll = bbox[0];
  const yll = bbox[1];
  const xur = bbox[2];
  const yur = bbox[3];
  const spanX = Math.abs(xur - xll);
  const spanY = Math.abs(yur - yll);
  const cellSizeX = spanX / width;
  const cellSizeY = spanY / height;

  const demGrid = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(rawHeight - 1, Math.floor(((y + 0.5) / height) * rawHeight));
    const srcRow = sy * rawWidth;
    const dstRow = y * width;
    for (let x = 0; x < width; x++) {
      const sx = Math.min(rawWidth - 1, Math.floor(((x + 0.5) / width) * rawWidth));
      const v = rawData[srcRow + sx];
      demGrid[dstRow + x] = (isNaN(v) || v <= -9000 || v > 20000 || v === noDataVal) ? NaN : v;
    }
  }

  const isGeographicBbox =
    Math.abs(bbox[0]) <= 180 &&
    Math.abs(bbox[2]) <= 180 &&
    Math.abs(bbox[1]) <= 90 &&
    Math.abs(bbox[3]) <= 90;

  const effectiveCrsDef = isGeographicBbox
    ? '+proj=longlat +datum=WGS84 +no_defs'
    : crsDef;

  let wgs84Bounds: [[number, number], [number, number]];
  if (isGeographicBbox) {
    wgs84Bounds = [
      [Math.min(bbox[1], bbox[3]), Math.min(bbox[0], bbox[2])],
      [Math.max(bbox[1], bbox[3]), Math.max(bbox[0], bbox[2])]
    ];
  } else {
    try {
      const toCRS = '+proj=longlat +datum=WGS84 +no_defs';
      const pSW = proj4(effectiveCrsDef, toCRS, [bbox[0], bbox[1]]);
      const pNW = proj4(effectiveCrsDef, toCRS, [bbox[0], bbox[3]]);
      const pNE = proj4(effectiveCrsDef, toCRS, [bbox[2], bbox[3]]);
      const pSE = proj4(effectiveCrsDef, toCRS, [bbox[2], bbox[1]]);
      const lats = [pSW[1], pNW[1], pNE[1], pSE[1]];
      const lons = [pSW[0], pNW[0], pNE[0], pSE[0]];
      wgs84Bounds = [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)]
      ];
    } catch {
      return null;
    }
  }

  const midLatRad = (((wgs84Bounds[0][0] + wgs84Bounds[1][0]) / 2) * Math.PI) / 180;
  const effCellX = isGeographicBbox ? cellSizeX * 111320 * Math.cos(midLatRad) : cellSizeX;
  const effCellY = isGeographicBbox ? cellSizeY * 111320 : cellSizeY;
  const cellAreaM2 = Math.max(0.01, effCellX * effCellY);

  const wgs84ToGrid = (lat: number, lon: number): [number, number] => {
    let px = lon;
    let py = lat;
    if (!isGeographicBbox) {
      try {
        [px, py] = proj4('EPSG:4326', effectiveCrsDef, [lon, lat]);
      } catch {
        // ignore
      }
    }
    const gx = ((px - xll) / Math.max(1e-9, spanX)) * width;
    const gy = ((yur - py) / Math.max(1e-9, spanY)) * height;
    return [gx, gy];
  };

  interface GridSectionPts {
    lx: number;
    ly: number;
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    wse: number;
  }

  const gridSecs: GridSectionPts[] = [];
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const res = results[i];
    if (!sec.cutLine || !res) continue;
    const [glx, gly] = wgs84ToGrid(sec.cutLine[0][0], sec.cutLine[0][1]);
    const [grx, gry] = wgs84ToGrid(sec.cutLine[1][0], sec.cutLine[1][1]);
    const cCoord = sec.centerCoord || [
      (sec.cutLine[0][0] + sec.cutLine[1][0]) / 2,
      (sec.cutLine[0][1] + sec.cutLine[1][1]) / 2
    ];
    const [gcx, gcy] = wgs84ToGrid(cCoord[0], cCoord[1]);
    gridSecs.push({ lx: glx, ly: gly, cx: gcx, cy: gcy, rx: grx, ry: gry, wse: res.waterElevation });
  }

  if (gridSecs.length < 2) return null;

  // Rasterize WSE field across reach triangles
  const wseGrid = new Float32Array(width * height);
  wseGrid.fill(NaN);

  const rasterizeTriangle = (
    x0: number, y0: number, z0: number,
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number
  ) => {
    const minPx = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxPx = Math.min(width - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minPy = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxPy = Math.min(height - 1, Math.ceil(Math.max(y0, y1, y2)));

    const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (Math.abs(denom) < 1e-6) return;

    for (let py = minPy; py <= maxPy; py++) {
      const cy = py + 0.5;
      const rowOff = py * width;
      for (let px = minPx; px <= maxPx; px++) {
        const cx = px + 0.5;
        const w0 = ((y1 - y2) * (cx - x2) + (x2 - x1) * (cy - y2)) / denom;
        const w1 = ((y2 - y0) * (cx - x2) + (x0 - x2) * (cy - y2)) / denom;
        const w2 = 1 - w0 - w1;
        if (w0 >= -0.002 && w1 >= -0.002 && w2 >= -0.002) {
          wseGrid[rowOff + px] = w0 * z0 + w1 * z1 + w2 * z2;
        }
      }
    }
  };

  for (let i = 0; i < gridSecs.length - 1; i++) {
    const a = gridSecs[i];
    const b = gridSecs[i + 1];
    rasterizeTriangle(a.lx, a.ly, a.wse, b.lx, b.ly, b.wse, b.rx, b.ry, b.wse);
    rasterizeTriangle(a.lx, a.ly, a.wse, b.rx, b.ry, b.wse, a.rx, a.ry, a.wse);
  }

  // Raw wet cells where WSE > DEM
  const totalPixels = width * height;
  const candidateWet = new Uint8Array(totalPixels);
  for (let idx = 0; idx < totalPixels; idx++) {
    const wse = wseGrid[idx];
    const demZ = demGrid[idx];
    if (!isNaN(wse) && !isNaN(demZ) && wse - demZ > 0.01) {
      candidateWet[idx] = 1;
    }
  }

  // Seed 8-connected BFS flood fill along river centerline so disconnected depressions stay dry
  const connectedWet = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let qHead = 0;
  let qTail = 0;

  const trySeedCell = (px: number, py: number) => {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = px + dx;
        const ny = py + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = ny * width + nx;
          if (candidateWet[nIdx] && !connectedWet[nIdx]) {
            connectedWet[nIdx] = 1;
            queue[qTail++] = nIdx;
          }
        }
      }
    }
  };

  for (let i = 0; i < gridSecs.length - 1; i++) {
    const a = gridSecs[i];
    const b = gridSecs[i + 1];
    const distPix = Math.max(1, Math.ceil(Math.hypot(b.cx - a.cx, b.cy - a.cy)));
    for (let s = 0; s <= distPix; s++) {
      const f = s / distPix;
      const sx = Math.round(a.cx + f * (b.cx - a.cx));
      const sy = Math.round(a.cy + f * (b.cy - a.cy));
      trySeedCell(sx, sy);
    }
  }

  const dirs = [-1, 1, -width, width, -width - 1, -width + 1, width - 1, width + 1];
  while (qHead < qTail) {
    const cur = queue[qHead++];
    const cx = cur % width;
    for (let k = 0; k < dirs.length; k++) {
      const nxt = cur + dirs[k];
      if (nxt < 0 || nxt >= totalPixels) continue;
      const nx = nxt % width;
      if (Math.abs(nx - cx) > 1) continue;
      if (candidateWet[nxt] && !connectedWet[nxt]) {
        connectedWet[nxt] = 1;
        queue[qTail++] = nxt;
      }
    }
  }

  // Pre-project Study Area polygons into grid coords if supplied
  const studyRingsGrid: [number, number][][] = [];
  if (studyAreaPolygons && studyAreaPolygons.length > 0) {
    for (const ring of studyAreaPolygons) {
      if (ring.length >= 3) {
        studyRingsGrid.push(ring.map(([lat, lon]) => wgs84ToGrid(lat, lon)));
      }
    }
  }

  const pointInPolyGrid = (px: number, py: number, ring: [number, number][]): boolean => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = (yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  // Paint water-depth RGBA canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const imgData = ctx.createImageData(width, height);
  const pix = imgData.data;

  let wetPixelCount = 0;
  let studyWetPixelCount = 0;
  let maxPixelDepth = 0;

  for (let py = 0; py < height; py++) {
    const rowOff = py * width;
    for (let px = 0; px < width; px++) {
      const idx = rowOff + px;
      const p4 = idx * 4;
      if (!connectedWet[idx]) {
        pix[p4 + 3] = 0;
        continue;
      }

      const depth = wseGrid[idx] - demGrid[idx];
      if (depth <= 0.01) {
        pix[p4 + 3] = 0;
        continue;
      }

      wetPixelCount++;
      if (depth > maxPixelDepth) maxPixelDepth = depth;

      if (studyRingsGrid.length > 0) {
        const cx = px + 0.5;
        const cy = py + 0.5;
        for (let r = 0; r < studyRingsGrid.length; r++) {
          if (pointInPolyGrid(cx, cy, studyRingsGrid[r])) {
            studyWetPixelCount++;
            break;
          }
        }
      }

      // Color ramp matching 1D depth legend
      let rC = 56, gC = 189, bC = 248, alpha = 195;
      if (depth >= 3.0) {
        rC = 30; gC = 58; bC = 138; alpha = 235;
      } else if (depth >= 1.5) {
        rC = 3; gC = 105; bC = 161; alpha = 225;
      } else if (depth >= 0.5) {
        rC = 2; gC = 132; bC = 199; alpha = 210;
      }

      pix[p4] = rC;
      pix[p4 + 1] = gC;
      pix[p4 + 2] = bC;
      pix[p4 + 3] = alpha;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const visDemInfo = {
    width,
    height,
    xll,
    yll,
    cellSize: cellSizeX,
    cellSizeY
  };

  const warpedUrl = reprojectCanvasToWgs84(canvas, visDemInfo, effectiveCrsDef, wgs84Bounds);
  const pixelFloodAreaM2 = wetPixelCount * cellAreaM2;
  const studyAreaPixelFloodM2 = studyRingsGrid.length > 0 ? studyWetPixelCount * cellAreaM2 : undefined;

  return {
    imageUrl: warpedUrl,
    wgs84Bounds,
    pixelFloodAreaM2,
    pixelFloodAreaHa: pixelFloodAreaM2 / 10000,
    ...(studyAreaPixelFloodM2 !== undefined ? {
      studyAreaPixelFloodM2,
      studyAreaPixelFloodHa: studyAreaPixelFloodM2 / 10000
    } : {}),
    maxPixelDepth: Number(maxPixelDepth.toFixed(2)),
    wetPixelCount
  };
}
