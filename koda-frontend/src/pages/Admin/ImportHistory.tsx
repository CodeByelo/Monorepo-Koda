import { 
  Database,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  FileSpreadsheet,
  X
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const ImportHistory = () => {
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>({
    lotesTotales: 0,
    completados: 0,
    enRevision: 0,
    rechazados: 0,
    reversiones: 0
  });
  const [loading, setLoading] = useState(true);
  const [selectedRow, setSelectedRow] = useState<any>(null);

  const fetchHistory = async () => {
    try {
      const res = await api.get<any>('/admin/importaciones');
      if (res) {
        setHistoryData(res.historial || []);
        if (res.kpis) {
          setKpis(res.kpis);
        }
      }
    } catch (error) {
      console.error("Error fetching import history:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleReporteLotes = () => {
    if (historyData.length === 0) {
      alert("No hay registros de cargas para exportar.");
      return;
    }
    const blob = new Blob([JSON.stringify(historyData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_lotes_importacion_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
            <button 
              onClick={handleReporteLotes}
              className="bg-white border border-slate-200 text-slate-700 px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-sm hover:bg-slate-50 transition-all"
            >
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
          { label: 'Lotes Totales', value: String(kpis.lotesTotales || 0), border: 'border-slate-200', color: 'text-slate-800' },
          { label: 'Completados', value: String(kpis.completados || 0), border: 'border-green-500', color: 'text-green-600' },
          { label: 'En Revisión', value: String(kpis.enRevision || 0), border: 'border-amber-500', color: 'text-amber-600' },
          { label: 'Rechazados', value: String(kpis.rechazados || 0), border: 'border-red-500', color: 'text-red-600' },
          { label: 'Reversiones', value: String(kpis.reversiones || 0), border: 'border-slate-200', color: 'text-slate-800' },
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
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px] animate-pulse">
            Cargando historial de importación...
          </div>
        ) : historyData.length > 0 ? historyData.map((row, idx) => (
          <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-6 lg:px-6 lg:py-4 grid grid-cols-1 lg:grid-cols-7 gap-4 items-center hover:border-[#0b5156]/30 hover:shadow-md transition-all group cursor-default">
            
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
              <button 
                onClick={() => setSelectedRow(row)}
                className="bg-slate-50 border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-[#0b5156] hover:text-white hover:border-[#0b5156] transition-all"
              >
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

      {/* Audit Detail Modal */}
      {selectedRow && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200 p-4">
          <div className="bg-white p-8 rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md animate-in zoom-in-95 duration-200 relative">
             <button 
               onClick={() => setSelectedRow(null)}
               className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
             >
               <X size={18} />
             </button>
             <div className="flex items-center gap-3 mb-6">
               <div className="w-12 h-12 rounded-full bg-[#0b5156]/10 flex items-center justify-center">
                 <Eye size={24} className="text-[#0b5156]" />
               </div>
               <div>
                 <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Auditoría de Carga</h2>
                 <p className="text-[10px] font-bold text-slate-400 uppercase">Detalle del lote {selectedRow.id}</p>
               </div>
             </div>

             <div className="space-y-4">
               <div>
                 <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Archivo Origen</span>
                 <strong className="text-sm text-slate-800 font-mono select-all">{selectedRow.file}</strong>
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                   <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Módulo</span>
                   <span className="text-xs font-black text-slate-700 uppercase">{selectedRow.module}</span>
                 </div>
                 <div>
                   <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha y Hora</span>
                   <span className="text-xs font-bold text-slate-700">{selectedRow.date}</span>
                 </div>
               </div>
               <div>
                 <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Resultado de Carga</span>
                 <span className="text-xs font-bold text-slate-800">{selectedRow.records}</span>
                 <p className="text-[10px] text-slate-500 mt-1">{selectedRow.desc}</p>
               </div>
               <div>
                 <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Estado Fiscal</span>
                 <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-1 rounded border ${
                   selectedRow.statusType === 'success' ? 'bg-green-50 text-green-600 border-green-200' :
                   selectedRow.statusType === 'warning' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                   'bg-red-50 text-red-600 border-red-200'
                 }`}>
                   {selectedRow.status}
                 </span>
               </div>
             </div>

             <button 
               onClick={() => setSelectedRow(null)}
               className="w-full mt-6 bg-[#0b5156] text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-[#083a3d] transition-colors shadow-lg"
             >
               Cerrar Auditoría
             </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default ImportHistory;
