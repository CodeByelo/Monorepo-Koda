import { useEffect, useMemo, useState } from 'react';
import { Search, ShieldCheck, Maximize2, Minimize2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';

const money = (value: unknown) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

const Requisitions = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    api.get<any[]>('/compras/requisiciones')
      .then((data) => setRequisitions(data || []))
      .catch((error) => console.error('Error fetching requisitions:', error))
      .finally(() => setIsLoading(false));
  }, []);

  const stats = useMemo(() => {
    const pending = requisitions.filter((r) => (r.estado || '').toUpperCase().includes('PENDIENTE')).length;
    const critical = requisitions.filter((r) => (r.prioridad || '').toUpperCase().includes('CRIT')).length;
    const converted = requisitions.filter((r) => (r.estado || '').toUpperCase().includes('CONVERT')).length;
    return [
      { label: 'Solicitudes Abiertas', value: String(requisitions.length), desc: 'Registradas en base de datos', color: 'text-[#0b5156]' },
      { label: 'Por Aprobar', value: String(pending), desc: 'Requieren decisión', color: 'text-slate-500' },
      { label: 'Críticas', value: String(critical), desc: 'Impactan operación', color: 'text-red-600' },
      { label: 'Convertidas en OC', value: String(converted), desc: 'Ya generaron compra', color: 'text-[#43584b]' },
    ];
  }, [requisitions]);

  const criticalCount = Number(stats[2].value);

  return (
    <div className="space-y-5 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-8 rounded-3xl border border-[#bdafa1]/20 shadow-sm">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Solicitudes de Compra</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight max-w-2xl">
              Gestión de necesidades internas y reposición de inventario con datos reales del sistema.
            </p>
          </div>
          <Link to="nueva" className="bg-[#0b5156] text-white px-8 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-[#0b5156]/20">
            Crear Solicitud
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-slate-200 flex flex-col justify-between shadow-sm min-h-[160px]">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest leading-snug">{stat.label}</p>
            <div className="mt-4">
              <strong className={`text-4xl font-black ${stat.color} tracking-tighter font-mono`}>{stat.value}</strong>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 leading-tight">{stat.desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Alerta de Validación Inteligente movida arriba */}
      <div className={`flex items-center gap-3 p-4 rounded-2xl border text-xs font-bold uppercase tracking-widest ${criticalCount > 0 ? 'bg-amber-50/50 border-amber-200 text-amber-700' : 'bg-green-50/50 border-green-100 text-green-700'}`}>
         <ShieldCheck size={18} className={`shrink-0 ${criticalCount > 0 ? 'text-amber-600' : 'text-green-600'}`} />
         <span>Validación Inteligente: {criticalCount > 0 ? `${criticalCount} solicitud(es) crítica(s) registradas que requieren atención.` : 'No existen solicitudes críticas registradas.'}</span>
      </div>

      <section className={`min-w-0 ${isExpanded ? 'fixed inset-4 z-50 bg-slate-100 p-6 overflow-hidden rounded-3xl' : ''}`}>
        <article className={`bg-white border border-slate-200 shadow-sm overflow-hidden ${isExpanded ? 'flex flex-col h-full rounded-3xl shadow-2xl' : 'rounded-3xl'}`}>
            <div className="p-8 flex justify-between items-center bg-slate-50/50 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-black text-slate-800 tracking-tighter uppercase">Solicitudes Recientes</h2>
                <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-widest">Requerimientos registrados</p>
              </div>
              <div className="flex gap-4 items-center">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input type="text" placeholder="BUSCAR REGISTRO..." className="bg-white border border-slate-200 pl-9 pr-4 py-2 rounded-xl text-sm font-black text-slate-800 focus:outline-none focus:border-[#0b5156] uppercase w-64" />
                </div>
                <button onClick={() => setIsExpanded(!isExpanded)} className="p-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl">
                  {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
              </div>
            </div>
            <div className={`overflow-x-auto no-scrollbar ${isExpanded ? 'flex-1' : ''}`}>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/30">
                    <th className="py-5 px-8">ID Solicitud</th>
                    <th className="py-5 px-6">Área Origen</th>
                    <th className="py-5 px-6 text-right">Estimado</th>
                    <th className="py-5 px-6 text-center">Prioridad</th>
                    <th className="py-5 px-6">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {isLoading ? (
                    <tr><td colSpan={5} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cargando requisiciones...</td></tr>
                  ) : requisitions.length === 0 ? (
                    <tr><td colSpan={5} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">No hay requisiciones registradas.</td></tr>
                  ) : requisitions.map((req, i) => (
                    <tr key={i} className="group hover:bg-[#bdafa1]/5 transition-colors">
                      <td className="py-6 px-8">
                        <span className="text-sm font-black text-slate-800 uppercase font-mono">{req.numero || req.id}</span>
                      </td>
                      <td className="py-6 px-6 text-sm font-black text-slate-500 uppercase">{req.area || req.solicitante || '-'}</td>
                      <td className="py-6 px-6 text-sm font-black text-slate-800 text-right font-mono">{money(req.monto || req.monto_estimado)}</td>
                      <td className="py-6 px-6 text-center">
                        <span className="text-xs font-black px-2 py-0.5 rounded uppercase border bg-slate-100 text-slate-700">{req.prioridad || 'NORMAL'}</span>
                      </td>
                      <td className="py-6 px-6 text-sm font-black text-slate-500 uppercase">{req.estado || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        </article>
      </section>
    </div>
  );
};

export default Requisitions;
