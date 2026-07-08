import { 
  ArrowLeft,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calendar,
  ShieldCheck,
  X,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const PeriodClosing = () => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [periodo, setPeriodo] = useState(currentMonth);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenJustification, setReopenJustification] = useState('');
  const [reopenPeriod, setReopenPeriod] = useState('');
  
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [periodo]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [resChecklist, resHistory] = await Promise.all([
        api.get<any>(`/contabilidad/cierre/checklist?periodo=${periodo}`).catch(() => null),
        api.get<any[]>('/contabilidad/cierres/historial').catch(() => [])
      ]);
      setData(resChecklist);
      setHistory(resHistory || []);
      if (resHistory && resHistory.length > 0) {
        setReopenPeriod(resHistory[0].periodo || '');
      }
    } catch (error) {
      console.error("Error fetching period closing data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEjecutarBloqueo = async () => {
    if (confirm(`¿Está seguro que desea ejecutar el cierre final para el periodo ${periodo}?`)) {
      try {
        await api.post('/contabilidad/cierre/ejecutar', { periodo });
        alert("Cierre ejecutado exitosamente.");
        fetchData();
      } catch (error) {
        console.error("Error al ejecutar cierre:", error);
        alert("Error al ejecutar cierre.");
      }
    }
  };

  const handleReabrir = async () => {
    if (!reopenPeriod) return alert("Seleccione un periodo");
    if (reopenJustification.trim().length < 10) return alert("Justificación debe tener al menos 10 caracteres");
    
    try {
      await api.post('/contabilidad/cierre/reabrir', { periodo: reopenPeriod, justificacion: reopenJustification });
      alert("Periodo reabierto exitosamente.");
      setShowReopenModal(false);
      setReopenJustification('');
      fetchData();
    } catch (error) {
      console.error("Error al reabrir periodo:", error);
      alert("Error al reabrir periodo.");
    }
  };

  const checklist = data?.checklist || [];
  const metrics = data?.metricas || {
    labelPeriodo: 'Período',
    valuePeriodo: periodo,
    descPeriodo: 'En proceso de cierre',
    completados: '0 / 0',
    pendientes: '0',
    vencimiento: '-'
  };

  return (
    <div className="space-y-2 animate-in fade-in duration-500 pb-4">
      {/* Header */}
      <header className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <Link to="/contabilidad" className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-[#0b5156]/20 transition-all">
                <ArrowLeft size={10} /> Volver
              </Link>
              <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Contabilidad
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Cierre de Período Contable</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Proceso de cierre mensual y anual. Bloqueo de módulos y libros fiscales.</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end items-center">
             <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mr-2">
                <Calendar size={14} className="text-slate-400" />
                <input 
                  type="month" 
                  value={periodo} 
                  onChange={(e) => setPeriodo(e.target.value)}
                  className="bg-transparent text-xs font-black text-[#0b5156] outline-none"
                />
             </div>
             <button 
              onClick={() => setShowReopenModal(true)}
              className="bg-white text-red-600 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase border border-red-100 hover:bg-red-50 transition-all flex items-center gap-2"
             >
                <Unlock size={14} /> Reapertura Especial
             </button>
             <button onClick={handleEjecutarBloqueo} className="bg-[#0b5156] text-white px-8 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <Lock size={14} /> Ejecutar Bloqueo Final
             </button>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse bg-white rounded-3xl border border-slate-200 shadow-sm">
           Cargando Cierre de Período...
        </div>
      ) : (
        <>
          {/* Metrics Grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24 hover:border-[#0b5156]/20 transition-all">
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{metrics.labelPeriodo}</span>
               <div className="space-y-1">
                 <strong className="text-lg font-black text-[#0b5156] tracking-tighter font-mono uppercase">{metrics.valuePeriodo}</strong>
                 <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">{metrics.descPeriodo}</p>
               </div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24 hover:border-[#0b5156]/20 transition-all">
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Pasos Completados</span>
               <div className="space-y-1">
                 <strong className="text-lg font-black text-amber-600 tracking-tighter font-mono uppercase">{metrics.completados}</strong>
                 <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">Estado de checklist</p>
               </div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24 hover:border-[#0b5156]/20 transition-all">
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Asientos Pendientes</span>
               <div className="space-y-1">
                 <strong className="text-lg font-black text-red-500 tracking-tighter font-mono uppercase">{metrics.pendientes}</strong>
                 <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">Requieren revisión</p>
               </div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24 hover:border-[#0b5156]/20 transition-all">
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Vencimiento Cierre</span>
               <div className="space-y-1">
                 <strong className="text-lg font-black text-slate-800 tracking-tighter font-mono uppercase">{metrics.vencimiento}</strong>
                 <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">Presentación SENIAT</p>
               </div>
            </div>
          </section>

          {/* Checklist Section */}
          <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/30">
              <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Checklist de Cierre — {periodo}</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Pasos obligatorios para garantizar cumplimiento fiscal y financiero.</p>
            </div>

            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                    <th className="py-2.5 px-4 w-12">#</th>
                    <th className="py-2.5 px-4">Tarea de Cierre</th>
                    <th className="py-2.5 px-4 text-center">Responsable</th>
                    <th className="py-2.5 px-4 text-center">Estado</th>
                    <th className="py-2.5 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs">
                  {checklist.length > 0 ? checklist.map((task: any, index: number) => (
                    <tr key={task.id || index} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2 px-4 font-black text-slate-300">{index + 1}</td>
                      <td className="py-2 px-4">
                        <div className="space-y-0.5">
                           <strong className="text-slate-700 uppercase font-black block leading-tight">{task.task}</strong>
                           <span className="text-[9px] font-bold text-slate-400 uppercase">{task.desc}</span>
                        </div>
                      </td>
                      <td className="py-2 px-4 text-center font-bold text-slate-500 uppercase">{task.responsible}</td>
                      <td className="py-2 px-4 text-center">
                        <span className={`${task.status === 'Completado' ? 'bg-green-100 text-green-700' : task.status === 'No iniciado' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight`}>
                          {task.status}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-right">
                        {task.link && (
                          <Link to={task.link} className="text-[#0b5156] hover:underline font-black uppercase text-[10px] flex items-center justify-end gap-1 ml-auto">
                             Ver Tarea <ChevronRight size={12} />
                          </Link>
                        )}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                        No hay tareas en el checklist para este período
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            {/* Closing History */}
            <article className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
               <div className="p-4 border-b border-slate-100 bg-slate-50/30">
                  <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Historial de Cierres</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Trazabilidad de periodos bloqueados.</p>
               </div>
               <div className="p-0">
                  <table className="w-full text-left">
                     <thead>
                        <tr className="text-[9px] font-black text-slate-400 uppercase border-b border-slate-100">
                           <th className="py-2 px-4">Período</th>
                           <th className="py-2 px-4">Fecha Cierre</th>
                           <th className="py-2 px-4">Admin</th>
                           <th className="py-2 px-4 text-right">Estado</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-50 text-xs">
                        {history.length > 0 ? history.map((h: any, i: number) => (
                           <tr key={i} className="hover:bg-slate-50/50">
                              <td className="py-2 px-4 font-black text-slate-700 uppercase">{h.periodo}</td>
                              <td className="py-2 px-4 font-bold text-slate-400">{h.fecha_cierre}</td>
                              <td className="py-2 px-4 font-bold text-slate-500 uppercase">{h.admin}</td>
                              <td className="py-2 px-4 text-right">
                                 <span className={`inline-flex items-center gap-2 px-2 py-0.5 rounded text-[9px] font-black uppercase ${h.estado === 'CERRADO' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {h.estado === 'CERRADO' ? <Lock size={10} /> : <Unlock size={10} />} {h.estado}
                                 </span>
                              </td>
                           </tr>
                        )) : (
                          <tr>
                            <td colSpan={4} className="py-6 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                              No hay periodos cerrados
                            </td>
                          </tr>
                        )}
                     </tbody>
                  </table>
               </div>
            </article>

            {/* Warning Sidebar */}
            <aside className="space-y-4">
               <article className="bg-red-500 p-4 rounded-2xl text-white shadow-2xl relative overflow-hidden group">
                  <div className="relative z-10 space-y-3">
                     <div className="flex items-center gap-2">
                        <div className="bg-white/20 p-1.5 rounded-lg">
                           <AlertCircle size={16} />
                        </div>
                        <h2 className="text-base font-black uppercase tracking-tighter leading-none">Alerta de Cierre</h2>
                     </div>
                     <div className="space-y-2">
                        <div className="bg-white/10 p-3 rounded-xl border border-white/20">
                           <strong className="text-xs uppercase block font-black">{metrics.pendientes} Asientos pendientes</strong>
                           <p className="text-[9px] font-bold text-white/60 uppercase mt-1">Completar antes del vencimiento para cumplimiento SENIAT.</p>
                        </div>
                     </div>
                  </div>
                  <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-3xl" />
               </article>
            </aside>
          </div>
        </>
      )}

      {/* Reopen Modal */}
      {showReopenModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
           <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm" onClick={() => setShowReopenModal(false)} />
           <div className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-red-100">
              <div className="p-8 border-b border-red-50 flex justify-between items-center bg-red-50/50">
                 <div className="space-y-1">
                    <h2 className="text-2xl font-black text-red-600 uppercase tracking-tighter leading-none">Reapertura Especial</h2>
                    <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest leading-none">Acción crítica de auditoría.</p>
                 </div>
                 <button onClick={() => setShowReopenModal(false)} className="p-2 hover:bg-red-100 rounded-full transition-colors text-red-400">
                    <X size={24} />
                 </button>
              </div>

              <div className="p-8 space-y-6">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Periodo a Reabrir</label>
                    <select 
                      value={reopenPeriod}
                      onChange={(e) => setReopenPeriod(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-[#0b5156] outline-none focus:border-red-500 appearance-none"
                    >
                       {history.filter((h: any) => h.estado === 'CERRADO').map((h: any, i: number) => (
                         <option key={i} value={h.periodo}>{h.periodo}</option>
                       ))}
                    </select>
                 </div>

                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Justificación Técnica (Obligatoria)</label>
                    <textarea 
                      value={reopenJustification}
                      onChange={(e) => setReopenJustification(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-[#0b5156] outline-none focus:border-red-500 h-24 resize-none" 
                      placeholder="Indique motivo del ajuste y nro. ticket auditoría..."
                    />
                 </div>

                 <div className="p-6 bg-red-50 rounded-2xl border border-red-100 flex gap-4">
                    <AlertTriangle size={24} className="text-red-500 shrink-0" />
                    <p className="text-[9px] font-bold text-red-700 uppercase leading-relaxed">
                       Esta acción habilitará la edición en módulos operativos para periodos cerrados. Generará un log permanente con su usuario.
                    </p>
                 </div>

                 <div className="grid grid-cols-2 gap-4 items-start">
                    <button onClick={() => setShowReopenModal(false)} className="py-4 text-[10px] font-black uppercase text-slate-500 hover:text-slate-700">Cancelar</button>
                    <button onClick={handleReabrir} disabled={reopenJustification.length < 10} className="py-4 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase shadow-lg shadow-red-900/20 hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                       <Unlock size={14} /> Confirmar
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default PeriodClosing;
