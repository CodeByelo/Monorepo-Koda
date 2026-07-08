import { 
  Truck, 
  Search, 
  Plus, 
  Filter, 
  CheckCircle2, 
  ArrowRight, 
  PackageCheck,
  BookOpen,
  X,
  ShieldAlert,
  ArrowRightLeft
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { Toast } from '@/components/common/Toast';

const InventoryTransfer = () => {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Filter & Search states
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'COMPLETED' | 'ERROR'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showControlModal, setShowControlModal] = useState(false);
  const [activeControlTab, setActiveControlTab] = useState<'CONFIRMAR' | 'AUDITAR' | 'CERRAR' | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedOriginId, setSelectedOriginId] = useState<string>('');
  const [selectedDestId, setSelectedDestId] = useState<string>('');
  const [transferQty, setTransferQty] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [transfersRes, productsRes, warehousesRes] = await Promise.all([
        api.get<any[]>('/inventario/transferencias'),
        api.get<any[]>('/productos'),
        api.get<any[]>('/inventario/almacenes')
      ]);
      setTransfers(transfersRes || []);
      setProducts(productsRes || []);
      setWarehouses(warehousesRes || []);
    } catch (error) {
      console.error("Error fetching transfer module data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const total = transfers.length;
  const transit = transfers.filter(t => t.estado === 'PENDIENTE' || t.estado === 'En Tránsito').length;
  const completed = transfers.filter(t => t.estado === 'COMPLETADA' || t.estado === 'RECIBIDA').length;
  const issues = transfers.filter(t => t.estado === 'RECHAZADA' || t.estado === 'ERROR').length;

  const stats = [
    { label: 'Total Traslados', value: String(total), desc: 'Registrados en red', color: 'text-slate-800' },
    { label: 'En Tránsito', value: String(transit), desc: 'Pendientes por recibir', color: 'text-amber-500' },
    { label: 'Completados', value: String(completed), desc: 'Cerrados correctamente', color: 'text-[#0b5156]' },
    { label: 'Diferencias', value: String(issues), desc: 'Casos con descuadre', color: 'text-red-600' },
  ];

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !selectedOriginId || !selectedDestId || transferQty <= 0) {
      showToast('Por favor completa todos los campos requeridos.', 'error');
      return;
    }
    if (selectedOriginId === selectedDestId) {
      showToast('El almacén de origen y destino no pueden ser el mismo.', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post('/inventario/transferencias', {
        producto_id: Number(selectedProductId),
        origen_almacen_id: Number(selectedOriginId),
        destino_almacen_id: Number(selectedDestId),
        cantidad: Number(transferQty)
      });
      showToast('Traslado iniciado con éxito en estado En Tránsito.', 'success');
      setShowCreateModal(false);
      setSelectedProductId('');
      setSelectedOriginId('');
      setSelectedDestId('');
      setTransferQty(1);
      fetchData();
    } catch (err: any) {
      console.error(err);
      const detail = err?.message || 'Error al iniciar la transferencia de inventario.';
      showToast(detail, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmReception = async (transferId: number) => {
    try {
      await api.put(`/inventario/transferencias/${transferId}/recibir`);
      showToast('Traslado recibido e ingresado al stock del destino.', 'success');
      fetchData();
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Error al recibir el traslado.', 'error');
    }
  };

  const displayTransfers = transfers
    .map(t => ({
      realId: t.id,
      id: t.id ? `TRI-${String(t.id).padStart(6, '0')}` : 'TRI-XXXXXX',
      date: t.fecha ? new Date(t.fecha).toLocaleDateString() : '—',
      origin: t.origen || 'Almacén Principal',
      dest: t.destino || 'Sucursal Centro',
      product: t.producto || 'Producto',
      qty: t.cantidad || 0,
      status: t.estado || 'En Tránsito',
      icon: t.estado === 'RECIBIDA' || t.estado === 'COMPLETADA' ? CheckCircle2 : Truck,
      color: t.estado === 'RECIBIDA' || t.estado === 'COMPLETADA' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700',
      border: t.estado === 'RECIBIDA' || t.estado === 'COMPLETADA' ? 'border-green-500' : 'border-amber-500'
    }))
    .filter(t => {
      if (filterStatus === 'PENDING') {
        if (t.status !== 'PENDIENTE' && t.status !== 'En Tránsito') return false;
      } else if (filterStatus === 'COMPLETED') {
        if (t.status !== 'COMPLETADA' && t.status !== 'RECIBIDA') return false;
      } else if (filterStatus === 'ERROR') {
        if (t.status !== 'RECHAZADA' && t.status !== 'ERROR') return false;
      }
      
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        return (
          t.id.toLowerCase().includes(query) ||
          t.origin.toLowerCase().includes(query) ||
          t.dest.toLowerCase().includes(query) ||
          t.product.toLowerCase().includes(query)
        );
      }
      return true;
    });

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header Compacto - Estandarizado */}
      <header className="bg-white p-8 rounded-3xl border border-[#bdafa1]/20 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
           <Truck size={120} className="text-[#0b5156]" />
        </div>
        <div className="flex justify-between items-start mb-6 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Movimientos
              </span>
            </div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Transferencias</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-3xl leading-relaxed">
              Control de traslados entre almacenes. Validación de salida, tránsito, recepción física y auditoría de diferencias.
            </p>
          </div>
          <div className="flex gap-3">
             <button 
               onClick={() => setShowManual(true)}
               className="bg-white text-slate-500 px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 border border-slate-200 hover:bg-slate-50 transition-all tracking-widest shadow-sm"
             >
                <BookOpen size={14} /> Manual
             </button>
             <button 
               onClick={() => setShowControlModal(true)}
               className="bg-[#0b5156]/10 text-[#0b5156] px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 hover:bg-[#0b5156]/20 transition-all tracking-widest border border-[#0b5156]/20"
             >
                <ShieldAlert size={14} /> Control Logístico
             </button>
             <button 
               onClick={() => setShowCreateModal(true)}
               className="bg-[#0b5156] text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-[#0b5156]/20 hover:scale-105 transition-all tracking-widest"
             >
                <Plus size={16} /> Nuevo Traslado
             </button>
          </div>
        </div>
      </header>

      {/* Panel de Operaciones / KPIs Horizontales */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
         {[
           { id: 'ALL', label: 'Todos los Traslados', val: total, desc: 'Historial completo de la red', color: 'border-slate-200 bg-slate-50/50 hover:bg-slate-50 text-slate-700', activeColor: 'ring-2 ring-[#0b5156]/20 border-[#0b5156] bg-[#0b5156]/5 text-[#0b5156]' },
           { id: 'PENDING', label: 'En Tránsito / Pendientes', val: transit, desc: 'Requieren validación en destino', color: 'border-amber-100 bg-amber-50/20 hover:bg-amber-50/55 text-amber-800', activeColor: 'ring-2 ring-amber-400/20 border-amber-500 bg-amber-50 text-amber-900' },
           { id: 'COMPLETED', label: 'Completados / Recibidos', val: completed, desc: 'Stock conciliado correctamente', color: 'border-emerald-100 bg-emerald-50/20 hover:bg-emerald-50/55 text-emerald-800', activeColor: 'ring-2 ring-emerald-400/20 border-emerald-500 bg-emerald-50 text-emerald-900' },
           { id: 'ERROR', label: 'Con Discrepancias / Rechazo', val: issues, desc: 'Casos con descuadres o errores', color: 'border-red-100 bg-red-50/20 hover:bg-red-50/55 text-red-800', activeColor: 'ring-2 ring-red-400/20 border-red-500 bg-red-50 text-red-900' }
         ].map((tab) => {
           const isActive = filterStatus === tab.id;
           return (
             <div 
               key={tab.id}
               onClick={() => setFilterStatus(tab.id as any)}
               className={`p-6 rounded-2xl border transition-all cursor-pointer flex justify-between items-center select-none h-28 hover:shadow-md ${isActive ? tab.activeColor : tab.color}`}
             >
               <div className="space-y-1">
                 <span className="text-[10px] font-black uppercase tracking-wider">{tab.label}</span>
                 <p className="text-[9px] font-bold opacity-80 uppercase leading-tight pr-2">{tab.desc}</p>
               </div>
               <span className="text-3xl font-black font-mono tracking-tight">{tab.val}</span>
             </div>
           );
         })}
      </section>

      {/* Tabla de Traslados al 100% de Ancho */}
      <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
         <div className="flex justify-between items-center flex-wrap gap-4">
            <div className="space-y-1">
               <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Listado de Traslados</h3>
               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">
                 Filtrado: <span className="text-[#0b5156]">{filterStatus === 'ALL' ? 'Todos los registros' : filterStatus === 'PENDING' ? 'En Tránsito' : filterStatus === 'COMPLETED' ? 'Recibidos' : 'Con Discrepancias'}</span>
               </p>
            </div>
            <div className="flex gap-3">
               <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input 
                    type="text" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar TRI, almacén o producto..." 
                    className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156] w-64"
                  />
               </div>
            </div>
         </div>

         <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left">
               <thead>
                  <tr className="text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                     <th className="py-4 px-6">TRI / FECHA</th>
                     <th className="py-4 px-4 text-center">RUTA (ORIGEN-DEST)</th>
                     <th className="py-4 px-4">PRODUCTO</th>
                     <th className="py-4 px-4 text-center">CANT.</th>
                     <th className="py-4 px-4 text-center">ESTADO</th>
                     <th className="py-4 px-6 text-right">ACCIÓN</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Cargando transferencias...
                      </td>
                    </tr>
                  ) : displayTransfers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        No hay transferencias encontradas.
                      </td>
                    </tr>
                  ) : displayTransfers.map((t: any, i: number) => {
                    const IconComp = t.icon || Truck;
                    return (
                    <tr key={i} className={`group hover:bg-slate-50/80 transition-colors border-l-4 ${t.border || 'border-slate-300'}`}>
                       <td className="py-5 px-6">
                          <div className="flex flex-col">
                             <span className="text-xs font-black text-slate-800 uppercase">{t.id}</span>
                             <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{t.date}</span>
                          </div>
                       </td>
                       <td className="py-5 px-4">
                          <div className="flex items-center gap-2 justify-center">
                             <span className="text-[9px] font-black text-slate-500 uppercase">{t.origin}</span>
                             <ArrowRight size={10} className="text-slate-300 animate-pulse" />
                             <span className="text-[9px] font-black text-[#0b5156] uppercase">{t.dest}</span>
                          </div>
                       </td>
                       <td className="py-5 px-4 text-xs font-bold text-slate-600 uppercase leading-tight">{t.product}</td>
                       <td className="py-5 px-4 text-center font-black text-slate-800 font-mono">{t.qty}</td>
                       <td className="py-5 px-4 text-center">
                          <span className={`${t.color} text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter flex items-center gap-1 justify-center mx-auto w-fit`}>
                             <IconComp size={8} /> {t.status}
                          </span>
                       </td>
                       <td className="py-5 px-6 text-right">
                          {(t.status === 'En Tránsito' || t.status === 'PENDIENTE') ? (
                             <button 
                               onClick={() => handleConfirmReception(t.realId)}
                               className="bg-[#0b5156] text-white px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all hover:scale-105"
                             >
                                Confirmar Recepción
                             </button>
                          ) : (
                             <button className="bg-slate-50 text-slate-400 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border border-slate-100 cursor-not-allowed font-mono">
                                CERRADA
                             </button>
                          )}
                       </td>
                    </tr>
                    );
                  })}
               </tbody>
            </table>
         </div>
      </article>

      {/* Modal Resumen de Control Logístico */}
      {showControlModal && (() => {
        const modalFilteredTransfers = transfers.filter((t: any) => {
          if (activeControlTab === 'CONFIRMAR') {
            return t.estado === 'PENDIENTE' || t.estado === 'En Tránsito';
          }
          if (activeControlTab === 'AUDITAR') {
            return t.estado === 'RECHAZADA' || t.estado === 'ERROR';
          }
          if (activeControlTab === 'CERRAR') {
            return t.estado === 'COMPLETADA' || t.estado === 'RECIBIDA';
          }
          return false;
        }).map(t => ({
          realId: t.id,
          id: t.id ? `TRI-${String(t.id).padStart(6, '0')}` : 'TRI-XXXXXX',
          date: t.fecha ? new Date(t.fecha).toLocaleDateString() : '—',
          origin: t.origen || 'Almacén Principal',
          dest: t.destino || 'Sucursal Centro',
          product: t.producto || 'Producto',
          qty: t.cantidad || 0,
          status: t.estado || 'En Tránsito'
        }));

        return (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full p-8 shadow-2xl space-y-6 animate-in zoom-in-95 duration-300 max-h-[85vh] overflow-y-auto no-scrollbar">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Resumen de Control Logístico</h2>
                  <p className="text-[10px] font-black text-[#0b5156] uppercase tracking-widest font-mono">Métricas de control y prioridades de red</p>
                </div>
                <button 
                  onClick={() => {
                    setShowControlModal(false);
                    setActiveControlTab(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 font-bold text-xs uppercase bg-slate-100 px-3 py-1.5 rounded-xl transition-all"
                >
                  Cerrar
                </button>
              </div>
  
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start pt-2">
                 {[
                   { id: 'CONFIRMAR', label: 'CONFIRMAR', title: `${transit} En tránsito`, desc: 'Validar recepción física antes de liberar stock en destino.', color: 'border-blue-200 bg-blue-50/40 text-blue-900 hover:bg-blue-50', activeColor: 'ring-2 ring-blue-500 bg-blue-50 text-blue-900 border-blue-500', icon: <PackageCheck size={16} className="text-blue-600" /> },
                   { id: 'AUDITAR', label: 'AUDITAR', title: `${issues} Diferencias`, desc: 'Revisar responsables y cantidades físicas si hay rechazos.', color: 'border-red-200 bg-red-50/40 text-red-900 hover:bg-red-50', activeColor: 'ring-2 ring-red-500 bg-red-50 text-red-900 border-red-500', icon: <ShieldAlert size={16} className="text-red-600" /> },
                   { id: 'CERRAR', label: 'CERRAR', title: `${completed} Recibidos`, desc: 'Impactar Kardex y consolidar existencia final de la red.', color: 'border-emerald-200 bg-emerald-50/40 text-emerald-900 hover:bg-emerald-50', activeColor: 'ring-2 ring-emerald-500 bg-emerald-50 text-emerald-900 border-emerald-500', icon: <ArrowRightLeft size={16} className="text-emerald-600" /> }
                 ].map((item) => {
                   const isActive = activeControlTab === item.id;
                   return (
                     <div 
                       key={item.id} 
                       onClick={() => setActiveControlTab(activeControlTab === item.id ? null : item.id as any)}
                       className={`p-5 rounded-2xl border cursor-pointer hover:shadow-md transition-all space-y-2 select-none ${isActive ? item.activeColor : item.color}`}
                     >
                        <div className="flex items-center gap-2">
                          {item.icon}
                          <span className="text-[10px] font-black uppercase tracking-wider">{item.label}</span>
                        </div>
                        <h4 className="text-xs font-black uppercase">{item.title}</h4>
                        <p className="text-[10px] font-bold leading-normal opacity-90">{item.desc}</p>
                     </div>
                   );
                 })}
              </div>

              {/* Listado Detallado dentro del Modal */}
              {activeControlTab && (
                <div className="space-y-3 bg-slate-50 border border-slate-200 p-6 rounded-2xl animate-in slide-in-from-bottom-2 duration-300">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                    <span className="text-xs font-black text-slate-700 uppercase tracking-widest">
                      Detalle de Traslados: {activeControlTab}
                    </span>
                    <span className="text-[9px] font-black text-[#0b5156] bg-[#0b5156]/10 px-2 py-0.5 rounded uppercase">
                      {modalFilteredTransfers.length} encontrados
                    </span>
                  </div>
                  
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 no-scrollbar">
                    {modalFilteredTransfers.length === 0 ? (
                      <p className="text-center py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        No hay traslados en esta categoría
                      </p>
                    ) : modalFilteredTransfers.map((t, idx) => (
                      <div key={idx} className="bg-white border border-slate-100 p-4 rounded-xl flex justify-between items-center hover:border-slate-300 transition-colors shadow-sm">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-800 font-mono">{t.id}</span>
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{t.date}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500 uppercase">
                            <span>{t.origin}</span>
                            <ArrowRight size={8} className="text-slate-300" />
                            <span className="text-[#0b5156]">{t.dest}</span>
                          </div>
                          <p className="text-[10px] font-black text-slate-600 uppercase mt-0.5">{t.product}</p>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <span className="text-sm font-black text-slate-800 font-mono bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                            {t.qty} uds
                          </span>
                          {activeControlTab === 'CONFIRMAR' && (
                            <button
                              onClick={() => handleConfirmReception(t.realId)}
                              className="bg-[#0b5156] text-white px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-[#083a3d] transition-all hover:scale-105"
                            >
                              Recibir
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
  
              <div className="p-6 bg-gradient-to-br from-[#0b5156]/5 to-[#0b5156]/10 border border-[#0b5156]/20 rounded-2xl space-y-3">
                <h4 className="text-xs font-black text-[#0b5156] uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert size={14} /> Protocolo de Cierre de Red
                </h4>
                <p className="text-xs font-semibold text-slate-600 uppercase leading-relaxed">
                  RECUERDA VERIFICAR LAS CANTIDADES FÍSICAS ANTES DE PRESIONAR "CONFIRMAR RECEPCIÓN". UNA VEZ CERRADO EL TRASLADO, EL SISTEMA REGISTRARÁ EL INCREMENTO DE EXISTENCIAS EN LA SEDE DE DESTINO Y DISMINUIRÁ EL CAPITAL EN TRÁNSITO DE FORMA AUTOMÁTICA EN TU BASE DE DATOS.
                </p>
              </div>
  
              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => {
                    setShowControlModal(false);
                    setActiveControlTab(null);
                  }}
                  className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-md hover:scale-105 transition-all"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal Nuevo Traslado */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full p-10 shadow-2xl space-y-6 animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto no-scrollbar">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Iniciar Nuevo Traslado</h2>
                <p className="text-[10px] font-black text-[#0b5156] uppercase tracking-widest font-mono">Movimiento interno de inventario</p>
              </div>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs uppercase bg-slate-100 px-3 py-1.5 rounded-xl transition-all"
              >
                Cerrar
              </button>
            </div>

            <form onSubmit={handleCreateTransfer} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Producto a Transferir</label>
                <select
                  required
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-sm font-bold text-slate-700 focus:outline-none focus:border-[#0b5156]/50"
                >
                  <option value="">Selecciona un producto...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} (Stock actual: {p.stock})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Origen</label>
                  <select
                    required
                    value={selectedOriginId}
                    onChange={(e) => setSelectedOriginId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-sm font-bold text-slate-700 focus:outline-none focus:border-[#0b5156]/50"
                  >
                    <option value="">Origen...</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name || w.nombre}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Destino</label>
                  <select
                    required
                    value={selectedDestId}
                    onChange={(e) => setSelectedDestId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-sm font-bold text-slate-700 focus:outline-none focus:border-[#0b5156]/50"
                  >
                    <option value="">Destino...</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name || w.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cantidad a Trasladar</label>
                <input
                  required
                  type="number"
                  min="1"
                  step="any"
                  value={transferQty}
                  onChange={(e) => setTransferQty(Math.max(1, parseFloat(e.target.value) || 0))}
                  placeholder="Ej. 50"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-sm font-bold text-slate-700 focus:outline-none focus:border-[#0b5156]/50"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#0b5156] text-white py-4 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all disabled:opacity-70 mt-2"
              >
                {isSubmitting ? 'Iniciando Traslado...' : 'Registrar Traslado'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Manual de Transferencias */}
      {showManual && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full p-8 shadow-2xl space-y-6 animate-in zoom-in-95 duration-300 max-h-[85vh] overflow-y-auto no-scrollbar">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Manual del Módulo de Transferencias</h2>
                <p className="text-[10px] font-black text-[#0b5156] uppercase tracking-widest font-mono">Control de traslado físico y conciliación de stock</p>
              </div>
              <button 
                onClick={() => setShowManual(false)} 
                className="text-slate-400 hover:text-slate-600 font-bold text-xs uppercase bg-slate-100 px-3 py-1.5 rounded-xl transition-all"
              >
                Cerrar
              </button>
            </div>

            <div className="space-y-6 text-slate-600 text-sm leading-relaxed font-semibold">
              <section className="space-y-2">
                <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">¿Qué hace esta sección del sistema?</h3>
                <p>
                  Este módulo es el encargado de registrar, controlar y auditar la **movilización física de inventario** de una sucursal/bodega de origen hacia una sucursal de destino en tiempo real. 
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">Flujo de Trabajo Operativo (Maker-Checker):</h3>
                <ol className="list-decimal pl-5 space-y-2">
                  <li>
                    <strong>Fase 1 - Despacho / Creación:</strong> El supervisor del almacén de origen inicia el traslado presionando <code>+ Nuevo Traslado</code>. Selecciona el producto, las sedes origen/destino y la cantidad. La mercancía queda registrada en estado <strong>En Tránsito</strong>. El capital de este stock se resta del disponible del origen y entra en el limbo contable de tránsito.
                  </li>
                  <li>
                    <strong>Fase 2 - Arribo / Recepción Física:</strong> Al llegar el vehículo al destino, el supervisor receptor debe contar físicamente los productos. Si todo coincide, hace click en el botón <strong>Confirmar Recepción</strong>. El traslado cambia al estado <code>COMPLETADA</code>, sumando las existencias al almacén de destino y registrando el movimiento contable en el Kardex.
                  </li>
                </ol>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">Filtros Dinámicos del Panel de Operaciones:</h3>
                <p>
                  Usa los 4 botones de estado superiores para filtrar la tabla principal al instante y visualizar rápidamente los envíos en tránsito, completados o aquellos con discrepancias reportadas por descuadre físico.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">Centro de Control Logístico Interactivo:</h3>
                <p>
                  Al presionar el botón <strong>Control Logístico</strong>, se despliega un centro de mando. Al hacer click sobre cualquiera de las 3 tarjetas de control (Confirmar, Auditar, Cerrar), se abrirá un desglose dinámico detallado. Podrás gestionar, auditar y ejecutar la recepción física en el acto.
                </p>
              </section>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setShowManual(false)} 
                className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-md hover:scale-105 transition-all"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
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

export default InventoryTransfer;
