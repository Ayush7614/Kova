import type { ReactNode } from 'react';

// Virtual slide width every overlay scales from (matches ThumbnailPanel).
export const SLIDE_W = 960;

// Elapsed time as mm:ss, or h:mm:ss once past an hour.
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Elapsed clock, or countdown with a warning flag in the final minute. */
export function timerDisplay(elapsed: number, countdownMinutes: number): { text: string; warning: boolean } {
  if (countdownMinutes <= 0) {
    return { text: formatTime(elapsed), warning: false };
  }
  const remaining = Math.max(0, countdownMinutes * 60 - elapsed);
  return { text: formatTime(remaining), warning: remaining <= 60 };
}

// The 960px virtual slide scaled to fill its measured frame.
export function ScaledSlideBox({ scale, slideH, children }: { scale: number; slideH: number; children: ReactNode }) {
  return (
    <div style={{ width: SLIDE_W, height: slideH, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
      {children}
    </div>
  );
}

// Glowing laser-pointer dot positioned by fractional x/y within its frame.
export function LaserDot({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <div
      className="pres-laser-dot"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        background: color,
        boxShadow: `0 0 6px 2px ${color}b3, 0 0 16px 5px ${color}4d`,
      }}
    />
  );
}
