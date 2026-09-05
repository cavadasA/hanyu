#!/usr/bin/env bash
set -euo pipefail

FORCE_SEED="${FORCE_SEED:-false}"
PROJECT_REF="${SUPABASE_PROJECT_ID:-}"
DB_PASSWORD="${SUPABASE_DB_PASSWORD:-}"
DB_HOST="${SUPABASE_DB_HOST:-db.${PROJECT_REF}.supabase.co}"
DB_PORT="${SUPABASE_DB_PORT:-5432}"

if [ -z "$PROJECT_REF" ] || [ -z "$DB_PASSWORD" ]; then
  echo "::error::SUPABASE_PROJECT_ID and SUPABASE_DB_PASSWORD must be set."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "::error::psql command not found. Please ensure postgresql-client is installed."
  exit 1
fi

echo "=== Comprobando estado del Seed en Supabase ($PROJECT_REF) ==="

QUERY_OUTPUT=$(PGPASSWORD="${DB_PASSWORD}" PGSSLMODE="require" psql \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U postgres \
  -d postgres \
  -v ON_ERROR_STOP=1 \
  -t -A \
  -c "SELECT count(*) FROM public.hsk_characters;" 2>&1) || {
    echo "::error::Error al conectar o consultar la base de datos Supabase:"
    echo "$QUERY_OUTPUT"
    exit 1
}

ROW_COUNT="$(echo "$QUERY_OUTPUT" | tr -d '[:space:]')"

if ! [[ "$ROW_COUNT" =~ ^[0-9]+$ ]]; then
  echo "::error::Respuesta inesperada al consultar filas: '$ROW_COUNT'"
  exit 1
fi

echo "Total registros encontrados en public.hsk_characters: ${ROW_COUNT}"

if [ "$FORCE_SEED" = "true" ] || [ "$ROW_COUNT" = "0" ]; then
  if [ "$FORCE_SEED" = "true" ]; then
    echo "::notice::Se ha forzado la ejecución del seed (FORCE_SEED=true)."
  else
    echo "::notice::La base de datos está vacía (0 registros). Aplicando supabase/seed.sql..."
  fi

  if [ -f "supabase/seed.sql" ]; then
    PGPASSWORD="${DB_PASSWORD}" PGSSLMODE="require" psql \
      -h "${DB_HOST}" \
      -p "${DB_PORT}" \
      -U postgres \
      -d postgres \
      -v ON_ERROR_STOP=1 \
      -f "supabase/seed.sql"
    echo "::notice::Seed aplicado con éxito."
  else
    echo "::error::No se encontró el archivo supabase/seed.sql"
    exit 1
  fi
else
  echo "::notice::La base de datos ya contiene datos (${ROW_COUNT} caracteres HSK). Se omite el seed para evitar duplicados."
fi
