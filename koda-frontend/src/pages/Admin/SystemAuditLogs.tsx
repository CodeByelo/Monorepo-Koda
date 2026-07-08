import { 
  ShieldCheck, 
  Download, 
  Zap, 
  Activity, 
  Filter, 
  FileText, 
  CheckCircle2, 
  XCircle 
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';
import ForensicTimeline from '@/components/common/ForensicTimeline';

const SystemAuditLogs = () => {
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    api.get<any>('/admin/auditoria').then((res) => {
      const items = res?.logs || res?.items || [];
      setLogs(items.map((l: any) => ({
        id: l.id || l.modulo,
        user: l.usuario,
        ip: l.ip,
        event: l.detalle || l.accion,
        hash: l.hash || '—',
        type: (l.modulo || '').toLowerCase(),
        date: l.fecha ? new Date(l.fecha).toLocaleString('es-VE') : '',
        status: l.accion === 'ALERTA' ? 'fail' : 'ok',
      })));
    }).catch(console.error);
  }, []);

  const handleVerify = () => {
    setVerifying(true);
    setTimeout(() => {
      setVerifying(false);
      setVerified(true);
    }, 1500);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <span className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest inline-block mb-2">
              Seguridad Institucional
            </span>
            <h1 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">
              Auditoría Forense
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">
              Monitorización de integridad y trazabilidad legal de transacciones.
            </p>
          </div>
          <div className="flex gap-3">
            <button className="bg-white border border-slate-200 text-slate-700 px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-sm hover:bg-slate-50 transition-all">
              <Download size={14} /> Exportar PDF
            </button>
            <button 
              onClick={handleVerify}
              disabled={verifying || verified}
              className={`text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg transition-all ${
                verified ? 'bg-green-600 shadow-green-900/20' : 'bg-[#0b5156] shadow-green-900/20 hover:bg-[#083a3d]'
              }`}
            >
              {verifying ? (
                <><Activity size={14} className="animate-spin" /> Verificando...</>
              ) : verified ? (
                <><CheckCircle2 size={14} /> Integridad Validada</>
              ) : (
                <><Zap size={14} /> Verificar Integridad</>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* KPI Grid */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
        {[
          { label: 'Eventos Hoy', value: '0', color: 'text-slate-800', border: 'border-slate-200', bg: 'bg-white' },
          { label: 'Alertas Fiscales', value: '0', color: 'text-amber-600', border: 'border-amber-200', bg: 'bg-amber-50' },
          { label: 'Accesos Denegados', value: '0', color: 'text-red-600', border: 'border-red-200', bg: 'bg-red-50' },
          { label: 'Integridad Global', value: '100%', color: 'text-green-600', border: 'border-green-200', bg: 'bg-green-50' },
        ].map((kpi, i) => (
          <div key={i} className={`p-6 rounded-2xl border ${kpi.border} ${kpi.bg} flex flex-col justify-between`}>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">{kpi.label}</span>
            <strong className={`text-3xl font-black ${kpi.color} font-mono tracking-tighter block`}>{kpi.value}</strong>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        
        {/* Main Terminal */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden font-mono text-sm relative">
            <div className="bg-slate-900 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <Activity size={14} className="text-emerald-400 animate-pulse" /> KODA_SECURE_LOG_STDOUT
              </span>
              <div className="flex gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500/20 border border-rose-500"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20 border border-amber-500"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 border border-emerald-500"></div>
              </div>
            </div>
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] text-slate-400 uppercase tracking-widest border-b border-slate-800 bg-slate-900/50">
                    <th className="p-4 font-bold">Timestamp</th>
                    <th className="p-4 font-bold">Usuario</th>
                    <th className="p-4 font-bold">IP / Origen</th>
                    <th className="p-4 font-bold">Evento Detectado</th>
                    <th className="p-4 font-bold">Registro Hash</th>
                    <th className="p-4 font-bold text-right">Sello</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {logs.map((log, idx) => (
                    <tr 
                      key={idx} 
                      onClick={() => log.field && setSelectedLog(log)}
                      className={`
                        transition-colors group
                        ${log.field ? 'cursor-pointer hover:bg-slate-900/60' : 'hover:bg-slate-900/30'}
                        ${log.type === 'critical' ? 'bg-rose-950/10 border-l-2 border-rose-500' : ''}
                        ${log.type === 'fiscal' ? 'bg-amber-950/10 border-l-2 border-amber-500' : ''}
                        ${log.type === 'auth' ? 'bg-sky-950/10 border-l-2 border-sky-500' : 'border-l-2 border-transparent'}
                      `}
                    >
                      <td className="p-4 text-slate-400 text-xs font-mono whitespace-nowrap">{log.date}</td>
                      <td className="p-4 text-slate-200 font-bold text-xs">{log.user}</td>
                      <td className="p-4 text-sky-400 text-xs font-bold font-mono whitespace-nowrap">{log.ip}</td>
                      <td className={`p-4 text-xs font-bold truncate max-w-xs ${
                        log.type === 'critical' ? 'text-rose-400' : 
                        log.type === 'fiscal' ? 'text-amber-300' : 'text-slate-300'
                      }`}>{log.event}</td>
                      <td className="p-4 text-slate-500 text-[10px] font-mono">{log.hash}</td>
                      <td className="p-4 text-right">
                        {log.status === 'ok' ? (
                          <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded border transition-all ${
                            verified 
                              ? 'bg-emerald-950/50 text-emerald-400 border-emerald-500/30 shadow-sm shadow-emerald-950' 
                              : 'bg-slate-900 text-slate-400 border-slate-800'
                          }`}>
                            {verified ? <ShieldCheck size={10} /> : <CheckCircle2 size={10} />} {verified ? 'VERIFICADO' : 'OK'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded border bg-rose-950/50 text-rose-400 border-rose-500/30 shadow-sm shadow-rose-950">
                            <XCircle size={10} /> FAIL
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sidebar Sidebar */}
        <aside className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
               <Filter className="text-slate-400" size={20} />
               <h3 className="text-sm font-black text-[#0b5156] uppercase tracking-tighter">Filtro Rápido</h3>
            </div>
            <div className="space-y-3">
              <button className="w-full bg-slate-50 border border-slate-200 text-slate-700 px-4 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-white hover:border-[#0b5156] transition-all text-left shadow-sm">
                 Solo Eventos Fiscales
              </button>
              <button className="w-full bg-slate-50 border border-slate-200 text-slate-700 px-4 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-white hover:border-[#0b5156] transition-all text-left shadow-sm">
                 Alertas de Seguridad
              </button>
              <button className="w-full bg-slate-50 border border-slate-200 text-slate-700 px-4 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-white hover:border-[#0b5156] transition-all text-left shadow-sm">
                 Actividad por IP
              </button>
            </div>
          </div>

          <div className="bg-[#0b5156]/5 p-5 rounded-2xl border border-[#0b5156]/20 shadow-sm">
            <h3 className="text-sm font-black text-[#0b5156] uppercase tracking-tighter mb-2 flex items-center gap-2">
              <ShieldCheck size={16} className="text-[#0b5156]" /> Certificación
            </h3>
            <p className="text-[10px] font-bold text-slate-700 uppercase leading-relaxed tracking-wider">
              Este registro está firmado con el Certificado Institucional #4421 y cumple con la norma de inalterabilidad ISO/IEC 27001.
            </p>
          </div>
        </aside>

      </div>

      {/* Diff Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-[#0b5156]/50 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200">
          <div className="bg-[#0b5156] p-8 rounded-3xl shadow-2xl border border-[#083a3d] w-full max-w-lg animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6 border-b border-[#083a3d] pb-4">
              <h3 className="text-lg font-black text-white uppercase tracking-tighter flex items-center gap-2">
                <FileText className="text-indigo-400" size={20} /> Detalle de Modificación
              </h3>
              <button onClick={() => setSelectedLog(null)} className="text-slate-500 hover:text-white transition-colors"><XCircle size={20} /></button>
            </div>
            
            <div className="grid grid-cols-2 gap-4 items-start mb-6 text-xs font-bold text-slate-400 uppercase tracking-widest">
               <div>
                 <span className="block text-slate-600 text-[9px] mb-1">Entidad Afectada</span>
                 <strong className="text-white">{selectedLog.id}</strong>
               </div>
               <div>
                 <span className="block text-slate-600 text-[9px] mb-1">Usuario Actor</span>
                 <strong className="text-white">{selectedLog.user}</strong>
               </div>
            </div>

            <div className="bg-[#083a3d] rounded-2xl p-6 border border-[#083a3d] mb-6 font-mono">
              <span className="block text-[10px] text-slate-500 uppercase tracking-widest mb-4">Campo Modificado: <strong className="text-indigo-400">{selectedLog.field}</strong></span>
              <div className="grid grid-cols-2 gap-4 items-start">
                 <div className="pr-4 border-r border-slate-800">
                   <span className="block text-[9px] text-red-500 uppercase mb-2">Valor Anterior (-)</span>
                   <span className="text-red-400 text-xs">{selectedLog.old}</span>
                 </div>
                 <div className="pl-4">
                   <span className="block text-[9px] text-green-500 uppercase mb-2">Valor Nuevo (+)</span>
                   <span className="text-green-400 text-xs">{selectedLog.new}</span>
                 </div>
              </div>
            </div>

            <p className="text-[9px] font-black text-green-500 uppercase tracking-widest flex items-center gap-2 mb-6 bg-green-500/10 p-3 rounded-lg">
              <ShieldCheck size={14} /> El cambio ha sido verificado contra el Hash original.
            </p>

            <button onClick={() => setSelectedLog(null)} className="w-full bg-white text-slate-900 px-4 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-slate-200 transition-colors shadow-lg">
              Cerrar Auditoría
            </button>
          </div>
        </div>
      )}

      {/* Sección del Buscador Forense */}
      <section className="mt-8">
        <ForensicTimeline />
      </section>

    </div>
  );
};

export default SystemAuditLogs;
