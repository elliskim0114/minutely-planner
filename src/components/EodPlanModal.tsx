import { useState, useMemo } from 'react'
import { useStore } from '../store'
import { toM } from '../utils'
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
  name: string
  start: string
  end: string
  type: Block['type']
  customName: string | null
  count: number
  isDaily: boolean
  dayLabels: string[]
}

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export default function EodPlanModal() {
  const { closeEodPlan, blocks, bulkAddBlocks } = useStore()

  const tomorrow = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 1)
    return { date: getLocalDateStr(d), dow: d.getDay(), label: DAY_NAMES[d.getDay()] }
  }, [])

  // Pattern detection: same day-of-week habits AND daily habits
  const suggestions = useMemo<Suggestion[]>(() => {
    const now = new Date()
    const since = new Date(now); since.setDate(since.getDate() - 28)
    const sinceStr = getLocalDateStr(since)

    // All dates in last 28 days (excluding tomorrow)
    const allPastDates: string[] = []
    for (let i = 1; i <= 28; i++) {
      const d = new Date(now); d.setDate(d.getDate() - i)
      allPastDates.push(getLocalDateStr(d))
    }
    // Same-DOW dates in last 28 days
    const dowDates = new Set(allPastDates.filter(d => new Date(d + 'T12:00').getDay() === tomorrow.dow))

    // All recent blocks (not from tomorrow)
    const historicBlocks = blocks.filter(b => b.date >= sinceStr && b.date !== tomorrow.date)

    // Group by name: track all-day occurrences and same-DOW occurrences separately
    const grouped: Record<string, {
      starts: number[]; ends: number[]
      type: Block['type']; customName: string | null
      allDates: Set<string>; dowDates: Set<string>
    }> = {}

    historicBlocks.forEach(b => {
      const key = b.name.toLowerCase().trim()
      if (!grouped[key]) grouped[key] = {
        starts: [], ends: [], type: b.type, customName: b.customName ?? null,
        allDates: new Set(), dowDates: new Set(),
      }
      grouped[key].starts.push(toM(b.start))
      grouped[key].ends.push(toM(b.end))
      grouped[key].allDates.add(b.date)
      if (dowDates.has(b.date)) grouped[key].dowDates.add(b.date)
    })

    const tomorrowNames = new Set(
      blocks.filter(b => b.date === tomorrow.date).map(b => b.name.toLowerCase().trim())
    )

    return Object.entries(grouped)
      .filter(([key, g]) => {
        if (tomorrowNames.has(key)) return false
        // Include: ≥2 occurrences on same DOW (weekly habit)
        //       OR ≥10 occurrences across all days in 28d window (daily habit, ~35%+ of days)
        return g.dowDates.size >= 2 || g.allDates.size >= 10
      })
      .map(([key, g]) => {
        const avgStart = Math.round(g.starts.reduce((a, b) => a + b, 0) / g.starts.length)
        const avgEnd = Math.round(g.ends.reduce((a, b) => a + b, 0) / g.ends.length)
        const roundStart = Math.round(avgStart / 15) * 15
        const roundEnd = Math.round(avgEnd / 15) * 15
        const original = historicBlocks
          .filter(b => b.name.toLowerCase().trim() === key)
          .sort((a, b) => b.date.localeCompare(a.date))[0]
        const isDaily = g.allDates.size >= 10
        return {
          name: original?.name ?? key,
          start: formatTime(roundStart),
          end: formatTime(Math.max(roundEnd, roundStart + 15)),
          type: g.type,
          customName: g.customName,
          count: g.allDates.size,
          isDaily,
          dayLabels: [...g.dowDates].sort().slice(-3).map(d => DAY_NAMES[new Date(d + 'T12:00').getDay()]),
        }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
  }, [blocks, tomorrow])

  const [checked, setChecked] = useState<Set<number>>(() => new Set(suggestions.map((_, i) => i)))

  const toggle = (i: number) => setChecked(s => {
    const n = new Set(s)
    n.has(i) ? n.delete(i) : n.add(i)
    return n
  })

  const handleSchedule = () => {
    const toAdd = suggestions.filter((_, i) => checked.has(i)).map(s => ({
      name: s.name, start: s.start, end: s.end, type: s.type,
      date: tomorrow.date, customName: s.customName ?? null,
    }))
    if (toAdd.length > 0) bulkAddBlocks(toAdd)
    closeEodPlan()
    useStore.getState().showToast(`${toAdd.length} block${toAdd.length !== 1 ? 's' : ''} added to ${tomorrow.label}`)
  }

  const TYPE_DOTS: Record<string, string> = {
    focus: 'var(--bfbd)', routine: 'var(--brbd)', study: 'var(--bsbd)',
    free: 'var(--blbd)', custom: 'var(--acc)', gcal: 'var(--bd2)',
  }

  return (
    <div className="eod-overlay" onClick={e => { if (e.target === e.currentTarget) closeEodPlan() }}>
      <div className="eod-box">
        {/* Header */}
        <div className="eod-hdr">
          <div className="eod-hdr-icon">🌙</div>
          <div className="eod-hdr-text">
            <div className="eod-title">plan tomorrow?</div>
            <div className="eod-sub">
              based on your {tomorrow.label}s, here's what you usually schedule
            </div>
          </div>
          <button className="eod-close" onClick={closeEodPlan}>×</button>
        </div>

        {suggestions.length === 0 ? (
          <div className="eod-empty">
            <div className="eod-empty-icon">📅</div>
            <div>not enough history yet — add a few more {tomorrow.label}s to see patterns here</div>
          </div>
        ) : (
          <>
            <div className="eod-list">
              {suggestions.map((s, i) => (
                <label key={i} className={`eod-item${checked.has(i) ? ' on' : ''}`}>
                  <input
                    type="checkbox"
                    className="eod-check"
                    checked={checked.has(i)}
                    onChange={() => toggle(i)}
                  />
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

            <div className="eod-actions">
              <button className="eod-skip" onClick={closeEodPlan}>maybe later</button>
              <button
                className="eod-schedule"
                onClick={handleSchedule}
                disabled={checked.size === 0}
              >
                schedule {checked.size} block{checked.size !== 1 ? 's' : ''} →
              </button>
            </div>

            <div className="eod-footer">
              blocks will be added to {tomorrow.label} · you can edit them anytime
            </div>
          </>
        )}
      </div>
    </div>
  )
}
