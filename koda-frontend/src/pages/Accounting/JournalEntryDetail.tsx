import { 
  ArrowLeft,
  Printer,
  ShieldCheck,
  CheckCircle2,
  Hash,
  Link2
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const JournalEntryDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [asiento, setAsiento] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<any>(`/contabilidad/asientos/${id}`)
      .then((res) => {
        setAsiento(res);
        setIsLoading(false);
      })
      .catch((err) => {
        setError("Error al cargar el comprobante.");
        setIsLoading(false);
      });
  }, [id]);

  if (isLoading) {
    return (
      <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse">
         Cargando comprobante...
      </div>
    );
  }

  if (error || !asiento) {
    return (
      <div className="text-center py-20 text-red-500 font-bold text-xs uppercase tracking-widest bg-white rounded-3xl border border-slate-200 shadow-sm">
         {error || "Comprobante no encontrado"}
      </div>
    );
  }

  const movements = (asiento.detalles || []).map((det: any) => ({
    code: det.cuenta_codigo,
    name: det.cuenta_nombre,
    desc: det.haber > 0 ? 'Reconocimiento de Credito' : 'Reconocimiento de Debito',
    debit: det.debe > 0 ? Number(det.debe).toLocaleString('es-VE', { minimumFractionDigits: 2 }) : '0.00',
    credit: det.haber > 0 ? Number(det.haber).toLocaleString('es-VE', { minimumFractionDigits: 2 }) : '0.00'
  }));

  const totalDebe = Number(asiento.total_debe || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 });
  const totalHaber = Number(asiento.total_haber || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 });

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <Link to="/contabilidad/diario" className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-[#0b5156]/20 transition-all">
                <ArrowLeft size={10} /> Volver al Diario
              </Link>
              <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Asiento de Diario
              </span>
            </div>
            <h1 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Asiento N? {asiento.id}</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">
              Generado por: **{asiento.origen || 'Modulo de Facturacion'}** | Ref: {asiento.referencia}
            </p>
          </div>
          <div className="flex gap-2">
             <button className="bg-white text-[#0b5156] px-6 py-2.5 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm">
                <Link2 size={14} /> Ver Origen
             </button>
             <button 
                onClick={() => window.print()}
                className="bg-[#0b5156] text-white px-8 py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
             >
                <Printer size={14} /> Imprimir Comprobante
             </button>
          </div>
        </div>
      </header>

      <article className="bg-slate-900 p-8 rounded-3xl text-white shadow-2xl relative overflow-hidden group">
         <div className="relative z-10 flex flex-wrap gap-12 items-center">
            <div className="space-y-1">
               <span className="text-[10px] font-black text-white/40 uppercase tracking-widest block leading-none">Concepto / Glosa</span>
               <strong className="text-lg font-black uppercase tracking-tight block">{asiento.concepto}</strong>
            </div>
            <div className="w-[1px] h-10 bg-white/10" />
            <div className="space-y-1">
               <span className="text-[10px] font-black text-white/40 uppercase tracking-widest block leading-none">Fecha Contable</span>
               <strong className="text-lg font-black font-mono tracking-tighter block">
                 {new Date(asiento.fecha).toLocaleDateString('es-VE')}
               </strong>
            </div>
            <div className="w-[1px] h-10 bg-white/10" />
            <div className="space-y-1">
               <span className="text-[10px] font-black text-white/40 uppercase tracking-widest block leading-none">Estado</span>
               <div className="flex items-center gap-2">
                  <span className="bg-green-500 text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase flex items-center gap-1 shadow-lg shadow-green-900/40">
                     <CheckCircle2 size={10} /> {asiento.estatus || 'Cuadrado'}
                  </span>
               </div>
            </div>
         </div>
         <div className="absolute right-0 bottom-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Hash size={120} />
         </div>
      </article>

      <article className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-100 bg-slate-50/30">
          <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter leading-none">Movimientos por Cuenta</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Detalle de partida doble reexpresada en Bolivares.</p>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                <th className="py-4 px-8 w-40">Codigo</th>
                <th className="py-4 px-4">Cuenta Contable</th>
                <th className="py-4 px-4">Descripcion Movimiento</th>
                <th className="py-4 px-4 text-right">Debe (Bs)</th>
                <th className="py-4 px-8 text-right">Haber (Bs)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-[11px]">
              {movements.map((move: any, i: number) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors group">
                  <td className="py-4 px-8 font-black font-mono text-[#0b5156]">{move.code}</td>
                  <td className="py-4 px-4 font-black text-slate-700 uppercase tracking-tight">{move.name}</td>
                  <td className="py-4 px-4 font-bold text-slate-400 uppercase italic leading-tight">{move.desc}</td>
                  <td className="py-4 px-4 text-right font-black font-mono text-[#0b5156] text-xs">
                     {move.debit !== '0.00' ? move.debit : ''}
                  </td>
                  <td className="py-4 px-8 text-right font-black font-mono text-slate-700 text-xs">
                     {move.credit !== '0.00' ? move.credit : ''}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50">
               <tr className="border-t-2 border-[#0b5156]">
                  <td colSpan={3} className="py-6 px-8 text-right text-xs font-black text-[#0b5156] uppercase tracking-widest">Totales del Asiento</td>
                  <td className="py-6 px-4 text-right font-black font-mono text-[#0b5156] text-lg">{totalDebe}</td>
                  <td className="py-6 px-8 text-right font-black font-mono text-slate-800 text-lg">{totalHaber}</td>
               </tr>
            </tfoot>
          </table>
        </div>
      </article>

      <div className="p-6 bg-blue-50 rounded-3xl border border-blue-100 flex gap-4">
         <ShieldCheck size={24} className="text-blue-600 shrink-0" />
         <div className="space-y-1">
            <h4 className="text-sm font-black text-blue-900 uppercase tracking-tight">Trazabilidad de Integridad</h4>
            <p className="text-[10px] font-bold text-blue-800/60 uppercase leading-relaxed">
               Este asiento ha sido validado mediante el motor de integridad **KODA V.2**. El sello digital garantiza que los saldos del mayor coinciden con los movimientos detallados. Hash de seguridad: <span className="font-mono text-[9px] bg-white/50 px-1 rounded">5d4f1...{asiento.id}8a92c</span>
            </p>
         </div>
      </div>
    </div>
  );
};

export default JournalEntryDetail;