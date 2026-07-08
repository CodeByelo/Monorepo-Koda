import { useState, useEffect } from 'react';
import { Truck, Plus, BookOpen, Search, FileText, AlertTriangle, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { DeliveryNoteForm } from './DeliveryNoteForm';
import { SalesOrderSelectorModal } from '@/components/sales/SalesOrderSelectorModal';

const DeliveryNotes = () => {
  const [deliveryNotes, setDeliveryNotes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showOrderSelector, setShowOrderSelector] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  useEffect(() => {
    const fetchNotes = async () => {
      setIsLoading(true);
      try {
        const data = await api.get<any[]>('/ventas/notas-entrega');
        setDeliveryNotes(data || []);
      } catch (error) {
        console.error("Error fetching delivery notes:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    const fetchRate = async () => {
      try {
        const res: any = await api.get('/tasas/bcv');
        if (res && res.valor) {
          setExchangeRate(res.valor);
        } else {
          setExchangeRate(36.50); // Fallback
        }
      } catch (error) {
        console.error("Error fetching rate:", error);
        setExchangeRate(36.50); // Fallback
      }
    };

    fetchNotes();
    fetchRate();
  }, []);

  const displayNotes = deliveryNotes;

  if (showNewForm) {
    return (
      <DeliveryNoteForm 
        initialData={selectedOrder}
        onCancel={() => {
          setShowNewForm(false);
          setSelectedOrder(null);
        }}
        onSubmit={(formData) => {
          console.log('Nota de Entrega Generada:', formData);
          setShowNewForm(false);
          setSelectedOrder(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
               <span className="bg-[#0b5156] text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest">Ventas</span>
               <span className="bg-blue-100 text-blue-600 text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                 Tasa: BS.S {exchangeRate ? exchangeRate.toFixed(2).replace('.', ',') : 'Cargando...'}
               </span>
            </div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Notas de Entrega (Remisiones)</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-2xl">
              Comprobante de despacho fisico de mercancia. Soporta la salida de inventario y precede a la factura de venta.
            </p>
          </div>
          <div className="flex gap-3">
             <button 
               onClick={() => setShowManualModal(true)}
               className="bg-white text-slate-500 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 flex items-center gap-2 tracking-widest shadow-sm hover:bg-slate-50 transition-colors"
             >
               <BookOpen size={16} className="text-blue-500" /> Manual de esta Opcion
             </button>
             <button 
               onClick={() => setShowOrderSelector(true)}
               className="bg-[#8fb0af] text-slate-800 px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 tracking-widest shadow-sm hover:bg-[#7a9998] transition-colors"
             >
               Desde Orden de Venta
             </button>
             <button 
               onClick={() => { setSelectedOrder(null); setShowNewForm(true); }}
               className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 tracking-widest shadow-lg shadow-green-900/20 hover:bg-[#073639] transition-colors"
             >
               Nueva Nota de Entrega
             </button>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {[
          { t: 'Notas Abiertas', v: displayNotes.length.toString(), desc: 'Sin factura emitida', c: 'text-amber-500' },
          { t: 'Despachadas Hoy', v: '0', desc: 'Salida confirmada', c: 'text-green-600' },
          { t: 'Pendientes de Despacho', v: '0', desc: 'En almacen', c: 'text-slate-800' },
          { t: 'Para Facturar', v: displayNotes.length.toString(), desc: 'Entrega confirmada', c: 'text-green-600' }
        ].map((kpi, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">{kpi.t}</p>
            <strong className={`text-4xl font-black ${kpi.c} tracking-tighter`}>{kpi.v}</strong>
            <p className="text-xs font-bold text-slate-400 uppercase mt-1">{kpi.desc}</p>
          </div>
        ))}
      </section>

      <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <h3 className="text-xl font-black text-slate-800 tracking-tighter uppercase mb-2">Notas de Entrega Activas</h3>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-8">Despachos pendientes de facturacion y en proceso de entrega.</p>
        
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <th className="pb-4 px-4">N. Nota</th>
                <th className="pb-4 px-4">Orden Venta</th>
                <th className="pb-4 px-4 text-right">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                <tr>
                  <td colSpan={3} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Cargando notas de entrega...
                  </td>
                </tr>
              ) : displayNotes.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    No se encontraron notas de entrega
                  </td>
                </tr>
              ) : (
                displayNotes.map((note, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-5 px-4 text-sm font-black text-slate-800 uppercase">{note.id || note.numero_nota}</td>
                    <td className="py-5 px-4 text-xs font-bold text-slate-400 uppercase tracking-widest">{note.ov || note.orden_venta_id || 'N/A'}</td>
                    <td className="py-5 px-4 text-right">
                       <Link to="/nueva" className="text-xs font-black text-[#0b5156] uppercase hover:text-[#083a3d] hover:underline transition-colors">Facturar</Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showOrderSelector && (
        <SalesOrderSelectorModal 
          onClose={() => setShowOrderSelector(false)}
          onSelectOrder={(order) => {
            setSelectedOrder({
              orderId: order.id || order.numero_orden,
              client: order.client || order.cliente,
              items: order.items || [
                { description: 'Producto desde Orden A', quantity: 2, stock: 10 },
                { description: 'Producto desde Orden B', quantity: 5, stock: 3 } // Ejemplo para forzar error visual
              ]
            });
            setShowOrderSelector(false);
            setShowNewForm(true);
          }}
        />
      )}

      {showManualModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-8 border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
             <div className="flex justify-between items-start mb-6">
               <div>
                 <h2 className="text-2xl font-black text-slate-800 uppercase mb-2">Ciclo de Venta: Remisiones</h2>
                 <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">¿Cómo funciona este módulo?</p>
               </div>
               <button onClick={() => setShowManualModal(false)} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors">
                 <X size={16} className="text-slate-500" />
               </button>
             </div>
             
             <div className="space-y-4">
               <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                 <div className="flex items-start gap-4">
                   <div className="bg-blue-100 text-blue-600 w-8 h-8 rounded-full flex items-center justify-center font-black shrink-0">1</div>
                   <div>
                     <h3 className="text-sm font-black text-slate-800 uppercase mb-1">Preparación (Despacho)</h3>
                     <p className="text-xs text-slate-600 font-medium leading-relaxed">
                       El equipo de almacén revisa las órdenes pendientes (botón <em>Desde Orden de Venta</em>) o crea un despacho directo (botón <em>Nueva Nota</em>). Solo pueden generarse despachos si hay <strong>Stock Suficiente</strong> en inventario.
                     </p>
                   </div>
                 </div>
               </div>

               <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                 <div className="flex items-start gap-4">
                   <div className="bg-amber-100 text-amber-600 w-8 h-8 rounded-full flex items-center justify-center font-black shrink-0">2</div>
                   <div>
                     <h3 className="text-sm font-black text-slate-800 uppercase mb-1">Salida Física</h3>
                     <p className="text-xs text-slate-600 font-medium leading-relaxed">
                       Al confirmar y emitir la nota de entrega, el sistema <strong>resta inmediatamente el inventario</strong> de tu almacén. Se imprime el documento físico con la placa y datos del transportista para acompañar la carga.
                     </p>
                   </div>
                 </div>
               </div>

               <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                 <div className="flex items-start gap-4">
                   <div className="bg-green-100 text-green-600 w-8 h-8 rounded-full flex items-center justify-center font-black shrink-0">3</div>
                   <div>
                     <h3 className="text-sm font-black text-slate-800 uppercase mb-1">Cierre (Facturación)</h3>
                     <p className="text-xs text-slate-600 font-medium leading-relaxed">
                       El documento queda en el historial y se marca como "Para Facturar". Esto permite a administración tener el control de qué despachos ya salieron a la calle, pero aún no se le han cobrado al cliente. <strong>La Nota no genera Cuentas por Cobrar fiscales.</strong>
                     </p>
                   </div>
                 </div>
               </div>
             </div>

             <div className="mt-8 text-right">
               <button onClick={() => setShowManualModal(false)} className="bg-slate-900 text-white px-8 py-3 rounded-xl text-xs font-black uppercase hover:bg-slate-800 transition-colors shadow-lg">
                 Entendido
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeliveryNotes;
