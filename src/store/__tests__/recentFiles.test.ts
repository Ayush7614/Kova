import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { recentFileBasename, recentFileMenuLabel, addRecentFile, loadRecentFiles } from '../recentFiles';

// vitest runs in a node environment (see vitest.config.ts) with no browser
// localStorage — stub it the same way src/engine/__tests__/spellChecker.test.ts
// does, so addRecentFile/loadRecentFiles's real persistence path is exercised.
function stubLocalStorage() {
  const store: Record<string, string> = {};
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  });
}

describe('recentFileBasename', () => {
  it('returns the last path segment', () => {
    expect(recentFileBasename('/docs/talk.md')).toBe('talk.md');
    expect(recentFileBasename('C:\\Users\\me\\talk.md')).toBe('talk.md');
  });
});

describe('recentFileMenuLabel', () => {
  it('returns basename when unique', () => {
    expect(recentFileMenuLabel('/a/one.md', ['/a/one.md', '/b/two.md'])).toBe('one.md');
  });

  it('adds parent folder when basenames collide', () => {
    const recents = ['/projects/a/notes.md', '/archive/b/notes.md'];
    expect(recentFileMenuLabel(recents[0], recents)).toBe('notes.md (a)');
    expect(recentFileMenuLabel(recents[1], recents)).toBe('notes.md (b)');
  });
});

// The CLI's --present/--check path canonicalises via Rust's
// std::fs::canonicalize, which on Windows returns a `\\?\`-prefixed extended-
// length path; the GUI's Open dialog never does. Without normalizing, the
// same file opened both ways produced two "duplicate" recent-file entries
// (issue #185).
describe('recentFiles \\\\?\\ prefix normalization (issue #185)', () => {
  beforeEach(stubLocalStorage);
  afterEach(() => vi.unstubAllGlobals());

  it('dedupes a CLI-canonicalised path against the equivalent GUI path', () => {
    addRecentFile('C:\\Users\\me\\talk.md');
    const result = addRecentFile('\\\\?\\C:\\Users\\me\\talk.md');
    expect(result).toEqual(['C:\\Users\\me\\talk.md']);
  });

  it('strips the prefix from newly stored entries', () => {
    const result = addRecentFile('\\\\?\\C:\\Users\\me\\talk.md');
    expect(result).toEqual(['C:\\Users\\me\\talk.md']);
  });

  it('cleans up already-duplicated entries from a prior version on load', () => {
    localStorage.setItem(
      'kova:recentFiles',
      JSON.stringify(['\\\\?\\C:\\Users\\me\\talk.md', 'C:\\Users\\me\\talk.md']),
    );
    expect(loadRecentFiles()).toEqual(['C:\\Users\\me\\talk.md']);
  });
});
