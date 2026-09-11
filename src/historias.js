/**
 * Catálogo de historias sociales de ARASAAC.
 *
 * Tienen cientos publicadas por profesionales, así que se buscan en su API de
 * materiales en vez de inventarlas.
 *
 * Ojo: la API da el nombre del fichero de portada pero no una URL servible —
 * los patrones del CDN dan 404 y la ficha es una SPA. Por eso cada historia
 * se ilustra con pictogramas de su propio título (ver tiraDePictogramas).
 */

const BASE_API = 'https://api.arasaac.org/api';
const BASE_FICHA = 'https://arasaac.org/materials';

const TIEMPO_LIMITE_MS = 20000;

const cache = new Map();
const TTL_CACHE_MS = 1000 * 60 * 60 * 6;

function tituloYDescripcion(material, idioma) {
  const traducciones = material.translations ?? [];
  const propia = traducciones.find((t) => t.language === idioma);
  const cualquiera = propia ?? traducciones[0] ?? {};

  return {
    titulo: String(cualquiera.title ?? '').trim(),
    descripcion: String(cualquiera.desc ?? '').trim(),
  };
}

function autores(material) {
  return (material.authors ?? [])
    .map((a) => a?.author?.name)
    .filter(Boolean)
    .slice(0, 3);
}

/**
 * Busca materiales en ARASAAC.
 * Devuelve la ficha en crudo; quien llama decide cómo ilustrarla.
 */
export async function buscaHistorias(consulta, idioma = 'es', limite = 24) {
  const termino = String(consulta ?? '').trim() || 'historia social';
  const clave = `${idioma}:${termino.toLowerCase()}`;

  const guardado = cache.get(clave);
  if (guardado && Date.now() - guardado.momento < TTL_CACHE_MS) return guardado.valor;

  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), TIEMPO_LIMITE_MS);

  try {
    const url = `${BASE_API}/materials/${idioma}/${encodeURIComponent(termino)}`;
    const respuesta = await fetch(url, { signal: control.signal, headers: { Accept: 'application/json' } });

    if (respuesta.status === 404) return [];
    if (!respuesta.ok) throw new Error(`ARASAAC respondió ${respuesta.status}`);

    const datos = await respuesta.json();
    if (!Array.isArray(datos)) return [];

    const historias = datos
      .map((material) => {
        const { titulo, descripcion } = tituloYDescripcion(material, idioma);
        if (!titulo) return null;
        return {
          id: material.idMaterial,
          titulo,
          descripcion,
          autores: autores(material),
          ficha: `${BASE_FICHA}/${idioma}/${material.idMaterial}`,
        };
      })
      .filter(Boolean)
      .slice(0, limite);

    cache.set(clave, { valor: historias, momento: Date.now() });
    return historias;
  } finally {
    clearTimeout(temporizador);
  }
}
