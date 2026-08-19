import React, { useState, useEffect } from 'react';
import { Search, Save, RefreshCcw, AlertTriangle, CheckCircle2, Info, BookOpen, X } from 'lucide-react';
import { api } from '@/api/client';

// Los 3 tiers fijos de negocio. El cliente pidió exactamente estos 3 —
// no un sistema de N segmentos arbitrarios (ver auditoría previa).
const TIERS = [
  { key: 'precio_mayor', label: 'Mayor' },
  { key: 'precio_detal', label: 'Detal' },
  { key: 'precio_gran_mayor', label: 'Gran Mayor' },
] as const;

interface Producto {
  id: number;
  sku: string;
  nombre: string;
  costo_usd: number | string;
  precio_usd: number | string;
  precio_detal?: number | string | null;
  precio_mayor?: number | string | null;
  precio_gran_mayor?: number | string | null;
  stock: number;
  stock_minimo: number;
  es_exento: boolean;
  imagen_url?: string | null;
}

// Fila de edición local: valores como string para permitir campos vacíos
// mientras el usuario escribe, antes de convertir a número al guardar.
interface DraftRow {
  precio_detal: string;
  precio_mayor: string;
  precio_gran_mayor: string;
}

const toNum = (v: unknown): number => {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

const PriceLists = () => {
  const [rate, setRate] = useState(0);
  const [products, setProducts] = useState<Producto[]>([]);
  const [drafts, setDrafts] = useState<Record<number, DraftRow>>({});
  const [dirtyIds, setDirtyIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showManualModal, setShowManualModal] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const buildDraft = (p: Producto): DraftRow => ({
    precio_detal: p.precio_detal != null ? String(p.precio_detal) : '',
    precio_mayor: p.precio_mayor != null ? String(p.precio_mayor) : '',
    precio_gran_mayor: p.precio_gran_mayor != null ? String(p.precio_gran_mayor) : '',
  });

  const fetchProducts = async () => {
    try {
      const res: any = await api.get('/productos');
      const productList: Producto[] = Array.isArray(res) ? res : (res.data || []);
      setProducts(productList);
      const nextDrafts: Record<number, DraftRow> = {};
      productList.forEach(p => {
        nextDrafts[p.id] = buildDraft(p);
      });
      setDrafts(nextDrafts);
      setDirtyIds(new Set());
    } catch (error) {
      console.error('Error fetching price lists', error);
      throw error;
    }
  };

  const fetchRate = async () => {
    try {
      const res: any = await api.get('/tasa/actual');
      const val = Number(res?.valor_ves || res?.tasa || 0);
      if (val > 0) setRate(val);
    } catch (err) {
      console.error('Error fetching active BCV rate:', err);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchRate(), fetchProducts().catch(() => {})]);
      setLoading(false);
    })();
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    showToast('Sincronizando precios con el servidor...', 'info');
    try {
      await fetchProducts();
      showToast('Precios sincronizados exitosamente.');
    } catch (err) {
      showToast('Error al sincronizar precios.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTierChange = (productId: number, tierKey: keyof DraftRow, value: string) => {
    setDrafts(prev => ({
      ...prev,
      [productId]: { ...prev[productId], [tierKey]: value },
    }));
    setDirtyIds(prev => new Set(prev).add(productId));
  };

  const saveRow = async (p: Producto) => {
    const draft = drafts[p.id];
    if (!draft) return;
    // El endpoint PUT /productos/{id} hace un reemplazo completo (ProductoCreate),
    // así que se reenvían también los campos no editados en esta vista.
    const payload = {
      sku: p.sku,
      nombre: p.nombre,
      precio_usd: toNum(p.precio_usd),
      precio_detal: draft.precio_detal.trim() ? toNum(draft.precio_detal) : undefined,
      precio_mayor: draft.precio_mayor.trim() ? toNum(draft.precio_mayor) : undefined,
      precio_gran_mayor: draft.precio_gran_mayor.trim() ? toNum(draft.precio_gran_mayor) : undefined,
      costo_usd: toNum(p.costo_usd),
      stock: Number(p.stock) || 0,
      stock_minimo: Number(p.stock_minimo) || 10,
      es_exento: p.es_exento,
      imagen_url: p.imagen_url || undefined,
    };
    const actualizado = await api.put<Producto>(`/productos/${p.id}`, payload);
    setProducts(prev => prev.map(prod => (prod.id === p.id ? actualizado : prod)));
    setDrafts(prev => ({ ...prev, [p.id]: buildDraft(actualizado) }));
  };

  const handleSaveAll = async () => {
    const idsToSave = Array.from(dirtyIds);
    if (idsToSave.length === 0) {
      showToast('No hay cambios de tarifas para guardar.', 'info');
      return;
    }
    setIsSaving(true);
    let failed = 0;
    for (const id of idsToSave) {
      const producto = products.find(p => p.id === id);
      if (!producto) continue;
      try {
        await saveRow(producto);
      } catch (err) {
        failed += 1;
        console.error(`Error guardando tarifas del producto ${id}`, err);
      }
    }
    setIsSaving(false);
    if (failed === 0) {
      setDirtyIds(new Set());
      showToast(`Tarifas actualizadas exitosamente (${idsToSave.length} producto(s)).`);
    } else {
      showToast(`${failed} de ${idsToSave.length} producto(s) no pudieron guardarse.`, 'error');
    }
  };

  const filteredProducts = products.filter(p =>
    p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden flex justify-between items-center">
        <div className="space-y-1">
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Matriz de Precios</h1>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-tight">
            Tarifas fijas por producto: Mayor, Detal y Gran Mayor.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowManualModal(true)}
            className="bg-white text-slate-600 px-4 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 flex items-center gap-2 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <BookOpen size={16} /> Guía de Uso
          </button>
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="bg-white text-slate-600 px-6 py-2.5 rounded-xl text-xs font-black uppercase border border-slate-200 flex items-center gap-2 tracking-widest hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCcw size={14} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
          <button
            onClick={handleSaveAll}
            disabled={isSaving || dirtyIds.size === 0}
            className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase shadow-lg shadow-green-900/20 flex items-center gap-2 tracking-widest hover:bg-[#083a3d] transition-colors disabled:opacity-50"
          >
            <Save size={14} /> {isSaving ? 'Guardando...' : `Guardar${dirtyIds.size > 0 ? ` (${dirtyIds.size})` : ''}`}
          </button>
        </div>
      </header>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex gap-4 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filtrar SKU o Producto..."
                className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]/30"
              />
            </div>
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-[#0b5156]/20 rounded-xl">
              <span className="text-[9px] font-black text-[#0b5156] uppercase">Tasa BCV:</span>
              <span className="text-xs font-black text-slate-800">Bs. {rate.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
              <tr className="text-xs font-black text-slate-400 uppercase tracking-widest">
                <th className="p-4 border-r border-slate-100 w-32">SKU</th>
                <th className="p-4 border-r border-slate-100">Producto</th>
                <th className="p-4 border-r border-slate-100 w-32 text-center">Costo (USD)</th>
                <th className="p-4 border-r border-slate-100 w-32 text-center">Precio USD</th>
                {TIERS.map(t => (
                  <th key={t.key} className="p-4 border-r border-slate-100 w-36 text-center text-[#0b5156]">
                    {t.label} (USD)
                  </th>
                ))}
                <th className="p-4 w-24 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-xs font-bold text-slate-400 uppercase">
                    Cargando catálogo...
                  </td>
                </tr>
              )}
              {!loading && filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                      <Info size={32} className="text-slate-300" />
                      <p className="text-xs font-bold uppercase tracking-widest">No hay productos disponibles</p>
                      <p className="text-[10px]">Crea productos en Inventario para configurar sus tarifas aquí.</p>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && filteredProducts.map((p) => {
                const draft = drafts[p.id] || buildDraft(p);
                const isDirty = dirtyIds.has(p.id);
                return (
                  <tr key={p.id} className={`group hover:bg-slate-50/50 transition-colors font-mono ${isDirty ? 'bg-amber-50/40' : ''}`}>
                    <td className="p-4 border-r border-slate-100 text-xs font-bold text-slate-500 uppercase">{p.sku}</td>
                    <td className="p-4 border-r border-slate-100 text-xs font-bold text-slate-800 uppercase font-sans">{p.nombre}</td>
                    <td className="p-4 border-r border-slate-100 text-center text-xs font-black text-slate-500">
                      ${toNum(p.costo_usd).toFixed(2)}
                    </td>
                    <td className="p-4 border-r border-slate-100 text-center text-xs font-black text-slate-700">
                      ${toNum(p.precio_usd).toFixed(2)}
                    </td>
                    {TIERS.map(t => (
                      <td key={t.key} className="p-0 border-r border-slate-100">
                        <input
                          type="number"
                          step="0.01"
                          value={draft[t.key]}
                          onChange={(e) => handleTierChange(p.id, t.key, e.target.value)}
                          placeholder={toNum(p.precio_usd).toFixed(2)}
                          className="w-full h-full p-4 bg-transparent focus:bg-white focus:shadow-[inset_0_0_0_2px_#0b5156] outline-none text-center font-black text-[#0b5156]"
                        />
                      </td>
                    ))}
                    <td className="p-4 text-center">
                      {isDirty ? (
                        <span className="text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-lg uppercase">
                          Sin guardar
                        </span>
                      ) : (
                        <span className="text-[9px] font-black text-green-600 bg-green-50 border border-green-100 px-2 py-0.5 rounded-lg uppercase">
                          Guardado
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[110] animate-in slide-in-from-bottom duration-300">
          <div className={`px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-md border ${
            toast.type === 'error'
              ? 'bg-rose-500/95 text-white border-rose-400'
              : toast.type === 'info'
              ? 'bg-blue-600/95 text-white border-blue-500'
              : 'bg-[#0b5156]/95 text-white border-[#0b5156]/50'
          }`}>
            {toast.type === 'error' ? (
              <AlertTriangle size={18} />
            ) : toast.type === 'info' ? (
              <Info size={18} />
            ) : (
              <CheckCircle2 size={18} />
            )}
            <span className="text-xs font-black uppercase tracking-wider">{toast.message}</span>
          </div>
        </div>
      )}

      {showManualModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-8 border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase mb-2">Guía de Uso: Matriz de Precios</h2>
                <p className="text-xs text-slate-400 font-bold uppercase">Manual rápido para entender la interfaz.</p>
              </div>
              <button onClick={() => setShowManualModal(false)} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors">
                <X size={16} className="text-slate-500" />
              </button>
            </div>

            <div className="space-y-6">
              <section>
                <h3 className="text-sm font-black text-[#0b5156] uppercase mb-2 flex items-center gap-2"><Info size={16}/> 1. Los 3 Tiers Fijos</h3>
                <p className="text-sm text-slate-600 font-medium">
                  Esta vista gestiona exactamente 3 tarifas de negocio por producto: <strong>Mayor</strong>, <strong>Detal</strong> y <strong>Gran Mayor</strong>.
                  Un tier vacío significa que ese producto todavía no tiene esa tarifa configurada; al facturar (POS o Nueva Factura) el sistema usará el
                  Precio USD base como respaldo automático para ese tier.
                </p>
              </section>
              <section>
                <h3 className="text-sm font-black text-[#0b5156] uppercase mb-2 flex items-center gap-2"><CheckCircle2 size={16}/> 2. Edición y Guardado</h3>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <p className="text-sm text-slate-700 font-medium mb-3">
                    Haz clic en cualquier celda de Mayor/Detal/Gran Mayor y edítala directamente. Las filas modificadas se marcan como
                    <strong> "Sin guardar"</strong>. Haz clic en <strong className="text-white bg-[#0b5156] px-2 py-0.5 rounded shadow-sm">Guardar</strong> para
                    persistir los cambios contra el backend real (se guardan uno por uno; si alguno falla, verás cuántos fallaron en el aviso).
                  </p>
                  <p className="text-sm text-slate-700 font-medium">
                    Para crear o eliminar productos usa el módulo de <strong>Inventario</strong> y luego <strong>Sincronizar</strong> aquí.
                  </p>
                </div>
              </section>
            </div>

            <div className="mt-8 text-right">
              <button onClick={() => setShowManualModal(false)} className="bg-[#0b5156] text-white px-8 py-3 rounded-xl text-xs font-black uppercase hover:bg-[#073639] transition-colors shadow-lg shadow-[#0b5156]/20">
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PriceLists;
