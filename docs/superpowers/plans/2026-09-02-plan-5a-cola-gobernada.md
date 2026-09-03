# Plan 5A — La cola gobernada y el diagnóstico inicial

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el mazo contenga lo que su nombre promete, que los límites configurables gobiernen de verdad la cola, y que empezar no signifique 150 tarjetas vencidas de golpe.

**Architecture:** Hoy la cola se decide en tres sitios que no se hablan: `create_starter_deck` elige 150 palabras ordenando por nivel, `CardsScreen` pide 50 fijas, y los ajustes ofrecen números que no limitan nada. Este plan mueve la política a un único constructor de cola en servidor —qué entra hoy y cuánto— y deja al cliente solo el orden fino dentro de lo que ya está seleccionado. El mazo deja de ser una foto de 150 palabras y pasa a ser el alcance completo del objetivo, del que cada día se introduce una porción.

**Tech Stack:** Node 26 (`.nvmrc`), Jest para `apps/mobile`, vitest para `packages/*`, TypeScript, Supabase (Postgres, RPC en PL/pgSQL).

## Global Constraints

- **Foco móvil, y la web está congelada.** `apps/web`, `server/app.js`, `server/routes` y `server/services` están fuera de `vitest.config.js`. Si un cambio los rompe, se dejan rotos.
- **`npm test` debe pasar al final de cada tarea.**
- **Depende del Plan 4A**, ya ejecutado: `learner_skill_state` es el hogar de la programación, `apply_review` la única escritura, y `packages/domain/src/scheduling` la única implementación del algoritmo.
- **Una sola implementación del algoritmo, también aquí.** El servidor no calcula retrievabilidad ni intervalos. Decide pertenencia y cupos; el orden fino por riesgo lo calcula el cliente con la función de dominio que ya existe.
- **Prohibido escribir mitigaciones.**
- **Este plan no crea unidades ni modos.** La ruta curricular, el ranking de contenido, la explicación de por qué se propone algo y la separación Learn/Review/Exam son el Plan 5B.

## Por qué se parte el Plan 5

Es la tercera vez que un plan del maestro se parte al aterrizarlo, y conviene decir por qué en vez de repetirlo: **el maestro describe fases, no documentos**. Una fase agrupa todo lo que comparte propósito; un documento ejecutable tiene que caber en una revisión y tener un criterio de salida que se pueda comprobar de una vez.

- **5A, este documento: la cola.** Qué tarjetas entran hoy y cuántas. Se comprueba contando: el mazo contiene HSK 2, los límites limitan, empezar no crea 150 vencidas.
- **5B: el plan diario.** Por qué esas y no otras: unidades con prerrequisitos, ranking de contenido, explicación visible, y los tres modos.

Con esto los documentos ejecutables pasan de 13 a 14.

## Estado de partida verificado (2 de septiembre de 2026)

Medido con los Planes 1A, 1B, 1C, 2, 3 y 4A ya ejecutados:

- **El Crítico 1 sigue abierto, y cambió de sitio.** `create_starter_deck` conserva `order by w.hsk_level, coalesce(w.frequency, 2147483647), w.id limit 150` sobre los niveles `[1,2]`. Con 300 palabras de HSK 1 en el corpus, las 150 primeras son todas de HSK 1. El mazo se sigue llamando «HSK2 consolidation».
- **Y ahora empeora.** La misma función siembra una fila de `learner_skill_state` por cada palabra del mazo, con `next_review_at` nulo. `get_due_cards` filtra por `(s.next_review_at is null or s.next_review_at <= now())`, así que las 150 salen vencidas a la vez. La migración a FSRS mudó el problema de casa sin resolverlo.
- **`CardsScreen` sigue pidiendo un número fijo**: `service.loadDueCards(50)` en la línea 102. El selector de tamaño de sesión ofrece «quick» (10) y «all», donde «all» significa «todas las que vinieron en ese lote de 50».
- **De los ajustes, solo uno limita algo.** `getDueCards` recorta con `Math.min(max_reviews_per_session, requestedLimit)`. `cards_per_day` no limita la introducción de tarjetas nuevas: solo pinta una meta en Today. `card_order` no ordena nada desde que la programación se mudó a `learner_skill_state`.
- **`getToday` afirma cosas que no comprueba**: devuelve `mode: 'hsk2_consolidation'` fijo, fuerza `current_level` a `Math.max(2, ...)` y fija las lecturas en nivel 2.

## Las cuatro cifras que hoy son una

«Cuántas tarjetas» son cuatro decisiones distintas, y confundirlas es lo que hace que ninguna funcione:

| Cifra | Qué decide | Hoy |
|---|---|---|
| `new_cards_per_day` | Cuántas palabras **nuevas** se introducen al día | No existe. `cards_per_day` solo pinta una meta. |
| `review_limit_per_day` | Techo diario de repasos, para que un día de atraso no sea impasable | No existe. |
| `session_size` | Cuántas tarjetas se estudian de una sentada | «quick» = 10, «all» = lo que trajo el lote de 50 |
| `card_order` | En qué orden dentro de la sesión | Existe en ajustes, no se aplica |

## Dónde vive cada decisión

El reparto entre servidor y cliente no es arbitrario, y la auditoría señala exactamente el fallo del reparto actual: «el orden por frecuencia se aplica después de que la RPC ya seleccionó las 50 más antiguas», así que ordenar en cliente ordenaba el subconjunto equivocado.

