import { useState, useEffect } from 'react';
import { 
  Printer, 
  ArrowLeft, 
  Plus, 
  Download,
  AlertCircle,
  X,
  Search
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import { useEmpresaPerfil } from '@/hooks/useEmpresaPerfil';

const RetentionVoucher = () => {
  const { perfil } = useEmpresaPerfil();
  const [searchParams] = useSearchParams();
  const initialId = searchParams.get('id') || '';
  
  const [voucherId, setVoucherId] = useState(initialId);
  const [voucherData, setVoucherData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [compDate, setCompDate] = useState(new Date().toISOString().split('T')[0]);
  const [compMonth, setCompMonth] = useState(new Date().toISOString().slice(5, 7));
  const [compYear, setCompYear] = useState(new Date().getFullYear().toString());
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (voucherId) {
      fetchVoucher();
    }
  }, [voucherId]);

  const fetchVoucher = async () => {
    if (!voucherId) return;
    try {
      setIsLoading(true);
      const res = await api.get<any>(`/fiscal/retencion-iva/detalle?id=${voucherId}`);
      setVoucherData(res || null);
    } catch (error) {
      console.error("Error fetching voucher data:", error);
      setVoucherData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const isInvalid = () => {
    const date = new Date(compDate);
    const dateMonth = date.getUTCMonth() + 1;
    const dateYear = date.getUTCFullYear();
    return (Number(compMonth) !== dateMonth || Number(compYear) !== dateYear);
  };

  const getCompNumber = () => {
    return compDate.replace(/-/g, '') + "00000001";
  };

  const formatCurrency = (val: number | string | undefined | null) => {
    if (val === undefined || val === null) return "0,00";
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return val;
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2 });
  };

  const handleDownloadOfficialPDF = async () => {
    try {
      setIsGenerating(true);
      const urlParams = new URLSearchParams({
        proveedor_id: voucherData?.proveedor?.rif || "J-40552312-0",
        periodo: `${compYear}${compMonth}`,
        correlativo: getCompNumber()
      });
      
      const token = localStorage.getItem('koda_token');
      const headers: any = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const res = await fetch(`/api/fiscal/retencion-iva/pdf?${urlParams.toString()}`, { headers });
      if (!res.ok) throw new Error("Error generating PDF");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RET_IVA_${getCompNumber()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      setShowModal(false);
    } catch (error) {
      console.error(error);
      alert('Error al generar PDF oficial.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-500 pb-20 print:bg-white print:p-0">
      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden print:hidden">
        <div className="flex justify-between items-start mb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <Link to="/fiscal/retenciones-iva" className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-[#0b5156]/20 transition-all">
                <ArrowLeft size={10} /> Volver a Retenciones
              </Link>
              <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Visor Fiscal Oficial
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Comprobante de Retención</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Visualización y generación de comprobantes de retención bajo normativa SENIAT.</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
             <button onClick={() => setShowModal(true)} className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
                <Plus size={14} /> Nuevo Comprobante
             </button>
             <button onClick={() => window.print()} className="bg-white text-[#0b5156] px-6 py-2.5 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <Printer size={14} /> Imprimir para Archivo
             </button>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
           <div className="relative flex-1 max-w-sm">
             <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
             <input 
               type="text" 
               placeholder="Buscar Comprobante por Nro..." 
               value={voucherId}
               onChange={(e) => setVoucherId(e.target.value)}
               className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156] shadow-sm" 
             />
           </div>
        </div>
      </header>

      {/* Official Paper View */}
      <section className="flex justify-center bg-slate-900/5 py-12 rounded-[2.5rem] print:bg-white print:py-0 print:rounded-none">
        {isLoading ? (
           <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse">
             Cargando Comprobante...
           </div>
        ) : voucherData || !voucherId ? (
          <div className="bg-white w-[800px] min-h-[1000px] p-[50px] shadow-2xl border border-slate-200 print:shadow-none print:border-none print:w-full print:p-0">
            {/* Paper Header */}
            <header className="flex justify-between items-start border-b-[3px] border-black pb-4 mb-8">
              <div className="text-black space-y-1">
                 <h2 className="text-lg font-black uppercase tracking-tight leading-none">{perfil?.razon_social || 'KODA ERP SOLUTIONS, C.A.'}</h2>
                 <p className="text-[10px] font-black">R.I.F.: {perfil?.rif || 'J-40000000-0'}</p>
                 <p className="text-[9px] font-bold max-w-[300px]">Av. Principal de Las Mercedes, Edif. Koda, Piso 5. Caracas, D.C. Venezuela.</p>
                 <p className="text-[9px] font-bold">Teléfonos: {perfil?.telefono || '+58 (212) 555-0100'}</p>
              </div>
              <div className="text-right">
                 <h1 className="text-[10px] font-black uppercase tracking-widest text-black/60 mb-1">Comprobante de Retención IVA</h1>
                 <span className="text-xl font-black text-black block leading-none">{voucherData?.numero_comprobante || '202604000001'}</span>
                 <div className="text-[10px] font-black uppercase mt-2">Fecha: {voucherData?.fecha_emision || '24/04/2026'}</div>
              </div>
            </header>

            {/* Fiscal Info Grid */}
            <div className="grid grid-cols-2 border-[1.5px] border-black mb-8">
               <div className="col-span-2 bg-slate-50 p-3 border-b border-black">
                  <span className="text-[8px] font-black uppercase text-slate-400 block mb-0.5">Nombre o Razón Social del Agente de Retención</span>
                  <strong className="text-xs font-black text-black uppercase">{perfil?.razon_social || 'KODA ERP SOLUTIONS, C.A.'} (Contribuyente Especial)</strong>
               </div>
               <div className="p-3 border-r border-black border-b">
                  <span className="text-[8px] font-black uppercase text-slate-400 block mb-0.5">Registro de Información Fiscal (R.I.F.)</span>
                  <strong className="text-xs font-black text-black">{perfil?.rif || 'J-40000000-0'}</strong>
               </div>
               <div className="p-3 border-b border-black">
                  <span className="text-[8px] font-black uppercase text-slate-400 block mb-0.5">Período Impositivo</span>
                  <strong className="text-xs font-black text-black uppercase">Mes: {voucherData?.periodo?.mes || '04'} | Año: {voucherData?.periodo?.anio || '2026'}</strong>
               </div>
               <div className="col-span-2 p-3 border-b border-black">
                  <span className="text-[8px] font-black uppercase text-slate-400 block mb-0.5">Nombre o Razón Social del Proveedor (Sujeto Retenido)</span>
                  <strong className="text-xs font-black text-black uppercase">{voucherData?.proveedor?.nombre || 'SUMINISTROS INDUSTRIALES, C.A.'}</strong>
               </div>
               <div className="p-3 border-r border-black">
                  <span className="text-[8px] font-black uppercase text-slate-400 block mb-0.5">Registro de Información Fiscal (R.I.F.)</span>
                  <strong className="text-xs font-black text-black">{voucherData?.proveedor?.rif || 'J-40552312-0'}</strong>
               </div>
               <div className="p-3">
                  <span className="text-[8px] font-black uppercase text-slate-400 block mb-0.5">Dirección Fiscal del Proveedor</span>
                  <p className="text-[9px] font-bold text-black uppercase leading-tight">{voucherData?.proveedor?.direccion || 'Zona Ind. Municipal Norte, Galpón 44, Valencia, Edo. Carabobo.'}</p>
               </div>
            </div>

            {/* Transactions Table */}
            <table className="w-full border-collapse border border-black text-[10px]">
              <thead className="bg-black text-white">
                 <tr className="uppercase font-black text-[8px]">
                    <th className="border border-black p-2 text-center">Op.</th>
                    <th className="border border-black p-2 text-center">Fecha</th>
                    <th className="border border-black p-2 text-center">N° Factura</th>
                    <th className="border border-black p-2 text-center">N° Control</th>
                    <th className="border border-black p-2 text-right">Monto Total</th>
                    <th className="border border-black p-2 text-right">Exento</th>
                    <th className="border border-black p-2 text-right">Base</th>
                    <th className="border border-black p-2 text-center">%</th>
                    <th className="border border-black p-2 text-right">IVA</th>
                    <th className="border border-black p-2 text-right">Retenido</th>
                 </tr>
              </thead>
              <tbody className="font-bold text-black">
                 {voucherData?.operaciones?.length > 0 ? voucherData.operaciones.map((op: any, i: number) => (
                   <tr key={i}>
                      <td className="border border-black p-2 text-center">{(i+1).toString().padStart(2, '0')}</td>
                      <td className="border border-black p-2 text-center">{op.fecha}</td>
                      <td className="border border-black p-2 text-center">{op.factura}</td>
                      <td className="border border-black p-2 text-center">{op.control}</td>
                      <td className="border border-black p-2 text-right font-mono">{formatCurrency(op.total)}</td>
                      <td className="border border-black p-2 text-right font-mono">{formatCurrency(op.exento)}</td>
                      <td className="border border-black p-2 text-right font-mono">{formatCurrency(op.base)}</td>
                      <td className="border border-black p-2 text-center">{op.porcentaje}</td>
                      <td className="border border-black p-2 text-right font-mono">{formatCurrency(op.iva)}</td>
                      <td className="border border-black p-2 text-right font-mono">{formatCurrency(op.retenido)}</td>
                   </tr>
                 )) : (
                   <tr>
                      <td colSpan={10} className="border border-black p-4 text-center uppercase tracking-widest text-slate-400">
                         No hay operaciones registradas para este comprobante
                      </td>
                   </tr>
                 )}
                 <tr className="bg-white font-black">
                    <td colSpan={4} className="border border-black p-3 text-right uppercase">Totales Acumulados (Bs.):</td>
                    <td className="border border-black p-3 text-right font-mono">{formatCurrency(voucherData?.totales?.total || 0)}</td>
                    <td className="border border-black p-3 text-right font-mono">{formatCurrency(voucherData?.totales?.exento || 0)}</td>
                    <td className="border border-black p-3 text-right font-mono">{formatCurrency(voucherData?.totales?.base || 0)}</td>
                    <td className="border border-black p-3 text-center">-</td>
                    <td className="border border-black p-3 text-right font-mono">{formatCurrency(voucherData?.totales?.iva || 0)}</td>
                    <td className="border border-black p-3 text-right font-mono">{formatCurrency(voucherData?.totales?.retenido || 0)}</td>
                 </tr>
              </tbody>
            </table>

            {/* Signatures */}
            <div className="grid grid-cols-2 gap-24 items-start mt-20 text-center">
               <div className="border-t-2 border-black pt-3">
                  <span className="text-[10px] font-black uppercase text-black">Firma y Sello del Agente</span>
               </div>
               <div className="border-t-2 border-black pt-3">
                  <span className="text-[10px] font-black uppercase text-black">Firma y Sello del Receptor</span>
               </div>
            </div>

            {/* Legal Footer */}
            <footer className="mt-16 border-t border-black pt-4 text-justify text-[8px] font-bold text-black/70 leading-relaxed uppercase">
              ESTE COMPROBANTE SE EMITE SEGÚN LO ESTABLECIDO EN LA PROVIDENCIA ADMINISTRATIVA SNAT/2005/0056 PUBLICADA EN GACETA OFICIAL N° 38.133 DE FECHA 23 DE FEBRERO DE 2005, QUE ESTABLECE LAS NORMAS RELATIVAS A LA RETENCIÓN DEL IMPUESTO AL VALOR AGREGADO. ESTE DOCUMENTO ES SOPORTE FISCAL VÁLIDO PARA EL CRÉDITO O DÉBITO FISCAL CORRESPONDIENTE. DOCUMENTO GENERADO POR KODA ERP SOLUTIONS.
            </footer>
          </div>
        ) : (
          <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest">
            Comprobante no encontrado
          </div>
        )}
      </section>

      {/* Generator Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300 print:hidden">
           <div className="bg-white w-[500px] max-w-full rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden">
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-[#0b5156]/5">
                 <div className="space-y-1">
                    <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">Generar Comprobante Oficial</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Emisión bajo normativa SENIAT Providencia 0056.</p>
                 </div>
                 <button onClick={() => setShowModal(false)} className="p-2 bg-white text-slate-400 rounded-xl hover:text-red-500 transition-colors">
                    <X size={20} />
                 </button>
              </div>
              
              <div className="p-8 space-y-8">
                 <div className="grid grid-cols-2 gap-6 items-start">
                    <div className="space-y-1">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha de Emisión</label>
                       <input 
                        type="date" 
                        value={compDate} 
                        onChange={(e) => setCompDate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156]" 
                       />
                    </div>
                    <div className="space-y-1">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Período Fiscal</label>
                       <div className="flex gap-2">
                          <select 
                            value={compMonth} 
                            onChange={(e) => setCompMonth(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[10px] font-black text-[#0b5156] uppercase outline-none focus:border-[#0b5156]"
                          >
                             {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map(m => (
                               <option key={m} value={m}>{m}</option>
                             ))}
                          </select>
                          <input 
                            type="number" 
                            value={compYear} 
                            onChange={(e) => setCompYear(e.target.value)}
                            className="w-24 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-black text-[#0b5156] outline-none focus:border-[#0b5156]" 
                          />
                       </div>
                    </div>
                 </div>

                 <div className="bg-[#0b5156] p-3 rounded-xl text-center shadow-inner relative overflow-hidden group">
                    <span className="text-white/40 text-[9px] font-black uppercase tracking-[0.2em] block mb-1">Número de Comprobante Sugerido</span>
                    <h3 className={`text-xl font-black text-white tracking-[0.3em] font-mono leading-none relative z-10 transition-opacity ${isInvalid() ? 'opacity-30' : 'opacity-100'}`}>
                       {getCompNumber()}
                    </h3>
                    <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-white/5 rounded-full group-hover:scale-150 transition-transform duration-700"></div>
                 </div>

                 {isInvalid() && (
                   <div className="p-4 bg-red-50 rounded-2xl border border-red-100 flex gap-3 animate-in shake duration-500">
                      <AlertCircle size={18} className="text-red-500 shrink-0" />
                      <p className="text-[10px] font-bold text-red-700 uppercase leading-relaxed">
                        <strong className="block">❌ Bloqueo Fiscal:</strong>
                        El período impositivo no coincide con la fecha de emisión. La normativa SENIAT exige coincidencia de período para retenciones de IVA.
                      </p>
                   </div>
                 )}

                 <button 
                  onClick={handleDownloadOfficialPDF}
                  disabled={isInvalid() || isGenerating}
                  className="w-full bg-[#0b5156] text-white font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-xl hover:scale-[1.02] active:scale-95 disabled:opacity-30 disabled:hover:scale-100 transition-all flex items-center justify-center gap-2"
                 >
                    <Download size={16} /> {isGenerating ? 'Generando y Firmando...' : 'Emitir y Descargar PDF'}
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default RetentionVoucher;
