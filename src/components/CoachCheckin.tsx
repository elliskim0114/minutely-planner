import { useState } from 'react'
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

export default function CoachCheckin() {
  const { closeCheckin, openCoachAt, blocks, cfg, bulkAddBlocks } = useStore()
  const [suggestionDismissed, setSuggestionDismissed] = useState(false)

  const now = new Date()
  const hour = now.getHours()
  // Pick message based on hour so it varies throughout the day
  const msg = MESSAGES[hour % MESSAGES.length]

  const td = todayStr()
  const nowM = now.getHours() * 60 + now.getMinutes()
  const todayBlocks = blocks.filter(b => b.date === td)
  const totalMins = todayBlocks.reduce((s, b) => s + toM(b.end) - toM(b.start), 0)
  const dayMins = toM(cfg.de) - toM(cfg.ds)
  const pct = dayMins > 0 ? Math.round((totalMins / dayMins) * 100) : 0

  // Show a contextual sub-hint
  const hint = pct > 90
    ? 'your day looks pretty stacked 👀'
    : pct < 20 && nowM > toM(cfg.ds) + 60
    ? 'day looks light — want help filling it in?'
    : null

  // Pattern-based suggestion: look at blocks from last 30 days (NOT today)
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10)

  const historicalBlocks = blocks.filter(b => b.date !== td && b.date >= thirtyDaysAgoStr)

  // Group by name (case-insensitive), find blocks within 45 min of current time
  const nameCounts: Record<string, {
    count: number; start: string; end: string; type: string
    customNameCounts: Record<string, number>
  }> = {}
  for (const b of historicalBlocks) {
    const bM = toM(b.start)
    if (Math.abs(bM - nowM) <= 45) {
      const key = b.name.toLowerCase()
      if (!nameCounts[key]) {
        nameCounts[key] = { count: 0, start: b.start, end: b.end, type: b.type, customNameCounts: {} }
      }
      nameCounts[key].count++
      const cn = b.customName ?? ''
      nameCounts[key].customNameCounts[cn] = (nameCounts[key].customNameCounts[cn] || 0) + 1
    }
  }

  // Find top suggestion (count >= 2)
  let suggestionBlock: { name: string; start: string; end: string; type: string; count: number; customName: string | null } | null = null
  for (const [key, val] of Object.entries(nameCounts)) {
    if (val.count >= 2) {
      if (!suggestionBlock || val.count > suggestionBlock.count) {
        const orig = historicalBlocks.find(b => b.name.toLowerCase() === key)
        // Pick most-frequently-used customName (ignore empty/null)
        const cnEntries = Object.entries(val.customNameCounts)
          .filter(([k]) => k !== '')
          .sort((a, b) => b[1] - a[1])
        const customName = cnEntries.length > 0 ? cnEntries[0][0] : null
        suggestionBlock = { name: orig?.name ?? key, ...val, customName }
      }
    }
  }

  // Don't suggest if a block with same name is already on today's schedule
  if (suggestionBlock) {
    const alreadyToday = todayBlocks.some(b => b.name.toLowerCase() === suggestionBlock!.name.toLowerCase())
    if (alreadyToday) suggestionBlock = null
  }

  const handleOpenCoach = () => {
    closeCheckin()
    openCoachAt('analyze')
  }

  return (
    <div className="checkin-bubble">
      <div className="checkin-hdr">
        <span className="checkin-icon">🤖</span>
        <span className="checkin-msg">{msg}</span>
        <button className="checkin-dismiss" onClick={closeCheckin}>×</button>
      </div>
      {hint && <div className="checkin-hint">{hint}</div>}
      <div className="checkin-acts">
        <button className="checkin-btn checkin-btn-primary" onClick={handleOpenCoach}>open coach</button>
        <button className="checkin-btn checkin-btn-secondary" onClick={closeCheckin}>all good 👍</button>
      </div>
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
                useStore.getState().showToast(`"${suggestionBlock!.name}" added to today`)
                closeCheckin()
              }}
            >add it →</button>
            <button
              className="checkin-btn checkin-btn-secondary"
              onClick={() => setSuggestionDismissed(true)}
            >not today</button>
          </div>
        </div>
      )}
    </div>
  )
}
