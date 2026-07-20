// Mirrors PendingCli / ThemeArg in src-tauri/src/cli.rs (serde-serialised,
// drained once via the take_pending_cli command). Keep the two in sync.

export type CliThemeArg =
  | { type: 'named'; name: string }
  | { type: 'path'; path: string };

export type CliImportFormat = 'marp' | 'pptx' | 'url';

export interface PendingImport {
  format: CliImportFormat;
  /** Canonicalised path for marp/pptx; the raw URL, unchanged, for url. */
  input: string;
  /** Absolute path — not required to exist yet, it's the file being written. */
  output: string;
}

export interface PendingCli {
  /** Canonicalised absolute path to present (`kova --present FILE`). */
  present: string | null;
  /** `--theme` override; applied in place of the deck's frontmatter theme. */
  theme: CliThemeArg | null;
  /** `--check` given as a modifier: validate before running the action. */
  check: boolean;
  /** Canonicalised absolute path for standalone `kova --check FILE`. */
  check_only: string | null;
  /** `kova --import marp|pptx|url IN OUT`. */
  import: PendingImport | null;
}
