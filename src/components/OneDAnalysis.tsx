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
  X
} from 'lucide-react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import * as XLSX from 'xlsx';
import { 
  generateCrossSections, 
  parseManualCrossSections,
  runRouting, 
  parseKMLCoordinates, 
  parseKMLStructures,
  CrossSection, 
  RoutingResult,
  HydraulicStructure,
  StructureHydraulicResult,
  StructureType
} from '../utils/OneDEngine';
import { CRS_LIST, CRSItem } from '../utils/crsList';
import { MapAutoCenter } from './MapHelpers';

interface OneDAnalysisProps {
  onBackToDashboard: () => void;
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

  // Coordinate System (CRS) Selection (defaults to TUREF / TM36 (3°) EPSG:5256)
  const [selectedCRS, setSelectedCRS] = useState<CRSItem>(
    CRS_LIST.find(c => c.code === 'EPSG:5256') || CRS_LIST[0]
  );

  // File Inputs
  const [demFile, setDemFile] = useState<File | null>(null);
  const [centerlineFile, setCenterlineFile] = useState<File | null>(null);
  const [banksFile, setBanksFile] = useState<File | null>(null);
  const [centerlineCoords, setCenterlineCoords] = useState<[number, number][]>([]);
  const [bankCoords, setBankCoords] = useState<[number, number][]>([]);

  // Cross-Section Settings & Manual KML
  const [crossSectionMode, setCrossSectionMode] = useState<'auto' | 'manual'>('auto');
  const [manualKmlFile, setManualKmlFile] = useState<File | null>(null);
  const [crossSectionInterval, setCrossSectionInterval] = useState<number>(50);
  const [sectionWidth, setSectionWidth] = useState<number>(200);
  const [sections, setSections] = useState<CrossSection[]>([]);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [selectedSectionIdx, setSelectedSectionIdx] = useState<number>(0);

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

