import { describe, it, expect } from 'vitest';
import { isMarp, importMarp } from '../marp';
import { parseDocument } from '../../parser/markdownToSlides';

describe('isMarp', () => {
  it('detects marp:true frontmatter only', () => {
    expect(isMarp('---\nmarp: true\n---\n# Hi')).toBe(true);
    expect(isMarp('---\ntitle: x\n---\n# Hi')).toBe(false);
    expect(isMarp('# Hi')).toBe(false);
  });

  it('detects marp:true with extra whitespace around the value', () => {
    expect(isMarp('---\nmarp:  true\n---\n# Hi')).toBe(true);
  });

  it('does not treat marp: "true" as a Marp deck (quoted YAML boolean)', () => {
    expect(isMarp('---\nmarp: "true"\n---\n# Hi')).toBe(false);
  });

  it('returns false when marp: false is present', () => {
    expect(isMarp('---\nmarp: false\n---\n# Hi')).toBe(false);
  });
});

describe('importMarp', () => {
  it('preserves ![bg] as native bg (image-only → full-bleed via parser)', () => {
    const { markdown } = importMarp('---\nmarp: true\n---\n![bg](a.jpg)');
    expect(markdown).toContain('![bg](a.jpg)');
    expect(markdown).not.toContain('<!-- layout:full-bleed -->');
    expect(markdown).not.toContain('![](a.jpg)');
    expect(markdown).not.toContain('marp: true');
  });

  it('preserves ![bg] + title so overlay text survives import (issue #169)', () => {
    const { markdown } = importMarp(
      '---\nmarp: true\n---\n![bg](hero.jpg)\n\n# Title on the photo\n\nBody text.',
    );
    expect(markdown).toContain('![bg](hero.jpg)');
    expect(markdown).toContain('# Title on the photo');
    expect(markdown).toContain('Body text.');
    expect(markdown).not.toContain('<!-- layout:full-bleed -->');
    expect(markdown).not.toContain('![](hero.jpg)');

    // End-to-end: native parser must set backgroundImage (not full-bleed-only).
    const { slides } = parseDocument(markdown);
    expect(slides[0].backgroundImage?.src).toBe('hero.jpg');
    expect(slides[0].layout).not.toBe('full-bleed');
    expect(slides[0].title).toBe('Title on the photo');
  });

  it('drops a style block-scalar without leaking its CSS as frontmatter', () => {
    const deck = [
      '---', 'marp: true', 'style: |', '  section {',
      '    padding: 60px 80px;', '    background: #e8200a;', '  }',
      'paginate: true', '---', '# Real Slide',
    ].join('\n');
    const { markdown, dropped } = importMarp(deck);
    expect(markdown).not.toContain('padding: 60px');
    expect(markdown).not.toContain('#e8200a');
    expect(dropped).toContain('style');
    expect(markdown).toContain('# Real Slide');
    expect(markdown).toContain('show_slide_number: true'); // paginate after the block still parsed
  });

  it('preserves ![bg left] as native bg (split via parser)', () => {
    const { markdown } = importMarp('---\nmarp: true\n---\n![bg left](a.jpg)\n\n# Title');
    expect(markdown).toContain('![bg left](a.jpg)');
    expect(markdown).not.toContain('<!-- layout:split -->');
  });

  it('maps frontmatter size and paginate', () => {
    const { markdown } = importMarp('---\nmarp: true\nsize: 4:3\npaginate: true\n---\n# X');
    expect(markdown).toContain('aspect_ratio: "4:3"');
    expect(markdown).toContain('show_slide_number: true');
  });

  it('preserves passthrough frontmatter (title)', () => {
    const { markdown } = importMarp('---\nmarp: true\ntitle: My Deck\n---\n# X');
    expect(markdown).toContain('title: "My Deck"');
  });

  it('maps _class:lead to layout:title', () => {
    const { markdown } = importMarp('---\nmarp: true\n---\n<!-- _class: lead -->\n# Hi');
    expect(markdown).toContain('<!-- layout:title -->');
  });

  it('logs dropped theme and leaves an inline comment', () => {
    const { markdown, dropped } = importMarp('---\nmarp: true\ntheme: gaudy\n---\n# X');
    expect(dropped).toContain('theme:gaudy');
    expect(markdown).toContain('<!-- marp: dropped theme:gaudy -->');
  });

  it('turns a non-directive comment into a speaker note', () => {
    const { markdown } = importMarp('---\nmarp: true\n---\n# Slide\n\n<!-- remember to smile -->');
    expect(markdown).toContain('???');
    expect(markdown).toContain('remember to smile');
  });

  it('drops an unknown size value instead of forcing 16:9', () => {
    const { markdown, dropped } = importMarp('---\nmarp: true\nsize: 1:1\n---\n# X');
    expect(markdown).not.toContain('aspect_ratio');
    expect(dropped).toContain('size:1:1');
  });

  it('keeps both slides of a two-slide deck', () => {
    const { markdown } = importMarp('---\nmarp: true\n---\n# One\n\n---\n\n# Two');
    expect(markdown).toContain('# One');
    expect(markdown).toContain('# Two');
    expect(markdown.split(/^---$/m).length).toBeGreaterThanOrEqual(2);
  });

  it('preserves ![bg right] as native bg', () => {
    const { markdown } = importMarp('---\nmarp: true\n---\n![bg right](a.jpg)\n\n# Title');
    expect(markdown).toContain('![bg right](a.jpg)');
    expect(markdown).not.toContain('<!-- layout:split -->');
  });

  it('maps ![bg fit] to native contain and does not drop the line', () => {
    const { markdown, dropped } = importMarp('---\nmarp: true\n---\n![bg fit](a.jpg)');
    expect(markdown).toContain('![bg contain](a.jpg)');
    expect(dropped).not.toContain('bg-sizing');
  });

  it('logs bg-sizing for percentage modifiers we do not map', () => {
    const { markdown, dropped } = importMarp('---\nmarp: true\n---\n![bg left:40%](a.jpg)\n\n# Title');
    expect(dropped).toContain('bg-sizing');
    expect(markdown).toContain('![bg left](a.jpg)');
  });

  it('drops a second background image on the same slide', () => {
    const { markdown, dropped } = importMarp('---\nmarp: true\n---\n![bg](a.jpg)\n![bg](b.jpg)');
    expect(dropped).toContain('bg-extra');
    expect(markdown).toContain('![bg](a.jpg)');
    expect(markdown).not.toContain('![bg](b.jpg)');
  });

  it('preserves bg paths that contain spaces', () => {
    const { markdown } = importMarp('---\nmarp: true\n---\n![bg](my photo.jpg)\n\n# Title');
    expect(markdown).toContain('![bg](my photo.jpg)');
  });

  it('strips Marp image size keywords from alt text', () => {
    const { markdown, dropped } = importMarp('---\nmarp: true\n---\n![w:200 h:100](photo.jpg)');
    expect(dropped).toContain('image-size');
    expect(markdown).toContain('![](photo.jpg)');
    expect(markdown).not.toContain('w:200');
  });

  it('does not split slides on --- inside a fenced code block', () => {
    const deck = [
      '---', 'marp: true', '---',
      '# Slide', '',
      '```', 'line one', '---', 'line two', '```',
    ].join('\n');
    const { markdown } = importMarp(deck);
    expect(markdown).toContain('line one');
    expect(markdown).toContain('line two');
    expect(markdown.match(/^# Slide$/gm)).toHaveLength(1);
  });

  it('maps size 16:9 to aspect_ratio', () => {
    const { markdown } = importMarp('---\nmarp: true\nsize: 16:9\n---\n# X');
    expect(markdown).toContain('aspect_ratio: "16:9"');
  });

  it('maps footer text into theme_overrides', () => {
    const { markdown } = importMarp('---\nmarp: true\nfooter: "Confidential"\n---\n# X');
    expect(markdown).toContain('footer:');
    expect(markdown).toContain('"Confidential"');
  });

  it('passes through author and numeric date in frontmatter', () => {
    const { markdown } = importMarp('---\nmarp: true\nauthor: Ada Lovelace\ndate: 2024\n---\n# X');
    expect(markdown).toContain('author: "Ada Lovelace"');
    expect(markdown).toContain('date: 2024');
    expect(markdown).not.toContain('marp: true');
  });

  it('maps _class: invert to Kova invert directive (issue #143)', () => {
    const { markdown, dropped } = importMarp('---\nmarp: true\n---\n<!-- _class: invert -->\n# Hi');
    expect(dropped).not.toContain('_class:invert');
    expect(markdown).not.toContain('<!-- layout:title -->');
    expect(markdown).toContain('<!-- _class: invert -->');
    expect(markdown).toContain('# Hi');
  });

  it('imports decks whose frontmatter uses spaced marp: true', () => {
    const { markdown } = importMarp('---\nmarp:  true\ntitle: Deck\n---\n# Slide');
    expect(markdown).toContain('title: "Deck"');
    expect(markdown).toContain('# Slide');
    expect(markdown).not.toContain('marp:');
  });
});
