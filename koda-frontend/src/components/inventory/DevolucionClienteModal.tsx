import React, { useState, useEffect } from 'react';
import { X, RotateCcw, AlertTriangle, CheckCircle2, Package, Search } from 'lucide-react';
import { api } from '@/api/client';

interface DevolucionClienteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialProductId?: number | null;
  initialProductName?: string;
  initialProductSku?: string;
  stockAlmacenes?: Array<{ almacen_id: number; almacen_nombre: string; almacen_tipo: string }>;
}

export const DevolucionClienteModal: React.FC<DevolucionClienteModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialProductId = null,
  initialProductName = '',
  initialProductSku = '',
  stockAlmacenes = [],
}) => {
  // Selector de producto si no viene preseleccionado
  const [productos, setProductos] = useState<any[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(initialProductId);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [searchProdTerm, setSearchProdTerm] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [almacenesDisponibles, setAlmacenesDisponibles] = useState<any[]>(stockAlmacenes);

  // Campos de la devolución
  const [devVentaId, setDevVentaId] = useState<string>('');
  const [devAlmacenId, setDevAlmacenId] = useState<string>('');
  const [devCantidad, setDevCantidad] = useState<number>(1);
  const [devMotivo, setDevMotivo] = useState<string>('');
  const [devCondicion, setDevCondicion] = useState<'BUENO' | 'DAÑADO'>('BUENO');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Inicializar producto si viene por props
  useEffect(() => {
    if (isOpen) {
      setSelectedProductId(initialProductId);
      setDevVentaId('');
      setDevAlmacenId('');
      setDevCantidad(1);
      setDevMotivo('');
      setDevCondicion('BUENO');
      setErrorMessage(null);
      setSearchProdTerm(initialProductName ? `${initialProductName} (${initialProductSku})` : '');

      if (initialProductId && initialProductName) {
        setSelectedProduct({
          id: initialProductId,
          nombre: initialProductName,
          sku: initialProductSku,
        });
      } else {
        setSelectedProduct(null);
      }

      // Si no tenemos la lista de productos y no hay producto fijo, cargar catálogo
      if (!initialProductId) {
        api.get<any[]>('/productos').then((prods) => {
          if (Array.isArray(prods)) setProductos(prods);
        }).catch(err => {
          console.error('Error al cargar productos para devolución:', err);
        });
      }

      // Cargar almacenes si no vienen
      if (!stockAlmacenes || stockAlmacenes.length === 0) {
        api.get<any[]>('/inventario/almacenes').catch(() => null).then((alms) => {
          if (Array.isArray(alms)) {
            setAlmacenesDisponibles(alms.map((a: any) => ({
              almacen_id: a.id || a.almacen_id,
              almacen_nombre: a.nombre || a.almacen_nombre,
              almacen_tipo: a.tipo || a.almacen_tipo || 'LOCAL',
            })));
          }
        });
      } else {
        setAlmacenesDisponibles(stockAlmacenes);
      }
    }
  }, [isOpen, initialProductId, initialProductName, initialProductSku]);

  if (!isOpen) return null;

  const filteredProds = productos.filter(p => {
    const q = searchProdTerm.toLowerCase().trim();
    if (!q) return true;
    return (
      (p.nombre || '').toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q)
    );
  }).slice(0, 8);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const targetProdId = selectedProductId || selectedProduct?.id;
    if (!targetProdId) {
      setErrorMessage('Debe seleccionar un producto para la devolución.');
      return;
    }
    if (!devVentaId || !devCantidad || !devMotivo.trim()) {
      setErrorMessage('Por favor complete todos los campos obligatorios (*).');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        venta_id: Number(devVentaId),
        producto_id: targetProdId,
        almacen_id: devAlmacenId ? Number(devAlmacenId) : null,
        cantidad: Number(devCantidad),
        motivo: devMotivo.trim(),
        condicion: devCondicion,
      };

      const res: any = await api.post('/inventario/devoluciones-cliente', payload);
      if (res?.ok || res?.id || res?.numero_devolucion) {
        if (onSuccess) onSuccess();
        onClose();
      } else {
        setErrorMessage(res?.detail || 'No se pudo registrar la devolución.');
      }
    } catch (err: any) {
      console.error('Error al registrar devolución de cliente:', err);
      const msg = err?.response?.data?.detail || err?.message || 'Error al procesar la devolución.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabecera Modal */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
              <RotateCcw size={20} />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-tight text-slate-800 font-mono">
                Registrar Devolución de Cliente
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Mostrador / Punto de Venta
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2.5 text-xs font-bold text-rose-700">
              <AlertTriangle size={16} className="shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Selector o Vista de Producto */}
          {initialProductId && selectedProduct ? (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-[#0b5156] shrink-0">
                <Package size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Producto a Devolver</span>
                <strong className="text-xs font-black text-slate-800 uppercase block truncate">{selectedProduct.nombre}</strong>
                <span className="text-[10px] font-mono font-bold text-slate-500">SKU: {selectedProduct.sku}</span>
              </div>
            </div>
          ) : (
            <div className="relative">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                Producto a Devolver *
              </label>
              <div className="relative">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  placeholder="Buscar producto por nombre o SKU..."
                  value={searchProdTerm}
                  onFocus={() => setShowProductDropdown(true)}
                  onChange={(e) => {
                    setSearchProdTerm(e.target.value);
                    setShowProductDropdown(true);
                    setSelectedProductId(null);
                    setSelectedProduct(null);
                  }}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#0b5156]"
                />
              </div>

              {showProductDropdown && filteredProds.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {filteredProds.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSelectedProductId(p.id);
                        setSelectedProduct(p);
                        setSearchProdTerm(`${p.nombre} (${p.sku})`);
                        setShowProductDropdown(false);
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-50 transition-colors flex flex-col group"
                    >
                      <span className="text-xs font-bold text-slate-800 uppercase group-hover:text-[#0b5156]">
                        {p.nombre}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        SKU: {p.sku} | Stock: {Number(p.stock || 0).toFixed(2)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Venta ID / Factura */}
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
              ID o N° de Venta / Factura *
            </label>
            <input
              type="number"
              required
              placeholder="Ej: 105"
              value={devVentaId}
              onChange={(e) => setDevVentaId(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#0b5156]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                Cantidad a Devolver *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={devCantidad}
                onChange={(e) => setDevCantidad(Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-black text-slate-800 focus:outline-none focus:border-[#0b5156]"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                Almacén de Destino
              </label>
              <select
                value={devAlmacenId}
                onChange={(e) => setDevAlmacenId(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase text-slate-700 focus:outline-none focus:border-[#0b5156]"
              >
                <option value="">Almacén Principal por Defecto</option>
                {almacenesDisponibles?.map((a: any) => (
                  <option key={a.almacen_id} value={a.almacen_id}>
                    {a.almacen_nombre} ({a.almacen_tipo})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Condición con Explicación de Stock */}
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-2">
              Condición del Producto Devuelto *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDevCondicion('BUENO')}
                className={`p-3.5 rounded-2xl border text-left flex flex-col gap-1 transition-all ${
                  devCondicion === 'BUENO'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <strong className="text-xs font-black uppercase">BUENO</strong>
                  {devCondicion === 'BUENO' && <CheckCircle2 size={16} className="text-emerald-600" />}
                </div>
                <span className="text-[10px] font-medium leading-tight text-slate-500">
                  Reingresa inmediatamente a stock e inserta movimiento en Kardex.
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDevCondicion('DAÑADO')}
                className={`p-3.5 rounded-2xl border text-left flex flex-col gap-1 transition-all ${
                  devCondicion === 'DAÑADO'
                    ? 'bg-rose-50 border-rose-300 text-rose-900 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <strong className="text-xs font-black uppercase">DAÑADO</strong>
                  {devCondicion === 'DAÑADO' && <AlertTriangle size={16} className="text-rose-600" />}
                </div>
                <span className="text-[10px] font-medium leading-tight text-slate-500">
                  NO suma a stock. Queda registrado en trazabilidad para auditoría.
                </span>
              </button>
            </div>
          </div>

          {/* Motivo */}
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">
              Motivo de la Devolución *
            </label>
            <textarea
              required
              rows={3}
              placeholder="Describa la razón del cliente (ej: cambio por otro modelo, defecto, caja abierta)..."
              value={devMotivo}
              onChange={(e) => setDevMotivo(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-[#0b5156]"
            />
          </div>

          {/* Botones */}
          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-[#0b5156] text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-[#083a3d] transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-teal-900/20"
            >
              {isSubmitting ? 'Procesando...' : 'Confirmar Devolución'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DevolucionClienteModal;
