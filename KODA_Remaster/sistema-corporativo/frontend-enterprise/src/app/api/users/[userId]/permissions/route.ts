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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const urls = [PRIMARY_URL, FALLBACK_URL].filter((v, i, arr) => arr.indexOf(v) === i);
  const payload = await request.text();
  let lastErr: unknown = null;

  try {
    const { userId } = await params;
    for (const base of urls) {
      try {
        const response = await fetch(`${base}/users/${userId}/permissions`, {
          method: "PATCH",
          headers: await backendHeaders(request, true),
          body: payload,
          cache: "no-store",
        });
        const text = await response.text();
        return NextResponse.json(parseResponse(text), { status: response.status });
      } catch (error) {
        lastErr = error;
      }
    }

    throw lastErr || new Error("No se pudo conectar al backend");
  } catch (error) {
    console.error("User permissions proxy error:", error);
    return NextResponse.json({ detail: "Error en el proxy de permisos de usuario" }, { status: 500 });
  }
}
