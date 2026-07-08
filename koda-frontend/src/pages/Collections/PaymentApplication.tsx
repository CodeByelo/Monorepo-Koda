import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { 
  ArrowRight, 
  AlertCircle, 
  Activity, 
  Plus, 
  Trash2, 
  TrendingDown, 
  CheckCircle2, 
  ShieldAlert, 
  ArrowUpRight 
} from 'lucide-react';
import { api } from '@/api/client';

const parseAmount = (value: unknown) => parseFloat(String(value || '0').replace(/[^0-9.-]/g, '')) || 0;

const PaymentApplication = () => {
  const [searchParams] = useSearchParams();
  const facturaId = searchParams.get('factura_id') || '';

  const [methods, setMethods] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [bcvRate, setBcvRate] = useState(0);
  const [invoiceBalance, setInvoiceBalance] = useState(0);
  const [clientName, setClientName] = useState('Consumidor Final');

  const [kpis, setKpis] = useState<any[]>([]);
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  const handleShowToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({msg, type});
    setTimeout(() => setToastMessage(null), 4000);
  };

  useEffect(() => {
    if (facturaId) {
      api.get<any>(`/ventas/${facturaId}`).then((res) => {
        setInvoiceBalance(Number(res.total || 0));
        // Look up customer
        api.get<any[]>('/cobranzas/cuentas').then((cxcList) => {
          const match = cxcList.find(c => c.documento === res.numero_factura);
          if (match) {
            setClientName(match.cliente);
          } else {
            setClientName('Consumidor Final');
          }
        }).catch(() => {
          setClientName('Consumidor Final');
        });
      }).catch(() => {
        setInvoiceBalance(0);
        setClientName('Consumidor Final');
      });
    } else {
      setInvoiceBalance(0);
      setClientName('Consumidor Final');
    }
  }, [facturaId]);

  useEffect(() => {
    Promise.all([
      api.get<any>('/tasa/actual').catch(() => null),
      api.get<any[]>('/tesoreria/bancos').catch(() => []),
    ]).then(([rateData, accountsData]) => {
      setBcvRate(Number(rateData?.valor_ves || rateData?.tasa || 0));
      setBankAccounts(accountsData || []);
    });
  }, []);

  const handleAddMethod = () => {
    setMethods([
      ...methods,
      { id: Date.now(), type: 'Efectivo', account: bankAccounts[0]?.banco || 'Caja principal', ref: '', amount: '', rate: '1.00' }
    ]);
  };

  const updateMethod = (id: number, field: string, value: string) => {
    setMethods(methods.map((m) => m.id === id ? { ...m, [field]: value } : m));
  };

  const methodEquivalent = (m: any) => {
    const amount = parseAmount(m.amount);
    const rate = parseAmount(m.rate) || 1;
    return m.type === 'Bolívares' ? amount / rate : amount;
  };

  const totalInCesta = methods.reduce((acc, m) => acc + methodEquivalent(m), 0);

  const difference = totalInCesta - invoiceBalance;

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const data = await api.get<any>(`/cobranzas/aplicacion?factura_id=${facturaId}`);
        setKpis(data?.kpis || []);
        setPendingPayments(data?.pagos_pendientes || data?.pendientes || []);
      } catch (error) {
        console.error("Error fetching payment application data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [facturaId]);

  const handleProcesarCobro = async () => {
    if (!facturaId) {
      handleShowToast('Debe seleccionar una factura para procesar el cobro.', 'error');
      return;
    }
    if (methods.length === 0) {
      handleShowToast('Debe agregar al menos un método de pago.', 'error');
      return;
    }
    setIsLoading(true);
    try {
      await api.post('/cobranzas/aplicacion/procesar', {
        factura_id: facturaId,
        metodos: methods,
        monto: totalInCesta,
        diferencia: difference,
        accion_diferencia: difference < 0 ? 'Faltante' : difference > 0 ? 'Excedente' : 'Sin diferencia'
      });
      handleShowToast('Pago procesado y aplicado exitosamente.');
      setMethods([]); // Clear methods after success
    } catch (error: any) {
      console.error("Error processing payment:", error);
      handleShowToast(error.response?.data?.detail || 'Error al procesar el pago.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const displayKpis = kpis.length > 0 ? kpis : [
    { label: 'COBRADO HOY', value: '$0.00', desc: '0 pagos registrados', color: 'text-slate-800' },
    { label: 'POR APLICAR', value: '$0.00', desc: '0 pagos pendientes', color: 'text-amber-600' },
    { label: 'APLICADO', value: '$0.00', desc: 'Saldos liberados', color: 'text-[#0b5156]' },
    { label: 'DIFERENCIAS', value: '0', desc: 'Requieren revisión', color: 'text-red-600' },
  ];

  const displayPending = pendingPayments;

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-20">
      {/* Header Blanco y Verde */}
      <header className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
               <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                 Cobranza
               </span>
            </div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">Aplicación de Pagos</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Registro, validación y aplicación de cobros multimoneda.</p>
          </div>
          <button className="bg-white text-slate-600 px-6 py-2 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-slate-200 transition-all">Manual</button>
        </div>

        <div className="flex gap-3 pt-6 border-t border-slate-100">
           <button onClick={handleProcesarCobro} className="bg-[#0b5156] text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
              Registrar y aplicar pago
           </button>
           <button onClick={() => window.location.href = '/cobranzas/cartera'} className="bg-slate-50 text-slate-500 px-5 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 hover:bg-white transition-all border border-slate-200">
              Ver cuentas por cobrar
           </button>
        </div>
      </header>

      {/* Grid de KPIs */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {displayKpis.map((kpi, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-36 group hover:border-[#0b5156]/30 transition-all">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest group-hover:text-[#0b5156] transition-colors">{kpi.label || kpi.etiqueta}</p>
            <div className="space-y-1">
              <strong className={`text-3xl font-black ${kpi.color || 'text-slate-800'} tracking-tighter font-mono`}>{kpi.value || kpi.valor}</strong>
              <p className="text-sm font-bold text-slate-400 uppercase leading-tight">{kpi.desc || kpi.descripcion}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <section className="lg:col-span-2 space-y-6">
          <article className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-8">
             <div className="space-y-1">
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Terminal de Cobro Multimoneda</h3>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                <div className="space-y-2">
                   <label className="text-xs font-black text-slate-500 uppercase tracking-widest pl-2">Cliente</label>
                   <input type="text" readOnly value={clientName} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 text-sm font-black text-slate-800 focus:outline-none" />
                </div>
                <div className="space-y-2">
                   <label className="text-xs font-black text-slate-500 uppercase tracking-widest pl-2">Factura Relacionada</label>
                   <input type="text" readOnly value={facturaId ? `${facturaId} (Saldo: $${invoiceBalance.toFixed(2)})` : 'Ninguna seleccionada'} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 text-sm font-black text-slate-800 focus:outline-none" />
                </div>
             </div>

             <div className="bg-amber-50 border border-amber-100 p-5 rounded-2xl flex justify-between items-center">
                <div className="flex items-center gap-3">
                   <TrendingDown className="text-amber-500" size={18} />
                   <span className="text-xs font-black text-amber-600 uppercase tracking-widest">Tasa de Emisión Factura</span>
                </div>
                <strong className="text-slate-800 text-base font-black font-mono">Bs. {bcvRate.toFixed(2)} / USD</strong>
             </div>

             <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left">
                   <thead>
                      <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                         <th className="py-4 px-4">MÉTODO DE PAGO</th>
                         <th className="py-4 px-4">CUENTA DESTINO</th>
                         <th className="py-4 px-4 text-right">MONTO</th>
                         <th className="py-4 px-4 text-center">TASA</th>
                         <th className="py-4 px-4 text-right">EQUIV. USD</th>
                         <th className="py-4 px-4 text-center"></th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                      {methods.map((m) => (
                        <tr key={m.id}>
                           <td className="py-4 px-4">
                              <select
                                value={m.type}
                                onChange={(e) => updateMethod(m.id, 'type', e.target.value)}
                                className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-black text-slate-700 w-full outline-none focus:border-[#0b5156]"
                              >
                                 <option>Efectivo</option>
                                 <option>Transferencia</option>
                                 <option>Pago móvil</option>
                                 <option>Bolívares</option>
                              </select>
                           </td>
                           <td className="py-4 px-4">
                              <select
                                value={m.account}
                                onChange={(e) => updateMethod(m.id, 'account', e.target.value)}
                                className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-black text-slate-700 w-full outline-none focus:border-[#0b5156]"
                              >
                                 {bankAccounts.length > 0 ? bankAccounts.map((account) => (
                                   <option key={account.id} value={account.banco}>{account.banco}</option>
                                 )) : <option>Caja principal</option>}
                              </select>
                           </td>
                           <td className="py-4 px-4 text-right">
                              <input type="number" value={m.amount} onChange={(e) => updateMethod(m.id, 'amount', e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-black text-slate-700 w-full text-right outline-none font-mono focus:border-[#0b5156]" />
                           </td>
                           <td className="py-4 px-4 text-center">
                              <input type="number" value={m.rate} onChange={(e) => updateMethod(m.id, 'rate', e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-black text-slate-700 w-24 text-center outline-none font-mono focus:border-[#0b5156]" />
                           </td>
                           <td className="py-4 px-4 text-right font-mono text-xs font-black text-slate-700">${methodEquivalent(m).toFixed(2)}</td>
                           <td className="py-4 px-4 text-center">
                              <button onClick={() => setMethods(methods.filter(mx => mx.id !== m.id))} className="p-2 bg-red-50 text-red-400 rounded-lg hover:bg-red-100 transition-all"><Trash2 size={14} /></button>
                           </td>
                        </tr>
                      ))}
                   </tbody>
                </table>
                <button onClick={handleAddMethod} className="mt-6 text-xs font-black text-[#0b5156] uppercase flex items-center gap-2 hover:underline">
                   <Plus size={14} /> Agregar Método
                </button>
             </div>

              {difference !== 0 && methods.length > 0 && (
              <div className={`${difference < 0 ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'} border p-8 rounded-3xl space-y-4`}>
                 <div className="flex items-center gap-3">
                    <ShieldAlert className={difference < 0 ? 'text-red-500' : 'text-amber-500'} size={24} />
                    <h4 className={`text-base font-black ${difference < 0 ? 'text-red-600' : 'text-amber-600'} uppercase`}>Alerta de Diferencial Cambiario</h4>
                 </div>
                 <div className="pl-9 space-y-2 text-xs">
                    <p className="text-slate-600 font-bold uppercase">Diferencia detectada entre el monto cobrado y el saldo de la factura.</p>
                    <p className={`${difference < 0 ? 'text-red-700' : 'text-amber-700'} font-black uppercase font-mono`}>{difference < 0 ? 'Faltante' : 'Excedente'}: ${Math.abs(difference).toFixed(2)} USD</p>
                 </div>
              </div>
              )}

             <div className="flex gap-4">
                <button onClick={handleProcesarCobro} className="bg-[#0b5156] text-white px-8 py-4 rounded-2xl text-xs font-black uppercase shadow-2xl flex items-center gap-2 hover:scale-[1.02] transition-all">
                   Procesar Cobro <ArrowRight size={14} />
                </button>
             </div>
          </article>

        </section>

        <aside className="space-y-6">

           <article className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Resumen y Conciliación</h3>
              <div className="space-y-6">
                 <div className="flex justify-between items-end border-b border-slate-100 pb-4">
                    <span className="text-xs font-black text-slate-800 uppercase">Total en Cesta</span>
                    <span className="text-2xl font-black text-slate-800 font-mono">${totalInCesta.toFixed(2)}</span>
                 </div>
                 
                 <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 space-y-2">
                    <div className="flex items-center gap-2 text-amber-600">
                       <AlertCircle size={14} />
                       <span className="text-xs font-black uppercase tracking-tighter">Diferencia: ${difference.toFixed(2)}</span>
                    </div>
                    <select className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-black text-slate-700 outline-none">
                       <option>Comisión Bancaria (Gasto)</option>
                       <option>Pérdida Cambiaria</option>
                    </select>
                 </div>

                  <button onClick={handleProcesarCobro} className="w-full bg-[#0b5156] text-white font-black py-5 rounded-2xl uppercase text-xs shadow-2xl flex items-center justify-center gap-2 hover:scale-105 transition-all">
                     Confirmar y Cerrar <ArrowUpRight size={14} />
                  </button>
              </div>
           </article>

            <article className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
               <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Pagos Pendientes</h3>
               <div className="space-y-4">
                  {isLoading ? (
                     <div className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cargando pagos...</div>
                  ) : displayPending.length > 0 ? displayPending.map((p, i) => (
                     <div key={i} className="p-6 bg-slate-50 border border-slate-100 rounded-2xl space-y-4 hover:border-[#0b5156]/20 transition-all">
                        <div className="flex justify-between items-center">
                           <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-slate-800 font-mono">{p.id || p.documento}</span>
                              <span className="text-[10px] font-bold text-slate-400 font-mono">| {p.date || p.fecha}</span>
                           </div>
                           <span className={`${p.color || 'text-slate-600'} ${p.bg || 'bg-slate-100'} px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest`}>{p.status || p.estado}</span>
                        </div>
                        <div className="space-y-1">
                           <p className="text-xs font-black text-slate-700 uppercase tracking-tight">{p.client || p.cliente}</p>
                           <div className="flex justify-between items-center pt-2 border-t border-slate-200/40">
                              <span className="text-sm font-black text-[#0b5156] font-mono">{p.amount || p.monto}</span>
                              <button className="bg-[#0b5156] text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all">
                                 Aplicar
                              </button>
                           </div>
                        </div>
                     </div>
                  )) : (
                     <div className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">No hay pagos pendientes.</div>
                  )}
               </div>
            </article>
        </aside>
      </div>

      {toastMessage && createPortal(
        <div className={`fixed bottom-6 right-6 z-[130] ${toastMessage.type === 'error' ? 'bg-red-600 border-red-700' : 'bg-[#0b5156] border-green-700'} text-white py-4 px-6 rounded-2xl shadow-2xl border flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300`}>
          {toastMessage.type === 'error' ? <AlertCircle size={18} className="text-white/80" /> : <CheckCircle2 size={18} className="text-white/80" />}
          <span className="text-xs font-black uppercase tracking-widest">{toastMessage.msg}</span>
        </div>,
        document.body
      )}
    </div>
  );
};

export default PaymentApplication;
