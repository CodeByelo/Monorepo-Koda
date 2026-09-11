import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, Clock } from 'lucide-react';
import { api } from '@/api/client';

export interface SystemNotificationItem {
  id: number;
  titulo: string;
  mensaje: string;
  activa: boolean;
  creado_por?: string | null;
  creado_en: string;
  leida?: boolean;
}

interface SystemNotificationBellProps {
  onNotificationRead?: () => void;
  badgeCount?: number;
  onRefreshPendientes?: () => void;
}

export const SystemNotificationBell: React.FC<SystemNotificationBellProps> = ({
  badgeCount = 0,
  onRefreshPendientes
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [historial, setHistorial] = useState<SystemNotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchHistorial = async () => {
    setLoading(true);
    try {
      const data = await api.get<SystemNotificationItem[]>('/notificaciones-sistema/historial');
      setHistorial(data || []);
    } catch (error) {
      console.error('Error al cargar historial de notificaciones del sistema:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistorial();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMarcarLeida = async (item: SystemNotificationItem) => {
    if (item.leida) return;
    try {
      await api.post(`/notificaciones-sistema/${item.id}/marcar-leida`);
      setHistorial(prev =>
        prev.map(n => (n.id === item.id ? { ...n, leida: true } : n))
      );
      if (onRefreshPendientes) {
        onRefreshPendientes();
      }
    } catch (error) {
      console.error('Error al marcar notificación como leída:', error);
    }
  };

  const formatearFecha = (fechaIso: string) => {
    try {
      const d = new Date(fechaIso);
      return d.toLocaleDateString('es-VE', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return fechaIso;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={`relative p-2 rounded-xl transition-all border flex items-center justify-center ${
          isOpen
            ? 'bg-slate-100 text-[#0B5156] border-slate-300 shadow-inner'
            : 'text-slate-500 hover:text-[#0B5156] hover:bg-slate-100 border-slate-200/80 shadow-sm'
        }`}
        title="Notificaciones Globales del Sistema"
        aria-label="Notificaciones del sistema"
      >
        <Bell size={18} />
        {badgeCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm animate-pulse">
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#0B5156]"></span>
              <h4 className="text-xs font-black text-[#0B5156] uppercase tracking-wider">
                Avisos Globales del Sistema
              </h4>
            </div>
            {badgeCount > 0 && (
              <span className="bg-red-100 text-red-700 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tight">
                {badgeCount} sin leer
              </span>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {loading && historial.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs font-bold uppercase tracking-wider">
                Cargando notificaciones...
              </div>
            ) : historial.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs font-bold">
                No hay notificaciones globales recientes
              </div>
            ) : (
              historial.map(item => (
                <div
                  key={item.id}
                  onClick={() => handleMarcarLeida(item)}
                  className={`p-3.5 transition-colors cursor-pointer flex flex-col gap-1.5 ${
                    item.leida
                      ? 'bg-white hover:bg-slate-50/70'
                      : 'bg-[#F4F6F8] hover:bg-[#ebf0f3] border-l-4 border-[#0B5156]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h5
                      className={`text-xs uppercase tracking-tight ${
                        item.leida
                          ? 'font-bold text-slate-700'
                          : 'font-black text-[#0B5156]'
                      }`}
                    >
                      {item.titulo}
                    </h5>
                    {item.leida ? (
                      <span className="text-[10px] text-slate-400 flex items-center gap-0.5 shrink-0">
                        <Check size={11} className="text-slate-400" />
                        Leída
                      </span>
                    ) : (
                      <span className="bg-[#0B5156] text-white text-[9px] font-black px-1.5 py-0.2 rounded shrink-0 uppercase">
                        Nueva
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#576574] leading-relaxed whitespace-pre-line line-clamp-3">
                    {item.mensaje}
                  </p>
                  <div className="flex items-center gap-1 text-[9px] text-slate-400 font-bold mt-0.5">
                    <Clock size={10} />
                    <span>{formatearFecha(item.creado_en)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemNotificationBell;
