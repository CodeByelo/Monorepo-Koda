import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { 
  TrendingUp, 
  AlertTriangle, 
  Calculator,
  ShieldCheck,
  ChevronRight,
  Info,
  X
} from 'lucide-react';
import { api } from '@/api/client';

const CashFlowTreasury = () => {
  const navigate = useNavigate();
  const [scenario, setScenario] = useState(1);
  const [projections, setProjections] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showManualModal, setShowManualModal] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<any>('/tesoreria/flujo-caja').catch(() => null),
      api.get<any[]>('/tesoreria/cuentas').catch(() => []),
    ]).then(([flujoData, accountsData]) => {
      setProjections(flujoData?.proyecciones || []);
      setBankAccounts(accountsData || []);
    }).finally(() => setIsLoading(false));
  }, []);

  const totalBancos = bankAccounts.reduce((sum, b) => sum + (Number(b.saldo) || 0), 0);
  const totalEntradas = projections.filter(p => p.type === 'Entrada' || p.tipo === 'Entrada').reduce((sum, p) => sum + (Number(p.amount || p.monto) || 0), 0);
  const totalSalidas = projections.filter(p => p.type === 'Salida' || p.tipo === 'Salida').reduce((sum, p) => sum + (Number(p.amount || p.monto) || 0), 0);
  const cajaProyectada = totalBancos + totalEntradas - totalSalidas;

  const metrics = [
    { label: 'Caja Inicial', value: `$${totalBancos.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, desc: 'Saldo bancario actual', color: 'text-[#0b5156]' },
    { label: 'Entradas Esperadas', value: `$${totalEntradas.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, desc: 'Cobranza y ventas', color: 'text-green-600' },
    { label: 'Salidas Programadas', value: `$${totalSalidas.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, desc: 'Pagos y obligaciones', color: 'text-amber-600' },
    { label: 'Caja Proyectada', value: `$${cajaProyectada.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, desc: 'Si se cobra lo esperado', color: cajaProyectada >= 0 ? 'text-green-600' : 'text-red-600' },
    { label: 'Presión de Caja', value: projections.length === 0 ? '—' : totalSalidas > totalBancos ? 'Alta' : 'Normal', desc: 'Liquidez vs. obligaciones', color: 'text-slate-500' },
  ];

  return (
    <div className="space-y-3 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Tesorería &gt; Liquidez
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase">Flujo de Caja</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Entradas, salidas, proyección y presión financiera del negocio.</p>
          </div>
          <div className="flex gap-3">
             <button 
               onClick={() => setShowManualModal(true)}
               className="bg-slate-50 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-white transition-all flex items-center gap-2"
             >
                <Info size={14} /> Manual de Uso
             </button>
             <button 
               onClick={() => navigate('/tesoreria')}
               className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
             >
                <TrendingUp size={14} /> Posición Diaria
             </button>
          </div>
        </div>
      </header>

      {/* Immediate Liquidity Widget */}
      <article className="bg-white p-1 rounded-2xl border border-slate-200 shadow-sm overflow-hidden group">
         <div className="bg-gradient-to-br from-slate-50 to-white p-5 rounded-[22px] border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 text-green-600/5 pointer-events-none group-hover:scale-110 transition-transform duration-700">
               <ShieldCheck size={180} />
            </div>
            <div className="relative z-10 space-y-3">
               <span className="bg-green-100 text-green-700 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border border-green-200">Liquidez Inmediata Proyectada</span>
               <div className="space-y-1">
                  <h2 className="text-3xl font-black text-[#0b5156] tracking-tighter font-mono">
                    ${cajaProyectada.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </h2>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-tight">Dinero líquido real disponible tras comisiones y cambio oficial.</p>
               </div>
            </div>
            <div className="relative z-10 w-full md:w-80 bg-white/50 backdrop-blur-sm p-4 rounded-xl border border-slate-100 space-y-2 font-mono text-xs font-black uppercase">
               {bankAccounts.length > 0 ? (
                 bankAccounts.slice(0, 3).map((b, i) => (
                   <div key={i} className="flex justify-between items-center text-slate-400">
                     <span>{b.banco || b.nombre}:</span>
                     <span className="text-[#0b5156]">${Number(b.saldo ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                   </div>
                 ))
               ) : (
                 <div className="text-center text-slate-400 py-2">Sin cuentas registradas</div>
               )}
            </div>
         </div>
      </article>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 items-start">
        {metrics.map((m, i) => (
          <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between min-h-24">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-2">{m.label}</p>
            <div className="space-y-1">
              <strong className={`text-xl font-black ${m.color} tracking-tighter font-mono block leading-none`}>{m.value}</strong>
              <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight mt-1">{m.desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Projected Table */}
      <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
          <div className="space-y-1">
             <h2 className="text-lg font-black text-[#0b5156] uppercase tracking-tighter leading-none">Flujo Proyectado</h2>
             <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Entradas y salidas estimadas con proyección cambiaria.</p>
          </div>
          <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-xl border border-slate-100">
             <span className="text-[10px] font-black text-slate-400 uppercase pl-2">Simular Escenario:</span>
             <select 
               value={scenario}
               onChange={(e) => setScenario(Number(e.target.value))}
               className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156] uppercase"
             >
              <option value={1}>Tasa Actual (BCV)</option>
              <option value={1.05}>Tasa Estimada (+5%)</option>
              <option value={1.10}>Tasa Crítica (+10%)</option>
             </select>
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-2.5 px-6">FECHA</th>
                <th className="py-2.5 px-4">CONCEPTO</th>
                <th className="py-2.5 px-4 text-center">ÁREA</th>
                <th className="py-2.5 px-4 text-right">MONTO PROY.</th>
                <th className="py-2.5 px-4 text-center">ESTADO</th>
                <th className="py-2.5 px-6 text-right">ACCIÓN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400 font-bold uppercase text-xs">
                    Cargando flujo de caja...
                  </td>
                </tr>
              ) : projections.length > 0 ? (
                projections.map((row: any, i: number) => {
                  const amt = Number(row.amount || row.monto) || 0;
                  const finalAmount = row.isBs ? amt * scenario : amt;
                  const type = row.type || row.tipo;
                  const isCritical = row.isCritical;
                  const isBs = row.isBs;
                  return (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="py-2.5 px-6 text-slate-400 font-bold font-mono">{row.date || row.fecha}</td>
                      <td className="py-2.5 px-4">
                        <div className="flex flex-col">
                          <span className="font-black text-[#0b5156] uppercase tracking-tighter">{row.concept || row.concepto}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase leading-none mt-0.5">{row.sub || row.detalle}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                         <span className="text-[10px] font-black text-slate-500 uppercase border border-slate-200 px-2 py-0.5 rounded-full">{row.area}</span>
                      </td>
                      <td className={`py-2.5 px-4 text-right font-black font-mono ${type === 'Entrada' ? 'text-green-600' : isCritical || (isBs && scenario > 1) ? 'text-red-600' : 'text-[#0b5156]'}`}>
                        ${finalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        {isBs && scenario > 1 && (
                          <div className="text-[8px] font-black text-red-500 uppercase mt-0.5 flex items-center justify-end gap-1 font-sans">
                             <AlertTriangle size={8} /> Riesgo Cambiario
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={`${row.statusColor || 'bg-slate-100 text-slate-500'} px-2 py-0.5 rounded text-[10px] font-black uppercase`}>
                          {row.status || row.estado}
                        </span>
                      </td>
                       <td className="py-2.5 px-6 text-right">
                         <button 
                           onClick={() => navigate(type === 'Entrada' ? '/cobranzas/cartera' : '/pagos/programacion')}
                           className="text-[#0b5156] font-black uppercase hover:underline"
                         >
                           Gestionar <ChevronRight size={14} className="inline" />
                         </button>
                       </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400 font-bold uppercase text-xs">
                    No hay proyecciones de flujo de caja registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Bank Position */}
      <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
         <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tighter leading-none">Posición por Cuenta</h3>
         <div className="space-y-2">
            {bankAccounts.length > 0 ? (
              bankAccounts.map((c: any, i: number) => (
                <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                   <div className="space-y-1">
                      <strong className="text-xs font-black text-[#0b5156] uppercase leading-tight">{c.banco || c.nombre} · {c.tipo_cuenta || 'Cuenta'}</strong>
                      <p className="text-[10px] font-bold text-slate-500 uppercase">{c.moneda || 'VES'}</p>
                   </div>
                   <span className="text-xs font-black font-mono text-[#0b5156]">
                     ${Number(c.saldo ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                   </span>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-slate-400 font-bold uppercase text-xs">
                No hay cuentas bancarias registradas.
              </div>
            )}
         </div>
      </section>

      {/* Decision Summary */}
      <article className="bg-[#0b5156] p-5 rounded-2xl border border-[#0b5156]/10 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-white shrink-0">
            <Calculator size={32} />
          </div>
          <div className="space-y-1">
             <h3 className="text-xl font-black text-white uppercase tracking-tighter">Resumen de Decisión</h3>
             <p className="text-sm font-bold text-white/60 uppercase max-w-2xl">
               La liquidez real sugiere priorizar la recuperación de cartera antes de ejecutar el bloque de pagos programado para el cierre de mes.
             </p>
          </div>
        </div>
        <div className="flex gap-3 shrink-0">
            <button 
              onClick={() => navigate('/pagos/programacion')}
              className="force-text-koda bg-white text-[#0b5156] px-8 py-4 rounded-2xl text-xs font-black uppercase shadow-xl hover:scale-105 transition-all"
            >
               Ajustar Calendario de Pagos
            </button>
        </div>
      </article>

      {/* Manual de Uso Modal */}
      {showManualModal && createPortal(
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-2">
                    <div className="p-2 bg-[#0b5156] text-white rounded-lg"><Info size={16} /></div>
                    <h3 className="text-lg font-black text-[#0b5156] uppercase tracking-tight">Manual de Flujo de Caja</h3>
                 </div>
                 <button onClick={() => setShowManualModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
              </div>
              <div className="p-8 space-y-6 overflow-y-auto no-scrollbar text-xs font-bold text-slate-600 uppercase tracking-tight leading-relaxed">
                 <div className="space-y-2">
                   <h4 className="font-black text-[#0b5156] text-sm">1. Caja Inicial</h4>
                   <p className="normal-case font-bold text-slate-500">Es la sumatoria real disponible en todas las cuentas de banco y cajas físicas del sistema en el momento actual.</p>
                 </div>
                 <div className="space-y-2">
                   <h4 className="font-black text-[#0b5156] text-sm">2. Entradas Esperadas</h4>
                   <p className="normal-case font-bold text-slate-500">Son todos los cobros proyectados calculados a partir de las facturas de venta por cobrar (CxC) que aún se encuentran pendientes en cartera.</p>
                 </div>
                 <div className="space-y-2">
                   <h4 className="font-black text-[#0b5156] text-sm">3. Salidas Programadas</h4>
                   <p className="normal-case font-bold text-slate-500">Son todos los compromisos y pagos a proveedores (CxP) agendados que aún no han sido cobrados o pagados por tesorería.</p>
                 </div>
                 <div className="space-y-2">
                   <h4 className="font-black text-[#0b5156] text-sm">4. Simulación cambiaria</h4>
                   <p className="normal-case font-bold text-slate-500">El selector de tasa permite proyectar el impacto de la devaluación (tasa BCV vs tasas alternativas) sobre los montos en moneda local (VES), alertando sobre posibles riesgos de liquidez.</p>
                 </div>
              </div>
           </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default CashFlowTreasury;
