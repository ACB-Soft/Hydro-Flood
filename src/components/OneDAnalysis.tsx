import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
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
  Layers as LayersIcon
} from 'lucide-react';
import { MapContainer, TileLayer, Polyline, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  generateCrossSections, 
  runRouting, 
  parseKMLCoordinates, 
  CrossSection, 
  RoutingResult 
} from '../utils/OneDEngine';
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

const OneDAnalysis: React.FC<OneDAnalysisProps> = ({ onBackToDashboard }) => {
  // Navigation & View Mode
  const [isResultPage, setIsResultPage] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<'controls' | 'preview'>('controls');
  const [rightPanelTab, setRightPanelTab] = useState<'map' | 'section' | 'profile'>('map');
  const [resultTab, setResultTab] = useState<'profile' | 'section' | 'map'>('profile');
  const [activeBasemap, setActiveBasemap] = useState<string>('hybrid');
  const [showBasemapMenu, setShowBasemapMenu] = useState<boolean>(false);
  const [isFileOpened, setIsFileOpened] = useState<boolean>(false);

  // File Inputs
  const [demFile, setDemFile] = useState<File | null>(null);
  const [centerlineFile, setCenterlineFile] = useState<File | null>(null);
  const [banksFile, setBanksFile] = useState<File | null>(null);
  const [centerlineCoords, setCenterlineCoords] = useState<[number, number][]>([]);
  const [bankCoords, setBankCoords] = useState<[number, number][]>([]);

  // Cross-Section Settings
  const [crossSectionInterval, setCrossSectionInterval] = useState<number>(50);
  const [sectionWidth, setSectionWidth] = useState<number>(200);
  const [sections, setSections] = useState<CrossSection[]>([]);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [selectedSectionIdx, setSelectedSectionIdx] = useState<number>(0);

  // Manning Roughness Coefficients (n)
  const [manningLOB, setManningLOB] = useState<number>(0.060); // Sol Taşkın Yatağı
  const [manningMain, setManningMain] = useState<number>(0.035); // Ana Kanal
  const [manningROB, setManningROB] = useState<number>(0.060); // Sağ Taşkın Yatağı

  // Hydraulic Boundary Conditions
  const [peakFlow, setPeakFlow] = useState<number>(150); // m3/s
  const [downstreamSlope, setDownstreamSlope] = useState<number>(0.001); // m/m
  const [simDuration, setSimDuration] = useState<number>(24); // hours

  // Simulation State & Results
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simResults, setSimResults] = useState<RoutingResult[]>([]);

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

  // Generate Cross Sections from DEM and Centerline
  const handleGenerateSections = async () => {
    if (!demFile || !centerlineFile) {
      alert("Lütfen DEM ve Nehir Merkez Hattı KML dosyalarını yükleyin.");
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
        sectionWidth
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

  // Run 1D Hydrodynamic Simulation
  const handleStartAnalysis = () => {
    if (sections.length === 0) {
      if (!demFile || !centerlineFile) {
        alert("Lütfen önce DEM ve Merkez Hattı dosyalarını seçip enkesitleri üretin.");
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
        const results = runRouting(
          sections,
          peakFlow,
          manningMain,
          manningLOB,
          manningROB,
          downstreamSlope
        );
        setSimResults(results);
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
    const headers = "Kesit_No,Istasyon_m,Taban_Kotu_m,Su_Kotu_m,Su_Derinligi_m,Akis_Hizi_ms,Islak_Alan_m2,Ust_Genislik_m,Froude_Sayisi,Kanal_Tasma_Durumu\n";
    const rows = simResults.map((r, i) => 
      `${i + 1},${r.station},${r.bedElevation.toFixed(2)},${r.waterElevation.toFixed(2)},${r.maxDepth.toFixed(2)},${r.velocity.toFixed(2)},${r.area.toFixed(2)},${r.topWidth.toFixed(2)},${r.froudeNumber.toFixed(2)},${r.isOverbank ? 'Taşkın Yatağında' : 'Ana Kanalda'}`
    ).join("\n");

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
            {/* LEFT / CENTER VISUALIZATION PANEL (col-span-8 or 9) */}
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

                          // Water filled polygon
                          const waterPoly = `${mapX(simResults[0].station)},${mapY(simResults[0].bedElevation)} ` +
                            simResults.map(r => `${mapX(r.station)},${mapY(r.waterElevation)}`).join(' ') +
                            ` ${mapX(simResults[simResults.length - 1].station)},${mapY(simResults[simResults.length - 1].bedElevation)} ` +
                            simResults.slice().reverse().map(r => `${mapX(r.station)},${mapY(r.bedElevation)}`).join(' ');

                          const curX = mapX(currentActiveResult?.station || 0);

                          return (
                            <>
                              {/* Water Polygon */}
                              <polygon points={waterPoly} fill="#0284c7" fillOpacity="0.25" />

                              {/* River Bed Line */}
                              <polyline points={bedPoints} fill="none" stroke="#1e293b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

                              {/* Water Surface Line */}
                              <polyline points={wsePoints} fill="none" stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                              {/* Energy Grade Line */}
                              <polyline points={eglPoints} fill="none" stroke="#d97706" strokeWidth="1.5" strokeDasharray="5 3" />

                              {/* Current Selected Station Indicator */}
                              <line x1={curX} y1="30" x2={curX} y2="260" stroke="#0ea5e9" strokeWidth="2" strokeDasharray="3 3" />
                              <circle cx={curX} cy={mapY(currentActiveResult?.waterElevation || 0)} r="4" fill="#0284c7" stroke="#fff" strokeWidth="2" />
                            </>
                          );
                        })()}
                      </svg>
                    </div>

                    {/* Bottom slider controller */}
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
                {resultTab === 'section' && currentActiveSection && currentActiveResult && (
                  <div className="flex-1 flex flex-col min-h-0 pt-2 relative overflow-hidden">
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
                          const maxZ = Math.max(sec.maxElevation, wl + 1);

                          const mapX = (x: number) => 30 + ((x - minX) / (maxX - minX || 1)) * 640;
                          const mapZ = (z: number) => 250 - ((z - minZ) / (maxZ - minZ || 1)) * 200;

                          const groundPath = `M 30 250 ` + sec.profile.map(p => `L ${mapX(p.x)} ${mapZ(p.z)}`).join(' ') + ` L 670 250 Z`;

                          // Water polygon
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
                              {/* Ground Fill */}
                              <path d={groundPath} fill="#f1f5f9" stroke="#334155" strokeWidth="2" strokeLinejoin="round" />

                              {/* Water Level */}
                              {waterSvg}

                              {/* Bank Station Lines */}
                              <line x1={mapX(sec.bankLeftX)} y1="40" x2={mapX(sec.bankLeftX)} y2="250" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" />
                              <line x1={mapX(sec.bankRightX)} y1="40" x2={mapX(sec.bankRightX)} y2="250" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" />

                              {/* Labels */}
                              <text x={mapX(sec.bankLeftX) - 30} y="35" fontSize="10" fill="#64748b" fontWeight="bold">Sol Taşkın Yt.</text>
                              <text x={mapX((sec.bankLeftX + sec.bankRightX) / 2)} y="35" fontSize="10" textAnchor="middle" fill="#0284c7" fontWeight="bold">Ana Kanal</text>
                              <text x={mapX(sec.bankRightX) + 30} y="35" fontSize="10" fill="#64748b" fontWeight="bold">Sağ Taşkın Yt.</text>
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
                )}

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
              {demFile && centerlineFile && (
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
              {/* 1. TOPOGRAFYA VE KML ŞEBEKE */}
              <section className="bg-white rounded-2xl p-3 border border-slate-300 shadow-sm space-y-2.5 shrink-0">
                <div className="pb-1.5 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <FileText size={14} className="text-cyan-700" />
                    <span>1. Topografya & Nehir Geometrisi</span>
                  </h2>
                  {demFile && centerlineFile && (
                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full border border-emerald-300 flex items-center gap-0.5">
                      <CheckCircle2 size={10} />
                      Hazır
                    </span>
                  )}
                </div>

                {/* DEM File Input */}
                <div>
                  <label className="text-[10px] font-bold text-slate-700 block mb-1">
                    Sayısal Yükseklik Modeli (DEM):
                  </label>
                  {demFile ? (
                    <div className="bg-emerald-50 border border-emerald-200 p-2 rounded-xl flex items-center justify-between gap-2">
                      <div className="space-y-0.5 overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                          <span className="font-bold text-slate-900 text-xs truncate">{demFile.name}</span>
                        </div>
                        <p className="text-[10px] text-slate-600 truncate">
                          {(demFile.size / (1024 * 1024)).toFixed(2)} MB • Raster GeoTIFF
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

              {/* 2. ENKESİT ÇIKARIMI PARAMETRELERİ */}
              <section className="bg-white rounded-2xl p-3 border border-slate-300 shadow-sm space-y-2.5 shrink-0">
                <div className="pb-1.5 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Ruler size={14} className="text-cyan-700" />
                    <span>2. Doğal Enkesit Çıkarımı</span>
                  </h2>
                  {sections.length > 0 && (
                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full border border-emerald-300">
                      {sections.length} Kesit
                    </span>
                  )}
                </div>

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
                      <span>{sections.length > 0 ? 'Enkesitleri Yeniden Üret' : 'Enkesitleri Çıkar'}</span>
                    </>
                  )}
                </button>
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

              {/* 4. HİDROLİK SINIR ŞARTLARI & DEBİ */}
              <section className="bg-white rounded-2xl p-3 border border-slate-300 shadow-sm space-y-2.5 shrink-0">
                <div className="pb-1.5 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Activity size={14} className="text-cyan-700" />
                    <span>4. Hidrolojik & Sınır Şartları</span>
                  </h2>
                </div>

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
                    <label className="text-[10px] font-bold text-slate-700 block mb-1">Süre (Saat):</label>
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

              {/* 5. START SIMULATION BUTTON */}
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

                {/* Content View: Map or Cross Section Profile */}
                <div className="flex-1 w-full min-h-0 rounded-xl overflow-hidden border border-slate-300 relative shadow-inner">
                  {rightPanelTab === 'map' ? (
                    !isFileOpened && centerlineCoords.length === 0 ? (
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
                            {demFile && centerlineFile ? (
                              <>
                                DEM ve Nehir Merkez Aksı seçildi. Haritada eksen ve enkesitleri görüntülemek için{' '}
                                <strong className="text-slate-900 font-bold">'Dosyayı Aç'</strong> butonuna basınız.
                              </>
                            ) : (
                              <>
                                Sol panelden DEM ve Merkez Aks KML dosyalarını yükleyerek nehir güzergahını ve enkesit
                                hatlarını haritada inceleyebilirsiniz.
                              </>
                            )}
                          </p>
                        </div>
                        {demFile && centerlineFile && (
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
                          center={centerlineCoords[0] || [39.92, 32.85]}
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
                            {centerlineCoords.length > 0 && (
                              <span>
                                <strong className="text-cyan-400">Merkez Aks:</strong> {centerlineCoords.length} Nokta
                              </span>
                            )}
                            {sections.length > 0 && (
                              <span>
                                <strong className="text-emerald-400">Üretilen Enkesit:</strong> {sections.length} Adet (dx: {crossSectionInterval}m)
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
                  ) : (
                    /* Cross Section Profile SVG */
                    currentActiveSection ? (
                      <div className="w-full h-full bg-slate-50 p-4 flex flex-col justify-between">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800 pb-2 border-b border-slate-200">
                          <span>Doğal Zemin Enkesiti: Km {(currentActiveSection.station / 1000).toFixed(3)}</span>
                          <span className="text-slate-500">
                            Kot Aralığı: {currentActiveSection.minElevation.toFixed(2)}m - {currentActiveSection.maxElevation.toFixed(2)}m
                          </span>
                        </div>

                        <div className="flex-1 w-full my-2 flex items-center justify-center">
                          <svg width="100%" height="100%" viewBox="0 0 700 240" preserveAspectRatio="none" className="w-full h-full">
                            {(() => {
                              const sec = currentActiveSection;
                              const minX = Math.min(...sec.profile.map(p => p.x));
                              const maxX = Math.max(...sec.profile.map(p => p.x));
                              const minZ = sec.minElevation;
                              const maxZ = sec.maxElevation + 2;

                              const mapX = (x: number) => 30 + ((x - minX) / (maxX - minX || 1)) * 640;
                              const mapZ = (z: number) => 220 - ((z - minZ) / (maxZ - minZ || 1)) * 180;

                              const groundPath = `M 30 220 ` + sec.profile.map(p => `L ${mapX(p.x)} ${mapZ(p.z)}`).join(' ') + ` L 670 220 Z`;

                              return (
                                <>
                                  <path d={groundPath} fill="#f1f5f9" stroke="#334155" strokeWidth="2.5" />
                                  <line x1={mapX(sec.bankLeftX)} y1="20" x2={mapX(sec.bankLeftX)} y2="220" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" />
                                  <line x1={mapX(sec.bankRightX)} y1="20" x2={mapX(sec.bankRightX)} y2="220" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" />

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
                        Önizleme için önce enkesitleri çıkarın.
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OneDAnalysis;
