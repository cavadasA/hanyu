# Hanyu Mobile Foundation (P1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the repo into an npm workspaces monorepo with a platform-agnostic
data package, and ship an Expo app where a signed-in user completes the daily
flashcard loop on iOS and Android against the same Supabase project as web.

**Architecture:** The nine existing repository modules move out of the web client
into `packages/data`, a TypeScript package that receives its Supabase client and
configuration by injection instead of reading `import.meta.env`. The web keeps
its `api` facade as a thin adapter, so no web UI or web test changes. A new Expo
app in `apps/mobile` consumes the same package through Expo Router with a
five-tab information architecture, of which P1 mounts Today, Cards, and You.

**Tech Stack:** npm workspaces, TypeScript, Vitest, Expo, Expo Router, React
Native, Jest with `jest-expo`, React Native Testing Library, `expo-speech`,
AsyncStorage, Supabase JS.

## Global Constraints

- Node.js 18 or higher.
- npm workspaces only. No Nx, no Turborepo, no Yarn, no pnpm.
- `packages/data` must never reference `window`, `document`, `localStorage`, or `import.meta`.
- TypeScript in `packages/*` and `apps/mobile`. `apps/web` stays JSX.
- `apps/web` test files must not be modified. They are the regression gate.
- Repository return shapes must not change. Web behaviour is identical after every task.
- No Supabase migrations in P1. Existing RPCs: `create_starter_deck`, `review_flashcard`, `get_dashboard`, `log_study_time`, `ensure_today_stats`. Trigger `handle_new_user` creates `profiles` and `user_settings`.
- Web env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Mobile env vars: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Never add a service-role key to either app.
- Session storage on mobile: `@react-native-async-storage/async-storage`. Not `expo-secure-store`.
- Audio on mobile: `expo-speech`. The web `useSpeech` hook stays web-only.
- No chart library on mobile. The SRS distribution is composed of `View`s.
- P1 mounts only Today, Cards, and You. No placeholder tabs for Practice or Library.
- All UI copy in English, matching web.
- Install every mobile dependency with `npx expo install` so versions match the Expo SDK. Never hand-pick a version for a React Native package.
- Commit at the end of every task.

---

### Task 1: Convert the repo to npm workspaces and move the web app

**Files:**
- Move: `client/` → `apps/web/`
- Create: `apps/web/package.json`
- Modify: `package.json` (root)
- Modify: `vitest.config.js`
- Modify: `server/app.js:38`
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: workspaces `@hanyu/web` at `apps/web`; root scripts `npm run dev`, `npm run build`, `npm test` keep working from the repo root.

- [x] **Step 1: Record the baseline test result**

Run: `npm test`
Expected: the suite passes. Write down the number of passing test files and
tests — the same numbers must appear at the end of this task.

- [x] **Step 2: Move the client into `apps/web`**

```bash
mkdir -p apps
git mv client apps/web
```

- [x] **Step 3: Create `apps/web/package.json`**

Versions are copied verbatim from the current root `package.json`.

```json
{
  "name": "@hanyu/web",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.111.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.28.0",
    "recharts": "^2.13.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^4.0.0",
    "vite": "^6.0.0"
  }
}
```

- [x] **Step 4: Declare workspaces and repoint the root scripts**

In root `package.json`, add the `workspaces` field after `"private": true`:

```json
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
```

Replace these two script entries:

```json
    "dev:client": "npm run dev -w @hanyu/web",
    "build": "npm run build -w @hanyu/web",
```

Leave every root dependency and devDependency untouched. The root keeps its test
tooling (`vitest`, `@testing-library/*`, `jsdom`, `@vitejs/plugin-react`,
`react`, `react-dom`) and the legacy server dependencies.

- [x] **Step 5: Repoint the Vitest config**

Replace the whole file `vitest.config.js`:

```js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [['apps/web/src/**/*.test.jsx', 'jsdom']],
    setupFiles: [],
    include: ['**/*.test.{js,jsx,ts}'],
    exclude: ['**/node_modules/**', 'apps/mobile/**'],
  },
});
```

The `ts` extension is added now because `packages/data` tests arrive in Task 2.
`apps/mobile` is excluded because it runs on Jest, not Vitest.

- [x] **Step 6: Repoint the Express static path**

In `server/app.js`, line 38:

```js
const clientDist = join(__dirname, '..', 'apps', 'web', 'dist');
```

- [x] **Step 7: Link the workspaces**

Run: `npm install`
Expected: completes without errors and creates the symlink
`node_modules/@hanyu/web` → `apps/web`.

Verify: `ls -l node_modules/@hanyu/`

- [x] **Step 8: Run the full suite and compare with the baseline**

Run: `npm test`
Expected: the same number of passing test files and tests as Step 1. If any test
file is now "not found", the move missed a path.

- [x] **Step 9: Verify the production build**

Run: `npm run build`
Expected: Vite writes the bundle to `apps/web/dist/`.

Verify: `ls apps/web/dist/index.html`

- [x] **Step 10: Update the README**

In `README.md`, replace the project structure block with:

```text
.
|-- apps/
|   |-- web/
|   |   |-- src/
|   |   |   |-- components/
|   |   |   |-- hooks/
|   |   |   |-- pages/
|   |   |   |-- services/
|   |   |   |-- stores/
|   |   |   `-- styles/
|   |   |-- index.html
|   |   `-- vite.config.js
|   `-- mobile/
|-- packages/
|   `-- data/
|-- docs/
|   `-- superpowers/
|-- scripts/
|-- server/
|-- supabase/
|-- package.json
`-- vitest.config.js
```

In the same file, change the `npm run dev:client` row of the scripts table to
`Inicia Vite en apps/web` and the `npm run build` row to `Compila el frontend en
apps/web/dist`.

- [x] **Step 11: Commit (Skipped per instruction)**

```bash
git add -A
git commit -m "refactor: convert repo to npm workspaces and move client to apps/web"
```

---

### Task 2: Create `packages/data` with injected configuration

**Files:**
- Create: `packages/data/package.json`
- Create: `packages/data/tsconfig.json`
- Create: `packages/data/src/client.ts`
- Create: `packages/data/src/client.test.ts`
- Create: `packages/data/src/index.ts`

**Interfaces:**
- Consumes: workspaces from Task 1.
- Produces: `createSupabaseClient(config: HanyuDataConfig): SupabaseClient`, the
  `HanyuDataConfig` and `SessionStorage` types, all exported from
  `@hanyu/data`. Config fields: `supabaseUrl: string`,
  `supabaseAnonKey: string`, `storage?: SessionStorage`,
  `detectSessionInUrl?: boolean`, `passwordResetRedirectTo?: string`.

- [x] **Step 1: Create the package manifest**

`packages/data/package.json`:

```json
{
  "name": "@hanyu/data",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

There is no build step. Vite, Metro, and Vitest each transpile the TypeScript
source directly, which keeps the package a single source of truth.

- [x] **Step 2: Install the package dependencies**

```bash
npm install @supabase/supabase-js@^2.111.0 -w @hanyu/data
npm install --save-dev typescript -w @hanyu/data
```

The Supabase version matches the one the root already uses.

- [x] **Step 3: Create the TypeScript config**

`packages/data/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true
  },
  "include": ["src"]
}
```

Note `lib` deliberately omits `DOM`. That makes the package boundary a compile
error rather than a runtime crash: `window`, `document`, and `localStorage` do
not type-check here.

- [x] **Step 4: Write the failing test**

`packages/data/src/client.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn(() => ({ auth: {} }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...(args as [])),
}));

const { createSupabaseClient } = await import('./client');

