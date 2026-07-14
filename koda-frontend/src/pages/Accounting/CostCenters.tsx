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
  Save,
  Trash2,
  Zap,
  ShieldAlert,
  Download
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api, BASE_URL } from '@/api/client';
import { createPortal } from 'react-dom';

const CostCenters = () => {
  const [showDrawer, setShowDrawer] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [treeData, setTreeData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Forms & Loading states
  const [createForm, setCreateForm] = useState({ codigo: '', nombre: '', responsable: 'Gerencia General', presupuesto: '' });
  const [drawerForm, setDrawerForm] = useState({ nombre: '', responsable: 'Gerencia General', presupuesto: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [employees, setEmployees] = useState<string[]>([]);

  useEffect(() => {
    fetchCentros();
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const res = await api.get<any>('/rrhh/empleados?limit=100');
      if (res && Array.isArray(res.data)) {
        const names = res.data.map((e: any) => `${e.nombres} ${e.apellidos}`);
        setEmployees(['Gerencia General', ...names]);
      }
    } catch (err) {
      console.error("Error loading employees:", err);
    }
  };

  const handleExportMatrix = async () => {
    try {
      const token = localStorage.getItem('koda_token') || localStorage.getItem('sgd_token') || '';
      const response = await fetch(`${BASE_URL}/contabilidad/centros-costo/exportar`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Error al exportar la matriz de centros de costo');
      const blob = await response.blob();
      const fileURL = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = fileURL;
      link.setAttribute('download', 'Matriz-Centros-Costo.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(fileURL);
      showNotification('Matriz exportada con éxito', 'success');
    } catch (err: any) {
      showNotification(err.message || 'Error al exportar matriz', 'error');
    }
  };

  const showNotification = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchCentros = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<any[]>('/contabilidad/centros-costo');
      if (Array.isArray(res) && res.length > 0) {
        const mapped = res.map(cc => {
          const budgetVal = cc.presupuesto ? parseFloat(cc.presupuesto) : 0;
          return {
            id: cc.id,
            code: cc.codigo,
            name: cc.nombre,
            responsible: cc.responsable || 'Gerencia General',
            budgetVal: budgetVal,
            budget: 0,
            result: '$0.00',
            available: 'N/A',
            topExpense: 'Sin egresos registrados',
            status: cc.activo ? 'Activo' : 'Inactivo',
            statusColor: cc.activo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500',
            isRoot: true,
            activo: cc.activo
          };
        });
        setTreeData(mapped);
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
    setDrawerForm({
      nombre: node.name,
      responsable: node.responsible,
      presupuesto: node.budgetVal ? String(node.budgetVal) : ''
    });
    setShowDrawer(true);
  };

  const handleCreateCostCenter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.codigo.trim() || !createForm.nombre.trim()) {
      showNotification('Código y Nombre son campos obligatorios', 'error');
      return;
    }
    try {
      setIsSaving(true);
      const budgetVal = createForm.presupuesto ? parseFloat(createForm.presupuesto) : null;
      await api.post('/contabilidad/centros-costo', {
        codigo: createForm.codigo.toUpperCase(),
        nombre: createForm.nombre,
        responsable: createForm.responsable,
        presupuesto: budgetVal
      });
      showNotification('Centro de costo creado exitosamente', 'success');
      setShowCreateModal(false);
      setCreateForm({ codigo: '', nombre: '', responsable: 'Gerencia General', presupuesto: '' });
      fetchCentros();
    } catch (err: any) {
      console.error(err);
      showNotification(err.message || 'Error al crear el centro de costo', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateCostCenter = async () => {
    if (!selectedNode) return;
    if (!drawerForm.nombre.trim()) {
      showNotification('El nombre no puede estar vacío', 'error');
      return;
    }
    try {
      setIsSaving(true);
      const budgetVal = drawerForm.presupuesto ? parseFloat(drawerForm.presupuesto) : null;
      await api.put(`/contabilidad/centros-costo/${selectedNode.id}`, {
        nombre: drawerForm.nombre,
        responsable: drawerForm.responsable,
        presupuesto: budgetVal
      });
      showNotification('Centro de costo actualizado', 'success');
      setShowDrawer(false);
      fetchCentros();
    } catch (err: any) {
      console.error(err);
      showNotification(err.message || 'Error al actualizar el centro de costo', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCostCenter = async () => {
    if (!selectedNode) return;
    try {
      setIsDeleting(true);
      await api.delete(`/contabilidad/centros-costo/${selectedNode.id}`);
      showNotification('Centro de costo eliminado', 'success');
      setShowDrawer(false);
      fetchCentros();
    } catch (err: any) {
      console.error(err);
      showNotification(err.message || 'Error al eliminar el centro de costo', 'error');
    } finally {
      setIsDeleting(false);
    }
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
             <button 
              onClick={() => setShowCreateModal(true)}
              className="bg-[#0b5156] text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
             >
                <Plus size={14} /> Nuevo Centro
             </button>
              <button 
                onClick={handleExportMatrix}
                className="bg-white text-slate-500 px-6 py-2 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-1.5"
              >
                 <Download size={14} className="text-slate-400" /> Exportar Matriz
              </button>
          </div>
        </div>
      </header>

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
                  <strong className={`text-lg font-black font-mono tracking-tighter text-slate-400`}>$0.00</strong>
               </div>
               <div className="w-[1px] bg-slate-200 h-8 my-auto" />
               <div className="text-right">
                  <span className="text-[9px] font-black text-slate-400 uppercase block mb-0.5">Variación Mensual</span>
                  <strong className={`text-lg font-black font-mono tracking-tighter text-slate-400`}>0.0%</strong>
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
                          <select 
                            value={drawerForm.responsable}
                            onChange={(e) => setDrawerForm({ ...drawerForm, responsable: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-10 pr-4 py-3 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156] appearance-none"
                          >
                             {employees.length > 0 ? (
                               employees.map((emp, idx) => (
                                 <option key={idx} value={emp}>{emp}</option>
                               ))
                             ) : (
                               <>
                                 <option>Carlos Mendoza</option>
                                 <option>Juan Pérez</option>
                                 <option>Marta Gómez</option>
                                 <option>Gerencia General</option>
                               </>
                             )}
                          </select>
                       </div>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Presupuesto Mensual (USD)</label>
                       <div className="relative">
                          <Target className="absolute left-3 top-3 text-slate-400" size={14} />
                          <input 
                            type="number"
                            value={drawerForm.presupuesto}
                            onChange={(e) => setDrawerForm({ ...drawerForm, presupuesto: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-10 pr-4 py-3 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156]"
                            placeholder="Ej: 12500" 
                          />
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

              <div className="p-5 bg-slate-50 border-t border-slate-100 flex gap-2 shrink-0">
                 <button 
                   onClick={handleDeleteCostCenter}
                   disabled={isDeleting}
                   className="px-4 py-3 bg-red-50 text-red-600 border border-red-100 rounded-xl text-[10px] font-black uppercase hover:bg-red-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                 >
                    <Trash2 size={14} /> {isDeleting ? 'Eliminando...' : 'Eliminar'}
                 </button>
                 <button 
                   onClick={handleUpdateCostCenter}
                   disabled={isSaving}
                   className="flex-1 py-3 bg-[#0b5156] text-white rounded-xl text-[10px] font-black uppercase shadow-lg hover:bg-[#083a3d] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                 >
                    <Save size={14} /> {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                 </button>
              </div>
           </div>
        </div>
      )}

      {showCreateModal && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
           <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
           <form 
             onSubmit={handleCreateCostCenter} 
             className="relative bg-white w-full max-w-md bg-white shadow-2xl rounded-2xl overflow-hidden border border-slate-200 animate-in zoom-in duration-300 flex flex-col"
           >
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                 <div className="space-y-1">
                    <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter leading-none">Nuevo Centro de Costo</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Registrar departamento o unidad de negocio</p>
                 </div>
                 <button type="button" onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                    <X size={20} />
                 </button>
              </div>

              <div className="p-5 space-y-4">
                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Código del Centro</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="Ej: ADM, VEN, MKT" 
                      value={createForm.codigo}
                      onChange={e => setCreateForm({ ...createForm, codigo: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs font-bold text-[#0b5156] uppercase outline-none focus:border-[#0b5156]"
                    />
                 </div>

                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre descriptivo</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="Ej: Administración, Ventas Nacionales" 
                      value={createForm.nombre}
                      onChange={e => setCreateForm({ ...createForm, nombre: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156]"
                    />
                 </div>

                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Responsable Asignado</label>
                    <select 
                      value={createForm.responsable}
                      onChange={e => setCreateForm({ ...createForm, responsable: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156] appearance-none"
                    >
                        {employees.length > 0 ? (
                          employees.map((emp, idx) => (
                            <option key={idx} value={emp}>{emp}</option>
                          ))
                        ) : (
                          <>
                            <option>Carlos Mendoza</option>
                            <option>Juan Pérez</option>
                            <option>Marta Gómez</option>
                            <option>Gerencia General</option>
                          </>
                        )}
                    </select>
                 </div>

                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Presupuesto Mensual (USD)</label>
                    <input 
                      type="number" 
                      placeholder="Ej: 12500" 
                      value={createForm.presupuesto}
                      onChange={e => setCreateForm({ ...createForm, presupuesto: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156]"
                    />
                 </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                 <button type="button" onClick={() => setShowCreateModal(false)} className="px-6 py-2.5 text-[10px] font-black uppercase text-slate-500 hover:text-slate-700">Cancelar</button>
                 <button 
                   type="submit" 
                   disabled={isSaving}
                   className="px-8 py-2.5 bg-[#0b5156] text-white rounded-xl text-[10px] font-black uppercase shadow-lg hover:bg-[#083a3d] transition-all disabled:opacity-50"
                 >
                    {isSaving ? 'Guardando...' : 'Crear Centro'}
                 </button>
              </div>
           </form>
        </div>,
        document.body
      )}

      {/* Toast Portal */}
      {toast && typeof document !== 'undefined' && createPortal(
        <div className="fixed bottom-5 right-5 z-[9999] animate-in fade-in slide-in-from-bottom duration-300">
          <div className={`px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border ${toast.type === 'success' ? 'bg-[#0b5156] border-[#0b5156]/20 text-white' : 'bg-red-600 border-red-500 text-white'}`}>
            {toast.type === 'success' ? <Zap size={20} /> : <ShieldAlert size={20} />}
            <span className="font-bold text-xs tracking-wide uppercase font-mono">{toast.message}</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};


export default CostCenters;
