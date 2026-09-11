import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Search,
  Package,
  ArrowRightLeft,
  RotateCcw,
  ShieldCheck,
  FileText,
  ClipboardCheck,
  Warehouse,
  Calendar,
  Layers,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Tag,
  DollarSign,
  Plus,
  X,
  Clock,
  Truck,
  ExternalLink
} from 'lucide-react';
import { api } from '@/api/client';
import { Toast } from '@/components/common/Toast';
import { DevolucionClienteModal } from '@/components/inventory/DevolucionClienteModal';

export default function FichaProducto() {
  const { id: routeId } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  // Search & Selector states
  const [productos, setProductos] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(routeId ? Number(routeId) : null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  // Ficha 360 data state
  const [fichaData, setFichaData] = useState<any | null>(null);
  const [isLoadingFicha, setIsLoadingFicha] = useState(false);
  const [fichaError, setFichaError] = useState<string | null>(null);

  // Active Tab: 1: Resumen, 2: Historial, 3: Devoluciones, 4: Garantías, 5: Cotizaciones, 6: Conteo
  const [activeTab, setActiveTab] = useState<'resumen' | 'movimientos' | 'devoluciones' | 'garantias' | 'cotizaciones' | 'conteos'>('resumen');

  // Tab 2 Filters (Historial de movimientos)
  const [movFilterType, setMovFilterType] = useState<string>('TODOS');
  const [movStartDate, setMovStartDate] = useState<string>('');
  const [movEndDate, setMovEndDate] = useState<string>('');

  // Modal: Nueva Devolución de Cliente (#13)
  const [showDevolucionModal, setShowDevolucionModal] = useState(false);

  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Cargar catálogo de productos para el buscador (igual que Kardex.tsx)
  useEffect(() => {
    setIsLoadingProducts(true);
    api.get<any[]>('/productos')
      .then(data => setProductos(data || []))
      .catch(err => {
        console.error('Error al cargar catálogo de productos:', err);
        showToast('Error al cargar lista de productos', 'error');
      })
      .finally(() => setIsLoadingProducts(false));
  }, []);

  // Si viene con :id en la URL o cambia selectedProductId, consultar Ficha 360
  useEffect(() => {
    if (selectedProductId) {
      cargarFicha360(selectedProductId);
    }
  }, [selectedProductId]);

  // Si cambia el parámetro de la ruta
  useEffect(() => {
    if (routeId) {
      const parsedId = Number(routeId);
      if (!isNaN(parsedId) && parsedId !== selectedProductId) {
        setSelectedProductId(parsedId);
      }
    }
  }, [routeId]);

  const cargarFicha360 = async (prodId: number) => {
    setIsLoadingFicha(true);
    setFichaError(null);
    try {
      const data = await api.get<any>(`/inventario/productos/${prodId}/ficha-360`);
      setFichaData(data);
      if (data?.producto?.nombre) {
        setSearchQuery(data.producto.nombre);
      }
    } catch (err: any) {
      console.error('Error al cargar Ficha 360:', err);
      setFichaError('No se pudo cargar la información 360 del producto.');
      setFichaData(null);
      showToast('Error al consultar Ficha 360', 'error');
    } finally {
      setIsLoadingFicha(false);
    }
  };

  const handleSelectProduct = (p: any) => {
    setSelectedProductId(p.id);
    setSearchQuery(p.nombre);
    setShowSuggestions(false);
    navigate(`/inventario/ficha-producto/${p.id}`, { replace: true });
  };

  const handleSearchSubmit = () => {
    if (!searchQuery.trim()) return;
    const match = productos.find(p =>
      p.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (match) {
      handleSelectProduct(match);
    } else {
      showToast('No se encontró ningún producto coincidente.', 'error');
    }
  };


  // Filtrado de movimientos para Tab 2
  const movimientosFiltrados = (fichaData?.movimientos || []).filter((m: any) => {
    if (movFilterType !== 'TODOS' && m.tipo !== movFilterType) return false;
    if (m.fecha) {
      const itemDate = new Date(m.fecha).toISOString().split('T')[0];
      if (movStartDate && itemDate < movStartDate) return false;
      if (movEndDate && itemDate > movEndDate) return false;
    }
    return true;
  });

  const filteredSuggestions = searchQuery
    ? productos.filter(p =>
        p.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 6)
    : [];

  const prod = fichaData?.producto;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Backdrop para buscador flotante */}
      {showSuggestions && (
        <div
          className="fixed inset-0 z-[400]"
          onClick={() => setShowSuggestions(false)}
        />
      )}

      {/* Header Principal con Buscador Reactivo */}
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex justify-between items-start mb-4 flex-wrap gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-black text-slate-800 tracking-tight uppercase">
                Ficha 360° del Producto
              </h1>
              <span className="bg-teal-50 text-[#0b5156] px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-teal-200 flex items-center gap-1.5">
                <Layers size={13} /> 13 Fuentes Centralizadas
              </span>
            </div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight max-w-2xl">
              Vista consolidada e inmutable de entradas, salidas, transferencias, garantías, cotizaciones, auditorías y devoluciones.
            </p>
          </div>

          {/* Buscador de Producto idéntico a Kardex.tsx */}
          <div className="relative flex bg-slate-50 border border-slate-200 rounded-xl overflow-visible shadow-sm z-[450] min-w-[320px]">
            <div className="relative flex items-center flex-1">
              <Search className="absolute left-3 text-slate-400" size={15} />
              <input
                type="text"
                placeholder="Buscar por SKU o Nombre..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
                className="pl-10 pr-4 py-2.5 bg-transparent text-xs font-bold focus:outline-none focus:bg-slate-50 w-full transition-all text-slate-800 placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); setShowSuggestions(false); }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 mr-1"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={handleSearchSubmit}
              disabled={isLoadingFicha || isLoadingProducts}
              className="px-5 py-2.5 bg-[#0b5156] text-white text-[11px] font-black uppercase hover:bg-[#083a3d] transition-colors disabled:opacity-70 rounded-r-xl tracking-wider"
            >
              Buscar
            </button>

            {/* Dropdown de Sugerencias */}
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[500] max-h-72 overflow-y-auto divide-y divide-slate-100">
                {filteredSuggestions.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectProduct(p)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex flex-col gap-0.5 group"
                  >
                    <span className="text-xs font-black text-slate-800 uppercase group-hover:text-[#0b5156] transition-colors">
                      {p.nombre}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider">
                      SKU: {p.sku} | Stock Actual: {Number(p.stock || 0).toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Barra de Producto Activo si está cargado */}
        {prod && (
          <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-center text-[#0b5156] font-black text-lg">
                <Package size={24} />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">{prod.nombre}</h2>
                  <span className="bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-bold tracking-wider border border-slate-200">
                    SKU: {prod.sku}
                  </span>
                  {prod.es_exento && (
                    <span className="bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-lg text-[10px] font-black tracking-wider border border-emerald-200">
                      EXENTO IVA
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                  ID: #{prod.id} • Clasificación BCG: <span className="text-[#0b5156] font-black">{prod.cuadrante}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowDevolucionModal(true)}
                className="px-5 py-2.5 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 rounded-xl text-xs font-black uppercase flex items-center gap-2 tracking-wider transition-colors shadow-sm"
              >
                <RotateCcw size={14} /> Registrar Devolución Mostrador
              </button>
              <button
                onClick={() => navigate(`/inventario/kardex?sku=${prod.sku}`)}
                className="px-4 py-2.5 bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 tracking-wider transition-colors"
                title="Ver en Kardex completo"
              >
                <ExternalLink size={14} /> Kardex
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Estados de Carga / Sin Producto Seleccionado */}
      {isLoadingFicha ? (
        <div className="bg-white p-16 rounded-3xl border border-slate-200 shadow-sm text-center space-y-4">
          <div className="inline-block w-10 h-10 border-4 border-slate-200 border-t-[#0b5156] rounded-full animate-spin" />
          <p className="text-xs font-black text-slate-500 uppercase tracking-widest">
            Compilando las 13 fuentes de datos del producto...
          </p>
        </div>
      ) : !selectedProductId || !fichaData ? (
        <div className="bg-white p-16 rounded-3xl border border-slate-200 shadow-sm text-center space-y-4">
          <div className="w-16 h-16 bg-slate-50 border border-slate-200 rounded-2xl mx-auto flex items-center justify-center text-slate-400">
            <Package size={32} />
          </div>
          <h3 className="text-lg font-black text-slate-700 uppercase tracking-tight">
            Selecciona un producto para ver su Ficha 360°
          </h3>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider max-w-md mx-auto">
            Utiliza el buscador superior para seleccionar cualquier ítem del catálogo y examinar todo su historial.
          </p>
        </div>
      ) : (
        <>
          {/* Navegación por 6 Pestañas / Tabs */}
          <nav className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm gap-1 overflow-x-auto no-scrollbar">
            {[
              { id: 'resumen', label: '1. Resumen & Stock', icon: Warehouse, count: fichaData.stock_almacenes?.length || 0 },
              { id: 'movimientos', label: '2. Historial Movimientos', icon: ArrowRightLeft, count: fichaData.movimientos?.length || 0 },
              {
                id: 'devoluciones',
                label: '3. Devoluciones & Condición',
                icon: RotateCcw,
                count: (fichaData.devoluciones?.proveedor?.length || 0) +
                       (fichaData.devoluciones?.cliente?.length || 0) +
                       (fichaData.devoluciones?.cuarentena?.length || 0)
              },
              { id: 'garantias', label: '4. Garantías', icon: ShieldCheck, count: fichaData.garantias?.length || 0 },
              { id: 'cotizaciones', label: '5. Cotizado en', icon: FileText, count: fichaData.cotizaciones?.length || 0 },
              { id: 'conteos', label: '6. Auditoría de Conteo', icon: ClipboardCheck, count: fichaData.auditorias_conteo?.length || 0 }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 min-w-[170px] py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                    isActive
                      ? 'bg-[#0b5156] text-white shadow-md'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <Icon size={15} />
                  <span>{tab.label}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* =======================================================================
              TAB 1: RESUMEN Y STOCK ACTUAL
             ======================================================================= */}
          {activeTab === 'resumen' && (
            <div className="space-y-6">
              {/* Tarjetas KPI de Resumen */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-36">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stock Total Consolidado</p>
                  <div>
                    <strong className="text-3xl font-black text-[#0b5156] tracking-tight font-mono">
                      {Number(prod.stock_total || 0).toFixed(2)}
                    </strong>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                      Mínimo requerido: {Number(prod.stock_minimo || 0).toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-36">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rotación (Ventas 30 Días)</p>
                  <div>
                    <strong className="text-3xl font-black text-blue-600 tracking-tight font-mono">
                      {Number(prod.rotacion_30d || 0).toFixed(2)} uds
                    </strong>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                      Cálculo de Reportes Operativos
                    </p>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-36">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Precios & Margen Bruto</p>
                  <div>
                    <strong className="text-3xl font-black text-emerald-600 tracking-tight font-mono">
                      {prod.rentabilidad_pct}%
                    </strong>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                      Costo: ${prod.costo_usd} • Detal: ${prod.precio_detal}
                    </p>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-36">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Matriz de Portafolio</p>
                  <div>
                    <span className={`inline-block px-3 py-1 rounded-xl text-xs font-black uppercase border tracking-wider ${prod.cuadrante_badge}`}>
                      {prod.cuadrante}
                    </span>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-2">
                      Mayorista: ${prod.precio_mayor}
                    </p>
                  </div>
                </div>
              </div>

              {/* Fuente #6: StockPorAlmacen */}
              <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div>
                    <h3 className="text-lg font-black uppercase tracking-tight text-slate-800 flex items-center gap-2">
                      <Warehouse size={18} className="text-[#0b5156]" />
                      Stock Real por Almacén (Fuente #6: StockPorAlmacen)
                    </h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                      Ubicación de existencias físicas disponibles en la empresa
                    </p>
                  </div>
                  <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                    {fichaData.stock_almacenes?.length || 0} Almacenes
                  </span>
                </div>

                {(!fichaData.stock_almacenes || fichaData.stock_almacenes.length === 0) ? (
                  <div className="p-8 text-center bg-slate-50 border border-slate-100 rounded-2xl text-slate-400 font-bold text-xs uppercase tracking-wider">
                    Sin existencias registradas en ningún almacén.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {fichaData.stock_almacenes.map((alm: any) => (
                      <div
                        key={alm.almacen_id}
                        className="p-5 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col justify-between gap-4"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <h4 className="text-xs font-black text-slate-800 uppercase leading-tight">{alm.almacen_nombre || alm.nombre}</h4>
                            <span className="text-[10px] font-bold text-slate-400 font-mono">Código: {alm.codigo || alm.almacen_codigo}</span>
                          </div>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider border ${
                            (alm.almacen_tipo || alm.tipo) === 'LOCAL' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-blue-100 text-blue-800 border-blue-200'
                          }`}>
                            {alm.almacen_tipo || alm.tipo}
                          </span>
                        </div>
                        <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Existencia</span>
                          <strong className="text-2xl font-black text-[#0b5156] font-mono">
                            {Number(alm.cantidad || 0).toFixed(2)}
                          </strong>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              {/* Fuente #9: LoteProducto */}
              <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div>
                    <h3 className="text-lg font-black uppercase tracking-tight text-slate-800 flex items-center gap-2">
                      <Calendar size={18} className="text-[#0b5156]" />
                      Lotes y Vencimientos (Fuente #9: LoteProducto)
                    </h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                      Trazabilidad por serie, lote de producción y fecha límite de consumo
                    </p>
                  </div>
                  <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                    {fichaData.lotes?.length || 0} Lotes
                  </span>
                </div>

                {(!fichaData.lotes || fichaData.lotes.length === 0) ? (
                  <div className="p-8 text-center bg-slate-50 border border-slate-100 rounded-2xl text-slate-400 font-bold text-xs uppercase tracking-wider">
                    Sin lotes o fechas de vencimiento registrados para este producto.
                  </div>
                ) : (
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                          <th className="py-3 px-4">Lote / Identificador</th>
                          <th className="py-3 px-4">Almacén</th>
                          <th className="py-3 px-4 text-center">Fecha Fabricación</th>
                          <th className="py-3 px-4 text-center">Fecha Vencimiento</th>
                          <th className="py-3 px-4 text-right">Cantidad</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {fichaData.lotes.map((l: any) => (
                          <tr key={l.id} className="hover:bg-slate-50">
                            <td className="py-3 px-4 font-mono font-black text-slate-800">{l.lote}</td>
                            <td className="py-3 px-4 font-bold text-slate-600 uppercase">{l.almacen}</td>
                            <td className="py-3 px-4 text-center text-slate-500 font-mono">{l.fecha_fabricacion || 'N/A'}</td>
                            <td className="py-3 px-4 text-center font-mono font-bold text-amber-700">{l.fecha_vencimiento || 'N/A'}</td>
                            <td className="py-3 px-4 text-right font-mono font-black text-[#0b5156]">{Number(l.cantidad || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            </div>
          )}

          {/* =======================================================================
              TAB 2: HISTORIAL CRONOLÓGICO UNIFICADO
             ======================================================================= */}
          {activeTab === 'movimientos' && (
            <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex justify-between items-start flex-wrap gap-4">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight text-slate-800 flex items-center gap-2">
                    <ArrowRightLeft size={20} className="text-[#0b5156]" />
                    Historial Unificado de Movimientos
                  </h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                    Consolidado cronológico de Kardex (#2) + Ajustes (#3) + Transferencias (#5) + Recepciones (#7)
                  </p>
                </div>

                {/* Filtros de Tipo y Fecha */}
                <div className="flex items-center gap-3 flex-wrap">
                  <select
                    value={movFilterType}
                    onChange={(e) => setMovFilterType(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-wider text-slate-700 focus:outline-none focus:border-[#0b5156]"
                  >
                    <option value="TODOS">Todos los Tipos</option>
                    <option value="Kardex">Kardex</option>
                    <option value="Ajuste">Ajuste de Stock</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="Recepcion">Recepción de Compra</option>
                  </select>

                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Desde:</span>
                    <input
                      type="date"
                      value={movStartDate}
                      onChange={(e) => setMovStartDate(e.target.value)}
                      className="bg-transparent text-xs font-bold uppercase text-slate-700 focus:outline-none"
                    />
                    <span className="text-[10px] font-black text-slate-400 uppercase ml-2">Hasta:</span>
                    <input
                      type="date"
                      value={movEndDate}
                      onChange={(e) => setMovEndDate(e.target.value)}
                      className="bg-transparent text-xs font-bold uppercase text-slate-700 focus:outline-none"
                    />
                    {(movStartDate || movEndDate) && (
                      <button
                        onClick={() => { setMovStartDate(''); setMovEndDate(''); }}
                        className="text-slate-400 hover:text-red-500 ml-1"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {movimientosFiltrados.length === 0 ? (
                <div className="p-12 text-center bg-slate-50 border border-slate-100 rounded-2xl text-slate-400 font-bold text-xs uppercase tracking-widest">
                  Sin movimientos registrados bajo los filtros seleccionados.
                </div>
              ) : (
                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                        <th className="py-4 px-4">Fecha</th>
                        <th className="py-4 px-4 text-center">Fuente</th>
                        <th className="py-4 px-4">Subtipo / Operación</th>
                        <th className="py-4 px-4 text-right">Cantidad</th>
                        <th className="py-4 px-6 text-right">Referencia / Observaciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {movimientosFiltrados.map((m: any, idx: number) => {
                        // Colores según fuente
                        const badgeColor =
                          m.tipo === 'Kardex'
                            ? 'bg-teal-50 text-[#0b5156] border-teal-200'
                            : m.tipo === 'Ajuste'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : m.tipo === 'Transferencia'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-purple-50 text-purple-700 border-purple-200';

                        return (
                          <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                              {m.fecha ? new Date(m.fecha).toLocaleString() : 'N/A'}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${badgeColor}`}>
                                {m.tipo}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-black text-slate-700 uppercase">
                              {m.subtipo || m.tipo}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-black text-slate-800">
                              {Number(m.cantidad || 0).toFixed(2)}
                            </td>
                            <td className="py-3 px-6 text-right text-slate-500 font-mono text-[11px]">
                              {m.referencia || m.observaciones || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          )}

          {/* =======================================================================
              TAB 3: DEVOLUCIONES Y CONDICIÓN (FUENTES #11, #12, #13)
             ======================================================================= */}
          {activeTab === 'devoluciones' && (
            <div className="space-y-6">
              {/* Fuente #13: Devoluciones de Cliente (Mostrador / POS) */}
              <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                <div className="flex justify-between items-center flex-wrap gap-3">
                  <div>
                    <h3 className="text-lg font-black uppercase tracking-tight text-slate-800 flex items-center gap-2">
                      <RotateCcw size={18} className="text-rose-600" />
                      Devoluciones de Cliente — Mostrador (Fuente #13 NUEVO)
                    </h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                      Devoluciones en punto de venta con discriminación de stock según condición (BUENO vs DAÑADO)
                    </p>
                  </div>
                  <button
                    onClick={() => setShowDevolucionModal(true)}
                    className="px-4 py-2 bg-[#0b5156] text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-[#083a3d] transition-colors flex items-center gap-1.5"
                  >
                    <Plus size={14} /> Nueva Devolución
                  </button>
                </div>

                {(!fichaData.devoluciones?.cliente || fichaData.devoluciones.cliente.length === 0) ? (
                  <div className="p-8 text-center bg-slate-50 border border-slate-100 rounded-2xl text-slate-400 font-bold text-xs uppercase tracking-wider">
                    Sin devoluciones de cliente registradas en mostrador.
                  </div>
                ) : (
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                          <th className="py-3 px-4">N° Devolución</th>
                          <th className="py-3 px-4">Fecha</th>
                          <th className="py-3 px-4">Factura Origen</th>
                          <th className="py-3 px-4 text-center">Condición</th>
                          <th className="py-3 px-4 text-center">Impacto Stock</th>
                          <th className="py-3 px-4 text-right">Cantidad</th>
                          <th className="py-3 px-6">Motivo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {fichaData.devoluciones.cliente.map((c: any) => (
                          <tr key={c.id} className="hover:bg-slate-50">
                            <td className="py-3 px-4 font-mono font-black text-slate-800">{c.numero}</td>
                            <td className="py-3 px-4 font-mono text-slate-500">
                              {c.fecha ? new Date(c.fecha).toLocaleDateString() : 'N/A'}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-600 font-bold">{c.factura || `ID #${c.venta_id}`}</td>
                            <td className="py-3 px-4 text-center">
                              <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                                c.condicion === 'BUENO'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}>
                                {c.condicion}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              {c.reingreso_stock ? (
                                <span className="text-emerald-600 font-black text-[10px] uppercase">✓ Reingresó a Stock</span>
                              ) : (
                                <span className="text-slate-400 font-black text-[10px] uppercase">✗ No reingresó</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-black text-slate-800">
                              {Number(c.cantidad || 0).toFixed(2)}
                            </td>
                            <td className="py-3 px-6 text-slate-500 italic max-w-xs truncate">{c.motivo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>

              {/* Fuente #12: CuarentenaLogistica cruzando todos los TurnoDespacho */}
              <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div>
                    <h3 className="text-lg font-black uppercase tracking-tight text-slate-800 flex items-center gap-2">
                      <Truck size={18} className="text-amber-600" />
                      Cuarentena Logística (Fuente #12 — Envíos Vehiculares)
                    </h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                      Retenciones y rechazos de campo a través de todos los turnos de despacho de la flota
                    </p>
                  </div>
                  <span className="bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                    {fichaData.devoluciones?.cuarentena?.length || 0} Incidentes
                  </span>
                </div>

                {(!fichaData.devoluciones?.cuarentena || fichaData.devoluciones.cuarentena.length === 0) ? (
                  <div className="p-8 text-center bg-slate-50 border border-slate-100 rounded-2xl text-slate-400 font-bold text-xs uppercase tracking-wider">
                    Sin registros de cuarentena logística para este producto.
                  </div>
                ) : (
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                          <th className="py-3 px-4">Turno Despacho</th>
                          <th className="py-3 px-4">Destino de Ruta</th>
                          <th className="py-3 px-4 text-center">Estado Cuarentena</th>
                          <th className="py-3 px-4 text-right">Cantidad</th>
                          <th className="py-3 px-6">Motivo de Retención</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {fichaData.devoluciones.cuarentena.map((q: any) => (
                          <tr key={q.id} className="hover:bg-slate-50">
                            <td className="py-3 px-4 font-mono font-black text-[#0b5156]">{q.turno}</td>
                            <td className="py-3 px-4 uppercase font-bold text-slate-600">{q.destino || 'Sin especificar'}</td>
                            <td className="py-3 px-4 text-center">
                              <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                                q.estado === 'APROBADO_REINGRESO'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : q.estado === 'DESECHADO'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}>
                                {q.estado}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-black text-slate-800">
                              {Number(q.cantidad || 0).toFixed(2)}
                            </td>
                            <td className="py-3 px-6 text-slate-500 italic max-w-sm truncate">{q.motivo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>

              {/* Fuente #11: DevolucionProveedor */}
              <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div>
                    <h3 className="text-lg font-black uppercase tracking-tight text-slate-800 flex items-center gap-2">
                      <RotateCcw size={18} className="text-slate-600" />
                      Devoluciones a Proveedor (Fuente #11: DevolucionProveedor)
                    </h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                      Mercancía devuelta por la empresa hacia el fabricante o distribuidor
                    </p>
                  </div>
                  <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                    {fichaData.devoluciones?.proveedor?.length || 0} Registros
                  </span>
                </div>

                {(!fichaData.devoluciones?.proveedor || fichaData.devoluciones.proveedor.length === 0) ? (
                  <div className="p-8 text-center bg-slate-50 border border-slate-100 rounded-2xl text-slate-400 font-bold text-xs uppercase tracking-wider">
                    Sin devoluciones registradas hacia proveedores.
                  </div>
                ) : (
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                          <th className="py-3 px-4">N° Devolución</th>
                          <th className="py-3 px-4">Fecha</th>
                          <th className="py-3 px-4">Proveedor</th>
                          <th className="py-3 px-4 text-right">Cantidad</th>
                          <th className="py-3 px-6">Motivo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {fichaData.devoluciones.proveedor.map((p: any) => (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="py-3 px-4 font-mono font-black text-slate-800">{p.numero}</td>
                            <td className="py-3 px-4 font-mono text-slate-500">
                              {p.fecha ? new Date(p.fecha).toLocaleDateString() : 'N/A'}
                            </td>
                            <td className="py-3 px-4 uppercase font-bold text-slate-700">{p.proveedor}</td>
                            <td className="py-3 px-4 text-right font-mono font-black text-slate-800">
                              {Number(p.cantidad || 0).toFixed(2)}
                            </td>
                            <td className="py-3 px-6 text-slate-500 italic max-w-sm truncate">{p.motivo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            </div>
          )}

          {/* =======================================================================
              TAB 4: GARANTÍAS (FUENTE #8)
             ======================================================================= */}
          {activeTab === 'garantias' && (
            <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight text-slate-800 flex items-center gap-2">
                    <ShieldCheck size={20} className="text-[#0b5156]" />
                    Pólizas y Reclamos de Garantía (Fuente #8: Garantia)
                  </h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                    Trazabilidad de garantías emitidas por venta a clientes, validez y reclamos
                  </p>
                </div>
                <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                  {fichaData.garantias?.length || 0} Pólizas
                </span>
              </div>

              {(!fichaData.garantias || fichaData.garantias.length === 0) ? (
                <div className="p-12 text-center bg-slate-50 border border-slate-100 rounded-2xl text-slate-400 font-bold text-xs uppercase tracking-widest">
                  Sin pólizas de garantía emitidas para este producto.
                </div>
              ) : (
                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                        <th className="py-3 px-4">Código Garantía</th>
                        <th className="py-3 px-4">Cliente</th>
                        <th className="py-3 px-4">Factura / Venta</th>
                        <th className="py-3 px-4 text-center">Emisión</th>
                        <th className="py-3 px-4 text-center">Vencimiento</th>
                        <th className="py-3 px-4 text-center">Estado</th>
                        <th className="py-3 px-6">Observaciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {fichaData.garantias.map((g: any) => (
                        <tr key={g.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-mono font-black text-[#0b5156]">{g.codigo}</td>
                          <td className="py-3 px-4 uppercase font-bold text-slate-800">{g.cliente}</td>
                          <td className="py-3 px-4 font-mono text-slate-600">{g.factura || '—'}</td>
                          <td className="py-3 px-4 text-center font-mono text-slate-500">{g.fecha_inicio || 'N/A'}</td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-slate-700">{g.fecha_fin || 'N/A'}</td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                              g.estado === 'ACTIVA' || g.estado === 'VIGENTE'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : g.estado === 'RECLAMADA'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>
                              {g.estado}
                            </span>
                          </td>
                          <td className="py-3 px-6 text-slate-500 italic max-w-xs truncate">{g.observaciones || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          )}

          {/* =======================================================================
              TAB 5: COTIZADO EN (FUENTE #4)
             ======================================================================= */}
          {activeTab === 'cotizaciones' && (
            <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight text-slate-800 flex items-center gap-2">
                    <FileText size={20} className="text-[#0b5156]" />
                    Demanda Potencial: Cotizado en (Fuente #4: CotizacionItem)
                  </h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                    Cotizaciones donde ha aparecido este producto, reflejando interés comercial previo
                  </p>
                </div>
                <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                  {fichaData.cotizaciones?.length || 0} Cotizaciones
                </span>
              </div>

              {(!fichaData.cotizaciones || fichaData.cotizaciones.length === 0) ? (
                <div className="p-12 text-center bg-slate-50 border border-slate-100 rounded-2xl text-slate-400 font-bold text-xs uppercase tracking-widest">
                  Este producto no ha sido incluido en cotizaciones aún.
                </div>
              ) : (
                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                        <th className="py-3 px-4">N° Cotización</th>
                        <th className="py-3 px-4">Fecha</th>
                        <th className="py-3 px-4">Cliente Prospecto</th>
                        <th className="py-3 px-4 text-right">Cant. Cotizada</th>
                        <th className="py-3 px-4 text-right">Precio Ofrecido</th>
                        <th className="py-3 px-6 text-center">Estado Cotización</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {fichaData.cotizaciones.map((c: any) => (
                        <tr key={c.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-mono font-black text-[#0b5156]">{c.numero_cotizacion}</td>
                          <td className="py-3 px-4 font-mono text-slate-500">
                            {c.fecha ? new Date(c.fecha).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="py-3 px-4 uppercase font-bold text-slate-800">{c.cliente}</td>
                          <td className="py-3 px-4 text-right font-mono font-black text-slate-700">
                            {Number(c.cantidad || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                            ${Number(c.precio_unitario || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-6 text-center">
                            <span className="px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                              {c.estado_cotizacion}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          )}

          {/* =======================================================================
              TAB 6: AUDITORÍA DE CONTEO FÍSICO (FUENTE #10)
             ======================================================================= */}
          {activeTab === 'conteos' && (
            <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight text-slate-800 flex items-center gap-2">
                    <ClipboardCheck size={20} className="text-[#0b5156]" />
                    Auditorías de Conteo Físico (Fuente #10: ConteoFisico)
                  </h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                    Comparación histórica entre existencias teóricas del sistema y el levantamiento real
                  </p>
                </div>
                <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                  {fichaData.auditorias_conteo?.length || 0} Auditorías
                </span>
              </div>

              {(!fichaData.auditorias_conteo || fichaData.auditorias_conteo.length === 0) ? (
                <div className="p-12 text-center bg-slate-50 border border-slate-100 rounded-2xl text-slate-400 font-bold text-xs uppercase tracking-widest">
                  Sin auditorías de conteo físico registradas para este ítem.
                </div>
              ) : (
                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                        <th className="py-3 px-4">Fecha Auditoría</th>
                        <th className="py-3 px-4">Almacén</th>
                        <th className="py-3 px-4 text-right">Sistema (Teórico)</th>
                        <th className="py-3 px-4 text-right">Físico (Real)</th>
                        <th className="py-3 px-4 text-right">Diferencia</th>
                        <th className="py-3 px-6 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {fichaData.auditorias_conteo.map((cf: any) => {
                        const diff = Number(cf.diferencia || 0);
                        const isOk = Math.abs(diff) < 0.001;
                        return (
                          <tr key={cf.id} className="hover:bg-slate-50">
                            <td className="py-3 px-4 font-mono text-slate-500">
                              {cf.fecha ? new Date(cf.fecha).toLocaleDateString() : 'N/A'}
                            </td>
                            <td className="py-3 px-4 uppercase font-bold text-slate-700">{cf.almacen}</td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-slate-600">
                              {Number(cf.cantidad_sistema || 0).toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-black text-slate-800">
                              {Number(cf.cantidad_fisica || 0).toFixed(2)}
                            </td>
                            <td className={`py-3 px-4 text-right font-mono font-black ${
                              isOk ? 'text-slate-500' : diff > 0 ? 'text-blue-600' : 'text-rose-600'
                            }`}>
                              {diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)}
                            </td>
                            <td className="py-3 px-6 text-center">
                              <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                                isOk ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}>
                                {isOk ? 'CUADRADO' : 'DESVIACIÓN'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          )}
        </>
      )}

      {/* =======================================================================
          MODAL: NUEVA DEVOLUCIÓN DE CLIENTE (MOSTRADOR / POS)
         ======================================================================= */}
      <DevolucionClienteModal
        isOpen={showDevolucionModal}
        onClose={() => setShowDevolucionModal(false)}
        onSuccess={() => {
          showToast('Devolución registrada exitosamente.', 'success');
          if (selectedProductId) {
            cargarFicha360(selectedProductId);
          }
        }}
        initialProductId={selectedProductId}
        initialProductName={prod?.nombre}
        initialProductSku={prod?.sku}
        stockAlmacenes={fichaData?.stock_almacenes?.map((a: any) => ({
          almacen_id: a.almacen_id,
          almacen_nombre: a.almacen_nombre || a.nombre,
          almacen_tipo: a.almacen_tipo || a.tipo,
        }))}
      />
    </div>
  );
}