- **El servidor decide pertenencia y cupos.** Qué tarjetas son elegibles hoy, cuántas nuevas caben, cuántos repasos. Eso son reglas sobre el conjunto completo y solo se pueden aplicar donde está el conjunto completo.
- **El cliente ordena lo que el servidor ya seleccionó.** El orden por riesgo necesita la retrievabilidad, que sale de la curva de olvido de FSRS. Calcularla en SQL sería una segunda implementación del algoritmo, justo lo que el Plan 4A eliminó.

La diferencia con el defecto actual es que el conjunto que llega al cliente **ya es el correcto**: reordenarlo no puede volverlo incorrecto.

## File Structure

**Se crean:**
- `supabase/migrations/2026090207_queue_policy.sql`
- `packages/domain/src/scheduling/queue.ts` — el orden dentro de la sesión.
- `packages/domain/src/scheduling/queue.test.ts`
- `apps/mobile/src/screens/DiagnosticScreen.tsx`
- `apps/mobile/src/screens/DiagnosticScreen.test.tsx`

**Se modifican:**
- `packages/data/src/repositories/settings.ts`, `flashcards.ts`, `today.ts`, `types.ts`, `factory.ts`
- `apps/mobile/src/offline/OfflineReviewService.ts`
- `apps/mobile/src/screens/CardsScreen.tsx`, `YouScreen.tsx`, `TodayScreen.tsx`

---

## Task 1: Los cuatro límites existen y significan cosas distintas

**Files:**
- Create: `supabase/migrations/2026090207_queue_policy.sql`
- Modify: `packages/data/src/repositories/settings.ts`, `packages/data/src/types.ts`
- Test: `packages/data/src/repositories/settings.test.ts`

**Interfaces:**
- Produces: `UserSettings` gana `new_cards_per_day`, `review_limit_per_day` y `session_size`; pierde `cards_per_day` y `max_reviews_per_session`. Los consumen las Tareas 2, 4 y 5.

`cards_per_day` se migra a `new_cards_per_day` porque es lo que el usuario creía estar configurando, y `max_reviews_per_session` a `session_size` por lo mismo. Conservar los nombres viejos junto a los nuevos dejaría cuatro columnas donde hay cuatro decisiones y dos nombres que ya no significan lo que dicen.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/2026090207_queue_policy.sql
--
-- "Cuántas tarjetas" son cuatro decisiones distintas y hasta ahora había dos
-- columnas, ninguna de las cuales limitaba la cola: cards_per_day solo pintaba
-- una meta en Today, y max_reviews_per_session recortaba el lote ya pedido.

alter table public.user_settings
  add column if not exists new_cards_per_day integer not null default 10
    check (new_cards_per_day between 0 and 100),
  add column if not exists review_limit_per_day integer not null default 200
    check (review_limit_per_day between 10 and 999),
  add column if not exists session_size integer not null default 20
    check (session_size between 5 and 200);

-- Lo que el usuario ya había configurado se traslada al nombre que describe lo
-- que de verdad hace, en vez de perderse.
update public.user_settings
set new_cards_per_day = least(100, greatest(0, coalesce(cards_per_day, 10))),
    session_size = least(200, greatest(5, coalesce(max_reviews_per_session, 20)));

alter table public.user_settings
  drop column if exists cards_per_day,
  drop column if exists max_reviews_per_session;
```

- [ ] **Step 2: Write the failing test**

En `packages/data/src/repositories/settings.test.ts`:

```ts
  it('expone los cuatro límites por separado', async () => {
    const client = clientFor({
      user_settings: {
        data: {
          user_id: 'u1',
          theme: 'light',
          support_language: 'es',
          current_level: 2,
          new_cards_per_day: 15,
          review_limit_per_day: 150,
          session_size: 25,
          card_order: 'due',
          request_retention: 0.9,
          ai_provider: 'none',
        },
        error: null,
      },
    });

    const settings = await getSettings(client);

    expect(settings.new_cards_per_day).toBe(15);
    expect(settings.review_limit_per_day).toBe(150);
    expect(settings.session_size).toBe(25);
  });

  it('acepta cero tarjetas nuevas al día como decisión válida', async () => {
    // Un día en que solo se quiere repasar no es un error de configuración.
    const client = clientFor({ user_settings: { data: null, error: null } });

    await updateSettings({ new_cards_per_day: 0 }, client);

    expect(client.chains.user_settings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ new_cards_per_day: 0 }),
      expect.anything(),
    );
  });

  it('recorta un tamaño de sesión imposible en vez de propagarlo', async () => {
    const client = clientFor({ user_settings: { data: null, error: null } });

    await updateSettings({ session_size: 9999 }, client);

    expect(client.chains.user_settings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ session_size: 200 }),
      expect.anything(),
    );
  });
