import type { SlideElement } from '../types';

/**
 * Collapses consecutive `progress` elements into sub-arrays so that bsp/grid
 * renderers can place them all in a single pane/cell.
 *
 * Shared by the live preview (SlideRenderer) and the PPTX exporter so both
 * partition a slide's elements identically — see autoSplitElements below for
 * why that matters.
 */
export function groupProgressRuns(elements: SlideElement[]): SlideElement[][] {
  const groups: SlideElement[][] = [];
  for (const el of elements) {
    const last = groups[groups.length - 1];
    if (el.type === 'progress' && last && last[0]?.type === 'progress') {
      last.push(el);
    } else {
      groups.push([el]);
    }
  }
  return groups;
}

/**
 * Splits a slide's elements into two columns for two-column/bsp layouts.
 *
 * Shared by the live preview (SlideRenderer) and the PPTX exporter. Keeping
 * a single implementation matters here: a slide is edited against the live
 * preview, so if the exporter split elements differently the exported deck
 * would visibly diverge from what the user saw on screen.
 */
export function autoSplitElements(elements: SlideElement[]): [SlideElement[], SlideElement[]] {
  // Single list: split by cumulative text length for visual balance
  if (elements.length === 1 && elements[0].type === 'list') {
    const list = elements[0];
    const items = list.items;
    const totalLen = items.reduce((n, it) => n + it.text.length, 0);
    let cumLen = 0;
    let mid = Math.ceil(items.length / 2); // fallback for empty/equal items
    for (let i = 0; i < items.length; i++) {
      cumLen += items[i].text.length;
      if (cumLen >= totalLen / 2) { mid = i + 1; break; }
    }
    return [
      [{ ...list, items: items.slice(0, mid) }],
      [{ ...list, items: items.slice(mid) }],
    ];
  }
  // Single toc: split entries by cumulative title length for visual balance
  if (elements.length === 1 && elements[0].type === 'toc') {
    const toc = elements[0];
    const entries = toc.entries;
    const totalLen = entries.reduce((n, en) => n + en.title.length, 0);
    let cumLen = 0;
    let mid = Math.ceil(entries.length / 2); // fallback for empty/equal entries
    for (let i = 0; i < entries.length; i++) {
      cumLen += entries[i].title.length;
      if (cumLen >= totalLen / 2) { mid = i + 1; break; }
    }
    return [
      [{ ...toc, entries: entries.slice(0, mid) }],
      [{ ...toc, entries: entries.slice(mid), numberStart: mid }],
    ];
  }
  // Multiple elements: split at midpoint
  const mid = Math.ceil(elements.length / 2);
  return [elements.slice(0, mid), elements.slice(mid)];
}
