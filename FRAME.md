---
name: Akunio — Frame Layer
description: Video-first companion to design.md. The frame is the unit; the meja ledger is the brand at scale.
colors:
  terra-bata: "#a8562f"
  kanvas-arsip: "#f5f1e9"
  kertas-matte: "#fbfaf6"
  tinta-arsip: "#232a33"
  tinta-lembut: "#6b6f76"
  garis-arsip: "#e7e1d4"
  debit-daun: "#3e7c5a"
  kredit-bata: "#9c5a38"
typography:
  # --- Reading ramp (from design.md, kept for chrome + dense frames) ---
  display:
    fontFamily: "Fraunces, ui-serif, Georgia, serif"
  body:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
  label:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    letterSpacing: "0.1em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
  title:
    fontFamily: "{typography.body.fontFamily}"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.25
  body-reading:
    fontFamily: "{typography.body.fontFamily}"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  # --- Hero / display ramp (frame-native, vw against 1920) ---
  wordmark-mega:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "26vw"
    fontWeight: 500
    lineHeight: 0.86
    letterSpacing: "-0.03em"
  display-hero:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "12vw"
    fontWeight: 500
    lineHeight: 0.94
    letterSpacing: "-0.02em"
  claim-editorial:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "7vw"
    fontWeight: 500
    lineHeight: 1.04
    letterSpacing: "-0.015em"
  section-head:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "4.2vw"
    fontWeight: 500
    lineHeight: 1.08
    letterSpacing: "-0.01em"
  stat-mega:
    fontFamily: "{typography.body.fontFamily}"
    fontSize: "18vw"
    fontWeight: 500
    lineHeight: 0.9
    letterSpacing: "-0.03em"
    fontFeatureSettings: "'tnum' 1"
  stat-ledger:
    fontFamily: "{typography.body.fontFamily}"
    fontSize: "2.6vw"
    fontWeight: 500
    lineHeight: 1.1
    fontFeatureSettings: "'tnum' 1"
  eyebrow-giant:
    fontFamily: "{typography.body.fontFamily}"
    fontSize: "1.5vw"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.14em"
    textTransform: "uppercase"
  meta-body:
    fontFamily: "{typography.body.fontFamily}"
    fontSize: "1.8vw"
    fontWeight: 400
    lineHeight: 1.4
  ledger-head:
    fontFamily: "{typography.body.fontFamily}"
    fontSize: "1.4vw"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.12em"
    textTransform: "uppercase"
rounded:
  sm: "calc(var(--radius) * 0.6)"   # 9.6px
  md: "calc(var(--radius) * 0.8)"   # 12.8px
  lg: "var(--radius)"               # 16px
  xl: "calc(var(--radius) * 1.4)"   # 22.4px
  2xl: "calc(var(--radius) * 1.8)"  # 28.8px
  3xl: "calc(var(--radius) * 2.2)"  # 35.2px
  4xl: "calc(var(--radius) * 2.6)"  # 41.6px
spacing:
  gutter: "24px"
  gutter-lg: "32px"
  card: "16px"
  card-sm: "12px"
  frame-pad: "5vw"      # 96px @1920 — the safe margin every frame respects
  frame-pad-tight: "3.5vw"
  rail-gap: "2vw"
