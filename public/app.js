// PictoPeC — interfaz. Sin framework ni compilación.

'use strict';

const $ = (sel) => document.querySelector(sel);

const el = {
  frase: $('#frase'),
  crear: $('#crear'),
  limpiar: $('#limpiar'),
  dictar: $('#dictar'),
  instalar: $('#instalar'),
  avisos: $('#avisos'),
  resultado: $('#resultado'),
  fraseEco: $('#frase-eco'),
  secuencia: $('#secuencia'),
  estado: $('#estado'),
  volver: $('#volver'),
  nivel: $('#nivel'),
  nivelNota: $('#nivel-nota'),
  simplificacion: $('#simplificacion'),
  simplificacionResumen: $('#simplificacion-resumen'),
  simplificacionCambios: $('#simplificacion-cambios'),
  guardar: $('#guardar'),
  azulejoGuardados: $('#azulejo-guardados'),
  azulejoGuardadosPie: $('#azulejo-guardados-pie'),
  listaGuardados: $('#lista-guardados'),
  tira: $('#tira'),
  tiraVacia: $('#tira-vacia'),
  vocabulario: $('#vocabulario'),
  decir: $('#decir'),
  borrarUltimo: $('#borrar-ultimo'),
  vaciar: $('#vaciar'),
  fraseNatural: $('#frase-natural'),
  fraseNaturalTexto: $('#frase-natural-texto'),
  fraseNaturalAviso: $('#frase-natural-aviso'),
  repetir: $('#repetir'),
  guardarConstruida: $('#guardar-construida'),
  buscarPicto: $('#buscar-picto'),
  buscarPictoBtn: $('#buscar-picto-btn'),
  resultadosBusqueda: $('#resultados-busqueda'),
  resultadosBusquedaTitulo: $('#resultados-busqueda-titulo'),
  resultadosBusquedaRejilla: $('#resultados-busqueda-rejilla'),
  buscarHistoria: $('#buscar-historia'),
  buscarHistoriaBtn: $('#buscar-historia-btn'),
  listaHistorias: $('#lista-historias'),
  leer: $('#leer'),
  presentar: $('#presentar'),
  imprimir: $('#imprimir'),
  salirPresentacion: $('#salir-presentacion'),
  panel: $('#panel'),
  panelTitulo: $('#panel-titulo'),
  panelSub: $('#panel-sub'),
  panelBusqueda: $('#panel-busqueda'),
  panelBuscar: $('#panel-buscar'),
  panelRejilla: $('#panel-rejilla'),
};

/** Última secuencia analizada. Se muta al cambiar un pictograma a mano. */
let secuencia = [];
/** Frase de la que salió la secuencia, sin las comillas del eco. */
let fraseActual = '';
/** Índice del concepto que se está editando en el panel. */
let editando = null;

// --- Utilidades ---

function muestraAvisos(mensajes, clase = 'aviso') {
  el.avisos.textContent = '';
  for (const mensaje of mensajes) {
    const div = document.createElement('div');
    div.className = clase;
    div.textContent = mensaje;
    el.avisos.append(div);
  }
}

async function pideJson(url, opciones) {
  const respuesta = await fetch(url, opciones);
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(datos.error ?? `El servidor respondió ${respuesta.status}.`);
  return datos;
}

// --- Dibujar la secuencia ---

function creaTarjeta(concepto, indice) {
  const li = document.createElement('li');
  li.className = concepto.pictograma ? 'picto' : 'picto picto--hueco';

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'picto-boton';
  boton.dataset.indice = String(indice);
  boton.style.setProperty('--color-tipo', `var(--tipo-${concepto.tipo ?? 'otro'})`);

  if (concepto.pictograma) {
    const img = document.createElement('img');
    img.src = concepto.pictograma.url;
    img.alt = `Pictograma de ${concepto.lema}`;
    img.loading = 'lazy';
    img.draggable = false;
    boton.append(img);
    boton.setAttribute('aria-label', `${concepto.lema}. Tocar para cambiar el pictograma.`);
  } else {
    const marca = document.createElement('span');
    marca.className = 'picto-marca';
    marca.textContent = '?';
    marca.setAttribute('aria-hidden', 'true');
    boton.append(marca);
    boton.setAttribute('aria-label', `Sin pictograma para ${concepto.texto}. Tocar para buscar otra palabra.`);
  }

  const palabra = document.createElement('span');
  palabra.className = 'picto-palabra';
  palabra.textContent = concepto.lema || concepto.texto;
  boton.append(palabra);

  li.append(boton);
  return li;
}

function dibuja() {
  el.secuencia.textContent = '';
  secuencia.forEach((concepto, i) => el.secuencia.append(creaTarjeta(concepto, i)));
}