describe('createSupabaseClient', () => {
  beforeEach(() => {
    createClientMock.mockClear();
  });

  it('throws a configuration error when the url is missing', () => {
    expect(() =>
      createSupabaseClient({ supabaseUrl: '', supabaseAnonKey: 'anon' })
    ).toThrow(/Supabase is not configured/);
  });

  it('throws a configuration error when the anon key is missing', () => {
    expect(() =>
      createSupabaseClient({ supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: '' })
    ).toThrow(/Supabase is not configured/);
  });

  it('defaults detectSessionInUrl to false', () => {
    createSupabaseClient({ supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon' });

    const options = createClientMock.mock.calls[0][2] as { auth: Record<string, unknown> };
    expect(options.auth.detectSessionInUrl).toBe(false);
    expect(options.auth.persistSession).toBe(true);
    expect(options.auth.autoRefreshToken).toBe(true);
  });

  it('forwards the injected storage and detectSessionInUrl', () => {
    const storage = {
      getItem: async () => null,
      setItem: async () => undefined,
      removeItem: async () => undefined,
    };

    createSupabaseClient({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon',
      storage,
      detectSessionInUrl: true,
    });

    const options = createClientMock.mock.calls[0][2] as { auth: Record<string, unknown> };
    expect(options.auth.storage).toBe(storage);
    expect(options.auth.detectSessionInUrl).toBe(true);
  });
});
```

- [x] **Step 5: Run the test to verify it fails**

Run: `npx vitest run packages/data/src/client.test.ts`
Expected: FAIL — cannot resolve `./client`.

- [x] **Step 6: Write the implementation**

`packages/data/src/client.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SessionStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export interface HanyuDataConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  storage?: SessionStorage;
  detectSessionInUrl?: boolean;
  passwordResetRedirectTo?: string;
}

export function createSupabaseClient(config: HanyuDataConfig): SupabaseClient {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. Provide supabaseUrl and supabaseAnonKey to createHanyuData.'
    );
  }

  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: config.detectSessionInUrl ?? false,
      ...(config.storage ? { storage: config.storage as never } : {}),
    },
  });
}
```

`packages/data/src/index.ts`:

```ts
export { createSupabaseClient } from './client';
export type { HanyuDataConfig, SessionStorage } from './client';
```

- [x] **Step 7: Run the test and the type check**

Run: `npx vitest run packages/data/src/client.test.ts`
Expected: PASS, 4 tests.

Run: `npm run typecheck -w @hanyu/data`
Expected: no output, exit code 0.

- [x] **Step 8: Commit (Skipped per instruction)**

```bash
git add packages/data package.json package-lock.json
git commit -m "feat: add @hanyu/data package with injected Supabase configuration"
```

---

### Task 3: Move the repositories and auth into `packages/data`

**Files:**
- Move: `apps/web/src/services/repositories/{shared,words,grammar,flashcards,exercises,readings,settings,stats,today}.js` → `packages/data/src/repositories/*.ts`
- Move: `apps/web/src/services/auth.js` → `packages/data/src/auth.ts`
- Create: `packages/data/src/pure/dates.ts`
- Create: `packages/data/src/factory.ts`
- Create: `packages/data/src/factory.test.ts`
- Modify: `packages/data/src/index.ts`
- Delete: `apps/web/src/services/supabaseClient.js`
- Rewrite: `apps/web/src/services/api.js`
- Create: `apps/web/src/services/auth.js` (thin re-export, replacing the moved file)
- Modify: `apps/web/vite.config.js`

**Interfaces:**
- Consumes: `createSupabaseClient`, `HanyuDataConfig` from Task 2.
- Produces: `createHanyuData(config: HanyuDataConfig): HanyuData`. `HanyuData`
  has `client` plus these namespaces and methods, each already bound to the
  client:
  - `auth`: `getSession()`, `signIn({ email, password })`, `signUp({ email, password })`, `sendPasswordReset(email)`, `signOut()`, `subscribeToAuthChanges(onChange)`
  - `words`: `getWords(params)`, `getWord(id)`
  - `grammar`: `getGrammar(level)`, `getGrammarPoint(level, id)`
  - `flashcards`: `getDueCards(limit)`, `reviewCard(id, quality, timeMs)`, `addCard(wordId)`, `createStarterDeck(input)`, `getFlashcardStats()`
  - `exercises`: `generateExercise(type, level)`, `checkExercise(id, answer)`, `getExerciseHistory(limit)`
  - `readings`: `getReadings(params)`, `getReading(id)`, `generateReading(level, format)`, `completeReading(id, answers)`
  - `settings`: `getSettings()`, `updateSettings(input)`
  - `stats`: `getDashboard()`, `getStreak()`, `logTime(ms)`
  - `today`: `getToday()`

- [x] **Step 1: Move the files with git**

```bash
mkdir -p packages/data/src/repositories packages/data/src/pure
for f in shared words grammar flashcards exercises readings settings stats today; do
  git mv "apps/web/src/services/repositories/$f.js" "packages/data/src/repositories/$f.ts"
done
git mv apps/web/src/services/auth.js packages/data/src/auth.ts
git rm apps/web/src/services/supabaseClient.js
rmdir apps/web/src/services/repositories
```

- [x] **Step 2: Extract the pure date helper**

Create `packages/data/src/pure/dates.ts`:

```ts
export function toDateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
```

In `packages/data/src/repositories/shared.ts`, delete the local
`toDateString` function and add a re-export at the top of the file so existing
importers keep working:

```ts
export { toDateString } from '../pure/dates';
```

- [x] **Step 3: Convert every repository signature to an injected client**

In each moved file, delete the import line
`import { getSupabaseClient } from '../supabaseClient';` (in `auth.ts` it is
`from './supabaseClient'`) and add:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
```

Then replace each signature exactly as listed. These are all of them:

`repositories/words.ts`:

```ts
export async function getWords(params: Record<string, unknown> = {}, client: SupabaseClient) {
export async function getWord(id: number | string, client: SupabaseClient) {
```

`repositories/grammar.ts`:

```ts
export async function getGrammar(level: number | string, client: SupabaseClient) {
export async function getGrammarPoint(level: number | string, id: number | string, client: SupabaseClient) {
```

`repositories/flashcards.ts`:

```ts
export async function getDueCards(limit: number = 50, client: SupabaseClient) {
export async function reviewCard(id: string, quality: number, timeMs: number | null, client: SupabaseClient) {
export async function addCard(wordId: number | string, client: SupabaseClient) {
export async function createStarterDeck(input: { strategy?: string; limit?: number } = {}, client: SupabaseClient) {
export async function getFlashcardStats(client: SupabaseClient) {
```

`repositories/exercises.ts`:

```ts
export async function generateExercise(type: string, level: number, client: SupabaseClient) {
export async function checkExercise(id: string, answer: unknown, client: SupabaseClient) {
export async function getExerciseHistory(limit: number = 20, client: SupabaseClient) {
```

`repositories/readings.ts`:

```ts
export async function getReadings(params: Record<string, unknown> = {}, client: SupabaseClient) {
export async function getReading(id: string, client: SupabaseClient) {
export async function generateReading(level: number, format: string, client: SupabaseClient) {
export async function completeReading(id: string, answers: unknown, client: SupabaseClient) {
```

`repositories/settings.ts`:

```ts
export async function getSettings(client: SupabaseClient) {
export async function updateSettings(input: Record<string, unknown>, client: SupabaseClient) {
```

`repositories/stats.ts`:

```ts
export async function getDashboard(client: SupabaseClient) {
export async function getStreak(client: SupabaseClient) {
export async function logTime(ms: number, client: SupabaseClient) {
```

`repositories/today.ts`:

```ts
export async function getToday(client: SupabaseClient) {
```

`auth.ts`:

```ts
export async function getSession(client: SupabaseClient) {
export async function signIn({ email, password }: { email: string; password: string }, client: SupabaseClient) {
export async function signUp({ email, password }: { email: string; password: string }, client: SupabaseClient) {
export async function sendPasswordReset(email: string, client: SupabaseClient, redirectTo?: string) {
export async function signOut(client: SupabaseClient) {
export function subscribeToAuthChanges(
  onChange: (payload: { event: string; session: unknown }) => void,
  client: SupabaseClient
) {
```

Internal calls between modules must now pass the client explicitly. There are
four of them:

- `repositories/today.ts` calls `getSettings(client)` — already passes `client`, no change.
- `repositories/flashcards.ts` in `getDueCards` calls `getSettings(client)` — no change.
- `repositories/stats.ts` in `getDashboard` calls `getFlashcardStats(client)` and `getStreak(client)` — no change.
- `repositories/stats.ts` in `logTime` calls `getRequiredUserId(client)` — no change.

In `auth.ts`, `sendPasswordReset` must stop reading the browser location.
Replace its body's first two lines with:

```ts
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
```

Delete the `const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;`
line. The value now arrives as a parameter.

Where a Supabase row is mapped inside a function body and TypeScript reports an
implicit `any`, annotate the parameter as `any` — for example
`function mapCardRow(row: any)` and `(row: any) => ...` in the `.map` and
`for (const row of ...)` loops. Task 5 replaces these with generated row types.
Do not change any logic.

- [x] **Step 4: Write the failing factory test**

`packages/data/src/factory.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakeClient = { auth: {} };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => fakeClient,
}));

const getTodayMock = vi.fn(async () => ({ ok: true }));
const sendPasswordResetMock = vi.fn(async () => undefined);

vi.mock('./repositories/today', () => ({
  getToday: (client: unknown) => getTodayMock(client as never),
}));

vi.mock('./auth', () => ({
  getSession: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  subscribeToAuthChanges: vi.fn(),
  sendPasswordReset: (email: string, client: unknown, redirectTo?: string) =>
    sendPasswordResetMock(email as never, client as never, redirectTo as never),
}));

const { createHanyuData } = await import('./factory');

const config = { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon' };

describe('createHanyuData', () => {
  beforeEach(() => {
    getTodayMock.mockClear();
    sendPasswordResetMock.mockClear();
  });

  it('binds the created client to every repository call', async () => {
    const data = createHanyuData(config);

    await data.today.getToday();

    expect(getTodayMock).toHaveBeenCalledWith(fakeClient);
  });

  it('injects the configured password reset redirect', async () => {
    const data = createHanyuData({ ...config, passwordResetRedirectTo: 'https://hanyu.app' });

    await data.auth.sendPasswordReset('learner@example.com');

    expect(sendPasswordResetMock).toHaveBeenCalledWith(
      'learner@example.com',
      fakeClient,
      'https://hanyu.app'
    );
  });

  it('exposes the whole repository surface', () => {
    const data = createHanyuData(config);

    expect(Object.keys(data).sort()).toEqual(
      ['auth', 'client', 'exercises', 'flashcards', 'grammar', 'readings', 'settings', 'stats', 'today', 'words'].sort()
    );
  });
});
```

- [x] **Step 5: Run the test to verify it fails**

Run: `npx vitest run packages/data/src/factory.test.ts`
Expected: FAIL — cannot resolve `./factory`.

- [x] **Step 6: Write the factory**

`packages/data/src/factory.ts`:

```ts
import { createSupabaseClient, type HanyuDataConfig } from './client';
import {
  getSession,
  sendPasswordReset,
  signIn,
  signOut,
  signUp,
  subscribeToAuthChanges,
} from './auth';
import { getGrammar, getGrammarPoint } from './repositories/grammar';
import {
  addCard,
  createStarterDeck,
  getDueCards,
  getFlashcardStats,
  reviewCard,
} from './repositories/flashcards';
import { checkExercise, generateExercise, getExerciseHistory } from './repositories/exercises';
import {
  completeReading,
  generateReading,
  getReading,
  getReadings,
} from './repositories/readings';
import { getSettings, updateSettings } from './repositories/settings';
import { getDashboard, getStreak, logTime } from './repositories/stats';
import { getToday } from './repositories/today';
import { getWord, getWords } from './repositories/words';

export function createHanyuData(config: HanyuDataConfig) {
  const client = createSupabaseClient(config);
  const redirectTo = config.passwordResetRedirectTo;

  return {
    client,
    auth: {
      getSession: () => getSession(client),
      signIn: (input: { email: string; password: string }) => signIn(input, client),
      signUp: (input: { email: string; password: string }) => signUp(input, client),
      sendPasswordReset: (email: string) => sendPasswordReset(email, client, redirectTo),
      signOut: () => signOut(client),
      subscribeToAuthChanges: (
        onChange: (payload: { event: string; session: unknown }) => void
      ) => subscribeToAuthChanges(onChange, client),
    },
    words: {
      getWords: (params: Record<string, unknown> = {}) => getWords(params, client),
      getWord: (id: number | string) => getWord(id, client),
    },
    grammar: {
      getGrammar: (level: number | string) => getGrammar(level, client),
      getGrammarPoint: (level: number | string, id: number | string) =>
        getGrammarPoint(level, id, client),
    },
    flashcards: {
      getDueCards: (limit = 50) => getDueCards(limit, client),
      reviewCard: (id: string, quality: number, timeMs: number | null) =>
        reviewCard(id, quality, timeMs, client),
      addCard: (wordId: number | string) => addCard(wordId, client),
      createStarterDeck: (input: { strategy?: string; limit?: number } = {}) =>
        createStarterDeck(input, client),
      getFlashcardStats: () => getFlashcardStats(client),
    },
    exercises: {
      generateExercise: (type: string, level: number) => generateExercise(type, level, client),
      checkExercise: (id: string, answer: unknown) => checkExercise(id, answer, client),
      getExerciseHistory: (limit = 20) => getExerciseHistory(limit, client),
    },
    readings: {
      getReadings: (params: Record<string, unknown> = {}) => getReadings(params, client),
      getReading: (id: string) => getReading(id, client),
      generateReading: (level: number, format: string) => generateReading(level, format, client),
      completeReading: (id: string, answers: unknown) => completeReading(id, answers, client),
    },
    settings: {
      getSettings: () => getSettings(client),
      updateSettings: (input: Record<string, unknown>) => updateSettings(input, client),
    },
    stats: {
      getDashboard: () => getDashboard(client),
      getStreak: () => getStreak(client),
      logTime: (ms: number) => logTime(ms, client),
    },
    today: {
      getToday: () => getToday(client),
    },
  };
}

export type HanyuData = ReturnType<typeof createHanyuData>;
```

Replace `packages/data/src/index.ts`:

```ts
export { createSupabaseClient } from './client';
export type { HanyuDataConfig, SessionStorage } from './client';
export { createHanyuData } from './factory';
export type { HanyuData } from './factory';
```

- [x] **Step 7: Run the test to verify it passes**

Run: `npx vitest run packages/data/src/factory.test.ts`
Expected: PASS, 3 tests.

Run: `npm run typecheck -w @hanyu/data`
Expected: exit code 0.

- [x] **Step 8: Rewire the web adapter**

Add the workspace dependency to `apps/web/package.json` dependencies:

```json
    "@hanyu/data": "*",
```

Run: `npm install`

Replace `apps/web/src/services/api.js` entirely:

```js
import { createHanyuData } from '@hanyu/data';

let cached = null;

function data() {
  if (!cached) {
    cached = createHanyuData({
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      detectSessionInUrl: true,
      passwordResetRedirectTo:
        typeof window !== 'undefined' ? window.location.origin : undefined,
    });
  }

  return cached;
}

export const api = {
  getWords: (params = {}) => data().words.getWords(params),
  getWord: (id) => data().words.getWord(id),
  getGrammar: (level) => data().grammar.getGrammar(level),
  getGrammarPoint: (level, id) => data().grammar.getGrammarPoint(level, id),
  getDueCards: (limit = 50) => data().flashcards.getDueCards(limit),
  reviewCard: (id, quality, timeMs) => data().flashcards.reviewCard(id, quality, timeMs),
  addCard: (wordId) => data().flashcards.addCard(wordId),
  createStarterDeck: (input = {}) => data().flashcards.createStarterDeck(input),
  getFlashcardStats: () => data().flashcards.getFlashcardStats(),
  generateExercise: (type, level) => data().exercises.generateExercise(type, level),
  checkExercise: (id, answer) => data().exercises.checkExercise(id, answer),
  getExerciseHistory: (limit) => data().exercises.getExerciseHistory(limit),
  getReadings: (params = {}) => data().readings.getReadings(params),
  getReading: (id) => data().readings.getReading(id),
  generateReading: (level, format) => data().readings.generateReading(level, format),
  completeReading: (id, answers) => data().readings.completeReading(id, answers),
  getToday: () => data().today.getToday(),
  getDashboard: () => data().stats.getDashboard(),
  getStreak: () => data().stats.getStreak(),
  logTime: (ms) => data().stats.logTime(ms),
  getSettings: () => data().settings.getSettings(),
  updateSettings: (input) => data().settings.updateSettings(input),
};

export const authApi = {
  getSession: () => data().auth.getSession(),
  signIn: (input) => data().auth.signIn(input),
  signUp: (input) => data().auth.signUp(input),
  sendPasswordReset: (email) => data().auth.sendPasswordReset(email),
  signOut: () => data().auth.signOut(),
  subscribeToAuthChanges: (onChange) => data().auth.subscribeToAuthChanges(onChange),
};
```

The client is created lazily on first use, matching the previous behaviour where
`getSupabaseClient()` threw only when a call was made.

Create `apps/web/src/services/auth.js` with the same named exports the web
already imports, so `App.jsx` and `pages/Auth.jsx` do not change:

```js
import { authApi } from './api';

export const getSession = () => authApi.getSession();
export const signIn = (input) => authApi.signIn(input);
export const signUp = (input) => authApi.signUp(input);
export const sendPasswordReset = (email) => authApi.sendPasswordReset(email);
export const signOut = () => authApi.signOut();
export const subscribeToAuthChanges = (onChange) => authApi.subscribeToAuthChanges(onChange);
```

- [x] **Step 9: Let Vite handle the linked TypeScript package**

In `apps/web/vite.config.js`, add `optimizeDeps` so the dev server does not try
to pre-bundle the workspace source:

```js
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['@hanyu/data'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
```

- [x] **Step 10: Run the full suite**

Run: `npm test`
Expected: every previously passing test still passes, with no changes to any
`apps/web` test file. `git status` must show zero modified files under
`apps/web/src/**/*.test.jsx`.

Run: `npm run build`
Expected: the build succeeds, proving Vite transpiles the linked TypeScript
package.

- [x] **Step 11: Commit (Skipped per instruction)**

```bash
git add -A
git commit -m "refactor: move Supabase repositories and auth into @hanyu/data"
```

---

### Task 4: Add payload types and the user-facing error mapper

**Files:**
- Create: `packages/data/src/types.ts`
- Create: `packages/data/src/errors.ts`
- Create: `packages/data/src/errors.test.ts`
- Modify: `packages/data/src/index.ts`

**Interfaces:**
- Consumes: the factory from Task 3.
- Produces: `toUserMessage(error: unknown): string`, and the exported types
  `UserSettings`, `DueCard`, `DueCardsPayload`, `ReviewResult`, `StreakPayload`,
  `TodayPayload`, `FlashcardStats`. These are the exact shapes the current
  repositories already return, transcribed as types; the mobile screens in
  Tasks 9 to 12 consume them.

- [x] **Step 1: Write the payload types**

`packages/data/src/types.ts`:

```ts
export type ThemePreference = 'light' | 'dark' | 'system';
export type CardOrder = 'due' | 'frequency';
export type AiProvider = 'none' | 'deepseek' | 'gemini';
export type CardStatus = 'new' | 'learning' | 'review' | 'mastered';