components:
  # --- Verbatim from design.md ---
  button-primary:
    backgroundColor: "{colors.tinta-arsip}"
    textColor: "{colors.kertas-matte}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "36px"
    typography: "{typography.body-reading}"
  button-primary-hover:
    backgroundColor: "{colors.tinta-arsip}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.tinta-arsip}"
    rounded: "{rounded.lg}"
  input-default:
    backgroundColor: "{colors.kertas-matte}"
    textColor: "{colors.tinta-arsip}"
    rounded: "{rounded.lg}"
    height: "36px"
  card-default:
    backgroundColor: "{colors.kertas-matte}"
    textColor: "{colors.tinta-arsip}"
    rounded: "{rounded.xl}"
    padding: "16px"
  # --- Frame-scale variants ---
  button-primary-giant:
    backgroundColor: "{colors.tinta-arsip}"
    textColor: "{colors.kertas-matte}"
    rounded: "{rounded.lg}"
    padding: "0 2.2vw"
    height: "5.4vw"
    typography: "{typography.meta-body}"
  card-default-giant:
    backgroundColor: "{colors.kertas-matte}"
    textColor: "{colors.tinta-arsip}"
    rounded: "{rounded.xl}"
    padding: "3vw"
    border: "1px solid {colors.garis-arsip}"
  eyebrow-pill:
    backgroundColor: "transparent"
    textColor: "{colors.tinta-lembut}"
    typography: "{typography.eyebrow-giant}"
    padding: "0"
  kicker-tag:
    backgroundColor: "{colors.kertas-matte}"
    textColor: "{colors.tinta-arsip}"
    border: "1px solid {colors.garis-arsip}"
    rounded: "{rounded.sm}"
    padding: "0.5vw 1vw"
    typography: "{typography.ledger-head}"
  ledger-cell:
    backgroundColor: "transparent"
    textColor: "{colors.tinta-arsip}"
    border-bottom: "1px solid {colors.garis-arsip}"
    padding: "1.3vw 1.4vw"
    typography: "{typography.stat-ledger}"
  ledger-head-cell:
    backgroundColor: "transparent"
    textColor: "{colors.tinta-lembut}"
    border-bottom: "1px solid {colors.garis-arsip}"
    padding: "1.1vw 1.4vw"
    typography: "{typography.ledger-head}"
  ledger-total-row:
    backgroundColor: "transparent"
    textColor: "{colors.tinta-arsip}"
    border-top: "4px double {colors.tinta-arsip}"
    padding: "1.5vw 1.4vw"
    typography: "{typography.stat-ledger}"
  rule-double:
    height: "0"
    border-top: "4px double {colors.tinta-arsip}"
  stat-block:
    backgroundColor: "transparent"
    textColor: "{colors.tinta-arsip}"
    typography: "{typography.stat-mega}"
  accent-terra-underline:
    backgroundColor: "{colors.terra-bata}"
    height: "0.35vw"
    width: "6vw"
  accent-terra-dot:
    backgroundColor: "{colors.terra-bata}"
    rounded: "999px"
    size: "0.9vw"
  index-numeral:
    backgroundColor: "transparent"
    textColor: "{colors.tinta-lembut}"
    typography: "{typography.eyebrow-giant}"
  colophon-rule:
    backgroundColor: "{colors.garis-arsip}"
    height: "1px"
---

# frame.md — Akunio

> **Atoms are sacred · composition is free · numbers come from the script.**

## Overview

Akunio at frame scale is a **meja ledger matte**: warm archival paper (`{colors.kanvas-arsip}`) stretched across the frame, one dark ink hierarchy (`{colors.tinta-arsip}`), and a single terra-bata accent (`{colors.terra-bata}`) that fires only at the moment of decision. The register is **quiet accountant**, not fintech dashboard — Fraunces gives the display beat its editorial weight; Plus Jakarta Sans keeps every numeral tabular and calm. Nothing shimmers. Nothing gradients. Nothing rounds playfully.

The video reads like a bookkeeping monograph turning its pages: a wordmark on paper, a serif claim in the empty half, one enormous tabular number, one page of a Swiss 2.0 ledger with the classic double rule under the total, one terra-bata decision moment. The frame is the paper.

### Frame Craft Bar

- **Squint test** — one element dominates, **3–6×** the nearest neighbor. The wordmark, the claim, the numeral, or the total row — never two focal beats sharing the frame.
- **Silence test** — sparse plates read **60–75% empty paper**. Silence is the ledger's confidence. **Dense exception, named inline:** the **Neraca (data/ledger)** plate is the one frame that legitimately fills — that density is the brand's signature, not a busy slide.
- **Restraint test** — `{colors.terra-bata}` fires **once per frame** and covers **≤10%** of the surface. If terra appears twice at full voltage, demote one to `{colors.kredit-bata}` (which is data, not accent).
- **Reference bar** — aim: the finance section of a Sunday broadsheet, a foundry specimen for a serif, a real ledger book photographed on grey. **Failure looks like:** a generic SaaS fintech deck — gradient hero, two-CTA row, product screenshot floating in a card, a rainbow of accent colours on a chart.

