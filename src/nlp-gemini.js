/**
 * Motor de IA (Gemini): simplificación adaptativa + extracción de conceptos.
 *
 * El proveedor queda encapsulado aquí: pipeline.js solo conoce
 * `extraeConceptosConIA`, así que cambiarlo toca un fichero.
 *
 * Hace lo que ninguna tabla puede: decidir si una frase es demasiado compleja
 * para quien la va a leer y reescribirla antes de buscar pictogramas. Igual
 * que nlp-local.js, solo propone conceptos; resolverlos es de pipeline.js.
 *
 * SDK cargado en diferido: sin `npm install` o sin clave, el pipeline se
 * queda con el motor local sin romperse.
 */

import { trocea } from './texto.js';
import { candidatosDeLema } from './lematiza.js';

// Flash-Lite: ~2-4 s. Los Flash grandes razonan mejor pero pasan de 20 s, que
// es inusable con alguien esperando. `npm run ia -- --modelos` lista los tuyos.
const MODELO = process.env.PICTOPEC_MODELO || 'gemini-3.1-flash-lite';

let clientePrometido = null;

async function obtenCliente() {
  if (!process.env.GEMINI_API_KEY) throw new Error('SIN_CLAVE');

  clientePrometido ??= import('@google/genai')
    .then(({ GoogleGenAI }) => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }))
    .catch(() => {
      clientePrometido = null; // permite reintentar tras un `npm install`
      throw new Error('SIN_SDK');
    });
  return clientePrometido;
}

/** ¿Está el motor de IA realmente disponible ahora mismo? */
export async function estaDisponible() {
  try {
    await obtenCliente();
    return { disponible: true, proveedor: 'Gemini', modelo: MODELO };
  } catch (error) {
    const motivos = {
      SIN_CLAVE: 'Falta GEMINI_API_KEY. Copia .env.example a .env y añade tu clave de Google AI Studio.',
      SIN_SDK: 'Falta el SDK. Ejecuta: npm install @google/genai',
    };
    return { disponible: false, motivo: motivos[error.message] ?? error.message };
  }
}

