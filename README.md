# PictoPeC

Convierte una frase escrita o dictada en una secuencia de pictogramas, como apoyo
a la comunicación de personas con autismo, discapacidad intelectual o dificultades
del lenguaje. Es la idea de los Sistemas Aumentativos y Alternativos de
Comunicación (SAAC), con los pictogramas y las voces de **ARASAAC**.

```
"Vamos a comer al parque"   →   [ ir ]  [ comer ]  [ parque ]
```

## Arrancar

```bash
node server.js
```

Y abrir <http://localhost:3000>. Arranca sin instalar nada: sin dependencias,
sin claves y sin compilación, con solo módulos nativos de Node 20.12 o superior.

La app abre en un **hub** con pictogramas grandes desde el que se elige qué hacer:
escribir una frase, construirla tocando pictogramas, buscar historias sociales o
abrir las frases guardadas.

## Desde el móvil o la tablet

Al arrancar, el servidor imprime las direcciones, incluida la de la red local:

```
  PictoPeC
    en este equipo   http://localhost:3000
    en el móvil      http://192.168.1.42:3000
```

Con esa segunda dirección se abre desde cualquier móvil o tablet conectado al
mismo wifi. Basta para probarla.

**Para instalarla como app hace falta HTTPS.** Los navegadores solo ofrecen
instalar, y solo registran el service worker, en un contexto seguro; `localhost`
está exento pero una IP de red local por HTTP no. La forma más rápida de tener
una URL HTTPS sin desplegar nada:

```bash
npm run tunel
```

Levanta un túnel de Cloudflare (sin cuenta; `npx` descarga el binario la
primera vez) e imprime una dirección `https://….trycloudflare.com`. Con ella:

- **Android / Chrome** — sale solo el banner *Instalar aplicación*; si no,
  menú ⋮ → *Instalar aplicación*.
- **iPhone / iPad** — hay que abrirla en **Safari**: *Compartir* → *Añadir a
  pantalla de inicio*.

El túnel da una URL distinta cada vez y vive mientras el proceso esté abierto,
así que sirve para probar, no para quedársela. Para eso hay que desplegar el
servidor en algún sitio con dominio fijo.

`localhost.run` también sirve y no necesita descargar nada
(`ssh -R 80:localhost:3000 nokey@localhost.run`), pero cierra el túnel a los
pocos minutos sin tráfico, así que se cae justo mientras enseñas la app.

Una vez instalada, el service worker guarda pictogramas, locuciones y
tipografías: lo que ya se ha usado sigue funcionando sin conexión, que en un
aula sin wifi fiable es la diferencia entre servir y no servir.

## El problema que resuelve

La parte difícil no es buscar pictogramas, es saber **qué** buscar.

La búsqueda de ARASAAC resuelve plurales pero no conjugaciones verbales:

| Se busca | Resultado |
|---|---|
| `parques` | ✅ parque |
| `niños` | ✅ niño |
| `vamos` | ❌ nada |
| `comemos` | ❌ nada |
| `jugando` | ❌ nada |

Un mapeo directo palabra → pictograma devolvería, para *"Vamos a comer al parque"*,
únicamente **parque**. Por eso PictoPeC lematiza antes de buscar.

## Cómo funciona

El motor produce, por cada concepto, una lista ordenada de **hipótesis**. Quien
decide cuál es la buena es ARASAAC, que hace de diccionario: gana la primera
hipótesis que tenga pictograma.

```
"Vamos a comer al parque"
        │
        ├─ 1. Expresiones multipalabra    "parque infantil", "por favor"
        ├─ 2. Fuera las palabras vacías   el, la, de, al, es, está…
        ├─ 3. Hipótesis de lema           vamos → [vamos, ir, vamo]
        └─ 4. ARASAAC decide              "vamos" ✗  →  "ir" ✓
```

Ese orden es lo que hace seguras unas reglas muy agresivas. La regla
`-o → -ar/-er/-ir` convertiría *libro* en *librar*, pero nunca llega a usarse:
*libro* ya tiene pictograma y ocupa la primera posición.

El diccionario cubre:

