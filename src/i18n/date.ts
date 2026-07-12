import { resolveIntlLocale } from './locales';

// Fallback for decks with no frontmatter `date:` — used to be a hardcoded
// ISO string (issue #55 fallback was flagged as unfriendly for non-technical
// readers). Uses the locale's own field order *and* separator (e.g.
// MM/DD/YYYY for en-US, DD.MM.YYYY for de) rather than a fixed "-", since an
// earlier fix that kept only the field order but hardcoded "-" still showed
// the wrong separator for German (issue #55 follow-up).
export function formatFallbackDate(locale: string, date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
