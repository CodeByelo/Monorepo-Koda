import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '@/api/client';

// ─────────────────────────────────────────────────────────────────────────────
// Atajo de login para desarrollo local (SOLO DEV)
// Nunca activo por defecto ni en un build de producción: requiere que el
// desarrollador defina explícitamente VITE_ENABLE_DEV_LOGIN=true en su
// .env.local. Construye un token con forma de JWT (header.payload.firma) para
// que la lógica de decodificación de abajo funcione igual que con uno real,
// pero la "firma" es un valor local arbitrario, no derivado de ningún secreto
// real — por lo tanto no autenticará contra un backend real. Los datos del
// usuario son claramente ficticios (no pertenecen a ninguna persona real).
// ─────────────────────────────────────────────────────────────────────────────
function buildDevMockToken(): string {
  const base64 = (obj: Record<string, unknown>) => btoa(JSON.stringify(obj));
  const header = { alg: 'none', typ: 'JWT' };
  const payload = {
    sub: 'dev-local-0000-0000-0000-000000000000',
    username: 'dev.local',
    email: 'dev@example.test',
    role: 'Desarrollador',
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
  };
  return `${base64(header)}.${base64(payload)}.dev-local-unsigned`;
}

interface AuthContextType {
  token: string | null;
  userRole: string | null;
  userName: string | null;
  userEmail: string | null;
  userId: string | null;
  tenantId: string | null;
  tenantName: string | null;
  licenseError: string | null;
  checkLicense: () => Promise<boolean>;
  setLicenseError: (error: string | null) => void;
  login: (token: string, userData?: any) => void;
  logout: () => void;
  isAuthenticated: boolean;
  // true mientras la sesión aún se está "hidratando": el token ya está en
  // localStorage (o llegó un ?exchange_code=... por resolver) pero los datos
  // derivados (rol, tenant, etc.) todavía no se han decodificado/aplicado.
  // Los guards de ruta deben mostrar un loader mientras esto sea true, en vez
  // de renderizar con userRole/tenantId en null.
  isAuthLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      // 1. Verificar si existe token previo en localStorage
      const kodaToken = localStorage.getItem('koda_token');
      const sgdToken = localStorage.getItem('sgd_token');
      if (kodaToken || sgdToken) {
        return kodaToken || sgdToken;
      }

