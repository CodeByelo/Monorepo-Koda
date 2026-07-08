import { 
  Search, 
  Filter, 
  ArrowRight, 
  Activity,
  ShieldAlert,
  TrendingUp,
  BookOpen,
  ShoppingCart,
  ArrowUpRight,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { Toast } from '@/components/common/Toast';

const InventoryCritical = () => {
  const navigate = useNavigate();
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManual, setShowManual] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    api.get<any[]>('/productos')
      .then(data => {
        setProductos(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching productos:', err);
        setLoading(false);
      });
  }, []);

  const [filterTerm, setFilterTerm] = useState('');

  const criticalItems = productos
    .map(p => {
      const stock = p.stock;
      const minStock = 10; // Criterio por defecto
      const isCritical = stock < minStock;
      const isOutOfStock = stock <= 0;
      
      const status = isOutOfStock ? 'Agotado' : (isCritical ? 'Bajo Mínimo' : 'Reposición');
      const color = isOutOfStock ? 'border-red-500' : (isCritical ? 'border-amber-500' : 'border-blue-500');
      const badge = isOutOfStock ? 'bg-red-100 text-red-700' : (isCritical ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700');

      return {
        name: p.nombre,
        id: p.sku,
        warehouse: 'Almacén Principal',
        available: stock,
        min: minStock,
        reserved: 0,
        suggested: Math.max(0, minStock - stock),
        cost: parseFloat(p.costo_usd || 10),
        status,
        color,
        badge,
        isCritical,
        isOutOfStock
      };
    })
    .filter(item => item.isCritical || item.isOutOfStock);

  const agotadosCount = criticalItems.filter(i => i.isOutOfStock).length;
  const bajoMinimoCount = criticalItems.filter(i => i.isCritical && !i.isOutOfStock).length;
  const totalSuggestedCost = criticalItems.reduce((acc, i) => acc + (i.suggested * i.cost), 0);

  const stats = [
    { label: 'Productos Críticos', value: String(bajoMinimoCount), desc: 'Bajo mínimo operativo', color: 'text-amber-500' },
    { label: 'Agotados', value: String(agotadosCount), desc: 'Sin disponibilidad real', color: 'text-red-600' },
    { label: 'Comprometidos', value: '0', desc: 'Reservados por ventas', color: 'text-blue-500' },
    { label: 'Reposición Sugerida', value: `$${totalSuggestedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, desc: 'Compra estimada total', color: 'text-[#0b5156]' },
  ];

  const handleMassRequest = () => {
    if (criticalItems.length === 0) {
      showToast('No hay productos críticos para reponer.', 'error');
      return;
    }
    sessionStorage.setItem('koda_bulk_replenish', JSON.stringify(criticalItems));
    showToast('Requisitos precargados. Redirigiendo a Requisiciones...', 'success');
    setTimeout(() => {
      navigate('/compras/requisiciones/nueva');
    }, 1500);
  };

  const handleRequestSingleProduct = (item: any) => {
    sessionStorage.setItem('koda_bulk_replenish', JSON.stringify([item]));
    showToast(`Producto precargado. Redirigiendo...`, 'success');
    setTimeout(() => {
      navigate('/compras/requisiciones/nueva');
    }, 1200);
  };

  const filteredCriticalItems = criticalItems.filter(item => 
    item.name.toLowerCase().includes(filterTerm.toLowerCase()) ||
    item.id.toLowerCase().includes(filterTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Stock Crítico</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-2xl">
              Detección proactiva de productos bajo mínimo, agotados o comprometidos. Sugerencias automáticas de reposición para evitar quiebres operativos.
            </p>
          </div>
          <div className="flex gap-3">
             <button onClick={() => setShowManual(true)} className="bg-white text-slate-500 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 flex items-center gap-2 tracking-widest shadow-sm hover:bg-slate-50 active:scale-95 transition-all">
               <BookOpen size={14} /> Manual de Reposición
             </button>
             <button onClick={handleMassRequest} className="bg-[#0b5156] text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 tracking-widest shadow-lg shadow-green-900/20 hover:bg-[#083a3d] hover:scale-[1.02] active:scale-95 transition-all">
               <ShoppingCart size={16} /> Crear Solicitud Masiva
             </button>
          </div>
        </div>
      </header>

      {/* Grid Superior */}
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

      {/* Alertas Horizontales de Riesgo Operativo y Quiebre de Stock */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         {/* Alerta: Detección de Quiebre */}
         <div className={`p-5 rounded-2xl border flex gap-3 items-start transition-all duration-300 ${
           productos.length === 0
             ? 'bg-slate-50 border-slate-200 text-slate-600'
             : agotadosCount > 0 
             ? 'bg-red-50 border-red-200 text-red-800' 
             : 'bg-green-50 border-green-200 text-green-800'
         }`}>
            <div className={`p-2 rounded-xl ${productos.length === 0 ? 'bg-slate-500/10' : agotadosCount > 0 ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
               <Activity className={productos.length === 0 ? 'text-slate-500' : agotadosCount > 0 ? 'text-red-600 animate-pulse' : 'text-green-600'} size={18} />
            </div>
            <div className="space-y-1">
               <h4 className="text-xs font-black uppercase tracking-wider">Detección de Quiebre</h4>
               <p className="text-xs font-bold uppercase tracking-tight opacity-80 leading-relaxed">
                  {productos.length === 0
                    ? 'SIN DATOS: Registre productos en el catálogo para iniciar el monitoreo de quiebres.'
                    : agotadosCount > 0 
                    ? `Se han detectado ${agotadosCount} productos de alta rotación sin disponibilidad. Generar orden de compra urgente para evitar pérdidas de venta.`
                    : 'No se han detectado quiebres de stock en productos de alta rotación.'}
               </p>
            </div>
         </div>

         {/* Alerta: Riesgo Operativo */}
         <div className={`p-5 rounded-2xl border flex gap-3 items-start transition-all duration-300 ${
           productos.length === 0
             ? 'bg-slate-50 border-slate-200 text-slate-600'
             : agotadosCount > 0 
             ? 'bg-red-50 border-red-200 text-red-800' 
             : bajoMinimoCount > 0 
             ? 'bg-amber-50 border-amber-200 text-amber-800' 
             : 'bg-green-50 border-green-200 text-green-800'
         }`}>
            <div className={`p-2 rounded-xl ${
              productos.length === 0 ? 'bg-slate-500/10' : agotadosCount > 0 ? 'bg-red-500/10' : bajoMinimoCount > 0 ? 'bg-amber-500/10' : 'bg-green-500/10'
            }`}>
               <ShieldAlert size={18} />
            </div>
            <div className="space-y-1">
               <h4 className="text-xs font-black uppercase tracking-wider">Estado de Riesgo Operativo</h4>
               <p className="text-xs font-bold uppercase tracking-tight opacity-80 leading-relaxed">
                  {productos.length === 0
                    ? 'CATÁLOGO VACÍO: No existen artículos registrados para evaluar riesgos operativos.'
                    : agotadosCount > 0 
                    ? 'CRÍTICO: Bloqueo inminente de ventas debido a quiebre de inventario.' 
                    : bajoMinimoCount > 0 
                    ? 'MEDIO: Existen productos bajo el mínimo operativo que requieren reposición priorizada.' 
                    : 'BAJO: Niveles de stock saludables en todo el catálogo.'}
               </p>
            </div>
         </div>
      </div>

      {/* Tabla Expandida al 100% de Ancho */}
      <article className="w-full bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
         <div className="flex justify-between items-center">
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Análisis de Reposición</h3>
            <div className="flex gap-3">
               <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input 
                    type="text" 
                    placeholder="Buscar crítico..." 
                    value={filterTerm}
                    onChange={(e) => setFilterTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156] w-48"
                  />
               </div>
               <button className="p-2 bg-slate-50 text-slate-400 rounded-xl border border-slate-200 hover:bg-white transition-all"><Filter size={14} /></button>
            </div>
         </div>

         <div className="overflow-x-auto no-scrollbar">
            {loading ? (
              <div className="py-8 text-center text-slate-500 font-bold text-sm uppercase">Cargando datos...</div>
            ) : (
              <table className="w-full text-left">
                 <thead>
                    <tr className="text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                       <th className="py-4 px-6">Producto / Almacén</th>
                       <th className="py-4 px-4 text-center">Disp.</th>
                       <th className="py-4 px-4 text-center">Mín.</th>
                       <th className="py-4 px-4 text-center">Reserv.</th>
                       <th className="py-4 px-4 text-center text-[#0b5156]">Sugerido</th>
                       <th className="py-4 px-4 text-center">Estado</th>
                       <th className="py-4 px-6 text-right">Acción</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {filteredCriticalItems.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500 font-bold text-sm uppercase">
                          No hay productos críticos en este momento.
                        </td>
                      </tr>
                    )}
                    {filteredCriticalItems.map((item, i) => (
                      <tr key={i} className={`group hover:bg-slate-50 transition-colors border-l-4 ${item.color}`}>
                         <td className="py-5 px-6">
                            <div className="flex flex-col">
                               <span className="text-xs font-black text-slate-800 uppercase">{item.name}</span>
                               <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">SKU: {item.id}</span>
                            </div>
                         </td>
                         <td className="py-5 px-4 text-center font-black text-slate-400">{item.available}</td>
                         <td className="py-5 px-4 text-center font-bold text-slate-900">{item.min}</td>
                         <td className="py-5 px-4 text-center font-bold text-blue-500">{item.reserved}</td>
                         <td className="py-5 px-4 text-center font-black text-[#0b5156] bg-green-50/50">{item.suggested}</td>
                         <td className="py-5 px-4 text-center">
                            <span className={`${item.badge} text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter`}>{item.status}</span>
                         </td>
                         <td className="py-5 px-6 text-right">
                            <button onClick={() => handleRequestSingleProduct(item)} className="bg-[#0b5156] text-white px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all flex items-center gap-2 ml-auto">
                               Solicitar <ArrowUpRight size={10} />
                            </button>
                         </td>
                      </tr>
                    ))}
                 </tbody>
              </table>
            )}
         </div>
      </article>

      {/* Manual de Reposición Modal */}
      {showManual && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full p-8 shadow-2xl space-y-6 animate-in zoom-in-95 duration-300 max-h-[85vh] overflow-y-auto no-scrollbar">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Manual de Reposición Inteligente</h2>
                <p className="text-[10px] font-black text-[#0b5156] uppercase tracking-widest">KODA ERP - Instrucciones de Control de Inventario</p>
              </div>
              <button onClick={() => setShowManual(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xs uppercase bg-slate-100 px-3 py-1.5 rounded-xl transition-all">Cerrar</button>
            </div>

            <div className="space-y-6 text-slate-600 text-sm leading-relaxed font-semibold">
              <section className="space-y-2">
                <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">1. Criterios de Reposición y Sugeridos</h3>
                <p>
                  El sistema evalúa de forma continua el stock de los productos. Si un producto cae por debajo de su <strong>Stock Mínimo (establecido en 10 unidades por defecto)</strong>, es considerado en estado crítico.
                  El sistema calcula de forma automática el <strong>Sugerido de Reposición</strong> mediante la fórmula:
                </p>
                <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-center font-mono font-bold text-slate-800 text-xs">
                  Sugerido = Máximo(0, Stock Mínimo - Stock Físico Disponible)
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">2. Alerta de Detección de Quiebre</h3>
                <p>
                  La <strong>Detección de Quiebre</strong> es un motor automatizado que analiza continuamente los artículos catalogados como <strong>Alta Rotación</strong>. 
                  Si un artículo de esta categoría llega a un stock de <strong>0 unidades o menor</strong>, se genera una alerta inmediata.
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Bloqueo de POS</strong>: Evita que el equipo de ventas ofrezca productos no disponibles en tiempo real.</li>
                  <li><strong>Priorización en Compras</strong>: Clasifica la reposición de estos ítems con prioridad urgente en el departamento de compras.</li>
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">3. Creación de Solicitudes de Compra</h3>
                <p>
                  El botón <strong>Crear Solicitud Masiva</strong> automatiza el proceso de abastecimiento de la empresa:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Validación de Inventario</strong>: Si no hay artículos en estado crítico, el sistema desplegará una alerta flotante impidiendo el envío.</li>
                  <li><strong>Autocompletado de Formulario</strong>: Si hay productos que requieren reposición, el sistema calculará el costo total estimado, priorizará la solicitud como alta o urgente, y creará un desglose detallado con las unidades sugeridas y códigos SKU para su aprobación en el departamento de Compras.</li>
                </ul>
              </section>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button onClick={() => setShowManual(false)} className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-md hover:scale-105 transition-all">
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

export default InventoryCritical;
