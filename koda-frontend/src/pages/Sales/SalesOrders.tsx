import { useState, useEffect } from 'react';
import { FileText, Ban, X, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';

const SalesOrders = () => {
  const [isClientBlocked, setIsClientBlocked] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showManualModal, setShowManualModal] = useState(false);

  useEffect(() => {
    const fetchOrders = async () => {
      setIsLoading(true);
      try {
        const data = await api.get<any[]>('/ventas/ordenes');
        setOrders(data || []);
      } catch (error) {
        console.error("Error fetching sales orders:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrders();
  }, []);

  const displayOrders = orders;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Ordenes de Venta</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-2xl">
              Gestion del ciclo comercial: Cotizacion - Orden de Venta - Nota de Entrega - Factura. Trazabilidad completa de cada operacion.
            </p>
          </div>
          <div className="flex gap-3">
             <button 
               onClick={() => setShowManualModal(true)}
               className="bg-white text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 flex items-center gap-2 tracking-widest shadow-sm hover:bg-slate-50 transition-colors"
             >
               <BookOpen size={16} className="text-[#8fb09f]" /> Manual de esta Opcion
             </button>
             <Link 
               to="/nueva"
               className="bg-[#43584b] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 tracking-widest shadow-lg hover:bg-[#2f4035] transition-colors"
             >
               Nueva Factura Directa
             </Link>
          </div>
        </div>

        {isClientBlocked && (
          <div className="bg-[#e11d48] text-white rounded-2xl p-6 flex items-center gap-6 shadow-xl shadow-red-900/20 mb-2 relative group">
            <div className="w-12 h-12 bg-white text-[#e11d48] rounded-full flex items-center justify-center flex-shrink-0">
               <Ban size={24} strokeWidth={3} />
            </div>
            <div>
               <h3 className="text-lg font-black uppercase tracking-tight">CLIENTE BLOQUEADO POR MOROSIDAD: Farmacia Central</h3>
               <p className="text-xs font-bold opacity-90 uppercase">Exceso de Limite Critico ({">"}10%): Saldo $6200 / Limite $5000</p>
               <p className="text-xs font-bold opacity-75 mt-1 uppercase">Se ha inhabilitado la creacion de nuevas Ordenes de Venta. Dirija al cliente al modulo de Cobranzas para regularizar su situacion.</p>
            </div>
            <button 
              onClick={() => setIsClientBlocked(false)}
              className="ml-auto bg-white/10 hover:bg-white/20 text-white text-xs font-black px-4 py-2 rounded-lg uppercase transition-all"
            >
              Simular Desbloqueo
            </button>
          </div>
        )}
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {[
          { t: 'Ordenes Abiertas', v: displayOrders.length.toString(), desc: 'En proceso', c: 'text-white bg-koda-main' },
          { t: 'Pendientes Entrega', v: '0', desc: 'Con Nota de Entrega', c: 'text-[#43584b] bg-white' },
          { t: 'Para Facturar', v: '0', desc: 'Listas para facturar', c: 'text-[#0b5156] bg-white' },
          { t: 'Monto en Ordenes', v: `$${displayOrders.reduce((sum, o) => sum + Number(o.total || o.amount || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, desc: 'Ventas comprometidas', c: 'text-slate-800 bg-white' }
        ].map((kpi, i) => (
          <div key={i} className={`p-8 rounded-3xl border border-slate-200 shadow-sm ${kpi.c.includes('bg-koda-main') ? 'bg-koda-main text-white' : 'bg-white'}`}>
            <p className={`text-xs font-black uppercase tracking-widest mb-4 ${kpi.c.includes('bg-koda-main') ? 'text-white' : 'text-slate-500'}`}>{kpi.t}</p>
            <strong className={`text-4xl font-black tracking-tighter ${kpi.c.includes('bg-koda-main') ? 'text-white' : kpi.c.split(' ')[0]}`}>{kpi.v}</strong>
            <p className={`text-xs font-bold mt-2 uppercase ${kpi.c.includes('bg-koda-main') ? 'text-white/80' : 'text-slate-500'}`}>{kpi.desc}</p>
          </div>
        ))}
      </section>

      <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm mt-6">
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-xl font-black text-slate-800 tracking-tighter uppercase">Ordenes de Venta Activas</h3>
        </div>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">
                <th className="pb-4 px-4">N. Orden</th>
                <th className="pb-4 px-4">Cliente</th>
                <th className="pb-4 px-4">Monto</th>
                <th className="pb-4 px-4 text-center">Estado</th>
                <th className="pb-4 px-4 text-right">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Cargando ordenes...
                  </td>
                </tr>
              ) : displayOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    No se encontraron ordenes
                  </td>
                </tr>
              ) : displayOrders.map((order, i) => (
                <tr key={i} className="hover:bg-[#bdafa1]/5 transition-colors">
                  <td className="py-5 px-4 text-sm font-black text-slate-800 uppercase">{order.id || order.numero_orden}</td>
                  <td className="py-5 px-4 text-xs font-bold text-slate-500 uppercase">{order.client || order.cliente}</td>
                  <td className="py-5 px-4 text-sm font-black text-slate-800">{order.amount || `$${Number(order.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}</td>
                  <td className="py-5 px-4 text-center">
                    <span className={`${order.statusColor || 'bg-slate-100 text-slate-700'} px-2 py-1 rounded text-[9px] font-black uppercase`}>
                      {order.status || order.estado}
                    </span>
                  </td>
                  <td className="py-5 px-4 text-right">
                    <button className="text-xs font-black text-[#0b5156] uppercase hover:underline">Ver detalle</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showManualModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-8 border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
             <div className="flex justify-between items-start mb-6">
               <div>
                 <h2 className="text-2xl font-black text-slate-800 uppercase mb-2">Ciclo de Venta: Órdenes</h2>
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
                     <h3 className="text-sm font-black text-slate-800 uppercase mb-1">Confirmación (La Orden)</h3>
                     <p className="text-xs text-slate-600 font-medium leading-relaxed">
                       Es el documento legal donde el cliente ya aceptó comprar. Representa ingresos potenciales seguros. Una Orden "Aprobada" <strong>reserva el inventario</strong> temporalmente hasta que se despacha.
                     </p>
                   </div>
                 </div>
               </div>

               <div className="bg-rose-50 p-6 rounded-2xl border border-rose-100">
                 <div className="flex items-start gap-4">
                   <div className="bg-rose-200 text-rose-700 w-8 h-8 rounded-full flex items-center justify-center font-black shrink-0">2</div>
                   <div className="flex-1">
                     <h3 className="text-sm font-black text-rose-800 uppercase mb-1">Auditoría de Riesgo Crediticio</h3>
                     <p className="text-xs text-rose-700/90 font-medium leading-relaxed mb-3">
                       El sistema verifica en tiempo real si el cliente tiene facturas vencidas o superó su límite de crédito. De ser así, <strong>bloquea la creación de órdenes</strong> automáticamente para proteger las finanzas.
                     </p>
                     
                     <div className="flex justify-end">
                       {!isClientBlocked ? (
                         <button 
                           onClick={() => { setIsClientBlocked(true); setShowManualModal(false); }}
                           className="bg-white text-rose-600 hover:bg-rose-500 hover:text-white border-rose-200 px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 transition-all border shadow-sm"
                         >
                           Simular Bloqueo
                         </button>
                       ) : (
                         <div className="text-[9px] font-black text-rose-500 bg-white px-4 py-2 rounded-xl border border-rose-200 uppercase shadow-sm">
                           Simulación Activa
                         </div>
                       )}
                     </div>
                   </div>
                 </div>
               </div>

               <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                 <div className="flex items-start gap-4">
                   <div className="bg-emerald-100 text-emerald-600 w-8 h-8 rounded-full flex items-center justify-center font-black shrink-0">3</div>
                   <div>
                     <h3 className="text-sm font-black text-slate-800 uppercase mb-1">Ejecución (Caminos Paralelos)</h3>
                     <p className="text-xs text-slate-600 font-medium leading-relaxed">
                       Desde la orden nacen dos caminos: El <strong>Logístico</strong> (crear una Nota de Entrega para despachar la mercancía de almacén) y El <strong>Financiero</strong> (Facturar la orden para cobrarle al cliente).
                     </p>
                   </div>
                 </div>
               </div>
             </div>

             <div className="mt-8 text-right">
               <button onClick={() => setShowManualModal(false)} className="bg-[#0b5156] text-white px-8 py-3 rounded-xl text-xs font-black uppercase hover:bg-[#073639] transition-colors shadow-lg shadow-[#0b5156]/20">
                 Entendido
               </button>
             </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SalesOrders;
