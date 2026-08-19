# Features — later

Ideas parked deliberately. Not committed to, not scheduled, not in
`FEATURES.md` — that file is only ever a record of what exists. This one is the
opposite: things worth doing that nobody has decided on yet.

Each entry says what the idea is, what it would touch, and what would have to
be answered before anyone builds it. The open questions are the point. An idea
recorded without them turns into a ticket that gets built literally.

---

## Discover, split by kind

**The idea.** Stop showing one undifferentiated grid. Give Discover three
labelled sections, each a horizontal scroll:

```
Sessions
  [ card ] [ card ] [ card ] →

Retreats
  [ card ] [ card ] [ card ] →

Events
  [ card ] [ card ] [ card ] →
```

**Why it is worth doing.** Right now a £30 evening breathwork circle, a
£65 day retreat and a £150 three-night stay sit in the same two-column grid,
distinguished only by their price line. They are different purchases — different
money, different commitment, different amount of planning — and the page asks
the seeker to sort that out for themselves. Sectioning does the sorting for
them, and it gives each kind a headline instead of one kind dominating whichever
happens to be soonest.

### What it touches

- **Discover** (`app/(tabs)/index.tsx`) is currently a segmented control
  (Events / Practitioners), a horizontal row of category chips, a filters
  button, and a two-up vertical grid with infinite scroll. Sections replace the
  grid, and the segmented control and chips both need rethinking around them —
  three stacked filters above three stacked sections is a lot of chrome.
- **`EventCard`** already has a `compact` mode for the two-up grid. A horizontal
  rail wants a third size, probably wider than tall.
- **Paging.** Infinite vertical scroll does not survive this. Each rail needs a
  bounded fetch and a "See all" that opens a full list — which is a screen that
  does not exist yet.

### The question nobody has answered

**These three words do not map cleanly onto three things in the database.**

| Row | What it probably means | What it actually is |
|---|---|---|
| Sessions | one-to-one, book a practitioner | `services` — a different table |
| Events | one-to-many, buy a ticket | `events` |
| Retreats | multi-day | also `events`, filtered by a `*-retreats` category |

So the three rails are not three of a kind: one reads a different table, and two
read the same one with Retreats being a *subset* of Events. Left alone that
produces the obvious bug — a retreat appearing in both its own row and the
Events row — and the fix is a product decision, not a technical one:

1. Is **Sessions** the right word for one-to-one services? It is what the
   practitioner side calls them, but a seeker might reasonably read "session"
   as any single occasion, including an evening circle.
2. Does **Events** mean "everything ticketed" or "everything ticketed that is
   not a retreat"? The first is honest and duplicates; the second is clean and
   makes Events quietly mean "other".
3. What happens when a rail is **empty**? A section header over nothing is worse
   than no section. Hide it, or show an invitation?

### Worth knowing before designing it

Horizontal rails trade breadth for depth: more categories visible at once,
fewer items seen within each, and everything past the right edge is effectively
invisible. That is the right trade when the sections are genuinely different
kinds of thing — which is exactly the argument for doing this — but it means the
first two or three cards in each rail carry almost all of the traffic. Ordering
inside a rail becomes a much bigger decision than ordering in a grid.

