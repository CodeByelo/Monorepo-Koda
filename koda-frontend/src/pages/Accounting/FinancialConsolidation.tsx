import { 
  ArrowLeft,
  Zap,
  Printer,
  Link2,
  Globe
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';

const FinancialConsolidation = () => {
  const [consolidationData, setConsolidationData] = useState<any[]>([]);

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
                Contabilidad &gt; Grupo Empresarial
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Consolidación Inteligente</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Generación de estados financieros consolidados con eliminación inter-compañía.</p>
          </div>
          <div className="flex gap-2">
             <button className="bg-[#0b5156] text-white px-8 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <Zap size={14} /> Ejecutar Eliminaciones
             </button>
             <button className="bg-white text-slate-500 px-6 py-2 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-slate-50 transition-all">
                <Printer size={14} /> Exportar Balance
             </button>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-32 hover:border-[#0b5156]/20 transition-all">
            <div className="space-y-1">
               <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Activo Bruto (Holding)</h3>
               <strong className="text-2xl font-black text-[#0b5156] tracking-tighter block font-mono">$0.00</strong>
               <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Suma de todas las filiales</p>
            </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-32 hover:border-[#0b5156]/20 transition-all">
            <div className="space-y-1">
               <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Eliminaciones Inter-Co</h3>
               <strong className="text-2xl font-black text-red-500 tracking-tighter block font-mono">($0.00)</strong>
               <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Partidas duplicadas detectadas</p>
            </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-32 hover:border-[#0b5156]/20 transition-all">
            <div className="space-y-1">
               <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Activo Neto Consolidado</h3>
               <strong className="text-2xl font-black text-green-600 tracking-tighter block font-mono">$0.00</strong>
               <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Valor real ante terceros</p>
            </div>
        </div>
      </section>

      {/* Consolidation Matrix */}
      <article className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="py-2.5 px-3.5 border-b border-slate-100 bg-slate-50/30 flex justify-between items-center">
          <div>
            <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Matriz de Eliminación de Partidas</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Cuentas espejo identificadas automáticamente para anulación.</p>
          </div>
          <div className="flex gap-2">
             <span className="bg-blue-50 text-blue-700 text-[9px] font-black px-2 py-0.5 rounded-full uppercase flex items-center gap-1 border border-blue-100">
                <Globe size={10} /> 3 Entidades Activas
             </span>
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-2 px-4">Entidad Origen</th>
                <th className="py-2 px-4">Entidad Destino</th>
                <th className="py-2 px-4">Concepto</th>
                <th className="py-2 px-4">Cuenta</th>
                <th className="py-2 px-4 text-right">Monto</th>
                <th className="py-2 px-4 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs">
              {consolidationData.length === 0 ? (
                 <tr>
                    <td colSpan={6} className="py-20 text-center">
                       <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tighter mb-1">Sin Consolidaciones</h3>
                       <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No hay partidas de eliminación detectadas.</p>
                    </td>
                 </tr>
              ) : consolidationData.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4 font-black text-[#0b5156] uppercase tracking-tight">{row.origin}</td>
                  <td className="py-3 px-4 font-bold text-slate-600 uppercase tracking-tight">{row.dest}</td>
                  <td className="py-3 px-4 font-bold text-slate-600 uppercase">{row.concept}</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{row.account}</td>
                  <td className={`py-3 px-4 text-right font-black font-mono ${row.amount < 0 ? 'text-red-500' : 'text-green-600'}`}>
                     {row.amount < 0 ? `($${Math.abs(row.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })})` : `$${row.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                  </td>
                  <td className="py-3 px-4 text-center">
                     <span className={`${row.statusColor} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight`}>{row.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      {/* Rules Box */}
      <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 flex gap-4 relative overflow-hidden group">
         <Link2 size={24} className="text-indigo-600 shrink-0 mt-0.5" />
         <div className="space-y-1.5 relative z-10">
            <h4 className="text-xs font-black text-indigo-900 uppercase tracking-tight">Regla de Consolidación Inteligente</h4>
            <p className="text-[10px] font-bold text-indigo-800/60 uppercase leading-relaxed max-w-4xl">
               El motor de consolidación identifica cuentas con el flag <strong>"Inter-compañía"</strong>. Para que la eliminación sea automática, el saldo de la cuenta deudora en la Entidad A debe coincidir con el saldo acreedor en la Entidad B. Las diferencias no conciliadas se reportarán como ajustes.
            </p>
         </div>
         <Globe size={80} className="absolute -right-6 -bottom-6 text-indigo-600/5 group-hover:rotate-12 transition-transform duration-700 pointer-events-none" />
      </div>
    </div>
  );
};

export default FinancialConsolidation;
