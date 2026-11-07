# Focus Area Explorer

An interactive prerequisite-tree explorer for **NUS Computer Science** focus areas.
Drag any of the 11 focus areas onto the canvas and the tree rebuilds itself —
foundations on the left, then the prerequisite chain flowing right into each
area's primary modules. Add several areas at once to see where they **share**
modules.

**CS pathway only** is on by default: it keeps CS prerequisites and foundation
maths/stats, hiding other departments' routes and the CS1010/CS2113 alternatives.
Turn it off in the canvas toolbar to explore the full prerequisite graph. This
is a display filter, not a substitute for checking official prerequisites.

Focus-area membership (which modules are *primary* in each area) follows the
official [NUS SoC focus list](https://www.comp.nus.edu.sg/programmes/ug/focus/).
Prerequisites and titles come from the [NUSMods](https://nusmods.com) API v2,
academic year **2026–2027** (current-year only, no multi-year fallback).

## Planner

The planner below the graph runs left to right, with Y1, Y2, and so on. Each
year has Semester 1 with an outlined **Winter** slot beneath it, and Semester 2
with an outlined **Summer** slot beneath it. The large outlined **+ Year** panel
adds another year; the **×** on a year header removes one and moves its modules
to **Unplanned**. Pin multiple graph modules to see their combined chains; each
pin also adds its module to **Unplanned**. Unpinning never deletes planned work.
Drag cards to assign modules to any slot or **Cleared**.

Search by code or title. Results open as draggable cards in a dropdown. Matching
variants are grouped into one card (for example the CS1010 family); use
**←/→** to choose the exact variant, **↑/↓** to move between cards, and Enter
to add. **Add foundations** places all foundation modules in the earliest valid
Semester 1/2 slots, capped at 20 units per semester. Foundation modules waiting
in **Unplanned** get a teal highlight.

Clicking a semester title cycles its status: neutral **Not done**, amber
**Doing**, green **Done**. The same colors highlight those modules in the graph.
The planner targets the standard **160 units**. Accredited modules from previous
study are not assumed: search for them—**CP3200** is included as a searchable
example—and drag them to **Cleared**. They then count toward the progress bar and
pillar totals like any other completed module.\n\nThe progress bar fills only with **Cleared** units. The pillar strip tracks the\nofficial targets: **CS Foundation 36**, **Breadth & Depth 32**, **Maths &\nSciences 12**, **Common Curriculum 40**, and **Unrestricted Electives 40**. It\nlists the planned module codes counted toward each pillar and excludes\nUnplanned modules.\n\nPlans and fetched module details are saved locally. Prerequisite checks use raw
NUSMods AND/OR/n-of rules and exact module codes, not the graph's collapsed
alternatives. Only completed or strictly earlier-semester modules satisfy them.
Checks assume passes; higher-grade, cohort, and unsupported eligibility rules
require review. Offerings are advisory, using AY2026–27 data.

Unit totals exclude Unplanned. This is **not a complete graduation audit**:
cohort requirements, focus-area rules, general education, preclusions, and
double-counting still need verification.

The download icon exports native planner JSON. In
[NUSMods Planner](https://nusmods.com/planner), choose **Upload** to import it.
Winter and Summer map to NUSMods Special Terms; Cleared maps to Exemptions,
and Unplanned maps to Plan to Take. The upload icon accepts this export format
and native NUSMods planner downloads. Imports are validated and require
confirmation before replacing an existing plan. Duplicates, unresolved
placeholders, and unsupported semesters are rejected without replacing your
plan. Imported custom units are preserved; missing prerequisite data is flagged
for review.

Per-semester timetable links transfer module selections, not lesson slots or
future academic-year offerings. Review any existing NUSMods plan before import.

Run the dependency/export tests with `node --test tools/test-planner.js`.

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
