import type { ParsedTaskFile } from './types.js';

export type TaskLogExtract = {
  body: string;
  log: string[];
};

// Extracts a simple "## Log" section from markdown body.
// Convention:
//   ## Log
//   - 2025-01-01T00:00:00.000Z did something
//   - ...
// Section ends at next H2 header ("## ") or EOF.
export function extractTaskLog(body: string): TaskLogExtract {
  const normalized = body.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '## Log') {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    return { body: normalized, log: [] };
  }

  // Find end of section.
  let endIdx = lines.length;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('## ') && t !== '## Log') {
      endIdx = i;
      break;
    }
  }

  const logLines: string[] = [];
  for (let i = headerIdx + 1; i < endIdx; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (t.startsWith('- ')) logLines.push(t.slice(2));
    else logLines.push(t);
  }

  const kept = [...lines.slice(0, headerIdx), ...lines.slice(endIdx)].join('\n');
  const cleaned = kept.replace(/\n{3,}/g, '\n\n');

  return { body: cleaned, log: logLines };
}

export function toTaskDetailsResponse(task: ParsedTaskFile): { meta: ParsedTaskFile['meta']; body: string; log: string[] } {
  const { body, log } = extractTaskLog(task.body);
  return { meta: task.meta, body, log };
}
