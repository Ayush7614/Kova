// Returns true when the diagram already carries its own Mermaid config at the
// beginning, either via directive syntax (%%{init: ...}%%) or Mermaid YAML
// frontmatter (---\nconfig: ...\n---).
export function hasLeadingMermaidConfig(source: string): boolean {
  const trimmed = source.trimStart();
  if (trimmed.startsWith('%%{')) return true;

  // Mermaid supports YAML frontmatter directly inside mermaid fenced blocks.
  // Detect only when the block starts with a complete --- ... --- section.
  if (!trimmed.startsWith('---')) return false;
  return /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(trimmed);
}
