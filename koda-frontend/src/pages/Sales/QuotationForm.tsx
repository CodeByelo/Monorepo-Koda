import React, { useState } from 'react';
import { Plus, Trash2, X, FileText, Calendar, User, DollarSign, Percent, Coins, AlertTriangle } from 'lucide-react';
import { api } from '@/api/client';

interface QuotationItem {
  description: string;
  quantity: number;
  price: number;
  discountPct: number;
}

interface QuotationFormProps {
  onCancel: () => void;
  onSubmit: (formData: any) => void;
}

const getTodayDate = () => {
  return new Date().toISOString().split('T')[0];
};

const getDefaultDueDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 15);
  return date.toISOString().split('T')[0];
};

export const QuotationForm: React.FC<QuotationFormProps> = ({ onCancel, onSubmit }) => {
  const [client, setClient] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'VES'>('USD');
  const [emissionDate, setEmissionDate] = useState(getTodayDate());
  const [dueDate, setDueDate] = useState(getDefaultDueDate());
  const [items, setItems] = useState<QuotationItem[]>([
    { description: '', quantity: 1, price: 0.00, discountPct: 0 }
  ]);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [clientesList, setClientesList] = React.useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  React.useEffect(() => {
    const fetchClientes = async () => {
      try {
        const data = await api.get<any[]>('/clientes');
        setClientesList(data || []);
      } catch (err) {
        console.error("Error cargando clientes:", err);
      }
    };
    fetchClientes();
  }, []);

  const handleAddItem = () => {
    setItems([...items, { description: '', quantity: 1, price: 0.00, discountPct: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleItemChange = (index: number, field: keyof QuotationItem, value: any) => {
    const newItems = [...items];
    if (field === 'quantity') {
      newItems[index].quantity = Math.max(1, parseInt(value) || 0);
    } else if (field === 'price') {
      newItems[index].price = Math.max(0, parseFloat(value) || 0);
    } else if (field === 'discountPct') {
      newItems[index].discountPct = Math.min(100, Math.max(0, parseFloat(value) || 0));
    } else {
      newItems[index][field] = value;
    }
    setItems(newItems);
  };

  // Cálculos de Totales
  const calculateSubtotal = () => {
    return items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
  };

  const calculateTotalDiscount = () => {
    return items.reduce((sum, item) => sum + (item.quantity * item.price * (item.discountPct / 100)), 0);
  };

  const calculateTotalFinal = () => {
    return items.reduce((sum, item) => {
      const lineTotal = item.quantity * item.price * (1 - item.discountPct / 100);
      return sum + lineTotal;
    }, 0);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!client.trim()) {
      setErrorMsg('Por favor ingrese el nombre del cliente.');
      return;
    }
    
    const clientExists = clientesList.some(c => c.nombre.toLowerCase() === client.trim().toLowerCase());
    if (!clientExists) {
      setErrorMsg('El cliente ingresado no existe en el sistema. Por favor, regístrelo primero en el módulo de Clientes con su RIF correspondiente antes de cotizarle.');
      return;
    }
    
    setIsSaving(true);
    try {
      const formData = {
        client,
        currency,
        emissionDate,
        dueDate,
        items,
        notes,
        subtotal: calculateSubtotal(),
        discountTotal: calculateTotalDiscount(),
        totalFinal: calculateTotalFinal()
      };
      
      const response = await api.post<any>('/ventas/cotizaciones', formData);
      console.log('Cotización creada con éxito:', response);
      onSubmit(response);
    } catch (error: any) {
      console.error('Error al guardar cotización:', error);
      setErrorMsg(error.message || 'Error al guardar la cotización. Por favor intente de nuevo.');
    } finally {
      setIsSaving(false);
    }
  };

  const subtotal = calculateSubtotal();
  const discountTotal = calculateTotalDiscount();
  const totalFinal = calculateTotalFinal();
  const currencySymbol = currency === 'USD' ? '$' : 'Bs';

  return (
    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in duration-300">
      <header className="flex justify-between items-center mb-8 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-slate-900 text-white rounded-2xl">
            <FileText size={20} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">Nueva Cotización</h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-0.5">Crear propuesta de negocio para clientes</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
        >
          <X size={20} />
        </button>
      </header>

      {errorMsg && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 animate-in slide-in-from-top-2">
          <AlertTriangle className="text-rose-500 shrink-0 mt-0.5" size={18} />
          <p className="text-sm font-bold text-rose-700">{errorMsg}</p>
        </div>
      )}

      <form onSubmit={handleFormSubmit} className="space-y-8">
        {/* Cabecera del Formulario */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-2 space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <User size={12} className="text-slate-500" /> Cliente
            </label>
            <input
              type="text"
              required
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Seleccione o escriba el nombre del cliente..."
              list="clientes-datalist"
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-xs font-bold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-[#0b5156]/50 focus:ring-1 focus:ring-[#0b5156]/50 transition-all"
            />
            <datalist id="clientes-datalist">
              {clientesList.map((c, i) => (
                <option key={i} value={c.nombre} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Coins size={12} className="text-slate-500" /> Moneda
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as 'USD' | 'VES')}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-xs font-black text-slate-500 uppercase focus:outline-none focus:border-[#0b5156]/50 focus:ring-1 focus:ring-[#0b5156]/50 transition-all"
            >
              <option value="USD">USD ($)</option>
              <option value="VES">VES (Bs)</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Calendar size={12} className="text-slate-500" /> Fecha de Emisión
            </label>
            <input
              type="date"
              required
              value={emissionDate}
              onChange={(e) => setEmissionDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0b5156]/50 focus:ring-1 focus:ring-[#0b5156]/50 transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Calendar size={12} className="text-slate-500" /> Fecha de Vencimiento
            </label>
            <input
              type="date"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0b5156]/50 focus:ring-1 focus:ring-[#0b5156]/50 transition-all"
            />
          </div>
        </div>

        {/* Tabla Dinámica de Productos */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Productos / Servicios</h3>
            <button
              type="button"
              onClick={handleAddItem}
              className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 tracking-wider shadow-md hover:bg-slate-800 transition-colors"
            >
              <Plus size={14} /> Agregar Producto
            </button>
          </div>

          <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="py-4 px-5">Descripción</th>
                  <th className="py-4 px-5 text-center w-20">Cant.</th>
                  <th className="py-4 px-5 text-right w-32">Precio Unitario</th>
                  <th className="py-4 px-5 text-center w-24">Descuento (%)</th>
                  <th className="py-4 px-5 text-right w-32">Total Fila</th>
                  <th className="py-4 px-5 text-center w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {items.map((item, index) => {
                  const lineTotal = item.quantity * item.price * (1 - item.discountPct / 100);
                  return (
                    <tr key={index} className="group hover:bg-slate-50/20 transition-colors">
                      <td className="py-4 px-5">
                        <input
                          type="text"
                          required
                          placeholder="Descripción del producto o servicio..."
                          value={item.description}
                          onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                          className="w-full bg-transparent border-0 border-b border-transparent focus:border-[#0b5156]/30 focus:ring-0 px-0 py-1 text-xs font-bold text-slate-700 placeholder:text-slate-400 transition-colors"
                        />
                      </td>
                      <td className="py-4 px-5">
                        <input
                          type="number"
                          min="1"
                          required
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-center text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0b5156]/30"
                        />
                      </td>
                      <td className="py-4 px-5">
                        <div className="relative rounded-xl shadow-sm">
                          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
                            <span className="text-slate-400 text-xs font-bold">{currencySymbol}</span>
                          </div>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            required
                            value={item.price || ''}
                            placeholder="0.00"
                            onChange={(e) => handleItemChange(index, 'price', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-6 pr-3 py-1.5 text-right text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0b5156]/30"
                          />
                        </div>
                      </td>
                      <td className="py-4 px-5">
                        <div className="relative rounded-xl shadow-sm">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={item.discountPct || ''}
                            placeholder="0"
                            onChange={(e) => handleItemChange(index, 'discountPct', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-6 pl-2.5 py-1.5 text-center text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0b5156]/30"
                          />
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                            <Percent size={12} className="text-slate-400" />
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-5 text-right text-xs font-black text-slate-700">
                        {currencySymbol} {lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-4 px-5 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          disabled={items.length <= 1}
                          className="text-slate-300 hover:text-red-500 disabled:opacity-30 disabled:hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-50 transition-all"
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

        {/* Condiciones Comerciales y Resumen */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-100">
          <div className="md:col-span-2 space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Condiciones Comerciales / Notas</label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Términos de pago, tiempo de entrega, validez de la oferta..."
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-xs font-bold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-[#0b5156]/50 focus:ring-1 focus:ring-[#0b5156]/50 transition-all"
            />
          </div>

          <div className="bg-slate-900 text-white p-6 rounded-2xl flex flex-col justify-between shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5 text-white pointer-events-none">
              <DollarSign size={80} />
            </div>
            
            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-[#00C294] uppercase tracking-widest pb-2 border-b border-white/10">Resumen de Totales</h4>
              
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-white/80 uppercase">Subtotal:</span>
                <span className="font-mono font-bold text-white">
                  {currencySymbol} {subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-white/80 uppercase">Descuento Total:</span>
                <span className="font-mono font-bold text-red-400">
                  -{currencySymbol} {discountTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              
              <div className="flex justify-between items-center pt-2 border-t border-white/10">
                <span className="text-xs font-black text-white uppercase">Total Final:</span>
                <span className="font-mono font-black text-xl text-[#00C294]">
                  {currencySymbol} {totalFinal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <p className="text-[9px] font-bold text-white/60 uppercase mt-6">
              Moneda de cotización: {currency}
            </p>
          </div>
        </div>

        {/* Botones de Envío */}
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
            {isSaving ? 'Guardando...' : 'Generar Cotización'}
          </button>
        </div>
      </form>
    </div>
  );
};
