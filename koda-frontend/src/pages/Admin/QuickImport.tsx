import { 
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileSpreadsheet,
  Settings,
  Database,
  Link2,
  ListChecks,
  ArrowLeft
} from 'lucide-react';
import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { Toast } from '@/components/common/Toast';

interface CSVRow {
  fila: number;
  fecha: string;
  referencia: string;
  descripcion: string;
  monto: string;
  status: 'valido' | 'alerta' | 'error';
  detalle: string;
}

const QuickImport = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>('');
  const [rows, setRows] = useState<CSVRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [perfilActivo, setPerfilActivo] = useState('Pagos Banesco CSV');
  const [stats, setStats] = useState({ ok: 0, warnings: 0, errors: 0 });
  const [toast, setToast] = useState<any>(null);
  const [confirmModal, setConfirmModal] = useState<any>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (!file.name.endsWith('.csv')) {
        setToast({
          message: 'El archivo debe ser un documento válido con extensión .csv (delimitado por comas). No se admiten archivos .xlsx directos.',
          type: 'error'
        });
        return;
      }
      processFile(file);
    }
  };

  const downloadTemplate = () => {
    // BOM + sep=, forces Excel (any regional setting) to split by comma correctly
    const bom = '\uFEFF';
    const sepHint = 'sep=,\n';
    const headers = 'Fecha,Referencia,Descripcion,Monto\n';
    const sampleRows = [
      '14/07/2026,REF-000001,Descripcion del movimiento aqui,1500.00',
      '14/07/2026,REF-000002,Otro concepto de ingreso,850.75',
      '15/07/2026,REF-000003,Ejemplo de abono recibido,300.00',
    ].join('\n');

    const csvContent = bom + sepHint + headers + sampleRows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'plantilla_importacion_koda.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    setFileName(file.name);
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      // Parse header and rows
      // Expected headers: Fecha, Referencia, Descripcion, Monto
      const parsedRows: CSVRow[] = [];
      let okCount = 0;
      let warnCount = 0;
      let errCount = 0;

      // Skip header line
      const dataLines = lines.slice(1);
      dataLines.forEach((line, idx) => {
        const cols = line.split(',').map(c => c.replace(/^["']|["']$/g, '').trim());
        const fecha = cols[0] || '';
        const referencia = cols[1] || '';
        const descripcion = cols[2] || '';
        const montoStr = cols[3] || '';

        let rowStatus: 'valido' | 'alerta' | 'error' = 'valido';
        let detail = 'Listo para procesar';

        if (!fecha || !referencia || !montoStr) {
          rowStatus = 'error';
          detail = 'Columnas obligatorias faltantes';
          errCount++;
        } else if (isNaN(parseFloat(montoStr.replace(/[^0-9.-]/g, '')))) {
          rowStatus = 'error';
          detail = 'Monto numérico inválido';
          errCount++;
        } else if (parseFloat(montoStr) <= 0) {
          rowStatus = 'alerta';
          detail = 'Monto en cero o negativo';
          warnCount++;
        } else {
          okCount++;
        }

        parsedRows.push({
          fila: idx + 1,
          fecha,
          referencia,
          descripcion,
          monto: montoStr,
          status: rowStatus,
          detalle: detail
        });
      });

      setRows(parsedRows);
      setStats({ ok: okCount, warnings: warnCount, errors: errCount });
      setLoading(false);
    };
    reader.readAsText(file);
  };

  const triggerSelectFile = () => {
    fileInputRef.current?.click();
  };

  const handleConfirmImport = () => {
    if (rows.length === 0) {
      setToast({
        message: 'Por favor, cargue un archivo primero.',
        type: 'error'
      });
      return;
    }

    const executeImport = async () => {
      setConfirmModal(null);
      try {
        setLoading(true);
        // Filtrar y estructurar las filas válidas para registrarlas en la BD
        const validRows = rows.filter(r => r.status !== 'error').map(r => ({
          fecha: r.fecha,
          referencia: r.referencia,
          descripcion: r.descripcion,
          monto: r.monto
        }));

        await api.post('/admin/importaciones', {
          tipo: 'Banco/Pagos',
          archivo: fileName || 'banco_upload.csv',
          registros_ok: stats.ok + stats.warnings,
          registros_error: stats.errors,
          filas: validRows
        });

        setToast({
          message: 'Importación procesada y guardada en el sistema exitosamente.',
          type: 'success'
        });
        
        setTimeout(() => {
          navigate('/admin/importacion');
        }, 1500);
      } catch (error) {
        console.error(error);
        setToast({
          message: 'Error al confirmar la importación.',
          type: 'error'
        });
      } finally {
        setLoading(false);
      }
    };

    if (stats.errors > 0) {
      setConfirmModal({
        isOpen: true,
        title: 'Advertencia de Importación',
        message: `El archivo contiene ${stats.errors} registros con errores críticos que serán ignorados. ¿Desea proceder con los ${stats.ok + stats.warnings} registros válidos?`,
        onConfirm: executeImport
      });
    } else {
      setConfirmModal({
        isOpen: true,
        title: 'Confirmar Carga de Pagos',
        message: `¿Desea registrar y conciliar estos ${stats.ok + stats.warnings} pagos en el módulo de Tesorería?`,
        onConfirm: executeImport
      });
    }
  };

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
            <Link to="/admin/importacion" className="bg-white border border-slate-200 text-slate-700 px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-sm hover:bg-slate-50 transition-all">
              <ArrowLeft size={14} /> Volver
            </Link>
            <button 
              onClick={handleConfirmImport}
              disabled={loading || rows.length === 0}
              className="bg-[#0b5156] text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all disabled:opacity-50"
            >
              <CheckCircle2 size={14} /> {loading ? 'Procesando...' : 'Confirmar Importación'}
            </button>
          </div>
        </div>
      </header>

      {/* Profile Config Grid */}
      <section className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
        {[
          { label: 'Perfil Activo', value: perfilActivo, icon: <FileSpreadsheet size={16} />, color: 'text-slate-800' },
          { label: 'Formato Requerido', value: 'CSV (Coma)', icon: <FileSpreadsheet size={16} />, color: 'text-slate-800' },
          { label: 'Registros Válidos', value: String(stats.ok), icon: <CheckCircle2 size={16} className="text-green-600" />, color: 'text-green-600' },
          { label: 'Advertencias', value: String(stats.warnings), color: 'text-amber-600', icon: <AlertTriangle size={16} className="text-amber-600" /> },
          { label: 'Errores', value: String(stats.errors), color: 'text-red-600', icon: <XCircle size={16} className="text-red-650" /> },
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
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept=".csv" 
          onChange={handleFileChange}
        />
        <div 
          onClick={triggerSelectFile}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center text-center transition-all cursor-pointer group ${
            isDragging 
              ? 'border-[#0b5156] bg-[#0b5156]/10' 
              : 'border-slate-300 hover:border-[#0b5156]/50 hover:bg-[#0b5156]/5 bg-white'
          }`}
        >
          <div className="w-20 h-20 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mb-6 group-hover:bg-white group-hover:shadow-md transition-all">
            <UploadCloud size={40} className="text-[#0b5156] opacity-70 group-hover:opacity-100 transition-opacity" />
          </div>
          <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter mb-2">
            {fileName ? `Archivo seleccionado: ${fileName}` : 'Arrastre aquí su archivo de pagos'}
          </h3>
          <p className="text-xs font-bold text-slate-500 mb-8 max-w-md">
            El sistema validará automáticamente las columnas contra el perfil seleccionado.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerSelectFile();
              }}
              className="bg-white border border-slate-200 text-[#0b5156] px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 shadow-sm hover:bg-slate-50 transition-all"
            >
              {fileName ? 'Cambiar Archivo .CSV' : 'Seleccionar Archivo .CSV'}
            </button>
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                downloadTemplate();
              }}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 transition-all"
            >
              Descargar Plantilla de Ejemplo
            </button>
          </div>
        </div>
      </section>

      {/* Preview Table */}
      <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="mb-6">
          <h2 className="text-lg font-black text-[#0b5156] uppercase tracking-tighter mb-1">Previsualización de Auditoría</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Previsualice y audite registros antes de confirmarlos en el sistema.</p>
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
            <tbody className="divide-y divide-slate-100">
              {rows.length > 0 ? rows.map((row) => (
                <tr key={row.fila} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-mono font-bold text-slate-500">{row.fila}</td>
                  <td className="p-4 text-xs font-bold text-slate-700">{row.fecha}</td>
                  <td className="p-4 text-xs font-mono text-[#0b5156] font-bold">{row.referencia}</td>
                  <td className="p-4 text-xs font-semibold text-slate-600">{row.descripcion}</td>
                  <td className="p-4 text-xs font-mono font-bold text-slate-700">${row.monto}</td>
                  <td className="p-4">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${
                      row.status === 'valido' ? 'bg-green-100 text-green-700' :
                      row.status === 'alerta' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {row.status === 'valido' ? 'Válido' :
                       row.status === 'alerta' ? 'Advertencia' : 'Error'}
                    </span>
                    <span className="block text-[8px] font-bold text-slate-400 mt-0.5">{row.detalle}</span>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="p-8 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sin registros detectados. Suba un archivo CSV para previsualizar.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Custom Confirmation Modal */}
      {confirmModal?.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl border border-slate-200 shadow-2xl p-8 space-y-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-50 rounded-full text-amber-600">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tighter">
                {confirmModal.title}
              </h3>
            </div>
            
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wide leading-relaxed">
              {confirmModal.message}
            </p>
            
            <div className="flex gap-3 pt-2 justify-end">
              <button 
                onClick={() => setConfirmModal(null)} 
                className="bg-white border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmModal.onConfirm} 
                className="bg-[#0b5156] text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase hover:bg-[#083a3d] transition-all shadow-md shadow-green-900/20"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Toast Notification */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
    </div>
  );
};

export default QuickImport;
