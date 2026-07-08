import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const API_BASE_URL =
    process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV === "production"
        ? "https://monorepo-koda.onrender.com"
        : "http://127.0.0.1:8000");

export async function POST() {
    try {
        const cookieStore = await cookies();
        const sessionToken = cookieStore.get('session')?.value;

        // Registrar evento de logout en auditoría (best-effort).
        if (sessionToken) {
            try {
                await fetch(`${API_BASE_URL}/security/logs`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${sessionToken}`,
                    },
                    body: JSON.stringify({
                        evento: 'LOGOUT',
                        detalles: 'Cierre de sesión manual',
                        estado: 'info',
                        page: '/dashboard',
                    }),
                    cache: 'no-store',
                });
            } catch {
                // no-op
            }
        }

        cookieStore.set('session', '', {
            httpOnly: true,
            path: '/',
            maxAge: 0,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Logout error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
