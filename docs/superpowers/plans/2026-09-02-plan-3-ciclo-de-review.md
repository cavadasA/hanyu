# Plan 3 — El ciclo de review sobre eventos: un solo puerto, Undo real, sesión que sobrevive

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que toda mutación de una tarjeta pase por un único puerto, que Undo revierta lo que realmente se guardó, y que cerrar la app en mitad de una sesión no la pierda.

**Architecture:** El repositorio tiene una infraestructura offline seria —almacén SQLite local con proyección, cola de eventos idempotente, motor de sincronización con control de versiones— y `CardsScreen` no la usa: llama a `getData().flashcards.reviewCard` directamente. Hay por tanto dos caminos de escritura con semánticas distintas, y el bueno está desconectado. Este plan hace del servicio offline el único puerto, construye Undo encima de la cola que ya existe, y persiste la sesión.

**Tech Stack:** Node 26 (`.nvmrc`), Jest para `apps/mobile`, vitest para `packages/*`, TypeScript, Supabase (Postgres, RPC en PL/pgSQL), SQLite local vía `expo-sqlite`, `@react-native-async-storage/async-storage`.

## Global Constraints

- **Foco móvil, y la web está congelada.** `apps/web`, `server/app.js`, `server/routes` y `server/services` están fuera de `vitest.config.js`. Si un cambio los rompe, se dejan rotos.
- **`npm test` debe pasar al final de cada tarea.**
- **Depende del Plan 1C** para `learning_event`, `learning_event_kind` y la columna `reverts_event_id`. Sin ese log, el evento de reversión no tiene dónde escribirse.
- **Este plan no cambia el algoritmo.** Sigue mandando SM-2. Sustituirlo por FSRS es el Plan 4, y el diseño de aquí está pensado para sobrevivirlo: la reversión restaura una instantánea, no reproduce el algoritmo, así que cambiar de algoritmo no la toca.
- **Prohibido escribir mitigaciones.** En particular: si el servicio offline no está listo, la pantalla espera. **No** se vuelve al repositorio directo. Un camino alternativo silencioso es exactamente la divergencia que este plan elimina.

## Estado de partida verificado (2 de septiembre de 2026)

- `CardsScreen` llama a `getData().flashcards.getDueCards(50, deckId)` y a `getData().flashcards.reviewCard(id, quality, ms)`. **No importa `useOfflineReview` en ninguna línea.**
- `reviewCard` usa `callRpcVariants` sobre la firma de tres argumentos de `review_flashcard`, que no es idempotente ni comprueba versión. La firma de seis argumentos, que sí lo hace, solo la usa `reviewCardEvent`, a la que llama únicamente el motor de sincronización.
- `undoLastRating` toca `undoStack`, `activeCards`, `index`, `reviewed` y `stats`. No hay ni una escritura. `srs_cards`, `review_log` y `user_stats` conservan la valoración.
- El test `'allows undoing the previous rating'` comprueba que reaparece 你好 y que el contador vuelve a `1/2`. No comprueba ninguna llamada ni ninguna persistencia, así que pasa con la implementación rota.
- `reviewSessionStore` es una variable de módulo. Se pierde al cerrar el proceso, y `load()` llama a `clearReviewSession()` en cada montaje, así que también se pierde al volver a entrar en la pestaña.
- `ReviewStore` ya expone `cacheCards`, `getDueProjectedCards`, `enqueueAndProject`, `listPending`, `acknowledge`, `rebase`, `markPermanentError` y `pendingCount`, y tiene `replayPendingOnto(base, events)`, que reproyecta una tarjeta desde el estado del servidor aplicando los eventos pendientes. **Deshacer un evento aún no sincronizado es sacarlo de esa cola y volver a reproyectar.** La maquinaria está.
- La RPC de seis argumentos guarda en `review_log.result_snapshot` un `jsonb` con `outcome`, `interval`, `next_review`, `ease_factor`, `repetitions`, `status` y `version`. Es el estado **posterior** a la valoración; falta el anterior.

## Las dos mitades de Undo

Una valoración puede estar en dos sitios cuando el usuario pulsa Undo, y cada uno pide una operación distinta. Ésta es la decisión de diseño central del plan.

| Situación | Qué hacer | Coste |
|---|---|---|
| El evento sigue en la cola local, sin sincronizar | Sacarlo de la cola y reproyectar la tarjeta desde el estado del servidor con los eventos que queden | Local, instantáneo, sin red |
| El evento ya se sincronizó | Llamar a `revert_review`, que restaura la instantánea previa bajo comprobación de versión | Requiere conexión |

El caso normal dentro de una sesión es el primero: el usuario pulsa Undo segundos después de valorar. El segundo tiene que funcionar igual, o Undo vuelve a mentir.

**La reversión en servidor restaura una instantánea, no reproduce el historial.** Es deliberado. Reproducir exigiría volver a ejecutar el algoritmo de programación sobre todo el historial de la tarjeta, lo que ataría este plan a SM-2 y obligaría a reescribirlo cuando el Plan 4 introduzca FSRS. Una instantánea del estado anterior es independiente del algoritmo. La comprobación de versión es lo que la hace segura: si la tarjeta cambió después de la valoración que se quiere deshacer, restaurar la instantánea perdería ese cambio, así que la RPC lo rechaza en vez de destruirlo.

## File Structure

**Se modifican:**
- `apps/mobile/src/offline/ReviewStore.ts` — nueva operación `discardPending`.
- `apps/mobile/src/offline/OfflineReviewService.ts` — `undoRating`.
- `apps/mobile/src/screens/CardsScreen.tsx` — el puerto único y la rehidratación.
- `apps/mobile/src/lib/reviewSessionStore.ts` — pasa a ser persistente.
- `packages/data/src/repositories/flashcards.ts`, `packages/data/src/types.ts`, `packages/data/src/factory.ts`
- `supabase/migrations/2026090204_review_revert.sql` (nuevo)
- Los tests de `ReviewStore`, `OfflineReviewService`, `CardsScreen` y `reviewSessionStore`.

---

## Task 1: La cola local sabe descartar un evento

