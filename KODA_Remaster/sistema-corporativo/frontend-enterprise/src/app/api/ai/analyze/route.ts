import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const FALLBACK_URL = "https://monorepo-koda.onrender.com";
const PRIMARY_URL =
  process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production" ? FALLBACK_URL : "http://127.0.0.1:8000");

async function backendHeaders(request: Request): Promise<HeadersInit> {
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;
  const auth = request.headers.get("authorization") || (session ? `Bearer ${session}` : null);
  return {
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  };
}

function parseResponse(text: string) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { detail: text || "Respuesta inválida del backend" };
  }
}

export async function POST(request: Request) {
  const urls = [PRIMARY_URL, FALLBACK_URL].filter((v, i, arr) => arr.indexOf(v) === i);
  let lastErr: unknown = null;

  try {
    const body = await request.json();

    for (const base of urls) {
      try {
        const response = await fetch(`${base}/ai/analyze`, {
          method: "POST",
          headers: await backendHeaders(request),
          body: JSON.stringify(body),
        });
        const text = await response.text();
        return NextResponse.json(parseResponse(text), { status: response.status });
      } catch (error) {
        lastErr = error;
      }
    }

    throw lastErr || new Error("No se pudo conectar al backend");
  } catch (error) {
    console.error("AI analyze POST proxy error:", error);
    return NextResponse.json(
      {
        detail:
          "Error en el proxy de análisis de IA. Verifique backend local (127.0.0.1:8000) o NEXT_PUBLIC_API_URL.",
      },
      { status: 500 },
    );
  }
}
