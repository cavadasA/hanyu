# Hardening de FSRS y recuperación activa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir todos los hallazgos de la revisión de 4A/4B para que la revisión FSRS sea idempotente, persistente, sincronizable, visible y funcional en las cuatro habilidades.

**Architecture:** Se añadirá una migración correctiva posterior a las migraciones 4A/4B; las RPC serán la autoridad para idempotencia, tiempo y banderas de estado. El cliente conservará el cálculo FSRS offline, pero obtendrá los parámetros vigentes y usará un flujo escrito con resultado visible antes de aplicar la valoración. La inicialización de habilidades quedará en triggers SQL y el cliente solo gestionará identidad/contexto.

**Tech Stack:** PostgreSQL/Supabase migrations and SQL contract tests, TypeScript, React Native, Jest, Vitest, `ts-fsrs`.

**Spec:** Diseño aprobado en la conversación: corrección integral de los findings de `2026090205_fsrs.sql`, `2026090206_word_context.sql`, revisión móvil y tipos generados.

## Global Constraints

- No crear ramas ni usar subagentes.
- No reescribir migraciones aplicadas; las correcciones SQL van en una migración nueva.
- TypeScript calcula FSRS y Postgres valida/persiste; no duplicar el algoritmo en SQL.
- `recognition` sigue revelando; `recall`, `listening` y `reading` exigen respuesta escrita.
- `time_ms` conserva el tiempo hasta comprobar la respuesta, no el tiempo hasta pulsar “Continuar”.
- Toda producción nueva tendrá un test de regresión escrito antes de su implementación.
- Ejecutar `npm test` después de cada tarea y mantener el árbol libre de cambios no relacionados.

### Task 1: Endurecer las RPC de review y el log de tiempo

**Files:**
- Create: `supabase/migrations/2026090301_review_hardening.sql`
- Modify: `supabase/tests/offline_review_sync.sql`
- Modify: `supabase/tests/review_revert.sql`
- Modify: `scripts/migrations-contract.test.js`

**Interfaces:**
- `apply_review(uuid, uuid, timestamptz, bigint, smallint, learning_skill, jsonb, jsonb, integer)` devuelve `outcome, version`.
- `review_log.time_ms` recibe `p_time_ms` validado como nulo o entero no negativo.
- `apply_review` no modifica `suspended`; actualiza `leech` según el umbral de lapsos y guarda la bandera previa en `prior_snapshot`.

- [ ] **Step 1: Write the failing tests**

Añadir a los contratos SQL casos que: reintenten el mismo `client_review_id` y esperen `duplicate`; pasen `time_ms = 3210` y comprueben el `review_log`; valoren una tarjeta manualmente suspendida y comprueben que continúa suspendida; y valoren reconocimiento con estabilidad suficiente para que una fila derivada deje de estar suspendida. En `review_revert.sql`, preparar una fila con `suspended = true`, aplicar una review y comprobar que `revert_review` conserva `suspended = true` y restaura `leech` desde el snapshot.

- [ ] **Step 2: Run the SQL contract tests to verify failure**

Run: `npm test -- --run scripts/migrations-contract.test.js`

Expected: el contrato falla porque la firma actual no acepta `p_time_ms`, la consulta duplicate usa `version` ambiguo, no se llama a `unlock_derived_skills`, y las RPC sobrescriben `suspended`/no persisten `time_ms`.

- [ ] **Step 3: Write the minimal migration**

En la migración nueva, eliminar la firma anterior de ocho argumentos y crear la de nueve con `p_time_ms integer default null`. Usar `s.version` en la rama duplicate, rechazar tiempos negativos, insertar `p_time_ms` en `review_log`, guardar `p_prior || jsonb_build_object('version', ..., 'skill', ..., 'leech', v_state.leech, 'suspended', v_state.suspended)`, quitar la asignación de `suspended`, mantener `leech = ((p_state->>'lapses')::integer >= 8)`, y ejecutar `perform public.unlock_derived_skills()` solo después de aplicar una review de `recognition`. En `revert_review`, eliminar la escritura de `suspended` y restaurar `leech` desde `v_prior`, con compatibilidad explícita para snapshots antiguos sin ese campo.

- [ ] **Step 4: Run the focused contracts and full suite**

