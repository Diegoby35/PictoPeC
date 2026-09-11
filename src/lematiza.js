/**
 * Lematizador orientado a búsqueda de pictogramas.
 *
 * No es un analizador morfológico: genera hipótesis ORDENADAS y deja que
 * ARASAAC haga de diccionario, ganando la primera que tenga pictograma.
 * Orden: palabra literal, irregulares, reflexivo, futuro, sufijos, singular.
 *
 * Que la literal vaya primera es lo que hace seguras las reglas agresivas:
 * "-o -> -ar" convertiría "libro" en "librar", pero nunca llega a probarse.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));

// El JSON va infinitivo -> formas, que es más legible de mantener.
const FORMA_A_INFINITIVO = (() => {
  const crudo = JSON.parse(
    readFileSync(join(AQUI, '..', 'data', 'irregulares-es.json'), 'utf8'),
  );
  const mapa = new Map();
  for (const [infinitivo, formas] of Object.entries(crudo)) {
    if (infinitivo.startsWith('_')) continue;
    for (const forma of formas) mapa.set(forma, infinitivo);
  }
  return mapa;
})();

// Sufijo conjugado -> terminaciones de infinitivo. De más largo a más corto:
// "comíamos" debe casar con "íamos", no con "amos".
const REGLAS_SUFIJO = [
  // Gerundios
  ['ándose', ['ar']], ['iéndose', ['er', 'ir']],
  ['ando', ['ar']], ['iendo', ['er', 'ir']], ['yendo', ['er', 'ir']],
  // Participios (con sus formas de género y número)
  ['ados', ['ar']], ['adas', ['ar']], ['ado', ['ar']], ['ada', ['ar']],
  ['idos', ['er', 'ir']], ['idas', ['er', 'ir']], ['ido', ['er', 'ir']], ['ida', ['er', 'ir']],
  // Pretérito perfecto simple
  ['asteis', ['ar']], ['aste', ['ar']], ['aron', ['ar']],
  ['isteis', ['er', 'ir']], ['iste', ['er', 'ir']], ['ieron', ['er', 'ir']],
  ['ió', ['er', 'ir']],
  // Imperfecto
  ['ábamos', ['ar']], ['abais', ['ar']], ['aban', ['ar']], ['abas', ['ar']], ['aba', ['ar']],
  ['íamos', ['er', 'ir']], ['íais', ['er', 'ir']], ['ían', ['er', 'ir']], ['ías', ['er', 'ir']], ['ía', ['er', 'ir']],
  // Presente
  ['amos', ['ar']], ['áis', ['ar']],
  ['emos', ['er']], ['éis', ['er']],
  ['imos', ['ir']], ['ís', ['ir']],
  ['an', ['ar']], ['as', ['ar']],
  ['en', ['er', 'ir']], ['es', ['er', 'ir']],
  ['ó', ['ar']], ['é', ['ar']], ['í', ['er', 'ir']],
  ['a', ['ar']], ['e', ['er', 'ir']],
  ['o', ['ar', 'er', 'ir']],
].sort((a, b) => b[0].length - a[0].length);

// Futuro y condicional se forman sobre el infinitivo entero.
const SUFIJOS_FUTURO = ['íamos', 'íais', 'ían', 'ías', 'ía', 'emos', 'éis', 'án', 'ás', 'á', 'é'];

function reemplazaUltima(texto, busca, pone) {
  const i = texto.lastIndexOf(busca);
  return i === -1 ? texto : texto.slice(0, i) + pone + texto.slice(i + busca.length);
}

/** quier- -> quer-, cuent- -> cont-, juegu- -> jug- */
function desdiptonga(raiz) {
  const salida = [];
  if (raiz.includes('ie')) salida.push(reemplazaUltima(raiz, 'ie', 'e'));
  if (raiz.includes('ue')) {
    salida.push(reemplazaUltima(raiz, 'ue', 'o'));
    salida.push(reemplazaUltima(raiz, 'ue', 'u'));
  }
  return salida;
}

/** busqu- -> busc-, llegu- -> lleg-, empec- -> empez-, dirij- -> dirig- */
function variantesOrtograficas(raiz) {
  const salida = [];
  if (raiz.endsWith('qu')) salida.push(raiz.slice(0, -2) + 'c');
  if (raiz.endsWith('gu')) salida.push(raiz.slice(0, -2) + 'g');
  if (raiz.endsWith('c')) salida.push(raiz.slice(0, -1) + 'z');
  if (raiz.endsWith('j')) salida.push(raiz.slice(0, -1) + 'g');
  if (raiz.endsWith('z')) salida.push(raiz.slice(0, -1) + 'c');
  return salida;
}

/** ARASAAC resuelve casi todos los plurales, pero no los de -ces. */
export function singulariza(palabra) {
  if (palabra.length < 4) return null;
  if (/ces$/.test(palabra)) return palabra.slice(0, -3) + 'z';       // lápices -> lápiz
  if (/[^aeiouáéíóú]es$/.test(palabra)) return palabra.slice(0, -2); // flores -> flor
  if (/s$/.test(palabra)) return palabra.slice(0, -1);               // casas -> casa
  return null;
}

