import type { PptxParseResult, PptxParsedSlide } from './parsePptx';

// ── Control-syntax escaping ──────────────────────────────────────────────────

// Lines that Kova's pre-parse scanners treat as structural sentinels when a
// trimmed line matches them *exactly* — checked as raw-string comparisons
// before any Markdown parsing happens (markdownToSlides.ts's slide splitter,
// speakerNotes.ts, preprocess()'s column-break handling). PPTX text boxes are
// plain text with no such meaning, so a text box that happens to contain one
// of these verbatim (e.g. a "???" placeholder, or a "---" divider) must not
// be reinterpreted as Kova syntax on import.
const CONTROL_SENTINELS = new Set(['---', '???', '|||']);

// ── General Markdown escaping ────────────────────────────────────────────────
//
// Plain PPTX body text has no Markdown meaning, but Kova's own parser
// (remark + remark-gfm) reparses the generated .md, so a body line starting
// "1. Read this" becomes a real ordered-list item, "# Not a heading" becomes
// an actual heading, and inline `*`/`_`/`` ` ``/`[`/`<` get reinterpreted as
// emphasis/code-spans/links/raw HTML wherever they appear. The three exact
// control sentinels above are Kova's own directive syntax (handled
// separately below); everything else needs general escaping.
//
// Deliberately out of scope: exotic block forms (spaced thematic breaks
// like "- - -", setext "===" heading underlines) — vanishingly rare in real
// slide prose, not worth the complexity.

