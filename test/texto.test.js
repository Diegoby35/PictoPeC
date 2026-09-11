import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliza, trocea, esVacia, ngramasCandidatos } from '../src/texto.js';

test('normaliza conservando tildes y eñe', () => {
  // Normalizar quitando diacríticos rompería el vocabulario: ARASAAC indexa
  // "niño" con su grafía real y "papa" y "papá" son pictogramas distintos.
  assert.equal(normaliza('¿Dónde está el NIÑO?'), 'dónde está el niño');
  assert.deepEqual(trocea('¡Papá, más años!'), ['papá', 'más', 'años']);
});

test('las palabras con carga comunicativa no son palabras vacías', () => {
  // Quitar cualquiera de estas cambia lo que la frase dice.
  for (const palabra of ['no', 'sí', 'más', 'menos', 'yo', 'tú', 'qué', 'dónde', 'hoy']) {
    assert.equal(esVacia(palabra), false, `"${palabra}" no debería ser palabra vacía`);
  }
});

test('artículos, preposiciones y cópulas sí son palabras vacías', () => {
  for (const palabra of ['el', 'la', 'de', 'con', 'al', 'del', 'es', 'están', 'que']) {
    assert.equal(esVacia(palabra), true, `"${palabra}" debería ser palabra vacía`);
  }
});

test('los n-gramas van de más largos a más cortos', () => {
  // El emparejamiento es voraz, así que el orden es lo que hace que gane
  // "parque infantil" sobre "parque" suelto.
  const ngramas = ngramasCandidatos(trocea('vamos al parque infantil'));
  const longitudes = ngramas.map((n) => n.fin - n.inicio);
  assert.deepEqual(longitudes, [...longitudes].sort((a, b) => b - a));
});

test('los n-gramas terminan siempre en palabra con contenido', () => {
  const ngramas = ngramasCandidatos(trocea('vamos a comer al parque'));
  for (const n of ngramas) {
    const ultima = n.texto.split(' ').pop();
    assert.equal(esVacia(ultima), false, `"${n.texto}" termina en palabra vacía`);
  }
});

test('deja pasar las locuciones que empiezan por partícula', () => {
  // "por favor" y "por qué" tienen pictograma propio en ARASAAC.
  const textos = ngramasCandidatos(trocea('dame agua por favor')).map((n) => n.texto);
  assert.ok(textos.includes('por favor'), `n-gramas generados: ${textos.join(' | ')}`);
});
