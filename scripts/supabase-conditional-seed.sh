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