## Colors

Every token from `design.md` is carried verbatim above. Reframed for the frame:

- **`{colors.kanvas-arsip}` #f5f1e9** — the default full-frame ground. The paper the whole video is printed on. If a frame has no explicit ground, it is kanvas.
- **`{colors.kertas-matte}` #fbfaf6** — the layered surface (card, ledger sheet, quote block). One tone brighter than kanvas; the depth is tonal, not shadowed. Never becomes a full-frame ground on its own; it sits *on* kanvas — with the single exception of the **Neraca** plate, where the ledger sheet is the frame.
- **`{colors.tinta-arsip}` #232a33** — every load-bearing letterform. Also the ground for `{components.button-primary-giant}`. May be used as a full-frame ground **once per sequence** for a single inverted beat; everything on that frame then goes to `{colors.kertas-matte}`.
- **`{colors.tinta-lembut}` #6b6f76** — meta, labels, eyebrows, table heads. Never carries the beat's meaning.
- **`{colors.garis-arsip}` #e7e1d4** — 1px rules only. The ledger's ruled lines. Never a fill.
- **`{colors.debit-daun}` #3e7c5a / `{colors.kredit-bata}` #9c5a38** — the accounting semantic pair. Used **only** on numerals and only in ledger/stat plates. Kredit-bata is warm-adjacent to terra but must never share a frame with terra at full strength — they are different jobs (data vs. decision).
- **`{colors.terra-bata}` #a8562f** — the scarce accent. Fires exactly once per frame, at ≤10% of the surface. Reserve for the decision moment: an underline under a keyword, a dot beside a total, the fill of a primary button on a closer. **Never** for chart series, never for eyebrows, never for headline colour.

**The One Accent Rule** (from source) is the frame law. **The Lilin Rule** (dark mode) is out of scope for this video pass — every frame here is bright kertas/kanvas. If a Lilin sequence is later required, it is authored as a separate `frame.md` pass, not by tinting these plates.

## Typography

Two ramps live in the frontmatter above.

**Reading ramp** (`title`, `body-reading`, `label`, `mono`) is inherited verbatim from `design.md` in px. It is used on the **Neraca** plate — the dense-exception ledger — where the frame is deliberately reading a real table, and 14–16px in a 1920 frame reads at true product scale. It never carries a beat's meaning outside that plate.

**Display / hero ramp** is frame-native, sized in `vw` against 1920. Two families do the work:

- **Fraunces** (`{typography.wordmark-mega}`, `{typography.display-hero}`, `{typography.claim-editorial}`, `{typography.section-head}`) — for the wordmark, the oversized claim, and any editorial moment. Weight sits at **500** everywhere, matching the brand's restraint; heavier weights would break the register.
- **Plus Jakarta Sans, `tnum` on** (`{typography.stat-mega}`, `{typography.stat-ledger}`, `{typography.ledger-head}`, `{typography.eyebrow-giant}`, `{typography.meta-body}`) — for numerals, ledger cells, table heads, eyebrows, meta lines. Every money numeral, at every size, has `font-feature-settings:'tnum' 1`.

**Legibility floor.** Any load-bearing line ≥ **1.4vw** (~27px @1920). `{typography.eyebrow-giant}` sits at 1.5vw; `{typography.ledger-head}` at 1.4vw. Below the floor is chrome and colophon only.

**Fit-to-measure headlines.** The text block for `{typography.claim-editorial}` and `{typography.display-hero}` caps at **≤ 78vw wide** and never touches the safe margin. Word-count steps: ≤ 3 words → `{typography.display-hero}`; 4–6 words → `{typography.claim-editorial}`; 7+ words → step down to `{typography.section-head}`. Short lines go big; long lines go small. A fixed hero size on a long line becomes a screaming slide — Akunio does not scream.

## Layout — The Frame

- **Primary**: 1920×1080, 16:9.
- **Portrait**: 1080×1920, 9:16. Same tokens; the safe margin lives on the short edge.
- **Square**: 1080×1080, 1:1. Same tokens; the frame is tighter, the claim steps down one ramp size.
- **Safe area**: every frame reserves `{spacing.frame-pad}` = **5vw** on all four sides. `{spacing.frame-pad-tight}` = 3.5vw is used only inside dense plates (Neraca) where the ruled table already provides an internal margin.
- **Grid**: a **12-column** grid at gap `{spacing.rail-gap}` = 2vw is the underlying rhythm; most plates use 1–4 columns of that grid, never all 12.

