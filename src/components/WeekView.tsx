import { useState } from 'react'
import { useStore } from '../store'
import { DAYS } from '../constants'
import { weekStart, dateStr, todayStr, parseLocalDate } from '../utils'
import CalendarGrid from './CalendarGrid'
import type { Deadline } from '../types'
import DeadlineModal, { PRIORITY_COLORS } from './DeadlineModal'

export default function WeekView() {
  const { wOff, setView, setSelDate, deadlines } = useStore()
  const [dlModal, setDlModal] = useState<{ date: string; deadline?: Deadline } | null>(null)

  const ws = weekStart(wOff)
  const dates = Array.from({ length: 7 }, (_, i) => dateStr(ws, i))
  const td = todayStr()

  const getDate = (i: number) => dateStr(weekStart(wOff), i)

  // Group deadlines by date
  const deadlinesByDate: Record<string, Deadline[]> = {}
  deadlines.forEach(d => {
    if (!deadlinesByDate[d.date]) deadlinesByDate[d.date] = []
    deadlinesByDate[d.date].push(d)
  })

  const handleDateClick = (date: string) => {
    setSelDate(date)
    setView('day')
  }

  return (
    <div id="week-view" style={{ display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
      {/* Week header */}
      <div id="wk-head" style={{ gridTemplateColumns: `56px repeat(7, 1fr)` }}>
        <div className="whs" />
        {dates.map((date) => {
          const dt = parseLocalDate(date)
          const isToday = date === td
          const dls = deadlinesByDate[date] || []
          return (
            <div key={date} className={`whd${isToday ? ' tod' : ''}`}>
              <div
                className={`whd-name${isToday ? ' t' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => handleDateClick(date)}
              >
                {DAYS[dt.getDay()]}
              </div>
              <div
                className={`whd-num${isToday ? ' t' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => handleDateClick(date)}
              >
                {dt.getDate()}
              </div>

              {/* Deadline area */}
              <div className="whd-dl">
                {dls.slice(0, 2).map(dl => (
                  <div
                    key={dl.id}
                    className={`whd-dl-chip${dl.done ? ' done' : ''}`}
                    style={{ borderLeftColor: dl.color || PRIORITY_COLORS[dl.priority] }}
                    onClick={e => { e.stopPropagation(); setDlModal({ date, deadline: dl }) }}
                    title={dl.name + (dl.course ? ` · ${dl.course}` : '')}
                  >
                    <span className="whd-dl-dot" style={{ background: dl.color || PRIORITY_COLORS[dl.priority] }} />
                    <span className="whd-dl-name">{dl.name}</span>
                  </div>
                ))}
                {dls.length > 2 && (
                  <span className="whd-dl-more">+{dls.length - 2} more</span>
                )}
                <button
                  className={`whd-dl-add${dls.length === 0 ? ' empty' : ''}`}
                  onClick={e => { e.stopPropagation(); setDlModal({ date }) }}
                  title="add deadline for this day"
                >📌</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Scroll container */}
      <div id="gs" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
        <div id="cal-wrap">
          <CalendarGrid scrollId="gs" numDays={7} getDate={getDate} />
        </div>
      </div>

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