**Files:**
- Modify: `apps/mobile/src/offline/ReviewStore.ts`
- Test: `apps/mobile/src/offline/ReviewStore.test.ts`

**Interfaces:**
- Produces: `ReviewStore.discardPending(reviewId: string): Promise<VersionedCard | null>` — quita el evento de la cola y devuelve la tarjeta reproyectada, o `null` si ese evento ya no estaba pendiente. Lo consume la Tarea 2.

Devuelve `null` en vez de lanzar cuando el evento no está: entre que el usuario pulsa Undo y la operación llega, el motor de sincronización puede haberlo enviado. Eso no es un error, es la señal de que hay que ir por el otro camino.

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/offline/ReviewStore.test.ts` usa `createStore()`, que monta una base SQLite en memoria por test, y las factorías `makeCard(overrides)` y `makeEvent(cardId, quality, overrides)`. Añade con ellas:

```ts
describe('discardPending', () => {
  test('removes the event and re-projects the card without it', async () => {
    const { store } = await createStore();
    const card = makeCard();
    await store.cacheCards([card]);

    const event = makeEvent(card.id, 5, { review_id: 'r1', expected_version: card.version });
    await store.enqueueAndProject(event, {
      ...card,
      repetitions: card.repetitions + 1,
      interval: 6,
      interval_days: 6,
    });

    const restored = await store.discardPending('r1');

    expect(restored).not.toBeNull();
    expect(restored!.repetitions).toBe(card.repetitions);
    expect(restored!.interval_days).toBe(card.interval_days);
    expect(await store.pendingCount()).toBe(0);
  });

  test('keeps the events queued after the discarded one', async () => {
    const { store } = await createStore();
    const first = makeCard();
    const second = makeCard();
    await store.cacheCards([first, second]);

    await store.enqueueAndProject(
      makeEvent(first.id, 5, { review_id: 'r1', expected_version: first.version }),
      { ...first, repetitions: first.repetitions + 1 },
    );
    await store.enqueueAndProject(
      makeEvent(second.id, 3, { review_id: 'r2', expected_version: second.version }),
      { ...second, repetitions: second.repetitions + 1 },
    );

    await store.discardPending('r1');

    const pending = await store.listPending();
    expect(pending.map((entry) => entry.review_id)).toEqual(['r2']);
  });

  test('returns null when the event is no longer queued', async () => {
    const { store } = await createStore();
    await store.cacheCards([makeCard()]);

    expect(await store.discardPending('never-queued')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @hanyu/mobile -- ReviewStore`
Expected: FAIL — `store.discardPending is not a function`.

- [ ] **Step 3: Write minimal implementation**

Añade la firma a la interfaz `ReviewStore`, después de `markPermanentError`:

```ts
  discardPending(reviewId: string): Promise<VersionedCard | null>;
```

Y el método a `ReviewStoreImpl`, junto a `rebase`:

```ts
  /**
   * Saca de la cola un evento que todavía no se ha sincronizado y devuelve la
   * tarjeta reproyectada sin él.
   *
   * Deshacer una valoración pendiente no necesita servidor: el estado del
   * servidor sigue guardado en server_json, y la proyección se obtiene
   * aplicando encima los eventos que queden. Es la misma operación que hace
   * rebase, con un evento menos.
   *
   * Devuelve null si el evento ya no está en la cola. No es un error: el motor
   * de sincronización puede haberlo enviado entre que el usuario pulsó Undo y
   * esta llamada llegó, y quien llama debe entonces revertirlo en servidor.
   */
  async discardPending(reviewId: string): Promise<VersionedCard | null> {
    return this.db.withTransactionAsync(async () => {
      const row = await this.db.getFirstAsync<PendingRow>(
        `SELECT * FROM pending_reviews WHERE review_id = ? AND state != 'permanent_error'`,
        [reviewId],
      );

      if (!row) {
        return null;
      }

      await this.db.runAsync('DELETE FROM pending_reviews WHERE review_id = ?', [reviewId]);

      const cached = await this.db.getFirstAsync<CachedCardRow>(
        'SELECT * FROM cached_cards WHERE card_id = ?',
        [row.card_id],
      );

      if (!cached) {
        // La cola referenciaba una tarjeta que ya no está en caché. El evento
        // se descarta igualmente: dejarlo encolado enviaría al servidor una
        // valoración que el usuario acaba de deshacer.
        return null;
      }

      const remaining = await this.db.getAllAsync<PendingRow>(
        `SELECT * FROM pending_reviews WHERE card_id = ? AND state != 'permanent_error' ORDER BY queue_sequence ASC`,
        [row.card_id],
      );

      const server = JSON.parse(cached.server_json) as VersionedCard;
      const projected = replayPendingOnto(server, remaining);

      await this.db.runAsync(UPDATE_CARD_PROJECTED, [
        JSON.stringify(projected),
        new Date().toISOString(),
        row.card_id,
      ]);

      return projected;
    });
  }
```

`withTransactionAsync` en `DbHandle` devuelve `Promise<void>`, así que amplía su firma a `withTransactionAsync<T>(fn: () => Promise<T>): Promise<T>` en la interfaz y en el adaptador de test. El borrado y la reproyección tienen que ir en la misma transacción: entre uno y otro, un fallo dejaría la tarjeta proyectada con una valoración que ya no está en la cola.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: los 5 pasos en PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/offline/ReviewStore.ts apps/mobile/src/offline/ReviewStore.test.ts
git commit -m "feat(offline): descartar un evento pendiente y reproyectar la tarjeta sin él"
```

---

## Task 2: El servicio decide por dónde deshacer

**Files:**
- Modify: `apps/mobile/src/offline/OfflineReviewService.ts`
- Test: `apps/mobile/src/offline/OfflineReviewService.test.ts`

**Interfaces:**
- Consumes: `ReviewStore.discardPending` (Tarea 1); `revertReview` (Tarea 4, inyectada como dependencia).
- Produces:
  - `OfflineReviewService.rateCard` devuelve ahora `{ card: VersionedCard; reviewId: string }`.
  - `OfflineReviewService.undoRating(reviewId: string): Promise<VersionedCard>`

  Los consume la Tarea 5.

`rateCard` tiene que devolver el `reviewId` que generó: sin él, quien llama no puede decir qué valoración deshacer. Hoy lo genera dentro y lo tira.

La dependencia `revertReviewOnline` se inyecta por constructor, como el resto de la E/S de esta clase. Así el servicio se sigue probando en Node puro.

- [ ] **Step 1: Write the failing test**

```ts
  it('rateCard returns the review id it generated', async () => {
    const service = makeService({ uuid: () => 'r1' });

    const result = await service.rateCard(card, 4, 1000);

    expect(result.reviewId).toBe('r1');
    expect(result.card.repetitions).toBe(card.repetitions + 1);
  });

  it('undoRating discards a still-pending review without touching the network', async () => {
    const revertReviewOnline = jest.fn();
    const service = makeService({ uuid: () => 'r1', revertReviewOnline });

    const { reviewId } = await service.rateCard(card, 4, 1000);
    const restored = await service.undoRating(reviewId);

    expect(restored.repetitions).toBe(card.repetitions);
    expect(revertReviewOnline).not.toHaveBeenCalled();
  });

  it('undoRating reverts on the server when the review was already synced', async () => {
    const reverted = { ...card, version: card.version + 2 };
    const revertReviewOnline = jest.fn().mockResolvedValue({ outcome: 'reverted', card: reverted });
    const store = { ...makeStore(), discardPending: jest.fn().mockResolvedValue(null) };
    const service = makeService({ store, revertReviewOnline });

    const restored = await service.undoRating('r1');

    expect(revertReviewOnline).toHaveBeenCalledWith('r1');
    expect(restored.version).toBe(card.version + 2);
  });

  it('undoRating refuses when the card moved on after the review', async () => {
    const revertReviewOnline = jest.fn().mockResolvedValue({ outcome: 'conflict', card });
    const store = { ...makeStore(), discardPending: jest.fn().mockResolvedValue(null) };
    const service = makeService({ store, revertReviewOnline });

    await expect(service.undoRating('r1')).rejects.toThrow(/reviewed again/i);
  });

  it('undoRating says so plainly when there is no connection', async () => {
    const revertReviewOnline = jest.fn().mockRejectedValue(new Error('Network request failed'));
    const store = { ...makeStore(), discardPending: jest.fn().mockResolvedValue(null) };
    const service = makeService({ store, revertReviewOnline });

    await expect(service.undoRating('r1')).rejects.toThrow(
      /already synced.*connection/i,
    );
  });
```

El fichero ya tiene `makeCard(overrides)`, `makeFakeStore(overrides)` y `makeService(overrides)`. Añade `revertReviewOnline` al tipo de `overrides` de `makeService` y a la llamada al constructor, con `jest.fn().mockResolvedValue({ outcome: 'reverted', card: makeCard() })` por defecto, y añade `discardPending: jest.fn().mockResolvedValue(null)` a `makeFakeStore`. En los tests de arriba, `card` es `makeCard()` y `makeStore()` es `makeFakeStore()`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @hanyu/mobile -- OfflineReviewService`
Expected: FAIL — `rateCard` devuelve la tarjeta pelada y `undoRating` no existe.

- [ ] **Step 3: Write minimal implementation**

En `OfflineReviewServiceDeps`:

```ts
  /**
   * Revierte en servidor una valoración ya sincronizada. Inyectada como el
   * resto de la E/S para que el servicio siga siendo probable en Node puro.
   */
  revertReviewOnline: (reviewId: string) => Promise<{ outcome: string; card: VersionedCard }>;
```

Guárdala en el constructor como las demás. Luego, el retorno de `rateCard`:

```ts
  async rateCard(
    card: VersionedCard,
    quality: number,
    timeMs: number | null,
  ): Promise<{ card: VersionedCard; reviewId: string }> {
```

y al final del `try`, en lugar de `return projected`:

```ts
      await this.store.enqueueAndProject(event, projected);
      return { card: projected, reviewId: event.review_id };
```

Y el método nuevo:

```ts
  /**
   * Deshace una valoración.
   *
   * Si el evento sigue en la cola local, se descarta y la tarjeta se reproyecta
   * sin él: no hace falta red y el servidor nunca llegó a verlo. Si ya se
   * sincronizó, hay que revertirlo en el servidor, porque srs_cards, review_log
   * y user_stats ya lo incorporaron.
   */
  async undoRating(reviewId: string): Promise<VersionedCard> {
    const local = await this.store.discardPending(reviewId);
    if (local) {
      return local;
    }

    let result: { outcome: string; card: VersionedCard };
    try {
      result = await this.revertReviewOnline(reviewId);
    } catch {
      // Sin conexión no se puede deshacer algo que el servidor ya tiene. Se
      // dice, en vez de fingir que se ha deshecho.
      throw new Error(
        'This rating was already synced and undoing it needs a connection. Try again when you are online.',
      );
    }

    if (result.outcome !== 'reverted') {
      throw new Error('This card was reviewed again after that rating, so it can no longer be undone.');
    }

    await this.store.cacheCards([result.card]);
    return result.card;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: los 5 pasos en PASS. `OfflineReviewProvider` tendrá que pasar la dependencia nueva al construir el servicio; usa `getData().flashcards.revertReview`, que crea la Tarea 4. Si haces esta tarea antes que la 4, pasa `async () => { throw new Error('not implemented'); }` y **vuelve aquí a sustituirlo**; déjalo anotado en el commit.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/offline
git commit -m "feat(offline): undoRating descarta el evento pendiente o lo revierte en servidor"
```

---

## Task 3: La reversión en servidor

**Files:**
- Create: `supabase/migrations/2026090204_review_revert.sql`

**Interfaces:**
- Consumes: `learning_event` y `learning_event_kind` (Plan 1C).
- Produces: RPC `revert_review(p_review_id uuid)` que devuelve `(outcome text, card_id uuid, version bigint)`, con `outcome` en `'reverted' | 'conflict' | 'not_found' | 'already_reverted'`. La consume la Tarea 4. Devuelve `card_id` para que quien llama pueda refrescar la tarjeta sin una consulta extra a `review_log`.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/2026090204_review_revert.sql
--
-- Undo dejaba la valoración en la base: solo movía estado de pantalla. Volver a
-- valorar la misma tarjeta aplicaba dos transiciones, creaba dos filas de
-- review_log e incrementaba dos veces las estadísticas.
--
-- La reversión restaura una instantánea del estado anterior en vez de reproducir
-- el historial. Es a propósito: reproducir ataría esta función al algoritmo de
-- programación y habría que reescribirla cuando SM-2 se sustituya por FSRS.
-- La comprobación de versión es lo que hace segura la instantánea.

alter table public.review_log
  add column if not exists prior_snapshot jsonb,
  add column if not exists reverted_at timestamptz;

-- La firma de seis argumentos ya guarda el estado posterior en result_snapshot.
-- Aquí se le añade el anterior, que es lo que la reversión necesita restaurar.
-- Se reescribe solo ese fragmento: busca en la función el `insert into
-- public.review_log (...)` y añade `prior_snapshot` a la lista de columnas y
-- este objeto a la de valores, construido ANTES de tocar srs_cards.
--
--   jsonb_build_object(
--     'ease_factor',      v_card.ease_factor,
--     'interval_days',    v_card.interval_days,
--     'repetitions',      v_card.repetitions,
--     'status',           v_card.status,
--     'next_review_at',   v_card.next_review_at,
--     'last_reviewed_at', v_card.last_reviewed_at,
--     'version',          v_card.version
--   )

create or replace function public.revert_review(p_review_id uuid)
returns table(outcome text, card_id uuid, version bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_log      public.review_log;
  v_card     public.srs_cards;
  v_prior    jsonb;
  v_result   jsonb;
  v_event_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_log
  from public.review_log
  where client_review_id = p_review_id and user_id = v_user_id;

  if not found then
    outcome := 'not_found';
    card_id := null;
    version := null;
    return next;
    return;
  end if;

  card_id := v_log.card_id;

  -- Revertir dos veces la misma valoración descontaría dos veces las
  -- estadísticas. La operación es idempotente: la segunda vez no hace nada.
  if v_log.reverted_at is not null then
    select c.version into version from public.srs_cards c where c.id = v_log.card_id;
    outcome := 'already_reverted';
    return next;
    return;
  end if;

  v_prior  := v_log.prior_snapshot;
  v_result := v_log.result_snapshot;

  if v_prior is null then
    -- Sin instantánea previa no hay nada que restaurar sin reproducir el
    -- historial. Ocurre solo con valoraciones anteriores a esta migración.
    outcome := 'not_found';
    version := null;
    return next;
    return;
  end if;


  select * into v_card from public.srs_cards
  where id = v_log.card_id and user_id = v_user_id
  for update;

  if not found then
    outcome := 'not_found';
    version := null;
    return next;
    return;
  end if;

  -- Si la tarjeta avanzó después de esta valoración, restaurar la instantánea
  -- borraría ese avance. Se rechaza en vez de destruirlo.
  if v_card.version <> (v_result->>'version')::bigint then
    outcome := 'conflict';
    version := v_card.version;
    return next;
    return;
  end if;

  update public.srs_cards set
    ease_factor      = (v_prior->>'ease_factor')::numeric,
    interval_days    = (v_prior->>'interval_days')::integer,
    repetitions      = (v_prior->>'repetitions')::integer,
    status           = v_prior->>'status',
    next_review_at   = (v_prior->>'next_review_at')::timestamptz,
    last_reviewed_at = nullif(v_prior->>'last_reviewed_at', '')::timestamptz,
    version          = v_card.version + 1,
    updated_at       = now()
  where id = v_log.card_id;

  update public.review_log set reverted_at = now() where id = v_log.id;

  -- Las estadísticas del día pierden esta review. Se descuenta también la
  -- tarjeta nueva si aquella valoración fue la que la estrenó.
  update public.user_stats set
    cards_reviewed = greatest(0, cards_reviewed - 1),
    cards_new = greatest(0, cards_new - (case when v_prior->>'status' = 'new' then 1 else 0 end))
  where user_id = v_user_id and date = (v_log.reviewed_at at time zone 'utc')::date;

  insert into public.learning_event (user_id, kind, target_kind, target_id, payload)
  select
    v_user_id,
    'review_reverted'::public.learning_event_kind,
    'word'::public.learning_target_kind,
    c.word_id,
    jsonb_build_object('card_id', v_log.card_id, 'client_review_id', p_review_id)
  from public.srs_cards c
  where c.id = v_log.card_id
  returning id into v_event_id;

  outcome := 'reverted';
  version := v_card.version + 1;
  return next;
end;
$$;

revoke all on function public.revert_review(uuid) from public;
grant execute on function public.revert_review(uuid) to authenticated;
```

- [ ] **Step 2: Escribir la prueba SQL**

Estas pruebas se ejecutan a mano contra la base —no entran en `npm test`— y siguen el patrón de `supabase/tests/offline_review_sync.sql`: todo dentro de una transacción que termina en `rollback`, así que son seguras contra cualquier base.

```sql
-- supabase/tests/review_revert.sql
-- Comprueba revert_review en sus tres desenlaces: reversión, idempotencia y
-- conflicto. Todo va dentro de una transacción que se deshace al final.

begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values ('c0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
        'revert-test@example.com', now(), now());

insert into public.words (id, hanzi, pinyin, meaning_en, hsk_level)
values (99801, '测', 'cè', 'revert-test', 1);

insert into public.srs_cards (id, user_id, word_id)
values ('d0000000-0000-0000-0000-000000000001',
        'c0000000-0000-0000-0000-000000000001', 99801);

set local "request.jwt.claim.sub" = 'c0000000-0000-0000-0000-000000000001';

-- ── Caso 1: valorar y revertir devuelve la tarjeta a su estado anterior ──
do $$
declare
  v_before public.srs_cards;
  v_after  public.srs_cards;
  v_out    record;
begin
  select * into v_before from public.srs_cards
  where id = 'd0000000-0000-0000-0000-000000000001';

  perform public.review_flashcard(
    'd0000000-0000-0000-0000-000000000001', 4, 1200,
    'e0000000-0000-0000-0000-000000000001', now(), v_before.version
  );

  select * into v_out from public.revert_review('e0000000-0000-0000-0000-000000000001');
  if v_out.outcome <> 'reverted' then
    raise exception 'esperaba reverted, obtuve %', v_out.outcome;
  end if;
  if v_out.card_id <> 'd0000000-0000-0000-0000-000000000001' then
    raise exception 'la RPC no devolvió el card_id';
  end if;

  select * into v_after from public.srs_cards
  where id = 'd0000000-0000-0000-0000-000000000001';

  if v_after.repetitions <> v_before.repetitions
     or v_after.interval_days <> v_before.interval_days
     or v_after.ease_factor <> v_before.ease_factor
     or v_after.status <> v_before.status then
    raise exception 'la tarjeta no volvió a su estado previo';
  end if;

  -- La versión avanza aunque el estado retroceda: la reversión es una
  -- mutación más, y otros dispositivos tienen que verla.
  if v_after.version <= v_before.version then
    raise exception 'la versión debería avanzar tras revertir';
  end if;

  if (select cards_reviewed from public.user_stats
      where user_id = 'c0000000-0000-0000-0000-000000000001'
        and date = (now() at time zone 'utc')::date) <> 0 then
    raise exception 'las estadísticas del día no descontaron la review';
  end if;

  raise notice 'caso 1 OK';
end $$;

-- ── Caso 2: revertir dos veces no descuenta dos veces ──
do $$
declare
  v_out   record;
  v_stats integer;
begin
  select * into v_out from public.revert_review('e0000000-0000-0000-0000-000000000001');
  if v_out.outcome <> 'already_reverted' then
    raise exception 'esperaba already_reverted, obtuve %', v_out.outcome;
  end if;

  select coalesce(cards_reviewed, 0) into v_stats from public.user_stats
  where user_id = 'c0000000-0000-0000-0000-000000000001'
    and date = (now() at time zone 'utc')::date;

  if v_stats <> 0 then
    raise exception 'la segunda reversión volvió a descontar: %', v_stats;
  end if;

  raise notice 'caso 2 OK';
end $$;

-- ── Caso 3: si la tarjeta avanzó después, la reversión se rechaza ──
do $$
declare
  v_card   public.srs_cards;
  v_out    record;
  v_before public.srs_cards;
begin
  select * into v_card from public.srs_cards
  where id = 'd0000000-0000-0000-0000-000000000001';

  perform public.review_flashcard(
    'd0000000-0000-0000-0000-000000000001', 4, 1000,
    'e0000000-0000-0000-0000-000000000002', now(), v_card.version
  );

  select * into v_card from public.srs_cards
  where id = 'd0000000-0000-0000-0000-000000000001';

  perform public.review_flashcard(
    'd0000000-0000-0000-0000-000000000001', 3, 1000,
    'e0000000-0000-0000-0000-000000000003', now(), v_card.version
  );

  select * into v_before from public.srs_cards
  where id = 'd0000000-0000-0000-0000-000000000001';

  -- Revertir la penúltima destruiría la última. Debe rechazarse.
  select * into v_out from public.revert_review('e0000000-0000-0000-0000-000000000002');
  if v_out.outcome <> 'conflict' then
    raise exception 'esperaba conflict, obtuve %', v_out.outcome;
  end if;

  if (select version from public.srs_cards
      where id = 'd0000000-0000-0000-0000-000000000001') <> v_before.version then
    raise exception 'un conflicto no debe mutar nada';
  end if;

  raise notice 'caso 3 OK';
end $$;

rollback;
```

Ejecútala con `psql "$DATABASE_URL" -f supabase/tests/review_revert.sql`. Los tres `raise notice` tienen que aparecer.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026090204_review_revert.sql supabase/tests/review_revert.sql
git commit -m "feat(db): revert_review restaura la instantánea previa bajo control de versión"
```

---

## Task 4: El repositorio expone la reversión

**Files:**
- Modify: `packages/data/src/repositories/flashcards.ts`, `packages/data/src/types.ts`, `packages/data/src/factory.ts`
- Test: `packages/data/src/repositories/flashcards.test.ts`

**Interfaces:**
- Consumes: RPC de la Tarea 3.
- Produces: `revertReview(reviewId: string, client): Promise<{ outcome: RevertOutcome; card: VersionedCard }>` y `type RevertOutcome = 'reverted' | 'conflict' | 'not_found' | 'already_reverted'`. La consume la Tarea 2.

- [ ] **Step 1: Write the failing test**

El `clientFor` que ya hay en `packages/data/src/repositories/flashcards.test.ts` está hecho a medida de `getDueCards` y no sirve aquí. Añade uno propio junto a él, y los dos tests:

```ts
const revertCardRow = {
  id: 'card-1',
  user_id: 'u1',
  word_id: 7,
  ease_factor: 2.5,
  interval_days: 1,
  repetitions: 0,
  next_review_at: '2026-09-02T00:00:00.000Z',
  last_reviewed_at: null,
  status: 'new',
  version: 3,
};

function revertClient(outcome: string) {
  const rpc = vi.fn().mockResolvedValue({
    data: [{ outcome, card_id: revertCardRow.id, version: revertCardRow.version }],
    error: null,
  });

  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: revertCardRow, error: null }),
      })),
    })),
  }));

  return {
    rpc,
    from,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
  } as never;
}

