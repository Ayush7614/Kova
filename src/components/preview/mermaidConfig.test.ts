import { describe, it, expect } from 'vitest';
import { hasLeadingMermaidConfig } from './mermaidConfig';

describe('hasLeadingMermaidConfig', () => {
  it('detects %% init config', () => {
    const src = '%%{init: {"theme":"base"}}%%\ngraph TD\nA-->B\n';
    expect(hasLeadingMermaidConfig(src)).toBe(true);
  });

  it('detects yaml frontmatter config at the start of mermaid source', () => {
    const src = [
      '---',
      'config:',
      '  theme: base',
      '  gitGraph:',
      '    mainBranchName: releases/ESME/26.1',
      '---',
      'gitGraph',
      '  commit',
    ].join('\n');
    expect(hasLeadingMermaidConfig(src)).toBe(true);
  });

  it('does not treat plain mermaid body as configured', () => {
    const src = 'gitGraph\n  commit\n  branch foo\n';
    expect(hasLeadingMermaidConfig(src)).toBe(false);
  });
});