  // Simulation State & Results
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simResults, setSimResults] = useState<RoutingResult[]>([]);

  // Hydraulic Structures (Bridges & Culverts)
  const [structures, setStructures] = useState<HydraulicStructure[]>([]);
  const [structureResults, setStructureResults] = useState<StructureHydraulicResult[]>([]);
  const [structuresKmlFile, setStructuresKmlFile] = useState<File | null>(null);
  const [isStructureModalOpen, setIsStructureModalOpen] = useState<boolean>(false);
  const [editingStructure, setEditingStructure] = useState<HydraulicStructure | null>(null);
  const [expandedStructureId, setExpandedStructureId] = useState<string | null>(null);

  const currentBasemap = BASEMAP_OPTIONS.find(b => b.id === activeBasemap) || BASEMAP_OPTIONS[0];

  // Compute map bounds from centerline or cross-sections
  const mapBounds = useMemo<[[number, number], [number, number]] | null>(() => {
    const allPoints: [number, number][] = [];
    if (centerlineCoords.length > 0) {
      allPoints.push(...centerlineCoords);
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

    return [
      [minLat - 0.002, minLon - 0.002],
      [maxLat + 0.002, maxLon + 0.002]
    ];
  }, [centerlineCoords, sections]);

  // Handle Centerline KML Upload
  const handleCenterlineUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCenterlineFile(file);
      try {
        const coords = await parseKMLCoordinates(file);
        setCenterlineCoords(coords);
      } catch (err) {
        console.error("KML koordinatları okunamadı:", err);
      }
    }
  };

  // Handle Bank Stations KML Upload
  const handleBanksUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setBanksFile(file);
      try {
        const coords = await parseKMLCoordinates(file);
        setBankCoords(coords);
      } catch (err) {
        console.error("Kıyı KML koordinatları okunamadı:", err);
      }
    }
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
        const data = await parseManualCrossSections(demFile, file, selectedCRS.def);
        if (data.length === 0) {
          alert("KML dosyasında geçerli enkesit çizgileri bulunamadı.");
        } else {
          setSections(data);
          setSelectedSectionIdx(0);
          setIsFileOpened(true);
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
        const data = await parseManualCrossSections(demFile, manualKmlFile, selectedCRS.def);
        setSections(data);
        setSelectedSectionIdx(0);
        setIsFileOpened(true);
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
      const data = await generateCrossSections(
        demFile,
        centerlineFile,
        banksFile,
        null,
        crossSectionInterval,
        sectionWidth,
        selectedCRS.def
      );
      setSections(data);
      setSelectedSectionIdx(0);
      setIsFileOpened(true);
    } catch (err: any) {
      console.error(err);
      alert("Enkesit çıkarımı sırasında hata oluştu: " + err.message);
    } finally {
      setIsExtracting(false);
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

  // Add Manual Structure
  const handleAddStructure = (type: StructureType = 'bridge') => {
    const defaultStation = sections.length > 0 
      ? Math.round(sections[Math.floor(sections.length / 2)].station)
      : (structures.length + 1) * 250;

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
        setMobileTab('preview');
      } catch (err: any) {
        console.error(err);
        alert("Simülasyon hesaplama hatası: " + err.message);
        setIsSimulating(false);
      }
    }, 1200);
  };

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

  // Export Results to KML
  const exportToKML = () => {
    if (sections.length === 0) return;
    let kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>1B Hidrodinamik Taşkın Enkesitleri</name>
    <Style id="riverLine">
      <LineStyle><color>ffffaa00</color><width>4</width></LineStyle>
    </Style>
    <Style id="transectNorm">
      <LineStyle><color>ff00ff00</color><width>2</width></LineStyle>
    </Style>
    <Style id="transectFlood">
      <LineStyle><color>ff0000ff</color><width>3</width></LineStyle>
    </Style>`;

    // Add Centerline
    if (centerlineCoords.length > 0) {
      kmlContent += `
    <Placemark>
      <name>Nehir Merkez Aksı</name>
      <styleUrl>#riverLine</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
          ${centerlineCoords.map(([lat, lon]) => `${lon},${lat},0`).join(' ')}
        </coordinates>
      </LineString>
    </Placemark>`;
    }

    // Add Transects
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
  </Document>
</kml>`;

    const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `1B_Taskin_Enkesitleri_Q${peakFlow}.kml`);
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

                            const wetProfile = sec.profile.filter(p => p.z <= wl);
                            let waterSvg = null;
                            if (wetProfile.length > 1) {
                              const firstWetX = mapX(wetProfile[0].x);
                              const lastWetX = mapX(wetProfile[wetProfile.length - 1].x);
                              const waterTopY = mapZ(wl);

                              const waterPath = `M ${firstWetX} ${waterTopY} ` +
                                wetProfile.map(p => `L ${mapX(p.x)} ${mapZ(p.z)}`).join(' ') +
                                ` L ${lastWetX} ${waterTopY} Z`;

                              waterSvg = (
                                <>
                                  <path d={waterPath} fill="#0284c7" fillOpacity="0.4" />
                                  <line x1={firstWetX} y1={waterTopY} x2={lastWetX} y2={waterTopY} stroke="#0284c7" strokeWidth="2.5" />
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
                  <div className="flex-1 w-full min-h-0 rounded-xl overflow-hidden border border-slate-300 relative shadow-inner mt-2">
                    <MapContainer
                      center={centerlineCoords[0] || [39.92, 32.85]}
                      zoom={14}
                      className="w-full h-full"
                    >
                      <TileLayer url={currentBasemap.url} attribution={currentBasemap.attribution} maxZoom={24} />
                      {centerlineCoords.length > 0 && (
                        <Polyline positions={centerlineCoords} color="#0284c7" weight={4} opacity={0.9} />
                      )}
                      {bankCoords.length > 0 && (
                        <Polyline positions={bankCoords} color="#ef4444" weight={2} dashArray="4, 4" opacity={0.8} />
                      )}
                      {sections.map((sec, idx) => {
                        if (!sec.cutLine) return null;
                        const res = simResults[idx];
                        const isOver = res ? res.isOverbank : false;
                        const isSelected = idx === selectedSectionIdx;
                        return (
                          <Polyline
                            key={idx}
                            positions={sec.cutLine}
                            color={isSelected ? '#06b6d4' : isOver ? '#ef4444' : '#10b981'}
                            weight={isSelected ? 5 : 2.5}
                            opacity={0.9}
                            eventHandlers={{
                              click: () => setSelectedSectionIdx(idx)
                            }}
                          />
                        );
                      })}

                      {/* Render Hydraulic Structure Markers on Map */}
                      {structures.filter(s => s.isActive).map((struct) => {
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

                      {mapBounds && <MapAutoCenter bounds={mapBounds} />}
                    </MapContainer>

                    {/* Map Legend Overlay */}
                    <div className="absolute bottom-3 left-3 z-[400] bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-[11px] text-slate-200 border border-slate-700 shadow-xl flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                        <span>Merkez Aksı</span>
                      </div>
                      <div className="flex items-center gap-1.5 border-l border-slate-700 pl-2.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                        <span>Ana Kanalda</span>
                      </div>
                      <div className="flex items-center gap-1.5 border-l border-slate-700 pl-2.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                        <span className="text-red-300 font-bold">Taşkın Var</span>
                      </div>
                    </div>
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

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                    <p className="text-[10px] font-bold text-cyan-800 uppercase">Maks. Su Derinliği</p>
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
                    <p className="text-[10px] font-bold text-slate-700 uppercase">Ortalama Froude</p>
                    <p className="text-base font-display font-bold text-slate-900 mt-1">
                      {avgFroudeVal.toFixed(2)} ({avgFroudeVal < 1 ? 'Nehir' : 'Sel'})
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                    <p className="text-[10px] font-bold text-red-800 uppercase">Taşkın Durumu</p>
                    <p className="text-base font-display font-bold text-red-900 mt-1">
                      %{overbankPercent.toFixed(0)} ({overbankCount}/{simResults.length})
                    </p>
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

                {/* Action Buttons */}
                <div className="pt-1 space-y-2">
                  <button
                    onClick={exportToKML}
                    className="w-full py-2.5 px-3 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    <MapIcon size={15} />
                    Taşkın Sınırlarını KML Olarak İndir
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
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">
                    Nehir Merkez Hattı (KML):
                  </label>
                  {centerlineFile ? (
                    <div className="bg-blue-50 border border-blue-200 p-2 rounded-xl flex items-center justify-between gap-2">
                      <div className="space-y-0.5 overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 size={13} className="text-blue-600 shrink-0" />
                          <span className="font-bold text-slate-900 text-xs truncate">{centerlineFile.name}</span>
                        </div>
                        <p className="text-[10px] text-blue-700 truncate">
                          {centerlineCoords.length} Nokta Akış Aksı
                        </p>
                      </div>
                      <label className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-800 rounded-lg text-[10px] font-bold cursor-pointer border border-slate-300 shrink-0 transition-all shadow-sm">
                        Değiştir
                        <input type="file" accept=".kml" onChange={handleCenterlineUpload} className="hidden" />
                      </label>
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

                {/* Bank Stations KML Input */}
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">
                    Kıyı Çizgileri / Bank Stations (KML):
                  </label>
                  {banksFile ? (
                    <div className="bg-amber-50 border border-amber-200 p-2 rounded-xl flex items-center justify-between gap-2">
                      <div className="space-y-0.5 overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 size={13} className="text-amber-600 shrink-0" />
                          <span className="font-bold text-slate-900 text-xs truncate">{banksFile.name}</span>
                        </div>
                        <p className="text-[10px] text-amber-700 truncate">Sağ & Sol Kıyı Hatları</p>
                      </div>
                      <label className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-800 rounded-lg text-[10px] font-bold cursor-pointer border border-slate-300 shrink-0 transition-all shadow-sm">
                        Değiştir
                        <input type="file" accept=".kml" onChange={handleBanksUpload} className="hidden" />
                      </label>
                    </div>
                  ) : (
                    <label className="flex items-center justify-between gap-2 p-2 border border-dashed border-slate-300 rounded-xl hover:bg-slate-100 transition-all cursor-pointer bg-slate-50 group">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className="p-1 bg-amber-100 text-amber-800 rounded-lg group-hover:scale-105 transition-transform shrink-0">
                          <Activity size={14} />
                        </div>
                        <span className="font-bold text-xs text-slate-800 truncate">Kıyı Çizgileri KML (Opsiyonel)</span>
                      </div>
                      <span className="px-2 py-0.5 bg-amber-700 text-white rounded-lg text-[10px] font-bold shrink-0 shadow-sm">
                        Gözat
                      </span>
                      <input type="file" accept=".kml" onChange={handleBanksUpload} className="hidden" />
                    </label>
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
              </section>

              {/* 3. MANNING PÜRÜZLÜLÜK KATSAYILARI */}
              <section className="bg-white rounded-2xl p-3 border border-slate-300 shadow-sm space-y-2.5 shrink-0">
                <div className="pb-1.5 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Droplets size={14} className="text-cyan-700" />
                    <span>3. Manning Pürüzlülüğü (n)</span>
                  </h2>
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
                    <label className="text-[10px] font-bold text-slate-700 block mb-1">Mansap Eğim (S₀):</label>
                    <input
                      type="number"
                      step="0.0005"
                      min="0.0001"
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
                      <select
                        value={selectedSectionIdx}
                        onChange={(e) => setSelectedSectionIdx(Number(e.target.value))}
                        className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 shadow-sm"
                      >
                        {sections.map((s, idx) => (
                          <option key={idx} value={idx}>
                            Kesit Km {(s.station / 1000).toFixed(3)}
                          </option>
                        ))}
                      </select>
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
                            <Polyline positions={centerlineCoords} color="#0284c7" weight={4} opacity={0.9} />
                          )}
                          {bankCoords.length > 0 && (
                            <Polyline positions={bankCoords} color="#ef4444" weight={2} dashArray="4, 4" opacity={0.8} />
                          )}
                          {sections.map((sec, idx) => {
                            if (!sec.cutLine) return null;
                            const isSelected = idx === selectedSectionIdx;
                            return (
                              <Polyline
                                key={idx}
                                positions={sec.cutLine}
                                color={isSelected ? '#06b6d4' : '#10b981'}
                                weight={isSelected ? 4 : 2}
                                opacity={0.85}
                                eventHandlers={{
                                  click: () => setSelectedSectionIdx(idx)
                                }}
                              />
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
                                  <div className="text-xs space-y-1 min-w-[180px]">
                                    <div className="font-bold text-slate-900 border-b pb-1">
                                      {struct.type === 'bridge' ? '🌉 Köprü' : '🔲 Menfez'}: {struct.name}
                                    </div>
                                    <div className="text-[11px] text-slate-600">
                                      <div>Konum: <strong>Km {(struct.station / 1000).toFixed(3)}</strong></div>
                                      <div>Tabliye: <strong>{struct.roadElevation.toFixed(2)} m</strong></div>
                                      <div>Kiriş Altı: <strong>{struct.lowChordElevation.toFixed(2)} m</strong></div>
                                      <div>Açıklık: <strong>{struct.openingWidth} m</strong></div>
                                    </div>
                                  </div>
                                </Popup>
                              </CircleMarker>
                            );
                          })}

                          {mapBounds && <MapAutoCenter bounds={mapBounds} />}
                        </MapContainer>

                        {/* Top Notification Banner inside Map */}
                        <div className="absolute top-2.5 left-2.5 z-[400] bg-slate-900/90 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] text-slate-100 border border-slate-700 flex items-center gap-1.5 shadow-md">
                          <Compass className="text-cyan-400 shrink-0" size={13} />
                          <span>Harita üzerindeki yeşil çizgilere tıklayarak enkesitleri seçebilirsiniz</span>
                        </div>

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
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800 pb-2 border-b border-slate-200">
                          <div className="flex items-center gap-2">
                            <span>Doğal Zemin Enkesiti: Km {(currentActiveSection.station / 1000).toFixed(3)}</span>
                            {(() => {
                              const matchingStruct = structures.find(s => s.isActive && Math.abs(s.station - currentActiveSection.station) < 50);
                              if (!matchingStruct) return null;
                              return (
                                <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                  {matchingStruct.type === 'bridge' ? '🌉 Köprü:' : '🔲 Menfez:'} {matchingStruct.name}
                                </span>
                              );
                            })()}
                          </div>
                          <span className="text-slate-500">
                            Kot Aralığı: {currentActiveSection.minElevation.toFixed(2)}m - {currentActiveSection.maxElevation.toFixed(2)}m
                          </span>
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

              {/* Station, Invert, Low Chord */}
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">İstasyon (m):</label>
                  <input
                    type="number"
                    value={editingStructure.station}
                    onChange={(e) => setEditingStructure({ ...editingStructure, station: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-2 py-1 font-bold text-slate-800"
                  />
                </div>
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
              </div>

              {/* Road, Opening Width, Pier Count */}
              <div className="grid grid-cols-3 gap-2.5">
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
    </div>
  );
};

export default OneDAnalysis;
