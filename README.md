# CS Focus Area Explorer

**An interactive map of how NUS Computer Science focus areas fit together — the modules that satisfy each area, the prerequisites you need to get there, and where different areas quietly share the same courses.**

### ▶ [Try it live: myongrui.github.io/FocusArea_Explorer](https://myongrui.github.io/FocusArea_Explorer/)

No install, no sign-up — it runs entirely in your browser.

---

## Why this exists

Planning a CS focus area at NUS means juggling two things that never sit on the same page:

- The **[SoC focus-area list](https://www.comp.nus.edu.sg/programmes/ug/focus/)** tells you *which* modules count toward each area — but it's just flat text lists. It doesn't show you what you need to take *first*.
- **[NUSMods](https://nusmods.com)** has the prerequisites — but only one module at a time. You can see the tree for `CS4231`, then the tree for `CS3230`, then try to hold both in your head.

So the questions that actually matter when you're choosing an area are hard to answer:

- *If I want this focus area, what's the full chain of modules I have to clear to get there?*
- *I'm interested in two areas — do they overlap? Would one module count toward both?*
- *Where does a course I've already taken lead?*

This tool answers all three visually. Pick the areas you care about, and it draws the **whole dependency tree** at once — foundations on the left flowing right into each area's advanced modules — and it highlights the courses that do double duty across areas.

---

## What you can do

**🎯 Build a tree by dragging focus areas in.** Drag any of the 11 focus areas from the palette onto the canvas (or just click it). The tree instantly rebuilds and re-lays-itself-out, animating into place. Add several areas to compare them side by side.

**🔗 Spot shared modules.** When two or more active areas both count a module as a primary, it gets a **gradient bar and an "N AREAS" tag** — that's a course that would satisfy multiple areas at once. For example, `CS4231` (Parallel & Distributed Algorithms) is shared by Algorithms, Networking, *and* Parallel Computing.

**🧭 Watch modules change role with your selection.** A course shown in grey as `SUPPORT` is only there because it's on the path to something else. Activate *its* area and it turns into a coloured `PRIMARY`. Drop **Parallel Computing** and watch `CS3210` shift from grey to coloured.

**🖱️ Trace a full chain.** Hover (or tap) any module to light up its **entire prerequisite chain** — everything upstream you'd need first, and everything downstream it unlocks — while the rest dims.

**🗂️ Organise areas into your own categories.** The palette starts as a flat list. Hit **+ Category**, name it whatever you like (e.g. "My shortlist", "Maybe later"), and drag focus areas into it. Your categories are saved in your browser, so they're still there next time.

**🔍 Fit the whole thing on screen.** Big selections make big trees. Click **Fit** to scale the entire tree into the pane at once for the overview; click **100%** to go back to full size and scroll around to read.

**📖 Jump to the source.** Every module code is a link straight to its NUSMods page.

**🌗 Light & dark mode**, following your system theme.

### Reading the tree

| You see | It means |
|---|---|
| **Grey square badge** — `CORE` | A foundation module, common to everything |
| **Grey dashed** — `SUPPORT` | On the path to an active area, but its own area isn't selected |
| **Coloured** — `PRIMARY` | A primary module of one selected area (colour = which area) |
| **Gradient bar** — `N AREAS` | A primary of several selected areas at once |
| **Solid line** | A required prerequisite |
| **Dashed line** | One of several acceptable prerequisite options |
| Left → right | Earlier modules → later modules (foundations to advanced) |

---

## Where the data comes from

- **Which modules belong to each focus area** follows the official **[NUS SoC focus-area list](https://www.comp.nus.edu.sg/programmes/ug/focus/)**.
- **Prerequisites and module titles** come from the **[NUSMods API](https://nusmods.com)** for academic year **2026–2027** (current year only — no fallback to older years, which can carry stale data for newly-released modules).

A couple of honest caveats:

- **`CS4232`** (Theory of Computation) is on the SoC list but has no NUSMods offering in any year, so it can't be placed in a prerequisite tree and is left out rather than drawn floating.
- **`CS3212`** (a retired alternative prerequisite of `CS4212`) is dropped.
- This is a **planning aid, not an official source** — always confirm requirements against NUSMods and your degree audit before you commit.

> **Colour note:** eleven area colours can't all be perfectly colour-blind-distinguishable at once (a known limit past ~8 categories). Identity is always also carried by the **course code printed on every node** and the labelled chips in the palette — colour is a reinforcement, never the only signal.

---

## Run it locally

It's plain HTML/CSS/JS — no build step, no dependencies.

- **Quickest:** download the repo and double-click `index.html`. It opens in your browser and works fully offline.
- **Or serve the folder** (avoids any `file://` quirks):
  ```sh
  python -m http.server 8000
  # then open http://localhost:8000
  ```

---

## For contributors

```
FocusArea_Explorer/
├── index.html        # markup + script/style includes
├── css/styles.css    # all styling; light/dark via CSS custom properties
└── js/
    ├── data.js       # AREAS / NODES / EDGES — the graph data
    └── app.js        # UI: layout, drag-drop, categories, animation, highlight
```

The graph data (`data.js`) is deliberately separate from the rendering logic (`app.js`):

- To **update focus-area membership**, re-check the SoC focus list and edit `AREAS`.
- To **refresh prerequisites for a new academic year**, re-fetch from the NUSMods API and regenerate the `NODES` / `EDGES` arrays.

Either way, only `js/data.js` changes — nothing else needs to.

**How the rendering works, briefly:** activating an area reveals its primaries plus the *transitive prerequisite closure* of those primaries (so foundations and support modules appear automatically). Layout is longest-path tiering on the x-axis and barycenter crossing-reduction on the y-axis, recomputed on every change; nodes glide via a `requestAnimationFrame` loop and the inline-SVG edges follow each frame. No framework — DOM nodes and hand-drawn bezier edges.

## License

[MIT](LICENSE)
