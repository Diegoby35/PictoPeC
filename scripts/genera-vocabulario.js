#!/usr/bin/env node
/**
 * Genera data/vocabulario-nuclear.json verificando cada palabra contra ARASAAC.
 *
 *   node scripts/genera-vocabulario.js
 *
 * Las candidatas se escriben aquí abajo; las que no tengan pictograma se caen
 * solas y se listan al final. Así el tablero nunca sale con huecos, y ampliar
 * el vocabulario es editar una lista y volver a ejecutar esto.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buscarMejor, mapaConLimite } from '../src/arasaac.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Cada entrada es [texto visible, término de búsqueda, categoría Fitzgerald].
   Cuando el término de búsqueda coincide con el texto visible, se omite. */
const GRUPOS = [
  ['Respuesta', 'social', [
    ['sí'], ['no'], ['no sé', 'no lo sé'], ['parar'], ['esperar'],
  ]],
  ['Personas', 'persona', [
    ['yo'], ['tú'], ['mamá'], ['papá'], ['hermano'], ['hermana'], ['abuelo'], ['abuela'],
    ['familia'], ['amigo'], ['profesora'], ['médico'], ['nosotros'],
  ]],
  ['Acciones', 'accion', [
    ['querer'], ['necesitar'], ['ir'], ['venir'], ['comer'], ['beber'], ['jugar'],
    ['ayudar'], ['mirar'], ['escuchar'], ['hablar'], ['dar'], ['tener'], ['poder'],
    ['hacer'], ['dormir'], ['doler'], ['terminar'], ['gustar'], ['abrir'], ['cerrar'],
    ['pintar'], ['leer'], ['escribir'], ['cantar'], ['bailar'], ['pasear'], ['nadar'],
    ['lavarse', 'lavar'], ['ducharse', 'duchar'], ['vestirse', 'vestir'],
    ['descansar'], ['trabajar'], ['aprender'],
  ]],
  ['Preguntas', 'otro', [
    ['qué'], ['dónde'], ['quién'], ['cuándo'], ['cómo'], ['por qué'],
  ]],
  ['Cantidad', 'cualidad', [
    ['más'], ['menos'], ['mucho'], ['poco'], ['otro'], ['todo'], ['nada'], ['otra vez'],
    ['grande'], ['pequeño'],
  ]],
  ['Cómo me siento', 'cualidad', [
    ['contento'], ['triste'], ['cansado'], ['enfadado'], ['miedo'], ['dolor'],
    ['nervioso'], ['tranquilo'], ['aburrido'], ['enfermo'], ['sorpresa'], ['hambre'], ['sed'],
  ]],
  ['Sitios', 'lugar', [
    ['casa'], ['baño', 'cuarto de baño'], ['colegio'], ['clase'], ['parque'], ['calle'],
    ['cocina'], ['patio'], ['tienda'], ['hospital'], ['piscina'], ['playa'], ['campo'],
  ]],
  ['Comida', 'objeto', [
    ['agua'], ['leche'], ['zumo'], ['pan'], ['fruta'], ['manzana'], ['plátano'],
    ['galleta'], ['bocadillo'], ['yogur'], ['pasta'], ['arroz'], ['pollo'], ['huevo'],
    ['chocolate'], ['sopa'], ['queso'], ['comida'],
  ]],
  ['Cosas', 'objeto', [
    ['juguete'], ['libro'], ['música'], ['pelota'], ['lápiz'], ['cuaderno'], ['mochila'],
    ['móvil'], ['ordenador'], ['televisión'], ['cama'], ['mesa'], ['silla'], ['puerta'],
    ['jabón'], ['toalla'], ['cepillo de dientes'], ['medicina'],
  ]],
  ['Ropa', 'objeto', [
    ['camiseta'], ['pantalón'], ['abrigo'], ['zapatos'], ['calcetines'], ['gorro'], ['pijama'],
  ]],
  ['Mi cuerpo', 'objeto', [
    ['cabeza'], ['barriga'], ['mano'], ['pie'], ['boca'], ['ojo'], ['oreja'], ['diente'],
    ['nariz'], ['brazo'], ['pierna'], ['espalda'],
  ]],
  ['Animales', 'objeto', [
    ['perro'], ['gato'], ['pájaro'], ['pez'], ['caballo'], ['conejo'],
  ]],
  ['Transporte', 'objeto', [
    ['coche'], ['autobús'], ['tren'], ['avión'], ['bicicleta'],
  ]],
  ['Cuándo', 'tiempo', [
    ['ahora'], ['después'], ['antes'], ['hoy'], ['mañana'], ['ayer'], ['siempre'], ['nunca'],
  ]],
  ['Cortesía', 'social', [
    ['hola'], ['adiós'], ['por favor'], ['gracias'], ['perdón'], ['buenos días'], ['buenas noches'],
  ]],
];

const candidatas = GRUPOS.flatMap(([grupo, tipo, palabras]) =>
  palabras.map(([texto, busca]) => ({ grupo, tipo, texto, busca: busca ?? texto })));

console.log(`Verificando ${candidatas.length} palabras contra ARASAAC…\n`);

const encontradas = await mapaConLimite(candidatas, (p) => buscarMejor(p.busca), 8);

const validas = [];
const caidas = [];
candidatas.forEach((p, i) => (encontradas[i] ? validas : caidas).push(p));

const salida = {
  _comentario: [
    'Vocabulario del modo de construir frases tocando.',
    '',
    'GENERADO. No editar a mano: se reescribe con',
    '  node scripts/genera-vocabulario.js',
    'Las palabras candidatas están en ese script, y las que no tienen',
    'pictograma en ARASAAC se caen solas, así que el tablero nunca sale con',
    'huecos.',
    '',
    'En SAAC "vocabulario nuclear" es un término técnico: el conjunto reducido',
    'de palabras de alta frecuencia que cubre la mayor parte de lo que alguien',
    'dice a diario. Por eso los primeros grupos son verbos y palabras de',
    'función, no sustantivos: con "querer", "más" y "no" se comunica mucho más',
    'que con cien nombres de objetos. Los grupos de cosas concretas vienen',
    'después, y para lo que no esté, el modo tiene buscador.',
    '',
    'El campo "tipo" es la categoría Fitzgerald, la que colorea las celdas.',
  ],
  grupos: GRUPOS.map(([nombre]) => ({
    nombre,
    palabras: validas
      .filter((p) => p.grupo === nombre)
      .map(({ texto, busca, tipo }) => ({ texto, busca, tipo })),
  })).filter((g) => g.palabras.length),
};

writeFileSync(join(RAIZ, 'data', 'vocabulario-nuclear.json'), JSON.stringify(salida, null, 2) + '\n');

console.log(`  ✓ ${validas.length} palabras en ${salida.grupos.length} grupos`);
if (caidas.length) {
  console.log(`\n  ✗ ${caidas.length} sin pictograma, descartadas:`);
  for (const p of caidas) console.log(`      ${p.texto}${p.busca !== p.texto ? ` (buscando "${p.busca}")` : ''}`);
}
for (const g of salida.grupos) console.log(`      ${g.nombre.padEnd(18)} ${g.palabras.length}`);
