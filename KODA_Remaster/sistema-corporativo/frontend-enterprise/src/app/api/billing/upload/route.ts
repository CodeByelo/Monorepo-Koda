import { NextResponse } from "next/server";

const BACKEND_URL =
  process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "https://monorepo-koda.onrender.com";

// POST /api/billing/upload — recibe el FormData y lo reenvía al backend Python
export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const backendRes = await fetch(`${BACKEND_URL}/billing/upload`, {
      method: "POST",
      body: formData,
    });

    const text = await backendRes.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { detail: "Respuesta inválida del backend", raw: text },
        { status: 502 }
      );
    }

    if (!backendRes.ok) {
      return NextResponse.json(json, { status: backendRes.status });
    }

    // El backend devuelve { items, _debug } — extraemos items y logueamos debug
    const items = Array.isArray(json) ? json : (json.items ?? json);
    if (json._debug) {
      console.log("[billing/upload] headers detectados:", json._debug.headers_raw);
      console.log("[billing/upload] col_map:", json._debug.col_map);
    }

    return NextResponse.json(items, { status: 200 });
  } catch (error) {
    console.error("Billing upload proxy error:", error);
    return NextResponse.json(
      { detail: "Error de conexión con el servicio de facturación" },
      { status: 500 }
    );
  }
}
