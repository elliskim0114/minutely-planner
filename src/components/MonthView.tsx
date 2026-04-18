import { useState } from 'react'
import { useStore } from '../store'
import { MONTHS } from '../constants'
import { totalDayMinutes, toM, todayStr } from '../utils'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function MonthView() {
  const { blocks, cfg, view, setView } = useStore()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const today = todayStr()
  const tm = totalDayMinutes(cfg)

  // Block stats per date
  const blockMinsByDate: Record<string, number> = {}
  const blockCountByDate: Record<string, number> = {}
  const blockTypesByDate: Record<string, Set<string>> = {}
  blocks.forEach(b => {
    blockCountByDate[b.date] = (blockCountByDate[b.date] || 0) + 1
    blockMinsByDate[b.date] = (blockMinsByDate[b.date] || 0) + (toM(b.end) - toM(b.start))
    if (!blockTypesByDate[b.date]) blockTypesByDate[b.date] = new Set()
    blockTypesByDate[b.date].add(b.type)
  })

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

  // Build cells: leading empty + day cells + trailing empty to fill full rows
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  // Type → dot color class (matching block colors)
  const typeClass: Record<string, string> = {
    focus: 'tf', routine: 'tr', study: 'ts', free: 'tl', gcal: 'tg2', custom: 'td',
  }

  return (
    <div className={`mv-wrap${view === 'month' ? ' on' : ''}`}>
      <div className="mv-inner">

        {/* Month navigation header */}
        <div className="mv-hdr">
          <button className="mv-nav-btn" onClick={() => navMonth(-1)}>‹</button>
          <div className="mv-title">{MONTHS[month]} {year}</div>
          <button className="mv-nav-btn" onClick={() => navMonth(1)}>›</button>
        </div>

        {/* Day-of-week labels */}
        <div className="mv-grid">
          {DOW.map(d => (
            <div key={d} className="mv-dow">{d}</div>
          ))}

          {/* Day cells */}
          {cells.map((day, i) => {
            if (day === null) return <div key={i} className="mv-cell mv-empty" />

            const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const mins = blockMinsByDate[ds] || 0
            const count = blockCountByDate[ds] || 0
            const pct = tm > 0 ? Math.min(100, (mins / tm) * 100) : 0
            const isToday = ds === today
            const isPast = ds < today
            const types = blockTypesByDate[ds] ? Array.from(blockTypesByDate[ds]).slice(0, 4) : []

            return (
              <div
                key={i}
                className={`mv-cell${isToday ? ' today' : ''}${isPast ? ' past' : ''}${count > 0 ? ' has-blocks' : ''}`}
                onClick={() => goToDay(day)}
                title={count > 0 ? `${count} block${count !== 1 ? 's' : ''} · ${Math.round(mins / 60 * 10) / 10}h planned` : ds}
              >
                <div className="mv-day-num">{day}</div>

                {/* Type dots */}
                {types.length > 0 && (
                  <div className="mv-dots">
                    {types.map(t => (
                      <span key={t} className={`mv-dot tc ${typeClass[t] || 'td'}`} />
                    ))}
                  </div>
                )}

                {/* Density bar */}
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
          <span className="mv-leg-item"><span className="mv-leg-dot tc tf" />focus</span>
          <span className="mv-leg-item"><span className="mv-leg-dot tc tr" />routine</span>
          <span className="mv-leg-item"><span className="mv-leg-dot tc ts" />study</span>
          <span className="mv-leg-item"><span className="mv-leg-dot tc tl" />free</span>
          <span className="mv-leg-sep" />
          <span className="mv-leg-hint">click a day to open it</span>
        </div>
      </div>
    </div>
  )
}