```

- [ ] **Step 3: Write minimal implementation**

En `packages/data/src/repositories/settings.ts`, sustituye las entradas de `DEFAULT_SETTINGS` y añade el saneado. Fíjate en que `new_cards_per_day` admite `0`, así que el patrón `value || default` que usa el fichero para otros campos no sirve aquí: convertiría un cero deliberado en el valor por defecto.

```ts
const DEFAULT_SETTINGS = {
  theme: 'light',
  support_language: 'es',
  current_level: 2,
  new_cards_per_day: 10,
  review_limit_per_day: 200,
  session_size: 20,
  card_order: 'due',
  request_retention: 0.9,
  ai_provider: 'none',
};
```

y en `normalizeSettings` y `sanitizeUpdates`, los tres con `clampNumber(row?.x, min, max, DEFAULT_SETTINGS.x)`: `(0, 100)`, `(10, 999)` y `(5, 200)` respectivamente. Actualiza también las tres cadenas `select` del fichero y el tipo `UserSettings`.

- [ ] **Step 4: Run tests and commit**

Run: `npm test`
Expected: los 5 pasos en PASS. `YouScreen.test.tsx` y `today.test.ts` usan los nombres viejos y hay que actualizarlos.

```bash
git add supabase/migrations/2026090207_queue_policy.sql packages/data/src
git commit -m "feat(settings): cuatro límites de estudio con nombres que dicen lo que hacen"
```

---

## Task 2: La cola se construye en servidor

**Files:**
- Modify: `supabase/migrations/2026090207_queue_policy.sql`
- Modify: `packages/data/src/repositories/flashcards.ts`
- Test: `packages/data/src/repositories/flashcards.test.ts`

**Interfaces:**
- Consumes: los límites de la Tarea 1.
- Produces: RPC `build_review_queue(p_deck_id, p_skill, p_limit)` y `buildQueue(input, client): Promise<{ cards: VersionedCard[] }>`, donde cada tarjeta lleva `is_new`. Los consumen las Tareas 3 y 5.

Tres reglas que hoy no se aplican en ningún sitio:

1. **Los repasos vencidos van primero**, hasta el techo diario. Un repaso atrasado pierde retención cada día; una palabra nueva no pierde nada por esperar.
2. **Las nuevas entran solo si queda cupo del día**, contando las ya introducidas hoy. Sin esto, dos sesiones el mismo día introducen el doble.
3. **Las nuevas se eligen por currículo**, no por identificador: primero las del nivel objetivo, y dentro de él por frecuencia. Ésta es la regla que arregla el Crítico 1.

- [ ] **Step 1: Añadir la RPC a la migración**

```sql
-- La política de cola vive aquí y en ningún otro sitio. El cliente ordena lo
-- que esta función selecciona, pero no decide qué entra ni cuánto: esas son
-- reglas sobre el conjunto completo y solo se pueden aplicar donde está.
create or replace function public.build_review_queue(
  p_deck_id uuid default null,
  p_skill public.learning_skill default 'recognition',
  p_limit integer default null
)
returns table(
  card_id uuid,
  word_id bigint,
  skill public.learning_skill,
  is_new boolean,
  difficulty numeric,
  stability numeric,
  reps integer,
  lapses integer,
  learning_steps integer,
  scheduled_days integer,
  elapsed_days integer,
  fsrs_state text,
  next_review_at timestamptz,
  last_reviewed_at timestamptz,
  version bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_settings public.user_settings;
  v_today date := (now() at time zone 'utc')::date;
  v_introduced integer;
  v_reviewed integer;
  v_new_allowance integer;
  v_review_allowance integer;
  v_session integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_settings from public.user_settings where user_id = v_user_id;
  if not found then
    raise exception 'Settings not found';
  end if;

  v_session := least(
    greatest(1, coalesce(p_limit, v_settings.session_size)),
    v_settings.session_size
  );

  -- Lo ya hecho hoy cuenta aunque fuese en otra sesión: los dos cupos son
  -- diarios, no por sesión. Aplicar el techo de repasos por sesión permitiría
  -- saltárselo abriendo la app dos veces, que es lo mismo que no tenerlo.
  select coalesce(cards_new, 0), coalesce(cards_reviewed, 0)
  into v_introduced, v_reviewed
  from public.user_stats where user_id = v_user_id and date = v_today;

  v_new_allowance := greatest(0, v_settings.new_cards_per_day - coalesce(v_introduced, 0));
  v_review_allowance := greatest(0, v_settings.review_limit_per_day - coalesce(v_reviewed, 0));

  return query
  with scope as (
    select dc.word_id
    from public.deck_cards dc
    join public.decks d on d.id = dc.deck_id
    where d.user_id = v_user_id
      and ((p_deck_id is null and d.is_active) or d.id = p_deck_id)
  ),
  due_reviews as (
    select
      sc.id as card_id, s.target_id as word_id, s.skill, false as is_new,
      s.difficulty, s.stability, s.reps, s.lapses, s.learning_steps,
      s.scheduled_days, s.elapsed_days, s.fsrs_state,
      s.next_review_at, s.last_reviewed_at, s.version
    from public.learner_skill_state s
    join public.srs_cards sc on sc.user_id = s.user_id and sc.word_id = s.target_id
    where s.user_id = v_user_id
      and s.target_kind = 'word'
      and s.skill = p_skill
      and not s.suspended
      and s.fsrs_state <> 'new'
      and s.next_review_at is not null
      and s.next_review_at <= now()
      and s.target_id in (select word_id from scope)
    order by s.next_review_at asc
    limit least(v_session, v_review_allowance)
  ),
  new_cards as (
    select
      sc.id as card_id, w.id as word_id, p_skill as skill, true as is_new,
      s.difficulty, s.stability, s.reps, s.lapses, s.learning_steps,
      s.scheduled_days, s.elapsed_days, coalesce(s.fsrs_state, 'new') as fsrs_state,
      s.next_review_at, s.last_reviewed_at, coalesce(s.version, 0) as version
    from public.words w
    join scope on scope.word_id = w.id
    join public.srs_cards sc on sc.user_id = v_user_id and sc.word_id = w.id
    left join public.learner_skill_state s
      on s.user_id = v_user_id and s.target_kind = 'word'
     and s.target_id = w.id and s.skill = p_skill
    where coalesce(s.fsrs_state, 'new') = 'new'
      and coalesce(s.suspended, false) = false
    -- El currículo manda sobre el identificador: primero el nivel objetivo,
    -- y dentro de él lo más frecuente. Ordenar por nivel ascendente es lo que
    -- llenaba el mazo "HSK 2" con 150 palabras de HSK 1.
    order by
      case when w.hsk_level = v_settings.current_level then 0 else 1 end,
      w.hsk_level,
      coalesce(w.frequency, 2147483647),
      w.id
    limit v_new_allowance
  )
  select * from due_reviews
  union all
  select * from (select * from new_cards limit greatest(0, v_session - (select count(*) from due_reviews))) n;
end;
$$;

revoke all on function public.build_review_queue(uuid, public.learning_skill, integer) from public;
grant execute on function public.build_review_queue(uuid, public.learning_skill, integer) to authenticated;
```

- [ ] **Step 2: Write the failing test**

En `packages/data/src/repositories/flashcards.test.ts`, con sus propios ayudantes —el `clientFor` que ya hay está hecho a medida del antiguo `getDueCards`:

```ts
function queueRow(cardId: string, isNew: boolean) {
  return {
    card_id: cardId,
    word_id: 1,
    skill: 'recognition',
    is_new: isNew,
    difficulty: 5,
    stability: 10,
    reps: 2,
    lapses: 0,
    learning_steps: 0,
    scheduled_days: 3,
    elapsed_days: 3,
    fsrs_state: isNew ? 'new' : 'review',
    next_review_at: '2026-09-02T00:00:00.000Z',
    last_reviewed_at: '2026-08-30T00:00:00.000Z',
    version: 1,
  };
}

function queueClient(rows: unknown[]) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: rows, error: null }),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn().mockResolvedValue({
          data: [{ id: 1, hanzi: '你好', pinyin: 'nǐ hǎo', meaning_es: 'hola', hsk_level: 1 }],
          error: null,
        }),
      })),
    })),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
  } as never;
}