export interface UserSettings {
  user_id: string;
  theme: ThemePreference;
  current_level: number;
  cards_per_day: number;
  max_reviews_per_session: number;
  card_order: CardOrder;
  ai_provider: AiProvider;
  created_at?: string;
  updated_at?: string;
}

export interface DueCard {
  id: string;
  user_id: string;
  word_id: number;
  ease_factor: number;
  interval: number;
  interval_days: number;
  repetitions: number;
  next_review: string;
  next_review_at: string;
  last_review: string | null;
  last_reviewed_at: string | null;
  status: CardStatus;
  hanzi?: string;
  pinyin?: string;
  meaning_en?: string;
  meaning_es?: string | null;
  hsk_level?: number;
  pos?: string | null;
  frequency?: number | null;
}

export interface DueCardsPayload {
  cards: DueCard[];
  total: number;
  deck_size: number;
}

export interface ReviewResult {
  card_id: string;
  interval: number;
  next_review: string | null;
  ease_factor: number | null;
  status: CardStatus | null;
}

export interface StarterDeckResult {
  inserted?: number;
  deck_size?: number;
}

export interface FlashcardStats {
  total: number;
  due: number;
  by_status: Partial<Record<CardStatus, number>>;
  by_level: Record<string, number>;
}

export interface StreakPayload {
  current: number;
  longest: number;
}

export interface TodayPayload {
  profile: {
    current_level: number;
    mode: string;
  };
  flashcards: {
    deck_size: number;
    due: number;
    target: number;
    completed: number;
  };
  exercises: {
    target: number;
    completed: number;
  };
  reading: {
    target: number;
    completed: number;
    level: number;
    next: { id: string; title: string; hsk_level: number; format: string } | null;
  };
  progress: {
    completed_blocks: number;
    total_blocks: number;
  };
}
```

- [x] **Step 2: Write the failing error mapper test**

`packages/data/src/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { toUserMessage } from './errors';

describe('toUserMessage', () => {
  it('asks the user to sign in again on 401', () => {
    expect(toUserMessage({ status: 401, message: 'JWT expired' })).toBe(
      'Your session expired. Sign in again to continue.'
    );
  });

  it('reports a permission problem on 403', () => {
    expect(toUserMessage({ status: 403, message: 'permission denied' })).toBe(
      'You do not have access to that data.'
    );
  });

  it('reports a connection problem for network failures', () => {
    expect(toUserMessage(new TypeError('Network request failed'))).toBe(
      'No connection. Check your network and try again.'
    );
  });

  it('passes through a specific Supabase message', () => {
    expect(toUserMessage({ message: 'Failed to load due cards' })).toBe(
      'Failed to load due cards'
    );
  });

  it('falls back to a generic message for unknown values', () => {
    expect(toUserMessage(null)).toBe('Something went wrong. Please try again.');
    expect(toUserMessage({})).toBe('Something went wrong. Please try again.');
  });
});
```

- [x] **Step 3: Run the test to verify it fails**

Run: `npx vitest run packages/data/src/errors.test.ts`
Expected: FAIL — cannot resolve `./errors`.

- [x] **Step 4: Write the implementation**

`packages/data/src/errors.ts`:

```ts
const GENERIC = 'Something went wrong. Please try again.';

interface MaybeRepositoryError {
  status?: number;
  code?: string;
  message?: string;
}

export function toUserMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return GENERIC;
  }

  const { status, message } = error as MaybeRepositoryError;

  if (status === 401) {
    return 'Your session expired. Sign in again to continue.';
  }

  if (status === 403) {
    return 'You do not have access to that data.';
  }

  if (message && /network|fetch failed|failed to fetch/i.test(message)) {
    return 'No connection. Check your network and try again.';
  }

  return message || GENERIC;
}
```

- [x] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/data/src/errors.test.ts`
Expected: PASS, 5 tests.

- [x] **Step 6: Export the new surface**

Append to `packages/data/src/index.ts`:

```ts
export { toUserMessage } from './errors';
export type {
  AiProvider,
  CardOrder,
  CardStatus,
  DueCard,
  DueCardsPayload,
  FlashcardStats,
  ReviewResult,
  StarterDeckResult,
  StreakPayload,
  ThemePreference,
  TodayPayload,
  UserSettings,
} from './types';
```

- [x] **Step 7: Run the suite and the type check, then commit (Skipped commit per instruction)**

Run: `npm test`
Expected: all pass.

Run: `npm run typecheck -w @hanyu/data`
Expected: exit code 0.

```bash
git add packages/data
git commit -m "feat: add payload types and user-facing error mapper to @hanyu/data"
```

---

### Task 5: Generate database types and apply them to the daily-loop modules

**Files:**
- Create: `packages/data/src/database.types.ts` (generated, committed)
- Modify: `package.json` (root) — add the `gen:types` script
- Modify: `packages/data/src/client.ts`
- Modify: `packages/data/src/repositories/{flashcards,settings,stats,today}.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `createSupabaseClient` from Task 2.
- Produces: `SupabaseClient<Database>` as the client type across the package, and
  the exported `Database` type. Row types are used as
  `Database['public']['Tables']['srs_cards']['Row']`.

This is the only task in P1 that needs network access to the Supabase project.

- [x] **Step 1: Add the generation script**

In root `package.json` scripts:

```json
    "gen:types": "supabase gen types typescript --linked > packages/data/src/database.types.ts",
```

- [x] **Step 2: Generate the types**

```bash
npm run supabase:link
npm run gen:types
```

Expected: `packages/data/src/database.types.ts` contains `export type Database`
with the tables `profiles`, `user_settings`, `words`, `grammar_points`,
`srs_cards`, `review_log`, `user_stats`, `generated_exercises`,
`exercise_attempts`, `generated_readings`, `reading_attempts`.

Verify: `grep -c "srs_cards" packages/data/src/database.types.ts` returns at
least 1.

- [x] **Step 3: Type the client generically**

In `packages/data/src/client.ts`, change the import and the return type:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type HanyuClient = SupabaseClient<Database>;
```

and change the function signature to:

```ts
export function createSupabaseClient(config: HanyuDataConfig): HanyuClient {
```

- [x] **Step 4: Use the typed client everywhere and real row types in the daily loop**

First, in all nine `repositories/*.ts` files and in `auth.ts`, replace the
parameter type `client: SupabaseClient` with `client: HanyuClient` and swap the
import for `import type { HanyuClient } from '../client';` (`'./client'` in
`auth.ts`). This must be done in every file, not only the daily-loop ones:
`SupabaseClient<Database>` is not freely assignable to the default
`SupabaseClient`, so a partial migration produces type errors at the factory.

Then, only in `repositories/flashcards.ts`, `repositories/settings.ts`,
`repositories/stats.ts`, and `repositories/today.ts`, replace the `any`
annotations added in Task 3 with generated row types:

```ts
type SrsCardRow = Database['public']['Tables']['srs_cards']['Row'] & {
  words?: Database['public']['Tables']['words']['Row'] | Database['public']['Tables']['words']['Row'][] | null;
};

function mapCardRow(row: SrsCardRow) {
```

and in `repositories/stats.ts`:

```ts
type UserStatsRow = Database['public']['Tables']['user_stats']['Row'];
```

used for the `heatmap`, weekly, and all-time reduce callbacks.

`repositories/{words,grammar,exercises,readings}.ts` keep their `any` row
annotations until P2 touches those features. Mixing typed and untyped rows is
intentional: the daily loop is what mobile ships in P1.

- [x] **Step 5: Type-check and run the suite**

Run: `npm run typecheck -w @hanyu/data`
Expected: exit code 0.

Run: `npm test`
Expected: all pass, web tests unchanged.

- [x] **Step 6: Document the script and commit (Skipped commit per instruction)**

Add a row to the README scripts table: `npm run gen:types` |
`Regenera los tipos de Supabase en packages/data`.

```bash
git add -A
git commit -m "feat: generate Supabase database types and apply them to the daily loop modules"
```

---

### Task 6: Scaffold the Expo app with monorepo-aware Metro

**Files:**
- Create: `apps/mobile/` (Expo app)
- Create: `apps/mobile/metro.config.js`
- Create: `apps/mobile/jest.config.js`
- Create: `apps/mobile/src/lib/data.ts`
- Create: `apps/mobile/src/lib/data.test.ts`
- Create: `apps/mobile/.env.example`
- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/app.json`

**Interfaces:**
- Consumes: `createHanyuData` and `HanyuData` from `@hanyu/data`.
- Produces: `getData(): HanyuData` from `src/lib/data`, lazily constructed from
  `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, with
  `AsyncStorage` as session storage and `detectSessionInUrl: false`.

- [x] **Step 1: Create the Expo app**

```bash
cd apps
npx create-expo-app@latest mobile --template blank-typescript
cd ..
```

- [x] **Step 2: Rename the workspace and add the data dependency**

In `apps/mobile/package.json`, set the name and add the workspace dependency:

```json
  "name": "@hanyu/mobile",
```

```json
    "@hanyu/data": "*",
```

Add the test script:

```json
    "test": "jest"
```

Run: `npm install`
Expected: `node_modules/@hanyu/mobile` and `node_modules/@hanyu/data` symlinks
exist.

- [x] **Step 3: Install the runtime dependencies**

```bash
cd apps/mobile
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar
npx expo install @react-native-async-storage/async-storage expo-speech
npx expo install --dev jest jest-expo @testing-library/react-native
cd ../..
```

Every version comes from the Expo SDK resolver. Do not edit these versions by
hand.

- [x] **Step 4: Point the app entry at Expo Router**

In `apps/mobile/package.json`:

```json
  "main": "expo-router/entry",
```

Delete `apps/mobile/App.tsx` — Expo Router uses the `app/` directory instead.

In `apps/mobile/app.json`, inside `expo`, set the scheme and the router plugin,
and declare the native identifiers P4 will need:

```json
    "scheme": "hanyu",
    "plugins": ["expo-router"],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.hanyu.app"
    },
    "android": {
      "package": "com.hanyu.app"
    }
```

- [x] **Step 5: Configure Metro for the monorepo**

`apps/mobile/metro.config.js`:

```js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
```

Without `watchFolders`, Metro cannot read `packages/data`. Without
`nodeModulesPaths`, it cannot resolve hoisted dependencies.

- [x] **Step 6: Configure Jest**

`apps/mobile/jest.config.js`:

```js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: [],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|expo-router))',
  ],
};
```

- [x] **Step 7: Create the environment example**

`apps/mobile/.env.example`:

```text
EXPO_PUBLIC_SUPABASE_URL=https://ycchpixzhlsvivzloyvh.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

`.env` files are already covered by the root `.gitignore`.

- [x] **Step 8: Write the failing data-access test**

`apps/mobile/src/lib/data.test.ts`:

```ts
import { getData, resetData } from './data';

