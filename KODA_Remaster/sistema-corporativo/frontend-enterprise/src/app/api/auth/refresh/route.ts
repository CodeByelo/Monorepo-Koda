import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_BASE_URL =
  process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://corpoelect-backend.onrender.com"
    : "http://127.0.0.1:8000");

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const refreshToken = body?.refresh_token;

    if (!refreshToken) {
      return NextResponse.json(
        { detail: "refresh_token requerido" },
        { status: 400 },
      );
    }

    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });

    const raw = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = { detail: raw || "Respuesta inválida" };
    }

    if (!response.ok) {
      return NextResponse.json(payload, { status: response.status });
    }

    // Update the HttpOnly session cookie with the new access token
    const newAccessToken = payload?.access_token;
    if (typeof newAccessToken === "string") {
      const cookieStore = await cookies();
      cookieStore.set("session", newAccessToken, {
        httpOnly: true,
        path: "/",
        maxAge: 28800,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    console.error("Refresh token API error:", error);
    return NextResponse.json(
      { detail: "Error renovando sesión" },
      { status: 500 },
    );
  }
}
