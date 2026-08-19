const EXCHANGE_CODE_ENDPOINT = "/api/auth/koda-frontend/exchange-code";
const RETRY_DELAYS_MS = [0, 2000, 5000];

export class BillingBridgeError extends Error {}

export function getBillingBaseUrl(): string {
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
  const isProduction =
    host.includes("vercel.app") || host.includes("onrender.com") || host.includes("cloudflare");
  const billingProdUrl = process.env.NEXT_PUBLIC_BILLING_URL || "https://koda-billing-front.vercel.app";
  let baseUrl = isProduction ? billingProdUrl : `http://${host}:5174`;
  if (host.includes(".ts.net")) {
    baseUrl = `https://${host}:8443`;
  }
  return baseUrl;
}

// Único punto que solicita el exchange_code (TTL de 120s en el backend), con
// reintentos/backoff para tolerar cold starts. Debe invocarse en el momento
// en que se necesita el código, nunca de forma anticipada, o el código puede
// expirar antes de usarse.
export async function fetchBillingExchangeCode(): Promise<string> {
  let lastMessage = "No se pudo conectar con el Módulo de Facturación. Intenta nuevamente.";

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }

    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("sgd_token") || localStorage.getItem("koda_token")
          : null;

      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(EXCHANGE_CODE_ENDPOINT, {
        method: "GET",
        headers,
        credentials: "include",
      });
      const body = await res.json().catch(() => ({} as any));

      if (res.ok && body?.exchange_code) {
        return body.exchange_code as string;
      }

      if (res.status === 401) {
        throw new BillingBridgeError(
          "Tu sesión ha expirado. Recarga la página e inicia sesión nuevamente.",
        );
      }
      if (res.status === 404) {
        throw new BillingBridgeError(
          body?.detail || "Tu empresa no tiene el Módulo de Facturación activado. Contacta a soporte.",
        );
      }

      lastMessage = body?.detail || lastMessage;
    } catch (e) {
      if (e instanceof BillingBridgeError) throw e;
      lastMessage = "Error de conexión al verificar tu acceso al Módulo de Facturación.";
    }
  }

  throw new BillingBridgeError(lastMessage);
}

export async function fetchBillingUrl(): Promise<string> {
  const code = await fetchBillingExchangeCode();
  return `${getBillingBaseUrl()}?exchange_code=${encodeURIComponent(code)}`;
}
