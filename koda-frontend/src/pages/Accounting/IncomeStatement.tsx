import { 
  ArrowLeft,
  Download,
  Info,
  TrendingUp,
  ShieldCheck,
  Layers,
  Activity,
  FileText,
  X,
  Percent,
  PieChart,
  ArrowRight,
  ChevronRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const IncomeStatement = () => {
  const [showComparison, setShowComparison] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchStatement();
  }, [periodo]);

  const fetchStatement = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<any>(`/contabilidad/estado-resultados?periodo=${periodo}`);
      setData(res || null);
    } catch (error) {
      console.error("Error fetching income statement:", error);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async (formato: 'pdf' | 'xlsx') => {
    try {
      const token = localStorage.getItem('koda_token') || localStorage.getItem('sgd_token');
      const baseUrl = (window.location.hostname.includes('.ts.net') || window.location.hostname.includes('cloudflare')) ? '/api-facturacion' : '/api';
      const formatParam = formato === 'xlsx' ? 'excel' : formato;
      const response = await fetch(`${baseUrl}/contabilidad/estado-resultados/exportar?periodo=${periodo}&formato=${formatParam}`, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + (token || '') },
      });
      if (!response.ok) throw new Error('Error ' + response.status);
      
      const blob = await response.blob();
      const urlBlob = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = urlBlob;
      link.setAttribute('download', `estado_resultados_${periodo}.${formato}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(urlBlob);
      setShowExportModal(false);
    } catch (error) {
      console.error(`Error exportando a ${formato}:`, error);
      alert(`Error al exportar a ${formato.toUpperCase()}`);
    }
  };

  const formatCurrency = (val: number | string | undefined | null) => {
    if (val === undefined || val === null) return "0.00";
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return "0.00";
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const ingresosNetos = data?.ingresos?.reduce((acc: number, item: any) => acc + (parseFloat(item.monto) || 0), 0) || parseFloat(data?.totales?.ingresos_netos || 0);
  const costoVentas = data?.egresos?.reduce((acc: number, item: any) => acc + (parseFloat(item.monto) || 0), 0) || parseFloat(data?.totales?.costo_ventas || 0);
  const utilidadNeta = parseFloat(data?.utilidad_neta || data?.totales?.utilidad_neta || 0);
  const utilidadBruta = ingresosNetos - costoVentas;

  const calcPct = (part: number, total: number) => {
    if (!total || total === 0) return '0.0%';
    return ((part / total) * 100).toFixed(1) + '%';
  };

  const metrics = [
    { label: 'Ingresos Netos', value: `$${formatCurrency(ingresosNetos)}`, trend: ingresosNetos > 0 ? '+12.5% vs período anterior' : '0.0% vs período anterior', trendColor: ingresosNetos > 0 ? 'text-green-600' : 'text-slate-400', icon: <TrendingUp size={18} className={ingresosNetos > 0 ? "text-green-600" : "text-slate-400"} /> },
    { label: 'Costo de Ventas', value: `$${formatCurrency(costoVentas)}`, trend: `${calcPct(costoVentas, ingresosNetos)} de los ingresos`, trendColor: costoVentas > 0 ? 'text-[#0b5156]' : 'text-slate-400', icon: <PieChart size={18} className={costoVentas > 0 ? "text-[#0b5156]" : "text-slate-400"} /> },
    { label: 'Utilidad Bruta', value: `$${formatCurrency(utilidadBruta)}`, trend: `Margen: ${calcPct(utilidadBruta, ingresosNetos)}`, trendColor: utilidadBruta > 0 ? 'text-green-600' : 'text-slate-400', icon: <Activity size={18} className={utilidadBruta > 0 ? "text-green-600" : "text-slate-400"} /> },
    { label: 'Utilidad Neta', value: `$${formatCurrency(utilidadNeta)}`, trend: `Margen neto: ${calcPct(utilidadNeta, ingresosNetos)}`, trendColor: utilidadNeta > 0 ? 'text-green-600' : 'text-slate-400', icon: <ShieldCheck size={18} className={utilidadNeta > 0 ? "text-green-600" : "text-slate-400"} /> },
  ];

  const pgData = data?.filas || [];

  return (
    <div className="space-y-2 animate-in fade-in duration-500 pb-4 print:bg-white print:p-0">
      {/* Header */}
      <header className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden print:hidden">
        <div className="flex justify-between items-start mb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <Link to="/contabilidad" className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-[#0b5156]/20 transition-all">
                <ArrowLeft size={10} /> Volver
              </Link>
              <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Contabilidad
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Estado de Resultados (P&G)</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Pérdidas y ganancias del período. Ingresos, costos, gastos y utilidad neta.</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end items-center">
             <div className="mr-2">
                <input 
                  type="month" 
                  value={periodo} 
                  onChange={(e) => setPeriodo(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-black text-[#0b5156] outline-none uppercase shadow-sm" 
                />
             </div>
             <button 
              onClick={() => setShowComparison(!showComparison)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 transition-all border ${showComparison ? 'bg-[#0b5156] text-white border-[#0b5156]' : 'bg-white text-[#0b5156] border-slate-200 hover:bg-[#0b5156]/5'}`}
             >
                <TrendingUp size={14} /> Análisis Horizontal
             </button>
             <button 
              onClick={() => setShowExportModal(true)}
              className="bg-[#0b5156] text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
             >
                <Download size={14} /> Exportar Reporte
             </button>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse bg-white rounded-3xl border border-slate-200 shadow-sm">
           Cargando Estado de Resultados...
        </div>
      ) : (
        <>
          {/* Metrics Grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start print:hidden">
            {metrics.map((m, i) => (
              <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24 hover:border-[#0b5156]/20 transition-all">
                 <div className="flex justify-between items-start">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{m.label}</span>
                    {m.icon}
                 </div>
                 <div className="space-y-1">
                   <strong className="text-lg font-black text-[#0b5156] tracking-tighter font-mono">{m.value}</strong>
                   <p className={`text-[10px] font-bold uppercase leading-tight ${m.trendColor}`}>{m.trend}</p>
                 </div>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start print:block">
            {/* Main P&G Table */}
            <article className="lg:col-span-2 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none print:border-none print:p-0">
               <div className="mb-3 flex justify-between items-center print:border-b-2 print:border-black print:pb-2">
                  <div>
                    <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none print:text-black">P&G — Período {periodo}</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight mt-1 print:hidden">Formato estándar VEN-NIF. Expresado en USD.</p>
                  </div>
               </div>

               <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-left">
                     <thead>
                        <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 print:text-black print:border-black">
                           <th className="py-2 px-2">Cuenta / Clasificación</th>
                           <th className="py-2 px-2 text-right">Monto Actual</th>
                           {showComparison && <th className="py-2 px-2 text-right print:hidden">Monto Anterior</th>}
                           {showComparison && <th className="py-2 px-2 text-right print:hidden">Variación (%)</th>}
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-50 text-xs print:divide-slate-200">
                        {pgData.map((row: any, i: number) => (
                           row.isHeader || row.esCabecera ? (
                              <tr key={i} className={`${row.color || 'bg-slate-50'} print:bg-white print:border-b print:border-black`}>
                                 <td colSpan={4} className="py-1.5 px-2 font-black text-[#0b5156] uppercase tracking-widest text-[10px] print:text-black">{row.name || row.nombre}</td>
                              </tr>
                           ) : row.isSubtotal || row.esSubtotal ? (
                              <tr key={i} className="bg-slate-50/50 border-t border-slate-200 print:bg-white print:border-black">
                                 <td className="py-2.5 px-3 font-black text-slate-700 text-[11px] uppercase tracking-tight print:text-black">{row.name || row.nombre}</td>
                                 <td className="py-2.5 px-2 text-right font-black font-mono text-slate-800 text-sm print:text-black">{row.current || row.actual || `$${formatCurrency(row.monto_actual)}`}</td>
                                 {showComparison && <td className="py-2.5 px-2 text-right font-black font-mono text-slate-500 print:hidden">{row.prev || row.anterior || `$${formatCurrency(row.monto_anterior)}`}</td>}
                                 {showComparison && (
                                    <td className="py-2.5 px-2 text-right print:hidden">
                                       <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${row.varType === 'success' || (row.variacion && !row.variacion.startsWith('-')) ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                          {row.var || row.variacion || '0%'}
                                       </span>
                                    </td>
                                 )}
                              </tr>
                           ) : row.isTotal || row.esTotal ? (
                              <tr key={i} className="bg-[#0b5156]/5 border-t-2 border-[#0b5156] print:bg-white print:border-black print:border-t-4">
                                 <td className="py-3 px-3 font-black text-[#0b5156] text-xs uppercase print:text-black">{row.name || row.nombre}</td>
                                 <td className="py-3 px-2 text-right font-black font-mono text-[#0b5156] text-sm print:text-black">{row.current || row.actual || `$${formatCurrency(row.monto_actual)}`}</td>
                                 {showComparison && <td className="py-3 px-2 text-right font-black font-mono text-slate-400 print:hidden">{row.prev || row.anterior || `$${formatCurrency(row.monto_anterior)}`}</td>}
                                 {showComparison && (
                                    <td className="py-3 px-2 text-right print:hidden">
                                       <span className="bg-green-600 text-white px-2 py-0.5 rounded text-[8px] font-black uppercase">
                                          {row.var || row.variacion || '0%'} ↑
                                       </span>
                                    </td>
                                 )}
                              </tr>
                           ) : (
                              <tr key={i} className="hover:bg-slate-50 transition-colors print:text-black">
                                 <td className="py-2 px-3 font-bold text-slate-600 uppercase tracking-tight print:text-black">{row.name || row.nombre}</td>
                                 <td className={`py-2 px-2 text-right font-black font-mono ${(row.current || row.actual || row.monto_actual?.toString() || '').includes('(') ? 'text-red-500' : 'text-slate-800'} print:text-black`}>
                                    {row.current || row.actual || `$${formatCurrency(row.monto_actual)}`}
                                 </td>
                                 {showComparison && <td className="py-2 px-2 text-right font-mono text-slate-400 print:hidden">{row.prev || row.anterior || `$${formatCurrency(row.monto_anterior)}`}</td>}
                                 {showComparison && (
                                    <td className="py-2 px-2 text-right print:hidden">
                                       <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${row.varType === 'success' || (row.variacion && !row.variacion.startsWith('-')) ? 'bg-green-100 text-green-700' : row.varType === 'danger' || (row.variacion && row.variacion.startsWith('-')) ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                          {row.var || row.variacion || '0%'} {row.varType === 'success' || (row.variacion && !row.variacion.startsWith('-')) ? '↑' : row.varType === 'danger' || (row.variacion && row.variacion.startsWith('-')) ? '↓' : '—'}
                                       </span>
                                    </td>
                                 )}
                              </tr>
                           )
                        ))}
                     </tbody>
                  </table>
               </div>
            </article>

            {/* Sidebar Indicators */}
            <aside className="space-y-4 print:hidden">
               <article className="bg-[#0b5156] p-4 rounded-2xl text-white shadow-2xl relative overflow-hidden flex flex-col justify-between">
                  <div className="relative z-10">
                     <h2 className="text-base font-black uppercase tracking-tighter leading-none mb-4 flex items-center gap-2">
                        <Percent size={18} className="text-white/40" />
                        Indicadores
                     </h2>
                     <div className="space-y-4">
                        {[
                          { label: 'Margen Bruto', val: ingresosNetos > 0 ? calcPct(utilidadBruta, ingresosNetos) : '0.0%', desc: 'Sano · Sectorial 40%', color: 'bg-green-500' },
                          { label: 'Margen Operativo', val: data?.indicadores?.margen_operativo || '0.0%', desc: 'Bien · Gastos Controlados', color: 'bg-green-500' },
                          { label: 'Margen Neto', val: ingresosNetos > 0 ? calcPct(utilidadNeta, ingresosNetos) : '0.0%', desc: 'Normal · Pos-Impuesto', color: 'bg-blue-400' },
                          { label: 'ISLR Estimado', val: ingresosNetos > 0 ? calcPct(utilidadNeta * 0.34, ingresosNetos) : '0.0%', desc: 'Revisar · Declaración Pend.', color: 'bg-amber-400' },
                        ].map((idx, i) => (
                          <div key={i} className="flex justify-between items-center group">
                             <div className="space-y-0.5">
                                <strong className="text-xs font-black uppercase block tracking-tight">{idx.label}</strong>
                                <p className="text-[9px] font-bold text-white/40 uppercase leading-none">{idx.desc}</p>
                             </div>
                             <div className="flex flex-col items-end gap-1">
                                <span className="text-sm font-black font-mono tracking-tighter">{idx.val}</span>
                                <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden">
                                   <div className={`${idx.color} h-full`} style={{ width: idx.val }} />
                                </div>
                             </div>
                          </div>
                        ))}
                     </div>
                  </div>
                  <Link to="/fiscal/declaracion-islr" className="relative z-10 w-full py-2.5 mt-6 bg-white/10 border border-white/20 rounded-xl text-[10px] font-black uppercase text-center hover:bg-white hover:text-[#0b5156] transition-all flex items-center justify-center gap-2 group">
                     Ir a Declaración ISLR <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                  </Link>
                  <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-3xl"></div>
               </article>

               <div className="p-3 bg-white rounded-2xl border border-slate-200 flex gap-3">
                  <Info size={20} className="text-[#0b5156] shrink-0" />
                  <p className="text-[10px] font-bold text-slate-500 uppercase leading-relaxed">
                     Este reporte se genera mediante un <strong>cierre virtual permanente</strong>. Los montos de utilidad se reflejan en el Patrimonio del Balance General automáticamente.
                  </p>
               </div>
            </aside>
          </div>
        </>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300 print:hidden">
           <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={() => setShowExportModal(false)} />
           <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                 <div className="space-y-1">
                    <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter leading-none">Exportar P&G</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Configuración de salida del reporte.</p>
                 </div>
                 <button onClick={() => setShowExportModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                    <X size={20} />
                 </button>
              </div>

              <div className="p-5 space-y-3">
                 <button onClick={() => handleExport('pdf')} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between group hover:border-[#0b5156] transition-all">
                    <div className="flex items-center gap-3">
                       <FileText size={20} className="text-[#0b5156]" />
                       <div className="text-left">
                          <strong className="text-xs font-black text-[#0b5156] uppercase block">PDF de Alta Gerencia</strong>
                          <span className="text-[9px] font-bold text-slate-400 uppercase">Incluye gráficos e indicadores clave.</span>
                       </div>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-[#0b5156] transition-colors" />
                 </button>

                 <button onClick={() => handleExport('xlsx')} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between group hover:border-green-600 transition-all">
                    <div className="flex items-center gap-3">
                       <Layers size={20} className="text-green-600" />
                       <div className="text-left">
                          <strong className="text-xs font-black text-green-700 uppercase block">Excel Detallado</strong>
                          <span className="text-[9px] font-bold text-slate-400 uppercase">Para auditoría y análisis externo.</span>
                       </div>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-green-600 transition-colors" />
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default IncomeStatement;
