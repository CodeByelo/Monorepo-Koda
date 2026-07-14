import { 
  ArrowLeft,
  Rocket,
  Database,
  Settings2,
  CheckSquare,
  Square,
  Sparkles,
  Code,
  Calendar,
  Building2,
  User,
  Package,
  Tag,
  DollarSign,
  Hash,
  TrendingDown,
  Percent,
  Scale
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { api } from '@/api/client';

const QueryBuilderReport = () => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [periodo, setPeriodo] = useState(currentMonth);
  const [modalMessage, setModalMessage] = useState<string | null>(null);
  const [fields, setFields] = useState({
    date: true,
    branch: true,
    customer: true,
    sku: true,
    category: false,
    seller: false,
    netAmount: true,
    quantity: true,
    cost: true,
    margin: false,
    tax: false
  });

  const toggleField = (field: keyof typeof fields) => {
    setFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleExportCSV = async () => {
    const selectedFields = Object.keys(fields).filter(key => fields[key as keyof typeof fields]);
    if (selectedFields.length === 0) {
      setModalMessage("Por favor seleccione al menos un campo para exportar.");
      return;
    }
    try {
      const fieldsStr = selectedFields.join(",");
      await api.download(`/reportes/query-builder/exportar?fields=${fieldsStr}&periodo=${periodo}`, 'query_koda_export.csv');
    } catch (error) {
      console.error("Error exporting query builder:", error);
      setModalMessage("Error al generar la exportación CSV.");
    }
  };

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
                Extracción de Datos
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Constructor de Consultas</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Configure dimensiones y métricas para exportar data estructurada para PowerBI o Excel.</p>
          </div>
          <button 
             onClick={handleExportCSV}
             className="bg-[#0b5156] text-white px-8 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
          >
             <Rocket size={14} /> Generar Exportación CSV
          </button>
        </div>
      </header>

      {/* Query Builder Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
         
         {/* Field Selector Sidebar */}
         <aside className="lg:col-span-4 space-y-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
               <div className="flex items-center gap-2 mb-3">
                  <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                     <Settings2 size={16} className="text-[#0b5156]" />
                  </div>
                  <h3 className="text-xs font-black text-[#0b5156] uppercase tracking-tighter leading-none">Dimensiones (Filas)</h3>
               </div>

               <div className="space-y-1">
                  {[
                    { id: 'date', label: 'Fecha (YYYY-MM-DD)', icon: <Calendar size={12} /> },
                    { id: 'branch', label: 'Sucursal / Sede', icon: <Building2 size={12} /> },
                    { id: 'customer', label: 'Cliente / RIF', icon: <User size={12} /> },
                    { id: 'sku', label: 'Producto / SKU', icon: <Package size={12} /> },
                    { id: 'category', label: 'Categoría', icon: <Tag size={12} /> },
                    { id: 'seller', label: 'Vendedor', icon: <User size={12} /> },
                  ].map((f) => (
                    <button 
                      key={f.id} 
                      onClick={() => toggleField(f.id as any)}
                      className={`w-full flex items-center gap-2 p-2 rounded-lg transition-all border ${fields[f.id as keyof typeof fields] ? 'bg-[#0b5156]/10 border-[#0b5156] text-[#0b5156]' : 'bg-white border-slate-100 text-slate-400 hover:border-[#0b5156]/30 hover:bg-slate-50'}`}
                    >
                       <div className={`p-1 rounded-md ${fields[f.id as keyof typeof fields] ? 'bg-[#0b5156]/10' : 'bg-slate-50'}`}>
                          {f.icon}
                       </div>
                       <span className="text-[9px] font-black uppercase tracking-tight flex-1 text-left">{f.label}</span>
                       {fields[f.id as keyof typeof fields] ? <CheckSquare size={14} /> : <Square size={14} className="opacity-20" />}
                    </button>
                  ))}
               </div>

               <div className="flex items-center gap-2 mt-4 mb-3">
                  <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                     <Database size={16} className="text-[#0b5156]" />
                  </div>
                  <h3 className="text-xs font-black text-[#0b5156] uppercase tracking-tighter leading-none">Métricas (Valores)</h3>
               </div>

               <div className="space-y-1">
                  {[
                    { id: 'netAmount', label: 'Monto Neto (USD)', icon: <DollarSign size={12} /> },
                    { id: 'quantity', label: 'Cantidad', icon: <Hash size={12} /> },
                    { id: 'cost', label: 'Costo Reposición', icon: <TrendingDown size={12} /> },
                    { id: 'margin', label: 'Margen Bruto', icon: <Percent size={12} /> },
                    { id: 'tax', label: 'Impuestos', icon: <Scale size={12} /> },
                  ].map((f) => (
                    <button 
                      key={f.id} 
                      onClick={() => toggleField(f.id as any)}
                      className={`w-full flex items-center gap-2 p-2 rounded-lg transition-all border ${fields[f.id as keyof typeof fields] ? 'bg-[#0b5156]/10 border-[#0b5156] text-[#0b5156]' : 'bg-white border-slate-100 text-slate-400 hover:border-[#0b5156]/30 hover:bg-slate-50'}`}
                    >
                       <div className={`p-1 rounded-md ${fields[f.id as keyof typeof fields] ? 'bg-[#0b5156]/10' : 'bg-slate-50'}`}>
                          {f.icon}
                       </div>
                       <span className="text-[9px] font-black uppercase tracking-tight flex-1 text-left">{f.label}</span>
                       {fields[f.id as keyof typeof fields] ? <CheckSquare size={14} /> : <Square size={14} className="opacity-20" />}
                    </button>
                  ))}
               </div>

               <div className="mt-4 pt-4 border-t border-slate-100">
                  <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Filtro de Período</h3>
                  <input 
                    type="month" 
                    value={periodo} 
                    onChange={(e) => setPeriodo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-2 rounded-lg text-[9px] font-black uppercase text-[#0b5156] outline-none font-sans font-bold"
                  />
               </div>
            </div>
         </aside>

         {/* Preview Panel - REDESIGNED TO LIGHT MODE */}
         <div className="lg:col-span-8 space-y-3">
            <article className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm h-full flex flex-col">
               <div className="flex justify-between items-start mb-3">
                  <div className="space-y-0.5">
                     <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Previsualización de Estructura</h2>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-0.5">Los encabezados están optimizados para PowerBI (Flat Table).</p>
                  </div>
                  <div className="flex gap-2">
                     <span className="bg-slate-100 text-slate-500 text-[8px] font-black px-2 py-0.5 rounded uppercase">UTF-8</span>
                     <span className="bg-slate-100 text-slate-500 text-[8px] font-black px-2 py-0.5 rounded uppercase">CSV</span>
                  </div>
               </div>

               <div className="flex-1 bg-slate-50 rounded-2xl p-4 font-mono text-[10px] text-slate-600 overflow-x-auto border border-slate-200 shadow-inner">
                  <div className="flex items-center gap-2 mb-2 text-slate-400 border-b border-slate-200 pb-2">
                     <Code size={12} />
                     <span className="uppercase tracking-widest font-black text-[9px]">Vista Previa de Datos (CSV)</span>
                  </div>
                  <div className="space-y-1 whitespace-nowrap leading-relaxed">
                     <div className="text-[#0b5156] font-black">
                        {Object.entries(fields).filter(([_, isSelected]) => isSelected).map(([key]) => key.toUpperCase()).join(',')}
                     </div>
                     <div className="text-slate-400 mt-6 mb-2 text-center text-[10px] font-bold uppercase">
                        (La exportación generará un archivo con estas columnas. Actualmente no hay datos en el período seleccionado.)
                     </div>
                  </div>
               </div>

               <div className="mt-4 p-3 bg-green-50/50 border border-green-100 rounded-xl flex gap-3 items-center shadow-sm">
                  <Sparkles size={16} className="text-green-600" />
                  <p className="text-[9px] font-bold text-slate-500 uppercase leading-relaxed flex-1">
                     ✨ <strong>Tip Pro:</strong> Al importar este CSV en PowerBI, use la codificación <strong>UTF-8</strong> para preservar caracteres especiales y asegúrese de que el punto (.) sea reconocido como separador decimal para evitar errores de cálculo en sus medidas DAX.
                  </p>
               </div>
            </article>
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

export default QueryBuilderReport;