describe('buildQueue', () => {
  it('pide la cola al servidor y no recorta el resultado', async () => {
    const client = queueClient([queueRow('c1', false), queueRow('c2', true)]);

    const queue = await buildQueue({ skill: 'recognition' }, client);

    expect((client as any).rpc).toHaveBeenCalledWith('build_review_queue', {
      p_deck_id: null,
      p_skill: 'recognition',
      p_limit: null,
    });
    expect(queue.cards).toHaveLength(2);
  });

  it('distingue las tarjetas nuevas de los repasos', async () => {
    const client = queueClient([queueRow('c1', false), queueRow('c2', true)]);

    const queue = await buildQueue({ skill: 'recognition' }, client);

    expect(queue.cards.map((card) => card.is_new)).toEqual([false, true]);
  });

  it('devuelve una cola vacía sin reventar cuando no hay nada que estudiar', async () => {
    const queue = await buildQueue({ skill: 'recognition' }, queueClient([]));

    expect(queue.cards).toEqual([]);
  });
});
```

- [ ] **Step 3: Write minimal implementation**

```ts
export interface BuildQueueInput {
  skill?: LearningSkill;
  deckId?: string | null;
  limit?: number | null;
}

/**
 * La cola llega ya decidida: qué entra hoy y cuánto son reglas sobre el
 * conjunto completo de tarjetas, y solo se pueden aplicar donde está ese
 * conjunto. Este repositorio no recorta ni reordena; el orden fino lo pone
 * `orderQueue` del paquete de dominio, que necesita la curva de olvido.
 */
export async function buildQueue(
  input: BuildQueueInput,
  client: HanyuClient,
): Promise<{ cards: VersionedCard[] }> {
  const { data, error } = await (client.rpc as any)('build_review_queue', {
    p_deck_id: input.deckId ?? null,
    p_skill: input.skill ?? 'recognition',
    p_limit: input.limit ?? null,
  });

  if (error) {
    throw createRepositoryError(error, 'Failed to build the study queue');
  }

  const rows = (data ?? []) as any[];
  if (rows.length === 0) {
    return { cards: [] };
  }

  const { data: words, error: wordsError } = await client
    .from('words')
    .select(WORD_SELECT)
    .in('id', rows.map((row) => Number(row.word_id)));

  if (wordsError) {
    throw createRepositoryError(wordsError, 'Failed to load queue words');
  }

  const byId = new Map((words ?? []).map((word: any) => [Number(word.id), word]));

  return {
    cards: rows.map((row) => ({
      ...mapVersionedCardRow(row, byId.get(Number(row.word_id))),
      is_new: Boolean(row.is_new),
    })),
  };
}
```

`VersionedCard` gana `is_new: boolean`. Sustituye `getDueCards` por `buildQueue` en `factory.ts` y borra la primera: su recorte en cliente es justo lo que esta tarea elimina.

- [ ] **Step 4: Run tests and commit**

Run: `npm test`

```bash
git add supabase/migrations/2026090207_queue_policy.sql packages/data/src
git commit -m "feat(db): la cola de estudio se construye en servidor con los cupos del usuario"
```

---

## Task 3: El orden dentro de la sesión

**Files:**
- Create: `packages/domain/src/scheduling/queue.ts`, `queue.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: `retrievability`, `SchedulingState` (Plan 4A).
- Produces: `orderQueue(cards, now, params, strategy): T[]`, con `strategy` en `'due' | 'frequency'`.

