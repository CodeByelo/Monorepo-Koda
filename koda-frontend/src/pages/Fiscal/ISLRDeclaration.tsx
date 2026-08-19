import { 
  ArrowLeft, 
  ShieldCheck, 
  TrendingUp,
  Download,
  History,
  BarChart3,
  Calendar
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const ISLRDeclaration = () => {
  const currentYear = new Date().getFullYear().toString();
  const [periodo, setPeriodo] = useState(currentYear);
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDeclaracion();
  }, [periodo]);

  const fetchDeclaracion = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<any>(`/fiscal/declaracion-islr?periodo=${periodo}`);
      setData(res || null);
    } catch (error) {
      console.error("Error fetching ISLR declaration:", error);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (val: number | string | undefined | null) => {
    if (val === undefined || val === null) return "0.00";
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return val;
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2 });
  };

  const metrics = data?.metricas || [];

  const calculationRows = data?.calculo || [];
  const historial = data?.historial || [];

  return (
    <div className="space-y-3 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <Link to="/fiscal" className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-[#0b5156]/20 transition-all">
                <ArrowLeft size={10} /> Volver a Fiscal
              </Link>
              <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Fiscal — SENIAT
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Declaración ISLR — Impuesto sobre la Renta</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Preparación anual del ISLR. Ingresos brutos, costos, deducciones y determinación del impuesto.</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end items-center">
             <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mr-2">
                <Calendar size={14} className="text-slate-400" />
                <select 
                  value={periodo} 
                  onChange={(e) => setPeriodo(e.target.value)}
                  className="bg-transparent text-xs font-black text-[#0b5156] outline-none"
                >
                  {[currentYear, (parseInt(currentYear) - 1).toString(), (parseInt(currentYear) - 2).toString()].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
             </div>
             <Link to="/fiscal/retenciones-islr" className="bg-white text-[#0b5156] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <ShieldCheck size={14} /> Retenciones ISLR
             </Link>
             <button className="bg-[#0b5156] text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <Download size={14} /> Exportar Declaración
             </button>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-32 bg-white rounded-3xl border border-slate-200 shadow-sm animate-in fade-in zoom-in duration-500">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-[#0b5156] rounded-full animate-spin mb-4"></div>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Cargando Declaración ISLR...</p>
        </div>
      ) : (
        <>
          {/* Metrics Grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            {metrics.map((m: any, i: number) => (
              <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest leading-tight">{m.label}</p>
                <div className="space-y-1">
                  <strong className={`text-xl font-black ${m.color || 'text-slate-700'} tracking-tighter font-mono`}>{m.value.startsWith('Bs.') ? m.value : (isNaN(parseFloat(m.value)) ? m.value : `Bs. ${formatCurrency(m.value)}`)}</strong>
                  <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">{m.desc}</p>
                </div>
              </div>
            ))}
          </section>

          {/* Determination Section */}
          <article className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
              <div className="space-y-1">
                <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter leading-none">Determinación del ISLR — Ejercicio {periodo}</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cálculo según tarifa progresiva en Unidades Tributarias (U.T.)</p>
              </div>
              <BarChart3 className="text-slate-200" size={32} />
            </div>

            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                    <th className="py-2.5 px-4">Concepto</th>
                    <th className="py-4 px-4 text-right">Monto (Bs.)</th>
                    <th className="py-2.5 px-4">Notas de Auditoría</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-[12px]">
                  {calculationRows.length > 0 ? calculationRows.map((row: any, i: number) => (
                    <tr key={i} className={`hover:bg-slate-50/50 transition-colors ${row.isHighlight ? 'bg-[#0b5156]/5' : ''}`}>
                      <td className={`py-2.5 px-4 uppercase ${row.isBold || row.isHighlight ? 'font-black text-[#0b5156]' : 'font-bold text-slate-600'}`}>
                        {row.concept}
                      </td>
                      <td className={`py-4 px-4 text-right font-mono ${row.isHighlight ? 'text-xl font-black' : 'font-black'} ${row.color || 'text-slate-700'}`}>
                        Bs. {formatCurrency(row.amount)}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-slate-400 uppercase text-[10px]">
                        {row.notes}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                        No hay datos calculados para este ejercicio
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-8 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-3">
                 <button className="bg-white text-slate-600 px-6 py-2 px-4 rounded-lg text-[10px] font-black uppercase border border-slate-200 hover:bg-slate-50 transition-all">Generar PDF</button>
                 <Link to="/fiscal/obligaciones" className="bg-[#0b5156] text-white px-8 py-2 px-4 rounded-lg text-[10px] font-black uppercase shadow-lg shadow-green-900/20 hover:scale-[1.02] transition-all">
                    Registrar Obligación
                 </Link>
            </div>
          </article>

          {/* History */}
          <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center">
              <div className="space-y-1">
                <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter leading-none">Historial de Declaraciones ISLR</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ejercicios anteriores presentados ante el SENIAT.</p>
              </div>
              <History className="text-slate-200" size={32} />
            </div>
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">
                    <th className="py-2.5 px-4">Ejercicio</th>
                    <th className="py-4 px-4 text-right">Enriquecimiento Neto</th>
                    <th className="py-4 px-4 text-right">ISLR Pagado</th>
                    <th className="py-4 px-4 text-center">Fecha Pres.</th>
                    <th className="py-2.5 px-4 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-[11px] text-slate-600 font-bold">
                  {historial.length > 0 ? historial.map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-4 font-black text-[#0b5156] uppercase">{row.p}</td>
                      <td className="py-4 px-4 text-right font-mono">Bs. {formatCurrency(row.e)}</td>
                      <td className="py-4 px-4 text-right font-mono font-black text-slate-800">Bs. {formatCurrency(row.pgo)}</td>
                      <td className="py-4 px-4 text-center font-mono">{row.date}</td>
                      <td className="py-2.5 px-4 text-center">
                        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[9px] font-black uppercase">Presentada</span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                        No hay historial de declaraciones
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* Advice Section */}
      <div className="p-6 bg-[#0b5156] rounded-[2rem] border border-[#0b5156]/10 shadow-xl flex gap-6 items-center">
        <div className="bg-white/10 p-4 rounded-2xl text-white">
           <TrendingUp size={24} />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-black text-white uppercase tracking-tight">Análisis de Conciliación Fiscal-Contable</h4>
          <p className="text-[10px] text-white/60 font-bold uppercase leading-relaxed max-w-2xl">
            Ejecute la conciliación para comparar el enriquecimiento neto contable y el fiscal antes del cierre definitivo.
          </p>
        </div>
        <button className="bg-white text-teal-900 text-[10px] font-black px-6 py-3 rounded-xl uppercase tracking-widest hover:scale-105 transition-all ml-auto force-text-koda">
          Iniciar Análisis
        </button>
      </div>
    </div>
  );
};

export default ISLRDeclaration;
