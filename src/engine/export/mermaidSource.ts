import yaml from 'js-yaml';

const INIT_PRAGMA_RE = /^(%%\{init:\s*)(\{[\s\S]*?\})(\s*\}%%)(\r?\n)?/m;
const YAML_FM_RE = /^(---\r?\n)([\s\S]*?)(\r?\n---)(\r?\n|$)([\s\S]*)$/;

export function hasLeadingMermaidConfig(source: string): boolean {
  const trimmed = source.trimStart();
  if (trimmed.startsWith('%%{')) return true;
  if (!trimmed.startsWith('---')) return false;
  return /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(trimmed);
}

function stripSecurityLevelFromInitPragma(source: string): string {
  return source.replace(INIT_PRAGMA_RE, (match, prefix, jsonStr, suffix, nl) => {
    try {
      const config = JSON.parse(jsonStr) as Record<string, unknown>;
      delete config.securityLevel;
      return `${prefix}${JSON.stringify(config)}${suffix}${nl ?? '\n'}`;
    } catch {
      return match;
    }
  });
}

function stripSecurityLevelFromYamlFrontmatter(source: string): string {
  const trimmed = source.trimStart();
  if (!trimmed.startsWith('---')) return source;

  const leadingWsLen = source.length - trimmed.length;
  const leadingWs = source.slice(0, leadingWsLen);
  const match = trimmed.match(YAML_FM_RE);
  if (!match) return source;

  const [, open, yamlBody, close, sep, rest] = match;

  try {
    const parsed = yaml.load(yamlBody, { schema: yaml.CORE_SCHEMA });
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return source;

    const root = parsed as Record<string, unknown>;
    let changed = false;

    if ('securityLevel' in root) {
      delete root.securityLevel;
      changed = true;
    }

    const cfg = root.config;
    if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) {
      const cfgRec = cfg as Record<string, unknown>;
      if ('securityLevel' in cfgRec) {
        delete cfgRec.securityLevel;
        changed = true;
      }
    }

    if (!changed) return source;

    const dumped = yaml.dump(root, { lineWidth: -1, quotingType: '"' }).trimEnd();
    return `${leadingWs}${open}${dumped}${close}${sep}${rest}`;
  } catch {
    return source;
  }
}

// Enforce application-level Mermaid security policy by removing user-provided
// securityLevel overrides from both config forms.
export function sanitizeMermaidSource(source: string): string {
  const normalised = source.replace(/\\n/g, '<br/>');
  const noInitSecurity = stripSecurityLevelFromInitPragma(normalised);
  return stripSecurityLevelFromYamlFrontmatter(noInitSecurity);
}

export function buildMermaidRenderSource(source: string, fallbackInit: string): string {
  const sanitized = sanitizeMermaidSource(source);
  return hasLeadingMermaidConfig(sanitized) ? sanitized : fallbackInit + sanitized;
}
