# Hanyu Store Release (P4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce compliant signed Hanyu binaries, validate password reset and account deletion, prepare truthful store listings, and distribute the accepted release candidate through TestFlight and Google Play Internal Testing.

**Architecture:** Convert Expo configuration to validated TypeScript config with explicit EAS profiles. Keep password recovery in the public Router tree and privileged deletion in an authenticated Supabase Edge Function. Version legal copy and store text in the repository, render environment-specific URLs during release, and treat credentials, agreements, approved artwork, tester access, and final store review as explicit external gates.

**Tech Stack:** Expo SDK 57, Expo Router, EAS Build/Submit, Supabase Auth/Edge Functions, React Native Testing Library, Vitest, App Store Connect, Google Play Console.

## Global Constraints

- Begin only after P3 passes its signed-build offline matrix.
- Release identity is `Hanyu`, scheme `hanyu`, iOS bundle ID `com.hanyu.app`, Android package `com.hanyu.app`, initial version `1.0.0`.
- The password reset route is `hanyu://auth/reset-password`.
- Production secrets and signing credentials never enter Git.
- The delete-account service derives the user from a verified JWT; it never accepts a user ID from the client.
- Account deletion removes Auth, owned server data, session state, and the user-scoped SQLite database.
- Privacy and Data Safety/App Privacy answers must describe the exact accepted binary.
- In-app copy stays English; store metadata is English and Spanish.
- EAS Submit uploads binaries; App Store Connect and Play Console remain the authority for metadata, testing, and production review.
- Owner-approved icon and splash masters, active Apple/Google/Expo accounts, accepted agreements, a public HTTPS web origin, and a support email are external prerequisites, not values to invent.

## Required External Inputs

Before Task 1, the release owner supplies the four named variables through the
shell or EAS. Verify their presence without printing their values:

```bash
test -n "$HANYU_PUBLIC_WEB_URL"
test -n "$HANYU_SUPPORT_EMAIL"
test -n "$EXPO_PUBLIC_SUPABASE_URL"
test -n "$EXPO_PUBLIC_SUPABASE_ANON_KEY"
```

Before Task 2, approved raster masters exist at:

```text
store/assets/icon-master-1024.png
store/assets/splash-master-2048.png
```

The plan must stop at the affected gate if an external input is absent; it must
not substitute fake domains, emails, credentials, or artwork.

---

### Task 1: Lock release configuration and EAS profiles

**Files:**
- Create: `apps/mobile/app.config.ts`
- Create: `apps/mobile/eas.json`
- Create: `apps/mobile/src/config/release.ts`
- Create: `apps/mobile/src/config/release.test.ts`
- Create: `scripts/validate-release-env.mjs`
- Modify: `apps/mobile/package.json`
- Delete: `apps/mobile/app.json`

**Interfaces:**
- Consumes: required release environment.
- Produces: validated Expo/EAS configuration for development, preview, and production.

- [ ] **Step 1: Write failing environment validation tests**

```ts
expect(() => getReleaseConfig({})).toThrow('EXPO_PUBLIC_SUPABASE_URL is required');
expect(getReleaseConfig(valid)).toMatchObject({
  webUrl: 'https://hanyu.example',
  supportEmail: 'support@hanyu.example',
});
expect(() => getReleaseConfig({ ...valid, webUrl: 'http://hanyu.example' }))
  .toThrow('HANYU_PUBLIC_WEB_URL must use https');
```

- [ ] **Step 2: Verify failure**

```bash
npm test -w @hanyu/mobile -- --runInBand src/config/release.test.ts
```

Expected: FAIL because release validation is missing.

- [ ] **Step 3: Implement config validation**

```ts
export interface ReleaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  webUrl: string;
  supportEmail: string;
}
export function getReleaseConfig(env: Record<string, string | undefined>): ReleaseConfig;
```

Require HTTPS for the web URL, a syntactically valid email, and nonempty
Supabase values. The shell script imports the same validation and exits nonzero
with the missing key names.

- [ ] **Step 4: Replace `app.json` with `app.config.ts`**

Install the config plugins first:

```bash
cd apps/mobile
npx expo install expo-splash-screen expo-dev-client
cd ../..
```

Set:

