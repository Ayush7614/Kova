---
title: Slide backgrounds
author: Kova
---

# Slide backgrounds

Marp-style `![bg]` lines set a slide's background image. The line is stripped from the visible body — it never shows up as an ordinary image caption or bullet.

Use an `https://` URL (as below) or a path relative to a **saved** deck. Unsaved decks can't resolve local image paths the same way the thumbnail “Set slide background…” picker does.

---

## Full-bleed (image only)

A slide whose *only* content is a `![bg]` line becomes a full-bleed image (next slide):

```markdown
![bg](https://picsum.photos/seed/kova-bg-full/1280/720)
```

---

![bg](https://picsum.photos/seed/kova-bg-full/1280/720)

---

## Text over a full-slide background

```markdown
![bg](https://picsum.photos/seed/kova-bg-overlay/1280/720)

## Title on the photo

Body text renders on top of the background.
```

Prefer a dark or light photo that keeps contrast readable — or pair with a per-slide colour override (see `examples/slide-color.md`). Next slide is the live version.

---

![bg](https://picsum.photos/seed/kova-bg-overlay/1280/720)

## Title on the photo

Body text renders on top of the background.

---

## Split: image on the left

```markdown
![bg left](https://picsum.photos/seed/kova-bg-left/600/800)

## Split layout

- Image fills the left column
- Content stays on the theme background
```

---

![bg left](https://picsum.photos/seed/kova-bg-left/600/800)

## Split layout

- Image fills the left column
- Content stays on the theme background

---

## Split: image on the right

```markdown
![bg right](https://picsum.photos/seed/kova-bg-right/600/800)

## Image on the right

- Same idea, mirrored
- Useful for portraits and product shots
```

---

![bg right](https://picsum.photos/seed/kova-bg-right/600/800)

## Image on the right

- Same idea, mirrored
- Useful for portraits and product shots

---

## Contain / fit sizing

Default sizing is **cover** (crop to fill). Add `contain` or Marp's `fit` alias to letterbox instead:

```markdown
![bg contain](https://picsum.photos/seed/kova-bg-contain/800/1200)

## Contain sizing

The whole image stays visible; empty bands use the slide background colour.
```

---

![bg contain](https://picsum.photos/seed/kova-bg-contain/800/1200)

## Contain sizing

The whole image stays visible; empty bands use the slide background colour.

---

## What just happened

| Syntax | Result |
|--------|--------|
| `![bg](…)` alone | Full-bleed layout |
| `![bg](…)` + title/body | Full-slide background; text on top |
| `![bg left](…)` / `![bg right](…)` | Split layout |
| `![bg contain](…)` or `![bg fit](…)` | `contain` sizing instead of `cover` |

The `![bg…]` line is removed from the body text during parse (same as Marp import).

**GUI:** right-click a slide thumbnail → **Set slide background…** / **Clear background**. That writes the equivalent `![bg](…)` line into the Markdown for you (requires a saved document when picking a local file).
