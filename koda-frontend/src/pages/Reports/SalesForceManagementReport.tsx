import { 
  ArrowLeft,
  Download,
  DollarSign,
  TriangleAlert,
  Clock,
  Search,
  Filter,
  Briefcase,
  Percent
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const SalesForceManagementReport = () => {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [modalMessage, setModalMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);

  useEffect(() => {
    const fetchSalesForce = async () => {
      try {
        const res = await api.get<any>('/reportes/vendedores');
        setData(res);
      } catch (error) {
        console.error("Error fetching sales force report:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSalesForce();
  }, []);

  const handleExport = async () => {
    try {
      await api.download('/reportes/exportar?reporte=vendedores', 'liquidacion_comisiones_vendedores.csv');
    } catch (error) {
      console.error("Error exporting sellers:", error);
      setModalMessage("Error al liquidar comisiones.");
    }
  };

  const handleConfigureCommissions = () => {
    setModalMessage("Las tasas de comisiones se configuran individualmente en la ficha de cada vendedor en el maestro de Fuerza de Ventas.");
  };

  const metrics = data?.metrics || [];

  const salesForce = data?.salesForce || [];
  const filteredSalesForce = salesForce.filter((v: any) => {
    const nameMatch = (v.name || v.nombre || "").toLowerCase().includes(searchQuery.toLowerCase());
    const criticalMatch = showCriticalOnly ? (v.isCritical || (v.status || v.estado) === 'REVISIÓN' || parseFloat(v.efficiency || v.eficiencia) < 75) : true;
    return nameMatch && criticalMatch;
  });

  const insight = data?.insight || "En este reporte, las comisiones se calculan sobre el Monto Cobrado, no sobre la facturación. Esto garantiza que el flujo de caja esté protegido.";

  return (
    <div className="space-y-1.5 animate-in fade-in duration-500 pb-4">
      {/* Header */}
      <header className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <Link to="/reportes" className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-[#0b5156]/20 transition-all">
                <ArrowLeft size={10} /> Volver
              </Link>
              <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Gestión Comercial
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Efectividad de Ventas vs Cobros</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Análisis de rendimiento por vendedor basado en la liquidez real aportada.</p>
          </div>
          <div className="flex gap-2">
             <button 
               onClick={handleConfigureCommissions}
               className="bg-white text-slate-500 px-6 py-2 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2"
             >
                Configurar Comisiones
             </button>
             <button 
               onClick={handleExport}
               className="bg-[#0b5156] text-white px-8 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
             >
                <Download size={14} /> Liquidar Comisiones por Cobro
             </button>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
        {metrics.map((m: any, i: number) => {
          let IconComp = m.icon;
          if (!IconComp) {
            if (m.type === 'percent') IconComp = <Percent size={16} className={m.color || 'text-green-600'} />;
            else if (m.type === 'clock') IconComp = <Clock size={16} className={m.color || 'text-green-600'} />;
            else if (m.type === 'alert') IconComp = <TriangleAlert size={16} className={m.color || 'text-red-600'} />;
            else IconComp = <DollarSign size={16} className={m.color || 'text-[#0b5156]'} />;
          }
          return (
          <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24 hover:border-[#0b5156]/20 transition-all">
             <div className="flex justify-between items-start">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{m.label || m.etiqueta}</span>
                {IconComp}
             </div>
             <div className="space-y-0.5">
                <strong className={`text-lg font-black tracking-tighter font-mono ${m.color || 'text-[#0b5156]'}`}>{m.value || m.valor}</strong>
                <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">{m.desc || m.descripcion}</p>
             </div>
          </div>
          )
        })}
      </section>

      {/* Ranking Table */}
      <article className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="py-2.5 px-3.5 border-b border-slate-100 flex flex-col md:row justify-between items-start md:items-center gap-3 bg-slate-50/30">
          <div className="space-y-0.5">
            <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Ranking de Efectividad por Vendedor</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-0.5">Indicadores de gestión y base de cálculo de comisiones (USD).</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
             <div className="relative flex-1 md:flex-none">
                <Search className="absolute left-3 top-2 text-slate-400" size={12} />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar vendedor..." 
                  className="w-full md:w-64 bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156] shadow-sm" 
                />
             </div>
             <button 
               onClick={() => setShowCriticalOnly(!showCriticalOnly)}
               title="Mostrar críticos / bajo rendimiento"
               className={`p-1.5 rounded-lg border shadow-sm transition-all ${
                 showCriticalOnly 
                   ? 'bg-[#0b5156] text-white border-[#0b5156]' 
                   : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
               }`}
             >
                <Filter size={14} />
             </button>
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-2.5 px-4">Vendedor</th>
                <th className="py-2.5 px-4 text-right">Facturado ($)</th>
                <th className="py-2.5 px-4 text-right">Cobrado ($)</th>
                <th className="py-2.5 px-4 text-center">% Cobrabilidad</th>
                <th className="py-2.5 px-4 text-center">DSO (Días)</th>
                <th className="py-2.5 px-4 text-center">% Vencido</th>
                <th className="py-2.5 px-4 text-right">Comisión</th>
                <th className="py-2.5 px-4 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs">
              {filteredSalesForce.length > 0 ? filteredSalesForce.map((v: any, i: number) => (
                <tr key={i} className={`hover:bg-slate-50 transition-colors group ${v.isCritical ? 'bg-red-50/30' : ''}`}>
                  <td className="py-2 px-4">
                    <div className="flex items-center gap-3">
                       <div className="w-6 h-6 rounded-full bg-[#0b5156] flex items-center justify-center text-white text-[9px] font-bold shadow-sm">
                          {(v.name || v.nombre).split(' ').map((n: string) => n[0]).join('').substring(0,2)}
                       </div>
                       <strong className="text-slate-700 uppercase font-black">{v.name || v.nombre}</strong>
                    </div>
                  </td>
                  <td className="py-2 px-4 text-right font-mono font-bold text-slate-500">{v.billed || v.facturado}</td>
                  <td className="py-2 px-4 text-right font-mono font-black text-[#0b5156]">{v.collected || v.cobrado}</td>
                  <td className="py-2 px-4 text-center">
                    <span className={`${(v.efficiency || v.eficiencia).startsWith('9') ? 'text-green-600' : 'text-amber-600'} font-black`}>{v.efficiency || v.eficiencia}</span>
                  </td>
                  <td className="py-2 px-4 text-center font-bold text-slate-500">{v.dso}</td>
                  <td className="py-2 px-4 text-center font-bold text-slate-400">{v.overdue || v.vencido}</td>
                  <td className="py-2 px-4 text-right">
                    <strong className={`font-mono font-black ${v.isCritical ? 'text-red-500' : 'text-slate-700'}`}>{v.commission || v.comision}</strong>
                  </td>
                  <td className="py-2 px-4 text-center">
                    <span className={`${v.statusColor || 'bg-slate-100 text-slate-700'} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight`}>
                      {v.status || v.estado}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={8} className="text-center p-4 text-xs font-bold text-slate-400 uppercase">Sin información de vendedores</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Policy Insight */}
      <div className="p-4 bg-[#0b5156] rounded-xl text-white shadow-lg relative overflow-hidden flex gap-4 items-center group">
         <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-white/60 border border-white/20 group-hover:scale-110 transition-transform">
            <Briefcase size={18} />
         </div>
         <div className="flex-1 space-y-0.5">
            <h4 className="text-xs font-black uppercase tracking-tighter">📢 Política de Comisiones KODA</h4>
            <p className="text-[10px] font-bold text-white/60 uppercase leading-relaxed max-w-4xl">
               {insight}
            </p>
         </div>
         <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-3xl pointer-events-none" />
      </div>

      {modalMessage && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-[#0b5156] p-4 text-white flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest">Aviso del Sistema</h3>
              <button 
                onClick={() => setModalMessage(null)}
                className="text-white/70 hover:text-white text-xs font-bold uppercase transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-slate-600 text-xs font-bold uppercase tracking-tight leading-relaxed">
                {modalMessage}
              </p>
              <div className="flex justify-end gap-2">
                <button 
                  onClick={() => setModalMessage(null)}
                  className="bg-[#0b5156] text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
                >
                  Aceptar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesForceManagementReport;
