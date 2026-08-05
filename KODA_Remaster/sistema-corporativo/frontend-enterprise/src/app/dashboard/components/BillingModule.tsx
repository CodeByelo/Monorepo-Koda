"use client";
import React from "react";
import { CreditCard, ExternalLink, Maximize2 } from "lucide-react";

export default function BillingModule({ darkMode }: { darkMode: boolean }) {
  const token = typeof window !== "undefined" ? localStorage.getItem("sgd_token") : null;
  const isProduction = typeof window !== 'undefined' && (
    window.location.hostname.includes('vercel.app') ||
    window.location.hostname.includes('onrender.com') ||
    window.location.hostname.includes('cloudflare')
  );
  const isTailscale = typeof window !== 'undefined' && window.location.hostname.includes('.ts.net');
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  
  let baseUrl = isProduction ? 'https://koda-billing-front.vercel.app' : `http://${host}:5174`;
  if (isTailscale) {
    baseUrl = `https://${host}:8443`;
  }
  const billingUrl = token ? `${baseUrl}?token=${token}` : baseUrl;

  return (
    <iframe
      src={billingUrl}
      title="Módulo de Facturación"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        border: "none",
        display: "block",
      }}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  );
}
