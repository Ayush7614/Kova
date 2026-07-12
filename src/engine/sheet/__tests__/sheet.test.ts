import { describe, it, expect } from 'vitest';
import { evaluateSheet, parseSheetDirective, slugify, isFooterRow } from '../sheet';
import type { Value } from '../evaluate';

const NO_CONSTS = new Map<string, Value>();

describe('parseSheetDirective', () => {
  it('reads precision, defaulting to 2, and accepts-and-ignores a bare table name', () => {
    expect(parseSheetDirective(' bom')).toEqual({ precision: 2 });
    expect(parseSheetDirective(' bom precision=4')).toEqual({ precision: 4 });
    expect(parseSheetDirective('')).toEqual({ precision: 2 });
  });
});

describe('slugify', () => {
  it('lowercases, strips emphasis and punctuation, and underscores spaces', () => {
    expect(slugify('Unit (€)')).toBe('unit');
    expect(slugify('**With VAT**')).toBe('with_vat');
    expect(slugify('qty')).toBe('qty');
    // an underscore already in the header survives — it is a legal identifier char
    expect(slugify('with_vat')).toBe('with_vat');
  });
});

describe('isFooterRow', () => {
  it('is true when the first cell starts with !', () => {
    expect(isFooterRow(['!Total', '', '=sum(total)'])).toBe(true);
    expect(isFooterRow(['motor', '2', '=qty * unit'])).toBe(false);
  });

  it('is false for a label that escapes a literal leading !', () => {
    expect(isFooterRow(['\\!brand widget', '2', '12.50'])).toBe(false);
  });
});

// A data row whose label happens to start with `!` used to be read as a footer,
// which dropped it from every column vector and quietly deflated the totals.
describe('a label that starts with !', () => {
  const table = (label: string) => [
    ['item', 'price'],
    ['motor', '30'],
    [label, '30'],
    ['ESC', '35'],
    ['!Total', '=sum(price)'],
  ];

  it('counts an escaped label as a data row, so the total is right', () => {
    const out = evaluateSheet(table('\\!brand widget'), { precision: 2 }, NO_CONSTS);
    expect(out[4][1]).toBe('95');       // 30 + 30 + 35, nothing dropped
    expect(out[2][0]).toBe(null);       // literal cell: the caller keeps its HTML
  });

  it('reports an unescaped label instead of silently dropping the row', () => {
    const out = evaluateSheet(table('!brand widget'), { precision: 2 }, NO_CONSTS);
    expect(out[2][0]).toContain('#ERR');
    expect(out[2][0]).toContain('\\!');  // names the escape
  });

  it('leaves a real footer row (one that computes) alone', () => {
    const out = evaluateSheet(
      [['item', 'price'], ['motor', '30'], ['!Total', '=sum(price)']],
      { precision: 2 },
      NO_CONSTS,
    );
    expect(out[2][0]).toBe(null);
    expect(out[2][1]).toBe('30');
  });
});

