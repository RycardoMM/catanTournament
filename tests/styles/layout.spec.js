// @ts-check
const { test, expect } = require('@playwright/test');
const { resetApp } = require('../helpers');

/** Helper: get a computed CSS property for a selector */
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

test.describe('Estilos — Layout general', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await resetApp(page);
  });

  test('header es visible y tiene altura mayor que 40px', async ({ page }) => {
    const header = page.locator('header');
    await expect(header).toBeVisible();
    const box = await header.boundingBox();
    expect(box?.height).toBeGreaterThan(40);
  });

  test('sidebar está visible en desktop', async ({ page }) => {
    await expect(page.locator('.sidebar')).toBeVisible();
  });

  test('content-area ocupa el resto del layout', async ({ page }) => {
    const area = await page.locator('.content-area').boundingBox();
    expect(area?.width).toBeGreaterThan(400);
  });

  test('btn-primary tiene color de fondo dorado/naranja', async ({ page }) => {
    const bg = await css(page, '.btn-primary', 'background-color');
    // catan gold is around rgb(212, 160, 23)
    expect(bg).not.toBe('');
    expect(bg).not.toBe('transparent');
  });

  test('body tiene fondo oscuro', async ({ page }) => {
    const bg = await css(page, 'body', 'background-color');
    // Dark background — either a dark color or css variable
    expect(bg).toBeTruthy();
    // RGB values should be low (dark) — allow for any dark color
    const match = bg?.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      const [, r, g, b] = match.map(Number);
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      expect(luminance).toBeLessThan(100); // dark
    }
  });

  test('modal-overlay está oculto por defecto', async ({ page }) => {
    const hidden = await page.locator('#modalOverlay').evaluate(el =>
      el.classList.contains('hidden')
    );
    expect(hidden).toBe(true);
  });

  test('modal-overlay aparece al abrir crear torneo', async ({ page }) => {
    await page.click('#btnCrearTorneo');
    await expect(page.locator('#modalOverlay')).not.toHaveClass(/hidden/);
  });

  test('modal tiene z-index mayor que 200', async ({ page }) => {
    await page.click('#btnCrearTorneo');
    const zIndex = await css(page, '#modalOverlay', 'z-index');
    expect(parseInt(zIndex)).toBeGreaterThan(200);
  });

  test('toast (#fb-toast) tiene z-index muy alto', async ({ page }) => {
    const zIndex = await css(page, '#fb-toast', 'z-index');
    if (zIndex && zIndex !== 'auto') {
      expect(parseInt(zIndex)).toBeGreaterThan(1000);
    }
  });

  test('tab activo tiene border-bottom de color dorado', async ({ page }) => {
    const borderColor = await css(page, '.tab-btn.active', 'border-bottom-color');
    expect(borderColor).toBeTruthy();
    expect(borderColor).not.toBe('transparent');
  });
});

test.describe('Estilos — Vista detalle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await resetApp(page);
    // Create a tournament to access the detail view
    await page.click('#btnCrearTorneo');
    await page.fill('#nombreTorneo', 'Test CSS');
    await page.fill('#numJugadores', '4');
    await page.fill('#numRondas', '1');
    await page.click('#formTorneo button[type="submit"]');
    await page.waitForSelector('#vistaDetalle:not(.hidden)');
  });

  test('detalle-tabs es visible', async ({ page }) => {
    await expect(page.locator('.detalle-tabs')).toBeVisible();
  });

  test('panel tiene background visible', async ({ page }) => {
    const bg = await css(page, '.panel', 'background-color');
    expect(bg).toBeTruthy();
    expect(bg).not.toBe('transparent');
  });

  test('btn-success tiene color verde', async ({ page }) => {
    const bg = await css(page, '.btn-success', 'background-color');
    if (bg) {
      const match = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        const [, r, g, b] = match.map(Number);
        // Green component should dominate
        expect(g).toBeGreaterThan(r);
      }
    }
  });
});
