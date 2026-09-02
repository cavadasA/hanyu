# Plan 1B — Sílabo oficial 2025: sentidos, caracteres, gramática y cobertura

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el corpus deje de ser un fichero heredado sin procedencia y pase a ser un artefacto versionado, trazable hasta el sílabo oficial de noviembre de 2025, con sus caracteres y su gramática completos, y con una matriz de cobertura que responda qué porcentaje del examen está en la app.

**Architecture:** El sílabo HSK 3.0 revisión 2025-11 publica tres listas por nivel: palabras, caracteres y gramática. El repositorio ya consume una de ellas de forma indirecta —el mazo `Anki xiehanzi`, que es la lista de palabras enriquecida con pinyin, categoría, frecuencia y diccionario— pero ignora las otras dos y, sobre todo, ignora **el marcador de sentido**: la lista oficial escribe `点1`, `点2`, `会1`, `会2`, y el mazo Anki borra el dígito. Ése es el origen exacto de las catorce filas que el Plan 1A dejó en cuarentena. Este plan une la lista oficial con el mazo enriquecido, importa caracteres y gramática, y publica matrices de cobertura.

**Tech Stack:** Node 26 (`.nvmrc`), vitest, TypeScript en `packages/*`, JavaScript plano en `scripts/`, Supabase (Postgres).

## Global Constraints

- **Foco móvil, y la web está congelada.** `apps/web`, `server/app.js`, `server/routes` y `server/services` están fuera de `vitest.config.js`. Si un cambio los rompe, se dejan rotos. De `server/` solo vive `server/db`, porque ahí está el corpus.
- **`npm test` debe pasar al final de cada tarea.**
- **Node 26 según `.nvmrc`.** `scripts/` importa `.ts` de `packages/domain` apoyándose en el type stripping nativo.
- **Depende del Plan 1A.** Este plan asume `normalizePinyin`, `scripts/lib/cedict-html.js`, `scripts/corpus-contract.test.js` y las columnas `traditional` / `classifier` ya en su sitio.
- **Prohibido escribir mitigaciones.**
- **El corpus es un artefacto generado.** Nunca se editan a mano los JSON de `server/db/seeds/`.

## Procedencia de los datos

Esto es lo que la auditoría pedía cuando hablaba de "comparación reproducible contra el syllabus oficial", y hasta ahora no existía: el directorio `data/` está en `.gitignore` y no hay ningún registro de qué revisión produjo el corpus actual.

