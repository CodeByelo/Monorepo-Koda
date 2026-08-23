import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { useAuth } from '@/providers/AuthProvider';
import { QuickCreateClienteModal } from '@/components/customers/QuickCreateClienteModal';
import {
  Search,
  Banknote,
  Plus,
  Zap,
  Monitor,
  Calculator,
  CheckCircle,
  ArrowRight,
  Package,
  UserPlus
} from 'lucide-react';

// Tarifa de negocio usada como punto de partida al agregar un producto al
// carrito. Solo autocompleta el precio de la línea; sigue siendo editable
// por línea después (pricing negociado), no es un candado.
type Tarifa = 'Mayor' | 'Detal' | 'GranMayor';

const resolveTierPrice = (p: any, tarifa: Tarifa): number => {
  const raw =
    tarifa === 'Mayor' ? p.precio_mayor :
    tarifa === 'GranMayor' ? p.precio_gran_mayor :
    p.precio_detal;
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : (Number(p.precio) || 0);
};

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
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [vendedorId, setVendedorId] = useState('');
  const [tarifa, setTarifa] = useState<Tarifa>('Detal');
  const [metodoPago, setMetodoPago] = useState<'Efectivo' | 'Divisa' | 'Transferencia' | 'PagoMovil'>('Divisa');
  const [toast, setToast] = useState<{message: string, type: 'error' | 'success'} | null>(null);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);

  const showToast = (message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchContext = () => {
    // 1. Obtener productos directamente desde /productos para total sincronización con el inventario
    api.get<any[]>('/productos').then((data) => {
      if (Array.isArray(data) && data.length > 0) {
        setProductos(data.map((p) => ({
          id: p.id,
          sku: p.sku,
          nombre: p.nombre,
          precio: Number(p.precio_usd) || 0,
          precio_detal: p.precio_detal != null ? Number(p.precio_detal) : Number(p.precio_usd) || 0,
          precio_mayor: p.precio_mayor != null ? Number(p.precio_mayor) : null,
          precio_gran_mayor: p.precio_gran_mayor != null ? Number(p.precio_gran_mayor) : null,
          stock: Number(p.stock) || 0,
        })));
      }
    }).catch(() => {});

    // 2. Obtener métricas y contexto complementario
    api.get<any>('/ventas/pos/contexto').then((res) => {
      if (res?.productos && res.productos.length > 0) {
        setProductos(res.productos);
      }
      setTotalHoy(res?.total_hoy || 0);
      setCountHoy(res?.count_hoy || 0);
      const val = Number(res?.tasa_bcv || 0);
      if (val > 0) {
        setTasaBCV(val);
      } else {
        api.get<any>('/tasa/actual').then((tData) => {
          const tVal = Number(tData?.valor_ves || tData?.tasa || 0);
          if (tVal > 0) setTasaBCV(tVal);
        }).catch(() => {});
      }
      setRecentTickets((res?.tickets_recientes || []).map((t: any) => ({
        ...t,
        color: t.status === 'EMITIDO' ? 'bg-[#8fb09f]/10 text-[#43584b] border-[#8fb09f]/20' : 'bg-[#bdafa1]/10 text-slate-500 border-[#bdafa1]/20',
      })));
    }).catch(() => {
      api.get<any>('/tasa/actual').then((tData) => {
        const tVal = Number(tData?.valor_ves || tData?.tasa || 0);
        if (tVal > 0) setTasaBCV(tVal);
      }).catch(() => {});
    });

    api.get<any[]>('/inventario/criticos').then((data) => {
      setCriticos(data || []);
    }).catch(() => setCriticos([]));

    api.get<any[]>('/clientes').then((data) => {
      const clientList = data || [];
      setClientes(clientList);
      if (clientList.length > 0) {
        setClient((prev) => {
          if (prev) return prev;
          const cf = clientList.find(c => c.rif === 'G-00000000-0' || c.nombre.toLowerCase().includes('consumidor'));
          return cf ? cf.id.toString() : clientList[0].id.toString();
        });
      }
    }).catch(() => setClientes([]));

    api.get<any[]>('/vendedores').then((data) => {
      setVendedores(data || []);
    }).catch(() => setVendedores([]));
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
      // El precio inicial se autocompleta desde la tarifa activa (con fallback
      // a precio_usd si ese tier no está configurado); queda editable por
      // línea en el carrito, no es un candado sobre el precio negociado.
      return [...prevCart, { id: product.id, name: product.nombre, price: resolveTierPrice(product, tarifa), qty: 1, sku: product.sku, stock: product.stock }];
    });
  };

  const handleCartPriceChange = (id: number, value: string) => {
    const newPrice = parseFloat(value);
    setCart((prevCart) => prevCart.map((item) =>
      item.id === id ? { ...item, price: Number.isFinite(newPrice) ? newPrice : 0 } : item
    ));
  };

  // Solo agrega el cliente nuevo al array en memoria y lo selecciona como
  // activo; no debe tocar carrito/cantidades/totales de la venta en curso.
  const handleClienteCreated = (cliente: any) => {
    setClientes((prev) => [...prev, cliente]);
    setClient(cliente.id.toString());
    showToast(`Cliente ${cliente.nombre} creado y seleccionado`, 'success');
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
      metodo_pago: metodoPago,
      aplica_igtf: metodoPago === 'Divisa',
      moneda_documento: (metodoPago === 'Transferencia' || metodoPago === 'PagoMovil') ? 'VED' : 'USD',
      vendedor_id: vendedorId ? parseInt(vendedorId, 10) : null,
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
             <Link to="/historial" className="bg-white text-slate-500 px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-all flex items-center">
                Facturas Emitidas
             </Link>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
               {/* 1. Código / SKU / Nombre */}
               <div className="flex flex-col space-y-2">
                  <div className="min-h-[22px] flex items-center">
                     <label className="text-sm font-black text-slate-500 uppercase tracking-widest leading-none">Código / SKU / Nombre</label>
                  </div>
                  <div className="relative">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                     <input 
                       type="text" 
                       value={searchTerm} 
                       onChange={(e) => setSearchTerm(e.target.value)} 
                       placeholder="BUSCAR PRODUCTO..." 
                       className="w-full h-11 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-800 focus:outline-none focus:border-[#0b5156] uppercase transition-colors" 
                     />
                  </div>
               </div>

               {/* 2. Identificación Cliente */}
               <div className="flex flex-col space-y-2">
                  <div className="min-h-[22px] flex items-center justify-between">
                     <label className="text-sm font-black text-slate-500 uppercase tracking-widest leading-none">Identificación Cliente</label>
                  </div>
                  <div className="flex items-center gap-2">
                     <select
                       value={client}
                       onChange={(e) => setClient(e.target.value)}
                       className="flex-1 min-w-0 h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-800 focus:outline-none focus:border-[#0b5156] uppercase transition-colors truncate"
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
                     <button
                       type="button"
                       onClick={() => setIsQuickCreateOpen(true)}
                       className="h-11 px-3 bg-[#0b5156]/10 hover:bg-[#0b5156] text-[#0b5156] hover:text-white border border-[#0b5156]/20 hover:border-[#0b5156] rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shrink-0 transition-all active:scale-95 shadow-xs"
                       title="Crear cliente rápido"
                     >
                       <UserPlus size={14} />
                       <span className="hidden sm:inline">+ Cliente</span>
                     </button>
                  </div>
               </div>

               {/* 3. Vendedor */}
               <div className="flex flex-col space-y-2">
                  <div className="min-h-[22px] flex items-center">
                     <label className="text-sm font-black text-slate-500 uppercase tracking-widest leading-none">Vendedor (opcional)</label>
                  </div>
                  <select
                    value={vendedorId}
                    onChange={(e) => setVendedorId(e.target.value)}
                    className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-800 focus:outline-none focus:border-[#0b5156] uppercase transition-colors"
                  >
                     <option value="">Sin vendedor asignado</option>
                     {vendedores.map((v) => (
                       <option key={v.id} value={v.id.toString()}>
                         {v.nombre} ({v.codigo})
                       </option>
                     ))}
                  </select>
               </div>

               {/* 4. Tarifa */}
               <div className="flex flex-col space-y-2">
                  <div className="min-h-[22px] flex items-center">
                     <label className="text-sm font-black text-slate-500 uppercase tracking-widest leading-none">Tarifa</label>
                  </div>
                  <select
                    value={tarifa}
                    onChange={(e) => setTarifa(e.target.value as Tarifa)}
                    className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-800 focus:outline-none focus:border-[#0b5156] uppercase transition-colors"
                  >
                     <option value="Mayor">Mayor</option>
                     <option value="Detal">Detal</option>
                     <option value="GranMayor">Gran Mayor</option>
                  </select>
               </div>
            </div>
          </section>

          <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
               <div className="flex items-center gap-3">
                 <h3 className="text-xl font-black uppercase tracking-tight text-slate-800 font-mono">Productos del Almacén</h3>
                 <span className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                   {filteredProducts.length} disponibles
                 </span>
               </div>
               {searchTerm && (
                 <button 
                   onClick={() => setSearchTerm('')} 
                   className="text-xs font-bold text-slate-400 hover:text-red-500 uppercase tracking-wider transition-colors self-start sm:self-auto"
                 >
                   ✕ Limpiar búsqueda
                 </button>
               )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
               {filteredProducts.length > 0 ? (
                 filteredProducts.map((p) => {
                   const precioActual = resolveTierPrice(p, tarifa);
                   const tieneStock = Number(p.stock) > 0;
                   return (
                     <div 
                       key={p.id} 
                       onClick={() => tieneStock && handleAddToCart(p)}
                       className={`p-4 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between h-36 ${
                         tieneStock 
                           ? 'bg-slate-50/70 border-slate-200/80 hover:border-[#0b5156] hover:bg-white hover:shadow-md cursor-pointer group active:scale-[0.98]' 
                           : 'bg-slate-100/50 border-slate-200 opacity-60 cursor-not-allowed'
                       }`}
                     >
                        <div>
                           <div className="flex justify-between items-start gap-2 mb-1">
                             <span className="text-[10px] font-black text-[#0b5156] tracking-wider uppercase font-mono bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-xs">
                               {p.sku}
                             </span>
                             <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${tieneStock ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                               Stock: {p.stock}
                             </span>
                           </div>
                           <h4 className="text-xs font-black text-slate-800 uppercase leading-snug line-clamp-2" title={p.nombre}>
                             {p.nombre}
                           </h4>
                        </div>

                        <div className="flex justify-between items-end pt-2 border-t border-slate-100">
                           <div>
                              <p className="text-sm font-black text-[#0b5156] font-mono leading-none">
                                ${precioActual.toFixed(2)}
                              </p>
                              {tasaBCV > 0 && (
                                <p className="text-[9px] font-bold text-slate-400 font-mono mt-0.5">
                                  Bs. {(precioActual * tasaBCV).toFixed(2)}
                                </p>
                              )}
                           </div>
                           {tieneStock && (
                             <div className="w-7 h-7 bg-[#0b5156] rounded-xl flex items-center justify-center text-white shadow-sm opacity-90 group-hover:opacity-100 group-hover:scale-110 transition-all">
                                <Plus size={15} />
                             </div>
                           )}
                        </div>
                     </div>
                   );
                 })
               ) : (
                 <div className="col-span-full py-12 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    <Package size={32} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-1">
                      {searchTerm ? `No hay coincidencias para "${searchTerm}"` : 'No se encontraron productos en el inventario'}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">
                      Intenta buscar por otro término o registra nuevos productos desde el módulo de Inventario.
                    </p>
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
                         <th className="py-4 px-6 text-right">TOTAL ($ / Bs.)</th>
                         <th className="py-4 px-6 text-center">ESTADO</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                      {recentTickets.length > 0 ? (
                        recentTickets.map(t => {
                          const numericTotal = typeof t.total === 'string' ? parseFloat(t.total.replace(/[^0-9.-]+/g, '')) : Number(t.total || 0);
                          const totalBsTicket = tasaBCV > 0 && !isNaN(numericTotal) ? `Bs. ${(numericTotal * tasaBCV).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
                          return (
                            <tr key={t.id} className="group hover:bg-[#bdafa1]/5 transition-colors">
                               <td className="py-5 px-8 text-sm font-black text-slate-800 font-mono">{t.id}</td>
                               <td className="py-5 px-6 text-slate-500 text-sm font-bold uppercase">{t.client}</td>
                               <td className="py-5 px-6 text-right">
                                 <div className="flex flex-col items-end">
                                   <span className="font-black text-slate-800 font-mono text-sm">{t.total}</span>
                                   {totalBsTicket && (
                                     <span className="text-[10px] font-bold text-[#0b5156] font-mono">{totalBsTicket}</span>
                                   )}
                                 </div>
                               </td>
                               <td className="py-5 px-6 text-center">
                                  <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-tighter border ${t.color}`}>
                                     {t.status}
                                  </span>
                               </td>
                            </tr>
                          );
                        })
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
                           <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase font-mono">
                             <span>{item.qty} x $</span>
                             <input
                               type="number"
                               min="0"
                               step="0.01"
                               value={item.price}
                               onChange={(e) => handleCartPriceChange(item.id, e.target.value)}
                               title="Precio negociado — editable por línea"
                               className="w-20 px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-[#0b5156]/50"
                             />
                           </div>
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

      <QuickCreateClienteModal
        isOpen={isQuickCreateOpen}
        onClose={() => setIsQuickCreateOpen(false)}
        onCreated={handleClienteCreated}
      />
    </div>
  );
};

export default POS;
