import { 
  ArrowLeft,
  Download,
  FileX,
  Percent,
  Package,
  CreditCard,
  Lock,
  Search,
  Filter,
  User,
  Clock,
  Scale
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const ControlExceptionsReport = () => {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [modalMessage, setModalMessage] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showHighRiskOnly, setShowHighRiskOnly] = useState(false);

  useEffect(() => {
    const fetchExceptions = async () => {
      try {
        const res = await api.get<any>('/reportes/excepciones');
        setData(res);
      } catch (error) {
        console.error("Error fetching control exceptions:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchExceptions();
  }, []);

  const handleLockPeriod = () => {
    setShowConfirm(true);
  };

  const executeLockPeriod = async () => {
    setShowConfirm(false);
    try {
      setIsLoading(true);
      await api.post('/reportes/bloquear');
      setModalMessage("Período crítico bloqueado exitosamente.");
      const res = await api.get<any>('/reportes/excepciones');
      setData(res);
    } catch (error) {
      console.error("Error locking period:", error);
      setModalMessage("Error al bloquear el período.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      await api.download('/reportes/exportar?reporte=excepciones', 'reporte_excepciones.csv');
    } catch (error) {
      console.error("Error exporting exceptions:", error);
      setModalMessage("Error al exportar reporte de excepciones.");
    }
  };

  const metrics = data?.metrics || [];

  const exceptions = data?.exceptions || [];
  const filteredExceptions = exceptions.filter((ex: any) => {
    const userMatch = (ex.user || ex.usuario || "").toLowerCase().includes(searchQuery.toLowerCase());
    const refMatch = (ex.ref || ex.referencia || "").toLowerCase().includes(searchQuery.toLowerCase());
    const typeMatch = (ex.type || ex.tipo || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSearch = userMatch || refMatch || typeMatch;
    const matchesRisk = showHighRiskOnly ? ['ALTO', 'CRÍTICO'].includes((ex.risk || ex.riesgo || '').toUpperCase()) : true;
    return matchesSearch && matchesRisk;
  });

  const insight = data?.insight || "Este informe consolida acciones que, si bien son necesarias en la operatividad diaria, representan los puntos de fuga más comunes de patrimonio. Se recomienda la auditoría física de los soportes que justifican estas excepciones.";

  return (
    <div className="space-y-1.5 animate-in fade-in duration-500 pb-4">
      {/* Header */}
      <header className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <Link to="/reportes" className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-[#0b5156]/20 transition-all">
                <ArrowLeft size={10} /> Volver
              </Link>
              <span className="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Auditoría de Control Interno
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Informe de Excepciones de Control</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Consolidado de acciones críticas que afectan el patrimonio y se desvían de los flujos estándar.</p>
          </div>
          <div className="flex gap-2">
             <button 
               onClick={handleLockPeriod}
               className="bg-red-600 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-red-900/20 hover:bg-red-700 transition-all"
             >
                <Lock size={14} /> Bloquear Período Crítico
             </button>
             <button 
               onClick={handleExport}
               className="bg-[#0b5156] text-white px-8 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
             >
                <Download size={14} /> Exportar Reporte de Riesgo
             </button>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
        {metrics.map((m: any, i: number) => {
          let IconComp = m.icon;
          if (!IconComp) {
            if (m.type === 'percent') IconComp = <Percent size={16} className={m.color} />;
            else if (m.type === 'package') IconComp = <Package size={16} className={m.color} />;
            else if (m.type === 'credit') IconComp = <CreditCard size={16} className={m.color} />;
            else IconComp = <FileX size={16} className={m.color} />;
          }
          return (
          <div key={i} className={`bg-white p-3 rounded-xl border-t-4 ${m.borderColor || 'border-slate-300'} border-x border-b border-slate-200 shadow-sm flex flex-col justify-between h-24 hover:border-[#0b5156]/20 transition-all`}>
             <div className="flex justify-between items-start">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{m.label || m.etiqueta}</span>
                {IconComp}
             </div>
             <div className="space-y-0.5">
                <strong className={`text-lg font-black tracking-tighter font-mono ${m.color || 'text-[#0b5156]'}`}>{m.value || m.valor}</strong>
                <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">{m.desc || m.descripcion}</p>
             </div>
          </div>
          )
        })}
      </section>

      {/* Exceptions Log Table */}
      <article className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="py-2.5 px-3.5 border-b border-slate-100 flex flex-col md:row justify-between items-start md:items-center gap-3 bg-slate-50/30">
          <div className="space-y-0.5">
            <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Bitácora de Acciones de Alto Riesgo</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-0.5">Eventos detectados en las últimas 72 horas que requieren revisión.</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
             <div className="relative flex-1 md:flex-none">
                <Search className="absolute left-3 top-2 text-slate-400" size={12} />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar usuario o referencia..." 
                  className="w-full md:w-64 bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156] shadow-sm" 
                />
             </div>
             <button 
               onClick={() => setShowHighRiskOnly(!showHighRiskOnly)}
               title="Mostrar solo riesgo ALTO"
               className={`p-1.5 rounded-lg border shadow-sm transition-all ${
                 showHighRiskOnly 
                   ? 'bg-[#0b5156] text-white border-[#0b5156]' 
                   : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
               }`}
             >
                <Filter size={14} />
             </button>
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-2.5 px-4">Fecha/Hora</th>
                <th className="py-2.5 px-4">Tipo</th>
                <th className="py-2.5 px-4">Usuario</th>
                <th className="py-2.5 px-4">Referencia</th>
                <th className="py-2.5 px-4 text-right">Valor Afectado</th>
                <th className="py-2.5 px-4">Justificación</th>
                <th className="py-2.5 px-4 text-center">Riesgo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs">
              {filteredExceptions.length > 0 ? filteredExceptions.map((ex: any, i: number) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors group">
                  <td className="py-2 px-4">
                    <div className="flex items-center gap-2 text-slate-400 font-bold">
                       <Clock size={12} /> {ex.time || ex.fecha}
                    </div>
                  </td>
                  <td className="py-2 px-4">
                    <span className={`${ex.typeColor || 'bg-slate-100 text-slate-700'} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight`}>
                      {ex.type || ex.tipo}
                    </span>
                  </td>
                  <td className="py-2 px-4">
                    <div className="flex items-center gap-2">
                       <div className="w-5 h-5 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400">
                          <User size={10} />
                       </div>
                       <strong className="text-slate-700 uppercase font-black">{ex.user || ex.usuario}</strong>
                    </div>
                  </td>
                  <td className="py-2 px-4 text-slate-500 font-bold uppercase">{ex.ref || ex.referencia}</td>
                  <td className="py-2 px-4 text-right font-mono font-black text-[#0b5156]">{ex.value || ex.valor}</td>
                  <td className="py-2 px-4">
                    <p className="text-[10px] text-slate-400 font-bold italic">"{ex.justification || ex.justificacion}"</p>
                  </td>
                  <td className="py-2 px-4 text-center">
                    <span className={`${ex.riskColor || 'bg-slate-100 text-slate-700'} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight`}>
                      {ex.risk || ex.riesgo}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="text-center p-4 text-xs font-bold text-slate-400 uppercase">Sin excepciones registradas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Internal Control Alert */}
      <div className="p-4 bg-red-50/50 border border-red-100 rounded-xl flex gap-4 items-center group shadow-sm">
         <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-red-600 border border-slate-100 shadow-sm group-hover:scale-110 transition-transform">
            <Scale size={18} />
         </div>
         <div className="flex-1 space-y-0.5">
            <h4 className="text-xs font-black text-red-700 uppercase tracking-tighter">⚖️ Advertencia de Control Interno</h4>
            <p className="text-[10px] font-bold text-slate-500 uppercase leading-relaxed max-w-4xl">
               {insight}
            </p>
         </div>
      </div>

      {showConfirm && (
         <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
           <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
             <div className="bg-red-600 p-4 text-white flex items-center justify-between">
               <h3 className="text-xs font-black uppercase tracking-widest">Confirmar Acción</h3>
               <button 
                 onClick={() => setShowConfirm(false)}
                 className="text-white/70 hover:text-white text-xs font-bold uppercase transition-colors"
               >
                 ✕
               </button>
             </div>
             <div className="p-6 space-y-4">
               <p className="text-slate-600 text-xs font-bold uppercase tracking-tight leading-relaxed">
                 ¿Está seguro de que desea bloquear este período crítico para auditoría? Esta acción registrará un evento inmutable en el log.
               </p>
               <div className="flex justify-end gap-2">
                 <button 
                   onClick={() => setShowConfirm(false)}
                   className="bg-white text-slate-500 border border-slate-200 px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all"
                 >
                   Cancelar
                 </button>
                 <button 
                   onClick={executeLockPeriod}
                   className="bg-red-600 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-red-900/20 hover:bg-red-700 transition-all"
                 >
                   Confirmar y Bloquear
                 </button>
               </div>
             </div>
           </div>
         </div>
       )}

       {modalMessage && (
         <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
           <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
             <div className="bg-[#0b5156] p-4 text-white flex items-center justify-between">
               <h3 className="text-xs font-black uppercase tracking-widest">Aviso del Sistema</h3>
               <button 
                 onClick={() => setModalMessage(null)}
                 className="text-white/70 hover:text-white text-xs font-bold uppercase transition-colors"
               >
                 ✕
               </button>
             </div>
             <div className="p-6 space-y-4">
               <p className="text-slate-600 text-xs font-bold uppercase tracking-tight leading-relaxed">
                 {modalMessage}
               </p>
               <div className="flex justify-end gap-2">
                 <button 
                   onClick={() => setModalMessage(null)}
                   className="bg-[#0b5156] text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
                 >
                   Aceptar
                 </button>
               </div>
             </div>
           </div>
         </div>
       )}
    </div>
  );
};

export default ControlExceptionsReport;
