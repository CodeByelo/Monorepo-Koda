'use client';

import { useEffect, useState } from "react";
import { AuthProvider } from "../context/AuthContext";
import { SecurityProtector } from "../components/SecurityProtector";
import { SystemDialogHost } from "../lib/ui-dialog";
import { SessionGuard } from "../components/SessionGuard";

export function Providers({ children }: { children: React.ReactNode }) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return null;
    }

    return (
        <AuthProvider>
            <SecurityProtector>
                {children}
                <SystemDialogHost />
                <SessionGuard />
            </SecurityProtector>
        </AuthProvider>
    );
}
