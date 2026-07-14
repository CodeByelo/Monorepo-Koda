import { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { 
  Book, 
  ArrowLeft, 
  Search, 
  Filter, 
  Download,
  Calendar,
  Lock
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePagination } from '@/hooks/usePagination';
import { PaginatedResponse } from '@/types';

interface AsientoDetalle {
  id: number;
  cuenta_codigo: string;
  cuenta_nombre: string;
  debe: number;
  haber: number;
}

interface AsientoContable {
  id: number;
  fecha: string;
  concepto: string;
  referencia: string;
  total_debe: number;
  total_haber: number;
  detalles: AsientoDetalle[];
}

const GeneralLedger = () => {
  const { limit, offset, totalRecords, setTotalRecords, nextPage, prevPage, hasNextPage, hasPrevPage, currentPage, totalPages } = usePagination(50);
  const [asientos, setAsientos] = useState<AsientoContable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [fechaFiltro, setFechaFiltro] = useState('');
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const fetchAsientos = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<PaginatedResponse<AsientoContable>>(
        `/contabilidad/asientos?limit=${limit}&offset=${offset}${buscar ? '&buscar=' + buscar : ''}${fechaFiltro ? '&fecha=' + fechaFiltro : ''}`
      );
      setAsientos(res?.data || []);
      setTotalRecords(res?.total_records || 0);
    } catch (error) {
      console.error("Error al cargar Libro Diario:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAsientos();
  }, [limit, offset, buscar, fechaFiltro]);

  const handleExportPdf = async () => {
    try {
      const token = localStorage.getItem('koda_token') || localStorage.getItem('sgd_token');
      const baseUrl = (window.location.hostname.includes('.ts.net') || window.location.hostname.includes('cloudflare')) ? '/api-facturacion' : '/api';
      const url = `${baseUrl}/contabilidad/asientos/exportar-pdf${fechaFiltro ? '?fecha=' + fechaFiltro : ''}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + (token || '') },
      });
      if (!response.ok) throw new Error('Error ' + response.status);
      
      const blob = await response.blob();
      const urlBlob = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = urlBlob;
      link.setAttribute('download', 'libro_oficial.pdf');
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(urlBlob);
    } catch (error) {
      console.error("Error downloading PDF:", error);
      setDownloadError('Error al descargar el PDF. Verifique su sesión.');
      setTimeout(() => setDownloadError(null), 4000);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header Estandar KODA */}
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
           <Book size={120} className="text-koda-main" />
        </div>
        <div className="flex justify-between items-start mb-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Link to="/contabilidad" className="bg-koda-main/10 text-koda-main text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-koda-main/20 transition-all">
                <ArrowLeft size={10} /> Volver a Finanzas
              </Link>
              <span className="bg-koda-main text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Libro Principal
              </span>
            </div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Libro Diario</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-3xl leading-relaxed">
              Registro cronologico inmutable de transacciones financieras, ajustes de inventario y nomina automatizada.
            </p>
          </div>
          <div className="flex gap-3">
             <div className="relative">
                <Calendar className="absolute left-3 top-3 text-slate-400" size={14} />
                <input 
                  type="date" 
                  value={fechaFiltro}
                  onChange={(e) => setFechaFiltro(e.target.value)}
                  className="bg-white text-slate-500 pl-9 pr-4 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 focus:outline-none focus:border-koda-main transition-all tracking-widest shadow-sm cursor-pointer"
                />
             </div>
             <button 
                onClick={handleExportPdf}
                className="bg-koda-main text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-koda-mainHover transition-all tracking-widest"
             >
                <Download size={16} /> Exportar PDF Oficial
             </button>
          </div>
        </div>
      </header>

      {/* Controles de Busqueda */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center gap-4">
         <div className="flex bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-sm flex-1 mr-4">
            <div className="relative flex items-center w-full">
               <Search className="absolute left-3 text-slate-400" size={14} />
               <input 
                 type="text" 
                 value={buscar}
                 onChange={(e) => setBuscar(e.target.value)}
                 placeholder="Buscar por concepto o referencia..." 
                 className="pl-9 pr-4 py-2.5 bg-transparent text-xs font-bold focus:outline-none focus:bg-white w-full transition-all text-slate-700"
               />
            </div>
         </div>
         <button className="p-2.5 bg-slate-50 text-slate-400 rounded-xl border border-slate-200 hover:bg-white transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest shrink-0">
            <Filter size={14} /> Filtros Avanzados
         </button>
      </div>

      {/* Lista de Asientos Contables */}
      <div className="space-y-6">
        {isLoading ? (
          <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse">
             Consultando base de datos inmutable...
          </div>
        ) : asientos.length === 0 ? (
          <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest bg-white rounded-3xl border border-slate-200 shadow-sm">
             No hay asientos contables registrados.
          </div>
        ) : (
          asientos.map((asiento) => (
            <article key={asiento.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden group">
              {/* Cabecera del Asiento */}
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                 <div className="flex gap-4 items-center">
                    <div className="px-3 h-10 rounded-xl bg-koda-main/10 text-koda-main flex items-center justify-center font-black font-mono text-xs">
                       #{asiento.id}
                    </div>
                    <div>
                       <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">{asiento.concepto}</h3>
                       <div className="flex gap-3 text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">
                          <span className="flex items-center gap-1"><Calendar size={12}/> {new Date(asiento.fecha).toLocaleString('es-VE')}</span>
                          <span>|</span>
                          <span className="text-koda-main font-mono bg-koda-main/5 px-2 py-0.5 rounded">{asiento.referencia}</span>
                       </div>
                    </div>
                 </div>
                 <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                    <Lock size={12} /> Cuadrado y Bloqueado
                 </div>
              </div>

              {/* Detalle de Cuentas (T-Account) */}
              <div className="p-0">
                 <table className="w-full text-left">
                    <thead>
                       <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-white">
                          <th className="py-3 px-6">Codigo</th>
                          <th className="py-3 px-6">Nombre de la Cuenta</th>
                          <th className="py-3 px-6 text-right">Debe (Bs.)</th>
                          <th className="py-3 px-6 text-right">Haber (Bs.)</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-xs">
                       {(asiento.detalles || []).map((det: any) => (
                          <tr key={det.id} className="hover:bg-slate-50/50 transition-colors">
                             <td className="py-3 px-6 font-mono font-bold text-slate-500">{det.cuenta_codigo}</td>
                             <td className={`py-3 px-6 font-bold uppercase ${det.haber > 0 ? 'pl-10 text-slate-600' : 'text-slate-800'}`}>
                                {det.cuenta_nombre}
                             </td>
                             <td className="py-3 px-6 text-right font-mono font-black text-slate-800">
                                {det.debe > 0 ? det.debe.toLocaleString('es-VE', { minimumFractionDigits: 2 }) : ''}
                             </td>
                             <td className="py-3 px-6 text-right font-mono font-black text-slate-800">
                                {det.haber > 0 ? det.haber.toLocaleString('es-VE', { minimumFractionDigits: 2 }) : ''}
                             </td>
                          </tr>
                       ))}
                       <tr className="bg-slate-50/80">
                          <td colSpan={2} className="py-4 px-6 text-right font-black uppercase text-[10px] tracking-widest text-slate-500">Sumas Iguales:</td>
                          <td className="py-4 px-6 text-right font-mono font-black text-koda-main border-double border-b-4 border-koda-main/30">{asiento.total_debe.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                          <td className="py-4 px-6 text-right font-mono font-black text-koda-main border-double border-b-4 border-koda-main/30">{asiento.total_haber.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                       </tr>
                    </tbody>
                 </table>
              </div>
            </article>
          ))
        )}
      </div>

      {/* Pagination controls */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center mt-6">
        <button
          type="button"
          disabled={!hasPrevPage}
          onClick={prevPage}
          className="px-4 py-2 bg-white text-slate-500 rounded-xl text-xs font-black uppercase border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-all flex items-center gap-1 cursor-pointer"
        >
          Anterior
        </button>
        <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
          Pagina {currentPage} de {totalPages} (Total: {totalRecords} asientos)
        </span>
        <button
          type="button"
          disabled={!hasNextPage}
          onClick={nextPage}
          className="px-4 py-2 bg-white text-slate-500 rounded-xl text-xs font-black uppercase border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-all flex items-center gap-1 cursor-pointer"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
};

export default GeneralLedger;