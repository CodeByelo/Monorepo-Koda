import { useState, useEffect } from 'react';
import { 
  Plus, 
  ShieldCheck, 
  ArrowRight, 
  Activity, 
  BookOpen, 
  TrendingUp, 
  AlertCircle,
  Wallet,
  CheckCircle2
} from 'lucide-react';
import { api } from '@/api/client';
import { createPortal } from 'react-dom';

const CustomerAdvances = () => {
  const [protectedValue, setProtectedValue] = useState(true);
  const [bcvRate, setBcvRate] = useState(38.50);
  const [clientes, setClientes] = useState<any[]>([]);
  const [protectedBalances, setProtectedBalances] = useState<any[]>([]);
  
  // Form state
  const [selectedCliente, setSelectedCliente] = useState("");
  const [montoBs, setMontoBs] = useState("");
  
  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleShowToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const data = await api.get<any>('/cobranzas/anticipos-data');
      setBcvRate(data?.bcv || 38.50);
      setClientes(data?.clientes || []);
      setProtectedBalances(data?.balances || []);
    } catch (error) {
      console.error("Error fetching anticipos data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRegistrar = async () => {
    if (!selectedCliente || !montoBs || parseFloat(montoBs) <= 0) {
      handleShowToast("Debe seleccionar un cliente y un monto válido.");
      return;
    }
    
    setIsSubmitting(true);
    try {
      await api.post('/cobranzas/anticipos', {
        cliente_id: parseInt(selectedCliente),
        monto_bs: parseFloat(montoBs),
        tasa_bcv: bcvRate
      });
      handleShowToast("Anticipo registrado exitosamente.");
      setMontoBs("");
      setSelectedCliente("");
      await fetchData(); // reload list
    } catch (error) {
      handleShowToast("Error al registrar anticipo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const equivalenteUsd = (parseFloat(montoBs) || 0) / bcvRate;

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-20">
      {/* Header Blanco y Verde */}
      <header className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1 text-slate-800">
            <div className="flex items-center gap-2 mb-2">
               <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                 Anticipos y Créditos
               </span>
            </div>
            <h1 className="text-4xl font-black tracking-tighter uppercase">Saldos a Favor</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Administre abonos de clientes con protección de valor y recálculo automático.</p>
          </div>
          <button onClick={() => setShowManual(true)} className="bg-slate-50 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 border border-slate-200 hover:bg-white transition-all">
             <BookOpen size={14} /> Manual de Anticipos
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Nuevo Anticipo Form */}
        <article className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="space-y-1">
               <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
                  <Plus className="text-[#0b5156]" size={20} /> Nuevo Anticipo
               </h3>
               <p className="text-xs font-bold text-slate-500 uppercase tracking-widest leading-relaxed">Recepción de fondos sin factura asociada.</p>
            </div>

           <div className="space-y-6">
               <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest pl-2">Cliente</label>
                  <select 
                    value={selectedCliente} 
                    onChange={(e) => setSelectedCliente(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-black text-slate-800 outline-none focus:border-[#0b5156] transition-all"
                  >
                     <option value="">Seleccione un cliente...</option>
                     {clientes.map(c => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                     ))}
                  </select>
               </div>
 
               <div className="grid grid-cols-2 gap-4 items-start">
                  <div className="space-y-2">
                     <label className="text-xs font-black text-slate-500 uppercase tracking-widest pl-2">Monto en Bolívares (Bs.)</label>
                     <input 
                        type="number" 
                        placeholder="5000.00" 
                        value={montoBs}
                        onChange={(e) => setMontoBs(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-black text-slate-800 outline-none focus:border-[#0b5156]" 
                     />
                  </div>
                  <div className="space-y-2">
                     <label className="text-xs font-black text-slate-500 uppercase tracking-widest pl-2">Tasa BCV Hoy</label>
                     <input type="text" readOnly value={bcvRate.toFixed(2)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-black text-slate-500 outline-none" />
                  </div>
               </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                     <ShieldCheck className="text-[#0b5156]" size={24} />
                     <div className="space-y-0.5">
                        <h4 className="text-xs font-black text-slate-800 uppercase">Protección de Valor</h4>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-tight">Congela el valor del anticipo en dólares.</p>
                     </div>
                  </div>
                 <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={protectedValue} onChange={() => setProtectedValue(!protectedValue)} className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0b5156]"></div>
                 </label>
              </div>

              <div className="flex justify-between items-end pt-4 px-2">
                 <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Equivalente proyectado:</span>
                 <strong className="text-3xl font-black text-[#0b5156] font-mono tracking-tighter">${equivalenteUsd.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})} USD</strong>
              </div>

              <button 
                 onClick={handleRegistrar}
                 disabled={isSubmitting}
                 className="w-full bg-[#0b5156] text-white font-black py-3 rounded-xl uppercase text-xs tracking-[0.15em] shadow-2xl shadow-green-900/20 hover:bg-[#083a3d] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                 {isSubmitting ? "Procesando..." : "Registrar Anticipo Protegido"}
              </button>

              {/* Notas Informativas de Caja Integradas */}
              <div className="border-t border-slate-100 pt-4 mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                 {[
                   { t: 'Anticipos no son ingresos aún.', d: 'Son pasivos hasta que se emita la factura.', i: <Wallet size={14} className="text-blue-500" /> },
                   { t: 'Protección cambiaria obligatoria.', d: 'Evita que el saldo pierda valor real.', i: <ShieldCheck size={14} className="text-[#0b5156]" /> },
                 ].map((bullet, i) => (
                    <div key={i} className="flex gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100/50">
                       <div className="mt-0.5">{bullet.i}</div>
                       <div className="space-y-0.5">
                          <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-tight leading-none">{bullet.t}</h4>
                          <p className="text-[9px] font-bold text-slate-400 uppercase leading-tight mt-1">{bullet.d}</p>
                       </div>
                    </div>
                 ))}
              </div>
           </div>
        </article>

        <div className="space-y-6 flex flex-col">
           {/* Saldos Protegidos */}
           <article className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                 <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Saldos Protegidos</h3>
                 <Activity className="text-[#0b5156]" size={20} />
              </div>

              <div className="space-y-4">
                 {protectedBalances.length === 0 ? (
                    <div className="text-center py-10 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                       No hay saldos protegidos.
                    </div>
                 ) : (
                   protectedBalances.map((item, i) => (
                     <div key={i} className="p-4 rounded-xl border border-slate-100 bg-slate-50/30 space-y-4 group hover:border-[#0b5156]/20 transition-all">
                        <div className="flex justify-between items-start">
                           <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">{item.client}</h4>
                           <span className="bg-[#0b5156] text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">PROTEGIDO</span>
                        </div>
                         <div className="flex justify-between items-end">
                            <div className="space-y-1">
                               <p className="text-xs font-black text-slate-500 uppercase">Base USD</p>
                               <strong className="text-lg font-black text-slate-800 font-mono tracking-tight">{item.base}</strong>
                            </div>
                            <div className="space-y-1 text-right">
                               <p className="text-xs font-black text-[#0b5156] uppercase">Valor Hoy (Bs.)</p>
                               <strong className="text-lg font-black text-[#0b5156] font-mono tracking-tight">{item.currentBs}</strong>
                            </div>
                         </div>
                        <button onClick={() => handleShowToast("Aplicar a factura estará disponible en la próxima actualización.")} className="w-full py-2 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-600 uppercase flex items-center justify-center gap-2 hover:bg-slate-50 transition-all shadow-sm">
                           Aplicar a Factura <ArrowRight size={14} />
                        </button>
                     </div>
                   ))
                 )}
              </div>

               <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 flex items-center gap-3">
                  <AlertCircle size={16} className="text-amber-600" />
                  <p className="text-xs font-black text-amber-700 uppercase leading-tight tracking-tight">
                     El recálculo se ejecuta basándose en la fluctuación de la tasa diaria.
                  </p>
               </div>
            </article>
         </div>
      </div>

      {/* Modal del Manual */}
      {showManual && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="bg-[#0b5156] p-5 sm:p-6 text-white relative shrink-0">
              <button 
                onClick={() => setShowManual(false)}
                className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
              >
                <span className="text-xl leading-none">&times;</span>
              </button>
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-white/20 p-2 rounded-xl">
                  <BookOpen size={24} className="text-white" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tighter">Manual Anticipos</h3>
              </div>
              <p className="text-white/80 text-xs font-bold uppercase tracking-widest leading-tight">
                Protección de capital recibido por adelantado
              </p>
            </div>
            
            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto text-slate-600 leading-relaxed">
              <div className="space-y-1 border-b border-slate-100 pb-3">
                <h4 className="text-xs font-black text-slate-800 uppercase">1. Protección de Valor</h4>
                <p className="text-[11px] font-bold uppercase text-slate-500">
                  Todo anticipo en Bs. se convierte a su equivalente en USD a la tasa del día de la recepción. Esto garantiza que el cliente no pierda poder adquisitivo en caso de devaluación antes de que se le emita la factura.
                </p>
              </div>
              <div className="space-y-1 border-b border-slate-100 pb-3">
                <h4 className="text-xs font-black text-slate-800 uppercase">2. Recálculo Dinámico</h4>
                <p className="text-[11px] font-bold uppercase text-slate-500">
                  La sección de "Saldos Protegidos" recalcula automáticamente cuántos Bolívares representan hoy los USD que el cliente adelantó.
                </p>
              </div>
              <div className="space-y-1 pb-3">
                <h4 className="text-xs font-black text-slate-800 uppercase">3. Aplicación</h4>
                <p className="text-[11px] font-bold uppercase text-slate-500">
                  Los anticipos no facturados se consideran un pasivo. Cuando se genere la factura definitiva, puede presionar "Aplicar a Factura" para cruzar el saldo.
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

      {/* Custom Toast Portal */}
      {toastMessage && createPortal(
        <div className="fixed bottom-6 right-6 z-[130] bg-[#0b5156] border-green-700 text-white py-4 px-6 rounded-2xl shadow-2xl border flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <CheckCircle2 size={18} className="text-white/80" />
          <span className="text-xs font-black uppercase tracking-widest">{toastMessage}</span>
        </div>,
        document.body
      )}
    </div>
  );
};

export default CustomerAdvances;
