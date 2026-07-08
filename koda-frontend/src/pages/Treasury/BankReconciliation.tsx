import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  CheckCircle2, 
  Search, 
  Filter, 
  ChevronRight,
  Upload,
  Zap,
  X,
  Calendar
} from 'lucide-react';
import { api } from '@/api/client';

const BankReconciliation = () => {
  const [showQuickReg, setShowQuickReg] = useState(false);
  const [selectedMov, setSelectedMov] = useState<any>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const [accountsSummary, setAccountsSummary] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isClosePeriodModalOpen, setIsClosePeriodModalOpen] = useState(false);
  const [isRelacionarModalOpen, setIsRelacionarModalOpen] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState<any>(null);
  const [pendingDocs, setPendingDocs] = useState<any[]>([]);
  const [selectedDocId, setSelectedDocId] = useState('');
  const [searchDocQuery, setSearchDocQuery] = useState('');
  const [toast, setToast] = useState<{message: string, type: 'error' | 'success'} | null>(null);

  const showToast = (message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };
  
  const [periodo, setPeriodo] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const data = await api.get<any>(`/tesoreria/conciliacion?periodo=${periodo}`);
      if (Array.isArray(data)) {
        setMovements(data);
        setAccountsSummary([]);
      } else {
        setMovements(data?.movimientos || []);
        setAccountsSummary(data?.resumen_cuentas || data?.cuentas || []);
      }
    } catch (error) {
      console.error("Error fetching reconciliation:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPendingDocs = async () => {
    try {
      const data = await api.get<any[]>('/tesoreria/conciliacion/pendientes');
      setPendingDocs(data || []);
    } catch (error) {
      console.error("Error fetching pending docs:", error);
    }
  };

  const openRelacionarModal = (mov: any) => {
    setSelectedMovement(mov);
    setSelectedDocId('');
    setSearchDocQuery('');
    fetchPendingDocs();
    setIsRelacionarModalOpen(true);
  };

  const submitRelacionar = async () => {
    if (!selectedMovement || !selectedDocId) return;
    try {
      await api.post('/tesoreria/conciliacion/relacionar', {
        movimiento_id: selectedMovement.id,
        documento_id: selectedDocId
      });
      setIsRelacionarModalOpen(false);
      fetchData(); // reload
    } catch (error) {
      console.error("Error connecting document:", error);
    }
  };

  const submitClosePeriod = async () => {
    setIsClosePeriodModalOpen(false);
    try {
      const res = await api.post<any>('/tesoreria/conciliacion/cerrar', { periodo });
      showToast(res.mensaje || 'Periodo cerrado con éxito.', 'success');
      fetchData();
    } catch (error: any) {
      showToast(error.response?.data?.detail || 'Error al cerrar el periodo', 'error');
    }
  };

  useEffect(() => {
    fetchData();
  }, [periodo]);

  const filteredMovements = useMemo(() => {
    if (!searchQuery.trim()) return movements;
    const q = searchQuery.toLowerCase();
    return movements.filter(m => 
      (m.ref || m.referencia || '').toLowerCase().includes(q) ||
      (m.doc || m.documento || '').toLowerCase().includes(q) ||
      (m.bank || m.banco || '').toLowerCase().includes(q) ||
      (m.type || m.tipo || '').toLowerCase().includes(q)
    );
  }, [movements, searchQuery]);

  const handleQuickReg = (mov: any) => {
    setSelectedMov(mov);
    setShowQuickReg(true);
  };

  const submitQuickReg = async () => {
    try {
      await api.post('/tesoreria/conciliacion/marcar', {
        movimiento_id: selectedMov?.id,
        estado: 'Conciliado'
      });
      alert('Movimiento conciliado exitosamente.');
      setShowQuickReg(false);
      fetchData();
    } catch (error) {
      console.error("Error conciliando movimiento:", error);
      alert('Error al conciliar.');
    }
  };

  const totalMovs = movements.length;
  const conciliados = movements.filter(m => m.status === 'Conciliado' || m.estado === 'Conciliado').length;
  const pendientes = totalMovs - conciliados;
  const diferencias = movements.filter(m => m.status === 'Diferencia' || m.estado === 'Diferencia').length;
  
  const pctConciliado = totalMovs > 0 ? Math.round((conciliados / totalMovs) * 100) : 0;
  
  const montoPorConciliar = movements
    .filter(m => m.status !== 'Conciliado' && m.estado !== 'Conciliado')
    .reduce((sum, m) => sum + Number(m.monto?.replace(/[^0-9.-]+/g,"") || m.amount?.replace(/[^0-9.-]+/g,"") || m.monto || 0), 0);

  const metrics = [
    { label: 'Movimientos', value: totalMovs.toString(), desc: 'Periodo actual', color: 'text-[#0b5156]' },
    { label: 'Conciliados', value: conciliados.toString(), desc: `${pctConciliado}% cruzado`, color: 'text-green-600' },
    { label: 'Pendientes', value: pendientes.toString(), desc: 'Requieren revisión', color: 'text-amber-600' },
    { label: 'Monto x Conciliar', value: `$${montoPorConciliar.toLocaleString('en-US', {minimumFractionDigits: 2})}`, desc: 'Afecta caja real', color: 'text-[#0b5156]' },
  ];

  return (
    <div className="space-y-3 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Finanzas &gt; Tesorería
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase">Conciliación Bancaria</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Cruce de bancos, cobros, pagos y diferencias pendientes.</p>
          </div>
          <div className="flex gap-3">
             <button onClick={() => setIsImportModalOpen(true)} className="bg-white text-[#0b5156] px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <Upload size={14} /> Importar Extracto
             </button>
             <button onClick={() => setIsClosePeriodModalOpen(true)} className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                Cerrar Periodo
             </button>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
        {metrics.map((m, i) => (
          <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">{m.label}</p>
            <div className="space-y-1">
              <strong className={`text-xl font-black ${m.color} tracking-tighter font-mono block leading-none`}>{m.value}</strong>
              <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">{m.desc}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-stretch">
        <section className="lg:col-span-3 space-y-3">
          {/* Main Table */}
          <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-full">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-lg font-black text-[#0b5156] uppercase tracking-tighter leading-none">Movimientos Bancarios</h2>
              <div className="flex gap-2">
                 <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <Calendar size={14} className="text-slate-400" />
                    <input 
                      type="month" 
                      value={periodo} 
                      onChange={(e) => setPeriodo(e.target.value)} 
                      className="bg-transparent text-xs font-bold text-slate-600 uppercase outline-none"
                    />
                 </div>
                 <div className="relative flex items-center">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                    <input 
                      type="text" 
                      placeholder="Referencia..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-8 py-2 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156] w-48" 
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
                        <X size={14} />
                      </button>
                    )}
                 </div>
                 <button className="p-2 bg-slate-50 text-slate-600 rounded-lg border border-slate-200 hover:bg-white">
                    <Filter size={16} />
                 </button>
              </div>
            </div>

            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                    <th className="py-2.5 px-6">FECHA</th>
                    <th className="py-2.5 px-4">BANCO</th>
                    <th className="py-2.5 px-4">REFERENCIA</th>
                    <th className="py-2.5 px-4 text-right">MONTO</th>
                    <th className="py-2.5 px-4">DOC. KODA</th>
                    <th className="py-2.5 px-4 text-center">ESTADO</th>
                    <th className="py-2.5 px-6 text-right">ACCIÓN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Cargando conciliación...
                      </td>
                    </tr>
                  ) : filteredMovements.length > 0 ? filteredMovements.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="py-2.5 px-6 font-mono text-slate-400 font-bold">{row.date || row.fecha}</td>
                      <td className="py-2.5 px-4">
                        <div className="flex flex-col">
                          <span className="font-black text-[11px] text-[#0b5156] uppercase">{row.bank || row.banco}</span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase">{row.sub || row.cuenta}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-mono font-black text-slate-600 uppercase">{row.ref || row.referencia}</td>
                      <td className={`py-2.5 px-4 text-right font-black font-mono ${(row.type || row.tipo) === 'Entrada' ? 'text-green-600' : 'text-[#0b5156]'}`}>
                        {row.amount || row.monto || '$0.00'}
                      </td>
                      <td className="py-2.5 px-4 font-black text-slate-500 uppercase">{row.doc || row.documento}</td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={`${row.statusColor || 'bg-slate-100 text-slate-700'} px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tight`}>
                          {row.status || row.estado}
                        </span>
                      </td>
                      <td className="py-2.5 px-6 text-right">
                        {row.canQuickReg || (row.status || row.estado) === 'Clasificar' ? (
                          <button 
                            onClick={() => handleQuickReg(row)}
                            className="bg-[#0b5156]/10 text-[#0b5156] px-3 py-1.5 rounded-lg text-[10px] font-black uppercase flex items-center gap-1 ml-auto border border-[#0b5156]/20 hover:bg-[#0b5156] hover:text-white transition-all shadow-sm"
                          >
                             <Zap size={10} /> Registro Rápido
                          </button>
                        ) : (
                          <button onClick={() => openRelacionarModal(row)} className="text-[10px] text-[#0b5156] font-black uppercase hover:underline flex items-center gap-1 justify-end ml-auto">
                            Relacionar <ChevronRight size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        No hay movimientos para conciliar
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <aside className="space-y-3">
          <div className="grid grid-cols-1 gap-4">
            <div onClick={() => setSearchQuery(searchQuery === 'Entrada' ? '' : 'Entrada')} className={`rounded-2xl p-4 border transition-all cursor-pointer group ${searchQuery === 'Entrada' ? 'bg-[#0b5156]/10 border-[#0b5156]' : 'bg-slate-50 border-slate-100 hover:border-slate-300'}`}>
              <span className="text-[10px] font-black uppercase bg-white text-amber-600 px-2 py-0.5 rounded shadow-sm border border-amber-100">Cobros</span>
              <h3 className="text-xs font-black text-[#0b5156] mt-3 uppercase tracking-tighter">Entradas sin cliente</h3>
              <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Cruzar con CXC antes de liberar saldo.</p>
            </div>
            <div onClick={() => setSearchQuery(searchQuery === 'Comisión' ? '' : 'Comisión')} className={`rounded-2xl p-4 border transition-all cursor-pointer group ${searchQuery === 'Comisión' ? 'bg-[#0b5156]/10 border-[#0b5156]' : 'bg-slate-50 border-slate-100 hover:border-slate-300'}`}>
              <span className="text-[10px] font-black uppercase bg-white text-blue-500 px-2 py-0.5 rounded shadow-sm border border-blue-50">Comisiones</span>
              <h3 className="text-xs font-black text-slate-600 mt-3 uppercase tracking-tighter">Cargos bancarios</h3>
              <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Deben generar asiento contable hoy.</p>
            </div>
            <div onClick={() => setSearchQuery(searchQuery === 'Transferencia' ? '' : 'Transferencia')} className={`rounded-2xl p-4 border transition-all cursor-pointer group ${searchQuery === 'Transferencia' ? 'bg-[#0b5156]/10 border-[#0b5156]' : 'bg-slate-50 border-slate-100 hover:border-slate-300'}`}>
              <span className="text-[10px] font-black uppercase bg-white text-orange-500 px-2 py-0.5 rounded shadow-sm border border-orange-50">Transferencias</span>
              <h3 className="text-xs font-black text-slate-600 mt-3 uppercase tracking-tighter">Ops. Pendientes</h3>
              <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">Confirmar cuenta origen y destino.</p>
            </div>
          </div>
        </aside>
      </div>

      {/* Account Summary Table */}
      <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tighter leading-none">Resumen por Cuenta</h3>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-2.5 px-6">CUENTA</th>
                <th className="py-2.5 px-4 text-right">SALDO BANCO</th>
                <th className="py-2.5 px-4 text-right">SALDO SISTEMA</th>
                <th className="py-2.5 px-4 text-right">DIFERENCIA</th>
                <th className="py-2.5 px-6 text-center">ESTADO</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {accountsSummary.length > 0 ? accountsSummary.map((row, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 px-6 font-black text-[#0b5156] uppercase">{row.name || row.cuenta}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-black text-slate-500">{row.banco || row.saldo_banco || '$0.00'}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-black text-slate-500">{row.koda || row.saldo_koda || '$0.00'}</td>
                  <td className={`py-2.5 px-4 text-right font-mono font-black ${(row.diff || row.diferencia) === '$0' ? 'text-slate-500' : 'text-red-600'}`}>{row.diff || row.diferencia}</td>
                  <td className="py-2.5 px-6 text-center">
                    <span className={`${row.color || 'bg-amber-100 text-amber-700'} px-2 py-0.5 rounded text-[10px] font-black uppercase`}>{row.status || row.estado}</span>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="py-6 text-center font-bold text-slate-400 text-[10px] uppercase tracking-widest">
                    No hay resumen de cuentas disponible
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Quick Reg Modal */}
      {showQuickReg && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-[#0b5156] text-white rounded-lg"><Zap size={16} /></div>
                <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tight">Registro In-situ</h3>
              </div>
              <button onClick={() => setShowQuickReg(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="p-8 space-y-6">
              <div className="bg-[#0b5156]/5 p-6 rounded-2xl border border-[#0b5156]/10 space-y-3 font-mono">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 uppercase font-black">Origen Banco:</span>
                  <strong className="text-[#0b5156] uppercase font-black">{selectedMov?.bank || selectedMov?.banco}</strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400 uppercase font-black">Monto Detectado:</span>
                  <strong className="text-2xl font-black text-[#0b5156]">{selectedMov?.amount || selectedMov?.monto || '$0.00'}</strong>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Tipo de Operación</label>
                  <select className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156] uppercase">
                    <option>Egreso por Comisión Bancaria</option>
                    <option>Egreso por IGTF / ITF</option>
                    <option>Ingreso por Intereses Ganados</option>
                    <option>Ajuste por Diferencia Menor</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Cuenta Contable (Destino)</label>
                  <select className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156] uppercase">
                    <option>5.1.01.01 - Gastos Bancarios</option>
                    <option>5.1.01.05 - Impuestos Transaccionales</option>
                    <option>4.1.02.01 - Ingresos Financieros</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Observación</label>
                  <input type="text" defaultValue={`Auto-registro de ${selectedMov?.doc || selectedMov?.documento || 'Movimiento'} REF: ${selectedMov?.ref || selectedMov?.referencia}`} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156]" />
                </div>
              </div>

              <div className="p-4 bg-green-50 rounded-xl border border-green-100 flex gap-3">
                <CheckCircle2 size={18} className="text-green-600 shrink-0" />
                <p className="text-[10px] font-bold text-green-700 uppercase leading-relaxed">
                  Al procesar, se generará el documento contable y se marcará el movimiento como "Conciliado" automáticamente.
                </p>
              </div>

              <button onClick={submitQuickReg} className="w-full bg-[#0b5156] text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-xl shadow-green-900/20 hover:scale-[1.02] transition-all">
                Cargar y Conciliar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {isImportModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#0b5156]/10 rounded-xl flex items-center justify-center text-[#0b5156]">
                  <Upload size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tighter leading-none">Importar Extracto</h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Sube el CSV del banco</p>
                </div>
              </div>
              <button onClick={() => setIsImportModalOpen(false)} className="text-slate-400 hover:text-slate-600 bg-white p-2 rounded-xl shadow-sm border border-slate-100"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors cursor-pointer">
                 <Upload size={24} className="mx-auto text-slate-400 mb-2" />
                 <p className="text-xs font-black text-slate-600 uppercase">Haz clic para buscar o arrastra el archivo aquí</p>
                 <p className="text-[10px] font-bold text-slate-400 mt-1">Soporta formato .CSV o .TXT MT940</p>
              </div>
              <button onClick={() => setIsImportModalOpen(false)} className="w-full bg-[#0b5156] text-white py-3 rounded-xl text-xs font-black uppercase shadow-lg hover:bg-[#083a3d] transition-all">Subir y Procesar</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Close Period Modal */}
      {isClosePeriodModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-amber-600 uppercase tracking-tighter leading-none">Cerrar Periodo</h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Confirmar cuadre de caja</p>
                </div>
              </div>
              <button onClick={() => setIsClosePeriodModalOpen(false)} className="text-slate-400 hover:text-slate-600 bg-white p-2 rounded-xl shadow-sm border border-slate-100"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs font-bold text-slate-600 uppercase">¿Estás seguro de cerrar este periodo? Una vez cerrado no se podrán añadir ni modificar movimientos conciliados en esta fecha.</p>
              <div className="flex gap-2">
                 <button onClick={() => setIsClosePeriodModalOpen(false)} className="flex-1 bg-white border border-slate-200 text-slate-600 py-3 rounded-xl text-xs font-black uppercase hover:bg-slate-50 transition-all">Cancelar</button>
                 <button onClick={submitClosePeriod} className="flex-1 bg-amber-600 text-white py-3 rounded-xl text-xs font-black uppercase shadow-lg shadow-amber-900/20 hover:bg-amber-700 transition-all">Confirmar Cierre</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Relacionar Modal */}
      {isRelacionarModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#0b5156]/10 rounded-xl flex items-center justify-center text-[#0b5156]">
                  <Zap size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tighter leading-none">Relacionar Documento</h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Vincular con CXC o CXP</p>
                </div>
              </div>
              <button onClick={() => setIsRelacionarModalOpen(false)} className="text-slate-400 hover:text-slate-600 bg-white p-2 rounded-xl shadow-sm border border-slate-100"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="relative">
                 <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                 <input type="text" placeholder="Buscar por número de factura o monto..." value={searchDocQuery} onChange={(e) => setSearchDocQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black outline-none focus:border-[#0b5156]" />
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                 <div className="p-3 bg-slate-50 border-b border-slate-200 text-xs font-black text-slate-500 uppercase flex justify-between">
                    <span>Documento</span>
                    <span>Monto</span>
                 </div>
                 <div className="divide-y divide-slate-100 max-h-40 overflow-y-auto">
                    {pendingDocs.length > 0 ? pendingDocs.map((doc, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => setSelectedDocId(doc.id)}
                        className={`p-3 flex justify-between items-center cursor-pointer transition-colors ${selectedDocId === doc.id ? 'bg-[#0b5156]/10' : 'hover:bg-slate-50'}`}
                      >
                         <span className="text-xs font-black text-[#0b5156] uppercase">{doc.label}</span>
                         <span className="text-xs font-bold text-slate-600">{doc.monto}</span>
                      </div>
                    )) : (
                      <div className="p-3 text-center text-xs font-bold text-slate-400">No hay documentos pendientes.</div>
                    )}
                 </div>
              </div>
              <button 
                onClick={submitRelacionar} 
                disabled={!selectedDocId}
                className={`w-full text-white py-3 rounded-xl text-xs font-black uppercase shadow-lg transition-all ${selectedDocId ? 'bg-[#0b5156] hover:bg-[#083a3d]' : 'bg-slate-300 cursor-not-allowed'}`}
              >
                Confirmar Vínculo
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Toast Notification */}
      {toast && typeof document !== 'undefined' && createPortal(
        <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-bottom-5">
          <div className={`px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 ${toast.type === 'success' ? 'bg-[#0b5156] border border-[#0b5156]/20 text-white' : 'bg-red-600 border border-red-500 text-white'}`}>
            {toast.type === 'success' ? <CheckCircle2 size={20} /> : <Zap size={20} />}
            <span className="font-bold text-sm tracking-wide uppercase font-mono">{toast.message}</span>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default BankReconciliation;
