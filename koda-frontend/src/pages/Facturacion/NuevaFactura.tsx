import { useState, useEffect, useMemo } from 'react';
import { 
  FileText, 
  ShoppingBag, 
  Calculator, 
  Plus, 
  Trash2, 
  AlertCircle, 
  CheckCircle,
  Coins,
  ArrowRight,
  TrendingUp,
  Percent
} from 'lucide-react';
import { api } from '@/api/client';

interface Cliente {
  id: number;
  rif: string;
  nombre: string;
  direccion?: string;
  telefono?: string;
  email?: string;
}

interface Producto {
  id: number;
  sku: string;
  nombre: string;
  precio_usd: number | string;
  costo_usd: number | string;
  stock: number;
  es_exento: boolean;
}

interface FacturaRow {
  tempId: string;
  producto_id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
}

const getClientUuid = (id: number): string => {
  return `00000000-0000-0000-0000-${String(id).padStart(12, '0')}`;
};

export default function NuevaFactura() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [tasaBcv, setTasaBcv] = useState<number>(0);
  const [isLoadingTasa, setIsLoadingTasa] = useState<boolean>(true);
  
  const [selectedClienteId, setSelectedClienteId] = useState<string>('');
  const [monedaDocumento, setMonedaDocumento] = useState<'VED' | 'USD' | 'EUR'>('USD');
  const [aplicaIgtf, setAplicaIgtf] = useState<boolean>(false);
  
  const [rows, setRows] = useState<FacturaRow[]>([
    { tempId: 'init-row-1', producto_id: '', descripcion: '', cantidad: 1, precio_unitario: 0 }
  ]);
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [emittedFactura, setEmittedFactura] = useState<any | null>(null);

  const showBsEquivalent = (amount: number, currency: string) => {
    if (currency === 'VED') return null;
    const inBs = amount * tasaBcv;
    return `Bs. ${inBs.toFixed(2)}`;
  };

  // 1. Cargar datos maestros de clientes, productos y tasa BCV
  useEffect(() => {
    let active = true;
    
    const loadData = async () => {
      try {
        const [clientsData, productsData] = await Promise.all([
          api.get<Cliente[]>('/clientes'),
          api.get<Producto[]>('/productos')
        ]);
        
        if (active) {
          setClientes(clientsData || []);
          setProductos(productsData || []);
        }
        
        try {
          const tasaData = await api.get<{ valor_ves: number | string }>('/tasa/actual');
          if (active && tasaData && tasaData.valor_ves) {
            setTasaBcv(Number(tasaData.valor_ves));
          }
        } catch (tasaErr) {
          console.warn("No se pudo obtener la tasa BCV de hoy, utilizando tasa base.", tasaErr);
        } finally {
          if (active) setIsLoadingTasa(false);
        }
      } catch (err) {
        console.error("Error al cargar datos de facturación fiscal:", err);
        if (active) {
          setErrorMessage("Error al conectar con los servicios de datos maestros.");
        }
      }
    };
    
    loadData();
    return () => {
      active = false;
    };
  }, []);

  // 2. Apagar IGTF si se selecciona VED
  useEffect(() => {
    if (monedaDocumento === 'VED') {
      setAplicaIgtf(false);
    }
  }, [monedaDocumento]);

  // 3. Cálculos en Tiempo Real
  const baseImponible = useMemo(() => {
    return rows.reduce((acc, row) => {
      const cant = Number(row.cantidad) || 0;
      const precio = Number(row.precio_unitario) || 0;
      return acc + (cant * precio);
    }, 0);
  }, [rows]);

  const montoIva = useMemo(() => {
    return baseImponible * 0.16;
  }, [baseImponible]);

  const appliesIgtf = monedaDocumento !== 'VED' && aplicaIgtf;

  const montoIgtf = useMemo(() => {
    if (appliesIgtf) {
      return (baseImponible + montoIva) * 0.03;
    }
    return 0;
  }, [baseImponible, montoIva, appliesIgtf]);

  const montoTotal = useMemo(() => {
    return baseImponible + montoIva + montoIgtf;
  }, [baseImponible, montoIva, montoIgtf]);

  const selectedCliente = useMemo(() => {
    return clientes.find(c => String(c.id) === selectedClienteId) || null;
  }, [clientes, selectedClienteId]);

  // 4. Manipulación del Grid Dinámico
  const handleAddRow = () => {
    const newRow: FacturaRow = {
      tempId: Math.random().toString(36).substring(7),
      producto_id: '',
      descripcion: '',
      cantidad: 1,
      precio_unitario: 0
    };
    setRows([...rows, newRow]);
  };

  const handleRemoveRow = (tempId: string) => {
    if (rows.length === 1) {
      setRows([{ tempId: 'init-row-1', producto_id: '', descripcion: '', cantidad: 1, precio_unitario: 0 }]);
      return;
    }
    setRows(rows.filter(r => r.tempId !== tempId));
  };

  const handleRowProductChange = (tempId: string, skuOrId: string) => {
    setRows(prevRows => prevRows.map(row => {
      if (row.tempId === tempId) {
        if (!skuOrId) {
          return { ...row, producto_id: '', descripcion: '', precio_unitario: 0 };
        }
        const prod = productos.find(p => p.sku === skuOrId || String(p.id) === skuOrId);
        if (prod) {
          return {
            ...row,
            producto_id: prod.sku || String(prod.id),
            descripcion: prod.nombre,
            precio_unitario: Number(prod.precio_usd) || 0
          };
        }
      }
      return row;
    }));
  };

  const handleRowValueChange = (tempId: string, field: 'descripcion' | 'cantidad' | 'precio_unitario', value: any) => {
    setRows(prevRows => prevRows.map(row => {
      if (row.tempId === tempId) {
        return {
          ...row,
          [field]: field === 'descripcion' ? value : Number(value)
        };
      }
      return row;
    }));
  };

  // 5. Envío al Backend
  const handleEmitFactura = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');
    
    if (!selectedClienteId) {
      setErrorMessage("Debe seleccionar un cliente antes de emitir la factura.");
      return;
    }
    
    if (rows.length === 0 || rows.every(r => !r.producto_id)) {
      setErrorMessage("Debe agregar al menos un producto a la factura.");
      return;
    }

    // Validar datos de filas
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.producto_id) {
        setErrorMessage(`Fila ${i + 1}: Debe seleccionar un producto.`);
        return;
      }
      if (!r.descripcion.trim()) {
        setErrorMessage(`Fila ${i + 1}: La descripción no puede estar vacía.`);
        return;
      }
      if (r.cantidad <= 0) {
        setErrorMessage(`Fila ${i + 1}: La cantidad debe ser mayor a 0.`);
        return;
      }
      if (r.precio_unitario < 0) {
        setErrorMessage(`Fila ${i + 1}: El precio unitario no puede ser negativo.`);
        return;
      }
    }

    setIsLoading(true);
    
    try {
      const numericClientId = Number(selectedClienteId);
      const clienteUuid = getClientUuid(numericClientId);
      
      const payload = {
        cliente_id: clienteUuid,
        moneda_documento: monedaDocumento,
        aplica_igtf: appliesIgtf,
        detalles: rows.map(r => ({
          producto_id: r.producto_id,
          descripcion: r.descripcion,
          cantidad: r.cantidad,
          precio_unitario: r.precio_unitario
        }))
      };

      // Petición al router de facturación fiscal
      const res = await api.post<any>('/v1/facturacion/emitir', payload);
      
      setEmittedFactura(res);
      setSuccessMessage(`Factura Fiscal ${res.numero_factura} emitida con éxito.`);
      
      // Limpiar Formulario
      setSelectedClienteId('');
      setMonedaDocumento('USD');
      setAplicaIgtf(false);
      setRows([{ tempId: 'init-row-1', producto_id: '', descripcion: '', cantidad: 1, precio_unitario: 0 }]);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Ocurrió un error inesperado al emitir la factura fiscal.");
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrencySymbol = (curr: string) => {
    switch (curr) {
      case 'VED': return 'Bs.';
      case 'EUR': return '€';
      default: return '$';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-6 font-sans">
      {/* Cabecera Principal */}
      <header className="mb-8 p-6 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[#0b5156]">
            <FileText size={20} />
            <span className="text-[10px] font-black uppercase tracking-widest bg-[#0b5156]/10 px-2 py-0.5 rounded border border-[#0b5156]/20">Fase 5 - Fiscal</span>
          </div>
          <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Facturación Fiscal</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Emisión contable inmutable con sincronización BCV y Ledger de Auditoría</p>
        </div>
        <div className="flex items-center gap-4 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
          <div>
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Tasa BCV del Día</span>
            <span className="text-sm font-black text-[#0b5156] font-mono">
              {isLoadingTasa ? "Cargando..." : `Bs. ${tasaBcv.toFixed(2)}`}
            </span>
          </div>
          <TrendingUp size={16} className="text-[#0b5156]" />
        </div>
      </header>

      {/* Alertas */}
      {successMessage && (
        <div className="mb-6 p-4 rounded-xl bg-[#0b5156]/10 border border-[#0b5156]/20 text-[#0b5156] text-xs font-bold flex items-center gap-3 shadow-sm transition-all">
          <CheckCircle size={18} className="shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {emittedFactura && (
        <div className="mb-8 p-6 bg-white border border-[#0b5156]/30 rounded-2xl shadow-sm space-y-4 transition-all">
          <div className="flex items-center gap-3 text-[#0b5156]">
            <CheckCircle size={24} className="shrink-0 animate-bounce" />
            <div>
              <h3 className="text-base font-black uppercase tracking-tight">Emisión Fiscal Exitosa</h3>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-tight">El documento ha sido firmado criptográficamente y registrado en el Ledger de Auditoría</p>
            </div>
            <button 
              type="button" 
              onClick={() => {
                setEmittedFactura(null);
                setSuccessMessage('');
              }}
              className="ml-auto text-slate-500 hover:text-slate-800 transition-colors text-xs font-black uppercase bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg active:scale-95"
            >
              Emitir Nueva Factura
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-3 border-t border-slate-100">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Correlativo Factura</span>
              <strong className="text-sm font-black text-slate-800">{emittedFactura.numero_factura}</strong>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Número de Control</span>
              <strong className="text-sm font-black text-[#0b5156]">{emittedFactura.numero_control}</strong>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl col-span-2">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Firma de Integridad (SHA-256)</span>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-[10px] font-mono text-slate-500 break-all select-all">{emittedFactura.hash_integridad}</code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(emittedFactura.hash_integridad || "");
                    alert("Hash copiado al portapapeles");
                  }}
                  className="bg-slate-200 hover:bg-slate-300 px-2 py-1 rounded text-[9px] font-black uppercase text-[#0b5156] transition-colors shrink-0"
                >
                  Copiar
                </button>
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-4 items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            <div className="flex gap-6">
              <div>
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Base Imponible</span>
                <span className="font-bold font-mono text-slate-800">{formatCurrencySymbol(emittedFactura.moneda_documento || 'USD')} {emittedFactura.base_imponible?.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Impuesto IVA</span>
                <span className="font-bold font-mono text-slate-800">{formatCurrencySymbol(emittedFactura.moneda_documento || 'USD')} {emittedFactura.monto_iva?.toFixed(2)}</span>
              </div>
              {emittedFactura.monto_igtf > 0 && (
                <div>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Monto IGTF (3%)</span>
                  <span className="font-bold font-mono text-[#0b5156]">{formatCurrencySymbol(emittedFactura.moneda_documento || 'USD')} {emittedFactura.monto_igtf?.toFixed(2)}</span>
                </div>
              )}
              <div>
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Total Consolidado</span>
                <span className="font-black font-mono text-[#0b5156]">{formatCurrencySymbol(emittedFactura.moneda_documento || 'USD')} {emittedFactura.monto_total?.toFixed(2)}</span>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const token = localStorage.getItem('koda_token');
                    const headers: any = {};
                    if (token) {
                      headers['Authorization'] = `Bearer ${token}`;
                    }
                    const docNum = emittedFactura.numero_factura;
                    const res = await fetch(`/api/fiscal/retencion-iva/pdf?proveedor_id=J-00000000-0&periodo=${new Date().toISOString().slice(0, 7).replace('-', '')}&correlativo=${docNum}`, { headers });
                    if (!res.ok) throw new Error("Error generating PDF");
                    const blob = await res.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `FACTURA_FISCAL_${docNum}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                  } catch (err) {
                    console.error(err);
                    alert("No se pudo descargar el PDF del comprobante.");
                  }
                }}
                className="bg-[#0b5156] hover:bg-[#083a3d] text-white font-black uppercase text-[10px] tracking-wider px-4 py-2 rounded-xl transition-all active:scale-95"
              >
                Descargar Comprobante PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-bold flex items-center gap-3 shadow-sm transition-all">
          <AlertCircle size={18} className="shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleEmitFactura} className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Sección del Formulario Principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card Clientes y Moneda */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Coins size={16} className="text-[#0b5156]" />
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Configuración del Documento</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Cliente */}
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Receptor / Cliente</label>
                <select
                  value={selectedClienteId}
                  onChange={(e) => setSelectedClienteId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#0b5156]/50 uppercase transition-all"
                >
                  <option value="">-- Seleccionar Cliente --</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre} ({c.rif})</option>
                  ))}
                </select>
              </div>

              {/* Moneda */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Moneda</label>
                <select
                  value={monedaDocumento}
                  onChange={(e) => setMonedaDocumento(e.target.value as any)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#0b5156]/50 transition-all"
                >
                  <option value="USD">Dólares (USD)</option>
                  <option value="VED">Bolívares (VED)</option>
                  <option value="EUR">Euros (EUR)</option>
                </select>
              </div>
            </div>

            {/* Fila del Cliente Seleccionado */}
            {selectedCliente && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">RIF / Cédula</span>
                  <span className="font-bold text-slate-800">{selectedCliente.rif}</span>
                </div>
                <div>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Dirección Fiscal</span>
                  <span className="font-bold text-slate-800 truncate block">{selectedCliente.direccion || 'No registrada'}</span>
                </div>
              </div>
            )}
          </section>

          {/* Grid de Ítems */}
          <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShoppingBag size={16} className="text-[#0b5156]" />
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Detalles de la Factura</h2>
              </div>
              <button
                type="button"
                onClick={handleAddRow}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#0b5156]/20 bg-[#0b5156]/5 text-[#0b5156] text-[10px] font-black uppercase tracking-wider hover:bg-[#0b5156]/10 active:scale-95 transition-all"
              >
                <Plus size={12} /> Agregar Fila
              </button>
            </div>

            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    <th className="pb-3 w-[30%]">Producto Base</th>
                    <th className="pb-3 w-[35%]">Descripción Fiscal</th>
                    <th className="pb-3 w-[15%] text-right">Cant.</th>
                    <th className="pb-3 w-[15%] text-right">Precio Unit.</th>
                    <th className="pb-3 w-[10%] text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row, idx) => (
                    <tr key={row.tempId} className="text-xs font-bold group">
                      {/* Selector Producto */}
                      <td className="py-4 pr-3">
                        <select
                          value={row.producto_id}
                          onChange={(e) => handleRowProductChange(row.tempId, e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-[#0b5156]/50 transition-all"
                        >
                          <option value="">-- Seleccionar --</option>
                          {productos.map(p => (
                            <option key={p.id} value={p.sku}>{p.nombre} (${Number(p.precio_usd).toFixed(2)})</option>
                          ))}
                        </select>
                      </td>

                      {/* Descripción */}
                      <td className="py-4 pr-3">
                        <input
                          type="text"
                          value={row.descripcion}
                          placeholder="Descripción fiscal del ítem..."
                          onChange={(e) => handleRowValueChange(row.tempId, 'descripcion', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0b5156]/50 transition-all"
                        />
                      </td>

                      {/* Cantidad */}
                      <td className="py-4 pr-3">
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          value={row.cantidad}
                          onChange={(e) => handleRowValueChange(row.tempId, 'cantidad', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-right text-slate-800 focus:outline-none focus:border-[#0b5156]/50 transition-all"
                        />
                      </td>

                      {/* Precio */}
                      <td className="py-4 pr-3">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={row.precio_unitario}
                          onChange={(e) => handleRowValueChange(row.tempId, 'precio_unitario', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-right text-slate-800 focus:outline-none focus:border-[#0b5156]/50 transition-all"
                        />
                      </td>

                      {/* Acción */}
                      <td className="py-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(row.tempId)}
                          className="text-red-400 hover:text-red-300 p-2 rounded-lg hover:bg-red-500/10 active:scale-95 transition-all"
                          title="Eliminar fila"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Panel Lateral: Ticket de Totalización Fiscal */}
        <aside className="space-y-6">
          <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6 sticky top-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Calculator size={16} className="text-[#0b5156]" />
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Ticket de Emisión</h2>
            </div>

            {/* Desglose de Totales */}
            <div className="space-y-4">
              <div className="flex justify-between items-start text-xs font-bold text-slate-400 uppercase">
                <span>Base Imponible</span>
                <div className="text-right">
                  <span className="block text-slate-800 font-mono">{formatCurrencySymbol(monedaDocumento)} {baseImponible.toFixed(2)}</span>
                  {monedaDocumento !== 'VED' && (
                    <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                      {showBsEquivalent(baseImponible, monedaDocumento)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-start text-xs font-bold text-slate-400 uppercase">
                <span>IVA (16.00%)</span>
                <div className="text-right">
                  <span className="block text-slate-800 font-mono">{formatCurrencySymbol(monedaDocumento)} {montoIva.toFixed(2)}</span>
                  {monedaDocumento !== 'VED' && (
                    <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                      {showBsEquivalent(montoIva, monedaDocumento)}
                    </span>
                  )}
                </div>
              </div>

              {monedaDocumento !== 'VED' && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Percent size={12} className="text-[#0b5156]" /> IGTF (3%)
                    </span>
                    <button
                      type="button"
                      onClick={() => setAplicaIgtf(!aplicaIgtf)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        aplicaIgtf ? 'bg-[#0b5156]' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          aplicaIgtf ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  
                  {aplicaIgtf && (
                    <div className="flex justify-between items-start text-xs font-bold text-slate-500 uppercase pt-2 border-t border-slate-200">
                      <span>Monto IGTF</span>
                      <div className="text-right">
                        <span className="block text-[#0b5156] font-mono">{formatCurrencySymbol(monedaDocumento)} {montoIgtf.toFixed(2)}</span>
                        <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                          {showBsEquivalent(montoIgtf, monedaDocumento)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Total Neto */}
              <div className="flex justify-between items-center border-t border-slate-200 pt-4 mt-2">
                <span className="text-sm font-black text-slate-800 uppercase tracking-wider">Total a Pagar</span>
                <div className="text-right">
                  <span className="block text-xl font-black text-[#0b5156] font-mono filter drop-shadow-[0_0_8px_rgba(11,81,86,0.3)]">
                    {formatCurrencySymbol(monedaDocumento)} {montoTotal.toFixed(2)}
                  </span>
                  {monedaDocumento !== 'VED' && (
                    <span className="text-xs font-black text-slate-400 font-mono block mt-1">
                      {showBsEquivalent(montoTotal, monedaDocumento)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Acción de Envío */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-[#0b5156] hover:bg-[#083a3d] disabled:opacity-50 disabled:cursor-not-allowed text-white font-black uppercase tracking-wider text-xs py-3 rounded-xl shadow-lg active:scale-[0.98] transition-all duration-200"
            >
              {isLoading ? (
                <>
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-[#0A0A0F] border-t-transparent rounded-full mr-2"></span>
                  Procesando...
                </>
              ) : (
                <>
                  Emitir Factura Fiscal <ArrowRight size={14} />
                </>
              )}
            </button>
          </section>
        </aside>
      </form>
    </div>
  );
}
