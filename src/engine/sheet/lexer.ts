// Tokenizer for !sheet formulas. The grammar is deliberately tiny (see the
// mdsheet design): no assignment, no loops, no user-defined functions.
export class SheetError extends Error {}

export type Tok = { t: 'num' | 'str' | 'id' | 'op'; v: string };

const OPS2 = ['==', '!=', '<=', '>='];
const OPS1 = '+-*/%^<>(),?:'.split('');

export function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;

  while (i < src.length) {
    const c = src[i];

    if (/\s/.test(c)) { i++; continue; }

    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^[0-9]*\.?[0-9]+/.exec(src.slice(i))!;
      toks.push({ t: 'num', v: m[0] });
      i += m[0].length;
      continue;
    }

    if (c === '"' || c === "'") {
      const end = src.indexOf(c, i + 1);
      if (end < 0) throw new SheetError('unterminated string');
      toks.push({ t: 'str', v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }

    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      toks.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }

    const two = src.slice(i, i + 2);
    if (OPS2.includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
    if (OPS1.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }

    throw new SheetError(`unexpected character '${c}'`);
  }

  return toks;
}
