import { describe, it, expect } from 'vitest';
import { parseChannels, buildExportMermaidInit } from '../export/mermaidExportTheme';
import { DEFAULT_THEME } from '../theme';

describe('parseChannels', () => {
  it('parses a 6-character hex string into RGB components', () => {
    expect(parseChannels('FF8040')).toEqual([255, 128, 64]);
    expect(parseChannels('000000')).toEqual([0, 0, 0]);
  });
});

describe('buildExportMermaidInit', () => {
  it('emits a mermaid init pragma with base theme variables from the slide theme', () => {
    const init = buildExportMermaidInit(DEFAULT_THEME);
    expect(init).toMatch(/^%%\{init: /);
    expect(init).toContain('"theme":"base"');
    expect(init).toContain(DEFAULT_THEME.colors.primary);
    expect(init).toContain(DEFAULT_THEME.colors.background);
    expect(init).toContain('"fontFamily"');
    expect(init).toContain('"xyChart"');
  });

  // Regression test: this function used to omit the top-level fontFamily key
  // (only setting it inside themeVariables), a drift from the live preview's
  // copy of this same builder that could make exported diagrams render in a
  // different font than what the user saw in the app. Parses the JSON out of
  // the pragma and asserts on the object directly — a substring match like
  // the assertion above would pass either way, since themeVariables.fontFamily
  // always contained the string "fontFamily" regardless of the top-level key.
  it('sets fontFamily on the top-level config object, not just themeVariables', () => {
    const init = buildExportMermaidInit(DEFAULT_THEME);
    const jsonStr = init.replace(/^%%\{init:\s*/, '').replace(/\}%%\n?$/, '');
    const config = JSON.parse(jsonStr) as { fontFamily?: string; themeVariables?: { fontFamily?: string } };
    expect(config.fontFamily).toBeTruthy();
    expect(config.themeVariables?.fontFamily).toBe(config.fontFamily);
  });

  it('uses chart_colors from the theme when provided', () => {
    const theme = {
      ...DEFAULT_THEME,
      colors: {
        ...DEFAULT_THEME.colors,
        chart_colors: ['#111111', '#222222', '#333333'],
      },
    };
    const init = buildExportMermaidInit(theme);
    expect(init).toContain('#111111');
    expect(init).toContain('#222222');
    expect(init).toContain('#333333');
  });
});