Este es el único trozo de la política que vive en el cliente, y es por una razón concreta: ordenar por riesgo necesita la retrievabilidad, que sale de la curva de olvido de FSRS. Calcularla en SQL sería una segunda implementación del algoritmo.

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/scheduling/queue.test.ts
import { schedulingParams } from './params';
import { emptyState } from './schedule';
import { orderQueue } from './queue';

const params = schedulingParams({});
const now = new Date('2026-09-02T10:00:00.000Z');

function card(id: string, over: Partial<ReturnType<typeof emptyState>>, extra: object = {}) {
  return { id, is_new: false, scheduling: { ...emptyState(now), ...over }, ...extra };
}

describe('orderQueue', () => {
  it('pone primero lo que está más cerca de olvidarse', () => {
    // Las dos vencen hoy, pero la de estabilidad baja se ha degradado más.
    const solid = card('solid', {
      state: 'review', stability: 60, difficulty: 5, reps: 5,
      last_review: '2026-08-03T10:00:00.000Z', due: '2026-09-02T00:00:00.000Z',
    });
    const shaky = card('shaky', {
      state: 'review', stability: 3, difficulty: 8, reps: 2,
      last_review: '2026-08-03T10:00:00.000Z', due: '2026-09-02T00:00:00.000Z',
    });

    expect(orderQueue([solid, shaky], now, params, 'due').map((c) => c.id)).toEqual([
      'shaky',
      'solid',
    ]);
  });

  it('mete las tarjetas nuevas después de los repasos', () => {
    // Un repaso atrasado pierde retención cada día; una palabra nueva no
    // pierde nada por esperar veinte minutos.
    const review = card('review', { state: 'review', stability: 10, reps: 3 });
    const fresh = { ...card('fresh', {}), is_new: true };

    expect(orderQueue([fresh, review], now, params, 'due').map((c) => c.id)).toEqual([
      'review',
      'fresh',
    ]);
  });

  it('ordena las nuevas por frecuencia cuando esa es la estrategia', () => {
    const rare = { ...card('rare', {}, { frequency: 900 }), is_new: true };
    const common = { ...card('common', {}, { frequency: 5 }), is_new: true };

    expect(orderQueue([rare, common], now, params, 'frequency').map((c) => c.id)).toEqual([
      'common',
      'rare',
    ]);
  });

  it('no altera la lista que recibe', () => {
    const input = [card('a', {}), card('b', {})];
    const copy = [...input];

    orderQueue(input, now, params, 'due');

    expect(input).toEqual(copy);
  });
});
```

- [ ] **Step 2: Write minimal implementation**

```ts
// packages/domain/src/scheduling/queue.ts
//
// El servidor decide qué tarjetas entran hoy; esto decide en qué orden se ven.
// Vive en el cliente porque ordenar por riesgo necesita la retrievabilidad, y
// calcularla en SQL sería una segunda implementación de la curva de olvido.
import type { FSRSParameters } from 'ts-fsrs';
import { retrievability, type SchedulingState } from './schedule';

export type QueueStrategy = 'due' | 'frequency';

export interface QueueEntry {
  is_new: boolean;
  scheduling: SchedulingState;
  frequency?: number | null;
}

export function orderQueue<T extends QueueEntry>(
  cards: readonly T[],
  now: Date,
  params: FSRSParameters,
  strategy: QueueStrategy,
): T[] {
  const reviews = cards.filter((card) => !card.is_new);
  const fresh = cards.filter((card) => card.is_new);

  // Menor retrievabilidad primero: es lo que está más cerca de perderse.
  const orderedReviews = [...reviews].sort(
    (a, b) => retrievability(a.scheduling, now, params) - retrievability(b.scheduling, now, params),
  );

  const orderedNew =
    strategy === 'frequency'
      ? [...fresh].sort(
          (a, b) =>
            (a.frequency ?? Number.MAX_SAFE_INTEGER) - (b.frequency ?? Number.MAX_SAFE_INTEGER),
        )
      : fresh;

  return [...orderedReviews, ...orderedNew];
}
```

Expórtalo desde `packages/domain/src/index.ts`.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add packages/domain
git commit -m "feat(domain): ordenar la sesión por riesgo de olvido, con las nuevas al final"
```

---

## Task 4: Empezar deja de crear 150 tarjetas vencidas

**Files:**
- Modify: `supabase/migrations/2026090207_queue_policy.sql`
- Create: `apps/mobile/src/screens/DiagnosticScreen.tsx`, `DiagnosticScreen.test.tsx`
- Modify: `packages/data/src/repositories/flashcards.ts`, `factory.ts`

**Interfaces:**
- Produces: RPC `create_study_plan(p_levels int[])` y `submit_diagnostic(p_results jsonb)`; `createStudyPlan(levels, client)` y `submitDiagnostic(results, client)`.
- Elimina: `create_starter_deck`.

