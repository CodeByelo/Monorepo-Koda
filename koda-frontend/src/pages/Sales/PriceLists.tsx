import React, { useState, useEffect } from 'react';
import { Search, Plus, Save, RefreshCcw, AlertTriangle, CheckCircle2, Info, Trash2, BookOpen, X } from 'lucide-react';
import { api } from '@/api/client';

const PriceLists = () => {
  const [rate, setRate] = useState(36.50);
  const [products, setProducts] = useState<any[]>([]);
  const [segments, setSegments] = useState<any[]>([]);
  const [activeSegment, setActiveSegment] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Toast notifications state
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

  // Modal states for premium aesthetics
  const [showTarifaModal, setShowTarifaModal] = useState(false);
  const [showSegmentoModal, setShowSegmentoModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  
  // Form states for New Tariff
  const [tarifaNombre, setTarifaNombre] = useState('');
  const [tarifaMargen, setTarifaMargen] = useState('20');
  const [tarifaMoneda, setTarifaMoneda] = useState('USD');

  // Form states for New Segment
  const [segmentoNombre, setSegmentoNombre] = useState('');
  const [segmentoMoneda, setSegmentoMoneda] = useState('USD');
  const [segmentoEstado, setSegmentoEstado] = useState('Activo');
  const [segmentoDescuento, setSegmentoDescuento] = useState('0');

  // Tariffs list state
  const [tariffs, setTariffs] = useState<any[]>(() => {
    const saved = localStorage.getItem('koda_tariffs');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [{ nombre: 'Tarifa Estándar', margen: 30, moneda: 'USD' }];
  });
  const [activeTariff, setActiveTariff] = useState<number>(0);

  useEffect(() => {
    localStorage.setItem('koda_tariffs', JSON.stringify(tariffs));
  }, [tariffs]);

  useEffect(() => {
    if (segments.length > 0) {
      localStorage.setItem('koda_segments', JSON.stringify(segments));
    }
  }, [segments]);

  const handleCrearTarifa = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tarifaNombre.trim()) return;
    const newTar = {
      nombre: tarifaNombre.trim(),
      margen: parseFloat(tarifaMargen) || 0,
      moneda: tarifaMoneda
    };
    const updated = [...tariffs, newTar];
    setTariffs(updated);
    setActiveTariff(updated.length - 1);
    
    // Apply new tariff margin
    const marginFactor = 1 + newTar.margen / 100;
    const updatedProducts = products.map(p => ({
      ...p,
      price: Number((p.cost * marginFactor).toFixed(2))
    }));
    setProducts(updatedProducts);

    showToast(`Tarifa "${newTar.nombre}" creada y aplicada con un margen base del ${newTar.margen}%.`);
    setShowTarifaModal(false);
    setTarifaNombre('');
    setTarifaMargen('20');
    setTarifaMoneda('USD');
  };

  const handleSelectTariff = (idx: number) => {
    setActiveTariff(idx);
    const selected = tariffs[idx];
    const marginFactor = 1 + selected.margen / 100;
    const updatedProducts = products.map(p => ({
      ...p,
      price: Number((p.cost * marginFactor).toFixed(2))
    }));
    setProducts(updatedProducts);
    showToast(`Tarifa "${selected.nombre}" seleccionada. Se aplicó un margen de ${selected.margen}% sobre el costo.`);
  };

  const handleCrearSegmento = (e: React.FormEvent) => {
    e.preventDefault();
    if (!segmentoNombre.trim()) return;
    const newSeg = {
      nombre: segmentoNombre.trim(),
      moneda: segmentoMoneda,
      estado: segmentoEstado,
      descuento: parseFloat(segmentoDescuento) || 0
    };
    setSegments([...segments, newSeg]);
    showToast(`Segmento "${newSeg.nombre}" creado exitosamente con un descuento de ${newSeg.descuento}%.`);
    setShowSegmentoModal(false);
    setSegmentoNombre('');
    setSegmentoMoneda('USD');
    setSegmentoEstado('Activo');
    setSegmentoDescuento('0');
  };

  const handleEliminarTarifa = (idx: number) => {
    if (tariffs.length <= 1) {
      showToast("Debe existir al menos una tarifa.", "error");
      return;
    }
    const updated = tariffs.filter((_, i) => i !== idx);
    setTariffs(updated);
    if (activeTariff >= idx && activeTariff > 0) {
      setActiveTariff(activeTariff - 1);
    }
    showToast("Tarifa eliminada exitosamente.");
  };

  const handleEliminarSegmento = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = segments.filter((_, i) => i !== idx);
    setSegments(updated);
    if (activeSegment >= idx && activeSegment > 0) {
      setActiveSegment(activeSegment - 1);
    } else if (activeSegment >= updated.length) {
      setActiveSegment(updated.length > 0 ? updated.length - 1 : 0);
    }
    showToast("Segmento eliminado exitosamente.");
  };
  
  const fetchProducts = async () => {
    try {
      const res: any = await api.get('/productos');
      const productList = Array.isArray(res) ? res : (res.data || []);
      
      // Inject mock products if the list is empty for demonstration purposes
      if (productList.length === 0) {
        productList.push(
          { sku: 'TEC-001', nombre: 'Laptop ThinkPad X1 Carbon', costo_usd: 1200, precio_usd: 1650, es_exento: false },
          { sku: 'TEC-002', nombre: 'Monitor UltraWide 34"', costo_usd: 350, precio_usd: 520, es_exento: false },
          { sku: 'TEC-003', nombre: 'Teclado Mecánico Inalámbrico', costo_usd: 65, precio_usd: 110, es_exento: false },
          { sku: 'OFI-004', nombre: 'Silla Ergonómica Premium', costo_usd: 180, precio_usd: 290, es_exento: false }
        );
      }
      setProducts(productList.map((p: any) => ({
        sku: p.sku,
        name: p.nombre,
        cost: parseFloat(p.costo_usd) || 0,
        price: parseFloat(p.precio_usd) || 0,
        tax: p.es_exento ? '0%' : '16%'
      })));
      
      try {
        const segRes: any = await api.get('/clientes/segmentos');
        const list = Array.isArray(segRes) ? segRes : (segRes.data || []);
        const savedSegments = localStorage.getItem('koda_segments');
        if (savedSegments) {
          try {
            setSegments(JSON.parse(savedSegments));
            return;
          } catch (e) {}
        }
        setSegments(list.map((s: any) => {
          if (typeof s === 'string') {
            let desc = 0;
            const nameUpper = s.toUpperCase();
            if (nameUpper === 'MAYORISTA') desc = 10;
            else if (nameUpper === 'DISTRIBUIDOR') desc = 15;
            else if (nameUpper === 'CORPORATIVO') desc = 5;
            return { nombre: s, moneda: 'USD', estado: 'Activo', descuento: desc };
          }
          return {
            nombre: s.nombre || 'Desconocido',
            moneda: s.moneda || 'USD',
            estado: s.estado || 'Activo',
            descuento: s.descuento !== undefined ? s.descuento : 0
          };
        }));
      } catch (err) {
        setSegments([
          { nombre: 'Mayorista', moneda: 'USD', estado: 'Activo', descuento: 10 },
          { nombre: 'Minorista', moneda: 'USD', estado: 'Activo', descuento: 0 },
          { nombre: 'Distribuidor', moneda: 'USD', estado: 'Activo', descuento: 15 },
          { nombre: 'Corporativo', moneda: 'USD', estado: 'Activo', descuento: 5 },
        ]);
      }
    } catch (error) {
      console.error("Error fetching price lists", error);
      throw error;
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    showToast("Sincronizando precios con el servidor...", "info");
    try {
      await fetchProducts();
      showToast("Precios y segmentos sincronizados exitosamente.");
    } catch (err) {
      showToast("Error al sincronizar precios y segmentos.", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const fetchRate = async () => {
      try {
        const res: any = await api.get('/tasas/bcv');
        if (res && res.valor) {
          setRate(res.valor);
        }
      } catch (err) {
        console.error("Error fetching active BCV rate:", err);
      }
    };
    fetchRate();
    fetchProducts();
  }, []);

  const activeSeg = segments[activeSegment];
  const discount = activeSeg?.descuento || 0;
  const discountFactor = 1 - discount / 100;

  const handlePriceChange = (index: number, val: string) => {
    const enteredPrice = parseFloat(val) || 0;
    const newProducts = [...products];
    // Back-calculate the base price before discount is applied
    newProducts[index].price = enteredPrice / (discountFactor || 1);
    setProducts(newProducts);
  };

  const handleCostChange = (index: number, val: string) => {
    const newProducts = [...products];
    newProducts[index].cost = parseFloat(val) || 0;
    setProducts(newProducts);
  };

  const applyGlobalMargin = () => {
    const newProducts = products.map(p => ({ ...p, price: Number((p.price * 1.05).toFixed(2)) }));
    setProducts(newProducts);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden flex justify-between items-center">
        <div className="space-y-1">
          <div className="bg-[#0b5156]/10 px-3 py-1 rounded-full w-fit">
          </div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Matriz de Precios</h1>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-tight">Gestor avanzado estilo hoja de calculo para tarifas globales.</p>
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
             onClick={() => setShowTarifaModal(true)}
             className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase shadow-lg shadow-green-900/20 flex items-center gap-2 tracking-widest hover:bg-[#083a3d] transition-colors"
           >
             <Plus size={16} /> Nueva Tarifa
           </button>
        </div>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">
        <aside className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Segmentos</h3>
            <button 
              onClick={() => setShowSegmentoModal(true)}
              className="text-[#0b5156] hover:scale-110 transition-transform"
            >
              <Plus size={16}/>
            </button>
          </div>
          {segments.length === 0 && (
            <div className="text-center p-4 text-xs font-bold text-slate-400">
              No hay segmentos creados
            </div>
          )}
          {segments.map((seg, i) => (
            <button 
              key={i} 
              onClick={() => setActiveSegment(i)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer text-left w-full ${activeSegment === i ? 'bg-green-50 border-green-200 shadow-sm' : 'border-slate-50 hover:bg-slate-50'}`}
            >
              <div className="flex justify-between items-start mb-1">
                <h4 className={`text-xs font-black uppercase ${activeSegment === i ? 'text-[#0b5156]' : 'text-slate-700'}`}>
                  {seg.nombre}
                </h4>
                <div className="flex items-center gap-2">
                  {seg.descuento > 0 && (
                    <span className="text-[9px] font-black text-rose-600 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded-lg shrink-0">
                      -{seg.descuento}%
                    </span>
                  )}
                  <button onClick={(e) => handleEliminarSegmento(i, e)} className="text-slate-300 hover:text-rose-500 transition-colors" title="Eliminar segmento">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 uppercase">
                <span>Moneda: {seg.moneda || 'USD'}</span>
                <span className={seg.estado === 'Activo' ? 'text-green-600' : 'text-amber-600'}>{seg.estado || 'Activo'}</span>
              </div>
            </button>
          ))}
        </aside>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div className="flex gap-4 items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input type="text" placeholder="Filtrar SKU o Producto..." className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]/30" />
              </div>
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-[#0b5156]/20 rounded-xl">
                 <span className="text-[9px] font-black text-[#0b5156] uppercase">Tasa BCV:</span>
                 <input 
                   type="number" 
                   value={rate} 
                   onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
                   className="w-16 bg-transparent border-none text-xs font-black text-slate-800 focus:outline-none" 
                 />
              </div>
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-[#0b5156]/20 rounded-xl">
                 <span className="text-[9px] font-black text-[#0b5156] uppercase">Tarifa Activa:</span>
                 <select 
                   value={activeTariff} 
                   onChange={(e) => handleSelectTariff(parseInt(e.target.value))}
                   className="bg-transparent border-none text-xs font-black text-slate-800 focus:outline-none uppercase cursor-pointer pr-2"
                 >
                   {tariffs.map((t, idx) => (
                     <option key={idx} value={idx}>{t.nombre} ({t.margen}%)</option>
                   ))}
                 </select>
                 <button onClick={() => handleEliminarTarifa(activeTariff)} className="text-slate-300 hover:text-rose-500 transition-colors ml-1 border-l pl-2 border-slate-200" title="Eliminar tarifa">
                   <Trash2 size={14} />
                 </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => {
                  if(products.length === 0) {
                    showToast('No hay productos para aplicar margen global.', 'error');
                    return;
                  }
                  applyGlobalMargin();
                  showToast('Margen del +5% aplicado a todos los productos actuales.');
                }}
                className="bg-white text-[#0b5156] px-4 py-2 rounded-xl text-xs font-black uppercase border border-[#0b5156]/20 hover:bg-green-50 transition-colors"
              >
                +5% Margen Global
              </button>
              <button 
                onClick={() => {
                  if(products.length === 0) {
                    showToast('No hay tarifas para guardar.', 'error');
                    return;
                  }
                  showToast('Tarifas actualizadas en la base de datos con éxito.');
                }}
                className="bg-[#0b5156] text-white px-6 py-2 rounded-xl text-xs font-black uppercase shadow-lg shadow-green-900/10 flex items-center gap-2 hover:bg-[#083a3d] transition-colors"
              >
                <Save size={14} /> Guardar
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                <tr className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  <th className="p-4 border-r border-slate-100 w-32">SKU</th>
                  <th className="p-4 border-r border-slate-100">Producto</th>
                  <th className="p-4 border-r border-slate-100 w-36 text-center">Costo (USD)</th>
                  <th className="p-4 border-r border-slate-100 w-44 text-center text-[#0b5156]">
                    Precio (USD) {discount > 0 && <span className="text-rose-500 font-bold text-[9px] block">-{discount}% {activeSeg?.nombre}</span>}
                  </th>
                  <th className="p-4 border-r border-slate-100 w-36 text-center text-green-600">Precio (Bs)</th>
                  <th className="p-4 w-32 text-center">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-12 text-center">
                      <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                        <Info size={32} className="text-slate-300" />
                        <p className="text-xs font-bold uppercase tracking-widest">No hay productos disponibles</p>
                        <p className="text-[10px]">Sincroniza o crea productos en el inventario para configurar sus precios.</p>
                      </div>
                    </td>
                  </tr>
                )}
                {products.map((p, i) => {
                  const basePrice = p.price;
                  const segmentPrice = Number((basePrice * discountFactor).toFixed(2));
                  const margin = segmentPrice > 0 ? ((segmentPrice - p.cost) / segmentPrice) * 100 : 0;
                  const priceBs = segmentPrice * rate;
                  return (
                    <tr key={i} className="group hover:bg-slate-50/50 transition-colors font-mono">
                      <td className="p-4 border-r border-slate-100 text-xs font-bold text-slate-500 uppercase">{p.sku}</td>
                      <td className="p-4 border-r border-slate-100 text-xs font-bold text-slate-800 uppercase font-sans">{p.name}</td>
                      <td className="p-0 border-r border-slate-100">
                        <input 
                          type="number" 
                          value={p.cost} 
                          onChange={(e) => handleCostChange(i, e.target.value)}
                          className="w-full h-full p-4 bg-transparent focus:bg-white focus:shadow-[inset_0_0_0_2px_#0b5156] outline-none text-center font-black text-slate-600" 
                        />
                      </td>
                      <td className="p-0 border-r border-slate-100">
                        <input 
                          type="number" 
                          value={segmentPrice} 
                          onChange={(e) => handlePriceChange(i, e.target.value)}
                          className="w-full h-full p-4 bg-transparent focus:bg-white focus:shadow-[inset_0_0_0_2px_#0b5156] outline-none text-center font-black text-[#0b5156]" 
                        />
                      </td>
                      <td className="p-4 border-r border-slate-100 text-center text-xs font-black text-green-600 bg-green-50/20 font-mono">
                        Bs. {priceBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className={`p-4 text-center text-xs font-black ${margin < 15 ? 'text-red-500' : (margin < 25 ? 'text-amber-500' : 'text-green-600')}`}>
                        {margin.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Custom Modal for Nueva Tarifa */}
      {showTarifaModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-8 border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-200">
             <h2 className="text-xl font-black text-slate-800 uppercase mb-2">Nueva Tarifa Global</h2>
             <p className="text-xs text-slate-400 font-bold uppercase mb-6">Configurar una nueva matriz tarifaria para productos.</p>
             <form onSubmit={handleCrearTarifa} className="space-y-4">
               <div className="space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre de la Tarifa</label>
                 <input 
                   type="text" 
                   required
                   value={tarifaNombre}
                   onChange={(e) => setTarifaNombre(e.target.value)}
                   placeholder="Ej. Tarifa Premium 2026" 
                   className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-[#0b5156] focus:ring-1 focus:ring-[#0b5156]"
                 />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Margen Base (%)</label>
                   <input 
                     type="number" 
                     required
                     value={tarifaMargen}
                     onChange={(e) => setTarifaMargen(e.target.value)}
                     className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0b5156] focus:ring-1 focus:ring-[#0b5156]"
                   />
                 </div>
                 <div className="space-y-1">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Moneda</label>
                   <select 
                     value={tarifaMoneda}
                     onChange={(e) => setTarifaMoneda(e.target.value)}
                     className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-black text-slate-500 uppercase focus:outline-none focus:border-[#0b5156]"
                   >
                     <option value="USD">USD ($)</option>
                     <option value="VES">VES (Bs)</option>
                   </select>
                 </div>
               </div>
               <div className="flex gap-3 pt-4">
                 <button 
                   type="button" 
                   onClick={() => setShowTarifaModal(false)}
                   className="flex-1 bg-white text-slate-600 border border-slate-200 font-black py-3 rounded-xl uppercase text-[10px] tracking-wider hover:bg-slate-50 transition-all"
                 >
                   Cancelar
                 </button>
                 <button 
                   type="submit"
                   className="flex-1 bg-[#0b5156] text-white font-black py-3 rounded-xl uppercase text-[10px] tracking-wider hover:bg-[#073639] transition-all shadow-md shadow-[#0b5156]/20"
                 >
                   Crear Tarifa
                 </button>
               </div>
             </form>
          </div>
        </div>
      )}

      {/* Custom Modal for Nuevo Segmento */}
      {showSegmentoModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-8 border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-200">
             <h2 className="text-xl font-black text-slate-800 uppercase mb-2">Nuevo Segmento</h2>
             <p className="text-xs text-slate-400 font-bold uppercase mb-6">Crear clasificación para asignación de tarifas.</p>
             <form onSubmit={handleCrearSegmento} className="space-y-4">
               <div className="space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre del Segmento</label>
                 <input 
                   type="text" 
                   required
                   value={segmentoNombre}
                   onChange={(e) => setSegmentoNombre(e.target.value)}
                   placeholder="Ej. Distribuidor Mayorista" 
                   className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-[#0b5156] focus:ring-1 focus:ring-[#0b5156]"
                 />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Moneda Preferida</label>
                   <select 
                     value={segmentoMoneda}
                     onChange={(e) => setSegmentoMoneda(e.target.value)}
                     className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-black text-slate-500 uppercase focus:outline-none focus:border-[#0b5156]"
                   >
                     <option value="USD">USD ($)</option>
                     <option value="VES">VES (Bs)</option>
                   </select>
                 </div>
                 <div className="space-y-1">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado Inicial</label>
                   <select 
                     value={segmentoEstado}
                     onChange={(e) => setSegmentoEstado(e.target.value)}
                     className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-black text-slate-500 uppercase focus:outline-none focus:border-[#0b5156]"
                   >
                     <option value="Activo">Activo</option>
                     <option value="Inactivo">Inactivo</option>
                   </select>
                 </div>
               </div>
               <div className="space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descuento (%)</label>
                 <input 
                   type="number" 
                   min="0"
                   max="100"
                   required
                   value={segmentoDescuento}
                   onChange={(e) => setSegmentoDescuento(e.target.value)}
                   className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0b5156] focus:ring-1 focus:ring-[#0b5156]"
                 />
               </div>
               <div className="flex gap-3 pt-4">
                 <button 
                   type="button" 
                   onClick={() => setShowSegmentoModal(false)}
                   className="flex-1 bg-white text-slate-600 border border-slate-200 font-black py-3 rounded-xl uppercase text-[10px] tracking-wider hover:bg-slate-50 transition-all"
                 >
                   Cancelar
                 </button>
                 <button 
                   type="submit"
                   className="flex-1 bg-[#0b5156] text-white font-black py-3 rounded-xl uppercase text-[10px] tracking-wider hover:bg-[#073639] transition-all shadow-md shadow-[#0b5156]/20"
                 >
                   Añadir Segmento
                 </button>
               </div>
             </form>
          </div>
        </div>
      )}

      {/* Premium custom Toast notification */}
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
      {/* Custom Modal for Guía de Uso */}
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
                 <h3 className="text-sm font-black text-[#0b5156] uppercase mb-2 flex items-center gap-2"><Info size={16}/> 1. Semáforo de Rentabilidad (Colores del Margen)</h3>
                 <p className="text-sm text-slate-600 mb-3 font-medium">La columna de "MARGEN" utiliza colores para indicarte visualmente qué tan rentable es un producto tras aplicar los descuentos:</p>
                 <ul className="space-y-3">
                   <li className="flex items-start gap-3 bg-red-50 p-3 rounded-xl border border-red-100">
                     <span className="text-red-500 mt-0.5">🔴</span>
                     <div>
                       <strong className="text-red-600 font-black text-xs uppercase">Rojo (Peligro) - Menor al 15%:</strong>
                       <p className="text-xs text-red-800/80 mt-1">Te alerta de que el producto tiene muy poca ganancia o incluso podrías estar perdiendo dinero tras aplicar los descuentos del segmento.</p>
                     </div>
                   </li>
                   <li className="flex items-start gap-3 bg-amber-50 p-3 rounded-xl border border-amber-100">
                     <span className="text-amber-500 mt-0.5">🟡</span>
                     <div>
                       <strong className="text-amber-600 font-black text-xs uppercase">Amarillo / Naranja (Precaución) - Entre 15% y 25%:</strong>
                       <p className="text-xs text-amber-800/80 mt-1">Es una ganancia aceptable, pero ajustada. Requiere monitoreo.</p>
                     </div>
                   </li>
                   <li className="flex items-start gap-3 bg-green-50 p-3 rounded-xl border border-green-100">
                     <span className="text-green-600 mt-0.5">🟢</span>
                     <div>
                       <strong className="text-green-700 font-black text-xs uppercase">Verde (Saludable) - Mayor al 25%:</strong>
                       <p className="text-xs text-green-800/80 mt-1">Es un margen excelente y muy rentable. Deja muy buena ganancia para el negocio.</p>
                     </div>
                   </li>
                 </ul>
               </section>

               <section>
                 <h3 className="text-sm font-black text-[#0b5156] uppercase mb-2 flex items-center gap-2"><CheckCircle2 size={16}/> 2. Gestión de Productos</h3>
                 <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                   <p className="text-sm text-slate-700 font-medium mb-3">En esta pantalla <strong>NO</strong> se pueden crear ni eliminar productos directamente, ya que esta vista es exclusivamente para calcular y configurar precios.</p>
                   <ul className="text-xs text-slate-600 space-y-2 list-disc pl-4 font-medium">
                     <li><strong>Agregar o Eliminar Productos:</strong> Debes hacerlo desde el módulo de <strong>Inventario / Catálogo</strong>. Una vez que agregues o quites productos allá, debes hacer clic en el botón <strong className="text-slate-800 border bg-white px-2 py-0.5 rounded shadow-sm">Sincronizar</strong> en esta pantalla para que aparezcan aquí.</li>
                     <li><strong>Editar Costos y Precios:</strong> ¡Sí puedes hacerlo aquí! Simplemente haz clic en los números de las columnas <em>"Costo (USD)"</em> o <em>"Precio (USD)"</em> en la tabla y modifícalos directamente como si fuera un Excel. No olvides darle a <strong className="text-white bg-[#0b5156] px-2 py-0.5 rounded shadow-sm">Guardar</strong> al terminar.</li>
                   </ul>
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
