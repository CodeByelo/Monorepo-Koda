import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  Clock, 
  User, 
  ChevronDown, 
  ChevronUp, 
  Terminal, 
  Search, 
  RefreshCw 
} from 'lucide-react';
import { api } from '@/api/client';

interface ForensicEvent {
  event_id: string;
  event_type: string;
  actor_id: string | null;
  occurred_at: string;
  payload: Record<string, any>;
}

interface ForensicTimelineProps {
  initialAggregateId?: string;
}

export default function ForensicTimeline({ initialAggregateId = "" }: ForensicTimelineProps) {
  const [aggregateId, setAggregateId] = useState(initialAggregateId);
  const [searchQuery, setSearchQuery] = useState(initialAggregateId);
  const [events, setEvents] = useState<ForensicEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});

  const fetchTimeline = async (idToQuery: string) => {
    if (!idToQuery.trim()) {
      setEvents([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await api.get<any>(`/api/v1/auditoria/forense/${idToQuery.trim()}`);
      setEvents(res.events || res.data || []);
    } catch (err: any) {
      console.error("Error al consultar trazabilidad forense:", err);
      setError(err.message || "Fallo en la comunicación con el búnker de auditoría.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialAggregateId) {
      setAggregateId(initialAggregateId);
      setSearchQuery(initialAggregateId);
      fetchTimeline(initialAggregateId);
    }
  }, [initialAggregateId]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAggregateId(searchQuery);
    fetchTimeline(searchQuery);
  };

  const toggleExpand = (eventId: string) => {
    setExpandedEvents(prev => ({
      ...prev,
      [eventId]: !prev[eventId]
    }));
  };

  // Helper para formatear fechas
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return {
        date: date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }),
        time: date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };
    } catch {
      return { date: 'Fecha Inválida', time: '—' };
    }
  };

  // Helper para decodificar e interpretar el payload
  const translatePayload = (type: string, payload: Record<string, any>) => {
    const typeLower = type.toLowerCase();
    
    if (typeLower.includes('creado')) {
      return (
        <div className="space-y-1">
          <p className="text-emerald-400 font-bold text-xs uppercase tracking-wider">Hito de Creación Registrado</p>
          <div className="text-slate-300 font-mono text-[11px] grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
            <div><span className="text-slate-500">Título:</span> {payload.titulo || payload.title || '—'}</div>
            <div><span className="text-slate-500">Tipo:</span> {payload.tipo_documento || '—'}</div>
            <div><span className="text-slate-500">Prioridad:</span> <span className="uppercase font-bold text-amber-500">{payload.prioridad || '—'}</span></div>
            <div><span className="text-slate-500">Estado Inicial:</span> <span className="text-emerald-400 uppercase font-black">{payload.estado_nuevo || '—'}</span></div>
          </div>
        </div>
      );
    }

    if (typeLower.includes('asignado')) {
      return (
        <div className="space-y-1">
          <p className="text-blue-400 font-bold text-xs uppercase tracking-wider">Hito de Asignación / Transición</p>
          <div className="text-slate-300 font-mono text-[11px] mt-2">
            <div><span className="text-slate-500">Técnico Asignado (ID):</span> <span className="text-sky-400 font-mono">{payload.tecnico_id || '—'}</span></div>
            {payload.valor_anterior && payload.valor_nuevo && (
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-slate-500">Transición:</span>
                <span className="bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded font-black text-[10px] uppercase border border-red-500/20">{payload.valor_anterior}</span>
                <span className="text-slate-600">➔</span>
                <span className="bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-black text-[10px] uppercase border border-emerald-500/20">{payload.valor_nuevo}</span>
              </div>
            )}
            {payload.observaciones && <div className="mt-1"><span className="text-slate-500">Observaciones:</span> <span className="italic text-slate-400">"{payload.observaciones}"</span></div>}
          </div>
        </div>
      );
    }

    if (typeLower.includes('cerrado') || typeLower.includes('tramitado') || typeLower.includes('aprobado')) {
      return (
        <div className="space-y-1">
          <p className="text-emerald-400 font-bold text-xs uppercase tracking-wider">Resolución & Aprobación Exitosa</p>
          <div className="text-slate-300 font-mono text-[11px] mt-2">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Estado Final:</span> 
              <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30 uppercase font-black text-[9px] tracking-widest">
                {payload.estado_nuevo || 'Resuelto / Finalizado'}
              </span>
            </div>
            {payload.comentario && <div className="mt-1"><span className="text-slate-500">Detalles:</span> <span className="text-slate-300">"{payload.comentario}"</span></div>}
            {payload.monto_implicado !== undefined && payload.monto_implicado > 0 && (
              <div className="mt-1 text-slate-300 font-bold"><span className="text-slate-500">Monto Transado:</span> ${payload.monto_implicado}</div>
            )}
          </div>
        </div>
      );
    }

    if (typeLower.includes('rechazado') || typeLower.includes('anulado')) {
      return (
        <div className="space-y-1">
          <p className="text-red-400 font-bold text-xs uppercase tracking-wider">Hito de Fricción / Rechazo Operativo</p>
          <div className="text-slate-300 font-mono text-[11px] mt-2">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Estado:</span> 
              <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded border border-red-500/30 uppercase font-black text-[9px] tracking-widest">
                {payload.estado_nuevo || 'Rechazado'}
              </span>
            </div>
            {payload.comentario && <div className="mt-1"><span className="text-slate-500">Razón:</span> <span className="text-slate-300">"{payload.comentario}"</span></div>}
            {payload.monto_implicado !== undefined && payload.monto_implicado > 0 && (
              <div className="mt-1 text-slate-300"><span className="text-slate-500">Monto Implicado:</span> ${payload.monto_implicado}</div>
            )}
          </div>
        </div>
      );
    }

    // Default Fallback
    return (
      <div className="space-y-1">
        <p className="text-slate-400 font-bold text-xs uppercase tracking-wider">Actualización de Estado: {type}</p>
        <div className="text-slate-300 font-mono text-[11px] mt-2">
          {Object.keys(payload).map(key => (
            <div key={key} className="truncate">
              <span className="text-slate-500">{key}:</span> {typeof payload[key] === 'object' ? JSON.stringify(payload[key]) : String(payload[key])}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Obtener estilo de nodo de color y glow basado en event_type o severities
  const getEventGlowClass = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('creado')) return { border: 'border-blue-500', bg: 'bg-blue-500/20', text: 'text-blue-400', glow: 'shadow-[0_0_15px_rgba(59,130,246,0.5)]' };
    if (t.includes('cerrado') || t.includes('aprobado') || t.includes('tramitado')) return { border: 'border-emerald-500', bg: 'bg-emerald-500/20', text: 'text-emerald-400', glow: 'shadow-[0_0_15px_rgba(16,185,129,0.5)]' };
    if (t.includes('rechazado') || t.includes('anulado') || t.includes('alerta') || t.includes('bloqueado')) return { border: 'border-red-500', bg: 'bg-red-500/20', text: 'text-red-400', glow: 'shadow-[0_0_15px_rgba(239,68,68,0.5)]' };
    return { border: 'border-amber-500', bg: 'bg-amber-500/20', text: 'text-amber-400', glow: 'shadow-[0_0_15px_rgba(245,158,11,0.5)]' };
  };

  return (
    <div className="bg-[#0A0A0F] border border-slate-800 rounded-3xl p-6 text-white shadow-2xl space-y-6 relative overflow-hidden">
      
      {/* Background neon glows */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-950/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-800">
        <div>
          <span className="bg-emerald-950 text-emerald-400 text-[9px] font-black px-2 py-0.5 rounded border border-emerald-900 uppercase tracking-widest inline-flex items-center gap-1.5 mb-2">
            <Terminal size={10} /> Forensic Auditor
          </span>
          <h2 className="text-xl font-black text-white uppercase tracking-tighter">Buscador Forense del Ledger</h2>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Busca por usuario, módulo, acción, IP o cualquier término en los logs de auditoría</p>
        </div>
        <button 
          onClick={() => fetchTimeline(aggregateId)}
          disabled={loading || !aggregateId}
          className="p-2.5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl hover:bg-slate-850 active:scale-95 transition-all text-slate-400 hover:text-white"
          title="Refrescar Timeline"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Form de búsqueda */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Ej: Hrodriguez, CIERRE_ARQUEO, TESORERIA, LOGIN, José Pérez..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#11111A] border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-xs font-mono text-white placeholder-slate-600 outline-none transition-all shadow-inner focus:shadow-[0_0_15px_rgba(16,185,129,0.15)]"
          />
          <Search size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600" />
        </div>
        <button
          type="submit"
          disabled={loading || !searchQuery.trim()}
          className="bg-[#0b5156] text-white font-black px-5 rounded-xl text-xs uppercase hover:bg-[#083a3e] border border-[#0b5156]/50 transition-all shadow-[0_0_15px_rgba(11,81,86,0.3)] disabled:opacity-50 active:scale-95"
        >
          Buscar
        </button>
      </form>

      {/* Estados de carga / error */}
      {error && (
        <div className="bg-red-950/20 border border-red-500/20 p-5 rounded-2xl flex items-start gap-3 text-red-400">
          <ShieldAlert size={18} className="shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-black uppercase">Fallo de Verificación</h4>
            <p className="text-[10px] uppercase tracking-wide leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col justify-center items-center py-16 space-y-3">
          <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-emerald-400 font-black text-[10px] uppercase tracking-widest animate-pulse">Consultando Ledger Inmutable...</p>
        </div>
      ) : events.length === 0 ? (
        aggregateId ? (
          <div className="border border-dashed border-slate-800 p-12 rounded-3xl text-center space-y-2">
            <Clock size={28} className="text-slate-600 mx-auto" />
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Sin Registro de Transacciones</h4>
            <p className="text-[9px] text-slate-600 font-bold uppercase max-w-xs mx-auto">No se encontraron eventos asociados al ID "{aggregateId}" en este tenant.</p>
          </div>
        ) : (
          <div className="border border-dashed border-slate-800 p-12 rounded-3xl text-center space-y-2">
            <Terminal size={28} className="text-slate-600 mx-auto" />
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Esperando Entrada</h4>
            <p className="text-[9px] text-slate-600 font-bold uppercase max-w-xs mx-auto">Introduzca un identificador forense arriba para reconstruir su línea de tiempo inmutable.</p>
          </div>
        )
      ) : (
        /* LÍNEA DE TIEMPO VERTICAL */
        <div className="relative pl-6 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[1px] before:bg-slate-800">
          
          {events.map((event, index) => {
            const dateDetails = formatDate(event.occurred_at);
            const style = getEventGlowClass(event.event_type);
            const isExpanded = !!expandedEvents[event.event_id];

            return (
              <div key={event.event_id} className="relative group animate-in slide-in-from-left-2 duration-300">
                
                {/* Indicador de Nodo / Sello */}
                <div className={`absolute -left-[20px] top-1.5 w-2.5 h-2.5 rounded-full bg-[#0A0A0F] border-2 ${style.border} ${style.glow} z-10 transition-transform group-hover:scale-125`}></div>

                {/* Tarjeta del Evento (Glassmorphism) */}
                <div className="bg-[#11111A]/85 border border-slate-800/80 rounded-2xl p-4 shadow-lg hover:border-slate-700 transition-all duration-300">
                  
                  {/* Fila superior */}
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 pb-3 border-b border-slate-900/60 mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-black uppercase tracking-wider ${style.text}`}>
                        {event.event_type}
                      </span>
                      <span className="text-[8px] font-mono font-bold text-slate-600 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-900">
                        V1
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 font-mono text-[10px] font-bold">
                      <Clock size={11} />
                      <span>{dateDetails.date}</span>
                      <span className="text-slate-600">|</span>
                      <span className="text-slate-400">{dateDetails.time}</span>
                    </div>
                  </div>

                  {/* Cuerpo decodificado */}
                  <div className="text-slate-300 text-xs">
                    {translatePayload(event.event_type, event.payload)}
                  </div>

                  {/* Actor y Metadatos */}
                  <div className="mt-3 pt-3 border-t border-slate-900/60 flex flex-wrap gap-x-4 gap-y-2 items-center text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                    <div className="flex items-center gap-1">
                      <User size={12} className="text-slate-600" />
                      <span>Autor ID:</span>
                      <span className="text-slate-400 font-mono text-[9px] lowercase">{event.actor_id || "sistema (interno)"}</span>
                    </div>
                    <div className="text-slate-700">|</div>
                    <div className="font-mono text-[9px] text-slate-600">
                      Sello ID: {event.event_id}
                    </div>
                  </div>

                  {/* JSON Expandible */}
                  <div className="mt-3">
                    <button
                      onClick={() => toggleExpand(event.event_id)}
                      className="flex items-center gap-1 text-[9px] font-black text-slate-500 uppercase hover:text-white transition-colors"
                    >
                      {isExpanded ? (
                        <><ChevronUp size={12} /> Ocultar Payload JSON</>
                      ) : (
                        <><ChevronDown size={12} /> Ver Payload JSON Completo</>
                      )}
                    </button>

                    {isExpanded && (
                      <pre className="mt-2.5 p-3.5 bg-slate-950 border border-slate-900 rounded-xl overflow-x-auto text-[10px] text-emerald-400 font-mono leading-relaxed max-h-48 scrollbar-thin select-all">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    )}
                  </div>

                </div>

              </div>
            );
          })}

        </div>
      )}

    </div>
  );
}
