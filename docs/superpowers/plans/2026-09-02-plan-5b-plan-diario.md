# Plan 5B — El plan diario explicable: unidades, ruta y tres modos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la app deje de proponer «lo que toca» sin saber por qué, y pase a tener una ruta curricular, una unidad activa, y una razón que se pueda leer detrás de cada propuesta.

**Architecture:** El Plan 5A resolvió *cuántas* tarjetas y *cuáles* por cupo y frecuencia. Falta lo otro: qué se está aprendiendo ahora mismo y por qué eso y no otra cosa. Este plan deriva unidades del propio sílabo —cada punto de gramática enumera las palabras que introduce—, las ordena con los prerrequisitos que el Plan 1C ya extrajo, y convierte `getToday` en un planificador que devuelve propuestas con su razón. Los pasos del plan que dependen de contenido que todavía no existe se declaran ausentes en vez de fingirse.

**Tech Stack:** Node 26 (`.nvmrc`), Jest para `apps/mobile`, vitest para `packages/*`, TypeScript, Supabase (Postgres, RPC en PL/pgSQL).

## Global Constraints

- **Foco móvil, y la web está congelada.** `apps/web`, `server/app.js`, `server/routes` y `server/services` están fuera de `vitest.config.js`. Si un cambio los rompe, se dejan rotos.
- **`npm test` debe pasar al final de cada tarea.**
- **Depende del Plan 5A** (los cuatro cupos, `build_review_queue`, `create_study_plan`) y del **1C** (`grammar_prerequisite`, `content_item`, `content_teaches`, `exercise_template`).
- **Prohibido escribir mitigaciones**, y aquí en particular: prohibido rellenar un paso del plan con contenido de relleno para que la pantalla no se vea vacía. Un hueco declarado es información; un hueco tapado es una mentira.
- **Nada de este plan inventa contenido.** Las unidades se derivan del sílabo, no se escriben.

## Estado de partida verificado (2 de septiembre de 2026)

Medido con los Planes 1A, 1B, 1C, 2, 3 y 4A ejecutados, y el 5A escrito:

- **Los items de gramática del sílabo enumeran palabras del corpus.** De los 120 fragmentos que aparecen en los 75 items de HSK 2, **63 son palabras exactas del corpus** (53 %). Comprobado: `离合词 → 帮忙, 游泳, 跳舞, 跑步`; `疑问代词 → 为什么`; `指示代词 → 那么, 那样`; `人称代词 → 自己`; `方位名词 → 左, 右`. Esto es lo que permite derivar unidades sin escribirlas.
- El 47 % restante son patrones (`AA、A一A、A了A、ABAB`), prosa descriptiva, o palabras con notación de sentido (`还2`). No casan con una palabra y no deben forzarse.
- **`grammar_prerequisite` tiene 13 filas** derivadas de las etapas numeradas del sílabo. Ejemplos: `6.3.1` de HSK 2 requiere `5.3.1` de HSK 1; `5.3.5` de HSK 3 requiere `5.4.4` de HSK 2.
- **165 puntos de gramática**, 59 de ellos de HSK 2.
- **No hay contenido que rankear.** `supabase/seed.sql` no tiene ni una sentencia de `generated_readings`. Los ejercicios son 30 semillas, 10 por nivel. `content_item` y `content_teaches` existen desde el 1C y están **vacías**.
- `getToday` devuelve bloques con metas fijas (`exercises.target: 5`, `reading.target: 1`) y ninguna razón.

## Qué se puede planificar hoy y qué no

Ésta es la parte incómoda y conviene tenerla delante antes de leer las tareas. El orden de decisión que pide la auditoría tiene seis pasos, y solo tres tienen material:

| Paso del plan diario | ¿Hay material? |
|---|---|
| 1. Repasos vencidos con más riesgo | **Sí.** `build_review_queue` del Plan 5A. |
| 2. Reaprendizaje de errores recientes | **Sí.** Los pasos de reaprendizaje de FSRS y `learning_event`. |
| 3. Elementos nuevos de la unidad activa | **Sí**, con las unidades de este plan. |
| 4. Una lectura de alta comprensibilidad | **No.** Cero lecturas en el catálogo. |
| 5. Ejercicios sobre los errores de esa lectura | **No.** Depende del paso 4. |
| 6. Práctica de formato de examen | **No.** Los formatos oficiales son el Plan 6. |

Así que este plan construye el planificador entero y **enciende los tres pasos que tienen material**. Los otros tres devuelven un hueco explícito —«no hay lecturas todavía»— que la pantalla muestra como tal. Cuando el Plan 7 llene `content_item`, se encienden solos: el planificador ya los consulta.

La función de ranking sí se escribe entera y se prueba con fixtures, porque es lógica pura que no depende de que el catálogo esté lleno. Es la pieza que los planes de contenido enchufan, no especulación sobre ellos.

## File Structure

**Se crean:**
- `supabase/migrations/2026090208_units.sql`
- `scripts/lib/derive-units.js` — deriva unidades del sílabo.
- `scripts/lib/derive-units.test.js`
- `server/db/seeds/units.json`
- `packages/domain/src/planner/rank.ts` — la función de valor de contenido.
- `packages/domain/src/planner/rank.test.ts`
- `packages/domain/src/planner/plan.ts` — el orden de decisión y sus huecos.
- `packages/domain/src/planner/plan.test.ts`

**Se modifican:**
- `scripts/import-syllabus.js`, `scripts/build-supabase-seed.js`, `scripts/corpus-contract.test.js`
- `packages/data/src/repositories/today.ts`, `types.ts`, `factory.ts`
- `apps/mobile/src/screens/TodayScreen.tsx`, `CardsScreen.tsx`

---

## Task 1: Las unidades se derivan del sílabo

**Files:**
- Create: `scripts/lib/derive-units.js`, `derive-units.test.js`, `server/db/seeds/units.json`
- Modify: `scripts/import-syllabus.js`, `scripts/corpus-contract.test.js`

**Interfaces:**
- Produces: `deriveUnits(grammar, words): Unit[]`, con `interface Unit { code, hsk_level, title, group, category, word_ids, patterns }`. La consumen las Tareas 2 y 3.

