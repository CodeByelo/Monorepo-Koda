/**
 * lib/db.ts — Conexión directa a PostgreSQL (Supabase) desde API routes de Next.js.
 *
 * Usa @neondatabase/serverless que ya está en package.json. Este driver
 * usa WebSocket bajo el capó, lo cual es IDEAL para funciones serverless
 * de Vercel (sin necesidad de pgbouncer, sin connection pooling issues).
 *
 * Variable de entorno requerida en Vercel:
 *   DATABASE_URL = postgresql://postgres.xxx:password@aws-0-...pooler.supabase.com:6543/postgres
 *
 * IMPORTANTE: Usar la URL del "Transaction pooler" de Supabase (puerto 6543),
 * NO la conexión directa (puerto 5432). La de pooler soporta conexiones
 * efímeras de serverless.
 */
import { neon } from "@neondatabase/serverless";

let _cachedSql: ReturnType<typeof neon> | null = null;

export function getSQL() {
  if (_cachedSql) return _cachedSql;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL no configurada en las variables de entorno de Vercel. " +
      "Debe ser la URL del Transaction Pooler de Supabase (puerto 6543)."
    );
  }

  _cachedSql = neon(url);
  return _cachedSql;
}
