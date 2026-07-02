import { describe, it, expect } from 'vitest';
import { collectDeckReferences, buildBibliographySlideMarkdown } from '../bibliography';
import type { Slide } from '../../types';

const slide = (over: Partial<Slide> & Pick<Slide, 'references'>): Slide => ({
  index: 0,
  raw: '',
  title: '',
  titleLevel: 0,
  elements: [],
  speakerNotes: '',
  layout: 'blank',
  hidden: false,
  ...over,
});

describe('bibliography', () => {
  it('collects references in deck order and dedupes', () => {
    const refs = collectDeckReferences([
      slide({ references: ['First', 'Second'] }),
      slide({ references: ['Second', 'Third'] }),
    ]);
    expect(refs).toEqual(['First', 'Second', 'Third']);
  });

  it('ignores empty reference strings', () => {
    const refs = collectDeckReferences([
      slide({ references: ['  ', 'Real citation'] }),
    ]);
    expect(refs).toEqual(['Real citation']);
  });

  it('builds a References slide with bullet list', () => {
    expect(buildBibliographySlideMarkdown(['Alpha', 'Beta'])).toBe(
      '## References\n\n- Alpha\n- Beta',
    );
  });
});