      // 2. Atajo de login para desarrollo local — solo si se activó explícitamente
      const env = (import.meta as any).env;
      if (env && env.DEV && env.VITE_ENABLE_DEV_LOGIN === 'true') {
        const devToken = buildDevMockToken();
        localStorage.setItem('koda_token', devToken);
        localStorage.setItem('sgd_token', devToken);
        return devToken;
      }
    }
    return null;
  });

  // Hidratación de la sesión: dos fuentes async que deben resolver antes de
  // considerar la sesión "lista" (ver isAuthLoading más abajo).
  // 1. tokenDecoded: el efecto que decodifica el JWT (rol/tenant/etc.) ya corrió.
  //    Si no había token al montar, no hay nada que decodificar -> ya está listo.
  const [tokenDecoded, setTokenDecoded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const hasToken = !!(localStorage.getItem('koda_token') || localStorage.getItem('sgd_token'));
    return !hasToken;
  });
  // 2. exchangeResolved: si llegó un ?exchange_code=... en la URL, ya se
  //    resolvió (éxito o falla). Si no había código, no hay nada que esperar.
  const [exchangeResolved, setExchangeResolved] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return !new URLSearchParams(window.location.search).get('exchange_code');
  });

  // Intercambio de código de sesión (?exchange_code=...) al llegar desde otra
  // superficie del monorepo. Reemplaza el antiguo esquema de ?token=... que
  // exponía el JWT completo en la URL (historial del navegador, logs de acceso).
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const exchangeCode = urlParams.get('exchange_code');
    if (!exchangeCode) return;

    // Retirar el parámetro de la URL de inmediato: el código es de un solo uso
    // y nunca debe permanecer en el historial del navegador tras consumirse.
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('exchange_code');
    window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);

    (async () => {
      try {
        const res = await fetch('/api/auth/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ code: exchangeCode }),
        });

        if (!res.ok) {
          // Código inválido/expirado/usado: no reintentar en silencio,
          // dejar al usuario sin sesión iniciada.
          return;
        }

        const data = await res.json();
        if (data && data.access_token) {
          login(data.access_token, data.user);
        }
      } catch (e) {
        console.error('Error al intercambiar el código de sesión', e);
      } finally {
        // Se resuelve el intercambio (éxito o falla): ya no bloquea isAuthLoading.
        setExchangeResolved(true);
      }
    })();
    // Se ejecuta una única vez al montar el provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [licenseError, setLicenseError] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      try {
        // Decodificar el JWT localmente para obtener datos básicos del usuario
        // Esto es seguro porque el token está firmado — no confiamos en él para autenticación,
        // solo para mostrar datos de UI. La autenticación real ocurre server-side con la cookie.
        const payloadBase64 = token.split('.')[1];
        if (payloadBase64) {
          const decoded = JSON.parse(atob(payloadBase64));
          
          // Verificar expiración
          if (decoded.exp && decoded.exp * 1000 < Date.now()) {
            throw new Error("Token expired");
          }
          
          setUserRole(decoded.role || decoded.rol || null);
          setUserName(decoded.username || decoded.name || null);
          setUserEmail(decoded.email || null);
          setUserId(decoded.sub || null);
          setTenantId(decoded.tenant_id || null);
          setTenantName(decoded.tenant_name || null);
        }
      } catch (e) {
        console.error("Invalid token", e);
        setToken(null);
        setUserRole(null);
        setUserName(null);
        setUserEmail(null);
        setUserId(null);
        setTenantId(null);
        setTenantName(null);
        // Limpiar localStorage de tokens legacy
        localStorage.removeItem('koda_token');
        localStorage.removeItem('sgd_token');
      }
    } else {
      setUserRole(null);
      setUserName(null);
      setUserEmail(null);
      setUserId(null);
      setTenantId(null);
      setTenantName(null);
      localStorage.removeItem('koda_token');
      localStorage.removeItem('sgd_token');
    }
    // Este efecto ya corrió al menos una vez: el token (si existía) fue
    // decodificado, o se confirmó que no había ninguno que decodificar.
    setTokenDecoded(true);
  }, [token]);

  const isAuthLoading = !tokenDecoded || !exchangeResolved;

  // Escuchar eventos globales de error de licencia
  useEffect(() => {
    const handleLicenseError = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      setLicenseError(customEvent.detail || "Licencia inactiva o no registrada.");
    };

    window.addEventListener('koda-license-error', handleLicenseError);
    return () => {
      window.removeEventListener('koda-license-error', handleLicenseError);
    };
  }, []);

  const login = (newToken: string, userData?: any) => {
    setLicenseError(null);
    setToken(newToken);
    // Guardar en localStorage como fallback (el mecanismo principal es la cookie httpOnly)
    if (newToken) {
      localStorage.setItem('koda_token', newToken);
      localStorage.setItem('sgd_token', newToken);
    }
    // Si se proporcionan datos del usuario directamente, usarlos
    if (userData) {
      setUserRole(userData.role || userData.rol || null);
      setUserName(userData.username || userData.name || null);
      setUserEmail(userData.email || null);
      setUserId(userData.id || userData.sub || null);
      setTenantId(userData.tenant_id || null);
      setTenantName(userData.tenant_name || null);
    }
  };

  const logout = () => {
    setLicenseError(null);
    setToken(null);
    // Llamar al endpoint de logout para limpiar la cookie httpOnly
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  };

  const checkLicense = async (): Promise<boolean> => {
    try {
      // Intentamos una petición ligera que requiera autenticación.
      // Si el middleware no nos rebota con 403, significa que la licencia ya está activa.
      await api.get('/entidades/empresa/perfil');
      setLicenseError(null);
      return true;
    } catch (err: any) {
      console.warn("La validación de la licencia falló o sigue inactiva:", err.message);
      return false;
    }
  };

  return (
    <AuthContext.Provider value={{
      token,
      userRole,
      userName,
      userEmail,
      userId,
      tenantId,
      tenantName,
      licenseError,
      checkLicense,
      setLicenseError,
      login,
      logout,
      isAuthenticated: !!token,
      isAuthLoading
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
