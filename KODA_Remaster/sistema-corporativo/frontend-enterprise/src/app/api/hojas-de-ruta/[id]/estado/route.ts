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
    ...(auth ? { Authorization: auth } : {}),
    "Content-Type": "application/json",
  };
}

function parseResponse(text: string) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { detail: text || "Respuesta inválida del backend" };
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const urls = [PRIMARY_URL, FALLBACK_URL].filter((v, i, arr) => arr.indexOf(v) === i);
  let lastErr: unknown = null;

  try {
    const bodyObj = await request.json();
    const bodyStr = JSON.stringify(bodyObj);

    for (const base of urls) {
      try {
        const response = await fetch(`${base}/hojas-de-ruta/${id}/estado`, {
          method: "PUT",
          headers: await backendHeaders(request),
          body: bodyStr,
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
    console.error("Hojas de ruta PUT estado proxy error:", error);
    return NextResponse.json({ detail: "Error en el proxy de hojas de ruta" }, { status: 500 });
  }
}
