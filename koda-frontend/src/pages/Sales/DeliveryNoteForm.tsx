import React, { useState, useEffect, useRef } from 'react';
import { Truck, X, User, Calendar, Plus, Trash2, AlertTriangle, CheckCircle2, MapPin, Hash, PlusCircle } from 'lucide-react';
import { api } from '@/api/client';

interface ProductoCatalogo {
  id: number;
  sku: string;
  nombre: string;
  stock: number;
}

interface DeliveryItem {
  id: number;
  description: string;
  quantity: number;
  productoId: number | null; // Producto real del catálogo (null = aún no seleccionado / no encontrado)
  stockAvailable: number; // Stock REAL tomado de /productos (Producto.stock). 0 hasta que se seleccione un producto válido.
}

interface CustomField {
  id: string;
  key: string;
  value: string;
}

interface DeliveryNoteFormProps {
  onCancel: () => void;
  onSubmit: (formData: any) => void;
  initialData?: any; // Para cuando viene de una Orden de Venta
}

export const DeliveryNoteForm: React.FC<DeliveryNoteFormProps> = ({ onCancel, onSubmit, initialData }) => {
  const [client, setClient] = useState(initialData?.client || '');
  const [emissionDate, setEmissionDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Logistica base
  const [carrier, setCarrier] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [destination, setDestination] = useState('');
  const [notes, setNotes] = useState('');
  
  // Campos personalizados (para el dueño)
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  // Productos: se crean SIN stock hasta que se seleccione un producto real
  // del catálogo (ver `productCatalog`). Ya no se fabrica un stock aleatorio:
  // si el ítem viene de una Orden de Venta sin `producto_id` resoluble,
  // queda bloqueado (stockAvailable: 0) hasta que el usuario elija un
  // producto válido en el picker.
  const [items, setItems] = useState<DeliveryItem[]>(
    initialData?.items?.map((item: any, idx: number) => ({
      id: Date.now() + idx,
      description: item.description || '',
      quantity: item.quantity || 1,
      productoId: typeof item.producto_id === 'number' ? item.producto_id : null,
      stockAvailable: 0
    })) || [
      { id: Date.now(), description: '', quantity: 1, productoId: null, stockAvailable: 0 }
    ]
  );

  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [clientesList, setClientesList] = useState<any[]>([]);
  const [vehiclesList, setVehiclesList] = useState<any[]>([]);
  const [driversList, setDriversList] = useState<any[]>([]);
  const [productCatalog, setProductCatalog] = useState<ProductoCatalogo[]>([]);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const initialStockBackfilled = useRef(false);

  useEffect(() => {
    const fetchClientes = async () => {
      try {
        const data = await api.get<any[]>('/clientes');
        setClientesList(data || []);
      } catch (err) {
        console.error("Error cargando clientes:", err);
      }
    };
    const fetchLogistica = async () => {
      try {
        // api.get devuelve arreglos "pelados" (no envueltos en { data: [...] }),
        // igual que en Quotations.tsx / QuotationForm.tsx.
        const [vList, dList] = await Promise.all([
          api.get<any[]>('/api/logistica/vehiculos'),
          api.get<any[]>('/api/logistica/choferes')
        ]);
        setVehiclesList(vList || []);
        setDriversList(dList || []);
      } catch (err) {
        console.error("Error cargando datos de logística:", err);
      }
    };
    const fetchProductos = async () => {
      setIsCatalogLoading(true);
      try {
        const data = await api.get<any[]>('/productos');
        const mapped: ProductoCatalogo[] = (data || []).map((p: any) => ({
          id: p.id,
          sku: p.sku || `PRD-00${p.id}`,
          nombre: p.nombre || p.name,
          stock: Number(p.stock ?? p.cantidad ?? 0)
        }));
        setProductCatalog(mapped);
      } catch (err) {
        console.error("Error cargando catálogo de productos:", err);
      } finally {
        setIsCatalogLoading(false);
      }
    };
    fetchClientes();
    fetchLogistica();
    fetchProductos();
  }, []);

  // Cuando el catálogo real llega, intentamos resolver (una sola vez) los
  // ítems que vinieron de una Orden de Venta por descripción/nombre, para
  // completar su stock real. Si no hay match, el ítem queda bloqueado
  // (productoId null / stockAvailable 0) y el usuario debe elegir un
  // producto válido manualmente — nunca se rellena con un número inventado.
  useEffect(() => {
    if (initialStockBackfilled.current) return;
    if (productCatalog.length === 0) return;
    if (!initialData?.items?.length) {
      initialStockBackfilled.current = true;
      return;
    }
    setItems(prev => prev.map(item => {
      if (item.productoId !== null) {
        const match = productCatalog.find(p => p.id === item.productoId);
        return match ? { ...item, stockAvailable: match.stock } : item;
      }
      const byName = productCatalog.find(p => p.nombre.toLowerCase() === item.description.trim().toLowerCase());
      if (byName) {
        return { ...item, productoId: byName.id, stockAvailable: byName.stock };
      }
      return item;
    }));
    initialStockBackfilled.current = true;
  }, [productCatalog, initialData]);

  const handleAddItem = () => {
    setItems([...items, { id: Date.now(), description: '', quantity: 1, productoId: null, stockAvailable: 0 }]);
  };

  // Selección de producto real desde el picker (datalist ligado al catálogo
  // de /productos, igual patrón que POS.tsx usa para su grilla de productos).
  // Si el texto no corresponde a ningún producto real, se limpia el stock a
  // 0 y se bloquea el envío en validateForm() en vez de mostrar un número
  // fabricado.
  const handleProductPick = (id: number, value: string) => {
    const match = productCatalog.find(
      p => p.nombre.toLowerCase() === value.trim().toLowerCase() || p.sku.toLowerCase() === value.trim().toLowerCase()
    );
    setItems(items.map(item => {
      if (item.id !== id) return item;
      if (match) {
        return { ...item, description: match.nombre, productoId: match.id, stockAvailable: match.stock };
      }
      return { ...item, description: value, productoId: null, stockAvailable: 0 };
    }));
  };

  const handleRemoveItem = (id: number) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const handleItemChange = (id: number, field: keyof DeliveryItem, value: any) => {
    setItems(items.map(item => {
      if (item.id === id) {
        if (field === 'quantity') {
          return { ...item, quantity: Math.max(1, parseInt(value) || 0) };
        }
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const handleAddCustomField = () => {
    setCustomFields([...customFields, { id: Date.now().toString(), key: '', value: '' }]);
  };

  const handleRemoveCustomField = (id: string) => {
    setCustomFields(customFields.filter(f => f.id !== id));
  };

  const handleCustomFieldChange = (id: string, field: 'key' | 'value', val: string) => {
    setCustomFields(customFields.map(f => {
      if (f.id === id) {
        return { ...f, [field]: val };
      }
      return f;
    }));
  };

  const validateForm = () => {
    if (!client.trim()) {
      setErrorMsg('Por favor seleccione o ingrese el cliente destino.');
      return false;
    }
    
    // Validación de inventario estricta
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.description.trim()) {
        setErrorMsg(`La línea ${i + 1} no tiene descripción de producto.`);
        return false;
      }
      if (item.productoId === null) {
        setErrorMsg(`La línea ${i + 1} ("${item.description}") no corresponde a ningún producto real del catálogo. Seleccione un producto existente para poder validar su stock real.`);
        return false;
      }
      if (item.quantity > item.stockAvailable) {
        setErrorMsg(`Stock Insuficiente: Estás intentando despachar ${item.quantity} unidades de "${item.description}", pero solo hay ${item.stockAvailable} en inventario. La operación ha sido bloqueada.`);
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      const formData = {
        client,
        emissionDate,
        logistics: {
          carrier,
          vehiclePlate,
          destination,
          notes,
          customFields
        },
        items: items.map(i => ({ description: i.description, quantity: i.quantity })),
        sourceOrder: initialData?.orderId || null
      };

      const created = await api.post<any>('/ventas/notas-entrega', formData);
      onSubmit(created);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al generar la nota de entrega. Intente de nuevo.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in duration-300">
      <header className="flex justify-between items-center mb-8 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-slate-900 text-white rounded-2xl">
            <Truck size={20} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">
              {initialData ? 'Despacho desde Orden' : 'Nueva Nota de Entrega'}
            </h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-0.5">
              {initialData ? `Orden Base: #${initialData.orderId}` : 'Despacho directo de inventario'}
            </p>
          </div>
        </div>
        <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-50 transition-colors">
          <X size={20} />
        </button>
      </header>

      {errorMsg && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 animate-in slide-in-from-top-2">
          <AlertTriangle className="text-rose-500 shrink-0 mt-0.5" size={18} />
          <p className="text-sm font-bold text-rose-700">{errorMsg}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        
        {/* Cabecera Principal */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <User size={12} className="text-slate-500" /> Cliente Destino
            </label>
            <input
              type="text"
              required
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Buscar o escribir cliente..."
              list="clientes-list"
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0b5156]/50 focus:ring-1 transition-all"
            />
            <datalist id="clientes-list">
              {clientesList.map((c, i) => <option key={i} value={c.nombre} />)}
            </datalist>
            <datalist id="productos-list">
              {productCatalog.map((p) => (
                <option key={p.id} value={p.nombre}>{p.sku} · Stock: {p.stock}</option>
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Calendar size={12} className="text-slate-500" /> Fecha de Despacho
            </label>
            <input
              type="date"
              required
              value={emissionDate}
              onChange={(e) => setEmissionDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0b5156]/50 focus:ring-1 transition-all"
            />
          </div>
        </div>

        {/* Datos Logísticos Dinámicos */}
        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-6">
           <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
             <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
               <Truck size={14} className="text-[#0b5156]" /> Datos de Logística y Transporte
             </h3>
             <button 
               type="button" 
               onClick={handleAddCustomField}
               className="text-[10px] font-black uppercase tracking-widest text-[#0b5156] hover:text-[#0b5156]/70 flex items-center gap-1 transition-colors"
             >
               <PlusCircle size={12} /> Campo Personalizado
             </button>
           </div>
           
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
             <div className="space-y-2">
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Transportista / Conductor</label>
                <input
                  type="text"
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  placeholder="Ej. Juan Pérez"
                  list="drivers-list"
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0b5156]/50"
                />
                <datalist id="drivers-list">
                  {driversList.map((d: any) => (
                    <option key={d.id} value={d.nombre}>{d.telefono || ''}</option>
                  ))}
                </datalist>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Placa del Vehículo</label>
                <input
                  type="text"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value)}
                  placeholder="Ej. AB123CD"
                  list="vehicles-list"
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0b5156]/50 uppercase"
                />
                <datalist id="vehicles-list">
                  {vehiclesList.map((v: any) => (
                    <option key={v.id} value={v.placa}>{v.nombre} ({v.tipo})</option>
                  ))}
                </datalist>
             </div>
             <div className="space-y-2">
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Destino / Sucursal</label>
               <input
                 type="text"
                 value={destination}
                 onChange={(e) => setDestination(e.target.value)}
                 placeholder="Dirección de entrega..."
                 className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0b5156]/50"
               />
             </div>
             
             {/* Dynamic Fields */}
             {customFields.map((field) => (
               <div key={field.id} className="col-span-1 md:col-span-2 lg:col-span-3 flex gap-4 items-end animate-in fade-in">
                 <div className="space-y-2 w-1/3">
                   <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nombre del Campo</label>
                   <input
                     type="text"
                     value={field.key}
                     onChange={(e) => handleCustomFieldChange(field.id, 'key', e.target.value)}
                     placeholder="Ej. Sello de Seguridad"
                     className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0b5156]/50"
                   />
                 </div>
                 <div className="space-y-2 flex-1">
                   <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Valor del Campo</label>
                   <input
                     type="text"
                     value={field.value}
                     onChange={(e) => handleCustomFieldChange(field.id, 'value', e.target.value)}
                     placeholder="Información adicional..."
                     className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0b5156]/50"
                   />
                 </div>
                 <button 
                   type="button" 
                   onClick={() => handleRemoveCustomField(field.id)}
                   className="p-2.5 mb-px text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                 >
                   <Trash2 size={16} />
                 </button>
               </div>
             ))}
           </div>
        </div>

        {/* Tabla de Despacho (Validación de Inventario) */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Productos a Despachar</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                El sistema bloqueará entregas que excedan el stock disponible
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddItem}
              className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 tracking-wider shadow-md hover:bg-slate-800 transition-colors"
            >
              <Plus size={14} /> Añadir Producto
            </button>
          </div>

          <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="py-4 px-5">Producto / Referencia</th>
                  <th className="py-4 px-5 text-center w-32">Stock Disp.</th>
                  <th className="py-4 px-5 text-center w-32">Cant. Salida</th>
                  <th className="py-4 px-5 text-center w-16">Est.</th>
                  <th className="py-4 px-5 text-center w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {items.map((item) => {
                  const isLowStock = item.stockAvailable > 0 && item.stockAvailable <= 5;
                  const isExceeded = item.quantity > item.stockAvailable;
                  
                  return (
                    <tr key={item.id} className={`group hover:bg-slate-50/20 transition-colors ${isExceeded ? 'bg-rose-50/30' : ''}`}>
                      <td className="py-4 px-5">
                        <input
                          type="text"
                          required
                          placeholder={isCatalogLoading ? 'Cargando catálogo...' : 'Buscar producto por nombre o SKU...'}
                          value={item.description}
                          list="productos-list"
                          onChange={(e) => handleProductPick(item.id, e.target.value)}
                          className={`w-full bg-transparent border-0 border-b focus:ring-0 px-0 py-1 text-xs font-bold placeholder:text-slate-400 transition-colors ${
                            item.description && item.productoId === null
                              ? 'border-rose-300 text-rose-600 focus:border-rose-500'
                              : 'border-transparent text-slate-700 focus:border-[#0b5156]/30'
                          }`}
                        />
                        {item.description && item.productoId === null && (
                          <p className="text-[9px] font-black text-rose-500 uppercase tracking-wide mt-1">
                            Producto no encontrado en el catálogo
                          </p>
                        )}
                      </td>
                      <td className="py-4 px-5 text-center">
                        <div className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black font-mono
                          ${isLowStock ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}
                        `}>
                          {item.stockAvailable} UND
                        </div>
                      </td>
                      <td className="py-4 px-5">
                        <div className="relative">
                          <input
                            type="number"
                            min="1"
                            required
                            value={item.quantity}
                            onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                            className={`w-full bg-white border rounded-xl px-2.5 py-1.5 text-center text-xs font-black focus:outline-none transition-colors
                              ${isExceeded 
                                ? 'border-rose-300 text-rose-600 focus:border-rose-500 focus:ring-1 focus:ring-rose-500' 
                                : 'border-slate-200 text-slate-700 focus:border-[#0b5156]/30'}
                            `}
                          />
                        </div>
                      </td>
                      <td className="py-4 px-5 text-center">
                        {isExceeded ? (
                           <AlertTriangle size={16} className="text-rose-500 mx-auto" />
                        ) : (
                           <CheckCircle2 size={16} className="text-emerald-500 mx-auto" />
                        )}
                      </td>
                      <td className="py-4 px-5 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          disabled={items.length <= 1}
                          className="text-slate-300 hover:text-rose-500 disabled:opacity-30 p-1.5 rounded-lg hover:bg-slate-50 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Notas Adicionales */}
        <div className="space-y-2 pt-4 border-t border-slate-100">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observaciones Generales</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Comentarios adicionales para el almacén o el transportista..."
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-xs font-bold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-[#0b5156]/50 transition-all"
          />
        </div>

        {/* Acciones */}
        <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            className="bg-white text-slate-600 px-6 py-3.5 rounded-2xl text-xs font-black uppercase border border-slate-200 hover:bg-slate-50 transition-colors tracking-widest"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="bg-[#0b5156] text-white px-8 py-3.5 rounded-2xl text-xs font-black uppercase hover:bg-[#073639] transition-colors tracking-widest shadow-lg shadow-[#0b5156]/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Procesando...' : 'Confirmar Despacho'}
          </button>
        </div>
      </form>
    </div>
  );
};
