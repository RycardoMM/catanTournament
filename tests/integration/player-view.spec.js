// @ts-check
const { test, expect } = require('@playwright/test');
const { resetApp, crearTorneo, rellenarJugadoresPrueba, generarRonda } = require('../helpers');

/** Navigate to the player view by setting the hash (triggers hashchange listener) */
async function irAVistaJugador(page, torneoId) {
  await page.evaluate((id) => {
    window.location.hash = 'tournament=' + id;
  }, torneoId);
  await page.waitForSelector('#vistaJugador:not(.hidden)', { timeout: 8000 });
}

test.describe('Integración — Vista jugador (enlace compartido)', () => {
  let torneoId;

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await resetApp(page);
    torneoId = await crearTorneo(page, {
      nombre: 'Torneo Público',
      numJugadores: 8,
      jugadoresPorPartida: 4,
      numRondas: 2,
    });
    await rellenarJugadoresPrueba(page);
    await generarRonda(page);
  });

  test('compartir torneo abre modal con URL', async ({ page }) => {
    await page.click('#btnCompartirTorneo');
    await expect(page.locator('#modalShareRonda')).not.toHaveClass(/hidden/);
    const url = await page.locator('#shareUrlInput').inputValue();
    expect(url).toContain('tournament=');
    expect(url).toContain(String(torneoId));
  });

  test('copiar URL muestra mensaje de confirmación', async ({ page }) => {
    await page.click('#btnCompartirTorneo');
    await page.click('#btnCopyShareUrl');
    await expect(page.locator('#shareCopiedMsg')).not.toHaveClass(/hidden/);
  });

  test('enlace #tournament= muestra vista jugador', async ({ page }) => {
    await irAVistaJugador(page, torneoId);
    await expect(page.locator('.player-torneo-nombre')).toContainText('Torneo Público');
  });

  test('vista jugador muestra nombre del torneo', async ({ page }) => {
    await irAVistaJugador(page, torneoId);
    await expect(page.locator('.player-torneo-nombre')).toContainText('Torneo Público');
  });

  test('vista jugador muestra badge de ronda', async ({ page }) => {
    await irAVistaJugador(page, torneoId);
    await expect(page.locator('.player-ronda-badge')).toContainText('Ronda');
  });

  test('vista jugador muestra tabs Mesas e Historial', async ({ page }) => {
    await irAVistaJugador(page, torneoId);
    await expect(page.locator('[data-pv-tab="mesas"]')).toBeVisible();
    await expect(page.locator('[data-pv-tab="historial"]')).toBeVisible();
  });

  test('vista jugador muestra mesas con jugadores', async ({ page }) => {
    await irAVistaJugador(page, torneoId);
    // Target only player-view mesa cards (not admin view)
    await expect(page.locator('#playerViewContent .mesa-card').first()).toBeVisible();
    const mesaCount = await page.locator('#playerViewContent .mesa-card').count();
    expect(mesaCount).toBeGreaterThan(0);
  });

  test('ID inexistente muestra error en vista jugador', async ({ page }) => {
    await page.evaluate(() => {
      window.location.hash = 'tournament=id_que_no_existe_xyzabc';
    });
    await page.waitForSelector('#vistaJugador:not(.hidden)', { timeout: 8000 });
    // Wait for content to show an error (or loading) state
    await expect(page.locator('#playerViewContent')).toContainText(
      /no encontrado|error|no existe|sin conexión|cargando/i,
      { timeout: 10000 }
    );
  });

  test('vista jugador: layout principal está oculto', async ({ page }) => {
    await irAVistaJugador(page, torneoId);
    const layoutVisible = await page.locator('.app-layout').isVisible();
    expect(layoutVisible).toBe(false);
  });
});