**The vw law.** Every frame-native size in `frame.md` is expressed in `vw` against the 1920-wide primary. When translating to the showcase (or any container smaller than the viewport), **1vw maps 1:1 to 1cqw** against a frame that declares `container-type: size`. This is what lets a frame render at true proportion whether it fills a screen or sits in a contact sheet. `vw` in tokens; `cqw` at the container. Same numbers.

**cqw note.** The spec parser stores `vw` values as strings — this is a documented extension; see Known Gaps.

## Elevation & Depth

The system is **flat by default**. Depth is expressed as **tonal layering**: `{colors.kertas-matte}` sits on `{colors.kanvas-arsip}`, and the eye reads the tone step as a plane change. Shadows are reserved for a single vocabulary:

- **Matte rest** (`0 1px 2px rgb(35 42 51 / 0.04), 0 6px 16px rgb(35 42 51 / 0.05)`) — the resting card in **Kartu Matte**.
- **Matte lift** (`0 1px 2px / 0.05, 0 12px 32px / 0.07, 0 24px 64px / 0.05`) — reserved for a hovered/lifted card. In video this reads as a "picked-up" beat; use it **once at most** across a sequence.

**Depth ceiling.** No shadow softer, larger, or coloured beyond that vocabulary. No glow (terra is a hue on a shape, not a light source). No blur. No glass.

## Shapes

Radius token scale is carried verbatim from source. At frame scale:

- Buttons + inputs → `{rounded.lg}` **16px** (a fixed px atom; radius does not scale with the frame — 16px on a 1920-wide primary is proportionally tight, which is the point).
- Cards, quote blocks, the Kartu Matte plate → `{rounded.xl}` **22.4px**.
- Chat / speech-like blocks (rare) → `{rounded.2xl}` **28.8px**.
- The ledger is **not rounded**. Ruled lines meet at right angles. Rounding a ledger softens it into an app card and loses the archival read.
- **Signature silhouette**: the classic **4px double rule** (`{components.rule-double}`) under any total. This is the ledger's fingerprint at frame scale — do not substitute a single rule.

## Components

Every buildable unit is defined as a structured token in the frontmatter above. This section is the prose context — **intent, when-to-use, and the construction the tokens cannot hold** (borders, per-instance placement). Resolved values are not restated here; the frontmatter is the single source of truth.

- **`{components.button-primary}` / `{components.button-primary-giant}`** — the source primary button, carried verbatim, and its frame-scale twin. The giant lives on a closer plate or a decision moment: dark ink ground, kertas text, `{rounded.lg}` corner. Never floats without gravity — always paired with a headline above.
- **`{components.button-ghost}`** — reserved for secondary chrome in a catalog plate. Never carries the beat.
- **`{components.card-default}` / `{components.card-default-giant}`** — the matte card. Sits on kanvas ground with a 1px `{colors.garis-arsip}` border and, when lifted, the Matte-rest shadow. The giant is the Kartu Matte focal-artifact plate itself: one card, centered, holding one datum.
- **`{components.eyebrow-pill}`** — an uppercase-tracked label in tinta-lembut. Not a filled pill; the "pill" name is legacy — it renders as text-only. Used sparingly; the kicker reflex on every frame is a deck tell.
- **`{components.kicker-tag}`** — a bordered tag with `{rounded.sm}` corner on kertas. Used at most on the catalog plate as an index chip.
- **`{components.ledger-cell}` / `{components.ledger-head-cell}` / `{components.ledger-total-row}`** — the three atoms of the Swiss 2.0 table. Head-cell is uppercase, tracked, tinta-lembut, 1px `{colors.garis-arsip}` bottom rule. Cells are tabular, right-aligned when they hold money. The total row is topped with `{components.rule-double}` — the 4px double rule that is Akunio's silhouette.
- **`{components.rule-double}`** — a standalone element too: use it under any total-like number in a stat plate, not only inside a table.
- **`{components.stat-block}`** — the wrapper around a mega numeral. Tabular numerals on, right or center placement per plate.
- **`{components.accent-terra-underline}` / `{components.accent-terra-dot}`** — the two allowable terra shapes. Underline lives beneath a single word (never a whole line); the dot lives beside a total or a decision. One per frame, max.
- **`{components.index-numeral}` / `{components.colophon-rule}`** — chrome atoms for editorial ordering and page-foot rules; they carry meaning only in aggregate (a catalog, a series), never on their own frame.

