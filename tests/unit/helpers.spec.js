// @ts-check
const { test, expect } = require('@playwright/test');
const { resetApp } = require('../helpers');

test.describe('Unit — escapeHtml', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#listaTorneos');
  });

  test('escapa caracteres HTML básicos', async ({ page }) => {
    const result = await page.evaluate(() =>
      window.escapeHtml('<script>alert("xss")</script>')
    );
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
  });

  test('escapa ampersand', async ({ page }) => {
    const result = await page.evaluate(() => window.escapeHtml('a & b'));
    expect(result).toContain('&amp;');
    expect(result).not.toContain(' & ');
  });

  test('escapa comillas dobles', async ({ page }) => {
    const result = await page.evaluate(() => window.escapeHtml('"hola"'));
    expect(result).not.toContain('"hola"');
  });

  test('devuelve string vacío para input vacío', async ({ page }) => {
    const result = await page.evaluate(() => window.escapeHtml(''));
    expect(result).toBe('');
  });

  test('no modifica texto sin caracteres especiales', async ({ page }) => {
    const result = await page.evaluate(() => window.escapeHtml('Hola Mundo 123'));
    expect(result).toBe('Hola Mundo 123');
  });
});

test.describe('Unit — formatDesempate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#listaTorneos');
  });

  test('puntos_victoria devuelve texto legible', async ({ page }) => {
    const r = await page.evaluate(() => window.formatDesempate('puntos_victoria'));
    expect(r.length).toBeGreaterThan(4);
    expect(typeof r).toBe('string');
  });

  test('carretera_larga devuelve texto legible', async ({ page }) => {
    const r = await page.evaluate(() => window.formatDesempate('carretera_larga'));
    expect(r.length).toBeGreaterThan(4);
  });

  test('menos_recursos devuelve texto legible', async ({ page }) => {
    const r = await page.evaluate(() => window.formatDesempate('menos_recursos'));
    expect(r.length).toBeGreaterThan(4);
  });

  test('cartas_desarrollo devuelve texto legible', async ({ page }) => {
    const r = await page.evaluate(() => window.formatDesempate('cartas_desarrollo'));
    expect(r.length).toBeGreaterThan(4);
  });

  test('valor desconocido devuelve el mismo valor', async ({ page }) => {
    const r = await page.evaluate(() => window.formatDesempate('desconocido_xzy'));
    expect(typeof r).toBe('string');
  });
});

test.describe('Unit — formatFormato', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#listaTorneos');
  });

  test('todos_contra_todos devuelve texto', async ({ page }) => {
    const r = await page.evaluate(() => window.formatFormato('todos_contra_todos'));
    expect(r.length).toBeGreaterThan(3);
  });

  test('suizo devuelve texto', async ({ page }) => {
    const r = await page.evaluate(() => window.formatFormato('suizo'));
    expect(r.length).toBeGreaterThan(3);
  });
});

test.describe('Unit — rondaActualCompleta / torneoFinalizado', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#listaTorneos');
  });

  test('torneo sin rondas está completo', async ({ page }) => {
    const r = await page.evaluate(() =>
      window.rondaActualCompleta({ rondas: [] })
    );
    expect(r).toBe(true);
  });

  test('ronda con resultados pendientes NO está completa', async ({ page }) => {
    const r = await page.evaluate(() =>
      window.rondaActualCompleta({
        rondas: [{ mesas: [[{}, {}]], resultadosMesas: [] }],
      })
    );
    expect(r).toBe(false);
  });

  test('ronda con todos los resultados SÍ está completa', async ({ page }) => {
    const r = await page.evaluate(() =>
      window.rondaActualCompleta({
        rondas: [{
          mesas: [[{}, {}]],
          resultadosMesas: [[{ nombre: 'A', pv: 10 }, { nombre: 'B', pv: 8 }]],
        }],
      })
    );
    expect(r).toBe(true);
  });

  test('torneoFinalizado false cuando numRondas no alcanzado', async ({ page }) => {
    const r = await page.evaluate(() =>
      window.torneoFinalizado({ numRondas: 3, rondas: [{ mesas: [], resultadosMesas: [] }] })
    );
    expect(r).toBe(false);
  });
});

test.describe('Unit — TORNEO_PUNTOS', () => {
  test('la tabla de puntos oficial tiene 4 valores correctos', async ({ page }) => {
    await page.goto('/');
    const puntos = await page.evaluate(() => window.TORNEO_PUNTOS);
    expect(puntos).toEqual([6, 4, 2, 1]);
  });
});
