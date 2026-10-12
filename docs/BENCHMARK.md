# Arc vs Vela benchmark

<p align="center"><img src="benchmark/arc-vs-vela.svg" alt="Arc vs Vela benchmark chart" width="100%"></p>

**TL;DR**: on the same Mac, with the same 11 tabs, Vela opens its window 8.9× faster than Arc, uses
32 % less memory and 29 % less idle CPU when both download exactly the same pages, and switches tabs
in half the time. With its built-in content blocker on (the default), Vela uses 47 % less memory
and 88 % less idle CPU. Page load times are a tie: both run Blink.

Raw data: [`apps/desktop/perf/compare/results.json`](../apps/desktop/perf/compare/results.json).
Full generated report: [`REPORT.md`](../apps/desktop/perf/compare/REPORT.md).

## Setup

| | |
| --- | --- |
| Machine | MacBook Pro, Apple M5 (10 cores), 32 GB, macOS 26.5, on battery, Low Power Mode off |
| Arc | 1.168.0, Chromium 155.0.8059.40 |
| Vela | 0.3.0 (packaged `.app`), Electron 44.7.0, Chromium 152.0.7977.130 |
| Display | built-in 120 Hz, both windows at the same frame (1512 × 949 points) |
| Date | 2026-10-11 |

Both browsers run the **same script** (`apps/desktop/perf/compare/bench.mjs`) and the **same
in-page probes**. Arc is driven over the Chrome DevTools Protocol (`--remote-debugging-port`, tabs
created with `Target.createTarget` land in the Arc sidebar like any tab); Vela through its own main
process. Measurements come from outside both browsers wherever possible:

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
| Launch → window on screen, median | 2116 ms | **237 ms** |
| All runs | 2116, 2163, 2113, 2166, 2048 | 254, 238, 237, 228, 233 |
| CPU used in the first 10 s | 4.3 s | **0.5 s** |
| Memory 10 s after launch | 423 MB | **175 MB** |

### Memory and idle CPU, 1 local tab + 10 real sites

The ten sites: Wikipedia, GitHub, Le Monde, YouTube, MDN, Hacker News, BBC News, Stack Overflow,
Reddit, Apple.

| | Arc | Vela, blocker off | Vela (default) |
| --- | --- | --- | --- |
| 1 local tab | 535 MB | 281 MB | 282 MB |
| 11 tabs | 3902 MB | **2635 MB** | **2052 MB** |
| Cost of the 10 sites | 3367 MB | 2354 MB | 1770 MB |
| After closing the 10 | 881 MB | 745 MB | 677 MB |
| Processes with 11 tabs | 49 | 32 | 19 |
| Idle CPU, browser in front | 82.2 % | **58.6 %** | **9.7 %** |
| Idle CPU, browser in the background | 75.0 % | 51.5 % | 8.8 % |

Where the memory goes with 11 tabs:

| Process role | Arc | Vela, blocker off |
| --- | --- | --- |
| Browser (UI) process | 462 MB | 128 MB |
| GPU | 966 MB | 838 MB |
| Renderers (pages) | 2315 MB | 1617 MB |
| Network, storage, audio, video | 160 MB | 52 MB |

### Page loads

A tie, as expected from the same rendering engine. Median first contentful paint over the four
warm-cache rounds:

| Page | Arc | Vela |
| --- | --- | --- |
| Local fixture | 90 ms | 90 ms |
| Wikipedia | 164 ms | 136 ms |
| GitHub | 468 ms | 212 ms |
| Le Monde | 168 ms | 176 ms |
| YouTube | 226 ms | 240 ms |
| MDN | **94 ms** | 140 ms |

GitHub and Wikipedia are bimodal from round to round (network), so read them as noise. MDN is the
one consistent gap, in Arc's favour (76–112 ms vs 136–164 ms over every round), and it is being
investigated.

### Tab switch

| | Arc | Vela |
| --- | --- | --- |
| Keystroke → frame, median | 12.0 ms | **6.5 ms** |
| p95 | 15.0 ms | 9.0 ms |
| Samples | 20 | 20 |

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
- **Tab switch probes differ slightly.** Arc reports `visibilitychange` in the page; Vela's hidden
  tabs do not (known issue, see below), so Vela is timed from the moment its view is attached, plus
  one IPC round trip. That round trip counts against Vela.
- **Known Vela issue found by this benchmark**: background tabs are detached but still report
  `visibilityState: "visible"`, so Chromium does not throttle their timers and animations. The idle
  CPU figures above include that cost; fixing it should lower them further.

## Run it yourself

macOS, with Arc installed and the packaged Vela built (`pnpm build`):

```bash
cd apps/desktop
caffeinate -dimsu node perf/compare/bench.mjs   # ~20 min; quits and relaunches Arc
node perf/compare/report.mjs > perf/compare/REPORT.md
node perf/compare/charts.mjs                    # regenerates docs/benchmark/arc-vs-vela.svg
```

The terminal running it needs Accessibility and Screen Recording permissions (for the keystrokes
and the WindowServer polling). Keep the screen unlocked: a locked screen hides both windows and the
script aborts rather than record wrong numbers.