Frame Treatments below **compose** these tokens. A treatment never restates a component's construction; it names it, places it, sizes it (if a size token exists), and moves on.

## Motion & Timing

Akunio's brand character (quiet, precise, `prefers-reduced-motion`-respecting, ≤240ms UI) dictates a **cut grammar over a motion grammar**:

- **Cuts are hard.** Frame-to-frame transitions are straight cuts on the beat. No cross-dissolves under 200ms; a slow dissolve (~400ms) is permitted **once** per sequence, at the closer.
- **Nothing rides in.** The wordmark does not slide. The claim does not type. The numeral does not count up. Type is set, then held. Motion inside a frame is limited to:
  - The **terra underline** may draw once, left-to-right, in 320ms `ease-out`. Once per sequence.
  - The **double rule** may draw once under a total, 240ms `ease-out`.
  - Nothing else animates. Ever.
- **Dwell.** Sparse plates hold **1.6–2.4s** so the reader can complete the reading. The Neraca dense plate holds **3.0–4.0s** because the ledger is meant to be scanned. The wordmark cover holds **1.2s** and cuts.
- **Export.** Primary render 1920×1080 @ 30fps, ProRes 422 or H.264 CRF 18. Portrait and square exports use the same source frames re-composed per the Aspect-Ratio Behavior table below — never re-cropped from landscape.
- **Reduced motion.** Even the terra underline and double-rule draw are suppressed when the destination environment reports reduced motion; they render as static end-state.

## Frame Treatments

Seven plates. Archetype coverage: identity/cover · editorial/oversized-claim · focal-artifact (×2) · data/ledger (dense exception) · chrome/catalog · brand-signature/closer.

### 1 · Meja Kosong  (identity/cover · move: wordmark centered on empty paper)
**Ground** `{colors.kanvas-arsip}`, padding `{spacing.frame-pad}`.
**Container** single centered flex column, `align-items:center`, `justify-content:center`.
**Composes** `{typography.wordmark-mega}`, `{components.eyebrow-pill}`, `{components.colophon-rule}`.
**Focal** the wordmark set in `{typography.wordmark-mega}` at 26vw, tinta-arsip, dead-center.
**Chrome** a single `{components.eyebrow-pill}` reading the tagline placeholder, 3vw below the wordmark. A `{components.colophon-rule}` at the frame's bottom safe margin.
**Accent** none. Terra does not fire on the cover.
**Silence** ~72% empty paper.
**Fixed** wordmark family, weight 500, tinta-arsip, center anchor.  **Free** the tagline copy (from script).
**Pace** low.

### 2 · Klaim Editorial  (editorial/oversized-claim · move: serif claim held in a sea of paper)
**Ground** `{colors.kanvas-arsip}`, padding `{spacing.frame-pad}`.
**Container** single centered flex column, `align-items:center`, `text-align:center`, max-inline-size 78vw.
**Composes** `{typography.claim-editorial}` (4–6 words) or `{typography.display-hero}` (≤3 words), `{components.eyebrow-pill}`, `{components.accent-terra-underline}`.
**Focal** the claim, Fraunces 500, tinta-arsip, centered. Word-count steps the ramp per the Typography rule.
**Chrome** an `{components.eyebrow-pill}` above the claim at 3vw offset.
**Accent** `{components.accent-terra-underline}` beneath a single keyword in the claim — the one word the sentence turns on. Once, at 6vw width.
**Silence** ~65% empty.
**Fixed** center anchor, tinta-arsip color, single accent word.  **Free** claim copy, which keyword takes the underline.
**Pace** low.

