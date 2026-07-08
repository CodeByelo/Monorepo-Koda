import { useState, useMemo, useEffect } from 'react';
import { 
  FileText,
  ShoppingBag,
  Calculator, 
  ShieldCheck, 
  AlertCircle,
  DollarSign,
  ArrowRight,
  Info,
  Trash2
} from 'lucide-react';
import { api } from '@/api/client';

interface Cliente {
  id: number;
  rif: string;
  nombre: string;
  direccion?: string;
  es_contribuyente_especial?: boolean;
}

interface Producto {
  id: number;
  sku: string;
  nombre: string;
  precio_usd: number | string;
  es_exento: boolean;
}

interface ItemDetalle {
  producto: Producto;
  cantidad: number;
}

const InvoiceForm = () => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [tasaBcv, setTasaBcv] = useState(0);
  const [isLoadingTasa, setIsLoadingTasa] = useState(true);

  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [selectedProducto, setSelectedProducto] = useState<Producto | null>(null);
  const [cantidadInput, setCantidadInput] = useState<number>(1);
  const [items, setItems] = useState<ItemDetalle[]>([]);
  const [metodoPago, setMetodoPago] = useState<string>('Efectivo');
  const [isEmitting, setIsEmitting] = useState(false);

  const clientOptions = useMemo(() => {
    return clientes.map(c => (
      <option key={c.id} value={c.id}>{c.nombre} ({c.rif})</option>
    ));
  }, [clientes]);

  const productOptions = useMemo(() => {
    return productos.map(p => (
      <option key={p.id} value={p.id}>{p.nombre} (${Number(p.precio_usd).toFixed(2)})</option>
    ));
  }, [productos]);

  useEffect(() => {
    const initData = async () => {
      try {
        const clientsData = await api.get<Cliente[]>('/clientes');
        setClientes(clientsData);
        if (clientsData.length > 0) setSelectedCliente(clientsData[0]);

        const productsData = await api.get<Producto[]>('/productos');
        setProductos(productsData);
        if (productsData.length > 0) setSelectedProducto(productsData[0]);

        const tasaData = await api.get<{ valor_ves: number | string }>('/tasa/actual');
        setTasaBcv(Number(tasaData.valor_ves));
        setIsLoadingTasa(false);
      } catch (err) {
        console.error("Error cargando datos para factura:", err);
      }
    };
    initData();
  }, []);

  const totals = useMemo(() => {
    const subtotalG = items.reduce((acc, item) => acc + (!item.producto.es_exento ? Number(item.producto.precio_usd) * item.cantidad : 0), 0);
    const subtotalE = items.reduce((acc, item) => acc + (item.producto.es_exento ? Number(item.producto.precio_usd) * item.cantidad : 0), 0);
    const iva = subtotalG * 0.16;
    const igtfUsd = metodoPago === 'Divisa' ? (subtotalG + subtotalE + iva) * 0.03 : 0;
    const isSpecialTaxpayer = selectedCliente?.es_contribuyente_especial || false;
    const retentionIVA = isSpecialTaxpayer ? iva * 0.75 : 0;
    
    const baseTotal = subtotalG + subtotalE + iva + igtfUsd;
    const netToCollect = baseTotal - retentionIVA;

    return {
      subtotalG,
      subtotalE,
      iva,
      igtfUsd,
      retentionIVA,
      netToCollect,
      isSpecialTaxpayer
    };
  }, [items, metodoPago, selectedCliente]);

  const handleAddItem = () => {
    if (!selectedProducto) return;
    const existingIndex = items.findIndex(item => item.producto.id === selectedProducto.id);
    if (existingIndex > -1) {
      const updated = [...items];
      updated[existingIndex].cantidad += cantidadInput;
      setItems(updated);
    } else {
      setItems([...items, { producto: selectedProducto, cantidad: cantidadInput }]);
    }
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleEmitInvoice = async () => {
    if (!selectedCliente) {
      alert("Seleccione un cliente primero.");
      return;
    }
    if (items.length === 0) {
      alert("Agregue al menos un producto a la factura.");
      return;
    }
    setIsEmitting(true);
    try {
      const payload = {
        cliente_id: selectedCliente.id,
        metodo_pago: metodoPago,
        moneda_pago: metodoPago === 'Divisa' ? 'USD' : 'Bs',
        dias_credito: 0,
        detalles: items.map(item => ({
          producto_id: item.producto.id,
          cantidad: item.cantidad
        }))
      };

      const result = await api.post<{ numero_factura: string }>('/ventas', payload);
      alert(`Factura emitida exitosamente: ${result.numero_factura}`);
      setItems([]);
    } catch (err: any) {
      alert(err.message || "Error al emitir factura");
    } finally {
      setIsEmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden flex justify-between items-center mb-2">
        <div className="space-y-1">
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Emision de Factura</h1>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-tight">Validacion fiscal en tiempo real (Providencia 00071).</p>
        </div>
        <div className="flex gap-3">
           <button 
             onClick={handleEmitInvoice}
             disabled={isEmitting}
             className="bg-[#0b5156] disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase shadow-lg shadow-green-900/20 flex items-center gap-2 tracking-widest hover:bg-[#083a3d]"
           >
             {isEmitting ? 'Procesando...' : 'Validar y Emitir Documento'} <ArrowRight size={14} />
           </button>
        </div>
      </header>

      {/* BANNER TASA BCV */}
      <article className="bg-white border border-[#bdafa1] rounded-3xl p-8 flex items-center justify-between shadow-sm relative overflow-hidden group">
         <div className="absolute inset-0 bg-[#0b5156]/5 pointer-events-none"></div>
         <div className="flex items-center gap-8 relative z-10">
            <div>
               <div className="flex items-center gap-3">
                  <strong className="text-2xl font-black text-slate-800 tracking-tighter uppercase font-mono">
                    {isLoadingTasa ? "Cargando..." : `Bs.S ${tasaBcv.toFixed(2)}`}
                  </strong>
                  <span className="bg-[#0b5156] text-white text-[10px] font-black px-3 py-1 rounded-full uppercase border border-[#0b5156]/20">Tasa Oficial BCV</span>
               </div>
               <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Marcar si el pago sera en divisas o criptoactivos (IGTF 3%).</p>
            </div>
         </div>
         <div className="text-right relative z-10">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] block mb-1">Método de Pago</span>
            <select 
              value={metodoPago}
              onChange={(e) => setMetodoPago(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-black uppercase text-[#0b5156]"
            >
              <option value="Efectivo">Efectivo Bs</option>
              <option value="Divisa">Divisa (USD)</option>
              <option value="Transferencia">Transferencia</option>
              <option value="PagoMovil">Pago Móvil</option>
            </select>
         </div>
      </article>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          {/* CLIENTE */}
          <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-8 text-[#0b5156]">
               <FileText size={18} />
               <h3 className="text-xl font-black uppercase tracking-tight">Datos del Receptor</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Seleccionar Cliente</label>
                <select 
                  value={selectedCliente?.id || ''}
                  onChange={(e) => {
                    const c = clientes.find(item => item.id === Number(e.target.value));
                    if (c) setSelectedCliente(c);
                  }}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156] uppercase"
                >
                  {clientOptions}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">RIF / Cédula</label>
                <input type="text" readOnly value={selectedCliente?.rif || ''} className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Condición Especial</label>
                <input type="text" readOnly value={selectedCliente?.es_contribuyente_especial ? 'Especial (Retención)' : 'Ordinario'} className={`w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none font-black uppercase ${selectedCliente?.es_contribuyente_especial ? 'text-blue-600' : 'text-slate-500'}`} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Direccion Fiscal (Obligatorio SENIAT)</label>
                <input type="text" readOnly value={selectedCliente?.direccion || 'Sin dirección registrada'} className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none" />
              </div>
            </div>
          </section>

          {/* AGREGAR ITEMS */}
          <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-8 space-y-6">
             <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2 text-[#0b5156]">
                   <ShoppingBag size={18} />
                   <h3 className="text-xl font-black uppercase tracking-tight">Agregar Productos</h3>
                </div>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
               <div className="space-y-1.5 md:col-span-1">
                 <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Producto</label>
                 <select 
                   value={selectedProducto?.id || ''}
                   onChange={(e) => {
                     const p = productos.find(item => item.id === Number(e.target.value));
                     if (p) setSelectedProducto(p);
                   }}
                   className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                 >
                   {productOptions}
                 </select>
               </div>
               <div className="space-y-1.5">
                 <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Cantidad</label>
                 <input 
                   type="number" 
                   min="1"
                   value={cantidadInput}
                   onChange={(e) => setCantidadInput(parseInt(e.target.value, 10) || 1)}
                   className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]" 
                 />
               </div>
               <button 
                 onClick={handleAddItem}
                 className="bg-[#0b5156] hover:bg-[#093e42] text-white text-xs font-black uppercase py-3 rounded-xl transition-all"
               >
                 Agregar Item
               </button>
             </div>

             <div className="overflow-x-auto no-scrollbar pt-4">
                <table className="w-full text-left">
                   <thead>
                      <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">
                         <th className="py-4">Item</th>
                         <th className="py-4 text-center">Cant.</th>
                         <th className="py-4 text-right">Precio (USD)</th>
                         <th className="py-4 text-center">Alicuota</th>
                         <th className="py-4 text-right">Total (USD)</th>
                         <th className="py-4 text-center">Acción</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                      {items.map((item, idx) => (
                        <tr key={idx} className="text-xs font-bold">
                           <td className="py-5 text-slate-800 uppercase">{item.producto.nombre}</td>
                           <td className="py-5 text-center">{item.cantidad}</td>
                           <td className="py-5 text-right text-slate-800">${Number(item.producto.precio_usd).toFixed(2)}</td>
                           <td className="py-5 text-center">
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded ${!item.producto.es_exento ? 'bg-slate-800 text-white' : 'bg-white text-slate-400'}`}>
                                {!item.producto.es_exento ? 'G (16%)' : 'E (0%)'}
                              </span>
                           </td>
                           <td className="py-5 text-right font-black text-[#0b5156]">
                             ${(Number(item.producto.precio_usd) * item.cantidad).toFixed(2)}
                           </td>
                           <td className="py-5 text-center">
                             <button 
                               onClick={() => handleRemoveItem(idx)}
                               className="text-red-500 hover:text-red-700"
                             >
                               <Trash2 size={14} />
                             </button>
                           </td>
                        </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 mb-4 text-[#0b5156]">
               <Calculator size={18} />
               <h3 className="text-xl font-black uppercase tracking-tight">Totalizacion Fiscal</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-end text-xs font-bold text-slate-500 uppercase">
                <span>Subtotal Gravado (G)</span>
                <div className="text-right">
                  <span className="block text-slate-800 font-black">${totals.subtotalG.toFixed(2)}</span>
                  <span className="text-[9px] opacity-60">Bs. {(totals.subtotalG * tasaBcv).toLocaleString()}</span>
                </div>
              </div>
              <div className="flex justify-between items-end text-xs font-bold text-slate-500 uppercase">
                <span>Subtotal Exento (E)</span>
                <div className="text-right">
                  <span className="block text-slate-800 font-black">${totals.subtotalE.toFixed(2)}</span>
                  <span className="text-[9px] opacity-60">Bs. {(totals.subtotalE * tasaBcv).toLocaleString()}</span>
                </div>
              </div>
              <div className="flex justify-between items-end text-xs font-bold text-[#0b5156] uppercase border-t border-slate-100 pt-3">
                <span>IVA (16%)</span>
                <div className="text-right">
                  <span className="block font-black">${totals.iva.toFixed(2)}</span>
                  <span className="text-[9px] opacity-60">Bs. {(totals.iva * tasaBcv).toLocaleString()}</span>
                </div>
              </div>
              
              {metodoPago === 'Divisa' && (
                <div className="bg-green-50 p-4 rounded-2xl space-y-3 border border-green-200">
                   <div className="flex justify-between items-end text-xs font-black text-[#0b5156] uppercase">
                     <span className="flex items-center gap-1"><DollarSign size={10} /> IGTF (3% Divisas)</span>
                     <div className="text-right">
                       <span className="block font-black">${totals.igtfUsd.toFixed(2)}</span>
                       <span className="text-[9px] opacity-60">Bs. {(totals.igtfUsd * tasaBcv).toLocaleString()}</span>
                     </div>
                   </div>
                </div>
              )}

              {totals.isSpecialTaxpayer && (
                <div className="flex justify-between items-end text-xs font-bold text-red-600 uppercase border-t border-slate-100 pt-3">
                  <span className="flex items-center gap-1"><AlertCircle size={10} /> Retencion IVA (75%)</span>
                  <div className="text-right">
                    <span className="block font-black">- ${totals.retentionIVA.toFixed(2)}</span>
                    <span className="text-[9px] opacity-60">Bs. -{(totals.retentionIVA * tasaBcv).toLocaleString()}</span>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center border-t-2 border-[#0b5156] pt-6 mt-4">
                 <strong className="text-lg font-black text-slate-800 uppercase tracking-tighter">Neto a Cobrar</strong>
                 <div className="text-right">
                    <strong className="text-2xl font-black text-[#0b5156] block tracking-tighter">${totals.netToCollect.toFixed(2)}</strong>
                    <span className="text-xs font-black text-slate-400">Bs. {(totals.netToCollect * tasaBcv).toLocaleString()}</span>
                 </div>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default InvoiceForm;
