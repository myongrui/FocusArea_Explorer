# CS Focus Area Explorer

An interactive prerequisite-tree explorer for **NUS Computer Science** focus areas.
Drag any of the 11 focus areas onto the canvas and the tree rebuilds itself —
foundations on the left, then the prerequisite chain flowing right into each
area's primary modules. Add several areas at once to see where they **share**
modules.

Focus-area membership (which modules are *primary* in each area) follows the
official [NUS SoC focus list](https://www.comp.nus.edu.sg/programmes/ug/focus/).
Prerequisites and titles come from the [NUSMods](https://nusmods.com) API v2,
academic year **2026–2027** (current-year only, no multi-year fallback).

## Run it

No build step, no dependencies. Just open the file:

- **Double-click `index.html`** — it opens in your browser and works fully offline.
- Or serve the folder (nicer for dev; avoids any `file://` quirks):
  ```sh
  # Python 3
  python -m http.server 8000
  # then visit http://localhost:8000
  ```

## Project structure

```
CSFocusAreaExplorer/
├── index.html        # markup + script/style includes
├── css/
│   └── styles.css    # all styling; light/dark via CSS custom properties
└── js/
    ├── data.js       # AREAS / NODES / EDGES  (the graph data)
    └── app.js        # UI logic: layout, drag-drop, animation, highlight
```

`data.js` is deliberately separate from `app.js` so the graph can be regenerated
or hand-edited without touching the rendering code.

## How it works

- **Visibility** — activating an area shows its primary modules plus the
  *transitive prerequisite closure* of those primaries, so foundations and
  on-path "support" modules appear automatically.
- **Roles are relative to the selection.** A module is `SUPPORT` (grey) when it's
  only on the path to something else, but becomes a coloured `PRIMARY` once its
  own area is active. Drop **Parallel Computing** and watch `CS3210` change.
- **Shared modules** (e.g. `CS4231`, shared by Algorithms / Networking /
  Parallel) get a gradient bar and an `N AREAS` tag.
- **Layout** — longest-path tiering for the x-axis, barycenter crossing-reduction
  for the y-axis, recomputed on every change; nodes glide via a
  `requestAnimationFrame` loop and edges (inline SVG beziers) follow each frame.
- **Edges** — solid = required prerequisite, dashed = one of several acceptable
  options.

## Colour / accessibility note

Eleven categorical area colours cannot all be colour-blind-separable
simultaneously (a known limit past ~8 categories), so **identity is carried by
the course code on every node** and by the name+colour chips in the palette —
colour is reinforcement, not the sole signal.

## Data notes

- **CS4232** (Theory of Computation) is on the SoC primary list but has no
  NUSMods offering in any year (404), so it can't be placed in a prerequisite
  tree and is omitted rather than drawn disconnected.
- **CS3212** (a retired alternative prerequisite of CS4212) is dropped.
- Every module code links out to its NUSMods page.

To refresh membership, re-check the SoC focus list; to refresh prerequisites for
a future academic year, re-fetch prerequisite trees from the NUSMods API. Either
way only `js/data.js` changes — no other file needs to.
