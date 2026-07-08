import { 
  Search, 
  Filter, 
  ArrowRight, 
  ShieldAlert, 
  Calendar,
  CheckCircle2,
  Activity
} from 'lucide-react';

const LotExpiry = () => {

  const stats = [
    { label: 'Lotes Activos', value: '142', desc: 'En todos los almacenes', color: 'text-slate-800' },
    { label: 'Próximos a Vencer', value: '8', desc: 'Menos de 30 días', color: 'text-amber-500' },
    { label: 'Lotes Vencidos', value: '3', desc: 'Requieren retiro/ajuste', color: 'text-red-600' },
    { label: 'Garantía de Frescura', value: '92%', desc: 'Índice de rotación FIFO', color: 'text-[#0b5156]' },
  ];

  const lots = [
    { id: 'LOT-2026-001', name: 'Insumo médico A-120', expiry: '15/06/2026', stock: 120, warehouse: 'Almacén Principal', days: 34, status: 'Vigente', color: 'border-green-500', badge: 'bg-green-100 text-green-700' },
    { id: 'LOT-2026-005', name: 'Arroz Blanco 1kg', expiry: '20/05/2026', stock: 450, warehouse: 'Sucursal Centro', days: 8, status: 'Próximo Venc.', color: 'border-amber-500', badge: 'bg-amber-100 text-amber-700' },
    { id: 'LOT-2025-089', name: 'Producto alimenticio B-440', expiry: '10/04/2026', stock: 24, warehouse: 'Depósito Alterno', days: -32, status: 'Vencido', color: 'border-red-500', badge: 'bg-red-100 text-red-700' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Lotes y Vencimiento</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-2xl">
              Seguimiento forense de lotes de producción, fechas de caducidad y alertas preventivas para garantizar la calidad y cumplimiento normativo.
            </p>
          </div>
          <div className="flex gap-3">
             <button className="bg-white text-slate-500 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 flex items-center gap-2 tracking-widest shadow-sm hover:bg-slate-50">
               <Calendar size={14} /> Reporte de Caducidad
             </button>
             <button className="bg-[#0b5156] text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 tracking-widest shadow-lg shadow-green-900/20 hover:bg-[#083a3d]">
               <Filter size={16} /> Ver Vencidos
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
                      placeholder="Buscar lote o producto..." 
                      className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156] w-56"
                    />
                 </div>
                 <button className="p-2 bg-slate-50 text-slate-400 rounded-xl border border-slate-200 hover:bg-white transition-all"><Filter size={14} /></button>
              </div>
           </div>

           <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                 <thead>
                    <tr className="text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                       <th className="py-4 px-6">Lote / Producto</th>
                       <th className="py-4 px-4 text-center">Vencimiento</th>
                       <th className="py-4 px-4 text-center">Stock</th>
                       <th className="py-4 px-4">Almacén</th>
                       <th className="py-4 px-4 text-center">Días Rest.</th>
                       <th className="py-4 px-4 text-center">Estado</th>
                       <th className="py-4 px-6 text-right">Acción</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {lots.map((l, i) => (
                      <tr key={i} className={`group hover:bg-slate-50 transition-colors border-l-4 ${l.color}`}>
                         <td className="py-5 px-6">
                            <div className="flex flex-col">
                               <span className="text-xs font-black text-[#0b5156] uppercase">{l.id}</span>
                               <span className="text-[9px] font-bold text-slate-800 uppercase tracking-tighter">{l.name}</span>
                            </div>
                         </td>
                         <td className="py-5 px-4 text-center font-black text-slate-900">{l.expiry}</td>
                         <td className="py-5 px-4 text-center font-bold text-slate-500">{l.stock}</td>
                         <td className="py-5 px-4 text-xs font-bold text-slate-400 uppercase">{l.warehouse}</td>
                         <td className={`py-5 px-4 text-center font-black ${l.days < 10 ? 'text-red-600' : 'text-slate-900'}`}>
                            {l.days}
                         </td>
                         <td className="py-5 px-4 text-center">
                            <span className={`${l.badge} text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter`}>{l.status}</span>
                         </td>
                         <td className="py-5 px-6 text-right">
                            <button className="bg-slate-50 text-slate-400 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border border-slate-200 hover:bg-white transition-all flex items-center gap-2 ml-auto">
                               Ver Kardex
                            </button>
                         </td>
                      </tr>
                    ))}
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
                   { l: 'Lotes Vencidos', v: '3 casos', d: 'Retirar de inventario real.', c: 'bg-red-500/10 text-red-500' },
                   { l: 'Próximos a Vencer', v: '8 lotes', d: 'Priorizar despacho (FEFO).', c: 'bg-amber-500/10 text-amber-500' },
                   { l: 'Garantía Fresh', v: '92%', d: 'Cumplimiento de rotación.', c: 'bg-[#0b5156]/10 text-green-500' }
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



           <article className="bg-[#0b5156] p-8 rounded-3xl text-white space-y-4 shadow-xl relative overflow-hidden group">
              <Activity size={140} className="absolute bottom-[-30px] right-[-30px] text-white/5 group-hover:text-white/10 transition-all" />
              <div className="relative z-10 space-y-4">
                 <div className="flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-green-400" />
                    <h4 className="text-sm font-black uppercase tracking-tight">Estrategia Logística</h4>
                 </div>
                 <p className="text-xs font-bold opacity-80 leading-relaxed uppercase">
                    Se recomienda realizar una <strong className="text-white underline">promoción de salida</strong> para los 8 lotes próximos a vencer para evitar pérdidas por merma.
                 </p>
                 <button className="w-full bg-white text-[#0b5156] font-black py-4 rounded-2xl uppercase text-xs tracking-widest flex items-center justify-center gap-2 hover:bg-slate-50 transition-all shadow-2xl">
                    Ver Plan de Remate <ArrowRight size={14} />
                 </button>
              </div>
           </article>
        </aside>
      </div>
    </div>
  );
};

export default LotExpiry;
