// Mirrors PendingCli / ThemeArg in src-tauri/src/cli.rs (serde-serialised,
// drained once via the take_pending_cli command). Keep the two in sync.

export type CliThemeArg =
  | { type: 'named'; name: string }
  | { type: 'path'; path: string };

export interface PendingCli {
  /** Canonicalised absolute path to present (`kova --present FILE`). */
  present: string | null;
  /** `--theme` override; applied in place of the deck's frontmatter theme. */
  theme: CliThemeArg | null;
  /** `--check` given as a modifier: validate before running the action. */
  check: boolean;
  /** Canonicalised absolute path for standalone `kova --check FILE`. */
  check_only: string | null;
}
