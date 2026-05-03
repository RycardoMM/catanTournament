// @ts-check
const { test, expect } = require('@playwright/test');

/** Build a minimal tournament object with results for stat calculation */
const torneoConResultados = () => ({
  tipo: 'oficial',
  jugadores: [
    { id: 1, nombre: 'Ana' }, { id: 2, nombre: 'Bruno' },
    { id: 3, nombre: 'Carmen' }, { id: 4, nombre: 'Diego' },
  ],
  rondas: [
    {
      numero: 1,
      mesas: [[{ id: 1, nombre: 'Ana' }, { id: 2, nombre: 'Bruno' }, { id: 3, nombre: 'Carmen' }, { id: 4, nombre: 'Diego' }]],
      resultadosMesas: [[
        { id: 1, nombre: 'Ana',    pv: 10, posicion: 1 },
        { id: 2, nombre: 'Bruno',  pv:  8, posicion: 2 },
        { id: 3, nombre: 'Carmen', pv:  6, posicion: 3 },
        { id: 4, nombre: 'Diego',  pv:  4, posicion: 4 },
      ]],
    },
    {
      numero: 2,
      mesas: [[{ id: 1, nombre: 'Ana' }, { id: 2, nombre: 'Bruno' }, { id: 3, nombre: 'Carmen' }, { id: 4, nombre: 'Diego' }]],
      resultadosMesas: [[
        { id: 2, nombre: 'Bruno',  pv: 10, posicion: 1 },
        { id: 1, nombre: 'Ana',    pv:  9, posicion: 2 },
        { id: 3, nombre: 'Carmen', pv:  5, posicion: 3 },
        { id: 4, nombre: 'Diego',  pv:  4, posicion: 4 },
      ]],
    },
  ],
});

test.describe('Unit — calcularStats', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#listaTorneos');
  });

  test('devuelve un objeto con entrada por jugador', async ({ page }) => {
    const stats = await page.evaluate((t) => window.calcularStats(t), torneoConResultados());
    expect(typeof stats).toBe('object');
    // Stats are keyed by player id
    expect(Object.keys(stats).length).toBe(4);
  });

  test('suma correctamente los PV totales', async ({ page }) => {
    const stats = await page.evaluate((t) => window.calcularStats(t), torneoConResultados());
    // id=1 → Ana: 10 + 9 = 19
    expect(stats[1].pv).toBe(19);
    // id=2 → Bruno: 8 + 10 = 18
    expect(stats[2].pv).toBe(18);
  });

  test('cuenta correctamente los primeros puestos', async ({ page }) => {
    const stats = await page.evaluate((t) => window.calcularStats(t), torneoConResultados());
    expect(stats[1].primerPuesto).toBe(1); // Ana: 1 first place
    expect(stats[2].primerPuesto).toBe(1); // Bruno: 1 first place
    expect(stats[3].primerPuesto).toBe(0); // Carmen: 0
    expect(stats[4].primerPuesto).toBe(0); // Diego: 0
  });

  test('calcula puntos de torneo oficial correctamente', async ({ page }) => {
    const stats = await page.evaluate((t) => window.calcularStats(t), torneoConResultados());
    // Ana: 1.ª (6pts) + 2.ª (4pts) = 10
    expect(stats[1].torneoPoints).toBe(10);
    // Bruno: 2.ª (4pts) + 1.ª (6pts) = 10
    expect(stats[2].torneoPoints).toBe(10);
    // Diego: 4.ª (1pt) + 4.ª (1pt) = 2
    expect(stats[4].torneoPoints).toBe(2);
  });

  test('torneo amistoso solo usa PV (torneoPoints = pv)', async ({ page }) => {
    const t = torneoConResultados();
    t.tipo = 'amistoso';
    const stats = await page.evaluate((t) => window.calcularStats(t), t);
    // In amistoso mode, torneoPoints should equal pv
    expect(stats[1].torneoPoints).toBe(stats[1].pv);
  });

  test('funciona con rondas sin resultados (resultadosMesas vacío)', async ({ page }) => {
    const t = {
      tipo: 'oficial',
      jugadores: [{ id: 1, nombre: 'Ana' }, { id: 2, nombre: 'Bruno' }],
      rondas: [{ numero: 1, mesas: [[{ id: 1, nombre: 'Ana' }, { id: 2, nombre: 'Bruno' }]], resultadosMesas: [] }],
    };
    const stats = await page.evaluate((t) => window.calcularStats(t), t);
    expect(stats[1].pv).toBe(0);
    expect(stats[2].pv).toBe(0);
  });
});