Una unidad no se escribe: **ya está escrita en el sílabo**. Cada punto de gramática trae su título, su clasificación y la lista de palabras que introduce. Lo único que hace falta es cruzar esa lista con el corpus.

Los fragmentos que no casan con una palabra se conservan como `patterns` en vez de descartarse: `AA、A一A、A了A、ABAB` no es una palabra pero sí es lo que la unidad enseña.

- [ ] **Step 1: Write the failing test**

```js
// scripts/lib/derive-units.test.js
import { deriveUnits, splitItem } from './derive-units.js';

const words = [
  { id: 1, hanzi: '帮忙', hsk_level: 2 },
  { id: 2, hanzi: '游泳', hsk_level: 2 },
  { id: 3, hanzi: '跳舞', hsk_level: 2 },
  { id: 4, hanzi: '跑步', hsk_level: 2 },
  { id: 5, hanzi: '还', hsk_level: 1 },
];

const grammar = [
  {
    code: '2.2.3', hsk_level: 2, group: '词类', category: '动词',
    detail: '离合词', title: '离合词', items: ['帮忙、游泳、跳舞、跑步'],
  },
  {
    code: '2.2.1', hsk_level: 2, group: '词类', category: '动词',
    detail: '动词重叠', title: '动词重叠', items: ['动词重叠：AA、A一A、A了A、ABAB'],
  },
  {
    code: '2.7.3', hsk_level: 2, group: '词类', category: '副词',
    detail: '时间副词', title: '时间副词', items: ['还2、已经'],
  },
];

describe('splitItem', () => {
  it('separa una lista de palabras por el separador chino', () => {
    expect(splitItem('帮忙、游泳、跳舞、跑步')).toEqual(['帮忙', '游泳', '跳舞', '跑步']);
  });

  it('descarta el prefijo descriptivo antes de los dos puntos', () => {
    expect(splitItem('动词重叠：AA、A一A')).toEqual(['AA', 'A一A']);
  });

  it('quita el índice de sentido para poder casar con el corpus', () => {
    // El sílabo escribe 还2 para la segunda acepción; el corpus la guarda como
    // hanzi 还 con sense_index 2.
    expect(splitItem('还2、已经')).toEqual(['还', '已经']);
  });
});

describe('deriveUnits', () => {
  const units = deriveUnits(grammar, words);

  it('crea una unidad por punto de gramática', () => {
    expect(units.map((unit) => unit.code)).toEqual(['2.2.3', '2.2.1', '2.7.3']);
  });

  it('ancla las palabras que el punto enumera', () => {
    const separable = units.find((unit) => unit.code === '2.2.3');

    expect(separable.word_ids).toEqual([1, 2, 3, 4]);
  });

  it('conserva como patrón lo que no es una palabra', () => {
    // AA、A一A no está en el corpus y no debe forzarse a estarlo: es lo que la
    // unidad enseña, y perderlo dejaría la unidad sin contenido.
    const reduplication = units.find((unit) => unit.code === '2.2.1');

    expect(reduplication.word_ids).toEqual([]);
    expect(reduplication.patterns).toEqual(['AA', 'A一A', 'A了A', 'ABAB']);
  });

  it('casa una palabra aunque el sílabo la escriba con índice de sentido', () => {
    const adverbs = units.find((unit) => unit.code === '2.7.3');

    expect(adverbs.word_ids).toEqual([5]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/lib/derive-units.test.js`
Expected: FAIL — no existe el módulo.

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/derive-units.js
//
// Una unidad de estudio no hay que escribirla: el sílabo ya la trae. Cada punto
// de gramática enumera las palabras que introduce, y cruzarlas con el corpus da
// la unidad completa. De los 120 fragmentos que aparecen en los items de HSK 2,
// 63 son palabras exactas del corpus; el resto son patrones y prosa, que se
// conservan aparte en lugar de forzarse a ser palabras.

// Los items vienen como "动词重叠：AA、A一A" o "帮忙、游泳". Lo anterior a los dos
// puntos es la descripción del propio punto, no contenido.
const DESCRIPTION_PREFIX = /^[^：:]*[：:]/;
const SENSE_SUFFIX = /[0-9]$/;

export function splitItem(item) {
  return String(item)
    .replace(DESCRIPTION_PREFIX, '')
    .split(/[、，,]/)
    .map((fragment) => fragment.trim())
    .filter(Boolean)
    .map((fragment) => fragment.replace(SENSE_SUFFIX, ''));
}

export function deriveUnits(grammar, words) {
  const byHanzi = new Map();
  for (const word of words) {
    if (!byHanzi.has(word.hanzi)) {
      byHanzi.set(word.hanzi, word.id);
    }
  }

  return grammar.map((point) => {
    const wordIds = [];
    const patterns = [];

    for (const item of point.items ?? []) {
      for (const fragment of splitItem(item)) {
        const id = byHanzi.get(fragment);
        if (id !== undefined) {
          if (!wordIds.includes(id)) wordIds.push(id);
        } else {
          patterns.push(fragment);
        }
      }
    }

    return {
      code: point.code,
      hsk_level: point.hsk_level,
      title: point.detail ?? point.title,
      group: point.group ?? null,
      category: point.category ?? null,
      word_ids: wordIds,
      patterns,
    };
  });
}
```

En `scripts/import-syllabus.js`, tras generar la gramática, escribe también las unidades:

```js
import { deriveUnits } from './lib/derive-units.js';

const corpus = [];
for (const level of [1, 2, 3]) {
  corpus.push(...JSON.parse(readFileSync(join(seedDir, `hsk${level}-words.json`), 'utf-8')));
}

