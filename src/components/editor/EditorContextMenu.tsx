import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../i18n';

type MenuEntry =
  | { type: 'item'; label: string; shortcut?: string; action: () => void; disabled?: boolean }
  | { type: 'divider' }
  | { type: 'header'; label: string }
  | { type: 'submenu'; label: string; entries: MenuEntry[] };

interface Props {
  x: number;
  y: number;
  onClose: () => void;
  entries: MenuEntry[];
  onPanelEnter?: () => void;
  onPanelLeave?: () => void;
}

const MENU_WIDTH = 205;

// WebKitGTK reports window.innerWidth/innerHeight in a coordinate space that
// doesn't match getBoundingClientRect() once `html { zoom }` (Settings ->
// Appearance UI scale) is combined with OS-level display scaling (see the
// vw/vh comment in global.css for the same underlying class of bug). Measure
// the viewport via getBoundingClientRect on body instead, so it stays in the
// same coordinate space as the element rects we compare it against.
function getViewportSize() {
  const r = document.body.getBoundingClientRect();
  return { width: r.width, height: r.height };
}

// WebKitGTK re-applies the ambient `html { zoom }` (Settings -> Appearance
// UI scale) to a `position: fixed` element's own left/top, offsetting it
// from the real cursor position proportional to the scale factor. cx/cy
// below are computed in true screen-pixel space (matching mouse-event
// coordinates); dividing by the scale here cancels that re-application out.
function getUiScale(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function EditorContextMenu({ x, y, onClose, entries, onPanelEnter, onPanelLeave }: Props) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [openSubmenuIdx, setOpenSubmenuIdx] = useState<number | null>(null);
  const [submenuPos, setSubmenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const isRoot = !onPanelEnter;

  // MENU_WIDTH, offsetTop/offsetHeight etc. are *local* CSS-px quantities
  // that the ambient `zoom` visually magnifies on screen; x/y/cx/cy are
  // *real* screen-px (matching mouse-event coordinates and the panel's
  // corrected left/top below). Scale local quantities by uiScale before
  // combining them with cx/cy, or the two unit spaces get added together.
  const uiScale = getUiScale();
  const scaledMenuWidth = MENU_WIDTH * uiScale;
  const scaledGap = 8 * uiScale;

  const cx = Math.min(x, getViewportSize().width - scaledMenuWidth - scaledGap);
  const [cy, setCy] = useState(y);

  // Indices into `entries` that are keyboard-navigable (non-disabled items and submenus).
  const focusableIndices = useMemo(
    () => entries.reduce<number[]>((acc, e, i) => {
      if ((e.type === 'item' && !e.disabled) || e.type === 'submenu') acc.push(i);
      return acc;
    }, []),
    [entries],
  );

  useLayoutEffect(() => {
    if (ref.current) {
      const h = ref.current.offsetHeight * uiScale;
      setCy(Math.min(y, getViewportSize().height - h - scaledGap));
    }
  }, [y, uiScale, scaledGap]);

  useEffect(() => {
    if (!isRoot) return;
    // Auto-focus the first focusable item when the menu opens.
    if (focusableIndices.length > 0) {
      itemRefs.current[focusableIndices[0]]?.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const focused = document.activeElement;
      const pos = focusableIndices.findIndex((i) => itemRefs.current[i] === focused);
      const next = e.key === 'ArrowDown'
        ? (pos + 1) % focusableIndices.length
        : (pos - 1 + focusableIndices.length) % focusableIndices.length;
      itemRefs.current[focusableIndices[next]]?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, isRoot, focusableIndices]);

  function openSubmenu(i: number, el: HTMLDivElement) {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    // Anchor off the panel's own already-correct position (cx/cy) plus the
    // row's offset *within* the panel, instead of el.getBoundingClientRect().
    // WebKitGTK returns bogus rects for elements nested inside a
    // `position: fixed` ancestor that itself sits under a `zoom`-scaled
    // ancestor (Settings -> Appearance UI scale); offsetTop never goes
    // through that fixed-to-viewport conversion, so it stays reliable.
    const rowTop = cy + el.offsetTop * uiScale;
    const panelRight = cx + scaledMenuWidth;
    const spaceRight = getViewportSize().width - panelRight;
    const gap = 2 * uiScale;
    const subX = spaceRight >= scaledMenuWidth + scaledGap / 2
      ? panelRight + gap
      : cx - scaledMenuWidth - gap;
    setSubmenuPos({ x: subX, y: rowTop });
    setOpenSubmenuIdx(i);
  }

  function scheduleClose() {
    closeTimerRef.current = setTimeout(() => setOpenSubmenuIdx(null), 150);
  }

  function cancelClose() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    left: cx / uiScale,
    top: cy / uiScale,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-alt)',
    borderRadius: 6,
    padding: '4px 0',
    minWidth: MENU_WIDTH,
    zIndex: 9999,
    boxShadow: '0 6px 24px rgba(0,0,0,0.55)',
    fontSize: 13,
    color: 'var(--text-primary)',
    userSelect: 'none',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '5px 14px',
    margin: '0 4px',
    borderRadius: 3,
  };

  return (
    <>
      {isRoot && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
          onMouseDown={(e) => { e.preventDefault(); onClose(); }}
        />
      )}
      <div
        ref={ref}
        role="menu"
        aria-label={t('editor.contextMenuAriaLabel')}
        style={panelStyle}
        onMouseEnter={onPanelEnter}
        onMouseLeave={onPanelLeave}
      >
        {entries.map((entry, i) => {
          if (entry.type === 'divider') {
            return <div key={i} role="separator" style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />;
          }
          if (entry.type === 'header') {
            return (
              <div key={i} role="none" style={{ padding: '5px 14px 2px', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {entry.label}
              </div>
            );
          }
          if (entry.type === 'submenu') {
            const isOpen = openSubmenuIdx === i;
            return (
              <div
                key={i}
                ref={(el) => { itemRefs.current[i] = el; }}
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={isOpen}
                tabIndex={-1}
                style={{ ...rowStyle, cursor: 'pointer', background: isOpen ? 'var(--bg-hover)' : 'transparent' }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)';
                  openSubmenu(i, e.currentTarget as HTMLDivElement);
                }}
                onMouseLeave={(e) => {
                  if (openSubmenuIdx !== i)
                    (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                  scheduleClose();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    openSubmenu(i, e.currentTarget as HTMLDivElement);
                  }
                }}
              >
                <span>{entry.label}</span>
                <span style={{ color: 'var(--text-dim)', fontSize: 10, marginLeft: 24 }}>▶</span>
              </div>
            );
          }
          return (
            <div
              key={i}
              ref={(el) => { itemRefs.current[i] = el; }}
              role="menuitem"
              aria-disabled={entry.disabled}
              tabIndex={-1}
              style={{ ...rowStyle, cursor: entry.disabled ? 'default' : 'pointer', opacity: entry.disabled ? 0.35 : 1 }}
              onMouseDown={(e) => {
                e.preventDefault();
                if (!entry.disabled) { entry.action(); onClose(); }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (!entry.disabled) { entry.action(); onClose(); }
                }
              }}
              onMouseEnter={(e) => {
                if (!entry.disabled)
                  (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)';
                scheduleClose();
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = 'transparent';
              }}
            >
              <span>{entry.label}</span>
              {entry.shortcut && (
                <span style={{ color: 'var(--text-dim)', fontSize: 11, marginLeft: 24 }}>{entry.shortcut}</span>
              )}
            </div>
          );
        })}
      </div>
      {openSubmenuIdx !== null && (() => {
        const entry = entries[openSubmenuIdx];
        if (entry?.type !== 'submenu') return null;
        return (
          <EditorContextMenu
            x={submenuPos.x}
            y={submenuPos.y}
            onClose={onClose}
            entries={entry.entries}
            onPanelEnter={cancelClose}
            onPanelLeave={scheduleClose}
          />
        );
      })()}
    </>
  );
}

export type { MenuEntry };
