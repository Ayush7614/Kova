// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ModalShell } from '../ModalShell';

// No @testing-library/react in this project, which normally sets this flag —
// silences "not configured to support act()" noise from the manual harness below.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { root = createRoot(container); });
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

function pressEscape() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  });
}

describe('ModalShell Escape handling', () => {
  it('closes a single mounted modal on Escape (no regression for the common case)', () => {
    const onClose = vi.fn();
    act(() => {
      root.render(createElement(ModalShell, { onClose }, 'content'));
    });
    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('only the topmost of two stacked modals closes on a single Escape press', () => {
    // Two independent containers, each with its own React root — mirrors
    // two real ModalShell instances mounted by different parts of the app
    // (e.g. PDF export options, then an unsaved-changes confirm dialog).
    const container2 = document.createElement('div');
    document.body.appendChild(container2);
    let root2!: Root;
    act(() => { root2 = createRoot(container2); });

    const onCloseFirst = vi.fn();
    const onCloseSecond = vi.fn();
    act(() => { root.render(createElement(ModalShell, { onClose: onCloseFirst }, 'first')); });
    act(() => { root2.render(createElement(ModalShell, { onClose: onCloseSecond }, 'second')); });

    pressEscape();
    expect(onCloseSecond).toHaveBeenCalledTimes(1);
    expect(onCloseFirst).not.toHaveBeenCalled();

    act(() => { root2.unmount(); });
    container2.remove();
  });

  it('falls through to the next modal down once the topmost unmounts', () => {
    const container2 = document.createElement('div');
    document.body.appendChild(container2);
    let root2!: Root;
    act(() => { root2 = createRoot(container2); });

    const onCloseFirst = vi.fn();
    const onCloseSecond = vi.fn();
    act(() => { root.render(createElement(ModalShell, { onClose: onCloseFirst }, 'first')); });
    act(() => { root2.render(createElement(ModalShell, { onClose: onCloseSecond }, 'second')); });

    act(() => { root2.unmount(); }); // topmost closes/unmounts
    container2.remove();

    pressEscape();
    expect(onCloseFirst).toHaveBeenCalledTimes(1);
  });

  it('a dismissOnEscape={false} instance never responds and never blocks the real topmost one', () => {
    const container2 = document.createElement('div');
    document.body.appendChild(container2);
    let root2!: Root;
    act(() => { root2 = createRoot(container2); });

    const onCloseReal = vi.fn();
    const onCloseNonDismissable = vi.fn();
    act(() => { root.render(createElement(ModalShell, { onClose: onCloseReal }, 'real')); });
    act(() => {
      root2.render(createElement(ModalShell, { onClose: onCloseNonDismissable, dismissOnEscape: false }, 'non-dismissable'));
    });

    pressEscape();
    expect(onCloseNonDismissable).not.toHaveBeenCalled();
    expect(onCloseReal).toHaveBeenCalledTimes(1);

    act(() => { root2.unmount(); });
    container2.remove();
  });
});