// El corpus no lleva id: lo asigna Postgres al sembrarlo. Aquí se usa el índice
// estable dentro del fichero, y el generador de seed lo resuelve por hanzi.
const units = deriveUnits(grammar, corpus.map((word, index) => ({ ...word, id: index })));
writeFileSync(join(seedDir, 'units.json'), JSON.stringify(units, null, 2), 'utf8');
console.log(`unidades: ${units.length} -> units.json`);
```

Y en `scripts/corpus-contract.test.js`, una garantía sobre el resultado:

```js
  it('deriva una unidad por cada punto de gramática, con contenido', () => {
    const units = JSON.parse(readFileSync(join(seedDir, 'units.json'), 'utf8'));
    const grammar = JSON.parse(readFileSync(join(seedDir, 'grammar-points.json'), 'utf8'));

    expect(units).toHaveLength(grammar.length);

    // Una unidad sin palabras ni patrones no enseña nada y no debería existir.
    const empty = units.filter(
      (unit) => unit.word_ids.length === 0 && unit.patterns.length === 0,
    );
    expect(empty.map((unit) => `${unit.code} ${unit.title}`)).toEqual([]);
  });
```

Si ese último test falla, hay puntos del sílabo cuyos items están vacíos —los hay, el esquema tiene epígrafes sin enumerar— y la decisión correcta es excluirlos de las unidades, no inventarles contenido. Añade el filtro en `deriveUnits` y ajusta la primera aserción.

- [ ] **Step 4: Regenerar y verificar**

```bash
npm run import-syllabus && npm test
```

- [ ] **Step 5: Commit**

```bash
git add scripts/ server/db/seeds/units.json
git commit -m "feat(corpus): derivar unidades de estudio del esquema oficial de gramática"
```

---

## Task 2: La ruta curricular y la unidad activa

**Files:**
- Create: `supabase/migrations/2026090208_units.sql`
- Modify: `scripts/build-supabase-seed.js`
- Test: `scripts/build-supabase-seed.test.js`

**Interfaces:**
- Consumes: `units.json` (Tarea 1), `grammar_prerequisite` (Plan 1C).
- Produces: tablas `unit` y `unit_word`, y la RPC `active_unit()` que devuelve la unidad en curso. La consume la Tarea 3.

La unidad activa es la primera de la ruta que **no está completada** y cuyos **prerrequisitos sí lo están**. Con 13 prerrequisitos derivados, la ruta no es una lista plana: `6.3.1` de HSK 2 no debe proponerse antes que `5.3.1` de HSK 1.

Una unidad se considera completada cuando todas sus palabras tienen estabilidad suficiente en reconocimiento. No es una medida perfecta —reconocer no es producir— pero es la única evidencia que existe hoy, y decirlo es mejor que inventar un criterio más ambicioso sin datos que lo sostengan.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/2026090208_units.sql
--
-- Una unidad es un punto del sílabo más las palabras que enumera. No se
-- escribe a mano: se deriva, así que regenerar el sílabo regenera las unidades.

create table if not exists public.unit (
  code text not null,
  hsk_level integer not null check (hsk_level between 1 and 3),
  title text not null,
  "group" text,
  category text,
  patterns text[] not null default '{}',
  order_idx integer not null,
  primary key (hsk_level, code)
);

create table if not exists public.unit_word (
  hsk_level integer not null,
  code text not null,
  word_id bigint not null references public.words(id) on delete cascade,
  primary key (hsk_level, code, word_id),
  foreign key (hsk_level, code) references public.unit(hsk_level, code) on delete cascade
);

create index if not exists idx_unit_word_word on public.unit_word(word_id);

alter table public.unit enable row level security;
alter table public.unit_word enable row level security;

drop policy if exists unit_select_authenticated on public.unit;
create policy unit_select_authenticated on public.unit
for select using (auth.role() = 'authenticated');

drop policy if exists unit_word_select_authenticated on public.unit_word;
create policy unit_word_select_authenticated on public.unit_word
for select using (auth.role() = 'authenticated');

-- Umbral de estabilidad, en días, para dar una palabra por asentada dentro de
-- una unidad. Veintiuno es el punto en que el intervalo deja de medirse en días
-- sueltos; por debajo, llamar "completada" a la unidad sería optimismo.
create or replace function public.active_unit(p_stability_days numeric default 21)
returns table(
  hsk_level integer,
  code text,
  title text,
  total_words integer,
  settled_words integer
)
language sql
security definer
set search_path = public
as $$
  with progress as (
    select
      u.hsk_level,
      u.code,
      u.title,
      u.order_idx,
      count(uw.word_id)::integer as total_words,
      count(*) filter (
        where coalesce(s.stability, 0) >= p_stability_days or coalesce(s.suspended, false)
      )::integer as settled_words
    from public.unit u
    left join public.unit_word uw on uw.hsk_level = u.hsk_level and uw.code = u.code
    left join public.learner_skill_state s
      on s.user_id = auth.uid()
     and s.target_kind = 'word'
     and s.target_id = uw.word_id
     and s.skill = 'recognition'
    where u.hsk_level <= (
      select current_level from public.user_settings where user_id = auth.uid()
    )
    group by u.hsk_level, u.code, u.title, u.order_idx
  ),
  incomplete as (
    select * from progress
    where total_words > 0 and settled_words < total_words
  )
  select i.hsk_level, i.code, i.title, i.total_words, i.settled_words
  from incomplete i
  -- Una unidad no se propone si algún prerrequisito suyo sigue incompleto.
  where not exists (
    select 1
    from public.grammar_prerequisite gp
    join incomplete req
      on req.hsk_level = gp.requires_level and req.code = gp.requires_code
    where gp.hsk_level = i.hsk_level and gp.code = i.code
  )
  order by i.hsk_level, i.order_idx
  limit 1;
$$;

revoke all on function public.active_unit(numeric) from public;
grant execute on function public.active_unit(numeric) to authenticated;
```

- [ ] **Step 2: Write the failing test**

En `scripts/build-supabase-seed.test.js`:

```js
  it('siembra las unidades y sus palabras', () => {
    expect(sql).toContain('insert into public.unit (');
    expect(sql).toContain('insert into public.unit_word (');
  });

  it('resuelve las palabras de la unidad por hanzi, no por índice de fichero', () => {
    // units.json guarda índices dentro del fichero de corpus; la base usa los
    // identificadores que asigna Postgres. Resolver por hanzi es lo que hace
    // que sembrar dos veces no desalinee las unidades.
    expect(sql).toMatch(/insert into public\.unit_word[\s\S]*?select[\s\S]*?from public\.words/);
  });
```

- [ ] **Step 3: Write minimal implementation**

