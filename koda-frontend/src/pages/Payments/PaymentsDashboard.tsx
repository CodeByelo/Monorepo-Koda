import { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  CheckCircle2,
  Package,
  Wallet
} from 'lucide-react';
import { api } from '@/api/client';

const PaymentsDashboard = () => {
  const [metrics, setMetrics] = useState<any[]>([]);
  const [priorities, setPriorities] = useState<any[]>([]);
  const [priorityPayments, setPriorityPayments] = useState<any[]>([]);
  const [liquidity, setLiquidity] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Manual payment modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [formProveedorId, setFormProveedorId] = useState('');
  const [formRef, setFormRef] = useState('');
  const [formMonto, setFormMonto] = useState('');
  const [formTasa, setFormTasa] = useState('36.52');
  const [formCredito, setFormCredito] = useState('15');

  // Advanced flow states
  const [payingOrder, setPayingOrder] = useState<any>(null);
  const [bancos, setBancos] = useState<any[]>([]);
  const [bancoId, setBancoId] = useState('');
  const [refTrans, setRefTrans] = useState('');
  const [metodo, setMetodo] = useState('Transferencia');

  // custom alert toast
  const [toast, setToast] = useState<string | null>(null);
  // details modal
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [dashboardData, provData, bancosRes] = await Promise.all([
        api.get<any>('/pagos/dashboard'),
        api.get<any[]>('/proveedores'),
        api.get<any[]>('/tesoreria/bancos')
      ]);
      setMetrics(dashboardData?.metricas || []);
      setPriorities(dashboardData?.prioridades || []);
      setPriorityPayments(dashboardData?.pagos_prioritarios || dashboardData?.prioritarios || []);
      setLiquidity(dashboardData?.liquidez || null);
      setProveedores(provData || []);
      setBancos(bancosRes || []);
      if (provData && provData.length > 0) {
        setFormProveedorId(String(provData[0].id));
      }
      if (bancosRes && bancosRes.length > 0) {
        setBancoId(String(bancosRes[0].id));
      }
    } catch (error) {
      console.error("Error fetching payments dashboard data:", error);
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
        orden_id: `OP-${String(payingOrder.id).padStart(6, '0')}`,
        banco_id: parseInt(bancoId),
        referencia: refTrans,
        metodo: metodo
      });
      showToast(`Pago procesado y registrado exitosamente.`);
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
      showToast("Factura de proveedor registrada exitosamente.");
      setIsModalOpen(false);
      setFormRef('');
      setFormMonto('');
      fetchData();
    } catch (err: any) {
      console.error(err);
      showToast("Error al registrar factura.");
    }
  };

  const displayMetrics = metrics.length > 0 ? metrics : [
    { label: 'Deuda Indexada (USD)', value: '$0.00', desc: 'Prioridad Máxima: Sube con el dólar', color: 'text-red-600', border: 'border-b-4 border-red-500' },
    { label: 'Deuda Fija (Bs.)', value: 'Bs. 0.00', desc: 'Prioridad Baja: Se licúa con el tiempo', color: 'text-green-600', border: 'border-b-4 border-green-500' },
    { label: 'Gasto por Devaluación (24h)', value: 'Bs. 0.00', desc: 'Costo extra por no pagar ayer', color: 'text-red-600', border: 'border-b-4 border-red-400' },
    { label: 'Caja Comprometida', value: '0%', desc: 'Riesgo de liquidez ante salto BCV', color: 'text-amber-600', border: 'border-b-4 border-amber-500' },
  ];

  const defaultPriorities = [
    { label: 'Crítico', value: '0 proveedores con pagos vencidos', desc: 'Prioriza los que sostienen operación.', icon: <ShieldAlert size={18} />, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Caja', value: '0 salidas pueden presionar liquidez', desc: 'Revisar caja antes de ejecutar pagos.', icon: <Wallet size={18} />, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Compras', value: '0 facturas requieren validación', desc: 'No pagar sin recepción confirmada.', icon: <CheckCircle2 size={18} />, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Inventario', value: '0 proveedores afectan stock crítico', desc: 'Retrasos pueden afectar ventas.', icon: <Package size={18} />, color: 'text-orange-600', bg: 'bg-orange-50' },
  ];

  const displayPriorities = priorities.length > 0 ? priorities.map((p, i) => ({
    ...p,
    icon: defaultPriorities[i % defaultPriorities.length].icon,
    color: defaultPriorities[i % defaultPriorities.length].color,
    bg: defaultPriorities[i % defaultPriorities.length].bg
  })) : defaultPriorities;

  const displayPayments = priorityPayments.length > 0 ? priorityPayments : [];

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
            <h1 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase">Dashboard de Pagos</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Proveedores, cuentas por pagar, vencimientos y control de salidas.</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setIsModalOpen(true)} 
              className="bg-white text-slate-600 px-6 py-2 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-slate-200 transition-all"
            >
              Manual
            </button>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {displayMetrics.map((m, i) => (
          <div key={i} className={`bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between min-h-[128px] ${m.border || 'border-b-4 border-[#0b5156]'} group hover:border-[#0b5156]/30 transition-all`}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight h-6 flex items-start">{m.label || m.etiqueta}</p>
            <strong className={`text-2xl font-black ${m.color || 'text-slate-800'} tracking-tighter font-mono whitespace-nowrap block my-2`}>{m.value || m.valor}</strong>
            <p className="text-[10px] font-bold text-slate-500 uppercase leading-tight h-6 flex items-start">{m.desc || m.descripcion}</p>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        {/* Priorities Section */}
        <article className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6 flex flex-col justify-between">
          <div className="space-y-1">
            <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Prioridades de pago</h3>
            <p className="text-xs font-bold text-slate-500 uppercase">Obligaciones que deben decidirse según caja e impacto operativo.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch mt-4">
            {displayPriorities.map((p, i) => (
              <div key={i} className={`${p.bg} p-5 rounded-2xl border border-slate-100/50 flex gap-4 items-center`}>
                <div className={`${p.color} p-3 bg-white rounded-xl shadow-sm flex items-center justify-center`}>{p.icon}</div>
                <div className="space-y-1">
                  <strong className={`text-sm font-black ${p.color} uppercase tracking-tight`}>{p.value || p.valor}</strong>
                  <p className="text-xs font-bold text-slate-500 uppercase leading-tight">{p.desc || p.descripcion}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        {/* Reserva de Liquidez */}
        <article className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6 flex flex-col justify-between">
          <div className="space-y-1">
            <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Reserva de Liquidez</h3>
            <p className="text-xs font-bold text-slate-500 uppercase">Fondos disponibles para la operación diaria.</p>
          </div>
          <div className="space-y-4 my-auto">
            <div className="flex justify-between items-end border-b border-slate-100 pb-2">
              <span className="text-xs font-black text-slate-400 uppercase">Saldo Bruto</span>
              <span className="text-lg font-black text-[#0b5156] font-mono">{liquidity?.saldo_bruto || '$0.00'}</span>
            </div>
            <div className="flex justify-between items-end border-b border-slate-100 pb-2">
              <span className="text-xs font-black text-amber-600 uppercase">Reserva Fiscal</span>
              <span className="text-lg font-black text-amber-600 font-mono">{liquidity?.reserva_fiscal || '-$0.00'}</span>
            </div>
            <div className="flex justify-between items-end border-b-2 border-[#0b5156] pb-2">
              <span className="text-xs font-black text-[#0b5156] uppercase">Operativo Real</span>
              <span className="text-xl font-black text-[#0b5156] font-mono">{liquidity?.operativo_real || '$0.00'}</span>
            </div>
          </div>
          <p className="text-[9px] font-bold text-amber-600 uppercase leading-tight bg-amber-50 p-2.5 rounded-xl border border-amber-100/50 flex items-center gap-1.5">
            🛡️ El sistema protege automáticamente los fondos tributarios para evitar ilícitos.
          </p>
        </article>
      </div>

      {/* Priority Payments Table */}
      <article className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Pagos prioritarios</h3>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-4 px-4">PROVEEDOR / TIPO</th>
                <th className="py-4 px-2 text-center">VENCIMIENTO</th>
                <th className="py-4 px-2 text-right">MONTO BASE</th>
                <th className="py-4 px-2 text-center">TASA</th>
                <th className="py-4 px-2 text-right text-red-600">COSTO RETRASO</th>
                <th className="py-4 px-4 text-right">EQUIV. HOY</th>
                <th className="py-4 px-4 text-right">ACCIÓN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cargando pagos...</td>
                </tr>
              ) : displayPayments.map((p, i) => {
                const isCritical = p.critical || p.critico;
                const isFixed = p.fixed || p.fijo;

                return (
                  <tr key={i} className={`group transition-colors ${isCritical ? 'bg-red-50/30' : isFixed ? 'bg-green-50/30' : 'hover:bg-slate-50'}`}>
                    <td className="py-4 px-4">
                      <div className="flex flex-col">
                        <button 
                          onClick={() => setSelectedOrder(p)} 
                          className="text-sm font-black text-[#0b5156] uppercase hover:underline text-left block"
                        >
                          {p.provider || p.proveedor}
                        </button>
                        <span className={`text-xs font-black px-2 py-0.5 rounded w-fit uppercase mt-1 ${isFixed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {p.type || p.tipo}
                        </span>
                      </div>
                    </td>
                    <td className={`py-4 px-2 text-center text-xs font-black font-mono ${isCritical ? 'text-red-600' : 'text-slate-400'}`}>
                      {p.due || p.vencimiento}
                    </td>
                    <td className="py-4 px-2 text-right text-xs font-black text-[#0b5156] font-mono">{p.amount || p.monto}</td>
                    <td className="py-4 px-2 text-center text-xs font-black text-slate-400 font-mono">{p.rate || p.tasa}</td>
                    <td className={`py-4 px-2 text-right text-xs font-black font-mono ${isFixed ? 'text-green-600' : 'text-red-600'}`}>
                      {p.cost || p.costo}
                    </td>
                    <td className="py-4 px-4 text-right text-xs font-black text-[#0b5156] font-mono">{p.today || p.hoy}</td>
                    <td className="py-4 px-4 text-right">
                      <button 
                        onClick={() => {
                          if (isFixed) {
                            showToast("Acción Diferir no implementada, se procederá al pago.");
                          }
                          setPayingOrder(p);
                        }} 
                        className={`text-xs font-black uppercase px-4 py-2 rounded-xl transition-all ${isFixed ? 'bg-white text-slate-500 hover:bg-slate-200 border border-slate-200' : 'bg-[#0b5156] text-white hover:bg-[#083a3d]'}`}
                      >
                        {isFixed ? 'Diferir' : 'Pagar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>

      {/* Modal Manual */}
      {isModalOpen && (
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
                  onClick={() => setIsModalOpen(false)}
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
                  <span className="text-[9px] font-black text-slate-400 uppercase block pl-1">Documento Ref</span>
                  <strong className="text-xs font-bold text-slate-500 font-mono block pl-1">
                    {payingOrder.ref || payingOrder.referencia || 'CxP'}
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
                  Orden Detalle
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
    </div>
  );
};

export default PaymentsDashboard;
