import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Configuration — KODA ERP
 * Apunta al servidor de Vite local (npm run dev) en el puerto 5173.
 * Para CI/CD, establecer KODA_BASE_URL en la variable de entorno.
 */
export default defineConfig({
  // Directorio raíz de los tests E2E
  testDir: './tests/e2e',

  // Tiempo máximo por test (30 s)
  timeout: 30_000,

  // Tiempo máximo para las aserciones tipo expect()
  expect: {
    timeout: 8_000,
  },

  // Reportes: lista en consola + HTML guardado en playwright-report/
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],

  // Configuración global para todos los proyectos
  use: {
    // URL base del frontend (se puede sobreescribir con KODA_BASE_URL)
    baseURL: process.env.KODA_BASE_URL || 'http://localhost:5173',

    // Capturar trazas en el primer reintento (para depuración)
    trace: 'on-first-retry',

    // Capturar screenshot solo en fallos
    screenshot: 'only-on-failure',

    // Capturar video solo en fallos
    video: 'on-first-retry',

    // Ignorar errores de certificado SSL en entorno local
    ignoreHTTPSErrors: true,

    // Viewport estándar de escritorio
    viewport: { width: 1280, height: 800 },

    // No mostrar la barra de dirección durante los tests
    headless: true,
  },

  // Navegadores a probar
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],

  // Levantar el servidor de Vite automáticamente antes de los tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,  // En CI siempre levantar uno nuevo
    timeout: 60_000,
  },
});
