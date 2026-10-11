# Arc vs Vela — benchmark

Machine: Apple M5 (10 cores), 32 GB, Darwin 25.5.0. Run 2026-10-11T19:22:38.640Z.
Arc 1.168.0 (Chrome/155.0.8059.40) · Vela 0.3.0 (Chrome/152.0.7977.130 (Electron 44.7.0)).

## Startup (launch → first window on screen, WindowServer)
| Metric | Arc | Vela | Vela / Arc |
| --- | --- | --- | --- |
| Window on screen, median (ms) | 2116 | 237 | 0.11× |
| Window on screen, runs (ms) | 2116, 2163, 2113, 2166, 2048 | 254, 238, 237, 228, 233 |  |
| CPU burnt in first 10 s (s) | 4.3 | 0.5 | 0.12× |
| Memory at 10 s (MB) | 423 | 175 | 0.41× |
| Processes at 10 s | 4 | 5 |  |

## Memory (phys_footprint, whole process tree) and idle CPU
| Metric | Vela | Vela (blocker off) | Arc |
| --- | --- | --- | --- |
| 1 local tab (MB) | 282 | 281 | 535 |
| 11 tabs: 1 local + 10 real sites (MB) | 2052 | 2635 | 3902 |
| Cost of the 10 real sites (MB) | 1770 | 2354 | 3367 |
| After closing the 10 (MB) | 677 | 745 | 881 |
| Processes with 11 tabs | 19 | 32 | 49 |
| Idle CPU, 11 tabs, app active (% of a core) | 9.7 | 58.6 | 82.2 |
| Idle CPU, 11 tabs, app inactive (% of a core) | 8.8 | 51.5 | 75.0 |

Breakdown with 11 tabs (MB):

| Process role | Vela | Vela (blocker off) | Arc |
| --- | --- | --- | --- |
| browser | 98 | 128 | 462 |
| gpu | 692 | 838 | 966 |
| network | 21 | 33 | 90 |
| renderer | 1221 | 1617 | 2315 |
| audio | 9 | 9 | 20 |
| video_capture | 10 | 10 | 22 |
| storage | 0 | 0 | 28 |

## Page loads (ms, median of rounds 1-4 = warm HTTP cache; round 0 = first visit, shown apart)
In-page Navigation/Paint Timing, identical probe. "open→FCP" is wall clock from the open-tab call to first contentful paint, so it includes the browser's own tab/process creation.

### open → FCP

| Page | Arc | Vela | Vela (blocker off) | Arc, 1st visit | Vela, 1st visit | Vela (blocker off), 1st visit |
| --- | --- | --- | --- | --- | --- | --- |
| local fixture | 98 | 93 | 99 | — | 94 | 91 |
| fr.wikipedia.org | 171 | 140 | 140 | 297 | 135 | 304 |
| github.com | 476 | 215 | 510 | 977 | 507 | 188 |
| lemonde.fr | 175 | 180 | 183 | 370 | 175 | 423 |
| youtube.com | 232 | 243 | 278 | 384 | 573 | 272 |
| developer.mozilla.org | 100 | 143 | 142 | 533 | 148 | 447 |

### FCP

| Page | Arc | Vela | Vela (blocker off) | Arc, 1st visit | Vela, 1st visit | Vela (blocker off), 1st visit |
| --- | --- | --- | --- | --- | --- | --- |
| local fixture | 90 | 90 | 96 | — | 84 | 88 |
| fr.wikipedia.org | 164 | 136 | 136 | 288 | 132 | 300 |
| github.com | 468 | 212 | 506 | 972 | 504 | 184 |
| lemonde.fr | 168 | 176 | 180 | 364 | 172 | 420 |
| youtube.com | 226 | 240 | 274 | 376 | 568 | 268 |
| developer.mozilla.org | 94 | 140 | 138 | 524 | 144 | 444 |

### LCP

| Page | Arc | Vela | Vela (blocker off) | Arc, 1st visit | Vela, 1st visit | Vela (blocker off), 1st visit |
| --- | --- | --- | --- | --- | --- | --- |
| local fixture | 90 | 90 | 96 | — | 84 | 88 |
| fr.wikipedia.org | 164 | 136 | 136 | 288 | 132 | 300 |
| github.com | 576 | 224 | 506 | 972 | 504 | 184 |
| lemonde.fr | 168 | 176 | 180 | 364 | 172 | 488 |
| youtube.com | 520 | 564 | 610 | 600 | 844 | 608 |
| developer.mozilla.org | 94 | 140 | 138 | 524 | 144 | 444 |

### LOAD

| Page | Arc | Vela | Vela (blocker off) | Arc, 1st visit | Vela, 1st visit | Vela (blocker off), 1st visit |
| --- | --- | --- | --- | --- | --- | --- |
| local fixture | 12 | 69 | 75 | — | 72 | 71 |
| fr.wikipedia.org | 156 | 122 | 118 | 392 | 152 | 491 |
| github.com | 578 | 330 | 604 | 1242 | 793 | 293 |
| lemonde.fr | 213 | 206 | 210 | 466 | 216 | 542 |
| youtube.com | 455 | 491 | 552 | 802 | 1129 | 551 |
| developer.mozilla.org | 70 | 109 | 102 | 547 | 105 | 457 |

### Requests per page (same counts = the blocker removed little on these five)

| Page | Arc | Vela | Vela (blocker off) |
| --- | --- | --- | --- |
| local fixture | 1 | 1 | 1 |
| fr.wikipedia.org | 33 | 33 | 33 |
| github.com | 193 | 193 | 193 |
| lemonde.fr | 46 | 45 | 46 |
| youtube.com | 41 | 42 | 45 |
| developer.mozilla.org | 73 | 67 | 73 |

Failed or no-FCP samples: Arc local fixture r0

## Tab switch (real Cmd+Option+↑/↓ keystroke → next committed frame in the shown page)
Source: validation round, 2026-10-11 18:30 UTC, final harness, screen unlocked (the 3x20 rerun at 19:39 hit a locked screen).

| Metric | Arc | Vela |
| --- | --- | --- |
| Samples | 20/20 | 20/20 |
| Median (ms) | 12.0 | 6.5 |
| p95 (ms) | 15.0 | 9.0 |
| Max (ms) | 27.0 | 30.0 |