- 31 verbos irregulares con sus formas frecuentes (`data/irregulares-es.json`)
- Reglas de sufijo para los regulares, con diptongación (*pienso* → *pensar*)
  y cambios ortográficos (*busqué* → *buscar*, *empecé* → *empezar*)
- Pronombres enclíticos (*ponte* → *poner*, *cuéntame* → *contar*)
- 138 palabras vacías, cuidando de **no** descartar las que cambian el sentido:
  negaciones, interrogativos, pronombres personales y cuantificadores

## Simplificación adaptativa

Con el motor de IA activo, antes de buscar pictogramas se decide si la frase
cabe en el nivel de quien la va a leer, y si no cabe se reescribe.

Lo ejecuta **Google Gemini** (nivel gratuito, sin tarjeta). El proveedor está
encapsulado en `src/nlp-gemini.js`: el resto del proyecto solo conoce
`extraeConceptosConIA`, así que cambiarlo toca un fichero.

El modelo por defecto es **`gemini-3.1-flash-lite`**, elegido midiendo:

| Modelo | Latencia | |
|---|---|---|
| `gemini-3.1-flash-lite` | 2-4 s | El elegido |
| `gemini-3.6-flash` | ~24 s | Razona mejor, pero no permite desactivar el razonamiento previo (400) y 24 s es inusable con alguien esperando delante |
| `gemini-2.5-flash` | — | Google ya no lo sirve a claves nuevas |

```
"Me apetece merendar algo dulce"

  diccionario local →  apetece · merendar · algo · dulce
                       («apetece» y «algo» no tienen pictograma: dos huecos de cuatro)

  IA, nivel básico  →  querer · comer · galleta
```

Hay **tres niveles**, y no cambian solo cuántos pictogramas salen: cambian
cuánto se le permite al modelo inventar.

| Nivel | Conceptos | Concreción |
|---|---|---|
| Básico | hasta 4 | Permitida y esperada |
| Intermedio | 4 a 7 | Solo si el término general no puede tener pictograma |
| Avanzado | hasta 12 | **Prohibida** |

### Reducción y concreción no son lo mismo

El tablero habla **en nombre de** la persona, así que cada palabra añadida es
una palabra que ella no ha dicho. El motor distingue dos operaciones y las
marca por separado:

- **Reducción** — se quita lo que no es esencial. No cambia lo que se dice.
  *"me apetece" → querer*
- **Concreción** — se sustituye algo general por un ejemplar concreto. **Sí
  cambia lo que se dice.** *"algo dulce" → galleta*

La concreción a veces es imprescindible, porque un pictograma necesita un
referente concreto y "algo dulce" no lo tiene. Pero si alguien pide algo dulce
y el tablero dice *galleta*, le ofrecerán una galleta cuando quizá quería otra
cosa. Por eso la interfaz pinta las concreciones en rojo, con su aviso, y es lo
único de la pantalla que se marca así.

En nivel avanzado la concreción está prohibida del todo: si el término es
abstracto se deja tal cual y se acepta el hueco. **Un hueco honesto vale más
que una sustitución inventada**, porque el hueco lo ve el cuidador y lo
resuelve, y la sustitución pasa desapercibida.

### Reglas que no se rompen en ningún nivel

1. **La negación nunca se pierde.** Simplificar es justo cuando más fácil es
   que se caiga un "no".
2. **No se invierte la dirección del enunciado.** "¿Quieres comer?" es una
   pregunta hacia la persona; "quiero comer" es lo que ella dice.
3. **Si la frase ya cabe en el nivel, no se toca.** Reescribir "quiero agua"
   solo puede empeorarlo. Dejar la frase en telegrama (quitar artículos,
   preposiciones y cópulas) no cuenta como simplificar: si contara, el cuidador
   acabaría revisando avisos que no dicen nada y dejaría de mirarlos justo
   cuando uno importa.

### La prohibición de nivel avanzado se impone en código

Medido contra el modelo real, el prompt no basta: pide *"algo dulce"* en nivel
avanzado y concreta a *galleta* igualmente. **Una regla de seguridad no puede
depender de que el modelo la cumpla**, así que `deshazConcreciones()` revierte
el lema al término original antes de buscar el pictograma. Resultado: el hueco
honesto que el nivel promete.

### Activarlo

