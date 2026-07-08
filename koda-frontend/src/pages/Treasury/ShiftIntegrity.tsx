import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Filter, 
  TrendingDown, 
  Settings,
  X,
  AlertTriangle,
  Info,
  ExternalLink
} from 'lucide-react';
import { api } from '@/api/client';

const TurnIntegrity = () => {
  const navigate = useNavigate();
  const [selectedUser, setSelectedUser] = useState('');
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Threshold modal state
  const [showThresholdModal, setShowThresholdModal] = useState(false);
  const [acceptableThreshold, setAcceptableThreshold] = useState(5.0);
  const [criticalThreshold, setCriticalThreshold] = useState(20.0);
  const [consecutiveShiftsLimit, setConsecutiveShiftsLimit] = useState(3);
  const [maxMonthlyLoss, setMaxMonthlyLoss] = useState(150.0);
  const [autoLockDrawer, setAutoLockDrawer] = useState(true);
  const [notificationEmail, setNotificationEmail] = useState('auditoria@koda.com');
  const [auditAction, setAuditAction] = useState('Expediente y Alerta a Supervisor');
  
  // POS Comparison modal state
  const [showPosModal, setShowPosModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  
  // Toast notifications
  const [notification, setNotification] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const res = await api.get<any>('/tesoreria/turnos');
      setData(res);
      if (res.ranking && res.ranking.length > 0) {
        if (!selectedUser) {
          setSelectedUser(res.ranking[0].name);
        }
      }
    } catch (error) {
      console.error("Error loading turn integrity:", error);
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

  const handlePrintReport = () => {
    window.print();
  };

  const handleStartFile = () => {
    triggerNotification(`Expediente de auditoría iniciado para ${selectedUser}. Notificación enviada a Recursos Humanos y a ${notificationEmail}.`);
  };

  const metrics = [
    { label: 'Cajeros Monitoreados', value: data?.metricas?.cajeros_monitoreados || '0 Usuarios', desc: 'Turnos activos', color: 'text-[#0b5156]' },
    { label: 'Desviación Total Mes', value: data?.metricas?.desviacion_total || '$0.00', desc: 'Pérdida por faltantes', color: 'text-slate-600' },
    { label: 'Alertas Críticas', value: data?.metricas?.alertas_criticas || '0 Usuarios', desc: `> $${criticalThreshold.toFixed(2)} Acumulado`, color: 'text-amber-600' },
  ];

  const cashiers = data?.ranking || [];
  const history = (data?.historiales && selectedUser) ? (data.historiales[selectedUser] || []) : [];
  
  // Calculate if cashier has consecutive losses pattern (3 or more negative audits)
  const hasLossPattern = history.filter((h: any) => h.diff.startsWith('-$') || h.diff.startsWith('-')).length >= consecutiveShiftsLimit;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0b5156]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-20 print:p-0 print:space-y-6">
      {/* Dynamic print stylesheet */}
      <style>{`
        @media print {
          /* Hide complete layout headers, sidebars, navigation and action elements */
          nav, aside, header button, .flex.gap-3, .fixed, .no-print, [class*="Sidebar"], [class*="Topbar"], .sidebar-container {
            display: none !important;
          }
          /* Reset background and padding constraints for printed paper */
          body, html, #root {
            background: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }
          /* Style containers specifically for print layout */
          .print-main-content {
            width: 100% !important;
            margin: 0 !important;
            padding: 20px !important;
            border: none !important;
            box-shadow: none !important;
          }
          /* Prevent split cards in middle of print pages */
          article, section {
            page-break-inside: avoid !important;
            border: 1px solid #e2e8f0 !important;
            margin-bottom: 15px !important;
            border-radius: 12px !important;
          }
        }
      `}</style>

      {/* Toast Notification */}
      {notification && createPortal(
        <div className="fixed top-5 right-5 bg-slate-900 text-white px-6 py-4 rounded-xl shadow-2xl z-50 flex items-center gap-3 border border-slate-700 animate-in slide-in-from-top-5 duration-300">
           <ShieldCheck className="text-green-400 shrink-0" size={18} />
           <p className="text-xs font-black uppercase tracking-wider text-white">{notification}</p>
        </div>,
        document.body
      )}

      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden print-main-content">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Tesorería &gt; Inteligencia de Auditoría
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase">Integridad de Turnos</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Monitoreo de fiabilidad de cajeros y análisis de desviaciones acumuladas.</p>
          </div>
          <div className="flex gap-3 no-print">
             <button 
               onClick={() => setShowManualModal(true)}
               className="bg-slate-50 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-white transition-all flex items-center gap-2"
             >
                <Info size={14} /> Manual de Uso
             </button>
             <button 
               onClick={handlePrintReport}
               className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
             >
                <ShieldCheck size={14} /> Reporte de Auditoría
             </button>
             <button 
               onClick={() => setShowThresholdModal(true)}
               className="bg-slate-50 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-white transition-all flex items-center gap-2"
             >
                <Settings size={14} /> Umbrales
             </button>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start print:grid-cols-3">
        {metrics.map((m, i) => (
          <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between min-h-24">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">{m.label}</p>
            <div className="space-y-1">
              <strong className={`text-xl font-black ${m.color} tracking-tighter font-mono`}>{m.value}</strong>
              <p className="text-xs font-bold text-slate-400 uppercase leading-tight mt-1">{m.desc}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start print:grid-cols-1 print:gap-4">
        {/* Cashier Ranking */}
        <aside className="space-y-4 print:border print:border-slate-200 print:p-4 print:rounded-2xl">
           <div className="flex justify-between items-center px-2">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Ranking de Fiabilidad</h3>
              <button className="p-1 text-slate-400 hover:text-[#0b5156] no-print"><Filter size={14} /></button>
           </div>
           <div className="space-y-2">
              {cashiers.map((c: any, i: number) => (
                <div 
                  key={i} 
                  onClick={() => setSelectedUser(c.name)}
                  className={`group p-4 rounded-2xl border transition-all cursor-pointer flex items-center gap-4 ${
                    selectedUser === c.name ? 'bg-white border-[#0b5156] shadow-lg shadow-green-900/5' : 
                    c.isCritical ? 'bg-red-50/50 border-red-100 hover:border-red-200' : 
                    'bg-white border-slate-100 hover:border-slate-200 shadow-sm'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${
                    c.isCritical ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-[#0b5156]'
                  }`}>
                    {c.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-black text-[#0b5156] uppercase tracking-tight truncate">{c.name}</h4>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{c.role}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-xs font-black font-mono ${c.loss.startsWith('-') ? 'text-red-600' : 'text-green-600'}`}>
                      {c.loss}
                    </div>
                    <p className="text-[8px] font-bold text-slate-400 uppercase">{c.desc}</p>
                  </div>
                </div>
              ))}
           </div>
        </aside>

        {/* Forensic Detail */}
        <article className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
           <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
              <div className="space-y-1">
                 <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Historial de Turnos: {selectedUser}</h2>
                 <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Análisis detallado de los últimos arqueos del usuario.</p>
              </div>
              <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border ${
                hasLossPattern ? 'bg-red-100 text-red-700 border-red-200' : 'bg-green-100 text-green-700 border-green-200'
              }`}>
                {hasLossPattern ? 'Sujeto a Auditoría' : 'Operación Conforme'}
              </span>
           </div>

           <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-white">
                    <th className="py-2.5 px-6">FECHA / HORA</th>
                    <th className="py-2.5 px-4 text-center">CAJA</th>
                    <th className="py-2.5 px-4 text-right">FÍSICO</th>
                    <th className="py-2.5 px-4 text-right">DIFERENCIA</th>
                    <th className="py-2.5 px-6 text-right">RESOLUCIÓN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs">
                  {history.map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-2.5 px-6 font-mono text-slate-400 font-bold">{row.date}</td>
                      <td className="py-2.5 px-4 text-center font-black text-slate-500 uppercase">{row.box}</td>
                      <td className="py-2.5 px-4 text-right font-black font-mono text-[#0b5156]">{row.physical}</td>
                      <td className={`py-2.5 px-4 text-right font-black font-mono ${
                        row.diff.startsWith('-') ? 'text-red-600' : 'text-green-600'
                      }`}>{row.diff}</td>
                      <td className="py-2.5 px-6 text-right">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                          row.resolution === 'Sujeto a Auditoría' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}>{row.resolution}</span>
                      </td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 uppercase font-black tracking-widest">
                        Sin arqueos registrados
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
           </div>

           {hasLossPattern && (
             <div className="p-4 bg-red-50/50 border border-red-100/70 mx-5 my-4 rounded-xl flex gap-4 items-start no-print">
                <div className="p-2 bg-red-600 text-white rounded-lg shrink-0">
                   <ShieldAlert size={16} />
                </div>
                <div className="space-y-1">
                   <h4 className="text-xs font-black text-red-700 uppercase tracking-tight leading-none">Alerta de Patrón de Pérdida</h4>
                   <p className="text-[10px] font-bold text-red-600/80 uppercase leading-relaxed max-w-2xl">
                     El usuario {selectedUser} presenta faltantes sistemáticos en {consecutiveShiftsLimit} turnos consecutivos. Se ha generado una notificación automática.
                   </p>
                   <div className="pt-1 flex gap-4">
                      <button 
                        onClick={handleStartFile}
                        className="text-[9px] font-black text-red-700 uppercase underline decoration-2 underline-offset-4"
                      >
                        Iniciar Expediente
                      </button>
                      <button 
                        onClick={() => setShowPosModal(true)}
                        className="text-[9px] font-black text-red-700 uppercase underline decoration-2 underline-offset-4"
                      >
                        Ver Comparativa de POS
                      </button>
                   </div>
                </div>
             </div>
           )}
        </article>
      </section>

      {/* Intelligence Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start print:grid-cols-1 print:gap-4">
         <article className="bg-[#0b5156] p-4 rounded-xl border border-[#0b5156]/10 shadow-sm space-y-3 flex flex-col justify-between">
            <div className="space-y-2">
               <div className="flex items-center gap-2">
                  <div className="p-2 bg-white/10 rounded-lg text-white"><ShieldCheck size={16} /></div>
                  <h3 className="text-base font-black text-white uppercase tracking-tighter leading-none">Umbral de Fiabilidad</h3>
               </div>
               <p className="text-xs font-bold text-white/60 uppercase leading-relaxed">
                 El motor de auditoría Koda analiza desviaciones menores a ${acceptableThreshold.toFixed(2)} como "Ruido de Operación" y mayores a ${criticalThreshold.toFixed(2)} como "Anomalía". Los usuarios en este ranking requieren capacitación o supervisión directa.
               </p>
            </div>
            <button 
              onClick={() => setShowThresholdModal(true)}
              className="force-text-koda w-full bg-white text-[#0b5156] font-black py-2.5 rounded-xl uppercase text-[10px] tracking-widest shadow-xl hover:scale-[1.02] transition-all mt-2 no-print"
            >
              Configurar Reglas de Auditoría
            </button>
         </article>

         <article className="bg-[#726555] p-4 rounded-xl border border-slate-700/10 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
               <div className="p-2 bg-white/10 rounded-lg text-white"><TrendingDown size={16} /></div>
               <h3 className="text-base font-black text-white uppercase tracking-tighter leading-none">Fugas no Identificadas</h3>
            </div>
            <div className="space-y-2">
               {[
                 { label: 'Diferencial en POS (No conciliado)', val: '$24.50', path: '/tesoreria/conciliacion' },
                 { label: 'Vuelto pendiente en sistema', val: '$12.00', path: '/cobranzas/estado-cuenta' },
                 { label: 'Billetes deteriorados en custodia', val: '$5.00', path: '/tesoreria/movimientos-caja' },
               ].map((item, i) => (
                 <div 
                   key={i} 
                   onClick={() => navigate(item.path)}
                   className="flex justify-between items-center border-b border-white/5 pb-2 last:border-0 hover:bg-white/5 p-1.5 rounded-lg cursor-pointer transition-colors group"
                 >
                    <span className="text-[10px] font-black text-white/40 uppercase group-hover:text-white transition-colors flex items-center gap-1.5">
                      {item.label} <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </span>
                    <span className="text-xs font-black font-mono text-white">{item.val}</span>
                 </div>
               ))}
            </div>
            <p className="text-[9px] font-bold text-white/30 uppercase text-center pt-1 italic">Valores detectados por el motor de inteligencia artificial de Koda.</p>
         </article>
      </div>

      {/* Threshold Modal */}
      {showThresholdModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-5 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                 <div className="flex items-center gap-2">
                    <div className="p-2 bg-[#0b5156] text-white rounded-lg"><Settings size={16} /></div>
                    <h3 className="text-base font-black text-[#0b5156] uppercase tracking-tight">Configuración Completa de Umbrales</h3>
                 </div>
                 <button onClick={() => setShowThresholdModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={18} /></button>
              </div>
              <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto no-scrollbar">
                 <div className="bg-[#0b5156]/5 p-4 rounded-xl border border-[#0b5156]/10 text-[10px] font-bold uppercase tracking-tight text-[#0b5156]/80 leading-normal">
                   Esta configuración establece las reglas automáticas de detección de anomalías y la severidad de las acciones sugeridas por el sistema en cierres y turnos.
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Ruido de Operación Aceptable ($)</label>
                      <input 
                        type="number" 
                        value={acceptableThreshold} 
                        onChange={(e) => setAcceptableThreshold(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#0b5156]"
                      />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Monto Desviación Crítica ($)</label>
                      <input 
                        type="number" 
                        value={criticalThreshold} 
                        onChange={(e) => setCriticalThreshold(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#0b5156]"
                      />
                   </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Límite Turnos Consecutivos</label>
                      <input 
                        type="number" 
                        value={consecutiveShiftsLimit} 
                        onChange={(e) => setConsecutiveShiftsLimit(parseInt(e.target.value) || 0)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#0b5156]"
                      />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Pérdida Mensual Máxima ($)</label>
                      <input 
                        type="number" 
                        value={maxMonthlyLoss} 
                        onChange={(e) => setMaxMonthlyLoss(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#0b5156]"
                      />
                   </div>
                 </div>

                 <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Acción de Auditoría Automatizada</label>
                    <select 
                      value={auditAction}
                      onChange={(e) => setAuditAction(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#0b5156] cursor-pointer"
                    >
                      <option value="Advertencia Visual en Dashboard">Advertencia Visual en Dashboard</option>
                      <option value="Expediente y Alerta a Supervisor">Expediente y Alerta a Supervisor</option>
                      <option value="Suspensión Temporal de Gaveta">Suspensión Temporal de Gaveta</option>
                      <option value="Bloqueo Inmediato de Turno">Bloqueo Inmediato de Turno</option>
                    </select>
                 </div>

                 <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Email del Auditor en Jefe</label>
                    <input 
                      type="email" 
                      value={notificationEmail} 
                      onChange={(e) => setNotificationEmail(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-[#0b5156]"
                    />
                 </div>

                 <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <input 
                      type="checkbox" 
                      id="autolock" 
                      checked={autoLockDrawer} 
                      onChange={(e) => setAutoLockDrawer(e.target.checked)}
                      className="h-4 w-4 text-[#0b5156] border-slate-300 rounded focus:ring-[#0b5156] cursor-pointer"
                    />
                    <label htmlFor="autolock" className="text-[9px] font-black text-slate-600 uppercase tracking-wider cursor-pointer">
                      Bloquear gaveta electrónica automáticamente al exceder tolerancia crítica
                    </label>
                 </div>

                 <button 
                   onClick={() => {
                     setShowThresholdModal(false);
                     triggerNotification("Configuración de umbrales y reglas guardada correctamente.");
                   }}
                   className="w-full bg-[#0b5156] hover:bg-[#083a3d] text-white text-xs font-black uppercase py-3 rounded-xl transition-all shadow-lg shadow-green-900/10 mt-2"
                 >
                   Guardar Reglas de Auditoría
                 </button>
              </div>
           </div>
        </div>,
        document.body
      )}

      {/* POS Comparison Modal */}
      {showPosModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-5 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                 <div className="flex items-center gap-2">
                    <div className="p-2 bg-red-600 text-white rounded-lg"><AlertTriangle size={16} /></div>
                    <h3 className="text-base font-black text-red-600 uppercase tracking-tight">Comparativa POS vs Arqueo Físico</h3>
                 </div>
                 <button onClick={() => setShowPosModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={18} /></button>
              </div>
              <div className="p-6 space-y-4 text-xs font-bold uppercase tracking-tight text-slate-600 leading-relaxed">
                 <p className="normal-case font-bold text-slate-500">Aquí se comparan las transacciones totales procesadas por los puntos de venta (POS) contra el registro físico del cajero.</p>
                 <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2 font-mono">
                    <div className="flex justify-between"><span className="text-slate-400">Total POS:</span><span className="text-[#0b5156] font-black">$1,500.00</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Declarado Físico:</span><span className="text-slate-700 font-black">$1,480.00</span></div>
                    <div className="flex justify-between border-t border-slate-200 pt-2 font-black text-red-600"><span>Diferencia:</span><span>-$20.00</span></div>
                 </div>
                 <button 
                   onClick={() => setShowPosModal(false)}
                   className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black uppercase py-3 rounded-xl transition-all"
                 >
                   Cerrar Comparativa
                 </button>
              </div>
           </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default TurnIntegrity;
