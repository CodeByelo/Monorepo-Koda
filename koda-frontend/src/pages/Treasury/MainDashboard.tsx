import { 
  LayoutDashboard, 
  TrendingUp, 
  Wallet, 
  Box, 
  Activity, 
  Users, 
  AlertTriangle,
  ShieldCheck,
  Calendar,
  ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const MainDashboard = () => {
  const today = new Date().toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api.get<any>('/principal/dashboard').then(setData).catch(console.error).finally(() => setIsLoading(false));
  }, []);

  const topKPIs = (data?.kpis || []).map((k: any, i: number) => ({
    label: k.label,
    value: k.value,
    desc: k.desc,
    icon: [<Wallet size={20} />, <TrendingUp size={20} />, <Box size={20} />, <Activity size={20} />][i] || <Wallet size={20} />,
    color: i === 0 ? 'bg-koda-main text-white' : 'bg-white text-slate-800 border border-slate-200',
    iconColor: i === 0 ? 'text-white/60' : 'text-koda-main',
  }));

  const quickModules = [
    { name: 'Punto de Venta', desc: 'Caja y facturación rápida', link: '/ventas/pos', icon: '🛒', bg: 'bg-green-50 hover:bg-green-100 hover:border-green-300' },
    { name: 'Tesorería', desc: 'Flujo de caja y bancos', link: '/tesoreria/dashboard', icon: '🏦', bg: 'bg-blue-50 hover:bg-blue-100 hover:border-blue-300' },
    { name: 'Inventario', desc: 'Kardex y ajustes', link: '/inventario/dashboard', icon: '📦', bg: 'bg-amber-50 hover:bg-amber-100 hover:border-amber-300' },
    { name: 'Contabilidad', desc: 'Libros e impuestos', link: '/contabilidad/dashboard', icon: '📊', bg: 'bg-slate-50 hover:bg-slate-100 hover:border-slate-300' },
    { name: 'Recursos Humanos', desc: 'Nómina y empleados', link: '/rrhh/dashboard', icon: '👥', bg: 'bg-purple-50 hover:bg-purple-100 hover:border-purple-300' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Welcome Header */}
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="absolute top-0 right-0 p-8 opacity-5">
           <LayoutDashboard size={160} className="text-koda-main" />
        </div>
        <div className="space-y-2 relative z-10">
          <span className="bg-koda-main/10 text-koda-main text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border border-koda-main/20">
            {today}
          </span>
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Visión General</h1>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-2xl leading-relaxed">
            Bienvenido a KODA ERP. El sistema está operando con la tasa oficial BCV: <strong className="text-koda-main">Bs. {data?.tasa_bcv?.toFixed(2) || '—'}</strong>.
          </p>
        </div>
        <div className="relative z-10 flex gap-3">
           <button className="bg-white text-slate-500 px-6 py-3 rounded-2xl text-xs font-black uppercase border border-slate-200 flex items-center gap-2 tracking-widest shadow-sm hover:bg-slate-50">
             <Calendar size={16} /> Ver Calendario Fiscal
           </button>
        </div>
      </header>

      {isLoading && <div className="text-center py-8 text-slate-400 text-xs font-bold uppercase animate-pulse">Cargando visión general...</div>}

      {/* 4 Pillars KPIs */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {(topKPIs.length > 0 ? topKPIs : []).map((kpi: any, i: number) => (
          <div key={i} className={`${kpi.color} p-6 rounded-3xl shadow-sm flex flex-col justify-between h-40 transition-all hover:scale-[1.02] cursor-default`}>
            <div className="flex justify-between items-start">
               <p className="text-[10px] font-black uppercase tracking-widest opacity-80">{kpi.label}</p>
               <div className={kpi.iconColor}>{kpi.icon}</div>
            </div>
            <div className="space-y-1">
              <strong className="text-3xl font-black tracking-tighter font-mono leading-none block">{kpi.value}</strong>
              <p className="text-[10px] font-bold uppercase tracking-tight opacity-70">{kpi.desc}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Main Chart / Summary Area */}
        <article className="lg:col-span-2 space-y-6">
           <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                 <h2 className="text-lg font-black text-slate-800 uppercase tracking-tighter">Resumen de Operaciones</h2>
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-lg">Últimos 7 días</span>
              </div>
              
              {/* Mini simple bar visualization */}
              <div className="space-y-6">
                 <div className="space-y-2">
                    <div className="flex justify-between text-xs font-black uppercase tracking-widest">
                       <span className="text-slate-500">Ingresos (Ventas y Cobros)</span>
                       <span className="text-green-600 font-mono">$18,450.00</span>
                    </div>
                    <div className="h-4 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                       <div className="h-full bg-green-500 rounded-full transition-all duration-1000" style={{ width: '85%' }}></div>
                    </div>
                 </div>
                 <div className="space-y-2">
                    <div className="flex justify-between text-xs font-black uppercase tracking-widest">
                       <span className="text-slate-500">Egresos (Compras y Gastos)</span>
                       <span className="text-red-500 font-mono">$6,230.00</span>
                    </div>
                    <div className="h-4 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                       <div className="h-full bg-red-500 rounded-full transition-all duration-1000" style={{ width: '35%' }}></div>
                    </div>
                 </div>
              </div>
           </div>

           {/* Quick Access Grid */}
           <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {quickModules.map((mod, i) => (
                 <Link key={i} to={mod.link} className={`${mod.bg} border border-transparent p-5 rounded-2xl transition-all group flex flex-col items-start gap-3`}>
                    <span className="text-2xl group-hover:scale-110 transition-transform">{mod.icon}</span>
                    <div className="space-y-0.5">
                       <strong className="text-xs font-black text-slate-800 uppercase block leading-tight">{mod.name}</strong>
                       <span className="text-[9px] font-bold text-slate-500 uppercase leading-tight block">{mod.desc}</span>
                    </div>
                 </Link>
              ))}
           </div>
        </article>

        {/* System Intelligence Sidebar */}
        <aside className="space-y-6">
           <article className="bg-slate-900 p-8 rounded-3xl text-white shadow-xl relative overflow-hidden group">
              <div className="relative z-10 space-y-6">
                 <div className="flex items-center gap-2">
                    <ShieldCheck size={20} className="text-emerald-400" />
                    <h3 className="text-lg font-black uppercase tracking-tight">KODA Advisor</h3>
                 </div>
                 
                 <div className="space-y-4">
                    <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-2xl space-y-2">
                       <div className="flex items-center gap-2">
                          <AlertTriangle size={14} className="text-red-400" />
                          <strong className="text-[10px] font-black uppercase tracking-widest text-red-200">Stock Crítico</strong>
                       </div>
                       <p className="text-xs font-bold text-white/80 uppercase leading-relaxed">
                          14 productos bajo el nivel mínimo operativo. Se sugiere emitir orden de reposición hoy.
                       </p>
                    </div>

                    <div className="p-4 bg-amber-500/20 border border-amber-500/30 rounded-2xl space-y-2">
                       <div className="flex items-center gap-2">
                          <Users size={14} className="text-amber-400" />
                          <strong className="text-[10px] font-black uppercase tracking-widest text-amber-200">Morosidad Alta</strong>
                       </div>
                       <p className="text-xs font-bold text-white/80 uppercase leading-relaxed">
                          El cliente 'Inversiones El Sol' superó los 30 días de crédito en el POS por un monto de $8,400.
                       </p>
                    </div>
                 </div>

                 <button className="w-full bg-white/10 text-white border border-white/20 font-black py-4 rounded-2xl uppercase text-[10px] tracking-widest hover:bg-white hover:text-slate-900 transition-all flex items-center justify-center gap-2">
                    Abrir Panel de Auditoría <ArrowRight size={14} />
                 </button>
              </div>
              <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px]" />
           </article>

           <article className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-tighter">Últimas Transacciones</h3>
              <div className="space-y-3">
                 {[
                   { text: 'Factura POS emitida', sub: 'Terminal 01 · $120.00', color: 'text-koda-main bg-koda-main/10' },
                   { text: 'Ajuste inventario aprobado', sub: 'Admin · -14 uds', color: 'text-amber-600 bg-amber-50' },
                   { text: 'Cobro recibido Zelle', sub: 'Tesoreria · $430.00', color: 'text-green-600 bg-green-50' },
                 ].map((t, i) => (
                   <div key={i} className="flex gap-3 items-center group cursor-pointer">
                      <div className={`w-2 h-2 rounded-full ${t.color.split(' ')[1]}`} />
                      <div className="space-y-0.5 flex-1">
                         <p className="text-xs font-black text-slate-700 uppercase leading-none group-hover:text-koda-main transition-colors">{t.text}</p>
                         <p className="text-[9px] font-bold text-slate-400 uppercase">{t.sub}</p>
                      </div>
                      <ArrowRight size={12} className="text-slate-300 group-hover:text-koda-main transition-colors" />
                   </div>
                 ))}
              </div>
           </article>
        </aside>
      </div>
    </div>
  );
};

export default MainDashboard;