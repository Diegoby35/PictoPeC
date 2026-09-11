/* Service worker de PictoPeC.
   ---------------------------------------------------------------------------
   Dos políticas distintas, porque el contenido es de dos clases:

   · La concha de la app (HTML, CSS, JS) va a RED PRIMERO. Así, editando el
     proyecto, siempre se ve lo último; la caché solo entra cuando no hay
     conexión. Una caché agresiva aquí solo sirve para depurar estilos que ya
     no existen.
   · Los pictogramas, las locuciones y las tipografías van a CACHÉ PRIMERO.
     No cambian nunca, pesan, y tenerlos guardados es lo que hace que la app
     abra al instante y siga funcionando sin cobertura: una tablet en un aula
     no siempre tiene wifi.                                                  */

const VERSION = 'pictopec-v7';
const CONCHA = `${VERSION}-concha`;
const RECURSOS = `${VERSION}-recursos`;

const FICHEROS_BASE = [
  '/',
  '/index.html',
  '/estilos.css',
  '/app.js',
  '/manifest.webmanifest',
  '/iconos/icono-192.png',
];

/** Dominios cuyo contenido es inmutable y merece la pena guardar. */
const DOMINIOS_CACHEABLES = [
  'static.arasaac.org',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CONCHA)
      .then((cache) => cache.addAll(FICHEROS_BASE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves.filter((c) => !c.startsWith(VERSION)).map((c) => caches.delete(c)),
      ))
      .then(() => self.clients.claim()),
  );
});

async function cachePrimero(peticion) {
  const cache = await caches.open(RECURSOS);
  const guardado = await cache.match(peticion);
  if (guardado) return guardado;

  const respuesta = await fetch(peticion);
  // Se guardan también las respuestas opacas (las tipografías llegan así):
  // no se puede inspeccionar su estado, pero sirven igual desde la caché.
  if (respuesta.ok || respuesta.type === 'opaque') {
    cache.put(peticion, respuesta.clone());
  }
  return respuesta;
}

async function redPrimero(peticion) {
  try {
    const respuesta = await fetch(peticion);
    if (respuesta.ok) {
      const cache = await caches.open(CONCHA);
      cache.put(peticion, respuesta.clone());
    }
    return respuesta;
  } catch (error) {
    const guardado = await caches.match(peticion);
    if (guardado) return guardado;
    throw error;
  }
}

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (DOMINIOS_CACHEABLES.includes(url.hostname)) {
    evento.respondWith(cachePrimero(request));
    return;
  }

  // La API siempre a la red: una secuencia cacheada sería una secuencia vieja.
  if (url.origin === self.location.origin && !url.pathname.startsWith('/api/')) {
    evento.respondWith(redPrimero(request));
  }
});
