---
name: Vela
description: A calm, tactile desktop browser shell tinted by the active Space
colors:
  space-from: "#5b6cff"
  space-to: "#9a5bff"
  ink: "#12101eeb"
  ink-muted: "#12101e94"
  ink-faint: "#12101e5c"
  surface: "#ffffff9e"
  surface-hover: "#ffffff61"
  surface-active: "#ffffffc7"
  surface-strong: "#ffffffeb"
  panel: "#fcfcfff0"
  border: "#12101e14"
  danger: "#e5484d"
  ok: "#1f9d55"
  dark-ink: "#ffffffeb"
  dark-surface: "#ffffff24"
  dark-panel: "#1c1b24f5"
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable', 'Segoe UI', Roboto, Ubuntu, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.35
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable', 'Segoe UI', Roboto, Ubuntu, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable', 'Segoe UI', Roboto, Ubuntu, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.06em"
  mono:
    fontFamily: "'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace"
    fontSize: "12px"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  tab-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "32px"
    padding: "0 6px 0 8px"
  tab-row-hover:
    backgroundColor: "{colors.surface-hover}"
  tab-row-active:
    backgroundColor: "{colors.surface-active}"
  url-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "34px"
    padding: "0 10px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.sm}"
    size: "28px"
  icon-button-hover:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.ink}"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
  command-item-selected:
    backgroundColor: "{colors.space-from}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 10px"
---

# Design System: Vela

## 1. Overview

**Creative North Star: "The Quiet Instrument"**

Vela's shell is a well-machined instrument around someone else's content: the website is the
subject, the chrome is the hand that holds it. Every neutral is tinted by the active Space's
gradient, so the sidebar, panels and overlays always belong to the current context without ever
competing with the page. Density is moderate: 32 px rows, 13 px type, 8 px rhythm, generous only
where the eye rests (overlays, empty states).

The system is tactile rather than decorative. Surfaces are translucent layers of the Space color
(white at 38–92 % in light mode, white at 8–26 % in dark mode), never flat grey boxes. Depth comes
from two soft shadows and a 1 px tinted hairline, not from borders. Motion is the signature: every
press answers in the same frame, every reveal decelerates on an exponential curve, nothing bounces.

It explicitly rejects: purple-to-blue gradient text, glowing cards, cards inside cards, identical
icon-title-text grids, bounce easing, page-load choreography, pure black or pure white.

