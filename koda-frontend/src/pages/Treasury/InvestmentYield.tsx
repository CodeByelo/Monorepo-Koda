import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Download, 
  Plus, 
  Zap,
  X,
  ShieldCheck,
  Info
} from 'lucide-react';
import { api } from '@/api/client';

const InvestmentYield = () => {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);

  // New Investment Form State
  const [nombre, setNombre] = useState('');
  const [plazoDias, setPlazoDias] = useState<number>(30);
  const [capitalBs, setCapitalBs] = useState<number>(0);
  const [tasaAnual, setTasaAnual] = useState<number>(48.0);
  const [tasaCambioInicial, setTasaCambioInicial] = useState<number>(42.15);

  // Toast notifications
  const [notification, setNotification] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const res = await api.get<any>('/tesoreria/inversiones/resumen');
      setData(res);
    } catch (error) {
      console.error("Error loading investments data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const triggerNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  const handleRegisterInvestment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre || capitalBs <= 0) {
      triggerNotification("Por favor, complete todos los campos requeridos.");
      return;
    }
    try {
      await api.post('/tesoreria/inversiones', {
        nombre,
        plazo_dias: plazoDias,
        capital_bs: capitalBs,
        tasa_interes_anual: tasaAnual,
        tasa_cambio_inicial: tasaCambioInicial
      });
      triggerNotification("Nueva colocación a plazo registrada correctamente.");
      setShowModal(false);
      
      // Reset form
      setNombre('');
      setCapitalBs(0);
      
      fetchData();
    } catch (error) {
      console.error("Error registering investment:", error);
      triggerNotification("Error al registrar la colocación bursátil.");
    }
  };

  const handleExport = () => {
    triggerNotification("Exportando análisis de eficiencia cambiaria a Excel...");
    let baseUrl = (import.meta as any).env?.VITE_API_URL || (
      window.location.hostname.includes('cloudflare') || window.location.hostname.includes('.ts.net')
        ? '/api-facturacion'
        : '/api'
    );
    if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://') && !baseUrl.startsWith('/')) {
      baseUrl = '/' + baseUrl;
    }
    window.open(`${baseUrl}/tesoreria/inversiones/exportar`, '_blank');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0b5156]"></div>
      </div>
    );
  }

  const metrics = [
    { label: 'Eficiencia Real (USD)', value: data?.metricas?.eficiencia_real || '0.0%', desc: 'Pérdida/Ganancia de poder adquisitivo', color: parseFloat(data?.metricas?.eficiencia_real) < 0 ? 'text-red-600' : 'text-green-600' },
    { label: 'Interés Acumulado (Bs)', value: data?.metricas?.interes_acumulado || 'Bs. 0.00', desc: 'Rendimiento nominal ganado', color: 'text-[#0b5156]' },
    { label: 'Devaluación Periodo', value: data?.metricas?.devaluacion_periodo || '0.0%', desc: 'Variación Tasa BCV promedio', color: 'text-red-600' },
  ];

  const placements = data?.colocaciones || [];
  const avgInterest = data?.interes_promedio || 0.0;
  const bcvDevPct = data?.devaluacion_bcv || 0.0;

  // Normalise bar chart percentages (max 100)
  const maxPctVal = Math.max(avgInterest, bcvDevPct, 100);
  const avgInterestWidth = (avgInterest / maxPctVal) * 100;
  const bcvDevPctWidth = (bcvDevPct / maxPctVal) * 100;

  return (
    <div className="space-y-3 animate-in fade-in duration-500 pb-20">
      {/* Toast Notification */}
      {notification && createPortal(
        <div className="fixed top-5 right-5 bg-slate-900 text-white px-6 py-4 rounded-xl shadow-2xl z-50 flex items-center gap-3 border border-slate-700 animate-in slide-in-from-top-5 duration-300">
           <ShieldCheck className="text-green-400 shrink-0" size={18} />
           <p className="text-xs font-black uppercase tracking-wider text-white">{notification}</p>
        </div>,
        document.body
      )}

      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Tesorería &gt; Análisis Financiero
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase">Rendimiento de Inversiones</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Comparativa de rentabilidad real: Interés Ganado vs. Variación Cambiaria.</p>
          </div>
          <div className="flex gap-3">
             <button 
               onClick={() => setShowManualModal(true)}
               className="bg-slate-50 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-white transition-all flex items-center gap-2"
             >
                <Info size={14} /> Manual de Uso
             </button>
             <button 
               onClick={() => setShowModal(true)}
               className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
             >
                <Plus size={14} /> Nueva Inversión
             </button>
             <button 
               onClick={handleExport}
               className="bg-slate-50 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-white transition-all flex items-center gap-2"
             >
                <Download size={14} /> Exportar Poder Adq.
             </button>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
        {metrics.map((m, i) => (
          <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between min-h-24">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">{m.label}</p>
            <div className="space-y-1">
              <strong className={`text-xl font-black ${m.color} tracking-tighter font-mono block leading-none`}>{m.value}</strong>
              <p className="text-xs font-bold text-slate-400 uppercase leading-tight mt-1">{m.desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Cartera Analysis Table */}
      <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/30 flex justify-between items-center">
           <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Eficiencia por Colocación</h2>
           <div className="flex gap-2">
              <span className="bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest border border-green-200">En Curso</span>
           </div>
        </div>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left font-mono">
            <thead>
              <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-white">
                <th className="py-4 px-8">INVERSIÓN</th>
                <th className="py-2.5 px-4 text-center">PLAZO</th>
                <th className="py-2.5 px-4 text-right">CAPITAL (BS)</th>
                <th className="py-2.5 px-4 text-right">TASA I/F</th>
                <th className="py-2.5 px-4 text-right">INT. GANADO</th>
                <th className="py-2.5 px-4 text-right">EFECTO FX</th>
                <th className="py-4 px-8 text-right">RES. REAL (USD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-[11px]">
              {placements.map((row: any, i: number) => (
                <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-5 px-8 font-black text-[#0b5156] uppercase tracking-tighter">{row.name}</td>
                  <td className="py-2.5 px-4 text-center font-bold text-slate-400 uppercase">{row.term}</td>
                  <td className="py-2.5 px-4 text-right font-black text-slate-600">{row.capital}</td>
                  <td className="py-2.5 px-4 text-right text-slate-400">{row.rates}</td>
                  <td className="py-2.5 px-4 text-right font-black text-green-600">{row.gain}</td>
                  <td className="py-2.5 px-4 text-right font-black text-red-600">{row.fxEffect}</td>
                  <td className={`py-5 px-8 text-right font-black ${row.isNegative ? 'text-red-600' : 'text-green-600'}`}>
                    {row.realRes}
                  </td>
                </tr>
              ))}
              {placements.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400 font-black uppercase tracking-widest">
                    Sin inversiones o colocaciones activas registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
         <section className="lg:col-span-2 bg-white p-5 rounded-2xl border border-[#0b5156]/15 shadow-sm space-y-8">
            <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Interés vs Devaluación (Rendimiento Real)</h3>
            <div className="space-y-10">
               <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs">
                     <span className="font-black text-slate-400 uppercase tracking-widest">Interés Promedio Ganado (Nominal)</span>
                     <strong className="text-[#0b5156] font-black">{avgInterest.toFixed(1)}%</strong>
                  </div>
                  <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                     <div className="h-full bg-green-500 rounded-full transition-all duration-1000" style={{ width: `${avgInterestWidth}%` }}></div>
                  </div>
               </div>
               <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs">
                     <span className="font-black text-slate-400 uppercase tracking-widest">Devaluación Acumulada del Bolívar (BCV)</span>
                     <strong className="text-red-600 font-black">{bcvDevPct.toFixed(1)}%</strong>
                  </div>
                  <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                     <div className="h-full bg-red-600 rounded-full transition-all duration-1000" style={{ width: `${bcvDevPctWidth}%` }}></div>
                  </div>
               </div>
            </div>
         </section>

         <aside className="bg-[#0b5156] p-5 rounded-2xl border border-[#0b5156]/10 shadow-lg space-y-8">
            <div className="flex items-center gap-3">
               <div className="p-3 bg-white/10 rounded-2xl text-white"><Zap size={24} /></div>
               <h3 className="text-xl font-black text-white uppercase tracking-tight">Lectura de Tesorería</h3>
            </div>
            <div className="space-y-6 text-white/80 text-xs font-bold uppercase tracking-tight leading-relaxed">
              <div className="space-y-1">
                <h4 className="font-black uppercase text-white">Fuga de Poder Adquisitivo</h4>
                <p className="font-bold uppercase opacity-80 leading-relaxed normal-case text-slate-200">
                  El rendimiento nominal promedio de tus colocaciones en bolívares ({avgInterest.toFixed(1)}%) es inferior a la devaluación acumulada en el período ({bcvDevPct.toFixed(1)}%). Estás experimentando una pérdida real en dólares. Se recomienda rotar excedentes hacia activos indexados (UVC) o divisas duras.
                </p>
              </div>
              <div className="p-5 bg-white/5 rounded-2xl border border-white/10 space-y-2">
                 <div className="flex justify-between items-center">
                    <span className="font-black uppercase text-white/60 text-[10px]">Tasa de Equilibrio:</span>
                    <strong className="text-white font-mono">Bs. 45.10 / USD</strong>
                 </div>
                 <p className="text-[9px] font-bold text-white/40 uppercase leading-relaxed italic normal-case">
                   Si el tipo de cambio oficial del BCV supera este valor antes del vencimiento de tus colocaciones, el capital invertido sufrirá una pérdida neta de poder de compra.
                 </p>
              </div>
            </div>
         </aside>
      </div>

      {/* New Investment Modal */}
      {showModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <form onSubmit={handleRegisterInvestment} className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                 <div className="flex items-center gap-2">
                    <div className="p-2 bg-[#0b5156] text-white rounded-lg"><Plus size={16} /></div>
                    <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tight">Registrar Colocación Bursátil / Plazo Fijo</h3>
                 </div>
                 <button type="button" onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
              </div>
              <div className="p-8 space-y-6">
                 <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Nombre de la Colocación</label>
                    <input 
                      type="text" 
                      required
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-slate-700 outline-none focus:border-[#0b5156]"
                      placeholder="Ej: Mutuo Activo Mercantil"
                    />
                 </div>

                 <div className="grid grid-cols-2 gap-3 items-start">
                    <div className="space-y-2">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Capital (Bs.)</label>
                       <input 
                         type="number" 
                         required
                         value={capitalBs || ''}
                         onChange={(e) => setCapitalBs(Number(e.target.value))}
                         className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-slate-700 outline-none focus:border-[#0b5156] font-mono" 
                         placeholder="0.00" 
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Plazo (Días)</label>
                       <input 
                         type="number" 
                         required
                         value={plazoDias}
                         onChange={(e) => setPlazoDias(Number(e.target.value))}
                         className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-slate-700 outline-none focus:border-[#0b5156] font-mono" 
                       />
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-3 items-start">
                    <div className="space-y-2">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Tasa de Interés Anual (%)</label>
                       <input 
                         type="number" 
                         value={tasaAnual} 
                         onChange={(e) => setTasaAnual(Number(e.target.value))}
                         className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-slate-700 outline-none focus:border-[#0b5156]" 
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Tasa de Cambio Inicial (Bs/USD)</label>
                       <input 
                         type="number" 
                         value={tasaCambioInicial} 
                         onChange={(e) => setTasaCambioInicial(Number(e.target.value))}
                         className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-slate-700 outline-none focus:border-[#0b5156]" 
                       />
                    </div>
                 </div>

                 <button type="submit" className="w-full bg-[#0b5156] text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-xl shadow-green-900/20 hover:scale-[1.02] transition-all">
                    Registrar Colocación
                 </button>
              </div>
           </form>
        </div>,
        document.body
      )}

      {/* Manual de Uso Modal */}
      {showManualModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-2">
                    <div className="p-2 bg-[#0b5156] text-white rounded-lg"><Info size={16} /></div>
                    <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tight">Manual de Rendimiento de Inversiones</h3>
                 </div>
                 <button onClick={() => setShowManualModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
              </div>
              <div className="p-8 space-y-6 overflow-y-auto no-scrollbar text-xs font-bold text-slate-600 uppercase tracking-tight leading-relaxed">
                 <div className="space-y-2">
                   <h4 className="font-black text-[#0b5156] text-sm">¿Qué es el Rendimiento Real?</h4>
                   <p className="normal-case font-bold text-slate-500">
                     En economías inflacionarias, una colocación a plazo fijo puede darte intereses nominales en bolívares, pero si el tipo de cambio oficial (BCV) sube más rápido que los intereses, al final del plazo tendrás **menos poder adquisitivo en dólares** que al inicio.
                   </p>
                 </div>
                 <div className="space-y-2">
                   <h4 className="font-black text-[#0b5156] text-sm">Fórmula de Pérdida FX</h4>
                   <p className="normal-case font-bold text-slate-500">
                     Compara la tasa de cambio inicial contra la actual para determinar cuánto se ha devaluado el capital depositado, y lo descuenta de los intereses ganados para calcular el retorno real en dólares.
                   </p>
                 </div>
              </div>
           </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default InvestmentYield;
