import { 
  Plus, 
  Search, 
  Filter, 
  ArrowLeft,
  FileText,
  Settings,
  Database
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const ISLRConcepts = () => {
  const [concepts, setConcepts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchConcepts();
  }, []);

  const fetchConcepts = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<any>('/fiscal/conceptos-islr');
      setConcepts((res?.conceptos || []).map((c: any) => ({
        code: c.codigo,
        name: c.nombre,
        pj: c.pj,
        pn: c.pn,
        sust: c.sust,
        base: c.base
      })));
    } catch (error) {
      console.error("Error al cargar los conceptos de retención:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredConcepts = concepts.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.code.includes(searchQuery)
  );

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
                Maestro de Conceptos
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Conceptos de Retención ISLR</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Tabla maestra de alícuotas y sustraendos según el Reglamento de la Ley de ISLR.</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
             <button className="bg-[#0b5156] text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <Plus size={14} /> Nuevo Concepto
             </button>
             <button className="bg-white text-[#0b5156] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <Database size={14} /> Importar SENIAT
             </button>
             <button className="bg-white text-[#0b5156] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <FileText size={14} /> Reporte Alícuotas
             </button>
          </div>
        </div>
      </header>

      {/* Catalog Section */}
      <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50">
          <div className="space-y-1">
            <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Catálogo de Actividades Gravables</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Definiciones técnicas para el cálculo automatizado de retenciones.</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
             <div className="relative flex-1 md:flex-none">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar concepto o código..." 
                  className="w-full md:w-64 bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-1.5 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156] shadow-sm" 
                />
             </div>
             <button className="p-1.5 bg-white text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-50 shadow-sm transition-all">
                <Filter size={14} />
             </button>
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-2.5 px-4">Código</th>
                <th className="py-2.5 px-4">Descripción del Concepto</th>
                <th className="py-2.5 px-4 text-center">% PJ (Res)</th>
                <th className="py-2.5 px-4 text-center">% PN (Res)</th>
                <th className="py-2.5 px-4 text-right">Sustraendo (UT)</th>
                <th className="py-2.5 px-4 text-center">Base Imponible</th>
                <th className="py-2.5 px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse">
                    Cargando conceptos...
                  </td>
                </tr>
              ) : filteredConcepts.length > 0 ? filteredConcepts.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="py-2.5 px-4">
                    <span className="bg-[#0b5156] text-white font-mono font-black px-2 py-0.5 rounded text-[10px]">
                      {row.code}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-black text-slate-700 uppercase tracking-tight truncate max-w-[250px]">{row.name}</td>
                  <td className="py-2.5 px-4 text-center font-black font-mono text-[#0b5156]">{row.pj}</td>
                  <td className="py-2.5 px-4 text-center font-black font-mono text-slate-500">{row.pn}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-400">{row.sust}</td>
                  <td className="py-2.5 px-4 text-center font-bold text-slate-400 uppercase text-[10px]">{row.base}</td>
                  <td className="py-2.5 px-4 text-right">
                    <button className="text-[10px] font-black text-slate-400 uppercase hover:text-[#0b5156] transition-colors">Editar</button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                    No se encontraron conceptos
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

    </div>
  );
};

export default ISLRConcepts;
