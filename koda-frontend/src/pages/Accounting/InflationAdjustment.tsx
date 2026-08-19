import { 
  ArrowLeft,
  Settings,
  Zap,
  LineChart,
  Info,
  ArrowRight,
  Calculator,
  X
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '@/api/client';

const InflationAdjustment = () => {
  const [showIndexModal, setShowIndexModal] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [indices, setIndices] = useState<any[]>([]);
  const [inflacionAcumulada, setInflacionAcumulada] = useState(0);
  const [periodo, setPeriodo] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [adjustmentToast, setAdjustmentToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setAdjustmentToast({ message, type });
    setTimeout(() => setAdjustmentToast(null), 5000);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const data = await api.get<any>('/contabilidad/ajuste-inflacion');
      setItems(data?.items || []);
      // Map indexes to support both key sets
      const mappedIndices = (data?.indices || []).map((idx: any) => ({
        month: idx.month || idx.periodo,
        val: idx.val !== undefined ? idx.val : idx.indice
      }));
      setIndices(mappedIndices);
      setInflacionAcumulada(Number(data?.inflacion_acumulada || 0));
      setPeriodo(data?.periodo || '');
    } catch (err) {
      console.error("Error fetching inflation data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessAdjustment = async () => {
    if (!window.confirm('¿Está seguro de procesar el Ajuste por Inflación para el período actual? Esto creará un asiento contable automático.')) return;
    try {
      setIsProcessing(true);
      const res = await api.post<any>('/contabilidad/ajuste-inflacion/ejecutar', { periodo });
      if (res && res.ok) {
        showToast(`✅ Ajuste procesado exitosamente. Asiento N° ${res.asiento_id} generado por Bs. ${res.monto_ves.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, 'success');
        fetchData();
      }
    } catch (err: any) {
      showToast(err.message || 'Error al procesar el ajuste.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const totalHistoric = items.reduce((sum, item) => {
    const cleanVal = parseFloat(item.history?.replace(/[^0-9.-]/g, '') || '0');
    return sum + cleanVal;
  }, 0);

  const totalReexp = items.reduce((sum, item) => {
    const cleanVal = parseFloat(item.reexp?.replace(/[^0-9.-]/g, '') || '0');
    return sum + cleanVal;
  }, 0);

  const metrics = [
    { label: 'Inflación Acumulada', value: `${inflacionAcumulada.toFixed(1)}%`, desc: periodo ? `Periodo: ${periodo}` : 'Sin periodo cargado', color: 'text-[#0b5156]' },
    { label: 'Activos No Monetarios', value: `Bs. ${totalHistoric.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, desc: 'Valor Histórico', color: 'text-slate-800' },
    { label: 'Valor Reexpresado', value: `Bs. ${totalReexp.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, desc: `Moneda al ${periodo || 'cierre'}`, color: 'text-green-600' },
  ];

  return (
    <div className="space-y-1.5 animate-in fade-in duration-500 pb-4">
      {/* Header */}
      <header className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <Link to="/contabilidad" className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-[#0b5156]/20 transition-all">
                <ArrowLeft size={10} /> Volver
              </Link>
              <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Contabilidad &gt; Reexpresión Monetaria
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Ajuste por Inflación (Moneda Constante)</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Reexpresión de partidas no monetarias conforme a la NIC 29 y VEN-NIF.</p>
          </div>
          <div className="flex gap-2">
             <button 
              onClick={() => setShowIndexModal(true)}
              className="bg-white text-[#0b5156] px-6 py-2 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all"
             >
                <LineChart size={14} /> Cargar Índices (INPC)
             </button>
             <button 
              onClick={handleProcessAdjustment}
              disabled={isProcessing}
              className="bg-[#0b5156] text-white px-8 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all disabled:opacity-50"
             >
                <Zap size={14} /> {isProcessing ? 'Procesando...' : 'Procesar Reexpresión'}
             </button>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
        {metrics.map((m, i) => (
          <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24 hover:border-[#0b5156]/20 transition-all group">
             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{m.label}</span>
             <div className="space-y-1">
               <strong className={`text-lg font-black ${m.color} tracking-tighter font-mono uppercase`}>{m.value}</strong>
               <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">{m.desc}</p>
             </div>
          </div>
        ))}
      </section>

      {/* Cédula de Reexpresión */}
      <article className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="py-2.5 px-3.5 border-b border-slate-100 bg-slate-50/30 flex justify-between items-center">
          <div>
            <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Cédula de Reexpresión</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Aplicación de coeficientes por fecha de origen (Ajuste Integral).</p>
          </div>
          <button className="p-1.5 text-slate-400 hover:text-[#0b5156] transition-colors hover:bg-slate-100 rounded-lg">
             <Settings size={16} />
          </button>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-2 px-4">Cuenta / Partida</th>
                <th className="py-2 px-4">Origen</th>
                <th className="py-2 px-4 text-right">Histórico</th>
                <th className="py-2 px-4 text-center">Índice</th>
                <th className="py-2 px-4 text-center">Factor</th>
                <th className="py-2 px-4 text-right">Reexpresado</th>
                <th className="py-2 px-4 text-right">Efecto (AXI)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-bold uppercase">
                    Cargando partidas...
                  </td>
                </tr>
              ) : items.length > 0 ? (
                items.map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors group">
                    <td className="py-2 px-4">
                       <strong className="text-slate-700 uppercase font-black block leading-tight">{item.name}</strong>
                       <span className="text-[9px] font-bold text-[#0b5156] uppercase tracking-widest">Activo Fijo</span>
                    </td>
                    <td className="py-2 px-4 font-bold text-slate-400 uppercase">{item.date}</td>
                    <td className="py-2 px-4 text-right font-black font-mono text-slate-500">{item.history}</td>
                    <td className="py-2 px-4 text-center font-bold text-slate-400 font-mono">{item.index}</td>
                    <td className="py-2 px-4 text-center">
                       <span className="bg-slate-50 text-slate-600 px-2 py-0.5 rounded text-[10px] font-black font-mono border border-slate-100">{item.factor}</span>
                    </td>
                    <td className="py-2 px-4 text-right font-black font-mono text-slate-800">{item.reexp}</td>
                    <td className="py-2 px-4 text-right">
                      <span className="text-green-600 font-black font-mono">{item.axi}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-bold uppercase">
                    No se encontraron partidas no monetarias reexpresables en el período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Compliance Box */}
      <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 flex gap-4 relative overflow-hidden group">
         <Info size={24} className="text-blue-600 shrink-0 mt-0.5" />
         <div className="space-y-1.5 relative z-10">
            <h4 className="text-xs font-black text-blue-900 uppercase tracking-tight">Cumplimiento Normativo (NIC 29)</h4>
            <p className="text-[10px] font-bold text-blue-800/60 uppercase leading-relaxed max-w-4xl">
               El sistema identifica automáticamente las partidas <strong>no monetarias</strong> (Propiedad, Planta y Equipo, Inventarios, Patrimonio) y aplica el factor de ajuste basado en el INPC publicado. Las partidas monetarias generan el REME por diferencia.
            </p>
            <button onClick={() => setShowManual(true)} className="text-[10px] font-black text-blue-600 uppercase flex items-center gap-1 hover:underline">
               Leer manual de políticas contables <ArrowRight size={12} />
            </button>
         </div>
         <Calculator size={80} className="absolute -right-6 -bottom-6 text-blue-600/5 group-hover:rotate-12 transition-transform duration-700 pointer-events-none" />
      </div>

      {/* Index Modal */}
      {showIndexModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
           <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm" onClick={() => setShowIndexModal(false)} />
           <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                 <div className="space-y-1">
                    <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter leading-none">Carga de Índices INPC</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Actualización de tabla de inflación.</p>
                 </div>
                 <button onClick={() => setShowIndexModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                    <X size={20} />
                  </button>
              </div>

              <div className="p-5 space-y-3">
                 <div className="max-h-60 overflow-y-auto pr-2 space-y-2">
                    {(indices.length > 0 ? indices : [{ month: periodo || 'Periodo actual', val: '' }]).map((idx, i) => (
                       <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <span className="text-[10px] font-black text-slate-500 uppercase">{idx.month}</span>
                          <input type="number" defaultValue={idx.val} placeholder="0.00" className="w-24 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-black font-mono text-[#0b5156] outline-none focus:border-[#0b5156]" />
                       </div>
                    ))}
                 </div>
                 
                 <div className="grid grid-cols-2 gap-3 items-start mt-4">
                    <button onClick={() => setShowIndexModal(false)} className="py-3 text-[10px] font-black uppercase text-slate-500 hover:text-slate-700">Cancelar</button>
                    <button className="py-3 bg-[#0b5156] text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                       Guardar Índices
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Manual Modal */}
      {showManual && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
           <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm" onClick={() => setShowManual(false)} />
           <div className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[80vh]">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                 <div className="space-y-1">
                    <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter leading-none">Manual de Políticas Contables</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Normativa VEN-NIF y NIC 29.</p>
                 </div>
                 <button onClick={() => setShowManual(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                    <X size={20} />
                  </button>
              </div>
              <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-600 font-medium">
                 <h3 className="font-black text-slate-800 uppercase text-sm">1. Objetivo y Alcance</h3>
                 <p>El objetivo de esta política es establecer las bases para la reexpresión de los estados financieros de la empresa, reconociendo los efectos de la inflación conforme a la Norma Internacional de Contabilidad (NIC 29) y los lineamientos de la VEN-NIF.</p>
                 <h3 className="font-black text-slate-800 uppercase text-sm">2. Partidas No Monetarias</h3>
                 <p>Las partidas no monetarias (Ej. Propiedad, Planta y Equipo, Inventarios, Patrimonio) deben reexpresarse aplicando el factor de ajuste derivado del Índice Nacional de Precios al Consumidor (INPC) publicado por el Banco Central de Venezuela.</p>
                 <h3 className="font-black text-slate-800 uppercase text-sm">3. Resultado Monetario (REME)</h3>
                 <p>La diferencia neta originada por el mantenimiento de activos y pasivos monetarios durante un período de inflación se reconocerá en los resultados del período bajo la cuenta de Resultado Monetario del Ejercicio (REME).</p>
                 <h3 className="font-black text-slate-800 uppercase text-sm">4. Periodicidad</h3>
                 <p>El ajuste por inflación se procesará al cierre de cada ejercicio contable, salvo que la gerencia determine su ejecución mensual para fines de control gerencial.</p>
              </div>
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                  <button onClick={() => setShowManual(false)} className="py-2 px-6 bg-[#0b5156] text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                     Cerrar Manual
                  </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default InflationAdjustment;
