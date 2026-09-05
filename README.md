# Hanyu

Hanyu es una plataforma web para practicar chino mandarin con tarjetas SRS, ejercicios, lecturas graduadas, referencia gramatical y seguimiento de progreso. La arquitectura objetivo es Supabase-first: autenticacion real con Supabase Auth, datos en Postgres con RLS, y cliente React consumiendo repositorios basados en Supabase.

## Alcance actual

- Login real con Supabase Auth (email/password)
- Contenido y filtros HSK 1-3
- Daily learning loop oriented to HSK2 consolidation
- Starter deck flow for HSK1 review + HSK2 focus
- Flashcards con algoritmo SM-2
- Ejercicios y lecturas con proveedor de IA configurable o fallback local
- Dashboard con estadisticas, racha y distribucion SRS
- Audio con Web Speech API cuando el navegador lo soporta

## Stack

- Frontend: React 18, Vite, React Router 6, Zustand, Tailwind CSS 4, Recharts
- Data/Auth: Supabase Postgres, Supabase Auth, Row Level Security, Supabase Edge Functions
- Backend legacy (transitorio): Node.js, Express, CORS
- Base de datos legacy (transitoria): SQLite con better-sqlite3
- Tests: Vitest, Testing Library, jsdom

## Aplicacion movil

La app movil vive en `apps/mobile` (Expo + Expo Router + TypeScript) y consume
`packages/data`, el mismo paquete que usa la web.

```bash
cp apps/mobile/.env.example apps/mobile/.env
# pega EXPO_PUBLIC_SUPABASE_ANON_KEY
npm run dev:mobile
```

En P2 la app cubre login, registro, envio de email de recuperacion, Today,
Cards, Practice, Library y You. Practice incluye ejercicios nativos y lecturas
interactivas; Library incluye Words con busqueda/filtro/paginacion y Grammar.
Los detalles de foundation estan en
`docs/superpowers/specs/2026-07-29-hanyu-mobile-foundation-design.md`.

## Requisitos

- Node.js 18 o superior
- npm

Nota: el proyecto fue validado en este workspace con Node 24 y `better-sqlite3` 12.x.

## Puesta en marcha

1. Instala dependencias:

```bash
npm install
```

2. Configura variables de entorno para Supabase:

```bash
copy .env.example .env.local
```

3. Pega el valor real de `VITE_SUPABASE_ANON_KEY` en `.env.local`.

4. Inicia en desarrollo:

```bash
npm run dev
```

Nota: `npm run dev` mantiene Express encendido para compatibilidad de migracion, pero el cliente ya usa repositorios Supabase.

## Flujo legacy local (Express + SQLite)

Si necesitas validar o mantener rutas legacy de Express durante la migracion:

1. Crea el esquema SQLite:

```bash
npm run migrate
```

2. Carga los datos base:

```bash
npm run seed
```

URLs por defecto:

- Cliente: http://localhost:5173
- API: http://localhost:3001

## Supabase deployment

La ruta de produccion es Supabase-first. Consulta:

- `docs/supabase-setup.md` (Puesta en marcha con CI/CD en GitHub Actions y reseteo inicial)
- `docs/deployment-supabase.md`

## Flujo de produccion local

Genera el bundle del cliente:

```bash
npm run build
```

Inicia Express sirviendo API y `apps/web/dist`:

```bash
npm start
```

## Scripts

| Script | Descripcion |
| --- | --- |
| `npm run dev` | Levanta servidor Express y Vite en paralelo |
| `npm run dev:server` | Ejecuta `server/app.js` con `node --watch` |
| `npm run dev:client` | Inicia Vite en apps/web |
| `npm run dev:mobile` | Inicia Expo en `apps/mobile` |
| `npm run build` | Compila el frontend en apps/web/dist |
| `npm run gen:types` | Regenera los tipos de Supabase en packages/data |
| `npm run migrate` | Ejecuta las migraciones SQLite |
| `npm run seed` | Inserta palabras y puntos gramaticales base |
| `npm run import-hsk` | Convierte TSV de HSK a JSON de seeds |
| `npm start` | Arranca el servidor Express en modo produccion |
| `npm test` | Ejecuta typechecks, Vitest, Jest y pgTAP de Supabase cuando se define `SUPABASE_TEST_DATABASE_URL` |
| `npm run test:web` | Ejecuta Vitest (paquetes y web) |
| `npm run test:mobile` | Ejecuta Jest en `apps/mobile` |
| `npm run test:watch` | Ejecuta Vitest en watch mode |