1. Entra en **<https://aistudio.google.com/apikey>** con tu cuenta de Google.
2. Pulsa **Crear clave de API**. No pide tarjeta.
3. Copia la clave y pégala en `.env`:

```bash
npm install @google/genai
cp .env.example .env        # y pegar la clave en GEMINI_API_KEY=
```

Sin clave o sin SDK la app funciona igual con el diccionario local: el selector
de nivel se desactiva y explica por qué, y el modo automático cae al local ante
cualquier fallo.

Para ver qué modelos admite tu clave: `npm run ia -- --modelos`. Se elige con
`PICTOPEC_MODELO` en `.env`.

### Probar el prompt sin pasar por la interfaz

```bash
npm run ia                              # batería de casos difíciles
npm run ia -- "una frase" basico        # una frase concreta
npm run ia -- --modelos                 # modelos disponibles con tu clave
```

La batería ataca los puntos donde la simplificación puede hacer daño: la
negación que debe sobrevivir, la frase ya simple que no hay que tocar, la
concreción que debe quedar anotada como tal, y el nivel avanzado donde no debe
concretar.

## Construir una frase tocando pictogramas

El modo que sirve a quien **no escribe**: todo lo demás exige teclear.

Una rejilla de **175 palabras** en 15 grupos, y un buscador para el resto. En SAAC
«vocabulario nuclear» es un término técnico: el conjunto reducido de palabras
de alta frecuencia que cubre la mayor parte de lo que alguien dice a diario.
Por eso los primeros grupos son verbos y palabras de función, no sustantivos: con
*querer*, *más* y *no* se comunica muchísimo más que con cien nombres de cosas. Los
grupos de cosas concretas vienen después, y **para lo que no esté hay un buscador**
que llega a los 40.000 pictogramas de ARASAAC.

El vocabulario no se edita a mano. Las candidatas están en
`scripts/genera-vocabulario.js`, y al ejecutarlo se verifica cada una contra
ARASAAC y se descartan solas las que no tengan pictograma:

```bash
node scripts/genera-vocabulario.js
```

Así el tablero nunca sale con huecos, y ampliarlo es añadir palabras a una lista
y volver a ejecutarlo.

Cada toque suena al instante (locución de ARASAAC) y añade el pictograma a la
frase en construcción, que se queda pegada arriba mientras se recorre el
vocabulario. Al terminar, la secuencia se convierte en español bien formado:

```
[yo] [ir] [casa]            →  "Voy a casa"
[yo] [no] [querer] [comer]  →  "Yo no quiero comer"
[dónde] [mamá]              →  "¿Dónde está mamá?"
[yo] [doler] [cabeza]       →  "Me duele la cabeza"
[parar] [música]            →  "Para la música"
```

### La regla que manda: no poner palabras en su boca

Aquí la app habla **por** la persona, así que solo puede añadir lo que la
gramática española exige — artículos, preposiciones, cópulas, conjugación. Ni
un verbo, ni un sustantivo, ni un adverbio que ella no haya tocado:

```
[yo] [ir] [casa]  →  "Voy a casa"         ✓
                  →  "Quiero ir a casa"   ✗  «quiero» no lo ha tocado
```

Si la secuencia queda pobre, sale pobre. Una frase torpe que dice lo que quiso
decir vale infinitamente más que una redonda que dice otra cosa. Y si aun así
el modelo añade algo con contenido, lo declara y la interfaz lo enseña en rojo,
igual que las concreciones del otro modo.

**La negación se comprueba en código.** Si se tocó *no* y la frase sale
afirmativa, se rechaza. Es la única comprobación que puede hacerse de forma
determinista, y da la casualidad de que es la que más importa.

Sin motor de IA el modo sigue sirviendo: se leen las palabras seguidas, que es
exactamente lo que da un tablero de comunicación de papel.

## Historias sociales

Una historia social cuenta por adelantado qué va a pasar en una situación y qué
se espera, para poder anticiparla en vez de vivirla de golpe. Es una
intervención reconocida en autismo, y **ARASAAC tiene cientos publicadas por
profesionales** — ir al dentista, cortarse el pelo, cuando me enfado. No tiene
ningún sentido inventarlas cuando ya existen hechas y revisadas.