/** Chips de datos bajo el tablero. */
function pintaEstado(datos) {
  const huecos = secuencia.filter((c) => !c.pictograma).length;
  const total = secuencia.length;

  const chips = [];
  if (datos.motor) chips.push([datos.motor === 'ia' ? 'Gemini' : 'Diccionario local', 'chip chip--principal']);
  chips.push([`${total} ${total === 1 ? 'concepto' : 'conceptos'}`, 'chip']);
  // Una frase recuperada de «Mis frases» no se ha analizado ahora: no hay
  // tiempo que enseñar.
  if (typeof datos.ms === 'number') chips.push([`${datos.ms} ms`, 'chip']);
  if (huecos) chips.push([`${huecos} sin pictograma`, 'chip']);

  el.estado.textContent = '';
  for (const [texto, clase] of chips) {
    const span = document.createElement('span');
    span.className = clase;
    span.textContent = texto;
    el.estado.append(span);
  }
}

/**
 * Pinta qué se ha cambiado de la frase original.
 *
 * Va dirigido al cuidador, no a la persona que usa el tablero, y por eso vive
 * fuera de la secuencia. Separa dos cosas que no tienen el mismo riesgo:
 *
 *   reducción  — se ha quitado algo que no era esencial. No cambia el sentido.
 *   concreción — se ha sustituido algo general por un ejemplar concreto. SÍ
 *                cambia lo que se dice, porque pone en boca de la persona una
 *                palabra que no ha dicho. Es lo único que se pinta en rojo.
 */
function pintaSimplificacion(simplificacion) {
  const { aplicada = false, resumen = '', cambios = [] } = simplificacion ?? {};

  el.simplificacion.hidden = !aplicada;
  if (!aplicada) return;

  el.simplificacionResumen.textContent = resumen;
  el.simplificacionCambios.textContent = '';

  for (const cambio of cambios) {
    const esConcrecion = cambio.tipo === 'concrecion';

    const fila = document.createElement('li');
    fila.className = esConcrecion ? 'cambio cambio--concrecion' : 'cambio';

    const marca = document.createElement('span');
    marca.className = 'cambio-marca';
    marca.textContent = esConcrecion ? 'Concretado' : 'Simplificado';

    const texto = document.createElement('span');
    texto.className = 'cambio-texto';
    texto.textContent = `${cambio.de} → ${cambio.a}`;

    fila.append(marca, texto);

    if (esConcrecion) {
      const nota = document.createElement('span');
      nota.className = 'cambio-nota';
      nota.textContent = 'Esta palabra no la ha dicho la persona. Compruébalo antes de usarlo.';
      fila.append(nota);
    }

    el.simplificacionCambios.append(fila);
  }
}

// --- Analizar una frase ---

async function analiza() {
  const texto = el.frase.value.trim();
  if (!texto) {
    el.frase.focus();
    return;
  }

  detenLectura();
  el.crear.disabled = true;
  el.crear.textContent = 'Buscando…';
  muestraAvisos([]);

  try {
    const datos = await pideJson('/api/frase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto, nivel: el.nivel.value }),
    });

    secuencia = datos.conceptos ?? [];
    fraseActual = datos.frase;
    el.fraseEco.textContent = `«${datos.frase}»`;

    dibuja();
    pintaEstado(datos);
    pintaSimplificacion(datos.simplificacion);
    muestraAvisos(datos.avisos ?? []);

    el.resultado.hidden = secuencia.length === 0;
  } catch (error) {
    muestraAvisos([`No se pudo analizar la frase: ${error.message}`], 'aviso aviso--error');
  } finally {
    el.crear.disabled = false;
    el.crear.textContent = 'Crear pictogramas';
  }
}

// --- Voz ---
// ARASAAC publica locuciones grabadas en /locutions/es/<palabra>.mp3: voz
// humana real y la misma palabra que ilustra el pictograma. La síntesis del
// navegador queda de reserva, que además es lo que peor va en Firefox/Linux.

const BASE_LOCUCIONES = 'https://static.arasaac.org/locutions/es';

let leyendo = false;
let audioActual = null;

function marcaHablando(indice) {
  for (const li of el.secuencia.children) li.classList.remove('picto--hablando');
  if (indice >= 0) el.secuencia.children[indice]?.classList.add('picto--hablando');
}

function detenLectura() {
  leyendo = false;
  if (audioActual) {
    audioActual.pause();
    audioActual = null;
  }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  marcaHablando(-1);
  el.leer.textContent = 'Leer en voz alta';
  el.leer.setAttribute('aria-pressed', 'false');
}

/** Locución grabada. Se rechaza si ARASAAC no tiene esa palabra. */
function reproduceLocucion(palabra) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(`${BASE_LOCUCIONES}/${encodeURIComponent(palabra)}.mp3`);
    audioActual = audio;
    audio.addEventListener('ended', resolve, { once: true });
    audio.addEventListener('error', () => reject(new Error('sin locución')), { once: true });
    audio.play().catch(reject);
  });
}

