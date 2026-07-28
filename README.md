# Hanyu

Hanyu es una plataforma web para practicar chino mandarin con tarjetas SRS, ejercicios, lecturas graduadas, referencia gramatical y seguimiento de progreso. El proyecto esta pensado como una aplicacion full-stack simple de ejecutar en local: React + Vite en el cliente, Express en el servidor y SQLite como persistencia.

## Alcance actual

- Modo single-user en V1, sin autenticacion
- Contenido y filtros HSK 1-3
- Flashcards con algoritmo SM-2
- Ejercicios y lecturas con proveedor de IA configurable o fallback local
- Dashboard con estadisticas, racha y distribucion SRS
- Audio con Web Speech API cuando el navegador lo soporta

## Stack

- Frontend: React 18, Vite, React Router 6, Zustand, Tailwind CSS 4, Recharts
- Backend: Node.js, Express, CORS
- Base de datos: SQLite con better-sqlite3
- Tests: Vitest, Testing Library, jsdom

## Requisitos

- Node.js 18 o superior
- npm

Nota: el proyecto fue validado en este workspace con Node 24 y `better-sqlite3` 12.x.

## Puesta en marcha

1. Instala dependencias:

```bash
npm install
```

2. Crea el esquema SQLite:

```bash
npm run migrate
```

3. Carga los datos base:

```bash
npm run seed
```

4. Inicia cliente y servidor en desarrollo:

```bash
npm run dev
```

URLs por defecto:

- Cliente: http://localhost:5173
- API: http://localhost:3001

## Flujo de produccion local

Genera el bundle del cliente:

```bash
npm run build
```

Inicia Express sirviendo API y `client/dist`:

```bash
npm start
```

## Scripts

| Script | Descripcion |
| --- | --- |
| `npm run dev` | Levanta servidor Express y Vite en paralelo |
| `npm run dev:server` | Ejecuta `server/app.js` con `node --watch` |
| `npm run dev:client` | Inicia Vite en `client/` |
| `npm run build` | Compila el frontend en `client/dist` |
| `npm run migrate` | Ejecuta las migraciones SQLite |
| `npm run seed` | Inserta palabras y puntos gramaticales base |
| `npm run import-hsk` | Convierte TSV de HSK a JSON de seeds |
| `npm start` | Arranca el servidor Express en modo produccion |
| `npm test` | Ejecuta toda la suite con Vitest |
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
- La API key se guarda en SQLite en texto plano en V1

## Estructura del proyecto

```text
.
|-- client/
|   |-- src/
|   |   |-- components/
|   |   |-- hooks/
|   |   |-- pages/
|   |   |-- services/
|   |   |-- stores/
|   |   `-- styles/
|   |-- index.html
|   `-- vite.config.js
|-- docs/
|   `-- superpowers/
|-- scripts/
|   `-- import-hsk-data.js
|-- server/
|   |-- db/
|   |   |-- migrations/
|   |   `-- seeds/
|   |-- routes/
|   `-- services/
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
npx vitest run client/src/
```

## Notas de implementacion

- `server/app.js` sirve el frontend compilado para cualquier ruta que no empiece por `/api`
- El cliente usa `/api` como base para todas las llamadas HTTP
- La configuracion del usuario vive en la tabla `users` con `id = 1`
- Las fechas en SQLite se guardan como ISO 8601; los campos de revision diaria usan `YYYY-MM-DD`
