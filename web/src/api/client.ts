import type { TaskIndexItem, TaskStatus } from './types'

export async function fetchIndex(signal?: AbortSignal): Promise<TaskIndexItem[]> {
  const res = await fetch('/api/index', { signal })
  if (!res.ok) throw new Error(`GET /api/index failed: ${res.status}`)
  return (await res.json()) as TaskIndexItem[]
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<void> {
  const res = await fetch(`/api/task/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`POST /api/task/${id}/status failed: ${res.status} ${text}`)
  }
}