describe('revertReview', () => {
  it('returns the outcome and the refreshed card', async () => {
    const client = revertClient('reverted');

    const result = await revertReview('r1', client);

    expect((client as any).rpc).toHaveBeenCalledWith('revert_review', { p_review_id: 'r1' });
    expect(result.outcome).toBe('reverted');
    expect(result.card.id).toBe('card-1');
  });

  it('surfaces a conflict without pretending it worked', async () => {
    const result = await revertReview('r1', revertClient('conflict'));

    expect(result.outcome).toBe('conflict');
  });
});
```

Añade `revertReview` al import del principio del fichero.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/data/src/repositories/flashcards.test.ts`
Expected: FAIL — `revertReview` no está exportada.

- [ ] **Step 3: Write minimal implementation**

En `packages/data/src/types.ts`:

```ts
export type RevertOutcome = 'reverted' | 'conflict' | 'not_found' | 'already_reverted';

export interface RevertReviewResult {
  outcome: RevertOutcome;
  card: VersionedCard;
}
```

En `packages/data/src/repositories/flashcards.ts`:

```ts
/**
 * Revierte en servidor una valoración ya sincronizada.
 *
 * Devuelve el resultado en vez de lanzar cuando la reversión no se aplica:
 * 'conflict' y 'already_reverted' son respuestas legítimas del servidor que la
 * interfaz tiene que poder explicar, no fallos.
 */
export async function revertReview(
  reviewId: string,
  client: HanyuClient,
): Promise<RevertReviewResult> {
  const { data, error } = await client.rpc('revert_review', { p_review_id: reviewId });

  if (error) {
    throw createRepositoryError(error, 'Failed to revert review');
  }

  const row = Array.isArray(data) ? data[0] : data;
  const outcome = String((row as any)?.outcome ?? 'not_found') as RevertOutcome;
  const card = await getCard(String((row as any)?.card_id ?? ''), client);

  return { outcome, card };
}
```

