"use client";
import React, { useEffect, useState } from "react";
import { CreditCard, Maximize2, Loader2, AlertTriangle } from "lucide-react";

type BridgeStatus = "loading" | "ready" | "error";

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

  // ─────────────────────────────────────────────────────────────────────
  // SSO real hacia koda-frontend (el ERP): antes se anexaba aquí el JWT de
  // sesión de este backend (localStorage "sgd_token") como `?token=...`,
  // exponiendo la sesión completa en el historial del navegador y en logs
  // de acceso del origen de facturación. Se retiró y nunca se reemplazó
  // por nada funcional -- koda-frontend siempre mostraba "Acceso
  // Restringido" a cualquier usuario.
  //
  // Ahora: antes de renderizar el iframe, se pide un exchange_code de un
  // solo uso a GET /api/auth/koda-frontend/exchange-code (proxy hacia
  // GET /auth/koda-frontend/exchange-code del backend de ESTE sistema,
  // que a su vez llama a koda-frontend/backend con el profile_id de la
  // sesión actual -- nunca uno enviado por este componente). Ese código
  // se consume igual que el resto del monorepo: `?exchange_code=...`,
  // que el AuthProvider de koda-frontend ya sabe canjear contra
  // POST /api/auth/exchange (mecanismo preexistente, sin cambios).
  // ─────────────────────────────────────────────────────────────────────
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>("loading");
  const [exchangeCode, setExchangeCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>(
    "No se pudo verificar tu acceso al módulo de Facturación. Contactá soporte."
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setBridgeStatus("loading");
      try {
        const res = await fetch("/api/auth/koda-frontend/exchange-code", {
          method: "GET",
          credentials: "include",
        });

        if (cancelled) return;

        const body = await res.json().catch(() => ({} as any));

        if (!res.ok || !body?.exchange_code) {
          setErrorMessage(
            body?.detail ||
              "No se pudo verificar tu acceso al módulo de Facturación. Contactá soporte."
          );
          setBridgeStatus("error");
          return;
        }

        setExchangeCode(body.exchange_code as string);
        setBridgeStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setErrorMessage(
          "No se pudo verificar tu acceso al módulo de Facturación. Contactá soporte."
        );
        setBridgeStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      {/* Contenido: loader mientras se resuelve el exchange_code, mensaje
          claro si falla, iframe recién cuando hay un código válido. */}
      {bridgeStatus === "loading" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 size={28} className="animate-spin text-[#00C294]" />
          <span className="text-sm font-medium">Verificando tu acceso al Módulo de Facturación…</span>
        </div>
      )}

      {bridgeStatus === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <AlertTriangle size={28} className="text-amber-500" />
          <span
            className={`text-sm font-semibold max-w-md ${
              darkMode ? "text-slate-200" : "text-slate-700"
            }`}
          >
            {errorMessage}
          </span>
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
