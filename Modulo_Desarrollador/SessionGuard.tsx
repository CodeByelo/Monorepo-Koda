import React, { useEffect, useState } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { useSystem } from '@/providers/SystemProvider';
import { AlertTriangle, Lock, ShieldAlert } from 'lucide-react';

export const SessionGuard: React.FC = () => {
  const { token, logout, isAuthenticated } = useAuth();
  const { activeSystem } = useSystem();
  const [errorModal, setErrorModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    icon: 'duplicate' | 'license' | 'kick';
  } | null>(null);

  useEffect(() => {
    // Only connect if the user is authenticated and is actively inside a module
    if (!isAuthenticated || !token || activeSystem === 'all') {
      return;
    }

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host;
    
    // Extract browser and OS to display nice stats in the Dev Dashboard
    const ua = navigator.userAgent;
    let deviceName = "Navegador";
    if (ua.includes("Firefox")) deviceName = "Firefox";
    else if (ua.includes("Chrome")) deviceName = "Chrome";
    else if (ua.includes("Safari")) deviceName = "Safari";
    else if (ua.includes("Edge")) deviceName = "Edge";
    
    if (ua.includes("Windows")) deviceName += " (Windows)";
    else if (ua.includes("Macintosh")) deviceName += " (macOS)";
    else if (ua.includes("Linux")) deviceName += " (Linux)";

    const wsUrl = `${wsProto}//${wsHost}/api/session/connect?token=${encodeURIComponent(token)}&modulo=${encodeURIComponent(activeSystem)}&device=${encodeURIComponent(deviceName)}`;
    
    let ws: WebSocket;
    let reconnectTimeout: any;

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
            
            // Clean up credentials and force redirect to login
            setTimeout(() => {
              logout();
              window.location.href = '/login';
            }, 4000);
          }
        } catch (err) {
          console.error("Error parsing websocket message", err);
        }
      };

      ws.onclose = (event) => {
        // Enforce the same action if server closes with specific codes
        if (event.code === 4001) {
          setErrorModal({
            show: true,
            title: 'Sesión Duplicada',
            message: `Esta herramienta (${activeSystem.toUpperCase()}) se ha abierto en otra pestaña, navegador o dirección IP. La sesión más antigua se cerró automáticamente.`,
            icon: 'duplicate',
          });
          setTimeout(() => {
            logout();
            window.location.href = '/login';
          }, 4000);
        } else if (event.code === 4002) {
          setErrorModal({
            show: true,
            title: 'Límite de Licencias Excedido',
            message: 'Su empresa ha alcanzado el límite permitido de usuarios concurrentes de su licencia.',
            icon: 'license',
          });
          setTimeout(() => {
            logout();
            window.location.href = '/login';
          }, 4000);
        } else if (event.code === 4003) {
          setErrorModal({
            show: true,
            title: 'Sesión Cerrada por Admin',
            message: 'Un desarrollador/administrador ha desconectado su sesión manualmente y bloqueado el acceso temporalmente.',
            icon: 'kick',
          });
          setTimeout(() => {
            logout();
            window.location.href = '/login';
          }, 4000);
        } else if (event.code !== 1000 && event.code !== 1005) {
          // Reconnect on accidental dropouts
          reconnectTimeout = setTimeout(() => {
            connect();
          }, 3000);
        }
      };

      ws.onerror = (err) => {
        console.error("Websocket connection error", err);
      };
    };

    connect();

    // Ping the backend every 30 seconds to keep connection alive through reverse proxies
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
  }, [token, isAuthenticated, activeSystem]);

  if (!errorModal || !errorModal.show) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-slate-955/90 backdrop-blur-md z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-8 shadow-2xl text-center space-y-6 animate-in zoom-in-95 duration-300">
        <div className="flex justify-center">
          <div className={`p-4 rounded-full ${
            errorModal.icon === 'license' 
              ? 'bg-amber-100 text-amber-600' 
              : errorModal.icon === 'kick' 
              ? 'bg-red-100 text-red-600' 
              : 'bg-rose-100 text-rose-600'
          } shadow-inner`}>
            {errorModal.icon === 'license' && <Lock size={40} />}
            {errorModal.icon === 'kick' && <ShieldAlert size={40} />}
            {errorModal.icon === 'duplicate' && <AlertTriangle size={40} />}
          </div>
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight leading-none">
            {errorModal.title}
          </h2>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">
            Control de Concurrencia KODA ERP
          </p>
        </div>

        <p className="text-sm font-semibold text-slate-600 leading-relaxed bg-slate-50 p-5 rounded-2xl border border-slate-100">
          {errorModal.message}
        </p>

        <div className="pt-2">
          <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest animate-pulse">
            Redireccionando a la pantalla de ingreso...
          </p>
        </div>
      </div>
    </div>
  );
};
