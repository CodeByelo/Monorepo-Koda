import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Proxy BFF hacia GET /auth/koda-frontend/exchange-code del backend
// (KODA_Remaster/sistema-corporativo/backend). Consumido por
// BillingModule.tsx antes de renderizar el iframe del Módulo de
// Facturación: pide un exchange_code de un solo uso a nombre del usuario
// ya autenticado en ESTA sesión (cookie "session" / Authorization Bearer),
// para poder canjearlo en koda-frontend (el ERP) vía
// `?exchange_code=...`. Mismo patrón de proxy que
// src/app/api/announcement/route.ts.
const API_BASE_URL =
  process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://monorepo-koda.onrender.com"
    : "http://127.0.0.1:8000");

function parseResponse(text: string) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { detail: text || "Respuesta inválida del backend" };
  }
}

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const authHeader = request.headers.get("authorization");
    const headerToken =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : "";
    const cookieToken = cookieStore.get("session")?.value || "";
    const session = headerToken || cookieToken;

    if (!session) {
      return NextResponse.json({ detail: "No autenticado." }, { status: 401 });
    }

    const response = await fetch(`${API_BASE_URL}/auth/koda-frontend/exchange-code`, {
      method: "GET",
      headers: { Authorization: `Bearer ${session}` },
      cache: "no-store",
    });

    const text = await response.text();
    return NextResponse.json(parseResponse(text), {
      status: response.status,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    });
  } catch (error) {
    console.error("SSO bridge exchange-code proxy error:", error);
    return NextResponse.json(
      { detail: "No se pudo verificar tu acceso al Módulo de Facturación." },
      { status: 500 },
    );
  }
}
