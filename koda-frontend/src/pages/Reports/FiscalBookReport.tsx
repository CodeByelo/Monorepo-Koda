import { 
  ArrowLeft,
  Printer,
  Download,
  ShieldCheck,
  Calendar
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { useEmpresaPerfil } from '@/hooks/useEmpresaPerfil';

const FiscalBookReport = () => {
  const { perfil } = useEmpresaPerfil();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [periodo, setPeriodo] = useState(currentMonth);
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [modalMessage, setModalMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchReportData();
  }, [periodo]);

  const fetchReportData = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<any>(`/reportes/fiscal?periodo=${periodo}`);
      setData(res || null);
    } catch (error) {
      console.error("Error fetching report data:", error);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (val: number | string | undefined | null) => {
    if (val === undefined || val === null) return "0.00";
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return val;
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2 });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    try {
      await api.download(`/reportes/fiscal/exportar?periodo=${periodo}&formato=pdf`, `reporte_fiscal_${periodo}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      setModalMessage("Error al generar PDF.");
    }
  };

  return (
    <div className="space-y-1.5 animate-in fade-in duration-500 pb-4">
      {/* Header */}
      <header className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <Link to="/reportes" className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-[#0b5156]/20 transition-all">
              <ArrowLeft size={10} /> Volver
            </Link>
            <span className="bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
              Vista Previa Oficial
            </span>
          </div>
          <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Libro de Resumen Fiscal</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Formato legal listo para impresión y firmado digital. Requerido como anexo de la DP-31.</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
           <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mr-2">
              <Calendar size={14} className="text-slate-400" />
              <input 
                type="month" 
                value={periodo} 
                onChange={(e) => setPeriodo(e.target.value)}
                className="bg-transparent text-xs font-black text-[#0b5156] outline-none"
              />
           </div>
           <button onClick={handlePrint} className="bg-white text-slate-500 px-6 py-2 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2">
              <Printer size={14} /> Imprimir Documento
           </button>
           <button onClick={handleDownloadPDF} className="bg-[#0b5156] text-white px-8 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/10 hover:bg-[#083a3d] transition-all">
              <Download size={14} /> Generar PDF Cifrado
           </button>
        </div>
      </header>

      {isLoading ? (
        <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse bg-white rounded-3xl border border-slate-200 shadow-sm print:hidden">
           Cargando Reporte Fiscal...
        </div>
      ) : (
        <>
          {/* DOCUMENT PREVIEW (WHITE PAPER STYLE) */}
          <article className="bg-[#f8fafc] p-6 md:p-10 rounded-xl shadow-lg max-w-[950px] mx-auto text-[#0f172a] font-serif border border-slate-200 relative overflow-hidden print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-full">
            <style dangerouslySetInnerHTML={{__html: `
              @media print {
                body > * { display: none !important; }
                article { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }
              }
            `}} />
            {/* Subtle Watermark */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-[0.015] rotate-[-45deg] select-none text-[8rem] font-black uppercase whitespace-nowrap print:opacity-[0.03]">
              KODA ERP - OFICIAL
            </div>

            {/* Doc Header */}
            <div className="text-center border-b-2 border-[#0f172a] pb-4 mb-4 relative z-10">
              <div className="text-lg font-bold uppercase tracking-widest mb-2">RESUMEN DEL LIBRO DE COMPRAS Y VENTAS</div>
              <div className="font-sans text-[11px] text-slate-500 leading-relaxed uppercase font-bold tracking-tight">
                <strong>{perfil?.razon_social || 'EMPRESA NO DEFINIDA'}</strong> | RIF: {perfil?.rif || 'NO DEFINIDO'}<br />
                <strong>PERÍODO FISCAL:</strong> {periodo}<br />
                <span className="text-[9px]">Generado por Sistema KODA ERP el {new Date().toLocaleDateString('es-VE')}</span>
              </div>
            </div>

            <div className="relative z-10 space-y-6">
              {/* Section I */}
              <section>
                <h3 className="font-sans text-[11px] font-black mb-2 uppercase tracking-tighter border-l-4 border-[#0b5156] pl-2">I. RESUMEN DE DÉBITOS FISCALES (VENTAS)</h3>
                <table className="w-full font-sans text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-white uppercase tracking-tighter">
                      <th className="border border-slate-300 p-2 text-left">Concepto</th>
                      <th className="border border-slate-300 p-2 text-right">Base Imponible</th>
                      <th className="border border-slate-300 p-2 text-center">Alícuota</th>
                      <th className="border border-slate-300 p-2 text-right">Débito Fiscal</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-300 p-2">Ventas Internas Gravadas por Alícuota General</td>
                      <td className="border border-slate-300 p-2 text-right font-mono">Bs. {formatCurrency(data?.ventas_gravadas_base)}</td>
                      <td className="border border-slate-300 p-2 text-center">16%</td>
                      <td className="border border-slate-300 p-2 text-right font-mono font-bold">Bs. {formatCurrency(data?.ventas_gravadas_debito)}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 p-2">Ventas Internas Exoneradas / No Sujetas</td>
                      <td className="border border-slate-300 p-2 text-right font-mono">Bs. {formatCurrency(data?.ventas_exoneradas)}</td>
                      <td className="border border-slate-300 p-2 text-center">0%</td>
                      <td className="border border-slate-300 p-2 text-right font-mono">Bs. 0.00</td>
                    </tr>
                    <tr className="bg-slate-200 font-bold print:bg-slate-200">
                      <td className="border border-slate-300 p-2 uppercase">TOTAL DÉBITOS FISCALES DEL PERÍODO</td>
                      <td className="border border-slate-300 p-2 text-right font-mono">Bs. {formatCurrency((data?.ventas_gravadas_base || 0) + (data?.ventas_exoneradas || 0))}</td>
                      <td className="border border-slate-300 p-2 text-center">—</td>
                      <td className="border border-slate-300 p-2 text-right font-mono">Bs. {formatCurrency(data?.total_debitos)}</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              {/* Section II */}
              <section>
                <h3 className="font-sans text-[11px] font-black mb-2 uppercase tracking-tighter border-l-4 border-amber-500 pl-2">II. RESUMEN DE CRÉDITOS FISCALES (COMPRAS)</h3>
                <table className="w-full font-sans text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-white uppercase tracking-tighter">
                      <th className="border border-slate-300 p-2 text-left">Concepto</th>
                      <th className="border border-slate-300 p-2 text-right">Base Imponible</th>
                      <th className="border border-slate-300 p-2 text-center">Alícuota</th>
                      <th className="border border-slate-300 p-2 text-right">Crédito Fiscal</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-300 p-2">Compras Internas Gravadas (Alícuota General)</td>
                      <td className="border border-slate-300 p-2 text-right font-mono">Bs. {formatCurrency(data?.compras_gravadas_base)}</td>
                      <td className="border border-slate-300 p-2 text-center">16%</td>
                      <td className="border border-slate-300 p-2 text-right font-mono font-bold">Bs. {formatCurrency(data?.compras_gravadas_credito)}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 p-2">Compras Exentas / Exoneradas</td>
                      <td className="border border-slate-300 p-2 text-right font-mono">Bs. {formatCurrency(data?.compras_exentas)}</td>
                      <td className="border border-slate-300 p-2 text-center">0%</td>
                      <td className="border border-slate-300 p-2 text-right font-mono">Bs. 0.00</td>
                    </tr>
                    <tr className="bg-slate-200 font-bold print:bg-slate-200">
                      <td className="border border-slate-300 p-2 uppercase">TOTAL CRÉDITOS FISCALES DEL PERÍODO</td>
                      <td className="border border-slate-300 p-2 text-right font-mono">Bs. {formatCurrency((data?.compras_gravadas_base || 0) + (data?.compras_exentas || 0))}</td>
                      <td className="border border-slate-300 p-2 text-center">—</td>
                      <td className="border border-slate-300 p-2 text-right font-mono">Bs. {formatCurrency(data?.total_creditos)}</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              {/* Section III */}
              <section>
                <h3 className="font-sans text-[11px] font-black mb-2 uppercase tracking-tighter border-l-4 border-red-600 pl-2">III. LIQUIDACIÓN DEL IMPUESTO (CUOTA TRIBUTARIA)</h3>
                <table className="w-full font-sans text-[11px] border-2 border-[#0f172a] border-collapse">
                  <tbody>
                    <tr className="border-b border-slate-200">
                      <td className="p-2.5 font-bold uppercase">Total Débitos Fiscales</td>
                      <td className="p-2.5 text-right font-mono font-black">Bs. {formatCurrency(data?.total_debitos)}</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="p-2.5 font-bold uppercase">(-) Total Créditos Fiscales</td>
                      <td className="p-2.5 text-right font-mono font-black">Bs. {formatCurrency(data?.total_creditos)}</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="p-2.5 font-bold uppercase">(-) Retenciones de IVA Soportadas</td>
                      <td className="p-2.5 text-right font-mono font-black">Bs. {formatCurrency(data?.retenciones_soportadas)}</td>
                    </tr>
                    <tr className="bg-slate-700 text-white print:bg-slate-700 print:text-black print:!bg-slate-200">
                      <td className="p-3 font-black uppercase text-xs tracking-tighter italic">TOTAL IVA NETO {data?.cuota_tributaria > 0 ? 'A PAGAR A FAVOR DEL FISCO NACIONAL' : 'EXCEDENTE DE CRÉDITO FISCAL'}</td>
                      <td className="p-3 text-right font-mono font-black text-sm underline decoration-double">Bs. {formatCurrency(Math.abs(data?.cuota_tributaria || 0))}</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              {/* Signatures */}
              <div className="flex justify-around mt-10 font-sans break-inside-avoid">
                 <div className="flex flex-col items-center">
                    <div className="w-48 border-t border-[#0f172a] mt-6 mb-1" />
                    <span className="text-[9px] font-black uppercase tracking-tight text-center leading-tight">
                       Contador Público Colegiado<br />
                       <span className="text-slate-400 font-bold">Firma y Sello</span>
                    </span>
                 </div>
                 <div className="flex flex-col items-center">
                    <div className="w-48 border-t border-[#0f172a] mt-6 mb-1" />
                    <span className="text-[9px] font-black uppercase tracking-tight text-center leading-tight">
                       Representante Legal<br />
                       <span className="text-slate-400 font-bold">Sello de la Empresa</span>
                    </span>
                 </div>
              </div>
            </div>
          </article>

          {/* Forensic Seal */}
          <div className="flex justify-center mt-4 print:hidden">
             <div className="bg-white border border-slate-200 px-6 py-2 rounded-full flex items-center gap-3 text-slate-400 text-[9px] font-black uppercase tracking-widest shadow-sm">
                <ShieldCheck size={14} className="text-[#0b5156]" />
                Documento Cifrado con Algoritmo KODA SHA-256
             </div>
          </div>
        </>
      )}

      {modalMessage && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 print:hidden">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-[#0b5156] p-4 text-white flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest">Aviso del Sistema</h3>
              <button 
                onClick={() => setModalMessage(null)}
                className="text-white/70 hover:text-white text-xs font-bold uppercase transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-slate-600 text-xs font-bold uppercase tracking-tight leading-relaxed">
                {modalMessage}
              </p>
              <div className="flex justify-end gap-2">
                <button 
                  onClick={() => setModalMessage(null)}
                  className="bg-[#0b5156] text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
                >
                  Aceptar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FiscalBookReport;
