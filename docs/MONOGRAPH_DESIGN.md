# DrugBug — "Monograph" design system (reskin contract)

The front-end is being reworked to kill every vibe-coded tell (see
`~/anti-vibe-ui.md`). This file is the authoritative spec. The shared foundation
(globals.css, layout, fonts, UI primitives, shared components, nav, shell) is
**already rebuilt** — do not modify it. Re-skin screens on top of it.

## The aesthetic

**Monograph** — a clinical drug-reference look: warm paper, ink type, hairline
rules, prescription-label monospace for drug data. Think the printed BNF / a
prescription label / a lab report, with editorial typographic rigor. Calm,
authoritative, legible. **Light theme** (the boldest anti-vibe move — every AI
health app is dark cyan-glow). Document-like, left-aligned, ruled — not a deck of
identical drop-shadowed cards.

Hard nos (from the anti-vibe rules): no purple/indigo/violet anywhere; no Inter;
no glassmorphism / glow / colored box-shadow; no emoji as icons (lucide only, thin
strokes); no colored 3–4px left-border stripe on cards (the #1 component tell); no
border+diffuse-shadow combo; no uniform 16px radius everywhere; no centered
hero + pill-badge + 3-icon-card skeleton; no fake stats/testimonials; no animate-
everything. Vary section rhythm and density.

## Tokens (Tailwind v4 — use these class names exactly)

Colors (bg-/text-/border-):
- `paper` (page bg), `surface` (raised), `card` (white data sheet)
- `ink` (text), `muted` (secondary), `faint` (least / placeholder)
- `rule`, `rule-strong` (hairline borders/rules)
- `brand` (deep pharmacy green — primary), `brand-hover`, `brand-ink` (text on brand), `brand-tint` (faint wash)
- signals, used ONLY for meaning: `danger` + `danger-tint`, `caution`, `monitor` + `monitor-tint`, `positive` + `positive-tint`

Type: `font-display` (Newsreader serif — headings only), `font-sans` (IBM Plex Sans — body, default), `font-mono` (IBM Plex Mono). Use the `.label-mono` utility for drug names, doses, NDC, codes, IDs (the prescription-label motif). `.tnum` for aligned numbers. Headings (h1/h2/h3) already get the serif — use real heading elements.

Radii (vary by role — never uniform): `rounded-[var(--radius-sharp)]` (0, data/tables), `rounded-[var(--radius-sm)]` (3px, inputs/buttons), `rounded-[var(--radius-md)]` (6px, panels), `rounded-[var(--radius-pill)]` (chips only).

Motion: subtle, ≤200ms, transform/opacity only, ease `var(--ease)`. Use the `.rise` class for ONE staggered page-load reveal (e.g. Today timeline rows with incremental `style={{animationDelay}}`). No scroll-fade-everything, no hover lift/scale/glow — hovers shift color/background only.

## Migration map (old class/variant → new) — fix ALL of these per screen

- `text-text` → `text-ink`; `border-border` → `border-rule`; `bg-elevated` → `bg-surface` or `bg-brand-tint`; `text-primary` → `text-brand`; `bg-primary` → `bg-brand`; `text-primary-foreground` → `text-brand-ink`; `bg-primary/15` etc → `bg-brand-tint`
- `className="mono"` → `className="label-mono"`
- Badge `variant`: `primary`→`brand`, `success`→`positive`, `warning`→`caution` (or `monitor` for low severity), `neutral`→`neutral`, `danger`→`danger` (also available: `outline`)
- Button `variant`: `ghost`→`quiet`, `outline`→`secondary`; `primary`/`secondary`/`danger` unchanged; new `link` variant for inline text links
- Old cyan accents / glows → remove. Severity colors come from `@/components/shared/severity` (`SeverityBadge`, `severityColor`).

## Primitive APIs (import, don't recreate)

`Button` (variant: primary|secondary|quiet|danger|link; size: sm|md|lg|icon) ·
`Card`, `CardHeader`, `CardEyebrow`, `CardTitle`, `CardDescription`, `CardContent` (CardHeader already has its own border/padding) ·
`Badge` (variants above) · `Input`, `Textarea`, `Select`, `Label` (from `@/components/ui/input`) ·
`Modal` (open/onClose/title — handles esc/overlay/X/focus) ·
`LoadingState` ({rows?, label?} — skeletons), `EmptyState` ({icon?, title, description?, action?}), `ErrorState` ({title?, description?, retry?}) ·
`ConfidenceBar` ({value 0..1, label?}), `SourceTag` ({source: kb|model|mechanistic}) ·
`SeverityBadge` ({severity}), `severityColor(severity)`.

Data hooks, reducer calls, and the inference client are unchanged — see
`docs/CLIENT_FOUNDATION.md`. **Preserve every data wiring and flow exactly**; this
is a visual + UX + copy reskin, not a logic rewrite.

## Copy rules (rewrite all visible text)

Write like a specific person who built a medication-safety tool. Plain, concrete,
sentence case. Name what the thing does. Banned: "It's not just X, it's Y" and all
negative parallelism; the words elevate/seamless/unlock/empower/leverage/harness/
streamline/supercharge/effortless/world-class/cutting-edge/transform/robust/
journey; rule-of-three padding; "[adjective] [noun] that helps you [verb]"; fake
stats or testimonials; Title Case Headings (use sentence case); bold-first bullets
on every item. Keep the required clinical disclaimer where clinical output appears:
"Decision support, not a diagnosis — confirm with your pharmacist or prescriber."
Examples of the voice: "Two of your medications raise your bleeding risk together."
/ "You've taken 26 of 30 doses on time this month." / "We couldn't read the imprint
clearly. Pick the match below or check with your pharmacist."

## Behavior completeness (must hold for every screen)

Empty / loading (skeleton) / error (message + retry) states for every data view.
Every button/link/toggle works or doesn't exist — no `href="#"`, no dead CTAs.
Forms validate inline, disable while submitting, show success AND failure. Keyboard:
focusable, visible focus (global ring), modals trap+restore focus. Mobile correct at
375px — no horizontal scroll, no overflow. One H1 per page; headings are heading
elements; meaningful icons have labels.

## Per-screen intent (make each genuinely good, not just recolored)

- **welcome** — quiet, confident first screen. Wordmark, one real sentence on what
  DrugBug does, the account form. No marketing hero, no pill-badge, no 3 cards.
- **today** — lead with the actual day's schedule as a medication chart (a real
  clinical artifact). Hero line = next dose + countdown. Timeline rows ruled, drug
  names in label-mono, status chips. `.rise` stagger on load. Missed-dose recovery
  in a modal with deterministic steps + a real "call pharmacist" action. Predictive
  nudge as a quiet ruled banner, not a glowing card. Refill strip at the bottom.
