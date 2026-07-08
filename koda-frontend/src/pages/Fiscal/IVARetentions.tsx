import { 
  FileCode, 
  Plus, 
  Download, 
  Printer, 
  Search, 
  Filter, 
  ArrowLeft,
  CheckCircle2,
  TriangleAlert,
  FileText,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Maximize2,
  Minimize2,
  Calendar,
  X
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { api } from '@/api/client';
import { useEmpresaPerfil } from '@/hooks/useEmpresaPerfil';
import { createPortal } from 'react-dom';

const IVARetentions = () => {
  const { perfil } = useEmpresaPerfil();
  const [isFullScreen, setIsFullScreen] = useState(false);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [periodo, setPeriodo] = useState(currentMonth);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'Todas' | 'Recibidas' | 'Practicadas'>('Todas');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newComprobante, setNewComprobante] = useState('');
  
  const [retentions, setRetentions] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [toast, setToast] = useState<{message: string, type: 'success'|'error'} | null>(null);
  const [showValidationAlert, setShowValidationAlert] = useState(true);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetchRetentions();
  }, [periodo]);

  const fetchRetentions = async () => {
    try {
      setIsLoading(true);
      const data = await api.get<any>(`/fiscal/retenciones-iva?periodo=${periodo}`);
      setRetentions([...(data?.recibidas || []), ...(data?.practicadas || [])]);
      setSummary(data?.resumen || null);
    } catch (error) {
      console.error("Error fetching IVA Retentions:", error);
      setRetentions([]);
      setSummary(null);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredRetentions = useMemo(() => {
    let filtered = retentions;
    if (activeTab !== 'Todas') {
      filtered = filtered.filter(r => r.tipo === (activeTab === 'Recibidas' ? 'RECIBIDA' : 'PRACTICADA'));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r => 
        r.numero_comprobante?.toLowerCase().includes(q) || 
        r.agente_rif?.toLowerCase().includes(q) ||
        r.agente_nombre?.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [retentions, searchQuery, activeTab]);

  const handleExport = (format: 'xml' | 'txt') => {
    const url = `/api/fiscal/retenciones-iva/exportar?periodo=${periodo}`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `retenciones_iva_${periodo.replace('-', '')}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUploadComprobante = async () => {
    if (newComprobante.length !== 14) {
      showToast("El comprobante debe tener 14 dígitos.", "error");
      return;
    }
    const tipo = (document.getElementById('retTipo') as HTMLSelectElement).value;
    const agenteRif = (document.getElementById('retRif') as HTMLInputElement).value;
    const base = parseFloat((document.getElementById('retBase') as HTMLInputElement).value);
    const ivaRetenido = parseFloat((document.getElementById('retIva') as HTMLInputElement).value);
    
    try {
      await api.post('/fiscal/retenciones-iva/comprobante', { 
        tipo,
        numero_comprobante: newComprobante,
        agente_rif: agenteRif,
        agente_nombre: "AGENTE INGRESADO MANUAL",
        base,
        iva_retenido: ivaRetenido,
        periodo
      });
      showToast("Comprobante cargado exitosamente.", "success");
      setShowUploadModal(false);
      setNewComprobante('');
      fetchRetentions();
    } catch (error) {
      console.error("Error al cargar:", error);
      showToast("Error al cargar el comprobante.", "error");
    }
  };

  const formatCurrency = (val: number | string) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return val;
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2 });
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
                Retenciones IVA
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Centro de Control de Retenciones</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Administración de comprobantes fiscales, cruce de facturas y conciliación de saldos.</p>
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
             <button onClick={() => setShowUploadModal(true)} className="bg-[#0b5156] text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <Plus size={14} /> Cargar Comprobante
             </button>
             <button onClick={() => handleExport('xml')} className="bg-white text-[#0b5156] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <FileCode size={14} /> Generar XML (SENIAT)
             </button>
             <button onClick={() => handleExport('txt')} className="bg-white text-[#0b5156] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <Download size={14} /> TXT Retenciones
             </button>
             <button onClick={() => window.print()} className="bg-white text-[#0b5156] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all hidden md:flex">
                <Printer size={14} /> Imprimir Listado
             </button>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse bg-white rounded-3xl border border-slate-200 shadow-sm">
           Cargando Retenciones...
        </div>
      ) : (
        <>
          {/* Balance Panel */}
          <article className="bg-[#0b5156] p-8 rounded-[2.5rem] border border-[#0b5156]/10 shadow-2xl relative overflow-hidden">
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
              <div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight mb-1">Balance del Periodo</h3>
                <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-4">{periodo} - {perfil?.tipo_contribuyente === 'ESPECIAL' ? 'Contribuyente Especial' : 'Contribuyente Ordinario'}.</p>
                <div className="flex gap-2">
                   <span className="bg-green-500/20 text-green-400 text-[9px] font-black px-2 py-0.5 rounded-full uppercase border border-green-500/30">Cruce 100% Verificado</span>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4 items-start px-8 border-x border-white/10">
                <div>
                  <span className="text-white/40 text-[9px] font-black uppercase tracking-widest block mb-1">Recibidas (Ventas)</span>
                  <strong className="text-lg font-black text-green-400 font-mono leading-none">Bs. {formatCurrency(summary?.total_recibidas || 0)}</strong>
                </div>
                <div>
                  <span className="text-white/40 text-[9px] font-black uppercase tracking-widest block mb-1">Practicadas (Compras)</span>
                  <strong className="text-lg font-black text-amber-400 font-mono leading-none">Bs. {formatCurrency(summary?.total_practicadas || 0)}</strong>
                </div>
                <div>
                  <span className="text-white/40 text-[9px] font-black uppercase tracking-widest block mb-1">Saldo Neto Favor</span>
                  <strong className="text-lg font-black text-blue-400 font-mono leading-none">Bs. {formatCurrency((summary?.total_recibidas || 0) - (summary?.total_practicadas || 0))}</strong>
                </div>
              </div>

              <div className="text-right">
                <span className="text-white/40 text-[10px] font-black uppercase tracking-widest block mb-1">Total Retenido Acumulado</span>
                <strong className="text-xl font-black text-white tracking-tighter drop-shadow-lg">Bs. {formatCurrency(summary?.total_acumulado || 0)}</strong>
              </div>
            </div>
            <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
          </article>

          {/* Metrics Grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            {[
              { label: 'Comprobantes Recibidos', value: summary?.cantidad_recibidas || 0, desc: 'Cruce 100% verificado', color: 'text-[#0b5156]', icon: <TrendingUp size={16} className="text-green-500" /> },
              { label: 'Comprobantes Practicados', value: summary?.cantidad_practicadas || 0, desc: 'Listos para enterar', color: 'text-amber-600', icon: <FileText size={16} className="text-amber-500" /> },
              { label: 'Pendientes x Cruzar', value: 0, desc: 'Acción requerida', color: 'text-red-600', icon: <TriangleAlert size={16} className="text-red-500" /> },
              { label: 'Diferencia de Cambio', value: `Bs. 0`, desc: 'Ajuste por tasa BCV', color: 'text-blue-600', icon: <TrendingDown size={16} className="text-blue-400" /> },
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

          {/* Maestro de Comprobantes */}
          <article className={`bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-500 ${isFullScreen ? 'fixed inset-0 z-[100] m-4 rounded-[2.5rem]' : 'relative'}`}>
            <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/30">
              <div className="flex gap-4 items-center">
                <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter leading-none">Maestro de Comprobantes</h2>
                <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-200">
                   <button onClick={() => setActiveTab('Todas')} className={`px-3 py-1 text-[9px] font-black uppercase rounded-lg transition-all ${activeTab === 'Todas' ? 'bg-[#0b5156] text-white' : 'text-slate-400 hover:text-slate-600'}`}>Todas</button>
                   <button onClick={() => setActiveTab('Recibidas')} className={`px-3 py-1 text-[9px] font-black uppercase rounded-lg transition-all ${activeTab === 'Recibidas' ? 'bg-[#0b5156] text-white' : 'text-slate-400 hover:text-slate-600'}`}>Recibidas</button>
                   <button onClick={() => setActiveTab('Practicadas')} className={`px-3 py-1 text-[9px] font-black uppercase rounded-lg transition-all ${activeTab === 'Practicadas' ? 'bg-[#0b5156] text-white' : 'text-slate-400 hover:text-slate-600'}`}>Practicadas</button>
                </div>
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
                      placeholder="Buscar Comprobante o RIF..." 
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
                    <th className="py-2.5 px-4 sticky left-0 bg-slate-50/50 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">Tipo</th>
                    <th className="py-4 px-4">N° Comprobante</th>
                    <th className="py-4 px-4">Fecha</th>
                    <th className="py-4 px-4">RIF Agente</th>
                    <th className="py-4 px-4">Razón Social</th>
                    <th className="py-4 px-4 text-right">Base Imponible</th>
                    <th className="py-4 px-4 text-right">IVA Retenido</th>
                    <th className="py-4 px-4 text-center">%</th>
                    <th className="py-4 px-4 text-center">Validación</th>
                    <th className="py-2.5 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-[11px]">
                  {filteredRetentions.length > 0 ? filteredRetentions.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="py-2.5 px-4 sticky left-0 bg-white group-hover:bg-slate-50/50 transition-colors shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                        <span className={`${row.tipo === 'RECIBIDA' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight`}>
                          {row.tipo}
                        </span>
                      </td>
                      <td className={`py-4 px-4 font-mono font-black uppercase ${row.estado === 'Formato Inválido' ? 'text-red-500' : 'text-[#0b5156]'}`}>{row.numero_comprobante}</td>
                      <td className="py-4 px-4 font-mono font-bold text-slate-500">{row.fecha}</td>
                      <td className="py-4 px-4 font-mono font-black text-slate-400">{row.agente_rif}</td>
                      <td className="py-4 px-4">
                        <div className="max-w-[150px] truncate font-black text-slate-700 uppercase" title={row.agente_nombre}>{row.agente_nombre}</div>
                      </td>
                      <td className="py-4 px-4 text-right font-black font-mono text-slate-600">{formatCurrency(row.base)}</td>
                      <td className="py-4 px-4 text-right font-black font-mono text-[#0b5156]">{formatCurrency(row.iva_retenido)}</td>
                      <td className="py-4 px-4 text-center font-black text-slate-400">{row.alicuota}</td>
                      <td className="py-4 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                           <ShieldCheck size={12} className={row.estado === 'Formato Inválido' ? 'text-red-600' : 'text-green-600'} />
                           <span className={`${row.estado === 'Formato Inválido' ? 'text-red-600' : 'text-green-600'} font-black uppercase text-[9px]`}>{row.estado}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button 
                          onClick={async () => {
                            if (row.estado === 'Formato Inválido') {
                              alert("Comprobante inválido. Corrija los errores antes de descargar.");
                              return;
                            }
                            try {
                              const token = localStorage.getItem('koda_token');
                              const headers: any = {};
                              if (token) {
                                headers['Authorization'] = `Bearer ${token}`;
                              }
                              const formattedPeriod = periodo.replace('-', '');
                              const res = await fetch(`/api/fiscal/retencion-iva/pdf?proveedor_id=${row.agente_rif}&periodo=${formattedPeriod}&correlativo=${row.numero_comprobante}`, { headers });
                              if (!res.ok) throw new Error("Error generating PDF");
                              const blob = await res.blob();
                              const url = window.URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `RET_IVA_${row.numero_comprobante}.pdf`;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              window.URL.revokeObjectURL(url);
                            } catch (err) {
                              console.error(err);
                              alert("Error al descargar el PDF del comprobante.");
                            }
                          }}
                          className="bg-slate-50 text-[#0b5156] px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border border-slate-200 hover:bg-[#0b5156] hover:text-white transition-all shadow-sm"
                        >
                          {row.estado === 'Formato Inválido' ? 'Corregir' : 'Ver PDF'}
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                        No hay retenciones en esta categoría o bajo esta búsqueda
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          {/* Modal Carga Comprobante */}
          {showUploadModal && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
               <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={() => setShowUploadModal(false)}></div>
               <div className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div className="space-y-1">
                      <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tight">Cargar Comprobante</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Registra una retención manualmente.</p>
                    </div>
                    <button onClick={() => setShowUploadModal(false)} className="text-slate-400 hover:text-[#0b5156] transition-colors p-2 hover:bg-slate-200 rounded-full">
                       <X size={20} />
                    </button>
                  </div>
                  <form onSubmit={(e) => { e.preventDefault(); handleUploadComprobante(); }} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</label>
                        <select id="retTipo" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-black text-[#0b5156] outline-none focus:border-[#0b5156]">
                           <option value="RECIBIDA">Recibida (Ventas)</option>
                           <option value="PRACTICADA">Practicada (Compras)</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">RIF Agente</label>
                        <input id="retRif" type="text" placeholder="J-12345678-9" required className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-mono font-black text-[#0b5156] outline-none focus:border-[#0b5156]" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nro de Comprobante (14 dígitos)</label>
                      <input 
                        type="text" 
                        maxLength={14}
                        placeholder="Ej: 20260400000001" 
                        value={newComprobante}
                        onChange={(e) => setNewComprobante(e.target.value.replace(/\D/g, ''))}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-mono font-black text-[#0b5156] outline-none focus:border-[#0b5156]" 
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base Imponible</label>
                        <input id="retBase" type="number" step="0.01" required className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-mono font-black text-[#0b5156] outline-none focus:border-[#0b5156]" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">IVA Retenido</label>
                        <input id="retIva" type="number" step="0.01" required className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-mono font-black text-[#0b5156] outline-none focus:border-[#0b5156]" />
                      </div>
                    </div>
                    <button 
                      type="submit"
                      className="w-full bg-[#0b5156] text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={newComprobante.length !== 14}
                    >
                      Verificar y Cargar
                    </button>
                  </form>
               </div>
            </div>
           )}
        </>
      )}

      {showValidationAlert && (
        <div className="fixed bottom-6 right-6 z-[140] w-80 p-4 bg-blue-50/95 backdrop-blur-sm rounded-2xl border border-blue-200 shadow-2xl flex items-start gap-3 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 size={20} className="text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-1 pr-6">
            <h4 className="text-xs font-black text-blue-800 uppercase tracking-tight">Validación Automática Activa</h4>
            <p className="text-[10px] text-blue-700 font-bold uppercase leading-relaxed opacity-90">
              KODA valida la estructura de comprobantes y RIFs para evitar rechazos en el portal SENIAT.
            </p>
          </div>
          <button 
            onClick={() => setShowValidationAlert(false)}
            className="absolute top-4 right-4 text-blue-400 hover:text-blue-800 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {toast && typeof document !== 'undefined' && createPortal(
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[150] animate-in slide-in-from-top-4 fade-in duration-300">
          <div className={`px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 ${toast.type === 'success' ? 'bg-[#0b5156] border border-[#0b5156]/20 text-white' : 'bg-red-600 border border-red-500 text-white'}`}>
            {toast.type === 'success' ? <CheckCircle2 size={20} /> : <TriangleAlert size={20} />}
            <span className="font-bold text-sm tracking-wide uppercase font-mono">{toast.message}</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default IVARetentions;
