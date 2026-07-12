import { describe, it, expect } from 'vitest';
import { parseExpr } from '../parser';
import { SheetError } from '../lexer';

describe('parseExpr', () => {
  it('parses a binary expression', () => {
    expect(parseExpr('qty * unit')).toEqual({
      k: 'bin', op: '*',
      l: { k: 'id', name: 'qty' },
      r: { k: 'id', name: 'unit' },
    });
  });

  it('gives * higher precedence than +', () => {
    expect(parseExpr('1 + 2 * 3')).toEqual({
      k: 'bin', op: '+',
      l: { k: 'num', v: 1 },
      r: { k: 'bin', op: '*', l: { k: 'num', v: 2 }, r: { k: 'num', v: 3 } },
    });
  });

  it('makes ^ right-associative', () => {
    // 2 ^ (3 ^ 2), not (2 ^ 3) ^ 2
    expect(parseExpr('2 ^ 3 ^ 2')).toEqual({
      k: 'bin', op: '^',
      l: { k: 'num', v: 2 },
      r: { k: 'bin', op: '^', l: { k: 'num', v: 3 }, r: { k: 'num', v: 2 } },
    });
  });

  it('parses parentheses, calls, strings and the ternary', () => {
    expect(parseExpr('(a + 1) * 2')).toEqual({
      k: 'bin', op: '*',
      l: { k: 'bin', op: '+', l: { k: 'id', name: 'a' }, r: { k: 'num', v: 1 } },
      r: { k: 'num', v: 2 },
    });
    expect(parseExpr('round(x, 2)')).toEqual({
      k: 'call', name: 'round', args: [{ k: 'id', name: 'x' }, { k: 'num', v: 2 }],
    });
    expect(parseExpr('sum(total)')).toEqual({
      k: 'call', name: 'sum', args: [{ k: 'id', name: 'total' }],
    });
    expect(parseExpr('concat("a", "b")')).toEqual({
      k: 'call', name: 'concat', args: [{ k: 'str', v: 'a' }, { k: 'str', v: 'b' }],
    });
    expect(parseExpr('a > 1 ? 10 : 20')).toEqual({
      k: 'cond',
      c: { k: 'bin', op: '>', l: { k: 'id', name: 'a' }, r: { k: 'num', v: 1 } },
      a: { k: 'num', v: 10 },
      b: { k: 'num', v: 20 },
    });
  });

  it('parses unary minus, not, and booleans', () => {
    expect(parseExpr('-a')).toEqual({ k: 'un', op: '-', e: { k: 'id', name: 'a' } });
    expect(parseExpr('not a')).toEqual({ k: 'un', op: 'not', e: { k: 'id', name: 'a' } });
    expect(parseExpr('true')).toEqual({ k: 'bool', v: true });
    // -2^2 is -(2^2)
    expect(parseExpr('-2 ^ 2')).toEqual({
      k: 'un', op: '-', e: { k: 'bin', op: '^', l: { k: 'num', v: 2 }, r: { k: 'num', v: 2 } },
    });
  });

  it('parses decimals', () => {
    expect(parseExpr('12.50')).toEqual({ k: 'num', v: 12.5 });
  });

  it('throws SheetError on a truncated formula', () => {
    expect(() => parseExpr('1 +')).toThrow(SheetError);
  });

  it('throws SheetError on trailing junk', () => {
    expect(() => parseExpr('1 2')).toThrow(SheetError);
  });

  it('throws SheetError on an unexpected character', () => {
    expect(() => parseExpr('a & b')).toThrow(SheetError);
  });
});