Aquí se cierra el Crítico 1, y no recortando la lista de otra forma sino cambiando qué es un mazo. **El mazo pasa a ser el alcance completo del objetivo** —las 504 palabras de HSK 1 y 2 en la revisión 2025— y las tarjetas se crean según el cupo diario las va introduciendo. Un mazo de 150 elegidas de antemano no puede representar «preparar HSK 2» ni aunque las 150 sean las correctas.

El diagnóstico no es una prueba de nivel con nota. Es una forma de no hacer perder el tiempo al usuario con lo que ya sabe: se le muestran unas cuantas palabras repartidas por el alcance y lo que reconoce se marca como demostrado.

- [ ] **Step 1: Añadir las RPC a la migración**

```sql
-- El mazo era una foto de 150 palabras elegidas ordenando por nivel, lo que
-- llenaba de HSK 1 un mazo llamado "HSK 2". Ahora el mazo es el alcance
-- completo del objetivo y las tarjetas se crean a medida que el cupo diario
-- las introduce: la promesa del nombre y el contenido vuelven a coincidir.
create or replace function public.create_study_plan(p_levels int[] default array[1, 2])
returns table(deck_id uuid, scope_size integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_deck_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select id into v_deck_id from public.decks where user_id = v_user_id and is_default;

  if v_deck_id is null then
    insert into public.decks (user_id, name, description, is_default)
    values (
      v_user_id,
      'HSK ' || array_to_string(p_levels, ' + '),
      'Todo el vocabulario del objetivo. Las tarjetas se introducen día a día.',
      true
    )
    returning id into v_deck_id;
  end if;

  insert into public.deck_cards (deck_id, word_id)
  select v_deck_id, w.id from public.words w where w.hsk_level = any(p_levels)
  on conflict (deck_id, word_id) do nothing;

  -- srs_cards es la identidad de la tarjeta y puede existir para todo el
  -- alcance: es barato y no programa nada. Lo que NO se crea por adelantado es
  -- learner_skill_state, porque una fila ahí es una tarjeta que el planificador
  -- considera vencida.
  insert into public.srs_cards (user_id, word_id)
  select v_user_id, dc.word_id from public.deck_cards dc where dc.deck_id = v_deck_id
  on conflict (user_id, word_id) do nothing;

  deck_id := v_deck_id;
  select count(*)::integer into scope_size
  from public.deck_cards where deck_cards.deck_id = v_deck_id;
  return next;
end;
$$;

-- Lo que el usuario demuestra reconocer no vuelve a la cola de nuevas. No se
-- marca como aprendido —reconocerlo una vez no lo prueba— sino como suspendido
-- con su motivo, para que pueda revivirlo desde Ajustes si se arrepiente.
create or replace function public.submit_diagnostic(p_results jsonb)
returns table(suspended integer, queued integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.learner_skill_state (
    user_id, target_kind, target_id, skill, suspended, fsrs_state
  )
  select
    v_user_id, 'word', (entry->>'word_id')::bigint, 'recognition',
    (entry->>'known')::boolean, 'new'
  from jsonb_array_elements(p_results) as entry
  where (entry->>'known')::boolean
  on conflict (user_id, target_kind, target_id, skill)
  do update set suspended = true, updated_at = now();

  insert into public.learning_event (user_id, kind, target_kind, target_id, skill, payload)
  select
    v_user_id, 'review_rated', 'word', (entry->>'word_id')::bigint, 'recognition',
    jsonb_build_object('source', 'diagnostic', 'known', entry->>'known')
  from jsonb_array_elements(p_results) as entry;

  select count(*)::integer into suspended
  from jsonb_array_elements(p_results) as entry
  where (entry->>'known')::boolean;

  select jsonb_array_length(p_results) - suspended into queued;
  return next;
end;
$$;

drop function if exists public.create_starter_deck(text, integer);

revoke all on function public.create_study_plan(int[]) from public;
grant execute on function public.create_study_plan(int[]) to authenticated;
revoke all on function public.submit_diagnostic(jsonb) from public;
grant execute on function public.submit_diagnostic(jsonb) to authenticated;
```

- [ ] **Step 2: Write the failing test**

