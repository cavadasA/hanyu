# Hanyu Mobile

Expo app sharing `@hanyu/data` with the web client.

## Setup

```bash
cp .env.example .env   # paste EXPO_PUBLIC_SUPABASE_ANON_KEY
npm install            # from the repo root
npm run dev:mobile     # from the repo root
```

## Scope through P2

Auth (sign in, sign up, reset email), Today, Cards, Practice, Library, and You.
Practice includes Exercises and Readings. Library includes Words and Grammar.
Offline review arrives in P3, and store builds in P4.

Completing a password reset happens on the web: the email link points at the web
app until the native deep link ships in P4.

## Manual verification checklist

Automated tests cannot cover these. Run them on real hardware before calling
the current phase done.

- [ ] Sign in on iOS, force-quit the app, reopen it: still signed in.
- [ ] Background the app for 30 minutes, return: no forced re-login, and Today reloads.
- [ ] Same account on iOS and Android shows the same deck size, due count, and streak.
- [ ] Review a card on mobile, refresh the web dashboard: the reviewed count moved.
- [ ] New account: sign up, create the starter deck, review one card, Today shows 1 of 3 blocks.
- [ ] Enable airplane mode mid-session, rate a card: a visible error appears, the card stays, and retry works after reconnecting.
- [ ] Listening mode pronounces the hanzi in Mandarin on a device with a Chinese voice installed.
- [ ] Change the theme in You: it applies immediately and survives a restart.

## P2 verification

Automated checks:

```bash
npm test
npm test -w @hanyu/mobile -- --runInBand
npx tsc -p packages/data/tsconfig.json --noEmit
npx tsc -p apps/mobile/tsconfig.json --noEmit
npx expo export --platform all
```

Manual P2 matrix:

- [ ] iOS: all five exercise types generate, accept answers, show feedback, and advance to Next.
- [ ] Android: all five exercise types generate, accept answers, show feedback, and advance to Next.
- [ ] Reading generation opens the new reading detail.
- [ ] Reading detail plays full-text audio, toggles pinyin, opens known-word and unknown-word popups, and submits comprehension once.
- [ ] Words search waits briefly before loading, filters by HSK level, pages forward/back, and Add changes to Added.
- [ ] Grammar filters by HSK level and detail pages render pattern, explanation, and examples as plain text.
- [ ] Today Start exercises and Start reading open their mobile destinations.
- [ ] Light and dark themes keep Practice and Library readable.
- [ ] Web dashboard reflects exactly one exercise completion and exactly one reading completion after mobile submission.
