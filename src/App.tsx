import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Settings, Droplets, Map as MapIcon, Info, AlertCircle, Download, Globe, Layers, BarChart3, X, ChevronRight, ChevronLeft, FileText, MapPin, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import BathtubWorker from './workers/bathtub-worker?worker';
import * as GeoTIFF from 'geotiff';
import proj4 from 'proj4';
import * as turf from '@turf/turf';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import 'jspdf-autotable';

import { MapContainer, TileLayer, ImageOverlay, Polyline, CircleMarker, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import Dashboard from './components/Dashboard';
import Analysis from './components/Analysis';
import About from './components/About';
import { MapAutoCenter, MapClickHandler } from './components/MapHelpers';
import Footer from './components/Footer';

// Common Turkish and International Coordinate Systems with EPSG Codes
const CRS_LIST = [
  // Global & Web Standard Systems
  { code: 'EPSG:4326', name: 'WGS 84 (Coğrafi - Global)', def: '+proj=longlat +datum=WGS84 +no_defs' },
  { code: 'EPSG:3857', name: 'WGS 84 / Pseudo-Mercator (Web Mercator)', def: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs' },
  
  // Turkey TUREF / TM (3-Degree)
  { code: 'EPSG:5253', name: 'TUREF / TM27 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=27 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5254', name: 'TUREF / TM30 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=30 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5255', name: 'TUREF / TM33 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=33 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5256', name: 'TUREF / TM36 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=36 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5257', name: 'TUREF / TM39 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=39 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5258', name: 'TUREF / TM42 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=42 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5259', name: 'TUREF / TM45 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=45 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  
  // WGS 84 / UTM Northern Hemisphere (6-Degree) - Commonly Used globally
  { code: 'EPSG:32630', name: 'WGS 84 / UTM Zone 30N', def: '+proj=utm +zone=30 +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32631', name: 'WGS 84 / UTM Zone 31N', def: '+proj=utm +zone=31 +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32632', name: 'WGS 84 / UTM Zone 32N', def: '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32633', name: 'WGS 84 / UTM Zone 33N', def: '+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32634', name: 'WGS 84 / UTM Zone 34N', def: '+proj=utm +zone=34 +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32635', name: 'WGS 84 / UTM Zone 35N', def: '+proj=utm +zone=35 +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32636', name: 'WGS 84 / UTM Zone 36N', def: '+proj=utm +zone=36 +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32637', name: 'WGS 84 / UTM Zone 37N', def: '+proj=utm +zone=37 +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32638', name: 'WGS 84 / UTM Zone 38N', def: '+proj=utm +zone=38 +datum=WGS84 +units=m +no_defs' },

  // WGS 84 / UTM Southern Hemisphere (6-Degree)
  { code: 'EPSG:32735', name: 'WGS 84 / UTM Zone 35S', def: '+proj=utm +zone=35 +south +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32736', name: 'WGS 84 / UTM Zone 36S', def: '+proj=utm +zone=36 +south +datum=WGS84 +units=m +no_defs' },

  // European Coordinate Systems
  { code: 'EPSG:25832', name: 'ETRS89 / UTM Zone 32N (Avrupa)', def: '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:3035', name: 'ETRS89 / LAEA Europe (Avrupa Karasal)', def: '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:27700', name: 'OSGB 1936 / British National Grid (İngiltere)', def: '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +datum=OSGB36 +units=m +no_defs' },
  { code: 'EPSG:2154', name: 'RGF93 / Lambert-93 (Fransa)', def: '+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:31467', name: 'DHDN / Gauss-Kruger Zone 3 (Almanya)', def: '+proj=tmerc +lat_0=0 +lon_0=9 +k=1 +x_0=3500000 +y_0=0 +ellps=bessel +datum=potsdam +units=m +no_defs' },

  // North American Systems (NAD83 & NAD27)
  { code: 'EPSG:4269', name: 'NAD83 (Kuzey Amerika Coğrafi)', def: '+proj=longlat +datum=NAD83 +no_defs' },
  { code: 'EPSG:26910', name: 'NAD83 / UTM Zone 10N (ABD Batı Yakası)', def: '+proj=utm +zone=10 +datum=NAD83 +units=m +no_defs' },
  { code: 'EPSG:26911', name: 'NAD83 / UTM Zone 11N (ABD Güneybatı)', def: '+proj=utm +zone=11 +datum=NAD83 +units=m +no_defs' },
  { code: 'EPSG:26912', name: 'NAD83 / UTM Zone 12N (ABD Kayalık Dağlar)', def: '+proj=utm +zone=12 +datum=NAD83 +units=m +no_defs' },
  { code: 'EPSG:26913', name: 'NAD83 / UTM Zone 13N (ABD Merkez)', def: '+proj=utm +zone=13 +datum=NAD83 +units=m +no_defs' },
  { code: 'EPSG:26915', name: 'NAD83 / UTM Zone 15N (ABD Ortabatı)', def: '+proj=utm +zone=15 +datum=NAD83 +units=m +no_defs' },
  { code: 'EPSG:26917', name: 'NAD83 / UTM Zone 17N (ABD Doğu Yakası)', def: '+proj=utm +zone=17 +datum=NAD83 +units=m +no_defs' },
  { code: 'EPSG:26918', name: 'NAD83 / UTM Zone 18N (ABD Kuzeydoğu)', def: '+proj=utm +zone=18 +datum=NAD83 +units=m +no_defs' },
  { code: 'EPSG:4267', name: 'NAD27 (Kuzey Amerika Tarihsel)', def: '+proj=longlat +datum=NAD27 +no_defs' },

  // Asia-Pacific Systems
  { code: 'EPSG:6676', name: 'JGD2011 / Japan Plane Rectangular CS VI (Japonya)', def: '+proj=tmerc +lat_0=36 +lon_0=136 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:7855', name: 'GDA2020 / MGA Zone 55 (Avustralya Doğu)', def: '+proj=utm +zone=55 +south +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:7856', name: 'GDA2020 / MGA Zone 56 (Sidney/Brisbane)', def: '+proj=utm +zone=56 +south +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:4490', name: 'CGCS2000 (Çin Coğrafi)', def: '+proj=longlat +ellps=GRS80 +no_defs' },

  // ED50 (European Datum 1950) 3-Degree (TM)
  { code: 'EPSG:5220', name: 'ED50 / TM27 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=27 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5221', name: 'ED50 / TM30 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=30 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5222', name: 'ED50 / TM33 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=33 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5223', name: 'ED50 / TM36 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=36 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5224', name: 'ED50 / TM39 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=39 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5225', name: 'ED50 / TM42 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=42 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5226', name: 'ED50 / TM45 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=45 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  
  // ED50 (European Datum 1950) 6-Degree (UTM)
  { code: 'EPSG:23035', name: 'ED50 / UTM Zone 35N (6°)', def: '+proj=utm +zone=35 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:23036', name: 'ED50 / UTM Zone 36N (6°)', def: '+proj=utm +zone=36 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:23037', name: 'ED50 / UTM Zone 37N (6°)', def: '+proj=utm +zone=37 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:23038', name: 'ED50 / UTM Zone 38N (6°)', def: '+proj=utm +zone=38 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
];

interface DEMData {
  data: Float32Array;
  slope?: Float32Array;
  width: number;
  height: number;
  min: number;
  max: number;
  xll: number;
  yll: number;
  cellSize: number;
}

// Manning's n Presets
const MANNING_PRESETS = [
  { label: 'Beton / Asfalt', value: 0.013 },
  { label: 'Dere Yatağı (Temiz)', value: 0.030 },
  { label: 'Dere Yatağı (Otlu/Çakıllı)', value: 0.040 },
  { label: 'Tarım Arazisi', value: 0.050 },
  { label: 'Orman / Yoğun Bitki', value: 0.100 },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analysis' | 'about'>('dashboard');
  const [currentStep, setCurrentStep] = useState(1);
  const [dem, setDem] = useState<DEMData | null>(null);
  const [params, setParams] = useState({
    manning: 0.040,
    flowRate: 100,
    duration: 3600,
    dt: 1.0,
    sourceX: 0,
    sourceY: 0
  });
  const [coords, setCoords] = useState({
    lat: 39.0,
    lon: 35.0,
    cellSize: 10.0
  });
  const [selectedCRS, setSelectedCRS] = useState(CRS_LIST[0]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [waterDepth, setWaterDepth] = useState<Float32Array | null>(null);
  const [outflowType, setOutflowType] = useState<'free' | 'normal'>('free');
  const [showStats, setShowStats] = useState(false);
  const [simMethod, setSimMethod] = useState<'hydraulic' | 'bathtub' | null>('bathtub');
  const [bathtubLevel, setBathtubLevel] = useState(2.0);
  const [flowThreshold, setFlowThreshold] = useState(100);
  const [floodImage, setFloodImage] = useState<string | null>(null);
  const [elevationImage, setElevationImage] = useState<string | null>(null);
  const [streamImage, setStreamImage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'height' | 'slope' | 'flow'>('height');
  const [reliefImage, setReliefImage] = useState<string | null>(null);
  const [flowAcc, setFlowAcc] = useState<Float32Array | null>(null);
  const [riverKml, setRiverKml] = useState<{ name: string; coords: [number, number][] } | null>(null);
  const [sourceKmlName, setSourceKmlName] = useState<string | null>(null);
  const [sourceWgs, setSourceWgs] = useState<[number, number] | null>(null);
  const [areaKml, setAreaKml] = useState<{ name: string; coords: [number, number][] } | null>(null);
  const [areaMask, setAreaMask] = useState<Uint8Array | null>(null);

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    return () => {
      if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  useEffect(() => {
    // No auto-trigger for hydraulic
  }, [currentStep]);

  useEffect(() => {
    if (dem) {
      // Generate Elevation Image with Hillshade (Shaded Relief)
      const canvas = document.createElement('canvas');
      canvas.width = dem.width;
      canvas.height = dem.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const imageData = ctx.createImageData(dem.width, dem.height);
        const d = imageData.data;
        const { width, height, data, cellSize } = dem;
        
        // Hillshade parameters
        const azimuth = 315; // Light from NW
        const altitude = 45;
        const zFactor = 2.0; // Exaggeration
        
        const zenith_rad = (90 - altitude) * Math.PI / 180;
        const azimuth_math = 360.0 - azimuth + 90.0;
        const azimuth_rad = (azimuth_math > 360 ? azimuth_math - 360 : azimuth_math) * Math.PI / 180;

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const i = y * width + x;
            const idx = i * 4;
            
            // 1. Calculate Hillshade using Horn's method (3x3)
            let hillshade = 1.0;
            if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
              const a = data[(y - 1) * width + (x - 1)];
              const b = data[(y - 1) * width + x];
              const c = data[(y - 1) * width + (x + 1)];
              const d_val = data[y * width + (x - 1)];
              const f = data[y * width + (x + 1)];
              const g = data[(y + 1) * width + (x - 1)];
              const h = data[(y + 1) * width + x];
              const k = data[(y + 1) * width + (x + 1)];

              const dz_dx = ((c + 2 * f + k) - (a + 2 * d_val + g)) / (8 * cellSize);
              const dz_dy = ((g + 2 * h + k) - (a + 2 * b + c)) / (8 * cellSize);
              
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

              hillshade = Math.max(0, Math.cos(zenith_rad) * Math.cos(slope_rad) + 
                          Math.sin(zenith_rad) * Math.sin(slope_rad) * Math.cos(azimuth_rad - aspect_rad));
            }

            // 2. Calculate Color (Terrain / Hypsometric Tinting)
            const val = Math.max(0, Math.min(1, (data[i] - dem.min) / (dem.max - dem.min)));
            
            // Terrain Color Stops (R, G, B) - More Vibrant
            const stops = [
              { pos: 0.0, color: [20, 120, 20] },   // Canlı Koyu Yeşil
              { pos: 0.2, color: [80, 180, 80] },   // Canlı Yeşil
              { pos: 0.4, color: [230, 230, 120] }, // Parlak Sarı/Yeşil
              { pos: 0.6, color: [200, 150, 80] },  // Parlak Turuncu/Kahve
              { pos: 0.8, color: [140, 70, 30] },   // Canlı Koyu Kahve
              { pos: 1.0, color: [255, 255, 255] }  // Saf Beyaz
            ];

            let r = 255, g_col = 255, b_col = 255;
            for (let s = 0; s < stops.length - 1; s++) {
              const s1 = stops[s];
              const s2 = stops[s + 1];
              if (val >= s1.pos && val <= s2.pos) {
                const f = (val - s1.pos) / (s2.pos - s1.pos);
                r = s1.color[0] + (s2.color[0] - s1.color[0]) * f;
                g_col = s1.color[1] + (s2.color[1] - s1.color[1]) * f;
                b_col = s1.color[2] + (s2.color[2] - s1.color[2]) * f;
                break;
              }
            }

            // 3. Blend Color with Hillshade
            // Optimized factor for more vibrancy: 0.6 (min) to 1.1 (max)
            const factor = 0.6 + (hillshade * 0.5); 
            d[idx] = Math.min(255, r * factor);
            d[idx + 1] = Math.min(255, g_col * factor);
            d[idx + 2] = Math.min(255, b_col * factor);
            d[idx + 3] = 255;
          }
        }
        // Generate Relief (Grayscale Hillshade Only) for Satellite Blending
        const reliefCanvas = document.createElement('canvas');
        reliefCanvas.width = dem.width;
        reliefCanvas.height = dem.height;
        const reliefCtx = reliefCanvas.getContext('2d');
        if (reliefCtx) {
          const reliefImageData = reliefCtx.createImageData(dem.width, dem.height);
          const rd = reliefImageData.data;
          
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const i = y * width + x;
              const idx = i * 4;
              
              // Recalculate or reuse hillshade for relief
              // We'll use the same logic as above but store in a second loop 
              // (or integrated if we prefer, but for clarity let's do it right here)
              
              let hs = 1.0;
              if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
                const a = data[(y - 1) * width + (x - 1)];
                const b = data[(y - 1) * width + x];
                const c = data[(y - 1) * width + (x + 1)];
                const d_val = data[y * width + (x - 1)];
                const f = data[y * width + (x + 1)];
                const g = data[(y + 1) * width + (x - 1)];
                const h = data[(y + 1) * width + x];
                const k = data[(y + 1) * width + (x + 1)];

                const dz_dx = ((c + 2 * f + k) - (a + 2 * d_val + g)) / (8 * cellSize);
                const dz_dy = ((g + 2 * h + k) - (a + 2 * b + c)) / (8 * cellSize);
                
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

                hs = Math.max(0, Math.cos(zenith_rad) * Math.cos(slope_rad) + 
                             Math.sin(zenith_rad) * Math.sin(slope_rad) * Math.cos(azimuth_rad - aspect_rad));
              }

              // Relief blending needs neutral gray (128) for flat terrain
              // hs is ~0.707 for flat ground (45 deg sun).
              // We want hs=0.707 to map to 128 for 'overlay' or 'hard-light' blending.
              const gray = Math.max(0, Math.min(255, 128 + (hs - 0.707) * 180));
              rd[idx] = gray;
              rd[idx + 1] = gray;
              rd[idx + 2] = gray;
              rd[idx + 3] = 255;
            }
          }
          reliefCtx.putImageData(reliefImageData, 0, 0);
          setReliefImage(reliefCanvas.toDataURL());
        }

        ctx.putImageData(imageData, 0, 0);
        setElevationImage(canvas.toDataURL());
      }
    }
  }, [dem]);

  useEffect(() => {
    if (dem && flowAcc) {
      // Generate Stream Network Image
      const canvas = document.createElement('canvas');
      canvas.width = dem.width;
      canvas.height = dem.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const imageData = ctx.createImageData(dem.width, dem.height);
        const d = imageData.data;
        for (let i = 0; i < flowAcc.length; i++) {
          const idx = i * 4;
          if (flowAcc[i] > flowThreshold) {
            d[idx] = 0;
            d[idx + 1] = 150;
            d[idx + 2] = 255;
            d[idx + 3] = 255;
          } else {
            d[idx + 3] = 0;
          }
        }
        ctx.putImageData(imageData, 0, 0);
        setStreamImage(canvas.toDataURL());
      }
    }
  }, [dem, flowAcc, flowThreshold]);

  useEffect(() => {
    if (waterDepth && dem) {
      const canvas = document.createElement('canvas');
      canvas.width = dem.width;
      canvas.height = dem.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const imageData = ctx.createImageData(dem.width, dem.height);
        const d = imageData.data;
        for (let i = 0; i < waterDepth.length; i++) {
          const idx = i * 4;
          if (waterDepth[i] > 0.01) {
            const wVal = Math.min(1, waterDepth[i] / 2);
            d[idx] = 0;
            d[idx + 1] = 100 * (1 - wVal);
            d[idx + 2] = 255;
            d[idx + 3] = 180;
          } else {
            d[idx + 3] = 0;
          }
        }
        ctx.putImageData(imageData, 0, 0);
        setFloodImage(canvas.toDataURL());
      }
    }
  }, [waterDepth, dem]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dem || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * dem.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * dem.height);
    
    setParams(prev => ({ ...prev, sourceX: x, sourceY: y }));
  };

  const handleKmlUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, "text/xml");
      const coordsStr = xmlDoc.getElementsByTagName("coordinates")[0]?.textContent;
      
      if (coordsStr) {
        const pairs = coordsStr.trim().split(/\s+/);
        const kmlCoords = pairs.map(p => {
          const [lon, lat] = p.split(',').map(Number);
          return [lat, lon] as [number, number];
        });
        setRiverKml({ name: file.name, coords: kmlCoords });
        setSourceWgs(kmlCoords[0]);

        // Set source point to first point of KML
        if (kmlCoords.length > 0 && dem) {
          const [lat, lon] = kmlCoords[0];
          try {
            // Convert WGS84 to selected CRS
            const projected = proj4('EPSG:4326', selectedCRS.def, [lon, lat]);
            const x = Math.floor((projected[0] - dem.xll) / dem.cellSize);
            const y = Math.floor(dem.height - (projected[1] - dem.yll) / dem.cellSize);
            
            if (x >= 0 && x < dem.width && y >= 0 && y < dem.height) {
              setParams(prev => ({ ...prev, sourceX: x, sourceY: y }));
            }
          } catch (e) {
            console.error("KML point projection failed", e);
          }
        }
      }
    };
    reader.readAsText(file);
  };
  const handleSourceKmlUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, "text/xml");
      const coordsStr = xmlDoc.getElementsByTagName("coordinates")[0]?.textContent;
      
      if (coordsStr && dem) {
        setSourceKmlName(file.name);
        const [lon, lat] = coordsStr.trim().split(',').map(Number);
        setSourceWgs([lat, lon]);
        try {
          const projected = proj4('EPSG:4326', selectedCRS.def, [lon, lat]);
          const x = Math.floor((projected[0] - dem.xll) / dem.cellSize);
          const y = Math.floor(dem.height - (projected[1] - dem.yll) / dem.cellSize);
          
          if (x >= 0 && x < dem.width && y >= 0 && y < dem.height) {
            setParams(prev => ({ ...prev, sourceX: x, sourceY: y }));
          }
        } catch (e) {
          console.error("Source KML point projection failed", e);
        }
      }
    };
    reader.readAsText(file);
  };

  const isPointInPolygon = (point: [number, number], polygon: [number, number][]) => {
    const [x, y] = point;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const handleAreaKmlUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, "text/xml");
      const coordsStr = xmlDoc.getElementsByTagName("coordinates")[0]?.textContent;
      
      if (coordsStr && dem) {
        const pairs = coordsStr.trim().split(/\s+/);
        const kmlCoords = pairs.map(p => {
          const [lon, lat] = p.split(',').map(Number);
          return [lat, lon] as [number, number];
        });
        setAreaKml({ name: file.name, coords: kmlCoords });
        
        // Generate mask
        const mask = new Uint8Array(dem.width * dem.height);
        const gridPolygon = kmlCoords.map(([lat, lon]) => {
          const projected = proj4('EPSG:4326', selectedCRS.def, [lon, lat]);
          const x = (projected[0] - dem.xll) / dem.cellSize;
          const y = dem.height - (projected[1] - dem.yll) / dem.cellSize;
          return [x, y] as [number, number];
        });

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        gridPolygon.forEach(([x, y]) => {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        });

        const startX = Math.max(0, Math.floor(minX));
        const endX = Math.min(dem.width - 1, Math.ceil(maxX));
        const startY = Math.max(0, Math.floor(minY));
        const endY = Math.min(dem.height - 1, Math.ceil(maxY));

        for (let y = startY; y <= endY; y++) {
          for (let x = startX; x <= endX; x++) {
            if (isPointInPolygon([x, y], gridPolygon)) {
              mask[y * dem.width + x] = 1;
            }
          }
        }
        setAreaMask(mask);
      }
    };
    reader.readAsText(file);
  };

  const handleMapClick = (lat: number, lon: number) => {
    if (!dem) return;
    try {
      const projected = proj4('EPSG:4326', selectedCRS.def, [lon, lat]);
      const x = Math.floor((projected[0] - dem.xll) / dem.cellSize);
      const y = Math.floor(dem.height - (projected[1] - dem.yll) / dem.cellSize);
      
      if (x >= 0 && x < dem.width && y >= 0 && y < dem.height) {
        setParams(prev => ({ ...prev, sourceX: x, sourceY: y }));
        setSourceWgs([lat, lon]);
      }
    } catch (e) {
      console.error("Map click projection failed", e);
    }
  };

  const wgs84Bounds = React.useMemo(() => {
    if (!dem) return null;
    try {
      const fromCRS = selectedCRS.def;
      const toCRS = '+proj=longlat +datum=WGS84 +no_defs';
      
      const sw = proj4(fromCRS, toCRS, [dem.xll, dem.yll]);
      const ne = proj4(fromCRS, toCRS, [dem.xll + dem.width * dem.cellSize, dem.yll + dem.height * dem.cellSize]);
      
      return [[sw[1], sw[0]], [ne[1], ne[0]]] as [[number, number], [number, number]];
    } catch (e) {
      // Fallback if proj4 fails
      return [[coords.lat, coords.lon], [coords.lat + 0.01, coords.lon + 0.01]] as [[number, number], [number, number]];
    }
  }, [dem, selectedCRS.def, coords.lat, coords.lon]);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!dem || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height, data, slope, min, max } = dem;
    canvas.width = width;
    canvas.height = height;

    const imageData = ctx.createImageData(width, height);
    const d = imageData.data;

    for (let i = 0; i < data.length; i++) {
      let r, g, b;
      const x = i % width;
      const y = Math.floor(i / width);

      if (viewMode === 'height') {
        const val = (data[i] - min) / (max - min);
        r = g = b = val * 255;
      } else if (viewMode === 'slope' && slope) {
        const val = Math.min(1, slope[i] * 5); // Scale for visibility
        r = val * 255;
        g = (1 - val) * 255;
        b = 0;
      } else if (viewMode === 'flow' && flowAcc) {
        const isBed = flowAcc[i] > flowThreshold;
        if (isBed) {
          r = 0;
          g = 100;
          b = 255;
        } else {
          const val = Math.min(1, Math.log(flowAcc[i]) / Math.log(flowThreshold));
          r = 20;
          g = 20 + val * 30;
          b = 40 + val * 40;
        }
      } else {
        r = g = b = 0;
      }
      
      // Overlay water depth
      if (waterDepth && waterDepth[i] > 0.01) {
        const wVal = Math.min(1, waterDepth[i] / 2);
        r = r * (1 - wVal);
        g = g * (1 - wVal);
        b = 255 * wVal + b * (1 - wVal);
      }
      
      const idx = i * 4;
      d[idx] = r;
      d[idx + 1] = g;
      d[idx + 2] = b;
      d[idx + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);

    // Draw Source Point
    if (params.sourceX >= 0 && params.sourceY >= 0) {
      ctx.beginPath();
      ctx.arc(params.sourceX, params.sourceY, 5, 0, 2 * Math.PI);
      ctx.fillStyle = "#3b82f6";
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
      
      // Pulsing effect simulation (static for canvas but we can draw a ring)
      ctx.beginPath();
      ctx.arc(params.sourceX, params.sourceY, 10, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
      ctx.stroke();
    }
  }, [dem, viewMode, flowAcc, waterDepth]);

  const [validationReport, setValidationReport] = useState<{
    minHeight: number;
    maxHeight: number;
    avgHeight: number;
    maxSlope: number;
    avgSlope: number;
    isValid: boolean;
  } | null>(null);

  const calculateSlope = (data: Float32Array, width: number, height: number, cellSize: number, lat?: number) => {
    const slope = new Float32Array(width * height);
    let maxSlope = 0;
    let sumSlope = 0;

    // Heuristic: If cellSize is very small, it's likely in degrees (WGS84)
    // We need to convert horizontal distance to meters for a meaningful slope %
    let effectiveCellSize = cellSize;
    if (cellSize < 0.1 && lat !== undefined) {
      // 1 degree latitude is ~111.32 km
      // 1 degree longitude is ~111.32 * cos(lat) km
      const metersPerDegree = 111320; 
      const latRad = (lat * Math.PI) / 180;
      const metersPerDegreeLon = metersPerDegree * Math.cos(latRad);
      // Use average for simplicity in gradient calculation
      effectiveCellSize = cellSize * (metersPerDegree + metersPerDegreeLon) / 2;
    }

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        
        // 3x3 Sobel-like filter for gradients
        const dzdx = ((data[i - width + 1] + 2 * data[i + 1] + data[i + width + 1]) - 
                      (data[i - width - 1] + 2 * data[i - 1] + data[i + width - 1])) / (8 * effectiveCellSize);
        
        const dzdy = ((data[i + width - 1] + 2 * data[i + width] + data[i + width + 1]) - 
                      (data[i - width - 1] + 2 * data[i - width] + data[i - width + 1])) / (8 * effectiveCellSize);
        
        const s = Math.sqrt(dzdx * dzdx + dzdy * dzdy);
        slope[i] = s;
        if (s > maxSlope) maxSlope = s;
        sumSlope += s;
      }
    }

    return { 
      data: slope, 
      maxSlope: maxSlope * 100, // as percentage
      avgSlope: (sumSlope / (width * height)) * 100 
    };
  };

  const handleDemUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.tif') || file.name.endsWith('.tiff')) {
      handleGeoTIFF(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        parseASCII(text);
      };
      reader.readAsText(file);
    }
  };

  const handleGeoTIFF = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
      const image = await tiff.getImage();
      const rasters = await image.readRasters();
      const data = rasters[0] as any;
      
      const width = image.getWidth();
      const height = image.getHeight();
      
      const origin = image.getOrigin();
      const res = image.getResolution();
      const cellSize = res ? Math.abs(res[0]) : 10;
      
      let min = Infinity, max = -Infinity;
      const floatData = new Float32Array(width * height);
      for (let i = 0; i < data.length; i++) {
        const val = data[i];
        floatData[i] = val;
        if (val < min && val > -999) min = val;
        if (val > max) max = val;
      }

      // Calculate lower-left corner for consistency
      const xll = origin ? origin[0] : coords.lon;
      const yll = origin ? origin[1] - (height * cellSize) : coords.lat;

      const slopeInfo = calculateSlope(floatData, width, height, cellSize, yll);
      
      // Start flow accumulation calculation in background
      const flowWorker = new Worker(new URL('./workers/flow-accumulation-worker.ts', import.meta.url), { type: 'module' });
      flowWorker.onmessage = (e) => {
        if (e.data.accumulation) {
          setFlowAcc(e.data.accumulation);
          flowWorker.terminate();
        }
      };
      flowWorker.postMessage({
        dem: floatData,
        width,
        height,
        params: { cellSize }
      });

      setDem({
        data: floatData,
        slope: slopeInfo.data,
        width,
        height,
        min,
        max,
        xll,
        yll,
        cellSize
      });

      setValidationReport({
        minHeight: min,
        maxHeight: max,
        avgHeight: floatData.reduce((a, b) => a + b, 0) / floatData.length,
        maxSlope: slopeInfo.maxSlope,
        avgSlope: slopeInfo.avgSlope,
        isValid: max > min && cellSize > 0
      });
      
      setCoords({
        lon: xll,
        lat: yll,
        cellSize: cellSize
      });

      setParams(prev => ({ ...prev, sourceX: Math.floor(width / 2), sourceY: Math.floor(height / 2) }));
    } catch (err) {
      console.error("GeoTIFF parsing error:", err);
      alert("GeoTIFF dosyası işlenirken hata oluştu.");
    }
  };

  const parseASCII = (text: string) => {
    const lines = text.split('\n');
    let width = 0, height = 0, xll = 0, yll = 0, cellSize = 0, nodata = -9999;
    let dataStartLine = 0;

    for (let i = 0; i < 10; i++) {
      const parts = lines[i].trim().split(/\s+/);
      const key = parts[0].toLowerCase();
      const val = parseFloat(parts[1]);

      if (key === 'ncols') width = val;
      else if (key === 'nrows') height = val;
      else if (key === 'xllcorner') xll = val;
      else if (key === 'yllcorner') yll = val;
      else if (key === 'cellsize') cellSize = val;
      else if (key === 'nodata_value') nodata = val;
      
      if (!isNaN(val) && i > 0 && !['ncols', 'nrows', 'xllcorner', 'yllcorner', 'cellsize', 'nodata_value'].includes(key)) {
        dataStartLine = i;
        break;
      }
      if (i === 5) dataStartLine = 6;
    }

    const data = new Float32Array(width * height);
    let min = Infinity, max = -Infinity;
    let currentIdx = 0;

    // First pass: find min/max and identify NoData
    for (let i = dataStartLine; i < lines.length; i++) {
      const rowValues = lines[i].trim().split(/\s+/);
      for (const valStr of rowValues) {
        if (valStr === '') continue;
        const val = parseFloat(valStr);
        if (val !== nodata && !isNaN(val)) {
          if (val < min) min = val;
          if (val > max) max = val;
        }
      }
    }

    // Second pass: fill data, replacing NoData with min elevation
    currentIdx = 0;
    for (let i = dataStartLine; i < lines.length; i++) {
      const rowValues = lines[i].trim().split(/\s+/);
      for (const valStr of rowValues) {
        if (valStr === '') continue;
        const val = parseFloat(valStr);
        if (val !== nodata && !isNaN(val)) {
          data[currentIdx] = val;
        } else {
          data[currentIdx] = min; // Set NoData to minimum elevation instead of 0
        }
        currentIdx++;
        if (currentIdx >= width * height) break;
      }
      if (currentIdx >= width * height) break;
    }

    const slopeInfo = calculateSlope(data, width, height, cellSize, yll);
    
    // Start flow accumulation calculation in background
    const flowWorker = new Worker(new URL('./workers/flow-accumulation-worker.ts', import.meta.url), { type: 'module' });
    flowWorker.onmessage = (e) => {
      if (e.data.accumulation) {
        setFlowAcc(e.data.accumulation);
        flowWorker.terminate();
      }
    };
    flowWorker.postMessage({
      dem: data,
      width,
      height,
      params: { cellSize }
    });

    setDem({
      data,
      slope: slopeInfo.data,
      width,
      height,
      min,
      max,
      xll,
      yll,
      cellSize
    });

    setValidationReport({
      minHeight: min,
      maxHeight: max,
      avgHeight: data.reduce((a, b) => a + b, 0) / data.length,
      maxSlope: slopeInfo.maxSlope,
      avgSlope: slopeInfo.avgSlope,
      isValid: max > min && cellSize > 0
    });

    setCoords({ lat: yll, lon: xll, cellSize });
    setParams(prev => ({ ...prev, sourceX: Math.floor(width / 2), sourceY: Math.floor(height / 2) }));
  };

  const startSimulation = () => {
    try {
      if (!dem) {
        console.error("Simulation failed: DEM data is missing.");
        return;
      }
      setIsSimulating(true);
      setProgress(0);

      if (workerRef.current) {
        console.log("Terminating existing worker...");
        workerRef.current.terminate();
      }

      const worker = new BathtubWorker();
      workerRef.current = worker;

      let simulatedProgress = 0;
      const progressInterval = setInterval(() => {
        simulatedProgress += (100 - simulatedProgress) * 0.12; // Smooth cubic deceleration
        setProgress(Math.min(95, simulatedProgress));
      }, 150);

      worker.onerror = (err) => {
        clearInterval(progressInterval);
        console.error("Worker error details:", {
          message: err.message,
          filename: err.filename,
          lineno: err.lineno,
          colno: err.colno,
          error: err.error
        });
        setIsSimulating(false);
        alert("Simülasyon başlatılırken bir hata oluştu. Lütfen tarayıcı konsolunu (F12) kontrol edin.");
      };

      worker.onmessage = (e) => {
        if (e.data.type === 'progress') {
          if (e.data.waterDepth) {
            setWaterDepth(e.data.waterDepth);
          }
        } else if (e.data.type === 'complete') {
          clearInterval(progressInterval);
          setProgress(100);
          setWaterDepth(e.data.waterDepth);
          // Small visual delay for the "100%" complete state to be seen satisfyingly
          setTimeout(() => {
            setIsSimulating(false);
            setCurrentStep(5);
          }, 350);
        }
      };

    let effectiveCellSize = coords.cellSize;
    if (coords.cellSize < 0.1) {
      const metersPerDegree = 111320;
      const latRad = (coords.lat * Math.PI) / 180;
      const metersPerDegreeLon = metersPerDegree * Math.cos(latRad);
      effectiveCellSize = coords.cellSize * (metersPerDegree + metersPerDegreeLon) / 2;
    }

    let finalSourceX = params.sourceX;
    let finalSourceY = params.sourceY;

    // If no source KML, try to find highest point on river
    if (!sourceWgs && riverKml && dem) {
      let maxElev = -Infinity;
      for (const [lat, lon] of riverKml.coords) {
        try {
          const projected = proj4('EPSG:4326', selectedCRS.def, [lon, lat]);
          const x = Math.floor((projected[0] - dem.xll) / dem.cellSize);
          const y = Math.floor(dem.height - (projected[1] - dem.yll) / dem.cellSize);
          
          if (x >= 0 && x < dem.width && y >= 0 && y < dem.height) {
            const elev = dem.data[y * dem.width + x];
            if (elev > maxElev) {
              maxElev = elev;
              finalSourceX = x;
              finalSourceY = y;
            }
          }
        } catch (e) {}
      }
    }

    worker.postMessage({
      dem: dem.data,
      width: dem.width,
      height: dem.height,
      params: { 
        ...params, 
        sourceX: finalSourceX,
        sourceY: finalSourceY,
        cellSize: effectiveCellSize,
        waterLevel: bathtubLevel
      }
    });
  } catch (error) {
      console.error("Failed to start simulation:", error);
      setIsSimulating(false);
      alert("Simülasyon başlatılamadı. Lütfen tarayıcı konsolunu kontrol edin.");
    }
  };

  const exportToKml = () => {
    if (!dem || !waterDepth) return;

    const minDepth = 0.01; // Match visible flood threshold
    
    let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>HydroFlood Taşkın Analiz Raporu</name>
    
    <!-- STYLES -->
    <Style id="study_area_style">
      <LineStyle>
        <color>ff00ff00</color> <!-- Tam Opak Yeşil Çizgi -->
        <width>2.5</width>
      </LineStyle>
      <PolyStyle>
        <color>1e00ff00</color> <!-- %12 Şeffaf Yeşil Dolgu -->
      </PolyStyle>
    </Style>

    <Style id="source_point_style">
      <IconStyle>
        <color>ff0000ff</color> <!-- Tam Opak Kırmızı İkon KML formatı (aabbggrr) -->
        <scale>1.2</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>
        </Icon>
      </IconStyle>
    </Style>

    <Style id="flood_area_style">
      <PolyStyle>
        <color>99ffaa00</color> <!-- %60 Opaklıkta Turkuaz/Mavi -->
        <outline>0</outline>
      </PolyStyle>
    </Style>

    <Style id="risk_area_style">
      <PolyStyle>
        <color>990000ff</color> <!-- %60 Opaklıkta Kırmızı -->
        <outline>0</outline>
      </PolyStyle>
    </Style>
`;

    const transform = (x: number, y: number) => {
      if (selectedCRS.code === 'EPSG:4326') return [x, y];
      try {
        return proj4(selectedCRS.def, 'EPSG:4326', [x, y]);
      } catch (e) {
        return [x, y];
      }
    };

    // Helper to calculate intersected polygons using turf.js safely
    const safeIntersect = (poly1: any, poly2: any) => {
      try {
        const fc = turf.featureCollection([poly1, poly2]);
        return turf.intersect(fc as any);
      } catch (e) {
        try {
          return (turf as any).intersect(poly1, poly2);
        } catch (err) {
          console.error("Turf intersect fallback failed:", err);
          return null;
        }
      }
    };

    // Helper to convert GeoJSON geometry to KML <Polygon> elements
    const geojsonToKmlPolygons = (geom: any): string[] => {
      if (!geom) return [];
      const polys: string[] = [];

      const convertPolygonCoordinates = (rings: number[][][]) => {
        if (rings.length === 0) return '';
        const outerRing = rings[0].map(c => `${c[0]},${c[1]},0`).join(' ');
        let kmlPoly = `          <Polygon>
            <outerBoundaryIs><LinearRing><coordinates>${outerRing}</coordinates></LinearRing></outerBoundaryIs>`;
        
        for (let i = 1; i < rings.length; i++) {
          const innerRing = rings[i].map(c => `${c[0]},${c[1]},0`).join(' ');
          kmlPoly += `\n            <innerBoundaryIs><LinearRing><coordinates>${innerRing}</coordinates></LinearRing></innerBoundaryIs>`;
        }
        kmlPoly += '\n          </Polygon>';
        return kmlPoly;
      };

      if (geom.type === 'Polygon') {
        const kmlStr = convertPolygonCoordinates(geom.coordinates);
        if (kmlStr) polys.push(kmlStr);
      } else if (geom.type === 'MultiPolygon') {
        for (const polyCoords of geom.coordinates) {
          const kmlStr = convertPolygonCoordinates(polyCoords);
          if (kmlStr) polys.push(kmlStr);
        }
      } else if (geom.type === 'GeometryCollection') {
        for (const subGeom of geom.geometries) {
          polys.push(...geojsonToKmlPolygons(subGeom));
        }
      }

      return polys;
    };

    // Helper to do greedy rectangle merging to build raw structures
    interface FloodRect {
      p1: number[];
      p2: number[];
      p3: number[];
      p4: number[];
    }

    const getMergedRectangles = (maskFn: (idx: number) => boolean): FloodRect[] => {
      const visited = new Uint8Array(dem.width * dem.height);
      const rects: FloodRect[] = [];

      for (let y = 0; y < dem.height; y++) {
        for (let x = 0; x < dem.width; x++) {
          const idx = y * dem.width + x;
          if (visited[idx]) continue;

          if (!maskFn(idx)) {
            visited[idx] = 1;
            continue;
          }

          // Find max width for this rectangle
          let width = 0;
          while (x + width + 1 <= dem.width) {
            const nextIdx = y * dem.width + (x + width + 1);
            if (visited[nextIdx] || !maskFn(nextIdx)) break;
            width += 1;
          }

          // Find max height for this rectangle
          let height = 0;
          let canExpandDown = true;
          while (y + height + 1 <= dem.height && canExpandDown) {
            for (let wx = 0; wx <= width; wx++) {
              const downIdx = (y + height + 1) * dem.width + (x + wx);
              if (visited[downIdx] || !maskFn(downIdx)) {
                canExpandDown = false;
                break;
              }
            }
            if (canExpandDown) height += 1;
          }

          // Mark as visited
          for (let hy = 0; hy <= height; hy++) {
            for (let wx = 0; wx <= width; wx++) {
              visited[(y + hy) * dem.width + (x + wx)] = 1;
            }
          }

          // Create coordinates (xmin, ymax, xmax, ymin)
          const xmin = coords.lon + (x * coords.cellSize);
          const xmax = coords.lon + ((x + width + 1) * coords.cellSize);
          const ymax = coords.lat + ((dem.height - y) * coords.cellSize);
          const ymin = ymax - ((height + 1) * coords.cellSize);

          const p1 = transform(xmin, ymax);
          const p2 = transform(xmax, ymax);
          const p3 = transform(xmax, ymin);
          const p4 = transform(xmin, ymin);

          rects.push({ p1, p2, p3, p4 });
        }
      }
      return rects;
    };

    // Generate total flood area merged rectangles
    const floodRects = getMergedRectangles((idx) => waterDepth[idx] >= minDepth);
    const floodPolygons = floodRects.map(r => `          <Polygon>
            <outerBoundaryIs><LinearRing><coordinates>
              ${r.p1[0]},${r.p1[1]},0 ${r.p2[0]},${r.p2[1]},0 ${r.p3[0]},${r.p3[1]},0 ${r.p4[0]},${r.p4[1]},0 ${r.p1[0]},${r.p1[1]},0
            </coordinates></LinearRing></outerBoundaryIs>
          </Polygon>`);

    // Prepare Study Area Polygon for Turf
    let studyAreaPoly: any = null;
    if (areaKml && areaKml.coords.length > 2) {
      const studyCoords = areaKml.coords.map(([lat, lon]) => [lon, lat]);
      if (
        studyCoords[0][0] !== studyCoords[studyCoords.length - 1][0] ||
        studyCoords[0][1] !== studyCoords[studyCoords.length - 1][1]
      ) {
        studyCoords.push([studyCoords[0][0], studyCoords[0][1]]);
      }
      try {
        studyAreaPoly = turf.polygon([studyCoords]);
      } catch (err) {
        console.error("Failed to construct studyAreaPoly:", err);
      }
    }

    // Generate Risk Area Polygons (with Turf dynamic vector geometric intersection clipping)
    const riskPolygons: string[] = [];
    if (studyAreaPoly) {
      for (const r of floodRects) {
        try {
          const fPoly = turf.polygon([[
            [r.p1[0], r.p1[1]],
            [r.p2[0], r.p2[1]],
            [r.p3[0], r.p3[1]],
            [r.p4[0], r.p4[1]],
            [r.p1[0], r.p1[1]]
          ]]);

          const intersected = safeIntersect(studyAreaPoly, fPoly);
          if (intersected) {
            const kmlStrList = geojsonToKmlPolygons(intersected.geometry);
            riskPolygons.push(...kmlStrList);
          }
        } catch (e) {
          console.error("Failed to intersect flood rectangle:", e);
        }
      }
    } else {
      riskPolygons.push(...floodPolygons);
    }

    // 1. Çalışma Alanı Layer
    if (areaKml) {
      kml += `    <Placemark>
      <name>1- Çalışma Alanı</name>
      <description>Yüklenen Çalışma Alanı Sınırı (${areaKml.name})</description>
      <styleUrl>#study_area_style</styleUrl>
      <Polygon>
        <outerBoundaryIs><LinearRing><coordinates>
          ${areaKml.coords.map(([lat, lon]) => `${lon},${lat},0`).join(' ')}
        </coordinates></LinearRing></outerBoundaryIs>
      </Polygon>
    </Placemark>\n`;
    } else if (wgs84Bounds) {
      kml += `    <Placemark>
      <name>1- Çalışma Alanı</name>
      <description>DEM Coğrafi Matriks Sınırları (Çalışma Alanı)</description>
      <styleUrl>#study_area_style</styleUrl>
      <Polygon>
        <outerBoundaryIs><LinearRing><coordinates>
          ${wgs84Bounds[0][1]},${wgs84Bounds[0][0]},0
          ${wgs84Bounds[1][1]},${wgs84Bounds[0][0]},0
          ${wgs84Bounds[1][1]},${wgs84Bounds[1][0]},0
          ${wgs84Bounds[0][1]},${wgs84Bounds[1][0]},0
          ${wgs84Bounds[0][1]},${wgs84Bounds[0][0]},0
        </coordinates></LinearRing></outerBoundaryIs>
      </Polygon>
    </Placemark>\n`;
    }

    // 2. Kaynak Noktası Layer
    if (sourceWgs) {
      kml += `    <Placemark>
      <name>2- Kaynak Noktası</name>
      <description>Simülasyon Başlangıç/Kaynak Noktası Koordinatları</description>
      <styleUrl>#source_point_style</styleUrl>
      <Point>
        <coordinates>${sourceWgs[1]},${sourceWgs[0]},0</coordinates>
      </Point>
    </Placemark>\n`;
    }

    // 3. Riskli Alan Layer
    if (riskPolygons.length > 0) {
      kml += `    <Placemark>
      <name>3- Riskli Alan</name>
      <description>Üretilen Taşkın Alanı ile Çalışma Alanının Kesişiminden Oluşan Riskli Alan</description>
      <styleUrl>#risk_area_style</styleUrl>
      <MultiGeometry>
${riskPolygons.join('\n')}
      </MultiGeometry>
    </Placemark>\n`;
    }

    // 4. Taşkın Alanı Layer
    if (floodPolygons.length > 0) {
      kml += `    <Placemark>
      <name>4- Taşkın Alanı</name>
      <description>Simülasyon Sonucunda Oluşan Toplam Taşkın Alanı Sınırları</description>
      <styleUrl>#flood_area_style</styleUrl>
      <MultiGeometry>
${floodPolygons.join('\n')}
      </MultiGeometry>
    </Placemark>\n`;
    }

    kml += `  </Document>
</kml>`;

    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    
    // Format: HydroFlood_ggaayyyy_saat.kml (e.g., HydroFlood_08062026_1303.kml)
    const d = new Date();
    const pad = (num: number) => String(num).padStart(2, '0');
    const dateStr = `${pad(d.getDate())}${pad(d.getMonth() + 1)}${d.getFullYear()}_${pad(d.getHours())}${pad(d.getMinutes())}`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `HydroFlood_${dateStr}.kml`;
    a.click();
  };

  const calculateStats = () => {
    if (!waterDepth) return null;
    
    let maxDepth = 0;
    let floodedCells = 0;
    let totalVolume = 0;
    
    let areaTotalCells = 0;
    let areaFloodedCells = 0;
    let areaMaxDepth = 0;

    for (let i = 0; i < waterDepth.length; i++) {
      const d = waterDepth[i];
      if (d > maxDepth) maxDepth = d;
      
      const isFlooded = d > 0.01;
      if (isFlooded) {
        floodedCells++;
        totalVolume += d * coords.cellSize * coords.cellSize;
      }

      // Polygon specific analysis
      if (areaMask && areaMask[i] === 1) {
        areaTotalCells++;
        if (isFlooded) {
          areaFloodedCells++;
          if (d > areaMaxDepth) areaMaxDepth = d;
        }
      }
    }
    
    const totalArea = floodedCells * coords.cellSize * coords.cellSize;
    const avgDepth = floodedCells > 0 ? totalVolume / totalArea : 0;
    
    const areaTotalM2 = areaTotalCells * coords.cellSize * coords.cellSize;
    const areaFloodedM2 = areaFloodedCells * coords.cellSize * coords.cellSize;
    const areaRiskPercent = areaTotalCells > 0 ? (areaFloodedCells / areaTotalCells) * 100 : 0;

    return { 
      maxDepth, totalArea, totalVolume, avgDepth, floodedCells,
      areaTotalM2, areaFloodedM2, areaRiskPercent, areaMaxDepth
    };
  };

  const stats = React.useMemo(() => calculateStats(), [waterDepth, coords.cellSize]);

  return (
    <div className="min-h-screen text-slate-100 selection:bg-blue-500/30 selection:text-white">
      {/* Stats Modal */}
      <AnimatePresence>
        {showStats && stats && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowStats(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl glass rounded-[2.5rem] overflow-hidden border border-white/20 shadow-2xl"
            >
              <div className="bg-gradient-to-r from-blue-600 to-cyan-500 p-8 text-white">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <h3 className="text-2xl font-display font-bold">Simülasyon İstatistikleri</h3>
                    <p className="text-blue-100 text-sm">Detaylı taşkın analiz verileri</p>
                  </div>
                  <button 
                    onClick={() => setShowStats(false)}
                    className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>
              
              <div className="p-8 grid grid-cols-2 gap-6">
                {[
                  { label: 'Taşkın Alanı', value: `${stats.totalArea.toLocaleString()} m²`, icon: <Layers className="text-blue-400" /> },
                  { label: 'Maksimum Derinlik', value: `${stats.maxDepth.toFixed(2)} m`, icon: <Droplets className="text-cyan-400" /> },
                  { label: 'Ortalama Derinlik', value: `${stats.avgDepth.toFixed(2)} m`, icon: <Droplets className="text-blue-300" /> },
                  { label: 'Toplam Hacim', value: `${stats.totalVolume.toLocaleString()} m³`, icon: <Droplets className="text-blue-500" /> },
                  { label: 'Etkilenen Hücre', value: stats.floodedCells.toLocaleString(), icon: <MapIcon className="text-slate-400" /> },
                  { label: 'Su Seviyesi Artışı', value: `+${bathtubLevel.toFixed(1)} m`, icon: <Play className="text-cyan-400" /> }
                ].map((stat, idx) => (
                  <div key={idx} className="bg-white/5 border border-white/10 p-5 rounded-2xl flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center shadow-sm border border-white/10">
                      {stat.icon}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{stat.label}</p>
                      <p className="text-lg font-display font-bold text-white">{stat.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {areaKml && (
                <div className="px-8 pb-8">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-3xl space-y-4">
                    <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                      <Layers size={18} />
                      İnceleme Alanı Analizi ({areaKml.name})
                    </h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-white/5 p-4 rounded-2xl shadow-sm border border-white/10">
                        <div className="text-[10px] text-emerald-400 uppercase mb-1 font-bold">Riskli Alan</div>
                        <div className="text-lg font-display font-bold text-emerald-300">{stats.areaFloodedM2.toLocaleString()} m²</div>
                      </div>
                      <div className="bg-white/5 p-4 rounded-2xl shadow-sm border border-white/10">
                        <div className="text-[10px] text-emerald-400 uppercase mb-1 font-bold">Risk Oranı</div>
                        <div className="text-lg font-display font-bold text-emerald-300">%{stats.areaRiskPercent.toFixed(1)}</div>
                      </div>
                      <div className="bg-white/5 p-4 rounded-2xl shadow-sm border border-white/10">
                        <div className="text-[10px] text-emerald-400 uppercase mb-1 font-bold">Maks. Derinlik</div>
                        <div className="text-lg font-display font-bold text-emerald-300">{stats.areaMaxDepth.toFixed(2)} m</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-8 bg-white/5 border-t border-white/10 flex justify-end">
                <button 
                  onClick={() => setShowStats(false)}
                  className="px-6 py-3 bg-blue-600 outline-none text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all"
                >
                  Kapat
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <header className="sticky top-0 z-50 glass border-b border-white/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              {activeTab !== 'dashboard' && (
                <button 
                  onClick={() => {
                    if (activeTab === 'analysis' && currentStep > 1) {
                      setCurrentStep(prev => prev - 1);
                    } else {
                      setActiveTab('dashboard');
                      setCurrentStep(1);
                    }
                  }}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors text-blue-400 border border-white/10"
                >
                  <ChevronLeft size={20} />
                </button>
              )}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                  <Droplets className="text-white" size={22} />
                </div>
                <div>
                  <h1 className="text-3xl font-display font-bold tracking-tight bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                    HydroFlood
                  </h1>
                </div>
              </div>
            </div>

            {isSimulating && (
              <div className="hidden sm:flex items-center gap-3 bg-blue-500/10 px-4 py-2 rounded-xl border border-blue-500/20 animate-pulse">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-ping" />
                <span className="text-xs font-bold text-blue-400">Simülasyon Çalışıyor... %{Math.round(progress)}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isSimulating && (
              <div className="sm:hidden flex items-center gap-2 bg-blue-500/10 p-2 rounded-lg border border-blue-500/20">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-ping" />
                <span className="text-[10px] font-bold text-blue-400">%{Math.round(progress)}</span>
              </div>
            )}
            {activeTab === 'dashboard' && (
              <button 
                onClick={() => setActiveTab('about')}
                className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 hover:bg-blue-500/20 transition-all shadow-sm"
                title="Hakkında"
              >
                <HelpCircle size={22} />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'dashboard' && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 text-center"
          >
            <p className="text-lg text-slate-400 max-w-3xl mx-auto leading-relaxed">
              HydroFlood uygulaması ile hızlı ve profesyonel hidrolojik simülasyonlar üretebilirsiniz.
            </p>
          </motion.div>
        )}
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <Dashboard 
              onSelectMethod={(method) => {
                setSimMethod(method);
                setActiveTab('analysis');
                setCurrentStep(1);
              }}
              onOpenAbout={() => setActiveTab('about')}
            />
          )}
          {activeTab === 'analysis' && (
            <Analysis 
              key="analysis"
              {...{
                currentStep, setCurrentStep, dem, setDem, params, setParams, coords, setCoords,
                selectedCRS, setSelectedCRS, isSimulating, setIsSimulating, progress, setProgress,
                waterDepth, setWaterDepth, outflowType, setOutflowType, showStats, setShowStats,
                simMethod, setSimMethod, bathtubLevel, setBathtubLevel, flowThreshold, setFlowThreshold,
                floodImage, setFloodImage, elevationImage, setElevationImage, reliefImage,
                streamImage, setStreamImage, 
                viewMode, setViewMode, flowAcc, setFlowAcc, riverKml, setRiverKml, sourceKmlName, setSourceKmlName,
                sourceWgs, setSourceWgs, areaKml, setAreaKml, areaMask, setAreaMask, stats, wgs84Bounds,
                startSimulation, handleKmlUpload, handleSourceKmlUpload, handleAreaKmlUpload, handleMapClick,
                exportToKml, handleDemUpload, CRS_LIST, MANNING_PRESETS, workerRef
              }}
            />
          )}
          {activeTab === 'about' && (
            <div className="space-y-6">
              <About />
              <button 
                onClick={() => setActiveTab('dashboard')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20"
              >
                Geri Dön
              </button>
            </div>
          )}
        </AnimatePresence>
      </main>

      <Footer />
    </div>
  );
}
