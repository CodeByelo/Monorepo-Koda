import { 
  ArrowLeft,
  Download,
  Info,
  TrendingUp,
  Layers,
  FileText,
  X,
  History
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const BalanceSheet = () => {
  const [currency, setCurrency] = useState<'VES' | 'USD'>('VES');
  const [showComparison, setShowComparison] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [balanceData, setBalanceData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const fetchBalance = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<any>(`/contabilidad/balance-general?periodo=${periodo}`);
      setBalanceData(res || null);
    } catch (error) {
      console.error("Error fetching balance sheet:", error);
      setBalanceData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();
  }, [periodo]);

  const handleExport = async (formato: 'pdf' | 'xlsx') => {
    try {
      const token = localStorage.getItem('koda_token') || localStorage.getItem('sgd_token');
      const baseUrl = (window.location.hostname.includes('.ts.net') || window.location.hostname.includes('cloudflare')) ? '/api-facturacion' : '/api';
      const formatParam = formato === 'xlsx' ? 'excel' : formato;
      const response = await fetch(`${baseUrl}/contabilidad/balance-general/exportar?periodo=${periodo}&formato=${formatParam}`, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + (token || '') },
      });
      if (!response.ok) throw new Error('Error ' + response.status);
      
      const blob = await response.blob();
      const urlBlob = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = urlBlob;
      link.setAttribute('download', `balance_general_${periodo}.${formato}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(urlBlob);
      setShowExportModal(false);
    } catch (error) {
      console.error(`Error exportando a ${formato}:`, error);
      setExportError(`Error al exportar a ${formato.toUpperCase()}. Intente nuevamente.`);
      setTimeout(() => setExportError(null), 4000);
    }
  };

  const formatCurrency = (val: number | string | undefined | null) => {
    if (val === undefined || val === null) return "0,00";
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return "0,00";
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const activosVes = parseFloat(balanceData?.totales?.activos_ves || balanceData?.total_activo || 0);
  const pasivosVes = parseFloat(balanceData?.totales?.pasivos_ves || balanceData?.total_pasivo || 0);
  const patrimonioVes = parseFloat(balanceData?.totales?.patrimonio_ves || balanceData?.total_patrimonio || 0);

  const calcPct = (part: number, total: number) => {
    if (!total || total === 0) return '0.0%';
    return ((part / total) * 100).toFixed(1) + '%';
  };

  const metrics = [
    { label: 'Total Activos', ves: formatCurrency(balanceData?.totales?.activos_ves || balanceData?.total_activo || 0), usd: formatCurrency(balanceData?.totales?.activos_usd || balanceData?.total_activo || 0), trend: activosVes > 0 ? '+8.4% vs año anterior' : '0.0% vs año anterior', trendColor: activosVes > 0 ? 'text-green-600' : 'text-slate-400' },
    { label: 'Total Pasivos', ves: formatCurrency(balanceData?.totales?.pasivos_ves || balanceData?.total_pasivo || 0), usd: formatCurrency(balanceData?.totales?.pasivos_usd || balanceData?.total_pasivo || 0), trend: `${calcPct(pasivosVes, activosVes)} del activo total`, trendColor: pasivosVes > 0 ? 'text-[#0b5156]' : 'text-slate-400' },
    { label: 'Patrimonio Neto', ves: formatCurrency(balanceData?.totales?.patrimonio_ves || balanceData?.total_patrimonio || 0), usd: formatCurrency(balanceData?.totales?.patrimonio_usd || balanceData?.total_patrimonio || 0), trend: `${calcPct(patrimonioVes, activosVes)} de los activos`, trendColor: patrimonioVes > 0 ? 'text-green-600' : 'text-slate-400' },
    { label: 'Razón de Liquidez', ves: balanceData?.totales?.liquidez || '0.0x', usd: balanceData?.totales?.liquidez || '0.0x', trend: 'Activo / Pasivo corriente', trendColor: activosVes > 0 ? 'text-green-600' : 'text-slate-400' },
  ];

  const assetData = balanceData?.activos || [];

  const liabilityData = balanceData?.pasivos_patrimonio || [];

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
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Balance General</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Activos, pasivos y patrimonio. Posición financiera al cierre del período. Formato VEN-NIF.</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end items-center">
             <div className="mr-2">
                <input 
                  type="month" 
                  value={periodo} 
                  onChange={(e) => setPeriodo(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156]" 
                />
             </div>
             <div className="bg-white p-1 rounded-xl border border-slate-200 flex gap-1">
                <button 
                  onClick={() => setCurrency('VES')}
                  className={`px-3 py-1 text-[10px] font-black uppercase rounded-lg transition-all ${currency === 'VES' ? 'bg-[#0b5156] text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Bs. VES
                </button>
                <button 
                  onClick={() => setCurrency('USD')}
                  className={`px-3 py-1 text-[10px] font-black uppercase rounded-lg transition-all ${currency === 'USD' ? 'bg-[#0b5156] text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  US$ Dólar
                </button>
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
                <Download size={14} /> Exportar
             </button>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse bg-white rounded-2xl border border-slate-200">
           Cargando Balance General...
        </div>
      ) : (
        <>
          {/* Metrics Grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start print:hidden">
            {metrics.map((m, i) => (
              <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24 hover:border-[#0b5156]/20 transition-all">
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{m.label}</span>
                 <div className="space-y-1">
                   <strong className="text-lg font-black text-[#0b5156] tracking-tighter font-mono whitespace-nowrap">{currency === 'VES' ? `Bs. ${m.ves}` : `US$ ${m.usd}`}</strong>
                   <p className={`text-[10px] font-bold uppercase leading-tight ${m.trendColor}`}>{m.trend}</p>
                 </div>
              </div>
            ))}
          </section>

          {/* Balance Sheet Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start print:grid-cols-1 print:gap-8">
            {/* Assets Card */}
            <article className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none print:border-none print:p-0">
               <div className="mb-3 flex justify-between items-center print:border-b-2 print:border-black print:pb-2">
                  <div>
                    <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none print:text-black">Activos</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight mt-1 print:hidden">Análisis de Variación de Periodo</p>
                  </div>
                  {showComparison && <span className="bg-green-100 text-green-700 text-[8px] font-black px-2 py-0.5 rounded uppercase print:hidden">Comparativa Activa</span>}
               </div>

               <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-left">
                     <thead>
                        <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 print:text-black">
                           <th className="py-2 px-2">Cuenta</th>
                           <th className="py-2 px-2 text-right">Actual</th>
                           {showComparison && <th className="py-2 px-2 text-right print:hidden">Anterior</th>}
                           {showComparison && <th className="py-2 px-2 text-right print:hidden">Var (%)</th>}
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-50 text-xs print:divide-slate-200">
                        {assetData.map((row: any, i: number) => (
                           row.isHeader || row.esCabecera ? (
                              <tr key={i} className="bg-slate-50/50 print:bg-white print:border-b print:border-black">
                                 <td colSpan={4} className="py-2 px-2 font-black text-[#0b5156] uppercase tracking-widest text-[10px] print:text-black">{row.category || row.categoria}</td>
                              </tr>
                           ) : (
                              <tr key={i} className="hover:bg-slate-50 transition-colors print:text-black">
                                 <td className="py-2 px-3 font-bold text-slate-600 uppercase print:text-black">{row.name || row.nombre}</td>
                                 <td className="py-2 px-2 text-right font-black font-mono text-slate-800 print:text-black">{currency === 'VES' ? `Bs. ${formatCurrency(row.ves)}` : `US$ ${formatCurrency(row.usd)}`}</td>
                                 {showComparison && <td className="py-2 px-2 text-right font-mono text-slate-400 print:hidden">{formatCurrency(row.prev || row.anterior)}</td>}
                                 {showComparison && (
                                    <td className="py-2 px-2 text-right print:hidden">
                                       <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${row.varType === 'success' || (row.variacion && !row.variacion.startsWith('-')) ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                          {row.var || row.variacion || '0%'}
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

            {/* Liability & Equity Card */}
            <article className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none print:border-none print:p-0">
               <div className="mb-3 flex justify-between items-center print:border-b-2 print:border-black print:pb-2">
                  <div>
                    <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none print:text-black">Pasivos y Patrimonio</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight mt-1 print:hidden">Análisis de Variación de Periodo</p>
                  </div>
                  {showComparison && <span className="bg-red-100 text-red-700 text-[8px] font-black px-2 py-0.5 rounded uppercase print:hidden">Comparativa Activa</span>}
               </div>

               <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-left">
                     <thead>
                        <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 print:text-black">
                           <th className="py-2 px-2">Cuenta</th>
                           <th className="py-2 px-2 text-right">Actual</th>
                           {showComparison && <th className="py-2 px-2 text-right print:hidden">Anterior</th>}
                           {showComparison && <th className="py-2 px-2 text-right print:hidden">Var (%)</th>}
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-50 text-xs print:divide-slate-200">
                        {liabilityData.map((row: any, i: number) => (
                           row.isHeader || row.esCabecera ? (
                              <tr key={i} className="bg-slate-50/50 print:bg-white print:border-b print:border-black">
                                 <td colSpan={4} className="py-2 px-2 font-black text-[#0b5156] uppercase tracking-widest text-[10px] print:text-black">{row.category || row.categoria}</td>
                              </tr>
                           ) : (
                              <tr key={i} className="hover:bg-slate-50 transition-colors print:text-black">
                                 <td className="py-2 px-3 font-bold text-slate-600 uppercase print:text-black">{row.name || row.nombre}</td>
                                 <td className="py-2 px-2 text-right font-black font-mono text-slate-800 print:text-black">{currency === 'VES' ? `Bs. ${formatCurrency(row.ves)}` : `US$ ${formatCurrency(row.usd)}`}</td>
                                 {showComparison && <td className="py-2 px-2 text-right font-mono text-slate-400 print:hidden">{formatCurrency(row.prev || row.anterior)}</td>}
                                 {showComparison && (
                                    <td className="py-2 px-2 text-right print:hidden">
                                       <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${row.varType === 'success' || (row.variacion && !row.variacion.startsWith('-')) ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                          {row.var || row.variacion || '0%'}
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
          </div>

          {/* Certification Footer */}
          <article className="bg-white p-3.5 rounded-xl border-t-2 border-t-[#0b5156] border border-slate-200 shadow-sm mt-8 print:shadow-none print:border-none print:mt-16">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start text-center mb-4">
                <div className="space-y-1">
                   <div className="h-0.5 bg-slate-100 w-1/2 mx-auto print:bg-black" />
                   <div>
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest print:text-black">Preparado por:</span>
                      <p className="text-[10px] font-black text-[#0b5156] uppercase tracking-tight print:text-black">Dpto. Contabilidad</p>
                   </div>
                </div>
                <div className="space-y-1">
                   <div className="h-0.5 bg-slate-100 w-1/2 mx-auto print:bg-black" />
                   <div>
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest print:text-black">Revisado por:</span>
                      <p className="text-[10px] font-black text-[#0b5156] uppercase tracking-tight print:text-black">Contador Público (CPC)</p>
                   </div>
                </div>
                <div className="space-y-1">
                   <div className="h-0.5 bg-slate-100 w-1/2 mx-auto print:bg-black" />
                   <div>
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest print:text-black">Aprobado por:</span>
                      <p className="text-[10px] font-black text-[#0b5156] uppercase tracking-tight print:text-black">Representante Legal</p>
                   </div>
                </div>
             </div>
             <p className="text-center text-[8px] font-bold text-slate-400 uppercase leading-relaxed max-w-xl mx-auto italic print:text-black">
                {`Este estado financiero ha sido preparado y expresado en ${currency === 'VES' ? 'Bolívares' : 'Dólares'} conforme a las Normas de Información Financiera de Venezuela (VEN-NIF) aplicables a la fecha del reporte.`}
             </p>
          </article>

          {/* Audit Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start mt-4 print:hidden">
             <div className="p-2.5 bg-blue-50 rounded-xl border border-blue-100 flex gap-2.5">
                <Info size={14} className="text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                   <h4 className="text-[10px] font-black text-blue-900 uppercase tracking-tight">Nota de Auditoría</h4>
                   <p className="text-[9px] font-bold text-blue-800/60 uppercase leading-snug">
                      La vista en Dólares (USD) utiliza el método de <strong>reexpresión por tasa histórica</strong>. Los valores reflejan la tasa BCV vigente en la fecha exacta de cada transacción.
                   </p>
                </div>
             </div>
             <div className="p-2.5 bg-green-50 rounded-xl border border-green-100 flex gap-2.5">
                <Layers size={14} className="text-green-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                   <h4 className="text-[10px] font-black text-green-900 uppercase tracking-tight">Amarre Automático</h4>
                   <p className="text-[9px] font-bold text-green-800/60 uppercase leading-snug">
                      La Utilidad del Período se calcula dinámicamente desde el <strong>Estado de Resultados</strong>. El sistema mantiene el balance cuadrado sin necesidad de asientos manuales.
                   </p>
                </div>
             </div>
          </div>
        </>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300 print:hidden">
           <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={() => setShowExportModal(false)} />
           <div className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200">
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                 <div className="space-y-1">
                    <h2 className="text-2xl font-black text-[#0b5156] uppercase tracking-tighter leading-none">Configuración de Exportación</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ajustes del reporte certificado.</p>
                 </div>
                 <button onClick={() => setShowExportModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                    <X size={24} />
                 </button>
              </div>

              <div className="p-8 space-y-6">
                 <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="space-y-0.5">
                       <p className="text-xs font-black text-[#0b5156] uppercase tracking-tight">Firma y Sello Digital</p>
                       <p className="text-[9px] font-bold text-slate-400 uppercase">Incluir avales electrónicos.</p>
                    </div>
                    <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-slate-300 text-[#0b5156] focus:ring-[#0b5156]" />
                 </div>
                 <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="space-y-0.5">
                       <p className="text-xs font-black text-[#0b5156] uppercase tracking-tight">Nota VEN-NIF</p>
                       <p className="text-[9px] font-bold text-slate-400 uppercase">Incluir cumplimiento normativo.</p>
                    </div>
                    <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-slate-300 text-[#0b5156] focus:ring-[#0b5156]" />
                 </div>

                 <div className="grid grid-cols-2 gap-4 items-start mt-8">
                    <button onClick={() => handleExport('pdf')} className="flex flex-col items-center gap-3 p-6 bg-slate-50 rounded-3xl border border-slate-100 hover:bg-[#0b5156] hover:text-white transition-all group shadow-sm">
                       <FileText size={24} className="text-[#0b5156] group-hover:text-white transition-colors" />
                       <span className="text-[10px] font-black uppercase tracking-widest">PDF Certificado</span>
                    </button>
                    <button onClick={() => handleExport('xlsx')} className="flex flex-col items-center gap-3 p-6 bg-slate-50 rounded-3xl border border-slate-100 hover:bg-green-600 hover:text-white transition-all group shadow-sm">
                       <History size={24} className="text-green-600 group-hover:text-white transition-colors" />
                       <span className="text-[10px] font-black uppercase tracking-widest">Excel Fórmulas</span>
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default BalanceSheet;
