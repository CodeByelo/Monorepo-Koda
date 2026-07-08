import { 
  ArrowLeft,
  RefreshCw,
  Save,
  Workflow,
  ArrowRight,
  Cpu,
  History,
  ChevronRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';

const AdminInterface = () => {
  return (
    <div className="space-y-1.5 animate-in fade-in duration-500 pb-4">
      {/* Header */}
      <header className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <Link to="/contabilidad" className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-[#0b5156]/20 transition-all">
                <ArrowLeft size={10} /> Volver
              </Link>
              <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Contabilidad &gt; Configuración
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Interfaz Administrativa-Contable</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Definición de reglas de integración para la generación automática de asientos contables.</p>
          </div>
          <div className="flex gap-2">
             <button className="bg-white text-slate-500 px-6 py-2 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2">
                <RefreshCw size={14} /> Sincronizar
             </button>
             <button className="bg-[#0b5156] text-white px-8 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <Save size={14} /> Guardar Matriz
             </button>
          </div>
        </div>
      </header>

      {/* Main Matrix Card */}
      <article className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm overflow-hidden">
         <div className="mb-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
               <div className="bg-[#0b5156]/5 p-2 rounded-xl border border-[#0b5156]/10 text-[#0b5156]">
                  <Workflow size={18} />
               </div>
               <div className="space-y-0.5">
                  <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Matriz de Contabilización</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Configuración de destinos por evento administrativo.</p>
               </div>
            </div>
            <button className="text-[10px] font-black text-[#0b5156] uppercase flex items-center gap-1 hover:underline">
               Ver Log de Integración <ArrowRight size={12} />
            </button>
         </div>

         <div className="space-y-4">
            {/* VENTAS SECTION */}
            <section className="space-y-2">
               <div className="flex items-center gap-2">
                  <div className="h-[2px] bg-blue-500 w-8" />
                  <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Módulo de Ventas</h3>
               </div>
               
               <div className="grid grid-cols-1 gap-2 items-start">
                  {[
                    { title: 'Venta de Mercancía (Contado)', desc: 'Factura pagada al momento.' },
                    { title: 'IVA Débito Fiscal', desc: 'Impuesto generado en ventas.', readonlyDebe: true },
                  ].map((row, i) => (
                    <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-200 transition-all group">
                       <div className="space-y-0.5">
                          <strong className="text-xs font-black text-slate-700 uppercase block">{row.title}</strong>
                          <p className="text-[9px] font-bold text-slate-400 uppercase italic leading-none">{row.desc}</p>
                       </div>
                       <div className={`space-y-1 ${row.readonlyDebe ? 'opacity-35' : ''}`}>
                          <label className="text-[8px] font-black text-blue-600 uppercase tracking-widest block">Cuenta Deudora (DEBE)</label>
                          <select className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-black text-slate-400 outline-none focus:border-blue-500 appearance-none font-mono" defaultValue="" disabled={row.readonlyDebe}>
                             <option value="" disabled>Seleccione cuenta...</option>
                             <option value="-">-</option>
                          </select>
                       </div>
                       <div className="space-y-1">
                          <label className="text-[8px] font-black text-indigo-600 uppercase tracking-widest block">Cuenta Acreedora (HABER)</label>
                          <select className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-black text-slate-400 outline-none focus:border-indigo-500 appearance-none font-mono" defaultValue="">
                             <option value="" disabled>Seleccione cuenta...</option>
                          </select>
                       </div>
                    </div>
                  ))}
               </div>
            </section>

            {/* COMPRAS SECTION */}
            <section className="space-y-2">
               <div className="flex items-center gap-2">
                  <div className="h-[2px] bg-amber-500 w-8" />
                  <h3 className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Módulo de Compras</h3>
               </div>
               
               <div className="grid grid-cols-1 gap-2 items-start">
                  {[
                    { title: 'Compra de Inventario', desc: 'Recepción de mercancía comercial.' },
                    { title: 'IVA Crédito Fiscal', desc: 'Impuesto soportado en compras.', readonlyHaber: true },
                  ].map((row, i) => (
                    <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-amber-200 transition-all group">
                       <div className="space-y-0.5">
                          <strong className="text-xs font-black text-slate-700 uppercase block">{row.title}</strong>
                          <p className="text-[9px] font-bold text-slate-400 uppercase italic leading-none">{row.desc}</p>
                       </div>
                       <div className="space-y-1">
                          <label className="text-[8px] font-black text-blue-600 uppercase tracking-widest block">Cuenta Deudora (DEBE)</label>
                          <select className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-black text-slate-400 outline-none focus:border-amber-500 appearance-none font-mono" defaultValue="">
                             <option value="" disabled>Seleccione cuenta...</option>
                          </select>
                       </div>
                       <div className={`space-y-1 ${row.readonlyHaber ? 'opacity-30' : ''}`}>
                          <label className="text-[8px] font-black text-indigo-600 uppercase tracking-widest block">Cuenta Acreedora (HABER)</label>
                          <select className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-black text-slate-400 outline-none focus:border-amber-500 appearance-none font-mono" defaultValue="" disabled={row.readonlyHaber}>
                             <option value="" disabled>Seleccione cuenta...</option>
                             <option value="-">-</option>
                          </select>
                       </div>
                    </div>
                  ))}
               </div>
            </section>
         </div>

         {/* Logic Alert */}
         <div className="mt-4 p-4 bg-[#0b5156] rounded-xl text-white shadow-lg relative overflow-hidden group">
            <div className="relative z-10 flex gap-4">
               <div className="bg-white/10 p-2.5 rounded-xl border border-white/20 h-fit">
                  <Cpu size={24} className="text-white/60" />
               </div>
               <div className="space-y-1.5">
                  <h4 className="text-xs font-black uppercase tracking-tighter">Motor de Integración KODA</h4>
                  <p className="text-[10px] font-bold text-white/60 uppercase leading-relaxed max-w-4xl">
                     Cada vez que un usuario administrativo confirme una factura o pago, el sistema insertará un asiento en el <strong>Libro Diario</strong> con estatus <span className="bg-amber-500 text-white px-2 py-0.5 rounded text-[8px] font-black">PENDIENTE DE POSTEO</span>. El contador solo deberá revisar y mayorizar para afectar el saldo real.
                  </p>
               </div>
            </div>
            <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-white/5 rounded-full blur-[100px] group-hover:scale-110 transition-transform duration-1000" />
         </div>
      </article>

      {/* Audit Log Card */}
      <article className="p-3.5 bg-white rounded-xl border border-slate-200 flex items-center justify-between group cursor-pointer hover:bg-slate-50 transition-all">
         <div className="flex items-center gap-3">
            <History size={18} className="text-[#0b5156]" />
            <div className="space-y-0.5">
               <strong className="text-[10px] font-black text-[#0b5156] uppercase tracking-widest block leading-none">Log de Cambios en Interfaz</strong>
               <p className="text-[9px] font-bold text-slate-400 uppercase leading-none">Última modificación: 01/05/2026 por Auditor General.</p>
            </div>
         </div>
         <ChevronRight size={16} className="text-slate-300 group-hover:text-[#0b5156] group-hover:translate-x-1 transition-all" />
      </article>
    </div>
  );
};

export default AdminInterface;
