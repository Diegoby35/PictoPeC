// Orquestador: frase -> secuencia de pictogramas.
// Los motores proponen hipótesis ordenadas; ARASAAC hace de diccionario y
// gana la primera que tenga pictograma.

import { buscarMejor, buscarPrimeroQueExista, buscarTodos, mapaConLimite } from './arasaac.js';
import { extraeConceptosLocal } from './nlp-local.js';
import { extraeConceptosConIA, componFraseNatural, estaDisponible } from './nlp-gemini.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const MOTORES = ['auto', 'local', 'ia'];
export const NIVELES = ['basico', 'intermedio', 'avanzado'];

/**
 * Categoría Fitzgerald de un lema, para colorear la celda.
 *
 * Terminar en -ar/-er/-ir casi siempre implica infinitivo. Casi: los
 * sustantivos frecuentes con esa terminación van aparte, porque "lugar"
 * pintado de verde le chirría a cualquiera que trabaje con tableros.
 */
const SUSTANTIVOS_EN_AR_ER_IR = new Set([
  'lugar', 'mar', 'bar', 'hogar', 'collar', 'altar', 'azúcar', 'pilar',
  'militar', 'par', 'mujer', 'taller', 'ayer', 'jersey', 'sartén',
]);

function categoriaDe(lema) {
  if (SUSTANTIVOS_EN_AR_ER_IR.has(lema)) return 'otro';
  // Sin mínimo de longitud: "ir" es un infinitivo de dos letras.
  return /(ar|er|ir)$/.test(lema) ? 'accion' : 'otro';
}

/**
 * Resuelve cada concepto a un pictograma. Gana el primer candidato que exista;
 * si no existe ninguno sale como hueco para que el cuidador lo resuelva.
 */
async function resuelvePictogramas(conceptos, idioma) {
  return mapaConLimite(conceptos, async (concepto) => {
    const encontrado = await buscarPrimeroQueExista(concepto.candidatos, idioma);
    const lema = encontrado?.terminoUsado ?? concepto.candidatos[0] ?? concepto.texto;

    return {
      texto: concepto.texto,
      // La IA devuelve la categoría real de las ocho; el motor local no hace
      // análisis sintáctico y la deduce por la terminación del lema.
      tipo: concepto.tipo ?? categoriaDe(lema),
      lema,
      pictograma: encontrado
        ? {
            id: encontrado.id,
            palabra: encontrado.palabra,
            url: encontrado.url,
            urlMiniatura: encontrado.urlMiniatura,
          }
        : null,
    };
  });
}

const SIN_SIMPLIFICAR = { aplicada: false, resumen: '', cambios: [] };

/**
 * Analiza una frase y devuelve su secuencia de pictogramas.
 *
 * En modo 'auto' se intenta la IA y se cae al motor local ante cualquier
 * problema: sin clave, sin SDK, API caída o respuesta inutilizable. Un
 * cuidador enseñándole la app a alguien no puede quedarse con la pantalla en
 * blanco porque falle una llamada de red.
 */
export async function analizaFrase(frase, opciones = {}) {
  const { motor = 'auto', nivel = 'intermedio', idioma = 'es' } = opciones;
  const arranque = Date.now();
  const texto = String(frase ?? '').trim();

  if (!texto) {
    return { frase: '', motor: 'local', nivel, conceptos: [], simplificacion: SIN_SIMPLIFICAR, avisos: [], ms: 0 };
  }

  const avisos = [];
  let extraccion = null;
  let motorUsado = 'local';

  if (motor === 'ia' || motor === 'auto') {
    try {
      extraccion = await extraeConceptosConIA(texto, { nivel });
      motorUsado = 'ia';
    } catch (error) {
      const detalle = error?.message ?? String(error);
      if (motor === 'ia') {
        // Petición explícita del motor de IA: se informa del fallo, pero
        // igualmente se entrega algo útil en vez de un error seco.
        const { motivo } = await estaDisponible();
        avisos.push(`No se pudo usar el motor de IA (${motivo ?? detalle}). Secuencia generada con el diccionario local.`);
      } else {
        console.warn(`[pipeline] motor de IA no disponible, se usa el local: ${detalle}`);
      }
    }
  }

  if (!extraccion) {
    extraccion = await extraeConceptosLocal(texto, idioma);
    motorUsado = 'local';
  }

  avisos.push(...(extraccion.avisos ?? []));

  const conceptos = await resuelvePictogramas(extraccion.conceptos, idioma);

  const huecos = conceptos.filter((c) => !c.pictograma);
  if (huecos.length) {
    const cuales = huecos.map((c) => `"${c.texto}"`).join(', ');
    avisos.push(`Sin pictograma para ${cuales}. Toca el hueco para buscar otra palabra.`);
  }

  return {
    frase: texto,
    motor: motorUsado,
    nivel,
    conceptos,
    simplificacion: extraccion.simplificacion ?? SIN_SIMPLIFICAR,
    avisos,
    ms: Date.now() - arranque,
  };
}