En `scripts/build-supabase-seed.js`, las unidades se emiten con inserciones normales y las palabras con un `select` contra `words`, para no depender de identificadores que el fichero no conoce:

```js
function buildUnitSql() {
  const units = readJson('units.json');
  const corpus = [];
  for (const level of [1, 2, 3]) {
    corpus.push(...readJson(`hsk${level}-words.json`));
  }

  const rows = units.map((unit, index) => [
    sqlString(unit.code),
    sqlInteger(unit.hsk_level),
    sqlString(unit.title),
    sqlString(unit.group),
    sqlString(unit.category),
    unit.patterns.length > 0
      ? `array[${unit.patterns.map(sqlString).join(', ')}]::text[]`
      : `'{}'::text[]`,
    sqlInteger(index + 1),
  ]);

  const memberships = [];
  for (const unit of units) {
    for (const wordIndex of unit.word_ids) {
      const word = corpus[wordIndex];
      if (!word) continue;
      memberships.push(
        `  (${sqlInteger(unit.hsk_level)}, ${sqlString(unit.code)}, ${sqlString(word.hanzi)}, ${sqlInteger(word.hsk_level ?? unit.hsk_level)})`,
      );
    }
  }

  const unitInsert = buildInsert(
    'unit',
    ['code', 'hsk_level', 'title', '"group"', 'category', 'patterns', 'order_idx'],
    rows,
    'on conflict (hsk_level, code) do update set title = excluded.title, patterns = excluded.patterns, order_idx = excluded.order_idx',
  );

  const wordInsert =
    memberships.length === 0
      ? '-- unit_word: no rows\n'
      : `insert into public.unit_word (hsk_level, code, word_id)
select m.unit_level, m.code, w.id
from (values
${memberships.join(',\n')}
) as m(unit_level, code, hanzi, word_level)
join public.words w on w.hanzi = m.hanzi and w.hsk_level = m.word_level
on conflict do nothing;
`;

  return `${unitInsert}\n${wordInsert}`;
}
```

Añádelo a la lista de bloques de `buildSeedSql` y a `counts`.

- [ ] **Step 4: Regenerar y verificar**

```bash
node scripts/build-supabase-seed.js && npm test
```

- [ ] **Step 5: Commit**

```bash
git add supabase/ scripts/
git commit -m "feat(db): unidades con ruta curricular y unidad activa por prerrequisitos"
```

---

## Task 3: La función de valor de contenido

**Files:**
- Create: `packages/domain/src/planner/rank.ts`, `rank.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces: `rankContent(item, learner): { value: number; reasons: RankReason[] }`.

La auditoría propone esta fórmula:

```text
valor = refuerzo_de_objetivos + ajuste_de_dificultad + cobertura_de_tema
      − repetición_reciente − exceso_de_vocabulario_desconocido
```

Se implementa entera y se prueba con fixtures. **`interés_del_usuario` queda fuera**: no hay ninguna señal de interés en el sistema —ni temas marcados, ni historial de elección— y un término que siempre vale cero solo sirve para aparentar que se tuvo en cuenta.

`rankContent` devuelve también las razones, porque son lo que la Tarea 5 muestra en pantalla. Calcular el valor y la explicación por separado permitiría que divergieran.

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/planner/rank.test.ts
import { rankContent } from './rank';

const learner = {
  target_word_ids: [1, 2, 3, 4, 5, 6],
  known_word_ids: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  recent_content_ids: [],
  covered_topics: [],
};

const item = {
  id: 'r1',
  topic: 'compras',
  word_ids: [1, 2, 3, 10, 11, 12, 13, 14, 15, 16],
};

describe('rankContent', () => {
  it('sube el valor cuando la lectura refuerza palabras objetivo', () => {
    const few = rankContent({ ...item, word_ids: [1, 10, 11, 12] }, learner);
    const many = rankContent(item, learner);

    expect(many.value).toBeGreaterThan(few.value);
  });

  it('penaliza el exceso de vocabulario desconocido', () => {
    // Una lectura con 70 % de palabras desconocidas no se lee, se descifra.
    const comprehensible = rankContent(item, learner);
    const opaque = rankContent(
      { ...item, word_ids: [90, 91, 92, 93, 94, 95, 96, 1, 2, 3] },
      learner,
    );

    expect(opaque.value).toBeLessThan(comprehensible.value);
  });

  it('penaliza lo visto hace poco', () => {
    const fresh = rankContent(item, learner);
    const repeated = rankContent(item, { ...learner, recent_content_ids: ['r1'] });

    expect(repeated.value).toBeLessThan(fresh.value);
  });

  it('premia un tema del sílabo que aún no se ha tocado', () => {
    const uncovered = rankContent(item, learner);
    const covered = rankContent(item, { ...learner, covered_topics: ['compras'] });

    expect(uncovered.value).toBeGreaterThan(covered.value);
  });

  it('explica cada término que movió el valor', () => {
    const { reasons } = rankContent(item, learner);

    expect(reasons.map((reason) => reason.kind)).toContain('reinforces_targets');
    expect(reasons.find((r) => r.kind === 'reinforces_targets')?.count).toBe(3);
  });

  it('no premia una lectura sin ninguna palabra', () => {
    expect(rankContent({ ...item, word_ids: [] }, learner).value).toBe(0);
  });
});
```

- [ ] **Step 2: Write minimal implementation**

