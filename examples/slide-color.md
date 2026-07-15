---
title: Per-slide text colour
author: Kova
---

# Per-slide text colour

Photo backgrounds often need light text (or the reverse). Deck-wide Inspector colours change *every* slide — use a per-slide override when only some slides need it.

Kova and Marp forms map to the same field. Preview and PPTX export both honour the override.

---

## Hex colour over a background

```markdown
![bg](https://picsum.photos/seed/kova-color-hex/1280/720)
<!-- color: #ffffff -->

## Light text on a dark photo

`<!-- color: #ffffff -->` is the Kova form.
```

---

![bg](https://picsum.photos/seed/kova-color-hex/1280/720)
<!-- color: #ffffff -->

## Light text on a dark photo

`<!-- color: #ffffff -->` is the Kova form. Only this slide uses white body/heading text.

---

## Marp named colour (`_color`)

```markdown
![bg](https://picsum.photos/seed/kova-color-named/1280/720)
<!-- _color: white -->

## Named colour

Marp decks use `<!-- _color: white -->`.
```

---

![bg](https://picsum.photos/seed/kova-color-named/1280/720)
<!-- _color: white -->

## Named colour

Marp decks use `<!-- _color: white -->`. Any standard CSS colour name works (`red`, `rebeccapurple`, `darkmagenta`, …).

---

## Invert class

```markdown
![bg](https://picsum.photos/seed/kova-color-invert/1280/720)
<!-- _class: invert -->

## Invert

`<!-- _class: invert -->` swaps to the theme's light “text on dark” colour.
```

---

![bg](https://picsum.photos/seed/kova-color-invert/1280/720)
<!-- _class: invert -->

## Invert

`<!-- _class: invert -->` swaps to the theme's light “text on dark” colour for this slide when you didn't set an explicit `color` / `_color`.

---

## Functional notation (`hsl`)

```markdown
![bg](https://picsum.photos/seed/kova-color-hsl/1280/720)
<!-- color: hsl(0, 0%, 100%) -->

## hsl() works too

Functional CSS colours (`hsl()`, `rgb()`, …) are valid.
```

---

![bg](https://picsum.photos/seed/kova-color-hsl/1280/720)
<!-- color: hsl(0, 0%, 100%) -->

## hsl() works too

Functional CSS colours (`hsl()`, `rgb()`, …) are valid. Export normalises them to hex for PowerPoint.

---

## When *not* to use per-slide colour

If **most** of the deck needs the same text colour, change **Text** / **Title text** in the Inspector (deck-wide `theme_overrides`) instead. Per-slide directives are for exceptions — usually a handful of `![bg]` photo slides.

Split backgrounds (`![bg left]` / `![bg right]`) often don't need a colour override: body text sits on the normal theme background, not on the photo.

---

## What just happened

| Syntax | Result |
|--------|--------|
| `<!-- color: #ffffff -->` | Per-slide text colour (Kova) |
| `<!-- _color: white -->` | Same field (Marp) |
| `<!-- _class: invert -->` | Theme light-on-dark text when no explicit colour |
| `<!-- color: hsl(0, 0%, 100%) -->` | Functional CSS → hex in PPTX |

Applies to slide **content** (headings, body, lists, …). Header/footer chrome stays on the deck theme.
