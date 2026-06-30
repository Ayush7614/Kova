import { describe, it, expect } from 'vitest';
import { formatTime } from '../presentationShared';

describe('formatTime', () => {
  it('pads mm:ss under an hour', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(65)).toBe('01:05');
    expect(formatTime(599)).toBe('09:59');
  });

  it('adds h:mm:ss past an hour', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3661)).toBe('1:01:01');
  });
});