describe('getData', () => {
  afterEach(() => {
    resetData();
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  });

  it('throws a configuration error when the environment is empty', () => {
    expect(() => getData()).toThrow(/Supabase is not configured/);
  });

  it('exposes the daily loop repositories once configured', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon';

    const data = getData();

    expect(typeof data.today.getToday).toBe('function');
    expect(typeof data.flashcards.getDueCards).toBe('function');
    expect(typeof data.settings.updateSettings).toBe('function');
    expect(typeof data.auth.signIn).toBe('function');
  });

  it('returns the same instance on repeated calls', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon';

    expect(getData()).toBe(getData());
  });
});
```

- [x] **Step 9: Run the test to verify it fails**

Run: `npm test -w @hanyu/mobile`
Expected: FAIL — cannot resolve `./data`.

- [x] **Step 10: Write the implementation**

`apps/mobile/src/lib/data.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createHanyuData, type HanyuData } from '@hanyu/data';

let cached: HanyuData | null = null;

export function getData(): HanyuData {
  if (!cached) {
    cached = createHanyuData({
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      storage: AsyncStorage,
      detectSessionInUrl: false,
    });
  }

  return cached;
}

export function resetData(): void {
  cached = null;
}
```

- [x] **Step 11: Run the test to verify it passes**

Run: `npm test -w @hanyu/mobile`
Expected: PASS, 3 tests. This also proves Jest transforms the linked TypeScript
package.

If Jest fails asking for `react-test-renderer`, run
`npx expo install --dev react-test-renderer` inside `apps/mobile` and re-run.

- [x] **Step 12: Verify the bundler starts**

```bash
cd apps/mobile
cp .env.example .env
npx expo start --clear
```

Expected: Metro starts and prints a QR code with no resolution errors. Stop it
with `Ctrl+C`. If Metro reports it cannot find `@hanyu/data`, re-check
`metro.config.js`.

- [x] **Step 13: Commit (Skipped per instruction)**

```bash
git add -A
git commit -m "feat: scaffold Expo app with monorepo Metro config and shared data access"
```

---

### Task 7: Session provider, auth routes, and the tab shell

**Files:**
- Create: `apps/mobile/src/session/SessionProvider.tsx`
- Create: `apps/mobile/src/session/SessionProvider.test.tsx`
- Create: `apps/mobile/app/_layout.tsx`
- Create: `apps/mobile/app/index.tsx`
- Create: `apps/mobile/app/(auth)/_layout.tsx`
- Create: `apps/mobile/app/(auth)/sign-in.tsx`
- Create: `apps/mobile/app/(auth)/sign-up.tsx`
- Create: `apps/mobile/app/(auth)/forgot-password.tsx`
- Create: `apps/mobile/app/(app)/_layout.tsx`
- Create: `apps/mobile/app/(app)/today.tsx`
- Create: `apps/mobile/app/(app)/cards.tsx`
- Create: `apps/mobile/app/(app)/you.tsx`
- Create: `apps/mobile/src/screens/auth/sign-in.test.tsx`
- Create: `apps/mobile/src/screens/auth/sign-up.test.tsx`
- Create: `apps/mobile/src/screens/auth/forgot-password.test.tsx`

**Interfaces:**
- Consumes: `getData()` from Task 6.
- Produces: `SessionProvider` and `useSession(): { session: Session | null; loading: boolean; signOut(): Promise<void> }`
  from `src/session/SessionProvider`. Route groups `(auth)` and `(app)`, with
  `(app)` tabs named `today`, `cards`, and `you`.

- [x] **Step 1: Write the failing session test**

`apps/mobile/src/session/SessionProvider.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SessionProvider, useSession } from './SessionProvider';

const getSession = jest.fn();
const subscribeToAuthChanges = jest.fn(() => () => undefined);
const startAutoRefresh = jest.fn();
const stopAutoRefresh = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    auth: {
      getSession: () => getSession(),
      subscribeToAuthChanges: (handler: unknown) => subscribeToAuthChanges(handler as never),
      signOut: async () => undefined,
    },
    client: { auth: { startAutoRefresh, stopAutoRefresh } },
  }),
}));

function Probe() {
  const { session, loading } = useSession();
  return <Text>{loading ? 'loading' : session ? 'signed-in' : 'signed-out'}</Text>;
}

describe('SessionProvider', () => {
  beforeEach(() => {
    getSession.mockReset();
    startAutoRefresh.mockClear();
  });

  it('reports a signed-in session after bootstrap', async () => {
    getSession.mockResolvedValue({ user: { id: 'user-1', email: 'a@b.com' } });

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>
    );

    await waitFor(() => expect(screen.getByText('signed-in')).toBeTruthy());
  });

  it('reports signed-out when there is no session', async () => {
    getSession.mockResolvedValue(null);

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>
    );

    await waitFor(() => expect(screen.getByText('signed-out')).toBeTruthy());
  });

  it('reports signed-out when reading the session fails', async () => {
    getSession.mockRejectedValue(new Error('boom'));

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>
    );

    await waitFor(() => expect(screen.getByText('signed-out')).toBeTruthy());
  });

  it('starts token auto-refresh while the app is active', async () => {
    getSession.mockResolvedValue(null);

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>
    );

    await waitFor(() => expect(startAutoRefresh).toHaveBeenCalled());
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -w @hanyu/mobile`
Expected: FAIL — cannot resolve `./SessionProvider`.

- [x] **Step 3: Write the session provider**

`apps/mobile/src/session/SessionProvider.tsx`:

```tsx
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { getData } from '../lib/data';

type Session = { user?: { id: string; email?: string } } | null;

interface SessionValue {
  session: Session;
  loading: boolean;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue>({
  session: null,
  loading: true,
  signOut: async () => undefined,
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    const data = getData();

    data.auth
      .getSession()
      .then((active) => {
        if (!disposed) {
          setSession((active as Session) ?? null);
        }
      })
      .catch(() => {
        if (!disposed) {
          setSession(null);
        }
      })
      .finally(() => {
        if (!disposed) {
          setLoading(false);
        }
      });

    const unsubscribe = data.auth.subscribeToAuthChanges(({ session: next }) => {
      if (!disposed) {
        setSession((next as Session) ?? null);
        setLoading(false);
      }
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const auth = getData().client.auth;

    const apply = (state: AppStateStatus) => {
      if (state === 'active') {
        auth.startAutoRefresh();
      } else {
        auth.stopAutoRefresh();
      }
    };

    apply(AppState.currentState);
    const subscription = AppState.addEventListener('change', apply);

    return () => {
      subscription.remove();
      auth.stopAutoRefresh();
    };
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      session,
      loading,
      signOut: async () => {
        await getData().auth.signOut();
        setSession(null);
      },
    }),
    [session, loading]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  return useContext(SessionContext);
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npm test -w @hanyu/mobile`
Expected: PASS, 7 tests total including Task 6's.

- [x] **Step 5: Write the route tree**

`apps/mobile/app/_layout.tsx`:

```tsx
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../src/session/SessionProvider';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="auto" />
        <Slot />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
```

`apps/mobile/app/index.tsx`:

```tsx
import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/today" />;
}
```

`apps/mobile/app/(auth)/_layout.tsx`:

```tsx
import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSession } from '../../src/session/SessionProvider';

export default function AuthLayout() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (session) {
    return <Redirect href="/today" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
```

`apps/mobile/app/(app)/_layout.tsx`:

```tsx
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSession } from '../../src/session/SessionProvider';

export default function AppLayout() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="cards" options={{ title: 'Cards' }} />
      <Tabs.Screen name="you" options={{ title: 'You' }} />
    </Tabs>
  );
}
```

- [x] **Step 6: Write the auth screens**

`apps/mobile/app/(auth)/sign-in.tsx`:

```tsx
import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { toUserMessage } from '@hanyu/data';
import { getData } from '../../src/lib/data';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError('');

    try {
      await getData().auth.signIn({ email: email.trim(), password });
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Sign in to Hanyu</Text>

      <TextInput
        accessibilityLabel="Email"
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
      />
      <TextInput
        accessibilityLabel="Password"
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={styles.input}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable accessibilityRole="button" onPress={submit} disabled={busy} style={styles.button}>
        <Text style={styles.buttonLabel}>{busy ? 'Signing in...' : 'Sign in'}</Text>
      </Pressable>

      <Link href="/sign-up" style={styles.link}>
        Create an account
      </Link>
      <Link href="/forgot-password" style={styles.link}>
        Forgot your password?
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14 },
  button: { backgroundColor: '#c93624', borderRadius: 12, padding: 14, alignItems: 'center' },
  buttonLabel: { color: '#ffffff', fontWeight: '600' },
  error: { color: '#c93624' },
  link: { paddingVertical: 6, color: '#6b7280' },
});
```

`apps/mobile/app/(auth)/sign-up.tsx`:

```tsx
import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { toUserMessage } from '@hanyu/data';
import { getData } from '../../src/lib/data';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError('');

    try {
      await getData().auth.signUp({ email: email.trim(), password });
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Create your account</Text>

      <TextInput
        accessibilityLabel="Email"
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
      />
      <TextInput
        accessibilityLabel="Password"
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={styles.input}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable accessibilityRole="button" onPress={submit} disabled={busy} style={styles.button}>
        <Text style={styles.buttonLabel}>{busy ? 'Creating...' : 'Create account'}</Text>
      </Pressable>

      <Link href="/sign-in" style={styles.link}>
        I already have an account
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14 },
  button: { backgroundColor: '#c93624', borderRadius: 12, padding: 14, alignItems: 'center' },
  buttonLabel: { color: '#ffffff', fontWeight: '600' },
  error: { color: '#c93624' },
  link: { paddingVertical: 6, color: '#6b7280' },
});
```

`apps/mobile/app/(auth)/forgot-password.tsx`:

```tsx
import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { toUserMessage } from '@hanyu/data';
import { getData } from '../../src/lib/data';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError('');

    try {
      await getData().auth.sendPasswordReset(email.trim());
      setSent(true);
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Reset your password</Text>

      <TextInput
        accessibilityLabel="Email"
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {sent ? (
        <Text style={styles.notice}>Check your email. The reset link opens Hanyu on the web.</Text>
      ) : null}

      <Pressable accessibilityRole="button" onPress={submit} disabled={busy} style={styles.button}>
        <Text style={styles.buttonLabel}>{busy ? 'Sending...' : 'Send reset email'}</Text>
      </Pressable>

      <Link href="/sign-in" style={styles.link}>
        Back to sign in
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14 },
  button: { backgroundColor: '#c93624', borderRadius: 12, padding: 14, alignItems: 'center' },
  buttonLabel: { color: '#ffffff', fontWeight: '600' },
  error: { color: '#c93624' },
  notice: { color: '#6b7280' },
  link: { paddingVertical: 6, color: '#6b7280' },
});
```

These three screens use literal colors instead of the theme tokens because they
render before a session exists, and Task 8's `ThemeProvider` reads the theme from
the signed-in user's settings. They are the only screens allowed to do this.

- [x] **Step 7: Write the placeholder tab screens**

Each of `apps/mobile/app/(app)/today.tsx`, `cards.tsx`, and `you.tsx` gets a
placeholder that Tasks 9 to 12 replace:

```tsx
import { StyleSheet, Text, View } from 'react-native';

export default function Today() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Today</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '600' },
});
```

Use `Cards` and `You` for the other two files, changing the component name and
the title text accordingly.

- [x] **Step 8: Write the sign-in screen test**

`apps/mobile/src/screens/auth/sign-in.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import type { ReactNode } from 'react';
import SignIn from '../../../app/(auth)/sign-in';

const signIn = jest.fn();

jest.mock('../../lib/data', () => ({
  getData: () => ({ auth: { signIn: (input: unknown) => signIn(input as never) } }),
}));

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <Text>{children}</Text>,
}));

