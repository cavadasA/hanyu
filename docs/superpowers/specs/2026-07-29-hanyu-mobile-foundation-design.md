# Hanyu Mobile Foundation Design (P1)

**Date:** 2026-07-29
**Status:** Draft for user review
**Scope:** First of four mobile sub-projects. Shared data foundation plus the
daily learning loop on iOS and Android.

## Context

Hanyu is a Mandarin learning app for a single self-directed learner, built to
become a paid product later. The web client (`client/`) is React 18 + Vite +
Zustand + Tailwind 4 and has already migrated to a Supabase-first architecture:
Supabase Auth, Postgres with RLS, Postgres RPC, and Edge Functions. The Express
server and SQLite database remain only as transitional legacy code.

The product now needs a React Native mobile app with full feature parity with
web, shipped to the App Store and Play Store, with offline flashcard review.

Two facts from the current codebase shape this design:

- Every page and component imports the `api` facade from
  `client/src/services/api.js`, and every UI test mocks that facade rather than
  the repositories. Only `services/api.js` and `services/auth.js` touch the
  repository layer.
- The nine repository modules in `client/src/services/repositories/` already
  accept the Supabase client as an optional trailing argument
  (`getToday(client = getSupabaseClient())`). They contain no DOM access.

Together these mean the data layer can be extracted into a shared package
without rewriting queries and without touching a single UI test.

## Decomposition

The full mobile effort is four sub-projects, each with its own spec, plan, and
implementation cycle. This document specifies **P1 only**.

| Project | Content |
| --- | --- |
| **P1** | Monorepo, shared data package, auth and session, Today / Cards / You screens |
| **P2** | Content parity: Practice tab (Exercises, Readings) and Library tab (Words, Grammar) |
| **P3** | Offline flashcard review: local SM-2, persistent deck cache, sync queue |
| **P4** | Store release: EAS build and submit, deep links, account deletion, privacy policy |

Agreed build order: P1 → P2 → P3 → P4. Offline and full parity land before
store review, so the app does not need a second review cycle for a materially
different data flow.

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Repository layout | Single repo with npm workspaces | Web and mobile share the entire data contract against one Supabase project; a schema or RPC change must land in both clients in the same commit |
| Workspace tooling | npm workspaces, no Nx or Turborepo | Two apps and one package do not justify another configuration layer |
| Language | TypeScript in `packages/*` and `apps/mobile`; web stays JSX | The shared package is the data contract, which is where brittleness is most expensive; migrating the working web UI buys nothing right now |
| Navigation | Expo Router | File-based routes give deep links, which P4 needs for the password reset callback |
| Mobile styling | React Native `StyleSheet` plus a local design token module | No build-time dependency to keep working across Expo SDK upgrades |
| Audio | `expo-speech` | Native OS text-to-speech, works offline, no cost; the web `useSpeech` hook relies on Web Speech API, which does not exist in React Native |
| Session storage | `AsyncStorage` | Supabase's documented approach; `expo-secure-store` has a 2 KB per-entry limit that JWT sessions approach, forcing chunking |
| Mobile information architecture | Five-tab bar (Today, Cards, Practice, Library, You) | Everything reachable in one or two taps with no hidden menu; P1 mounts only Today, Cards, and You |

## Repository Structure

```text
hanyu/
├─ apps/
│  ├─ web/          ← current client/, moved with no internal code changes
│  └─ mobile/       ← Expo + TypeScript + Expo Router
├─ packages/
│  └─ data/         ← TypeScript: injectable Supabase client + the 9 repositories
├─ supabase/        ← migrations, Edge Functions, seed (unchanged)
├─ server/          ← legacy Express/SQLite (unchanged in P1)
└─ package.json     ← npm workspaces
```

`packages/domain` is intentionally **not** created in P1. Nothing in the daily
loop needs shared pure logic, because SM-2 runs in the `review_flashcard`
Postgres RPC. Dependency-free helpers such as `toDateString` and card ordering
stay in `packages/data/src/pure/` and are promoted to their own package in P3,
when local SM-2 justifies it.

## Package Boundary

`packages/data` must not reference `window`, `document`, `localStorage`, or
`import.meta`. Configuration is injected:

