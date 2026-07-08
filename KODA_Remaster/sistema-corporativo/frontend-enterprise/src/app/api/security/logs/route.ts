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

async function proxyRequest(endpoint: string, init: RequestInit) {
  const urls = [PRIMARY_URL, FALLBACK_URL].filter((v, i, arr) => arr.indexOf(v) === i);
  let lastErr: unknown = null;

  for (const base of urls) {
    try {
      const response = await fetch(`${base}${endpoint}`, init);
      const text = await response.text();
      const data = parseResponse(text);

      if (init.method === "GET" && response.status >= 500) {
        return NextResponse.json([], { status: 200 });
      }

      return NextResponse.json(data, { status: response.status });
    } catch (error) {
      lastErr = error;
    }
  }

  if (init.method === "GET") {
    return NextResponse.json([], { status: 200 });
  }

  throw lastErr || new Error("No se pudo conectar al backend");
}

export async function GET(request: Request) {
  try {
    return await proxyRequest("/security/logs", {
      method: "GET",
      headers: await backendHeaders(request),
      cache: "no-store",
    });
  } catch (error) {
    console.error("Security logs GET proxy error:", error);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    return await proxyRequest("/security/logs", {
      method: "POST",
      headers: await backendHeaders(request, true),
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch (error) {
    console.error("Security logs POST proxy error:", error);
    return NextResponse.json({ detail: "Error en el proxy de logs" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    return await proxyRequest("/security/logs", {
      method: "DELETE",
      headers: await backendHeaders(request),
      cache: "no-store",
    });
  } catch (error) {
    console.error("Security logs DELETE proxy error:", error);
    return NextResponse.json({ detail: "Error en el proxy de logs" }, { status: 500 });
  }
}
