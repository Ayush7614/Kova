---
title: Figure captions
author: Kova
---

# Figure captions

Images, Mermaid diagrams, and math blocks can now carry a caption underneath them — `Figure 1: …`, `Equation 2: …`, whatever an academic or technical deck needs.

Annotate the element with `!caption[text]` right below it. The caption is merged into that element, so it can never get shoved into a side column the way ordinary body text would.

---

## Under a formula

```markdown
$$
E = mc^2
$$
!caption[Equation 1: mass-energy equivalence]
```

$$
E = mc^2
$$
!caption[Equation 1: mass-energy equivalence]

---

## Under a Mermaid diagram

A fenced `mermaid` block, followed on its own line by `!caption[...]`:

```mermaid
graph LR
    A --> B --> C
```
!caption[Figure 1: a three-step pipeline]

---

## Misplaced captions are an error, not a silent no-op

Just some text.
!caption[orphaned]

A `!caption` only ever attaches to the image, diagram, or formula directly above it — anywhere else, it reports the mistake instead of vanishing.

---

## What just happened

- Attaches to whichever image, Mermaid diagram, or math block it **directly** follows.
- Merged into that element by the parser — never becomes body text, so it can't trigger a split/two-column layout.
- Renders centered underneath, in every layout that can hold one (a bottom overlay bar for full-bleed images).
- Survives PPTX export too.
- Wrong placement → a clear `#ERR`, never a caption that quietly disappears.