La RPC devuelve `card_id` precisamente para esto: sin él haría falta otra consulta a `review_log` solo para saber qué tarjeta refrescar.

Expón la función en `factory.ts`, dentro de `flashcards`:

```ts
      revertReview: (reviewId: string) => revertReview(reviewId, client),
```

y añádela al import correspondiente.

- [ ] **Step 4: Cerrar la dependencia de la Tarea 2**

En `apps/mobile/src/offline/OfflineReviewProvider.tsx`, donde se construye `OfflineReviewService`, pasa la dependencia real:

```tsx
        revertReviewOnline: (reviewId: string) => getData().flashcards.revertReview(reviewId),
```

Si la Tarea 2 dejó un `throw new Error('not implemented')`, sustitúyelo ahora.

- [ ] **Step 5: Run tests and commit**

Run: `npm test`
Expected: los 5 pasos en PASS.

```bash
git add packages/data/src apps/mobile/src/offline/OfflineReviewProvider.tsx supabase/migrations/2026090204_review_revert.sql
git commit -m "feat(data): revertReview y su conexión con el servicio offline"
```

---

## Task 5: `CardsScreen` usa el servicio offline como único puerto

**Files:**
- Modify: `apps/mobile/src/screens/CardsScreen.tsx`
- Test: `apps/mobile/src/screens/CardsScreen.test.tsx`

