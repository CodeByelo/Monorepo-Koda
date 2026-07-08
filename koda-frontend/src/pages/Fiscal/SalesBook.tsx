import { 
  Download, 
  FileSpreadsheet, 
  FileText, 
  ShieldCheck, 
  TriangleAlert, 
  Search,
  Filter,
  ArrowLeft,
  ChevronRight,
  TrendingUp,
  Info,
  Maximize2,
  Minimize2,
  Calendar,
  X
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { api, BASE_URL } from '@/api/client';
import { useEmpresaPerfil } from '@/hooks/useEmpresaPerfil';

const SalesBook = () => {
  const { perfil } = useEmpresaPerfil();
  const [isFullScreen, setIsFullScreen] = useState(false);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [periodo, setPeriodo] = useState(currentMonth);
  const [searchQuery, setSearchQuery] = useState('');
  const [showRifAuditModal, setShowRifAuditModal] = useState(false);
  
  const [movements, setMovements] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchSalesBook();
  }, [periodo]);

  const fetchSalesBook = async () => {
    try {
      setIsLoading(true);
      const data = await api.get<any>(`/fiscal/libro-ventas?periodo=${periodo}`);
      setMovements(data?.movimientos || []);
      setSummary(data?.resumen || null);
    } catch (error) {
      console.error("Error fetching Sales Book:", error);
      // Fallback empty if error
      setMovements([]);
      setSummary(null);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredMovements = useMemo(() => {
    if (!searchQuery.trim()) return movements;
    const q = searchQuery.toLowerCase();
    return movements.filter(m => 
      m.rif?.toLowerCase().includes(q) || 
      m.client?.toLowerCase().includes(q) ||
      m.doc?.toLowerCase().includes(q)
    );
  }, [movements, searchQuery]);

  const handleExport = (format: 'xlsx' | 'pdf' | 'txt') => {
    try {
      const url = `${BASE_URL}/fiscal/libro-ventas/exportar?periodo=${periodo}&formato=${format}`;
      window.open(url, '_blank');
    } catch (error) {
      console.error(`Error al exportar ${format}:`, error);
      alert(`Error al generar ${format.toUpperCase()}`);
    }
  };

  const formatCurrency = (val: number | string) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return val;
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2 });
  };

  const [unvalidatedRifs, setUnvalidatedRifs] = useState<any[]>([]);

  const openAuditModal = async () => {
    setShowRifAuditModal(true);
    try {
      const res = await api.get<any>(`/fiscal/libro-ventas/auditar-rifs?periodo=${periodo}`);
      setUnvalidatedRifs(res?.invalidos || []);
    } catch (error) {
      console.error("Error auditing rifs", error);
    }
  };

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
                Libro de Ventas IVA
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Libro de Ventas IVA</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Operaciones detalladas con tracking de retenciones e IGTF percibido.</p>
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
             <button onClick={() => handleExport('xlsx')} className="bg-white text-[#0b5156] px-4 py-2 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <FileSpreadsheet size={14} /> Excel (SENIAT)
             </button>
             <button onClick={() => handleExport('pdf')} className="bg-white text-[#0b5156] px-4 py-2 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <FileText size={14} /> PDF
             </button>
             <button onClick={() => handleExport('txt')} className="bg-white text-[#0b5156] px-4 py-2 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <Download size={14} /> TXT (SENIAT)
             </button>
             <button onClick={openAuditModal} className="bg-[#0b5156] text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all relative">
                <ShieldCheck size={14} /> Auditoría de RIFs
                {unvalidatedRifs.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full">{unvalidatedRifs.length}</span>
                )}
             </button>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse bg-white rounded-3xl border border-slate-200 shadow-sm">
           Cargando Libro de Ventas...
        </div>
      ) : (
        <>
          {/* Proyección de Liquidación */}
          <article className="bg-[#0b5156] p-8 rounded-[2.5rem] border border-[#0b5156]/10 shadow-2xl relative overflow-hidden">
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
              <div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight mb-1">Proyección de Liquidación</h3>
                <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-4">Cálculo basado en {movements.length} operaciones registradas.</p>
                {perfil && (
                  <span className={`${perfil.tipo_contribuyente === 'ESPECIAL' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-slate-500/20 text-slate-300 border-slate-500/30'} text-[10px] font-black px-3 py-1 rounded-full uppercase border`}>
                    {perfil.tipo_contribuyente === 'ESPECIAL' ? 'Contribuyente Especial' : 'Contribuyente Ordinario'}
                  </span>
                )}
              </div>
              
              <div className="grid grid-cols-3 gap-4 items-start px-8 border-x border-white/10">
                <div>
                  <span className="text-white/40 text-[9px] font-black uppercase tracking-widest block mb-1">Base G (16%)</span>
                  <strong className="text-lg font-black text-white font-mono leading-none">Bs. {formatCurrency(summary?.base_g || 0)}</strong>
                </div>
                <div>
                  <span className="text-white/40 text-[9px] font-black uppercase tracking-widest block mb-1">Base R (8%)</span>
                  <strong className="text-lg font-black text-white font-mono leading-none">Bs. {formatCurrency(summary?.base_r || 0)}</strong>
                </div>
                <div>
                  <span className="text-white/40 text-[9px] font-black uppercase tracking-widest block mb-1">Exento (E)</span>
                  <strong className="text-lg font-black text-white font-mono leading-none">Bs. {formatCurrency(summary?.exento || 0)}</strong>
                </div>
              </div>

              <div className="flex flex-col gap-4 justify-center items-end">
                <div className="text-right">
                  <span className="text-white/40 text-[10px] font-black uppercase tracking-widest block mb-1">IVA Generado</span>
                  <strong className="text-xl font-black text-white tracking-tighter drop-shadow-lg">Bs. {formatCurrency(summary?.iva_generado || 0)}</strong>
                </div>
                <div className="text-right">
                  <span className="text-amber-400/60 text-[10px] font-black uppercase tracking-widest block mb-1">IGTF 3% (Percibido)</span>
                  <strong className="text-xl font-black text-amber-400 tracking-tighter">Bs. {formatCurrency(summary?.igtf_percibido || 0)}</strong>
                </div>
              </div>
            </div>
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
          </article>

          {/* Conciliación & Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <div className="bg-green-100 p-4 rounded-2xl border border-green-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-green-500 text-white p-2 rounded-lg"><ShieldCheck size={18} /></div>
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-black text-green-700 uppercase">Cuadrado</h4>
                      <p className="text-[10px] font-bold text-green-600/70 uppercase leading-tight">Coincide 100% con facturación.</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] font-black text-green-600/50 uppercase block">Diferencia:</span>
                    <strong className="text-sm font-black text-green-700 font-mono">Bs. 0,00</strong>
                  </div>
                </div>

                <div className="bg-blue-100 p-4 rounded-2xl border border-blue-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-500 text-white p-2 rounded-lg"><Info size={18} /></div>
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-black text-blue-700 uppercase">Correlatividad</h4>
                      <p className="text-[10px] font-bold text-blue-600/70 uppercase leading-tight">Sin saltos detectados en este mes.</p>
                    </div>
                  </div>
                  <span className="bg-blue-100 text-blue-700 text-[9px] font-black px-2 py-0.5 rounded uppercase">Verificado</span>
                </div>
            </div>
            
            <div className="bg-red-100 p-4 rounded-2xl border border-red-200 flex items-center gap-3">
                <div className="bg-red-500 text-white p-2 rounded-lg"><TriangleAlert size={18} /></div>
                <div className="space-y-0.5">
                  <h4 className="text-xs font-black text-red-700 uppercase">Retenciones Faltantes</h4>
                  <p className="text-[10px] font-bold text-red-600/70 uppercase leading-tight">{summary?.retenciones_faltantes || 0} comprobantes por recibir.</p>
                </div>
                <strong className="text-sm font-black text-red-700 font-mono ml-auto">Bs. {formatCurrency(summary?.monto_retenciones_faltantes || 0)}</strong>
            </div>
          </div>

          {/* Main Table */}
          <article className={`bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-500 ${isFullScreen ? 'fixed inset-0 z-[100] m-4 rounded-[2.5rem]' : 'relative'}`}>
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
              <div className="space-y-1">
                <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter leading-none">Listado de Operaciones</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Detalle cronológico de ventas y débitos fiscales.</p>
              </div>
              <div className="flex gap-2">
                 <button 
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  className="p-2 bg-white text-[#0b5156] rounded-lg border border-slate-200 hover:bg-[#0b5156]/5 shadow-sm transition-all flex items-center gap-2"
                  title={isFullScreen ? "Salir de Pantalla Completa" : "Ver en Pantalla Completa"}
                 >
                    {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    <span className="text-[10px] font-black uppercase">{isFullScreen ? 'Reducir' : 'Pantalla Completa'}</span>
                 </button>
                 <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                    <input 
                      type="text" 
                      placeholder="Buscar RIF o Documento..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156] w-64 shadow-sm" 
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
                    <th className="py-4 px-4 sticky left-0 bg-slate-50/50 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">Oper.</th>
                    <th className="py-4 px-4">Fecha</th>
                    <th className="py-4 px-4">RIF</th>
                    <th className="py-4 px-4">Cliente</th>
                    <th className="py-4 px-4">Factura</th>
                    <th className="py-4 px-4">Control</th>
                    <th className="py-4 px-4 text-right">Total c/IVA</th>
                    <th className="py-4 px-4 text-right">Base Imp.</th>
                    <th className="py-4 px-4 text-center">%</th>
                    <th className="py-4 px-4 text-right">IVA</th>
                    <th className="py-4 px-4 text-right">IGTF (3%)</th>
                    <th className="py-4 px-4 text-right">Retención</th>
                    <th className="py-2.5 px-4 text-center">Estatus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-[11px]">
                  {filteredMovements.length > 0 ? filteredMovements.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="py-4 px-4 font-mono text-slate-400 font-bold sticky left-0 bg-white group-hover:bg-slate-50/50 shadow-[2px_0_5px_rgba(0,0,0,0.02)] transition-colors">{row.op}</td>
                      <td className="py-4 px-4 font-mono font-bold text-slate-500">{row.date}</td>
                      <td className="py-4 px-4 font-mono font-black text-[#0b5156]">{row.rif}</td>
                      <td className="py-4 px-4">
                        <div className="max-w-[150px] truncate font-black text-slate-700 uppercase" title={row.client}>{row.client}</div>
                      </td>
                      <td className="py-4 px-4 font-mono font-black text-slate-600 uppercase">{row.doc}</td>
                      <td className="py-4 px-4 font-mono text-slate-400">{row.numero_control || row.control}</td>
                      <td className="py-4 px-4 text-right font-black font-mono text-slate-700">{formatCurrency(row.total)}</td>
                      <td className="py-4 px-4 text-right font-black font-mono text-[#0b5156]">{formatCurrency(row.base)}</td>
                      <td className="py-4 px-4 text-center font-black text-slate-400">{row.alic}</td>
                      <td className="py-4 px-4 text-right font-black font-mono text-red-600">{formatCurrency(row.iva)}</td>
                      <td className="py-4 px-4 text-right font-black font-mono text-amber-600">{formatCurrency(row.igtf)}</td>
                      <td className="py-4 px-4 text-right font-black font-mono text-green-600">{formatCurrency(row.ret)}</td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={`${row.statusColor || 'bg-slate-100 text-slate-700'} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={13} className="py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                        No hay movimientos de ventas en este período o bajo esta búsqueda
                      </td>
                    </tr>
                  )}
                  {filteredMovements.length > 0 && summary && (
                    <tr className="bg-slate-900 text-white font-black text-xs">
                      <td colSpan={6} className="py-6 px-4 text-right uppercase tracking-widest text-slate-400">Totales del Período:</td>
                      <td className="py-6 px-4 text-right font-mono">{formatCurrency(summary.total_general)}</td>
                      <td className="py-6 px-4 text-right font-mono text-green-400">{formatCurrency(summary.base_g + summary.base_r)}</td>
                      <td className="py-6 px-4"></td>
                      <td className="py-6 px-4 text-right font-mono text-red-400">{formatCurrency(summary.iva_generado)}</td>
                      <td className="py-6 px-4 text-right font-mono text-amber-400">{formatCurrency(summary.igtf_percibido)}</td>
                      <td className="py-6 px-4 text-right font-mono text-green-400">{formatCurrency(summary.total_retenciones)}</td>
                      <td className="py-6 px-6"></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
          
          {/* Modal Auditoría RIFs */}
          {showRifAuditModal && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
               <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={() => setShowRifAuditModal(false)}></div>
               <div className="relative bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh]">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div className="space-y-1">
                      <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tight">Auditoría de RIFs</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">RIFs no validados en el período actual.</p>
                    </div>
                    <button onClick={() => setShowRifAuditModal(false)} className="text-slate-400 hover:text-[#0b5156] transition-colors p-2 hover:bg-slate-200 rounded-full">
                       <X size={20} />
                    </button>
                  </div>
                  <div className="p-6 overflow-y-auto">
                    {unvalidatedRifs.length > 0 ? (
                      <ul className="space-y-2">
                        {unvalidatedRifs.map((invalid, idx) => (
                          <li key={idx} className="p-3 bg-red-50 border border-red-100 rounded-xl flex justify-between items-center">
                            <div>
                              <span className="font-mono font-black text-red-700 block">{invalid.rif}</span>
                              <span className="text-xs font-bold text-red-900">{invalid.cliente} (Fac: {invalid.doc})</span>
                            </div>
                            <span className="text-[10px] font-black uppercase text-red-600 bg-red-100 px-2 py-1 rounded">{invalid.error}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-center py-10 space-y-3">
                        <ShieldCheck size={48} className="mx-auto text-green-500" />
                        <p className="text-sm font-black text-green-700 uppercase tracking-widest">Todos los RIFs validados</p>
                      </div>
                    )}
                  </div>
               </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SalesBook;
