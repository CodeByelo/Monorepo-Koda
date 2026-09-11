import React, { useState, useEffect } from 'react';
import { Send, Bell, Power, CheckCircle, Clock, ShieldAlert, Sparkles, RefreshCw } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/providers/AuthProvider';
import { Navigate } from 'react-router-dom';

interface GlobalNotif {
  id: number;
  titulo: string;
  mensaje: string;
  activa: boolean;
  creado_por?: string | null;
  creado_en: string;
}

export const DeveloperNotifications: React.FC = () => {
  const { userRole } = useAuth();
  const isDev =
    userRole?.toLowerCase() === 'desarrollador' ||
    userRole?.toLowerCase() === 'dev' ||
    userRole?.toLowerCase() === 'developer';

  // Si no es desarrollador, redirigir al inicio
  if (!isDev) {
    return <Navigate to="/" replace />;
  }

  const [notificaciones, setNotificaciones] = useState<GlobalNotif[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // Formulario
  const [titulo, setTitulo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [feedback, setFeedback] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);

  const fetchNotificaciones = async () => {
    setLoading(true);
    try {
      const data = await api.get<GlobalNotif[]>('/developer/notificaciones');
      setNotificaciones(data || []);
    } catch (err: any) {
      console.error('Error al obtener notificaciones developer:', err);
      setFeedback({ tipo: 'error', texto: 'No se pudo cargar el historial de notificaciones.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotificaciones();
  }, []);

  const handlePublicar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !mensaje.trim()) {
      setFeedback({ tipo: 'error', texto: 'Por favor completa el título y el mensaje.' });
      return;
    }

    setPublishing(true);
    setFeedback(null);
    try {
      await api.post('/developer/notificaciones', {
        titulo: titulo.trim(),
        mensaje: mensaje.trim(),
        activa: true
      });
      setTitulo('');
      setMensaje('');
      setFeedback({ tipo: 'success', texto: 'Notificación global publicada con éxito para todos los usuarios.' });
      await fetchNotificaciones();
    } catch (err: any) {
      console.error('Error al publicar notificación:', err);
      setFeedback({ tipo: 'error', texto: err?.message || 'Error al publicar la notificación.' });
    } finally {
      setPublishing(false);
    }
  };

  const handleToggleActiva = async (notif: GlobalNotif) => {
    setTogglingId(notif.id);
    try {
      await api.patch(`/developer/notificaciones/${notif.id}`, {
        activa: !notif.activa
      });
      setNotificaciones(prev =>
        prev.map(n => (n.id === notif.id ? { ...n, activa: !n.activa } : n))
      );
    } catch (err: any) {
      console.error('Error al actualizar estado de la notificación:', err);
      alert('Error al cambiar el estado de la notificación');
    } finally {
      setTogglingId(null);
    }
  };

  const formatearFecha = (fechaIso: string) => {
    try {
      const d = new Date(fechaIso);
      return d.toLocaleDateString('es-VE', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return fechaIso;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-16">
      {/* Encabezado */}
      <header className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest inline-flex items-center gap-1">
                <Sparkles size={11} />
                Panel Developer · Omniscience SaaS
              </span>
              <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                Multi-Tenant Global
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">
              Notificaciones Globales del Sistema
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">
              Emite avisos y novedades a todas las cuentas y empresas de la plataforma sin tocar código.
            </p>
          </div>
          <button
            onClick={fetchNotificaciones}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-[#0b5156] shadow-sm transition-all flex items-center gap-2 text-xs font-black uppercase self-start sm:self-auto"
            title="Refrescar lista"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refrescar</span>
          </button>
        </div>
      </header>

      {/* Alerta de Feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between transition-all ${
            feedback.tipo === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          <span>{feedback.texto}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs uppercase font-black opacity-60 hover:opacity-100 ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Formulario de Nueva Notificación */}
      <section className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
          <div className="p-2 rounded-xl bg-[#0b5156]/10 text-[#0b5156]">
            <Send size={18} />
          </div>
          <div>
            <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tight">
              Crear Nueva Notificación Global
            </h2>
            <p className="text-slate-400 text-[11px] font-bold">
              Se mostrará como aviso emergente animado y aparecerá en la campana de todos los usuarios.
            </p>
          </div>
        </div>

        <form onSubmit={handlePublicar} className="space-y-4">
          <div>
            <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1.5">
              Título del Aviso
            </label>
            <input
              type="text"
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder="Ej: Optimización del Motor Contable y Facturación"
              maxLength={150}
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0b5156] focus:ring-1 focus:ring-[#0b5156] transition-all"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-bold mt-1 px-1">
              <span>Máximo 150 caracteres</span>
              <span>{titulo.length}/150</span>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1.5">
              Mensaje Completo
            </label>
            <textarea
              value={mensaje}
              onChange={e => setMensaje(e.target.value)}
              placeholder="Escribe el mensaje claro y conciso que verán los clientes..."
              rows={4}
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0b5156] focus:ring-1 focus:ring-[#0b5156] transition-all resize-y"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={publishing || !titulo.trim() || !mensaje.trim()}
              className="bg-[#0b5156] hover:bg-[#083d41] text-white px-8 py-3.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-[#0b5156]/20 transition-all active:scale-95 disabled:opacity-50"
            >
              <Send size={15} />
              {publishing ? 'Publicando...' : 'Publicar Notificación Global'}
            </button>
          </div>
        </form>
      </section>

      {/* Historial y Control de Notificaciones */}
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-slate-100 text-[#0b5156]">
              <Bell size={18} />
            </div>
            <div>
              <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tight">
                Historial de Notificaciones Emitidas
              </h2>
              <p className="text-slate-400 text-[11px] font-bold">
                Control de estado y visibilidad para toda la plataforma
              </p>
            </div>
          </div>
          <span className="text-xs font-black text-slate-400 uppercase tracking-wider">
            Total: {notificaciones.length}
          </span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs font-bold uppercase tracking-wider">
            Cargando historial...
          </div>
        ) : notificaciones.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs font-bold">
            No se han publicado notificaciones globales todavía.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-[#F4F6F8] text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-6">ID</th>
                  <th className="py-3.5 px-6">Título y Mensaje</th>
                  <th className="py-3.5 px-6">Fecha Emisión</th>
                  <th className="py-3.5 px-6 text-center">Estado</th>
                  <th className="py-3.5 px-6 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {notificaciones.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-4 px-6 font-mono text-slate-400 font-bold">
                      #{item.id}
                    </td>
                    <td className="py-4 px-6 max-w-md">
                      <p className="font-black text-slate-800 uppercase tracking-tight mb-1">
                        {item.titulo}
                      </p>
                      <p className="text-[#576574] text-xs leading-relaxed whitespace-pre-line line-clamp-2">
                        {item.mensaje}
                      </p>
                    </td>
                    <td className="py-4 px-6 text-slate-500 font-medium whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Clock size={12} className="text-slate-400" />
                        {formatearFecha(item.creado_en)}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          item.activa
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {item.activa ? (
                          <>
                            <CheckCircle size={11} />
                            Activa
                          </>
                        ) : (
                          <>
                            <Power size={11} />
                            Inactiva
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleToggleActiva(item)}
                        disabled={togglingId === item.id}
                        className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${
                          item.activa
                            ? 'border-red-200 text-red-600 hover:bg-red-50'
                            : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                        } disabled:opacity-50`}
                      >
                        {togglingId === item.id
                          ? 'Cambiando...'
                          : item.activa
                          ? 'Desactivar'
                          : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default DeveloperNotifications;
