import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store'
import { todayStr } from '../utils'

interface Props { onClose: () => void }

const EXAMPLES = [
  'standup 9am 30 min',
  'deep work 2pm–4pm',
  'gym 6:30am 1 hour',
  'lunch break 12:30 45min',
  'review PRs tomorrow 3pm 1h',
]

export default function QuickCapture({ onClose }: Props) {
  const { addBlock, showToast, anthropicKey } = useStore()
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [hint, setHint] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = async (text: string) => {
    const t = text.trim()
    if (!t || loading) return
    setLoading(true)
    setHint('')
    try {
      const res = await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t, today: todayStr(), apiKey: anthropicKey || undefined }),
      })
      const data = await res.json()
      const blocks = Array.isArray(data) ? data.filter((b: any) => b.start && b.end) : []
      if (blocks.length > 0) {
        blocks.forEach((b: any) => {
          addBlock({
            name: b.name,
            date: b.date || todayStr(),
            start: b.start,
            end: b.end,
            type: b.type || 'routine',
            cc: null,
            customName: null,
          })
        })
        showToast(`${blocks.length} block${blocks.length !== 1 ? 's' : ''} added ✓`)
        onClose()
      } else {
        setHint("couldn't find a time — try adding one, e.g. 'meeting 2pm 1h'")
        setLoading(false)
        inputRef.current?.select()
      }
    } catch {
      setHint('something went wrong — try again')
      setLoading(false)
    }
  }

  return (
    <div className="qc-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="qc-box">
        <div className="qc-label">quick add</div>

        <div className={`qc-input-wrap${loading ? ' loading' : ''}`}>
          <span className="qc-icon">⚡</span>
          <input
            ref={inputRef}
            className="qc-input"
            placeholder="what's happening? e.g. standup 9am 30min"
            value={value}
            onChange={e => { setValue(e.target.value); setHint('') }}
            onKeyDown={e => {
              if (e.key === 'Enter') submit(value)
              if (e.key === 'Escape') onClose()
            }}
            disabled={loading}
          />
          {loading
            ? <div className="qc-spinner"><div /><div /><div /></div>
            : value.trim()
            ? <button className="qc-go" onClick={() => submit(value)}>↵</button>
            : null
          }
        </div>

        {hint && <div className="qc-hint">{hint}</div>}

        <div className="qc-examples">
          {EXAMPLES.map(ex => (
            <button
              key={ex}
              className="qc-ex"
              onClick={() => { setValue(ex); setTimeout(() => inputRef.current?.focus(), 0) }}
            >{ex}</button>
          ))}
        </div>

        <div className="qc-footer">press ↵ to add · esc to close</div>
      </div>
    </div>
  )
}
