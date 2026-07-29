# Supabase Deployment

This project now follows a Supabase-first architecture for production and mobile compatibility.

## Services

- Supabase project: `ycchpixzhlsvivzloyvh`
- Supabase URL: `https://ycchpixzhlsvivzloyvh.supabase.co`
- Static hosting for the Vite build

## Environment

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_ANON_KEY` from Supabase Dashboard -> Settings -> API.
3. Do not expose service role keys in client env files.

## Schema and Seeds

Use either SQL Editor or CLI.

### Option A: SQL Editor

1. Open `https://supabase.com/dashboard/project/ycchpixzhlsvivzloyvh/sql`.
2. Run migrations in order:
   - `supabase/migrations/202607280001_initial_schema.sql`
   - `supabase/migrations/202607280002_learning_rpc.sql`
   - `supabase/migrations/202607280003_dashboard_rpc.sql`
3. Generate and run seed SQL:
   - `npm run build:supabase-seed`
   - run `supabase/seed.sql` in SQL Editor.
4. Run verification queries from `supabase/verification-queries.sql`.

### Option B: CLI

```bash
npm run supabase:link
npm run supabase:push
npm run build:supabase-seed
```

Then run `supabase/seed.sql` in SQL Editor (or trusted psql workflow).

## Edge Functions

Deploy functions:

```bash
npm run supabase:link
npx supabase functions deploy generate-exercise
npx supabase functions deploy generate-reading
```

Set secrets if AI providers are enabled:

```bash
npx supabase secrets set DEEPSEEK_API_KEY=<value>
npx supabase secrets set GEMINI_API_KEY=<value>
```

## App Verification

```bash
npm test
npm run build
```

Manual checks:

- Signup/login works.
- Flashcard review updates next review and stats.
- Settings persist in `user_settings`.
- Exercise and reading generation return fallback content when AI is unavailable.