```tsx
// apps/mobile/src/screens/DiagnosticScreen.test.tsx
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import DiagnosticScreen from './DiagnosticScreen';

const mockGetWords = jest.fn();
const mockSubmitDiagnostic = jest.fn();
const mockCreateStudyPlan = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    words: { getWords: (params: unknown) => mockGetWords(params) },
    flashcards: {
      submitDiagnostic: (results: unknown) => mockSubmitDiagnostic(results),
      createStudyPlan: (levels: number[]) => mockCreateStudyPlan(levels),
    },
  }),
}));

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));

async function renderDiagnostic() {
  await act(async () => {
    await render(<DiagnosticScreen />);
  });
}

describe('DiagnosticScreen', () => {
  beforeEach(() => {
    mockGetWords.mockReset();
    mockSubmitDiagnostic.mockReset().mockResolvedValue({ suspended: 1, queued: 1 });
    mockCreateStudyPlan.mockReset().mockResolvedValue({ deck_id: 'd1', scope_size: 504 });
    mockGetWords.mockResolvedValue({
      items: [
        { id: 1, hanzi: '你好', pinyin: 'nǐ hǎo', meaning_es: 'hola', hsk_level: 1 },
        { id: 2, hanzi: '爱情', pinyin: 'àiqíng', meaning_es: 'amor', hsk_level: 2 },
      ],
    });
  });

  it('crea el plan de estudio antes de preguntar nada', async () => {
    await renderDiagnostic();

    expect(mockCreateStudyPlan).toHaveBeenCalledWith([1, 2]);
  });

  it('manda lo reconocido y lo no reconocido con su marca', async () => {
    await renderDiagnostic();

    await fireEvent.press(screen.getByText('Ya la sé'));
    await fireEvent.press(screen.getByText('No la sé'));

    expect(mockSubmitDiagnostic).toHaveBeenCalledWith([
      { word_id: 1, known: true },
      { word_id: 2, known: false },
    ]);
  });

  it('se puede saltar sin marcar nada', async () => {
    // Obligar a un cuestionario antes del primer valor es justo lo que
    // PRODUCT.md pone entre las anti-referencias.
    await renderDiagnostic();

    await fireEvent.press(screen.getByText('Saltar'));

    expect(mockSubmitDiagnostic).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/mobile/src/screens/DiagnosticScreen.tsx
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { toUserMessage, type Word } from '@hanyu/data';
import { getData } from '../lib/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Screen } from '../ui/Screen';

const TARGET_LEVELS = [1, 2];
const SAMPLE_SIZE = 12;

export default function DiagnosticScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [words, setWords] = useState<Word[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Array<{ word_id: number; known: boolean }>>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      // El plan se crea antes de preguntar nada: si el usuario se salta el
      // diagnóstico, la app ya tiene con qué trabajar.
      await getData().flashcards.createStudyPlan(TARGET_LEVELS);
      const page = await getData().words.getWords({ level: 2, page_size: SAMPLE_SIZE });
      setWords(page.items ?? []);
    } catch (caught) {
      setError(toUserMessage(caught));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function finish(results: Array<{ word_id: number; known: boolean }>) {
    try {
      await getData().flashcards.submitDiagnostic(results);
      router.replace('/cards');
    } catch (caught) {
      setError(toUserMessage(caught));
    }
  }

  function answer(known: boolean) {
    const current = words?.[index];
    if (!current) return;

    const next = [...answers, { word_id: current.id, known }];
    setAnswers(next);

    if (index + 1 >= (words?.length ?? 0)) {
      void finish(next);
      return;
    }

    setIndex(index + 1);
  }

  if (error) {
    return (
      <Screen>
        <ErrorBanner message={error} onRetry={load} />
      </Screen>
    );
  }

  if (!words) {
    return (
      <Screen scroll={false}>
        <ActivityIndicator />
      </Screen>
    );
  }

  const current = words[index];

  return (
    <Screen>
      <Text style={[styles.intro, { color: colors.textMuted }]}>
        {`¿Reconoces esta palabra? ${index + 1} de ${words.length}`}
      </Text>

      <Card>
        <Text style={[styles.hanzi, { color: colors.text }]}>{current?.hanzi}</Text>
      </Card>

      <View style={styles.actions}>
        <Button label="No la sé" variant="outline" onPress={() => answer(false)} />
        <Button label="Ya la sé" onPress={() => answer(true)} />
      </View>

      {/* Obligar a un cuestionario antes del primer valor es una de las
          anti-referencias de PRODUCT.md. */}
      <Button label="Saltar" variant="outline" onPress={() => void finish([])} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: tokens.fontSize.sm, textAlign: 'center' },
  hanzi: { fontSize: tokens.fontSize.hanzi, fontWeight: '800', textAlign: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: tokens.spacing.md },
});
```

Nota que el pinyin y la glosa **no** se muestran: enseñarlos convertiría «¿la reconoces?» en «¿te suena?».

En `flashcards.ts`, sustituye `createStarterDeck` por:

```ts
export async function createStudyPlan(levels: number[], client: HanyuClient) {
  const { data, error } = await (client.rpc as any)('create_study_plan', { p_levels: levels });

  if (error) {
    throw createRepositoryError(error, 'Failed to create the study plan');
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { deck_id: String(row?.deck_id ?? ''), scope_size: Number(row?.scope_size ?? 0) };
}

export async function submitDiagnostic(
  results: Array<{ word_id: number; known: boolean }>,
  client: HanyuClient,
) {
  const { data, error } = await (client.rpc as any)('submit_diagnostic', { p_results: results });

  if (error) {
    throw createRepositoryError(error, 'Failed to save the diagnostic');
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { suspended: Number(row?.suspended ?? 0), queued: Number(row?.queued ?? 0) };
}
```

Actualiza `factory.ts` y los llamantes de `createStarterDeck` en `CardsScreen`.

- [ ] **Step 4: Run tests and commit**

Run: `npm test`

```bash
git add supabase/migrations/2026090207_queue_policy.sql packages/data/src apps/mobile/src
git commit -m "feat(cards): el mazo es el alcance del objetivo y el diagnóstico suspende lo demostrado"
```

---

## Task 5: La pantalla consume la cola y Today deja de afirmar de más

**Files:**
- Modify: `apps/mobile/src/screens/CardsScreen.tsx`, `apps/mobile/src/offline/OfflineReviewService.ts`, `packages/data/src/repositories/today.ts`
- Test: `apps/mobile/src/screens/CardsScreen.test.tsx`, `packages/data/src/repositories/today.test.ts`