```ts
{
  name: 'Hanyu',
  slug: 'hanyu',
  version: '1.0.0',
  scheme: 'hanyu',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  ios: { bundleIdentifier: 'com.hanyu.app', supportsTablet: true },
  android: { package: 'com.hanyu.app', predictiveBackGestureEnabled: false },
  plugins: ['expo-router', 'expo-splash-screen'],
}
```

Preserve asset paths from Task 2 and set `extra.eas.projectId` only from the
real `eas init` result.

- [ ] **Step 5: Add exact EAS profiles**

```json
{
  "cli": { "version": ">= 16.0.0", "appVersionSource": "remote" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": { "distribution": "internal", "channel": "preview" },
    "production": { "autoIncrement": true, "channel": "production" }
  },
  "submit": {
    "production": {
      "ios": {},
      "android": { "track": "internal", "releaseStatus": "completed" }
    }
  }
}
```

- [ ] **Step 6: Initialize/inspect EAS without submitting**

From `apps/mobile`:

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npx expo config --type public
npx eas-cli@latest config --platform ios
npx eas-cli@latest config --platform android
```

Expected: Expo project is linked once; public config contains no secret; both
platform configs resolve `com.hanyu.app`.

- [ ] **Step 7: Run tests and commit**

```bash
npm test -w @hanyu/mobile -- --runInBand src/config/release.test.ts
git add apps/mobile/app.config.ts apps/mobile/eas.json apps/mobile/src/config scripts/validate-release-env.mjs apps/mobile/package.json package-lock.json
git rm apps/mobile/app.json
git commit -m "chore(mobile): configure EAS release profiles"
```

---

### Task 2: Generate and validate store icons and splash assets

**Files:**
- Create: `scripts/generate-mobile-assets.mjs`
- Create: `scripts/validate-mobile-assets.mjs`
- Create: `scripts/validate-mobile-assets.test.mjs`
- Create: `store/assets/README.md`
- Modify: `apps/mobile/assets/icon.png`
- Modify: `apps/mobile/assets/splash-icon.png`
- Modify: `apps/mobile/assets/android-icon-foreground.png`
- Modify: `apps/mobile/assets/android-icon-background.png`
- Modify: `apps/mobile/assets/android-icon-monochrome.png`
- Modify: `apps/mobile/app.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: the two approved masters named in Required External Inputs.
- Produces: deterministic Expo assets and validation report.

- [ ] **Step 1: Gate on approved masters**

```bash
test -f store/assets/icon-master-1024.png
test -f store/assets/splash-master-2048.png
```

Expected: both exist. If not, pause for owner-approved artwork; do not reuse
default Expo art as production branding.

- [ ] **Step 2: Add deterministic generation**

Use `sharp` in the script to create:

- `icon.png`: 1024×1024 opaque;
- Android foreground: 432×432 transparent with the mark inside the 264×264 safe zone;
- Android background: 432×432 opaque;
- Android monochrome: 432×432 alpha mask;
- splash icon: 2048×2048 transparent with centered mark.

Do not stretch the masters. Use `fit: 'contain'` and the approved background
color sampled from the master.

- [ ] **Step 3: Write and run failing validator tests**

Using `node:test`, generate temporary rasters and assert that the validator
rejects a 512×512 icon, a transparent icon, an oversized file, and a recorded
Expo-scaffold hash; assert that it accepts a valid generated set.

```bash
node --test scripts/validate-mobile-assets.test.mjs
```

Expected: FAIL before the validator is implemented.

- [ ] **Step 4: Add strict validation**

The validator checks dimensions, alpha expectations, maximum file size 1 MiB
per raster, and rejects assets whose SHA-256 matches the original Expo
scaffold assets recorded before replacement.

- [ ] **Step 5: Regenerate, validate, and rerun tests**

```bash
npm run assets:mobile
npm run assets:mobile:check
node --test scripts/validate-mobile-assets.test.mjs
npx expo config --type public
```

Expected: validator exits `0`; every config asset path exists.

- [ ] **Step 6: Inspect on physical preview builds**

Check icon cropping on iOS and Android launchers, Android themed icon,
light/dark splash, and startup/session restoration. Capture approval in
`store/assets/README.md` with device/OS and date.

- [ ] **Step 7: Commit**

