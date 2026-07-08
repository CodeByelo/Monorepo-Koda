import { useState, useEffect } from 'react';
import { 
  Building2, 
  CircleDollarSign, 
  Users, 
  MapPin, 
  Network, 
  Save,
  Image as ImageIcon,
  RefreshCcw,
  CheckCircle2,
  ShieldCheck,
  Send
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import AuditConfig from '@/components/admin/AuditConfig';
import TelegramLinker from '@/components/admin/TelegramLinker';

interface AdminDashboardProps {
  defaultTab?: string;
}

const AdminDashboard = ({ defaultTab = 'compania' }: AdminDashboardProps) => {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [perfil, setPerfil] = useState<any>({ nombre_comercial: '', email: '', telefono: '' });
  const [tasa, setTasa] = useState<any>(null);
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'compania') {
        const perfilRes = await api.get<any>('/empresa/perfil');
        setPerfil(perfilRes || { nombre_comercial: '', email: '', telefono: '' });
      } else if (activeTab === 'monedas') {
        const tasaRes = await api.get<any>('/tasa/actual');
        setTasa(tasaRes);
      } else if (activeTab === 'sucursales') {
        const sucursalesRes = await api.get<any[]>('/empresa/sucursales');
        setSucursales(sucursalesRes || []);
      }
    } catch (error) {
      console.error(`Error fetching data for ${activeTab}:`, error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSavePerfil = async () => {
    if (activeTab !== 'compania') return;
    try {
      setIsSaving(true);
      await api.put('/empresa/perfil', perfil);
      alert('Perfil de empresa actualizado exitosamente.');
    } catch (error) {
      console.error("Error saving perfil:", error);
      alert('Error al actualizar perfil.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncTasa = async () => {
    try {
      setIsSaving(true);
      await api.post('/tasa/sincronizar', {});
      const tasaRes = await api.get<any>('/tasa/actual');
      setTasa(tasaRes);
      alert('Tasa BCV sincronizada exitosamente.');
    } catch (error) {
      console.error("Error sincronizando tasa:", error);
      alert('Error al sincronizar tasa.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append('file', file);
      try {
        await api.post('/empresa/logo', formData);
        alert('Logo actualizado exitosamente.');
      } catch (error) {
        console.error("Error uploading logo", error);
        alert('Error al cargar logo.');
      }
    }
  };

  const handleGenerateToken = async () => {
    try {
      await api.post('/empresa/api-tokens', {});
      alert('Token generado exitosamente.');
    } catch (error) {
      console.error("Error generando token", error);
      alert('Error al generar token.');
    }
  };

  const handleNewSucursal = async () => {
    try {
      const codigo = prompt("Ingrese código de sucursal (ej. S-03):");
      const nombre = prompt("Ingrese nombre de sede:");
      const ciudad = prompt("Ingrese ciudad:");
      if (codigo && nombre && ciudad) {
        await api.post('/empresa/sucursales', { codigo, nombre, ciudad, estado: 'Activo' });
        fetchData();
        alert('Sucursal creada exitosamente.');
      }
    } catch (error) {
      console.error("Error creando sucursal", error);
      alert('Error al crear sucursal.');
    }
  };

  const menuItems = [
    { id: 'compania', label: 'Identidad Corporativa', icon: <Building2 size={16} /> },
    { id: 'monedas', label: 'Política Monetaria', icon: <CircleDollarSign size={16} />, badge: 'BCV' },
    { id: 'usuarios', label: 'Usuarios y Roles', icon: <Users size={16} /> },
    { id: 'sucursales', label: 'Sucursales y Sedes', icon: <MapPin size={16} /> },
    { id: 'api', label: 'Integraciones (API)', icon: <Network size={16} /> },
    { id: 'telegram', label: 'Bot de Telegram', icon: <Send size={16} />, badge: 'Bot' },
    { id: 'auditoria', label: 'Modo Auditoría / SENIAT', icon: <ShieldCheck size={16} />, badge: 'Seguridad' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest inline-block mb-2">
              Módulo de Administración
            </span>
            <h1 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">
              Centro de Control de Sistema
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">
              Gestión de identidad corporativa, políticas monetarias y salud de la plataforma.
            </p>
          </div>
          <div className="flex gap-2">
            {activeTab === 'compania' && (
              <button onClick={handleSavePerfil} disabled={isSaving} className="bg-[#0b5156] text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all disabled:opacity-50">
                <Save size={14} /> {isSaving ? 'Guardando...' : 'Aplicar Cambios Globales'}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
        {/* Sidebar Menu */}
        <aside className="lg:col-span-1 space-y-2">
          <div className="bg-white p-4 rounded-[2.5rem] border border-slate-200 shadow-sm sticky top-24">
            <nav className="flex flex-col gap-1">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all ${
                    activeTab === item.id
                      ? 'bg-[#0b5156] text-white shadow-md'
                      : 'bg-transparent text-slate-500 hover:bg-slate-50 hover:text-[#0b5156]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {item.icon}
                    <span className="text-xs font-black uppercase tracking-tight">{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase ${
                      activeTab === item.id ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Content Area */}
        <div className="lg:col-span-3">
          {isLoading && activeTab !== 'usuarios' && activeTab !== 'telegram' ? (
            <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse bg-white rounded-[2.5rem] border border-slate-200 shadow-sm">
               Cargando {activeTab}...
            </div>
          ) : (
            <>
              {/* SECCION: COMPAÑIA */}
              {activeTab === 'compania' && (
                <section className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="mb-8 border-b border-slate-100 pb-6">
                    <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter mb-1">Identidad de la Compañía</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Datos públicos que aparecen en comunicaciones y facturas.</p>
                  </div>

                  <div className="space-y-6">
                    <div className="flex gap-6 items-center bg-slate-50 p-6 rounded-2xl border border-slate-100">
                      <div className="w-20 h-20 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-[#0b5156]">
                        <Building2 size={32} />
                      </div>
                      <div className="space-y-2">
                        <label className="cursor-pointer bg-white border border-slate-200 text-[#0b5156] px-4 py-2 rounded-lg text-[10px] font-black uppercase inline-flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm">
                          <ImageIcon size={14} /> Cargar Nuevo Logo
                          <input type="file" accept="image/*" className="hidden" onChange={handleUploadLogo} />
                        </label>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Sugerido: 512x512px, PNG Transparente.</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nombre Comercial Público</label>
                      <input type="text" value={perfil?.nombre_comercial || ''} onChange={(e) => setPerfil({...perfil, nombre_comercial: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-black text-[#0b5156] focus:outline-none focus:border-[#0b5156] transition-colors shadow-sm" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Correo Oficial</label>
                        <input type="email" value={perfil?.email || ''} onChange={(e) => setPerfil({...perfil, email: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:border-[#0b5156] transition-colors shadow-sm" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Teléfono</label>
                        <input type="text" value={perfil?.telefono || ''} onChange={(e) => setPerfil({...perfil, telefono: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:border-[#0b5156] transition-colors shadow-sm" />
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* SECCION: MONEDAS */}
              {activeTab === 'monedas' && (
                <section className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="mb-8 border-b border-slate-100 pb-6">
                    <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter mb-1">Política Monetaria y Tasas</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Control de moneda base y sincronización con entes financieros.</p>
                  </div>

                  <div className="bg-[#0b5156] p-8 rounded-3xl shadow-xl relative overflow-hidden mb-8">
                    <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                      <div className="space-y-1">
                        <span className="text-white/60 text-[10px] font-black uppercase tracking-widest">Referencia BCV Actual</span>
                        <strong className="text-4xl font-black text-white tracking-tighter block">Bs. {tasa?.tasa || '0.00'}</strong>
                        <span className="text-green-400 text-[9px] font-bold uppercase tracking-widest flex items-center gap-1">
                          <CheckCircle2 size={10} /> Última sincronización: {tasa?.fecha || 'Desconocida'}
                        </span>
                      </div>
                      <button onClick={handleSyncTasa} disabled={isSaving} className="bg-white text-emerald-900 px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-slate-50 transition-all shadow-lg disabled:opacity-50">
                        <RefreshCcw size={14} className={isSaving ? 'animate-spin' : ''} /> {isSaving ? 'Sincronizando...' : 'Sincronizar Ahora'}
                      </button>
                    </div>
                    <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Moneda de Gestión (Pivot)</label>
                      <select disabled className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-500 opacity-70 cursor-not-allowed">
                        <option>USD — Dólar Estadounidense</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Moneda Legal (Libros)</label>
                      <select disabled className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-500 opacity-70 cursor-not-allowed">
                        <option>VED — Bolívar Digital</option>
                      </select>
                    </div>
                  </div>
                </section>
              )}

              {/* SECCION: USUARIOS (Placeholder for future sub-page or table) */}
              {activeTab === 'usuarios' && (
                <section className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="mb-8 border-b border-slate-100 pb-6 flex justify-between items-end">
                    <div>
                      <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter mb-1">Usuarios y Roles</h2>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gestión de accesos y permisos del sistema.</p>
                    </div>
                    <Link to="/admin/usuarios" className="bg-[#0b5156]/10 text-[#0b5156] px-4 py-2 rounded-lg text-[10px] font-black uppercase hover:bg-[#0b5156]/20 transition-all">
                      Ver Módulo Completo
                    </Link>
                  </div>
                  <div className="bg-slate-50 p-10 rounded-2xl border border-slate-200 border-dashed text-center">
                    <Users size={32} className="text-slate-300 mx-auto mb-3" />
                    <h3 className="text-sm font-black text-slate-500 uppercase">Gestión de Accesos</h3>
                    <p className="text-xs text-slate-400 font-bold mt-1">Este módulo se gestiona en una vista separada para mayor detalle.</p>
                  </div>
                </section>
              )}

              {/* SECCION: SUCURSALES */}
              {activeTab === 'sucursales' && (
                <section className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="mb-8 border-b border-slate-100 pb-6 flex justify-between items-end">
                    <div>
                      <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter mb-1">Sucursales y Sedes</h2>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gestión de puntos de venta y depósitos físicos.</p>
                    </div>
                    <button onClick={handleNewSucursal} className="bg-[#0b5156] text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase hover:bg-[#083a3d] transition-all">
                      Nueva Sucursal
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          <th className="p-4">Código</th>
                          <th className="p-4">Sede</th>
                          <th className="p-4">Ciudad</th>
                          <th className="p-4 text-center">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sucursales.length > 0 ? sucursales.map((sucursal: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 font-mono font-black text-[#0b5156]">{sucursal.codigo || `S-0${i+1}`}</td>
                            <td className="p-4 font-bold text-slate-700">{sucursal.nombre}</td>
                            <td className="p-4 text-xs font-bold text-slate-500">{sucursal.ciudad}</td>
                            <td className="p-4 text-center">
                              <span className="bg-green-100 text-green-700 text-[9px] font-black px-2 py-0.5 rounded uppercase">{sucursal.estado || 'Activo'}</span>
                            </td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan={4} className="p-8 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">No hay sucursales registradas</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* SECCION: API */}
              {activeTab === 'api' && (
                <section className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="mb-8 border-b border-slate-100 pb-6">
                    <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter mb-1">Integraciones y API</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tokens de acceso y webhooks para sistemas externos.</p>
                  </div>
                  <div className="bg-slate-50 p-10 rounded-2xl border border-slate-200 border-dashed text-center">
                    <Network size={32} className="text-slate-300 mx-auto mb-3" />
                    <h3 className="text-sm font-black text-slate-500 uppercase">Sin Integraciones Activas</h3>
                    <p className="text-xs text-slate-400 font-bold mt-1">Genera tokens de API para conectar ecommerce o sistemas de terceros.</p>
                    <button onClick={handleGenerateToken} className="mt-6 bg-white border border-slate-200 text-[#0b5156] px-4 py-2 rounded-lg text-[10px] font-black uppercase hover:bg-white transition-all shadow-sm">
                      Generar Token API
                    </button>
                  </div>
                </section>
              )}

              {/* SECCION: TELEGRAM */}
              {activeTab === 'telegram' && (
                <section className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <TelegramLinker />
                </section>
              )}

              {/* SECCION: AUDITORIA */}
              {activeTab === 'auditoria' && (
                <section className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <AuditConfig />
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
