import { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Plus, 
  Monitor, 
  Download,
  Ban,
  Maximize2,
  Minimize2,
  Receipt,
  Truck
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
  tasa_cambio_bs?: number | string;
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
        setIsLoading(true);
        const [ventasRes, reporteRes] = await Promise.all([
          api.get<VentaRow[]>('/ventas').catch(() => []),
          api.get<any>('/ventas/reporte').catch(() => null),
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
      dbId: v.id,
      id: v.numero_factura,
      control: controlNumber,
      client: v.cliente?.nombre || 'Cliente Final',
      rif: v.cliente?.rif || 'V-000000000',
      date: new Date(v.fecha).toLocaleDateString('es-VE'),
      rawDate: v.fecha ? v.fecha.split('T')[0] : '',
      base: fmt(v.subtotal_usd || v.subtotal || 0),
      tax: fmt(v.iva_usd || v.iva || 0),
      total: fmt(v.total_usd || v.total || 0),
      totalBs: `Bs. ${((Number(v.total_usd || v.total || 0)) * (Number(v.tasa_cambio_bs) || 0)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      tasa: Number(v.tasa_cambio_bs) || 0,
      status: v.estado === 'ACTIVA' ? 'Activa' : v.estado,
      statusColor: v.estado === 'ACTIVA' ? 'bg-green-100 text-green-700' : 'bg-white text-slate-400',
    };
  }), [ventas]);

  const [filterEstado, setFilterEstado] = useState<'TODOS' | 'ACTIVA' | 'ANULADA'>('TODOS');
  const [filterFecha, setFilterFecha] = useState('');

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      // Filtro texto: Número factura/ticket, cliente o RIF
      const matchText = !searchTerm.trim() || 
        inv.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
        inv.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.rif.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.control.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Filtro Estado
      const matchEstado = filterEstado === 'TODOS' || 
        (filterEstado === 'ACTIVA' && (inv.status === 'Activa' || inv.status === 'ACTIVA')) ||
        (filterEstado === 'ANULADA' && (inv.status === 'Anulada' || inv.status === 'ANULADA'));

      // Filtro Fecha (si se seleccionó)
      const matchFecha = !filterFecha || (inv.rawDate && inv.rawDate.startsWith(filterFecha));

      return matchText && matchEstado && matchFecha;
    });
  }, [invoices, searchTerm, filterEstado, filterFecha]);

  const kpis = [
    { t: 'Total Facturado', v: fmt(reporte?.total_acumulado_usd || 0), desc: 'Acumulado USD', c: 'text-[#0b5156]' },
    { t: 'Docs. Emitidos', v: String(reporte?.ventas_totales_cantidad || ventas.length), desc: 'Facturas activas', c: 'text-[#43584b]' },
    { t: 'IVA Acumulado', v: fmt(reporte?.iva_acumulado_usd || 0), desc: 'Débito fiscal', c: 'text-amber-600' },
    { t: 'IGTF Percibido', v: fmt(reporte?.igtf_acumulado_usd || 0), desc: 'Impuesto divisas', c: 'text-[#0b5156]' },
  ];

  const handleAnular = async (id: number) => {
    if (!confirm('¿Estás seguro de que deseas anular esta factura? Esta acción no se puede deshacer.')) return;
    try {
      await api.post(`/ventas/${id}/anular`);
      const updated = ventas.map(v => v.id === id ? { ...v, estado: 'ANULADA' } : v);
      setVentas(updated);
    } catch (error) {
      console.error('Error anulando factura:', error);
      alert('No se pudo anular la factura.');
    }
  };

  const handleDownloadPdf = async (id: number) => {
    try {
      await api.download(`/ventas/${id}/pdf`, `Factura-${id}.pdf`);
    } catch (error: any) {
      alert(error?.message || 'Error descargando la factura en PDF.');
    }
  };

  const handleDownloadTicket = async (id: number) => {
    try {
      await api.download(`/ventas/${id}/ticket`, `Ticket-${id}.pdf`);
    } catch (error: any) {
      alert(error?.message || 'Error descargando el ticket.');
    }
  };

  const handleGenerarNotaEntrega = async (id: number) => {
    try {
      const res: any = await api.post(`/ventas/${id}/generar-nota-entrega`, {});
      alert(`Nota de entrega ${res.numero_nota} generada con éxito.`);
    } catch (error: any) {
      alert(error?.response?.data?.detail || error?.message || 'Error generando nota de entrega.');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest inline-block mb-2">
              Auditoría & Ventas
            </span>
            <h1 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">
              Auditoría de Tickets y Facturas
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">
              Control fiscal centralizado, reimpresión de tickets térmicos y facturación legal.
            </p>
          </div>
          <div className="flex gap-2">
             <Link to="/pos" className="bg-white text-slate-700 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm">
                <Monitor size={14} /> Terminal POS
             </Link>
             <Link to="/nueva-fiscal" className="bg-[#0b5156] text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all flex items-center gap-2">
                <Plus size={14} /> Nueva Factura
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
        <div className="p-6 border-b border-slate-100 flex flex-wrap gap-4 items-center justify-between bg-slate-50/50">
          <div className="flex flex-wrap items-center gap-3">
            {/* Buscador Texto */}
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Buscar Ticket, Factura, Cliente o RIF..." 
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]/30 shadow-xs"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Filtro Estado */}
            <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-xs">
              {(['TODOS', 'ACTIVA', 'ANULADA'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterEstado(st)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                    filterEstado === st ? 'bg-[#0b5156] text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Filtro Fecha */}
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-xs">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Fecha:</span>
              <input 
                type="date"
                value={filterFecha}
                onChange={(e) => setFilterFecha(e.target.value)}
                className="text-xs font-bold text-slate-700 bg-transparent focus:outline-none"
              />
              {filterFecha && (
                <button onClick={() => setFilterFecha('')} className="text-slate-400 hover:text-red-500 text-xs font-bold">✕</button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-500 uppercase font-mono">
              {filtered.length} {filtered.length === 1 ? 'documento' : 'documentos'}
            </span>
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
              title={isExpanded ? "Reducir pantalla" : "Pantalla completa"}
            >
              {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
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
                <th className="py-4 px-6 text-right">Total ($ / Bs.)</th>
                <th className="py-4 px-6 text-center">Estado</th>
                <th className="py-4 px-6 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="py-12 text-center text-slate-400 text-xs font-bold uppercase">Sin facturas registradas</td></tr>
              ) : filtered.map((inv, i) => (
                <tr key={i} className="group hover:bg-slate-50/80 transition-colors">
                  <td className="py-5 px-6 text-xs font-bold text-slate-500 uppercase">{inv.date}</td>
                  <td className="py-5 px-6 text-xs font-bold text-slate-400 tracking-widest">{inv.control}</td>
                  <td className="py-5 px-6 text-sm font-black text-slate-800 uppercase">
                    <button 
                      onClick={() => handleDownloadPdf(inv.dbId)}
                      className="text-left font-black text-slate-800 hover:text-[#0b5156] hover:underline uppercase block outline-none"
                    >
                      {inv.id}
                    </button>
                  </td>
                  <td className="py-5 px-6">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-[#0b5156] uppercase">{inv.client}</span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{inv.rif}</span>
                    </div>
                  </td>
                  <td className="py-5 px-6 text-right font-bold text-slate-500">{inv.base}</td>
                  <td className="py-5 px-6 text-right font-bold text-slate-500">{inv.tax}</td>
                  <td className="py-5 px-6 text-right">
                    <div className="flex flex-col items-end">
                      <span className="font-black text-slate-800 text-sm">{inv.total}</span>
                      <span className="text-[10px] font-bold text-[#0b5156] font-mono">{inv.totalBs}</span>
                    </div>
                  </td>
                  <td className="py-5 px-6 text-center">
                    <span className={`${inv.statusColor} text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-tighter`}>{inv.status}</span>
                  </td>
                  <td className="py-5 px-6 text-right">
                    <div className="flex justify-end gap-2">
                        <button onClick={() => handleDownloadPdf(inv.dbId)} className="p-2 hover:bg-white rounded-lg text-[#0b5156] transition-colors" title="Ver PDF">
                           <Download size={14} />
                        </button>
                        <button onClick={() => handleDownloadTicket(inv.dbId)} className="p-2 hover:bg-white rounded-lg text-[#0b5156] transition-colors" title="Descargar Ticket">
                          <Receipt size={14} />
                        </button>
                        <button onClick={() => handleGenerarNotaEntrega(inv.dbId)} className="p-2 hover:bg-white rounded-lg text-[#0b5156] transition-colors" title="Generar Nota de Entrega">
                          <Truck size={14} />
                        </button>
                       {inv.status !== 'ANULADA' && inv.status !== 'Anulada' && (
                         <button onClick={() => {
                           handleAnular(inv.dbId);
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
