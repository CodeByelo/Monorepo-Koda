import { 
  Plus, 
  Search, 
  Eye, 
  Package, 
  Check,
  Printer,
  ChevronRight,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';

const PurchaseOrders = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const res: any = await api.get('/compras/ordenes');
        setOrders(res || []);
      } catch (error) {
        console.error("Error fetching purchase orders", error);
        // Fallback or generic fetch if /compras/ordenes fails
        try {
          const res2: any = await api.get('/compras');
          setOrders(res2.data || res2 || []);
        } catch (e2) {}
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrders();
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-2">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">SISTEMA DE GESTIÓN DOCUMENTOS</p>
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Órdenes de Compra</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-2xl">
              Control de pedidos emitidos y cumplimiento operativo.
            </p>
          </div>
          <div className="flex gap-3">
             <Link to="nueva" className="bg-[#0b5156] text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 tracking-widest shadow-lg shadow-green-900/20 hover:bg-[#083a3d]">
               <Plus size={16} /> Nueva Orden
             </Link>
          </div>
        </div>
      </header>

      <article className={`bg-white border border-slate-200 shadow-sm overflow-hidden transition-all duration-300 ${isExpanded ? 'flex flex-col h-full fixed inset-4 z-50 rounded-3xl shadow-2xl' : 'rounded-[2.5rem]'}`}>
        <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
           <div className="space-y-1">
              <h2 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">Historial de Órdenes de Compra</h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Control de pedidos emitidos y cumplimiento</p>
           </div>
           <div className="flex gap-4">
              <div className="relative">
                 <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                 <input 
                   type="text" 
                   placeholder="Buscar OC..." 
                   className="pl-12 pr-6 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold focus:outline-none focus:border-[#0b5156] w-64 shadow-sm"
                   value={searchTerm}
                   onChange={(e) => setSearchTerm(e.target.value)}
                 />
              </div>
              <select className="px-6 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-black uppercase focus:outline-none focus:border-[#0b5156] shadow-sm">
                 <option>Todos los estados</option>
                 <option>Pendiente</option>
                 <option>Autorizada</option>
                 <option>Recibida</option>
              </select>
              <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-3 bg-white border border-slate-200 text-slate-500 rounded-2xl hover:bg-slate-50 transition-colors shadow-sm"
                title={isExpanded ? "Restaurar vista" : "Pantalla completa"}
              >
                {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
           </div>
        </div>

        <div className={`overflow-x-auto no-scrollbar ${isExpanded ? 'flex-1' : ''}`}>
           <table className="w-full text-left">
              <thead>
                 <tr className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] border-b border-slate-100">
                    <th className="py-6 px-10">Fecha</th>
                    <th className="py-6 px-6">N° Orden</th>
                    <th className="py-6 px-6">Proveedor / RIF</th>
                    <th className="py-6 px-6">Solicitante</th>
                    <th className="py-6 px-6 text-right">Monto (USD)</th>
                    <th className="py-6 px-6 text-center">Estado</th>
                    <th className="py-6 px-10 text-right">Acciones</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                 {isLoading ? (
                   <tr>
                     <td colSpan={7} className="py-12 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                       Cargando órdenes de compra...
                     </td>
                   </tr>
                 ) : orders.length === 0 ? (
                   <tr>
                     <td colSpan={7} className="py-12 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                       No hay órdenes de compra registradas.
                     </td>
                   </tr>
                 ) : (
                   orders.map((oc, i) => (
                     <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-8 px-10 text-xs font-bold text-slate-400 uppercase">{oc.date || oc.fecha}</td>
                      <td className="py-8 px-6">
                         <strong className="text-sm font-black text-slate-800 tracking-tighter uppercase font-mono">{oc.id || oc.numero_orden || oc.numero_factura}</strong>
                      </td>
                      <td className="py-8 px-6">
                         <div className="flex flex-col">
                            <span className="text-xs font-black text-[#0b5156] uppercase truncate max-w-[220px]">{oc.vendor?.nombre || oc.vendor || oc.proveedor || 'Proveedor'}</span>
                            <span className="text-[9px] font-bold text-slate-400 tracking-widest uppercase">{oc.vendor?.rif || oc.rif || 'J-00000000-0'}</span>
                         </div>
                      </td>
                      <td className="py-8 px-6 text-xs font-black text-slate-500 uppercase tracking-widest">{oc.requester || oc.solicitante || 'SISTEMA'}</td>
                      <td className="py-8 px-6 text-right text-lg font-black text-slate-800 tracking-tighter">${Number(oc.amount || oc.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="py-8 px-6 text-center">
                         <span className={`${oc.color || 'bg-slate-100 text-slate-700'} text-[8px] font-black px-3 py-1 rounded-md uppercase tracking-tighter shadow-sm border border-black/5`}>
                            {oc.status || oc.estado || 'PENDIENTE'}
                         </span>
                      </td>
                      <td className="py-8 px-10 text-right">
                         <div className="flex justify-end gap-2">
                            <button className="p-2.5 bg-white text-slate-600 rounded-xl hover:bg-[#0b5156] hover:text-white transition-all shadow-sm" title="Ver Detalle">
                               <Eye size={16} />
                            </button>
                            {(oc.status === 'POR AUTORIZAR' || oc.estado === 'POR AUTORIZAR') && (
                              <button className="p-2.5 bg-green-100 text-green-700 rounded-xl hover:bg-green-600 hover:text-white transition-all shadow-sm" title="Autorizar">
                                 <Check size={16} />
                              </button>
                            )}
                            {(oc.status === 'AUTORIZADA' || oc.estado === 'AUTORIZADA') && (
                              <button className="p-2.5 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm" title="Recibir Mercancía">
                                 <Package size={16} />
                              </button>
                            )}
                            <button className="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-200 transition-all shadow-sm">
                               <Printer size={16} />
                            </button>
                         </div>
                      </td>
                   </tr>
                   ))
                 )}
              </tbody>
           </table>
        </div>

        <div className="p-8 border-t border-slate-100 bg-slate-50/30 flex justify-between items-center">
           <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Mostrando {orders.length} órdenes abiertas</span>
           <div className="flex gap-3">
              <button className="px-6 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase text-slate-300 cursor-not-allowed shadow-sm">Anterior</button>
              <button className="px-6 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase text-slate-500 hover:bg-slate-50 shadow-sm flex items-center gap-2">
                 Siguiente <ChevronRight size={14} />
              </button>
           </div>
        </div>
      </article>
    </div>
  );
};

export default PurchaseOrders;
