"use client";

import { useAuth } from '../hooks/useAuth';
import { UserRole } from '../context/AuthContext';
import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Deterministic loading screen.
 * This JSX MUST be byte-identical on server and client to avoid hydration
 * mismatches.  It must not depend on any state, props, or browser API.
 */
const LOADING_UI = (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
        <div className="text-center">
            <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400 text-sm font-medium animate-pulse">Verificando...</p>
        </div>
    </div>
);

interface RoleGuardProps {
    children: ReactNode;
    allowedRoles: UserRole[];
    fallback?: ReactNode;
    redirectTo?: string;
}

/**
 * RoleGuard component to protect routes based on user roles
 * Renders children only if user has one of the allowed roles
 */
export function RoleGuard({
    children,
    allowedRoles,
    fallback,
    redirectTo
}: RoleGuardProps) {
    const { user, isLoading, isAuthenticated, logout } = useAuth();
    const router = useRouter();
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (isMounted && !isLoading && !isAuthenticated && redirectTo) {
            const nextPath =
                typeof window !== "undefined"
                    ? `${window.location.pathname}${window.location.search || ""}`
                    : "";
            if (redirectTo === "/login" && nextPath.startsWith("/")) {
                router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
                return;
            }
            router.replace(redirectTo);
        }
    }, [isMounted, isLoading, isAuthenticated, redirectTo, router]);

    // ── Hydration-safe guard ──
    // The server render (!isMounted) and the first client render return null.
    // Once mounted, it returns LOADING_UI if loading, preventing any mismatch.
    if (!isMounted) return null;
    if (isLoading) return LOADING_UI;

    // Not authenticated
    if (!isAuthenticated || !user) {
        if (fallback) {
            return <>{fallback}</>;
        }
        return (
            <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
                <div className="max-w-md w-full bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-red-500/50 p-8 text-center">
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Acceso Denegado</h2>
                    <p className="text-gray-400 mb-6">No tienes permisos para acceder a esta sección.</p>
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                        Volver al Dashboard
                    </button>
                </div>
            </div>
        );
    }

    // Check role authorization
    if (!allowedRoles.includes(user.role)) {
        if (fallback) {
            return <>{fallback}</>;
        }
        return (
            <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
                <div className="max-w-md w-full bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-red-500/50 p-8 text-center">
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Acceso Restringido</h2>
                    <p className="text-gray-400 mb-2">Esta sección requiere permisos de: <span className="text-red-400 font-semibold">{allowedRoles.join(', ')}</span></p>
                    <p className="text-gray-500 text-sm mb-6">Tu rol actual: <span className="text-gray-300">{user.role}</span></p>
                    <button
                        onClick={() => {
                            void logout();
                        }}
                        className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                        Cerrar Sesión y Re-autenticar
                    </button>
                </div>
            </div>
        );
    }

    // User is authorized
    return <>{children}</>;
}
