import { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  AlertTriangle, 
  Award, 
  X,
} from 'lucide-react';
import { api } from '@/api/client';

const CostProject = () => {
  const [currency, setCurrency] = useState('USD');
  const [showDrawer, setShowDrawer] = useState(false);
  const [projectData, setProjectData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await api.get<any>('/compras/analisis-costos');
        setProjectData(data);
      } catch (error) {
        console.error("Error fetching cost project data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const costHistory = projectData?.historial || [];
  const selectionMatrix = projectData?.matriz_seleccion || [];
  const qualityRanking = projectData?.ranking_calidad || [];
  const riskMatrix = projectData?.matriz_riesgo || [
    { label: 'Dependencia de Importación', val: '0%', p: '0%', color: 'bg-slate-300' },
    { label: 'Volatilidad de Precio', val: '0%', p: '0%', color: 'bg-slate-300' },
    { label: 'Estabilidad Proveedor', val: '0%', p: '0%', color: 'bg-slate-300' }
  ];
  const criticalMargin = projectData?.margen_critico || { costo: '$0.00', precio: '$0.00', margen: '0.0%' };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-8 rounded-3xl border border-[#bdafa1]/20 shadow-sm">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Análisis de Procura</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight max-w-2xl">
              Evaluación técnica y económica de suministros basada en rentabilidad real y ciclo de vida.
            </p>
          </div>
          <div className="flex gap-3">
             <button className="bg-white text-slate-500 px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-all">
               Exportar Informe
             </button>
             <button 
               onClick={() => setShowDrawer(true)}
               className="bg-[#0b5156] text-white px-8 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-[#0b5156]/20 hover:scale-105 transition-all"
             >
               Registrar Referencia
             </button>
          </div>
        </div>
      </header>

      <div className="space-y-6">
        {/* Nivel 1: Evolución de Costos */}
        <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm w-full">
          <div className="flex justify-between items-center mb-8">
             <div>
                <h2 className="text-xl font-black text-slate-800 tracking-tighter uppercase">Evolución de Costos</h2>
                <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-widest">Visualización histórica SHA-256</p>
             </div>
             <div className="flex bg-white p-1 rounded-xl">
                {['USD', 'Bs.'].map(curr => (
                  <button 
                    key={curr}
                    onClick={() => setCurrency(curr)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-black uppercase transition-all ${currency === curr ? 'bg-white text-[#0b5156] shadow-sm' : 'text-slate-400'}`}
                  >
                     {curr}
                  </button>
                ))}
             </div>
          </div>

          <div className="h-64 flex items-end gap-4 relative pt-10">
             {isLoading ? (
               <div className="w-full h-full flex items-center justify-center text-sm font-black text-slate-400 uppercase tracking-widest">
                 Cargando datos reales...
               </div>
             ) : costHistory.length > 0 ? costHistory.map((h: any, i: number) => (
               <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                  <div className="relative w-full flex flex-col items-center">
                     <span className="absolute -top-7 text-sm font-black text-slate-800 opacity-0 font-mono group-hover:opacity-100 transition-opacity">${h.val || h.valor}</span>
                     <div className={`w-full ${h.color || 'bg-slate-300'} rounded-t-xl transition-all duration-500 group-hover:scale-x-110`} style={{ height: h.height || `${(h.val || 0)}%` }}></div>
                  </div>
                  <span className="text-sm font-black text-slate-500 uppercase tracking-widest font-mono">{h.month || h.mes}</span>
               </div>
             )) : (
               <div className="w-full h-full flex items-center justify-center text-sm font-black text-slate-400 uppercase tracking-widest">
                 Sin historial de costos registrado.
               </div>
             )}
          </div>

          <div className="mt-10 p-5 bg-slate-50/50 rounded-2xl border border-slate-100 flex justify-between items-center">
             <div className="flex items-center gap-2">
                <TrendingUp className="text-[#0b5156]" size={16} />
                <span className="text-sm font-bold text-slate-500 uppercase tracking-tight">Variación interanual: <strong className="text-[#0b5156] font-black">{projectData?.variacion || '0.0%'}</strong></span>
             </div>
             <span className="text-sm font-black text-slate-500 uppercase">Moneda: <strong className="text-slate-800">{currency}</strong></span>
          </div>
        </article>

        {/* Nivel 2: Indicadores Clave */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          <article className="bg-white p-8 rounded-3xl border border-[#0b5156]/20 shadow-sm relative overflow-hidden group h-full flex flex-col justify-between">
             <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                <Award size={100} className="text-[#0b5156]" />
             </div>
             <h3 className="text-sm font-black uppercase tracking-[0.2em] text-[#0b5156] mb-6">Ahorro Proyectado</h3>
             <div className="space-y-4 relative z-10 flex flex-col flex-1 justify-between">
                <div className="text-center py-6">
                   <p className="text-sm font-bold text-slate-500 uppercase mb-2">Vs. Media de Mercado</p>
                   <h2 className="text-5xl font-black tracking-tighter text-[#43584b] font-mono">{projectData?.ahorro_valor || '$0.00'}</h2>
                   <p className="text-sm font-bold text-slate-500 uppercase mt-2">
                      Equivalente al <span className="text-[#43584b]">{projectData?.ahorro_pct || '0.0%'} del presupuesto</span>.
                   </p>
                </div>
                <button className="w-full bg-[#0b5156] text-white font-black py-4 rounded-2xl uppercase text-sm tracking-widest hover:scale-[1.02] transition-all">
                   Descargar Memoria
                </button>
             </div>
          </article>

          <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between h-full">
             <h2 className="text-lg font-black text-slate-800 tracking-tighter uppercase mb-6">Matriz de Riesgo</h2>
             <div className="space-y-8 flex-1 flex flex-col justify-center">
                {riskMatrix.map((r: any, i: number) => (
                  <div key={i} className="space-y-2">
                     <div className="flex justify-between items-end">
                        <span className="text-sm font-black text-slate-500 uppercase tracking-widest">{r.label || r.etiqueta}</span>
                        <span className="text-sm font-black uppercase font-mono text-slate-800">{r.val || r.valor || '0%'}</span>
                     </div>
                     <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${r.color || 'bg-slate-500'}`} style={{ width: r.p || r.porcentaje }}></div>
                     </div>
                  </div>
                ))}
             </div>
          </article>

          <article className="bg-white p-8 rounded-3xl border border-red-100 flex flex-col justify-between h-full">
             <div className="flex items-center gap-2 text-red-600 mb-6">
                <AlertTriangle size={20} />
                <h3 className="text-lg font-black uppercase tracking-tight">Margen Crítico</h3>
             </div>
             <div className="space-y-4 flex-1 flex flex-col justify-between">
                <div className="p-4 bg-slate-50/50 rounded-2xl border border-red-50 space-y-3 text-sm font-black uppercase flex-1 flex flex-col justify-center">
                   <div className="flex justify-between text-slate-500"><span>Costo Reposición</span><span className="text-red-600 font-mono">{criticalMargin.costo}</span></div>
                   <div className="flex justify-between text-slate-500"><span>Precio Venta</span><span className="font-mono">{criticalMargin.precio}</span></div>
                   <div className="border-t border-red-50 pt-3 flex justify-between items-end mt-4">
                      <span className="text-slate-500">Margen Actual</span>
                      <strong className="text-3xl font-black text-red-600 tracking-tighter font-mono">{criticalMargin.margen}</strong>
                   </div>
                </div>
                <button className="w-full bg-red-600 text-white font-black py-4 rounded-2xl uppercase text-sm tracking-widest hover:bg-red-700 transition-all">
                   Actualizar Precios
                </button>
             </div>
          </article>
        </div>

        {/* Nivel 3: Matriz de Selección */}
        <article className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden w-full">
          <div className="p-8 bg-slate-50/50 border-b border-slate-100">
             <h2 className="text-xl font-black text-slate-800 tracking-tighter uppercase">Matriz de Selección</h2>
             <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-widest">Ponderación: Precio (40%) · Calidad (30%) · Entrega (30%)</p>
          </div>
          <div className="overflow-x-auto no-scrollbar">
             <table className="w-full text-left">
                <thead>
                   <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/30">
                      <th className="py-4 px-6">PROVEEDOR</th>
                      <th className="py-4 px-4 text-center">SCORE</th>
                      <th className="py-4 px-6 text-right">COSTO MENSUAL</th>
                      <th className="py-4 px-6 text-center">VEREDICTO</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                   {isLoading ? (
                     <tr>
                       <td colSpan={4} className="py-10 text-center text-xs font-black text-slate-400 uppercase tracking-widest">Cargando proveedores...</td>
                     </tr>
                   ) : selectionMatrix.length > 0 ? selectionMatrix.map((item: any, i: number) => (
                     <tr key={i} className={`group hover:bg-[#bdafa1]/5 transition-colors ${item.status === 'MÁS RENTABLE' ? 'bg-[#8fb09f]/5' : ''}`}>
                        <td className="py-5 px-6">
                           <div className="flex flex-col">
                              <span className="text-sm font-black text-slate-800 uppercase">{item.name || item.nombre}</span>
                              <span className="text-xs font-bold text-slate-500 font-mono">{item.offer || item.oferta}</span>
                           </div>
                        </td>
                        <td className="py-5 px-4 text-center">
                           <div className={`mx-auto w-10 h-10 rounded-full border flex items-center justify-center font-black text-xs font-mono ${(item.score || item.puntaje) > 85 ? 'border-[#0b5156] text-[#0b5156] bg-[#0b5156]/5' : 'border-slate-200 text-slate-500'}`}>
                              {item.score || item.puntaje}
                           </div>
                        </td>
                        <td className="py-5 px-6 text-right text-sm font-black text-slate-800 font-mono">{item.costLife || item.costo_vida}</td>
                        <td className="py-5 px-6 text-center">
                           <span className={`${item.color || 'bg-slate-100 text-slate-800'} text-xs font-black px-2 py-0.5 rounded uppercase border`}>{item.status || item.estado}</span>
                        </td>
                     </tr>
                   )) : (
                     <tr>
                       <td colSpan={4} className="py-10 text-center text-xs font-black text-slate-400 uppercase tracking-widest">No hay proveedores evaluados.</td>
                     </tr>
                   )}
                </tbody>
             </table>
          </div>
        </article>

        {/* Nivel 4: Conclusiones */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between h-full">
             <div className="mb-6">
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-800 mb-1">Ranking de Calidad</h3>
                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Análisis de merma trimestral</p>
             </div>
             <div className="space-y-3 flex-1 flex flex-col justify-center">
                {qualityRanking.length > 0 ? qualityRanking.map((item: any, i: number) => (
                  <div key={i} className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-2">
                     <div className="flex justify-between items-center">
                        <span className="text-sm font-black text-slate-800 uppercase">{item.n || item.nombre}</span>
                        <span className="text-sm font-black text-slate-800 font-mono">{item.val || item.valor}</span>
                     </div>
                     <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full ${item.color || 'bg-slate-500'}`} style={{ width: `${item.p || 0}%` }}></div>
                     </div>
                     {item.alert && (
                       <p className="text-xs font-black text-red-600 uppercase leading-tight mt-1">
                           ⚠️ Excede umbral de merma (5%).
                       </p>
                     )}
                  </div>
                )) : (
                  <div className="py-10 text-center text-xs font-black text-slate-400 uppercase tracking-widest">
                    Sin registros de calidad.
                  </div>
                )}
             </div>
          </article>

          <article className="bg-white p-8 rounded-3xl border border-[#0b5156]/20 shadow-sm flex flex-col h-full">
             <h3 className="text-sm font-black uppercase tracking-[0.2em] text-[#0b5156] mb-6">Veredicto Técnico</h3>
             <div className="p-6 bg-[#8fb09f]/10 rounded-2xl border-l-4 border-[#0b5156] flex-1 flex items-center">
                <p className="text-sm font-bold text-slate-800 leading-relaxed uppercase">
                   {projectData?.veredicto || 'Sin datos suficientes para emitir un veredicto técnico y económico preciso en este momento.'}
                </p>
             </div>
          </article>
        </div>
      </div>

      {showDrawer && (
        <div className="fixed inset-0 z-[200] overflow-hidden">
           <div className="absolute inset-0 bg-[#3c3023]/40 backdrop-blur-sm transition-opacity" onClick={() => setShowDrawer(false)}></div>
           <div className="absolute inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl animate-in slide-in-from-right duration-300">
              <div className="h-full flex flex-col p-8">
                 <div className="flex justify-between items-center mb-10">
                    <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Registrar Referencia</h3>
                    <button onClick={() => setShowDrawer(false)} className="text-slate-500 hover:text-slate-800"><X size={24} /></button>
                 </div>
                 
                 <div className="space-y-8 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    <div className="space-y-6">
                       <div className="space-y-1.5">
                          <label className="text-sm font-black text-slate-500 uppercase tracking-widest">Competidor</label>
                          <input type="text" placeholder="Ej: Amazon Business..." className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156] uppercase" />
                       </div>
                       <div className="space-y-1.5">
                          <label className="text-sm font-black text-slate-500 uppercase tracking-widest">Precio (USD)</label>
                          <input type="number" placeholder="0.00" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]" />
                       </div>
                    </div>
                 </div>

                 <div className="pt-8 space-y-3">
                    <button className="w-full bg-[#0b5156] text-white font-black py-4 rounded-2xl uppercase text-sm tracking-widest shadow-xl shadow-[#0b5156]/20 hover:scale-[1.02] transition-all">
                       Guardar Registro
                    </button>
                    <button onClick={() => setShowDrawer(false)} className="w-full bg-white text-slate-500 font-black py-4 rounded-2xl uppercase text-sm tracking-widest hover:bg-slate-50 transition-all">
                       Cancelar
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default CostProject;
