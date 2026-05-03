import { useState } from 'react'
import { useStore } from '../store'
import { MONTHS } from '../constants'
import { totalDayMinutes, toM, todayStr } from '../utils'
import type { Deadline } from '../types'
import DeadlineModal, { PRIORITY_COLORS } from './DeadlineModal'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const TYPE_LABELS: Record<string, string> = {
  focus: 'focus', routine: 'routine', study: 'study', free: 'free',
}
const TYPE_CLASS: Record<string, string> = {
  focus: 'tf', routine: 'tr', study: 'ts', free: 'tl', gcal: 'tg2', custom: 'td',
}
const FILTER_TYPES = ['focus', 'routine', 'study', 'free']
const TYPE_ORDER = ['focus', 'routine', 'study', 'free', 'gcal', 'custom']

const TYPE_EMOJI: Record<string, string> = {
  focus: '🎯', routine: '⚡', study: '📖', free: '☁️',
}

export default function MonthView() {
  const { blocks, cfg, view, setView, deadlines } = useStore()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [filter, setFilter] = useState<string | null>(null)
  const [dlModal, setDlModal] = useState<{ date: string; deadline?: Deadline } | null>(null)

  const today = todayStr()
  const tm = totalDayMinutes(cfg)

  // Block stats per date
  const blockMinsByDate: Record<string, number> = {}
  const blockCountByDate: Record<string, number> = {}
  const blockTypesByDate: Record<string, Set<string>> = {}
  const blockMinsByDateByType: Record<string, Record<string, number>> = {}

  blocks.forEach(b => {
    const mins = toM(b.end) - toM(b.start)
    blockCountByDate[b.date] = (blockCountByDate[b.date] || 0) + 1
    blockMinsByDate[b.date] = (blockMinsByDate[b.date] || 0) + mins
    if (!blockTypesByDate[b.date]) blockTypesByDate[b.date] = new Set()
    blockTypesByDate[b.date].add(b.type)
    if (!blockMinsByDateByType[b.date]) blockMinsByDateByType[b.date] = {}
    blockMinsByDateByType[b.date][b.type] = (blockMinsByDateByType[b.date][b.type] || 0) + mins
  })

  // Deadlines grouped by date
  const deadlinesByDate: Record<string, Deadline[]> = {}
  deadlines.forEach(d => {
    if (!deadlinesByDate[d.date]) deadlinesByDate[d.date] = []
    deadlinesByDate[d.date].push(d)
  })

  // Upcoming strip: not done, on or after today, next 5
  const upcoming = deadlines
    .filter(d => !d.done && d.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5)

  const daysUntil = (ds: string) =>
    Math.round((new Date(ds + 'T12:00').getTime() - new Date(today + 'T12:00').getTime()) / 86400000)

  // Month stats (per-type totals)
  const monthDates = Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
  })
  const monthMins = monthDates.reduce((s, d) => s + (blockMinsByDate[d] || 0), 0)
  const scheduledDays = monthDates.filter(d => (blockCountByDate[d] || 0) > 0).length

  const monthTypeHours: Record<string, number> = {}
  for (const d of monthDates) {
    const typeMap = blockMinsByDateByType[d] || {}
    for (const [t, m] of Object.entries(typeMap)) {
      monthTypeHours[t] = (monthTypeHours[t] || 0) + m / 60
    }
  }

  const navMonth = (dir: number) => {
    let nm = month + dir
    let ny = year
    if (nm < 0) { nm = 11; ny-- }
    if (nm > 11) { nm = 0; ny++ }
    setMonth(nm)
    setYear(ny)
  }

  const goToDay = (day: number) => {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    useStore.getState().setSelDate(ds)
    setView('day')
  }

  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className={`mv-wrap${view === 'month' ? ' on' : ''}`}>
      <div className="mv-inner">

        {/* Header */}
        <div className="mv-hdr">
          <button className="mv-nav-btn" onClick={() => navMonth(-1)}>‹</button>
          <div className="mv-hdr-center">
            <div className="mv-title">{MONTHS[month]} {year}</div>
            {scheduledDays > 0 && (
              <div className="mv-stats">
                {(monthMins / 60).toFixed(1)}h planned · {scheduledDays} day{scheduledDays !== 1 ? 's' : ''}
              </div>
            )}
          </div>
          <button className="mv-nav-btn" onClick={() => navMonth(1)}>›</button>
        </div>

        {/* Month type breakdown */}
        {monthMins > 0 && (
          <div className="mv-type-summary">
            {TYPE_ORDER.filter(t => monthTypeHours[t]).map(t => (
              <div key={t} className={`mv-type-sum-item mv-tsi-${t}`}>
                <span className="mv-tsi-dot" />
                <span className="mv-tsi-label">{TYPE_LABELS[t] || t}</span>
                <span className="mv-tsi-val">{monthTypeHours[t].toFixed(1)}h</span>
              </div>
            ))}
          </div>
        )}

        {/* Filter pills */}
        <div className="mv-filters">
          {FILTER_TYPES.map(t => (
            <button
              key={t}
              className={`mv-filter-btn mv-fb-${t}${filter === t ? ' active' : ''}`}
              onClick={() => setFilter(filter === t ? null : t)}
            >
              <span className="mv-fb-emoji">{TYPE_EMOJI[t]}</span>
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Upcoming deadlines strip */}
        {upcoming.length > 0 && (
          <div className="mv-upcoming">
            <span className="mv-upcoming-lbl">📌</span>
            {upcoming.map(d => {
              const n = daysUntil(d.date)
              const urgentColor = n <= 1 ? '#ef4444' : n <= 3 ? '#f59e0b' : 'var(--ink4)'
              return (
                <button
                  key={d.id}
                  className="mv-upcoming-chip"
                  style={{ borderColor: d.color || PRIORITY_COLORS[d.priority] }}
                  onClick={() => setDlModal({ date: d.date, deadline: d })}
                >
                  <span className="mv-uc-dot" style={{ background: d.color || PRIORITY_COLORS[d.priority] }} />
                  <span className="mv-uc-name">
                    {d.name}{d.course ? <span className="mv-uc-course"> · {d.course}</span> : null}
                  </span>
                  <span className="mv-uc-due" style={{ color: urgentColor }}>
                    {n === 0 ? 'today!' : n === 1 ? 'tomorrow' : `${n}d`}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Calendar grid */}
        <div className="mv-grid">
          {DOW.map(d => (
            <div key={d} className="mv-dow">{d}</div>
          ))}

          {cells.map((day, i) => {
            if (day === null) return <div key={i} className="mv-empty" />

            const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const mins = blockMinsByDate[ds] || 0
            const count = blockCountByDate[ds] || 0
            const pct = tm > 0 ? Math.min(100, (mins / tm) * 100) : 0
            const isToday = ds === today
            const isPast = ds < today
            const types = blockTypesByDate[ds] ? Array.from(blockTypesByDate[ds]) : []
            const dls = deadlinesByDate[ds] || []

            const matchesFilter = !filter || types.includes(filter)
            const dimmed = filter !== null && !matchesFilter

            const typeMap = blockMinsByDateByType[ds] || {}
            const totalCellMins = Object.values(typeMap).reduce((a, b) => a + b, 0)
            const typeBars = TYPE_ORDER
              .filter(t => (typeMap[t] || 0) > 0)
              .map(t => ({
                type: t,
                pct: totalCellMins > 0 ? (typeMap[t] / totalCellMins) * 100 : 0,
              }))

            return (
              <div
                key={i}
                className={`mv-cell${isToday ? ' today' : ''}${isPast ? ' past' : ''}${count > 0 ? ' has-blocks' : ''}${dimmed ? ' dimmed' : ''}${dls.length > 0 ? ' has-deadlines' : ''}`}
                onClick={() => goToDay(day)}
                title={count > 0 ? `${count} block${count !== 1 ? 's' : ''} · ${(mins / 60).toFixed(1)}h` : undefined}
              >
                <div className="mv-day-num">{day}</div>

                {/* Add deadline button — shown on cell hover */}
                <button
                  className="mv-dl-add"
                  onClick={e => { e.stopPropagation(); setDlModal({ date: ds }) }}
                  title="add deadline for this day"
                >📌</button>

                {/* Colored type stack bars */}
                {typeBars.length > 0 && (
                  <div className="mv-type-stack">
                    {typeBars.map(({ type, pct: p }) => (
                      <div
                        key={type}
                        className={`mv-type-seg ${TYPE_CLASS[type] || 'td'}${filter === type ? ' hl' : ''}`}
                        style={{ width: `${p}%` }}
                      />
                    ))}
                  </div>
                )}

                {/* Deadline chips */}
                {dls.slice(0, 2).map(dl => (
                  <div
                    key={dl.id}
                    className={`mv-dl-chip${dl.done ? ' done' : ''}`}
                    style={{ borderLeftColor: dl.color || PRIORITY_COLORS[dl.priority] }}
                    onClick={e => { e.stopPropagation(); setDlModal({ date: ds, deadline: dl }) }}
                    title={dl.name + (dl.course ? ` · ${dl.course}` : '')}
                  >
                    <span className="mv-dl-dot" style={{ background: dl.color || PRIORITY_COLORS[dl.priority] }} />
                    <span className="mv-dl-name">{dl.name}</span>
                  </div>
                ))}
                {dls.length > 2 && (
                  <span className="mv-dl-more">+{dls.length - 2} more</span>
                )}

                {/* Density fill bar at bottom */}
                {count > 0 && (
                  <div className="mv-bar-wrap">
                    <div className="mv-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="mv-legend">
          <span className="mv-leg-hint">click a day to open · hover a day to add a deadline 📌</span>
        </div>
      </div>

      {/* Deadline modal */}
      {dlModal && (
        <DeadlineModal
          date={dlModal.date}
          deadline={dlModal.deadline}
          onClose={() => setDlModal(null)}
        />
      )}
    </div>
  )
}
