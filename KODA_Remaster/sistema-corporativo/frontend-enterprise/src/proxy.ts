import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const protectedRoutes = ['/dashboard', '/registro'];
const authPages = ['/login'];

const API_BASE_URL =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV === 'production'
        ? 'https://corpoelect-backend.onrender.com'
        : 'http://127.0.0.1:8000');

function withNoCache(response: NextResponse) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;
}

function addNonce(url: URL) {
    url.searchParams.set('_r', `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    return url;
}

async function validateSession(token: string): Promise<{ status: "valid" | "invalid" | "unknown"; role: string }> {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/validate`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
            },
            cache: 'no-store',
        });

        if (response.status === 401 || response.status === 403) {
            return { status: "invalid", role: "" };
        }
        if (!response.ok) {
            return { status: "unknown", role: "" };
        }
        const data = await response.json();
        const role = String(data?.user?.role || '').toLowerCase().trim();
        return { status: "valid", role };
    } catch {
        // Si falla la red o backend, no forzamos logout para evitar pantallas en blanco al recargar.
        return { status: "unknown", role: "" };
    }
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const sessionCookie = request.cookies.get('session')?.value || '';

    const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));
    const isAuthPage = authPages.some((route) => pathname.startsWith(route));

    if (!sessionCookie) {
        if (isProtectedRoute) {
            const loginUrl = addNonce(new URL('/login', request.url));
            loginUrl.searchParams.set('next', pathname);
            return withNoCache(NextResponse.redirect(loginUrl));
        }
        return withNoCache(NextResponse.next());
    }

    const validation = await validateSession(sessionCookie);
    if (validation.status === "invalid") {
        if (isProtectedRoute) {
            const loginUrl = addNonce(new URL('/login', request.url));
            loginUrl.searchParams.set('next', pathname);
            return withNoCache(NextResponse.redirect(loginUrl));
        }
        return withNoCache(NextResponse.next());
    }

    // Bloqueo por rol para registro: solo perfiles privilegiados.
    if (pathname.startsWith('/registro')) {
        const privileged = ['desarrollador', 'dev', 'developer', 'administrativo', 'admin', 'administrador', 'ceo'];
        if (validation.status === "valid" && !privileged.includes(validation.role)) {
            const dashboardUrl = addNonce(new URL('/dashboard', request.url));
            return withNoCache(NextResponse.redirect(dashboardUrl));
        }
    }

    // Si ya tiene sesión válida, no permitir volver a login por URL directa.
    if (isAuthPage && validation.status === "valid") {
        const requestedNext = request.nextUrl.searchParams.get('next') || '';
        const safeNext =
            requestedNext.startsWith('/') && !requestedNext.startsWith('//')
                ? requestedNext
                : '/dashboard';
        const targetUrl = addNonce(new URL(safeNext, request.url));
        return withNoCache(NextResponse.redirect(targetUrl));
    }

    return withNoCache(NextResponse.next());
}

export const config = {
    matcher: [
        '/login',
        '/registro',
        '/dashboard',
        '/dashboard/:path*'
    ]
};
