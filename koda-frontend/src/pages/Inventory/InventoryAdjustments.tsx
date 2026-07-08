import { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  CheckCircle2, 
  FileText, 
  ShieldAlert, 
  ArrowRight,
  TrendingUp,
  DollarSign,
  Activity,
  History,
  BookOpen,
  X
} from 'lucide-react';
import { api } from '@/api/client';

interface Producto {
  id: number;
  sku: string;
  nombre: string;
  costo_usd: number | string;
  stock: number;
}

interface AjusteInventario {
  id: number;
  producto_id: number;
  cantidad: number;
  motivo: string;
  estado: string;
  fecha_solicitud: string;
  fecha_aprobacion?: string;
  producto?: Producto; // O lo buscamos en la lista local de productos
}

const InventoryAdjustments = () => {
  const [adjustments, setAdjustments] = useState<AjusteInventario[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [selectedProductoId, setSelectedProductoId] = useState<number>(0);
  const [cantidadInput, setCantidadInput] = useState<string>('0');
  const [motivoInput, setMotivoInput] = useState<string>('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [ajustesData, productosData] = await Promise.all([
        api.get<AjusteInventario[]>('/inventario/ajustes'),
        api.get<Producto[]>('/productos')
      ]);
      
      setAdjustments(ajustesData);
      setProductos(productosData);
      if (productosData.length > 0) {
        setSelectedProductoId(productosData[0].id);
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Error al cargar los datos de inventario');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleProposeAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductoId) {
      alert("Seleccione un producto");
      return;
    }
    const cantidad = parseInt(cantidadInput, 10);
    if (isNaN(cantidad) || cantidad === 0) {
      alert("La cantidad debe ser un número entero diferente de cero");
      return;
    }
    if (!motivoInput.trim()) {
      alert("Ingrese una justificación");
      return;
    }

    try {
      const payload = {
        producto_id: selectedProductoId,
        cantidad,
        motivo: motivoInput
      };
      await api.post('/inventario/ajustes/proponer', payload);
      setIsModalOpen(false);
      setCantidadInput('0');
      setMotivoInput('');
      fetchData();
      alert("Propuesta de ajuste enviada para aprobación");
    } catch (err: any) {
      alert(err.message || "Error al proponer ajuste");
    }
  };

  const handleApprove = async (id: number) => {
    if (!window.confirm("¿Está seguro de autorizar este ajuste de inventario?")) return;
    try {
      await api.post(`/inventario/ajustes/${id}/aprobar`);
      fetchData();
      alert("Ajuste de inventario autorizado con éxito");
    } catch (err: any) {
      alert(err.message || "Error al autorizar ajuste");
    }
  };

  const handleReject = async (id: number) => {
    if (!window.confirm("¿Está seguro de rechazar este ajuste de inventario?")) return;
    try {
      await api.post(`/inventario/ajustes/${id}/rechazar`);
      fetchData();
      alert("Ajuste de inventario rechazado");
    } catch (err: any) {
      alert(err.message || "Error al rechazar ajuste");
    }
  };

  // KPIs dinámicos
  const totalAjustesMes = adjustments.length;
  const pendientesAprobacion = adjustments.filter(a => a.estado === 'PENDIENTE').length;
  const aprobados = adjustments.filter(a => a.estado === 'APROBADO').length;

  const impactoValorizado = adjustments
    .filter(a => a.estado === 'APROBADO')
    .reduce((acc, a) => {
      const prod = productos.find(p => p.id === a.producto_id);
      const costo = prod ? Number(prod.costo_usd) : 0;
      return acc + (Math.abs(a.cantidad) * costo);
    }, 0);

  const stats = [
    { label: 'Ajustes del Mes', value: totalAjustesMes, desc: 'Entradas/Salidas manuales', color: 'text-slate-800' },
    { label: 'Pendientes Aprobación', value: pendientesAprobacion, desc: 'Requieren autorización', color: 'text-amber-500' },
    { label: 'Impacto Valorizado', value: `$${impactoValorizado.toFixed(2)}`, desc: 'Afecta costo inventario', color: 'text-red-600' },
    { label: 'Ajustes Aprobados', value: aprobados, desc: 'Ya impactaron Kardex', color: 'text-[#0b5156]' },
  ];

  const filteredAdjustments = adjustments.filter(a => {
    const prod = productos.find(p => p.id === a.producto_id);
    const prodName = prod ? prod.nombre.toLowerCase() : '';
    return (
      a.motivo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.estado.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prodName.includes(searchTerm.toLowerCase())
    );
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Ajustes de Inventario</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-2xl">
              Registro de correcciones de stock, mermas, daños y conciliación física tras auditoría.
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
               onClick={() => setIsModalOpen(true)}
               className="bg-[#0b5156] text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-[#0b5156]/20 hover:scale-105 transition-all tracking-widest"
             >
                <Plus size={16} /> Proponer Ajuste
             </button>
          </div>
        </div>
      </header>

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

      <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6 w-full">
         <div className="flex justify-between items-center">
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Ajustes Recientes</h3>
            <div className="flex gap-3">
               <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input 
                    type="text" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por motivo..." 
                    className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156] w-56"
                  />
               </div>
            </div>
         </div>

         {loading ? (
           <p className="text-center py-10 text-xs font-bold text-slate-400 uppercase">Cargando ajustes...</p>
         ) : error ? (
           <p className="text-center py-10 text-xs font-bold text-red-500 uppercase">{error}</p>
         ) : filteredAdjustments.length === 0 ? (
           <p className="text-center py-10 text-xs font-bold text-slate-400 uppercase">No hay ajustes registrados</p>
         ) : (
           <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                 <thead>
                    <tr className="text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                       <th className="py-4 px-6">Fecha / N°</th>
                       <th className="py-4 px-4">Producto</th>
                       <th className="py-4 px-4 text-center">Tipo</th>
                       <th className="py-4 px-4 text-center">Cant.</th>
                       <th className="py-4 px-4 text-right">Costo USD (Unit)</th>
                       <th className="py-4 px-4 text-center">Estado</th>
                       <th className="py-4 px-6 text-right">Acción</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {filteredAdjustments.map((a, i) => {
                      const prod = productos.find(p => p.id === a.producto_id);
                      const isEntry = a.cantidad > 0;
                      const statusColor = a.estado === 'APROBADO' 
                        ? 'bg-green-100 text-green-700' 
                        : a.estado === 'PENDIENTE' 
                        ? 'bg-amber-100 text-amber-700' 
                        : 'bg-red-100 text-red-700';

                      return (
                        <tr key={i} className="group hover:bg-slate-50 transition-colors">
                           <td className="py-5 px-6">
                              <div className="flex flex-col">
                                 <span className="text-xs font-black text-slate-800 uppercase">
                                   {new Date(a.fecha_solicitud).toLocaleDateString()}
                                 </span>
                                 <span className="text-[9px] font-bold text-[#0b5156] uppercase tracking-tighter">AJU-{String(a.id).padStart(6, '0')}</span>
                              </div>
                           </td>
                           <td className="py-5 px-4 text-xs font-bold text-slate-800 uppercase truncate max-w-[150px]">
                             {prod ? prod.nombre : 'Producto Desconocido'}
                           </td>
                           <td className="py-5 px-4 text-center">
                              <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter ${isEntry ? 'bg-green-550/10 text-green-600' : 'bg-red-550/10 text-red-600'}`}>
                                {isEntry ? 'Entrada' : 'Salida'}
                              </span>
                           </td>
                           <td className="py-5 px-4 text-center font-bold text-slate-800 font-mono">
                             {a.cantidad > 0 ? `+${a.cantidad}` : a.cantidad}
                           </td>
                           <td className="py-5 px-4 text-right font-black text-slate-500 font-mono">
                             ${prod ? Number(prod.costo_usd).toFixed(2) : '0.00'}
                           </td>
                           <td className="py-5 px-4 text-center">
                              <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter ${statusColor}`}>{a.estado}</span>
                           </td>
                           <td className="py-5 px-6 text-right">
                              {a.estado === 'PENDIENTE' ? (
                                 <div className="flex gap-2 justify-end">
                                   <button 
                                     onClick={() => handleApprove(a.id)}
                                     className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-green-700 transition-all shadow-sm"
                                   >
                                     Aprobar
                                   </button>
                                   <button 
                                     onClick={() => handleReject(a.id)}
                                     className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-sm"
                                   >
                                     Rechazar
                                   </button>
                                 </div>
                              ) : (
                                 <span className="text-[10px] font-black text-slate-400 uppercase font-mono">Procesado</span>
                              )}
                           </td>
                        </tr>
                      );
                    })}
                 </tbody>
              </table>
           </div>
         )}
      </article>

      {/* Modal para Proponer Ajuste */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full p-10 shadow-2xl space-y-6 animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto no-scrollbar">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Proponer Ajuste de Inventario</h2>
                <p className="text-[10px] font-black text-[#0b5156] uppercase tracking-widest font-mono">Corrección y conciliación manual de existencias</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs uppercase bg-slate-100 px-3 py-1.5 rounded-xl transition-all"
              >
                Cerrar
              </button>
            </div>

            <form onSubmit={handleProposeAdjustment} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Producto a Ajustar</label>
                <select 
                  value={selectedProductoId}
                  onChange={(e) => setSelectedProductoId(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-sm font-bold text-slate-700 focus:outline-none focus:border-[#0b5156]/50 uppercase"
                >
                  <option value="">Selecciona un producto...</option>
                  {productos.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} (SKU: {p.sku} | Stock actual: {p.stock})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cantidad del Ajuste</label>
                <input 
                  type="number"
                  value={cantidadInput}
                  onChange={(e) => setCantidadInput(e.target.value)}
                  placeholder="Ej: -5 para restar, 10 para sumar"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-sm font-bold text-slate-700 focus:outline-none focus:border-[#0b5156]/50"
                />
                <span className="text-[9px] font-bold text-slate-400 uppercase block mt-1 leading-normal">
                  ⚠️ NOTA: Usa números negativos para pérdidas/mermas y positivos para excedentes encontrados.
                </span>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Motivo / Justificación</label>
                <textarea 
                  value={motivoInput}
                  onChange={(e) => setMotivoInput(e.target.value)}
                  placeholder="Ej: Bulto roto al descargar camión o desajuste tras conteo físico..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-sm font-bold text-slate-700 focus:outline-none focus:border-[#0b5156]/50 h-28 resize-none"
                />
              </div>

              <button 
                type="submit"
                className="w-full bg-[#0b5156] text-white py-4 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all mt-2"
              >
                Enviar Propuesta
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Manual de Ajustes de Inventario */}
      {showManual && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full p-8 shadow-2xl space-y-6 animate-in zoom-in-95 duration-300 max-h-[85vh] overflow-y-auto no-scrollbar">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Manual del Módulo de Ajustes</h2>
                <p className="text-[10px] font-black text-[#0b5156] uppercase tracking-widest font-mono">Control y conciliación manual de existencias</p>
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
                <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">¿Qué son los Ajustes de Inventario?</h3>
                <p>
                  Esta sección permite a los operadores proponer correcciones manuales de stock tras detectar mermas, daños físicos, faltantes en conteos, o excedentes inesperados en la red.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">Lógica del Flujo Maker-Checker:</h3>
                <ol className="list-decimal pl-5 space-y-2">
                  <li>
                    <strong>Propuesta (Maker):</strong> Cualquier operador del almacén puede presionar <code>Proponer Ajuste</code>. Al seleccionar el producto, debe ingresar cantidades:
                    <ul className="list-disc pl-5 mt-1">
                      <li>Usa <strong>números negativos (ej: -10)</strong> para reportar pérdidas, daños o mermas.</li>
                      <li>Usa <strong>números positivos (ej: 5)</strong> para registrar excedentes o sobrantes.</li>
                    </ul>
                    La propuesta queda guardada en estado <code>PENDIENTE</code> y no afecta el stock real todavía.
                  </li>
                  <li>
                    <strong>Auditoría y Aprobación (Checker):</strong> Un supervisor o gerente revisa las propuestas. Al hacer click en <strong>Aprobar</strong>:
                    <ul className="list-disc pl-5 mt-1">
                      <li>El stock físico real del producto se actualiza de inmediato.</li>
                      <li>Se escribe una entrada automática en el historial del <strong>Kardex de Inventario</strong>.</li>
                      <li>Se genera un <strong>asiento contable automático</strong> en el Libro Diario valorizado a la tasa oficial BCV del día.</li>
                    </ul>
                  </li>
                </ol>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">Impacto Fiscal y Mayor:</h3>
                <p>
                  Por cada ajuste aprobado, la contabilidad de KODA registra el movimiento de inventario contra cuentas de Gastos por Mermas (para salidas) o Ingresos por Sobrantes (para entradas) de forma totalmente transparente e integrada.
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
    </div>
  );
};

export default InventoryAdjustments;
