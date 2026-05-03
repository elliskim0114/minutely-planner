import { useState } from 'react'
import { useStore } from '../store'
import { DAYS, MONTHS } from '../constants'
import { todayStr, parseLocalDate } from '../utils'
import CalendarGrid from './CalendarGrid'
import type { Deadline } from '../types'
import DeadlineModal, { PRIORITY_COLORS } from './DeadlineModal'

export default function DayView() {
  const { selDate, deadlines } = useStore()
  const [dlModal, setDlModal] = useState<{ date: string; deadline?: Deadline } | null>(null)

  const date = selDate || todayStr()
  const dt = parseLocalDate(date)
  const dls = deadlines.filter(d => d.date === date)

  return (
    <div id="day-view" style={{ display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
      {/* Day header */}
      <div id="dv-hdr">
        <div>
          <div className="dvh-d">{dt.getDate()} {MONTHS[dt.getMonth()]}</div>
          <div className="dvh-n">{DAYS[dt.getDay()]} {dt.getFullYear()}</div>
        </div>

        {/* Deadline chips + add button */}
        <div className="dvh-dls">
          {dls.map(dl => (
            <button
              key={dl.id}
              className={`dvh-dl-chip${dl.done ? ' done' : ''}`}
              style={{ borderColor: dl.color || PRIORITY_COLORS[dl.priority] }}
              onClick={() => setDlModal({ date, deadline: dl })}
              title={dl.name + (dl.course ? ` · ${dl.course}` : '')}
            >
              <span className="dvh-dl-dot" style={{ background: dl.color || PRIORITY_COLORS[dl.priority] }} />
              <span className="dvh-dl-name">
                {dl.name}
                {dl.course && <span className="dvh-dl-course"> · {dl.course}</span>}
              </span>
            </button>
          ))}
          <button className="dvh-dl-add" onClick={() => setDlModal({ date })}>
            📌 add deadline
          </button>
        </div>
      </div>

      {/* Scroll container */}
      <div id="ds" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
        <CalendarGrid scrollId="ds" numDays={1} getDate={() => date} />
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
