import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_BASE_URL =
  process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://monorepo-koda.onrender.com"
    : "http://127.0.0.1:8000");

function parseApiBody(raw: string, status: number) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { detail: raw || `Error ${status}` };
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 60000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.formData();
    const username = body.get("username");
    const password = body.get("password");

    if (!username || !password) {
      return NextResponse.json(
        { detail: "Credenciales incompletas" },
        { status: 400 },
      );
    }

    const params = new URLSearchParams();
    params.append("username", String(username));
    params.append("password", String(password));

    const reqInit = {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    };

    // Keep login requests server-side to avoid browser CORS failures.
    let response = await fetchWithTimeout(`${API_BASE_URL}/api/login`, reqInit);
    if (response.status === 404) {
      response = await fetchWithTimeout(`${API_BASE_URL}/login`, reqInit);
    }
    if (response.status === 404) {
      response = await fetchWithTimeout(`${API_BASE_URL}/auth/login`, reqInit);
    }

    const raw = await response.text();
    const data = parseApiBody(raw, response.status);

    if (response.ok) {
      const cookieStore = await cookies();
      cookieStore.set("session", data.access_token, {
        httpOnly: true,
        path: "/",
        maxAge: 28800,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });

      return NextResponse.json(data);
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Login API error:", error);
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { detail: "Tiempo de espera agotado en autenticacion" },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { detail: "Error en el servidor de autenticacion" },
      { status: 500 },
    );
  }
}
