// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { exportToPptx } from '../exportPptx';
import { DEFAULT_THEME } from '../../theme';
import type { Slide, SlideElement } from '../../types';

// Regression guard for issue #192: a YouTube element mixed with other content
// on a slide was silently dropped on export. detectLayout() normally routes
// any slide containing a youtube element straight to the 'media' layout
// (which already renders it correctly), so this bug is only reachable when an
// explicit `<!-- layout: ... -->` override forces a non-media layout — hence
// setting `layout` directly on the fixture rather than relying on detection.

function para(text: string): SlideElement {
  return { type: 'paragraph', text, html: text };
}

function makeSlide(layout: Slide['layout'], elements: SlideElement[]): Slide {
  return {
    index: 0, raw: '', title: '', titleLevel: 0,
    elements, speakerNotes: '', references: [], layout, hidden: false,
  };
}

async function slideXml(slide: Slide): Promise<string> {
  const res = await exportToPptx([slide], {}, DEFAULT_THEME, 'en');
  const zip = await JSZip.loadAsync(res.base64, { base64: true });
  return zip.file('ppt/slides/slide1.xml')!.async('string');
}

describe('exportPptx youtube in mixed-content slides', () => {
  it('renders label and URL when a youtube element shares a slide with other content', async () => {
    const els: SlideElement[] = [para('intro'), { type: 'youtube', label: 'Demo', url: 'https://youtu.be/xyz' }];
    const xml = await slideXml(makeSlide('title-content', els));
    expect(xml).toContain('Demo');
    expect(xml).toContain('youtu.be/xyz');
  });

  it('falls back to the default label when none is given', async () => {
    const els: SlideElement[] = [para('intro'), { type: 'youtube', label: '', url: 'https://youtu.be/xyz' }];
    const xml = await slideXml(makeSlide('title-content', els));
    expect(xml).toContain('YouTube Video');
  });

  it('still renders the existing video case correctly (control against a copy/paste mistake)', async () => {
    const els: SlideElement[] = [para('intro'), { type: 'video', label: 'Clip', src: 'https://example.com/clip.mp4' }];
    const xml = await slideXml(makeSlide('title-content', els));
    expect(xml).toContain('Clip');
    expect(xml).toContain('example.com/clip.mp4');
  });
});
