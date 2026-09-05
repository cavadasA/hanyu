# Especificación de Diseño: Supabase CI/CD e Infraestructura Segura

**Fecha:** 2026-09-05  
**Estado:** Propuesta  
**Autor:** Antigravity / cavadasA  

---

## 1. Contexto y Objetivos

### 1.1 Contexto
- Las migraciones actuales de Hanyu (`supabase/migrations/*.sql`, 33 archivos) fueron aplicadas manualmente en el editor SQL de Supabase sin un historial formal sincronizado con el CLI (`supabase_migrations.schema_migrations`).
- La base de datos puede resetearse desde cero sin problemas de pérdida de datos productivos.
- **Riesgo crítico local:** La máquina y terminal del desarrollador pueden tener sesiones o vinculaciones activas con proyectos de Supabase de otras organizaciones o clientes. Ejecutar comandos como `npx supabase db push` o `npx supabase link` en la terminal local acarrea un riesgo inaceptable de corrupción cruzada de bases de datos.

### 1.2 Objetivos
1. **Aislamiento absoluto:** Eliminar la necesidad de ejecutar comandos de migración o conexión a la nube desde la terminal local.
2. **Pipeline automatizado (CI/CD):** Desplegar migraciones y Edge Functions de forma automática y reproducible en GitHub Actions mediante runners limpios y efímeros.
3. **Carga condicional de datos iniciales (*Seed*):** Ejecutar `supabase/seed.sql` automáticamente si y solo si la base de datos está vacía (0 registros en `public.hsk_characters`), o si se solicita explícitamente vía `workflow_dispatch`.
4. **Despliegue de Edge Functions:** Desplegar automáticamente `generate-exercise` y `tokenize-reading` tras la aplicación de las migraciones.
5. **Protección en `package.json`:** Neutralizar scripts locales potencialmente destructivos (`supabase:push`) para evitar ejecuciones accidentales en la terminal.

---

## 2. Arquitectura de la Solución

```
   ┌─────────────────────────────────────────────────────────┐
   │                     DESARROLLO LOCAL                    │
   │  - Edición de código y migraciones (supabase/migrations)│
   │  - Git commit y push a la rama 'main'                   │
   │  - Scripts locales protegidos contra ejecución a ciegas │
   └───────────────────────────┬─────────────────────────────┘
                               │ git push
                               ▼
   ┌─────────────────────────────────────────────────────────┐
   │               GITHUB ACTIONS RUNNER (CI/CD)             │
   │               (Ambiente aislado y efímero)              │
   │                                                         │
   │  1. Checkout de código                                  │
   │  2. Setup Supabase CLI con version fija                 │
   │  3. supabase link con secretos de repo                  │
   │  4. supabase db push (aplica 33 migraciones ordenadas)  │
   │  5. Check de seed:                                      │
   │     ¿public.hsk_characters vacío o force_seed=true?     │
   │       ├── SÍ ─► Ejecutar supabase/seed.sql              │
   │       └── NO ─► Omitir seed                             │
   │  6. supabase functions deploy (Edge Functions)          │
   │  7. Verificación de tipos TypeScript                    │
   └───────────────────────────┬─────────────────────────────┘
                               │ Conexión segura con secrets
                               ▼
   ┌─────────────────────────────────────────────────────────┐
   │                    SUPABASE (REMOTO)                    │
   │  Project Ref: ycchpixzhlsvivzloyvh                      │
   │  - PostgreSQL con historial en schema_migrations        │
   │  - Tablas inicializadas con seed (vocabulario HSK, etc) │
   │  - Edge Functions desplegadas                           │
   └─────────────────────────────────────────────────────────┘
```

---

## 3. Especificación Detallada de Componentes

### 3.1 Workflow de GitHub Actions (`.github/workflows/supabase-deploy.yml`)

#### Triggers
- **`push`**: A las ramas `main` o `master` cuando se modifican:
  - `supabase/**`
  - `.github/workflows/supabase-deploy.yml`
- **`workflow_dispatch`**: Disparo manual desde la pestaña "Actions" de GitHub, con el siguiente input opcional:
  - `force_seed`: Boolean (default: `false`, descripción: `"Forzar ejecución de seed.sql aunque la base ya contenga datos"`).

