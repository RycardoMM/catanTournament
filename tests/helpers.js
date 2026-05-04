/**
 * Shared helpers for all test suites.
 */

/** Clear localStorage and reload — starts app in clean state */
async function resetApp(page) {
  await page.evaluate(() => {
    // Clear all app data (tournaments cache + UI state)
    localStorage.removeItem('catan_torneos');
    localStorage.removeItem('ui_seccion');
    localStorage.removeItem('ui_tab_detalle');
    // Prevent Firebase from loading accumulated tournaments from previous test runs
    sessionStorage.setItem('_testMode', '1');
  });
  await page.reload();
  // Wait until the app has rendered (list or empty state)
  await page.waitForSelector('#listaTorneos', { timeout: 8000 });
}

/** Navigate to admin home */
async function goHome(page) {
  await page.goto('/');
  await page.waitForSelector('#listaTorneos', { timeout: 8000 });
}

/** Create a tournament via the modal form and return its numeric id */
async function crearTorneo(page, opts = {}) {
  const {
    nombre = 'Torneo Test',
    numJugadores = 8,
    jugadoresPorPartida = 4,
    numRondas = 2,
    tipo = 'oficial',
    formato = 'todos_contra_todos',
  } = opts;

  await page.click('#btnCrearTorneo');
  await page.waitForSelector('#modalOverlay:not(.hidden)');

  await page.fill('#nombreTorneo', nombre);
  await page.fill('#numJugadores', String(numJugadores));
  await page.selectOption('#jugadoresPorPartida', String(jugadoresPorPartida));
  await page.fill('#numRondas', String(numRondas));
  await page.selectOption('#tipoTorneo', tipo);
  await page.selectOption('#formatoTorneo', formato);
  await page.click('#formTorneo button[type="submit"]');

  // Wait for detail view
  await page.waitForSelector('#vistaDetalle:not(.hidden)', { timeout: 5000 });

  // Return the id of the active tournament
  // Note: `state` is declared with `const` in app.js so it's NOT on window.
  // Read it from localStorage instead.
  return await page.evaluate(() => {
    const torneos = JSON.parse(localStorage.getItem('catan_torneos') || '[]');
    return torneos[torneos.length - 1]?.id;
  });
}

/** Add N players with generated names */
async function agregarJugadores(page, nombres) {
  for (const nombre of nombres) {
    // The form stays open after confirming, so only click the button if it's currently hidden
    const isHidden = await page.locator('#addJugadorForm').evaluate(el => el.classList.contains('hidden'));
    if (isHidden) {
      await page.click('#btnAgregarJugador');
      await page.waitForSelector('#addJugadorForm:not(.hidden)');
    }
    await page.fill('#inputNombreJugador', nombre);
    await page.click('#btnConfirmarJugador');
    await page.waitForTimeout(150);
  }
}

/** Use the "Rellenar prueba" button to fill test players */
async function rellenarJugadoresPrueba(page) {
  await page.click('#btnJugadoresPrueba');
  await page.waitForTimeout(300);
}

/** Generate the first/next round */
async function generarRonda(page) {
  await page.click('#btnGenerarRonda');
  await page.waitForTimeout(500);
}

/** Fill PV values for a mesa (array of numbers, one per player) and confirm */
async function confirmarMesa(page, mesaIdx, pvValues) {
  const card = page.locator('.mesa-card').nth(mesaIdx);

  // Open result form if not already open
  const registrarBtn = card.locator('button:has-text("Registrar resultado"), button:has-text("Introducir resultado")');
  if (await registrarBtn.count() > 0) {
    await registrarBtn.first().click();
    await page.waitForTimeout(200);
  }

  const inputs = await card.locator('input[type="number"]').all();
  for (let i = 0; i < pvValues.length && i < inputs.length; i++) {
    await inputs[i].fill(String(pvValues[i]));
  }

  // Save button text is "✓ Guardar"
  const saveBtn = card.locator('button:has-text("Guardar"), .btn-guardar-res');
  await saveBtn.first().click();
  await page.waitForTimeout(400);
}

/** Switch to a tab by data-tab value */
async function switchTab(page, tabName) {
  await page.click(`.tab-btn[data-tab="${tabName}"]`);
  await page.waitForTimeout(200);
}

const JUGADORES_PRUEBA = [
  'Carlos Martínez', 'Diana Sánchez', 'Beatriz López', 'Alejandro García',
  'Pablo Ruiz', 'Marta Jiménez', 'Luis Torres', 'Elena Navarro',
];

module.exports = {
  resetApp,
  goHome,
  crearTorneo,
  agregarJugadores,
  rellenarJugadoresPrueba,
  generarRonda,
  confirmarMesa,
  switchTab,
  JUGADORES_PRUEBA,
};
