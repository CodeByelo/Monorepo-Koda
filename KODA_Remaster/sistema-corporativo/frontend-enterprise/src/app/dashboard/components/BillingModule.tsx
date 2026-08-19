"use client";
import React, { useEffect, useState, useCallback } from "react";
import { CreditCard, Maximize2, Loader2, AlertTriangle, RefreshCw } from "lucide-react";

type BridgeStatus = "loading" | "ready" | "error";

const MAX_RETRIES = 3;
const RETRY_DELAYS = [0, 2000, 5000]; // ms entre reintentos: inmediato, 2s, 5s

export default function BillingModule({ darkMode }: { darkMode: boolean }) {
  const isProduction = typeof window !== 'undefined' && (
    window.location.hostname.includes('vercel.app') ||
    window.location.hostname.includes('onrender.com') ||
    window.location.hostname.includes('cloudflare')
  );
  const isTailscale = typeof window !== 'undefined' && window.location.hostname.includes('.ts.net');
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

  const billingProdUrl = process.env.NEXT_PUBLIC_BILLING_URL || 'https://koda-billing-front.vercel.app';
  let baseUrl = isProduction ? billingProdUrl : `http://${host}:5174`;
  if (isTailscale) {
    baseUrl = `https://${host}:8443`;
  }

  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>("loading");
  const [exchangeCode, setExchangeCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  const fetchExchangeCode = useCallback(async (attempt = 0): Promise<boolean> => {
    try {
      const token = typeof window !== 'undefined'
        ? (localStorage.getItem('sgd_token') || localStorage.getItem('koda_token'))
        : null;

      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch("/api/auth/koda-frontend/exchange-code", {
        method: "GET",
        headers,
        credentials: "include",
      });

      const body = await res.json().catch(() => ({} as any));

      if (res.ok && body?.exchange_code) {
        setExchangeCode(body.exchange_code as string);
        setBridgeStatus("ready");
        setRetryCount(0);
        return true;
      }

      // Si es un 401, no tiene sentido reintentar
      if (res.status === 401) {
        setErrorMessage("Tu sesión ha expirado. Recarga la página e inicia sesión nuevamente.");
        setBridgeStatus("error");
        return false;
      }

      // Si es 404, el usuario no tiene acceso (no es un error transitorio)
      if (res.status === 404) {
        setErrorMessage(
          body?.detail || "Tu empresa no tiene el Módulo de Facturación activado. Contacta a soporte."
        );
        setBridgeStatus("error");
        return false;
      }

      // Para errores 5xx, intentar reintentar
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS[attempt + 1] || 5000;
        await new Promise((r) => setTimeout(r, delay));
        return fetchExchangeCode(attempt + 1);
      }

      // Agotados los reintentos
      setErrorMessage(
        body?.detail ||
        "No se pudo conectar con el Módulo de Facturación. Usa el botón de reintento."
      );
      setBridgeStatus("error");
      return false;
    } catch (e) {
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS[attempt + 1] || 5000;
        await new Promise((r) => setTimeout(r, delay));
        return fetchExchangeCode(attempt + 1);
      }

      setErrorMessage(
        "Error de conexión al verificar tu acceso. Verifica tu internet y usa el botón de reintento."
      );
      setBridgeStatus("error");
      return false;
    }
  }, []);

  // Carga inicial con reintentos automáticos
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setBridgeStatus("loading");
      const success = await fetchExchangeCode(0);
      if (cancelled) return;
      if (!success && bridgeStatus !== "error") {
        setBridgeStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reintento manual del usuario
  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    setBridgeStatus("loading");
    setRetryCount((c: number) => c + 1);
    await fetchExchangeCode(0);
    setIsRetrying(false);
  }, [fetchExchangeCode]);

  const billingUrl = exchangeCode
    ? `${baseUrl}?exchange_code=${encodeURIComponent(exchangeCode)}`
    : baseUrl;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Topbar compacto */}
      <div
        className={`flex items-center justify-between px-4 py-2 border-b shrink-0 ${
          darkMode
            ? "bg-[#162020] border-[#263636]"
            : "bg-white border-slate-200"
        }`}
      >
        <div className="flex items-center gap-2">
          <CreditCard size={18} className="text-[#00C294]" />
          <span
            className={`font-semibold text-sm ${
              darkMode ? "text-slate-100" : "text-slate-800"
            }`}
          >
            Módulo de Facturación — Koda ERP
          </span>
        </div>
        {bridgeStatus === "ready" && (
          <a
            href={billingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
              darkMode
                ? "bg-[#00C294]/10 text-[#00C294] hover:bg-[#00C294]/20"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            <Maximize2 size={13} />
            Abrir en ventana completa
          </a>
        )}
      </div>

      {/* Contenido: loader, error con botón de reintento, o iframe */}
      {bridgeStatus === "loading" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 size={28} className="animate-spin text-[#00C294]" />
          <span className="text-sm font-medium">Verificando tu acceso al Módulo de Facturación…</span>
        </div>
      )}

      {bridgeStatus === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <AlertTriangle size={28} className="text-amber-500" />
          <span
            className={`text-sm font-semibold max-w-md ${
              darkMode ? "text-slate-200" : "text-slate-700"
            }`}
          >
            {errorMessage}
          </span>
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              isRetrying
                ? "opacity-50 cursor-not-allowed"
                : "cursor-pointer hover:scale-105"
            } ${
              darkMode
                ? "bg-[#00C294]/20 text-[#00C294] hover:bg-[#00C294]/30 border border-[#00C294]/30"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
            }`}
          >
            <RefreshCw size={14} className={isRetrying ? "animate-spin" : ""} />
            {isRetrying ? "Reintentando…" : "Reintentar conexión"}
          </button>
          {retryCount > 0 && (
            <span className={`text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
              Intento {retryCount + 1}
            </span>
          )}
        </div>
      )}

      {bridgeStatus === "ready" && (
        <iframe
          src={billingUrl}
          title="Módulo de Facturación"
          style={{ flex: 1, border: "none", display: "block", width: "100%" }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      )}
    </div>
  );
}
