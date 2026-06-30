import { describe, it, expect } from 'vitest';
import { imageMime } from '../imageMime';

describe('imageMime', () => {
  it('maps a bare extension', () => {
    expect(imageMime('png')).toBe('image/png');
    expect(imageMime('jpeg')).toBe('image/jpeg');
  });

  it('maps a full path', () => {
    expect(imageMime('/a.b/c/pic.JPG')).toBe('image/jpeg');
    expect(imageMime('logo.svg')).toBe('image/svg+xml');
  });

  it('covers the wide types', () => {
    expect(imageMime('x.bmp')).toBe('image/bmp');
    expect(imageMime('x.avif')).toBe('image/avif');
    expect(imageMime('x.ico')).toBe('image/x-icon');
    expect(imageMime('x.tiff')).toBe('image/tiff');
  });

  it('strips query/hash and falls back to png', () => {
    expect(imageMime('a.webp?v=2')).toBe('image/webp');
    expect(imageMime('weird')).toBe('image/png');
  });
});
