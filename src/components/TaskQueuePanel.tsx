import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import type { Block } from '../types'

const TYPE_DOTS: Record<string, string> = {
  focus: 'var(--bfbd)', routine: 'var(--brbd)', study: 'var(--bsbd)', free: 'var(--blbd)', custom: 'var(--acc)',
}
const TYPE_BG: Record<string, string> = {
  focus: 'var(--bfbg)', routine: 'var(--brbg)', study: 'var(--bsbg)', free: 'var(--blbg)',
}

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120]
const TYPE_OPTIONS: Array<{ key: Block['type']; label: string }> = [
  { key: 'focus', label: '🎯 focus' },
  { key: 'routine', label: '⚡ routine' },
  { key: 'study', label: '📖 study' },
  { key: 'free', label: '☁️ free' },
]

interface Props {
  onClose: () => void
}

export default function TaskQueuePanel({ onClose }: Props) {
  const { queue, addToQueue, removeFromQueue, openBlockModalFromQueue } = useStore()
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<Block['type']>('focus')
  const [newDur, setNewDur] = useState(60)
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Close when clicking outside the panel
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    // Small delay so the Q-key open click doesn't immediately close it
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 100)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler) }
  }, [onClose])

  const handleAdd = () => {
    if (!newName.trim()) return
    addToQueue({ name: newName.trim(), type: newType, duration: newDur, cc: null, customName: null })
    setNewName('')
  }

  const formatDur = (mins: number) =>
    mins >= 60 ? `${mins / 60}h${mins % 60 ? ` ${mins % 60}m` : ''}` : `${mins}m`

  return (
    <div className="tq-panel" ref={panelRef}>
        <div className="tq-hdr">
          <div className="tq-hdr-text">
            <div className="tq-title">
              <span className="tq-icon">☰</span>
              task queue
            </div>
            <div className="tq-sub">{queue.length} task{queue.length !== 1 ? 's' : ''} · drag onto calendar to schedule</div>
          </div>
          <button className="tq-close" onClick={onClose}>×</button>
        </div>

        {/* Quick-add form */}
        <div className="tq-add">
          <input
            className="tq-add-inp"
            placeholder="task name…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            autoFocus
          />
          <div className="tq-add-row">
            <div className="tq-type-seg">
              {TYPE_OPTIONS.map(t => (
                <button
                  key={t.key}
                  className={`tq-type-btn${newType === t.key ? ' on' : ''}`}
                  style={newType === t.key ? { background: TYPE_BG[t.key], borderColor: TYPE_DOTS[t.key] } : {}}
                  onClick={() => setNewType(t.key)}
                >{t.label}</button>
              ))}
            </div>
            <select className="tq-dur-sel" value={newDur} onChange={e => setNewDur(Number(e.target.value))}>
              {DURATION_OPTIONS.map(d => (
                <option key={d} value={d}>{formatDur(d)}</option>
              ))}
            </select>
            <button className="tq-add-btn" onClick={handleAdd} disabled={!newName.trim()}>+ add</button>
          </div>
        </div>

        {/* Queue list */}
        {queue.length === 0 ? (
          <div className="tq-empty">
            <div className="tq-empty-icon">☰</div>
            <div>queue is empty — add tasks above and schedule them when you're ready</div>
          </div>
        ) : (
          <div className="tq-list">
            {queue.map(item => (
              <div
                key={item.id}
                className="tq-item"
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData('queue-item-id', String(item.id))
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                title="drag onto the calendar to place, or click schedule →"
              >
                <div className="tq-drag-handle" title="drag to calendar">⠿</div>
                <div
                  className="tq-item-dot"
                  style={{ background: TYPE_DOTS[item.type] || 'var(--acc)' }}
                />
                <div className="tq-item-info">
                  <div className="tq-item-name">{item.name}</div>
                  <div className="tq-item-meta">
                    {formatDur(item.duration)} · {item.type}
                  </div>
                </div>
                <div className="tq-item-acts">
                  <button
                    className="tq-schedule-btn"
                    onClick={() => { openBlockModalFromQueue(item.id); onClose() }}
                    title="schedule this task"
                  >schedule →</button>
                  <button
                    className="tq-remove-btn"
                    onClick={() => removeFromQueue(item.id)}
                    title="remove from queue"
                  >×</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="tq-footer">
          tasks stay here until you schedule them · drag onto calendar to place
        </div>
      </div>
  )
}
