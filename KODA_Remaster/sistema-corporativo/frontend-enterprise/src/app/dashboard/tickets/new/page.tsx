'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Save } from 'lucide-react';
import { createTicket, getTickets, updateTicket } from '../../../../lib/api';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useAuth } from '../../../../hooks/useAuth';
import { uiAlert } from '../../../../lib/ui-dialog';

const TECH_DEPT = 'Gerencia Nacional de Tecnologías de la Información y la Comunicación';

export default function NewTicketPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [darkMode, setDarkMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingTicket, setLoadingTicket] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'ALTA' | 'MEDIA' | 'BAJA'>('MEDIA');
  const [observations, setObservations] = useState('');
  const [editingTicketId, setEditingTicketId] = useState<number | null>(null);
  const isEditing = editingTicketId !== null;
  const isTechUser = useMemo(() => {
    return String(user?.gerencia_depto || '').toLowerCase().includes('tecnolog');
  }, [user?.gerencia_depto]);

  const effectivePriority = useMemo(() => {
    if (!isTechUser) return 'MEDIA';
    return priority;
  }, [priority, isTechUser]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedTheme = localStorage.getItem('dashboard_theme_2026');
      setDarkMode(storedTheme !== 'light');
    } catch (error) {
      console.error('No se pudo leer el tema del dashboard:', error);
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const ticketIdParam = new URLSearchParams(window.location.search).get('ticketId');
    const parsed = ticketIdParam ? Number(ticketIdParam) : NaN;
    setEditingTicketId(Number.isFinite(parsed) ? parsed : null);
  }, []);

  React.useEffect(() => {
    if (!isEditing || editingTicketId === null) return;
    let cancelled = false;

    const loadTicket = async () => {
      setLoadingTicket(true);
      try {
        const rows = await getTickets();
        const ticket = (rows || []).find((t: any) => Number(t.id) === editingTicketId);

        if (!ticket) {
          void uiAlert('No se encontró el ticket a editar.', 'Tickets');
          router.push('/dashboard?tab=tickets');
          return;
        }

        if (cancelled) return;

        setTitle(String(ticket.titulo || ''));
        setDescription(String(ticket.descripcion || ''));
        const p = String(ticket.prioridad || 'media').toUpperCase();
        setPriority(p === 'ALTA' || p === 'BAJA' || p === 'MEDIA' ? p : 'MEDIA');
        setObservations(String(ticket.observaciones || ''));
      } catch (error) {
        console.error('Error cargando ticket:', error);
        void uiAlert('No se pudo cargar el ticket.', 'Error');
      } finally {
        if (!cancelled) setLoadingTicket(false);
      }
    };

    void loadTicket();

    return () => {
      cancelled = true;
    };
  }, [editingTicketId, isEditing, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !description.trim()) {
      void uiAlert('Título y descripción son obligatorios.', 'Campos Requeridos');
      return;
    }

    setLoading(true);
    try {
      if (isEditing) {
        if (editingTicketId === null) throw new Error('Ticket inválido');
        await updateTicket(editingTicketId, {
          titulo: title.trim(),
          descripcion: description.trim(),
          ...(isTechUser ? { prioridad: effectivePriority.toLowerCase() } : {}),
          ...(isTechUser ? { observaciones: observations.trim() } : {}),
        });
        await uiAlert('Ticket actualizado correctamente.', 'Éxito');
      } else {
        await createTicket({
          titulo: title.trim(),
          descripcion: description.trim(),
          prioridad: effectivePriority.toLowerCase(),
          ...(isTechUser ? { observaciones: observations.trim() } : {}),
        });
        await uiAlert('Ticket creado correctamente.', 'Éxito');
      }

      router.push('/dashboard?tab=tickets');
    } catch (error) {
      console.error('Error guardando ticket:', error);
      void uiAlert('No se pudo guardar el ticket.', 'Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <RoleGuard allowedRoles={['CEO', 'Administrador', 'Usuario', 'Desarrollador', 'Gerente']} redirectTo="/login">
      <div className={`min-h-screen p-6 md:p-10 ${darkMode ? 'bg-zinc-950 text-zinc-100' : 'bg-slate-50 text-slate-900'}`}>
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push('/dashboard?tab=tickets')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border ${darkMode ? 'border-zinc-700 hover:bg-zinc-800' : 'border-slate-300 hover:bg-slate-100'}`}
            >
              <ArrowLeft size={16} />
              Volver
            </button>
            <h1 className="text-2xl font-bold inline-flex items-center gap-2">
              <Plus size={20} />
              {isEditing ? 'Editar Ticket' : 'Nuevo Ticket'}
            </h1>
          </div>

          <form onSubmit={submit} className={`rounded-2xl border p-5 md:p-7 space-y-5 ${darkMode ? 'border-zinc-800 bg-zinc-900' : 'border-slate-200 bg-white'}`}>
            {loadingTicket && (
              <div className={`text-sm ${darkMode ? 'text-zinc-300' : 'text-slate-600'}`}>Cargando ticket...</div>
            )}

            <div>
              <label className="block mb-1 text-sm font-semibold">Título de la Solicitud</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isEditing}
                className={`w-full px-3 py-2 rounded-lg border ${darkMode ? 'bg-zinc-950 border-zinc-700 text-zinc-100' : 'bg-slate-50 border-slate-300 text-slate-900'}`}
              />
            </div>

            <div>
              <label className="block mb-1 text-sm font-semibold">Descripción Detallada</label>
              <textarea
                required
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isEditing}
                className={`w-full px-3 py-2 rounded-lg border ${darkMode ? 'bg-zinc-950 border-zinc-700 text-zinc-100' : 'bg-slate-50 border-slate-300 text-slate-900'}`}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block mb-1 text-sm font-semibold">Área Destino</label>
                <input
                  value={TECH_DEPT}
                  disabled
                  className={`w-full px-3 py-2 rounded-lg border opacity-80 ${darkMode ? 'bg-zinc-950 border-zinc-700 text-zinc-100' : 'bg-slate-50 border-slate-300 text-slate-900'}`}
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-semibold">Prioridad</label>
                <select
                  value={effectivePriority}
                  onChange={(e) => setPriority(e.target.value as 'ALTA' | 'MEDIA' | 'BAJA')}
                  disabled={!isTechUser}
                  className={`w-full px-3 py-2 rounded-lg border ${darkMode ? 'bg-zinc-950 border-zinc-700 text-zinc-100' : 'bg-slate-50 border-slate-300 text-slate-900'}`}
                >
                  <option value="ALTA">Alta</option>
                  <option value="MEDIA">Media</option>
                  <option value="BAJA">Baja</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block mb-1 text-sm font-semibold">Observaciones (Soporte Técnico)</label>
              <textarea
                rows={4}
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                disabled={!isTechUser}
                className={`w-full px-3 py-2 rounded-lg border ${darkMode ? 'bg-zinc-950 border-zinc-700 text-zinc-100' : 'bg-slate-50 border-slate-300 text-slate-900'}`}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => router.push('/dashboard?tab=tickets')}
                className={`px-5 py-2 rounded-lg border ${darkMode ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || loadingTicket}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-red-700 hover:bg-red-800 font-semibold disabled:opacity-60 text-white"
              >
                {loading ? (
                  'Guardando...'
                ) : (
                  <>
                    <Save size={16} /> {isEditing ? 'Guardar Cambios' : 'Crear Ticket'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </RoleGuard>
  );
}