| Artefacto | Origen | Naturaleza |
|---|---|---|
| PDF del sílabo | `https://hsk.cn-bj.ufileos.com/3.0/新版HSK考试大纲（词汇、汉字、语法）.pdf` | **Oficial.** Verificado accesible: HTTP 200, `application/pdf`, 3 696 686 bytes. Es la fuente autorizada; el resto son transcripciones de este documento. |
| Listas de palabras, caracteres y gramática | [`krmanik/HSK-3.0`](https://github.com/krmanik/HSK-3.0), carpeta `New HSK (2025)` | Transcripción comunitaria por OCR del PDF anterior. Es la única forma legible por máquina de la revisión 2025. |
| Mazo enriquecido | mismo repositorio, `New HSK (2025)/Anki xiehanzi` | Las mismas palabras con pinyin, zhuyin, categoría gramatical, frecuencia y entrada de CC-CEDICT. Ya es la fuente del corpus actual. |
| Contraste independiente | [`ivankra/hsk30`](https://github.com/ivankra/hsk30), MIT | Lista limpiada y validada contra varias fuentes, con tradicional, categoría, variantes y clave CEDICT. **Ojo: sigue la norma de 2021**, cuyos niveles son distintos (500/772/973 frente a 300/204/507). Sirve para contrastar datos por lema, nunca para asignar nivel. |

**No se ha localizado ninguna fuente oficial legible por máquina.** El organismo publica un PDF y un sistema de consulta web; no hay API ni descarga estructurada. La transcripción comunitaria es lo mejor disponible, y por eso este plan invierte en verificarla: manifiesto con sumas de verificación, contraste contra una segunda transcripción independiente, y conteos comparados con los del PDF.

## Estado de partida verificado (2 de septiembre de 2026)

Medido, no supuesto:

- Lista oficial 2025 de palabras: **300 (HSK 1) / 204 (HSK 2) / 507 (HSK 3)**. El corpus del repositorio tiene 301 / 203 / 506.
- La diferencia no es de contenido sino de **marcador de sentido**. Faltan en el corpus, entre otras: `本1`, `点1`, `点2`, `和1`, `会1`, `会2`, `两1`, `别1`, `打1`, `等1`, `花1`, `花2`, `面1`, `站1`, `站2`, `过去1`, `过去2`, `才1`, `该1`, y las formas con parte opcional `没（有）`, `有（一）点儿`, `有时（候）`.
- Las catorce filas en cuarentena del Plan 1A se explican todas por ese marcador. Ejemplos comprobados: `点` aparece como `点1` (L1), `点2` (L2) y `点` (L3); `会` como `会1` (L1) y `会2` (L3); `站` como `站1` (L2) y `站2` (L3); `花1` y `花2` conviven **en el mismo nivel 2**.
- Lista oficial de caracteres: **246 / 125 / 284**. El repositorio no tiene ninguna.
- Gramática oficial: **173 líneas para HSK 2**, jerárquicas en cuatro niveles de anidamiento. El repositorio tiene **2 puntos de gramática HSK 2** en total.
- La gramática HSK 2 cubre todas las familias que la auditoría daba por ausentes: reduplicación verbal (`AA、A一A、A了A、ABAB`) y adjetival (`AA、AABB`), `得`/`地` como partículas estructurales, `过` y `着` como aspectuales, `比` en cuatro construcciones, complementos resultativo y direccional, `是……的`, `虽然……但是……`, `因为……所以……`, `一……就……`, la interrogativa de elección con `还是`, y las expresiones de cantidad aproximada.
- Los ítems de gramática llevan índice de sentido (`还2`, `从1`, `从2`, `跟1`, `跟2`, `因为1`, `因为2`, `呢4`, `吧2`), así que enlazan con sentidos léxicos concretos.

## File Structure

**Se crean:**
- `data/sources.json` — manifiesto versionado de fuentes con URL, revisión y SHA-256. **Se comitea**, a diferencia del resto de `data/`.
- `scripts/fetch-syllabus.js` — descarga las fuentes y verifica las sumas.
- `scripts/lib/official-terms.js` — parser de la notación oficial de términos (`点2`, `没（有）`).
- `scripts/lib/official-terms.test.js`
- `scripts/lib/official-grammar.js` — parser del esquema jerárquico de gramática.
- `scripts/lib/official-grammar.test.js`
- `scripts/import-syllabus.js` — importa caracteres y gramática a `server/db/seeds/`.
- `scripts/coverage-report.js` — matrices de cobertura.
- `scripts/coverage-report.test.js`
- `server/db/seeds/hsk-characters.json`
- `server/db/seeds/grammar-points.json` — se regenera por completo desde la fuente oficial.
- `supabase/migrations/2026090202_syllabus.sql`

**Se modifican:**
- `scripts/import-hsk-data.js` — une la lista oficial con el mazo enriquecido y asigna `sense_index`.
- `scripts/build-supabase-seed.js` — emite caracteres y la gramática nueva.
- `scripts/corpus-contract.test.js` — el contrato pasa a exigir conformidad con la lista oficial.
- `.gitignore` — deja de ignorar `data/sources.json`.
- `packages/data/src/types.ts`, `database.types.ts`, `repositories/grammar.ts`
- `PRODUCT.md`

**Se elimina:**
- `server/db/seeds/sense-review-queue.json` — la cuarentena del Plan 1A queda resuelta por la lista oficial. Su test en `corpus-contract.test.js` se sustituye por el de conformidad.

---

## Task 1: Manifiesto de fuentes con sumas de verificación

**Files:**
- Create: `data/sources.json`, `scripts/fetch-syllabus.js`
- Test: `scripts/fetch-syllabus.test.js`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `loadManifest(): Array<{ id, url, sha256, path }>` y `verifyLocalSources(): Array<{ id, status: 'ok' | 'missing' | 'mismatch' }>`. Los consume la Tarea 6.

Hoy `data/` entero está en `.gitignore` y no queda registro de qué revisión generó el corpus. Sin eso, "reproducible" es una palabra sin respaldo: cualquiera que clone el repositorio y ejecute el importador puede obtener otro corpus sin enterarse.

- [ ] **Step 1: Calcular las sumas reales**

Las sumas deben medirse, no inventarse. Ejecuta:

```bash
node --input-type=module -e "
const B='https://raw.githubusercontent.com/krmanik/HSK-3.0/main/New%20HSK%20(2025)/';
const files=[
 ['words-1','HSK%20Words/HSK_Level_1_words.txt'],
 ['words-2','HSK%20Words/HSK_Level_2_words.txt'],
 ['words-3','HSK%20Words/HSK_Level_3_words.txt'],
 ['hanzi-1','HSK%20Hanzi/HSK_Level_1_hanzi.txt'],
 ['hanzi-2','HSK%20Hanzi/HSK_Level_2_hanzi.txt'],
 ['hanzi-3','HSK%20Hanzi/HSK_Level_3_hanzi.txt'],
 ['grammar-1','HSK%20Grammar/HSK%201.txt'],
 ['grammar-2','HSK%20Grammar/HSK%202.txt'],
 ['grammar-3','HSK%20Grammar/HSK%203.txt'],
 ['xiehanzi-1','Anki%20xiehanzi/HSK_Level_1.txt'],
 ['xiehanzi-2','Anki%20xiehanzi/HSK_Level_2.txt'],
 ['xiehanzi-3','Anki%20xiehanzi/HSK_Level_3.txt'],
];
const { createHash } = await import('node:crypto');
for (const [id,p] of files) {
  const b = Buffer.from(await (await fetch(B+p)).arrayBuffer());
  console.log(id, createHash('sha256').update(b).digest('hex'), b.length);
}
"
```

Anota cada suma. Si alguna descarga falla, para: un manifiesto incompleto es peor que ninguno.

- [ ] **Step 2: Write the failing test**

```js
// scripts/fetch-syllabus.test.js
import { loadManifest, verifyLocalSources } from './fetch-syllabus.js';

describe('manifiesto del sílabo', () => {
  const manifest = loadManifest();

  it('declara las doce fuentes de los niveles 1 a 3', () => {
    expect(manifest).toHaveLength(12);
  });

  it('fija revisión y suma para cada fuente', () => {
    for (const entry of manifest) {
      expect(entry.id).toBeTruthy();
      expect(entry.url).toMatch(/^https:\/\//);
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.path).toMatch(/^data\//);
    }
  });

  it('las fuentes locales coinciden con el manifiesto', () => {
    const bad = verifyLocalSources().filter((entry) => entry.status !== 'ok');

    expect(bad).toEqual([]);
  });
});
```

Run: `npx vitest run scripts/fetch-syllabus.test.js`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Write minimal implementation**

`data/sources.json`, con las sumas del paso 1 (sustituye cada `<sha256 medido>`):

```json
{
  "syllabus": "HSK 3.0",
  "revision": "2025-11",
  "official_pdf": "https://hsk.cn-bj.ufileos.com/3.0/新版HSK考试大纲（词汇、汉字、语法）.pdf",
  "transcription_repo": "https://github.com/krmanik/HSK-3.0",
  "transcription_ref": "main",
  "note": "El organismo publica el sílabo solo como PDF y sistema de consulta web. Estas son transcripciones por OCR de ese PDF. Las sumas fijan exactamente qué bytes produjeron el corpus del repositorio.",
  "files": [
    { "id": "words-1", "path": "data/HSK_Level_1_words.txt", "url": "https://raw.githubusercontent.com/krmanik/HSK-3.0/main/New%20HSK%20(2025)/HSK%20Words/HSK_Level_1_words.txt", "sha256": "<sha256 medido>" },
    { "id": "words-2", "path": "data/HSK_Level_2_words.txt", "url": "https://raw.githubusercontent.com/krmanik/HSK-3.0/main/New%20HSK%20(2025)/HSK%20Words/HSK_Level_2_words.txt", "sha256": "<sha256 medido>" },
    { "id": "words-3", "path": "data/HSK_Level_3_words.txt", "url": "https://raw.githubusercontent.com/krmanik/HSK-3.0/main/New%20HSK%20(2025)/HSK%20Words/HSK_Level_3_words.txt", "sha256": "<sha256 medido>" },
    { "id": "hanzi-1", "path": "data/HSK_Level_1_hanzi.txt", "url": "https://raw.githubusercontent.com/krmanik/HSK-3.0/main/New%20HSK%20(2025)/HSK%20Hanzi/HSK_Level_1_hanzi.txt", "sha256": "<sha256 medido>" },
    { "id": "hanzi-2", "path": "data/HSK_Level_2_hanzi.txt", "url": "https://raw.githubusercontent.com/krmanik/HSK-3.0/main/New%20HSK%20(2025)/HSK%20Hanzi/HSK_Level_2_hanzi.txt", "sha256": "<sha256 medido>" },
    { "id": "hanzi-3", "path": "data/HSK_Level_3_hanzi.txt", "url": "https://raw.githubusercontent.com/krmanik/HSK-3.0/main/New%20HSK%20(2025)/HSK%20Hanzi/HSK_Level_3_hanzi.txt", "sha256": "<sha256 medido>" },
    { "id": "grammar-1", "path": "data/HSK_Grammar_1.txt", "url": "https://raw.githubusercontent.com/krmanik/HSK-3.0/main/New%20HSK%20(2025)/HSK%20Grammar/HSK%201.txt", "sha256": "<sha256 medido>" },
    { "id": "grammar-2", "path": "data/HSK_Grammar_2.txt", "url": "https://raw.githubusercontent.com/krmanik/HSK-3.0/main/New%20HSK%20(2025)/HSK%20Grammar/HSK%202.txt", "sha256": "<sha256 medido>" },
    { "id": "grammar-3", "path": "data/HSK_Grammar_3.txt", "url": "https://raw.githubusercontent.com/krmanik/HSK-3.0/main/New%20HSK%20(2025)/HSK%20Grammar/HSK%203.txt", "sha256": "<sha256 medido>" },
    { "id": "xiehanzi-1", "path": "data/HSK_Level_1.txt", "url": "https://raw.githubusercontent.com/krmanik/HSK-3.0/main/New%20HSK%20(2025)/Anki%20xiehanzi/HSK_Level_1.txt", "sha256": "<sha256 medido>" },
    { "id": "xiehanzi-2", "path": "data/HSK_Level_2.txt", "url": "https://raw.githubusercontent.com/krmanik/HSK-3.0/main/New%20HSK%20(2025)/Anki%20xiehanzi/HSK_Level_2.txt", "sha256": "<sha256 medido>" },
    { "id": "xiehanzi-3", "path": "data/HSK_Level_3.txt", "url": "https://raw.githubusercontent.com/krmanik/HSK-3.0/main/New%20HSK%20(2025)/Anki%20xiehanzi/HSK_Level_3.txt", "sha256": "<sha256 medido>" }
  ]
}
```

```js
// scripts/fetch-syllabus.js
//
// El corpus se genera desde ficheros que no están en el repositorio (data/ está
// en .gitignore por tamaño). Sin un manifiesto con sumas de verificación,
// "reproducible" no significa nada: dos clones pueden producir corpus
// distintos sin que nadie se entere. Este módulo fija qué bytes exactos son la
// fuente y permite comprobarlo en cualquier momento.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestPath = join(rootDir, 'data', 'sources.json');

export function loadManifest() {
  return JSON.parse(readFileSync(manifestPath, 'utf8')).files;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function verifyLocalSources() {
  return loadManifest().map((entry) => {
    const absolute = join(rootDir, entry.path);

    if (!existsSync(absolute)) {
      return { id: entry.id, status: 'missing' };
    }

    const actual = sha256(readFileSync(absolute));
    return {
      id: entry.id,
      status: actual === entry.sha256 ? 'ok' : 'mismatch',
      expected: entry.sha256,
      actual,
    };
  });
}

export async function fetchSources() {
  mkdirSync(join(rootDir, 'data'), { recursive: true });

  for (const entry of loadManifest()) {
    const response = await fetch(entry.url);
    if (!response.ok) {
      throw new Error(`${entry.id}: HTTP ${response.status} en ${entry.url}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const actual = sha256(buffer);

    if (actual !== entry.sha256) {
      // La fuente cambió respecto a la revisión fijada. Puede ser una
      // corrección del sílabo o una regresión del transcriptor: es una
      // decisión editorial, no algo que este script deba resolver solo.
      throw new Error(
        `${entry.id}: la suma no coincide.\n  esperada ${entry.sha256}\n  obtenida ${actual}\n` +
          'Revisa el cambio antes de actualizar data/sources.json.',
      );
    }

    writeFileSync(join(rootDir, entry.path), buffer);
    console.log(`${entry.id} -> ${entry.path} (${buffer.length} bytes)`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('fetch-syllabus.js')) {
  await fetchSources();
}
```

En `.gitignore`, sustituye la línea `/data/` por:

```
/data/*
!/data/sources.json
```

Añade el script a `package.json`:

```json
    "fetch-syllabus": "node scripts/fetch-syllabus.js",
```

- [ ] **Step 4: Descargar y verificar**

```bash
npm run fetch-syllabus && npm test
```

Expected: doce líneas de descarga y los 5 pasos en PASS.

- [ ] **Step 5: Commit**

```bash
git add data/sources.json scripts/fetch-syllabus.js scripts/fetch-syllabus.test.js .gitignore package.json
git commit -m "feat(corpus): manifiesto versionado del sílabo 2025 con sumas de verificación"
```

---

## Task 2: Parser de la notación oficial de términos

**Files:**
- Create: `scripts/lib/official-terms.js`
- Test: `scripts/lib/official-terms.test.js`

**Interfaces:**
- Consumes: `normalizePinyin` (Plan 1A).
- Produces: `parseOfficialTerm(raw: string): { form: string, sense_index: number | null, variants: string[] }` y `loadOfficialWords(level: 1|2|3): Array<ReturnType<typeof parseOfficialTerm>>`. Los consume la Tarea 3.

La lista oficial usa dos notaciones, ambas verificadas en los ficheros reales:

1. **Índice de sentido**: un dígito final distingue acepciones del mismo término. `点1` (HSK 1), `点2` (HSK 2) y `点` (HSK 3) son tres entradas distintas. `花1` y `花2` conviven en el mismo nivel 2. El dígito nunca forma parte del hanzi.
2. **Parte opcional entre paréntesis de anchura completa**: `没（有）`, `有（一）点儿`, `有时（候）`. Ambas formas son válidas; la larga es la canónica.

- [ ] **Step 1: Write the failing test**

```js
// scripts/lib/official-terms.test.js
import { parseOfficialTerm, loadOfficialWords } from './official-terms.js';

describe('parseOfficialTerm', () => {
  it('separa el índice de sentido del hanzi', () => {
    expect(parseOfficialTerm('点1')).toEqual({ form: '点', sense_index: 1, variants: ['点'] });
    expect(parseOfficialTerm('过去2')).toEqual({ form: '过去', sense_index: 2, variants: ['过去'] });
  });

  it('deja el índice a null cuando el término no lo lleva', () => {
    expect(parseOfficialTerm('爱情')).toEqual({ form: '爱情', sense_index: null, variants: ['爱情'] });
  });

  it('expande la parte opcional en dos variantes, con la larga como canónica', () => {
    expect(parseOfficialTerm('没（有）')).toEqual({
      form: '没有',
      sense_index: null,
      variants: ['没有', '没'],
    });
    expect(parseOfficialTerm('有（一）点儿')).toEqual({
      form: '有一点儿',
      sense_index: null,
      variants: ['有一点儿', '有点儿'],
    });
  });

  it('combina paréntesis e índice', () => {
    expect(parseOfficialTerm('有时（候）2')).toEqual({
      form: '有时候',
      sense_index: 2,
      variants: ['有时候', '有时'],
    });
  });

  it('no confunde un numeral chino con un índice', () => {
    expect(parseOfficialTerm('一')).toEqual({ form: '一', sense_index: null, variants: ['一'] });
  });
});

describe('loadOfficialWords', () => {
  it('lee los conteos oficiales de la revisión 2025', () => {
    expect(loadOfficialWords(1)).toHaveLength(300);
    expect(loadOfficialWords(2)).toHaveLength(204);
    expect(loadOfficialWords(3)).toHaveLength(507);
  });

  it('reconoce las tres acepciones de 点 repartidas por niveles', () => {
    const find = (level, form) =>
      loadOfficialWords(level).filter((term) => term.form === form);

    expect(find(1, '点').map((t) => t.sense_index)).toEqual([1]);
    expect(find(2, '点').map((t) => t.sense_index)).toEqual([2]);
    expect(find(3, '点').map((t) => t.sense_index)).toEqual([null]);
  });

  it('reconoce dos acepciones del mismo término dentro de un nivel', () => {
    const hua = loadOfficialWords(2).filter((term) => term.form === '花');

    expect(hua.map((term) => term.sense_index)).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/lib/official-terms.test.js`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/official-terms.js
//
// La lista oficial distingue acepciones con un dígito final —点1 en HSK 1,
// 点2 en HSK 2, 点 en HSK 3— y marca partes opcionales entre paréntesis de
// anchura completa: 没（有）, 有（一）点儿. El mazo Anki que alimenta el corpus
// borra ambas notaciones, y por eso el corpus acaba con filas duplicadas que
// parecen errores y en realidad son sentidos distintos.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const dataDir = join(rootDir, 'data');

const SENSE_SUFFIX = /([0-9])$/;
const OPTIONAL_PART = /（([^）]*)）/;

export function parseOfficialTerm(raw) {
  let text = String(raw).trim();
  let senseIndex = null;

  const sense = SENSE_SUFFIX.exec(text);
  if (sense) {
    senseIndex = Number(sense[1]);
    text = text.slice(0, -1);
  }

  const optional = OPTIONAL_PART.exec(text);
  if (!optional) {
    return { form: text, sense_index: senseIndex, variants: [text] };
  }

  // La forma larga es la canónica: es la que aparece en los diccionarios y la
  // que el usuario encontrará escrita en los textos.
  const long = text.replace(OPTIONAL_PART, optional[1]);
  const short = text.replace(OPTIONAL_PART, '');

  return { form: long, sense_index: senseIndex, variants: [long, short] };
}

export function loadOfficialWords(level) {
  const file = join(dataDir, `HSK_Level_${level}_words.txt`);

  return readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseOfficialTerm);
}

export function loadOfficialCharacters(level) {
  const file = join(dataDir, `HSK_Level_${level}_hanzi.txt`);

  return readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/lib/official-terms.test.js`
Expected: PASS — 9 tests.

Si "lee los conteos oficiales" falla, las fuentes locales no son las del manifiesto: ejecuta `npm run fetch-syllabus`.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/official-terms.js scripts/lib/official-terms.test.js
git commit -m "feat(corpus): parser de la notación oficial de sentidos y partes opcionales"
```

---

## Task 3: El corpus se alinea con la lista oficial

**Files:**
- Modify: `scripts/import-hsk-data.js`
- Modify: `scripts/corpus-contract.test.js`
- Delete: `server/db/seeds/sense-review-queue.json`
- Regenerate: `server/db/seeds/hsk{1,2,3}-words.json`

**Interfaces:**
- Consumes: `loadOfficialWords` (Tarea 2), `parseDictionaryEntry` / `selectReading` (Plan 1A).
- Produces: filas con `sense_index` y `variants`. Las consumen las Tareas 5 y 6.

El mazo `Anki xiehanzi` aporta pinyin, categoría, frecuencia y diccionario; la lista oficial aporta la identidad del término, incluido su sentido. Hasta ahora solo se usaba el primero. Aquí se unen: la lista oficial manda sobre qué entradas existen, y el mazo las enriquece.

- [ ] **Step 1: Write the failing test**

En `scripts/corpus-contract.test.js`, **sustituye** el test de cuarentena `'declara en la cola de revisión toda fila que repite lectura entre niveles'` por estos tres:

```js
  it('contiene exactamente los términos de la lista oficial', () => {
    const problems = [];

    for (const level of [1, 2, 3]) {
      const official = loadOfficialWords(level).map(
        (term) => `${term.form}#${term.sense_index ?? ''}`,
      );
      const mine = rows
        .filter((row) => row.hsk_level === level)
        .map((row) => `${row.hanzi}#${row.sense_index ?? ''}`);

      for (const term of official) {
        if (!mine.includes(term)) problems.push(`L${level} falta ${term}`);
      }
      for (const term of mine) {
        if (!official.includes(term)) problems.push(`L${level} sobra ${term}`);
      }
    }

    expect(problems).toEqual([]);
  });

  it('reparte las acepciones de 点 por su nivel oficial', () => {
    const dian = rows
      .filter((row) => row.hanzi === '点')
      .map((row) => `L${row.hsk_level}#${row.sense_index ?? ''}`)
      .sort();

    expect(dian).toEqual(['L1#1', 'L2#2', 'L3#']);
  });

  it('conserva las variantes de las formas con parte opcional', () => {
    const meiyou = rows.find((row) => row.hanzi === '没有');

    expect(meiyou.variants).toEqual(['没有', '没']);
  });
```

Añade el import arriba del fichero:

```js
import { loadOfficialWords } from './lib/official-terms.js';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/corpus-contract.test.js`
Expected: FAIL — los tres nuevos. "contiene exactamente los términos" listará una veintena de faltas y sobras.

- [ ] **Step 3: Write minimal implementation**

En `scripts/import-hsk-data.js`, añade el import:

```js
import { loadOfficialWords } from './lib/official-terms.js';
```

Sustituye la construcción de `words` por una que recorra la lista oficial y busque su enriquecimiento en el mazo, en vez de al revés:

```js
  // El mazo Anki se indexa por forma escrita, que es la única clave que
  // comparte con la lista oficial: el mazo ha perdido el índice de sentido.
  const enriched = new Map();
  for (const line of lines) {
    const cols = line.split('\t');
    if (cols.length < 7) continue;

    const [simplified, , pinyinRaw, , , pos, freq, ...htmlParts] = cols;
    const hanzi = simplified?.trim();
    if (!hanzi) continue;

    const list = enriched.get(hanzi) ?? [];
    list.push({
      pinyin: pinyinRaw?.trim() || '',
      pos: mapPos(pos?.trim()),
      frequency: parseInt(freq, 10) || 0,
      html: htmlParts.join('\t'),
    });
    enriched.set(hanzi, list);
  }

  const outPath = join(seedDir, `hsk${level}-words.json`);
  const spanish = loadExistingSpanish(outPath);

  const words = [];
  const unmatched = [];

  for (const term of loadOfficialWords(level)) {
    // Se prueban todas las variantes: el mazo puede listar la forma corta
    // (没) donde la lista oficial escribe la larga (没（有）).
    const candidates = term.variants
      .map((variant) => enriched.get(variant))
      .find((found) => found && found.length > 0);

    if (!candidates) {
      unmatched.push(`${term.form}${term.sense_index ?? ''}`);
      continue;
    }

    // Cuando el mazo trae varias filas para la misma forma escrita, el índice
    // de sentido oficial las ordena: el sentido n usa la fila n si existe.
    const source = candidates[Math.min((term.sense_index ?? 1) - 1, candidates.length - 1)];
    const entry = parseDictionaryEntry(source.html);
    const sense = selectReading(entry, source.pinyin);

    if (!sense) {
      unmatched.push(`${term.form} (${source.pinyin}: lectura sin resolver)`);
      continue;
    }

    const key = `${term.form}|${normalizePinyin(source.pinyin)}|${term.sense_index ?? ''}`;

    words.push({
      hanzi: term.form,
      sense_index: term.sense_index,
      variants: term.variants,
      traditional:
        entry.traditional && entry.traditional !== term.form ? entry.traditional : null,
      pinyin: source.pinyin,
      meaning_en: sense.meanings.slice(0, 5).join('; '),
      meaning_es: curatedSpanish.get(key) ?? spanish.get(key) ?? null,
      classifier: sense.classifiers.length > 0 ? sense.classifiers.join('、') : null,
      pos: source.pos,
      frequency: source.frequency,
    });
  }

  writeFileSync(outPath, JSON.stringify(words, null, 2), 'utf-8');
  console.log(`HSK ${level}: ${words.length} words -> ${outPath}`);

  if (unmatched.length > 0) {
    console.warn(`  ${unmatched.length} términos oficiales sin enriquecer: ${unmatched.join(', ')}`);
  }
```

La clave de las glosas curadas y arrastradas incorpora ahora el índice de sentido. Actualiza también `loadExistingSpanish` y el mapa `curatedSpanish` del Plan 1A para que usen `${hanzi}|${normalizePinyin(pinyin)}|${sense_index ?? ''}`, y añade `"sense_index"` a las entradas de `server/db/seeds/sense-glosses-es.json` que lo necesiten. Las doce entradas existentes son de términos sin índice, así que les corresponde `""`.

- [ ] **Step 4: Regenerar y verificar**

```bash
node scripts/import-hsk-data.js
```

Expected: `HSK 1: 300`, `HSK 2: 204`, `HSK 3: 507`, sin términos sin enriquecer. Si aparecen, míralos uno a uno: cada uno es un término del examen que la app no podrá enseñar.

```bash
rm server/db/seeds/sense-review-queue.json
npm test
```

Expected: los 5 pasos en PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/import-hsk-data.js scripts/corpus-contract.test.js server/db/seeds/ && git rm --cached server/db/seeds/sense-review-queue.json 2>/dev/null
git commit -m "fix(corpus): alinear el corpus con la lista oficial 2025 y asignar índice de sentido"
```

---

## Task 4: Lista oficial de caracteres

**Files:**
- Create: `server/db/seeds/hsk-characters.json`, `scripts/import-syllabus.js`
- Modify: `scripts/build-supabase-seed.js`, `supabase/migrations/2026090202_syllabus.sql`
- Test: `scripts/corpus-contract.test.js`

**Interfaces:**
- Consumes: `loadOfficialCharacters` (Tarea 2).
- Produces: `server/db/seeds/hsk-characters.json` con `{ hanzi, hsk_level }`. Lo consumen la Tarea 6 y el Plan 1C.

El sílabo evalúa caracteres además de palabras: 246 en HSK 1, 125 en HSK 2, 284 en HSK 3. El repositorio no tiene ninguno, así que hoy es imposible decir qué porcentaje de los caracteres del examen cubre la app.

- [ ] **Step 1: Write the failing test**

En `scripts/corpus-contract.test.js`:

```js
  it('importa la lista oficial de caracteres', () => {
    const characters = JSON.parse(
      readFileSync(join(seedDir, 'hsk-characters.json'), 'utf8'),
    );
    const perLevel = {};
    for (const entry of characters) {
      perLevel[entry.hsk_level] = (perLevel[entry.hsk_level] ?? 0) + 1;
    }

    expect(perLevel).toEqual({ 1: 246, 2: 125, 3: 284 });
  });

  it('cada carácter oficial es un único carácter', () => {
    const characters = JSON.parse(
      readFileSync(join(seedDir, 'hsk-characters.json'), 'utf8'),
    );
    const bad = characters.filter((entry) => [...entry.hanzi].length !== 1);

    expect(bad).toEqual([]);
  });
```

Run: `npx vitest run scripts/corpus-contract.test.js`
Expected: FAIL — no existe `hsk-characters.json`.

- [ ] **Step 2: Write minimal implementation**

```js
// scripts/import-syllabus.js
//
// Genera desde las fuentes oficiales las dos listas que el corpus no tenía:
// caracteres y gramática. Las palabras las genera import-hsk-data.js, que
// necesita además el mazo enriquecido.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOfficialCharacters } from './lib/official-terms.js';
import { loadOfficialGrammar } from './lib/official-grammar.js';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const seedDir = join(rootDir, 'server', 'db', 'seeds');

const characters = [];
for (const level of [1, 2, 3]) {
  for (const hanzi of loadOfficialCharacters(level)) {
    characters.push({ hanzi, hsk_level: level });
  }
}
writeFileSync(
  join(seedDir, 'hsk-characters.json'),
  JSON.stringify(characters, null, 2),
  'utf8',
);
console.log(`caracteres: ${characters.length} -> hsk-characters.json`);

const grammar = [];
for (const level of [1, 2, 3]) {
  grammar.push(...loadOfficialGrammar(level));
}
writeFileSync(
  join(seedDir, 'grammar-points.json'),
  JSON.stringify(grammar, null, 2),
  'utf8',
);
console.log(`gramática: ${grammar.length} -> grammar-points.json`);
```

Añade a `package.json`:

```json
    "import-syllabus": "node scripts/import-syllabus.js",
```

Esta tarea deja `loadOfficialGrammar` sin implementar a propósito; llega en la Tarea 5. Para cerrar ésta, ejecuta el script comentando temporalmente el bloque de gramática, o mejor: **haz las Tareas 4 y 5 seguidas y comitea al final de la 5**. Si prefieres cerrarlas por separado, escribe primero un `loadOfficialGrammar` que devuelva `[]` y sustitúyelo en la Tarea 5; el test de gramática de la Tarea 5 fallará hasta entonces, que es lo correcto.

- [ ] **Step 3: Migración y semilla**

```sql
-- supabase/migrations/2026090202_syllabus.sql
--
-- El sílabo HSK 3.0 evalúa vocabulario, caracteres y gramática. Hasta ahora la
-- base solo conocía lo primero, así que no había forma de responder qué
-- porcentaje del examen cubre la app.

create table if not exists public.hsk_characters (
  hanzi text primary key,
  hsk_level integer not null check (hsk_level between 1 and 3)
);

create index if not exists idx_hsk_characters_level on public.hsk_characters(hsk_level);

alter table public.hsk_characters enable row level security;

drop policy if exists hsk_characters_select_authenticated on public.hsk_characters;
create policy hsk_characters_select_authenticated on public.hsk_characters
for select using (auth.role() = 'authenticated');

-- El índice de sentido convierte una fila de `words` en una acepción concreta:
-- 点1 (HSK 1), 点2 (HSK 2) y 点 (HSK 3) son tres entradas del sílabo, no una
-- palabra repetida.
alter table public.words
  add column if not exists sense_index integer,
  add column if not exists variants text[];

-- La clave pasa de (hanzi, nivel) a (hanzi, nivel, sentido): 花1 y 花2 conviven
-- en el nivel 2.
alter table public.words drop constraint if exists words_hanzi_hsk_level_key;
drop index if exists idx_words_unique_entry;
create unique index if not exists idx_words_unique_sense
  on public.words(hanzi, hsk_level, coalesce(sense_index, 0));
```

En `scripts/build-supabase-seed.js`, añade el bloque de caracteres y las columnas nuevas de `words`, siguiendo el patrón de `buildWordsRows`:

```js
function buildCharacterRows() {
  return readJson('hsk-characters.json').map((entry) => [
    sqlString(entry.hanzi),
    sqlInteger(entry.hsk_level),
  ]);
}
```

y dentro de `buildSeedSql`, junto a los demás `buildInsert`:

```js
    buildInsert(
      'hsk_characters',
      ['hanzi', 'hsk_level'],
      buildCharacterRows(),
      'on conflict (hanzi) do update set hsk_level = excluded.hsk_level',
    ),
```

Añade `sense_index` y `variants` a las columnas de `words` en `buildWordsRows` y en su `buildInsert`, con `sqlInteger(word.sense_index)` y, para el array, una función nueva:

```js
function sqlTextArray(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return 'null';
  }

  return `array[${value.map(sqlString).join(', ')}]::text[]`;
}
```

y actualiza el `on conflict` de `words` a `on conflict (hanzi, hsk_level, coalesce(sense_index, 0))`.

- [ ] **Step 4: Verificar**

```bash
npm run import-syllabus && node scripts/build-supabase-seed.js && npm test
```

Expected: `caracteres: 655`, y los 5 pasos en PASS.

- [ ] **Step 5: Commit** (junto con la Tarea 5, si las has hecho seguidas)

---

## Task 5: Gramática oficial completa

**Files:**
- Create: `scripts/lib/official-grammar.js`, `scripts/lib/official-grammar.test.js`
- Regenerate: `server/db/seeds/grammar-points.json`
- Modify: `packages/data/src/types.ts`, `packages/data/src/repositories/grammar.ts`

**Interfaces:**
- Produces: `loadOfficialGrammar(level: 1|2|3): Array<{ code, hsk_level, group, category, detail, title, items, order_idx }>`. Lo consumen la Tarea 6 y el Plan 1C.

Éste es el mayor salto de contenido del plan: de **2 puntos de gramática HSK 2 a los 173 renglones del esquema oficial**. El fichero fuente es una jerarquía de cuatro niveles, con secciones numeradas y viñetas:

```text
2. 词类
  2.2 动词
    2.2.1 动词重叠
      - AA、A一A、A了A、ABAB
```

Algunas viñetas están vacías (`-` sin contenido): son epígrafes que el sílabo declara sin enumerar ítems. Se conservan como punto de gramática sin ítems, porque siguen siendo materia del examen.

- [ ] **Step 1: Write the failing test**

```js
// scripts/lib/official-grammar.test.js
import { parseGrammarOutline, loadOfficialGrammar } from './official-grammar.js';

const SAMPLE = `新版HSK考试大纲 · 语法 — HSK 2
========================================
1. 语素
  1.1 后缀
    - 面

2. 词类
  2.2 动词
    2.2.1 动词重叠
      - AA、A一A、A了A、ABAB
    2.2.2 能愿动词
      - 可能
  2.10 助词
    2.10.1 结构助词
      - 得、地

3. 短语
  3.2 功能类型
    3.2.1 名词性短语
      -
`;

describe('parseGrammarOutline', () => {
  const points = parseGrammarOutline(SAMPLE, 2);

  it('crea un punto por epígrafe con viñetas', () => {
    expect(points.map((p) => p.code)).toEqual([
      '1.1', '2.2.1', '2.2.2', '2.10.1', '3.2.1',
    ]);
  });

  it('conserva la jerarquía como grupo, categoría y detalle', () => {
    const reduplication = points.find((p) => p.code === '2.2.1');

    expect(reduplication.group).toBe('词类');
    expect(reduplication.category).toBe('动词');
    expect(reduplication.detail).toBe('动词重叠');
    expect(reduplication.items).toEqual(['AA、A一A、A了A、ABAB']);
  });

  it('usa el detalle como título y el nivel como dato', () => {
    const particles = points.find((p) => p.code === '2.10.1');

    expect(particles.title).toBe('结构助词');
    expect(particles.hsk_level).toBe(2);
    expect(particles.items).toEqual(['得、地']);
  });

  it('conserva los epígrafes sin ítems enumerados', () => {
    const empty = points.find((p) => p.code === '3.2.1');

    expect(empty.items).toEqual([]);
  });

  it('numera los puntos en el orden del documento', () => {
    expect(points.map((p) => p.order_idx)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('loadOfficialGrammar', () => {
  it('carga la gramática de los tres niveles', () => {
    expect(loadOfficialGrammar(1).length).toBeGreaterThan(20);
    expect(loadOfficialGrammar(2).length).toBeGreaterThan(40);
    expect(loadOfficialGrammar(3).length).toBeGreaterThan(40);
  });

  it('cubre las familias HSK 2 que el examen exige', () => {
    const hsk2 = loadOfficialGrammar(2);
    const text = JSON.stringify(hsk2);

    for (const family of [
      '动词重叠', '形容词重叠', '结构助词', '动态助词',
      '比较句', '“是……的”句', '选择复句', '转折复句',
      '因果复句', '紧缩复句', '结果补语', '趋向补语',
    ]) {
      expect(text).toContain(family);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/lib/official-grammar.test.js`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/official-grammar.js
//
// El esquema oficial de gramática es una jerarquía de cuatro niveles con
// secciones numeradas y viñetas. Se convierte en una lista plana de puntos
// —uno por epígrafe hoja— conservando la ruta completa, porque el grupo y la
// categoría son la clasificación que el propio sílabo usa para el examen.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const dataDir = join(rootDir, 'data');

const SECTION = /^(\s*)([0-9]+(?:\.[0-9]+)*)\.?\s+(.*)$/;
const BULLET = /^\s*-\s*(.*)$/;

export function parseGrammarOutline(text, level) {
  const points = [];
  const path = new Map(); // profundidad (nº de segmentos) -> título

  let current = null;

  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('=') || line.startsWith('新版HSK')) {
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      if (current && bullet[1].trim()) {
        current.items.push(bullet[1].trim());
      }
      continue;
    }

    const section = SECTION.exec(line);
    if (!section) {
      continue;
    }

    const code = section[2];
    const depth = code.split('.').length;
    const title = section[3].trim();

    path.set(depth, title);
    for (const key of [...path.keys()]) {
      if (key > depth) path.delete(key);
    }

    // Solo los epígrafes más profundos llevan ítems; los superiores son
    // clasificación. Se crea un punto por cada epígrafe y se descarta después
    // el que resulte ser padre de otro.
    current = {
      code,
      hsk_level: level,
      group: path.get(1) ?? null,
      category: depth >= 2 ? path.get(2) ?? null : null,
      detail: depth >= 3 ? path.get(3) ?? null : null,
      title,
      items: [],
      order_idx: 0,
    };
    points.push(current);
  }

  // Un epígrafe que es prefijo de otro es clasificación, no punto de gramática.
  const codes = new Set(points.map((point) => point.code));
  const leaves = points.filter(
    (point) => ![...codes].some((code) => code !== point.code && code.startsWith(`${point.code}.`)),
  );

  return leaves.map((point, index) => ({ ...point, order_idx: index + 1 }));
}

export function loadOfficialGrammar(level) {
  const text = readFileSync(join(dataDir, `HSK_Grammar_${level}.txt`), 'utf8');
  return parseGrammarOutline(text, level);
}
```

Actualiza el tipo compartido en `packages/data/src/types.ts`:

```ts
export interface GrammarPoint {
  id: number;
  hsk_level: HskLevel;
  code: string;
  group: string | null;
  category: string | null;
  detail: string | null;
  title: string;
  pattern: string | null;
  explanation: string | null;
  items: string[];
  examples: Array<{ chinese: string; pinyin?: string; english?: string }>;
  order_idx?: number | null;
}
```

Y en `supabase/migrations/2026090202_syllabus.sql`, añade al final:

```sql
alter table public.grammar_points
  add column if not exists code text,
  add column if not exists "group" text,
  add column if not exists category text,
  add column if not exists detail text,
  add column if not exists items text[];

-- La clave pasa a ser (nivel, código del sílabo): el título se repite entre
-- niveles pero el código no.
drop index if exists idx_grammar_unique_entry;
create unique index if not exists idx_grammar_unique_code
  on public.grammar_points(hsk_level, code);
```

Actualiza `buildGrammarRows` en `scripts/build-supabase-seed.js` para emitir las columnas nuevas, y su `buildInsert` a `on conflict (hsk_level, code) do update set ...`. `explanation` y `examples` quedan a `null` y `[]`: el sílabo no los trae, y rellenarlos es contenido editorial del Plan 7.

Ajusta `packages/data/src/repositories/grammar.ts` para seleccionar las columnas nuevas.

- [ ] **Step 4: Verificar**

```bash
npm run import-syllabus && node scripts/build-supabase-seed.js && npm test
```

Expected: `gramática:` con un total muy por encima de 6, y los 5 pasos en PASS.

Comprueba el salto real en HSK 2:

```bash
node -e "const g=require('./server/db/seeds/grammar-points.json');console.log('HSK2:',g.filter(p=>p.hsk_level===2).length,'puntos')"
```

- [ ] **Step 5: Commit**

```bash
git add scripts/ server/db/seeds/ supabase/ packages/data/src package.json
git commit -m "feat(corpus): importar caracteres y gramática oficiales del sílabo 2025"
```

---

## Task 6: Matrices de cobertura

**Files:**
- Create: `scripts/coverage-report.js`, `scripts/coverage-report.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: corpus, caracteres y gramática de las Tareas 3 a 5; `verifyLocalSources` (Tarea 1).
- Produces: `buildCoverageReport(): { revision, sources, vocabulary, characters, grammar }`. Lo consume el Plan 9 (analítica).

Éste es el criterio de salida del Plan 1 completo según el maestro: *la app puede decir exactamente qué porcentaje del sílabo está enseñado*. Aquí se responde la primera mitad —qué hay en el corpus— y el Plan 9 añadirá la segunda —qué ha demostrado el usuario.

- [ ] **Step 1: Write the failing test**

```js
// scripts/coverage-report.test.js
import { buildCoverageReport } from './coverage-report.js';

describe('buildCoverageReport', () => {
  const report = buildCoverageReport();

  it('declara la revisión del sílabo y el estado de las fuentes', () => {
    expect(report.revision).toBe('2025-11');
    expect(report.sources.every((entry) => entry.status === 'ok')).toBe(true);
  });

  it('cubre el 100 % del vocabulario oficial de los niveles 1 a 3', () => {
    for (const level of [1, 2, 3]) {
      expect(report.vocabulary[level].covered).toBe(report.vocabulary[level].official);
    }
  });

  it('cubre el 100 % de los caracteres oficiales', () => {
    expect(report.characters[2]).toEqual({ official: 125, covered: 125, percent: 100 });
  });

  it('cuenta los puntos de gramática por nivel', () => {
    expect(report.grammar[2].covered).toBeGreaterThan(40);
  });

  it('cuenta cuántas entradas tienen glosa española', () => {
    expect(report.vocabulary[2].with_spanish).toBeGreaterThan(0);
  });
});
```

Run: `npx vitest run scripts/coverage-report.test.js`
Expected: FAIL — no existe el módulo.

- [ ] **Step 2: Write minimal implementation**

```js
// scripts/coverage-report.js
//
// Responde la pregunta que la auditoría dejó sin respuesta: qué porcentaje del
// sílabo HSK 3.0 está realmente en la app. Cubre solo la mitad de contenido;
// la mitad de aprendizaje —qué ha demostrado el usuario— llega con el Plan 9.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOfficialWords, loadOfficialCharacters } from './lib/official-terms.js';
import { loadOfficialGrammar } from './lib/official-grammar.js';
import { verifyLocalSources } from './fetch-syllabus.js';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const seedDir = join(rootDir, 'server', 'db', 'seeds');

const readSeed = (name) => JSON.parse(readFileSync(join(seedDir, name), 'utf8'));
const percent = (covered, total) => (total === 0 ? 0 : Math.round((covered / total) * 100));

export function buildCoverageReport() {
  const manifest = JSON.parse(readFileSync(join(rootDir, 'data', 'sources.json'), 'utf8'));
  const characters = readSeed('hsk-characters.json');
  const grammar = readSeed('grammar-points.json');

  const vocabulary = {};
  const charactersByLevel = {};
  const grammarByLevel = {};

  for (const level of [1, 2, 3]) {
    const corpus = readSeed(`hsk${level}-words.json`);
    const official = loadOfficialWords(level);
    const have = new Set(corpus.map((row) => `${row.hanzi}#${row.sense_index ?? ''}`));

    vocabulary[level] = {
      official: official.length,
      covered: official.filter((term) =>
        have.has(`${term.form}#${term.sense_index ?? ''}`),
      ).length,
      with_spanish: corpus.filter((row) => row.meaning_es).length,
      percent: percent(
        official.filter((term) => have.has(`${term.form}#${term.sense_index ?? ''}`)).length,
        official.length,
      ),
    };

    const officialChars = loadOfficialCharacters(level);
    const haveChars = new Set(
      characters.filter((entry) => entry.hsk_level === level).map((entry) => entry.hanzi),
    );
    const coveredChars = officialChars.filter((hanzi) => haveChars.has(hanzi)).length;
    charactersByLevel[level] = {
      official: officialChars.length,
      covered: coveredChars,
      percent: percent(coveredChars, officialChars.length),
    };

    const officialGrammar = loadOfficialGrammar(level);
    const coveredGrammar = grammar.filter((point) => point.hsk_level === level).length;
    grammarByLevel[level] = {
      official: officialGrammar.length,
      covered: coveredGrammar,
      percent: percent(coveredGrammar, officialGrammar.length),
    };
  }

  return {
    revision: manifest.revision,
    sources: verifyLocalSources(),
    vocabulary,
    characters: charactersByLevel,
    grammar: grammarByLevel,
  };
}

if (process.argv[1] && process.argv[1].endsWith('coverage-report.js')) {
  const report = buildCoverageReport();
  console.log(`Sílabo HSK 3.0, revisión ${report.revision}`);

  const bad = report.sources.filter((entry) => entry.status !== 'ok');
  console.log(
    bad.length === 0
      ? 'Fuentes: las 12 coinciden con el manifiesto.'
      : `Fuentes: ${bad.length} con problemas -> ${bad.map((e) => `${e.id}:${e.status}`).join(', ')}`,
  );

  for (const level of [1, 2, 3]) {
    const v = report.vocabulary[level];
    const c = report.characters[level];
    const g = report.grammar[level];
    console.log(
      `HSK ${level}: vocabulario ${v.covered}/${v.official} (${v.percent} %), ` +
        `español ${v.with_spanish}/${v.covered}, ` +
        `caracteres ${c.covered}/${c.official} (${c.percent} %), ` +
        `gramática ${g.covered}/${g.official} (${g.percent} %)`,
    );
  }
}
```

Añade a `package.json`:

```json
    "coverage": "node scripts/coverage-report.js",
```

- [ ] **Step 3: Verificar**

```bash
npm run coverage && npm test
```

Expected: tres líneas con el 100 % en vocabulario, caracteres y gramática, y los 5 pasos en PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/coverage-report.js scripts/coverage-report.test.js package.json
git commit -m "feat(corpus): matriz de cobertura del sílabo por vocabulario, caracteres y gramática"
```

---

## Task 7: Ámbito y perfil de producto

**Files:**
- Modify: `PRODUCT.md`

**Interfaces:** ninguna. Es la corrección del documento que orienta las decisiones de producto.

`PRODUCT.md` declara que el usuario ya completó HSK 2 y que HSK 2 es "consolidación". El objetivo real es preparar el examen HSK 2 3.0. Esa diferencia explica varias decisiones que la auditoría señaló: mazo de consolidación, ausencia de lecciones progresivas y poca enseñanza explícita.

- [ ] **Step 1: Reescribir las secciones afectadas**

Sustituye `## Audience` y `## Current Learning Model` por:

```markdown
## Audience

Hanyu is for a single self-directed Mandarin learner **preparing for the HSK 2
exam under the HSK 3.0 standard, 2025-11 revision**. It should be built so it
can later become a paid learning product for similar independent learners.

Consolidation is a state the learner reaches for a given item, established by
evidence, not an assumption the product makes about the whole level.

## Current Learning Model

- HSK 1 is prerequisite material. What the learner already demonstrates is
  suspended rather than drilled.
- HSK 2 is the target: 204 words, 125 characters and the full official grammar
  outline for the level.
- HSK 3 is preview material, shown lightly and clearly.

The syllabus of record is the HSK 3.0 revision of November 2025. Its exact
sources and checksums live in `data/sources.json`; `npm run coverage` reports
how much of it the app currently carries.
```

- [ ] **Step 2: Verificar y commitear**

```bash
npm test
git add PRODUCT.md
git commit -m "docs: el objetivo es preparar HSK 2 3.0, no consolidar un HSK 2 ya aprobado"
```

---

## Criterio de salida del plan

1. `npm test` en verde.
2. `npm run coverage` informa 100 % de vocabulario, caracteres y gramática para los niveles 1 a 3, con las doce fuentes coincidiendo con el manifiesto.
3. La gramática HSK 2 pasa de 2 puntos a más de 40, incluidas todas las familias que la auditoría daba por ausentes.
4. `server/db/seeds/sense-review-queue.json` ya no existe: las catorce filas quedaron resueltas por el índice de sentido oficial.
5. Cualquiera puede reproducir el corpus desde cero con `npm run fetch-syllabus && npm run import-hsk && npm run import-syllabus`.

## Lo que este plan deja explícitamente sin resolver

- **Glosa española del vocabulario nuevo.** El corpus pasa de 1010 a 1011 entradas con índice de sentido, pero las glosas curadas cubren solo lo que ya había. `resolveGloss` cae al inglés donde falte, y el informe de cobertura cuenta cuántas entradas tienen español. Completarlo es contenido editorial, no importación.
- **Explicaciones y ejemplos de gramática.** El sílabo enumera los puntos; no los explica. `explanation` y `examples` quedan vacíos hasta el Plan 7.
- **Temas y tareas comunicativas.** El PDF oficial los describe en prosa, no en lista; extraerlos requiere trabajo editorial sobre el documento. La matriz de cobertura cubre por ahora vocabulario, caracteres y gramática.
- **Niveles 4 a 9.** Fuera del alcance del producto.
