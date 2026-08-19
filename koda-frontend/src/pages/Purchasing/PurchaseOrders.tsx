import {
  Plus,
  Search,
  Eye,
  Package,
  Check,
  Printer,
  Maximize2,
  Minimize2,
  X,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { api } from '@/api/client';

const money = (value: unknown) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

// Compra.estado en el backend solo tiene tres valores reales: PENDIENTE
// (recién registrada, requiere autorización), ACTIVA (autorizada/vigente,
// lista para recibir mercancía) y ANULADA. No existen los estados
// "POR AUTORIZAR"/"AUTORIZADA"/"RECIBIDA" que usaba este componente antes —
// ver backend/routers/modulos_ext.py (crear_compra, ordenes_compra, etc.),
// que siempre filtran/comparan contra estos tres valores.
const ESTADOS_FILTRO = ['PENDIENTE', 'ACTIVA', 'ANULADA'];

const PurchaseOrders = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [detailOrder, setDetailOrder] = useState<any | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const res: any = await api.get('/compras/ordenes');
      setOrders(Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []));
    } catch (error) {
      console.error("Error fetching purchase orders", error);
      try {
        const res2: any = await api.get('/compras');
        setOrders(Array.isArray(res2) ? res2 : (Array.isArray(res2?.data) ? res2.data : []));
      } catch (e2) {}
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    const term = searchTerm.trim().toUpperCase();
    return orders.filter((oc) => {
      const estado = String(oc.status || oc.estado || '').toUpperCase();
      if (statusFilter && estado !== statusFilter) return false;
      if (!term) return true;
      const numero = String(oc.id || oc.numero_orden || oc.numero_factura || '').toUpperCase();
      const proveedor = String(oc.vendor?.nombre || oc.vendor || oc.proveedor || '').toUpperCase();
      const rif = String(oc.vendor?.rif || oc.rif || '').toUpperCase();
      return numero.includes(term) || proveedor.includes(term) || rif.includes(term);
    });
  }, [orders, searchTerm, statusFilter]);

  const handleAutorizar = async (oc: any) => {
    const compraId = oc.compra_id ?? oc.id;
    if (!compraId) return;
    setProcessingId(compraId);
    try {
      await api.post(`/compras/${compraId}/autorizar`);
      showToast(`Orden ${oc.id || oc.numero_orden || compraId} autorizada`, 'success');
      fetchOrders();
    } catch (error: any) {
      showToast(error?.response?.data?.detail || 'Error al autorizar la orden', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRecibir = (oc: any) => {
    const numero = oc.id || oc.numero_orden || oc.numero_factura || '';
    navigate(`/compras/recepcion${numero ? `?orden=${encodeURIComponent(numero)}` : ''}`);
  };

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
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-6 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-black uppercase focus:outline-none focus:border-[#0b5156] shadow-sm"
              >
                 <option value="">Todos los estados</option>
                 {ESTADOS_FILTRO.map((estado) => (
                   <option key={estado} value={estado}>{estado}</option>
                 ))}
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
                 ) : filteredOrders.length === 0 ? (
                   <tr>
                     <td colSpan={7} className="py-12 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                       No hay órdenes de compra registradas.
                     </td>
                   </tr>
                 ) : (
                   filteredOrders.map((oc, i) => {
                     const estado = String(oc.status || oc.estado || '').toUpperCase();
                     return (
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
                            {estado || 'PENDIENTE'}
                         </span>
                      </td>
                      <td className="py-8 px-10 text-right">
                         <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setDetailOrder(oc)}
                              className="p-2.5 bg-white text-slate-600 rounded-xl hover:bg-[#0b5156] hover:text-white transition-all shadow-sm"
                              title="Ver Detalle"
                            >
                               <Eye size={16} />
                            </button>
                            {estado === 'PENDIENTE' && (
                              <button
                                onClick={() => handleAutorizar(oc)}
                                disabled={processingId === (oc.compra_id ?? oc.id)}
                                className="p-2.5 bg-green-100 text-green-700 rounded-xl hover:bg-green-600 hover:text-white transition-all shadow-sm disabled:opacity-50"
                                title="Autorizar"
                              >
                                 <Check size={16} />
                              </button>
                            )}
                            {estado === 'ACTIVA' && (
                              <button
                                onClick={() => handleRecibir(oc)}
                                className="p-2.5 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                                title="Recibir Mercancía"
                              >
                                 <Package size={16} />
                              </button>
                            )}
                            <button
                              onClick={() => window.print()}
                              className="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-200 transition-all shadow-sm"
                              title="Imprimir"
                            >
                               <Printer size={16} />
                            </button>
                         </div>
                      </td>
                   </tr>
                   );})
                 )}
              </tbody>
           </table>
        </div>

        <div className="p-8 border-t border-slate-100 bg-slate-50/30 flex justify-between items-center">
           <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Mostrando {filteredOrders.length} de {orders.length} órdenes</span>
        </div>
      </article>

      {detailOrder && (
        <div className="fixed inset-0 bg-slate-900/80 z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl p-10 relative">
            <button onClick={() => setDetailOrder(null)} className="absolute top-8 right-8 text-slate-400 hover:text-slate-800"><X size={24} /></button>
            <h3 className="text-2xl font-black text-[#0b5156] tracking-tighter uppercase mb-1">Orden {detailOrder.id || detailOrder.numero_orden || detailOrder.numero_factura}</h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Detalle de la orden de compra</p>
            <div className="space-y-4 text-sm">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="font-black text-slate-400 uppercase text-xs">Fecha</span>
                <span className="font-bold text-slate-800">{detailOrder.date || detailOrder.fecha || '-'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="font-black text-slate-400 uppercase text-xs">Proveedor</span>
                <span className="font-bold text-slate-800">{detailOrder.vendor?.nombre || detailOrder.vendor || detailOrder.proveedor || '-'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="font-black text-slate-400 uppercase text-xs">RIF</span>
                <span className="font-bold text-slate-800">{detailOrder.vendor?.rif || detailOrder.rif || '-'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="font-black text-slate-400 uppercase text-xs">Solicitante</span>
                <span className="font-bold text-slate-800">{detailOrder.requester || detailOrder.solicitante || 'SISTEMA'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="font-black text-slate-400 uppercase text-xs">Monto</span>
                <span className="font-black text-[#0b5156]">{money(detailOrder.amount || detailOrder.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-black text-slate-400 uppercase text-xs">Estado</span>
                <span className="font-bold text-slate-800 uppercase">{detailOrder.status || detailOrder.estado || 'PENDIENTE'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && typeof document !== 'undefined' && createPortal(
        <div className="fixed bottom-5 right-5 z-[9999] animate-in slide-in-from-bottom duration-300">
          <div className={`px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 ${toast.type === 'success' ? 'bg-[#0b5156] border border-[#0b5156]/20 text-white' : 'bg-red-600 border border-red-500 text-white'}`}>
            {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
            <span className="font-bold text-sm tracking-wide uppercase font-mono">{toast.message}</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default PurchaseOrders;
