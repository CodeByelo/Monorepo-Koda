import { 
  Send, 
  FileDown, 
  Search, 
  ShieldAlert, 
  Wallet, 
  Activity,
  CheckCircle2,
  ArrowRight,
  X,
  Mail,
  BookOpen,
  PhoneCall,
  Loader2
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { api } from '@/api/client';

const CustomerStatement = () => {
  const [searchParams] = useSearchParams();
  const queryClienteId = searchParams.get('cliente_id');

  const [kpis, setKpis] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [clientEmail, setClientEmail] = useState<string>('No registrado');
  const [currentRate, setCurrentRate] = useState<number>(38.50);
  
  // Modals state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Invoice Viewer Modal state
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<any[]>('/clientes'),
      api.get<any>('/tasa/actual').catch(() => null),
      api.get<any[]>('/productos').catch(() => [])
    ]).then(([c, rateRes, productsRes]) => {
      setClientes(c || []);
      const defaultId = queryClienteId ? Number(queryClienteId) : (c?.length ? c[0].id : null);
      if (defaultId) setClienteId(defaultId);
      if (rateRes) {
        setCurrentRate(Number(rateRes.valor_ves || rateRes.tasa || 38.50));
      }
      setProducts(productsRes || []);
    }).catch(console.error);
  }, [queryClienteId]);

  useEffect(() => {
    if (!clienteId) return;
    api.get<any>(`/cobranzas/estado-cuenta?cliente_id=${clienteId}`).then((res) => {
      setKpis(res?.kpis || []);
      setMovements(res?.movimientos || []);
      if (res?.cliente) {
        setClientEmail(res.cliente.email || 'No registrado');
        setEmailInput(res.cliente.email || '');
      }
    }).catch(console.error);
  }, [clienteId]);

  const handleShowToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleViewInvoice = async (docNum: string) => {
    setInvoiceLoading(true);
    setSelectedInvoice(null);
    try {
      const data = await api.get<any>(`/ventas/${docNum}`);
      setSelectedInvoice(data);
    } catch (e) {
      console.error(e);
      handleShowToast(`Error al obtener detalles de la factura ${docNum}`);
    } finally {
      setInvoiceLoading(false);
    }
  };

  const safeParse = (val: any) => {
    if (!val || val === '-') return 0;
    const cleanStr = String(val)
      .replace(/Bs\./g, '')
      .replace(/\$/g, '')
      .replace(/,/g, '')
      .trim();
    const parsed = parseFloat(cleanStr);
    return isNaN(parsed) ? 0 : parsed;
  };

  const totalExigibleUsd = movements.reduce((acc, m) => acc + (safeParse(m.debitUsd) - safeParse(m.creditUsd)), 0);
  const totalExigibleBs = movements.reduce((acc, m) => acc + (safeParse(m.debitBs) - safeParse(m.creditBs)), 0);

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-20 print:bg-white print:p-0 print:space-y-4 print:block">
      {/* Header Blanco y Verde */}
      <header className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden print:border-none print:shadow-none print:p-0">
        <div className="flex justify-between items-start">
          <div className="space-y-1 text-slate-800">
            <div className="flex items-center gap-2 mb-2">
               <span className="bg-[#0b5156]/10 text-[#0b5156] text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest border border-[#0b5156]/20">
                 Estados de Cuenta
               </span>
            </div>
            <h1 className="text-4xl font-black tracking-tighter uppercase leading-none">Ficha de Movimientos</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-2">
              Consolidado histórico de facturación, pagos, retenciones y auditoría de saldo deudor.
            </p>
          </div>
          <div className="flex gap-3 print:hidden">
             <button onClick={() => setShowEmailModal(true)} className="bg-slate-50 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-white transition-all flex items-center gap-2">
                <Send size={14} /> Enviar por Email
             </button>
             <button onClick={() => window.print()} className="bg-slate-50 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-white transition-all flex items-center gap-2">
                <FileDown size={14} /> Exportar PDF
             </button>
             <Link to="/cobranzas/aplicar" className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase shadow-lg shadow-green-900/20 flex items-center gap-2 hover:bg-[#083a3d] transition-all">
                <Wallet size={14} /> Registrar Cobro
             </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end pt-6 border-t border-slate-100 print:hidden">
           <div className="md:col-span-2 space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-2">Cliente Seleccionado</label>
              <select
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-xs font-black text-slate-700 outline-none focus:border-[#0b5156] transition-colors"
                value={clienteId ?? ''}
                onChange={(e) => setClienteId(Number(e.target.value))}
              >
                 {clientes.map((c) => (
                   <option key={c.id} value={c.id}>{c.nombre} ({c.rif})</option>
                 ))}
              </select>
           </div>
           <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-2">Rango de Fecha</label>
              <select className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-xs font-black text-slate-700 outline-none focus:border-[#0b5156] transition-colors">
                 <option>Histórico Completo</option>
              </select>
           </div>
           <div>
              <button className="w-full bg-[#0b5156] text-white py-3.5 rounded-2xl text-xs font-black uppercase flex items-center justify-center gap-2 hover:bg-[#083a3d] transition-all shadow-md shadow-green-900/10">
                 <Search size={14} /> Consultar
              </button>
           </div>
        </div>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start print:grid-cols-4 print:gap-4 print:mt-4">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-36 group hover:border-[#0b5156]/30 transition-all">
            <div className="flex justify-between items-start h-8">
               <p className="text-xs font-black text-slate-500 uppercase tracking-widest group-hover:text-[#0b5156] transition-colors flex items-start">{kpi.label}</p>
               {kpi.label === 'ESTATUS DE CRÉDITO' && <ShieldAlert size={14} className="text-red-500" />}
            </div>
            <div className="space-y-1">
              <strong className={`text-3xl font-black ${kpi.color} tracking-tighter font-mono`}>{kpi.value}</strong>
              <p className="text-xs font-bold text-slate-400 uppercase leading-tight h-8 flex items-start">{kpi.desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Alerta de Crédito */}
      {kpis.some(k => k.label === 'ESTATUS DE CRÉDITO' && k.value === 'SUSPENDIDO') && (
        <div className="bg-red-50 border border-red-100 p-6 rounded-3xl flex justify-between items-center">
           <div className="flex items-center gap-4 text-red-600 font-black uppercase text-xs tracking-tight">
              <ShieldAlert size={24} />
              <span>Crédito Suspendido Automáticamente</span>
           </div>
           <button className="bg-red-600 text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-red-900/20 hover:bg-red-700 transition-all">
              Solicitar Liberación <ArrowRight size={14} />
           </button>
        </div>
      )}

      {/* Detalle de Movimientos */}
      <article className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-8 print:border-none print:shadow-none print:p-0 print:mt-8">
         <div className="flex justify-between items-center px-2">
            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Detalle de Movimientos</h3>
            <Activity className="text-[#0b5156]" size={24} />
         </div>

         <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left">
               <thead>
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                     <th className="py-6 px-8">FECHA / TASA</th>
                     <th className="py-6 px-4 text-center">DOCUMENTO</th>
                     <th className="py-6 px-4">CONCEPTO</th>
                     <th className="py-6 px-4 text-right">CARGO (BS)</th>
                     <th className="py-6 px-4 text-right">ABONO (BS)</th>
                     <th className="py-6 px-4 text-right">CARGO (USD)</th>
                     <th className="py-6 px-4 text-right">ABONO (USD)</th>
                     <th className="py-6 px-8 text-right">SALDO USD</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                   {movements.length === 0 ? (
                     <tr>
                        <td colSpan={8} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                           No hay movimientos registrados para este cliente.
                        </td>
                     </tr>
                   ) : movements.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                       <td className="py-6 px-8 font-mono text-xs font-black text-slate-800">
                          {row.date}
                          <span className="block text-[10px] font-bold text-slate-500 italic">Tasa: {row.rate}</span>
                       </td>
                       <td className="py-6 px-4 text-center">
                          <button
                            onClick={() => handleViewInvoice(row.doc)}
                            className="text-xs font-black text-[#0b5156] font-mono hover:underline focus:outline-none bg-transparent border-none p-0 cursor-pointer"
                          >
                            {row.doc}
                          </button>
                       </td>
                       <td className="py-6 px-4 text-xs font-black text-slate-500 uppercase leading-tight">{row.concept}</td>
                       <td className="py-6 px-4 text-right text-xs font-black text-slate-800 font-mono tracking-tighter">{row.debitBs}</td>
                       <td className="py-6 px-4 text-right text-xs font-black text-green-600 font-mono tracking-tighter">{row.creditBs}</td>
                       <td className="py-6 px-4 text-right text-xs font-black text-slate-800 font-mono tracking-tighter">{row.debitUsd}</td>
                       <td className="py-6 px-4 text-right text-xs font-black text-green-600 font-mono tracking-tighter">{row.creditUsd}</td>
                       <td className="py-6 px-8 text-right text-base font-black text-slate-800 font-mono tracking-tighter italic">{row.balanceUsd}</td>
                    </tr>
                  ))}
               </tbody>
                <tfoot>
                   <tr className="bg-[#fcfaf8] text-slate-800 border-t-2 border-[#bdafa1]/30">
                      <td colSpan={3} className="py-6 px-8 text-xs font-black uppercase tracking-[0.2em]">Saldo Histórico USD:</td>
                      <td colSpan={2} className="py-6 px-4 text-right font-mono text-xs font-black text-slate-500">Bs. {totalExigibleBs.toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
                      <td colSpan={2} className="py-6 px-4 text-right font-mono text-xs font-black text-slate-500 uppercase">Acumulado:</td>
                      <td className="py-6 px-8 text-right font-mono text-lg font-black text-red-600 italic">${totalExigibleUsd.toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
                   </tr>
                   <tr className="bg-[#0b5156] text-white">
                      <td colSpan={5} className="py-6 px-8 text-xs font-black uppercase tracking-[0.2em]">
                         <div className="flex items-center gap-2 text-xs font-black text-slate-500 uppercase bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                            <CheckCircle2 size={18} className="opacity-50" /> Total Exigible al Cierre (Tasa BCV {currentRate.toFixed(4)}):
                         </div>
                      </td>
                      <td colSpan={2} className="py-6 px-4 text-right font-mono text-xs font-black opacity-80 italic">Bs. {(totalExigibleUsd * currentRate).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
                      <td className="py-6 px-8 text-right font-mono text-3xl font-black text-white tracking-tighter italic">${totalExigibleUsd.toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
                   </tr>
                </tfoot>
            </table>
         </div>
      </article>

      {/* Modal de Enviar por Correo */}
      {showEmailModal && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="bg-[#0b5156] p-6 text-white relative">
              <button 
                onClick={() => setShowEmailModal(false)}
                className="absolute top-4 right-4 text-white/70 hover:text-white"
              >
                <X size={20} />
              </button>
              <h3 className="text-xl font-black uppercase tracking-tighter">Enviar Estado de Cuenta</h3>
              <p className="text-white/80 text-xs font-bold uppercase tracking-widest mt-1">
                Despacho electrónico a la bandeja del cliente
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Correo del Destinatario</label>
                <input 
                  type="email" 
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-black text-slate-700 outline-none focus:border-[#0b5156] transition-colors"
                  placeholder="cliente@email.com"
                />
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowEmailModal(false)}
                  className="w-full py-3 border border-slate-200 rounded-xl text-xs font-black uppercase text-slate-500 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button 
                  onClick={async () => {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailInput || !emailRegex.test(emailInput)) {
                      handleShowToast("Por favor, ingrese un correo electrónico válido.");
                      return;
                    }
                    try {
                      await api.post('/cobranzas/estado-cuenta/enviar', {
                        cliente_id: clienteId,
                        email: emailInput
                      });
                      setShowEmailModal(false);
                      handleShowToast(`Estado de cuenta enviado exitosamente a: ${emailInput}`);
                    } catch (e: any) {
                      handleShowToast(e.response?.data?.detail || "Error al enviar el correo");
                    }
                  }}
                  className="w-full py-3 bg-[#0b5156] text-white rounded-xl text-xs font-black uppercase shadow-lg shadow-green-900/20 hover:bg-[#083a3d]"
                >
                  Enviar
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de Detalle de Factura */}
      {selectedInvoice && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200 my-8">
            <div className="bg-[#0b5156] p-6 text-white relative flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter">Factura {selectedInvoice.numero_factura}</h3>
                <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest mt-1">
                  Documento comercial homologado Koda ERP
                </p>
              </div>
              <button 
                onClick={() => setSelectedInvoice(null)}
                className="text-white/70 hover:text-white bg-white/10 p-2 rounded-xl"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-4 text-xs font-bold uppercase leading-relaxed text-slate-600">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Cliente</span>
                  <strong className="text-slate-700 uppercase font-black">{selectedInvoice.cliente?.nombre || 'Consumidor Final'}</strong>
                  <span className="block text-slate-400 font-mono font-bold">{selectedInvoice.cliente?.rif || 'V-000000000'}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Fecha de Emisión</span>
                  <strong className="text-slate-700 font-black">{new Date(selectedInvoice.fecha).toLocaleDateString('es-VE')}</strong>
                  <span className="block text-slate-500 font-bold uppercase">Pago: {selectedInvoice.metodo_pago}</span>
                </div>
              </div>

              <div className="space-y-3">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block pl-2">Detalle de Productos</span>
                <div className="border border-slate-100 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <th className="py-3 px-4">SKU / Producto</th>
                        <th className="py-3 px-4 text-center">Cant.</th>
                        <th className="py-3 px-4 text-right">Precio USD</th>
                        <th className="py-3 px-4 text-right">Total USD</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-slate-600 font-bold uppercase">
                      {selectedInvoice.detalles?.map((det: any, idx: number) => {
                        const pObj = products.find(p => p.id === det.producto_id);
                        return (
                          <tr key={idx}>
                            <td className="py-3 px-4">
                              <span className="block text-xs font-black text-slate-700">{pObj?.nombre || 'Producto'}</span>
                              <span className="block text-[9px] text-slate-400 font-mono">{pObj?.sku || `ID: ${det.producto_id}`}</span>
                            </td>
                            <td className="py-3 px-4 text-center font-mono">{Number(det.cantidad).toFixed(0)}</td>
                            <td className="py-3 px-4 text-right font-mono">${Number(det.precio_usd_capturado).toFixed(2)}</td>
                            <td className="py-3 px-4 text-right font-mono">${(Number(det.cantidad) * Number(det.precio_usd_capturado)).toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                <div className="space-y-1 font-bold text-xs uppercase text-slate-500 leading-relaxed">
                  <p>Tasa de cambio:</p>
                  <p>Subtotal:</p>
                  <p>IVA (16%):</p>
                  {Number(selectedInvoice.igtf_usd) > 0 && <p>IGTF (3%):</p>}
                  <p className="text-slate-800 font-black">Total Facturado:</p>
                </div>
                <div className="space-y-1 font-mono text-xs text-right text-slate-700 font-black leading-relaxed">
                  <p>Bs. {Number(selectedInvoice.tasa_cambio_bs).toFixed(4)}</p>
                  <p>${Number(selectedInvoice.subtotal_usd).toFixed(2)}</p>
                  <p>${Number(selectedInvoice.iva_usd).toFixed(2)}</p>
                  {Number(selectedInvoice.igtf_usd) > 0 && <p>${Number(selectedInvoice.igtf_usd).toFixed(2)}</p>}
                  <p className="text-[#0b5156] font-black text-lg">${Number(selectedInvoice.total_usd).toFixed(2)} / Bs. {(Number(selectedInvoice.total_usd) * Number(selectedInvoice.tasa_cambio_bs)).toLocaleString('es-VE', {minimumFractionDigits: 2})}</p>
                </div>
              </div>

              <button 
                onClick={() => setSelectedInvoice(null)}
                className="w-full py-3 bg-[#0b5156] text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-green-900/20 hover:bg-[#083a3d]"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Loader de Detalle de Factura */}
      {invoiceLoading && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl shadow-xl flex items-center gap-3 border border-slate-100">
            <Loader2 className="animate-spin text-[#0b5156]" size={20} />
            <span className="text-xs font-black uppercase tracking-widest text-slate-700">Cargando Factura...</span>
          </div>
        </div>,
        document.body
      )}

      {/* Toast Notificación */}
      {toastMessage && createPortal(
        <div className="fixed bottom-6 right-6 z-[130] bg-[#0b5156] text-white py-4 px-6 rounded-2xl shadow-2xl border border-green-700 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <CheckCircle2 size={18} className="text-white/80" />
          <span className="text-xs font-black uppercase tracking-widest">{toastMessage}</span>
        </div>,
        document.body
      )}
    </div>
  );
};

export default CustomerStatement;
