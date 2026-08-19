import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// API Route: GET /api/auth/koda-frontend/exchange-code
// ─────────────────────────────────────────────────────────────────────────────
// ANTES: este endpoint era un proxy HTTP que encadenaba 3 servicios:
//   Browser → Next.js API → Backend Corporativo (Render) → Backend ERP (Render)
// Cualquier cold start de Render (30-60s) mataba la cadena completa porque el
// timeout era de 5s. Resultado: error "No se pudo verificar tu acceso" DIARIO.
//
// AHORA: acceso DIRECTO a la base de datos compartida (Supabase PostgreSQL).
// Ambos backends (corporativo y ERP) comparten la misma DB física, así que
// este API route puede:
//   1. Decodificar el JWT de la sesión localmente (sin llamar al backend)
//   2. Verificar que el usuario existe y está activo en `profiles`
//   3. Insertar el exchange_code directamente en la tabla `exchange_codes`
// Esto elimina TODA dependencia de backends de Render para esta operación.
//
// FALLBACK: Si la conexión directa a DB falla (ej: DATABASE_URL no configurada),
// se intenta el método original (proxy HTTP) como último recurso.
// ─────────────────────────────────────────────────────────────────────────────

import { getSQL } from "@/lib/db";
import { verifyJwt } from "@/lib/jwt";

const EXCHANGE_CODE_TTL_SECONDS = 120; // Mismo TTL que koda-frontend/backend

// ── Fallback: Proxy HTTP original (por si la DB directa no está configurada) ──
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

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000; // 2s, 4s, 8s (exponential backoff)

async function fallbackProxyMethod(session: string): Promise<NextResponse> {
  let lastError: any = null;
  let lastStatus = 502;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);

    try {
      // En reintentos, enviar un ping de warm-up al backend para ayudarlo a despertar
      if (attempt > 0) {
        console.log(`[exchange-code] Reintento ${attempt}/${MAX_RETRIES} tras cold start...`);
        try {
          await fetch(`${API_BASE_URL}/health`, {
            method: "GET",
            cache: "no-store",
            signal: AbortSignal.timeout(10000),
          });
        } catch {
          // El ping puede fallar; no importa, el objetivo es despertar Render
        }
        // Esperar con backoff exponencial antes de reintentar
        await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1)));
      }

      const response = await fetch(`${API_BASE_URL}/auth/koda-frontend/exchange-code`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session}` },
        cache: "no-store",
        signal: controller.signal,
      });

      // Si la respuesta es exitosa o es un error del cliente (4xx), devolver inmediatamente
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        const text = await response.text();
        return NextResponse.json(parseResponse(text), {
          status: response.status,
          headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
        });
      }

      // 502/503/504 = probable cold start de Render → reintentar
      lastStatus = response.status;
      lastError = new Error(`Backend responded with ${response.status}`);
      console.warn(`[exchange-code] Backend respondió ${response.status} (intento ${attempt + 1}/${MAX_RETRIES + 1})`);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return NextResponse.json(
          { detail: "El servidor de autenticación tardó demasiado en responder. Intenta nuevamente." },
          { status: 504 },
        );
      }
      lastError = err;
      console.warn(`[exchange-code] Error de red (intento ${attempt + 1}/${MAX_RETRIES + 1}):`, err?.message);
    } finally {
      clearTimeout(timer);
    }
  }

  // Todos los reintentos agotados
  console.error(`[exchange-code] Todos los reintentos agotados. Último error:`, lastError);
  return NextResponse.json(
    { detail: "El servidor de autenticación no está disponible en este momento. Por favor intenta en unos minutos." },
    { status: lastStatus, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  try {
    // 1. Extraer token de sesión (cookie httpOnly o header Authorization)
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

    // 2. Intentar el método DIRECTO a DB (sin depender de backends de Render)
    const canUseDirect = process.env.DATABASE_URL && process.env.JWT_SECRET;

    if (canUseDirect) {
      try {
        return await directDbMethod(session);
      } catch (directErr) {
        console.error("[exchange-code] Método directo falló, intentando fallback HTTP:", directErr);
        // Caer al fallback HTTP si la DB directa falla
      }
    }

    // 3. Fallback: método proxy HTTP original (con timeout mejorado)
    return await fallbackProxyMethod(session);
  } catch (error) {
    console.error("SSO bridge exchange-code error:", error);
    return NextResponse.json(
      { detail: "No se pudo verificar tu acceso al Módulo de Facturación." },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Método DIRECTO: JWT local + INSERT en DB compartida
// ─────────────────────────────────────────────────────────────────────────────
async function directDbMethod(session: string): Promise<NextResponse> {
  // 1. Decodificar JWT localmente
  const payload = verifyJwt(session);
  if (!payload || !payload.sub) {
    return NextResponse.json(
      { detail: "Sesión inválida o expirada." },
      { status: 401 },
    );
  }

  const profileId = payload.sub;
  const sql = getSQL();

  // 2. Verificar que el usuario existe y está activo en la tabla profiles
  const users = (await sql`
    SELECT id, estado, tenant_id
    FROM profiles
    WHERE id = ${profileId}::uuid
    LIMIT 1
  `) as unknown as Array<{ id: string; estado: boolean | number; tenant_id: string }>;

  if (!users || users.length === 0) {
    return NextResponse.json(
      { detail: "Este usuario no tiene una cuenta provisionada en el ERP (Módulo de Facturación)." },
      { status: 404 },
    );
  }

  const user = users[0];

  // Nota: `estado` puede ser BOOLEAN (TRUE/FALSE) o INTEGER (1/0).
  // Ambos evalúan correctamente con `!user.estado`.
  if (!user.estado) {
    return NextResponse.json(
      { detail: "La cuenta de este usuario en el ERP se encuentra inactiva." },
      { status: 404 },
    );
  }

  if (!user.tenant_id) {
    return NextResponse.json(
      { detail: "Este usuario no tiene una empresa (tenant) asociada en el ERP." },
      { status: 404 },
    );
  }

  // 3. Verificar que el tenant existe
  const tenants = (await sql`
    SELECT id FROM organizations
    WHERE id = ${user.tenant_id}::uuid
    LIMIT 1
  `) as unknown as Array<{ id: string }>;

  if (!tenants || tenants.length === 0) {
    return NextResponse.json(
      { detail: "La empresa asociada a este usuario no existe en el ERP." },
      { status: 404 },
    );
  }

  // 4. Crear la tabla exchange_codes si no existe (idempotente)
  await sql`
    CREATE TABLE IF NOT EXISTS exchange_codes (
      code VARCHAR(64) PRIMARY KEY,
      user_id UUID NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // 5. Limpiar códigos expirados (limpieza oportunista)
  await sql`
    DELETE FROM exchange_codes WHERE used = TRUE OR expires_at < NOW()
  `;

  // 6. Generar e insertar el exchange_code
  const code = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + EXCHANGE_CODE_TTL_SECONDS * 1000).toISOString();

  await sql`
    INSERT INTO exchange_codes (code, user_id, expires_at, used)
    VALUES (${code}, ${profileId}::uuid, ${expiresAt}::timestamptz, FALSE)
  `;

  return NextResponse.json(
    { exchange_code: code },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } },
  );
}
