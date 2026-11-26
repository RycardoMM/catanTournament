// @ts-check
const { test, expect } = require('@playwright/test');
const {
  resetApp, crearTorneo, rellenarJugadoresPrueba,
  generarRonda, confirmarMesa, switchTab,
} = require('../helpers');

/** Complete all rounds of a tournament.
 * Uses the ACTIVE ronda panel to avoid picking up hidden cards from previous rounds.
 */
async function completarTodasLasRondas(page, numRondas = 2) {
  for (let r = 0; r < numRondas; r++) {
    await generarRonda(page);
    await page.waitForTimeout(400);
    // Target only cards inside the visible (active) ronda panel
    const activePanel = page.locator('.org-ronda-panel:not(.hidden)');
    const cards = activePanel.locator('.mesa-card');
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      // Use class-based selector to avoid matching hidden edit buttons from other rounds
      const registrarBtn = card.locator('.btn-resultado');
      if (await registrarBtn.count() > 0) {
        await registrarBtn.first().click();
        await page.waitForTimeout(200);
      }
      const inputs = await card.locator('input[type="number"]').all();
      const pvValues = [10, 8, 6, 4];
      for (let j = 0; j < inputs.length; j++) {
        await inputs[j].fill(String(pvValues[j] || 4));
      }
      await card.locator('.btn-guardar-res').first().click();
      await page.waitForTimeout(400);
    }
  }
}

/** Navigate player view to a tournament by id */
async function irAVistaJugador(page, torneoId) {
  await page.evaluate((id) => {
    window.location.hash = 'tournament=' + id;
  }, torneoId);
  await page.waitForSelector('#vistaJugador:not(.hidden)', { timeout: 8000 });
}

/** Publish final classification via UI button */
async function publicarClasificacion(page) {
  await switchTab(page, 'clasificacion');
  await page.waitForTimeout(300);
  const btn = page.locator('.btn-publicar-clasif');
  await btn.waitFor({ state: 'visible', timeout: 5000 });
  await btn.click();
  await page.waitForTimeout(400);
}

test.describe('Integración — Publicar clasificación final', () => {
  let torneoId;

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await resetApp(page);
    torneoId = await crearTorneo(page, {
      nombre: 'Torneo Final',
      numJugadores: 8,
      jugadoresPorPartida: 4,
      numRondas: 2,
    });
    await rellenarJugadoresPrueba(page);
    await completarTodasLasRondas(page, 2);
  });

  test('botón Compartir clasificación visible cuando torneo completo', async ({ page }) => {
    await switchTab(page, 'clasificacion');
    await expect(page.locator('.btn-publicar-clasif')).toBeVisible();
  });

  test('publicar guarda clasificacionPublicada=true en localStorage', async ({ page }) => {
    await publicarClasificacion(page);
    const publicada = await page.evaluate(() => {
      const torneos = JSON.parse(localStorage.getItem('catan_torneos') || '[]');
      const t = torneos[torneos.length - 1];
      return t?.clasificacionPublicada;
    });
    expect(publicada).toBe(true);
  });

  test('publicar guarda clasificacionFinal no vacía en localStorage', async ({ page }) => {
    await publicarClasificacion(page);
    const clasif = await page.evaluate(() => {
      const torneos = JSON.parse(localStorage.getItem('catan_torneos') || '[]');
      const t = torneos[torneos.length - 1];
      return t?.clasificacionFinal;
    });
    expect(Array.isArray(clasif)).toBe(true);
    expect(clasif.length).toBeGreaterThan(0);
  });

  test('clasificacionFinal tiene campos pos, nombre, pv', async ({ page }) => {
    await publicarClasificacion(page);
    const clasif = await page.evaluate(() => {
      const torneos = JSON.parse(localStorage.getItem('catan_torneos') || '[]');
      return torneos[torneos.length - 1]?.clasificacionFinal;
    });
    const primer = clasif[0];
    expect(primer).toHaveProperty('pos', 1);
    expect(typeof primer.nombre).toBe('string');
    expect(typeof primer.pv).toBe('number');
  });

  test('tras publicar, botón cambia a Re-sincronizar', async ({ page }) => {
    await publicarClasificacion(page);
    await expect(page.locator('.torneo-fin-publicado')).toBeVisible();
    const btn = page.locator('.btn-publicar-clasif');
    await expect(btn).toContainText('Re-sincronizar');
  });
});

