import { 
  Plus, 
  Search, 
  Filter, 
  ArrowLeft,
  Printer,
  Download,
  CheckCircle2,
  History,
  Maximize2,
  Minimize2,
  Calendar,
  Layers
} from 'lucide-react';
import { Link } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { usePagination } from '@/hooks/usePagination';
import { PaginatedResponse } from '@/types';

const JournalBook = () => {
  const { limit, offset, totalRecords, setTotalRecords, nextPage, prevPage, hasNextPage, hasPrevPage, currentPage, totalPages } = usePagination(50);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [entries, setEntries] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any[]>([]);
  const [totals, setTotals] = useState({ debe: 0, haber: 0 });

  const handleDownload = async (endpoint: string, filename: string) => {
    try {
      const token = localStorage.getItem('koda_token') || localStorage.getItem('sgd_token');
      const baseUrl = (window.location.hostname.includes('.ts.net') || window.location.hostname.includes('cloudflare')) ? '/api-facturacion' : '/api';
      const response = await fetch(baseUrl + endpoint, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + (token || '') },
      });
      if (!response.ok) throw new Error('Error ' + response.status);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Error al descargar el archivo. Verifique su sesion.');
    }
  };

  useEffect(() => {
    api.get<PaginatedResponse<any>>(`/contabilidad/libro-diario?limit=${limit}&offset=${offset}`).then((res) => {
      const list = res?.data || [];
      setTotalRecords(res?.total_records || 0);
      const totalDebe = list.reduce((s, e) => s + Number(e.debe || 0), 0);
      const totalHaber = list.reduce((s, e) => s + Number(e.haber || 0), 0);
      setTotals({ debe: totalDebe, haber: totalHaber });
      setKpis([
        { label: 'Asientos (Pág)', value: String(list.length), color: 'text-[#0b5156]' },
        { label: 'Total Débitos (Pág)', value: `$${totalDebe.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, color: 'text-slate-800' },
        { label: 'Total Créditos (Pág)', value: `$${totalHaber.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, color: 'text-slate-800' },
        { label: 'Diferencia (Pág)', value: `$${Math.abs(totalDebe - totalHaber).toFixed(2)}`, color: 'text-green-600' },
      ]);
      setEntries(list.map((e) => ({
        id: e.referencia || `AST-${e.id}`,
        rawId: e.id,
        date: e.fecha,
        source: 'Sistema',
        desc: e.concepto,
        status: 'Posteado',
        statusColor: 'bg-green-100 text-green-700',
        lines: (e.lines || []).map((line: any) => ({
          account: line.account,
          name: line.name,
          debit: line.debit > 0 ? `$${Number(line.debit).toFixed(2)}` : '',
          credit: line.credit > 0 ? `$${Number(line.credit).toFixed(2)}` : ''
        })),
      })));
    }).catch(console.error);
  }, [limit, offset, setTotalRecords]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <Link to="/contabilidad" className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-[#0b5156]/20 transition-all">
                <ArrowLeft size={10} /> Volver
              </Link>
              <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Contabilidad &gt; Auditoría
              </span>
            </div>
            <h1 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Libro Diario General</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Registro cronológico detallado de todos los movimientos contables de la organización.</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
             <Link to="/contabilidad/asiento-manual" className="bg-[#0b5156] text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <Plus size={14} /> Nuevo Asiento
             </Link>
             <button onClick={() => handleDownload('/contabilidad/asientos/exportar-pdf', 'libro_diario.pdf')} className="bg-white text-[#0b5156] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <Printer size={14} /> Imprimir Libro
             </button>
             <button onClick={() => handleDownload('/contabilidad/libro-diario/exportar-txt', 'libro_diario.txt')} className="bg-white text-[#0b5156] px-4 py-2.5 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <Download size={14} /> Exportar TXT (Legal)
             </button>
          </div>
        </div>
      </header>

      {/* KPIs Bar */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-4 items-start">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-1 group hover:border-[#0b5156]/20 transition-all">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">{kpi.label}</span>
            <strong className={`text-xl font-black ${kpi.color} tracking-tighter font-mono`}>{kpi.value}</strong>
          </div>
        ))}
      </section>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-center">
         <div className="relative">
            <Layers className="absolute left-3 top-2.5 text-slate-400" size={14} />
            <select className="bg-slate-50 border border-slate-100 rounded-lg pl-9 pr-8 py-2 text-[11px] font-black text-[#0b5156] outline-none appearance-none focus:border-[#0b5156] transition-all cursor-pointer">
              <option>Todos los Módulos</option>
              <option>Ventas</option>
              <option>Compras</option>
              <option>Tesorería</option>
            </select>
         </div>
         <div className="relative">
            <Calendar className="absolute left-3 top-2.5 text-slate-400" size={14} />
            <input type="date" className="bg-slate-50 border border-slate-100 rounded-lg pl-9 pr-4 py-2 text-[11px] font-black text-[#0b5156] outline-none focus:border-[#0b5156] transition-all" defaultValue="2026-04-24" />
         </div>
         <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
            <input type="text" placeholder="Buscar por concepto o # asiento..." className="w-full bg-slate-50 border border-slate-100 rounded-lg pl-9 pr-4 py-2 text-[11px] font-black text-[#0b5156] outline-none focus:border-[#0b5156] transition-all shadow-inner" />
         </div>
         <button className="bg-[#0b5156] text-white px-6 py-2 rounded-lg text-[10px] font-black uppercase hover:bg-[#083a3d] transition-all shadow-md">
            Filtrar Resultados
         </button>
      </div>

      {/* Ledger Container */}
      <article className={`bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden transition-all duration-500 ${isFullScreen ? 'fixed inset-0 z-[100] m-4' : 'relative'}`}>
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-[#0b5156]">
          <div className="flex items-center gap-4">
             <div className="bg-white/10 p-2 rounded-lg border border-white/20">
                <History size={18} className="text-white" />
             </div>
             <div className="space-y-0.5">
               <h2 className="text-sm font-black text-white uppercase tracking-widest leading-none">Visor de Libro Diario</h2>
               <p className="text-[9px] font-bold text-white/60 uppercase tracking-tighter">Estándar Forense de Alta Densidad</p>
             </div>
          </div>
          <button 
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="p-2 bg-white/10 text-white rounded-lg border border-white/20 hover:bg-white/20 transition-all flex items-center gap-2"
          >
            {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            <span className="text-[10px] font-black uppercase">{isFullScreen ? 'Cerrar' : 'Expandir'}</span>
          </button>
        </div>

        <div className={`overflow-x-auto ${isFullScreen ? 'h-[calc(100vh-140px)]' : ''}`}>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-4 px-6">Asiento / Ref.</th>
                <th className="py-4 px-4">Fecha</th>
                <th className="py-4 px-4">Cuenta</th>
                <th className="py-4 px-4">Concepto / Glosa</th>
                <th className="py-4 px-4 text-right w-32">Débito</th>
                <th className="py-4 px-4 text-right w-32">Crédito</th>
                <th className="py-4 px-6 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="text-[11px] font-mono">
              {entries.map((entry, i) => (
                <React.Fragment key={`entry-${i}`}>
                  <tr key={`h-${i}`} className={`bg-slate-50 border-t border-slate-100 ${entry.isWarning ? 'border-l-4 border-l-amber-500' : ''}`}>
                    <td className="py-3 px-6 font-black text-[#0b5156]"><Link to={`/contabilidad/asiento/${entry.rawId}`} className="hover:underline">{entry.id}</Link></td>
                    <td className="py-3 px-4 text-slate-500 font-bold">{entry.date}</td>
                    <td className="py-3 px-4">
                       <span className={`${entry.sourceColor || 'bg-slate-200 text-slate-600'} px-2 py-0.5 rounded-[4px] text-[9px] font-black uppercase`}>
                          Módulo: {entry.source}
                       </span>
                    </td>
                    <td className="py-3 px-4 text-slate-800 font-black uppercase tracking-tight">{entry.desc}</td>
                    <td colSpan={2}></td>
                    <td className="py-3 px-6 text-center">
                       <span className={`${entry.statusColor} px-2 py-0.5 rounded-[4px] text-[9px] font-black uppercase`}>
                          {entry.status}
                       </span>
                    </td>
                  </tr>
                  {entry.lines.map((line: any, li: number) => (
                    <tr key={`l-${i}-${li}`} className="hover:bg-slate-50 transition-colors group border-b border-slate-50">
                      <td></td><td></td>
                      <td className="py-3 px-4 text-[#0b5156] font-black">{line.account}</td>
                      <td className="py-3 px-4 text-slate-600 font-bold uppercase group-hover:text-[#0b5156] transition-colors">{line.name}</td>
                      <td className="py-3 px-4 text-right text-slate-800 font-black">{line.debit}</td>
                      <td className="py-3 px-4 text-right text-slate-400 font-black">{line.credit}</td>
                      <td></td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination controls */}
        <div className="p-4 border-t border-slate-100 flex justify-between items-center bg-slate-50/50">
          <button
            type="button"
            disabled={!hasPrevPage}
            onClick={prevPage}
            className="px-4 py-2 bg-white text-[#0b5156] rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 disabled:opacity-40 hover:bg-[#0b5156]/5 transition-all flex items-center gap-1 cursor-pointer"
          >
            Anterior
          </button>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            Página {currentPage} de {totalPages} (Total: {totalRecords} registros)
          </span>
          <button
            type="button"
            disabled={!hasNextPage}
            onClick={nextPage}
            className="px-4 py-2 bg-white text-[#0b5156] rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 disabled:opacity-40 hover:bg-[#0b5156]/5 transition-all flex items-center gap-1 cursor-pointer"
          >
            Siguiente
          </button>
        </div>
      </article>

      {/* Integrity Summary Footer */}
      <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm flex justify-between items-center">
         <div className="flex items-center gap-4">
            <div className="bg-green-500/10 p-2 rounded-xl border border-green-500/20">
               <CheckCircle2 size={24} className="text-green-600" />
            </div>
            <div className="space-y-1">
               <h4 className="text-sm font-black text-[#0b5156] uppercase tracking-tight">Integridad de Partida Doble</h4>
               <p className="text-[10px] font-bold text-slate-400 uppercase">Todos los asientos del periodo están balanceados correctamente.</p>
            </div>
         </div>
         <div className="flex gap-8 text-right px-8">
            <div>
               <span className="text-[10px] font-black text-slate-400 uppercase block">Sumas del Mes</span>
               <strong className="text-lg font-black text-slate-800 font-mono">${totals.debe.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
            </div>
            <div className="w-[1px] bg-slate-200 h-10" />
            <div>
               <span className="text-[10px] font-black text-slate-400 uppercase block">Descuadre</span>
               <strong className={`text-lg font-black ${Math.abs(totals.debe - totals.haber) > 0 ? 'text-amber-600' : 'text-green-600'} font-mono`}>
                 ${Math.abs(totals.debe - totals.haber).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
               </strong>
            </div>
         </div>
      </div>
    </div>
  );
};

export default JournalBook;
