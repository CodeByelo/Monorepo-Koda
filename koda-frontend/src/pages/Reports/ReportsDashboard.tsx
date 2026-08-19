import { 
  TrendingUp, 
  Wallet, 
  CircleAlert, 
  PieChart, 
  Search,
  Filter,
  Download,
  ShieldCheck,
  Zap,
  Clock,
  ArrowRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const ReportsDashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [modalMessage, setModalMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await api.get<any>('/reportes/dashboard');
        setData(res);
      } catch (error) {
        console.error("Error fetching reports dashboard:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  const metrics = data?.metrics || [];

  const executiveAlerts = data?.executiveAlerts || [];

  const availableReports = data?.availableReports || [];

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArea, setSelectedArea] = useState('Todos');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const areas: string[] = ['Todos', ...Array.from(new Set((availableReports as any[]).map((r: any) => r.area).filter(Boolean) as string[]))];

  const filteredReports = availableReports.filter((report: any) => {
    const matchesSearch = 
      (report.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (report.desc || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesArea = selectedArea === 'Todos' || report.area === selectedArea;
    return matchesSearch && matchesArea;
  });

  const handleExportBoard = async () => {
    try {
      await api.download('/reportes/exportar?reporte=ventas', 'reporte_board_koda.csv');
    } catch (error) {
      console.error("Error exporting board:", error);
      setModalMessage("Error al exportar board. Por favor intente nuevamente.");
    }
  };

  const handleCustomReport = () => {
    navigate('/reportes/query-builder');
  };

  return (
    <div className="space-y-1.5 animate-in fade-in duration-500 pb-4">
      {/* Header */}
      <header className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                KODA | Business Intelligence
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Centro de Reportes</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Indicadores, rendimiento, alertas ejecutivas y lectura estratégica del negocio.</p>
          </div>
          <div className="flex gap-2">
             <button 
               onClick={handleExportBoard}
               className="bg-white text-slate-500 px-6 py-2 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2"
             >
                <Download size={14} /> Exportar Board
             </button>
             <button 
               onClick={handleCustomReport}
               className="bg-[#0b5156] text-white px-8 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
             >
                <PieChart size={14} /> Generar Custom Report
             </button>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
        {metrics.map((m: any, i: number) => {
          let IconComp = m.icon;
          if (!IconComp) {
            if (m.type === 'wallet') IconComp = <Wallet size={16} className={m.trendColor} />;
            else if (m.type === 'shield') IconComp = <ShieldCheck size={16} className={m.trendColor} />;
            else if (m.type === 'alert') IconComp = <CircleAlert size={16} className={m.trendColor} />;
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
                  <p className={`text-[9px] font-bold uppercase leading-tight ${m.trendColor || 'text-slate-400'}`}>{m.trend || m.tendencia}</p>
               </div>
            </div>
          )
        })}
      </section>

      <div className="grid grid-cols-1 gap-3 items-start">
        {/* Executive Reading */}
        <article className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
           <div className="mb-4 flex justify-between items-center">
              <div className="space-y-0.5">
                 <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Lectura Ejecutiva</h2>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Resumen consolidado para toma de decisiones directivas.</p>
              </div>
              <div className="flex items-center gap-1.5 text-[#0b5156] font-black text-[10px] uppercase">
                 <Clock size={12} /> Actualizado en tiempo real
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
              {executiveAlerts.length > 0 ? executiveAlerts.map((alert: any, i: number) => (
                <div 
                  key={i} 
                  onClick={() => alert.link && navigate(alert.link)}
                  className={`p-3.5 bg-slate-50 rounded-xl border border-slate-100 hover:border-[#0b5156]/30 transition-all group ${alert.link ? 'cursor-pointer hover:shadow-sm hover:scale-[1.01]' : ''}`}
                >
                   <div className="flex items-center justify-between mb-2">
                      <span className={`${alert.color || 'bg-slate-200 text-slate-700'} text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-widest`}>{alert.type || alert.tipo}</span>
                      {alert.link ? (
                         <span className="text-[9px] font-bold text-[#0b5156] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                            Analizar Detalle <ArrowRight size={10} />
                         </span>
                      ) : (
                         <Zap size={12} className="text-slate-300 group-hover:text-[#0b5156] transition-colors" />
                      )}
                   </div>
                   <h3 className="text-xs font-black text-[#0b5156] uppercase tracking-tight leading-tight mb-1">{alert.title || alert.titulo}</h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed">{alert.desc || alert.descripcion}</p>
                </div>
              )) : (
                <div className="col-span-2 text-center text-slate-400 font-bold text-xs p-4">No hay alertas ejecutivas en este momento.</div>
              )}
           </div>
        </article>
      </div>

      {/* Available Reports Table */}
      <article className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="py-2.5 px-3.5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-slate-50/30">
          <div className="space-y-1">
            <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Reportes Disponibles</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vistas ejecutivas agrupadas por área operativa.</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto relative">
             <div className="relative flex-1 md:flex-none">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={12} />
                <input 
                  type="text" 
                  placeholder="Buscar reporte..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full md:w-64 bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156] shadow-sm" 
                />
             </div>
             <button 
               onClick={() => setShowFilterMenu(!showFilterMenu)}
               className={`p-1.5 rounded-lg border shadow-sm transition-all ${selectedArea !== 'Todos' ? 'bg-[#0b5156]/10 border-[#0b5156] text-[#0b5156]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
             >
                <Filter size={14} />
             </button>

             {showFilterMenu && (
                <div className="absolute right-0 top-10 bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-50 min-w-44 text-xs font-sans">
                   <strong className="block px-2.5 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-wider">Filtrar por Área</strong>
                   <div className="space-y-0.5 mt-1">
                      {areas.map((area: string) => (
                         <button
                           key={area}
                           type="button"
                           onClick={() => {
                              setSelectedArea(area);
                              setShowFilterMenu(false);
                           }}
                           className={`w-full text-left px-2.5 py-1.5 rounded-lg font-bold transition-all uppercase text-[9px] ${selectedArea === area ? 'bg-[#0b5156] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                         >
                            {area}
                         </button>
                      ))}
                   </div>
                </div>
             )}
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-2 px-4">Reporte</th>
                <th className="py-2 px-4">Área</th>
                <th className="py-2 px-4">Frecuencia</th>
                <th className="py-2 px-4">Estado</th>
                <th className="py-2 px-4">Uso Principal</th>
                <th className="py-2 px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs">
              {filteredReports.map((report: any, i: number) => (
                <tr 
                  key={i} 
                  onClick={() => navigate(report.link || report.enlace)}
                  className="hover:bg-slate-50 transition-colors group cursor-pointer"
                >
                  <td className="py-2 px-4">
                    <div className="space-y-0.5">
                       <strong className="text-slate-700 uppercase font-black block leading-tight">{report.name || report.nombre}</strong>
                       <span className="text-[9px] font-bold text-slate-400 uppercase">{report.desc || report.descripcion}</span>
                    </div>
                  </td>
                  <td className="py-2 px-4 font-bold text-slate-505 uppercase">{report.area}</td>
                  <td className="py-2 px-4 font-bold text-slate-400 uppercase">{report.freq || report.frecuencia}</td>
                  <td className="py-2 px-4">
                    <span className={`${report.statusColor || 'bg-slate-100 text-slate-700'} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight`}>
                      {report.status || report.estado}
                    </span>
                  </td>
                  <td className="py-2 px-4 font-bold text-slate-500 uppercase">{report.usage || report.uso}</td>
                  <td className="py-2 px-4 text-right">
                    <div className="text-[#0b5156] group-hover:underline font-black uppercase text-[10px] flex items-center justify-end gap-1 ml-auto">
                       Abrir Reporte <ArrowRight size={12} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      {/* Modal Interactivo */}
      {modalMessage && (
        <div className="fixed inset-0 z-[9999] bg-[#0b5156]/40 backdrop-blur-sm flex justify-center items-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-[#0b5156]/20 max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-4 border border-red-100">
                <CircleAlert size={24} className="text-red-500" />
              </div>
              <h3 className="text-lg font-black text-[#0b5156] tracking-tighter uppercase mb-1">Aviso del Sistema</h3>
              <p className="text-slate-500 font-bold text-xs leading-relaxed">
                {modalMessage}
              </p>
            </div>
            <div className="bg-slate-50 p-3 flex justify-end gap-2 border-t border-slate-100">
              <button
                onClick={() => setModalMessage(null)}
                className="bg-[#0b5156] text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-[#083a3d] transition-colors shadow-md shadow-[#0b5156]/20"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsDashboard;
