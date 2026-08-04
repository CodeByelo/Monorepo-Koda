import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";

const FALLBACK_URL = "https://monorepo-koda.onrender.com";
const PRIMARY_URL =
  process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production" ? FALLBACK_URL : "http://127.0.0.1:8000");

async function backendHeaders(request: Request, isJson = false): Promise<HeadersInit> {
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;
  const auth = request.headers.get("authorization") || (session ? `Bearer ${session}` : null);
  return {
    ...(isJson ? { "Content-Type": "application/json" } : {}),
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

type RouteParams = { params: Promise<{ path: string[] }> };

async function proxyToBackend(
  request: NextRequest,
  method: string,
  subPath: string,
) {
  const urls = [PRIMARY_URL, FALLBACK_URL].filter((v, i, arr) => arr.indexOf(v) === i);
  let lastErr: unknown = null;
  const hasBody = ["POST", "PUT", "PATCH"].includes(method);

  for (const base of urls) {
    try {
      const response = await fetch(`${base}/tickets/${subPath}`, {
        method,
        headers: await backendHeaders(request, hasBody),
        body: hasBody ? await request.text() : undefined,
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

function errorResponse(method: string, error: unknown) {
  console.error(`Tickets ${method} catch-all proxy error:`, error);
  return NextResponse.json({ detail: "Error en el proxy de tickets" }, { status: 500 });
}

export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const { path } = await context.params;
    return await proxyToBackend(request, "GET", path.join("/"));
  } catch (error) {
    return errorResponse("GET", error);
  }
}

export async function PUT(request: NextRequest, context: RouteParams) {
  try {
    const { path } = await context.params;
    return await proxyToBackend(request, "PUT", path.join("/"));
  } catch (error) {
    return errorResponse("PUT", error);
  }
}

export async function PATCH(request: NextRequest, context: RouteParams) {
  try {
    const { path } = await context.params;
    return await proxyToBackend(request, "PATCH", path.join("/"));
  } catch (error) {
    return errorResponse("PATCH", error);
  }
}

export async function DELETE(request: NextRequest, context: RouteParams) {
  try {
    const { path } = await context.params;
    return await proxyToBackend(request, "DELETE", path.join("/"));
  } catch (error) {
    return errorResponse("DELETE", error);
  }
}
