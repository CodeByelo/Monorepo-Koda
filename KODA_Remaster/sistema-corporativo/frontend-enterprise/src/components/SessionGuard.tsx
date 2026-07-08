'use client';

import React, { useEffect, useState } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { AlertTriangle, Lock, ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';

export const SessionGuard: React.FC = () => {
  const { isAuthenticated, isLoading, user, logout } = useAuthContext();
  const router = useRouter();
  const [errorModal, setErrorModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    icon: 'duplicate' | 'license' | 'kick';
  } | null>(null);

  useEffect(() => {
    // Si terminó de cargar y no está autenticado, mostramos el guard de bloqueo
    if (isLoading || !isAuthenticated) {
      return;
    }

    // Omitir conexión websocket si es Desarrollador (manejado en backend también)
    if (user?.role === 'Desarrollador') {
      return;
    }

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host;
    
    // Asumiremos que el módulo por defecto es "Gestor de Documentos" para Remaster
    const activeSystem = 'Gestor de Documentos';
    
    const ua = typeof window !== 'undefined' ? navigator.userAgent : '';
    let deviceName = "Navegador";
    if (ua.includes("Firefox")) deviceName = "Firefox";
    else if (ua.includes("Chrome")) deviceName = "Chrome";
    else if (ua.includes("Safari")) deviceName = "Safari";
    else if (ua.includes("Edge")) deviceName = "Edge";
    
    if (ua.includes("Windows")) deviceName += " (Windows)";
    else if (ua.includes("Macintosh")) deviceName += " (macOS)";
    else if (ua.includes("Linux")) deviceName += " (Linux)";

    const resolvedApiUrl = typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname}:8000`
      : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');
    const backendWsUrl = resolvedApiUrl.replace('http', 'ws');
    const sgdToken = typeof window !== 'undefined' ? localStorage.getItem('sgd_token') || '' : '';
    const wsUrl = `${backendWsUrl}/api/session/connect?token=${encodeURIComponent(sgdToken)}&modulo=${encodeURIComponent(activeSystem)}&device=${encodeURIComponent(deviceName)}`;
    
    let ws: WebSocket;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'force_close') {
            const reason = data.reason;
            let icon: 'duplicate' | 'license' | 'kick' = 'duplicate';
            let title = 'Sesión Finalizada';
            if (reason === 'license_limit_exceeded') {
              icon = 'license';
              title = 'Límite de Licencias Excedido';
            } else if (reason === 'manual_disconnect') {
              icon = 'kick';
              title = 'Desconectado por el Administrador';
            }

            setErrorModal({
              show: true,
              title,
              message: data.message || "Su sesión ha sido terminada.",
              icon,
            });
            
            setTimeout(() => {
              logout();
              router.push('/login');
            }, 4000);
          }
        } catch (err) {
          console.error("Error parsing websocket message", err);
        }
      };

      ws.onclose = (event) => {
        if (event.code === 4001) {
          setErrorModal({
            show: true,
            title: 'Sesión Duplicada',
            message: `Esta herramienta (${activeSystem.toUpperCase()}) se ha abierto en otra pestaña. La sesión más antigua se cerró automáticamente.`,
            icon: 'duplicate',
          });
          setTimeout(() => {
            logout();
            router.push('/login');
          }, 4000);
        } else if (event.code === 4002) {
          setErrorModal({
            show: true,
            title: 'Límite de Licencias Excedido',
            message: 'Su empresa ha alcanzado el límite permitido de usuarios.',
            icon: 'license',
          });
          setTimeout(() => {
            logout();
            router.push('/login');
          }, 4000);
        } else if (event.code === 4003) {
          setErrorModal({
            show: true,
            title: 'Sesión Cerrada',
            message: 'Un desarrollador ha desconectado su sesión manualmente.',
            icon: 'kick',
          });
          setTimeout(() => {
            logout();
            router.push('/login');
          }, 4000);
        } else if (event.code !== 1000 && event.code !== 1005) {
          reconnectTimeout = setTimeout(() => {
            connect();
          }, 3000);
        }
      };
    };

    connect();

    const pingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send("ping");
      }
    }, 30000);

    return () => {
      clearInterval(pingInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.close();
      }
    };
  }, [isAuthenticated, user, logout, router]);

  if (!errorModal || !errorModal.show) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-8 shadow-[0_0_50px_-12px_rgba(16,185,129,0.15)] text-center space-y-6 animate-in zoom-in-95 duration-300">
        <div className="flex justify-center">
          <div className={`p-4 rounded-full ${
            errorModal.icon === 'license' 
              ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
              : errorModal.icon === 'kick' 
              ? 'bg-red-500/10 text-red-500 border border-red-500/20' 
              : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
          } shadow-inner`}>
            {errorModal.icon === 'license' && <Lock size={40} />}
            {errorModal.icon === 'kick' && <ShieldAlert size={40} />}
            {errorModal.icon === 'duplicate' && <AlertTriangle size={40} />}
          </div>
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-slate-100 uppercase tracking-tight leading-none">
            {errorModal.title}
          </h2>
          <p className="text-emerald-500/80 font-bold text-[10px] uppercase tracking-widest">
            Control de Concurrencia KODA
          </p>
        </div>

        <p className="text-sm font-semibold text-slate-400 leading-relaxed bg-slate-950/50 p-5 rounded-2xl border border-slate-800/50">
          {errorModal.message}
        </p>

        <div className="pt-2">
          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest animate-pulse">
            Redireccionando a la pantalla de ingreso...
          </p>
        </div>
      </div>
    </div>
  );
};