/** Modelos que admite la clave. */
export async function listaModelos() {
  const cliente = await obtenCliente();
  const pagina = await cliente.models.list();
  const salida = [];

  for await (const modelo of pagina) {
    const acciones = modelo.supportedActions ?? [];
    if (acciones.length && !acciones.includes('generateContent')) continue;
    salida.push({
      nombre: String(modelo.name ?? '').replace(/^models\//, ''),
      descripcion: modelo.displayName ?? '',
    });
  }
  return salida;
}

// Los niveles no cambian solo cuántos conceptos salen, sino sobre todo
// cuánto se le permite al modelo inventar.

export const NIVELES = {
  basico: `NIVEL BÁSICO — como mucho 4 conceptos.

Solo el esqueleto: quién, qué acción, sobre qué. Fuera cualidades,
circunstancias, cortesía y matices. Vocabulario nuclear, de uso diario.

La CONCRECIÓN está permitida y se espera: a este nivel un pictograma concreto
comunica y uno abstracto no. Pero cada concreción se anota, sin excepción.`,

  intermedio: `NIVEL INTERMEDIO — normalmente entre 4 y 7 conceptos.

Frase telegráfica completa. Se conservan la negación, la cantidad, el tiempo y
las cualidades que cambian el sentido de lo que se dice.

La CONCRECIÓN solo se permite cuando el término general no puede tener
pictograma de ninguna manera. Si dudas, no concretes.`,

  avanzado: `NIVEL AVANZADO — hasta 12 conceptos. Casi literal.

Se conserva todo el contenido: cualidades, circunstancias y los conectores que
tengan pictograma propio.

La CONCRECIÓN está PROHIBIDA a este nivel. Si un término es abstracto, se deja
tal cual y se acepta que la búsqueda no encuentre pictograma. Un hueco honesto
en el tablero vale más que una sustitución inventada: el hueco lo ve el
cuidador y lo resuelve; la sustitución pasa desapercibida.`,
};

const INSTRUCCIONES = `Ayudas a construir tableros de comunicación aumentativa y alternativa (SAAC)
con pictogramas de ARASAAC, para personas con autismo, discapacidad intelectual
o dificultades del lenguaje.

Recibes una frase en español escrita por un cuidador, terapeuta o familiar.
Devuelves la secuencia de conceptos que hay que mostrar y, para cada uno, el
término exacto con el que buscarlo en ARASAAC.

═══ LO QUE ESTÁ EN JUEGO ═══

El tablero habla EN NOMBRE DE la persona. Cada palabra que añades es una
palabra que ella no ha dicho, y que otros van a tratar como suya.

Por eso distingues siempre entre dos operaciones distintas:

  REDUCCIÓN — quitas lo que no es esencial. No cambia lo que se dice.
      "me apetece" → querer
      "vamos a ir a" → ir

  CONCRECIÓN — sustituyes algo general o abstracto por un ejemplar concreto.
      SÍ cambia lo que se dice.
      "algo dulce" → galleta
      "un sitio tranquilo" → casa

  La concreción es a veces imprescindible: un pictograma necesita un referente
  concreto y "algo dulce" no lo tiene. Pero si alguien pide "algo dulce" y el
  tablero dice "galleta", le ofrecerán una galleta cuando quizá quería otra
  cosa. Cuando concretes, elige el ejemplar MÁS NEUTRO Y FRECUENTE que sirva, y
  anótalo siempre en 'cambios' con tipo "concrecion".

═══ CUÁNDO NO HAY QUE TOCAR NADA ═══

La mayoría de las frases que te llegan ya son simples. Si la frase ya encaja en
el nivel pedido, NO la reescribas: devuelve sus conceptos tal cual, pon
'simplificada' a false y deja 'cambios' vacío.

Reescribir "quiero agua" solo puede empeorarlo. La simplificación es para las
frases que de verdad no caben, no un trámite por el que pasa todo.

═══ CÓMO SE BUSCA EN ARASAAC ═══

- Verbos siempre en infinitivo: "vamos" es "ir", "comimos" es "comer".
- Sustantivos en masculino singular cuando exista esa forma, salvo que el
  género importe de verdad en la frase.
- En minúsculas y con sus tildes. ARASAAC distingue "papa" de "papá".
- Si existe un pictograma único para una expresión de varias palabras, úsala
  entera como un solo concepto: "parque infantil", "cuarto de baño", "por
  favor", "lavarse las manos". Un pictograma bueno vale más que dos aproximados.

═══ QUÉ SE QUITA Y QUÉ NO SE PUEDE QUITAR ═══

El lenguaje pictográfico es telegráfico: se quitan artículos, preposiciones,
conjunciones, y "ser", "estar" y "haber" cuando solo hacen de cópula.

Pero hay palabras que NO se pueden quitar a ningún nivel, porque cambian lo
que la frase dice, y todas tienen pictograma propio:

- La negación: "no", "nunca", "nada", "ninguno".
  Perder un "no" convierte una negativa en una afirmativa. Es el peor fallo
  posible en una herramienta de comunicación, y simplificar es justo cuando
  más fácil es cometerlo.
- Los interrogativos: "qué", "quién", "dónde", "cuándo", "cómo", "por qué".
- Los pronombres personales: "yo", "tú", "él", "ella", "nosotros".
- Cantidad y comparación: "más", "menos", "mucho", "poco", "todo".
- Tiempo: "hoy", "mañana", "ayer", "ahora", "después", "antes".

═══ NO INVIERTAS LA DIRECCIÓN DEL ENUNCIADO ═══

"¿Quieres comer?" es una pregunta que alguien le hace a la persona.
"Quiero comer" es lo que la persona dice.

No son lo mismo y no se pueden intercambiar. Conserva quién habla a quién.

Si la frase es una pregunta, el tablero tiene que seguir siendo una pregunta,
aunque haya que recortar mucho. Conserva el verbo principal, que es donde está
la pregunta: "¿Quieres que vayamos al parque?" en nivel básico es
querer · ir · parque, NO ir · parque. Quitar el "querer" convierte una
propuesta en una orden.

═══ QUÉ CUENTA COMO SIMPLIFICAR ═══

Quitar artículos, preposiciones, conjunciones y cópulas NO es simplificar: es
el funcionamiento telegráfico normal, y pasa en todas las frases.

'simplificada' solo es true si has quitado CONTENIDO (una circunstancia, una
cualidad, una parte de la frase) o si has concretado algo. Si lo único que has
hecho es dejar la frase en telegrama, 'simplificada' es false y 'cambios' va
vacío. Si no, el cuidador acaba revisando avisos que no dicen nada y deja de
mirarlos justo cuando uno importa.

═══ ORDEN ═══

Los conceptos van en el mismo orden en que se leen en la frase original. Si
simplificas, mantén el orden natural sujeto-acción-objeto.

═══ EL RESUMEN ═══

'resumen' es una frase corta dirigida al cuidador, en lenguaje llano, que le
diga qué has hecho y por qué. Nada de jerga. Si no has simplificado, cadena
vacía.

Responde únicamente con el JSON que pide el esquema.`;

/* Esquema de salida. Gemini admite JSON Schema real en responseJsonSchema,
   así que es el mismo que ya estaba diseñado. */
const ESQUEMA = {
  type: 'object',
  properties: {
    conceptos: {
      type: 'array',
      description: 'Conceptos en el orden en que se mostrarán, de izquierda a derecha.',
      items: {
        type: 'object',
        properties: {
          texto: {
            type: 'string',
            description: 'Las palabras de la frase original de las que sale este concepto.',
          },
          lema: {
            type: 'string',
            description:
              'Término exacto para buscar en ARASAAC: infinitivo si es verbo, singular si es sustantivo, en minúsculas y con tildes.',
          },
          tipo: {
            type: 'string',
            enum: ['persona', 'accion', 'objeto', 'lugar', 'cualidad', 'tiempo', 'social', 'otro'],
            description:
              'Categoría del concepto, para colorear el pictograma según la clave Fitzgerald de los tableros SAAC.',
          },
        },
        required: ['texto', 'lema', 'tipo'],
      },
    },
    simplificada: {
      type: 'boolean',
      description:
        'true solo si has reescrito la frase para que quepa en el nivel. false si ya encajaba y solo has extraído sus conceptos.',
    },
    resumen: {
      type: 'string',
      description:
        'Una frase corta y llana para el cuidador explicando qué simplificaste y por qué. Cadena vacía si no simplificaste.',
    },
    cambios: {
      type: 'array',
      description: 'Un elemento por cada transformación con contenido. Vacío si no simplificaste.',
      items: {
        type: 'object',
        properties: {
          de: { type: 'string', description: 'Lo que decía la frase original.' },
          a: { type: 'string', description: 'En qué se ha convertido.' },
          tipo: {
            type: 'string',
            enum: ['reduccion', 'concrecion'],
            description:
              'reduccion: has quitado algo no esencial sin cambiar el significado. concrecion: has sustituido algo general o abstracto por un ejemplar concreto, y eso SÍ cambia lo que se dice.',
          },
        },
        required: ['de', 'a', 'tipo'],
      },
    },
  },
  required: ['conceptos', 'simplificada', 'resumen', 'cambios'],
};

// Los filtros vienen calibrados para contenido general y este dominio no lo
// es: "me duele la barriga", "no quiero ir al médico", "estoy triste". Un
// bloqueo espurio deja a alguien sin comunicarse. No se apagan del todo
// porque la entrada es texto libre.
const SEGURIDAD = [
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
].map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' }));

/** Vacío = lo decide el modelo; 0 = sin razonamiento previo, más rápido. */
function configuracionDePensamiento() {
  const crudo = process.env.PICTOPEC_PENSAR;
  if (crudo === undefined || crudo === '') return undefined;
  const presupuesto = Number(crudo);
  return Number.isFinite(presupuesto) ? { thinkingBudget: presupuesto } : undefined;
}

function compruebaBloqueo(respuesta) {
  const motivo = respuesta?.promptFeedback?.blockReason;
  if (motivo) {
    throw new Error(`Gemini bloqueó la petición por sus filtros (${motivo}).`);
  }

  const fin = respuesta?.candidates?.[0]?.finishReason;
  if (fin && !['STOP', 'MAX_TOKENS'].includes(fin)) {
    throw new Error(`Gemini no completó la respuesta (${fin}).`);
  }
}

function parseaJson(texto) {
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    // Red de seguridad por si el modelo envuelve el JSON en texto o en un
    // bloque de código, aunque responseMimeType debería evitarlo.
    const encaje = texto.match(/\{[\s\S]*\}/);
    if (!encaje) return null;
    try {
      return JSON.parse(encaje[0]);
    } catch {
      return null;
    }
  }
}

