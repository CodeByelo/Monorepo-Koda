import { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  CheckCircle2,
  ChevronDown,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { api } from '@/api/client';

interface Proveedor {
  id?: number;
  rif: string;
  nombre: string;
  telefono?: string;
  email?: string;
  direccion?: string;
}

const Suppliers = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [suppliers, setSuppliers] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Selected or editing supplier
  const [selectedSupplier, setSelectedSupplier] = useState<Proveedor | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Form states
  const [rif, setRif] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [direccion, setDireccion] = useState('');

  // Global Notifications
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setGlobalSuccess(msg);
    setTimeout(() => setGlobalSuccess(null), 3000);
  };
  
  const showError = (msg: string) => {
    setGlobalError(msg);
    setTimeout(() => setGlobalError(null), 3000);
  };

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

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const data = await api.get<Proveedor[]>('/proveedores');
      setSuppliers(data);
      if (data.length > 0) {
        handleSelectSupplier(data[0]);
      } else {
        handleNewSupplier();
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Error al cargar proveedores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleSelectSupplier = (s: Proveedor) => {
    setSelectedSupplier(s);
    setIsCreatingNew(false);
    setRif(s.rif);
    setNombre(s.nombre);
    setTelefono(s.telefono || '');
    setEmail(s.email || '');
    setDireccion(s.direccion || '');
    setRifError(null);
    setRifSuccessMsg(null);
  };

  const handleNewSupplier = () => {
    setSelectedSupplier(null);
    setIsCreatingNew(true);
    setRif('');
    setNombre('');
    setTelefono('');
    setEmail('');
    setDireccion('');
    setRifError(null);
    setRifSuccessMsg(null);
  };

  const handleSave = async () => {
    if (!rif || !nombre) {
      showError('RIF y Nombre son campos obligatorios.');
      return;
    }
    try {
      const payload = {
        rif,
        nombre,
        telefono: telefono || null,
        email: email || null,
        direccion: direccion || null
      };

      if (isCreatingNew) {
        const created = await api.post<Proveedor>('/proveedores', payload);
        showSuccess('Proveedor creado exitosamente.');
        fetchSuppliers();
      } else if (selectedSupplier?.id) {
        const updated = await api.put<Proveedor>(`/proveedores/${selectedSupplier.id}`, payload);
        showSuccess('Proveedor actualizado exitosamente.');
        fetchSuppliers();
      }
    } catch (err: any) {
      showError(err.message || 'Error al guardar proveedor');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Está seguro de eliminar este proveedor?')) return;
    try {
      await api.delete(`/proveedores/${id}`);
      showSuccess('Proveedor eliminado exitosamente.');
      fetchSuppliers();
    } catch (err: any) {
      showError(err.message || 'Error al eliminar proveedor');
    }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.rif.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-8 rounded-3xl border border-[#bdafa1]/20 shadow-sm">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-2">
            <p className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
               <span className="bg-[#0b5156] text-white px-2 py-0.5 rounded">MAESTROS</span> Directorio de Proveedores
            </p>
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">
              {isCreatingNew ? 'Nuevo Proveedor' : nombre || 'Directorio'}
            </h1>
            <div className="flex gap-2 mt-2">
               <span className="bg-[#0b5156]/10 text-[#0b5156] px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border border-[#0b5156]/20">
                 {rif.toUpperCase().startsWith('J') ? 'Contribuyente Especial' : 'Persona Natural'}
               </span>
               <span className="bg-[#43584b]/10 text-[#43584b] px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border border-[#43584b]/20">Estatus: Activo</span>
            </div>
          </div>
          <div className="flex gap-3">
             <button 
               onClick={handleSave}
               className="bg-[#0b5156] text-white px-8 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-[#0b5156]/20 hover:scale-105 transition-all"
             >
               {isCreatingNew ? 'Crear Proveedor' : 'Guardar Cambios'}
             </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        <section className="lg:col-span-1 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[700px]">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
              <input 
                type="text" 
                placeholder="BUSCAR PROVEEDOR..." 
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-800 focus:outline-none focus:border-[#0b5156] uppercase"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          {loading ? (
            <p className="p-4 text-xs font-bold text-slate-400 uppercase text-center">Cargando...</p>
          ) : filteredSuppliers.length === 0 ? (
            <p className="p-4 text-xs font-bold text-slate-400 uppercase text-center">Sin resultados</p>
          ) : (
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50 custom-scrollbar">
              {filteredSuppliers.map((s, i) => (
                <div 
                  key={i} 
                  onClick={() => handleSelectSupplier(s)}
                  className={`p-4 cursor-pointer transition-all hover:bg-[#bdafa1]/5 flex justify-between items-center ${(!isCreatingNew && selectedSupplier?.id === s.id) ? 'bg-[#bdafa1]/10 border-r-4 border-[#0b5156]' : ''}`}
                >
                  <div className="truncate">
                    <p className="text-sm font-black text-slate-800 uppercase truncate">{s.nombre}</p>
                    <p className="text-xs font-black text-slate-500 mt-0.5 tracking-widest font-mono">{s.rif}</p>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); s.id && handleDelete(s.id); }}
                    className="p-1 hover:text-red-600 text-slate-400 transition-colors ml-2 shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button 
            onClick={handleNewSupplier}
            className="p-4 bg-[#726555] text-white text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#3c3023] transition-all"
          >
            <Plus size={14} /> Nuevo Registro
          </button>
        </section>

        <section className="lg:col-span-3 space-y-6">
          {globalSuccess && (
             <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
                <CheckCircle2 size={18} />
                <p className="text-sm font-black uppercase tracking-widest">{globalSuccess}</p>
             </div>
          )}
          {globalError && (
             <div className="bg-red-50 text-red-600 border border-red-200 p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
                <AlertTriangle size={18} />
                <p className="text-sm font-black uppercase tracking-widest">{globalError}</p>
             </div>
          )}

          <article className="bg-white p-10 rounded-3xl shadow-sm space-y-10 border border-slate-200">
             <div className="space-y-2">
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight font-mono text-[#0b5156]">Parámetros Comerciales</h2>
                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">
                   Configuración obligatoria para retenciones IVA/ISLR según normativa vigente.
                </p>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
                <div className="space-y-3">
                   <label className="text-sm font-black text-slate-500 uppercase tracking-widest block">RIF (Jurídico/Natural)</label>
                    <input 
                      type="text" 
                      value={rif}
                      onChange={(e) => setRif(e.target.value)}
                      onBlur={handleRifBlur}
                      placeholder="Ej. J-12345678-9"
                      className="w-full bg-slate-50 border border-slate-200 px-5 py-4 rounded-2xl text-slate-800 font-black text-sm font-mono focus:outline-none focus:border-[#0b5156] transition-all"
                    />
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

                <div className="space-y-3">
                   <label className="text-sm font-black text-slate-500 uppercase tracking-widest block">Nombre o Razón Social</label>
                   <input 
                     type="text" 
                     value={nombre}
                     onChange={(e) => setNombre(e.target.value)}
                     placeholder="Ej. SUMINISTROS INDUSTRIALES, C.A."
                     className="w-full bg-slate-50 border border-slate-200 px-5 py-4 rounded-2xl text-slate-800 font-black text-sm focus:outline-none focus:border-[#0b5156] transition-all"
                   />
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
                <div className="space-y-3">
                   <label className="text-sm font-black text-slate-500 uppercase tracking-widest block">Teléfono de Contacto</label>
                   <input 
                     type="text" 
                     value={telefono}
                     onChange={(e) => setTelefono(e.target.value)}
                     placeholder="Ej. +58 212 555-0192"
                     className="w-full bg-slate-50 border border-slate-200 px-5 py-4 rounded-2xl text-slate-800 font-black text-sm focus:outline-none focus:border-[#0b5156] transition-all"
                   />
                </div>

                <div className="space-y-3">
                   <label className="text-sm font-black text-slate-500 uppercase tracking-widest block">Correo Electrónico</label>
                   <input 
                     type="email" 
                     value={email}
                     onChange={(e) => setEmail(e.target.value)}
                     placeholder="Ej. compras@proveedor.com"
                     className="w-full bg-slate-50 border border-[#bdafa1]/20 px-5 py-4 rounded-2xl text-slate-800 font-black text-sm focus:outline-none focus:border-[#0b5156] transition-all"
                   />
                </div>
             </div>

             <div className="grid grid-cols-1 gap-10">
                <div className="space-y-3">
                   <label className="text-sm font-black text-slate-500 uppercase tracking-widest block">Dirección Fiscal para Comprobantes</label>
                   <textarea 
                     rows={3}
                     value={direccion}
                     onChange={(e) => setDireccion(e.target.value)}
                     placeholder="Ej. Zona Industrial Municipal Norte, Galpón 44, Valencia, Edo. Carabobo."
                     className="w-full bg-slate-50 border border-slate-200 px-5 py-4 rounded-2xl text-slate-800 font-bold text-xs uppercase focus:outline-none focus:border-[#0b5156] transition-all resize-none leading-relaxed"
                   />
                </div>
             </div>
          </article>
        </section>
      </div>
    </div>
  );
};

export default Suppliers;
