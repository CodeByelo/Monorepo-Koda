import { useState, useEffect } from 'react';
import { 
  TrendingDown, 
  BarChart3, 
  FileText, 
  PieChart,
  Target
} from 'lucide-react';
import { api } from '@/api/client';

const BudgetVariance = () => {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    try {
      const res = await api.get<any>('/tesoreria/presupuesto/desviacion');
      setData(res);
    } catch (error) {
      console.error("Error loading budget variance data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0b5156]"></div>
      </div>
    );
  }

  const metrics = [
    { label: 'Desviación Total', value: data?.metricas?.desviacion_total || '$0.00', desc: 'Ejecución vs. Planificado', color: 'text-red-600' },
    { label: 'Impacto Cambiario (FX)', value: data?.metricas?.impacto_cambiario || '0%', desc: 'Causa: Devaluación', color: 'text-slate-600' },
    { label: 'Ineficiencia Operativa', value: data?.metricas?.ineficiencia_operativa || '0%', desc: 'Causa: Precios/Gestión', color: 'text-slate-600' },
  ];

  const breakdown = data?.breakdown || [];
  const fxPct = data?.distribucion?.fx_pct || 0;
  const ineffPct = data?.distribucion?.ineff_pct || 0;
  const hasDeviations = fxPct > 0 || ineffPct > 0;

  return (
    <div className="space-y-3 animate-in fade-in duration-500 pb-20">
      <style>{`
        @media print {
          nav, aside, header button, .flex.gap-3, .fixed, .no-print, [class*="Sidebar"], [class*="Topbar"], .sidebar-container {
            display: none !important;
          }
          body, html, #root {
            background: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }
          .print-main-content {
            width: 100% !important;
            margin: 0 !important;
            padding: 20px !important;
            border: none !important;
            box-shadow: none !important;
          }
          article, section {
            page-break-inside: avoid !important;
            border: 1px solid #e2e8f0 !important;
            margin-bottom: 15px !important;
            border-radius: 12px !important;
          }
        }
      `}</style>

      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden print-main-content">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Tesorería &gt; Auditoría de Gastos
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase">Desviación Presupuestaria</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Análisis de ineficiencia operativa vs. impacto por devaluación.</p>
          </div>
          <div className="flex gap-3 no-print">
             <button 
               onClick={handlePrint}
               className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
             >
                <BarChart3 size={14} /> Reporte Mensual
             </button>
             <button 
               onClick={handlePrint}
               className="bg-slate-50 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-white transition-all flex items-center gap-2"
             >
                <FileText size={14} /> Imprimir Acta
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

      {/* Breakdown Table */}
      <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
           <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Desglose de Ejecución</h2>
           <div className="flex gap-4 items-center font-mono">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Target size={12} className="text-[#0b5156]" /> Línea Base: {data?.tasa_plan || 'Bs. 0.00'}
              </span>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <TrendingDown size={12} className="text-red-500" /> Tasa Real: {data?.tasa_real || 'Bs. 0.00'}
              </span>
           </div>
        </div>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left font-mono">
            <thead>
              <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-white">
                <th className="py-4 px-8">GASTO / PARTIDA</th>
                <th className="py-2.5 px-4 text-right">PLAN (BS)</th>
                <th className="py-2.5 px-4 text-right">REAL (BS)</th>
                <th className="py-2.5 px-4 text-right">PLAN (USD)</th>
                <th className="py-2.5 px-4 text-right">REAL (USD)</th>
                <th className="py-2.5 px-4 text-right">IMP. FX</th>
                <th className="py-4 px-8 text-right">ESTADO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-[11px]">
              {breakdown.map((row: any, i: number) => (
                <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-5 px-8 font-black text-[#0b5156] uppercase tracking-tighter">{row.item}</td>
                  <td className="py-2.5 px-4 text-right text-slate-400">Bs. {row.planBs}</td>
                  <td className="py-2.5 px-4 text-right font-bold text-slate-600">Bs. {row.realBs}</td>
                  <td className="py-2.5 px-4 text-right text-slate-400">${row.planUsd}</td>
                  <td className="py-2.5 px-4 text-right font-bold text-[#0b5156]">${row.realUsd}</td>
                  <td className="py-2.5 px-4 text-right font-black text-red-600">
                    {row.impact}
                  </td>
                  <td className="py-5 px-8 text-right">
                    <div className="flex items-center justify-end gap-2">
                       <span className={`${row.statusColor} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight`}>
                         {row.status}
                       </span>
                       <span className={`${row.causeColor} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight border`}>
                         {row.cause}
                       </span>
                    </div>
                  </td>
                </tr>
              ))}
              {breakdown.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400 font-black uppercase tracking-widest">
                    Sin partidas presupuestadas para este período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Distribution and Audit Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
         <section className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-12">
            <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Distribución de Desviación</h3>
            <div className="space-y-8">
               <div className="flex h-12 w-full rounded-2xl overflow-hidden shadow-inner border border-slate-100 bg-slate-50 relative">
                  {!hasDeviations && (
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-slate-400 uppercase tracking-widest z-0">
                       Sin desviaciones detectadas
                    </div>
                  )}
                  <div className="h-full bg-red-600 flex items-center justify-center text-[10px] font-black text-white uppercase tracking-widest z-10 transition-all overflow-hidden whitespace-nowrap" style={{ width: `${fxPct}%` }}>
                     {fxPct > 0 ? `Impacto Cambiario (${fxPct.toFixed(1)}%)` : ''}
                  </div>
                  <div className="h-full bg-amber-500 flex items-center justify-center text-[10px] font-black text-white uppercase tracking-widest z-10 transition-all overflow-hidden whitespace-nowrap" style={{ width: `${ineffPct}%` }}>
                     {ineffPct > 0 ? `Gestión (${ineffPct.toFixed(1)}%)` : ''}
                  </div>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                  <div className="flex gap-3 items-start">
                     <div className="w-4 h-4 bg-red-600 rounded mt-1 shrink-0"></div>
                     <div className="space-y-1">
                        <h4 className="text-xs font-black text-[#0b5156] uppercase">Diferencial FX</h4>
                        <p className="text-[10px] font-bold text-slate-500 uppercase leading-relaxed">Pérdida de poder de compra en Bs. por devaluación entre planificación y pago.</p>
                     </div>
                  </div>
                  <div className="flex gap-3 items-start">
                     <div className="w-4 h-4 bg-amber-500 rounded mt-1 shrink-0"></div>
                     <div className="space-y-1">
                        <h4 className="text-xs font-black text-[#0b5156] uppercase">Eficiencia Operativa</h4>
                        <p className="text-[10px] font-bold text-slate-500 uppercase leading-relaxed">Aumento de precios en origen o consumos por encima del estándar operativo.</p>
                     </div>
                  </div>
               </div>
            </div>
         </section>

         <aside className="bg-[#726555] p-5 rounded-2xl border border-[#726555]/10 shadow-lg space-y-8">
            <div className="flex items-center gap-3">
               <div className="p-3 bg-white/10 rounded-2xl text-white"><PieChart size={24} /></div>
               <h3 className="text-xl font-black text-white uppercase tracking-tight">Lectura de Auditoría</h3>
            </div>
            <div className="space-y-8 text-white/80 text-xs">
              <div className="space-y-2">
                <h4 className="font-black uppercase text-white">Factor Dominante: Cambiario</h4>
                <p className="font-bold uppercase opacity-80 leading-relaxed">
                  El {fxPct.toFixed(1)}% del exceso presupuestario se debe a la devaluación acumulada de la tasa del BCV entre la planificación (Bs. 36.42) y la ejecución real (Bs. 42.15).
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-black uppercase text-white">Acción Recomendada</h4>
                <p className="font-bold uppercase opacity-80 leading-relaxed">
                  Negociar plazos más cortos con proveedores o realizar pagos inmediatos tras la facturación para minimizar el diferencial cambiario.
                </p>
              </div>
            </div>
         </aside>
      </div>
    </div>
  );
};

export default BudgetVariance;
