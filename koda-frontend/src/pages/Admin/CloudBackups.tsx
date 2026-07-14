import { 
  Cloud, 
  RefreshCw,
  FolderOpen,
  Box,
  CloudCog,
  ShieldAlert,
  Activity
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { Toast } from '@/components/common/Toast';

const CloudBackups = () => {
  const [backingUp, setBackingUp] = useState(false);
  const [backups, setBackups] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>({
    ultimo_respaldo: 'N/A',
    destino: 'No configurado',
    seguridad: 'AES-256',
    espacio_usado_gb: 'N/A',
    espacio_pct: 0
  });
  const [toast, setToast] = useState<any>(null);
  const [confirmModal, setConfirmModal] = useState<any>(null);
  const [integrationConfig, setIntegrationConfig] = useState<any>({
    backup_provider: 'local',
    backup_config_json: '{}',
    replication_mode: 'koda_db',
    replication_api_url: '',
    replication_api_key: '',
    bypass_local_db: false
  });

  const fetchBackups = async () => {
    try {
      const res = await api.get<any>('/admin/respaldos');
      if (res) {
        setBackups(res.respaldos || []);
        if (res.kpis) {
          setKpis(res.kpis);
        }
      }
    } catch (error) {
      console.error("Error fetching backups:", error);
    }
  };

  const fetchIntegrationConfig = async () => {
    try {
      const res = await api.get<any>('/admin/respaldos/config');
      if (res) {
        setIntegrationConfig(res);
      }
    } catch (error) {
      console.error("Error fetching integration config:", error);
    }
  };

  useEffect(() => {
    fetchBackups();
    fetchIntegrationConfig();
  }, []);

  const handleSaveConfig = async () => {
    try {
      if (integrationConfig.backup_provider !== 'local') {
        try {
          JSON.parse(integrationConfig.backup_config_json || '{}');
        } catch (e) {
          setToast({
            message: 'Configuración JSON inválida para credenciales.',
            type: 'error'
          });
          return;
        }
      }
      
      const res = await api.post<any>('/admin/respaldos/config', integrationConfig);
      setToast({
        message: res?.mensaje || 'Configuración guardada correctamente.',
        type: 'success'
      });
      fetchBackups();
    } catch (error) {
      console.error("Error saving config:", error);
      setToast({
        message: 'Error al guardar la configuración.',
        type: 'error'
      });
    }
  };

  const handleBackup = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Iniciar Respaldo Manual',
      message: '¿Desea ejecutar un volcado de base de datos y realizar un respaldo manual ahora mismo?',
      onConfirm: async () => {
        setConfirmModal(null);
        setBackingUp(true);
        try {
          await api.post('/admin/respaldos/ejecutar', {});
          setToast({
            message: 'Respaldo ejecutado y registrado exitosamente.',
            type: 'success'
          });
          fetchBackups();
        } catch (error) {
          console.error(error);
          setToast({
            message: 'Error al ejecutar el respaldo.',
            type: 'error'
          });
        } finally {
          setBackingUp(false);
        }
      }
    });
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
          { label: 'Último Respaldo', value: kpis.ultimo_respaldo, color: 'text-slate-800', border: 'border-slate-200', bg: 'bg-white', badge: 'Completado' },
          { label: 'Destino Actual', value: kpis.destino, color: 'text-slate-800', border: 'border-slate-200', bg: 'bg-white', meta: 'Vincule una cuenta' },
          { label: 'Seguridad de Data', value: kpis.seguridad, color: 'text-[#0b5156]', border: 'border-green-200', bg: 'bg-green-50', meta: 'AES-256 Forzado' },
          { label: 'Espacio en Nube', value: kpis.espacio_usado_gb, color: 'text-amber-600', border: 'border-amber-200', bg: 'bg-amber-50', progress: kpis.espacio_pct },
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
          
          <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-8">
            <div>
              <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter mb-1">Configuración de Continuidad e Integración</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Establece el destino de tus respaldos y la replicación a tu propio servidor.</p>
            </div>

            {/* 1. Almacenamiento de Respaldos */}
            <div className="space-y-4">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">1. Destino de Almacenamiento</span>
              
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                {[
                  { id: 'local', name: 'Nube KODA', desc: 'Almacenamiento central incluido.' },
                  { id: 'google_drive', name: 'Google Drive', desc: 'Tu propio espacio de Drive.' },
                  { id: 'dropbox', name: 'Dropbox', desc: 'Tu propia cuenta de Dropbox.' },
                  { id: 'onedrive', name: 'OneDrive', desc: 'Tu propio espacio OneDrive.' }
                ].map((prov) => (
                  <button
                    key={prov.id}
                    type="button"
                    onClick={() => setIntegrationConfig({ ...integrationConfig, backup_provider: prov.id })}
                    className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between h-24 ${
                      integrationConfig.backup_provider === prov.id 
                        ? 'border-[#0b5156] bg-[#0b5156]/5 ring-2 ring-[#0b5156]/10' 
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <strong className="text-xs font-black text-slate-800 uppercase block leading-none mb-1">{prov.name}</strong>
                    <span className="text-[9px] font-bold text-slate-400 leading-tight block">{prov.desc}</span>
                  </button>
                ))}
              </div>

              {integrationConfig.backup_provider !== 'local' && (
                <div className="space-y-2 animate-in fade-in duration-200">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Credenciales y Configuración (JSON)</label>
                  <textarea
                    rows={4}
                    value={integrationConfig.backup_config_json}
                    onChange={(e) => setIntegrationConfig({ ...integrationConfig, backup_config_json: e.target.value })}
                    placeholder='{"client_id": "...", "client_secret": "...", "folder_id": "..."}'
                    className="w-full p-4 border border-slate-200 rounded-xl font-mono text-[10px] text-slate-700 focus:outline-none focus:border-[#0b5156] transition-colors"
                  />
                  <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-tight">Copia y pega la configuración OAuth2 o Token de acceso generado para tu cuenta.</span>
                </div>
              )}
            </div>

            {/* 2. Replicación de Eventos */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">2. Réplica del Ledger (Nodos Externos)</span>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setIntegrationConfig({ ...integrationConfig, replication_mode: 'koda_db' })}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    integrationConfig.replication_mode === 'koda_db'
                      ? 'border-[#0b5156] bg-[#0b5156]/5 ring-2 ring-[#0b5156]/10'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <strong className="text-xs font-black text-slate-800 uppercase block mb-1">Base de Datos Central KODA</strong>
                  <span className="text-[9px] font-bold text-slate-400 leading-tight block">Toda tu actividad se procesa y almacena en el nodo central.</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIntegrationConfig({ ...integrationConfig, replication_mode: 'custom_api' })}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    integrationConfig.replication_mode === 'custom_api'
                      ? 'border-[#0b5156] bg-[#0b5156]/5 ring-2 ring-[#0b5156]/10'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <strong className="text-xs font-black text-slate-800 uppercase block mb-1">Servidor Propio (External Node)</strong>
                  <span className="text-[9px] font-bold text-slate-400 leading-tight block">Replicar y enrutar todas las transacciones a tu propia infraestructura.</span>
                </button>
              </div>

              {integrationConfig.replication_mode === 'custom_api' && (
                <div className="space-y-4 p-5 bg-slate-50 border border-slate-200 rounded-2xl animate-in fade-in duration-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">URL del Endpoint API</label>
                      <input
                        type="url"
                        value={integrationConfig.replication_api_url}
                        onChange={(e) => setIntegrationConfig({ ...integrationConfig, replication_api_url: e.target.value })}
                        placeholder="https://mi-servidor.com/api/v1/ledger"
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-[#0b5156] transition-colors font-bold text-slate-700 bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">API Key de Autorización</label>
                      <input
                        type="password"
                        value={integrationConfig.replication_api_key}
                        onChange={(e) => setIntegrationConfig({ ...integrationConfig, replication_api_key: e.target.value })}
                        placeholder="••••••••••••••••••••••••••••••••"
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-[#0b5156] transition-colors font-bold text-slate-700 bg-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <input
                      type="checkbox"
                      id="bypass_local_db"
                      checked={integrationConfig.bypass_local_db}
                      onChange={(e) => setIntegrationConfig({ ...integrationConfig, bypass_local_db: e.target.checked })}
                      className="w-4 h-4 text-[#0b5156] border-slate-300 rounded focus:ring-[#0b5156] cursor-pointer"
                    />
                    <label htmlFor="bypass_local_db" className="text-[10px] font-black text-slate-600 uppercase tracking-widest cursor-pointer select-none">
                      Omitir base de datos central de KODA (Bypass completo)
                    </label>
                  </div>
                  <span className="text-[8px] font-bold text-slate-400 block uppercase leading-relaxed">
                    Si activas esta opción, KODA enviará los eventos exclusivamente a tu servidor y no guardará ningún log transaccional en nuestros servidores centrales.
                  </span>
                </div>
              )}
            </div>

            {/* 3. Acción Guardar */}
            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={handleSaveConfig}
                className="bg-[#0b5156] text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
              >
                Guardar Configuración de Integración
              </button>
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

          {/* Historial de Respaldos */}
          <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter mb-1">Historial de Respaldos Recientes</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Lista de volcados de seguridad almacenados de forma segura.</p>
            
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <th className="pb-4 px-4 text-left">ID / Archivo</th>
                    <th className="pb-4 px-4 text-left">Fecha</th>
                    <th className="pb-4 px-4 text-center">Tamaño</th>
                    <th className="pb-4 px-4 text-center">Destino</th>
                    <th className="pb-4 px-4 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {backups.length > 0 ? backups.map((bk) => (
                    <tr key={bk.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 text-left">
                        <strong className="text-sm font-black text-slate-800 block font-mono">{bk.archivo || bk.id}</strong>
                        <span className="text-[9px] text-[#0b5156] font-black tracking-widest uppercase">{bk.id}</span>
                      </td>
                      <td className="p-4 text-left text-xs text-slate-500 font-bold">{bk.fecha}</td>
                      <td className="p-4 text-center text-xs font-mono text-slate-600 font-bold">{bk.tamano}</td>
                      <td className="p-4 text-center text-xs text-slate-500 font-bold">{bk.destino}</td>
                      <td className="p-4 text-right">
                        <span className="bg-green-100 text-green-700 text-[9px] font-black px-2 py-0.5 rounded uppercase">
                          {bk.estado}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="py-12 text-center">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sin respaldos registrados. Ejecute "Respaldar Ahora" para comenzar.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
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
                   <p className="mt-1">Comprimiendo y encriptando con AES-256...</p>
                   <p className="mt-1">Guardando localmente...</p>
                   <p className="mt-1">Sincronización finalizada exitosamente.</p>
                 </div>
               ) : backups.length > 0 ? (
                 <div className="space-y-2 text-slate-300">
                   <p className="text-green-400 font-black">✅ SISTEMA OPERATIVO</p>
                   <p className="mt-2 text-slate-400">Último backup registrado:</p>
                   <p className="text-white font-bold">{backups[0].archivo || backups[0].id}</p>
                   <p className="text-slate-400">Fecha: <span className="text-white font-mono">{backups[0].fecha}</span></p>
                   <p className="text-slate-400">Sello: <span className="text-white font-mono">{backups[0].id}</span></p>
                 </div>
               ) : (
                 <p className="text-slate-500 text-center mt-12 uppercase tracking-widest font-bold">Sin actividad de respaldo.<br/>Presione "Respaldar Ahora" para iniciar.</p>
               )}
            </div>
          </div>
        </aside>

      </div>

      {/* Custom Confirmation Modal */}
      {confirmModal?.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl border border-slate-200 shadow-2xl p-8 space-y-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-50 rounded-full text-amber-600">
                <ShieldAlert size={24} />
              </div>
              <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tighter">
                {confirmModal.title}
              </h3>
            </div>
            
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wide leading-relaxed whitespace-pre-line">
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

export default CloudBackups;
