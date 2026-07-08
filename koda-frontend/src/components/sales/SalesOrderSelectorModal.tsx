import React, { useState, useEffect } from 'react';
import { X, Search, FileText, ArrowRight } from 'lucide-react';
import { api } from '@/api/client';

interface SalesOrderSelectorModalProps {
  onClose: () => void;
  onSelectOrder: (order: any) => void;
}

export const SalesOrderSelectorModal: React.FC<SalesOrderSelectorModalProps> = ({ onClose, onSelectOrder }) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchOrders = async () => {
      setIsLoading(true);
      try {
        const data = await api.get<any[]>('/ventas/ordenes');
        const validOrders = (data || []).filter(o => 
          (o.estado || o.status)?.toLowerCase() !== 'rechazada' && 
          (o.estado || o.status)?.toLowerCase() !== 'entregada'
        );

        setOrders(validOrders);
      } catch (error) {
        console.error("Error fetching orders:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrders();
  }, []);

  const filteredOrders = orders.filter(o => {
    const term = searchTerm.toLowerCase();
    const id = (o.id || o.numero_orden || '').toString().toLowerCase();
    const client = (o.client || o.cliente || '').toLowerCase();
    return id.includes(term) || client.includes(term);
  });

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl rounded-3xl p-8 border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex justify-between items-start mb-6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#8fb0af] text-slate-800 rounded-2xl">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter mb-1">Seleccionar Orden Base</h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Elige la Orden de Venta que deseas despachar
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        {/* Búsqueda */}
        <div className="relative mb-6 shrink-0">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por número de orden o cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-3.5 text-xs font-bold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-[#8fb0af] focus:ring-1 transition-all"
          />
        </div>

        {/* Tabla */}
        <div className="flex-1 overflow-auto border border-slate-100 rounded-2xl shadow-sm">
          <table className="w-full text-left border-collapse relative">
            <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 shadow-sm">
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">
                <th className="py-4 px-5">N. Orden</th>
                <th className="py-4 px-5">Cliente</th>
                <th className="py-4 px-5 text-right">Monto Base</th>
                <th className="py-4 px-5 text-center">Estado Actual</th>
                <th className="py-4 px-5 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Cargando órdenes disponibles...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">
                    No se encontraron órdenes pendientes
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="py-4 px-5 text-sm font-black text-slate-800 uppercase">{order.id || order.numero_orden}</td>
                    <td className="py-4 px-5 text-xs font-bold text-slate-600 uppercase tracking-wide">{order.client || order.cliente}</td>
                    <td className="py-4 px-5 text-xs font-black text-slate-800 text-right">
                      {order.amount || `$${Number(order.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                    </td>
                    <td className="py-4 px-5 text-center">
                      <span className="bg-amber-100 text-amber-700 px-2.5 py-1 rounded-md text-[9px] font-black uppercase">
                        {order.status || order.estado || 'Pendiente'}
                      </span>
                    </td>
                    <td className="py-4 px-5 text-right">
                      <button 
                        onClick={() => onSelectOrder(order)}
                        className="bg-white border border-slate-200 text-slate-600 hover:bg-[#8fb0af] hover:text-slate-900 hover:border-[#8fb0af] px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center justify-end gap-2 transition-all w-full shadow-sm"
                      >
                        Despachar <ArrowRight size={12} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
};