```bash
git add scripts/generate-mobile-assets.mjs scripts/validate-mobile-assets.mjs scripts/validate-mobile-assets.test.mjs store/assets/README.md apps/mobile/assets apps/mobile/app.config.ts package.json package-lock.json
git commit -m "feat(brand): add production mobile assets"
```

---

### Task 3: Add password recovery contracts and deep-link parsing

**Files:**
- Create: `packages/data/src/auth-recovery.test.ts`
- Modify: `packages/data/src/auth.ts`
- Modify: `packages/data/src/factory.ts`
- Modify: `packages/data/src/index.ts`
- Modify: `apps/mobile/src/lib/data.ts`
- Modify: `apps/mobile/app/(auth)/forgot-password.tsx`
- Modify: `apps/mobile/app/(auth)/forgot-password.test.tsx`

**Interfaces:**
- Consumes: Supabase Auth PKCE or token-fragment recovery URL.
- Produces: `consumePasswordRecoveryUrl(url)` and `updatePassword(password)`.

- [ ] **Step 1: Write failing data tests**

Cover:

```ts
await consumePasswordRecoveryUrl('hanyu://auth/reset-password?code=pkce-code', client);
expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith('pkce-code');

await consumePasswordRecoveryUrl(
  'hanyu://auth/reset-password#access_token=a&refresh_token=r&type=recovery',
  client,
);
expect(client.auth.setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' });

await updatePassword('correct horse battery staple', client);
expect(client.auth.updateUser).toHaveBeenCalledWith({ password: 'correct horse battery staple' });
```

Reject non-recovery type, wrong scheme/path, missing tokens/code, and Supabase
errors without logging the URL.

- [ ] **Step 2: Verify failure**

```bash
npm test -- packages/data/src/auth-recovery.test.ts
```

Expected: FAIL because recovery helpers do not exist.

- [ ] **Step 3: Implement and expose helpers**

Parse with `URL` plus `URLSearchParams(url.hash.slice(1))`. Accept only protocol
`hanyu:` and pathname/host combination resolving to `auth/reset-password`.
Map errors with the existing repository error shape.

Extend the factory contract to:

```ts
sendPasswordReset(email: string, redirectTo?: string): Promise<void>;
consumePasswordRecoveryUrl(url: string): Promise<void>;
updatePassword(password: string): Promise<void>;
```

- [ ] **Step 4: Set the exact reset redirect**

The forgot-password screen calls:

```ts
getData().auth.sendPasswordReset(email, 'hanyu://auth/reset-password');
```

Show a neutral success message that does not disclose whether the email exists.

- [ ] **Step 5: Run tests and commit**

```bash
npm test -- packages/data/src/auth-recovery.test.ts
npm test -w @hanyu/mobile -- --runInBand 'app/(auth)/forgot-password.test.tsx'
git add packages/data/src apps/mobile/src/lib/data.ts apps/mobile/app/'(auth)'/forgot-password*
git commit -m "feat(auth): add mobile password recovery contract"
```

Expected: PASS, then commit succeeds.

---

### Task 4: Build the public reset-password route

**Files:**
- Create: `apps/mobile/app/auth/_layout.tsx`
- Create: `apps/mobile/app/auth/reset-password.tsx`
- Create: `apps/mobile/app/auth/reset-password.test.tsx`
- Create: `apps/mobile/src/auth/usePasswordRecovery.ts`
- Create: `apps/mobile/src/auth/usePasswordRecovery.test.tsx`

**Interfaces:**
- Consumes: Task 3, Expo Linking initial URL/events, and Router.
- Produces: cold/warm recovery flow outside signed-in/signed-out route guards.

- [ ] **Step 1: Write failing hook tests**

Cover initial URL, warm link event, invalid/expired link, password mismatch,
minimum 12 characters, successful update, double-submit guard, and listener
cleanup.

- [ ] **Step 2: Verify failure**

```bash
npm test -w @hanyu/mobile -- --runInBand src/auth/usePasswordRecovery.test.tsx app/auth/reset-password.test.tsx
```

Expected: FAIL because route/hook are missing.

- [ ] **Step 3: Implement the recovery state machine**

```ts
type RecoveryStatus = 'reading-link' | 'ready' | 'submitting' | 'success' | 'invalid';
```

