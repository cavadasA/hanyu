# Guía de Puesta en Marcha de Supabase (CI/CD)

Esta guía describe cómo inicializar la base de datos de Hanyu de forma limpia y cómo activar el despliegue automático mediante GitHub Actions sin tocar la base de datos desde tu terminal local.

---

## 1. Resetear la Base de Datos Remota (One-Time)

Dado que las migraciones anteriores se aplicaron a mano:

1. Accede al [Dashboard de Supabase](https://supabase.com/dashboard/project/ycchpixzhlsvivzloyvh).
2. Ve a **Project Settings** -> **Database**.
3. En la sección **Database Password**, asegúrate de conocer la contraseña o pulsa **Reset Database Password** para definir una nueva (guárdala para el paso 2).
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