/** Voz sintética del navegador. Devuelve si ha sonado algo. */
function reproduceSintetica(palabra) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve(false);

    const locucion = new SpeechSynthesisUtterance(palabra);
    locucion.lang = 'es-ES';
    locucion.rate = 0.9;

    const voces = speechSynthesis.getVoices() ?? [];
    const voz = voces.find((v) => v.lang?.replace('_', '-').toLowerCase() === 'es-es')
      ?? voces.find((v) => v.lang?.toLowerCase().startsWith('es'));
    if (voz) locucion.voice = voz;

    let resuelto = false;
    const acaba = (sono) => {
      if (resuelto) return;
      resuelto = true;
      resolve(sono);
    };

    locucion.addEventListener('end', () => acaba(true), { once: true });
    locucion.addEventListener('error', () => acaba(false), { once: true });
    // Red de seguridad: si el motor de voz no contesta, se sigue con la
    // siguiente palabra en vez de dejar la lectura colgada.
    setTimeout(() => acaba(false), 6000);

    speechSynthesis.speak(locucion);
  });
}

async function leeEnVozAlta() {
  // Segundo toque: parar. Útil para cortar una secuencia larga a media lectura.
  if (leyendo) {
    detenLectura();
    return;
  }

  // Se lee lo que está en pantalla, no la frase original: si se ha cambiado un
  // pictograma a mano, la voz debe decir lo que se está viendo.
  const palabras = secuencia.map((c) => c.lema || c.texto).filter(Boolean);
  if (!palabras.length) return;

  leyendo = true;
  el.leer.textContent = 'Detener';
  el.leer.setAttribute('aria-pressed', 'true');

  let sonoAlgo = false;

  for (let i = 0; i < palabras.length && leyendo; i++) {
    marcaHablando(i);
    try {
      await reproduceLocucion(palabras[i]);
      sonoAlgo = true;
    } catch {
      if (await reproduceSintetica(palabras[i])) sonoAlgo = true;
    }
  }

  const llegoAlFinal = leyendo;
  detenLectura();

  if (llegoAlFinal && !sonoAlgo) {
    muestraAvisos([
      'No ha sonado nada. Comprueba que el volumen no está silenciado y que el ' +
        'navegador tiene permiso para reproducir audio en esta página.',
    ], 'aviso aviso--error');
  }
}

// --- Panel para cambiar un pictograma ---

function mensajeEnPanel(texto) {
  el.panelRejilla.textContent = '';
  const p = document.createElement('p');
  p.className = 'panel-mensaje';
  p.textContent = texto;
  el.panelRejilla.append(p);
}

async function cargaAlternativas(termino) {
  mensajeEnPanel('Buscando…');
  try {
    const { alternativas } = await pideJson(`/api/alternativas?termino=${encodeURIComponent(termino)}`);

    if (!alternativas.length) {
      mensajeEnPanel(`No hay pictogramas para «${termino}». Prueba con un sinónimo más sencillo.`);
      return;
    }

    el.panelRejilla.textContent = '';
    for (const opcion of alternativas) {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'opcion';

      const img = document.createElement('img');
      img.src = opcion.urlMiniatura;
      img.alt = '';
      img.loading = 'lazy';

      const span = document.createElement('span');
      span.textContent = opcion.palabra;

      boton.append(img, span);
      boton.addEventListener('click', () => eligeAlternativa(opcion));
      el.panelRejilla.append(boton);
    }
  } catch (error) {
    mensajeEnPanel(`Error al buscar: ${error.message}`);
  }
}

function eligeAlternativa(opcion) {
  if (editando === null) return;

  secuencia[editando] = {
    ...secuencia[editando],
    lema: opcion.palabra,
    pictograma: {
      id: opcion.id,
      palabra: opcion.palabra,
      url: opcion.url,
      urlMiniatura: opcion.urlMiniatura,
    },
  };

  dibuja();
  el.panel.close();
}

function abrePanel(indice) {
  editando = indice;
  const concepto = secuencia[indice];
  const termino = concepto.lema || concepto.texto;

  el.panelTitulo.textContent = concepto.pictograma ? 'Cambiar pictograma' : 'Buscar pictograma';
  el.panelSub.textContent = `En la frase: «${concepto.texto}»`;
  el.panelBusqueda.value = termino;

  el.panel.showModal();
  cargaAlternativas(termino);
}

// --- Dictado ---

