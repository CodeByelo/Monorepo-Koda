import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/api/client';
import { useAuth } from '@/providers/AuthProvider';
import { 
  Search, 
  Banknote, 
  Plus, 
  Zap,
  Monitor,
  Calculator,
  CheckCircle,
  ArrowRight,
  Package
} from 'lucide-react';

const POS = () => {
  const { userName } = useAuth();
  const [cart, setCart] = useState<any[]>([]);
  const [recentTickets, setRecentTickets] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [totalHoy, setTotalHoy] = useState(0);
  const [countHoy, setCountHoy] = useState(0);
  const [tasaBCV, setTasaBCV] = useState(0);
  const [criticos, setCriticos] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [clientes, setClientes] = useState<any[]>([]);
  const [client, setClient] = useState('');
  const [metodoPago, setMetodoPago] = useState<'Efectivo' | 'Divisa' | 'Transferencia' | 'PagoMovil'>('Divisa');
  const [toast, setToast] = useState<{message: string, type: 'error' | 'success'} | null>(null);

  const showToast = (message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchContext = () => {
    api.get<any>('/ventas/pos/contexto').then((res) => {
      setProductos(res?.productos || []);
      setTotalHoy(res?.total_hoy || 0);
      setCountHoy(res?.count_hoy || 0);
      setTasaBCV(res?.tasa_bcv || 0);
      setRecentTickets((res?.tickets_recientes || []).map((t: any) => ({
        ...t,
        color: t.status === 'EMITIDO' ? 'bg-[#8fb09f]/10 text-[#43584b] border-[#8fb09f]/20' : 'bg-[#bdafa1]/10 text-slate-500 border-[#bdafa1]/20',
      })));
    }).catch(console.error);

    api.get<any[]>('/inventario/criticos').then((data) => {
      setCriticos(data || []);
    }).catch(console.error);

    api.get<any[]>('/clientes').then((data) => {
      setClientes(data || []);
      if (data && data.length > 0) {
        const cf = data.find(c => c.rif === 'G-00000000-0' || c.nombre.toLowerCase().includes('consumidor'));
        if (cf) {
          setClient(cf.id.toString());
        } else {
          setClient(data[0].id.toString());
        }
      }
    }).catch(console.error);
  };

  useEffect(() => {
    fetchContext();
  }, []);

  const handleAddToCart = (product: any) => {
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.id === product.id);
      if (existing) {
        if (existing.qty >= product.stock) {
          showToast(`No hay suficiente stock para ${product.nombre}. Stock: ${product.stock}`);
          return prevCart;
        }
        return prevCart.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prevCart, { id: product.id, name: product.nombre, price: product.precio, qty: 1, sku: product.sku, stock: product.stock }];
    });
  };

  const handleCheckout = () => {
    if (cart.length === 0) {
      showToast("El carrito está vacío.");
      return;
    }
    if (!client) {
      showToast("Debe seleccionar un cliente para emitir la factura.");
      return;
    }
    if (!tasaBCV || tasaBCV <= 0) {
      showToast("No hay tasa BCV vigente. La facturación está bloqueada por seguridad fiscal.");
      return;
    }

    const payload = {
      cliente_id: parseInt(client, 10),
      aplica_igtf: metodoPago === 'Divisa',
      moneda_documento: (metodoPago === 'Transferencia' || metodoPago === 'PagoMovil') ? 'VED' : 'USD',
      detalles: cart.map(item => ({
        producto_id: item.id,
        cantidad: item.qty,
        precio_unitario: item.price,
        descripcion: item.name
      }))
    };
    api.post<any>('/v1/facturacion/emitir', payload).then((res) => {
      showToast(`Factura emitida: ${res.numero_factura} | Control: ${res.numero_control}`, 'success');
      setCart([]);
      fetchContext();
    }).catch((err) => {
      console.error(err);
      showToast(err.response?.data?.detail || "Error al procesar la factura fiscal");
    });
  };

  const cartSubtotal = cart.reduce((acc, item) => acc + item.qty * item.price, 0);
  const cartIVA = cartSubtotal * 0.16;
  const cartIGTF = metodoPago === 'Divisa' ? (cartSubtotal + cartIVA) * 0.03 : 0;
  const cartTotal = cartSubtotal + cartIVA + cartIGTF;
  const cartTotalBs = cartTotal * (tasaBCV || 0);

  const filteredProducts = productos.filter(p => 
    p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 relative">
      {/* Toast Notification */}
      {toast && typeof document !== 'undefined' && createPortal(
        <div className="fixed bottom-10 right-10 z-[9999] animate-in slide-in-from-bottom-10 fade-in duration-300">
          <div className={`px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 ${toast.type === 'success' ? 'bg-[#0b5156] border border-[#0b5156]/20 text-white' : 'bg-red-600 border border-red-500 text-white'}`}>
            {toast.type === 'success' ? <CheckCircle size={20} /> : <Zap size={20} />}
            <span className="font-bold text-sm tracking-wide uppercase font-mono">{toast.message}</span>
          </div>
        </div>,
        document.body
      )}

      <header className="bg-white p-8 rounded-3xl border border-[#bdafa1]/20 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
           <Zap size={120} className="text-[#0b5156]" />
        </div>
        <div className="relative z-10">
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase mb-2 font-mono">Punto de Venta</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-tight max-w-2xl">
            Facturación forense inmediata con conciliación multimoneda y validación SHA-256.
          </p>
          <div className="flex gap-3 mt-8">
             <button onClick={() => showToast('Descargando Manual de Operador POS...', 'success')} className="bg-white text-slate-500 px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-all">
                Manual POS
             </button>
             <button onClick={handleCheckout} className="bg-[#0b5156] text-white px-8 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-[#0b5156]/20 hover:scale-105 transition-all">
                Cobrar Ticket Actual
             </button>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {[
          { t: 'Terminal', v: 'Caja 01', desc: 'Turno Abierto', c: 'text-[#0b5156]' },
          { t: 'Ventas Hoy', v: `$${totalHoy.toFixed(2)}`, desc: `${countHoy} Tickets`, c: 'text-[#43584b]' },
          { t: 'Ticket Actual', v: `$${cartTotal.toFixed(2)}`, desc: `${cart.reduce((sum, item) => sum + item.qty, 0)} Rubros`, c: 'text-slate-500' },
          { t: 'Operador', v: userName || 'Admin', desc: 'Sesión Activa', c: 'text-slate-800' }
        ].map((kpi, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 flex flex-col justify-between h-32 group hover:border-[#0b5156]/30 transition-all shadow-sm">
            <p className="text-sm font-black text-slate-500 uppercase tracking-widest group-hover:text-[#0b5156] transition-colors">{kpi.t}</p>
            <div>
              <strong className={`text-3xl font-black ${kpi.c} tracking-tighter font-mono`}>{kpi.v}</strong>
              <p className="text-xs font-bold text-slate-400 uppercase mt-1">{kpi.desc}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-800 font-mono">Búsqueda de Rubros</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
               <div className="space-y-1.5">
                  <label className="text-sm font-black text-slate-500 uppercase tracking-widest">Código / SKU / Nombre</label>
                  <div className="relative">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                     <input 
                       type="text" 
                       value={searchTerm} 
                       onChange={(e) => setSearchTerm(e.target.value)} 
                       placeholder="BUSCAR PRODUCTO..." 
                       className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-800 focus:outline-none focus:border-[#0b5156] uppercase" 
                     />
                  </div>
               </div>
               <div className="space-y-1.5">
                  <label className="text-sm font-black text-slate-500 uppercase tracking-widest">Identificación Cliente</label>
                  <select 
                    value={client}
                    onChange={(e) => setClient(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-800 focus:outline-none focus:border-[#0b5156] uppercase"
                  >
                     {clientes.map((c) => (
                       <option key={c.id} value={c.id.toString()}>
                         {c.nombre} ({c.rif})
                       </option>
                     ))}
                     {clientes.length === 0 && (
                       <option value="">No hay clientes cargados</option>
                     )}
                  </select>
               </div>
            </div>
          </section>

          <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex justify-between items-center">
               <h3 className="text-xl font-black uppercase tracking-tight text-slate-800 font-mono">Productos Rápidos</h3>
               <button onClick={() => showToast('Abriendo Catálogo Completo de Rubros...', 'success')} className="text-sm font-black text-[#0b5156] uppercase hover:underline tracking-widest">Ver Catálogo</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
               {filteredProducts.length > 0 ? (
                 filteredProducts.map((p) => (
                   <div 
                     key={p.id} 
                     onClick={() => handleAddToCart(p)}
                     className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-3 hover:border-[#0b5156] cursor-pointer transition-all group relative overflow-hidden"
                   >
                      <h4 className="text-sm font-black text-slate-800 uppercase leading-tight h-8">{p.nombre}</h4>
                      <div className="flex justify-between items-end">
                         <div>
                            <p className="text-xs font-bold text-slate-500 uppercase font-mono">${p.precio.toFixed(2)}</p>
                            <p className="text-xs font-black text-[#0b5156] tracking-tighter uppercase font-mono">{p.sku}</p>
                         </div>
                         <div className="w-6 h-6 bg-[#0b5156] rounded-lg flex items-center justify-center text-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                            <Plus size={14} />
                         </div>
                      </div>
                   </div>
                 ))
               ) : (
                 <div className="col-span-full py-8 text-center text-slate-400 font-bold uppercase text-xs">
                    No se encontraron productos con stock disponible.
                 </div>
               )}
            </div>
          </section>

          <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
             <h3 className="text-xl font-black uppercase tracking-tight text-slate-800 font-mono">Medios de Pago</h3>
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-start">
                {[
                  { n: 'Efectivo', i: Banknote, d: 'Dólares / Bs.', code: 'Efectivo' },
                  { n: 'Punto / Débito', i: Monitor, d: 'Tarjeta Local', code: 'PagoMovil' },
                  { n: 'Transferencia', i: ArrowRight, d: 'Referencia', code: 'Transferencia' },
                  { n: 'Divisa', i: Calculator, d: 'Dólares IGTF (3%)', code: 'Divisa' }
                ].map((m, i) => (
                  <div 
                    key={i} 
                    onClick={() => setMetodoPago(m.code as any)}
                    className={`p-5 rounded-2xl border ${metodoPago === m.code ? 'border-[#0b5156] bg-[#0b5156]/5 shadow-sm' : 'border-slate-100 bg-slate-50/50'} space-y-4 cursor-pointer hover:border-[#0b5156]/30 transition-all`}
                  >
                     <m.i size={20} className={metodoPago === m.code ? 'text-[#0b5156]' : 'text-slate-500'} />
                     <div>
                        <h4 className="text-sm font-black text-slate-800 uppercase">{m.n}</h4>
                        <p className="text-xs font-bold text-slate-500 uppercase leading-tight mt-1">{m.d}</p>
                     </div>
                  </div>
                ))}
             </div>
          </section>

          <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
             <div className="p-8 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-xl font-black uppercase tracking-tight text-slate-800 font-mono text-[#0b5156]">Auditoría de Tickets</h3>
             </div>
             <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left">
                   <thead>
                      <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/30">
                         <th className="py-4 px-8">N° TICKET</th>
                         <th className="py-4 px-6">CLIENTE</th>
                         <th className="py-4 px-6 text-right">TOTAL USD</th>
                         <th className="py-4 px-6 text-center">ESTADO</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                      {recentTickets.length > 0 ? (
                        recentTickets.map(t => (
                          <tr key={t.id} className="group hover:bg-[#bdafa1]/5 transition-colors">
                             <td className="py-5 px-8 text-sm font-black text-slate-800 font-mono">{t.id}</td>
                             <td className="py-5 px-6 text-slate-500 text-sm font-bold uppercase">{t.client}</td>
                             <td className="py-5 px-6 text-right font-black text-slate-800 font-mono">{t.total}</td>
                             <td className="py-5 px-6 text-center">
                                <span className={`${t.color} text-xs font-black px-2 py-0.5 rounded uppercase border`}>{t.status}</span>
                             </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                           <td colSpan={4} className="py-8 text-center text-slate-400 font-bold uppercase text-xs">
                              No hay tickets emitidos hoy.
                           </td>
                        </tr>
                      )}
                   </tbody>
                </table>
             </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="bg-white p-8 rounded-3xl border border-[#0b5156]/20 shadow-sm space-y-6">
             <div className="space-y-1">
                <h3 className="text-lg font-black uppercase tracking-tight text-[#0b5156] font-mono">Ticket Actual</h3>
                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest font-mono">ID: NUEVO TICKET</p>
             </div>
             
             <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {cart.length > 0 ? (
                  cart.map(item => (
                     <div key={item.id} className="flex justify-between items-start border-b border-slate-100 pb-4">
                        <div className="space-y-0.5">
                           <p className="text-sm font-black text-slate-800 uppercase leading-tight">{item.name}</p>
                           <p className="text-xs font-bold text-slate-500 uppercase font-mono">{item.qty} x ${item.price.toFixed(2)}</p>
                        </div>
                        <strong className="text-sm font-black text-slate-800 font-mono">${(item.qty * item.price).toFixed(2)}</strong>
                     </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-slate-400 font-bold uppercase text-xs">
                     El carrito está vacío.
                  </div>
                )}
             </div>

             <div className="pt-4 space-y-4">
                <div className="space-y-2 pt-2">
                   <div className="flex justify-between items-center">
                      <span className="text-sm font-black uppercase text-slate-500 tracking-widest">Base Imponible</span>
                      <strong className="text-lg font-black text-slate-800 font-mono">${cartSubtotal.toFixed(2)}</strong>
                   </div>
                   <div className="flex justify-between items-center">
                      <span className="text-sm font-black uppercase text-slate-500 tracking-widest">Impuesto IVA (16%)</span>
                      <strong className="text-lg font-black text-slate-800 font-mono">${cartIVA.toFixed(2)}</strong>
                   </div>
                   <div className="flex justify-between items-center">
                      <span className="text-sm font-black uppercase text-red-600 tracking-widest">Impuesto IGTF (3%)</span>
                      <strong className="text-lg font-black text-red-600 font-mono">${cartIGTF.toFixed(2)}</strong>
                   </div>
                   <div className="border-t border-slate-100 pt-4">
                      <div className="flex justify-between items-end">
                         <span className="text-sm font-black uppercase tracking-widest text-[#0b5156]">Total Factura</span>
                         <div className="text-right">
                            <strong className="text-3xl font-black text-[#0b5156] font-mono tracking-tighter">${cartTotal.toFixed(2)}</strong>
                            <p className="text-xs font-bold text-slate-500 uppercase mt-1 font-mono">Bs.S {cartTotalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                         </div>
                      </div>
                   </div>
                </div>

                <button onClick={handleCheckout} className="w-full bg-[#0b5156] text-white font-black py-4 rounded-2xl uppercase text-sm tracking-widest shadow-xl shadow-[#0b5156]/20 hover:scale-[1.02] transition-all mt-4">
                   Emitir Factura Fiscal
                </button>
             </div>
          </section>

          <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
             <h3 className="text-lg font-black uppercase tracking-tight text-slate-800 font-mono">Validaciones Fiscales</h3>
             <div className="space-y-4">
                <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 flex gap-4">
                   <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-[#43584b] shadow-sm"><CheckCircle size={18} /></div>
                   <div className="space-y-1">
                      <strong className="text-xs font-black text-[#0b5156] uppercase tracking-widest">Sincronización</strong>
                      <p className="text-sm font-bold text-slate-800 uppercase">Caja Habilitada</p>
                      <p className="text-xs text-slate-500 font-bold uppercase leading-tight">SHA-256 Sincronizado con Tesorería.</p>
                   </div>
                </div>
                {criticos.length > 0 ? (
                  criticos.slice(0, 2).map((c, idx) => (
                    <div key={idx} className="p-4 bg-red-50/30 rounded-2xl border border-red-100 flex gap-4">
                       <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-red-600 shadow-sm"><Package size={18} /></div>
                       <div className="space-y-1">
                          <strong className="text-xs font-black text-red-700 uppercase tracking-widest">Alerta</strong>
                          <p className="text-sm font-bold text-red-600 uppercase font-mono">Stock Crítico</p>
                          <p className="text-xs text-slate-500 font-bold uppercase leading-tight">Reponer {c.sku} ({c.nombre}) de inmediato.</p>
                       </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 bg-green-50/30 rounded-2xl border border-green-100 flex gap-4">
                     <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-[#43584b] shadow-sm"><CheckCircle size={18} /></div>
                     <div className="space-y-1">
                        <strong className="text-xs font-black text-[#43584b] uppercase tracking-widest">Inventario</strong>
                        <p className="text-sm font-bold text-slate-800 uppercase">Stock Sano</p>
                        <p className="text-xs text-slate-500 font-bold uppercase leading-tight">Todos los niveles de stock están correctos.</p>
                     </div>
                  </div>
                )}
             </div>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default POS;
