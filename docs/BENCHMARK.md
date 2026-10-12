# Arc vs Vela benchmark

<p align="center"><img src="benchmark/arc-vs-vela.svg" alt="Arc vs Vela benchmark chart" width="100%"></p>

**TL;DR**: on the same Mac, with the same 11 tabs and both browsers downloading exactly the same
pages, Vela opens its window 7.6× faster than Arc, uses 38 % less memory, 60 % less CPU while idle
in front, and switches tabs 4× faster. With its built-in content blocker on (the default), Vela uses
50 % less memory and 95 % less idle CPU. Page loads are a tie: both run Blink. One result goes to
Arc: with its window in the background and no blocker, Arc idles lower (14 % vs 24 % of a core).

Raw data: [`apps/desktop/perf/compare/results.json`](../apps/desktop/perf/compare/results.json).
Full generated report: [`REPORT.md`](../apps/desktop/perf/compare/REPORT.md).

## Setup

| | |
| --- | --- |
| Machine | MacBook Pro, Apple M5 (10 cores), 32 GB, macOS 26.5, on battery, Low Power Mode off |
| Arc | 1.168.0, Chromium 155.0.8059.40 |
| Vela | 0.4.0 (packaged `.app`), Electron 44.7.0, Chromium 152.0.7977.130 |
| Display | built-in 120 Hz, both windows at the same frame (1512 × 949 points) |
| Date | 2026-10-12 |

Both browsers run the **same script** (`apps/desktop/perf/compare/bench.mjs`) and the **same
in-page probes**, and both are driven the same way: over the Chrome DevTools Protocol
(`--remote-debugging-port`), with no test framework attached. Arc's tabs are created with
`Target.createTarget` and land in its sidebar like any tab; Vela's through its own `window.vela`
bridge. Measurements come from outside both browsers wherever possible:

| Metric | How |
| --- | --- |
| Launch | the binary is spawned by a helper that polls the macOS WindowServer every 2 ms for the app's first on-screen window. 1 warm-up launch discarded, then 5 launches each, alternated. |
| Memory | `phys_footprint` (the "Memory" column of Activity Monitor) of **every process** in the browser's tree: browser, GPU, network, storage, renderers. RSS is not used: it counts the shared Chromium framework once per process. |
| Idle CPU | kernel CPU time (`ps`) of the whole tree over 30 s, browser in front, nothing moving but the pages themselves. |
| Page loads | Navigation Timing + Paint Timing read inside the page, identical probe in both. 6 pages × 5 rounds, A/B order alternated every page so network drift hits both. |
| Tab switch | a real `⌘⌥↓` / `⌘⌥↑` keystroke (CGEvent, same shortcut in both browsers) → the next frame committed in the newly shown page. |

## Results

### Launch

| | Arc | Vela |
| --- | --- | --- |
| Launch → window on screen, median | 2058 ms | **271 ms** |
| All runs | 2090, 2058, 2008, 2077, 1998 | 257, 271, 270, 278, 284 |
| CPU used in the first 10 s | 4.2 s | **0.6 s** |
| Memory 10 s after launch | 418 MB | **199 MB** |

### Memory and idle CPU, 1 local tab + 10 real sites

The ten sites: Wikipedia, GitHub, Le Monde, YouTube, MDN, Hacker News, BBC News, Stack Overflow,
Reddit, Apple.

| | Arc | Vela, blocker off | Vela (default) |
| --- | --- | --- | --- |
| 1 local tab | 612 MB | 282 MB | 287 MB |
| 11 tabs | 3149 MB | **1967 MB** | **1576 MB** |
| Cost of the 10 sites | 2537 MB | 1685 MB | 1290 MB |
| After closing the 10 | 960 MB | 578 MB | 530 MB |
| Processes with 11 tabs | 45 | 32 | 19 |
| Idle CPU, app in front | 111 % | **44.6 %** | **5.9 %** |
| Idle CPU, app in the background | **14.1 %** | 23.7 % | 1.3 % |

"Idle" means nobody touches anything for 30 s; the CPU goes to the pages' own animations, ads and
timers, so it moves with whatever the ten sites serve that minute. Read the order of magnitude.

Where the memory goes with 11 tabs:

| Process role | Arc | Vela, blocker off |
| --- | --- | --- |
| Browser (UI) process | 448 MB | 125 MB |
| GPU | 711 MB | 460 MB |
| Renderers (pages) | 1838 MB | 1335 MB |
| Network, storage, audio, video | 151 MB | 48 MB |

### Page loads

A tie, as expected from the same rendering engine. Median first contentful paint over the four
warm-cache rounds:

| Page | Arc | Vela | Vela, blocker off |
| --- | --- | --- | --- |
| Local fixture | 76 ms | 76 ms | 82 ms |
| Wikipedia | 102 ms | 126 ms | 122 ms |
| GitHub | 558 ms | 228 ms | 508 ms |
| Le Monde | 194 ms | 190 ms | 170 ms |
| YouTube | 278 ms | 258 ms | 428 ms |
| MDN | 78 ms | 90 ms | 106 ms |

GitHub and YouTube swing by hundreds of milliseconds from round to round (network). Arc is a little
quicker on Wikipedia and MDN, Vela on GitHub; none of it is outside the noise.

### Tab switch

| | Arc | Vela |
| --- | --- | --- |
| Keystroke → frame, median | 12.0 ms | **3.0 ms** |
| p95 | 15.0 ms | 6.0 ms |
| Samples | 20 | 60 |

## Caveats, in full

- **One machine.** An M5 MacBook Pro. Numbers on an 8 GB Intel Mac or on Windows will differ; the
  ratios are what to compare. Please run it and share yours.
- **Profiles are not identical.** Arc runs on a real install, measured in an empty Space (pointed at
  a fresh home directory, Arc relaunches itself on the user's profile); it still loads all its
  Spaces at launch. Vela runs on a fresh profile. This weighs on launch and on the 1-tab figure, not
  on the cost of the 10 sites.
- **Different Chromium versions** (155 vs 152). Same engine family, three releases apart.
- **The "blocker off" columns are the fair engine comparison.** The default columns show the
  product as shipped: Vela blocks ads and trackers, Arc does not.
- **No Playwright.** A first run drove Vela with Playwright, which attaches to every page and keeps
  it "visible" and focused, so Vela's background tabs were never throttled. That skewed Vela's CPU
  and tab-switch figures (against Vela). Both browsers are now driven by raw CDP only.
- **Arc's own blocker was not filtering.** Arc ships a native content blocker; during these runs it
  loaded exactly as many requests per page as Vela with its blocker off, so the "blocker off"
  columns are the like-for-like ones.
- **Tab switch, Arc.** In this run Arc ignored the synthetic keystrokes; its figures come from its
  20-keystroke validation round the day before, measured the same way.

## Run it yourself

macOS, with Arc installed and the packaged Vela built (`pnpm build`):

```bash
cd apps/desktop
caffeinate -dimsu node perf/compare/bench.mjs   # ~20 min; quits and relaunches Arc
# VELA_BIN=/path/to/Vela.app/Contents/MacOS/Vela to measure another build
node perf/compare/report.mjs > perf/compare/REPORT.md
node perf/compare/charts.mjs                    # regenerates docs/benchmark/arc-vs-vela.svg
```

The terminal running it needs Accessibility and Screen Recording permissions (for the keystrokes
and the WindowServer polling). Keep the screen unlocked: a locked screen hides both windows and the
script aborts rather than record wrong numbers.
