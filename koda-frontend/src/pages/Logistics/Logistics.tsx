import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Truck, Plus, MapPin, Clock, User, ChevronRight,
  CheckCircle2, XCircle, Navigation, Wrench, AlertTriangle,
  RefreshCw, Send, Package, Zap, ChevronDown, DollarSign, Shield, FileText, Check, Trash2,
  X, Calendar
} from 'lucide-react';
import { api } from '@/api/client';
import { Toast } from '@/components/common/Toast';

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Vehiculo { id: number; nombre: string; placa: string; tipo: string; estado: string; marca?: string; modelo?: string; capacidad_kg?: number; km_actuales?: number; }
interface Chofer { id: number; nombre: string; tiene_telegram: boolean; estado: string; telefono?: string; licencia_alerta?: boolean; }
interface Turno {
  id: number; numero_turno: string; estado: string;
  fecha_salida: string; destino: string; ruta_descripcion?: string;
  observaciones?: string; nota_entrega_ref?: string; telegram_notificado: boolean;
  vehiculo?: Vehiculo; chofer?: Chofer;
  venta_id?: number; venta_factura?: string;
  venta_ids?: number[];
  paradas?: any[];
  km_retorno?: number;
  gastos?: any[];
}
interface Dashboard {
  vehiculos: { total: number; disponibles: number; en_ruta: number; en_mantenimiento: number; };
  turnos_hoy: { programados: number; entregados: number; };
  choferes: { total: number; disponibles: number; };
  alertas: { licencias_por_vencer: number; };
}

// ─── ICONO POR TIPO DE VEHÍCULO ───────────────────────────────────────────────
const VEHICLE_ICONS: Record<string, string> = {
  CAMION: '🚛', CARRO: '🚗', MOTO: '🏍️', FURGON: '🚐',
  AVION: '✈️', BARCO: '🚢', OTRO: '🚌'
};

const ESTADO_COLORS: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  PROGRAMADO: { bg: 'bg-amber-50 border border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500', label: 'Programado' },
  EN_RUTA: { bg: 'bg-blue-50 border border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500', label: 'En Ruta' },
  ENTREGADO: { bg: 'bg-emerald-50 border border-emerald-250', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Entregado' },
  CANCELADO: { bg: 'bg-red-50 border border-red-200', text: 'text-red-700', dot: 'bg-red-500', label: 'Cancelado' },
};

// ─── SWIPEABLE TURNO CARD ─────────────────────────────────────────────────────
interface TurnoCardProps {
  turno: Turno;
  onEstadoChange: (id: number, estado: string) => void;
  onParadaEstadoChange?: (paradaId: number, estado: string, motivoRechazo?: string) => Promise<void>;
}

