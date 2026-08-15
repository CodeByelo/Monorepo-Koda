// Sentry (monitoreo de errores) — runtime Edge (middleware).
// Desactivado por defecto: sólo se inicializa si NEXT_PUBLIC_SENTRY_DSN está
// definida. Vacío = no-op silencioso, sin warnings.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
  });
}
