import os

filepath = '/home/byelo/koda-backend/KODA_Remaster/sistema-corporativo/frontend-enterprise/src/context/AuthContext.tsx'

with open(filepath, 'r') as f:
    lines = f.readlines()

# Keep exactly lines 1 to 161
good_lines = lines[:161]

replacement = """            ...parsedUser,
            role,
            permissions: getEffectivePermissions(role, parsedUser.permissions),
          });
          return;
        } catch (e) {
          console.error("Error parsing stored user", e);
          localStorage.removeItem("sgd_user");
          localStorage.removeItem("sgd_token");
        }
      }

      setUser(null);
    };

    hydrateSession().finally(() => {
      setIsLoading(false);
    });
  }, [isClient]);

  const login = async (
    username: string,
    password: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      setIsLoading(true);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      let response: Response;
      try {
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
        response = await fetch(`${backendUrl}/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email: username, username, password }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        let detail = "Credenciales incorrectas o error de servidor";
        try {
          const errData = await response.json();
          const payload = errData?.detail ?? errData;
          if (typeof payload === "string") {
            detail = payload;
          } else if (payload && typeof payload === "object") {
            const message = typeof payload.message === "string" ? payload.message : detail;
            detail = message;
          }
        } catch {
          // ignore
        }
        return { success: false, error: detail };
      }

      const data = await response.json();
      const newUser = buildUserFromBackend(data.user);
      localStorage.setItem("sgd_token", data.access_token);
      localStorage.setItem("sgd_user", JSON.stringify(newUser));
      setUser(newUser);
      return { success: true };
    } catch (error) {
      console.error("Login error:", error);
      if (error instanceof Error && error.name === "AbortError") {
        return { success: false, error: "Tiempo de espera agotado. Intente nuevamente." };
      }
      return { success: false, error: error instanceof Error ? error.message : "Error inesperado" };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
    } catch {
      // no-op
    }
    setUser(null);
    localStorage.removeItem("sgd_token");
    localStorage.removeItem("sgd_user");
    window.location.replace("/login?logout=1");
  };

  const switchRole = async (newRole: UserRole): Promise<boolean> => {
    if (!roleSimulationEnabled) return false;
    if (!user) return false;
    if (user.role !== "Desarrollador") return false;

    let newNombre = user.nombre;
    let newApellido = user.apellido;

    if (newRole === "CEO") {
      newNombre = "Director";
      newApellido = "Ejecutivo";
    } else if (newRole === "Administrativo") {
      newNombre = "Administrador";
      newApellido = "General";
    } else if (newRole === "Gerente") {
      newNombre = "Gerente";
      newApellido = "Principal";
    } else if (newRole === "Usuario") {
      newNombre = "Operador";
      newApellido = "Estandar";
    } else if (newRole === "Desarrollador") {
      newNombre = "Desarrollador";
      newApellido = "Principal";
    }

    const updatedUser: User = {
      ...user,
      role: newRole,
      roleOriginal: user.roleOriginal || user.role,
      nombre: newNombre,
      apellido: newApellido,
      permissions: getEffectivePermissions(newRole),
    };

    setUser(updatedUser);
    localStorage.setItem("sgd_user", JSON.stringify(updatedUser));
    return true;
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    if (user.role === "Desarrollador") return true;
    return user.permissions?.includes(permission) || false;
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    setUser,
    switchRole,
    hasPermission,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}
"""

with open(filepath, 'w') as f:
    f.writelines(good_lines)
    f.write(replacement)

