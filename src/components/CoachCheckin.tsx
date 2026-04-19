import { useState, useMemo } from 'react'
import { useStore } from '../store'
import { todayStr, toM } from '../utils'
import type { Block } from '../types'

const MESSAGES = [
  "hey — how's the day going?",
  "checking in — still on track?",
  "quick check: feeling good about your plan?",
  "how's the energy? need any help reshuffling?",
  "hey, how's it going? day too packed or all good?",
]

type Step =
  | { kind: 'classify'; name: string }
  | { kind: 'habit-bad'; id: number; name: string }
  | { kind: 'habit-good'; id: number; name: string }

export default function CoachCheckin() {
  const {
    closeCheckin, openCoachAt, blocks, cfg,
    bulkAddBlocks, habits, habitLogs, logHabit, addHabit,
    habitClassifyPending, setHabitClassifyPending,
    habitNotAHabit, dismissHabitClassify,
    suppressCheckinThisHour,
    dismissedSuggestions, dismissSuggestion,
  } = useStore()

  const [qIdx, setQIdx] = useState(0)

  const now = new Date()
  const hour = now.getHours()
  const msg = MESSAGES[hour % MESSAGES.length]

  const td = todayStr()
  const nowM = hour * 60 + now.getMinutes()
  const todayBlocks = blocks.filter(b => b.date === td)
  const totalMins = todayBlocks.reduce((s, b) => s + toM(b.end) - toM(b.start), 0)
  const dayMins = toM(cfg.de) - toM(cfg.ds)
  const pct = dayMins > 0 ? Math.round((totalMins / dayMins) * 100) : 0

  const hint = pct > 90
    ? 'your day looks pretty stacked 👀'
    : pct < 20 && nowM > toM(cfg.ds) + 60
    ? 'day looks light — want help filling it in?'
    : null

  // ── Retroactive classify: only blocks that appear 3+ times in all history ──
  const unclassifiedNames = useMemo(() => {
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const cutoffStr = sevenDaysAgo.toISOString().slice(0, 10)

    // Count total occurrences of each block name (all time)
    const totalCounts: Record<string, { count: number; canonical: string }> = {}
    for (const b of blocks) {
      if (b.type === 'gcal') continue
      const lower = b.name.toLowerCase()
      if (!totalCounts[lower]) totalCounts[lower] = { count: 0, canonical: b.name }
      totalCounts[lower].count++
    }

    // Which names appeared in the last 7 days?
    const recentNames = new Set<string>()
    for (const b of blocks) {
      if (b.date >= cutoffStr && b.type !== 'gcal') recentNames.add(b.name.toLowerCase())
    }

    // Only suggest names with 3+ total occurrences that are recent and unclassified
    const names: string[] = []
    for (const [lower, { count, canonical }] of Object.entries(totalCounts)) {
      if (count < 3) continue
      if (!recentNames.has(lower)) continue
      if (habits.some(h => h.name.toLowerCase() === lower)) continue
      if (habitNotAHabit.includes(lower)) continue
      // Don't include the explicit pending classify (it'll show first)
      if (habitClassifyPending && lower === habitClassifyPending.toLowerCase()) continue
      names.push(canonical)
      if (names.length >= 2) break  // max 2 retroactive suggestions
    }
    return names
  }, [blocks, habits, habitNotAHabit, habitClassifyPending]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pending habit logs ──
  const todayLogs = habitLogs[td] || {}
  const pendingHabits = habits.filter(h => todayLogs[h.id] === undefined)
  const pendingGood = pendingHabits.filter(h => {
    if (h.kind !== 'good') return false
    const done = todayBlocks.some(b => b.name.toLowerCase() === h.name.toLowerCase() && b.completed === 'done')
    if (done) { logHabit(td, h.id, 'kept'); return false }
    return true
  })
  const pendingBad = pendingHabits.filter(h => h.kind === 'bad')

  // ── Build question queue ──
  const steps: Step[] = useMemo(() => {
    const q: Step[] = []
    if (habitClassifyPending) {
      // Just added a block — ask only about that one, nothing else
      q.push({ kind: 'classify', name: habitClassifyPending })
      return q
    }
    // Hourly check-in: at most 1 retroactive classify, then habit logs
    if (unclassifiedNames.length > 0) q.push({ kind: 'classify', name: unclassifiedNames[0] })
    for (const h of pendingBad) q.push({ kind: 'habit-bad', id: h.id, name: h.name })
    for (const h of pendingGood) q.push({ kind: 'habit-good', id: h.id, name: h.name })
    return q
  }, [habitClassifyPending, unclassifiedNames, pendingBad, pendingGood]) // eslint-disable-line react-hooks/exhaustive-deps

  const safeIdx = Math.min(qIdx, steps.length)
  const currentStep = steps[safeIdx]
  const remaining = steps.length - safeIdx

  const advance = () => setQIdx(i => i + 1)

  const handleClassify = (name: string, kind: 'good' | 'bad' | null) => {
    if (kind) {
      addHabit(name, kind, kind === 'good' ? '✅' : '🚫')
    } else {
      dismissHabitClassify(name)
    }
    if (habitClassifyPending && name.toLowerCase() === habitClassifyPending.toLowerCase()) {
      setHabitClassifyPending(null)
    }
    advance()
  }

  const handleHabit = (id: number, outcome: 'kept' | 'broke') => {
    logHabit(td, id, outcome)
    advance()
  }

  const handleAllGood = () => {
    suppressCheckinThisHour()
    closeCheckin()
  }

  // ── Pattern suggestion ──
  const thirtyDaysAgoStr = (() => {
    const d = new Date(now); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10)
  })()
  const historicalBlocks = blocks.filter(b => b.date !== td && b.date >= thirtyDaysAgoStr)
  const nameCounts: Record<string, { count: number; start: string; end: string; type: string; customNameCounts: Record<string, number> }> = {}
  for (const b of historicalBlocks) {
    if (Math.abs(toM(b.start) - nowM) <= 45) {
      const key = b.name.toLowerCase()
      if (!nameCounts[key]) nameCounts[key] = { count: 0, start: b.start, end: b.end, type: b.type, customNameCounts: {} }
      nameCounts[key].count++
      const cn = b.customName ?? ''
      nameCounts[key].customNameCounts[cn] = (nameCounts[key].customNameCounts[cn] || 0) + 1
    }
  }
  let suggestionBlock: { name: string; start: string; end: string; type: string; count: number; customName: string | null } | null = null
  for (const [key, val] of Object.entries(nameCounts)) {
    if (val.count >= 2 && (!suggestionBlock || val.count > suggestionBlock.count)) {
      const orig = historicalBlocks.find(b => b.name.toLowerCase() === key)
      const cnEntries = Object.entries(val.customNameCounts).filter(([k]) => k !== '').sort((a, b) => b[1] - a[1])
      suggestionBlock = { name: orig?.name ?? key, ...val, customName: cnEntries[0]?.[0] ?? null }
    }
  }
  // Hide if already on today's schedule, dismissed today, or in the morning buffer
  const dismissedToday = dismissedSuggestions[td] || []
  if (suggestionBlock && todayBlocks.some(b => b.name.toLowerCase() === suggestionBlock!.name.toLowerCase())) {
    suggestionBlock = null
  }
  if (suggestionBlock && dismissedToday.includes(suggestionBlock.name.toLowerCase())) {
    suggestionBlock = null
  }
  const morningBuffer = cfg.morningBuffer
  if (suggestionBlock && morningBuffer && suggestionBlock.start < morningBuffer) {
    suggestionBlock = null
  }

  const handleOpenCoach = () => { closeCheckin(); openCoachAt('analyze') }

  // ── Energy-aware insight ──
  const todayInt = useStore.getState().intentions[td]
  // Analyze last 14 days: does the user consistently log low/high energy on this day of week?
  const energyInsight = (() => {
    const dow = now.getDay()
    const DOW_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
    const last14: string[] = []
    for (let i = 1; i <= 14; i++) {
      const d = new Date(now); d.setDate(d.getDate() - i)
      last14.push(d.toISOString().slice(0, 10))
    }
    const sameDowDates = last14.filter(d => new Date(d + 'T12:00').getDay() === dow)
    const energyVals = sameDowDates
      .map(d => (useStore.getState().intentions[d]?.e ?? 0))
      .filter(e => e > 0)
    if (energyVals.length < 2) return null
    const avg = energyVals.reduce((a, b) => a + b, 0) / energyVals.length
    const todayEnergy = todayInt?.e ?? 0
    if (avg <= 1.2 && todayEnergy === 0) {
      return `you usually log low energy on ${DOW_NAMES[dow]}s — consider lighter blocks today`
    }
    if (avg >= 2.5 && todayEnergy === 0) {
      return `${DOW_NAMES[dow]}s are usually your high-energy days — great time for deep work!`
    }
    return null
  })()

  // ── Render ──
  return (
    <div className="checkin-bubble">
      {/* Header */}
      <div className="checkin-hdr">
        <span className="checkin-icon">🤖</span>
        <span className="checkin-msg">{msg}</span>
        <button className="checkin-dismiss" onClick={handleAllGood}>×</button>
      </div>

      {hint && !currentStep && <div className="checkin-hint">{hint}</div>}

      {/* ── Step-through question card ── */}
      {currentStep && (
        <div className="checkin-step-card">
          {steps.length > 1 && (
            <div className="checkin-step-dots">
              {steps.map((_, i) => (
                <span key={i} className={`checkin-dot${i === safeIdx ? ' active' : i < safeIdx ? ' done' : ''}`} />
              ))}
            </div>
          )}

          {currentStep.kind === 'classify' && (
            <>
              <div className="checkin-step-q">
                is <strong>"{currentStep.name}"</strong> a habit?
              </div>
              <div className="checkin-step-acts">
                <button className="csa-good" onClick={() => handleClassify(currentStep.name, 'good')}>✅ good</button>
                <button className="csa-bad" onClick={() => handleClassify(currentStep.name, 'bad')}>🚫 bad</button>
                <button className="csa-skip" onClick={() => handleClassify(currentStep.name, null)}>not really</button>
              </div>
            </>
          )}

          {currentStep.kind === 'habit-bad' && (
            <>
              <div className="checkin-step-q">
                did you avoid <strong>{currentStep.name}</strong> today?
              </div>
              <div className="checkin-step-acts">
                <button className="csa-good" onClick={() => handleHabit(currentStep.id, 'kept')}>✓ avoided it</button>
                <button className="csa-bad" onClick={() => handleHabit(currentStep.id, 'broke')}>✗ gave in</button>
              </div>
            </>
          )}

          {currentStep.kind === 'habit-good' && (
            <>
              <div className="checkin-step-q">
                did you do <strong>{currentStep.name}</strong>?
              </div>
              <div className="checkin-step-acts">
                <button className="csa-good" onClick={() => handleHabit(currentStep.id, 'kept')}>✓ did it</button>
                <button className="csa-bad" onClick={() => handleHabit(currentStep.id, 'broke')}>✗ skipped</button>
              </div>
            </>
          )}

          {remaining > 1 && (
            <div className="checkin-step-skip" onClick={advance}>skip →</div>
          )}
        </div>
      )}

      {/* Main actions */}
      <div className="checkin-acts">
        <button className="checkin-btn checkin-btn-primary" onClick={handleOpenCoach}>open coach</button>
        <button className="checkin-btn checkin-btn-secondary" onClick={handleAllGood}>all good 👍</button>
      </div>

      {/* Energy insight */}
      {energyInsight && !currentStep && (
        <div className="checkin-energy-insight">
          <span className="checkin-ei-icon">⚡</span>
          <span className="checkin-ei-text">{energyInsight}</span>
        </div>
      )}

      {/* Pattern suggestion */}
      {suggestionBlock && (
        <div className="checkin-pattern">
          <div className="checkin-pattern-msg">
            you usually schedule <strong>"{suggestionBlock.name}"</strong> around this time
          </div>
          <div className="checkin-pattern-acts">
            <button
              className="checkin-btn checkin-btn-primary"
              onClick={() => {
                bulkAddBlocks([{
                  name: suggestionBlock!.name,
                  start: suggestionBlock!.start,
                  end: suggestionBlock!.end,
                  type: suggestionBlock!.type as Block['type'],
                  date: td,
                  customName: suggestionBlock!.customName,
                }])
                useStore.getState().showToast(`"${suggestionBlock!.name}" added`)
                closeCheckin()
              }}
            >add it →</button>
            <button
              className="checkin-btn checkin-btn-secondary"
              onClick={() => dismissSuggestion(td, suggestionBlock!.name)}
            >not today</button>
          </div>
        </div>
      )}
    </div>
  )
}
