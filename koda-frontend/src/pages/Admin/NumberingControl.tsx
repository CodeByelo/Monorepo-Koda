import { 
  Link as LinkIcon,
  Download,
  Printer,
  History,
  CheckCircle2,
  XCircle,
  Activity,
  Edit2,
  X,
  Save
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const NumberingControl = () => {
  const [series, setSeries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSerie, setEditingSerie] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [diagnosticoResult, setDiagnosticoResult] = useState<any>(null);
  const [showDiagnostico, setShowDiagnostico] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const fetchSeries = async () => {
    setLoading(true);
    try {
      const data = await api.get<any[]>('/admin/numeracion');
      setSeries(data || []);
      
      const auditRes = await api.get<any>('/admin/auditoria');
      if (auditRes && auditRes.logs) {
        // Filter by NUMERACION module
        setAuditLogs(auditRes.logs.filter((l: any) => l.modulo === 'NUMERACION'));
      }
    } catch (error) {
      console.error("Error fetching series:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSeries();
  }, []);

  const handleEditClick = (s: any) => {
    setEditingSerie({ ...s });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSerie) return;
    setIsSaving(true);
    try {
      await api.put(`/admin/numeracion/${editingSerie.id}`, {
        prefijo: editingSerie.prefijo,
        ultimo_numero: parseInt(editingSerie.ultimo_numero) || 0,
        activo: editingSerie.activo
      });
      alert("Serie actualizada exitosamente.");
      setEditingSerie(null);
      fetchSeries();
    } catch (error) {
      console.error(error);
      alert("Error al actualizar la serie.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiagnostico = async () => {
    try {
      const res = await api.post<any>('/admin/numeracion/diagnostico', {});
      setDiagnosticoResult(res);
      setShowDiagnostico(true);
    } catch (error) {
      console.error(error);
      alert('Error al ejecutar diagnóstico fiscal.');
    }
  };

  const handleAuditoriaSalto = async () => {
    try {
      const res = await api.get<any>('/admin/auditoria/export');
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `auditoria_numeracion_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert('Error al exportar auditoría.');
    }
  };

  const getModuloLabel = (mod: string) => {
    const labels: any = {
      'factura': 'Facturas de Venta',
      'nota_credito': 'Notas de Crédito',
      'retencion_iva': 'Retenciones de IVA',
      'retencion_islr': 'Retenciones de ISLR'
    };
    return labels[mod] || mod;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <span className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest inline-block mb-2">
              Administración / Inteligencia Fiscal
            </span>
            <h1 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">
              Control de Correlativos
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">
              Monitor proactivo de folios, proyección de agotamiento y estado de hardware fiscal.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleAuditoriaSalto}
              className="bg-[#0b5156] text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
            >
              <LinkIcon size={14} /> Auditoría de Salto
            </button>
            <button
              onClick={handleAuditoriaSalto}
              className="bg-white border border-slate-200 text-slate-700 px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-sm hover:bg-slate-50 transition-all"
            >
              <Download size={14} /> Exportar Registros
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Main Area */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Folios Grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {loading ? (
              <div className="col-span-2 bg-white p-12 rounded-3xl border border-slate-200 text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest animate-pulse">Cargando series...</p>
              </div>
            ) : series.map((s) => {
              const moduloTitle = getModuloLabel(s.modulo);
              const color = s.modulo === 'factura' ? 'bg-amber-500' : 'bg-[#0b5156]';
              const textClass = s.modulo === 'factura' ? 'text-amber-600 bg-amber-50' : 'text-[#0b5156] bg-[#0b5156]/10';
              return (
                <article key={s.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
                  <div className={`absolute top-0 left-0 w-full h-1 ${color}`}></div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm font-black text-slate-800 uppercase tracking-tighter">{moduloTitle}</span>
                    <span className={`font-mono text-xs font-bold px-2 py-1 rounded ${textClass}`}>SERIE {s.prefijo}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 items-start mb-4">
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Siguiente Nº</span>
                      <strong className="text-2xl font-black text-[#0b5156] font-mono tracking-tighter">{s.siguiente}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Último Nº</span>
                      <strong className="text-lg font-black text-slate-700 font-mono tracking-tighter">{s.ultimo_numero}</strong>
                    </div>
                  </div>
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                      <span>Uso de Talonario</span>
                      <span>{s.usoPorcentaje}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div className={`${color} h-2 rounded-full`} style={{ width: `${s.usoPorcentaje}%` }}></div>
                    </div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl flex justify-between items-center border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Agotamiento estimado:</span>
                    <span className="text-xs font-black text-slate-700 uppercase">{s.agotamientoDias} Días</span>
                  </div>
                </article>
              );
            })}
          </section>

          {/* Configuración Maestra de Series */}
          <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter mb-6">Configuración Maestra de Series</h3>
            
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <th className="pb-4 px-4 text-left">Documento</th>
                    <th className="pb-4 px-4">Prefijo</th>
                    <th className="pb-4 px-4">Último Nº</th>
                    <th className="pb-4 px-4">Siguiente Nº</th>
                    <th className="pb-4 px-4 text-center">Estado</th>
                    <th className="pb-4 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {series.length > 0 ? series.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-black text-slate-800 text-xs text-left uppercase">{getModuloLabel(s.modulo)}</td>
                      <td className="p-4 font-mono font-bold text-[#0b5156] text-xs">{s.prefijo}</td>
                      <td className="p-4 font-mono text-xs text-slate-600">{s.ultimo_numero}</td>
                      <td className="p-4 font-mono text-xs text-slate-600">{s.siguiente}</td>
                      <td className="p-4 text-center">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${s.activo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {s.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button 
                          onClick={() => handleEditClick(s)} 
                          className="bg-slate-50 border border-slate-200 text-slate-600 p-2 rounded-xl hover:bg-[#0b5156] hover:text-white hover:border-[#0b5156] transition-all"
                        >
                          <Edit2 size={12} />
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="py-12 text-center">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sin series documentales configuradas</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

        </div>

        {/* Sidebar */}
        <aside className="lg:col-span-1 space-y-6">
          
          {/* Hardware Status */}
          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
               <Printer className="text-[#0b5156]" size={20} />
               <h4 className="text-sm font-black text-[#0b5156] uppercase tracking-tighter">Estado de Hardware</h4>
            </div>

            <div className="space-y-3">
              <div className="text-center p-4">
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sin impresoras fiscales vinculadas</p>
              </div>
            </div>

            <button
              onClick={handleDiagnostico}
              className="w-full mt-6 bg-white border border-slate-200 text-[#0b5156] px-4 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all flex items-center justify-center gap-2 shadow-sm"
            >
               <Activity size={14} /> Diagnóstico Fiscal
            </button>
          </div>

          {/* Audit Log */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 mb-2">
               <History className="text-slate-400" size={20} />
               <h4 className="text-sm font-black text-slate-600 uppercase tracking-tighter">Historial de Cambios</h4>
            </div>

            <div className="max-h-[300px] overflow-y-auto pr-1 space-y-3 no-scrollbar">
               {auditLogs.length > 0 ? (
                 auditLogs.map((log) => (
                   <div key={log.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                     <div className="flex justify-between items-center">
                       <span className="text-[9px] font-black text-[#0b5156]">{log.user}</span>
                       <span className="text-[8px] font-bold text-slate-400">{log.date}</span>
                     </div>
                     <p className="text-[10px] font-bold text-slate-700 normal-case leading-normal">{log.event}</p>
                     <span className="text-[8px] font-bold text-slate-400 block">IP: {log.ip}</span>
                   </div>
                 ))
               ) : (
                 <div className="text-center py-6">
                   <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Sin modificaciones registradas</p>
                 </div>
               )}
            </div>
            
            <div className="border-t border-slate-100 pt-4 space-y-3 text-xs font-bold uppercase text-slate-500">
               <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                 <span className="text-[9px] text-[#0b5156]">SERIES ACTIVAS</span>
                 <span className="text-slate-700">{series.filter(s => s.activo).length} / {series.length}</span>
               </div>
            </div>
          </div>

        </aside>

      </div>

      {/* Modal de Edición de Serie */}
      {editingSerie && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200 p-4">
          <div className="bg-white p-8 rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md animate-in zoom-in-95 duration-200 relative">
             <button 
               onClick={() => setEditingSerie(null)}
               className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
             >
               <X size={18} />
             </button>
             <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter mb-2">Editar Serie Fiscal</h2>
             <p className="text-xs font-bold text-slate-500 uppercase mb-6 leading-tight">
               Modifique los parámetros de la serie de {getModuloLabel(editingSerie.modulo)}.
             </p>

             <form onSubmit={handleSaveEdit} className="space-y-4">
               <div>
                 <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Prefijo de la Serie</label>
                 <input 
                   type="text" 
                   required
                   value={editingSerie.prefijo}
                   onChange={e => setEditingSerie({...editingSerie, prefijo: e.target.value})}
                   className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#0b5156]"
                 />
               </div>
               <div>
                 <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Último Número Usado</label>
                 <input 
                   type="number" 
                   required
                   value={editingSerie.ultimo_numero}
                   onChange={e => setEditingSerie({...editingSerie, ultimo_numero: e.target.value})}
                   className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#0b5156]"
                 />
               </div>
               <div className="flex items-center gap-3 py-2">
                 <input 
                   type="checkbox" 
                   id="edit-activo"
                   checked={editingSerie.activo}
                   onChange={e => setEditingSerie({...editingSerie, activo: e.target.checked})}
                   className="w-4 h-4 text-[#0b5156] border-slate-300 rounded focus:ring-[#0b5156]"
                 />
                 <label htmlFor="edit-activo" className="text-xs font-black text-slate-700 uppercase tracking-wider cursor-pointer">Serie Activa / Habilitada</label>
               </div>

               <div className="flex gap-3 pt-4">
                 <button 
                   type="button"
                   onClick={() => setEditingSerie(null)}
                   className="flex-1 bg-white border border-slate-200 text-slate-600 px-4 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-colors"
                 >
                   Cancelar
                 </button>
                 <button 
                   type="submit"
                   disabled={isSaving}
                   className="flex-1 bg-[#0b5156] text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-[#083a3d] transition-colors shadow-lg disabled:opacity-50 flex items-center justify-center gap-1"
                 >
                   <Save size={12} />
                   {isSaving ? 'Guardando...' : 'Guardar'}
                 </button>
               </div>
             </form>
          </div>
        </div>
      )}

      {/* Modal de Diagnóstico Fiscal */}
      {showDiagnostico && diagnosticoResult && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200 p-4">
          <div className="bg-white p-8 rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg animate-in zoom-in-95 duration-200 relative">
             <button 
               onClick={() => setShowDiagnostico(false)}
               className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
             >
               <X size={18} />
             </button>
             <div className="flex items-center gap-3 mb-6">
               <div className="w-12 h-12 rounded-full bg-[#0b5156]/10 flex items-center justify-center">
                 <Activity size={24} className="text-[#0b5156]" />
               </div>
               <div>
                 <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Diagnóstico Fiscal</h2>
                 <p className="text-[10px] font-bold text-slate-400 uppercase">{diagnosticoResult.mensaje}</p>
               </div>
             </div>

             <div className="space-y-3">
               {diagnosticoResult.series?.map((s: any, i: number) => (
                 <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                   <div>
                     <span className="text-sm font-black text-slate-800 block">{getModuloLabel(s.modulo)}</span>
                     <span className="text-[10px] font-bold text-slate-500">Prefijo: {s.prefijo} · Último: {s.ultimo_numero}</span>
                   </div>
                   <span className={`text-[9px] font-black px-2 py-1 rounded uppercase ${s.estado === 'OK' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                     {s.estado === 'OK' ? <CheckCircle2 size={12} className="inline mr-1" /> : <XCircle size={12} className="inline mr-1" />}
                     {s.estado}
                   </span>
                 </div>
               ))}
             </div>

             <button 
               onClick={() => setShowDiagnostico(false)}
               className="w-full mt-6 bg-[#0b5156] text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-[#083a3d] transition-colors shadow-lg"
             >
               Cerrar Diagnóstico
             </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default NumberingControl;
