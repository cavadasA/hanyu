# Hanyu — Auditoría de producto y negocio

Fecha: 2026-08-02. Alcance: toda la app (rutas móviles, capa de datos `@hanyu/data`,
Edge Functions de Supabase, servidor Node en `server/`, contenido/seed, settings).
Método: lectura de código, no de la app en runtime. Cada hallazgo va marcado como
**verificado en código** o **por confirmar**.

---

## 0. Qué hace hoy la app (mapa real)

- **Tabs:** Today, Practice (exercises + readings), Library (words + grammar), Reviews (cards), You.
- **Loop diario:** un "starter deck" SRS (`srs_cards`), repaso con 3 modos
  (recognition/recall/listening), ejercicios y lecturas generables por IA.
- **Backend:** Supabase (Postgres + Auth + Edge Functions `generate-exercise`,
  `generate-reading`, `tokenize-reading`). Existe además un servidor Node en
  `server/` con rutas propias (flashcards, grammar, today) — ver hallazgo #10.
- **Contenido semilla:** HSK 1, 2 y 3 de vocabulario, un pool de ejercicios y
  grammar points. **No hay seeds de HSK 4-6.**

---

## 1. CRÍTICO — Clave `service_role` de Supabase embebida en el cliente móvil

**Verificado en código.** `apps/mobile/.env.example` define
`EXPO_PUBLIC_SUPABASE_ANON_KEY` con un JWT cuyo payload decodificado es
`role: "service_role"` (exp 2073). Problemas:

- Las variables `EXPO_PUBLIC_*` se **empaquetan en el bundle** y viajan a cada
  dispositivo. Cualquiera que abra el binario obtiene la clave.
- La `service_role` **salta todo el RLS**: lee y escribe datos de todos los
  usuarios sin restricción. Es una clave de servidor, nunca de cliente.
- Está **commiteada** (el `.env.example` aparece modificado en git), así que
  probablemente esté también en el historial/remoto.

**Remediación (tú, en el dashboard de Supabase):**
1. **Rotar** la `service_role` key (Settings → API → Reset). Asumir comprometida.
2. Sustituir en los `.env.example`/entornos por la **anon public** key real.
3. Auditar que **RLS esté activo** en todas las tablas de usuario (`srs_cards`,
   `user_settings`, etc.) con políticas por `user_id`.
4. Purgar la clave del historial de git si el repo es compartido/público.

Severidad: **P0**. Bloquea cualquier lanzamiento.

---

## 2. CRÍTICO — Configuración de API key de IA a medio construir

**Tu pregunta directa: ¿dónde se configura la API key?**

- En **You → "AI TUTOR ENGINE" → AI provider** eliges `none / deepseek / gemini`.
  Eso es lo único que existe en la UI.
- **No hay campo para introducir una API key.** En `settings.ts`,
  `api_key: ''` y `api_key_configured: false` están **hardcodeados** como stubs
  muertos; la tabla `user_settings` ni siquiera los persiste.
- Las claves reales (`DEEPSEEK_API_KEY`, `GEMINI_API_KEY`) viven como **secretos
  de Supabase Edge Functions**, compartidos para todos los usuarios, y se ponen por
  CLI: `npx supabase secrets set DEEPSEEK_API_KEY=<valor>` (ver `.env.example` raíz).

**Decisión de negocio pendiente:** ¿modelo *managed* (tú pagas la IA de todos,
clave compartida server-side — el estado actual) o *BYO-key* (cada usuario mete la
suya)? Si es BYO-key, falta toda la UI + persistencia cifrada + validación. Si es
managed, hay que **borrar los stubs `api_key`** para no confundir. Hoy está a
mitad de camino entre ambos.

Severidad: **P0-P1** según el modelo elegido.

---

## 3. Loop de repaso: callejón sin salida al terminar (tu ejemplo)

**Verificado en código** (`CardsScreen.tsx`, fase `complete`, líneas 242-284).
Al acabar una sesión solo hay **"Review again"** (que recarga las cartas due — si
ya no hay due, no hace nada útil) y **"Back to Today"**. Faltan salidas para
"seguir aprendiendo":

- **Estudiar por delante** (adelantar repasos futuros / "study ahead").
- **Aprender palabras nuevas** en el momento (extender el deck desde aquí).
- **Practicar otra cosa** (handoff a ejercicios o lectura).
- **Repaso extra libre** desacoplado del SRS.

El estado "completado" de Today que añadiste va en esa dirección, pero el final de
*sesión de cards* sigue siendo un dead-end. Severidad: **P1**.

---

## 4. Un solo deck, sin gestión de decks

**Verificado en código.** `srs_cards` es una tabla plana por usuario; no existe
tabla `decks` ni concepto de múltiples mazos. `createStarterDeck` crea *el* deck a
partir de una estrategia HSK. Faltan:

- **Múltiples decks** y **cambiar de deck**.
- **Decks personalizados / temáticos** (viajes, negocios, verbos…).
- **Decks precargados por nivel/tema** como catálogo.
- Añadir palabra al deck **sí existe** (Library → Words → botón que llama a
  `addCard`), pero es de una en una; no hay bulk ("añade todo HSK3"), ni
  sugerencias inteligentes, ni importar listas.

