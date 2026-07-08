import { test, expect } from '@playwright/test';

/**
 * KODA ERP — Suite de Pruebas E2E: Login y Facturación
 *
 * Este test simula el flujo completo de un usuario real:
 * 1. Navegar a la aplicación y ver la pantalla de Login.
 * 2. Iniciar sesión con credenciales válidas.
 * 3. Verificar que el dashboard principal carga correctamente.
 * 4. Navegar al módulo de Facturación.
 * 5. Verificar que los elementos de UI cargan sin errores de consola críticos.
 *
 * CREDENCIALES DE PRUEBA:
 *   Las credenciales se leen desde variables de entorno para no hardcodearlas:
 *   - E2E_USER_EMAIL     (default: admin@koda.com)
 *   - E2E_USER_PASSWORD  (default: Admin1234!)
 *
 * NOTA: Asegúrate de que el backend esté corriendo antes de ejecutar este test.
 *   npm run dev  (frontend: localhost:5173)
 *   Backend: http://localhost:8000 o configurado en KODA_BASE_URL
 */

const TEST_EMAIL    = process.env.E2E_USER_EMAIL    ?? 'admin@koda.com';
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'Admin1234!';

test.describe('KODA ERP — Autenticación y Facturación E2E', () => {

  // Colectar errores de consola que no sean advertencias menores
  let consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];

    // Escuchar errores de consola del navegador
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Interceptar errores de red no controlados
    page.on('pageerror', (err) => {
      consoleErrors.push(`[PAGE ERROR] ${err.message}`);
    });
  });

  // ── Test 1: La pantalla de Login carga correctamente ─────────────────────
  test('1. Pantalla de Login: estructura y elementos visibles', async ({ page }) => {
    await page.goto('/');

    // Esperar que el formulario de login aparezca (redirige si no autenticado)
    const loginForm = page.locator('form');
    await expect(loginForm).toBeVisible({ timeout: 10_000 });

    // Verificar que existan los campos requeridos
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitButton = page.locator('button[type="submit"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitButton).toBeVisible();

    // Verificar texto del branding
    await expect(page.locator('text=Bienvenido')).toBeVisible();
    await expect(page.locator('text=KODA ERP')).toBeVisible();

    // No debe haber errores de consola críticos en la carga inicial
    const criticalErrors = consoleErrors.filter(e =>
      !e.includes('favicon') && !e.includes('net::ERR_')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  // ── Test 2: Login exitoso con credenciales válidas ────────────────────────
  test('2. Login: inicio de sesión exitoso con credenciales válidas', async ({ page }) => {
    await page.goto('/');

    // Completar el formulario
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').click();

    // Verificar que la URL ya no es la de login y que el dashboard cargó
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });

    // Verificar que algún elemento del MainLayout esté visible (sidebar o header)
    const appContainer = page.locator('nav, aside, [data-testid="sidebar"]').first();
    await expect(appContainer).toBeVisible({ timeout: 10_000 });

    // El token debe estar almacenado en localStorage
    const token = await page.evaluate(() => localStorage.getItem('koda_token'));
    expect(token).not.toBeNull();
    expect(token!.length).toBeGreaterThan(10);
  });

  // ── Test 3: Navegación al módulo de Facturación ───────────────────────────
  test('3. Facturación: navegar al módulo y verificar carga', async ({ page }) => {
    // Iniciar sesión primero
    await page.goto('/');
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });

    // Navegar directamente al módulo de Facturación
    await page.goto('/facturacion');

    // Esperar que la página de Facturación cargue (título o heading)
    await expect(
      page.locator('h1, h2, [class*="text-slate-800"]').filter({ hasText: /factura/i }).first()
    ).toBeVisible({ timeout: 12_000 });

    // Verificar que no hay errores de consola relacionados con la carga de datos
    const criticalErrors = consoleErrors.filter(e =>
      e.toLowerCase().includes('uncaught') ||
      e.toLowerCase().includes('typeerror') ||
      e.toLowerCase().includes('referenceerror')
    );

    // Reportar errores (sin fallar el test por errores de red a APIs)
    if (criticalErrors.length > 0) {
      console.warn('[E2E WARNING] Errores de consola detectados:', criticalErrors);
    }
    expect(criticalErrors).toHaveLength(0);
  });

  // ── Test 4: Login fallido con credenciales incorrectas ───────────────────
  test('4. Login: muestra mensaje de error con credenciales incorrectas', async ({ page }) => {
    await page.goto('/');

    await page.locator('input[type="email"]').fill('noexiste@koda.com');
    await page.locator('input[type="password"]').fill('contrasenaMala123');
    await page.locator('button[type="submit"]').click();

    // Debe aparecer un mensaje de error visible
    const errorMessage = page.locator('text=/error|incorrecto|incorrectas|bloqueado/i').first();
    await expect(errorMessage).toBeVisible({ timeout: 8_000 });

    // El usuario NO debe ser redirigido — debe permanecer en la pantalla de login
    const form = page.locator('form');
    await expect(form).toBeVisible();
  });

  // ── Test 5: Sesión persiste al recargar página ────────────────────────────
  test('5. Sesión: el token persiste en localStorage tras recarga', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });

    // Verificar token en localStorage
    const tokenBefore = await page.evaluate(() => localStorage.getItem('koda_token'));
    expect(tokenBefore).not.toBeNull();

    // Recargar la página
    await page.reload();
    await page.waitForLoadState('networkidle');

    // El usuario debe seguir autenticado (formulario de login NO debe aparecer)
    const loginForm = page.locator('input[type="email"]');
    await expect(loginForm).not.toBeVisible({ timeout: 5_000 });

    // Token debe seguir presente
    const tokenAfter = await page.evaluate(() => localStorage.getItem('koda_token'));
    expect(tokenAfter).toEqual(tokenBefore);
  });

});
