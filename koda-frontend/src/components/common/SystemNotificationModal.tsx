import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BellRing, Check, Sparkles } from 'lucide-react';
import { api } from '@/api/client';
import { SystemNotificationItem } from './SystemNotificationBell';

interface SystemNotificationModalProps {
  notifications: SystemNotificationItem[];
  onNotificationDismissed: (id: number) => void;
}

export const SystemNotificationModal: React.FC<SystemNotificationModalProps> = ({
  notifications,
  onNotificationDismissed,
}) => {
  // Manejamos la cola localmente con índice o tomando el primer elemento
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  // La notificación actual que se está mostrando
  const currentNotif = notifications[currentIndex];

  useEffect(() => {
    if (currentNotif) {
      // Pequeño timeout para activar la animación de entrada suave CSS
      const timer = setTimeout(() => {
        setIsVisible(true);
        setIsDismissing(false);
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [currentNotif]);

  // Si no hay notificación para mostrar, no renderizamos nada
  if (!currentNotif || typeof document === 'undefined') {
    return null;
  }

  const handleEntendido = async () => {
    if (isDismissing) return;
    setIsDismissing(true);
    setIsVisible(false);

    try {
      // Marcar como leída en el backend (idempotente)
      await api.post(`/notificaciones-sistema/${currentNotif.id}/marcar-leida`);
    } catch (err) {
      console.error('Error al marcar notificación global como leída:', err);
    }

    // Esperar a que concluya la animación CSS (350ms) antes de avanzar la cola
    setTimeout(() => {
      onNotificationDismissed(currentNotif.id);
      // Avanzar al siguiente si la lista aún tiene elementos
      if (currentIndex < notifications.length - 1) {
        setCurrentIndex(prev => prev + 1);
      }
      setIsDismissing(false);
    }, 350);
  };

  const totalPendientes = notifications.length;
  const pendientesRestantes = totalPendientes - currentIndex;

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-[2px] system-notif-backdrop ${
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="global-notification-title"
        className={`bg-white border border-[#E2E8F0] max-w-lg w-full rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 system-notif-modal ${
          isVisible ? 'system-notif-enter' : 'system-notif-leave'
        }`}
      >
        {/* Header con ícono y badge */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#0B5156]/10 border border-[#0B5156]/20 text-[#0B5156] flex items-center justify-center shadow-sm">
              <BellRing size={24} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="bg-[#0B5156]/10 text-[#0B5156] text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider inline-flex items-center gap-1">
                  <Sparkles size={10} />
                  Aviso Global del Sistema
                </span>
                {totalPendientes > 1 && (
                  <span className="bg-slate-100 text-[#576574] text-[9px] font-bold px-2 py-0.5 rounded-full uppercase">
                    {currentIndex + 1} de {totalPendientes}
                  </span>
                )}
              </div>
              <h2
                id="global-notification-title"
                className="text-lg sm:text-xl font-black text-[#0B5156] uppercase tracking-tight mt-1"
              >
                {currentNotif.titulo}
              </h2>
            </div>
          </div>
        </div>

        {/* Cuerpo del Mensaje */}
        <div className="bg-[#F4F6F8] border border-[#E2E8F0] rounded-2xl p-4 sm:p-5 mb-6 text-left">
          <p className="text-sm font-medium text-[#576574] leading-relaxed whitespace-pre-line">
            {currentNotif.mensaje}
          </p>
        </div>

        {/* Footer con botón de acción */}
        <div className="flex items-center justify-between gap-3 pt-2">
          {pendientesRestantes > 1 ? (
            <p className="text-[11px] font-bold text-slate-400">
              +{pendientesRestantes - 1} aviso{pendientesRestantes - 1 > 1 ? 's' : ''} más en cola
            </p>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={handleEntendido}
            disabled={isDismissing}
            className="w-full sm:w-auto min-w-[140px] bg-[#0B5156] hover:bg-[#083d41] text-white font-black py-3 px-6 rounded-xl uppercase text-xs tracking-wider transition-all shadow-md shadow-[#0B5156]/20 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
          >
            <Check size={16} />
            Entendido
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SystemNotificationModal;
