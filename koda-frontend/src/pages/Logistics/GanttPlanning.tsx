import { useState, useEffect, useRef } from 'react';
import {
  Calendar, Truck, User, Plus, CheckCircle, Clock,
  MapPin, RefreshCw, X, Users, Send, Zap, HelpCircle,
  ChevronDown, ChevronRight, AlertTriangle,
} from 'lucide-react';
import { api } from '@/api/client';

/* ─── helpers ─── */
function dayLabel(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return {
    full: DAYS[d.getDay()],
    short: DAYS[d.getDay()].slice(0, 3).toUpperCase(),
    date: `${d.getDate()} ${MONTHS[d.getMonth()]}`,
    iso: d.toISOString().split('T')[0],
    isToday: offset === 0,
  };
}
const DAYS = [0, 1, 2].map(dayLabel);

/* ─── Manual Modal ─── */
function ManualModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0b5156]/10 flex items-center justify-center">
              <HelpCircle size={18} className="text-[#0b5156]" />
            </div>
            <h3 className="text-base font-black text-slate-800">Manual de Uso</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          {[
            { step: '1', title: 'Registra tu flota', desc: 'Usa el botón "+ Vehículo" para añadir camiones, furgones o motos a tu flota operativa.' },
            { step: '2', title: 'Crea tripulaciones', desc: 'Combina un vehículo con un chofer principal y sus ayudantes usando "+ Tripulación".' },
            { step: '3', title: 'Asigna despachos', desc: 'Haz click en cualquier celda "Libre" en la tabla. Escribe la ruta y los detalles de carga.' },
            { step: '4', title: 'Aprueba el plan', desc: 'Los planes en ámbar son borradores. Apruébalos para que los choferes reciban su hoja de ruta vía Telegram.' },
            { step: '5', title: 'Haz seguimiento', desc: 'Las barras verdes son despachos aprobados. Haz click para ver los detalles completos.' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-[#0b5156] text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">{step}</div>
              <div>
                <p className="text-sm font-black text-slate-800">{title}</p>
                <p className="text-xs text-slate-500 font-medium mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 mt-2">
          <span className="w-3 h-3 rounded bg-emerald-500 shrink-0" />
          <span className="text-xs font-bold text-slate-500">Verde = Aprobado</span>
          <span className="w-3 h-3 rounded bg-amber-400 shrink-0 ml-3" />
          <span className="text-xs font-bold text-slate-500">Ámbar = Borrador</span>
          <span className="w-3 h-3 rounded border-2 border-dashed border-slate-300 shrink-0 ml-3" />
          <span className="text-xs font-bold text-slate-500">Libre</span>
        </div>

        <button onClick={onClose} className="w-full bg-[#0b5156] hover:bg-[#083a3d] text-white py-2.5 rounded-xl text-sm font-black uppercase tracking-wider transition-all">
          Entendido
        </button>
      </div>
    </div>
  );
}

/* ─── Pending Plans Dropdown ─── */
function PendingPanel({ plans, onApprove, onDetail }: { plans: any[]; onApprove: (id: number) => void; onDetail: (p: any) => void }) {
  const [open, setOpen] = useState(true);
  if (plans.length === 0) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-100/50 transition-colors">
        <div className="flex items-center gap-2.5">
          <AlertTriangle size={14} className="text-amber-600" />
          <span className="text-xs font-black text-amber-800 uppercase tracking-wider">
            {plans.length} Plan{plans.length > 1 ? 'es' : ''} pendiente{plans.length > 1 ? 's' : ''} de aprobación
          </span>
          <span className="text-[9px] font-black bg-amber-500 text-white px-2 py-0.5 rounded-full">{plans.length}</span>
        </div>
        <ChevronDown size={14} className={`text-amber-600 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-amber-200 px-4 py-3 flex flex-wrap gap-3">
          {plans.map(p => {
            const day = DAYS.find(d => d.iso === p.fecha_planificacion);
            return (
              <div key={p.id} className="flex items-center gap-3 bg-white border border-amber-200 rounded-xl px-3 py-2">
                <div>
                  <p className="text-xs font-black text-slate-800">{day?.full || p.fecha_planificacion}</p>
                  <p className="text-[10px] text-amber-700 font-semibold">{p.despachos?.length || 0} despachos</p>
                </div>
                <button
                  onClick={() => onDetail(p)}
                  className="text-[9px] font-black text-slate-500 hover:text-slate-700 uppercase tracking-wider border border-slate-200 rounded-lg px-2 py-1 transition-colors"
                >Ver</button>
                <button
                  onClick={() => onApprove(p.id)}
                  className="text-[9px] font-black bg-[#0b5156] hover:bg-[#083a3d] text-white rounded-lg px-3 py-1 flex items-center gap-1 transition-colors"
                >
                  <Zap size={9} /> Aprobar
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Quick Assign Modal ─── */
function AssignModal({ crew, dayIso, onClose, onSaved, showToast }: any) {
  const [ruta, setRuta] = useState('');
  const [detalles, setDetalles] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const day = DAYS.find(d => d.iso === dayIso);
  useEffect(() => { ref.current?.focus(); }, []);

  const save = async () => {
    if (!ruta.trim()) { showToast('Escribe la ruta o destino.'); return; }
    setSaving(true);
    try {
      await api.post('/api/logistica/planes', {
        fecha_planificacion: dayIso,
        despachos: [{ crew_id: Number(crew.id), ruta: ruta.trim(), detalles: detalles.trim() }],
      });
      showToast(`Despacho asignado — ${ruta}`);
      onSaved(); onClose();
    } catch (e: any) { showToast(e.message || 'Error.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-black text-[#0b5156] uppercase tracking-widest">Nuevo Despacho</p>
            <h3 className="text-lg font-black text-slate-800 mt-0.5">{crew.nombre}</h3>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
              <span className="font-bold">{day?.full}</span>
              <span>·</span><Truck className="inline w-3 h-3" /><span>{crew.vehiculo?.nombre}</span>
              <span>·</span><User className="inline w-3 h-3" /><span>{crew.chofer?.nombre}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Ruta / Destino *</label>
          <input ref={ref} type="text" value={ruta} onChange={e => setRuta(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()}
            placeholder="Ej: Zona Norte — Valencia"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0b5156]/20 focus:border-[#0b5156]/40 transition"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Detalles de Carga</label>
          <input type="text" value={detalles} onChange={e => setDetalles(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()}
            placeholder="Ej: 60 cajas / Entrega AM antes 12:00"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0b5156]/20 focus:border-[#0b5156]/40 transition"
          />
        </div>
        <button onClick={save} disabled={saving || !ruta.trim()}
          className="w-full bg-[#0b5156] hover:bg-[#083a3d] disabled:opacity-40 text-white py-3 rounded-xl text-sm font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md">
          {saving ? <><RefreshCw size={14} className="animate-spin" /> Guardando...</> : <><Send size={14} /> Asignar Despacho</>}
        </button>
      </div>
    </div>
  );
}

/* ─── Plan Detail Panel ─── */
function DetailPanel({ plan, onClose, onApprove }: { plan: any; onClose: () => void; onApprove: (id: number) => void }) {
  const approved = plan.estado === 'APROBADO';
  const day = DAYS.find(d => d.iso === plan.fecha_planificacion);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="h-full w-full max-w-sm bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-start justify-between">
          <div>
            <div className={`inline-flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded-full mb-2 ${approved ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {approved ? <CheckCircle size={11} /> : <Clock size={11} />}
              {approved ? 'APROBADO' : 'BORRADOR'}
            </div>
            <h3 className="text-base font-black text-slate-800">{day?.full || plan.fecha_planificacion}</h3>
            <p className="text-sm text-slate-400 font-semibold">{day?.date}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
            {plan.despachos?.length || 0} Despacho{plan.despachos?.length !== 1 ? 's' : ''}
          </p>
          {plan.despachos?.map((d: any) => (
            <div key={d.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50 space-y-2">
              <div className="flex items-center gap-2">
                <MapPin size={13} className="text-[#0b5156] shrink-0" />
                <span className="text-sm font-black text-slate-800">{d.ruta}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Truck size={11} className="shrink-0" /><span className="font-semibold">{d.crew?.nombre}</span>
                <span>·</span><span>{d.crew?.vehiculo?.nombre}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <User size={11} className="shrink-0" /><span>{d.crew?.chofer?.nombre}</span>
              </div>
              {d.detalles && <p className="text-xs text-slate-400 font-medium border-t border-slate-100 pt-2">{d.detalles}</p>}
            </div>
          ))}
        </div>
        {!approved && (
          <div className="p-5 border-t border-slate-100">
            <button onClick={() => onApprove(plan.id)}
              className="w-full bg-[#0b5156] hover:bg-[#083a3d] text-white py-3 rounded-xl text-sm font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md">
              <CheckCircle size={14} /> Aprobar y Notificar Choferes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Crew Modal ─── */
function CrewModal({ vehicles, employees, onClose, onSaved, showToast }: any) {
  const [nombre, setNombre] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [choferId, setChoferId] = useState('');
  const [ayudantes, setAyudantes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const toggle = (id: string) => setAyudantes(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const save = async () => {
    if (!nombre || !vehicleId || !choferId) { showToast('Completa todos los campos.'); return; }
    setSaving(true);
    try {
      await api.post('/api/logistica/crews', { nombre, vehiculo_id: Number(vehicleId), chofer_id: choferId, ayudantes_ids: ayudantes });
      showToast('Tripulación creada.'); onSaved(); onClose();
    } catch (e: any) { showToast(e.message || 'Error.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-800">Nueva Tripulación</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-1">Nombre *</label>
          <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Tripulación Delta"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#0b5156]/20" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-1">Vehículo *</label>
          <select value={vehicleId} onChange={e => setVehicleId(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none">
            <option value="">Seleccione...</option>
            {vehicles.filter((v: any) => v.estado === 'DISPONIBLE').map((v: any) => (
              <option key={v.id} value={v.id}>{v.nombre} ({v.placa})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-1">Chofer *</label>
          <select value={choferId} onChange={e => setChoferId(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none">
            <option value="">Seleccione...</option>
            {employees.map((p: any) => (
              <option key={p.id} value={p.id}>{p.nombre} {p.apellido || ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-1">Ayudantes</label>
          <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-xl bg-slate-50 p-3 space-y-2">
            {employees.filter((p: any) => p.id !== choferId).map((p: any) => (
              <label key={p.id} className="flex items-center gap-3 cursor-pointer">
                <div onClick={() => toggle(p.id)}
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer transition-colors ${ayudantes.includes(p.id) ? 'bg-[#0b5156] border-[#0b5156]' : 'border-slate-300'}`}>
                  {ayudantes.includes(p.id) && <CheckCircle size={10} className="text-white" />}
                </div>
                <span className="text-sm font-semibold text-slate-700">{p.nombre}</span>
              </label>
            ))}
          </div>
        </div>
        <button onClick={save} disabled={saving}
          className="w-full bg-[#0b5156] hover:bg-[#083a3d] disabled:opacity-40 text-white py-3 rounded-xl text-sm font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2">
          {saving ? <><RefreshCw size={14} className="animate-spin" /> Creando...</> : <><Users size={14} /> Crear Tripulación</>}
        </button>
      </div>
    </div>
  );
}

/* ─── Vehicle Modal ─── */
function VehicleModal({ onClose, onSaved, showToast }: any) {
  const [nombre, setNombre] = useState('');
  const [placa, setPlaca] = useState('');
  const [tipo, setTipo] = useState('CAMION');
  const [capacidad, setCapacidad] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!nombre || !placa) { showToast('Nombre y placa requeridos.'); return; }
    setSaving(true);
    try {
      await api.post('/api/logistica/vehiculos', { nombre, placa, tipo, capacidad_kg: Number(capacidad) || 0 });
      showToast('Vehículo registrado.'); onSaved(); onClose();
    } catch (e: any) { showToast(e.message || 'Error.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-800">Nuevo Vehículo</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-1">Nombre *</label>
          <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Camión Volvo 12T"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#0b5156]/20" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-1">Placa *</label>
          <input type="text" value={placa} onChange={e => setPlaca(e.target.value.toUpperCase())} placeholder="AB123CD"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-black font-mono focus:outline-none focus:ring-2 focus:ring-[#0b5156]/20" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-2">Tipo</label>
          <div className="grid grid-cols-3 gap-2">
            {[['CAMION', '🚛 Camión'], ['FURGON', '🚐 Furgón'], ['MOTO', '🏍️ Moto']].map(([v, l]) => (
              <button key={v} onClick={() => setTipo(v)}
                className={`py-2 rounded-xl text-xs font-bold border transition-all ${tipo === v ? 'bg-[#0b5156] text-white border-[#0b5156]' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{l}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 block mb-1">Capacidad (Kg)</label>
          <input type="number" value={capacidad} onChange={e => setCapacidad(e.target.value)} placeholder="5000"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#0b5156]/20" />
        </div>
        <button onClick={save} disabled={saving}
          className="w-full bg-[#0b5156] hover:bg-[#083a3d] disabled:opacity-40 text-white py-3 rounded-xl text-sm font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2">
          {saving ? <><RefreshCw size={14} className="animate-spin" /> Guardando...</> : <><Truck size={14} /> Registrar</>}
        </button>
      </div>
    </div>
  );
}

/* ─── Gantt Bar ─── */
function GanttBar({ dispatch, plan, onClick }: { dispatch: any; plan: any; onClick: () => void }) {
  const approved = plan?.estado === 'APROBADO';
  return (
    <button onClick={onClick} title={dispatch.ruta}
      className={`w-full h-12 rounded-lg text-left px-3 flex flex-col justify-center border transition-all duration-150 hover:shadow-md hover:scale-[1.02] active:scale-[0.99]
        ${approved ? 'bg-emerald-500 border-emerald-600 hover:bg-emerald-600' : 'bg-amber-400 border-amber-500 hover:bg-amber-500'}`}>
      <p className="text-white text-[10px] font-black uppercase tracking-wide truncate leading-tight">{dispatch.ruta}</p>
      {dispatch.detalles && (
        <p className="text-white/70 text-[9px] font-medium truncate leading-tight mt-0.5">{dispatch.detalles}</p>
      )}
    </button>
  );
}

/* ─── Empty Cell ─── */
function EmptyBar({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full h-12 rounded-lg border-2 border-dashed border-slate-200 hover:border-[#0b5156]/40 hover:bg-[#0b5156]/5 transition-all duration-150 flex items-center justify-center gap-1.5 text-slate-300 hover:text-[#0b5156] group">
      <Plus size={13} className="transition-transform group-hover:scale-110" />
      <span className="text-[9px] font-black uppercase tracking-widest">Libre</span>
    </button>
  );
}

/* ═══════════════════════════ MAIN ═══════════════════════════ */
export default function GanttPlanning() {
  const [plans, setPlans] = useState<any[]>([]);
  const [crews, setCrews] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const [assignTarget, setAssignTarget] = useState<{ crew: any; dayIso: string } | null>(null);
  const [detailPlan, setDetailPlan] = useState<any | null>(null);
  const [showCrewModal, setShowCrewModal] = useState(false);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  const load = async () => {
    setLoading(true);
    try {
      const [p, c, v, e] = await Promise.all([
        api.get<any[]>('/api/logistica/planes'),
        api.get<any[]>('/api/logistica/crews'),
        api.get<any[]>('/api/logistica/vehiculos'),
        api.get<any[]>('/api/logistica/personal'),
      ]);
      setPlans(p || []); setCrews(c || []); setVehicles(v || []); setEmployees(e || []);
    } catch { showToast('Error al cargar datos.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const approve = async (id: number) => {
    try {
      const r: any = await api.post(`/api/logistica/planes/${id}/aprobar`);
      showToast(r.message || 'Plan aprobado. Notificaciones enviadas.'); setDetailPlan(null); load();
    } catch (e: any) { showToast(e.message || 'Error al aprobar.'); }
  };

  const drafts = plans.filter(p => p.estado === 'BORRADOR');
  const approved = plans.filter(p => p.estado === 'APROBADO');

  return (
    <div className="bg-[#F4F6F8] pb-8">

      {/* ── TOP BAR ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-30 shadow-sm">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Left: title + KPIs */}
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#0b5156]/10 flex items-center justify-center shrink-0">
                <Calendar size={17} className="text-[#0b5156]" />
              </div>
              <div>
                <h1 className="text-sm font-black text-slate-800 uppercase tracking-tight leading-none">Planificación Semanal</h1>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Próximos 3 días</p>
              </div>
            </div>
            {/* KPI chips */}
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { icon: Truck, label: `${vehicles.length} Vehículos`, color: 'bg-blue-50 text-blue-700 border-blue-100' },
                { icon: Users, label: `${crews.length} Tripulaciones`, color: 'bg-purple-50 text-purple-700 border-purple-100' },
                { icon: CheckCircle, label: `${approved.length} Aprobados`, color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
                ...(drafts.length > 0 ? [{ icon: Clock, label: `${drafts.length} Pendientes`, color: 'bg-amber-50 text-amber-700 border-amber-200' }] : []),
              ].map(({ icon: Icon, label, color }) => (
                <span key={label} className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border ${color}`}>
                  <Icon size={10} /> {loading ? '—' : label}
                </span>
              ))}
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setShowManual(true)}
              className="flex items-center gap-1.5 border border-slate-200 hover:border-slate-300 bg-white text-slate-600 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all">
              <HelpCircle size={13} /> Manual
            </button>
            <button onClick={() => setShowVehicleModal(true)}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all">
              <Truck size={13} /> + Vehículo
            </button>
            <button onClick={() => setShowCrewModal(true)}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all">
              <Users size={13} /> + Tripulación
            </button>
            <button onClick={load} className={`p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-all ${loading ? 'animate-pulse' : ''}`}>
              <RefreshCw size={14} className={loading ? 'animate-spin text-[#0b5156]' : 'text-slate-500'} />
            </button>
          </div>
        </div>
      </div>

      {/* ── PAGE BODY ── */}
      <div className="p-6 space-y-4">

        {/* Pending plans alert banner */}
        <PendingPanel plans={drafts} onApprove={approve} onDetail={setDetailPlan} />

        {/* ── GANTT — FULL WIDTH ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Legend bar */}
          <div className="px-5 py-2.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <span className="text-[10px] font-semibold text-slate-400">Click en "Libre" para asignar · Click en una barra para ver detalles</span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                <span className="w-3 h-3 rounded bg-emerald-500 shrink-0" /> Aprobado
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                <span className="w-3 h-3 rounded bg-amber-400 shrink-0" /> Borrador
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                <span className="w-3 h-3 rounded border-2 border-dashed border-slate-300 shrink-0" /> Libre
              </span>
            </div>
          </div>

          {/* Gantt Table — full width */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse">
              <thead>
                <tr>
                  <th className="w-44 border-r border-slate-100 bg-slate-50 px-5 py-3.5 text-left">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tripulación</span>
                  </th>
                  {DAYS.map(d => (
                    <th key={d.iso} className={`border-r last:border-r-0 border-slate-100 px-4 py-3.5 text-center ${d.isToday ? 'bg-[#0b5156]/5' : 'bg-slate-50'}`}>
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`text-xs font-black uppercase tracking-wider ${d.isToday ? 'text-[#0b5156]' : 'text-slate-600'}`}>{d.short}</span>
                        <span className={`text-[11px] font-bold ${d.isToday ? 'text-[#0b5156]' : 'text-slate-400'}`}>{d.date}</span>
                        {d.isToday && <span className="text-[8px] font-black bg-[#0b5156] text-white px-2 py-0.5 rounded-full mt-0.5">HOY</span>}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="py-16 text-center">
                      <RefreshCw size={22} className="animate-spin text-slate-200 mx-auto mb-3" />
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Cargando planificación...</p>
                    </td>
                  </tr>
                ) : crews.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-16 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                        <Users size={22} className="text-slate-300" />
                      </div>
                      <p className="text-sm font-black text-slate-400 uppercase mb-1">Sin tripulaciones</p>
                      <p className="text-xs text-slate-300 mb-4">Crea tu primera tripulación para comenzar a planificar</p>
                      <button onClick={() => setShowCrewModal(true)}
                        className="bg-[#0b5156] text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-[#083a3d] transition-all">
                        + Crear Tripulación
                      </button>
                    </td>
                  </tr>
                ) : (
                  crews.map((crew, idx) => (
                    <tr key={crew.id} className={`border-t border-slate-100 ${idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}>
                      <td className="border-r border-slate-100 px-4 py-3 align-middle">
                        <div className="flex items-start gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[#0b5156]/10 flex items-center justify-center shrink-0 mt-0.5">
                            <Truck size={12} className="text-[#0b5156]" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-800 truncate leading-tight">{crew.nombre}</p>
                            <p className="text-[10px] text-slate-400 font-semibold truncate mt-0.5">{crew.vehiculo?.nombre}</p>
                            <p className="text-[10px] text-slate-400 font-semibold flex items-center gap-1 mt-0.5">
                              <User size={9} className="shrink-0" />{crew.chofer?.nombre}
                            </p>
                          </div>
                        </div>
                      </td>
                      {DAYS.map(d => {
                        const plan = plans.find(p => p.fecha_planificacion === d.iso);
                        const dispatch = plan?.despachos?.find((dp: any) => dp.crew?.id === crew.id);
                        return (
                          <td key={d.iso} className={`border-r last:border-r-0 border-slate-100 px-3 py-3 align-middle ${d.isToday ? 'bg-[#0b5156]/[0.02]' : ''}`}>
                            {dispatch
                              ? <GanttBar dispatch={dispatch} plan={plan} onClick={() => setDetailPlan(plan)} />
                              : <EmptyBar onClick={() => setAssignTarget({ crew, dayIso: d.iso })} />
                            }
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── OVERLAYS ── */}
      {assignTarget && <AssignModal crew={assignTarget.crew} dayIso={assignTarget.dayIso} onClose={() => setAssignTarget(null)} onSaved={load} showToast={showToast} />}
      {detailPlan && <DetailPanel plan={detailPlan} onClose={() => setDetailPlan(null)} onApprove={approve} />}
      {showCrewModal && <CrewModal vehicles={vehicles} employees={employees} onClose={() => setShowCrewModal(false)} onSaved={load} showToast={showToast} />}
      {showVehicleModal && <VehicleModal onClose={() => setShowVehicleModal(false)} onSaved={load} showToast={showToast} />}
      {showManual && <ManualModal onClose={() => setShowManual(false)} />}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999] animate-in slide-in-from-bottom-3 duration-300">
          <div className="bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 max-w-xs border border-slate-700">
            <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span className="text-xs font-bold">{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}
