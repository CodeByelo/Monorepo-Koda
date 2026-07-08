import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/context/AuthContext';

export function useIdleTimer() {
    const router = useRouter();
    const { user } = useAuthContext();
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const timeoutMs = Number(process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MINS || 15) * 60000;

    useEffect(() => {
        // Si el usuario es Desarrollador, desactivamos por completo el auto-logout por inactividad
        if (user?.role === 'Desarrollador') {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
            return;
        }

        const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];

        const resetTimer = () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
            timerRef.current = setTimeout(() => {
                fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
                localStorage.removeItem('sgd_token');
                localStorage.removeItem('sgd_user');
                router.push('/login?reason=timeout');
            }, timeoutMs);
        };

        resetTimer();
        events.forEach(event => window.addEventListener(event, resetTimer));

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            events.forEach(event => window.removeEventListener(event, resetTimer));
        };
    }, [timeoutMs, router, user]);
}
