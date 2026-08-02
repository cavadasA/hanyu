# Hanyu — App design (shell, dashboard, review)

Follows the auth design language (see [`AUTH_DESIGN.md`](AUTH_DESIGN.md)):
vermilion + gold on neutral surfaces, tokens only, both themes, calm over
flourish.

## Design read

Native mobile shell, dashboard, and flashcard review for a Mandarin-learning
app. Calm, trustworthy, culturally grounded in **vermilion + gold**. The auth
"brand moment" (vermilion seal) carries into the dashboard as the **streak
hero**.

Dials (app, not landing): **variance 4 · motion 3-4 · density 3**. Clarity over
flourish; the dashboard must tell the learner what to do next, and the review
is the core of the daily loop so it must feel fast and safe
(`PRODUCT.md` anti-reference: no empty dashboards that look impressive).

## Tokens — the only source of color / spacing / radius

Everything derives from [`theme/tokens.ts`](../theme/tokens.ts) via `useTheme()`.
No hardcoded hex in screens. On the vermilion hero, secondary text uses
`colors.onAccent + 'E6'` (90% alpha) so small text keeps WCAG AA (≥ 4.5:1) in
both modes; decorative elements (divider, block dots, icon wash) use lower
alphas.

- **Accent (locked):** `vermilion` — active tab tint, primary buttons, progress
  fills, hub tile icons, busy spinner.
- **Secondary:** `gold` — only the streak flame and card pinyin (achievement /
  language moments), matching the brand's positive-accent role.
- **Radius:** `md (12)` controls and icon boxes, `lg (16)` cards and tiles,
  `xl (24)` the streak hero.
- **Type:** system font in-app (San Francisco / Roboto).

## The pattern

| Piece | Role |
|-------|------|
| [`app/(app)/_layout.tsx`](../../app/(app)/_layout.tsx) | Five-tab bar. Ionicons glyphs, filled when active and outline when not; vermilion active tint, muted inactive; hairline top border; `tabBarHideOnKeyboard`. |
| [`TodayScreen`](../screens/TodayScreen.tsx) | Dashboard. Date eyebrow + time-of-day greeting + HSK badge, then the vermilion streak hero (metric, longest, session segments with "N of M blocks done"), one "Your plan for today" card that lists the three daily tasks (Review, Exercises, Reading) as hairline-divided rows (icon wash + progress + CTA) where only the next pending task gets the primary button, then Deck breakdown. Sections reveal on load (staggered fade+lift, native driver, reduce-motion aware, inert under tests). Skeleton placeholders while loading. |
| [`CardsScreen`](../screens/CardsScreen.tsx) | Review session. Eyebrow + "Cards" heading with counter pill, session progress bar (reviewed / total), segmented mode control (Recognition / Recall / Listening), then the card. Busy feedback is per rating button, not the whole row. |
| [`FlashCardView`](FlashCardView.tsx) | The card. Entrance animation per card change and answer reveal, both native-driver (`useNativeDriver: true`, transform + opacity only) and disabled under `prefers-reduced-motion` / tests. Ratings: Again/Hard secondary, Good/Easy primary. |
| [`HubTile`](HubTile.tsx) | Full-tile pressable for tab landing screens: icon wash, title, description, chevron. `accessibilityLabel` equals the route name (kept exact for the test contract), `accessibilityHint` carries the description. |
| [`Button`](Button.tsx) | Press feedback (`scale 0.98` + opacity dip) and optional `busy` spinner (keeps full opacity so the in-flight action reads, others dim). `accessibilityLabel` always set. |
| [`StatusBarChart`](StatusBarChart.tsx) | Stacked deck bar plus legend chips with status-color dots. |

## Motion rules (review)

- Animate only `transform` and `opacity`, always `useNativeDriver: true`.
- Every animation must be feedback (card changed, answer revealed), not
  decoration. Durations 180-220 ms, `Easing.out(Easing.cubic)`.
- Honor `prefers-reduced-motion` via `AccessibilityInfo.isReduceMotionEnabled()`
  and skip animations entirely when `NODE_ENV === 'test'` (keeps the suite
  deterministic and free of `act` warnings).
- **Swipe vs scroll:** the review card's PanResponder claims only horizontal
  moves (`dx > 12 && dx > dy`), refuses `onPanResponderTerminationRequest` once
  it owns the gesture, and reports pan activity through `onPanActiveChange` so
  the `Screen` ScrollView sets `scrollEnabled={false}` while a swipe is in
  progress.
- Pressable style functions must never emit `transform: undefined` — RN 0.86's
  `processTransform` crashes on it. Use conditional spread
  (`...(pressed ? { transform: [...] } : {})`) or an identity array
  (`[{ scale: 1 }]`), never `undefined`.

## Rules to hold

- **The test contract is part of the design.** Dashboard strings (`12 day
  streak`, `18 cards due`, `N of M blocks done`, `Exercises 0/5`, `Reading 0/1`),
  review strings (`1/2` counter, `Show answer`, `Good`, `Session complete`,
  `You reviewed N card(s).`, `Recognition` / `Listening` modes) and hub button
  names (`Words`, `Grammar`, `Exercises`, `Readings`) must stay exact: single
  `Text` nodes / accessible labels the suite asserts.
- **Both themes, always.** Style through `useTheme()` colors; never a raw color
  in a screen. Token-derived alphas (`colors.onAccent + 'E6'`) are allowed on
  the hero.
- **Accessibility:** touch targets ≥ 44pt, visible labels, real buttons, hero
  secondary text ≥ 4.5:1 in both modes. The pressed rating shows a spinner and
  keeps its label as `accessibilityLabel` while busy.
- **Honest data:** every number on the dashboard and review comes from
  `getToday()` / `getDashboard()` / `getDueCards()`. No invented metrics.
- **Copy voice:** English, plain, no em dashes, no middle-dot separators.

## Verified

Mobile suite green (29 suites / 148 tests) after the shell, dashboard, and
review redesigns (including the Today overhaul); `tsc --noEmit` reports only the
pre-existing `packages/data` error, none in the app.
