import type { TaskDetails, TaskIndexItem, TaskStatus } from './types'
import { apiFetch, readErrorBody } from './apiFetch'

export type CreateTaskInput = {
  project: string
  title: string
  priority?: string
  due?: string
  tags?: string[]
  estimate?: string
  body?: string
}

export async function fetchIndex(signal?: AbortSignal): Promise<TaskIndexItem[]> {
  const res = await apiFetch('/api/index', { signal })
  if (!res.ok) throw new Error(`GET /api/index failed: ${res.status}`)
  return (await res.json()) as TaskIndexItem[]
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<void> {
  const res = await apiFetch(`/api/task/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (!res.ok) {
    const msg = await readErrorBody(res)
    throw new Error(`POST /api/task/${id}/status failed: ${res.status}${msg ? ` ${msg}` : ''}`)
  }
}

export async function fetchTask(id: string, signal?: AbortSignal): Promise<TaskDetails> {
  const res = await apiFetch(`/api/task/${encodeURIComponent(id)}`, { signal })
  if (!res.ok) {
    const msg = await readErrorBody(res)
    throw new Error(`GET /api/task/${id} failed: ${res.status}${msg ? ` ${msg}` : ''}`)
  }
  const data = (await res.json()) as any
  return data.task as TaskDetails
}

export async function appendTaskLog(id: string, entry: string): Promise<TaskDetails> {
  const res = await apiFetch(`/api/task/${encodeURIComponent(id)}/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry }),
  })
  if (!res.ok) {
    const msg = await readErrorBody(res)
    throw new Error(`POST /api/task/${id}/log failed: ${res.status}${msg ? ` ${msg}` : ''}`)
  }
  const data = (await res.json()) as any
  return data.task as TaskDetails
}

export async function createTask(input: CreateTaskInput): Promise<{ id: string }> {
  const res = await apiFetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const msg = await readErrorBody(res)
    throw new Error(`POST /api/tasks failed: ${res.status}${msg ? ` ${msg}` : ''}`)
  }
  const data = (await res.json()) as any
  return { id: String(data?.task?.id ?? '') }
}

export type TaskPatch = {
  title?: string
  status?: TaskStatus
  priority?: string | null
  due?: string | null
  tags?: string[]
}

/** PATCH task meta. On 404/5xx the thrown error message is used for conflict/reload UI. */
export async function patchTask(id: string, patch: TaskPatch): Promise<TaskDetails['meta']> {
  const res = await apiFetch(`/api/task/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    const msg = await readErrorBody(res)
    throw new Error(`PATCH /api/task/${id} failed: ${res.status}${msg ? ` ${msg}` : ''}`)
  }
  const data = (await res.json()) as any
  return data.task as TaskDetails['meta']
}
