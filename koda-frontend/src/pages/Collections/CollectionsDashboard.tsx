import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  TrendingDown, 
  ShieldAlert, 
  ArrowRight, 
  History, 
  PieChart, 
  BarChart3, 
  Activity, 
  PhoneCall,
  Wallet,
  TrendingUp,
  BookOpen,
  X,
  Mail,
  MapPin,
  ChevronRight,
  Home,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';

const CollectionsDashboard = () => {
  const [kpis, setKpis] = useState<any[]>([]);
  const [criticalClients, setCriticalClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showManual, setShowManual] = useState(false);
  const [recaudacion, setRecaudacion] = useState<any>({
    liquid: 0.0,
    liquid_pct: 0.0,
    retenciones: 0.0,
    retenciones_pct: 0.0,
    ajustes: 0.0,
    ajustes_pct: 0.0,
    total: 0.0
  });
  const [erosion, setErosion] = useState<any>({
    protegida: 100.0,
    expuesta: 0.0,
    riesgo_detectado: false
  });
  const [showPredictive, setShowPredictive] = useState(false);
  const [showErosionAccordion, setShowErosionAccordion] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [kpisRes, critRes, recRes, eroRes] = await Promise.all([
          api.get<any[]>('/cobranzas/kpis'),
          api.get<any[]>('/cobranzas/criticas'),
          api.get<any>('/cobranzas/recaudacion').catch(() => ({
            liquid: 0.0,
            liquid_pct: 0.0,
            retenciones: 0.0,
            retenciones_pct: 0.0,
            ajustes: 0.0,
            ajustes_pct: 0.0,
            total: 0.0
          })),
          api.get<any>('/cobranzas/erosion').catch(() => ({
            protegida: 100.0,
            expuesta: 0.0,
            riesgo_detectado: false
          }))
        ]);
        setKpis((kpisRes || []).map((k) => ({
          t: k.label,
          v: k.value,
          desc: k.desc,
          c: k.color || 'text-[#0b5156]',
        })));
        setCriticalClients((critRes || []).map((c) => ({
          name: c.cliente,
          doc: c.doc,
          amount: `$${Number(c.monto || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
          days: 'Vencido',
          status: 'CRÍTICO',
          telefono: c.telefono || 'No registrado',
          email: c.email || 'No registrado',
          direccion: c.direccion || 'No registrada'
        })));
        if (recRes) setRecaudacion(recRes);
        if (eroRes) setErosion(eroRes);
      } catch (error) {
        console.error('Error cargando cobranzas:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-20 text-slate-800">
      {/* Header Blanco y Verde */}
      <header className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <h1 className="text-3xl font-black tracking-tighter uppercase">Gestión de Cobranzas</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight max-w-3xl leading-relaxed">
              Seguimiento de liquidez entrante, control de mora y exposición cambiaria de la cartera.
            </p>
          </div>
          <div className="flex gap-2">
              <button onClick={() => setShowManual(true)} className="bg-white text-slate-600 px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2 border border-slate-200 hover:bg-slate-200 transition-all">
                 <BookOpen size={14} /> Manual
              </button>
              <Link to="/cobranzas/estado-cuenta" className="bg-slate-50 text-slate-600 px-4 py-2 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-white transition-all flex items-center gap-2">
                 Estado de Cuenta
              </Link>
              <Link to="/cobranzas/aplicar" className="bg-[#0b5156] text-white px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                 <Wallet size={16} /> Registrar Pago
              </Link>
          </div>
        </div>
      </header>

      {/* Grid de KPIs */}
      {isLoading && (
        <div className="text-center py-8 text-slate-400 text-xs font-bold uppercase animate-pulse">Cargando datos de cobranza...</div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {(kpis.length > 0 ? kpis : [{ t: 'TOTAL POR COBRAR', v: '$0', desc: 'Sin datos', c: 'text-slate-400' }]).map((kpi, i) => (
          <Link 
            key={i} 
            to={
              kpi.t.toUpperCase().includes('TOTAL POR COBRAR') ? '/cobranzas/cartera' :
              kpi.t.toUpperCase().includes('VENCIDO') ? '/cobranzas/antiguedad' :
              kpi.t.toUpperCase().includes('POR VENCER') ? '/cobranzas/flujo' :
              kpi.t.toUpperCase().includes('CLIENTES EN MORA') ? '/cobranzas/cartera' :
              '/cobranzas'
            }
            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-36 group hover:border-[#0b5156]/30 hover:shadow-md transition-all block cursor-pointer"
          >
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest group-hover:text-[#0b5156] transition-colors">{kpi.t}</p>
            <div className="space-y-1">
              <strong className={`text-3xl font-black ${kpi.c} tracking-tighter font-mono`}>{kpi.v}</strong>
              <p className="text-sm font-bold text-slate-400 uppercase leading-tight">{kpi.desc}</p>
            </div>
          </Link>
        ))}
      </section>

      {/* Bloques Colapsables debajo de las Cards */}
      <div className="space-y-4">
        {/* Acordeón: Erosión de Cartera */}
        <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all">
          <button 
            onClick={() => setShowErosionAccordion(!showErosionAccordion)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-[#0b5156]" />
              <h4 className="text-sm font-black uppercase tracking-tight text-slate-800">Erosión de Cartera</h4>
              {erosion.riesgo_detectado && (
                <span className="ml-2 text-[9px] font-black bg-red-50 text-red-600 px-2 py-0.5 rounded-full border border-red-100 uppercase animate-pulse">Riesgo</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase">
                {showErosionAccordion ? 'Ocultar' : 'Ver detalle'}
              </span>
              {showErosionAccordion ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
            </div>
          </button>

          {showErosionAccordion && (
            <div className="px-6 pb-6 pt-2 border-t border-slate-100 space-y-4 animate-in slide-in-from-top-2 duration-200">
               <p className="text-xs font-bold text-slate-400 leading-relaxed uppercase">
                  Pérdida de valor real por devaluación de la cartera en Bolívares.
               </p>
               
               {/* BANNER EXPLICATIVO INLINE */}
               <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[10px] font-bold text-slate-500 uppercase leading-normal">
                  💡 <strong>¿Qué es esto?</strong> Compara tus saldos facturados en Dólares (USD/Efectivo) protegidos contra inflación, frente a los saldos en Bolívares (VES/Transferencia) expuestos a la devaluación antes de ser cobrados.
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex justify-between text-xs font-black text-slate-800 uppercase mb-2">
                       <span>Protegida (USD/Efectivo)</span>
                       <span className="text-[#0b5156]">{erosion.protegida}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                       <div className="h-full bg-[#0b5156]" style={{ width: `${erosion.protegida}%` }}></div>
                    </div>
                    <div className="mt-2 text-xs font-black text-[#0b5156] font-mono">
                       ${Number(erosion.protegido_usd || 0).toLocaleString('en-US', {minimumFractionDigits: 2})} USD
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex justify-between text-xs font-black text-slate-800 uppercase mb-2">
                       <span>Expuesta (VES/Transferencia)</span>
                       <span className="text-red-500">{erosion.expuesta}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                       <div className="h-full bg-red-500" style={{ width: `${erosion.expuesta}%` }}></div>
                    </div>
                    <div className="mt-2 text-xs font-black text-red-500 font-mono">
                       ${Number(erosion.expuesto_usd || 0).toLocaleString('en-US', {minimumFractionDigits: 2})} USD
                    </div>
                  </div>
               </div>
               {erosion.riesgo_detectado && (
                 <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                    <p className="text-xs font-black text-red-600 uppercase leading-relaxed">
                       ⚠️ Exposición de riesgo detectada. Se recomienda cobro prioritario de saldos en Bs.
                    </p>
                 </div>
               )}
               <div className="flex justify-end pt-2">
                 <Link to="/cobranzas/cartera" className="bg-[#0b5156] text-white font-black px-6 py-3 rounded-xl uppercase text-xs tracking-widest shadow-lg shadow-green-900/10 flex items-center justify-center gap-2 hover:bg-[#083a3d] transition-all">
                    Protocolo de Cobro <ArrowRight size={14} />
                 </Link>
               </div>
            </div>
          )}
        </article>

        {/* Acordeón: Análisis Predictivo */}
        <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all">
          <button 
            onClick={() => setShowPredictive(!showPredictive)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <TrendingUp size={18} className="text-[#0b5156]" />
              <h4 className="text-sm font-black uppercase tracking-tight text-slate-800">Análisis Predictivo</h4>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase">
                {showPredictive ? 'Ocultar' : 'Ver herramientas'}
              </span>
              {showPredictive ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
            </div>
          </button>

          {showPredictive && (
            <div className="px-6 pb-6 pt-2 border-t border-slate-100 space-y-4 animate-in slide-in-from-top-2 duration-200">
              <p className="text-xs font-bold text-slate-400 leading-relaxed uppercase">
                 Herramientas inteligentes de previsión de cobranza e indicadores de mora.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                 {[
                   { label: 'Proyección de Flujo', icon: <TrendingUp size={16} />, d: 'Entradas estimadas', link: '/cobranzas/flujo' },
                   { label: 'Antigüedad de Saldos', icon: <History size={16} />, d: 'Deterioro de cartera', link: '/cobranzas/antiguedad' },
                   { label: 'Aplicación masiva', icon: <BarChart3 size={16} />, d: 'Conciliación', link: '/cobranzas/aplicar' }
                 ].map((item, i) => (
                   <Link to={item.link} key={i} className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:border-[#0b5156]/20 transition-all text-left group">
                      <div className="p-2 bg-white rounded-xl shadow-sm text-[#0b5156] group-hover:scale-110 transition-transform">{item.icon}</div>
                      <div className="space-y-0.5">
                         <p className="text-xs font-black text-slate-800 uppercase">{item.label}</p>
                         <p className="text-xs font-bold text-slate-500 uppercase">{item.d}</p>
                      </div>
                   </Link>
                 ))}
              </div>
            </div>
          )}
        </article>
      </div>

      {/* Clientes en Mora Crítica al 100% de ancho */}
      <article className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex justify-between items-center">
           <div className="space-y-1">
              <h2 className="text-xl font-black text-slate-800 tracking-tighter uppercase flex items-center gap-2">
                 <ShieldAlert size={20} className="text-red-600" /> Clientes en Mora Crítica
              </h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-tight">Facturas vencidas que superan los límites de tiempo.</p>
           </div>
           <button className="p-2 bg-slate-50 text-slate-400 rounded-lg">
              <Activity size={18} />
           </button>
        </div>
        <div className="overflow-x-auto no-scrollbar">
           <table className="w-full text-left">
              <thead>
                 <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                    <th className="py-4 px-6">CLIENTE</th>
                    <th className="py-4 px-4 text-center">DOCUMENTO</th>
                    <th className="py-4 px-4 text-center">MONTO VENCIDO</th>
                    <th className="py-4 px-4 text-center">DÍAS MORA</th>
                    <th className="py-4 px-6 text-right">ACCIÓN</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                 {(criticalClients.length > 0 ? criticalClients : []).map((client, i) => (
                   <tr key={i} className="group hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-6">
                         <span className="text-xs font-black text-slate-800 uppercase">{client.name}</span>
                      </td>
                      <td className="py-4 px-4 text-center text-xs font-bold text-slate-500 font-mono">{client.doc}</td>
                      <td className="py-4 px-4 text-center text-xs font-black text-red-600 font-mono">{client.amount}</td>
                      <td className="py-4 px-4 text-center">
                         <span className="bg-red-50 text-red-600 text-xs font-black px-2 py-0.5 rounded font-mono">{client.days}</span>
                      </td>
                      <td className="py-4 px-6 text-right">
                         <button onClick={() => setSelectedClient(client)} className="bg-[#3c3023] text-white px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-[#0b5156] transition-all flex items-center gap-2 ml-auto shadow-sm">
                            <PhoneCall size={12} /> Llamar
                         </button>
                      </td>
                   </tr>
                 ))}
              </tbody>
           </table>
        </div>
      </article>

      {/* Composición de Recaudación al 100% de ancho */}
      <article className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <h3 className="text-xl font-black text-slate-800 tracking-tighter uppercase flex items-center gap-2">
          <PieChart size={20} className="text-[#0b5156]" /> Composición de Recaudación
        </h3>
        <div className="space-y-6">
           {[
             { label: 'Dinero Líquido (Bancos/Caja)', val: `$${recaudacion.liquid.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, p: `${recaudacion.liquid_pct}%`, color: 'bg-[#0b5156]', desc: 'Efectivo, Zelle, Transferencias.' },
             { label: 'Retenciones Recibidas (IVA/ISLR)', val: `$${recaudacion.retenciones.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, p: `${recaudacion.retenciones_pct}%`, color: 'bg-blue-500', desc: 'Certificados recibidos de Agentes.' },
             { label: 'Ajustes y Notas de Crédito', val: `$${recaudacion.ajustes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, p: `${recaudacion.ajustes_pct}%`, color: 'bg-amber-500', desc: 'Descuentos y devoluciones.' }
           ].map((item, i) => (
             <div key={i}>
                <div className="flex justify-between items-end mb-2">
                   <div className="space-y-0.5">
                      <span className="text-sm font-black text-slate-800 uppercase tracking-tight">{item.label}</span>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-tighter">{item.desc}</p>
                   </div>
                   <strong className="text-base font-black text-slate-800 font-mono">{item.val} ({item.p})</strong>
                </div>
                <div className="h-2 bg-white rounded-full overflow-hidden">
                   <div className={`h-full ${item.color} rounded-full`} style={{ width: item.p }}></div>
                </div>
             </div>
           ))}
           <div className="mt-4 p-5 bg-[#0b5156]/5 rounded-2xl border border-[#0b5156]/10 flex justify-between items-center">
              <span className="text-xs font-black text-[#0b5156] uppercase tracking-widest">Recaudación Total Bruta:</span>
              <strong className="text-2xl font-black text-[#0b5156] font-mono tracking-tighter">${recaudacion.total.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
           </div>
         </div>
      </article>

      {/* Modal de Contacto del Cliente */}
      {selectedClient && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="bg-[#0b5156] p-5 sm:p-6 text-white relative shrink-0">
              <button 
                onClick={() => setSelectedClient(null)}
                className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-white/20 p-2 rounded-xl">
                  <ShieldAlert size={24} className="text-white" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tighter">Detalle de Cliente</h3>
              </div>
              <p className="text-white/80 text-xs font-bold uppercase tracking-widest leading-tight">
                Información de contacto para gestión de cobranza
              </p>
            </div>
            
            <div className="p-5 sm:p-6 space-y-5 sm:space-y-6 overflow-y-auto">
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Razón Social</p>
                <p className="text-base sm:text-lg font-black text-slate-800 uppercase leading-tight">{selectedClient.name}</p>
                <p className="text-xs font-bold text-slate-500 font-mono">{selectedClient.doc}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="p-3 sm:p-4 bg-red-50 rounded-2xl border border-red-100">
                  <p className="text-[10px] sm:text-xs font-bold text-red-400 uppercase tracking-widest mb-1">Monto Vencido</p>
                  <p className="text-lg sm:text-xl font-black text-red-600 font-mono tracking-tighter">{selectedClient.amount}</p>
                </div>
                <div className="p-3 sm:p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Estatus</p>
                  <p className="text-base sm:text-lg font-black text-slate-800 uppercase tracking-tighter">{selectedClient.days}</p>
                </div>
              </div>

              <div className="space-y-3 sm:space-y-4 py-3 sm:py-4 border-t border-slate-100">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-slate-50 text-slate-400 rounded-lg shrink-0">
                    <PhoneCall size={16} />
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-0.5">Teléfono</p>
                    <p className="text-xs sm:text-sm font-black text-slate-800">{selectedClient.telefono}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-slate-50 text-slate-400 rounded-lg shrink-0">
                    <Mail size={16} />
                  </div>
                  <div className="break-all">
                    <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-0.5">Correo Electrónico</p>
                    <p className="text-xs sm:text-sm font-black text-slate-800">{selectedClient.email}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-slate-50 text-slate-400 rounded-lg shrink-0">
                    <MapPin size={16} />
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest mb-0.5">Dirección</p>
                    <p className="text-xs sm:text-sm font-bold text-slate-700 leading-tight uppercase">{selectedClient.direccion}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-1 sm:pt-2">
                <button 
                  onClick={() => setSelectedClient(null)}
                  className="w-full px-4 py-3 bg-[#0b5156] text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal del Manual de Cobranzas */}
      {showManual && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="bg-[#0b5156] p-5 sm:p-6 text-white relative shrink-0">
              <button 
                onClick={() => setShowManual(false)}
                className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-white/20 p-2 rounded-xl">
                  <BookOpen size={24} className="text-white" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tighter">Manual de Cobranzas</h3>
              </div>
              <p className="text-white/80 text-xs font-bold uppercase tracking-widest leading-tight">
                Políticas, Procedimientos y Protocolos de Cobro
              </p>
            </div>
            
            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto text-slate-600 leading-relaxed">
              <div className="space-y-1 border-b border-slate-100 pb-3">
                <h4 className="text-xs font-black text-slate-800 uppercase">1. Dashboard Principal y KPIs</h4>
                <p className="text-[11px] font-bold uppercase text-slate-500">
                  Las tarjetas superiores muestran indicadores consolidados en tiempo real. Al hacer clic en ellas, navegarás directamente al detalle de la información (Ej: clic en "Total por Cobrar" te lleva a la Cartera).
                </p>
              </div>
              <div className="space-y-1 border-b border-slate-100 pb-3">
                <h4 className="text-xs font-black text-slate-800 uppercase">2. Ficha de Movimientos (Estado de Cuenta)</h4>
                <p className="text-[11px] font-bold uppercase text-slate-500">
                  Permite auditar el histórico de cargos y abonos por cliente. Al presionar sobre el número de una factura, se desplegará el modal interactivo con el cálculo de IVA, IGTF e ítems correspondientes.
                </p>
              </div>
              <div className="space-y-1 border-b border-slate-100 pb-3">
                <h4 className="text-xs font-black text-slate-800 uppercase">3. Monitoreo de Erosión y Devaluación</h4>
                <p className="text-[11px] font-bold uppercase text-slate-500">
                  Calcula el saldo protegido indexado en dólares versus el saldo en Bolívares expuesto al cambio. Te advierte cuando el riesgo cambiario supere límites de seguridad.
                </p>
              </div>
              <div className="space-y-1 border-b border-slate-100 pb-3">
                <h4 className="text-xs font-black text-slate-800 uppercase">4. Antigüedad y Flujo de Caja</h4>
                <p className="text-[11px] font-bold uppercase text-slate-500">
                  Audite detalladamente la antigüedad de los saldos pendientes en rangos de 15 a +90 días. Además, evalúe el flujo de caja proyectado para estimar ingresos futuros de forma precisa.
                </p>
              </div>
              <div className="space-y-1 border-b border-slate-100 pb-3">
                <h4 className="text-xs font-black text-slate-800 uppercase">5. Anticipos y Saldos a Favor</h4>
                <p className="text-[11px] font-bold uppercase text-slate-500">
                  Administre abonos de clientes sin factura asociada y mantenga el valor protegido frente a fluctuaciones cambiarias mediante el cálculo dinámico de la tasa BCV.
                </p>
              </div>
              <div className="space-y-1 pb-3">
                <h4 className="text-xs font-black text-slate-800 uppercase">6. Conciliación y Aplicación de Pagos</h4>
                <p className="text-[11px] font-bold uppercase text-slate-500">
                  Procese la recepción de pagos de manera multimoneda y asigne montos a facturas específicas con cálculo automático de diferencias o excedentes.
                </p>
              </div>
              <button 
                onClick={() => setShowManual(false)}
                className="w-full px-4 py-3 mt-4 bg-[#0b5156] text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
              >
                Cerrar Guía
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default CollectionsDashboard;
