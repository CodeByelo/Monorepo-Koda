import { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  ShieldAlert, 
  Wallet,
  Activity, 
  Users, 
  Target,
  UserCheck,
  FileSearch,
  LayoutDashboard
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/api/client';

const AccountsReceivable = () => {
  const navigate = useNavigate();
  const [kpis, setKpis] = useState<any[]>([]);
  const [criticalInvoices, setCriticalInvoices] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [agingStats, setAgingStats] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showIntelligence, setShowIntelligence] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [kpisData, criticalData, clientsData, agingData] = await Promise.all([
        api.get<any[]>('/cobranzas/kpis').catch(() => []),
        api.get<any[]>('/cobranzas/criticas').catch(() => []),
        api.get<any[]>('/cobranzas/cartera').catch(() => []),
        api.get<any[]>('/cobranzas/antiguedad').catch(() => [])
      ]);
      
      setKpis(kpisData || []);
      setCriticalInvoices(criticalData || []);
      setClients(clientsData || []);
      setAgingStats(agingData || []);
    } catch (error) {
      console.error("Error fetching collections data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return clients;
    const q = searchQuery.toLowerCase();
    return clients.filter(c => 
      (c.name || c.nombre || '').toLowerCase().includes(q) ||
      (c.id || c.rif || '').toLowerCase().includes(q)
    );
  }, [clients, searchQuery]);

  const quickActions = [
    { t: 'Registrar cobro', d: 'Aplicar pago total o parcial.', i: <Wallet size={20} />, link: '/cobranzas/aplicar' },
    { t: 'Revisar ficha de cliente', d: 'Ver historial y crédito.', i: <UserCheck size={20} />, link: '/clientes' },
    { t: 'Ver facturas', d: 'Consultar documentos emitidos.', i: <FileSearch size={20} />, link: '/historial' },
    { t: 'Centro de Cobranza', d: 'Resumen general.', i: <LayoutDashboard size={20} />, link: '/cobranzas' },
  ];

  const criticalCount = criticalInvoices.length;
  const pendingPayments = clients.filter(c => c.status === 'MORA').length;

  const priorities = [
    { type: 'CRÍTICO', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100', t: criticalCount > 0 ? `${criticalCount} cliente(s) con vencimiento crítico` : 'Sin clientes en mora', d: criticalCount > 0 ? 'Prioriza saldos altos.' : 'Cartera al día.', i: <Users size={18} />, link: '/cobranzas/antiguedad' },
    { type: 'HOY', color: 'text-slate-400', bg: 'bg-[#998d7b]/5', border: 'border-[#998d7b]/10', t: criticalInvoices.length > 0 ? `${criticalInvoices.length} factura(s) requieren atención` : 'Sin facturas vencidas', d: criticalInvoices.length > 0 ? 'Contactar antes del cierre.' : 'Todo al corriente.', i: <Target size={18} />, link: '/cobranzas/antiguedad' },
    { type: 'PAGOS', color: 'text-[#0b5156]', bg: 'bg-[#0b5156]/5', border: 'border-[#0b5156]/10', t: pendingPayments > 0 ? `${pendingPayments} pago(s) requieren aplicación` : 'Sin pagos pendientes', d: pendingPayments > 0 ? 'Hay cobros sin conciliar.' : 'Cobros conciliados.', i: <Wallet size={18} />, link: '/cobranzas/aplicar' },
    { type: 'CRÉDITO', color: 'text-[#43584b]', bg: 'bg-[#43584b]/5', border: 'border-[#43584b]/10', t: clients.length > 0 ? `${clients.length} cliente(s) en cartera` : 'Sin cupo comprometido', d: clients.length > 0 ? 'Revisar deuda abierta.' : 'Sin deuda registrada.', i: <ShieldAlert size={18} />, link: '/cobranzas/cartera' },
  ];

  const displayKpis = kpis;

  const displayAging = agingStats.map(s => ({
    label: s.rango || s.label || s.etiqueta,
    value: s.monto !== undefined ? `$${Number(s.monto).toFixed(2)}` : (s.value || s.valor || '$0.00'),
    desc: s.pct !== undefined ? `${s.pct}% del total` : (s.desc || s.descripcion || 'Sin vencimiento'),
    color: (s.rango || '').includes('15') || (s.rango || '').includes('+') ? 'text-red-600' : 'text-[#43584b]'
  }));

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
               <span className="bg-[#0b5156]/10 text-[#0b5156] text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest border border-[#0b5156]/20">
                 Operación Cobranzas
               </span>
               <span className="bg-[#43584b]/10 text-[#43584b] text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest border border-[#43584b]/20">
                 Fiscal Year {new Date().getFullYear()}
               </span>
            </div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">Cartera de Clientes</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Panel de control de activos líquidos y gestión de mora.</p>
          </div>
          <div className="flex gap-4">
             <div className="grid grid-cols-4 gap-4 items-start">
                {displayKpis.map((kpi, i) => (
                  <div key={i} className="text-right px-4 border-r border-slate-100 last:border-0">
                     <p className="text-xs font-black text-slate-500 uppercase tracking-widest">{kpi.label || kpi.etiqueta}</p>
                     <p className={`text-xl font-black ${kpi.color || 'text-slate-800'} font-mono tracking-tighter`}>{kpi.value || kpi.valor}</p>
                     <p className="text-[10px] font-bold text-slate-400 uppercase">{kpi.desc || kpi.descripcion}</p>
                  </div>
                ))}
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start pt-6 border-t border-slate-100">
           {quickActions.map((action, i) => (
             <Link to={action.link} key={i} className="p-4 rounded-2xl bg-[#bdafa1]/5 border border-[#bdafa1]/20 hover:border-[#0b5156]/40 transition-all cursor-pointer group block">
                <div className="flex items-center gap-3">
                   <div className="text-[#0b5156] group-hover:scale-110 transition-transform">{action.i}</div>
                   <div>
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight">{action.t}</h4>
                      <p className="text-xs font-bold text-slate-500 uppercase">{action.d}</p>
                   </div>
                </div>
             </Link>
           ))}
        </div>
      </header>

      <div className="space-y-6">
        <section className="space-y-6 w-full">
          <article className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-8">
             <div className="space-y-1">
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Prioridades de cobro</h3>
                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Documentos críticos que requieren atención inmediata.</p>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                {priorities.map((p, i) => (
                  <Link 
                    to={p.link}
                    key={i} 
                    className={`p-6 rounded-3xl border ${p.border} ${p.bg} space-y-3 group hover:scale-[1.01] hover:shadow-md transition-all cursor-pointer block`}
                  >
                     <div className="flex justify-between items-center">
                        <span className={`text-xs font-black px-2 py-0.5 rounded-full uppercase border border-current/20 ${p.color}`}>{p.type}</span>
                        <div className={`${p.color} opacity-40 group-hover:opacity-100 transition-opacity`}>{p.i}</div>
                     </div>
                     <div>
                        <h4 className="text-sm font-black text-slate-800 uppercase">{p.t}</h4>
                        <p className="text-sm font-bold text-slate-500 uppercase">{p.d}</p>
                     </div>
                  </Link>
                ))}
             </div>
          </article>

          {/* Aging Horizontal */}
          <article className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
             <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Aging de saldos</h3>
             <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                 {displayAging.map((stat, i) => (
                   <div key={i} className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex justify-between items-center">
                      <div className="space-y-1">
                         <h4 className="text-xs font-black text-slate-800 uppercase leading-tight">{stat.label}</h4>
                         <p className="text-[10px] font-bold text-slate-500 uppercase">{stat.desc}</p>
                      </div>
                      <span className={`text-sm font-black ${stat.color || 'text-slate-800'} font-mono`}>{stat.value}</span>
                   </div>
                 ))}
             </div>
          </article>

          {/* Inteligencia Toggle */}
          <div className="flex justify-start">
             <button 
                onClick={() => setShowIntelligence(!showIntelligence)}
                className="flex items-center gap-2 bg-[#0b5156]/5 text-[#0b5156] px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border border-[#0b5156]/20 hover:bg-[#0b5156]/10 transition-all"
             >
                <ShieldAlert size={14} />
                {showIntelligence ? 'Ocultar Inteligencia de Cobro' : 'Ver Inteligencia de Cobro'}
             </button>
          </div>

          {showIntelligence && (
             <article className="bg-[#0b5156]/5 p-6 rounded-2xl border border-[#0b5156]/20 shadow-sm space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-2 mb-4">
                   <div className="w-2 h-2 rounded-full bg-[#0b5156] animate-pulse"></div>
                   <h3 className="text-sm font-black text-[#0b5156] uppercase tracking-tight">Análisis Inteligente</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   {[
                     { t: 'Concentración de riesgo', d: criticalInvoices.length > 0 ? `${criticalInvoices.length} factura(s) requieren atención prioritaria.` : 'Sin concentración de riesgo detectada.', i: <Users size={16} className="text-[#0b5156]" /> },
                     { t: 'Estrategia de flujo', d: clients.length > 0 ? 'Prioriza facturas con mayor antigüedad.' : 'Sin facturas activas en cartera.', i: <Activity size={16} className="text-[#0b5156]" /> },
                     { t: 'Validación SHA-256', d: 'Integridad de documentos garantizada.', i: <ShieldAlert size={16} className="text-[#0b5156]" /> }
                   ].map((item, i) => (
                     <div key={i} className="flex gap-3 items-start">
                        <div className="p-2 bg-white rounded-lg text-[#0b5156] border border-[#0b5156]/10 shadow-sm">
                           {item.i}
                        </div>
                        <div>
                           <h4 className="text-xs font-black text-slate-800 uppercase leading-tight">{item.t}</h4>
                           <p className="text-[10px] font-bold text-slate-500 uppercase leading-relaxed mt-1">{item.d}</p>
                        </div>
                     </div>
                   ))}
                </div>
             </article>
          )}

          <article className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
             <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Facturas críticas</h3>
                <span className="text-sm font-black text-[#0b5156] bg-[#0b5156]/5 px-3 py-1 rounded-full border border-[#0b5156]/10">AUDITORÍA ACTIVA</span>
             </div>
             <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left">
                   <thead>
                      <tr className="text-xs font-black text-slate-500 uppercase border-b border-slate-100 bg-slate-50/50">
                         <th className="py-4 px-6">ID DOCUMENTO</th>
                         <th className="py-4 px-4">ENTIDAD CLIENTE</th>
                         <th className="py-4 px-4 text-center">FECHA LÍMITE</th>
                         <th className="py-4 px-4 text-right">SALDO PENDIENTE</th>
                         <th className="py-4 px-4 text-center">ESTADO FISCAL</th>
                         <th className="py-4 px-6 text-right">OPERACIÓN</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                      {isLoading ? (
                        <tr>
                           <td colSpan={6} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cargando...</td>
                        </tr>
                      ) : criticalInvoices.length > 0 ? criticalInvoices.map((inv, i) => (
                        <tr key={i} className="group hover:bg-[#bdafa1]/5 transition-colors">
                           <td className="py-4 px-6">
                              <span className="text-sm font-black text-slate-800 font-mono">{inv.doc || inv.id || inv.documento}</span>
                           </td>
                           <td className="py-4 px-4">
                              <span className="text-sm font-black text-slate-500 uppercase">{inv.cliente || inv.client}</span>
                           </td>
                           <td className="py-4 px-4 text-center text-sm font-bold text-slate-500 font-mono">{inv.vencimiento || inv.due || 'VENCIDA'}</td>
                           <td className="py-4 px-4 text-right text-sm font-black text-slate-800 font-mono tracking-tighter">${Number(inv.monto || inv.amount || 0).toFixed(2)}</td>
                           <td className="py-4 px-4 text-center">
                              <span className={`text-xs font-black px-2 py-0.5 rounded uppercase border border-current/10 text-red-600 bg-red-50`}>CRÍTICA</span>
                           </td>
                           <td className="py-4 px-6 text-right">
                              <Link to={`/cobranzas/aplicar?factura_id=${inv.doc || inv.id || inv.documento}`} className="text-sm font-black text-[#0b5156] uppercase hover:tracking-widest transition-all">Gestionar</Link>
                           </td>
                        </tr>
                      )) : (
                        <tr>
                           <td colSpan={6} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">No hay facturas críticas registradas</td>
                        </tr>
                      )}
                   </tbody>
                </table>
             </div>
          </article>

          <article className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
             <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Cartera por cobrar</h3>
                <div className="flex gap-2">
                   <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                      <input 
                        type="text" 
                        placeholder="BUSCAR CLIENTE..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 pr-4 py-2 bg-[#bdafa1]/5 border border-[#bdafa1]/20 rounded-xl text-xs font-black focus:outline-none focus:border-[#0b5156] uppercase" 
                      />
                   </div>
                   <button className="p-2 bg-[#bdafa1]/5 text-slate-500 rounded-xl border border-[#bdafa1]/20 hover:bg-[#bdafa1]/10 transition-all"><Filter size={14} /></button>
                </div>
             </div>
             <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left">
                   <thead>
                      <tr className="text-xs font-black text-slate-500 uppercase border-b border-slate-100 bg-slate-50/50">
                         <th className="py-4 px-6">CLIENTE / RIF</th>
                         <th className="py-4 px-4 text-center">DOCS</th>
                         <th className="py-4 px-4 text-right">TOTAL CARTERA</th>
                         <th className="py-4 px-4 text-right text-red-600">MORA REAL</th>
                         <th className="py-4 px-4 text-center">ÚLT. PAGO</th>
                         <th className="py-4 px-6 text-center">NIVEL RIESGO</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                      {isLoading ? (
                        <tr>
                           <td colSpan={6} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cargando cartera...</td>
                        </tr>
                      ) : filteredClients.length > 0 ? filteredClients.map((c, i) => (
                        <tr 
                          key={i} 
                          onClick={() => navigate(`/cobranzas/estado-cuenta?cliente_id=${c.id}`)}
                          className="group hover:bg-[#bdafa1]/5 transition-colors cursor-pointer"
                        >
                           <td className="py-4 px-6 flex flex-col">
                              <span className="text-sm font-black text-slate-800 uppercase group-hover:text-[#0b5156] transition-colors">{c.name || c.nombre}</span>
                              <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter font-mono">{c.rif || c.id}</span>
                           </td>
                           <td className="py-4 px-4 text-center text-sm font-bold text-slate-500 font-mono">{c.docs_count !== undefined ? c.docs_count : (c.balance > 0 ? 1 : 0)}</td>
                           <td className="py-4 px-4 text-right font-mono text-sm font-black text-slate-800 tracking-tighter">${Number(c.balance || c.total || 0).toFixed(2)}</td>
                           <td className="py-4 px-4 text-right font-mono text-sm font-black text-red-600 tracking-tighter">${Number(c.mora_real !== undefined ? c.mora_real : (c.status === 'MORA' ? c.balance : 0)).toFixed(2)}</td>
                           <td className="py-4 px-4 text-center text-sm font-bold text-slate-500 font-mono">{c.ultimo_pago || '-'}</td>
                           <td className="py-4 px-6 text-center">
                              <span className={`text-xs font-black px-2 py-0.5 rounded uppercase tracking-tighter border border-current/10 ${c.status === 'MORA' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-green-50 text-green-700 border-green-100'}`}>{c.status === 'MORA' ? 'CRÍTICO' : 'AL DÍA'}</span>
                           </td>
                        </tr>
                      )) : (
                        <tr>
                           <td colSpan={6} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">No hay clientes en cartera</td>
                        </tr>
                      )}
                   </tbody>
                </table>
             </div>
          </article>
        </section>
      </div>
    </div>
  );
};

export default AccountsReceivable;
