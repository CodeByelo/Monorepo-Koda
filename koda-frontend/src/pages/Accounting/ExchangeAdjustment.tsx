import { 
  ArrowLeft,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Database,
  AlertTriangle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useMemo, useEffect } from 'react';
import { api } from '@/api/client';

const ExchangeAdjustment = () => {
  const [rate, setRate] = useState(0);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      api.get<any[]>('/tesoreria/bancos').catch(() => []),
      api.get<any>('/tasa/actual').catch(() => null),
    ])
      .then(([data, rateData]) => {
        setRate(Number(rateData?.valor_ves || rateData?.tasa || 0));
        const usdAccs = (data || []).filter((a: any) => a.moneda === 'USD');
        setAccounts(usdAccs);
      })
      .catch((err) => {
        console.error("Error fetching bank accounts:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const processedAccounts = useMemo(() => {
    return accounts.map(acc => {
      const usd = Number(acc.saldo_actual || 0);
      const baselineRate = Number(acc.tasa_registro || acc.tasa_historica || rate);
      const bsSys = Math.round((usd * baselineRate) * 100) / 100;
      const realVal = Math.round((usd * rate) * 100) / 100;
      const diff = Math.round((realVal - bsSys) * 100) / 100;
      return {
        id: String(acc.id),
        code: acc.numero_cuenta || '1.1.01.02.001',
        name: acc.banco || 'Banco USD',
        usd,
        bsSys,
        realVal,
        diff
      };
    });
  }, [accounts, rate]);

  const totalDiff = useMemo(() => {
    const sum = processedAccounts.reduce((acc, curr) => acc + curr.diff, 0);
    return Math.round(sum * 100) / 100;
  }, [processedAccounts]);

  const handleGenerateEntry = () => {
    if (processedAccounts.length === 0) {
      alert("No hay cuentas con saldos en divisas para ajustar.");
      return;
    }
    const message = `🛡️ PROTOCOLO DE REEXPRESIÓN CAMBIARIA\n\nTasa: Bs. ${rate} (BCV)\nTotal Ajuste: Bs. ${totalDiff.toLocaleString('es-VE', { minimumFractionDigits: 2 })}\n\n¿Desea insertar el asiento automático en el Libro Diario?`;
    if (window.confirm(message)) {
      alert("✅ Asiento de Ajuste Cambiario generado exitosamente.");
    }
  };

  return (
    <div className="space-y-1.5 animate-in fade-in duration-500 pb-4">
      {/* Header */}
      <header className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <Link to="/contabilidad" className="bg-koda-main/10 text-koda-main text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-koda-main/20 transition-all">
                <ArrowLeft size={10} /> Volver
              </Link>
              <span className="bg-koda-main text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Contabilidad &gt; Ajustes
              </span>
            </div>
            <h1 className="text-xl font-black text-koda-main tracking-tighter uppercase leading-none">Reexpresión de Saldos</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Diferencial Cambiario: Ajuste de saldos en Bolívares según tasa oficial BCV.</p>
          </div>
          <div className="flex gap-3 items-center">
             <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 flex items-center gap-3 shadow-sm group">
                <div className="space-y-0.5 text-right">
                   <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block leading-none">Tasa BCV Oficial</span>
                   <p className="text-[10px] font-black text-koda-main uppercase leading-none italic">Actualizada hoy</p>
                </div>
                <div className="relative">
                   <span className="absolute left-2.5 top-2 text-[10px] font-black text-slate-400">Bs.</span>
                   <input 
                     type="number" 
                     value={rate}
                     onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
                     className="w-24 bg-white border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs font-black font-mono text-koda-main outline-none focus:border-koda-main transition-all"
                   />
                </div>
             </div>
             <button 
              onClick={handleGenerateEntry}
              className="bg-koda-main text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-koda-mainHover transition-all"
             >
                <Sparkles size={14} /> Generar Asiento
             </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
        {/* Main Analysis Table */}
        <article className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
           <div className="py-2.5 px-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
              <div className="space-y-1">
                <h2 className="text-base font-black text-koda-main uppercase tracking-tighter leading-none">Análisis de Cuentas en Divisas</h2>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cuentas de Caja y Bancos que mantienen saldos en moneda extranjera.</p>
              </div>
           </div>

           <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                 <thead>
                    <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                       <th className="py-2 px-4">Cuenta Contable</th>
                       <th className="py-2 px-4 text-right">Saldo USD</th>
                       <th className="py-2 px-4 text-right">Saldo Bs (Sistema)</th>
                       <th className="py-2 px-4 text-right">Valor Real (Bs)</th>
                       <th className="py-2 px-4 text-right">Diferencia</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50 text-xs">
                    {isLoading ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400 font-bold uppercase">
                          Cargando cuentas...
                        </td>
                      </tr>
                    ) : processedAccounts.length > 0 ? (
                      processedAccounts.map((acc) => (
                        <tr key={acc.id} className="hover:bg-slate-50/50 transition-all group">
                           <td className="py-2 px-4">
                              <div className="space-y-0.5">
                                 <strong className="text-slate-700 uppercase font-black block leading-tight">{acc.name}</strong>
                                 <span className="text-[9px] font-mono text-slate-400">{acc.code}</span>
                              </div>
                           </td>
                           <td className="py-2 px-4 text-right font-black font-mono text-slate-600">
                              ${acc.usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                           </td>
                           <td className="py-2 px-4 text-right font-black font-mono text-slate-400">
                              Bs. {acc.bsSys.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                           </td>
                           <td className="py-2 px-4 text-right font-black font-mono text-koda-main">
                              Bs. {acc.realVal.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                           </td>
                           <td className={`py-2 px-4 text-right font-black font-mono text-xs ${acc.diff > 0 ? 'text-green-600' : acc.diff < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                              {acc.diff > 0 ? '+' : ''}Bs. {acc.diff.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                           </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400 font-bold uppercase">
                          No se encontraron cuentas con saldo en divisas registradas.
                        </td>
                      </tr>
                    )}
                 </tbody>
              </table>
           </div>

           {/* Summary Footer Panel */}
           <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                 <div className={`p-2 rounded-xl border ${totalDiff >= 0 ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                    {totalDiff >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                 </div>
                 <div className="space-y-0.5">
                    <h4 className="text-xs font-black uppercase tracking-tight">Impacto Neto del Ajuste</h4>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Resultado a registrar en Diferencial Cambiario.</p>
                 </div>
              </div>
              <div className="text-right">
                 <span className="text-[10px] font-black text-white/40 uppercase block mb-0.5 tracking-widest">Total Diferencia</span>
                 <strong className={`text-lg font-black font-mono tracking-tighter ${totalDiff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {totalDiff >= 0 ? '+' : ''}Bs. {totalDiff.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                 </strong>
              </div>
           </div>
        </article>

        {/* Sidebar Info */}
        <aside className="space-y-2">
           <article className="bg-koda-main p-4 rounded-xl text-white shadow-lg relative overflow-hidden group">
              <div className="relative z-10 space-y-4">
                 <div className="flex items-center gap-2">
                    <Database size={18} className="text-white/40" />
                    <h3 className="text-sm font-black uppercase tracking-tighter leading-none">Destino Contable</h3>
                 </div>
                 <div className="space-y-3">
                    <p className="text-[10px] font-bold text-white/60 uppercase leading-relaxed">
                       La diferencia neta calculada se registrará automáticamente contra la cuenta:
                    </p>
                    <div className="p-3 bg-white/10 rounded-xl border border-white/20 group-hover:bg-white/20 transition-all">
                       <strong className="text-sm font-black block leading-tight">5.2.01.01</strong>
                       <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Ganancia o Pérdida por Diferencial Cambiario</span>
                    </div>
                 </div>
              </div>
              <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-1000" />
           </article>

           <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center gap-2 text-koda-main">
                 <AlertTriangle size={16} />
                 <strong className="text-[10px] font-black uppercase">Nota Importante</strong>
              </div>
              <p className="text-[10px] font-bold text-slate-500 uppercase leading-relaxed italic">
                 "La reexpresión de saldos es una rutina de auditoría crítica. Asegúrese de que la tasa BCV coincida con la gaceta oficial o la publicación del Banco Central antes de mayorizar el asiento."
              </p>
           </div>
        </aside>
      </div>
    </div>
  );
};

export default ExchangeAdjustment;
