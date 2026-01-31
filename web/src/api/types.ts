export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done'

export type TaskIndexItem = {
  id: string
  title: string
  status: TaskStatus
  project: string
  priority: string | null
  due: string | null
  tags: string[]
  updated: string
  path: string
}

export type TaskMeta = {
  id: string
  title: string
  status: TaskStatus
  project: string
  created: string
  updated: string
  priority?: string
  tags?: string[]
  due?: string
  estimate?: string
  links?: Record<string, unknown>
}

export type TaskDetails = {
  meta: TaskMeta
  body: string
  log: string[]
}