function preparaDictado() {
  const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;

  // El reconocimiento de voz solo lo implementan Chrome, Edge y el Safari de
  // iOS/iPadOS. Firefox no lo tiene, ni detrás de preferencia.
  //
  // Antes el botón simplemente no aparecía, y eso es peor: quien lo busca no
  // entiende si falta la función, si está rota o si ha hecho algo mal. Ahora
  // se queda visible, apagado, y al pulsarlo dice exactamente qué pasa.
  if (!Reconocimiento) {
    el.dictar.dataset.soportado = 'no';
    el.dictar.title = 'Este navegador no puede dictar';
    el.dictar.addEventListener('click', () => {
      muestraAvisos([
        'Este navegador no sabe dictar. El reconocimiento de voz solo funciona '
          + 'en Chrome, Edge y el Safari del iPad; Firefox no lo implementa. '
          + 'Escribe la frase a mano, o abre PictoPeC en Chrome si quieres dictarla.',
      ]);
    });
    return;
  }

  const reconocedor = new Reconocimiento();
  reconocedor.lang = 'es-ES';
  reconocedor.interimResults = false;
  reconocedor.maxAlternatives = 1;

  let escuchando = false;

  el.dictar.setAttribute('aria-pressed', 'false');

  el.dictar.addEventListener('click', () => {
    if (escuchando) {
      reconocedor.stop();
      return;
    }
    try {
      reconocedor.start();
    } catch {
      /* ya estaba arrancando */
    }
  });

  reconocedor.addEventListener('start', () => {
    escuchando = true;
    el.dictar.setAttribute('aria-pressed', 'true');
  });

  reconocedor.addEventListener('end', () => {
    escuchando = false;
    el.dictar.setAttribute('aria-pressed', 'false');
  });

  reconocedor.addEventListener('result', (evento) => {
    const dicho = evento.results[0][0].transcript.trim();
    if (!dicho) return;
    el.frase.value = dicho;
    analiza();
  });

  reconocedor.addEventListener('error', (evento) => {
    const explicaciones = {
      'not-allowed': 'No hay permiso para usar el micrófono. Actívalo en el candado de la barra de direcciones.',
      'no-speech': 'No se ha oído nada. Inténtalo otra vez.',
      network: 'El dictado necesita conexión a internet.',
      'audio-capture': 'No se ha encontrado ningún micrófono.',
    };
    muestraAvisos([explicaciones[evento.error] ?? `Fallo en el dictado: ${evento.error}`]);
  });
}

// --- Modo presentación ---

function entraPresentacion() {
  if (!secuencia.length) return;
  document.body.classList.add('presentando');
  el.salirPresentacion.hidden = false;
  document.documentElement.requestFullscreen?.().catch(() => {
    /* sin pantalla completa también vale */
  });
}

function salePresentacion() {
  document.body.classList.remove('presentando');
  el.salirPresentacion.hidden = true;
  if (document.fullscreenElement) document.exitFullscreen?.();
}

// --- Mis frases ---
// En localStorage: por dispositivo y sin salir de él, que para una tablet de
// aula es lo correcto. Si hiciera falta compartir tableros, se cambia esta
// capa por una llamada al servidor sin tocar la interfaz.

const CLAVE_GUARDADOS = 'pictopec:guardados';
const TOPE_GUARDADOS = 50;

