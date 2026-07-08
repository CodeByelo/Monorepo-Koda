import { useState, useEffect, useMemo } from 'react';
import { api } from '@/api/client';
import { 
  Plus, 
  Search, 
  Filter, 
  Download, 
  Camera, 
  FileText, 
  X,
  Image as ImageIcon
} from 'lucide-react';

const CashMovements = () => {
  const [showModal, setShowModal] = useState(false);
  const [movements, setMovements] = useState<any[]>([]);
  const [metricsData, setMetricsData] = useState<any>({
    saldo_caja: '$0.00',
    no_deducibles: '$0.00',
    soportes_pct: '0%'
  });
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyNonDeductibles, setShowOnlyNonDeductibles] = useState(false);

  // Form states
  const [monto, setMonto] = useState('');
  const [tipo, setTipo] = useState('EGRESO'); // EGRESO, INGRESO
  const [concepto, setConcepto] = useState('');
  const [referencia, setReferencia] = useState('');
  const [cuentaId, setCuentaId] = useState<number | ''>('');
  const [validationFiscal, setValidationFiscal] = useState('LEGAL');

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const data = await api.get<any>('/tesoreria/movimientos-caja');
      setMetricsData(data?.metricas || {});
      setMovements(data?.movimientos || []);

      const accountsRes = await api.get<any[]>('/tesoreria/cuentas');
      // Filter for cash accounts (containing "Caja" in banco)
      const cashAccounts = accountsRes.filter(a => a.banco.toLowerCase().includes('caja'));
      setAccounts(cashAccounts);
      if (cashAccounts.length > 0) {
        setCuentaId(cashAccounts[0].id);
      }
    } catch (error) {
      console.error("Error loading cash movements:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRegisterMovement = async () => {
    if (!cuentaId || !monto || !concepto) {
      alert("Por favor complete todos los datos requeridos.");
      return;
    }
    try {
      await api.post('/tesoreria/movimientos-caja', {
        cuenta_id: cuentaId,
        concepto,
        monto_usd: Number(monto),
        tipo,
        referencia: validationFiscal === 'LEGAL' ? (referencia || 'FACT-GEN') : '',
        tasa_cambio_bs: 36.42
      });
      alert("Movimiento registrado en libro de caja principal.");
      setShowModal(false);
      setMonto('');
      setConcepto('');
      setReferencia('');
      fetchData();
    } catch (error) {
      console.error("Error registering movement:", error);
      alert("Error al registrar el movimiento.");
    }
  };

  const filteredMovements = useMemo(() => {
    let result = movements;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m => 
        (m.desc || '').toLowerCase().includes(q) ||
        (m.support || '').toLowerCase().includes(q) ||
        (m.cuenta_nombre || '').toLowerCase().includes(q)
      );
    }
    if (showOnlyNonDeductibles) {
      result = result.filter(m => m.fiscal === 'No Deducible');
    }
    return result;
  }, [movements, searchQuery, showOnlyNonDeductibles]);

  const metrics = [
    { label: 'Saldo en Caja', value: metricsData.saldo_caja || '$0.00', desc: 'Suma de cajas chicas y principal', color: 'text-[#0b5156]' },
    { label: 'No Deducibles (Mes)', value: metricsData.no_deducibles || '$0.00', desc: 'Sin soporte fiscal legal', color: 'text-amber-600' },
    { label: 'Soportes Digitales', value: metricsData.soportes_pct || '0%', desc: 'Con imagen adjunta', color: 'text-green-600' },
  ];

  return (
    <div className="space-y-3 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Tesorería &gt; Libro Auxiliar
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase">Libro de Caja Principal</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Registro histórico de entradas y salidas de efectivo con validación fiscal.</p>
          </div>
          <div className="flex gap-3">
             <button onClick={() => setShowModal(true)} className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <Plus size={14} /> Registrar Movimiento
             </button>
              <button 
                onClick={() => setShowOnlyNonDeductibles(!showOnlyNonDeductibles)}
                className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase border transition-all flex items-center gap-2 ${showOnlyNonDeductibles ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-white'}`}
              >
                 <Download size={14} /> No Deducibles
              </button>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
        {metrics.map((m, i) => (
          <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between min-h-24">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">{m.label}</p>
            <div className="space-y-1">
              <strong className={`text-xl font-black ${m.color} tracking-tighter font-mono`}>{m.value}</strong>
              <p className="text-xs font-bold text-slate-400 uppercase leading-tight mt-1">{m.desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Main Table Section */}
      <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Movimientos del Libro</h2>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Cruce diario de entradas y salidas de caja.</p>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:flex-none">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Concepto o referencia..." 
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
          <table className="w-full text-left font-mono">
            <thead>
              <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-2.5 px-6">FECHA</th>
                <th className="py-2.5 px-4">CONCEPTO</th>
                <th className="py-2.5 px-4 text-right">MONTO</th>
                <th className="py-2.5 px-4 text-center">SOPORTE</th>
                <th className="py-2.5 px-4 text-center">FISCAL</th>
                <th className="py-2.5 px-4 text-center">DIGITAL</th>
                <th className="py-2.5 px-6 text-right">ACCIÓN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-[11px]">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center font-bold text-slate-400 uppercase tracking-widest">
                    Cargando movimientos...
                  </td>
                </tr>
              ) : filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center font-bold text-slate-400 uppercase tracking-widest">
                    No hay movimientos registrados
                  </td>
                </tr>
              ) : (
                filteredMovements.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="py-2.5 px-6 font-bold text-slate-400">{row.date}</td>
                    <td className="py-2.5 px-4 font-black text-[#0b5156] uppercase">
                      <div className="flex flex-col">
                        <span>{row.desc}</span>
                        <span className="text-[9px] text-slate-400 font-bold uppercase">Caja: {row.cuenta_nombre}</span>
                      </div>
                    </td>
                    <td className={`py-2.5 px-4 text-right font-black ${row.amount.startsWith('-') ? 'text-red-600' : 'text-green-600'}`}>
                      {row.amount}
                    </td>
                    <td className="py-2.5 px-4 text-center font-bold text-slate-500 uppercase">{row.support}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`${row.fColor} px-2 py-0.5 rounded text-[9px] font-black uppercase`}>
                        {row.fiscal}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {row.hasImage ? (
                        <button className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-400 hover:text-[#0b5156] hover:border-[#0b5156]/20 transition-all mx-auto">
                          {row.imageType === 'camera' ? <Camera size={14} /> : <FileText size={14} />}
                        </button>
                      ) : (
                        <span className="text-slate-200">--</span>
                      )}
                    </td>
                    <td className="py-2.5 px-6 text-right">
                      <button className="text-[10px] font-black text-[#0b5156] uppercase hover:underline">Ver Detalle</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* New Movement Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-2">
                    <div className="p-2 bg-[#0b5156] text-white rounded-lg"><Plus size={16} /></div>
                    <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tight">Nuevo Movimiento de Caja</h3>
                 </div>
                 <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
              </div>
              <div className="p-8 space-y-6 overflow-y-auto no-scrollbar">
                 <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Caja Seleccionada</label>
                    <select 
                      value={cuentaId}
                      onChange={(e) => setCuentaId(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156] uppercase"
                    >
                       {accounts.map(acc => (
                         <option key={acc.id} value={acc.id}>{acc.banco} ({acc.moneda})</option>
                       ))}
                    </select>
                 </div>

                 <div className="grid grid-cols-2 gap-3 items-start">
                    <div className="space-y-2">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Monto (USD)</label>
                       <input 
                         type="number" 
                         value={monto}
                         onChange={(e) => setMonto(e.target.value)}
                         className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156] font-mono" 
                         placeholder="0.00" 
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Tipo</label>
                       <select 
                         value={tipo}
                         onChange={(e) => setTipo(e.target.value)}
                         className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156] uppercase"
                       >
                          <option value="EGRESO">Egreso (Salida)</option>
                          <option value="INGRESO">Ingreso (Entrada)</option>
                       </select>
                    </div>
                 </div>

                 <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Concepto Detallado</label>
                    <input 
                      type="text" 
                      value={concepto}
                      onChange={(e) => setConcepto(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156]" 
                      placeholder="Ej: Pago de transporte a almacén..." 
                    />
                 </div>

                 <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block pl-1">Validación Fiscal</label>
                    <div className="flex gap-6">
                       <div className="flex items-center gap-2">
                          <input 
                            type="radio" 
                            name="fiscal-type" 
                            id="f-legal" 
                            checked={validationFiscal === 'LEGAL'}
                            onChange={() => setValidationFiscal('LEGAL')}
                            className="w-4 h-4 text-[#0b5156] focus:ring-[#0b5156]" 
                          />
                          <label htmlFor="f-legal" className="text-xs font-black text-slate-600 uppercase">Factura Legal</label>
                       </div>
                       <div className="flex items-center gap-2">
                          <input 
                            type="radio" 
                            name="fiscal-type" 
                            id="f-vale" 
                            checked={validationFiscal === 'VALE'}
                            onChange={() => setValidationFiscal('VALE')}
                            className="w-4 h-4 text-[#0b5156] focus:ring-[#0b5156]" 
                          />
                          <label htmlFor="f-vale" className="text-xs font-black text-slate-600 uppercase">Vale de Caja</label>
                       </div>
                    </div>
                 </div>

                 {validationFiscal === 'LEGAL' && (
                   <div className="space-y-2 animate-in slide-in-from-top duration-200">
                      <label className="text-xs font-black text-slate-500 uppercase tracking-widest block pl-1">Nro. de Factura / Control</label>
                      <input 
                        type="text" 
                        value={referencia}
                        onChange={(e) => setReferencia(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156]" 
                        placeholder="Ej: FAC-12345" 
                      />
                   </div>
                 )}

                 <div className="border-2 border-dashed border-slate-200 p-10 rounded-2xl text-center cursor-pointer hover:bg-slate-50 transition-all group">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                       <ImageIcon className="text-slate-400 group-hover:text-[#0b5156]" size={24} />
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Adjuntar Soporte Digital<br/><span className="text-slate-300 font-bold">(Foto o Escaneo)</span></p>
                 </div>

                 <button onClick={handleRegisterMovement} className="w-full bg-[#0b5156] text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-xl shadow-green-900/20 hover:scale-[1.02] transition-all">
                    Registrar en Libro
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default CashMovements;
