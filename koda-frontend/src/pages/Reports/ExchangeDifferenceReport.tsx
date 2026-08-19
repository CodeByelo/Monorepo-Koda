import { 
  ArrowLeft,
  Download,
  TrendingUp,
  TrendingDown,
  Activity,
  Search,
  Filter,
  ArrowRightLeft
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const ExchangeDifferenceReport = () => {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [modalMessage, setModalMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showLossesOnly, setShowLossesOnly] = useState(false);

  useEffect(() => {
    const fetchDiff = async () => {
      try {
        const res = await api.get<any>('/reportes/diferencial-cambiario');
        setData(res);
      } catch (error) {
        console.error("Error fetching exchange difference:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDiff();
  }, []);

  const handleExport = async () => {
    try {
      await api.download('/reportes/exportar?reporte=diferencial', 'reporte_diferencial_cambiario.csv');
    } catch (error) {
      console.error("Error exporting differential:", error);
      setModalMessage("Error al exportar reporte de diferencial cambiario.");
    }
  };

  const metrics = data?.metrics || [];

  const operations = data?.operations || [];
  const filteredOperations = operations.filter((op: any) => {
    const docName = op.id || op.documento || "";
    const clientName = op.client || op.entidad || "";
    const nameMatch = docName.toLowerCase().includes(searchQuery.toLowerCase()) || clientName.toLowerCase().includes(searchQuery.toLowerCase());
    const lossMatch = showLossesOnly ? op.diffType !== 'success' : true;
    return nameMatch && lossMatch;
  });

  const insight = data?.insight || "Este reporte muestra la ganancia o pérdida realizada al momento de la transacción financiera. Para el ajuste por inflación o re-expresión de cuentas al cierre, utilice el módulo de Ajuste Cambiario de Saldos.";

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
                Inteligencia Financiera
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Realización de Diferencial Cambiario</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Análisis de impacto financiero por variación de tasa entre emisión y cobro.</p>
          </div>
          <div className="flex gap-2">
             <button 
               onClick={handleExport}
               className="bg-[#0b5156] text-white px-8 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
             >
                <Download size={14} /> Exportar Reporte
             </button>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
        {metrics.map((m: any, i: number) => {
          let IconComp = m.icon;
          if (!IconComp) {
            if (m.type === 'up') IconComp = <TrendingUp size={16} className={m.color} />;
            else if (m.type === 'down') IconComp = <TrendingDown size={16} className={m.color} />;
            else IconComp = <Activity size={16} className={m.color} />;
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

      {/* Operations Table */}
      <article className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="py-2.5 px-3.5 border-b border-slate-100 flex flex-col md:row justify-between items-start md:items-center gap-3 bg-slate-50/30">
          <div className="space-y-0.5">
            <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Detalle de Operaciones</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-0.5">Cruces individuales entre tasa de facturación y tasa de realización (cobro/pago).</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
             <div className="relative flex-1 md:flex-none">
                <Search className="absolute left-3 top-2 text-slate-400" size={12} />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar factura o cliente..." 
                  className="w-full md:w-64 bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156] shadow-sm" 
                />
             </div>
             <button 
               onClick={() => setShowLossesOnly(!showLossesOnly)}
               title="Mostrar solo pérdidas"
               className={`p-1.5 rounded-lg border shadow-sm transition-all ${
                 showLossesOnly 
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
                <th className="py-2.5 px-4">Documento</th>
                <th className="py-2.5 px-4">Cliente / Proveedor</th>
                <th className="py-2.5 px-4 text-center">Tasa Emisión</th>
                <th className="py-2.5 px-4 text-center">Tasa Cobro</th>
                <th className="py-2.5 px-4 text-right">Monto USD</th>
                <th className="py-2.5 px-4 text-right">Bs (Emisión)</th>
                <th className="py-2.5 px-4 text-right">Bs (Cobro)</th>
                <th className="py-2.5 px-4 text-right">Diferencial</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs">
              {filteredOperations.length > 0 ? filteredOperations.map((op: any, i: number) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors group">
                  <td className="py-2 px-4">
                    <strong className="text-[#0b5156] font-mono font-black">{op.id || op.documento}</strong>
                  </td>
                  <td className="py-2 px-4">
                    <strong className="text-slate-700 uppercase font-black block leading-tight">{op.client || op.entidad}</strong>
                  </td>
                  <td className="py-2 px-4 text-center font-mono text-slate-500">{op.rateIssue || op.tasaEmision}</td>
                  <td className="py-2 px-4 text-center font-mono text-[#0b5156] font-black">{op.rateCollection || op.tasaCobro}</td>
                  <td className="py-2 px-4 text-right font-mono font-bold text-slate-600">{op.amountUsd || op.montoUsd}</td>
                  <td className="py-2 px-4 text-right font-mono text-slate-400">{op.amountBsIssue || op.montoBsEmision}</td>
                  <td className="py-2 px-4 text-right font-mono text-slate-700 font-bold">{op.amountBsCollection || op.montoBsCobro}</td>
                  <td className={`py-2 px-4 text-right font-mono font-black ${op.diffType === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                    {op.diff || op.diferencial}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={8} className="text-center p-4 text-xs font-bold text-slate-400 uppercase">Sin operaciones en el período</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Technical Insight */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl flex gap-4 items-center group shadow-sm">
         <div className="bg-[#0b5156] text-white p-2.5 rounded-xl">
            <ArrowRightLeft size={18} />
         </div>
         <div className="space-y-0.5 flex-1">
            <h4 className="text-xs font-black text-[#0b5156] uppercase tracking-tighter leading-none">Nota sobre Realización Cambiaria</h4>
            <p className="text-[10px] font-bold text-slate-500 uppercase leading-relaxed max-w-4xl">
               {insight}
            </p>
         </div>
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

export default ExchangeDifferenceReport;
