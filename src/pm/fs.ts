import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readText(p: string): Promise<string> {
  return await fs.readFile(p, 'utf8');
}

/**
 * Atomic-ish write for local filesystem:
 * - write to a temp file in the same directory
 * - fsync the file
 * - rename over the destination
 *
 * NOTE: This is intended for local dev on a single machine.
 */
export async function writeTextAtomic(p: string, content: string): Promise<void> {
  const dir = path.dirname(p);
  await ensureDir(dir);

  const tmp = path.join(dir, `.${path.basename(p)}.${process.pid}.${Date.now()}.tmp`);

  const fh = await fs.open(tmp, 'w');
  try {
    await fh.writeFile(content, 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }

  await fs.rename(tmp, p);
}

export async function writeText(p: string, content: string): Promise<void> {
  // Default to atomic writes to avoid partially-written markdown/frontmatter.
  await writeTextAtomic(p, content);
}

export async function walkFiles(rootDir: string, predicate?: (absPath: string) => boolean): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(abs);
      } else if (ent.isFile()) {
        if (!predicate || predicate(abs)) out.push(abs);
      }
    }
  }
  await walk(rootDir);
  return out;
}
