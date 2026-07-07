/** Marp-compatible slide background image line: `![bg left:40%](path.jpg)`. */
const BG_LINE = /^!\[bg([^\]]*)\]\(\s*([^)]+?)\s*\)\s*$/;

export interface ParsedBgImage {
  src: string;
  side?: 'left' | 'right';
  size: 'cover' | 'contain';
}

export function parseBgLine(line: string): ParsedBgImage | null {
  const trimmed = line.trim();
  const m = trimmed.match(BG_LINE);
  if (!m) return null;

  const mods = m[1].toLowerCase();
  const side = /\bleft\b/.test(mods) ? 'left' as const
    : /\bright\b/.test(mods) ? 'right' as const
    : undefined;
  const size = /\b(contain|fit)\b/.test(mods) ? 'contain' as const : 'cover' as const;

  return { src: m[2].trim(), side, size };
}

/** Strip standalone `![bg…](…)` lines from slide raw text (first wins). */
export function extractBgImage(raw: string): { body: string; bg: ParsedBgImage | null } {
  let bg: ParsedBgImage | null = null;
  let inFence = false;
  const out: string[] = [];

  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (/^(`{3,}|~{3,})/.test(t)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (!inFence) {
      const parsed = parseBgLine(t);
      if (parsed) {
        if (!bg) bg = parsed;
        continue;
      }
    }
    out.push(line);
  }

  return { body: out.join('\n').trim(), bg };
}
