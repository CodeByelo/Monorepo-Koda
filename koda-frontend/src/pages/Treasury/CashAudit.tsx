import { useState, useEffect } from 'react';
import { 
  Calculator, 
  Printer, 
  AlertTriangle, 
  ShieldAlert, 
  X, 
  DollarSign,
  Lock,
  HelpCircle
} from 'lucide-react';
import { api } from '@/api/client';

const CashAudit = () => {
  const [showResModal, setShowResModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [selectedCaja, setSelectedCaja] = useState('Caja Principal USD');
  const [usdDenoms, setUsdDenoms] = useState<Record<string, number>>({ '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '1': 0 });
  const [vesTotal, setVesTotal] = useState<number>(0);
  const [deterioratedUsd, setDeterioratedUsd] = useState(0);
  const [justification, setJustification] = useState('');
  const [declared, setDeclared] = useState(false);
  const [auditAction, setAuditAction] = useState('Descuento Nómina');
  const [auditorName, setAuditorName] = useState('');
  
  const [systemTotalUsd, setSystemTotalUsd] = useState(0);
  const [systemTotalVes, setSystemTotalVes] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const CRITICAL_THRESHOLD = 50.00;

  useEffect(() => {
    const fetchArqueoData = async () => {
      setIsLoading(true);
      try {
        const today = new Date().toISOString().split('T')[0];
        const data = await api.get<any>(`/tesoreria/arqueo?fecha=${today}&caja=${encodeURIComponent(selectedCaja)}`);
        setSystemTotalUsd(Number(data?.saldo_usd || data?.saldo_sistema_usd || 0));
        setSystemTotalVes(Number(data?.saldo_ves || data?.saldo_sistema_ves || 0));
      } catch (error) {
        console.error("Error fetching arqueo data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchArqueoData();
  }, [selectedCaja]);

  const totalUsdPhysical = Object.entries(usdDenoms).reduce((acc, [denom, qty]) => acc + (Number(denom) * qty), 0);
  const totalVesPhysical = vesTotal;
  
  const diffUsd = totalUsdPhysical - systemTotalUsd;
  const absDiff = Math.abs(diffUsd);
  const isPerfect = absDiff === 0;
  const isCritical = absDiff > CRITICAL_THRESHOLD;
  const hasInput = totalUsdPhysical > 0 || totalVesPhysical > 0;

  const handleUsdChange = (denom: string, val: string) => {
    setUsdDenoms(prev => ({ ...prev, [denom]: Math.max(0, parseInt(val) || 0) }));
  };

  const handlePrintActa = () => {
    const query = new URLSearchParams({
      fecha: new Date().toISOString().split('T')[0],
      caja: selectedCaja,
      justificacion: justification,
      fisico_ves: vesTotal.toString(),
      ...Object.entries(usdDenoms).reduce((acc, [k, v]) => ({ ...acc, [`denom_${k}`]: v.toString() }), {})
    }).toString();
    
    let baseUrl = (import.meta as any).env?.VITE_API_URL || (
      window.location.hostname.includes('cloudflare') || window.location.hostname.includes('.ts.net')
        ? '/api-facturacion'
        : '/api'
    );
    if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://') && !baseUrl.startsWith('/')) {
      baseUrl = '/' + baseUrl;
    }
    
    window.open(`${baseUrl}/tesoreria/arqueo/pdf?${query}`, '_blank');
  };

  const handleCloseCashRegister = async () => {
    try {
      await api.post('/tesoreria/arqueo/cerrar', {
        caja: selectedCaja,
        diferencia_usd: diffUsd,
        fisico_usd: totalUsdPhysical,
        fisico_ves: totalVesPhysical,
        justificacion: justification,
        denominaciones_usd: usdDenoms,
        denominaciones_ves: { "Total": vesTotal },
        accion_contable: auditAction,
        auditor: auditorName
      });
      alert('Cierre y Ajuste Procesado Exitosamente');
      setShowResModal(false);
      // Refresh data after close
      const today = new Date().toISOString().split('T')[0];
      const data = await api.get<any>(`/tesoreria/arqueo?fecha=${today}&caja=${encodeURIComponent(selectedCaja)}`);
      setSystemTotalUsd(Number(data?.saldo_usd || data?.saldo_sistema_usd || 0));
      setSystemTotalVes(Number(data?.saldo_ves || data?.saldo_sistema_ves || 0));
      // Optional: reset form or navigate
    } catch (error) {
      console.error("Error al cerrar caja:", error);
      alert('Error al procesar el cierre de caja.');
    }
  };

  const handleExecuteCierreClick = () => {
    if (isLoading) return;
    if (!hasInput) {
      alert("Por favor, ingrese el conteo físico de la caja antes de ejecutar el cierre.");
      return;
    }
    if (isCritical && !justification.trim()) {
      alert("La diferencia detectada es crítica (mayor a $50.00). Debe escribir una justificación en el panel correspondiente antes de ejecutar el cierre.");
      return;
    }
    if (!declared) {
      alert("Debe declarar bajo juramento que la información ingresada es veraz y auditable (marque la casilla al final del panel de Justificación).");
      return;
    }
    
    if (diffUsd !== 0) {
      setShowResModal(true);
    } else {
      handleCloseCashRegister();
    }
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Tesorería &gt; Cierre de Caja
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase">Arqueo Físico de Caja</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Validación de existencias físicas contra saldos lógicos del sistema.</p>
          </div>
          <div className="flex gap-3">
             <button onClick={() => setShowManualModal(true)} className="bg-slate-50 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-white transition-all flex items-center gap-2">
                <HelpCircle size={14} /> Manual
             </button>
             <button onClick={handlePrintActa} className="bg-slate-50 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-white transition-all flex items-center gap-2">
                <Printer size={14} /> Acta de Arqueo
             </button>
              <button 
                onClick={handleExecuteCierreClick}
                className="bg-[#0b5156] text-white shadow-green-900/20 hover:bg-[#083a3d] px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 transition-all shadow-lg hover:scale-[1.02]"
              >
                 <Lock size={14} /> Ejecutar Cierre
              </button>
          </div>
        </div>
      </header>


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Calculators */}
        <section className="lg:col-span-2 space-y-6">
          {/* USD Calculator */}
          <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-6">
             <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 bg-[#0b5156] text-white rounded-xl flex items-center justify-center font-black">USD</div>
                   <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Caja en Divisas</h2>
                </div>
                 <select 
                   value={selectedCaja}
                   onChange={(e) => setSelectedCaja(e.target.value)}
                   className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-black text-[#0b5156] uppercase outline-none focus:border-[#0b5156]"
                 >
                    <option>Caja Principal USD</option>
                    <option>Caja Chica Ventas</option>
                 </select>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-2">
                {Object.keys(usdDenoms).sort((a,b) => Number(b) - Number(a)).map(denom => (
                   <div key={denom} className="flex items-center justify-between py-3 border-b border-slate-50">
                      <span className="text-sm font-black text-[#0b5156] font-mono w-12">${denom}</span>
                      <input 
                        type="number" 
                        value={usdDenoms[denom] || ''} 
                        onChange={(e) => handleUsdChange(denom, e.target.value)}
                        className="w-20 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-center font-black text-[#0b5156] outline-none focus:border-[#0b5156]" 
                        placeholder="0"
                      />
                      <span className="text-sm font-black text-slate-400 font-mono w-24 text-right">
                        ${(Number(denom) * (usdDenoms[denom] || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                   </div>
                ))}
             </div>

             <div className="mt-8 pt-6 border-t-2 border-slate-100 flex justify-between items-end">
                <div className="space-y-1">
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Físico USD:</span>
                   <h2 className="text-4xl font-black text-[#0b5156] font-mono tracking-tighter">
                     ${totalUsdPhysical.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                   </h2>
                </div>
                <div className="space-y-2 text-right">
                   <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">⚠️ En Cuarentena:</span>
                   <div className="relative">
                      <DollarSign className="absolute left-3 top-2.5 text-amber-600/40" size={12} />
                      <input 
                        type="number" 
                        value={deterioratedUsd || ''}
                        onChange={(e) => setDeterioratedUsd(Number(e.target.value))}
                        placeholder="0.00" 
                        className="bg-amber-50 border border-amber-200 rounded-xl pl-8 pr-4 py-2 text-xs font-black text-amber-700 outline-none focus:border-amber-500 w-32 font-mono text-right" 
                      />
                   </div>
                </div>
             </div>
          </article>

          {/* VES Calculator */}
          <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-6">
             <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-[#726555] text-white rounded-xl flex items-center justify-center font-black">Bs</div>
                <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Caja en Bolívares</h2>
             </div>

             <div className="space-y-3">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Monto Total Recaudado (VES)</span>
                <div className="relative">
                   <div className="absolute left-4 top-3.5 text-slate-400 font-bold font-mono text-sm">Bs.</div>
                   <input 
                     type="number" 
                     value={vesTotal || ''}
                     onChange={(e) => setVesTotal(Number(e.target.value))}
                     className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3 text-sm font-black text-slate-600 outline-none focus:border-[#726555] font-mono transition-colors" 
                     placeholder="0.00"
                   />
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed">
                   Ingrese la suma total del efectivo físico en bolívares en la caja.
                </p>
             </div>
          </article>
        </section>

        {/* Comparison & Sidebars */}
        <aside className="space-y-6">
          {/* Variance Card */}
          <article className={`p-5 rounded-2xl border-2 transition-all duration-500 text-center space-y-4 ${
            !hasInput ? 'bg-slate-50 border-slate-200 grayscale' :
            isPerfect ? 'bg-green-50 border-green-500 shadow-lg shadow-green-900/10' :
            isCritical ? 'bg-red-50 border-red-500 shadow-lg shadow-red-900/10 animate-pulse' :
            'bg-amber-50 border-amber-500'
          }`}>
             <span className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Diferencia Detectada</span>
             <div className={`text-5xl font-black font-mono tracking-tighter ${
               !hasInput ? 'text-slate-300' :
               isPerfect ? 'text-green-600' :
               isCritical ? 'text-red-600' :
               'text-amber-600'
             }`}>
               {!hasInput ? '--' : `${diffUsd >= 0 ? '+' : '-'}$${absDiff.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
             </div>
             <p className={`text-xs font-bold uppercase ${
               !hasInput ? 'text-slate-400' :
               isPerfect ? 'text-green-700' :
               isCritical ? 'text-red-700' :
               'text-amber-700'
             }`}>
               {!hasInput ? 'Ingrese el conteo para comparar.' :
                isPerfect ? 'Caja cuadrada perfectamente.' :
                isCritical ? 'Diferencia crítica detectada.' :
                'Diferencia aceptable. Requiere ajuste.'}
             </p>

              {hasInput && isCritical && (
                 <div className="bg-red-600 text-white p-4 rounded-2xl space-y-2 mt-4 text-left">
                    <div className="flex items-center gap-2">
                       <ShieldAlert size={16} className="text-white !text-white" />
                       <strong className="text-xs uppercase font-black tracking-tight text-white !text-white">Alerta Crítica</strong>
                    </div>
                    <p className="text-[10px] font-bold uppercase leading-relaxed text-white !text-white opacity-100">
                       La diferencia excede el umbral ($50.00). El cierre ha sido bloqueado y se ha notificado a Auditoría General.
                    </p>
                 </div>
              )}
          </article>

          {/* Summary Card */}
          <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-6">
             <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tighter">Resumen de Cuadre</h3>
             <div className="space-y-4">
                <div className="flex justify-between items-center text-xs">
                   <span className="font-bold text-slate-400 uppercase tracking-widest">Saldo Sistema (USD):</span>
                   <strong className="font-black text-[#0b5156] font-mono">
                     {isLoading ? 'Cargando...' : `$${systemTotalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                   </strong>
                </div>
                <div className="flex justify-between items-center text-xs">
                   <span className="font-bold text-slate-400 uppercase tracking-widest">Total Contado (USD):</span>
                   <strong className="font-black text-[#0b5156] font-mono">${totalUsdPhysical.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                </div>
                <div className="pt-4 border-t border-slate-100 flex justify-between items-center text-xs">
                   <span className="font-bold text-slate-400 uppercase tracking-widest">Ajuste Sugerido:</span>
                   <span className={`px-2 py-0.5 rounded font-black uppercase text-[10px] ${
                     isPerfect ? 'bg-green-100 text-green-700' :
                     diffUsd > 0 ? 'bg-blue-100 text-blue-700' :
                     'bg-amber-100 text-amber-700'
                   }`}>
                     {!hasInput ? '-' : isPerfect ? 'Cuadrado' : diffUsd > 0 ? 'Sobrante' : 'Faltante'}
                   </span>
                </div>
             </div>
          </article>

          {/* Justification */}
          <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
             <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tighter">Justificación</h3>
             <textarea 
               value={justification}
               onChange={(e) => setJustification(e.target.value)}
               className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156] resize-none h-24 uppercase" 
               placeholder="Escriba la razón del sobrante o faltante..."
             />
             <div className="flex items-center gap-3 p-2">
                <input 
                  type="checkbox" 
                  checked={declared}
                  onChange={(e) => setDeclared(e.target.checked)}
                  id="declaration-chk" 
                  className="w-4 h-4 rounded border-slate-300 text-[#0b5156] focus:ring-[#0b5156]" 
                />
                <label htmlFor="declaration-chk" className="text-[10px] font-black text-slate-400 uppercase tracking-tight cursor-pointer">
                  Declaro que la información es veraz y auditable.
                </label>
             </div>
          </article>
        </aside>
      </div>

      {/* Resolution Modal */}
      {showResModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                 <div className="flex items-center gap-2">
                    <div className="p-2 bg-amber-500 text-white rounded-lg"><AlertTriangle size={16} /></div>
                    <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tight">Resolución de Diferencia</h3>
                 </div>
                 <button onClick={() => setShowResModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
              </div>
              <div className="p-8 space-y-6">
                 <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 text-center space-y-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Monto a Ajustar:</span>
                    <h2 className={`text-xl font-black font-mono ${diffUsd > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {diffUsd >= 0 ? '+' : '-'}${absDiff.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </h2>
                 </div>

                 <div className="space-y-4">
                    <div className="space-y-2">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Acción Contable</label>
                       <select 
                         value={auditAction}
                         onChange={(e) => setAuditAction(e.target.value)}
                         className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156] uppercase"
                       >
                          {diffUsd < 0 ? (
                            <>
                              <option value="Descuento Nómina">Cuentas por Cobrar Empleado (Descuento Nómina)</option>
                              <option value="Pérdida por Faltante">Gasto por Faltante de Caja (Pérdida)</option>
                            </>
                          ) : (
                            <option value="Otros Ingresos">Ingreso por Sobrante (Otros Ingresos)</option>
                          )}
                       </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Auditor / Responsable</label>
                       <input 
                         type="text" 
                         value={auditorName}
                         onChange={(e) => setAuditorName(e.target.value)}
                         className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156]" 
                         placeholder="Nombre de quien autoriza..." 
                       />
                    </div>
                 </div>

                 <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 flex gap-3 text-blue-700">
                    <div className="mt-1"><Calculator size={18} /></div>
                    <p className="text-[10px] font-bold uppercase leading-relaxed">
                      Al confirmar, se generará el asiento tipo <strong>AJ-ARCH-{new Date().getFullYear()}</strong> y el saldo inicial del próximo turno será el declarado físicamente.
                    </p>
                 </div>

                 <button onClick={handleCloseCashRegister} className="w-full bg-[#0b5156] text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-xl shadow-green-900/20 hover:scale-[1.02] transition-all">
                    Confirmar Cierre y Generar Asiento
                 </button>
              </div>
           </div>
         </div>
      )}

       {/* Manual Modal */}
       {showManualModal && (
         <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
               <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                     <div className="p-2 bg-[#0b5156] text-white rounded-lg"><HelpCircle size={16} /></div>
                     <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tight">Manual de Arqueo</h3>
                  </div>
                  <button onClick={() => setShowManualModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
               </div>
               <div className="p-8 space-y-4 text-left">
                  <h4 className="text-sm font-black text-[#0b5156] uppercase tracking-tight">ℹ️ ¿Cómo funciona el Arqueo Físico de Caja?</h4>
                  <ul className="text-xs font-bold text-slate-600 space-y-3 list-disc list-inside uppercase leading-relaxed">
                     <li><strong>Paso 1:</strong> Seleccione la caja a auditar (Ej. Caja Principal USD o Caja Chica Ventas) en el selector superior. El sistema cargará el "Saldo Sistema" registrado actualmente en la base de datos real.</li>
                     <li><strong>Paso 2:</strong> Ingrese la cantidad física de billetes que posee en su caja por cada denominación ($100, $50, etc.) y la suma del efectivo físico en bolívares.</li>
                     <li><strong>Paso 3:</strong> El sistema calculará la diferencia. Si la diferencia es perfecta ($0.00) o aceptable (menor a $50.00), podrá proceder a cerrar. Si es crítica (mayor a $50.00), el botón se bloqueará, se activará la alerta y requerirá justificación y revisión.</li>
                     <li><strong>Paso 4:</strong> Haga clic en <strong>Ejecutar Cierre</strong> para actualizar los saldos lógicos del sistema con el conteo físico verificado.</li>
                  </ul>
                  <button onClick={() => setShowManualModal(false)} className="w-full mt-4 bg-[#0b5156] text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-xl shadow-green-900/20 hover:scale-[1.02] transition-all">
                     Entendido
                  </button>
               </div>
            </div>
         </div>
       )}
    </div>
  );
};

export default CashAudit;