describe('SignIn', () => {
  beforeEach(() => signIn.mockReset());

  it('submits trimmed credentials', async () => {
    signIn.mockResolvedValue({});

    render(<SignIn />);
    fireEvent.changeText(screen.getByLabelText('Email'), '  learner@example.com ');
    fireEvent.changeText(screen.getByLabelText('Password'), 'secret123');
    fireEvent.press(screen.getByText('Sign in'));

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith({ email: 'learner@example.com', password: 'secret123' })
    );
  });

  it('shows a readable error when sign in fails', async () => {
    signIn.mockRejectedValue({ status: 400, message: 'Invalid login credentials' });

    render(<SignIn />);
    fireEvent.press(screen.getByText('Sign in'));

    await waitFor(() => expect(screen.getByText('Invalid login credentials')).toBeTruthy());
  });
});
```

- [x] **Step 9: Run the mobile suite**

Run: `npm test -w @hanyu/mobile`
Expected: PASS, 11 tests.

- [ ] **Step 10: Verify on a device or simulator (Metro verified; interactive sign-in requires user credentials)**

```bash
cd apps/mobile && npx expo start
```

Expected: the app opens on the sign-in screen. Signing in with an existing
Supabase account lands on the Today placeholder inside the tab bar. Killing and
reopening the app keeps you signed in.

- [x] **Step 11: Commit (Skipped per instruction)**

```bash
git add -A
git commit -m "feat: add mobile session provider, auth screens, and tab shell"
```

---

### Task 8: Design tokens, theme hook, and UI primitives

**Files:**
- Create: `apps/mobile/src/theme/tokens.ts`
- Create: `apps/mobile/src/theme/ThemeProvider.tsx`
- Create: `apps/mobile/src/theme/ThemeProvider.test.tsx`
- Create: `apps/mobile/src/ui/Screen.tsx`
- Create: `apps/mobile/src/ui/Card.tsx`
- Create: `apps/mobile/src/ui/Button.tsx`
- Create: `apps/mobile/src/ui/Badge.tsx`
- Create: `apps/mobile/src/ui/EmptyState.tsx`
- Create: `apps/mobile/src/ui/ErrorBanner.tsx`
- Create: `apps/mobile/src/ui/ErrorBanner.test.tsx`
- Modify: `apps/mobile/app/_layout.tsx`

**Interfaces:**
- Consumes: `useSession` from Task 7, `UserSettings` and `ThemePreference` from Task 4.
- Produces: `tokens` with `colors.light`, `colors.dark`, `spacing`, `radius`,
  `fontSize`; `ThemeProvider`; `useTheme(): { scheme: 'light' | 'dark'; colors: ThemeColors; preference: ThemePreference; setPreference(p: ThemePreference): void }`;
  and the primitives `Screen`, `Card`, `Button`, `Badge`, `EmptyState`,
  `ErrorBanner`. `ErrorBanner` props: `{ message: string; onRetry?: () => void }`.

- [x] **Step 1: Write the tokens**

`apps/mobile/src/theme/tokens.ts`. The neutral values come from
`apps/web/src/styles/theme.css`; the accents are adjusted per color scheme so
small text and primary controls meet WCAG AA contrast.

```ts
const light = {
  bg: '#ffffff',
  surface: '#f9fafb',
  text: '#111827',
  textMuted: '#6b7280',
  border: '#e5e7eb',
  vermilion: '#c93624',
  gold: '#946d00',
  onAccent: '#ffffff',
};

const dark = {
  bg: '#0f172a',
  surface: '#1e293b',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  border: '#334155',
  vermilion: '#ff7664',
  gold: '#e5b93f',
  onAccent: '#0f172a',
};

export type ThemeColors = typeof light;

export const tokens = {
  colors: { light, dark },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 },
  fontSize: { xs: 12, sm: 14, md: 16, lg: 20, xl: 28, hanzi: 44 },
};
```

The accent pairs are deliberately different between themes: using the same
vermilion and gold in both modes left primary labels and pinyin below AA
contrast. `onAccent` keeps button foregrounds explicit and testable.

- [x] **Step 2: Write the failing theme test**

`apps/mobile/src/theme/ThemeProvider.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ThemeProvider, useTheme } from './ThemeProvider';

const getSettings = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({ settings: { getSettings: () => getSettings() } }),
}));

jest.mock('react-native/Libraries/Utilities/Appearance', () => ({
  getColorScheme: () => 'dark',
  addChangeListener: () => ({ remove: () => undefined }),
}));

function Probe() {
  const { scheme, colors } = useTheme();
  return <Text>{`${scheme}:${colors.bg}`}</Text>;
}

describe('useTheme', () => {
  beforeEach(() => getSettings.mockReset());

  it('uses the stored preference', async () => {
    getSettings.mockResolvedValue({ theme: 'dark' });

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    await waitFor(() => expect(screen.getByText('dark:#0f172a')).toBeTruthy());
  });

  it('falls back to light when settings cannot be read', async () => {
    getSettings.mockRejectedValue(new Error('offline'));

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    await waitFor(() => expect(screen.getByText('light:#ffffff')).toBeTruthy());
  });

  it('resolves the system preference through Appearance', async () => {
    getSettings.mockResolvedValue({ theme: 'system' });

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    await waitFor(() => expect(screen.getByText('dark:#0f172a')).toBeTruthy());
  });
});
```

- [x] **Step 3: Run the test to verify it fails**

Run: `npm test -w @hanyu/mobile`
Expected: FAIL — cannot resolve `./ThemeProvider`.

- [x] **Step 4: Write the theme provider**

`apps/mobile/src/theme/ThemeProvider.tsx`:

```tsx
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance } from 'react-native';
import type { ThemePreference } from '@hanyu/data';
import { getData } from '../lib/data';
import { tokens, type ThemeColors } from './tokens';

interface ThemeValue {
  scheme: 'light' | 'dark';
  colors: ThemeColors;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeValue>({
  scheme: 'light',
  colors: tokens.colors.light,
  preference: 'light',
  setPreference: () => undefined,
});

function resolve(preference: ThemePreference, system: 'light' | 'dark'): 'light' | 'dark' {
  return preference === 'system' ? system : preference;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>('light');
  const [system, setSystem] = useState<'light' | 'dark'>(
    Appearance.getColorScheme() === 'dark' ? 'dark' : 'light'
  );

  useEffect(() => {
    let disposed = false;

    getData()
      .settings.getSettings()
      .then((settings) => {
        if (!disposed && settings?.theme) {
          setPreference(settings.theme as ThemePreference);
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystem(colorScheme === 'dark' ? 'dark' : 'light');
    });

    return () => subscription.remove();
  }, []);

  const scheme = resolve(preference, system);

  const value = useMemo<ThemeValue>(
    () => ({ scheme, colors: tokens.colors[scheme], preference, setPreference }),
    [scheme, preference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
```

- [x] **Step 5: Write the primitives**

`apps/mobile/src/ui/Screen.tsx`:

```tsx
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const style = [
    styles.base,
    { backgroundColor: colors.bg, paddingTop: insets.top + tokens.spacing.lg },
  ];

  if (!scroll) {
    return <View style={style}>{children}</View>;
  }

  return <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={style}>{children}</ScrollView>;
}

const styles = StyleSheet.create({
  base: {
    flexGrow: 1,
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xxl,
    gap: tokens.spacing.md,
  },
});
```

`apps/mobile/src/ui/Card.tsx`:

```tsx
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

export function Card({ children }: { children: ReactNode }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
});
```

`apps/mobile/src/ui/Button.tsx`:

```tsx
import { Pressable, StyleSheet, Text } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

export function Button({ label, onPress, variant = 'primary', disabled = false }: ButtonProps) {
  const { colors } = useTheme();
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        {
          backgroundColor: isPrimary ? colors.vermilion : colors.surface,
          borderColor: isPrimary ? colors.vermilion : colors.border,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Text style={[styles.label, { color: isPrimary ? '#ffffff' : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
    alignItems: 'center',
  },
  label: { fontSize: tokens.fontSize.md, fontWeight: '600' },
});
```

`apps/mobile/src/ui/Badge.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

export function Badge({ label }: { label: string }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.badge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: tokens.radius.pill,
    paddingVertical: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.md,
  },
  label: { fontSize: tokens.fontSize.xs, fontWeight: '600' },
});
```

`apps/mobile/src/ui/EmptyState.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';

interface EmptyStateProps {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
}

export function EmptyState({ title, body, actionLabel, onAction, actionDisabled }: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.wrapper, { borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>{body}</Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} disabled={actionDisabled} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.xl,
    gap: tokens.spacing.md,
    alignItems: 'center',
  },
  title: { fontSize: tokens.fontSize.lg, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: tokens.fontSize.sm, textAlign: 'center' },
});
```

- [x] **Step 6: Write the failing ErrorBanner test**

`apps/mobile/src/ui/ErrorBanner.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ErrorBanner } from './ErrorBanner';

jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({
    scheme: 'light',
    colors: {
      bg: '#ffffff',
      surface: '#f9fafb',
      text: '#111827',
      textMuted: '#6b7280',
      border: '#e5e7eb',
      vermilion: '#c93624',
      gold: '#946d00',
      onAccent: '#ffffff',
    },
  }),
}));

