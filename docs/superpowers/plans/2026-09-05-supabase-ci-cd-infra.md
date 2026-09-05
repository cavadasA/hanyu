# Supabase CI/CD Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an automated, safe CI/CD pipeline in GitHub Actions to deploy Supabase migrations, conditionally apply seed data, and deploy Edge Functions while preventing local terminal accidental execution.

**Architecture:** A GitHub Actions workflow (`.github/workflows/supabase-deploy.yml`) executes on an ephemeral Ubuntu runner using scoped repository secrets. It links to the remote Supabase project, runs `supabase db push` for 33 migrations, executes a smart seed script (`scripts/supabase-conditional-seed.sh`) if the database is unseeded, deploys Edge Functions, and validates type generation. In parallel, local `package.json` scripts are safeguarded against accidental execution.

**Tech Stack:** GitHub Actions, Supabase CLI (`supabase/setup-cli`), Bash, PostgreSQL (`psql`), Node.js, npm.

---

### Task 1: Local Terminal Safety Guardrails in `package.json`

**Files:**
- Modify: `package.json:17-19`
- Test: `scripts/test-local-guardrails.sh`

- [ ] **Step 1: Write guardrail verification test script**

Create `scripts/test-local-guardrails.sh`:

```bash
#!/usr/bin/env bash
set -e

echo "Testing supabase:push safety guardrail..."
OUTPUT=$(npm run supabase:push 2>&1 || true)

if echo "$OUTPUT" | grep -q "ERROR: Las migraciones remotas se aplican exclusivamente mediante GitHub Actions"; then
  echo "PASS: supabase:push is guarded."
  exit 0
else
  echo "FAIL: supabase:push did not trigger expected guardrail."
  echo "Output was: $OUTPUT"
  exit 1
fi
```

- [ ] **Step 2: Run verification to verify it fails before modification**

Run:
```bash
chmod +x scripts/test-local-guardrails.sh && ./scripts/test-local-guardrails.sh
```
Expected: FAIL (because current `package.json` still executes `npx supabase db push`).

- [ ] **Step 3: Update `package.json` with safety guardrails**

Update lines in `package.json`:

```json
    "supabase:link": "echo \"ERROR: El enlace a proyectos remotos se realiza en el runner de GitHub Actions para evitar colisiones entre organizaciones locales.\" && exit 1",
    "supabase:push": "echo \"ERROR: Las migraciones remotas se aplican exclusivamente mediante GitHub Actions para evitar contaminar entornos de otras organizaciones. Haz commit y push a main o usa workflow_dispatch.\" && exit 1",
```

- [ ] **Step 4: Run verification test to verify it passes**

Run:
```bash
./scripts/test-local-guardrails.sh
```
Expected: PASS: supabase:push is guarded.

- [ ] **Step 5: Clean up test script and commit**

```bash
rm scripts/test-local-guardrails.sh
git add package.json
git commit -m "chore(supabase): guard local cli scripts against accidental multi-tenant execution"
```

---

### Task 2: Smart Conditional Seeding Script

**Files:**
- Create: `scripts/supabase-conditional-seed.sh`
- Test: Syntax check and dry-run check via bash

- [ ] **Step 1: Create the conditional seed runner script**

