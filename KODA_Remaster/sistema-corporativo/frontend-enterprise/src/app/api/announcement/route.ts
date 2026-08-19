import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_BASE_URL =
  process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://monorepo-koda.onrender.com"
    : "http://127.0.0.1:8000");

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

export async function GET(request: Request) {
  try {
    const response = await fetch(`${API_BASE_URL}/announcement`, {
      method: "GET",
      headers: await backendHeaders(request),
      cache: "no-store",
    });
    const text = await response.text();
    return NextResponse.json(parseResponse(text), {
      status: response.status,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    });
  } catch (error) {
    console.error("Announcement GET proxy error:", error);
    return NextResponse.json({ detail: "Error en el proxy de anuncio" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const payload = await request.json();
    const response = await fetch(`${API_BASE_URL}/announcement`, {
      method: "PUT",
      headers: await backendHeaders(request, true),
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const text = await response.text();
    return NextResponse.json(parseResponse(text), {
      status: response.status,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    });
  } catch (error) {
    console.error("Announcement PUT proxy error:", error);
    return NextResponse.json({ detail: "Error en el proxy de anuncio" }, { status: 500 });
  }
}