Consume exactly one URL, keep tokens out of logs/state error text, validate both
password fields, call `updatePassword`, and `router.replace('/today')` after
success.

- [ ] **Step 4: Implement the route UI**

Render loading, invalid-link with “Send another reset email”, ready form,
submitting disabled state, and success. Set both fields
`secureTextEntry`, `textContentType="newPassword"`, and disable autocorrect.

- [ ] **Step 5: Configure Supabase**

In production Auth URL configuration add:

```text
hanyu://auth/reset-password
```

Send a real reset email and verify the link contains the configured redirect.

- [ ] **Step 6: Run tests and commit**

```bash
npm test -w @hanyu/mobile -- --runInBand src/auth app/auth/reset-password.test.tsx
git add apps/mobile/app/auth apps/mobile/src/auth
git commit -m "feat(mobile): complete password reset by deep link"
```

Expected: PASS, then commit succeeds.

---

### Task 5: Implement authenticated account deletion on Supabase

**Files:**
- Create: `supabase/functions/delete-account/index.ts`
- Create: `supabase/functions/delete-account/handler.ts`
- Create: `supabase/functions/delete-account/handler.test.ts`
- Create: `supabase/tests/account_deletion.sql`
- Create: `packages/data/src/account-deletion.test.ts`
- Modify: `packages/data/src/auth.ts`
- Modify: `packages/data/src/factory.ts`
- Modify: `packages/data/src/index.ts`

**Interfaces:**
- Consumes: verified bearer JWT and server-only `SUPABASE_SERVICE_ROLE_KEY`.
- Produces: idempotent `DELETE /functions/v1/delete-account` and `auth.deleteAccount()`.

- [ ] **Step 1: Write failing Edge Function tests**

Test missing/invalid bearer token (`401`), authenticated deletion (`204`),
body user ID ignored/rejected, service error (`500` with safe message), and
repeat request (`401` after the account no longer exists).

- [ ] **Step 2: Write the cascade audit**

Create a user with rows in profiles, settings, SRS, logs, stats, attempts, and
user-owned generated content. Delete the Auth user with admin API in the test
harness, then assert zero owned rows in every table.

- [ ] **Step 3: Verify tests fail**

```bash
npm test -- supabase/functions/delete-account/handler.test.ts
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/account_deletion.sql
```

Expected: function test fails because it is missing; SQL audit exposes any
non-cascading foreign keys.

- [ ] **Step 4: Implement the function**

Implement an injected `handleDeleteAccount(request, deps)` in `handler.ts` so
Vitest never needs Deno globals. `index.ts` adapts `Deno.serve` to that handler.
Create an anon client with the request Authorization header, call
`auth.getUser()`, then create a service-role client server-side and call:

```ts
await admin.auth.admin.deleteUser(user.id, false);
```

Return `204` with no body. Never accept a target user ID.

- [ ] **Step 5: Fix only necessary cascades**

If the audit finds owned rows without `ON DELETE CASCADE`, add a focused
migration preserving shared words/grammar and global generated content.

- [ ] **Step 6: Add the data operation**

```ts
export async function deleteAccount(client: HanyuClient): Promise<void> {
  const { error } = await client.functions.invoke('delete-account', { body: {} });
  if (error) throw createAuthError(error, 'Could not delete account');
}
```

- [ ] **Step 7: Run tests and commit**

```bash
npm test -- supabase/functions/delete-account/handler.test.ts packages/data/src/account-deletion.test.ts
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/account_deletion.sql
git add supabase/functions/delete-account supabase/tests packages/data/src supabase/migrations
git commit -m "feat(auth): delete accounts and owned data"
```

Expected: all deletion tests pass.

---

### Task 6: Add in-app deletion confirmation and local cleanup

**Files:**
- Create: `apps/mobile/src/account/DeleteAccountSheet.tsx`
- Create: `apps/mobile/src/account/DeleteAccountSheet.test.tsx`
- Create: `apps/mobile/src/account/deleteAccount.ts`
- Create: `apps/mobile/src/account/deleteAccount.test.ts`
- Modify: `apps/mobile/src/screens/YouScreen.tsx`
- Modify: `apps/mobile/src/screens/YouScreen.test.tsx`