```ts
// packages/domain/src/planner/rank.ts
//
// La función de valor de la auditoría, entera salvo un término. El
// "interés del usuario" queda fuera a propósito: no hay ninguna señal de
// interés en el sistema, y un sumando que siempre vale cero solo sirve para
// aparentar que se tuvo en cuenta.
//
// El valor y la explicación se calculan juntos porque en pantalla se muestran
// juntos, y calcularlos por separado permitiría que divergieran.

export type RankReasonKind =
  | 'reinforces_targets'
  | 'comprehensible'
  | 'too_many_unknown'
  | 'new_topic'
  | 'seen_recently';

export interface RankReason {
  kind: RankReasonKind;
  count?: number;
  ratio?: number;
}

export interface RankableContent {
  id: string;
  topic?: string | null;
  word_ids: number[];
}

export interface LearnerModel {
  /** Lo que se está aprendiendo ahora: la unidad activa. */
  target_word_ids: number[];
  /** Lo que ya se sostiene: no cuesta leerlo. */
  known_word_ids: number[];
  recent_content_ids: string[];
  covered_topics: string[];
}

/**
 * Rango de comprensibilidad. Por debajo de 0,92 la lectura se descifra en vez
 * de leerse; por encima de 0,98 no queda nada que aprender. Son las cifras que
 * la auditoría propone y las que usa la investigación de lectura graduada.
 */
const MIN_COMPREHENSIBLE = 0.92;
const MAX_COMPREHENSIBLE = 0.98;

export function rankContent(
  item: RankableContent,
  learner: LearnerModel,
): { value: number; reasons: RankReason[] } {
  if (item.word_ids.length === 0) {
    return { value: 0, reasons: [] };
  }

  const targets = new Set(learner.target_word_ids);
  const known = new Set(learner.known_word_ids);
  const reasons: RankReason[] = [];
  let value = 0;

  const reinforced = item.word_ids.filter((id) => targets.has(id)).length;
  if (reinforced > 0) {
    value += reinforced * 2;
    reasons.push({ kind: 'reinforces_targets', count: reinforced });
  }

  const comprehensible =
    item.word_ids.filter((id) => known.has(id) || targets.has(id)).length / item.word_ids.length;

  if (comprehensible >= MIN_COMPREHENSIBLE && comprehensible <= MAX_COMPREHENSIBLE) {
    value += 10;
    reasons.push({ kind: 'comprehensible', ratio: comprehensible });
  } else if (comprehensible < MIN_COMPREHENSIBLE) {
    value -= (MIN_COMPREHENSIBLE - comprehensible) * 40;
    reasons.push({ kind: 'too_many_unknown', ratio: comprehensible });
  }

  if (item.topic && !learner.covered_topics.includes(item.topic)) {
    value += 3;
    reasons.push({ kind: 'new_topic' });
  }

  if (learner.recent_content_ids.includes(item.id)) {
    value -= 8;
    reasons.push({ kind: 'seen_recently' });
  }

  return { value, reasons };
}
```

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add packages/domain
git commit -m "feat(domain): función de valor de contenido con sus razones"
```

---

## Task 4: El planificador diario, con los huecos declarados

**Files:**
- Create: `packages/domain/src/planner/plan.ts`, `plan.test.ts`
- Modify: `packages/domain/src/index.ts`, `packages/data/src/repositories/today.ts`, `types.ts`

**Interfaces:**
- Consumes: `rankContent` (Tarea 3), `active_unit()` (Tarea 2), `build_review_queue` (Plan 5A).
- Produces: `buildDailyPlan(input): DailyPlan`, con `interface PlanStep { kind, status: 'ready' | 'unavailable', reason, payload }`.

El orden de decisión completo, con los tres pasos que hoy no tienen material devolviendo `unavailable` y su motivo. Eso es lo contrario de rellenar: la pantalla podrá decir «todavía no hay lecturas» en vez de mostrar un bloque vacío o, peor, contenido de relleno.

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/planner/plan.test.ts
import { buildDailyPlan } from './plan';

const base = {
  due_reviews: 12,
  relearning: 3,
  active_unit: { code: '2.2.3', title: '离合词', total_words: 4, settled_words: 1 },
  new_allowance: 10,
  readings: [],
  exercises: [],
  exam_date: null,
};

describe('buildDailyPlan', () => {
  it('pone los repasos vencidos antes que nada', () => {
    expect(buildDailyPlan(base).steps[0].kind).toBe('reviews');
  });

  it('pone el reaprendizaje antes que las palabras nuevas', () => {
    const kinds = buildDailyPlan(base).steps.map((step) => step.kind);

    expect(kinds.indexOf('relearning')).toBeLessThan(kinds.indexOf('new_items'));
  });

  it('declara la lectura como no disponible en vez de omitirla', () => {
    // Omitir el paso escondería que falta contenido; rellenarlo mentiría.
    const reading = buildDailyPlan(base).steps.find((step) => step.kind === 'reading');

    expect(reading?.status).toBe('unavailable');
    expect(reading?.reason).toBe('no_content');
  });

  it('enciende la lectura en cuanto hay uno que proponer', () => {
    const plan = buildDailyPlan({
      ...base,
      readings: [{ id: 'r1', topic: 'compras', word_ids: [1, 2, 3] }],
      learner: { target_word_ids: [1, 2, 3], known_word_ids: [], recent_content_ids: [], covered_topics: [] },
    });
    const reading = plan.steps.find((step) => step.kind === 'reading');

    expect(reading?.status).toBe('ready');
    expect(reading?.payload?.id).toBe('r1');
  });

  it('no propone la práctica de examen sin fecha objetivo', () => {
    const exam = buildDailyPlan(base).steps.find((step) => step.kind === 'exam');

    expect(exam?.status).toBe('unavailable');
    expect(exam?.reason).toBe('no_exam_date');
  });

  it('omite las palabras nuevas cuando el cupo diario está agotado', () => {
    const plan = buildDailyPlan({ ...base, new_allowance: 0 });
    const newItems = plan.steps.find((step) => step.kind === 'new_items');

    expect(newItems?.status).toBe('unavailable');
    expect(newItems?.reason).toBe('daily_limit_reached');
  });

  it('lleva la unidad activa en el paso de elementos nuevos', () => {
    const newItems = buildDailyPlan(base).steps.find((step) => step.kind === 'new_items');

    expect(newItems?.payload?.unit_title).toBe('离合词');
  });
});
```

- [ ] **Step 2: Write minimal implementation**