### 3 · Angka Fokus  (focal-artifact · move: one enormous tabular numeral)
**Ground** `{colors.kanvas-arsip}`, padding `{spacing.frame-pad}`.
**Container** single centered flex column, `align-items:center`, `justify-content:center`, gap `{spacing.rail-gap}`.
**Composes** `{components.stat-block}` (using `{typography.stat-mega}`), `{components.eyebrow-pill}` above, `{components.rule-double}` below.
**Focal** the numeral in `{components.stat-block}` at 18vw, tabular, tinta-arsip, dead-center. Placeholder `— figure —`.
**Chrome** `{components.eyebrow-pill}` above naming the metric. `{components.rule-double}` sits directly under the numeral at ~24vw width.
**Accent** optional single `{components.accent-terra-dot}` at the numeral's baseline-right, only when the frame carries a decision beat — otherwise omitted.
**Silence** ~68% empty.
**Fixed** tabular numerals, tinta-arsip color, double rule under total.  **Free** the numeral itself (from script), the metric label, whether the terra dot fires.
**Pace** low.

### 4 · Neraca  (data/ledger · move: a real Swiss 2.0 sheet full-bleed — **the dense exception**)
**Ground** `{colors.kertas-matte}`, padding `{spacing.frame-pad-tight}`. (This is the one plate that goes to kertas ground — the frame becomes the ledger sheet itself.)
**Container** flex column: header row (section title in `{typography.section-head}` + eyebrow), then a CSS grid table `grid-template-columns: 1fr auto auto` with gap 0; six-to-eight `{components.ledger-cell}` rows; one `{components.ledger-total-row}`.
**Composes** `{typography.section-head}`, `{components.ledger-head-cell}`, `{components.ledger-cell}`, `{components.ledger-total-row}`, `{components.rule-double}`, `{components.accent-terra-dot}`.
**Focal** the total row: `{components.ledger-total-row}` with a `{components.rule-double}` above and the total numeral right-aligned in `{typography.stat-ledger}`.
**Chrome** three `{components.ledger-head-cell}` cells at the top (label / debit / kredit); six-to-eight `{components.ledger-cell}` rows with placeholder line-items.
**Accent** exactly one `{components.accent-terra-dot}` immediately left of the total numeral — the decision moment.
**Silence** ~15% empty. **Density exception — named.**
**Fixed** Swiss 2.0 recipe (uppercase heads in tinta-lembut, 1px garis-arsip rules, tabular right-aligned numerals, 4px double rule under total).  **Free** the row copy and numerals (from script).
**Pace** high.

### 5 · Kartu Matte  (focal-artifact · move: one lifted matte card holds one datum)
**Ground** `{colors.kanvas-arsip}`, padding `{spacing.frame-pad}`.
**Container** single centered flex, one child. The card fills ~60vw × ~50vh, centered.
**Composes** `{components.card-default-giant}`, `{components.eyebrow-pill}`, `{typography.section-head}`, `{typography.stat-ledger}`, `{components.rule-double}`.
**Focal** the card itself, `{components.card-default-giant}` on kanvas, with the Matte-rest shadow (see Elevation) — this is the one frame per sequence that earns a shadow.
**Chrome** inside the card: `{components.eyebrow-pill}` at top-left, a section-head phrase mid-card, one `{components.rule-double}` under a small tabular sub-figure at bottom.
**Accent** none — the shadow is already the plate's scarce move.
**Silence** ~55% empty (kanvas around the card).
**Fixed** kanvas ground, kertas card, 1px garis border, Matte-rest shadow, `{rounded.xl}` corner.  **Free** card contents (from script).
**Pace** low.

### 6 · Katalog Akun  (chrome/catalog · move: an indexed left-anchored list)
**Ground** `{colors.kanvas-arsip}`, padding `{spacing.frame-pad}`.
**Container** two-column grid, `grid-template-columns: 1fr 1fr`, gap `{spacing.gutter-lg}`. Left column carries a `{typography.section-head}` heading; right column is a stacked list of five to seven items, each row = `{components.index-numeral}` + `{typography.meta-body}` label separated by 1px `{colors.garis-arsip}` bottom rule.
**Composes** `{typography.section-head}`, `{components.index-numeral}`, `{typography.meta-body}`, `{components.colophon-rule}`, optionally `{components.kicker-tag}` on one row.
**Focal** the section-head phrase in the left column — the largest thing on the plate, sized to fit its measure per the Typography rule.
**Chrome** the indexed list on the right; a bottom `{components.colophon-rule}` across the safe margin.
**Accent** at most one row bears a `{components.kicker-tag}` (a small bordered chip) to mark the current or featured item. Terra does not fire here.
**Silence** ~40% (denser than sparse plates; still not the exception).
**Fixed** two-column split, index chrome, 1px row rules.  **Free** the list contents (from script).
**Pace** moderate.

