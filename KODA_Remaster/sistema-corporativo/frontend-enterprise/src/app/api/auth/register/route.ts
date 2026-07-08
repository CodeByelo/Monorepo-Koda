import { NextResponse } from "next/server";

const API_BASE_URL =
  process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://corpoelect-backend.onrender.com"
    : "http://127.0.0.1:8000");

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    let response = await fetch(`${API_BASE_URL}/api/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    // Compatibilidad con backends que puedan exponer /register
    if (response.status === 404) {
      response = await fetch(`${API_BASE_URL}/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    }

    const text = await response.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { detail: text || "Respuesta invalida del backend" };
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Register API error:", error);
    return NextResponse.json(
      { detail: "Error en el servidor de registro" },
      { status: 500 },
    );
  }
}


