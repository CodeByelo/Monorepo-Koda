import { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  BookOpen, 
  ArrowRight, 
  Activity, 
  Zap,
  ShieldAlert
} from 'lucide-react';
import { api } from '@/api/client';
import { createPortal } from 'react-dom';
import { CheckCircle2 } from 'lucide-react';

const ProjectedCashFlow = () => {
  const [devaluation, setDevaluation] = useState(10);
  const [bcv, setBcv] = useState(38.50);
  const [buckets, setBuckets] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [showManual, setShowManual] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showRecommendation, setShowRecommendation] = useState(false);

  const handleShowToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const data = await api.get<any>('/cobranzas/flujo-proyectado');
        setBcv(data?.bcv || 38.50);
        setBuckets(data?.buckets || []);
        setInvoices(data?.invoices || []);
      } catch (error) {
        console.error("Error fetching cash flow data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const projectedRate = (bcv * (1 + devaluation / 100)).toFixed(2);

  const projectionData = useMemo(() => {
    return invoices.map(inv => {
      const stressUsd = inv.bs / Number(projectedRate);
      const diff = inv.usd - stressUsd;
      return {
        ...inv,
        bsStr: `Bs. ${inv.bs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        usdStr: `$${inv.usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        stressUsdStr: `$${stressUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        impact: `-$${diff > 0 ? diff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`
      };
    });
  }, [invoices, projectedRate]);

  const handleContingencia = async () => {
    setIsLoading(true);
    try {
      const res = await api.post<any>('/cobranzas/contingencia', { devaluacion: devaluation });
      handleShowToast(res.message || "Plan de contingencia notificado.");
    } catch (error) {
      handleShowToast("Error al ejecutar plan de contingencia.");
    } finally {
      setIsLoading(false);
    }
  };

  const displayBuckets = buckets;

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-20">
      {/* Header Blanco y Verde */}
      <header className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
               <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                  Finanzas y Proyecciones
               </span>
            </div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Cash Flow Forense</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest leading-relaxed">
               Análisis de liquidez entrante con escenarios de estrés cambiario.
            </p>
          </div>
          <div className="flex gap-3">
             <button onClick={() => setShowManual(true)} className="bg-slate-50 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-white transition-all flex items-center gap-2">
                <BookOpen size={14} /> Manual
             </button>
             <button onClick={() => handleShowToast("El calendario de cobros estará disponible en la próxima actualización.")} className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <Calendar size={14} /> Calendario
             </button>
          </div>
        </div>

        {/* Simulador de Estrés - Integrado */}
        <div className="border-t border-slate-100 pt-6 mt-6 space-y-4">
           <div className="flex items-center gap-2">
              <ShieldAlert className="text-[#0b5156]" size={16} />
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Simulador de Estrés Cambiario</h3>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
              <div className="space-y-1.5">
                 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-2">Tasa BCV Actual</label>
                 <input type="text" readOnly value={bcv} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-black text-slate-500 outline-none font-mono" />
              </div>
              <div className="space-y-1.5">
                 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-2">Devaluación Proyectada (%)</label>
                 <input type="number" value={devaluation} onChange={(e) => setDevaluation(Number(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-black text-slate-800 outline-none focus:border-[#0b5156] font-mono" />
              </div>
              <div className="bg-red-50/70 p-3 rounded-2xl border border-red-100 flex items-center justify-between px-4 h-[38px] mb-[1px]">
                 <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">Tasa Proyectada:</span>
                 <strong className="text-red-700 text-sm font-black font-mono tracking-tighter">{projectedRate} Bs/USD</strong>
              </div>
           </div>
        </div>
      </header>

      {/* Proyecciones Temporales */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
         {displayBuckets.map((card, i) => {
           const stressValue = card.exp * (bcv / Number(projectedRate));
           
           return (
           <div key={i} className={`bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 group hover:border-[#0b5156]/30 transition-all`}>
              <div className="flex justify-between items-center">
                 <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">{card.label}</h4>
                 <div className={`text-slate-200 group-hover:${card.color.replace('text', 'text')} transition-colors`}>
                   {i === 0 ? <TrendingUp size={16} /> : i === 1 ? <Activity size={16} /> : <TrendingDown size={16} />}
                 </div>
              </div>
               <div className="space-y-4">
                  <div className="flex justify-between items-end border-b border-slate-50 pb-2">
                     <span className="text-xs font-black text-slate-500 uppercase tracking-tighter">Esperado:</span>
                     <strong className="text-xl font-black text-slate-800 font-mono tracking-tighter">${card.exp.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>
                  </div>
                  <div className="flex justify-between items-end">
                     <span className="text-xs font-black text-red-600 uppercase italic">Estresado:</span>
                     <strong className="text-xl font-black text-red-600 font-mono tracking-tighter">${stressValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>
                  </div>
               </div>
           </div>
         )})}
      </section>

      {/* Tabla de Impacto */}
      <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
         <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left">
                <thead>
                   <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                      <th className="py-6 px-8">CLIENTE</th>
                      <th className="py-6 px-4 text-center">VENCIMIENTO</th>
                      <th className="py-6 px-4 text-center">MONTO (BS)</th>
                      <th className="py-6 px-4 text-center">VALOR HOY (USD)</th>
                      <th className="py-6 px-4 text-center text-red-600">VALOR ESTRÉS (USD)</th>
                      <th className="py-6 px-8 text-right">IMPACTO</th>
                   </tr>
                </thead>
               <tbody className="divide-y divide-slate-50">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cargando proyecciones...</td>
                    </tr>
                  ) : projectionData.length > 0 ? projectionData.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                       <td className="py-6 px-8 font-black text-slate-800 uppercase text-xs">{row.client}</td>
                       <td className="py-6 px-4 text-center text-xs font-bold text-slate-400 font-mono">{row.due}</td>
                       <td className="py-6 px-4 text-center text-xs font-black text-slate-700 font-mono tracking-tighter">{row.bsStr}</td>
                       <td className="py-6 px-4 text-center text-xs font-black text-slate-700 font-mono tracking-tighter">{row.usdStr}</td>
                       <td className="py-6 px-4 text-center text-xs font-black text-red-600 font-mono tracking-tighter">{row.stressUsdStr}</td>
                       <td className="py-6 px-8 text-right">
                          <span className="bg-red-50 text-red-600 text-xs font-black px-3 py-1 rounded-full font-mono">{row.impact}</span>
                       </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">No hay facturas en el rango de los próximos 30 días</td>
                    </tr>
                  )}
               </tbody>
            </table>
         </div>
      </article>

      {/* Botón Recomendación Gerencial */}
      <div className="flex justify-start">
         <button 
            onClick={() => setShowRecommendation(!showRecommendation)}
            className="flex items-center gap-2 bg-[#0b5156]/5 text-[#0b5156] px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border border-[#0b5156]/20 hover:bg-[#0b5156]/10 transition-all"
         >
            <Zap size={14} />
            {showRecommendation ? 'Ocultar Recomendación' : 'Ver Recomendación Gerencial'}
         </button>
      </div>

      {showRecommendation && (
         <article className="bg-[#0b5156]/5 p-6 rounded-2xl border border-[#0b5156]/20 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="space-y-4">
               <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white text-[#0b5156] rounded-xl border border-[#0b5156]/10 shadow-sm">
                     <Zap size={18} />
                  </div>
                  <div className="space-y-0.5">
                     <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tighter leading-none">Recomendación Gerencial</h3>
                     <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Protocolo de mitigación patrimonial.</p>
                  </div>
               </div>
    
               <div className="bg-white border border-[#0b5156]/10 p-4 rounded-xl shadow-sm">
                  <p className="text-slate-600 text-xs font-bold uppercase leading-relaxed tracking-wide">
                     Bajo el escenario de devaluación del <span className="text-[#0b5156] font-black underline">{devaluation}%</span>, se recomienda acelerar el ciclo de cobro de los próximos <span className="text-slate-900">30 días</span> mediante incentivos de pronto pago. La liquidez obtenida debe proteger el capital de trabajo de forma inmediata.
                  </p>
               </div>
               
               <button onClick={handleContingencia} disabled={isLoading} className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-[0.15em] shadow-lg shadow-green-900/10 flex items-center gap-2 hover:bg-[#083a3d] transition-all w-fit disabled:opacity-50">
                  {isLoading ? 'Ejecutando...' : 'Ejecutar Plan de Contingencia'} <ArrowRight size={14} />
               </button>
            </div>
         </article>
      )}

      {/* Modal del Manual */}
      {showManual && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="bg-[#0b5156] p-5 sm:p-6 text-white relative shrink-0">
              <button 
                onClick={() => setShowManual(false)}
                className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
              >
                <span className="text-xl leading-none">&times;</span>
              </button>
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-white/20 p-2 rounded-xl">
                  <BookOpen size={24} className="text-white" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tighter">Manual Flujo Proyectado</h3>
              </div>
              <p className="text-white/80 text-xs font-bold uppercase tracking-widest leading-tight">
                Simulador de Estrés y Flujo de Caja
              </p>
            </div>
            
            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto text-slate-600 leading-relaxed">
              <div className="space-y-1 border-b border-slate-100 pb-3">
                <h4 className="text-xs font-black text-slate-800 uppercase">1. Simulador de Estrés</h4>
                <p className="text-[11px] font-bold uppercase text-slate-500">
                  Permite introducir una devaluación esperada en porcentaje para ver su impacto en las facturas que están prontas a vencer. Modifique el % para recalcular toda la tabla en tiempo real.
                </p>
              </div>
              <div className="space-y-1 border-b border-slate-100 pb-3">
                <h4 className="text-xs font-black text-slate-800 uppercase">2. Proyecciones Temporales</h4>
                <p className="text-[11px] font-bold uppercase text-slate-500">
                  Agrupa el monto que se espera cobrar en los próximos 7 días, entre 8 y 15 días, y entre 16 y 30 días, comparando el monto esperado contra el estresado.
                </p>
              </div>
              <div className="space-y-1 pb-3">
                <h4 className="text-xs font-black text-slate-800 uppercase">3. Tabla de Impacto</h4>
                <p className="text-[11px] font-bold uppercase text-slate-500">
                  Lista las facturas pendientes de cobro y calcula automáticamente la pérdida (impacto) que cada factura generaría si la tasa de cambio alcanza el nivel proyectado.
                </p>
              </div>
              <button 
                onClick={() => setShowManual(false)}
                className="w-full px-4 py-3 mt-4 bg-[#0b5156] text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
              >
                Cerrar Guía
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Custom Toast Portal */}
      {toastMessage && createPortal(
        <div className="fixed bottom-6 right-6 z-[130] bg-[#0b5156] border-green-700 text-white py-4 px-6 rounded-2xl shadow-2xl border flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <CheckCircle2 size={18} className="text-white/80" />
          <span className="text-xs font-black uppercase tracking-widest">{toastMessage}</span>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ProjectedCashFlow;
