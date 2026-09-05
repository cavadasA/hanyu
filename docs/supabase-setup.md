# Guía de Puesta en Marcha de Supabase (CI/CD)

Esta guía describe cómo inicializar la base de datos de Hanyu de forma limpia y cómo activar el despliegue automático mediante GitHub Actions sin tocar la base de datos desde tu terminal local.

---

## 1. Resetear la Base de Datos Remota (One-Time)

El panel web de Supabase no dispone de un botón "Reset Database" para proyectos remotos alojados en la nube. Puedes dejar la base de datos limpia de dos formas muy sencillas sin usar tu terminal local:

### Método A: Desde el SQL Editor de Supabase (Recomendado, 10 segundos)
1. Accede a tu panel de Supabase: [SQL Editor](https://supabase.com/dashboard/project/ycchpixzhlsvivzloyvh/sql).
2. Haz clic en **New query**, pega el siguiente código y pulsa **Run**:
   ```sql
   DROP SCHEMA IF EXISTS public CASCADE;
   CREATE SCHEMA public;
   GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;
   GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
   GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;
   GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

   DROP SCHEMA IF EXISTS supabase_migrations CASCADE;
   ```
3. Esto elimina instantáneamente cualquier tabla residual y el historial manual previo de migraciones, dejando PostgreSQL como nuevo.

### Método B: Automáticamente vía GitHub Actions
Configura los secretos en GitHub (Paso 2) y, al ejecutar el workflow en la pestaña **Actions**, marca la casilla:
`ATENCIÓN: Resetear base de datos remota antes de migrar (supabase db reset --linked)`
El runner ejecutará el reseteo remoto de forma aislada.

> **Nota sobre la contraseña**: Si no recuerdas la contraseña de la base de datos Postgres, ve a [Project Settings -> Database](https://supabase.com/dashboard/project/ycchpixzhlsvivzloyvh/settings/database) y pulsa **Reset Database Password** para establecer una nueva (la necesitarás para el secreto `SUPABASE_DB_PASSWORD`).

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

Para que las Edge Functions (`generate-exercise`) funcionen en Supabase con IA:

1. En el dashboard de Supabase, ve a **Project Settings** -> **Edge Functions** -> **Secrets**.
2. Añade las claves correspondientes al proveedor de IA que utilices (ambas son opcionales según tu configuración):
   - `DEEPSEEK_API_KEY`: Tu clave de DeepSeek (opcional si usas Gemini).
   - `GEMINI_API_KEY`: Tu clave de Gemini (opcional si usas DeepSeek).

---

## 4. Despliegue de Migraciones y Funciones

### Primer Despliegue (Manual)

Una vez configurados los secretos:

1. Ve a la pestaña **Actions** en GitHub: [github.com/cavadasA/hanyu/actions](https://github.com/cavadasA/hanyu/actions).
2. Selecciona el workflow **Deploy Supabase (Migrations & Functions)**.
3. Pulsa **Run workflow** sobre la rama `master` o `main`.
   - **Nota sobre `force_seed`**: El workflow incluye un parámetro opcional `force_seed` (por defecto desmarcado/`false`). Si la base de datos ya contiene datos en `hsk_characters`, el script omite el seed automáticamente para proteger los datos. Marca `force_seed` solo si deseas forzar la re-ejecución del script `supabase/seed.sql`.
4. El workflow:
   - Aplicará secuencialmente las migraciones pendientes.
   - Detectará si la tabla `public.hsk_characters` tiene 0 filas (o si `force_seed` está activo) y ejecutará `supabase/seed.sql`.
   - Desplegará las Edge Functions `generate-exercise` y `tokenize-reading`.
   - Validará la generación de tipos TypeScript.

### Despliegues Posteriores (Auto-deploy on push)

- Una vez completado el primer despliegue, el workflow se ejecutará automáticamente ante cualquier `push` a las ramas `main` o `master` que contenga modificaciones en `supabase/**`, `.github/workflows/supabase-deploy.yml` o `scripts/supabase-conditional-seed.sh`.
- En despliegues automáticos por push, `force_seed` se mantiene en `false` por seguridad.