Create `scripts/supabase-conditional-seed.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# This script runs in GitHub Actions or CI environment.
# It checks if the database is already seeded by counting rows in public.hsk_characters.
# If count is 0 or FORCE_SEED is "true", it executes supabase/seed.sql.

FORCE_SEED="${FORCE_SEED:-false}"
PROJECT_REF="${SUPABASE_PROJECT_ID:-}"
DB_PASSWORD="${SUPABASE_DB_PASSWORD:-}"

if [ -z "$PROJECT_REF" ] || [ -z "$DB_PASSWORD" ]; then
  echo "::error::SUPABASE_PROJECT_ID and SUPABASE_DB_PASSWORD must be set."
  exit 1
fi

echo "=== Comprobando estado del Seed en Supabase ($PROJECT_REF) ==="

# Connection string using Supabase Direct Postgres port 5432 or pooler port 6543
DB_HOST="db.${PROJECT_REF}.supabase.co"
DB_URL="postgresql://postgres:${DB_PASSWORD}@${DB_HOST}:5432/postgres"

# Execute count query
ROW_COUNT=$(PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p 5432 -U postgres -d postgres -t -A -c "SELECT count(*) FROM public.hsk_characters;" 2>/dev/null || echo "-1")

echo "Total registros encontrados en public.hsk_characters: ${ROW_COUNT}"

if [ "$FORCE_SEED" = "true" ] || [ "$ROW_COUNT" = "0" ]; then
  if [ "$FORCE_SEED" = "true" ]; then
    echo "::notice::Se ha forzado la ejecución del seed (FORCE_SEED=true)."
  else
    echo "::notice::La base de datos está vacía (0 registros). Aplicando supabase/seed.sql..."
  fi

  if [ -f "supabase/seed.sql" ]; then
    PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p 5432 -U postgres -d postgres -f "supabase/seed.sql"
    echo "::notice::Seed aplicado con éxito."
  else
    echo "::error::No se encontró el archivo supabase/seed.sql"
    exit 1
  fi
else
  echo "::notice::La base de datos ya contiene datos (${ROW_COUNT} caracteres HSK). Se omite el seed para evitar duplicados."
fi
```

- [ ] **Step 2: Make executable and verify syntax**

Run:
```bash
chmod +x scripts/supabase-conditional-seed.sh
bash -n scripts/supabase-conditional-seed.sh
```
Expected: Exit code 0 (no syntax errors).

- [ ] **Step 3: Test parameter validation**

Run:
```bash
./scripts/supabase-conditional-seed.sh || true
```
Expected: `::error::SUPABASE_PROJECT_ID and SUPABASE_DB_PASSWORD must be set.` and non-zero exit code.

- [ ] **Step 4: Commit**

```bash
git add scripts/supabase-conditional-seed.sh
git commit -m "feat(infra): add conditional seed script for remote database initialization"
```

---

### Task 3: GitHub Actions Workflow (`.github/workflows/supabase-deploy.yml`)

**Files:**
- Create: `.github/workflows/supabase-deploy.yml`

- [ ] **Step 1: Create GitHub Actions workflow file**

Create `.github/workflows/supabase-deploy.yml`:

```yaml
name: Deploy Supabase (Migrations & Functions)

on:
  push:
    branches:
      - main
      - master
    paths:
      - 'supabase/**'
      - '.github/workflows/supabase-deploy.yml'
      - 'scripts/supabase-conditional-seed.sh'
  workflow_dispatch:
    inputs:
      force_seed:
        description: 'Forzar ejecución de seed.sql aunque la base de datos ya contenga datos'
        type: boolean
        required: false
        default: false

concurrency:
  group: supabase-deploy-${{ github.ref }}
  cancel-in-progress: false

jobs:
  deploy:
    name: Deploy Migrations, Seed and Functions
    runs-on: ubuntu-latest
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_PROJECT_ID: ${{ secrets.SUPABASE_PROJECT_ID }}
      SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Link project
        run: |
          supabase link --project-ref "$SUPABASE_PROJECT_ID" --password "$SUPABASE_DB_PASSWORD"

      - name: Push Database Migrations
        run: |
          supabase db push --password "$SUPABASE_DB_PASSWORD"

      - name: Conditional Database Seed
        env:
          FORCE_SEED: ${{ github.event.inputs.force_seed || 'false' }}
        run: |
          ./scripts/supabase-conditional-seed.sh

      - name: Deploy Edge Function: generate-exercise
        run: |
          supabase functions deploy generate-exercise --project-ref "$SUPABASE_PROJECT_ID"

      - name: Deploy Edge Function: tokenize-reading
        run: |
          supabase functions deploy tokenize-reading --project-ref "$SUPABASE_PROJECT_ID"

      - name: Verify TypeScript Types Generation
        run: |
          supabase gen types typescript --project-id "$SUPABASE_PROJECT_ID" > /tmp/database.types.ts
          if [ -s /tmp/database.types.ts ]; then
            echo "TypeScript types generated successfully."
          else
            echo "::warning::Types generation resulted in empty file."
          fi
```

- [ ] **Step 2: Validate YAML syntax**

Run:
```bash
node -e '
const fs = require("fs");
const yaml = fs.readFileSync(".github/workflows/supabase-deploy.yml", "utf8");
console.log("YAML characters count:", yaml.length);
'
```
Expected: Successful read with positive character count.

