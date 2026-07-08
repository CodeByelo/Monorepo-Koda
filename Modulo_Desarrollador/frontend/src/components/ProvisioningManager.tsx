import React, { useState } from 'react';
import { api } from '@/api/client';

interface ProvisioningResponse {
  token: string;
  expires_at: string;
  tenant_id: string;
}

export const ProvisioningManager: React.FC = () => {
  const [tenantId, setTenantId] = useState('');
  const [maxUsers, setMaxUsers] = useState(10);
  const [expiresInHours, setExpiresInHours] = useState(48);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProvisioningResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Error al copiar al portapapeles', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId.trim()) {
      setError('El UUID del Tenant es requerido.');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await api.post<ProvisioningResponse>('/dev/provision/token', {
        tenant_id: tenantId.trim(),
        max_users: maxUsers,
        expires_in_hours: expiresInHours,
      });
      setResult(response);
    } catch (err: any) {
      const errMsg = err?.message || 'Error al generar el token de aprovisionamiento.';
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100 font-sans">
      <div className="mb-6">
        <h2 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
          Aprovisionamiento de Cuenta (One-Time Token)
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Genera un token de un solo uso para que el cliente reclame su cuenta y configure su Administrador General.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="tenantId" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            UUID del Tenant
          </label>
          <input
            id="tenantId"
            type="text"
            placeholder="ej. 123e4567-e89b-12d3-a456-426614174000"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            disabled={isLoading}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500 transition-colors"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="maxUsers" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Límite de Usuarios
            </label>
            <input
              id="maxUsers"
              type="number"
              min={1}
              max={500}
              value={maxUsers}
              onChange={(e) => setMaxUsers(parseInt(e.target.value) || 10)}
              disabled={isLoading}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="expiresInHours" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Expiración (Horas)
            </label>
            <input
              id="expiresInHours"
              type="number"
              min={1}
              value={expiresInHours}
              onChange={(e) => setExpiresInHours(parseInt(e.target.value) || 48)}
              disabled={isLoading}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-teal-500 transition-colors"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-950/40 border border-red-900/50 text-red-200 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-semibold py-3 px-4 rounded-xl shadow-lg shadow-teal-500/20 hover:shadow-teal-500/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5 text-slate-950" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Generando Token...
            </div>
          ) : (
            'Generar Token de Activación'
          )}
        </button>
      </form>

      {result && (
        <div className="mt-8 pt-6 border-t border-slate-800/80 space-y-4">
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-200 text-xs flex gap-3">
            <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <span className="font-semibold block mb-0.5">ADVERTENCIA DE SEGURIDAD</span>
              Copia este token ahora. Por motivos de seguridad y privacidad de datos, no se volverá a mostrar en el sistema.
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-4">
            <code className="text-emerald-400 font-mono text-sm break-all select-all">
              {result.token}
            </code>
            <button
              onClick={() => handleCopy(result.token)}
              className="shrink-0 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              {copied ? (
                <>
                  <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Copiado</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  <span>Copiar</span>
                </>
              )}
            </button>
          </div>

          <div className="flex justify-between items-center text-[10px] uppercase tracking-wider text-slate-500 font-semibold px-1">
            <span>Tenant: {result.tenant_id.slice(0, 8)}...</span>
            <span>Expira: {new Date(result.expires_at).toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
};
