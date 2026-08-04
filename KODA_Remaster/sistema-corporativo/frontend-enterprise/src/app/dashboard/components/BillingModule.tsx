"use client";
import React from "react";
import { CreditCard, ExternalLink, Maximize2 } from "lucide-react";

export default function BillingModule({ darkMode }: { darkMode: boolean }) {
  const token = typeof window !== "undefined" ? localStorage.getItem("sgd_token") : null;
  const isCloudflare = typeof window !== 'undefined' && window.location.hostname.includes('cloudflare');
  const isTailscale = typeof window !== 'undefined' && window.location.hostname.includes('.ts.net');
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  
  let baseUrl = `http://${host}:5174`;
  if (isCloudflare) {
    baseUrl = '/facturacion/';
  } else if (isTailscale) {
    baseUrl = `https://${host}:8443`;
  }
  const billingUrl = token ? `${baseUrl}?token=${token}` : baseUrl;

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
