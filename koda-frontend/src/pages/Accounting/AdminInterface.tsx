import { 
  ArrowLeft,
  RefreshCw,
  Save,
  Workflow,
  ArrowRight,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/providers/AuthProvider';

interface MatrizLinea {
  evento: string;
  modulo: string;
  titulo: string;
  desc: string;
  readonly_debe: boolean;
  readonly_haber: boolean;
  cuenta_debe_codigo: string | null;
  cuenta_haber_codigo: string | null;
  ultima_modificacion: string | null;
}

interface Cuenta {
  id: number;
  codigo: string;
  nombre: string;
  tipo: string;
}

const MODULO_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  VENTAS:   { bg: 'bg-blue-50 hover:border-blue-200',   text: 'text-blue-600',   bar: 'bg-blue-500' },
  COMPRAS:  { bg: 'bg-amber-50 hover:border-amber-200', text: 'text-amber-600',  bar: 'bg-amber-500' },
  RRHH:     { bg: 'bg-purple-50 hover:border-purple-200', text: 'text-purple-600', bar: 'bg-purple-500' },
  COBROS:   { bg: 'bg-green-50 hover:border-green-200', text: 'text-green-600',  bar: 'bg-green-500' },
};

const AdminInterface = () => {
  const { userName } = useAuth();
  const [lineas, setLineas] = useState<MatrizLinea[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [toast, setToast] = useState<{msg: string; type: 'success' | 'error'} | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const res = await api.get<{ lineas: MatrizLinea[]; cuentas: Cuenta[] }>('/contabilidad/matriz-integracion');
      setLineas(res.lineas);
      setCuentas(res.cuentas);
    } catch (e) {
      showToast('Error al cargar la matriz de integración', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCuentaChange = (evento: string, field: 'cuenta_debe_codigo' | 'cuenta_haber_codigo', value: string) => {
    setLineas(prev => prev.map(l => l.evento === evento ? { ...l, [field]: value || null } : l));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.post('/contabilidad/matriz-integracion', {
        lineas: lineas.map(l => ({
          evento: l.evento,
          cuenta_debe_codigo: l.cuenta_debe_codigo || null,
          cuenta_haber_codigo: l.cuenta_haber_codigo || null,
        })),
        usuario: userName || 'Sistema',
      });
      showToast('Matriz guardada exitosamente');
      setHasChanges(false);
      fetchData();
    } catch (e) {
      showToast('Error al guardar la matriz', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSincronizar = async () => {
    setIsSyncing(true);
    try {
      await api.post('/contabilidad/matriz-integracion/sincronizar', {});
      showToast('Sincronización completada');
      fetchData();
    } catch (e) {
      showToast('Error al sincronizar', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Group lineas by modulo
  const modulosOrden = ['VENTAS', 'COMPRAS', 'RRHH', 'COBROS'];
  const byModulo = modulosOrden.reduce((acc, mod) => {
    acc[mod] = lineas.filter(l => l.modulo === mod);
    return acc;
  }, {} as Record<string, MatrizLinea[]>);

  const totalConfiguradas = lineas.filter(l => l.cuenta_debe_codigo || l.cuenta_haber_codigo).length;
  const totalLineas = lineas.length;

  return (
    <div className="space-y-1.5 animate-in fade-in duration-500 pb-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[300] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl text-sm font-black uppercase tracking-tight animate-in slide-in-from-top-4 duration-300 ${toast.type === 'success' ? 'bg-[#0b5156] text-white' : 'bg-red-500 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <Link to="/contabilidad" className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-[#0b5156]/20 transition-all">
                <ArrowLeft size={10} /> Volver
              </Link>
              <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Contabilidad &gt; Configuración
              </span>
              {hasChanges && (
                <span className="bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest animate-pulse">
                  Cambios sin guardar
                </span>
              )}
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Interfaz Administrativa-Contable</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Definición de reglas de integración para la generación automática de asientos contables.</p>
          </div>
          <div className="flex gap-2">
             <button
               onClick={handleSincronizar}
               disabled={isSyncing || isLoading}
               className="bg-white text-slate-500 px-6 py-2 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2 disabled:opacity-50"
             >
               {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
               Sincronizar
             </button>
             <button
               onClick={handleSave}
               disabled={isSaving || isLoading || !hasChanges}
               className="bg-[#0b5156] text-white px-8 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
             >
               {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
               Guardar Matriz
             </button>
          </div>
        </div>
      </header>

      {/* Stats bar */}
      {!isLoading && (
        <div className="grid grid-cols-3 gap-1.5">
          <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3">
            <div className="bg-[#0b5156]/10 p-2 rounded-lg"><Workflow size={16} className="text-[#0b5156]" /></div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Eventos Totales</p>
              <strong className="text-lg font-black text-slate-800">{totalLineas}</strong>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3">
            <div className="bg-green-100 p-2 rounded-lg"><CheckCircle2 size={16} className="text-green-600" /></div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Configurados</p>
              <strong className="text-lg font-black text-green-600">{totalConfiguradas}</strong>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3">
            <div className="bg-amber-100 p-2 rounded-lg"><AlertTriangle size={16} className="text-amber-500" /></div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sin Configurar</p>
              <strong className="text-lg font-black text-amber-500">{totalLineas - totalConfiguradas}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Main Matrix Card */}
      <article className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm overflow-hidden">
         <div className="mb-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
               <div className="bg-[#0b5156]/5 p-2 rounded-xl border border-[#0b5156]/10 text-[#0b5156]">
                  <Workflow size={18} />
               </div>
               <div className="space-y-0.5">
                  <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Matriz de Contabilización</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Configuración de destinos por evento administrativo.</p>
               </div>
            </div>
            <Link to="/contabilidad/auditoria-diario" className="text-[10px] font-black text-[#0b5156] uppercase flex items-center gap-1 hover:underline">
               Ver Log de Integración <ArrowRight size={12} />
            </Link>
         </div>

         {isLoading ? (
           <div className="flex flex-col items-center justify-center py-16 gap-3">
             <Loader2 size={32} className="animate-spin text-[#0b5156]" />
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cargando catálogo de cuentas...</p>
           </div>
         ) : cuentas.length === 0 ? (
           <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
             <AlertTriangle size={32} className="text-amber-400" />
             <p className="text-sm font-black text-slate-500 uppercase">No hay cuentas contables registradas</p>
             <p className="text-xs text-slate-400">Primero debe crear el Catálogo de Cuentas en el módulo de Contabilidad.</p>
           </div>
         ) : (
           <div className="space-y-5">
             {modulosOrden.map(modulo => {
               const modLineas = byModulo[modulo] || [];
               if (!modLineas.length) return null;
               const colors = MODULO_COLORS[modulo] || { bg: 'bg-slate-50 hover:border-slate-200', text: 'text-slate-600', bar: 'bg-slate-400' };
               return (
                 <section key={modulo} className="space-y-2">
                   <div className="flex items-center gap-2">
                     <div className={`h-[2px] w-8 ${colors.bar}`} />
                     <h3 className={`text-[10px] font-black uppercase tracking-widest ${colors.text}`}>Módulo de {modulo}</h3>
                   </div>
                   <div className="grid grid-cols-1 gap-2">
                     {modLineas.map(linea => (
                       <div key={linea.evento} className={`grid grid-cols-1 md:grid-cols-3 gap-4 items-start p-3 bg-slate-50 rounded-xl border border-slate-100 ${colors.bg} transition-all group`}>
                         <div className="space-y-0.5">
                           <strong className="text-xs font-black text-slate-700 uppercase block">{linea.titulo}</strong>
                           <p className="text-[9px] font-bold text-slate-400 uppercase italic leading-none">{linea.desc}</p>
                           {linea.ultima_modificacion && (
                             <div className="flex items-center gap-1 mt-1">
                               <Clock size={9} className="text-slate-300" />
                               <span className="text-[8px] text-slate-400 font-bold">{linea.ultima_modificacion}</span>
                             </div>
                           )}
                         </div>
                         <div className={`space-y-1 ${linea.readonly_debe ? 'opacity-35 pointer-events-none' : ''}`}>
                           <label className="text-[8px] font-black text-blue-600 uppercase tracking-widest block">Cuenta Deudora (DEBE)</label>
                           <select
                             className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-black text-slate-700 outline-none focus:border-blue-500 appearance-none font-mono"
                             value={linea.cuenta_debe_codigo || ''}
                             onChange={e => handleCuentaChange(linea.evento, 'cuenta_debe_codigo', e.target.value)}
                             disabled={linea.readonly_debe}
                           >
                             <option value="">— Sin asignar —</option>
                             {cuentas.map(c => (
                               <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nombre}</option>
                             ))}
                           </select>
                         </div>
                         <div className={`space-y-1 ${linea.readonly_haber ? 'opacity-35 pointer-events-none' : ''}`}>
                           <label className="text-[8px] font-black text-indigo-600 uppercase tracking-widest block">Cuenta Acreedora (HABER)</label>
                           <select
                             className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-black text-slate-700 outline-none focus:border-indigo-500 appearance-none font-mono"
                             value={linea.cuenta_haber_codigo || ''}
                             onChange={e => handleCuentaChange(linea.evento, 'cuenta_haber_codigo', e.target.value)}
                             disabled={linea.readonly_haber}
                           >
                             <option value="">— Sin asignar —</option>
                             {cuentas.map(c => (
                               <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nombre}</option>
                             ))}
                           </select>
                         </div>
                       </div>
                     ))}
                   </div>
                 </section>
               );
             })}
           </div>
         )}

         {/* Logic Alert */}
         <div className="mt-4 p-4 bg-[#0b5156] rounded-xl text-white shadow-lg relative overflow-hidden group">
            <div className="relative z-10 flex gap-4">
               <div className="bg-white/10 p-2.5 rounded-xl border border-white/20 h-fit">
                  <Cpu size={24} className="text-white/60" />
               </div>
               <div className="space-y-1.5">
                  <h4 className="text-xs font-black text-white uppercase tracking-tighter">Motor de Integración KODA</h4>
                  <p className="text-[10px] font-bold text-white/60 uppercase leading-relaxed max-w-4xl">
                     Cada vez que un usuario administrativo confirme una factura o pago, el sistema insertará un asiento en el <strong>Libro Diario</strong> con estatus <span className="bg-amber-500 text-white px-2 py-0.5 rounded text-[8px] font-black">PENDIENTE DE POSTEO</span>. El contador solo deberá revisar y mayorizar para afectar el saldo real.
                  </p>
               </div>
            </div>
            <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-white/5 rounded-full blur-[100px] group-hover:scale-110 transition-transform duration-1000" />
         </div>
      </article>

      {/* Audit Log Card */}
      <Link to="/contabilidad/auditoria-diario" className="p-3.5 bg-white rounded-xl border border-slate-200 flex items-center justify-between group cursor-pointer hover:bg-slate-50 transition-all">
        <div className="flex items-center gap-3">
          <div className="bg-slate-100 p-2 rounded-lg text-slate-500">
            <Clock size={14} />
          </div>
          <div>
            <p className="text-xs font-black text-slate-600 uppercase tracking-tight">Log de Cambios en Interfaz</p>
            <p className="text-[9px] font-bold text-slate-400 uppercase">Ver historial de modificaciones</p>
          </div>
        </div>
        <ArrowRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
      </Link>
    </div>
  );
};

export default AdminInterface;
