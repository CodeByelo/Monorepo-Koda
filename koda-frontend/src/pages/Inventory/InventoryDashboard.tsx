import { 
  Plus,
  Activity,
  BookOpen,
  TrendingUp,
  PieChart,
  Calendar,
  Layers,
  ArrowRight,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { Toast } from '@/components/common/Toast';

const InventoryDashboard = () => {
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const data = await api.get<any>('/inventario/dashboard');
        setDashboardData(data);
      } catch (error) {
        console.error("Error fetching inventory dashboard:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  const kpis = dashboardData?.kpis || [];

  const vpdItems = dashboardData?.vpdItems || [];

  const expiryAlerts = dashboardData?.expiryAlerts || [];

  const categoryValorization = dashboardData?.categoryValorization || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-8 rounded-3xl border border-[#bdafa1]/20 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
           <Layers size={120} className="text-[#0b5156]" />
        </div>
        <div className="flex justify-between items-start mb-6 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Inventario y Logística
              </span>
            </div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Dashboard de Inventario</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-3xl leading-relaxed">
              Estado del almacén, valorización del stock y productos con nivel crítico de reposición.
            </p>
          </div>
          <div className="flex gap-3">
             <button onClick={() => showToast('Descargando Manual de Operador de Almacén...', 'success')} className="bg-white text-slate-500 px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 border border-slate-200 hover:bg-slate-50 transition-all tracking-widest shadow-sm">
                <BookOpen size={14} /> Manual
             </button>
             <Link to="/inventario/kardex" className="bg-white text-[#0b5156] px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-[#0b5156]/20 hover:bg-green-50 transition-all flex items-center gap-2 tracking-widest shadow-sm">
                Ver Kardex
             </Link>
             <Link to="/compras/recepcion" className="bg-[#0b5156] text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-[#0b5156]/20 hover:scale-105 transition-all tracking-widest">
                <Plus size={16} /> Recibir
             </Link>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {kpis.map((kpi: any, i: number) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-36 group hover:border-[#0b5156]/30 transition-all">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest group-hover:text-[#0b5156] transition-colors">{kpi.t || kpi.titulo}</p>
            <div className="space-y-1">
              <strong className={`text-3xl font-black ${kpi.c || 'text-slate-800'} tracking-tighter font-mono`}>{kpi.v || kpi.valor}</strong>
              <p className="text-sm font-bold text-slate-400 uppercase leading-tight">{kpi.desc || kpi.descripcion}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Sección 1: Análisis Estratégico e Insights de Valor */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6 flex flex-col justify-between hover:border-[#0b5156]/30 transition-all duration-300">
          <div className="space-y-4">
             <div className="flex items-center gap-2">
                <PieChart size={18} className="text-[#0b5156]" />
                <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">Valorización por Categoría</h3>
             </div>
             <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-tight">Distribución del capital inmovilizado.</p>
          </div>
          <div className="space-y-6 pt-2 flex-1 flex flex-col justify-center">
             {categoryValorization.length > 0 ? (
               categoryValorization.map((item: any, i: number) => (
                 <div key={i}>
                    <div className="flex justify-between items-center mb-2">
                       <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight">{item.label || item.categoria}</span>
                       <strong className="text-xs font-black text-slate-800 font-mono">{item.val || item.valor} ({item.p || item.porcentaje})</strong>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                       <div className={`h-full ${item.color || 'bg-slate-400'} rounded-full transition-all duration-500`} style={{ width: item.p || item.porcentaje }}></div>
                    </div>
                 </div>
               ))
             ) : (
               <div className="text-center py-4 text-xs font-bold text-slate-400 uppercase">Sin datos de valorización</div>
             )}
          </div>
        </article>

        <article className="bg-white p-8 rounded-3xl border border-[#0b5156]/20 shadow-sm space-y-6 relative overflow-hidden group flex flex-col justify-between hover:border-[#0b5156]/40 transition-all duration-300">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
             <Layers size={80} className="text-[#0b5156]" />
          </div>
          <div className="relative z-10 space-y-4 flex-1 flex flex-col justify-between">
             <div className="space-y-4">
                <div className="flex items-center gap-2">
                   <Activity size={18} className="text-[#0b5156]" />
                   <h4 className="text-lg font-black uppercase tracking-tight text-slate-800">Análisis ABC Activo</h4>
                </div>
                <p className="text-sm font-bold text-slate-500 leading-relaxed uppercase">
                   {dashboardData?.abcAnalysis || "Sin datos suficientes para procesar la concentración de inventario (Análisis ABC). Registre compras y ventas para alimentar el motor de análisis."}
                </p>
             </div>
             <Link to="/reportes/matriz-abc" className="w-full bg-[#0b5156] text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-xl shadow-[#0b5156]/20 flex items-center justify-center gap-2 hover:scale-[1.02] hover:bg-[#083a3d] transition-all">
                Ver Reporte ABC <ArrowRight size={16} />
             </Link>
          </div>
        </article>
      </div>

      {/* Sección 2: Monitoreo Operativo y Alertas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <section className="lg:col-span-2">
          <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6 hover:border-[#0b5156]/10 transition-all duration-300">
            <div className="flex justify-between items-center">
               <div className="space-y-1">
                  <h2 className="text-xl font-black text-slate-800 tracking-tighter uppercase flex items-center gap-2">
                    <TrendingUp size={20} className="text-[#0b5156]" /> Reposición por Demanda (VPD)
                  </h2>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-tight">Cálculo dinámico basado en ritmo de venta y tiempos de entrega.</p>
               </div>
               <button className="p-2 bg-slate-50 text-slate-400 rounded-lg">
                  <Activity size={18} />
               </button>
            </div>
            <div className="overflow-x-auto no-scrollbar">
               <table className="w-full text-left">
                  <thead>
                     <tr className="text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                        <th className="py-4 px-6">PRODUCTO</th>
                        <th className="py-4 px-4 text-center">VPD (AVG)</th>
                        <th className="py-4 px-4 text-center">LEAD TIME</th>
                        <th className="py-4 px-4 text-center">COBERTURA ACT.</th>
                        <th className="py-4 px-4 text-right">SUGERENCIA (30 DÍAS)</th>
                        <th className="py-4 px-6 text-right">ACCIÓN</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                     {vpdItems.length > 0 ? (
                       vpdItems.map((item: any, i: number) => (
                         <tr key={i} className="group hover:bg-slate-50 transition-colors">
                            <td className="py-5 px-6">
                               <div className="flex flex-col">
                                  <span className="text-xs font-black text-slate-800 uppercase">{item.name || item.nombre}</span>
                                  <span className="text-[9px] font-bold text-slate-400 tracking-tighter uppercase">SKU {item.sku}</span>
                               </div>
                            </td>
                            <td className="py-5 px-4 text-center text-xs font-bold text-slate-600 font-mono">{item.vpd}</td>
                            <td className="py-5 px-4 text-center text-xs font-bold text-slate-600 font-mono">{item.lead || item.lead_time}</td>
                            <td className="py-5 px-4 text-center">
                               <span className={`${item.color || 'bg-slate-100 text-slate-700'} text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter`}>{item.coverage || item.cobertura}</span>
                            </td>
                            <td className="py-5 px-4 text-right text-xs font-black text-[#0b5156] font-mono">{item.suggestion || item.sugerencia}</td>
                            <td className="py-5 px-6 text-right">
                               <Link to="/compras/ordenes/nueva" className="bg-[#0b5156] text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all inline-block">
                                  Generar OC
                               </Link>
                            </td>
                         </tr>
                       ))
                     ) : (
                       <tr>
                         <td colSpan={6} className="text-center py-8 text-xs font-bold text-slate-400 uppercase">Sin sugerencias de reposición en este momento</td>
                       </tr>
                     )}
                  </tbody>
               </table>
            </div>
          </article>
        </section>

        <section className="lg:col-span-1">
          <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6 hover:border-[#0b5156]/10 transition-all duration-300">
            <div className="flex justify-between items-center">
               <div className="space-y-1">
                  <h2 className="text-xl font-black text-slate-800 tracking-tighter uppercase flex items-center gap-2 text-red-600">
                    <Calendar size={20} className="text-red-600" /> Control de Vencimiento
                  </h2>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-tight">
                     Productos próximos a caducar según lote registrado.
                  </p>
               </div>
            </div>
            <div className="space-y-4">
               {expiryAlerts.length > 0 ? (
                 expiryAlerts.map((alert: any, i: number) => (
                   <div key={i} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/30 space-y-3">
                      <div className="flex justify-between items-start">
                         <div className="space-y-1">
                            <p className="text-sm font-black text-slate-800 uppercase leading-tight">{alert.name || alert.nombre}</p>
                            <p className={`text-xs font-black ${alert.color || 'text-slate-600'} uppercase tracking-tighter`}>
                               Vence en: {alert.days || alert.dias} días ({alert.date || alert.fecha})
                            </p>
                         </div>
                         {(alert.status === 'CRÍTICO' || alert.estado === 'CRITICO' || alert.estado === 'CRÍTICO') && (
                            <button onClick={() => showToast(`Lote del producto ${alert.name || alert.nombre} bloqueado de manera preventiva en el POS.`, 'success')} className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg shadow-red-900/20 hover:bg-red-600 transition-colors">Bloquear POS</button>
                         )}
                      </div>
                   </div>
                 ))
               ) : (
                 <div className="text-center py-8 text-xs font-bold text-slate-400 uppercase">Sin alertas de vencimiento próximas</div>
               )}
            </div>
          </article>
        </section>
      </div>

      {/* Portal de Notificaciones Toast flotantes estilo KODA */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
    </div>
  );
};

export default InventoryDashboard;
