import { useState, useEffect, useCallback } from 'react';
import { Plus, Wrench, ChevronDown, RefreshCw, X, Save, AlertTriangle } from 'lucide-react';
import { api } from '@/api/client';
import { Toast } from '@/components/common/Toast';

interface Vehiculo { id: number; nombre: string; placa: string; tipo: string; km_actuales: number; proximo_servicio_km?: number; }
interface Mantenimiento {
  id: number; fecha: string; tipo: string; descripcion?: string;
  costo_usd?: number; km_al_servicio?: number; proximo_km?: number;
  vehiculo?: { id: number; nombre: string; placa: string; };
}

const TIPOS_SERV = ['ACEITE', 'NEUMATICOS', 'FRENOS', 'REVISION', 'ELECTRICO', 'CARROCERIA', 'OTRO'];
const VEHICLE_ICONS: Record<string, string> = { CAMION: '🚛', CARRO: '🚗', MOTO: '🏍️', FURGON: '🚐', AVION: '✈️', BARCO: '🚢', OTRO: '🚌' };
const TIPO_ICON: Record<string, string> = { ACEITE: '🛢️', NEUMATICOS: '⚙️', FRENOS: '🔴', REVISION: '🔍', ELECTRICO: '⚡', CARROCERIA: '🔧', OTRO: '🛠️' };

