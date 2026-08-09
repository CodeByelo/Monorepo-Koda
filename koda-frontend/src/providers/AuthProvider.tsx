import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '@/api/client';

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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      // 1. Extraer token recibido desde URL (?token=...)
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token');
      if (urlToken) {
        localStorage.setItem('koda_token', urlToken);
        localStorage.setItem('sgd_token', urlToken);
        return urlToken;
      }

      // 2. Verificar si existe token previo en localStorage
      const kodaToken = localStorage.getItem('koda_token');
      const sgdToken = localStorage.getItem('sgd_token');
      if (kodaToken || sgdToken) {
        return kodaToken || sgdToken;
      }

      // 3. En modo desarrollo local, usar token dev fallback
      if ((import.meta as any).env && (import.meta as any).env.DEV) {
        const devToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZWY1MjY0MC0wOTZmLTQzNjctYjkxMy0wN2UyOTIzODc2MzgiLCJyb2xlIjoiRGVzYXJyb2xsYWRvciIsInVzZXJuYW1lIjoiSGVucnkgUm9kcmlndWV6IiwiZW1haWwiOiJoZW5yeWRkYW5pZWwxOTEwQGdtYWlsLmNvbSJ9.6--QCWH9gYF0y-6n0BMjLsyS4NHdoojLAQunJiP1WTM";
        localStorage.setItem('koda_token', devToken);
        localStorage.setItem('sgd_token', devToken);
        return devToken;
      }
    }
    return null;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token');
      if (urlToken && urlToken !== token) {
        localStorage.setItem('koda_token', urlToken);
        localStorage.setItem('sgd_token', urlToken);
        setToken(urlToken);
      }
    }
  }, [token]);
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
  }, [token]);

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
      isAuthenticated: !!token
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
