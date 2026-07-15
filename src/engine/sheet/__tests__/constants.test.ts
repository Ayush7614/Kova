import { describe, it, expect } from 'vitest';
import { collectConstants } from '../constants';

describe('collectConstants', () => {
  it('collects a scalar constant from anywhere in the document', () => {
    const c = collectConstants(['# Slide\n\n!let vat = 0.255\n\ntext\n']);
    expect(c.get('vat')).toBe(0.255);
  });

  it('lets a constant build on an earlier one', () => {
    const c = collectConstants(['!let rate = 620\n!let week = rate * 5\n']);
    expect(c.get('week')).toBe(3100);
  });

  it('ignores !let inside a fenced code block', () => {
    const c = collectConstants(['```\n!let vat = 0.255\n```\n']);
    expect(c.has('vat')).toBe(false);
  });

  it('defines nothing when the expression is broken, so cells report it', () => {
    const c = collectConstants(['!let vat = 0.255 +\n']);
    expect(c.has('vat')).toBe(false);
  });

  it('lets the last definition win', () => {
    const c = collectConstants(['!let vat = 0.20\n!let vat = 0.255\n']);
    expect(c.get('vat')).toBe(0.255);
  });

  it('a broken redefinition leaves the name undefined', () => {
    const c = collectConstants(['!let vat = 0.20\n!let vat = 0.255 +\n']);
    expect(c.has('vat')).toBe(false);
  });

  it('a constant depending on an earlier one still works after broken redefinition', () => {
    const c = collectConstants(['!let rate = 620\n!let week = rate * 5\n!let rate = bad +\n']);
    expect(c.has('rate')).toBe(false);
    expect(c.has('week')).toBe(true);
    expect(c.get('week')).toBe(3100);
  });

  it('collects constants across multiple slides', () => {
    const c = collectConstants(['!let rate = 620\n', '!let week = rate * 5\n']);
    expect(c.get('rate')).toBe(620);
    expect(c.get('week')).toBe(3100);
  });

  it('an unbalanced fence on one slide does not disable !let on a later slide', () => {
    // Slide 1 opens a fence and never closes it — without a per-slide reset,
    // this would leave inFencedCode stuck true for every later slide.
    const c = collectConstants(['```\nunterminated fence\n', '!let vat = 0.5\n']);
    expect(c.get('vat')).toBe(0.5);
  });
});
