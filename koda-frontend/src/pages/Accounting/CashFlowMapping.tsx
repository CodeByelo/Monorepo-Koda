import { 
  ArrowLeft,
  Save,
  Workflow,
  Search,
  Info,
  Layers
} from 'lucide-react';
import { Link } from 'react-router-dom';

const CashFlowMapping = () => {
  const rows = [
    { code: '1.1.02.01', name: 'Cuentas por Cobrar Clientes', category: 'OP', impact: 'Variación de Capital de Trabajo', impactColor: 'bg-blue-100 text-blue-700' },
    { code: '1.2.01.01', name: 'Maquinaria y Equipos', category: 'INV', impact: 'Adquisición de Activos', impactColor: 'bg-amber-100 text-amber-700' },
    { code: '2.1.05.01', name: 'Préstamos Bancarios LP', category: 'FIN', impact: 'Flujo de Capital Externo', impactColor: 'bg-green-100 text-green-700' },
    { code: '1.2.01.02', name: 'Depreciación Acumulada', category: 'NM', impact: 'Ajuste a la Utilidad', impactColor: 'bg-white text-slate-500' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <Link to="/contabilidad/flujo-efectivo" className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-[#0b5156]/20 transition-all">
                <ArrowLeft size={10} /> Volver al Reporte
              </Link>
              <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Contabilidad &gt; Configuración
              </span>
            </div>
            <h1 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Mapeo de Flujo de Efectivo</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Defina el impacto de cada cuenta en el Estado de Flujo de Efectivo.</p>
          </div>
          <div className="flex gap-2">
             <button className="bg-[#0b5156] text-white px-8 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <Save size={14} /> Guardar Mapeo
             </button>
          </div>
        </div>
      </header>

      {/* Mapping Matrix */}
      <article className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-8 border-b border-slate-100 bg-slate-50/30 flex justify-between items-center">
          <div className="flex items-center gap-4">
             <div className="bg-[#0b5156]/5 p-3 rounded-2xl border border-[#0b5156]/10 text-[#0b5156]">
                <Workflow size={24} />
             </div>
             <div>
                <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter leading-none">Matriz de Clasificación Operativa</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Asigne las cuentas operativas a su categoría correspondiente.</p>
             </div>
          </div>
          <div className="flex gap-2">
             <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input type="text" placeholder="Buscar cuenta..." className="bg-slate-50 border border-slate-100 rounded-xl pl-9 pr-4 py-2 text-[10px] font-black uppercase outline-none focus:border-[#0b5156] transition-all w-48" />
             </div>
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-4 px-8 w-40">Código</th>
                <th className="py-4 px-4">Cuenta Contable</th>
                <th className="py-4 px-4">Categoría de Flujo</th>
                <th className="py-4 px-8 text-right">Impacto en Reporte</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-[11px]">
              {rows.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="py-5 px-8 font-black font-mono text-[#0b5156]">{row.code}</td>
                  <td className="py-5 px-4">
                     <strong className="text-slate-700 uppercase font-black block leading-tight">{row.name}</strong>
                  </td>
                  <td className="py-5 px-4">
                    <select className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-black text-[#0b5156] outline-none focus:border-[#0b5156] appearance-none uppercase shadow-sm" defaultValue={row.category}>
                       <option value="OP">Actividades de Operación</option>
                       <option value="INV">Actividades de Inversión</option>
                       <option value="FIN">Actividades de Financiamiento</option>
                       <option value="NM">No Monetaria (Ajuste)</option>
                    </select>
                  </td>
                  <td className="py-5 px-8 text-right">
                    <span className={`${row.impactColor} px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-tight`}>
                      {row.impact}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      {/* Accounting Note */}
      <div className="p-8 bg-indigo-50 rounded-[2rem] border border-indigo-100 flex gap-6 relative overflow-hidden group">
         <Info size={32} className="text-indigo-600 shrink-0 mt-1" />
         <div className="space-y-3 relative z-10">
            <h4 className="text-sm font-black text-indigo-900 uppercase tracking-tight">Nota para el Contador</h4>
            <p className="text-[11px] font-bold text-indigo-800/60 uppercase leading-relaxed max-w-4xl">
               Este mapeo es la base para la generación automática del reporte de Flujo de Efectivo. Asegúrese de que las cuentas de <strong>Caja y Bancos</strong> NO estén mapeadas aquí, ya que representan el objetivo final de conciliación del reporte.
            </p>
         </div>
         <Layers size={120} className="absolute -right-8 -bottom-8 text-indigo-600/5 group-hover:rotate-12 transition-transform duration-700" />
      </div>
    </div>
  );
};

export default CashFlowMapping;
