import { 
  BookOpen, 
  FileText, 
  PieChart, 
  Plus, 
  LayoutGrid, 
  ShieldCheck, 
  Layers,
  ChevronRight,
  TriangleAlert,
  CheckCircle2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const AccountingDashboard = () => {
  const [metricsData, setMetricsData] = useState<any[]>([]);
  const [recentEntries, setRecentEntries] = useState<any[]>([]);
  const [monitorForense, setMonitorForense] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      const [metricsRes, entriesRes, monitorRes] = await Promise.all([
        api.get<any>('/contabilidad/dashboard').catch(() => null),
        api.get<any>('/contabilidad/asientos?limit=5').catch(() => ({ data: [] })),
        api.get<any>('/contabilidad/monitor-forense').catch(() => null)
      ]);
      
      setMetricsData(metricsRes?.metrics || metricsRes || []);
      setRecentEntries(entriesRes?.data || entriesRes || []);
      setMonitorForense(monitorRes || null);
    } catch (error) {
      console.error("Error fetching accounting dashboard:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const quickLinks = [
    { name: 'Libro Diario', desc: 'Registro cronológico de operaciones', icon: <BookOpen className="text-blue-500" />, path: '/contabilidad/diario' },
    { name: 'Libro Mayor', desc: 'Saldos consolidados por cuenta', icon: <Layers className="text-[#0b5156]" />, path: '/contabilidad/mayor' },
    { name: 'Bal. Comprobación', desc: 'Saldos de sumas y saldos', icon: <FileText className="text-amber-500" />, path: '/contabilidad/balance-comprobacion' },
    { name: 'Estado Resultados', desc: 'Análisis de ingresos y egresos', icon: <PieChart className="text-green-500" />, path: '/contabilidad/estado-resultados' },
  ];

  const formatCurrency = (val: number | string | undefined | null) => {
    if (val === undefined || val === null) return "0.00";
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return val;
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2 });
  };

  const displayMetrics = metricsData.length > 0 ? metricsData : [
    { label: 'Asientos del Mes', value: '0', trend: 'Sin datos', color: 'text-slate-400' },
    { label: 'Utilidad Neta', value: '$0.00', trend: 'Sin datos', color: 'text-slate-400' },
    { label: 'Último Cierre', value: '-', trend: 'Sin datos', color: 'text-slate-400' },
    { label: 'Descuadre Actual', value: '$0.00', trend: 'Sin datos', color: 'text-slate-400' },
  ];

  return (
    <div className="space-y-3 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Contabilidad General
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Panel Contable</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Visión financiera, revisión de asientos diarios y libros principales.</p>
          </div>
          <div className="flex gap-2">
             <Link to="/contabilidad/catalogo" className="bg-white text-[#0b5156] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2">
                <LayoutGrid size={14} /> Plan de Cuentas
             </Link>
             <Link to="/contabilidad/asiento-manual" className="bg-[#0b5156] text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <Plus size={14} /> Nuevo Asiento Diario
             </Link>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse bg-white rounded-3xl border border-slate-200 shadow-sm">
           Cargando Dashboard Contable...
        </div>
      ) : (
        <>
          {/* Metrics Grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            {displayMetrics.map((m: any, i: number) => (
              <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24 hover:border-[#0b5156]/20 transition-all">
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{m.label}</span>
                 <div className="space-y-1">
                   <strong className={`text-xl font-black ${m.color || 'text-[#0b5156]'} tracking-tighter font-mono uppercase`}>{m.value}</strong>
                   <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">{m.trend}</p>
                 </div>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Quick Links */}
            <article className="lg:col-span-2 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
               <div className="mb-4">
                  <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Libros y Reportes</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight mt-1">Acceso directo a la situación financiera.</p>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  {quickLinks.map((link, i) => (
                    <Link key={i} to={link.path} className="group p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-[#0b5156] hover:bg-white transition-all shadow-sm flex items-center gap-4">
                       <div className="bg-white p-2 rounded-xl border border-slate-100 group-hover:bg-[#0b5156]/5 group-hover:border-[#0b5156]/20 transition-all">
                          {link.icon}
                       </div>
                       <div className="space-y-1">
                          <strong className="text-sm font-black text-[#0b5156] uppercase block leading-none">{link.name}</strong>
                          <span className="text-[10px] font-bold text-slate-400 uppercase leading-none">{link.desc}</span>
                       </div>
                       <ChevronRight className="ml-auto text-slate-300 group-hover:text-[#0b5156] transition-colors" size={20} />
                    </Link>
                  ))}
               </div>
            </article>

            {/* Forensic Audit Monitor */}
            <aside className="space-y-3">
               <article className={`bg-white p-4 rounded-2xl border-l-4 border border-slate-200 shadow-sm relative overflow-hidden group ${monitorForense?.hasErrors ? 'border-l-red-500' : 'border-l-green-500'}`}>
                  <div className="relative z-10 space-y-3">
                     <div className="flex justify-between items-start">
                        <div className="space-y-1">
                           <h3 className="text-sm font-black text-[#0b5156] uppercase tracking-tighter leading-none">Monitor Forense</h3>
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Integridad Mayor vs Auxiliares.</p>
                        </div>
                        {monitorForense?.hasErrors ? (
                          <span className="bg-red-100 text-red-600 text-[8px] font-black px-2 py-0.5 rounded uppercase animate-pulse">⚠️ Descuadre</span>
                        ) : (
                          <span className="bg-green-100 text-green-600 text-[8px] font-black px-2 py-0.5 rounded uppercase">✅ Integridad OK</span>
                        )}
                     </div>
                     
                     <div className="space-y-2">
                        {(monitorForense?.checks || []).map((check: any, idx: number) => (
                          <div key={idx} className={`p-3 rounded-xl border flex justify-between items-center ${check.status === 'error' ? 'bg-red-50 border-red-100 hover:bg-red-100' : 'bg-green-50 border-green-100'}`}>
                             <span className={`text-[10px] font-bold uppercase ${check.status === 'error' ? 'text-red-800' : 'text-green-800'}`}>{check.name || check.nombre}</span>
                             <strong className={`text-xs font-black font-mono ${check.status === 'error' ? 'text-red-600' : 'text-green-600'}`}>Bs. {formatCurrency(check.diff || check.diferencia || 0)}</strong>
                          </div>
                        ))}
                        {(!monitorForense?.checks || monitorForense.checks.length === 0) && (
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Sin validaciones recientes</span>
                          </div>
                        )}
                     </div>

                     {monitorForense?.rootCause && (
                       <div className="space-y-2 pt-2">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Causa Raíz Identificada:</span>
                          <div className="p-3 bg-[#0b5156]/10 rounded-xl border border-[#0b5156]/20 space-y-2">
                             <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black text-[#0b5156] uppercase font-mono">{monitorForense.rootCause.id}</span>
                                <strong className="text-[10px] font-black text-red-600 font-mono">Bs. {formatCurrency(monitorForense.rootCause.amount)}</strong>
                             </div>
                             <p className="text-[9px] font-bold text-[#0b5156]/80 uppercase leading-relaxed italic">
                                "{monitorForense.rootCause.description}"
                             </p>
                          </div>
                       </div>
                     )}
                  </div>
                  {monitorForense?.hasErrors && (
                    <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-red-500/5 rounded-full blur-3xl group-hover:scale-110 transition-transform" />
                  )}
               </article>
            </aside>
          </div>

          {/* Recent Entries Table */}
          <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/30 flex justify-between items-center">
              <div>
                <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Últimos Asientos Registrados</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Transacciones contabilizadas recientemente.</p>
              </div>
              <Link to="/contabilidad/diario" className="bg-white text-slate-500 px-4 py-2 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-slate-50 transition-all shadow-sm">
                 Ver Libro Diario Completo
              </Link>
            </div>

            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                    <th className="py-2.5 px-6">Fecha</th>
                    <th className="py-2.5 px-4">Comprobante</th>
                    <th className="py-2.5 px-4">Descripción</th>
                    <th className="py-2.5 px-4 text-right">Monto</th>
                    <th className="py-2.5 px-4 text-center">Origen</th>
                    <th className="py-2.5 px-6 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs">
                  {recentEntries.length > 0 ? recentEntries.map((entry: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-6 font-bold text-slate-400">{entry.fecha || entry.date}</td>
                      <td className="py-2.5 px-4"><Link to={`/contabilidad/asiento/${entry.id}`} className="hover:underline font-mono text-[#0b5156] font-bold">{entry.numero || entry.id}</Link></td>
                      <td className="py-2.5 px-4 font-bold text-slate-600 uppercase">{entry.descripcion || entry.desc}</td>
                      <td className="py-2.5 px-4 text-right font-black font-mono text-slate-700">Bs. {formatCurrency(entry.monto || entry.amount)}</td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${entry.origen === 'Ventas' || entry.origin === 'Ventas' ? 'bg-blue-100 text-blue-700' : entry.origen === 'Tesorería' || entry.origin === 'Tesorería' ? 'bg-green-100 text-green-700' : 'bg-white text-slate-500 border border-slate-200'}`}>
                          {entry.origen || entry.origin || 'General'}
                        </span>
                      </td>
                      <td className="py-2.5 px-6 text-right">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${entry.estatus === 'Mayorizado' || entry.status === 'Mayorizado' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {entry.estatus || entry.status || 'Borrador'}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                        No hay asientos registrados recientemente
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}
    </div>
  );
};

export default AccountingDashboard;