**Interfaces:**
- Consumes: `buildQueue` (Tarea 2), `orderQueue` (Tarea 3), los límites (Tarea 1).

- [ ] **Step 1: Write the failing test**

```tsx
  it('no pide un número fijo de tarjetas: la cola la decide el servidor', async () => {
    mockBuildQueue.mockResolvedValue({ cards: [] });

    await renderCards();

    expect(mockBuildQueue).toHaveBeenCalledWith(
      expect.objectContaining({ skill: 'recognition' }),
    );
    expect(JSON.stringify(mockBuildQueue.mock.calls)).not.toContain('50');
  });
```

Y en `today.test.ts`:

```ts
  it('no fuerza el nivel del usuario a 2', async () => {
    // getToday devolvía Math.max(2, current_level), así que un usuario de
    // nivel 1 veía nivel 2 en su propia pantalla de inicio.
    const client = clientFor({ settings: { current_level: 1 } });

    const today = await getToday(client);

    expect(today.profile.current_level).toBe(1);
  });

  it('no afirma un modo de estudio que nadie ha elegido', async () => {
    const today = await getToday(clientFor({ settings: { current_level: 2 } }));

    expect(today.profile).not.toHaveProperty('mode');
  });

  it('la meta de tarjetas nuevas sale de los ajustes', async () => {
    const today = await getToday(clientFor({ settings: { new_cards_per_day: 15 } }));

    expect(today.flashcards.new_target).toBe(15);
  });
```

- [ ] **Step 2: Write minimal implementation**

En `OfflineReviewService`, `loadDueCards(limit)` pasa a `loadQueue(skill)`:

```ts
  /**
   * La cola la decide el servidor; aquí solo se ordena lo que llega y se cae a
   * la caché local si no hay red. Sin conexión no se puede aplicar la política
   * de cupos —requiere el conjunto completo— así que se estudia lo que hay
   * cacheado y los cupos vuelven a aplicarse en cuanto haya red.
   */
  async loadQueue(skill: LearningSkill = 'recognition'): Promise<VersionedCard[]> {
    const nowIso = this.now().toISOString();
    const cached = await this.store.getDueProjectedCards(nowIso, 200);

    let cards: VersionedCard[];
    try {
      const queue = await this.buildQueueOnline({ skill });
      await this.store.cacheCards(queue.cards);
      cards = queue.cards;
    } catch {
      cards = cached;
    }

    return orderQueue(cards, this.now(), this.params(), this.cardOrder());
  }
```

con `buildQueueOnline` y `cardOrder` inyectados por constructor como el resto de la E/S, siguiendo el patrón que ya usan `getDueCardsOnline` y `params`.

En `CardsScreen`, `load()` llama a `service.loadQueue(skill)` sin número, y `startReview` deja de recortar con `sessionSize === 'quick' ? 10 : ...`: el tamaño ya viene aplicado. El selector de sesión desaparece de la pantalla y su equivalente vive en Ajustes, que es donde se configuran los cupos.

En `today.ts`, quita `mode: 'hsk2_consolidation'` y `Math.max(2, currentLevel)`, y sustituye `target: cards_per_day` por `new_target: new_cards_per_day` más `review_target: review_limit_per_day`. La lectura deja de fijarse en nivel 2 y usa `currentLevel`.

- [ ] **Step 3: Run tests and commit**

Run: `npm test`

```bash
git add apps/mobile/src packages/data/src
git commit -m "feat(mobile): la sesión usa la cola del servidor y Today deja de afirmar de más"
```

---

## Criterio de salida del plan

1. `npm test` en verde.
2. `grep -rn "loadDueCards(50\|create_starter_deck\|max_reviews_per_session\|cards_per_day" apps packages supabase --include=*.ts --include=*.tsx --include=*.sql` no devuelve nada.
3. Con `new_cards_per_day = 10`, empezar de cero ofrece 10 tarjetas nuevas, no 150.
4. Estudiar dos sesiones el mismo día no introduce 20 nuevas: el cupo es diario.
5. Con el nivel objetivo en 2, las palabras nuevas que entran son de HSK 2 antes que de HSK 1.
6. Poner `new_cards_per_day = 0` deja una sesión de solo repasos.

## Lo que este plan deja explícitamente sin resolver

- **No hay ruta curricular.** Las palabras nuevas entran por nivel y frecuencia, que es una heurística razonable pero no una secuencia diseñada. Las unidades con prerrequisitos son el Plan 5B.
- **El planificador solo decide tarjetas.** El orden de decisión completo de la auditoría —reviews, reaprendizaje, unidad activa, lectura, ejercicios sobre los errores de esa lectura, formato de examen— cruza features y necesita el ranking de contenido del Plan 5B.
- **Nada explica por qué se propone algo.** «Esta lectura practica 比 y contiene 6 palabras que estás aprendiendo» es Plan 5B.
- **Learn, Review y Exam siguen mezclados.** Plan 5B.
- **El diagnóstico pregunta solo reconocimiento.** Reconocer no es producir, y suspender por reconocer podría estar suspendiendo de más. Es aceptable porque `submit_diagnostic` suspende en vez de dar por aprendido, y lo suspendido se puede revivir; medir las otras habilidades pediría un diagnóstico mucho más largo justo antes del primer valor.
