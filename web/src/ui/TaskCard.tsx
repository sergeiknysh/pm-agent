import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties } from 'react'
import type { TaskIndexItem } from '../api/types'

export function TaskCard(props: { task: TaskIndexItem }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: props.task.id,
  })

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`card ${isDragging ? 'card--dragging' : ''}`}
      {...listeners}
      {...attributes}
    >
      <div className="task-title">{props.task.title}</div>
      <div className="task-meta">
        <span className="pill">{props.task.id}</span>
        <span className="pill">{props.task.project}</span>
        {props.task.priority ? <span className="pill">{props.task.priority}</span> : null}
        {props.task.due ? <span className="pill">Due {props.task.due}</span> : null}
      </div>
      {props.task.tags?.length ? (
        <div className="task-tags">
          {props.task.tags.slice(0, 8).map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  )
}
