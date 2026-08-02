# Hanyu — Auth screen design

The redesign language for the auth flow (`app/(auth)/*`). Redesign 01. Follow this
when adding or touching sign in / sign up / reset password so the flow stays one system.

## Design read

Native mobile auth for a Mandarin-learning app. Calm, trustworthy, culturally
grounded in **vermilion + gold**. Direction chosen with the user: **brand moment** —
a vermilion "seal" hero crowns the screen, a card carries the form.

Dials (auth, not landing): **variance 3 · motion 3 · density 2**. Clarity over flourish.

## Tokens — the only source of color / spacing / radius

Everything derives from [`theme/tokens.ts`](../theme/tokens.ts) via `useTheme()`.
No hardcoded hex in screens. The single exception is `BRAND_INK = #c93624` inside
`AuthScaffold`: the hero block is a fixed brand surface across light and dark, so it
does not swap to the coral dark-accent (`#ff7664`). Interactive elements still use
`colors.vermilion` from the tokens.

- **Accent (locked):** `vermilion` on every interactive element — focus ring, links,
  primary button, footer links.
- **Secondary:** `gold` — used only for the positive `NoticeBanner` edge, to read
  apart from the red `ErrorBanner`.
- **Radius:** `md (12)` on inputs and buttons; card lip is `xl + sm (28)`.
- **Type:** system font in-app (San Francisco / Roboto). The 汉语 hero uses the
  platform CJK face.

## The pattern (reusable components)

| Component | Role |
|-----------|------|
| [`AuthScaffold`](AuthScaffold.tsx) | Whole chrome: vermilion 汉语 seal hero + wordmark, rising card, safe-area, keyboard avoidance, light status bar. Props: `title`, `children`. |
| [`AuthField`](AuthField.tsx) | Labeled input. Visible label (never placeholder-as-label), vermilion focus ring, optional `secure` Show/Hide toggle, optional `trailing` (e.g. a "Forgot?" link). |
| [`AuthSubmit`](AuthSubmit.tsx) | Full-width primary action. Spinner + `busyLabel` while `busy`, `scale 0.98` press feedback. |
| [`ErrorBanner`](ErrorBanner.tsx) | Red inline error, `accessibilityRole="alert"`. |
| [`NoticeBanner`](NoticeBanner.tsx) | Gold positive/info banner (e.g. "Check your email"). |

A screen is just: `AuthScaffold` → optional banners → `AuthField`s → `AuthSubmit` →
footer link. See [`sign-in.tsx`](../../app/(auth)/sign-in.tsx) as the reference.

## Rules to hold

- **Every interaction state is real:** focus ring, inline error, loading button,
  password reveal. No "happy path only".
- **Both themes, always.** Style through `useTheme()` colors; never a raw color in a
  screen.
- **Accessibility:** labels visible and wired to inputs; banners announce; touch
  targets ≥ 44pt; `Show/Hide` and CTAs are real buttons with labels.
- **Honest surface area:** email + password only. No invented social sign-in — the
  data layer (`getData().auth`) exposes password auth and reset, nothing else.
- **Copy voice:** product strings stay in English. Titles are human ("Welcome back",
  not "Sign in") so the wordmark carries the brand. No em dashes.

## Verified

`sign-in`, `sign-up`, `forgot-password` tests pass; the required accessibility labels
(`Email`, `Password`) and button texts (`Sign in`, `Create account`, `Send reset email`)
are preserved by the components above.
