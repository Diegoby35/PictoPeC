import test from 'node:test';
import assert from 'node:assert/strict';
import { analizaFrase } from '../src/pipeline.js';

/**
 * Estas pruebas hablan de verdad con ARASAAC. Son las que garantizan lo que
 * de verdad importa: que una frase escrita por una persona acaba en una fila
 * de pictogramas correcta. Ninguna cantidad de pruebas unitarias sustituye a
 * esto, porque la API es quien decide qué lema existe.
 *
 * Se saltan con PICTOPEC_SIN_RED=1 para poder trabajar sin conexión.
 */
const sinRed = process.env.PICTOPEC_SIN_RED === '1';

/** Lemas resueltos de una frase, solo de los conceptos que tienen pictograma. */
async function lemasDe(frase) {
  const resultado = await analizaFrase(frase);
  return resultado.conceptos.filter((c) => c.pictograma).map((c) => c.lema);
}

test('la frase que rompe el mapeo palabra-a-pictograma', { skip: sinRed }, async () => {
  // El caso que justifica todo el proyecto. ARASAAC no encuentra nada para
  // "vamos", así que un mapeo directo devolvería solo "parque".
  assert.deepEqual(await lemasDe('Vamos a comer al parque'), ['ir', 'comer', 'parque']);
});

test('la negación no se pierde', { skip: sinRed }, async () => {
  // Perder un "no" convierte una negativa en una afirmativa. Es el peor
  // fallo posible en una herramienta de comunicación.
  const lemas = await lemasDe('No quiero ir al médico');
  assert.ok(
    lemas.some((l) => l.startsWith('no')),
    `la negación desapareció: ${lemas.join(' · ')}`,
  );
});

test('las expresiones multipalabra ganan a sus partes', { skip: sinRed }, async () => {
  assert.ok((await lemasDe('Quiero ir al parque infantil')).includes('parque infantil'));
  assert.ok((await lemasDe('Dame agua por favor')).includes('por favor'));
});

test('todo concepto resuelto trae una imagen utilizable', { skip: sinRed }, async () => {
  const { conceptos } = await analizaFrase('El niño come una manzana');
  assert.ok(conceptos.length > 0);
  for (const concepto of conceptos) {
    if (!concepto.pictograma) continue;
    assert.match(concepto.pictograma.url, /^https:\/\/static\.arasaac\.org\/pictograms\/\d+\//);
    assert.ok(Number.isInteger(concepto.pictograma.id));
  }
});

test('una frase vacía no revienta', async () => {
  const resultado = await analizaFrase('   ');
  assert.deepEqual(resultado.conceptos, []);
});

test('una frase solo de conectores avisa en vez de fallar', { skip: sinRed }, async () => {
  const resultado = await analizaFrase('de la con el');
  assert.equal(resultado.conceptos.length, 0);
  assert.ok(resultado.avisos.length > 0);
});