#### Secretos requeridos en el repositorio de GitHub:
- `SUPABASE_PROJECT_ID`: El project-ref (ej. `ycchpixzhlsvivzloyvh`).
- `SUPABASE_ACCESS_TOKEN`: Token de acceso personal generado en [supabase.com/account/tokens](https://supabase.com/account/tokens).
- `SUPABASE_DB_PASSWORD`: Contraseña de Postgres del proyecto en Supabase.

#### Pasos del Job `deploy`:
1. **Checkout**: `actions/checkout@v4`.
2. **Setup CLI**: `supabase/setup-cli@v1` con versión `latest` o `v2.110.0`.
3. **Link**:
   ```bash
   supabase link --project-ref "${{ secrets.SUPABASE_PROJECT_ID }}" --password "${{ secrets.SUPABASE_DB_PASSWORD }}"
   env:
     SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
   ```
4. **Push de Migraciones**:
   ```bash
   supabase db push --password "${{ secrets.SUPABASE_DB_PASSWORD }}"
   env:
     SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
   ```
5. **Carga Inteligente de Seed**:
   Script integrado en Node.js o Bash que verifica:
   - Conexión mediante Postgres Pooler/Direct o CLI para comprobar `SELECT count(*) FROM public.hsk_characters;`.
   - Si `count == 0` o `github.event.inputs.force_seed == 'true'`:
     Ejecuta `supabase/seed.sql` mediante `psql` o el CLI.
   - Si `count > 0`: Registra mensaje informativo y omite el paso.
6. **Despliegue de Edge Functions**:
   ```bash
   supabase functions deploy generate-exercise --project-ref "${{ secrets.SUPABASE_PROJECT_ID }}"
   supabase functions deploy tokenize-reading --project-ref "${{ secrets.SUPABASE_PROJECT_ID }}"
   env:
     SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
   ```
7. **Verificación de tipos TypeScript**:
   - Opcionalmente genera los tipos de la BD con `supabase gen types typescript --linked` y verifica que compilen o notifica discrepancias.

---

### 3.2 Protección en el Entorno Local (`package.json`)

Para evitar ejecuciones accidentales en terminales locales compartidas:
- Modificar `"supabase:push"` en [package.json](file:///Users/antoniocavadas/Documents/hanyu/package.json):
  Reemplazar el comando directo por un script seguro de advertencia:
  ```json
  "supabase:push": "echo \"ERROR: Las migraciones remotas se aplican exclusivamente mediante GitHub Actions para evitar contaminar entornos de otras organizaciones. Haz commit y push a main o usa workflow_dispatch.\" && exit 1"
  ```
- Mantener `"gen:types"` o comandos seguros de solo lectura si es necesario.

---

### 3.3 Procedimiento de Inicialización (One-Time Setup)

1. **Reset en Dashboard de Supabase**:
   - Acceder al panel de Supabase del proyecto `hanyu` (`ycchpixzhlsvivzloyvh`).
   - Ir a **Settings** -> **Database**.
   - En la sección inferior, ejecutar **Reset Database** (o actualizar la contraseña de la base si no se recuerda).
2. **Configuración de Secretos en GitHub**:
   - En el repositorio de GitHub (`https://github.com/cavadasA/hanyu/settings/secrets/actions`):
     - Añadir `SUPABASE_PROJECT_ID`.
     - Añadir `SUPABASE_ACCESS_TOKEN`.
     - Añadir `SUPABASE_DB_PASSWORD`.
3. **Secrets de Edge Functions**:
   - En el panel de Supabase (**Project Settings** -> **Edge Functions** -> **Secrets**):
     - Configurar `DEEPSEEK_API_KEY` y `GEMINI_API_KEY` si las funciones los requieren en tiempo de ejecución.
4. **Disparo Inicial**:
   - Hacer push del nuevo workflow a `main` (o ejecutarlo manualmente mediante `workflow_dispatch`).
   - El workflow creará todas las 33 migraciones en orden, detectará que `hsk_characters` tiene 0 filas, aplicará `seed.sql`, y desplegará las Edge Functions.

---

## 4. Plan de Pruebas y Validación

1. **Validación de Sintaxis del Workflow**:
   - Chequeo de sintaxis YAML con `actionlint` o validación de schema.
2. **Validación de Migraciones en Orden**:
   - Asegurar que los 33 ficheros en `supabase/migrations/` no contienen referencias circulares o sentencias incompatibles al ejecutarse consecutivamente sobre una base vacía.
3. **Validación de Idempotencia del Seed**:
   - Probar que el check de conteo previene ejecuciones duplicadas de `seed.sql`.
4. **Verificación de Conexión de Clientes**:
   - Ejecutar la suite de tests de frontend/data (`npm run test`) para validar que las firmas y RPCs esperadas siguen cumpliendo el contrato.
