import {
  Search,
  Filter,
  ShieldAlert,
  Calendar,
  Printer
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';

interface LoteApi {
  lote: string;
  producto: string;
  cantidad: number;
  vence: string; // dd/mm/yyyy or '-'
}

interface LoteRow extends LoteApi {
  days: number | null;
  status: 'Vigente' | 'Próximo Venc.' | 'Vencido' | 'Sin Fecha';
  color: string;
  badge: string;
}

const parseVence = (vence: string): Date | null => {
  if (!vence || vence === '-') return null;
  const [dd, mm, yyyy] = vence.split('/').map(Number);
  if (!dd || !mm || !yyyy) return null;
  const d = new Date(yyyy, mm - 1, dd);
  return isNaN(d.getTime()) ? null : d;
};

const classify = (vence: string): { days: number | null; status: LoteRow['status']; color: string; badge: string } => {
  const fecha = parseVence(vence);
  if (!fecha) {
    return { days: null, status: 'Sin Fecha', color: 'border-slate-300', badge: 'bg-slate-100 text-slate-500' };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = fecha.getTime() - today.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (days < 0) {
    return { days, status: 'Vencido', color: 'border-red-500', badge: 'bg-red-100 text-red-700' };
  }
  if (days < 30) {
    return { days, status: 'Próximo Venc.', color: 'border-amber-500', badge: 'bg-amber-100 text-amber-700' };
  }
  return { days, status: 'Vigente', color: 'border-green-500', badge: 'bg-green-100 text-green-700' };
};

const LotExpiry = () => {
  const [lotes, setLotes] = useState<LoteRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [onlyExpired, setOnlyExpired] = useState(false);

  useEffect(() => {
    fetchLotes();
  }, []);

  const fetchLotes = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<LoteApi[]>('/inventario/lotes');
      const mapped = (res || []).map((l) => ({ ...l, ...classify(l.vence) }));
      setLotes(mapped);
    } catch (err) {
      console.error('Error fetching lotes:', err);
      setError('No se pudieron cargar los lotes. Intente nuevamente.');
      setLotes([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredLotes = useMemo(() => {
    return lotes.filter((l) => {
      if (onlyExpired && l.status !== 'Vencido') return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return l.lote.toLowerCase().includes(q) || l.producto.toLowerCase().includes(q);
      }
      return true;
    });
  }, [lotes, search, onlyExpired]);

  const stats = useMemo(() => {
    const activos = lotes.length;
    const proximos = lotes.filter((l) => l.status === 'Próximo Venc.').length;
    const vencidos = lotes.filter((l) => l.status === 'Vencido').length;
    const unidades = lotes.reduce((sum, l) => sum + (Number(l.cantidad) || 0), 0);
    return [
      { label: 'Lotes Activos', value: String(activos), desc: 'En todos los almacenes', color: 'text-slate-800' },
      { label: 'Próximos a Vencer', value: String(proximos), desc: 'Menos de 30 días', color: 'text-amber-500' },
      { label: 'Lotes Vencidos', value: String(vencidos), desc: 'Requieren retiro/ajuste', color: 'text-red-600' },
      { label: 'Unidades en Lotes', value: unidades.toLocaleString(), desc: 'Suma de cantidades registradas', color: 'text-[#0b5156]' },
    ];
  }, [lotes]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Lotes y Vencimiento</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-2xl">
              Seguimiento de lotes de producción, fechas de caducidad y alertas preventivas para garantizar la calidad y cumplimiento normativo.
            </p>
          </div>
          <div className="flex gap-3">
             <button
               onClick={() => window.print()}
               className="bg-white text-slate-500 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 flex items-center gap-2 tracking-widest shadow-sm hover:bg-slate-50"
             >
               <Printer size={14} /> Reporte de Caducidad
             </button>
             <button
               onClick={() => setOnlyExpired((v) => !v)}
               className={`px-8 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 tracking-widest shadow-lg transition-all ${
                 onlyExpired ? 'bg-red-600 text-white shadow-red-900/20 hover:bg-red-700' : 'bg-[#0b5156] text-white shadow-green-900/20 hover:bg-[#083a3d]'
               }`}
             >
               <Filter size={16} /> {onlyExpired ? 'Ver Todos' : 'Ver Vencidos'}
             </button>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-32">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">{stat.label}</p>
            <div>
              <strong className={`text-3xl font-black ${stat.color} tracking-tighter`}>{stat.value}</strong>
              <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">{stat.desc}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <article className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
           <div className="flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Trazabilidad de Lotes</h3>
              <div className="flex gap-3">
                 <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar lote o producto..."
                      className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156] w-56"
                    />
                 </div>
              </div>
           </div>

           {error && (
             <p className="text-xs font-black text-red-600 uppercase">{error}</p>
           )}

           <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                 <thead>
                    <tr className="text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                       <th className="py-4 px-6">Lote / Producto</th>
                       <th className="py-4 px-4 text-center">Vencimiento</th>
                       <th className="py-4 px-4 text-center">Stock</th>
                       <th className="py-4 px-4 text-center">Días Rest.</th>
                       <th className="py-4 px-4 text-center">Estado</th>
                       <th className="py-4 px-6 text-right">Acción</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {isLoading ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-xs font-black text-slate-400 uppercase tracking-widest">
                          Cargando lotes...
                        </td>
                      </tr>
                    ) : filteredLotes.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-xs font-black text-slate-400 uppercase tracking-widest">
                          No hay lotes registrados.
                        </td>
                      </tr>
                    ) : (
                      filteredLotes.map((l, i) => (
                        <tr key={`${l.lote}-${i}`} className={`group hover:bg-slate-50 transition-colors border-l-4 ${l.color}`}>
                           <td className="py-5 px-6">
                              <div className="flex flex-col">
                                 <span className="text-xs font-black text-[#0b5156] uppercase">{l.lote}</span>
                                 <span className="text-[9px] font-bold text-slate-800 uppercase tracking-tighter">{l.producto}</span>
                              </div>
                           </td>
                           <td className="py-5 px-4 text-center font-black text-slate-900">{l.vence}</td>
                           <td className="py-5 px-4 text-center font-bold text-slate-500">{l.cantidad}</td>
                           <td className={`py-5 px-4 text-center font-black ${l.days !== null && l.days < 10 ? 'text-red-600' : 'text-slate-900'}`}>
                              {l.days === null ? '—' : l.days}
                           </td>
                           <td className="py-5 px-4 text-center">
                              <span className={`${l.badge} text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter`}>{l.status}</span>
                           </td>
                           <td className="py-5 px-6 text-right">
                              <Link
                                to="/inventario/kardex"
                                className="bg-slate-50 text-slate-400 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border border-slate-200 hover:bg-white transition-all inline-flex items-center gap-2"
                              >
                                 Ver Kardex
                              </Link>
                           </td>
                        </tr>
                      ))
                    )}
                 </tbody>
              </table>
           </div>
        </article>

        <aside className="space-y-6">
           <article className="bg-[#0b1b1c] p-8 rounded-3xl border border-[#0b5156]/20 space-y-6 shadow-xl">
              <div className="flex items-center gap-2 text-white">
                 <ShieldAlert size={20} className="text-red-500" />
                 <h3 className="text-lg font-black uppercase tracking-tight">Riesgo de Caducidad</h3>
              </div>
              <div className="space-y-4">
                 {[
                   { l: 'Lotes Vencidos', v: `${stats[2].value} casos`, d: 'Retirar de inventario real.', c: 'bg-red-500/10 text-red-500' },
                   { l: 'Próximos a Vencer', v: `${stats[1].value} lotes`, d: 'Priorizar despacho (FEFO).', c: 'bg-amber-500/10 text-amber-500' },
                 ].map((alert, i) => (
                   <div key={i} className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-1">
                      <div className="flex justify-between items-start">
                         <span className="text-xs font-black text-white uppercase tracking-widest">{alert.l}</span>
                         <span className={`text-xs font-black ${alert.c.split(' ')[1]}`}>{alert.v}</span>
                      </div>
                      <p className="text-[9px] font-bold text-slate-500 uppercase leading-tight">{alert.d}</p>
                   </div>
                 ))}
              </div>
           </article>

           <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                 <Calendar size={18} className="text-[#0b5156]" />
                 <h4 className="text-sm font-black uppercase tracking-tight text-slate-800">Plan de Remate</h4>
              </div>
              <p className="text-xs font-bold text-slate-400 leading-relaxed uppercase">
                 Próximamente: generación automática de un plan de promoción/salida para los lotes cercanos a vencer.
              </p>
              <button
                disabled
                title="Función próximamente disponible."
                className="w-full bg-slate-100 text-slate-400 font-black py-4 rounded-2xl uppercase text-xs tracking-widest flex items-center justify-center gap-2 cursor-not-allowed"
              >
                 Próximamente
              </button>
           </article>
        </aside>
      </div>
    </div>
  );
};

export default LotExpiry;
