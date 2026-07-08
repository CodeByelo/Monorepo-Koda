import { 
  FileText, 
  ArrowLeft, 
  Calendar, 
  ShieldCheck, 
  TriangleAlert, 
  TrendingUp,
  Clock,
  ChevronRight,
  Info,
  DollarSign
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const FiscalObligations = () => {
  const [obligations, setObligations] = useState<any[]>([]);

  useEffect(() => {
    api.get<any>('/fiscal/obligaciones').then((res) => {
      const links: Record<string, string> = {
        'IVA Mensual': '/fiscal/declaracion-iva',
        'ISLR Retenciones': '/fiscal/retenciones-islr',
        'IGTF': '/fiscal/igtf',
        'ARC Anual': '/fiscal/arc',
      };
      setObligations((res?.obligaciones || []).map((o: any) => ({
        name: o.nombre,
        desc: o.nombre === 'ARC Anual' ? 'Declaración Informativa Anual' : `Vencimiento del período`,
        period: new Date().toLocaleDateString('es-VE', { month: 'long', year: 'numeric' }),
        deadline: o.vence,
        amount: o.nombre === 'IVA Mensual' ? 'Cálculo Automático' : '—',
        status: o.estado,
        statusColor: o.estado === 'AL DÍA' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700',
        link: links[o.nombre] || '/fiscal',
      })));
    }).catch(console.error);
  }, []);

  const activeCount = obligations.length;
  const pendingCount = obligations.filter(o => o.status === 'PENDIENTE').length;
  const completedCount = obligations.filter(o => o.status === 'AL DÍA').length;
  const nextVence = obligations.find(o => o.status === 'PENDIENTE')?.deadline || 'Al día';

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
                Obligaciones Fiscales
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Obligaciones Fiscales</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Control de vencimientos fiscales, declaraciones, pagos tributarios y soportes del período.</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
             <Link to="/fiscal/calendario" className="bg-[#0b5156] text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <Calendar size={14} /> Calendario Fiscal
             </Link>
             <button className="bg-white text-[#0b5156] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <FileText size={14} /> Manual de Opción
             </button>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {[
          { label: 'Obligaciones Activas', value: activeCount.toString(), desc: 'Registradas en sistema', color: 'text-[#0b5156]', icon: <FileText size={16} className="text-[#0b5156]" /> },
          { label: 'Pendientes Críticas', value: pendingCount.toString(), desc: 'Por declarar', color: 'text-red-600', icon: <TriangleAlert size={16} className="text-red-500" /> },
          { label: 'Pagos Fiscales', value: completedCount.toString(), desc: 'Completadas este mes', color: 'text-green-600', icon: <DollarSign size={16} className="text-green-500" /> },
          { label: 'Próximo Vencimiento', value: nextVence, desc: 'Revisión final de libros', color: 'text-amber-600', icon: <Clock size={16} className="text-amber-500" /> },
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

      {/* Pending Obligations Table */}
      <article className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
          <div className="space-y-1">
            <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter leading-none">Obligaciones Pendientes</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vencimientos y declaraciones que requieren seguimiento operativo.</p>
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-2.5 px-4">Obligación</th>
                <th className="py-4 px-4">Período</th>
                <th className="py-4 px-4 text-center">Vence</th>
                <th className="py-4 px-4 text-right">Monto Estimado</th>
                <th className="py-4 px-4 text-center">Estado</th>
                <th className="py-2.5 px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-[11px]">
              {obligations.length > 0 ? obligations.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors group">
                  <td className="py-2.5 px-4">
                    <div className="flex flex-col">
                      <span className="font-black text-[#0b5156] uppercase">{row.name}</span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">{row.desc}</span>
                    </div>
                  </td>
                  <td className="py-4 px-4 font-bold text-slate-500 uppercase">{row.period}</td>
                  <td className="py-4 px-4 text-center font-mono font-bold text-slate-400">{row.deadline}</td>
                  <td className="py-4 px-4 text-right font-black font-mono text-slate-700">{row.amount}</td>
                  <td className="py-4 px-4 text-center">
                    <span className={`${row.statusColor} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <Link to={row.link} className="text-[#0b5156] font-black uppercase hover:underline flex items-center gap-1 justify-end ml-auto">
                      Gestionar <ChevronRight size={14} />
                    </Link>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                    No hay obligaciones configuradas o registradas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <div className="grid grid-cols-1 gap-6 items-start">
        {/* Soportes Requeridos */}
        <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <div className="space-y-1">
              <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Soportes Requeridos</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Documentos que deben estar completos antes de declarar.</p>
            </div>
            <ShieldCheck className="text-green-500/20" size={32} />
          </div>
          
          <div className="space-y-4">
             {[
               { title: 'Libro de ventas IVA', desc: 'Facturas, notas y débito fiscal', status: pendingCount === 0 ? 'Listo' : 'Pendiente', color: pendingCount === 0 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500' },
               { title: 'Libro de compras IVA', desc: 'Crédito fiscal y facturas proveedor', status: pendingCount === 0 ? 'Listo' : 'Pendiente', color: pendingCount === 0 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500' },
               { title: 'Comprobantes de retención', desc: 'IVA e ISLR del período', status: pendingCount === 0 ? 'Listo' : 'Pendiente', color: pendingCount === 0 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500' },
             ].map((s, i) => (
               <div key={i} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:bg-white hover:border-[#0b5156]/20 transition-all">
                  <div className="space-y-0.5">
                    <strong className="text-xs font-black text-[#0b5156] uppercase leading-tight group-hover:text-[#0b5156]">{s.title}</strong>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{s.desc}</p>
                  </div>
                  <span className={`${s.color} px-2 py-0.5 rounded text-[9px] font-black uppercase`}>{s.status}</span>
               </div>
             ))}
          </div>
        </article>


      </div>

      {/* Resumen de Cierre */}
      <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter mb-8 leading-none">Resumen de Cierre Fiscal</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
           <div className="p-6 bg-red-50 rounded-2xl border border-red-100 space-y-2">
              <span className="bg-red-500 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase">Atención</span>
              <strong className="text-lg font-black text-red-700 block uppercase tracking-tight">{pendingCount} Obligaciones Críticas</strong>
              <p className="text-[10px] font-bold text-red-600/70 uppercase leading-relaxed">Requieren revisión inmediata antes de su vencimiento legal.</p>
           </div>
           
           <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100 space-y-2">
              <span className="bg-blue-500 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase">Caja</span>
              <strong className="text-lg font-black text-blue-700 block uppercase tracking-tight">Estimados Pendientes</strong>
              <p className="text-[10px] font-bold text-blue-600/70 uppercase leading-relaxed">Monto fiscal proyectado para el pago de este período.</p>
           </div>

           <div className="p-6 bg-green-50 rounded-2xl border border-green-100 space-y-2">
              <span className="bg-green-500 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase">Control</span>
              <strong className="text-lg font-black text-green-700 block uppercase tracking-tight">{completedCount} Encaminadas</strong>
              <p className="text-[10px] font-bold text-green-600/70 uppercase leading-relaxed">Obligaciones con soporte suficiente para un cierre exitoso.</p>
           </div>
        </div>
      </section>
    </div>
  );
};

export default FiscalObligations;
