import { 
  ArrowLeft,
  Settings,
  Printer,
  ShieldCheck,
  CheckCircle2,
  PieChart,
  Info,
  Layers,
  ArrowUpRight,
  Banknote,
  AlertTriangle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const CashFlow = () => {
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    fetchCashFlow();
  }, [periodo]);

  const fetchCashFlow = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<any>(`/contabilidad/flujo-caja?periodo=${periodo}`);
      setData(res || null);
    } catch (error) {
      console.error("Error fetching cash flow:", error);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('koda_token') || localStorage.getItem('sgd_token');
      const baseUrl = (window.location.hostname.includes('.ts.net') || window.location.hostname.includes('cloudflare')) ? '/api-facturacion' : '/api';
      const response = await fetch(`${baseUrl}/contabilidad/flujo-caja/exportar?periodo=${periodo}&formato=pdf`, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + (token || '') },
      });
      if (!response.ok) throw new Error('Error ' + response.status);
      
      const blob = await response.blob();
      const urlBlob = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = urlBlob;
      link.setAttribute('download', `flujo_caja_${periodo}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(urlBlob);
    } catch (error) {
      console.error(`Error exportando:`, error);
      setExportError('Error al exportar a PDF. Intente nuevamente.');
      setTimeout(() => setExportError(null), 4000);
    }
  };

  const formatCurrency = (val: number | string | undefined | null) => {
    if (val === undefined || val === null) return "0.00";
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return "0.00";
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const operacion = data?.operacion || [];
  
  const inversion = data?.inversion || [];

  const financiamiento = data?.financiamiento || [];

  const netOperacion = data?.totales?.operacion || 0;
  const netInversion = data?.totales?.inversion || 0;
  const netFinanciamiento = data?.totales?.financiamiento || 0;
  const netIncrease = data?.totales?.incremento_neto || 0;
  const initialCash = data?.totales?.efectivo_inicio || 0;
  const finalCash = data?.totales?.efectivo_final || 0;
  const generalBalanceCash = data?.validacion?.saldo_balance || 0;
  const isBalanced = Math.abs(finalCash - generalBalanceCash) < 0.01;

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
                Contabilidad &gt; Libros Legales
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Estado de Flujo de Efectivo</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Movimientos de efectivo y equivalentes (Método Indirecto).</p>
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
             <Link to="/contabilidad/mapeo-flujo" className="bg-white text-[#0b5156] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <Settings size={14} /> Configurar Mapeo
             </Link>
             <button onClick={handleExport} className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <Printer size={14} /> Exportar PDF Certificado
             </button>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse bg-white rounded-3xl border border-slate-200 shadow-sm">
           Cargando Flujo de Efectivo...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start print:grid-cols-1">
          {/* Main Cash Flow Report */}
          <article className="lg:col-span-2 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none print:border-none print:p-0">
             <div className="mb-4 flex justify-between items-end print:border-b-2 print:border-black print:pb-2">
                <div>
                  <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none print:text-black">Flujo de Efectivo — Período {periodo}</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 print:hidden">Expresado en USD (Basado en Mapeo Dinámico)</p>
                </div>
                <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 flex items-center gap-2 print:bg-white print:border-black">
                   <span className="text-[9px] font-black text-slate-400 uppercase print:text-slate-600">Método</span>
                   <strong className="text-[10px] font-black text-[#0b5156] uppercase print:text-black">Indirecto NIIF</strong>
                </div>
             </div>

             <div className="space-y-4">
                {/* OPERACIÓN */}
                <div className="space-y-2">
                   <div className="flex items-center gap-1.5 border-b border-[#0b5156]/10 pb-1 print:border-black">
                      <ArrowUpRight size={12} className="text-[#0b5156] print:text-black" />
                      <strong className="text-[10px] font-black text-[#0b5156] uppercase tracking-widest print:text-black">Actividades de Operación</strong>
                   </div>
                   <div className="space-y-1.5">
                      {operacion.map((row: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-xs px-2 group hover:bg-slate-50/50 rounded-lg py-0.5 transition-all print:text-black">
                           <span className={`${row.isPlus || row.isMinus || row.tipo === '+' || row.tipo === '-' ? 'text-slate-400 font-bold' : 'text-slate-700 font-black'} uppercase print:text-black`}>{row.name || row.nombre}</span>
                           <span className={`font-black font-mono ${(row.val || row.monto?.toString() || '').includes('(') || row.monto < 0 ? 'text-red-500' : 'text-slate-600'} print:text-black`}>
                             {row.val || `$${formatCurrency(row.monto)}`}
                           </span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center p-2.5 bg-[#0b5156]/5 rounded-xl border border-[#0b5156]/10 mt-1 print:bg-white print:border-black print:border-t-2 print:rounded-none">
                         <span className="text-[10px] font-black text-[#0b5156] uppercase print:text-black">Efectivo Neto de Operación</span>
                         <strong className={`text-xs font-black font-mono ${netOperacion < 0 ? 'text-red-600' : 'text-[#0b5156]'} tracking-tighter print:text-black`}>${formatCurrency(netOperacion)}</strong>
                      </div>
                   </div>
                </div>

                {/* INVERSIÓN */}
                <div className="space-y-2">
                   <div className="flex items-center gap-1.5 border-b border-amber-500/10 pb-1 print:border-black">
                      <PieChart size={12} className="text-amber-500 print:text-black" />
                      <strong className="text-[10px] font-black text-amber-600 uppercase tracking-widest print:text-black">Actividades de Inversión</strong>
                   </div>
                   <div className="space-y-1.5">
                      {inversion.map((row: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-xs px-2 print:text-black">
                           <span className="text-slate-400 font-bold uppercase print:text-black">{row.name || row.nombre}</span>
                           <span className={`font-black font-mono ${(row.val || row.monto?.toString() || '').includes('(') || row.monto < 0 ? 'text-red-500' : 'text-slate-600'} print:text-black`}>
                             {row.val || `$${formatCurrency(row.monto)}`}
                           </span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center p-2.5 bg-amber-50 rounded-xl border border-amber-100 print:bg-white print:border-black print:border-t-2 print:rounded-none">
                         <span className="text-[10px] font-black text-amber-700 uppercase print:text-black">Efectivo Neto de Inversión</span>
                         <strong className={`text-xs font-black font-mono ${netInversion < 0 ? 'text-red-600' : 'text-amber-700'} tracking-tighter print:text-black`}>${formatCurrency(netInversion)}</strong>
                      </div>
                   </div>
                </div>

                {/* FINANCIAMIENTO */}
                <div className="space-y-2">
                   <div className="flex items-center gap-1.5 border-b border-blue-500/10 pb-1 print:border-black">
                      <Layers size={12} className="text-blue-500 print:text-black" />
                      <strong className="text-[10px] font-black text-blue-600 uppercase tracking-widest print:text-black">Actividades de Financiamiento</strong>
                   </div>
                   <div className="space-y-1.5">
                      {financiamiento.map((row: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-xs px-2 print:text-black">
                           <span className="text-slate-400 font-bold uppercase print:text-black">{row.name || row.nombre}</span>
                           <span className={`font-black font-mono ${(row.val || row.monto?.toString() || '').includes('(') || row.monto < 0 ? 'text-red-500' : 'text-slate-600'} print:text-black`}>
                             {row.val || `$${formatCurrency(row.monto)}`}
                           </span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center p-2.5 bg-blue-50 rounded-xl border border-blue-100 print:bg-white print:border-black print:border-t-2 print:rounded-none">
                         <span className="text-[10px] font-black text-blue-700 uppercase print:text-black">Efectivo Neto de Financiamiento</span>
                         <strong className={`text-xs font-black font-mono ${netFinanciamiento < 0 ? 'text-red-600' : 'text-blue-700'} tracking-tighter print:text-black`}>${formatCurrency(netFinanciamiento)}</strong>
                      </div>
                   </div>
                </div>

                {/* FINAL CONSOLIDATION */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2 relative overflow-hidden group hover:border-[#0b5156]/20 transition-all shadow-sm print:border-none print:shadow-none print:p-0 mt-4">
                   <div className="relative z-10 space-y-2">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-2 print:border-black">
                         <span className="text-[10px] font-black text-slate-400 uppercase print:text-black">Incremento Neto de Efectivo</span>
                         <strong className={`text-sm font-black font-mono ${netIncrease >= 0 ? 'text-green-600' : 'text-red-600'} print:text-black`}>{netIncrease > 0 ? '+' : ''}${formatCurrency(netIncrease)}</strong>
                      </div>
                      <div className="flex justify-between items-center">
                         <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest print:text-black">Efectivo al Inicio del Período</span>
                         <span className="text-[10px] font-black font-mono text-slate-600 print:text-black">${formatCurrency(initialCash)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-3 border-t-2 border-[#0b5156] group-hover:border-green-600 transition-colors print:border-black print:border-t-4">
                         <span className="text-xs font-black text-[#0b5156] uppercase tracking-tighter print:text-black">Efectivo al Final del Período</span>
                         <strong className="text-xl font-black font-mono text-slate-800 tracking-tighter print:text-black">${formatCurrency(finalCash)}</strong>
                      </div>
                   </div>
                   <div className="absolute right-0 bottom-0 w-64 h-64 bg-[#0b5156]/5 rounded-full blur-3xl group-hover:bg-green-500/5 transition-all print:hidden" />
                </div>
             </div>
          </article>

          {/* Sidebar Validation */}
          <aside className="space-y-4 print:hidden">
             <article className={`bg-white p-4 rounded-2xl border-l-4 ${isBalanced ? 'border-l-green-500' : 'border-l-red-500'} border border-slate-200 shadow-sm space-y-4`}>
                <div className="flex items-center gap-2">
                   {isBalanced ? <ShieldCheck size={20} className="text-green-600" /> : <AlertTriangle size={20} className="text-red-600" />}
                   <h3 className={`text-base font-black ${isBalanced ? 'text-[#0b5156]' : 'text-red-700'} uppercase tracking-tighter leading-none`}>Validación de Integridad</h3>
                </div>
                <div className="space-y-3">
                   <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo Final Flujo</span>
                      <strong className="text-xs font-black font-mono text-slate-700">${formatCurrency(finalCash)}</strong>
                   </div>
                   <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo Caja/Bancos</span>
                      <strong className="text-xs font-black font-mono text-slate-700">${formatCurrency(generalBalanceCash)}</strong>
                   </div>
                   <div className={`p-4 ${isBalanced ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'} rounded-xl border text-center space-y-1.5`}>
                      <div className="flex justify-center">
                         {isBalanced ? <CheckCircle2 size={24} className="text-green-600" /> : <AlertTriangle size={24} className="text-red-600" />}
                      </div>
                      <strong className={`text-[10px] font-black ${isBalanced ? 'text-green-800' : 'text-red-800'} uppercase block tracking-tight`}>
                        {isBalanced ? 'CONCILIACIÓN EXITOSA' : 'DESCUADRE DETECTADO'}
                      </strong>
                      <p className={`text-[9px] font-bold ${isBalanced ? 'text-green-700/60' : 'text-red-700/60'} uppercase leading-relaxed`}>
                        {isBalanced ? 'La sumatoria de efectivo coincide perfectamente con el Balance General.' : `Diferencia de $${formatCurrency(Math.abs(finalCash - generalBalanceCash))}. Revise operaciones pendientes.`}
                      </p>
                   </div>
                </div>
             </article>

             <article className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                   <Banknote size={20} className="text-[#0b5156]" />
                   <h3 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Composición</h3>
                </div>
                <div className="space-y-4">
                   <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                         <span className="text-slate-600">Bancos Nacionales</span>
                         <span className="text-slate-400">${formatCurrency(data?.composicion?.bancos || 0)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                         <div className="h-full bg-[#0b5156]" style={{ width: `${(data?.composicion?.bancos || 0) / (finalCash || 1) * 100}%` }} />
                      </div>
                   </div>
                   <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                         <span className="text-slate-600">Caja Chica / Efectivo</span>
                         <span className="text-slate-400">${formatCurrency(data?.composicion?.caja || 0)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                         <div className="h-full bg-amber-500" style={{ width: `${(data?.composicion?.caja || 0) / (finalCash || 1) * 100}%` }} />
                      </div>
                   </div>
                </div>
             </article>

             <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 flex gap-3">
                <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
                <p className="text-[9px] font-bold text-blue-800/60 uppercase leading-relaxed">
                   El flujo de efectivo se genera dinámicamente mapeando las cuentas del grupo 1.1 contra actividades de operación, inversión y financiamiento.
                </p>
             </div>
          </aside>
        </div>
      )}
    </div>
  );
};

export default CashFlow;
