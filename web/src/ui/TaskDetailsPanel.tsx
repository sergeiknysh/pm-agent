import { useEffect, useMemo, useState } from 'react'
import type { TaskDetails, TaskStatus } from '../api/types'
import { appendTaskLog, fetchTask, patchTask } from '../api/client'

const STATUSES: TaskStatus[] = ['todo', 'doing', 'blocked', 'done']

function extractLog(body: string): string {
  const normalized = (body ?? '').replace(/\r\n/g, '\n')
  const idx = normalized.indexOf('\n## Log\n')
  if (idx === -1) return ''
  return normalized.slice(idx + '\n## Log\n'.length).trim()
}

export function TaskDetailsPanel(props: {
  taskId: string | null
  onClose: () => void
  onChanged?: () => void
}) {
  const { taskId } = props

  const [tab, setTab] = useState<'details' | 'log'>('details')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [task, setTask] = useState<TaskDetails | null>(null)

  const [draftTitle, setDraftTitle] = useState('')
  const [draftStatus, setDraftStatus] = useState<TaskStatus>('todo')
  const [draftPriority, setDraftPriority] = useState<string>('')
  const [draftDue, setDraftDue] = useState<string>('')
  const [draftTags, setDraftTags] = useState<string>('')

  const [saving, setSaving] = useState(false)
  const [logEntry, setLogEntry] = useState('')
  const [logSubmitting, setLogSubmitting] = useState(false)

  async function reloadDetails(id: string) {
    setLoading(true)
    setError(null)
    try {
      const ctrl = new AbortController()
      const data = await fetchTask(id, ctrl.signal)
      setTask(data)

      setDraftTitle(data.meta.title ?? '')
      setDraftStatus(data.meta.status)
      setDraftPriority(data.meta.priority ?? '')
      setDraftDue(data.meta.due ?? '')
      setDraftTags((data.meta.tags ?? []).join(', '))
    } catch (e) {
      setTask(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!taskId) return
    setTab('details')
    void reloadDetails(taskId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  const open = !!taskId
  const logText = useMemo(() => (task ? extractLog(task.body) : ''), [task])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => (saving || logSubmitting ? null : props.onClose())}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        zIndex: 55,
      }}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="sidepanel"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          height: '100%',
          width: 'min(520px, 100%)',
          background: 'rgba(17, 26, 51, 0.98)',
          borderLeft: '1px solid rgba(231, 236, 255, 0.16)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.55)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: 14, borderBottom: '1px solid rgba(231, 236, 255, 0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>Task Details</div>
              <div className="modal-subtitle">
                {task?.meta?.id ? <span className="pill">{task.meta.id}</span> : null}
                {task?.meta?.project ? <span className="pill">{task.meta.project}</span> : null}
                {task?.meta?.updated ? <span className="pill">Updated {task.meta.updated}</span> : null}
              </div>
            </div>
            <button className="btn btn--ghost" onClick={props.onClose} disabled={saving || logSubmitting}>
              Close
            </button>
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button
              className={`btn ${tab === 'details' ? '' : 'btn--ghost'}`}
              onClick={() => setTab('details')}
              disabled={saving || logSubmitting}
            >
              Details
            </button>
            <button
              className={`btn ${tab === 'log' ? '' : 'btn--ghost'}`}
              onClick={() => setTab('log')}
              disabled={saving || logSubmitting}
            >
              Log
            </button>
          </div>
        </div>

        <div style={{ padding: 14, overflow: 'auto', flex: 1 }}>
          {error ? (
            <div className="error error--compact">
              <div className="error-title">Error</div>
              <pre className="error-body">{error}</pre>
            </div>
          ) : null}

          {loading ? <div className="muted">Loading…</div> : null}

          {tab === 'details' ? (
            <div className="form" style={{ padding: 0 }}>
              <div className="field">
                <span>Title</span>
                <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
              </div>

              <div className="row">
                <div className="field">
                  <span>Status</span>
                  <select value={draftStatus} onChange={(e) => setDraftStatus(e.target.value as TaskStatus)}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <span>Priority</span>
                  <select value={draftPriority} onChange={(e) => setDraftPriority(e.target.value)}>
                    <option value="">—</option>
                    <option value="P0">P0</option>
                    <option value="P1">P1</option>
                    <option value="P2">P2</option>
                    <option value="P3">P3</option>
                  </select>
                </div>

                <div className="field">
                  <span>Due</span>
                  <input type="date" value={draftDue} onChange={(e) => setDraftDue(e.target.value)} />
                </div>
              </div>

              <div className="field">
                <span>Tags (comma-separated)</span>
                <input value={draftTags} onChange={(e) => setDraftTags(e.target.value)} placeholder="backend, ui" />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  className="btn"
                  disabled={!taskId || saving}
                  onClick={async () => {
                    if (!taskId) return
                    try {
                      setSaving(true)
                      const tags = draftTags
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean)

                      await patchTask(taskId, {
                        title: draftTitle.trim() || undefined,
                        status: draftStatus,
                        priority: draftPriority.trim() || undefined,
                        due: draftDue.trim() || undefined,
                        tags: tags.length ? tags : undefined,
                      })
                      await reloadDetails(taskId)
                      props.onChanged?.()
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e))
                    } finally {
                      setSaving(false)
                    }
                  }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <span>Add log entry</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={logEntry}
                    onChange={(e) => setLogEntry(e.target.value)}
                    placeholder="What happened?"
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn"
                    disabled={!taskId || logSubmitting}
                    onClick={async () => {
                      if (!taskId) return
                      const entry = logEntry.trim()
                      if (!entry) return
                      try {
                        setLogSubmitting(true)
                        const updated = await appendTaskLog(taskId, entry)
                        setTask(updated)
                        setLogEntry('')
                        props.onChanged?.()
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e))
                      } finally {
                        setLogSubmitting(false)
                      }
                    }}
                  >
                    {logSubmitting ? 'Adding…' : 'Add'}
                  </button>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: 'rgba(231, 236, 255, 0.7)', marginBottom: 6 }}>Log</div>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    fontSize: 12,
                    lineHeight: 1.35,
                    background: 'rgba(11, 16, 32, 0.55)',
                    border: '1px solid rgba(231, 236, 255, 0.12)',
                    borderRadius: 12,
                    padding: 10,
                    minHeight: 120,
                  }}
                >
                  {logText || '—'}
                </pre>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
