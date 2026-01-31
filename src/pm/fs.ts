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

export async function writeText(p: string, content: string): Promise<void> {
  await ensureDir(path.dirname(p));
  await fs.writeFile(p, content, 'utf8');
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
