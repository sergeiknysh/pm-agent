import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { TaskIndexItem, TaskStatus } from '../api/types'
import { fetchIndex, setTaskStatus } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { navigate } from './router'
import { KanbanColumn } from './KanbanColumn'
import { TaskCard } from './TaskCard'

const STATUSES: { key: TaskStatus; label: string }[] = [
  { key: 'todo', label: 'To Do' },
  { key: 'doing', label: 'Doing' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'done', label: 'Done' },
]

function statusLabel(s: TaskStatus): string {
  return STATUSES.find((x) => x.key === s)?.label ?? s
}

export function App() {
  const { state: authState, logout } = useAuth()

  const [items, setItems] = useState<TaskIndexItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  const [project, setProject] = useState<string>('all')
  const [query, setQuery] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
  )

  async function reload() {
    setLoading(true)
    setError(null)
    try {
      const ctrl = new AbortController()
      const data = await fetchIndex(ctrl.signal)
      setItems(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setItems(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const projects = useMemo(() => {
    const set = new Set((items ?? []).map((t) => t.project).filter(Boolean))
    return ['all', ...Array.from(set).sort()]
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (items ?? []).filter((t) => {
      if (project !== 'all' && t.project !== project) return false
      if (!q) return true
      const hay = `${t.id} ${t.title} ${t.project} ${(t.tags ?? []).join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
  }, [items, project, query])

  const byStatus = useMemo(() => {
    const map: Record<TaskStatus, TaskIndexItem[]> = {
      todo: [],
      doing: [],
      blocked: [],
      done: [],
    }
    for (const t of filtered) map[t.status].push(t)
    for (const s of Object.keys(map) as TaskStatus[]) {
      map[s].sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''))
    }
    return map
  }, [filtered])

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const id = String(e.active.id)
    const overId = e.over?.id ? String(e.over.id) : null

    if (!overId) return

    const newStatus = overId as TaskStatus
    if (!['todo', 'doing', 'blocked', 'done'].includes(newStatus)) return

    const current = (items ?? []).find((t) => t.id === id)
    if (!current) return
    const oldStatus = current.status
    if (oldStatus === newStatus) return

    // optimistic update
    setItems((prev) =>
      (prev ?? []).map((t) => (t.id === id ? { ...t, status: newStatus } : t)),
    )

    try {
      await setTaskStatus(id, newStatus)
      // best-effort refresh to sync timestamps/ordering
      void reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      // rollback
      setItems((prev) =>
        (prev ?? []).map((t) => (t.id === id ? { ...t, status: oldStatus } : t)),
      )
    }
  }

  const activeTask = useMemo(
    () => (activeId && items ? items.find((t) => t.id === activeId) ?? null : null),
    [activeId, items],
  )

  async function onLogout() {
    try {
      await logout()
    } finally {
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">PM Kanban</div>
        <div className="controls">
          <label className="control">
            <span>Project</span>
            <select value={project} onChange={(e) => setProject(e.target.value)}>
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="control grow">
            <span>Search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="title, id, tag…"
            />
          </label>

          <button className="btn" onClick={() => void reload()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>

          <div style={{ color: 'rgba(231, 236, 255, 0.75)', fontSize: 12, paddingBottom: 2 }}>
            {authState.status === 'authed' ? authState.user.username : ''}
          </div>

          <button className="btn" onClick={() => void onLogout()} disabled={loading}>
            Logout
          </button>
        </div>
      </header>

      {error ? (
        <div className="error">
          <div className="error-title">Error</div>
          <pre className="error-body">{error}</pre>
        </div>
      ) : null}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <main className="board">
          {STATUSES.map((s) => (
            <KanbanColumn
              key={s.key}
              id={s.key}
              title={s.label}
              count={byStatus[s.key].length}
            >
              {byStatus[s.key].map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
            </KanbanColumn>
          ))}
        </main>

        <DragOverlay>
          {activeTask ? (
            <div className="drag-overlay-card">
              <div className="task-title">{activeTask.title}</div>
              <div className="task-meta">
                <span className="pill">{activeTask.id}</span>
                <span className="pill">{activeTask.project}</span>
                <span className="pill">{statusLabel(activeTask.status)}</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