### 7 · Momen Terra  (brand-signature / closer · move: the decision beat — terra fires)
**Ground** `{colors.kanvas-arsip}`, padding `{spacing.frame-pad}`.
**Container** single centered flex column, gap `{spacing.rail-gap}`.
**Composes** `{typography.display-hero}`, `{components.button-primary-giant}`, `{components.accent-terra-underline}`, `{components.eyebrow-pill}`.
**Focal** a short display-hero verb phrase (≤3 words) centered, Fraunces 500, tinta-arsip.
**Chrome** an `{components.eyebrow-pill}` above; a `{components.button-primary-giant}` centered below the phrase at ~5vw offset.
**Accent** the button-primary-giant's ground is overridden to `{colors.terra-bata}` **on this plate only** — the closer earns the terra button. The `{components.accent-terra-underline}` fires simultaneously under the keyword in the phrase. Together the button and underline stay ≤10% of the surface against kanvas.
**Silence** ~62% empty.
**Fixed** center anchor, Fraunces 500 phrase, one terra fill + one terra underline.  **Free** phrase and button label (from script).
**Pace** low.

## Do's and Don'ts

### Do
- **Do** treat every frame as a page of the ledger monograph: paper first, then ink, then — rarely — terra.
- **Do** run every numeral with tabular figures on, right-aligned in tables, centered in stat plates.
- **Do** use the 4px double rule under totals and stat numerals. It is the silhouette.
- **Do** hold sparse plates at 60–75% empty. The silence is the confidence.
- **Do** lean centered on cover, claim, focal, and closer; vary the anchor to two-column left only for the catalog plate.
- **Do** cut hard. Static frames, held on beat.

### Don't
- **Don't** put terra bata on more than one element per frame. If the button is terra, the underline is not.
- **Don't** animate the wordmark, the claim, or the numeral. Setting is a decision; setting-then-moving is a slide.
- **Don't** round the ledger. Rules meet at right angles.
- **Don't** stack two eyebrows on one frame. If it needs two labels, it needs two frames.
- **Don't** let a decorative element cross the headline or eyebrow bounding box — 2vw keep-out.
- **Don't** use debit-daun or kredit-bata anywhere except on ledger/stat numerals. They are semantics, not colour.
- **Don't** invent shadow, glow, gradient, or glass. The depth vocabulary is exactly Matte-rest and Matte-lift.

## Aspect-Ratio Behavior

| Treatment | 16:9 (primary) | 9:16 (portrait) | 1:1 (square) |
|---|---|---|---|
| 1 · Meja Kosong | Wordmark at 26vw, centered, tagline 3vw below. | Wordmark steps up to ~34vw (frame is narrower); tagline stays 1.5vw. | Wordmark at 22vw, tagline directly below. |
| 2 · Klaim Editorial | Claim up to 78vw wide, centered; word-count ramp step applies. | Claim wraps to 3–4 short lines, ramp steps down one; text block ≤ 84vw of the short edge. | Claim at ~7vw, centered, ≤ 5 lines. |
| 3 · Angka Fokus | Numeral at 18vw, double rule ~24vw wide. | Numeral at 26vw (short edge governs), rule at 34vw. | Numeral at 22vw, rule 30vw. |
| 4 · Neraca | Full ledger, header + 6–8 rows + total. | Rows compress to 4–6; head cells stay uppercase; total row keeps 4px double rule. | Rows to 4; the `label / debit / kredit` columns compress to `label / total` (one numeral column) — semantic pair collapses to running total. |
| 5 · Kartu Matte | Card 60vw × 50vh, centered, Matte-rest shadow. | Card 82vw × 40vh, portrait orientation preserved. | Card 78vw × 78vw, square. |
| 6 · Katalog Akun | Two-column split, list on right. | One-column stack: section-head on top, list below. | One-column stack, tighter row rhythm. |
| 7 · Momen Terra | Phrase + terra button centered; underline under keyword. | Phrase steps to display-hero (short lines), button below. | Phrase ≤ 3 words centered, button below. |