// localStorage puede fallar (modo privado, permisos): todo acceso envuelto.
function leeGuardados() {
  try {
    const crudo = localStorage.getItem(CLAVE_GUARDADOS);
    const lista = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function escribeGuardados(lista) {
  try {
    localStorage.setItem(CLAVE_GUARDADOS, JSON.stringify(lista.slice(0, TOPE_GUARDADOS)));
    return true;
  } catch {
    return false;
  }
}

function guardaFrase() {
  if (!secuencia.length) return;

  const lista = leeGuardados();
  lista.unshift({
    id: String(Date.now()),
    frase: fraseActual,
    conceptos: secuencia,
    fecha: new Date().toISOString(),
  });

  if (escribeGuardados(lista)) {
    el.guardar.textContent = 'Guardada';
    setTimeout(() => { el.guardar.textContent = 'Guardar'; }, 1600);
    refrescaAzulejoGuardados();
  } else {
    muestraAvisos([
      'No se ha podido guardar. El navegador no permite almacenar datos en esta '
        + 'página, normalmente por estar en modo privado.',
    ], 'aviso aviso--error');
  }
}

function borraGuardada(id) {
  escribeGuardados(leeGuardados().filter((g) => g.id !== id));
  pintaGuardados();
  refrescaAzulejoGuardados();
}

function abreGuardada(guardada) {
  secuencia = guardada.conceptos ?? [];
  fraseActual = guardada.frase ?? '';
  el.frase.value = fraseActual;
  el.fraseEco.textContent = `«${fraseActual}»`;
  dibuja();
  pintaEstado({});
  pintaSimplificacion(null);
  el.resultado.hidden = secuencia.length === 0;
  escribirEstrenado = true;
  location.hash = '#/escribir';
}

function fechaLegible(iso) {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleDateString('es-ES', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

function pintaGuardados() {
  const lista = leeGuardados();
  el.listaGuardados.textContent = '';

  if (!lista.length) {
    const vacio = document.createElement('p');
    vacio.className = 'sin-guardados';
    vacio.textContent = 'Todavía no has guardado ninguna frase. Crea una y pulsa «Guardar».';
    el.listaGuardados.append(vacio);
    return;
  }

  for (const guardada of lista) {
    const tarjeta = document.createElement('article');
    tarjeta.className = 'guardado';

    const cabecera = document.createElement('div');
    cabecera.className = 'guardado-cabecera';

    const textos = document.createElement('div');
    const frase = document.createElement('p');
    frase.className = 'guardado-frase';
    frase.textContent = guardada.frase;
    const fecha = document.createElement('span');
    fecha.className = 'guardado-fecha';
    fecha.textContent = fechaLegible(guardada.fecha);
    textos.append(frase, fecha);

    const acciones = document.createElement('div');
    acciones.className = 'guardado-acciones';

    const abrir = document.createElement('button');
    abrir.type = 'button';
    abrir.className = 'boton boton--principal';
    abrir.textContent = 'Abrir';
    abrir.addEventListener('click', () => abreGuardada(guardada));

    const borrar = document.createElement('button');
    borrar.type = 'button';
    borrar.className = 'boton boton--suave';
    borrar.textContent = 'Borrar';
    borrar.addEventListener('click', () => borraGuardada(guardada.id));

    acciones.append(abrir, borrar);
    cabecera.append(textos, acciones);

    const tira = document.createElement('div');
    tira.className = 'guardado-tira';
    for (const concepto of guardada.conceptos ?? []) {
      if (!concepto.pictograma) continue;
      const img = document.createElement('img');
      img.src = concepto.pictograma.urlMiniatura;
      img.alt = concepto.lema;
      img.loading = 'lazy';
      tira.append(img);
    }

    tarjeta.append(cabecera, tira);
    el.listaGuardados.append(tarjeta);
  }
}

function refrescaAzulejoGuardados() {
  const cuantas = leeGuardados().length;
  el.azulejoGuardados.hidden = cuantas === 0;
  el.azulejoGuardadosPie.textContent =
    cuantas === 1 ? '1 frase guardada' : `${cuantas} frases guardadas`;
}

/**
 * Sin motor de IA no hay simplificación adaptativa, así que el selector de
 * nivel no haría nada. Se desactiva y se dice por qué, en vez de dejar un
 * control que parece funcionar y no hace nada.
 */
async function consultaEstado() {
  try {
    const { ia } = await pideJson('/api/estado');
    if (ia?.disponible) return;

    el.nivel.disabled = true;
    el.nivelNota.hidden = false;
    el.nivelNota.textContent =
      `El nivel solo cambia algo con el motor de IA, que ahora no está activo. ${ia?.motivo ?? ''} `
      + 'Mientras tanto se usa el diccionario local, que no simplifica.';
  } catch {
    /* si falla la consulta, se deja el selector como está */
  }
}

// --- Construir una frase tocando pictogramas ---
// El modo que sirve a quien no escribe: todo lo demás exige teclear.

/** Pictogramas tocados, en orden. Es la frase que se está construyendo. */
let construccion = [];
/** Última frase compuesta, para poder repetirla y guardarla. */
let fraseCompuesta = '';

/** Locución suelta, sin tocar el estado del lector de secuencias. */
function sueltaLocucion(palabra) {
  const audio = new Audio(`${BASE_LOCUCIONES}/${encodeURIComponent(palabra)}.mp3`);
  audio.play().catch(() => {
    /* si no hay locución grabada, se queda en silencio: no merece un aviso */
  });
}

function creaFicha(concepto, indice) {
  const li = document.createElement('li');

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'ficha';
  boton.style.setProperty('--color-tipo', `var(--tipo-${concepto.tipo ?? 'otro'})`);
  boton.setAttribute('aria-label', `${concepto.texto}. Tocar para quitarlo de la frase.`);

  const img = document.createElement('img');
  img.src = concepto.pictograma.urlMiniatura;
  img.alt = '';
  boton.append(img);

  const texto = document.createElement('span');
  texto.textContent = concepto.texto;
  boton.append(texto);

  boton.addEventListener('click', () => {
    construccion.splice(indice, 1);
    pintaConstruccion();
  });

  li.append(boton);
  return li;
}

function pintaConstruccion() {
  el.tira.textContent = '';
  construccion.forEach((c, i) => el.tira.append(creaFicha(c, i)));

  const vacia = construccion.length === 0;
  el.tiraVacia.hidden = !vacia;
  el.decir.disabled = vacia;
  el.borrarUltimo.disabled = vacia;
  el.vaciar.disabled = vacia;

  // Al cambiar la frase, la compuesta anterior deja de valer.
  el.fraseNatural.hidden = true;
  fraseCompuesta = '';
}

function anadeAConstruccion(concepto) {
  construccion.push(concepto);
  pintaConstruccion();
  // Sonar al tocar es como funciona un tablero de verdad: la persona necesita
  // saber que su toque ha hecho algo, sin esperar a la frase entera.
  sueltaLocucion(concepto.lema || concepto.texto);
}

let vocabularioPintado = false;

async function cargaVocabulario() {
  if (vocabularioPintado) return;

  el.vocabulario.textContent = '';
  const cargando = document.createElement('p');
  cargando.className = 'panel-mensaje';
  cargando.textContent = 'Cargando el vocabulario…';
  el.vocabulario.append(cargando);

  try {
    const { grupos } = await pideJson('/api/vocabulario');
    el.vocabulario.textContent = '';

    for (const grupo of grupos) {
      const seccion = document.createElement('section');
      seccion.className = 'grupo-vocabulario';

      const titulo = document.createElement('h3');
      titulo.textContent = grupo.nombre;

      const rejilla = document.createElement('div');
      rejilla.className = 'rejilla-vocabulario';

      for (const palabra of grupo.palabras) rejilla.append(creaCeldaVocabulario(palabra));

      seccion.append(titulo, rejilla);
      el.vocabulario.append(seccion);
    }
    vocabularioPintado = true;
  } catch (error) {
    el.vocabulario.textContent = '';
    const fallo = document.createElement('p');
    fallo.className = 'panel-mensaje';
    fallo.textContent = `No se pudo cargar el vocabulario: ${error.message}`;
    el.vocabulario.append(fallo);
  }
}

/** Lee en voz alta la frase compuesta. No hay locución grabada de una frase. */
function diFraseCompuesta() {
  if (!fraseCompuesta || !('speechSynthesis' in window)) return;

  speechSynthesis.cancel();
  setTimeout(() => {
    const locucion = new SpeechSynthesisUtterance(fraseCompuesta);
    locucion.lang = 'es-ES';
    locucion.rate = 0.95;
    const voces = speechSynthesis.getVoices() ?? [];
    const voz = voces.find((v) => v.lang?.replace('_', '-').toLowerCase() === 'es-es')
      ?? voces.find((v) => v.lang?.toLowerCase().startsWith('es'));
    if (voz) locucion.voice = voz;
    speechSynthesis.speak(locucion);
  }, 0);
}

async function componFrase() {
  if (!construccion.length) return;

  el.decir.disabled = true;
  el.decir.textContent = 'Componiendo…';

  try {
    const datos = await pideJson('/api/frase-natural', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conceptos: construccion.map((c) => c.lema || c.texto) }),
    });

    fraseCompuesta = datos.frase ?? '';
    el.fraseNaturalTexto.textContent = fraseCompuesta;
    el.fraseNatural.hidden = !fraseCompuesta;

    // Si la IA ha tenido que poner una palabra que nadie tocó, se dice. Mismo
    // principio que las concreciones del otro modo, y mismo riesgo detrás.
    const anadido = datos.anadido ?? [];
    el.fraseNaturalAviso.hidden = anadido.length === 0;
    if (anadido.length) {
      el.fraseNaturalAviso.textContent =
        `Se han añadido palabras que no se han tocado: ${anadido.join(', ')}. Compruébalo.`;
    }

    muestraAvisos(datos.avisos ?? []);
    diFraseCompuesta();
  } catch (error) {
    muestraAvisos([`No se pudo componer la frase: ${error.message}`], 'aviso aviso--error');
  } finally {
    el.decir.disabled = construccion.length === 0;
    el.decir.textContent = 'Decir la frase';
  }
}

function guardaConstruida() {
  if (!construccion.length) return;

  const lista = leeGuardados();
  lista.unshift({
    id: String(Date.now()),
    frase: fraseCompuesta || construccion.map((c) => c.texto).join(' '),
    conceptos: construccion.map((c) => ({
      texto: c.texto,
      lema: c.lema,
      tipo: c.tipo,
      pictograma: c.pictograma,
    })),
    fecha: new Date().toISOString(),
  });

  if (escribeGuardados(lista)) {
    el.guardarConstruida.textContent = 'Guardada';
    setTimeout(() => { el.guardarConstruida.textContent = 'Guardar'; }, 1600);
  }
}

// --- Buscar cualquier pictograma ---
// El vocabulario nuclear cubre el día a día; para el resto, los 40.000.

/** Celda de vocabulario, reutilizada por la rejilla fija y por la búsqueda. */
function creaCeldaVocabulario(palabra) {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'celda-vocabulario';
  boton.style.setProperty('--color-tipo', `var(--tipo-${palabra.tipo ?? 'otro'})`);
  boton.setAttribute('aria-label', `${palabra.texto}. Tocar para añadirlo a la frase.`);

  const img = document.createElement('img');
  img.src = palabra.pictograma.urlMiniatura;
  img.alt = '';
  img.loading = 'lazy';

  const texto = document.createElement('span');
  texto.textContent = palabra.texto;

  boton.append(img, texto);
  boton.addEventListener('click', () => anadeAConstruccion(palabra));
  return boton;
}

async function buscaPictograma() {
  const termino = el.buscarPicto.value.trim();
  if (!termino) return;

  el.resultadosBusqueda.hidden = false;
  el.resultadosBusquedaTitulo.textContent = `Buscando «${termino}»…`;
  el.resultadosBusquedaRejilla.textContent = '';

  try {
    const { alternativas } = await pideJson(`/api/alternativas?termino=${encodeURIComponent(termino)}`);

    if (!alternativas.length) {
      el.resultadosBusquedaTitulo.textContent = `Sin resultados para «${termino}»`;
      return;
    }

    el.resultadosBusquedaTitulo.textContent = `Resultados de «${termino}»`;
    for (const opcion of alternativas) {
      el.resultadosBusquedaRejilla.append(creaCeldaVocabulario({
        texto: opcion.palabra,
        lema: opcion.palabra,
        tipo: 'otro',
        pictograma: opcion,
      }));
    }
  } catch (error) {
    el.resultadosBusquedaTitulo.textContent = `Error al buscar: ${error.message}`;
  }
}

// --- Historias sociales ---

function mensajeEnHistorias(texto) {
  el.listaHistorias.textContent = '';
  const p = document.createElement('p');
  p.className = 'sin-guardados';
  p.textContent = texto;
  el.listaHistorias.append(p);
}

async function buscaHistorias(consulta) {
  const termino = (consulta ?? '').trim();
  el.buscarHistoria.value = termino;
  mensajeEnHistorias('Buscando en ARASAAC…');

  try {
    const { historias } = await pideJson(`/api/historias?q=${encodeURIComponent(termino)}`);

    if (!historias.length) {
      mensajeEnHistorias(`No hay historias para «${termino}». Prueba con una palabra más general.`);
      return;
    }

    el.listaHistorias.textContent = '';
    for (const historia of historias) {
      const tarjeta = document.createElement('article');
      tarjeta.className = 'historia';

      const titulo = document.createElement('h3');
      titulo.className = 'historia-titulo';
      titulo.textContent = historia.titulo;
      tarjeta.append(titulo);

      // Tira de pictogramas generada del propio título.
      if (historia.tira?.length) {
        const tira = document.createElement('div');
        tira.className = 'historia-tira';
        for (const concepto of historia.tira) {
          const img = document.createElement('img');
          img.src = concepto.pictograma.urlMiniatura;
          img.alt = concepto.lema;
          img.loading = 'lazy';
          tira.append(img);
        }
        tarjeta.append(tira);
      }

      if (historia.descripcion) {
        const desc = document.createElement('p');
        desc.className = 'historia-desc';
        desc.textContent = historia.descripcion;
        tarjeta.append(desc);
      }

      if (historia.autores?.length) {
        const autores = document.createElement('span');
        autores.className = 'historia-autores';
        autores.textContent = `Por ${historia.autores.join(', ')}`;
        tarjeta.append(autores);
      }

      const acciones = document.createElement('div');
      acciones.className = 'historia-acciones';

      const abrir = document.createElement('a');
      abrir.className = 'boton boton--principal';
      abrir.href = historia.ficha;
      abrir.target = '_blank';
      abrir.rel = 'noopener';
      abrir.textContent = 'Ver en ARASAAC';

      const alTablero = document.createElement('button');
      alTablero.type = 'button';
      alTablero.className = 'boton boton--suave';
      alTablero.textContent = 'Pasar el título a pictogramas';
      alTablero.addEventListener('click', () => {
        el.frase.value = historia.titulo;
        escribirEstrenado = true;
        location.hash = '#/escribir';
        analiza();
      });

      acciones.append(abrir, alTablero);
      tarjeta.append(acciones);
      el.listaHistorias.append(tarjeta);
    }
  } catch (error) {
    mensajeEnHistorias(`No se pudieron cargar las historias: ${error.message}`);
  }
}

let historiasEstrenadas = false;

// --- Navegación entre pantallas ---
// El hash decide la vista. Sin router: el botón atrás funciona solo y dentro
// de la PWA se comporta como navegación de app.

const VISTAS = ['inicio', 'escribir', 'construir', 'historias', 'guardados'];

let escribirEstrenado = false;

function entraEnEscribir() {
  // En pantalla táctil no se roba el foco: abriría el teclado encima de todo
  // nada más entrar, tapando justo lo que se quiere enseñar.
  if (!window.matchMedia('(pointer: coarse)').matches) el.frase.focus();

  if (escribirEstrenado) return;
  escribirEstrenado = true;

  // La primera vez se entra con un tablero ya montado: se entiende de un
  // vistazo qué hace esta pantalla, sin leer instrucciones.
  el.frase.value = 'Vamos a comer al parque';
  el.frase.select();
  analiza();
}

function enruta() {
  const pedida = location.hash.replace(/^#\/?/, '');
  const nombre = VISTAS.includes(pedida) ? pedida : 'inicio';

  for (const vista of VISTAS) {
    document.getElementById(`vista-${vista}`).hidden = vista !== nombre;
  }

  el.volver.hidden = nombre === 'inicio';
  detenLectura();
  if (document.body.classList.contains('presentando')) salePresentacion();

  if (nombre === 'inicio') refrescaAzulejoGuardados();
  if (nombre === 'escribir') entraEnEscribir();
  if (nombre === 'construir') cargaVocabulario();
  if (nombre === 'historias' && !historiasEstrenadas) {
    historiasEstrenadas = true;
    buscaHistorias('historia social');
  }
  if (nombre === 'guardados') pintaGuardados();

  window.scrollTo(0, 0);
}

// --- Instalación como app ---

function preparaInstalacion() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* sin service worker la app funciona igual, solo que sin uso offline */
      });
    });
  }

  let peticionInstalacion = null;

  // Chrome y Edge avisan de que la app se puede instalar; Firefox y Safari no
  // disparan este evento y el botón se queda oculto, que es lo correcto.
  window.addEventListener('beforeinstallprompt', (evento) => {
    evento.preventDefault();
    peticionInstalacion = evento;
    el.instalar.hidden = false;
  });

  el.instalar.addEventListener('click', async () => {
    if (!peticionInstalacion) return;
    peticionInstalacion.prompt();
    await peticionInstalacion.userChoice;
    peticionInstalacion = null;
    el.instalar.hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    peticionInstalacion = null;
    el.instalar.hidden = true;
  });
}

