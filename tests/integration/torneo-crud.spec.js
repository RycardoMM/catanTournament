// @ts-check
const { test, expect } = require('@playwright/test');
const { resetApp, crearTorneo, rellenarJugadoresPrueba, JUGADORES_PRUEBA } = require('../helpers');

test.describe('Integración — Crear y eliminar torneos', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await resetApp(page);
  });

  test('muestra estado vacío si no hay torneos', async ({ page }) => {
    await expect(page.locator('#listaTorneos .empty-state')).toBeVisible();
    await expect(page.locator('#listaTorneos .empty-state')).toContainText('No hay torneos');
  });

  test('botón Crear Torneo abre el modal', async ({ page }) => {
    await page.click('#btnCrearTorneo');
    await expect(page.locator('#modalOverlay')).not.toHaveClass(/hidden/);
    await expect(page.locator('#modalOverlay h2')).toContainText('Crear Torneo');
  });

  test('cerrar modal con X no crea torneo', async ({ page }) => {
    await page.click('#btnCrearTorneo');
    await page.click('#btnCerrarModal');
    await expect(page.locator('#modalOverlay')).toHaveClass(/hidden/);
    await expect(page.locator('#listaTorneos .empty-state')).toBeVisible();
  });

  test('crear torneo navega a vista detalle', async ({ page }) => {
    await crearTorneo(page, { nombre: 'Liga Primavera' });
    await expect(page.locator('#vistaDetalle')).not.toHaveClass(/hidden/);
    await expect(page.locator('#detalleName')).toContainText('Liga Primavera');
  });

  test('torneo creado aparece en la lista al volver', async ({ page }) => {
    await crearTorneo(page, { nombre: 'Copa Verano' });
    await page.click('#btnVolver');
    await expect(page.locator('#vistaInicio')).not.toHaveClass(/hidden/);
    await expect(page.locator('.torneo-card h4')).toContainText('Copa Verano');
  });

  test('badge muestra estado del torneo', async ({ page }) => {
    await crearTorneo(page);
    const badge = page.locator('#detalleBadge');
    await expect(badge).toBeVisible();
    const text = await badge.textContent();
    expect(text?.length).toBeGreaterThan(0);
  });

  test('meta-info muestra número de jugadores y rondas', async ({ page }) => {
    await crearTorneo(page, { nombre: 'Test Meta', numJugadores: 8, numRondas: 3 });
    const meta = await page.locator('#detalleMeta').textContent();
    expect(meta).toContain('8');
    expect(meta).toContain('3');
  });

  test('eliminar torneo lo quita de la lista', async ({ page }) => {
    await crearTorneo(page, { nombre: 'Para Borrar' });
    await page.click('#btnVolver');
    await expect(page.locator('.torneo-card h4')).toContainText('Para Borrar');

    // Click delete and confirm
    await page.click('.btn-delete-torneo');
    await page.waitForSelector('#modalConfirm:not(.hidden)');
    await page.click('#btnConfirmOk');
    await page.waitForTimeout(300);

    // Only check the tournament list's empty state (not other empty states on page)
    await expect(page.locator('#listaTorneos .empty-state')).toBeVisible();
  });

  test('validación: no permite crear torneo sin nombre', async ({ page }) => {
    await page.click('#btnCrearTorneo');
    await page.fill('#numJugadores', '8');
    await page.fill('#numRondas', '2');
    await page.click('#formTorneo button[type="submit"]');
    // Modal should still be visible
    await expect(page.locator('#modalOverlay')).not.toHaveClass(/hidden/);
  });

  test('validación: no permite menos de 4 jugadores', async ({ page }) => {
    await page.click('#btnCrearTorneo');
    await page.fill('#nombreTorneo', 'Test');
    await page.fill('#numJugadores', '2');
    await page.fill('#numRondas', '2');
    await page.click('#formTorneo button[type="submit"]');
    await expect(page.locator('#modalOverlay')).not.toHaveClass(/hidden/);
  });

  test('persistencia: torneo sobrevive a recarga de página', async ({ page }) => {
    await crearTorneo(page, { nombre: 'Persistente' });
    await page.click('#btnVolver');
    await page.reload();
    await page.waitForSelector('#listaTorneos');
    await expect(page.locator('.torneo-card h4')).toContainText('Persistente');
  });
});
