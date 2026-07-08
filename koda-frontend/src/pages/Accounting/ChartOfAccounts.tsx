import { 
  Plus, 
  Search, 
  Filter, 
  ArrowLeft,
  TrendingUp,
  ShieldAlert,
  Settings2,
  Lock,
  Zap,
  Layers,
  X,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { api } from '@/api/client';

const ChartOfAccounts = () => {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const fetchAccounts = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<any[]>('/contabilidad/cuentas');
      setAccounts(res || []);
    } catch (error) {
      console.error("Error fetching accounts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleImportTemplate = async () => {
    if (!selectedTemplate) return alert("Seleccione una plantilla");
    try {
      setIsImporting(true);
      await api.post('/contabilidad/cuentas/importar-plantilla', { plantilla: selectedTemplate });
      alert(`Plantilla ${selectedTemplate} importada exitosamente.`);
      setShowModal(false);
      fetchAccounts();
    } catch (error) {
      console.error("Error importando plantilla:", error);
      alert("Error al importar la plantilla.");
    } finally {
      setIsImporting(false);
    }
  };

  const filteredAccounts = useMemo(() => {
    if (!searchQuery.trim()) return accounts;
    const q = searchQuery.toLowerCase();
    return accounts.filter(a => 
      a.id?.toLowerCase().includes(q) || 
      a.nombre?.toLowerCase().includes(q) ||
      a.grupo?.toLowerCase().includes(q)
    );
  }, [accounts, searchQuery]);

  const metrics = [
    { label: 'Cuentas activas', value: accounts.length.toString(), desc: 'Disponibles para operación', color: 'text-[#0b5156]', icon: <Zap size={18} className="text-[#0b5156]" /> },
    { label: 'Cuentas operativas', value: accounts.filter(a => a.estatus === 'Operativa' || a.estado === 'Operativa' || a.uso === 'Operativa').length.toString() || '38', desc: 'Con movimiento reciente', color: 'text-green-600', icon: <TrendingUp size={18} className="text-green-600" /> },
    { label: 'Cuentas bloqueadas', value: accounts.filter(a => a.estatus === 'Bloqueada' || a.estado === 'Controlada').length.toString() || '4', desc: 'No permiten registro directo', color: 'text-amber-600', icon: <Lock size={18} className="text-amber-600" /> },
    { label: 'Módulos vinculados', value: '8', desc: 'Ventas, bancos, fiscal y más', color: 'text-blue-600', icon: <Layers size={18} className="text-blue-600" /> },
  ];

  return (
    <div className="space-y-2 animate-in fade-in duration-500 pb-4">
      {/* Header */}
      <header className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <Link to="/contabilidad" className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-[#0b5156]/20 transition-all">
                <ArrowLeft size={10} /> Volver
              </Link>
              <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Contabilidad
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Plan de Cuentas</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Estructura contable, cuentas operativas, naturaleza, módulos relacionados y control de uso.</p>
          </div>
          <div className="flex gap-2">
             <button 
              onClick={() => setShowModal(true)}
              className="bg-[#0b5156] text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
             >
                🚀 Importar Plantilla Base
             </button>
             <button className="bg-white text-[#0b5156] px-4 py-2 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                📘 Manual de Opción
             </button>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse bg-white rounded-2xl border border-slate-200">
           Cargando Plan de Cuentas...
        </div>
      ) : (
        <>
          {/* Metrics Grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
            {metrics.map((m, i) => (
              <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24 hover:border-[#0b5156]/20 transition-all">
                <div className="flex justify-between items-start">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">{m.label}</p>
                   {m.icon}
                </div>
                <div className="space-y-1">
                  <strong className={`text-lg font-black ${m.color} tracking-tighter font-mono`}>{m.value}</strong>
                  <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">{m.desc}</p>
                </div>
              </div>
            ))}
          </section>

          {/* Info Sections */}
          <div className="grid grid-cols-1 gap-4 items-start">
            <article className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
               <div className="mb-3">
                  <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Lectura del Plan Contable</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight mt-1">Cuentas principales que sostienen la operación.</p>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
                  {[
                    { label: 'Estructura', title: 'Organizado por naturaleza', desc: 'Activos, pasivos, patrimonio, ingresos, costos y gastos separados.', color: 'bg-green-500' },
                    { label: 'Operación', title: 'Cuentas vinculadas a módulos', desc: 'Ventas, cobranza, pagos, bancos e inventario automáticos.', color: 'bg-blue-500' },
                    { label: 'Control', title: 'Cuentas sensibles protegidas', desc: 'Bancos, IVA e inventario requieren reglas de uso claras.', color: 'bg-amber-500' },
                    { label: 'Revisión', title: 'Validación de parametrización', desc: 'Evita que documentos operativos caigan en cuentas incorrectas.', color: 'bg-red-500' },
                  ].map((item, i) => (
                    <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                       <span className={`${item.color} text-white text-[8px] font-black px-2 py-0.5 rounded uppercase`}>{item.label}</span>
                       <h3 className="text-xs font-black text-[#0b5156] uppercase tracking-tight leading-none">{item.title}</h3>
                       <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">{item.desc}</p>
                    </div>
                  ))}
               </div>
            </article>
          </div>

          {/* Main Table */}
          <article className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-500 ${isFullScreen ? 'fixed inset-0 z-[100] m-4 rounded-[2.5rem]' : 'relative'}`}>
            <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/30">
              <div className="space-y-1">
                <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Catálogo de Cuentas</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Listado jerárquico de la estructura contable.</p>
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                 <button 
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  className="p-2 bg-white text-[#0b5156] rounded-lg border border-slate-200 hover:bg-[#0b5156]/5 shadow-sm transition-all flex items-center gap-2"
                  title={isFullScreen ? "Salir de Pantalla Completa" : "Ver en Pantalla Completa"}
                 >
                    {isFullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    <span className="text-[10px] font-black uppercase">{isFullScreen ? 'Reducir' : 'Pantalla Completa'}</span>
                 </button>
                 <div className="relative flex-1 md:flex-none">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                    <input 
                      type="text" 
                      placeholder="Buscar cuenta o código..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full md:w-64 bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-1.5 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156] shadow-sm" 
                    />
                 </div>
                 <button className="p-2 bg-white text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-50 shadow-sm transition-all">
                    <Filter size={14} />
                 </button>
              </div>
            </div>

            <div className={`overflow-x-auto ${isFullScreen ? 'h-[calc(100vh-200px)]' : ''}`}>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                    <th className="py-2.5 px-4">Código / Grupo</th>
                    <th className="py-2.5 px-4">Cuenta Contable</th>
                    <th className="py-2.5 px-4">Tipo</th>
                    <th className="py-2.5 px-4">Naturaleza</th>
                    <th className="py-2.5 px-4 text-center">Módulo</th>
                    <th className="py-2.5 px-4">Uso / Propósito</th>
                    <th className="py-2.5 px-4 text-center">Estatus</th>
                    <th className="py-2.5 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs">
                  {filteredAccounts.length > 0 ? filteredAccounts.map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors group">
                      <td className="py-2.5 px-4">
                        <div className="flex flex-col">
                           <strong className="text-[#0b5156] font-mono text-xs">{row.id || row.code}</strong>
                           <span className="text-[9px] font-bold text-slate-400 uppercase">{row.grupo || row.group || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-black text-slate-700 uppercase">{row.nombre || row.name}</td>
                      <td className="py-2.5 px-4 font-bold text-slate-500 uppercase">{row.tipo || row.type || 'N/A'}</td>
                      <td className="py-2.5 px-4 font-bold text-slate-500 uppercase">{row.naturaleza || row.nature || 'N/A'}</td>
                      <td className="py-2.5 px-4 text-center">
                        <span className="bg-white text-slate-600 px-2 py-0.5 rounded text-[9px] font-black uppercase border border-slate-200">{row.modulo || row.module || 'Contabilidad'}</span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-400 font-bold uppercase text-[10px] leading-tight">{row.uso || row.usage || 'General'}</td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={`${row.estatus === 'Controlada' ? 'bg-amber-100 text-amber-700' : row.estatus === 'Operativa' ? 'bg-blue-100 text-blue-700' : row.estatus === 'Revisar' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight`}>
                          {row.estatus || row.status || 'Activa'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button className="p-2 text-slate-400 hover:text-[#0b5156] transition-colors">
                           <Settings2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                        No se encontraron cuentas contables
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}

      {/* Template Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
           <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={() => setShowModal(false)} />
           <div className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                 <div className="space-y-1">
                    <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter leading-none">Importar Plantilla Base</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Selecciona el sector económico de tu empresa.</p>
                 </div>
                 <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                    <X size={20} />
                 </button>
              </div>

              <div className="p-5">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                    {[
                      { id: 'Comercial', icon: '🏪', label: 'Comercial', desc: 'Optimizado para compra/venta, inventario y retail.', count: '142 Cuentas', color: 'text-blue-600' },
                      { id: 'Servicios', icon: '🛠️', label: 'Servicios', desc: 'Foco en honorarios, gastos operativos y activos fijos.', count: '118 Cuentas', color: 'text-green-600' },
                      { id: 'Industrial', icon: '🏭', label: 'Industrial', desc: 'Incluye centros de costo, materia prima y producción.', count: '215 Cuentas', color: 'text-amber-600' },
                    ].map((tpl, i) => (
                      <div 
                        key={i} 
                        onClick={() => setSelectedTemplate(tpl.id)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer group text-center space-y-2 ${selectedTemplate === tpl.id ? 'border-[#0b5156] bg-[#0b5156]/5' : 'bg-slate-50 border-slate-100 hover:border-[#0b5156] hover:bg-white'}`}
                      >
                         <span className="text-3xl block group-hover:scale-110 transition-transform">{tpl.icon}</span>
                         <strong className="text-base font-black text-[#0b5156] uppercase block tracking-tighter">{tpl.label}</strong>
                         <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight h-8">{tpl.desc}</p>
                         <span className={`inline-block px-2 py-0.5 bg-white rounded text-[9px] font-black uppercase shadow-sm ${tpl.color}`}>{tpl.count}</span>
                      </div>
                    ))}
                 </div>

                 <div className="mt-4 p-4 bg-red-50 rounded-2xl border border-red-100 flex gap-3">
                    <ShieldAlert size={20} className="text-red-500 shrink-0" />
                    <div className="space-y-0.5">
                       <h4 className="text-xs font-black text-red-800 uppercase">Advertencia de Reemplazo</h4>
                       <p className="text-[9px] text-red-700 font-bold uppercase leading-relaxed opacity-80">
                         Importar una plantilla reemplazará cualquier estructura de cuentas que no tenga movimientos. Esta acción es irreversible y podría afectar la configuración de los módulos.
                       </p>
                    </div>
                 </div>
              </div>

              <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                 <button onClick={() => setShowModal(false)} className="px-6 py-2.5 text-[10px] font-black uppercase text-slate-500 hover:text-slate-700">Cancelar</button>
                 <button 
                  onClick={handleImportTemplate}
                  disabled={!selectedTemplate || isImporting}
                  className="px-8 py-2.5 bg-[#0b5156] text-white rounded-2xl text-[10px] font-black uppercase shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                    {isImporting ? 'Importando...' : 'Confirmar Selección'}
                  </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default ChartOfAccounts;
