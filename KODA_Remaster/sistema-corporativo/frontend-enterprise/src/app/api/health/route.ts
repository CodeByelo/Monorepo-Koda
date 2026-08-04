import { NextResponse } from "next/server";

const FALLBACK_URL = "https://monorepo-koda.onrender.com";
const PRIMARY_URL =
  process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production" ? FALLBACK_URL : "http://127.0.0.1:8000");

export async function GET() {
  const urls = [PRIMARY_URL, FALLBACK_URL].filter((v, i, arr) => arr.indexOf(v) === i);

  for (const base of urls) {
    try {
      const res = await fetch(`${base}/health/live`, {
        method: "GET",
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        return NextResponse.json({ status: "ok" });
      }
    } catch {
      // continúa con el siguiente
    }
  }

  return NextResponse.json({ status: "unavailable" }, { status: 503 });
}
