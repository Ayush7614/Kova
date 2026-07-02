import { describe, it, expect } from 'vitest';
import { formatTime, timerDisplay } from '../presentationShared';

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

describe('timerDisplay', () => {
  it('shows elapsed time when countdown is off', () => {
    expect(timerDisplay(125, 0)).toEqual({ text: '02:05', warning: false });
  });

  it('counts down and warns in the final minute', () => {
    expect(timerDisplay(240, 5)).toEqual({ text: '01:00', warning: true });
    expect(timerDisplay(300, 5)).toEqual({ text: '00:00', warning: true });
    expect(timerDisplay(120, 5)).toEqual({ text: '03:00', warning: false });
  });
});
