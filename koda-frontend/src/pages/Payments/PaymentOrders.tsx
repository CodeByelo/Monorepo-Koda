import { useState, useEffect } from 'react';
import { 
  Plus, 
  ShieldAlert, 
  HelpCircle
} from 'lucide-react';
import { api } from '@/api/client';

const PaymentOrders = () => {
  const [metrics, setMetrics] = useState<any[]>([]);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [historyOrders, setHistoryOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Advanced flow states
  const [payingOrder, setPayingOrder] = useState<any>(null);
  const [bancos, setBancos] = useState<any[]>([]);
  const [bancoId, setBancoId] = useState('');
  const [refTrans, setRefTrans] = useState('');
  const [metodo, setMetodo] = useState('Transferencia');

  // toast feedback
  const [toast, setToast] = useState<string | null>(null);
  // details modal
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  // Manual invoice modal states
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
    setIsLoading(true);
    try {
      const [data, bancosRes, provRes] = await Promise.all([
        api.get<any>('/pagos/ordenes'),
        api.get<any[]>('/tesoreria/bancos'),
        api.get<any[]>('/proveedores')
      ]);
      setPendingOrders(data?.ordenes_pendientes || data?.ordenes || []);
      setHistoryOrders(data?.historial || []);
      setMetrics(data?.metricas || []);
      setBancos(bancosRes || []);
      setProveedores(provRes || []);
      if (bancosRes && bancosRes.length > 0) {
        setBancoId(String(bancosRes[0].id));
      }
      if (provRes && provRes.length > 0) {
        setFormProveedorId(String(provRes[0].id));
      }
    } catch (error) {
      console.error("Error fetching payment orders:", error);
    } finally {
      setIsLoading(false);
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
        orden_id: payingOrder.id || payingOrder.orden,
        banco_id: parseInt(bancoId),
        referencia: refTrans,
        metodo: metodo
      });
      showToast(`Orden ${payingOrder.id || payingOrder.orden} pagada exitosamente.`);
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

  const totalMonto = pendingOrders.reduce((sum, o) => {
    const val = typeof o.amount === 'number' ? o.amount : (parseFloat(String(o.amount || o.monto || '0').replace(/[^0-9.]/g, '')) || 0);
    return sum + val;
  }, 0);

  const displayMetrics = metrics.length > 0 ? metrics : [
    { label: 'Órdenes Pendientes', value: '0', desc: 'Por aprobar', color: 'text-amber-600' },
    { label: 'Monto Total', value: '$0.00', desc: 'En cola de pago', color: 'text-[#0b5156]' },
    { label: 'Vencen Hoy', value: '0', desc: 'Urgente aprobar', color: 'text-red-600' },
    { label: 'Pagadas Mes', value: '0', desc: '$0.00 ejecutados', color: 'text-green-600' },
  ];

  const displayOrders = pendingOrders;

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Pagos
              </span>
            </div>
            <h1 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase">Órdenes de Pago</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Gestión y aprobación de desembolsos a proveedores.</p>
          </div>
          <div className="flex gap-3">
             <button 
                onClick={() => setIsManualOpen(true)}
                className="bg-slate-50 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-white transition-all flex items-center gap-2"
             >
                <HelpCircle size={14} /> Manual
             </button>
             <button 
                onClick={() => setIsManualOpen(true)}
                className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
             >
                <Plus size={14} /> Nueva Orden
             </button>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {displayMetrics.map((m, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-36">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">{m.label || m.etiqueta}</p>
            <div className="space-y-1">
              <strong className={`text-3xl font-black ${m.color || 'text-slate-800'} tracking-tighter font-mono`}>{m.value || m.valor}</strong>
              <p className="text-sm font-bold text-slate-400 uppercase leading-tight">{m.desc || m.descripcion}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Main Content */}
      <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Cola de Aprobación</h2>
            <p className="text-xs font-bold text-slate-500 uppercase">Desembolsos pendientes de autorización fiscal y financiera.</p>
          </div>
          <select className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156] uppercase">
            <option>Todas las órdenes</option>
            <option>Urgentes</option>
            <option>Vencidas</option>
          </select>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-4 px-4">N° ORDEN</th>
                <th className="py-4 px-4">PROVEEDOR</th>
                <th className="py-4 px-2">FACTURA REF.</th>
                <th className="py-4 px-2 text-right">MONTO</th>
                <th className="py-4 px-2 text-center">VENCIMIENTO</th>
                <th className="py-4 px-2">MÉTODO PAGO</th>
                <th className="py-4 px-2 text-center">PRIORIDAD</th>
                <th className="py-4 px-4 text-right">ACCIÓN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Cargando órdenes...
                  </td>
                </tr>
              ) : displayOrders.length > 0 ? (
                displayOrders.map((order, i) => (
                  <tr key={i} className={`hover:bg-slate-50/50 transition-colors ${(order.status || order.estado) === 'Blocked' ? 'bg-red-50/20' : ''}`}>
                    <td className="py-4 px-4">
                      <button 
                        onClick={() => setSelectedOrder(order)} 
                        className="font-black text-[#0b5156] font-mono text-xs hover:underline hover:text-[#083a3d]"
                      >
                        {order.id || order.orden}
                      </button>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-[#0b5156] uppercase">{order.provider || order.proveedor}</span>
                        {(order.statusMsg || order.mensaje) && (
                          <span className="text-[10px] font-black text-red-600 uppercase mt-1 flex items-center gap-1">
                            <ShieldAlert size={10} /> {order.statusMsg || order.mensaje}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-2 text-xs font-bold text-slate-400 font-mono uppercase">{order.ref || order.referencia}</td>
                    <td className="py-4 px-2 text-right text-xs font-black text-[#0b5156] font-mono">{order.amount || order.monto}</td>
                    <td className={`py-4 px-2 text-center text-xs font-black font-mono ${(order.due || order.vencimiento) === 'Hoy' ? 'text-red-600' : 'text-slate-400'}`}>
                      {order.due || order.vencimiento}
                    </td>
                    <td className="py-4 px-2">
                      <select className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156] uppercase">
                        <option>{order.method || order.metodo}</option>
                        <option>Zelle / Custodia</option>
                        <option>USD Efectivo</option>
                      </select>
                    </td>
                    <td className="py-4 px-2 text-center">
                      <span className={`${order.pColor || 'bg-slate-100 text-slate-600'} px-2 py-0.5 rounded text-xs font-black uppercase tracking-tight`}>
                        {order.priority || order.prioridad}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <button 
                          onClick={() => setPayingOrder(order)}
                          disabled={(order.status || order.estado) === 'Blocked'}
                          className={`text-xs font-black uppercase px-3 py-1.5 rounded-lg transition-all shadow-sm ${(order.status || order.estado) === 'Blocked' ? 'bg-white text-slate-300 cursor-not-allowed' : 'bg-[#0b5156] text-white hover:bg-[#083a3d]'}`}
                        >
                          Aprobar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400 font-bold uppercase text-xs">
                    No hay órdenes de pago pendientes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* History Section */}
      <article className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Últimas Órdenes Ejecutadas</h3>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-4 px-6">N° ORDEN</th>
                <th className="py-4 px-4">PROVEEDOR</th>
                <th className="py-4 px-4 text-right">MONTO PAGADO</th>
                <th className="py-4 px-4 text-center">FECHA PAGO</th>
                <th className="py-4 px-4 text-center">MÉTODO</th>
                <th className="py-4 px-6 text-right">ESTADO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {historyOrders.length > 0 ? (
                historyOrders.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="py-4 px-6">
                      <button 
                        onClick={() => setSelectedOrder(row)} 
                        className="font-mono text-xs font-black text-[#0b5156] hover:underline hover:text-[#083a3d]"
                      >
                        {row.id}
                      </button>
                    </td>
                    <td className="py-4 px-4 text-xs font-black text-slate-500 uppercase">{row.provider}</td>
                    <td className="py-4 px-4 text-right text-xs font-black text-[#0b5156] font-mono">{row.amount}</td>
                    <td className="py-4 px-4 text-center text-xs font-bold text-slate-400 font-mono">{row.date}</td>
                    <td className="py-4 px-4 text-center text-xs font-bold text-slate-500 uppercase">{row.method}</td>
                    <td className="py-4 px-6 text-right">
                      <span className="bg-green-50 text-green-600 px-2 py-0.5 rounded text-[10px] font-black uppercase">
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400 font-bold uppercase text-xs">
                    No hay órdenes de pago ejecutadas recientemente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Premium Toast Notification */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-bounce">
          <div className="bg-[#0b5156] border border-[#083a3d] text-white px-6 py-3 rounded-full text-xs font-black uppercase tracking-wider shadow-2xl flex items-center gap-2">
            🔔 {toast}
          </div>
        </div>
      )}

      {/* Modal Procesar Pago */}
      {payingOrder && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 max-w-md w-full shadow-2xl space-y-6">
            <div>
              <h3 className="text-lg font-black text-[#0b5156] uppercase">Procesar Pago Bancario</h3>
              <p className="text-xs font-bold text-slate-400 uppercase">Seleccione la cuenta bancaria de origen e ingrese la referencia.</p>
            </div>
            <form onSubmit={handleConfirmarPago} className="space-y-4">
              <div className="space-y-1">
                <span className="text-[9px] font-black text-slate-400 uppercase block pl-1">Beneficiario</span>
                <strong className="text-sm font-black text-[#0b5156] uppercase block pl-1">
                  {payingOrder.provider || payingOrder.proveedor}
                </strong>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-0.5">
                  <span className="text-[9px] font-black text-slate-400 uppercase block pl-1">Factura Ref</span>
                  <strong className="text-xs font-bold text-slate-500 font-mono block pl-1">
                    {payingOrder.ref || payingOrder.referencia}
                  </strong>
                </div>
                <div className="space-y-0.5 text-right">
                  <span className="text-[9px] font-black text-slate-400 uppercase block pr-1">Monto a Cancelar</span>
                  <strong className="text-sm font-black text-red-600 font-mono block pr-1">
                    {payingOrder.amount || payingOrder.monto}
                  </strong>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider pl-1">Cuenta Bancaria de Origen</label>
                <select
                  value={bancoId}
                  onChange={(e) => setBancoId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#0b5156] uppercase"
                >
                  {bancos.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.banco} - {b.numero_cuenta} (Sld: ${Number(b.saldo_actual_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider pl-1">Método</label>
                  <select
                    value={metodo}
                    onChange={(e) => setMetodo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#0b5156] uppercase"
                  >
                    <option>Transferencia</option>
                    <option>Zelle</option>
                    <option>Efectivo</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider pl-1">N° de Referencia</label>
                  <input
                    type="text"
                    required
                    placeholder="Ref Bancaria"
                    value={refTrans}
                    onChange={(e) => setRefTrans(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                  />
                </div>
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

      {/* Modal Detalles Documento */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] border border-slate-200 p-8 max-w-xl w-full shadow-2xl space-y-6">
            <div className="flex justify-between items-start border-b border-slate-100 pb-4">
              <div>
                <span className="bg-[#0b5156] text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest block w-fit mb-1">
                  Documento Detallado
                </span>
                <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">
                  Orden {selectedOrder.id || selectedOrder.orden}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedOrder(null)} 
                className="text-slate-400 hover:text-slate-600 font-black text-sm uppercase"
              >
                Cerrar
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-0.5">
                <span className="text-[9px] font-black text-slate-400 uppercase">Proveedor</span>
                <p className="text-sm font-black text-[#0b5156] uppercase">{selectedOrder.provider || selectedOrder.proveedor}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[9px] font-black text-slate-400 uppercase">Factura Ref</span>
                <p className="text-sm font-bold text-slate-600 font-mono uppercase">{selectedOrder.ref || selectedOrder.referencia || 'N/A'}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[9px] font-black text-slate-400 uppercase">Vencimiento</span>
                <p className="text-sm font-black text-[#0b5156] font-mono">{selectedOrder.due || selectedOrder.vencimiento || selectedOrder.date || 'N/A'}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[9px] font-black text-slate-400 uppercase">Monto Neto</span>
                <p className="text-sm font-black text-red-600 font-mono">{selectedOrder.amount || selectedOrder.monto || 'N/A'}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[9px] font-black text-slate-400 uppercase">Método de Pago</span>
                <p className="text-sm font-bold text-slate-500 uppercase">{selectedOrder.method || selectedOrder.metodo || 'Transferencia'}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[9px] font-black text-slate-400 uppercase">Estado</span>
                <span className="inline-block bg-green-50 text-green-600 border border-green-100 px-2.5 py-0.5 rounded text-[10px] font-black uppercase mt-1">
                  {selectedOrder.status || selectedOrder.estado || 'PENDIENTE'}
                </span>
              </div>
            </div>

            {selectedOrder.statusMsg && (
              <div className="bg-red-50 p-4 rounded-2xl border border-red-100 text-red-600 space-y-1">
                <strong className="text-[10px] font-black uppercase block">Alertas de Proveedor</strong>
                <p className="text-xs font-bold uppercase leading-tight">{selectedOrder.statusMsg}</p>
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 flex gap-4">
              <button 
                onClick={() => window.print()}
                className="flex-1 bg-slate-50 border border-slate-200 text-slate-600 py-3 rounded-xl text-xs font-black uppercase hover:bg-slate-100 transition-all"
              >
                Imprimir Documento
              </button>
              <button 
                onClick={() => setSelectedOrder(null)}
                className="flex-1 bg-[#0b5156] text-white py-3 rounded-xl text-xs font-black uppercase hover:bg-[#083a3d] transition-all"
              >
                Entendido
              </button>
            </div>
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
    </div>
  );
};

export default PaymentOrders;