```ts
const data = createHanyuData({
  supabaseUrl,
  supabaseAnonKey,
  storage,                 // AsyncStorage on mobile, browser default on web
  detectSessionInUrl,      // true on web, false on mobile
  passwordResetRedirectTo, // currently window.location.origin
});
```

`createHanyuData` returns the repositories with the client already bound:
`auth`, `words`, `grammar`, `flashcards`, `exercises`, `readings`, `settings`,
`stats`, `today`.

Only two current files change behaviourally:

- `supabaseClient.js` stops reading `import.meta.env` and stops exporting a
  module-level singleton, which also removes `resetSupabaseClientForTests`.
- `auth.js` stops reading `window.location.origin` for the password reset
  redirect.

Everything else is mechanical: nine modules lose their
`client = getSupabaseClient()` default and receive the client from the factory.

### Types

Database types come from `supabase gen types typescript`, committed to
`packages/data/src/database.types.ts` and regenerated through an npm script. On
top of them the package exports the payload types the UI consumes, including
`TodayPayload`, `DueCard`, `DashboardPayload`, and `UserSettings`.

**Current return shapes are preserved exactly.** For example `getToday` keeps
returning `{ profile, flashcards: { deck_size, due, target, completed },
exercises, reading, progress: { completed_blocks, total_blocks } }`. The web
does not change behaviour.

### Web Adapter

`apps/web/src/services/api.js` survives as a thin adapter that constructs the
client once from `import.meta.env` and re-exposes the same `api` object. Its
consumers and their tests are untouched.

## Authentication and Session

Existing database support is sufficient: the `handle_new_user` trigger creates
`profiles` and `user_settings` on signup, and the `create_starter_deck`,
`review_flashcard`, `get_dashboard`, `log_study_time`, and `ensure_today_stats`
RPCs already exist. **P1 requires no database migration.**

Configuration reaches each app through its own environment convention: the web
keeps `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, and mobile uses
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Neither name
appears inside `packages/data`, which only receives values. The service-role key
is never added to either app.

React Native needs three things the web does not:

- **Session storage** through `AsyncStorage`, passed into the Supabase client.
- **Token refresh** tied to `AppState`: call `startAutoRefresh` when the app
  becomes active and `stopAutoRefresh` when it backgrounds. Without this the
  session expires while backgrounded and the user is asked to log in again.
- **Session state** in a `SessionProvider` context, replacing the local
  `useState` in `client/src/App.jsx`. Expo Router redirects between the
  `(auth)` and `(app)` route groups based on it.

P1 ships signup, login, and "send password reset email". Completing the
password change stays on web, because the email link points there. The native
deep link and in-app reset screen arrive in P4 with the app scheme, so P1 has no
half-finished flow.

## Screens

The five-tab bar is built in two phases. P1 mounts Today, Cards, and You only.
No placeholder tabs.

### `(auth)/sign-in`, `(auth)/sign-up`, `(auth)/forgot-password`

Equivalent to `client/src/pages/Auth.jsx`. Email and password, inline
validation errors, and the reset email request.

### `(app)/today`

Combines `getToday()` for deck size, due count, daily targets, the three
progress blocks, and the next reading, with `get_dashboard()` for the streak.

The web dashboard renders the SRS distribution with Recharts, which has no
React Native equivalent. In P1 that distribution is a stacked bar composed of
`View`s. No chart library is added; `react-native-svg` plus a chart stack is not
worth one visualization.

`getToday()` also returns exercise and reading targets and a suggested next
reading, but those features arrive in P2. In P1 the exercise and reading blocks
render as **read-only progress indicators with no navigation target**, and the
suggested reading is not shown at all. Showing a tappable card that leads
nowhere would violate the product principle that the dashboard tells the learner
what to do next. Their counters still move when the same user completes
exercises or readings on web, which is the correct shared-progress behaviour.

### `(app)/cards`

The full review session, matching `client/src/pages/Flashcards.jsx`:

- Three modes: Recognition, Recall, Listening.
- Four ratings: Again, Hard, Good, Easy, each calling `review_flashcard`.
- `log_study_time` when the session completes.
- Session-complete state with the reviewed count and a "review again" action.
- Empty-deck state calling `create_starter_deck` with strategy
  `hsk2_consolidation` and a limit of 150.

Listening mode and the card audio button mean **`expo-speech` lands in P1**, not
P2. Only reading audio remains for P2.

### `(app)/you`

The six `user_settings` fields (`theme`, `current_level`, `cards_per_day`,
`max_reviews_per_session`, `card_order`, `ai_provider`) plus sign out. Settings
are read and written through the shared repository, so web and mobile stay
consistent.

## Error Handling

`client/src/pages/Flashcards.jsx` currently swallows every failure with
`console.error`. If a review fails, the card silently does not advance and the
user sees nothing. On mobile, where the network is unreliable, that is not
acceptable, and it contradicts the `PRODUCT.md` principle that displayed
progress must match real study actions.

P1 adds:

- `toUserMessage(error)` in `packages/data`, using the `status` and `code`
  fields the repository errors already carry.
- An `ErrorBanner` primitive with a retry action, used by Today and Cards.
- Failed reviews keep the current card in place with a visible, retryable error
  instead of advancing.

## Design System

`apps/mobile/src/theme/tokens.ts` mirrors the seven colors in
`client/src/styles/theme.css` (vermilion `#e23d28`, gold `#d4a017`, and the
light and dark surface, text, and border values) and adds spacing, radius, and
typography scales. Chinese glyphs use the platform system fonts.

