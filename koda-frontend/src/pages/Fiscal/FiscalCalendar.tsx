import { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  RefreshCw, 
  AlertCircle,
  Clock,
  CheckCircle2,
  CalendarDays,
  ShieldCheck,
  TrendingUp,
  ExternalLink
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { useEmpresaPerfil } from '@/hooks/useEmpresaPerfil';

const FiscalCalendar = () => {
  const { perfil } = useEmpresaPerfil();
  const [deadlines, setDeadlines] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const rifDigit = perfil?.rif ? Number(perfil.rif.slice(-1)) : 0;

  const fetchCalendario = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<any>('/fiscal/calendario');
      setDeadlines(res?.obligaciones || []);
      setMetrics(res?.metricas || null);
    } catch (error) {
      console.error("Error fetching fiscal calendar:", error);
      setDeadlines([]);
      setMetrics(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendario();
  }, [rifDigit]);

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
                Control de Vencimientos
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Calendario de Obligaciones</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Seguimiento de fechas de declaración para Contribuyentes Especiales.</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end items-center">
             <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 flex items-center gap-3 mr-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Último Dígito RIF:</span>
                <strong className="text-xs font-black text-[#0b5156]">{rifDigit}</strong>
             </div>
             <button onClick={fetchCalendario} className="bg-[#0b5156] text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} /> Sincronizar
             </button>
             <Link to="/fiscal/obligaciones" className="bg-white text-[#0b5156] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <ShieldCheck size={14} /> Ver Deuda
             </Link>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-32 bg-white rounded-3xl border border-slate-200 shadow-sm animate-in fade-in zoom-in duration-500">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-[#0b5156] rounded-full animate-spin mb-4"></div>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Cargando Calendario Fiscal...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 space-y-3">
            <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter leading-none">Próximos Vencimientos</h2>
                <CalendarDays className="text-slate-200" size={32} />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                 {deadlines.length > 0 ? deadlines.map((dl: any, i: number) => (
                   <div 
                    key={i} 
                    className={`p-3 rounded-xl border-l-4 transition-all hover:scale-[1.02] ${dl.urgente ? 'bg-red-50 border-red-500 border-y border-r border-y-red-100 border-r-red-100' : 'bg-blue-50 border-blue-500 border-y border-r border-y-blue-100 border-r-blue-100'}`}
                   >
                      <div className="flex justify-between items-start mb-3">
                        <span className={`text-[9px] font-black uppercase tracking-widest ${dl.urgente ? 'text-red-600' : 'text-blue-600'}`}>
                          {dl.urgente ? `⚠️ Vence Pronto` : dl.mes}
                        </span>
                        {dl.urgente ? <AlertCircle size={14} className="text-red-500" /> : <Clock size={14} className="text-blue-500" />}
                      </div>
                      <strong className="text-sm font-black text-[#0b5156] uppercase leading-tight block mb-2" title={dl.nombre}>{dl.nombre}</strong>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fecha límite: {dl.fecha_limite} (Terminal {rifDigit})</p>
                      <div className="mt-4 pt-4 border-t border-black/5 flex items-center justify-between">
                         <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${dl.urgente ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                           {dl.estado || (dl.urgente ? 'PENDIENTE' : 'PROGRAMADO')}
                         </span>
                         {dl.link && (
                           <Link to={dl.link} className="text-[10px] font-black text-[#0b5156] uppercase flex items-center gap-1 hover:underline">
                             Declarar <ExternalLink size={10} />
                           </Link>
                         )}
                      </div>
                   </div>
                 )) : (
                   <div className="col-span-1 md:col-span-2 p-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                     No hay vencimientos próximos registrados para este período
                   </div>
                 )}
              </div>
            </article>
          </div>

          <aside className="space-y-3">
            <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-lg font-black text-[#0b5156] uppercase tracking-tight mb-8">Estatus de Cumplimiento</h2>
              <div className="space-y-3">
                 <div className="flex justify-between items-end border-b border-slate-50 pb-4">
                   <div className="space-y-1">
                     <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Declaraciones al día</span>
                     <p className="text-xs font-bold text-slate-500 uppercase leading-tight">Trimestre actual</p>
                   </div>
                   <strong className="text-xl font-black text-green-600 tracking-tighter">{metrics?.porcentaje_cumplimiento || '--'}</strong>
                 </div>
                 
                 <div className="flex justify-between items-end border-b border-slate-50 pb-4">
                   <div className="space-y-1">
                     <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sanciones detectadas</span>
                     <p className="text-xs font-bold text-slate-500 uppercase leading-tight">Revisiones del SENIAT</p>
                   </div>
                   <strong className="text-xl font-black text-[#0b5156] tracking-tighter">{metrics?.sanciones || '--'}</strong>
                 </div>
              </div>
              <div className="mt-8 p-4 bg-green-50 rounded-2xl border border-green-100 flex gap-3">
                 <CheckCircle2 size={18} className="text-green-600 shrink-0" />
                 <p className="text-[10px] font-bold text-green-700 uppercase leading-relaxed">
                   Evaluación de cumplimiento en base a las obligaciones procesadas en el periodo actual.
                 </p>
              </div>
            </article>
          </aside>
        </div>
      )}
    </div>
  );
};

export default FiscalCalendar;
