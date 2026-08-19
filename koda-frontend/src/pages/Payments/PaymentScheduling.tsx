import { useEffect, useState } from 'react';
import { 
  Plus, 
  Activity, 
  ShieldAlert,
} from 'lucide-react';
import { api } from '@/api/client';

interface PaymentItem {
  id?: number;
  title: string;
  meta: string;
  amount: string;
  urgent?: boolean;
  critical?: boolean;
  tag?: string;
}

interface Column {
  title: string;
  count: number;
  total: string;
  color: string;
  bg: string;
  items: PaymentItem[];
}

const PaymentScheduling = () => {
  const [stress, setStress] = useState(0);
  const [items1, setItems1] = useState<PaymentItem[]>([]);
  const [items2, setItems2] = useState<PaymentItem[]>([]);
  const [items3, setItems3] = useState<PaymentItem[]>([]);
  const [items4, setItems4] = useState<PaymentItem[]>([]);
  const [baseLiquidity, setBaseLiquidity] = useState(0);
  const [indexedDebt, setIndexedDebt] = useState(0);

  // Toast feedback
  const [toast, setToast] = useState<string | null>(null);

  // Paying order states
  const [payingOrder, setPayingOrder] = useState<any>(null);
  const [bancos, setBancos] = useState<any[]>([]);
  const [bancoId, setBancoId] = useState('');
  const [refTrans, setRefTrans] = useState('');
  const [metodo, setMetodo] = useState('Transferencia');

  // Manual payment modal states
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [formProveedorId, setFormProveedorId] = useState('');
  const [formRef, setFormRef] = useState('');
  const [formMonto, setFormMonto] = useState('');
  const [formTasa, setFormTasa] = useState('36.52');
  const [formCredito, setFormCredito] = useState('15');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = async () => {
    try {
      const [data, bancosRes, provRes] = await Promise.all([
        api.get<any>('/pagos/programacion'),
        api.get<any[]>('/tesoreria/bancos'),
        api.get<any[]>('/proveedores')
      ]);
      setBaseLiquidity(Number(data?.liquidez_base || 0));
      setIndexedDebt(Number(data?.deuda_indexada || 0));
      setItems1(data?.columnas?.vencido_hoy || []);
      setItems2(data?.columnas?.esta_semana || []);
      setItems3(data?.columnas?.proxima_semana || []);
      setItems4(data?.columnas?.fin_mes || []);
      setBancos(bancosRes || []);
      setProveedores(provRes || []);
      if (bancosRes && bancosRes.length > 0) {
        setBancoId(String(bancosRes[0].id));
      }
      if (provRes && provRes.length > 0) {
        setFormProveedorId(String(provRes[0].id));
      }
    } catch (err) {
      console.error("Error fetching payment scheduling:", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleConfirmarPago = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingOrder || !bancoId || !refTrans) {
      showToast("Por favor complete los datos de la transferencia.");
      return;
    }
    try {
      await api.post('/pagos/ordenes/aprobar', {
        orden_id: payingOrder.id ? `OP-${String(payingOrder.id).padStart(6, '0')}` : `OP-${Math.floor(Math.random() * 900000) + 100000}`,
        banco_id: parseInt(bancoId),
        referencia: refTrans,
        metodo: metodo
      });
      showToast("Pago procesado exitosamente.");
      setPayingOrder(null);
      setRefTrans('');
      fetchData();
    } catch (error) {
      console.error("Error paying order:", error);
      showToast("Error al procesar el pago bancario.");
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProveedorId || !formRef || !formMonto) {
      showToast("Por favor complete todos los campos obligatorios.");
      return;
    }
    try {
      await api.post('/pagos/cuentas/manual', {
        proveedor_id: parseInt(formProveedorId),
        numero_documento: formRef,
        monto_total_usd: parseFloat(formMonto),
        tasa_cambio_bs: parseFloat(formTasa),
        dias_credito: parseInt(formCredito)
      });
      showToast("Factura / Orden de proveedor registrada exitosamente.");
      setIsManualOpen(false);
      setFormRef('');
      setFormMonto('');
      fetchData();
    } catch (err: any) {
      console.error(err);
      showToast("Error al registrar la factura.");
    }
  };

  const stressImpact = indexedDebt * (stress / 100);
  const stressedLiquidity = baseLiquidity - stressImpact;

  const calculateTotal = (colItems: PaymentItem[]) => {
    const total = colItems.reduce((sum, item) => {
      const val = parseFloat(item.amount.replace(/[^0-9.-]+/g, '')) || 0;
      return sum + val;
    }, 0);
    return `$${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  const columns: Column[] = [
    { 
      title: 'Vencido / Hoy', 
      count: items1.length, 
      total: calculateTotal(items1), 
      color: 'text-red-600', 
      bg: 'bg-red-50/50',
      items: items1
    },
    { 
      title: 'Esta Semana', 
      count: items2.length, 
      total: calculateTotal(items2), 
      color: 'text-amber-600', 
      bg: 'bg-amber-50/50',
      items: items2
    },
    { 
      title: 'Próxima Semana', 
      count: items3.length, 
      total: calculateTotal(items3), 
      color: 'text-blue-600', 
      bg: 'bg-blue-50/50',
      items: items3
    },
    { 
      title: 'Fin de Mes', 
      count: items4.length, 
      total: calculateTotal(items4), 
      color: 'text-slate-500', 
      bg: 'bg-slate-50/50',
      items: items4
    },
  ];

  return (
    <>
      <div className="space-y-4 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Pagos &gt; Tesorería
              </span>
            </div>
            <h1 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase">Programación de Pagos</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Gestión de liquidez y simulación de escenarios cambiarios.</p>
          </div>
          <div className="flex gap-4 items-center">
            <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-6 shadow-sm">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-red-600 uppercase block tracking-widest">Escenario BCV (+%)</label>
                <input 
                  type="number" 
                  value={stress} 
                  onChange={(e) => setStress(Number(e.target.value))}
                  className="bg-white border border-red-200 rounded-lg px-2 py-1 text-sm font-black text-red-600 outline-none w-20 text-center"
                />
              </div>
              <div className="space-y-1 text-right">
                <span className="text-xs font-black text-slate-400 uppercase block">Caja Estresada</span>
                <strong className={`text-xl font-black font-mono ${stressedLiquidity < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ${stressedLiquidity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </strong>
              </div>
            </div>
            <button 
              onClick={() => setIsManualOpen(true)}
              className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
            >
              <Plus size={14} /> Nueva Orden
            </button>
          </div>
        </div>
      </header>

      {/* Alerta Condicional de Devaluación */}
      {stress > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-4">
            <div className="bg-red-100 text-red-600 p-2 rounded-xl">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black text-red-900 uppercase tracking-tighter">⚠️ Alerta de Impacto Cambiario</h3>
              <p className="text-xs font-bold text-red-700/80 uppercase">
                Con una devaluación del {stress}%, tu flujo de caja se reduce en <strong className="text-red-900">${stressImpact.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong> debido a la deuda indexada.
              </p>
            </div>
          </div>
          <button className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase shadow-sm transition-all">
            Detalle por moneda
          </button>
        </div>
      )}

      {/* Kanban Board */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {columns.map((col, i) => (
          <div key={i} className={`flex flex-col rounded-2xl border border-slate-200 ${col.bg} overflow-hidden`}>
            {/* Column Header */}
            <div className="p-4 bg-white border-b border-slate-100 space-y-1 flex-shrink-0">
              <div className="flex justify-between items-center">
                <h3 className={`text-xs font-black uppercase tracking-widest ${col.color}`}>{col.title}</h3>
                <span className="bg-slate-100 text-slate-500 text-[10px] font-black px-2 py-0.5 rounded-full">{col.count}</span>
              </div>
              <div className={`text-2xl font-black font-mono tracking-tighter ${col.color}`}>{col.total}</div>
            </div>

            {/* Cards Container */}
            <div className="h-[438px] overflow-y-auto p-2 space-y-2 custom-scrollbar">
              {col.items.length > 0 ? (
                col.items.map((item, j) => (
                  <div key={j} className={`bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-[78px] min-h-[78px] group hover:border-[#0b5156]/30 transition-all cursor-grab active:cursor-grabbing relative overflow-hidden ${item.urgent ? 'border-l-4 border-l-red-500' : ''}`}>
                    {item.critical && (
                      <div className="absolute top-0 right-0">
                        <div className="bg-red-600 text-white text-[7px] font-black px-1.5 py-0.5 uppercase tracking-widest animate-pulse">
                          Stock Crítico
                        </div>
                      </div>
                    )}
                    
                    <div className="flex justify-between items-start gap-2">
                      <h4 className="text-[10px] font-black text-[#0b5156] uppercase leading-tight line-clamp-1 group-hover:text-[#0d6970] transition-colors">{item.title}</h4>
                      <strong className="text-xs font-black text-[#0b5156] font-mono leading-none">{item.amount}</strong>
                    </div>

                    <div className="flex justify-between items-end mt-1.5 pt-1.5 border-t border-slate-50">
                      <p className="text-[8px] font-bold text-slate-400 uppercase leading-none">{item.meta}</p>
                      {item.tag ? (
                        <span className="text-[8px] font-black text-slate-400 border border-slate-100 px-1 py-0.5 rounded uppercase leading-none">
                          {item.tag}
                        </span>
                      ) : (
                        <button 
                          onClick={() => setPayingOrder(item)}
                          className="bg-white text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 text-[8px] font-black uppercase hover:bg-[#0b5156] hover:text-white transition-all leading-none"
                        >
                          Pagar
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-xs font-bold uppercase p-8 text-center">
                  Sin programaciones
                </div>
              )}
            </div>
          </div>
        ))}
      </section>

      </div>

      {/* Premium Toast Notification */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-bounce">
          <div className="bg-[#0b5156] border border-[#083a3d] text-white px-6 py-3 rounded-full text-xs font-black uppercase tracking-wider shadow-2xl flex items-center gap-2">
            🔔 {toast}
          </div>
        </div>
      )}

      {/* Modal Manual */}
      {isManualOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 max-w-md w-full shadow-2xl space-y-6">
            <div>
              <h3 className="text-lg font-black text-[#0b5156] uppercase">Registrar Factura Manual</h3>
              <p className="text-xs font-bold text-slate-400 uppercase">Crea un pasivo o cuenta por pagar para un proveedor.</p>
            </div>
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider pl-1">Proveedor</label>
                <select
                  value={formProveedorId}
                  onChange={(e) => setFormProveedorId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#0b5156] uppercase"
                >
                  {proveedores.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} ({p.rif})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider pl-1">Número de Factura</label>
                <input
                  type="text"
                  required
                  placeholder="FAC-XXX-XXXX"
                  value={formRef}
                  onChange={(e) => setFormRef(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider pl-1">Monto (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={formMonto}
                    onChange={(e) => setFormMonto(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider pl-1">Tasa Cambio (Bs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formTasa}
                    onChange={(e) => setFormTasa(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider pl-1">Días de Crédito</label>
                <input
                  type="number"
                  required
                  value={formCredito}
                  onChange={(e) => setFormCredito(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsManualOpen(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl text-xs font-black uppercase transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#0b5156] hover:bg-[#083a3d] text-white py-3 rounded-xl text-xs font-black uppercase shadow-lg shadow-green-900/10 transition-all"
                >
                  Guardar CxP
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Confirmation Modal */}
      {payingOrder && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 max-w-md w-full shadow-2xl space-y-6">
            <div>
              <h3 className="text-lg font-black text-[#0b5156] uppercase">Procesar Pago Bancario</h3>
              <p className="text-xs font-bold text-slate-400 uppercase">Liquidar: {payingOrder.title}</p>
              <div className="mt-2 text-2xl font-black font-mono text-[#0b5156]">{payingOrder.amount}</div>
            </div>
            
            <form onSubmit={handleConfirmarPago} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider pl-1">Método de Pago</label>
                <select 
                  value={metodo}
                  onChange={(e) => setMetodo(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#0b5156] uppercase"
                >
                  <option value="Transferencia">Transferencia Bancaria</option>
                  <option value="Zelle">Zelle</option>
                  <option value="Efectivo">Efectivo</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider pl-1">Cuenta de Origen</label>
                <select 
                  value={bancoId}
                  onChange={(e) => setBancoId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#0b5156] uppercase"
                >
                  {bancos.map(b => (
                    <option key={b.id} value={b.id}>{b.banco} ({b.moneda}) - Saldo: ${parseFloat(b.saldo_actual_usd).toFixed(2)}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider pl-1">Nro. de Referencia</label>
                <input 
                  type="text" 
                  required
                  placeholder="00000000"
                  value={refTrans}
                  onChange={(e) => setRefTrans(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setPayingOrder(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl text-xs font-black uppercase transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-[#0b5156] hover:bg-[#083a3d] text-white py-3 rounded-xl text-xs font-black uppercase shadow-lg shadow-green-900/10 transition-all"
                >
                  Confirmar Pago
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default PaymentScheduling;
