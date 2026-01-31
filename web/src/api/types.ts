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