Run: `npm test -- --run scripts/migrations-contract.test.js` and then `npm test`.

Expected: contratos y suite completa en verde.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026090301_review_hardening.sql supabase/tests/offline_review_sync.sql supabase/tests/review_revert.sql scripts/migrations-contract.test.js
git commit -m "fix(fsrs): endurecer idempotencia, tiempo y suspensión"
```

### Task 2: Unificar la inicialización de habilidades en Postgres

**Files:**
- Modify: `supabase/migrations/2026090301_review_hardening.sql`
- Modify: `packages/data/src/repositories/flashcards.ts`
- Modify: `packages/data/src/repositories/flashcards.test.ts`
- Modify: `supabase/tests/migrations-contract.test.js`

**Interfaces:**
- Los triggers de `srs_cards` y `word_context` son la única inicialización de `learner_skill_state`.
- `addCard` crea la tarjeta, inserta el contexto y no hace upsert paralelo de estados.

- [ ] **Step 1: Write the failing tests**

Añadir un test de `addCard` que compruebe que no escribe directamente en `learner_skill_state`, y ampliar el contrato de migración para exigir backfill de recognition/recall/listening en tarjetas existentes y reading solo cuando hay contexto. Añadir un caso de idempotencia para no reactivar ni sobrescribir estados existentes.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npx vitest run packages/data/src/repositories/flashcards.test.ts scripts/migrations-contract.test.js`

Expected: el test de repositorio detecta los upserts directos y el contrato no encuentra el backfill.

- [ ] **Step 3: Implement the single initialization path**

En la migración, insertar estados faltantes con `on conflict do nothing`, crear/ajustar los triggers y garantizar que la creación de contexto añade reading únicamente si existe `srs_cards`. En `addCard`, conservar solo el upsert idempotente de la tarjeta y el upsert idempotente del contexto.

- [ ] **Step 4: Verify**

Run: `npx vitest run packages/data/src/repositories/flashcards.test.ts scripts/migrations-contract.test.js` and `npm test`.

Expected: ambos tests focalizados y la suite completa pasan.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026090301_review_hardening.sql packages/data/src/repositories/flashcards.ts packages/data/src/repositories/flashcards.test.ts scripts/migrations-contract.test.js
git commit -m "fix(cards): centralizar estados de habilidad en la base"
```

### Task 3: Alinear skill, parámetros FSRS y tiempo en offline

**Files:**
- Modify: `packages/data/src/repositories/flashcards.ts`
- Modify: `packages/data/src/repositories/flashcards.test.ts`
- Modify: `apps/mobile/src/offline/OfflineReviewService.ts`
- Modify: `apps/mobile/src/offline/OfflineReviewService.test.ts`
- Modify: `apps/mobile/src/offline/ReviewStore.ts`
- Modify: `apps/mobile/src/offline/ReviewStore.test.ts`
- Modify: `apps/mobile/src/offline/OfflineReviewProvider.tsx`
- Modify: `apps/mobile/src/offline/OfflineReviewProvider.test.tsx`

**Interfaces:**
- `reviewCardEvent` obtiene la tarjeta posterior con `getCardForSkill(cardId, skill)` y no fija recognition.
- `OfflineReviewService.rateCard(card, grade, timeMs, params?)` conserva `time_ms` y calcula con los parámetros vigentes.
- `ReviewStore` permite actualizar los parámetros usados al reproyectar eventos pendientes.

- [ ] **Step 1: Write the failing tests**

Añadir casos que verifiquen que un evento `recall` vuelve a cargar el estado `recall`, que `reviewCardEvent` envía `p_time_ms`, y que cambiar la retención antes de `rateCard` cambia el estado calculado. Añadir un test del proveedor que actualice los parámetros compartidos sin reiniciar el usuario.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npx vitest run packages/data/src/repositories/flashcards.test.ts && npm test -- --runInBand apps/mobile/src/offline/OfflineReviewService.test.ts apps/mobile/src/offline/OfflineReviewProvider.test.tsx`

Expected: el evento usa la firma vieja, `getCard` consulta recognition y el servicio usa parámetros congelados.

- [ ] **Step 3: Implement the data flow**

