import type { SlideElement } from '../types';
import { estimateItemLines, estimateTocEntryLines, estimateElementLines } from './autoLayout';

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
 * Finds the index at which `items` should be cut so the cumulative weight
 * on each side is as close to balanced as possible. Falls back to a plain
 * count-based midpoint when weights are empty/equal.
 */
function balancedSplitIndex<T>(items: T[], weightOf: (item: T) => number): number {
  const totalWeight = items.reduce((n, it) => n + weightOf(it), 0);
  let cumWeight = 0;
  let mid = Math.ceil(items.length / 2); // fallback for empty/equal items
  for (let i = 0; i < items.length; i++) {
    cumWeight += weightOf(items[i]);
    if (cumWeight >= totalWeight / 2) { mid = i + 1; break; }
  }
  return mid;
}

/**
 * Splits a slide's elements into two columns for two-column/bsp layouts.
 *
 * Shared by the live preview (SlideRenderer) and the PPTX exporter. Keeping
 * a single implementation matters here: a slide is edited against the live
 * preview, so if the exporter split elements differently the exported deck
 * would visibly diverge from what the user saw on screen.
 *
 * Balancing is done by estimated wrapped-line count (the same weight
 * autoLayout.ts uses to decide whether to split at all) rather than raw
 * character count — raw length badly misjudges columns once the renderer
 * shrinks the font to fit, since it has no notion of how many characters
 * actually fit per rendered line (see issue #145).
 */
export function autoSplitElements(elements: SlideElement[]): [SlideElement[], SlideElement[]] {
  // Single list: split by cumulative estimated line count for visual balance
  if (elements.length === 1 && elements[0].type === 'list') {
    const list = elements[0];
    const items = list.items;
    const mid = balancedSplitIndex(items, estimateItemLines);
    return [
      [{ ...list, items: items.slice(0, mid) }],
      [{ ...list, items: items.slice(mid) }],
    ];
  }
  // Single toc: split entries by cumulative estimated line count for visual balance
  if (elements.length === 1 && elements[0].type === 'toc') {
    const toc = elements[0];
    const entries = toc.entries;
    const mid = balancedSplitIndex(entries, (entry) => estimateTocEntryLines(entry.title));
    return [
      [{ ...toc, entries: entries.slice(0, mid) }],
      [{ ...toc, entries: entries.slice(mid), numberStart: mid }],
    ];
  }
  // Multiple elements: split by cumulative estimated line count for visual balance
  const mid = balancedSplitIndex(elements, estimateElementLines);
  return [elements.slice(0, mid), elements.slice(mid)];
}