```ts
// packages/domain/src/planner/plan.ts
//
// El orden de decisión de la auditoría, con los pasos que todavía no tienen
// material devolviendo `unavailable` y su motivo. Declarar el hueco es
// información; taparlo con contenido de relleno sería una mentira, y omitir el
// paso escondería que falta trabajo por hacer.
import { rankContent, type LearnerModel, type RankableContent, type RankReason } from './rank';

export type PlanStepKind =
  | 'reviews'
  | 'relearning'
  | 'new_items'
  | 'reading'
  | 'exercises'
  | 'exam';

export type PlanStepReason =
  | 'nothing_due'
  | 'no_content'
  | 'no_exam_date'
  | 'daily_limit_reached'
  | 'unit_complete';

export interface PlanStep {
  kind: PlanStepKind;
  status: 'ready' | 'unavailable';
  reason?: PlanStepReason;
  why?: RankReason[];
  payload?: Record<string, unknown>;
}

export interface DailyPlanInput {
  due_reviews: number;
  relearning: number;
  active_unit: { code: string; title: string; total_words: number; settled_words: number } | null;
  new_allowance: number;
  readings: RankableContent[];
  exercises: RankableContent[];
  exam_date: string | null;
  learner?: LearnerModel;
}

const EMPTY_LEARNER: LearnerModel = {
  target_word_ids: [],
  known_word_ids: [],
  recent_content_ids: [],
  covered_topics: [],
};

function best(items: RankableContent[], learner: LearnerModel) {
  let winner: { item: RankableContent; value: number; reasons: RankReason[] } | null = null;

  for (const item of items) {
    const { value, reasons } = rankContent(item, learner);
    if (!winner || value > winner.value) {
      winner = { item, value, reasons };
    }
  }

  return winner;
}

export function buildDailyPlan(input: DailyPlanInput): { steps: PlanStep[] } {
  const learner = input.learner ?? EMPTY_LEARNER;
  const steps: PlanStep[] = [];

  steps.push(
    input.due_reviews > 0
      ? { kind: 'reviews', status: 'ready', payload: { count: input.due_reviews } }
      : { kind: 'reviews', status: 'unavailable', reason: 'nothing_due' },
  );

  steps.push(
    input.relearning > 0
      ? { kind: 'relearning', status: 'ready', payload: { count: input.relearning } }
      : { kind: 'relearning', status: 'unavailable', reason: 'nothing_due' },
  );

  if (input.new_allowance <= 0) {
    steps.push({ kind: 'new_items', status: 'unavailable', reason: 'daily_limit_reached' });
  } else if (!input.active_unit) {
    steps.push({ kind: 'new_items', status: 'unavailable', reason: 'unit_complete' });
  } else {
    steps.push({
      kind: 'new_items',
      status: 'ready',
      payload: {
        count: input.new_allowance,
        unit_code: input.active_unit.code,
        unit_title: input.active_unit.title,
        unit_progress: `${input.active_unit.settled_words}/${input.active_unit.total_words}`,
      },
    });
  }

  const reading = best(input.readings, learner);
  steps.push(
    reading
      ? { kind: 'reading', status: 'ready', why: reading.reasons, payload: { id: reading.item.id } }
      : { kind: 'reading', status: 'unavailable', reason: 'no_content' },
  );

  const exercise = best(input.exercises, learner);
  steps.push(
    exercise
      ? { kind: 'exercises', status: 'ready', why: exercise.reasons, payload: { id: exercise.item.id } }
      : { kind: 'exercises', status: 'unavailable', reason: 'no_content' },
  );

  steps.push(
    input.exam_date
      ? { kind: 'exam', status: 'ready', payload: { exam_date: input.exam_date } }
      : { kind: 'exam', status: 'unavailable', reason: 'no_exam_date' },
  );

  return { steps };
}
```

Exporta el planificador desde `packages/domain/src/index.ts`:

```ts
export * from './planner/rank';
export * from './planner/plan';
```

Y en `packages/data/src/repositories/today.ts`, `getToday` reúne lo que ya reunía más la unidad activa, y devuelve el plan junto a los bloques actuales:

```ts
  const [unitRpc, queueRpc] = await Promise.all([
    (client.rpc as any)('active_unit', {}),
    (client.rpc as any)('build_review_queue', { p_deck_id: null, p_skill: 'recognition' }),
  ]);

  const unitRow = Array.isArray(unitRpc.data) ? unitRpc.data[0] : unitRpc.data;
  const queue = (queueRpc.data ?? []) as Array<{ is_new: boolean; fsrs_state: string }>;

  const plan = buildDailyPlan({
    due_reviews: queue.filter((row) => !row.is_new).length,
    relearning: queue.filter((row) => row.fsrs_state === 'relearning').length,
    active_unit: unitRow
      ? {
          code: String(unitRow.code),
          title: String(unitRow.title),
          total_words: Number(unitRow.total_words),
          settled_words: Number(unitRow.settled_words),
        }
      : null,
    new_allowance: queue.filter((row) => row.is_new).length,
    // El catálogo está vacío hasta el Plan 7; el planificador lo consulta
    // igualmente y devuelve el hueco declarado.
    readings: [],
    exercises: [],
    exam_date: settings.exam_date ?? null,
  });
```

y añade `steps: plan.steps` al objeto que devuelve. `TodayPayload` gana `steps: PlanStep[]`.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add packages/domain packages/data
git commit -m "feat(domain): planificador diario con el orden de decisión y sus huecos declarados"
```

---

## Task 5: La pantalla dice por qué

**Files:**
- Modify: `apps/mobile/src/screens/TodayScreen.tsx`
- Test: `apps/mobile/src/screens/TodayScreen.test.tsx`

**Interfaces:**
- Consumes: `steps` de `TodayPayload` (Tarea 4).

«Esta lectura practica 比 y contiene 6 palabras que estás aprendiendo». La auditoría lo pide y tiene razón en el motivo: convierte personalización invisible en confianza.

- [ ] **Step 1: Write the failing test**

`basePayload` es el objeto que `TodayScreen.test.tsx` ya pasa a `mockGetToday` en sus tests actuales; extráelo a una constante del fichero si todavía está inline.

```tsx
  it('dice qué unidad se está estudiando', async () => {
    mockGetToday.mockResolvedValue({
      ...basePayload,
      steps: [
        {
          kind: 'new_items',
          status: 'ready',
          payload: { count: 5, unit_title: '离合词', unit_progress: '1/4' },
        },
      ],
    });

    await renderToday();

    expect(screen.getByText('离合词')).toBeTruthy();
    expect(screen.getByText('1/4')).toBeTruthy();
  });

  it('explica por qué propone una lectura', async () => {
    mockGetToday.mockResolvedValue({
      ...basePayload,
      steps: [
        {
          kind: 'reading',
          status: 'ready',
          payload: { id: 'r1' },
          why: [
            { kind: 'reinforces_targets', count: 6 },
            { kind: 'comprehensible', ratio: 0.95 },
          ],
        },
      ],
    });

    await renderToday();

    expect(screen.getByText('Refuerza 6 palabras que estás aprendiendo')).toBeTruthy();
  });

  it('dice que no hay lecturas en vez de mostrar un bloque vacío', async () => {
    mockGetToday.mockResolvedValue({
      ...basePayload,
      steps: [{ kind: 'reading', status: 'unavailable', reason: 'no_content' }],
    });

    await renderToday();

    expect(screen.getByText('Todavía no hay lecturas disponibles')).toBeTruthy();
  });