**Interfaces:**
- Consumes: `useOfflineReview()`, `rateCard`, `undoRating` (Tareas 1 y 2).

Aquí desaparecen los dos caminos de escritura. La pantalla deja de conocer `getData().flashcards.reviewCard`.

- [ ] **Step 1: Write the failing test**

En `apps/mobile/src/screens/CardsScreen.test.tsx`, añade el mock del proveedor junto a los que ya hay:

```tsx
const mockRateCard = jest.fn();
const mockUndoRating = jest.fn();
const mockLoadDueCards = jest.fn();

jest.mock('../offline/OfflineReviewProvider', () => ({
  useOfflineReview: () => ({
    service: {
      loadDueCards: (limit: number) => mockLoadDueCards(limit),
      rateCard: (card: unknown, quality: number, timeMs: number | null) =>
        mockRateCard(card, quality, timeMs),
      undoRating: (reviewId: string) => mockUndoRating(reviewId),
    },
    ready: true,
    pendingCount: 0,
    refreshPendingCount: jest.fn(),
    sync: jest.fn(),
    syncing: false,
    lastSummary: null,
  }),
}));
```

Y sustituye el test `'allows undoing the previous rating'` por estos tres, que sí comprueban lo que la auditoría señalaba que nadie comprobaba:

```tsx
  it('rates through the offline service and never through the repository', async () => {
    mockLoadDueCards.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
    mockRateCard.mockResolvedValue({ card: card('c1', '你好'), reviewId: 'r1' });

    await renderCards();

    await fireEvent.press(screen.getByText('Start review'));
    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByText('Good'));

    expect(mockRateCard).toHaveBeenCalledTimes(1);
    expect(mockReviewCard).not.toHaveBeenCalled();
  });

  it('undoes the rating that was actually written', async () => {
    mockLoadDueCards.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
    mockRateCard.mockResolvedValue({ card: card('c1', '你好'), reviewId: 'r1' });
    mockUndoRating.mockResolvedValue(card('c1', '你好'));

    await renderCards();

    await fireEvent.press(screen.getByText('Start review'));
    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByText('Good'));
    await fireEvent.press(screen.getByLabelText('Undo last rating'));

    expect(mockUndoRating).toHaveBeenCalledWith('r1');
    expect(screen.getByText('你好')).toBeTruthy();
    expect(screen.getByText('1/2')).toBeTruthy();
  });

  it('does not roll back the screen when the undo fails', async () => {
    // Deshacer en pantalla algo que el servidor conserva es justo la mentira
    // que este plan elimina.
    mockLoadDueCards.mockResolvedValue([card('c1', '你好'), card('c2', '谢谢')]);
    mockRateCard.mockResolvedValue({ card: card('c1', '你好'), reviewId: 'r1' });
    mockUndoRating.mockRejectedValue(new Error('This rating was already synced'));

    await renderCards();

    await fireEvent.press(screen.getByText('Start review'));
    await fireEvent.press(screen.getByText('Show answer'));
    await fireEvent.press(screen.getByText('Good'));
    await fireEvent.press(screen.getByLabelText('Undo last rating'));

    expect(screen.getByText('This rating was already synced')).toBeTruthy();
    expect(screen.getByText('谢谢')).toBeTruthy();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w @hanyu/mobile -- CardsScreen`
