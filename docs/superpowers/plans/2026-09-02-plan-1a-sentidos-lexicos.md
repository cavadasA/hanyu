# Plan 1A — Sentidos léxicos: el corpus deja de ser "hanzi + nivel"

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada fila del corpus represente un sentido concreto de una palabra —con su lectura, su glosa inglesa y española correctas, su forma tradicional y su clasificador— y que la app móvil muestre la glosa en el idioma de apoyo elegido.

**Architecture:** El corpus se genera desde `data/HSK_Level_{1,2,3}.txt` (Anki xiehanzi de krmanik/HSK-3.0). Cada fila trae una columna HTML de CC-CEDICT que contiene **un bloque `<ul>` por lectura**, precedido de `<span class="pinYinWrapper">` con esa lectura. El importador actual ignora esa estructura: puntúa los bloques con una heurística y elige uno solo por hanzi, así que las dos filas de 还 (hái L1 y huán L3) reciben la misma glosa. La corrección es estructural, no una curación manual: emparejar cada bloque con su lectura y seleccionar el que coincide con la columna de pinyin de la fila. Un test de contrato sobre el JSON del corpus impide que el defecto vuelva.

**Tech Stack:** Node 26 (`.nvmrc`), vitest para todo lo que no es React Native, Jest para `apps/mobile`, TypeScript en `packages/*` y `apps/mobile`, JavaScript plano en `scripts/`, Supabase (Postgres) como base de datos de la app móvil.

## Global Constraints

- **Foco móvil, y la web está congelada.** Los entregables son `apps/mobile`, `packages/data`, `packages/domain`, `supabase/` y el corpus en `server/db/seeds/*.json`.

  `apps/web` sigue en el repositorio pero **no se verifica y no se toca**: está fuera de `vitest.config.js`. Si un cambio en `packages/data` la rompe, se deja rota. No inviertas ni un minuto en arreglarla, ni siquiera cuando el fallo sea evidente y la corrección de una línea.

  De `server/` solo vive `server/db`, porque ahí está el corpus que alimenta `supabase/seed.sql` y con él la app móvil. El servidor Express, sus rutas y sus servicios están congelados igual que la web.

  Consecuencia práctica: en `packages/data` no hace falta preservar los alias de compatibilidad que existen para la web (`WordPage.words`, `WordPage.limit`). No los quites en este plan —no es su cometido— pero tampoco añadas ninguno nuevo.
- **`npm test` debe pasar al final de cada tarea.** Ejecuta los 5 pasos (3 typechecks + vitest + jest) e informa de todos aunque uno falle.
- **Node 26 según `.nvmrc`.** Los scripts en `scripts/` importan directamente ficheros `.ts` de `packages/domain` apoyándose en el type stripping nativo de Node ≥23. Si el intérprete es anterior, `npm run import-hsk` fallará con un error de sintaxis: ése es el síntoma, y la solución es usar la versión de `.nvmrc`, no duplicar el módulo.
- **Prohibido escribir mitigaciones.** Si algo está mal y su arreglo pertenece a un plan posterior, se deja roto y se anota en `server/db/seeds/sense-review-queue.json`. No se tapa.
- **Idioma de apoyo por defecto: español (`es`).** Los datos españoles ya existen en el corpus; hoy la app muestra inglés en todas partes.
- **El corpus es un artefacto generado.** Nunca se editan a mano `server/db/seeds/hsk{1,2,3}-words.json`. Toda corrección entra por el importador o por el fichero de glosas curadas, para que regenerar sea reproducible.

## Estado de partida verificado (2 de septiembre de 2026)

Datos medidos sobre el repositorio, no estimados. Los tests de la Tarea 2 deben reproducir exactamente estas cifras:

- 1010 filas en el corpus, 990 formas hanzi únicas.
- 19 hanzi aparecen en más de una fila. De ésos:
  - **5 con lectura distinta** y glosa inglesa idéntica — el defecto que este plan corrige de raíz: `还 hái/huán`, `只 zhī/zhǐ`, `地 de/dì`, `得 de/děi`, `长 cháng/zhǎng`.
  - **14 con la misma lectura en niveles distintos** — `好 L1/L2`, `会 L1/L3`, `给 L1/L2`, `那 L1/L2`, `家 L1/L3`, `分 L1/L3`, `回 L1/L3`, `有些 L1/L3`, `点 L1/L2/L3`, `多 L1/L2`, `头 L2/L3`, `过去 L2/L3`, `站 L2/L3`, `一会儿 L2/L3`. En HSK 3.0 son legítimas: el sílabo reintroduce la palabra cuando aparece un sentido nuevo. Seleccionar por lectura **no** las distingue, porque la lectura es la misma. Este plan las pone en cuarentena explícita; asignarles sentido requiere el sílabo oficial (Plan 1B).
- 178 filas llevan el clasificador incrustado dentro de `meaning_en` como `CL:片[pian4]`.
- 0 filas sin `meaning_es`.
- El parser por lectura prototipado resuelve **1010 de 1010** filas fuente.

## File Structure

**Se crean:**
- `packages/domain/src/pinyin.ts` — normalización de pinyin para comparar lecturas. Función pura, sin dependencias.
- `packages/domain/src/pinyin.test.ts`
- `scripts/lib/cedict-html.js` — parser del HTML de CC-CEDICT y selección de bloque por lectura. Sin estado, sin E/S.
- `scripts/lib/cedict-html.test.js`
- `scripts/corpus-contract.test.js` — contrato del corpus generado. Es la red que impide que el defecto vuelva.
- `server/db/seeds/sense-glosses-es.json` — glosas españolas curadas por (hanzi, lectura). Único sitio donde se escribe español a mano.
- `server/db/seeds/sense-review-queue.json` — cuarentena de las 14 filas que comparten lectura entre niveles.
- `supabase/migrations/2026090201_word_senses.sql`

**Se modifican:**
- `scripts/import-hsk-data.js` — usa el parser nuevo, preserva `meaning_es`, escribe `traditional` y `classifier`.
- `scripts/build-supabase-seed.js` — emite las columnas nuevas.
- `packages/domain/src/index.ts` — exporta `normalizePinyin`.
- `packages/data/src/types.ts`, `packages/data/src/database.types.ts`
- `packages/data/src/repositories/words.ts`, `flashcards.ts`, `decks.ts`, `settings.ts`
- `apps/mobile/src/screens/YouScreen.tsx`, `WordsScreen.tsx`, `DeckDetailScreen.tsx`
- `apps/mobile/src/ui/FlashCardView.tsx`, `apps/mobile/src/readings/WordSheet.tsx`

---

## Task 1: Normalización de pinyin

**Files:**
- Create: `packages/domain/src/pinyin.ts`
- Test: `packages/domain/src/pinyin.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `normalizePinyin(input: string): string` — exportada desde `@hanyu/domain`. La usan la Tarea 2 (contrato), la Tarea 3 (selección de lectura) y la Tarea 4 (clave de fusión).

Tres reglas, cada una con una razón concreta medida en los datos:
1. **Quitar marcas de tono, conservar la diéresis.** `ǜ` es `u` + diéresis + tono grave. Quitar todas las marcas combinantes convertiría `lǜ` en `lu` y colisionaría con `lù`. Se eliminan solo U+0300, U+0301, U+0304 y U+030C.
2. **Quitar dígitos de tono.** La columna fuente mezcla formatos: `Xing1 qī tiān` frente a `xīngqītiān`.
3. **Quitar separadores de sílaba.** `nǎ r5` frente a `nǎr`, `xī'ān` frente a `xīan`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/pinyin.test.ts
import { normalizePinyin } from './pinyin';

