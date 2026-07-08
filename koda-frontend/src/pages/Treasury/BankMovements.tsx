import { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  ChevronRight, 
  Activity, 
  ShieldAlert,
  Download,
  Calendar,
  Building2,
  Upload
} from 'lucide-react';
import { api } from '@/api/client';
import { useNavigate } from 'react-router-dom';

const BankMovements = () => {
  const navigate = useNavigate();
  const [movements, setMovements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [periodo, setPeriodo] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const data = await api.get<any[]>(`/tesoreria/movimientos?periodo=${periodo}`);
      setMovements(data || []);
    } catch (error) {
      console.error("Error fetching bank movements:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'FECHA', 'BANCO', 'TIPO', 'MONTO', 'REFERENCIA', 'ESTADO'];
    const csvContent = [
      headers.join(','),
      ...filteredMovements.map(m => [
        m.id || 'MOV-000',
        m.fecha || new Date().toLocaleDateString(),
        m.banco || m.bank || 'Banco Asociado',
        m.tipo || m.type || 'N/A',
        m.monto || m.amount || '0.00',
        m.referencia || m.ref || '-',
        m.estado || m.status || 'Activo'
      ].map(val => `"${val}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Movimientos_${periodo}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    fetchData();
  }, [periodo]);

  const filteredMovements = useMemo(() => {
    if (!searchQuery.trim()) return movements;
    const q = searchQuery.toLowerCase();
    return movements.filter(m => 
      (m.id || m.referencia || '').toLowerCase().includes(q) ||
      (m.desc || m.descripcion || '').toLowerCase().includes(q) ||
      (m.monto || m.amount || '').toString().toLowerCase().includes(q)
    );
  }, [movements, searchQuery]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append('file', file);
      try {
        await api.post('/tesoreria/movimientos/importar', formData);
        await fetchData();
        alert('Extracto importado exitosamente.');
      } catch (error) {
        console.error("Error importing statement:", error);
        alert('Error al importar el extracto.');
      }
    }
  };

  // Calculate metrics based on data
  const entradas = movements.filter(m => m.tipo === 'Entrada' || m.tipo === 'INGRESO' || m.type === 'Entrada').reduce((sum, m) => sum + Number(m.monto || m.amount?.replace(/[^0-9.-]+/g,"") || 0), 0);
  const salidas = movements.filter(m => m.tipo === 'Salida' || m.tipo === 'EGRESO' || m.type === 'Salida').reduce((sum, m) => sum + Number(m.monto || m.amount?.replace(/[^0-9.-]+/g,"") || 0), 0);
  const comisiones = movements.filter(m => m.tipo === 'Comisión' || m.tipo === 'COMISION' || m.type === 'Comisión').reduce((sum, m) => sum + Number(m.monto || m.amount?.replace(/[^0-9.-]+/g,"") || 0), 0);
  const porIdentificar = movements.filter(m => m.estado === 'Por Identificar' || m.estado === 'POR_IDENTIFICAR' || m.status === 'Por Identificar').length;

  const metrics = [
    { label: 'Entradas Bancarias', value: `$${entradas.toLocaleString('en-US', {minimumFractionDigits: 2})}`, desc: 'Cobros y depósitos', color: 'text-green-600', trend: 'Periodo Actual' },
    { label: 'Salidas Bancarias', value: `$${salidas.toLocaleString('en-US', {minimumFractionDigits: 2})}`, desc: 'Pagos y obligaciones', color: 'text-red-600', trend: 'Periodo Actual' },
    { label: 'Por Identificar', value: porIdentificar.toString(), desc: 'Sin documento asociado', color: 'text-amber-600', trend: 'Revisión' },
    { label: 'Comisiones', value: `$${comisiones.toLocaleString('en-US', {minimumFractionDigits: 2})}`, desc: 'Cargos bancarios', color: 'text-[#0b5156]', trend: 'Automático' },
  ];

  return (
    <div className="space-y-3 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <label className="bg-[#0b5156] text-white px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest hidden md:inline-flex">
                Finanzas &gt; Tesorería
              </label>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase">Movimientos Bancarios</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Consulta entradas, salidas, transferencias y comisiones bancarias.</p>
          </div>
          <div className="flex gap-3">
             <button onClick={handleExportCSV} className="bg-white text-[#0b5156] px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <Upload size={14} className="rotate-180" /> Exportar
             </button>
             <label className="cursor-pointer bg-white text-[#0b5156] px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <Upload size={14} /> Importar Extracto
                <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleImport} />
             </label>
             <button onClick={() => navigate('/tesoreria/conciliacion')} className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                Conciliar
             </button>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
        {metrics.map((m, i) => (
          <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24">
            <div className="flex justify-between items-start">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">{m.label}</p>
              <span className="text-[10px] font-black px-2 py-0.5 bg-slate-50 rounded-full text-slate-400">{m.trend}</span>
            </div>
            <div className="space-y-1">
              <strong className={`text-xl font-black ${m.color} tracking-tighter font-mono`}>{m.value}</strong>
              <p className="text-xs font-bold text-slate-400 uppercase leading-tight">{m.desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Main Table Section */}
      <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Movimientos Recientes</h2>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Operaciones pendientes de revisión o conciliación.</p>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
             <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <Calendar size={14} className="text-slate-400" />
                <input 
                  type="month" 
                  value={periodo} 
                  onChange={(e) => setPeriodo(e.target.value)} 
                  className="bg-transparent text-xs font-black text-slate-600 uppercase outline-none"
                />
             </div>
             <div className="relative flex-1 md:flex-none">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Referencia o monto..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156] w-full md:w-64" 
                />
             </div>
             <button className="p-2 bg-slate-50 text-slate-600 rounded-xl border border-slate-200 hover:bg-white transition-all">
                <Filter size={18} />
             </button>
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-2.5 px-6">ID MOVIMIENTO</th>
                <th className="py-2.5 px-4">BANCO</th>
                <th className="py-2.5 px-4 text-center">TIPO</th>
                <th className="py-2.5 px-4 text-right">MONTO</th>
                <th className="py-2.5 px-4 text-center">REFERENCIA</th>
                <th className="py-2.5 px-4 text-center">ESTADO</th>
                <th className="py-2.5 px-6 text-right">ACCIÓN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Cargando movimientos...
                  </td>
                </tr>
              ) : filteredMovements.length > 0 ? filteredMovements.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="py-2.5 px-6">
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-[#0b5156] uppercase group-hover:text-[#0b5156] transition-colors">{row.id || 'MOV-000'}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{row.desc || row.concepto}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex flex-col">
                       <span className="text-xs font-black text-slate-600 uppercase leading-none">{row.bank || row.banco || "Banco Asociado"}</span>
                       <span className="text-[9px] font-bold text-slate-400 uppercase">{row.moneda || 'VES'}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-center text-[10px] font-black text-slate-500 uppercase">{row.type || row.tipo}</td>
                  <td className={`py-2.5 px-4 text-right text-sm font-black font-mono ${(row.type || row.tipo) === 'Entrada' || (row.tipo || row.type) === 'INGRESO' ? 'text-green-600' : 'text-[#0b5156]'}`}>
                    {row.amount || (typeof row.monto === 'number' ? `$${row.monto.toLocaleString('en-US', {minimumFractionDigits: 2})}` : row.monto)}
                  </td>
                  <td className="py-2.5 px-4 text-center text-xs font-bold text-slate-400 font-mono uppercase">{row.ref || row.referencia || "-"}</td>
                  <td className="py-2.5 px-4 text-center">
                    <span className={`${row.statusColor || 'bg-slate-100 text-slate-700'} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight`}>
                      {row.status || row.estado || "Activo"}
                    </span>
                  </td>
                  <td className="py-2.5 px-6 text-right">
                    <button onClick={() => alert('Detalle de movimiento')} className="text-[10px] font-black text-[#0b5156] uppercase hover:underline flex items-center gap-1 justify-end ml-auto">
                      {row.action || 'Gestionar'} <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    No hay movimientos para este período
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <div className="grid grid-cols-1 gap-6 items-start">
        {/* Classified Movements */}
        <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Por Clasificar</h2>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Operaciones que requieren decisión contable.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
            {[
              { type: 'Cobros', title: 'Entradas sin cliente', desc: 'Cruzar con CxC antes de liberar saldo.', color: 'text-amber-600', bg: 'bg-amber-50' },
              { type: 'Comisiones', title: 'Cargos bancarios', desc: 'Deben generar asiento contable hoy.', color: 'text-blue-600', bg: 'bg-blue-50' },
              { type: 'Transferencias', title: 'Ops. pendientes', desc: 'Confirmar cuenta origen y destino.', color: 'text-amber-600', bg: 'bg-amber-50' },
            ].map((item, i) => (
              <div onClick={() => alert('Abriendo filtro de: ' + item.type)} key={i} className={`p-4 rounded-xl border border-slate-100 ${item.bg} space-y-2 group hover:scale-[1.02] transition-all cursor-pointer`}>
                 <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase border border-current/20 ${item.color}`}>{item.type}</span>
                 <h4 className="text-xs font-black text-[#0b5156] uppercase leading-tight">{item.title}</h4>
                 <p className="text-[10px] font-bold text-slate-500 uppercase leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </article>

        {/* Intelligence / Tips */}
        <article className="hidden bg-[#0b5156] p-5 rounded-2xl border border-[#0b5156]/10 shadow-2xl space-y-8 relative overflow-hidden">
          <Activity className="absolute right-[-20px] bottom-[-20px] text-white/5" size={160} />
          <div className="relative z-10 space-y-6">
            <h3 className="text-xl font-black text-white uppercase tracking-tight">Lectura Inteligente</h3>
            <div className="space-y-6 text-white/80">
              <div className="flex gap-4">
                 <div className="mt-1 w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center shrink-0"><ShieldAlert size={18} className="text-white" /></div>
                 <div className="space-y-1">
                    <h4 className="text-xs font-black uppercase">Identifica antes de conciliar.</h4>
                    <p className="text-xs font-bold uppercase leading-tight">Un movimiento sin origen distorsiona la caja real disponible.</p>
                 </div>
              </div>
              <div className="flex gap-4">
                 <div className="mt-1 w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center shrink-0"><Activity size={18} className="text-white" /></div>
                 <div className="space-y-1">
                    <h4 className="text-xs font-black uppercase">Las comisiones también cuentan.</h4>
                    <p className="text-xs font-bold uppercase leading-tight">Deben impactar la contabilidad y el flujo de caja para ser precisos.</p>
                 </div>
              </div>
            </div>
            <button className="w-full bg-white text-[#0b5156] font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-xl hover:scale-[1.02] transition-all">
              Ver Reporte de Comisiones
            </button>
          </div>
        </article>
      </div>
    </div>
  );
};

export default BankMovements;
