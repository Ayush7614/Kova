import { SheetError } from './lexer';
import { parseExpr } from './parser';
import { evaluate, type Value } from './evaluate';

const LET_RE = /^!let\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/;

// Document-scoped constants: declared on any slide, visible on every slide.
// A constant is an input, so its expression may only use earlier constants,
// never table data. A broken !let defines nothing rather than throwing — the
// directive line has no rendered cell to show an error in, and the cells that
// reference the missing constant report it instead.
//
// Takes already-split per-slide raw text (not the whole document body) and
// resets fence tracking at each slide boundary — a fence should never
// legitimately span slides, and without the reset, one unbalanced fence on
// an earlier slide would silently disable !let recognition on every slide
// after it.
export function collectConstants(rawSlides: string[]): Map<string, Value> {
  const out = new Map<string, Value>();

  for (const slide of rawSlides) {
    let inFencedCode = false;

    for (const line of slide.split('\n')) {
      const t = line.trim();

      if (/^(`{3,}|~{3,})/.test(t)) {
        inFencedCode = !inFencedCode;
        continue;
      }
      if (inFencedCode) continue;

      const m = t.match(LET_RE);
      if (!m) continue;

      try {
        // Remove any existing binding for this name before evaluating.
        // A successful eval re-adds it (last-wins); a failed one leaves it undefined.
        out.delete(m[1]);
        const v = evaluate(parseExpr(m[2]), (name) => {
          if (out.has(name)) return out.get(name)!;
          throw new SheetError(`unknown constant '${name}'`);
        });
        if (!Array.isArray(v)) out.set(m[1], v);
      } catch {
        // leave it undefined
      }
    }
  }

  return out;
}
