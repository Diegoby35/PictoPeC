#!/usr/bin/env node
/**
 * Banco de pruebas del motor de IA, por consola.
 *
 *   npm run ia                            → la batería completa
 *   npm run ia -- --modelos               → modelos que admite tu clave
 *   npm run ia -- "una frase"             → esa frase, nivel intermedio
 *   npm run ia -- "una frase" basico      → esa frase, ese nivel
 *
 * Existe para no tener que probar el prompt a través de la interfaz. Cada
 * frase de la batería ataca un punto concreto donde la simplificación puede
 * hacer daño, y están puestas en orden de gravedad.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analizaFrase } from '../src/pipeline.js';
import { estaDisponible, listaModelos } from '../src/nlp-gemini.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(join(RAIZ, '.env'));
} catch {
  /* sin .env seguimos: quizá la clave está en el entorno */
}

const C = {
  gris: (t) => `\x1b[90m${t}\x1b[0m`,
  verde: (t) => `\x1b[32m${t}\x1b[0m`,
  rojo: (t) => `\x1b[31m${t}\x1b[0m`,
  ambar: (t) => `\x1b[33m${t}\x1b[0m`,
  fuerte: (t) => `\x1b[1m${t}\x1b[0m`,
};

/**
 * Cada caso dice qué hay que mirar. Sin eso, la salida es solo texto bonito
 * y no se sabe si el resultado está bien o mal.
 */
const BATERIA = [
  {
    frase: 'No quiero ir al médico',
    nivel: 'basico',
    mirar: 'La negación TIENE que sobrevivir. Perderla es el peor fallo posible.',
  },
  {
    frase: 'Quiero agua',
    nivel: 'basico',
    mirar: 'Ya es simple: simplificada debe ser false y cambios estar vacío.',
  },
  {
    frase: 'Me apetece merendar algo dulce',
    nivel: 'basico',
    mirar: 'Debe concretar "algo dulce" y ANOTARLO como concreción, no como reducción.',
  },
  {
    frase: 'Me apetece merendar algo dulce',
    nivel: 'avanzado',
    mirar: 'A este nivel NO debe concretar: mejor un hueco honesto que un invento.',
  },
  {
    frase: '¿Quieres que vayamos al parque esta tarde cuando termines los deberes?',
    nivel: 'basico',
    mirar: 'Frase larga. Debe reducir sin invertir la dirección: es una pregunta HACIA la persona.',
  },
  {
    frase: '¿Dónde está mamá?',
    nivel: 'intermedio',
    mirar: 'El interrogativo "dónde" no se puede perder.',
  },
];

function pinta(resultado, mirar) {
  const { frase, nivel, motor, conceptos, simplificacion, avisos, ms } = resultado;

  console.log(`\n${C.fuerte(`« ${frase} »`)}  ${C.gris(`· nivel ${nivel} · motor ${motor} · ${ms} ms`)}`);
  if (mirar) console.log(C.gris(`  ¿qué mirar?  ${mirar}`));

  const tablero = conceptos
    .map((c) => (c.pictograma ? c.lema : C.ambar(`⟨${c.texto}⟩`)))
    .join(C.gris('  ·  '));
  console.log(`\n  ${tablero}`);
  console.log(C.gris(`  ${conceptos.map((c) => `[${c.tipo}]`).join(' ')}`));

  if (simplificacion?.aplicada) {
    console.log(`\n  ${C.fuerte('Simplificada.')} ${simplificacion.resumen}`);
    for (const cambio of simplificacion.cambios ?? []) {
      const esConcrecion = cambio.tipo === 'concrecion';
      const marca = esConcrecion ? C.rojo('CONCRECIÓN') : C.verde('reducción ');
      console.log(`    ${marca}  ${cambio.de} → ${cambio.a}`);
    }
    if ((simplificacion.cambios ?? []).some((c) => c.tipo === 'concrecion')) {
      console.log(C.gris('    ↑ una concreción pone palabras en boca de la persona: es lo que el cuidador debe revisar'));
    }
  } else {
    console.log(`\n  ${C.gris('Sin simplificar (la frase ya cabía en el nivel).')}`);
  }

  for (const aviso of avisos ?? []) console.log(C.ambar(`  ⚠ ${aviso}`));
}

const argumentos = process.argv.slice(2);

const { disponible, motivo, proveedor, modelo } = await estaDisponible();
if (!disponible) {
  console.error(`\n${C.rojo('El motor de IA no está disponible.')}\n  ${motivo}\n`);
  process.exit(1);
}

if (argumentos.includes('--modelos')) {
  console.log(C.gris('\nModelos que admite tu clave para generar contenido:\n'));
  for (const m of await listaModelos()) {
    const gratis = /flash/i.test(m.nombre) ? C.verde('  ← nivel gratuito') : '';
    console.log(`  ${m.nombre.padEnd(36)} ${C.gris(m.descripcion)}${gratis}`);
  }
  console.log(C.gris(`\nEl configurado ahora es ${modelo}. Se cambia con PICTOPEC_MODELO en .env\n`));
  process.exit(0);
}

const [fraseArg, nivelArg] = argumentos;
console.log(C.gris(`\n${proveedor} · ${modelo}`));

if (fraseArg) {
  pinta(await analizaFrase(fraseArg, { motor: 'ia', nivel: nivelArg || 'intermedio' }));
} else {
  console.log(C.gris('Batería de casos difíciles. Cada uno ataca un punto donde la simplificación puede hacer daño.'));
  for (const caso of BATERIA) {
    pinta(await analizaFrase(caso.frase, { motor: 'ia', nivel: caso.nivel }), caso.mirar);
  }
}
console.log();
