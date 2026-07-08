import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calculator, ChevronRight, Target, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { api } from '@/api/client';

const money = (value: unknown) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

const StockReception = () => {
  const [purchaseOrder, setPurchaseOrder] = useState('');
  const [invoiceCost, setInvoiceCost] = useState('');
  const [receivedQty, setReceivedQty] = useState('');
  const [receptions, setReceptions] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleNewReception = () => {
    setPurchaseOrder('');
    setInvoiceCost('');
    setReceivedQty('');
    setSelectedProductId('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Formulario listo para nueva recepción', 'success');
  };

  const fetchData = () => {
    setIsLoading(true);
    Promise.all([
      api.get('/compras/recepciones').catch(() => []),
      api.get('/productos').catch(() => [])
    ]).then(([recRes, prodRes]: [any, any]) => {
      setReceptions(Array.isArray(recRes) ? recRes : (recRes?.data || []));
      setProducts(Array.isArray(prodRes) ? prodRes : (prodRes?.data || []));
    }).finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleProcessReception = async () => {
    if (!selectedProductId || !receivedQty || !invoiceCost) {
      showToast('Faltan campos requeridos', 'error');
      return;
    }
    
    setIsProcessing(true);
    try {
      await api.post('/compras/recepciones', {
        producto_id: parseInt(selectedProductId),
        cantidad: parseFloat(receivedQty),
        costo_factura: parseFloat(invoiceCost),
        orden_compra: purchaseOrder || undefined
      });
      showToast('Entrada de stock registrada correctamente', 'success');
      handleNewReception();
      fetchData();
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Error procesando entrada', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedProduct = products.find((product) => String(product.id) === selectedProductId);
  const averageCost = Number(selectedProduct?.costo_usd || selectedProduct?.costo || 0);
  const newCost = Number(invoiceCost || 0);
  const costDifference = averageCost > 0 && newCost > 0 ? ((newCost - averageCost) / averageCost) * 100 : 0;

  const stats = useMemo(() => {
    const items = receptions.reduce((sum, item) => sum + Number(item.cantidad || item.qty || 0), 0);
    const hoy = receptions.filter((item) => {
      if (!item.fecha) return false;
      const d = new Date(item.fecha);
      const today = new Date();
      return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    }).length;
    const porConciliar = receptions.filter((item) => item.estado !== 'Conciliado').length;
    
    return [
      { label: 'Hoy', value: String(hoy), desc: 'Entradas registradas', color: 'text-[#0b5156]' },
      { label: 'Por Conciliar', value: String(porConciliar), desc: 'Falta factura de soporte', color: 'text-slate-500' },
      { label: 'Diferencias', value: '0', desc: 'Inconsistencias registradas', color: 'text-red-600' },
      { label: 'Items Ingresados', value: String(items), desc: 'Incremento de stock', color: 'text-[#43584b]' },
    ];
  }, [receptions]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">

      <header className="bg-white p-8 rounded-3xl border border-[#bdafa1]/20 shadow-sm">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Recepción de Mercancía</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight max-w-2xl">
              Control de entradas físicas y recalculo de costos con datos reales del sistema.
            </p>
          </div>
          <button 
            onClick={handleNewReception}
            className="bg-[#0b5156] text-white px-8 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-[#0b5156]/20 transition-all hover:scale-[1.02]"
          >
            Nueva Recepción
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-8 rounded-3xl border border-slate-200 flex flex-col justify-between h-40 shadow-sm">
            <p className="text-sm font-black text-slate-500 uppercase tracking-widest">{stat.label}</p>
            <div>
              <strong className={`text-4xl font-black ${stat.color} tracking-tighter font-mono`}>{stat.value}</strong>
              <p className="text-sm font-bold text-slate-400 uppercase mt-2">{stat.desc}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="space-y-8">
        <section className="space-y-8">
          <article className="bg-white p-10 rounded-3xl border border-slate-200 shadow-sm space-y-8">
            <div className="space-y-2">
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Terminal de Recepción</h2>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Validación física y financiera de entrada a almacén.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
              <div className="space-y-3">
                <label className="text-sm font-black text-slate-500 uppercase tracking-widest block">Orden de Compra</label>
                <input value={purchaseOrder} onChange={(e) => setPurchaseOrder(e.target.value)} placeholder="Sin orden seleccionada" className="w-full bg-slate-50 border border-slate-200 px-5 py-4 rounded-2xl text-slate-800 font-black text-sm focus:outline-none focus:border-[#0b5156] uppercase transition-all" />
              </div>
              <div className="space-y-3">
                <label className="text-sm font-black text-slate-500 uppercase tracking-widest block">Producto a Recibir</label>
                <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)} className="w-full bg-slate-50 border border-slate-200 px-5 py-4 rounded-2xl text-slate-800 font-black text-xs focus:outline-none focus:border-[#0b5156] uppercase transition-all">
                  <option value="">Sin productos registrados</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>{product.nombre} (Stock: {product.stock || 0} | Costo: {money(product.costo_usd || product.costo)})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
              <div className="space-y-3">
                <label className="text-sm font-black text-slate-500 uppercase tracking-widest block">Costo Factura (USD)</label>
                <input type="number" value={invoiceCost} onChange={(e) => setInvoiceCost(e.target.value)} placeholder="0.00" className="w-full bg-slate-50 border border-slate-200 px-5 py-4 rounded-2xl text-slate-800 font-black text-sm focus:outline-none focus:border-[#0b5156] transition-all" />
              </div>
              <div className="space-y-3">
                <label className="text-sm font-black text-slate-500 uppercase tracking-widest block">Cantidad Recibida</label>
                <input type="number" value={receivedQty} onChange={(e) => setReceivedQty(e.target.value)} placeholder="0" className="w-full bg-slate-50 border border-slate-200 px-5 py-4 rounded-2xl text-slate-800 font-black text-sm focus:outline-none focus:border-[#0b5156] transition-all" />
              </div>
            </div>

            <div className="bg-[#bdafa1]/10 border border-[#bdafa1]/30 p-8 rounded-3xl relative overflow-hidden">
              <Calculator className="absolute top-[-10px] right-[-10px] text-[#0b5156]/5" size={100} />
              <div className="flex justify-between items-center relative z-10">
                <div className="space-y-1">
                  <p className="text-sm font-black text-[#0b5156] uppercase tracking-widest">Impacto CPP</p>
                  <p className="text-sm font-bold text-slate-500 uppercase">Nuevo Costo Promedio:</p>
                  <h3 className="text-4xl font-black text-[#0b5156] tracking-tighter font-mono">{money(newCost || averageCost)}</h3>
                </div>
                {Math.abs(costDifference) > 0 && (
                  <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 animate-in fade-in">
                    <AlertTriangle className="text-red-600" size={20} />
                    <div className="text-right">
                      <p className="text-sm font-black text-red-600 uppercase tracking-tight">Alerta de costo</p>
                      <p className="text-xs font-bold text-red-600/60 uppercase">Diferencia de {costDifference.toFixed(1)}% detectada.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex justify-end pt-4">
               <button 
                 onClick={handleProcessReception}
                 disabled={isProcessing}
                 className="bg-[#43584b] text-white px-10 py-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-[#2b3a31] transition-all shadow-lg shadow-[#43584b]/20 hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
               >
                 {isProcessing ? 'Procesando...' : 'Procesar Entrada'}
               </button>
            </div>
          </article>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
          <article className="xl:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-xl font-black text-slate-800 tracking-tighter uppercase">Hojas de Recepción</h2>
              <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-widest">Historial de entradas por OC</p>
            </div>
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/30">
                    <th className="py-5 px-8">Fecha</th>
                    <th className="py-5 px-6">Hoja</th>
                    <th className="py-5 px-6 text-center">Cantidad</th>
                    <th className="py-5 px-6 text-center">Costo CPP</th>
                    <th className="py-5 px-8 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {isLoading ? (
                    <tr><td colSpan={5} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cargando recepciones...</td></tr>
                  ) : receptions.length === 0 ? (
                    <tr><td colSpan={5} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">No hay recepciones registradas.</td></tr>
                  ) : receptions.map((item, i) => (
                    <tr key={i} className="group hover:bg-[#bdafa1]/5 transition-colors">
                      <td className="py-6 px-8 text-sm font-black text-slate-500 uppercase font-mono">{item.fecha || item.date}</td>
                      <td className="py-6 px-6 text-sm font-black text-slate-800 font-mono">{item.id || item.hoja_id}</td>
                      <td className="py-6 px-6 text-center text-sm font-black text-slate-800 font-mono">{item.cantidad || item.qty || 0}</td>
                      <td className="py-6 px-6 text-center text-sm font-black text-[#0b5156] font-mono">{money(item.costo || item.cost)}</td>
                      <td className="py-6 px-8 text-right"><span className="bg-slate-100 text-slate-700 text-xs font-black px-2 py-0.5 rounded uppercase border">{item.estado || 'Registrado'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <aside className="xl:col-span-1 space-y-8">
            <article className="bg-white p-8 rounded-3xl border border-[#0b5156]/20 shadow-sm space-y-4">
              <div className="flex items-center gap-3 text-[#0b5156]">
                <Target size={20} />
                <h4 className="text-lg font-black uppercase tracking-tight">Conciliación Fiscal</h4>
              </div>
              <p className="text-sm font-bold text-slate-500 uppercase leading-relaxed">
                {receptions.length > 0 ? 'Recepciones pendientes de conciliación según registros.' : 'No hay recepciones pendientes de conciliación.'}
              </p>
              <Link to="/compras/facturas" className="w-full bg-[#0b5156] text-white font-black py-4 rounded-2xl uppercase text-sm tracking-widest shadow-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.02]">
                Vincular Factura <ChevronRight size={14} />
              </Link>
            </article>
          </aside>
        </div>
      </div>

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

export default StockReception;
