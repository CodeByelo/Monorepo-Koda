import { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Receipt, 
  X, 
  Search, 
  Filter,
  Camera,
  User,
  TrendingDown
} from 'lucide-react';
import { api } from '@/api/client';
import { useNavigate } from 'react-router-dom';

const PettyCash = () => {
  const navigate = useNavigate();
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };
  const [showModal, setShowModal] = useState(false);
  
  const [funds, setFunds] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [metricsData, setMetricsData] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Form states
  const [gastoMonto, setGastoMonto] = useState('');
  const [gastoFecha, setGastoFecha] = useState(() => new Date().toISOString().split('T')[0]);
  const [gastoConcepto, setGastoConcepto] = useState('');
  const [gastoSoporte, setGastoSoporte] = useState('Factura Fiscal (Deducible)');
  const [gastoNoDeducible, setGastoNoDeducible] = useState(false);
  const [gastoFondoId, setGastoFondoId] = useState('');

  const [showFundModal, setShowFundModal] = useState(false);
  const [fundName, setFundName] = useState('');
  const [fundResponsable, setFundResponsable] = useState('');
  const [fundAsignado, setFundAsignado] = useState<number>(100);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const data = await api.get<any>('/tesoreria/caja-chica');
      setMetricsData(data?.metricas || {});
      setFunds(data?.fondos || []);
      setExpenses(data?.gastos || []);
      
      if (data?.fondos && data.fondos.length > 0) {
        setGastoFondoId(data.fondos[0].id);
      }
    } catch (error) {
      console.error("Error fetching petty cash data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReponerCajaChica = async () => {
    try {
      await api.post('/tesoreria/caja-chica/reponer', {});
      showToast("Fondos de Caja Chica repuestos con éxito en todos los fondos.");
      fetchData();
    } catch (error) {
      console.error("Error al reponer caja chica:", error);
      showToast("Error al procesar la reposición de fondos.");
    }
  };

  const handleRegisterFund = async () => {
    if (!fundName || !fundResponsable || fundAsignado <= 0) {
      showToast("Por favor complete todos los datos del fondo.");
      return;
    }
    try {
      await api.post('/tesoreria/caja-chica/fondos', {
        nombre: fundName,
        responsable: fundResponsable,
        asignado_usd: fundAsignado
      });
      showToast("Nuevo fondo de Caja Chica registrado exitosamente.");
      setShowFundModal(false);
      setFundName('');
      setFundResponsable('');
      setFundAsignado(100);
      fetchData();
    } catch (error) {
      console.error("Error registrando fondo:", error);
      showToast("Error al registrar el fondo de caja chica.");
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredExpenses = useMemo(() => {
    if (!searchQuery.trim()) return expenses;
    const q = searchQuery.toLowerCase();
    return expenses.filter(e => 
      (e.desc || e.descripcion || '').toLowerCase().includes(q) ||
      (e.id || e.referencia || '').toLowerCase().includes(q) ||
      (e.fund || e.fondo || '').toLowerCase().includes(q)
    );
  }, [expenses, searchQuery]);

  const handleRegistrarGasto = async () => {
    try {
      await api.post('/tesoreria/caja-chica/movimiento', {
        fondo_id: gastoFondoId,
        monto: Number(gastoMonto),
        fecha: gastoFecha,
        concepto: gastoConcepto,
        soporte: gastoSoporte,
        no_deducible: gastoNoDeducible
      });
      showToast("Gasto registrado exitosamente.");
      setShowModal(false);
      setGastoMonto('');
      setGastoConcepto('');
      fetchData();
    } catch (error) {
      console.error("Error registrando gasto:", error);
      showToast("Error al registrar el gasto.");
    }
  };

  const metrics = [
    { label: 'Fondo Asignado', value: metricsData.fondo_asignado || '$0.00', desc: 'Total fondos menores', color: 'text-[#0b5156]' },
    { label: 'Saldo Disponible', value: metricsData.saldo_disponible || '$0.00', desc: 'Caja operativa', color: 'text-green-600' },
    { label: 'Soportes Pendientes', value: metricsData.soportes_pendientes || '0', desc: 'Requieren comprobante', color: 'text-amber-600' },
    { label: 'Reintegro Sugerido', value: metricsData.reintegro_sugerido || '$0.00', desc: 'Para reponer fondo', color: 'text-red-600' },
  ];

  return (
    <div className="space-y-3 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Tesorería &gt; Gastos Menores
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase">Caja Chica</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Control de fondos operativos, responsables y soportes digitales.</p>
          </div>
          <div className="flex gap-3">
             <button onClick={() => setShowModal(true)} className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <Plus size={14} /> Registrar Gasto
             </button>
             <button onClick={() => navigate('/tesoreria/arqueo')} className="bg-slate-50 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-white transition-all flex items-center gap-2">
                <TrendingDown size={14} /> Arqueo de Caja
             </button>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
        {metrics.map((m, i) => (
          <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">{m.label}</p>
            <div className="space-y-1">
              <strong className={`text-xl font-black ${m.color} tracking-tighter font-mono`}>{m.value}</strong>
              <p className="text-xs font-bold text-slate-400 uppercase leading-tight">{m.desc}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <section className="lg:col-span-2 space-y-6">
          {/* Funds Table */}
          <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Fondos Activos</h2>
              <button onClick={() => setShowFundModal(true)} className="text-xs font-black text-[#0b5156] uppercase hover:underline">Gestionar Fondos</button>
            </div>
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                    <th className="py-2.5 px-6">ID FONDO</th>
                    <th className="py-2.5 px-4">RESPONSABLE</th>
                    <th className="py-2.5 px-4 text-right">ASIGNADO</th>
                    <th className="py-2.5 px-4 text-right">DISPONIBLE</th>
                    <th className="py-2.5 px-4 text-center">ESTADO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Cargando fondos...
                      </td>
                    </tr>
                  ) : funds.length > 0 ? funds.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-2.5 px-6">
                        <div className="flex flex-col">
                          <span className="font-black text-[#0b5156] uppercase">{row.id}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">{row.name || row.nombre}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                         <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-slate-400"><User size={12} /></div>
                            <span className="font-black text-slate-500 uppercase">{row.responsible || row.responsable}</span>
                         </div>
                      </td>
                      <td className="py-2.5 px-4 text-right font-black text-slate-400 font-mono">{row.assigned || row.asignado}</td>
                      <td className="py-2.5 px-4 text-right font-black text-[#0b5156] font-mono">{row.available || row.disponible}</td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={`${row.color || 'bg-slate-100 text-slate-700'} px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tight`}>
                          {row.status || row.estado}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        No hay fondos registrados
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          {/* Expenses Table */}
          <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
               <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Gastos Recientes</h2>
               <div className="flex gap-2">
                  <div className="relative">
                     <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                     <input 
                       type="text" 
                       placeholder="Concepto..." 
                       value={searchQuery}
                       onChange={(e) => setSearchQuery(e.target.value)}
                       className="bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156] w-48" 
                     />
                  </div>
                  <button className="p-2 bg-slate-50 text-slate-600 rounded-lg border border-slate-200 hover:bg-white">
                     <Filter size={16} />
                  </button>
               </div>
            </div>
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                    <th className="py-2.5 px-6">GASTO</th>
                    <th className="py-2.5 px-4">CONCEPTO</th>
                    <th className="py-2.5 px-4 text-right">MONTO</th>
                    <th className="py-2.5 px-4 text-center">SOPORTE</th>
                    <th className="py-2.5 px-6 text-right">ESTADO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Cargando gastos...
                      </td>
                    </tr>
                  ) : filteredExpenses.length > 0 ? filteredExpenses.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-2.5 px-6">
                        <div className="flex flex-col">
                          <span className="font-black text-[#0b5156] uppercase">{row.id || row.referencia}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">{row.date || row.fecha}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                         <div className="flex flex-col">
                            <span className="font-black text-slate-500 uppercase">{row.desc || row.descripcion}</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Fondo: {row.fund || row.fondo}</span>
                         </div>
                      </td>
                      <td className="py-2.5 px-4 text-right font-black text-[#0b5156] font-mono">{row.amount || row.monto}</td>
                      <td className="py-2.5 px-4 text-center font-black text-slate-500 uppercase">{row.support || row.soporte}</td>
                      <td className="py-2.5 px-6 text-right">
                        <span className={`${row.color || 'bg-slate-100 text-slate-700'} px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tight`}>
                          {row.status || row.estado}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        No hay gastos registrados
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <aside className="space-y-6">
          {/* Reintegros */}
          <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-6">
             <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Reintegros</h3>
             <div className="space-y-4">
                {[
                  { type: 'Reintegrar', title: `${metricsData.reintegro_sugerido || '$0.00'} sugeridos`, desc: 'Para restituir fondos.', color: 'text-red-600', bg: 'bg-red-50' },
                  { type: 'Soportes', title: `${metricsData.soportes_pendientes || '0'} incompletos`, desc: 'No cerrar sin factura.', color: 'text-amber-600', bg: 'bg-amber-50' },
                  { type: 'Fiscal', title: 'Por clasificar', desc: 'Gasto operativo deducible.', color: 'text-blue-600', bg: 'bg-blue-50' },
                ].map((item, i) => (
                  <div key={i} className={`p-5 rounded-2xl border border-slate-100 ${item.bg} space-y-1`}>
                     <span className={`text-[10px] font-black uppercase ${item.color}`}>{item.type}</span>
                     <h4 className="text-sm font-black text-[#0b5156] uppercase leading-tight">{item.title}</h4>
                     <p className="text-[10px] font-bold text-slate-500 uppercase">{item.desc}</p>
                  </div>
                ))}
             </div>
             <button onClick={handleReponerCajaChica} className="w-full bg-[#0b5156] text-white font-black py-4 rounded-2xl uppercase text-[10px] tracking-widest shadow-lg shadow-green-900/20 hover:scale-[1.02] transition-all">
                Solicitar Reposición de Fondos
             </button>
          </article>

        </aside>
      </div>

      {/* Register Expense Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                 <div className="flex items-center gap-2">
                    <div className="p-2 bg-[#0b5156] text-white rounded-lg"><Receipt size={16} /></div>
                    <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tight">Registrar Gasto</h3>
                 </div>
                 <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
              </div>
              <div className="p-8 space-y-6">
                 <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Fondo de Caja Chica</label>
                    <select 
                      value={gastoFondoId}
                      onChange={(e) => setGastoFondoId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156]"
                    >
                      {funds.map(f => (
                        <option key={f.id} value={f.id}>{f.name || f.nombre} ({f.id})</option>
                      ))}
                    </select>
                 </div>

                 <div className="grid grid-cols-2 gap-3 items-start">
                    <div className="space-y-2">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Monto del Gasto</label>
                       <input 
                         type="number" 
                         value={gastoMonto}
                         onChange={(e) => setGastoMonto(e.target.value)}
                         className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156] font-mono" 
                         placeholder="0.00" 
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Fecha</label>
                       <input 
                         type="date" 
                         value={gastoFecha}
                         onChange={(e) => setGastoFecha(e.target.value)}
                         className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156]" 
                       />
                    </div>
                 </div>

                 <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Concepto / Descripción</label>
                    <input 
                      type="text" 
                      value={gastoConcepto}
                      onChange={(e) => setGastoConcepto(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156]" 
                      placeholder="Ej: Pago de mensajería, papelería..." 
                    />
                 </div>

                 <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between gap-4">
                    <div className="flex-1 space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block pl-1">Tipo de Soporte</label>
                       <select 
                         value={gastoSoporte}
                         onChange={(e) => setGastoSoporte(e.target.value)}
                         className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156] uppercase"
                       >
                          <option>Factura Fiscal (Deducible)</option>
                          <option>Recibo / Vale (No Deducible)</option>
                       </select>
                    </div>
                    <div className="flex items-center gap-2 pt-6">
                       <input 
                         type="checkbox" 
                         checked={gastoNoDeducible}
                         onChange={(e) => setGastoNoDeducible(e.target.checked)}
                         id="no-deductible-check" 
                         className="w-4 h-4 rounded border-slate-300 text-[#0b5156] focus:ring-[#0b5156]" 
                       />
                       <label htmlFor="no-deductible-check" className="text-[10px] font-black text-red-600 uppercase">No Deducible</label>
                    </div>
                 </div>

                 <div className="border-2 border-dashed border-slate-200 p-10 rounded-2xl text-center cursor-pointer hover:bg-slate-50 transition-all group">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                       <Camera className="text-slate-400 group-hover:text-[#0b5156]" size={24} />
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subir foto del comprobante<br/><span className="text-slate-300 font-bold">(JPEG, PNG o PDF)</span></p>
                 </div>

                 <button 
                   onClick={handleRegistrarGasto}
                   disabled={!gastoMonto || !gastoConcepto}
                   className="w-full bg-[#0b5156] text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-xl shadow-green-900/20 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100"
                 >
                    Guardar Gasto en Caja
                 </button>
              </div>
           </div>
        </div>
      )}
      {/* Register Fund Modal */}
      {showFundModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                 <div className="flex items-center gap-2">
                    <div className="p-2 bg-[#0b5156] text-white rounded-lg"><Plus size={16} /></div>
                    <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tight">Nuevo Fondo de Caja Chica</h3>
                 </div>
                 <button onClick={() => setShowFundModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
              </div>
              <div className="p-8 space-y-6">
                 <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Nombre del Fondo</label>
                    <input 
                      type="text" 
                      value={fundName}
                      onChange={(e) => setFundName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156]" 
                      placeholder="Ej: Caja Chica Ventas" 
                    />
                 </div>

                 <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Responsable</label>
                    <input 
                      type="text" 
                      value={fundResponsable}
                      onChange={(e) => setFundResponsable(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156]" 
                      placeholder="Ej: Henry Rodriguez" 
                    />
                 </div>

                 <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Monto Asignado (USD)</label>
                    <input 
                      type="number" 
                      value={fundAsignado}
                      onChange={(e) => setFundAsignado(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156] font-mono" 
                      placeholder="500.00" 
                    />
                 </div>

                 <button 
                   onClick={handleRegisterFund}
                   disabled={!fundName || !fundResponsable || fundAsignado <= 0}
                   className="w-full bg-[#0b5156] text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-xl shadow-green-900/20 hover:scale-[1.02] transition-all disabled:opacity-50"
                 >
                    Registrar Fondo
                 </button>
              </div>
           </div>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-5 right-5 bg-slate-900/90 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-xl z-50 border border-slate-700/50 flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-300">
          <span className="text-xs font-black uppercase tracking-wider">🔔 {toast}</span>
        </div>
      )}
    </div>
  );
};

export default PettyCash;
