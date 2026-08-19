import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get('session');

        if (!sessionCookie) {
            return NextResponse.json({ authenticated: false });
        }

        return NextResponse.json({ authenticated: true });
    } catch (error) {
        console.error('Session check error:', error);
        return NextResponse.json({ authenticated: false });
    }
}