**Interfaces:**
- Consumes: `auth.deleteAccount`, active `ReviewStore`, `resetData`, session state.
- Produces: typed confirmation and complete local cleanup.

- [ ] **Step 1: Write failing UI/orchestrator tests**

Assert Delete account is visible, consequence copy names cards/progress/settings,
button remains disabled until exact text `DELETE`, double-submit is guarded,
server deletion runs before local cleanup, and success clears SQLite/data/session.
On server failure, local state remains and retry is available.

- [ ] **Step 2: Verify failure**

```bash
npm test -w @hanyu/mobile -- --runInBand src/account src/screens/YouScreen.test.tsx
```

Expected: FAIL because deletion UI is absent.

- [ ] **Step 3: Implement orchestration**

```ts
export async function deleteCurrentAccount(deps: {
  remoteDelete(): Promise<void>;
  destroyReviewStore(): Promise<void>;
  resetData(): void;
  clearSession(): Promise<void>;
}): Promise<void>;
```

Order: remote delete, destroy DB, reset singleton, clear session. Cleanup is
best-effort after the irreversible remote success and records no user data.

- [ ] **Step 4: Implement the sheet**

Use a destructive button, typed confirmation, Cancel, loading lock, and
accessible error announcement. After success route to `/sign-in`.

- [ ] **Step 5: Run tests and commit**

```bash
npm test -w @hanyu/mobile -- --runInBand src/account src/screens/YouScreen.test.tsx
git add apps/mobile/src/account apps/mobile/src/screens/YouScreen*
git commit -m "feat(mobile): add in-app account deletion"
```

Expected: PASS, then commit succeeds.

---

### Task 7: Publish privacy and web deletion resources

