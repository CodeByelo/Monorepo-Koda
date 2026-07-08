import { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  Banknote, 
  ArrowLeft,
  CheckCircle2,
  MonitorSmartphone,
  CreditCard,
  SmartphoneNfc
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';

interface Product {
  id: number;
  sku: string;
  name: string;
  price: number;
  stock: number;
  exempt: boolean;
}

interface CartItem extends Product {
  qty: number;
}

const PointOfSale = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('Divisa');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const [bcvRate, setBcvRate] = useState(36.52);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [tasaRes, prodRes] = await Promise.all([
          api.get<any>('/tasas/bcv'),
          api.get<any[]>('/productos')
        ]);
        if (tasaRes && tasaRes.tasa) {
          setBcvRate(Number(tasaRes.tasa));
        }
        
        const mappedProducts = (prodRes || []).map(p => ({
          id: p.id,
          sku: p.sku || `PRD-00${p.id}`,
          name: p.nombre || p.name,
          price: Number(p.precio_usd || p.price || 0),
          stock: Number(p.stock || p.cantidad || 0),
          exempt: Boolean(p.es_exento || p.exempt)
        }));
        setCatalog(mappedProducts);
      } catch (error) {
        console.error("Error fetching POS data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const displayCatalog = catalog.length > 0 ? catalog : [
    { id: 1, sku: 'PRD-001', name: 'Harina de Maíz Precocida 1Kg', price: 1.15, stock: 140, exempt: true },
    { id: 2, sku: 'PRD-002', name: 'Aceite Vegetal Mezcla 1L', price: 2.25, stock: 85, exempt: false },
    { id: 3, sku: 'PRD-003', name: 'Café Molido Premium 500g', price: 4.80, stock: 32, exempt: false },
    { id: 4, sku: 'PRD-004', name: 'Arroz Blanco Grano Largo 1Kg', price: 1.20, stock: 210, exempt: true },
    { id: 5, sku: 'PRD-005', name: 'Azúcar Refinada 1Kg', price: 1.35, stock: 95, exempt: true },
    { id: 6, sku: 'PRD-006', name: 'Queso Blanco Pasteurizado 1Kg', price: 5.50, stock: 14, exempt: false },
    { id: 7, sku: 'PRD-007', name: 'Mantequilla 500g', price: 3.10, stock: 45, exempt: false },
    { id: 8, sku: 'PRD-008', name: 'Pasta Alimenticia 500g', price: 0.90, stock: 180, exempt: true },
  ];

  const filteredCatalog = displayCatalog.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addToCart = (prod: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === prod.id);
      if (existing) {
        if (existing.qty >= prod.stock) return prev; // Límite de stock
        return prev.map(item => item.id === prod.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { ...prod, qty: 1 }];
    });
  };

  const updateQty = (id: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = item.qty + delta;
        if (newQty > 0 && newQty <= item.stock) return { ...item, qty: newQty };
      }
      return item;
    }));
  };

  const removeFromCart = (id: number) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  // Cálculos Financieros Estrictos
  const { subtotal, iva, igtf, totalUsd, totalBs } = useMemo(() => {
    let sub = 0;
    let tax = 0;

    cart.forEach(item => {
      const lineTotal = item.price * item.qty;
      sub += lineTotal;
      if (!item.exempt) {
        tax += lineTotal * 0.16; // IVA 16%
      }
    });

    // IGTF 3% aplica sobre (Subtotal + IVA) solo si el método es Divisa
    let igtfAmount = 0;
    if (paymentMethod === 'Divisa') {
      igtfAmount = (sub + tax) * 0.03;
    }

    const totalU = sub + tax + igtfAmount;
    const totalB = totalU * bcvRate;

    return { 
      subtotal: sub, 
      iva: tax, 
      igtf: igtfAmount, 
      totalUsd: totalU, 
      totalBs: totalB 
    };
  }, [cart, paymentMethod, bcvRate]);

  const handleProcessSale = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);
    
    try {
      await api.post('/ventas', {
        cliente_id: 1, // Consumidor Final default
        metodo_pago: paymentMethod,
        subtotal,
        iva,
        igtf,
        total: totalUsd,
        tasa_bcv: bcvRate,
        detalles: cart.map(c => ({
          producto_id: c.id,
          cantidad: c.qty,
          precio_unitario: c.price,
          exento: c.exempt
        }))
      });
      alert('✅ Venta procesada exitosamente. Factura electrónica generada. Kardex actualizado.');
      setCart([]);
    } catch (error) {
      console.error("Error al procesar venta:", error);
      alert('❌ Error al procesar la venta.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-20">
      {/* Header Compacto */}
      <header className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center relative overflow-hidden">
        <div className="flex items-center gap-4 relative z-10">
          <Link to="/ventas" className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:text-koda-main transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
             <h1 className="text-xl font-black text-koda-main tracking-tighter uppercase leading-none">Punto de Venta (POS)</h1>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Terminal Caja 01 • Tasa BCV: Bs. {bcvRate.toFixed(2)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <div className="bg-green-50 text-green-600 px-3 py-1.5 rounded-lg border border-green-100 flex items-center gap-2">
              <MonitorSmartphone size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest">Caja Abierta</span>
           </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        
        {/* Left Column: Product Catalog */}
        <section className="lg:col-span-2 space-y-4">
           {/* Search Bar */}
           <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex gap-3">
              <div className="relative flex-1">
                 <Search className="absolute left-4 top-3.5 text-slate-400" size={18} />
                 <input 
                   type="text" 
                   placeholder="Buscar código de barra, SKU o nombre de producto..." 
                   value={searchTerm}
                   onChange={(e) => setSearchTerm(e.target.value)}
                   className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-12 pr-4 py-3 text-sm font-black text-koda-main outline-none focus:border-koda-main transition-all shadow-inner"
                   autoFocus
                 />
              </div>
           </div>

           {/* Product Grid */}
           <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {isLoading ? (
                <div className="col-span-full py-10 text-center text-xs font-black text-slate-400 uppercase tracking-widest">
                  Cargando catálogo...
                </div>
              ) : filteredCatalog.length === 0 ? (
                <div className="col-span-full py-10 text-center text-xs font-black text-slate-400 uppercase tracking-widest">
                  No se encontraron productos.
                </div>
              ) : (
                filteredCatalog.map(prod => (
                  <div 
                    key={prod.id} 
                    onClick={() => addToCart(prod)}
                    className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:border-koda-main hover:shadow-md transition-all cursor-pointer flex flex-col justify-between h-36 group active:scale-95"
                  >
                     <div className="space-y-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">{prod.sku}</span>
                        <h3 className="text-xs font-black text-slate-700 uppercase leading-tight group-hover:text-koda-main transition-colors line-clamp-2">{prod.name}</h3>
                     </div>
                     <div className="flex justify-between items-end mt-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Stock: {prod.stock}</span>
                        <strong className="text-sm font-black text-koda-main font-mono">${prod.price.toFixed(2)}</strong>
                     </div>
                  </div>
               ))
              )}
           </div>
        </section>

        {/* Right Column: The Ticket / Cart */}
        <section className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden flex flex-col h-[calc(100vh-140px)] sticky top-4">
           {/* Ticket Header */}
           <div className="p-6 bg-koda-main text-white flex flex-col items-center justify-center space-y-1 shadow-inner relative overflow-hidden">
              <span className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em] relative z-10">Total a Pagar</span>
              <strong className="text-4xl font-black font-mono tracking-tighter relative z-10">${totalUsd.toFixed(2)}</strong>
              <span className="text-xs font-black text-white/80 font-mono relative z-10">Bs. {totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
              <div className="absolute top-0 right-0 p-4 opacity-10"><ShoppingCart size={100} /></div>
           </div>

           {/* Ticket Body (Items) */}
           <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
              {cart.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-3">
                    <ShoppingCart size={48} className="opacity-50" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Ticket Vacío</p>
                 </div>
              ) : (
                 cart.map(item => (
                    <div key={item.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
                       <div className="flex-1 space-y-0.5 min-w-0">
                          <h4 className="text-[11px] font-black text-slate-700 uppercase leading-tight truncate">{item.name}</h4>
                          <div className="flex gap-2 text-[9px] font-bold text-slate-400 uppercase">
                             <span className="font-mono">${item.price.toFixed(2)} c/u</span>
                             {item.exempt ? <span className="text-green-600">(Exento)</span> : <span className="text-blue-600">(G)</span>}
                          </div>
                       </div>
                       
                       <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-1 border border-slate-100 shrink-0">
                          <button onClick={() => updateQty(item.id, -1)} className="p-1 hover:bg-white rounded text-slate-500 shadow-sm"><Minus size={12} /></button>
                          <span className="text-[11px] font-black font-mono w-4 text-center">{item.qty}</span>
                          <button onClick={() => updateQty(item.id, 1)} className="p-1 hover:bg-white rounded text-slate-500 shadow-sm"><Plus size={12} /></button>
                       </div>
                       
                       <div className="text-right shrink-0 w-14">
                          <strong className="text-xs font-black text-koda-main font-mono">${(item.price * item.qty).toFixed(2)}</strong>
                       </div>

                       <button onClick={() => removeFromCart(item.id)} className="text-slate-300 hover:text-red-500 transition-colors shrink-0">
                          <Trash2 size={14} />
                       </button>
                    </div>
                 ))
              )}
           </div>

           {/* Ticket Footer / Checkout */}
           <div className="p-5 border-t border-slate-200 bg-white space-y-4">
              <div className="space-y-1.5 text-[11px] font-mono">
                 <div className="flex justify-between text-slate-500 font-bold">
                    <span className="uppercase font-sans">Subtotal</span>
                    <span>${subtotal.toFixed(2)}</span>
                 </div>
                 <div className="flex justify-between text-slate-500 font-bold">
                    <span className="uppercase font-sans">IVA (16%)</span>
                    <span>${iva.toFixed(2)}</span>
                 </div>
                 {paymentMethod === 'Divisa' && (
                   <div className="flex justify-between text-amber-600 font-black">
                      <span className="uppercase font-sans">IGTF (3%) Divisa</span>
                      <span>${igtf.toFixed(2)}</span>
                   </div>
                 )}
              </div>

              <div className="space-y-2">
                 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Método de Pago</label>
                 <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => setPaymentMethod('Divisa')} className={`py-2 rounded-lg text-[9px] font-black uppercase flex flex-col items-center gap-1 border transition-all ${paymentMethod === 'Divisa' ? 'bg-koda-main text-white border-koda-main' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                       <Banknote size={14} /> Divisa $
                    </button>
                    <button onClick={() => setPaymentMethod('PagoMovil')} className={`py-2 rounded-lg text-[9px] font-black uppercase flex flex-col items-center gap-1 border transition-all ${paymentMethod === 'PagoMovil' ? 'bg-koda-main text-white border-koda-main' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                       <SmartphoneNfc size={14} /> P. Móvil
                    </button>
                    <button onClick={() => setPaymentMethod('Punto')} className={`py-2 rounded-lg text-[9px] font-black uppercase flex flex-col items-center gap-1 border transition-all ${paymentMethod === 'Punto' ? 'bg-koda-main text-white border-koda-main' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                       <CreditCard size={14} /> Tarjeta
                    </button>
                 </div>
              </div>

              <button 
                onClick={handleProcessSale}
                disabled={cart.length === 0 || isProcessing}
                className="w-full bg-koda-main text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest shadow-xl shadow-green-900/20 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                 {isProcessing ? 'Imprimiendo Ticket...' : <><CheckCircle2 size={16} /> Facturar y Cobrar</>}
              </button>
           </div>
        </section>

      </div>
    </div>
  );
};

export default PointOfSale;