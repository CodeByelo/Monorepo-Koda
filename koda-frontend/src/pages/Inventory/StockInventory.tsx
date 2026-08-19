import { 
  Search, 
  Filter, 
  Activity,
  ShieldCheck,
  Snowflake,
  Plus,
  FileText,
  BookOpen,
  ArrowRight,
  X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '../../api/client';

const Toast = ({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);
  
  return (
    <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-5 py-3.5 rounded-2xl border text-xs font-black uppercase tracking-wider shadow-xl animate-in slide-in-from-bottom-5 duration-300 ${
      type === 'success' ? 'bg-emerald-50 border-emerald-250 text-emerald-950' : 'bg-red-50 border-red-250 text-red-950'
    }`}>
      {message}
    </div>
  );
};

const StockInventory = () => {
  const navigate = useNavigate();
  const [snapshotsRaw, setSnapshotsRaw] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [cantidadFisicaInput, setCantidadFisicaInput] = useState<string>('0');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [conteosRes, warehousesRes, productsRes] = await Promise.all([
        api.get<any[]>('/inventario/conteos'),
        api.get<any[]>('/inventario/almacenes'),
        api.get<any[]>('/productos')
      ]);
      setSnapshotsRaw(conteosRes || []);
      setWarehouses(warehousesRes || []);
      setProducts(productsRes || []);
    } catch (err) {
      console.error("Error fetching physical count data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !selectedWarehouseId || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const payload = {
        almacen_id: Number(selectedWarehouseId),
        producto_id: Number(selectedProductId),
        cantidad_fisica: parseFloat(cantidadFisicaInput) || 0
      };
      await api.post('/inventario/conteos', payload);
      setToast({ message: 'Snapshot de auditoría iniciado correctamente', type: 'success' });
      setShowCreateModal(false);
      setSelectedProductId('');
      setSelectedWarehouseId('');
      setCantidadFisicaInput('0');
      fetchData();
    } catch (err: any) {
      setToast({ message: err.message || 'Error al iniciar el conteo', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConcileConteo = async (conteoId: number) => {
    if (!window.confirm("¿Está seguro de conciliar este conteo físico? El stock del sistema se actualizará a la cantidad física contada.")) return;
    try {
      await api.post(`/inventario/conteos/${conteoId}/cerrar`);
      setToast({ message: 'Conteo conciliado y stock real actualizado', type: 'success' });
      fetchData();
    } catch (err: any) {
      setToast({ message: err.message || 'Error al conciliar el conteo', type: 'error' });
    }
  };

  const stats = [
    { label: 'EXISTENCIA CONGELADA', value: `${snapshotsRaw.reduce((acc, s) => acc + (s.cantidad_sistema || 0), 0)} uds.`, desc: 'Base de comparación', color: 'text-slate-800' },
    { label: 'MOVIMIENTOS AISLADOS', value: '0 uds.', desc: 'Ventas/Compras durante conteo', color: 'text-blue-600' },
    { label: 'DIFERENCIAS REALES', value: `${snapshotsRaw.reduce((acc, s) => acc + (s.diferencia || 0), 0)} uds.`, desc: 'Contra Snapshot original', color: 'text-red-600' },
    { label: 'VALOR AUDITADO', value: `$${snapshotsRaw.reduce((acc, s) => acc + ((s.cantidad_fisica || 0) * (s.producto?.costo_usd || 10)), 0).toLocaleString()}`, desc: 'Valor base del Snapshot', color: 'text-[#0b5156]' },
  ];

  const snapshots = snapshotsRaw.map(s => {
    const isNegative = s.diferencia < 0;
    const isZero = s.diferencia === 0;
    return {
      realId: s.id,
      id: s.numero || `SNP-2026-${String(s.id).padStart(3, '0')}`,
      date: new Date(s.fecha).toLocaleDateString(),
      warehouse: s.almacen || 'Almacén Principal',
      responsible: s.responsable || 'Admin',
      status: s.estado || 'PENDIENTE',
      diff: `${s.diferencia > 0 ? '+' : ''}${s.diferencia || 0} uds`,
      color: isZero ? 'text-green-500' : (isNegative ? 'text-red-500' : 'text-amber-500')
    };
  });

  const hasActiveAuditoria = snapshotsRaw.some(s => s.estado === 'PENDIENTE');

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header Compacto - Estandarizado */}
      <header className="bg-white p-8 rounded-3xl border border-[#bdafa1]/20 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
           <Snowflake size={120} className="text-[#0b5156]" />
        </div>
        <div className="flex justify-between items-start mb-6 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Inventario
              </span>
            </div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Inventario Físico</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-3xl leading-relaxed">
              Controla conteos físicos por almacén, diferencias contra sistema, responsables, ajustes y cierre operativo de inventario.
            </p>
          </div>
          <div className="flex gap-3">
             <button 
               onClick={() => setShowManualModal(true)}
               className="bg-white text-slate-500 px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 border border-slate-200 hover:bg-slate-50 transition-all tracking-widest shadow-sm"
             >
                <BookOpen size={14} /> Manual
             </button>
             <button 
               onClick={() => navigate('/inventario/ajustes')}
               className="bg-white text-slate-500 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-slate-50 transition-all tracking-widest shadow-sm"
             >
                Ajustes
             </button>
          </div>
        </div>
      </header>

      {/* Bloque de Auditoría en Curso (Snapshot) */}
      {hasActiveAuditoria ? (
        <article className="bg-[#0b5156]/5 p-8 rounded-3xl border border-[#0b5156]/20 shadow-sm relative overflow-hidden group">
           <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-4">
                 <div className="p-4 bg-white rounded-2xl border border-slate-200 flex items-center justify-center shrink-0 shadow-sm">
                    <Snowflake size={24} className="text-[#0b5156] animate-spin-slow text-blue-500" />
                 </div>
                 <div className="space-y-1">
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                       Auditoría en Curso: Stock Congelado
                    </h3>
                    <p className="text-sm font-bold text-slate-500 uppercase leading-relaxed max-w-xl">
                       El sistema ha tomado una "foto" del inventario teórico (Snapshot). Las ventas y recepciones actuales no afectarán la conciliación.
                    </p>
                 </div>
              </div>
              <button 
                onClick={() => setShowCreateModal(true)}
                className="bg-[#0b5156] text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-[#0b5156]/20 hover:scale-105 transition-all flex items-center gap-2 hover:bg-[#083a3d]"
              >
                 <Plus size={16} strokeWidth={3} /> Abrir Nuevo Snapshot
              </button>
           </div>
        </article>
      ) : (
        <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group">
           <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-4">
                 <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-center shrink-0">
                    <ShieldCheck size={24} className="text-[#0b5156]" />
                 </div>
                 <div className="space-y-1">
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Red Operativa Alineada</h3>
                    <p className="text-sm font-bold text-slate-500 uppercase leading-relaxed max-w-xl">
                       No hay tomas físicas activas en este momento. El inventario teórico está conciliado con el físico real.
                    </p>
                 </div>
              </div>
              <button 
                onClick={() => setShowCreateModal(true)}
                className="bg-[#0b5156] text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-[#0b5156]/20 hover:scale-105 transition-all flex items-center gap-2 hover:bg-[#083a3d]"
              >
                 <Plus size={16} strokeWidth={3} /> Abrir Nuevo Snapshot
              </button>
           </div>
        </article>
      )}

      {/* Grid de KPIs - Estandarizado */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-36 group hover:border-[#0b5156]/30 transition-all">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest group-hover:text-[#0b5156] transition-colors">{stat.label}</p>
            <div className="space-y-1">
              <strong className={`text-3xl font-black ${stat.color} tracking-tighter font-mono`}>{stat.value}</strong>
              <p className="text-sm font-bold text-slate-400 uppercase leading-tight">{stat.desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Listado de Auditorías */}
      <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
         <div className="flex justify-between items-center">
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Snapshots y Auditorías Recientes</h3>
            <div className="flex gap-3">
               <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input 
                    type="text" 
                    placeholder="Buscar snapshot..." 
                    className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156] w-64"
                  />
               </div>
            </div>
         </div>

         <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left">
               <thead>
                  <tr className="text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                     <th className="py-4 px-6">Identificador / Fecha</th>
                     <th className="py-4 px-4">Almacén</th>
                     <th className="py-4 px-4 text-center">Responsable</th>
                     <th className="py-4 px-4 text-center text-red-600">Diferencia</th>
                     <th className="py-4 px-4 text-center">Estado</th>
                     <th className="py-4 px-6 text-right">Acción</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Cargando auditorías...
                      </td>
                    </tr>
                  ) : snapshots.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        No hay auditorías recientes.
                      </td>
                    </tr>
                  ) : snapshots.map((s, i) => (
                    <tr key={i} className="group hover:bg-slate-50 transition-colors">
                       <td className="py-5 px-6">
                          <div className="flex flex-col">
                             <span className="text-xs font-black text-slate-800 uppercase">{s.id}</span>
                             <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{s.date}</span>
                          </div>
                       </td>
                       <td className="py-5 px-4 text-xs font-bold text-slate-500 uppercase">{s.warehouse}</td>
                       <td className="py-5 px-4 text-center text-xs font-bold text-slate-400 uppercase">{s.responsible}</td>
                       <td className="py-5 px-4 text-center font-black text-red-600 font-mono">{s.diff}</td>
                       <td className="py-5 px-4 text-center">
                          <span className={`text-[8px] font-black border px-2 py-0.5 rounded uppercase tracking-tighter ${
                            s.status === 'CERRADO' ? 'border-green-300 text-green-600 bg-green-50/50' : 'border-amber-300 text-amber-600 bg-amber-50/50'
                          }`}>{s.status === 'CERRADO' ? 'Conciliado' : 'En Proceso'}</span>
                       </td>
                       <td className="py-5 px-6 text-right">
                          {s.status === 'PENDIENTE' ? (
                            <button 
                              onClick={() => handleConcileConteo(s.realId)}
                              className="bg-[#0b5156] text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-md hover:bg-[#083a3d] hover:scale-105 transition-all"
                            >
                               Conciliar
                            </button>
                          ) : (
                            <button className="bg-slate-50 text-slate-400 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border border-slate-100 cursor-not-allowed">
                               Cerrado
                            </button>
                          )}
                       </td>
                    </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </article>
      {/* Modal Manual de Toma Física */}
      {showManualModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex justify-center items-start overflow-y-auto p-4 pt-10 md:pt-20 animate-in fade-in duration-300">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full p-8 md:p-10 shadow-2xl space-y-6 animate-in zoom-in-95 duration-300 mb-20">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Manual de Toma Física y Conciliación</h2>
                <p className="text-[10px] font-black text-[#0b5156] uppercase tracking-widest font-mono">Guía de procedimientos y auditoría física</p>
              </div>
              <button 
                onClick={() => setShowManualModal(false)} 
                className="text-slate-400 hover:text-slate-600 font-bold text-xs uppercase bg-slate-100 px-3 py-1.5 rounded-xl transition-all"
              >
                Cerrar
              </button>
            </div>

            <div className="space-y-6 text-slate-600 text-sm leading-relaxed font-semibold">
              <section className="space-y-2">
                <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">¿Qué es el módulo de Toma Física?</h3>
                <p>
                  Es la herramienta que permite auditar físicamente las existencias de productos en cada sede y compararlas contra los valores teóricos registrados en el sistema para detectar y resolver descuadres.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-1">
                  <Activity size={14} className="text-blue-500" /> Protocolo de Conciliación Reubicado:
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  <div className="p-4 bg-blue-50/50 border border-blue-150 rounded-xl space-y-1.5">
                    <span className="bg-blue-500 text-white text-[8px] font-black px-2 py-0.5 rounded uppercase">CONCILIAR</span>
                    <h5 className="text-[10px] font-black text-slate-800 uppercase">Diferencias de Conteo</h5>
                    <p className="text-[10px] font-bold text-slate-500 leading-normal">Registra la realidad física y contrasta las mermas o excedentes.</p>
                  </div>
                  <div className="p-4 bg-amber-50/50 border border-amber-150 rounded-xl space-y-1.5">
                    <span className="bg-amber-500 text-white text-[8px] font-black px-2 py-0.5 rounded uppercase">AUDITAR</span>
                    <h5 className="text-[10px] font-black text-slate-800 uppercase">Movimientos Aislados</h5>
                    <p className="text-[10px] font-bold text-slate-500 leading-normal">Monitorea y aisla facturas y recepciones emitidas durante el conteo.</p>
                  </div>
                  <div className="p-4 bg-green-50/50 border border-emerald-150 rounded-xl space-y-1.5">
                    <span className="bg-[#0b5156] text-white text-[8px] font-black px-2 py-0.5 rounded uppercase">CERRAR</span>
                    <h5 className="text-[10px] font-black text-slate-800 uppercase">Actualizar Existencia</h5>
                    <p className="text-[10px] font-bold text-slate-500 leading-normal">Cierra la auditoría actualizando el stock teórico e impactando Kardex.</p>
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">Flujo Operativo de Auditoría:</h3>
                <ol className="list-decimal pl-5 space-y-2">
                  <li>
                    <strong>Congelar Stock (Snapshot):</strong> El auditor presiona <code>+ Abrir Nuevo Snapshot</code>, elige la sede y el producto. Esto congela la "foto teórica" del sistema.
                  </li>
                  <li>
                    <strong>Conteo Físico:</strong> El personal cuenta los artículos físicamente en los estantes.
                  </li>
                  <li>
                    <strong>Cerrar y Conciliar:</strong> El supervisor presiona <code>Conciliar</code> en la fila correspondiente. El sistema sobrescribe el stock teórico y registra el movimiento de ajuste en el Kardex.
                  </li>
                </ol>
              </section>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setShowManualModal(false)} 
                className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-md hover:scale-105 transition-all"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Abrir Nuevo Snapshot */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex justify-center items-start overflow-y-auto p-4 pt-10 md:pt-20 animate-in fade-in duration-300">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full p-8 md:p-10 shadow-2xl space-y-6 animate-in zoom-in-95 duration-300 mb-20">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Iniciar Nuevo Snapshot</h2>
                <p className="text-[10px] font-black text-[#0b5156] uppercase tracking-widest font-mono">Toma física de inventario congelado</p>
              </div>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs uppercase bg-slate-100 px-3 py-1.5 rounded-xl transition-all"
              >
                Cerrar
              </button>
            </div>

            <form onSubmit={handleCreateSnapshot} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sede / Almacén</label>
                <select
                  required
                  value={selectedWarehouseId}
                  onChange={(e) => setSelectedWarehouseId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-sm font-bold text-slate-700 focus:outline-none focus:border-[#0b5156]/50"
                >
                  <option value="">Selecciona almacén...</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name || w.nombre}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Producto a Auditar</label>
                <select
                  required
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-sm font-bold text-slate-700 focus:outline-none focus:border-[#0b5156]/50 uppercase"
                >
                  <option value="">Selecciona producto...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} (SKU: {p.sku} | Stock actual: {p.stock})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cantidad Física Contada</label>
                <input
                  required
                  type="number"
                  min="0"
                  step="any"
                  value={cantidadFisicaInput}
                  onChange={(e) => setCantidadFisicaInput(e.target.value)}
                  placeholder="Ej: 45"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-sm font-bold text-slate-700 focus:outline-none focus:border-[#0b5156]/50"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#0b5156] text-white py-4 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all disabled:opacity-70 mt-2"
              >
                {isSubmitting ? 'Iniciando Conteo...' : 'Iniciar Snapshot'}
              </button>
            </form>
          </div>
        </div>
      )}

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

export default StockInventory;
