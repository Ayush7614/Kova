import { describe, it, expect } from 'vitest';

import { findNextRange } from '../EditorPanel';

describe('findNextRange', () => {
  it('wraps around when searching forward past the last match', () => {
    const doc = 'hello world\nhello again\n';
    // start after the last "hello"
    const start = doc.length;
    const r = findNextRange(doc, 'hello', start, 1);
    expect(r).toEqual({ from: 0, to: 5 });
  });

  it('wraps around when searching backward before the first match', () => {
    const doc = 'hello world\nhello again\n';
    const r = findNextRange(doc, 'hello', 0, -1);
    // should wrap to the last "hello"
    expect(r).toEqual({ from: 12, to: 17 });
  });

  it('returns null for empty query', () => {
    expect(findNextRange('abc', '   ', 0, 1)).toBeNull();
  });
});

