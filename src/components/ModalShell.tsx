import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';

// Single canonical stacking pair for every centered modal dialog, replacing
// the drifted 1000/1001 vs 2000/2001 values that had accumulated across
// call sites. Deliberately not used by the find dialog (top-anchored, no
// backdrop dim — a different pattern) or toast-style messages.
const BACKDROP_Z = 2000;
const CARD_Z = 2001;

// Mount-ordered stack of every currently-mounted ModalShell with
// dismissOnEscape enabled. Each instance still owns its own keydown
// listener (matches the pre-existing per-instance pattern below), but only
// fires if it's the topmost entry — otherwise two modals open at once (e.g.
// PDF export options, then an unsaved-changes confirm dialog on top of it)
// both close on a single Escape press instead of just the one on top.
const escapeStack: object[] = [];

interface ModalShellProps {
  onClose: () => void;
  children: ReactNode;
  width?: number | string;
  maxWidth?: string;
  dismissOnBackdropClick?: boolean;
  dismissOnEscape?: boolean;
  ariaLabel?: string;
  /** Escape hatch for per-modal layout: padding, maxHeight, flex column, etc. */
  cardStyle?: CSSProperties;
}

export function ModalShell({
  onClose,
  children,
  width = 480,
  maxWidth = '92vw',
  dismissOnBackdropClick = true,
  dismissOnEscape = true,
  ariaLabel,
  cardStyle,
}: ModalShellProps) {
  // Read the latest onClose through a ref so the keydown listener doesn't
  // get torn down and re-added on every render — most callers pass an
  // inline arrow function, so onClose's identity changes every time.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!dismissOnEscape) return;
    // Unique per-mount identity — not the close callback itself, which
    // would need care to keep stable across re-renders; this only needs to
    // answer "is this instance topmost", which a plain marker object does
    // regardless of how many times the effect's own deps cause it to rerun.
    const token = {};
    escapeStack.push(token);
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (escapeStack[escapeStack.length - 1] !== token) return; // not topmost — ignore
      onCloseRef.current();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      const idx = escapeStack.indexOf(token);
      if (idx >= 0) escapeStack.splice(idx, 1);
    };
  }, [dismissOnEscape]);

  return (
    <>
      <div
        onClick={dismissOnBackdropClick ? onClose : undefined}
        style={{ position: 'fixed', inset: 0, background: 'var(--backdrop)', zIndex: BACKDROP_Z }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width,
          maxWidth,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          zIndex: CARD_Z,
          ...cardStyle,
        }}
      >
        {children}
      </div>
    </>
  );
}

export function ModalCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
        padding: 4, borderRadius: 4, lineHeight: 1,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12">
        <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </button>
  );
}
