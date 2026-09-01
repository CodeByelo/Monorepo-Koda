import { useState, useEffect } from 'react';
import { X, Image as ImageIcon } from 'lucide-react';
import { api } from '@/api/client';

export interface Producto {
  id: number;
  sku: string;
  nombre: string;
  precio_usd: number | string;
  precio_detal?: number | string | null;
  precio_mayor?: number | string | null;
  precio_gran_mayor?: number | string | null;
  costo_usd: number | string;
  stock: number;
  es_exento: boolean;
  imagen_url?: string;
}

interface ProductEditModalProps {
  product: Producto | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const ProductEditModal = ({
  product,
  isOpen,
  onClose,
  onSaved
}: ProductEditModalProps) => {
  // Form states
  const [sku, setSku] = useState('');
  const [nombre, setNombre] = useState('');
  const [precioUsd, setPrecioUsd] = useState('');
  const [precioDetal, setPrecioDetal] = useState('');
  const [precioMayor, setPrecioMayor] = useState('');
  const [precioGranMayor, setPrecioGranMayor] = useState('');
  const [costoUsd, setCostoUsd] = useState('');
  const [stock, setStock] = useState('0');
  const [esExento, setEsExento] = useState(false);
  const [imagenUrl, setImagenUrl] = useState('');
  const [imagenFile, setImagenFile] = useState<File | null>(null);
  const [imagenPreview, setImagenPreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagenError, setImagenError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const resetImagenState = () => {
    setImagenFile(null);
    setImagenPreview(null);
    setImagenError(null);
  };

  useEffect(() => {
    if (!isOpen) return;

    setFormError(null);
    if (product) {
      setSku(product.sku || '');
      setNombre(product.nombre || '');
      setPrecioUsd(product.precio_usd != null ? String(product.precio_usd) : '');
      setPrecioDetal(product.precio_detal != null ? String(product.precio_detal) : '');
      setPrecioMayor(product.precio_mayor != null ? String(product.precio_mayor) : '');
      setPrecioGranMayor(product.precio_gran_mayor != null ? String(product.precio_gran_mayor) : '');
      setCostoUsd(product.costo_usd != null ? String(product.costo_usd) : '');
      setStock(product.stock != null ? String(product.stock) : '0');
      setEsExento(Boolean(product.es_exento));
      setImagenUrl(product.imagen_url || '');
      setImagenFile(null);
      setImagenPreview(product.imagen_url || null);
      setImagenError(null);
    } else {
      setSku('');
      setNombre('');
      setPrecioUsd('');
      setPrecioDetal('');
      setPrecioMayor('');
      setPrecioGranMayor('');
      setCostoUsd('');
      setStock('0');
      setEsExento(false);
      setImagenUrl('');
      resetImagenState();
    }
  }, [product, isOpen]);

  if (!isOpen) return null;

  const handleImagenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setImagenError(null);
    if (!file) {
      setImagenFile(null);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setImagenError('El archivo seleccionado no es una imagen válida.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImagenError('La imagen supera el tamaño máximo permitido (5MB).');
      return;
    }
    setImagenFile(file);
    setImagenPreview(URL.createObjectURL(file));
  };

  const subirImagenProducto = async (productoId: number) => {
    if (!imagenFile) return;
    setUploadingImage(true);
    setImagenError(null);
    try {
      const formData = new FormData();
      formData.append('file', imagenFile);
      const actualizado = await api.post<Producto>(`/productos/${productoId}/imagen`, formData);
      setImagenUrl(actualizado.imagen_url || '');
    } catch (err: any) {
      setImagenError(err.message || 'Error al subir la imagen del producto');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSaving(true);
    try {
      const payload = {
        sku,
        nombre,
        precio_usd: parseFloat(precioUsd),
        // Los 3 tiers son opcionales: si el usuario deja el campo vacío se
        // envía undefined y el backend aplica su propio fallback (precio_detal
        // cae a precio_usd; mayor/gran_mayor quedan sin configurar).
        precio_detal: precioDetal.trim() ? parseFloat(precioDetal) : undefined,
        precio_mayor: precioMayor.trim() ? parseFloat(precioMayor) : undefined,
        precio_gran_mayor: precioGranMayor.trim() ? parseFloat(precioGranMayor) : undefined,
        costo_usd: parseFloat(costoUsd),
        stock: parseInt(stock, 10),
        es_exento: esExento,
        imagen_url: imagenUrl.trim() || undefined
      };

      let productoId = product?.id;
      if (product) {
        await api.put(`/productos/${product.id}`, payload);
      } else {
        const creado = await api.post<Producto>('/productos', payload);
        productoId = creado.id;
      }

      if (imagenFile && productoId) {
        await subirImagenProducto(productoId);
      }

      onSaved();
    } catch (err: any) {
      setFormError(err.message || err.response?.data?.detail || 'Error al guardar producto');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl p-8 max-w-md w-full border border-[#0b5156]/20 shadow-2xl relative animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <button 
          onClick={onClose}
          type="button"
          className="absolute top-6 right-6 text-slate-400 hover:text-slate-600"
        >
          <X size={18} />
        </button>
        <h3 className="text-xl font-black uppercase text-slate-800 tracking-tight mb-6">
          {product ? 'Editar Producto' : 'Nuevo Producto'}
        </h3>
        {formError && (
          <div className="p-3 mb-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold">
            {formError}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">SKU / Código</label>
            <input 
              type="text" 
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              required
              placeholder="Ej. HAR-INT-25"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Nombre del Producto</label>
            <input 
              type="text" 
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              placeholder="Ej. Harina integral 25kg"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Costo USD</label>
              <input 
                type="number" 
                step="0.01" 
                value={costoUsd}
                onChange={(e) => setCostoUsd(e.target.value)}
                required
                placeholder="0.00"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Precio USD</label>
              <input 
                type="number" 
                step="0.01" 
                value={precioUsd}
                onChange={(e) => setPrecioUsd(e.target.value)}
                required
                placeholder="0.00"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
              Tarifas por Segmento (Opcional)
            </label>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight mb-2">
              Si se dejan vacías, "Detal" toma el Precio USD y "Mayor"/"Gran Mayor" caen de vuelta al Precio USD al facturar.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Detal</label>
                <input
                  type="number"
                  step="0.01"
                  value={precioDetal}
                  onChange={(e) => setPrecioDetal(e.target.value)}
                  placeholder={precioUsd || '0.00'}
                  className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                />
              </div>
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Mayor</label>
                <input
                  type="number"
                  step="0.01"
                  value={precioMayor}
                  onChange={(e) => setPrecioMayor(e.target.value)}
                  placeholder={precioUsd || '0.00'}
                  className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                />
              </div>
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Gran Mayor</label>
                <input
                  type="number"
                  step="0.01"
                  value={precioGranMayor}
                  onChange={(e) => setPrecioGranMayor(e.target.value)}
                  placeholder={precioUsd || '0.00'}
                  className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Imagen del Producto (Opcional)</label>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                {imagenPreview ? (
                  <img
                    src={imagenPreview}
                    alt="Vista previa"
                    className="w-full h-full object-cover"
                    onError={() => setImagenError('No se pudo cargar la vista previa de la imagen.')}
                  />
                ) : (
                  <ImageIcon size={20} className="text-slate-400" />
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleImagenChange}
                disabled={uploadingImage}
                className="w-full text-xs font-bold text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-[10px] file:font-black file:uppercase file:tracking-widest file:bg-[#0b5156] file:text-white hover:file:bg-[#093e42] disabled:opacity-50"
              />
            </div>
            {uploadingImage && (
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-1.5">Subiendo imagen...</p>
            )}
            {imagenError && (
              <p className="text-[10px] font-bold text-red-500 uppercase mt-1.5">{imagenError}</p>
            )}
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Stock Inicial</label>
            <input 
              type="number" 
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              required
              disabled={!!product}
              placeholder="0"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156] disabled:opacity-50"
            />
          </div>
          <div className="flex items-center gap-2 pt-2">
            <input 
              type="checkbox" 
              id="esExento"
              checked={esExento}
              onChange={(e) => setEsExento(e.target.checked)}
              className="w-4 h-4 text-[#0b5156] focus:ring-[#0b5156] border-slate-300 rounded"
            />
            <label htmlFor="esExento" className="text-xs font-black text-slate-600 uppercase tracking-tight">Exento de IVA (0%)</label>
          </div>

          <div className="pt-4">
            <button 
              type="submit"
              disabled={isSaving}
              className="w-full bg-[#0b5156] hover:bg-[#093e42] text-white font-black py-4 rounded-xl uppercase text-[11px] tracking-widest shadow-lg transition-all disabled:opacity-50"
            >
              {isSaving ? 'Guardando...' : (product ? 'Guardar Cambios' : 'Crear Producto')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