/**
 * Deshace las concreciones en nivel avanzado.
 *
 * El prompt las prohíbe, pero medido contra el modelo real no siempre
 * obedece. Una regla de seguridad no puede depender de que la cumpla.
 *
 * Al revertir el lema, ARASAAC probablemente no encuentre pictograma: ese
 * hueco es justo lo prometido, porque el cuidador lo ve y lo resuelve,
 * mientras que una sustitución inventada pasa desapercibida.
 */
function deshazConcreciones(resultado) {
  const concreciones = (resultado.cambios ?? []).filter((c) => c?.tipo === 'concrecion');
  if (!concreciones.length) return;

  for (const concrecion of concreciones) {
    const inventado = String(concrecion.a ?? '').trim().toLowerCase();
    const original = String(concrecion.de ?? '').trim();
    if (!inventado || !original) continue;

    for (const concepto of resultado.conceptos ?? []) {
      if (String(concepto.lema ?? '').trim().toLowerCase() !== inventado) continue;
      concepto.lema = original.toLowerCase();
      concepto.texto = original;
    }
  }

  resultado.cambios = (resultado.cambios ?? []).filter((c) => c?.tipo !== 'concrecion');
  resultado.simplificada = true;

  // El resumen describía la concreción que acabamos de deshacer, así que ya
  // no dice la verdad. Un resumen que no corresponde con el tablero es peor
  // que ninguno.
  const devueltos = concreciones.map((c) => `«${c.de}»`).join(', ');
  resultado.resumen =
    `El nivel avanzado no permite sustituir un término por otro más concreto, así que `
    + `${devueltos} se ha dejado tal cual. Puede quedarse sin pictograma: si es así, `
    + `toca el hueco y elige tú la palabra.`;
}

