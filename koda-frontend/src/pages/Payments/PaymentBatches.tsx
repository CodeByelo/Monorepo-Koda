import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  CheckCircle2, 
  ArrowLeft, 
  ArrowRight, 
  ShieldAlert, 
  HelpCircle,
  Building2,
  Calendar,
  Plus
} from 'lucide-react';
import { api } from '@/api/client';

const PaymentBatches = () => {
  const navigate = useNavigate();
  const [steps, setSteps] = useState([
    { n: 1, label: 'Selección de Órdenes', status: 'completed' },
    { n: 2, label: 'Configuración Bancaria', status: 'active' },
    { n: 3, label: 'Confirmación', status: 'pending' },
  ]);

  const [validations, setValidations] = useState<any[]>([]);
  const [loteData, setLoteData] = useState<any>(null);
  const [bancos, setBancos] = useState<any[]>([]);
  const [selectedBanco, setSelectedBanco] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Form
  const [loteRef, setLoteRef] = useState('');
  const [fecha, setFecha] = useState(() => new Date().toISOString().split('T')[0]);
  const [formato, setFormato] = useState('Archivo TXT Banesco (Pago a Proveedores)');

  // Toast feedback
  const [toast, setToast] = useState<string | null>(null);

  // Manual bill registration modal states
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [formProveedorId, setFormProveedorId] = useState('');
  const [formRef, setFormRef] = useState('');
  const [formMonto, setFormMonto] = useState('');
  const [formTasa, setFormTasa] = useState('36.52');
  const [formCredito, setFormCredito] = useState('15');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const fetchValidations = async () => {
    setIsLoading(true);
    try {
      const [data, bancosRes, provRes] = await Promise.all([
        api.get<any>('/pagos/lotes/validar'),
        api.get<any[]>('/tesoreria/bancos'),
        api.get<any[]>('/proveedores')
      ]);
      setValidations(data?.validaciones || []);
      setLoteData(data || {});
      setBancos(bancosRes || []);
      setProveedores(provRes || []);
      if (bancosRes && bancosRes.length > 0) {
        setSelectedBanco(bancosRes[0]);
      }
      if (provRes && provRes.length > 0) {
        setFormProveedorId(String(provRes[0].id));
      }
    } catch (error) {
      console.error("Error validating batch:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchValidations();
  }, []);

  const totalErrores = validations.filter(v => v.status === 'ERROR' || v.estado === 'ERROR').length;
  const totalDebitar = loteData?.total_debitar || '$0.00';

  const handleProcesarLote = async () => {
    if (totalErrores > 0) {
      showToast("No se puede procesar el lote. Existen errores de validación.");
      return;
    }

    try {
      await api.post('/pagos/lotes/procesar', {
        referencia: loteRef,
        fecha: fecha,
        formato: formato,
        total: totalDebitar
      });
      showToast("Lote procesado exitosamente.");
      
      const newSteps = [...steps];
      newSteps[1].status = 'completed';
      newSteps[2].status = 'active';
      setSteps(newSteps);
    } catch (error) {
      console.error("Error processing batch:", error);
      showToast("Error al procesar el lote de pagos.");
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProveedorId || !formRef || !formMonto) {
      showToast("Por favor complete todos los campos obligatorios.");
      return;
    }
    try {
      await api.post('/pagos/cuentas/manual', {
        proveedor_id: parseInt(formProveedorId),
        numero_documento: formRef,
        monto_total_usd: parseFloat(formMonto),
        tasa_cambio_bs: parseFloat(formTasa),
        dias_credito: parseInt(formCredito)
      });
      showToast("Factura / Orden de proveedor registrada exitosamente.");
      setIsManualOpen(false);
      setFormRef('');
      setFormMonto('');
      fetchValidations();
    } catch (err: any) {
      console.error(err);
      showToast("Error al registrar la factura.");
    }
  };

  const displayValidations = validations.length > 0 ? validations : [];

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Pagos &gt; Masivos
              </span>
            </div>
            <h1 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase">Lote de Pagos (Wizard)</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Flujo guiado para consolidar múltiples órdenes en un solo pago.</p>
          </div>
          <div className="flex gap-3">
             <button 
                onClick={() => setIsManualOpen(true)}
                className="bg-slate-50 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-white transition-all flex items-center gap-2"
             >
                <HelpCircle size={14} /> Manual
             </button>
             <button 
                onClick={() => navigate('/facturacion/pagos')}
                className="bg-slate-50 text-slate-400 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-white transition-all"
             >
                Cancelar
             </button>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-4 max-w-4xl mx-auto pt-4 relative">
          {steps.map((s, i) => (
            <div key={i} className="flex-1 flex items-center gap-3 group">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs border-2 z-10 transition-all ${
                s.status === 'active' ? 'bg-[#0b5156] border-[#0b5156] text-white shadow-lg shadow-green-900/20' : 
                s.status === 'completed' ? 'bg-[#0b5156] border-[#0b5156] text-white' : 
                'bg-white border-slate-200 text-slate-400'
              }`}>
                {s.status === 'completed' ? <CheckCircle2 size={16} /> : s.n}
              </div>
              <span className={`text-xs font-black uppercase tracking-tighter transition-all ${
                s.status === 'active' ? 'text-[#0b5156]' : 'text-slate-400'
              }`}>
                {s.label}
              </span>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${s.status === 'completed' ? 'bg-[#0b5156]' : 'bg-white'}`}></div>
              )}
            </div>
          ))}
        </div>
      </header>

      {/* Wizard Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <section className="lg:col-span-2 space-y-6">
          <article className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-8">
            <div className="space-y-1">
              <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Configuración de Emisión</h2>
              <p className="text-xs font-bold text-slate-500 uppercase">Establece el origen y método de ejecución de los pagos.</p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest pl-2">Referencia del Lote</label>
                <input 
                  type="text" 
                  value={loteRef}
                  onChange={(e) => setLoteRef(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm font-black text-[#0b5156] outline-none focus:border-[#0b5156]" 
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest pl-2">Cuenta Bancaria Origen</label>
                <div className="bg-slate-50 border-2 border-[#0b5156] rounded-2xl p-4 flex items-center gap-4 group hover:bg-white transition-all cursor-pointer">
                  <div className="w-10 h-10 bg-[#0b5156] text-white rounded-2xl flex items-center justify-center font-black text-lg shadow-lg shadow-green-900/20">
                    <Building2 size={20} />
                  </div>
                  <div className="flex-1">
                    <strong className="text-xs font-black text-[#0b5156] uppercase block">
                      {selectedBanco ? `${selectedBanco.banco} (${selectedBanco.moneda})` : 'Seleccione cuenta origen'}
                    </strong>
                    <span className="text-[10px] font-bold text-slate-500 font-mono">
                      {selectedBanco ? selectedBanco.numero_cuenta : '****-****-****-****'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-black text-slate-400 uppercase block">Disponible</span>
                    <strong className="text-base font-black text-[#0b5156] font-mono">
                      {selectedBanco ? (selectedBanco.moneda === 'USD' ? `$${Number(selectedBanco.saldo_actual_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : `Bs. ${Number(selectedBanco.saldo_actual_usd).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`) : '$0.00'}
                    </strong>
                  </div>
                </div>
                {bancos.length > 1 && (
                  <select 
                    onChange={(e) => {
                      const b = bancos.find(x => String(x.id) === e.target.value);
                      if (b) setSelectedBanco(b);
                    }}
                    value={selectedBanco?.id || ''}
                    className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-600 focus:outline-none focus:border-[#0b5156]/50 uppercase transition-all"
                  >
                    {bancos.map(x => (
                      <option key={x.id} value={x.id}>{x.banco} - {x.numero_cuenta} ({x.moneda})</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest pl-2">Fecha Programada</label>
                  <div className="relative">
                    <input 
                      type="date" 
                      value={fecha}
                      onChange={(e) => setFecha(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm font-black text-[#0b5156] outline-none focus:border-[#0b5156]" 
                    />
                    <Calendar className="absolute right-4 top-4 text-slate-400" size={20} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest pl-2">Formato Archivo Banco</label>
                  <select 
                    value={formato}
                    onChange={(e) => setFormato(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm font-black text-[#0b5156] outline-none focus:border-[#0b5156]"
                  >
                    <option>Archivo TXT Banesco (Pago a Proveedores)</option>
                    <option>Excel Genérico</option>
                    <option>Sin archivo (Ejecución manual)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-8 border-t border-slate-100 flex justify-between">
              <button className="bg-slate-50 text-slate-600 px-6 py-3 rounded-xl text-xs font-black uppercase flex items-center gap-2 hover:bg-white transition-all">
                <ArrowLeft size={16} /> Volver
              </button>
              <button onClick={handleProcesarLote} disabled={totalErrores > 0} className="bg-[#0b5156] text-white px-6 py-3 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-2xl hover:bg-[#083a3d] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                Continuar <ArrowRight size={16} />
              </button>
            </div>
          </article>
        </section>

        <aside className="space-y-6">
          <article className="bg-white p-6 rounded-2xl border border-red-200 shadow-sm space-y-6">
            <div className="flex items-center gap-3 text-red-600">
              <ShieldAlert size={24} />
              <h3 className="text-lg font-black uppercase tracking-tight leading-none">Validador de Integridad</h3>
            </div>
            
            <div className="space-y-3">
              {isLoading ? (
                <div className="py-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Validando órdenes...</div>
              ) : displayValidations.map((v, i) => {
                const isError = (v.status || v.estado) === 'ERROR';
                const color = isError ? 'text-red-600' : 'text-green-600';
                const bg = isError ? 'bg-red-50' : 'bg-green-50';
                const border = isError ? 'border-red-200' : 'border-green-200';
                
                return (
                  <div key={i} className={`p-4 rounded-2xl border-l-4 ${v.bg || bg} ${v.border || border} ${v.color || color} space-y-1 transition-all hover:scale-[1.02]`}>
                    <div className="flex justify-between items-center">
                      <strong className="text-xs font-black uppercase">{v.provider || v.proveedor}</strong>
                      <span className="text-[10px] font-black">{!isError ? '✅ OK' : '❌ ERROR'}</span>
                    </div>
                    {(v.error || v.mensaje) && <p className="text-[10px] font-black uppercase">{v.error || v.mensaje}</p>}
                    <p className="text-[9px] font-bold text-slate-400 font-mono uppercase">{v.meta || v.metadata}</p>
                  </div>
                );
              })}
            </div>

            <div className="pt-6 border-t border-slate-100">
              <div className="flex justify-between items-end mb-4">
                <span className="text-xs font-black text-slate-400 uppercase">Total a Debitar</span>
                <strong className="text-2xl font-black text-red-600 font-mono tracking-tighter">{totalDebitar}</strong>
              </div>
              {totalErrores > 0 ? (
                <div className="bg-red-600 text-white text-center py-4 rounded-2xl text-xs font-black uppercase shadow-lg shadow-red-900/20">
                  BLOQUEADO: {totalErrores} Errores Detectados
                </div>
              ) : (
                <button 
                  onClick={handleProcesarLote}
                  className="w-full bg-green-600 text-white text-center py-4 rounded-2xl text-xs font-black uppercase shadow-lg shadow-green-900/20 hover:bg-green-700 transition-all"
                >
                  LISTO PARA PROCESAR
                </button>
              )}
            </div>
          </article>

          <article className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h4 className="text-sm font-black text-[#0b5156] uppercase">Ayuda Técnica</h4>
            <p className="text-xs font-bold text-slate-500 uppercase leading-relaxed">
              El archivo TXT para Banesco requiere que todos los proveedores tengan RIF y cuenta de 20 dígitos validada.
            </p>
            <button className="text-xs font-black text-[#0b5156] uppercase hover:underline">Ver requisitos por banco</button>
          </article>
        </aside>
      </div>

      {/* Premium Toast Notification */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-bounce">
          <div className="bg-[#0b5156] border border-[#083a3d] text-white px-6 py-3 rounded-full text-xs font-black uppercase tracking-wider shadow-2xl flex items-center gap-2">
            🔔 {toast}
          </div>
        </div>
      )}

      {/* Modal Manual */}
      {isManualOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 max-w-md w-full shadow-2xl space-y-6">
            <div>
              <h3 className="text-lg font-black text-[#0b5156] uppercase">Registrar Factura Manual</h3>
              <p className="text-xs font-bold text-slate-400 uppercase">Crea un pasivo o cuenta por pagar para un proveedor.</p>
            </div>
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider pl-1">Proveedor</label>
                <select
                  value={formProveedorId}
                  onChange={(e) => setFormProveedorId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#0b5156] uppercase"
                >
                  {proveedores.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} ({p.rif})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider pl-1">Número de Factura</label>
                <input
                  type="text"
                  required
                  placeholder="FAC-XXX-XXXX"
                  value={formRef}
                  onChange={(e) => setFormRef(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider pl-1">Monto (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={formMonto}
                    onChange={(e) => setFormMonto(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider pl-1">Tasa Cambio (Bs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formTasa}
                    onChange={(e) => setFormTasa(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider pl-1">Días de Crédito</label>
                <input
                  type="number"
                  required
                  value={formCredito}
                  onChange={(e) => setFormCredito(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsManualOpen(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl text-xs font-black uppercase transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#0b5156] hover:bg-[#083a3d] text-white py-3 rounded-xl text-xs font-black uppercase shadow-lg shadow-green-900/10 transition-all"
                >
                  Guardar CxP
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentBatches;
