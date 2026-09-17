import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Activity,
  Calculator,
  Waves,
  LineChart,
  Settings2,
  Droplets
} from 'lucide-react';

interface OneDAnalysisProps {
  onBackToDashboard: () => void;
}

const OneDAnalysis: React.FC<OneDAnalysisProps> = ({ onBackToDashboard }) => {
  // Input states
  const [discharge, setDischarge] = useState<number>(150); // Q [m3/s]
  const [bottomWidth, setBottomWidth] = useState<number>(10); // b [m]
  const [sideSlope, setSideSlope] = useState<number>(2); // z (1:z)
  const [bedSlope, setBedSlope] = useState<number>(0.001); // S0 [m/m]
  const [manningN, setManningN] = useState<number>(0.035); // n

  // Output states
  const [normalDepth, setNormalDepth] = useState<number>(0);
  const [velocity, setVelocity] = useState<number>(0);
  const [froude, setFroude] = useState<number>(0);
  const [area, setArea] = useState<number>(0);

  // Iterative solver for Normal Depth (Manning's equation)
  const calculateNormalDepth = () => {
    let y = 0.1; // initial guess
    const tolerance = 0.0001;
    const maxIter = 1000;
    
    for (let i = 0; i < maxIter; i++) {
      // Area A = y * (b + z * y)
      const A = y * (bottomWidth + sideSlope * y);
      // Wetted Perimeter P = b + 2 * y * sqrt(1 + z^2)
      const P = bottomWidth + 2 * y * Math.sqrt(1 + sideSlope * sideSlope);
      // Hydraulic Radius R = A / P
      const R = A / P;
      
      // Calculate Q with current y
      // Q = (1/n) * A * R^(2/3) * S^(1/2)
      const Q_calc = (1 / manningN) * A * Math.pow(R, 2/3) * Math.sqrt(bedSlope);
      
      const error = discharge - Q_calc;
      
      if (Math.abs(error) < tolerance) {
        break;
      }
      
      // Simple Newton-Raphson or just step iteration
      // We will use a simple step adjustment
      y = y + (error * 0.01); 
      if (y <= 0) y = 0.01; // Prevent negative depth
    }

    const A_final = y * (bottomWidth + sideSlope * y);
    const V_final = discharge / A_final;
    const T_final = bottomWidth + 2 * sideSlope * y; // Top width
    const D_final = A_final / T_final; // Hydraulic depth
    const Fr_final = V_final / Math.sqrt(9.81 * D_final);

    setNormalDepth(y);
    setArea(A_final);
    setVelocity(V_final);
    setFroude(Fr_final);
  };

  useEffect(() => {
    calculateNormalDepth();
  }, [discharge, bottomWidth, sideSlope, bedSlope, manningN]);

  return (
    <motion.div
      key="1d-analysis"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
      className="max-w-6xl mx-auto space-y-6 py-4 px-2"
    >
      {/* Header */}
      <div className="bg-white border border-slate-300 rounded-2xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 sm:h-14 sm:w-14 bg-emerald-100 border border-emerald-300 rounded-2xl flex items-center justify-center text-emerald-700 shrink-0 shadow-sm">
                <LineChart size={28} />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight">
                  1B Dinamik Akış Analizi
                </h1>
                <p className="text-xs sm:text-sm font-medium text-slate-600 mt-1">
                  1 Boyutlu Kanal Akış Fiziği ve Normal Derinlik Çözücüsü
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={onBackToDashboard}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm rounded-xl border border-slate-300 shadow-sm flex items-center gap-2 transition-all self-start md:self-auto cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span>Dashboard'a Dön</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Parameters */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-slate-300 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 text-slate-800 font-bold border-b border-slate-100 pb-3">
              <Settings2 size={18} className="text-emerald-600" />
              <h2>Kanal ve Akış Parametreleri</h2>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex justify-between">
                  <span>Debi (Q)</span>
                  <span className="text-emerald-600">{discharge} m³/s</span>
                </label>
                <input 
                  type="range" min="1" max="1000" step="1"
                  value={discharge}
                  onChange={(e) => setDischarge(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex justify-between">
                  <span>Taban Genişliği (b)</span>
                  <span className="text-emerald-600">{bottomWidth} m</span>
                </label>
                <input 
                  type="range" min="1" max="100" step="0.5"
                  value={bottomWidth}
                  onChange={(e) => setBottomWidth(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex justify-between">
                  <span>Şev Eğimi (z)</span>
                  <span className="text-emerald-600">1:{sideSlope}</span>
                </label>
                <input 
                  type="range" min="0" max="5" step="0.1"
                  value={sideSlope}
                  onChange={(e) => setSideSlope(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600"
                />
                <p className="text-[10px] text-slate-500">0 ise dikdörtgen kesit</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex justify-between">
                  <span>Taban Eğimi (S₀)</span>
                  <span className="text-emerald-600">{bedSlope} m/m</span>
                </label>
                <input 
                  type="number" step="0.0001" min="0.0001"
                  value={bedSlope}
                  onChange={(e) => setBedSlope(parseFloat(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex justify-between">
                  <span>Manning (n)</span>
                  <span className="text-emerald-600">{manningN}</span>
                </label>
                <input 
                  type="number" step="0.001" min="0.01" max="0.1"
                  value={manningN}
                  onChange={(e) => setManningN(parseFloat(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Results & Visualization */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-300 rounded-2xl p-4 shadow-sm flex flex-col items-center justify-center text-center">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Normal Derinlik</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-slate-900">{normalDepth.toFixed(2)}</span>
                <span className="text-xs font-bold text-slate-500">m</span>
              </div>
            </div>
            
            <div className="bg-white border border-slate-300 rounded-2xl p-4 shadow-sm flex flex-col items-center justify-center text-center">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Akış Hızı</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-blue-700">{velocity.toFixed(2)}</span>
                <span className="text-xs font-bold text-slate-500">m/s</span>
              </div>
            </div>

            <div className="bg-white border border-slate-300 rounded-2xl p-4 shadow-sm flex flex-col items-center justify-center text-center">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Akış Alanı</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-emerald-700">{area.toFixed(1)}</span>
                <span className="text-xs font-bold text-slate-500">m²</span>
              </div>
            </div>

            <div className="bg-white border border-slate-300 rounded-2xl p-4 shadow-sm flex flex-col items-center justify-center text-center">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Froude (Fr)</p>
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-black ${froude > 1 ? 'text-amber-600' : 'text-slate-900'}`}>{froude.toFixed(2)}</span>
              </div>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">
                {froude > 1 ? 'Sel (Süperkritik)' : froude < 1 ? 'Nehir (Subkritik)' : 'Kritik'}
              </p>
            </div>
          </div>

          {/* Visualization Canvas */}
          <div className="bg-white border border-slate-300 rounded-2xl p-6 shadow-sm h-80 relative overflow-hidden flex flex-col items-center justify-end pb-8">
            <h3 className="absolute top-4 left-6 text-sm font-bold text-slate-800">Kesit Profili</h3>
            
            <div className="relative w-full max-w-md h-48 border-b-4 border-slate-600 flex justify-center items-end" style={{ transform: 'scale(1)' }}>
              {/* Channel Shape */}
              <svg width="100%" height="100%" viewBox="0 0 400 200" className="overflow-visible" preserveAspectRatio="none">
                {/* Water Level */}
                <polygon 
                  points={`
                    ${200 - (bottomWidth * 5) - (normalDepth * sideSlope * 10)},${200 - (normalDepth * 10)} 
                    ${200 + (bottomWidth * 5) + (normalDepth * sideSlope * 10)},${200 - (normalDepth * 10)} 
                    ${200 + (bottomWidth * 5)},200 
                    ${200 - (bottomWidth * 5)},200
                  `}
                  className="fill-blue-400/60 stroke-blue-500 stroke-2"
                />
                
                {/* Ground Lines */}
                <polyline 
                  points={`
                    0,50
                    ${200 - (bottomWidth * 5) - (150 / 10 * sideSlope * 10)},50
                    ${200 - (bottomWidth * 5)},200 
                    ${200 + (bottomWidth * 5)},200 
                    ${200 + (bottomWidth * 5) + (150 / 10 * sideSlope * 10)},50
                    400,50
                  `}
                  className="fill-none stroke-amber-800 stroke-[4px]"
                />
              </svg>

              <div className="absolute top-4 right-4 bg-white/80 p-2 rounded-lg border border-slate-200 text-xs shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 bg-blue-400/60 border border-blue-500"></div>
                  <span className="font-semibold text-slate-700">Su Yüzeyi ({normalDepth.toFixed(2)}m)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-1 bg-amber-800"></div>
                  <span className="font-semibold text-slate-700">Kanal Tabanı</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default OneDAnalysis;
