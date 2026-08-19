import { 
  FileText, 
  BookOpen, 
  FilePlus, 
  Calendar, 
  CircleAlert, 
  TrendingUp, 
  TrendingDown, 
  CircleCheck,
  Clock,
  ArrowRight,
  Calendar as CalendarIcon
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { useEmpresaPerfil } from '@/hooks/useEmpresaPerfil';

const FiscalDashboard = () => {
  const { perfil } = useEmpresaPerfil();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [periodo, setPeriodo] = useState(currentMonth);
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, [periodo]);

  const fetchDashboard = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<any>(`/fiscal/dashboard?periodo=${periodo}`);
      setData(res || null);
    } catch (error) {
      console.error("Error fetching fiscal dashboard:", error);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualFiscal = () => {
    // Simulamos la descarga/apertura del PDF oficial de lineamientos fiscales
    window.open('https://declaraciones.seniat.gob.ve/portal/page/portal/PORTAL_SENIAT', '_blank');
  };

  const formatCurrency = (val: number | string | undefined | null) => {
    if (val === undefined || val === null) return "0.00";
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return val;
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2 });
  };

  const metrics = data?.metrics || [];

  return (
    <div className="space-y-3 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Contabilidad &gt; Fiscal
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase">Panel SENIAT (Fiscal)</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Control de impuestos, retenciones, libros legales y calendarios de declaración.</p>
          </div>
          <div className="flex gap-3 items-center flex-wrap">
             <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mr-2">
                <CalendarIcon size={14} className="text-slate-400" />
                <input 
                  type="month" 
                  value={periodo} 
                  onChange={(e) => setPeriodo(e.target.value)}
                  className="bg-transparent text-xs font-black text-[#0b5156] outline-none"
                />
             </div>
             <button 
                onClick={handleManualFiscal}
                className="bg-white text-[#0b5156] px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <FileText size={14} /> Manual Fiscal
             </button>
             <Link to="/fiscal/libro-ventas" className="bg-white text-[#0b5156] px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <BookOpen size={14} /> Libro Ventas
             </Link>
             <Link to="/fiscal/libro-compras" className="bg-white text-[#0b5156] px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <BookOpen size={14} /> Libro Compras
             </Link>
             <Link to="/fiscal/declaracion-iva" className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <FilePlus size={14} /> Generar Declaración
             </Link>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-32 bg-white rounded-3xl border border-slate-200 shadow-sm animate-in fade-in zoom-in duration-500">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-[#0b5156] rounded-full animate-spin mb-4"></div>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Cargando Dashboard Fiscal...</p>
        </div>
      ) : (
        <>
          {/* Metrics Grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            {metrics.map((m: any, i: number) => (
              <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24">
                <div className="flex justify-between items-start">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest leading-tight w-2/3">{m.label}</p>
                  {i === 0 ? <TrendingUp className="text-red-500" size={16} /> : 
                   i === 1 ? <TrendingDown className="text-green-500" size={16} /> : 
                   i === 2 ? <CircleCheck className="text-slate-300" size={16} /> : 
                   <Clock className="text-amber-500" size={16} />}
                </div>
                <div className="space-y-1">
                  <strong className={`text-xl font-black ${m.color || 'text-slate-600'} tracking-tighter font-mono`}>{m.value}</strong>
                  <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">{m.desc}</p>
                </div>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Calendario Fiscal */}
            <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Calendario Fiscal SENIAT</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Obligaciones basadas en el último dígito del RIF ({perfil?.rif?.slice(-1) || '0'}).</p>
                </div>
                <Calendar className="text-[#0b5156]/20" size={32} />
              </div>
              
              <div className="space-y-4">
                {data?.calendario && data.calendario.length > 0 ? data.calendario.map((cal: any, i: number) => (
                  <div key={i} className="group p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-start gap-4 transition-all hover:bg-white hover:border-[#0b5156]/20">
                    <div className="flex gap-4">
                      <span className={`text-white text-[10px] font-black px-3 py-1.5 rounded-lg uppercase h-fit ${cal.tipo === 'IVA' ? 'bg-amber-500' : cal.tipo === 'ISLR' ? 'bg-blue-500' : 'bg-slate-400'}`}>{cal.fecha_label}</span>
                      <div className="space-y-1">
                        <strong className="text-sm font-black text-[#0b5156] uppercase leading-tight">{cal.titulo}</strong>
                        <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed">{cal.descripcion}</p>
                        {cal.link && (
                          <Link to={cal.link} className="text-[10px] font-black text-[#0b5156] uppercase flex items-center gap-1 hover:underline mt-2">
                            {cal.link_text || 'Ir a Declaración'} <ArrowRight size={10} />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                )) : (
                    <div className="group p-8 text-center bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-center items-center gap-3">
                      <Calendar size={32} className="text-slate-300" />
                      <div className="space-y-1">
                        <strong className="text-sm font-black text-slate-500 uppercase tracking-widest">Sin Información</strong>
                        <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed">No hay eventos en el calendario fiscal para este periodo.</p>
                      </div>
                    </div>
                )}
              </div>
            </article>

            {/* Resumen de Libros */}
            <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full">
              <div className="flex justify-between items-start mb-8">
                <div className="space-y-1">
                  <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Auditoría de Libros ({periodo})</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumen en bolívares para la declaración (DP-31).</p>
                </div>
                <Link to="/reportes/libro-fiscal" className="bg-slate-50 text-[#0b5156] px-4 py-1.5 rounded-lg text-[10px] font-black uppercase border border-slate-200 hover:bg-white transition-all">
                  Ver Resumen Completo
                </Link>
              </div>
              
              <div className="flex-1 flex flex-col justify-center space-y-8">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-black text-[#0b5156] uppercase tracking-tight">Débitos Fiscales (Ventas)</span>
                    <strong className="text-lg font-black text-red-600 font-mono">Bs. {formatCurrency(data?.resumen_libros?.debitos_fiscales)}</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Base Imponible Gravable</span>
                    <span className="text-[11px] font-black text-slate-600 font-mono">Bs. {formatCurrency(data?.resumen_libros?.base_ventas)}</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden mt-2">
                    <div className="bg-red-500 h-full transition-all" style={{ width: `${Math.min(100, ((data?.resumen_libros?.debitos_fiscales || 0) / (data?.resumen_libros?.base_ventas || 1)) * 100 * 6.25)}%` }} />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-black text-[#0b5156] uppercase tracking-tight">Créditos Fiscales (Compras)</span>
                    <strong className="text-lg font-black text-green-600 font-mono">Bs. {formatCurrency(data?.resumen_libros?.creditos_fiscales)}</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Base Imponible Gravable</span>
                    <span className="text-[11px] font-black text-slate-600 font-mono">Bs. {formatCurrency(data?.resumen_libros?.base_compras)}</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden mt-2">
                    <div className="bg-green-500 h-full transition-all" style={{ width: `${Math.min(100, ((data?.resumen_libros?.creditos_fiscales || 0) / (data?.resumen_libros?.base_compras || 1)) * 100 * 6.25)}%` }} />
                  </div>
                </div>

                <div className="p-5 bg-[#0b5156]/5 rounded-2xl border border-[#0b5156]/10">
                  <div className="flex justify-between items-center">
                    <div className="space-y-1">
                      <span className="text-xs font-black text-[#0b5156] uppercase tracking-tight block">Retenciones de IVA a favor</span>
                      <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">Soportadas por compras a Contribuyentes Especiales</p>
                    </div>
                    <strong className="text-xl font-black text-green-600 font-mono">Bs. {formatCurrency(data?.resumen_libros?.retenciones_soportadas)}</strong>
                  </div>
                </div>
              </div>

              <div className="mt-8 p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
                <CircleAlert size={18} className="text-amber-600 shrink-0" />
                <p className="text-[10px] font-bold text-amber-700 uppercase leading-relaxed">
                  Recuerde que el cierre fiscal del período {periodo} debe realizarse antes del día 10 del mes siguiente para garantizar la exactitud de los libros.
                </p>
              </div>
            </article>
          </div>
        </>
      )}

      {/* Quick Links Section */}
      <article className="bg-[#0b5156] p-5 rounded-2xl border border-[#0b5156]/10 shadow-2xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="space-y-2">
            <h3 className="text-xl font-black text-white uppercase tracking-tighter">Gestión Fiscal Inteligente</h3>
            <p className="text-white/60 text-xs font-bold uppercase tracking-tight max-w-md">Optimice su cumplimiento tributario con nuestras herramientas automatizadas de cálculo y reporte.</p>
          </div>
          <div className="flex gap-3 flex-wrap justify-center">
            <Link to="/fiscal/retenciones-iva" className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 px-4 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all backdrop-blur-sm border border-white/10">Retenciones IVA</Link>
            <Link to="/fiscal/retenciones-islr" className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 px-4 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all backdrop-blur-sm border border-white/10">Retenciones ISLR</Link>
            <Link to="/fiscal/igtf" className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 px-4 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all backdrop-blur-sm border border-white/10">IGTF</Link>
            <Link to="/fiscal/obligaciones" className="bg-white text-teal-900 px-6 py-2 px-4 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-xl force-text-koda">Todas las Obligaciones</Link>
          </div>
        </div>
        <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
      </article>
    </div>
  );
};

export default FiscalDashboard;
