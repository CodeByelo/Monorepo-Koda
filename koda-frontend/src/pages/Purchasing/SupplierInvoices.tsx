import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Maximize2, Minimize2, Plus, Search, Target, X } from 'lucide-react';
import { api } from '@/api/client';

const money = (value: unknown) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
const bs = (value: unknown) => `Bs. ${Number(value || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;

const SupplierInvoices = () => {
  const [showModal, setShowModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [recepciones, setRecepciones] = useState<any[]>([]);
  const [bcvRate, setBcvRate] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    proveedorId: '',
    recepcionId: '',
    nroFactura: '',
    nroControl: '',
    fechaEmision: '',
    diasCredito: '0',
    baseUsd: '',
    ivaUsd: ''
  });

  const showSuccess = (msg: string) => { setGlobalSuccess(msg); setTimeout(() => setGlobalSuccess(null), 3000); };
  const showError = (msg: string) => { setGlobalError(msg); setTimeout(() => setGlobalError(null), 4000); };

  const fetchData = () => {
    setIsLoading(true);
    Promise.all([
      api.get<any>('/tasas/bcv').catch(() => null),
      api.get('/compras/facturas').catch(() => ({ data: [] })),
      api.get('/proveedores').catch(() => ({ data: [] })),
      api.get('/compras/recepciones').catch(() => ({ data: [] })),
    ])
      .then(([rateData, invoicesRes, provRes, recRes]: [any, any, any, any]) => {
        setBcvRate(Number(rateData?.valor || rateData?.tasa || 0));
        setInvoices(invoicesRes.data || invoicesRes || []);
        setProveedores(provRes.data || provRes || []);
        setRecepciones(recRes.data || recRes || []);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleProcessInvoice = async () => {
    if (!formData.proveedorId || !formData.nroFactura || !formData.baseUsd || !formData.fechaEmision) {
      showError('Faltan campos requeridos (Proveedor, Factura, Base, Fecha)');
      return;
    }
    
    setIsProcessing(true);
    try {
      const totalUsd = parseFloat(formData.baseUsd) + parseFloat(formData.ivaUsd || '0');
      await api.post('/compras', {
        proveedor_id: parseInt(formData.proveedorId),
        numero_factura: formData.nroFactura,
        numero_control: formData.nroControl || undefined,
        recepcion_id: formData.recepcionId ? parseInt(formData.recepcionId) : undefined,
        fecha_emision: formData.fechaEmision,
        subtotal_usd: parseFloat(formData.baseUsd),
        iva_usd: parseFloat(formData.ivaUsd || '0'),
        total_usd: totalUsd,
        tasa_cambio_bs: bcvRate > 0 ? bcvRate : 1, // Fallback si no hay BCV
        dias_credito: parseInt(formData.diasCredito || '0')
      });
      showSuccess('Factura registrada y conciliada correctamente');
      setShowModal(false);
      setFormData({
        proveedorId: '', recepcionId: '', nroFactura: '', nroControl: '',
        fechaEmision: '', diasCredito: '0', baseUsd: '', ivaUsd: ''
      });
      fetchData();
    } catch (err: any) {
      showError(err?.response?.data?.detail || 'Error procesando la factura');
    } finally {
      setIsProcessing(false);
    }
  };

  const calculatedInvoices = useMemo(() => invoices.map((invoice) => {
    const usdAmount = Number(invoice.usd || invoice.monto_usd || invoice.total || 0);
    const rateReg = Number(invoice.rateReg || invoice.tasa_registro || bcvRate || 0);
    const bsReg = usdAmount * rateReg;
    const bsCurr = usdAmount * bcvRate;
    return { ...invoice, usdAmount, rateReg, bsReg, bsCurr, diff: bsCurr - bsReg };
  }), [invoices, bcvRate]);

  const totalDebt = calculatedInvoices.reduce((sum, invoice) => sum + invoice.usdAmount, 0);
  const pendingCount = calculatedInvoices.filter((invoice) => (invoice.status || invoice.estado || '').toUpperCase() !== 'PAGADA').length;

  const kpis = [
    { t: 'Por pagar', v: String(pendingCount), desc: 'Facturas pendientes', c: 'text-[#0b5156]' },
    { t: 'Vencimiento hoy', v: '0', desc: 'Prioridad de pago', c: 'text-amber-600' },
    { t: 'Total deuda', v: money(totalDebt), desc: 'Pasivo corriente', c: 'text-red-600' },
    { t: 'Crédito disponible', v: '$0.00', desc: 'Capacidad de compra', c: 'text-green-600' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      {globalSuccess && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-[#0b5156] text-white px-6 py-3 rounded-full font-bold shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 z-50">
          <Target size={18} />
          {globalSuccess}
        </div>
      )}
      {globalError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-full font-bold shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 z-50">
          <AlertTriangle size={18} />
          {globalError}
        </div>
      )}

      <header className="bg-white p-8 rounded-3xl border border-[#bdafa1]/20 shadow-sm flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-black text-[#0b5156] tracking-tighter uppercase mb-2">Facturas de Proveedor</h1>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Registro de pasivos comerciales y soporte fiscal con datos reales del sistema.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-[#0b5156] text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl flex items-center gap-2 hover:scale-[1.02] transition-all">
          <Plus size={16} /> Registrar Factura
        </button>
      </header>

      <div className="grid grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between hover:-translate-y-1 transition-all">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">{k.t}</h3>
            <div>
              <p className={`text-4xl font-black tracking-tighter ${k.c}`}>{k.v}</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{k.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <article className={`bg-white rounded-[2.5rem] border border-[#bdafa1]/20 shadow-sm overflow-hidden transition-all duration-500 ${isExpanded ? 'fixed inset-4 z-50 shadow-2xl' : 'relative'}`}>
        <div className="p-8 border-b border-[#bdafa1]/10 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-lg font-black text-[#0b5156] tracking-tighter uppercase">Documentos Recibidos</h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Control de obligaciones registradas</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input type="text" placeholder="Buscar RIF..." className="pl-12 pr-6 py-3 bg-white border border-slate-200 rounded-full text-xs font-bold focus:outline-none focus:border-[#0b5156] transition-all w-64 shadow-sm" />
            </div>
            <button onClick={() => setIsExpanded(!isExpanded)} className="p-3 hover:bg-slate-200 rounded-full text-slate-600 transition-colors">
              {isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </div>
        </div>
        
        <div className={`overflow-auto ${isExpanded ? 'h-[calc(100vh-140px)]' : 'h-[500px]'}`}>
          <table className="w-full text-left border-collapse">
            <thead className="bg-white sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="py-5 px-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha / Factura</th>
                <th className="py-5 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Proveedor</th>
                <th className="py-5 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Base USD</th>
                <th className="py-5 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Bs. Registro</th>
                <th className="py-5 px-6 text-[10px] font-black text-[#0b5156] uppercase tracking-widest text-right">Bs. Hoy</th>
                <th className="py-5 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Soporte</th>
                <th className="py-5 px-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#bdafa1]/10">
              {calculatedInvoices.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">No hay facturas de proveedor registradas.</td></tr>
              ) : (
                calculatedInvoices.map((invoice, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors group">
                  <td className="py-5 px-8">
                    <span className="block text-xs font-bold text-slate-400 uppercase">{invoice.date || invoice.fecha}</span>
                    <strong className="text-xs font-black text-slate-800">{invoice.id || invoice.numero_factura}</strong>
                    {invoice.numero_control && <span className="block text-[9px] text-slate-400 uppercase tracking-tight">Ctrl: {invoice.numero_control}</span>}
                  </td>
                  <td className="py-5 px-6">
                    <span className="text-xs font-black text-[#0b5156] uppercase truncate max-w-[150px] block">{invoice.vendor || invoice.proveedor || '-'}</span>
                    <span className="text-[9px] font-bold text-slate-400">{invoice.rif || '-'}</span>
                  </td>
                  <td className="py-5 px-6 text-right font-black text-slate-800">{money(invoice.usdAmount)}</td>
                  <td className="py-5 px-6 text-right text-xs font-bold text-slate-400">{bs(invoice.bsReg)}</td>
                  <td className="py-5 px-6 text-right text-xs font-bold text-slate-900">{bs(invoice.bsCurr)}</td>
                  <td className="py-5 px-6 text-center">{invoice.hasAttachment || invoice.tiene_adjunto ? <CheckCircle2 className="text-green-500 mx-auto" size={16} /> : <X className="text-red-400 mx-auto" size={16} />}</td>
                  <td className="py-5 px-6 text-center">
                    <span className="text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter bg-slate-100 text-slate-700">{invoice.status || invoice.estado || 'Pendiente'}</span>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </article>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/80 z-[100] flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl p-10 relative mt-10 mb-10">
            <button onClick={() => setShowModal(false)} className="absolute top-8 right-8 text-slate-400 hover:text-slate-800"><X size={32} /></button>
            <h3 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase mb-2">Registro Fiscal</h3>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-8">Vincula la recepción de almacén con su documento legal</p>
            
            <div className="grid grid-cols-2 gap-6 items-start">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Proveedor</label>
                <select 
                  value={formData.proveedorId} 
                  onChange={e => setFormData({...formData, proveedorId: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase focus:outline-none focus:border-[#0b5156]"
                >
                  <option value="">Selecciona Proveedor</option>
                  {proveedores.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} ({p.rif})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Recepción de Stock (Para Conciliar)</label>
                <select 
                  value={formData.recepcionId} 
                  onChange={e => setFormData({...formData, recepcionId: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase focus:outline-none focus:border-[#0b5156]"
                >
                  <option value="">Sin Conciliar (Gasto Directo)</option>
                  {recepciones.filter(r => r.estado !== 'Conciliado').map(r => (
                    <option key={r.id} value={r.id}>{r.hoja_id} - Qty: {r.cantidad} - {r.fecha}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nro. Factura</label>
                <input 
                  type="text" 
                  value={formData.nroFactura}
                  onChange={e => setFormData({...formData, nroFactura: e.target.value})}
                  placeholder="Ej. FAC-001" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase focus:outline-none focus:border-[#0b5156]" 
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nro. Control Fiscal</label>
                <input 
                  type="text" 
                  value={formData.nroControl}
                  onChange={e => setFormData({...formData, nroControl: e.target.value})}
                  placeholder="Ej. 00-001" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase focus:outline-none focus:border-[#0b5156]" 
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Fecha Emisión</label>
                <input 
                  type="date" 
                  value={formData.fechaEmision}
                  onChange={e => setFormData({...formData, fechaEmision: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase focus:outline-none focus:border-[#0b5156]" 
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Días de Crédito</label>
                <input 
                  type="number" 
                  value={formData.diasCredito}
                  onChange={e => setFormData({...formData, diasCredito: e.target.value})}
                  min="0"
                  placeholder="0" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase focus:outline-none focus:border-[#0b5156]" 
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Base Imponible (USD)</label>
                <input 
                  type="number" 
                  value={formData.baseUsd}
                  onChange={e => setFormData({...formData, baseUsd: e.target.value})}
                  placeholder="0.00" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black focus:outline-none focus:border-[#0b5156]" 
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">IVA (USD)</label>
                <input 
                  type="number" 
                  value={formData.ivaUsd}
                  onChange={e => setFormData({...formData, ivaUsd: e.target.value})}
                  placeholder="0.00" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black focus:outline-none focus:border-[#0b5156]" 
                />
              </div>
            </div>
            
            <button 
              onClick={handleProcessInvoice}
              disabled={isProcessing}
              className="mt-8 w-full bg-[#43584b] hover:bg-[#2b3a31] text-white font-black py-5 rounded-2xl uppercase text-xs tracking-widest shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100"
            >
              {isProcessing ? 'Registrando...' : 'Registrar Operación Fiscal'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierInvoices;