Expected: FAIL — la pantalla sigue llamando a `mockReviewCard` y `undoLastRating` no llama a nada.

- [ ] **Step 3: Write minimal implementation**

Añade el import y el consumo del contexto en `CardsScreen`:

```tsx
import { useOfflineReview } from '../offline/OfflineReviewProvider';
```

```tsx
  const { service, ready } = useOfflineReview();
```

`UndoEntry` guarda ahora el identificador de la valoración:

```tsx
interface UndoEntry {
  card: DueCard;
  previousIndex: number;
  quality: number;
  reviewId: string;
}
```

En `load`, sustituye la lectura directa:

```tsx
      // El servicio offline es el único puerto de lectura y de escritura de
      // tarjetas. Si no está listo, se espera: caer al repositorio directo
      // recrearía los dos caminos con semánticas distintas que este plan
      // elimina.
      if (!service) {
        return;
      }

      const cards = await service.loadDueCards(50);
      setAllDueCards(cards);
```

`deck_size` ya no viene del servicio. Tómalo del panel, que la misma función ya consulta: `setDeckSize(dashboard.cards?.total ?? 0)`. Añade `service` y `ready` a las dependencias de `useCallback` y quita la llamada a `clearReviewSession()` de aquí — la Tarea 6 explica por qué.

