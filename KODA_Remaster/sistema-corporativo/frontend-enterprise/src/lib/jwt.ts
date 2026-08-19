/**
 * lib/jwt.ts — Decodificación local de JWT (HS256) sin depender de backends.
 *
 * El JWT de sesión se crea en el backend corporativo (KODA_Remaster) con
 * jose/python-jose usando HS256 + JWT_SECRET. Este módulo lo decodifica
 * localmente en el API route de Next.js para extraer el `sub` (profile_id)
 * sin necesidad de llamar al backend.
 *
 * Variable de entorno requerida en Vercel:
 *   JWT_SECRET = (el mismo valor que usa el backend corporativo)
 */

interface JwtPayload {
  sub: string;
  role?: string;
  tenant_id?: string;
  tenant_name?: string;
  username?: string;
  email?: string;
  exp?: number;
  [key: string]: unknown;
}

/**
 * Decodifica y valida un JWT HS256. Retorna el payload si es válido,
 * o null si el token es inválido/expirado.
 */
export function verifyJwt(token: string): JwtPayload | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error("[JWT] JWT_SECRET no configurada en variables de entorno de Vercel.");
    return null;
  }

  try {
    // JWT = header.payload.signature (Base64url encoded)
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    // 1. Decodificar payload
    const payloadB64 = parts[1];
    const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const payload: JwtPayload = JSON.parse(payloadJson);

    // 2. Verificar expiración
    if (payload.exp) {
      const now = Math.floor(Date.now() / 1000);
      if (now > payload.exp) {
        return null; // Token expirado
      }
    }

    // 3. Verificar firma HMAC-SHA256
    const { createHmac } = require("crypto");
    const signingInput = `${parts[0]}.${parts[1]}`;
    const expectedSig = createHmac("sha256", secret)
      .update(signingInput)
      .digest("base64url");

    // Comparación constante para evitar timing attacks
    const actualSig = parts[2];
    if (expectedSig.length !== actualSig.length) return null;

    let mismatch = 0;
    for (let i = 0; i < expectedSig.length; i++) {
      mismatch |= expectedSig.charCodeAt(i) ^ actualSig.charCodeAt(i);
    }
    if (mismatch !== 0) return null;

    // 4. Validar que tiene sub
    if (!payload.sub) return null;

    return payload;
  } catch (err) {
    console.error("[JWT] Error decodificando token:", err);
    return null;
  }
}
