import { 
  Printer, 
  Download, 
  Search, 
  ArrowLeft,
  ShieldCheck,
  User,
  Calendar
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, BASE_URL } from '@/api/client';
import { useEmpresaPerfil } from '@/hooks/useEmpresaPerfil';

const ARCGenerator = () => {
  const { perfil } = useEmpresaPerfil();
  const currentYear = new Date().getFullYear();
  
  const [anio, setAnio] = useState(currentYear - 1);
  const [sujetos, setSujetos] = useState<any[]>([]);
  const [selectedSujeto, setSelectedSujeto] = useState('');
  
  const [data, setData] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchSujetos();
  }, [anio]);

  const fetchSujetos = async () => {
    try {
      const res = await api.get<any[]>(`/fiscal/arc/sujetos?anio=${anio}`);
      setSujetos(res || []);
      if (res && res.length > 0) {
        setSelectedSujeto(res[0].rif);
      } else {
        setSelectedSujeto('');
      }
    } catch (error) {
      console.error("Error fetching sujetos para ARC:", error);
      setSujetos([]);
    }
  };

  const handleGenerarVistaPrevia = async () => {
    if (!selectedSujeto) return;
    try {
      setIsLoading(true);
      const res = await api.get<any>(`/fiscal/arc?anio=${anio}&sujeto=${selectedSujeto}`);
      setData(res || null);
    } catch (error) {
      console.error("Error fetching ARC data:", error);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadOfficialPDF = async () => {
    if (!selectedSujeto) return;
    try {
      setIsGenerating(true);
      const token = localStorage.getItem('koda_token') || localStorage.getItem('sgd_token');
      const res = await fetch(`${BASE_URL}/fiscal/arc/exportar?formato=pdf&anio=${anio}&sujeto=${selectedSujeto}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('Error al descargar PDF');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comprobante_arc_${selectedSujeto}_${anio}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) {
      console.error(error);
      alert('Error al generar PDF oficial.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportXML = async () => {
    if (!selectedSujeto) return;
    try {
      const token = localStorage.getItem('koda_token') || localStorage.getItem('sgd_token');
      const res = await fetch(`${BASE_URL}/fiscal/arc/exportar?formato=xml&anio=${anio}&sujeto=${selectedSujeto}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('Error al descargar XML');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comprobante_arc_${selectedSujeto}_${anio}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) {
      console.error(error);
      alert('Error al generar XML.');
    }
  };

  const formatCurrency = (val: number | string | undefined | null) => {
    if (val === undefined || val === null) return "0.00";
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return val;
    return num.toLocaleString('es-VE', { minimumFractionDigits: 2 });
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-500 pb-20 print:bg-white print:p-0">
      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden print:hidden">
        <div className="flex justify-between items-start mb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <Link to="/fiscal" className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-[#0b5156]/20 transition-all">
                <ArrowLeft size={10} /> Volver a Fiscal
              </Link>
              <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Generador de Comprobante ARC
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Generador de Comprobante ARC</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Consolidado anual de retenciones de impuesto sobre la renta para proveedores y empleados.</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
             <button 
               onClick={handleDownloadOfficialPDF} 
               disabled={isGenerating || !data}
               className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
             >
                <Printer size={14} /> {isGenerating ? 'Firmando Documento...' : 'Descargar PDF Oficial'}
             </button>
             <button onClick={handleExportXML} disabled={!data} className="bg-white text-[#0b5156] px-6 py-2.5 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all disabled:opacity-70 disabled:cursor-not-allowed">
                <Download size={14} /> Exportar XML
             </button>
          </div>
        </div>
      </header>

      {/* Filters */}
      <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm print:hidden">
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            <div className="space-y-1">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Proveedor / Sujeto Pasivo</label>
               <div className="relative">
                  <User className="absolute left-3 top-3 text-slate-400" size={14} />
                     <select 
                      value={selectedSujeto}
                      onChange={(e) => setSelectedSujeto(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-black text-[#0b5156] uppercase outline-none focus:border-[#0b5156]"
                    >
                    {sujetos.length > 0 ? sujetos.map((s: any) => (
                      <option key={s.rif} value={s.rif}>{s.nombre} ({s.rif})</option>
                    )) : (
                      <option value="">Sin sujetos con retenciones</option>
                    )}
                  </select>
               </div>
            </div>
            <div className="space-y-1">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Año Fiscal</label>
               <div className="relative">
                  <Calendar className="absolute left-3 top-3 text-slate-400" size={14} />
                     <select 
                      value={anio}
                      onChange={(e) => setAnio(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-black text-[#0b5156] uppercase outline-none focus:border-[#0b5156]"
                    >
                    {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
               </div>
            </div>
            <div className="flex items-end">
                  <button onClick={handleGenerarVistaPrevia} disabled={isLoading || !selectedSujeto} className="w-full bg-[#0b5156]/10 text-[#0b5156] font-black py-2.5 rounded-xl uppercase text-[10px] tracking-widest hover:bg-[#0b5156] hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  <Search size={14} /> {isLoading ? 'Generando...' : 'Generar Vista Previa'}
               </button>
            </div>
         </div>
      </article>

      {/* Official Paper View */}
      {data ? (
        <section className="flex justify-center bg-slate-900/5 py-12 rounded-[2.5rem] print:bg-white print:py-0 print:rounded-none">
          <div className="bg-white w-[850px] min-h-[1100px] p-[60px] shadow-2xl border border-slate-200 print:shadow-none print:border-none print:w-full">
            <style dangerouslySetInnerHTML={{__html: `
              @media print {
                body > * { display: none !important; }
                section { display: flex !important; position: absolute; left: 0; top: 0; width: 100%; justify-content: center; }
              }
            `}} />
            {/* Header Paper */}
            <div className="border-b-2 border-black pb-8 mb-10">
              <div className="flex justify-between items-start mb-3">
                 <div className="text-black space-y-1">
                    <strong className="text-lg font-black uppercase tracking-tighter">{perfil?.razon_social || 'EMPRESA NO DEFINIDA'}</strong>
                    <p className="text-[10px] font-bold">R.I.F.: {perfil?.rif || 'J-00000000-0'}</p>
                 </div>
                 <div className="text-right">
                    <span className="text-[9px] font-black uppercase text-slate-400">Fecha de Emisión: {new Date().toLocaleDateString('es-VE')}</span>
                 </div>
              </div>
              <div className="text-center">
                 <h2 className="text-xl font-black uppercase tracking-tighter text-black">Comprobante de Retenciones Varias (ARC)</h2>
                 <p className="text-sm font-black text-black/60 tracking-widest">EJERCICIO FISCAL: {anio}</p>
              </div>
            </div>

            {/* Subject Details */}
            <div className="grid grid-cols-2 border border-black mb-10 overflow-hidden">
               <div className="col-span-2 bg-slate-50 p-4 border-b border-black">
                  <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">Nombre o Razón Social del Agente de Retención</span>
                  <strong className="text-sm font-black text-black uppercase">{perfil?.razon_social}</strong>
               </div>
               <div className="col-span-2 p-4 border-b border-black">
                  <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">Nombre o Razón Social del Sujeto Retenido</span>
                  <strong className="text-sm font-black text-black uppercase">{data.sujeto?.nombre || selectedSujeto}</strong>
               </div>
               <div className="p-4 border-r border-black">
                  <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">Registro de Información Fiscal (R.I.F.)</span>
                  <strong className="text-sm font-black text-black">{data.sujeto?.rif || selectedSujeto}</strong>
               </div>
               <div className="p-4 bg-slate-50/50">
                  <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">Total Retenido en el Ejercicio</span>
                  <strong className="text-xl font-black text-black">Bs. {formatCurrency(data.totales?.retenido || 0)}</strong>
               </div>
            </div>

            {/* Table Paper */}
            <table className="w-full border-collapse border border-black text-[11px]">
              <thead>
                 <tr className="bg-white uppercase font-black text-[9px]">
                    <th className="border border-black p-3 text-center">Mes</th>
                    <th className="border border-black p-3 text-left">Concepto</th>
                    <th className="border border-black p-3 text-right">Base Imponible</th>
                    <th className="border border-black p-3 text-center">% Ret.</th>
                    <th className="border border-black p-3 text-right">Sustraendo</th>
                    <th className="border border-black p-3 text-right">Monto Retenido</th>
                 </tr>
              </thead>
              <tbody className="font-bold text-black">
                 {data.detalles && data.detalles.length > 0 ? data.detalles.map((row: any, i: number) => (
                   <tr key={i}>
                      <td className="border border-black p-3 text-center uppercase">{row.mes}</td>
                      <td className="border border-black p-3 text-left uppercase">{row.concepto}</td>
                      <td className="border border-black p-3 text-right font-mono">{formatCurrency(row.base)}</td>
                      <td className="border border-black p-3 text-center">{row.porcentaje}</td>
                      <td className="border border-black p-3 text-right font-mono">{formatCurrency(row.sustraendo)}</td>
                      <td className="border border-black p-3 text-right font-mono">{formatCurrency(row.retenido)}</td>
                   </tr>
                 )) : (
                   <tr>
                     <td colSpan={6} className="border border-black p-6 text-center uppercase text-slate-400 font-black tracking-widest">No hay retenciones para este sujeto en el ejercicio seleccionado</td>
                   </tr>
                 )}
                 {data.detalles && data.detalles.length > 0 && (
                   <tr className="bg-white font-black">
                      <td colSpan={2} className="border border-black p-4 uppercase text-center">Totales Acumulados:</td>
                      <td className="border border-black p-4 text-right font-mono">{formatCurrency(data.totales?.base || 0)}</td>
                      <td className="border border-black p-4 text-center">-</td>
                      <td className="border border-black p-4 text-right font-mono">{formatCurrency(data.totales?.sustraendo || 0)}</td>
                      <td className="border border-black p-4 text-right font-mono text-lg">{formatCurrency(data.totales?.retenido || 0)}</td>
                   </tr>
                 )}
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
            <footer className="mt-20 border-t border-black pt-6 text-justify text-[9px] font-bold text-black/70 leading-relaxed uppercase">
              Este comprobante se emite de conformidad con lo dispuesto en el artículo 24 del Reglamento Parcial de la Ley de Impuesto sobre la Renta en materia de Retenciones, publicado en la Gaceta Oficial N° 36.203 de fecha 12 de mayo de 1997. Documento generado electrónicamente por Sistema KODA ERP Solutions.
            </footer>
          </div>
        </section>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-10 text-center print:hidden">
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Seleccione un sujeto y año fiscal para generar la vista previa del comprobante ARC.</p>
        </div>
      )}

      {/* Bottom Advice */}
      <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 flex gap-4 print:hidden">
        <ShieldCheck size={24} className="text-[#0b5156] shrink-0" />
        <div className="space-y-1">
          <h4 className="text-sm font-black text-[#0b5156] uppercase">Validez Jurídica del Documento</h4>
          <p className="text-[10px] text-slate-500 font-bold uppercase leading-relaxed opacity-80">
            El comprobante ARC es un documento de cumplimiento obligatorio que debe entregarse a los proveedores antes de finalizar el mes de enero del ejercicio siguiente. KODA consolida automáticamente todos los pagos y retenciones del año para este reporte.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ARCGenerator;
