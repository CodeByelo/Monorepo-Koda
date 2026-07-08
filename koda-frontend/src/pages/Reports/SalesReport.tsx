import { 
  ArrowLeft,
  Download,
  TrendingUp,
  Target,
  BarChart3,
  TriangleAlert,
  Search,
  Filter,
  Activity,
  Ticket
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const SalesReport = () => {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSales = async () => {
      try {
        const res = await api.get<any>('/reportes/ventas');
        setData(res);
      } catch (error) {
        console.error("Error fetching sales report:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSales();
  }, []);

  const metrics = data?.metrics || [];

  const topClients = data?.topClients || [];
  const topProducts = data?.topProducts || [];
  const chartData = data?.chartData || [];
  const insight = data?.insight || "No hay datos suficientes para generar insights actualmente.";
  const alertContraction = data?.alertContraction || null;

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
                Business Intelligence
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Análisis Analítico de Ventas</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Monitor avanzado de proyecciones, rentabilidad y tendencias comerciales.</p>
          </div>
          <div className="flex gap-2">
             <button className="bg-white text-slate-500 px-6 py-2 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2">
                <Download size={14} /> Reporte Gerencial
             </button>
             <select className="bg-[#0b5156] text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase outline-none shadow-lg shadow-green-900/20 cursor-pointer">
                <option>Abril 2026</option>
                <option>Marzo 2026</option>
             </select>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
        {metrics.map((m: any, i: number) => {
          let IconComp = m.icon;
          if (!IconComp) {
            if (m.type === 'ticket') IconComp = <Ticket size={16} className={m.trendColor} />;
            else if (m.type === 'target') IconComp = <Target size={16} className={m.trendColor} />;
            else if (m.type === 'activity') IconComp = <Activity size={16} className={m.trendColor} />;
            else IconComp = <TrendingUp size={16} className={m.trendColor} />;
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

      {/* Real Contraction Alert */}
      {alertContraction && (
      <div className="p-2 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-700">
          <div className="bg-red-500 text-white p-1.5 rounded-lg flex items-center justify-center">
            <TriangleAlert size={14} />
          </div>
          <div className="text-[10px] font-bold uppercase leading-tight">
            <strong className="mr-1">Alerta de Contracción Real:</strong>
            {alertContraction}
          </div>
      </div>
      )}

      {/* Premium Chart Section */}
      <article className="bg-[#0b5156] p-4 rounded-xl shadow-lg relative overflow-hidden">
         <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="space-y-0.5">
               <h2 className="text-base font-black text-white uppercase tracking-tighter leading-none">Tendencia Deflactada</h2>
               <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-none">Ventas USD vs Variación de Tasa BCV</p>
            </div>
            <div className="flex items-center gap-4">
               <span className="flex items-center gap-1.5 text-[9px] font-black text-white/60 uppercase">
                  <div className="w-2 h-2 bg-amber-400 rounded-full" /> Tasa BCV
               </span>
               <span className="flex items-center gap-1.5 text-[9px] font-black text-white/60 uppercase">
                  <div className="w-2 h-2 bg-white/20 rounded-full" /> Ventas USD
               </span>
            </div>
         </div>

         <div className="h-40 flex items-end justify-between gap-6 relative px-4">
            {/* Background Grid Lines */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10">
               {[1,2,3,4,5].map(i => <div key={i} className="w-full h-px bg-white" />)}
            </div>

            {/* USD Line Overlay (SVG) */}
            {chartData.length > 0 && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-20" viewBox="0 0 1000 200" preserveAspectRatio="none">
               <path 
                 d="M0 160 L 200 140 L 400 110 L 600 90 L 800 50 L 1000 10" 
                 fill="none" 
                 stroke="#fbbf24" 
                 strokeWidth="3" 
                 strokeDasharray="8 8"
                 className="drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]"
               />
               {[0, 200, 400, 600, 800, 1000].map((x, i) => (
                 <circle key={i} cx={x} cy={[160, 140, 110, 90, 50, 10][i]} r="5" fill="#fbbf24" />
               ))}
            </svg>
            )}

            {/* Bars */}
            {chartData.length > 0 ? chartData.map((d: any, i: number) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2 relative z-10 group">
                <span className={`text-[10px] font-black transition-all group-hover:scale-110 ${d.active ? 'text-white' : 'text-white/40'}`}>${d.value || d.valor}k</span>
                <div 
                  className={`w-full max-w-[40px] rounded-t-lg transition-all duration-700 cursor-help
                    ${d.active 
                      ? 'bg-gradient-to-t from-[#0b5156] via-indigo-500 to-indigo-300 shadow-[0_0_35px_rgba(99,102,241,0.4)]' 
                      : 'bg-white/10 hover:bg-white/20'}`}
                  style={{ height: d.height || d.altura }}
                >
                </div>
                <span className={`text-[10px] font-black uppercase tracking-tighter ${d.active ? 'text-white' : 'text-white/40'}`}>{d.month || d.mes}</span>
              </div>
            )) : (
              <div className="w-full flex items-center justify-center text-white/50 text-xs font-bold uppercase">Sin datos de gráfico disponibles</div>
            )}
         </div>
      </article>

      {/* Secondary Grid: Top Clients & Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
         {/* Top Clients */}
         <article className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
               <h2 className="text-xs font-black text-[#0b5156] uppercase tracking-tighter">Top 10 Clientes del Mes</h2>
               <button className="text-[10px] font-black text-slate-400 uppercase hover:text-[#0b5156]">Ver Ranking Completo</button>
            </div>
            <div className="p-2 space-y-1">
               {topClients.length > 0 ? topClients.map((client: any, i: number) => (
                 <div key={i} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors group">
                    <div className="flex items-center gap-3">
                       <div className="w-7 h-7 bg-[#0b5156]/5 rounded-lg flex items-center justify-center text-[#0b5156] font-black text-xs border border-slate-100">
                          {i + 1}
                       </div>
                       <div>
                          <strong className="text-xs font-black text-slate-700 uppercase block">{client.name || client.nombre}</strong>
                          <span className="text-[10px] font-bold text-slate-400 uppercase leading-none">{client.share || client.participacion} de participación</span>
                       </div>
                    </div>
                    <div className="text-right">
                       <strong className="text-sm font-black text-[#0b5156] font-mono block leading-none">{client.amount || client.monto}</strong>
                       <span className={`text-[9px] font-black uppercase leading-none ${client.trend === 'up' ? 'text-green-600' : client.trend === 'down' ? 'text-red-500' : 'text-slate-400'}`}>
                          {client.trend === 'up' ? '↑ Creciendo' : client.trend === 'down' ? '↓ Bajando' : '→ Estable'}
                       </span>
                    </div>
                 </div>
               )) : (
                 <div className="text-center p-4 text-xs font-bold text-slate-400 uppercase">No hay clientes top</div>
               )}
            </div>
         </article>

         {/* Top Products */}
         <article className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
               <h2 className="text-xs font-black text-[#0b5156] uppercase tracking-tighter">Top Productos por Monto</h2>
               <div className="flex gap-1.5">
                  <button className="p-1 bg-white border border-slate-200 rounded text-slate-400 hover:text-[#0b5156]"><Search size={12} /></button>
                  <button className="p-1 bg-white border border-slate-200 rounded text-slate-400 hover:text-[#0b5156]"><Filter size={12} /></button>
               </div>
            </div>
            <div className="p-2 space-y-1">
               {topProducts.length > 0 ? topProducts.map((prod: any, i: number) => (
                 <div key={i} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                       <div className="w-7 h-7 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                          <BarChart3 size={14} className="text-slate-400" />
                       </div>
                       <div>
                          <strong className="text-xs font-black text-slate-700 uppercase block">{prod.name || prod.nombre}</strong>
                          <span className="text-[10px] font-bold text-slate-400 uppercase leading-none">{prod.qty || prod.cantidad} vendidos</span>
                       </div>
                    </div>
                    <div className="text-right">
                       <strong className="text-sm font-black text-[#0b5156] font-mono block leading-none">{prod.amount || prod.monto}</strong>
                       <button className="text-[9px] font-black text-[#0b5156] uppercase hover:underline leading-none">Ver Historial</button>
                    </div>
                 </div>
               )) : (
                 <div className="text-center p-4 text-xs font-bold text-slate-400 uppercase">No hay productos top</div>
               )}
            </div>
         </article>
      </div>

      {/* Forensic Insight */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl flex gap-4 items-center group shadow-sm">
         <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-[#0b5156] border border-slate-100 group-hover:scale-110 transition-transform">
            <Activity size={18} />
         </div>
         <div className="flex-1 space-y-0.5">
            <h4 className="text-xs font-black text-[#0b5156] uppercase tracking-tighter">Nota de Inteligencia Comercial</h4>
            <p className="text-[10px] font-bold text-slate-500 uppercase leading-relaxed max-w-4xl">
               {insight}
            </p>
         </div>
         <button className="px-6 py-1.5 bg-[#0b5156] text-white text-[10px] font-black uppercase rounded-lg shadow-lg shadow-green-900/10 hover:bg-[#083a3d] transition-all">
            Descargar Auditoría
         </button>
      </div>
    </div>
  );
};

export default SalesReport;