describe('ErrorBanner', () => {
  it('shows the message', () => {
    render(<ErrorBanner message="Failed to load due cards" />);
    expect(screen.getByText('Failed to load due cards')).toBeTruthy();
  });

  it('calls onRetry when the retry button is pressed', () => {
    const onRetry = jest.fn();

    render(<ErrorBanner message="No connection." onRetry={onRetry} />);
    fireEvent.press(screen.getByText('Try again'));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('hides the retry button when no handler is given', () => {
    render(<ErrorBanner message="No connection." />);
    expect(screen.queryByText('Try again')).toBeNull();
  });
});
```

- [x] **Step 7: Run the test to verify it fails**

Run: `npm test -w @hanyu/mobile`
Expected: FAIL — cannot resolve `./ErrorBanner`.

- [x] **Step 8: Write ErrorBanner**

`apps/mobile/src/ui/ErrorBanner.tsx`:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.banner, { borderColor: colors.vermilion, backgroundColor: colors.surface }]}>
      <Text style={[styles.message, { color: colors.text }]}>{message}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry}>
          <Text style={[styles.retry, { color: colors.vermilion }]}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  message: { fontSize: tokens.fontSize.sm },
  retry: { fontSize: tokens.fontSize.sm, fontWeight: '700' },
});
```

- [x] **Step 9: Mount the ThemeProvider**

In `apps/mobile/app/_layout.tsx`, wrap the router slot, inside `SessionProvider`
so the theme can read settings for a signed-in user:

```tsx
      <SessionProvider>
        <ThemeProvider>
          <StatusBar style="auto" />
          <Slot />
        </ThemeProvider>
      </SessionProvider>
```

Add the import `import { ThemeProvider } from '../src/theme/ThemeProvider';`.

- [x] **Step 10: Run the mobile suite and commit (Skipped commit per instruction)**

Run: `npm test -w @hanyu/mobile`
Expected: PASS, 18 tests.

```bash
git add -A
git commit -m "feat: add mobile design tokens, theme provider, and UI primitives"
```

---

### Task 9: Today screen

**Files:**
- Create: `apps/mobile/src/screens/TodayScreen.tsx`
- Create: `apps/mobile/src/screens/TodayScreen.test.tsx`
- Create: `apps/mobile/src/ui/StatusBarChart.tsx`
- Modify: `apps/mobile/app/(app)/today.tsx`

**Interfaces:**
- Consumes: `getData()`, `toUserMessage`, `TodayPayload`, `StreakPayload`,
  `FlashcardStats`, the primitives from Task 8.
- Produces: `TodayScreen` (default export from `src/screens/TodayScreen`), and
  `StatusBarChart({ byStatus, total })` which renders one proportional segment
  per SRS status using `View` widths.

- [x] **Step 1: Write the failing test**

`apps/mobile/src/screens/TodayScreen.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import TodayScreen from './TodayScreen';

const getToday = jest.fn();
const getDashboard = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    today: { getToday: () => getToday() },
    stats: { getDashboard: () => getDashboard() },
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const payload = {
  profile: { current_level: 2, mode: 'hsk2_consolidation' },
  flashcards: { deck_size: 150, due: 18, target: 20, completed: 2 },
  exercises: { target: 5, completed: 0 },
  reading: { target: 1, completed: 0, level: 2, next: { id: 'r1', title: 'Cafe', hsk_level: 2, format: 'story' } },
  progress: { completed_blocks: 1, total_blocks: 3 },
};

const dashboard = {
  streak: { current: 12, longest: 30 },
  cards: { total: 150, due: 18, by_status: { new: 100, learning: 30, review: 20 } },
};

describe('TodayScreen', () => {
  beforeEach(() => {
    getToday.mockReset();
    getDashboard.mockReset();
  });

  it('shows the streak, due count, and block progress', async () => {
    getToday.mockResolvedValue(payload);
    getDashboard.mockResolvedValue(dashboard);

    render(<TodayScreen />);

    await waitFor(() => expect(screen.getByText('12 day streak')).toBeTruthy());
    expect(screen.getByText('18 cards due')).toBeTruthy();
    expect(screen.getByText('1 of 3 blocks done')).toBeTruthy();
  });

  it('renders exercises and reading as read-only progress without a suggested reading', async () => {
    getToday.mockResolvedValue(payload);
    getDashboard.mockResolvedValue(dashboard);

    render(<TodayScreen />);

    await waitFor(() => expect(screen.getByText('Exercises 0/5')).toBeTruthy());
    expect(screen.getByText('Reading 0/1')).toBeTruthy();
    expect(screen.getByText('Available on the web for now')).toBeTruthy();
    expect(screen.queryByText('Cafe')).toBeNull();
  });

  it('shows a retryable error when loading fails', async () => {
    getToday.mockRejectedValue({ message: 'Failed to load deck size' });
    getDashboard.mockResolvedValue(dashboard);

    render(<TodayScreen />);

    await waitFor(() => expect(screen.getByText('Failed to load deck size')).toBeTruthy());

    getToday.mockResolvedValue(payload);
    fireEvent.press(screen.getByText('Try again'));

    await waitFor(() => expect(screen.getByText('18 cards due')).toBeTruthy());
  });

  it('still renders when the dashboard call fails', async () => {
    getToday.mockResolvedValue(payload);
    getDashboard.mockRejectedValue(new Error('offline'));

    render(<TodayScreen />);

    await waitFor(() => expect(screen.getByText('18 cards due')).toBeTruthy());
    expect(screen.getByText('0 day streak')).toBeTruthy();
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -w @hanyu/mobile`
Expected: FAIL — cannot resolve `./TodayScreen`.

- [x] **Step 3: Write the status bar chart**

`apps/mobile/src/ui/StatusBarChart.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

const ORDER = ['new', 'learning', 'review', 'mastered'] as const;

export function StatusBarChart({
  byStatus,
  total,
}: {
  byStatus: Partial<Record<string, number>>;
  total: number;
}) {
  const { colors } = useTheme();
  const palette: Record<string, string> = {
    new: colors.vermilion,
    learning: colors.gold,
    review: colors.textMuted,
    mastered: colors.text,
  };

  if (!total) {
    return <Text style={{ color: colors.textMuted }}>No cards in your deck yet</Text>;
  }

  return (
    <View style={styles.wrapper}>
      <View style={[styles.bar, { backgroundColor: colors.border }]}>
        {ORDER.map((status) => {
          const count = byStatus[status] ?? 0;
          if (!count) {
            return null;
          }

          return (
            <View
              key={status}
              testID={`segment-${status}`}
              style={{ width: `${(count / total) * 100}%`, backgroundColor: palette[status] }}
            />
          );
        })}
      </View>

      <View style={styles.legend}>
        {ORDER.map((status) => {
          const count = byStatus[status] ?? 0;
          if (!count) {
            return null;
          }

          return (
            <Text key={status} style={[styles.legendItem, { color: colors.textMuted }]}>
              {`${status} ${count}`}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: tokens.spacing.sm },
  bar: { flexDirection: 'row', height: 10, borderRadius: tokens.radius.pill, overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.md },
  legendItem: { fontSize: tokens.fontSize.xs },
});
```

- [x] **Step 4: Write the screen**

`apps/mobile/src/screens/TodayScreen.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { toUserMessage, type FlashcardStats, type StreakPayload, type TodayPayload } from '@hanyu/data';
import { getData } from '../lib/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorBanner } from '../ui/ErrorBanner';
import { Screen } from '../ui/Screen';
import { StatusBarChart } from '../ui/StatusBarChart';

export default function TodayScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [today, setToday] = useState<TodayPayload | null>(null);
  const [streak, setStreak] = useState<StreakPayload>({ current: 0, longest: 0 });
  const [cards, setCards] = useState<FlashcardStats['by_status']>({});
  const [cardTotal, setCardTotal] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    const data = getData();

    try {
      const payload = (await data.today.getToday()) as TodayPayload;
      setToday(payload);
    } catch (caught) {
      setError(toUserMessage(caught));
      setLoading(false);
      return;
    }

    try {
      const dashboard = (await data.stats.getDashboard()) as {
        streak: StreakPayload;
        cards: { total: number; by_status: FlashcardStats['by_status'] };
      };
      setStreak(dashboard.streak ?? { current: 0, longest: 0 });
      setCards(dashboard.cards?.by_status ?? {});
      setCardTotal(dashboard.cards?.total ?? 0);
    } catch {
      setStreak({ current: 0, longest: 0 });
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !today) {
    return (
      <Screen scroll={false}>
        <ActivityIndicator />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={[styles.heading, { color: colors.text }]}>Today</Text>
      <Badge label={`HSK${today?.profile.current_level ?? 2} consolidation`} />

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      {today ? (
        <>
          <Card>
            <Text style={[styles.metric, { color: colors.text }]}>
              {`${streak.current} day streak`}
            </Text>
            <Text style={[styles.muted, { color: colors.textMuted }]}>
              {`Longest ${streak.longest} days`}
            </Text>
            <Text style={[styles.muted, { color: colors.textMuted }]}>
              {`${today.progress.completed_blocks} of ${today.progress.total_blocks} blocks done`}
            </Text>
          </Card>

          <Card>
            <Text style={[styles.metric, { color: colors.text }]}>
              {`${today.flashcards.due} cards due`}
            </Text>
            <Text style={[styles.muted, { color: colors.textMuted }]}>
              {`Reviewed ${today.flashcards.completed} of ${today.flashcards.target} today · deck ${today.flashcards.deck_size}`}
            </Text>
            <Button label="Start review" onPress={() => router.push('/cards')} />
          </Card>

          <Card>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Deck breakdown</Text>
            <StatusBarChart byStatus={cards} total={cardTotal} />
          </Card>

          <Card>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Rest of the session</Text>
            <View style={styles.row}>
              <Text style={[styles.muted, { color: colors.textMuted }]}>
                {`Exercises ${today.exercises.completed}/${today.exercises.target}`}
              </Text>
              <Text style={[styles.muted, { color: colors.textMuted }]}>
                {`Reading ${today.reading.completed}/${today.reading.target}`}
              </Text>
            </View>
            <Text style={[styles.muted, { color: colors.textMuted }]}>
              Available on the web for now
            </Text>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: tokens.fontSize.xl, fontWeight: '700' },
  sectionTitle: { fontSize: tokens.fontSize.md, fontWeight: '600' },
  metric: { fontSize: tokens.fontSize.lg, fontWeight: '700' },
  muted: { fontSize: tokens.fontSize.sm },
  row: { flexDirection: 'row', gap: tokens.spacing.lg },
});
```

The exercise and reading counters are text only, with no press target, and the
suggested reading from the payload is deliberately not rendered.

- [x] **Step 5: Run the test to verify it passes**

Run: `npm test -w @hanyu/mobile`
Expected: PASS, 23 tests.

- [x] **Step 6: Wire the route**

Replace `apps/mobile/app/(app)/today.tsx`:

```tsx
export { default } from '../../src/screens/TodayScreen';
```

- [x] **Step 7: Commit (Skipped per instruction)**

```bash
git add -A
git commit -m "feat: add mobile Today screen with streak, due count, and deck breakdown"
```

---

### Task 10: Cards review session

**Files:**
- Create: `apps/mobile/src/screens/CardsScreen.tsx`
- Create: `apps/mobile/src/screens/CardsScreen.test.tsx`
- Create: `apps/mobile/src/ui/FlashCardView.tsx`
- Modify: `apps/mobile/app/(app)/cards.tsx`

**Interfaces:**
- Consumes: `getData()`, `toUserMessage`, `DueCard`, `DueCardsPayload`,
  `ReviewResult`, the primitives from Task 8.
- Produces: `CardsScreen` (default export from `src/screens/CardsScreen`) and
  `FlashCardView({ card, mode, revealed, onReveal, onRate })` where
  `mode: 'recognition' | 'recall' | 'listening'` and
  `onRate(quality: number)` receives 1 for Again, 3 for Hard, 4 for Good, 5 for
  Easy — the same values the web sends to `review_flashcard`.

- [x] **Step 1: Write the failing test**

`apps/mobile/src/screens/CardsScreen.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import CardsScreen from './CardsScreen';

const getDueCards = jest.fn();
const reviewCard = jest.fn();
const logTime = jest.fn();
const createStarterDeck = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    flashcards: {
      getDueCards: (limit?: number) => getDueCards(limit),
      reviewCard: (id: string, quality: number, timeMs: number | null) =>
        reviewCard(id, quality, timeMs),
      createStarterDeck: (input: unknown) => createStarterDeck(input),
    },
    stats: { logTime: (ms: number) => logTime(ms) },
  }),
}));

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));

function card(id: string, hanzi: string) {
  return {
    id,
    hanzi,
    pinyin: 'nǐ hǎo',
    meaning_en: 'hello',
    hsk_level: 1,
    status: 'review',
  };
}

describe('CardsScreen', () => {
  beforeEach(() => {
    getDueCards.mockReset();
    reviewCard.mockReset();
    logTime.mockReset();
    createStarterDeck.mockReset();
  });

  it('reveals the answer and advances to the next card after rating', async () => {
    getDueCards.mockResolvedValue({
      cards: [card('c1', '你好'), card('c2', '谢谢')],
      total: 2,
      deck_size: 2,
    });
    reviewCard.mockResolvedValue({ card_id: 'c1', next_review: '2026-08-02' });

    render(<CardsScreen />);

    await waitFor(() => expect(screen.getByText('你好')).toBeTruthy());
    expect(screen.getByText('1/2')).toBeTruthy();

    fireEvent.press(screen.getByText('Show answer'));
    expect(screen.getByText('hello')).toBeTruthy();

    fireEvent.press(screen.getByText('Good'));

    await waitFor(() => expect(screen.getByText('谢谢')).toBeTruthy());
    expect(reviewCard).toHaveBeenCalledWith('c1', 4, expect.any(Number));
    expect(screen.getByText('2/2')).toBeTruthy();
  });

  it('logs study time and shows the summary when the session ends', async () => {
    getDueCards.mockResolvedValue({ cards: [card('c1', '你好')], total: 1, deck_size: 1 });
    reviewCard.mockResolvedValue({ card_id: 'c1', next_review: '2026-08-02' });

    render(<CardsScreen />);

    await waitFor(() => expect(screen.getByText('你好')).toBeTruthy());
    fireEvent.press(screen.getByText('Show answer'));
    fireEvent.press(screen.getByText('Easy'));

    await waitFor(() => expect(screen.getByText('Session complete')).toBeTruthy());
    expect(screen.getByText('You reviewed 1 card.')).toBeTruthy();
    expect(logTime).toHaveBeenCalledTimes(1);
  });

  it('keeps the current card and shows a retryable error when the review fails', async () => {
    getDueCards.mockResolvedValue({
      cards: [card('c1', '你好'), card('c2', '谢谢')],
      total: 2,
      deck_size: 2,
    });
    reviewCard.mockRejectedValue(new TypeError('Network request failed'));

    render(<CardsScreen />);

    await waitFor(() => expect(screen.getByText('你好')).toBeTruthy());
    fireEvent.press(screen.getByText('Show answer'));
    fireEvent.press(screen.getByText('Good'));

    await waitFor(() =>
      expect(screen.getByText('No connection. Check your network and try again.')).toBeTruthy()
    );
    expect(screen.getByText('你好')).toBeTruthy();
    expect(screen.queryByText('谢谢')).toBeNull();
  });

  it('shows the no-cards-due state when the deck has cards but none are due', async () => {
    getDueCards.mockResolvedValue({ cards: [], total: 0, deck_size: 150 });

    render(<CardsScreen />);

    await waitFor(() => expect(screen.getByText('No cards due right now')).toBeTruthy());
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -w @hanyu/mobile`
Expected: FAIL — cannot resolve `./CardsScreen`.

- [x] **Step 3: Write the card view**

`apps/mobile/src/ui/FlashCardView.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import type { DueCard } from '@hanyu/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';

export type ReviewMode = 'recognition' | 'recall' | 'listening';

interface FlashCardViewProps {
  card: DueCard;
  mode: ReviewMode;
  revealed: boolean;
  onReveal: () => void;
  onRate: (quality: number) => void;
}

const RATINGS = [
  { label: 'Again', quality: 1 },
  { label: 'Hard', quality: 3 },
  { label: 'Good', quality: 4 },
  { label: 'Easy', quality: 5 },
];

export function FlashCardView({ card, mode, revealed, onReveal, onRate }: FlashCardViewProps) {
  const { colors } = useTheme();

  return (
    <Card>
      <Badge label={`HSK ${card.hsk_level ?? '-'}`} />

      <View style={styles.face}>
        {mode === 'recognition' && !revealed ? (
          <Text style={[styles.hanzi, { color: colors.text }]}>{card.hanzi}</Text>
        ) : null}

        {mode === 'recall' && !revealed ? (
          <Text style={[styles.prompt, { color: colors.text }]}>{card.meaning_en}</Text>
        ) : null}

        {mode === 'listening' && !revealed ? (
          <Text style={[styles.prompt, { color: colors.textMuted }]}>
            Listen and identify the word
          </Text>
        ) : null}

        {revealed ? (
          <>
            <Text style={[styles.hanzi, { color: colors.text }]}>{card.hanzi}</Text>
            <Text style={[styles.pinyin, { color: colors.gold }]}>{card.pinyin}</Text>
            <Text style={[styles.meaning, { color: colors.text }]}>{card.meaning_en}</Text>
          </>
        ) : null}
      </View>

      {revealed ? (
        <View style={styles.ratings}>
          {RATINGS.map((rating) => (
            <View key={rating.label} style={styles.rating}>
              <Button
                label={rating.label}
                variant={rating.quality >= 4 ? 'primary' : 'secondary'}
                onPress={() => onRate(rating.quality)}
              />
            </View>
          ))}
        </View>
      ) : (
        <Button label="Show answer" onPress={onReveal} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  face: { alignItems: 'center', gap: tokens.spacing.sm, paddingVertical: tokens.spacing.xl },
  hanzi: { fontSize: tokens.fontSize.hanzi, fontWeight: '700' },
  pinyin: { fontSize: tokens.fontSize.lg },
  meaning: { fontSize: tokens.fontSize.md },
  prompt: { fontSize: tokens.fontSize.lg, textAlign: 'center' },
  ratings: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  rating: { flexGrow: 1, flexBasis: '45%' },
});
```

- [x] **Step 4: Write the screen**

`apps/mobile/src/screens/CardsScreen.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { toUserMessage, type DueCard, type DueCardsPayload } from '@hanyu/data';
import { getData } from '../lib/data';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { ErrorBanner } from '../ui/ErrorBanner';
import { FlashCardView, type ReviewMode } from '../ui/FlashCardView';
import { Screen } from '../ui/Screen';

const MODES: ReviewMode[] = ['recognition', 'recall', 'listening'];

export default function CardsScreen() {
  const { colors } = useTheme();
  const [cards, setCards] = useState<DueCard[]>([]);
  const [deckSize, setDeckSize] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<ReviewMode>('recognition');
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sessionStartedAt = useRef(Date.now());
  const cardStartedAt = useRef(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const payload = (await getData().flashcards.getDueCards(50)) as DueCardsPayload;
      setCards(payload.cards ?? []);
      setDeckSize(payload.deck_size ?? 0);
      setIndex(0);
      setReviewed(0);
      setRevealed(false);
      setDone(false);
      sessionStartedAt.current = Date.now();
      cardStartedAt.current = Date.now();
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function rate(quality: number) {
    const current = cards[index];
    if (!current) {
      return;
    }

    setError('');

    try {
      await getData().flashcards.reviewCard(
        current.id,
        quality,
        Date.now() - cardStartedAt.current
      );
    } catch (caught) {
      setError(toUserMessage(caught));
      return;
    }

    setReviewed((count) => count + 1);

    if (index + 1 >= cards.length) {
      setDone(true);

      try {
        await getData().stats.logTime(Date.now() - sessionStartedAt.current);
      } catch {
        // Study time is not worth blocking the summary for.
      }

      return;
    }

    setIndex((value) => value + 1);
    setRevealed(false);
    cardStartedAt.current = Date.now();
  }

  async function createStarterDeck() {
    setLoading(true);
    setError('');

    try {
      await getData().flashcards.createStarterDeck({ strategy: 'hsk2_consolidation', limit: 150 });
      await load();
    } catch (caught) {
      setError(toUserMessage(caught));
      setLoading(false);
    }
  }

  if (loading && !cards.length && deckSize === null) {
    return (
      <Screen scroll={false}>
        <ActivityIndicator />
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen>
        <Text style={[styles.heading, { color: colors.text }]}>Session complete</Text>
        <Text style={[styles.muted, { color: colors.textMuted }]}>
          {`You reviewed ${reviewed} ${reviewed === 1 ? 'card' : 'cards'}.`}
        </Text>
        <Button label="Review again" onPress={() => void load()} />
      </Screen>
    );
  }

  const current = cards[index];

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.heading, { color: colors.text }]}>Cards</Text>
        <Text style={[styles.counter, { color: colors.textMuted }]}>
          {`${Math.min(index + 1, Math.max(cards.length, 1))}/${Math.max(cards.length, 1)}`}
        </Text>
      </View>

      <View style={styles.modes}>
        {MODES.map((item) => (
          <View key={item} style={styles.mode}>
            <Button
              label={item[0].toUpperCase() + item.slice(1)}
              variant={mode === item ? 'primary' : 'secondary'}
              onPress={() => setMode(item)}
            />
          </View>
        ))}
      </View>

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      {current ? (
        <FlashCardView
          card={current}
          mode={mode}
          revealed={revealed}
          onReveal={() => setRevealed(true)}
          onRate={(quality) => void rate(quality)}
        />
      ) : deckSize === 0 ? (
        <EmptyState
          title="Set up your HSK2 starter deck"
          body="Start with 150 HSK1 review and HSK2 consolidation cards. You can add custom words later."
          actionLabel="Create starter deck"
          onAction={() => void createStarterDeck()}
          actionDisabled={loading}
        />
      ) : (
        <EmptyState
          title="No cards due right now"
          body="You have reviewed everything due today. Come back tomorrow to keep the streak."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontSize: tokens.fontSize.xl, fontWeight: '700' },
  counter: { fontSize: tokens.fontSize.sm, fontWeight: '600' },
  modes: { flexDirection: 'row', gap: tokens.spacing.sm },
  mode: { flexGrow: 1 },
  muted: { fontSize: tokens.fontSize.sm },
});
```

- [x] **Step 5: Run the test to verify it passes**

Run: `npm test -w @hanyu/mobile`
Expected: PASS, 28 tests.

- [x] **Step 6: Wire the route**

Replace `apps/mobile/app/(app)/cards.tsx`:

```tsx
export { default } from '../../src/screens/CardsScreen';
```

- [x] **Step 7: Commit (Skipped per instruction)**

```bash
git add -A
git commit -m "feat: add mobile flashcard review session with retryable review errors"
```

---

### Task 11: Card audio and listening mode

**Files:**
- Create: `apps/mobile/src/audio/useSpeech.ts`
- Create: `apps/mobile/src/audio/useSpeech.test.ts`
- Create: `apps/mobile/src/ui/AudioButton.tsx`
- Modify: `apps/mobile/src/ui/FlashCardView.tsx`
- Modify: `apps/mobile/src/screens/CardsScreen.test.tsx`

**Interfaces:**
- Consumes: `expo-speech`, the primitives from Task 8.
- Produces: `useSpeech(): { speak(text: string, rate?: number): void; stop(): void }`
  using `Speech.speak` with `language: 'zh-CN'` and a default rate of `0.8`, the
  same rate the web `AudioButton` uses; and `AudioButton({ text })`.

- [x] **Step 1: Write the failing hook test**

`apps/mobile/src/audio/useSpeech.test.ts`:

```ts
import * as Speech from 'expo-speech';
import { useSpeech } from './useSpeech';

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));

describe('useSpeech', () => {
  beforeEach(() => {
    (Speech.speak as jest.Mock).mockClear();
    (Speech.stop as jest.Mock).mockClear();
  });

  it('speaks Mandarin at the study rate', () => {
    useSpeech().speak('你好');

    expect(Speech.stop).toHaveBeenCalled();
    expect(Speech.speak).toHaveBeenCalledWith('你好', { language: 'zh-CN', rate: 0.8 });
  });

  it('accepts a custom rate', () => {
    useSpeech().speak('你好', 0.5);

    expect(Speech.speak).toHaveBeenCalledWith('你好', { language: 'zh-CN', rate: 0.5 });
  });

  it('ignores empty text', () => {
    useSpeech().speak('');

    expect(Speech.speak).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -w @hanyu/mobile`
Expected: FAIL — cannot resolve `./useSpeech`.

- [x] **Step 3: Write the hook and the button**

`apps/mobile/src/audio/useSpeech.ts`:

```ts
import * as Speech from 'expo-speech';

export function useSpeech() {
  return {
    speak(text: string, rate = 0.8) {
      if (!text) {
        return;
      }

      Speech.stop();
      Speech.speak(text, { language: 'zh-CN', rate });
    },
    stop() {
      Speech.stop();
    },
  };
}
```

`apps/mobile/src/ui/AudioButton.tsx`:

```tsx
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSpeech } from '../audio/useSpeech';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

export function AudioButton({ text, label = 'Play audio' }: { text: string; label?: string }) {
  const { colors } = useTheme();
  const { speak } = useSpeech();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => speak(text)}
      style={[styles.button, { borderColor: colors.border, backgroundColor: colors.surface }]}
    >
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: tokens.radius.pill,
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
  },
  label: { fontSize: tokens.fontSize.sm, fontWeight: '600' },
});
```

- [x] **Step 4: Add audio to the card, and auto-play in listening mode**

In `apps/mobile/src/ui/FlashCardView.tsx`, add the imports:

```tsx
import { useEffect } from 'react';
import { useSpeech } from '../audio/useSpeech';
import { AudioButton } from './AudioButton';
```

Inside the component, before the return, add the listening-mode auto-play:

```tsx
  const { speak } = useSpeech();

  useEffect(() => {
    if (mode === 'listening' && !revealed && card.hanzi) {
      speak(card.hanzi);
    }
  }, [card.id, mode, revealed]);
```

Replace the listening-mode prompt block with the prompt plus a replay control,
and add an audio button for the other modes once revealed:

```tsx
        {mode === 'listening' && !revealed ? (
          <>
            <Text style={[styles.prompt, { color: colors.textMuted }]}>
              Listen and identify the word
            </Text>
            <AudioButton text={card.hanzi ?? ''} label="Play again" />
          </>
        ) : null}
```

and inside the `revealed` branch, after the meaning line:

```tsx
            <AudioButton text={card.hanzi ?? ''} />
```

- [x] **Step 5: Add the screen-level audio test**

Append to `apps/mobile/src/screens/CardsScreen.test.tsx`:

```tsx
  it('creates the starter deck from the empty state', async () => {
    getDueCards
      .mockResolvedValueOnce({ cards: [], total: 0, deck_size: 0 })
      .mockResolvedValueOnce({ cards: [card('c1', '你好')], total: 1, deck_size: 150 });
    createStarterDeck.mockResolvedValue({ inserted: 150 });

    render(<CardsScreen />);

    await waitFor(() => expect(screen.getByText('Set up your HSK2 starter deck')).toBeTruthy());
    fireEvent.press(screen.getByText('Create starter deck'));

    await waitFor(() =>
      expect(createStarterDeck).toHaveBeenCalledWith({ strategy: 'hsk2_consolidation', limit: 150 })
    );
    await waitFor(() => expect(screen.getByText('你好')).toBeTruthy());
  });

  it('speaks the card automatically in listening mode', async () => {
    const speech = require('expo-speech');
    getDueCards.mockResolvedValue({ cards: [card('c1', '你好')], total: 1, deck_size: 1 });

    render(<CardsScreen />);

    await waitFor(() => expect(screen.getByText('Recognition')).toBeTruthy());
    fireEvent.press(screen.getByText('Listening'));

    await waitFor(() =>
      expect(speech.speak).toHaveBeenCalledWith('你好', { language: 'zh-CN', rate: 0.8 })
    );
  });
```

- [x] **Step 6: Run the mobile suite**

Run: `npm test -w @hanyu/mobile`
Expected: PASS, 33 tests.

- [ ] **Step 7: Verify audio on a real device**

Run the app, open Cards, switch to Listening. Expected: the device pronounces
the hanzi in Mandarin. On a simulator without a Chinese voice installed there may
be silence — that is a device configuration issue, not a bug, and it must be
checked on hardware.

- [x] **Step 8: Commit (Skipped per instruction)**

```bash
git add -A
git commit -m "feat: add Mandarin text-to-speech and listening mode to mobile cards"
```

---

### Task 12: You screen with settings

**Files:**
- Create: `apps/mobile/src/screens/YouScreen.tsx`
- Create: `apps/mobile/src/screens/YouScreen.test.tsx`
- Create: `apps/mobile/src/ui/OptionRow.tsx`
- Create: `apps/mobile/src/ui/NumberRow.tsx`
- Modify: `apps/mobile/app/(app)/you.tsx`

**Interfaces:**
- Consumes: `getData()`, `toUserMessage`, `UserSettings`, `useSession` from
  Task 7, `useTheme` from Task 8.
- Produces: `YouScreen` (default export from `src/screens/YouScreen`),
  `OptionRow({ label, value, options, onChange })`, and
  `NumberRow({ label, value, min, max, step, onChange })`.

- [x] **Step 1: Write the failing test**

`apps/mobile/src/screens/YouScreen.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import YouScreen from './YouScreen';

const getSettings = jest.fn();
const updateSettings = jest.fn();
const signOut = jest.fn();

jest.mock('../lib/data', () => ({
  getData: () => ({
    settings: {
      getSettings: () => getSettings(),
      updateSettings: (input: unknown) => updateSettings(input as never),
    },
  }),
}));

jest.mock('../session/SessionProvider', () => ({
  useSession: () => ({
    session: { user: { id: 'user-1', email: 'learner@example.com' } },
    loading: false,
    signOut: () => signOut(),
  }),
}));

const setPreference = jest.fn();

jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({
    scheme: 'light',
    preference: 'light',
    setPreference,
    colors: {
      bg: '#ffffff',
      surface: '#f9fafb',
      text: '#111827',
      textMuted: '#6b7280',
      border: '#e5e7eb',
      vermilion: '#c93624',
      gold: '#946d00',
      onAccent: '#ffffff',
    },
  }),
}));

const settings = {
  user_id: 'user-1',
  theme: 'light',
  current_level: 2,
  cards_per_day: 20,
  max_reviews_per_session: 100,
  card_order: 'due',
  ai_provider: 'none',
};

describe('YouScreen', () => {
  beforeEach(() => {
    getSettings.mockReset();
    updateSettings.mockReset();
    signOut.mockReset();
    setPreference.mockReset();
  });

  it('shows the signed-in email and the current settings', async () => {
    getSettings.mockResolvedValue(settings);

    render(<YouScreen />);

    await waitFor(() => expect(screen.getByText('learner@example.com')).toBeTruthy());
    expect(screen.getByText('Cards per day: 20')).toBeTruthy();
    expect(screen.getByText('Max reviews per session: 100')).toBeTruthy();
  });

  it('persists a theme change and applies it immediately', async () => {
    getSettings.mockResolvedValue(settings);
    updateSettings.mockResolvedValue({ ...settings, theme: 'dark' });

    render(<YouScreen />);

    await waitFor(() => expect(screen.getByText('learner@example.com')).toBeTruthy());
    fireEvent.press(screen.getByText('dark'));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ theme: 'dark' }));
    expect(setPreference).toHaveBeenCalledWith('dark');
  });

  it('persists a cards-per-day change', async () => {
    getSettings.mockResolvedValue(settings);
    updateSettings.mockResolvedValue({ ...settings, cards_per_day: 25 });

    render(<YouScreen />);

    await waitFor(() => expect(screen.getByText('Cards per day: 20')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Increase cards per day'));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ cards_per_day: 25 }));
  });

  it('shows a retryable error when saving fails', async () => {
    getSettings.mockResolvedValue(settings);
    updateSettings.mockRejectedValue({ message: 'Failed to save settings' });

    render(<YouScreen />);

    await waitFor(() => expect(screen.getByText('Cards per day: 20')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Increase cards per day'));

    await waitFor(() => expect(screen.getByText('Failed to save settings')).toBeTruthy());
  });

  it('signs the user out', async () => {
    getSettings.mockResolvedValue(settings);

    render(<YouScreen />);

    await waitFor(() => expect(screen.getByText('Sign out')).toBeTruthy());
    fireEvent.press(screen.getByText('Sign out'));

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -w @hanyu/mobile`
Expected: FAIL — cannot resolve `./YouScreen`.

- [x] **Step 3: Write the row primitives**

`apps/mobile/src/ui/OptionRow.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';

interface OptionRowProps<T extends string> {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (next: T) => void;
}

export function OptionRow<T extends string>({ label, value, options, onChange }: OptionRowProps<T>) {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <View style={styles.options}>
        {options.map((option) => (
          <View key={option} style={styles.option}>
            <Button
              label={option}
              variant={option === value ? 'primary' : 'secondary'}
              onPress={() => onChange(option)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: tokens.spacing.sm },
  label: { fontSize: tokens.fontSize.md, fontWeight: '600' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  option: { flexGrow: 1, flexBasis: '30%' },
});
```

`apps/mobile/src/ui/NumberRow.tsx`:

```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

interface NumberRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
}

export function NumberRow({ label, value, min, max, step, onChange }: NumberRowProps) {
  const { colors } = useTheme();
  const lower = label.toLowerCase();

  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.text }]}>{`${label}: ${value}`}</Text>
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${lower}`}
          disabled={value - step < min}
          onPress={() => onChange(value - step)}
          style={[styles.control, { borderColor: colors.border, opacity: value - step < min ? 0.4 : 1 }]}
        >
          <Text style={[styles.controlLabel, { color: colors.text }]}>-</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${lower}`}
          disabled={value + step > max}
          onPress={() => onChange(value + step)}
          style={[styles.control, { borderColor: colors.border, opacity: value + step > max ? 0.4 : 1 }]}
        >
          <Text style={[styles.controlLabel, { color: colors.text }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: tokens.fontSize.md, fontWeight: '600' },
  controls: { flexDirection: 'row', gap: tokens.spacing.sm },
  control: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlLabel: { fontSize: tokens.fontSize.lg, fontWeight: '700' },
});
```

- [x] **Step 4: Write the screen**

`apps/mobile/src/screens/YouScreen.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import {
  toUserMessage,
  type AiProvider,
  type CardOrder,
  type ThemePreference,
  type UserSettings,
} from '@hanyu/data';
import { getData } from '../lib/data';
import { useSession } from '../session/SessionProvider';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorBanner } from '../ui/ErrorBanner';
import { NumberRow } from '../ui/NumberRow';
import { OptionRow } from '../ui/OptionRow';
import { Screen } from '../ui/Screen';

const THEMES: readonly ThemePreference[] = ['light', 'dark', 'system'];
const ORDERS: readonly CardOrder[] = ['due', 'frequency'];
const PROVIDERS: readonly AiProvider[] = ['none', 'deepseek', 'gemini'];
const LEVELS = ['1', '2', '3'] as const;

export default function YouScreen() {
  const { colors, setPreference } = useTheme();
  const { session, signOut } = useSession();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const loaded = (await getData().settings.getSettings()) as UserSettings;
      setSettings(loaded);
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(patch: Partial<UserSettings>) {
    const previous = settings;
    setSettings((current) => (current ? { ...current, ...patch } : current));
    setError('');

    try {
      const saved = (await getData().settings.updateSettings(patch)) as UserSettings;
      setSettings(saved);

      if (patch.theme) {
        setPreference(patch.theme);
      }
    } catch (caught) {
      setSettings(previous);
      setError(toUserMessage(caught));
    }
  }

  if (loading && !settings) {
    return (
      <Screen scroll={false}>
        <ActivityIndicator />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={[styles.heading, { color: colors.text }]}>You</Text>

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      <Card>
        <Text style={[styles.label, { color: colors.textMuted }]}>Signed in as</Text>
        <Text style={[styles.value, { color: colors.text }]}>{session?.user?.email ?? '-'}</Text>
      </Card>

      {settings ? (
        <>
          <Card>
            <OptionRow
              label="Theme"
              value={settings.theme}
              options={THEMES}
              onChange={(theme) => void save({ theme })}
            />
          </Card>

          <Card>
            <OptionRow
              label="Current level"
              value={String(settings.current_level) as (typeof LEVELS)[number]}
              options={LEVELS}
              onChange={(level) => void save({ current_level: Number(level) })}
            />
          </Card>

          <Card>
            <NumberRow
              label="Cards per day"
              value={settings.cards_per_day}
              min={1}
              max={100}
              step={5}
              onChange={(cards_per_day) => void save({ cards_per_day })}
            />
            <NumberRow
              label="Max reviews per session"
              value={settings.max_reviews_per_session}
              min={1}
              max={300}
              step={10}
              onChange={(max_reviews_per_session) => void save({ max_reviews_per_session })}
            />
          </Card>

          <Card>
            <OptionRow
              label="Card order"
              value={settings.card_order}
              options={ORDERS}
              onChange={(card_order) => void save({ card_order })}
            />
          </Card>

          <Card>
            <OptionRow
              label="AI provider"
              value={settings.ai_provider}
              options={PROVIDERS}
              onChange={(ai_provider) => void save({ ai_provider })}
            />
          </Card>
        </>
      ) : null}

      <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: tokens.fontSize.xl, fontWeight: '700' },
  label: { fontSize: tokens.fontSize.xs, fontWeight: '600', textTransform: 'uppercase' },
  value: { fontSize: tokens.fontSize.md },
});
```

The optimistic update with rollback is deliberate: the setting reflects
immediately, and a failed save restores the previous value together with a
visible error, so the UI never claims a change that did not persist.

- [x] **Step 5: Run the test to verify it passes**

Run: `npm test -w @hanyu/mobile`
Expected: PASS, 59 tests.

- [x] **Step 6: Wire the route**

Replace `apps/mobile/app/(app)/you.tsx`:

```tsx
export { default } from '../../src/screens/YouScreen';
```

- [x] **Step 7: Commit (Skipped per instruction)**

```bash
git add -A
git commit -m "feat: add mobile You screen with settings and sign out"
```

---

### Task 13: Unify the test entry point and document the workspace

**Files:**
- Modify: `package.json` (root)
- Modify: `README.md`
- Create: `apps/mobile/README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: `npm test` at the repo root runs Vitest for `packages/data` plus
  `apps/web`, then Jest for `apps/mobile`.

- [x] **Step 1: Chain the two runners**

In root `package.json` scripts:

```json
    "test": "vitest run && npm run test -w @hanyu/mobile",
    "test:web": "vitest run",
    "test:mobile": "npm run test -w @hanyu/mobile",
    "test:watch": "vitest",
    "dev:mobile": "npm run start -w @hanyu/mobile",
```

- [x] **Step 2: Run everything**

Run: `npm test`
Expected: Vitest passes, then Jest passes 39 mobile tests. Exit code 0.

- [x] **Step 3: Document the workspace in the root README**

Add a `## Aplicacion movil` section after `## Stack`:

```markdown
## Aplicacion movil

La app movil vive en `apps/mobile` (Expo + Expo Router + TypeScript) y consume
`packages/data`, el mismo paquete que usa la web.

```bash
cp apps/mobile/.env.example apps/mobile/.env
# pega EXPO_PUBLIC_SUPABASE_ANON_KEY
npm run dev:mobile
```

En P1 la app cubre login, registro, envio de email de recuperacion, Today,
Cards y You. Los detalles estan en
`docs/superpowers/specs/2026-07-29-hanyu-mobile-foundation-design.md`.
```

Add these rows to the scripts table:

```markdown
| `npm run dev:mobile` | Inicia Expo en `apps/mobile` |
| `npm run test:web` | Ejecuta Vitest (paquetes y web) |
| `npm run test:mobile` | Ejecuta Jest en `apps/mobile` |
```

- [x] **Step 4: Write the mobile README with the manual verification checklist**

`apps/mobile/README.md`:

```markdown
# Hanyu Mobile

Expo app sharing `@hanyu/data` with the web client.

## Setup

```bash
cp .env.example .env   # paste EXPO_PUBLIC_SUPABASE_ANON_KEY
npm install            # from the repo root
npm run dev:mobile     # from the repo root
```

## Scope in P1

Auth (sign in, sign up, reset email), Today, Cards, You. Practice and Library
tabs arrive in P2, offline review in P3, and store builds in P4.

Completing a password reset happens on the web: the email link points at the web
app until the native deep link ships in P4.

## Manual verification checklist

Automated tests cannot cover these. Run them on real hardware before calling P1
done.

- [ ] Sign in on iOS, force-quit the app, reopen it: still signed in.
- [ ] Background the app for 30 minutes, return: no forced re-login, and Today reloads.
- [ ] Same account on iOS and Android shows the same deck size, due count, and streak.
- [ ] Review a card on mobile, refresh the web dashboard: the reviewed count moved.
- [ ] New account: sign up, create the starter deck, review one card, Today shows 1 of 3 blocks.
- [ ] Enable airplane mode mid-session, rate a card: a visible error appears, the card stays, and retry works after reconnecting.
- [ ] Listening mode pronounces the hanzi in Mandarin on a device with a Chinese voice installed.
- [ ] Change the theme in You: it applies immediately and survives a restart.
```

- [x] **Step 5: Commit (Skipped per instruction)**

```bash
git add -A
git commit -m "docs: unify workspace test entry point and document the mobile app"
```

---

## Definition of Done for P1

- `npm test` is green: Vitest for `packages/data` and `apps/web`, Jest for `apps/mobile`.
- `npm run typecheck -w @hanyu/data` exits 0.
- `npm run build` produces `apps/web/dist`, and the deployed web app behaves exactly as before.
- No file under `apps/web/src/**/*.test.jsx` was modified in any commit of this plan.
- The manual checklist in `apps/mobile/README.md` passes on an iPhone and an Android device.

## 2026-07-31 Verification Notes

- Automated checks are green: `npm test -- --reporter=dot` passes with 155 Vitest tests and 59 mobile Jest tests.
- Type checks are green: `npm exec -w @hanyu/mobile -- tsc -p tsconfig.json --noEmit` and `npm run typecheck -w @hanyu/data` both exit 0.
- Build/export checks are green: `npm run build` exits 0, and `npx expo export --platform android --platform ios` exports both native bundles.
- `npx expo-doctor` is 19/20 because the monorepo currently has root/web React 18 dependencies and Expo 57 mobile React 19 dependencies. Treat this as a known monorepo warning, not a P1 implementation failure, unless upgrading the web app to React 19 is explicitly in scope.
- Manual device verification is still pending: the checklist above requires signed-in iOS and Android device/simulator runs with real credentials and real audio behavior.
