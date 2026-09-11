import test from 'node:test';
import assert from 'node:assert/strict';
import { candidatosDeLema, singulariza } from '../src/lematiza.js';

/** Comprueba que `esperado` aparece entre las hipótesis de `palabra`. */
function proponeLema(palabra, esperado) {
  const candidatos = candidatosDeLema(palabra);
  assert.ok(
    candidatos.includes(esperado),
    `"${palabra}" debería proponer "${esperado}"; propuso: ${candidatos.join(', ')}`,
  );
}

test('la palabra original siempre es la primera hipótesis', () => {
  // Es lo que protege a los sustantivos de las reglas verbales agresivas:
  // "casa" encuentra su pictograma antes de que nadie pruebe "casar".
  for (const palabra of ['casa', 'libro', 'parque', 'mano']) {
    assert.equal(candidatosDeLema(palabra)[0], palabra);
  }
});

test('resuelve los verbos irregulares frecuentes', () => {
  proponeLema('vamos', 'ir');
  proponeLema('voy', 'ir');
  proponeLema('quiero', 'querer');
  proponeLema('tengo', 'tener');
  proponeLema('hizo', 'hacer');
  proponeLema('durmiendo', 'dormir');
});

test('"ir" sobrevive al filtro de longitud mínima', () => {
  // Único infinitivo español de dos letras. Un guardarraíl de longitud
  // ingenuo lo elimina y "vamos" se queda sin lema.
  proponeLema('vamos', 'ir');
  assert.deepEqual(candidatosDeLema('ir'), ['ir']);
});

test('resuelve los verbos regulares por reglas de sufijo', () => {
  proponeLema('comemos', 'comer');
  proponeLema('escribimos', 'escribir');
  proponeLema('pintaba', 'pintar');
  proponeLema('bebido', 'beber');
  proponeLema('saltando', 'saltar');
  proponeLema('comeré', 'comer');
});

test('deshace los cambios ortográficos de raíz', () => {
  proponeLema('busqué', 'buscar');
  proponeLema('llegué', 'llegar');
  proponeLema('empecé', 'empezar');
});

test('deshace la diptongación de raíz', () => {
  proponeLema('cuentas', 'contar');
  proponeLema('pienso', 'pensar');
  proponeLema('vuelvo', 'volver');
});

test('separa el pronombre enclítico del verbo', () => {
  proponeLema('lavarnos', 'lavar');
  proponeLema('ponte', 'poner');
  proponeLema('levántate', 'levantar');
  proponeLema('ayúdame', 'ayudar');
  proponeLema('siéntate', 'sentar');
  proponeLema('dime', 'decir');
});

test('quitar el enclítico da el verbo, no el sustantivo homógrafo', () => {
  // "cuéntame" es contar. La raíz "cuenta" es un sustantivo con pictograma
  // propio (fracción, cuenta) que se colaría si se admitiera tal cual.
  const candidatos = candidatosDeLema('cuéntame');
  assert.ok(candidatos.includes('contar'), `faltó "contar": ${candidatos}`);
  assert.ok(!candidatos.includes('cuenta'), `se coló "cuenta": ${candidatos}`);
});

test('los sustantivos que parecen verbo + enclítico no se rompen', () => {
  // "manos" acaba en "nos", "gatos" en "os". La palabra literal debe ganar.
  for (const palabra of ['manos', 'gatos', 'escuela', 'zapatos', 'hola']) {
    assert.equal(candidatosDeLema(palabra)[0], palabra);
  }
});

test('singulariza plurales, incluidos los de -ces', () => {
  assert.equal(singulariza('casas'), 'casa');
  assert.equal(singulariza('flores'), 'flor');
  assert.equal(singulariza('lápices'), 'lápiz');
  assert.equal(singulariza('sol'), null);
});
