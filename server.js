/**
 * Servidor. Solo módulos nativos de Node.
 *
 * ARASAAC permite CORS y podría llamarse desde el navegador; el servidor
 * existe porque la clave de la IA no puede viajar al cliente, porque la caché
 * se comparte entre todos los dispositivos, y para no duplicar el lematizador.
 */

import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

import {
  analizaFrase, alternativasPara, cargaVocabulario, componFrase,
  tiraDePictogramas, MOTORES, NIVELES,
} from './src/pipeline.js';
import { buscaHistorias } from './src/historias.js';
import { estaDisponible } from './src/nlp-gemini.js';
import { estadisticasCache } from './src/arasaac.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const PUBLICO = join(AQUI, 'public');

// .env es opcional: sin él, la app funciona con el motor local.
try {
  process.loadEnvFile(join(AQUI, '.env'));
} catch {
  /* no hay .env, seguimos */
}

const PUERTO = Number(process.env.PORT) || 3000;
const MAXIMO_CUERPO = 16 * 1024;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function responde(res, codigo, datos) {
  const cuerpo = JSON.stringify(datos);
  res.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(cuerpo),
  });
  res.end(cuerpo);
}

/** Distingue culpa del cliente de fallo nuestro. */
class ErrorDePeticion extends Error {
  constructor(mensaje, codigo = 400) {
    super(mensaje);
    this.codigo = codigo;
  }
}

async function leeCuerpo(req) {
  const trozos = [];
  let tamano = 0;

  for await (const trozo of req) {
    tamano += trozo.length;
    if (tamano > MAXIMO_CUERPO) {
      throw new ErrorDePeticion('El cuerpo de la petición es demasiado grande.', 413);
    }
    trozos.push(trozo);
  }

  if (!trozos.length) return {};

  try {
    return JSON.parse(Buffer.concat(trozos).toString('utf8'));
  } catch {
    throw new ErrorDePeticion('El cuerpo de la petición no es JSON válido.');
  }
}

/** Sirve public/, bloqueando saltos fuera del directorio. */
async function sirveEstatico(req, res) {
  const ruta = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const relativa = normalize(ruta === '/' ? '/index.html' : ruta).replace(/^(\.\.[/\\])+/, '');
  const completa = join(PUBLICO, relativa);

  if (!completa.startsWith(PUBLICO)) {
    res.writeHead(403).end('Prohibido');
    return;
  }

  try {
    const info = await stat(completa);
    if (!info.isFile()) throw new Error('no es un fichero');

    const contenido = await readFile(completa);
    res.writeHead(200, {
      'Content-Type': TIPOS[extname(completa)] ?? 'application/octet-stream',
      'Content-Length': contenido.length,
      'Cache-Control': 'no-cache',
    });
    res.end(contenido);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  try {
    // --- Analizar una frase -------------------------------------------
    if (req.method === 'POST' && url.pathname === '/api/frase') {
      const cuerpo = await leeCuerpo(req);
      const texto = String(cuerpo.texto ?? '').slice(0, 500);

      const motor = MOTORES.includes(cuerpo.motor) ? cuerpo.motor : 'auto';
      const nivel = NIVELES.includes(cuerpo.nivel) ? cuerpo.nivel : 'intermedio';

      return responde(res, 200, await analizaFrase(texto, { motor, nivel }));
    }

    // --- Alternativas para cambiar un pictograma -----------------------
    if (req.method === 'GET' && url.pathname === '/api/alternativas') {
      const termino = (url.searchParams.get('termino') ?? '').slice(0, 100);
      if (!termino.trim()) return responde(res, 400, { error: 'Falta el parámetro "termino".' });

      return responde(res, 200, { termino, alternativas: await alternativasPara(termino) });
    }

    // --- Vocabulario nuclear para el modo de construir ------------------
    if (req.method === 'GET' && url.pathname === '/api/vocabulario') {
      return responde(res, 200, { grupos: await cargaVocabulario() });
    }

    // --- De pictogramas tocados a frase en español ----------------------
    if (req.method === 'POST' && url.pathname === '/api/frase-natural') {
      const cuerpo = await leeCuerpo(req);
      const conceptos = Array.isArray(cuerpo.conceptos) ? cuerpo.conceptos.slice(0, 20) : [];
      return responde(res, 200, await componFrase(conceptos));
    }

    // --- Historias sociales de ARASAAC ----------------------------------
    if (req.method === 'GET' && url.pathname === '/api/historias') {
      const consulta = (url.searchParams.get('q') ?? '').slice(0, 100);
      const historias = await buscaHistorias(consulta);

      // ARASAAC no da portada utilizable; ver src/historias.js.
      const conTira = await Promise.all(
        historias.map(async (h) => ({ ...h, tira: await tiraDePictogramas(h.titulo, 5) })),
      );
      return responde(res, 200, { consulta, historias: conTira });
    }

    // --- Estado: la interfaz necesita saber si la IA está disponible ----
    if (req.method === 'GET' && url.pathname === '/api/estado') {
      return responde(res, 200, { ia: await estaDisponible(), cache: estadisticasCache() });
    }

    if (url.pathname.startsWith('/api/')) {
      return responde(res, 404, { error: 'Ruta desconocida.' });
    }

    await sirveEstatico(req, res);
  } catch (error) {
    // Solo se registra lo que de verdad es fallo del servidor.
    const codigo = error?.codigo ?? 500;
    if (codigo >= 500) console.error('[servidor]', error);
    responde(res, codigo, { error: error.message ?? 'Error interno.' });
  }
});

/** IPs de la red local, para abrir la app desde el móvil sin buscarlas. */
function direccionesDeRed() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

servidor.listen(PUERTO, async () => {
  const { disponible, motivo, proveedor, modelo } = await estaDisponible();

  console.log(`\n  PictoPeC`);
  console.log(`    en este equipo   http://localhost:${PUERTO}`);
  for (const ip of direccionesDeRed()) {
    console.log(`    en el móvil      http://${ip}:${PUERTO}`);
  }
  console.log(`\n  Motor de IA: ${disponible ? `${proveedor} · ${modelo}` : `no disponible (${motivo})`}`);
  console.log('  Pictogramas y locuciones: ARASAAC, CC BY-NC-SA');
  console.log('\n  Para instalarla en el móvil hace falta HTTPS:  npm run tunel\n');
});
