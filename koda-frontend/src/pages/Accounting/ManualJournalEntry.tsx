import { 
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Info,
  Calendar,
  FileText,
  Zap,
  ShieldAlert
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState, useMemo, useEffect } from 'react';
import { api } from '@/api/client';
import { createPortal } from 'react-dom';

interface JournalLine {
  id: string;
  accountId: string;
  accountName: string;
  accountType: string;
  balance: number;
  costCenter: string;
  debit: number;
  credit: number;
}

const ManualJournalEntry = () => {
  const navigate = useNavigate();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<JournalLine[]>([
    { id: '1', accountId: '', accountName: '', accountType: '', balance: 0, costCenter: '', debit: 0, credit: 0 }
  ]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const fetchAccountsAndCostCenters = async () => {
      try {
        const [resAccs, resCCs] = await Promise.all([
          api.get<any[]>('/contabilidad/cuentas?activas=true'),
          api.get<any[]>('/contabilidad/centros-costo')
        ]);
        setAccounts(resAccs || []);
        setCostCenters(resCCs || []);
      } catch (err) {
        console.error("Error fetching accounts or cost centers:", err);
      }
    };
    fetchAccountsAndCostCenters();
  }, []);

  const totals = useMemo(() => {
    const debits = lines.reduce((acc, line) => acc + (line.debit || 0), 0);
    const credits = lines.reduce((acc, line) => acc + (line.credit || 0), 0);
    const diff = Math.abs(debits - credits);
    return { debits, credits, diff };
  }, [lines]);

  const handleAddLine = () => {
    setLines([...lines, { 
      id: Math.random().toString(36).substr(2, 9),
      accountId: '', accountName: '', accountType: '', balance: 0, costCenter: '', debit: 0, credit: 0 
    }]);
  };

  const handleRemoveLine = (id: string) => {
    if (lines.length > 1) {
      setLines(lines.filter(l => l.id !== id));
    }
  };

  const handleUpdateLine = (id: string, updates: Partial<JournalLine>) => {
    setLines(lines.map(l => {
      if (l.id === id) {
        if (updates.accountId) {
          const acc = accounts.find(a => a.id === updates.accountId);
          return { ...l, ...updates, accountType: acc?.tipo || '', balance: acc?.saldo || 0, accountName: acc?.nombre || '' };
        }
        return { ...l, ...updates };
      }
      return l;
    }));
  };

  const handleSave = async () => {
    setErrorMsg(null);
    if (!description.trim()) {
      setErrorMsg("Debe ingresar una descripción general para el asiento.");
      return;
    }

    const invalidLines = lines.filter(l => !l.accountId || (l.debit === 0 && l.credit === 0));
    if (invalidLines.length > 0) {
      setErrorMsg("Todas las líneas deben tener una cuenta seleccionada y un monto mayor a 0.");
      return;
    }

    if (totals.diff > 0.01) {
      setErrorMsg("Error de Partida Doble: El asiento debe estar cuadrado.");
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        concepto: description,
        referencia: `AJU-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
        lineas: lines.map(l => ({
          cuenta_codigo: l.accountId,
          cuenta_nombre: l.accountName,
          debe: l.debit || 0,
          haber: l.credit || 0,
          centro_costo: l.costCenter || null
        }))
      };

      await api.post('/contabilidad/asientos', payload);
      showNotification("Asiento guardado exitosamente.", "success");
      setTimeout(() => {
        navigate('/contabilidad/diario');
      }, 1500);
    } catch (error: any) {
      console.error("Error guardando asiento:", error);
      setErrorMsg(error.message || "Error al guardar el asiento. Verifique los datos e intente nuevamente.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-2 animate-in fade-in duration-500 pb-4">
      {/* Header */}
      <header className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <Link to="/contabilidad/diario" className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-[#0b5156]/20 transition-all">
                <ArrowLeft size={10} /> Volver
              </Link>
              <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Contabilidad &gt; Transacciones
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Nuevo Asiento Manual</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Registro de ajustes, depreciaciones y movimientos no automatizados.</p>
          </div>
          <div className="flex gap-2">
             <button 
              onClick={handleSave}
              disabled={isSaving}
              className="bg-[#0b5156] text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all disabled:opacity-50"
             >
                <Save size={14} /> {isSaving ? 'Guardando...' : 'Guardar Asiento Diario'}
             </button>
             <button 
              onClick={() => navigate('/contabilidad/diario')}
              className="bg-white text-slate-500 px-6 py-2 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-slate-50 transition-all"
             >
                Cancelar
             </button>
          </div>
        </div>
        
        {errorMsg && (
          <div className="mt-3 p-3 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-200 flex items-center gap-2">
            <AlertTriangle size={14} />
            {errorMsg}
          </div>
        )}
      </header>

      {/* Main Info Card */}
      <article className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
           <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                 <Calendar size={12} /> Fecha del Movimiento
              </label>
              <input 
                type="date" 
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156] transition-all" 
              />
           </div>
           <div className="md:col-span-2 space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                 <FileText size={12} /> Descripción General / Glosa
              </label>
              <input 
                type="text" 
                placeholder="Ej: Ajuste por depreciación de activos fijos..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156] transition-all" 
              />
           </div>
        </div>
      </article>

      {/* Lines Table */}
      <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
         <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
               <thead>
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                     <th className="py-2.5 px-4 w-[350px]">Cuenta Contable</th>
                     <th className="py-2.5 px-4 w-[200px]">Centro de Costo</th>
                     <th className="py-2.5 px-4 text-right">Debe</th>
                     <th className="py-2.5 px-4 text-right">Haber</th>
                     <th className="py-2.5 px-4 w-20"></th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-50 text-xs">
                  {lines.map((line) => (
                    <tr key={line.id} className="group hover:bg-slate-50/30 transition-colors">
                       <td className="py-2 px-4">
                          <div className="space-y-1">
                             <select 
                               value={line.accountId}
                               onChange={(e) => handleUpdateLine(line.id, { accountId: e.target.value })}
                               className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-[11px] font-black text-[#0b5156] outline-none focus:border-[#0b5156] transition-all"
                             >
                                 <option value="" disabled>Seleccione cuenta...</option>
                                 {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.id} - {acc.nombre}</option>
                                 ))}
                             </select>
                             {line.accountId && (
                               <div className="flex items-center gap-2 px-1">
                                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Saldo Actual:</span>
                                  <strong className="text-[9px] font-black text-[#0b5156]">Bs. {line.balance.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
                               </div>
                             )}
                          </div>
                       </td>
                       <td className="py-2 px-4">
                          <select 
                            value={line.costCenter}
                            onChange={(e) => handleUpdateLine(line.id, { costCenter: e.target.value })}
                            disabled={!line.accountType || (line.accountType.toLowerCase() !== 'gasto' && line.accountType.toLowerCase() !== 'ingreso')}
                            className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-[11px] font-black text-[#0b5156] outline-none focus:border-[#0b5156] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                             <option value="">N/A</option>
                             {costCenters.map(cc => (
                                <option key={cc.codigo} value={cc.codigo}>{cc.codigo} - {cc.nombre}</option>
                             ))}
                          </select>
                       </td>
                       <td className="py-2 px-4">
                          <input 
                            type="number" 
                            step="0.01"
                            value={line.debit === 0 ? '' : line.debit}
                            onChange={(e) => handleUpdateLine(line.id, { debit: parseFloat(e.target.value) || 0 })}
                            className="w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-[#0b5156] text-right text-xs font-black font-mono text-slate-700 outline-none transition-all"
                            placeholder="0.00"
                          />
                       </td>
                       <td className="py-2 px-4">
                          <input 
                            type="number" 
                            step="0.01"
                            value={line.credit === 0 ? '' : line.credit}
                            onChange={(e) => handleUpdateLine(line.id, { credit: parseFloat(e.target.value) || 0 })}
                            className="w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-[#0b5156] text-right text-xs font-black font-mono text-slate-700 outline-none transition-all"
                            placeholder="0.00"
                          />
                       </td>
                       <td className="py-2 px-4 text-right">
                          <button 
                            onClick={() => handleRemoveLine(line.id)}
                            className="p-1.5 text-slate-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                          >
                             <Trash2 size={14} />
                          </button>
                       </td>
                    </tr>
                  ))}
               </tbody>
            </table>
         </div>

         <div className="p-3 bg-slate-50/50 border-t border-slate-100">
            <button 
              onClick={handleAddLine}
              className="px-6 py-2 bg-white border border-slate-200 text-[#0b5156] rounded-xl text-[10px] font-black uppercase hover:bg-[#0b5156]/5 transition-all flex items-center gap-2 shadow-sm"
            >
               <Plus size={14} /> Añadir Línea de Asiento
            </button>
         </div>

         {/* Totals Panel */}
         <div className="p-4 bg-[#0b5156] text-white flex justify-end gap-12 items-center">
            <div className="text-right">
               <span className="text-[10px] font-black text-white/40 uppercase tracking-widest block">Total Debe</span>
               <strong className="text-base font-black font-mono leading-none">Bs. {totals.debits.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
            </div>
            <div className="text-right">
               <span className="text-[10px] font-black text-white/40 uppercase tracking-widest block">Total Haber</span>
               <strong className="text-base font-black font-mono leading-none">Bs. {totals.credits.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
            </div>
            <div className={`text-right pl-12 border-l border-white/10 ${totals.diff > 0.01 ? 'text-red-400' : 'text-green-400'}`}>
               <div className="flex items-center gap-2 justify-end mb-1">
                  {totals.diff > 0.01 ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                  <span className="text-[10px] font-black uppercase tracking-widest block">Diferencia</span>
               </div>
               <strong className="text-lg font-black font-mono leading-none tracking-tighter">
                  Bs. {totals.diff.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
               </strong>
            </div>
         </div>
      </article>

      {/* Help Panel */}
      <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 flex gap-3">
         <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
         <div className="space-y-0.5">
            <h4 className="text-xs font-black text-blue-900 uppercase tracking-tight">Reglas de Registro Diario</h4>
            <p className="text-[9px] font-bold text-blue-800/60 uppercase leading-relaxed">
               Las cuentas de ingresos y egresos requieren obligatoriamente un <strong>Centro de Costo</strong>. El sistema no permitirá guardar asientos descuadrados para mantener la integridad de la partida doble.
            </p>
         </div>
      </div>

      {/* Toast Notification */}
      {toast && typeof document !== 'undefined' && createPortal(
        <div className="fixed bottom-5 right-5 z-[9999] animate-in fade-in slide-in-from-bottom duration-300">
          <div className={`px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border ${toast.type === 'success' ? 'bg-[#0b5156] border-[#0b5156]/20 text-white' : 'bg-red-600 border-red-500 text-white'}`}>
            {toast.type === 'success' ? <Zap size={20} /> : <ShieldAlert size={20} />}
            <span className="font-bold text-xs tracking-wide uppercase font-mono">{toast.message}</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ManualJournalEntry;