```

- [ ] **Step 2: Write minimal implementation**

Un módulo pequeño traduce razones a frases, para que el texto no se disperse por el JSX:

```tsx
// apps/mobile/src/lib/planCopy.ts
import type { PlanStep, PlanStepReason, RankReason } from '@hanyu/domain';

export function reasonToText(reason: RankReason): string {
  switch (reason.kind) {
    case 'reinforces_targets':
      return `Refuerza ${reason.count} ${reason.count === 1 ? 'palabra' : 'palabras'} que estás aprendiendo`;
    case 'comprehensible':
      return `Reconocerás alrededor del ${Math.round((reason.ratio ?? 0) * 100)} % de las palabras`;
    case 'too_many_unknown':
      return `Tiene demasiadas palabras nuevas (${Math.round((reason.ratio ?? 0) * 100)} % conocidas)`;
    case 'new_topic':
      return 'Cubre un tema del examen que aún no has tocado';
    case 'seen_recently':
      return 'La has visto hace poco';
  }
}

export function unavailableToText(reason: PlanStepReason | undefined, kind: PlanStep['kind']): string {
  switch (reason) {
    case 'nothing_due':
      return 'Nada pendiente por ahora';
    case 'no_content':
      return kind === 'reading'
        ? 'Todavía no hay lecturas disponibles'
        : 'Todavía no hay ejercicios disponibles';
    case 'no_exam_date':
      return 'Pon una fecha de examen para practicar el formato';
    case 'daily_limit_reached':
      return 'Ya has introducido las palabras nuevas de hoy';
    case 'unit_complete':
      return 'Has completado la unidad. Elige la siguiente cuando quieras';
    default:
      return '';
  }
}
```

En `TodayScreen`, cada paso `ready` se pinta como tarjeta con sus razones bajo el título, y cada paso `unavailable` como una línea apagada con su motivo. Un paso sin material **se pinta**: verlo apagado dice algo verdadero sobre el estado del producto.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add apps/mobile/src
git commit -m "feat(mobile): Today muestra la unidad activa y por qué propone cada cosa"
```

---

## Task 6: Learn, Review y Exam dejan de ser el mismo modo

**Files:**
- Modify: `apps/mobile/src/screens/CardsScreen.tsx`, `packages/data/src/repositories/settings.ts`
- Modify: `supabase/migrations/2026090208_units.sql`
- Test: `apps/mobile/src/screens/CardsScreen.test.tsx`

**Interfaces:**
- Produces: `type StudyMode = 'learn' | 'review' | 'exam'` y `user_settings.exam_date`.

Hoy los tres objetivos están mezclados en una sola sesión. Separarlos cambia qué se muestra y qué se mide:

| Modo | Qué entra | Ayudas | Valoración |
|---|---|---|---|
| **Learn** | Solo elementos nuevos de la unidad activa | Pistas, glosa visible, sin cronómetro | Sin efecto sobre la retención: es la primera exposición |
| **Review** | Solo lo vencido | Pistas contadas | FSRS, con la nota derivada de la evidencia |
| **Exam** | Muestra del alcance completo | Ninguna, y con tiempo | Se registra pero no reprograma |

La regla que hace útil la separación: **en Exam nada se reprograma**. Un simulacro mide, no enseña, y dejar que altere los intervalos convertiría cada examen de prueba en un castigo de repasos.

- [ ] **Step 1: Write the failing test**

`CardsScreen.test.tsx` necesita un mock más: añade `const mockRecordEvent = jest.fn();` y `events: { recordEvent: (input: unknown) => mockRecordEvent(input) }` al objeto que devuelve el mock de `../lib/data`.

```tsx
  it('en modo Learn solo entran elementos nuevos', async () => {
    mockBuildQueue.mockResolvedValue({ cards: [] });

    await renderCards();
    await fireEvent.press(screen.getByText('Learn'));

    expect(mockBuildQueue).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: 'learn' }),
    );
  });

  it('en modo Exam no se ofrecen pistas', async () => {
    mockBuildQueue.mockResolvedValue({ cards: [card('c1', '你好')] });

    await renderCards();
    await fireEvent.press(screen.getByText('Exam'));
    await fireEvent.press(screen.getByText('Start review'));

    expect(screen.queryByText('Show a hint')).toBeNull();
  });

  it('en modo Exam la valoración se registra pero no reprograma', async () => {
    // Un simulacro mide, no enseña. Si reprogramara, hacer prácticas saldría
    // caro en repasos y el usuario dejaría de hacerlas.
    mockBuildQueue.mockResolvedValue({ cards: [card('c1', '你好')] });

    await renderCards();
    await fireEvent.press(screen.getByText('Exam'));
    await fireEvent.press(screen.getByText('Start review'));
    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByText('Good'));

    expect(mockRateCard).not.toHaveBeenCalled();
    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'exercise_attempted' }),
    );
  });
```

- [ ] **Step 2: Write minimal implementation**

```sql
-- La fecha de examen no es decorativa: es lo que enciende la práctica de
-- formato y lo que da sentido a la cuenta atrás.
alter table public.user_settings
  add column if not exists exam_date date;
```

`build_review_queue` del Plan 5A gana un parámetro de modo. Los tres cuerpos son distintos de verdad, no un filtro cosmético sobre el mismo conjunto:

