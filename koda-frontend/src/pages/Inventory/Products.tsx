import { useState, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  Filter, 
  History,
  BookOpen,
  DollarSign,
  ShoppingCart,
  X,
  Edit2,
  Trash2,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { api } from '@/api/client';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';

interface Producto {
  id: number;
  sku: string;
  nombre: string;
  precio_usd: number | string;
  costo_usd: number | string;
  stock: number;
  es_exento: boolean;
}

const Products = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(25);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Producto | null>(null);
  
  // Form states
  const [sku, setSku] = useState('');
  const [nombre, setNombre] = useState('');
  const [precioUsd, setPrecioUsd] = useState('');
  const [costoUsd, setCostoUsd] = useState('');
  const [stock, setStock] = useState('0');
  const [esExento, setEsExento] = useState(false);

  // Custom visual feedback states
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [productToDelete, setProductToDelete] = useState<number | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const data = await api.get<Producto[]>('/productos');
      setProducts(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Error al cargar productos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleOpenCreateModal = () => {
    setEditingProduct(null);
    setSku('');
    setNombre('');
    setPrecioUsd('');
    setCostoUsd('');
    setStock('0');
    setEsExento(false);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (p: Producto) => {
    setEditingProduct(p);
    setSku(p.sku);
    setNombre(p.nombre);
    setPrecioUsd(String(p.precio_usd));
    setCostoUsd(String(p.costo_usd));
    setStock(String(p.stock));
    setEsExento(p.es_exento);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        sku,
        nombre,
        precio_usd: parseFloat(precioUsd),
        costo_usd: parseFloat(costoUsd),
        stock: parseInt(stock, 10),
        es_exento: esExento
      };

      if (editingProduct) {
        await api.put(`/productos/${editingProduct.id}`, payload);
        showToast('Producto actualizado exitosamente', 'success');
      } else {
        await api.post('/productos', payload);
        showToast('Producto creado exitosamente', 'success');
      }
      setIsModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      showToast(err.message || 'Error al guardar producto', 'error');
    }
  };

  const handleDelete = (id: number) => {
    setProductToDelete(id);
  };

  // KPIs dinámicos
  const totalActivos = products.length;
  const stockCritico = products.filter(p => Number(p.stock) > 0 && Number(p.stock) < 10).length;
  const agotados = products.filter(p => Number(p.stock) === 0).length;
  const valorInventario = products.reduce((acc, p) => acc + (Number(p.stock) * Number(p.costo_usd)), 0);

  const stats = [
    { label: 'PRODUCTOS ACTIVOS', value: totalActivos, desc: 'Catálogo operativo', color: 'text-[#0b5156]' },
    { label: 'STOCK CRÍTICO', value: stockCritico, desc: 'Requieren reposición', color: 'text-amber-600' },
    { label: 'AGOTADOS', value: agotados, desc: 'Afectan ventas', color: 'text-red-600' },
    { label: 'VALOR INVENTARIO', value: `$${valorInventario.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, desc: 'Valorizado disponible', color: 'text-slate-800' },
  ];

  const filteredProducts = products.filter(p => 
    p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentProducts = filteredProducts.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header Compacto */}
      <header className="bg-white p-8 rounded-3xl border border-[#bdafa1]/20 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
           <ShoppingCart size={120} className="text-[#0b5156]" />
        </div>
        <div className="flex justify-between items-start mb-6 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Inventario
              </span>
            </div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Productos</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-3xl leading-relaxed">
              Catálogo, precios, stock, rotación y estado comercial de productos.
            </p>
          </div>
          <div className="flex gap-3">
             <button onClick={() => showToast('Descargando Manual del Catálogo de Productos...', 'success')} className="bg-white text-slate-500 px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 border border-slate-200 hover:bg-slate-50 transition-all tracking-widest shadow-sm">
                <BookOpen size={14} /> Manual
             </button>
             <button onClick={() => navigate('/inventario/dashboard')} className="bg-white text-[#0b5156] px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-[#0b5156]/20 hover:bg-green-50 transition-all tracking-widest shadow-sm">
                Volver
             </button>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-3 pt-2 relative z-10">
           <button 
             onClick={handleOpenCreateModal}
             className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-[#0b5156]/20 hover:scale-105 transition-all tracking-widest"
           >
             <Plus size={16} strokeWidth={3} /> Nuevo Producto
           </button>
        </div>
      </header>

      {/* Grid de KPIs */}
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

      {/* Tabla Maestro */}
      <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
         <div className="flex justify-between items-center">
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Catálogo Maestro</h3>
            <div className="flex gap-3">
               <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input 
                    type="text" 
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    placeholder="Buscar SKU o nombre..." 
                    className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156] w-64"
                  />
               </div>
            </div>
         </div>

         {loading ? (
           <p className="text-center py-10 text-xs font-bold text-slate-400 uppercase">Cargando catálogo...</p>
         ) : error ? (
           <p className="text-center py-10 text-xs font-bold text-red-500 uppercase">{error}</p>
         ) : filteredProducts.length === 0 ? (
           <p className="text-center py-10 text-xs font-bold text-slate-400 uppercase">No hay productos registrados</p>
         ) : (
           <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                 <thead>
                    <tr className="text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                       <th className="py-4 px-6">PRODUCTO / SKU</th>
                       <th className="py-4 px-4 text-center">TIPO IVA</th>
                       <th className="py-4 px-4 text-center text-green-600">DISPONIBLE</th>
                       <th className="py-4 px-4 text-right">COSTO USD</th>
                       <th className="py-4 px-4 text-right">PRECIO USD</th>
                       <th className="py-4 px-6 text-right">VALOR TOTAL COSTO</th>
                       <th className="py-4 px-6 text-center">ESTADO</th>
                       <th className="py-4 px-6 text-center">ACCIONES</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {currentProducts.map((p, i) => {
                      const totalCostoVal = Number(p.stock) * Number(p.costo_usd);
                      const isLow = Number(p.stock) > 0 && Number(p.stock) < 10;
                      const isOut = Number(p.stock) === 0;
                      let statusBadge = 'Activo';
                      let statusColor = 'bg-green-100 text-green-700';
                      if (isLow) {
                        statusBadge = 'Bajo';
                        statusColor = 'bg-amber-100 text-amber-700';
                      } else if (isOut) {
                        statusBadge = 'Agotado';
                        statusColor = 'bg-red-100 text-red-700';
                      }

                      return (
                        <tr key={i} className="group hover:bg-slate-50 transition-colors">
                           <td className="py-5 px-6">
                              <div className="flex flex-col">
                                 <span className="text-xs font-black text-slate-800 uppercase">{p.nombre}</span>
                                 <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">SKU {p.sku}</span>
                              </div>
                           </td>
                           <td className="py-5 px-4 text-center text-xs font-bold text-slate-500 uppercase">
                             {p.es_exento ? 'Exento (0%)' : 'Gravable (16%)'}
                           </td>
                           <td className="py-5 px-4 text-center font-black text-slate-900 font-mono">{p.stock}</td>
                           <td className="py-5 px-4 text-right text-xs font-black text-slate-400 font-mono">
                             ${Number(p.costo_usd).toFixed(2)}
                           </td>
                           <td className="py-5 px-4 text-right text-xs font-black text-slate-700 font-mono">
                             ${Number(p.precio_usd).toFixed(2)}
                           </td>
                           <td className="py-5 px-6 text-right text-xs font-black text-slate-800 font-mono">
                             ${totalCostoVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                           </td>
                           <td className="py-5 px-6 text-center">
                              <span className={`${statusColor} text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter`}>
                                {statusBadge}
                              </span>
                           </td>
                           <td className="py-5 px-6 text-center">
                             <div className="flex items-center justify-center gap-2">
                               <button 
                                 onClick={() => handleOpenEditModal(p)}
                                 className="p-1 hover:text-[#0b5156] text-slate-400 transition-colors"
                               >
                                 <Edit2 size={14} />
                               </button>
                               <button 
                                 onClick={() => handleDelete(p.id)}
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
         {!loading && !error && filteredProducts.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 pt-6 mt-4">
               <span className="text-xs font-bold text-slate-400">
                  Mostrando {indexOfFirstItem + 1} a {Math.min(indexOfLastItem, filteredProducts.length)} de {filteredProducts.length} productos
               </span>
               <div className="flex items-center gap-2">
                  <button 
                     onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                     disabled={currentPage === 1}
                     className="px-4 py-2 bg-slate-50 text-slate-600 rounded-xl text-[10px] font-black uppercase disabled:opacity-50 hover:bg-slate-100 transition-colors"
                  >
                     Anterior
                  </button>
                  <span className="text-xs font-black text-[#0b5156] font-mono bg-[#0b5156]/5 px-4 py-2 rounded-xl">
                     {currentPage} / {totalPages}
                  </span>
                  <button 
                     onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                     disabled={currentPage === totalPages}
                     className="px-4 py-2 bg-[#0b5156] text-white rounded-xl text-[10px] font-black uppercase disabled:opacity-50 hover:bg-[#083a3d] transition-colors shadow-md shadow-[#0b5156]/20"
                  >
                     Siguiente
                  </button>
               </div>
            </div>
         )}
      </article>

      {/* Modal de Crear / Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full border border-[#0b5156]/20 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-600"
            >
              <X size={18} />
            </button>
            <h3 className="text-xl font-black uppercase text-slate-800 tracking-tight mb-6">
              {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">SKU / Código</label>
                <input 
                  type="text" 
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  required
                  placeholder="Ej. HAR-INT-25"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Nombre del Producto</label>
                <input 
                  type="text" 
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
                  placeholder="Ej. Harina integral 25kg"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Costo USD</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={costoUsd}
                    onChange={(e) => setCostoUsd(e.target.value)}
                    required
                    placeholder="0.00"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Precio USD</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={precioUsd}
                    onChange={(e) => setPrecioUsd(e.target.value)}
                    required
                    placeholder="0.00"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Stock Inicial</label>
                <input 
                  type="number" 
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  required
                  disabled={!!editingProduct}
                  placeholder="0"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156] disabled:opacity-50"
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="esExento"
                  checked={esExento}
                  onChange={(e) => setEsExento(e.target.checked)}
                  className="w-4 h-4 text-[#0b5156] focus:ring-[#0b5156] border-slate-300 rounded"
                />
                <label htmlFor="esExento" className="text-xs font-black text-slate-600 uppercase tracking-tight">Exento de IVA (0%)</label>
              </div>

              <div className="pt-4">
                <button 
                  type="submit"
                  className="w-full bg-[#0b5156] hover:bg-[#093e42] text-white font-black py-4 rounded-xl uppercase text-[11px] tracking-widest shadow-lg transition-all"
                >
                  {editingProduct ? 'Guardar Cambios' : 'Crear Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Eliminación Premium */}
      {productToDelete !== null && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full border border-red-100 shadow-2xl relative animate-in zoom-in-95 duration-200 text-center space-y-6">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <Trash2 size={24} />
            </div>
            <div className="space-y-2">
              <h4 className="text-lg font-black uppercase text-slate-800 tracking-tight">¿Eliminar Producto?</h4>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-tight leading-relaxed">
                Esta acción no se puede deshacer y afectará el historial del inventario.
              </p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setProductToDelete(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-500 font-black py-3 rounded-xl uppercase text-[10px] tracking-widest transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={async () => {
                  const id = productToDelete;
                  setProductToDelete(null);
                  try {
                    await api.delete(`/productos/${id}`);
                    showToast('Producto eliminado exitosamente', 'success');
                    fetchProducts();
                  } catch (err: any) {
                    showToast(err.message || 'Error al eliminar producto', 'error');
                  }
                }}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-black py-3 rounded-xl uppercase text-[10px] tracking-widest transition-all shadow-lg shadow-red-950/20"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portal de Notificaciones Toast flotantes estilo KODA */}
      {toast && typeof document !== 'undefined' && createPortal(
        <div className="fixed bottom-5 right-5 z-[9999] animate-in slide-in-from-bottom duration-300">
          <div className={`px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 ${toast.type === 'success' ? 'bg-[#0b5156] border border-[#0b5156]/20 text-white' : 'bg-red-600 border border-red-500 text-white'}`}>
            {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
            <span className="font-bold text-sm tracking-wide uppercase font-mono">{toast.message}</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Products;
