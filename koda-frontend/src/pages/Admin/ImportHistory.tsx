import { 
  Database,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  FileSpreadsheet
} from 'lucide-react';
import { Link } from 'react-router-dom';

const ImportHistory = () => {
  const historyData: any[] = [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <span className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest inline-block mb-2">
              Panel de Importación / Auditoría
            </span>
            <h1 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">
              Historial de Cargas
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">
              Monitor forense de integridad de datos e historial de sincronización masiva.
            </p>
          </div>
          <div className="flex gap-3">
            <button className="bg-white border border-slate-200 text-slate-700 px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-sm hover:bg-slate-50 transition-all">
              <Download size={14} /> Reporte de Lotes
            </button>
            <Link to="/admin/importacion" className="bg-[#0b5156] text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
              <Database size={14} /> Nueva Importación
            </Link>
          </div>
        </div>
      </header>

      {/* KPI Grid */}
      <section className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
        {[
          { label: 'Lotes Totales', value: '0', border: 'border-slate-200', color: 'text-slate-800' },
          { label: 'Completados', value: '0', border: 'border-green-500', color: 'text-green-600' },
          { label: 'En Revisión', value: '0', border: 'border-amber-500', color: 'text-amber-600' },
          { label: 'Rechazados', value: '0', border: 'border-red-500', color: 'text-red-600' },
          { label: 'Reversiones', value: '0', border: 'border-slate-200', color: 'text-slate-800' },
        ].map((kpi, i) => (
          <div key={i} className={`p-6 rounded-2xl bg-white border border-slate-200 border-l-4 ${kpi.border} flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow`}>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">{kpi.label}</span>
            <strong className={`text-3xl font-black ${kpi.color} font-mono tracking-tighter block`}>{kpi.value}</strong>
          </div>
        ))}
      </section>

      {/* Audit Matrix */}
      <section className="space-y-3">
        {/* Header Row */}
        <div className="hidden lg:grid grid-cols-7 gap-4 items-start px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">
          <div>ID de Lote</div>
          <div>Fecha</div>
          <div>Módulo</div>
          <div className="col-span-2">Archivo & Resultado</div>
          <div>Estado</div>
          <div className="text-right">Control</div>
        </div>

        {/* Data Rows */}
        {historyData.length > 0 ? historyData.map((row, idx) => (
          <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-6 lg:px-6 lg:py-4 grid grid-cols-1 lg:grid-cols-7 gap-4 items-start items-center hover:border-[#0b5156]/30 hover:shadow-md transition-all group cursor-default">
            
            <div className="font-mono text-sm font-bold text-indigo-600">{row.id}</div>
            
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <Clock size={12} /> {row.date}
            </div>
            
            <div className="text-xs font-black text-slate-700 uppercase">{row.module}</div>
            
            <div className="col-span-2 space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
                <FileSpreadsheet size={12} className="text-green-600" /> {row.file}
              </div>
              <div>
                <strong className="text-sm font-black text-slate-800 block leading-tight">{row.records}</strong>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{row.desc}</span>
              </div>
            </div>
            
            <div>
              <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-1 rounded border ${
                row.statusType === 'success' ? 'bg-green-50 text-green-600 border-green-200' :
                row.statusType === 'warning' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                'bg-red-50 text-red-600 border-red-200'
              }`}>
                {row.statusType === 'success' ? <CheckCircle2 size={10} /> :
                 row.statusType === 'warning' ? <AlertTriangle size={10} /> :
                 <XCircle size={10} />}
                {row.status}
              </span>
            </div>
            
            <div className="text-right flex justify-end">
              <button className="bg-slate-50 border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-[#0b5156] hover:text-white hover:border-[#0b5156] transition-all">
                <Eye size={14} /> Auditar
              </button>
            </div>

          </div>
        )) : (
           <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">
              No hay historial de cargas.
           </div>
        )}
      </section>

    </div>
  );
};

export default ImportHistory;
