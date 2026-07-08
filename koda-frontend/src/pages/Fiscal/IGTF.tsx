import { useState, useEffect, useMemo } from 'react';
import { 
  Download, 
  Printer, 
  BarChart3, 
  ArrowLeft,
  CheckCircle2,
  Clock,
  Info,
  TrendingUp,
  DollarSign,
  Search,
  Filter,
  TriangleAlert,
  Calendar
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, BASE_URL } from '@/api/client';
import { useEmpresaPerfil } from '@/hooks/useEmpresaPerfil';

const IGTF = () => {
  const { perfil } = useEmpresaPerfil();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [periodo, setPeriodo] = useState(currentMonth);
  const [quincena, setQuincena] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchIGTF();
  }, [periodo, quincena]);

  const fetchIGTF = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<any>(`/fiscal/igtf?periodo=${periodo}&quincena=${quincena}`);
      setData(res || null);
    } catch (error) {
      console.error("Error fetching IGTF:", error);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportTXT = async () => {
    try {
      const token = localStorage.getItem('koda_token') || localStorage.getItem('sgd_token');
      const res = await fetch(`${BASE_URL}/fiscal/igtf/exportar?formato=txt&periodo=${periodo}&quincena=${quincena}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('Error al descargar archivo TXT');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `igtf_${periodo}_Q${quincena}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) {
      console.error("Error al exportar TXT:", error);
      alert("Error al generar TXT.");
    }
  };

  const formatCurrency = (val: number | string | undefined | null) => {
    if (val === undefined || val === null) return "0.00";
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return val;
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2 });
  };

  const perceptions = data?.percepciones || [];
  const summary = data?.resumen || {};

  const filteredPerceptions = useMemo(() => {
    if (!searchQuery.trim()) return perceptions;
    const q = searchQuery.toLowerCase();
    return perceptions.filter((p: any) => 
      p.client?.toLowerCase().includes(q) || 
      p.doc?.toLowerCase().includes(q)
    );
  }, [perceptions, searchQuery]);

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
                Impuesto IGTF (3%)
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Impuesto IGTF (3%)</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Seguimiento de percepciones por pagos en divisas y preparación de archivo TXT.</p>
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
             <button onClick={handleExportTXT} className="bg-[#0b5156] text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <Download size={14} /> Generar TXT SENIAT
             </button>
             <button onClick={() => window.print()} className="bg-white text-[#0b5156] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <Printer size={14} /> Imprimir Percepciones
             </button>
             <button className="bg-white text-[#0b5156] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <BarChart3 size={14} /> Auditoría USD vs BCV
             </button>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-32 bg-white rounded-3xl border border-slate-200 shadow-sm animate-in fade-in zoom-in duration-500">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-[#0b5156] rounded-full animate-spin mb-4"></div>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Cargando Datos de IGTF...</p>
        </div>
      ) : (
        <>
          {/* IGTF Summary Card */}
          <article className="bg-[#0b5156] p-8 rounded-[2.5rem] border border-[#0b5156]/10 shadow-2xl relative overflow-hidden">
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-8 items-start items-center">
              <div className="space-y-4">
                <div>
                  <span className="text-white/40 text-[9px] font-black uppercase tracking-widest block mb-1">Segmentación Quincenal</span>
                  <div className="flex bg-white/10 p-1 rounded-xl w-fit border border-white/5 backdrop-blur-sm">
                     <button 
                      onClick={() => setQuincena(1)}
                      className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${quincena === 1 ? 'bg-white text-teal-900 shadow-lg force-text-koda' : 'text-white/60 hover:text-white'}`}
                     >
                       1ra Quincena
                     </button>
                     <button 
                      onClick={() => setQuincena(2)}
                      className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${quincena === 2 ? 'bg-white text-teal-900 shadow-lg force-text-koda' : 'text-white/60 hover:text-white'}`}
                     >
                       2da Quincena
                     </button>
                  </div>
                </div>
                <strong className="text-sm font-black text-white uppercase tracking-tight block">Periodo: {summary?.rango_fechas || `${quincena === 1 ? '01' : '16'} al ${quincena === 1 ? '15' : 'Fin de mes'}`}</strong>
              </div>
              
              <div className="flex items-center gap-4 px-8 border-x border-white/10 h-full">
                <div className={`p-3 rounded-2xl ${summary?.estado === 'CERRADO' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                   {summary?.estado === 'CERRADO' ? <CheckCircle2 size={24} /> : <Clock size={24} />}
                </div>
                <div className="space-y-0.5">
                   <span className="text-white/40 text-[9px] font-black uppercase tracking-widest block">Estatus de Percepción</span>
                   <strong className={`text-sm font-black uppercase tracking-tight block ${summary?.estado === 'CERRADO' ? 'text-green-400' : 'text-amber-400'}`}>{summary?.estado === 'CERRADO' ? 'Cerrado / Listo' : 'Abierto / Pendiente'}</strong>
                   <p className="text-white/30 text-[9px] font-bold uppercase tracking-widest">Consolidado para Declaración</p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-white/40 text-[10px] font-black uppercase tracking-widest block mb-1">Total IGTF Quincenal</span>
                <strong className="text-4xl font-black text-white tracking-tighter drop-shadow-lg leading-none block">Bs. {formatCurrency(summary?.total_igtf_bs)}</strong>
                <div className="flex items-center justify-end gap-2 mt-2">
                   <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Base Imponible:</span>
                   <strong className="text-xs font-black text-white font-mono">${formatCurrency(summary?.base_usd)}</strong>
                </div>
              </div>
            </div>
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
          </article>

          {/* Metrics Grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            {[
              { label: 'Facturas en Divisa', value: summary?.count_facturas || 0, desc: '100% conciliadas', color: 'text-[#0b5156]', icon: <DollarSign size={16} className="text-green-500" /> },
              { label: 'Base Imponible (USD)', value: `$${formatCurrency(summary?.base_usd)}`, desc: 'Monto total recibido', color: 'text-green-600', icon: <TrendingUp size={16} className="text-green-400" /> },
              { label: 'Operaciones Exentas', value: `Bs. ${formatCurrency(summary?.operaciones_exentas)}`, desc: 'Pagos en Bs/Punto', color: 'text-slate-400', icon: <CheckCircle2 size={16} className="text-slate-300" /> },
              { label: 'Retenciones x Percibir', value: `Bs. ${formatCurrency(summary?.retenciones_por_percibir)}`, desc: 'Pendiente registro', color: 'text-red-600', icon: <TriangleAlert size={16} className="text-red-500" /> },
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
          <article className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/30">
              <div className="space-y-1">
                <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter leading-none">Listado de Percepciones</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Detalle de operaciones sujetas al 3% de IGTF en el periodo.</p>
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                 <div className="relative flex-1 md:flex-none">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                    <input 
                      type="text" 
                      placeholder="Buscar Cliente o Documento..." 
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

            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                    <th className="py-2.5 px-4">Fecha</th>
                    <th className="py-4 px-4">Documento</th>
                    <th className="py-4 px-4">Cliente</th>
                    <th className="py-4 px-4 text-right">Monto USD</th>
                    <th className="py-4 px-4 text-right">Monto BS</th>
                    <th className="py-4 px-4 text-right">IGTF (BS)</th>
                    <th className="py-2.5 px-4 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-[11px]">
                  {filteredPerceptions.length > 0 ? filteredPerceptions.map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-500">{row.date}</td>
                      <td className="py-4 px-4 font-mono font-black text-slate-400 uppercase">{row.doc}</td>
                      <td className="py-4 px-4 font-black text-slate-700 uppercase tracking-tight truncate max-w-[200px]" title={row.client}>{row.client}</td>
                      <td className="py-4 px-4 text-right font-black font-mono text-green-600">${formatCurrency(row.usd)}</td>
                      <td className="py-4 px-4 text-right font-black font-mono text-slate-600">{formatCurrency(row.bs)}</td>
                      <td className="py-4 px-4 text-right font-black font-mono text-[#0b5156]">{formatCurrency(row.igtf)}</td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={`${row.status === 'PERCIBIDO' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                        No hay percepciones IGTF registradas en esta quincena
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          {/* Info Card */}
          <div className="p-6 bg-blue-50 rounded-3xl border border-blue-100 flex gap-4">
            <Info size={24} className="text-blue-600 shrink-0" />
            <div className="space-y-1">
              <h4 className="text-sm font-black text-blue-800 uppercase">Declaración de IGTF</h4>
              <p className="text-xs text-blue-700 font-bold uppercase leading-relaxed opacity-80">
                El impuesto IGTF (3%) sobre percepciones en divisas se declara quincenalmente siguiendo el calendario de contribuyentes especiales. Asegúrese de que el archivo TXT coincida exactamente con lo reflejado en su libro de ventas.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};


export default IGTF;
