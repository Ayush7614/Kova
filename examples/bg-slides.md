---
title: Slide backgrounds
author: Kova
---

# Slide backgrounds

In Kova, a plain `![](photo.jpg)` on an image-only slide is already full-bleed; an image beside text is already a split layout. **`![bg]` is for the case those don't cover: text rendered on top of a full-slide photo.**

The `![bg…]` line is stripped from the visible body during parse (Marp-compatible). Use an `https://` URL below, or a path relative to a **saved** deck — the thumbnail **Set slide background…** picker also writes this line for you (local files need a saved document).

For readable text on dark photos, pair with a per-slide colour override — see [`examples/slide-color.md`](examples/slide-color.md).

---

## Text over a full-slide background

```markdown
![bg](https://picsum.photos/seed/kova-bg-overlay/1280/720)

## Title on the photo

Body text renders on top of the background image, not beside it.
```

Next slide is the live version.

---

![bg](https://picsum.photos/seed/kova-bg-overlay/1280/720)

## Title on the photo

Body text renders on top of the background image, not beside it.

---

## When to use `![](…)` instead

| Goal | Kova-native approach |
|------|----------------------|
| Full-bleed image only | `![](photo.jpg)` on a slide with no other content |
| Image left / right + text | `![](photo.jpg)` plus title or bullets on the same slide |
| Text **on top of** the photo | `![bg](photo.jpg)` + title/body (this file) |

Marp's `![bg left]` / `![bg right]` import cleanly, but in Kova they duplicate what a regular inline image already does.

---

## Contain / fit sizing

Default background sizing is **cover** (crop to fill). For letterboxing, add `contain` or Marp's `fit` alias — only applies to `![bg]`, not inline images:

```markdown
![bg contain](https://picsum.photos/seed/kova-bg-contain/800/1200)

## Letterboxed background

Empty bands use the slide background colour.
```

---

![bg contain](https://picsum.photos/seed/kova-bg-contain/800/1200)

## Letterboxed background

Empty bands use the slide background colour.

---

## What just happened

- `![bg](…)` + title/body → full-slide **background**; text draws on top.
- `![bg contain](…)` / `![bg fit](…)` → `contain` sizing instead of `cover`.
- The `![bg…]` line never appears as body text (same as Marp import).
- **GUI:** right-click a slide thumbnail → **Set slide background…** / **Clear background**.