Añadir un parámetro `skill` a la carga de estado de `getCard` y pasarlo desde `reviewCardEvent`; incluir `p_time_ms` en la RPC. Hacer que el proveedor mantenga un `paramsRef` mutable y exponga al servicio una lectura/refresco de settings; antes de calcular cada review, actualizar `ReviewStore` y usar esos mismos parámetros para replay/proyección.

- [ ] **Step 4: Verify**

Run: los tests focalizados y después `npm test`.

Expected: la skill, el tiempo y la retención fluyen desde UI/offline hasta RPC y todos los tests pasan.

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/repositories/flashcards.ts packages/data/src/repositories/flashcards.test.ts apps/mobile/src/offline/OfflineReviewService.ts apps/mobile/src/offline/OfflineReviewService.test.ts apps/mobile/src/offline/ReviewStore.ts apps/mobile/src/offline/ReviewStore.test.ts apps/mobile/src/offline/OfflineReviewProvider.tsx apps/mobile/src/offline/OfflineReviewProvider.test.tsx
git commit -m "fix(review): conservar skill, parámetros y tiempo offline"
```

### Task 4: Hacer observable y aislado el flujo de respuesta escrita

**Files:**
- Modify: `apps/mobile/src/ui/WrittenAnswer.tsx`
- Modify: `apps/mobile/src/ui/WrittenAnswer.test.tsx`
- Modify: `apps/mobile/src/ui/FlashCardView.tsx`
- Modify: `apps/mobile/src/ui/FlashCardView.test.tsx`
- Modify: `apps/mobile/src/screens/CardsScreen.tsx`
- Modify: `apps/mobile/src/screens/CardsScreen.test.tsx`
- Modify: `apps/mobile/src/lib/reviewSessionStore.ts`

**Interfaces:**
- `WrittenGrade` incluye `elapsed_ms` y `hints`.
- `FlashCardView` conserva el resultado escrito hasta que el usuario pulsa continuar; `onRate(grade, timeMs)` recibe el tiempo medido al comprobar.
- Cada tarjeta activa monta su formulario con `key={current.id}` y reinicia su cronómetro.

- [ ] **Step 1: Write the failing tests**

Ampliar `FlashCardView.test.tsx` para comprobar que tras `Check` el resultado y `I actually knew it` siguen visibles y `onRate` todavía no se llama; pulsar la corrección y continuar debe llamar una sola vez con `hard` y el tiempo de respuesta. Añadir un test que renderice dos tarjetas sucesivas y compruebe input/veredicto aislados. En `CardsScreen.test.tsx`, verificar que `rate` recibe el `elapsed_ms` de WrittenAnswer.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm test -- --runInBand apps/mobile/src/ui/FlashCardView.test.tsx apps/mobile/src/ui/WrittenAnswer.test.tsx apps/mobile/src/screens/CardsScreen.test.tsx`

Expected: actualmente `onRate` se llama al comprobar y el resultado se desmonta con la tarjeta siguiente.

- [ ] **Step 3: Implement the lifecycle**

En `WrittenAnswer`, reiniciar value/result/hints/timer cuando cambie `expected` y devolver `elapsed_ms` en cada grade. En `FlashCardView`, almacenar el grade pendiente, mostrar el resultado, mantener visible la corrección y ofrecer continuación; no llamar `onRate` desde `onGraded`. En `CardsScreen`, aceptar el tiempo opcional y usarlo al llamar `service.rateCard`, dejando el cálculo del cronómetro como fallback. Añadir `key={current.id}` al componente activo.

- [ ] **Step 4: Verify**

Run: tests focalizados y luego `npm test`.

