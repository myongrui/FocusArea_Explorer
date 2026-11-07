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

#### <https://myongrui.github.io/FocusArea_Explorer/>

## Why this exists

Planning a CS focus area at NUS means juggling two things that never sit on the same page:

- The **[SoC focus-area list](https://www.comp.nus.edu.sg/programmes/ug/focus/)** tells you *which* modules count toward each area — but it's just flat text lists. It doesn't show you what you need to take *first*.
- **[NUSMods](https://nusmods.com)** has the prerequisites — but only one module at a time. You can see the tree for `CS4231`, then the tree for `CS3230`, then try to hold both in your head.

So the questions that actually matter when you're choosing an area are hard to answer:

- *If I want this focus area, what's the full chain of modules I have to clear to get there?*
- *I'm interested in two areas — do they overlap? Would one module count toward both?*
- *Where does a course I've already taken lead?*

This tool answers all three visually. Pick the areas you care about, and it draws the **whole dependency tree** at once — foundations on the left flowing right into each area's advanced modules — and it highlights the courses that do double duty across areas.

## How this was made
Entirely vibe coded but its delivered entirely in one static page which is neat for github pages. (yay free domain)
