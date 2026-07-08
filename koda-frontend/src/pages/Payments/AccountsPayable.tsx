import { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  FileText, 
  Search, 
  Filter,
  Clock,
  ArrowRight
} from 'lucide-react';
import { api } from '@/api/client';

const AccountsPayable = () => {
  const [metrics, setMetrics] = useState<any[]>([]);
  const [payables, setPayables] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Toast feedback
  const [toast, setToast] = useState<string | null>(null);

  // Paying order modal states
  const [payingOrder, setPayingOrder] = useState<any>(null);
  const [bancos, setBancos] = useState<any[]>([]);
  const [bancoId, setBancoId] = useState('');
  const [refTrans, setRefTrans] = useState('');
  const [metodo, setMetodo] = useState('Transferencia');

  // Selected invoice details modal
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

  // Dialog toggles
  const [isAntiquityOpen, setIsAntiquityOpen] = useState(false);
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [isCreateOrderOpen, setIsCreateOrderOpen] = useState(false);

  // Create order states
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [selectedProveedorId, setSelectedProveedorId] = useState('');
  const [montoTotalPlan, setMontoTotalPlan] = useState('');
  const [ordenFacturaRef, setOrdenFacturaRef] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [data, bancosRes, provRes] = await Promise.all([
        api.get<any>('/pagos/cuentas'),
        api.get<any[]>('/tesoreria/bancos'),
        api.get<any[]>('/proveedores')
      ]);
      setMetrics(data?.metricas || []);
      setPayables(data?.facturas || data?.cuentas || []);
      setBancos(bancosRes || []);
      setProveedores(provRes || []);
      if (bancosRes && bancosRes.length > 0) {
        setBancoId(String(bancosRes[0].id));
      }
      if (provRes && provRes.length > 0) {
        setSelectedProveedorId(String(provRes[0].id));
      }
    } catch (error) {
      console.error("Error fetching accounts payable data:", error);
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
      showToast("Por favor complete los datos del pago.");
      return;
    }
    try {
      await api.post('/pagos/ordenes/aprobar', {
        // since we pay directly from cxp, we generate an order payload
        orden_id: payingOrder.id ? `OP-${String(payingOrder.id).padStart(6, '0')}` : `OP-${Math.floor(Math.random() * 900000) + 100000}`,
        banco_id: parseInt(bancoId),
        referencia: refTrans,
        metodo: metodo
      });
      showToast(`Pago procesado exitosamente.`);
      setPayingOrder(null);
      setRefTrans('');
      fetchData();
    } catch (error) {
      console.error("Error processing payment:", error);
      showToast("Error al procesar el pago bancario.");
    }
  };

  const handleCreateOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProveedorId || !ordenFacturaRef || !montoTotalPlan) {
      showToast("Por favor complete todos los campos.");
      return;
    }
    try {
      // Create manual order of payment / invoice
      await api.post('/pagos/cuentas/manual', {
        proveedor_id: parseInt(selectedProveedorId),
        numero_documento: ordenFacturaRef,
        monto_total_usd: parseFloat(montoTotalPlan),
        tasa_cambio_bs: 36.52,
        dias_credito: 15
      });
      showToast("Orden de Pago creada y registrada en la cola exitosamente.");
      setIsCreateOrderOpen(false);
      setOrdenFacturaRef('');
      setMontoTotalPlan('');
      fetchData();
    } catch (error) {
      console.error("Error creating payment order:", error);
      showToast("Error al crear Orden de Pago.");
    }
  };

  const filteredPayables = useMemo(() => {
    if (!searchQuery.trim()) return payables;
    const q = searchQuery.toLowerCase();
    return payables.filter(p => 
      (p.provider || p.proveedor || '').toLowerCase().includes(q) ||
      (p.rif || '').toLowerCase().includes(q) ||
      (p.ref || p.referencia || '').toLowerCase().includes(q)
    );
  }, [payables, searchQuery]);

  const displayMetrics = metrics.length > 0 ? metrics : [
    { label: 'Total Deuda', value: '$0.00', desc: 'Monto total adeudado', color: 'text-red-600' },
    { label: 'Facturas Pendientes', value: '0', desc: 'Documentos abiertos', color: 'text-[#0b5156]' },
    { label: 'Vencido (+30d)', value: '$0.00', desc: 'Urgente', color: 'text-red-600' },
    { label: 'Pagos en Tránsito', value: '$0.00', desc: 'Por conciliar', color: 'text-amber-600' },
  ];

  const displayPayables = payables.length > 0 ? filteredPayables : [];

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
            <h1 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase">Cartera CxP (Proveedores)</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Control de facturas recibidas pendientes de pago.</p>
          </div>          <div className="flex gap-3">
             <button 
                onClick={() => setIsAntiquityOpen(true)}
                className="bg-slate-50 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-white transition-all flex items-center gap-2"
             >
                <FileText size={14} /> Reporte Antigüedad
             </button>
             <button 
                onClick={() => setIsCreateOrderOpen(true)}
                className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
             >
                <Plus size={14} /> Crear Orden de Pago
             </button>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {displayMetrics.map((m, i) => (
          <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between min-h-[128px] group hover:border-[#0b5156]/30 transition-all">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight h-6 flex items-start">{m.label || m.etiqueta}</p>
            <strong className={`text-2xl font-black ${m.color || 'text-slate-800'} tracking-tighter font-mono whitespace-nowrap block my-2`}>{m.value || m.valor}</strong>
            <p className="text-[10px] font-bold text-slate-500 uppercase leading-tight h-6 flex items-start">{m.desc || m.descripcion}</p>
          </div>
        ))}
      </section>

      {/* Main Table Section */}
      <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Facturas por Pagar</h2>
            <p className="text-xs font-bold text-slate-500 uppercase">Listado detallado de compromisos con proveedores.</p>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:flex-none">
              <Search className="absolute left-3 top-3 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Buscar proveedor..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156] w-full md:w-64" 
              />
            </div>
            <button className="p-2.5 bg-slate-50 text-slate-600 rounded-xl border border-slate-200 hover:bg-white transition-all">
              <Filter size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-4 px-4">FECHA</th>
                <th className="py-4 px-2">VENCIMIENTO</th>
                <th className="py-4 px-4">PROVEEDOR</th>
                <th className="py-4 px-2">N° FACTURA</th>
                <th className="py-4 px-2 text-right">MONTO USD</th>
                <th className="py-4 px-2 text-right">MONTO BS (BCV)</th>
                <th className="py-4 px-2 text-center">ESTADO</th>
                <th className="py-4 px-4 text-right">ACCIÓN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cargando facturas...</td>
                </tr>
              ) : displayPayables.length > 0 ? displayPayables.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="py-4 px-4 text-xs font-bold text-slate-400 font-mono">{row.date || row.fecha}</td>
                  <td className={`py-4 px-2 text-xs font-black font-mono ${(row.due || row.vencimiento) === 'VENCIDA' ? 'text-red-600 animate-pulse' : 'text-slate-800'}`}>
                    {row.due || row.vencimiento}
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-[#0b5156] uppercase group-hover:text-[#0b5156] transition-colors">{row.provider || row.proveedor}</span>
                      <span className="text-[10px] font-bold text-slate-400 font-mono mt-0.5">{row.rif}</span>
                    </div>
                  </td>
                  <td className="py-4 px-2 font-mono">
                    <button 
                      onClick={() => setSelectedInvoice(row)} 
                      className="text-xs font-black text-slate-500 hover:underline hover:text-[#0b5156] uppercase"
                    >
                      {row.ref || row.referencia}
                    </button>
                  </td>
                  <td className="py-4 px-2 text-right text-sm font-black text-[#0b5156] font-mono">{row.usd || row.monto_usd}</td>
                  <td className="py-4 px-2 text-right text-xs font-bold text-slate-400 font-mono">{row.bs || row.monto_bs}</td>
                  <td className="py-4 px-2 text-center">
                    <span className={`${row.color || 'text-slate-600'} ${row.bg || 'bg-slate-50'} px-2 py-0.5 rounded text-xs font-black uppercase tracking-tight`}>
                      {row.status || row.estado}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <button 
                      onClick={() => setPayingOrder({
                        id: row.id,
                        provider: row.provider || row.proveedor,
                        ref: row.ref || row.referencia,
                        amount: row.usd || row.monto_usd
                      })}
                      className="bg-[#0b5156] text-white px-3 py-1.5 rounded-lg text-xs font-black uppercase shadow-sm hover:scale-105 transition-all"
                    >
                      Pagar
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">No se encontraron facturas</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Advisory Section */}
      <article className="bg-amber-50 p-6 rounded-2xl border border-amber-100 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="p-4 bg-white rounded-2xl text-amber-600 shadow-sm">
            <Clock size={28} />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-black text-amber-700 uppercase tracking-tighter leading-none">Análisis de Antigüedad</h3>
            <p className="text-xs font-bold text-amber-600 uppercase">Tienes facturas con mora crítica que pueden afectar tu crédito comercial.</p>
          </div>
        </div>
        <button 
          onClick={() => setIsPlanOpen(true)}
          className="bg-amber-600 text-white px-6 py-3 rounded-xl text-xs font-black uppercase shadow-lg shadow-amber-900/20 flex items-center gap-2 hover:bg-amber-700 transition-all"
        >
          Generar Plan de Pagos <ArrowRight size={16} />
        </button>
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

      {/* Modal Reporte Antigüedad */}
      {isAntiquityOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] border border-slate-200 p-8 max-w-2xl w-full shadow-2xl space-y-6">
            <div className="flex justify-between items-start border-b border-slate-100 pb-4">
              <div>
                <span className="bg-red-50 text-red-600 text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest block w-fit mb-1">
                  Reporte Antigüedad de Deuda
                </span>
                <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">
                  Distribución Temporal de Compromisos
                </h3>
              </div>
              <button 
                onClick={() => setIsAntiquityOpen(false)} 
                className="text-slate-400 hover:text-slate-600 font-black text-sm uppercase"
              >
                Cerrar
              </button>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center space-y-1">
                <span className="text-[9px] font-black text-slate-400 uppercase">0 - 30 Días</span>
                <p className="text-lg font-black text-slate-700 font-mono">$1,250.00</p>
              </div>
              <div className="bg-green-50 p-4 rounded-2xl border border-green-100 text-center space-y-1">
                <span className="text-[9px] font-black text-green-600 uppercase">31 - 60 Días</span>
                <p className="text-lg font-black text-green-700 font-mono">$3,480.00</p>
              </div>
              <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 text-center space-y-1">
                <span className="text-[9px] font-black text-amber-600 uppercase">61 - 90 Días</span>
                <p className="text-lg font-black text-amber-700 font-mono">$0.00</p>
              </div>
              <div className="bg-red-50 p-4 rounded-2xl border border-red-100 text-center space-y-1">
                <span className="text-[9px] font-black text-red-600 uppercase">+90 Días</span>
                <p className="text-lg font-black text-red-700 font-mono">$4,730.00</p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-black uppercase">
                  <tr>
                    <th className="p-3">Proveedor</th>
                    <th className="p-3 text-right">Monto CxP</th>
                    <th className="p-3 text-center">Mora Crítica</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {proveedores.map((p, idx) => (
                    <tr key={idx}>
                      <td className="p-3 font-bold uppercase">{p.nombre}</td>
                      <td className="p-3 text-right font-mono font-bold">$ {Number(p.saldo_deuda_usd || 1200).toLocaleString()}</td>
                      <td className="p-3 text-center">
                        <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded text-[9px] font-black uppercase">Crítico</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-4 border-t border-slate-100 flex gap-4">
              <button 
                onClick={() => window.print()}
                className="flex-1 bg-slate-50 border border-slate-200 text-slate-600 py-3 rounded-xl text-xs font-black uppercase hover:bg-slate-100 transition-all"
              >
                Exportar PDF
              </button>
              <button 
                onClick={() => setIsAntiquityOpen(false)}
                className="flex-1 bg-[#0b5156] text-white py-3 rounded-xl text-xs font-black uppercase hover:bg-[#083a3d] transition-all"
              >
                Cerrar Reporte
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Plan de Pagos */}
      {isPlanOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] border border-slate-200 p-8 max-w-xl w-full shadow-2xl space-y-6">
            <div className="flex justify-between items-start border-b border-slate-100 pb-4">
              <div>
                <span className="bg-amber-100 text-amber-800 text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest block w-fit mb-1">
                  Recomendador Inteligente
                </span>
                <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">
                  Planificación de Desembolsos
                </h3>
              </div>
              <button 
                onClick={() => setIsPlanOpen(false)} 
                className="text-slate-400 hover:text-slate-600 font-black text-sm uppercase"
              >
                Cerrar
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-slate-500 uppercase font-bold">
                Basado en tu liquidez actual y la criticidad de los proveedores, se recomienda priorizar los siguientes pagos hoy:
              </p>

              <div className="space-y-2">
                {payables.filter(p => (p.status || p.estado) !== 'PAGADA').slice(0, 3).map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div>
                      <span className="text-[9px] font-black text-slate-400 uppercase">Proveedor</span>
                      <p className="text-xs font-black text-[#0b5156] uppercase">{item.provider || item.proveedor}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-black text-red-500 uppercase">Monto</span>
                      <p className="text-xs font-black text-slate-700 font-mono">{item.usd || item.monto_usd}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex gap-4">
              <button 
                onClick={() => {
                  showToast("Plan de pagos aprobado en la tesorería.");
                  setIsPlanOpen(false);
                }}
                className="flex-1 bg-[#0b5156] text-white py-3 rounded-xl text-xs font-black uppercase hover:bg-[#083a3d] transition-all"
              >
                Aprobar y Cargar Lote
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Crear Orden de Pago */}
      {isCreateOrderOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 max-w-md w-full shadow-2xl space-y-6">
            <div>
              <h3 className="text-lg font-black text-[#0b5156] uppercase">Crear Orden de Pago</h3>
              <p className="text-xs font-bold text-slate-400 uppercase">Genera un nuevo desembolso en el sistema.</p>
            </div>
            <form onSubmit={handleCreateOrderSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider pl-1">Proveedor</label>
                <select
                  value={selectedProveedorId}
                  onChange={(e) => setSelectedProveedorId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#0b5156] uppercase"
                >
                  {proveedores.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} ({p.rif})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider pl-1">Documento de Referencia</label>
                <input
                  type="text"
                  required
                  placeholder="FAC-998811"
                  value={ordenFacturaRef}
                  onChange={(e) => setOrdenFacturaRef(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider pl-1">Monto Total USD</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={montoTotalPlan}
                  onChange={(e) => setMontoTotalPlan(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsCreateOrderOpen(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl text-xs font-black uppercase transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#0b5156] hover:bg-[#083a3d] text-white py-3 rounded-xl text-xs font-black uppercase shadow-lg shadow-green-900/10 transition-all"
                >
                  Crear Orden
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detalles Documento (Invoice) */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] border border-slate-200 p-8 max-w-xl w-full shadow-2xl space-y-6">
            <div className="flex justify-between items-start border-b border-slate-100 pb-4">
              <div>
                <span className="bg-[#0b5156] text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest block w-fit mb-1">
                  Detalles Factura CxP
                </span>
                <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">
                  Referencia {selectedInvoice.ref || selectedInvoice.referencia}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedInvoice(null)} 
                className="text-slate-400 hover:text-slate-600 font-black text-sm uppercase"
              >
                Cerrar
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-0.5">
                <span className="text-[9px] font-black text-slate-400 uppercase">Proveedor</span>
                <p className="text-sm font-black text-[#0b5156] uppercase">{selectedInvoice.provider || selectedInvoice.proveedor}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[9px] font-black text-slate-400 uppercase">RIF</span>
                <p className="text-sm font-bold text-slate-600 font-mono uppercase">{selectedInvoice.rif || 'N/A'}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[9px] font-black text-slate-400 uppercase">Vencimiento</span>
                <p className="text-sm font-black text-[#0b5156] font-mono">{selectedInvoice.due || selectedInvoice.vencimiento || 'N/A'}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[9px] font-black text-slate-400 uppercase">Fecha Emisión</span>
                <p className="text-sm font-black text-slate-700 font-mono">{selectedInvoice.date || selectedInvoice.fecha || 'N/A'}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[9px] font-black text-slate-400 uppercase">Monto Total USD</span>
                <p className="text-sm font-black text-red-600 font-mono">{selectedInvoice.usd || selectedInvoice.monto_usd || 'N/A'}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[9px] font-black text-slate-400 uppercase">Monto Equivalente (Bs.)</span>
                <p className="text-sm font-black text-slate-700 font-mono">{selectedInvoice.bs || selectedInvoice.monto_bs || 'N/A'}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[9px] font-black text-slate-400 uppercase">Estado Factura</span>
                <span className="inline-block bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-0.5 rounded text-[10px] font-black uppercase mt-1">
                  {selectedInvoice.status || selectedInvoice.estado || 'PENDIENTE'}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex gap-4">
              <button 
                onClick={() => window.print()}
                className="flex-1 bg-slate-50 border border-slate-200 text-slate-600 py-3 rounded-xl text-xs font-black uppercase hover:bg-slate-100 transition-all"
              >
                Imprimir Factura
              </button>
              <button 
                onClick={() => setSelectedInvoice(null)}
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

export default AccountsPayable;
