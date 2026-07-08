import { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  ArrowLeft,
  Wallet,
  AlertTriangle,
  Clock,
  CheckCircle2,
  TrendingUp,
  BellRing,
  DollarSign,
  MonitorSmartphone
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';

const AccountsReceivable = () => {
  const [receivables, setReceivables] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [cxcData, kpiList] = await Promise.all([
        api.get<any[]>('/cobranzas/cuentas').catch(() => []),
        api.get<any[]>('/cobranzas/kpis').catch(() => [])
      ]);
      setReceivables(cxcData || []);
      setKpis(kpiList || []);
    } catch (err) {
      console.error("Error fetching accounts receivable:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredReceivables = useMemo(() => {
    if (!searchTerm.trim()) return receivables;
    const q = searchTerm.toLowerCase();
    return receivables.filter(r => 
      (r.cliente || '').toLowerCase().includes(q) || 
      (r.documento || '').toLowerCase().includes(q) || 
      (r.rif || '').toLowerCase().includes(q)
    );
  }, [receivables, searchTerm]);

  // Compute stats or fallback dynamically
  const displayKpis = kpis.length > 0 ? kpis.map(k => ({
    label: k.label,
    value: k.value,
    desc: k.desc,
    color: k.color === 'text-slate-800' ? 'text-koda-main' : k.color
  })) : [
    { label: 'Cartera Total', value: '$0.00', desc: 'Por cobrar a clientes', color: 'text-koda-main' },
    { label: 'Vencido (>30 días)', value: '$0.00', desc: 'Riesgo de incobrabilidad', color: 'text-red-600' },
    { label: 'A Cobrar (7 días)', value: '$0.00', desc: 'Flujo proyectado a corto plazo', color: 'text-amber-500' },
    { label: 'Cobrado (Mes)', value: '$0.00', desc: 'Ingresado a bancos', color: 'text-green-600' },
  ];

  // Check if any invoice is critical
  const criticalInvoice = receivables.find(r => r.estado === 'VENCIDA' || r.estado === 'Vencida');

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
           <Wallet size={120} className="text-koda-main" />
        </div>
        <div className="flex justify-between items-start mb-6 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <Link to="/tesoreria" className="bg-koda-main/10 text-koda-main text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-koda-main/20 transition-all">
                <ArrowLeft size={10} /> Volver a Tesorería
              </Link>
              <span className="bg-koda-main text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Gestión de Cobranzas
              </span>
            </div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Cuentas por Cobrar</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-3xl leading-relaxed">
              Control de facturas a crédito, antigüedad de saldos y proyección de liquidez de la empresa.
            </p>
          </div>
          <div className="flex gap-2">
             <button className="bg-white text-slate-500 px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 border border-slate-200 hover:bg-slate-50 transition-all tracking-widest shadow-sm">
                <Clock size={14} /> Antigüedad Saldos
             </button>
             <button className="bg-koda-main text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-koda-mainHover transition-all tracking-widest">
                <DollarSign size={16} /> Registrar Pago
             </button>
          </div>
        </div>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {displayKpis.map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-36 group hover:border-koda-main/30 transition-all">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest group-hover:text-koda-main transition-colors">{stat.label}</p>
            <div className="space-y-1">
              <strong className={`text-3xl font-black ${stat.color} tracking-tighter font-mono`}>{stat.value}</strong>
              <p className="text-sm font-bold text-slate-400 uppercase leading-tight">{stat.desc}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Main Table */}
        <article className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
           <div className="flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Cartera Activa</h3>
              <div className="flex gap-3">
                 <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input 
                      type="text" 
                      placeholder="Cliente o Factura..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-koda-main w-64"
                    />
                 </div>
                 <button className="p-2 bg-slate-50 text-slate-400 rounded-xl border border-slate-200 hover:bg-white transition-all"><Filter size={14} /></button>
              </div>
           </div>

           <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                 <thead>
                    <tr className="text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                       <th className="py-4 px-6">Cliente</th>
                       <th className="py-4 px-4 text-center">Origen</th>
                       <th className="py-4 px-4 text-center">Vencimiento</th>
                       <th className="py-4 px-4 text-right">Total Fac.</th>
                       <th className="py-4 px-4 text-right">Saldo Pend.</th>
                       <th className="py-4 px-4 text-center">Estado</th>
                       <th className="py-4 px-6 text-right">Acción</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {isLoading ? (
                      <tr>
                         <td colSpan={7} className="py-10 text-center text-slate-400 font-bold uppercase text-xs">
                            Cargando cartera...
                         </td>
                      </tr>
                    ) : filteredReceivables.length > 0 ? (
                      filteredReceivables.map((r, i) => (
                        <tr key={i} className="group hover:bg-slate-50 transition-colors">
                           <td className="py-5 px-6">
                              <div className="flex flex-col">
                                 <span className="text-xs font-black text-slate-800 uppercase">{r.cliente}</span>
                                 <div className="flex gap-2 items-center">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase">{r.rif}</span>
                                    <span className="text-[9px] font-black text-koda-main uppercase bg-koda-main/10 px-1 rounded">{r.documento}</span>
                                 </div>
                              </div>
                           </td>
                           <td className="py-5 px-4 text-center">
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Venta</span>
                           </td>
                           <td className="py-5 px-4 text-center text-xs font-bold text-slate-600 font-mono">{r.fecha_vencimiento}</td>
                           <td className="py-5 px-4 text-right text-xs font-bold text-slate-500 font-mono">${Number(r.monto_total).toFixed(2)}</td>
                           <td className="py-5 px-4 text-right text-sm font-black text-slate-800 font-mono">${Number(r.saldo).toFixed(2)}</td>
                           <td className="py-5 px-4 text-center">
                              <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter ${r.estado === 'PAGADA' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{r.estado}</span>
                           </td>
                           <td className="py-5 px-6 text-right">
                              <button className="bg-slate-50 text-slate-500 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border border-slate-200 hover:bg-white transition-all">
                                 Abonar
                              </button>
                           </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                         <td colSpan={7} className="py-10 text-center text-slate-400 font-bold uppercase text-xs">
                            No hay cuentas por cobrar activas.
                         </td>
                      </tr>
                    )}
                 </tbody>
              </table>
           </div>
        </article>

        {/* Collection Sidebar */}
        <aside className="space-y-6">
           {criticalInvoice ? (
             <article className="bg-red-500 p-8 rounded-3xl text-white shadow-xl relative overflow-hidden group">
                <AlertTriangle size={140} className="absolute -bottom-6 -right-6 opacity-10 group-hover:scale-110 transition-transform" />
                <div className="relative z-10 space-y-4">
                   <div className="flex items-center gap-2">
                      <BellRing size={20} className="text-white" />
                      <h3 className="text-lg font-black uppercase tracking-tight">Riesgo de Cartera</h3>
                   </div>
                   <div className="space-y-2">
                      <p className="text-sm font-bold uppercase leading-relaxed opacity-90">
                         El cliente <strong>{criticalInvoice.cliente}</strong> presenta un atraso por un saldo de ${Number(criticalInvoice.saldo).toFixed(2)}.
                      </p>
                   </div>
                   <button className="w-full bg-white text-red-600 font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-lg hover:scale-105 transition-all">
                      Bloquear Crédito
                   </button>
                </div>
             </article>
           ) : (
             <article className="bg-green-600 p-8 rounded-3xl text-white shadow-xl relative overflow-hidden group">
                <CheckCircle2 size={140} className="absolute -bottom-6 -right-6 opacity-10 group-hover:scale-110 transition-transform" />
                <div className="relative z-10 space-y-4">
                   <div className="flex items-center gap-2">
                      <CheckCircle2 size={20} className="text-white" />
                      <h3 className="text-lg font-black uppercase tracking-tight">Cartera Sana</h3>
                   </div>
                   <div className="space-y-2">
                      <p className="text-sm font-bold uppercase leading-relaxed opacity-90">
                         No se detectan clientes críticos o con mora vencida actualmente en el sistema.
                      </p>
                   </div>
                </div>
             </article>
           )}

           <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                 <TrendingUp size={20} className="text-koda-main" /> Proyección Semanal
              </h3>
              <div className="space-y-4">
                 <div className="p-4 bg-green-50 border border-green-100 rounded-2xl flex justify-between items-center">
                    <span className="text-xs font-black text-green-800 uppercase">Ingresos Estimados</span>
                    <strong className="text-lg font-black text-green-600 font-mono">
                      ${receivables.reduce((acc, curr) => acc + (curr.estado !== 'PAGADA' ? curr.saldo : 0), 0).toFixed(2)}
                    </strong>
                 </div>
                 <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed text-center">
                    Basado en facturas con vencimiento activo en cartera.
                 </p>
              </div>
           </article>
        </aside>
      </div>
    </div>
  );
};

export default AccountsReceivable;