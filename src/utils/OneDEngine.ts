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

export async function parseKMLCoordinates(file: File): Promise<[number, number][]> {
  const text = await file.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'text/xml');
  const coordinatesNode = xml.getElementsByTagName('coordinates')[0];
  
  if (!coordinatesNode || !coordinatesNode.textContent) {
    return [];
  }
  
  const coordsText = coordinatesNode.textContent.trim();
  const coordPairs = coordsText.split(/\s+/);
  const coords: [number, number][] = [];
  
  for (const pair of coordPairs) {
    const [lon, lat] = pair.split(',').map(Number);
    if (!isNaN(lon) && !isNaN(lat)) {
      coords.push([lat, lon]); // Leaflet format: [lat, lon]
    }
  }
  return coords;
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

function getElevation(dem: any, lon: number, lat: number, crsDef?: string): number {
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

export async function generateCrossSections(
  demFile: File,
  centerlineFile: File,
  leftBankFile: File | null,
  rightBankFile: File | null,
  dx: number,
  sectionWidth: number = 200, // Default 200m width
  crsDef?: string
): Promise<CrossSection[]> {
  const dem = await loadDEM(demFile);
  const centerline = await parseKML(centerlineFile);
  
  const length = turf.length(centerline, { units: 'meters' });
  const sections: CrossSection[] = [];
  
  for (let d = 0; d <= length; d += dx) {
    const pt = turf.along(centerline, d, { units: 'meters' });
    const ptNext = turf.along(centerline, Math.min(d + 1, length), { units: 'meters' });
    const bearing = turf.bearing(pt, ptNext);
    
    const angleLeft = bearing - 90;
    const angleRight = bearing + 90;
    
    const profile: ProfilePoint[] = [];
    const halfWidth = sectionWidth / 2;
    const resolution = 2; // sample DEM every 2 meters
    
    for (let dist = -halfWidth; dist <= halfWidth; dist += resolution) {
      let samplePt;
      if (dist < 0) {
        samplePt = turf.destination(pt, Math.abs(dist), angleLeft, { units: 'meters' });
      } else if (dist > 0) {
        samplePt = turf.destination(pt, dist, angleRight, { units: 'meters' });
      } else {
        samplePt = pt;
      }
      
      const [lon, lat] = samplePt.geometry.coordinates;
      let z = getElevation(dem, lon, lat, crsDef);
      if (isNaN(z)) z = 0;
      
      // Determine zone (LOB, MAIN, ROB)
      let type: 'LOB' | 'MAIN' | 'ROB' = 'MAIN';
      if (dist < -sectionWidth * 0.2) type = 'LOB';
      else if (dist > sectionWidth * 0.2) type = 'ROB';
      
      profile.push({ x: dist + halfWidth, z, type });
    }
    
    const [centerLon, centerLat] = pt.geometry.coordinates;
    const ptLeft = turf.destination(pt, halfWidth, angleLeft, { units: 'meters' });
    const ptRight = turf.destination(pt, halfWidth, angleRight, { units: 'meters' });
    const cutLine: [[number, number], [number, number]] = [
      [ptLeft.geometry.coordinates[1], ptLeft.geometry.coordinates[0]],
      [ptRight.geometry.coordinates[1], ptRight.geometry.coordinates[0]]
    ];

    const bankLeftX = halfWidth - (sectionWidth * 0.2);
    const bankRightX = halfWidth + (sectionWidth * 0.2);

    const elevations = profile.map(p => p.z);
    const minElevation = Math.min(...elevations);
    const maxElevation = Math.max(...elevations);

    sections.push({
      station: Math.round(d),
      profile,
      centerCoord: [centerLat, centerLon],
      cutLine,
      minElevation,
      maxElevation,
      bankLeftX,
      bankRightX
    });
  }
  
  return sections;
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

    const profile: ProfilePoint[] = [];
    for (let d = 0; d <= lineLen; d += resolution) {
      const pt = turf.along(line, d, { units: 'meters' });
      const [lon, lat] = pt.geometry.coordinates;
      let z = getElevation(dem, lon, lat, crsDef);
      if (isNaN(z)) z = 0;

      let type: 'LOB' | 'MAIN' | 'ROB' = 'MAIN';
      if (d < lineLen * 0.25) type = 'LOB';
      else if (d > lineLen * 0.75) type = 'ROB';

      profile.push({ x: d, z, type });
    }

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
      bankLeftX: lineLen * 0.25,
      bankRightX: lineLen * 0.75
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
  const minZ = section.minElevation;
  const maxZ = section.maxElevation;
  
  let wl = minZ + 0.05;
  const tolerance = 0.1;
  const maxIter = 500;
  
  let finalQ = 0;
  let finalArea = 0;
  let finalVel = 0;
  let finalPerimeter = 0;
  let finalTopWidth = 0;
  let finalOverbank = false;
  
  for (let i = 0; i < maxIter; i++) {
    if (wl > maxZ) break;
    
    let areaMAIN = 0, pMAIN = 0;
    let areaLOB = 0, pLOB = 0;
    let areaROB = 0, pROB = 0;
    let topWidth = 0;
    let overbankDetected = false;
    
    for (let j = 0; j < section.profile.length - 1; j++) {
      const p1 = section.profile[j];
      const p2 = section.profile[j+1];
      
      const z1 = p1.z;
      const z2 = p2.z;
      
      if (wl > z1 || wl > z2) {
        const dx = p2.x - p1.x;
        const h1 = Math.max(0, wl - z1);
        const h2 = Math.max(0, wl - z2);
        
        const a = (h1 + h2) / 2 * dx;
        const dz = Math.abs(z1 - z2);
        const wetP = Math.sqrt(dx*dx + dz*dz);
        
        if (p1.type === 'MAIN') {
          areaMAIN += a;
          pMAIN += wetP;
        } else if (p1.type === 'LOB') {
          areaLOB += a;
          pLOB += wetP;
          if (a > 0.05) overbankDetected = true;
        } else {
          areaROB += a;
          pROB += wetP;
          if (a > 0.05) overbankDetected = true;
        }
        topWidth += dx;
      }
    }
    
    const computeK = (A: number, P: number, n: number) => {
      if (A <= 0 || P <= 0) return 0;
      return (1/n) * A * Math.pow(A/P, 2/3);
    };
    
    const kMAIN = computeK(areaMAIN, pMAIN, nMain);
    const kLOB = computeK(areaLOB, pLOB, nLOB);
    const kROB = computeK(areaROB, pROB, nROB);
    
    const K_total = kMAIN + kLOB + kROB;
    const Q_calc = K_total * Math.sqrt(Math.max(0.0001, S0));
    
    if (Math.abs(Q_calc - Q) < tolerance) {
      finalQ = Q_calc;
      finalArea = areaMAIN + areaLOB + areaROB;
      finalPerimeter = pMAIN + pLOB + pROB;
      finalTopWidth = topWidth;
      finalVel = finalArea > 0 ? Q_calc / finalArea : 0;
      finalOverbank = overbankDetected;
      break;
    }
    
    if (Q_calc < Q) {
      wl += 0.05;
    } else {
      wl -= 0.01;
      if (Math.abs(Q_calc - Q) < tolerance * 10) {
        finalQ = Q_calc;
        finalArea = areaMAIN + areaLOB + areaROB;
        finalPerimeter = pMAIN + pLOB + pROB;
        finalTopWidth = topWidth;
        finalVel = finalArea > 0 ? Q_calc / finalArea : 0;
        finalOverbank = overbankDetected;
        break;
      }
    }
  }

  const hydraulicDepth = finalTopWidth > 0 ? finalArea / finalTopWidth : Math.max(0.1, wl - minZ);
  const froudeNumber = hydraulicDepth > 0 ? finalVel / Math.sqrt(9.81 * hydraulicDepth) : 0;
  const velocityHead = (finalVel * finalVel) / (2 * 9.81);
  const energyElevation = wl + velocityHead;
  
  return {
    waterElevation: wl,
    maxDepth: Math.max(0, wl - minZ),
    area: finalArea,
    velocity: finalVel,
    wettedPerimeter: finalPerimeter,
    topWidth: finalTopWidth,
    froudeNumber,
    isOverbank: finalOverbank,
    energyElevation,
    bedElevation: minZ
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
          
          // If water elevation exceeds left or right bank, mark as overbank
          const secProfile = sections[i].profile;
          const leftBankPt = secProfile.find(p => p.x >= sections[i].bankLeftX);
          const rightBankPt = secProfile.find(p => p.x >= sections[i].bankRightX);
          const bankMinZ = Math.min(leftBankPt?.z || Infinity, rightBankPt?.z || Infinity);
          if (finalResults[i].waterElevation > bankMinZ) {
            finalResults[i].isOverbank = true;
          }

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
