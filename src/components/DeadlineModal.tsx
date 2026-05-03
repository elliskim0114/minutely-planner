import { useState } from 'react'
import { useStore } from '../store'
import type { Deadline } from '../types'

export const PRIORITY_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#3b82f6',
}

interface Props {
  date: string
  deadline?: Deadline
  onClose: () => void
}

export default function DeadlineModal({ date, deadline, onClose }: Props) {
  const { addDeadline, updateDeadline, deleteDeadline } = useStore()
  const [name, setName] = useState(deadline?.name ?? '')
  const [course, setCourse] = useState(deadline?.course ?? '')
  const [dueDate, setDueDate] = useState(deadline?.date ?? date)
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>(deadline?.priority ?? 'medium')
  const [note, setNote] = useState(deadline?.note ?? '')
  const [done, setDone] = useState(deadline?.done ?? false)

  const isEdit = !!deadline

  const save = () => {
    if (!name.trim()) return
    const payload: Omit<Deadline, 'id'> = {
      name: name.trim(),
      date: dueDate,
      course: course.trim() || undefined,
      color: PRIORITY_COLORS[priority],
      priority,
      done,
      note: note.trim() || undefined,
    }
    if (isEdit) updateDeadline(deadline.id, payload)
    else addDeadline(payload)
    onClose()
  }

  return (
    <div className="dl-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dl-box">
        <div className="dl-hdr">
          <div className="dl-title">{isEdit ? 'edit deadline' : '📌 add deadline'}</div>
          <button className="dl-close" onClick={onClose}>×</button>
        </div>

        <div className="dl-body">
          <input
            className="dl-inp"
            placeholder="deadline name (e.g. Essay: Chapter Analysis)"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onClose() }}
            autoFocus
          />
          <input
            className="dl-inp"
            placeholder="course (optional — e.g. ENGL 201, CS 101)"
            value={course}
            onChange={e => setCourse(e.target.value)}
          />

          <div className="dl-row">
            <div className="dl-field">
              <span className="dl-lbl">due date</span>
              <input
                type="date"
                className="dl-date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
            <div className="dl-field">
              <span className="dl-lbl">priority</span>
              <div className="dl-priority-tabs">
                {(['low', 'medium', 'high'] as const).map(p => (
                  <button
                    key={p}
                    className={`dl-prio-btn${priority === p ? ' on' : ''}`}
                    style={priority === p ? { background: PRIORITY_COLORS[p], borderColor: PRIORITY_COLORS[p], color: '#fff' } : {}}
                    onClick={() => setPriority(p)}
                  >{p}</button>
                ))}
              </div>
            </div>
          </div>

          <textarea
            className="dl-inp dl-note"
            placeholder="notes (optional)"
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
          />

          {isEdit && (
            <label className="dl-done-row">
              <input type="checkbox" checked={done} onChange={e => setDone(e.target.checked)} />
              <span>mark as done</span>
            </label>
          )}
        </div>

        <div className="dl-foot">
          {isEdit && (
            <button className="dl-delete" onClick={() => { deleteDeadline(deadline.id); onClose() }}>
              delete
            </button>
          )}
          <button className="dl-cancel" onClick={onClose}>cancel</button>
          <button
            className="dl-save"
            onClick={save}
            disabled={!name.trim()}
            style={{ background: PRIORITY_COLORS[priority] }}
          >{isEdit ? 'update' : 'add deadline'}</button>
        </div>
      </div>
    </div>
  )
}
