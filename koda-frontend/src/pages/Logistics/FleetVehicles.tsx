import { useState, useEffect, useCallback } from 'react';
import { Plus, Truck, Edit2, Trash2, AlertTriangle, CheckCircle2, RefreshCw, X, Save } from 'lucide-react';
import { api } from '@/api/client';
import { Toast } from '@/components/common/Toast';

interface Vehiculo {
  id: number; nombre: string; placa: string; tipo: string;
  marca?: string; modelo?: string; anio?: number; color?: string;
  capacidad_kg?: number; estado: string;
  km_actuales: number; proximo_servicio_km?: number;
  ultimo_servicio?: string;
}

const TIPOS = ['CAMION', 'CARRO', 'MOTO', 'FURGON', 'AVION', 'BARCO', 'OTRO'];
const ESTADOS = ['DISPONIBLE', 'EN_RUTA', 'EN_MANTENIMIENTO', 'INACTIVO'];
const VEHICLE_ICONS: Record<string, string> = { CAMION: '🚛', CARRO: '🚗', MOTO: '🏍️', FURGON: '🚐', AVION: '✈️', BARCO: '🚢', OTRO: '🚌' };

const ESTADO_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  DISPONIBLE:      { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  EN_RUTA:         { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200' },
  EN_MANTENIMIENTO:{ bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  INACTIVO:        { bg: 'bg-slate-50',    text: 'text-slate-400',   border: 'border-slate-200' },
};

const EMPTY: Partial<Vehiculo> = { tipo: 'CAMION', estado: 'DISPONIBLE', km_actuales: 0 };

function VehicleModal({ vehiculo, onClose, onSaved }: { vehiculo: Partial<Vehiculo>; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<Vehiculo>>(vehiculo);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isEdit = !!vehiculo.id;

  const set = (key: keyof Vehiculo, val: any) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.nombre?.trim() || !form.placa?.trim()) { setError('Nombre y placa son requeridos.'); return; }
    setLoading(true);
    setError('');
    try {
      if (isEdit) await api.put(`/api/logistica/vehiculos/${vehiculo.id}`, form);
      else await api.post('/api/logistica/vehiculos', form);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Error guardando vehículo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 md:pt-20 overflow-y-auto pb-20 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-white rounded-3xl border border-slate-200 p-6 md:p-10 w-full max-w-xl mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'slideUp 0.35s cubic-bezier(0.34,1.56,0.64,1)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-slate-800 font-black text-lg uppercase tracking-tight">{isEdit ? 'Editar Vehículo' : 'Nuevo Vehículo'}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {error && <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm font-semibold">{error}</div>}

        <div className="space-y-3">
          {/* Tipo selector */}
          <div>
            <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-2 block">Tipo de Vehículo</label>
            <div className="grid grid-cols-4 gap-2">
              {TIPOS.map(t => (
                <button key={t} onClick={() => set('tipo', t)}
                  className={`flex flex-col items-center gap-1 rounded-xl py-2 border transition-all text-center ${form.tipo === t ? 'border-[#0b5156] bg-[#0b5156]/5' : 'border-slate-200 hover:border-slate-400'}`}>
                  <span className="text-xl">{VEHICLE_ICONS[t]}</span>
                  <span className="text-[9px] text-slate-500 font-bold">{t}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-1.5 block">Nombre / Alias *</label>
              <input value={form.nombre || ''} onChange={e => set('nombre', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#0b5156]/50" />
            </div>
            <div>
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-1.5 block">Placa *</label>
              <input value={form.placa || ''} onChange={e => set('placa', e.target.value.toUpperCase())} placeholder="ABC-123"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#0b5156]/50 uppercase" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-1.5 block">Marca</label>
              <input value={form.marca || ''} onChange={e => set('marca', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#0b5156]/50" />
            </div>
            <div>
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-1.5 block">Modelo</label>
              <input value={form.modelo || ''} onChange={e => set('modelo', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#0b5156]/50" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-1.5 block">Año</label>
              <input type="number" value={form.anio || ''} onChange={e => set('anio', +e.target.value)} min={1990} max={2030}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#0b5156]/50" />
            </div>
            <div>
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-1.5 block">Color</label>
              <input value={form.color || ''} onChange={e => set('color', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#0b5156]/50" />
            </div>
            <div>
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-1.5 block">Ton. (kg)</label>
              <input type="number" value={form.capacidad_kg || ''} onChange={e => set('capacidad_kg', +e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#0b5156]/50" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-1.5 block">KM actuales</label>
              <input type="number" value={form.km_actuales || 0} onChange={e => set('km_actuales', +e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#0b5156]/50" />
            </div>
            <div>
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-1.5 block">KM próx. servicio</label>
              <input type="number" value={form.proximo_servicio_km || ''} onChange={e => set('proximo_servicio_km', +e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#0b5156]/50" />
            </div>
          </div>
          {isEdit && (
            <div>
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-2 block">Estado</label>
              <div className="grid grid-cols-2 gap-2">
                {ESTADOS.map(e => (
                  <button key={e} onClick={() => set('estado', e)}
                    className={`py-2 rounded-xl border text-xs font-black uppercase tracking-wider transition-all ${form.estado === e ? `${ESTADO_STYLE[e].bg} ${ESTADO_STYLE[e].border} ${ESTADO_STYLE[e].text}` : 'border-slate-200 text-slate-400 hover:border-slate-400'}`}>
                    {e.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <button onClick={handleSave} disabled={loading}
          className="mt-5 w-full bg-[#0b5156] hover:bg-[#083a3d] disabled:opacity-40 text-white font-black text-xs uppercase tracking-widest py-4 rounded-2xl flex items-center justify-center gap-2 transition-all">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {loading ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Registrar Vehículo'}
        </button>
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
const FleetVehicles = () => {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [modalData, setModalData] = useState<Partial<Vehiculo> | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchVehiculos = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.get<Vehiculo[]>('/api/logistica/vehiculos');
      setVehiculos(data || []);
    } catch { setToast({ message: 'Error cargando vehículos', type: 'error' }); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchVehiculos(); }, [fetchVehiculos]);

  const handleDelete = async (id: number, nombre: string) => {
    if (!confirm(`¿Desactivar el vehículo "${nombre}"?`)) return;
    try {
      await api.delete(`/api/logistica/vehiculos/${id}`);
      setToast({ message: 'Vehículo desactivado', type: 'success' });
      fetchVehiculos();
    } catch { setToast({ message: 'Error desactivando vehículo', type: 'error' }); }
  };

  const filtered = filtroEstado ? vehiculos.filter(v => v.estado === filtroEstado) : vehiculos;
  const stats = ESTADOS.reduce((acc, e) => ({ ...acc, [e]: vehiculos.filter(v => v.estado === e).length }), {} as Record<string, number>);

  return (
    <div className="min-h-screen bg-[#F4F6F8] text-slate-800 pb-24 animate-in fade-in duration-300">
      <style>{`@keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>

      {/* Header */}
      <header className="bg-white p-8 rounded-3xl border border-[#bdafa1]/20 shadow-sm relative overflow-hidden mb-6">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <Truck size={120} className="text-[#0b5156]" />
        </div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">Flota</span>
            </div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Maestro de Vehículos</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-tight">{vehiculos.length} unidades registradas en el sistema.</p>
          </div>
          <button onClick={fetchVehiculos} className="bg-slate-50 text-slate-600 p-2.5 rounded-xl border border-slate-200 hover:bg-white transition-all shadow-sm">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Filtros */}
      <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar pb-0.5 px-1">
        <button onClick={() => setFiltroEstado('')} className={`shrink-0 text-[10px] px-4 py-2 rounded-full border font-black uppercase tracking-widest transition-all ${!filtroEstado ? 'bg-[#0b5156] border-[#0b5156] text-white' : 'border-slate-200 text-slate-500 bg-white hover:border-slate-400'}`}>
          Todos ({vehiculos.length})
        </button>
        {ESTADOS.map(e => (
          <button key={e} onClick={() => setFiltroEstado(filtroEstado === e ? '' : e)}
            className={`shrink-0 text-[10px] px-4 py-2 rounded-full border font-black uppercase tracking-widest transition-all ${filtroEstado === e ? `${ESTADO_STYLE[e].bg} ${ESTADO_STYLE[e].border} ${ESTADO_STYLE[e].text}` : 'border-slate-200 text-slate-500 bg-white hover:border-slate-400'}`}>
            {e.replace('_', ' ')} ({stats[e] || 0})
          </button>
        ))}
      </div>

      <div className="max-w-7xl mx-auto px-4">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-white rounded-2xl animate-pulse border border-slate-100" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-black uppercase">Sin vehículos registrados</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(v => {
              const style = ESTADO_STYLE[v.estado] || ESTADO_STYLE.INACTIVO;
              const kmAlert = v.proximo_servicio_km && v.km_actuales >= v.proximo_servicio_km * 0.95;
              return (
                <div key={v.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3">
                    <div className="text-3xl shrink-0">{VEHICLE_ICONS[v.tipo] || '🚛'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-slate-800 font-black text-sm truncate uppercase">{v.placa}</span>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${style.bg} ${style.text} border ${style.border}`}>{v.estado.replace('_', ' ')}</span>
                      </div>
                      <div className="text-slate-500 text-xs font-semibold mb-1">{v.nombre}{v.marca ? ` · ${v.marca}` : ''}{v.modelo ? ` ${v.modelo}` : ''}{v.anio ? ` (${v.anio})` : ''}</div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 font-semibold">
                        <span>🔑 {v.km_actuales.toLocaleString()} km</span>
                        {v.capacidad_kg && <span>📦 {v.capacidad_kg} kg</span>}
                        {v.proximo_servicio_km && (
                          <span className={kmAlert ? 'text-amber-600 font-black' : ''}>
                            {kmAlert && <AlertTriangle className="w-3 h-3 inline mr-0.5" />}
                            Serv: {v.proximo_servicio_km.toLocaleString()} km
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button onClick={() => setModalData(v)} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                        <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                      <button onClick={() => handleDelete(v.id, v.nombre)} className="w-8 h-8 rounded-xl bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors">
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </div>
                  </div>
                  {v.ultimo_servicio && (
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold">
                      <CheckCircle2 className="w-3 h-3" />
                      Último servicio: {new Date(v.ultimo_servicio).toLocaleDateString('es-VE')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button onClick={() => setModalData({ ...EMPTY })}
        className="fixed bottom-6 right-5 z-40 bg-[#0b5156] hover:bg-[#083a3d] text-white rounded-2xl px-5 py-4 shadow-2xl shadow-[#0b5156]/40 flex items-center gap-2.5 transition-all hover:scale-105 active:scale-95 font-black text-xs uppercase tracking-widest">
        <Plus className="w-5 h-5" /> Nuevo Vehículo
      </button>

      {modalData && (
        <VehicleModal vehiculo={modalData} onClose={() => setModalData(null)} onSaved={fetchVehiculos} />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

export default FleetVehicles;
