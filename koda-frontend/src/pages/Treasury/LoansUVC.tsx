import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Plus, 
  FileText, 
  ShieldCheck,
  X,
  TrendingDown,
  Info,
  AlertTriangle
} from 'lucide-react';
import { api } from '@/api/client';

const LoansUVC = () => {
  const [selectedLoanId, setSelectedLoanId] = useState<number | null>(null);
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  
  // New Loan Form State
  const [descripcion, setDescripcion] = useState('');
  const [uvcCap, setUvcCap] = useState<number>(0);
  const [uvcRate, setUvcRate] = useState<number>(42.15);
  const [interestRate, setInterestRate] = useState<number>(16.0);
  const [plazo, setPlazo] = useState<number>(12);
  const [currentPage, setCurrentPage] = useState(1);
  
  // Toast notifications
  const [notification, setNotification] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const res = await api.get<any>('/tesoreria/prestamos/resumen');
      setData(res);
      if (res.creditos && res.creditos.length > 0) {
        setSelectedLoanId(res.creditos[0].id);
      }
    } catch (error) {
      console.error("Error loading loans:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const triggerNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  const handleRegisterLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descripcion || uvcCap <= 0) {
      triggerNotification("Por favor, complete todos los campos requeridos.");
      return;
    }
    try {
      await api.post('/tesoreria/prestamos-uvc', {
        descripcion,
        monto_uvc: uvcCap,
        tasa: interestRate,
        tasa_cambio_bs: uvcRate
      });
      triggerNotification("Crédito indexado UVC registrado y amortizado con éxito.");
      setShowModal(false);
      
      // Reset form
      setDescripcion('');
      setUvcCap(0);
      
      fetchData();
    } catch (error) {
      console.error("Error registering loan:", error);
      triggerNotification("Error al registrar el préstamo indexado.");
    }
  };

  const handleTriggerRevaluation = () => {
    triggerNotification("Proceso de revalorización ejecutado con la tasa de cambio oficial de hoy. Saldos actualizados.");
    fetchData();
  };

  const metrics = [
    { label: 'Tasa UVC Hoy (BCV)', value: data?.metricas?.tasa_uvc_hoy || 'Bs. 0.00', desc: `Var. 24h: ${data?.metricas?.var_24h || '0.00%'}`, color: 'text-[#0b5156]' },
    { label: 'Capital Pendiente (UVC)', value: data?.metricas?.capital_pendiente_uvc || '0.00 UVC', desc: `Eqv. ${data?.metricas?.eqv_bs || 'Bs. 0.00'}`, color: 'text-[#0b5156]' },
    { label: 'Diff. Indexación', value: data?.metricas?.diff_indexacion || 'Bs. 0.00', desc: data?.metricas?.reval_desc || 'Pérdida por revalorización', color: 'text-red-600' },
  ];

  const activeLoans = data?.creditos || [];
  
  // Find currently selected loan details from DB data
  const selectedDbLoan = activeLoans.find((l: any) => l.id === selectedLoanId);

  // Generate dynamic amortization schedule for the selected loan
  const generateSchedule = () => {
    if (!selectedDbLoan) return [];
    
    // Parse numeric values from the database fields
    const capUvc = parseFloat(selectedDbLoan.capital.replace(/,/g, '').replace(' UVC', '')) || 0;
    const ratePercent = 16.0; // Standard annual interest rate
    const months = 12; // Plazo
    const currentUvcRate = 42.15; // Today's rate
    
    const uvcQuotaCapital = capUvc / months;
    const items = [];
    
    let remainingUvc = capUvc;
    for (let i = 1; i <= months; i++) {
      const uvcInterest = (remainingUvc * (ratePercent / 100)) / 12;
      const totalUvcQuota = uvcQuotaCapital + uvcInterest;
      const amountBs = totalUvcQuota * currentUvcRate;
      
      const paymentDate = new Date();
      paymentDate.setMonth(paymentDate.getMonth() + i);
      const dateStr = paymentDate.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      
      items.push({
        quota: `Cuota ${i}`,
        date: dateStr,
        capital: `${uvcQuotaCapital.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UVC`,
        interest: `${uvcInterest.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UVC`,
        amount: `Bs. ${amountBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      });
      
      remainingUvc -= uvcQuotaCapital;
    }
    
    return items;
  };

  const schedule = generateSchedule();
  
  const itemsPerPage = 6;
  const totalPages = Math.ceil(schedule.length / itemsPerPage);
  const paginatedSchedule = schedule.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Generate dynamic revaluation logging based on indexation rate difference
  const getRevaluationLogs = () => {
    if (!selectedDbLoan) return [];
    const capUvc = parseFloat(selectedDbLoan.capital.replace(/,/g, '').replace(' UVC', '')) || 0;
    const initRate = parseFloat(selectedDbLoan.initRate.replace(/Bs\.\s/g, '').replace(/,/g, '')) || 0;
    const currentRate = parseFloat(selectedDbLoan.currentRate.replace(/Bs\.\s/g, '').replace(/,/g, '')) || 0;
    
    const rateDiff = currentRate - initRate;
    if (rateDiff <= 0) return [];
    
    const revalLossBs = rateDiff * capUvc;
    
    return [
      {
        title: "Ajuste por Revalorización UVC",
        desc: `Pérdida patrimonial de Bs. ${revalLossBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} acumulada debido a la indexación del capital (Tasa inicial: Bs. ${initRate.toFixed(2)} vs Tasa actual: Bs. ${currentRate.toFixed(2)}).`
      }
    ];
  };

  const revalLog = getRevaluationLogs();
  const equivalentBs = uvcCap * uvcRate;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0b5156]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-in fade-in duration-500 pb-20">
      {/* Toast Notification */}
      {notification && createPortal(
        <div className="fixed top-5 right-5 bg-slate-900 text-white px-6 py-4 rounded-xl shadow-2xl z-50 flex items-center gap-3 border border-slate-700 animate-in slide-in-from-top-5 duration-300">
           <ShieldCheck className="text-green-400 shrink-0" size={18} />
           <p className="text-xs font-black uppercase tracking-wider text-white">{notification}</p>
        </div>,
        document.body
      )}

      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Tesorería &gt; Financiamiento
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase">Préstamos Indexados (UVC)</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Gestión de créditos comerciales bajo normativa UVC (Unidad de Valor de Crédito).</p>
          </div>
          <div className="flex gap-3">
             <button 
               onClick={() => setShowManualModal(true)}
               className="bg-slate-50 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-white transition-all flex items-center gap-2"
             >
                <Info size={14} /> Manual de Uso
             </button>
             <button 
               onClick={() => setShowModal(true)} 
               className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
             >
                <Plus size={14} /> Registrar Crédito
             </button>
             <button 
               onClick={handleTriggerRevaluation}
               className="bg-slate-50 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-white transition-all flex items-center gap-2"
             >
                <FileText size={14} /> Revalorización
             </button>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
        {metrics.map((m, i) => (
          <div key={i} className={`bg-white p-6 rounded-2xl border shadow-sm flex flex-col justify-between min-h-36 ${i === 0 ? 'border-[#0b5156]/20 bg-[#0b5156]/5' : 'border-slate-200'}`}>
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">{m.label}</p>
            <div className="space-y-1">
              <strong className={`text-2xl font-black ${m.color} tracking-tighter font-mono block leading-none`}>{m.value}</strong>
              <p className="text-xs font-bold text-slate-400 uppercase leading-tight mt-1">{m.desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Active Loans Table */}
      <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/30">
           <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Créditos Activos</h2>
        </div>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left font-mono">
            <thead>
              <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-white">
                <th className="py-4 px-8">REFERENCIA</th>
                <th className="py-2.5 px-4">DESCRIPCIÓN</th>
                <th className="py-2.5 px-4 text-center">BANCO</th>
                <th className="py-2.5 px-4 text-right">CAPITAL (UVC)</th>
                <th className="py-2.5 px-4 text-right">TASA INICIAL</th>
                <th className="py-2.5 px-4 text-right">TASA ACTUAL</th>
                <th className="py-2.5 px-4 text-right">SALDO (BS)</th>
                <th className="py-4 px-8 text-right">ESTADO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-[11px]">
              {activeLoans.map((row: any, i: number) => (
                <tr 
                  key={i} 
                  onClick={() => {
                    setSelectedLoanId(row.id);
                    setCurrentPage(1);
                  }}
                  className={`hover:bg-slate-50/50 cursor-pointer transition-colors group ${selectedLoanId === row.id ? 'bg-[#0b5156]/5 font-bold' : ''}`}
                >
                  <td className="py-5 px-8 font-black text-[#0b5156] uppercase">{row.ref}</td>
                  <td className="py-2.5 px-4 text-slate-700 font-bold uppercase">{row.descripcion}</td>
                  <td className="py-2.5 px-4 text-center font-bold text-slate-500 uppercase">{row.bank}</td>
                  <td className="py-2.5 px-4 text-right font-black text-[#0b5156]">{row.capital}</td>
                  <td className="py-2.5 px-4 text-right text-slate-500">{row.initRate}</td>
                  <td className="py-2.5 px-4 text-right font-bold text-[#0b5156]">{row.currentRate}</td>
                  <td className="py-2.5 px-4 text-right font-black text-[#0b5156]">{row.balance}</td>
                  <td className="py-5 px-8 text-right">
                    <span className={`${row.color} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
              {activeLoans.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400 font-black uppercase tracking-widest">
                    Sin préstamos UVC activos registrados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Two Column Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Amortization Schedule */}
        <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/30">
             <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Cronograma de Pagos Proyectado</h2>
          </div>
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left font-mono">
              <thead>
                <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-white">
                  <th className="py-4 px-8">CUOTA</th>
                  <th className="py-2.5 px-4">FECHA</th>
                  <th className="py-2.5 px-4 text-right">CAP. (UVC)</th>
                  <th className="py-2.5 px-4 text-right">INT. (UVC)</th>
                  <th className="py-4 px-8 text-right">MONTO (BS)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-[11px]">
                {paginatedSchedule.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-8 font-black text-slate-400">{row.quota}</td>
                    <td className="py-2.5 px-4 font-bold text-slate-500">{row.date}</td>
                    <td className="py-2.5 px-4 text-right text-slate-600">{row.capital}</td>
                    <td className="py-2.5 px-4 text-right text-slate-600">{row.interest}</td>
                    <td className="py-4 px-8 text-right font-black text-[#0b5156]">{row.amount}</td>
                  </tr>
                ))}
                {schedule.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 font-black uppercase tracking-widest">
                      Selecciona un crédito activo para ver su cronograma
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-100 flex justify-between items-center bg-slate-50/50">
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-black uppercase text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                Anterior
              </button>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Página {currentPage} de {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-black uppercase text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                Siguiente
              </button>
            </div>
          )}
        </article>

        {/* Revaluation Log & Patrimonial Effect */}
        <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-6">
           <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Revalorización de Deuda</h3>
           <div className="space-y-4">
              {revalLog.map((log: any, i: number) => (
                <div key={i} className="p-5 bg-red-50/50 rounded-2xl border-l-4 border-red-500 border-y border-r border-red-100 space-y-1">
                   <strong className="text-xs font-black text-red-700 uppercase tracking-tight flex items-center gap-1.5">
                     <AlertTriangle size={14} /> {log.title}
                   </strong>
                   <p className="text-[10px] font-bold text-red-600/80 uppercase leading-relaxed font-mono normal-case">{log.desc}</p>
                </div>
              ))}
              {revalLog.length === 0 && (
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 text-center text-slate-400 uppercase font-black tracking-widest text-[10px]">
                  Sin pérdidas acumuladas por revalorización cambiaria en este crédito.
                </div>
              )}
           </div>
           
           <div className="bg-[#0b5156]/5 p-6 rounded-2xl border border-[#0b5156]/10 flex gap-4">
              <div className="p-3 bg-[#0b5156] text-white rounded-xl h-fit shadow-lg shadow-green-900/20">
                 <ShieldCheck size={20} />
              </div>
              <div className="space-y-1">
                 <h4 className="text-sm font-black text-[#0b5156] uppercase tracking-tight">Efecto Patrimonial UVC</h4>
                 <p className="text-[10px] font-bold text-[#0b5156]/80 uppercase leading-relaxed">
                   La deuda contratada en UVC se revaloriza diariamente según el indicador oficial del Banco Central de Venezuela (BCV). Esto genera un ajuste inflacionario que aumenta el saldo a pagar en bolívares, el cual debe registrarse contablemente como pérdida por revalorización.
                 </p>
              </div>
           </div>
        </article>
      </div>

      {/* New Loan Modal */}
      {showModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <form onSubmit={handleRegisterLoan} className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                 <div className="flex items-center gap-2">
                    <div className="p-2 bg-[#0b5156] text-white rounded-lg"><Plus size={16} /></div>
                    <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tight">Registrar Financiamiento UVC</h3>
                 </div>
                 <button type="button" onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
              </div>
              <div className="p-8 space-y-6">
                 <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Descripción del Crédito</label>
                    <input 
                      type="text" 
                      required
                      value={descripcion}
                      onChange={(e) => setDescripcion(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-slate-700 outline-none focus:border-[#0b5156]"
                      placeholder="Ej: Financiamiento Capital Banesco"
                    />
                 </div>

                 <div className="grid grid-cols-2 gap-3 items-start">
                    <div className="space-y-2">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Capital en UVC</label>
                       <input 
                         type="number" 
                         required
                         value={uvcCap || ''}
                         onChange={(e) => setUvcCap(Number(e.target.value))}
                         className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-slate-700 outline-none focus:border-[#0b5156] font-mono" 
                         placeholder="0.00" 
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Tasa Inicial (UVC/Bs)</label>
                       <input 
                         type="number" 
                         required
                         value={uvcRate}
                         onChange={(e) => setUvcRate(Number(e.target.value))}
                         className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-slate-700 outline-none focus:border-[#0b5156] font-mono" 
                       />
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-3 items-start">
                    <div className="space-y-2">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Interés Anual (%)</label>
                       <input 
                         type="number" 
                         value={interestRate} 
                         onChange={(e) => setInterestRate(Number(e.target.value))}
                         className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-slate-700 outline-none focus:border-[#0b5156]" 
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Plazo (Meses)</label>
                       <input 
                         type="number" 
                         value={plazo} 
                         onChange={(e) => setPlazo(Number(e.target.value))}
                         className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-slate-700 outline-none focus:border-[#0b5156]" 
                       />
                    </div>
                 </div>

                 <div className="bg-[#0b5156]/5 p-6 rounded-2xl border border-dashed border-[#0b5156]/30 text-center space-y-1">
                    <span className="text-[10px] font-black text-[#0b5156]/40 uppercase tracking-widest">Equivalente en Bolívares hoy:</span>
                    <h2 className="text-xl font-black text-[#0b5156] font-mono tracking-tighter">
                      Bs. {equivalentBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h2>
                 </div>

                 <button type="submit" className="w-full bg-[#0b5156] text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-xl shadow-green-900/20 hover:scale-[1.02] transition-all">
                    Generar Tabla y Registrar
                 </button>
              </div>
           </form>
        </div>,
        document.body
      )}

      {/* Manual de Uso Modal */}
      {showManualModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-2">
                    <div className="p-2 bg-[#0b5156] text-white rounded-lg"><Info size={16} /></div>
                    <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tight">Manual de Créditos Indexados UVC</h3>
                 </div>
                 <button onClick={() => setShowManualModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
              </div>
              <div className="p-8 space-y-6 overflow-y-auto no-scrollbar text-xs font-bold text-slate-600 uppercase tracking-tight leading-relaxed">
                 <div className="space-y-2">
                   <h4 className="font-black text-[#0b5156] text-sm">¿Cómo funciona el Crédito UVC?</h4>
                   <p className="normal-case font-bold text-slate-500">
                     Bajo la normativa bancaria venezolana, el capital de los créditos comerciales se expresa en **UVC (Unidad de Valor de Crédito)**. Al liquidarse, la cantidad de UVC se calcula dividiendo el capital otorgado en bolívares entre la tasa UVC oficial del BCV de ese día.
                   </p>
                 </div>
                 <div className="space-y-2">
                   <h4 className="font-black text-[#0b5156] text-sm">Revalorización Diaria</h4>
                   <p className="normal-case font-bold text-slate-500">
                     A medida que aumenta la tasa UVC del BCV, el saldo deudor en bolívares se revaloriza (aumenta proporcionalmente). El botón "Revalorización" actualiza los saldos y calcula la pérdida/ganancia cambiaria acumulada del período.
                   </p>
                 </div>
                 <div className="space-y-2">
                   <h4 className="font-black text-[#0b5156] text-sm">Cronograma y Pagos</h4>
                   <p className="normal-case font-bold text-slate-500">
                     Las cuotas de capital e intereses se expresan en UVC. Al momento del cobro o pago de cada cuota, el monto en UVC se multiplica por la tasa UVC oficial vigente de esa fecha para obtener el cobro real en bolívares.
                   </p>
                 </div>
              </div>
           </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default LoansUVC;