A `useTheme()` hook resolves the active theme from `user_settings` and listens
to `Appearance` when the value is `system`.

Tokens live in the mobile app and `theme.css` remains the source of truth for
the values. This duplicates seven colors on purpose: extracting them into a
package would force the web to generate CSS variables in a build step, which
does not pay for values that rarely change.

UI primitives in `apps/mobile/src/ui/`: `Screen`, `Card`, `Button`, `Text`,
`Badge`, `EmptyState`, `ErrorBanner`. Nothing more until P2 needs it.

## Testing

Two runners, because Vitest cannot execute React Native tests without the
`jest-expo` transform. The root `npm test` runs both.

| Target | Runner | Coverage |
| --- | --- | --- |
| `packages/data` | Vitest | Repositories used by P1 and `toUserMessage`, against a fake Supabase client |
| `apps/web` | Vitest | The existing suite, unchanged |
| `apps/mobile` | Jest + `jest-expo` + React Native Testing Library | Screens against a mocked `packages/data` |

Injecting the client makes package tests straightforward, since there is no
module-level singleton to reset.

Mobile tests worth writing: the Cards session flow (rate → advance →
complete), empty deck → starter deck creation, Today's progress blocks, and the
`(auth)` / `(app)` redirect based on session state.

Manual device verification, which unit tests cannot cover: the session survives
a cold start and thirty minutes in the background.

## Success Criteria

- `npm test` passes in all three workspaces, with the web suite unchanged.
- `npm run build` still produces a working web bundle.
- The same account signs in on iOS and Android and sees the same deck size, due
  count, and streak as the web app.
- Reviewing a card on mobile updates `user_stats`, and the web dashboard
  reflects it after a refresh.
- A new account can sign up, create the starter deck, review cards, and see
  Today report one of three blocks complete.
- The session survives a cold start and a backgrounded app.

## Out of Scope for P1

Practice and Library tabs, offline review, chart libraries, completing the
password change in the app, store builds, push notifications, Apple or Google
sign-in, and interface translation. The interface stays in English, matching
web.

## Risks

**Metro with npm workspaces.** Metro does not follow workspace symlinks by
default and needs `watchFolders` and `nodeModulesPaths` configured explicitly.
This is the most common failure point when starting an Expo monorepo.

**Moving `client/` to `apps/web`.** This touches `vitest.config.js`, the root
package scripts, the README, and the static path in `server/app.js`, which
serves `client/dist`. The move goes in its own commit with the suite passing
before any mobile code is written.

**Platform-specific code leaking into `packages/data`.** A single `window`
reference breaks the Hermes bundle at runtime rather than at build time. The
boundary rule is enforced by keeping the package free of DOM globals and by
running its tests in a Node environment, not jsdom.

## References

- Previous spec: `docs/superpowers/specs/2026-07-28-hanyu-supabase-mobile-auth-design.md`
- Product context: `PRODUCT.md`
- Expo Router: https://docs.expo.dev/router/introduction/
- Supabase with React Native: https://supabase.com/docs/guides/auth/quickstarts/react-native
- Expo monorepo setup: https://docs.expo.dev/guides/monorepo/
