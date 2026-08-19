"use client";

import { useState } from "react";
import { checkConnection } from "../../lib/api";

export default function TestConnectionPage() {
    const [status, setStatus] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleCheck = async () => {
        setLoading(true);
        setStatus(null);
        try {
            const response = await checkConnection();
            setStatus(`✅ Éxito: ${response.message}`);
        } catch (error: any) {
            setStatus(`❌ Error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-100 p-4">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-md text-center">
                <h1 className="text-2xl font-bold mb-6">Prueba de Conexión</h1>
                <p className="mb-6 text-gray-600 dark:text-gray-400">
                    Haz clic en el botón para verificar la conexión con el Backend y la Base de Datos.
                </p>

                <button
                    onClick={handleCheck}
                    disabled={loading}
                    className={`w-full py-3 px-4 rounded-md text-white font-medium transition-colors ${loading
                        ? "bg-gray-400 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700"
                        }`}
                >
                    {loading ? "Verificando..." : "Verificar Conexión"}
                </button>

                {status && (
                    <div
                        className={`mt-6 p-4 rounded-md text-left text-sm ${status.startsWith("✅")
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                            : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                            }`}
                    >
                        {status}
                    </div>
                )}
            </div>
        </div>
    );
}
