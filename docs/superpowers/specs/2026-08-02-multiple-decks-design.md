# Diseño — Decks múltiples (audit #4)

Fecha: 2026-08-02. Estado: aprobado en brainstorming, pendiente de revisión de spec.
Alcance: solo la feature de **decks múltiples**. Los ítems #2 (config de API key IA)
y #3 (salidas "seguir aprendiendo" al terminar review) van en specs aparte.

## Contexto

Hoy la app tiene un único mazo plano: `srs_cards` es una tabla por usuario con
`unique(user_id, word_id)` (una carta/estado SRS por palabra). No existe concepto de
deck ni forma de tener colecciones separadas. El objetivo es permitir múltiples decks:
catálogo curado, decks propios del usuario y vistas por nivel HSK.

## Objetivos (v1)

Un usuario puede:
- Añadir un deck del **catálogo curado** (HSK1-3 + temáticos), que se copia como deck
  propio editable.
- **Crear** decks propios y **añadir/quitar** palabras a mano.
- **Activar/pausar** decks; los activos alimentan la cola de repaso diaria.
- Repasar **todo combinado** (Today) o **un deck en foco**.
- Los usuarios existentes **migran sin perder** su cola ni su progreso.

## No objetivos (diferido)

Reordenar decks por drag, compartir decks entre usuarios, filtros avanzados del
catálogo, operaciones masivas más allá de "add template", edición de los templates
globales. La config de IA (#2) y las salidas de review (#3) son specs separados.

## Decisiones de producto (fijadas en brainstorming)

1. **Propósito:** sistema completo — catálogo curado + decks propios + vistas por nivel HSK.
2. **Progreso:** **compartido**. Una sola carta SRS por palabra; repasarla en cualquier
   deck actualiza su progreso en todos. Se mantiene `unique(user_id, word_id)`.
3. **Repaso diario:** **combinado + foco opcional**. Today junta las due de todos los
   decks activos; además se puede repasar un deck concreto en foco.
4. **Estado por deck:** **activo/pausado**. Solo los activos alimentan la cola combinada.
5. **Presets:** **copia editable**. Añadir un template crea un deck propio con su lista
   de palabras copiada; a partir de ahí es un deck normal del usuario.

## Arquitectura de datos

Enfoque elegido: **tabla de membresía (`deck_cards`) + plantillas copiables**. Los decks
son colecciones sobre las cartas; el SRS no se toca.

### Tablas nuevas (migración Supabase)

**`deck_templates`** — catálogo global, seeded, solo-lectura para usuarios.
```
id            uuid pk default gen_random_uuid()
slug          text unique
name          text not null
description   text
category      text not null check (category in ('hsk','theme'))
hsk_level     int null          -- si no es null, las palabras se derivan de words
sort_order    int not null default 0
created_at    timestamptz not null default now()
```
RLS: `select` a `authenticated`. Sin insert/update/delete de usuarios.

**`deck_template_words`** — lista explícita para templates temáticos.
```
template_id   uuid references deck_templates(id) on delete cascade
word_id       bigint references words(id) on delete cascade
sort_order    int not null default 0
primary key (template_id, word_id)
```
RLS: `select` a `authenticated`. Los templates HSK **no** usan esta tabla (se derivan
por `hsk_level` al copiar, evitando seedear cientos de filas).

**`decks`** — decks del usuario.
```
id                 uuid pk default gen_random_uuid()
user_id            uuid not null references profiles(id) on delete cascade
name               text not null
description        text
is_active          boolean not null default true
is_default         boolean not null default false   -- deck destino por defecto (migración / add word)
source_template_id uuid references deck_templates(id) on delete set null
sort_order         int not null default 0
created_at         timestamptz not null default now()
updated_at         timestamptz not null default now()
```
RLS: todas las ops con `user_id = auth.uid()`.

**`deck_cards`** — membresía a nivel palabra.
```
deck_id     uuid references decks(id) on delete cascade
word_id     bigint references words(id) on delete cascade
created_at  timestamptz not null default now()
primary key (deck_id, word_id)
```
RLS: vía dueño del deck padre:
`exists (select 1 from decks d where d.id = deck_cards.deck_id and d.user_id = auth.uid())`.

### `srs_cards`: sin cambios

Mantiene `unique(user_id, word_id)`. Invariante: **el estado SRS vive solo en `srs_cards`,
uno por palabra (progreso compartido); la membresía en `deck_cards` solo decide qué cartas
están "en juego".** Una carta se crea al añadir la palabra a ≥1 deck. Si la palabra sale de
todos los decks, la carta **persiste dormida** (no se borra el progreso salvo acción explícita).

## Capa de datos (`@hanyu/data`)

### Repo nuevo `repositories/decks.ts`
- `getDecks(client)` → decks del usuario con conteos (nº palabras, nº due por deck).
- `getDeckTemplates(client)` → catálogo.
- `createDeck({ name, description }, client)` → deck propio vacío.
- `updateDeck(deckId, patch, client)` → rename / `is_active` / `sort_order` / `is_default`.
- `deleteDeck(deckId, client)` → borra deck + `deck_cards` (cascade); `srs_cards` persiste.
- `addWordToDeck(deckId, wordId, client)` → inserta membresía + `upsert` de `srs_cards`.
- `removeWordFromDeck(deckId, wordId, client)`.
- `getDeckCards(deckId, client)` → palabras del deck con su estado SRS.

### RPC nuevo `add_deck_from_template(p_template_id)`
Atómico (patrón del `create_starter_deck` existente): crea el deck del usuario, resuelve
palabras (por `hsk_level` desde `words`, o desde `deck_template_words`), inserta `deck_cards`
y hace `upsert` de `srs_cards` para las palabras que falten. Devuelve el deck + nº insertadas.
`grant execute ... to authenticated`.

### Integración con el loop (punto crítico)
- `flashcards.getDueCards(limit, client, deckId?)`: la cola se **acota a palabras en decks
  activos** (join `deck_cards` + `decks.is_active = true`). Con `deckId`, filtra a ese deck
  (modo foco); sin él, combinado de todos los activos.
- `today.getToday`: su cálculo de due usa la misma acotación a decks activos.
- `stats.getDashboard`: el conteo de due refleja decks activos; el breakdown de estados del
  mazo se mantiene global en v1.
- `flashcards.addCard(wordId, client, deckId?)`: añade a un deck destino; sin `deckId`, al
  deck `is_default`.
- `flashcards.createStarterDeck`: además de cartas, crea el deck "HSK{level} consolidation"
  (`is_default = true`) y sus `deck_cards`.

## UI (móvil)

Gestión de decks en **Library** (junto a Words/Grammar). El repaso sigue en **Reviews**;
Today no cambia su "cards due" (combinado de decks activos).

1. **Decks list** (`Library → Decks`): tus decks con nombre, nº palabras, nº due y toggle
   activo/pausado. Acciones: "Add from catalog" y "New deck". Tocar un deck → detalle.
2. **Catalog** (`Library → Decks → Add from catalog`): lista de `deck_templates`. "Add"
   llama a `add_deck_from_template` y vuelve a la lista.
3. **Deck detail**: palabras del deck con su estado SRS; añadir/quitar palabra, renombrar,
   activar/pausar, y "Review this deck" → `/cards?deckId=…`.
4. **Reviews pre-session**: acepta `deckId` opcional. Con él repasa solo ese deck; sin él,
   cola combinada (comportamiento actual). "Session complete" ofrece "Back to deck" cuando
   se venía de un deck.
5. **Words screen**: el botón de añadir elige deck destino (default: el `is_default`).

Componentes reutilizados: `HubTile`, `Card`, `Segmented`, `Button`, `EmptyState`, `Screen`,
tokens y ambos temas. Sin librerías nuevas. Estados loading (skeleton), empty y error
(`ErrorBanner` con retry). Toque ≥44pt y `accessibilityLabel`.

## Migración y compatibilidad

- La migración crea las 4 tablas + RLS y **seedea `deck_templates`**: HSK1-3 (vía
  `hsk_level`) + 1-2 temáticos con sus `deck_template_words`.
- **Backfill de usuarios existentes** (SQL en la migración): por cada usuario con
  `srs_cards`, crear un deck por defecto "HSK{level} consolidation" (`is_active = true`,
  `is_default = true`) y poblar `deck_cards` con los `word_id` de sus cartas. Así la nueva
  query de due (acotada a decks activos) **sigue devolviendo sus cartas** tras el deploy.
- **Nuevos usuarios:** "Create starter deck" (Today) y `create_starter_deck` crean también
  el deck + `deck_cards`, no solo cartas planas.

## Edge cases (decisiones)

- Añadir un template ya añadido → **se permite** (copias independientes); aviso suave, sin dedupe.
- Palabra ya en `srs_cards` al añadirla a otro deck → **solo membresía, NO se resetea el SRS**.
- Borrar deck → `deck_cards` en cascada; `srs_cards` persiste (progreso dormido); confirmación.
- Quitar palabra de su último deck activo → deja de aparecer en la cola, conserva progreso.
- Palabra en un deck pausado **y** también en uno activo → **sigue en la cola** (basta con
  estar en ≥1 deck activo). El foco por deck sí la muestra solo dentro del deck elegido.
- Pausar todos los decks → Today muestra empty-state guiando a activar/añadir un deck.
- Pausar un deck a mitad de sesión → la sesión ya cargada no se altera.

## Testing

- **Capa de datos:** `add_deck_from_template` copia palabras + crea cartas faltantes;
  add/remove word; toggle activo; delete conserva `srs_cards`. Due scoping: `getDueCards`
  solo devuelve palabras de decks **activos**; el filtro `deckId` funciona; **progreso
  compartido** (repasar una palabra en un deck la actualiza en todos).
- **Migración:** cartas existentes quedan en el deck por defecto y siguen saliendo como due.
- **Móvil:** Decks list, Catalog add, Deck detail add/remove, Reviews en modo foco. Patrón
  existente (jest + RTL, mock de `getData`).
- **No regresión:** para un usuario con un deck activo, la cola combinada = comportamiento actual
  de Today/Cards.

## Criterio de éxito (v1)

Un usuario puede añadir un deck del catálogo o crear el suyo, añadir/quitar palabras,
activar/pausar, repasar un deck en foco o todo combinado, y los usuarios existentes migran
sin perder su cola ni su progreso.