// Enclíticos: "lavarnos", "ponte", "cuéntame". De más largo a más corto para
// quitar "melo" antes que "me".
const CLITICOS = [
  'melo', 'mela', 'melos', 'melas', 'telo', 'tela', 'telos', 'telas',
  'selo', 'sela', 'selos', 'selas', 'noslo', 'nosla', 'oslo', 'osla',
  'me', 'te', 'se', 'nos', 'os', 'lo', 'la', 'le', 'los', 'las', 'les',
].sort((a, b) => b.length - a.length);

const MAPA_TILDES = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' };

/** Quita tildes, conservando eñe y diéresis. */
function quitaTildes(texto) {
  return texto.replace(/[áéíóú]/g, (c) => MAPA_TILDES[c]);
}

/**
 * Quita el enclítico y devuelve las raíces posibles.
 *
 * El clítico añade tilde al pegarse ("cuenta" + "me" = "cuéntame"), así que
 * se devuelve también la raíz sin tilde. Genera falsos positivos inevitables
 * ("gatos" parece "gat" + "os"), inofensivos porque van al final y la palabra
 * literal ya ha ganado.
 */
function quitaCliticos(palabra) {
  for (const clitico of CLITICOS) {
    if (!palabra.endsWith(clitico)) continue;
    const raiz = palabra.slice(0, -clitico.length);
    // Se admiten raíces de dos letras ("dame" -> "da", "dime" -> "di"):
    // las reglas de sufijo ya exigen raíz de 2 por su cuenta, así que una
    // raíz corta y absurda simplemente no genera nada.
    if (raiz.length < 2) continue;

    const sinTilde = quitaTildes(raiz);
    // La versión sin tilde va primero: la tilde la ha puesto el propio
    // clítico, así que la forma limpia es la que de verdad se busca. Importa
    // porque ARASAAC ignora las tildes al buscar y, sin esto, "levántate"
    // acabaría etiquetado como "levántar" en pantalla.
    return sinTilde === raiz ? [raiz] : [sinTilde, raiz];
  }
  return [];
}

/** Reglas de derivación. `conCliticos` corta la recursión sobre la raíz. */
function aplicaReglas(palabra, anade, conCliticos = true) {
  // Irregulares: certezas, van pronto.
  const irregular = FORMA_A_INFINITIVO.get(palabra);
  if (irregular) anade(irregular, true);

  // Reflexivos: "lavarse" -> "lavar".
  if (/(ar|er|ir)se$/.test(palabra)) anade(palabra.slice(0, -2));

  // Futuro y condicional: se forman sobre el infinitivo completo.
  for (const sufijo of SUFIJOS_FUTURO) {
    if (!palabra.endsWith(sufijo)) continue;
    const base = palabra.slice(0, -sufijo.length);
    if (/(ar|er|ir)$/.test(base)) anade(base);
  }

  // Sufijos, con variantes de raíz.
  for (const [sufijo, terminaciones] of REGLAS_SUFIJO) {
    if (!palabra.endsWith(sufijo)) continue;
    const raiz = palabra.slice(0, -sufijo.length);
    if (raiz.length < 2) continue;

    for (const r of [raiz, ...desdiptonga(raiz), ...variantesOrtograficas(raiz)]) {
      for (const t of terminaciones) anade(r + t);
    }
    // La lista va de sufijo más largo a más corto: la primera que casa
    // es ya la más específica.
    break;
  }

  // Por si ARASAAC no resuelve ese plural concreto.
  anade(singulariza(palabra));

  // Enclíticos, al final: "ponte" -> "pon" -> "poner".
  if (conCliticos) {
    for (const raiz of quitaCliticos(palabra)) {
      // Llevar enclítico implica ser forma verbal: los átonos solo se pegan
      // a infinitivo, gerundio e imperativo. Por eso se toman las
      // derivaciones verbales pero no la raíz tal cual, que suele ser un
      // sustantivo homógrafo: "cuéntame" debe dar "contar", no "cuenta".
      if (/(ar|er|ir)$/.test(raiz)) anade(raiz);
      aplicaReglas(raiz, anade, false);
    }
  }
}

/** Hipótesis de lema, de más probable a menos. La original va primera. */
export function candidatosDeLema(palabra, maximo = 12) {
  const vistos = new Set();
  const salida = [];

  // `curado`: lo tecleado por el usuario y el mapa de irregulares. Se saltan
  // el mínimo de longitud, que si no descartaría "ir" o "tú".
  const anade = (candidato, curado = false) => {
    if (!candidato) return;
    if (!curado && candidato.length < 3) return;
    if (vistos.has(candidato)) return;
    vistos.add(candidato);
    salida.push(candidato);
  };

  anade(palabra, true);
  aplicaReglas(palabra, anade);

  return salida.slice(0, maximo);
}
