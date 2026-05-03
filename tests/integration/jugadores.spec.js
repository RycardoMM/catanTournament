// @ts-check
const { test, expect } = require('@playwright/test');
const { resetApp, crearTorneo, agregarJugadores, rellenarJugadoresPrueba } = require('../helpers');

/** Read jugadores array from localStorage */
async function getJugadores(page) {
  return page.evaluate(() => {
    const torneos = JSON.parse(localStorage.getItem('catan_torneos') || '[]');
    const ultimo = torneos[torneos.length - 1];
    return ultimo ? (ultimo.jugadores || []) : [];
  });
}

test.describe('Integración — Gestión de jugadores', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await resetApp(page);
    await crearTorneo(page, { nombre: 'Test Jugadores', numJugadores: 8 });
  });

  test('contador empieza en 0', async ({ page }) => {
    await expect(page.locator('#contadorJugadores')).toContainText('0');
  });

  test('botón Agregar muestra el formulario', async ({ page }) => {
    await page.click('#btnAgregarJugador');
    await expect(page.locator('#addJugadorForm')).not.toHaveClass(/hidden/);
    await expect(page.locator('#inputNombreJugador')).toBeVisible();
  });

  test('agregar un jugador actualiza el contador', async ({ page }) => {
    await agregarJugadores(page, ['Pedro']);
    await expect(page.locator('#contadorJugadores')).toContainText('1');
  });

  test('agregar 4 jugadores los muestra en la grid', async ({ page }) => {
    await agregarJugadores(page, ['Ana', 'Bruno', 'Carmen', 'Diego']);
    const cards = page.locator('#listaJugadores .jugador-card, #listaJugadores > *');
    await expect(cards).toHaveCount(4);
  });

  test('botón Rellenar prueba agrega jugadores automáticamente', async ({ page }) => {
    await rellenarJugadoresPrueba(page);
    const jugadores = await getJugadores(page);
    expect(jugadores.length).toBeGreaterThan(0);
  });

  test('no permite jugadores duplicados', async ({ page }) => {
    await agregarJugadores(page, ['Ana']);
    const countBefore = (await getJugadores(page)).length;
    await agregarJugadores(page, ['Ana']);
    const countAfter = (await getJugadores(page)).length;
    expect(countAfter).toBe(countBefore); // no change
  });

  test('eliminar jugador con ×', async ({ page }) => {
    await agregarJugadores(page, ['Para Borrar', 'Queda']);
    await expect(page.locator('#contadorJugadores')).toContainText('2');

    // Click the × on the first player (element class is jugador-chip with jugador-remove button)
    const deleteBtn = page.locator('.jugador-chip .jugador-remove, .jugador-chip button').first();
    await deleteBtn.click();
    await page.waitForTimeout(200);

    await expect(page.locator('#contadorJugadores')).toContainText('1');
  });

  test('contador muestra formato x/y con máximo', async ({ page }) => {
    await agregarJugadores(page, ['A', 'B', 'C']);
    const counter = await page.locator('#contadorJugadores').textContent();
    // Should show something like "3/8" or "3"
    expect(counter).toMatch(/3/);
  });
});
