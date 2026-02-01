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
import type { TaskDetails, TaskIndexItem, TaskStatus } from '../api/types'
import { createTask, fetchIndex, setTaskStatus, patchTask, fetchTask, appendTaskLog, type CreateTaskInput, type TaskPatch } from '../api/client'
import { createProject, deleteProject, fetchProjects } from '../api/projects'
import { useAuth } from '../auth/AuthContext'
import { navigate } from './router'
import { KanbanColumn } from './KanbanColumn'
import { TaskCard } from './TaskCard'
import { TaskDetailsModal } from './TaskDetailsModal'

const STATUSES: { key: TaskStatus; label: string }[] = [
  { key: 'todo', label: 'To Do' },
  { key: 'doing', label: 'Doing' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'done', label: 'Done' },
]

function statusLabel(s: TaskStatus): string {
  return STATUSES.find((x) => x.key === s)?.label ?? s
}

function buildNodeId(task: TaskIndexItem): string {
  return `${task.project}::${task.id}`
}

function parseNodeId(nodeId: string): { project: string; id: string } {
  const parts = nodeId.split('::')
  const id = parts.slice(-1)[0] ?? nodeId
  const project = parts.slice(0, -1).join('::')
  return { project, id }
}

export function App() {
  const { state: authState, logout } = useAuth()

  const [items, setItems] = useState<TaskIndexItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)

  // Task details modal state
  const [selectedTask, setSelectedTask] = useState<TaskIndexItem | null>(null)
  const [taskDetails, setTaskDetails] = useState<TaskDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)

  const [project, setProject] = useState<string>('all')
  const [query, setQuery] = useState('')

  const [projectList, setProjectList] = useState<string[] | null>(null)
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const isAdmin = authState.status === 'authed' && authState.user.roles.includes('admin')

  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [newTask, setNewTask] = useState<CreateTaskInput>({ project: '', title: '' })
  const [newTaskSubmitting, setNewTaskSubmitting] = useState(false)

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
      const [data, projects] = await Promise.all([fetchIndex(ctrl.signal), fetchProjects(ctrl.signal)])
      setItems(data)
      setProjectList(projects)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setItems(null)
      setProjectList(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch full task details when a task is selected
  useEffect(() => {
    if (!selectedTask) {
      setTaskDetails(null)
      setDetailsError(null)
      return
    }

    let cancelled = false
    const ctrl = new AbortController()

    async function loadDetails() {
      setDetailsLoading(true)
      setDetailsError(null)
      try {
        const details = await fetchTask(selectedTask!.id, ctrl.signal)
        if (!cancelled) {
          setTaskDetails(details)
        }
      } catch (e) {
        if (!cancelled) {
          setDetailsError(e instanceof Error ? e.message : String(e))
        }
      } finally {
        if (!cancelled) {
          setDetailsLoading(false)
        }
      }
    }

    void loadDetails()

    return () => {
      cancelled = true
      ctrl.abort()
    }
  }, [selectedTask])

  const projects = useMemo(() => {
    const fromTasks = new Set((items ?? []).map((t) => t.project).filter(Boolean))
    const fromApi = new Set((projectList ?? []).filter(Boolean))
    const set = new Set<string>([...Array.from(fromTasks), ...Array.from(fromApi)])
    return ['all', ...Array.from(set).sort()]
  }, [items, projectList])

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
    setActiveNodeId(String(e.active.id))
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveNodeId(null)
    const activeId = String(e.active.id)
    const overId = e.over?.id ? String(e.over.id) : null

    if (!overId) return

    const newStatus = overId as TaskStatus
    if (!['todo', 'doing', 'blocked', 'done'].includes(newStatus)) return

    const { project: activeProject, id } = parseNodeId(activeId)
    const current = (items ?? []).find((t) => t.id === id && t.project === activeProject)
    if (!current) return
    const oldStatus = current.status
    if (oldStatus === newStatus) return

    // optimistic update
    setItems((prev) =>
      (prev ?? []).map((t) =>
        t.id === id && t.project === activeProject ? { ...t, status: newStatus } : t,
      ),
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

  const activeTask = useMemo(() => {
    if (!activeNodeId || !items) return null
    const { project, id } = parseNodeId(activeNodeId)
    return items.find((t) => t.id === id && t.project === project) ?? null
  }, [activeNodeId, items])

  // Optimistic update for index; modal refetches details after save.
  async function patchTaskOptimistic(id: string, patch: TaskPatch) {
    const prevItems = items
    const nowIso = new Date().toISOString()
    setItems((prev) =>
      (prev ?? []).map((t) => {
        if (t.id !== id) return t
        return {
          ...t,
          ...(patch.title !== undefined ? { title: patch.title } : null),
          ...(patch.status !== undefined ? { status: patch.status } : null),
          ...(patch.priority !== undefined ? { priority: patch.priority } : null),
          ...(patch.due !== undefined ? { due: patch.due } : null),
          ...(patch.tags !== undefined ? { tags: patch.tags } : null),
          updated: nowIso,
        }
      }),
    )
    // Also update selectedTask if it's the same task
    if (selectedTask && selectedTask.id === id) {
      setSelectedTask((prev) =>
        prev
          ? {
              ...prev,
              ...(patch.title !== undefined ? { title: patch.title } : null),
              ...(patch.status !== undefined ? { status: patch.status } : null),
              ...(patch.priority !== undefined ? { priority: patch.priority } : null),
              ...(patch.due !== undefined ? { due: patch.due } : null),
              ...(patch.tags !== undefined ? { tags: patch.tags } : null),
              updated: nowIso,
            }
          : null,
      )
    }
    try {
      await patchTask(id, patch)
      void reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setItems(prevItems)
      throw err
    }
  }

  // Append log entry and refresh details
  async function handleAppendLog(id: string, entry: string) {
    const updated = await appendTaskLog(id, entry)
    setTaskDetails(updated)
    void reload()
  }

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

          <button
            className="btn"
            onClick={() => {
              const defaultProject =
                project !== 'all' ? project : (projectList ?? projects.filter((p) => p !== 'all'))[0] ?? ''
              setNewTask({ project: defaultProject, title: '', priority: '', due: '', tags: [], estimate: '', body: '' })
              setNewTaskOpen(true)
            }}
            disabled={loading}
          >
            New Task
          </button>

          {isAdmin ? (
            <button className="btn" onClick={() => setProjectsOpen(true)} disabled={loading}>
              Manage…
            </button>
          ) : null}

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

      {newTaskOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => (newTaskSubmitting ? null : setNewTaskOpen(false))}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 60,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(820px, 100%)',
              background: 'rgba(20, 24, 38, 0.98)',
              border: '1px solid rgba(231, 236, 255, 0.12)',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>New Task</div>
              <button className="btn" onClick={() => setNewTaskOpen(false)} disabled={newTaskSubmitting}>
                Close
              </button>
            </div>

            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label className="control">
                <span>Project</span>
                <select
                  value={newTask.project}
                  onChange={(e) => setNewTask((p) => ({ ...p, project: e.target.value }))}
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {(projectList ?? projects.filter((p) => p !== 'all'))
                    .filter((p) => p !== 'all')
                    .map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                </select>
              </label>

              <label className="control">
                <span>Priority</span>
                <select
                  value={newTask.priority ?? ''}
                  onChange={(e) => setNewTask((p) => ({ ...p, priority: e.target.value }))}
                >
                  <option value="">—</option>
                  <option value="P0">P0</option>
                  <option value="P1">P1</option>
                  <option value="P2">P2</option>
                  <option value="P3">P3</option>
                </select>
              </label>

              <label className="control" style={{ gridColumn: '1 / -1' }}>
                <span>Title</span>
                <input
                  value={newTask.title}
                  onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
                  placeholder="What needs to be done?"
                  autoFocus
                />
              </label>

              <label className="control">
                <span>Due</span>
                <input
                  type="date"
                  value={newTask.due ?? ''}
                  onChange={(e) => setNewTask((p) => ({ ...p, due: e.target.value }))}
                />
              </label>

              <label className="control">
                <span>Estimate</span>
                <input
                  value={newTask.estimate ?? ''}
                  onChange={(e) => setNewTask((p) => ({ ...p, estimate: e.target.value }))}
                  placeholder="e.g. 2h, 1d"
                />
              </label>

              <label className="control" style={{ gridColumn: '1 / -1' }}>
                <span>Tags (comma-separated)</span>
                <input
                  value={(newTask.tags ?? []).join(', ')}
                  onChange={(e) =>
                    setNewTask((p) => ({
                      ...p,
                      tags: e.target.value
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean),
                    }))
                  }
                  placeholder="backend, ui, urgent"
                />
              </label>

              <label className="control" style={{ gridColumn: '1 / -1' }}>
                <span>Body (optional, markdown)</span>
                <textarea
                  value={newTask.body ?? ''}
                  onChange={(e) => setNewTask((p) => ({ ...p, body: e.target.value }))}
                  placeholder="## Context\n\n..."
                  rows={8}
                />
              </label>
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className="btn"
                disabled={newTaskSubmitting}
                onClick={async () => {
                  try {
                    const project = (newTask.project ?? '').trim()
                    const title = (newTask.title ?? '').trim()
                    if (!project || !title) return

                    setNewTaskSubmitting(true)
                    await createTask({
                      project,
                      title,
                      priority: newTask.priority?.trim() || undefined,
                      due: newTask.due?.trim() || undefined,
                      tags: newTask.tags?.length ? newTask.tags : undefined,
                      estimate: newTask.estimate?.trim() || undefined,
                      body: newTask.body?.trim() || undefined,
                    })

                    setNewTaskOpen(false)
                    void reload()
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err))
                  } finally {
                    setNewTaskSubmitting(false)
                  }
                }}
              >
                {newTaskSubmitting ? 'Creating…' : 'Create Task'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {projectsOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setProjectsOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(720px, 100%)',
              background: 'rgba(20, 24, 38, 0.98)',
              border: '1px solid rgba(231, 236, 255, 0.12)',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Projects</div>
              <button className="btn" onClick={() => setProjectsOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="new-project"
                style={{ flex: 1 }}
              />
              <button
                className="btn"
                onClick={async () => {
                  try {
                    const name = newProjectName.trim()
                    if (!name) return
                    await createProject(name)
                    setNewProjectName('')
                    const next = await fetchProjects()
                    setProjectList(next)
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err))
                  }
                }}
              >
                Create
              </button>
            </div>

            <div style={{ marginTop: 12, maxHeight: '60vh', overflow: 'auto' }}>
              {(projectList ?? projects.filter((p) => p !== 'all')).length === 0 ? (
                <div style={{ color: 'rgba(231, 236, 255, 0.75)', fontSize: 13 }}>No projects</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(projectList ?? projects.filter((p) => p !== 'all'))
                    .filter((p) => p !== 'all')
                    .map((p) => (
                      <div
                        key={p}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          border: '1px solid rgba(231, 236, 255, 0.10)',
                          borderRadius: 10,
                        }}
                      >
                        <div style={{ fontSize: 13 }}>{p}</div>
                        <button
                          className="btn"
                          onClick={async () => {
                            try {
                              await deleteProject(p)
                              const next = await fetchProjects()
                              setProjectList(next)
                              if (project === p) setProject('all')
                              void reload()
                            } catch (err) {
                              setError(err instanceof Error ? err.message : String(err))
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: 10, color: 'rgba(231, 236, 255, 0.6)', fontSize: 12 }}>
              Delete is blocked if a project has tasks.
            </div>
          </div>
        </div>
      ) : null}

      {selectedTask ? (
        <TaskDetailsModal
          task={selectedTask}
          details={taskDetails}
          loading={detailsLoading}
          loadError={detailsError}
          onClose={() => setSelectedTask(null)}
          onPatch={patchTaskOptimistic}
          onAppendLog={handleAppendLog}
        />
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
              {byStatus[s.key].map((t) => {
                const nodeId = buildNodeId(t)
                return (
                  <TaskCard
                    key={nodeId}
                    nodeId={nodeId}
                    task={t}
                    onOpen={() => {
                      setSelectedTask(t)
                    }}
                  />
                )
              })}
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