```sql
-- Los tres modos responden a preguntas distintas, así que seleccionan conjuntos
-- distintos. Learn mira solo la unidad activa; Review solo lo vencido; Exam una
-- muestra del alcance completo, vencida o no, porque un simulacro pregunta lo
-- que puede caer y no lo que toca repasar.
create or replace function public.build_review_queue(
  p_deck_id uuid default null,
  p_skill public.learning_skill default 'recognition',
  p_limit integer default null,
  p_mode text default 'review'
)
returns table(
  card_id uuid, word_id bigint, skill public.learning_skill, is_new boolean,
  difficulty numeric, stability numeric, reps integer, lapses integer,
  learning_steps integer, scheduled_days integer, elapsed_days integer,
  fsrs_state text, next_review_at timestamptz, last_reviewed_at timestamptz,
  version bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_mode not in ('learn', 'review', 'exam') then
    raise exception 'mode must be learn, review or exam';
  end if;

  if p_mode = 'exam' then
    -- Sin filtro de vencimiento y en orden aleatorio: el simulacro no debe ser
    -- predecible ni coincidir con la cola de repaso del día.
    return query
    select
      sc.id, s.target_id, s.skill, false,
      s.difficulty, s.stability, s.reps, s.lapses, s.learning_steps,
      s.scheduled_days, s.elapsed_days, s.fsrs_state,
      s.next_review_at, s.last_reviewed_at, s.version
    from public.learner_skill_state s
    join public.srs_cards sc on sc.user_id = s.user_id and sc.word_id = s.target_id
    where s.user_id = auth.uid()
      and s.target_kind = 'word'
      and s.skill = p_skill
      and not s.suspended
      and s.fsrs_state <> 'new'
    order by random()
    limit greatest(1, coalesce(p_limit, 20));
    return;
  end if;

  -- learn y review comparten el cuerpo del Plan 5A; lo único que cambia es qué
  -- mitad se pide. Se mantiene aquí en vez de duplicar la función entera.
  return query
  select * from public.build_review_queue(p_deck_id, p_skill, p_limit) q
  where (p_mode = 'review' and not q.is_new)
     or (p_mode = 'learn' and q.is_new);
end;
$$;
```

En `CardsScreen`, el selector de modo pasa de `recognition | recall | listening` a `Learn | Review | Exam` —la habilidad se elige aparte— y la valoración se bifurca:

```tsx
  async function rate(grade: Grade) {
    const current = activeCards[index];
    if (!current || reviewing || !service) return;

    setReviewing(true);
    try {
      if (mode === 'exam') {
        // Un simulacro mide, no enseña. Reprogramar aquí convertiría cada
        // práctica en un castigo de repasos y el usuario dejaría de hacerlas.
        await getData().events.recordEvent({
          kind: 'exercise_attempted',
          target_kind: 'word',
          target_id: current.word_id,
          skill: current.skill,
          payload: { grade, mode: 'exam' },
        });
      } else {
        const result = await service.rateCard(current, grade, Date.now() - cardStartedAt.current);
        setUndoStack((prev) => [
          ...prev.slice(-4),
          { card: current, previousIndex: index, grade, reviewId: result.reviewId },
        ]);
      }
    } catch (caught) {
      setError(toUserMessage(caught));
      setReviewing(false);
      return;
    }
    // …el resto del avance de sesión, sin cambios
  }
```

`FlashCardView` recibe `allowHints={mode !== 'exam'}` y lo propaga a `WrittenAnswer`, que el Plan 4B introduce.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add apps/mobile/src packages/data/src supabase/migrations
git commit -m "feat(cards): separar Learn, Review y Exam con reglas distintas"
```

---

## Criterio de salida del plan

1. `npm test` en verde.
2. `npm run import-syllabus` genera `units.json` con una unidad por punto de gramática con contenido.
3. Today nombra la unidad activa y su progreso, y explica por qué propone cada cosa.
4. Los tres pasos sin material aparecen apagados con su motivo, no ocultos ni rellenos.
5. Una unidad no se propone antes que sus prerrequisitos: `6.3.1` de HSK 2 espera a `5.3.1` de HSK 1.
6. En modo Exam, valorar no llama a `rateCard` y no cambia ningún `next_review_at`.

## Lo que este plan deja explícitamente sin resolver

- **Tres de los seis pasos del plan diario nacen apagados.** Lectura, ejercicios sobre esa lectura y formato de examen no tienen material: cero lecturas en el catálogo y los formatos oficiales son el Plan 6. El planificador ya los consulta, así que se encienden cuando el Plan 7 llene `content_item`.
- **El término de interés del usuario no está en la fórmula.** No hay ninguna señal de interés en el sistema; añadirlo valiendo siempre cero solo aparentaría haberlo considerado.
- **Una unidad se da por completada con evidencia de reconocimiento.** Reconocer no es producir. Cuando el Plan 4B genere estados por habilidad, el criterio debería exigir también recuerdo, y eso es un cambio de una línea en `active_unit`.
- **La ruta no se puede reordenar a mano.** El orden sale del sílabo y de los prerrequisitos derivados. Elegir unidad manualmente es razonable y no está.
- **Las unidades con palabras avanzan en paralelo a la gramática.** `active_unit()` prioriza las unidades léxicas elegibles para que una racha de epígrafes sin palabras no deje a un usuario nuevo sin tarjetas. Las unidades de patrones siguen en el grafo y sus prerrequisitos siguen bloqueando lo que corresponda, pero la gramática queda como una actividad posterior cuando ya no haya vocabulario elegible; intercalarla con las palabras requiere una decisión de producto posterior.
- **`unit_word` cubre el 53 % de los fragmentos.** El resto son patrones sin palabra asociada, que quedan en `patterns` y no participan del progreso de la unidad.
- **La evidencia de las RPC de la ruta es de integración.** `supabase/tests/daily_plan.sql` cubre `active_unit()`, `mark_grammar_studied()` y `build_review_queue_mode()` contra PostgreSQL y se ejecuta con `psql` sobre una base migrada; la suite local de Node no sustituye esa ejecución.