## Funcionalidades principales

### Dashboard

- Racha actual y maxima
- Resumen de tarjetas pendientes y actividad diaria
- Distribucion por estado SRS
- Accesos directos a repasos, ejercicios y lecturas

### Words

- Busqueda por hanzi, pinyin o significado
- Filtro por nivel HSK
- Paginacion
- Alta de palabras al mazo SRS

### Flashcards

- Sesiones de repaso de tarjetas vencidas
- Calificaciones Again, Hard, Good y Easy
- Actualizacion de intervalos con SM-2
- Registro de tiempo y de historial de repaso

### Exercises

- Tipos soportados: `fill_blank`, `multiple_choice`, `reorder`, `dictation`, `matching`
- Generacion desde proveedor IA configurable o contenido fallback
- Correccion de respuestas e historial

### Readings

- Listado de lecturas guardadas
- Generacion por nivel y formato
- Vista con toggle de pinyin
- Preguntas de comprension

### Grammar y Settings

- Referencia gramatical por niveles HSK 1-3
- Configuracion de tema, nivel actual, cartas por dia y proveedor IA
- Las API keys de proveedores IA se gestionan en secretos de Supabase Edge Functions, no en cliente

## Estructura del proyecto

```text
.
|-- apps/
|   |-- web/
|   |   |-- src/
|   |   |   |-- components/
|   |   |   |-- hooks/
|   |   |   |-- pages/
|   |   |   |-- services/
|   |   |   |-- stores/
|   |   |   `-- styles/
|   |   |-- index.html
|   |   `-- vite.config.js
|   `-- mobile/
|-- packages/
|   `-- data/
|-- docs/
|   `-- superpowers/
|-- scripts/
|-- server/
|-- supabase/
|-- package.json
`-- vitest.config.js
```

## Persistencia y datos

- La base principal se crea en `hanyu.db` en la raiz del repositorio
- Las migraciones viven en `server/db/migrations/`
- Los seeds JSON estan en `server/db/seeds/`
- El script `scripts/import-hsk-data.js` sirve para regenerar seeds desde archivos TSV

## API principal

### Salud

- `GET /api/health`

### Palabras y gramatica

- `GET /api/words`
- `GET /api/words/:id`
- `GET /api/grammar/:level`
- `GET /api/grammar/:level/:id`

### Flashcards

- `GET /api/flashcards/due`
- `POST /api/flashcards/add`
- `POST /api/flashcards/:id/review`
- `GET /api/flashcards/stats`

### Ejercicios y lecturas

- `POST /api/exercises/generate`
- `POST /api/exercises/:id/check`
- `GET /api/exercises/history`
- `GET /api/readings`
- `GET /api/readings/:id`
- `POST /api/readings/generate`

### Configuracion y estadisticas

- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/stats/dashboard`
- `GET /api/stats/streak`
- `POST /api/stats/log-time`

## Testing

Ejecuta toda la suite:

```bash
npm test
```

Ejemplos utiles:

```bash
npx vitest run server/
npx vitest run apps/web/src/
```

## Notas de implementacion

- `server/app.js` sirve el frontend compilado para cualquier ruta que no empiece por `/api`
- La web usa `apps/web/src/services/api.js` como fachada de compatibilidad, implementada sobre repositorios Supabase
- La configuracion de usuario vive en `public.user_settings` en Supabase
- Las fechas en SQLite se guardan como ISO 8601; los campos de revision diaria usan `YYYY-MM-DD`
