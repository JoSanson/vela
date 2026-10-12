# Arc vs Vela — benchmark

Machine: Apple M5 (10 cores), 32 GB, Darwin 25.5.0. Run 2026-10-12T06:17:32.569Z.
Arc 1.168.0 (Chrome/155.0.8059.40) · Vela 0.4.0 (Chrome/152.0.7977.130 (Electron 44.7.0)).

## Startup (launch → first window on screen, WindowServer)
| Metric | Arc | Vela | Vela / Arc |
| --- | --- | --- | --- |
| Window on screen, median (ms) | 2058 | 271 | 0.13× |
| Window on screen, runs (ms) | 2090, 2058, 2008, 2077, 1998 | 257, 271, 270, 278, 284 |  |
| CPU burnt in first 10 s (s) | 4.2 | 0.6 | 0.15× |
| Memory at 10 s (MB) | 418 | 199 | 0.48× |
| Processes at 10 s | 4 | 5 |  |

## Memory (phys_footprint, whole process tree) and idle CPU
| Metric | Vela | Vela (blocker off) | Arc |
| --- | --- | --- | --- |
| 1 local tab (MB) | 287 | 282 | 612 |
| 11 tabs: 1 local + 10 real sites (MB) | 1576 | 1967 | 3149 |
| Cost of the 10 real sites (MB) | 1290 | 1685 | 2537 |
| After closing the 10 (MB) | 530 | 578 | 960 |
| Processes with 11 tabs | 19 | 32 | 45 |
| Idle CPU, 11 tabs, app active (% of a core) | 5.9 | 44.6 | 111.0 |
| Idle CPU, 11 tabs, app inactive (% of a core) | 1.3 | 23.7 | 14.1 |

Breakdown with 11 tabs (MB):

| Process role | Vela | Vela (blocker off) | Arc |
| --- | --- | --- | --- |
| browser | 102 | 125 | 448 |
| gpu | 357 | 460 | 711 |
| network | 21 | 27 | 81 |
| renderer | 1076 | 1335 | 1838 |
| audio | 8 | 8 | 20 |
| video_capture | 13 | 13 | 23 |
| storage | 0 | 0 | 27 |

## Page loads (ms, median of rounds 1-4 = warm HTTP cache; round 0 = first visit, shown apart)
In-page Navigation/Paint Timing, identical probe. "open→FCP" is wall clock from the open-tab call to first contentful paint, so it includes the browser's own tab/process creation.

### open → FCP

| Page | Arc | Vela | Vela (blocker off) | Arc, 1st visit | Vela, 1st visit | Vela (blocker off), 1st visit |
| --- | --- | --- | --- | --- | --- | --- |
| local fixture | 80 | 79 | 85 | 123 | 93 | 101 |
| fr.wikipedia.org | 107 | 129 | 125 | 350 | 148 | 410 |
| github.com | 563 | 230 | 511 | 1061 | 609 | 196 |
| lemonde.fr | 200 | 193 | 173 | 784 | 189 | 977 |
| youtube.com | 283 | 260 | 431 | 634 | 1407 | 309 |
| developer.mozilla.org | 83 | 92 | 109 | 437 | 127 | 433 |

### FCP

| Page | Arc | Vela | Vela (blocker off) | Arc, 1st visit | Vela, 1st visit | Vela (blocker off), 1st visit |
| --- | --- | --- | --- | --- | --- | --- |
| local fixture | 76 | 76 | 82 | 120 | 80 | 96 |
| fr.wikipedia.org | 102 | 126 | 122 | 344 | 144 | 404 |
| github.com | 558 | 228 | 508 | 1056 | 604 | 192 |
| lemonde.fr | 194 | 190 | 170 | 780 | 184 | 972 |
| youtube.com | 278 | 258 | 428 | 628 | 1404 | 308 |
| developer.mozilla.org | 78 | 90 | 106 | 432 | 124 | 428 |

### LCP

| Page | Arc | Vela | Vela (blocker off) | Arc, 1st visit | Vela, 1st visit | Vela (blocker off), 1st visit |
| --- | --- | --- | --- | --- | --- | --- |
| local fixture | 76 | 76 | 82 | 120 | 80 | 96 |
| fr.wikipedia.org | 102 | 126 | 122 | 344 | 144 | 404 |
| github.com | 670 | 290 | 520 | 1056 | 604 | 192 |
| lemonde.fr | 194 | 202 | 170 | 788 | 184 | 972 |
| youtube.com | 520 | 534 | 582 | 900 | 1404 | 552 |
| developer.mozilla.org | 84 | 90 | 106 | 432 | 124 | 428 |

### LOAD

| Page | Arc | Vela | Vela (blocker off) | Arc, 1st visit | Vela, 1st visit | Vela (blocker off), 1st visit |
| --- | --- | --- | --- | --- | --- | --- |
| local fixture | 29 | 50 | 51 | 49 | 56 | 70 |
| fr.wikipedia.org | 94 | 102 | 100 | 533 | 135 | 664 |
| github.com | 674 | 323 | 596 | 1324 | 931 | 285 |
| lemonde.fr | 429 | 251 | 272 | 1541 | 205 | 1525 |
| youtube.com | 446 | 469 | 521 | 1170 | 2038 | 494 |
| developer.mozilla.org | 42 | 84 | 86 | 1081 | 83 | 448 |

### Requests per page (same counts = the blocker removed little on these five)

| Page | Arc | Vela | Vela (blocker off) |
| --- | --- | --- | --- |
| local fixture | 1 | 1 | 1 |
| fr.wikipedia.org | 34 | 34 | 33 |
| github.com | 197 | 197 | 197 |
| lemonde.fr | 42 | 40 | 42 |
| youtube.com | 47 | 34 | 40 |
| developer.mozilla.org | 74 | 67 | 73 |


## Tab switch (real Cmd+Option+↑/↓ keystroke → next committed frame in the shown page)
Source: Vela: 60 keystrokes, this run (2026-10-12). Arc: its 20-keystroke validation round of 2026-10-11 (same raw-CDP method; Arc ignored the keys in this run).

| Metric | Arc | Vela |
| --- | --- | --- |
| Samples | 20/20 | 60/60 |
| Median (ms) | 12.0 | 3.0 |
| p95 (ms) | 15.0 | 6.0 |
| Max (ms) | 27.0 | 22.0 |

