import { 
  Printer, 
  Mail, 
  QrCode
} from 'lucide-react';

const PaymentVoucher = () => {
  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden flex justify-between items-center print:hidden">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
              Pagos &gt; Comprobante
            </span>
          </div>
          <h1 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase">Voucher de Egreso</h1>
        </div>
        <div className="flex gap-3">
          <button onClick={() => window.print()} className="bg-slate-50 text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 hover:bg-white transition-all flex items-center gap-2">
            <Printer size={14} /> Imprimir PDF
          </button>
          <button className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
            <Mail size={14} /> Enviar al Proveedor
          </button>
        </div>
      </header>

      {/* Voucher Design */}
      <article className="max-w-4xl mx-auto bg-white border border-slate-200 shadow-2xl rounded-[2rem] overflow-hidden print:shadow-none print:border-none print:m-0">
        <div className="p-12 space-y-12">
          {/* Top: Branding & ID */}
          <div className="flex justify-between items-start border-b-2 border-[#0b5156] pb-8">
            <div className="space-y-2">
              <div className="text-2xl font-black text-[#0b5156] tracking-tighter uppercase">KODA ERP SYSTEMS</div>
              <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight tracking-widest">
                RIF: J-50129481-0<br />
                AV. PRINCIPAL EL ROSAL, CARACAS.
              </p>
            </div>
            <div className="text-right space-y-1">
              <h2 className="text-lg font-black text-slate-400 uppercase tracking-widest">Voucher de Pago</h2>
              <div className="text-3xl font-black text-[#0b5156] tracking-tighter font-mono">N° V-2026-00124</div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest mt-2">Fecha: 09/05/2026</p>
            </div>
          </div>

          {/* Info Sections */}
          <div className="grid grid-cols-2 gap-12 items-start">
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Información del Beneficiario</h3>
              <div className="space-y-3">
                <div className="space-y-0.5">
                  <span className="text-[9px] font-black text-slate-400 uppercase block">Proveedor</span>
                  <strong className="text-sm font-black text-[#0b5156] uppercase"></strong>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[9px] font-black text-slate-400 uppercase block">RIF</span>
                  <strong className="text-sm font-black text-[#0b5156] font-mono"></strong>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Información Bancaria</h3>
              <div className="space-y-3">
                <div className="space-y-0.5">
                  <span className="text-[9px] font-black text-slate-400 uppercase block">Banco Destino</span>
                  <strong className="text-sm font-black text-[#0b5156] uppercase"></strong>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[9px] font-black text-slate-400 uppercase block">Cuenta / Referencia</span>
                  <strong className="text-sm font-black text-[#0b5156] font-mono"></strong>
                </div>
              </div>
            </div>
          </div>

          {/* Invoices Table */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Detalle de Facturas Canceladas</h3>
            <div className="overflow-hidden border border-slate-100 rounded-2xl">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <th className="py-4 px-6">DOCUMENTO</th>
                    <th className="py-4 px-4 text-center">FECHA</th>
                    <th className="py-4 px-4 text-right">MONTO ORIGINAL</th>
                    <th className="py-4 px-4 text-right">RETENCIONES</th>
                    <th className="py-4 px-6 text-right">NETO PAGADO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">Sin facturas detalladas</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Retentions Table */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">Desglose de Retenciones Aplicadas</h3>
            <div className="overflow-hidden border border-slate-100 rounded-2xl">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <th className="py-4 px-6">TIPO</th>
                    <th className="py-4 px-4">N° COMPROBANTE</th>
                    <th className="py-4 px-4 text-right">BASE IMPONIBLE</th>
                    <th className="py-4 px-6 text-right">MONTO RETENIDO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">Sin retenciones aplicadas</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary & QR */}
          <div className="grid grid-cols-2 gap-12 items-start items-end pt-8 border-t border-slate-100">
            <div className="flex gap-6 items-center">
              <div className="w-24 h-24 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col items-center justify-center p-2 text-center">
                <QrCode size={48} className="text-slate-400" />
                <span className="text-[8px] font-black text-slate-300 uppercase mt-2">Validación Digital</span>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed">
                  Este documento es una representación impresa de una transacción digital validada por KODA ERP.
                </p>
                <p className="text-[10px] font-black text-slate-500 uppercase">
                  Tasa BCV de Referencia: <strong className="font-mono text-[#0b5156]">36.50 Bs/USD</strong>
                </p>
              </div>
            </div>
            <div className="bg-slate-50 p-8 rounded-3xl space-y-4">
              <div className="flex justify-between items-center text-xs font-black text-slate-400 uppercase">
                <span>Total Bruto:</span>
                <span className="font-mono text-[#0b5156]">$0.00</span>
              </div>
              <div className="flex justify-between items-center text-xs font-black text-red-600 uppercase">
                <span>Retenciones:</span>
                <span className="font-mono">-$0.00</span>
              </div>
              <div className="flex justify-between items-end pt-4 border-t border-slate-200">
                <span className="text-sm font-black text-[#0b5156] uppercase leading-none pb-1">Monto Neto:</span>
                <div className="text-right">
                  <div className="text-2xl font-black text-[#0b5156] font-mono tracking-tighter">$0.00</div>
                  <div className="text-[10px] font-black text-slate-400 uppercase font-mono mt-1">Eqv: Bs. 0.00</div>
                </div>
              </div>
            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-24 items-start pt-16">
            <div className="border-t-2 border-[#0b5156] pt-4 text-center">
              <span className="text-[10px] font-black text-[#0b5156] uppercase tracking-[0.2em]">Elaborado por</span>
            </div>
            <div className="border-t-2 border-[#0b5156] pt-4 text-center">
              <span className="text-[10px] font-black text-[#0b5156] uppercase tracking-[0.2em]">Recibido Conforme</span>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
};

export default PaymentVoucher;
