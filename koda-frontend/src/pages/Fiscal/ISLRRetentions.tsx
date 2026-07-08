import { 
  FileCode, 
  Download, 
  Printer, 
  Search, 
  Filter, 
  ArrowLeft,
  CheckCircle2,
  TriangleAlert,
  FileText,
  TrendingUp,
  BarChart4,
  Info,
  Maximize2,
  Minimize2,
  Calendar
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { api } from '@/api/client';

const ISLRRetentions = () => {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [periodo, setPeriodo] = useState(currentMonth);
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchRetenciones();
  }, [periodo]);

  const fetchRetenciones = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<any>(`/fiscal/retenciones-islr?periodo=${periodo}`);
      setData(res || null);
    } catch (error) {
      console.error("Error fetching ISLR retentions:", error);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportXML = () => {
    const url = `/api/fiscal/retenciones-islr/exportar?periodo=${periodo}`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `retenciones_islr_${periodo.replace('-', '')}.xml`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportTXT = () => {
    // Para ISLR el SENIAT exige XML. Descargamos el XML oficial directamente.
    handleExportXML();
  };

  const formatCurrency = (val: number | string | undefined | null) => {
    if (val === undefined || val === null) return "0.00";
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return val;
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2 });
  };

  const retentions = data?.retenciones || [];
  const metrics = data?.metricas || {};

  const filteredRetentions = useMemo(() => {
    if (!searchQuery.trim()) return retentions;
    const q = searchQuery.toLowerCase();
    return retentions.filter((r: any) => 
      r.provider?.toLowerCase().includes(q) || 
      r.concept?.toLowerCase().includes(q) ||
      r.id?.toLowerCase().includes(q)
    );
  }, [retentions, searchQuery]);

  return (
    <div className="space-y-3 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <Link to="/fiscal" className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-[#0b5156]/20 transition-all">
                <ArrowLeft size={10} /> Volver a Fiscal
              </Link>
              <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Retenciones ISLR
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Retenciones de ISLR a Proveedores</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Control de retenciones practicadas por conceptos de servicios, honorarios, fletes y alquileres.</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end items-center">
             <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mr-2">
                <Calendar size={14} className="text-slate-400" />
                <input 
                  type="month" 
                  value={periodo} 
                  onChange={(e) => setPeriodo(e.target.value)}
                  className="bg-transparent text-xs font-black text-[#0b5156] outline-none"
                />
             </div>
             <button onClick={handleExportXML} className="bg-[#0b5156] text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <FileCode size={14} /> Generar XML (SENIAT)
             </button>
             <button onClick={handleExportTXT} className="bg-white text-[#0b5156] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <Download size={14} /> Generar TXT (F. 99017)
             </button>
             <button onClick={() => window.print()} className="bg-white text-[#0b5156] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <Printer size={14} /> Pagos Sujetos
             </button>
             <button className="bg-white text-[#0b5156] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <BarChart4 size={14} /> Resumen Conceptos
             </button>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse bg-white rounded-3xl border border-slate-200 shadow-sm">
           Cargando Retenciones ISLR...
        </div>
      ) : (
        <>
          {/* Proyección ISLR */}
          <article className="bg-[#0b5156] p-8 rounded-[2.5rem] border border-[#0b5156]/10 shadow-2xl relative overflow-hidden">
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-8 items-start items-center">
              <div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight mb-1">Monto por Enterar</h3>
                <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-4">Total a pagar al SENIAT por retenciones practicadas.</p>
                <span className="bg-amber-500/20 text-amber-400 text-[10px] font-black px-3 py-1 rounded-full uppercase border border-amber-500/30">Cierre: {periodo}</span>
              </div>
              
              <div className="grid grid-cols-3 gap-4 items-start px-8 border-x border-white/10">
                <div>
                  <span className="text-white/40 text-[9px] font-black uppercase tracking-widest block mb-1">Honorarios (3%)</span>
                  <strong className="text-lg font-black text-white font-mono leading-none">Bs. {formatCurrency(metrics.honorarios_total)}</strong>
                </div>
                <div>
                  <span className="text-white/40 text-[9px] font-black uppercase tracking-widest block mb-1">Fletes (1%)</span>
                  <strong className="text-lg font-black text-white font-mono leading-none">Bs. {formatCurrency(metrics.fletes_total)}</strong>
                </div>
                <div>
                  <span className="text-white/40 text-[9px] font-black uppercase tracking-widest block mb-1">Servicios (2%)</span>
                  <strong className="text-lg font-black text-white font-mono leading-none">Bs. {formatCurrency(metrics.servicios_total)}</strong>
                </div>
              </div>

              <div className="text-right">
                <span className="text-white/40 text-[10px] font-black uppercase tracking-widest block mb-1">Total ISLR a Enterar</span>
                <strong className="text-xl font-black text-amber-400 tracking-tighter drop-shadow-lg">Bs. {formatCurrency(metrics.total_islr)}</strong>
              </div>
            </div>
            <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
          </article>

          {/* Metrics Grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            {[
              { label: 'Pagos Procesados', value: metrics.pagos_procesados || 0, desc: 'Sujetos a retención', color: 'text-[#0b5156]', icon: <TrendingUp size={16} className="text-[#0b5156]" /> },
              { label: 'Comprobantes Listos', value: metrics.comprobantes_listos || 0, desc: 'PDFs generados', color: 'text-green-600', icon: <CheckCircle2 size={16} className="text-green-500" /> },
              { label: 'Retenciones Pendientes', value: metrics.retenciones_pendientes || 0, desc: 'Bloqueo de pago', color: 'text-red-600', icon: <TriangleAlert size={16} className="text-red-500" /> },
              { label: 'Base Imponible Total', value: `Bs. ${formatCurrency(metrics.base_imponible_total)}`, desc: 'Sujeta a impuesto', color: 'text-blue-600', icon: <Info size={16} className="text-blue-400" /> },
            ].map((m, i) => (
              <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24">
                <div className="flex justify-between items-start">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest leading-tight w-2/3">{m.label}</p>
                  {m.icon}
                </div>
                <div className="space-y-1">
                  <strong className={`text-xl font-black ${m.color} tracking-tighter font-mono`}>{m.value}</strong>
                  <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">{m.desc}</p>
                </div>
              </div>
            ))}
          </section>

          {/* Table Section */}
          <article className={`bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-500 ${isFullScreen ? 'fixed inset-0 z-[100] m-4 rounded-[2.5rem]' : 'relative'}`}>
            <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/30">
              <div className="space-y-1">
                <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter leading-none">Listado de Retenciones Practicadas</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Retenciones aplicadas a proveedores en este período fiscal.</p>
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                 <button 
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  className="p-2 bg-white text-[#0b5156] rounded-lg border border-slate-200 hover:bg-[#0b5156]/5 shadow-sm transition-all flex items-center gap-2"
                  title={isFullScreen ? "Salir de Pantalla Completa" : "Ver en Pantalla Completa"}
                 >
                    {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    <span className="text-[10px] font-black uppercase">{isFullScreen ? 'Reducir' : 'Pantalla Completa'}</span>
                 </button>
                 <div className="relative flex-1 md:flex-none">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                    <input 
                      type="text" 
                      placeholder="Buscar Proveedor o Concepto..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full md:w-64 bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156] shadow-sm" 
                    />
                 </div>
                 <button className="p-2 bg-white text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-50 shadow-sm transition-all">
                    <Filter size={16} />
                 </button>
              </div>
            </div>

            <div className={`overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200 ${isFullScreen ? 'h-[calc(100vh-200px)]' : ''}`}>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                    <th className="py-2.5 px-4">Fecha</th>
                    <th className="py-4 px-4">N° Comprobante</th>
                    <th className="py-4 px-4">Proveedor / RIF</th>
                    <th className="py-4 px-4">Concepto de Retención</th>
                    <th className="py-4 px-4">Factura</th>
                    <th className="py-4 px-4 text-right">Monto Objeto</th>
                    <th className="py-4 px-4 text-right">%</th>
                    <th className="py-4 px-4 text-right">ISLR Retenido</th>
                    <th className="py-4 px-4 text-center">Estado TXT</th>
                    <th className="py-2.5 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-[11px]">
                  {filteredRetentions.length > 0 ? filteredRetentions.map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-500">{row.date}</td>
                      <td className="py-4 px-4 font-mono font-black text-[#0b5156] uppercase tracking-tighter">{row.id}</td>
                      <td className="py-4 px-4">
                        <div className="flex flex-col">
                          <span className="font-black text-slate-700 uppercase truncate max-w-[150px]">{row.provider}</span>
                          <span className={`text-[9px] font-bold uppercase ${row.rif === 'FALTA RIF' ? 'text-red-500 animate-pulse' : 'text-slate-400'}`}>{row.rif}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 font-black text-slate-600 uppercase tracking-tight max-w-[200px] leading-tight" title={row.concept}>{row.concept}</td>
                      <td className="py-4 px-4 font-mono font-black text-slate-400">{row.doc}</td>
                      <td className="py-4 px-4 text-right font-black font-mono text-slate-700">{formatCurrency(row.base)}</td>
                      <td className="py-4 px-4 text-right font-black font-mono text-slate-400">{row.perc}</td>
                      <td className="py-4 px-4 text-right font-black font-mono text-amber-600">{formatCurrency(row.ret)}</td>
                      <td className="py-4 px-4 text-center">
                        <span className={`${row.status === 'INCLUIDO' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button className="bg-slate-50 text-[#0b5156] px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border border-slate-200 hover:bg-[#0b5156] hover:text-white transition-all shadow-sm flex items-center gap-1 ml-auto">
                          <FileText size={12} /> PDF
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                        No hay retenciones de ISLR para este período
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}

      <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100 flex gap-4">
        <TriangleAlert size={24} className="text-amber-600 shrink-0" />
        <div className="space-y-1">
          <h4 className="text-sm font-black text-amber-800 uppercase">Validación de RIFs Crítica</h4>
          <p className="text-xs text-amber-700 font-bold uppercase leading-relaxed opacity-80">
            Es obligatorio que todos los proveedores tengan un RIF válido registrado para generar el archivo TXT (Formulario 99017). Los registros marcados en rojo deben corregirse antes del cierre mensual.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ISLRRetentions;