// Escapes characters significant to remark wherever they occur in a line —
// backslash first, so escaping the rest below can't be double-escaped by a
// later pass over the same text.
function escapeInline(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/([*_`[\]<])/g, '\\$1');
}

// Escapes a block-level marker only when it actually starts the line (up to
// 3 leading spaces, CommonMark's own tolerance) — heading, blockquote,
// ordered-list marker. These have no special meaning mid-line, so unlike
// escapeInline's characters they're only ever escaped here.
function escapeLeadingMarker(line: string): string {
  return line
    .replace(/^(\s{0,3})(#{1,6})(\s|$)/, '$1\\$2$3')
    .replace(/^(\s{0,3})>/, '$1\\>')
    .replace(/^(\s{0,3})(\d+)([.)])(\s|$)/, '$1$2\\$3$4')
    .replace(/^(\s{0,3})([-+])(\s|$)/, '$1\\$2$3');
}

// Escapes arbitrary plain text so it round-trips as literal text.
function escapeMarkdownLine(line: string): string {
  return escapeLeadingMarker(escapeInline(line));
}

// extractTextBody (parsePptx.ts) already injects a Kova '- ' bullet prefix
// (indented per level) for text with real PPTX list formatting (buChar/
// buAutoNum) — that's intentional Kova list syntax, not raw PPTX prose, so
// its marker must survive unescaped; only the text after it needs inline
// protection.
const BULLET_PREFIX_RE = /^(\s*)-\s(.*)$/;

function escapeBodyLine(line: string): string {
  const bullet = line.match(BULLET_PREFIX_RE);
  if (bullet) return `${bullet[1]}- ${escapeInline(bullet[2])}`;
  return escapeControlLine(line);
}

// Backslash-escapes each character of a line that exactly matches a control
// sentinel (preserving any surrounding whitespace as-is). CommonMark treats
// a backslash-escaped ASCII punctuation character as a literal, so e.g.
// '---' -> '\-\-\-' still renders as the visible text "---" but no longer
// trim-equals '---', so it survives the raw-string scanners untouched.
// Anything else falls through to the general escaper above.
function escapeControlLine(line: string): string {
  const trimmed = line.trim();
  if (!CONTROL_SENTINELS.has(trimmed)) return escapeMarkdownLine(line);
  const start = line.indexOf(trimmed);
  return line.slice(0, start) + trimmed.replace(/./g, '\\$&') + line.slice(start + trimmed.length);
}

// ── Table → GFM ──────────────────────────────────────────────────────────────

function tableToGfm(headers: string[], rows: string[][]): string {
  const escape = (s: string) => escapeControlLine(s).replace(/\|/g, '\\|');
  const headerRow = `| ${headers.map(escape).join(' | ')} |`;
  const sepRow    = `| ${headers.map(() => '---').join(' | ')} |`;
  const bodyRows  = rows.map((r) => {
    const cells = [...r];
    while (cells.length < headers.length) cells.push('');
    return `| ${cells.map(escape).join(' | ')} |`;
  }).join('\n');
  return bodyRows ? [headerRow, sepRow, bodyRows].join('\n') : [headerRow, sepRow].join('\n');
}

// ── Single slide → markdown string ───────────────────────────────────────────

function slideToMarkdown(slide: PptxParsedSlide, slideIndex: number): string {
  const { blocks } = slide;

  // Find the primary title block (prefer ctrTitle, then title)
  const ctrTitle = blocks.find((b) => b.kind === 'ctrTitle');
  const titleBlock = ctrTitle ?? blocks.find((b) => b.kind === 'title');
  const bodyBlocks = blocks.filter((b) => b !== titleBlock);

  const lines: string[] = [];

  // ── Title ─────────────────────────────────────────────────────────────────
  if (titleBlock) {
    const level = titleBlock.kind === 'ctrTitle' ? '#' : '##';
    // Inline-only: titleBlock.text lands mid-line after the heading marker
    // above, not at fresh line-start, so only Markdown-significant
    // characters within the text (not leading-marker forms) can corrupt it.
    lines.push(`${level} ${escapeInline(titleBlock.text ?? '')}`);
  }

  // ── Body blocks (sorted by normY already) ─────────────────────────────────
  for (const block of bodyBlocks) {
    if (lines.length > 0) lines.push('');

    switch (block.kind) {
      case 'body': {
        const raw = block.text ?? '';
        if (!raw.trim()) break;

        // If the text block has multiple lines but none start with '- ',
        // we apply the "body placeholder with multiple paragraphs → bullets" heuristic.
        const rawLines = raw.split('\n').filter((l) => l.trim());
        const alreadyBulleted = rawLines.some((l) => /^\s*-\s/.test(l));

        if (!alreadyBulleted && rawLines.length > 1) {
          // Multi-paragraph body: convert each non-empty line to a bullet.
          // Full escaping (inline + leading-marker) of each line's own
          // content, since we're wrapping it fresh — a leading '#'/'>'/list
          // marker here would otherwise become *nested* block syntax inside
          // the new list item, not just inert text.
          lines.push(...rawLines.map((l) => `- ${escapeMarkdownLine(l.trim())}`));
        } else {
          // Single paragraph, or already using Kova's own '- ' bullet prefix
          // (escapeBodyLine preserves that marker, only protecting the text
          // after it — see BULLET_PREFIX_RE above).
          lines.push(raw.split('\n').map(escapeBodyLine).join('\n'));
        }
        break;
      }

      case 'image':
        lines.push(`![](${block.assetFilename})`);
        break;

      case 'table':
        lines.push(tableToGfm(block.headers ?? [], block.rows ?? []));
        break;

      default:
        break;
    }
  }

  // Empty slide: just emit a comment so the slide delimiter has content
  if (lines.length === 0) {
    lines.push(`<!-- slide ${slideIndex + 1} -->`);
  }

  // Append speaker notes using Kova's ??? delimiter
  if (slide.speakerNotes.trim()) {
    lines.push('', '???', '', slide.speakerNotes.trim());
  }

  return lines.join('\n');
}

// ── Frontmatter ───────────────────────────────────────────────────────────────

function makeFrontmatter(title: string): string {
  const year = new Date().getFullYear();
  const escapedTitle = title.replace(/"/g, '\\"');
  return `---
title: "${escapedTitle || 'Imported Presentation'}"
date: ${year}
# theme: add your Kova theme here
# Imported from PPTX — review and adjust layouts as needed
---`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function pptxToMarkdown(result: PptxParseResult): string {
  const { slides, presentationTitle } = result;

  const slideMarkdowns = slides.map((slide, i) => slideToMarkdown(slide, i));

  const body = slideMarkdowns.join('\n\n---\n\n');
  const fm   = makeFrontmatter(presentationTitle);

  return `${fm}\n\n${body}\n`;
}
