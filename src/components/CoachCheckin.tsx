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
  } = useStore()

  const [qIdx, setQIdx] = useState(0)
  const [suggestionDismissed, setSuggestionDismissed] = useState(false)

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

  // ── Retroactive classify: untracked block names from last 30 days (max 5) ──
  const unclassifiedNames = useMemo(() => {
    const cutoff = new Date(now)
    cutoff.setDate(cutoff.getDate() - 30)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    const seen = new Set<string>()
    const names: string[] = []
    for (const b of blocks) {
      if (b.date < cutoffStr || b.type === 'gcal') continue
      const lower = b.name.toLowerCase()
      if (seen.has(lower)) continue
      seen.add(lower)
      if (
        !habits.some(h => h.name.toLowerCase() === lower) &&
        !habitNotAHabit.includes(lower)
      ) {
        names.push(b.name)
        if (names.length >= 5) break
      }
    }
    return names
  }, [blocks, habits, habitNotAHabit]) // eslint-disable-line react-hooks/exhaustive-deps

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
    // 1. Explicit just-saved classify prompt first
    if (habitClassifyPending) q.push({ kind: 'classify', name: habitClassifyPending })
    // 2. Retroactive classify for untracked names (skip if already in explicit prompt)
    for (const name of unclassifiedNames) {
      if (habitClassifyPending && name.toLowerCase() === habitClassifyPending.toLowerCase()) continue
      q.push({ kind: 'classify', name })
    }
    // 3. Pending bad habit checks
    for (const h of pendingBad) q.push({ kind: 'habit-bad', id: h.id, name: h.name })
    // 4. Pending good habit checks
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
      // Persist "not a habit" so coach never asks again
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

  // ── Pattern suggestion (separate from question queue) ──
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
  if (suggestionBlock && todayBlocks.some(b => b.name.toLowerCase() === suggestionBlock!.name.toLowerCase())) {
    suggestionBlock = null
  }

  const handleOpenCoach = () => { closeCheckin(); openCoachAt('analyze') }

  // ── Render ──
  return (
    <div className="checkin-bubble">
      {/* Header */}
      <div className="checkin-hdr">
        <span className="checkin-icon">🤖</span>
        <span className="checkin-msg">{msg}</span>
        <button className="checkin-dismiss" onClick={closeCheckin}>×</button>
      </div>

      {hint && !currentStep && <div className="checkin-hint">{hint}</div>}

      {/* ── Step-through question card ── */}
      {currentStep && (
        <div className="checkin-step-card">
          {/* Progress dots */}
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

      {/* Main actions — always visible */}
      <div className="checkin-acts">
        <button className="checkin-btn checkin-btn-primary" onClick={handleOpenCoach}>open coach</button>
        <button className="checkin-btn checkin-btn-secondary" onClick={closeCheckin}>all good 👍</button>
      </div>

      {/* Pattern suggestion — separate, at the bottom */}
      {suggestionBlock && !suggestionDismissed && (
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
            <button className="checkin-btn checkin-btn-secondary" onClick={() => setSuggestionDismissed(true)}>not today</button>
          </div>
        </div>
      )}
    </div>
  )
}