Expected: respuesta, override, tiempo y cambio de tarjeta son correctos sin regresión en recognition.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/ui/WrittenAnswer.tsx apps/mobile/src/ui/WrittenAnswer.test.tsx apps/mobile/src/ui/FlashCardView.tsx apps/mobile/src/ui/FlashCardView.test.tsx apps/mobile/src/screens/CardsScreen.tsx apps/mobile/src/screens/CardsScreen.test.tsx apps/mobile/src/lib/reviewSessionStore.ts
git commit -m "fix(cards): hacer visible y aislada la respuesta escrita"
```

### Task 5: Corregir evidencia de programación, leeches y tipos generados

**Files:**
- Modify: `packages/domain/src/scheduling/schedule.ts`
- Modify: `packages/domain/src/scheduling/schedule.test.ts`
- Modify: `apps/mobile/src/screens/CardsScreen.tsx`
- Modify: `apps/mobile/src/screens/YouScreen.tsx`
- Modify: `apps/mobile/src/screens/YouScreen.test.tsx`
- Modify: `packages/data/src/repositories/skills.ts`
- Modify: `packages/data/src/repositories/words.ts`
- Modify: `packages/data/src/database.types.ts`
- Modify: `packages/data/src/types.ts`

**Interfaces:**
- `cardPhase(state, now, params)` usa `retrievability` documentada y un mínimo de estabilidad/recencia para declarar `mastered`; `isLeech` usa un único umbral exportado (`8`).
- `getLeechStates` devuelve el `Word` asociado para mostrar hanzi y sentido, no el id numérico.
- `database.types.ts` describe `srs_cards`/`learner_skill_state`/`review_log`, `word_context` y las RPC FSRS actuales sin columnas SM-2 obsoletas.

- [ ] **Step 1: Write the failing tests**

Añadir pruebas de `cardPhase` con una tarjeta madura pero con retrievability baja, una madura con retrievability alta y una tarjeta nueva; probar el límite `isLeech` con 7 y 8 lapsos. Añadir test de `YouScreen` que muestre el hanzi cargado. Añadir un contrato estático que rechace `ease_factor`, `interval_days` y `repetitions` en el bloque `srs_cards` generado.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npx vitest run packages/domain/src/scheduling/schedule.test.ts && npm test -- --runInBand apps/mobile/src/screens/YouScreen.test.tsx`

Expected: `cardPhase` no usa retrievability, el label muestra `target_id` y los tipos contienen columnas SM-2.

- [ ] **Step 3: Implement the evidence path**

Actualizar `cardPhase` para calcular retrievability con los parámetros vigentes y usar el umbral definido en el test; pasar `new Date()` y los mismos parámetros desde `CardsScreen`. Usar `useMemo` para parámetros/intervalos y evitar instanciar FSRS en cada render. Enriquecer leeches por `word_id` y renderizar hanzi, pinyin y sentido. Actualizar tipos generados según el esquema actual y eliminar dependencias de campos SM-2.

- [ ] **Step 4: Verify**

Run: tests focalizados, `npm run typecheck` y después `npm test`.

Expected: evidencia de mastered, leeches legibles, tipos coherentes y suite verde.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/scheduling/schedule.ts packages/domain/src/scheduling/schedule.test.ts apps/mobile/src/screens/CardsScreen.tsx apps/mobile/src/screens/YouScreen.tsx apps/mobile/src/screens/YouScreen.test.tsx packages/data/src/repositories/skills.ts packages/data/src/repositories/words.ts packages/data/src/database.types.ts packages/data/src/types.ts
git commit -m "fix(fsrs): alinear evidencia, leeches y tipos"
```

### Task 6: Revisión final de contratos y verificación completa

**Files:**
- Modify: `scripts/migrations-contract.test.js`
- Modify: `supabase/tests/offline_review_sync.sql`
- Modify: `supabase/tests/review_revert.sql`
- Modify: `docs/PLAN_MAESTRO_HSK2_3_0.md`

- [ ] **Step 1: Add the final regression matrix**

Cubrir en contratos los diez findings: duplicate, unlock, estado de WrittenAnswer mediante Jest, retención aplicada, suspensión manual, `time_ms`, skill posterior, tipos FSRS, memoización y label de leech. Actualizar el plan maestro para marcar la revisión de hardening realizada y documentar que `retrievability` alimenta `mastered`.

- [ ] **Step 2: Run all verification commands**

Run: `npm test`, `git diff --check`, `git status --short --branch`.

Expected: todos los typechecks y tests pasan; no hay whitespace errors; solo quedan los commits de esta corrección y ningún cambio sin relación.

- [ ] **Step 3: Commit**

```bash
git add scripts/migrations-contract.test.js supabase/tests/offline_review_sync.sql supabase/tests/review_revert.sql docs/PLAN_MAESTRO_HSK2_3_0.md
git commit -m "test(fsrs): cerrar findings de la revisión 4A y 4B"
```
