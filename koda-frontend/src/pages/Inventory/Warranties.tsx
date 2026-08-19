import { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Plus,
  X,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { api } from '@/api/client';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';

interface Garantia {
  id: number;
  producto_id: number;
  venta_id: number | null;
  cliente_id: number;
  fecha_inicio: string;
  duracion_meses: number;
  fecha_vencimiento: string;
  estado: 'VIGENTE' | 'VENCIDA' | 'RECLAMADA' | 'ANULADA';
  notas?: string | null;
}

interface Producto {
  id: number;
  sku: string;
  nombre: string;
}

interface Cliente {
  id: number;
  rif: string;
  nombre: string;
}

interface Venta {
  id: number;
  numero_factura: string;
  cliente_id: number | null;
}

const ESTADOS: Garantia['estado'][] = ['VIGENTE', 'VENCIDA', 'RECLAMADA', 'ANULADA'];

const ESTADO_COLOR: Record<Garantia['estado'], string> = {
  VIGENTE: 'bg-green-100 text-green-700',
  VENCIDA: 'bg-slate-200 text-slate-600',
  RECLAMADA: 'bg-amber-100 text-amber-700',
  ANULADA: 'bg-red-100 text-red-700',
};

const Warranties = () => {
  const navigate = useNavigate();
  const [garantias, setGarantias] = useState<Garantia[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [filtroCliente, setFiltroCliente] = useState<string>('');

  // Modal de registro
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [productoId, setProductoId] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [ventaId, setVentaId] = useState('');
  const [duracionMeses, setDuracionMeses] = useState('12');
  const [notas, setNotas] = useState('');

  // Modal de reclamo (actualizar estado)
  const [garantiaSeleccionada, setGarantiaSeleccionada] = useState<Garantia | null>(null);
  const [nuevoEstado, setNuevoEstado] = useState<Garantia['estado']>('RECLAMADA');
  const [notasReclamo, setNotasReclamo] = useState('');

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchGarantias = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filtroEstado) params.set('estado', filtroEstado);
      if (filtroCliente) params.set('cliente_id', filtroCliente);
      const qs = params.toString();
      const data = await api.get<Garantia[]>(`/garantias${qs ? `?${qs}` : ''}`);
      setGarantias(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Error al cargar garantías');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGarantias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado, filtroCliente]);

  useEffect(() => {
    api.get<Producto[]>('/productos').then(setProductos).catch(() => {});
    api.get<Cliente[]>('/clientes').then(setClientes).catch(() => {});
    api.get<Venta[]>('/ventas').then(setVentas).catch(() => {});
  }, []);

  const productoMap = useMemo(() => new Map(productos.map(p => [p.id, p])), [productos]);
  const clienteMap = useMemo(() => new Map(clientes.map(c => [c.id, c])), [clientes]);
  const ventaMap = useMemo(() => new Map(ventas.map(v => [v.id, v])), [ventas]);

  const handleOpenCreateModal = () => {
    setProductoId('');
    setClienteId('');
    setVentaId('');
    setDuracionMeses('12');
    setNotas('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        producto_id: parseInt(productoId, 10),
        cliente_id: parseInt(clienteId, 10),
        venta_id: ventaId.trim() ? parseInt(ventaId, 10) : undefined,
        duracion_meses: parseInt(duracionMeses, 10),
        notas: notas.trim() || undefined,
      };
      await api.post<Garantia>('/garantias', payload);
      showToast('Garantía registrada exitosamente', 'success');
      setIsModalOpen(false);
      fetchGarantias();
    } catch (err: any) {
      showToast(err.message || 'Error al registrar la garantía', 'error');
    }
  };

  const handleOpenReclamoModal = (g: Garantia) => {
    setGarantiaSeleccionada(g);
    setNuevoEstado(g.estado === 'VIGENTE' ? 'RECLAMADA' : g.estado);
    setNotasReclamo('');
  };

  const handleSubmitReclamo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!garantiaSeleccionada) return;
    try {
      await api.patch(`/garantias/${garantiaSeleccionada.id}`, {
        estado: nuevoEstado,
        notas: notasReclamo.trim() || undefined,
      });
      showToast('Garantía actualizada exitosamente', 'success');
      setGarantiaSeleccionada(null);
      fetchGarantias();
    } catch (err: any) {
      showToast(err.message || 'Error al actualizar la garantía', 'error');
    }
  };

  const filteredGarantias = garantias.filter(g => {
    if (!searchTerm) return true;
    const producto = productoMap.get(g.producto_id);
    const cliente = clienteMap.get(g.cliente_id);
    const term = searchTerm.toLowerCase();
    return (
      producto?.nombre.toLowerCase().includes(term) ||
      producto?.sku.toLowerCase().includes(term) ||
      cliente?.nombre.toLowerCase().includes(term) ||
      cliente?.rif.toLowerCase().includes(term)
    );
  });

  const vigentes = garantias.filter(g => g.estado === 'VIGENTE').length;
  const reclamadas = garantias.filter(g => g.estado === 'RECLAMADA').length;
  const vencidas = garantias.filter(g => g.estado === 'VENCIDA').length;

  const stats = [
    { label: 'GARANTÍAS REGISTRADAS', value: garantias.length, desc: 'Total en el tenant', color: 'text-slate-800' },
    { label: 'VIGENTES', value: vigentes, desc: 'Cobertura activa', color: 'text-green-600' },
    { label: 'RECLAMADAS', value: reclamadas, desc: 'Requieren seguimiento', color: 'text-amber-600' },
    { label: 'VENCIDAS', value: vencidas, desc: 'Cobertura expirada', color: 'text-slate-500' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-8 rounded-3xl border border-[#bdafa1]/20 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <ShieldCheck size={120} className="text-[#0b5156]" />
        </div>
        <div className="flex justify-between items-start mb-6 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Inventario
              </span>
            </div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Garantías</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-3xl leading-relaxed">
              Registro y seguimiento de cobertura de garantía por producto y venta.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => navigate('/inventario')} className="bg-white text-[#0b5156] px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-[#0b5156]/20 hover:bg-green-50 transition-all tracking-widest shadow-sm">
              Volver
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-2 relative z-10">
          <button
            onClick={handleOpenCreateModal}
            className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg shadow-[#0b5156]/20 hover:scale-105 transition-all tracking-widest"
          >
            <Plus size={16} strokeWidth={3} /> Nueva Garantía
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-36 group hover:border-[#0b5156]/30 transition-all">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest group-hover:text-[#0b5156] transition-colors">{stat.label}</p>
            <div className="space-y-1">
              <strong className={`text-3xl font-black ${stat.color} tracking-tighter font-mono`}>{stat.value}</strong>
              <p className="text-sm font-bold text-slate-400 uppercase leading-tight">{stat.desc}</p>
            </div>
          </div>
        ))}
      </section>

      <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">Garantías Registradas</h3>
          <div className="flex flex-wrap gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar producto o cliente..."
                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156] w-64"
              />
            </div>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156] uppercase"
            >
              <option value="">Todos los estados</option>
              {ESTADOS.map(estado => (
                <option key={estado} value={estado}>{estado}</option>
              ))}
            </select>
            <select
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156] uppercase max-w-[220px]"
            >
              <option value="">Todos los clientes</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <p className="text-center py-10 text-xs font-bold text-slate-400 uppercase">Cargando garantías...</p>
        ) : error ? (
          <p className="text-center py-10 text-xs font-bold text-red-500 uppercase">{error}</p>
        ) : filteredGarantias.length === 0 ? (
          <p className="text-center py-10 text-xs font-bold text-slate-400 uppercase">No hay garantías registradas</p>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                  <th className="py-4 px-6">PRODUCTO</th>
                  <th className="py-4 px-4">CLIENTE</th>
                  <th className="py-4 px-4">VENTA</th>
                  <th className="py-4 px-4 text-center">INICIO</th>
                  <th className="py-4 px-4 text-center">VENCE</th>
                  <th className="py-4 px-6 text-center">ESTADO</th>
                  <th className="py-4 px-6 text-center">ACCIONES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredGarantias.map((g) => {
                  const producto = productoMap.get(g.producto_id);
                  const cliente = clienteMap.get(g.cliente_id);
                  const venta = g.venta_id != null ? ventaMap.get(g.venta_id) : null;
                  return (
                    <tr key={g.id} className="group hover:bg-slate-50 transition-colors">
                      <td className="py-5 px-6">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-slate-800 uppercase">{producto?.nombre || `Producto #${g.producto_id}`}</span>
                          {producto && <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">SKU {producto.sku}</span>}
                        </div>
                      </td>
                      <td className="py-5 px-4 text-xs font-bold text-slate-600 uppercase">
                        {cliente?.nombre || `Cliente #${g.cliente_id}`}
                      </td>
                      <td className="py-5 px-4 text-xs font-bold text-slate-400 uppercase font-mono">
                        {venta ? venta.numero_factura : '—'}
                      </td>
                      <td className="py-5 px-4 text-center text-xs font-bold text-slate-500 font-mono">
                        {new Date(g.fecha_inicio).toLocaleDateString('es-VE')}
                      </td>
                      <td className="py-5 px-4 text-center text-xs font-bold text-slate-500 font-mono">
                        {new Date(g.fecha_vencimiento).toLocaleDateString('es-VE')}
                      </td>
                      <td className="py-5 px-6 text-center">
                        <span className={`${ESTADO_COLOR[g.estado]} text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter`}>
                          {g.estado}
                        </span>
                      </td>
                      <td className="py-5 px-6 text-center">
                        <button
                          onClick={() => handleOpenReclamoModal(g)}
                          className="text-[10px] font-black uppercase text-[#0b5156] hover:underline tracking-widest"
                        >
                          Actualizar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {/* Modal de Registro */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full border border-[#0b5156]/20 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-600"
            >
              <X size={18} />
            </button>
            <h3 className="text-xl font-black uppercase text-slate-800 tracking-tight mb-6">Nueva Garantía</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Producto</label>
                <select
                  value={productoId}
                  onChange={(e) => setProductoId(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                >
                  <option value="">Selecciona un producto</option>
                  {productos.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} ({p.sku})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Cliente</label>
                <select
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                >
                  <option value="">Selecciona un cliente</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre} ({c.rif})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Venta asociada (opcional)</label>
                <select
                  value={ventaId}
                  onChange={(e) => setVentaId(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                >
                  <option value="">Sin venta asociada</option>
                  {ventas.map(v => (
                    <option key={v.id} value={v.id}>{v.numero_factura}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Duración (meses)</label>
                <input
                  type="number"
                  min={1}
                  value={duracionMeses}
                  onChange={(e) => setDuracionMeses(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Notas (opcional)</label>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                />
              </div>
              <div className="pt-4">
                <button
                  type="submit"
                  className="w-full bg-[#0b5156] hover:bg-[#093e42] text-white font-black py-4 rounded-xl uppercase text-[11px] tracking-widest shadow-lg transition-all"
                >
                  Registrar Garantía
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Actualización / Reclamo */}
      {garantiaSeleccionada && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full border border-[#0b5156]/20 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setGarantiaSeleccionada(null)}
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-600"
            >
              <X size={18} />
            </button>
            <h3 className="text-xl font-black uppercase text-slate-800 tracking-tight mb-6">Actualizar Garantía</h3>
            <form onSubmit={handleSubmitReclamo} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Estado</label>
                <select
                  value={nuevoEstado}
                  onChange={(e) => setNuevoEstado(e.target.value as Garantia['estado'])}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                >
                  {ESTADOS.map(estado => (
                    <option key={estado} value={estado}>{estado}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Notas del reclamo (opcional)</label>
                <textarea
                  value={notasReclamo}
                  onChange={(e) => setNotasReclamo(e.target.value)}
                  rows={3}
                  placeholder="Describe qué ocurrió con el reclamo..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                />
              </div>
              <div className="pt-4">
                <button
                  type="submit"
                  className="w-full bg-[#0b5156] hover:bg-[#093e42] text-white font-black py-4 rounded-xl uppercase text-[11px] tracking-widest shadow-lg transition-all"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && typeof document !== 'undefined' && createPortal(
        <div className="fixed bottom-5 right-5 z-[9999] animate-in slide-in-from-bottom duration-300">
          <div className={`px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 ${toast.type === 'success' ? 'bg-[#0b5156] border border-[#0b5156]/20 text-white' : 'bg-red-600 border border-red-500 text-white'}`}>
            {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
            <span className="font-bold text-sm tracking-wide uppercase font-mono">{toast.message}</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Warranties;
