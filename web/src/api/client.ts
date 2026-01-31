import type { TaskIndexItem, TaskStatus } from './types'
import { apiFetch, readErrorBody } from './apiFetch'

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
