import { 
  Users, 
  ShieldAlert, 
  UserX, 
  ShieldCheck, 
  Activity,
  History,
  AlertTriangle,
  MonitorSmartphone,
  CheckCircle2,
  LockKeyhole
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const UsersPermissions = () => {
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [kpis, setKpis] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<any>('/admin/dashboard'),
      api.get<any[]>('/admin/usuarios'),
      api.get<any[]>('/admin/sesiones'),
    ]).then(([dash, users, sesiones]) => {
      const m = dash?.metricas || [];
      setKpis([
        { label: 'Sesiones Activas', value: String(sesiones?.length || 0), color: 'text-[#0b5156]', bg: 'bg-green-50', border: 'border-green-200', icon: <Activity size={16} className="text-green-600" /> },
        { label: 'Usuarios Registrados', value: String(users?.length || 0), color: 'text-slate-800', bg: 'bg-slate-50', border: 'border-slate-200', icon: <Users size={16} className="text-slate-500" /> },
        { label: 'Eventos Hoy', value: m[1]?.v || '0', color: 'text-slate-800', bg: 'bg-slate-50', border: 'border-slate-200', icon: <AlertTriangle size={16} className="text-amber-500" /> },
        { label: 'Nivel de Riesgo', value: 'ÓPTIMO', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', icon: <ShieldCheck size={16} className="text-green-600" />, isText: true },
      ]);
      setUsuarios(users || []);
    }).catch(console.error);
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <span className="bg-white text-slate-500 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest inline-block mb-2">
              Administración / SOC
            </span>
            <h1 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">
              Control de Seguridad
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">
              Monitor forense de identidades, sesiones activas y trazabilidad de accesos.
            </p>
          </div>
          <div className="flex gap-3">
            <button className="bg-white text-[#0b5156] border border-slate-200 px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-sm hover:bg-slate-50 transition-all">
              <Users size={14} /> Crear Usuario
            </button>
            <button className="bg-red-50 text-red-600 border border-red-200 px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-sm hover:bg-red-100 transition-all">
              <UserX size={14} /> Cerrar Todas las Sesiones
            </button>
          </div>
        </div>
      </header>

      {/* Security KPIs */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {kpis.map((kpi, i) => (
          <div key={i} className={`p-6 rounded-2xl border ${kpi.border} ${kpi.bg} flex flex-col justify-between h-32`}>
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{kpi.label}</span>
              {kpi.icon}
            </div>
            <strong className={`${kpi.isText ? 'text-xl' : 'text-3xl'} font-black ${kpi.color} tracking-tighter`}>
              {kpi.value}
            </strong>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Main Content (Users & Sessions) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Matriz de Usuarios Activos */}
          <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-end mb-6 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Matriz de Usuarios Activos</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Directorio de identidades con acceso al sistema.</p>
              </div>
            </div>
            
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <th className="pb-4 px-4">Usuario / Identidad</th>
                    <th className="pb-4 px-4">Rol</th>
                    <th className="pb-4 px-4">Última Actividad</th>
                    <th className="pb-4 px-4 text-center">Estado</th>
                    <th className="pb-4 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-center">
                  <tr>
                     <td colSpan={5} className="py-12">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sin usuarios registrados</p>
                     </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

          {/* Monitoreo de Sesiones (Dispositivos/IPs) */}
          <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
             <div className="flex justify-between items-end mb-6 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Sesiones y Dispositivos</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Control de acceso remoto y huella digital.</p>
              </div>
              <MonitorSmartphone className="text-slate-200" size={32} />
            </div>

            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                 <thead>
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <th className="pb-4 px-4">Usuario</th>
                    <th className="pb-4 px-4">Dispositivo / Navegador</th>
                    <th className="pb-4 px-4">IP / Ubicación</th>
                    <th className="pb-4 px-4 text-right">Acción Remota</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-center">
                  <tr>
                     <td colSpan={4} className="py-12">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sin sesiones activas</p>
                     </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

          {/* Permisos Críticos */}
          <article className="bg-white p-8 rounded-3xl border border-red-200 shadow-sm relative overflow-hidden">
             <div className="flex items-center gap-2 mb-6">
                <ShieldAlert className="text-red-500" size={24} />
                <h3 className="text-lg font-black text-red-600 uppercase tracking-tighter">Acciones Críticas de Seguridad</h3>
             </div>
             <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Requieren token de autorización si no hay permiso asignado.</p>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                {[
                  'Modificar precios en facturación',
                  'Anular documentos cerrados/pagados',
                  'Ver costos de compra (Margen Real)',
                  'Exportar base de datos de clientes'
                ].map((perm, i) => (
                   <label key={i} className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-100 rounded-xl cursor-pointer hover:bg-white hover:border-slate-300 transition-all">
                      <input type="checkbox" className="w-4 h-4 text-[#0b5156] bg-white border-slate-300 rounded focus:ring-[#0b5156]" />
                      <span className="text-xs font-black text-slate-700">{perm}</span>
                   </label>
                ))}
             </div>
          </article>

        </div>

        {/* Sidebar (Audit Log) */}
        <aside className="lg:col-span-1">
          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 shadow-sm sticky top-24">
            <div className="flex items-center gap-2 mb-6">
               <History className="text-slate-400" size={20} />
               <h4 className="text-sm font-black text-slate-600 uppercase tracking-tighter">Log de Auditoría</h4>
            </div>
            
            <div className="space-y-4">
               <div className="text-center p-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sin logs de auditoría recientes</p>
               </div>
            </div>

            <button className="w-full mt-6 bg-white border border-slate-200 text-[#0b5156] px-4 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-white transition-all shadow-sm">
               Ver Historial Completo
            </button>
          </div>
        </aside>

      </div>

      {/* Modal de Token de Autorización */}
      {showTokenModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200">
          <div className="bg-white p-8 rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md animate-in zoom-in-95 duration-200">
             <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center border border-red-100">
                   <LockKeyhole className="text-red-500" size={32} />
                </div>
             </div>
             <h2 className="text-xl font-black text-center text-slate-800 uppercase tracking-tighter mb-2">Acción Bloqueada</h2>
             <p className="text-xs font-bold text-center text-slate-500 uppercase leading-relaxed mb-6">
               Usted no tiene permisos para realizar esta acción crítica. Se requiere autorización de un supervisor.
             </p>

             <div className="space-y-2 mb-8">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center block">Token de Supervisor (6 dígitos)</label>
               <input 
                 type="password" 
                 placeholder="••••••" 
                 className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-center text-2xl font-black tracking-[1em] text-[#0b5156] focus:outline-none focus:border-[#0b5156] focus:ring-1 focus:ring-[#0b5156] transition-all"
               />
             </div>

             <div className="flex gap-3">
               <button 
                 onClick={() => setShowTokenModal(false)}
                 className="flex-1 bg-white border border-slate-200 text-slate-600 px-4 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-colors"
               >
                 Cancelar
               </button>
               <button 
                 onClick={() => setShowTokenModal(false)}
                 className="flex-1 bg-[#0b5156] text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-[#083a3d] transition-colors shadow-lg shadow-green-900/20"
               >
                 Autorizar
               </button>
             </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default UsersPermissions;
