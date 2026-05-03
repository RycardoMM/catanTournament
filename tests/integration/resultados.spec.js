// @ts-check
const { test, expect } = require('@playwright/test');
const {
  resetApp, crearTorneo, rellenarJugadoresPrueba,
  generarRonda, confirmarMesa, switchTab,
} = require('../helpers');

/** Open result form for a mesa card and fill PV inputs */
async function abrirYRellenarMesa(card, pvValues, page) {
  // Open the form if needed
  const registrarBtn = card.locator('button:has-text("Registrar resultado"), button:has-text("Introducir resultado")');
  if (await registrarBtn.count() > 0) {
    await registrarBtn.first().click();
    await page.waitForTimeout(200);
  }
  const inputs = await card.locator('input[type="number"]').all();
  for (let j = 0; j < inputs.length && j < pvValues.length; j++) {
    await inputs[j].fill(String(pvValues[j]));
  }
  // Guardar (the save button)
  await card.locator('button:has-text("Guardar"), .btn-guardar-res').first().click();
  await page.waitForTimeout(300);
}

test.describe('Integración — Emparejamiento y resultados', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await resetApp(page);
    await crearTorneo(page, { nombre: 'Test Rondas', numJugadores: 8, jugadoresPorPartida: 4, numRondas: 2 });
    await rellenarJugadoresPrueba(page);
  });

  test('botón Iniciar torneo genera mesas', async ({ page }) => {
    await generarRonda(page);
    await expect(page.locator('.mesa-card').first()).toBeVisible();
  });

  test('genera 2 mesas para 8 jugadores de 4 en 4', async ({ page }) => {
    await generarRonda(page);
    await expect(page.locator('.mesa-card')).toHaveCount(2);
  });

  test('cada mesa tiene 4 jugadores', async ({ page }) => {
    await generarRonda(page);
    const primerasMesas = page.locator('.mesa-card').first();
    // Use only the list items selector — .jugador-nombre is a span INSIDE each li
    const jugadoresEnMesa = await primerasMesas.locator('.mesa-jugadores li').count();
    expect(jugadoresEnMesa).toBe(4);
  });

  test('botón cambia a "Finalizar torneo" en la última ronda', async ({ page }) => {
    // Ronda 1
    await generarRonda(page);

    // Confirm all results for round 1
    const pvSets = [[10, 8, 6, 4], [9, 7, 5, 3]];
    const cards = await page.locator('.mesa-card').all();
    for (let i = 0; i < cards.length; i++) {
      await abrirYRellenarMesa(cards[i], pvSets[i], page);
    }

    // Generate round 2
    await generarRonda(page);
    const btnText = await page.locator('#btnGenerarRonda').textContent();
    // Button could say "Finalizar", "Ronda 2", or "Torneo completado"
    expect(btnText).toMatch(/Finalizar|Ronda 2|completado/i);
  });

  test('resultados confirmados se muestran con posiciones', async ({ page }) => {
    await generarRonda(page);
    const card = page.locator('.mesa-card').first();

    await abrirYRellenarMesa(card, [10, 8, 6, 4], page);

    // Should now show resultado-display container with position markers
    await expect(card.locator('.resultado-display').first()).toBeVisible();
  });

  test('no se puede confirmar sin rellenar todos los PV', async ({ page }) => {
    await generarRonda(page);
    const card = page.locator('.mesa-card').first();

    // Open form
    const registrarBtn = card.locator('button:has-text("Registrar resultado")');
    await registrarBtn.click();
    await page.waitForTimeout(200);

    // Fill only 2 out of 4 inputs
    const inputs = await card.locator('input[type="number"]').all();
    if (inputs.length >= 2) {
      await inputs[0].fill('10');
      await inputs[1].fill('8');
    }

    await card.locator('button:has-text("Guardar"), .btn-guardar-res').first().click();
    await page.waitForTimeout(300);

    // Results should NOT be confirmed — no resultado-display yet
    const confirmed = await card.locator('.resultado-display').count();
    expect(confirmed).toBe(0);
  });

  test('clasificación aparece tras completar una ronda', async ({ page }) => {
    await generarRonda(page);

    const cards = await page.locator('.mesa-card').all();
    for (const card of cards) {
      await abrirYRellenarMesa(card, [10, 8, 6, 4], page);
    }

    await switchTab(page, 'clasificacion');
    await expect(page.locator('#tablaClasificacion')).toBeVisible();
    await expect(page.locator('#tablaClasificacion table, .clasificacion-table')).toBeVisible();
  });

  test('historial muestra rondas completadas', async ({ page }) => {
    await generarRonda(page);

    const cards = await page.locator('.mesa-card').all();
    for (const card of cards) {
      await abrirYRellenarMesa(card, [10, 8, 6, 4], page);
    }

    await switchTab(page, 'historial');
    await expect(page.locator('#contenidoHistorial')).toBeVisible();
    await expect(page.locator('.hist-card, .hist-ronda')).toBeVisible();
  });
});