test.describe('Integración — Clasificación en vista jugador', () => {
  let torneoId;

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await resetApp(page);
    torneoId = await crearTorneo(page, {
      nombre: 'Torneo Compartido',
      numJugadores: 8,
      jugadoresPorPartida: 4,
      numRondas: 2,
    });
    await rellenarJugadoresPrueba(page);
    await completarTodasLasRondas(page, 2);
    await publicarClasificacion(page);
  });

  test('vista jugador muestra bloque clasificación final cuando está publicada', async ({ page }) => {
    await irAVistaJugador(page, torneoId);
    await expect(page.locator('.pv-clasificacion-final')).toBeVisible();
  });

  test('clasificación final muestra tabla con posiciones', async ({ page }) => {
    await irAVistaJugador(page, torneoId);
    await expect(page.locator('#vistaJugador .pv-fin-table')).toBeVisible();
  });

  test('clasificación muestra jugadores en orden (pos 1 primero)', async ({ page }) => {
    await irAVistaJugador(page, torneoId);
    const primerCell = page.locator('#vistaJugador td.pos-num.top1');
    await expect(primerCell).toBeVisible();
    const posText = await primerCell.textContent();
    expect(posText?.trim()).toBe('1');
  });
});

test.describe('Integración — Fallback clasificación sin clasificacionFinal en Firebase', () => {
  let torneoId;

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await resetApp(page);
    torneoId = await crearTorneo(page, {
      nombre: 'Torneo Fallback',
      numJugadores: 8,
      jugadoresPorPartida: 4,
      numRondas: 2,
    });
    await rellenarJugadoresPrueba(page);
    await completarTodasLasRondas(page, 2);
    await publicarClasificacion(page);

    // Simulate corrupt state: clasificacionPublicada=true but clasificacionFinal=null
    await page.evaluate(() => {
      const torneos = JSON.parse(localStorage.getItem('catan_torneos') || '[]');
      const t = torneos[torneos.length - 1];
      if (t) {
        t.clasificacionFinal = null;
        localStorage.setItem('catan_torneos', JSON.stringify(torneos));
      }
    });
  });

  test('renderPlayerView recalcula clasificación cuando clasificacionFinal es null', async ({ page }) => {
    await irAVistaJugador(page, torneoId);
    // Fallback recalculates from rondas — should still show .pv-clasificacion-final
    await expect(page.locator('.pv-clasificacion-final')).toBeVisible();
  });

  test('clasificación recalculada muestra jugadores', async ({ page }) => {
    await irAVistaJugador(page, torneoId);
    await expect(page.locator('#vistaJugador .pv-fin-table')).toBeVisible();
    await expect(page.locator('#vistaJugador td.pos-num').first()).toBeVisible();
  });
});

test.describe('Unit — Orden clasificación (amistoso vs oficial)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#listaTorneos');
  });

  const torneo = (tipo) => ({
    tipo,
    jugadores: [
      { id: 1, nombre: 'Ana' }, { id: 2, nombre: 'Bruno' },
      { id: 3, nombre: 'Carmen' }, { id: 4, nombre: 'Diego' },
    ],
    rondas: [{
      numero: 1,
      mesas: [[{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]],
      resultadosMesas: [[
        { id: 1, nombre: 'Ana',    pv: 10, posicion: 2 }, // 2nd place → 4pts oficial
        { id: 2, nombre: 'Bruno',  pv:  8, posicion: 1 }, // 1st place → 6pts oficial
        { id: 3, nombre: 'Carmen', pv:  6, posicion: 3 }, // 3rd → 2pts
        { id: 4, nombre: 'Diego',  pv:  4, posicion: 4 }, // 4th → 1pt
      ]],
    }],
  });

  test('oficial: Bruno (1er puesto) gana por torneoPoints aunque Ana tiene más PV', async ({ page }) => {
    const stats = await page.evaluate((t) => window.calcularStats(t), torneo('oficial'));
    // Bruno: torneoPoints=6, Ana: torneoPoints=4
    expect(stats[2].torneoPoints).toBeGreaterThan(stats[1].torneoPoints);
  });

  test('amistoso: Ana (más PV) gana sobre Bruno (1er puesto)', async ({ page }) => {
    const stats = await page.evaluate((t) => window.calcularStats(t), torneo('amistoso'));
    // In amistoso, torneoPoints = pv, so Ana (10 pv) > Bruno (8 pv)
    expect(stats[1].torneoPoints).toBeGreaterThan(stats[2].torneoPoints);
  });

  test('clasificación oficial ordena por torneoPoints primero', async ({ page }) => {
    const stats = await page.evaluate((t) => window.calcularStats(t), torneo('oficial'));
    const sorted = Object.values(stats).sort((a, b) =>
      b.torneoPoints - a.torneoPoints || b.pv - a.pv || b.primerPuesto - a.primerPuesto
    );
    expect(sorted[0].nombre).toBe('Bruno');
  });

  test('clasificación amistosa ordena por PV primero', async ({ page }) => {
    const stats = await page.evaluate((t) => window.calcularStats(t), torneo('amistoso'));
    const sorted = Object.values(stats).sort((a, b) =>
      b.pv - a.pv || b.primerPuesto - a.primerPuesto
    );
    expect(sorted[0].nombre).toBe('Ana');
  });
});
