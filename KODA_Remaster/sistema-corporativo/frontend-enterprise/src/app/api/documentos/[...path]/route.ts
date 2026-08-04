import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";

const FALLBACK_URL = "https://monorepo-koda.onrender.com";
const PRIMARY_URL =
  process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production" ? FALLBACK_URL : "http://127.0.0.1:8000");

async function backendHeaders(request: Request): Promise<HeadersInit> {
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;
  const auth = request.headers.get("authorization") || (session ? `Bearer ${session}` : null);
  const ct = request.headers.get("content-type");
  return {
    ...(ct && !ct.includes("multipart") ? { "Content-Type": ct } : {}),
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

  // For multipart/form-data (file uploads), pass the raw body and let the
  // browser-set Content-Type with boundary propagate through.
  const ct = request.headers.get("content-type") || "";
  const isMultipart = ct.includes("multipart");

  for (const base of urls) {
    try {
      const fetchHeaders: HeadersInit = await backendHeaders(request);
      let body: BodyInit | undefined;

      if (hasBody) {
        if (isMultipart) {
          // Stream the raw body bytes and pass the original Content-Type header
          // with boundary so the backend can parse the multipart form correctly.
          body = await request.arrayBuffer();
          (fetchHeaders as Record<string, string>)["Content-Type"] = ct;
        } else {
          body = await request.text();
          (fetchHeaders as Record<string, string>)["Content-Type"] = "application/json";
        }
      }

      const response = await fetch(`${base}/documentos/${subPath}`, {
        method,
        headers: fetchHeaders,
        body: hasBody ? body : undefined,
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
  console.error(`Documentos ${method} catch-all proxy error:`, error);
  return NextResponse.json({ detail: "Error en el proxy de documentos" }, { status: 500 });
}

export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const { path } = await context.params;
    return await proxyToBackend(request, "GET", path.join("/"));
  } catch (error) {
    return errorResponse("GET", error);
  }
}

export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const { path } = await context.params;
    return await proxyToBackend(request, "POST", path.join("/"));
  } catch (error) {
    return errorResponse("POST", error);
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
