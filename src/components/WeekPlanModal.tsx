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

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface DaySuggestion {
  name: string
  start: string
  end: string
  type: Block['type']
  customName: string | null
  count: number
  isDaily: boolean
}

const TYPE_DOTS: Record<string, string> = {
  focus: 'var(--bfbd)', routine: 'var(--brbd)', study: 'var(--bsbd)',
  free: 'var(--blbd)', custom: 'var(--acc)', gcal: 'var(--bd2)',
}

export default function WeekPlanModal() {
  const { closeWeekPlan, blocks, bulkAddBlocks, cfg, goals, intentions } = useStore()
  const ws = cfg.ws ?? 0   // week start: 0=Sun, 1=Mon, …
  const [ritualStep, setRitualStep] = useState<'review' | 'goals' | 'blocks'>('review')
  const [goalIntentions, setGoalIntentions] = useState<Record<number, number>>({})  // goalId → intended hours this week

  // Next 7 days starting from tomorrow (which is the first day of next week)
  const weekDays = useMemo(() => {
    const days: { date: string; dow: number; label: string; shortLabel: string }[] = []
    const base = new Date(); base.setDate(base.getDate() + 1)
    for (let i = 0; i < 7; i++) {
      const d = new Date(base); d.setDate(base.getDate() + i)
      days.push({
        date: getLocalDateStr(d),
        dow: d.getDay(),
        label: DAY_FULL[d.getDay()],
        shortLabel: DAY_NAMES[d.getDay()],
      })
    }
    return days
  }, [])

  // Pattern detection for every day of next week
  const weekSuggestions = useMemo(() => {
    const now = new Date()
    const since = new Date(now); since.setDate(since.getDate() - 28)
    const sinceStr = getLocalDateStr(since)

    const allPastDates: string[] = []
    for (let i = 1; i <= 28; i++) {
      const d = new Date(now); d.setDate(d.getDate() - i)
      allPastDates.push(getLocalDateStr(d))
    }

    const historicBlocks = blocks.filter(b => b.date >= sinceStr)
    const nextWeekDates = new Set(weekDays.map(d => d.date))

    const result: Record<string, DaySuggestion[]> = {}

    weekDays.forEach(day => {
      // Same-DOW dates in the past
      const dowDates = new Set(allPastDates.filter(d => new Date(d + 'T12:00').getDay() === day.dow))

      // Blocks already on this day
      const existingNames = new Set(
        blocks.filter(b => b.date === day.date).map(b => b.name.toLowerCase().trim())
      )

      // Group blocks by name
      const grouped: Record<string, {
        starts: number[]; ends: number[]
        typeCounts: Record<string, number>
        customNameCounts: Record<string, number>
        allDates: Set<string>; dowDates: Set<string>
      }> = {}

      historicBlocks.filter(b => !nextWeekDates.has(b.date)).forEach(b => {
        const key = b.name.toLowerCase().trim()
        if (!grouped[key]) grouped[key] = {
          starts: [], ends: [],
          typeCounts: {}, customNameCounts: {},
          allDates: new Set(), dowDates: new Set(),
        }
        grouped[key].starts.push(toM(b.start))
        grouped[key].ends.push(toM(b.end))
        grouped[key].typeCounts[b.type] = (grouped[key].typeCounts[b.type] || 0) + 1
        const cn = b.customName ?? ''
        grouped[key].customNameCounts[cn] = (grouped[key].customNameCounts[cn] || 0) + 1
        grouped[key].allDates.add(b.date)
        if (dowDates.has(b.date)) grouped[key].dowDates.add(b.date)
      })

      result[day.date] = Object.entries(grouped)
        .filter(([key, g]) => {
          if (existingNames.has(key)) return false
          return g.dowDates.size >= 2 || g.allDates.size >= 10
        })
        .map(([key, g]) => {
          const avgStart = Math.round(g.starts.reduce((a, b) => a + b, 0) / g.starts.length)
          const avgEnd   = Math.round(g.ends.reduce((a, b) => a + b, 0) / g.ends.length)
          const s = Math.round(avgStart / 15) * 15
          const e = Math.max(Math.round(avgEnd / 15) * 15, s + 15)
          const original = historicBlocks
            .filter(b => b.name.toLowerCase().trim() === key)
            .sort((a, b) => b.date.localeCompare(a.date))[0]
          // Pick most-frequently-used type
          const type = (Object.entries(g.typeCounts)
            .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'free') as Block['type']
          // Pick most-frequently-used customName (ignore empty/null)
          const cnEntries = Object.entries(g.customNameCounts)
            .filter(([k]) => k !== '')
            .sort((a, b) => b[1] - a[1])
          const customName = cnEntries.length > 0 ? cnEntries[0][0] : null
          return {
            name: original?.name ?? key,
            start: formatTime(s),
            end: formatTime(e),
            type,
            customName,
            count: g.allDates.size,
            isDaily: g.allDates.size >= 10,
          }
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 6)
    })

    return result
  }, [blocks, weekDays])

  const [activeDay, setActiveDay] = useState(weekDays[0]?.date ?? '')

  // checked[date][idx] = true/false
  const [checked, setChecked] = useState<Record<string, Set<number>>>(() => {
    const init: Record<string, Set<number>> = {}
    weekDays.forEach(day => {
      init[day.date] = new Set((weekSuggestions[day.date] || []).map((_, i) => i))
    })
    return init
  })

  const toggle = (date: string, idx: number) => {
    setChecked(prev => {
      const s = new Set(prev[date] ?? [])
      s.has(idx) ? s.delete(idx) : s.add(idx)
      return { ...prev, [date]: s }
    })
  }

  const totalSelected = weekDays.reduce((sum, day) => {
    return sum + (checked[day.date]?.size ?? 0)
  }, 0)

  const daysWithSelections = weekDays.filter(d => (checked[d.date]?.size ?? 0) > 0).length

  const handleSchedule = () => {
    const toAdd: Array<{ name: string; start: string; end: string; type: Block['type']; date: string; customName: string | null }> = []
    weekDays.forEach(day => {
      const suggs = weekSuggestions[day.date] || []
      const sel = checked[day.date] ?? new Set()
      suggs.forEach((s, i) => {
        if (sel.has(i)) toAdd.push({ name: s.name, start: s.start, end: s.end, type: s.type, date: day.date, customName: s.customName })
      })
    })
    if (toAdd.length > 0) bulkAddBlocks(toAdd)
    closeWeekPlan()
    useStore.getState().showToast(`${toAdd.length} blocks scheduled across next week`)
  }

  const activeSuggestions = weekSuggestions[activeDay] ?? []
  const activeDayInfo = weekDays.find(d => d.date === activeDay)

  const totalSuggestionsAcrossWeek = weekDays.reduce((s, d) => s + (weekSuggestions[d.date]?.length ?? 0), 0)

  // ── Last week's at-a-glance stats ──
  const lastWeekDates = useMemo(() => {
    const dates: string[] = []
    for (let i = 14; i >= 8; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      dates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`)
    }
    return dates
  }, [])
  const lastWeekBlocks = blocks.filter(b => lastWeekDates.includes(b.date))
  const lastWeekFocusH = Math.round(lastWeekBlocks.filter(b => b.type === 'focus').reduce((s, b) => s + toM(b.end) - toM(b.start), 0) / 60 * 10) / 10
  const lastWeekTotalH = Math.round(lastWeekBlocks.reduce((s, b) => s + toM(b.end) - toM(b.start), 0) / 60 * 10) / 10
  const lastWeekHealthScores = lastWeekDates.map(date => {
    const dayBlocks = blocks.filter(b => b.date === date)
    const pm = dayBlocks.reduce((s, b) => s + toM(b.end) - toM(b.start), 0)
    const tm = 17 * 60
    const pct = Math.min(100, Math.round((pm / tm) * 100))
    const hasFocus = dayBlocks.some(b => b.type === 'focus')
    const hasBuffer = dayBlocks.some(b => (b.type === 'free' || b.type === 'routine') && (toM(b.end) - toM(b.start)) >= 15)
    const int = intentions[date] || { e: 0, p: ['', '', ''] }
    let score = 50
    if (pct >= 60 && pct <= 85) score += 20
    else if (pct > 85 && pct <= 95) score += 5
    else if (pct > 95) score -= 15
    else if (pct >= 40) score += 10
    if (hasFocus) score += 15
    if (hasBuffer) score += 15
    if (int.p.filter(Boolean).length > 0 && dayBlocks.length > 0) score += 10
    if (dayBlocks.length >= 3) score += 5
    if (int.e > 0) score += 5
    return Math.max(0, Math.min(100, score))
  })
  const lastWeekAvgHealth = Math.round(lastWeekHealthScores.reduce((a, b) => a + b, 0) / lastWeekHealthScores.length)
  const lastWeekGrade = lastWeekAvgHealth >= 90 ? 'A' : lastWeekAvgHealth >= 75 ? 'B' : lastWeekAvgHealth >= 60 ? 'C' : lastWeekAvgHealth >= 45 ? 'D' : 'F'
  const lastWeekGradeColor = lastWeekAvgHealth >= 90 ? '#4CAF8A' : lastWeekAvgHealth >= 75 ? '#7BB3FF' : lastWeekAvgHealth >= 60 ? '#E8C24A' : '#FF7070'

  // Goal hours last week
  const goalHoursLastWeek = (gid: number) =>
    Math.round(lastWeekBlocks.filter(b => b.goalId === gid).reduce((s, b) => s + toM(b.end) - toM(b.start), 0) / 60 * 10) / 10

  return (
    <div className="eod-overlay" onClick={e => { if (e.target === e.currentTarget) closeWeekPlan() }}>
      <div className="eod-box wpm-box wpm-ritual-box">

        {/* Step indicator */}
        <div className="eod-steps">
          {(['review', 'goals', 'blocks'] as const).map(s => (
            <div key={s} className={`eod-step-pip${ritualStep === s ? ' active' : (ritualStep === 'goals' && s === 'review') || ritualStep === 'blocks' ? ' done' : ''}`} />
          ))}
        </div>
        <button className="eod-close" onClick={closeWeekPlan}>×</button>

        {/* ── Step: Review last week ── */}
        {ritualStep === 'review' && (
          <div className="eod-step-content">
            <div className="eod-ritual-icon">📊</div>
            <div className="eod-ritual-title">last week at a glance</div>
            <div className="eod-ritual-sub">before you plan — here's how last week went</div>

            <div className="wpm-stats-grid">
              <div className="wpm-stat">
                <div className="wpm-stat-val">{lastWeekTotalH}h</div>
                <div className="wpm-stat-lbl">total scheduled</div>
              </div>
              <div className="wpm-stat">
                <div className="wpm-stat-val">{lastWeekFocusH}h</div>
                <div className="wpm-stat-lbl">focus time</div>
              </div>
              <div className="wpm-stat">
                <div className="wpm-stat-val" style={{ color: lastWeekGradeColor }}>{lastWeekGrade}</div>
                <div className="wpm-stat-lbl">plan health</div>
              </div>
              <div className="wpm-stat">
                <div className="wpm-stat-val">{lastWeekBlocks.length}</div>
                <div className="wpm-stat-lbl">blocks</div>
              </div>
            </div>

            {goals.length > 0 && (
              <div className="wpm-goal-recap">
                <div className="eod-section-lbl" style={{ margin: '14px 0 8px' }}>goal progress last week</div>
                {goals.map(g => {
                  const actual = goalHoursLastWeek(g.id)
                  const pct = g.targetHours > 0 ? Math.min(100, Math.round((actual / g.targetHours) * 100)) : 0
                  return (
                    <div key={g.id} className="wpm-goal-row">
                      <div className="wpm-goal-hdr">
                        <span className="wpm-goal-dot" style={{ background: g.color }} />
                        <span className="wpm-goal-name">{g.name}</span>
                        <span className="wpm-goal-val">{actual}h / {g.targetHours}h · {pct}%</span>
                      </div>
                      <div className="wpm-goal-bar">
                        <div className="wpm-goal-fill" style={{ width: `${pct}%`, background: g.color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <button className="eod-schedule eod-next-btn" style={{ marginTop: 16 }} onClick={() => setRitualStep('goals')}>
              plan next week →
            </button>
          </div>
        )}

        {/* ── Step: Goal intentions ── */}
        {ritualStep === 'goals' && (
          <div className="eod-step-content">
            <div className="eod-ritual-icon">🎯</div>
            <div className="eod-ritual-title">set your intentions</div>
            <div className="eod-ritual-sub">how many hours do you want to spend on each goal this week?</div>

            {goals.length === 0 ? (
              <div className="eod-empty" style={{ marginTop: 16 }}>
                <div>no goals set yet — you can add goals in the analytics view</div>
              </div>
            ) : (
              <div className="wpm-goal-intentions">
                {goals.map(g => {
                  const val = goalIntentions[g.id] ?? g.targetHours
                  return (
                    <div key={g.id} className="wpm-intent-row">
                      <span className="wpm-goal-dot" style={{ background: g.color }} />
                      <span className="wpm-intent-name">{g.name}</span>
                      <div className="wpm-intent-ctrl">
                        <button
                          className="wpm-int-step"
                          onClick={() => setGoalIntentions(p => ({ ...p, [g.id]: Math.max(0, (p[g.id] ?? g.targetHours) - 0.5) }))}
                        >−</button>
                        <span className="wpm-int-val">{val}h</span>
                        <button
                          className="wpm-int-step"
                          onClick={() => setGoalIntentions(p => ({ ...p, [g.id]: (p[g.id] ?? g.targetHours) + 0.5 }))}
                        >+</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="eod-skip" onClick={() => setRitualStep('review')}>← back</button>
              <button className="eod-schedule eod-next-btn" onClick={() => setRitualStep('blocks')}>
                pick blocks →
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Block suggestions (existing logic) ── */}
        {ritualStep === 'blocks' && (
          <>
            {/* Header */}
            <div className="eod-hdr" style={{ marginBottom: 0 }}>
              <div className="eod-hdr-icon">🗓</div>
              <div className="eod-hdr-text">
                <div className="eod-title">block suggestions</div>
                <div className="eod-sub">based on your habits — pick what you want scheduled</div>
              </div>
            </div>

        {totalSuggestionsAcrossWeek === 0 ? (
          <div className="eod-empty">
            <div className="eod-empty-icon">📅</div>
            <div>not enough history yet — keep logging your week and patterns will emerge</div>
          </div>
        ) : (
          <>
            {/* Day tabs */}
            <div className="wpm-tabs">
              {weekDays.map(day => {
                const selCount = checked[day.date]?.size ?? 0
                const totalCount = weekSuggestions[day.date]?.length ?? 0
                return (
                  <button
                    key={day.date}
                    className={`wpm-tab${activeDay === day.date ? ' on' : ''}`}
                    onClick={() => setActiveDay(day.date)}
                  >
                    <span className="wpm-tab-day">{day.shortLabel}</span>
                    {totalCount > 0 && (
                      <span className={`wpm-tab-badge${selCount > 0 ? ' sel' : ''}`}>{selCount}/{totalCount}</span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Day header */}
            {activeDayInfo && (
              <div className="wpm-day-hdr">
                <span className="wpm-day-name">{activeDayInfo.label}</span>
                <span className="wpm-day-date">{new Date(activeDayInfo.date + 'T12:00').toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
                {activeSuggestions.length > 0 && (
                  <button className="wpm-toggle-all" onClick={() => {
                    const sel = checked[activeDay] ?? new Set()
                    const allOn = sel.size === activeSuggestions.length
                    setChecked(prev => ({
                      ...prev,
                      [activeDay]: allOn ? new Set() : new Set(activeSuggestions.map((_, i) => i))
                    }))
                  }}>
                    {(checked[activeDay]?.size ?? 0) === activeSuggestions.length ? 'deselect all' : 'select all'}
                  </button>
                )}
              </div>
            )}

            {/* Suggestions list */}
            <div className="eod-list wpm-list">
              {activeSuggestions.length === 0 ? (
                <div className="wpm-empty-day">no patterns found for this day yet</div>
              ) : (
                activeSuggestions.map((s, i) => (
                  <label key={i} className={`eod-item${checked[activeDay]?.has(i) ? ' on' : ''}`}>
                    <input
                      type="checkbox"
                      className="eod-check"
                      checked={checked[activeDay]?.has(i) ?? false}
                      onChange={() => toggle(activeDay, i)}
                    />
                    <div className="eod-item-dot" style={{ background: TYPE_DOTS[s.type] || 'var(--acc)' }} />
                    <div className="eod-item-info">
                      <div className="eod-item-name">{s.name}</div>
                      <div className="eod-item-meta">
                        {s.start}–{s.end}
                        <span className="eod-item-freq">
                          {s.isDaily ? ' · daily habit' : ` · ${s.count}× recently`}
                        </span>
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>

            <div className="eod-actions">
              <button className="eod-skip" onClick={() => setRitualStep('goals')}>← back</button>
              <button
                className="eod-schedule"
                onClick={handleSchedule}
                disabled={totalSelected === 0}
              >
                schedule {totalSelected} block{totalSelected !== 1 ? 's' : ''} across {daysWithSelections} day{daysWithSelections !== 1 ? 's' : ''} →
              </button>
            </div>

            <div className="eod-footer">
              blocks will be added to each day · you can edit them anytime
            </div>
          </>
        )}
          </>
        )}
      </div>
    </div>
  )
}
