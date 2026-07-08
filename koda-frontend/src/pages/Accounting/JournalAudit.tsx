import { 
  ArrowLeft,
  ShieldAlert,
  Download,
  Lock,
  User,
  ArrowRight,
  CheckCircle2,
  Database,
  Terminal
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const JournalAudit = () => {
  const logs: any[] = [];
  
  const [auditData, setAuditData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAudit = async () => {
      try {
        setIsLoading(true);
        const res = await api.get<any>('/contabilidad/auditoria-ia');
        setAuditData(res);
      } catch (err) {
        console.error("Error fetching audit data:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAudit();
  }, []);

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <Link to="/contabilidad" className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-[#0b5156]/20 transition-all">
                <ArrowLeft size={10} /> Volver
              </Link>
              <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Contabilidad &gt; Auditoría Forense
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Log de Auditoría de Asientos y Análisis Forense</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Registro inmutable de transacciones y detección automatizada de inconsistencias mediante Inteligencia Artificial.</p>
          </div>
          <div className="flex gap-2">
             <button disabled className="bg-white text-slate-400 px-6 py-2 rounded-xl text-[10px] font-black uppercase border border-slate-200 flex items-center gap-2 cursor-not-allowed">
                <Lock size={14} /> Solo Lectura
             </button>
             <button className="bg-[#0b5156] text-white px-8 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <Download size={14} /> Exportar Log SHA-256
             </button>
          </div>
        </div>
      </header>

      {/* Panel de Auditoría Forense */}
      <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
           <h3 className="text-base font-black text-[#0b5156] uppercase tracking-tight flex items-center gap-2">
             <ShieldAlert size={18} className="text-red-500" /> Hallazgos de Auditoría Forense ({auditData?.total_alertas || 0})
           </h3>
           <span className="text-[10px] font-black uppercase bg-slate-100 px-3 py-1 rounded-full text-slate-500">
             Reglas de Control Interno
           </span>
        </div>
        
        {isLoading ? (
          <p className="text-center py-6 text-xs font-bold text-slate-400 uppercase animate-pulse">Analizando base de datos...</p>
        ) : auditData?.alertas?.length === 0 ? (
          <div className="text-center py-6">
            <span className="bg-green-100 text-green-700 text-[10px] font-black px-4 py-2 rounded-full uppercase tracking-widest border border-green-200">
              ✓ Todo Cuadrado: Cero Inconsistencias
            </span>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-2">
            {auditData?.alertas?.map((al: any, idx: number) => (
              <div key={idx} className={`p-3.5 rounded-xl border flex gap-3 items-start ${
                al.gravedad === 'CRÍTICA' ? 'bg-red-50 border-red-200 text-red-800' :
                al.gravedad === 'ALTA' ? 'bg-orange-50 border-orange-200 text-orange-800' :
                'bg-amber-50 border-amber-200 text-amber-800'
              }`}>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${
                  al.gravedad === 'CRÍTICA' ? 'bg-red-200 text-red-900' :
                  al.gravedad === 'ALTA' ? 'bg-orange-200 text-orange-900' :
                  'bg-amber-200 text-amber-900'
                }`}>
                  {al.gravedad}
                </span>
                <div className="space-y-0.5">
                  <strong className="text-[10px] uppercase font-black tracking-wide block">{al.tipo}</strong>
                  <p className="text-xs leading-relaxed font-bold uppercase">{al.mensaje}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Audit Logs Matrix */}
      <article className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-2.5 px-4">Timestamp / Usuario</th>
                <th className="py-2.5 px-4 text-center">Acción</th>
                <th className="py-2.5 px-4">Comprobante</th>
                <th className="py-2.5 px-4">Cambios (JSON Diff)</th>
                <th className="py-2.5 px-4 text-right">Firma Digital</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs">
              {logs.length === 0 ? (
                 <tr>
                    <td colSpan={5} className="py-20 text-center">
                       <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tighter mb-1">Sin Logs de Auditoría</h3>
                       <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No hay registros de auditoría en el sistema.</p>
                    </td>
                 </tr>
              ) : (
                logs.map((log, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="py-2 px-4">
                       <div className="space-y-1">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter block">{log.timestamp}</span>
                          <div className="flex items-center gap-2">
                             <div className="w-5 h-5 bg-slate-50 rounded-full flex items-center justify-center text-[#0b5156] border border-slate-100">
                                <User size={10} />
                             </div>
                             <strong className="text-slate-700 font-black uppercase">{log.user}</strong>
                          </div>
                       </div>
                    </td>
                    <td className="py-2 px-4 text-center">
                      <span className={`${log.actionColor} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2 px-4">
                       <Link to={`/contabilidad/asiento/${log.id}`} className="text-[#0b5156] font-black font-mono hover:underline flex items-center gap-1 uppercase text-[10px]">
                          {log.id} <ArrowRight size={10} />
                       </Link>
                    </td>
                    <td className="py-2 px-4">
                       <div className="bg-slate-50 rounded-lg p-2 border border-slate-100 group-hover:border-[#0b5156]/20 transition-all overflow-hidden relative max-w-xs">
                          <pre className="text-[9px] text-[#0b5156] font-mono leading-tight">
                             {JSON.stringify(log.changes, null, 2)}
                          </pre>
                          <Terminal size={12} className="absolute right-1 top-1 text-[#0b5156]/10" />
                       </div>
                    </td>
                    <td className="py-2 px-4 text-right font-mono text-[9px] text-slate-500 group-hover:text-[#0b5156] transition-colors">
                       <code>{log.hash}</code>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Forensic Alert */}
      <article className="p-4 bg-red-500 rounded-xl text-white shadow-lg relative overflow-hidden group">
         <div className="relative z-10 flex gap-4">
            <div className="bg-white/20 p-2.5 rounded-xl border border-white/30 h-fit">
               <ShieldAlert size={24} className="text-white" />
            </div>
            <div className="space-y-1.5">
               <h3 className="text-sm font-black uppercase tracking-tighter">Certificación Forense KODA</h3>
               <p className="text-[10px] font-bold text-white/80 uppercase leading-relaxed max-w-4xl">
                  Este log es de <strong>solo lectura</strong> y no puede ser modificado ni eliminado, incluso por usuarios con privilegios administrativos. Cada entrada está encadenada mediante un hash criptográfico SHA-256 para garantizar la integridad de la prueba ante auditorías externas o procesos legales.
               </p>
               <div className="flex gap-3">
                  <div className="bg-white/10 px-3 py-1 rounded-lg border border-white/20 text-[9px] font-black uppercase flex items-center gap-1.5">
                     <CheckCircle2 size={12} className="text-white" /> Registro Inmutable
                  </div>
                  <div className="bg-white/10 px-3 py-1 rounded-lg border border-white/20 text-[9px] font-black uppercase flex items-center gap-1.5">
                     <Database size={12} className="text-white" /> Auditoría Nivel 3
                  </div>
               </div>
            </div>
         </div>
         <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-white/5 rounded-full blur-[100px] group-hover:scale-125 transition-transform duration-1000" />
      </article>
    </div>
  );
};

export default JournalAudit;
