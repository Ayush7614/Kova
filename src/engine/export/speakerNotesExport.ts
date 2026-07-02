import type { Slide } from '../types';

/** One `# title` + notes block per slide, separated by `---`. */
export function buildSpeakerNotesMarkdown(slides: Slide[]): string {
  return slides.map((s, i) => {
    const title = s.title || `Slide ${i + 1}`;
    return `# ${title}\n\n${s.speakerNotes.trim()}`;
  }).join('\n\n---\n\n') + '\n';
}
