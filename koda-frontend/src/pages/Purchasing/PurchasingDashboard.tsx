import { useState, useEffect } from 'react';
import { 
  ShoppingCart, 
  TrendingUp, 
  Clock, 
  AlertCircle, 
  Users, 
  Plus, 
  BookOpen, 
  Search,
  Package,
  FileText,
  ShieldAlert,
  ArrowRight,
  Eye,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { api } from '@/api/client';

const PurchasingDashboard = () => {
  const [showTrace, setShowTrace] = useState(false);
  const [selectedOC, setSelectedOC] = useState('');
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [compras, setCompras] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [provRes, comprasRes, dashboardRes] = await Promise.all([
          api.get<any[]>('/proveedores'),
          api.get<any[]>('/compras/historial'),
          api.get<any>('/compras/dashboard')
        ]);
        setProveedores(provRes || []);
        setCompras(comprasRes || []);
        setDashboard(dashboardRes || null);
      } catch (error) {
        console.error("Error fetching purchasing data", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const purchaseHistory = compras;

  const metrics = dashboard?.metricas || [];
  
  const pendingOrdersMetric = metrics.find((m: any) => m.t === 'Órdenes Pendientes' || m.desc === 'Por aprobar');
  const pendingOrdersCount = pendingOrdersMetric && !isNaN(Number(pendingOrdersMetric.v)) ? Number(pendingOrdersMetric.v) : 0;

  const distribucionGastos = dashboard?.distribucion || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Dashboard de Abastecimiento</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-2xl">
              Control de gastos operativos, órdenes en tránsito y gestión de proveedores estratégicos.
            </p>
          </div>
          <div className="flex gap-3">
             <button className="bg-white text-slate-500 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 flex items-center gap-2 tracking-widest shadow-sm hover:bg-slate-50">
               <BookOpen size={14} /> Manual de Compras
             </button>
             <Link to="/compras/proveedores" className="bg-white text-[#0b5156] px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 tracking-widest shadow-sm hover:bg-green-50">
               <Users size={14} /> Proveedores
             </Link>
             <Link to="ordenes/nueva" className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 tracking-widest shadow-lg shadow-green-900/20 hover:bg-[#083a3d]">
               <Plus size={16} /> Nueva Orden de Compra
             </Link>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Columna Izquierda (2/3 de ancho) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Métricas Compactas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {metrics.map((kpi: any, i: number) => (
              <div key={i} className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-20">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider truncate">{kpi.t || kpi.etiqueta}</p>
                <div>
                  <strong className={`text-lg font-black ${kpi.c || 'text-slate-800'} tracking-tighter font-mono`}>{kpi.v || kpi.valor}</strong>
                  <p className={`text-[8px] font-bold ${kpi.tc || 'text-slate-400'} uppercase mt-0.5 truncate`}>{kpi.desc || kpi.descripcion}</p>
                </div>
              </div>
            ))}
            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-20">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider truncate">Proveedores</p>
              <div>
                <strong className="text-lg font-black text-[#0b5156] tracking-tighter font-mono">{proveedores.length}</strong>
                <p className="text-[8px] font-bold text-slate-400 uppercase mt-0.5 truncate">En directorio</p>
              </div>
            </div>
          </div>

          {/* Distribución de Gastos */}
          <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-xl font-black text-slate-800 tracking-tighter uppercase">Distribución de Gastos</h2>
                <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">Categorización del gasto del período</p>
              </div>
            </div>
            <div className="space-y-6">
               {distribucionGastos.map((item: any, i: number) => (
                 <div key={i}>
                    <div className="flex justify-between items-center mb-2">
                       <span className="text-xs font-black text-slate-500 uppercase tracking-tight">{item.label || item.etiqueta}</span>
                       <div className="flex items-center gap-3">
                         <span className="text-[10px] font-bold text-slate-400 uppercase">{item.pct ?? 0}%</span>
                         <strong className="text-sm font-black text-slate-800">{item.valor}</strong>
                       </div>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                       <div className={`h-full ${item.color || 'bg-[#0b5156]'} rounded-full transition-all duration-700`} style={{ width: `${item.pct ?? 0}%` }}></div>
                    </div>
                 </div>
               ))}
            </div>
          </article>
        </div>

        <aside className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
           <div>
              <h2 className="text-xl font-black text-slate-800 tracking-tighter uppercase">Gestión Operativa</h2>
              <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">Accesos rápidos y alertas</p>
           </div>
           
           {pendingOrdersCount > 0 ? (
              <div className="flex items-center gap-3 p-4 bg-amber-50/50 border border-amber-200 rounded-2xl text-xs font-bold text-amber-700">
                 <AlertCircle size={16} className="shrink-0 text-amber-600 animate-pulse" />
                 <span>Alerta: Tienes {pendingOrdersCount} orden{pendingOrdersCount === 1 ? '' : 'es'} pendiente{pendingOrdersCount === 1 ? '' : 's'} por aprobar.</span>
              </div>
           ) : (
              <div className="flex items-center gap-3 p-4 bg-green-50/50 border border-green-100 rounded-2xl text-xs font-bold text-green-700">
                 <CheckCircle2 size={16} className="shrink-0 text-green-600 animate-pulse" />
                 <span>Operativa Limpia: Sin alertas pendientes.</span>
              </div>
           )}

           <div className="space-y-3 pt-2">
              <Link to="/compras/requisiciones" className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-4 group cursor-pointer hover:border-[#0b5156]/30 transition-all">
                 <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                    <FileText size={18} className="text-[#0b5156]" />
                 </div>
                 <div>
                    <strong className="text-xs font-black text-slate-800 uppercase block">Requisiciones</strong>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Solicitudes de compras</span>
                 </div>
              </Link>
              
              <Link to="/compras/recepcion" className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-4 group cursor-pointer hover:border-[#0b5156]/30 transition-all">
                 <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                    <Package size={18} className="text-amber-500" />
                 </div>
                 <div>
                    <strong className="text-xs font-black text-slate-800 uppercase block">Recibir Mercancía</strong>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Ingresos a inventario</span>
                 </div>
              </Link>
           </div>
        </aside>
      </div>

      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
           <div>
              <h2 className="text-xl font-black text-slate-800 tracking-tighter uppercase">Historial de Compras (Trazabilidad 360)</h2>
              <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">Auditoría completa del ciclo de vida de cada transacción</p>
           </div>
           <Link to="/compras/ordenes" className="bg-white text-[#0b5156] px-6 py-2 rounded-xl text-xs font-black uppercase border border-slate-200 tracking-widest">Ver Todas</Link>
        </div>
        <div className="overflow-x-auto no-scrollbar">
           <table className="w-full text-left">
              <thead>
                 <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">
                    <th className="py-4 px-8">Fecha</th>
                    <th className="py-4 px-6">N° Orden</th>
                    <th className="py-4 px-6">Proveedor</th>
                    <th className="py-4 px-6 text-right">Monto Total</th>
                    <th className="py-4 px-6 text-center">Ciclo de Auditoría</th>
                    <th className="py-4 px-8 text-right">Acción</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                 {isLoading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                        Cargando historial...
                      </td>
                    </tr>
                 ) : purchaseHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                        No hay historial de compras registrado en el sistema.
                      </td>
                    </tr>
                 ) : (
                   purchaseHistory.map((oc, i) => (
                     <tr key={i} className="group hover:bg-slate-50/80 transition-colors">
                        <td className="py-5 px-8 text-xs font-bold text-slate-400 uppercase">{oc.date || oc.fecha}</td>
                        <td className="py-5 px-6 font-black text-slate-800">{oc.id || oc.numero_orden}</td>
                        <td className="py-5 px-6 text-xs font-black text-[#0b5156] uppercase">{oc.vendor || oc.proveedor}</td>
                        <td className="py-5 px-6 text-right font-black text-slate-800">{oc.amount || `$${Number(oc.total || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`}</td>
                        <td className="py-5 px-6">
                           <div className="flex justify-center gap-1.5">
                              {(oc.steps || ['ok', 'ok', 'ok', 'ok', 'warning', 'error']).map((s: string, idx: number) => (
                                <div 
                                  key={idx} 
                                  className={`w-2 h-2 rounded-full ${s === 'ok' ? 'bg-green-500' : s === 'error' ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]' : 'bg-amber-400'}`}
                                  title={`Nodo ${idx + 1}`}
                                ></div>
                              ))}
                           </div>
                        </td>
                        <td className="py-5 px-8 text-right">
                           <button 
                             onClick={() => { setSelectedOC(oc.id || oc.numero_orden); setShowTrace(true); }}
                             className="bg-[#bdafa1]/10 text-[#0b5156] px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border border-[#0b5156]/10 hover:bg-[#0b5156] hover:text-white transition-all"
                           >
                              Ver 360
                           </button>
                        </td>
                     </tr>
                   ))
                 )}
              </tbody>
           </table>
        </div>
      </section>

      {/* MODAL DE TRAZABILIDAD 360 */}
      {showTrace && (
        <div className="fixed inset-0 bg-[#0b5156]/90 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl p-10 relative animate-in zoom-in-95 duration-300">
              <button 
                onClick={() => setShowTrace(false)}
                className="absolute top-8 right-8 text-slate-400 hover:text-slate-800 transition-colors"
              >
                 <XCircle size={32} strokeWidth={1.5} />
              </button>

              <div className="space-y-2 mb-10">
                 <h3 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">Trazabilidad 360 - {selectedOC}</h3>
                 <p className="text-slate-400 text-sm font-bold uppercase tracking-tight">Flujo documental y cumplimiento de control interno</p>
              </div>

              <div className="relative py-10 px-4">
                 <div className="absolute top-[3.75rem] left-8 right-8 h-1 bg-white z-0"></div>
                 <div className="flex justify-between relative z-10">
                    {[
                      { label: 'Requisición', sub: 'RQ-4402', status: 'ok', icon: FileText },
                      { label: 'Orden Compra', sub: selectedOC, status: 'ok', icon: ShoppingCart },
                      { label: 'Recepción', sub: 'REC-128', status: 'ok', icon: Package },
                      { label: 'Factura Prov.', sub: 'F-99821', status: 'ok', icon: FileText },
                      { label: 'Retención', sub: 'MISSING', status: 'error', icon: ShieldAlert },
                      { label: 'Pago Final', sub: 'PENDING', status: 'warning', icon: TrendingUp },
                    ].map((step, i) => (
                      <div key={i} className="flex flex-col items-center gap-4 flex-1">
                         <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all ${
                           step.status === 'ok' ? 'bg-green-500 text-white' : 
                           step.status === 'error' ? 'bg-red-500 text-white animate-pulse' : 
                           'bg-amber-400 text-white'
                         }`}>
                            <step.icon size={20} />
                         </div>
                         <div className="text-center">
                            <p className="text-xs font-black text-slate-800 uppercase tracking-tighter mb-0.5">{step.label}</p>
                            <p className={`text-[9px] font-bold uppercase ${step.status === 'error' ? 'text-red-600' : 'text-slate-400'}`}>{step.sub}</p>
                         </div>
                      </div>
                    ))}
                 </div>
              </div>

              <div className="mt-10 p-6 bg-red-50 rounded-3xl border border-red-100 flex gap-4 items-start">
                 <AlertCircle className="text-red-600 shrink-0" size={24} />
                 <p className="text-xs font-bold text-red-900 leading-relaxed uppercase tracking-tight">
                    🚨 <strong className="font-black">ALERTA DE RIESGO FISCAL:</strong> Esta compra tiene una factura registrada pero <span className="underline">NO se ha generado el comprobante de retención de IVA</span>. El SENIAT puede sancionar este incumplimiento en una auditoría inmediata.
                 </p>
              </div>

              <div className="mt-8 flex justify-end">
                 <button 
                   onClick={() => setShowTrace(false)}
                   className="bg-[#0b5156] text-white px-10 py-5 rounded-3xl text-sm font-black uppercase tracking-widest shadow-xl shadow-[#0b5156]/30 hover:scale-105 transition-all"
                 >
                    Entendido, Corregir Ahora
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default PurchasingDashboard;
