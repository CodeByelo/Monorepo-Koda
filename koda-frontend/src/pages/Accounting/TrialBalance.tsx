import { 
  ArrowLeft,
  Printer,
  Search,
  Filter,
  Maximize2,
  Minimize2,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { api } from '@/api/client';
import { createPortal } from 'react-dom';

const TrialBalance = () => {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [trialData, setTrialData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [lectura, setLectura] = useState<any[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchTrialBalance = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<any>(`/contabilidad/balance-comprobacion?periodo=${periodo}`);
      setTrialData(res?.cuentas || res?.lineas || (Array.isArray(res) ? res : []));
      setLectura(res?.lectura || []);
    } catch (error) {
      console.error("Error fetching trial balance:", error);
      setTrialData([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrialBalance();
  }, [periodo]);

  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return trialData;
    const q = searchQuery.toLowerCase();
    return trialData.filter(r => 
      r.cuenta_codigo?.toLowerCase().includes(q) || 
      r.codigo?.toLowerCase().includes(q) || 
      r.nombre?.toLowerCase().includes(q) ||
      r.grupo?.toLowerCase().includes(q)
    );
  }, [trialData, searchQuery]);

  const totals = useMemo(() => {
    const totalDebits = filteredData.reduce((acc, row) => acc + (parseFloat(row.debitos || row.debe) || 0), 0);
    const totalCredits = filteredData.reduce((acc, row) => acc + (parseFloat(row.creditos || row.haber) || 0), 0);
    const diff = Math.abs(totalDebits - totalCredits);
    return {
      debits: totalDebits,
      credits: totalCredits,
      diff: diff,
      cuentasRev: filteredData.filter(r => parseFloat(r.debitos || r.debe) > 0 || parseFloat(r.creditos || r.haber) > 0).length,
      pendientes: filteredData.filter(r => r.estatus === 'Revisar' || r.estatus === 'Conciliar' || r.estado === 'Revisar').length
    };
  }, [filteredData]);

  const formatCurrency = (val: number | string | undefined | null) => {
    if (val === undefined || val === null) return "0.00";
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return "0.00";
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const metrics = [
    { label: 'Total Débitos', value: `Bs. ${formatCurrency(totals.debits)}`, desc: 'Periodo actual', color: 'text-slate-800' },
    { label: 'Total Créditos', value: `Bs. ${formatCurrency(totals.credits)}`, desc: 'Balanceado', color: 'text-slate-800' },
    { label: 'Diferencia', value: `Bs. ${formatCurrency(totals.diff)}`, desc: totals.diff > 0.01 ? 'Descuadre detectado' : 'Sin descuadre', color: totals.diff > 0.01 ? 'text-red-600' : 'text-green-600' },
    { label: 'Cuentas Revisadas', value: totals.cuentasRev.toString(), desc: 'Con movimiento', color: 'text-[#0b5156]' },
    { label: 'Pendientes', value: totals.pendientes.toString(), desc: 'Validar antes de cierre', color: totals.pendientes > 0 ? 'text-amber-600' : 'text-green-600' },
  ];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 print:bg-white print:p-0">
      {/* Header */}
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden print:hidden">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <Link to="/contabilidad" className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-[#0b5156]/20 transition-all">
                <ArrowLeft size={10} /> Volver
              </Link>
              <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Contabilidad
              </span>
            </div>
            <h1 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Balance de Comprobación</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Validación de saldos, débitos, créditos, diferencias y cuentas por revisar antes del cierre.</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end items-center">
             <div className="mr-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Período</label>
                <input 
                  type="month" 
                  value={periodo} 
                  onChange={(e) => setPeriodo(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156]" 
                />
             </div>
             <button onClick={() => showToast("El manual de opciones contables está en desarrollo y se incluirá en la próxima actualización.", "error")} className="bg-white text-[#0b5156] px-4 py-2 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                📘 Manual de Opción
             </button>
             <button onClick={handlePrint} className="bg-[#0b5156] text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <Printer size={14} /> Imprimir Balance
             </button>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse bg-white rounded-3xl border border-slate-200">
          Cargando Balance de Comprobación...
        </div>
      ) : (
        <>
          {/* Metrics Grid */}
          <section className="grid grid-cols-2 md:grid-cols-5 gap-4 items-start print:hidden">
            {metrics.map((m, i) => (
              <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-32">
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{m.label}</span>
                 <div className="space-y-1">
                   <strong className={`text-2xl font-black ${m.color} tracking-tighter font-mono`}>{m.value}</strong>
                   <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">{m.desc}</p>
                 </div>
              </div>
            ))}
          </section>

          {/* Analysis Grid */}
          <div className="grid grid-cols-1 gap-6 items-start print:hidden">
            <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
               <div className="mb-6">
                  <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter leading-none">Lectura del Balance</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight mt-1">Cuentas y saldos que requieren atención antes de cerrar el periodo.</p>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                  {((lectura && lectura.length > 0) ? lectura : [
                    { label: 'Cuadre', title: 'Balance Cuadrado', desc: 'Débitos y créditos coinciden en el periodo revisado.', color: 'bg-green-500' },
                    { label: 'Bancos', title: 'Movimientos x Conciliar', desc: 'La cuenta bancos debe validarse contra conciliación bancaria.', color: 'bg-amber-500' },
                    { label: 'Inventario', title: 'Ajustes Pendientes', desc: 'Requieren soporte físico y revisión de auditoría.', color: 'bg-amber-500' },
                    { label: 'Fiscal', title: 'IVA en Validación', desc: 'Debe coincidir con facturación, notas y obligaciones.', color: 'bg-blue-500' },
                  ]).map((item, i) => (
                    <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                       <span className={`${item.color} text-white text-[8px] font-black px-2 py-0.5 rounded uppercase`}>{item.label}</span>
                       <h3 className="text-xs font-black text-[#0b5156] uppercase tracking-tight leading-none">{item.title}</h3>
                       <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">{item.desc}</p>
                    </div>
                  ))}
               </div>
            </article>
          </div>

          {/* Main Table */}
          <article className={`bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-500 print:shadow-none print:border-none print:rounded-none ${isFullScreen ? 'fixed inset-0 z-[100] m-4 rounded-[2.5rem]' : 'relative'}`}>
            <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/30 print:hidden">
              <div className="space-y-1">
                <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter leading-none">Balance de Comprobación</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Saldos iniciales, movimientos del periodo y saldos finales.</p>
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                 <button 
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  className="p-2 bg-white text-[#0b5156] rounded-lg border border-slate-200 hover:bg-[#0b5156]/5 shadow-sm transition-all flex items-center gap-2"
                  title={isFullScreen ? "Salir de Pantalla Completa" : "Ver en Pantalla Completa"}
                 >
                    {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    <span className="text-[10px] font-black uppercase">{isFullScreen ? 'Reducir' : 'Pantalla Completa'}</span>
                 </button>
                 <div className="relative flex-1 md:flex-none">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                    <input 
                      type="text" 
                      placeholder="Buscar cuenta..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full md:w-64 bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156] shadow-sm" 
                    />
                 </div>
                 <button className="p-2 bg-white text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-50 shadow-sm transition-all">
                    <Filter size={16} />
                 </button>
              </div>
            </div>

            <div className={`overflow-x-auto print:overflow-visible ${isFullScreen ? 'h-[calc(100vh-200px)]' : ''}`}>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50 print:bg-white print:text-black print:border-black">
                    <th className="py-4 px-8">Cuenta / Grupo</th>
                    <th className="py-4 px-4">Nombre de la Cuenta</th>
                    <th className="py-4 px-4 text-right">Saldo Inicial</th>
                    <th className="py-4 px-4 text-right">Débitos</th>
                    <th className="py-4 px-4 text-right">Créditos</th>
                    <th className="py-4 px-4 text-right">Saldo Final</th>
                    <th className="py-4 px-8 text-center print:hidden">Estatus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-[11px] print:divide-slate-200">
                  {filteredData.length > 0 ? filteredData.map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors group print:text-black">
                      <td className="py-4 px-8">
                        <div className="flex flex-col">
                           <strong className="text-[#0b5156] font-mono text-xs print:text-black">{row.cuenta_codigo || row.codigo || row.code}</strong>
                           <span className="text-[9px] font-bold text-slate-400 uppercase print:text-slate-600">{row.grupo || row.group || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 font-black text-slate-700 uppercase print:text-black">{row.nombre || row.name}</td>
                      <td className="py-4 px-4 text-right font-mono text-slate-500 font-bold print:text-black">{formatCurrency(row.saldo_inicial || row.initial)}</td>
                      <td className="py-4 px-4 text-right font-mono text-[#0b5156] font-black print:text-black">{formatCurrency(row.debitos || row.debe || row.debits)}</td>
                      <td className="py-4 px-4 text-right font-mono text-red-600 font-black print:text-black">{formatCurrency(row.creditos || row.haber || row.credits)}</td>
                      <td className="py-4 px-4 text-right font-mono text-slate-800 font-black text-xs print:text-black">{formatCurrency(row.saldo_final || row.final)}</td>
                      <td className="py-4 px-8 text-center print:hidden">
                        <span className={`${row.estatus === 'Revisar' || row.estado === 'Revisar' || row.status === 'Revisar' ? 'bg-red-100 text-red-700' : row.estatus === 'Conciliar' || row.status === 'Conciliar' ? 'bg-amber-100 text-amber-700' : row.estatus === 'Abierta' || row.status === 'Abierta' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight`}>
                          {row.estatus || row.estado || row.status || 'Normal'}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                        No se encontraron cuentas con saldo
                      </td>
                    </tr>
                  )}
                  {filteredData.length > 0 && (
                    <tr className="bg-slate-50 border-t-2 border-[#0b5156] print:border-black print:bg-white">
                       <td colSpan={3} className="py-4 px-8 text-right font-black uppercase text-[#0b5156] text-xs print:text-black">TOTALES:</td>
                       <td className="py-4 px-4 text-right font-mono text-[#0b5156] font-black text-sm print:text-black">{formatCurrency(totals.debits)}</td>
                       <td className="py-4 px-4 text-right font-mono text-red-600 font-black text-sm print:text-black">{formatCurrency(totals.credits)}</td>
                       <td className="py-4 px-4 text-right font-mono text-slate-800 font-black text-sm print:text-black"></td>
                       <td className="print:hidden"></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          {/* Verification Footer */}
          <div className="p-6 bg-white rounded-[2.5rem] border border-slate-200 text-slate-800 flex justify-between items-center shadow-xl relative overflow-hidden group print:hidden">
            <div className="relative z-10 flex items-center gap-6">
              <div className={`${totals.diff > 0.01 ? 'bg-red-500/10 border-red-500/20' : 'bg-green-500/10 border-green-500/20'} p-4 rounded-3xl border`}>
                {totals.diff > 0.01 ? <AlertTriangle size={32} className="text-red-600" /> : <ShieldCheck size={32} className="text-green-600" />}
              </div>
              <div className="space-y-1">
                <h4 className={`text-xl font-black ${totals.diff > 0.01 ? 'text-red-700' : 'text-[#0b5156]'} uppercase tracking-tighter leading-none`}>
                  {totals.diff > 0.01 ? 'Error de Partida Doble' : 'Verificación de Totales'}
                </h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {totals.diff > 0.01 ? `Descuadre detectado: Bs. ${formatCurrency(totals.diff)}` : 'El balance cumple con la partida doble del periodo fiscal actual.'}
                </p>
              </div>
            </div>
            <div className="relative z-10 flex gap-8 px-8 border-l border-slate-100">
               <div className="text-right">
                  <span className="text-[9px] font-black text-slate-400 uppercase block">Total Movimientos</span>
                  <strong className="text-xl font-black text-slate-800 font-mono">Bs. {formatCurrency(totals.debits)}</strong>
               </div>
               <div className="text-right">
                  <span className="text-[9px] font-black text-slate-400 uppercase block">Estado</span>
                  <strong className={`text-xl font-black ${totals.diff > 0.01 ? 'text-red-600' : 'text-green-600'} uppercase tracking-tight`}>
                    {totals.diff > 0.01 ? 'Descuadrado' : 'Cuadrado'}
                  </strong>
               </div>
            </div>
            <div className={`absolute right-0 bottom-0 w-64 h-64 ${totals.diff > 0.01 ? 'bg-red-50 group-hover:bg-red-100' : 'bg-slate-50 group-hover:bg-green-50'} rounded-full blur-3xl transition-all`}></div>
          </div>
        </>
      )}
      {toast && typeof document !== 'undefined' && createPortal(
        <div className="fixed bottom-6 right-6 z-[300] flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-300">
          <div className={`px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border ${toast.type === 'success' ? 'bg-[#0b5156] border-[#0b5156]/20 text-white' : 'bg-red-600 border-red-500 text-white'}`}>
            {toast.type === 'success' ? <ShieldCheck size={20} /> : <AlertTriangle size={20} />}
            <span className="font-bold text-xs tracking-wide uppercase font-mono">{toast.message}</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default TrialBalance;
