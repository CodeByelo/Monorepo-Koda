import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Wallet, 
  ArrowRight, 
  Calculator,
  X,
  Info
} from 'lucide-react';
import { api } from '@/api/client';

const TreasuryDashboard = () => {
  const [metrics, setMetrics] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [disponibilidad, setDisponibilidad] = useState<any>(null);
  const [proyeccion, setProyeccion] = useState<any>({ ingresos_esperados: 0, egresos_esperados: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [showManual, setShowManual] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const data = await api.get<any>('/tesoreria/dashboard');
        setMetrics(data?.metricas || []);
        setBanks(data?.bancos || []);
        setAlerts(data?.alertas || []);
        setDisponibilidad(data?.disponibilidad || null);
        setProyeccion(data?.proyeccion_7d || { ingresos_esperados: 0, egresos_esperados: 0 });
      } catch (error) {
        console.error("Error fetching treasury dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const displayMetrics = metrics;
  const displayBanks = banks;
  const displayAlerts = alerts;

  const totalProyeccion = proyeccion.ingresos_esperados + proyeccion.egresos_esperados;
  const ingresosPct = totalProyeccion > 0 ? (proyeccion.ingresos_esperados / totalProyeccion) * 100 : 100;
  const egresosPct = totalProyeccion > 0 ? (proyeccion.egresos_esperados / totalProyeccion) * 100 : 0;
  const riesgoText = egresosPct > 50 ? "Riesgo Alto" : egresosPct > 20 ? "Riesgo Moderado" : "Sin riesgo inminente";
  const supervivenciaText = egresosPct > 80 ? "Peligro de Iliquidez" : "Sobrevivencia asegurada";

  return (
    <div className="space-y-3 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Tesorería y Finanzas
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase">Posición Consolidada</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Vista global de liquidez, cuentas bancarias y obligaciones financieras.</p>
          </div>
          <div className="flex gap-3">
             <button onClick={() => setShowManual(true)} className="bg-slate-50 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-white transition-all flex items-center gap-2">
                <Info size={14} /> Manual
             </button>
             <button onClick={() => navigate('/tesoreria/conciliacion')} className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                Conciliar Bancos
             </button>
          </div>
        </div>
      </header>

      {/* Main Cash Flow Widget */}
      <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-[-20px] right-[-20px] text-slate-50 opacity-10 pointer-events-none">
          <Wallet size={240} />
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center relative z-10">
          <div className="space-y-3">
            <span className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border border-[#0b5156]/20 inline-block">
              Disponibilidad Inmediata (Cash Flow Real)
            </span>
            <div className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-slate-400 font-mono">USD</span>
                <strong className="text-4xl font-black text-[#0b5156] tracking-tighter font-mono">
                  {disponibilidad?.total || '$0.00'}
                </strong>
              </div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-tight">Líquido real proyectado después de comisiones y conversión BCV.</p>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-1.5">
              <Calculator size={13} className="text-[#0b5156]" />
              <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Fórmula de Disponibilidad (Conservadora)</h4>
            </div>
            <div className="space-y-2 font-mono text-[11px]">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 uppercase font-black">Bancos (Bs) / Tasa BCV:</span>
                <span className="font-mono text-[#0b5156] font-black">{disponibilidad?.bancos_bs || '$0.00'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 uppercase font-black">Zelle + Efectivo:</span>
                <span className="font-mono text-[#0b5156] font-black">{disponibilidad?.efectivo_zelle || '$0.00'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 uppercase font-black">Custodia (Neto 99%):</span>
                <span className="font-mono text-[#0b5156] font-black">{disponibilidad?.custodia || '$0.00'}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span className="uppercase font-black">(-) Cheques Post-datados:</span>
                <span className="font-black">{disponibilidad?.cheques_restar || '$0.00'}</span>
              </div>
              <div className="flex justify-between text-amber-600">
                <span className="uppercase font-black">(-) Efectivo Cuarentena:</span>
                <span className="font-black">{disponibilidad?.cuarentena_restar || '$0.00'}</span>
              </div>
            </div>
          </div>
        </div>
      </article>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
        {displayMetrics.map((m, i) => (
          <div key={i} className={`bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24 ${m.border || 'border-l-4 border-[#0b5156]'}`}>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">{m.label || m.etiqueta}</p>
            <div className="space-y-1">
              <strong className={`text-xl font-black ${m.color || 'text-slate-800'} tracking-tighter font-mono block leading-none`}>{m.value || m.valor}</strong>
              <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">{m.desc || m.descripcion}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        {/* Bank Accounts */}
        <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="flex justify-between items-center">
            <div className="space-y-1">
              <h2 className="text-lg font-black text-[#0b5156] uppercase tracking-tighter leading-none">Saldos Bancarios</h2>
              <p className="text-xs font-bold text-slate-500 uppercase leading-none">Disponibilidad en cuentas de la empresa.</p>
            </div>
            <button onClick={() => navigate('/tesoreria/bancos')} className="text-[10px] font-black text-[#0b5156] bg-[#0b5156]/5 px-4 py-2 rounded-xl border border-[#0b5156]/10 hover:bg-[#0b5156] hover:text-white transition-all uppercase leading-none">Gestionar</button>
          </div>

          <div className="space-y-2 flex-1 flex flex-col justify-center">
            {isLoading ? (
              <div className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cargando cuentas...</div>
            ) : displayBanks.map((bank, i) => {
              const isAlert = bank.alert || bank.alerta;
              return (
                <div key={i} className="group p-2.5 rounded-xl border border-slate-100 flex items-center gap-3 transition-all hover:bg-slate-50 cursor-pointer">
                  <div className={`w-8 h-8 ${bank.color || 'bg-[#0b5156]'} text-white rounded-lg flex items-center justify-center font-black text-sm shadow-sm group-hover:scale-105 transition-transform`}>
                    {bank.icon || bank.icono || bank.name?.charAt(0) || bank.nombre?.charAt(0) || 'B'}
                  </div>
                  <div className="flex-1">
                    <strong className="text-xs font-black text-[#0b5156] uppercase block leading-tight">{bank.name || bank.nombre}</strong>
                    <span className="text-[9px] font-bold text-slate-400 uppercase leading-none">{bank.balance || bank.saldo}</span>
                  </div>
                  <div className="text-right">
                    <strong className={`text-sm font-black font-mono block leading-tight ${isAlert ? 'text-amber-600' : 'text-[#0b5156]'}`}>{bank.net || bank.neto}</strong>
                    {isAlert ? (
                      <button onClick={() => navigate('/tesoreria/conciliacion')} className="text-[9px] font-black text-amber-600 uppercase underline decoration-2 underline-offset-2 leading-none cursor-pointer hover:text-amber-700">Arqueo Requerido</button>
                    ) : (
                      <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest leading-none">{bank.meta || bank.metadata}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        {/* Financial Alerts */}
        <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-5 flex flex-col justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-black text-[#0b5156] uppercase tracking-tighter leading-none">Alertas Financieras</h2>
            <p className="text-xs font-bold text-slate-500 uppercase leading-none">Compromisos a muy corto plazo.</p>
          </div>

          <div className="space-y-2 flex-1 flex flex-col justify-center">
            {displayAlerts.map((alert, i) => (
              <div key={i} onClick={() => {
                if (alert.tipo === 'FISCAL') navigate('/fiscal');
                else if (alert.tipo === 'ALERTA') navigate('/pagos/cuentas-por-pagar');
              }} className={`p-3 rounded-xl border-l-4 ${alert.bg || 'bg-slate-50'} border-slate-200 ${alert.color || 'text-slate-600'} space-y-1 group hover:scale-[1.01] transition-all cursor-pointer`}>
                <div className="flex justify-between items-center">
                  <span className="text-[8px] font-black px-2 py-0.5 rounded-full border border-current/20 uppercase tracking-widest">{alert.type || alert.tipo}</span>
                  <ArrowRight size={12} className="opacity-40 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-xs font-black uppercase leading-tight">{alert.title || alert.titulo}</h4>
                  <p className="text-[10px] font-bold uppercase opacity-80">{alert.desc || alert.descripcion}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2.5 pt-2.5 border-t border-slate-100">
            <div className="flex justify-between items-end">
              <span className="text-[10px] font-black text-[#0b5156] uppercase tracking-tight">Proyección de Liquidez (Semanal)</span>
              <span className={`text-[9px] font-black uppercase ${egresosPct > 50 ? 'text-red-500' : 'text-slate-500'}`}>{riesgoText}</span>
            </div>
            <div className="h-3 bg-white rounded-full flex overflow-hidden border border-slate-200 shadow-inner">
              <div className="bg-[#0b5156] transition-all duration-1000 shadow-inner" style={{ width: `${ingresosPct}%` }} title={`Ingresos proyectados: $${proyeccion.ingresos_esperados}`}></div>
              <div className="bg-red-500 transition-all duration-1000 shadow-inner" style={{ width: `${egresosPct}%` }} title={`Salidas proyectadas: $${proyeccion.egresos_esperados}`}></div>
            </div>
            <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
               <span className={egresosPct > 80 ? 'text-red-500' : 'text-slate-500'}>{supervivenciaText}</span>
               <span className="text-red-500">Salidas previstas</span>
            </div>
          </div>
        </article>
      </div>

      {/* Manual Modal */}
      {showManual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50">
              <div className="space-y-1">
                <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Manual Técnico y Funcional</h2>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Módulo: Posición Consolidada de Tesorería</p>
              </div>
              <button onClick={() => setShowManual(false)} className="p-2 bg-white text-slate-400 rounded-full hover:bg-slate-200 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6 text-sm text-slate-600">
              <section className="space-y-3">
                <h3 className="text-sm font-black text-[#0b5156] uppercase border-l-4 border-[#0b5156] pl-3">¿Qué hace este módulo?</h3>
                <p>Este módulo representa la <strong>Posición Consolidada de Tesorería</strong>. Actúa como el centro de mando financiero del sistema Koda. Se encarga de recolectar, calcular y presentar en tiempo real el efectivo real disponible en las cuentas bancarias, contrastándolo contra las obligaciones inmediatas (cuentas por pagar) y los fondos que están reservados para fines fiscales (retenciones de IVA e ISLR).</p>
              </section>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <section className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <h3 className="text-sm font-black text-[#0b5156] uppercase">Métricas Principales</h3>
                  <ul className="space-y-3">
                    <li><strong className="text-slate-800">Caja Actual:</strong> Sumatoria del saldo contable de todas las cuentas bancarias activas (convertido a USD según la tasa del día).</li>
                    <li><strong className="text-slate-800">Cuentas por Cobrar:</strong> Total de facturas de venta emitidas a clientes que aún no han sido pagadas.</li>
                    <li><strong className="text-slate-800">Obligaciones (CxP):</strong> Deuda total registrada con proveedores por facturas de compras no pagadas.</li>
                    <li><strong className="text-slate-800">Reserva Fiscal:</strong> Fondos retenidos por concepto de IVA e ISLR a proveedores, que pertenecen al SENIAT y no deben tocarse para pagos operativos.</li>
                  </ul>
                </section>

                <section className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <h3 className="text-sm font-black text-[#0b5156] uppercase">Indicadores Visuales</h3>
                  <ul className="space-y-3">
                    <li><strong className="text-slate-800">Liquidez Neta Real:</strong> El cálculo de [Caja Actual - (Obligaciones + Reserva Fiscal)]. Muestra tu verdadero poder de pago.</li>
                    <li><strong className="text-slate-800">Alertas Financieras:</strong> Notificaciones automáticas (ej. "Atención requerida" en Cuentas por Pagar) si tienes obligaciones vencidas o compromisos fiscales próximos.</li>
                    <li><strong className="text-slate-800">Proyección de Liquidez:</strong> Barra de estado de flujo de caja que compara los fondos asegurados contra las salidas proyectadas a 7 días.</li>
                  </ul>
                </section>
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setShowManual(false)} className="bg-[#0b5156] text-white px-6 py-2 rounded-xl text-xs font-black uppercase shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TreasuryDashboard;
