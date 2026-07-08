import { 
  FileDigit,
  Link as LinkIcon,
  Download,
  AlertTriangle,
  Settings2,
  Printer,
  History,
  CheckCircle2,
  XCircle,
  Activity
} from 'lucide-react';

const NumberingControl = () => {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <span className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest inline-block mb-2">
              Administración / Inteligencia Fiscal
            </span>
            <h1 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">
              Control de Correlativos
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">
              Monitor proactivo de folios, proyección de agotamiento y estado de hardware fiscal.
            </p>
          </div>
          <div className="flex gap-3">
            <button className="bg-[#0b5156] text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
              <LinkIcon size={14} /> Vincular Nueva Serie
            </button>
            <button className="bg-white border border-slate-200 text-slate-700 px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-sm hover:bg-slate-50 transition-all">
              <Download size={14} /> Auditoría de Salto
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Main Area */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Folios Grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {/* Facturas */}
            <article className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-amber-500"></div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-black text-slate-800 uppercase tracking-tighter">Facturas de Venta</span>
                <span className="font-mono text-xs text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded">SERIE A</span>
              </div>
              <div className="grid grid-cols-2 gap-4 items-start mb-4">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Siguiente Nº</span>
                  <strong className="text-2xl font-black text-[#0b5156] font-mono tracking-tighter">00000000</strong>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Última Z</span>
                  <strong className="text-lg font-black text-slate-700 font-mono tracking-tighter">0</strong>
                </div>
              </div>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                  <span>Uso de Talonario</span>
                  <span>0%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="bg-amber-500 h-2 rounded-full" style={{ width: '0%' }}></div>
                </div>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl flex justify-between items-center border border-slate-100">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Agotamiento estimado:</span>
                <span className="text-xs font-black text-slate-400 uppercase">N/A</span>
              </div>
            </article>

            {/* Notas Crédito */}
            <article className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-[#0b5156]"></div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-black text-slate-800 uppercase tracking-tighter">Notas de Crédito</span>
                <span className="font-mono text-xs text-[#0b5156] font-bold bg-[#0b5156]/10 px-2 py-1 rounded">SERIE NC</span>
              </div>
              <div className="grid grid-cols-2 gap-4 items-start mb-4">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Siguiente Nº</span>
                  <strong className="text-2xl font-black text-[#0b5156] font-mono tracking-tighter">00000000</strong>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Última Z</span>
                  <strong className="text-lg font-black text-slate-700 font-mono tracking-tighter">0</strong>
                </div>
              </div>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                  <span>Uso de Talonario</span>
                  <span>0%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="bg-[#0b5156] h-2 rounded-full" style={{ width: '0%' }}></div>
                </div>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl flex justify-between items-center border border-slate-100">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Agotamiento estimado:</span>
                <span className="text-xs font-black text-slate-400 uppercase">N/A</span>
              </div>
            </article>
          </section>

          {/* Configuración Maestra de Series */}
          <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter mb-6">Configuración Maestra de Series</h3>
            
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <th className="pb-4 px-4">Documento</th>
                    <th className="pb-4 px-4">Prefijo</th>
                    <th className="pb-4 px-4">Sufijo</th>
                    <th className="pb-4 px-4">Longitud</th>
                    <th className="pb-4 px-4 text-center">Estado</th>
                    <th className="pb-4 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-center">
                  <tr>
                     <td colSpan={6} className="py-12">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sin series documentales configuradas</p>
                     </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

        </div>

        {/* Sidebar */}
        <aside className="lg:col-span-1 space-y-6">
          
          {/* Hardware Status */}
          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
               <Printer className="text-[#0b5156]" size={20} />
               <h4 className="text-sm font-black text-[#0b5156] uppercase tracking-tighter">Estado de Hardware</h4>
            </div>

            <div className="space-y-3">
              <div className="text-center p-4">
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sin impresoras fiscales vinculadas</p>
              </div>
            </div>

            <button className="w-full mt-6 bg-white border border-slate-200 text-[#0b5156] px-4 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all flex items-center justify-center gap-2 shadow-sm">
               <Activity size={14} /> Diagnóstico Fiscal
            </button>
          </div>

          {/* Audit Log */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
               <History className="text-slate-400" size={20} />
               <h4 className="text-sm font-black text-slate-600 uppercase tracking-tighter">Auditoría de Cambios</h4>
            </div>

            <div className="space-y-4">
               <div className="text-center p-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sin registros de auditoría</p>
               </div>
            </div>
          </div>

        </aside>

      </div>
    </div>
  );
};

export default NumberingControl;
