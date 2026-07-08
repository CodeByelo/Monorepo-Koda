import { useState, useEffect } from 'react';
import { FileText, Plus, BookOpen, Search, Filter, AlertTriangle, CheckCircle, Clock, TrendingUp, MoreVertical, X } from 'lucide-react';
import { api } from '@/api/client';
import { QuotationForm } from './QuotationForm';

const Quotations = () => {
  const [showModal, setShowModal] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [selectedCot, setSelectedCot] = useState<any>(null);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [activeDropdownId, setActiveDropdownId] = useState<any | null>(null);

  const toggleDropdown = (cotId: any) => {
    if (activeDropdownId === cotId) {
      setActiveDropdownId(null);
    } else {
      setActiveDropdownId(cotId);
    }
  };

  const handleUpdateStatus = async (cot: any, newStatus: string) => {
    setActiveDropdownId(null);
    try {
      const targetId = cot.id_db || cot.id;
      const response = await api.patch<any>(`/ventas/cotizaciones/${targetId}/estado`, { estado: newStatus });
      
      setQuotations(prev => prev.map(q => {
        const qId = q.id_db || q.id;
        if (qId === targetId) {
          return {
            ...q,
            estado: response.estado,
            status: response.status || response.estado,
            statusColor: response.statusColor
          };
        }
        return q;
      }));
    } catch (error: any) {
      console.error("Error updating quotation status:", error);
      alert(error.message || "Error al actualizar el estado de la cotización");
    }
  };

  const handleDownloadPDF = async (cot: any) => {
    setActiveDropdownId(null);
    try {
      const targetId = cot.id_db || cot.id;
      const response = await fetch(`/api/ventas/cotizaciones/${targetId}/pdf`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('koda_token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Error al descargar el PDF de la cotización');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Cotizacion-${cot.numero_cotizacion || cot.id}.pdf`);
      document.body.appendChild(link);
      link.click();
      
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Error downloading PDF:", error);
      alert(error.message || "Error al descargar el archivo PDF");
    }
  };

  const handleConvertToInvoice = async (cot: any) => {
    setActiveDropdownId(null);
    try {
      const targetId = cot.id_db || cot.id;
      const response = await api.post<any>(`/ventas/cotizaciones/${targetId}/facturar`, {});
      
      alert(`¡Cotización facturada con éxito! Factura creada: ${response.numero_factura}`);
      
      // Update local state to reflect that it is now "Facturada"
      setQuotations(prev => prev.map(q => {
        const qId = q.id_db || q.id;
        if (qId === targetId) {
          return {
            ...q,
            estado: 'Facturada',
            status: 'Facturada',
            statusColor: 'bg-emerald-50 text-emerald-700 border border-emerald-100'
          };
        }
        return q;
      }));
    } catch (error: any) {
      console.error("Error converting quotation to invoice:", error);
      alert(error.message || "Error al convertir la cotización a factura");
    }
  };

  const fetchQuotations = async () => {
    setIsLoading(true);
    try {
      const data = await api.get<any[]>('/ventas/cotizaciones');
      setQuotations(data || []);
    } catch (error) {
      console.error("Error fetching quotations:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotations();
  }, []);

  const displayQuotations = quotations;

  // Cómputo dinámico de KPIs
  const computeKPIs = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);
    nextWeek.setHours(23, 59, 59, 999);
    
    let abiertas = 0;
    let vencenSemana = 0;
    let convertidas = 0;
    let totalUSD = 0;
    let totalVES = 0;
    
    displayQuotations.forEach(q => {
      const status = (q.estado || q.status || '').toLowerCase();
      const isOpen = status === 'borrador' || status === 'enviada' || status === 'pendiente';
      const isConverted = status === 'facturada' || status === 'procesada' || status === 'aceptada';
      const isNotCancelled = status !== 'rechazada' && status !== 'anulada';
      
      if (isOpen) {
        abiertas++;
      }
      
      if (isConverted) {
        convertidas++;
      }
      
      if (isOpen) {
        const dueDateStr = q.fecha_vencimiento || q.dueDate;
        if (dueDateStr) {
          const [year, month, day] = dueDateStr.split('-').map(Number);
          const localDueDate = new Date(year, month - 1, day);
          if (localDueDate >= today && localDueDate <= nextWeek) {
            vencenSemana++;
          }
        }
      }
      
      if (isNotCancelled) {
        const val = Number(q.total || q.amount || 0);
        const currency = (q.moneda || q.currency || 'USD').toUpperCase();
        if (currency === 'VES') {
          totalVES += val;
        } else {
          totalUSD += val;
        }
      }
    });
    
    const totalHistorico = displayQuotations.length;
    const tasaConversion = totalHistorico > 0 
      ? `${Math.round((convertidas / totalHistorico) * 100)}%` 
      : '0%';
      
    let montoText = '';
    if (totalUSD > 0 && totalVES > 0) {
      montoText = `$${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })} / Bs.${totalVES.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    } else if (totalVES > 0) {
      montoText = `Bs.${totalVES.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    } else {
      montoText = `$${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }
    
    return {
      abiertas,
      vencenSemana,
      tasaConversion,
      montoText
    };
  };

  const kpis = computeKPIs();

  const handleConvert = (cot: any) => {
    if (cot.status === 'VENCIDA' || cot.estado === 'VENCIDA' || cot.id === 'COT-2026-0089') {
      setSelectedCot(cot);
      setShowModal(true);
    } else {
      alert("Convirtiendo cotización a Orden de Venta...");
    }
  };

  if (isCreating) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500 pb-20">
        <QuotationForm
          onCancel={() => setIsCreating(false)}
          onSubmit={(formData) => {
            console.log("Generando cotización:", formData);
            setIsCreating(false);
            fetchQuotations();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Cotizaciones a Clientes</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-2xl">
              Presupuestos y propuestas comerciales. Conviertelas en Orden de Venta cuando el cliente confirme.
            </p>
          </div>
          <div className="flex gap-3">
             <button 
               onClick={() => setShowManual(true)}
               className="bg-white text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 flex items-center gap-2 tracking-widest shadow-sm hover:bg-slate-50 transition-colors"
             >
               <BookOpen size={16} className="text-blue-500" /> Manual de esta Opcion
             </button>
             <button
               onClick={() => {
                 console.log("Abriendo modal/vista de creación");
                 setIsCreating(true);
               }}
               className="bg-slate-900 text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 tracking-widest shadow-lg"
             >
               Nueva Cotizacion
             </button>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {[
          { t: 'Cotizaciones Abiertas', v: kpis.abiertas.toString(), desc: 'En negociacion', c: 'text-slate-800' },
          { t: 'Vencen esta semana', v: kpis.vencenSemana.toString(), desc: 'Requieren seguimiento', c: 'text-amber-600' },
          { t: 'Tasa de Conversion', v: kpis.tasaConversion, desc: 'Cot. -> Orden de Venta', c: 'text-green-600' },
          { t: 'Monto en Cotizaciones', v: kpis.montoText, desc: 'Ventas potenciales', c: 'text-slate-800' }
        ].map((kpi, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">{kpi.t}</p>
            <strong className={`text-3xl font-black ${kpi.c} tracking-tighter`}>{kpi.v}</strong>
            <p className="text-xs font-bold text-slate-400 uppercase mt-1">{kpi.desc}</p>
          </div>
        ))}
      </section>

      <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h3 className="text-xl font-black text-slate-800 tracking-tighter uppercase">Cotizaciones Activas</h3>
            <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">Propuestas enviadas a clientes con seguimiento de estado y vencimiento.</p>
          </div>
          <div className="flex gap-2">
            <input type="text" placeholder="Buscar cliente..." className="pl-4 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]/30" />
            <select className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-black uppercase text-slate-500">
              <option>Todos</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <th className="pb-4 px-4">N. Cotizacion</th>
                <th className="pb-4 px-4">Cliente</th>
                <th className="pb-4 px-4">Productos</th>
                <th className="pb-4 px-4">Monto</th>
                <th className="pb-4 px-4 text-center">Estado</th>
                <th className="pb-4 px-4 text-right">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cargando cotizaciones...</td>
                </tr>
              ) : displayQuotations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">No hay cotizaciones</td>
                </tr>
              ) : displayQuotations.map((cot, i) => (
                <tr key={i} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="py-5 px-4 text-sm font-black text-slate-800 uppercase">{cot.numero_cotizacion || cot.id}</td>
                  <td className="py-5 px-4 text-xs font-bold text-slate-600 uppercase">{cot.client || cot.cliente}</td>
                  <td className="py-5 px-4 text-xs font-bold text-slate-400 uppercase">
                    {cot.cantidad_items !== undefined ? `${cot.cantidad_items} items` : (typeof cot.items === 'string' ? cot.items : '0 items')}
                  </td>
                  <td className="py-5 px-4 text-sm font-black text-slate-800">
                    {cot.moneda === 'VES' ? 'Bs.' : '$'}
                    {Number(cot.total || cot.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-5 px-4 text-center">
                    <span className={`${cot.statusColor || 'bg-slate-100 text-slate-700'} text-[9px] font-black px-3 py-1 rounded uppercase`}>{cot.status || cot.estado}</span>
                  </td>
                  <td className="py-5 px-4 text-right relative">
                    <button 
                      onClick={() => toggleDropdown(cot.id)} 
                      className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <MoreVertical size={16} className="inline-block" />
                    </button>
                    
                    {activeDropdownId === cot.id && (
                      <div className="absolute right-4 mt-2 w-48 bg-white rounded-xl border border-slate-100 shadow-xl z-50 py-1.5 text-left animate-in fade-in slide-in-from-top-2 duration-150">
                        <button
                          onClick={() => handleDownloadPDF(cot)}
                          className="w-full px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 hover:text-indigo-700 transition-colors flex items-center gap-2 uppercase tracking-wider"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                          Descargar PDF
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(cot, "Enviada")}
                          className="w-full px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 hover:text-sky-700 transition-colors flex items-center gap-2 uppercase tracking-wider"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-sky-500"></div>
                          Marcar como Enviada
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(cot, "Aceptada")}
                          className="w-full px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 hover:text-emerald-700 transition-colors flex items-center gap-2 uppercase tracking-wider"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                          Aceptar Presupuesto
                        </button>
                        {(cot.status === 'Aceptada' || cot.estado === 'Aceptada') && (
                          <button
                            onClick={() => handleConvertToInvoice(cot)}
                            className="w-full px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 hover:text-teal-700 transition-colors flex items-center gap-2 uppercase tracking-wider"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-teal-500"></div>
                            Convertir a Factura
                          </button>
                        )}
                        <button
                          onClick={() => handleUpdateStatus(cot, "Anulada")}
                          className="w-full px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 hover:text-rose-700 transition-colors flex items-center gap-2 uppercase tracking-wider"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div>
                          Anular
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-8 border border-red-100 shadow-2xl">
             <h2 className="text-xl font-black text-slate-800 uppercase mb-4">Actualizar Precios</h2>
             <p className="text-xs text-slate-400 font-bold uppercase mb-8 leading-relaxed">Los precios en la matriz han cambiado. Se requiere ajuste antes de la conversion.</p>
             <button onClick={() => setShowModal(false)} className="w-full bg-[#0b5156] text-white font-black py-4 rounded-2xl uppercase text-xs">Cerrar</button>
          </div>
        </div>
      )}

      {/* Manual Interactivo */}
      {showManual && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-8 border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
             <div className="flex justify-between items-start mb-6">
               <div>
                 <h2 className="text-2xl font-black text-slate-800 uppercase mb-2">Ciclo de Venta: Cotizaciones</h2>
                 <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">¿Cómo funciona este módulo?</p>
               </div>
               <button onClick={() => setShowManual(false)} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors">
                 <X size={16} className="text-slate-500" />
               </button>
             </div>
             
             <div className="space-y-4">
               <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                 <div className="flex items-start gap-4">
                   <div className="bg-blue-100 text-blue-600 w-8 h-8 rounded-full flex items-center justify-center font-black shrink-0">1</div>
                   <div>
                     <h3 className="text-sm font-black text-slate-800 uppercase mb-1">La Oferta Inicial</h3>
                     <p className="text-xs text-slate-600 font-medium leading-relaxed">
                       Se crea la propuesta comercial con los productos y precios sugeridos. <strong>Importante:</strong> Las cotizaciones NO afectan tu inventario ni generan cuentas por cobrar. Son solo presupuestos informativos.
                     </p>
                   </div>
                 </div>
               </div>

               <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                 <div className="flex items-start gap-4">
                   <div className="bg-amber-100 text-amber-600 w-8 h-8 rounded-full flex items-center justify-center font-black shrink-0">2</div>
                   <div>
                     <h3 className="text-sm font-black text-slate-800 uppercase mb-1">Negociación y Seguimiento</h3>
                     <p className="text-xs text-slate-600 font-medium leading-relaxed">
                       Las cotizaciones tienen una <strong>Fecha de Vencimiento</strong>. El sistema te alertará cuando estén por vencer para que puedas contactar al cliente, renegociar o descartar la propuesta. Puedes editarla las veces que sean necesarias.
                     </p>
                   </div>
                 </div>
               </div>

               <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                 <div className="flex items-start gap-4">
                   <div className="bg-green-100 text-green-600 w-8 h-8 rounded-full flex items-center justify-center font-black shrink-0">3</div>
                   <div>
                     <h3 className="text-sm font-black text-slate-800 uppercase mb-1">Cierre y Conversión</h3>
                     <p className="text-xs text-slate-600 font-medium leading-relaxed">
                       Si el cliente acepta la propuesta, la conviertes en <strong>Orden de Venta</strong>. Es en ese momento donde la venta se formaliza y los productos se reservan en el sistema.
                     </p>
                   </div>
                 </div>
               </div>
             </div>

             <div className="mt-8 text-right">
               <button onClick={() => setShowManual(false)} className="bg-slate-900 text-white px-8 py-3 rounded-xl text-xs font-black uppercase hover:bg-slate-800 transition-colors shadow-lg">
                 Entendido
               </button>
             </div>
          </div>
        </div>
      )}

      {activeDropdownId && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setActiveDropdownId(null)}
        />
      )}
    </div>
  );
};

export default Quotations;
