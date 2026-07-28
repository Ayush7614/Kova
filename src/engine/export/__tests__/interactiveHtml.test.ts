import { describe, it, expect } from 'vitest';
import { assembleInteractiveDocument } from '../exportPdfNative';

describe('assembleInteractiveDocument (issue #220)', () => {
  const html = assembleInteractiveDocument({
    css: '.slide-frame { color: red; }',
    slideHtml: ['<div class="slide">One</div>', '<div class="slide">Two</div>', '<div class="slide">Three</div>'],
    slideW: 960,
    slideH: 540,
    background: '#112233',
  });

  it('emits a single-viewport deck with one active slide', () => {
    expect(html).toContain('class="kova-deck-slide is-active"');
    expect(html.match(/class="kova-deck-slide"/g)?.length ?? 0).toBe(2);
    expect(html).toContain('id="kova-deck"');
    expect(html).toContain('1 / 3');
  });

  it('includes keyboard and fullscreen navigation script', () => {
    expect(html).toContain('ArrowRight');
    expect(html).toContain('ArrowLeft');
    expect(html).toContain('requestFullscreen');
    expect(html).toContain("e.key === 'f'");
    expect(html).toContain('kova-counter');
  });

  it('keeps print CSS so the file remains printable', () => {
    expect(html).toContain('@media print');
    expect(html).toContain('page-break-after');
  });

  it('inlines caller CSS and slide markup', () => {
    expect(html).toContain('.slide-frame { color: red; }');
    expect(html).toContain('<div class="slide">Two</div>');
    expect(html).toContain('#112233');
  });

  it('is not a multi-page print dump (no kova-page stack)', () => {
    expect(html).not.toContain('kova-page');
  });
});
