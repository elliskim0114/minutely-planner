import { useState } from 'react'
import { useStore } from '../store'
import { toM } from '../utils'
import TypedText from './TypedText'

interface Insight {
  icon: string
  title: string
  body: string
  prompt?: string
}

const TYPE_COLORS: Record<string, string> = {
  focus: 'var(--bfbd)',
  routine: 'var(--brbd)',
  study: 'var(--bsbd)',
  free: 'var(--blbd)',
  custom: 'var(--acc)',
  gcal: 'var(--bd2)',
}

const TYPE_BG: Record<string, string> = {
  focus: 'var(--bfbg)',
  routine: 'var(--brbg)',
  study: 'var(--bsbg)',
  free: 'var(--blbg)',
}

function getDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function AnalyticsView() {
  const { view, blocks, goals, intentions, openGoals, anthropicKey, setView, setPendingAIPrompt, typeIcons, habits, habitLogs, removeHabit, addHabit } = useStore()
  const [insights, setInsights] = useState<Insight[]>([])
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState('')
  const [appliedIdx, setAppliedIdx] = useState<number | null>(null)
  const [aiPatterns, setAiPatterns] = useState<Array<{ pattern: string; suggestion: string; confidence: string; type: string }>>([])
  const [habitsLoading, setHabitsLoading] = useState(false)
  const [habitsError, setHabitsError] = useState('')
  const [habitsFetched, setHabitsFetched] = useState(false)
  const [showAllTypes, setShowAllTypes] = useState(false)
  const [showHealthInfo, setShowHealthInfo] = useState(false)
  const [editingHabits, setEditingHabits] = useState(false)
  const [newHabitName, setNewHabitName] = useState('')
  const [newHabitKind, setNewHabitKind] = useState<'good' | 'bad'>('good')

  // Build last 14 days
  const today = new Date()
  const last14: { date: string; label: string }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    last14.push({
      date: getDateStr(d),
      label: i === 0 ? 'today' : d.toLocaleDateString('en', { weekday: 'short' }).toLowerCase(),
    })
  }
  const last7 = last14.slice(7)

  // Focus hours per day (last 14)
  const focusHoursPerDay = last14.map(({ date }) => {
    const mins = blocks.filter(b => b.date === date && b.type === 'focus')
      .reduce((s, b) => s + toM(b.end) - toM(b.start), 0)
    return Math.round((mins / 60) * 10) / 10
  })
  const maxFocusH = Math.max(...focusHoursPerDay, 1)

  // Block type breakdown (last 7 days)
  const typeMinutes: Record<string, number> = {}
  const typeIsCustom: Record<string, boolean> = {}
  let totalMins = 0
  last7.forEach(({ date }) => {
    blocks.filter(b => b.date === date).forEach(b => {
      const mins = toM(b.end) - toM(b.start)
      const key = b.cc ? ((b as any).customName || b.name) : b.type
      typeMinutes[key] = (typeMinutes[key] || 0) + mins
      if (b.cc) typeIsCustom[key] = true
      totalMins += mins
    })
  })
  const typeEntries = Object.entries(typeMinutes).sort((a, b) => b[1] - a[1])
  const visibleTypes = showAllTypes ? typeEntries : typeEntries.slice(0, 5)

  // Plan health per day (last 7)
  const healthScores = last7.map(({ date }) => {
    const dayBlocks = blocks.filter(b => b.date === date)
    const pm = dayBlocks.reduce((s, b) => s + toM(b.end) - toM(b.start), 0)
    const tm = 17 * 60 // rough total day
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
  const avgHealth = Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length)
  const avgGrade = avgHealth >= 90 ? 'A' : avgHealth >= 75 ? 'B' : avgHealth >= 60 ? 'C' : avgHealth >= 45 ? 'D' : 'F'
  const gradeColor = avgHealth >= 90 ? '#4CAF8A' : avgHealth >= 75 ? '#7BB3FF' : avgHealth >= 60 ? '#E8C24A' : '#FF7070'

  // Streaks — consecutive days with at least one focus block
  let currentStreak = 0
  for (let i = last14.length - 1; i >= 0; i--) {
    const hasFocus = blocks.some(b => b.date === last14[i].date && b.type === 'focus')
    if (hasFocus) currentStreak++
    else break
  }

  // Goal hours this week (last 7 days)
  const goalHours = (gid: number) => {
    const mins = blocks
      .filter(b => b.goalId === gid && last7.some(d => d.date === b.date))
      .reduce((s, b) => s + toM(b.end) - toM(b.start), 0)
    return Math.round((mins / 60) * 10) / 10
  }

  // Total focus hours this week
  const weekFocusH = Math.round(
    blocks.filter(b => last7.some(d => d.date === b.date) && b.type === 'focus')
      .reduce((s, b) => s + toM(b.end) - toM(b.start), 0) / 60 * 10
  ) / 10

  // Busiest day
  const dayTotals = last7.map(({ date, label }) => ({
    label,
    mins: blocks.filter(b => b.date === date).reduce((s, b) => s + toM(b.end) - toM(b.start), 0),
  }))
  const busiestDay = dayTotals.reduce((a, b) => b.mins > a.mins ? b : a, dayTotals[0])

  // Week at a glance extras
  const totalBlocksThisWeek = blocks.filter(b => last7.some(d => d.date === b.date)).length
  const totalHoursThisWeek = Math.round(totalMins / 60 * 10) / 10
  const topType = typeEntries[0]?.[0] ?? null
  const glanceObs: string[] = []
  if (totalBlocksThisWeek === 0) {
    glanceObs.push('No blocks scheduled yet — start planning your week!')
  } else {
    if (weekFocusH >= 5) glanceObs.push(`Strong deep-work week with ${weekFocusH}h of focus time`)
    else if (weekFocusH >= 2) glanceObs.push(`${weekFocusH}h of focus so far — keep building the habit`)
    else if (weekFocusH === 0) glanceObs.push('No focus blocks this week — try scheduling at least one')
    if (busiestDay?.mins > 0) {
      const bh = Math.round(busiestDay.mins / 60 * 10) / 10
      glanceObs.push(`Busiest day is ${busiestDay.label} at ${bh}h`)
    }
    if (avgHealth >= 80) glanceObs.push('Schedule structure looks really solid this week')
    else if (avgHealth >= 60) glanceObs.push('Good consistency — small tweaks can push health higher')
    else glanceObs.push('Add priorities and buffer time to boost your plan health')
  }

  // Habit stats — last 30 days
  const last30: string[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i)
    last30.push(getDateStr(d))
  }
  const habitStats = habits.map(h => {
    let kept = 0, broke = 0
    for (const date of last30) {
      const outcome = habitLogs[date]?.[h.id]
      if (outcome === 'kept') kept++
      else if (outcome === 'broke') broke++
    }
    const total = kept + broke
    const pct = total > 0 ? Math.round((kept / total) * 100) : null
    // streak: consecutive days kept ending today
    let streak = 0
    for (let i = last30.length - 1; i >= 0; i--) {
      const outcome = habitLogs[last30[i]]?.[h.id]
      if (outcome === 'kept') streak++
      else if (outcome === 'broke') break
      else if (i === last30.length - 1) break // today not logged yet — don't break streak
    }
    // trend: last 7 days vs prior 7 days
    const l7 = last30.slice(-7), p7 = last30.slice(-14, -7)
    const l7k = l7.filter(d => habitLogs[d]?.[h.id] === 'kept').length
    const p7k = p7.filter(d => habitLogs[d]?.[h.id] === 'kept').length
    const l7t = l7.filter(d => habitLogs[d]?.[h.id] !== undefined).length
    const p7t = p7.filter(d => habitLogs[d]?.[h.id] !== undefined).length
    const trend = (l7t === 0 && p7t === 0) ? null : l7k > p7k ? 'up' : l7k < p7k ? 'down' : 'flat'
    return { ...h, kept, broke, total, pct, streak, trend }
  })
  const goodHabits = habitStats.filter(h => h.kind === 'good')
  const badHabits = habitStats.filter(h => h.kind === 'bad')

  const runInsights = async () => {
    setInsightsLoading(true)
    setInsightsError('')
    setAppliedIdx(null)
    try {
      const goalsPayload = goals.map(g => ({
        name: g.name,
        targetHours: g.targetHours,
        actualHours: goalHours(g.id),
        pct: Math.min(100, Math.round((goalHours(g.id) / g.targetHours) * 100)),
      }))
      const analyticsPayload = {
        focusHoursPerDay: last14.map(({ label, date }, i) => ({ label, date, hours: focusHoursPerDay[i] })),
        typeBreakdown: typeMinutes,
        healthScores: last7.map(({ label }, i) => ({
          label,
          score: healthScores[i],
          grade: healthScores[i] >= 90 ? 'A' : healthScores[i] >= 75 ? 'B' : healthScores[i] >= 60 ? 'C' : healthScores[i] >= 45 ? 'D' : 'F',
        })),
        avgHealth,
        currentStreak,
        weekFocusH,
        energy: last7.map(({ date }) => ({ date, level: (intentions[date] || { e: 0 }).e })),
      }
      const res = await fetch('/api/analytics-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analytics: analyticsPayload, goals: goalsPayload, apiKey: anthropicKey || undefined }),
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const data = await res.json()
      if (Array.isArray(data.insights)) setInsights(data.insights)
      else throw new Error('unexpected response')
    } catch (err) {
      const msg = String(err)
      if (msg.includes('401')) setInsightsError('API key issue — check your key in the MPD view')
      else if (msg.includes('429')) setInsightsError('rate limited — wait a moment and try again')
      else if (msg.includes('fetch') || msg.includes('Failed')) setInsightsError('server offline — run: cd server && npm run dev')
      else setInsightsError('could not generate insights — try again')
    } finally {
      setInsightsLoading(false)
    }
  }

  const fetchHabits = async () => {
    setHabitsLoading(true); setHabitsError(''); setHabitsFetched(false)
    try {
      const since = new Date(); since.setDate(since.getDate() - 14)
      const sinceStr = getDateStr(since)
      const recentBlocks = blocks
        .filter(b => b.date >= sinceStr)
        .map(b => ({ date: b.date, start: b.start, end: b.end, name: b.name, type: b.type }))
      const res = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks: recentBlocks }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAiPatterns(data.habits || [])
      setHabitsFetched(true)
    } catch (e) { setHabitsError(String(e).replace('Error: ', '')) }
    finally { setHabitsLoading(false) }
  }

  const applyInsightPrompt = (prompt: string, idx: number) => {
    setPendingAIPrompt(prompt)
    setView('mpd')
    setAppliedIdx(idx)
    useStore.getState().showToast('prompt loaded — hit ✦ design my perfect day')
  }

  return (
    <div id="analytics-view" className={view === 'analytics' ? 'on' : ''}>
      <div className="av-inner">
        <div className="av-hero">
          <div className="av-tag">analytics</div>
          <h1 className="av-title">your week in numbers</h1>
          <p className="av-sub">last 7 days · updated live</p>
        </div>

        {/* KPI row */}
        <div className="av-kpis">
          <div className="av-kpi">
            <div className="av-kpi-val">{weekFocusH}h</div>
            <div className="av-kpi-lbl">focus time</div>
          </div>
          <div className="av-kpi">
            <div className="av-kpi-val" style={{ color: gradeColor }}>{avgGrade}</div>
            <div className="av-kpi-lbl">avg plan health</div>
          </div>
          <div className="av-kpi">
            <div className="av-kpi-val">{currentStreak}</div>
            <div className="av-kpi-lbl">focus streak (days)</div>
          </div>
          <div className="av-kpi">
            <div className="av-kpi-val">{busiestDay?.mins ? `${Math.round(busiestDay.mins / 60 * 10) / 10}h` : '—'}</div>
            <div className="av-kpi-lbl">busiest day ({busiestDay?.label})</div>
          </div>
        </div>

        <div className="av-cols">

          {/* ── Left column ── */}
          <div className="av-col-main">
            <div className="av-card">
              <div className="av-card-ttl">focus hours · last 14 days</div>
              <div className="av-bars">
                {last14.map(({ label }, i) => {
                  const h = focusHoursPerDay[i]
                  const pct = (h / maxFocusH) * 100
                  const isToday = i === 13
                  return (
                    <div key={i} className="av-bar-col">
                      <div className="av-bar-val">{h > 0 ? `${h}h` : ''}</div>
                      <div className="av-bar-track">
                        <div className={`av-bar-fill${isToday ? ' today' : ''}`}
                          style={{ height: `${Math.max(2, pct)}%`, background: isToday ? 'var(--acc)' : 'var(--bfbd)' }} />
                      </div>
                      <div className={`av-bar-lbl${isToday ? ' today' : ''}`}>{label}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="av-card">
              <div className="av-card-hdr">
                <div className="av-card-ttl" style={{ marginBottom: 0 }}>plan health · last 7 days</div>
                <button
                  className={`av-health-info-btn${showHealthInfo ? ' active' : ''}`}
                  onClick={() => setShowHealthInfo(s => !s)}
                  title="how plan health is calculated"
                >ⓘ</button>
              </div>
              {showHealthInfo && (
                <div className="av-health-info">
                  <div className="av-health-info-title">how plan health is graded</div>
                  <div className="av-health-info-items">
                    <div className="av-health-info-item">
                      <span className="av-hi-icon">📊</span>
                      <div><strong>schedule density (60–85%)</strong><br />A healthy day fills most of the day without being jam-packed. Under 60% = lots of unplanned time; over 85% = no breathing room.</div>
                    </div>
                    <div className="av-health-info-item">
                      <span className="av-hi-icon">🎯</span>
                      <div><strong>at least one focus block</strong><br />Focus sessions are deep work. Having at least one ensures the day is productive, not just busy.</div>
                    </div>
                    <div className="av-health-info-item">
                      <span className="av-hi-icon">🛡️</span>
                      <div><strong>buffer or free time ≥ 15 min</strong><br />A buffer prevents burnout and gives you space between tasks. Even a short break counts.</div>
                    </div>
                    <div className="av-health-info-item">
                      <span className="av-hi-icon">🏆</span>
                      <div><strong>priorities set</strong><br />Setting 1–3 intentions for the day makes planning deliberate and keeps you on track.</div>
                    </div>
                    <div className="av-health-info-item">
                      <span className="av-hi-icon">⚡</span>
                      <div><strong>energy logged</strong><br />Tracking your energy shows self-awareness and helps spot patterns over time.</div>
                    </div>
                  </div>
                </div>
              )}
              <div className="av-health-bars">
                {last7.map(({ label }, i) => {
                  const score = healthScores[i]
                  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 45 ? 'D' : 'F'
                  const col = score >= 90 ? '#4CAF8A' : score >= 75 ? '#7BB3FF' : score >= 60 ? '#E8C24A' : '#FF7070'
                  return (
                    <div key={i} className="av-health-col">
                      <div className="av-health-grade" style={{ color: col }}>{grade}</div>
                      <div className="av-health-track">
                        <div className="av-health-fill" style={{ height: `${score}%`, background: col }} />
                      </div>
                      <div className="av-health-lbl">{label}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Week at a glance — fills empty space */}
            <div className="av-card av-glance-card">
              <div className="av-card-ttl">this week at a glance</div>
              <div className="av-glance-grid">
                <div className="av-glance-item">
                  <div className="av-glance-val">{totalHoursThisWeek}h</div>
                  <div className="av-glance-lbl">total scheduled</div>
                </div>
                <div className="av-glance-item">
                  <div className="av-glance-val">{totalBlocksThisWeek}</div>
                  <div className="av-glance-lbl">blocks planned</div>
                </div>
                <div className="av-glance-item">
                  <div className="av-glance-val">{weekFocusH}h</div>
                  <div className="av-glance-lbl">focus time</div>
                </div>
                <div className="av-glance-item">
                  <div className="av-glance-val" style={{ color: gradeColor }}>{avgGrade}</div>
                  <div className="av-glance-lbl">plan health</div>
                </div>
              </div>
              {glanceObs.length > 0 && (
                <div className="av-glance-obs">
                  {glanceObs.map((obs, i) => (
                    <div key={i} className="av-glance-obs-item">· {obs}</div>
                  ))}
                </div>
              )}
              {topType && (
                <div className="av-glance-top-type">
                  <span className="av-glance-top-lbl">top activity</span>
                  <span className="av-glance-top-val">{topType}</span>
                  <span className="av-glance-top-pct">{Math.round((typeMinutes[topType] / totalMins) * 100)}% of time</span>
                </div>
              )}
            </div>

            {/* AI Insights — fills whitespace in left column */}
            <div className="av-insights-section">
              <div className="av-insights-hdr">
                <div>
                  <div className="av-insights-title">✦ AI scheduling insights</div>
                  <div className="av-insights-sub">based on your last 7 days — get specific suggestions for your next schedule</div>
                </div>
                <button className={`av-insights-btn${insightsLoading ? ' loading' : ''}`} onClick={runInsights} disabled={insightsLoading}>
                  {insightsLoading
                    ? <><div className="av-ins-dot" /><div className="av-ins-dot" /><div className="av-ins-dot" /><span>analyzing…</span></>
                    : insights.length > 0 ? '↺ refresh' : '✦ analyze my week'}
                </button>
              </div>
              {insightsError && <div className="av-ins-error">{insightsError}</div>}
              {insights.length > 0 && (
                <div className="av-insight-cards">
                  {insights.map((ins, i) => (
                    <div key={i} className="av-insight-card">
                      <div className="av-ins-top">
                        <span className="av-ins-icon">{ins.icon}</span>
                        <div className="av-ins-content">
                          <div className="av-ins-title"><TypedText text={ins.title} speed={28} delay={i * 220} /></div>
                          <div className="av-ins-body"><TypedText text={ins.body} speed={8} delay={i * 220 + ins.title.length * 28} /></div>
                        </div>
                      </div>
                      {ins.prompt && (
                        <div className="av-ins-foot">
                          <div className="av-ins-prompt">"{ins.prompt}"</div>
                          <button className={`av-ins-apply${appliedIdx === i ? ' applied' : ''}`} onClick={() => applyInsightPrompt(ins.prompt!, i)}>
                            {appliedIdx === i ? '✓ applied' : '→ use this'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {insights.length === 0 && !insightsLoading && !insightsError && (
                <div className="av-ins-placeholder">
                  <div className="av-ins-ph-icon">✦</div>
                  <div className="av-ins-ph-text">click "analyze my week" to get personalized suggestions based on your scheduling patterns, energy levels, and goals</div>
                </div>
              )}
            </div>

            {/* Habit patterns */}
            <div className="av-insights-section">
              <div className="av-insights-hdr">
                <div>
                  <div className="av-insights-title">◷ habit patterns</div>
                  <div className="av-insights-sub">AI scans your last 14 days to surface recurring patterns and suggestions</div>
                </div>
                <button className={`av-insights-btn${habitsLoading ? ' loading' : ''}`} onClick={fetchHabits} disabled={habitsLoading}>
                  {habitsLoading
                    ? <><div className="av-ins-dot" /><div className="av-ins-dot" /><div className="av-ins-dot" /><span>scanning…</span></>
                    : habitsFetched ? '↺ re-scan' : '◷ detect habits'}
                </button>
              </div>
              {habitsError && <div className="av-ins-error">{habitsError}</div>}
              {habitsFetched && aiPatterns.length > 0 && (
                <div className="av-insight-cards">
                  {aiPatterns.map((h, i) => (
                    <div key={i} className={`av-insight-card coach-habit-card coach-chip-${h.type}`}>
                      <div className="av-ins-top">
                        <span className="av-ins-icon">◷</span>
                        <div className="av-ins-content">
                          <div className="av-ins-title">{h.pattern}</div>
                          <div className="av-ins-body">{h.suggestion}</div>
                        </div>
                        <span className={`chc-conf chc-conf-${h.confidence}`} style={{ flexShrink: 0, alignSelf: 'flex-start' }}>{h.confidence}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {habitsFetched && aiPatterns.length === 0 && (
                <div className="av-ins-placeholder">
                  <div className="av-ins-ph-icon">◷</div>
                  <div className="av-ins-ph-text">no clear patterns yet — add more blocks over the next few days and scan again</div>
                </div>
              )}
              {!habitsFetched && !habitsLoading && !habitsError && (
                <div className="av-ins-placeholder">
                  <div className="av-ins-ph-icon">◷</div>
                  <div className="av-ins-ph-text">click "detect habits" to find recurring patterns in your last 14 days of scheduling</div>
                </div>
              )}
            </div>
          </div>

          {/* ── Right column ── */}
          <div className="av-col-side">

            {/* Habit tracker — shown first so it's above the fold */}
            <div className="av-card av-habits-card">
              <div className="av-card-hdr">
                <div className="av-card-ttl">habit tracker · last 30 days</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button className="av-goals-btn" onClick={() => { setEditingHabits(e => !e); setNewHabitName('') }}>
                    {editingHabits ? 'done' : 'manage'}
                  </button>
                </div>
              </div>

              {habits.length === 0 && !editingHabits && (
                <div className="av-empty" style={{ fontSize: 11 }}>
                  no habits yet — hit <strong>manage</strong> to add one, or create any block and the coach will ask if it's a habit
                </div>
              )}

              {goodHabits.length > 0 && (
                <div className="av-habit-section">
                  <div className="av-habit-section-lbl">✅ good habits</div>
                  {goodHabits.map(h => (
                    <div key={h.id} className={`av-habit-row${editingHabits ? ' editing' : ''}`}>
                      <div className="av-habit-hdr">
                        <span className="av-habit-name">{h.name}</span>
                        <span className="av-habit-stat">
                          {!editingHabits && h.pct !== null ? `${h.pct}% done` : !editingHabits ? 'no logs yet' : null}
                          {!editingHabits && h.trend === 'up' && <span className="av-habit-trend up">↑</span>}
                          {!editingHabits && h.trend === 'down' && <span className="av-habit-trend down">↓</span>}
                          {!editingHabits && h.streak > 1 && <span className="av-habit-streak">{h.streak}🔥</span>}
                          {editingHabits && (
                            <button className="av-habit-del" onClick={() => { removeHabit(h.id); useStore.getState().showToast(`"${h.name}" removed`) }}>✕</button>
                          )}
                        </span>
                      </div>
                      {!editingHabits && h.total > 0 && (
                        <div className="av-habit-bar">
                          <div className="av-habit-fill av-habit-fill-good" style={{ width: `${h.pct ?? 0}%` }} />
                        </div>
                      )}
                      {!editingHabits && h.total > 0 && (
                        <div className="av-habit-counts">
                          <span className="av-habit-kept">{h.kept} kept</span>
                          <span className="av-habit-broke">{h.broke} skipped</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {badHabits.length > 0 && (
                <div className="av-habit-section">
                  <div className="av-habit-section-lbl">🚫 bad habits to avoid</div>
                  {badHabits.map(h => (
                    <div key={h.id} className={`av-habit-row${editingHabits ? ' editing' : ''}`}>
                      <div className="av-habit-hdr">
                        <span className="av-habit-name">{h.name}</span>
                        <span className="av-habit-stat">
                          {!editingHabits && h.pct !== null ? `${h.pct}% avoided` : !editingHabits ? 'no logs yet' : null}
                          {!editingHabits && h.trend === 'up' && <span className="av-habit-trend up">↑</span>}
                          {!editingHabits && h.trend === 'down' && <span className="av-habit-trend down">↓</span>}
                          {!editingHabits && h.streak > 1 && <span className="av-habit-streak">{h.streak}🔥</span>}
                          {editingHabits && (
                            <button className="av-habit-del" onClick={() => { removeHabit(h.id); useStore.getState().showToast(`"${h.name}" removed`) }}>✕</button>
                          )}
                        </span>
                      </div>
                      {!editingHabits && h.total > 0 && (
                        <div className="av-habit-bar">
                          <div className="av-habit-fill av-habit-fill-bad" style={{ width: `${h.pct ?? 0}%` }} />
                        </div>
                      )}
                      {!editingHabits && h.total > 0 && (
                        <div className="av-habit-counts">
                          <span className="av-habit-kept">{h.kept} avoided</span>
                          <span className="av-habit-broke">{h.broke} gave in</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Inline add-habit form — edit mode only */}
              {editingHabits && (
                <div className="av-habit-add-row">
                  <input
                    className="av-habit-add-inp"
                    placeholder="habit name…"
                    value={newHabitName}
                    onChange={e => setNewHabitName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newHabitName.trim()) {
                        addHabit(newHabitName.trim(), newHabitKind, newHabitKind === 'good' ? '✅' : '🚫')
                        useStore.getState().showToast(`"${newHabitName.trim()}" added`)
                        setNewHabitName('')
                      }
                    }}
                  />
                  <div className="av-habit-kind-seg">
                    <button className={newHabitKind === 'good' ? 'active' : ''} onClick={() => setNewHabitKind('good')}>✅ good</button>
                    <button className={newHabitKind === 'bad' ? 'active' : ''} onClick={() => setNewHabitKind('bad')}>🚫 bad</button>
                  </div>
                  <button
                    className="av-habit-add-submit"
                    disabled={!newHabitName.trim()}
                    onClick={() => {
                      if (!newHabitName.trim()) return
                      addHabit(newHabitName.trim(), newHabitKind, newHabitKind === 'good' ? '✅' : '🚫')
                      useStore.getState().showToast(`"${newHabitName.trim()}" added`)
                      setNewHabitName('')
                    }}
                  >+ add</button>
                </div>
              )}

              {!editingHabits && habits.length > 0 && habitStats.every(h => h.total === 0) && (
                <div className="av-empty" style={{ fontSize: 11 }}>
                  log habits from the coach check-in to see stats here
                </div>
              )}
            </div>

            <div className="av-card">
              <div className="av-card-ttl">time by type · this week</div>
              {totalMins === 0 ? <div className="av-empty">no blocks this week</div> : (
                <div className="av-types">
                  {visibleTypes.map(([key, mins]) => {
                    const pct = Math.round((mins / totalMins) * 100)
                    const h = Math.floor(mins / 60), m = mins % 60
                    const isCustom = typeIsCustom[key]
                    return (
                      <div key={key} className="av-type-row">
                        <div className="av-type-hdr">
                          <span className="av-type-icon">{typeIcons[key] || (isCustom ? '✦' : '')}</span>
                          <span className="av-type-name">{key}</span>
                          <span className="av-type-val">{h}h{m ? ` ${m}m` : ''} · {pct}%</span>
                        </div>
                        <div className="av-type-bar">
                          <div className="av-type-fill" style={{ width: `${pct}%`, background: TYPE_COLORS[key] || 'var(--acc)' }} />
                        </div>
                      </div>
                    )
                  })}
                  {typeEntries.length > 5 && (
                    <button className="av-types-seeall" onClick={() => setShowAllTypes(s => !s)}>
                      {showAllTypes ? '↑ show less' : `+ ${typeEntries.length - 5} more`}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="av-card">
              <div className="av-card-hdr">
                <div className="av-card-ttl">goals this week</div>
                <button className="av-goals-btn" onClick={openGoals}>manage</button>
              </div>
              {goals.length === 0 ? (
                <div className="av-empty"><button className="av-add-goal" onClick={openGoals}>+ add a goal</button></div>
              ) : (
                <div className="av-goals">
                  {goals.map(g => {
                    const actual = goalHours(g.id)
                    const pct = Math.min(100, Math.round((actual / g.targetHours) * 100))
                    return (
                      <div key={g.id} className="av-goal-row">
                        <div className="av-goal-hdr">
                          <div className="av-goal-dot" style={{ background: g.color }} />
                          <span className="av-goal-name">{g.name}</span>
                          <span className="av-goal-val">{actual}h / {g.targetHours}h</span>
                        </div>
                        <div className="av-goal-bar">
                          <div className="av-goal-fill" style={{ width: `${pct}%`, background: g.color }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          </div>

        </div>
      </div>
    </div>
  )
}
