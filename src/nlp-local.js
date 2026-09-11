// Motor local: frase -> conceptos. Dos pasadas: primero expresiones
// multipalabra contra ARASAAC, luego palabras sueltas.
// Aquí solo se proponen lemas; quién gana lo decide pipeline.js.

import { trocea, esVacia, ngramasCandidatos } from './texto.js';
import { candidatosDeLema } from './lematiza.js';
import { buscarMejor, mapaConLimite } from './arasaac.js';

/** Una frase de comunicación no es un párrafo. */
const MAXIMO_PALABRAS = 30;

export async function extraeConceptosLocal(frase, idioma = 'es') {
  const todos = trocea(frase);
  const palabras = todos.slice(0, MAXIMO_PALABRAS);
  const avisos = [];

  if (todos.length > MAXIMO_PALABRAS) {
    avisos.push(
      `La frase se ha recortado a ${MAXIMO_PALABRAS} palabras. Para comunicación con pictogramas funcionan mejor las frases cortas.`,
    );
  }
  if (!palabras.length) return { conceptos: [], avisos };

  const ocupado = new Array(palabras.length).fill(false);
  const trozos = [];

  // --- Pasada 1: expresiones multipalabra -------------------------------
  const ngramas = ngramasCandidatos(palabras, 3);
  const encontrados = await mapaConLimite(ngramas, (n) => buscarMejor(n.texto, idioma));

  // Vienen ordenados de más largo a más corto, así que el emparejamiento
  // voraz da lo correcto: "parque infantil" gana sobre "parque" suelto.
  for (let i = 0; i < ngramas.length; i++) {
    if (!encontrados[i]) continue;
    const n = ngramas[i];

    let libre = true;
    for (let j = n.inicio; j < n.fin; j++) if (ocupado[j]) libre = false;
    if (!libre) continue;

    for (let j = n.inicio; j < n.fin; j++) ocupado[j] = true;
    trozos.push({
      posicion: n.inicio,
      texto: n.texto,
      candidatos: [n.texto],
      origen: 'expresion',
    });
  }

  // --- Pasada 2: palabras sueltas ---------------------------------------
  for (let i = 0; i < palabras.length; i++) {
    if (ocupado[i]) continue;
    const palabra = palabras[i];
    if (esVacia(palabra)) continue;

    trozos.push({
      posicion: i,
      texto: palabra,
      candidatos: candidatosDeLema(palabra),
      origen: 'palabra',
    });
  }

  trozos.sort((a, b) => a.posicion - b.posicion);

  if (!trozos.length && palabras.length) {
    avisos.push('Todas las palabras de la frase son conectores sin pictograma propio.');
  }

  return { conceptos: trozos, avisos };
}
