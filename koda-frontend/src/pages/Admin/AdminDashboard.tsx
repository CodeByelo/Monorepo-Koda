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
  const [apiToken, setApiToken] = useState<string>('');
  const [copiedToken, setCopiedToken] = useState(false);
  const [usuarios, setUsuarios] = useState<any[]>([]);

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
        const perfilRes = await api.get<any>('/entidades/empresa/perfil');
        setPerfil(perfilRes || { nombre_comercial: '', email: '', telefono: '' });
      } else if (activeTab === 'monedas') {
        const tasaRes = await api.get<any>('/tasa/actual');
        setTasa(tasaRes);
      } else if (activeTab === 'sucursales') {
        const sucursalesRes = await api.get<any[]>('/entidades/empresa/sucursales');
        setSucursales(sucursalesRes || []);
      } else if (activeTab === 'usuarios') {
        const usuariosRes = await api.get<any[]>('/admin/usuarios');
        setUsuarios(usuariosRes || []);
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
      await api.put('/entidades/empresa/perfil', perfil);
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
        const res = await api.post<any>('/entidades/empresa/logo', formData);
        alert('Logo actualizado exitosamente.');
        // Reload data to get the updated logo_url
        fetchData();
      } catch (error) {
        console.error("Error uploading logo", error);
        alert('Error al cargar logo.');
      }
    }
  };

  const handleDeleteLogo = async () => {
    if (!confirm('¿Estás seguro de que deseas eliminar el logo de la empresa?')) return;
    try {
      setIsSaving(true);
      await api.delete('/entidades/empresa/logo');
      alert('Logo eliminado exitosamente.');
      fetchData();
    } catch (error) {
      console.error("Error deleting logo", error);
      alert('Error al eliminar el logo.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateToken = async () => {
    try {
      const res = await api.post<any>('/entidades/empresa/api-tokens', {});
      if (res?.token) {
        setApiToken(res.token);
        alert('Token generado exitosamente.');
      }
    } catch (error) {
      console.error("Error generando token", error);
      alert('Error al generar token.');
    }
  };

  const handleCopyToken = () => {
    if (!apiToken) return;
    navigator.clipboard.writeText(apiToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 3000);
  };

  const handleNewSucursal = async () => {
    try {
      const codigo = prompt("Ingrese código de sucursal (ej. S-03):");
      const nombre = prompt("Ingrese nombre de sede:");
      const ciudad = prompt("Ingrese ciudad:");
      if (codigo && nombre && ciudad) {
        await api.post('/entidades/empresa/sucursales', { codigo, nombre, ciudad, estado: 'Activo' });
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
                      <div className="w-20 h-20 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center overflow-hidden">
                        {perfil?.logo_url ? (
                          <img src={perfil.logo_url} alt="Logo" className="w-full h-full object-contain" />
                        ) : (
                          <Building2 size={32} className="text-[#0b5156]" />
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex gap-2 items-center">
                          <label className="cursor-pointer bg-white border border-slate-200 text-[#0b5156] px-4 py-2 rounded-lg text-[10px] font-black uppercase inline-flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm">
                            <ImageIcon size={14} /> Cargar Nuevo Logo
                            <input type="file" accept="image/*" className="hidden" onChange={handleUploadLogo} />
                          </label>
                          {perfil?.logo_url && (
                            <button
                              onClick={handleDeleteLogo}
                              className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-[10px] font-black uppercase inline-flex items-center gap-2 hover:bg-red-100 transition-all shadow-sm"
                            >
                              Quitar Logo
                            </button>
                          )}
                        </div>
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

                  <div style={{ backgroundColor: '#0b5156' }} className="p-8 rounded-3xl shadow-xl relative overflow-hidden mb-8">
                    <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                      <div className="space-y-1">
                        <span className="text-white/60 text-[10px] font-black uppercase tracking-widest">Referencia BCV Actual</span>
                        <strong className="text-4xl font-black text-white tracking-tighter block">Bs. {tasa?.tasa || '0.00'}</strong>
                        <span className="text-green-400 text-[9px] font-bold uppercase tracking-widest flex items-center gap-1">
                          <CheckCircle2 size={10} /> Última sincronización: {tasa?.fecha || 'Desconocida'}
                        </span>
                      </div>
                      <button onClick={handleSyncTasa} disabled={isSaving} style={{ color: '#0b5156' }} className="bg-white text-[#0b5156] px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-slate-50 transition-all shadow-lg disabled:opacity-50">
                        <RefreshCcw size={14} style={{ color: '#0b5156' }} className={isSaving ? 'animate-spin' : ''} />
                        <span style={{ color: '#0b5156' }}>{isSaving ? 'Sincronizando...' : 'Sincronizar Ahora'}</span>
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

              {activeTab === 'usuarios' && (
                <section className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="mb-8 border-b border-slate-100 pb-6 flex justify-between items-end">
                    <div>
                      <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter mb-1">Usuarios y Roles</h2>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gestión de accesos y permisos del sistema.</p>
                    </div>
                    <Link to="/admin/usuarios" className="bg-[#0b5156] text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase hover:bg-[#083a3d] transition-all">
                      Ver Módulo Completo
                    </Link>
                  </div>
                  
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          <th className="p-4">Usuario</th>
                          <th className="p-4">Correo</th>
                          <th className="p-4">Rol</th>
                          <th className="p-4 text-center">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {usuarios.length > 0 ? usuarios.map((u: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 font-bold text-slate-750">{u.nombre}</td>
                            <td className="p-4 font-mono text-xs text-slate-500">{u.email}</td>
                            <td className="p-4 text-xs font-black text-[#0b5156] uppercase">{u.rol}</td>
                            <td className="p-4 text-center">
                              <span className="bg-green-100 text-green-700 text-[9px] font-black px-2 py-0.5 rounded uppercase">Activo</span>
                            </td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan={4} className="p-8 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando usuarios registrados...</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* SECCION: SUCURSALES */}
              {activeTab === 'sucursales' && (
                <section className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="mb-6 flex justify-between items-end">
                    <div>
                      <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter mb-1">Sucursales y Sedes</h2>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gestión de puntos de venta y depósitos físicos.</p>
                    </div>
                    <button onClick={handleNewSucursal} className="bg-[#0b5156] text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase hover:bg-[#083a3d] transition-all">
                      Nueva Sucursal
                    </button>
                  </div>

                  {/* Informational guide */}
                  <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-xs text-emerald-950 font-medium leading-relaxed">
                    💡 <strong>¿Qué son las sucursales?</strong> Las sucursales representan ubicaciones físicas de venta o depósitos de mercancía (almacenes). Se utilizan para controlar el inventario de manera geolocalizada y asignar las ventas a una sede física específica, garantizando un control geográfico preciso de las operaciones de KODA.
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
                  <div className="bg-slate-50 p-10 rounded-2xl border border-slate-200 border-dashed text-center mb-6">
                    <Network size={32} className="text-slate-300 mx-auto mb-3" />
                    {apiToken ? (
                      <div className="space-y-4 max-w-md mx-auto text-left">
                        <h3 className="text-sm font-black text-[#0b5156] uppercase text-center">Token de Acceso Activo</h3>
                        <p className="text-xs text-slate-500 font-semibold">Use este token para autenticar llamadas externas a la API del sistema.</p>
                        <div className="flex gap-2 items-center bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                          <code className="text-xs font-mono font-bold text-slate-700 select-all break-all flex-1">{apiToken}</code>
                          <button 
                            onClick={handleCopyToken}
                            className="bg-[#0b5156] text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase hover:bg-[#083a3d] transition-all whitespace-nowrap"
                          >
                            {copiedToken ? 'Copiado' : 'Copiar'}
                          </button>
                        </div>
                        <button onClick={handleGenerateToken} className="w-full bg-white border border-slate-200 text-slate-650 px-4 py-2.5 rounded-lg text-[10px] font-black uppercase hover:bg-slate-50 transition-all shadow-sm">
                          Regenerar Token
                        </button>
                      </div>
                    ) : (
                      <>
                        <h3 className="text-sm font-black text-slate-500 uppercase">Sin Integraciones Activas</h3>
                        <p className="text-xs text-slate-400 font-bold mt-1">Genera tokens de API para conectar ecommerce o sistemas de terceros.</p>
                        <button onClick={handleGenerateToken} className="mt-6 bg-white border border-slate-200 text-[#0b5156] px-4 py-2 rounded-lg text-[10px] font-black uppercase hover:bg-white transition-all shadow-sm">
                          Generar Token API
                        </button>
                      </>
                    )}
                  </div>

                  {apiToken && (
                    <div className="space-y-4 bg-slate-50 border border-slate-200 p-6 rounded-2xl animate-in fade-in duration-300">
                      <h4 className="text-xs font-black text-[#0b5156] uppercase tracking-widest">Guía de Uso de la API</h4>
                      <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                        Para autenticar las solicitudes externas con su ecommerce u otras herramientas, agregue el token de acceso generado como un encabezado HTTP de tipo portador (Bearer Token):
                      </p>
                      <pre className="bg-white border border-slate-200 p-4 rounded-xl text-[10px] font-mono text-slate-700 overflow-x-auto">
{`Authorization: Bearer ${apiToken}`}
                      </pre>
                      <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                        <strong>Ejemplo en cURL:</strong>
                      </p>
                      <pre className="bg-white border border-slate-200 p-4 rounded-xl text-[10px] font-mono text-slate-700 overflow-x-auto">
{`curl -X POST "${window.location.origin}/api/v1/facturacion/emitir" \\
  -H "Authorization: Bearer ${apiToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "cliente_id": "00000000-0000-0000-0000-000000000001",
    "metodo_pago": "Transferencia",
    "moneda_documento": "USD",
    "aplica_igtf": false,
    "detalles": [
      {
        "producto_id": "1",
        "cantidad": 1,
        "precio_unitario": 150.00
      }
    ]
  }'`}
                      </pre>
                    </div>
                  )}
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
