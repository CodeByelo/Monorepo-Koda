"use client";
import React, { useEffect, useState, useCallback } from "react";
import { CreditCard, Maximize2, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { fetchBillingUrl, getBillingBaseUrl, BillingBridgeError } from "../utils/billingBridge";

type BridgeStatus = "loading" | "ready" | "error";

export default function BillingModule({ darkMode }: { darkMode: boolean }) {
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>("loading");
  const [billingUrl, setBillingUrl] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const directUrl = getBillingBaseUrl();

  const loadBillingUrl = useCallback(async () => {
    try {
      const url = await fetchBillingUrl();
      setBillingUrl(url);
      setBridgeStatus("ready");
    } catch (e) {
      setErrorMessage(
        e instanceof BillingBridgeError
          ? e.message
          : "No se pudo conectar con el Módulo de Facturación. Usa el botón de reintento.",
      );
      setBridgeStatus("error");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBridgeStatus("loading");
    loadBillingUrl().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [loadBillingUrl]);

  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    setBridgeStatus("loading");
    setRetryCount((c) => c + 1);
    await loadBillingUrl();
    setIsRetrying(false);
  }, [loadBillingUrl]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Topbar compacto con botón directo siempre accesible */}
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
        <div className="flex items-center gap-2">
          <a
            href={billingUrl || directUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all shadow-sm ${
              darkMode
                ? "bg-[#00C294]/20 text-[#00C294] hover:bg-[#00C294]/30 border border-[#00C294]/40"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            <Maximize2 size={13} />
            Abrir ERP Directo
          </a>
        </div>
      </div>

      {/* Contenido: loader, error con botón de reintento + enlace directo, o iframe */}
      {bridgeStatus === "loading" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 size={28} className="animate-spin text-[#00C294]" />
          <span className="text-sm font-medium">Conectando con el ERP / Módulo de Facturación…</span>
          <a
            href={directUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#00C294] hover:underline font-bold mt-2"
          >
            ¿Prefieres entrar directamente? Haz clic aquí ➔
          </a>
        </div>
      )}

      {bridgeStatus === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <AlertTriangle size={32} className="text-amber-500" />
          <div className="max-w-md space-y-1">
            <span
              className={`text-sm font-bold block ${
                darkMode ? "text-slate-200" : "text-slate-800"
              }`}
            >
              Acceso Directo al ERP de Facturación
            </span>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {errorMessage}
            </p>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <a
              href={directUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-[#00C294] text-slate-950 hover:bg-[#00a880] transition-all shadow-md active:scale-95"
            >
              <Maximize2 size={14} />
              Entrar al ERP en Pestaña Aparte
            </a>

            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                isRetrying
                  ? "opacity-50 cursor-not-allowed"
                  : "cursor-pointer hover:scale-105"
              } ${
                darkMode
                  ? "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
              }`}
            >
              <RefreshCw size={13} className={isRetrying ? "animate-spin" : ""} />
              {isRetrying ? "Reintentando…" : "Reintentar incrustado"}
            </button>
          </div>

          <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
            <span>Enlace directo:</span>
            <code className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono select-all text-[#00C294]">
              {directUrl}
            </code>
          </div>

          {retryCount > 0 && (
            <span className={`text-[10px] ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
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
