import { 
  Search, 
  ShieldCheck, 
  DollarSign, 
  TrendingUp, 
  ChevronRight,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';

const PurchasingHistory = () => {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [statsData, setStatsData] = useState<any>({
    total_count: 0,
    total_amount: 0,
    valid_count: 0,
    alert_count: 0,
    pending_invoices: 0,
    open_orders: 0,
    completed: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setIsLoading(true);
    api.get<any>('/compras/historial')
      .then((data) => {
        if (data && data.purchases) {
          setPurchases(data.purchases);
          if (data.stats) setStatsData(data.stats);
        } else if (Array.isArray(data)) {
          setPurchases(data);
        }
      })
      .catch((err) => {
        console.error("Error fetching purchases history:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const filteredPurchases = purchases.filter(item => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      (item.id || '').toLowerCase().includes(q) ||
      (item.vendor || '').toLowerCase().includes(q)
    );
  });

  const downloadReport = () => {
    if (purchases.length === 0) {
      alert("No hay datos para exportar.");
      return;
    }
    const headers = ["DOCUMENTO", "PROVEEDOR", "MONTO", "ESTADO", "FECHA"];
    const rows = purchases.map(p => [
      p.id || '',
      p.vendor || p.proveedor || '',
      p.amount || p.monto || '',
      p.status || p.estado || '',
      p.date || p.fecha || ''
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `reporte_compras_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const stats = [
    { label: 'COMPRAS REGISTRADAS', value: String(statsData.total_count), desc: 'Histórico del período', color: 'text-[#0b5156]' },
    { label: 'MONTO ACUMULADO', value: `$${(statsData.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, desc: 'Compras procesadas', color: 'text-slate-800' },
    { label: 'FACTURAS VALIDADAS', value: String(statsData.valid_count), desc: 'Con soporte fiscal', color: 'text-[#43584b]' },
    { label: 'CASOS CON ALERTA', value: String(statsData.alert_count), desc: 'Requieren revisión', color: 'text-red-600' },
  ];

  const auditCards = [
    { label: 'SOPORTE', count: `${statsData.pending_invoices} Facturas sin validar`, desc: 'Pendientes de revisión fiscal.', color: 'border-red-200 bg-red-50/30' },
    { label: 'RECEPCIÓN', count: `${statsData.open_orders} Órdenes abiertas`, desc: 'Esperando confirmación de almacén.', color: 'border-[#726555]/20 bg-slate-50' },
    { label: 'TRAZABILIDAD', count: `${statsData.completed} Completas`, desc: 'Ciclo cerrado satisfactoriamente.', color: 'border-[#43584b]/20 bg-slate-50' }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-8 rounded-3xl border border-[#bdafa1]/20 shadow-sm">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Historial de Compras</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight max-w-2xl">
              Trazabilidad forense del ciclo de procura: Órdenes, Recepciones y Facturación Fiscal.
            </p>
          </div>
          <div className="flex gap-3">
             <button onClick={() => setShowFilters(!showFilters)} className={`bg-white text-slate-500 px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-all ${showFilters ? 'bg-slate-100 ring-2 ring-[#0b5156]/20' : ''}`}>
               Filtros Avanzados
             </button>
             <button onClick={downloadReport} className="bg-white text-[#0b5156] px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest border border-[#0b5156]/20 hover:bg-slate-50 transition-all flex items-center gap-2">
               Reporte <ChevronRight size={14} />
             </button>
             <button onClick={() => navigate('/compras/ordenes/nueva')} className="bg-[#0b5156] text-white px-8 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-[#0b5156]/20 hover:scale-105 transition-all">
               Nueva Orden
             </button>
          </div>
        </div>
        
        {showFilters && (
          <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top-4 fade-in duration-300">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rango de Fechas</label>
              <input type="date" className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-3 focus:outline-none focus:border-[#0b5156]" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Proveedor Específico</label>
              <select className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-3 focus:outline-none focus:border-[#0b5156] uppercase">
                <option value="">Todos los Proveedores</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado Fiscal</label>
              <select className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-3 focus:outline-none focus:border-[#0b5156] uppercase">
                <option value="">Cualquier Estado</option>
                <option value="validada">Validada SHA-256</option>
                <option value="pendiente">Pendiente Revisión</option>
              </select>
            </div>
          </div>
        )}
      </header>

      <div className="space-y-4">
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
          {stats.map((stat, i) => (
            <div key={i} className="bg-white p-5 rounded-[1.5rem] border border-slate-200 flex flex-col shadow-sm group hover:border-[#0b5156]/30 transition-all">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 group-hover:text-[#0b5156] transition-colors">{stat.label}</p>
              <div>
                <strong className={`text-3xl font-black ${stat.color} tracking-tighter font-mono leading-none`}>{stat.value}</strong>
                <p className="text-[8px] font-bold text-slate-400 uppercase mt-1 leading-none truncate">{stat.desc}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
           {auditCards.map((card, i) => (
             <div key={i} className={`p-4 rounded-[1.25rem] border ${card.color} flex flex-col justify-center`}>
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">{card.label}</span>
                <p className="text-[11px] font-black text-slate-800 uppercase leading-none mb-1">{card.count}</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase leading-none truncate">{card.desc}</p>
             </div>
           ))}
        </section>
      </div>

      <div className="w-full">
        <section className={`min-w-0 space-y-8 ${isExpanded ? 'fixed inset-4 z-50 bg-slate-100 p-6 overflow-hidden rounded-3xl' : ''}`}>
           <article className={`bg-white border border-slate-200 shadow-sm overflow-hidden transition-all duration-300 ${isExpanded ? 'flex flex-col h-full rounded-3xl shadow-2xl' : 'rounded-3xl'}`}>
              <div className="p-8 flex justify-between items-center bg-slate-50/50 border-b border-slate-100">
                 <div>
                    <h2 className="text-xl font-black text-slate-800 tracking-tighter uppercase">Historial Reciente</h2>
                    <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-widest">Últimas transacciones procesadas con validación SHA-256</p>
                 </div>
                 <div className="flex gap-4 items-center">
                    <div className="relative">
                       <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                       <input 
                         type="text" 
                         placeholder="BUSCAR REGISTRO..." 
                         value={searchTerm}
                         onChange={(e) => setSearchTerm(e.target.value)}
                         className="bg-white border border-slate-200 pl-9 pr-4 py-2 rounded-xl text-sm font-black text-slate-800 focus:outline-none focus:border-[#0b5156] uppercase w-64" 
                       />
                    </div>
                    <button 
                      onClick={() => setIsExpanded(!isExpanded)}
                      className="p-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
                      title={isExpanded ? "Restaurar vista" : "Pantalla completa"}
                    >
                      {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </button>
                 </div>
              </div>
              <div className={`overflow-x-auto no-scrollbar ${isExpanded ? 'flex-1' : ''}`}>
                 <table className="w-full text-left">
                    <thead>
                       <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/30">
                          <th className="py-5 px-8">DOCUMENTO</th>
                          <th className="py-5 px-6">PROVEEDOR</th>
                          <th className="py-5 px-6 text-right">MONTO</th>
                          <th className="py-5 px-6 text-center">ESTADO</th>
                          <th className="py-5 px-8 text-right">ACCIÓN</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                       {isLoading ? (
                         <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-400 font-bold uppercase text-xs">
                               Cargando historial de compras...
                            </td>
                         </tr>
                       ) : filteredPurchases.length > 0 ? (
                         filteredPurchases.map((item, i) => (
                           <tr key={i} className="group hover:bg-[#bdafa1]/5 transition-colors">
                              <td className="py-6 px-8">
                                 <div className="flex flex-col">
                                    <span className="text-sm font-black text-slate-800 uppercase font-mono">{item.id}</span>
                                    <span className="text-xs font-bold text-slate-500 uppercase">FAC-PROV-{item.id ? item.id.split('-').pop() : ''}</span>
                                 </div>
                              </td>
                              <td className="py-6 px-6">
                                 <span className="text-sm font-black text-slate-800 uppercase truncate max-w-[150px] block">{item.vendor}</span>
                              </td>
                              <td className="py-6 px-6 text-right text-sm font-black text-slate-800 font-mono">{item.amount}</td>
                              <td className="py-6 px-6 text-center">
                                 <span className={`text-xs font-black px-2 py-0.5 rounded uppercase border ${
                                   item.status === 'ACTIVA' ? 'bg-[#8fb09f]/10 text-[#43584b] border-[#8fb09f]/20' :
                                   item.status === 'PENDIENTE' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                   'bg-slate-100 text-slate-500 border-slate-200'
                                 }`}>
                                   {item.status || 'DESCONOCIDO'}
                                 </span>
                              </td>
                              <td className="py-6 px-8 text-right">
                                 <button className="text-xs font-black text-[#0b5156] uppercase tracking-widest hover:underline transition-all">Ver factura</button>
                              </td>
                           </tr>
                         ))
                       ) : (
                         <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-400 font-bold uppercase text-xs">
                               No se encontraron registros de compras.
                            </td>
                         </tr>
                       )}
                    </tbody>
                  </table>
               </div>
            </article>
        </section>
      </div>
    </div>
  );
};

export default PurchasingHistory;