Severidad: **P1** (es justo lo que intuías).

---

## 5. Contenido: HSK 4-6 vacío

**Verificado en código.** Settings permite elegir nivel **1-6**, pero solo hay
seeds de vocabulario **HSK 1-3**. Un usuario que elige HSK 4-6 se queda sin
contenido base. Decidir: generar/cargar HSK 4-6, o **limitar el selector** a los
niveles con contenido hasta tener el resto. Severidad: **P1**.

---

## 6. Práctica: cobertura de habilidades incompleta

Hoy: reconocimiento/recall/listening (TTS), ejercicios de gramática/uso y lecturas.
Faltan, para una app de mandarín "completa":

- **Escritura / trazos de caracteres** (handwriting, orden de trazos). Ausente.
- **Habla / pronunciación** (grabar y evaluar tonos). Ausente.
- **Listening real** más allá de TTS (audio nativo, dictado).
- **Repaso de gramática con SRS** (los grammar points son solo lectura).
- **"Generar más"** ejercicios/cartas bajo demanda desde la pantalla de práctica.

Severidad: **P2** (diferenciador de producto).

---

## 7. Retención / engagement: casi todo por construir

- **Sin notificaciones push / recordatorios.** Verificado: `expo-notifications`
  no está. Es la palanca #1 de retención en apps de estudio diario. **P1.**
- **Sin streak freeze / repesca de racha** → una racha rota desmotiva y no se puede
  proteger. **P2.**
- **Sin logros / badges / hitos** más allá de la racha.
- **Sin onboarding ni test de nivelación** — el usuario elige nivel a ciegas. **P2.**
- **Sin social** (amigos, ligas, compartir progreso). **P3.**
- **Sin widget / Live Activity** de "cartas due hoy". **P3.**

---

## 8. Progreso y analítica: superficial

Hoy: racha, accuracy, breakdown del mazo. Faltan:

- **Historial temporal** (curva de dominio, actividad tipo heatmap/calendario).
- **Previsión de repasos** ("mañana: 40 due", carga de la semana).
- **Palabras débiles / leeches** (cartas que fallas repetidamente) y acciones.
- **Detalle de carta** (historial de repasos, resetear, suspender).
- Dominio por nivel HSK.

Severidad: **P2**.

---

## 9. Cuenta e infra: faltan piezas obligatorias de store

- **Sin borrado de cuenta in-app.** Verificado ausente. **Apple lo exige** para
  apps con registro; es motivo de rechazo. **P0 para publicar en App Store.**
- **Sin exportar datos** (portabilidad / GDPR). **P2.**
- **Sin cambiar contraseña ni editar perfil** dentro de la app. **P2.**
- **Sin verificación de email visible / gestión de sesión avanzada** (por confirmar).
- Offline: existe `offline-reviews` (bien) — **por confirmar** robustez de sync y
  resolución de conflictos.

---

## 10. Deuda técnica que roza negocio

- **Dos backends.** `server/` (Node, rutas flashcards/grammar/today) + Supabase.
  Riesgo de doble fuente de verdad y mantenimiento. Aclarar cuál es canónico; si
  `server/` es legado, retirarlo. **Por confirmar / P2.**
- **`CardStatusBadge.tsx` usa `colors.info`**, un token inexistente → error de
  tipos y color `undefined` en runtime. **P2, arreglo rápido.**
- **Stubs muertos** `api_key`/`api_key_configured` (ver #2).
- **Sin modelo de monetización** (nada de suscripción/paywall). Define negocio
  antes de invertir en features premium. **Decisión de negocio.**

---

## Roadmap priorizado (severidad × esfuerzo)

| # | Ítem | Sev | Esfuerzo | Tipo |
|---|------|-----|----------|------|
| 1 | Rotar service_role + anon key real + auditar RLS | P0 | Bajo | Seguridad |
| 9 | Borrado de cuenta in-app (requisito Apple) | P0 | Bajo-Med | Compliance |
| 2 | Definir modelo de IA (managed vs BYO) y limpiar stubs | P0-P1 | Med | Producto |
| 7 | Notificaciones push / recordatorio diario | P1 | Med | Retención |
| 3 | Salidas "seguir aprendiendo" al terminar review | P1 | Bajo-Med | Loop |
| 5 | HSK 4-6: cargar contenido o limitar selector | P1 | Med | Contenido |
| 4 | Múltiples decks / decks temáticos | P1 | Alto | Loop |
| 8 | Analítica: previsión de repasos + palabras débiles | P2 | Med | Progreso |
| 6 | Escritura de caracteres / pronunciación | P2 | Alto | Práctica |
| 10 | Consolidar backend (retirar `server/` si legado) | P2 | Med | Deuda |
| — | Fix `colors.info` en CardStatusBadge | P2 | Trivial | Bug |
| — | Onboarding + test de nivelación | P2 | Med | Activación |
| — | Modelo de monetización | — | — | Negocio |

**Sugerencia de primer sprint (bajo esfuerzo, alto impacto):** #1, #9, #3, #7 y el
fix de `colors.info`. Desbloquean publicación (seguridad + Apple), tapan el
callejón de review y encienden la retención.
