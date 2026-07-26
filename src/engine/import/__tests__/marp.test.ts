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

  it('does not treat a documented ![bg] example inside a fenced code block as a live background (Pass 1)', () => {
    // A bare ![bg](x) reformats to itself byte-for-byte (no side/size
    // modifiers), so an assertion on the fenced example's own text survives
    // unchanged either way and wouldn't actually distinguish fixed from
    // unfixed behaviour. The real, distinguishing symptom of the bug: the
    // fenced example being (mis)parsed as a background consumes the "first
    // bg" slot, so a REAL ![bg] line later on the same slide gets wrongly
    // treated as a second background and dropped.
    const deck = [
      '---', 'marp: true', '---',
      '# How backgrounds work', '',
      '```markdown', '![bg](example.jpg)', '```', '',
      '![bg](real.jpg)',
    ].join('\n');
    const { markdown, dropped } = importMarp(deck);
    expect(markdown).toContain('```markdown\n![bg](example.jpg)\n```');
    expect(markdown).toContain('![bg](real.jpg)');
    expect(dropped).not.toContain('bg-extra');
    const { slides } = parseDocument(markdown);
    expect(slides[0].backgroundImage?.src).toBe('real.jpg');
  });

  it('does not strip a documented image-size example inside a fenced code block (Pass 2)', () => {
    const deck = [
      '---', 'marp: true', '---',
      '# Sizing images', '',
      '```markdown', '![w:200 h:100](x.png)', '```',
    ].join('\n');
    const { markdown, dropped } = importMarp(deck);
    expect(markdown).toContain('![w:200 h:100](x.png)');
    expect(dropped).not.toContain('image-size');
  });

  it('does not turn a documented HTML comment example inside a fenced code block into a directive or note (Pass 3)', () => {
    const deck = [
      '---', 'marp: true', '---',
      '## Class directive', '',
      'Some body text.', '',
      '```markdown', '<!-- _class: lead -->', '```',
    ].join('\n');
    const { markdown, dropped } = importMarp(deck);
    // The fenced sample must survive verbatim as a code block...
    expect(markdown).toContain('```markdown\n<!-- _class: lead -->\n```');
    // ...not be consumed into a live (unfenced) layout:title directive...
    expect(markdown).not.toMatch(/^<!-- layout:title -->/m);
    // ...and not be swallowed into the speaker-note fallback either.
    expect(markdown).not.toContain('???');
    expect(dropped).toHaveLength(0);
    // H2 (not H1) so layout isn't forced to 'title' by the heading itself —
    // confirms the fence, not the heading level, is what's keeping it out.
    const { slides } = parseDocument(markdown);
    expect(slides[0].layout).not.toBe('title');
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

  it('keeps both effects of _class: lead invert (a common Marp dark-title-slide pattern)', () => {
    const { markdown, dropped } = importMarp('---\nmarp: true\n---\n<!-- _class: lead invert -->\n# Hi');
    expect(markdown).toContain('<!-- layout:title -->');
    expect(markdown).toContain('<!-- _class: invert -->');
    expect(dropped.join(' ')).not.toContain('lead');
    expect(dropped.join(' ')).not.toContain('invert');
  });

  it('imports decks whose frontmatter uses spaced marp: true', () => {
    const { markdown } = importMarp('---\nmarp:  true\ntitle: Deck\n---\n# Slide');
    expect(markdown).toContain('title: "Deck"');
    expect(markdown).toContain('# Slide');
    expect(markdown).not.toContain('marp:');
  });
});
