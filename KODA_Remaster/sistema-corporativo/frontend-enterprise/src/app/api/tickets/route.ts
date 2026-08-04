import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const FALLBACK_URL = "https://corpoelect-backend.onrender.com";
const PRIMARY_URL =
  process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production" ? FALLBACK_URL : "http://127.0.0.1:8000");

async function backendHeaders(request: Request, contentTypeJson = false): Promise<HeadersInit> {
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;
  const auth = request.headers.get("authorization") || (session ? `Bearer ${session}` : null);
  return {
    ...(contentTypeJson ? { "Content-Type": "application/json" } : {}),
    ...(auth ? { Authorization: auth } : {}),
  };
}

function parseResponse(text: string) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { detail: text || "Respuesta invalida del backend" };
  }
}

async function proxyToBackend(request: Request, method: "GET" | "POST") {
  const urls = [PRIMARY_URL, FALLBACK_URL].filter((v, i, arr) => arr.indexOf(v) === i);
  let lastErr: unknown = null;

  for (const base of urls) {
    try {
      const response = await fetch(`${base}/tickets`, {
        method,
        headers: await backendHeaders(request, method !== "GET"),
        body: method === "GET" ? undefined : await request.text(),
        cache: "no-store",
      });
      const text = await response.text();
      return NextResponse.json(parseResponse(text), { status: response.status });
    } catch (error) {
      lastErr = error;
    }
  }

  throw lastErr || new Error("No se pudo conectar al backend");
}

export async function GET(request: Request) {
  try {
    return await proxyToBackend(request, "GET");
  } catch (error) {
    console.error("Tickets GET proxy error:", error);
    return NextResponse.json({ detail: "Error en el proxy de tickets" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    return await proxyToBackend(request, "POST");
  } catch (error) {
    console.error("Tickets POST proxy error:", error);
    return NextResponse.json({ detail: "Error en el proxy de tickets" }, { status: 500 });
  }
}
