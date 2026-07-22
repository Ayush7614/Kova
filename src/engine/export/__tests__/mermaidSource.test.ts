import { describe, it, expect } from 'vitest';
import { buildMermaidRenderSource, hasLeadingMermaidConfig, sanitizeMermaidSource } from '../mermaidSource';

describe('hasLeadingMermaidConfig', () => {
  it('detects %% init config', () => {
    const src = '%%{init: {"theme":"base"}}%%\ngraph TD\nA-->B\n';
    expect(hasLeadingMermaidConfig(src)).toBe(true);
  });

  it('detects yaml frontmatter config at start', () => {
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
});

describe('sanitizeMermaidSource', () => {
  it('strips securityLevel from %% init pragma', () => {
    const src = '%%{init: {"theme":"base","securityLevel":"loose"}}%%\ngraph TD\nA-->B\n';
    const out = sanitizeMermaidSource(src);
    expect(out).not.toContain('securityLevel');
    expect(out).toContain('"theme":"base"');
  });

  it('strips securityLevel from yaml frontmatter config', () => {
    const src = [
      '---',
      'config:',
      '  securityLevel: loose',
      '  theme: base',
      '  gitGraph:',
      '    mainBranchName: releases/ESME/26.1',
      '---',
      'gitGraph',
      '  commit',
    ].join('\n');
    const out = sanitizeMermaidSource(src);
    expect(out).not.toContain('securityLevel');
    expect(out).toContain('config:');
    expect(out).toContain('theme: base');
    expect(out).toContain('gitGraph');
    expect(out).toContain('mainBranchName: releases/ESME/26.1');
  });
});

describe('buildMermaidRenderSource', () => {
  const init = '%%{init: {"theme":"base"}}%%\n';

  it('prepends fallback init when no leading config exists', () => {
    const src = 'graph TD\nA-->B\n';
    const out = buildMermaidRenderSource(src, init);
    expect(out.startsWith(init)).toBe(true);
  });

  it('does not prepend fallback init when yaml frontmatter exists', () => {
    const src = [
      '---',
      'config:',
      '  theme: base',
      '---',
      'graph TD',
      'A-->B',
    ].join('\n');
    const out = buildMermaidRenderSource(src, init);
    expect(out.startsWith(init)).toBe(false);
    expect(out.startsWith('---\n')).toBe(true);
  });
});
