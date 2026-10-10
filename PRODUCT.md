# Product

<!-- Generated from the codebase, docs/DECISIONS and the owner's brief ("finish better than Apple,
world-class micro-interactions"); the owner asked for no questions, so inferred answers are marked. -->

## Register

product

## Users

People who live in their browser all day: founders, designers, developers, consultants. They keep
dozens of tabs across work and personal contexts, use the keyboard first (⌘T, ⌘L, Ctrl+Tab) and the
mouse second, and judge software by how it feels under the hand. They sit in front of a 14–27"
display for hours; the browser is the room they work in, not a tool they open. Many come from Arc,
Chrome or Safari and will compare every detail to those (inferred).

## Product Purpose

Vela is a desktop browser (Electron + one WebContentsView per tab) with an Arc-style vertical
sidebar, Spaces with themes and profiles, a command bar instead of a URL bar, split view, Peek,
Little windows, auto-archiving, a content blocker and reader mode. It exists to make a day of
browsing feel calm, fast and light: idle tabs sleep, the shell idles at ~110 MB, every interaction
lands in a frame. Success is a user who stops noticing the browser and notices only how little
friction there is.

## Brand Personality

Calm, precise, quietly confident. Three words: **effortless, tactile, exact**. The interface should
feel like a well-made physical object: everything responds instantly, moves with weight and settles
without wobble. Emotional goals: relief (the tab mess is handled), flow (nothing interrupts), small
pride (it feels expensive). Voice: short sentences, no exclamation marks, no jargon in user-facing
copy.

## Anti-references

- Generic "AI dashboard" look: purple-to-blue gradients on text, glowing cards, hero metrics.
- Chrome's utilitarian chrome: grey boxes, instant state changes, no motion vocabulary.
- Over-animated consumer apps: bounces, springs that overshoot, confetti, page-load choreography.
- Cards inside cards, identical icon+title+text grids, modal dialogs for everything.
- Flat "settings page" templates with uniform padding everywhere.
- Any visual reference to Arc's logo or brand assets (name and assets are forbidden by the mission).

## Design Principles

1. **Respond in the same frame.** Every press, hover and key must show feedback within one frame;
   motion then explains what happened. Feedback first, choreography never.
2. **Weight without wobble.** Motion uses exponential ease-out curves, 120–320 ms, transform and
   opacity only. Nothing bounces, nothing fades in on load.
3. **Every state is designed.** Default, hover, focus, active, disabled, loading, error, empty,
   success: a component without all of them is unfinished.
4. **The space is the color.** The active Space's gradient tints every neutral; the accent is used
   only for the current selection, primary actions and live state.
5. **Density for experts, clarity for first-timers.** Keyboard shortcuts everywhere, visible on
   hover; nothing requires a tooltip to be understood.

## Accessibility & Inclusion

WCAG 2.1 AA for text contrast on all Space themes (light and dark). Full keyboard operation with
visible focus rings (`:focus-visible`), ARIA tree/combobox/dialog roles already in place.
`prefers-reduced-motion` collapses every transition to an instant state change. Color is never the
only carrier of meaning (icons and text accompany state). Minimum hit target 24×24 CSS px in the
sidebar, 32×32 for toolbar buttons.
