import { 
  Plus, 
  Search, 
  ArrowLeft,
  Settings2,
  ChevronRight,
  ChevronDown,
  Activity,
  Users,
  Target,
  X,
  Save
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const CostCenters = () => {
  const [showDrawer, setShowDrawer] = useState(false);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [treeData, setTreeData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchCentros();
  }, []);

  const fetchCentros = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<any[]>('/contabilidad/centros-costo');
      if (Array.isArray(res) && res.length > 0) {
        setTreeData(res);
      } else {
        setTreeData([]);
      }
    } catch (error) {
      console.error("Error fetching cost centers:", error);
      setTreeData([]);
    } finally {
      setIsLoading(false);
    }
  };



  const handleConfigClick = (node: any) => {
    setSelectedNode(node);
    setShowDrawer(true);
  };

  const TreeNode = ({ node, depth = 0 }: { node: any; depth?: number }) => {
    const [isOpen, setIsOpen] = useState(true);
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div className={`${depth > 0 ? 'ml-4 mt-1' : ''} animate-in slide-in-from-left-2 duration-300`}>
        <div className={`relative group ${node.isRoot ? 'border-l-[4px] border-l-[#0b5156]' : 'border-l-2 border-l-slate-200'} bg-white rounded-xl border border-slate-200 shadow-sm transition-all hover:border-[#0b5156]/40 overflow-hidden`}>
           <div className="py-1.5 px-3">
              <div className="grid grid-cols-1 md:grid-cols-12 items-center gap-3 items-start">
                 <div className="md:col-span-4 flex items-center gap-3">
                    {hasChildren && (
                      <button onClick={() => setIsOpen(!isOpen)} className="p-1 hover:bg-white rounded-md transition-colors text-slate-400">
                         {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    )}
                    <div className="space-y-1">
                       <span className="text-[10px] font-mono font-black text-[#0b5156] bg-[#0b5156]/10 px-1.5 py-0.5 rounded leading-none">{node.code}</span>
                       <h3 className="text-sm font-black text-slate-700 uppercase tracking-tight leading-none">{node.name}</h3>
                    </div>
                 </div>

                 <div className="md:col-span-2 space-y-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Resultado</span>
                    <strong className={`text-xs font-black block font-mono ${node.result.includes('+') ? 'text-green-600' : 'text-red-500'}`}>{node.result}</strong>
                 </div>

                 <div className="md:col-span-3 space-y-2">
                    <div className="flex justify-between items-center">
                       <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Presupuesto: {node.budget}%</span>
                    </div>
                    <div className="h-1.5 bg-white rounded-full overflow-hidden">
                       <div 
                         className={`h-full transition-all duration-1000 ${node.budget > 100 ? 'bg-red-500' : node.budget > 85 ? 'bg-amber-500' : 'bg-[#0b5156]'}`} 
                         style={{ width: `${Math.min(node.budget, 100)}%` }} 
                       />
                    </div>
                 </div>

                 <div className="md:col-span-2 flex items-center justify-center">
                    <div className="flex items-end gap-1 h-6">
                       {[0.4, 0.6, 0.8, 0.95].map((h, i) => (
                         <div key={i} className={`w-1 bg-[#0b5156] rounded-t-sm transition-all ${i === 3 ? 'opacity-100' : 'opacity-30'}`} style={{ height: `${h * 100}%` }} />
                       ))}
                    </div>
                 </div>

                 <div className="md:col-span-1 text-right">
                    <button onClick={() => handleConfigClick(node)} className="p-2 text-slate-300 hover:text-[#0b5156] hover:bg-slate-50 rounded-xl transition-all border border-transparent hover:border-slate-200">
                       <Settings2 size={18} />
                    </button>
                 </div>
              </div>

              {/* Extended Details (for main nodes) */}
              {node.responsible && (
                <div className="mt-1.5 pt-1.5 border-t border-slate-100 grid grid-cols-2 md:grid-cols-6 gap-2 items-start">
                   <div className="space-y-1">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Responsable</span>
                      <p className="text-[10px] font-bold text-slate-700 uppercase flex items-center gap-1"><Users size={10} /> {node.responsible}</p>
                   </div>
                   <div className="space-y-1 text-center">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Disponibilidad</span>
                      <p className="text-[10px] font-black text-[#0b5156] font-mono tracking-tighter">{node.available || 'N/A'}</p>
                   </div>
                   <div className="space-y-1 md:col-span-2">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">Mayor Impacto</span>
                      <p className="text-[10px] font-bold text-slate-500 uppercase leading-none truncate">{node.topExpense}</p>
                   </div>
                   <div className="space-y-1 text-right md:col-span-2">
                      <span className={`${node.statusColor} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter`}>{node.status}</span>
                   </div>
                </div>
              )}
           </div>
        </div>

        {isOpen && hasChildren && (
          <div className="relative">
             <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-white -z-10" />
             {node.children.map((child: any, i: number) => (
                <TreeNode key={i} node={child} depth={depth + 1} />
             ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-1.5 animate-in fade-in duration-500 pb-4 relative">
      {/* Header */}
      <header className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <Link to="/contabilidad" className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-[#0b5156]/20 transition-all">
                <ArrowLeft size={10} /> Volver
              </Link>
              <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Auditoría Analítica Total
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Monitor de Centros de Costo</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Vista jerárquica completa de la organización con proyecciones y control presupuestario.</p>
          </div>
          <div className="flex gap-2">
             <button className="bg-[#0b5156] text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <Plus size={14} /> Nuevo Centro
             </button>
             <button className="bg-white text-slate-500 px-6 py-2 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-slate-50 transition-all">
                🗂️ Exportar Matriz
             </button>
          </div>
        </div>
      </header>

      {/* Analytical Monitor */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden relative group">
         <div className="py-2 px-3.5 border-b border-slate-100 bg-slate-50/30 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-3">
               <div className="bg-blue-600/10 p-2 rounded-xl border border-blue-600/10">
                  <Activity size={18} className="text-blue-600" />
               </div>
               <div className="space-y-1">
                  <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Estructura Analítica de Costos</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Monitoreo en tiempo real de márgenes por unidad de negocio.</p>
               </div>
            </div>
            <div className="flex gap-4">
               <div className="text-right">
                  <span className="text-[9px] font-black text-slate-400 uppercase block mb-0.5">Resultado Global</span>
                  <strong className={`text-lg font-black font-mono tracking-tighter ${treeData.length > 0 ? 'text-green-600' : 'text-slate-400'}`}>{treeData.length > 0 ? '+$34,000.00' : '$0.00'}</strong>
               </div>
               <div className="w-[1px] bg-slate-200 h-8 my-auto" />
               <div className="text-right">
                  <span className="text-[9px] font-black text-slate-400 uppercase block mb-0.5">Variación Mensual</span>
                  <strong className={`text-lg font-black font-mono tracking-tighter ${treeData.length > 0 ? 'text-amber-500' : 'text-slate-400'}`}>{treeData.length > 0 ? '▲ 12.5%' : '0.0%'}</strong>
               </div>
            </div>
         </div>

         <div className="p-2 space-y-1 relative z-10">
           {isLoading ? (
              <div className="text-center py-10 text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse">
                Cargando centros de costo...
              </div>
           ) : treeData.length > 0 ? (
             treeData.map((root, i) => (
               <TreeNode key={i} node={root} />
             ))
           ) : (
              <div className="text-center py-20 bg-white rounded-xl border border-slate-200">
                 <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tighter mb-1">Sin Centros de Costo</h3>
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No hay centros registrados en el sistema.</p>
              </div>
           )}
         </div>
         <div className="absolute right-0 bottom-0 w-96 h-96 bg-[#0b5156]/5 rounded-full blur-[120px] group-hover:bg-[#0b5156]/10 transition-all duration-1000" />
      </section>

      {/* Configuration Drawer */}
      {showDrawer && (
        <div className="fixed inset-0 z-[200] animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowDrawer(false)} />
           <div className="absolute top-0 right-0 bottom-0 w-full max-w-md bg-white shadow-2xl border-l border-slate-200 animate-in slide-in-from-right duration-500 flex flex-col">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                 <div className="space-y-1">
                    <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter leading-none">Configurar Centro</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Gestión: {selectedNode?.name}</p>
                 </div>
                 <button onClick={() => setShowDrawer(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                    <X size={20} />
                 </button>
              </div>

              <div className="p-5 flex-1 overflow-y-auto space-y-5">
                 <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Código del Centro</span>
                    <strong className="text-[#0b5156] font-mono text-base font-black">{selectedNode?.code}</strong>
                 </div>

                 <div className="space-y-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Responsable Asignado</label>
                       <div className="relative">
                          <Users className="absolute left-3 top-3 text-slate-400" size={14} />
                          <select className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-10 pr-4 py-3 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156] appearance-none" defaultValue={selectedNode?.responsible}>
                             <option>Carlos Mendoza</option>
                             <option>Juan Pérez</option>
                             <option>Marta Gómez</option>
                             <option>Gerencia General</option>
                          </select>
                       </div>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Presupuesto Mensual (USD)</label>
                       <div className="relative">
                          <Target className="absolute left-3 top-3 text-slate-400" size={14} />
                          <input type="text" className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-10 pr-4 py-3 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156]" defaultValue="12,500.00" />
                       </div>
                    </div>

                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 space-y-3">
                       <div className="flex justify-between items-center">
                          <div className="space-y-0.5">
                             <p className="text-xs font-black text-amber-900 uppercase">Alertas Presupuestarias</p>
                             <p className="text-[9px] font-bold text-amber-700/60 uppercase">Notificar cuando exceda el límite.</p>
                          </div>
                          <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500" />
                       </div>
                       <div className="flex items-center gap-3">
                          <div className="flex-1 h-1 bg-amber-200 rounded-full overflow-hidden">
                             <div className="h-full bg-amber-500" style={{ width: '80%' }} />
                          </div>
                          <span className="text-[9px] font-black text-amber-700 uppercase">80% Umbral</span>
                       </div>
                    </div>
                 </div>
              </div>

              <div className="p-5 bg-slate-50 border-t border-slate-100">
                 <button onClick={() => setShowDrawer(false)} className="w-full py-3 bg-[#0b5156] text-white rounded-xl text-[10px] font-black uppercase shadow-lg hover:bg-[#083a3d] transition-all flex items-center justify-center gap-2">
                    <Save size={14} /> Guardar Cambios
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};


export default CostCenters;
