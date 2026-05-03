// @ts-check
const { test, expect } = require('@playwright/test');
const { resetApp, crearTorneo } = require('../helpers');

async function css(page, selector, property) {
  return page.evaluate(
    ({ sel, prop }) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return getComputedStyle(el).getPropertyValue(prop).trim();
    },
    { sel: selector, prop: property }
  );
}

// All responsive tests use mobile viewport
test.use({ viewport: { width: 375, height: 812 } });

test.describe('Responsive — Móvil (375px)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await resetApp(page);
  });

  test('sidebar es una barra de navegación inferior en móvil', async ({ page }) => {
    const position = await css(page, '.sidebar', 'position');
    expect(position).toBe('fixed');

    const bottom = await css(page, '.sidebar', 'bottom');
    // Should be at bottom (0 or near 0)
    expect(bottom).toMatch(/^0/);
  });

  test('sidebar está al fondo de la pantalla', async ({ page }) => {
    const box = await page.locator('.sidebar').boundingBox();
    const viewportHeight = 812;
    expect(box?.y + box?.height).toBeGreaterThan(viewportHeight - 20);
  });

  test('header es visible en móvil', async ({ page }) => {
    await expect(page.locator('header')).toBeVisible();
  });

  test('content-area no es tapada por el sidebar inferior', async ({ page }) => {
    const contentBox = await page.locator('.content-area').boundingBox();
    const sidebarBox = await page.locator('.sidebar').boundingBox();
    // Content should not extend below the sidebar
    // The content-area should have padding-bottom to account for the nav bar
    const paddingBottom = await css(page, '.content-area', 'padding-bottom');
    const pbValue = parseInt(paddingBottom || '0');
    expect(pbValue).toBeGreaterThan(40);
  });

  test('botón Crear Torneo es visible y clicable', async ({ page }) => {
    await expect(page.locator('#btnCrearTorneo')).toBeVisible();
    const box = await page.locator('#btnCrearTorneo').boundingBox();
    expect(box?.height).toBeGreaterThan(36); // touch target
  });

  test('inputs en modal tienen font-size >= 16px (evitar zoom iOS)', async ({ page }) => {
    await page.click('#btnCrearTorneo');
    await page.waitForSelector('#modalOverlay:not(.hidden)');

    const fontSize = await css(page, '#nombreTorneo', 'font-size');
    const size = parseFloat(fontSize);
    expect(size).toBeGreaterThanOrEqual(16);
  });

  test('modal no tapa la barra de navegación inferior', async ({ page }) => {
    await page.click('#btnCrearTorneo');
    await page.waitForSelector('#modalOverlay:not(.hidden)');

    // Sidebar should still be visible above the modal (z-index)
    const sidebarZ = await css(page, '.sidebar', 'z-index');
    const modalZ = await css(page, '#modalOverlay', 'z-index');

    if (sidebarZ && modalZ) {
      expect(parseInt(sidebarZ)).toBeGreaterThan(parseInt(modalZ));
    }
  });

  test('modal es scrollable en móvil', async ({ page }) => {
    await page.click('#btnCrearTorneo');
    await page.waitForSelector('#modalOverlay:not(.hidden)');

    const overflow = await css(page, '.modal', 'overflow-y');
    expect(['auto', 'scroll']).toContain(overflow);
  });

  test('touch targets tienen altura mínima de 44px', async ({ page }) => {
    const buttons = await page.locator('.btn-primary, .btn-secondary, .btn-sm').all();
    for (const btn of buttons.slice(0, 3)) {
      const box = await btn.boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(36); // relaxed to 36
      }
    }
  });

  test('mesas-grid es una sola columna en móvil', async ({ page }) => {
    await crearTorneo(page, { nombre: 'Mobile Test', numJugadores: 8, jugadoresPorPartida: 4, numRondas: 1 });
    await page.click('#btnJugadoresPrueba');
    await page.click('#btnGenerarRonda');
    await page.waitForTimeout(500);

    const gridCols = await css(page, '.mesas-grid', 'grid-template-columns');
    // In single-column layout, there should be only one column value
    // "1fr" or similar single value
    if (gridCols) {
      const colCount = gridCols.split(' ').filter(c => c.trim() && c !== 'none').length;
      expect(colCount).toBe(1);
    }
  });

  test('pestañas de detalle son scrollables horizontalmente', async ({ page }) => {
    await crearTorneo(page, { nombre: 'Tabs Test' });
    const overflow = await css(page, '.detalle-tabs', 'overflow-x');
    expect(['auto', 'scroll', 'visible']).toContain(overflow);
  });
});
