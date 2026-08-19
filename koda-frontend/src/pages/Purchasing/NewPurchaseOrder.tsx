import { useState, useEffect, useMemo } from 'react';
import { 
  FileText, 
  ArrowLeft, 
  Coins, 
  AlertCircle, 
  CheckCircle,
  TrendingUp,
  DollarSign
} from 'lucide-react';
import { api } from '@/api/client';
import { useNavigate, Link } from 'react-router-dom';

interface Proveedor {
  id: number;
  rif: string;
  nombre: string;
  telefono?: string;
  email?: string;
  direccion?: string;
}

export default function NewPurchaseOrder() {
  const navigate = useNavigate();
  
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [selectedProveedorId, setSelectedProveedorId] = useState<string>('');
  const [numeroFactura, setNumeroFactura] = useState<string>('');
  const [diasCredito, setDiasCredito] = useState<number>(0);
  const [categoria, setCategoria] = useState<string>('BIENES_INVENTARIO');
  const [tasaCambioBs, setTasaCambioBs] = useState<number>(0);
  
  const [subtotalUsd, setSubtotalUsd] = useState<string>('');
  const [ivaUsd, setIvaUsd] = useState<string>('');
  const [isIvaEdited, setIsIvaEdited] = useState<boolean>(false);
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState<boolean>(true);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // 1. Cargar proveedores y tasa BCV actual al montar el componente
  useEffect(() => {
    let active = true;
    
    const loadData = async () => {
      try {
        const [proveedoresData, tasaData] = await Promise.all([
          api.get<Proveedor[]>('/proveedores'),
          api.get<{ valor_ves: number | string }>('/tasa/actual').catch(() => ({ valor_ves: 36.52 }))
        ]);
        
        if (active) {
          setProveedores(proveedoresData || []);
          if (tasaData && tasaData.valor_ves) {
            setTasaCambioBs(Number(tasaData.valor_ves));
          }
        }
      } catch (err) {
        console.error("Error al cargar datos maestros para compras:", err);
        if (active) {
          setErrorMessage("Error al conectar con los servicios de datos maestros.");
        }
      } finally {
        if (active) setIsLoadingMetadata(false);
      }
    };
    
    loadData();
    return () => {
      active = false;
    };
  }, []);

  // 2. Auto-calcular el IVA al 16% cuando cambia el subtotal (si el usuario no lo ha modificado manualmente)
  useEffect(() => {
    if (!isIvaEdited && subtotalUsd !== '') {
      const calculatedIva = Number(subtotalUsd) * 0.16;
      setIvaUsd(calculatedIva.toFixed(2));
    }
  }, [subtotalUsd, isIvaEdited]);

  // 3. Cálculos en tiempo real
  const totalUsd = useMemo(() => {
    const sub = Number(subtotalUsd) || 0;
    const tax = Number(ivaUsd) || 0;
    return sub + tax;
  }, [subtotalUsd, ivaUsd]);

  const totalVes = useMemo(() => {
    return totalUsd * (tasaCambioBs || 0);
  }, [totalUsd, tasaCambioBs]);

  const selectedProveedor = useMemo(() => {
    return proveedores.find(p => String(p.id) === selectedProveedorId) || null;
  }, [proveedores, selectedProveedorId]);

  // 4. Envío al Backend
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');
    
    if (!selectedProveedorId) {
      setErrorMessage("Debe seleccionar un proveedor antes de registrar la compra.");
      return;
    }
    
    if (!numeroFactura.trim()) {
      setErrorMessage("Debe indicar el número de factura o documento de control.");
      return;
    }

    const sub = Number(subtotalUsd);
    if (isNaN(sub) || sub < 0 || subtotalUsd === '') {
      setErrorMessage("El subtotal debe ser un número mayor o igual a 0.");
      return;
    }

    const tax = Number(ivaUsd);
    if (isNaN(tax) || tax < 0 || ivaUsd === '') {
      setErrorMessage("El IVA debe ser un número mayor o igual a 0.");
      return;
    }

    if (tasaCambioBs <= 0) {
      setErrorMessage("La tasa de cambio debe ser un número mayor a 0.");
      return;
    }

    setIsLoading(true);
    
    try {
      const payload = {
        proveedor_id: Number(selectedProveedorId),
        numero_factura: numeroFactura.trim(),
        subtotal_usd: sub,
        iva_usd: tax,
        total_usd: totalUsd,
        tasa_cambio_bs: tasaCambioBs,
        dias_credito: diasCredito,
        estado: "ACTIVA",
        categoria: categoria
      };

      const res: any = await api.post('/compras', payload);
      
      if (res && (res.ok || res.id)) {
        setSuccessMessage(`¡Factura N° ${numeroFactura} registrada con éxito! Redireccionando...`);
        setTimeout(() => {
          navigate('/compras');
        }, 2000);
      } else {
        throw new Error("No se recibió confirmación del servidor.");
      }
    } catch (err: any) {
      console.error("Error al registrar la compra:", err);
      const detail = err.response?.data?.detail || err.message || "Error interno del servidor.";
      setErrorMessage(`No se pudo registrar la compra: ${detail}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Botón de retorno */}
      <Link to="/compras" className="inline-flex items-center gap-2 text-slate-500 hover:text-[#0b5156] font-bold text-xs uppercase transition-colors active:scale-95">
        <ArrowLeft size={14} /> Volver a Dashboard de Abastecimiento
      </Link>

      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-2">
          <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Módulo de Compras e Inventarios</p>
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Nueva Orden de Compra</h1>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-2xl">
            Registra facturas recibidas de proveedores nacionales e internacionales para ingresar stock y generar cuentas por pagar (CxP).
          </p>
        </div>
        <div className="bg-[#0b5156]/5 border border-[#0b5156]/15 rounded-2xl px-5 py-3 flex items-center gap-3 shrink-0">
          <div className="text-right">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Tasa BCV de Referencia</span>
            <span className="text-sm font-black text-[#0b5156] font-mono">
              {isLoadingMetadata ? "Cargando..." : `Bs. ${tasaCambioBs.toFixed(2)}`}
            </span>
          </div>
          <TrendingUp size={16} className="text-[#0b5156]" />
        </div>
      </header>

      {/* Alertas */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-green-700 text-xs font-bold flex items-center gap-3 shadow-sm transition-all animate-in slide-in-from-top-4 duration-300">
          <CheckCircle size={18} className="shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-bold flex items-center gap-3 shadow-sm transition-all animate-in slide-in-from-top-4 duration-300">
          <AlertCircle size={18} className="shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Panel Izquierdo: Formulario de Datos */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <FileText size={18} className="text-[#0b5156]" />
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Datos del Proveedor e Invoice</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Proveedor */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Proveedor Autorizado</label>
                <select
                  value={selectedProveedorId}
                  onChange={(e) => setSelectedProveedorId(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#0b5156] uppercase transition-all"
                  required
                >
                  <option value="">-- Seleccionar Proveedor --</option>
                  {proveedores.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} ({p.rif})</option>
                  ))}
                </select>
              </div>

              {selectedProveedor && (
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs">
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">RIF / Identificación</span>
                    <strong className="font-bold text-slate-700 uppercase font-mono">{selectedProveedor.rif}</strong>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Dirección de Despacho</span>
                    <span className="font-bold text-slate-500 uppercase truncate block">{selectedProveedor.direccion || 'Sin dirección fiscal registrada'}</span>
                  </div>
                </div>
              )}

              {/* Número de Factura */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Número de Factura / Control</label>
                <input
                  type="text"
                  placeholder="Ej: F-001048"
                  value={numeroFactura}
                  onChange={(e) => setNumeroFactura(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#0b5156] uppercase transition-all font-mono"
                  required
                />
              </div>

              {/* Días de Crédito */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Días de Crédito (CxP)</label>
                <input
                  type="number"
                  min="0"
                  max="360"
                  value={diasCredito}
                  onChange={(e) => setDiasCredito(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#0b5156] transition-all font-mono"
                />
              </div>

              {/* Tasa de Cambio Manual */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Tasa de Cambio Utilizada (Bs/$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={tasaCambioBs || ''}
                  onChange={(e) => setTasaCambioBs(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#0b5156] transition-all font-mono"
                  required
                />
              </div>

              {/* Estado */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Estado Inicial</label>
                <div className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-xs font-black text-slate-500 uppercase tracking-widest">
                  ACTIVA (Por Pagar)
                </div>
              </div>

              {/* Categoría de Gasto */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Categoría de Gasto</label>
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#0b5156] uppercase transition-all"
                >
                  <option value="BIENES_INVENTARIO">Bienes de Inventario</option>
                  <option value="LOGISTICA">Logística y Transporte</option>
                  <option value="SERVICIOS">Servicios y Suministros</option>
                  <option value="OTROS">Otros Gastos</option>
                </select>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Esta categoría se usa para la distribución de gastos en el dashboard</p>
              </div>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <Coins size={18} className="text-[#0b5156]" />
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Totales de Compra</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Subtotal */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Subtotal Gravado (USD)</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={subtotalUsd}
                    onChange={(e) => setSubtotalUsd(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#0b5156] transition-all font-mono"
                    required
                  />
                </div>
              </div>

              {/* IVA */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest">IVA Calculado (16% USD)</label>
                  {isIvaEdited && (
                    <button 
                      type="button" 
                      onClick={() => {
                        setIsIvaEdited(false);
                        const calculatedIva = Number(subtotalUsd) * 0.16;
                        setIvaUsd(calculatedIva.toFixed(2));
                      }} 
                      className="text-[9px] font-black text-slate-400 uppercase hover:text-[#0b5156]"
                    >
                      Restablecer (16%)
                    </button>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={ivaUsd}
                    onChange={(e) => {
                      setIsIvaEdited(true);
                      setIvaUsd(e.target.value);
                    }}
                    className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#0b5156] transition-all font-mono"
                    required
                  />
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Panel Derecho: Totalización de Factura */}
        <aside className="space-y-6">
          <section className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4 text-[#0b5156]">
              <DollarSign size={18} />
              <h2 className="text-xl font-black uppercase tracking-tight">Totalización</h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-end text-xs font-bold text-slate-500 uppercase">
                <span>Subtotal (USD)</span>
                <span className="text-slate-800 font-black font-mono">${(Number(subtotalUsd) || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-end text-xs font-bold text-slate-500 uppercase">
                <span>IVA (USD)</span>
                <span className="text-slate-800 font-black font-mono">${(Number(ivaUsd) || 0).toFixed(2)}</span>
              </div>
              
              <div className="flex justify-between items-center border-t-2 border-[#0b5156] pt-6 mt-4">
                <strong className="text-sm font-black text-slate-800 uppercase tracking-tighter">Total (USD)</strong>
                <strong className="text-2xl font-black text-[#0b5156] tracking-tighter font-mono">${totalUsd.toFixed(2)}</strong>
              </div>

              <div className="flex justify-between items-center border-t border-slate-100 pt-4 text-xs font-bold text-slate-500 uppercase">
                <span>Equivalente (BS)</span>
                <span className="font-black font-mono text-slate-700">Bs. {totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>

              {diasCredito > 0 && (
                <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider space-y-1">
                  <span>Condición de Pago: crédito</span>
                  <div className="font-black">Cuenta por pagar vencerá en {diasCredito} días</div>
                </div>
              )}
            </div>

            <div className="space-y-3 pt-6">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#0b5156] hover:bg-[#083a3d] text-white py-3.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-green-900/10 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
              >
                {isLoading ? "Procesando Registro..." : "Registrar Compra"}
              </button>
              <Link
                to="/compras"
                className="w-full block text-center bg-slate-50 hover:bg-slate-100 text-slate-600 py-3 rounded-xl text-xs font-black uppercase border border-slate-200 transition-colors active:scale-95"
              >
                Cancelar
              </Link>
            </div>
          </section>
        </aside>
      </form>
    </div>
  );
}
