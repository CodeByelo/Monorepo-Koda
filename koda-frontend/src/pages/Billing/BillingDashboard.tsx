import { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Plus, 
  Monitor, 
  Download,
  Ban,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';

interface VentaRow {
  id: number;
  numero_factura: string;
  fecha: string;
  subtotal_usd?: number | string;
  iva_usd?: number | string;
  total_usd?: number | string;
  subtotal?: number | string;
  iva?: number | string;
  total?: number | string;
  estado: string;
  cliente?: {
    nombre: string;
    rif: string;
  };
}

const BillingDashboard = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [ventas, setVentas] = useState<VentaRow[]>([]);
  const [reporte, setReporte] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ventasRes, reporteRes] = await Promise.all([
          api.get<VentaRow[]>('/ventas'),
          api.get<any>('/ventas/reporte'),
        ]);
        setVentas(ventasRes || []);
        setReporte(reporteRes);
      } catch (error) {
        console.error('Error cargando facturas:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const fmt = (n: number | string) => {
    const v = typeof n === 'string' ? parseFloat(n) : n;
    return `$${(isNaN(v) ? 0 : v).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
  };

  const invoices = useMemo(() => ventas.map((v) => {
    const digits = (v.numero_factura || "").replace(/\D/g, "");
    const controlNumber = digits ? `00-${digits.padStart(8, '0')}` : `00-${String(v.id).padStart(8, '0')}`;
    return {
      id: v.numero_factura,
      control: controlNumber,
      client: v.cliente?.nombre || 'Cliente Final',
      rif: v.cliente?.rif || 'V-000000000',
      date: new Date(v.fecha).toLocaleDateString('es-VE'),
      base: fmt(v.subtotal_usd || v.subtotal || 0),
      tax: fmt(v.iva_usd || v.iva || 0),
      total: fmt(v.total_usd || v.total || 0),
      status: v.estado === 'ACTIVA' ? 'Activa' : v.estado,
      statusColor: v.estado === 'ACTIVA' ? 'bg-green-100 text-green-700' : 'bg-white text-slate-400',
    };
  }), [ventas]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return invoices;
    const q = searchTerm.toLowerCase();
    return invoices.filter((inv) =>
      inv.id.toLowerCase().includes(q) || inv.client.toLowerCase().includes(q)
    );
  }, [invoices, searchTerm]);

  const kpis = [
    { t: 'Total Facturado', v: fmt(reporte?.total_acumulado_usd || 0), desc: 'Acumulado USD', c: 'text-[#0b5156]' },
    { t: 'Docs. Emitidos', v: String(reporte?.ventas_totales_cantidad || ventas.length), desc: 'Facturas activas', c: 'text-[#43584b]' },
    { t: 'IVA Acumulado', v: fmt(reporte?.iva_acumulado_usd || 0), desc: 'Débito fiscal', c: 'text-amber-600' },
    { t: 'IGTF Percibido', v: fmt(reporte?.igtf_acumulado_usd || 0), desc: 'Impuesto divisas', c: 'text-[#0b5156]' },
  ];

  const handleAnular = async (id: number) => {
    if (!confirm('¿Estás seguro de que deseas anular esta factura? Esta acción no se puede deshacer.')) return;
    try {
      const updatedVenta = await api.post<VentaRow>(`/ventas/${id}/anular`);
      setVentas(prev => prev.map(v => v.id === id ? { ...v, estado: updatedVenta.estado } : v));
      alert('Factura anulada con éxito.');
    } catch (error: any) {
      alert(`Error al anular: ${error.message}`);
    }
  };

  const handleDownloadPdf = () => {
    alert('Función de descarga de PDF próximamente disponible.');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Historial de Facturas</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-2xl">
              Registro maestro de todos los documentos comerciales emitidos conformes a la Providencia 00071.
            </p>
          </div>
          <div className="flex gap-3">
             <Link to="/pos" className="bg-white text-[#0b5156] px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 tracking-widest shadow-sm hover:bg-green-50">
               <Monitor size={14} /> Abrir POS
             </Link>
             <Link to="/nueva" className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 tracking-widest shadow-lg shadow-green-900/20 hover:bg-[#083a3d]">
               <Plus size={16} /> Emitir Factura
             </Link>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-32">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">{kpi.t}</p>
            <div>
              <strong className={`text-3xl font-black ${kpi.c} tracking-tighter`}>{kpi.v}</strong>
              <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">{kpi.desc}</p>
            </div>
          </div>
        ))}
      </section>

      <section className={`bg-white border border-slate-200 shadow-sm overflow-hidden transition-all duration-300 ${isExpanded ? 'flex flex-col h-full fixed inset-4 z-50 rounded-3xl shadow-2xl' : 'rounded-3xl'}`}>
        <div className="p-6 border-b border-slate-100 flex flex-wrap gap-4 items-center bg-slate-50/50">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Buscar por N. Factura, Cliente o RIF..." 
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]/30"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 transition-colors shadow-sm ml-auto"
          >
            {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-xs font-bold uppercase animate-pulse">Cargando facturas...</div>
        ) : (
        <div className={`overflow-x-auto no-scrollbar ${isExpanded ? 'flex-1' : ''}`}>
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">
                <th className="py-4 px-6">Fecha</th>
                <th className="py-4 px-6">N. Control</th>
                <th className="py-4 px-6">Documento</th>
                <th className="py-4 px-6">Cliente / RIF</th>
                <th className="py-4 px-6 text-right">Base Imp.</th>
                <th className="py-4 px-6 text-right">Impuesto</th>
                <th className="py-4 px-6 text-right">Total</th>
                <th className="py-4 px-6 text-center">Estado</th>
                <th className="py-4 px-6 text-right">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="py-12 text-center text-slate-400 text-xs font-bold uppercase">Sin facturas registradas</td></tr>
              ) : filtered.map((inv, i) => (
                <tr key={i} className="group hover:bg-slate-50/80 transition-colors">
                  <td className="py-5 px-6 text-xs font-bold text-slate-500 uppercase">{inv.date}</td>
                  <td className="py-5 px-6 text-xs font-bold text-slate-400 tracking-widest">{inv.control}</td>
                  <td className="py-5 px-6 text-sm font-black text-slate-800 uppercase">{inv.id}</td>
                  <td className="py-5 px-6">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-[#0b5156] uppercase">{inv.client}</span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{inv.rif}</span>
                    </div>
                  </td>
                  <td className="py-5 px-6 text-right font-bold text-slate-500">{inv.base}</td>
                  <td className="py-5 px-6 text-right font-bold text-slate-500">{inv.tax}</td>
                  <td className="py-5 px-6 text-right font-black text-slate-800">{inv.total}</td>
                  <td className="py-5 px-6 text-center">
                    <span className={`${inv.statusColor} text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-tighter`}>{inv.status}</span>
                  </td>
                  <td className="py-5 px-6 text-right">
                    <div className="flex justify-end gap-2">
                       <button onClick={handleDownloadPdf} className="p-2 hover:bg-white rounded-lg text-[#0b5156] transition-colors" title="Ver PDF">
                          <Download size={14} />
                       </button>
                       {inv.status !== 'ANULADA' && inv.status !== 'Anulada' && (
                         <button onClick={() => {
                           const originalVenta = ventas.find(v => v.numero_factura === inv.id);
                           if (originalVenta) handleAnular(originalVenta.id);
                         }} className="p-2 hover:bg-red-50 rounded-lg text-red-400 transition-colors" title="Anular Factura">
                            <Ban size={14} />
                         </button>
                       )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}

        <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex justify-between items-center">
           <span className="text-xs font-bold text-slate-400 uppercase">Mostrando {filtered.length} documentos</span>
        </div>
      </section>
    </div>
  );
};

export default BillingDashboard;
