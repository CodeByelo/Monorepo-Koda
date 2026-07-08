import { 
  Server, 
  Mail, 
  Database,
  Globe,
  Trash2,
  AlertTriangle,
  Zap,
  Activity
} from 'lucide-react';
import { useState } from 'react';

const SystemHealth = () => {
  const [cleaning, setCleaning] = useState(false);

  const handleMaintenance = () => {
    setCleaning(true);
    setTimeout(() => {
      setCleaning(false);
    }, 2500);
  };

  const uptimeData: any[] = [];

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
        {uptimeData.length > 0 ? uptimeData.map((service, i) => (
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
            
            <div className="mb-8">
              <div className="flex justify-between text-[10px] font-black uppercase text-slate-600 mb-2">
                <span>Almacenamiento del Servidor</span>
                <span>0 GB / 500 GB</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-400 to-green-500 h-full rounded-full" style={{ width: '0%' }}></div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              
              <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl">
                <h4 className="text-sm font-black text-slate-700 uppercase tracking-tighter mb-2">Limpiador de Auditoría</h4>
                <p className="text-[10px] font-bold text-slate-500 mb-6 leading-relaxed">No hay logs de auditoría antiguos (más de 1 año) pendientes por purgar.</p>
                <button className="w-full bg-white border border-slate-200 text-[#0b5156] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:bg-white transition-all shadow-sm">
                  <Trash2 size={14} /> Purgar Logs Antiguos
                </button>
              </div>

              <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl">
                <h4 className="text-sm font-black text-slate-700 uppercase tracking-tighter mb-2">Caché de Documentos</h4>
                <p className="text-[10px] font-bold text-slate-500 mb-6 leading-relaxed">Los PDFs generados y archivos temporales ocupan 0 GB actualmente.</p>
                <button className="w-full bg-white border border-slate-200 text-[#0b5156] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:bg-white transition-all shadow-sm">
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
    </div>
  );
};

// Quick mock for RefreshCw
import { RefreshCw } from 'lucide-react';

export default SystemHealth;
