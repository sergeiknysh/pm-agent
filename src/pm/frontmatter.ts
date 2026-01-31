import yaml from 'js-yaml';

export interface FrontmatterParseResult {
  data: Record<string, unknown>;
  body: string;
}

/**
 * Extracts YAML frontmatter from a Markdown document.
 * Supports:
 * ---\n<yaml>\n---\n<body>
 */
export function parseFrontmatter(markdown: string): FrontmatterParseResult {
  const normalized = markdown.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { data: {}, body: markdown };
  }

  const endIdx = normalized.indexOf('\n---\n', 4);
  if (endIdx === -1) {
    // malformed, treat as no frontmatter
    return { data: {}, body: markdown };
  }

  const yamlText = normalized.slice(4, endIdx);
  const body = normalized.slice(endIdx + '\n---\n'.length);
  const data = (yaml.load(yamlText, { schema: yaml.FAILSAFE_SCHEMA }) ?? {}) as Record<string, unknown>;
  return { data, body };
}

export function stringifyFrontmatter(data: Record<string, unknown>): string {
  // Keep stable diffs: no refs, no line wrapping.
  const yamlText = yaml.dump(data, {
    noRefs: true,
    lineWidth: -1,
    sortKeys: false
  }).trimEnd();
  return `---\n${yamlText}\n---\n`;
}