La app busca en su catálogo (`api.arasaac.org/api/materials/…`) y enlaza a la
ficha original. Un botón pasa además el título por el motor de la app, para
llevarlo al tablero.

**Por qué no hay portadas:** la API devuelve el nombre del fichero de la captura
pero no una URL utilizable. Probé los patrones del CDN y todos dan 404, y la
página del material es una SPA que no la trae en el HTML. Antes que reventar su
CDN a conjeturas o depender de una URL no documentada, cada historia se ilustra
con pictogramas generados de su **propio título** por el motor local. Sale más
coherente con el resto de la app.

## La voz

Las palabras se leen con las **locuciones grabadas de ARASAAC**
(`/locutions/es/<palabra>.mp3`): voz humana real, en español, y exactamente la
misma palabra que ilustra el pictograma. La voz sintética del navegador queda
solo de reserva para lo que ARASAAC no tenga grabado.

Eso además evita un problema real: la síntesis de voz del navegador es poco
fiable en Firefox sobre Linux, y con locuciones grabadas la lectura no depende
de ella.

Mientras suena cada palabra se resalta su celda, igual que se señala con el dedo
sobre un tablero de papel.

## La interfaz

Pensada para tablet y uso táctil: objetivos grandes, texto siempre bajo el
pictograma, y el color reservado para lo que significa algo.

Las celdas van coloreadas según la **clave Fitzgerald**, la convención SAAC que
codifica el tipo de palabra por color (acciones en verde, personas en amarillo,
cualidades en azul…). No es decoración: se lee el tipo de palabra antes que la
palabra.

- **Dictado por voz** con el micrófono (Chrome y Edge)
- **Tocar un pictograma** para cambiarlo, o para buscar a mano los que faltan
- **Presentar**: pantalla completa con los pictogramas enormes, para girar la
  tablet hacia la persona con la que se está hablando
- **Imprimir**: un tablero en papel es material de trabajo real en un aula

## Estructura

```
server.js               Servidor HTTP, sin dependencias
src/
  arasaac.js            Cliente de la API + caché compartida
  historias.js          Catálogo de historias sociales de ARASAAC
  texto.js              Normalización, palabras vacías, n-gramas
  lematiza.js           Hipótesis de lema: irregulares, reglas, enclíticos
  nlp-local.js          Motor local: diccionario y reglas
  nlp-gemini.js         Motor de IA (Gemini): simplificación adaptativa
  pipeline.js           Orquestador y elección de motor
data/
  vacias-es.json             Palabras vacías por grupos
  irregulares-es.json        Verbos irregulares
  vocabulario-nuclear.json   Las 175 palabras del modo de construir (generado)
public/                 Interfaz, manifest, service worker e iconos
test/                   Pruebas unitarias y de integración
scripts/                Banco de pruebas de la IA y generador del vocabulario
```

## Pruebas

```bash
npm test                     # todo, incluida la integración con ARASAAC
PICTOPEC_SIN_RED=1 npm test  # solo las que no necesitan conexión
```

Las de integración son las que de verdad importan: comprueban que una frase
escrita por una persona acaba en la fila de pictogramas correcta, incluido que
**la negación nunca se pierde** — convertir un "no quiero" en "quiero" es el peor
fallo posible en una herramienta de comunicación.

## Límites conocidos

Casos en los que las reglas se quedan cortas:

- Formas ambiguas que también son sustantivos. `data/irregulares-es.json`
  documenta las omisiones deliberadas: *vino*, *juego*, *sal*, *cuento*…
  se buscan como sustantivo, que es la lectura más probable.
- Verbos irregulares fuera de la lista de 31.
- Frases largas o subordinadas: se trocean, no se simplifican.

El motor de IA resuelve justamente estos casos, y además simplifica las frases
que no caben en el nivel de quien las lee.

## Licencia de los pictogramas

Los pictogramas y las locuciones son propiedad del **Gobierno de Aragón**,
creados por **Sergio Palao** para **ARASAAC** (<https://arasaac.org>) y publicados
bajo licencia **Creative Commons BY-NC-SA**. Esto obliga a tres cosas en cualquier
uso o distribución: citar la autoría, no darles uso comercial, y compartir las
obras derivadas bajo la misma licencia.

El código de este repositorio es MIT.
