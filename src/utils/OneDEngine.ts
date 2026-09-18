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

export function runRouting(
  sections: CrossSection[],
  peakFlow: number,
  nMain: number,
  nLOB: number,
  nROB: number,
  S0: number
): RoutingResult[] {
  return sections.map(sec => {
    const res = computeNormalDepth(sec, peakFlow, nMain, nLOB, nROB, S0);
    return {
      station: sec.station,
      ...res
    };
  });
}
