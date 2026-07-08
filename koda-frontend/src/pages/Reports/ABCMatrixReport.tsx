import { 
  ArrowLeft,
  Download,
  Zap,
  CircleHelp,
  Star,
  Skull,
  Activity
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const ABCMatrixReport = () => {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMatrix = async () => {
      try {
        const res = await api.get<any>('/reportes/matriz-abc');
        setData(res);
      } catch (error) {
        console.error("Error fetching ABC matrix:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchMatrix();
  }, []);

  const quadrants = data?.quadrants || [];

  const insight = data?.insight || "El algoritmo clasifica el inventario actual. Los productos en Estrellas deben tener stock garantizado. Las Vacas deben optimizarse para flujo. Los Perros representan capital atrapado; se recomienda liquidarlos.";

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
                Inventario Estratégico
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Matriz ABC de Inventario</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Clasificación estratégica de productos por Rotación vs Rentabilidad.</p>
          </div>
          <div className="flex gap-2">
             <button className="bg-white text-slate-500 px-6 py-2 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2">
                Parámetros de Algoritmo
             </button>
             <button className="bg-[#0b5156] text-white px-8 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <Download size={14} /> Exportar Estrategia
             </button>
          </div>
        </div>
      </header>

      {/* Matrix Grid */}
      <div className="relative mt-2 mb-2">
         {/* Axis Labels - Horizontal Style */}
         <div className="flex justify-between items-center mb-2 px-1">
            <div className="text-[9px] font-black text-[#0b5156] bg-[#0b5156]/10 px-2.5 py-0.5 rounded-full uppercase tracking-[0.2em] leading-none">
               ↑ Alta Rentabilidad (Margen %)
            </div>
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none">
               Matriz Estratégica Rotación vs Margen
            </div>
         </div>

         <section className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
            {quadrants.map((q: any) => {
              let IconComp = q.icon;
              if (!IconComp) {
                if (q.id === 'questions') IconComp = <CircleHelp size={18} className="text-blue-500" />;
                else if (q.id === 'stars') IconComp = <Star size={18} className="text-[#0b5156]" />;
                else if (q.id === 'dogs') IconComp = <Skull size={18} className="text-red-500" />;
                else if (q.id === 'cows') IconComp = <Activity size={18} className="text-green-600" />;
              }

              return (
              <div key={q.id} className={`p-4 rounded-xl border-2 border-dashed ${q.color || 'border-slate-300'} flex flex-col gap-3 group hover:border-solid transition-all duration-500`}>
                 <div className="flex justify-between items-start">
                    <div className="space-y-0.5">
                       <h3 className={`text-base font-black uppercase tracking-tighter leading-none flex items-center gap-2 ${q.textColor || 'text-slate-700'}`}>
                          {IconComp}
                          {q.title || q.titulo}
                       </h3>
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{q.subtitle || q.subtitulo}</p>
                    </div>
                 </div>
                 
                 <p className="text-[9px] font-bold text-slate-400 uppercase leading-relaxed border-b border-slate-100 pb-2">{q.desc || q.descripcion}</p>

                 <div className="space-y-1.5">
                    {q.items && q.items.length > 0 ? q.items.map((item: any, idx: number) => (
                      <div key={idx} className="bg-white border border-slate-200 p-2.5 rounded-xl flex justify-between items-center shadow-sm hover:shadow-md transition-all group/item">
                         <strong className="text-xs font-black text-slate-700 uppercase">{item.name || item.nombre}</strong>
                         <span className={`text-[10px] font-black uppercase ${q.textColor || 'text-slate-500'}`}>{item.value || item.valor}</span>
                      </div>
                    )) : (
                      <div className="text-center p-2 text-[10px] font-bold text-slate-400 uppercase">Sin productos</div>
                    )}
                 </div>
              </div>
            )})}
         </section>
         
         {/* Bottom Axis Label - Horizontal */}
         <div className="mt-2 flex justify-center">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] bg-white px-3 py-1 rounded-full flex items-center gap-1.5 border border-slate-100 shadow-sm leading-none">
               ← Baja Rotación <span className="text-slate-300">|</span> Alta Rotación →
            </div>
         </div>
      </div>

      {/* Recommended Strategy Insight */}
      <div className="p-4 bg-[#0b5156] rounded-xl text-white shadow-lg relative overflow-hidden flex gap-4 items-center group">
         <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-white/60 border border-white/20 group-hover:scale-110 transition-transform">
            <Zap size={18} className="text-amber-400" />
         </div>
         <div className="flex-1 space-y-0.5">
            <h4 className="text-xs font-black uppercase tracking-tighter">📢 Estrategia Recomendada por KODA</h4>
            <p className="text-[10px] font-bold text-white/60 uppercase leading-relaxed max-w-4xl">
               {insight}
            </p>
         </div>
         <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-3xl pointer-events-none" />
      </div>
    </div>
  );
};

export default ABCMatrixReport;
