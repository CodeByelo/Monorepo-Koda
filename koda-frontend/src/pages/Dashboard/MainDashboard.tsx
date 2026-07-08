import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
  ShoppingBag, 
  Landmark, 
  BookOpen, 
  FileText, 
  Users,
  TrendingUp,
  TrendingDown,
  DollarSign
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import { api } from '@/api/client';
import { useSystem } from '@/providers/SystemProvider';
import { useAuth } from '@/providers/AuthProvider';

// --- Interfaces de Datos ---
interface DashboardResumen {
  saldo_bancos_usd: number;
  saldo_cxc_usd: number;
}

interface EstadoResultados {
  ingresos_totales_usd: number;
  costos_totales_usd: number;
  utilidad_neta_usd: number;
}

const MetricCard = ({ title, value, subtitle, icon: Icon, colorClass, bgClass }: any) => (
  <div className={`p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between ${bgClass}`}>
    <div className="flex justify-between items-start mb-4">
      <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{title}</span>
      <div className={`p-2 rounded-xl ${colorClass}`}>
        <Icon size={20} />
      </div>
    </div>
    <div>
      <h3 className="text-3xl font-black text-slate-800 tracking-tighter mb-1">{value}</h3>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{subtitle}</p>
    </div>
  </div>
);

const MainDashboard = () => {
  const { setActiveSystem } = useSystem();
  const { userRole } = useAuth();
  
  const [resumen, setResumen] = useState<DashboardResumen | null>(null);
  const [resultados, setResultados] = useState<EstadoResultados | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    setIsMounted(true);
    
    // Configurar observador para evitar renderizar el gráfico con dimensiones 0 o negativas
    if (containerRef.current) {
      const observer = new ResizeObserver((entries) => {
        if (entries && entries.length > 0) {
          const { width } = entries[0].contentRect;
          setContainerWidth(width);
        }
      });
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const [resResumen, resResultados] = await Promise.all([
          api.get<DashboardResumen>('/repo_dashboard_resumen'),
          api.get<EstadoResultados>('/repo_estado_resultados')
        ]);
        setResumen(resResumen);
        setResultados(resResultados);
      } catch (err: any) {
        console.error("Error al cargar datos financieros:", err);
        setError(err.message || "Error al conectar con la API de Reportes.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-[70vh] space-y-4">
        <div className="w-12 h-12 border-4 border-[#0b5156] border-t-transparent rounded-full animate-spin"></div>
        <div className="text-center text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse">
          Sincronizando Módulos de Inteligencia Financiera...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center bg-red-50 text-red-600 rounded-3xl border border-red-200">
        <h2 className="text-xl font-black mb-2 uppercase">Error de Conexión</h2>
        <p className="font-bold text-sm">{error}</p>
      </div>
    );
  }

  const formatCurrency = (val: number | undefined) => {
    if (val === undefined) return '$0.00';
    return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Preparamos datos para el gráfico de barras comparativo (Ingresos vs Costos)
  const chartData = [
    {
      name: 'Resumen Global',
      Ingresos: Number(resultados?.ingresos_totales_usd || 0),
      Costos: Number(resultados?.costos_totales_usd || 0)
    }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* HEADER */}
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <div className="bg-[#0b5156]/10 px-3 py-1 rounded-full w-fit mb-2">
             <span className="text-[9px] font-black text-[#0b5156] uppercase tracking-widest">Koda ERP Analytics</span>
          </div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter">Dashboard Corporativo</h1>
          <p className="text-slate-500 text-sm font-bold">Métricas financieras y operativas en tiempo real.</p>
        </div>
        
        <div>
          <button 
            onClick={() => window.location.href = `http://${window.location.hostname}:3000`}
            className="flex items-center gap-2 bg-[#0b5156] text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-[#083d41] transition-colors shadow-sm active:scale-95"
          >
            <FileText size={18} />
            Volver al Gestor
          </button>
        </div>
      </header>

      {/* METRIC CARDS */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <MetricCard 
          title="Saldo en Bancos" 
          value={formatCurrency(resumen?.saldo_bancos_usd)} 
          subtitle="Cuenta 1.1.01" 
          icon={Landmark}
          colorClass="text-blue-600 bg-blue-100"
          bgClass="bg-white"
        />
        <MetricCard 
          title="Cuentas por Cobrar" 
          value={formatCurrency(resumen?.saldo_cxc_usd)} 
          subtitle="Cuenta 1.1.02" 
          icon={Users}
          colorClass="text-amber-600 bg-amber-100"
          bgClass="bg-white"
        />
        <MetricCard 
          title="Utilidad Neta" 
          value={formatCurrency(resultados?.utilidad_neta_usd)} 
          subtitle="Beneficio Operativo" 
          icon={DollarSign}
          colorClass={Number(resultados?.utilidad_neta_usd) >= 0 ? "text-green-600 bg-green-100" : "text-red-600 bg-red-100"}
          bgClass="bg-white"
        />
      </section>

      {/* CHART SECTION */}
      <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="mb-6">
          <h2 className="text-xl font-black text-slate-800 tracking-tighter uppercase">Estado de Resultados (Ingresos vs Costos)</h2>
          <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Comparativa acumulada</p>
        </div>
        <div ref={containerRef} className="h-80 w-full">
          {isMounted && containerWidth > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                <YAxis tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 'bold'}} axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} />
                <RechartsTooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any) => [formatCurrency(value as number), undefined]}
                />
                <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 'bold', paddingTop: '10px' }} />
                <Bar dataKey="Ingresos" fill="#0b5156" radius={[6, 6, 0, 0]} maxBarSize={100} />
                <Bar dataKey="Costos" fill="#ef4444" radius={[6, 6, 0, 0]} maxBarSize={100} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* HUB DE SISTEMAS KODA */}
      <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm mt-6">
        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">Suite de Sistemas KODA</h3>
        <p className="text-xs font-bold text-slate-400 mb-6 uppercase font-mono">Seleccione un sistema activo para filtrar su espacio de trabajo.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-stretch">
          {[
            {
              key: 'administrativo',
              title: 'S. Administrativo',
              desc: 'Ventas, Facturación, Compras e Inventarios',
              icon: ShoppingBag,
              color: 'border-emerald-200 hover:border-emerald-400 bg-emerald-50/20 text-emerald-800 hover:bg-emerald-50/50',
              iconColor: 'text-emerald-600 bg-emerald-100',
              badge: 'Operaciones',
              badgeColor: 'bg-emerald-100 text-emerald-700',
              roles: ['Admin', 'Contabilidad', 'Ventas']
            },
            {
              key: 'financiero',
              title: 'S. Financiero',
              desc: 'Bancos, Tesorería, Cuentas por Cobrar/Pagar',
              icon: Landmark,
              color: 'border-blue-200 hover:border-blue-400 bg-blue-50/20 text-blue-800 hover:bg-blue-50/50',
              iconColor: 'text-blue-600 bg-blue-100',
              badge: 'Finanzas',
              badgeColor: 'bg-blue-100 text-blue-700',
              roles: ['Admin', 'Contabilidad', 'Ventas']
            },
            {
              key: 'contable',
              title: 'S. Contable',
              desc: 'Libro Diario, Mayor, Balances y Cierre',
              icon: BookOpen,
              color: 'border-violet-200 hover:border-violet-400 bg-violet-50/20 text-violet-800 hover:bg-violet-50/50',
              iconColor: 'text-violet-600 bg-violet-100',
              badge: 'Contabilidad',
              badgeColor: 'bg-violet-100 text-violet-700',
              roles: ['Admin', 'Contabilidad']
            },
            {
              key: 'fiscal',
              title: 'S. Fiscal',
              desc: 'Libros IVA, Retenciones de Impuesto y Calendario',
              icon: FileText,
              color: 'border-amber-200 hover:border-amber-400 bg-amber-50/20 text-amber-800 hover:bg-amber-50/50',
              iconColor: 'text-amber-600 bg-amber-100',
              badge: 'Tributos',
              badgeColor: 'bg-amber-100 text-amber-700',
              roles: ['Admin', 'Contabilidad']
            },
            {
              key: 'nomina',
              title: 'S. Nómina',
              desc: 'Cálculo de Sueldos, Deducciones SSO/FAOV',
              icon: Users,
              color: 'border-pink-200 hover:border-pink-400 bg-pink-50/20 text-pink-800 hover:bg-pink-50/50',
              iconColor: 'text-pink-600 bg-pink-100',
              badge: 'Personal',
              badgeColor: 'bg-pink-100 text-pink-700',
              roles: ['Admin']
            }
          ].filter(sys => !sys.roles || sys.roles.includes(userRole || '') || userRole === 'Desarrollador' || userRole === 'Dev' || userRole === 'developer').map((sys) => (
            <button
              key={sys.key}
              onClick={() => setActiveSystem(sys.key as any)}
              className={`flex flex-col justify-between p-5 rounded-2xl border text-left transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] hover:shadow-md ${sys.color}`}
            >
              <div className="space-y-4 w-full">
                <div className="flex justify-between items-center">
                  <div className={`p-2 rounded-xl ${sys.iconColor}`}>
                    <sys.icon size={18} />
                  </div>
                  <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${sys.badgeColor}`}>
                    {sys.badge}
                  </span>
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-black uppercase tracking-tight">{sys.title}</h4>
                  <p className="text-[10px] opacity-75 font-bold leading-snug">{sys.desc}</p>
                </div>
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest mt-4 flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity">
                Ingresar &rarr;
              </span>
            </button>
          ))}
        </div>
      </article>

    </div>
  );
};

export default MainDashboard;
