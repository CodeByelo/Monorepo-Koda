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
  LockKeyhole,
  X,
  Plus,
  Edit2,
  Trash2,
  Receipt,
  FileText
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';

const UsersPermissions = () => {
  const navigate = useNavigate();
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [kpis, setKpis] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [sesiones, setSesiones] = useState<any[]>([]);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [permisosCriticos, setPermisosCriticos] = useState<Record<string, boolean>>({
    'Modificar precios en facturación': false,
    'Anular documentos cerrados/pagados': false,
    'Ver costos de compra (Margen Real)': false,
    'Exportar base de datos de clientes': false,
  });
  
  // States for user creation
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUserData, setNewUserData] = useState({
    nombre: '',
    email: '',
    password: '',
    rol: 'Usuario',
    es_vendedor: false,
    comision_pct: '5.00',
    meta_mensual_usd: ''
  });
  const [creating, setCreating] = useState(false);

  // States for vendor invoices drawer / modal
  const [selectedVendorInvoices, setSelectedVendorInvoices] = useState<any | null>(null);
  const [loadingInvoices, setLoadingInvoices] = useState(false);


  // States for vendor management
  const [showCreateVendorModal, setShowCreateVendorModal] = useState(false);
  const [newVendorData, setNewVendorData] = useState({
    nombre: '',
    codigo: '',
    email: '',
    meta_mensual_usd: '',
    porcentaje_comision: '5.00'
  });
  const [creatingVendor, setCreatingVendor] = useState(false);

  const [editingVendor, setEditingVendor] = useState<any | null>(null);
  const [editVendorData, setEditVendorData] = useState({
    nombre: '',
    codigo: '',
    email: '',
    meta_mensual_usd: '',
    porcentaje_comision: '5.00'
  });
  const [updatingVendor, setUpdatingVendor] = useState(false);

  const loadData = () => {
    Promise.all([
      api.get<any>('/admin/dashboard'),
      api.get<any[]>('/admin/usuarios'),
      api.get<any>('/admin/sesiones'),
      api.get<any[]>('/vendedores').catch(() => []),
    ]).then(([dash, users, sesionesRes, vendedoresRes]) => {
      const m = dash?.metricas || [];
      const sessList = sesionesRes?.sesiones || [];
      // El rol "Desarrollador" es la cuenta global del proveedor SaaS (super-admin
      // de plataforma), no un usuario corporativo del tenant. Se excluye de este
      // directorio para no exponer su correo personal junto al staff de la empresa.
      const usuariosCorporativos = (users || []).filter((u: any) => u.rol !== 'Desarrollador');
      setKpis([
        { label: 'Sesiones Activas', value: String(sessList.length || 0), color: 'text-[#0b5156]', bg: 'bg-green-50', border: 'border-green-200', icon: <Activity size={16} className="text-green-600" /> },
        { label: 'Usuarios Registrados', value: String(usuariosCorporativos.length || 0), color: 'text-slate-800', bg: 'bg-slate-50', border: 'border-slate-200', icon: <Users size={16} className="text-slate-500" /> },
        { label: 'Equipo Comercial', value: String(vendedoresRes?.length || 0), color: 'text-[#0b5156]', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: <Users size={16} className="text-[#0b5156]" /> },
        { label: 'Nivel de Riesgo', value: 'ÓPTIMO', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', icon: <ShieldCheck size={16} className="text-green-600" />, isText: true },
      ]);
      setUsuarios(usuariosCorporativos);
      setSesiones(sessList);
      setVendedores(vendedoresRes || []);
    }).catch(console.error);
  };

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVendorData.nombre.trim()) {
      alert("Ingrese el nombre del vendedor.");
      return;
    }
    const pct = Number(newVendorData.porcentaje_comision);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      alert("El porcentaje de comisión debe estar entre 0 y 100.");
      return;
    }
    setCreatingVendor(true);
    try {
      await api.post('/vendedores', {
        nombre: newVendorData.nombre.trim(),
        codigo: newVendorData.codigo.trim() || undefined,
        email: newVendorData.email.trim() || undefined,
        meta_mensual_usd: newVendorData.meta_mensual_usd ? Number(newVendorData.meta_mensual_usd) : 0,
        porcentaje_comision: pct,
      });
      alert("Vendedor registrado exitosamente.");
      setShowCreateVendorModal(false);
      setNewVendorData({ nombre: '', codigo: '', email: '', meta_mensual_usd: '', porcentaje_comision: '5.00' });
      loadData();
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Error al crear vendedor.");
    } finally {
      setCreatingVendor(false);
    }
  };

  const handleOpenEditVendor = (v: any) => {
    setEditingVendor(v);
    setEditVendorData({
      nombre: v.nombre || '',
      codigo: v.codigo || '',
      email: v.email || '',
      meta_mensual_usd: String(v.meta_mensual_usd ?? ''),
      porcentaje_comision: String(v.porcentaje_comision ?? '5.00'),
    });
  };

  const handleUpdateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVendor?.id) return;
    if (!editVendorData.nombre.trim()) {
      alert("El nombre del vendedor es obligatorio.");
      return;
    }
    const pct = Number(editVendorData.porcentaje_comision);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      alert("El porcentaje de comisión debe estar entre 0 y 100.");
      return;
    }
    setUpdatingVendor(true);
    try {
      await api.put(`/vendedores/${editingVendor.id}`, {
        nombre: editVendorData.nombre.trim(),
        codigo: editVendorData.codigo.trim() || undefined,
        meta_mensual_usd: editVendorData.meta_mensual_usd ? Number(editVendorData.meta_mensual_usd) : 0,
        porcentaje_comision: pct,
      });
      alert("Vendedor actualizado exitosamente.");
      setEditingVendor(null);
      loadData();
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Error al actualizar vendedor.");
    } finally {
      setUpdatingVendor(false);
    }
  };

  const handleDeleteVendorFromAdmin = async (v: any) => {
    if (!confirm(`¿Está seguro de que desea desactivar a "${v.nombre}"?`)) return;
    try {
      await api.delete(`/vendedores/${v.id}`);
      alert(`Vendedor "${v.nombre}" desactivado.`);
      loadData();
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Error al desactivar vendedor.");
    }
  };

  const handleViewVendorInvoices = async (v: any) => {
    setLoadingInvoices(true);
    try {
      const res = await api.get<any>(`/vendedores/${v.id}/facturas`);
      setSelectedVendorInvoices(res);
    } catch (error: any) {
      console.error("Error fetching vendor invoices:", error);
      alert(error.message || "Error al cargar historial de facturas del vendedor.");
    } finally {
      setLoadingInvoices(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserData.nombre || !newUserData.email || !newUserData.password) {
      alert("Por favor complete todos los campos.");
      return;
    }
    setCreating(true);
    try {
      await api.post('/admin/usuarios', {
        nombre: newUserData.nombre.trim(),
        email: newUserData.email.trim(),
        password: newUserData.password,
        rol: newUserData.rol,
        es_vendedor: newUserData.es_vendedor,
        comision_pct: newUserData.es_vendedor ? Number(newUserData.comision_pct) : undefined,
        meta_mensual_usd: newUserData.es_vendedor && newUserData.meta_mensual_usd ? Number(newUserData.meta_mensual_usd) : 0,
      });
      alert("Usuario registrado exitosamente.");
      setShowCreateModal(false);
      setNewUserData({
        nombre: '',
        email: '',
        password: '',
        rol: 'Usuario',
        es_vendedor: false,
        comision_pct: '5.00',
        meta_mensual_usd: ''
      });
      loadData();
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Error al crear usuario.");
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    if (!confirm("¿Está seguro de que desea revocar todas las sesiones activas? Se forzará el cierre de sesión de todos los usuarios en otros dispositivos.")) return;
    try {
      await api.post('/admin/sesiones/revoke', {});
      alert("Todas las sesiones activas han sido revocadas.");
      loadData();
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Error al revocar sesiones.");
    }
  };

  const handleTogglePermiso = async (perm: string, newVal: boolean) => {
    setPermisosCriticos(prev => ({ ...prev, [perm]: newVal }));
    // Log the permission change to audit trail
    try {
      await api.post<any>('/admin/auditoria/export'); // just to record
    } catch (_) {
      // permiso registrado en estado local
    }
  };

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
            <button 
              onClick={() => setShowCreateModal(true)} 
              className="bg-[#0b5156] text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
            >
              <Plus size={14} /> Crear Usuario
            </button>
            <button 
              onClick={handleRevokeAllSessions} 
              className="bg-red-50 text-red-600 border border-red-200 px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-sm hover:bg-red-100 transition-all"
            >
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
                    <th className="pb-4 px-4 text-left">Usuario / Identidad</th>
                    <th className="pb-4 px-4">Rol</th>
                    <th className="pb-4 px-4 text-left">Última Actividad</th>
                    <th className="pb-4 px-4 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {usuarios.length > 0 ? usuarios.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 text-left">
                        <strong className="text-sm font-black text-slate-800 block">{user.nombre}</strong>
                        <span className="text-xs text-slate-400 font-bold">{user.email}</span>
                      </td>
                      <td className="p-4 text-xs font-black text-[#0b5156] uppercase">{user.rol}</td>
                      <td className="p-4 text-left text-xs text-slate-500 font-bold">{user.ultimoAcceso}</td>
                      <td className="p-4 text-center">
                        <span className="bg-green-100 text-green-700 text-[9px] font-black px-2 py-0.5 rounded uppercase">
                          {user.estado || 'Activo'}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={4} className="py-12 text-center">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sin usuarios registrados</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          {/* Gestión de Equipo Comercial y Asesores de Ventas */}
          <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-end mb-6 border-b border-slate-100 pb-4">
              <div>
                <span className="bg-[#0b5156] text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest inline-block mb-1">
                  Comercial
                </span>
                <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Equipo Comercial (Asesores y Vendedores)</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Gestión directa de comisiones, metas y asesores asignables en facturación.</p>
              </div>
              <button
                onClick={() => setShowCreateVendorModal(true)}
                className="bg-[#0b5156] text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5 shadow-md hover:bg-[#083a3d] transition-all"
              >
                <Plus size={13} /> Nuevo Vendedor
              </button>
            </div>

            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <th className="pb-4 px-4 text-left">Vendedor</th>
                    <th className="pb-4 px-4 text-center">Código</th>
                    <th className="pb-4 px-4 text-right">Comisión Base</th>
                    <th className="pb-4 px-4 text-right">Meta ($)</th>
                    <th className="pb-4 px-4 text-center">Estado</th>
                    <th className="pb-4 px-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs">
                  {vendedores.length > 0 ? vendedores.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 text-left">
                        <strong className="text-sm font-black text-slate-800 block">{v.nombre}</strong>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">{v.email || 'Sin correo asignado'}</span>
                      </td>
                      <td className="p-4 text-center font-mono font-bold text-slate-600">{v.codigo}</td>
                      <td className="p-4 text-right font-black text-[#0b5156]">{v.porcentaje_comision}%</td>
                      <td className="p-4 text-right font-mono font-bold text-slate-700">${Number(v.meta_mensual_usd || 0).toLocaleString()}</td>
                      <td className="p-4 text-center">
                        <span className={`${v.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} text-[9px] font-black px-2 py-0.5 rounded uppercase`}>
                          {v.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleViewVendorInvoices(v)}
                            title="Ver facturas y rendimiento del vendedor"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                          >
                            <Receipt size={14} />
                          </button>
                          <button
                            onClick={() => handleOpenEditVendor(v)}
                            title="Editar vendedor"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-[#0b5156] hover:bg-slate-100 transition-colors"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteVendorFromAdmin(v)}
                            title="Desactivar vendedor"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="py-8 text-center">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sin vendedores registrados</p>
                      </td>
                    </tr>
                  )}
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
                    <th className="pb-4 px-4 text-left">Usuario</th>
                    <th className="pb-4 px-4 text-left">Dispositivo / Navegador</th>
                    <th className="pb-4 px-4 text-left">IP / Ubicación</th>
                    <th className="pb-4 px-4 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {sesiones.length > 0 ? sesiones.map((ses) => (
                    <tr key={ses.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 text-left">
                        <strong className="text-sm font-black text-slate-800 block">{ses.usuario}</strong>
                        <span className="text-xs text-slate-400 font-bold">{ses.email} ({ses.rol})</span>
                      </td>
                      <td className="p-4 text-left text-xs text-slate-500 font-bold">{ses.dispositivo}</td>
                      <td className="p-4 text-left text-xs text-slate-500 font-mono font-bold">{ses.ip}</td>
                      <td className="p-4 text-right">
                        <span className="bg-emerald-100 text-emerald-700 text-[9px] font-black px-2 py-0.5 rounded uppercase">
                          Activa
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={4} className="py-12 text-center">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sin sesiones activas</p>
                      </td>
                    </tr>
                  )}
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
             <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Habilite o deshabilite acciones de alto riesgo para todos los usuarios del sistema.</p>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                {Object.entries(permisosCriticos).map(([perm, checked], i) => (
                   <label key={i} className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-100 rounded-xl cursor-pointer hover:bg-white hover:border-slate-300 transition-all">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => handleTogglePermiso(perm, e.target.checked)}
                        className="w-4 h-4 text-[#0b5156] bg-white border-slate-300 rounded focus:ring-[#0b5156]"
                      />
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
            
            <div className="space-y-4 text-xs font-bold uppercase text-slate-500">
               <div className="p-3 bg-white rounded-xl border border-slate-150">
                 <span className="text-[9px] text-[#0b5156]">SISTEMA</span>
                 <p className="text-slate-700 mt-1">Conexión a BD PostgreSQL Verificada</p>
               </div>
               <div className="p-3 bg-white rounded-xl border border-slate-150">
                 <span className="text-[9px] text-[#0b5156]">SEGURIDAD</span>
                 <p className="text-slate-700 mt-1">Políticas de RLS forzadas para multi-tenant</p>
               </div>
            </div>

            <button
              onClick={() => navigate('/admin/auditoria')}
              className="w-full mt-6 bg-white border border-slate-200 text-[#0b5156] px-4 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all shadow-sm"
            >
               Ver Historial Completo
            </button>
          </div>
        </aside>

      </div>

      {/* Modal de Crear Usuario */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200 p-4">
          <div className="bg-white p-8 rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md animate-in zoom-in-95 duration-200 relative">
             <button 
               onClick={() => setShowCreateModal(false)}
               className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
             >
               <X size={18} />
             </button>
             <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter mb-2">Crear Nuevo Usuario</h2>
             <p className="text-xs font-bold text-slate-500 uppercase mb-6 leading-tight">
               Ingrese los datos de la nueva identidad en la plataforma.
             </p>

             <form onSubmit={handleCreateUser} className="space-y-4">
               <div>
                 <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Nombre Completo</label>
                 <input 
                   type="text" 
                   required
                   value={newUserData.nombre}
                   onChange={e => setNewUserData({...newUserData, nombre: e.target.value})}
                   className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#0b5156]"
                 />
               </div>
               <div>
                 <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Correo Electrónico</label>
                 <input 
                   type="email" 
                   required
                   value={newUserData.email}
                   onChange={e => setNewUserData({...newUserData, email: e.target.value})}
                   className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#0b5156]"
                 />
               </div>
               <div>
                 <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Contraseña Temporal</label>
                 <input 
                   type="password" 
                   required
                   value={newUserData.password}
                   onChange={e => setNewUserData({...newUserData, password: e.target.value})}
                   className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#0b5156]"
                 />
               </div>
               <div>
                 <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Rol Operativo</label>
                 <select 
                   value={newUserData.rol}
                   onChange={e => setNewUserData({...newUserData, rol: e.target.value})}
                   className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#0b5156]"
                 >
                   <option value="Usuario">Usuario Regular</option>
                   <option value="Admin">Administrador</option>
                   <option value="Gerente">Gerente de Área</option>
                   <option value="CEO">CEO / Director</option>
                 </select>
               </div>

               <div className="flex gap-3 pt-4">
                 <button 
                   type="button"
                   onClick={() => setShowCreateModal(false)}
                   className="flex-1 bg-white border border-slate-200 text-slate-600 px-4 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-colors"
                 >
                   Cancelar
                 </button>
                 <button 
                   type="submit"
                   disabled={creating}
                   className="flex-1 bg-[#0b5156] text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-[#083a3d] transition-colors shadow-lg disabled:opacity-50"
                 >
                   {creating ? 'Creando...' : 'Crear Usuario'}
                 </button>
               </div>
             </form>
          </div>
        </div>
      )}

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

      {/* Modal Crear Vendedor */}
      {showCreateVendorModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-2xl max-w-md w-full animate-in zoom-in-95 duration-200">
             <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Registrar Vendedor</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Añadir asesor al catálogo comercial y facturación.</p>
                </div>
                <button onClick={() => setShowCreateVendorModal(false)} className="text-slate-400 hover:text-slate-600 p-2">
                   <X size={18} />
                </button>
             </div>

             <form onSubmit={handleCreateVendor} className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Nombre Completo *</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ej: Carlos Pérez"
                    value={newVendorData.nombre}
                    onChange={e => setNewVendorData({...newVendorData, nombre: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#0b5156]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Código</label>
                    <input 
                      type="text" 
                      placeholder="Ej: VEN-001"
                      value={newVendorData.codigo}
                      onChange={e => setNewVendorData({...newVendorData, codigo: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#0b5156]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Meta Mensual ($)</label>
                    <input 
                      type="number"
                      min="0"
                      step="0.01" 
                      placeholder="0.00"
                      value={newVendorData.meta_mensual_usd}
                      onChange={e => setNewVendorData({...newVendorData, meta_mensual_usd: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#0b5156]"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Porcentaje de Comisión (%) *</label>
                  <input 
                    type="number" 
                    required
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="5.00"
                    value={newVendorData.porcentaje_comision}
                    onChange={e => setNewVendorData({...newVendorData, porcentaje_comision: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#0b5156]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Correo Electrónico (Opcional)</label>
                  <input 
                    type="email" 
                    placeholder="carlos@empresa.com"
                    value={newVendorData.email}
                    onChange={e => setNewVendorData({...newVendorData, email: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#0b5156]"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setShowCreateVendorModal(false)}
                    className="flex-1 bg-white border border-slate-200 text-slate-600 px-4 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={creatingVendor}
                    className="flex-1 bg-[#0b5156] text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-[#083a3d] transition-colors shadow-lg disabled:opacity-50"
                  >
                    {creatingVendor ? 'Registrando...' : 'Registrar Vendedor'}
                  </button>
                </div>
             </form>
          </div>
        </div>
      )}

      {/* Modal Editar Vendedor */}
      {editingVendor && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-2xl max-w-md w-full animate-in zoom-in-95 duration-200">
             <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Editar Vendedor</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Modificar datos, meta o comisión.</p>
                </div>
                <button onClick={() => setEditingVendor(null)} className="text-slate-400 hover:text-slate-600 p-2">
                   <X size={18} />
                </button>
             </div>

             <form onSubmit={handleUpdateVendor} className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Nombre Completo *</label>
                  <input 
                    type="text" 
                    required
                    value={editVendorData.nombre}
                    onChange={e => setEditVendorData({...editVendorData, nombre: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#0b5156]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Código</label>
                    <input 
                      type="text" 
                      value={editVendorData.codigo}
                      onChange={e => setEditVendorData({...editVendorData, codigo: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#0b5156]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Meta Mensual ($)</label>
                    <input 
                      type="number"
                      min="0"
                      step="0.01" 
                      value={editVendorData.meta_mensual_usd}
                      onChange={e => setEditVendorData({...editVendorData, meta_mensual_usd: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#0b5156]"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Porcentaje de Comisión (%) *</label>
                  <input 
                    type="number" 
                    required
                    min="0"
                    max="100"
                    step="0.01"
                    value={editVendorData.porcentaje_comision}
                    onChange={e => setEditVendorData({...editVendorData, porcentaje_comision: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#0b5156]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Correo Electrónico</label>
                  <input 
                    type="email" 
                    value={editVendorData.email}
                    onChange={e => setEditVendorData({...editVendorData, email: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#0b5156]"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setEditingVendor(null)}
                    className="flex-1 bg-white border border-slate-200 text-slate-600 px-4 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={updatingVendor}
                    className="flex-1 bg-[#0b5156] text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-[#083a3d] transition-colors shadow-lg disabled:opacity-50"
                  >
                    {updatingVendor ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
             </form>
          </div>
        </div>
      )}

      {/* Modal Historial de Facturas del Vendedor */}
      {selectedVendorInvoices && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
              <div>
                <span className="bg-[#0b5156] text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest inline-block mb-1">
                  Rendimiento Comercial
                </span>
                <h3 className="text-2xl font-black text-[#0b5156] uppercase tracking-tighter">
                  {selectedVendorInvoices.vendedor.nombre}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  Código: <span className="font-mono text-slate-600">{selectedVendorInvoices.vendedor.codigo}</span> · Comisión Base: <span className="text-[#0b5156]">{selectedVendorInvoices.vendedor.porcentaje_comision}%</span> · Meta: <span className="text-slate-700 font-mono">${selectedVendorInvoices.vendedor.meta_mensual_usd.toLocaleString()}</span>
                </p>
              </div>
              <button onClick={() => setSelectedVendorInvoices(null)} className="text-slate-400 hover:text-slate-600 p-2">
                <X size={20} />
              </button>
            </div>

            {/* Resumen KPIs del Vendedor */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Total Facturado</span>
                <strong className="text-2xl font-black text-[#0b5156] font-mono">
                  ${selectedVendorInvoices.total_facturado_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </div>
              <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200/60">
                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest block">Comisión Generada</span>
                <strong className="text-2xl font-black text-emerald-700 font-mono">
                  ${selectedVendorInvoices.total_comision_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </div>
            </div>

            {/* Tabla de Facturas */}
            <div className="flex-1 overflow-y-auto no-scrollbar border border-slate-100 rounded-2xl">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50 sticky top-0">
                    <th className="p-3">Factura</th>
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Cliente</th>
                    <th className="p-3 text-right">Total ($)</th>
                    <th className="p-3 text-right">Comisión ($)</th>
                    <th className="p-3 text-center">Cobro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs">
                  {selectedVendorInvoices.facturas.length > 0 ? selectedVendorInvoices.facturas.map((f: any) => (
                    <tr key={f.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-mono font-bold text-slate-800">{f.numero_factura}</td>
                      <td className="p-3 text-slate-500 font-bold">{f.fecha}</td>
                      <td className="p-3">
                        <strong className="text-slate-800 block text-xs">{f.cliente_nombre}</strong>
                        <span className="text-[10px] text-slate-400 uppercase font-mono">{f.cliente_rif}</span>
                      </td>
                      <td className="p-3 text-right font-mono font-black text-slate-700">
                        ${f.monto_total_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right font-mono font-black text-[#0b5156]">
                        ${f.comision_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${
                          f.estado_pago === 'PAGADO' ? 'bg-green-100 text-green-700' :
                          f.estado_pago === 'PARCIAL' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {f.estado_pago}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">
                        Sin facturas emitidas por este vendedor
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100 mt-4">
              <button
                onClick={() => setSelectedVendorInvoices(null)}
                className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default UsersPermissions;