- **meds** — a list that reads like a formulary index: ruled rows, name in
  label-mono, strength, schedule, 7-day adherence as a tiny figure. Filter as quiet
  segmented control. Add screen: real RxNorm autocomplete; the pre-commit
  interaction check stays a BLOCKING modal on a major finding (SeverityBadge).
  Detail: a monograph page for one drug (schedule, prescriber, refill, interaction
  badges → /cascade, last scan authenticity, side effects, PGx flag).
- **scan** — the camera/result flow. Authenticity as a per-layer ledger (each
  verification layer = a ruled row with pass/inconclusive/unavailable). Low-confidence
  pill ID shows top-3 candidates requiring confirmation — never asserts one identity.
- **cascade** — restyle react-flow to the palette (paper canvas, drug nodes as
  label-mono tablets, edges colored by `severityColor`, no neon). Edge/cascade detail
  in a side panel/modal. Clearly mark model-predicted vs reference (SourceTag).
- **insights** — recharts restyled to the palette (ink/green/earthy signals, no
  default category rainbow; thin axes; tabular nums). Adherence line + side-effect
  scatter + pattern cards (correlational, labeled). Brief generator + printable card.
- **pharmacofit** — consent gate (granular, revocable), genotype upload, per-med
  CPIC flags as monograph entries, the honest consumer-SNP caveat always visible.
- **caregiver** — two modes (I'm a caregiver / my caregivers). Invite by email,
  accept by link id, per-patient dashboards (live), access-level aware.
- **settings** — profile edit, notifications toggle (real web-push wiring), privacy
  + PGx consent link, sign out (clearToken), about + disclaimer. No dead toggles.

## Recharts palette (insights)

Series colors from the palette only: ink `#18130d`, brand `#15402e`, positive
`#2f6d4f`, monitor `#936410`, caution `#b5521e`, danger `#a32a1a`. Grid/axis use
`#e0d7c4`/`#6a6052`. Tabular nums. No default multicolor category palette, no glow.
