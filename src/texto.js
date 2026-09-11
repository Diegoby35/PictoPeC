// Normalización y troceado de frases. Funciones puras, sin red ni estado.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));

const datosVacias = JSON.parse(
  readFileSync(join(AQUI, '..', 'data', 'vacias-es.json'), 'utf8'),
);

/** Palabras vacías aplanadas desde los grupos del JSON. */
export const PALABRAS_VACIAS = new Set(
  Object.entries(datosVacias)
    .filter(([clave]) => !clave.startsWith('_'))
    .flatMap(([, palabras]) => palabras),
);

/**
 * Minúsculas y sin puntuación, conservando tildes y eñe.
 * ARASAAC indexa "niño" con su grafía real y "papa"/"papá" son pictogramas
 * distintos, así que quitar diacríticos rompería el vocabulario.
 */
export function normaliza(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .replace(/[¿?¡!.,;:()"“”«»…]/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Trocea una frase normalizada en palabras. */
export function trocea(texto) {
  const limpio = normaliza(texto);
  return limpio ? limpio.split(' ') : [];
}

export function esVacia(palabra) {
  return PALABRAS_VACIAS.has(palabra);
}

/**
 * N-gramas candidatos a expresión multipalabra, de más largos a más cortos.
 *
 * ARASAAC tiene pictogramas propios para "parque infantil" o "cuarto de baño",
 * mejores que trocear. Solo se generan los que terminan en palabra con
 * contenido: eso descarta los cortados a media frase ("comer al") y deja pasar
 * las locuciones que empiezan por partícula ("por favor", "por qué").
 */
export function ngramasCandidatos(palabras, maximo = 3) {
  const salida = [];

  for (let n = Math.min(maximo, palabras.length); n >= 2; n--) {
    for (let i = 0; i + n <= palabras.length; i++) {
      const trozo = palabras.slice(i, i + n);
      if (esVacia(trozo[trozo.length - 1])) continue;
      salida.push({ inicio: i, fin: i + n, texto: trozo.join(' ') });
    }
  }
  return salida;
}
