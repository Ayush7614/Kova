/**
 * Validates a per-slide colour directive value (`<!-- color: … -->` /
 * `<!-- _color: … -->`). Accepts hex (#rgb/#rrggbb/#rrggbbaa), functional
 * notations (rgb()/hsl()/color()/…), and single-word named colours (white,
 * black, rebeccapurple, …). The value can't be used to inject extra CSS
 * declarations when later placed into a `style` attribute: hex and named
 * colours may contain only their own characters, and functional notations are
 * matched in full (opening prefix through closing paren) and rejected if they
 * contain quotes or CSS metacharacters (`;`, `{`, `}`). Spaces inside the
 * parentheses are permitted (e.g. `rgb(0, 0, 0)`).
 */
export function parseColorValue(raw: string): string | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v;
  if (/^(?:rgb|rgba|hsl|hsla|color|hwb|lab|lch|oklab|oklch)\([^;{}'"]*\)$/i.test(v)) return v;
  if (/^[a-zA-Z]+$/.test(v)) return v.toLowerCase();
  return undefined;
}

/** Matches `<!-- color: … -->` / `<!-- _color: … -->` (same as the parser). */
export const COLOR_COMMENT_RE = /<!--\s*(?:_?color)\s*:\s*([^\s-][^\n]*?)\s*-->/i;
