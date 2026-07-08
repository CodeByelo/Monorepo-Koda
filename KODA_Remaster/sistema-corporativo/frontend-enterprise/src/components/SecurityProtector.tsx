'use client';

import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';

/**
 * SecurityProtector Component
 * 
 * Provides production-grade frontend security measures:
 * 1. Blocks Right-Click (Context Menu)
 * 2. Blocks DevTools shortcuts (F12, Ctrl+Shift+I, etc.)
 * 3. Blocks View Source (Ctrl+U)
 * 4. Anti-Debugger loops (Disuasion)
 */
export function SecurityProtector({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const userRole = user?.role?.toLowerCase() || '';
    const isDev = userRole === 'desarrollador' || userRole === 'dev' || userRole === 'developer';

    useEffect(() => {
        // Skip security for developer roles to allow debugging
        if (isDev) return;

        // 1. Disable Context Menu
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            return false;
        };

        // 2. Disable Keyboard Shortcuts
        const handleKeyDown = (e: KeyboardEvent) => {
            // F12
            if (e.key === 'F12') {
                e.preventDefault();
                return false;
            }

            // Ctrl+Shift+I (Inspect), Ctrl+Shift+J (Console), Ctrl+Shift+C (Element Selector)
            if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
                e.preventDefault();
                return false;
            }

            // Ctrl+U (View Source)
            if (e.ctrlKey && (e.key === 'U' || e.key === 'u')) {
                e.preventDefault();
                return false;
            }

            // Ctrl+S (Save)
            if (e.ctrlKey && (e.key === 'S' || e.key === 's')) {
                e.preventDefault();
                return false;
            }
        };

        // 3. Anti-Debugger (Disuasion only)
        // Note: This is invasive, we use a lighter version
        const antiDebugger = setInterval(() => {
            // Only runs if a debugger is actually open in many browsers
            (function () {
                try {
                    (function (a: any) {
                        return (function (a: any) {
                            return (function (a: any) {
                                return (a + "").length !== 1 || a % 20 === 0
                            })(a)
                        })(a)
                    })(function () { debugger; })
                } catch (e) { }
            })();
        }, 2000);

        document.addEventListener('contextmenu', handleContextMenu);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('contextmenu', handleContextMenu);
            document.removeEventListener('keydown', handleKeyDown);
            clearInterval(antiDebugger);
        };
    }, [isDev]);

    return <>{children}</>;
}
