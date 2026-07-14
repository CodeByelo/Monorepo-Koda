import { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { 
  ArrowRightLeft, 
  Plus, 
  FileText, 
  CheckCircle2, 
  X, 
  Search, 
  Filter
} from 'lucide-react';


const InternalTransfers = () => {
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };
  const [showModal, setShowModal] = useState(false);
  const [trfAmount, setTrfAmount] = useState<number>(0);
  const [trfRate, setTrfRate] = useState<number>(36.50);
  const bcvRate = 36.42;

  const [transfers, setTransfers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [fromAccountId, setFromAccountId] = useState<number | ''>('');
  const [toAccountId, setToAccountId] = useState<number | ''>('');
  const [concept, setConcept] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const fetchTransfers = async () => {
    try {
      const res = await api.get<any[]>('/tesoreria/transferencias-internas');
      setTransfers(res);
    } catch (error) {
      console.error("Error loading transfers:", error);
    }
  };

  useEffect(() => {
    fetchTransfers();

    const fetchAccounts = async () => {
      try {
        const res = await api.get<any[]>('/tesoreria/cuentas');
        setAccounts(res);
        if (res.length > 0) {
          setFromAccountId(res[0].id);
          if (res.length > 1) {
            setToAccountId(res[1].id);
          } else {
            setToAccountId(res[0].id);
          }
        }
      } catch (error) {
        console.error("Error loading accounts:", error);
      }
    };
    fetchAccounts();
  }, []);

  const selectedFromAccount = accounts.find(a => a.id === fromAccountId);
  const selectedToAccount = accounts.find(a => a.id === toAccountId);
  const trfFrom = selectedFromAccount?.moneda || 'USD';

  const handleRegisterTransfer = async () => {
    if (!fromAccountId || !toAccountId || trfAmount <= 0) {
      showToast("Por favor complete todos los datos requeridos.");
      return;
    }
    if (fromAccountId === toAccountId) {
      showToast("La cuenta de origen y destino no pueden ser la misma.");
      return;
    }
    try {
      await api.post('/tesoreria/transferencias-internas', {
        origen_id: fromAccountId,
        destino_id: toAccountId,
        monto_usd: selectedFromAccount?.moneda === 'USD' ? trfAmount : trfAmount / trfRate,
        tasa_cambio_bs: trfRate,
        concepto: concept || 'Transferencia Interna'
      });
      showToast("Transferencia registrada con éxito. Pendiente por confirmar.");
      setShowModal(false);
      setConcept('');
      setTrfAmount(0);
      fetchTransfers();
    } catch (error) {
      console.error("Error registering transfer:", error);
      showToast("Error al registrar la transferencia.");
    }
  };

  const handleConfirmTransfer = async (dbId: number) => {
    try {
      await api.post(`/tesoreria/transferencias-internas/${dbId}/confirmar`);
      showToast("Transferencia confirmada y saldos actualizados en las cuentas correspondientes.");
      fetchTransfers();
    } catch (error) {
      console.error("Error confirming transfer:", error);
      showToast("Error al confirmar la transferencia.");
    }
  };

  // Calc logic
  const resultAmount = trfFrom === 'VES' ? trfAmount / trfRate : trfAmount * trfRate;
  const bcvEquivalent = trfFrom === 'VES' ? trfAmount / bcvRate : trfAmount * bcvRate;
  const fxDiff = resultAmount - bcvEquivalent;

  const filteredTransfers = transfers.filter(row => {
    const q = searchQuery.toLowerCase();
    return (
      (row.id || '').toLowerCase().includes(q) ||
      (row.desc || '').toLowerCase().includes(q) ||
      (row.from || '').toLowerCase().includes(q) ||
      (row.to || '').toLowerCase().includes(q) ||
      (row.ref || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-3 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase">Transferencias Internas</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Movimientos entre cuentas propias, traslados de efectivo y operaciones FX.</p>
          </div>
          <div className="flex gap-3">
             <button onClick={() => setShowModal(true)} className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <Plus size={14} /> Nueva Transferencia
             </button>
          </div>
        </div>
      </header>

      {/* Main Table */}
      <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Movimientos Recientes</h2>
          <div className="flex gap-2">
             <div className="relative">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                <input 
                  type="text" 
                  placeholder="Buscar..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156] w-48" 
                />
             </div>
             <button className="p-2 bg-slate-50 text-slate-600 rounded-lg border border-slate-200 hover:bg-white">
                <Filter size={16} />
             </button>
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-2.5 px-6">TRANSFERENCIA</th>
                <th className="py-2.5 px-4">ORIGEN</th>
                <th className="py-2.5 px-4">DESTINO</th>
                <th className="py-2.5 px-4 text-right">MONTO</th>
                <th className="py-2.5 px-4 text-center">REFERENCIA</th>
                <th className="py-2.5 px-4 text-center">ESTADO</th>
                <th className="py-2.5 px-6 text-right">ACCIÓN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs">
              {filteredTransfers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 px-6 text-center text-slate-400 font-bold uppercase tracking-widest bg-slate-50/50">
                    No hay transferencias recientes
                  </td>
                </tr>
              ) : (
                filteredTransfers.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="py-2.5 px-6">
                    <div className="flex flex-col">
                      <span className="font-black text-[#0b5156] uppercase">{row.id}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{row.desc}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 font-black text-slate-600 uppercase">{row.from}</td>
                  <td className="py-2.5 px-4 font-black text-slate-600 uppercase">{row.to}</td>
                  <td className="py-2.5 px-4 text-right">
                    <div className="flex flex-col items-end">
                      <span className="font-black text-[#0b5156] font-mono">{row.amount}</span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">{row.meta}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-center font-mono font-black text-slate-400">{row.ref}</td>
                  <td className="py-2.5 px-4 text-center">
                    <span className={`${row.statusColor} px-2 py-0.5 rounded text-[10px] font-black uppercase`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-6 text-right">
                    {row.canConfirm ? (
                       <button onClick={() => handleConfirmTransfer(row.db_id)} className="bg-[#0b5156] text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-[#083a3d] transition-all flex items-center gap-1 ml-auto">
                          <CheckCircle2 size={12} /> Confirmar
                       </button>
                    ) : (
                      <button className="text-slate-400 hover:text-[#0b5156] transition-colors"><FileText size={18} className="ml-auto" /></button>
                    )}
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      <div className="grid grid-cols-1 gap-6 items-start">
        {/* Alerts */}
        <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-6">
           <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Alertas de Traslado</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
              {[
                { type: 'Destino', title: 'Sin Novedad', desc: 'No hay traslados pendientes.', color: 'text-slate-400', titleColor: 'text-slate-500', bg: 'bg-transparent', border: 'border-dashed border-slate-200' },
                { type: 'Tasa', title: 'Sin Novedad', desc: 'Cruce cambiario exacto.', color: 'text-slate-400', titleColor: 'text-slate-500', bg: 'bg-transparent', border: 'border-dashed border-slate-200' },
                { type: 'Caja', title: 'Sin Novedad', desc: 'Fondos operativos al día.', color: 'text-slate-400', titleColor: 'text-slate-500', bg: 'bg-transparent', border: 'border-dashed border-slate-200' },
                { type: 'Fondo', title: 'Conciliado', desc: 'Trazabilidad perfecta.', color: 'text-green-600', titleColor: 'text-green-700', bg: 'bg-green-50/50', border: 'border-solid border-green-200' },
              ].map((item, i) => (
                <div key={i} className={`p-5 rounded-2xl border ${item.border} ${item.bg} space-y-2 group hover:scale-[1.02] transition-all cursor-pointer`}>
                   <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase border border-current/20 ${item.color}`}>{item.type}</span>
                   <h4 className={`text-sm font-black uppercase leading-tight ${item.titleColor}`}>{item.title}</h4>
                   <p className={`text-[10px] font-bold uppercase leading-relaxed ${item.color === 'text-green-600' ? 'text-green-600/70' : 'text-slate-400'}`}>{item.desc}</p>
                </div>
              ))}
           </div>
        </article>
      </div>

      {/* New Transfer Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                 <div className="flex items-center gap-2">
                    <div className="p-2 bg-[#0b5156] text-white rounded-lg"><Plus size={16} /></div>
                    <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tight">Nueva Transferencia / Cambio</h3>
                 </div>
                 <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
              </div>
              <div className="p-8 space-y-6">
                 <div className="grid grid-cols-2 gap-3 items-start">
                    <div className="space-y-2">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Origen</label>
                       <select 
                         value={fromAccountId}
                         onChange={(e) => setFromAccountId(Number(e.target.value))}
                         className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156] uppercase"
                       >
                          {accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.banco} ({acc.moneda})</option>
                          ))}
                       </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Destino</label>
                       <select 
                         value={toAccountId}
                         onChange={(e) => setToAccountId(Number(e.target.value))}
                         className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156] uppercase"
                       >
                          {accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.banco} ({acc.moneda})</option>
                          ))}
                       </select>
                    </div>
                 </div>

                 <div className="grid grid-cols-3 gap-3 items-start">
                    <div className="col-span-1 space-y-2">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Monto</label>
                       <input 
                         type="number" 
                         value={trfAmount}
                         onChange={(e) => setTrfAmount(Number(e.target.value))}
                         className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156] font-mono" 
                         placeholder="0.00" 
                       />
                    </div>
                    <div className="col-span-1 space-y-2">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Tasa Pacto</label>
                       <input 
                         type="number" 
                         step="0.0001"
                         value={trfRate}
                         onChange={(e) => setTrfRate(Number(e.target.value))}
                         className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156] font-mono" 
                       />
                    </div>
                    <div className="col-span-1 space-y-2">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Tasa BCV</label>
                       <input type="number" readOnly value={bcvRate} step="0.0001" className="w-full bg-white border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-slate-400 outline-none font-mono" />
                    </div>
                 </div>

                 <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex justify-between items-center">
                    <div className="space-y-1">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Monto en Destino:</span>
                       <h2 className={`text-2xl font-black font-mono ${trfFrom === 'VES' ? 'text-green-600' : 'text-[#0b5156]'}`}>
                         {trfFrom === 'VES' ? '$' : 'Bs. '} {resultAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                       </h2>
                    </div>
                    <div className="text-right space-y-1">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Diff. Cambiario:</span>
                       <div className={`text-sm font-black font-mono ${fxDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                         {fxDiff >= 0 ? '+' : ''}{fxDiff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                       </div>
                    </div>
                 </div>

                 <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Referencia / Glosa</label>
                    <input 
                      type="text" 
                      value={concept}
                      onChange={(e) => setConcept(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156]" 
                      placeholder="Ej: Operación de cambio #FX-001" 
                    />
                 </div>

                 <button onClick={handleRegisterTransfer} className="w-full bg-[#0b5156] text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-xl shadow-green-900/20 hover:scale-[1.02] transition-all">
                    Registrar Movimiento
                 </button>
              </div>
           </div>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-5 right-5 bg-slate-900/90 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-xl z-50 border border-slate-700/50 flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-300">
          <span className="text-xs font-black uppercase tracking-wider">🔔 {toast}</span>
        </div>
      )}
    </div>
  );
};

export default InternalTransfers;