**Key Characteristics:**
- Space-tinted neutrals everywhere (`color-mix` of the Space gradient into every surface)
- Translucent layering instead of borders; hairlines only where two panels meet
- Motion vocabulary: 120 / 200 / 320 ms, `cubic-bezier(0.22, 1, 0.36, 1)`, transform + opacity only
- One accent (the Space's `from` color, darkened) for selection and primary actions
- System font stack, one family, tight 1.2 scale ratio

## 2. Colors

A single Space gradient tints every neutral; the palette is a set of transparencies over it.

### Primary
- **Space From** (`--space-from`, default #5b6cff): the left/top of the Space gradient and the
  source of the accent. Selection in the command bar (`16 %` mix), focus rings (`70 %` mix with
  black in light, with white in dark), primary buttons.
- **Space To** (`--space-to`, default #9a5bff): the right/bottom of the gradient only.

### Neutral
- **Ink** (`--fg`, rgba(18,16,30,.92)): primary text. Night-tinted, never pure black.
- **Ink Muted** (`--fg-muted`, .58): secondary text, icons at rest.
- **Ink Faint** (`--fg-faint`, .36): placeholders, hints, inactive icons.
- **Surface** (`--surface`, white .62): URL field, badges, inputs on the sidebar.
- **Surface Hover** (`--surface-hover`, white .38): rows and buttons under the pointer.
- **Surface Active** (`--surface-active`, white .78): the selected tab row, pressed buttons.
- **Panel** (`--panel-bg`, rgba(252,252,255,.94)): overlays (command bar, switcher, prompts).
- **Border** (`--border`, ink .08): hairlines between panel regions only.

### Tertiary (semantic)
- **Danger** (#e5484d): "Not secure", destructive confirmations. Text and icon only; never a fill.
- **OK** (#1f9d55): secure-site lock, download complete.

### Named Rules
**The Tint Rule.** No neutral is ever pure. Every grey is a transparency over the Space gradient
(sidebar) or over the panel tint; `#000` / `#fff` / `#888` are forbidden as literals.
**The One Accent Rule.** The Space accent appears only on the current selection, primary actions
and live state (loading, recording). Inactive states never carry saturated color.

## 3. Typography

**Display Font:** none; one family.
**Body Font:** SF Pro Text / Segoe UI Variable (system stack), antialiased.
**Label/Mono Font:** SF Mono / JetBrains Mono for URLs in detail views and ATC patterns.

**Character:** native, invisible, exact. Type never asks for attention; weight and size carry the
hierarchy, letter-spacing tightens slightly at 20 px and above.

### Hierarchy
- **Title** (600, 22 px, 1.2, -0.01em): page titles on internal pages, empty-state headings.
- **Section** (600, 15 px, 1.3): settings section headings, overlay titles.
- **Body** (400, 13 px, 1.35): rows, inputs, descriptions. Max 60ch on internal pages.
- **Command input** (400, 17 px): the command bar field only.
- **Label** (600, 11 px, +0.06em, uppercase): group headers ("TODAY", "BROWSING"), badges.
- **Hint** (400, 12 px): shortcut hints, timestamps, secondary metadata.

### Named Rules
**The Single Family Rule.** No second typeface for headings. Hierarchy is weight × size only.

## 4. Elevation

Hybrid: translucent tonal layers for everything attached to the sidebar, soft dual shadows for
anything floating. Surfaces at rest are flat; a shadow appears only when something lifts (active
tab row, dragged item, overlay).

### Shadow Vocabulary
- **Rest lift** (`0 1px 2px rgba(18,16,30,.08)`): the active tab row, pressed toggles.
- **Float** (`--shadow`: `0 1px 2px .06, 0 8px 24px .10`): popovers, downloads panel, site control.
- **Overlay** (`--shadow-lg`: `0 2px 6px .10, 0 24px 64px .24` + `0 0 0 1px var(--border)`):
  command bar, switcher, space editor, peek chrome. Dark mode doubles the alpha.
- **Drag ghost**: Float + `scale(1.02)` + 0.9 opacity.

### Named Rules
**The Lift Rule.** Shadows are a response to state (selected, pressed, dragging, floating), never
a decoration on resting content. If it is not above something, it has no shadow.

## 5. Components

### Buttons
- **Shape:** gently rounded (6 px); pill (999 px) only for toasts and badges.
- **Icon button:** 28 × 28, muted ink; hover fills Surface Hover and darkens to Ink; active
  presses to `scale(0.96)` for 120 ms; disabled at 35 % opacity.
- **Primary:** accent fill, panel-colored text, 600 weight, 8 × 14 padding; hover lifts the
  luminance 6 %, active presses to 0.98.
- **Secondary / text:** Surface fill or none; same press behavior.
- **Hover / Focus:** 120 ms background, 2 px focus ring in the accent at 1 px offset.

### Tab rows (sidebar)
- 32 px, 8 px gap, favicon 16 px, title 13 px ellipsised, close button appears on hover.
- Active: Surface Active + rest lift; in-split: Surface Hover; sleeping: muted title.
- Loading: 12 px ring spinner in place of the favicon.

### Inputs / Fields
- **Style:** Surface fill, no stroke, 6–10 px radius, 32–34 px tall.
- **Focus:** accent ring (2 px, 1 px offset); the URL field becomes the command bar instead.
- **Error:** danger text under the field; the field itself never turns red.

### Overlays (command bar, switcher, prompts)
- Panel tint, 14 px radius, Overlay shadow, 24 px backdrop blur, 120 ms pop (opacity + 4 px rise,
  `scale(0.98 → 1)`), exits in 90 ms.
- Results: 40 px rows, 10 px radius, selection = 16 % accent mix, shortcut hints right-aligned.

### Navigation (sidebar)
- Favorites grid → Pinned (folders, 20 px indent) → Today, separated by hairlines.
- Space bar at the bottom: emoji chips, the active one in Surface Active, `+` to create.

### Signature: Space theme
The sidebar background is `linear-gradient(165deg, mix(from 42 %, white), mix(to 36 %, white))`
plus an optional SVG grain at `--grain` opacity in overlay blend. Dark mode mixes into #15141c.
Switching Spaces cross-fades the gradient over 320 ms.

## 6. Do's and Don'ts

### Do:
- **Do** answer every press in the same frame (`:active` transform at 120 ms) before any motion.
- **Do** use `transform` and `opacity` only; durations 120 / 200 / 320 ms; `--ease-out`.
- **Do** design all states: default, hover, focus-visible, active, disabled, loading, error, empty.
- **Do** tint every neutral with the Space color via `color-mix`; keep hairlines at ink .08.
- **Do** keep shortcut hints visible on hover and in overlays; power users read them.
- **Do** collapse every transition under `prefers-reduced-motion`.

### Don't:
- **Don't** use `#000`, `#fff` or untinted greys as literals.
- **Don't** use gradient text, glowing cards, hero metrics, cards inside cards, or identical
  icon-title-text grids ("AI dashboard" look).
- **Don't** use `border-left` / `border-right` greater than 1 px as a colored accent.
- **Don't** bounce, overshoot or spring; never animate `width`, `height`, `top`, `left`.
- **Don't** choreograph page loads; internal pages render settled.
- **Don't** reach for a modal; prefer inline, popover or overlay panels.
- **Don't** use em dashes in copy; use commas, colons or periods.
