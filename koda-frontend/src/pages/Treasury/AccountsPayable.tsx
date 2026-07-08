import { 
  Search, 
  Filter, 
  ArrowLeft,
  Landmark,
  FileText,
  Calendar,
  Download,
  ShieldCheck,
  FileSpreadsheet,
  Clock
} from 'lucide-react';
import { Link } from 'react-router-dom';

const AccountsPayable = () => {
  const stats = [
    { label: 'Cuentas por Pagar', value: '$24,800.00', desc: 'Obligaciones totales', color: 'text-slate-800' },
    { label: 'A Pagar (7 días)', value: '$6,200.00', desc: 'Requisición de flujo', color: 'text-amber-500' },
    { label: 'Crédito Fiscal IVA', value: 'Bs. 12,450.00', desc: 'Acumulado a favor', color: 'text-koda-main' },
    { label: 'Retenciones Pend.', value: '14 Comp.', desc: 'Entregar a proveedores', color: 'text-blue-600' },
  ];

  const payables = [
    { supplier: 'Suministros Industriales C.A.', rif: 'J-40552312-0', invoice: '001452', control: '00-001452', date: '10/05/2026', amount: '$1,160.00', tax: 'Bs. 1,600.00', status: 'Verificada', statusColor: 'bg-green-100 text-green-700' },
    { supplier: 'Importadora Global S.A.', rif: 'J-31224455-8', invoice: '000889', control: '00-000889', date: '08/05/2026', amount: '$4,200.00', tax: 'Bs. 5,400.00', status: 'Pend. Retención', statusColor: 'bg-amber-100 text-amber-700' },
    { supplier: 'Servicios de Transporte', rif: 'J-29887766-1', invoice: '005421', control: '00-005421', date: '01/05/2026', amount: '$850.00', tax: 'Bs. 1,150.00', status: 'Vencida', statusColor: 'bg-red-100 text-red-700' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
           <Landmark size={120} className="text-koda-main" />
        </div>
        <div className="flex justify-between items-start mb-6 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-koda-main text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Compras y Proveedores
              </span>
            </div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Cuentas por Pagar</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-3xl leading-relaxed">
              Gestión de obligaciones con proveedores, control de vencimientos e integración con el Libro de Compras (SENIAT).
            </p>
          </div>
          <div className="flex gap-2">
             <button className="bg-white text-slate-500 px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 border border-slate-200 hover:bg-slate-50 transition-all tracking-widest shadow-sm">
                <Clock size={14} /> Proyección de Pagos
             </button>
             <button className="bg-koda-main text-white px-8 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-koda-mainHover transition-all tracking-widest">
                <FileText size={16} /> Cargar Factura Compra
             </button>
          </div>
        </div>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-36 group hover:border-koda-main/30 transition-all">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest group-hover:text-koda-main transition-colors">{stat.label}</p>
            <div className="space-y-1">
              <strong className={`text-3xl font-black ${stat.color} tracking-tighter font-mono`}>{stat.value}</strong>
              <p className="text-sm font-bold text-slate-400 uppercase leading-tight">{stat.desc}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Main Table */}
        <article className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
           <div className="flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Facturas de Proveedores</h3>
              <div className="flex gap-3">
                 <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input 
                      type="text" 
                      placeholder="Proveedor o Factura..." 
                      className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-koda-main w-64"
                    />
                 </div>
                 <button className="p-2 bg-slate-50 text-slate-400 rounded-xl border border-slate-200 hover:bg-white transition-all"><Filter size={14} /></button>
              </div>
           </div>

           <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left">
                 <thead>
                    <tr className="text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                       <th className="py-4 px-6">Proveedor / Factura</th>
                       <th className="py-4 px-4 text-center">Fecha Doc.</th>
                       <th className="py-4 px-4 text-right">Total a Pagar</th>
                       <th className="py-4 px-4 text-right">IVA Soportado</th>
                       <th className="py-4 px-4 text-center">Estado CxP</th>
                       <th className="py-4 px-6 text-right">Acción</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {payables.map((p, i) => (
                      <tr key={i} className="group hover:bg-slate-50 transition-colors">
                         <td className="py-5 px-6">
                            <div className="flex flex-col">
                               <span className="text-xs font-black text-slate-800 uppercase truncate max-w-[180px]">{p.supplier}</span>
                               <div className="flex gap-2 items-center mt-0.5">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase">{p.rif}</span>
                                  <span className="text-[9px] font-black text-koda-main uppercase bg-koda-main/10 px-1 rounded">FAC: {p.invoice}</span>
                               </div>
                            </div>
                         </td>
                         <td className="py-5 px-4 text-center text-xs font-bold text-slate-600 font-mono">{p.date}</td>
                         <td className="py-5 px-4 text-right text-sm font-black text-slate-800 font-mono">{p.amount}</td>
                         <td className="py-5 px-4 text-right text-xs font-black text-slate-400 font-mono">{p.tax}</td>
                         <td className="py-5 px-4 text-center">
                            <span className={`${p.statusColor} text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter`}>{p.status}</span>
                         </td>
                         <td className="py-5 px-6 text-right">
                            <button className="bg-slate-50 text-slate-500 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border border-slate-200 hover:bg-white transition-all">
                               Liquidar
                            </button>
                         </td>
                      </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </article>

        {/* SENIAT Fiscal Integration Sidebar */}
        <aside className="space-y-6">
           <article className="bg-koda-main p-8 rounded-3xl text-white shadow-xl relative overflow-hidden group">
              <FileSpreadsheet size={140} className="absolute -bottom-6 -right-6 opacity-10 group-hover:scale-110 transition-transform" />
              <div className="relative z-10 space-y-4">
                 <div className="flex items-center gap-2">
                    <ShieldCheck size={20} className="text-white" />
                    <h3 className="text-lg font-black uppercase tracking-tight">Libro de Compras SENIAT</h3>
                 </div>
                 <div className="space-y-2">
                    <p className="text-sm font-bold uppercase leading-relaxed opacity-90">
                       Generación automática del archivo TXT y reporte de Excel con la estructura de columnas exigida por la normativa vigente.
                    </p>
                 </div>
                 
                 <div className="bg-white/10 p-4 rounded-xl border border-white/20 mt-4 space-y-3">
                    <div className="flex justify-between items-center text-xs font-black uppercase tracking-widest">
                       <span>Periodo:</span>
                       <span className="font-mono">Mayo 2026</span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-black uppercase tracking-widest">
                       <span>Facturas Registradas:</span>
                       <span className="font-mono">142</span>
                    </div>
                 </div>

                 <button className="w-full bg-white text-koda-main font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-lg hover:scale-105 transition-all flex items-center justify-center gap-2 mt-4">
                    <Download size={16} /> Descargar Archivo TXT
                 </button>
              </div>
           </article>

           <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                 <Calendar size={20} className="text-koda-main" /> Calendario Fiscal
              </h3>
              <div className="space-y-4">
                 <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex flex-col gap-2">
                    <span className="text-xs font-black text-amber-800 uppercase">Declaración de IVA Quincenal</span>
                    <p className="text-[10px] font-bold text-amber-700/80 uppercase leading-relaxed">
                       Recuerde procesar los comprobantes de retención antes de emitir el TXT de compras para evitar multas por extemporaneidad.
                    </p>
                 </div>
              </div>
           </article>
        </aside>
      </div>
    </div>
  );
};

export default AccountsPayable;