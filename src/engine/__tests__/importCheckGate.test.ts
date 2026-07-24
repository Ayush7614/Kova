import { describe, it, expect } from 'vitest';
import { evaluateImportCheck } from '../cli/importCheckGate';
import type { CheckContext } from '../parser/diagnostics';

const ctx = (overrides: Partial<CheckContext> = {}): CheckContext => ({
  docDir: '/deck',
  themeIds: ['light', 'dark'],
  fileExists: async () => true,
  ...overrides,
});

const CLEAN = `---
title: Test
theme: dark
---

# Slide
`;

const BAD = `---
title: Test
---

<!-- layout: not-a-real-layout -->

# Slide
`;

describe('evaluateImportCheck (issue #178)', () => {
  it('is a no-op when --check is off', async () => {
    const result = await evaluateImportCheck(false, BAD, 'in.md', ctx());
    expect(result).toEqual({ enabled: false });
  });

  it('reports a clean document with zero errors', async () => {
    const result = await evaluateImportCheck(true, CLEAN, 'in.md', ctx());
    expect(result.enabled).toBe(true);
    if (!result.enabled) return;
    expect(result.errors).toBe(0);
    expect(result.report).toContain('0 error(s)');
  });

  it('surfaces errors so the caller can skip the write', async () => {
    const result = await evaluateImportCheck(true, BAD, '/deck/in.md', ctx());
    expect(result.enabled).toBe(true);
    if (!result.enabled) return;
    expect(result.errors).toBeGreaterThan(0);
    expect(result.report).toContain('unknown layout');
    expect(result.report).toContain('/deck/in.md');
  });
});
