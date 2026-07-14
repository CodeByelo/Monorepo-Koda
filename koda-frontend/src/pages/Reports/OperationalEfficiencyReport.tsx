import { 
  ArrowLeft,
  Download,
  Activity,
  Target,
  Zap,
  Building2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const OperationalEfficiencyReport = () => {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [modalMessage, setModalMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchEfficiency = async () => {
      try {
        const res = await api.get<any>('/reportes/eficiencia');
        setData(res);
      } catch (error) {
        console.error("Error fetching operational efficiency:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchEfficiency();
  }, []);

  const handleExport = async () => {
    try {
      await api.download('/reportes/exportar?reporte=eficiencia', 'reporte_eficiencia_operativa.csv');
    } catch (error) {
      console.error("Error exporting efficiency:", error);
      setModalMessage("Error al exportar reporte de eficiencia.");
    }
  };

  const handleAdjustFixed = () => {
    setModalMessage("Para ajustar los gastos fijos por sucursal, diríjase al Módulo de Configuración -> Parámetros Generales.");
  };

  const metrics = data?.metrics || [];

  const branches = data?.branches || [];
  const insight = data?.insight || "El Punto de Equilibrio es el nivel de ventas necesario para que la utilidad sea exactamente cero. Las sucursales en rojo están consumiendo flujo de caja del grupo y requieren ajuste inmediato.";

  return (
    <div className="space-y-1.5 animate-in fade-in duration-500 pb-4">
      {/* Header */}
      <header className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <Link to="/reportes" className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-[#0b5156]/20 transition-all">
                <ArrowLeft size={10} /> Volver
              </Link>
              <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Análisis Financiero
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Eficiencia Operativa y Punto de Equilibrio</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Monitor de sostenibilidad por sucursal. Ventas requeridas vs Gastos totales.</p>
          </div>
          <div className="flex gap-2">
             <button 
               onClick={handleAdjustFixed}
               className="bg-white text-slate-500 px-6 py-2 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2"
             >
                Ajustar Gastos Fijos
             </button>
             <button 
               onClick={handleExport}
               className="bg-[#0b5156] text-white px-8 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
             >
                <Download size={14} /> Exportar Plan de Viabilidad
             </button>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
        {metrics.map((m: any, i: number) => {
          let IconComp = m.icon;
          if (!IconComp) {
            if (m.type === 'building') IconComp = <Building2 size={16} className="text-slate-400" />;
            else if (m.type === 'target') IconComp = <Target size={16} className="text-green-600" />;
            else IconComp = <Activity size={16} className="text-[#0b5156]" />;
          }
          return (
          <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24 hover:border-[#0b5156]/20 transition-all">
             <div className="flex justify-between items-start">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{m.label || m.etiqueta}</span>
                {IconComp}
             </div>
             <div className="space-y-0.5">
                <strong className="text-lg font-black text-[#0b5156] tracking-tighter font-mono">{m.value || m.valor}</strong>
                <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">{m.desc || m.descripcion}</p>
             </div>
          </div>
          )
        })}
      </section>

      {/* Branches Analysis */}
      <div className="space-y-1.5">
        {branches.length > 0 ? branches.map((branch: any, i: number) => (
          <article key={i} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
             <div className="flex justify-between items-start mb-4">
                <div className="space-y-0.5">
                   <h3 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Sucursal: {branch.name || branch.nombre}</h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                      Ventas Actuales: {branch.sales || branch.ventas} | Gastos Fijos: {branch.fixedExpenses || branch.gastosFijos}
                   </p>
                </div>
                <span className={`${branch.statusColor || 'bg-slate-100 text-slate-700'} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight`}>
                   {branch.status || branch.estado}
                </span>
             </div>

             <div className="relative mb-4">
                {/* Gauge Track */}
                <div className="h-3 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100 relative">
                   {/* Equilibrium Marker */}
                   <div 
                     className="absolute top-0 bottom-0 w-1 bg-[#0b5156] z-20 shadow-[0_0_8px_rgba(11,81,86,0.5)]"
                     style={{ left: `${branch.marker || 0}%` }}
                   >
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-[#0b5156] text-white text-[8px] font-black px-2 py-0.5 rounded whitespace-nowrap uppercase">
                         Equilibrio
                      </div>
                   </div>
                   {/* Progress Fill */}
                   <div 
                     className={`h-full rounded-full transition-all duration-1000 ${branch.profitable ? 'bg-gradient-to-r from-[#0b5156] to-green-500' : 'bg-gradient-to-r from-red-500 to-amber-500'}`}
                     style={{ width: `${branch.progress || 0}%` }}
                   />
                </div>
             </div>

             <div className="flex justify-between items-center px-1">
                <span className="text-[10px] font-black text-slate-400 uppercase">$0</span>
                <span className="text-[10px] font-black text-[#0b5156] uppercase">
                   Ventas Requeridas: {branch.required || branch.requerido} {branch.missing && <span className="text-red-500 font-black ml-2">(FALTAN {branch.missing})</span>}
                </span>
                <span className="text-[10px] font-black text-slate-400 uppercase text-right">Meta: {branch.meta}</span>
             </div>
          </article>
        )) : (
          <div className="text-center p-4 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-400 uppercase">Sin información de sucursales</div>
        )}
      </div>

      {/* Diagnostic Insight */}
      <div className="p-4 bg-green-50/50 border border-green-100 rounded-xl flex gap-4 items-center group">
         <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-green-600 border border-green-100 shadow-sm group-hover:scale-110 transition-transform">
            <Zap size={18} />
         </div>
         <div className="flex-1 space-y-0.5">
            <h4 className="text-xs font-black text-green-700 uppercase tracking-tighter">💡 Diagnóstico de Rentabilidad</h4>
            <p className="text-[10px] font-bold text-slate-500 uppercase leading-relaxed max-w-4xl">
               {insight}
            </p>
         </div>
      </div>

      {modalMessage && (
         <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
           <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
             <div className="bg-[#0b5156] p-4 text-white flex items-center justify-between">
               <h3 className="text-xs font-black uppercase tracking-widest">Aviso del Sistema</h3>
               <button 
                 onClick={() => setModalMessage(null)}
                 className="text-white/70 hover:text-white text-xs font-bold uppercase transition-colors"
               >
                 ✕
               </button>
             </div>
             <div className="p-6 space-y-4">
               <p className="text-slate-600 text-xs font-bold uppercase tracking-tight leading-relaxed">
                 {modalMessage}
               </p>
               <div className="flex justify-end gap-2">
                 <button 
                   onClick={() => setModalMessage(null)}
                   className="bg-[#0b5156] text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
                 >
                   Aceptar
                 </button>
               </div>
             </div>
           </div>
         </div>
       )}
    </div>
  );
};

export default OperationalEfficiencyReport;
