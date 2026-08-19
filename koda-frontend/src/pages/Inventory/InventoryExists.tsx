import { 
  Search, 
  Filter, 
  Box,
  Warehouse,
  History,
  ShieldAlert,
  ShoppingCart,
  TrendingDown,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api/client';

const InventoryExists = () => {
  const navigate = useNavigate();
  const [productos, setProductos] = useState<any[]>([]);
  const [dash, setDash] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filterTerm, setFilterTerm] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    Promise.all([
      api.get<any[]>('/productos'),
      api.get<any>('/inventario/dashboard'),
      api.get<any[]>('/inventario/transferencias'),
    ]).then(([prodData, invDash, trans]) => {
      setProductos(prodData || []);
      
      const pendingTransfers = (trans || []).filter((t: any) => t.estado === 'PENDIENTE' || t.estado === 'En Tránsito');
      const transStats = {
        pendientes: pendingTransfers.length,
        pendientesUds: pendingTransfers.reduce((acc: number, t: any) => acc + (t.cantidad || 0), 0),
      };
      setDash({ ...invDash, trans: transStats });
      setLoading(false);
    }).catch(err => {
      console.error('Error fetching data:', err);
      setLoading(false);
    });
  }, []);

  const stocks = productos.map(p => {
    const isOutOfStock = p.stock <= 0;
    return {
      name: p.nombre,
      id: p.sku,
      warehouse: 'Almacén Principal',
      available: p.stock,
      reserved: 0,
      transit: 0,
      cost: `$${p.costo_usd}`,
      status: isOutOfStock ? 'Agotado' : 'Disponible',
      color: isOutOfStock ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
    };
  });

  const filteredStocks = stocks.filter(s => 
    s.name.toLowerCase().includes(filterTerm.toLowerCase()) || 
    s.id.toLowerCase().includes(filterTerm.toLowerCase()) ||
    s.warehouse.toLowerCase().includes(filterTerm.toLowerCase())
  );

  const bajoMinimoCount = productos.filter(p => p.stock < 10).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header Compacto - Estandarizado */}
      <header className="bg-white p-8 rounded-3xl border border-[#bdafa1]/20 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
           <Box size={120} className="text-[#0b5156]" />
        </div>
        <div className="flex justify-between items-start mb-6 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Inventario
              </span>
            </div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Existencias</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-3xl leading-relaxed">
              Consulta de stock disponible, reservado, comprometido y valorizado.
            </p>
          </div>
          <div className="flex gap-3">
             <Link to="/inventario/almacenes" className="bg-white text-slate-500 px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 border border-slate-200 hover:bg-slate-50 transition-all tracking-widest shadow-sm inline-flex">
                <Warehouse size={14} /> Almacenes
             </Link>
             <Link to="/inventario/kardex" className="bg-[#0b5156] text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-[#0b5156]/20 hover:scale-105 transition-all tracking-widest">
                <History size={16} /> Kardex
             </Link>
          </div>
        </div>
      </header>

      {/* Grid Superior: Stock Crítico y Lectura Inteligente */}
      <div className="grid grid-cols-1 gap-6 items-start">
        <article className="bg-white p-8 rounded-3xl border border-[#bdafa1]/20 shadow-sm space-y-8">
           <div className="space-y-1">
             <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Stock crítico</h3>
             <p className="text-sm font-bold text-slate-500 uppercase tracking-tight">Productos bajo mínimo, agotados o con riesgo operativo.</p>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              {[
                { label: 'BAJO MÍNIMO', value: `${bajoMinimoCount} productos requieren reposición`, desc: 'Generar solicitudes de compra.', color: 'bg-amber-50/30 border-amber-200', badge: 'bg-amber-500 text-white', action: () => navigate('/inventario/critico') },
                { label: 'RESERVADO', value: '0 unidades comprometidas', desc: 'No contarse como disponible real.', color: 'bg-blue-50/30 border-blue-200', badge: 'bg-blue-500 text-white', action: () => showToast('La gestión de stock reservado se procesa de forma automática con las Cotizaciones abiertas.', 'success') },
                { label: 'TRÁNSITO', value: `${dash?.trans?.pendientesUds || 0} unidades por confirmar`, desc: 'Validar recepción antes de vender.', color: 'bg-emerald-50/30 border-emerald-200', badge: 'bg-[#0b5156] text-white', action: () => navigate('/inventario/transferencias') },
              ].map((item, i) => (
                <div key={i} onClick={item.action} className={`${item.color} p-6 rounded-2xl border space-y-4 hover:shadow-xl transition-all cursor-pointer group`}>
                   <span className={`${item.badge} text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest`}>{item.label}</span>
                   <div className="space-y-1">
                      <p className="text-sm font-black text-slate-800 uppercase leading-tight group-hover:text-[#0b5156] transition-colors">{item.value}</p>
                      <p className="text-xs font-bold text-slate-500 uppercase leading-tight">{item.desc}</p>
                   </div>
                </div>
              ))}
           </div>
        </article>


      </div>

      {/* Tabla Maestro - Estandarizada */}
      <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
         <div className="flex justify-between items-center">
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Inventario Detallado</h3>
            <div className="flex gap-3">
               <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input 
                    type="text" 
                    value={filterTerm}
                    onChange={(e) => setFilterTerm(e.target.value)}
                    placeholder="Filtrar por producto o almacén..." 
                    className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156] w-64"
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
                       <th className="py-4 px-6">PRODUCTO / REF</th>
                       <th className="py-4 px-4 text-center text-green-600">EXISTENCIA TOTAL</th>
                       <th className="py-4 px-4 text-center text-amber-600">RESERVADO</th>
                       <th className="py-4 px-4 text-center text-[#0b5156]">DISPONIBLE</th>
                       <th className="py-4 px-4 text-center text-blue-600">EN TRÁNSITO</th>
                       <th className="py-4 px-4 text-right">COSTO PROM.</th>
                       <th className="py-4 px-6 text-center">ESTADO</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {filteredStocks.length > 0 ? (
                      filteredStocks.map((s, i) => (
                        <tr key={i} className="group hover:bg-slate-50 transition-colors">
                           <td className="py-5 px-6">
                              <div className="flex flex-col">
                                 <span className="text-xs font-black text-slate-800 uppercase">{s.name}</span>
                                 <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">REF: {s.id}</span>
                              </div>
                           </td>
                           <td className="py-5 px-4 text-center font-black text-slate-900 font-mono">{s.available + s.reserved}</td>
                           <td className="py-5 px-4 text-center font-bold text-amber-600 font-mono">{s.reserved}</td>
                           <td className="py-5 px-4 text-center font-black text-[#0b5156] font-mono">{s.available}</td>
                           <td className="py-5 px-4 text-center font-bold text-blue-500 font-mono">{s.transit}</td>
                           <td className="py-5 px-4 text-right text-xs font-black text-slate-400 font-mono">{s.cost}</td>
                           <td className="py-5 px-6 text-center">
                              <span className={`${s.color} text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter`}>{s.status}</span>
                           </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-xs font-bold text-slate-400 uppercase">
                           No hay existencias registradas en el catálogo.
                        </td>
                      </tr>
                    )}
                 </tbody>
              </table>
            )}
         </div>
      </article>

      {/* Resumen de Control */}
      <article className="bg-white p-8 rounded-3xl border border-[#bdafa1]/20 shadow-sm space-y-8">
         <div className="space-y-1">
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Resumen de control operativo</h3>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-tight">Acciones requeridas para mantener existencias reales para ventas.</p>
         </div>
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {[
              { label: 'REPONER', title: `${bajoMinimoCount} Bajo Mínimo`, desc: 'Deben generar solicitudes de compra.', color: 'border-amber-200 bg-amber-50/30', badge: 'bg-amber-500 text-white', icon: <ShoppingCart size={14} />, action: () => navigate('/inventario/critico') },
              { label: 'SEPARAR', title: '0 Stock Reservado', desc: 'No debe contarse como libre para venta.', color: 'border-blue-200 bg-blue-50/30', badge: 'bg-blue-500 text-white', icon: <ShieldAlert size={14} />, action: () => showToast('La gestión de stock reservado se procesa de forma automática con las Cotizaciones abiertas.', 'success') },
              { label: 'CONTROLAR', title: 'Valorizado', desc: 'Con costo y almacén asignado.', color: 'border-[#0b5156]/20 bg-[#0b5156]/5', badge: 'bg-[#0b5156] text-white', icon: <TrendingDown size={14} />, action: () => navigate('/inventario/kardex') },
            ].map((item, i) => (
              <div key={i} onClick={item.action} className={`p-8 rounded-3xl border ${item.color} space-y-4 hover:shadow-xl transition-all cursor-pointer group`}>
                 <span className={`${item.badge} text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest`}>{item.label}</span>
                 <div className="space-y-2">
                    <p className="text-lg font-black text-slate-800 uppercase group-hover:text-[#0b5156] transition-colors">{item.title}</p>
                    <p className="text-sm font-bold text-slate-500 uppercase leading-relaxed">{item.desc}</p>
                 </div>
              </div>
            ))}
         </div>
      </article>

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

export default InventoryExists;
