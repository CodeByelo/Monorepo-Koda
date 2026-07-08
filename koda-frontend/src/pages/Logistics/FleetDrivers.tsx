import { useState, useEffect, useCallback } from 'react';
import { Plus, User, Edit2, Trash2, AlertTriangle, Send, RefreshCw, X, Save } from 'lucide-react';
import { api } from '@/api/client';
import { Toast } from '@/components/common/Toast';

interface Chofer {
  id: number; nombre: string; cedula?: string; telefono?: string;
  telegram_chat_id?: string; tiene_telegram: boolean;
  licencia_tipo?: string; licencia_vence?: string; licencia_alerta?: boolean;
  estado: string;
}

const ESTADOS_CHOFER = ['DISPONIBLE', 'EN_RUTA', 'DE_REPOSO', 'INACTIVO'];
const ESTADO_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  DISPONIBLE: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  EN_RUTA:    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200' },
  DE_REPOSO:  { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200' },
  INACTIVO:   { bg: 'bg-slate-50',   text: 'text-slate-400',   border: 'border-slate-200' },
};

const EMPTY: Partial<Chofer> = { estado: 'DISPONIBLE' };

function ChoferModal({ chofer, onClose, onSaved }: { chofer: Partial<Chofer>; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<Chofer>>(chofer);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isEdit = !!chofer.id;

  const set = (key: keyof Chofer, val: any) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.nombre?.trim()) { setError('El nombre es requerido.'); return; }
    setLoading(true); setError('');
    try {
      if (isEdit) await api.put(`/api/logistica/choferes/${chofer.id}`, form);
      else await api.post('/api/logistica/choferes', form);
      onSaved(); onClose();
    } catch (e: any) {
      setError(e.message || 'Error guardando chofer.');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 md:pt-20 overflow-y-auto pb-20 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-white rounded-3xl border border-slate-200 p-6 md:p-10 w-full max-w-xl mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'slideUp 0.35s cubic-bezier(0.34,1.56,0.64,1)' }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-slate-800 font-black text-lg uppercase tracking-tight">{isEdit ? 'Editar Chofer' : 'Nuevo Chofer'}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {error && <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm font-semibold">{error}</div>}

        {/* Avatar preview */}
        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 rounded-2xl bg-[#0b5156] flex items-center justify-center">
            <span className="text-white font-black text-2xl">{form.nombre?.charAt(0) || '?'}</span>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-1.5 block">Nombre Completo *</label>
            <input value={form.nombre || ''} onChange={e => set('nombre', e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#0b5156]/50" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-1.5 block">Cédula</label>
              <input value={form.cedula || ''} onChange={e => set('cedula', e.target.value)} placeholder="V-12345678"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#0b5156]/50 placeholder-slate-300" />
            </div>
            <div>
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-1.5 block">Teléfono</label>
              <input value={form.telefono || ''} onChange={e => set('telefono', e.target.value)} placeholder="0414-..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#0b5156]/50 placeholder-slate-300" />
            </div>
          </div>
          <div>
            <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-1.5 block flex items-center gap-2">
              <Send className="w-3 h-3" /> Telegram Chat ID
            </label>
            <input value={form.telegram_chat_id || ''} onChange={e => set('telegram_chat_id', e.target.value)} placeholder="ej: 123456789"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-mono font-semibold focus:outline-none focus:border-[#0b5156]/50 placeholder-slate-300" />
            <p className="text-slate-400 text-[10px] font-bold mt-1 uppercase">El chofer debe enviarte /start al bot para obtener su chat ID.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-1.5 block">Tipo Licencia</label>
              <input value={form.licencia_tipo || ''} onChange={e => set('licencia_tipo', e.target.value)} placeholder="3, 4, 5, A..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#0b5156]/50 placeholder-slate-300" />
            </div>
            <div>
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-1.5 block">Vence</label>
              <input type="date" value={form.licencia_vence || ''} onChange={e => set('licencia_vence', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold focus:outline-none focus:border-[#0b5156]/50" />
            </div>
          </div>
          {isEdit && (
            <div>
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-2 block">Estado</label>
              <div className="grid grid-cols-2 gap-2">
                {ESTADOS_CHOFER.map(e => (
                  <button key={e} onClick={() => set('estado', e)}
                    className={`py-2 rounded-xl border text-xs font-black uppercase tracking-wider transition-all ${form.estado === e ? `${ESTADO_STYLE[e]?.bg} ${ESTADO_STYLE[e]?.text} ${ESTADO_STYLE[e]?.border}` : 'border-slate-200 text-slate-400 hover:border-slate-400'}`}>
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
          {loading ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Registrar Chofer'}
        </button>
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
const FleetDrivers = () => {
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [modalData, setModalData] = useState<Partial<Chofer> | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchChoferes = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.get<Chofer[]>('/api/logistica/choferes');
      setChoferes(data || []);
    } catch { setToast({ message: 'Error cargando choferes', type: 'error' }); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchChoferes(); }, [fetchChoferes]);

  const handleDelete = async (id: number, nombre: string) => {
    if (!confirm(`¿Desactivar al chofer "${nombre}"?`)) return;
    try {
      await api.delete(`/api/logistica/choferes/${id}`);
      setToast({ message: 'Chofer desactivado', type: 'success' });
      fetchChoferes();
    } catch { setToast({ message: 'Error desactivando chofer', type: 'error' }); }
  };

  const filtered = filtroEstado ? choferes.filter(c => c.estado === filtroEstado) : choferes;
  const conTelegram = choferes.filter(c => c.tiene_telegram).length;
  const alertas = choferes.filter(c => c.licencia_alerta).length;

  return (
    <div className="min-h-screen bg-[#F4F6F8] text-slate-800 pb-24 animate-in fade-in duration-300">
      <style>{`@keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>

      {/* Header */}
      <header className="bg-white p-8 rounded-3xl border border-[#bdafa1]/20 shadow-sm relative overflow-hidden mb-6">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <User size={120} className="text-[#0b5156]" />
        </div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-[#0b5156] text-white text-xs font-black px-2 py-0.5 rounded uppercase tracking-widest">Flota</span>
            </div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Directorio de Choferes</h1>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-slate-500 text-sm font-bold uppercase">{choferes.length} registrados</span>
              {conTelegram > 0 && <span className="text-xs text-blue-600 font-black uppercase">📱 {conTelegram} con Telegram</span>}
              {alertas > 0 && <span className="text-xs text-amber-600 font-black uppercase flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{alertas} por vencer</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setModalData({ ...EMPTY })}
              className="bg-[#0b5156] hover:bg-[#083a3d] text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 transition-all tracking-widest shadow-sm">
              <Plus className="w-4.5 h-4.5" />
              Nuevo Chofer
            </button>
            <button onClick={() => setShowManual(true)}
              className="bg-white text-[#0b5156] px-5 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 border border-[#0b5156]/20 hover:bg-[#0b5156]/5 transition-all tracking-widest shadow-sm">
              <Send className="w-3.5 h-3.5" />
              Manual Telegram
            </button>
            <button onClick={fetchChoferes} className="bg-slate-50 text-slate-600 p-2.5 rounded-xl border border-slate-200 hover:bg-white transition-all shadow-sm">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Filtros */}
      <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar pb-0.5 px-1">
        <button onClick={() => setFiltroEstado('')} className={`shrink-0 text-[10px] px-4 py-2 rounded-full border font-black uppercase tracking-widest transition-all ${!filtroEstado ? 'bg-[#0b5156] border-[#0b5156] text-white' : 'border-slate-200 text-slate-500 bg-white hover:border-slate-400'}`}>
          Todos
        </button>
        {ESTADOS_CHOFER.map(e => (
          <button key={e} onClick={() => setFiltroEstado(filtroEstado === e ? '' : e)}
            className={`shrink-0 text-[10px] px-4 py-2 rounded-full border font-black uppercase tracking-widest transition-all ${filtroEstado === e ? `${ESTADO_STYLE[e]?.bg} ${ESTADO_STYLE[e]?.text} ${ESTADO_STYLE[e]?.border}` : 'border-slate-200 text-slate-500 bg-white hover:border-slate-400'}`}>
            {e.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="max-w-7xl mx-auto px-4">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse border border-slate-100" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-black uppercase">Sin choferes registrados</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(c => {
              const style = ESTADO_STYLE[c.estado] || ESTADO_STYLE.INACTIVO;
              return (
                <div key={c.id} className={`bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow ${c.licencia_alerta ? 'border-amber-300' : 'border-slate-200'}`}>
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-2xl bg-[#0b5156] flex items-center justify-center shrink-0">
                      <span className="text-white font-black text-xl">{c.nombre.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-slate-800 font-black text-sm truncate uppercase">{c.nombre}</span>
                        {c.tiene_telegram && <span title="Telegram vinculado" className="text-blue-500 text-xs">📱</span>}
                      </div>
                      <div className="text-slate-500 text-xs font-semibold">{c.cedula || 'Sin cédula'} · {c.telefono || 'Sin tel.'}</div>
                      {c.telegram_chat_id && (
                        <div className="text-blue-600 text-[10px] font-black uppercase tracking-wider mt-1 flex items-center gap-1">
                          <span>Chat ID:</span>
                          <span className="font-mono bg-blue-50/50 px-1.5 py-0.5 rounded border border-blue-100 text-slate-700 font-bold">{c.telegram_chat_id}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${style.bg} ${style.text} border ${style.border}`}>{c.estado.replace('_', ' ')}</span>
                        {c.licencia_tipo && (
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${c.licencia_alerta ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-50 text-slate-400 border border-slate-200'}`}>
                            {c.licencia_alerta && <AlertTriangle className="w-2.5 h-2.5 inline mr-0.5" />}
                            Lic. {c.licencia_tipo}
                            {c.licencia_vence ? ` · ${new Date(c.licencia_vence).toLocaleDateString('es-VE')}` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button onClick={() => setModalData(c)} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                        <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                      <button onClick={() => handleDelete(c.id, c.nombre)} className="w-8 h-8 rounded-xl bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors">
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {showManual && (
        <TelegramManualModal onClose={() => setShowManual(false)} />
      )}

      {modalData && <ChoferModal chofer={modalData} onClose={() => setModalData(null)} onSaved={fetchChoferes} />}
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

export default FleetDrivers;
