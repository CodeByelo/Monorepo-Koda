import { 
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileSpreadsheet,
  Settings,
  Database,
  Link2,
  ListChecks
} from 'lucide-react';

const QuickImport = () => {

  const mockData: any[] = [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <span className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest inline-block mb-2">
              Administración / Carga Rápida
            </span>
            <h1 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">
              Importación Rápida
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">
              Carga archivos recurrentes usando perfiles preconfigurados para evitar el mapeo manual.
            </p>
          </div>
          <div className="flex gap-3">
            <button className="bg-white border border-slate-200 text-slate-700 px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-sm hover:bg-slate-50 transition-all">
              <Settings size={14} /> Cambiar Perfil
            </button>
            <button className="bg-[#0b5156] text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
              <CheckCircle2 size={14} /> Confirmar Importación
            </button>
          </div>
        </div>
      </header>

      {/* Profile Config Grid */}
      <section className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
        {[
          { label: 'Perfil Activo', value: 'Pagos Banesco CSV', icon: <FileSpreadsheet size={16} />, color: 'text-slate-800' },
          { label: 'Formato', value: '.CSV', icon: <FileSpreadsheet size={16} />, color: 'text-slate-800' },
          { label: 'Área Destino', value: 'Bancos / Pagos', icon: <Database size={16} />, color: 'text-slate-800' },
          { label: 'Mapeo', value: 'Automatizado', color: 'text-green-600', icon: <Link2 size={16} /> },
          { label: 'Estado', value: 'Listo', color: 'text-amber-600', icon: <ListChecks size={16} /> },
        ].map((kpi, i) => (
          <div key={i} className={`p-6 rounded-2xl bg-white border border-slate-200 flex flex-col justify-between shadow-sm hover:border-[#0b5156]/30 transition-colors`}>
            <div className="flex justify-between items-start mb-2">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">{kpi.label}</span>
              <span className="text-slate-400">{kpi.icon}</span>
            </div>
            <strong className={`text-lg font-black ${kpi.color} tracking-tighter block leading-tight`}>{kpi.value}</strong>
          </div>
        ))}
      </section>

      {/* Upload Zone */}
      <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="border-2 border-dashed border-slate-300 rounded-2xl p-12 flex flex-col items-center justify-center text-center hover:border-[#0b5156]/50 hover:bg-[#0b5156]/5 transition-all cursor-pointer group">
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-6 group-hover:bg-white group-hover:shadow-md transition-all">
            <UploadCloud size={40} className="text-[#0b5156] opacity-70 group-hover:opacity-100 transition-opacity" />
          </div>
          <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter mb-2">Arrastre aquí su archivo de pagos</h3>
          <p className="text-xs font-bold text-slate-500 mb-8 max-w-md">El sistema validará automáticamente las columnas contra el perfil seleccionado.</p>
          <button className="bg-white border border-slate-200 text-[#0b5156] px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-sm hover:bg-slate-50 transition-all">
            Seleccionar Archivo .CSV
          </button>
        </div>
      </section>

      {/* Preview Table */}
      <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="mb-6">
          <h2 className="text-lg font-black text-[#0b5156] uppercase tracking-tighter mb-1">Previsualización de Auditoría</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sube un archivo para previsualizar los registros.</p>
        </div>
        
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 bg-slate-50">
                <th className="p-4 rounded-tl-xl">Fila</th>
                <th className="p-4">Fecha</th>
                <th className="p-4">Referencia</th>
                <th className="p-4">Descripción</th>
                <th className="p-4">Monto</th>
                <th className="p-4 rounded-tr-xl">Validación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-center">
              <tr>
                 <td colSpan={6} className="p-8">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sin registros detectados</p>
                 </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
};

export default QuickImport;
