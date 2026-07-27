// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import { exportToPptx } from '../exportPptx';
import { DEFAULT_THEME } from '../../theme';
import type { Slide } from '../../types';

vi.mock('html-to-image', () => ({
  toPng: async () => {
    // 1×1 PNG
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  },
}));

function mathSlide(): Slide {
  return {
    index: 0,
    raw: '',
    title: 'Equation',
    titleLevel: 2,
    elements: [{ type: 'math', value: 'E = mc^2', display: true }],
    speakerNotes: '',
    references: [],
    layout: 'title-content',
    hidden: false,
  };
}

describe('exportPptx display math (issue #196)', () => {
  it('embeds display math as an image in the PPTX zip', async () => {
    const res = await exportToPptx([mathSlide()], {}, DEFAULT_THEME, 'en');
    const zip = await JSZip.loadAsync(res.base64, { base64: true });
    const media = Object.keys(zip.files).filter((p) => p.startsWith('ppt/media/'));
    expect(media.length).toBeGreaterThan(0);
    // Should not fall back to leaving only plain TeX in slide text without media.
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(xml).toMatch(/a:blip|p:pic/i);
  });
});
