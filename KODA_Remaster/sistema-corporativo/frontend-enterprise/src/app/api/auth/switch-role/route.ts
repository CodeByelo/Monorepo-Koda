import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { role } = await request.json();
        if (!role) {
            return NextResponse.json({ error: 'Role is required' }, { status: 400 });
        }
        return NextResponse.json(
            { error: 'Role switching must be handled by backend authorization' },
            { status: 501 },
        );
    } catch (error) {
        console.error('[Switch Role Error]', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