/**
 * Frase -> conceptos, simplificándola si no cabe en el nivel. Lanza si el
 * motor no está o la respuesta no sirve; pipeline.js decide si cae al local.
 */
export async function extraeConceptosConIA(frase, { nivel = 'intermedio' } = {}) {
  const cliente = await obtenCliente();
  const guiaNivel = NIVELES[nivel] ?? NIVELES.intermedio;

  const respuesta = await cliente.models.generateContent({
    model: MODELO,
    contents: `Frase: ${frase}`,
    config: {
      systemInstruction: `${INSTRUCCIONES}\n\n${guiaNivel}`,
      responseMimeType: 'application/json',
      responseJsonSchema: ESQUEMA,
      // Esto no es creativo: son reglas a cumplir igual cada vez, y una de
      // ellas es que no se pierda la negación.
      temperature: 0,
      maxOutputTokens: 4096,
      safetySettings: SEGURIDAD,
      thinkingConfig: configuracionDePensamiento(),
    },
  });

  compruebaBloqueo(respuesta);

  const resultado = parseaJson(respuesta.text);
  if (!resultado?.conceptos?.length) {
    throw new Error('El modelo no devolvió ningún concepto utilizable.');
  }

  if (nivel === 'avanzado') deshazConcreciones(resultado);

  const conceptos = resultado.conceptos
    .filter((c) => c?.lema)
    .map((concepto, posicion) => {
      const lema = String(concepto.lema).trim().toLowerCase();
      const texto = String(concepto.texto ?? lema).trim();

      // Detrás del lema del modelo van las hipótesis locales: si propone un
      // término sin pictograma, las reglas aún tienen una oportunidad.
      const palabras = trocea(texto);
      const respaldo = palabras.length === 1 ? candidatosDeLema(palabras[0]) : [];

      return {
        posicion,
        texto,
        candidatos: [...new Set([lema, ...respaldo])],
        tipo: concepto.tipo ?? 'otro',
      };
    });

  const cambios = (resultado.cambios ?? [])
    .filter((c) => c?.de && c?.a)
    .map((c) => ({
      de: String(c.de),
      a: String(c.a),
      tipo: c.tipo === 'concrecion' ? 'concrecion' : 'reduccion',
    }));

  return {
    conceptos,
    avisos: [],
    simplificacion: {
      aplicada: Boolean(resultado.simplificada),
      resumen: String(resultado.resumen ?? '').trim(),
      cambios,
    },
    modelo: MODELO,
  };
}

// --- Modo inverso: de pictogramas tocados a frase en español ---

