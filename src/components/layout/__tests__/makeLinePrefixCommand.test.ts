import { describe, it, expect } from 'vitest';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { makeLinePrefixCommand } from '../../editor/formatCommands';

// A DOM-free stand-in for EditorView: makeLinePrefixCommand only reads
// `view.state`, calls `view.dispatch(tr)`, and calls `view.focus()`.
function makeView(doc: string, from: number, to: number) {
  let state = EditorState.create({ doc, selection: { anchor: from, head: to } });
  return {
    get state() { return state; },
    dispatch(tr: TransactionSpec) { state = state.update(tr).state; },
    focus() {},
  } as unknown as EditorView;
}

describe('makeLinePrefixCommand', () => {
  it('bullets every line spanned by a multi-line selection', () => {
    const doc = 'one\ntwo\nthree';
    const view = makeView(doc, 0, doc.length);
    makeLinePrefixCommand('- ')(view);
    expect(view.state.doc.toString()).toBe('- one\n- two\n- three');
  });

  it('toggles the prefix off when every selected line already has it', () => {
    const doc = '- one\n- two\n- three';
    const view = makeView(doc, 0, doc.length);
    makeLinePrefixCommand('- ')(view);
    expect(view.state.doc.toString()).toBe('one\ntwo\nthree');
  });

  it('replaces an existing list marker on each line rather than duplicating it', () => {
    const doc = '1. one\n1. two';
    const view = makeView(doc, 0, doc.length);
    makeLinePrefixCommand('- ')(view);
    expect(view.state.doc.toString()).toBe('- one\n- two');
  });

  it('still works for a single-line (cursor-only) selection', () => {
    const doc = 'just one line';
    const view = makeView(doc, 3, 3);
    makeLinePrefixCommand('- ')(view);
    expect(view.state.doc.toString()).toBe('- just one line');
  });
});
