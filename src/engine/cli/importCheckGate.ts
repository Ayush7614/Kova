import { collectDiagnostics, formatCheckReport, type CheckContext } from '../parser/diagnostics';

/** Result of optionally gating an import write with `kova --check`. */
export type ImportCheckGate =
  | { enabled: false }
  | { enabled: true; report: string; errors: number };

/**
 * When `--check` is paired with `--import`, validate markdown content before
 * writing the output file (issue #178). Returns a report for stdout and an
 * error count; callers must skip the write and exit 1 when `errors > 0`.
 */
export async function evaluateImportCheck(
  check: boolean,
  content: string,
  fileLabel: string,
  ctx: CheckContext,
): Promise<ImportCheckGate> {
  if (!check) return { enabled: false };
  const diags = await collectDiagnostics(content, ctx);
  const { report, errors } = formatCheckReport(fileLabel, diags);
  return { enabled: true, report, errors };
}
