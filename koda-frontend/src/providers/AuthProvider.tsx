import React, { createContext, useContext, useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
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
  login: (token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      if ((import.meta as any).env && (import.meta as any).env.DEV) {
        const devToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZWY1MjY0MC0wOTZmLTQzNjctYjkxMy0wN2UyOTIzODc2MzgiLCJyb2xlIjoiRGVzYXJyb2xsYWRvciIsInVzZXJuYW1lIjoiSGVucnkgUm9kcmlndWV6IiwiZW1haWwiOiJoZW5yeWRkYW5pZWwxOTEwQGdtYWlsLmNvbSJ9.6--QCWH9gYF0y-6n0BMjLsyS4NHdoojLAQunJiP1WTM";
        localStorage.setItem('koda_token', devToken);
        localStorage.setItem('sgd_token', devToken);
        return devToken;
      }
      
      const params = new URLSearchParams(window.location.search);
      const queryToken = params.get('token');
      if (queryToken) {
        localStorage.setItem('koda_token', queryToken);
        localStorage.setItem('sgd_token', queryToken);
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('token');
          window.history.replaceState({}, '', url.pathname + url.search);
        } catch (e) {
          console.error("Error clearing token from URL", e);
        }
        return queryToken;
      }
      const kodaToken = localStorage.getItem('koda_token');
      const sgdToken = localStorage.getItem('sgd_token');
      if (!kodaToken && sgdToken) {
        localStorage.setItem('koda_token', sgdToken);
      }
      return kodaToken || sgdToken;
    }
    return null;
  });
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
        const decoded: any = jwtDecode(token);
        if (decoded.exp && decoded.exp * 1000 < Date.now()) {
          throw new Error("Token expired");
        }
        setUserRole(decoded.role || decoded.rol || null);
        setUserName(decoded.username || decoded.name || null);
        setUserEmail(decoded.email || null);
        setUserId(decoded.sub || null);
        setTenantId(decoded.tenant_id || null);
        setTenantName(decoded.tenant_name || null);
        localStorage.setItem('koda_token', token);
        localStorage.setItem('sgd_token', token);
      } catch (e) {
        console.error("Invalid token", e);
        setToken(null);
        setUserRole(null);
        setUserName(null);
        setUserEmail(null);
        setUserId(null);
        setTenantId(null);
        setTenantName(null);
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

  const login = (newToken: string) => {
    setLicenseError(null);
    setToken(newToken);
  };

  const logout = () => {
    setLicenseError(null);
    setToken(null);
  };

  const checkLicense = async (): Promise<boolean> => {
    try {
      // Intentamos una petición ligera que requiera autenticación.
      // Si el middleware no nos rebota con 403, significa que la licencia ya está activa.
      await api.get('/empresa/perfil');
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