const INSTRUCCIONES_FRASE = `Una persona que usa un tablero de comunicación aumentativa acaba de tocar
unos pictogramas, en este orden. Tu trabajo es escribir lo que está diciendo,
en español bien formado, para que se lea en voz alta.

═══ LA REGLA QUE MANDA SOBRE TODAS ═══

Vas a hablar POR ella. Solo puedes añadir lo que la gramática española exige:
artículos, preposiciones, el verbo "ser" o "estar" cuando hace de cópula,
la conjugación y la concordancia.

NO puedes añadir contenido. Ni un verbo, ni un sustantivo, ni un adjetivo, ni
un adverbio que ella no haya tocado.

  yo · ir · casa        → "Voy a casa"            ✓
                        → "Quiero ir a casa"      ✗  «quiero» no lo ha tocado
  querer · agua         → "Quiero agua"           ✓
                        → "Quiero agua, por favor" ✗  la cortesía no la ha tocado

Si la secuencia queda rara o incompleta, escríbela rara pero fiel. Una frase
pobre que dice lo que ella quiso decir es infinitamente mejor que una frase
redonda que dice otra cosa.

═══ LA NEGACIÓN ═══

Si ha tocado "no", la frase es negativa. Sin excepciones. Convertir una
negativa en afirmativa es el peor fallo posible en una herramienta de
comunicación.

═══ QUIÉN HABLA ═══

Habla ella, así que si no hay pronombre la frase va en primera persona del
singular: querer · comer → "Quiero comer".

Si ha tocado un interrogativo ("qué", "dónde", "quién", "cuándo", "cómo",
"por qué"), la frase es una pregunta y lleva sus signos: dónde · mamá →
"¿Dónde está mamá?".

═══ CÓMO SUENA ═══

Es alguien hablando, no escribiendo. Frases cortas, naturales, sin florituras.
El orden en que ha tocado los pictogramas es su intención: consérvalo salvo
que el español obligue a cambiarlo.

En 'anadido' pon las palabras con contenido que hayas tenido que añadir y que
NO estuvieran entre los pictogramas. Lo normal es que vaya vacío. Los
artículos, preposiciones y cópulas no cuentan: esos son gramática.`;

const ESQUEMA_FRASE = {
  type: 'object',
  properties: {
    frase: {
      type: 'string',
      description: 'La frase en español, lista para leerse en voz alta.',
    },
    anadido: {
      type: 'array',
      description:
        'Palabras con contenido añadidas que no estaban entre los pictogramas tocados. Vacío casi siempre.',
      items: { type: 'string' },
    },
  },
  required: ['frase', 'anadido'],
};

/** Si se tocó una negación, tiene que aparecer en la frase. */
const NEGACIONES = /\b(no|nunca|nada|ning[úu]n|ninguna?|tampoco|jam[áa]s|sin)\b/i;

/**
 * Pictogramas tocados -> frase en español.
 *
 * `anadido` recoge lo que el modelo puso de su cosecha. Debería ir vacío, y
 * si no, la interfaz lo enseña: mismo principio que las concreciones, porque
 * el riesgo es el mismo, hablar por alguien con palabras que no ha elegido.
 */
export async function componFraseNatural(conceptos) {
  const palabras = (conceptos ?? []).map((c) => String(c).trim()).filter(Boolean);
  if (!palabras.length) throw new Error('No hay pictogramas que convertir.');

  const cliente = await obtenCliente();

  const respuesta = await cliente.models.generateContent({
    model: MODELO,
    contents: `Pictogramas tocados, en orden: ${palabras.join(' · ')}`,
    config: {
      systemInstruction: INSTRUCCIONES_FRASE,
      responseMimeType: 'application/json',
      responseJsonSchema: ESQUEMA_FRASE,
      temperature: 0,
      maxOutputTokens: 1024,
      safetySettings: SEGURIDAD,
      thinkingConfig: configuracionDePensamiento(),
    },
  });

  compruebaBloqueo(respuesta);

  const resultado = parseaJson(respuesta.text);
  const frase = String(resultado?.frase ?? '').trim();
  if (!frase) throw new Error('El modelo no devolvió ninguna frase.');

  // La negación no se deja a criterio del modelo. Es la única comprobación
  // determinista posible, y resulta ser la que más importa.
  const tocoNegacion = palabras.some((p) => /^(no|nunca|nada)$/i.test(p));
  if (tocoNegacion && !NEGACIONES.test(frase)) {
    throw new Error(`La frase generada perdió la negación: "${frase}"`);
  }

  return {
    frase,
    anadido: (resultado?.anadido ?? []).map((p) => String(p).trim()).filter(Boolean),
  };
}