**Rule for every re-scale.** No load-bearing line drops below the **1.4vw legibility floor** on the short edge. Safe margin `{spacing.frame-pad}` = 5vw is measured against the short edge in portrait and square.

## Approved Real Entities & Numerals

Only the following real entities from `design.md` may appear in a frame:

- **Brand name**: Akunio.
- **Palette token names** (only if displayed as chrome, e.g. a colophon frame): terra bata, kanvas arsip, kertas matte, tinta arsip, tinta lembut, garis arsip, debit daun, kredit bata.
- **Named rules** (only if quoted verbatim): The One Accent Rule, The Lilin Rule, The Tabular Money Rule, The Flat-By-Default Rule.

**Numerals.** Every currency figure, every percentage, every date, every count in a frame is **placeholder** at authoring time (`— figure —`, `{price}`, `{count}`, `{date}`). The script supplies the real numbers at render time. **Never invent** a saldo, a percentage, a customer count, a savings figure, a growth rate. The frame is a stage; the script is the actor.

**Currency**: when the script provides an IDR figure, render with tabular numerals, thousand-separators as dots (Indonesian convention: `Rp 1.240.500`), decimals with comma (`,`) when present.

## Pre-Render Self-Audit

Before finalizing any frame, run every line:

- [ ] **Squint** — one focal element dominates at 3–6× its nearest neighbor?
- [ ] **Silence** — sparse plates 60–75% empty? (Neraca is the only exemption, and it is named.)
- [ ] **Restraint** — terra bata fires at most once and covers ≤10% of the surface?
- [ ] **Voltage** — kredit-bata and terra do not share a frame at full strength?
- [ ] **Weight** — every Fraunces set at 500? every tnum numeral tabular?
- [ ] **Depth** — no shadow, glow, blur, or gradient outside Matte-rest / Matte-lift? Matte-lift used at most once per sequence?
- [ ] **Geometry** — buttons/inputs at `{rounded.lg}` 16px? cards at `{rounded.xl}` 22.4px? ledger unrounded?
- [ ] **Anchor** — cover/claim/focal/closer centered? catalog left-anchored? no more than 2 consecutive frames share an anchor?
- [ ] **Element count** — ≤ 2–3 distinct elements on a sparse frame? (Neraca is the exemption.)
- [ ] **Floor** — no load-bearing line under 1.4vw on any aspect?
- [ ] **Keep-out** — no decorative element within 2vw of the headline or eyebrow bounding box?
- [ ] **Signature** — is the 4px double rule present under any total on the plate that calls for it?
- [ ] **Copy fidelity** — every numeral is a placeholder or a script-supplied real value; no invented figures?
- [ ] **Motion** — no ride-in on set type; only the terra underline / double rule may draw, ≤ once per sequence?

If any box is unticked, the frame is not ready.

## Known Gaps

- **`vw` stored as string.** The spec parser stores `vw` and `cqw` values in the frontmatter as strings — this is a documented extension of the DESIGN.md schema, not a violation. Downstream consumers should read frame-native sizes as opaque strings and resolve at render time.
- **Motion & Timing** and **Aspect-Ratio Behavior** are **derived sections** — they extend the source `design.md`, which was scoped to a web/product context. They are normative for video/frame renders and advisory for any web re-use.
- **Approved Real Entities & Numerals** is a **video-authoring constraint**; it does not shrink the source brand's vocabulary, only the licence to *invent* concrete numerals inside frames.
- **Lilin (dark mode)** is not authored at frame scale in this pass. A Lilin sequence would be authored as a companion `frame.md`, not derived by tinting these plates.
- **9:16 and 1:1 re-scales** in the Aspect-Ratio Behavior table are guidance, not proof. Each ratio should be re-audited against the Pre-Render Self-Audit before render.