function TurnoCard({ turno, onEstadoChange, onParadaEstadoChange }: TurnoCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const currentX = useRef(0);
  const isDragging = useRef(false);
  const [offset, setOffset] = useState(0);
  const [swipeHint, setSwipeHint] = useState<'confirm' | 'cancel' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCarga, setShowCarga] = useState(false);
  const [itemsCarga, setItemsCarga] = useState<any[]>([]);
  const [loadingCarga, setLoadingCarga] = useState(false);

  const config = ESTADO_COLORS[turno.estado] || ESTADO_COLORS.PROGRAMADO;
  const hora = new Date(turno.fecha_salida).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

  const toggleCarga = async () => {
    if (showCarga) {
      setShowCarga(false);
      return;
    }
    setShowCarga(true);
    if (itemsCarga.length > 0) return;
    setLoadingCarga(true);
    try {
      const data = await api.get<any[]>(`/api/logistica/turnos/${turno.id}/mercancia`);
      setItemsCarga(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCarga(false);
    }
  };

  const handlePrint = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsProcessing(true);

    let itemsToPrint = itemsCarga;
    if (itemsToPrint.length === 0) {
      try {
        const data = await api.get<any[]>(`/api/logistica/turnos/${turno.id}/mercancia`);
        itemsToPrint = data || [];
        setItemsCarga(data || []);
      } catch (err) {
        console.error(err);
        setIsProcessing(false);
        return;
      }
    }

    // Crear un iframe temporal invisible para imprimir sin pop-ups
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      const itemsHtml = itemsToPrint.map(item => `
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px; text-transform: uppercase;">${item.nombre}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center; font-weight: bold;">${item.cantidad}</td>
        </tr>
      `).join('');

      const html = `
        <html>
          <head>
            <title>KODA - HOJA DE RUTA ${turno.numero_turno}</title>
            <style>
              body { font-family: sans-serif; color: #333; margin: 30px; line-height: 1.4; }
              .header { display: flex; justify-content: space-between; border-bottom: 3px solid #0b5156; padding-bottom: 15px; margin-bottom: 25px; }
              .logo { font-size: 26px; font-weight: 900; color: #0b5156; text-transform: uppercase; letter-spacing: 1px; }
              .title { font-size: 16px; font-weight: 800; text-transform: uppercase; text-align: right; color: #444; }
              .info-table { width: 100%; margin-bottom: 25px; border: 1px solid #eee; border-radius: 8px; border-collapse: separate; border-spacing: 0; overflow: hidden; }
              .info-table td { padding: 12px; font-size: 12px; border-bottom: 1px solid #eee; }
              .info-table tr:last-child td { border-bottom: none; }
              .info-label { font-weight: 800; color: #0b5156; text-transform: uppercase; font-size: 9px; tracking-wider; display: block; margin-bottom: 3px; }
              .info-val { font-weight: 700; color: #222; text-transform: uppercase; }
              table.items { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 35px; font-size: 12px; }
              table.items th { background-color: #0b5156; color: white; border: 1px solid #0b5156; padding: 10px; text-align: left; text-transform: uppercase; font-size: 10px; font-weight: 900; }
              .signatures { display: grid; grid-template-cols: 1fr 1fr; gap: 40px; margin-top: 50px; text-align: center; font-size: 11px; }
              .sig-box { border-top: 1.5px solid #333; padding-top: 8px; margin-top: 45px; font-weight: 700; text-transform: uppercase; color: #444; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="logo">KODA ERP</div>
              <div class="title">Hoja de Ruta / Manifiesto de Carga<br><span style="font-size: 16px; font-family: monospace; font-weight: 900; color: #0b5156;">${turno.numero_turno}</span></div>
            </div>
            
            <table class="info-table">
              <tr>
                <td style="width: 50%; border-right: 1px solid #eee;">
                  <span class="info-label">Vehículo de Carga</span>
                  <span class="info-val">${turno.vehiculo?.nombre || 'General'} (PLACA: ${turno.vehiculo?.placa || 'S/P'}) - TIPO: ${turno.vehiculo?.tipo || 'N/A'}</span>
                </td>
                <td>
                  <span class="info-label">Fecha de Salida</span>
                  <span class="info-val" style="font-family: monospace;">${new Date(turno.fecha_salida).toLocaleString('es-VE')}</span>
                </td>
              </tr>
              <tr>
                <td style="border-right: 1px solid #eee;">
                  <span class="info-label">Conductor Asignado</span>
                  <span class="info-val">${turno.chofer?.nombre || 'No asignado'} ${turno.chofer?.telefono ? `(TEL: ${turno.chofer.telefono})` : ''}</span>
                </td>
                <td>
                  <span class="info-label">Destino / Dirección de Entrega</span>
                  <span class="info-val">${turno.destino}</span>
                </td>
              </tr>
              ${turno.nota_entrega_ref ? `
              <tr>
                <td colspan="2">
                  <span class="info-label">Referencia / Nota de Entrega Vinculada</span>
                  <span class="info-val" style="font-family: monospace; font-size: 13px;">${turno.nota_entrega_ref}</span>
                </td>
              </tr>
              ` : ''}
            </table>

            ${turno.observaciones ? `
              <div style="margin-bottom: 25px; padding: 12px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 11px;">
                <span class="info-label" style="margin-bottom: 5px;">Instrucciones / Observaciones especiales:</span>
                <span style="font-weight: 600; color: #334155; text-transform: uppercase;">${turno.observaciones}</span>
              </div>
            ` : ''}

            <h3 style="font-size: 14px; font-weight: 900; color: #0b5156; text-transform: uppercase; border-bottom: 1.5px solid #0b5156; padding-bottom: 5px; margin-top: 20px;">Mercancía Declarada en Carga</h3>
            <table class="items">
              <thead>
                <tr>
                  <th>Descripción del Producto</th>
                  <th style="width: 120px; text-align: center;">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml || '<tr><td colspan="2" style="text-align: center; color: #64748b; font-weight: 700; padding: 15px;">No hay productos asignados a este despacho</td></tr>'}
              </tbody>
            </table>

            <div class="signatures">
              <div class="sig-box">
                 Firma Despachador / Autorizado
              </div>
              <div class="sig-box">
                 Firma Conductor (Conforme Carga)
              </div>
            </div>
            
            <div class="signatures" style="margin-top: 20px; grid-template-cols: 1fr; max-width: 350px; margin-left: auto; margin-right: auto;">
              <div class="sig-box" style="border-top-style: dashed;">
                 Recibido conforme por el Cliente (Firma, Fecha y Sello)
              </div>
            </div>
          </body>
        </html>
      `;

      doc.open();
      doc.write(html);
      doc.close();

      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
          setIsProcessing(false);
        }, 1000);
      }, 350);
    } else {
      document.body.removeChild(iframe);
      setIsProcessing(false);
    }
  };

  const canSwipe = turno.estado === 'PROGRAMADO' || turno.estado === 'EN_RUTA';

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!canSwipe || isProcessing) return;
    isDragging.current = true;
    startX.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - startX.current;
    currentX.current = dx;
    const clamped = Math.max(-110, Math.min(110, dx));
    setOffset(clamped);
    if (clamped > 50) setSwipeHint('confirm');
    else if (clamped < -50) setSwipeHint('cancel');
    else setSwipeHint(null);
  };

  const handlePointerUp = async () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const dx = currentX.current;

    if (dx > 80 && canSwipe) {
      const nextEstado = turno.estado === 'PROGRAMADO' ? 'EN_RUTA' : 'ENTREGADO';
      setIsProcessing(true);
      await onEstadoChange(turno.id, nextEstado);
      setIsProcessing(false);
    } else if (dx < -80 && canSwipe) {
      setIsProcessing(true);
      await onEstadoChange(turno.id, 'CANCELADO');
      setIsProcessing(false);
    }
    setOffset(0);
    setSwipeHint(null);
    currentX.current = 0;
  };

  return (
    <div className="relative overflow-hidden rounded-2xl mb-3 border border-slate-200 bg-white" style={{ touchAction: 'pan-y' }}>
      {/* Swipe backgrounds */}
      <div className={`absolute inset-0 rounded-2xl flex items-center justify-between px-6 transition-opacity duration-150 ${swipeHint === 'confirm' ? 'opacity-100' : 'opacity-0'} bg-emerald-50`}>
        <CheckCircle2 className="text-emerald-600 w-7 h-7" />
        <span className="text-emerald-700 font-bold text-sm">{turno.estado === 'PROGRAMADO' ? '→ En Ruta' : '→ Entregado'}</span>
      </div>
      <div className={`absolute inset-0 rounded-2xl flex items-center justify-between px-6 transition-opacity duration-150 ${swipeHint === 'cancel' ? 'opacity-100' : 'opacity-0'} bg-red-50`}>
        <span className="text-red-700 font-bold text-sm">Cancelar</span>
        <XCircle className="text-red-650 w-7 h-7" />
      </div>

      {/* Card */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ transform: `translateX(${offset}px)`, transition: isDragging.current ? 'none' : 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}
        className={`relative bg-white rounded-2xl p-4 select-none ${canSwipe ? 'cursor-grab active:cursor-grabbing' : ''}`}
      >
        <div className="flex items-start gap-3">
          {/* Status dot */}
          <div className="flex flex-col items-center gap-1 pt-1">
            <div className={`w-2.5 h-2.5 rounded-full ${config.dot} ${turno.estado === 'EN_RUTA' ? 'animate-pulse' : ''}`} />
          </div>

          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-slate-400 tracking-widest font-mono">{turno.numero_turno}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${config.bg} ${config.text}`}>{config.label}</span>
            </div>

            {/* Destination */}
            <div className="flex items-start gap-2 mb-2">
              <MapPin className="w-3.5 h-3.5 text-[#0b5156] mt-0.5 shrink-0" />
              <span className="text-sm font-semibold text-slate-800 leading-tight uppercase">{turno.destino}</span>
            </div>

            {/* Vehicle + driver row */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="text-base">{VEHICLE_ICONS[turno.vehiculo?.tipo || 'OTRO']}</span>
                <span className="text-xs text-slate-500 font-semibold uppercase">{turno.vehiculo?.placa}</span>
              </div>
              {turno.chofer && (
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-[#0b5156] flex items-center justify-center">
                    <span className="text-[9px] font-black text-white">{turno.chofer.nombre.charAt(0)}</span>
                  </div>
                  <span className="text-xs text-slate-500 font-semibold truncate max-w-[100px] uppercase">{turno.chofer.nombre}</span>
                </div>
              )}
              <div className="ml-auto flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" />
                <span className="text-xs text-slate-500 font-semibold font-mono">{hora}</span>
              </div>
            </div>

            {/* Nota de entrega */}
            {turno.nota_entrega_ref && (
              <div className="mt-2 flex items-center gap-1.5">
                <Package className="w-3 h-3 text-slate-400" />
                <span className="text-[11px] text-slate-500 font-semibold uppercase">{turno.nota_entrega_ref}</span>
              </div>
            )}

            {/* Action footer row */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between" onClick={e => e.stopPropagation()}>
              {turno.observaciones?.includes('[CONDUCTOR CONFORME VIA TELEGRAM]') ? (
                <div className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-0.5 shadow-sm animate-pulse">
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span className="text-[9px] text-emerald-700 font-black uppercase tracking-wider">Conforme (Telegram)</span>
                </div>
              ) : turno.telegram_notificado ? (
                <div className="inline-flex items-center gap-1 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">
                  <Send className="w-3 h-3 text-blue-500" />
                  <span className="text-[9px] text-blue-600 font-black uppercase tracking-wider">Notificado</span>
                </div>
              ) : (
                <div />
              )}

              <button
                onClick={handlePrint}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-all font-black text-[9px] uppercase tracking-wider"
              >
                <RefreshCw className={`w-2.5 h-2.5 ${isProcessing ? 'animate-spin' : ''}`} />
                Imprimir Hoja de Ruta
              </button>
            </div>

            {/* Barra de progreso de paradas */}
            {turno.paradas && turno.paradas.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-slate-100" onClick={e => e.stopPropagation()}>
                {(() => {
                  const compl = turno.paradas.filter(p => p.estado === 'ENTREGADO').length;
                  const total = turno.paradas.length;
                  const pct = total > 0 ? (compl / total) * 100 : 0;
                  return (
                    <>
                      <div className="bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-[#0b5156] h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex justify-between items-center text-[9px] font-black text-slate-500 uppercase mt-1">
                        <span>Progreso de Ruta: {compl} / {total} Paradas</span>
                        <span>{pct.toFixed(0)}%</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Detalle de mercancía / Carga */}
            {(turno.venta_id || (turno.venta_ids && turno.venta_ids.length > 0) || (turno.paradas && turno.paradas.length > 0)) && (
              <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
                <button
                  onClick={toggleCarga}
                  className="flex items-center gap-1.5 text-xs text-[#0b5156] font-black uppercase tracking-wider hover:underline transition-colors w-fit"
                >
                  <Package className="w-3.5 h-3.5" />
                  {showCarga ? 'Ocultar Detalle de Despacho' : 'Ver Detalle de Despacho'}
                </button>
                {showCarga && (
                  <div className="space-y-3 mt-1">
                    {/* Lista de paradas interactivas */}
                    {turno.paradas && turno.paradas.length > 0 && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                        <span className="text-[9px] font-black text-slate-500 uppercase block">Ruta de Entregas</span>
                        <div className="space-y-2">
                          {turno.paradas.map((p, idx) => (
                            <div key={p.id} className="border-b border-slate-200/60 last:border-b-0 pb-2 last:pb-0">
                              <div className="flex justify-between items-start text-[10px] font-bold text-slate-700 uppercase">
                                <span className="truncate max-w-[170px]">{idx + 1}. {p.cliente}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider ${p.estado === 'ENTREGADO' ? 'bg-emerald-50 border border-emerald-250 text-emerald-700' :
                                    p.estado === 'RECHAZADO' ? 'bg-rose-50 border border-rose-250 text-rose-700' :
                                      'bg-slate-100 border border-slate-200 text-slate-550'
                                  }`}>{p.estado}</span>
                              </div>
                              <div className="text-[8px] text-slate-450 uppercase font-black tracking-widest mt-0.5">{p.numero_factura}</div>
                              {p.motivo_rechazo && (
                                <div className="text-[8px] text-rose-600 font-bold uppercase italic mt-1 bg-rose-50/50 p-1 rounded border border-rose-100">
                                  Motivo de rechazo: {p.motivo_rechazo}
                                </div>
                              )}
                              {p.evidencia_foto_url && (
                                <div className="text-[8px] text-emerald-700 font-bold uppercase italic mt-1 flex items-center gap-1">
                                  <span>📷 POD Registrado por Telegram</span>
                                </div>
                              )}
                              {turno.estado === 'EN_RUTA' && p.estado === 'PENDIENTE' && (
                                <div className="flex gap-1.5 mt-1.5 justify-end">
                                  <button
                                    onClick={async () => onParadaEstadoChange && await onParadaEstadoChange(p.id, 'ENTREGADO')}
                                    className="bg-[#0b5156] hover:bg-[#083a3d] text-white px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider transition-colors"
                                  >
                                    Entregar
                                  </button>
                                  <button
                                    onClick={async () => {
                                      const motivo = prompt("Ingrese el motivo del rechazo:");
                                      if (motivo !== null) {
                                        onParadaEstadoChange && await onParadaEstadoChange(p.id, 'RECHAZADO', motivo);
                                      }
                                    }}
                                    className="bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider transition-colors"
                                  >
                                    Rechazar
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Carga del camión */}
                    <div className="bg-[#0b5156]/5 border border-[#0b5156]/20 rounded-xl p-3 space-y-1.5">
                      <span className="text-[9px] font-black text-[#0b5156] uppercase block">Carga Total Consolidada</span>
                      {loadingCarga ? (
                        <div className="text-[10px] text-[#0b5156] font-bold uppercase tracking-wider animate-pulse">Cargando mercancía...</div>
                      ) : itemsCarga.length === 0 ? (
                        <div className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">Sin productos registrados</div>
                      ) : (
                        <div className="space-y-1">
                          {itemsCarga.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center text-[10px] font-bold text-slate-650 uppercase">
                              <span className="truncate max-w-[170px]">{item.nombre}</span>
                              <span className="text-slate-800">x{item.cantidad}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Swipe hint */}
        {canSwipe && !isProcessing && (
          <div className="mt-3 border-t border-slate-100 pt-2 flex items-center justify-center gap-1">
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">← desliza para cancelar · confirmar →</span>
          </div>
        )}
        {isProcessing && (
          <div className="mt-3 border-t border-slate-100 pt-2 flex items-center justify-center">
            <RefreshCw className="w-3.5 h-3.5 text-[#0b5156] animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── FLEET CARD ───────────────────────────────────────────────────────────────
function FleetCard({ v, onClick }: { v: Vehiculo; onClick: () => void }) {
  const estadoGlow: Record<string, string> = {
    DISPONIBLE: 'border-emerald-200 bg-emerald-50/20 text-emerald-800',
    EN_RUTA: 'border-blue-200 bg-blue-50/20 text-blue-800',
    EN_MANTENIMIENTO: 'border-amber-200 bg-amber-50/20 text-amber-800',
    INACTIVO: 'border-slate-200 bg-slate-50/20 text-slate-800',
  };
  return (
    <button
      onClick={onClick}
      className={`shrink-0 w-36 bg-white border rounded-2xl p-4 text-left transition-all duration-200 hover:scale-105 shadow-sm ${estadoGlow[v.estado] || 'border-slate-200 bg-slate-50'}`}
    >
      <div className="text-3xl mb-2">{VEHICLE_ICONS[v.tipo] || '🚛'}</div>
      <div className="text-xs font-black text-slate-800 mb-0.5 truncate uppercase">{v.placa}</div>
      <div className="text-[10px] text-slate-400 truncate mb-2 uppercase font-bold leading-tight">{v.nombre}</div>
      <span className="text-[8px] font-black uppercase tracking-wider block">{v.estado.replace('_', ' ')}</span>
    </button>
  );
}


// ─── PESTAÑA: LOGÍSTICA INVERSA (CUARENTENA) ──────────────────────────────────
function CuarentenaTab({ setToast }: { setToast: (t: any) => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCuarentena = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<any[]>('/api/logistica/cuarentena');
      setItems(data || []);
    } catch {
      setToast({ message: 'Error al cargar inventario en cuarentena', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [setToast]);

  useEffect(() => { fetchCuarentena(); }, [fetchCuarentena]);

  const handleResolver = async (id: number, resolucion: 'REINGRESO' | 'DESECHO') => {
    try {
      await api.post(`/api/logistica/cuarentena/${id}/resolver`, { resolucion });
      setToast({
        message: resolucion === 'REINGRESO'
          ? 'Contabilidad: Mercancía reingresada exitosamente a inventario disponible.'
          : 'Contabilidad: Mercancía descartada contablemente.',
        type: resolucion === 'REINGRESO' ? 'success' : 'info'
      });
      fetchCuarentena();
    } catch {
      setToast({ message: 'Error al resolver cuarentena', type: 'error' });
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-[#0b5156] font-bold uppercase tracking-widest animate-pulse">Cargando Cuarentena...</div>;
  }

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-6 space-y-6 text-slate-800">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-slate-800 font-black text-lg uppercase tracking-wider">Logística Inversa (Cuarentena)</h3>
          <p className="text-slate-500 text-xs font-semibold">El inventario cancelado o rechazado requiere aprobación del supervisor antes de volver a stock.</p>
        </div>
        <span className="bg-red-50 border border-red-200 text-red-700 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
          {items.filter(x => x.estado === 'PENDIENTE_REVISION').length} Pendientes
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-slate-450 font-black uppercase tracking-wider">
              <th className="pb-3">Fecha</th>
              <th className="pb-3">Turno</th>
              <th className="pb-3">Producto</th>
              <th className="pb-3">Cantidad</th>
              <th className="pb-3">Motivo de Ingreso</th>
              <th className="pb-3">Estado</th>
              <th className="pb-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-semibold text-slate-650">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-slate-400 font-bold uppercase">Sin productos retenidos en cuarentena</td>
              </tr>
            ) : (
              items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="py-3.5">{new Date(item.fecha).toLocaleDateString('es-VE')}</td>
                  <td className="py-3.5 text-[#0b5156] font-mono font-bold">{item.turno_numero}</td>
                  <td className="py-3.5 truncate max-w-[150px] uppercase font-bold text-slate-800">{item.producto_nombre}</td>
                  <td className="py-3.5 text-slate-800 font-bold font-mono">{item.cantidad}</td>
                  <td className="py-3.5 text-slate-500 italic max-w-[200px] truncate">{item.motivo}</td>
                  <td className="py-3.5">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${item.estado === 'PENDIENTE_REVISION' ? 'bg-amber-50 border border-amber-200 text-amber-700' :
                        item.estado.startsWith('APROBADO') ? 'bg-emerald-50 border border-emerald-250 text-emerald-700' :
                          'bg-slate-105 border border-slate-200 text-slate-500'
                      }`}>
                      {item.estado.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3.5 text-right space-x-2">
                    {item.estado === 'PENDIENTE_REVISION' && (
                      <>
                        <button
                          onClick={() => handleResolver(item.id, 'REINGRESO')}
                          className="bg-[#0b5156] hover:bg-[#083a3d] text-white px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors"
                        >
                          Reingresar
                        </button>
                        <button
                          onClick={() => handleResolver(item.id, 'DESECHO')}
                          className="bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors"
                        >
                          Desechar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ─── PESTAÑA: LIQUIDACIÓN Y CENTRO DE COSTOS ──────────────────────────────────
function CentroCostosTab({ allTurnos, fetchAll, setToast }: { allTurnos: Turno[], fetchAll: () => Promise<void>, setToast: (t: any) => void }) {
  const [selectedTurnoId, setSelectedTurnoId] = useState<number | null>(null);
  const [kmRetorno, setKmRetorno] = useState('');
  const [combustibleUsd, setCombustibleUsd] = useState('');
  const [litros, setLitros] = useState('');
  const [peajes, setPeajes] = useState('');
  const [viaticos, setViaticos] = useState('');
  const [desc, setDesc] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const turnosPorLiquidar = allTurnos.filter(t => t.estado === 'ENTREGADO' || t.estado === 'EN_RUTA');

  // Calcular métricas
  const costoTotalFlota = allTurnos.reduce((acc, t) => {
    const totalG = t.gastos?.reduce((sum, g) => sum + g.monto_usd, 0) || 0;
    return acc + totalG;
  }, 0);

  const litrosTotales = allTurnos.reduce((acc, t) => {
    const totalLitros = t.gastos?.reduce((sum, g) => sum + (g.litros || 0), 0) || 0;
    return acc + totalLitros;
  }, 0);

  const handleExportCSV = () => {
    const headers = ["Turno", "Vehiculo", "Chofer", "Destino", "Kilometros", "Costo Combustible", "Costo Peajes", "Costo Viaticos", "Costo Total"];
    const rows = allTurnos.map(t => {
      const vName = t.vehiculo?.placa || "N/A";
      const cName = t.chofer?.nombre || "N/A";
      const dist = (t.km_retorno || 0) - (t.vehiculo?.km_actuales || 0);
      const combustible = t.gastos?.find(g => g.categoria === 'COMBUSTIBLE')?.monto_usd || 0;
      const peajes = t.gastos?.find(g => g.categoria === 'PEAJES')?.monto_usd || 0;
      const viaticos = t.gastos?.find(g => g.categoria === 'VIATICOS')?.monto_usd || 0;
      const total = t.gastos?.reduce((sum, g) => sum + g.monto_usd, 0) || 0;
      return [
        t.numero_turno, vName, cName, `"${t.destino}"`, dist > 0 ? dist : 0, combustible, peajes, viaticos, total
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `reporte_costos_flota_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleLiquidarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTurnoId) return;
    setIsSaving(true);

    const gastos = [
      { categoria: 'COMBUSTIBLE', monto_usd: parseFloat(combustibleUsd) || 0, litros_combustible: parseFloat(litros) || 0, descripcion: desc },
      { categoria: 'PEAJES', monto_usd: parseFloat(peajes) || 0 },
      { categoria: 'VIATICOS', monto_usd: parseFloat(viaticos) || 0 }
    ].filter(g => g.monto_usd > 0);

    try {
      await api.post(`/api/logistica/turnos/${selectedTurnoId}/liquidar`, {
        km_retorno: parseFloat(kmRetorno) || 0,
        gastos,
        motivo: 'Liquidación de gastos operativos'
      });
      setToast({ message: 'Viaje y gastos liquidados correctamente', type: 'success' });
      setSelectedTurnoId(null);
      setKmRetorno('');
      setCombustibleUsd('');
      setLitros('');
      setPeajes('');
      setViaticos('');
      setDesc('');
      await fetchAll();
    } catch (err: any) {
      setToast({ message: err.message || 'Error al registrar liquidación', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-slate-800 animate-in fade-in duration-300">
      {/* Cabecera del Centro de Costos */}
      <div className="lg:col-span-12 flex justify-between items-center bg-white border border-slate-200 p-5 rounded-3xl shadow-sm">
        <div>
          <h3 className="text-slate-800 font-black text-lg uppercase tracking-wider">Centro de Costos de Flota</h3>
          <p className="text-slate-500 text-xs font-semibold">Liquidación de viáticos, peajes, gasoil y auditoría de rentabilidad por kilómetro.</p>
        </div>
        <button
          onClick={handleExportCSV}
          className="bg-[#0b5156] hover:bg-[#083a3d] text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm flex items-center gap-1.5"
        >
          <FileText className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      {/* KPIs Financieros */}
      <div className="lg:col-span-12 grid grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-center">
          <div className="text-sm font-black text-slate-455 uppercase mb-1">Costo Total de Flota</div>
          <div className="text-3xl font-black text-slate-800 font-mono">${costoTotalFlota.toFixed(2)} USD</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-center">
          <div className="text-sm font-black text-slate-455 uppercase mb-1">Combustible Consumido</div>
          <div className="text-3xl font-black text-emerald-700 font-mono">{litrosTotales.toFixed(1)} L</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-center">
          <div className="text-sm font-black text-slate-455 uppercase mb-1">Viajes Realizados</div>
          <div className="text-3xl font-black text-purple-700 font-mono">{allTurnos.filter(t => t.estado === 'ENTREGADO').length}</div>
        </div>
      </div>

      {/* Formulario de liquidación */}
      <div className="lg:col-span-4 space-y-6">
        <article className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm space-y-4">
          <h3 className="text-slate-800 font-black text-sm uppercase tracking-wider">Liquidar Gastos de Despacho</h3>
          {selectedTurnoId ? (
            <form onSubmit={handleLiquidarSubmit} className="space-y-3">
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl text-xs space-y-1 mb-2">
                <span className="text-slate-455 font-bold uppercase block">Turno:</span>
                <span className="text-slate-800 font-black uppercase text-sm block">
                  {allTurnos.find(x => x.id === selectedTurnoId)?.numero_turno}
                </span>
                <span className="text-slate-500 font-bold block uppercase mt-1">
                  Kilometraje Inicial: {allTurnos.find(x => x.id === selectedTurnoId)?.vehiculo?.km_actuales || 0} km
                </span>
              </div>

              <div>
                <label className="text-slate-500 text-[10px] font-black uppercase block mb-1">Kilometraje de Retorno *</label>
                <input
                  type="number"
                  required
                  value={kmRetorno}
                  onChange={e => setKmRetorno(e.target.value)}
                  placeholder="Ej: 15450"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-slate-800 text-xs font-semibold focus:outline-none focus:border-[#0b5156]/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-500 text-[10px] font-black uppercase block mb-1">Gasoil / Nafta ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={combustibleUsd}
                    onChange={e => setCombustibleUsd(e.target.value)}
                    placeholder="USD"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-slate-800 text-xs font-semibold focus:outline-none focus:border-[#0b5156]/50"
                  />
                </div>
                <div>
                  <label className="text-slate-500 text-[10px] font-black uppercase block mb-1">Litros Cargados</label>
                  <input
                    type="number"
                    step="0.01"
                    value={litros}
                    onChange={e => setLitros(e.target.value)}
                    placeholder="Litros"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-slate-800 text-xs font-semibold focus:outline-none focus:border-[#0b5156]/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-500 text-[10px] font-black uppercase block mb-1">Costo Peajes ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={peajes}
                    onChange={e => setPeajes(e.target.value)}
                    placeholder="USD"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-slate-800 text-xs font-semibold focus:outline-none focus:border-[#0b5156]/50"
                  />
                </div>
                <div>
                  <label className="text-slate-500 text-[10px] font-black uppercase block mb-1">Viáticos Chofer ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={viaticos}
                    onChange={e => setViaticos(e.target.value)}
                    placeholder="USD"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-slate-800 text-xs font-semibold focus:outline-none focus:border-[#0b5156]/50"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-500 text-[10px] font-black uppercase block mb-1">Detalle del Combustible</label>
                <input
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  placeholder="Ej: Gasolinera Santa Fe factura #892"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-slate-800 text-xs font-semibold focus:outline-none focus:border-[#0b5156]/50"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 bg-[#0b5156] hover:bg-[#083a3d] text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
                >
                  {isSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Liquidar
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTurnoId(null)}
                  className="bg-slate-50 border border-slate-200 text-slate-550 hover:text-slate-700 hover:bg-slate-100 px-3 py-2.5 rounded-xl text-xs font-black uppercase transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div className="text-center py-6 text-slate-400 text-xs font-bold uppercase leading-relaxed">
              Selecciona un despacho finalizado de la tabla de la derecha para ingresar los gastos operativos correspondientes.
            </div>
          )}
        </article>
      </div>

      {/* Listado de turnos y sus costos */}
      <div className="lg:col-span-8">
        <article className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm space-y-4">
          <h3 className="text-slate-800 font-black text-sm uppercase tracking-wider">Viajes y Costos Operativos</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-455 font-black uppercase tracking-wider">
                  <th className="pb-3">Turno</th>
                  <th className="pb-3">Vehículo</th>
                  <th className="pb-3">Kilómetros</th>
                  <th className="pb-3">Costo Total</th>
                  <th className="pb-3">$/Km</th>
                  <th className="pb-3 text-right">Liquidación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-650">
                {turnosPorLiquidar.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400 font-bold uppercase">Sin viajes finalizados para liquidar</td>
                  </tr>
                ) : (
                  turnosPorLiquidar.map(t => {
                    const kmInicial = t.vehiculo?.km_actuales || 0;
                    const kmFin = t.km_retorno || 0;
                    const dist = kmFin - kmInicial;
                    const costoViaje = t.gastos?.reduce((sum, g) => sum + g.monto_usd, 0) || 0;
                    const costoKm = dist > 0 ? (costoViaje / dist) : 0;
                    const isLiquidado = (t.gastos && t.gastos.length > 0) || t.km_retorno;

                    return (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="py-3 text-[#0b5156] font-mono font-black">{t.numero_turno}</td>
                        <td className="py-3 font-bold text-slate-800 uppercase">{t.vehiculo?.placa}</td>
                        <td className="py-3 font-mono">{isLiquidado ? `${dist} km` : 'Falta Retorno'}</td>
                        <td className="py-3 text-emerald-700 font-mono font-bold">${costoViaje.toFixed(2)}</td>
                        <td className="py-3 text-slate-700 font-mono font-bold">{costoKm > 0 ? `$${costoKm.toFixed(2)}` : 'N/A'}</td>
                        <td className="py-3 text-right">
                          {isLiquidado ? (
                            <span className="text-[9px] bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded uppercase font-black tracking-wider">Liquidador</span>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedTurnoId(t.id);
                                setKmRetorno(String((t.vehiculo?.km_actuales || 0) + 120)); // Sugerir retorno estimado
                              }}
                              className="bg-[#0b5156] hover:bg-[#083a3d] text-white px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors"
                            >
                              Liquidar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </div>
  );
}


// ─── PESTAÑA: LEDGER INMUTABLE DE AUDITORÍA ───────────────────────────────────
function AuditLedgerTab({ allTurnos, setToast }: { allTurnos: Turno[], setToast: (t: any) => void }) {
  const [searchTurnoId, setSearchTurnoId] = useState('');
  const [ledgerLogs, setLedgerLogs] = useState<any[]>([]);
  const [selectedTurno, setSelectedTurno] = useState<Turno | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearchAudit = async (turno: Turno) => {
    setSelectedTurno(turno);
    setLoading(true);
    try {
      const data = await api.get<any[]>(`/api/logistica/turnos/${turno.id}/ledger`);
      setLedgerLogs(data || []);
    } catch {
      setToast({ message: 'Error cargando bitácora del ledger', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-6 space-y-6 text-slate-800">
      <div>
        <h3 className="text-slate-800 font-black text-lg uppercase tracking-wider flex items-center gap-2">
          <Shield className="w-5 h-5 text-[#0b5156]" />
          Ledger Inmutable de Tránsito
        </h3>
        <p className="text-slate-500 text-xs font-semibold">Trazabilidad absoluta. Cada cambio de estado genera una firma SHA-256 encadenada inalterable.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Selector de turno */}
        <div className="lg:col-span-4 space-y-3">
          <h4 className="text-slate-500 text-[10px] font-black uppercase tracking-wider block">Seleccionar Despacho</h4>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-2.5 max-h-[300px] overflow-y-auto space-y-1.5 font-semibold text-slate-650">
            {allTurnos.length === 0 ? (
              <div className="text-slate-400 text-[10px] font-black uppercase py-4 text-center">Sin viajes registrados</div>
            ) : (
              allTurnos.map(t => (
                <button
                  key={t.id}
                  onClick={() => handleSearchAudit(t)}
                  className={`w-full text-left p-2.5 rounded-lg border text-xs font-bold uppercase transition-all ${selectedTurno?.id === t.id ? 'bg-[#0b5156]/5 border-[#0b5156] text-[#0b5156]' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-350'}`}
                >
                  <div className="font-black font-mono">{t.numero_turno}</div>
                  <div className="text-[10px] text-slate-400 font-bold mt-0.5">{t.destino}</div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Ledger logs */}
        <div className="lg:col-span-8">
          {selectedTurno ? (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs">
                <span className="text-slate-550 font-bold uppercase">Auditoría para Despacho:</span>
                <span className="text-[#0b5156] font-black font-mono uppercase text-sm block mt-0.5">{selectedTurno.numero_turno}</span>
                <span className="text-slate-600 font-bold uppercase block mt-1">Destino: {selectedTurno.destino}</span>
              </div>

              {loading ? (
                <div className="text-center py-10 text-[#0b5156] font-bold uppercase animate-pulse">Consultando bloque...</div>
              ) : ledgerLogs.length === 0 ? (
                <div className="text-center py-10 text-slate-400 font-bold uppercase">Sin registros en el ledger para este turno</div>
              ) : (
                <div className="relative border-l border-slate-200 pl-4 space-y-6">
                  {ledgerLogs.map((log, index) => (
                    <div key={log.id} className="relative">
                      {/* Timeline dot */}
                      <span className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-[#0b5156] border-2 border-white" />

                      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-sm">
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-455 uppercase">
                          <span>{new Date(log.fecha).toLocaleString('es-VE')}</span>
                          <span className="text-[#0b5156] font-black">{log.usuario}</span>
                        </div>
                        <div className="text-xs font-semibold text-slate-800 uppercase tracking-wide">
                          Estado: <span className="text-slate-400 line-through">{log.estado_anterior || 'INICIO'}</span> → <span className="text-[#0b5156]">{log.estado_nuevo}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-bold italic uppercase">{log.motivo}</p>
                        <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                          <span className="text-[8px] font-black text-slate-455 uppercase tracking-wider shrink-0">SHA-256 SIGNATURE:</span>
                          <code className="text-[9px] text-emerald-700 font-mono select-all truncate max-w-[400px] bg-emerald-50 px-1 py-0.5 rounded border border-emerald-250/50" title={log.hash}>
                            {log.hash}
                          </code>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-20 text-slate-500 font-bold uppercase border border-dashed border-slate-800 rounded-3xl">
              Selecciona un turno de la lista de la izquierda para ver su bitácora inmutable de tránsito.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ─── BOTTOM SHEET / MODAL NUEVO DESPACHO ─────────────────────────────────────
interface NewTurnoSheetProps {
  vehiculos: Vehiculo[];
  choferes: Chofer[];
  turnosActivos: Turno[];
  onClose: () => void;
  onSubmit: (data: any) => Promise<boolean>;
}

interface VentaPendiente {
  id: number;
  numero_factura: string;
  fecha: string;
  cliente: string;
  total_usd: number;
  detalles: Array<{
    producto_id: number;
    nombre: string;
    cantidad: number;
    precio_usd: number;
  }>;
}

function NewTurnoSheet({ vehiculos, choferes, turnosActivos, onClose, onSubmit }: NewTurnoSheetProps) {
  const [step, setStep] = useState(1);
  const [selectedVehiculo, setSelectedVehiculo] = useState<Vehiculo | null>(null);
  const [selectedChofer, setSelectedChofer] = useState<Chofer | null>(null);
  const [destino, setDestino] = useState('');
  const [hora, setHora] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    return now.toTimeString().slice(0, 5);
  });
  const [notaRef, setNotaRef] = useState('');
  const [obs, setObs] = useState('');
  const [ventasPendientes, setVentasPendientes] = useState<VentaPendiente[]>([]);
  const [selectedVentas, setSelectedVentas] = useState<VentaPendiente[]>([]);
  const [loading, setLoading] = useState(false);

  const disponibles = vehiculos.filter(v => {
    const yaAsignado = turnosActivos.some(t => (t as any).vehiculo_id === v.id);
    return v.estado === 'DISPONIBLE' && !yaAsignado;
  });
  const choferesDisp = choferes.filter(c => {
    const yaAsignado = turnosActivos.some(t => (t as any).chofer_id === c.id);
    return c.estado === 'DISPONIBLE' && !yaAsignado;
  });

  useEffect(() => {
    const fetchVentas = async () => {
      try {
        const data = await api.get<VentaPendiente[]>('/api/logistica/ventas-pendientes');
        setVentasPendientes(data || []);
      } catch (err) {
        console.error("Error al obtener ventas pendientes", err);
      }
    };
    fetchVentas();
  }, []);

  // Calcular peso total de todas las facturas seleccionadas
  const pesoTotalEstimado = selectedVentas.reduce((acc, v) => {
    return acc + v.detalles.reduce((a, d) => a + (d.cantidad * 2), 0); // 2 kg aprox por unidad
  }, 0);

  const maxCap = selectedVehiculo?.capacidad_kg || 0;
  const capacidadExcedida = maxCap > 0 && pesoTotalEstimado > maxCap;

  const handleVentaToggle = (v: VentaPendiente) => {
    let nextVentas = [...selectedVentas];
    if (nextVentas.some(x => x.id === v.id)) {
      nextVentas = nextVentas.filter(x => x.id !== v.id);
    } else {
      nextVentas.push(v);
    }
    setSelectedVentas(nextVentas);

    // Auto-completar notas y destino consolidados
    if (nextVentas.length > 0) {
      setNotaRef(nextVentas.map(x => x.numero_factura).join(', '));
      setDestino(nextVentas.map(x => `${x.cliente}`).join(' -> '));
    } else {
      setNotaRef('');
      setDestino('');
    }
  };

  const handleSubmit = async () => {
    if (!selectedVehiculo || !selectedChofer || !destino.trim() || capacidadExcedida) return;
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const fechaSalida = `${today}T${hora}:00`;
    const ok = await onSubmit({
      vehiculo_id: selectedVehiculo.id,
      chofer_id: selectedChofer.id,
      destino,
      fecha_salida: fechaSalida,
      nota_entrega_ref: notaRef || undefined,
      observaciones: obs || undefined,
      venta_id: selectedVentas[0]?.id || undefined,
      venta_ids: selectedVentas.map(x => x.id),
    });
    setLoading(false);
    if (ok) onClose();
  };

  return (
    <>
      {/* Background Backdrop */}
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Container forced near top of viewport */}
      <div
        className="fixed top-12 left-1/2 -translate-x-1/2 z-50 bg-white border border-slate-200 rounded-3xl p-6 md:p-8 pb-8 max-h-[84vh] overflow-y-auto w-full max-w-md shadow-2xl text-slate-800 font-sans"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'zoomIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1.5 rounded-full flex-1 transition-all duration-350 ${step >= s ? 'bg-[#0b5156]' : 'bg-slate-200'}`} />
          ))}
        </div>

        {/* Step 1: Seleccionar Vehículo */}
        {step === 1 && (
          <div>
            <h3 className="text-slate-800 font-black text-lg mb-1 uppercase tracking-wider">Selecciona el vehículo</h3>
            <p className="text-slate-500 font-bold text-xs uppercase mb-4">{disponibles.length} disponibles ahora</p>
            <div className="grid grid-cols-2 gap-3">
              {disponibles.length === 0 && (
                <div className="col-span-2 text-center py-8 text-slate-400 text-sm font-bold uppercase border border-dashed border-slate-200 rounded-2xl">Sin vehículos disponibles</div>
              )}
              {disponibles.map(v => (
                <button
                  key={v.id}
                  onClick={() => { setSelectedVehiculo(v); setStep(2); }}
                  className={`bg-slate-50 border rounded-2xl p-4 text-left transition-all ${selectedVehiculo?.id === v.id ? 'border-[#0b5156] bg-[#0b5156]/5' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <div className="text-3xl mb-2">{VEHICLE_ICONS[v.tipo] || '🚛'}</div>
                  <div className="text-xs font-black text-slate-800 truncate uppercase">{v.placa}</div>
                  <div className="text-[10px] text-slate-550 truncate font-bold uppercase leading-tight mt-0.5">{v.nombre}</div>
                  {v.capacidad_kg && <div className="text-[9px] text-[#0b5156] font-black uppercase mt-2">Capacidad: {v.capacidad_kg} kg</div>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Seleccionar Chofer */}
        {step === 2 && (
          <div>
            <button onClick={() => setStep(1)} className="text-[#0b5156] hover:text-[#083a3d] font-black text-xs uppercase mb-4 flex items-center gap-1">
              ← Cambiar vehículo
            </button>
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-3 mb-5">
              <span className="text-2xl">{VEHICLE_ICONS[selectedVehiculo?.tipo || 'OTRO']}</span>
              <div>
                <div className="text-slate-800 font-black text-sm uppercase">{selectedVehiculo?.placa}</div>
                <div className="text-slate-500 text-xs font-bold uppercase">{selectedVehiculo?.nombre}</div>
              </div>
            </div>
            <h3 className="text-slate-800 font-black text-lg mb-1 uppercase tracking-wider">Selecciona el chofer</h3>
            <p className="text-slate-500 font-bold text-xs uppercase mb-4">{choferesDisp.length} disponibles</p>
            <div className="flex flex-col gap-2">
              {choferesDisp.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-sm font-bold uppercase border border-dashed border-slate-200 rounded-2xl">Sin choferes disponibles</div>
              )}
              {choferesDisp.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedChofer(c); setStep(3); }}
                  className={`flex items-center gap-3 bg-slate-50 border rounded-2xl p-3 text-left transition-all ${selectedChofer?.id === c.id ? 'border-[#0b5156] bg-[#0b5156]/5' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <div className="w-10 h-10 rounded-full bg-[#0b5156]/10 border border-[#0b5156]/20 flex items-center justify-center shrink-0">
                    <span className="text-[#0b5156] font-black text-base">{c.nombre.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-800 text-sm font-black uppercase">{c.nombre}</div>
                    <div className="text-slate-500 text-xs font-bold">{c.telefono || 'Sin teléfono'}</div>
                  </div>
                  {c.tiene_telegram && <span title="Recibirá notificación Telegram" className="text-lg">📱</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Detalles de ruta */}
        {step === 3 && (
          <div>
            <button onClick={() => setStep(2)} className="text-[#0b5156] hover:text-[#083a3d] font-black text-xs uppercase mb-4 flex items-center gap-1">
              ← Cambiar chofer
            </button>

            {/* Summary chips */}
            <div className="flex gap-2 mb-5">
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-full px-3 py-1.5">
                <span className="text-sm">{VEHICLE_ICONS[selectedVehiculo?.tipo || 'OTRO']}</span>
                <span className="text-xs text-slate-700 font-bold uppercase">{selectedVehiculo?.placa}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-full px-3 py-1.5">
                <div className="w-4 h-4 rounded-full bg-[#0b5156] flex items-center justify-center">
                  <span className="text-[8px] font-black text-white">{selectedChofer?.nombre.charAt(0)}</span>
                </div>
                <span className="text-xs text-slate-700 font-bold truncate max-w-[80px]">{selectedChofer?.nombre}</span>
              </div>
            </div>

            <h3 className="text-slate-800 font-black text-base mb-4 uppercase tracking-wider">Consolidación de Despacho (Multi-parada)</h3>

            <div className="space-y-4">
              <div>
                <label className="text-slate-550 text-[10px] font-black uppercase tracking-wider mb-2 block">Vincular Facturas de Venta (Multi-parada)</label>
                {ventasPendientes.length === 0 ? (
                  <div className="text-xs text-slate-450 font-bold uppercase py-2.5 bg-slate-50 border border-slate-200 rounded-xl px-3 text-center">No hay facturas pendientes registradas</div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 max-h-[160px] overflow-y-auto">
                    {ventasPendientes.map(v => {
                      const isSelected = selectedVentas.some(x => x.id === v.id);
                      return (
                        <label
                          key={v.id}
                          className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${isSelected ? 'bg-[#0b5156]/5 border-[#0b5156] text-[#0b5156]' : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600'}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleVentaToggle(v)}
                            className="accent-[#0b5156] w-4 h-4 rounded"
                          />
                          <div className="flex-1 min-w-0 text-xs">
                            <div className="font-black uppercase truncate">{v.numero_factura} — {v.cliente}</div>
                            <div className="text-[10px] text-slate-450 font-black uppercase mt-0.5">${v.total_usd.toFixed(2)} USD • {v.detalles.length} productos</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedVentas.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
                  <h4 className="text-[#0b5156] text-[10px] font-black uppercase tracking-wider">Carga Consolidada Estimada</h4>
                  <div className="max-h-[110px] overflow-y-auto space-y-1.5 pr-1">
                    {selectedVentas.flatMap(x => x.detalles).map((d, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs font-semibold text-slate-650">
                        <span className="truncate max-w-[200px] uppercase">{d.nombre}</span>
                        <span className="font-black text-slate-800">x{d.cantidad}</span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-bold uppercase">Peso Acumulado:</span>
                    <span className={`font-black uppercase tracking-wider ${capacidadExcedida ? 'text-red-600 font-black' : 'text-[#0b5156]'}`}>
                      {pesoTotalEstimado} kg / {maxCap > 0 ? `${maxCap} kg` : 'Sin Límite'}
                    </span>
                  </div>
                  {capacidadExcedida && (
                    <div className="mt-2.5 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-[10px] text-red-700 font-bold uppercase tracking-wide">
                      <AlertTriangle className="w-4 h-4 text-red-650 shrink-0" />
                      <span>Salida Bloqueada: ¡La carga consolidada supera el límite máximo del camión! Quita alguna factura para continuar.</span>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="text-slate-550 text-[10px] font-black uppercase tracking-wider mb-1.5 block">Dirección o Ruta de Paradas *</label>
                <input
                  value={destino}
                  onChange={e => setDestino(e.target.value)}
                  placeholder="Ej: Cliente A -> Cliente B..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-850 placeholder-slate-400 text-sm font-semibold focus:outline-none focus:border-[#0b5156]/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-550 text-[10px] font-black uppercase tracking-wider mb-1.5 block">Hora de salida</label>
                  <input
                    type="time"
                    value={hora}
                    onChange={e => setHora(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-850 text-sm font-semibold focus:outline-none focus:border-[#0b5156]/50"
                  />
                </div>
                <div>
                  <label className="text-slate-550 text-[10px] font-black uppercase tracking-wider mb-1.5 block">Notas de Entrega</label>
                  <input
                    value={notaRef}
                    onChange={e => setNotaRef(e.target.value)}
                    placeholder="NE-00045"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-850 placeholder-slate-400 text-sm font-semibold focus:outline-none focus:border-[#0b5156]/50"
                  />
                </div>
              </div>
              <div>
                <label className="text-slate-550 text-[10px] font-black uppercase tracking-wider mb-1.5 block">Observaciones adicionales</label>
                <textarea
                  value={obs}
                  onChange={e => setObs(e.target.value)}
                  placeholder="Ej: Cargar por puerta trasera..."
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-855 placeholder-slate-400 text-sm font-semibold focus:outline-none focus:border-[#0b5156]/50 resize-none"
                />
              </div>
            </div>

            {/* Telegram notice */}
            {selectedChofer?.tiene_telegram && (
              <div className="mt-3.5 flex items-center gap-2 bg-[#0b5156]/5 border border-[#0b5156]/20 rounded-xl px-3 py-2">
                <Send className="w-4 h-4 text-[#0b5156] shrink-0" />
                <span className="text-[10px] text-[#0b5156] font-bold uppercase tracking-wider">Notificación Telegram programada para el conductor</span>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!destino.trim() || loading || capacidadExcedida}
              className="mt-6 w-full bg-[#0b5156] hover:bg-[#083a3d] disabled:opacity-30 disabled:hover:bg-[#0b5156] text-white font-black text-xs tracking-wider uppercase py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-md shadow-[#0b5156]/10"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {loading ? 'Procesando...' : 'Confirmar Despacho'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
const Logistics = () => {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [allTurnos, setAllTurnos] = useState<Turno[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showSheet, setShowSheet] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [activeTab, setActiveTab] = useState<'tablero' | 'cuarentena' | 'costos' | 'audit'>('tablero');
  const [filterEstado, setFilterEstado] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [dash, tData, vData, cData, allTData] = await Promise.all([
        api.get<any>('/api/logistica/dashboard'),
        api.get<any[]>(`/api/logistica/turnos?fecha=${selectedDate}`),
        api.get<any[]>('/api/logistica/vehiculos'),
        api.get<any[]>('/api/logistica/choferes'),
        api.get<any[]>('/api/logistica/turnos'),
      ]);
      setDashboard(dash);
      setTurnos(tData || []);
      setVehiculos(vData || []);
      setChoferes(cData || []);
      setAllTurnos(allTData || []);
    } catch {
      setToast({ message: 'Error cargando datos de logística', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const prevTurnosRef = useRef<Turno[]>([]);

  // Polling automático cada 10 segundos para actualizar el tablero en caliente
  useEffect(() => {
    if (activeTab !== 'tablero') return;

    const interval = setInterval(async () => {
      try {
        const [dash, tData, vData, cData, allTData] = await Promise.all([
          api.get<any>('/api/logistica/dashboard'),
          api.get<any[]>(`/api/logistica/turnos?fecha=${selectedDate}`),
          api.get<any[]>('/api/logistica/vehiculos'),
          api.get<any[]>('/api/logistica/choferes'),
          api.get<any[]>('/api/logistica/turnos'),
        ]);

        // Verificar si algún turno cambió a ENTREGADO desde EN_RUTA
        if (prevTurnosRef.current && prevTurnosRef.current.length > 0) {
          tData?.forEach(newT => {
            const oldT = prevTurnosRef.current.find(o => o.id === newT.id);
            if (oldT && oldT.estado === 'EN_RUTA' && newT.estado === 'ENTREGADO') {
              setToast({
                message: `🎉 ¡Entrega Exitosa! El chofer ${newT.chofer?.nombre || ''} ha finalizado la entrega del turno ${newT.numero_turno} con destino a ${newT.destino}.`,
                type: 'success'
              });
              // Reproducir alerta sonora (Campana armónica)
              try {
                const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, audioCtx.currentTime); // La (A5)
                gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.6);
              } catch (e) {
                console.warn("AudioContext bloqueado o no soportado:", e);
              }
            }
          });
        }

        prevTurnosRef.current = tData || [];

        setDashboard(dash);
        setTurnos(tData || []);
        setVehiculos(vData || []);
        setChoferes(cData || []);
        setAllTurnos(allTData || []);
      } catch (err) {
        console.error("Error en auto-refresco de logística:", err);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [activeTab, selectedDate]);

  const handleEstadoChange = async (turnoId: number, nuevoEstado: string) => {
    try {
      await api.put(`/api/logistica/turnos/${turnoId}/estado`, { estado: nuevoEstado });
      const estadoLabels: Record<string, string> = {
        EN_RUTA: '🚛 Turno marcado En Ruta',
        ENTREGADO: '✅ Entrega confirmada',
        CANCELADO: '❌ Turno cancelado',
      };
      setToast({ message: estadoLabels[nuevoEstado] || 'Estado actualizado', type: nuevoEstado === 'CANCELADO' ? 'error' : 'success' });
      await fetchAll();
    } catch {
      setToast({ message: 'Error actualizando estado', type: 'error' });
    }
  };

  const handleParadaEstadoChange = async (paradaId: number, nuevoEstado: string, motivoRechazo?: string) => {
    try {
      await api.put(`/api/logistica/turnos/paradas/${paradaId}/estado`, {
        estado: nuevoEstado,
        motivo_rechazo: motivoRechazo
      });
      setToast({ message: `Parada actualizada a ${nuevoEstado}`, type: nuevoEstado === 'RECHAZADO' ? 'info' : 'success' });
      await fetchAll();
    } catch (err: any) {
      setToast({ message: err.message || 'Error al actualizar parada', type: 'error' });
    }
  };

  const handleNuevoDespacho = async (data: any): Promise<boolean> => {
    try {
      const resp: any = await api.post('/api/logistica/turnos', data);
      const { numero_turno, telegram_enviado } = resp;
      const msg = telegram_enviado
        ? `✅ Turno ${numero_turno} creado · Notificación Telegram enviada`
        : `✅ Turno ${numero_turno} creado`;
      setToast({ message: msg, type: 'success' });
      await fetchAll();
      return true;
    } catch (err: any) {
      const detail = err.message || 'Error creando el turno';
      setToast({ message: detail, type: 'error' });
      return false;
    }
  };

  const kpis = dashboard ? [
    { label: 'Disponibles', value: dashboard.vehiculos.disponibles, color: 'text-[#0b5156]', border: 'border-emerald-100/60 hover:border-emerald-300', bg: 'bg-emerald-50/20', iconBg: 'bg-emerald-50 text-emerald-600', icon: '🟢', filterKey: null },
    { label: 'En Ruta', value: dashboard.vehiculos.en_ruta, color: 'text-blue-750', border: 'border-blue-100/60 hover:border-blue-300', bg: 'bg-blue-50/20', iconBg: 'bg-blue-50 text-blue-600', icon: '🔵', filterKey: 'EN_RUTA' },
    { label: 'Programados', value: dashboard.turnos_hoy.programados, color: 'text-amber-750', border: 'border-amber-100/60 hover:border-amber-300', bg: 'bg-amber-50/20', iconBg: 'bg-amber-50 text-amber-600', icon: '🟡', filterKey: 'PROGRAMADO' },
    { label: 'Entregados Hoy', value: dashboard.turnos_hoy.entregados, color: 'text-purple-750', border: 'border-purple-100/60 hover:border-purple-300', bg: 'bg-purple-50/20', iconBg: 'bg-purple-50 text-purple-600', icon: '✅', filterKey: 'ENTREGADO' },
    { label: 'Cancelados', value: turnos.filter(t => t.estado === 'CANCELADO').length, color: 'text-rose-750', border: 'border-rose-100/60 hover:border-rose-300', bg: 'bg-rose-50/20', iconBg: 'bg-rose-50 text-rose-650', icon: '❌', filterKey: 'CANCELADO' }
  ] : [];

  const turnosFiltrados = turnos.filter(t => {
    if (filterEstado) {
      return t.estado === filterEstado;
    }
    return t.estado !== 'CANCELADO' || turnos.length < 5;
  });

  return (
    <div className="min-h-screen bg-[#F4F6F8] text-slate-800 pb-24 animate-in fade-in duration-300">
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes zoomIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        /* Ocultar barra de scroll para contenedores limpios */
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Header Compacto - Koda Style */}
      <header className="bg-white border border-[#bdafa1]/20 p-8 rounded-3xl relative overflow-hidden mb-6 shadow-sm">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <Truck size={120} className="text-[#0b5156]" />
        </div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Logística Corporativa
              </span>
            </div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Tablero de Despacho</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight max-w-3xl leading-relaxed">
              Planificación consolidada, control de sobrecarga, manifiestos digitales y ledger de tránsito inmutable.
            </p>
          </div>
          <div className="flex gap-3">
            {activeTab === 'tablero' && (
              <button
                onClick={() => setShowSheet(true)}
                className="bg-[#0b5156] hover:bg-[#083a3d] text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 transition-all tracking-widest shadow-sm"
              >
                <Plus className="w-4.5 h-4.5" />
                Nuevo Despacho
              </button>
            )}
            <button
              onClick={() => navigate('/logistica/vehiculos')}
              className="bg-white text-slate-600 px-5 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 border border-slate-200 hover:bg-slate-50 transition-all tracking-widest shadow-sm"
            >
              Vehículos
            </button>
            <button
              onClick={() => navigate('/logistica/choferes')}
              className="bg-white text-slate-600 px-5 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 border border-slate-200 hover:bg-slate-50 transition-all tracking-widest shadow-sm"
            >
              Choferes
            </button>
            <button
              onClick={() => navigate('/logistica/mantenimiento')}
              className="bg-white text-slate-600 px-5 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 border border-slate-200 hover:bg-slate-50 transition-all tracking-widest shadow-sm"
            >
              Mantenimiento
            </button>
            <button
              onClick={fetchAll}
              className="bg-slate-50 text-slate-650 p-2.5 rounded-xl border border-slate-200 hover:bg-white transition-all shadow-sm flex items-center justify-center"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 space-y-6">
        {/* Barra de Navegación de Pestañas Industriales */}
        <div className="flex border-b border-slate-200 gap-1 overflow-x-auto pb-px no-scrollbar">
          <button
            onClick={() => setActiveTab('tablero')}
            className={`flex items-center gap-2 px-6 py-4 text-xs font-black uppercase tracking-wider transition-all border-b-2 ${activeTab === 'tablero' ? 'border-[#0b5156] text-[#0b5156] bg-[#0b5156]/5' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            <Navigation className="w-4 h-4" />
            Tablero Operativo
          </button>
          <button
            onClick={() => setActiveTab('cuarentena')}
            className={`flex items-center gap-2 px-6 py-4 text-xs font-black uppercase tracking-wider transition-all border-b-2 ${activeTab === 'cuarentena' ? 'border-[#0b5156] text-[#0b5156] bg-[#0b5156]/5' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            <Package className="w-4 h-4" />
            Logística Inversa (Cuarentena)
          </button>
          <button
            onClick={() => setActiveTab('costos')}
            className={`flex items-center gap-2 px-6 py-4 text-xs font-black uppercase tracking-wider transition-all border-b-2 ${activeTab === 'costos' ? 'border-[#0b5156] text-[#0b5156] bg-[#0b5156]/5' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            <DollarSign className="w-4 h-4" />
            Centro de Costos
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-6 py-4 text-xs font-black uppercase tracking-wider transition-all border-b-2 ${activeTab === 'audit' ? 'border-[#0b5156] text-[#0b5156] bg-[#0b5156]/5' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            <Shield className="w-4 h-4" />
            Auditoría Ledger
          </button>
        </div>
        {activeTab === 'cuarentena' && <CuarentenaTab setToast={setToast} />}
        {activeTab === 'costos' && <CentroCostosTab allTurnos={allTurnos} fetchAll={fetchAll} setToast={setToast} />}
        {activeTab === 'audit' && <AuditLedgerTab allTurnos={allTurnos} setToast={setToast} />}

        {activeTab === 'tablero' && (
          <div className="w-full space-y-6 text-slate-800">
            {/* Panel de Alertas Críticas */}
            {choferes.some(c => c.licencia_alerta) && (
              <div className="bg-rose-50 border border-rose-250 rounded-3xl p-5 flex items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
                <AlertTriangle className="w-5 h-5 text-rose-650 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-rose-800 font-black text-xs uppercase tracking-widest">Panel de Alertas de Flota</h4>
                  <ul className="list-disc list-inside text-rose-700 text-[11px] font-bold space-y-1 uppercase">
                    {choferes.filter(c => c.licencia_alerta).map(c => (
                      <li key={c.id}>
                        Licencia del chofer <span className="text-rose-900 font-black underline">{c.nombre}</span> requiere renovación inminente.
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Fila Superior de KPIs de Ancho Completo (Koda Style Premium) */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {kpis.map(k => {
                const isFilterable = k.filterKey !== null;
                const isActiveFilter = filterEstado === k.filterKey && isFilterable;
                return (
                  <button
                    key={k.label}
                    onClick={() => {
                      if (!isFilterable) {
                        document.getElementById('seccion-flota')?.scrollIntoView({ behavior: 'smooth' });
                        return;
                      }
                      setFilterEstado(isActiveFilter ? null : k.filterKey);
                    }}
                    className={`bg-white border-2 ${isActiveFilter ? 'border-[#0b5156] ring-4 ring-[#0b5156]/10 scale-[1.02]' : `${k.border} border-[#bdafa1]/15`} rounded-3xl p-5 flex flex-col justify-between min-h-[125px] shadow-sm hover:shadow-md transition-all text-left focus:outline-none w-full relative overflow-hidden group cursor-pointer`}
                  >
                    {/* Efecto de resplandor de fondo al hover */}
                    <div className={`absolute -right-6 -bottom-6 w-20 h-20 rounded-full ${k.bg} opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl`} />

                    {/* Fila Superior: Icono y Número */}
                    <div className="flex items-center justify-between w-full z-10">
                      <div className={`w-10 h-10 rounded-2xl ${k.iconBg} flex items-center justify-center font-bold text-lg shrink-0 shadow-sm border border-slate-100 group-hover:scale-105 transition-transform duration-300`}>
                        {k.icon}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-3xl font-black font-mono tracking-tight leading-none ${k.color}`}>
                          {k.value}
                        </span>
                        {isActiveFilter && (
                          <span className="w-2 h-2 rounded-full bg-[#0b5156] animate-ping" />
                        )}
                      </div>
                    </div>

                    {/* Fila Inferior: Títulos y Descripciones */}
                    <div className="mt-4 space-y-0.5 z-10">
                      <div className="text-[10px] text-slate-800 font-black uppercase tracking-wider flex items-center justify-between">
                        <span>{k.label}</span>
                        {isActiveFilter && (
                          <span className="bg-[#0b5156] text-white text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md">
                            Filtro
                          </span>
                        )}
                      </div>
                      <p className="text-[8.5px] text-slate-450 font-bold uppercase tracking-tight leading-tight">
                        {k.label === "Disponibles" && "Unidades en patio"}
                        {k.label === "En Ruta" && "Tránsito activo"}
                        {k.label === "Programados" && "Salidas listas"}
                        {k.label === "Entregados Hoy" && "Viajes completados"}
                        {k.label === "Cancelados" && "Viajes anulados hoy"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Listado de Flota Activa y Manifiestos a Ancho Completo */}
            <div className="space-y-6">
              {/* Flota Activa (Horizontal Scroll) */}
              <article id="seccion-flota" className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Flota y Estatus</h3>
                  <button
                    onClick={() => navigate('/logistica/vehiculos')}
                    className="text-xs font-black text-[#0b5156] hover:text-[#083a3d] uppercase flex items-center gap-1 transition-colors"
                  >
                    Ver todos <ChevronRight size={12} />
                  </button>
                </div>
                {isLoading ? (
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {[1, 2, 3, 4].map(i => <div key={i} className="shrink-0 w-36 h-28 bg-slate-100 border border-slate-200 rounded-2xl animate-pulse" />)}
                  </div>
                ) : vehiculos.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-xs font-bold uppercase">
                    No hay vehículos registrados
                  </div>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                    {vehiculos.map(v => (
                      <FleetCard key={v.id} v={v} onClick={() => navigate('/logistica/vehiculos')} />
                    ))}
                  </div>
                )}
              </article>

              {/* Listado de Turnos */}
              <article className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div className="space-y-1">
                    <h3 className="text-xs font-black uppercase tracking-wider text-[#0b5156]">Turnos Operativos</h3>
                    <div className="flex items-center gap-2">
                      {filterEstado && (
                        <button
                          onClick={() => setFilterEstado(null)}
                          className="bg-rose-50 border border-rose-200 text-rose-700 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider hover:bg-rose-100 transition-all cursor-pointer"
                        >
                          Limpiar Filtro ×
                        </button>
                      )}
                      <span className="bg-[#0b5156]/5 border border-[#0b5156]/20 text-[#0b5156] text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                        {turnosFiltrados.length} en pantalla
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Jornada:</span>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={e => setSelectedDate(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-black text-slate-700 focus:outline-none focus:border-[#0b5156] transition-all cursor-pointer shadow-sm"
                    />
                  </div>
                </div>
                {filterEstado && (
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tight -mt-2">
                    Filtrando por estado: <span className="font-black text-[#0b5156]">{filterEstado === 'EN_RUTA' ? 'EN RUTA' : filterEstado === 'ENTREGADO' ? 'ENTREGADOS' : filterEstado === 'PROGRAMADO' ? 'PROGRAMADOS' : 'CANCELADOS'}</span>
                  </div>
                )}
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-100 border border-slate-200 rounded-2xl animate-pulse" />)}
                  </div>
                ) : turnosFiltrados.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 space-y-2 border border-dashed border-slate-200 rounded-2xl">
                    <Navigation className="w-8 h-8 mx-auto opacity-30 text-[#0b5156]" />
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400">Sin turnos para este día</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Presiona "Nuevo Despacho" para iniciar la planificación.</p>
                  </div>
                ) : (
                  <div className="max-h-[640px] overflow-y-auto pr-1.5 space-y-3 no-scrollbar">
                    {turnosFiltrados.map(t => (
                      <TurnoCard key={t.id} turno={t} onEstadoChange={handleEstadoChange} onParadaEstadoChange={handleParadaEstadoChange} />
                    ))}
                  </div>
                )}

              </article>
            </div>
          </div>
        )}
      </div>



      {/* Bottom Sheet */}
      {showSheet && (
        <NewTurnoSheet
          vehiculos={vehiculos}
          choferes={choferes}
          turnosActivos={allTurnos.filter(t => t.estado === 'PROGRAMADO' || t.estado === 'EN_RUTA')}
          onClose={() => setShowSheet(false)}
          onSubmit={handleNuevoDespacho}
        />
      )}

      {showManual && (
        <TelegramManualModal onClose={() => setShowManual(false)} />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

// ─── TELEGRAM MANUAL MODAL ────────────────────────────────────────────────────
function TelegramManualModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-800/60 backdrop-blur-sm shadow-xl" onClick={onClose}>
      <div
        className="relative bg-white border border-slate-200 rounded-3xl p-6 md:p-8 pb-8 max-h-[92vh] overflow-y-auto w-full md:max-w-2xl md:mx-auto shadow-2xl text-slate-800 font-sans animate-in fade-in zoom-in-95 duration-250"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Send className="w-6 h-6 text-[#0b5156]" />
            <h3 className="text-slate-800 font-black text-lg uppercase tracking-tight">Manual del Bot de Telegram</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="space-y-5 text-sm text-slate-650 leading-relaxed uppercase text-[10px] font-bold">
          {/* Paso 1 */}
          <div className="flex gap-4 items-start p-4 bg-slate-50 border border-slate-200 rounded-2xl">
            <span className="w-7 h-7 rounded-full bg-[#0b5156] text-white flex items-center justify-center text-xs shrink-0 font-black">1</span>
            <div className="space-y-1 flex-1 min-w-0">
              <span className="text-[#0b5156] text-xs font-black tracking-wider block">Crear el Bot corporativo</span>
              <p className="text-slate-500 font-semibold tracking-tight normal-case leading-normal mt-1">
                Busca al usuario <span className="font-black text-slate-700">@BotFather</span> en tu aplicación de Telegram. Escribe el comando <code className="bg-slate-200 text-slate-850 px-1 py-0.5 rounded font-mono font-bold">/newbot</code> y sigue las indicaciones para definir el nombre de tu bot. Obtendrás un Token HTTP API que debes colocar en el archivo <code className="bg-slate-200 text-slate-850 px-1 py-0.5 rounded font-mono font-bold">.env</code> bajo la variable <code className="bg-slate-200 text-slate-850 px-1 py-0.5 rounded font-mono font-bold">TELEGRAM_BOT_TOKEN</code>.
              </p>
            </div>
          </div>

          {/* Paso 2 */}
          <div className="flex gap-4 items-start p-4 bg-slate-50 border border-slate-200 rounded-2xl">
            <span className="w-7 h-7 rounded-full bg-[#0b5156] text-white flex items-center justify-center text-xs shrink-0 font-black">2</span>
            <div className="space-y-1 flex-1 min-w-0">
              <span className="text-[#0b5156] text-xs font-black tracking-wider block">Vincular al Conductor</span>
              <p className="text-slate-500 font-semibold tracking-tight normal-case leading-normal mt-1">
                El chofer debe ingresar en Telegram a tu bot creado y presionar el botón de <span className="font-bold text-slate-700">Iniciar</span> (o enviar <code className="bg-slate-200 text-slate-850 px-1.5 py-0.5 rounded font-mono font-bold">/start</code>). El bot le responderá con su número de identificación de chat único (Chat ID). Copia este número y regístralo en el perfil del conductor dentro de la pestaña de <span className="font-bold text-slate-700">Choferes</span> de Koda ERP.
              </p>
            </div>
          </div>

          {/* Paso 3 */}
          <div className="flex gap-4 items-start p-4 bg-slate-50 border border-slate-200 rounded-2xl">
            <span className="w-7 h-7 rounded-full bg-[#0b5156] text-white flex items-center justify-center text-xs shrink-0 font-black">3</span>
            <div className="space-y-1 flex-1 min-w-0">
              <span className="text-[#0b5156] text-xs font-black tracking-wider block">Operación y Comandos en Ruta</span>
              <p className="text-slate-500 font-semibold tracking-tight normal-case leading-normal mt-1">
                Una vez configurado, el chofer recibirá en tiempo real la información de carga y paradas al crearse el viaje. Durante el recorrido, el chofer puede:
              </p>
              <ul className="list-disc list-inside space-y-1 pl-1 mt-2 text-slate-500 normal-case tracking-tight font-semibold">
                <li>Enviar una <span className="font-bold text-slate-700">Foto</span> (evidencia de entrega POD) al chat para marcar la parada como entregada de forma automática.</li>
                <li>Escribir el comando <code className="bg-slate-200 text-slate-850 px-1 py-0.5 rounded font-mono font-bold">/retraso motivo</code> (ej: /retraso trafico_lento) para notificar al ERP de incidencias.</li>
              </ul>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full bg-[#0b5156] hover:bg-[#083a3d] text-white font-black text-xs tracking-wider uppercase py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-md shadow-[#0b5156]/10"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}

export default Logistics;
