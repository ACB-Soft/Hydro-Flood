import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Globe,
  Settings,
  Cpu,
  Database,
  Activity,
  Maximize2,
  RefreshCw,
  Terminal,
  Play,
  Pause,
  AlertTriangle,
  Layers,
  Thermometer,
  Droplet,
  Compass,
  ArrowLeft,
  Search,
  CheckCircle,
} from 'lucide-react';

const ITwinWorkspace: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'hierarchy' | 'query' | 'telemetry'>('telemetry');
  const [queryInput, setQueryInput] = useState<string>('SELECT ecinstanceid, userlabel, origin, geom FROM bis.SpatialElement LIMIT 10');
  const [queryResults, setQueryResults] = useState<any[]>([
    { id: '0x20000000002', name: 'Ana İzohips - Seviye 1', type: 'ContourLine', minZ: 100, maxZ: 380, pts: 128 },
    { id: '0x20000000005', name: 'Ara İzohips - Seviye 2', type: 'ContourLine', minZ: 102, maxZ: 378, pts: 342 },
    { id: '0x2000000000c', name: 'Nirengi Noktası 01', type: 'ElevationPoint', elevation: 142.5 },
    { id: '0x20000000010', name: 'Nirengi Noktası 02', type: 'ElevationPoint', elevation: 210.0 },
    { id: '0x2000000001a', name: 'Akarsu Kanalı', type: 'WaterRoute', length: '1.2 km' },
  ]);

  const [simulatedTime, setSimulatedTime] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncLogs, setSyncLogs] = useState<string[]>([
    'System: iTwin web visualization engine initialized.',
    'iModel: Loading schema "BisCore" version 1.0.12...',
    'iModel: Cache optimized for EPSG:5254 (TUREF 3-degree).',
    'Sync: Found 6 active 3D model layers.',
    'IoT: Handshake with telemetry node [GEO-STREAM-90] OK.',
  ]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rotY, setRotY] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);
  const [showWireframe, setShowWireframe] = useState<boolean>(false);
  const [sensorValues, setSensorValues] = useState({
    flow: 1.25,
    temp: 22.4,
    moisture: 42.8,
    status: 'NORMAL',
  });

  // Time & IoT simulation
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setSimulatedTime(now.toLocaleTimeString('tr-TR'));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      // Rotate 3D canvas
      setRotY((r) => (r + 0.005) % (Math.PI * 2));

      // Fluctuate IoT sensors
      setSensorValues((prev) => {
        const dFlow = (Math.random() - 0.5) * 0.06;
        const dTemp = (Math.random() - 0.5) * 0.1;
        const dMoisture = (Math.random() - 0.5) * 0.4;
        const newFlow = Math.max(0.1, Math.min(10, prev.flow + dFlow));
        return {
          flow: parseFloat(newFlow.toFixed(2)),
          temp: parseFloat(Math.max(15, Math.min(35, prev.temp + dTemp)).toFixed(1)),
          moisture: parseFloat(Math.max(20, Math.min(80, prev.moisture + dMoisture)).toFixed(1)),
          status: newFlow > 3.0 ? 'KRİTİK TAŞKIN' : newFlow > 2.0 ? 'UYARI' : 'NORMAL',
        };
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Sync animation handler
  const handleManualSync = () => {
    setIsSyncing(true);
    const newLog = `Sync [${new Date().toLocaleTimeString()}]: Re-indexing element geometry spatial indexes...`;
    setSyncLogs((prev) => [...prev, newLog]);
    setTimeout(() => {
      setIsSyncing(false);
      setSyncLogs((prev) => [...prev, `Sync [${new Date().toLocaleTimeString()}]: Bentley Hub successfully synchronized.`]);
    }, 2000);
  };

  // Run custom ECSQL queries
  const handleQuery = (e: React.FormEvent) => {
    e.preventDefault();
    const newLog = `ECSQL: executing "${queryInput}"...`;
    setSyncLogs((prev) => [...prev, newLog]);
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      // Generate some mock query result rows based on what they queried
      setQueryResults([
        { id: '0x301', class: 'bis.SpatialElement', origin: 'X: 485,210, Y: 4,421,180', level: 2 },
        { id: '0x302', class: 'bis.SpatialElement', origin: 'X: 485,340, Y: 4,421,290', level: 2 },
        { id: '0x303', class: 'bis.SpatialElement', origin: 'X: 485,150, Y: 4,421,020', level: 3 },
      ]);
      setSyncLogs((prev) => [...prev, `ECSQL: query returned 3 records.`]);
    }, 600);
  };

  // Render a beautiful simulated 3D terrain grid mesh inside canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;

    ctx.clearRect(0, 0, width, height);

    // Camera projections parameters
    const cx = width / 2;
    const cy = height / 2 + 30;
    const size = 180 * zoom;
    const pitch = 0.6; // fixed tilt

    const project = (x: number, y: number, z: number) => {
      // Rotate around Y axis
      const rx = x * Math.cos(rotY) - y * Math.sin(rotY);
      const ry = x * Math.sin(rotY) + y * Math.cos(rotY);

      // Map to 2D screen coordinate
      const px = rx * size;
      const py = (ry * Math.sin(pitch) - z * 0.6) * size;

      return {
        x: cx + px,
        y: cy + py,
      };
    };

    // Draw grid of 3D terrain surface
    const gridPoints = 14;
    const mesh: { x: number; y: number; z: number }[][] = [];

    // Pre-calculate heights with wave and river bed depression
    for (let i = 0; i < gridPoints; i++) {
      const row: { x: number; y: number; z: number }[] = [];
      const u = (i / (gridPoints - 1)) * 2 - 1; // -1 to 1

      for (let j = 0; j < gridPoints; j++) {
        const v = (j / (gridPoints - 1)) * 2 - 1; // -1 to 1

        // Base height with hills
        let z = Math.sin(u * 2.5) * Math.cos(v * 2.5) * 0.35 + Math.cos(u * 4) * 0.12;

        // Simulate a river cutting through the landscape
        const riverDistance = Math.abs(u - v * 0.5);
        if (riverDistance < 0.25) {
          z -= (0.25 - riverDistance) * 1.2; // River bed depression
        }

        row.push({ x: u, y: v, z });
      }
      mesh.push(row);
    }

    // Draw faces / wireframe
    ctx.lineWidth = 1;
    for (let i = 0; i < gridPoints - 1; i++) {
      for (let j = 0; j < gridPoints - 1; j++) {
        const p1 = project(mesh[i][j].x, mesh[i][j].y, mesh[i][j].z);
        const p2 = project(mesh[i+1][j].x, mesh[i+1][j].y, mesh[i+1][j].z);
        const p3 = project(mesh[i+1][j+1].x, mesh[i+1][j+1].y, mesh[i+1][j+1].z);
        const p4 = project(mesh[i][j+1].x, mesh[i][j+1].y, mesh[i][j+1].z);

        // Calculate face depth for stylized shading
        const avgZ = (mesh[i][j].z + mesh[i+1][j].z + mesh[i+1][j+1].z + mesh[i][j+1].z) / 4;

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();

        if (showWireframe) {
          ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
          ctx.stroke();
        } else {
          // Color based on height & proximity to river
          const uVal = mesh[i][j].x;
          const vVal = mesh[i][j].y;
          const riverDist = Math.abs(uVal - vVal * 0.5);

          let fillCol = '';
          if (riverDist < 0.12) {
            // Flowing blue water color
            fillCol = `rgba(14, 165, 233, ${0.4 + Math.sin(rotY * 10 + uVal * 5) * 0.15})`;
          } else if (avgZ > 0.18) {
            // High altitude rocky peaks
            fillCol = `rgba(100, 116, 139, ${0.4 + avgZ * 0.5})`;
          } else if (avgZ < -0.15) {
            // Green riverbank valleys
            fillCol = `rgba(16, 185, 129, ${0.35 + Math.abs(avgZ) * 0.4})`;
          } else {
            // General land terrain color
            fillCol = `rgba(71, 85, 105, ${0.35 + (avgZ + 0.5) * 0.3})`;
          }

          ctx.fillStyle = fillCol;
          ctx.fill();

          // Mesh borders
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.15)';
          ctx.stroke();
        }
      }
    }

    // Render active IoT nodes on the 3D grid
    const iotNodes = [
      { x: -0.4, y: -0.2, label: 'GEO-STREAM-90', col: '#0ea5e9' },
      { x: 0.5, y: 0.6, label: 'TAŞKIN-DET-04', col: '#f43f5e' },
    ];

    iotNodes.forEach((node) => {
      // Find height z at node
      const uIdx = Math.floor((node.x + 1) * 0.5 * (gridPoints - 1));
      const vIdx = Math.floor((node.y + 1) * 0.5 * (gridPoints - 1));
      const zVal = mesh[uIdx]?.[vIdx]?.z || 0;

      const p = project(node.x, node.y, zVal);

      // Beacon ring animation
      const radiusPulse = 8 + Math.sin(rotY * 20) * 4;
      ctx.beginPath();
      ctx.strokeStyle = node.col + '80';
      ctx.arc(p.x, p.y, radiusPulse, 0, Math.PI * 2);
      ctx.stroke();

      // Solid center dot
      ctx.beginPath();
      ctx.fillStyle = node.col;
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '10px monospace';
      ctx.fillText(node.label, p.x + 8, p.y - 4);
    });

  }, [rotY, zoom, showWireframe]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-x-hidden">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 transition-colors"
              title="Ana panele geri dön"
            >
              <ArrowLeft size={16} />
            </a>
            <div className="flex items-center gap-2">
              <Globe className="text-indigo-400 animate-spin [animation-duration:10s]" size={22} />
              <div>
                <h1 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  Bentley iTwin® Digital Twin Command Center
                </h1>
                <p className="text-[10px] text-slate-400 font-medium">
                  CONNECTED PROJECT HUB • TUREF EPSG:5254 GRID
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-2 font-mono">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
              <span className="text-slate-400 text-[10px]">LİVE SYNC TIME:</span>
              <span className="text-emerald-400 font-bold">{simulatedTime}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left column: 3D WebGL viewer simulated (8 columns) */}
        <div className="lg:col-span-8 flex flex-col space-y-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col flex-1 min-h-[460px]">
            {/* View toolbar */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/60 flex-wrap gap-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">iModel 3D Engine Preview</span>
                <span className="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-full font-semibold">
                  WebGL 2.0
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs">
                {/* Orbit Control Toggle */}
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className={`p-1.5 rounded-lg border flex items-center gap-1 transition-all ${
                    isPlaying
                      ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20 font-bold'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                  title={isPlaying ? 'Dönüşü duraklat' : 'Dönüşü başlat'}
                >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                  <span>{isPlaying ? 'Otomatik Döndür' : 'Duraklatıldı'}</span>
                </button>

                {/* Wireframe toggle */}
                <button
                  onClick={() => setShowWireframe(!showWireframe)}
                  className={`p-1.5 rounded-lg border transition-all ${
                    showWireframe
                      ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30 font-bold'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  Tel Kafes / Wireframe
                </button>

                {/* Zoom tools */}
                <button
                  onClick={() => setZoom((z) => Math.min(z + 0.15, 2.0))}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  Zoom +
                </button>
                <button
                  onClick={() => setZoom((z) => Math.max(z - 0.15, 0.6))}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  Zoom -
                </button>
              </div>
            </div>

            {/* Immersive 3D Canvas rendering container */}
            <div className="relative flex-1 rounded-xl overflow-hidden bg-slate-950 mt-4 border border-slate-800 flex items-center justify-center min-h-[360px]">
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

              {/* Float Water level indicators overlay */}
              <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-sm border border-slate-800 p-3 rounded-xl space-y-1 font-mono text-xs">
                <span className="text-slate-500 text-[10px] block">LİVE HYDROMETRY STATION</span>
                <div className="flex items-center gap-1.5 text-slate-200">
                  <Activity size={14} className="text-cyan-400" />
                  <span>Kanal Debisi: </span>
                  <span className="text-cyan-400 font-bold">{sensorValues.flow} m³/s</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-200">
                  <Thermometer size={14} className="text-amber-400" />
                  <span>Ortam Sıcaklığı: </span>
                  <span className="text-amber-400 font-bold">{sensorValues.temp} °C</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-200">
                  <Droplet size={14} className="text-emerald-400" />
                  <span>Toprak Nemi: </span>
                  <span className="text-emerald-400 font-bold">{sensorValues.moisture} %</span>
                </div>
              </div>

              {/* Status Alert Badge */}
              <div className="absolute top-3 right-3">
                <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold flex items-center gap-1 font-mono uppercase ${
                  sensorValues.status === 'NORMAL'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                    : 'bg-rose-500/15 text-rose-300 border-rose-500/30 animate-pulse'
                }`}>
                  <AlertTriangle size={12} />
                  TAŞKIN ALARMI: {sensorValues.status}
                </span>
              </div>

              {/* 3D Navigation compass */}
              <div className="absolute bottom-4 right-4 bg-slate-900/75 p-2 rounded-xl border border-slate-800">
                <Compass
                  size={32}
                  className="text-slate-400"
                  style={{ transform: `rotate(${rotY * (180 / Math.PI)}deg)` }}
                />
              </div>
            </div>
          </div>

          {/* Sync status logs */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Terminal size={14} className="text-indigo-400" />
                iTwin Event Hub & synchronization output
              </h4>
              <button
                onClick={handleManualSync}
                disabled={isSyncing}
                className="text-[10px] font-bold px-2 py-1 rounded bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/20 text-indigo-300 transition-all flex items-center gap-1"
              >
                <RefreshCw size={10} className={isSyncing ? 'animate-spin' : ''} />
                <span>Eşitle</span>
              </button>
            </div>
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 h-28 overflow-y-auto font-mono text-[10px] text-slate-300 space-y-1 scrollbar-thin">
              {syncLogs.map((log, i) => (
                <div key={i} className="flex items-start gap-1 leading-normal">
                  <span className="text-slate-600 shrink-0 select-none">&gt;</span>
                  <span>{log}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: Bentley Integration metadata, query & elements (4 columns) */}
        <div className="lg:col-span-4 flex flex-col space-y-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              {/* Tab options */}
              <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800/60 text-center text-xs">
                <button
                  onClick={() => setActiveTab('telemetry')}
                  className={`py-1.5 rounded-lg font-bold transition-all ${
                    activeTab === 'telemetry'
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Telemetri
                </button>
                <button
                  onClick={() => setActiveTab('hierarchy')}
                  className={`py-1.5 rounded-lg font-bold transition-all ${
                    activeTab === 'hierarchy'
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  iModel Ağacı
                </button>
                <button
                  onClick={() => setActiveTab('query')}
                  className={`py-1.5 rounded-lg font-bold transition-all ${
                    activeTab === 'query'
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  ECSQL Sorgu
                </button>
              </div>

              {/* Tab contents */}
              <div className="min-h-[290px]">
                {activeTab === 'telemetry' && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-slate-300">Saha IoT Sensör Verileri</h4>
                      <p className="text-[10px] text-slate-500 leading-tight">
                        Aşağıdaki veriler Bentley iTwin API aracılığıyla CBS harita katmanı üzerindeki IoT sensör istasyonlarından canlı olarak okunmaktadır.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5">
                      <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/25">
                            <Activity size={16} />
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Akarsu Kanal Debisi</span>
                            <span className="text-xs font-bold text-white">İstasyon GEO-STREAM-90</span>
                          </div>
                        </div>
                        <span className="text-cyan-400 font-mono font-bold text-sm">{sensorValues.flow} m³/s</span>
                      </div>

                      <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/25">
                            <Thermometer size={16} />
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Saha Sıcaklığı</span>
                            <span className="text-xs font-bold text-white">İstasyon GEO-TEMP-11</span>
                          </div>
                        </div>
                        <span className="text-amber-400 font-mono font-bold text-sm">{sensorValues.temp} °C</span>
                      </div>

                      <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                            <Droplet size={16} />
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Toprak Nem Endeksi</span>
                            <span className="text-xs font-bold text-white">İstasyon TAŞKIN-DET-04</span>
                          </div>
                        </div>
                        <span className="text-emerald-400 font-mono font-bold text-sm">{sensorValues.moisture} %</span>
                      </div>
                    </div>

                    <div className="p-3.5 bg-slate-950/40 rounded-xl border border-slate-800 text-[11px] text-slate-400 leading-relaxed space-y-1">
                      <span className="text-[10px] font-bold text-slate-300 block uppercase tracking-wider">iTwin Telemetry Hub</span>
                      <p>
                        Canlı sensör telemetrileri Bentley iTwin bulut bağlantısı üzerinden 3D arazi modeliyle anlık çakıştırılarak taşkın risk analizi ve erken uyarı sistemini tetikler.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === 'hierarchy' && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-slate-300">Sınıf Hiyerarşisi (iModel Class Tree)</h4>
                      <p className="text-[10px] text-slate-500 leading-tight">
                        iModel içindeki nesneler BIS (Built-in Spatial) semantik standart sınıflarına göre otomatik kategorize edilmiştir.
                      </p>
                    </div>

                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      <div className="p-2 rounded-lg bg-slate-950 border border-slate-850 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <Layers size={14} className="text-cyan-400" />
                          <span className="font-semibold text-slate-200">bis.Contour2D</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">2 Sınıf / 470 Obje</span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-950 border border-slate-850 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <Layers size={14} className="text-indigo-400" />
                          <span className="font-semibold text-slate-200">bis.ElevationPoint3D</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">1 Sınıf / 96 Obje</span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-950 border border-slate-850 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <Layers size={14} className="text-emerald-400" />
                          <span className="font-semibold text-slate-200">bis.WatercourseWay</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">1 Sınıf / 18 Obje</span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-950 border border-slate-850 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <Layers size={14} className="text-rose-400" />
                          <span className="font-semibold text-slate-200">bis.PhysicalBuilding</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">1 Sınıf / 45 Obje</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'query' && (
                  <form onSubmit={handleQuery} className="space-y-3">
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-slate-300">ECSQL Sorgulama (OData standardı)</h4>
                      <p className="text-[10px] text-slate-500 leading-tight">
                        iModel semantik veritabanını Bentley ECSQL kullanarak doğrudan sorgulayın.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <textarea
                        value={queryInput}
                        onChange={(e) => setQueryInput(e.target.value)}
                        className="w-full h-18 bg-slate-950 text-[11px] font-mono p-2.5 border border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 text-indigo-200"
                      />
                      <button
                        type="submit"
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1 transition-all"
                      >
                        <Search size={14} />
                        <span>Sorguyu Çalıştır</span>
                      </button>
                    </div>

                    {/* Results lists */}
                    <div className="space-y-1.5 font-mono text-[9px] max-h-[140px] overflow-y-auto">
                      <span className="text-[10px] font-semibold text-slate-500 block">Sorgu Sonuç Tablosu:</span>
                      {queryResults.map((row, i) => (
                        <div key={i} className="p-2 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between text-slate-300 truncate">
                          <span>{row.id || row.class}</span>
                          <span className="text-cyan-400 font-bold">{row.name || row.origin}</span>
                        </div>
                      ))}
                    </div>
                  </form>
                )}
              </div>
            </div>

            {/* Bottom Actions card */}
            <div className="pt-4 border-t border-slate-800/80 space-y-3">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/60 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 block">SENKRONİZASYON DURUMU</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1 mt-0.5">
                    <CheckCircle size={12} />
                    Bulut Eşleşti
                  </span>
                </div>
                <button
                  onClick={handleManualSync}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[11px]"
                >
                  Yenile
                </button>
              </div>

              <div className="text-center">
                <button
                  onClick={() => window.close()}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl"
                >
                  Entegrasyon Penceresini Kapat
                </button>
                <p className="text-[9px] text-slate-500 mt-2">
                  Copyright © {new Date().getFullYear()} Bentley Systems, Inc. iTwin® Platform.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ITwinWorkspace;
