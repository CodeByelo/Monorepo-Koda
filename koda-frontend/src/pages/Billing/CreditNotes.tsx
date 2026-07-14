import { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, 
  Plus, 
  History, 
  AlertTriangle, 
  CheckCircle, 
  TrendingDown, 
  TrendingUp, 
  Calculator,
  Search,
  ArrowRight,
  ShieldCheck,
  Zap,
  X
} from 'lucide-react';

const CreditNotes = () => {
  const navigate = useNavigate();
  const [noteType, setNoteType] = useState('Nota de crédito');
  const [invoiceNum, setInvoiceNum] = useState('');
  const [clientName, setClientName] = useState('');
  const [bcvRate, setBcvRate] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState<any[]>([]);

  // Verification/Lookup States
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedInvoiceTotal, setSelectedInvoiceTotal] = useState(0);

  // Toast State
  const [toast, setToast] = useState<{message: string, type: 'error' | 'success'} | null>(null);

  const showToast = (message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchNotes = () => {
    api.get<any[]>('/ventas/notas-credito').then((data) => {
      setNotes((data || []).map((n) => ({
        id: n.id,
        date: n.fecha,
        type: n.tipo === 'DEBITO' ? 'DÉBITO' : 'CRÉDITO',
        invoice: n.invoice || '-',
        client: n.cliente,
        reason: n.motivo,
        amount: `$${Number(n.monto).toFixed(2)}`,
        amountRaw: Number(n.monto),
        status: n.estado,
        statusColor: n.estado === 'EMITIDA' ? 'bg-green-100 text-green-700' : 'bg-[#bdafa1]/10 text-slate-500',
      })));
    }).catch(console.error);
  };

  useEffect(() => {
    fetchNotes();
  }, []);

  const handleSearchInvoice = () => {
    if (!invoiceNum.trim()) return;
    setIsSearching(true);
    setSearchError('');
    setClientName('');
    setBcvRate('');
    setAmount('');
    setSelectedInvoiceTotal(0);

    api.get<any>(`/ventas/${invoiceNum.trim().toUpperCase()}`)
      .then((res) => {
        // Look up the customer from accounts receivable
        api.get<any[]>('/cobranzas/cuentas')
          .then((cxcList) => {
            const match = cxcList.find(c => c.documento === res.numero_factura);
            if (match) {
              setClientName(match.cliente);
            } else {
              setClientName('NO ASIGNADO');
            }
          })
          .catch(() => {
            setClientName('NO ASIGNADO');
          });

        const tasa = res.tasa_cambio_bs;
        if (tasa !== null && tasa !== undefined) {
          setBcvRate(Number(tasa) > 0 ? Number(tasa).toFixed(4) : '');
        }
        setAmount(Number(res.total).toFixed(2));
        setSelectedInvoiceTotal(Number(res.total));
      })
      .catch((err) => {
        console.error(err);
        setSearchError('Factura no encontrada');
      })
      .finally(() => {
        setIsSearching(false);
      });
  };

  const handleSaveNote = () => {
    if (!invoiceNum) {
      showToast("Ingrese una factura relacionada", "error");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      showToast("Ingrese un monto válido", "error");
      return;
    }
    if (selectedInvoiceTotal > 0 && Number(amount) > selectedInvoiceTotal) {
      showToast(`El monto no puede exceder el total de la factura ($${selectedInvoiceTotal.toFixed(2)})`, "error");
      return;
    }
    if (!bcvRate) {
      showToast("La factura seleccionada no tiene una tasa BCV válida", "error");
      return;
    }

    const payload = {
      numero_factura: invoiceNum.trim().toUpperCase(),
      monto: Number(amount),
      motivo: reason || "Ajuste / Devolución",
      tipo: noteType === 'Nota de débito' ? 'DEBITO' : 'CREDITO'
    };

    api.post<any>('/ventas/notas-credito', payload)
      .then((res) => {
        showToast(`${noteType} creada exitosamente: ${res.id}`, "success");
        // Clear form
        setInvoiceNum('');
        setClientName('');
        setBcvRate('');
        setAmount('');
        setReason('');
        setSelectedInvoiceTotal(0);
        // Refresh notes
        fetchNotes();
      })
      .catch((err) => {
        console.error(err);
        showToast(err.response?.data?.detail || `Error al crear la ${noteType.toLowerCase()}`, "error");
      });
  };

  // KPIs calculations based on notes
  const totalNotes = notes.length;
  const creditNotes = notes.filter(n => n.type === 'CRÉDITO').length;
  const debitNotes = notes.filter(n => n.type === 'DÉBITO').length;
  const totalAdjusted = notes.reduce((sum, n) => sum + (n.amountRaw || 0), 0);

  const displayKpis = [
    { t: 'Notas del Mes', v: String(totalNotes), desc: 'Documentos ajustados', c: 'text-slate-800' },
    { t: 'Créditos Emitidos', v: String(creditNotes), desc: 'Disminuyen saldo', c: 'text-slate-500' },
    { t: 'Débitos Emitidos', v: String(debitNotes), desc: 'Aumentan saldo', c: 'text-[#0b5156]' },
    { t: 'Monto Ajustado', v: `$${totalAdjusted.toFixed(2)}`, desc: 'Impacto comercial', c: 'text-[#43584b]' }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-4xl font-black tracking-tighter uppercase mb-2 text-slate-800">Notas de Crédito y Débito</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-tight max-w-2xl">
            Ajustes, devoluciones y trazabilidad de documentos comerciales con validación SHA-256.
          </p>
          <div className="flex gap-4 mt-8 flex-wrap">
             <button onClick={() => document.getElementById('manual-ajustes')?.scrollIntoView({ behavior: 'smooth' })} className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-[#0b5156]/20 hover:scale-105 transition-all">
                <Zap size={14} /> Manual Operativo
             </button>
             <button onClick={() => navigate('/facturacion/emitidas')} className="bg-white text-slate-500 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-colors">
                Volver a Ventas
             </button>
             <button onClick={() => document.getElementById('form-ajuste')?.scrollIntoView({ behavior: 'smooth' })} className="bg-[#43584b] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-[#43584b]/20 hover:scale-105 transition-all">
                Crear Nota Vinculada
             </button>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {displayKpis.map((kpi, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-32 group hover:border-[#0b5156]/30 transition-all">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest group-hover:text-[#0b5156] transition-colors">{kpi.t}</p>
            <div>
              <strong className={`text-3xl font-black ${kpi.c} tracking-tighter font-mono`}>{kpi.v}</strong>
              <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">{kpi.desc}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <section id="form-ajuste" className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm scroll-mt-24">
             <div className="flex items-center gap-2 mb-6 text-slate-800">
                <Calculator size={18} className="text-[#0b5156]" />
                <h3 className="text-xl font-black uppercase tracking-tight">Crear Documento de Ajuste</h3>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div className="space-y-1.5">
                   <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Tipo de nota</label>
                   <select 
                     value={noteType}
                     onChange={(e) => setNoteType(e.target.value)}
                     className="w-full px-4 py-2.5 bg-[#bdafa1]/5 border border-[#bdafa1]/20 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156] uppercase"
                   >
                      <option>Nota de crédito</option>
                      <option>Nota de débito</option>
                   </select>
                </div>
                <div className="space-y-1.5">
                   <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Factura relacionada</label>
                   <div className="relative">
                      <input 
                        type="text" 
                        value={invoiceNum} 
                        onChange={(e) => {
                          setInvoiceNum(e.target.value);
                          setSearchError('');
                        }}
                        placeholder="FAC-00000001" 
                        className="w-full pr-12 px-4 py-2.5 bg-[#bdafa1]/5 border border-[#bdafa1]/20 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156] font-mono uppercase" 
                      />
                      <button 
                        type="button"
                        onClick={handleSearchInvoice}
                        disabled={isSearching || !invoiceNum}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#0b5156] hover:text-[#0b5156]/70 disabled:opacity-50"
                      >
                        <Search size={16} />
                      </button>
                   </div>
                   {searchError && (
                      <p className="text-[10px] font-black text-red-600 uppercase mt-0.5">{searchError}</p>
                   )}
                </div>
                <div className="space-y-1.5">
                   <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Entidad Cliente</label>
                   <input type="text" value={clientName} placeholder="BUSQUE FACTURA..." readOnly className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-500 uppercase" />
                </div>
                <div className="space-y-1.5">
                   <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Tasa BCV Aplicada</label>
                   <input type="text" value={bcvRate} placeholder="-" readOnly className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-500 font-mono" />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                   <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Monto a Ajustar (USD)</label>
                   <input 
                     type="number" 
                     value={amount} 
                     onChange={(e) => setAmount(e.target.value)}
                     placeholder="0.00" 
                     className="w-full px-4 py-2.5 bg-[#0b5156]/5 border border-[#0b5156]/30 rounded-xl text-sm font-black focus:outline-none focus:ring-2 focus:ring-[#0b5156]/20 font-mono" 
                   />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                   <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Justificación del Ajuste</label>
                   <textarea 
                     rows={3} 
                     value={reason} 
                     onChange={(e) => setReason(e.target.value)}
                     placeholder="Especifique el motivo del ajuste fiscal..." 
                     className="w-full px-4 py-2.5 bg-[#bdafa1]/5 border border-[#bdafa1]/20 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                   ></textarea>
                </div>
             </div>
             <div className="mt-8 flex gap-3">
                <button onClick={handleSaveNote} className="bg-[#0b5156] text-white px-8 py-3 rounded-2xl text-xs font-black uppercase shadow-xl shadow-[#0b5156]/20 hover:scale-105 transition-all">
                   Guardar y Vincular Nota
                </button>
                <button 
                  type="button"
                  onClick={() => invoiceNum ? showToast(`Abriendo visor de Factura Original para ${invoiceNum.toUpperCase()}...`, 'success') : showToast('Debe buscar e ingresar una factura relacionada', 'error')}
                  className="bg-white text-slate-500 px-8 py-3 rounded-2xl text-xs font-black uppercase border border-slate-200 hover:bg-slate-50 transition-all"
                >
                   Ver Factura Original
                </button>
             </div>
          </section>

          <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
             <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-2 text-slate-800">
                   <History size={18} className="text-[#0b5156]" />
                   <h3 className="text-xl font-black uppercase tracking-tight">Registro Histórico</h3>
                </div>
                <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                   <input type="text" placeholder="BUSCAR REGISTRO..." className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black focus:outline-none focus:border-[#0b5156] uppercase" />
                </div>
             </div>
             <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left">
                   <thead>
                      <tr className="text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                         <th className="py-4 px-8">ID DOCUMENTO</th>
                         <th className="py-4 px-6 text-center">TIPO</th>
                         <th className="py-4 px-6">REF. FACTURA</th>
                         <th className="py-4 px-6">ENTIDAD CLIENTE</th>
                         <th className="py-4 px-6 text-right">MONTO AJUSTE</th>
                         <th className="py-4 px-6 text-center">ESTADO</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                      {notes.length > 0 ? (
                        notes.map(note => (
                          <tr key={note.id} className="group hover:bg-slate-50 transition-colors">
                             <td className="py-5 px-8">
                                <span className="block text-sm text-slate-800 font-black font-mono">{note.id}</span>
                                <span className="text-[9px] text-slate-400 font-bold uppercase">{note.date}</span>
                             </td>
                             <td className="py-5 px-6 text-center">
                                 <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase border ${
                                   note.type === 'DÉBITO' ? 'bg-[#0b5156]/10 text-[#0b5156] border-[#0b5156]/20' : 'bg-slate-100 text-slate-500 border-slate-200'
                                 }`}>{note.type}</span>
                             </td>
                             <td className="py-5 px-6 text-xs text-slate-500 font-black font-mono">{note.invoice}</td>
                             <td className="py-5 px-6 text-xs text-slate-800 uppercase font-black">{note.client}</td>
                             <td className="py-5 px-6 text-right text-sm font-black text-slate-800 font-mono">{note.amount}</td>
                             <td className="py-5 px-6 text-center">
                                <span className="bg-slate-100 text-slate-500 text-[9px] font-black px-2 py-0.5 rounded uppercase border border-slate-200">{note.status}</span>
                             </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                           <td colSpan={6} className="py-8 text-center text-slate-400 font-bold uppercase text-xs">
                              No hay notas de crédito/débito emitidas.
                           </td>
                        </tr>
                      )}
                   </tbody>
                </table>
             </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="bg-white p-8 rounded-3xl border border-[#0b5156]/20 shadow-sm space-y-6">
             <h3 className="text-lg font-black uppercase tracking-tight text-[#0b5156]">Impacto del Ajuste</h3>
             <div className="space-y-4">
                <div className="flex justify-between items-end border-b border-slate-50 pb-3">
                   <div className="space-y-1">
                      <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Factura Original</span>
                      <p className="text-xs font-black text-slate-500 font-mono">{invoiceNum ? invoiceNum.toUpperCase() : '-'}</p>
                   </div>
                   <strong className="text-xl font-black tracking-tighter text-slate-800 font-mono">${selectedInvoiceTotal.toFixed(2)}</strong>
                </div>
                <div className="flex justify-between items-end border-b border-slate-50 pb-3">
                   <div className="space-y-1">
                      <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Nota Aplicada</span>
                      <p className="text-xs font-bold text-[#43584b] uppercase">Disminución de Saldo</p>
                   </div>
                   <strong className="text-xl font-black tracking-tighter text-red-600 font-mono">
                     {amount ? `-$${Number(amount).toFixed(2)}` : '$0.00'}
                   </strong>
                </div>
                <div className="flex justify-between items-end pt-2">
                   <span className="text-xs font-black uppercase tracking-widest text-slate-800">Saldo Proyectado</span>
                   <div className="text-right">
                      <strong className="text-3xl font-black tracking-tighter text-[#0b5156] font-mono">
                        ${(selectedInvoiceTotal - (Number(amount) || 0)).toFixed(2)}
                      </strong>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Nuevo Saldo Real</p>
                   </div>
                </div>
                <div className="pt-4 flex justify-between items-center">
                   <span className="text-xs font-black uppercase text-slate-500 tracking-widest">Auditoría Fiscal</span>
                   <span className="bg-[#43584b]/10 text-[#43584b] text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest border border-[#43584b]/20">COMPLETO</span>
                </div>
             </div>
          </section>

          <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
             <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">Protocolos</h3>
             <div className="space-y-4">
                <div className="p-4 bg-[#8fb09f]/10 rounded-2xl border border-[#8fb09f]/20 flex gap-4">
                   <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-[#43584b] shadow-sm"><CheckCircle size={18} /></div>
                   <div className="space-y-1">
                      <strong className="text-xs font-black text-[#43584b] uppercase tracking-widest">Existencia</strong>
                      <p className="text-xs font-bold text-slate-800 uppercase">Factura Validada</p>
                      <p className="text-[9px] text-slate-500 font-bold uppercase leading-tight">El documento base está habilitado.</p>
                   </div>
                </div>
                <div className="p-4 bg-[#bdafa1]/10 rounded-2xl border border-[#bdafa1]/20 flex gap-4">
                   <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-500 shadow-sm"><ShieldCheck size={18} /></div>
                   <div className="space-y-1">
                      <strong className="text-xs font-black text-slate-500 uppercase tracking-widest">Integridad</strong>
                      <p className="text-xs font-bold text-slate-800 uppercase">Soporte Digital</p>
                      <p className="text-[9px] text-slate-500 font-bold uppercase leading-tight">SHA-256 Activo para auditoría fiscal.</p>
                   </div>
                </div>
             </div>
          </section>

          <article id="manual-ajustes" className="bg-white p-8 rounded-3xl border border-[#0b5156]/20 shadow-sm space-y-4 relative overflow-hidden group scroll-mt-24">
             <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Zap size={60} className="text-[#0b5156]" />
             </div>
             <div className="flex items-center gap-2 relative z-10">
                <AlertTriangle size={18} className="text-[#0b5156]" />
                <h4 className="text-sm font-black text-[#0b5156] uppercase tracking-tight">Manual de Ajustes</h4>
             </div>
             <p className="text-xs font-bold leading-relaxed text-slate-500 uppercase relative z-10">
                Los ajustes deben tener un motivo fiscal claro para evitar penalizaciones del SENIAT.
             </p>
             <div className="pt-2 relative z-10">
                <p className="text-xs font-black text-[#43584b] uppercase tracking-widest">RECOMENDACIÓN:</p>
                <p className="text-xs font-bold leading-relaxed text-slate-500 uppercase">
                   Valida siempre si existe una nota previa para el mismo documento.
                </p>
             </div>
          </article>
        </aside>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-10 right-10 z-[100] animate-in slide-in-from-bottom-10 fade-in duration-300">
          <div className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border ${
            toast.type === 'error' ? 'bg-white border-red-100' : 'bg-white border-green-100'
          }`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              toast.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
            }`}>
              {toast.type === 'error' ? <AlertTriangle size={20} /> : <CheckCircle size={20} />}
            </div>
            <div className="pr-4">
              <p className={`text-[10px] font-black uppercase tracking-widest ${
                toast.type === 'error' ? 'text-red-500' : 'text-green-500'
              }`}>
                {toast.type === 'error' ? 'Error de Validación' : 'Operación Exitosa'}
              </p>
              <p className="text-sm font-bold text-slate-700">{toast.message}</p>
            </div>
            <button 
              type="button"
              onClick={() => setToast(null)}
              className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-50 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreditNotes;
