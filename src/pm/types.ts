export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done';
export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3';

export interface TaskFrontmatterV1 {
  id: string;
  title: string;
  status: TaskStatus;
  project: string;
  created: string; // ISO-8601
  updated: string; // ISO-8601

  priority?: TaskPriority;
  tags?: string[];
  due?: string; // YYYY-MM-DD or ISO
  estimate?: string;
  links?: Record<string, unknown>;
}

export interface ParsedTaskFile {
  meta: TaskFrontmatterV1;
  body: string; // markdown body (without frontmatter)
  path?: string;
}
