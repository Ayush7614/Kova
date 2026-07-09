import { describe, it, expect } from 'vitest';
import { parseBgLine, extractBgImage, formatBgLine } from '../parser/bgImage';

describe('parseBgLine', () => {
  it('parses a full-slide background', () => {
    expect(parseBgLine('![bg](hero.jpg)')).toEqual({
      src: 'hero.jpg', side: undefined, size: 'cover',
    });
  });

  it('parses split modifiers', () => {
    expect(parseBgLine('![bg left:40%](photo.png)')).toEqual({
      src: 'photo.png', side: 'left', size: 'cover',
    });
    expect(parseBgLine('![bg right](photo.png)')).toEqual({
      src: 'photo.png', side: 'right', size: 'cover',
    });
  });

  it('parses contain/fit sizing', () => {
    expect(parseBgLine('![bg contain](a.jpg)')?.size).toBe('contain');
    expect(parseBgLine('![bg fit](a.jpg)')?.size).toBe('contain');
  });

  it('parses paths containing spaces', () => {
    expect(parseBgLine('![bg](my photo.jpg)')?.src).toBe('my photo.jpg');
  });

  it('returns null for regular images', () => {
    expect(parseBgLine('![](plain.jpg)')).toBeNull();
    expect(parseBgLine('![alt](plain.jpg)')).toBeNull();
    expect(parseBgLine('![background](plain.jpg)')).toBeNull();
  });
});

describe('formatBgLine', () => {
  it('encodes paths with spaces and parentheses', () => {
    expect(formatBgLine({ src: 'photo%20%281%29.jpg', size: 'cover' })).toBe('![bg](photo%20%281%29.jpg)');
    expect(formatBgLine({ src: 'a.jpg', side: 'left', size: 'contain' })).toBe('![bg left contain](a.jpg)');
  });
});

describe('extractBgImage', () => {
  it('strips the first bg line only', () => {
    const { body, bg } = extractBgImage('![bg](a.jpg)\n![bg](b.jpg)\n\n# Hi');
    expect(bg?.src).toBe('a.jpg');
    expect(body).not.toContain('![bg]');
    expect(body).toContain('# Hi');
  });

  it('ignores bg syntax inside fenced code', () => {
    const { body, bg } = extractBgImage('```\n![bg](x.jpg)\n```');
    expect(bg).toBeNull();
    expect(body).toContain('![bg](x.jpg)');
  });
});
