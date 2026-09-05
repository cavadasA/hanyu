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

### Despliegue Automático
El pipeline de GitHub Actions se ejecuta automáticamente ante cualquier `push` a las ramas `main` o `master` que modifique `supabase/**` o `.github/workflows/supabase-deploy.yml`:
1. Vincula el proyecto de forma segura en el runner con las credenciales de GitHub Secrets.
2. Ejecuta `supabase db push`, aplicando ordenadamente todas las migraciones (incluyendo el seed inicial de corpus `2026090602_seed_initial_corpus.sql`).
3. Despliega las Edge Functions `generate-exercise` y `tokenize-reading`.
4. Valida la correcta generación de tipos TypeScript.

### Despliegue Manual (workflow_dispatch)
También puedes disparar el despliegue manualmente cuando desees:
1. Ve a la pestaña **Actions** en GitHub: [github.com/cavadasA/hanyu/actions](https://github.com/cavadasA/hanyu/actions).
2. Selecciona **Deploy Supabase (Migrations & Functions)**.
3. Pulsa **Run workflow**. Opcionalmente puedes marcar la casilla de reseteo si necesitas restaurar la base de datos a un estado limpio.
