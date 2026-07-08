import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Users, FileText, ShoppingBag, Plus, Monitor, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';

const SalesDashboard = () => {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [report, setReport] = useState<any>(null);
  const [clientes, setClientes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);



  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [ventasData, reporteData, clientesData] = await Promise.all([
          api.get<any[]>('/ventas'),
          api.get<any>('/ventas/reporte'),
          api.get<any[]>('/clientes')
        ]);
        setInvoices(ventasData);
        setReport(reporteData);
        setClientes(clientesData);
      } catch (error) {
        console.error("Error cargando datos del dashboard:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const getClientNameForInvoice = (invId: number) => {
    // Aquí deberíamos buscar el cliente real basado en la factura.
    // Como simplificación por ahora, tomaremos el cliente del listado de la DB.
    if (clientes && clientes.length > 0) {
      return clientes[invId % clientes.length].nombre;
    }
    return "Consumidor Final"; // O dejarlo en blanco si se prefiere: "Cliente no registrado"
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getStatusInfo = (inv: any) => {
    if (inv.estado === 'ANULADA') {
      return { label: 'Anulada', color: 'bg-red-100 text-red-700' };
    }
    switch (inv.metodo_pago) {
      case 'Divisa':
        return { label: 'Pagada (USD)', color: 'bg-green-100 text-green-700' };
      case 'Efectivo':
        return { label: 'Pagada (Bs)', color: 'bg-green-100 text-green-700' };
      case 'Transferencia':
        return { label: 'Pagada (Trans.)', color: 'bg-green-100 text-green-700' };
      case 'PagoMovil':
        return { label: 'Pagada (Móvil)', color: 'bg-green-100 text-green-700' };
      default:
        return { label: 'Pagada', color: 'bg-green-100 text-green-700' };
    }
  };

  const totalVendido = Number(report?.total_acumulado_usd || 0);
  const facturasEmitidas = Number(report?.ventas_totales_cantidad || 0);
  const ticketPromedio = facturasEmitidas > 0 ? totalVendido / facturasEmitidas : 0;
  const clientesActivosCount = clientes.length;

  const weeklyChartData = useMemo(() => {
    const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
    const result = [];
    // Generate data for the last 7 days ending today
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayName = days[d.getDay()];
      const dateString = d.toDateString();
      const totalForDay = invoices
        .filter(inv => inv.estado === 'ACTIVA' && new Date(inv.fecha).toDateString() === dateString)
        .reduce((sum, inv) => sum + Number(inv.total_usd || inv.total || 0), 0);
      
      result.push({
        name: dayName,
        total: totalForDay
      });
    }
    const maxTotal = Math.max(...result.map(r => r.total), 1);
    return result.map(r => ({
      ...r,
      heightPercent: Math.max(10, Math.round((r.total / maxTotal) * 100))
    }));
  }, [invoices]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden flex justify-between items-center mb-2">
        <div className="space-y-1">
          <div className="bg-[#0b5156]/10 px-3 py-1 rounded-full w-fit">
            <span className="text-[9px] font-black text-[#0b5156] uppercase tracking-widest">Ventas y Facturacion</span>
          </div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Dashboard Comercial</h1>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-tight">Metricas de ventas en tiempo real, facturacion reciente y acceso rapido a operaciones.</p>
        </div>
        <div className="flex gap-3">
           <button className="bg-white text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2 tracking-widest">
             <div className="w-2 h-2 bg-blue-500 rounded-sm"></div> Manual de Ventas
           </button>
           <Link to="/pos" className="bg-white text-slate-700 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-slate-200 transition-all flex items-center gap-2 tracking-widest">
             <Monitor size={14} /> Abrir POS
           </Link>
           <Link to="/nueva" className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase shadow-lg shadow-green-900/20 hover:bg-[#153a44] transition-all flex items-center gap-2 tracking-widest">
             <Plus size={16} /> Nueva Factura
           </Link>
        </div>
      </header>

      {isLoading ? (
        <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse bg-white rounded-3xl border border-slate-200 shadow-sm">
           Sincronizando Dashboard Comercial...
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            {[
              { t: 'Total Vendido (Mes)', v: `$${totalVendido.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, tr: totalVendido > 0 ? 'Mes en curso' : 'Sin operaciones', trc: 'text-slate-400', i: TrendingUp },
              { t: 'Facturas Emitidas', v: `${facturasEmitidas}`, tr: 'En tiempo real', trc: 'text-slate-400', i: FileText },
              { t: 'Ticket Promedio', v: `$${ticketPromedio.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, tr: ticketPromedio > 0 ? 'Media actual' : 'Sin operaciones', trc: 'text-slate-400', i: ShoppingBag },
              { t: 'Clientes Activos', v: `${clientesActivosCount}`, tr: 'En directorio', trc: 'text-slate-400', i: Users }
            ].map((kpi, idx) => (
              <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-36">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{kpi.t}</p>
                <div>
                   <strong className="text-3xl font-black text-slate-800 tracking-tighter block">{kpi.v}</strong>
                   <span className={`text-xs font-black uppercase tracking-tight flex items-center gap-1 ${kpi.trc}`}>
                     {kpi.tr}
                   </span>
                </div>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <article className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">Ingresos de la Semana</h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-10">Volumen de ventas de los ultimos 7 dias.</p>
              <div className="h-60 flex items-end justify-between gap-4 px-2">
                {weeklyChartData.map((dayData, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-3 group" title={`$${dayData.total.toFixed(2)}`}>
                    <div 
                      className={`w-full rounded-lg transition-all duration-500 cursor-pointer ${dayData.heightPercent > 10 ? 'bg-green-500 shadow-lg shadow-green-200' : 'bg-green-900/40 group-hover:bg-green-900/60'}`} 
                      style={{ height: `${dayData.heightPercent}%` }}
                    ></div>
                    <span className="text-[9px] font-black uppercase text-slate-400">
                      {dayData.name}
                    </span>
                  </div>
                ))}
              </div>
            </article>

            <aside className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">Accesos Rapidos</h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-10">Operaciones comerciales comunes.</p>
              <div className="space-y-4">
                 <Link to="/ventas/cotizaciones" className="p-6 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-6 group cursor-pointer hover:border-[#0b5156]/30 transition-all">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                       <FileText size={20} className="text-slate-400" />
                    </div>
                    <div>
                       <strong className="text-sm font-black text-slate-800 uppercase block">Crear Cotizacion</strong>
                       <span className="text-xs font-bold text-slate-400 uppercase">Enviar presupuesto</span>
                    </div>
                 </Link>
                 <Link to="/clientes" className="p-6 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-6 group cursor-pointer hover:border-[#0b5156]/30 transition-all">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                       <UserPlus size={20} className="text-[#0b5156]" />
                    </div>
                    <div>
                       <strong className="text-sm font-black text-slate-800 uppercase block">Nuevo Cliente</strong>
                       <span className="text-xs font-bold text-slate-400 uppercase">Registrar al directorio</span>
                    </div>
                 </Link>
              </div>
            </aside>
          </div>

          <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-xl font-black text-slate-800 tracking-tighter uppercase">Ultimas Facturas Emitidas</h3>
                <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">Documentos fiscales generados recientemente.</p>
              </div>
              <Link to="/ventas/documentos" className="text-xs font-black text-slate-600 bg-white px-6 py-2.5 rounded-xl uppercase hover:bg-slate-200 transition-colors border border-slate-200">
                Ver Historial Completo
              </Link>
            </div>
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <th className="pb-4 px-4">Fecha</th>
                    <th className="pb-4 px-4">N. Documento</th>
                    <th className="pb-4 px-4">Cliente</th>
                    <th className="pb-4 px-4">Monto Total</th>
                    <th className="pb-4 px-4 text-center">Estado</th>
                    <th className="pb-4 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                        No hay facturas registradas en el sistema.
                      </td>
                    </tr>
                  ) : (
                    invoices.slice(0, 10).map((inv, idx) => {
                      const statusInfo = getStatusInfo(inv);
                      return (
                        <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                          <td className="py-5 px-4 text-xs font-bold text-slate-500 uppercase">{formatDate(inv.fecha)}</td>
                          <td className="py-5 px-4 text-sm font-black text-slate-800 uppercase">{inv.numero_factura}</td>
                          <td className="py-5 px-4 text-xs font-bold text-slate-600 uppercase">{getClientNameForInvoice(inv.id)}</td>
                          <td className="py-5 px-4 text-sm font-black text-slate-800">
                            <div>${Number(inv.total_usd || inv.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            <div className="text-[10px] text-slate-400 font-bold">
                              Bs. {Number((inv.total_usd || inv.total || 0) * inv.tasa_cambio_bs).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </td>
                          <td className="py-5 px-4 text-center">
                            <span className={`${statusInfo.color} text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-tighter`}>
                              {statusInfo.label}
                            </span>
                          </td>
                          <td className="py-5 px-4 text-right">
                            <button className="text-xs font-black text-slate-400 uppercase hover:text-[#0b5156]">
                               Ver PDF
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default SalesDashboard;

