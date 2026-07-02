import { describe, it, expect } from 'vitest';
import { audioMime } from '../audioMime';

describe('audioMime', () => {
  it('maps common audio extensions', () => {
    expect(audioMime('clip.mp3')).toBe('audio/mpeg');
    expect(audioMime('clip.wav')).toBe('audio/wav');
    expect(audioMime('clip.ogg')).toBe('audio/ogg');
    expect(audioMime('clip.m4a')).toBe('audio/mp4');
    expect(audioMime('clip.flac')).toBe('audio/flac');
  });

  it('accepts a bare extension', () => {
    expect(audioMime('aac')).toBe('audio/aac');
  });
});