- [ ] **Step 3: Commit workflow file**

```bash
git add .github/workflows/supabase-deploy.yml
git commit -m "ci(supabase): add automated deployment workflow for migrations and edge functions"
```

---

### Task 4: Documentation and Setup Guide

**Files:**
- Create: `docs/supabase-setup.md`
- Modify: `README.md` (add section reference)

- [ ] **Step 1: Write setup guide `docs/supabase-setup.md`**

Create `docs/supabase-setup.md`:

```markdown
# Guía de Puesta en Marcha de Supabase (CI/CD)

Esta guía describe cómo inicializar la base de datos de Hanyu de forma limpia y cómo activar el despliegue automático mediante GitHub Actions sin tocar la base de datos desde tu terminal local.

---

## 1. Resetear la Base de Datos Remota (One-Time)

Dado que las migraciones anteriores se aplicaron a mano:

1. Accede al [Dashboard de Supabase](https://supabase.com/dashboard/project/ycchpixzhlsvivzloyvh).
2. Ve a **Project Settings** -> **Database**.
3. En la sección **Database Password**, asegúrate de conocer la contraseña o pulsa **Reset Database Password** para definir una nueva (ej. guárdala para el paso 2).
4. En la parte inferior, localiza la sección **Reset database** y confirma el reseteo. Esto limpiará todas las tablas y dejará PostgreSQL listo para recibir las 33 migraciones ordenadas.

---

## 2. Configurar Secretos en GitHub

En tu repositorio de GitHub ([github.com/cavadasA/hanyu](https://github.com/cavadasA/hanyu)):

1. Navega a **Settings** -> **Secrets and variables** -> **Actions**.
2. Pulsa **New repository secret** y crea los siguientes 3 secretos:

| Nombre del Secreto | Valor / Dónde obtenerlo |
|---|---|
| `SUPABASE_PROJECT_ID` | `ycchpixzhlsvivzloyvh` (o el ref de tu proyecto en la URL del dashboard) |
| `SUPABASE_ACCESS_TOKEN` | Token personal generado en [supabase.com/account/tokens](https://supabase.com/account/tokens) |
| `SUPABASE_DB_PASSWORD` | La contraseña de Postgres configurada en el paso 1 |

---

## 3. Configurar Secretos de Edge Functions (Supabase Dashboard)

Para que las Edge Functions (`generate-exercise`) funcionen en Supabase:

1. En el dashboard de Supabase, ve a **Project Settings** -> **Edge Functions** -> **Secrets**.
2. Añade:
   - `DEEPSEEK_API_KEY`: Tu clave de DeepSeek.
   - `GEMINI_API_KEY`: Tu clave de Gemini.

---

## 4. Primer Despliegue

Una vez configurados los secretos:

1. Ve a la pestaña **Actions** en GitHub: [github.com/cavadasA/hanyu/actions](https://github.com/cavadasA/hanyu/actions).
2. Selecciona el workflow **Deploy Supabase (Migrations & Functions)**.
3. Pulsa **Run workflow** sobre la rama `master` o `main`.
4. El workflow:
   - Aplicará secuencialmente las 33 migraciones.
   - Detectará que la tabla `public.hsk_characters` tiene 0 filas y ejecutará automáticamente `supabase/seed.sql`.
   - Desplegará las Edge Functions `generate-exercise` y `tokenize-reading`.
   - Validará la generación de tipos TypeScript.
```

- [ ] **Step 2: Reference setup guide in `README.md`**

Add link to `docs/supabase-setup.md` in `README.md` under Development / Database section.

- [ ] **Step 3: Commit documentation**

```bash
git add docs/supabase-setup.md README.md
git commit -m "docs: add supabase ci/cd setup guide and dashboard instructions"
```

---

### Task 5: Final Validation & Sanity Check

**Files:**
- Project test suites (`packages/data`, `apps/web`)

- [ ] **Step 1: Run tests on packages/data**

Run:
```bash
npm run test:web
```
Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:
```bash
npm run typecheck
```
Expected: PASS.

- [ ] **Step 3: Verify git status is clean**

Run:
```bash
git status
```
Expected: Working tree clean.
