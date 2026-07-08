import { NextResponse } from "next/server";

const BACKEND_URL =
  process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "https://corpoelect-backend.onrender.com";

// POST /api/billing/export — reenvía JSON al backend y devuelve el Excel como stream
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const backendRes = await fetch(`${BACKEND_URL}/billing/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!backendRes.ok) {
      return NextResponse.json(
        { detail: "Error generando el archivo Excel" },
        { status: backendRes.status }
      );
    }

    const blob = await backendRes.arrayBuffer();

    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=Facturacion_Final.xlsx",
      },
    });
  } catch (error) {
    console.error("Billing export proxy error:", error);
    return NextResponse.json(
      { detail: "Error de conexión con el servicio de facturación" },
      { status: 500 }
    );
  }
}