En `rate`, sustituye la escritura y guarda el identificador:

```tsx
    let reviewId: string;
    try {
      const result = await service!.rateCard(current as never, quality, Date.now() - cardStartedAt.current);
      reviewId = result.reviewId;
    } catch (caught) {
      setError(toUserMessage(caught));
      setRetryQuality(quality);
      setReviewing(false);
      setPendingQuality(null);
      return;
    }
```

y en el `setUndoStack`:

```tsx
    setUndoStack((prev) => [...prev.slice(-4), { card: current, previousIndex: index, quality, reviewId }]);
```

Y `undoLastRating` pasa a ser asíncrono y a revertir de verdad antes de tocar la pantalla:

```tsx
  async function undoLastRating() {
    const lastEntry = undoStack[undoStack.length - 1];
    if (!lastEntry || reviewing || !service) return;

    setReviewing(true);
    setError('');

    try {
      await service.undoRating(lastEntry.reviewId);
    } catch (caught) {
      // La valoración sigue escrita, así que la pantalla no se mueve. Mostrar
      // la tarjeta anterior aquí sería exactamente la mentira que se corrige.
      setError(toUserMessage(caught));
      setReviewing(false);
      return;
    }

    setReviewing(false);
    setUndoStack((prev) => prev.slice(0, -1));
    setActiveCards((prev) => {
      const updated = [...prev];
      updated[lastEntry.previousIndex] = lastEntry.card;
      return updated;
    });
    setIndex(lastEntry.previousIndex);
    setReviewed((prev) => Math.max(0, prev - 1));
    setStats((prev) => ({
      reviewed: Math.max(0, prev.reviewed - 1),
      correct: lastEntry.quality >= 3 ? Math.max(0, prev.correct - 1) : prev.correct,
      again: lastEntry.quality < 3 ? Math.max(0, prev.again - 1) : prev.again,
    }));
    setRevealed(false);
    cardStartedAt.current = Date.now();
  }
```

Actualiza el `onPress` del botón de Undo a `() => { void undoLastRating(); }`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: los 5 pasos en PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/CardsScreen.tsx apps/mobile/src/screens/CardsScreen.test.tsx
git commit -m "fix(mobile): valorar y deshacer a través del servicio offline, nunca del repositorio"
```

---

## Task 6: La sesión sobrevive al cierre de la app

**Files:**
- Modify: `apps/mobile/src/lib/reviewSessionStore.ts`, `apps/mobile/src/screens/CardsScreen.tsx`
- Test: `apps/mobile/src/lib/reviewSessionStore.test.ts`

**Interfaces:**
- Produces:
  - `interface ReviewSessionSnapshot { session_id, deck_id, card_ids, index, mode, started_at, reviewed, stats }`
  - `loadReviewSession(): Promise<ReviewSessionSnapshot | null>`
  - `saveReviewSession(snapshot): Promise<void>`
  - `clearReviewSession(): Promise<void>`

Hoy la instantánea guarda `total` y `reviewed`, que bastan para pintar el banner pero no para reanudar nada. Guardar los identificadores y el índice es lo que convierte "Continuar" en algo real.

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/lib/reviewSessionStore.test.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearReviewSession, loadReviewSession, saveReviewSession } from './reviewSessionStore';

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (key: string) => store[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete store[key];
    }),
    __reset: () => {
      store = {};
    },
  };
});

const snapshot = {
  session_id: 's1',
  deck_id: 'd1',
  card_ids: ['c1', 'c2', 'c3'],
  index: 1,
  mode: 'recognition' as const,
  started_at: 1_756_000_000_000,
  reviewed: 1,
  stats: { reviewed: 1, correct: 1, again: 0 },
};

describe('reviewSessionStore', () => {
  beforeEach(() => {
    (AsyncStorage as unknown as { __reset(): void }).__reset();
  });

  it('survives a fresh process, which a module variable does not', async () => {
    await saveReviewSession(snapshot);

    expect(await loadReviewSession()).toEqual(snapshot);
  });

  it('keeps the queue and the position, not just the counters', async () => {
    await saveReviewSession(snapshot);
    const restored = await loadReviewSession();

    expect(restored!.card_ids).toEqual(['c1', 'c2', 'c3']);
    expect(restored!.index).toBe(1);
  });

  it('discards a session that is no longer today', async () => {
    // Reanudar una cola de ayer propondría tarjetas que ya no tocan.
    await saveReviewSession({ ...snapshot, started_at: Date.now() - 40 * 60 * 60 * 1000 });

    expect(await loadReviewSession()).toBeNull();
  });

  it('discards a stored value that does not have the expected shape', async () => {
    await AsyncStorage.setItem('hanyu.review-session', '{"nope":true}');

    expect(await loadReviewSession()).toBeNull();
  });

  it('clear removes it', async () => {
    await saveReviewSession(snapshot);
    await clearReviewSession();

    expect(await loadReviewSession()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @hanyu/mobile -- reviewSessionStore`
Expected: FAIL — las funciones actuales son síncronas y guardan otra forma.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/mobile/src/lib/reviewSessionStore.ts
//
// La instantánea vivía en una variable de módulo: se perdía al cerrar el
// proceso y también al volver a entrar en la pestaña, porque load() la
// limpiaba. El banner conservaba apariencia de continuidad, no la cola.
//
// Guardar los identificadores y el índice, y no solo los contadores, es lo que
// permite reanudar de verdad.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ReviewMode = 'recognition' | 'recall' | 'listening';