describe('evaluateSheet', () => {
  const bom = () => [
    ['item', 'qty', 'unit', 'total'],
    ['motor RS550', '2', '12.50', '=qty * unit'],
    ['ESC 30A', '2', '8.00', '=qty * unit'],
    ['RF module', '1', '6.90', '=qty * unit'],
    ['!Subtotal', '', '', '=sum(total)'],
    ['!VAT', '', '', '=sum(total) * vat'],
    ['!**Total**', '', '', '=sum(total) * (1 + vat)'],
  ];

  it('computes rows, aggregates footers, and leaves literals to the caller', () => {
    const out = evaluateSheet(bom(), { precision: 2 }, new Map([['vat', 0.255 as Value]]));

    // literal cells are null: "not mine"
    expect(out[0]).toEqual([null, null, null, null]);
    expect(out[1][0]).toBe(null);
    expect(out[1][1]).toBe(null);

    // row formulas
    expect(out[1][3]).toBe('25');
    expect(out[2][3]).toBe('16');
    expect(out[3][3]).toBe('6.90');

    // footer formulas — and the footers do not count themselves
    expect(out[4][3]).toBe('47.90');
    expect(out[5][3]).toBe('12.21');
    expect(out[6][3]).toBe('60.11');
  });

  it('resolves a formula that depends on another computed column', () => {
    const out = evaluateSheet(
      [
        ['days', 'rate', 'fee', 'with_vat'],
        ['4', '620', '=days * rate', '=fee * (1 + vat)'],
      ],
      { precision: 2 },
      new Map([['vat', 0.255 as Value]]),
    );
    expect(out[1][2]).toBe('2480');
    expect(out[1][3]).toBe('3112.40');
  });

  it('reports a circular reference instead of hanging', () => {
    const out = evaluateSheet(
      [['a', 'b'], ['=b + 1', '=a + 1']],
      { precision: 2 },
      NO_CONSTS,
    );
    expect(out[1][0]).toMatch(/#ERR circular reference/);
  });

  it('reports errors per cell and keeps the rest of the table computing', () => {
    const out = evaluateSheet(
      [
        ['item', 'qty', 'unit', 'total'],
        ['motor', '2', '12.50', '=qty * unit'],
        ['ESC', '2', '8.00', '=qty * untis'],
      ],
      { precision: 2 },
      NO_CONSTS,
    );
    expect(out[1][3]).toBe('25');
    expect(out[2][3]).toBe("#ERR unknown column or constant 'untis'");
  });

  it('reports a duplicate column name', () => {
    const out = evaluateSheet([['qty', 'qty'], ['1', '=qty']], { precision: 2 }, NO_CONSTS);
    expect(out[1][1]).toMatch(/#ERR duplicate column name 'qty'/);
  });

  it('reports a syntax error, an unknown function and an aggregate used in a data row', () => {
    // 'd' is a healthy column (a plain literal) so the sum(d) misuse is
    // isolated from 'a', which is deliberately broken for the syntax-error
    // assertion — otherwise sum(d) would just report a's real error.
    const out = evaluateSheet(
      [['a', 'b', 'c', 'd'], ['=1 +', '=frobnicate(1)', '=sum(d)', '5']],
      { precision: 2 },
      NO_CONSTS,
    );
    expect(out[1][0]).toMatch(/^#ERR /);
    expect(out[1][1]).toMatch(/#ERR unknown function/);
    expect(out[1][2]).toMatch(/#ERR .*whole column/);
  });

  it('reports an error in a cell that depends on a broken cell, instead of rendering blank', () => {
    const out = evaluateSheet(
      [['a', 'c'], ['=1 +', '=a + 1']],
      { precision: 2 },
      NO_CONSTS,
    );
    expect(out[1][1]).toContain('#ERR');
    expect(out[1][1]).not.toBe('');
  });

  it('reports circular reference on both cells of a mutual cycle', () => {
    const out = evaluateSheet(
      [['a', 'b'], ['=b + 1', '=a + 1']],
      { precision: 2 },
      NO_CONSTS,
    );
    expect(out[1][0]).toMatch(/#ERR circular reference/);
    expect(out[1][1]).toMatch(/#ERR circular reference/);
  });

  it('still renders an empty string for a formula referencing a genuinely empty cell', () => {
    const out = evaluateSheet(
      [['a', 'b'], ['', '=a + 1']],
      { precision: 2 },
      NO_CONSTS,
    );
    expect(out[1][1]).toBe('');
  });

  it('honours precision and renders integers bare', () => {
    const out = evaluateSheet([['unit', 'v'], ['3', '=unit / 7']], { precision: 6 }, NO_CONSTS);
    expect(out[1][1]).toBe('0.428571');
  });

  it('treats a cell escaped with a backslash as a literal', () => {
    const out = evaluateSheet([['a'], ['\\=not a formula']], { precision: 2 }, NO_CONSTS);
    expect(out[1][0]).toBe(null);
  });
});
