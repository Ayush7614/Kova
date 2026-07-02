import type { Slide } from './types';

/** Collect unique `!ref[…]` citations across the deck, preserving first-seen order. */
export function collectDeckReferences(slides: Slide[]): string[] {
  const seen = new Set<string>();
  const refs: string[] = [];
  for (const slide of slides) {
    for (const ref of slide.references) {
      const key = ref.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      refs.push(ref);
    }
  }
  return refs;
}

/** Markdown for a bibliography slide appended to the deck. */
export function buildBibliographySlideMarkdown(refs: string[]): string {
  const lines = refs.map((r) => `- ${r.trim()}`);
  return `## References\n\n${lines.join('\n')}`;
}
