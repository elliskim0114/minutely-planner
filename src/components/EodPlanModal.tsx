import { useState, useMemo } from 'react'
import { useStore } from '../store'
import { toM, todayStr } from '../utils'
import type { Block } from '../types'

function getLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function formatTime(mins: number) {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}

interface Suggestion {
  name: string; start: string; end: string; type: Block['type']
  customName: string | null; count: number; isDaily: boolean; dayLabels: string[]
}

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const TYPE_DOTS: Record<string, string> = {
  focus: 'var(--bfbd)', routine: 'var(--brbd)', study: 'var(--bsbd)',
  free: 'var(--blbd)', custom: 'var(--acc)', gcal: 'var(--bd2)',
}
const TYPE_BG: Record<string, string> = {
  focus: 'var(--bfbg)', routine: 'var(--brbg)', study: 'var(--bsbg)', free: 'var(--blbg)',
}

export default function EodPlanModal() {
  const { closeEodPlan, blocks, bulkAddBlocks, intentions, setEnergy, setNote, completeBlock, cfg } = useStore()
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [reflection, setReflection] = useState('')
  const [completionMap, setCompletionMap] = useState<Record<number, 'done' | 'skipped' | null>>({})

  const td = todayStr()
  const today = new Date()
  const todayInt = intentions[td] || { e: 0, p: ['', '', ''] }
  const todayBlocks = useMemo(() =>
    blocks.filter(b => b.date === td).sort((a, b) => toM(a.start) - toM(b.start))
  , [blocks, td])

  const tomorrow = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 1)
    return { date: getLocalDateStr(d), dow: d.getDay(), label: DAY_NAMES[d.getDay()] }
  }, [])

  // Pattern detection for tomorrow suggestions
  const suggestions = useMemo<Suggestion[]>(() => {
    const now = new Date()
    const since = new Date(now); since.setDate(since.getDate() - 28)
    const sinceStr = getLocalDateStr(since)
    const allPastDates: string[] = []
    for (let i = 1; i <= 28; i++) {
      const d = new Date(now); d.setDate(d.getDate() - i)
      allPastDates.push(getLocalDateStr(d))
    }
    const dowDates = new Set(allPastDates.filter(d => new Date(d + 'T12:00').getDay() === tomorrow.dow))
    const historicBlocks = blocks.filter(b => b.date >= sinceStr && b.date !== tomorrow.date)
    const grouped: Record<string, { starts: number[]; ends: number[]; typeCounts: Record<string, number>; customNameCounts: Record<string, number>; allDates: Set<string>; dowDates: Set<string> }> = {}
    historicBlocks.forEach(b => {
      const key = b.name.toLowerCase().trim()
      if (!grouped[key]) grouped[key] = { starts: [], ends: [], typeCounts: {}, customNameCounts: {}, allDates: new Set(), dowDates: new Set() }
      grouped[key].starts.push(toM(b.start))
      grouped[key].ends.push(toM(b.end))
      grouped[key].typeCounts[b.type] = (grouped[key].typeCounts[b.type] || 0) + 1
      const cn = b.customName ?? ''
      grouped[key].customNameCounts[cn] = (grouped[key].customNameCounts[cn] || 0) + 1
      grouped[key].allDates.add(b.date)
      if (dowDates.has(b.date)) grouped[key].dowDates.add(b.date)
    })
    const tomorrowNames = new Set(blocks.filter(b => b.date === tomorrow.date).map(b => b.name.toLowerCase().trim()))
    return Object.entries(grouped)
      .filter(([key, g]) => !tomorrowNames.has(key) && (g.dowDates.size >= 2 || g.allDates.size >= 10))
      .map(([key, g]) => {
        const avgStart = Math.round(g.starts.reduce((a, b) => a + b, 0) / g.starts.length)
        const avgEnd = Math.round(g.ends.reduce((a, b) => a + b, 0) / g.ends.length)
        const roundStart = Math.round(avgStart / 15) * 15
        const roundEnd = Math.round(avgEnd / 15) * 15
        const original = historicBlocks.filter(b => b.name.toLowerCase().trim() === key).sort((a, b) => b.date.localeCompare(a.date))[0]
        const type = (Object.entries(g.typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'free') as Block['type']
        const cnEntries = Object.entries(g.customNameCounts).filter(([k]) => k !== '').sort((a, b) => b[1] - a[1])
        return {
          name: original?.name ?? key, start: formatTime(roundStart),
          end: formatTime(Math.max(roundEnd, roundStart + 15)), type,
          customName: cnEntries.length > 0 ? cnEntries[0][0] : null,
          count: g.allDates.size, isDaily: g.allDates.size >= 10,
          dayLabels: [...g.dowDates].sort().slice(-3).map(d => DAY_NAMES[new Date(d + 'T12:00').getDay()]),
        }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
  }, [blocks, tomorrow])

  const [checked, setChecked] = useState<Set<number>>(() => new Set(suggestions.map((_, i) => i)))
  const toggle = (i: number) => setChecked(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })

  const handleReflectionNext = () => {
    if (reflection.trim()) {
      setNote(td, (todayInt.note ? todayInt.note + '\n\n[EOD] ' : '[EOD] ') + reflection.trim())
    }
    setStep(todayBlocks.length > 0 ? 1 : 2)
  }

  const toggleCompletion = (id: number, status: 'done' | 'skipped') => {
    setCompletionMap(prev => {
      const cur = prev[id]
      return { ...prev, [id]: cur === status ? null : status }
    })
  }

  const handleCompletionNext = () => {
    Object.entries(completionMap).forEach(([idStr, status]) => {
      if (status) completeBlock(Number(idStr), status)
    })
    setStep(2)
  }

  const handleSchedule = () => {
    const toAdd = suggestions.filter((_, i) => checked.has(i)).map(s => ({
      name: s.name, start: s.start, end: s.end, type: s.type,
      date: tomorrow.date, customName: s.customName ?? null,
    }))
    if (toAdd.length > 0) bulkAddBlocks(toAdd)
    closeEodPlan()
    useStore.getState().showToast(toAdd.length > 0
      ? `${toAdd.length} block${toAdd.length !== 1 ? 's' : ''} added to ${tomorrow.label}`
      : 'all wrapped up — great day!'
    )
  }

  const donePct = todayBlocks.length > 0
    ? Math.round((Object.values(completionMap).filter(v => v !== null).length / todayBlocks.length) * 100)
    : 0
  const doneCount = Object.values(completionMap).filter(v => v === 'done').length
  const ENERGY_EMOJIS = ['—', '😴', '😐', '⚡']

  return (
    <div className="eod-overlay" onClick={e => { if (e.target === e.currentTarget) closeEodPlan() }}>
      <div className="eod-box eod-ritual-box">
        {/* Step indicator */}
        <div className="eod-steps">
          {[0, 1, 2].map(i => (
            <div key={i} className={`eod-step-pip${step === i ? ' active' : step > i ? ' done' : ''}`} />
          ))}
        </div>

        <button className="eod-close" onClick={closeEodPlan}>×</button>

        {/* ── Step 0: Reflection ── */}
        {step === 0 && (
          <div className="eod-step-content">
            <div className="eod-ritual-icon">🌙</div>
            <div className="eod-ritual-title">end of day</div>
            <div className="eod-ritual-sub">{today.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}</div>

            <div className="eod-section-lbl">how was your energy today?</div>
            <div className="eod-energy-row">
              {['—', 'low', 'medium', 'peak'].map((lbl, i) => (
                <button
                  key={i}
                  className={`eod-energy-btn${todayInt.e === i ? ' on' : ''}`}
                  onClick={() => setEnergy(td, i)}
                >{ENERGY_EMOJIS[i]} {lbl}</button>
              ))}
            </div>

            <div className="eod-section-lbl" style={{ marginTop: 16 }}>one thing that went well?</div>
            <textarea
              className="eod-reflect-inp"
              placeholder="e.g. finished the presentation, got into deep work early…"
              value={reflection}
              onChange={e => setReflection(e.target.value)}
              autoFocus
            />

            {todayInt.p.some(p => p.trim()) && (
              <div className="eod-prio-recap">
                <div className="eod-section-lbl">today's priorities</div>
                {todayInt.p.filter(p => p.trim()).map((p, i) => (
                  <div key={i} className={`eod-prio-row${todayInt.done?.[i] ? ' done' : ''}`}>
                    <span className="eod-prio-check">{todayInt.done?.[i] ? '✓' : '·'}</span>
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            )}

            <button className="eod-schedule eod-next-btn" onClick={handleReflectionNext}>
              next →
            </button>
          </div>
        )}

        {/* ── Step 1: Block completion ── */}
        {step === 1 && (
          <div className="eod-step-content">
            <div className="eod-ritual-icon">✅</div>
            <div className="eod-ritual-title">mark your blocks</div>
            <div className="eod-ritual-sub">how did today actually go?</div>
            {donePct > 0 && (
              <div className="eod-done-bar">
                <div className="eod-done-fill" style={{ width: `${donePct}%` }} />
              </div>
            )}
            <div className="eod-completion-list">
              {todayBlocks.map(b => {
                const status = completionMap[b.id] ?? null
                return (
                  <div key={b.id} className={`eod-comp-row${status ? ` eod-comp-${status}` : ''}`}>
                    <div className="eod-comp-dot" style={{ background: TYPE_DOTS[b.type] || 'var(--acc)' }} />
                    <div className="eod-comp-info">
                      <div className="eod-comp-name">{b.name}</div>
                      <div className="eod-comp-time">{b.start}–{b.end}</div>
                    </div>
                    <div className="eod-comp-acts">
                      <button
                        className={`eod-comp-btn done${status === 'done' ? ' sel' : ''}`}
                        onClick={() => toggleCompletion(b.id, 'done')}
                        title="mark done"
                      >✓</button>
                      <button
                        className={`eod-comp-btn skip${status === 'skipped' ? ' sel' : ''}`}
                        onClick={() => toggleCompletion(b.id, 'skipped')}
                        title="mark skipped"
                      >✗</button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="eod-comp-summary">
              {doneCount} of {todayBlocks.length} blocks completed
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="eod-skip" onClick={() => setStep(0)}>← back</button>
              <button className="eod-schedule eod-next-btn" onClick={handleCompletionNext}>next →</button>
            </div>
          </div>
        )}

        {/* ── Step 2: Tomorrow's plan ── */}
        {step === 2 && (
          <div className="eod-step-content">
            <div className="eod-ritual-icon">📅</div>
            <div className="eod-ritual-title">plan tomorrow?</div>
            <div className="eod-ritual-sub">based on your {tomorrow.label}s, here's what you usually schedule</div>

            {suggestions.length === 0 ? (
              <div className="eod-empty">
                <div className="eod-empty-icon">🌱</div>
                <div>not enough history yet — add a few more {tomorrow.label}s to see patterns here</div>
              </div>
            ) : (
              <div className="eod-list">
                {suggestions.map((s, i) => (
                  <label key={i} className={`eod-item${checked.has(i) ? ' on' : ''}`}>
                    <input type="checkbox" className="eod-check" checked={checked.has(i)} onChange={() => toggle(i)} />
                    <div className="eod-item-dot" style={{ background: TYPE_DOTS[s.type] || 'var(--acc)' }} />
                    <div className="eod-item-info">
                      <div className="eod-item-name">{s.name}</div>
                      <div className="eod-item-meta">
                        {s.start}–{s.end}
                        <span className="eod-item-freq">
                          {s.isDaily ? ' · daily habit' : ` · every ${tomorrow.label}, ${s.count}× recently`}
                        </span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="eod-actions" style={{ marginTop: 12 }}>
              {todayBlocks.length > 0 && (
                <button className="eod-skip" onClick={() => setStep(1)}>← back</button>
              )}
              <button
                className="eod-schedule"
                onClick={handleSchedule}
                style={{ marginLeft: todayBlocks.length > 0 ? 0 : 'auto' }}
              >
                {checked.size > 0
                  ? `schedule ${checked.size} block${checked.size !== 1 ? 's' : ''} →`
                  : 'finish ✓'}
              </button>
            </div>
            {suggestions.length > 0 && (
              <div className="eod-footer">blocks will be added to {tomorrow.label} · you can edit them anytime</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
