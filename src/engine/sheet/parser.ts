import { lex, SheetError, type Tok } from './lexer';

export type Expr =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'id'; name: string }
  | { k: 'un'; op: '-' | 'not'; e: Expr }
  | { k: 'bin'; op: string; l: Expr; r: Expr }
  | { k: 'cond'; c: Expr; a: Expr; b: Expr }
  | { k: 'call'; name: string; args: Expr[] };

const CMP = ['==', '!=', '<', '<=', '>', '>='];

// Recursive descent, one function per precedence level (lowest first).
export function parseExpr(src: string): Expr {
  const toks: Tok[] = lex(src);
  let i = 0;

  const peek = (): Tok | undefined => toks[i];
  const at = (t: Tok['t'], v: string) => peek()?.t === t && peek()!.v === v;
  const eat = (t: Tok['t'], v: string) => {
    if (!at(t, v)) throw new SheetError(`expected '${v}'`);
    i++;
  };

  function ternary(): Expr {
    const c = or();
    if (!at('op', '?')) return c;
    i++;
    const a = ternary();
    eat('op', ':');
    return { k: 'cond', c, a, b: ternary() };
  }

  function or(): Expr {
    let l = and();
    while (at('id', 'or')) { i++; l = { k: 'bin', op: 'or', l, r: and() }; }
    return l;
  }

  function and(): Expr {
    let l = notExpr();
    while (at('id', 'and')) { i++; l = { k: 'bin', op: 'and', l, r: notExpr() }; }
    return l;
  }

  function notExpr(): Expr {
    if (at('id', 'not')) { i++; return { k: 'un', op: 'not', e: notExpr() }; }
    return cmp();
  }

  function cmp(): Expr {
    let l = add();
    while (peek()?.t === 'op' && CMP.includes(peek()!.v)) {
      const op = toks[i++].v;
      l = { k: 'bin', op, l, r: add() };
    }
    return l;
  }

  function add(): Expr {
    let l = mul();
    while (peek()?.t === 'op' && (peek()!.v === '+' || peek()!.v === '-')) {
      const op = toks[i++].v;
      l = { k: 'bin', op, l, r: mul() };
    }
    return l;
  }

  function mul(): Expr {
    let l = unary();
    while (peek()?.t === 'op' && ['*', '/', '%'].includes(peek()!.v)) {
      const op = toks[i++].v;
      l = { k: 'bin', op, l, r: unary() };
    }
    return l;
  }

  function unary(): Expr {
    if (at('op', '-')) { i++; return { k: 'un', op: '-', e: unary() }; }
    return pow();
  }

  // Right-associative: 2 ^ 3 ^ 2 is 2 ^ (3 ^ 2).
  function pow(): Expr {
    const l = primary();
    if (at('op', '^')) { i++; return { k: 'bin', op: '^', l, r: unary() }; }
    return l;
  }

  function primary(): Expr {
    const tk = peek();
    if (!tk) throw new SheetError('unexpected end of formula');

    if (tk.t === 'num') { i++; return { k: 'num', v: Number(tk.v) }; }
    if (tk.t === 'str') { i++; return { k: 'str', v: tk.v }; }

    if (tk.t === 'id') {
      i++;
      if (tk.v === 'true' || tk.v === 'false') return { k: 'bool', v: tk.v === 'true' };
      if (at('op', '(')) {
        i++;
        const args: Expr[] = [];
        if (!at('op', ')')) {
          args.push(ternary());
          while (at('op', ',')) { i++; args.push(ternary()); }
        }
        eat('op', ')');
        return { k: 'call', name: tk.v, args };
      }
      return { k: 'id', name: tk.v };
    }

    if (at('op', '(')) {
      i++;
      const e = ternary();
      eat('op', ')');
      return e;
    }

    throw new SheetError(`unexpected '${tk.v}'`);
  }

  const e = ternary();
  if (i < toks.length) throw new SheetError(`unexpected '${toks[i].v}'`);
  return e;
}
