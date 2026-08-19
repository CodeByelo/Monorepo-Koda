"use client";
import React, { useEffect, useState, useCallback } from "react";
import { CreditCard, Maximize2, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { fetchBillingUrl, BillingBridgeError } from "../utils/billingBridge";

type BridgeStatus = "loading" | "ready" | "error";

export default function BillingModule({ darkMode }: { darkMode: boolean }) {
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>("loading");
  const [billingUrl, setBillingUrl] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

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