describe('normalizePinyin', () => {
  it('quita las marcas de tono', () => {
    expect(normalizePinyin('hái')).toBe('hai');
    expect(normalizePinyin('huán')).toBe('huan');
    expect(normalizePinyin('dì')).toBe('di');
    expect(normalizePinyin('zhǎng')).toBe('zhang');
  });

  it('conserva la diéresis de ü, que no es un tono', () => {
    expect(normalizePinyin('lǜ')).toBe('lü');
    expect(normalizePinyin('nǚ')).toBe('nü');
  });

  it('pasa a minúsculas para que la lectura de apellido compare igual que la común', () => {
    expect(normalizePinyin('Huán')).toBe('huan');
    expect(normalizePinyin('Xing1')).toBe('xing');
  });

  it('quita los dígitos de tono que usa el formato numérico', () => {
    expect(normalizePinyin('Xing1 qī tiān')).toBe('xingqitian');
    expect(normalizePinyin('nǎ r5')).toBe('nar');
  });

  it('quita los separadores de sílaba', () => {
    expect(normalizePinyin('nǐ hǎo')).toBe('nihao');
    expect(normalizePinyin('yíhuìr')).toBe('yihuir');
    expect(normalizePinyin("xī'ān")).toBe('xian');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/domain/src/pinyin.test.ts`
Expected: FAIL — `Failed to resolve import "./pinyin"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/domain/src/pinyin.ts
/**
 * El pinyin lleva dos clases de diacrítico. Las cuatro marcas de tono son
 * información prosódica; la diéresis de ü forma parte de la sílaba. Normalizar
 * para comparar lecturas debe descartar las primeras y conservar la segunda:
 * sin esa distinción `lǜ` colisionaría con `lù`.
 *
 * La columna de pinyin del corpus fuente mezcla formatos —`xīngqītiān` y
 * `Xing1 qī tiān` son la misma lectura— así que también se descartan los
 * dígitos de tono y los separadores de sílaba.
 */
const TONE_MARKS = /[̀́̄̌]/g;
const TONE_DIGITS = /[0-5]/g;
const SYLLABLE_SEPARATORS = /[\s'’·-]/g;

export function normalizePinyin(input: string): string {
  return input
    .normalize('NFD')
    .replace(TONE_MARKS, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(TONE_DIGITS, '')
    .replace(SYLLABLE_SEPARATORS, '');
}
```

Añade la exportación al final de `packages/domain/src/index.ts`:

```ts
export { normalizePinyin } from './pinyin';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/domain/src/pinyin.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/pinyin.ts packages/domain/src/pinyin.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): normalización de pinyin para comparar lecturas"
```

---

## Task 2: Contrato del corpus

Este test debe **fallar** al escribirse. Es la prueba de que el defecto existe, y la red que impide que vuelva después de la Tarea 4.

**Files:**
- Create: `scripts/corpus-contract.test.js`
- Create: `server/db/seeds/sense-review-queue.json`

**Interfaces:**
- Consumes: `normalizePinyin` de `@hanyu/domain` (Tarea 1).
- Produces: `loadCorpus(): Array<{hanzi, pinyin, meaning_en, meaning_es, pos, frequency, hsk_level}>` — exportada para reutilizarla en la Tarea 5.

- [ ] **Step 1: Write the failing test**

Primero la cuarentena, con las 14 filas medidas. `reason` explica por qué está aquí y qué la sacará:

```json
[
  { "hanzi": "好", "pinyin": "hǎo", "levels": [1, 2], "reason": "misma lectura en dos niveles; el sílabo introduce un sentido nuevo en HSK 2" },
  { "hanzi": "会", "pinyin": "huì", "levels": [1, 3], "reason": "misma lectura en dos niveles; el sílabo introduce un sentido nuevo en HSK 3" },
  { "hanzi": "给", "pinyin": "gěi", "levels": [1, 2], "reason": "misma lectura en dos niveles; el sílabo introduce un sentido nuevo en HSK 2" },
  { "hanzi": "那", "pinyin": "nà", "levels": [1, 2], "reason": "misma lectura en dos niveles; el sílabo introduce un sentido nuevo en HSK 2" },
  { "hanzi": "家", "pinyin": "jiā", "levels": [1, 3], "reason": "misma lectura en dos niveles; el sílabo introduce un sentido nuevo en HSK 3" },
  { "hanzi": "分", "pinyin": "fēn", "levels": [1, 3], "reason": "misma lectura en dos niveles; el sílabo introduce un sentido nuevo en HSK 3" },
  { "hanzi": "回", "pinyin": "huí", "levels": [1, 3], "reason": "misma lectura en dos niveles; el sílabo introduce un sentido nuevo en HSK 3" },
  { "hanzi": "有些", "pinyin": "yǒuxiē", "levels": [1, 3], "reason": "misma lectura en dos niveles; el sílabo introduce un sentido nuevo en HSK 3" },
  { "hanzi": "点", "pinyin": "diǎn", "levels": [1, 2, 3], "reason": "misma lectura en tres niveles; el sílabo introduce sentidos nuevos en HSK 2 y HSK 3" },
  { "hanzi": "多", "pinyin": "duō", "levels": [1, 2], "reason": "misma lectura en dos niveles; el sílabo introduce un sentido nuevo en HSK 2" },
  { "hanzi": "头", "pinyin": "tóu", "levels": [2, 3], "reason": "misma lectura en dos niveles; el sílabo introduce un sentido nuevo en HSK 3" },
  { "hanzi": "过去", "pinyin": "guòqù", "levels": [2, 3], "reason": "misma lectura en dos niveles; el sílabo introduce un sentido nuevo en HSK 3" },
  { "hanzi": "站", "pinyin": "zhàn", "levels": [2, 3], "reason": "misma lectura en dos niveles; el sílabo introduce un sentido nuevo en HSK 3" },
  { "hanzi": "一会儿", "pinyin": "yíhuìr", "levels": [2, 3], "reason": "misma lectura en dos niveles; el sílabo introduce un sentido nuevo en HSK 3" }
]
```

Guárdalo en `server/db/seeds/sense-review-queue.json`. Ahora el test:

```js
// scripts/corpus-contract.test.js
//
// El corpus es un artefacto generado por scripts/import-hsk-data.js. Este
// fichero fija su contrato: qué garantías debe cumplir el resultado,
// independientemente de cómo se genere. Un fallo aquí significa que el
// importador ha vuelto a mezclar sentidos, no que el test esté mal.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePinyin } from '@hanyu/domain';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const seedDir = join(rootDir, 'server', 'db', 'seeds');

export function loadCorpus() {
  const rows = [];

  for (const level of [1, 2, 3]) {
    const file = join(seedDir, `hsk${level}-words.json`);
    for (const word of JSON.parse(readFileSync(file, 'utf8'))) {
      rows.push({ ...word, hsk_level: level });
    }
  }

  return rows;
}

function groupByHanzi(rows) {
  const groups = new Map();

  for (const row of rows) {
    const list = groups.get(row.hanzi) ?? [];
    list.push(row);
    groups.set(row.hanzi, list);
  }

  return groups;
}

describe('contrato del corpus', () => {
  const rows = loadCorpus();

  it('tiene el tamaño esperado', () => {
    expect(rows).toHaveLength(1010);
  });

  it('nunca da la misma glosa inglesa a dos lecturas distintas del mismo hanzi', () => {
    const offenders = [];

    for (const [hanzi, list] of groupByHanzi(rows)) {
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const a = list[i];
          const b = list[j];

          if (normalizePinyin(a.pinyin) === normalizePinyin(b.pinyin)) {
            continue;
          }

          if (a.meaning_en === b.meaning_en) {
            offenders.push(`${hanzi} ${a.pinyin}/${b.pinyin}: "${a.meaning_en}"`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('no deja el clasificador incrustado dentro de la glosa inglesa', () => {
    const offenders = rows
      .filter((row) => /CL:/.test(row.meaning_en))
      .map((row) => `${row.hanzi} ${row.pinyin}: "${row.meaning_en}"`);

    expect(offenders).toEqual([]);
  });

  it('da glosa española a todas las filas', () => {
    const offenders = rows
      .filter((row) => !row.meaning_es || !String(row.meaning_es).trim())
      .map((row) => `${row.hanzi} ${row.pinyin} L${row.hsk_level}`);

    expect(offenders).toEqual([]);
  });

  it('declara en la cola de revisión toda fila que repite lectura entre niveles', () => {
    const repeated = [];

    for (const [hanzi, list] of groupByHanzi(rows)) {
      const readings = new Set(list.map((row) => normalizePinyin(row.pinyin)));
      if (list.length > 1 && readings.size === 1) {
        repeated.push(hanzi);
      }
    }

    const queued = JSON.parse(
      readFileSync(join(seedDir, 'sense-review-queue.json'), 'utf8'),
    ).map((entry) => entry.hanzi);

    expect(repeated.sort()).toEqual(queued.sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/corpus-contract.test.js`
Expected: FAIL en dos tests concretos.
- "nunca da la misma glosa inglesa a dos lecturas distintas" → 5 entradas: 还, 只, 地, 得, 长.
- "no deja el clasificador incrustado" → 178 entradas.

Los otros tres deben pasar ya. Si "tiene el tamaño esperado" o la cola de revisión fallan, **para**: el corpus no es el que este plan midió y hay que reconciliar antes de seguir.

- [ ] **Step 3: Commit el test rojo**

El test rojo es el entregable de esta tarea: documenta el defecto con precisión. Se comitea tal cual.

```bash
git add scripts/corpus-contract.test.js server/db/seeds/sense-review-queue.json
git commit -m "test(corpus): fijar el contrato de sentidos; falla con la mezcla actual de glosas"
```

- [ ] **Step 4: Excluir el test del comando general hasta la Tarea 4**

`npm test` debe seguir en verde entre tareas. Añade `scripts/corpus-contract.test.js` a `exclude` en `vitest.config.js`, con un comentario que dice cuándo se quita:

```js
    // scripts/corpus-contract.test.js queda fuera hasta que la Tarea 4 del
    // Plan 1A arregle el importador. Vuelve a entrar en esa misma tarea.
    exclude: ['**/node_modules/**', 'apps/mobile/**', 'scripts/corpus-contract.test.js'],
```

Run: `npm test`
Expected: los 5 pasos en PASS.

```bash
git add vitest.config.js
git commit -m "chore: excluir el contrato de corpus del comando general hasta arreglar el importador"
```

---

## Task 3: Parser de CC-CEDICT por lectura

**Files:**
- Create: `scripts/lib/cedict-html.js`
- Test: `scripts/lib/cedict-html.test.js`

**Interfaces:**
- Consumes: `normalizePinyin` de `@hanyu/domain` (Tarea 1).
- Produces:
  - `parseDictionaryEntry(html: string): { traditional: string | null, readings: Array<{ reading: string, meanings: string[], classifiers: string[] }> }`
  - `selectReading(entry, pinyin: string): { reading, meanings, classifiers } | null`

  Los consume la Tarea 4.

Forma real del HTML fuente, verificada sobre `data/HSK_Level_1.txt` (fila de 还). Cada sentido es un `pinYinWrapper` seguido de su `<ul>`:

```html
<div class="char"> <span id="char-sim-id"><span class="text-color2">还</span></span>
<span class="sep">〔</span><span id="char-trad-id"><span class="text-color2">還</span></span>
<span class="sep">〕</span></div>
<span class="pinYinWrapper"><span class="text-color2">hái</span></span>
<ul> <li>still</li> <li>still in progress</li> ... </ul>
<span class="pinYinWrapper"><span class="text-color2">huán</span></span>
<ul> <li>to pay back</li> <li>to return</li> </ul>
```

- [ ] **Step 1: Write the failing test**

```js
// scripts/lib/cedict-html.test.js
import { parseDictionaryEntry, selectReading } from './cedict-html.js';

// Fragmentos reales de data/HSK_Level_{1,3}.txt, recortados a lo relevante.
const HUAN = `<div class="char">  <span id="char-sim-id">
<span class="text-color2">还</span> </span> <span class="sep">〔</span>
<span id="char-trad-id">  <span class="text-color2">還</span> </span>
<span class="sep">〕</span>
</div> <span class="pinYinWrapper">
<span class="text-color2">Huán</span>
</span> <ul>  <li>surname Huan</li> </ul>  <div class="char">  <span id="char-sim-id">
<span class="text-color2">还</span> </span> </div> <span class="pinYinWrapper">
<span class="text-color2">hái</span>
</span> <ul>  <li>still</li>  <li>still in progress</li>  <li>yet</li> </ul>  <div class="char">
</div> <span class="pinYinWrapper">
<span class="text-color2">huán</span>
</span> <ul>  <li>to pay back</li>  <li>to return</li> </ul>`;

const DI = `<div class="char">  <span id="char-sim-id">
<span class="text-color5">地</span> </span> </div> <span class="pinYinWrapper">
<span class="text-color5">de</span>
</span> <ul>  <li>-ly</li>  <li>structural particle: used before a verb or adjective</li> </ul>
<div class="char">  <span id="char-sim-id">
<span class="text-color4">地</span> </span> </div> <span class="pinYinWrapper">
<span class="text-color4">dì</span>
</span> <ul>  <li>earth</li>  <li>ground</li>  <li>field</li>  <li>CL:片[pian4]</li> </ul>`;

describe('parseDictionaryEntry', () => {
  it('devuelve un bloque por lectura, en orden', () => {
    const entry = parseDictionaryEntry(HUAN);

    expect(entry.readings.map((r) => r.reading)).toEqual(['Huán', 'hái', 'huán']);
  });

  it('extrae la forma tradicional', () => {
    expect(parseDictionaryEntry(HUAN).traditional).toBe('還');
    expect(parseDictionaryEntry(DI).traditional).toBeNull();
  });

  it('saca el clasificador de la lista de significados', () => {
    const di = parseDictionaryEntry(DI).readings.find((r) => r.reading === 'dì');

    expect(di.classifiers).toEqual(['片']);
    expect(di.meanings).toEqual(['earth', 'ground', 'field']);
  });
});

describe('selectReading', () => {
  it('elige el bloque cuya lectura coincide exactamente', () => {
    const entry = parseDictionaryEntry(HUAN);

    expect(selectReading(entry, 'hái').meanings).toEqual([
      'still',
      'still in progress',
      'yet',
    ]);
    expect(selectReading(entry, 'huán').meanings).toEqual(['to pay back', 'to return']);
  });

  it('prefiere la lectura común sobre la de apellido cuando solo difieren en mayúscula', () => {
    // "Huán" (apellido) y "huán" normalizan igual; gana la minúscula.
    const entry = parseDictionaryEntry(HUAN);

    expect(selectReading(entry, 'huan').meanings).toEqual(['to pay back', 'to return']);
  });

  it('tolera las diferencias de formato entre la columna de pinyin y el HTML', () => {
    const erhua = `<span class="pinYinWrapper"><span>nǎ r5</span></span> <ul> <li>where</li> </ul>`;

    expect(selectReading(parseDictionaryEntry(erhua), 'nǎr').meanings).toEqual(['where']);
  });

  it('prueba cada alternativa cuando la columna trae varias lecturas', () => {
    const shei = `<span class="pinYinWrapper"><span>shéi</span></span> <ul> <li>who</li> </ul>`;

    expect(selectReading(parseDictionaryEntry(shei), 'shéi/shuí').meanings).toEqual(['who']);
  });

  it('devuelve null cuando ninguna lectura coincide', () => {
    expect(selectReading(parseDictionaryEntry(DI), 'zzz')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/lib/cedict-html.test.js`
Expected: FAIL — `Failed to resolve import "./cedict-html.js"`.

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/cedict-html.js
//
// La columna de diccionario del corpus fuente es HTML de CC-CEDICT con un
// bloque <ul> por lectura, precedido de su <span class="pinYinWrapper">. El
// importador anterior puntuaba los bloques con una heurística y elegía uno
// solo por hanzi, así que 还 hái y 还 huán acababan con la misma glosa. Aquí
// se conserva el emparejamiento lectura → significados, que es la información
// que permite que cada fila del corpus sea un sentido y no una forma escrita.
import { normalizePinyin } from '../../packages/domain/src/pinyin.ts';

const SENSE_BLOCK = /<span class="pinYinWrapper">([\s\S]*?)<\/span>\s*<ul>([\s\S]*?)<\/ul>/g;
const TRADITIONAL = /<span id="char-trad-id">[\s\S]*?<span[^>]*>([^<]*)<\/span>/;
const LIST_ITEM = /<li>([\s\S]*?)<\/li>/g;
const CLASSIFIER_ENTRY = /^CL:(.+)$/;
const CROSS_REFERENCE = /^(old )?variant of |^used in /;

function stripTags(html) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// "個|个[ge4],位[wei4]" -> ["个", "位"]. CC-CEDICT escribe tradicional|simplificado
// y la lectura entre corchetes; nos quedamos con la forma simplificada.
function parseClassifiers(raw) {
  return raw
    .split(',')
    .map((entry) => entry.replace(/\[[^\]]*\]/g, '').trim())
    .map((entry) => entry.split('|').pop().trim())
    .filter(Boolean);
}

export function parseDictionaryEntry(html) {
  const source = html ?? '';
  const traditionalMatch = TRADITIONAL.exec(source);
  const traditional = traditionalMatch ? stripTags(traditionalMatch[1]) : null;

  const readings = [];
  SENSE_BLOCK.lastIndex = 0;

  let block;
  while ((block = SENSE_BLOCK.exec(source)) !== null) {
    const reading = stripTags(block[1]);
    const meanings = [];
    const classifiers = [];

    LIST_ITEM.lastIndex = 0;
    let item;
    while ((item = LIST_ITEM.exec(block[2])) !== null) {
      const text = stripTags(item[1]);
      if (!text) {
        continue;
      }

      const classifier = CLASSIFIER_ENTRY.exec(text);
      if (classifier) {
        classifiers.push(...parseClassifiers(classifier[1]));
        continue;
      }

      if (CROSS_REFERENCE.test(text)) {
        continue;
      }

      meanings.push(text);
    }

    if (meanings.length > 0) {
      readings.push({ reading, meanings, classifiers });
    }
  }

  return { traditional, readings };
}

export function selectReading(entry, pinyin) {
  const exact = entry.readings.find((reading) => reading.reading === pinyin);
  if (exact) {
    return exact;
  }

  // La columna de pinyin puede traer alternativas separadas por barra ("shéi/shuí").
  for (const variant of String(pinyin).split('/')) {
    const target = normalizePinyin(variant);
    const candidates = entry.readings.filter(
      (reading) => normalizePinyin(reading.reading) === target,
    );

    if (candidates.length > 0) {
      // CC-CEDICT pone en mayúscula la lectura de apellido ("Huán" frente a
      // "huán"). Con el tono normalizado ya no se distinguen, así que la
      // mayúscula inicial es lo único que las separa: gana la común.
      const common = candidates.find(
        (reading) => reading.reading[0] === reading.reading[0].toLowerCase(),
      );
      return common ?? candidates[0];
    }
  }

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/lib/cedict-html.test.js`
Expected: PASS — 8 tests.

Si falla con `Unknown file extension ".ts"`, el intérprete es anterior a Node 23. Usa la versión de `.nvmrc`.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/cedict-html.js scripts/lib/cedict-html.test.js
git commit -m "feat(scripts): parser de CC-CEDICT que conserva el emparejamiento lectura → significados"
```

---

## Task 4: El importador selecciona por lectura y deja de destruir el español

**Files:**
- Modify: `scripts/import-hsk-data.js`
- Modify: `vitest.config.js` (quitar la exclusión de la Tarea 2)
- Regenerate: `server/db/seeds/hsk{1,2,3}-words.json`

**Interfaces:**
- Consumes: `parseDictionaryEntry`, `selectReading` (Tarea 3); `normalizePinyin` (Tarea 1).
- Produces: filas de corpus con la forma `{ hanzi, traditional, pinyin, meaning_en, meaning_es, classifier, pos, frequency }`. Las consumen las Tareas 5, 6 y 7.

**Dos defectos se arreglan aquí, y el segundo es una mina.** El importador actual sobrescribe los JSON y **no escribe `meaning_es`**: ejecutarlo hoy borraría las 1010 glosas españolas del repositorio. La versión nueva lee el JSON existente y arrastra el español por `(hanzi, lectura normalizada)`.

- [ ] **Step 1: Write the failing test**

Añade al final de `scripts/corpus-contract.test.js`, dentro del `describe` existente:

```js
  it('resuelve las cinco colisiones de lectura con sentidos distintos', () => {
    const find = (hanzi, pinyin) =>
      rows.find((row) => row.hanzi === hanzi && row.pinyin === pinyin);

    expect(find('还', 'hái').meaning_en).toMatch(/still/);
    expect(find('还', 'huán').meaning_en).toMatch(/to (pay back|return)/);
    expect(find('地', 'de').meaning_en).toMatch(/particle/);
    expect(find('地', 'dì').meaning_en).toMatch(/earth/);
    expect(find('得', 'děi').meaning_en).toMatch(/to have to|must/);
    expect(find('长', 'zhǎng').meaning_en).toMatch(/grow|chief|elder/);
    expect(find('只', 'zhǐ').meaning_en).toMatch(/only|merely/);
  });

  it('guarda el clasificador en su propio campo', () => {
    const di = rows.find((row) => row.hanzi === '地' && row.pinyin === 'dì');

    expect(di.classifier).toBe('片');
  });

  it('guarda la forma tradicional cuando difiere de la simplificada', () => {
    const hai = rows.find((row) => row.hanzi === '还' && row.pinyin === 'hái');

    expect(hai.traditional).toBe('還');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/corpus-contract.test.js`
Expected: FAIL — los tres nuevos, más los dos de la Tarea 2 que siguen rojos.

- [ ] **Step 3: Write minimal implementation**

En `scripts/import-hsk-data.js`: **borra por completo** la función `extractMeanings` (desde el comentario `/** Extract the best English meanings...` hasta su llave de cierre, unas 100 líneas) y su bloque de documentación. Su heurística de puntuación es justo lo que este plan sustituye; dejarla sería dos verdades compitiendo.

Añade los imports arriba, junto a los existentes:

```js
import { parseDictionaryEntry, selectReading } from './lib/cedict-html.js';
import { normalizePinyin } from '../packages/domain/src/pinyin.ts';
```

Añade este ayudante justo antes del bucle `for (const level of [1, 2, 3])`:

```js
/**
 * Las glosas españolas se curan a mano y no vienen del fichero fuente. Al
 * regenerar hay que arrastrarlas, o cada importación las destruiría. La clave
 * es (hanzi, lectura normalizada) y no el índice de fila, porque el número y
 * el orden de las filas puede cambiar entre importaciones.
 */
function loadExistingSpanish(outPath) {
  if (!existsSync(outPath)) {
    return new Map();
  }

  const existing = new Map();
  for (const word of JSON.parse(readFileSync(outPath, 'utf-8'))) {
    if (word.meaning_es) {
      existing.set(`${word.hanzi}|${normalizePinyin(word.pinyin)}`, word.meaning_es);
    }
  }

  return existing;
}
```

Sustituye el cuerpo del bucle de líneas. El bloque que hoy empieza en `const words = [];` y termina en el `console.log` del nivel queda así:

```js
  const outPath = join(seedDir, `hsk${level}-words.json`);
  const spanish = loadExistingSpanish(outPath);

  const words = [];
  const unresolved = [];

  for (const line of lines) {
    const cols = line.split('\t');
    if (cols.length < 7) continue;

    const [simplified, , pinyinRaw, , , pos, freq, ...htmlParts] = cols;
    const html = htmlParts.join('\t'); // rejoin in case HTML had tabs
    const hanzi = simplified?.trim();
    if (!hanzi) continue;

    const pinyin = pinyinRaw?.trim() || '';
    const entry = parseDictionaryEntry(html);
    const sense = selectReading(entry, pinyin);

    if (!sense) {
      // Sin lectura resuelta no podemos afirmar qué sentido es esta fila.
      // Se registra en vez de inventar una glosa.
      unresolved.push(`${hanzi} ${pinyin}`);
      continue;
    }

    words.push({
      hanzi,
      traditional: entry.traditional && entry.traditional !== hanzi ? entry.traditional : null,
      pinyin,
      meaning_en: sense.meanings.slice(0, 5).join('; '),
      meaning_es: spanish.get(`${hanzi}|${normalizePinyin(pinyin)}`) ?? null,
      classifier: sense.classifiers.length > 0 ? sense.classifiers.join('、') : null,
      pos: mapPos(pos?.trim()),
      frequency: parseInt(freq, 10) || 0,
    });
  }

  writeFileSync(outPath, JSON.stringify(words, null, 2), 'utf-8');
  console.log(`HSK ${level}: ${words.length} words -> ${outPath}`);

  if (unresolved.length > 0) {
    console.warn(`  ${unresolved.length} filas sin lectura resuelta: ${unresolved.join(', ')}`);
  }
```

- [ ] **Step 4: Regenerar el corpus y verificar**

```bash
node scripts/import-hsk-data.js
```

Expected: tres líneas `HSK n: … words`, con 301, 203 y 506, y **ninguna** advertencia de filas sin resolver. Si aparece alguna, para y arregla `selectReading` antes de continuar: una glosa ausente es peor que una glosa mezclada, porque no falla de forma visible.

Comprueba que el español sobrevivió antes de mirar nada más:

```bash
node -e "const d=require('./server/db/seeds/hsk2-words.json');console.log('sin español:', d.filter(w=>!w.meaning_es).length)"
```

Expected: `sin español: 0`.

Vuelve a meter el contrato en el comando general. En `vitest.config.js`, deja `exclude` como estaba antes de la Tarea 2 y borra el comentario:

```js
    exclude: ['**/node_modules/**', 'apps/mobile/**'],
```

Run: `npm test`
Expected: los 5 pasos en PASS. Dentro de vitest, `scripts/corpus-contract.test.js` pasa sus 8 tests.

Dos tests seguirán rojos si algo se ha torcido, y significan cosas distintas: "misma glosa inglesa para dos lecturas" significa que la selección por lectura no se está aplicando; "clasificador incrustado" significa que `parseClassifiers` no reconoce algún formato de `CL:`.

- [ ] **Step 5: Commit**

```bash
git add scripts/import-hsk-data.js server/db/seeds/hsk1-words.json server/db/seeds/hsk2-words.json server/db/seeds/hsk3-words.json vitest.config.js
git commit -m "fix(corpus): seleccionar el sentido por lectura y preservar las glosas españolas al regenerar"
```

---

## Task 5: Glosas españolas por sentido

**Files:**
- Create: `server/db/seeds/sense-glosses-es.json`
- Modify: `scripts/import-hsk-data.js`
- Modify: `scripts/corpus-contract.test.js`

**Interfaces:**
- Consumes: el corpus regenerado de la Tarea 4.
- Produces: corpus donde `meaning_es` describe el mismo sentido que `meaning_en`.

La Tarea 4 arregló el inglés de las cinco colisiones, pero arrastró el español antiguo, que era idéntico en ambas filas. Además hay filas de una sola lectura donde inglés y español describen sentidos distintos: `过 guò` tiene `meaning_en` "to cross; to go over" y `meaning_es` "guo (experiencia pasada)". El fichero de glosas curadas es el único sitio del proyecto donde se escribe español a mano, y se aplica por `(hanzi, lectura)`.

- [ ] **Step 1: Write the failing test**

Añade al `describe` de `scripts/corpus-contract.test.js`:

```js
  it('nunca da la misma glosa española a dos lecturas distintas del mismo hanzi', () => {
    const offenders = [];

    for (const [hanzi, list] of groupByHanzi(rows)) {
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const a = list[i];
          const b = list[j];

          if (normalizePinyin(a.pinyin) === normalizePinyin(b.pinyin)) {
            continue;
          }

          if (a.meaning_es === b.meaning_es) {
            offenders.push(`${hanzi} ${a.pinyin}/${b.pinyin}: "${a.meaning_es}"`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('aplica todas las glosas curadas', () => {
    const curated = JSON.parse(
      readFileSync(join(seedDir, 'sense-glosses-es.json'), 'utf8'),
    );

    const missing = curated.filter((entry) => {
      const row = rows.find(
        (candidate) =>
          candidate.hanzi === entry.hanzi &&
          normalizePinyin(candidate.pinyin) === normalizePinyin(entry.pinyin),
      );
      return !row || row.meaning_es !== entry.meaning_es;
    });

    expect(missing).toEqual([]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/corpus-contract.test.js`
Expected: FAIL — "misma glosa española" lista las 5 colisiones; "glosas curadas" falla al no existir el fichero.

- [ ] **Step 3: Write minimal implementation**

Crea `server/db/seeds/sense-glosses-es.json`. Las diez primeras entradas resuelven las colisiones; las dos últimas alinean español con inglés en filas de lectura única donde hoy discrepan:

```json
[
  { "hanzi": "还", "pinyin": "hái", "meaning_es": "todavía; aún; además; también; incluso" },
  { "hanzi": "还", "pinyin": "huán", "meaning_es": "devolver; restituir; pagar (una deuda)" },
  { "hanzi": "只", "pinyin": "zhī", "meaning_es": "clasificador para animales y para objetos de un par" },
  { "hanzi": "只", "pinyin": "zhǐ", "meaning_es": "solo; solamente; únicamente" },
  { "hanzi": "地", "pinyin": "de", "meaning_es": "de (partícula que une un adverbio al verbo)" },
  { "hanzi": "地", "pinyin": "dì", "meaning_es": "tierra; suelo; terreno; lugar" },
  { "hanzi": "得", "pinyin": "de", "meaning_es": "de (partícula que une el verbo con su complemento)" },
  { "hanzi": "得", "pinyin": "děi", "meaning_es": "tener que; deber; necesitar" },
  { "hanzi": "长", "pinyin": "cháng", "meaning_es": "largo; longitud; duración" },
  { "hanzi": "长", "pinyin": "zhǎng", "meaning_es": "crecer; desarrollarse; mayor; jefe" },
  { "hanzi": "过", "pinyin": "guò", "meaning_es": "pasar; cruzar; atravesar; transcurrir; celebrar" },
  { "hanzi": "着", "pinyin": "zhe", "meaning_es": "zhe (partícula aspectual: acción en curso o estado resultante)" }
]
```

En `scripts/import-hsk-data.js`, carga el fichero una sola vez, antes del bucle de niveles:

```js
/**
 * Glosas españolas curadas por sentido. Se aplican después de arrastrar las
 * existentes, así que ganan sobre lo que hubiera en el JSON anterior: son la
 * corrección deliberada de una mezcla de sentidos.
 */
const curatedSpanish = new Map(
  JSON.parse(readFileSync(join(seedDir, 'sense-glosses-es.json'), 'utf-8')).map((entry) => [
    `${entry.hanzi}|${normalizePinyin(entry.pinyin)}`,
    entry.meaning_es,
  ]),
);
```

Y en la construcción de la fila, sustituye la línea de `meaning_es`:

```js
      meaning_es:
        curatedSpanish.get(`${hanzi}|${normalizePinyin(pinyin)}`) ??
        spanish.get(`${hanzi}|${normalizePinyin(pinyin)}`) ??
        null,
```

- [ ] **Step 4: Regenerar y verificar**

```bash
node scripts/import-hsk-data.js && npm test
```

Expected: los 5 pasos en PASS; `scripts/corpus-contract.test.js` con 10 tests en verde.

- [ ] **Step 5: Commit**

```bash
git add server/db/seeds/sense-glosses-es.json scripts/import-hsk-data.js scripts/corpus-contract.test.js server/db/seeds/hsk1-words.json server/db/seeds/hsk2-words.json server/db/seeds/hsk3-words.json
git commit -m "fix(corpus): glosas españolas por sentido para las lecturas que compartían traducción"
```

---

## Task 6: Esquema y semilla de Supabase

**Files:**
- Create: `supabase/migrations/2026090201_word_senses.sql`
- Modify: `scripts/build-supabase-seed.js`
- Modify: `scripts/build-supabase-seed.test.js` (ya existe, con un test de humo)
- Regenerate: `supabase/seed.sql`

**Interfaces:**
- Consumes: el corpus de las Tareas 4 y 5.
- Produces: columnas `words.traditional`, `words.classifier`, `words.pinyin_normalized` y `user_settings.support_language`. Las consumen las Tareas 7, 8 y 9.

`pinyin_normalized` se materializa como columna generada: es la clave por la que la desambiguación de lecturas del lector (Plan 8) tendrá que buscar, y calcularla en SQL evita que cliente y servidor normalicen distinto.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/2026090201_word_senses.sql
--
-- Una fila de `words` pasa a representar un sentido, no una forma escrita.
-- Hasta ahora 还 hái y 还 huán compartían glosa porque el importador elegía un
-- único bloque de diccionario por hanzi. Estas columnas guardan lo que ya venía
-- en la fuente y se estaba descartando.

alter table public.words
  add column if not exists traditional text,
  add column if not exists classifier text;

-- Normalizar en SQL, y no en cada cliente, evita que dos implementaciones de
-- "quitar el tono" diverjan. Se quitan las marcas de tono combinantes pero se
-- conserva la diéresis: ü forma parte de la sílaba, no del tono.
alter table public.words
  add column if not exists pinyin_normalized text
  generated always as (
    lower(
      regexp_replace(
        translate(
          normalize(pinyin, nfd),
          u&'\0300\0301\0304\030C',
          ''
        ),
        '[[:space:]''0-9-]',
        '',
        'g'
      )
    )
  ) stored;

create index if not exists idx_words_hanzi_reading
  on public.words(hanzi, pinyin_normalized);

-- El corpus lleva glosa española en las 1010 filas, pero la app muestra inglés
-- en todas las pantallas. El idioma de apoyo pasa a ser una preferencia real.
alter table public.user_settings
  add column if not exists support_language text not null default 'es'
  check (support_language in ('es', 'en'));
```

`pinyin_normalized` es una columna generada, y Postgres solo las acepta si la
expresión es inmutable. `normalize()` lo es desde Postgres 14. Si `supabase db push`
la rechaza con `generation expression is not immutable`, no la conviertas en
trigger ni la calcules en el cliente: sustituye esa parte de la migración por una
columna normal más un índice de expresión, que da el mismo resultado de búsqueda:

```sql
create index if not exists idx_words_hanzi_reading
  on public.words(hanzi, lower(translate(normalize(pinyin, nfd), u&'\0300\0301\0304\030C', '')));
```

y quita `pinyin_normalized` de la Tarea 7. Anota el cambio en el plan.

- [ ] **Step 2: Write the failing test**

`scripts/build-supabase-seed.js` exporta `buildSeedSql()`, así que se puede probar sin base de datos. `scripts/build-supabase-seed.test.js` ya existe con un test de humo; añade estos tres al `describe` que hay, y `const { sql, counts } = buildSeedSql();` justo debajo de su primera línea:

```js
  it('inserta las columnas de sentido', () => {
    expect(sql).toContain(
      'insert into public.words (hanzi, traditional, pinyin, meaning_en, meaning_es, classifier, hsk_level, pos, frequency)',
    );
  });

  it('emite las dos lecturas de 还 con glosas distintas', () => {
    const hai = sql.match(/\('还', '還', 'hái', '([^']*)'/);
    const huan = sql.match(/\('还', '還', 'huán', '([^']*)'/);

    expect(hai).not.toBeNull();
    expect(huan).not.toBeNull();
    expect(hai[1]).not.toBe(huan[1]);
  });

  it('lleva el corpus completo', () => {
    expect(counts.words).toBe(1010);
  });
```

Run: `npx vitest run scripts/build-supabase-seed.test.js`
Expected: FAIL — los dos primeros tests; la sentencia `insert` aún no tiene las columnas nuevas.

- [ ] **Step 3: Write minimal implementation**

En `scripts/build-supabase-seed.js`, sustituye `buildWordsRows` para que emita también las columnas nuevas:

```js
function buildWordsRows() {
  const rows = [];

  for (const level of [1, 2, 3]) {
    const words = readJson(`hsk${level}-words.json`);

    for (const word of words) {
      rows.push([
        sqlString(word.hanzi),
        sqlString(word.traditional ?? null),
        sqlString(word.pinyin),
        sqlString(word.meaning_en),
        sqlString(word.meaning_es ?? null),
        sqlString(word.classifier ?? null),
        sqlInteger(level),
        sqlString(word.pos ?? null),
        sqlInteger(word.frequency),
      ]);
    }
  }

  return rows;
}
```

Y en `buildSeedSql`, la llamada a `buildInsert` de `words`:

```js
    buildInsert(
      'words',
      [
        'hanzi',
        'traditional',
        'pinyin',
        'meaning_en',
        'meaning_es',
        'classifier',
        'hsk_level',
        'pos',
        'frequency',
      ],
      wordsRows,
      'on conflict (hanzi, hsk_level) do update set traditional = excluded.traditional, pinyin = excluded.pinyin, meaning_en = excluded.meaning_en, meaning_es = excluded.meaning_es, classifier = excluded.classifier, pos = excluded.pos, frequency = excluded.frequency',
    ),
```

- [ ] **Step 4: Regenerar y verificar**

```bash
node scripts/build-supabase-seed.js && npm test
```

Expected: `Generated .../supabase/seed.sql` con `{ words: 1010, ... }`, y los 5 pasos en PASS.

Aplicar la migración contra el proyecto enlazado requiere credenciales y es un paso manual del propietario del repositorio, no de esta tarea:

```bash
npm run supabase:push
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026090201_word_senses.sql supabase/seed.sql scripts/build-supabase-seed.js scripts/build-supabase-seed.test.js
git commit -m "feat(db): columnas de sentido en words e idioma de apoyo en user_settings"
```

---

## Task 7: La capa de datos resuelve la glosa por idioma

**Files:**
- Modify: `packages/data/src/types.ts`
- Modify: `packages/data/src/database.types.ts`
- Modify: `packages/data/src/repositories/words.ts`
- Modify: `packages/data/src/repositories/flashcards.ts`
- Modify: `packages/data/src/repositories/decks.ts`
- Create: `packages/data/src/gloss.ts`
- Test: `packages/data/src/gloss.test.ts`

**Interfaces:**
- Consumes: columnas de la Tarea 6.
- Produces:
  - `type SupportLanguage = 'es' | 'en'`
  - `resolveGloss(word: { meaning_es?: string | null; meaning_en?: string | null }, language: SupportLanguage): string`
  - `Word` gana `traditional: string | null` y `classifier: string | null`.

  Los consumen las Tareas 8 y 9.

`resolveGloss` cae al inglés cuando falta el español. No es una mitigación sino la regla correcta: el corpus completo tiene español hoy, pero el contenido generado en planes posteriores puede no tenerlo, y una tarjeta sin glosa es peor que una tarjeta en el idioma equivocado.

- [ ] **Step 1: Write the failing test**

```ts
// packages/data/src/gloss.test.ts
import { resolveGloss } from './gloss';

describe('resolveGloss', () => {
  const word = { meaning_en: 'to pay back; to return', meaning_es: 'devolver; restituir' };

  it('devuelve el español cuando el idioma de apoyo es español', () => {
    expect(resolveGloss(word, 'es')).toBe('devolver; restituir');
  });

  it('devuelve el inglés cuando el idioma de apoyo es inglés', () => {
    expect(resolveGloss(word, 'en')).toBe('to pay back; to return');
  });

  it('cae al inglés cuando falta el español', () => {
    expect(resolveGloss({ meaning_en: 'to return', meaning_es: null }, 'es')).toBe('to return');
  });

  it('cae al inglés cuando el español está en blanco', () => {
    expect(resolveGloss({ meaning_en: 'to return', meaning_es: '   ' }, 'es')).toBe('to return');
  });

  it('devuelve cadena vacía cuando no hay ninguna glosa', () => {
    expect(resolveGloss({}, 'es')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/data/src/gloss.test.ts`
Expected: FAIL — `Failed to resolve import "./gloss"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/data/src/gloss.ts
import type { SupportLanguage } from './types';

interface Glossed {
  meaning_en?: string | null;
  meaning_es?: string | null;
}

/**
 * Una tarjeta sin glosa no es utilizable, así que el idioma de apoyo elige
 * preferencia, no exclusividad: si falta el español se muestra el inglés.
 */
export function resolveGloss(word: Glossed, language: SupportLanguage): string {
  const preferred = language === 'es' ? word.meaning_es : word.meaning_en;
  if (preferred && preferred.trim()) {
    return preferred.trim();
  }

  const fallback = language === 'es' ? word.meaning_en : word.meaning_es;
  return fallback?.trim() ?? '';
}
```

En `packages/data/src/types.ts`, junto a los otros alias del principio:

```ts
export type SupportLanguage = 'es' | 'en';
```

En la interfaz `Word` del mismo fichero, después de `hanzi`:

```ts
  traditional: string | null;
```

y después de `pos`:

```ts
  classifier: string | null;
```

En `UserSettings`, junto a `theme`:

```ts
  support_language: SupportLanguage;
```

Exporta lo nuevo desde `packages/data/src/index.ts`:

```ts
export { resolveGloss } from './gloss';
```

En `packages/data/src/database.types.ts`, dentro de `words`, añade a los tres bloques (`Row`, `Insert`, `Update`) las columnas nuevas, respetando la opcionalidad de cada bloque:

```ts
          traditional: string | null
          classifier: string | null
          pinyin_normalized: string | null
```

y en `user_settings`:

```ts
          support_language: string
```

Este fichero está generado por `npm run gen:types`, que necesita el proyecto enlazado. Editarlo a mano aquí es correcto: la migración es la fuente de verdad y la regeneración posterior producirá lo mismo.

Actualiza las cadenas `select` para traer las columnas nuevas. En `packages/data/src/repositories/words.ts`, las dos apariciones:

```ts
    .select('id, hanzi, traditional, pinyin, meaning_en, meaning_es, classifier, hsk_level, pos, frequency')
```

En `packages/data/src/repositories/flashcards.ts`, la constante de la línea 16:

```ts
  'id, user_id, word_id, ease_factor, interval_days, repetitions, next_review_at, last_reviewed_at, status, version, words:word_id(id, hanzi, traditional, pinyin, meaning_en, meaning_es, classifier, hsk_level, pos, frequency)';
```

y la de la línea 120:

```ts
        .select('id, hanzi, traditional, pinyin, meaning_en, meaning_es, classifier, hsk_level, pos, frequency')
```

En `packages/data/src/repositories/decks.ts`, línea 172:

```ts
      'word_id, words:word_id(id, hanzi, traditional, pinyin, meaning_en, meaning_es, classifier, hsk_level)'
```

y en el mapeo de la línea 182, junto a `meaning_en`:

```ts
      traditional: w?.traditional ?? null,
      classifier: w?.classifier ?? null,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: los 5 pasos en PASS. Si `typecheck @hanyu/data` falla por `Word` incompleto en algún fixture de test, añade `traditional: null` y `classifier: null` a ese fixture: el tipo es ahora más estricto a propósito.

- [ ] **Step 5: Commit**

```bash
git add packages/data/src
git commit -m "feat(data): exponer sentido, clasificador y glosa por idioma de apoyo"
```

---

## Task 8: Preferencia de idioma de apoyo

**Files:**
- Modify: `packages/data/src/repositories/settings.ts`
- Modify: `apps/mobile/src/screens/YouScreen.tsx`
- Test: `apps/mobile/src/screens/YouScreen.test.tsx`

**Interfaces:**
- Consumes: `SupportLanguage` (Tarea 7), columna `support_language` (Tarea 6).
- Produces: `settings.support_language` legible y escribible. Lo consume la Tarea 9.

- [ ] **Step 1: Write the failing test**

En `apps/mobile/src/screens/YouScreen.test.tsx`, primero añade `support_language: 'es'` al objeto `settings` declarado encima del `describe`; si no, `normalizeSettings` lo repondrá y el test comprobará el valor por defecto en vez de la preferencia guardada.

Luego añade este test junto a los otros de persistencia de ajustes. Usa el ayudante `renderYou()` y el `screen` que el fichero ya tiene:

```tsx
  it('persists a support-language change', async () => {
    mockGetSettings.mockResolvedValue(settings);
    mockUpdateSettings.mockResolvedValue({ ...settings, support_language: 'en' });

    await renderYou();
    await fireEvent.press(screen.getByText('en'));

    expect(mockUpdateSettings).toHaveBeenCalledWith({ support_language: 'en' });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @hanyu/mobile -- YouScreen`
Expected: FAIL — no existe ningún elemento etiquetado `Support language`.

- [ ] **Step 3: Write minimal implementation**

En `packages/data/src/repositories/settings.ts`:

```ts
const ALLOWED_SUPPORT_LANGUAGES = new Set(['es', 'en']);
```

En `DEFAULT_SETTINGS`, junto a `theme`:

```ts
  support_language: 'es',
```

En `normalizeSettings`, junto a `theme`:

```ts
    support_language: ALLOWED_SUPPORT_LANGUAGES.has(row?.support_language)
      ? row.support_language
      : DEFAULT_SETTINGS.support_language,
```

En `sanitizeUpdates`, junto al bloque de `theme`:

```ts
  if (data.support_language !== undefined) {
    updates.support_language = ALLOWED_SUPPORT_LANGUAGES.has(data.support_language as string)
      ? data.support_language
      : DEFAULT_SETTINGS.support_language;
  }
```

Añade `support_language` a las tres cadenas `select` de este fichero (las de `readSettingsRow`, `ensureSettingsRow` y `updateSettings`), después de `theme`.

En `apps/mobile/src/screens/YouScreen.tsx`, junto a las constantes `ORDERS` y `LEVELS` del principio:

```tsx
const SUPPORT_LANGUAGES = ['es', 'en'] as const;
```

Y en la primera sección de ajustes, encima de `NumberRow` de "Cards per day", reutilizando el `OptionRow` que ya existe en el fichero:

```tsx
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <OptionRow
              label="Support language"
              value={settings.support_language}
              options={SUPPORT_LANGUAGES}
              onChange={(support_language) => save({ support_language })}
              disabled={saving}
            />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: los 5 pasos en PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/repositories/settings.ts apps/mobile/src/screens/YouScreen.tsx apps/mobile/src/screens/YouScreen.test.tsx
git commit -m "feat(mobile): preferencia de idioma de apoyo en ajustes"
```

---

## Task 9: La app móvil muestra la glosa correcta

**Files:**
- Modify: `apps/mobile/src/ui/FlashCardView.tsx` (líneas 237, 288, 314)
- Modify: `apps/mobile/src/readings/WordSheet.tsx` (línea 57)
- Modify: `apps/mobile/src/screens/WordsScreen.tsx` (línea 179)
- Modify: `apps/mobile/src/screens/DeckDetailScreen.tsx` (líneas 18 y 181)
- Create: `apps/mobile/src/lib/useSupportLanguage.ts`
- Test: `apps/mobile/src/lib/useSupportLanguage.test.tsx`
- Test: `apps/mobile/src/readings/WordSheet.test.tsx`

**Interfaces:**
- Consumes: `resolveGloss`, `SupportLanguage` (Tarea 7); `settings.support_language` (Tarea 8).
- Produces: `useSupportLanguage(): SupportLanguage` — hook que lee la preferencia una vez y devuelve `'es'` mientras carga.

Cuatro pantallas leen `meaning_en` directamente. Con el corpus corregido eso ya no es solo "está en inglés": es mostrar la glosa de un sentido que puede no ser el que el usuario está estudiando.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/lib/useSupportLanguage.test.tsx
import { renderHook, waitFor } from '@testing-library/react-native';
import { useSupportLanguage } from './useSupportLanguage';
import { getData } from './data';

jest.mock('./data');

describe('useSupportLanguage', () => {
  it('empieza en español antes de que carguen los ajustes', async () => {
    (getData as jest.Mock).mockReturnValue({
      settings: { getSettings: jest.fn().mockResolvedValue({ support_language: 'en' }) },
    });

    const { result } = await renderHook(() => useSupportLanguage());

    expect(result.current).toBe('es');
  });

  it('adopta la preferencia guardada', async () => {
    (getData as jest.Mock).mockReturnValue({
      settings: { getSettings: jest.fn().mockResolvedValue({ support_language: 'en' }) },
    });

    const { result } = await renderHook(() => useSupportLanguage());

    await waitFor(() => expect(result.current).toBe('en'));
  });

  it('se queda en español si los ajustes no cargan', async () => {
    (getData as jest.Mock).mockReturnValue({
      settings: { getSettings: jest.fn().mockRejectedValue(new Error('offline')) },
    });

    const { result } = await renderHook(() => useSupportLanguage());

    await waitFor(() => expect(result.current).toBe('es'));
  });
});
```

`apps/mobile/src/readings/WordSheet.test.tsx` no existe todavía. Créalo entero. Fíjate en que el mock de `../lib/data` tiene que incluir `settings`, además de `flashcards`: `WordSheet` pasa a usar `useSupportLanguage`, que llama a `getData().settings.getSettings()`.

```tsx
// apps/mobile/src/readings/WordSheet.test.tsx
import { render, screen, waitFor } from '@testing-library/react-native';
import type { Word } from '@hanyu/data';
import { WordSheet } from './WordSheet';

const mockAddCard = jest.fn();
const mockGetSettings = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    flashcards: {
      addCard: (...args: unknown[]) => mockAddCard(...args),
    },
    settings: {
      getSettings: () => mockGetSettings(),
    },
  }),
}));

const huan: Word = {
  id: 1,
  hanzi: '还',
  traditional: '還',
  pinyin: 'huán',
  meaning_en: 'to pay back; to return',
  meaning_es: 'devolver; restituir',
  classifier: null,
  hsk_level: 3,
  pos: 'verb',
  frequency: 1,
  in_srs: false,
};

describe('WordSheet', () => {
  beforeEach(() => {
    mockAddCard.mockReset();
    mockGetSettings.mockReset();
  });

  it('muestra la glosa española cuando el idioma de apoyo es español', async () => {
    mockGetSettings.mockResolvedValue({ support_language: 'es' });

    render(<WordSheet word={huan} text="还" onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText('devolver; restituir')).toBeTruthy());
    expect(screen.queryByText('to pay back; to return')).toBeNull();
  });

  it('muestra la glosa inglesa cuando el idioma de apoyo es inglés', async () => {
    mockGetSettings.mockResolvedValue({ support_language: 'en' });

    render(<WordSheet word={huan} text="还" onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText('to pay back; to return')).toBeTruthy());
  });

  it('muestra la forma tradicional cuando difiere de la simplificada', async () => {
    mockGetSettings.mockResolvedValue({ support_language: 'es' });

    render(<WordSheet word={huan} text="还" onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText('繁 還')).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w @hanyu/mobile -- useSupportLanguage WordSheet`
Expected: FAIL — no existe `./useSupportLanguage`, y `WordSheet` sigue pintando el inglés.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/mobile/src/lib/useSupportLanguage.ts
import { useEffect, useState } from 'react';
import type { SupportLanguage } from '@hanyu/data';
import { getData } from './data';

/**
 * El español es el valor inicial además del valor por defecto: la alternativa
 * sería no pintar glosa hasta que cargasen los ajustes, y un parpadeo en cada
 * tarjeta es peor que mostrar el idioma que el usuario ya tiene configurado en
 * la inmensa mayoría de los casos.
 */
export function useSupportLanguage(): SupportLanguage {
  const [language, setLanguage] = useState<SupportLanguage>('es');

  useEffect(() => {
    let active = true;

    getData()
      .settings.getSettings()
      .then((settings: { support_language?: SupportLanguage }) => {
        if (active && settings?.support_language) {
          setLanguage(settings.support_language);
        }
      })
      .catch(() => {
        // Sin ajustes seguimos con el idioma por defecto; no es un error que
        // deba interrumpir una sesión de estudio.
      });

    return () => {
      active = false;
    };
  }, []);

  return language;
}
```

En `apps/mobile/src/readings/WordSheet.tsx`, añade los imports:

```tsx
import { resolveGloss, toUserMessage, type Word } from '@hanyu/data';
import { useSupportLanguage } from '../lib/useSupportLanguage';
```

dentro del componente, junto a `const { colors } = useTheme();`:

```tsx
  const supportLanguage = useSupportLanguage();
```

y sustituye la línea 57:

```tsx
          <Text style={[styles.meaning, { color: colors.textMuted }]}>
            {resolveGloss(word, supportLanguage)}
          </Text>
```

Aprovecha que la ficha ya tiene los datos nuevos y muestra la forma tradicional y el clasificador junto a las insignias existentes:

```tsx
          <View style={styles.badges}>
            <Badge label={`HSK ${word.hsk_level}`} />
            {word.pos ? <Badge label={word.pos} /> : null}
            {word.traditional ? <Badge label={`繁 ${word.traditional}`} /> : null}
            {word.classifier ? <Badge label={`量 ${word.classifier}`} /> : null}
          </View>
```

Aplica el mismo cambio de `meaning_en` a `resolveGloss(word, supportLanguage)` en:
- `apps/mobile/src/screens/WordsScreen.tsx` línea 179.
- `apps/mobile/src/screens/DeckDetailScreen.tsx` línea 181; añade además `meaning_es: string | null;`, `traditional: string | null;` y `classifier: string | null;` a la interfaz local de la línea 18.
- `apps/mobile/src/ui/FlashCardView.tsx` líneas 237, 288 y 314. Este componente recibe `card`, no `word`; `resolveGloss` acepta cualquier objeto con `meaning_en` y `meaning_es`, así que `resolveGloss(card, supportLanguage)` funciona sin cambiar su firma.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: los 5 pasos en PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): mostrar la glosa del sentido en el idioma de apoyo elegido"
```

---

## Criterio de salida del plan

1. `npm test` en verde: 5 pasos, y `scripts/corpus-contract.test.js` con sus 10 tests dentro de vitest.
2. Esta consulta sobre el corpus generado devuelve dos glosas distintas:
   ```bash
   node -e "const d=[...require('./server/db/seeds/hsk1-words.json').map(w=>({...w,l:1})),...require('./server/db/seeds/hsk3-words.json').map(w=>({...w,l:3}))];for(const w of d.filter(x=>x.hanzi==='还'))console.log('L'+w.l,w.pinyin,'|',w.meaning_en,'|',w.meaning_es)"
   ```
3. Con `support_language` en `es`, ninguna pantalla móvil muestra `meaning_en`:
   ```bash
   grep -rn "meaning_en" apps/mobile/src --include=*.tsx | grep -v "\.test\."
   ```
   Expected: sin resultados salvo declaraciones de tipo.

## Lo que este plan deja explícitamente sin resolver

- **Las 14 filas de `sense-review-queue.json`.** Comparten hanzi y lectura entre niveles, así que ninguna regla derivable del fichero fuente las distingue. Asignarles sentido necesita el sílabo oficial: es trabajo del Plan 1B, y hasta entonces siguen mostrando la misma glosa en ambos niveles. Está anotado, no tapado.
- **Un sentido por fila, no varios por lexema.** No se crea tabla `lexemes`. La desambiguación de lecturas del tokenizador (§6.12 de la auditoría) pertenece al Plan 8; `words.pinyin_normalized` y su índice quedan puestos para cuando llegue.
- **Colocaciones, frases de ejemplo y audio por sentido.** El diseño de nota completo de §5 de la auditoría llega con el contenido editorial del Plan 7.
