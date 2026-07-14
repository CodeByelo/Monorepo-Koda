import { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  Send, 
  Activity, 
  Award, 
  MapPin, 
  UserCheck, 
  CheckCircle,
  HelpCircle,
  X,
  RefreshCw,
  GitBranch
} from 'lucide-react';
import { api } from '@/api/client';

export default function PersonnelEngine() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Link Telegram Modal
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [telegramChatId, setTelegramChatId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const showToastMsg = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const data = await api.get<any[]>('/api/logistica/personal');
      setEmployees(data || []);
    } catch (e: any) {
      console.error("Error loading personnel engine metrics:", e);
      showToastMsg("Error al obtener la matriz de personal.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleLinkTelegram = async () => {
    if (!selectedProfile || !telegramChatId) {
      showToastMsg("Ingrese un chat ID válido.");
      return;
    }
    setIsSaving(true);
    try {
      await api.post('/api/logistica/personal/telegram', {
        profile_id: selectedProfile.id,
        telegram_chat_id: telegramChatId
      });
      showToastMsg("Telegram enlazado exitosamente.");
      setShowLinkModal(false);
      setTelegramChatId('');
      fetchData();
    } catch (err: any) {
      showToastMsg(err.message || "Error al enlazar Telegram.");
    } finally {
      setIsSaving(false);
    }
  };

  // Filter logic
  const filteredEmployees = employees.filter(e => {
    const matchSearch = e.nombre.toLowerCase().includes(searchQuery.toLowerCase()) || 
                        e.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        e.tripulacion.toLowerCase().includes(searchQuery.toLowerCase());
    const matchRole = roleFilter === 'ALL' || e.rol === roleFilter;
    return matchSearch && matchRole;
  });

  // Calculate high-level stats
  const totalUsers = employees.length;
  const activeCrews = Array.from(new Set(employees.map(e => e.tripulacion).filter(t => t && t !== 'Sin Tripulación'))).length;
  const avgEfficiency = employees.length > 0 
    ? Math.round(employees.reduce((acc, curr) => acc + curr.eficiencia, 0) / employees.length) 
    : 0;

  return (
    <div className="min-h-screen bg-[#F4F6F8] text-slate-800 pb-24 animate-in fade-in duration-300">
      <style>{`@keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
      
      {/* Header */}
      <header className="bg-white p-8 rounded-3xl border border-[#bdafa1]/20 shadow-sm relative overflow-hidden mb-6">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <Users size={120} className="text-[#0b5156]" />
        </div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-[#0b5156] text-white text-[9px] font-black uppercase px-2.5 py-0.5 rounded tracking-widest shadow-md">Modo Búnker</span>
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Multi-Tenant Personnel Matrix</span>
            </div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Motor Interactivo de Personal</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Sincronización jerárquica y eficiencia en tiempo real.</p>
          </div>
          <div className="flex items-center gap-2.5">
            <button 
              onClick={fetchData}
              className="bg-slate-50 text-slate-600 p-2.5 rounded-xl border border-slate-200 hover:bg-white transition-all shadow-sm"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </header>

      {/* KPI Widgets */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 px-4">
        <article className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm flex items-center gap-4">
          <div className="p-4 bg-[#0b5156]/10 text-[#0b5156] rounded-2xl">
            <Users size={24} />
          </div>
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Plantilla del Tenant</span>
            <div className="text-2xl font-black text-slate-800">{totalUsers} Empleados</div>
          </div>
        </article>

        <article className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm flex items-center gap-4">
          <div className="p-4 bg-purple-50 text-purple-700 rounded-2xl">
            <GitBranch size={24} />
          </div>
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Tripulaciones Activas</span>
            <div className="text-2xl font-black text-slate-800">{activeCrews} Equipos</div>
          </div>
        </article>

        <article className="bg-white border border-slate-200 p-5 rounded-3xl shadow-sm flex items-center gap-4">
          <div className="p-4 bg-emerald-50 text-emerald-700 rounded-2xl">
            <Activity size={24} />
          </div>
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Eficiencia Promedio</span>
            <div className="text-2xl font-black text-slate-800">{avgEfficiency}% General</div>
          </div>
        </article>
      </section>

      {/* Filter and Search controls */}
      <section className="bg-white border border-slate-200 p-4 rounded-3xl shadow-sm mb-6 flex flex-col md:flex-row gap-4 items-center mx-4">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-3 text-slate-400" size={16} />
          <input 
            type="text" 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, email, tripulación..." 
            className="w-full bg-slate-50 border border-slate-200 pl-10 pr-4 py-2.5 rounded-2xl text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0b5156]/50"
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto no-scrollbar">
          {['ALL', 'Admin', 'Supervisor', 'CHOFER', 'AYUDANTE'].map(role => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all border shrink-0 ${
                roleFilter === role 
                  ? 'bg-[#0b5156] border-[#0b5156] text-white' 
                  : 'bg-white border-slate-200 hover:border-slate-400 text-slate-500'
              }`}
            >
              {role === 'ALL' ? 'Todos' : role}
            </button>
          ))}
        </div>
      </section>

      {/* Grid containing Employees cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-4">
        {filteredEmployees.length === 0 ? (
          <div className="col-span-full py-16 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">
            Ningún empleado coincide con los filtros aplicados.
          </div>
        ) : (
          filteredEmployees.map(e => (
            <article key={e.id} className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
              {/* Card Header */}
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-sm font-black text-[#0b5156]">
                    {e.nombre.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-slate-800 uppercase leading-tight">{e.nombre}</h3>
                    <span className="text-[9px] font-semibold text-slate-400 uppercase leading-none">{e.email}</span>
                  </div>
                </div>
                <span className={`text-[8px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded border ${
                  e.rol === 'Admin' ? 'bg-red-50 border-red-200 text-red-700' :
                  e.rol === 'Supervisor' ? 'bg-purple-50 border-purple-200 text-purple-700' :
                  e.rol === 'CHOFER' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                  'bg-slate-50 border-slate-200 text-slate-500'
                }`}>
                  {e.rol}
                </span>
              </div>

              {/* Stats & Assignment info */}
              <div className="border-t border-slate-100 pt-4 grid grid-cols-2 gap-4">
                <div className="space-y-0.5 text-left">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Tripulación Activa</span>
                  <span className="text-[10px] font-bold text-slate-600 uppercase block">{e.tripulacion}</span>
                </div>
                <div className="space-y-0.5 text-left">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Estructura Reporte</span>
                  <span className="text-[10px] font-bold text-slate-600 uppercase block">Reporta a: {e.reporta_a}</span>
                </div>
              </div>

              {/* Tasks and Performance metrics */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                  <span>Rutas Realizadas</span>
                  <span className="text-slate-800">{e.rutas_completadas} / {e.rutas_totales}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-[#0b5156] h-1.5 rounded-full transition-all" 
                    style={{ width: `${e.eficiencia}%` }} 
                  />
                </div>
                <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                  <span>Tasa de Eficiencia</span>
                  <span className="text-[#0b5156] font-black">{e.eficiencia}%</span>
                </div>
              </div>

              {/* Telegram linkage status */}
              <div className="border-t border-slate-100 pt-4 flex justify-between items-center">
                {e.telegram_chat_id ? (
                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle size={12} /> Telegram Activo
                  </span>
                ) : (
                  <span className="text-[9px] font-black text-amber-600 uppercase tracking-wider flex items-center gap-1">
                    <HelpCircle size={12} /> Telegram Desconectado
                  </span>
                )}
                
                <button 
                  onClick={() => {
                    setSelectedProfile(e);
                    setTelegramChatId(e.telegram_chat_id || '');
                    setShowLinkModal(true);
                  }}
                  className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-colors flex items-center gap-1 shadow-sm"
                >
                  <Send size={10} /> Enlazar Bot
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      {/* LINK TELEGRAM MODAL */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={() => setShowLinkModal(false)}>
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-sm space-y-5 shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-md font-black text-slate-800 uppercase">Vincular Telegram</h3>
              <button onClick={() => setShowLinkModal(false)} className="text-slate-400 hover:text-slate-600 font-black">X</button>
            </div>

            <div className="space-y-4 text-left">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs font-semibold text-slate-500 uppercase leading-relaxed">
                ℹ️ Para recibir hojas de ruta y notificaciones, el conductor debe iniciar conversación con el bot de Telegram KODA y proveer el **Chat ID** generado.
              </div>

              <div>
                <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-1 block">Telegram Chat ID</label>
                <input 
                  type="text" 
                  value={telegramChatId} 
                  onChange={e => setTelegramChatId(e.target.value)}
                  placeholder="Ej: 187654329"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-xs font-bold focus:outline-none focus:border-[#0b5156]/50 font-mono" 
                />
              </div>

              <button 
                onClick={handleLinkTelegram}
                disabled={isSaving}
                className="w-full bg-[#0b5156] disabled:bg-slate-300 text-white py-4 rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Vinculando...
                  </>
                ) : (
                  "Vincular Cuenta"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Alert */}
      {toast && (
        <div className="fixed bottom-5 right-5 bg-slate-900/90 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-xl z-50 border border-slate-700/50 flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-300">
          <span className="text-xs font-black uppercase tracking-wider">🔔 {toast}</span>
        </div>
      )}
    </div>
  );
}
