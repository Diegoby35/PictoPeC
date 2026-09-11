/**
 * Cliente de la API pública de ARASAAC. Sin clave ni registro.
 *
 *   search/{texto}      todos los resultados
 *   bestsearch/{texto}  el mejor
 *   static.arasaac.org/pictograms/{id}/{id}_{res}.png
 *
 * Dos detalles que condicionan el módulo: sin resultados devuelve 404 con
 * cuerpo `[]` (no un 200 vacío), y resuelve plurales pero no conjugaciones,
 * que es la razón de ser de lematiza.js.
 */

const BASE_API = 'https://api.arasaac.org/api';
const BASE_ESTATICO = 'https://static.arasaac.org/pictograms';

// El CDN solo sirve estas; otras dan 404.
const RESOLUCIONES = [300, 500, 2500];

const TIEMPO_LIMITE_MS = 8000;
const TTL_CACHE_MS = 1000 * 60 * 60 * 24;

/** Evita repetir la misma búsqueda dentro de una sesión. */
const cache = new Map();

const estadisticas = { peticiones: 0, aciertosCache: 0, errores: 0 };

/** URL de la imagen de un pictograma. */
export function urlPictograma(id, resolucion = 500) {
  const res = RESOLUCIONES.includes(resolucion) ? resolucion : 500;
  return `${BASE_ESTATICO}/${id}/${id}_${res}.png`;
}

/** Reduce la respuesta de la API a lo que usa la interfaz. */
function simplifica(picto) {
  const palabras = (picto.keywords ?? [])
    .map((k) => k.keyword)
    .filter(Boolean);

  return {
    id: picto._id,
    palabra: palabras[0] ?? '',
    palabras,
    url: urlPictograma(picto._id, 500),
    urlMiniatura: urlPictograma(picto._id, 300),
    // Hay perfiles que entienden mejor los concretos que los esquemáticos.
    esquematico: Boolean(picto.schematic),
    categorias: picto.categories ?? [],
  };
}

async function pideJson(url) {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), TIEMPO_LIMITE_MS);

  try {
    const respuesta = await fetch(url, {
      signal: control.signal,
      headers: { Accept: 'application/json' },
    });

    // 404 = no hay pictograma, no es un error.
    if (respuesta.status === 404) return [];
    if (!respuesta.ok) {
      throw new Error(`ARASAAC respondió ${respuesta.status} a ${url}`);
    }

    const datos = await respuesta.json();
    return Array.isArray(datos) ? datos : [];
  } finally {
    clearTimeout(temporizador);
  }
}

async function consultaConCache(clave, url) {
  const guardado = cache.get(clave);
  if (guardado && Date.now() - guardado.momento < TTL_CACHE_MS) {
    estadisticas.aciertosCache++;
    return guardado.valor;
  }

  estadisticas.peticiones++;
  try {
    const valor = await pideJson(url);
    cache.set(clave, { valor, momento: Date.now() });
    return valor;
  } catch (error) {
    estadisticas.errores++;
    // Una búsqueda fallida no tumba la frase: el concepto sale como hueco.
    console.warn(`[arasaac] fallo en "${clave}": ${error.message}`);
    return [];
  }
}

/** Mejor pictograma para un término, o null. */
export async function buscarMejor(termino, idioma = 'es') {
  const limpio = termino.trim().toLowerCase();
  if (!limpio) return null;

  const url = `${BASE_API}/pictograms/${idioma}/bestsearch/${encodeURIComponent(limpio)}`;
  const resultados = await consultaConCache(`mejor:${idioma}:${limpio}`, url);
  return resultados.length ? simplifica(resultados[0]) : null;
}

/** Todos los pictogramas de un término. Más laxo: "parque" da 53. */
export async function buscarTodos(termino, idioma = 'es', limite = 24) {
  const limpio = termino.trim().toLowerCase();
  if (!limpio) return [];

  const url = `${BASE_API}/pictograms/${idioma}/search/${encodeURIComponent(limpio)}`;
  const resultados = await consultaConCache(`todos:${idioma}:${limpio}`, url);
  return resultados.slice(0, limite).map(simplifica);
}

/**
 * Primer candidato que exista. `candidatos` va por orden de preferencia:
 * las consultas salen en paralelo pero gana el de menor índice, no el que
 * responda antes.
 */
export async function buscarPrimeroQueExista(candidatos, idioma = 'es') {
  const unicos = [...new Set(candidatos.map((c) => c.trim().toLowerCase()).filter(Boolean))];
  if (!unicos.length) return null;

  const resultados = await Promise.all(unicos.map((c) => buscarMejor(c, idioma)));

  for (let i = 0; i < resultados.length; i++) {
    if (resultados[i]) {
      return { ...resultados[i], terminoUsado: unicos[i] };
    }
  }
  return null;
}

export function estadisticasCache() {
  return { ...estadisticas, entradas: cache.size };
}

export function vaciaCache() {
  cache.clear();
}

/**
 * `fn` sobre todos los elementos con un tope de peticiones en vuelo.
 * ARASAAC es un servicio público: una frase larga puede generar treinta
 * búsquedas y no hay razón para lanzarlas de golpe. Conserva el orden.
 */
export async function mapaConLimite(elementos, fn, limite = 8) {
  const salida = new Array(elementos.length);
  let siguiente = 0;

  async function trabajador() {
    while (siguiente < elementos.length) {
      const i = siguiente++;
      salida[i] = await fn(elementos[i], i);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limite, elementos.length) }, trabajador),
  );
  return salida;
}
