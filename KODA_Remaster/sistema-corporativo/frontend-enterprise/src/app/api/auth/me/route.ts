import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_BASE_URL =
  process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://corpoelect-backend.onrender.com"
    : "http://127.0.0.1:8000");

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
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const response = await fetch(`${API_BASE_URL}/auth/validate`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session}`,
      },
      cache: "no-store",
    });

    const raw = await response.text();
    let payload: any = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = { detail: raw || "Respuesta inválida" };
    }

    if (!response.ok) {
      return NextResponse.json(
        { authenticated: false, detail: payload?.detail || "Sesión inválida" },
        { status: response.status },
      );
    }

    const nextResponse = NextResponse.json(payload, { status: 200 });

    if (headerToken && headerToken !== cookieToken) {
      nextResponse.cookies.set("session", headerToken, {
        httpOnly: true,
        path: "/",
        maxAge: 28800,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }

    return nextResponse;
  } catch (error) {
    console.error("Auth me API error:", error);
    return NextResponse.json(
      { authenticated: false, detail: "Error validando sesión" },
      { status: 500 },
    );
  }
}
