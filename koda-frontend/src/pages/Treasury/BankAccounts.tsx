import { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Zap,
  ChevronRight,
  Plus,
  X,
  Building2,
  Wallet,
  Coins
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';

const BankAccounts = () => {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newAccountForm, setNewAccountForm] = useState({ nombre: '', numero: '', moneda: 'VES' });
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const data = await api.get<any[]>('/tesoreria/bancos');
      setAccounts(data || []);
    } catch (error) {
      console.error("Error fetching bank accounts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredAccounts = useMemo(() => {
    if (!searchQuery.trim()) return accounts;
    const q = searchQuery.toLowerCase();
    return accounts.filter(acc => 
      (acc.name || acc.nombre || '').toLowerCase().includes(q) ||
      (acc.id || acc.identificacion || acc.numero || '').toLowerCase().includes(q) ||
      (acc.currency || acc.moneda || '').toLowerCase().includes(q)
    );
  }, [accounts, searchQuery]);

  const activeAccountsCount = accounts.filter(a => (a.status || a.estado) === 'Activa' || (a.status || a.estado) === 'Activo').length;
  const currencyAccountsCount = accounts.filter(a => (a.currency || a.moneda) === 'USD' || (a.currency || a.moneda) === 'EUR').length;
  
  const totalSaldoDisponible = accounts.reduce((sum, acc) => sum + (acc.saldo_divisas_raw || 0), 0);
  const totalPorConciliar = accounts.reduce((sum, acc) => sum + (acc.diferencia_raw || 0), 0);
  
  const metrics = [
    { label: 'Cuentas Activas', value: activeAccountsCount.toString(), desc: 'Bancos operativos', color: 'text-[#0b5156]' },
    { label: 'Saldo Disponible', value: `$${totalSaldoDisponible.toLocaleString('en-US', {minimumFractionDigits: 2})}`, desc: 'Caja bancaria operativa', color: 'text-green-600' },
    { label: 'Por Conciliar', value: `$${totalPorConciliar.toLocaleString('en-US', {minimumFractionDigits: 2})}`, desc: 'Diferencias pendientes', color: 'text-amber-600' },
    { label: 'Cuentas en Divisas', value: currencyAccountsCount.toString(), desc: 'Requieren tasa y control', color: 'text-blue-600' },
  ];

  const handleNewAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountForm.nombre || !newAccountForm.numero || !newAccountForm.moneda) return;
    
    try {
      setIsSaving(true);
      await api.post('/tesoreria/bancos', {
        nombre: newAccountForm.nombre,
        numero: newAccountForm.numero,
        moneda: newAccountForm.moneda,
        estado: 'Activa'
      });
      await fetchData();
      setIsModalOpen(false);
      setNewAccountForm({ nombre: '', numero: '', moneda: 'VES' });
    } catch (error) {
      console.error("Error creating bank account:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Finanzas &gt; Tesorería
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase">Cuentas Bancarias</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Control de bancos, cuentas, monedas, saldos y conciliación.</p>
          </div>
          <div className="flex gap-3">
             <button onClick={() => setIsModalOpen(true)} className="bg-slate-50 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-white transition-all flex items-center gap-2">
                <Plus size={14} /> Nueva Cuenta
             </button>
             <button onClick={() => navigate('/tesoreria/conciliacion')} className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                Conciliar Banco
             </button>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
        {metrics.map((m, i) => (
          <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">{m.label}</p>
            <div className="space-y-1">
              <strong className={`text-xl font-black ${m.color} tracking-tighter font-mono block leading-none`}>{m.value}</strong>
              <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">{m.desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Main Table Section */}
      <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-black text-[#0b5156] uppercase tracking-tighter leading-none">Cuentas Registradas</h2>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest leading-none">Bancos activos con saldo contable y conciliado.</p>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:flex-none">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
              <input 
                type="text" 
                placeholder="Buscar banco..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156] w-full md:w-64" 
              />
            </div>
            <button className="p-2 bg-slate-50 text-slate-600 rounded-xl border border-slate-200 hover:bg-white transition-all">
              <Filter size={16} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-2.5 px-6">BANCO / TIPO</th>
                <th className="py-2.5 px-4">IDENTIFICACIÓN</th>
                <th className="py-2.5 px-4 text-center">MONEDA</th>
                <th className="py-2.5 px-4 text-right">SALDO CONTABLE</th>
                <th className="py-2.5 px-4 text-right">EQUIV. DIVISAS</th>
                <th className="py-2.5 px-4 text-right">PENDIENTE</th>
                <th className="py-2.5 px-4 text-center">ESTADO</th>
                <th className="py-2.5 px-6 text-right">ACCIÓN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Cargando cuentas...
                  </td>
                </tr>
              ) : filteredAccounts.length > 0 ? filteredAccounts.map((row, i) => {
                const currency = row.currency || row.moneda || 'VES';
                const isUSD = currency === 'USD';
                return (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="py-2.5 px-6">
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-[#0b5156] uppercase group-hover:text-[#0b5156] transition-colors">{row.name || row.nombre}</span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase leading-none">{row.sub || row.tipo || 'Cuenta Bancaria'}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-xs font-black text-slate-500 font-mono">{row.numero || row.identificacion || row.id}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${isUSD ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-500'}`}>
                        {currency}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right text-xs font-black text-[#0b5156] font-mono">{row.balanceBs || row.saldo_contable || '$0.00'}</td>
                    <td className="py-2.5 px-4 text-right text-xs font-bold text-slate-400 font-mono">{row.balanceUsd || row.saldo_divisas || '$0.00'}</td>
                    <td className="py-2.5 px-4 text-right text-xs font-black text-amber-600 font-mono">{row.pending || row.diferencia || '-'}</td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`${row.statusColor || 'bg-green-100 text-green-700'} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight`}>
                        {row.status || row.estado || 'Activa'}
                      </span>
                    </td>
                    <td className="py-2.5 px-6 text-right">
                      <button onClick={() => navigate(`/tesoreria/movimientos-bancarios`)} className="text-xs font-black text-[#0b5156] uppercase hover:underline flex items-center gap-1 justify-end ml-auto">
                        Ver <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    No hay cuentas registradas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <div className="grid grid-cols-1 gap-6 items-start">
        <section className="col-span-1">
          <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tighter leading-none">Resumen de Decisión</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
              {[
                { type: 'Conciliar', title: `${accounts.filter(a => (a.diferencia_raw || 0) !== 0).length} Cuentas con diferencias`, desc: 'No usar como saldo final hasta revisar movimientos.', color: 'text-amber-600', bg: 'bg-amber-50' },
                { type: 'Validar', title: `${currencyAccountsCount} Cuentas en divisas`, desc: 'Requieren tasa y control de diferencia cambiaria.', color: 'text-blue-600', bg: 'bg-blue-50' },
                { type: 'Disponible', title: `$${totalSaldoDisponible.toLocaleString('en-US', {minimumFractionDigits: 2})} Saldo operativo`, desc: 'Usable para pagos priorizados y flujo de caja.', color: 'text-green-600', bg: 'bg-green-50' },
              ].map((item, i) => (
                <div key={i} className={`p-4 rounded-xl border border-slate-100 ${item.bg} space-y-2`}>
                   <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase border border-current/20 ${item.color}`}>{item.type}</span>
                   <h4 className="text-sm font-black text-[#0b5156] uppercase leading-tight">{item.title}</h4>
                   <p className="text-xs font-bold text-slate-500 uppercase leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </article>
        </section>

        <aside className="space-y-6 hidden">
          <article className="hidden bg-[#0b5156] p-5 rounded-2xl border border-[#0b5156]/10 shadow-2xl space-y-6">
            <Zap className="text-white/20" size={40} />
            <h3 className="text-lg font-black text-white uppercase tracking-tight">Lectura Inteligente</h3>
            <div className="space-y-6 text-white/80">
              <div className="space-y-1">
                <h4 className="text-xs font-black uppercase">No confíes solo en saldo contable.</h4>
                <p className="text-xs font-bold uppercase leading-tight">El saldo conciliado es el que refleja dinero validado.</p>
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-black uppercase">Conciliar antes de pagar.</h4>
                <p className="text-xs font-bold uppercase leading-tight">Evita programar salidas sobre dinero no confirmado.</p>
              </div>
            </div>
          </article>
        </aside>
      </div>

      {/* New Account Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 -translate-y-12">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#0b5156]/10 rounded-xl flex items-center justify-center text-[#0b5156]">
                  <Building2 size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#0b5156] uppercase tracking-tight">Nueva Cuenta Bancaria</h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Registra un nuevo banco</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors bg-white rounded-full p-1 border border-slate-200">
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleNewAccount} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <Building2 size={12} /> Banco
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="Ej. Banesco"
                  value={newAccountForm.nombre}
                  onChange={e => setNewAccountForm(f => ({...f, nombre: e.target.value}))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-[#0b5156] focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <Wallet size={12} /> Número de Cuenta
                </label>
                <input 
                  type="text" 
                  required
                  placeholder="0134-xxxx-xxxx-xxxx-xxxx"
                  value={newAccountForm.numero}
                  onChange={e => setNewAccountForm(f => ({...f, numero: e.target.value}))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono font-bold text-slate-700 outline-none focus:border-[#0b5156] focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <Coins size={12} /> Moneda
                </label>
                <select 
                  value={newAccountForm.moneda}
                  onChange={e => setNewAccountForm(f => ({...f, moneda: e.target.value}))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-[#0b5156] focus:bg-white transition-all"
                >
                  <option value="VES">Bolívares (VES)</option>
                  <option value="USD">Dólares (USD)</option>
                  <option value="EUR">Euros (EUR)</option>
                </select>
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-3 bg-slate-50 text-slate-600 text-xs font-black uppercase rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={isSaving} className="flex-1 px-4 py-3 bg-[#0b5156] text-white text-xs font-black uppercase rounded-xl hover:bg-[#083a3d] shadow-lg shadow-green-900/20 transition-all disabled:opacity-50">
                  {isSaving ? 'Guardando...' : 'Registrar Cuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankAccounts;
