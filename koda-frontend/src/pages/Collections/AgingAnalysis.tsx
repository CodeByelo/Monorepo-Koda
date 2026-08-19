import { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  BookOpen, 
  FileDown, 
  Clock 
} from 'lucide-react';
import { api } from '@/api/client';
import { createPortal } from 'react-dom';

const AgingAnalysis = () => {
  const [kpis, setKpis] = useState<any[]>([]);
  const [exposedInvoices, setExposedInvoices] = useState<any[]>([]);
  const [tramos, setTramos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const data = await api.get<any>('/cobranzas/antiguedad-detalle');
        setKpis(data?.kpis || []);
        setExposedInvoices(data?.facturas_expuestas || []);
        setTramos(data?.tramos || []);
      } catch (error) {
        console.error("Error fetching aging analysis data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredInvoices = useMemo(() => {
    if (!searchQuery.trim()) return exposedInvoices;
    const q = searchQuery.toLowerCase();
    return exposedInvoices.filter(inv => 
      (inv.client || inv.cliente || '').toLowerCase().includes(q) ||
      (inv.doc || inv.documento || '').toLowerCase().includes(q)
    );
  }, [exposedInvoices, searchQuery]);

  // Default fallbacks for UI structure if API doesn't match perfectly during simulation
  const displayKpis = kpis.length > 0 ? kpis : [
    { label: 'COSTO REPOSICIÓN PERDIDO', value: '-$0.00', desc: 'Pérdida real de capital USD', color: 'text-red-600' },
    { label: 'TASA DE EROSIÓN CARTERA', value: '0%', desc: 'Impacto devaluación en CxC', color: 'text-amber-600' },
    { label: 'FACTURAS EXPUESTAS', value: '0', desc: 'Riesgo patrimonial activo', color: 'text-slate-800' },
    { label: 'PROMEDIO DÍAS MORA', value: '0d', desc: 'Tiempo de rotación CxC', color: 'text-blue-600' },
  ];

  const displayTramos = tramos.length > 0 ? tramos : [
    { l: 'CORRIENTE', v: '$0', p: '0%', c: 'bg-emerald-500' },
    { l: '1-15 DÍAS', v: '$0', p: '0%', c: 'bg-[#0b5156]' },
    { l: '16-30 DÍAS', v: '$0', p: '0%', c: 'bg-blue-600' },
    { l: '31-60 DÍAS', v: '$0', p: '0%', c: 'bg-amber-600' },
    { l: '+60 DÍAS', v: '$0', p: '0%', c: 'bg-red-600' },
  ];

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
               <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                 Auditoría de Cobranzas
               </span>
            </div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase leading-none">Antigüedad con Erosión</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-2 max-w-3xl">
               Análisis forense del costo de reposición perdido por retraso en cobranzas en moneda nacional.
            </p>
          </div>
          <div className="flex gap-3 print:hidden">
             <button onClick={() => setShowManual(true)} className="bg-white text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-slate-200 transition-all flex items-center gap-2">
                <BookOpen size={14} /> Manual de Aging
             </button>
             <button onClick={() => window.print()} className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all flex items-center gap-2">
                <FileDown size={14} /> Generar Reporte Pérdida
             </button>
          </div>
        </div>
      </header>

      {/* Grid de KPIs - Estandarizado */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {displayKpis.map((kpi, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-36 group hover:border-[#0b5156]/30 transition-all">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest group-hover:text-[#0b5156] transition-colors h-8 flex items-start">{kpi.label || kpi.etiqueta}</p>
            <div className="space-y-1">
              <strong className={`text-3xl font-black ${kpi.color || 'text-slate-800'} tracking-tighter font-mono`}>{kpi.value || kpi.valor}</strong>
              <p className="text-xs font-bold text-slate-400 uppercase leading-tight h-8 flex items-start">{kpi.desc || kpi.descripcion}</p>
            </div>
          </div>
        ))}
      </section>

      <article className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-8">
         <div className="flex justify-between items-center">
            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Listado de Facturas Expuestas</h3>
            <div className="flex gap-4">
               <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                  <input 
                    type="text" 
                    placeholder="Buscar cliente o documento..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black text-slate-700 w-80 outline-none focus:border-[#0b5156]" 
                  />
               </div>
               <button className="p-3 bg-slate-50 text-slate-400 rounded-2xl border border-slate-200 hover:bg-white transition-all"><Filter size={18} /></button>
            </div>
         </div>

         <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left">
               <thead>
                  <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                     <th className="py-6 px-8">CLIENTE / DOCUMENTO</th>
                     <th className="py-6 px-4 text-center">DÍAS MORA</th>
                     <th className="py-6 px-4 text-center">MONTO (BS)</th>
                     <th className="py-6 px-4 text-center">USD ORIGEN</th>
                     <th className="py-6 px-4 text-center">USD REAL HOY</th>
                     <th className="py-6 px-4 text-center text-red-600">PÉRDIDA CAPITAL</th>
                     <th className="py-6 px-8 text-center">PRIORIDAD</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cargando facturas expuestas...</td>
                    </tr>
                  ) : filteredInvoices.length > 0 ? filteredInvoices.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-all group border-l-4 border-transparent hover:border-l-[#0b5156]">
                       <td className="py-6 px-8">
                          <div className="flex flex-col">
                             <span className="text-sm font-black text-slate-800 uppercase group-hover:text-[#0b5156] transition-colors">{row.client || row.cliente}</span>
                             <span className="text-[10px] font-bold text-slate-500 uppercase">{row.doc || row.documento}</span>
                          </div>
                       </td>
                       <td className="py-6 px-4 text-center">
                          <span className="bg-red-600 text-white text-[10px] font-black px-3 py-1 rounded-lg font-mono">{row.days || row.dias}</span>
                       </td>
                       <td className="py-6 px-4 text-center text-xs font-black text-slate-800 font-mono tracking-tighter">{row.bs || row.monto_bs}</td>
                       <td className="py-6 px-4 text-center text-xs font-black text-slate-500 font-mono tracking-tighter">{row.usdOrig || row.usd_origen}</td>
                       <td className="py-6 px-4 text-center text-xs font-black text-slate-800 font-mono tracking-tighter">{row.usdNow || row.usd_hoy}</td>
                       <td className="py-6 px-4 text-center">
                          <span className="text-red-600 font-black font-mono text-xs tracking-tighter">{row.loss || row.perdida}</span>
                       </td>
                       <td className="py-6 px-8 text-center">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase border ${(row.priority || row.prioridad) === 'CRÍTICA' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                             {row.priority || row.prioridad}
                          </span>
                       </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">No hay facturas expuestas</td>
                    </tr>
                  )}
               </tbody>
            </table>
         </div>
      </article>

      <article className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-8">
         <div className="flex items-center gap-3">
            <Clock size={20} className="text-[#0b5156]" />
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Desglose de Cartera por Vencimiento</h3>
         </div>
         <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
            {displayTramos.map((tramo, i) => (
              <div key={i} className="p-6 rounded-3xl bg-white border border-[#bdafa1]/20 flex flex-col justify-between h-36 hover:border-[#0b5156]/30 transition-all group shadow-sm">
                 <span className="text-xs font-black text-slate-500 uppercase tracking-widest group-hover:text-[#0b5156] transition-colors">{tramo.l || tramo.etiqueta}</span>
                 <div>
                    <strong className="text-xl font-black text-slate-800 font-mono tracking-tighter">{tramo.v || tramo.valor}</strong>
                    <div className="h-2 w-full bg-slate-100 rounded-full mt-3 overflow-hidden border border-slate-200/50">
                       <div className={`h-full ${tramo.c || 'bg-[#0b5156]'}`} style={{ width: tramo.p || tramo.porcentaje || '0%' }}></div>
                    </div>
                 </div>
              </div>
            ))}
         </div>
      </article>

      {/* Modal del Manual de Aging */}
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
                <h3 className="text-xl font-black uppercase tracking-tighter">Manual de Antigüedad</h3>
              </div>
              <p className="text-white/80 text-xs font-bold uppercase tracking-widest leading-tight">
                Análisis Forense y Riesgo de Cartera
              </p>
            </div>
            
            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto text-slate-600 leading-relaxed">
              <div className="space-y-1 border-b border-slate-100 pb-3">
                <h4 className="text-xs font-black text-slate-800 uppercase">1. Pérdida de Capital</h4>
                <p className="text-[11px] font-bold uppercase text-slate-500">
                  El sistema calcula cuánto capital en USD se ha perdido debido a la devaluación desde que se emitió la factura en Bs hasta la tasa del día de hoy.
                </p>
              </div>
              <div className="space-y-1 border-b border-slate-100 pb-3">
                <h4 className="text-xs font-black text-slate-800 uppercase">2. Tramos de Mora</h4>
                <p className="text-[11px] font-bold uppercase text-slate-500">
                  Clasificación de las facturas según el tiempo transcurrido desde su vencimiento (1-15, 16-30, 31-60 y +60 días) para priorizar los cobros.
                </p>
              </div>
              <div className="space-y-1 pb-3">
                <h4 className="text-xs font-black text-slate-800 uppercase">3. Reporte de Pérdida</h4>
                <p className="text-[11px] font-bold uppercase text-slate-500">
                  Al presionar "Generar Reporte Pérdida", se crea una versión imprimible / PDF optimizada ocultando los botones para su envío o auditoría física.
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

    </div>
  );
};

export default AgingAnalysis;
