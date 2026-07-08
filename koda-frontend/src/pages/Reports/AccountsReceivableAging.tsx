import { 
  ArrowLeft,
  Download,
  TriangleAlert,
  Clock,
  ChevronRight,
  ShieldAlert,
  Wallet,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const AccountsReceivableAging = () => {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAging = async () => {
      try {
        const res = await api.get<any>('/reportes/antiguedad-cartera');
        setData(res);
      } catch (error) {
        console.error("Error fetching accounts receivable aging:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAging();
  }, []);

  const metrics = data?.metrics || [];

  const riskSegments = data?.riskSegments || [];

  const clientsData = data?.clientsData || [];
  const insight = data?.insight || "La pérdida por devaluación se calcula comparando la tasa de cambio al momento de la factura vs la tasa actual del BCV. Los saldos en mora superior a 90 días requieren provisión de incobrabilidad inmediata.";

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
                Análisis de Crédito
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Monitor de Antigüedad de Cartera</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Evaluación de riesgo crediticio y salud de las cuentas por cobrar.</p>
          </div>
          <div className="flex gap-2">
             <button className="bg-white text-slate-500 px-6 py-2 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2">
                <Download size={14} /> Exportar PDF Gerencial
             </button>
             <select className="bg-[#0b5156] text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase outline-none shadow-lg shadow-green-900/20 cursor-pointer">
                <option>Al 30/04/2026</option>
                <option>Al 31/03/2026</option>
             </select>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
        {metrics.map((m: any, i: number) => {
          let IconComp = m.icon;
          if (!IconComp) {
            if (m.type === 'wallet') IconComp = <Wallet size={16} className={m.color || 'text-[#0b5156]'} />;
            else if (m.type === 'alert') IconComp = <TriangleAlert size={16} className={m.color || 'text-red-600'} />;
            else if (m.type === 'trend') IconComp = <TrendingUp size={16} className={m.color || 'text-green-600'} />;
            else IconComp = <Clock size={16} className={m.color || 'text-slate-400'} />;
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

      {/* Risk Distribution Chart */}
      <article className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
         <div className="mb-4">
            <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Distribución de Riesgo de Cobranza</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-0.5">Segmentación de la cartera por antigüedad de vencimiento.</p>
         </div>

         <div className="space-y-4">
            <div className="h-6 w-full bg-slate-50 rounded-full overflow-hidden flex shadow-inner border border-slate-100">
               {riskSegments.map((seg: any, i: number) => (
                 <div 
                   key={i} 
                   className={`${seg.color || 'bg-slate-300'} h-full transition-all hover:brightness-110 cursor-help relative group`}
                   style={{ width: `${seg.percentage || seg.porcentaje}%` }}
                 >
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                       <span className="text-[8px] font-black text-white uppercase">{seg.percentage || seg.porcentaje}%</span>
                    </div>
                 </div>
               ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-start">
               {riskSegments.map((seg: any, i: number) => (
                 <div key={i} className="flex items-center gap-3 p-2 bg-slate-50 rounded-xl border border-slate-100">
                    <div className={`w-2.5 h-2.5 rounded-full ${seg.legendColor || 'bg-slate-400'}`} />
                    <div className="space-y-0.5">
                       <span className="text-[9px] font-black text-slate-400 uppercase leading-none">{seg.label || seg.etiqueta}</span>
                       <strong className="text-xs font-black text-slate-700 block font-mono leading-none">{seg.value || seg.valor}</strong>
                    </div>
                 </div>
               ))}
            </div>
         </div>
      </article>

      {/* Clients Detail Table */}
      <article className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="py-2.5 px-3.5 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
          <div className="space-y-0.5">
            <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Antigüedad por Cliente</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Detalle individual de saldos y pérdida por devaluación proyectada.</p>
          </div>
          <button className="text-[10px] font-black text-[#0b5156] uppercase flex items-center gap-1.5 hover:underline">
             Ver Todos los Clientes <ChevronRight size={12} />
          </button>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-2.5 px-4">Cliente</th>
                <th className="py-2.5 px-4 text-right">Total Saldo</th>
                <th className="py-2.5 px-4 text-right">Vencido</th>
                <th className="py-2.5 px-4 text-right">0-30 d</th>
                <th className="py-2.5 px-4 text-right">31-60 d</th>
                <th className="py-2.5 px-4 text-right">+60 d</th>
                <th className="py-2.5 px-4 text-right">Pérdida Val. (Bs)</th>
                <th className="py-2.5 px-4 text-center">Riesgo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs">
              {clientsData.length > 0 ? clientsData.map((client: any, i: number) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors group">
                  <td className="py-2 px-4">
                    <strong className="text-slate-700 uppercase font-black block leading-tight">{client.name || client.nombre}</strong>
                  </td>
                  <td className="py-2 px-4 text-right font-mono font-bold text-slate-600">{client.total}</td>
                  <td className={`py-2 px-4 text-right font-mono font-black ${(client.overdue && client.overdue !== '$0') ? 'text-red-500' : 'text-slate-400'}`}>{client.overdue || client.vencido}</td>
                  <td className="py-2 px-4 text-right font-mono text-slate-500">{client.days0_30}</td>
                  <td className="py-2 px-4 text-right font-mono text-slate-500">{client.days31_60}</td>
                  <td className="py-2 px-4 text-right font-mono text-slate-500">{client.daysPlus60}</td>
                  <td className="py-2 px-4 text-right font-mono font-black text-red-600">{client.loss || client.perdida}</td>
                  <td className="py-2 px-4 text-center">
                    <span className={`${client.riskColor || 'bg-slate-100 text-slate-700'} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight`}>
                      {client.risk || client.riesgo}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={8} className="text-center p-4 text-xs font-bold text-slate-400 uppercase">Sin cuentas por cobrar registradas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Forensic Insight */}
      <div className="p-4 bg-[#0b5156] rounded-xl text-white flex gap-4 items-center shadow-lg relative overflow-hidden group">
         <div className="bg-white/10 p-2.5 rounded-xl border border-white/20 h-fit">
            <ShieldAlert size={24} className="text-white/60" />
         </div>
         <div className="space-y-1.5 flex-1">
            <h4 className="text-xs font-black uppercase tracking-tighter">Nota de Auditoría de Cartera</h4>
            <p className="text-[10px] font-bold text-white/60 uppercase leading-relaxed max-w-4xl">
               {insight}
            </p>
         </div>
         <div className="absolute right-0 bottom-0 w-40 h-40 bg-white/5 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-1000 pointer-events-none" />
      </div>
    </div>
  );
};

export default AccountsReceivableAging;