/** Alternativas para un concepto, cuando el cuidador quiere cambiar el pictograma. */
export async function alternativasPara(termino, idioma = 'es', limite = 24) {
  const resultados = await buscarTodos(termino, idioma, limite);
  return resultados.map((p) => ({
    id: p.id,
    palabra: p.palabra,
    palabras: p.palabras,
    url: p.url,
    urlMiniatura: p.urlMiniatura,
    esquematico: p.esquematico,
  }));
}


// --- Modo inverso: construir la frase tocando pictogramas ---

const AQUI = dirname(fileURLToPath(import.meta.url));

let vocabularioPrometido = null;

/**
 * Vocabulario con sus pictogramas resueltos. Se hace una vez por arranque:
 * son 175 búsquedas y no tiene sentido repetirlas en cada visita.
 */
export function cargaVocabulario(idioma = 'es') {
  vocabularioPrometido ??= (async () => {
    const datos = JSON.parse(
      readFileSync(join(AQUI, '..', 'data', 'vocabulario-nuclear.json'), 'utf8'),
    );

    const grupos = await Promise.all(
      datos.grupos.map(async (grupo) => {
        const palabras = await mapaConLimite(grupo.palabras, async (palabra) => {
          const encontrado = await buscarMejor(palabra.busca, idioma);
          if (!encontrado) return null; // se cae del tablero antes que salir roto
          return {
            texto: palabra.texto,
            lema: palabra.busca,
            tipo: palabra.tipo,
            pictograma: {
              id: encontrado.id,
              palabra: encontrado.palabra,
              url: encontrado.url,
              urlMiniatura: encontrado.urlMiniatura,
            },
          };
        });
        return { nombre: grupo.nombre, palabras: palabras.filter(Boolean) };
      }),
    );

    return grupos.filter((g) => g.palabras.length);
  })().catch((error) => {
    vocabularioPrometido = null; // que un fallo de red no lo deje roto para siempre
    throw error;
  });

  return vocabularioPrometido;
}

/**
 * Pictogramas tocados -> frase en español. Sin IA devuelve las palabras
 * seguidas, que es lo que da un tablero de papel: peor frase, misma
 * información.
 */
export async function componFrase(conceptos) {
  const palabras = (conceptos ?? []).map((c) => String(c).trim()).filter(Boolean);
  if (!palabras.length) return { frase: '', natural: false, anadido: [], avisos: [] };

  try {
    const { frase, anadido } = await componFraseNatural(palabras);
    return { frase, natural: true, anadido, avisos: [] };
  } catch (error) {
    const { motivo } = await estaDisponible();
    return {
      frase: palabras.join(' '),
      natural: false,
      anadido: [],
      avisos: [
        `No se pudo componer la frase con la IA (${motivo ?? error.message}). `
          + 'Se leen las palabras tal cual, como en un tablero de papel.',
      ],
    };
  }
}


/**
 * Tira corta para ilustrar un texto. Solo motor local: son muchas por
 * búsqueda y no merecen una llamada a la IA cada una.
 */
export async function tiraDePictogramas(texto, maximo = 5, idioma = 'es') {
  const { conceptos } = await extraeConceptosLocal(texto, idioma);
  const resueltos = await resuelvePictogramas(conceptos.slice(0, maximo), idioma);
  return resueltos.filter((c) => c.pictograma);
}
