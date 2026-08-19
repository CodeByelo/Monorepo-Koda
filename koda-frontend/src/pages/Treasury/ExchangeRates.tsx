import { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  Save, 
  Building2, 
  Calculator,
  ShieldCheck,
  History,
  Search,
  Download,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';

const ExchangeRates = () => {
  const [bcvRate, setBcvRate] = useState<number>(0);
  const [refRate, setRefRate] = useState<number>(0);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };
  
  // Table state
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 60;

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      let tasaActual = null;
      let tasaHistorial = [];
      
      try {
        tasaActual = await api.get<any>('/tasa/actual');
      } catch (e: any) {
        if (e.response?.status !== 404) console.error(e);
      }
      
      try {
        tasaHistorial = await api.get<any[]>('/tasa/historial?limite=1000');
      } catch (e: any) {
        console.error(e);
      }

      setBcvRate(Number(tasaActual?.tasa || tasaActual?.valor_ves || 0));
      setRefRate(Number(tasaActual?.tasa_referencial || (tasaActual?.tasa || tasaActual?.valor_ves ? Number(tasaActual.tasa || tasaActual.valor_ves) * 1.15 : 0)));
      
      const historyWithVariacion = (tasaHistorial || []).map((t: any, index: number, arr: any[]) => {
         const currentRate = Number(t.valor_ves || t.tasa || 0);
         let variacionStr = '0.00%';
         if (index < arr.length - 1) {
            const prevRate = Number(arr[index + 1].valor_ves || arr[index + 1].tasa || 0);
            if (prevRate > 0) {
               const diff = currentRate - prevRate;
               const pct = (diff / prevRate) * 100;
               variacionStr = (pct > 0 ? '+' : '') + pct.toFixed(2) + '%';
            }
         }
         return { ...t, variacion: variacionStr };
      });
      setHistory(historyWithVariacion);
    } catch (error) {
      console.error("Error fetching exchange rates:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      setIsSaving(true);
      await api.post('/tasa/sincronizar', {});
      await fetchData();
      showNotification("Tasa sincronizada exitosamente.", 'success');
    } catch (error) {
      console.error("Error syncing rate:", error);
      showNotification("Error al sincronizar la tasa.", 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveManual = async (rateToSave: number, isRef: boolean = false) => {
    try {
      setIsSaving(true);
      const payload = isRef ? { tasa_referencial: rateToSave } : { tasa: rateToSave };
      await api.put('/tasa/manual', payload);
      await fetchData();
      showNotification("Tasa guardada exitosamente.", 'success');
    } catch (error) {
      console.error("Error guardando tasa:", error);
      showNotification("Error al guardar la tasa.", 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredHistory = useMemo(() => {
    if (!searchQuery) return history;
    const q = searchQuery.toLowerCase();
    return history.filter(row => {
      const fecha = (row.fecha || row.date || '').toLowerCase();
      const bcv = (row.tasa || row.valor_ves || row.bcv || '').toString();
      const ref = (row.tasa_referencial || row.ref || '').toString();
      return fecha.includes(q) || bcv.includes(q) || ref.includes(q);
    });
  }, [history, searchQuery]);

  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage) || 1;
  const paginatedHistory = filteredHistory.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleDownloadCSV = () => {
    if (history.length === 0) return;
    const headers = ['FECHA', 'TASA BCV', 'VARIACION', 'TASA REF', 'DIFERENCIAL', 'FUENTE'];
    const rows = history.map(row => {
      const bcv = Number(row.tasa ?? row.valor_ves ?? row.bcv ?? 0);
      const ref = Number(row.tasa_referencial ?? (row.valor_ves ? row.valor_ves * 1.15 : null) ?? row.ref ?? 0);
      const difBs = ref - bcv;
      const difPct = bcv > 0 ? (difBs / bcv) * 100 : 0;
      
      return [
        `"${row.fecha || row.date}"`,
        `"${bcv.toFixed(4)}"`,
        `"${row.variacion || '0.00%'}"`,
        `"${ref.toFixed(4)}"`,
        `"${difBs.toFixed(4)} (${difPct.toFixed(2)}%)"`,
        `"${row.fuente || 'BCV'}"`
      ].join(';');
    });
    
    const csvData = [headers.join(';'), ...rows].join('\n');
    const blob = new Blob(["\ufeff", csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `historial_tasas_koda_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Tesorería &gt; Divisas
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase">Monitor de Tasas</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Control de moneda extranjera para facturación y reportes fiscales.</p>
          </div>
          <div className="flex gap-3">
             <button onClick={handleSync} disabled={isSaving} className="bg-slate-50 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-white transition-all flex items-center gap-2 disabled:opacity-50">
                <RefreshCw size={14} className={isSaving ? 'animate-spin' : ''} /> Actualizar
             </button>
             <button onClick={() => handleSaveManual(bcvRate)} disabled={isSaving} className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all disabled:opacity-50">
                <Save size={14} /> Guardar Cambios
             </button>
          </div>
        </div>
      </header>

      {/* Koda-Themed Notification */}
      {notification && (
        <div className={`fixed bottom-6 right-6 z-50 px-6 py-4 rounded-2xl shadow-xl flex items-center gap-3 animate-in slide-in-from-bottom-5 fade-in duration-300 ${
          notification.type === 'success' 
            ? 'bg-[#0b5156] text-white' 
            : 'bg-red-600 text-white'
        }`}>
          {notification.type === 'success' ? <ShieldCheck size={20} /> : <TrendingDown size={20} />}
          <p className="font-bold tracking-wide text-sm">{notification.message}</p>
        </div>
      )}

      {/* Main Rates Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* BCV Card */}
        <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-[-10px] right-[-10px] text-slate-50 opacity-10 pointer-events-none">
            <Building2 size={120} />
          </div>
          <div className="flex justify-between items-center mb-3 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#0b5156] text-white rounded-xl flex items-center justify-center font-black">BCV</div>
              <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Tasa Oficial</h2>
            </div>
            <span className="bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest border border-green-200">Activa</span>
          </div>
          <div className="space-y-3 relative z-10">
            <div className="space-y-1">
               <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Valor Actual</span>
               <div className="text-3xl font-black text-[#0b5156] font-mono tracking-tighter">
                  {isLoading ? 'Bs. 0.0000' : `Bs. ${bcvRate.toFixed(4)}`}
               </div>
            </div>
            <div className="flex gap-3 pt-4 border-t border-slate-100">
               <div className="relative flex-1">
                  <Calculator size={14} className="absolute left-3 top-3 text-slate-400" />
                  <input 
                    type="number" 
                    step="0.01" 
                    value={bcvRate} 
                    onChange={(e) => setBcvRate(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm font-black text-[#0b5156] outline-none focus:border-[#0b5156] font-mono"
                  />
               </div>
               <button onClick={() => handleSaveManual(bcvRate)} disabled={isSaving} className="bg-slate-800 text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase hover:bg-slate-700 transition-all disabled:opacity-50">Aplicar</button>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Última actualización: Hoy — Fuente: Banco Central de Venezuela</p>
          </div>
        </article>

        {/* Ref Card */}
        <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-[-10px] right-[-10px] text-slate-50 opacity-10 pointer-events-none">
            <TrendingUp size={120} />
          </div>
          <div className="flex justify-between items-center mb-3 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#726555] text-white rounded-xl flex items-center justify-center font-black">REF</div>
              <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Tasa Referencial</h2>
            </div>
            <span className="bg-white text-slate-500 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest border border-slate-200">Informativa</span>
          </div>
          <div className="space-y-3 relative z-10">
            <div className="space-y-1">
               <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Valor Mercado</span>
               <div className="text-3xl font-black text-slate-500 font-mono tracking-tighter">
                  {isLoading ? 'Bs. 0.0000' : `Bs. ${refRate.toFixed(4)}`}
               </div>
            </div>
            <div className="flex gap-3 pt-4 border-t border-slate-100">
               <div className="relative flex-1">
                  <TrendingUp size={14} className="absolute left-3 top-3 text-slate-400" />
                  <input 
                    type="number" 
                    step="0.01" 
                    value={refRate} 
                    onChange={(e) => setRefRate(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm font-black text-[#0b5156] outline-none focus:border-[#726555] font-mono"
                  />
               </div>
               <button onClick={() => handleSaveManual(refRate, true)} disabled={isSaving} className="bg-white text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase hover:bg-slate-200 transition-all border border-slate-200 disabled:opacity-50">Ajustar</button>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Proyecta el impacto cambiario en el flujo de caja estresado.</p>
          </div>
        </article>
      </section>

      {/* History Table */}
      <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-white rounded-lg text-slate-400 border border-slate-100"><History size={18} /></div>
             <div className="space-y-0.5">
               <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter leading-none">Histórico de Variación</h3>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Últimos {history.length} registros</p>
             </div>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
              <input 
                type="text" 
                placeholder="Buscar por fecha o tasa..." 
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156] w-full" 
              />
            </div>
            <button onClick={handleDownloadCSV} className="w-full sm:w-auto text-xs font-black text-[#0b5156] uppercase hover:bg-slate-50 px-4 py-2 rounded-xl transition-colors border border-transparent hover:border-slate-200 flex items-center justify-center gap-2">
              <Download size={14} /> Descargar CSV
            </button>
          </div>
        </div>
        <div className="overflow-x-auto no-scrollbar flex-1">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-2.5 px-6">FECHA</th>
                <th className="py-2.5 px-4 text-right">TASA BCV</th>
                <th className="py-2.5 px-4 text-center">VARIACIÓN</th>
                <th className="py-2.5 px-4 text-right">TASA REF.</th>
                <th className="py-2.5 px-4 text-right">DIFERENCIAL</th>
                <th className="py-2.5 px-6 text-right">ESTADO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs">
              {paginatedHistory.length > 0 ? paginatedHistory.map((row, i) => {
                const isPositive = row.variacion?.startsWith('+');
                const isZero = row.variacion === '0.00%' || !row.variacion;
                const trendColor = isPositive ? 'text-green-600' : (isZero ? 'text-slate-400' : 'text-red-600');
                
                const bcv = Number(row.tasa ?? row.valor_ves ?? row.bcv ?? 0);
                const ref = Number(row.tasa_referencial ?? (row.valor_ves ? row.valor_ves * 1.15 : null) ?? row.ref ?? 0);
                const difBs = ref - bcv;
                const difPct = bcv > 0 ? (difBs / bcv) * 100 : 0;
                
                return (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-2.5 px-6 font-mono text-slate-400 font-bold whitespace-nowrap">{(row.fecha || row.date)?.substring(0, 16).replace('T', ' ')}</td>
                    <td className="py-2.5 px-4 text-right font-black text-[#0b5156] font-mono">Bs. {bcv.toFixed(4)}</td>
                    <td className={`py-2.5 px-4 text-center font-black ${trendColor}`}>
                      <div className="flex items-center justify-center gap-1">
                         {isPositive ? <TrendingUp size={10} /> : isZero ? null : <TrendingDown size={10} />}
                         {row.variacion || row.trend || '0.00%'}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-black text-slate-500 font-mono">Bs. {ref.toFixed(4)}</td>
                    <td className="py-2.5 px-4 text-right font-black text-slate-400 font-mono">
                       <span className="text-slate-600">Bs. {difBs.toFixed(4)}</span>
                       <span className="text-[10px] ml-1">({difPct.toFixed(2)}%)</span>
                    </td>
                    <td className="py-2.5 px-6 text-right">
                       <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tight border border-green-100">{row.estado || row.status || 'Confirmada'}</span>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={5} className="py-10 text-center font-bold text-slate-400 text-[10px] uppercase tracking-widest">
                    No hay registros que coincidan con la búsqueda
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {filteredHistory.length > 0 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filteredHistory.length)} de {filteredHistory.length}
            </span>
            <div className="flex gap-2">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 bg-white rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 bg-white rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </article>

      {/* Warning / Intelligence */}
      <article className="bg-[#0b5156] p-5 rounded-2xl border border-[#0b5156]/10 shadow-2xl flex items-center justify-between relative overflow-hidden">
        <ShieldCheck className="absolute right-[-20px] bottom-[-20px] text-white/5" size={160} />
        <div className="relative z-10 flex items-center gap-6">
          <div className="p-4 bg-white/10 rounded-2xl text-white">
            <ShieldCheck size={28} />
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-black text-white uppercase tracking-tighter">Cumplimiento Fiscal</h3>
            <p className="text-sm font-bold text-white/60 uppercase max-w-2xl">
              El sistema utiliza la tasa BCV del día para todos los cálculos de facturación, retenciones y contabilidad, garantizando el cumplimiento de la normativa vigente.
            </p>
          </div>
        </div>
        <Link to="/admin/auditoria" className="force-text-koda relative z-10 bg-white text-[#0b5156] px-8 py-4 rounded-2xl text-xs font-black uppercase shadow-xl hover:scale-105 transition-all">
          Auditar Cambios
        </Link>
      </article>
    </div>
  );
};

export default ExchangeRates;
