import { describe, it, expect } from 'vitest';
import { toRawUrl } from '../import/toRawUrl';

describe('toRawUrl (issue #197)', () => {
  it('rewrites GitHub blob URLs to raw.githubusercontent.com', () => {
    expect(toRawUrl('https://github.com/user/repo/blob/main/talk.md')).toBe(
      'https://raw.githubusercontent.com/user/repo/main/talk.md',
    );
  });

  it('rewrites GitLab blob URLs to raw', () => {
    expect(toRawUrl('https://gitlab.com/user/repo/-/blob/main/talk.md')).toBe(
      'https://gitlab.com/user/repo/-/raw/main/talk.md',
    );
  });

  it('rewrites Bitbucket src URLs to raw', () => {
    expect(toRawUrl('https://bitbucket.org/user/repo/src/main/talk.md')).toBe(
      'https://bitbucket.org/user/repo/raw/main/talk.md',
    );
  });

  it('passes through already-raw and unknown hosts', () => {
    expect(toRawUrl('https://raw.githubusercontent.com/user/repo/main/talk.md')).toBe(
      'https://raw.githubusercontent.com/user/repo/main/talk.md',
    );
    expect(toRawUrl('https://example.com/deck.md')).toBe('https://example.com/deck.md');
  });
});