// --- Arranque ---

el.crear.addEventListener('click', () => analiza());

el.frase.addEventListener('keydown', (evento) => {
  // Enter envía; Mayús+Enter hace salto de línea. Es una frase, no un texto.
  if (evento.key === 'Enter' && !evento.shiftKey) {
    evento.preventDefault();
    analiza();
  }
});

el.limpiar.addEventListener('click', () => {
  detenLectura();
  el.frase.value = '';
  secuencia = [];
  fraseActual = '';
  el.resultado.hidden = true;
  el.estado.textContent = '';
  el.simplificacion.hidden = true;
  muestraAvisos([]);
  el.frase.focus();
});

for (const pildora of document.querySelectorAll('[data-ejemplo]')) {
  pildora.addEventListener('click', () => {
    el.frase.value = pildora.dataset.ejemplo;
    analiza();
  });
}

el.secuencia.addEventListener('click', (evento) => {
  if (document.body.classList.contains('presentando')) return;
  const boton = evento.target.closest('.picto-boton');
  if (boton) abrePanel(Number(boton.dataset.indice));
});

el.panelBuscar.addEventListener('click', () => {
  const termino = el.panelBusqueda.value.trim();
  if (termino) cargaAlternativas(termino);
});

el.panelBusqueda.addEventListener('keydown', (evento) => {
  if (evento.key !== 'Enter') return;
  evento.preventDefault();
  const termino = el.panelBusqueda.value.trim();
  if (termino) cargaAlternativas(termino);
});

