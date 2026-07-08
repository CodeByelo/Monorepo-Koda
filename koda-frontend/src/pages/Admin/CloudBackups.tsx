import { 
  Cloud, 
  RefreshCw,
  FolderOpen,
  Box,
  CloudCog,
  ShieldAlert,
  Activity
} from 'lucide-react';
import { useState } from 'react';

const CloudBackups = () => {
  const [backingUp, setBackingUp] = useState(false);

  const handleBackup = () => {
    setBackingUp(true);
    setTimeout(() => {
      setBackingUp(false);
    }, 5000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <span className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest inline-block mb-2">
              Administración / Continuidad de Negocio
            </span>
            <h1 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">
              Respaldos en la Nube
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">
              Protección automatizada de la base de datos con sincronización externa y encriptación.
            </p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={handleBackup}
              disabled={backingUp}
              className="bg-[#0b5156] text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all disabled:opacity-50"
            >
              {backingUp ? <RefreshCw size={14} className="animate-spin" /> : <Cloud size={14} />} 
              {backingUp ? 'Sincronizando...' : 'Respaldar Ahora'}
            </button>
          </div>
        </div>
      </header>

      {/* KPI Grid */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
        {[
          { label: 'Último Respaldo', value: 'N/A', color: 'text-slate-400', border: 'border-slate-200', bg: 'bg-white', badge: 'Pendiente' },
          { label: 'Destino Actual', value: 'No configurado', color: 'text-slate-800', border: 'border-slate-200', bg: 'bg-white', meta: 'Vincule una cuenta' },
          { label: 'Seguridad de Data', value: 'N/A', color: 'text-slate-400', border: 'border-slate-200', bg: 'bg-slate-50', meta: 'Esperando respaldo' },
          { label: 'Espacio en Nube', value: '0 GB', color: 'text-amber-600', border: 'border-amber-200', bg: 'bg-amber-50', progress: 0 },
        ].map((kpi, i) => (
          <div key={i} className={`p-6 rounded-2xl border ${kpi.border} ${kpi.bg} flex flex-col justify-between relative overflow-hidden`}>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">{kpi.label}</span>
            <strong className={`text-xl font-black ${kpi.color} tracking-tighter block mb-1`}>{kpi.value}</strong>
            {kpi.badge && <span className="absolute top-6 right-6 bg-green-100 text-green-700 text-[9px] font-black px-2 py-0.5 rounded uppercase">{kpi.badge}</span>}
            {kpi.meta && <span className="text-[10px] font-bold text-slate-500">{kpi.meta}</span>}
            {kpi.progress !== undefined && (
               <div className="w-full bg-amber-200 rounded-full h-1 mt-2">
                 <div className="bg-amber-500 h-1 rounded-full" style={{ width: `${kpi.progress}%` }}></div>
               </div>
            )}
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          
          <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter mb-1">Vincular Almacenamiento Externo (OAuth2)</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Conecta tu cuenta corporativa para sincronización automática.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              
              <div className="p-6 bg-slate-50 border-2 border-green-500 rounded-2xl flex flex-col items-center text-center gap-4 relative overflow-hidden">
                <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
                  <FolderOpen className="text-green-600" size={32} />
                </div>
                <div>
                  <strong className="text-sm font-black text-slate-800 uppercase block">Google Drive</strong>
                  <span className="text-[10px] font-bold text-slate-500">Sincronización nativa con G-Suite.</span>
                </div>
                <button className="w-full bg-white border border-red-200 text-red-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-red-50 transition-colors">
                  Desvincular
                </button>
                <div className="absolute top-0 right-0">
                  <div className="bg-slate-400 text-white text-[8px] font-black px-6 py-1 rotate-45 translate-x-5 translate-y-3 shadow-sm uppercase tracking-widest">Inactivo</div>
                </div>
              </div>

              <div className="p-6 bg-white border border-slate-200 rounded-2xl flex flex-col items-center text-center gap-4 hover:border-[#0b5156]/30 transition-colors cursor-pointer group">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 shadow-sm flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Box className="text-[#0061ff]" size={32} />
                </div>
                <div>
                  <strong className="text-sm font-black text-slate-800 uppercase block">Dropbox</strong>
                  <span className="text-[10px] font-bold text-slate-500">Ideal para backups incrementales.</span>
                </div>
                <button className="w-full bg-[#0b5156] text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-[#083a3d] transition-colors shadow-lg shadow-green-900/20">
                  Vincular OAuth2
                </button>
              </div>

              <div className="p-6 bg-white border border-slate-200 rounded-2xl flex flex-col items-center text-center gap-4 hover:border-[#0b5156]/30 transition-colors cursor-pointer group">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 shadow-sm flex items-center justify-center group-hover:scale-105 transition-transform">
                  <CloudCog className="text-[#0078d4]" size={32} />
                </div>
                <div>
                  <strong className="text-sm font-black text-slate-800 uppercase block">OneDrive</strong>
                  <span className="text-[10px] font-bold text-slate-500">Ecosistema Microsoft Azure.</span>
                </div>
                <button className="w-full bg-[#0b5156] text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-[#083a3d] transition-colors shadow-lg shadow-green-900/20">
                  Vincular OAuth2
                </button>
              </div>

            </div>
          </article>

          {/* Business Continuity Policy */}
          <article className="bg-red-50 p-6 rounded-3xl border border-red-200 shadow-sm flex gap-4 items-start">
             <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0 border border-red-200">
               <ShieldAlert className="text-red-500" size={20} />
             </div>
             <div>
               <h4 className="text-sm font-black text-red-600 uppercase tracking-tighter mb-2">Política de Continuidad de Negocio (BCP)</h4>
               <p className="text-xs font-bold text-red-800/70 leading-relaxed">
                 KODA recomienda mantener siempre un destino de almacenamiento externo vinculado. En caso de siniestro en el servidor local (incendio, robo o falla crítica de hardware), la data en la nube será su única garantía para restaurar las operaciones en menos de 2 horas. Los archivos se suben encriptados con una llave maestra que solo el administrador conoce.
               </p>
             </div>
          </article>

        </div>

        {/* Sidebar Log */}
        <aside className="lg:col-span-1">
          <div className="bg-[#0b5156] rounded-3xl border border-[#083a3d] shadow-2xl overflow-hidden font-mono text-sm relative h-full min-h-[400px]">
            <div className="bg-[#083a3d] px-6 py-4 border-b border-[#083a3d] flex items-center justify-between">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-widest flex items-center gap-2"><Activity size={14} className="text-green-400" /> SYNC_LOG_STDOUT</span>
            </div>
             <div className="p-6 text-[10px] leading-relaxed text-slate-300">
               {backingUp ? (
                 <div className="animate-pulse text-indigo-400">
                   <p>[{new Date().toISOString().replace('T', ' ').substring(0, 19)}] INICIANDO RESPALDO MANUAL...</p>
                   <p className="mt-1">Generando volcado de Base de Datos...</p>
                 </div>
               ) : (
                 <p className="text-slate-500 text-center mt-12 uppercase tracking-widest font-bold">Sin actividad de respaldo</p>
               )}
            </div>
          </div>
        </aside>

      </div>
    </div>
  );
};

export default CloudBackups;
