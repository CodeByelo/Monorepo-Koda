import {
  Search,
  TrendingUp,
  Download,
  Calendar,
  X
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { Toast } from '@/components/common/Toast';

const Kardex = () => {
  const [productos, setProductos] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchId, setSearchId] = useState<string | number>('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [movements, setMovements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [kardexStats, setKardexStats] = useState<any>(null);

  // States for date filtering and toasts
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    // Fetch products list for suggestions
    api.get<any[]>('/productos')
      .then(data => setProductos(data))
      .catch(err => console.error("Error loading products:", err));

    // Fetch general stats for Kardex
    const fetchStats = async () => {
      try {
        const res = await api.get<any>('/inventario/kardex-stats');
        setKardexStats(res);
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
    };
    fetchStats();
  }, []);

  const triggerSearchForId = async (id: number | string) => {
    setIsLoading(true);
    try {
      const data = await api.get<any[]>(`/inventario/kardex/${id}`);
      if (data && data.length > 0) {
        setMovements(data);
        setCurrentPage(1); // Reiniciar a la primera página al buscar
        showToast('Historial del Kardex cargado con éxito.', 'success');
      } else {
        showToast('Producto sin movimientos registrados en el Kardex.', 'error');
        setMovements([]);
      }
    } catch (error) {
      console.error("Error al buscar Kardex:", error);
      showToast('Error al consultar el Kardex del producto.', 'error');
      setMovements([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => {
    if (searchId) {
      triggerSearchForId(searchId);
      return;
    }
    // Fallback: search for first matched query product
    if (searchQuery) {
      const match = productos.find(p => 
        p.nombre.toLowerCase().includes(searchQuery.toLowerCase()) || 
        p.sku.toLowerCase().includes(searchQuery.toLowerCase())
      );
      if (match) {
        setSearchId(match.id);
        setSearchQuery(match.nombre);
        setShowSuggestions(false);
        triggerSearchForId(match.id);
      } else {
        showToast('No se encontró ningún producto coincidente.', 'error');
      }
    }
  };

  // Filtrar movimientos en memoria por rango de fechas
  const filteredMovements = movements.filter((m: any) => {
    if (!m.fecha) return true;
    const itemDate = new Date(m.fecha).toISOString().split('T')[0];
    if (startDate && itemDate < startDate) return false;
    if (endDate && itemDate > endDate) return false;
    return true;
  });

  // Cálculos para paginación
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentMovements = filteredMovements.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredMovements.length / itemsPerPage);

  const handleExportPDF = () => {
    if (!searchId || movements.length === 0) {
      showToast("Primero busque un producto válido para exportar su Kardex.", "error");
      return;
    }
    window.open(`/api/inventario/kardex/${searchId}/pdf`, '_blank');
  };

  // Filter products for suggestions dropdown
  const filteredSuggestions = searchQuery
    ? productos.filter(p => 
        p.nombre.toLowerCase().includes(searchQuery.toLowerCase()) || 
        p.sku.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 5)
    : [];

  const kpiCards = [
    {
      label: 'Total Movimientos',
      value: String(kardexStats?.movimientos || 0),
      desc: 'Registrados en Kardex',
      color: 'text-[#0b5156]'
    },
    {
      label: 'Productos Trazados',
      value: String(kardexStats?.productos_con_movimiento || 0),
      desc: 'Con Actividad en Sistema',
      color: 'text-blue-600'
    },
    {
      label: 'Costo Promedio (CPP)',
      value: kardexStats?.controlCostos?.[0]?.valor || '$0.00',
      desc: 'Promedio ponderado del catálogo',
      color: 'text-[#0b5156]'
    },
    {
      label: 'Valorización del Stock',
      value: kardexStats?.controlCostos?.[1]?.valor || '$0.00',
      desc: 'Capital inmovilizado total',
      color: 'text-amber-600'
    }
  ];

  const ultimoMovFecha = kardexStats?.kpis?.[2]?.valor || 'N/A';

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Dropdown Backdrop */}
      {showSuggestions && (
        <div 
          className="fixed inset-0 z-[400]" 
          onClick={() => setShowSuggestions(false)}
        />
      )}

      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Kardex de Inventario</h1>
              <div className="flex items-center gap-2">
                <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border border-emerald-200">
                  Libro Inmutable
                </span>
                <span className="bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border border-amber-200">
                  Último: {ultimoMovFecha}
                </span>
              </div>
            </div>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-2xl">
              Historial trazable de entradas, salidas y ajustes con valorización dinámica de existencias (CPP).
            </p>
          </div>
          <div className="flex gap-3">
             <button onClick={() => setShowDatePicker(!showDatePicker)} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase border flex items-center gap-2 tracking-widest shadow-sm transition-all ${showDatePicker ? 'bg-[#0b5156] border-[#0b5156] text-white shadow-lg' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
               <Calendar size={14} /> Filtrar Fecha
             </button>
             <button onClick={handleExportPDF} className="bg-[#0b5156] text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 tracking-widest shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
               <Download size={16} /> Exportar Reporte
             </button>
          </div>
        </div>
      </header>

      {showDatePicker && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-wrap gap-6 items-center animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Desde:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-700 focus:outline-none focus:border-[#0b5156] uppercase"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Hasta:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
              className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-700 focus:outline-none focus:border-[#0b5156] uppercase"
            />
          </div>
          {(startDate || endDate) && (
            <button
              onClick={() => { setStartDate(''); setEndDate(''); setCurrentPage(1); }}
              className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:underline flex items-center gap-1"
            >
              <X size={12} /> Limpiar Filtro
            </button>
          )}
        </div>
      )}

      {/* Grid de 4 Columnas (KPIs principales y costos) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {kpiCards.map((stat: any, i: number) => {
          return (
            <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-32 group hover:border-[#0b5156]/30 transition-all">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider group-hover:text-[#0b5156] transition-colors">{stat.label}</p>
              <div className="space-y-0.5">
                <strong className={`text-xl font-black ${stat.color} tracking-tighter font-mono`}>{stat.value}</strong>
                <p className="text-[9px] font-bold text-slate-400 uppercase leading-tight tracking-tight">{stat.desc}</p>
              </div>
            </div>
          );
        })}
      </section>

      {/* Checklist Horizontal Simétrico de Resumen de Control */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">
        <div className="flex items-center gap-3 justify-center lg:justify-start">
          <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-xl text-[9px] font-black tracking-widest border border-amber-200 shrink-0">VALIDAR</span>
          <span>Ajustes pendientes (Aprobación y firma)</span>
        </div>
        <div className="flex items-center gap-3 justify-center lg:justify-start lg:border-l lg:border-slate-200 lg:pl-6">
          <span className="bg-blue-100 text-blue-800 px-2.5 py-1 rounded-xl text-[9px] font-black tracking-widest border border-blue-200 shrink-0">CRUZAR</span>
          <span>Recepciones físicas vs Orden de Compra</span>
        </div>
        <div className="flex items-center gap-3 justify-center lg:justify-start lg:border-l lg:border-slate-200 lg:pl-6">
          <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-xl text-[9px] font-black tracking-widest border border-emerald-200 shrink-0">AUDITAR</span>
          <span>Trazabilidad inmutable de movimientos</span>
        </div>
      </div>

      {/* Tabla de Movimientos del Kardex al 100% de Ancho */}
      <article className="w-full bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
         <div className="flex justify-between items-center flex-wrap gap-4">
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Movimientos de Inventario</h3>
            <div className="relative flex bg-slate-50 border border-slate-200 rounded-xl overflow-visible shadow-sm z-[450]">
               <div className="relative flex items-center">
                  <Search className="absolute left-3 text-slate-400" size={14} />
                  <input
                    type="text"
                    placeholder="Buscar producto por nombre o SKU..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setSearchId('');
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="pl-9 pr-4 py-2.5 bg-transparent text-xs font-bold focus:outline-none focus:bg-slate-50 w-64 transition-all"
                  />
               </div>
               <button onClick={handleSearch} disabled={isLoading} className="px-5 py-2.5 bg-[#0b5156] text-white text-[10px] font-black uppercase hover:bg-[#083a3d] transition-colors disabled:opacity-70 rounded-r-xl">
                  Buscar
               </button>

               {/* Suggestions Dropdown */}
               {showSuggestions && filteredSuggestions.length > 0 && (
                 <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-2xl z-[500] max-h-60 overflow-y-auto no-scrollbar">
                   {filteredSuggestions.map(p => (
                     <button
                       key={p.id}
                       onClick={() => {
                         setSearchId(p.id);
                         setSearchQuery(p.nombre);
                         setShowSuggestions(false);
                         triggerSearchForId(p.id);
                       }}
                       className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-50 last:border-0 flex flex-col gap-0.5"
                     >
                       <span className="text-xs font-bold text-slate-800 uppercase leading-tight">{p.nombre}</span>
                       <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">SKU: {p.sku} | ID: {p.id}</span>
                     </button>
                   ))}
                 </div>
               )}
            </div>
         </div>

         <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left">
               <thead>
                  <tr className="text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                     <th className="py-4 px-6">Fecha / Movimiento</th>
                     <th className="py-4 px-4 text-center">Tipo</th>
                     <th className="py-4 px-4 text-right">Cant.</th>
                     <th className="py-4 px-6 text-right">Referencia (Origen)</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                  {isLoading ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse">
                        Consultando Libro Inmutable...
                      </td>
                    </tr>
                  ) : movements.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                        Ingrese o seleccione un producto para consultar su Kardex.
                      </td>
                    </tr>
                  ) : currentMovements.map((m: any) => (
                    <tr key={m.id || Math.random()} className={`group hover:bg-slate-50 transition-colors border-l-4 ${m.cantidad > 0 ? 'border-green-500' : 'border-red-500'}`}>
                       <td className="py-5 px-6">
                          <div className="flex flex-col">
                             <span className="text-xs font-black text-slate-800 uppercase">{new Date(m.fecha).toLocaleString('es-VE')}</span>
                             {m.id && <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">KDX-{String(m.id).padStart(5, '0')}</span>}
                          </div>
                       </td>
                       <td className="py-5 px-4 text-center">
                          <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter ${m.cantidad > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{m.tipo_movimiento || m.tipo}</span>
                       </td>
                       <td className={`py-5 px-4 text-right text-xs font-black ${m.cantidad > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {m.cantidad > 0 ? '+' : ''}{m.cantidad}
                       </td>
                       <td className="py-5 px-6 text-right">
                          <span className="text-xs font-bold text-slate-600 uppercase font-mono">{m.documento_referencia || m.doc || 'N/A'}</span>
                       </td>
                    </tr>
                  ))}
               </tbody>
            </table>

            {movements.length > 0 && (
                <div className="flex justify-between items-center px-6 py-4 border-t border-slate-100 bg-slate-50/50">
                  <div className="flex items-center gap-4">
                     <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        Página {currentPage} de {totalPages || 1}
                     </span>
                     <select
                        value={itemsPerPage}
                        onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                        className="text-[10px] font-bold text-slate-600 uppercase bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-[#0b5156] transition-colors cursor-pointer"
                     >
                        <option value={10}>10 por página</option>
                        <option value={25}>25 por página</option>
                        <option value={50}>50 por página</option>
                     </select>
                  </div>
                  <div className="flex gap-2">
                     <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-4 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-black text-slate-600 uppercase hover:bg-slate-50 disabled:opacity-50 transition-all"
                     >
                        Anterior
                     </button>
                     <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-4 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-black text-slate-600 uppercase hover:bg-slate-50 disabled:opacity-50 transition-all"
                     >
                        Siguiente
                     </button>
                  </div>
                </div>
             )}
         </div>
      </article>

      {/* Floating Toast Notification */}
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

export default Kardex;