el.panel.addEventListener('close', () => { editando = null; });

el.leer.addEventListener('click', leeEnVozAlta);
el.imprimir.addEventListener('click', () => window.print());
el.presentar.addEventListener('click', entraPresentacion);
el.salirPresentacion.addEventListener('click', salePresentacion);

document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape' && document.body.classList.contains('presentando')) salePresentacion();
});

document.addEventListener('fullscreenchange', () => {
  // Salir de pantalla completa con F11 o Esc del navegador debe salir del modo.
  if (!document.fullscreenElement && document.body.classList.contains('presentando')) {
    salePresentacion();
  }
});

el.guardar.addEventListener('click', guardaFrase);

el.decir.addEventListener('click', componFrase);
el.repetir.addEventListener('click', diFraseCompuesta);
el.guardarConstruida.addEventListener('click', guardaConstruida);
el.borrarUltimo.addEventListener('click', () => { construccion.pop(); pintaConstruccion(); });
el.vaciar.addEventListener('click', () => { construccion = []; pintaConstruccion(); });

el.buscarPictoBtn.addEventListener('click', buscaPictograma);
el.buscarPicto.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  buscaPictograma();
});

el.buscarHistoriaBtn.addEventListener('click', () => buscaHistorias(el.buscarHistoria.value));
el.buscarHistoria.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  buscaHistorias(el.buscarHistoria.value);
});
for (const pildora of document.querySelectorAll('[data-historia]')) {
  pildora.addEventListener('click', () => buscaHistorias(pildora.dataset.historia));
}

preparaDictado();
preparaInstalacion();
consultaEstado();

window.addEventListener('hashchange', enruta);
enruta();