**Files:**
- Create: `docs/legal/privacy-policy.md`
- Create: `apps/web/src/pages/Privacy.jsx`
- Create: `apps/web/src/pages/Privacy.test.jsx`
- Create: `apps/web/src/pages/DeleteAccount.jsx`
- Create: `apps/web/src/pages/DeleteAccount.test.jsx`
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/mobile/src/screens/YouScreen.tsx`

**Interfaces:**
- Consumes: public web origin, support email, and Task 5 deletion operation.
- Produces: public `/privacy` and `/delete-account` URLs plus in-app links.

- [ ] **Step 1: Write failing route tests**

Assert both routes render without authentication. Privacy names collected
account/learning data, Supabase/processors, retention/deletion, support contact,
and no advertising/tracking. Delete Account explains scope, offers Sign in when
anonymous, and invokes the same deletion endpoint when authenticated.

- [ ] **Step 2: Verify failure**

```bash
npm test -- apps/web/src/pages/Privacy.test.jsx apps/web/src/pages/DeleteAccount.test.jsx
```

Expected: FAIL because routes do not exist.

- [ ] **Step 3: Write policy source and render page**

The Markdown is the canonical copy. Include effective date, collected data,
purpose, processors actually enabled in production, retention, security,
international processing, user rights, deletion URL, and support email. Do not
claim legal certifications or “100% secure”.

- [ ] **Step 4: Implement the deletion resource**

Anonymous users see exact sign-in instructions and a direct sign-in action that
returns to `/delete-account`. Authenticated users complete the same typed
confirmation and Edge Function call as mobile.

- [ ] **Step 5: Link from mobile You**

Open `${webUrl}/privacy` and `${webUrl}/delete-account` with `Linking.openURL`.
Validate origin through Task 1 config.

- [ ] **Step 6: Test, deploy web, and verify HTTPS**

```bash
npm test -- apps/web/src/pages/Privacy.test.jsx apps/web/src/pages/DeleteAccount.test.jsx
npm run build -w @hanyu/web
curl --fail --location "$HANYU_PUBLIC_WEB_URL/privacy"
curl --fail --location "$HANYU_PUBLIC_WEB_URL/delete-account"
```

Expected: tests/build pass and both public routes return `200` over HTTPS.

- [ ] **Step 7: Commit**

```bash
git add docs/legal apps/web/src apps/mobile/src/screens/YouScreen.tsx
git commit -m "feat(legal): publish privacy and deletion resources"
```

---

### Task 8: Version store text and truthful privacy disclosures

**Files:**
- Create: `store/metadata/en-US.json`
- Create: `store/metadata/es-ES.json`
- Create: `store/privacy-inventory.json`
- Create: `store/reviewer-notes.md`
- Create: `store/screenshots/README.md`
- Create: `scripts/render-store-metadata.mjs`
- Create: `scripts/render-store-metadata.test.mjs`
- Create: `scripts/audit-mobile-permissions.mjs`
- Create: `scripts/audit-mobile-permissions.test.mjs`
- Create: `store/generated/.gitignore`
- Modify: `package.json`

**Interfaces:**
- Consumes: public web URL/support email and the production dependency/config inventory.
- Produces: localized listing copy, resolved metadata, and permission/privacy audit.

- [ ] **Step 1: Add failing metadata validation**

The renderer must reject missing required keys, Apple subtitle over 30
characters, Google short description over 80, absent privacy/deletion/support
URLs, non-HTTPS URLs, and undeclared native permissions.

```bash
node --test scripts/render-store-metadata.test.mjs scripts/audit-mobile-permissions.test.mjs
```

Expected: FAIL because the renderer and auditor do not exist.

- [ ] **Step 2: Write versioned English and Spanish copy**

Each locale contains:

```json
{
  "name": "Hanyu",
  "subtitle": "Chinese study, every day",
  "shortDescription": "Learn HSK Chinese with review, exercises, readings, words, and grammar.",
  "fullDescription": "Build a steady Chinese study habit with Hanyu. Follow a focused daily session, review vocabulary with spaced repetition, and practise with five exercise types.\n\nRead levelled Chinese texts with word lookup and pronunciation, search the HSK word library, and revisit grammar patterns. Flashcard sessions remain available offline and synchronize when your connection returns.",
  "keywords": ["Chinese", "HSK", "flashcards", "reading", "grammar"],
  "category": "Education",
  "releaseNotes": "Initial release: daily study, five exercise types, readings, library, and offline flashcard review."
}
```

The Spanish file uses:

```json
{
  "name": "Hanyu",
  "subtitle": "Chino HSK cada día",
  "shortDescription": "Aprende chino HSK con repasos, ejercicios, lecturas, palabras y gramática.",
  "fullDescription": "Crea un hábito constante de estudio de chino con Hanyu. Sigue una sesión diaria guiada, repasa vocabulario con repetición espaciada y practica con cinco tipos de ejercicios.\n\nLee textos graduados con consulta de palabras y pronunciación, busca en la biblioteca HSK y repasa estructuras gramaticales. Las sesiones de tarjetas funcionan sin conexión y se sincronizan cuando vuelve la red.",
  "keywords": ["chino", "HSK", "tarjetas", "lectura", "gramática"],
  "category": "Education",
  "releaseNotes": "Primera versión: estudio diario, cinco tipos de ejercicios, lecturas, biblioteca y repaso de tarjetas sin conexión."
}
```

Do not add claims such as “best”, “AI tutor”, or “works fully offline”.

- [ ] **Step 3: Inventory actual data**

Record each category, purpose, linked-to-user state, tracking state, processor,
retention, and deletion behavior. Include email/account ID, learning settings,
SRS/review history, exercise/reading attempts, and generated-content inputs.
Record `tracking: false`, `advertising: false`, and no location/contacts/photos
only after the binary audit confirms them.

- [ ] **Step 4: Audit dependencies and permissions**

The script reads `app.config.ts`, mobile `package.json`, and Expo public config;
prints plugins/permissions/native modules; and fails if a sensitive capability
is absent from `privacy-inventory.json`.

- [ ] **Step 5: Render environment-specific metadata**

```bash
HANYU_PUBLIC_WEB_URL="$HANYU_PUBLIC_WEB_URL" \
HANYU_SUPPORT_EMAIL="$HANYU_SUPPORT_EMAIL" \
npm run store:render
npm run store:audit
node --test scripts/render-store-metadata.test.mjs scripts/audit-mobile-permissions.test.mjs
```

Expected: `store/generated` contains resolved HTTPS privacy, deletion, and
support URLs; audit exits `0`.

- [ ] **Step 6: Capture the required screenshot set**

Using the accepted preview build and a seeded demo account, capture Today,
Cards, Practice/Exercises, Reading detail, and Library at the phone dimensions
currently required by App Store Connect and Play Console. Store source PNGs
under locale/platform/device subdirectories and record exact dimensions,
device, locale, build ID, and capture steps in `store/screenshots/README.md`.
Do not include personal email addresses, pending-review errors, debug chrome, or
status-bar anomalies.

- [ ] **Step 7: Commit**

```bash
git add store/metadata store/privacy-inventory.json store/reviewer-notes.md store/screenshots store/generated/.gitignore scripts/render-store-metadata.mjs scripts/render-store-metadata.test.mjs scripts/audit-mobile-permissions.mjs scripts/audit-mobile-permissions.test.mjs package.json
git commit -m "docs(store): add listings and privacy disclosures"
```

---

### Task 9: Produce preview builds and run the signed-release matrix

**Files:**
- Create: `docs/testing/p4-signed-release-matrix.md`
- Create: `store/release-candidate.json`
- Create: `scripts/write-release-candidate.mjs`
- Modify: `apps/mobile/README.md`

**Interfaces:**
- Consumes: completed P1–P4 code and real EAS credentials.
- Produces: accepted iOS/Android candidate IDs tied to one Git commit.

- [ ] **Step 1: Freeze a clean candidate**

```bash
git status --short
npm test
npm test -w @hanyu/mobile -- --runInBand
npm run build -w @hanyu/web
npm run store:audit
```

Expected: clean worktree and every command passes.

- [ ] **Step 2: Build internal previews**

From `apps/mobile`:

```bash
npx eas-cli@latest build --platform ios --profile preview
npx eas-cli@latest build --platform android --profile preview
```

Expected: two successful build IDs and install URLs.

- [ ] **Step 3: Execute physical-device matrix**

On supported iOS and Android hardware verify: install/upgrade; icon/splash;
sign-up/sign-in; Today; all five exercises; reading token/audio/questions;
Words/Grammar; online Cards; cached airplane-mode Cards; force-close/reopen;
reconnect/sync; logout/cache removal; privacy links; password reset from real
email with app cold and warm; account deletion and next launch.

- [ ] **Step 4: Record immutable candidate details**

Have `write-release-candidate.mjs` read `IOS_BUILD_ID` and `ANDROID_BUILD_ID`,
validate that both are nonempty, and write the current full Git SHA and current
ISO timestamp. Capture the latest successful preview IDs and generate the file:

```bash
export IOS_BUILD_ID="$(cd apps/mobile && npx eas-cli@latest build:list --platform ios --profile preview --status finished --limit 1 --json --non-interactive | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s)[0].id))")"
export ANDROID_BUILD_ID="$(cd apps/mobile && npx eas-cli@latest build:list --platform android --profile preview --status finished --limit 1 --json --non-interactive | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s)[0].id))")"
node scripts/write-release-candidate.mjs
```

Expected: the JSON contains version `1.0.0`, the current full SHA, both real EAS
IDs, and an ISO timestamp.

- [ ] **Step 5: Commit the runbook, not generated credentials**

```bash
git add docs/testing/p4-signed-release-matrix.md store/release-candidate.json scripts/write-release-candidate.mjs apps/mobile/README.md
git commit -m "test(release): accept signed mobile candidate"
```

---

### Task 10: Distribute through TestFlight and Google Play Internal Testing

**Files:**
- Create: `store/submission-log.md`
- Modify: `store/reviewer-notes.md`

**Interfaces:**
- Consumes: accepted candidate, Apple/Google agreements, app records, signing credentials, testers.
- Produces: tester-accessible store builds and recorded external status.

- [ ] **Step 1: Create/verify store records**

In App Store Connect and Play Console, create Hanyu with exact identifiers,
primary Education category, default language English, privacy/support/deletion
URLs, age/content answers, and data disclosures from Task 8. Do not guess an
answer; reconcile any console wording with the inventory.

- [ ] **Step 2: Build production binaries from the accepted commit**

```bash
test "$(git rev-parse HEAD)" = "$(node -p "require('./store/release-candidate.json').gitCommit")"
cd apps/mobile
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest build --platform android --profile production
```

Expected: successful signed `.ipa` and `.aab` builds.

- [ ] **Step 3: Submit iOS and enable TestFlight internal testing**

```bash
npx eas-cli@latest submit --platform ios --profile production --latest
```

Expected: binary reaches App Store Connect processing. After processing, assign
the build to internal testers, complete export-compliance answers, and verify
install/launch from TestFlight.

- [ ] **Step 4: Submit Android to Internal Testing**

```bash
npx eas-cli@latest submit --platform android --profile production --latest
```

Expected: AAB appears on Internal Testing. Add up to the required tester list,
publish the internal release, and verify Play Store installation.

- [ ] **Step 5: Resolve only release blockers**

Classify tester findings as blocking/nonblocking. Fix blocking crashes, auth,
data loss, deletion, privacy, deep-link, offline-sync, or store-policy issues;
rerun Task 9 and submit a new build number. Do not add unrelated features.

- [ ] **Step 6: Record external state**

In `submission-log.md`, record build IDs/numbers, upload timestamps, processing
status, tester groups, privacy/deletion URL checks, findings, and whether the
Google account requires a closed-testing gate.

- [ ] **Step 7: Commit**

```bash
git add store/submission-log.md store/reviewer-notes.md
git commit -m "docs(store): record internal distribution"
```

---

### Task 11: Prepare production review handoff

**Files:**
- Create: `store/production-review-checklist.md`
- Modify: `store/submission-log.md`

**Interfaces:**
- Consumes: accepted internal builds and completed store metadata.
- Produces: owner-ready manual production review handoff.

- [ ] **Step 1: Complete final automated verification**

```bash
npm test
npm test -w @hanyu/mobile -- --runInBand
npm run build -w @hanyu/web
npm run assets:mobile:check
npm run store:audit
curl --fail "$HANYU_PUBLIC_WEB_URL/privacy"
curl --fail "$HANYU_PUBLIC_WEB_URL/delete-account"
```

Expected: all pass.

- [ ] **Step 2: Complete the per-store checklist**

Verify screenshots, descriptions, keywords, category, age rating, privacy
answers, Data Safety, content rights, support/privacy/deletion URLs, reviewer
notes, demo account if needed, export compliance, countries, pricing, release
mode, and accepted agreements.

- [ ] **Step 3: Handle Google closed-testing policy when applicable**

If the account is a personal account subject to mandatory closed testing,
create the required closed track, enroll the required testers for the required
duration shown by Play Console, collect feedback, and record completion before
requesting production access. Treat the console's current requirement as the
source of truth.

- [ ] **Step 4: Hand off final review actions**

The release owner manually selects the accepted build and submits for App
Review/Google production review. Record confirmation IDs/status. Do not claim
approval until each console reports approval.

- [ ] **Step 5: Commit the release record**

```bash
git add store/production-review-checklist.md store/submission-log.md
git commit -m "docs(store): prepare production review handoff"
```

## Definition of Done for P4

- [ ] Production identity and EAS profiles resolve without secrets in public config.
- [ ] Approved icons/splash pass scripted and physical checks.
- [ ] Real-email password reset works with the app cold and warm.
- [ ] In-app and web account deletion remove Auth, owned data, and local cache.
- [ ] Privacy/support/deletion URLs are public HTTPS resources.
- [ ] Localized listings and privacy disclosures match the accepted binary.
- [ ] The same commit passes the full signed iOS/Android matrix.
- [ ] TestFlight internal and Google Play Internal Testing installs succeed.
- [ ] Any account-specific closed-testing requirement is documented as a gate.
- [ ] Production binaries and metadata are ready for the owner's manual review submission.

## Official References to Re-check at Execution Time

- Expo EAS Build setup: `https://docs.expo.dev/build/setup/`
- Expo store submission: `https://docs.expo.dev/deploy/submit-to-app-stores/`
- Expo iOS submission: `https://docs.expo.dev/submit/ios/`
- Supabase native deep linking: `https://supabase.com/docs/guides/auth/native-mobile-deep-linking`
- Apple App Review Guidelines: `https://developer.apple.com/app-store/review/guidelines/`
- Apple account deletion: `https://developer.apple.com/support/offering-account-deletion-in-your-app`
- Google Play account deletion: `https://support.google.com/googleplay/android-developer/answer/13327111`
- Google Play testing tracks: `https://support.google.com/googleplay/android-developer/answer/9845334`
