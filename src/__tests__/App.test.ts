// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { editSlideSegments } from '../App';

function doc(fm: string, slides: string[]): string {
  return `---\n${fm}\n---\n` + slides.join('\n---\n');
}

describe('editSlideSegments', () => {
  it('returns prev unchanged when edit signals a no-op (out-of-range index)', () => {
    const prev = doc('title: X', ['A', 'B']);
    const result = editSlideSegments(prev, () => null, 'trim');
    expect(result).toBe(prev);
  });

  it('preserves the frontmatter block untouched', () => {
    const prev = doc('title: X\nauthor: Y', ['A', 'B']);
    const result = editSlideSegments(prev, (segments) => segments, 'trim');
    expect(result.startsWith('---\ntitle: X\nauthor: Y\n---\n')).toBe(true);
  });

  it('handles a document with no frontmatter block', () => {
    const prev = 'A\n---\nB';
    const result = editSlideSegments(prev, (segments) => segments, 'trim');
    expect(result).toContain('A');
    expect(result).toContain('B');
  });

  describe('rejoin: trim (reorder/duplicate/new/delete)', () => {
    it('reorders segments (mirrors handleSlideReorder)', () => {
      const prev = doc('title: X', ['A', 'B', 'C']);
      const result = editSlideSegments(prev, (segments) => {
        const reordered = [...segments];
        const [moved] = reordered.splice(0, 1);
        reordered.splice(2, 0, moved);
        return reordered;
      }, 'trim');
      const body = result.split('---\n').slice(2).join('---\n');
      expect(body.split(/\n\n---\n\n/).map((s) => s.trim())).toEqual(['B', 'C', 'A']);
    });

    it('duplicates a segment (mirrors handleDuplicateSlide)', () => {
      const prev = doc('title: X', ['A', 'B']);
      const result = editSlideSegments(prev, (segments) => {
        const next = [...segments];
        next.splice(1, 0, segments[0]);
        return next;
      }, 'trim');
      expect(result).toContain('A\n\n---\n\nA\n\n---\n\nB');
    });

    it('inserts an empty segment (mirrors handleNewSlide)', () => {
      const prev = doc('title: X', ['A', 'B']);
      const result = editSlideSegments(prev, (segments) => {
        const next = [...segments];
        next.splice(1, 0, '');
        return next;
      }, 'trim');
      expect(result).toContain('A\n\n---\n\n\n\n---\n\nB');
    });

    it('deletes a segment (mirrors handleDeleteSlide)', () => {
      const prev = doc('title: X', ['A', 'B', 'C']);
      const result = editSlideSegments(prev, (segments) => {
        if (segments.length <= 1) return null;
        const next = [...segments];
        next.splice(1, 1);
        return next;
      }, 'trim');
      const body = result.split('---\n').slice(2).join('---\n');
      expect(body.split(/\n\n---\n\n/).map((s) => s.trim())).toEqual(['A', 'C']);
    });

    it('refuses to delete the only remaining slide', () => {
      const prev = doc('title: X', ['A']);
      const result = editSlideSegments(prev, (segments) => {
        if (segments.length <= 1) return null;
        return segments.slice(1);
      }, 'trim');
      expect(result).toBe(prev);
    });

    it('does not split on a --- line inside a fenced code block (fence-aware, unlike the old body.split(/^---$/m))', () => {
      const prev = doc('title: X', ['A\n\n```\nline one\n---\nline two\n```', 'B']);
      const result = editSlideSegments(prev, (segments) => {
        // If the fence had been mis-split, this would see 3 segments, not 2,
        // and duplicating index 0 would duplicate only the fence's first half.
        expect(segments).toHaveLength(2);
        const next = [...segments];
        next.splice(1, 0, segments[0]);
        return next;
      }, 'trim');
      expect(result).toContain('line one\n---\nline two');
      // Duplicated once more (three total): original, duplicate, then B.
      expect(result.match(/line one/g)).toHaveLength(2);
    });
  });

  describe('rejoin: preserve (toggle hidden / set-clear background)', () => {
    it('keeps every unedited segment byte-identical, including original spacing', () => {
      const prev = doc('title: X', ['  A with leading spaces  ', 'B\n\nwith a blank line']);
      const result = editSlideSegments(prev, (segments) => {
        const next = [...segments];
        next[0] = `<!-- hidden -->\n${next[0]}`;
        return next;
      }, 'preserve');
      // Segment 1 (untouched) must survive with its exact original bytes.
      expect(result).toContain('B\n\nwith a blank line');
    });

    it('round-trips a document with no edits back to itself (mirrors an in-place toggle mechanism)', () => {
      const prev = doc('title: X', ['A', 'B\n\nwith a blank line', 'C']);
      const result = editSlideSegments(prev, (segments) => segments, 'preserve');
      expect(result).toBe(prev);
    });

    it('is fence-aware for in-place edits too', () => {
      const prev = doc('title: X', ['A\n\n```\nline one\n---\nline two\n```', 'B']);
      const result = editSlideSegments(prev, (segments) => {
        expect(segments).toHaveLength(2);
        return segments;
      }, 'preserve');
      expect(result).toBe(prev);
    });
  });
});
