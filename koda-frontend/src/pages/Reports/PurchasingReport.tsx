import { 
  ArrowLeft,
  Download,
  Receipt,
  ClipboardList,
  Truck,
  Clock,
  Package,
  Award
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const PurchasingReport = () => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [periodo, setPeriodo] = useState(currentMonth);
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPurchasing = async () => {
      try {
        setIsLoading(true);
        const res = await api.get<any>(`/reportes/compras?periodo=${periodo}`);
        setData(res);
      } catch (error) {
        console.error("Error fetching purchasing report:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPurchasing();
  }, [periodo]);

  const handleExport = async () => {
    try {
      await api.download(`/reportes/exportar?reporte=compras&periodo=${periodo}`, `reporte_compras_${periodo}.csv`);
    } catch (error) {
      console.error("Error exporting purchases:", error);
      alert("Error al exportar compras.");
    }
  };

  const metrics = data?.metrics || [];

  const suppliers = data?.suppliers || [];
  const categories = data?.categories || [];
  const chartData = data?.chartData || [];
  const insight = data?.insight || "No hay datos suficientes para generar un insight.";

  const handleShowSuppliers = () => {
    if (suppliers.length === 0) {
      alert("No hay proveedores registrados para este período.");
      return;
    }
    alert(
      "Evaluación Completa de Proveedores:\n\n" +
      suppliers.map((s: any, i: number) => `${i + 1}. ${s.name} - Calidad: ${s.quality}/10 - Monto total: ${s.amount} (${s.condition})`).join("\n")
    );
  };

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
                Auditoría de Gastos
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Análisis Analítico de Compras</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Control de egresos, evaluación de proveedores y eficiencia de abastecimiento.</p>
          </div>
          <div className="flex gap-2 items-center">
             <button 
               onClick={handleExport}
               className="bg-white text-slate-500 px-6 py-2 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2"
             >
                <Download size={14} /> Reporte de Gastos
             </button>
             <input 
               type="month"
               value={periodo}
               onChange={(e) => setPeriodo(e.target.value)}
               className="bg-[#0b5156] text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase outline-none shadow-lg shadow-green-900/20 cursor-pointer"
             />
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
        {metrics.map((m: any, i: number) => {
          let IconComp = m.icon;
          if (!IconComp) {
            if (m.type === 'clipboard') IconComp = <ClipboardList size={16} className={m.trendColor} />;
            else if (m.type === 'truck') IconComp = <Truck size={16} className={m.trendColor} />;
            else if (m.type === 'clock') IconComp = <Clock size={16} className={m.trendColor} />;
            else IconComp = <Receipt size={16} className={m.trendColor} />;
          }
          return (
          <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24 hover:border-[#0b5156]/20 transition-all">
             <div className="flex justify-between items-start">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{m.label || m.etiqueta}</span>
                {IconComp}
             </div>
             <div className="space-y-0.5">
                <strong className="text-lg font-black text-[#0b5156] tracking-tighter font-mono">{m.value || m.valor}</strong>
                <div className="flex items-center gap-2 leading-none">
                   <span className={`text-[9px] font-black uppercase ${m.trendColor || 'text-slate-400'}`}>{m.trend || m.tendencia}</span>
                   <span className="text-[9px] font-bold text-slate-300 uppercase tracking-tighter">{m.desc || m.descripcion}</span>
                </div>
             </div>
          </div>
          )
        })}
      </section>

      {/* Chart Section */}
      <article className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
         <div className="flex justify-between items-start mb-4">
            <div className="space-y-0.5">
               <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Tendencia de Compras</h2>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Evolución de egresos — Últimos 6 Meses</p>
            </div>
         </div>

         <div className="h-36 flex items-end justify-between gap-4 px-4">
            {chartData.length > 0 ? chartData.map((d: any, i: number) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                <span className={`text-[10px] font-black transition-all ${d.active ? 'text-[#0b5156]' : 'text-slate-300'}`}>${d.value ?? d.valor ?? 0}k</span>
                <div 
                  className={`w-full max-w-[40px] rounded-t-lg transition-all duration-500
                    ${d.active 
                      ? 'bg-gradient-to-t from-[#0b5156] to-indigo-500 shadow-lg shadow-indigo-900/20' 
                      : 'bg-slate-50 hover:bg-slate-200 border border-slate-100'}`}
                  style={{ height: d.height || d.altura }}
                />
                <span className={`text-[10px] font-black uppercase tracking-tighter ${d.active ? 'text-[#0b5156]' : 'text-slate-400'}`}>{d.month || d.mes}</span>
              </div>
            )) : (
              <div className="w-full flex items-center justify-center text-slate-400 text-xs font-bold uppercase">Sin datos de gráfico disponibles</div>
            )}
         </div>
      </article>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
         {/* Supplier Evaluation */}
         <article className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
               <h2 className="text-xs font-black text-[#0b5156] uppercase tracking-tighter">Evaluación de Proveedores Críticos</h2>
               <button onClick={handleShowSuppliers} className="text-[10px] font-black text-slate-400 uppercase hover:text-[#0b5156]">Ver Todos</button>
            </div>
            <div className="p-2 space-y-1">
               {suppliers.length > 0 ? suppliers.map((s: any, i: number) => (
                 <div key={i} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors group">
                    <div className="flex items-center gap-3">
                       <div className="w-7 h-7 bg-[#0b5156]/5 rounded-lg flex items-center justify-center text-[#0b5156] border border-slate-100">
                          <Award size={14} />
                       </div>
                       <div>
                          <strong className="text-xs font-black text-slate-700 uppercase block">{s.name || s.nombre}</strong>
                          <span className="text-[10px] font-bold text-slate-400 uppercase leading-none">Calidad: {s.quality || s.calidad} / 10</span>
                       </div>
                    </div>
                    <div className="text-right">
                       <strong className="text-sm font-black text-[#0b5156] font-mono block leading-none">{s.amount || s.monto}</strong>
                       <span className="text-[9px] font-black uppercase text-slate-400 leading-none">{s.condition || s.condicion}</span>
                    </div>
                 </div>
               )) : (
                 <div className="text-center p-4 text-xs font-bold text-slate-400 uppercase">No hay proveedores en la lista</div>
               )}
            </div>
         </article>

         {/* Category Spending */}
         <article className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-4 flex flex-col h-full">
            <h2 className="text-xs font-black text-[#0b5156] uppercase tracking-tighter mb-4">Gasto por Categoría</h2>
            <div className="space-y-4 flex-1 justify-center flex flex-col">
               {categories.length > 0 ? categories.map((cat: any, i: number) => (
                 <div key={i} className="space-y-1">
                    <div className="flex justify-between items-end leading-none">
                       <span className="text-[10px] font-black text-slate-700 uppercase">{cat.name || cat.nombre} ({cat.percentage || cat.porcentaje}%)</span>
                       <span className="text-[10px] font-black text-[#0b5156] font-mono">{cat.amount || cat.monto}</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-50 border border-slate-100 rounded-full overflow-hidden">
                       <div 
                         className={`h-full ${cat.color || 'bg-slate-400'} rounded-full transition-all duration-1000`} 
                         style={{ width: `${cat.percentage || cat.porcentaje}%` }}
                       />
                    </div>
                 </div>
               )) : (
                 <div className="text-center p-4 text-xs font-bold text-slate-400 uppercase">Sin categorías registradas</div>
               )}
            </div>
            <div className="mt-4 p-2 bg-slate-50 rounded-xl border border-slate-100 text-center">
               <p className="text-[9px] font-bold text-slate-400 uppercase leading-none">Verifique periódicamente la concentración del gasto.</p>
            </div>
         </article>
      </div>

      {/* Forensic Insight */}
      <div className="p-4 bg-[#0b5156] rounded-xl text-white flex gap-4 items-center shadow-lg group">
         <div className="bg-white/10 p-2.5 rounded-xl border border-white/20 h-fit">
            <Package size={24} className="text-white/60" />
         </div>
         <div className="space-y-1.5 flex-1">
            <h4 className="text-xs font-black uppercase tracking-tighter">Nota de Abastecimiento</h4>
            <p className="text-[10px] font-bold text-white/60 uppercase leading-relaxed">
               {insight}
            </p>
         </div>
         <>
           <style>{`
             .nota-abastecimiento-btn {
                color: #0b5156 !important;
             }
             .nota-abastecimiento-btn:hover {
                color: #083a3d !important;
             }
           `}</style>
           <Link 
             to="/reportes/matriz-abc" 
             className="nota-abastecimiento-btn px-6 py-1.5 bg-white text-[10px] font-black uppercase rounded-lg hover:bg-slate-100 transition-all shadow-md flex items-center justify-center"
           >
              Ver Detalles
           </Link>
         </>
      </div>
    </div>
  );
};

export default PurchasingReport;
