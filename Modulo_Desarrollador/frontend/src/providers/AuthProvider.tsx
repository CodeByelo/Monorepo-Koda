import React, { createContext, useContext, useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';

interface AuthContextType {
  token: string | null;
  userRole: string | null;
  username: string | null;
  tenantName: string | null;
  login: (token: string) => boolean; // Returns true if developer role verified
  logout: () => void;
  isAuthenticated: boolean;
  isDeveloper: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('koda_dev_token'));
  const [userRole, setUserRole] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [isDeveloper, setIsDeveloper] = useState<boolean>(false);

  useEffect(() => {
    if (token) {
      try {
        const decoded: any = jwtDecode(token);
        const role = decoded.role || decoded.rol || null;
        setUserRole(role);
        setUsername(decoded.username || decoded.email || null);
        setTenantName(decoded.tenant_name || null);

        const normalizedRole = role?.toLowerCase() || '';
        const hasDevRole = normalizedRole === 'desarrollador' || normalizedRole === 'dev' || normalizedRole === 'developer';
        setIsDeveloper(hasDevRole);

        if (hasDevRole) {
          localStorage.setItem('koda_dev_token', token);
        } else {
          // If not dev, clear out
          setToken(null);
          setUserRole(null);
          setUsername(null);
          setTenantName(null);
          setIsDeveloper(false);
          localStorage.removeItem('koda_dev_token');
        }
      } catch (e) {
        console.error("Invalid developer token", e);
        setToken(null);
        setUserRole(null);
        setUsername(null);
        setTenantName(null);
        setIsDeveloper(false);
        localStorage.removeItem('koda_dev_token');
      }
    } else {
      setUserRole(null);
      setUsername(null);
      setTenantName(null);
      setIsDeveloper(false);
      localStorage.removeItem('koda_dev_token');
    }

    const handleUnauthorized = () => {
      console.warn("Unauthorized API call, clearing token");
      setToken(null);
      setUserRole(null);
      setUsername(null);
      setTenantName(null);
      setIsDeveloper(false);
      localStorage.removeItem('koda_dev_token');
    };

    window.addEventListener('auth-unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth-unauthorized', handleUnauthorized);
    };
  }, [token]);

  const login = (newToken: string): boolean => {
    try {
      const decoded: any = jwtDecode(newToken);
      const role = decoded.role || decoded.rol || null;
      const normalizedRole = role?.toLowerCase() || '';
      const hasDevRole = normalizedRole === 'desarrollador' || normalizedRole === 'dev' || normalizedRole === 'developer';

      if (hasDevRole) {
        setToken(newToken);
        return true;
      }
      return false;
    } catch (e) {
      console.error("Login token error", e);
      return false;
    }
  };

  const logout = () => {
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{
      token,
      userRole,
      username,
      tenantName,
      login,
      logout,
      isAuthenticated: !!token && isDeveloper,
      isDeveloper
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
