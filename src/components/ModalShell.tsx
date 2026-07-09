import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';

// Single canonical stacking pair for every centered modal dialog, replacing
// the drifted 1000/1001 vs 2000/2001 values that had accumulated across
// call sites. Deliberately not used by the find dialog (top-anchored, no
// backdrop dim — a different pattern) or toast-style messages.
const BACKDROP_Z = 2000;
const CARD_Z = 2001;

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
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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
