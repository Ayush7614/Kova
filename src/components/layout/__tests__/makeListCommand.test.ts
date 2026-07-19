import { describe, it, expect } from 'vitest';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { makeListCommand } from '../../editor/formatCommands';

// A DOM-free stand-in for EditorView: makeListCommand only reads `view.state`,
// calls `view.dispatch(tr)`, and calls `view.focus()`.
function makeView(doc: string, from: number, to: number) {
  let state = EditorState.create({ doc, selection: { anchor: from, head: to } });
  return {
    get state() { return state; },
    dispatch(tr: TransactionSpec) { state = state.update(tr).state; },
    focus() {},
  } as unknown as EditorView;
}

describe('makeListCommand ul', () => {
  it('bullets every line spanned by a multi-line selection', () => {
    const doc = 'one\ntwo\nthree';
    const view = makeView(doc, 0, doc.length);
    makeListCommand('ul')(view);
    expect(view.state.doc.toString()).toBe('- one\n- two\n- three');
  });

  it('toggles bullets off when every selected line already has one', () => {
    const doc = '- one\n- two\n- three';
    const view = makeView(doc, 0, doc.length);
    makeListCommand('ul')(view);
    expect(view.state.doc.toString()).toBe('one\ntwo\nthree');
  });

  it('converts a uniformly-numbered selection to bullets', () => {
    const doc = '1. one\n2. two';
    const view = makeView(doc, 0, doc.length);
    makeListCommand('ul')(view);
    expect(view.state.doc.toString()).toBe('- one\n- two');
  });

  it('only bullets bare lines added after an existing bullet list, leaving the rest untouched', () => {
    const doc = '- one\n- two\nthree\nfour';
    const view = makeView(doc, 0, doc.length);
    makeListCommand('ul')(view);
    expect(view.state.doc.toString()).toBe('- one\n- two\n- three\n- four');
  });
});

describe('makeListCommand ol', () => {
  it('numbers every line sequentially rather than repeating "1."', () => {
    const doc = 'one\ntwo\nthree';
    const view = makeView(doc, 0, doc.length);
    makeListCommand('ol')(view);
    expect(view.state.doc.toString()).toBe('1. one\n2. two\n3. three');
  });

  it('toggles numbering off when every selected line is already numbered', () => {
    const doc = '1. one\n2. two\n3. three';
    const view = makeView(doc, 0, doc.length);
    makeListCommand('ol')(view);
    expect(view.state.doc.toString()).toBe('one\ntwo\nthree');
  });

  it('converts a uniformly-bulleted selection to a numbered list', () => {
    const doc = '- one\n- two\n- three';
    const view = makeView(doc, 0, doc.length);
    makeListCommand('ol')(view);
    expect(view.state.doc.toString()).toBe('1. one\n2. two\n3. three');
  });

  it('only numbers bare lines added after an existing numbered list, continuing the sequence', () => {
    const doc = '1. one\n2. two\nthree\nfour';
    const view = makeView(doc, 0, doc.length);
    makeListCommand('ol')(view);
    expect(view.state.doc.toString()).toBe('1. one\n2. two\n3. three\n4. four');
  });

  it('leaves a mid-selection numbered line untouched and keeps the count going for lines after it', () => {
    const doc = 'one\n2. two\nthree';
    const view = makeView(doc, 0, doc.length);
    makeListCommand('ol')(view);
    expect(view.state.doc.toString()).toBe('1. one\n2. two\n3. three');
  });
});