function MantenimientoModal({ vehiculos, onClose, onSaved }: { vehiculos: Vehiculo[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ vehiculo_id: vehiculos[0]?.id || 0, tipo: 'ACEITE', descripcion: '', costo_usd: '', km_al_servicio: '', proximo_km: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (key: string, val: any) => setForm(f => ({ ...f, [key]: val }));

  const selectedVehiculo = vehiculos.find(v => v.id === +form.vehiculo_id);

  const handleSave = async () => {
    if (!form.vehiculo_id || !form.tipo) { setError('Vehículo y tipo son requeridos.'); return; }
    setLoading(true); setError('');
    try {
      await api.post('/api/logistica/mantenimiento', {
        vehiculo_id: +form.vehiculo_id,
        tipo: form.tipo,
        descripcion: form.descripcion || undefined,
        costo_usd: form.costo_usd ? +form.costo_usd : undefined,
        km_al_servicio: form.km_al_servicio ? +form.km_al_servicio : undefined,
        proximo_km: form.proximo_km ? +form.proximo_km : undefined,
      });
      onSaved(); onClose();
    } catch (e: any) {
      setError(e.message || 'Error guardando mantenimiento.');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 md:pt-20 overflow-y-auto pb-20 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-white rounded-3xl border border-slate-200 p-6 md:p-10 w-full max-w-xl mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'slideUp 0.35s cubic-bezier(0.34,1.56,0.64,1)' }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-slate-800 font-black text-lg uppercase tracking-tight">Registrar Servicio</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {error && <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm font-semibold">{error}</div>}

        <div className="space-y-3">
          {/* Vehículo selector */}
          <div>
            <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-1.5 block">Vehículo *</label>
            <div className="relative">
              <select value={form.vehiculo_id} onChange={e => set('vehiculo_id', +e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#0b5156]/50 appearance-none">
                {vehiculos.map(v => <option key={v.id} value={v.id}>{v.placa} — {v.nombre}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* KM actual del vehículo seleccionado */}
          {selectedVehiculo && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 flex items-center gap-3">
              <span className="text-lg">{VEHICLE_ICONS[selectedVehiculo.tipo] || '🚛'}</span>
              <div>
                <div className="text-slate-500 text-[10px] font-black uppercase">KM actuales del vehículo</div>
                <div className="text-slate-800 font-black text-sm">{selectedVehiculo.km_actuales.toLocaleString()} km</div>
              </div>
              {selectedVehiculo.proximo_servicio_km && selectedVehiculo.km_actuales >= selectedVehiculo.proximo_servicio_km * 0.95 && (
                <div className="ml-auto flex items-center gap-1 text-amber-600 text-xs font-black uppercase">
                  <AlertTriangle className="w-3.5 h-3.5" /> Servicio requerido
                </div>
              )}
            </div>
          )}

          {/* Tipo de servicio */}
          <div>
            <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-2 block">Tipo de Servicio *</label>
            <div className="grid grid-cols-4 gap-2">
              {TIPOS_SERV.map(t => (
                <button key={t} onClick={() => set('tipo', t)}
                  className={`flex flex-col items-center gap-1 rounded-xl py-2 border transition-all ${form.tipo === t ? 'border-[#0b5156] bg-[#0b5156]/5' : 'border-slate-200 hover:border-slate-400'}`}>
                  <span className="text-lg">{TIPO_ICON[t]}</span>
                  <span className="text-[9px] text-slate-500 font-bold">{t}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-1.5 block">Descripción del trabajo</label>
            <textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
              placeholder="Detalle del servicio realizado..."
              rows={2}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#0b5156]/50 resize-none placeholder-slate-300" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-1.5 block">Costo USD</label>
              <input type="number" value={form.costo_usd} onChange={e => set('costo_usd', e.target.value)} placeholder="0.00"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#0b5156]/50 placeholder-slate-300" />
            </div>
            <div>
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-1.5 block">KM al servicio</label>
              <input type="number" value={form.km_al_servicio} onChange={e => set('km_al_servicio', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#0b5156]/50" />
            </div>
            <div>
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-1.5 block">Próx. KM</label>
              <input type="number" value={form.proximo_km} onChange={e => set('proximo_km', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#0b5156]/50" />
            </div>
          </div>
        </div>

        <button onClick={handleSave} disabled={loading}
          className="mt-5 w-full bg-[#0b5156] hover:bg-[#083a3d] disabled:opacity-40 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl flex items-center justify-center gap-2 transition-all">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {loading ? 'Guardando...' : 'Registrar Servicio'}
        </button>
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
const FleetMaintenance = () => {
  const [mantenimientos, setMantenimientos] = useState<Mantenimiento[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [filtroVehiculo, setFiltroVehiculo] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [mData, vData] = await Promise.all([
        api.get<Mantenimiento[]>(filtroVehiculo ? `/api/logistica/mantenimiento?vehiculo_id=${filtroVehiculo}` : '/api/logistica/mantenimiento'),
        api.get<Vehiculo[]>('/api/logistica/vehiculos'),
      ]);
      setMantenimientos(mData || []);
      setVehiculos(vData || []);
    } catch { setToast({ message: 'Error cargando historial', type: 'error' }); }
    finally { setIsLoading(false); }
  }, [filtroVehiculo]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Vehículos con alerta de km próximo
  const vehiculosAlerta = vehiculos.filter(v => v.proximo_servicio_km && v.km_actuales >= v.proximo_servicio_km * 0.95);

  return (
    <div className="min-h-screen bg-[#F4F6F8] text-slate-800 pb-24 animate-in fade-in duration-300">
      <style>{`@keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>

      {/* Header */}
      <header className="bg-white p-8 rounded-3xl border border-[#bdafa1]/20 shadow-sm relative overflow-hidden mb-6">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <Wrench size={120} className="text-[#0b5156]" />
        </div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">Mantenimiento</span>
            </div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Registro de Servicios</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight">{mantenimientos.length} servicios registrados en la bitácora.</p>
          </div>
          <button onClick={fetchAll} className="bg-slate-50 text-slate-600 p-2.5 rounded-xl border border-slate-200 hover:bg-white transition-all shadow-sm">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Alerta de vehículos que requieren servicio */}
      {vehiculosAlerta.length > 0 && (
        <div className="mb-6 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-xs text-amber-700 font-black uppercase tracking-wider">
            {vehiculosAlerta.map(v => v.placa).join(', ')} — servicio requerido o próximo
          </span>
        </div>
      )}

      {/* Filtro por vehículo */}
      <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar pb-0.5 px-1">
        <button onClick={() => setFiltroVehiculo(null)} className={`shrink-0 text-[10px] px-4 py-2 rounded-full border font-black uppercase tracking-widest transition-all ${!filtroVehiculo ? 'bg-[#0b5156] border-[#0b5156] text-white' : 'border-slate-200 text-slate-500 bg-white hover:border-slate-400'}`}>
          Todos
        </button>
        {vehiculos.map(v => (
          <button key={v.id} onClick={() => setFiltroVehiculo(filtroVehiculo === v.id ? null : v.id)}
            className={`shrink-0 text-[10px] px-4 py-2 rounded-full border font-black uppercase tracking-widest transition-all ${filtroVehiculo === v.id ? 'bg-[#0b5156]/10 border-[#0b5156]/30 text-[#0b5156]' : 'border-slate-200 text-slate-500 bg-white hover:border-slate-400'}`}>
            {VEHICLE_ICONS[v.tipo] || '🚛'} {v.placa}
          </button>
        ))}
      </div>

      <div className="max-w-7xl mx-auto px-4">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse border border-slate-100" />)}</div>
        ) : mantenimientos.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-black uppercase">Sin historial de servicios</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mantenimientos.map(m => (
              <div key={m.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#0b5156]/10 flex items-center justify-center shrink-0">
                    <span className="text-lg">{TIPO_ICON[m.tipo] || '🛠️'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-slate-800 font-black text-sm uppercase">{m.tipo}</span>
                      <span className="text-slate-400 text-[10px] font-black uppercase">{new Date(m.fecha).toLocaleDateString('es-VE')}</span>
                    </div>
                    {m.vehiculo && (
                      <div className="text-slate-500 text-xs font-semibold mb-1">{m.vehiculo.placa} — {m.vehiculo.nombre}</div>
                    )}
                    {m.descripcion && <div className="text-slate-600 text-xs mb-2 leading-relaxed font-semibold">{m.descripcion}</div>}
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 font-semibold">
                      {m.costo_usd && <span>💵 ${m.costo_usd.toFixed(2)}</span>}
                      {m.km_al_servicio && <span>🔑 {m.km_al_servicio.toLocaleString()} km</span>}
                      {m.proximo_km && <span>⏭️ próx. {m.proximo_km.toLocaleString()} km</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={() => setShowModal(true)}
        className="fixed bottom-6 right-5 z-40 bg-[#0b5156] hover:bg-[#083a3d] text-white rounded-2xl px-5 py-4 shadow-2xl shadow-[#0b5156]/40 flex items-center gap-2.5 transition-all hover:scale-105 active:scale-95 font-black text-xs uppercase tracking-widest">
        <Plus className="w-5 h-5" /> Nuevo Servicio
      </button>

      {showModal && <MantenimientoModal vehiculos={vehiculos} onClose={() => setShowModal(false)} onSaved={fetchAll} />}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

export default FleetMaintenance;
