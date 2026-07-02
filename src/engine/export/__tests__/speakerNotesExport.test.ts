import { describe, it, expect } from 'vitest';
import { buildSpeakerNotesMarkdown } from '../speakerNotesExport';
import type { Slide } from '../../types';

const base = (over: Partial<Slide>): Slide => ({
  index: 0,
  raw: '',
  title: '',
  titleLevel: 0,
  elements: [],
  speakerNotes: '',
  references: [],
  layout: 'blank',
  hidden: false,
  ...over,
});

describe('buildSpeakerNotesMarkdown', () => {
  it('formats titled slides with notes separated by ---', () => {
    const md = buildSpeakerNotesMarkdown([
      base({ title: 'Intro', speakerNotes: 'Welcome everyone.' }),
      base({ title: 'Agenda', speakerNotes: 'Three topics today.' }),
    ]);
    expect(md).toBe(
      '# Intro\n\nWelcome everyone.\n\n---\n\n# Agenda\n\nThree topics today.\n',
    );
  });

  it('falls back to Slide N when a slide has no title', () => {
    const md = buildSpeakerNotesMarkdown([
      base({ speakerNotes: 'No heading on this one.' }),
    ]);
    expect(md).toBe('# Slide 1\n\nNo heading on this one.\n');
  });
});
