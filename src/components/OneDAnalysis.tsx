import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  Droplets,
  Map as MapIcon,
  Ruler,
  Clock,
  Play,
  CheckCircle2,
  Upload,
  SplitSquareVertical,
  FileText,
  Download,
  RefreshCw,
  Info,
  BarChart3,
  Sliders,
  Check,
  Compass,
  Globe,
  Layers,
  Eye,
  FileCode,
  FileSpreadsheet,
  Layers as LayersIcon,
  TrendingUp,
  AlertCircle,
  Plus,
  Trash2,
  Edit3,
  ShieldAlert,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  ArrowUpDown,
  BookOpen,
  Navigation,
  Wand2,
  ListFilter,
  RotateCcw
} from 'lucide-react';
import { MapContainer, TileLayer, Polyline, Polygon, CircleMarker, Popup, Tooltip, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import * as XLSX from 'xlsx';
import { 
  generateCrossSections, 
  parseManualCrossSections,
  runRouting, 
  parseKMLCoordinates, 
  parseKMLStructures,
  parseKMLBankLines,
  calibrateSectionsWithBankLines,
  calculateDownstreamSlopeFromDEM,
  detectThalwegCenterline,
  coordsToKMLFile,
  ThalwegDetectionResult,
  detectBankTopsFromDEM,
  BankTopsDetectionResult,
  bankCoordsToKMLFile,
  BankLineItem,
  BankLinesParseResult,
  CrossSection, 
  RoutingResult,
  HydraulicStructure,
  StructureHydraulicResult,
  StructureType,
  checkCrossSectionIntersections,
  deconflictExistingCrossSections,
  DeconflictReport,
  IntersectionCheckResult
} from '../utils/OneDEngine';
import { CRS_LIST, CRSItem } from '../utils/crsList';
import { MapAutoCenter } from './MapHelpers';
import ManningLibraryModal from './ManningLibraryModal';
import { CrossSectionManagerModal } from './CrossSectionManagerModal';

interface OneDAnalysisProps {
  onBackToDashboard: () => void;
}

// Leaflet Map Click Listener for interactive placement
function MapLocationPicker({ onMapClick, active }: { onMapClick: (lat: number, lon: number) => void; active: boolean }) {
  useMapEvents({
    click(e) {
      if (active) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    }
  });
  return null;
}

// Helper to find nearest cross-section and station distance
function findNearestStationOnReach(
  lat: number,
  lon: number,
  sectionsList: CrossSection[]
): { station: number; coordinates: [number, number]; nearestSec: CrossSection | null } {
  if (sectionsList.length > 0) {
    let closestSec = sectionsList[0];
    let minD = Infinity;
    for (const sec of sectionsList) {
      if (sec.centerCoord) {
        const d = Math.hypot(sec.centerCoord[0] - lat, sec.centerCoord[1] - lon);
        if (d < minD) {
          minD = d;
          closestSec = sec;
        }
      }
    }
    return {
      station: Math.round(closestSec.station),
      coordinates: closestSec.centerCoord || [lat, lon],
      nearestSec: closestSec
    };
  }
  return {
    station: 0,
    coordinates: [lat, lon],
    nearestSec: null
  };
}

const BASEMAP_OPTIONS = [
  { id: 'hybrid', label: 'Uydu Hibrit (Google)', url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', attribution: '&copy; Google Maps' },
  { id: 'satellite', label: 'Uydu Saf (Google)', url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', attribution: '&copy; Google Maps' },
  { id: 'esri', label: 'Esri World Imagery', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '&copy; Esri' },
  { id: 'topo', label: 'Topografik (OpenTopo)', url: 'https://{s}.tile.opentopomap.org/{z}/{y}/{x}.png', attribution: '&copy; OpenTopoMap' },
  { id: 'street', label: 'Standart Sokak (OSM)', url: 'https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png', attribution: '&copy; OpenStreetMap' }
];

export interface HydrographPoint {
  time: number; // Hours
  flow: number; // m3/s
}

const OneDAnalysis: React.FC<OneDAnalysisProps> = ({ onBackToDashboard }) => {
  // Navigation & View Mode
  const [isResultPage, setIsResultPage] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<'controls' | 'preview'>('controls');
  const [rightPanelTab, setRightPanelTab] = useState<'map' | 'section' | 'hydrograph'>('map');
  const [resultTab, setResultTab] = useState<'profile' | 'section' | 'map'>('profile');
  const [activeBasemap, setActiveBasemap] = useState<string>('hybrid');
  const [showBasemapMenu, setShowBasemapMenu] = useState<boolean>(false);
  const [isFileOpened, setIsFileOpened] = useState<boolean>(false);

  // Flood Inundation Map Layer Toggles
  const [showFloodPolygons, setShowFloodPolygons] = useState<boolean>(true);
  const [showFloodBoundary, setShowFloodBoundary] = useState<boolean>(true);
  const [showWettedWidths, setShowWettedWidths] = useState<boolean>(true);
  const [showCenterlineLayer, setShowCenterlineLayer] = useState<boolean>(true);
  const [showTransectLines, setShowTransectLines] = useState<boolean>(false);
  const [showStructuresLayer, setShowStructuresLayer] = useState<boolean>(true);

  // Coordinate System (CRS) Selection (defaults to TUREF / TM36 (3°) EPSG:5256)
  const [selectedCRS, setSelectedCRS] = useState<CRSItem>(
    CRS_LIST.find(c => c.code === 'EPSG:5256') || CRS_LIST[0]
  );

  // File Inputs
  const [demFile, setDemFile] = useState<File | null>(null);
  const [centerlineFile, setCenterlineFile] = useState<File | null>(null);
  const [originalCenterlineFile, setOriginalCenterlineFile] = useState<File | null>(null);
  const [originalCenterlineCoords, setOriginalCenterlineCoords] = useState<[number, number][]>([]);
  const [detectedThalwegCoords, setDetectedThalwegCoords] = useState<[number, number][]>([]);
  const [thalwegResult, setThalwegResult] = useState<ThalwegDetectionResult | null>(null);
  const [isDetectingThalweg, setIsDetectingThalweg] = useState<boolean>(false);
  const [useDetectedThalweg, setUseDetectedThalweg] = useState<boolean>(false);
  const [showOriginalCenterline, setShowOriginalCenterline] = useState<boolean>(true);
  const [banksFile, setBanksFile] = useState<File | null>(null);
  const [centerlineCoords, setCenterlineCoords] = useState<[number, number][]>([]);
  const [bankCoords, setBankCoords] = useState<[number, number][]>([]);
  const [leftBankCoords, setLeftBankCoords] = useState<[number, number][]>([]);
  const [rightBankCoords, setRightBankCoords] = useState<[number, number][]>([]);
  const [bankLinesInfo, setBankLinesInfo] = useState<{
    leftName?: string;
    rightName?: string;
    totalLines: number;
    totalPoints: number;
  } | null>(null);
  const [showBankLinesLayer, setShowBankLinesLayer] = useState<boolean>(true);
  const [isDetectingBankTops, setIsDetectingBankTops] = useState<boolean>(false);
  const [bankTopsResult, setBankTopsResult] = useState<BankTopsDetectionResult | null>(null);
  const [bankTopsCorridorWidth, setBankTopsCorridorWidth] = useState<number>(80);

  // Manning Library Modal State
  const [isManningModalOpen, setIsManningModalOpen] = useState<boolean>(false);

  // DEM Downstream Bed Slope Calculation Info
  const [slopeCalculationInfo, setSlopeCalculationInfo] = useState<{
    slope: number;
    percent: number;
    method: string;
    deltaZ: number;
    reachLength: number;
    upstreamZ?: number;
    downstreamZ?: number;
  } | null>(null);

  // Cross-Section Settings & Manual KML
  const [crossSectionMode, setCrossSectionMode] = useState<'auto' | 'manual'>('auto');
  const [manualKmlFile, setManualKmlFile] = useState<File | null>(null);
  const [crossSectionInterval, setCrossSectionInterval] = useState<number>(50);
  const [sectionWidth, setSectionWidth] = useState<number>(200);
  const [sections, setSections] = useState<CrossSection[]>([]);
  const [originalSections, setOriginalSections] = useState<CrossSection[]>([]);
  const [deletedSectionsList, setDeletedSectionsList] = useState<CrossSection[]>([]);
  const [isSectionManagerModalOpen, setIsSectionManagerModalOpen] = useState<boolean>(false);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [selectedSectionIdx, setSelectedSectionIdx] = useState<number>(0);

  // Cross-Section Deconfliction Settings (±10° Açı Düzeltmesi & Boy Kısaltma)
  const [autoDeconflictSections, setAutoDeconflictSections] = useState<boolean>(true);
  const [maxAngleAdjustment, setMaxAngleAdjustment] = useState<number>(10);
  const [isDeconflicting, setIsDeconflicting] = useState<boolean>(false);
  const [deconflictReport, setDeconflictReport] = useState<DeconflictReport | null>(null);

  // Real-time intersection analysis across all active cross-sections
  const intersectionCheck = useMemo<IntersectionCheckResult>(() => {
    return checkCrossSectionIntersections(sections);
  }, [sections]);

  // Manning Roughness Coefficients (n)
  const [manningLOB, setManningLOB] = useState<number>(0.060); // Sol Taşkın Yatağı
  const [manningMain, setManningMain] = useState<number>(0.035); // Ana Kanal
  const [manningROB, setManningROB] = useState<number>(0.060); // Sağ Taşkın Yatağı

  // Flow / Hydrograph Mode
  const [flowMode, setFlowMode] = useState<'steady' | 'hydrograph'>('steady');
  const [peakFlow, setPeakFlow] = useState<number>(150); // m3/s
  const [downstreamSlope, setDownstreamSlope] = useState<number>(0.001); // m/m
  const [simDuration, setSimDuration] = useState<number>(24); // hours
  const [hydrographData, setHydrographData] = useState<HydrographPoint[]>([]);
  const [hydrographFileName, setHydrographFileName] = useState<string | null>(null);

  // Computed topographic bed slope from cross sections
  const detectedBedSlope = useMemo(() => {
    if (sections.length < 2) return null;
    const sStart = sections[0];
    const sEnd = sections[sections.length - 1];
    const dStat = Math.abs(sEnd.station - sStart.station);
    if (dStat <= 0) return null;
    const dZ = Math.abs(sStart.minElevation - sEnd.minElevation);
    const s = dZ / dStat;
    return Math.max(0.0001, Math.min(0.2, Number(s.toFixed(5))));
  }, [sections]);

  // Simulation State & Results
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simResults, setSimResults] = useState<RoutingResult[]>([]);

  // Hydraulic Structures (Bridges & Culverts)
  const [structures, setStructures] = useState<HydraulicStructure[]>([]);
  const [structureResults, setStructureResults] = useState<StructureHydraulicResult[]>([]);
  const [structuresKmlFile, setStructuresKmlFile] = useState<File | null>(null);
  const [isStructureModalOpen, setIsStructureModalOpen] = useState<boolean>(false);
  const [editingStructure, setEditingStructure] = useState<HydraulicStructure | null>(null);
  const [isSelectingLocationOnMap, setIsSelectingLocationOnMap] = useState<boolean>(false);
  const [expandedStructureId, setExpandedStructureId] = useState<string | null>(null);

  const currentBasemap = BASEMAP_OPTIONS.find(b => b.id === activeBasemap) || BASEMAP_OPTIONS[0];

  // Compute map bounds from centerline, bank lines, or cross-sections
  const mapBounds = useMemo<[[number, number], [number, number]] | null>(() => {
    const allPoints: [number, number][] = [];
    if (centerlineCoords.length > 0) {
      allPoints.push(...centerlineCoords);
    }
    if (leftBankCoords.length > 0) {
      allPoints.push(...leftBankCoords);
    }
    if (rightBankCoords.length > 0) {
      allPoints.push(...rightBankCoords);
    }
    if (sections.length > 0) {
      sections.forEach(s => {
        if (s.cutLine) {
          allPoints.push(s.cutLine[0], s.cutLine[1]);
        }
      });
    }
    structures.forEach(s => {
      if (s.coordinates) {
        allPoints.push(s.coordinates);
      }
    });
    if (allPoints.length === 0) return null;

    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;
    allPoints.forEach(([lat, lon]) => {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    });

    if (detectedThalwegCoords.length > 0) {
      allPoints.push(...detectedThalwegCoords);
    }
    return [
      [minLat - 0.002, minLon - 0.002],
      [maxLat + 0.002, maxLon + 0.002]
    ];
  }, [centerlineCoords, detectedThalwegCoords, leftBankCoords, rightBankCoords, sections, structures]);

  // Handle Centerline KML Upload
  const handleCenterlineUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCenterlineFile(file);
      setOriginalCenterlineFile(file);
      setDetectedThalwegCoords([]);
      setThalwegResult(null);
      setUseDetectedThalweg(false);
      try {
        const coords = await parseKMLCoordinates(file);
        setCenterlineCoords(coords);
        setOriginalCenterlineCoords(coords);
      } catch (err) {
        console.error("KML koordinatları okunamadı:", err);
      }
    }
  };

  // Detect True River Thalweg (Yatak Tabanı) from DEM
  const handleDetectThalwegCenterline = async (searchCorridorWidth: number = 60) => {
    if (!demFile) {
      alert("Lütfen önce bir DEM (GeoTIFF) dosyası yükleyin.");
      return;
    }
    const targetFile = originalCenterlineFile || centerlineFile;
    if (!targetFile) {
      alert("Lütfen önce bir Nehir Merkez Aksı (KML) yükleyin.");
      return;
    }

    setIsDetectingThalweg(true);
    try {
      const result = await detectThalwegCenterline(
        demFile,
        targetFile,
        searchCorridorWidth,
        10, // 10m spacing
        selectedCRS.def
      );

      setThalwegResult(result);
      setDetectedThalwegCoords(result.adjustedCoords);

      // Automatically construct KML File object from detected coordinates
      const thalwegFile = coordsToKMLFile(
        result.adjustedCoords,
        `dem_talveg_${targetFile.name.replace('.kml', '')}.kml`
      );

      // Switch active centerline to the detected thalweg
      setCenterlineFile(thalwegFile);
      setCenterlineCoords(result.adjustedCoords);
      setUseDetectedThalweg(true);

    } catch (err: any) {
      console.error("DEM Thalweg tespiti hatası:", err);
      alert("DEM verisinden dere ekseni tespit edilirken bir hata oluştu: " + (err.message || err));
    } finally {
      setIsDetectingThalweg(false);
    }
  };

  // Toggle between original KML centerline and DEM detected Thalweg centerline
  const handleToggleCenterlineSource = (useThalweg: boolean) => {
    if (useThalweg && thalwegResult && detectedThalwegCoords.length > 0) {
      const targetFile = originalCenterlineFile || centerlineFile;
      const fileName = targetFile ? `dem_talveg_${targetFile.name.replace('.kml', '')}.kml` : 'dem_talveg_eksen.kml';
      const thalwegFile = coordsToKMLFile(detectedThalwegCoords, fileName);
      setCenterlineFile(thalwegFile);
      setCenterlineCoords(detectedThalwegCoords);
      setUseDetectedThalweg(true);
    } else if (!useThalweg && originalCenterlineFile && originalCenterlineCoords.length > 0) {
      setCenterlineFile(originalCenterlineFile);
      setCenterlineCoords(originalCenterlineCoords);
      setUseDetectedThalweg(false);
    }
  };

  // Download detected thalweg centerline as KML
  const handleDownloadThalwegKML = () => {
    if (!detectedThalwegCoords || detectedThalwegCoords.length === 0) return;
    const targetFile = originalCenterlineFile || centerlineFile;
    const fileName = targetFile ? `dem_talveg_${targetFile.name.replace('.kml', '')}.kml` : 'dem_talveg_eksen.kml';
    const kmlFile = coordsToKMLFile(detectedThalwegCoords, fileName);
    
    const url = URL.createObjectURL(kmlFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle Bank Stations KML Upload (Fixed: Both Left & Right Banks parsed & calibrated)
  const handleBanksUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setBanksFile(file);
      try {
        const parsed = await parseKMLBankLines(file, centerlineCoords);
        const lCoords = parsed.leftBank?.coords || [];
        const rCoords = parsed.rightBank?.coords || [];
        
        setLeftBankCoords(lCoords);
        setRightBankCoords(rCoords);
        setBankCoords(lCoords.length > 0 ? lCoords : rCoords);
        setBankLinesInfo({
          leftName: parsed.leftBank?.name || (lCoords.length > 0 ? 'Sol Kıyı' : undefined),
          rightName: parsed.rightBank?.name || (rCoords.length > 0 ? 'Sağ Kıyı' : undefined),
          totalLines: parsed.allLines.length,
          totalPoints: parsed.totalPoints
        });

        // Automatically calibrate existing cross sections with true bank lines!
        if (sections.length > 0 && (lCoords.length > 0 || rCoords.length > 0)) {
          const calibrated = calibrateSectionsWithBankLines(sections, lCoords, rCoords);
          setSections(calibrated);
        }
      } catch (err: any) {
        console.error("Kıyı KML koordinatları okunamadı:", err);
        alert("Kıyı çizgileri KML dosyası okunamadı: " + err.message);
      }
    }
  };

  // Swap Left & Right bank lines
  const handleSwapBankLines = () => {
    const tempL = [...leftBankCoords];
    const tempR = [...rightBankCoords];
    setLeftBankCoords(tempR);
    setRightBankCoords(tempL);
    if (bankLinesInfo) {
      setBankLinesInfo({
        ...bankLinesInfo,
        leftName: bankLinesInfo.rightName || 'Sol Şev Üstü',
        rightName: bankLinesInfo.leftName || 'Sağ Şev Üstü'
      });
    }
    if (sections.length > 0) {
      const calibrated = calibrateSectionsWithBankLines(sections, tempR, tempL);
      setSections(calibrated);
    }
  };

  // Automatically detect river bank tops (şev üstleri / breaklines) from DEM and Centerline
  const handleDetectBankTops = async (searchCorridor: number = bankTopsCorridorWidth) => {
    if (!demFile) {
      alert("Lütfen önce bir DEM (Topografya) GeoTIFF dosyası yükleyin.");
      return;
    }
    if (!centerlineFile && centerlineCoords.length === 0) {
      alert("Lütfen önce Dere Ekseni (KML) yükleyin.");
      return;
    }

    setIsDetectingBankTops(true);
    try {
      const targetInput = centerlineFile || centerlineCoords;
      const result = await detectBankTopsFromDEM(
        demFile,
        targetInput,
        searchCorridor,
        10, // 10m spacing along river
        selectedCRS.def
      );

      setBankTopsResult(result);
      setLeftBankCoords(result.leftBankCoords);
      setRightBankCoords(result.rightBankCoords);
      setBankCoords(result.leftBankCoords);

      // Construct a KML file object for the detected bank lines
      const kmlFile = bankCoordsToKMLFile(
        result.leftBankCoords,
        result.rightBankCoords,
        'dem_tespit_sev_ustleri.kml'
      );
      setBanksFile(kmlFile);

      setBankLinesInfo({
        leftName: 'Sol Şev Üstü (DEM)',
        rightName: 'Sağ Şev Üstü (DEM)',
        totalLines: 2,
        totalPoints: result.leftBankCoords.length + result.rightBankCoords.length
      });

      // Automatically calibrate existing cross sections with true bank lines!
      if (sections.length > 0) {
        const calibrated = calibrateSectionsWithBankLines(sections, result.leftBankCoords, result.rightBankCoords);
        setSections(calibrated);
        setOriginalSections(calibrated);
      }
    } catch (err: any) {
      console.error("DEM Şev Üstü Tespiti Hatası:", err);
      alert("DEM verisinden dere şev üstleri tespit edilirken hata oluştu: " + (err.message || err));
    } finally {
      setIsDetectingBankTops(false);
    }
  };

  // Download detected bank tops as KML file
  const handleDownloadBankTopsKML = () => {
    if (leftBankCoords.length === 0 && rightBankCoords.length === 0) return;
    const kmlFile = bankCoordsToKMLFile(
      leftBankCoords,
      rightBankCoords,
      'dem_tespit_sev_ustleri.kml'
    );
    const url = URL.createObjectURL(kmlFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dem_tespit_sev_ustleri.kml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Manual Trigger: Compute Downstream Slope from DEM Cross-Sections
  const handleCalculateSlopeFromDEM = () => {
    if (sections.length < 2) {
      alert("Mansap eğimi hesaplamak için en az 2 enkesit gereklidir. Lütfen önce enkesitleri üretin.");
      return;
    }
    const res = calculateDownstreamSlopeFromDEM(sections);
    setDownstreamSlope(res.slope);
    setSlopeCalculationInfo(res);
  };

  // Handle Manual Cross Sections KML Upload
  const handleManualCrossSectionsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setManualKmlFile(file);
      if (!demFile) {
        alert("Lütfen önce bir DEM dosyası yükleyin.");
        return;
      }
      setIsExtracting(true);
      try {
        let data = await parseManualCrossSections(demFile, file, selectedCRS.def);
        if (data.length === 0) {
          alert("KML dosyasında geçerli enkesit çizgileri bulunamadı.");
        } else {
          // Calibrate with bank lines if available
          if (leftBankCoords.length > 0 || rightBankCoords.length > 0) {
            data = calibrateSectionsWithBankLines(data, leftBankCoords, rightBankCoords);
          }
          setSections(data);
          setSelectedSectionIdx(0);
          setIsFileOpened(true);

          // Auto-calculate downstream slope from DEM
          if (data.length >= 2) {
            const slopeCalc = calculateDownstreamSlopeFromDEM(data);
            setDownstreamSlope(slopeCalc.slope);
            setSlopeCalculationInfo(slopeCalc);
          }
        }
      } catch (err: any) {
        console.error(err);
        alert("Manuel enkesit ayrıştırma hatası: " + err.message);
      } finally {
        setIsExtracting(false);
      }
    }
  };

  // Generate Cross Sections from DEM and Centerline (Automatic mode)
  const handleGenerateSections = async () => {
    if (!demFile) {
      alert("Lütfen önce bir DEM (Topografya) dosyası yükleyin.");
      return;
    }
    if (crossSectionMode === 'manual') {
      if (!manualKmlFile) {
        alert("Lütfen manuel enkesit KML dosyasını seçin.");
        return;
      }
      setIsExtracting(true);
      try {
        let data = await parseManualCrossSections(demFile, manualKmlFile, selectedCRS.def);
        if (leftBankCoords.length > 0 || rightBankCoords.length > 0) {
          data = calibrateSectionsWithBankLines(data, leftBankCoords, rightBankCoords);
        }
        setSections(data);
        setOriginalSections(data);
        setDeletedSectionsList([]);
        setSelectedSectionIdx(0);
        setIsFileOpened(true);

        // Auto-calculate downstream slope from DEM
        if (data.length >= 2) {
          const slopeCalc = calculateDownstreamSlopeFromDEM(data);
          setDownstreamSlope(slopeCalc.slope);
          setSlopeCalculationInfo(slopeCalc);
        }
      } catch (err: any) {
        console.error(err);
        alert("Manuel enkesit ayrıştırma hatası: " + err.message);
      } finally {
        setIsExtracting(false);
      }
      return;
    }

    if (!centerlineFile) {
      alert("Lütfen Nehir Merkez Hattı KML dosyasını yükleyin.");
      return;
    }
    setIsExtracting(true);
    try {
      let data = await generateCrossSections(
        demFile,
        centerlineFile,
        banksFile,
        null,
        crossSectionInterval,
        sectionWidth,
        selectedCRS?.def,
        autoDeconflictSections,
        maxAngleAdjustment
      );
      if (leftBankCoords.length > 0 || rightBankCoords.length > 0) {
        data = calibrateSectionsWithBankLines(data, leftBankCoords, rightBankCoords);
      }
      setSections(data);
      setOriginalSections(data);
      setDeletedSectionsList([]);
      setSelectedSectionIdx(0);
      setIsFileOpened(true);

      const check = checkCrossSectionIntersections(data);
      if (check.hasIntersections) {
        setDeconflictReport({
          initialCollisions: check.totalIntersections,
          angleAdjustedCount: data.filter(s => s.angleAdjustment).length,
          trimmedCount: data.filter(s => s.isTrimmed).length,
          remainingCollisions: check.totalIntersections,
          summary: `${check.totalIntersections} adet kesişme noktası mevcut.`
        });
      } else {
        const adjusted = data.filter(s => s.angleAdjustment).length;
        const trimmed = data.filter(s => s.isTrimmed).length;
        if (adjusted > 0 || trimmed > 0) {
          setDeconflictReport({
            initialCollisions: adjusted + trimmed,
            angleAdjustedCount: adjusted,
            trimmedCount: trimmed,
            remainingCollisions: 0,
            summary: `Tüm kesişmeler giderildi (${adjusted} kesite ±10° açı düzeltmesi, ${trimmed} kesite boy kısaltma uygulandı).`
          });
        } else {
          setDeconflictReport(null);
        }
      }

      // Auto-calculate downstream slope from DEM
      if (data.length >= 2) {
        const slopeCalc = calculateDownstreamSlopeFromDEM(data);
        setDownstreamSlope(slopeCalc.slope);
        setSlopeCalculationInfo(slopeCalc);
      }
    } catch (err: any) {
      console.error(err);
      alert("Enkesit çıkarımı sırasında hata oluştu: " + err.message);
    } finally {
      setIsExtracting(false);
    }
  };

  // Manual deconflict trigger for existing or manual cross-sections
  const handleResolveIntersections = async () => {
    if (!demFile) {
      alert("Enkesit kotlarını yeniden hesaplamak için bir DEM (GeoTIFF) dosyası gereklidir.");
      return;
    }
    if (sections.length < 2) {
      alert("Düzeltilecek enkesit bulunamadı.");
      return;
    }
    setIsDeconflicting(true);
    try {
      const { sections: resolvedSections, report } = await deconflictExistingCrossSections(
        sections,
        demFile,
        selectedCRS?.def,
        maxAngleAdjustment
      );
      setSections(resolvedSections);
      setOriginalSections(resolvedSections);
      setDeconflictReport(report);
    } catch (err: any) {
      console.error(err);
      alert("Kesişme düzeltme sırasında hata oluştu: " + err.message);
    } finally {
      setIsDeconflicting(false);
    }
  };

  // Section Deletion & Management Methods
  const handleDeleteSection = (indexOrStation: number) => {
    let targetIdx = -1;
    if (indexOrStation >= 0 && indexOrStation < sections.length) {
      targetIdx = indexOrStation;
    } else {
      targetIdx = sections.findIndex(s => s.station === indexOrStation);
    }
    if (targetIdx === -1 || !sections[targetIdx]) return;

    const deleted = sections[targetIdx];
    const newSections = sections.filter((_, i) => i !== targetIdx);
    setSections(newSections);
    setDeletedSectionsList(prev => [deleted, ...prev.filter(d => d.station !== deleted.station)]);

    if (selectedSectionIdx >= newSections.length) {
      setSelectedSectionIdx(Math.max(0, newSections.length - 1));
    }

    if (newSections.length >= 2) {
      const slopeCalc = calculateDownstreamSlopeFromDEM(newSections);
      setDownstreamSlope(slopeCalc.slope);
      setSlopeCalculationInfo(slopeCalc);
    }
  };

  const handleBulkDeleteSections = (stationsToDelete: number[]) => {
    if (stationsToDelete.length === 0) return;
    const stationsSet = new Set(stationsToDelete);
    const toDelete = sections.filter(s => stationsSet.has(s.station));
    const newSections = sections.filter(s => !stationsSet.has(s.station));

    setSections(newSections);
    setDeletedSectionsList(prev => [...toDelete, ...prev.filter(d => !stationsSet.has(d.station))]);
    setSelectedSectionIdx(0);

    if (newSections.length >= 2) {
      const slopeCalc = calculateDownstreamSlopeFromDEM(newSections);
      setDownstreamSlope(slopeCalc.slope);
      setSlopeCalculationInfo(slopeCalc);
    }
  };

  const handleRestoreSection = (station: number) => {
    const toRestore = deletedSectionsList.find(s => s.station === station);
    if (!toRestore) return;

    const newSections = [...sections, toRestore].sort((a, b) => a.station - b.station);
    setSections(newSections);
    setDeletedSectionsList(prev => prev.filter(s => s.station !== station));

    if (newSections.length >= 2) {
      const slopeCalc = calculateDownstreamSlopeFromDEM(newSections);
      setDownstreamSlope(slopeCalc.slope);
      setSlopeCalculationInfo(slopeCalc);
    }
  };

  const handleRestoreAllDeletedSections = () => {
    if (originalSections.length > 0) {
      setSections([...originalSections]);
      setDeletedSectionsList([]);
      if (originalSections.length >= 2) {
        const slopeCalc = calculateDownstreamSlopeFromDEM(originalSections);
        setDownstreamSlope(slopeCalc.slope);
        setSlopeCalculationInfo(slopeCalc);
      }
    } else if (deletedSectionsList.length > 0) {
      const newSections = [...sections, ...deletedSectionsList].sort((a, b) => a.station - b.station);
      setSections(newSections);
      setDeletedSectionsList([]);
      if (newSections.length >= 2) {
        const slopeCalc = calculateDownstreamSlopeFromDEM(newSections);
        setDownstreamSlope(slopeCalc.slope);
        setSlopeCalculationInfo(slopeCalc);
      }
    }
  };

  // Download Sample Hydrograph Template (.xlsx)
  const downloadHydrographTemplate = () => {
    const sampleData = [
      { 'Zaman (Saat)': 0, 'Debi (m3/s)': 20.0 },
      { 'Zaman (Saat)': 2, 'Debi (m3/s)': 35.0 },
      { 'Zaman (Saat)': 4, 'Debi (m3/s)': 65.0 },
      { 'Zaman (Saat)': 6, 'Debi (m3/s)': 120.0 },
      { 'Zaman (Saat)': 8, 'Debi (m3/s)': 210.0 },
      { 'Zaman (Saat)': 10, 'Debi (m3/s)': 330.0 },
      { 'Zaman (Saat)': 12, 'Debi (m3/s)': 450.0 }, // Peak
      { 'Zaman (Saat)': 14, 'Debi (m3/s)': 390.0 },
      { 'Zaman (Saat)': 16, 'Debi (m3/s)': 280.0 },
      { 'Zaman (Saat)': 18, 'Debi (m3/s)': 180.0 },
      { 'Zaman (Saat)': 20, 'Debi (m3/s)': 110.0 },
      { 'Zaman (Saat)': 22, 'Debi (m3/s)': 60.0 },
      { 'Zaman (Saat)': 24, 'Debi (m3/s)': 30.0 }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Debi_Hidrografi");
    XLSX.writeFile(wb, "Ornek_Debi_Hidrografi_Sablonu.xlsx");
  };

  // Handle Hydrograph File Upload (.xlsx, .xls, .csv)
  const handleHydrographUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setHydrographFileName(file.name);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const wb = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheetName = wb.SheetNames[0];
        const ws = wb.Sheets[firstSheetName];
        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        const parsedPoints: HydrographPoint[] = [];

        for (let i = 0; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row || row.length < 2) continue;
          const valTime = parseFloat(String(row[0]).replace(',', '.'));
          const valFlow = parseFloat(String(row[1]).replace(',', '.'));
          if (!isNaN(valTime) && !isNaN(valFlow)) {
            parsedPoints.push({ time: valTime, flow: valFlow });
          }
        }

        if (parsedPoints.length < 2) {
          alert("Yüklenen dosyada geçerli zaman ve debi değerleri bulunamadı. Lütfen şablonu referans alınız.");
          return;
        }

        // Sort by time
        parsedPoints.sort((a, b) => a.time - b.time);
        setHydrographData(parsedPoints);

        // Calculate peak flow and duration
        const maxQ = Math.max(...parsedPoints.map(p => p.flow));
        const maxT = Math.max(...parsedPoints.map(p => p.time));
        setPeakFlow(Math.round(maxQ));
        setSimDuration(Math.round(maxT));
      } catch (err: any) {
        console.error("Hidrograf okuma hatası:", err);
        alert("Hidrograf dosyası ayrıştırılamadı: " + err.message);
      }
    }
  };

  // Handle Point-type KML Upload for Hydraulic Structures (Köprü & Menfez)
  const handleStructuresKmlUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setStructuresKmlFile(file);
      try {
        const parsed = await parseKMLStructures(file, sections, centerlineCoords);
        if (parsed.length === 0) {
          alert("KML dosyasında nokta (Point / Placemark) tipinde sanat yapısı bulunamadı.");
          return;
        }
        setStructures(prev => {
          // Merge or replace
          return [...prev, ...parsed];
        });
      } catch (err: any) {
        console.error("Sanat yapısı KML okunamadı:", err);
        alert("KML dosyası okunamadı: " + err.message);
      }
    }
  };

  // Download Sample Structures Point KML
  const downloadSampleStructuresKML = () => {
    let refLat = 39.9200;
    let refLon = 32.8500;
    if (centerlineCoords.length > 0) {
      const midIdx = Math.floor(centerlineCoords.length / 2);
      refLat = centerlineCoords[midIdx][0];
      refLon = centerlineCoords[midIdx][1];
    } else if (sections.length > 0 && sections[0].centerCoord) {
      refLat = sections[0].centerCoord[0];
      refLon = sections[0].centerCoord[1];
    }

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Örnek Sanat Yapıları (Köprü ve Menfezler)</name>
    <description>1B Dinamik Akış Analizi için Nokta (Point) Sanat Yapısı KML Dosyası</description>
    <Placemark>
      <name>K-1 Karayolu Köprüsü</name>
      <description>Genişlik: 16m, Tabliye Kotu: +4m, Ayak Sayısı: 1</description>
      <Point>
        <coordinates>${(refLon + 0.0012).toFixed(6)},${(refLat + 0.0012).toFixed(6)},105.0</coordinates>
      </Point>
    </Placemark>
    <Placemark>
      <name>M-1 Kutu Menfez (3x2m)</name>
      <description>Göz: 2x, Genişlik: 6m, Yükseklik: 2.5m</description>
      <Point>
        <coordinates>${(refLon - 0.0015).toFixed(6)},${(refLat - 0.0015).toFixed(6)},102.0</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>`;

    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "Ornek_Sanat_Yapilari_Nokta.kml");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Add Manual Structure (optionally at a target station)
  const handleAddStructure = (type: StructureType = 'bridge', targetStation?: number) => {
    let defaultStation = targetStation !== undefined ? Math.round(targetStation) : 0;
    if (targetStation === undefined) {
      if (sections.length > 0) {
        defaultStation = Math.round(sections[Math.floor(sections.length / 2)].station);
      } else {
        defaultStation = (structures.length + 1) * 250;
      }
    }

    const matchedSec = sections.find(s => Math.abs(s.station - defaultStation) < 60) || sections[0];
    const bedZ = matchedSec ? matchedSec.minElevation : 100;
    const defaultLowChord = type === 'bridge' ? bedZ + 3.0 : bedZ + 2.0;
    const defaultRoadElev = defaultLowChord + (type === 'bridge' ? 1.2 : 0.8);

    const newStruct: HydraulicStructure = {
      id: `struct_${Date.now()}`,
      name: type === 'bridge' ? `Köprü ${structures.length + 1}` : `Menfez ${structures.length + 1}`,
      type,
      station: defaultStation,
      coordinates: matchedSec?.centerCoord,
      invertElevation: Number(bedZ.toFixed(2)),
      lowChordElevation: Number(defaultLowChord.toFixed(2)),
      roadElevation: Number(defaultRoadElev.toFixed(2)),
      openingWidth: type === 'bridge' ? 16.0 : 6.0,
      openingHeight: type === 'bridge' ? 3.0 : 2.0,
      barrelCount: 1,
      pierCount: type === 'bridge' ? 1 : 0,
      pierWidth: 0.8,
      orificeCoefficient: 0.8,
      weirCoefficient: 1.7,
      isActive: true
    };

    setStructures([...structures, newStruct]);
    setEditingStructure(newStruct);
    setIsStructureModalOpen(true);
  };

  // Interactive Map Click Handler for Structure Placement
  const handleMapLocationSelected = (lat: number, lon: number) => {
    if (editingStructure) {
      const { station, coordinates, nearestSec } = findNearestStationOnReach(lat, lon, sections);
      const bed = nearestSec ? Number(nearestSec.minElevation.toFixed(2)) : editingStructure.invertElevation;
      const diff = editingStructure.lowChordElevation - editingStructure.invertElevation;
      const newLow = Number((bed + (diff > 0.5 ? diff : (editingStructure.type === 'bridge' ? 3.0 : 2.0))).toFixed(2));
      const roadDiff = editingStructure.roadElevation - editingStructure.lowChordElevation;
      const newRoad = Number((newLow + (roadDiff > 0.3 ? roadDiff : 1.0)).toFixed(2));

      const updated: HydraulicStructure = {
        ...editingStructure,
        station,
        coordinates,
        invertElevation: bed,
        lowChordElevation: newLow,
        roadElevation: newRoad
      };

      setEditingStructure(updated);
      setStructures(structures.map(s => s.id === updated.id ? updated : s));
    }
    setIsSelectingLocationOnMap(false);
    setIsStructureModalOpen(true);
  };

  // Save Edited Structure
  const handleSaveStructure = (updated: HydraulicStructure) => {
    setStructures(structures.map(s => s.id === updated.id ? updated : s));
    setEditingStructure(null);
    setIsStructureModalOpen(false);
  };

  // Delete Structure
  const handleDeleteStructure = (id: string) => {
    setStructures(structures.filter(s => s.id !== id));
  };

  // Toggle Structure Active
  const handleToggleStructure = (id: string) => {
    setStructures(structures.map(s => s.id === id ? { ...s, isActive: !s.isActive } : s));
  };

  // Run 1D Hydrodynamic Simulation
  const handleStartAnalysis = () => {
    if (sections.length === 0) {
      if (!demFile) {
        alert("Lütfen önce bir DEM dosyası yükleyip enkesitleri çıkarın.");
        return;
      }
      handleGenerateSections().then(() => {
        executeRouting();
      });
      return;
    }
    executeRouting();
  };

  const executeRouting = () => {
    setIsSimulating(true);
    setTimeout(() => {
      try {
        const { results, structureResults: structRes } = runRouting(
          sections,
          peakFlow,
          manningMain,
          manningLOB,
          manningROB,
          downstreamSlope,
          structures
        );
        setSimResults(results);
        setStructureResults(structRes);
        setIsSimulating(false);
        setIsResultPage(true);
        setResultTab('map'); // Statik simülasyondaki gibi doğrudan Taşkın Yayılım Haritasını aç
        setMobileTab('preview');
      } catch (err: any) {
        console.error(err);
        alert("Simülasyon hesaplama hatası: " + err.message);
        setIsSimulating(false);
      }
    }, 1200);
  };

  // 1D Flood Inundation Polygons & Extents Computation
  const floodMapData = useMemo(() => {
    if (sections.length === 0 || simResults.length === 0) return null;

    interface SectionExtent {
      station: number;
      cutLine: [[number, number], [number, number]];
      wetLeftCoord: [number, number];
      wetRightCoord: [number, number];
      wettedWidth: number;
      waterElevation: number;
      maxDepth: number;
      velocity: number;
      isOverbank: boolean;
      idx: number;
    }

    const sectionExtents: SectionExtent[] = [];

    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      const res = simResults[i];
      if (!sec.cutLine || !res || sec.profile.length < 2) continue;

      const profile = sec.profile;
      const x0 = profile[0].x;
      const x1 = profile[profile.length - 1].x;
      const spanX = Math.max(1, x1 - x0);

      // Use exact hydraulic water contact boundaries from solver (avoids far-away DEM depression artifacts)
      const wetMinX = (res.waterLeftX !== undefined && !isNaN(res.waterLeftX))
        ? res.waterLeftX
        : Math.max(x0, (sec.bankLeftX + sec.bankRightX) / 2 - (res.topWidth || 5) / 2);

      const wetMaxX = (res.waterRightX !== undefined && !isNaN(res.waterRightX))
        ? res.waterRightX
        : Math.min(x1, (sec.bankLeftX + sec.bankRightX) / 2 + (res.topWidth || 5) / 2);

      const rLeft = Math.max(0, Math.min(1, (wetMinX - x0) / spanX));
      const rRight = Math.max(0, Math.min(1, (wetMaxX - x0) / spanX));

      const lat0 = sec.cutLine[0][0];
      const lon0 = sec.cutLine[0][1];
      const lat1 = sec.cutLine[1][0];
      const lon1 = sec.cutLine[1][1];

      const wetLeftCoord: [number, number] = [
        lat0 + rLeft * (lat1 - lat0),
        lon0 + rLeft * (lon1 - lon0)
      ];

      const wetRightCoord: [number, number] = [
        lat0 + rRight * (lat1 - lat0),
        lon0 + rRight * (lon1 - lon0)
      ];

      sectionExtents.push({
        station: sec.station,
        cutLine: sec.cutLine,
        wetLeftCoord,
        wetRightCoord,
        wettedWidth: Math.max(0.5, wetMaxX - wetMinX),
        waterElevation: res.waterElevation,
        maxDepth: res.maxDepth,
        velocity: res.velocity,
        isOverbank: res.isOverbank,
        idx: i
      });
    }

    if (sectionExtents.length < 2) return null;

    interface ReachPolygon {
      id: number;
      coords: [number, number][];
      stationFrom: number;
      stationTo: number;
      avgDepth: number;
      avgWse: number;
      avgWidth: number;
      avgVelocity: number;
      areaM2: number;
      isOverbank: boolean;
      fillColor: string;
      strokeColor: string;
      depthLabel: string;
    }

    const reachPolygons: ReachPolygon[] = [];
    let totalWaterAreaM2 = 0;
    let totalOverbankAreaM2 = 0;

    for (let i = 0; i < sectionExtents.length - 1; i++) {
      const s1 = sectionExtents[i];
      const s2 = sectionExtents[i + 1];

      // Quadrilateral polygon: s1.left -> s2.left -> s2.right -> s1.right
      const coords: [number, number][] = [
        s1.wetLeftCoord,
        s2.wetLeftCoord,
        s2.wetRightCoord,
        s1.wetRightCoord
      ];

      const avgDepth = (s1.maxDepth + s2.maxDepth) / 2;
      const avgWse = (s1.waterElevation + s2.waterElevation) / 2;
      const avgWidth = (s1.wettedWidth + s2.wettedWidth) / 2;
      const avgVelocity = (s1.velocity + s2.velocity) / 2;
      const dx = Math.abs(s2.station - s1.station);
      const reachArea = avgWidth * dx;
      totalWaterAreaM2 += reachArea;

      const isReachOverbank = s1.isOverbank || s2.isOverbank;
      if (isReachOverbank) {
        totalOverbankAreaM2 += reachArea;
      }

      let fillColor = '#0ea5e9';
      let strokeColor = '#0284c7';
      let depthLabel = `0.0 - ${avgDepth.toFixed(1)} m (Kanal İçi Akış - Emniyetli)`;

      if (isReachOverbank) {
        if (avgDepth >= 3.0) {
          fillColor = '#1e3a8a';
          strokeColor = '#0f172a';
          depthLabel = '> 3.0 m (Kritik Taşkın)';
        } else if (avgDepth >= 1.5) {
          fillColor = '#0369a1';
          strokeColor = '#1e3a8a';
          depthLabel = '1.5 - 3.0 m (Derin Taşkın)';
        } else if (avgDepth >= 0.5) {
          fillColor = '#0284c7';
          strokeColor = '#0369a1';
          depthLabel = '0.5 - 1.5 m (Orta Taşkın)';
        } else {
          fillColor = '#38bdf8';
          strokeColor = '#0284c7';
          depthLabel = '0.0 - 0.5 m (Sığ Taşkın)';
        }
      }

      reachPolygons.push({
        id: i,
        coords,
        stationFrom: s1.station,
        stationTo: s2.station,
        avgDepth,
        avgWse,
        avgWidth,
        avgVelocity,
        areaM2: reachArea,
        isOverbank: isReachOverbank,
        fillColor,
        strokeColor,
        depthLabel
      });
    }

    const leftBankLine: [number, number][] = sectionExtents.map(s => s.wetLeftCoord);
    const rightBankLine: [number, number][] = sectionExtents.map(s => s.wetRightCoord);
    const fullFloodPolygon: [number, number][] = [
      ...leftBankLine,
      ...rightBankLine.slice().reverse()
    ];

    const totalLengthM = Math.abs(sectionExtents[sectionExtents.length - 1].station - sectionExtents[0].station);
    const totalWaterAreaHa = totalWaterAreaM2 / 10000;
    const totalOverbankAreaHa = totalOverbankAreaM2 / 10000;
    // If overbank flooding occurred, total flood area is the overbank inundated area; otherwise canal flow area
    const totalFloodAreaM2 = totalOverbankAreaM2 > 0 ? totalOverbankAreaM2 : totalWaterAreaM2;
    const totalFloodAreaHa = totalFloodAreaM2 / 10000;
    const avgWidthTotal = totalLengthM > 0 ? totalFloodAreaM2 / totalLengthM : 0;
    const maxWidthTotal = Math.max(...sectionExtents.map(s => s.wettedWidth));

    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;
    fullFloodPolygon.forEach(([lat, lon]) => {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    });

    const floodBounds: [[number, number], [number, number]] = (minLat !== Infinity)
      ? [[minLat - 0.0015, minLon - 0.0015], [maxLat + 0.0015, maxLon + 0.0015]]
      : [[39.9, 32.8], [40.0, 32.9]];

    return {
      sectionExtents,
      reachPolygons,
      fullFloodPolygon,
      leftBankLine,
      rightBankLine,
      totalFloodAreaM2,
      totalFloodAreaHa,
      totalWaterAreaM2,
      totalWaterAreaHa,
      totalOverbankAreaM2,
      totalOverbankAreaHa,
      avgWidthTotal,
      maxWidthTotal,
      totalLengthM,
      floodBounds
    };
  }, [sections, simResults]);

  // Export Results to CSV
  const exportToCSV = () => {
    if (simResults.length === 0) return;
    const headers = "Kesit_No,Istasyon_m,Taban_Kotu_m,Su_Kotu_m,Su_Derinligi_m,Akis_Hizi_ms,Islak_Alan_m2,Ust_Genislik_m,Froude_Sayisi,Kanal_Tasma_Durumu,Sanat_Yapisi_Etkisi,Kabarma_DeltaH_m\n";
    const rows = simResults.map((r, i) => {
      const structInfo = r.structureEffect 
        ? `${r.structureEffect.structureName} (${r.structureEffect.flowState === 'overtopping' ? 'Yol Tasti' : r.structureEffect.flowState === 'pressure' ? 'Kiris Boguldu' : 'Serbest Akis'})` 
        : '-';
      const backwater = r.structureEffect ? r.structureEffect.backwaterRise.toFixed(2) : '0.00';
      return `${i + 1},${r.station},${r.bedElevation.toFixed(2)},${r.waterElevation.toFixed(2)},${r.maxDepth.toFixed(2)},${r.velocity.toFixed(2)},${r.area.toFixed(2)},${r.topWidth.toFixed(2)},${r.froudeNumber.toFixed(2)},${r.isOverbank ? 'Taşkın Yatağında' : 'Ana Kanalda'},"${structInfo}",${backwater}`;
    }).join("\n");

    const blob = new Blob(["\uFEFF" + headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `1B_Hidrodinamik_Akis_Sonuclari_Q${peakFlow}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Results to GeoJSON (CBS ve GIS yazılımları için)
  const exportToGeoJSON = () => {
    if (!floodMapData || floodMapData.reachPolygons.length === 0) {
      alert("Dışa aktarılacak taşkın yayılım verisi bulunamadı.");
      return;
    }

    const features: any[] = [];

    // 1. Full Inundation Boundary Polygon Feature
    features.push({
      type: "Feature",
      properties: {
        name: `1B Taşkın Yayılım Sınırı (Q=${peakFlow} m³/s)`,
        totalAreaM2: Math.round(floodMapData.totalFloodAreaM2),
        totalAreaHa: Number(floodMapData.totalFloodAreaHa.toFixed(2)),
        maxDepth: Number(maxDepthVal.toFixed(2)),
        reachLengthKm: Number((floodMapData.totalLengthM / 1000).toFixed(3)),
        peakFlow: peakFlow
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            ...floodMapData.fullFloodPolygon.map(([lat, lon]) => [lon, lat]),
            [floodMapData.fullFloodPolygon[0][1], floodMapData.fullFloodPolygon[0][0]]
          ]
        ]
      }
    });

    // 2. Individual Reach Polygons with Depth Categories
    floodMapData.reachPolygons.forEach((reach) => {
      features.push({
        type: "Feature",
        properties: {
          reachId: reach.id + 1,
          stationFrom: reach.stationFrom,
          stationTo: reach.stationTo,
          avgDepth: Number(reach.avgDepth.toFixed(2)),
          avgWSE: Number(reach.avgWse.toFixed(2)),
          avgWidth: Number(reach.avgWidth.toFixed(1)),
          avgVelocity: Number(reach.avgVelocity.toFixed(2)),
          areaM2: Math.round(reach.areaM2),
          depthCategory: reach.depthLabel
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              ...reach.coords.map(([lat, lon]) => [lon, lat]),
              [reach.coords[0][1], reach.coords[0][0]]
            ]
          ]
        }
      });
    });

    const geojson = {
      type: "FeatureCollection",
      features
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `1B_Taskin_Yayilim_Haritasi_Q${peakFlow}.geojson`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Results to KML (Google Earth 3B Poligonları ve Enkesitler)
  const exportToKML = () => {
    if (sections.length === 0) return;
    let kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>1B Hidrodinamik Taşkın Yayılım Haritası (Q=${peakFlow} m³/s)</name>
    <Style id="riverLine">
      <LineStyle><color>ffffaa00</color><width>4</width></LineStyle>
    </Style>
    <Style id="floodPolyShallow">
      <LineStyle><color>ffc78402</color><width>1</width></LineStyle>
      <PolyStyle><color>80f8bd38</color><fill>1</fill><outline>1</outline></PolyStyle>
    </Style>
    <Style id="floodPolyMedium">
      <LineStyle><color>ffa16903</color><width>1</width></LineStyle>
      <PolyStyle><color>99c78402</color><fill>1</fill><outline>1</outline></PolyStyle>
    </Style>
    <Style id="floodPolyDeep">
      <LineStyle><color>ff8a3a1e</color><width>1.5</width></LineStyle>
      <PolyStyle><color>b3a16903</color><fill>1</fill><outline>1</outline></PolyStyle>
    </Style>
    <Style id="floodPolyCritical">
      <LineStyle><color>ff2a170f</color><width>2</width></LineStyle>
      <PolyStyle><color>cc8a3a1e</color><fill>1</fill><outline>1</outline></PolyStyle>
    </Style>
    <Style id="hazardBoundary">
      <LineStyle><color>ff0000ff</color><width>3</width></LineStyle>
    </Style>
    <Style id="transectNorm">
      <LineStyle><color>ff00ff00</color><width>2</width></LineStyle>
    </Style>
    <Style id="transectFlood">
      <LineStyle><color>ff0055ff</color><width>3</width></LineStyle>
    </Style>`;

    // Add Centerline
    if (centerlineCoords.length > 0) {
      kmlContent += `
    <Folder>
      <name>Nehir Aksı</name>
      <Placemark>
        <name>Nehir Merkez Aksı</name>
        <styleUrl>#riverLine</styleUrl>
        <LineString>
          <tessellate>1</tessellate>
          <coordinates>
            ${centerlineCoords.map(([lat, lon]) => `${lon},${lat},0`).join(' ')}
          </coordinates>
        </LineString>
      </Placemark>
    </Folder>`;
    }

    // Add Inundation Polygons (Su Örtüsü)
    if (floodMapData && floodMapData.reachPolygons.length > 0) {
      kmlContent += `
    <Folder>
      <name>1B Taşkın Yayılım Alanı (Derinlik Bazlı Su Örtüsü)</name>`;
      
      floodMapData.reachPolygons.forEach((reach) => {
        let styleId = '#floodPolyShallow';
        if (reach.avgDepth >= 3.0) styleId = '#floodPolyCritical';
        else if (reach.avgDepth >= 1.5) styleId = '#floodPolyDeep';
        else if (reach.avgDepth >= 0.5) styleId = '#floodPolyMedium';

        const desc = `Mesafe: Km ${(reach.stationFrom / 1000).toFixed(3)} - ${(reach.stationTo / 1000).toFixed(3)} | Ort. Su Kotu: ${reach.avgWse.toFixed(2)} m | Ort. Su Derinliği: ${reach.avgDepth.toFixed(2)} m | Yayılım Genişliği: ${reach.avgWidth.toFixed(1)} m | Alan: ${Math.round(reach.areaM2)} m² | Akış Hızı: ${reach.avgVelocity.toFixed(2)} m/s`;

        kmlContent += `
      <Placemark>
        <name>Taşkın Dilimi Km ${(reach.stationFrom / 1000).toFixed(3)} - ${(reach.stationTo / 1000).toFixed(3)}</name>
        <description><![CDATA[${desc}]]></description>
        <styleUrl>${styleId}</styleUrl>
        <Polygon>
          <tessellate>1</tessellate>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>
                ${reach.coords.map(([lat, lon]) => `${lon},${lat},${reach.avgWse.toFixed(2)}`).join(' ')} ${reach.coords[0][1]},${reach.coords[0][0]},${reach.avgWse.toFixed(2)}
              </coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
      </Placemark>`;
      });

      kmlContent += `
    </Folder>
    <Folder>
      <name>Taşkın Yayılım Sınırları (Tehlike Hattı)</name>
      <Placemark>
        <name>Sol Sahil Taşkın Sınırı</name>
        <styleUrl>#hazardBoundary</styleUrl>
        <LineString>
          <tessellate>1</tessellate>
          <coordinates>
            ${floodMapData.leftBankLine.map(([lat, lon]) => `${lon},${lat},0`).join(' ')}
          </coordinates>
        </LineString>
      </Placemark>
      <Placemark>
        <name>Sağ Sahil Taşkın Sınırı</name>
        <styleUrl>#hazardBoundary</styleUrl>
        <LineString>
          <tessellate>1</tessellate>
          <coordinates>
            ${floodMapData.rightBankLine.map(([lat, lon]) => `${lon},${lat},0`).join(' ')}
          </coordinates>
        </LineString>
      </Placemark>
    </Folder>`;
    }

    // Add Transects
    kmlContent += `
    <Folder>
      <name>Hidrolik Enkesitler</name>`;
    sections.forEach((sec, idx) => {
      if (!sec.cutLine) return;
      const res = simResults[idx];
      const isOver = res ? res.isOverbank : false;
      const desc = res 
        ? `İstasyon: ${sec.station}m | Su Kotu: ${res.waterElevation.toFixed(2)}m | Derinlik: ${res.maxDepth.toFixed(2)}m | Hız: ${res.velocity.toFixed(2)}m/s | Froude: ${res.froudeNumber.toFixed(2)}`
        : `İstasyon: ${sec.station}m`;

      kmlContent += `
      <Placemark>
        <name>Enkesit Km ${(sec.station / 1000).toFixed(3)}</name>
        <description><![CDATA[${desc}]]></description>
        <styleUrl>${isOver ? '#transectFlood' : '#transectNorm'}</styleUrl>
        <LineString>
          <tessellate>1</tessellate>
          <coordinates>
            ${sec.cutLine[0][1]},${sec.cutLine[0][0]},0 ${sec.cutLine[1][1]},${sec.cutLine[1][0]},0
          </coordinates>
        </LineString>
      </Placemark>`;
    });
    kmlContent += `
    </Folder>
  </Document>
</kml>`;

    const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `1B_Taskin_Yayilim_Haritasi_Q${peakFlow}.kml`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Statistical calculations for results
  const maxDepthVal = simResults.length > 0 ? Math.max(...simResults.map(r => r.maxDepth)) : 0;
  const maxVelocityVal = simResults.length > 0 ? Math.max(...simResults.map(r => r.velocity)) : 0;
  const avgFroudeVal = simResults.length > 0 ? simResults.reduce((acc, r) => acc + r.froudeNumber, 0) / simResults.length : 0;
  const overbankCount = simResults.filter(r => r.isOverbank).length;
  const overbankPercent = simResults.length > 0 ? (overbankCount / simResults.length) * 100 : 0;

  const currentActiveSection = sections[selectedSectionIdx] || sections[0];
  const currentActiveResult = simResults[selectedSectionIdx] || simResults[0];

  return (
    <div className="w-full h-full flex flex-col min-h-0 overflow-hidden">
      {/* ----------------- RESULT PAGE ----------------- */}
      {isResultPage ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full h-full flex flex-col min-h-0 space-y-2 overflow-hidden"
        >
          {/* Top Bar Action */}
          <div className="flex items-center justify-between gap-3 bg-white p-2.5 sm:p-3 rounded-2xl border border-slate-300 shadow-sm shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-cyan-100 text-cyan-800 rounded-xl">
                <BarChart3 size={18} />
              </div>
              <div>
                <h2 className="text-xs sm:text-sm font-bold text-slate-900">1B Hidrodinamik Simülasyon Sonuçları</h2>
                <p className="text-[10px] text-slate-600 hidden sm:block">
                  Manning ve Saint-Venant akış modeli ile hesaplanan boyuna su yüzeyi profili ve enkesit hidroliği
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsResultPage(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs border border-slate-300 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Sliders size={13} className="text-slate-700" />
                <span>Parametreleri Düzenle</span>
              </button>

              <button
                onClick={exportToKML}
                className="px-3 py-1.5 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Download size={13} />
                <span>KML İndir</span>
              </button>
            </div>
          </div>

          {/* Main Results Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 h-full min-h-0 flex-1">
            {/* LEFT / CENTER VISUALIZATION PANEL (col-span-8) */}
            <div className="lg:col-span-8 flex flex-col gap-2.5 h-full min-h-0">
              <div className="bg-white rounded-2xl p-3 border border-slate-300 shadow-sm flex-1 flex flex-col min-h-0 relative overflow-hidden">
                {/* Result Sub-tabs Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200 shrink-0">
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                      onClick={() => setResultTab('profile')}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                        resultTab === 'profile'
                          ? 'bg-cyan-700 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Activity size={13} />
                      <span>Boyuna Profil (WSE / EGL)</span>
                    </button>
                    <button
                      onClick={() => setResultTab('section')}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                        resultTab === 'section'
                          ? 'bg-cyan-700 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <SplitSquareVertical size={13} />
                      <span>Enkesit İnceleyici (X-Z)</span>
                    </button>
                    <button
                      onClick={() => setResultTab('map')}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                        resultTab === 'map'
                          ? 'bg-cyan-700 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <MapIcon size={13} />
                      <span>Taşkın Haritası</span>
                    </button>
                  </div>

                  {/* Station Scrubbing Selector */}
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    <span>İstasyon:</span>
                    <select
                      value={selectedSectionIdx}
                      onChange={(e) => setSelectedSectionIdx(Number(e.target.value))}
                      className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-cyan-900 shadow-sm focus:outline-none focus:ring-1 focus:ring-cyan-600 cursor-pointer"
                    >
                      {sections.map((s, idx) => (
                        <option key={idx} value={idx}>
                          Km {(s.station / 1000).toFixed(3)} ({s.station}m)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Result Tab 1: Longitudinal Profile */}
                {resultTab === 'profile' && simResults.length > 0 && (
                  <div className="flex-1 flex flex-col min-h-0 pt-2 relative overflow-hidden">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 px-1 mb-1">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-0.5 bg-blue-600 inline-block"></span>
                          <span className="text-blue-700">Su Yüzeyi (WSE)</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-0.5 border-t border-dashed border-amber-600 inline-block"></span>
                          <span className="text-amber-700">Enerji Çizgisi (EGL)</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-0.5 bg-slate-800 inline-block"></span>
                          <span className="text-slate-800">Nehir Taban Kotu (Thalweg)</span>
                        </span>
                      </div>
                      <span className="text-slate-500 font-medium">Toplam Uzunluk: {(sections[sections.length - 1]?.station / 1000).toFixed(2)} km</span>
                    </div>

                    <div className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-2 relative overflow-hidden flex flex-col justify-center">
                      <svg width="100%" height="100%" viewBox="0 0 800 300" preserveAspectRatio="none" className="w-full h-full">
                        {/* Horizontal Grid */}
                        <line x1="40" y1="50" x2="780" y2="50" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
                        <line x1="40" y1="120" x2="780" y2="120" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
                        <line x1="40" y1="190" x2="780" y2="190" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
                        <line x1="40" y1="260" x2="780" y2="260" stroke="#cbd5e1" strokeWidth="1.5" />

                        {(() => {
                          const minZ = Math.min(...simResults.map(r => r.bedElevation));
                          const maxZ = Math.max(...simResults.map(r => r.energyElevation)) + 2;
                          const totalDist = sections[sections.length - 1]?.station || 1;

                          const mapX = (station: number) => 40 + (station / totalDist) * 740;
                          const mapY = (elev: number) => 260 - ((elev - minZ) / (maxZ - minZ || 1)) * 210;

                          const bedPoints = simResults.map(r => `${mapX(r.station)},${mapY(r.bedElevation)}`).join(' ');
                          const wsePoints = simResults.map(r => `${mapX(r.station)},${mapY(r.waterElevation)}`).join(' ');
                          const eglPoints = simResults.map(r => `${mapX(r.station)},${mapY(r.energyElevation)}`).join(' ');

                          const waterPoly = `${mapX(simResults[0].station)},${mapY(simResults[0].bedElevation)} ` +
                            simResults.map(r => `${mapX(r.station)},${mapY(r.waterElevation)}`).join(' ') +
                            ` ${mapX(simResults[simResults.length - 1].station)},${mapY(simResults[simResults.length - 1].bedElevation)} ` +
                            simResults.slice().reverse().map(r => `${mapX(r.station)},${mapY(r.bedElevation)}`).join(' ');

                          const curX = mapX(currentActiveResult?.station || 0);

                          return (
                            <>
                              <polygon points={waterPoly} fill="#0284c7" fillOpacity="0.25" />
                              <polyline points={bedPoints} fill="none" stroke="#1e293b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                              <polyline points={wsePoints} fill="none" stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                              <polyline points={eglPoints} fill="none" stroke="#d97706" strokeWidth="1.5" strokeDasharray="5 3" />
                              <line x1={curX} y1="30" x2={curX} y2="260" stroke="#0ea5e9" strokeWidth="2" strokeDasharray="3 3" />
                              <circle cx={curX} cy={mapY(currentActiveResult?.waterElevation || 0)} r="4" fill="#0284c7" stroke="#fff" strokeWidth="2" />

                              {/* Render Hydraulic Structures (Köprü & Menfez) */}
                              {structures.filter(s => s.isActive).map(struct => {
                                const sX = mapX(struct.station);
                                const yRoad = mapY(struct.roadElevation);
                                const yLow = mapY(struct.lowChordElevation);
                                const yBed = mapY(struct.invertElevation);
                                const deckHeight = Math.max(5, yLow - yRoad);
                                const sRes = structureResults.find(sr => sr.structure.id === struct.id);
                                const isOver = sRes?.isOvertopped || false;
                                const isPress = sRes?.flowState === 'pressure';

                                return (
                                  <g key={struct.id} className="cursor-pointer">
                                    {/* Piers / Yan Duvarlar */}
                                    <line x1={sX - 5} y1={yLow} x2={sX - 5} y2={yBed} stroke="#475569" strokeWidth="2.5" />
                                    <line x1={sX + 5} y1={yLow} x2={sX + 5} y2={yBed} stroke="#475569" strokeWidth="2.5" />
                                    {/* Deck / Tabliye Gövdesi */}
                                    <rect
                                      x={sX - 16}
                                      y={yRoad}
                                      width={32}
                                      height={deckHeight}
                                      fill={isOver ? '#fca5a5' : isPress ? '#fcd34d' : '#94a3b8'}
                                      stroke={isOver ? '#dc2626' : isPress ? '#d97706' : '#334155'}
                                      strokeWidth="1.5"
                                      rx="2"
                                    />
                                    {/* Yapı İsmi */}
                                    <text
                                      x={sX}
                                      y={Math.max(22, yRoad - 6)}
                                      fontSize="9"
                                      fontWeight="bold"
                                      textAnchor="middle"
                                      fill={isOver ? '#b91c1c' : '#1e293b'}
                                    >
                                      {struct.name}
                                    </text>
                                    {/* Taşkın / Uyarı İbaresi */}
                                    {isOver && (
                                      <text
                                        x={sX}
                                        y={Math.max(12, yRoad - 16)}
                                        fontSize="8"
                                        fontWeight="extrabold"
                                        textAnchor="middle"
                                        fill="#dc2626"
                                      >
                                        ⚠️ YOL TAŞTI
                                      </text>
                                    )}
                                  </g>
                                );
                              })}
                            </>
                          );
                        })()}
                      </svg>
                    </div>

                    <div className="pt-2 px-1 flex items-center gap-3">
                      <span className="text-[10px] font-bold text-slate-600 shrink-0">Kesit Kaydırıcı:</span>
                      <input
                        type="range"
                        min="0"
                        max={Math.max(0, sections.length - 1)}
                        value={selectedSectionIdx}
                        onChange={(e) => setSelectedSectionIdx(Number(e.target.value))}
                        className="flex-1 h-1.5 bg-slate-300 rounded-full appearance-none cursor-pointer accent-cyan-700"
                      />
                      <span className="text-xs font-mono font-extrabold text-cyan-800 shrink-0">
                        {currentActiveResult?.station} m
                      </span>
                    </div>
                  </div>
                )}

                {/* Result Tab 2: Cross Section Inspector */}
                {resultTab === 'section' && currentActiveSection && currentActiveResult && (() => {
                  const matchedStruct = structures.find(s => s.isActive && Math.abs(s.station - currentActiveSection.station) < 50);
                  const matchedStructRes = matchedStruct ? structureResults.find(sr => sr.structure.id === matchedStruct.id) : null;
                  const freeboard = matchedStruct ? matchedStruct.lowChordElevation - currentActiveResult.waterElevation : 0;

                  return (
                    <div className="flex-1 flex flex-col min-h-0 pt-2 relative overflow-hidden">
                      {/* Structure Alert Banner if section has a bridge or culvert */}
                      {matchedStruct && (
                        <div className={`px-3 py-1.5 rounded-xl mb-1 text-xs flex items-center justify-between border ${
                          freeboard < 0
                            ? 'bg-red-50 text-red-900 border-red-300'
                            : freeboard < 0.5
                            ? 'bg-amber-50 text-amber-900 border-amber-300'
                            : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                        }`}>
                          <div className="flex items-center gap-2">
                            <span className="font-bold">
                              {matchedStruct.type === 'bridge' ? '🌉 Köprü Geçişi' : '🔲 Menfez Geçişi'}: {matchedStruct.name}
                            </span>
                            <span className="text-[10px] bg-white/80 px-2 py-0.5 rounded-md font-mono border">
                              Kiriş Altı: {matchedStruct.lowChordElevation.toFixed(2)}m | Tabliye: {matchedStruct.roadElevation.toFixed(2)}m
                            </span>
                          </div>
                          <div className="font-bold text-[11px] flex items-center gap-1.5">
                            {freeboard < 0 ? (
                              <>
                                <ShieldAlert size={14} className="text-red-700" />
                                <span>Kiriş Boğuldu / Hava Payı: {freeboard.toFixed(2)} m</span>
                              </>
                            ) : (
                              <>
                                <ShieldCheck size={14} className="text-emerald-700" />
                                <span>Kiriş Altı Emniyetli (Hava Payı: +{freeboard.toFixed(2)} m)</span>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs font-bold text-slate-800 px-1 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-cyan-800">Kesit: Km {(currentActiveSection.station / 1000).toFixed(3)}</span>
                          {currentActiveResult.isOverbank ? (
                            <span className="text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded-full border border-red-300">
                              Taşkın Yatağına Taştı
                            </span>
                          ) : (
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300">
                              Ana Kanalda Sınırlandı
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-600">
                          <span>Su Kotu: <strong>{currentActiveResult.waterElevation.toFixed(2)} m</strong></span>
                          <span>Derinlik: <strong>{currentActiveResult.maxDepth.toFixed(2)} m</strong></span>
                          <span>Hız: <strong>{currentActiveResult.velocity.toFixed(2)} m/s</strong></span>
                        </div>
                      </div>

                      <div className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-3 relative overflow-hidden flex items-center justify-center">
                        <svg width="100%" height="100%" viewBox="0 0 700 280" preserveAspectRatio="none" className="w-full h-full">
                          {(() => {
                            const sec = currentActiveSection;
                            const wl = currentActiveResult.waterElevation;
                            const minX = Math.min(...sec.profile.map(p => p.x));
                            const maxX = Math.max(...sec.profile.map(p => p.x));
                            const minZ = sec.minElevation;
                            const maxZ = Math.max(sec.maxElevation, wl + 1, matchedStruct ? matchedStruct.roadElevation + 0.5 : 0);

                            const mapX = (x: number) => 30 + ((x - minX) / (maxX - minX || 1)) * 640;
                            const mapZ = (z: number) => 250 - ((z - minZ) / (maxZ - minZ || 1)) * 200;

                            const groundPath = `M 30 250 ` + sec.profile.map(p => `L ${mapX(p.x)} ${mapZ(p.z)}`).join(' ') + ` L 670 250 Z`;

                            const wLeftX = (currentActiveResult.waterLeftX !== undefined && !isNaN(currentActiveResult.waterLeftX))
                              ? currentActiveResult.waterLeftX
                              : minX;
                            const wRightX = (currentActiveResult.waterRightX !== undefined && !isNaN(currentActiveResult.waterRightX))
                              ? currentActiveResult.waterRightX
                              : maxX;

                            const wetProfile = sec.profile.filter(p => p.x >= wLeftX - 0.1 && p.x <= wRightX + 0.1 && p.z <= wl);
                            let waterSvg = null;
                            if (wRightX > wLeftX) {
                              const firstWetX = mapX(wLeftX);
                              const lastWetX = mapX(wRightX);
                              const waterTopY = mapZ(wl);

                              const waterPath = `M ${firstWetX} ${waterTopY} ` +
                                wetProfile.map(p => `L ${mapX(p.x)} ${mapZ(p.z)}`).join(' ') +
                                ` L ${lastWetX} ${waterTopY} Z`;

                              waterSvg = (
                                <>
                                  <path d={waterPath} fill={currentActiveResult.isOverbank ? "#ef4444" : "#0284c7"} fillOpacity="0.4" />
                                  <line x1={firstWetX} y1={waterTopY} x2={lastWetX} y2={waterTopY} stroke={currentActiveResult.isOverbank ? "#dc2626" : "#0284c7"} strokeWidth="2.5" />
                                </>
                              );
                            }

                            return (
                              <>
                                <path d={groundPath} fill="#f1f5f9" stroke="#334155" strokeWidth="2" strokeLinejoin="round" />
                                {waterSvg}
                                <line x1={mapX(sec.bankLeftX)} y1="40" x2={mapX(sec.bankLeftX)} y2="250" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" />
                                <line x1={mapX(sec.bankRightX)} y1="40" x2={mapX(sec.bankRightX)} y2="250" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" />

                                <text x={mapX(sec.bankLeftX) - 30} y="35" fontSize="10" fill="#64748b" fontWeight="bold">Sol Taşkın Yt.</text>
                                <text x={mapX((sec.bankLeftX + sec.bankRightX) / 2)} y="35" fontSize="10" textAnchor="middle" fill="#0284c7" fontWeight="bold">Ana Kanal</text>
                                <text x={mapX(sec.bankRightX) + 30} y="35" fontSize="10" fill="#64748b" fontWeight="bold">Sağ Taşkın Yt.</text>

                                {/* Render Bridge / Culvert Superstructure if present */}
                                {matchedStruct && (() => {
                                  const midBankX = (sec.bankLeftX + sec.bankRightX) / 2;
                                  const halfOpening = matchedStruct.openingWidth / 2;
                                  const sLeftX = mapX(midBankX - halfOpening);
                                  const sRightX = mapX(midBankX + halfOpening);
                                  const sRoadY = mapZ(matchedStruct.roadElevation);
                                  const sLowY = mapZ(matchedStruct.lowChordElevation);
                                  const sBedY = mapZ(matchedStruct.invertElevation);

                                  return (
                                    <g>
                                      {/* Bridge deck or culvert top slab */}
                                      <rect
                                        x={sLeftX - 10}
                                        y={sRoadY}
                                        width={Math.max(20, sRightX - sLeftX + 20)}
                                        height={Math.max(6, sLowY - sRoadY)}
                                        fill="#475569"
                                        fillOpacity="0.85"
                                        stroke="#1e293b"
                                        strokeWidth="2"
                                        rx="2"
                                      />
                                      {/* Low chord line */}
                                      <line x1={sLeftX} y1={sLowY} x2={sRightX} y2={sLowY} stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 2" />
                                      {/* Abutments */}
                                      <line x1={sLeftX} y1={sLowY} x2={sLeftX} y2={sBedY} stroke="#334155" strokeWidth="4" />
                                      <line x1={sRightX} y1={sLowY} x2={sRightX} y2={sBedY} stroke="#334155" strokeWidth="4" />
                                      {matchedStruct.pierCount > 0 && (
                                        <line x1={mapX(midBankX)} y1={sLowY} x2={mapX(midBankX)} y2={sBedY} stroke="#334155" strokeWidth="3" />
                                      )}
                                      <text x={mapX(midBankX)} y={Math.max(25, sRoadY - 6)} fontSize="10" fontWeight="bold" textAnchor="middle" fill="#0f172a">
                                        {matchedStruct.name} (Tabliye: {matchedStruct.roadElevation.toFixed(2)}m)
                                      </text>
                                    </g>
                                  );
                                })()}
                              </>
                            );
                          })()}
                        </svg>
                      </div>

                      <div className="pt-2 px-1 flex items-center justify-between text-[11px] text-slate-600">
                        <span>Sol Bank: <strong>{currentActiveSection.bankLeftX.toFixed(0)}m</strong></span>
                        <span>Taban Kotu: <strong>{currentActiveSection.minElevation.toFixed(2)}m</strong></span>
                        <span>Sağ Bank: <strong>{currentActiveSection.bankRightX.toFixed(0)}m</strong></span>
                      </div>
                    </div>
                  );
                })()}

                {/* Result Tab 3: Interactive Flooded Map */}
                {resultTab === 'map' && (
                  <div className="flex-1 w-full min-h-0 rounded-xl overflow-hidden border border-slate-300 relative shadow-inner mt-2 flex flex-col">
                    {/* Top Floating Layer & Basemap Quick Bar */}
                    <div className="absolute top-2.5 left-2.5 right-2.5 z-[400] flex flex-wrap items-center justify-between gap-1.5 pointer-events-none">
                      {/* Layer Toggle Chips */}
                      <div className="flex flex-wrap items-center gap-1 bg-white/95 backdrop-blur-md p-1.5 rounded-xl border border-slate-300 shadow-md pointer-events-auto">
                        <button
                          onClick={() => setShowFloodPolygons(!showFloodPolygons)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                            showFloodPolygons 
                              ? 'bg-cyan-700 text-white shadow-xs' 
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                          title="Derinlik bazlı taşkın yayılım su kütlesi poligonları"
                        >
                          <span>🌊</span>
                          <span>Taşkın Yüzeyi</span>
                        </button>

                        <button
                          onClick={() => setShowFloodBoundary(!showFloodBoundary)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                            showFloodBoundary 
                              ? 'bg-red-600 text-white shadow-xs' 
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                          title="Sol ve sağ taşkın sınır (tehlike) hatları"
                        >
                          <span>🔴</span>
                          <span>Taşkın Sınırları</span>
                        </button>

                        <button
                          onClick={() => setShowWettedWidths(!showWettedWidths)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                            showWettedWidths 
                              ? 'bg-blue-700 text-white shadow-xs' 
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                          title="Enkesitlerdeki su yüzeyi yayılma genişlikleri"
                        >
                          <span>📏</span>
                          <span>Su Genişlikleri</span>
                        </button>

                        <button
                          onClick={() => setShowCenterlineLayer(!showCenterlineLayer)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                            showCenterlineLayer 
                              ? (useDetectedThalweg ? 'bg-cyan-700 text-white shadow-xs' : 'bg-indigo-700 text-white shadow-xs')
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                          title="Nehir talveg / merkez hattı (Orijinal KML veya DEM Thalweg)"
                        >
                          <span>{useDetectedThalweg ? '🌊' : '〰️'}</span>
                          <span>{useDetectedThalweg ? 'DEM Thalweg Aksı' : 'Nehir Aksı'}</span>
                        </button>

                        {(leftBankCoords.length > 0 || rightBankCoords.length > 0 || bankCoords.length > 0) && (
                          <button
                            onClick={() => setShowBankLinesLayer(!showBankLinesLayer)}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                              showBankLinesLayer 
                                ? 'bg-emerald-700 text-white shadow-xs' 
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                            title="Doğal kıyı hatları (Sol ve Sağ Kıyı)"
                          >
                            <span>🌿</span>
                            <span>Kıyı Çizgileri</span>
                          </button>
                        )}

                        <button
                          onClick={() => setShowTransectLines(!showTransectLines)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                            showTransectLines 
                              ? 'bg-slate-800 text-white shadow-xs' 
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                          title="Enkesit kesme çizgileri"
                        >
                          <span>📐</span>
                          <span>Enkesitler</span>
                        </button>

                        {structures.length > 0 && (
                          <button
                            onClick={() => setShowStructuresLayer(!showStructuresLayer)}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                              showStructuresLayer 
                                ? 'bg-amber-600 text-white shadow-xs' 
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                            title="Köprü ve menfez sanat yapıları"
                          >
                            <span>🌉</span>
                            <span>Sanat Yapıları ({structures.length})</span>
                          </button>
                        )}
                      </div>

                      {/* Basemap Selector Pill */}
                      <div className="bg-white/95 backdrop-blur-md p-1 rounded-xl border border-slate-300 shadow-md pointer-events-auto flex items-center gap-1">
                        {BASEMAP_OPTIONS.map((b) => (
                          <button
                            key={b.id}
                            onClick={() => setActiveBasemap(b.id)}
                            className={`px-2 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                              activeBasemap === b.id 
                                ? 'bg-cyan-700 text-white shadow-xs' 
                                : 'text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {b.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Leaflet Map */}
                    <MapContainer
                      center={centerlineCoords[0] || [39.92, 32.85]}
                      zoom={14}
                      className="w-full h-full"
                    >
                      <TileLayer url={currentBasemap.url} attribution={currentBasemap.attribution} maxZoom={24} />

                      {/* 1. Flood Inundation Polygons (Derinlik bazlı renk gradyanı ile) */}
                      {showFloodPolygons && floodMapData?.reachPolygons.map((reach) => (
                        <Polygon
                          key={`reach-poly-${reach.id}`}
                          positions={reach.coords}
                          pathOptions={{
                            fillColor: reach.fillColor,
                            fillOpacity: 0.72,
                            color: reach.strokeColor,
                            weight: 1.2
                          }}
                        >
                          <Tooltip direction="top" opacity={0.95}>
                            <div className="text-xs font-sans">
                              <p className="font-bold text-slate-900">Taşkın Dilimi: Km {(reach.stationFrom / 1000).toFixed(3)} - {(reach.stationTo / 1000).toFixed(3)}</p>
                              <p className="text-cyan-800 font-semibold">{reach.depthLabel}</p>
                              <p className="text-slate-600 text-[11px]">Ort. Derinlik: {reach.avgDepth.toFixed(2)} m | Genişlik: {reach.avgWidth.toFixed(1)} m</p>
                            </div>
                          </Tooltip>
                          <Popup>
                            <div className="text-xs space-y-1.5 min-w-[220px]">
                              <div className="font-bold text-slate-900 border-b pb-1 flex items-center justify-between">
                                <span>🌊 1B Taşkın Yayılım Dilimi</span>
                                <span className="text-[10px] bg-cyan-100 text-cyan-900 px-1.5 py-0.5 rounded font-bold">
                                  Km {(reach.stationFrom / 1000).toFixed(3)} - {(reach.stationTo / 1000).toFixed(3)}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-1.5 text-[11px] pt-0.5">
                                <div className="bg-slate-50 p-1.5 rounded border border-slate-200">
                                  <span className="text-slate-500 block text-[9px]">Ortalama Su Kotu:</span>
                                  <span className="font-bold text-slate-800">{reach.avgWse.toFixed(2)} m</span>
                                </div>
                                <div className="bg-slate-50 p-1.5 rounded border border-slate-200">
                                  <span className="text-slate-500 block text-[9px]">Ortalama Derinlik:</span>
                                  <span className="font-bold text-blue-700">{reach.avgDepth.toFixed(2)} m</span>
                                </div>
                                <div className="bg-slate-50 p-1.5 rounded border border-slate-200">
                                  <span className="text-slate-500 block text-[9px]">Taşkın Genişliği:</span>
                                  <span className="font-bold text-slate-800">{reach.avgWidth.toFixed(1)} m</span>
                                </div>
                                <div className="bg-slate-50 p-1.5 rounded border border-slate-200">
                                  <span className="text-slate-500 block text-[9px]">Akış Hızı:</span>
                                  <span className="font-bold text-slate-800">{reach.avgVelocity.toFixed(2)} m/s</span>
                                </div>
                              </div>
                              <div className="bg-cyan-50 text-cyan-900 p-1.5 rounded text-[10px] font-semibold border border-cyan-200">
                                Bu dilimdeki su alanı: {Math.round(reach.areaM2).toLocaleString()} m² ({(reach.areaM2 / 10000).toFixed(3)} ha)
                              </div>
                            </div>
                          </Popup>
                        </Polygon>
                      ))}

                      {/* 2. Flood Inundation Boundary Hazard Lines (Kırmızı kesikli tehlike hattı) */}
                      {showFloodBoundary && floodMapData && (
                        <>
                          <Polyline positions={floodMapData.leftBankLine} color="#ef4444" weight={2.5} dashArray="5, 5" opacity={0.95}>
                            <Tooltip sticky>Sol Sahil Taşkın Sınırı</Tooltip>
                          </Polyline>
                          <Polyline positions={floodMapData.rightBankLine} color="#ef4444" weight={2.5} dashArray="5, 5" opacity={0.95}>
                            <Tooltip sticky>Sağ Sahil Taşkın Sınırı</Tooltip>
                          </Polyline>
                        </>
                      )}

                      {/* 3. Wetted Surface Width Lines on Cross Sections */}
                      {showWettedWidths && floodMapData?.sectionExtents.map((se) => (
                        <React.Fragment key={`wet-line-${se.idx}`}>
                          <Polyline
                            positions={[se.wetLeftCoord, se.wetRightCoord]}
                            color={se.idx === selectedSectionIdx ? '#f59e0b' : '#06b6d4'}
                            weight={se.idx === selectedSectionIdx ? 4 : 2.5}
                            opacity={0.95}
                            eventHandlers={{
                              click: () => setSelectedSectionIdx(se.idx)
                            }}
                          >
                            <Tooltip direction="top" opacity={0.9}>
                              <span>Km {(se.station / 1000).toFixed(3)}: Genişlik {se.wettedWidth.toFixed(1)}m | Su Kotu: {se.waterElevation.toFixed(2)}m</span>
                            </Tooltip>
                          </Polyline>
                          <CircleMarker
                            center={se.wetLeftCoord}
                            radius={3}
                            pathOptions={{ color: '#0284c7', fillColor: '#38bdf8', fillOpacity: 1, weight: 1.5 }}
                          />
                          <CircleMarker
                            center={se.wetRightCoord}
                            radius={3}
                            pathOptions={{ color: '#0284c7', fillColor: '#38bdf8', fillOpacity: 1, weight: 1.5 }}
                          />
                        </React.Fragment>
                      ))}

                      {/* 4. Stream Centerline & Detected Thalweg */}
                      {showCenterlineLayer && (
                        <>
                          {/* If Thalweg was detected and user is using it, show original as dashed line for visual comparison */}
                          {thalwegResult && originalCenterlineCoords.length > 0 && useDetectedThalweg && (
                            <Polyline
                              positions={originalCenterlineCoords}
                              color="#64748b"
                              weight={2}
                              dashArray="4, 4"
                              opacity={0.65}
                            >
                              <Tooltip sticky>
                                <span className="text-slate-700 font-bold">Orijinal KML Aksı</span>
                              </Tooltip>
                            </Polyline>
                          )}

                          {/* Active River Centerline */}
                          {centerlineCoords.length > 0 && (
                            <Polyline
                              positions={centerlineCoords}
                              color={useDetectedThalweg ? '#0891b2' : '#2563eb'}
                              weight={useDetectedThalweg ? 4 : 3.5}
                              opacity={0.9}
                            >
                              <Tooltip sticky>
                                <div className="text-xs">
                                  <span className="font-bold block text-cyan-900">
                                    {useDetectedThalweg ? '🌊 DEM Yatak Tabanı (Thalweg) Aksı' : '〰️ Nehir Merkez Aksı'}
                                  </span>
                                  {useDetectedThalweg && thalwegResult && (
                                    <span className="text-[10px] text-slate-600">
                                      Ort. Kayma: {thalwegResult.totalShiftDistance} m | Taban Farkı: -{thalwegResult.elevationGain} m
                                    </span>
                                  )}
                                </div>
                              </Tooltip>
                            </Polyline>
                          )}
                        </>
                      )}

                      {/* 5. Natural Banks (Sol ve Sağ Kıyı Hatları) */}
                      {showBankLinesLayer && (
                        <>
                          {leftBankCoords.length > 0 && (
                            <Polyline positions={leftBankCoords} color="#10b981" weight={2.5} dashArray="4, 4" opacity={0.9}>
                              <Tooltip sticky>
                                <span className="font-bold text-emerald-800">🌿 {bankLinesInfo?.leftName || 'Sol Kıyı (LOB)'}</span>
                              </Tooltip>
                            </Polyline>
                          )}
                          {rightBankCoords.length > 0 && (
                            <Polyline positions={rightBankCoords} color="#f59e0b" weight={2.5} dashArray="4, 4" opacity={0.9}>
                              <Tooltip sticky>
                                <span className="font-bold text-amber-800">🌾 {bankLinesInfo?.rightName || 'Sağ Kıyı (ROB)'}</span>
                              </Tooltip>
                            </Polyline>
                          )}
                          {leftBankCoords.length === 0 && rightBankCoords.length === 0 && bankCoords.length > 0 && (
                            <Polyline positions={bankCoords} color="#10b981" weight={2} dashArray="3, 3" opacity={0.8}>
                              <Tooltip sticky>Doğal Kıyı Hattı</Tooltip>
                            </Polyline>
                          )}
                        </>
                      )}

                      {/* 6. Transect Cut Lines */}
                      {showTransectLines && sections.map((sec, idx) => {
                        if (!sec.cutLine) return null;
                        const isSelected = idx === selectedSectionIdx;
                        const secResult = simResults.find(r => r.station === sec.station);
                        return (
                          <Polyline
                            key={`cutline-${sec.station}-${idx}`}
                            positions={sec.cutLine}
                            color={isSelected ? '#f59e0b' : '#64748b'}
                            weight={isSelected ? 3.5 : 1.5}
                            dashArray="3, 3"
                            opacity={0.85}
                            eventHandlers={{
                              click: () => setSelectedSectionIdx(idx)
                            }}
                          >
                            <Popup>
                              <div className="p-1 space-y-1.5 min-w-[170px]">
                                <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                                  <span className="font-bold text-xs text-slate-800">
                                    Kesit Km {(sec.station / 1000).toFixed(3)}
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    {sec.station.toFixed(0)}m
                                  </span>
                                </div>
                                {secResult && (
                                  <div className="text-[10px] text-slate-600 space-y-0.5 bg-slate-50 p-1 rounded">
                                    <div>Su Kotu: <strong>{secResult.waterElevation.toFixed(2)} m</strong></div>
                                    <div>Maks Derinlik: <strong>{secResult.maxDepth.toFixed(2)} m</strong></div>
                                    <div>Akım Hızı: <strong>{secResult.velocity.toFixed(2)} m/s</strong></div>
                                  </div>
                                )}
                                <div className="flex items-center gap-1 pt-1 border-t border-slate-100">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedSectionIdx(idx);
                                      setResultTab('section');
                                    }}
                                    className="flex-1 px-1.5 py-1 bg-cyan-700 hover:bg-cyan-800 text-white rounded text-[10px] font-bold cursor-pointer transition-colors"
                                  >
                                    Enkesiti Gör
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSection(idx)}
                                    className="px-1.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-bold flex items-center gap-0.5 cursor-pointer transition-colors"
                                    title="Bu enkesiti sil"
                                  >
                                    <Trash2 size={10} />
                                    <span>Sil</span>
                                  </button>
                                </div>
                              </div>
                            </Popup>
                          </Polyline>
                        );
                      })}

                      {/* 7. Hydraulic Structures Markers */}
                      {showStructuresLayer && structures.filter(s => s.isActive).map((struct) => {
                        const coord = struct.coordinates || sections.find(sec => Math.abs(sec.station - struct.station) < 60)?.centerCoord;
                        if (!coord) return null;
                        const sRes = structureResults.find(sr => sr.structure.id === struct.id);
                        const markerColor = sRes?.isOvertopped ? '#ef4444' : sRes?.flowState === 'pressure' ? '#f59e0b' : '#0284c7';

                        return (
                          <CircleMarker
                            key={struct.id}
                            center={coord}
                            radius={8}
                            pathOptions={{
                              color: '#ffffff',
                              fillColor: markerColor,
                              fillOpacity: 0.95,
                              weight: 2.5
                            }}
                          >
                            <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
                              <div className="text-xs font-bold">
                                {struct.type === 'bridge' ? '🌉' : '🔲'} {struct.name} (Km {(struct.station / 1000).toFixed(3)})
                              </div>
                            </Tooltip>
                            <Popup>
                              <div className="text-xs space-y-1.5 min-w-[200px]">
                                <div className="font-bold text-slate-900 border-b pb-1 flex items-center justify-between">
                                  <span>{struct.type === 'bridge' ? '🌉 Köprü' : '🔲 Menfez'}: {struct.name}</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                    sRes?.isOvertopped ? 'bg-red-100 text-red-800' : sRes?.flowState === 'pressure' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                                  }`}>
                                    {sRes?.isOvertopped ? 'Yol Taştı' : sRes?.flowState === 'pressure' ? 'Basınçlı' : 'Serbest'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-600 space-y-0.5">
                                  <div>Konum: <strong>Km {(struct.station / 1000).toFixed(3)}</strong> ({struct.station} m)</div>
                                  <div>Tabliye Üst Kotu: <strong>{struct.roadElevation.toFixed(2)} m</strong></div>
                                  <div>Kiriş Altı Kotu: <strong>{struct.lowChordElevation.toFixed(2)} m</strong></div>
                                  <div>Net Açıklık: <strong>{struct.openingWidth} m</strong></div>
                                  {sRes && (
                                    <div className="pt-1 mt-1 border-t border-slate-200">
                                      <div>Menba Su Kotu: <strong>{sRes.upstreamWSE.toFixed(2)} m</strong></div>
                                      <div>Kabarma Artışı ($\Delta h$): <strong className="text-red-700 font-bold">+{sRes.backwaterRise.toFixed(2)} m</strong></div>
                                      <div>Kiriş Hava Payı: <strong className={sRes.freeboard < 0 ? 'text-red-600' : 'text-emerald-700'}>{sRes.freeboard.toFixed(2)} m</strong></div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </Popup>
                          </CircleMarker>
                        );
                      })}

                      {/* Map Auto Center */}
                      {floodMapData?.floodBounds ? (
                        <MapAutoCenter bounds={floodMapData.floodBounds} />
                      ) : (
                        mapBounds && <MapAutoCenter bounds={mapBounds} />
                      )}
                    </MapContainer>

                    {/* Floating Inundation Depth Legend in Bottom-Left */}
                    <div className="absolute bottom-3 left-3 z-[400] bg-white/95 backdrop-blur-md px-3 py-2 rounded-xl text-[11px] text-slate-800 border border-slate-300 shadow-xl space-y-1.5">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        1B Taşkın Yayılım Lejandı
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-xs bg-[#38bdf8] border border-[#0284c7] inline-block"></span>
                          <span>&lt; 0.5 m (Sığ)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-xs bg-[#0284c7] border border-[#0369a1] inline-block"></span>
                          <span>0.5 - 1.5 m (Orta)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-xs bg-[#0369a1] border border-[#1e3a8a] inline-block"></span>
                          <span>1.5 - 3.0 m (Derin)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-xs bg-[#1e3a8a] border border-[#0f172a] inline-block"></span>
                          <span>&gt; 3.0 m (Kritik)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3.5 h-0.5 border-t-2 border-dashed border-red-500 inline-block"></span>
                          <span className="text-red-700 font-semibold">Taşkın Sınırı</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3.5 h-0.5 bg-cyan-500 inline-block"></span>
                          <span>Su Genişliği</span>
                        </div>
                      </div>
                    </div>

                    {/* Floating Area & Distance Metrics Tag in Bottom-Right */}
                    {floodMapData && (
                      <div className="absolute bottom-3 right-3 z-[400] bg-slate-900/90 backdrop-blur-md px-3 py-2 rounded-xl text-slate-200 border border-slate-700 shadow-xl text-right">
                        <div className="text-[10px] text-cyan-300 font-bold uppercase tracking-wider">Toplam Taşkın Alanı</div>
                        <div className="text-sm font-display font-bold text-white">
                          {Math.round(floodMapData.totalFloodAreaM2).toLocaleString()} m²
                          <span className="text-[11px] text-slate-300 font-normal ml-1">
                            ({floodMapData.totalFloodAreaHa.toFixed(2)} ha)
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Nehir Mesafesi: {(floodMapData.totalLengthM / 1000).toFixed(2)} km | Q: {peakFlow} m³/s
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT SIDEBAR PANEL: RESULTS SUMMARY & EXPORT (col-span-4) */}
            <div className="lg:col-span-4 space-y-3 overflow-y-auto h-full min-h-0 custom-scrollbar flex flex-col">
              <div className="bg-white rounded-2xl p-4 border border-slate-300 shadow-sm space-y-4">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Info size={15} className="text-cyan-700" />
                  1B Hidrolik Analiz Özeti
                </h3>

                {/* Primary Metrics Grid (Statik simülasyondaki gibi zenginleştirilmiş) */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-cyan-50/80 border border-cyan-200 p-3 rounded-xl col-span-2">
                    <p className="text-[10px] font-bold text-cyan-800 uppercase flex items-center justify-between">
                      <span>{floodMapData && floodMapData.totalOverbankAreaM2 > 0 ? 'Taşkın Yayılım Alanı (Yatak Dışı İhlal)' : 'Toplam Su Yüzeyi Alanı (Kanal İçi)'}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                        floodMapData && floodMapData.totalOverbankAreaM2 > 0 ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {floodMapData && floodMapData.totalOverbankAreaM2 > 0 ? 'Taşkın Var' : 'Yatak İçi Emniyetli'}
                      </span>
                    </p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <p className="text-lg font-display font-bold text-slate-900">
                        {floodMapData ? Math.round(floodMapData.totalFloodAreaM2).toLocaleString() : '0'} m²
                      </p>
                      <p className="text-xs font-bold text-cyan-700">
                        ({floodMapData ? floodMapData.totalFloodAreaHa.toFixed(2) : '0.00'} ha)
                      </p>
                    </div>
                    {floodMapData && floodMapData.totalOverbankAreaM2 > 0 && (
                      <p className="text-[10px] text-slate-600 mt-1 border-t border-cyan-200/60 pt-1 flex justify-between">
                        <span>Toplam Islak Yüzey (Kanal dahil):</span>
                        <strong className="text-slate-800">{Math.round(floodMapData.totalWaterAreaM2).toLocaleString()} m² ({floodMapData.totalWaterAreaHa.toFixed(2)} ha)</strong>
                      </p>
                    )}
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                    <p className="text-[10px] font-bold text-blue-800 uppercase">Maks. Su Derinliği</p>
                    <p className="text-base font-display font-bold text-slate-900 mt-1">
                      {maxDepthVal.toFixed(2)} m
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                    <p className="text-[10px] font-bold text-blue-800 uppercase">Maks. Akış Hızı</p>
                    <p className="text-base font-display font-bold text-slate-900 mt-1">
                      {maxVelocityVal.toFixed(2)} m/s
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                    <p className="text-[10px] font-bold text-slate-700 uppercase">Ort. Taşkın Genişliği</p>
                    <p className="text-base font-display font-bold text-slate-900 mt-1">
                      {floodMapData ? floodMapData.avgWidthTotal.toFixed(1) : '0.0'} m
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                    <p className="text-[10px] font-bold text-red-800 uppercase">Taşkın Durumu</p>
                    <p className="text-base font-display font-bold text-red-900 mt-1">
                      %{overbankPercent.toFixed(0)} ({overbankCount}/{simResults.length})
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl col-span-2">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-700">
                      <span>Ortalama Froude Sayısı:</span>
                      <span className="font-mono text-slate-900 text-xs">
                        {avgFroudeVal.toFixed(2)} ({avgFroudeVal < 1 ? 'Nehir Rejimi' : 'Sel Rejimi'})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Selected Section Metrics Badge */}
                {currentActiveResult && (
                  <div className="bg-cyan-50 border border-cyan-200 p-3 rounded-xl space-y-1.5 text-xs">
                    <p className="font-bold text-cyan-900 flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-cyan-700" />
                      Seçili İstasyon: Km {(currentActiveResult.station / 1000).toFixed(3)}
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                      <div className="bg-white p-2 rounded-lg border border-cyan-200">
                        <span className="text-slate-500 block text-[9px]">Islak Kesit Alanı:</span>
                        <span className="font-bold text-slate-800">{currentActiveResult.area.toFixed(1)} m²</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-cyan-200">
                        <span className="text-slate-500 block text-[9px]">Su Yüzeyi Genişliği:</span>
                        <span className="font-bold text-slate-800">{currentActiveResult.topWidth.toFixed(1)} m</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Hydraulic Structures Evaluation Card */}
                {structureResults.length > 0 && (
                  <div className="bg-amber-50/80 border border-amber-200 p-3 rounded-xl space-y-2 text-xs">
                    <p className="font-bold text-amber-900 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <LayersIcon size={14} className="text-amber-700" />
                        Sanat Yapıları Değerlendirmesi
                      </span>
                      <span className="text-[10px] bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                        {structureResults.length} Yapı
                      </span>
                    </p>
                    <div className="space-y-1.5 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                      {structureResults.map((sr) => (
                        <div key={sr.structure.id} className="bg-white p-2.5 rounded-lg border border-amber-200 space-y-1 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 text-[11px]">
                              {sr.structure.type === 'bridge' ? '🌉' : '🔲'} {sr.structure.name}
                            </span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                              sr.isOvertopped 
                                ? 'bg-red-100 text-red-800 border border-red-300' 
                                : sr.flowState === 'pressure'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            }`}>
                              {sr.isOvertopped ? 'Yol Üstü Taştı' : sr.flowState === 'pressure' ? 'Kiriş Boğuldu' : 'Serbest Emniyetli'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-600 pt-0.5">
                            <div>Konum: <strong>Km {(sr.station / 1000).toFixed(3)}</strong></div>
                            <div>Kabarma ($\Delta h$): <strong className="text-red-700 font-bold">+{sr.backwaterRise.toFixed(2)} m</strong></div>
                            <div>Menba Su Kotu: <strong>{sr.upstreamWSE.toFixed(2)} m</strong></div>
                            <div>Hava Payı: <strong className={sr.freeboard < 0 ? 'text-red-600 font-bold' : 'text-emerald-700'}>{sr.freeboard.toFixed(2)} m</strong></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action & Export Buttons */}
                <div className="pt-1 space-y-2">
                  <button
                    onClick={exportToKML}
                    className="w-full py-2.5 px-3 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    <MapIcon size={15} />
                    Taşkın Yayılım Haritasını KML İndir
                  </button>

                  <button
                    onClick={exportToGeoJSON}
                    className="w-full py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    <Globe size={14} />
                    Taşkın Sınırlarını GeoJSON İndir (CBS)
                  </button>

                  <button
                    onClick={exportToCSV}
                    className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    <Download size={14} />
                    Profil ve Enkesit Verilerini CSV İndir
                  </button>

                  <button
                    onClick={() => setIsResultPage(false)}
                    className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 border border-slate-300 shadow-sm cursor-pointer"
                  >
                    <Sliders size={14} />
                    Giriş Parametrelerine Dön
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        /* ----------------- TWO-COLUMN SETUP PAGE ----------------- */
        <div className="w-full h-full flex flex-col min-h-0 space-y-2 overflow-hidden">
          {/* Mobile Tab Navigation */}
          <div className="flex lg:hidden bg-white border border-slate-300 rounded-xl p-1 shrink-0 shadow-sm">
            <button
              onClick={() => setMobileTab('controls')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all relative ${
                mobileTab === 'controls' ? 'bg-cyan-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders size={13} />
              <span>Girdi & Parametre Paneli</span>
              {demFile && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse absolute top-1 right-2" />
              )}
            </button>
            <button
              onClick={() => setMobileTab('preview')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                mobileTab === 'preview' ? 'bg-cyan-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye size={13} />
              <span>Harita & Kesit Önizleme</span>
            </button>
          </div>

          {/* Main 2-Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 h-full min-h-0 flex-1">
            {/* LEFT COLUMN: FILE INPUTS & SIMULATION PARAMETERS (col-span-4) */}
            <div
              className={`lg:col-span-4 flex flex-col gap-2.5 h-full min-h-0 overflow-y-auto custom-scrollbar ${
                mobileTab === 'controls' ? 'flex' : 'hidden lg:flex'
              }`}
            >
              {/* 1. TOPOGRAFYA VE KOORDİNAT SİSTEMİ (CRS) */}
              <section className="bg-white rounded-2xl p-3 border border-slate-300 shadow-sm space-y-2.5 shrink-0">
                <div className="pb-1.5 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <FileText size={14} className="text-cyan-700" />
                    <span>1. Topografya & Koordinat Sistemi</span>
                  </h2>
                  {demFile && (
                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full border border-emerald-300 flex items-center gap-0.5">
                      <CheckCircle2 size={10} />
                      Yüklendi
                    </span>
                  )}
                </div>

                {/* DEM File Input */}
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">
                    Topografya Dosyası (DEM):
                  </label>
                  {demFile ? (
                    <div className="bg-emerald-50 border border-emerald-200 p-2 rounded-xl flex items-center justify-between gap-2">
                      <div className="space-y-0.5 overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                          <span className="font-bold text-slate-900 text-xs truncate">{demFile.name}</span>
                        </div>
                        <p className="text-[10px] text-slate-600 truncate">
                          {(demFile.size / (1024 * 1024)).toFixed(2)} MB • GeoTIFF Raster
                        </p>
                      </div>
                      <label className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-800 rounded-lg text-[10px] font-bold cursor-pointer border border-slate-300 shrink-0 transition-all shadow-sm">
                        Değiştir
                        <input
                          type="file"
                          accept=".tif,.tiff,.asc"
                          onChange={(e) => {
                            if (e.target.files?.[0]) setDemFile(e.target.files[0]);
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="flex items-center justify-between gap-2 p-2 border border-dashed border-slate-300 rounded-xl hover:bg-slate-100 transition-all cursor-pointer bg-slate-50 group">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className="p-1 bg-cyan-100 text-cyan-800 rounded-lg group-hover:scale-105 transition-transform shrink-0">
                          <Download size={14} />
                        </div>
                        <span className="font-bold text-xs text-slate-800 truncate">DEM Dosyası Seçin (.tif)</span>
                      </div>
                      <span className="px-2 py-0.5 bg-cyan-700 text-white rounded-lg text-[10px] font-bold shrink-0 shadow-sm">
                        Gözat
                      </span>
                      <input
                        type="file"
                        accept=".tif,.tiff,.asc"
                        onChange={(e) => {
                          if (e.target.files?.[0]) setDemFile(e.target.files[0]);
                        }}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                {/* DEM Koordinat Sistemi (CRS) Seçimi - Identical to Statik Taşkın */}
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">
                    Koordinat Sistemi (CRS):
                  </label>
                  <div className="relative">
                    <select
                      value={selectedCRS.code}
                      onChange={(e) => {
                        const found = CRS_LIST.find(c => c.code === e.target.value);
                        if (found) setSelectedCRS(found);
                      }}
                      className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-cyan-600 appearance-none cursor-pointer transition-all pr-7 shadow-sm"
                    >
                      <optgroup label="TUREF / TM (3° - Türkiye)">
                        {CRS_LIST.filter(c => c.code.startsWith('EPSG:525')).map(crs => (
                          <option key={crs.code} value={crs.code} className="bg-white text-slate-900 py-1">
                            {crs.code} - {crs.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="ED50 / TM (3° - Türkiye)">
                        {CRS_LIST.filter(c => c.code.startsWith('EPSG:522')).map(crs => (
                          <option key={crs.code} value={crs.code} className="bg-white text-slate-900 py-1">
                            {crs.code} - {crs.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="WGS 84 / UTM (6° - Türkiye & Bölgesel)">
                        {CRS_LIST.filter(c => ['EPSG:32635', 'EPSG:32636', 'EPSG:32637', 'EPSG:32638'].includes(c.code)).map(crs => (
                          <option key={crs.code} value={crs.code} className="bg-white text-slate-900 py-1">
                            {crs.code} - {crs.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="ED50 / UTM (6° - Türkiye & Bölgesel)">
                        {CRS_LIST.filter(c => ['EPSG:23035', 'EPSG:23036', 'EPSG:23037', 'EPSG:23038'].includes(c.code)).map(crs => (
                          <option key={crs.code} value={crs.code} className="bg-white text-slate-900 py-1">
                            {crs.code} - {crs.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Global & Standartlar">
                        {CRS_LIST.filter(c => ['EPSG:4326', 'EPSG:3857'].includes(c.code)).map(crs => (
                          <option key={crs.code} value={crs.code} className="bg-white text-slate-900 py-1">
                            {crs.code} - {crs.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>

                {/* River Centerline KML Input */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold text-slate-700">
                      Nehir Merkez Hattı (KML):
                    </label>
                    {centerlineFile && demFile && (
                      <button
                        type="button"
                        onClick={() => handleDetectThalwegCenterline(60)}
                        disabled={isDetectingThalweg}
                        className="text-[10px] font-bold text-cyan-700 hover:text-cyan-900 flex items-center gap-1 bg-cyan-50 hover:bg-cyan-100 px-1.5 py-0.5 rounded-md border border-cyan-200 cursor-pointer transition-colors"
                        title="DEM verisini tarayarak en düşük kota sahip gerçek yatak tabanını (thalweg) otomatik tespit eder"
                      >
                        {isDetectingThalweg ? (
                          <>
                            <RefreshCw size={11} className="animate-spin text-cyan-700" />
                            <span>DEM Taranıyor...</span>
                          </>
                        ) : (
                          <>
                            <Wand2 size={11} className="text-cyan-700" />
                            <span>DEM'den Gerçek Ekseni Bul</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {centerlineFile ? (
                    <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-xl space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="space-y-0.5 overflow-hidden">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 size={13} className="text-blue-600 shrink-0" />
                            <span className="font-bold text-slate-900 text-xs truncate">
                              {useDetectedThalweg ? '🌊 ' + centerlineFile.name : centerlineFile.name}
                            </span>
                          </div>
                          <p className="text-[10px] text-blue-700 truncate flex items-center gap-1.5">
                            <span>{centerlineCoords.length} Nokta Akış Aksı</span>
                            {useDetectedThalweg && (
                              <span className="bg-cyan-200/80 text-cyan-950 font-bold px-1.5 py-0.2 rounded text-[9px]">
                                DEM Thalweg Aktif
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <label className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-800 rounded-lg text-[10px] font-bold cursor-pointer border border-slate-300 transition-all shadow-sm">
                            Değiştir
                            <input type="file" accept=".kml" onChange={handleCenterlineUpload} className="hidden" />
                          </label>
                        </div>
                      </div>

                      {/* DEM Thalweg Detection Status & Switch Card */}
                      {thalwegResult && (
                        <div className="bg-white/95 border border-cyan-200 rounded-lg p-2 text-[10px] space-y-1.5 shadow-2xs">
                          <div className="flex items-center justify-between border-b border-cyan-100 pb-1">
                            <span className="font-bold text-cyan-900 flex items-center gap-1">
                              <Sparkles size={11} className="text-cyan-600" />
                              DEM Yatak Tabanı (Thalweg) Tespiti
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={handleDownloadThalwegKML}
                                className="px-1.5 py-0.5 bg-cyan-100 hover:bg-cyan-200 text-cyan-900 rounded font-bold cursor-pointer transition-colors text-[9px]"
                                title="Tespit edilen gerçek ekseni KML olarak indir"
                              >
                                📥 KML İndir
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-1 text-center py-0.5">
                            <div className="bg-slate-50 p-1 rounded border border-slate-200/60">
                              <span className="text-slate-500 block text-[9px]">Ortalama Kayma</span>
                              <span className="font-bold text-slate-800 text-[11px]">
                                {thalwegResult.totalShiftDistance} m
                              </span>
                            </div>
                            <div className="bg-slate-50 p-1 rounded border border-slate-200/60">
                              <span className="text-slate-500 block text-[9px]">Maks. Taban Farkı</span>
                              <span className="font-bold text-slate-800 text-[11px]">
                                {thalwegResult.maxShiftDistance} m
                              </span>
                            </div>
                            <div className="bg-cyan-50/70 p-1 rounded border border-cyan-200/60">
                              <span className="text-cyan-700 block text-[9px]">Taban Derinleşmesi</span>
                              <span className="font-bold text-cyan-900 text-[11px]">
                                {thalwegResult.elevationGain > 0 ? `-${thalwegResult.elevationGain} m` : '0 m'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                            <span className="text-slate-600 text-[9px]">Kullanılan Eksen:</span>
                            <div className="inline-flex rounded-md shadow-2xs border border-slate-200 overflow-hidden text-[9px] font-bold">
                              <button
                                type="button"
                                onClick={() => handleToggleCenterlineSource(false)}
                                className={`px-2 py-0.5 cursor-pointer transition-colors ${
                                  !useDetectedThalweg
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                Orijinal KML
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleCenterlineSource(true)}
                                className={`px-2 py-0.5 cursor-pointer transition-colors ${
                                  useDetectedThalweg
                                    ? 'bg-cyan-700 text-white'
                                    : 'bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                DEM Thalweg (Önerilen)
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Bilgilendirme ve Hızlı Buton (Eğer henüz çalıştırılmadıysa) */}
                      {!thalwegResult && demFile && (
                        <div className="pt-1 border-t border-blue-200/70 flex items-center justify-between">
                          <span className="text-[9px] text-blue-700">
                            KML ekseni civarındaki en derin kotlar tespit edilsin mi?
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDetectThalwegCenterline(60)}
                            disabled={isDetectingThalweg}
                            className="px-2 py-0.5 bg-cyan-700 hover:bg-cyan-800 text-white rounded font-bold text-[9px] cursor-pointer shadow-xs transition-colors shrink-0"
                          >
                            {isDetectingThalweg ? 'Taranıyor...' : 'Ekseni Düzelt'}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <label className="flex items-center justify-between gap-2 p-2 border border-dashed border-slate-300 rounded-xl hover:bg-slate-100 transition-all cursor-pointer bg-slate-50 group">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className="p-1 bg-blue-100 text-blue-800 rounded-lg group-hover:scale-105 transition-transform shrink-0">
                          <SplitSquareVertical size={14} />
                        </div>
                        <span className="font-bold text-xs text-slate-800 truncate">Merkez Aks KML Yükle</span>
                      </div>
                      <span className="px-2 py-0.5 bg-blue-700 text-white rounded-lg text-[10px] font-bold shrink-0 shadow-sm">
                        Gözat
                      </span>
                      <input type="file" accept=".kml" onChange={handleCenterlineUpload} className="hidden" />
                    </label>
                  )}
                </div>

                {/* Bank Stations & Automatic Bank Tops Detection */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-700 block">
                      Dere Şev Üstleri / Kıyı Hatları:
                    </label>
                    {demFile && (centerlineFile || centerlineCoords.length > 0) && (
                      <span className="text-[9px] text-cyan-800 font-bold bg-cyan-100 px-1.5 py-0.2 rounded">
                        DEM Otomatik Tespiti Destekleniyor
                      </span>
                    )}
                  </div>

                  {/* 1. DEM ile Otomatik Tespit Sonucu Kartı */}
                  {bankTopsResult ? (
                    <div className="bg-emerald-50/80 border border-emerald-300/80 p-2.5 rounded-xl space-y-2 shadow-2xs">
                      <div className="flex items-center justify-between gap-2 border-b border-emerald-200/60 pb-1.5">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <div className="p-1 bg-emerald-600 text-white rounded-md shrink-0">
                            <Sparkles size={11} />
                          </div>
                          <div className="overflow-hidden">
                            <span className="font-bold text-slate-900 text-xs truncate block">
                              DEM Otomatik Şev Üstü Tespiti
                            </span>
                            <span className="text-[9px] text-emerald-800 font-medium truncate block">
                              {bankTopsResult.pointsSampled} kesitte şev kırığı analiz edildi
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={handleDownloadBankTopsKML}
                            className="px-2 py-0.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-[9px] font-bold cursor-pointer transition-colors shadow-2xs flex items-center gap-1"
                            title="Tespit edilen şev üstü çizgilerini KML olarak indir"
                          >
                            <Download size={10} />
                            <span>KML İndir</span>
                          </button>
                        </div>
                      </div>

                      {/* İstatistik Göstergeleri */}
                      <div className="grid grid-cols-3 gap-1 text-center py-0.5">
                        <div className="bg-white p-1 rounded-lg border border-emerald-200/70">
                          <span className="text-slate-500 block text-[9px]">Ort. Yatak Genişliği</span>
                          <span className="font-bold text-emerald-950 text-[11px]">
                            {bankTopsResult.avgChannelWidth} m
                          </span>
                        </div>
                        <div className="bg-white p-1 rounded-lg border border-emerald-200/70">
                          <span className="text-slate-500 block text-[9px]">Min - Maks Genişlik</span>
                          <span className="font-bold text-slate-800 text-[10px]">
                            {bankTopsResult.minChannelWidth} - {bankTopsResult.maxChannelWidth} m
                          </span>
                        </div>
                        <div className="bg-white p-1 rounded-lg border border-emerald-200/70">
                          <span className="text-slate-500 block text-[9px]">Ort. Şev Yüksekliği</span>
                          <span className="font-bold text-cyan-900 text-[11px]">
                            +{bankTopsResult.avgBankHeight} m
                          </span>
                        </div>
                      </div>

                      {/* Sol ve Sağ Sahil Nokta Bilgisi */}
                      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                        <div className="flex items-center justify-between bg-white px-2 py-1 rounded-lg border border-emerald-200">
                          <span className="font-bold text-emerald-800">🌿 Sol Şev Üstü</span>
                          <span className="font-bold text-emerald-700">{leftBankCoords.length} nokta</span>
                        </div>
                        <div className="flex items-center justify-between bg-white px-2 py-1 rounded-lg border border-amber-200">
                          <span className="font-bold text-amber-800">🌾 Sağ Şev Üstü</span>
                          <span className="font-bold text-amber-700">{rightBankCoords.length} nokta</span>
                        </div>
                      </div>

                      {/* Alt Aksiyon Butonları */}
                      <div className="flex items-center justify-between pt-1 border-t border-emerald-200/60 gap-1.5">
                        <button
                          type="button"
                          onClick={handleSwapBankLines}
                          className="text-[10px] text-slate-700 hover:text-slate-900 font-bold bg-white hover:bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                          title="Sol ve sağ kıyı atamalarını yer değiştir"
                        >
                          <ArrowUpDown size={10} />
                          <span>Sol ⇄ Sağ Değiştir</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDetectBankTops(bankTopsCorridorWidth)}
                          disabled={isDetectingBankTops}
                          className="text-[10px] text-emerald-900 hover:text-emerald-950 font-bold bg-emerald-200/60 hover:bg-emerald-200 px-2 py-1 rounded-lg border border-emerald-300 flex items-center gap-1 cursor-pointer transition-all"
                        >
                          <RefreshCw size={10} className={isDetectingBankTops ? 'animate-spin' : ''} />
                          <span>{isDetectingBankTops ? 'Taranıyor...' : 'Yeniden Tara'}</span>
                        </button>
                      </div>
                    </div>
                  ) : banksFile ? (
                    /* 2. Manuel KML ile Yüklenmiş Kıyı Hatları */
                    <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="space-y-0.5 overflow-hidden">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 size={13} className="text-amber-600 shrink-0" />
                            <span className="font-bold text-slate-900 text-xs truncate">{banksFile.name}</span>
                          </div>
                          <p className="text-[10px] text-amber-700 truncate">
                            {bankLinesInfo?.totalLines || 0} Hat ({bankLinesInfo?.totalPoints || 0} Koordinat)
                          </p>
                        </div>
                        <label className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-800 rounded-lg text-[10px] font-bold cursor-pointer border border-slate-300 shrink-0 transition-all shadow-xs">
                          Değiştir
                          <input type="file" accept=".kml" onChange={handleBanksUpload} className="hidden" />
                        </label>
                      </div>

                      {/* Sol ve Sağ Sahil Durumu */}
                      <div className="grid grid-cols-2 gap-1.5 text-[10px] pt-1 border-t border-amber-200/60">
                        <div className="flex items-center justify-between bg-white px-2 py-1 rounded-lg border border-emerald-200">
                          <span className="font-bold text-emerald-800">🌿 {bankLinesInfo?.leftName || 'Sol Kıyı'}</span>
                          <span className="font-bold text-emerald-700">{leftBankCoords.length} nokta</span>
                        </div>
                        <div className="flex items-center justify-between bg-white px-2 py-1 rounded-lg border border-amber-200">
                          <span className="font-bold text-amber-800">🌾 {bankLinesInfo?.rightName || 'Sağ Kıyı'}</span>
                          <span className="font-bold text-amber-700">{rightBankCoords.length} nokta</span>
                        </div>
                      </div>

                      {/* Swap button if both exist */}
                      {leftBankCoords.length > 0 && rightBankCoords.length > 0 && (
                        <div className="flex items-center justify-between pt-1">
                          <button
                            type="button"
                            onClick={handleSwapBankLines}
                            className="text-[10px] text-amber-900 hover:text-amber-950 font-bold bg-amber-100/80 hover:bg-amber-200 px-2 py-0.5 rounded-lg border border-amber-300 flex items-center gap-1 cursor-pointer transition-all"
                            title="Sol ve sağ kıyı atamalarını yer değiştir"
                          >
                            <ArrowUpDown size={10} />
                            <span>Sol ⇄ Sağ Sahili Değiştir</span>
                          </button>
                          <span className="text-[9px] text-amber-700 font-medium italic">Enkesitlere uygulandı</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* 3. Henüz Kıyı Çizgisi Yokken - Otomatik Tespit veya KML Yükleme Seçeneği */
                    <div className="space-y-1.5">
                      {demFile && (centerlineFile || centerlineCoords.length > 0) ? (
                        <div className="bg-gradient-to-br from-emerald-50 to-cyan-50 border border-emerald-200/90 rounded-xl p-2.5 space-y-2 shadow-2xs">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-0.5">
                              <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                                <Sparkles size={13} className="text-emerald-600" />
                                Otomatik Dere Şev Üstü Tespiti
                              </span>
                              <p className="text-[10px] text-slate-600 leading-tight">
                                DEM eğrilik ve yatak profili analiziyle dere sol ve sağ şev üstü kırıklarını (bank tops) otomatik tespit eder.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-1 border-t border-emerald-200/50">
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
                              <span className="text-[9px]">Tarama:</span>
                              <select
                                value={bankTopsCorridorWidth}
                                onChange={(e) => setBankTopsCorridorWidth(Number(e.target.value))}
                                className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-800"
                              >
                                <option value={50}>±25m (Dar Yatak)</option>
                                <option value={80}>±40m (Standart)</option>
                                <option value={120}>±60m (Geniş Vadi)</option>
                                <option value={200}>±100m (Geniş Taşkın)</option>
                              </select>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDetectBankTops(bankTopsCorridorWidth)}
                              disabled={isDetectingBankTops}
                              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold text-[10px] cursor-pointer shadow-sm transition-all flex items-center gap-1.5 shrink-0"
                            >
                              <Wand2 size={12} className={isDetectingBankTops ? 'animate-spin' : ''} />
                              <span>{isDetectingBankTops ? 'Şev Üstü Taranıyor...' : 'Şev Üstlerini Tespit Et'}</span>
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {/* Alternatif Manuel KML Yükleme Butonu */}
                      <label className="flex items-center justify-between gap-2 p-2 border border-dashed border-slate-300 rounded-xl hover:bg-slate-100 transition-all cursor-pointer bg-slate-50 group">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className="p-1 bg-amber-100 text-amber-800 rounded-lg group-hover:scale-105 transition-transform shrink-0">
                            <Activity size={14} />
                          </div>
                          <span className="font-bold text-xs text-slate-800 truncate">Kıyı Çizgileri KML Yükle (Opsiyonel)</span>
                        </div>
                        <span className="px-2 py-0.5 bg-amber-700 text-white rounded-lg text-[10px] font-bold shrink-0 shadow-sm">
                          Gözat
                        </span>
                        <input type="file" accept=".kml" onChange={handleBanksUpload} className="hidden" />
                      </label>
                    </div>
                  )}
                </div>
              </section>

              {/* 2. ENKESİT ÇIKARIMI (OTOMATİK VEYA MANUEL KML) */}
              <section className="bg-white rounded-2xl p-3 border border-slate-300 shadow-sm space-y-2.5 shrink-0">
                <div className="pb-1.5 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Ruler size={14} className="text-cyan-700" />
                    <span>2. Enkesit Geometrisi & Çıkarımı</span>
                  </h2>
                  {sections.length > 0 && (
                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full border border-emerald-300">
                      {sections.length} Kesit Hazır
                    </span>
                  )}
                </div>

                {/* Mode Switcher: Otomatik Üretim vs Manuel KML */}
                <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    onClick={() => setCrossSectionMode('auto')}
                    className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer text-center ${
                      crossSectionMode === 'auto'
                        ? 'bg-cyan-700 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Otomatik Üretim (dx)
                  </button>
                  <button
                    onClick={() => setCrossSectionMode('manual')}
                    className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer text-center ${
                      crossSectionMode === 'manual'
                        ? 'bg-cyan-700 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Manuel Enkesit KML
                  </button>
                </div>

                {crossSectionMode === 'auto' ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-700 block mb-1">
                          Aralık (dx) [m]:
                        </label>
                        <input
                          type="number"
                          min="10"
                          max="500"
                          step="10"
                          value={crossSectionInterval}
                          onChange={(e) => setCrossSectionInterval(Number(e.target.value))}
                          className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900 shadow-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-700 block mb-1">
                          Genişlik (B) [m]:
                        </label>
                        <input
                          type="number"
                          min="50"
                          max="1000"
                          step="25"
                          value={sectionWidth}
                          onChange={(e) => setSectionWidth(Number(e.target.value))}
                          className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900 shadow-sm"
                        />
                      </div>
                    </div>

                    {/* Kesişme Önleme & Düzeltme Kontrolü (±10° Açı & Boy Kısaltma) */}
                    <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={autoDeconflictSections}
                            onChange={(e) => setAutoDeconflictSections(e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-cyan-700 focus:ring-cyan-600 border-slate-300 cursor-pointer"
                          />
                          <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                            <span>Kesişme Önleme & Düzeltme</span>
                            <span className="text-[9px] bg-cyan-100 text-cyan-800 px-1.5 py-0.2 rounded font-mono font-bold border border-cyan-200">
                              ±{maxAngleAdjustment}°
                            </span>
                          </span>
                        </label>
                        <span className="text-[9px] text-slate-500 font-medium">80° - 100° Aralığı</span>
                      </div>

                      {autoDeconflictSections && (
                        <div className="space-y-1.5 pt-1.5 border-t border-slate-200/60 text-[10px] text-slate-600">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-600 font-medium">Açı Düzeltme Toleransı:</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setMaxAngleAdjustment(5)}
                                className={`px-2 py-0.5 rounded-lg text-[9px] font-bold cursor-pointer transition-all ${
                                  maxAngleAdjustment === 5
                                    ? 'bg-cyan-700 text-white shadow-2xs'
                                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                ±5° (85°-95°)
                              </button>
                              <button
                                type="button"
                                onClick={() => setMaxAngleAdjustment(10)}
                                className={`px-2 py-0.5 rounded-lg text-[9px] font-bold cursor-pointer transition-all ${
                                  maxAngleAdjustment === 10
                                    ? 'bg-cyan-700 text-white shadow-2xs'
                                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                ±10° (80°-100°)
                              </button>
                            </div>
                          </div>
                          <p className="text-[9px] text-slate-500 leading-tight">
                            Kesitler nehir eksenine 90° dik çizilir; virajlarda kesişenler ±{maxAngleAdjustment}° döndürülür. Çakışma sürerse kesit boyu güvenle kısaltılır.
                          </p>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={handleGenerateSections}
                      disabled={isExtracting || !demFile || !centerlineFile}
                      className={`w-full py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer ${
                        isExtracting
                          ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                          : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                      }`}
                    >
                      {isExtracting ? (
                        <>
                          <RefreshCw size={13} className="animate-spin" />
                          <span>DEM'den Kotlar Ayrıştırılıyor...</span>
                        </>
                      ) : (
                        <>
                          <Ruler size={13} />
                          <span>{sections.length > 0 ? 'Enkesitleri Yeniden Üret' : 'Enkesitleri DEM\'den Çıkar'}</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  /* Manuel Enkesit KML Modu */
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-700 block">
                      Ölçülmüş / Haritalanmış Enkesit Çizgileri KML Dosyası:
                    </label>
                    {manualKmlFile ? (
                      <div className="bg-emerald-50 border border-emerald-200 p-2 rounded-xl flex items-center justify-between gap-2">
                        <div className="space-y-0.5 overflow-hidden">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                            <span className="font-bold text-slate-900 text-xs truncate">{manualKmlFile.name}</span>
                          </div>
                          <p className="text-[10px] text-emerald-700 truncate">
                            {sections.length > 0 ? `${sections.length} Enkesit Ayrıştırıldı` : 'KML Yüklendi'}
                          </p>
                        </div>
                        <label className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-800 rounded-lg text-[10px] font-bold cursor-pointer border border-slate-300 shrink-0 transition-all shadow-sm">
                          Değiştir
                          <input type="file" accept=".kml" onChange={handleManualCrossSectionsUpload} className="hidden" />
                        </label>
                      </div>
                    ) : (
                      <label className="flex items-center justify-between gap-2 p-2 border border-dashed border-slate-300 rounded-xl hover:bg-slate-100 transition-all cursor-pointer bg-slate-50 group">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className="p-1 bg-emerald-100 text-emerald-800 rounded-lg group-hover:scale-105 transition-transform shrink-0">
                            <SplitSquareVertical size={14} />
                          </div>
                          <span className="font-bold text-xs text-slate-800 truncate">Manuel Enkesitler KML Yükle</span>
                        </div>
                        <span className="px-2 py-0.5 bg-emerald-700 text-white rounded-lg text-[10px] font-bold shrink-0 shadow-sm">
                          Gözat
                        </span>
                        <input type="file" accept=".kml" onChange={handleManualCrossSectionsUpload} className="hidden" />
                      </label>
                    )}

                    <button
                      onClick={handleGenerateSections}
                      disabled={isExtracting || !demFile || !manualKmlFile}
                      className={`w-full py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer ${
                        isExtracting
                          ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                          : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                      }`}
                    >
                      {isExtracting ? (
                        <>
                          <RefreshCw size={13} className="animate-spin" />
                          <span>Kotlar DEM'den Çıkarılıyor...</span>
                        </>
                      ) : (
                        <>
                          <Ruler size={13} />
                          <span>Manuel Kesit Kotlarını DEM'den Hesapla</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Section Management Quick Toolbar */}
                {sections.length > 0 && (
                  <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-slate-700 flex items-center gap-1">
                        <Layers size={11} className="text-cyan-700" />
                        <span>Model Enkesitleri:</span>
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-cyan-900 bg-cyan-100/80 px-1.5 py-0.2 rounded text-[9px]">
                          {sections.length} Aktif
                        </span>
                        {deletedSectionsList.length > 0 && (
                          <span className="font-bold text-red-700 bg-red-100/80 px-1.5 py-0.2 rounded text-[9px]">
                            {deletedSectionsList.length} Silindi
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsSectionManagerModalOpen(true)}
                        className="flex-1 py-1.5 px-2 bg-slate-900 hover:bg-slate-800 text-cyan-300 rounded-xl text-[11px] font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        title="Enkesit listesini aç, filtrele, tek tek veya toplu olarak sil"
                      >
                        <ListFilter size={13} className="text-cyan-400" />
                        <span>Kesitleri Yönet & Sil ({sections.length})</span>
                      </button>

                      {deletedSectionsList.length > 0 && (
                        <button
                          type="button"
                          onClick={handleRestoreAllDeletedSections}
                          className="py-1.5 px-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                          title={`${deletedSectionsList.length} adet silinen kesiti modele geri yükle`}
                        >
                          <RotateCcw size={11} />
                          <span>Geri Al</span>
                        </button>
                      )}
                    </div>

                    {/* Intersection Status & Resolution Alert */}
                    {intersectionCheck.hasIntersections ? (
                      <div className="bg-amber-50 border border-amber-300 rounded-xl p-2 space-y-1.5 shadow-2xs">
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="flex items-center gap-1.5 text-amber-900 font-bold text-[11px]">
                            <AlertCircle size={13} className="text-amber-600 shrink-0" />
                            <span>{intersectionCheck.totalIntersections} Kesişme Noktası ({intersectionCheck.intersectingIndices.length} Kesit)</span>
                          </div>
                          <span className="text-[9px] bg-amber-200 text-amber-900 font-bold px-1.5 py-0.2 rounded">
                            Çakışma Var
                          </span>
                        </div>
                        <p className="text-[9px] text-amber-700 leading-tight">
                          Virajdaki komşu enkesitler birbirini kesiyor. Hidrolik model doğruluğu için kesitlerin çakışması önlenmelidir.
                        </p>
                        <button
                          type="button"
                          onClick={handleResolveIntersections}
                          disabled={isDeconflicting || !demFile}
                          className="w-full py-1.5 px-2 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white rounded-lg text-[10px] font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                          title="Virajlardaki kesişen enkesitleri ±10° döndür ve gerekirse boyunu kısalt"
                        >
                          <RefreshCw size={11} className={isDeconflicting ? 'animate-spin' : ''} />
                          <span>{isDeconflicting ? 'Kesişmeler Düzeltiliyor...' : 'Kesişmeleri Düzelt (±10° Açı & Kırpma)'}</span>
                        </button>
                      </div>
                    ) : deconflictReport ? (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2 space-y-1 shadow-2xs">
                        <div className="flex items-center gap-1.5 text-emerald-900 font-bold text-[10px]">
                          <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                          <span>Kesişmeler Başarıyla Giderildi</span>
                        </div>
                        <p className="text-[9px] text-emerald-700 leading-tight">
                          {deconflictReport.summary}
                        </p>
                      </div>
                    ) : (
                      <div className="bg-emerald-50/70 border border-emerald-200/60 rounded-xl px-2 py-1.5 flex items-center justify-between">
                        <span className="text-[10px] text-emerald-800 font-bold flex items-center gap-1">
                          <CheckCircle2 size={11} className="text-emerald-600" />
                          <span>Kesişen kesit yok</span>
                        </span>
                        <span className="text-[9px] text-emerald-700 font-medium">Hidrolik geometri uygun</span>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* 3. MANNING PÜRÜZLÜLÜK KATSAYILARI */}
              <section className="bg-white rounded-2xl p-3 border border-slate-300 shadow-sm space-y-2.5 shrink-0">
                <div className="pb-1.5 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Droplets size={14} className="text-cyan-700" />
                    <span>3. Manning Pürüzlülüğü (n)</span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => setIsManningModalOpen(true)}
                    className="px-2 py-0.5 bg-cyan-50 hover:bg-cyan-100 text-cyan-800 rounded-lg text-[10px] font-bold border border-cyan-300 transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                    title="Chow ve HEC-RAS standartlarında pürüzlülük kütüphanesini aç"
                  >
                    <Sparkles size={11} className="text-cyan-700" />
                    <span>Kütüphaneden Seç</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-50 border border-slate-200 p-2 rounded-xl text-center">
                    <span className="text-[9px] font-bold text-slate-600 block mb-0.5">Sol Taşkın (LOB)</span>
                    <input
                      type="number"
                      step="0.005"
                      min="0.01"
                      max="0.2"
                      value={manningLOB}
                      onChange={(e) => setManningLOB(Number(e.target.value))}
                      className="w-full text-center bg-white border border-slate-300 rounded-lg p-1 text-xs font-bold text-slate-800"
                    />
                  </div>
                  <div className="bg-cyan-50 border border-cyan-200 p-2 rounded-xl text-center">
                    <span className="text-[9px] font-bold text-cyan-800 block mb-0.5">Ana Kanal</span>
                    <input
                      type="number"
                      step="0.005"
                      min="0.01"
                      max="0.2"
                      value={manningMain}
                      onChange={(e) => setManningMain(Number(e.target.value))}
                      className="w-full text-center bg-white border border-cyan-300 rounded-lg p-1 text-xs font-bold text-cyan-900"
                    />
                  </div>
                  <div className="bg-slate-50 border border-slate-200 p-2 rounded-xl text-center">
                    <span className="text-[9px] font-bold text-slate-600 block mb-0.5">Sağ Taşkın (ROB)</span>
                    <input
                      type="number"
                      step="0.005"
                      min="0.01"
                      max="0.2"
                      value={manningROB}
                      onChange={(e) => setManningROB(Number(e.target.value))}
                      className="w-full text-center bg-white border border-slate-300 rounded-lg p-1 text-xs font-bold text-slate-800"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsManningModalOpen(true)}
                  className="w-full py-1.5 px-2 bg-gradient-to-r from-cyan-700 to-blue-800 hover:from-cyan-800 hover:to-blue-900 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <BookOpen size={13} />
                  <span>Pürüzlülük Kütüphanesini Aç (DSİ / Chow / HEC-RAS)</span>
                </button>
              </section>

              {/* 4. HİDROLOJİK SINIR ŞARTLARI & DEBİ HİDROGRAFI */}
              <section className="bg-white rounded-2xl p-3 border border-slate-300 shadow-sm space-y-2.5 shrink-0">
                <div className="pb-1.5 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Activity size={14} className="text-cyan-700" />
                    <span>4. Hidrolojik & Sınır Şartları</span>
                  </h2>
                  {flowMode === 'hydrograph' && hydrographData.length > 0 && (
                    <span className="text-[9px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full border border-blue-300">
                      {hydrographData.length} Zaman Adımı
                    </span>
                  )}
                </div>

                {/* Flow Mode Switcher: Sabit Debi vs Dinamik Hidrograf */}
                <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    onClick={() => setFlowMode('steady')}
                    className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer text-center ${
                      flowMode === 'steady'
                        ? 'bg-cyan-700 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Sabit / Pik Debi
                  </button>
                  <button
                    onClick={() => setFlowMode('hydrograph')}
                    className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer text-center flex items-center justify-center gap-1 ${
                      flowMode === 'hydrograph'
                        ? 'bg-cyan-700 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FileSpreadsheet size={12} />
                    <span>Akım Hidrografı (Excel)</span>
                  </button>
                </div>

                {flowMode === 'steady' ? (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold text-slate-700">Pik Debi (Q):</span>
                      <span className="text-xs font-extrabold text-cyan-800">{peakFlow} m³/s</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="1500"
                      step="5"
                      value={peakFlow}
                      onChange={(e) => setPeakFlow(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-300 rounded-full appearance-none cursor-pointer accent-cyan-700"
                    />
                    <div className="grid grid-cols-5 gap-1 pt-1">
                      {[50, 100, 250, 500, 1000].map((val) => (
                        <button
                          key={val}
                          onClick={() => setPeakFlow(val)}
                          className={`py-0.5 rounded text-[9px] font-bold border transition-all text-center cursor-pointer ${
                            peakFlow === val
                              ? 'bg-cyan-100 border-cyan-500 text-cyan-900 shadow-sm'
                              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {val} m³
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Akım Hidrografı (Excel / CSV) Yükleme ve Şablon */
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-slate-700">Debi Hidrografı Verisi:</span>
                      <button
                        onClick={downloadHydrographTemplate}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 border border-slate-300 shadow-sm cursor-pointer"
                        title="Örnek Excel formatını indirin"
                      >
                        <Download size={11} className="text-cyan-700" />
                        <span>Örnek Şablonu İndir (.xlsx)</span>
                      </button>
                    </div>

                    {hydrographFileName && hydrographData.length > 0 ? (
                      <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 size={14} className="text-blue-600 shrink-0" />
                            <span className="font-bold text-slate-900 text-xs truncate max-w-[150px]">
                              {hydrographFileName}
                            </span>
                          </div>
                          <label className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-800 rounded-lg text-[10px] font-bold cursor-pointer border border-slate-300 shadow-sm">
                            Değiştir
                            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleHydrographUpload} className="hidden" />
                          </label>
                        </div>

                        {/* Mini Hydrograph Plot */}
                        <div className="w-full h-20 bg-white border border-blue-200 rounded-lg p-1">
                          <svg width="100%" height="100%" viewBox="0 0 300 70" preserveAspectRatio="none" className="w-full h-full">
                            {(() => {
                              const maxT = Math.max(...hydrographData.map(d => d.time));
                              const maxQ = Math.max(...hydrographData.map(d => d.flow));
                              const mapX = (t: number) => 10 + (t / (maxT || 1)) * 280;
                              const mapY = (q: number) => 65 - (q / (maxQ || 1)) * 55;

                              const polyPoints = `10,65 ` + hydrographData.map(d => `${mapX(d.time)},${mapY(d.flow)}`).join(' ') + ` 290,65`;
                              const linePoints = hydrographData.map(d => `${mapX(d.time)},${mapY(d.flow)}`).join(' ');

                              return (
                                <>
                                  <polygon points={polyPoints} fill="#38bdf8" fillOpacity="0.3" />
                                  <polyline points={linePoints} fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                  {hydrographData.map((d, idx) => (
                                    <circle key={idx} cx={mapX(d.time)} cy={mapY(d.flow)} r="2" fill="#0369a1" />
                                  ))}
                                </>
                              );
                            })()}
                          </svg>
                        </div>

                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-700 pt-0.5">
                          <span>Pik Debi: <strong className="text-cyan-800">{peakFlow} m³/s</strong></span>
                          <span>Süre: <strong className="text-slate-900">{simDuration} Saat</strong></span>
                        </div>
                      </div>
                    ) : (
                      <label className="flex items-center justify-between gap-2 p-2.5 border border-dashed border-slate-300 rounded-xl hover:bg-slate-100 transition-all cursor-pointer bg-slate-50 group">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className="p-1.5 bg-blue-100 text-blue-800 rounded-lg group-hover:scale-105 transition-transform shrink-0">
                            <FileSpreadsheet size={16} />
                          </div>
                          <div className="overflow-hidden">
                            <span className="font-bold text-xs text-slate-800 block truncate">Excel / CSV Hidrograf Yükle</span>
                            <span className="text-[10px] text-slate-500 block truncate">Saat ve Debi sütunları içeren dosya</span>
                          </div>
                        </div>
                        <span className="px-2 py-1 bg-blue-700 text-white rounded-lg text-[10px] font-bold shrink-0 shadow-sm">
                          Yükle
                        </span>
                        <input type="file" accept=".xlsx,.xls,.csv" onChange={handleHydrographUpload} className="hidden" />
                      </label>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold text-slate-700 block">Mansap Eğim (S₀):</label>
                      <button
                        type="button"
                        onClick={handleCalculateSlopeFromDEM}
                        disabled={sections.length < 2}
                        className="text-[9px] text-cyan-700 hover:text-cyan-900 font-bold flex items-center gap-0.5 cursor-pointer disabled:opacity-40"
                        title="DEM enkesit taban kotlarından mansap eğimini otomatik hesapla"
                      >
                        <RefreshCw size={8} />
                        <span>DEM Otomatik</span>
                      </button>
                    </div>
                    <input
                      type="number"
                      step="0.0001"
                      min="0.00001"
                      value={downstreamSlope}
                      onChange={(e) => setDownstreamSlope(Number(e.target.value))}
                      className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-700 block mb-1">Hesap Süresi (Saat):</label>
                    <input
                      type="number"
                      min="1"
                      max="168"
                      value={simDuration}
                      onChange={(e) => setSimDuration(Number(e.target.value))}
                      className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-800"
                    />
                  </div>
                </div>

                {/* DEM Taban Eğimi Otomatik Bilgi Kartı */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 space-y-1 mt-1 text-[10px]">
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span className="flex items-center gap-1">
                      <TrendingUp size={12} className="text-cyan-700" />
                      <span>DEM Yatak Eğimi Analizi</span>
                    </span>
                    {slopeCalculationInfo ? (
                      <span className="text-cyan-800 font-black">
                        %{slopeCalculationInfo.percent.toFixed(2)} ({slopeCalculationInfo.slope.toFixed(4)} m/m)
                      </span>
                    ) : detectedBedSlope !== null ? (
                      <span className="text-cyan-800 font-black">
                        %{(detectedBedSlope * 100).toFixed(2)} ({detectedBedSlope.toFixed(4)} m/m)
                      </span>
                    ) : (
                      <span className="text-slate-400 font-normal">Bekleniyor</span>
                    )}
                  </div>
                  {slopeCalculationInfo ? (
                    <p className="text-[9px] text-slate-600 leading-tight">
                      {slopeCalculationInfo.method}
                    </p>
                  ) : (
                    <p className="text-[9px] text-slate-500 leading-tight">
                      Enkesitler DEM'den çıkarıldığında mansap eğimi otomatik olarak hesaplanır.
                    </p>
                  )}
                </div>
              </section>

              {/* 5. SANAT YAPILARI (KÖPRÜ VE MENFEZ GEÇİŞLERİ) */}
              <section className="bg-white rounded-2xl p-3 border border-slate-300 shadow-sm space-y-3 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-cyan-100 text-cyan-800 rounded-xl">
                      <LayersIcon size={14} />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900">5. Sanat Yapıları (Köprü & Menfez)</h3>
                      <p className="text-[10px] text-slate-500">Kiriş altı kotu, açıklık ve kabarma (backwater) analizi</p>
                    </div>
                  </div>
                  <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full border border-slate-200">
                    {structures.length} Yapı
                  </span>
                </div>

                {/* Upload KML and Actions Bar */}
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 border border-dashed border-cyan-400 bg-cyan-50/60 hover:bg-cyan-100/60 text-cyan-900 rounded-xl font-bold text-[11px] transition-all cursor-pointer shadow-2xs">
                    <Upload size={13} className="text-cyan-700 shrink-0" />
                    <span>Nokta KML Yükle</span>
                    <input type="file" accept=".kml" onChange={handleStructuresKmlUpload} className="hidden" />
                  </label>

                  <button
                    onClick={downloadSampleStructuresKML}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl font-bold text-[11px] transition-all cursor-pointer shadow-2xs"
                  >
                    <Download size={13} className="text-slate-600 shrink-0" />
                    <span>Örnek KML İndir</span>
                  </button>
                </div>

                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-[10px] font-bold text-slate-600">Tanımlı Yapı Listesi:</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleAddStructure('bridge')}
                      className="px-2 py-0.5 bg-cyan-700 hover:bg-cyan-800 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all shadow-2xs cursor-pointer"
                    >
                      <Plus size={11} />
                      <span>Köprü</span>
                    </button>
                    <button
                      onClick={() => handleAddStructure('box_culvert')}
                      className="px-2 py-0.5 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all shadow-2xs cursor-pointer"
                    >
                      <Plus size={11} />
                      <span>Menfez</span>
                    </button>
                  </div>
                </div>

                {/* Structure List */}
                {structures.length === 0 ? (
                  <div className="p-3 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center space-y-1">
                    <p className="text-[11px] font-bold text-slate-700">Henüz sanat yapısı eklenmedi</p>
                    <p className="text-[10px] text-slate-500">
                      Nokta (Point) KML yükleyerek veya butonlarla manuel köprü/menfez ekleyebilirsiniz.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                    {structures.map((s) => (
                      <div
                        key={s.id}
                        className={`p-2 rounded-xl border transition-all text-xs flex flex-col gap-1 ${
                          s.isActive
                            ? 'bg-slate-50 border-slate-300'
                            : 'bg-slate-100/60 border-slate-200 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={s.isActive}
                              onChange={() => handleToggleStructure(s.id)}
                              className="w-3.5 h-3.5 rounded text-cyan-600 focus:ring-0 cursor-pointer"
                            />
                            <span className="font-bold text-slate-900 text-[11px]">
                              {s.type === 'bridge' ? '🌉' : '🔲'} {s.name}
                            </span>
                            <span className="text-[9px] bg-slate-200 text-slate-700 font-mono px-1.5 py-0.2 rounded">
                              Km {(s.station / 1000).toFixed(3)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setEditingStructure({ ...s });
                                setIsStructureModalOpen(true);
                              }}
                              className="p-1 text-slate-500 hover:text-cyan-700 hover:bg-white rounded transition-colors cursor-pointer"
                              title="Düzenle"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteStructure(s.id)}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-white rounded transition-colors cursor-pointer"
                              title="Sil"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-1 text-[10px] text-slate-600 bg-white/70 p-1.5 rounded-lg border border-slate-200/80">
                          <div>Tabliye: <strong className="text-slate-800">{s.roadElevation.toFixed(2)}m</strong></div>
                          <div>Kiriş Altı: <strong className="text-slate-800">{s.lowChordElevation.toFixed(2)}m</strong></div>
                          <div>Açıklık: <strong className="text-slate-800">{s.openingWidth}m</strong></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 6. START SIMULATION BUTTON */}
              <div className="pt-1 mt-auto shrink-0">
                <button
                  onClick={handleStartAnalysis}
                  disabled={isSimulating}
                  className="w-full py-2.5 px-3 bg-cyan-700 hover:bg-cyan-800 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  {isSimulating ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" />
                      <span>Saint-Venant Denklemleri Çözülüyor...</span>
                    </>
                  ) : (
                    <>
                      <Play size={15} className="fill-white" />
                      <span>Analizi Başlat (1B Hidrodinamik Simülasyon)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* RIGHT COLUMN: INTERACTIVE MAP & SECTION PREVIEW (col-span-8) */}
            <div
              className={`lg:col-span-8 flex flex-col gap-2.5 h-full min-h-0 ${
                mobileTab === 'preview' ? 'flex' : 'hidden lg:flex'
              }`}
            >
              <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-300 shadow-sm relative overflow-hidden flex-1 flex flex-col gap-2 min-h-0">
                {/* Header with Sub-tabs and Basemap Switcher */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                      <button
                        onClick={() => setRightPanelTab('map')}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                          rightPanelTab === 'map'
                            ? 'bg-cyan-700 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <MapIcon size={13} />
                        <span>Harita Görünümü</span>
                      </button>
                      <button
                        onClick={() => setRightPanelTab('section')}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                          rightPanelTab === 'section'
                            ? 'bg-cyan-700 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <SplitSquareVertical size={13} />
                        <span>Enkesit Profili (X-Z)</span>
                      </button>
                      {hydrographData.length > 0 && (
                        <button
                          onClick={() => setRightPanelTab('hydrograph')}
                          className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                            rightPanelTab === 'hydrograph'
                              ? 'bg-cyan-700 text-white shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <TrendingUp size={13} />
                          <span>Akım Hidrografı</span>
                        </button>
                      )}
                    </div>

                    {sections.length > 0 && rightPanelTab === 'section' && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <select
                          value={selectedSectionIdx}
                          onChange={(e) => setSelectedSectionIdx(Number(e.target.value))}
                          className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 shadow-sm"
                        >
                          {sections.map((s, idx) => (
                            <option key={idx} value={idx}>
                              Kesit Km {(s.station / 1000).toFixed(3)} ({s.station.toFixed(0)}m)
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleDeleteSection(selectedSectionIdx)}
                          className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-2xs cursor-pointer"
                          title="Seçili bu enkesiti modelden sil"
                        >
                          <Trash2 size={12} />
                          <span>Kesiti Sil</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsSectionManagerModalOpen(true)}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-2xs cursor-pointer"
                          title="Tüm kesitleri yönet, ara ve toplu sil"
                        >
                          <ListFilter size={12} />
                          <span>Yönet ({sections.length})</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Basemap Switcher Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setShowBasemapMenu(!showBasemapMenu)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 shadow-sm transition-all cursor-pointer"
                    >
                      <Layers size={13} />
                      <span>{currentBasemap.label}</span>
                    </button>

                    {showBasemapMenu && (
                      <div className="absolute right-0 mt-2 w-52 bg-slate-900 border border-slate-700 rounded-xl p-1.5 shadow-2xl z-[500] space-y-1">
                        <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Harita Katmanı
                        </div>
                        {BASEMAP_OPTIONS.map((bm) => (
                          <button
                            key={bm.id}
                            onClick={() => {
                              setActiveBasemap(bm.id);
                              setShowBasemapMenu(false);
                            }}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                              activeBasemap === bm.id
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold'
                                : 'text-slate-300 hover:bg-white/10'
                            }`}
                          >
                            <span>{bm.label}</span>
                            {activeBasemap === bm.id && <Check size={13} className="text-cyan-400" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Content View: Map or Cross Section Profile or Hydrograph */}
                <div className="flex-1 w-full min-h-0 rounded-xl overflow-hidden border border-slate-300 relative shadow-inner">
                  {rightPanelTab === 'map' ? (
                    !isFileOpened && centerlineCoords.length === 0 && sections.length === 0 ? (
                      /* Empty Blueprint State matching Analysis.tsx */
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 gap-3.5 p-6 text-center bg-slate-100 relative select-none">
                        <div
                          className="absolute inset-0 opacity-[0.04] pointer-events-none"
                          style={{
                            backgroundImage: `linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)`,
                            backgroundSize: `24px 24px`
                          }}
                        />
                        <div className="w-14 h-14 rounded-2xl bg-white border border-slate-300 flex items-center justify-center text-slate-500 shadow-sm z-10">
                          <FileCode size={28} className="text-cyan-700" />
                        </div>
                        <div className="space-y-1.5 max-w-sm z-10">
                          <h3 className="text-sm font-bold text-slate-900">1B Hidrodinamik Model Hazır</h3>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            {demFile ? (
                              <>
                                DEM ve Koordinat Sistemi ({selectedCRS.code}) seçildi. Haritada eksen ve enkesitleri görüntülemek için{' '}
                                <strong className="text-slate-900 font-bold">'Dosyayı Aç'</strong> butonuna basınız.
                              </>
                            ) : (
                              <>
                                Sol panelden DEM, Koordinat Sistemi ve KML dosyalarını yükleyerek nehir güzergahını ve enkesit
                                hatlarını haritada inceleyebilirsiniz.
                              </>
                            )}
                          </p>
                        </div>
                        {demFile && (
                          <button
                            onClick={() => {
                              setIsFileOpened(true);
                              if (sections.length === 0) handleGenerateSections();
                            }}
                            className="z-10 mt-1 py-2.5 px-4 bg-cyan-700 hover:bg-cyan-800 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg cursor-pointer"
                          >
                            <Eye size={15} />
                            <span>Dosyayı Aç (Haritada Göster)</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <MapContainer
                          center={centerlineCoords[0] || (sections[0]?.centerCoord) || [39.92, 32.85]}
                          zoom={13}
                          maxZoom={24}
                          className="w-full h-full"
                        >
                          <TileLayer url={currentBasemap.url} attribution={currentBasemap.attribution} maxZoom={24} />
                          {centerlineCoords.length > 0 && (
                            <Polyline positions={centerlineCoords} color="#0284c7" weight={4} opacity={0.9}>
                              <Tooltip sticky>Nehir Merkez Ekseni (Thalweg)</Tooltip>
                            </Polyline>
                          )}
                          {leftBankCoords.length > 0 && (
                            <Polyline positions={leftBankCoords} color="#059669" weight={2.5} dashArray="5, 4" opacity={0.85}>
                              <Tooltip sticky>🌿 Sol Şev Üstü / Kıyı Çizgisi</Tooltip>
                            </Polyline>
                          )}
                          {rightBankCoords.length > 0 && (
                            <Polyline positions={rightBankCoords} color="#d97706" weight={2.5} dashArray="5, 4" opacity={0.85}>
                              <Tooltip sticky>🌾 Sağ Şev Üstü / Kıyı Çizgisi</Tooltip>
                            </Polyline>
                          )}
                          {leftBankCoords.length === 0 && rightBankCoords.length === 0 && bankCoords.length > 0 && (
                            <Polyline positions={bankCoords} color="#ef4444" weight={2} dashArray="4, 4" opacity={0.8}>
                              <Tooltip sticky>Şev Üstü / Kıyı Çizgisi</Tooltip>
                            </Polyline>
                          )}
                          {sections.map((sec, idx) => {
                            if (!sec.cutLine) return null;
                            const isSelected = idx === selectedSectionIdx;
                            const isIntersecting = !!sec.isIntersecting || intersectionCheck.intersectingIndices.includes(idx);
                            const isModified = !!sec.angleAdjustment || !!sec.isTrimmed;

                            let strokeColor = '#10b981'; // normal green
                            if (isSelected) {
                              strokeColor = '#06b6d4'; // cyan
                            } else if (isIntersecting) {
                              strokeColor = '#ef4444'; // red warning
                            } else if (isModified) {
                              strokeColor = '#2563eb'; // blue adjusted
                            }

                            return (
                              <Polyline
                                key={`${sec.station}-${idx}`}
                                positions={sec.cutLine}
                                color={strokeColor}
                                weight={isSelected ? 4 : isIntersecting ? 3 : 2}
                                dashArray={isIntersecting ? '4, 4' : undefined}
                                opacity={0.9}
                                eventHandlers={{
                                  click: () => setSelectedSectionIdx(idx)
                                }}
                              >
                                <Tooltip sticky>
                                  <div className="text-[10px] font-bold">
                                    {isIntersecting && '⚠️ '}Kesit Km {(sec.station / 1000).toFixed(3)}
                                    {sec.angleAdjustment ? ` [Açı: ${sec.angleAdjustment > 0 ? '+' : ''}${sec.angleAdjustment}°]` : ''}
                                    {sec.isTrimmed ? ' [Kırpıldı]' : ''}
                                  </div>
                                </Tooltip>
                                <Popup>
                                  <div className="p-1 space-y-1.5 min-w-[175px]">
                                    <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                                      <span className="font-bold text-xs text-slate-800">
                                        Kesit Km {(sec.station / 1000).toFixed(3)}
                                      </span>
                                      <span className="text-[10px] text-slate-500 font-mono">
                                        {sec.station.toFixed(0)}m
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-slate-600 space-y-0.5">
                                      <div>Min Kot: <strong>{sec.minElevation.toFixed(2)} m</strong></div>
                                      <div>Maks Kot: <strong>{sec.maxElevation.toFixed(2)} m</strong></div>
                                      <div>Nokta Sayısı: <strong>{sec.profile.length}</strong></div>
                                    </div>

                                    {/* Deconfliction status badges */}
                                    {isIntersecting && (
                                      <div className="text-[9px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 font-bold flex items-center gap-1">
                                        <AlertCircle size={10} className="shrink-0" />
                                        <span>Komşu kesitle çakışma/kesişim var!</span>
                                      </div>
                                    )}
                                    {sec.angleAdjustment && (
                                      <div className="text-[9px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                        📐 Açı Düzeltmesi: <strong>{sec.angleAdjustment > 0 ? '+' : ''}{sec.angleAdjustment}°</strong> (80°-100° aralığı)
                                      </div>
                                    )}
                                    {sec.isTrimmed && (
                                      <div className="text-[9px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                        ✂️ Boy Kısaltma: <strong>Kol boyu güvenle kısaltıldı</strong>
                                      </div>
                                    )}

                                    <div className="flex items-center gap-1 pt-1 border-t border-slate-100">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedSectionIdx(idx);
                                          setRightPanelTab('section');
                                        }}
                                        className="flex-1 px-1.5 py-1 bg-cyan-700 hover:bg-cyan-800 text-white rounded text-[10px] font-bold cursor-pointer transition-colors"
                                      >
                                        Profili Gör
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteSection(idx)}
                                        className="px-1.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-bold flex items-center gap-0.5 cursor-pointer transition-colors"
                                        title="Bu enkesiti modelden sil"
                                      >
                                        <Trash2 size={10} />
                                        <span>Sil</span>
                                      </button>
                                    </div>
                                  </div>
                                </Popup>
                              </Polyline>
                            );
                          })}

                          {/* Render Hydraulic Structure Markers on Preview Map */}
                          {structures.filter(s => s.isActive).map((struct) => {
                            const coord = struct.coordinates || sections.find(sec => Math.abs(sec.station - struct.station) < 60)?.centerCoord;
                            if (!coord) return null;

                            return (
                              <CircleMarker
                                key={struct.id}
                                center={coord}
                                radius={7}
                                pathOptions={{
                                  color: '#ffffff',
                                  fillColor: struct.type === 'bridge' ? '#0284c7' : '#d97706',
                                  fillOpacity: 0.9,
                                  weight: 2
                                }}
                              >
                                <Tooltip direction="top" offset={[0, -7]} opacity={0.95}>
                                  <div className="text-xs font-bold">
                                    {struct.type === 'bridge' ? '🌉' : '🔲'} {struct.name} (Km {(struct.station / 1000).toFixed(3)})
                                  </div>
                                </Tooltip>
                                <Popup>
                                  <div className="text-xs space-y-1.5 min-w-[180px]">
                                    <div className="font-bold text-slate-900 border-b pb-1 flex items-center justify-between">
                                      <span>{struct.type === 'bridge' ? '🌉 Köprü' : '🔲 Menfez'}: {struct.name}</span>
                                      <button
                                        onClick={() => {
                                          setEditingStructure({ ...struct });
                                          setIsStructureModalOpen(true);
                                        }}
                                        className="text-[10px] text-cyan-700 hover:text-cyan-900 font-bold underline cursor-pointer"
                                      >
                                        Düzenle
                                      </button>
                                    </div>
                                    <div className="text-[11px] text-slate-600">
                                      <div>Konum: <strong>Km {(struct.station / 1000).toFixed(3)}</strong> ({struct.station}m)</div>
                                      <div>Tabliye: <strong>{struct.roadElevation.toFixed(2)} m</strong></div>
                                      <div>Kiriş Altı: <strong>{struct.lowChordElevation.toFixed(2)} m</strong></div>
                                      <div>Açıklık: <strong>{struct.openingWidth} m</strong></div>
                                    </div>
                                  </div>
                                </Popup>
                              </CircleMarker>
                            );
                          })}

                          {/* Map Click Listener for Structure Location Picking */}
                          <MapLocationPicker onMapClick={handleMapLocationSelected} active={isSelectingLocationOnMap} />

                          {mapBounds && <MapAutoCenter bounds={mapBounds} />}
                        </MapContainer>

                        {/* Interactive Location Selection Banner */}
                        {isSelectingLocationOnMap ? (
                          <div className="absolute top-2.5 left-2.5 right-2.5 z-[500] bg-cyan-900/95 backdrop-blur-md text-white px-3.5 py-2 rounded-xl text-xs flex items-center justify-between shadow-2xl border border-cyan-400/60 animate-pulse">
                            <div className="flex items-center gap-2">
                              <Compass size={15} className="text-cyan-300 animate-spin" />
                              <span>
                                <strong>Konum Seçimi Aktif:</strong> Harita üzerinde köprü/menfezin bulunacağı noktaya tıklayınız.
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                setIsSelectingLocationOnMap(false);
                                setIsStructureModalOpen(true);
                              }}
                              className="px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white rounded-lg text-[11px] font-bold transition-all cursor-pointer"
                            >
                              İptal
                            </button>
                          </div>
                        ) : (
                          /* Top Notification Banner inside Map */
                          <div className="absolute top-2.5 left-2.5 z-[400] bg-slate-900/90 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] text-slate-100 border border-slate-700 flex items-center gap-1.5 shadow-md">
                            <Compass className="text-cyan-400 shrink-0" size={13} />
                            <span>Harita üzerindeki yeşil çizgilere tıklayarak enkesitleri, sanat yapılarına tıklayarak detayları seçebilirsiniz</span>
                          </div>
                        )}

                        {/* Bottom Status Bar inside Map */}
                        <div className="absolute bottom-2.5 left-2.5 right-2.5 z-[400] flex flex-wrap items-center justify-between gap-1.5 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-[11px] text-slate-200 border border-slate-700 shadow-xl">
                          <div className="flex items-center gap-3 text-[10px]">
                            <span>
                              <strong className="text-cyan-400">CRS:</strong> {selectedCRS.code}
                            </span>
                            {centerlineCoords.length > 0 && (
                              <span>
                                <strong className="text-blue-400">Merkez Aks:</strong> {centerlineCoords.length} Nokta
                              </span>
                            )}
                            {sections.length > 0 && (
                              <span>
                                <strong className="text-emerald-400">Enkesitler:</strong> {sections.length} Adet {crossSectionMode === 'manual' ? '(Manuel KML)' : `(dx: ${crossSectionInterval}m)`}
                              </span>
                            )}
                          </div>
                          {currentActiveSection && (
                            <span className="bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full text-[9px] font-bold border border-cyan-500/30">
                              Seçili: Km {(currentActiveSection.station / 1000).toFixed(3)}
                            </span>
                          )}
                        </div>
                      </>
                    )
                  ) : rightPanelTab === 'section' ? (
                    /* Cross Section Profile SVG */
                    currentActiveSection ? (
                      <div className="w-full h-full bg-slate-50 p-4 flex flex-col justify-between">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800 pb-2 border-b border-slate-200 flex-wrap gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>Doğal Zemin Enkesiti: Km {(currentActiveSection.station / 1000).toFixed(3)} ({currentActiveSection.station.toFixed(0)}m)</span>
                            {(() => {
                              const matchingStruct = structures.find(s => s.isActive && Math.abs(s.station - currentActiveSection.station) < 50);
                              if (!matchingStruct) {
                                return (
                                  <div className="flex items-center gap-1.5 ml-1">
                                    <button
                                      onClick={() => handleAddStructure('bridge', currentActiveSection.station)}
                                      className="px-2 py-0.5 bg-cyan-700 hover:bg-cyan-800 text-white rounded-md text-[10px] font-bold flex items-center gap-1 transition-all shadow-2xs cursor-pointer"
                                      title="Bu enkesite doğrudan köprü tanımla"
                                    >
                                      <Plus size={11} />
                                      <span>Köprü Ekle</span>
                                    </button>
                                    <button
                                      onClick={() => handleAddStructure('box_culvert', currentActiveSection.station)}
                                      className="px-2 py-0.5 bg-amber-700 hover:bg-amber-800 text-white rounded-md text-[10px] font-bold flex items-center gap-1 transition-all shadow-2xs cursor-pointer"
                                      title="Bu enkesite doğrudan menfez tanımla"
                                    >
                                      <Plus size={11} />
                                      <span>Menfez Ekle</span>
                                    </button>
                                  </div>
                                );
                              }
                              return (
                                <div className="flex items-center gap-1.5">
                                  <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                    {matchingStruct.type === 'bridge' ? '🌉 Köprü:' : '🔲 Menfez:'} {matchingStruct.name}
                                  </span>
                                  <button
                                    onClick={() => {
                                      setEditingStructure({ ...matchingStruct });
                                      setIsStructureModalOpen(true);
                                    }}
                                    className="text-[10px] text-cyan-700 hover:text-cyan-900 underline font-bold cursor-pointer"
                                  >
                                    Düzenle
                                  </button>
                                </div>
                              );
                            })()}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 text-[11px]">
                              Taban: <strong className="text-slate-800 font-mono">{currentActiveSection.minElevation.toFixed(2)}m</strong> | Tepe: {currentActiveSection.maxElevation.toFixed(2)}m
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteSection(selectedSectionIdx)}
                              className="px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-md text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                              title="Bu kesiti modelden sil"
                            >
                              <Trash2 size={11} />
                              <span>Sil</span>
                            </button>
                          </div>
                        </div>

                        <div className="flex-1 w-full my-2 flex items-center justify-center">
                          <svg width="100%" height="100%" viewBox="0 0 700 240" preserveAspectRatio="none" className="w-full h-full">
                            {(() => {
                              const sec = currentActiveSection;
                              const matchingStruct = structures.find(s => s.isActive && Math.abs(s.station - sec.station) < 50);

                              const minX = Math.min(...sec.profile.map(p => p.x));
                              const maxX = Math.max(...sec.profile.map(p => p.x));
                              const structTopZ = matchingStruct ? Math.max(matchingStruct.roadElevation, sec.maxElevation) : sec.maxElevation;
                              const minZ = sec.minElevation;
                              const maxZ = structTopZ + 2;

                              const mapX = (x: number) => 30 + ((x - minX) / (maxX - minX || 1)) * 640;
                              const mapZ = (z: number) => 220 - ((z - minZ) / (maxZ - minZ || 1)) * 180;

                              const groundPath = `M 30 220 ` + sec.profile.map(p => `L ${mapX(p.x)} ${mapZ(p.z)}`).join(' ') + ` L 670 220 Z`;

                              return (
                                <>
                                  <path d={groundPath} fill="#f1f5f9" stroke="#334155" strokeWidth="2.5" />
                                  <line x1={mapX(sec.bankLeftX)} y1="20" x2={mapX(sec.bankLeftX)} y2="220" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" />
                                  <line x1={mapX(sec.bankRightX)} y1="20" x2={mapX(sec.bankRightX)} y2="220" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" />

                                  {/* Structure Superstructure Overlay if at section */}
                                  {matchingStruct && (
                                    <g>
                                      {/* Bridge Deck or Culvert Top */}
                                      <rect
                                        x={mapX(sec.bankLeftX)}
                                        y={Math.min(mapZ(matchingStruct.roadElevation), mapZ(matchingStruct.lowChordElevation))}
                                        width={Math.max(10, mapX(sec.bankRightX) - mapX(sec.bankLeftX))}
                                        height={Math.max(8, Math.abs(mapZ(matchingStruct.roadElevation) - mapZ(matchingStruct.lowChordElevation)))}
                                        fill="#475569"
                                        stroke="#1e293b"
                                        strokeWidth="1.5"
                                        rx="2"
                                        opacity="0.9"
                                      />
                                      {/* Deck Label */}
                                      <text
                                        x={(mapX(sec.bankLeftX) + mapX(sec.bankRightX)) / 2}
                                        y={mapZ(matchingStruct.roadElevation) - 5}
                                        fontSize="10"
                                        fill="#0f172a"
                                        fontWeight="bold"
                                        textAnchor="middle"
                                      >
                                        Tabliye: {matchingStruct.roadElevation.toFixed(2)}m | Kiriş Altı: {matchingStruct.lowChordElevation.toFixed(2)}m
                                      </text>
                                    </g>
                                  )}

                                  <text x={mapX(sec.bankLeftX) - 25} y="18" fontSize="10" fill="#64748b" fontWeight="bold">Sol Kıyı</text>
                                  <text x={mapX((sec.bankLeftX + sec.bankRightX) / 2)} y="18" fontSize="10" textAnchor="middle" fill="#0284c7" fontWeight="bold">Ana Yatak</text>
                                  <text x={mapX(sec.bankRightX) + 25} y="18" fontSize="10" fill="#64748b" fontWeight="bold">Sağ Kıyı</text>
                                </>
                              );
                            })()}
                          </svg>
                        </div>

                        <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
                          <span>Sol İstasyon: {currentActiveSection.bankLeftX.toFixed(0)}m</span>
                          <span>Merkez Kot: {currentActiveSection.minElevation.toFixed(2)}m</span>
                          <span>Sağ İstasyon: {currentActiveSection.bankRightX.toFixed(0)}m</span>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                        Önizleme için önce enkesitleri çıkarın veya manuel KML dosyasını yükleyin.
                      </div>
                    )
                  ) : (
                    /* Hydrograph Full Chart View */
                    <div className="w-full h-full bg-slate-50 p-4 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-800 pb-2 border-b border-slate-200">
                        <span className="flex items-center gap-1.5 text-cyan-800">
                          <TrendingUp size={15} />
                          Dinamik Akım Hidrografı (Zaman Serisi)
                        </span>
                        <span className="text-slate-500">
                          Pik Debi: <strong>{peakFlow} m³/s</strong> | Süre: <strong>{simDuration} Saat</strong>
                        </span>
                      </div>

                      <div className="flex-1 w-full my-3 flex items-center justify-center relative">
                        <svg width="100%" height="100%" viewBox="0 0 700 240" preserveAspectRatio="none" className="w-full h-full">
                          {(() => {
                            const maxT = Math.max(...hydrographData.map(d => d.time));
                            const maxQ = Math.max(...hydrographData.map(d => d.flow));

                            const mapX = (t: number) => 50 + (t / (maxT || 1)) * 620;
                            const mapY = (q: number) => 210 - (q / (maxQ || 1)) * 180;

                            const polyPoints = `50,210 ` + hydrographData.map(d => `${mapX(d.time)},${mapY(d.flow)}`).join(' ') + ` ${mapX(maxT)},210`;
                            const linePoints = hydrographData.map(d => `${mapX(d.time)},${mapY(d.flow)}`).join(' ');

                            return (
                              <>
                                {/* Grid lines */}
                                <line x1="50" y1="30" x2="670" y2="30" stroke="#e2e8f0" strokeDasharray="3 3" />
                                <line x1="50" y1="90" x2="670" y2="90" stroke="#e2e8f0" strokeDasharray="3 3" />
                                <line x1="50" y1="150" x2="670" y2="150" stroke="#e2e8f0" strokeDasharray="3 3" />
                                <line x1="50" y1="210" x2="670" y2="210" stroke="#cbd5e1" strokeWidth="1.5" />

                                {/* Flow Area & Line */}
                                <polygon points={polyPoints} fill="#0284c7" fillOpacity="0.25" />
                                <polyline points={linePoints} fill="none" stroke="#0284c7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

                                {hydrographData.map((d, idx) => (
                                  <circle key={idx} cx={mapX(d.time)} cy={mapY(d.flow)} r="4" fill="#0284c7" stroke="#fff" strokeWidth="2" />
                                ))}
                              </>
                            );
                          })()}
                        </svg>
                      </div>

                      <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
                        <span>Başlangıç Debisi: {hydrographData[0]?.flow} m³/s</span>
                        <span className="text-cyan-800 font-bold">Pik Debi: {peakFlow} m³/s</span>
                        <span>Bitiş Debisi: {hydrographData[hydrographData.length - 1]?.flow} m³/s</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Structure Edit Modal */}
      {isStructureModalOpen && editingStructure && (
        <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-300 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-cyan-100 text-cyan-800 rounded-lg">
                  <LayersIcon size={16} />
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Sanat Yapısı Parametreleri ({editingStructure.type === 'bridge' ? 'Köprü' : 'Menfez'})
                </h4>
              </div>
              <button
                onClick={() => {
                  setIsStructureModalOpen(false);
                  setEditingStructure(null);
                }}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3.5 overflow-y-auto custom-scrollbar flex-1 text-xs">
              {/* Form fields: Name, Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Yapı Adı / Kodu:</label>
                  <input
                    type="text"
                    value={editingStructure.name}
                    onChange={(e) => setEditingStructure({ ...editingStructure, name: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Yapı Tipi:</label>
                  <select
                    value={editingStructure.type}
                    onChange={(e) => setEditingStructure({ ...editingStructure, type: e.target.value as StructureType })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 font-bold text-slate-800 cursor-pointer"
                  >
                    <option value="bridge">Köprü (Açık Tabliyeli)</option>
                    <option value="box_culvert">Kutu Menfez (Box Culvert)</option>
                    <option value="pipe_culvert">Boru Menfez (Pipe)</option>
                  </select>
                </div>
              </div>

              {/* Konum & İstasyon Belirleme Paneli */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-900 flex items-center gap-1.5">
                    <Compass size={14} className="text-cyan-700" />
                    Konum ve Enkesit Hizalama
                  </label>
                  {editingStructure.coordinates && (
                    <span className="text-[10px] text-slate-500 font-mono bg-white px-2 py-0.5 rounded-md border border-slate-200">
                      [{editingStructure.coordinates[0].toFixed(5)}, {editingStructure.coordinates[1].toFixed(5)}]
                    </span>
                  )}
                </div>

                {/* Option A: Select from Existing Sections Dropdown */}
                {sections.length > 0 && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">
                      Mevcut Enkesitlerden Seç (Otomatik Kot ve Koordinat):
                    </label>
                    <select
                      value={
                        sections.reduce((prev, curr) => 
                          Math.abs(curr.station - editingStructure.station) < Math.abs(prev.station - editingStructure.station) ? curr : prev
                        , sections[0])?.station
                      }
                      onChange={(e) => {
                        const selectedSt = Number(e.target.value);
                        const foundSec = sections.find(s => Math.abs(s.station - selectedSt) < 1);
                        if (foundSec) {
                          const bed = Number(foundSec.minElevation.toFixed(2));
                          const diff = editingStructure.lowChordElevation - editingStructure.invertElevation;
                          const newLow = Number((bed + (diff > 0.5 ? diff : (editingStructure.type === 'bridge' ? 3.0 : 2.0))).toFixed(2));
                          const roadDiff = editingStructure.roadElevation - editingStructure.lowChordElevation;
                          const newRoad = Number((newLow + (roadDiff > 0.3 ? roadDiff : 1.0)).toFixed(2));

                          setEditingStructure({
                            ...editingStructure,
                            station: Math.round(foundSec.station),
                            coordinates: foundSec.centerCoord || editingStructure.coordinates,
                            invertElevation: bed,
                            lowChordElevation: newLow,
                            roadElevation: newRoad
                          });
                        }
                      }}
                      className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 font-bold text-slate-800 cursor-pointer shadow-2xs text-[11px]"
                    >
                      {sections.map((sec, idx) => (
                        <option key={idx} value={sec.station}>
                          Kesit #{idx + 1} — Km {(sec.station / 1000).toFixed(3)} ({sec.station.toFixed(0)} m) | Taban: {sec.minElevation.toFixed(2)} m
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Option B: Manual Station Meter & Option C: Interactive Map Picker */}
                <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">
                      İstasyon Metrajı (Metre):
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={editingStructure.station}
                        onChange={(e) => {
                          const st = Number(e.target.value);
                          const nearestSec = sections.find(s => Math.abs(s.station - st) < 60);
                          setEditingStructure({
                            ...editingStructure,
                            station: st,
                            coordinates: nearestSec?.centerCoord || editingStructure.coordinates
                          });
                        }}
                        className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 font-bold text-slate-800 text-[11px]"
                        placeholder="Örn: 250"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">m</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">
                      Harita Üzerinden Seçim:
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setRightPanelTab('map');
                        setIsSelectingLocationOnMap(true);
                        setIsStructureModalOpen(false);
                      }}
                      className="w-full py-1.5 px-2 bg-cyan-700 hover:bg-cyan-800 text-white rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer h-[32px]"
                      title="Harita üzerinden tıklayarak konum seç"
                    >
                      <Compass size={13} />
                      <span>Haritada Tıkla ve Seç</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Invert, Low Chord, Road Elevations */}
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">Taban Kotu (m):</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editingStructure.invertElevation}
                    onChange={(e) => setEditingStructure({ ...editingStructure, invertElevation: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-2 py-1 font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">Kiriş Alt / Tavan (m):</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editingStructure.lowChordElevation}
                    onChange={(e) => setEditingStructure({ ...editingStructure, lowChordElevation: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-2 py-1 font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">Tabliye / Yol (m):</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editingStructure.roadElevation}
                    onChange={(e) => setEditingStructure({ ...editingStructure, roadElevation: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-2 py-1 font-bold text-slate-800"
                  />
                </div>
              </div>

              {/* Opening Width & Pier Count */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">Net Açıklık (m):</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    value={editingStructure.openingWidth}
                    onChange={(e) => setEditingStructure({ ...editingStructure, openingWidth: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-2 py-1 font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">Ayak Sayısı (Piers):</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={editingStructure.pierCount}
                    onChange={(e) => setEditingStructure({ ...editingStructure, pierCount: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-2 py-1 font-bold text-slate-800"
                  />
                </div>
              </div>

              {/* Coefficients */}
              <div className="grid grid-cols-2 gap-2.5 pt-1 border-t border-slate-200">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">Orifis / Basınç Katsayısı (Cd):</label>
                  <input
                    type="number"
                    step="0.05"
                    value={editingStructure.orificeCoefficient}
                    onChange={(e) => setEditingStructure({ ...editingStructure, orificeCoefficient: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-2 py-1 font-bold text-slate-700"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">Savak / Aşma Katsayısı (Cw):</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editingStructure.weirCoefficient}
                    onChange={(e) => setEditingStructure({ ...editingStructure, weirCoefficient: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-2 py-1 font-bold text-slate-700"
                  />
                </div>
              </div>
            </div>

            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setIsStructureModalOpen(false);
                  setEditingStructure(null);
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs cursor-pointer"
              >
                İptal
              </button>
              <button
                onClick={() => handleSaveStructure(editingStructure)}
                className="px-4 py-1.5 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Check size={14} />
                Değişiklikleri Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manning Pürüzlülük Kütüphanesi Modalı */}
      <ManningLibraryModal
        isOpen={isManningModalOpen}
        onClose={() => setIsManningModalOpen(false)}
        onApply={(nLob, nMain, nRob) => {
          setManningLOB(nLob);
          setManningMain(nMain);
          setManningROB(nRob);
        }}
        currentLOB={manningLOB}
        currentMain={manningMain}
        currentROB={manningROB}
      />

      {/* Enkesit Yönetim & Silme Modalı */}
      <CrossSectionManagerModal
        isOpen={isSectionManagerModalOpen}
        onClose={() => setIsSectionManagerModalOpen(false)}
        sections={sections}
        deletedSections={deletedSectionsList}
        selectedSectionIdx={selectedSectionIdx}
        onSelectSection={(idx) => setSelectedSectionIdx(idx)}
        onDeleteSection={(station) => handleDeleteSection(station)}
        onBulkDeleteSections={(stations) => handleBulkDeleteSections(stations)}
        onRestoreSection={(station) => handleRestoreSection(station)}
        onRestoreAll={handleRestoreAllDeletedSections}
      />
    </div>
  );
};

export default OneDAnalysis;
