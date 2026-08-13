"use client";
import React from "react";
import { CreditCard, ExternalLink, Maximize2 } from "lucide-react";

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
  // SEGURIDAD: antes se anexaba aquí el JWT de sesión de este backend
  // (localStorage "sgd_token") como `?token=...`, exponiendo la sesión completa en el
  // historial del navegador y en logs de acceso del origen de facturación. Se retiró:
  // 1) koda-frontend ya no lee `?token=` en su AuthProvider (ver commit 3b7bf8a, que
  //    migró a un `?exchange_code=` de un solo uso), por lo que ese parámetro ya no
  //    tenía ningún efecto funcional.
  // 2) Aunque lo leyera, este token lo firma el backend de
  //    KODA_Remaster/sistema-corporativo/backend (JWT_SECRET propio, usuarios en
  //    Supabase), distinto del backend de koda-frontend (SECRET_KEY propio, tabla
  //    Profile). No es intercambiable por un `exchange_code` de koda-frontend: esa
  //    llamada sería rechazada por firma inválida, y no existe un mapeo de identidad
  //    de usuario entre ambos sistemas.
  // Integrar un SSO real entre ambas superficies requiere una decisión de arquitectura
  // cross-team sobre cómo (o si) unificar/mapear identidades entre los dos backends.
  const billingUrl = baseUrl;

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
      </div>

      {/* iframe que ocupa todo el espacio restante */}
      <iframe
        src={billingUrl}
        title="Módulo de Facturación"
        style={{ flex: 1, border: "none", display: "block", width: "100%" }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