const KEY = 'hanyu.review-session';

// Una cola de ayer propondría tarjetas cuyo momento ya pasó, así que se
// descarta en vez de reanudarse.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface ReviewSessionSnapshot {
  session_id: string;
  deck_id: string | null;
  card_ids: string[];
  index: number;
  mode: ReviewMode;
  started_at: number;
  reviewed: number;
  stats: { reviewed: number; correct: number; again: number };
}

function isSnapshot(value: unknown): value is ReviewSessionSnapshot {
  const snapshot = value as ReviewSessionSnapshot | null;

  return Boolean(
    snapshot &&
      typeof snapshot.session_id === 'string' &&
      Array.isArray(snapshot.card_ids) &&
      typeof snapshot.index === 'number' &&
      typeof snapshot.started_at === 'number' &&
      typeof snapshot.mode === 'string',
  );
}

export async function loadReviewSession(): Promise<ReviewSessionSnapshot | null> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isSnapshot(parsed)) {
    return null;
  }

  if (Date.now() - parsed.started_at > MAX_AGE_MS) {
    await clearReviewSession();
    return null;
  }

  return parsed;
}

export async function saveReviewSession(snapshot: ReviewSessionSnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Perder la instantánea degrada la reanudación, no la sesión en curso.
  }
}

export async function clearReviewSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Igual que arriba.
  }
}
```

En `CardsScreen`:

- Quita `clearReviewSession()` de `load()`. Borrar la sesión cada vez que la pantalla se monta es lo que hacía que "Continuar" no continuara nada.
- Añade un estado `resumable` y léelo antes de arrancar nada:

```tsx
  const [resumable, setResumable] = useState<ReviewSessionSnapshot | null>(null);

  useEffect(() => {
    void loadReviewSession().then(setResumable);
  }, []);
```

- En la fase `pre-session`, si hay `resumable`, ofrece las dos salidas en lugar de una:

```tsx
        {resumable ? (
          <ActiveSessionBanner
            snapshot={resumable}
            onContinue={() => resumeSession(resumable)}
            onDiscard={() => {
              void clearReviewSession();
              setResumable(null);
            }}
          />
        ) : null}
```

- `resumeSession` reconstruye la cola a partir de los identificadores guardados, respetando el orden:

```tsx
  function resumeSession(snapshot: ReviewSessionSnapshot) {
    const byId = new Map(allDueCards.map((entry) => [entry.id, entry]));
    const queue = snapshot.card_ids
      .map((id) => byId.get(id))
      .filter((entry): entry is DueCard => Boolean(entry));

    if (queue.length === 0) {
      // Ninguna tarjeta de aquella cola sigue vencida: la sesión terminó por
      // otro camino y reanudarla no tiene sentido.
      void clearReviewSession();
      setResumable(null);
      return;
    }

    setActiveCards(queue);
    setIndex(Math.min(snapshot.index, queue.length - 1));
    setReviewed(snapshot.reviewed);
    setStats(snapshot.stats);
    setMode(snapshot.mode);
    setUndoStack([]);
    setRevealed(false);
    sessionStartedAt.current = snapshot.started_at;
    cardStartedAt.current = Date.now();
    timer.start();
    setPhase('reviewing');
    setResumable(null);
  }
```

`setUndoStack([])` a propósito: los identificadores de valoración de la sesión anterior pueden haberse sincronizado ya, y ofrecer deshacer sin saberlo sería volver a prometer de más.

- Sustituye las tres llamadas a `setReviewSession({...})` de `startReview` y `rate` por `void saveReviewSession({...})` con la forma nueva, incluyendo `card_ids`, `index` y `stats`. En `startReview` genera `session_id` con `randomUUID()` de `expo-crypto`, que el proyecto ya usa.

Actualiza `ActiveSessionBanner` para aceptar `onDiscard` y la forma nueva de la instantánea: `total` pasa a ser `snapshot.card_ids.length`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: los 5 pasos en PASS. `ActiveSessionBanner.test.tsx` y `reviewSessionStore.test.ts` necesitarán la forma nueva.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): la sesión de review sobrevive al cierre y se puede continuar o descartar"
```

---

## Criterio de salida del plan

1. `npm test` en verde.
2. `grep -rn "flashcards.reviewCard" apps/mobile/src` no devuelve nada fuera de tests.
3. Valorar una tarjeta y deshacer dentro de la sesión deja `srs_cards` como estaba: comprobable con `select version, repetitions, next_review_at from srs_cards where id = ...` antes y después.
4. Deshacer una valoración ya sincronizada llama a `revert_review` y, si la tarjeta avanzó, la interfaz dice que no se puede deshacer y **no** retrocede en pantalla.
5. Cerrar la app en mitad de una sesión y volver a abrirla ofrece continuar en la misma tarjeta.
6. Entrar y salir de la pestaña de tarjetas no borra la sesión.

## Lo que este plan deja explícitamente sin resolver

- **Deshacer sin conexión una valoración ya sincronizada.** Se rechaza con un mensaje claro. Hacerlo posible exigiría una segunda clase de evento en la cola local con su propia semántica de conflicto; es mucha maquinaria para un caso raro, y el caso común —deshacer segundos después de valorar, con el evento aún pendiente— sí funciona sin red.
- **Las valoraciones anteriores a la migración no se pueden revertir.** No tienen `prior_snapshot`. `revert_review` devuelve `not_found` y la interfaz lo explica.
- **Sigue mandando SM-2.** La reversión restaura una instantánea, así que el Plan 4 puede sustituir el algoritmo sin tocar nada de aquí.
- **Los límites de la cola siguen sin gobernar.** `loadDueCards(50)` sigue siendo un número fijo en la pantalla. Separar `new_cards_per_day`, `review_limit` y `session_size`, y construir la cola en servidor, es el Plan 5.
- **La sesión persistida no cruza dispositivos.** Vive en el almacenamiento local. Compartirla exigiría una tabla de sesiones, y no hay un segundo dispositivo que lo justifique.
