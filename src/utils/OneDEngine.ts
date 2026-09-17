import * as turf from '@turf/turf';
import * as GeoTIFF from 'geotiff';
import { Feature, LineString } from 'geojson';

export interface ProfilePoint {
  x: number;
  z: number;
  type: 'LOB' | 'MAIN' | 'ROB';
}

export interface CrossSection {
  station: number;
  profile: ProfilePoint[];
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

function getElevation(dem: any, lon: number, lat: number): number {
  const { bbox, width, height, data } = dem;
  if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) {
    return NaN;
  }
  
  const px = Math.floor(((lon - bbox[0]) / (bbox[2] - bbox[0])) * width);
  const py = Math.floor(((bbox[3] - lat) / (bbox[3] - bbox[1])) * height);
  
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
  sectionWidth: number = 200 // Default 200m width
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
      let z = getElevation(dem, lon, lat);
      if (isNaN(z)) z = 0;
      
      // Determine zone (LOB, MAIN, ROB)
      let type: 'LOB' | 'MAIN' | 'ROB' = 'MAIN';
      if (dist < -sectionWidth * 0.2) type = 'LOB';
      else if (dist > sectionWidth * 0.2) type = 'ROB';
      
      profile.push({ x: dist + halfWidth, z, type });
    }
    
    sections.push({ station: Math.round(d), profile });
  }
  
  return sections;
}

export function computeNormalDepth(
  section: CrossSection,
  Q: number,
  nMain: number,
  nLOB: number,
  nROB: number,
  S0: number
) {
  const minZ = Math.min(...section.profile.map(p => p.z));
  const maxZ = Math.max(...section.profile.map(p => p.z));
  
  let wl = minZ + 0.05;
  const tolerance = 0.1;
  const maxIter = 500;
  
  let finalQ = 0;
  let finalArea = 0;
  let finalVel = 0;
  
  for (let i = 0; i < maxIter; i++) {
    if (wl > maxZ) break;
    
    let areaMAIN = 0, pMAIN = 0;
    let areaLOB = 0, pLOB = 0;
    let areaROB = 0, pROB = 0;
    
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
        
        if (p1.type === 'MAIN') { areaMAIN += a; pMAIN += wetP; }
        else if (p1.type === 'LOB') { areaLOB += a; pLOB += wetP; }
        else { areaROB += a; pROB += wetP; }
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
    const Q_calc = K_total * Math.sqrt(S0);
    
    if (Math.abs(Q_calc - Q) < tolerance) {
      finalQ = Q_calc;
      finalArea = areaMAIN + areaLOB + areaROB;
      finalVel = finalArea > 0 ? Q_calc / finalArea : 0;
      break;
    }
    
    if (Q_calc < Q) {
      wl += 0.05;
    } else {
      wl -= 0.01;
      if (Math.abs(Q_calc - Q) < tolerance * 10) break;
    }
  }
  
  return {
    waterElevation: wl,
    maxDepth: wl - minZ,
    area: finalArea,
    velocity: finalVel
  };
}

export function runRouting(
  sections: CrossSection[],
  peakFlow: number,
  nMain: number,
  nLOB: number,
  nROB: number,
  S0: number
) {
  // Solve normal depth explicitly at each section for the peak flow
  // (Proxy for 1D Diffusive routing visualization)
  return sections.map(sec => {
    const res = computeNormalDepth(sec, peakFlow, nMain, nLOB, nROB, S0);
    return {
      station: sec.station,
      ...res
    };
  });
}
