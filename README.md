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

## Try it

No install, no sign-up — it runs entirely in your browser:
#### <https://myongrui.github.io/FocusArea_Explorer/>

OR if you want to run it locally:
- **Double-click `index.html`** — it opens in your browser and works fully offline.
- Or serve the folder (nicer for dev; avoids any `file://` quirks):
  ```sh
  # Python 3
  python -m http.server 8000
  # then visit http://localhost:8000
  ```
## Why this exists

Planning a CS focus area at NUS means juggling two things that never sit on the same page:

- The **[SoC focus-area list](https://www.comp.nus.edu.sg/programmes/ug/focus/)** tells you *which* modules count toward each area — but it's just flat text lists. It doesn't show you what you need to take *first*.
- **[NUSMods](https://nusmods.com)** has the prerequisites — but only one module at a time. You can see the tree for `CS4231`, then the tree for `CS3230`, then try to hold both in your head.

So the questions that actually matter when you're choosing an area are hard to answer:

- *If I want this focus area, what's the full chain of modules I have to clear to get there?*
- *I'm interested in two areas — do they overlap? Would one module count toward both?*
- *Where does a course I've already taken lead?*

This tool answers all three visually. Pick the areas you care about, and it draws the **whole dependency tree** at once — foundations on the left flowing right into each area's advanced modules — and it highlights the courses that do double duty across areas.
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

## Data notes

- **CS4232** (Theory of Computation) is on the SoC primary list but has no
  NUSMods offering in any year (404), so it can't be placed in a prerequisite
  tree and is omitted rather than drawn disconnected.
- **CS3212** (a retired alternative prerequisite of CS4212) is dropped.
- Every module code links out to its NUSMods page.

To refresh membership, re-check the SoC focus list; to refresh prerequisites for
a future academic year, re-fetch prerequisite trees from the NUSMods API. Either
way only `js/data.js` changes — no other file needs to.
