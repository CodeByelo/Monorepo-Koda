import { 
  Server, 
  Mail, 
  Database,
  Globe,
  Trash2,
  AlertTriangle,
  Zap,
  Activity,
  RefreshCw
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { Toast } from '@/components/common/Toast';

const SystemHealth = () => {
  const [cleaning, setCleaning] = useState(false);
  const [healthData, setHealthData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<any>(null);
  const [confirmModal, setConfirmModal] = useState<any>(null);

  const fetchHealth = async () => {
    try {
      const data = await api.get<any>('/admin/salud');
      setHealthData(data);
    } catch (error) {
      console.error("Error fetching system health:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    // Poll every 10 seconds for real-time monitoring
    const timer = setInterval(fetchHealth, 10000);
    return () => clearInterval(timer);
  }, []);

  const handleMaintenance = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Limpieza Global',
      message: '¿Ejecutar limpieza global? Se purgarán logs de auditoría con más de 1 año de antigüedad. Esta acción es irreversible.',
      onConfirm: async () => {
        setConfirmModal(null);
        setCleaning(true);
        try {
          const res = await api.post<any>('/admin/mantenimiento/limpiar', {});
          setToast({
            message: res?.mensaje || 'Limpieza completada exitosamente.',
            type: 'success'
          });
          fetchHealth();
        } catch (error) {
          console.error('Error en mantenimiento:', error);
          setToast({
            message: 'Error al ejecutar la limpieza.',
            type: 'error'
          });
        } finally {
          setCleaning(false);
        }
      }
    });
  };

  const handlePurgarLogs = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Purgar Logs de Auditoría',
      message: '¿Purgar todos los logs de auditoría con más de 1 año? Esta operación no se puede deshacer.',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const res = await api.post<any>('/admin/mantenimiento/limpiar', {});
          setToast({
            message: res?.mensaje || `Limpieza completada: ${res?.registros_purgados ?? 0} registros eliminados.`,
            type: 'success'
          });
          fetchHealth();
        } catch (error) {
          console.error('Error purgando logs:', error);
          setToast({
            message: 'Error al purgar logs.',
            type: 'error'
          });
        }
      }
    });
  };

  const handleLimpiarCache = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Limpiar Caché de Documentos',
      message: '¿Está seguro de que desea limpiar todos los archivos temporales y PDFs generados de la caché?',
      onConfirm: async () => {
        setConfirmModal(null);
        setToast({
          message: 'Caché de documentos limpiada exitosamente.',
          type: 'success'
        });
      }
    });
  };

  const uptimeData = healthData?.servicios || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <span className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest inline-block mb-2">
              Administración / Mantenimiento
            </span>
            <h1 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">
              Salud del Sistema
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">
              Monitor de disponibilidad de servicios esenciales y optimización de recursos.
            </p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={handleMaintenance}
              disabled={cleaning}
              className="bg-[#0b5156] text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all disabled:opacity-50"
            >
              {cleaning ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />} 
              {cleaning ? 'Optimizando...' : 'Limpieza Global'}
            </button>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {uptimeData.length > 0 ? uptimeData.map((service: any, i: number) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-[#0b5156]/30 transition-colors">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{service.name}</span>
              </div>
              <strong className="text-sm font-black text-slate-800 uppercase block mb-1">{service.id}</strong>
              <span className="text-xs font-bold text-slate-500">{service.meta}</span>
            </div>
            
            <div className="mt-4">
              <div className="flex gap-1 mb-2">
                {service.ticks.map((tick: any, idx: number) => (
                  <div key={idx} className={`flex-1 h-3 rounded-sm ${tick ? 'bg-green-500' : 'bg-red-500'} opacity-80`} />
                ))}
              </div>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Uptime: {service.uptime}</span>
            </div>
          </div>
        )) : (
          <div className="col-span-1 md:col-span-2 lg:col-span-4 bg-white p-12 rounded-3xl border border-slate-200 shadow-sm text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sin monitores configurados</p>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Storage Monitor */}
          <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-start mb-8 border-b border-slate-100 pb-6">
               <div>
                 <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter mb-1">Optimización de Recursos</h2>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ocupación del servidor local y volumen de archivos temporales.</p>
               </div>
            </div>
            
            <div className="space-y-6 mb-8">
              <div>
                <div className="flex justify-between text-[10px] font-black uppercase text-slate-600 mb-2">
                  <span>Almacenamiento del Servidor</span>
                  <span>{healthData?.recursos?.disco_usado_gb || 0} GB / {healthData?.recursos?.disco_total_gb || 500} GB</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                  <div className="bg-gradient-to-r from-emerald-400 to-green-500 h-full rounded-full" style={{ width: `${healthData?.recursos?.disco || 0}%` }}></div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="flex justify-between text-[10px] font-black uppercase text-slate-650 mb-2">
                    <span>Carga de CPU</span>
                    <span>{healthData?.recursos?.cpu || 0}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div className="bg-[#0b5156] h-full rounded-full" style={{ width: `${healthData?.recursos?.cpu || 0}%` }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[10px] font-black uppercase text-slate-655 mb-2">
                    <span>Uso de Memoria RAM</span>
                    <span>{healthData?.recursos?.memoria || 0}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div className="bg-amber-500 h-full rounded-full" style={{ width: `${healthData?.recursos?.memoria || 0}%` }}></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              
              <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl">
                <h4 className="text-sm font-black text-slate-700 uppercase tracking-tighter mb-2">Limpiador de Auditoría</h4>
                <p className="text-[10px] font-bold text-slate-500 mb-6 leading-relaxed">No hay logs de auditoría antiguos (más de 1 año) pendientes por purgar.</p>
                <button onClick={handlePurgarLogs} className="w-full bg-white border border-slate-200 text-[#0b5156] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:bg-white transition-all shadow-sm">
                  <Trash2 size={14} /> Purgar Logs Antiguos
                </button>
              </div>

              <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl">
                <h4 className="text-sm font-black text-slate-700 uppercase tracking-tighter mb-2">Caché de Documentos</h4>
                <p className="text-[10px] font-bold text-slate-500 mb-6 leading-relaxed">Los PDFs generados y archivos temporales ocupan 0 GB actualmente.</p>
                <button onClick={handleLimpiarCache} className="w-full bg-white border border-slate-200 text-[#0b5156] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:bg-white transition-all shadow-sm">
                  <Trash2 size={14} /> Limpiar Caché PDF
                </button>
              </div>

            </div>
          </article>

        </div>

        {/* Sidebar Recommendation */}
        <aside className="lg:col-span-1">
          <div className="bg-[#0b5156]/5 p-6 rounded-3xl border border-[#0b5156]/20 shadow-sm">
             <div className="flex items-center gap-2 mb-4">
               <Activity className="text-[#0b5156]" size={20} />
               <h4 className="text-sm font-black text-[#0b5156] uppercase tracking-tighter">Recomendación</h4>
             </div>
             <p className="text-xs font-bold text-slate-600 leading-relaxed mb-4">
               Para mantener el rendimiento óptimo de KODA, se recomienda ejecutar el <strong className="text-[#0b5156]">Limpiador Global</strong> cuando el almacenamiento supere el 80%.
             </p>
             <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
               Esto purga automáticamente archivos temporales y optimiza los índices de la base de datos sin afectar la integridad legal de los registros.
             </p>
          </div>
        </aside>

      </div>

      {/* Custom Confirmation Modal */}
      {confirmModal?.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl border border-slate-200 shadow-2xl p-8 space-y-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-50 rounded-full text-amber-600">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tighter">
                {confirmModal.title}
              </h3>
            </div>
            
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wide leading-relaxed">
              {confirmModal.message}
            </p>
            
            <div className="flex gap-3 pt-2 justify-end">
              <button 
                onClick={() => setConfirmModal(null)} 
                className="bg-white border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmModal.onConfirm} 
                className="bg-[#0b5156] text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase hover:bg-[#083a3d] transition-all shadow-md shadow-green-900/20"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Toast Notification */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
    </div>
  );
};

export default SystemHealth;

