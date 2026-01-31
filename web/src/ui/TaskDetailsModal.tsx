import { useEffect, useMemo, useRef, useState } from 'react'
import type { TaskDetails, TaskIndexItem, TaskStatus } from '../api/types'

const STATUS_VALUES: { key: TaskStatus; label: string }[] = [
  { key: 'todo', label: 'To Do' },
  { key: 'doing', label: 'Doing' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'done', label: 'Done' },
]

const PRIORITY_VALUES = ['P0', 'P1', 'P2', 'P3'] as const

type Patch = {
  title?: string
  status?: TaskStatus
  priority?: string | null
  due?: string | null
  tags?: string[]
}

function toTagString(tags: string[]): string {
  return tags.join(', ')
}

function parseTags(input: string): string[] {
  const parts = input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  // dedupe, keep order
  const out: string[] = []
  for (const t of parts) if (!out.includes(t)) out.push(t)
  return out
}

export function TaskDetailsModal(props: {
  task: TaskIndexItem
  details?: TaskDetails | null
  loading?: boolean
  loadError?: string | null
  onClose: () => void
  onPatch: (id: string, patch: Patch) => Promise<void>
  onAppendLog?: (id: string, entry: string) => Promise<void>
}) {
  const { task } = props

  const [title, setTitle] = useState(task.title)
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [priority, setPriority] = useState<string>(task.priority ?? '')
  const [due, setDue] = useState<string>(task.due ?? '')
  const [tagsText, setTagsText] = useState<string>(toTagString(task.tags ?? []))

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [logEntry, setLogEntry] = useState('')
  const [postingLog, setPostingLog] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)

  const titleRef = useRef<HTMLInputElement | null>(null)

  // If the selected task changes while modal is open, reset local state.
  useEffect(() => {
    setTitle(task.title)
    setStatus(task.status)
    setPriority(task.priority ?? '')
    setDue(task.due ?? '')
    setTagsText(toTagString(task.tags ?? []))
    setSaveError(null)
    setLogEntry('')
    setLogError(null)
  }, [task])

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const computedTags = useMemo(() => parseTags(tagsText), [tagsText])

  async function commit(patch: Patch) {
    setSaving(true)
    setSaveError(null)
    try {
      await props.onPatch(task.id, patch)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
      throw e
    } finally {
      setSaving(false)
    }
  }

  async function commitIfChanged() {
    const patch: Patch = {}
    if (title !== task.title) patch.title = title
    if (status !== task.status) patch.status = status

    const nextPriority = priority.trim() ? priority.trim() : null
    if ((task.priority ?? null) !== nextPriority) patch.priority = nextPriority

    const nextDue = due.trim() ? due.trim() : null
    if ((task.due ?? null) !== nextDue) patch.due = nextDue

    const nextTags = computedTags
    const prevTags = task.tags ?? []
    if (prevTags.join('\n') !== nextTags.join('\n')) patch.tags = nextTags

    if (Object.keys(patch).length === 0) return
    await commit(patch)
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') props.onClose()
      }}
      tabIndex={-1}
    >
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">Task</div>
            <div className="modal-subtitle">
              <span className="pill">{task.id}</span>
              <span className="pill">{task.project}</span>
              <span className="pill">{task.path}</span>
            </div>
          </div>
          <button className="btn btn--ghost" onClick={props.onClose} disabled={saving}>
            Close
          </button>
        </div>

        {saveError ? (
          <div className="error error--compact">
            <div className="error-title">Save failed</div>
            <pre className="error-body">{saveError}</pre>
          </div>
        ) : null}

        <div className="form">
          <label className="field">
            <span>Title</span>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => void commitIfChanged()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur()
                }
              }}
              placeholder="Task title"
            />
          </label>

          <div className="row">
            <label className="field">
              <span>Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                onBlur={() => void commitIfChanged()}
              >
                {STATUS_VALUES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                onBlur={() => void commitIfChanged()}
              >
                <option value="">(none)</option>
                {PRIORITY_VALUES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Due</span>
              <input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                onBlur={() => void commitIfChanged()}
              />
            </label>
          </div>

          <label className="field">
            <span>Tags (comma-separated)</span>
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              onBlur={() => void commitIfChanged()}
              placeholder="frontend, urgent, …"
            />
          </label>

          {props.loading ? (
            <div className="muted" style={{ fontSize: 12 }}>
              Loading details…
            </div>
          ) : props.loadError ? (
            <div className="error error--compact">
              <div className="error-title">Failed to load details</div>
              <pre className="error-body">{props.loadError}</pre>
            </div>
          ) : props.details ? (
            <>
              <div className="field">
                <span>Body</span>
                <pre
                  style={{
                    margin: 0,
                    padding: 10,
                    border: '1px solid rgba(231, 236, 255, 0.12)',
                    borderRadius: 12,
                    background: 'rgba(11, 16, 32, 0.45)',
                    color: 'rgba(231, 236, 255, 0.92)',
                    overflow: 'auto',
                    maxHeight: 260,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {props.details.body.trim() ? props.details.body : '(empty)'}
                </pre>
              </div>

              {props.details.log?.length || props.onAppendLog ? (
                <div className="field">
                  <span>Log</span>

                  {props.details.log?.length ? (
                    <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(231, 236, 255, 0.92)' }}>
                      {props.details.log.slice(0, 20).map((l, i) => (
                        <li key={i} style={{ marginBottom: 6 }}>
                          {l}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="muted" style={{ fontSize: 12 }}>
                      No log entries yet.
                    </div>
                  )}

                  {props.onAppendLog ? (
                    <form
                      style={{ marginTop: 10, display: 'flex', gap: 8 }}
                      onSubmit={async (e) => {
                        e.preventDefault()
                        const entry = logEntry.trim()
                        if (!entry) return
                        setPostingLog(true)
                        setLogError(null)
                        try {
                          await props.onAppendLog?.(task.id, entry)
                          setLogEntry('')
                        } catch (err) {
                          setLogError(err instanceof Error ? err.message : String(err))
                        } finally {
                          setPostingLog(false)
                        }
                      }}
                    >
                      <input
                        value={logEntry}
                        onChange={(e) => setLogEntry(e.target.value)}
                        placeholder="Add a log entry…"
                        style={{ flex: 1 }}
                        disabled={postingLog}
                      />
                      <button className="btn" type="submit" disabled={postingLog}>
                        {postingLog ? 'Adding…' : 'Add'}
                      </button>
                    </form>
                  ) : null}

                  {logError ? (
                    <div className="error error--compact" style={{ marginTop: 10 }}>
                      <div className="error-title">Log failed</div>
                      <pre className="error-body">{logError}</pre>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          <div className="meta-line">
            <span className="muted">Updated</span>
            <span>{task.updated}</span>
            {saving ? <span className="muted">Saving…</span> : <span className="muted">Saved</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
