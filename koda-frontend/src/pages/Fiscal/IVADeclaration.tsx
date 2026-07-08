import { useState, useEffect } from 'react';
import { 
  Printer, 
  BookOpen, 
  ArrowLeft,
  AlertCircle,
  History,
  Calculator,
  Download,
  ShieldCheck,
  Save,
  Calendar
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { useEmpresaPerfil } from '@/hooks/useEmpresaPerfil';
import { createPortal } from 'react-dom';

const IVADeclaration = () => {
  const { perfil, isLoading: isPerfilLoading } = useEmpresaPerfil();
  
  // Default to current month YYYY-MM
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [periodo, setPeriodo] = useState(currentMonth);
  
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Manual retentions input (since the user might want to adjust it)
  const [retenciones, setRetenciones] = useState(0);
  const [toast, setToast] = useState<{message: string, type: 'success'|'error'} | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    fetchDeclarationData();
  }, [periodo]);

  const fetchDeclarationData = async () => {
    try {
      setIsLoading(true);
      const [declRes, histRes] = await Promise.all([
        api.get<any>(`/fiscal/declaracion-iva?periodo=${periodo}`),
        api.get<any[]>('/fiscal/declaraciones-iva/historial')
      ]);
      setData(declRes);
      setRetenciones(declRes?.retenciones || 0);
      setHistory(histRes || []);
    } catch (error) {
      console.error("Error fetching IVA data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuardarBorrador = async () => {
    try {
      await api.post('/fiscal/declaracion-iva/borrador', {
        periodo,
        retenciones,
        data
      });
      showToast("Borrador guardado correctamente.", "success");
    } catch (error) {
      console.error("Error:", error);
      showToast("Error al guardar borrador.", "error");
    }
  };

  const handleGenerarDP31 = async () => {
    try {
      await api.post('/fiscal/declaracion-iva/finalizar', {
        periodo,
        retenciones,
        data
      });
      showToast("DP-31 generado. El período ha sido cerrado fiscalmente.", "success");
      fetchDeclarationData();
    } catch (error) {
      console.error("Error:", error);
      showToast("Error al generar DP-31.", "error");
    }
  };

  const formatCurrency = (val: number) => {
    return "Bs. " + Math.abs(val).toLocaleString('es-VE', { minimumFractionDigits: 2 });
  };

  if (isLoading || isPerfilLoading) {
    return (
      <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse bg-white rounded-3xl border border-slate-200 shadow-sm">
         Cargando datos fiscales...
      </div>
    );
  }

  // Safe defaults if api returns null
  const debito = data?.debito_fiscal || 0;
  const creditoMes = data?.credito_fiscal_mes || 0;
  const creditoExcedente = data?.credito_excedente_anterior || 0;
  const baseVentas = data?.base_imponible_ventas || 0;
  const baseCompras = data?.base_imponible_compras || 0;
  const metrics = data?.metrics || [];
  const statusLibros = data?.estado_libros || [];

  const totalCreditoCompensable = creditoMes + creditoExcedente;
  const totalDebitoNeto = debito - retenciones;
  const result = totalDebitoNeto - totalCreditoCompensable;

  return (
    <div className="space-y-2 animate-in fade-in duration-500 pb-4">
      {/* Header */}
      <header className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <Link to="/fiscal" className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-[#0b5156]/20 transition-all">
                <ArrowLeft size={10} /> Volver a Fiscal
              </Link>
              <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Declaración IVA — DP-31
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Declaración IVA — Formulario DP-31</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Preparación, revisión y liquidación del Impuesto al Valor Agregado ante el SENIAT.</p>
          </div>
          <div className="flex gap-2 items-center">
             <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <Calendar size={14} className="text-slate-400" />
                <input 
                  type="month" 
                  value={periodo} 
                  onChange={(e) => setPeriodo(e.target.value)}
                  className="bg-transparent text-xs font-black text-[#0b5156] outline-none"
                />
             </div>
             <button onClick={() => window.print()} className="bg-white text-[#0b5156] px-4 py-2.5 rounded-xl text-xs font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all hidden print:hidden md:flex">
                <Printer size={14} /> Imprimir DP-31
             </button>
             <Link to="/fiscal/libro-ventas" className="bg-[#0b5156] text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all hidden print:hidden md:flex">
                <BookOpen size={14} /> Ver Libro Ventas
             </Link>
          </div>
        </div>
      </header>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start print:hidden">
        {metrics.length > 0 ? metrics.map((m: any, i: number) => (
          <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest leading-tight">{m.label}</p>
            <div className="space-y-1">
              <strong className={`text-xl font-black ${m.color} tracking-tighter font-mono`}>{m.value}</strong>
              <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">{m.desc}</p>
            </div>
          </div>
        )) : (
          // Default fallbacks if API doesn't provide metrics array
          <>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest leading-tight">Período</p>
              <div className="space-y-1">
                <strong className="text-xl font-black text-[#0b5156] tracking-tighter font-mono">{periodo}</strong>
                <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">En preparación</p>
              </div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest leading-tight">Débito Fiscal</p>
              <div className="space-y-1">
                <strong className="text-xl font-black text-red-600 tracking-tighter font-mono">{formatCurrency(debito)}</strong>
                <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">IVA en ventas del período</p>
              </div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest leading-tight">Crédito Fiscal</p>
              <div className="space-y-1">
                <strong className="text-xl font-black text-green-600 tracking-tighter font-mono">{formatCurrency(creditoMes)}</strong>
                <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">IVA en compras del período</p>
              </div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-24">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest leading-tight">IVA a Pagar</p>
              <div className="space-y-1">
                <strong className="text-xl font-black text-amber-600 tracking-tighter font-mono">{formatCurrency(result > 0 ? result : 0)}</strong>
                <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">Débito − Crédito − Retenciones</p>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Form DP-31 - Print Area */}
      <div id="dp31-print-area">
        <style dangerouslySetInnerHTML={{__html: `
          @media print {
            body * { visibility: hidden; }
            #dp31-print-area, #dp31-print-area * { visibility: visible; }
            #dp31-print-area { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
            .print\\:hidden { display: none !important; }
          }
        `}} />
        <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-3.5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <div className="space-y-1">
              <h2 className="text-sm font-black text-[#0b5156] uppercase tracking-tighter leading-none">Formulario DP-31 — Declaración y Pago ({periodo})</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Complete los campos del período. Los valores se sincronizan con los libros legales.</p>
            </div>
            <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-3 py-1 rounded-full uppercase print:hidden">En Preparación</span>
          </div>

          <div className="p-3.5 space-y-3.5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
              {/* Identification */}
              <fieldset className="border border-slate-200 rounded-xl p-3.5 bg-slate-50 space-y-2">
                <legend className="px-3 text-[10px] font-black text-[#0b5156] uppercase tracking-[0.2em]">I. Identificación</legend>
                <div className="grid grid-cols-2 gap-3 items-start">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">RIF del Contribuyente</label>
                    <input type="text" value={perfil?.rif || ''} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-black text-[#0b5156] uppercase" readOnly />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</label>
                    <select value={perfil?.tipo_contribuyente} disabled className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-black text-[#0b5156] uppercase outline-none focus:border-[#0b5156] appearance-none cursor-not-allowed opacity-80">
                      <option value="ESPECIAL">Contribuyente Especial</option>
                      <option value="ORDINARIO">Ordinario</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Razón Social</label>
                  <input type="text" value={perfil?.razon_social || ''} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-black text-slate-600 uppercase" readOnly />
                </div>
              </fieldset>

              {/* Débito Fiscal */}
              <fieldset className="border border-slate-200 rounded-xl p-3.5 bg-slate-50 space-y-2">
                <legend className="px-3 text-[10px] font-black text-[#0b5156] uppercase tracking-[0.2em]">II. Débito Fiscal (Ventas)</legend>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base Imponible — Ventas</label>
                  <input type="text" value={formatCurrency(baseVentas)} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-mono font-black text-slate-600" readOnly />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">IVA Débito Fiscal</label>
                  <input type="text" value={formatCurrency(debito)} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-mono font-black text-red-600" readOnly />
                </div>
              </fieldset>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
              {/* Crédito Fiscal */}
              <fieldset className="border border-slate-200 rounded-xl p-3.5 bg-slate-50 space-y-2">
                <legend className="px-3 text-[10px] font-black text-[#0b5156] uppercase tracking-[0.2em]">III. Crédito Fiscal (Compras)</legend>
                <div className="grid grid-cols-2 gap-3 items-start">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base Compras Internas</label>
                    <input type="text" value={formatCurrency(baseCompras)} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-mono font-black text-slate-600" readOnly />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">IVA Crédito Fiscal</label>
                    <input type="text" value={formatCurrency(creditoMes)} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-mono font-black text-green-600" readOnly />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Retenciones de IVA Soportadas</label>
                  <div className="flex relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-[#0b5156] font-black">Bs.</span>
                    <input type="number" step="0.01" value={retenciones} onChange={(e) => setRetenciones(Number(e.target.value))} className="w-full pl-10 pr-4 py-2 bg-white border border-[#0b5156]/20 rounded-xl text-xs font-mono font-black text-[#0b5156] outline-none focus:border-[#0b5156]" />
                  </div>
                </div>
              </fieldset>

              {/* Liquidación Final */}
              <fieldset className="border border-[#0b5156]/20 rounded-xl p-3.5 bg-[#0b5156]/10 space-y-2 relative overflow-hidden">
                <legend className="px-3 text-[10px] font-black text-[#0b5156] uppercase tracking-[0.2em]">IV. Liquidación Cuota Tributaria</legend>
                
                <div className="space-y-1 relative z-10">
                  <div className="flex justify-between items-center text-[10px] font-black text-[#0b5156] uppercase tracking-widest">
                    <span>Débito Fiscal Neto</span>
                    <span className="font-mono text-[#0b5156] font-black">{formatCurrency(totalDebitoNeto)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-black text-[#0b5156] uppercase tracking-widest">
                    <span>Crédito Fiscal Compensable</span>
                    <span className="font-mono text-[#0b5156] font-black">{formatCurrency(totalCreditoCompensable)}</span>
                  </div>
                  
                  <div className="pt-2 border-t border-[#0b5156]/20 mt-1">
                    <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${result >= 0 ? 'text-amber-700' : 'text-green-700'}`}>
                      {result >= 0 ? '= CUOTA TRIBUTARIA A PAGAR' : '= NUEVO EXCEDENTE DE CRÉDITO FISCAL'}
                    </p>
                    <div className="flex justify-between items-end">
                      <Calculator size={20} className={result >= 0 ? 'text-amber-600' : 'text-green-600'} />
                      <strong className={`text-xl font-black tracking-tighter font-mono ${result >= 0 ? 'text-amber-600' : 'text-green-600'}`}>
                        {formatCurrency(result)}
                      </strong>
                    </div>
                  </div>
                </div>
                <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-[#0b5156]/10 rounded-full blur-2xl"></div>
              </fieldset>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-slate-100 print:hidden">
               <button onClick={handleGuardarBorrador} className="bg-white text-slate-600 px-4 py-2 rounded-lg text-[10px] font-black uppercase border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2">
                 <Save size={14} /> Guardar Borrador
               </button>
               <button onClick={handleGenerarDP31} className="bg-[#0b5156] text-white px-6 py-2 rounded-lg text-[10px] font-black uppercase shadow-lg shadow-green-900/20 hover:scale-[1.02] transition-all flex items-center gap-2">
                  <Download size={14} /> Generar DP-31 Final
               </button>
            </div>
          </div>
        </article>
      </div>

      {/* Book Status */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <div className="space-y-1">
            <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Estado de Libros — {periodo}</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Validación de soportes obligatorios antes del cierre fiscal.</p>
          </div>
          <ShieldCheck className="text-green-500/20" size={32} />
        </div>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-2.5 px-4">Libro / Documento</th>
                <th className="py-2.5 px-4">Registros</th>
                <th className="py-2.5 px-4 text-right">Base Imponible</th>
                <th className="py-2.5 px-4 text-right">IVA / Impuesto</th>
                <th className="py-2.5 px-4 text-center">Estado</th>
                <th className="py-2.5 px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs">
              {statusLibros.length > 0 ? statusLibros.map((row: any, i: number) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors group">
                  <td className="py-2.5 px-4 font-black text-[#0b5156] uppercase">{row.name}</td>
                  <td className="py-2.5 px-4 font-bold text-slate-400 uppercase">{row.items}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-black text-slate-600">{row.base}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-black text-[#0b5156]">{row.iva}</td>
                  <td className="py-2.5 px-4 text-center">
                    <span className={`${row.color} px-2 py-0.5 rounded text-[9px] font-black uppercase`}>{row.status}</span>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <Link to={row.link} className="text-[10px] font-black text-[#0b5156] uppercase hover:underline">Ver Detalle</Link>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                    No hay datos de libros para este período
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Historial */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <div className="space-y-1">
            <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Historial de Declaraciones IVA</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Consultas de períodos anteriores presentados.</p>
          </div>
          <History className="text-slate-200" size={32} />
        </div>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">
                <th className="py-2.5 px-4">Período</th>
                <th className="py-2.5 px-4 text-right">Débito Fiscal</th>
                <th className="py-2.5 px-4 text-right">Crédito Fiscal</th>
                <th className="py-2.5 px-4 text-right">IVA Pagado</th>
                <th className="py-2.5 px-4 text-center">Fecha Pres.</th>
                <th className="py-2.5 px-4 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs text-slate-600 font-bold">
              {history.length > 0 ? history.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 px-4 font-black text-[#0b5156] uppercase">{row.periodo}</td>
                  <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(row.debito)}</td>
                  <td className="py-2.5 px-4 text-right font-mono">{formatCurrency(row.credito)}</td>
                  <td className="py-2.5 px-4 text-right font-mono font-black text-slate-800">{formatCurrency(row.pago)}</td>
                  <td className="py-2.5 px-4 text-center font-mono">{row.fecha_presentacion}</td>
                  <td className="py-2.5 px-4 text-center">
                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[9px] font-black uppercase">Presentada</span>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                    No hay declaraciones en el historial
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Manual / Alert Section */}
      <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-3 print:hidden">
        <AlertCircle size={24} className="text-amber-600 shrink-0" />
        <div className="space-y-1">
          <h4 className="text-xs font-black text-amber-800 uppercase">Aviso de Responsabilidad Fiscal</h4>
          <p className="text-[10px] text-amber-700 font-bold uppercase leading-relaxed opacity-80">
            Los cálculos presentados en este formulario son automáticos basados en los registros de compra y venta. Es responsabilidad del usuario validar cada monto antes de la presentación definitiva en el portal del SENIAT.
          </p>
        </div>
      </div>

      {toast && typeof document !== 'undefined' && createPortal(
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[150] animate-in slide-in-from-top-4 fade-in duration-300">
          <div className={`px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 ${toast.type === 'success' ? 'bg-[#0b5156] border border-[#0b5156]/20 text-white' : 'bg-red-600 border border-red-500 text-white'}`}>
            <AlertCircle size={20} />
            <span className="font-bold text-sm tracking-wide uppercase font-mono">{toast.message}</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default IVADeclaration;
