import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Users, 
  Search, 
  UserPlus, 
  ShieldCheck, 
  History, 
  TrendingUp,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  Filter,
  Maximize2,
  Minimize2,
  X,
  Edit2,
  Trash2,
  CheckCircle,
  Zap,
  AlertTriangle
} from 'lucide-react';
import { api } from '@/api/client';

interface Cliente {
  id: number;
  rif: string;
  nombre: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  es_contribuyente_especial?: boolean;
}

const Customers = () => {
  const [customers, setCustomers] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Cliente | null>(null);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Cliente | null>(null);

  // Premium Notification & Deletion States
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<number | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Form States
  const [rif, setRif] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [direccion, setDireccion] = useState('');
  const [esContribuyenteEspecial, setEsContribuyenteEspecial] = useState(false);

  // RIF Validation States
  const [isValidatingRif, setIsValidatingRif] = useState(false);
  const [rifError, setRifError] = useState<string | null>(null);
  const [rifSuccessMsg, setRifSuccessMsg] = useState<string | null>(null);

  const handleRifBlur = async () => {
    if (!rif) return;
    try {
      setIsValidatingRif(true);
      setRifError(null);
      setRifSuccessMsg(null);
      const res = await api.get<any>(`/fiscal/validar-rif?rif=${encodeURIComponent(rif)}`);
      if (res && res.valido) {
        setRif(res.rif);
        if (res.nombre) {
          setNombre(res.nombre);
        }
        setRifSuccessMsg(res.origen ? `Validado: ${res.origen}` : 'Validado con éxito');
      }
    } catch (err: any) {
      setRifError(err.message || 'Error al validar RIF');
    } finally {
      setIsValidatingRif(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const data = await api.get<Cliente[]>('/clientes');
      setCustomers(data);
      if (data.length > 0 && !selectedCustomer) {
        setSelectedCustomer(data[0]);
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Error al cargar clientes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleOpenCreateModal = () => {
    setEditingCustomer(null);
    setRif('');
    setNombre('');
    setTelefono('');
    setEmail('');
    setDireccion('');
    setEsContribuyenteEspecial(false);
    setRifError(null);
    setRifSuccessMsg(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (c: Cliente, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCustomer(c);
    setRif(c.rif);
    setNombre(c.nombre);
    setTelefono(c.telefono || '');
    setEmail(c.email || '');
    setDireccion(c.direccion || '');
    setEsContribuyenteEspecial(c.es_contribuyente_especial || false);
    setRifError(null);
    setRifSuccessMsg(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        rif,
        nombre,
        telefono: telefono || null,
        email: email || null,
        direccion: direccion || null,
        es_contribuyente_especial: esContribuyenteEspecial
      };

      if (editingCustomer) {
        const updated = await api.put<Cliente>(`/clientes/${editingCustomer.id}`, payload);
        setSelectedCustomer(updated);
        showToast('Cliente actualizado exitosamente', 'success');
      } else {
        await api.post('/clientes', payload);
        showToast('Cliente registrado exitosamente', 'success');
      }
      setIsModalOpen(false);
      fetchCustomers();
    } catch (err: any) {
      showToast(err.message || 'Error al guardar cliente', 'error');
    }
  };

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCustomerToDelete(id);
  };

  const handleConfirmDelete = async () => {
    if (customerToDelete === null) return;
    try {
      await api.delete(`/clientes/${customerToDelete}`);
      if (selectedCustomer?.id === customerToDelete) {
        setSelectedCustomer(null);
      }
      showToast('Cliente eliminado exitosamente', 'success');
      fetchCustomers();
    } catch (err: any) {
      showToast(err.message || 'Error al eliminar cliente', 'error');
    } finally {
      setCustomerToDelete(null);
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.rif.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.direccion && c.direccion.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // KPIs dinámicos
  const totalClientes = customers.length;
  const contribuyentesEspeciales = customers.filter(c => c.es_contribuyente_especial).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Directorio de Clientes</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-2xl">
              Busca por nombre, RIF, condicion de pago o estado de cuenta centralizada.
            </p>
          </div>
          <div className="flex gap-3">
             <button 
               onClick={handleOpenCreateModal}
               className="bg-[#0b5156] text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 tracking-widest shadow-lg shadow-green-900/20 hover:bg-[#083a3d]"
             >
               <UserPlus size={16} /> Nuevo Cliente
             </button>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        {[
          { t: 'Clientes Totales', v: totalClientes, desc: 'En directorio activo', c: 'text-[#0b5156]', i: Users },
          { t: 'Contribuyentes Especiales', v: contribuyentesEspeciales, desc: 'Agentes de retencion (Jurídicos)', c: 'text-[#43584b]', i: ShieldCheck },
          { t: 'Cuentas por Cobrar', v: '$0.00', desc: 'Saldo total adeudado', c: 'text-red-600', i: TrendingUp },
          { t: 'Nuevos (Mes)', v: '+0', desc: 'Crecimiento de cartera', c: 'text-[#0b5156]', i: History }
        ].map((kpi, i) => (
          <div key={i} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm h-full flex flex-col">
            <div className="flex justify-between items-start min-h-[32px] mb-1">
               <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-tight pr-2">{kpi.t}</p>
               <kpi.i size={14} className={`${kpi.c} opacity-40 shrink-0`} />
            </div>
            <strong className={`text-2xl font-black ${kpi.c} tracking-tighter font-mono mb-1`}>{kpi.v}</strong>
            <div className="mt-auto">
               <p className="text-[9px] font-bold text-slate-400 uppercase leading-tight">{kpi.desc}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <section className={`bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col transition-all duration-300 ${isExpanded ? 'fixed inset-4 z-50 rounded-3xl shadow-2xl' : 'lg:col-span-2 rounded-3xl'}`}>
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-wrap gap-4 items-center">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Buscar por RIF, Nombre o Ubicacion..." 
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]/30"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex-1"></div>
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
              title={isExpanded ? "Restaurar vista" : "Pantalla completa"}
            >
              {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>

          {loading ? (
            <p className="text-center py-10 text-xs font-bold text-slate-400 uppercase">Cargando clientes...</p>
          ) : error ? (
            <p className="text-center py-10 text-xs font-bold text-red-500 uppercase">{error}</p>
          ) : filteredCustomers.length === 0 ? (
            <p className="text-center py-10 text-xs font-bold text-slate-400 uppercase">No hay clientes registrados</p>
          ) : (
            <div className={`overflow-x-auto no-scrollbar ${isExpanded ? 'flex-1' : ''}`}>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] font-black text-slate-500 uppercase tracking-[0.1em] border-b border-slate-100">
                    <th className="py-4 px-6">Cliente</th>
                    <th className="py-4 px-6">RIF / Cédula</th>
                    <th className="py-4 px-6 text-center">C. Especial</th>
                    <th className="py-4 px-6 text-center">Condicion Pago</th>
                    <th className="py-4 px-6 text-right">Saldo</th>
                    <th className="py-4 px-6 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredCustomers.map((c, i) => {
                    const isSpecial = c.es_contribuyente_especial;
                    return (
                      <tr 
                        key={i} 
                        onClick={() => setSelectedCustomer(c)}
                        className={`group hover:bg-slate-50/50 transition-colors cursor-pointer ${selectedCustomer?.id === c.id ? 'bg-slate-50' : ''}`}
                      >
                        <td className="py-5 px-6">
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-slate-800 uppercase">{c.nombre}</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase">{c.direccion || 'Sin dirección'}</span>
                          </div>
                        </td>
                        <td className="py-5 px-6 text-xs font-black text-slate-400 tracking-widest uppercase">{c.rif}</td>
                        <td className="py-5 px-6 text-center">
                           <span className={`text-xs font-black px-3 py-1 rounded-full uppercase border border-current/10 ${isSpecial ? 'bg-[#0b5156]/10 text-[#0b5156]' : 'text-slate-300'}`}>
                             {isSpecial ? 'SI' : 'NO'}
                           </span>
                        </td>
                        <td className="py-5 px-6 text-center text-xs font-bold text-slate-500 uppercase">Contado</td>
                        <td className="py-5 px-6 text-right font-black text-slate-300">
                          $0.00
                        </td>
                        <td className="py-5 px-6 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-2">
                            <button 
                              onClick={(e) => handleOpenEditModal(c, e)}
                              className="p-1 hover:text-[#0b5156] text-slate-400 transition-colors"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button 
                              onClick={(e) => handleDelete(c.id, e)}
                              className="p-1 hover:text-red-600 text-slate-400 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-8">
           <div>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">Ficha de Cliente</h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Detalles del contacto seleccionado.</p>
           </div>
           
           {selectedCustomer ? (
             <>
               <div className="flex flex-col items-center text-center space-y-4">
                  <div className="w-20 h-20 rounded-3xl bg-[#bdafa1]/20 flex items-center justify-center text-[#0b5156] border-2 border-white shadow-xl">
                     <Users size={32} />
                  </div>
                  <div>
                      <strong className="text-xl font-black text-[#0b5156] uppercase block tracking-tighter font-mono">{selectedCustomer.nombre}</strong>
                      <span className="text-[10px] font-black bg-[#43584b]/10 text-[#43584b] px-3 py-1 rounded-full uppercase border border-[#43584b]/20">
                        {selectedCustomer.es_contribuyente_especial ? 'Contribuyente Especial' : 'Contribuyente Ordinario'}
                      </span>
                  </div>
               </div>

               <div className="space-y-4 pt-4">
                  <div className="flex items-center gap-4 text-slate-600">
                     <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-500"><Mail size={14} /></div>
                     <span className="text-[10px] font-bold lowercase tracking-tight">{selectedCustomer.email || 'sin_correo@ejemplo.com'}</span>
                  </div>
                  <div className="flex items-center gap-4 text-slate-600">
                     <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-500"><Phone size={14} /></div>
                     <span className="text-xs font-bold tracking-tighter">{selectedCustomer.telefono || 'Sin teléfono'}</span>
                  </div>
                  <div className="flex items-center gap-4 text-slate-600">
                     <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-500"><MapPin size={14} /></div>
                     <span className="text-xs font-bold uppercase leading-tight text-xs">{selectedCustomer.direccion || 'Sin dirección registrada'}</span>
                  </div>
               </div>

               <div className="pt-6">
                  <button className="w-full bg-[#0b5156] text-white font-black py-5 rounded-2xl uppercase text-sm tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-[#0b5156]/20 hover:scale-[1.02] transition-all">
                    Ver Historial de Pagos <ExternalLink size={16} />
                  </button>
               </div>
             </>
           ) : (
             <p className="text-center text-xs font-bold text-slate-400 uppercase py-10">Seleccione un cliente para ver detalles</p>
           )}
        </aside>
      </div>

      {/* Modal de Crear / Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[9999] animate-in fade-in duration-300 p-4">
          <div className="bg-white rounded-[2rem] p-8 max-w-md w-full border border-slate-200 shadow-2xl relative overflow-hidden">
            {/* Elemento decorativo de fondo */}
            <div className="absolute top-0 right-0 p-6 opacity-[0.03] pointer-events-none">
              <Users size={160} className="text-[#0b5156] -rotate-12" />
            </div>
            
            <button 
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all z-20 cursor-pointer"
            >
              <X size={16} />
            </button>
            
            <div className="mb-8 relative z-10">
               <h3 className="text-2xl font-black uppercase text-slate-800 tracking-tighter font-mono">
                 {editingCustomer ? 'Editar Cliente' : 'Nuevo Cliente'}
               </h3>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                 Complete los datos fiscales del contacto
               </p>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">RIF / Cédula</label>
                <div className="relative">
                   <ShieldCheck size={16} className={`absolute left-4 top-1/2 -translate-y-1/2 ${isValidatingRif ? 'text-[#0b5156] animate-pulse' : 'text-slate-400'}`} />
                   <input 
                     type="text" 
                     value={rif}
                     onChange={(e) => setRif(e.target.value)}
                     onBlur={handleRifBlur}
                     required
                     placeholder="Ej. J-12345678-9"
                     className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black uppercase focus:outline-none focus:border-[#0b5156] focus:ring-4 focus:ring-[#0b5156]/10 transition-all font-mono"
                   />
                </div>
                {isValidatingRif && (
                  <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase animate-pulse">Verificando RIF en SENIAT...</p>
                )}
                {rifError && (
                  <p className="text-[10px] font-black text-red-500 mt-1 uppercase">{rifError}</p>
                )}
                {rifSuccessMsg && (
                  <p className="text-[10px] font-black text-green-600 mt-1 uppercase">{rifSuccessMsg}</p>
                )}
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Nombre / Razón Social</label>
                <div className="relative">
                   <Users size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                   <input 
                     type="text" 
                     value={nombre}
                     onChange={(e) => setNombre(e.target.value)}
                     required
                     placeholder="Ej. Distribuidora Andina, C.A."
                     className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black uppercase focus:outline-none focus:border-[#0b5156] focus:ring-4 focus:ring-[#0b5156]/10 transition-all"
                   />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Teléfono</label>
                  <div className="relative">
                     <Phone size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                     <input 
                       type="text" 
                       value={telefono}
                       onChange={(e) => setTelefono(e.target.value)}
                       placeholder="Opcional"
                       className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black uppercase focus:outline-none focus:border-[#0b5156] focus:ring-4 focus:ring-[#0b5156]/10 transition-all font-mono"
                     />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Correo Electrónico</label>
                  <div className="relative">
                     <Mail size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                     <input 
                       type="email" 
                       value={email}
                       onChange={(e) => setEmail(e.target.value)}
                       placeholder="Opcional"
                       className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-black lowercase focus:outline-none focus:border-[#0b5156] focus:ring-4 focus:ring-[#0b5156]/10 transition-all font-mono"
                     />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Dirección Fiscal</label>
                <div className="relative">
                   <MapPin size={16} className="absolute left-4 top-4 text-slate-400" />
                   <textarea 
                     value={direccion}
                     onChange={(e) => setDireccion(e.target.value)}
                     placeholder="Dirección completa del contribuyente"
                     className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black uppercase focus:outline-none focus:border-[#0b5156] focus:ring-4 focus:ring-[#0b5156]/10 transition-all h-20 resize-none"
                   />
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer hover:border-[#0b5156]/30 transition-all group" onClick={() => setEsContribuyenteEspecial(!esContribuyenteEspecial)}>
                <div className={`w-5 h-5 rounded-md flex items-center justify-center border-2 transition-all ${esContribuyenteEspecial ? 'bg-[#0b5156] border-[#0b5156]' : 'bg-white border-slate-300 group-hover:border-[#0b5156]/50'}`}>
                   {esContribuyenteEspecial && <ShieldCheck size={12} className="text-white" />}
                </div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-tight cursor-pointer select-none">
                  Agente de Retención (Contribuyente Especial)
                </label>
              </div>

              <div className="pt-2">
                <button 
                  type="submit"
                  className="w-full bg-[#0b5156] hover:bg-[#093e42] text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-xl shadow-[#0b5156]/20 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                >
                  {editingCustomer ? 'Guardar Cambios' : <><UserPlus size={16} /> Crear Nuevo Cliente</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Eliminación */}
      {customerToDelete !== null && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[9999] animate-in fade-in duration-300 p-4">
          <div className="bg-white rounded-[2rem] p-8 max-w-sm w-full border border-slate-200 shadow-2xl relative overflow-hidden text-center space-y-6 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center mx-auto border-2 border-white shadow-xl">
               <AlertTriangle size={28} />
            </div>
            
            <div className="space-y-2">
               <h3 className="text-xl font-black uppercase text-slate-800 tracking-tighter font-mono">¿Eliminar Cliente?</h3>
               <p className="text-xs font-bold text-slate-500 uppercase tracking-wide leading-relaxed">
                 Esta acción es irreversible y podría afectar documentos fiscales asociados.
               </p>
            </div>
            
            <div className="flex gap-3 pt-2">
               <button 
                 type="button"
                 onClick={() => setCustomerToDelete(null)}
                 className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black py-3.5 rounded-2xl uppercase text-[10px] tracking-widest transition-all cursor-pointer"
               >
                 Cancelar
               </button>
               <button 
                 type="button"
                 onClick={handleConfirmDelete}
                 className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-3.5 rounded-2xl uppercase text-[10px] tracking-widest shadow-xl shadow-red-600/20 hover:scale-[1.02] transition-all cursor-pointer"
               >
                 Eliminar
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && typeof document !== 'undefined' && createPortal(
        <div className="fixed bottom-10 right-10 z-[9999] animate-in slide-in-from-bottom-10 fade-in duration-300">
          <div className={`px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 ${toast.type === 'success' ? 'bg-[#0b5156] border border-[#0b5156]/20 text-white' : 'bg-red-600 border border-red-500 text-white'}`}>
            {toast.type === 'success' ? <CheckCircle size={20} /> : <Zap size={20} />}
            <span className="font-bold text-sm tracking-wide uppercase font-mono">{toast.message}</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Customers;
