import { describe, it, expect } from 'vitest';
import { autoSplitElements, groupProgressRuns } from '../elementGrouping';
import type { SlideElement, ListItem } from '../../types';

const item = (text: string): ListItem => ({ text, html: `<p>${text}</p>`, children: [] });

const paragraph = (text: string): SlideElement => ({ type: 'paragraph', text, html: `<p>${text}</p>` });
const progress = (label: string, value: number): SlideElement => ({ type: 'progress', label, value });
const image: SlideElement = { type: 'image', src: 'a.png', alt: 'a' };

describe('groupProgressRuns', () => {
  it('collapses consecutive progress elements into one group', () => {
    const groups = groupProgressRuns([progress('a', 1), progress('b', 2), progress('c', 3)]);
    expect(groups).toEqual([[progress('a', 1), progress('b', 2), progress('c', 3)]]);
  });

  it('keeps non-progress elements in their own groups', () => {
    const groups = groupProgressRuns([paragraph('x'), image]);
    expect(groups).toEqual([[paragraph('x')], [image]]);
  });

  it('starts a new group when a progress run is broken by another element', () => {
    const groups = groupProgressRuns([progress('a', 1), paragraph('mid'), progress('b', 2)]);
    expect(groups).toEqual([[progress('a', 1)], [paragraph('mid')], [progress('b', 2)]]);
  });
});

describe('autoSplitElements — multi-element branch', () => {
  it('splits at the element-count midpoint', () => {
    const els = [paragraph('a'), paragraph('b'), image, paragraph('c')];
    const [left, right] = autoSplitElements(els);
    expect(left).toEqual([paragraph('a'), paragraph('b')]);
    expect(right).toEqual([image, paragraph('c')]);
  });
});

describe('autoSplitElements — single list branch', () => {
  it('balances by cumulative item text length, not item count', () => {
    // One long item followed by four short ones: a naive count-based midpoint
    // split (Math.ceil(5/2) = 3) would put the long item alone with one short
    // item on the left — length-based balancing should instead isolate the
    // long item by itself, since it already exceeds half the total length.
    const long = item('x'.repeat(100));
    const shorts = [item('a'), item('b'), item('c'), item('d')];
    const list: SlideElement = { type: 'list', ordered: false, items: [long, ...shorts] };

    const [left, right] = autoSplitElements([list]);

    expect(left).toEqual([{ type: 'list', ordered: false, items: [long] }]);
    expect(right).toEqual([{ type: 'list', ordered: false, items: shorts }]);
  });

  it('falls back to a count-based midpoint when items are equal length', () => {
    const items = [item('aa'), item('bb'), item('cc'), item('dd')];
    const list: SlideElement = { type: 'list', ordered: true, items };

    const [left, right] = autoSplitElements([list]);

    expect(left).toEqual([{ type: 'list', ordered: true, items: items.slice(0, 2) }]);
    expect(right).toEqual([{ type: 'list', ordered: true, items: items.slice(2) }]);
  });
});

describe('autoSplitElements — single toc branch', () => {
  it('balances by cumulative title length and carries numberStart into the second half', () => {
    const entries = [
      { title: 'x'.repeat(100), index: 0 },
      { title: 'a', index: 1 },
      { title: 'b', index: 2 },
      { title: 'c', index: 3 },
    ];
    const toc: SlideElement = { type: 'toc', entries };

    const [left, right] = autoSplitElements([toc]);

    expect(left).toEqual([{ type: 'toc', entries: [entries[0]] }]);
    expect(right).toEqual([{ type: 'toc', entries: entries.slice(1), numberStart: 1 }]);
  });
});
