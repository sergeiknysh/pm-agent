import { useDroppable } from '@dnd-kit/core'
import type { PropsWithChildren } from 'react'

export function KanbanColumn(
  props: PropsWithChildren<{ id: string; title: string; count: number }>,
) {
  const { isOver, setNodeRef } = useDroppable({
    id: props.id,
  })

  return (
    <section className={`column ${isOver ? 'column--over' : ''}`}>
      <div className="column-header">
        <div className="column-title">{props.title}</div>
        <div className="column-count">{props.count}</div>
      </div>
      <div ref={setNodeRef} className="column-body">
        {props.children}
      </div>
    </section>
  )
}
