import { useState } from 'react'
import { useStore } from '../store'
import { toM } from '../utils'
import { Goal } from '../types'
import TypedText from './TypedText'

function getLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function ProgressRing({ pct, color, size = 72, stroke = 6 }: { pct: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(1, pct / 100))
  const cx = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--bd)" strokeWidth={stroke}/>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cx})`}
        style={{ transition: 'stroke-dashoffset .7s cubic-bezier(.34,1.56,.64,1)' }}
      />
    </svg>
  )
}

interface Insight { icon: string; title: string; body: string; prompt?: string }

export default function GoalDetailView({ goal, onBack }: { goal: Goal; onBack: () => void }) {
  const { blocks, anthropicKey, setView, setPendingAIPrompt } = useStore()
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [appliedIdx, setAppliedIdx] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)

  const unit = goal.targetUnit || 'hours'
  const period = goal.targetPeriod || 'weekly'
  const unitLabel = unit === 'minutes' ? 'min' : 'h'
  const periodLabel = period === 'daily' ? 'today' : period === 'monthly' ? 'this month' : 'this week'

  const now = new Date()
  const todayStr = getLocalDateStr(now)

  const getPeriodStart = () => {
    const d = new Date(now)
    if (period === 'daily') return todayStr
    if (period === 'monthly') { d.setDate(d.getDate() - 30); return getLocalDateStr(d) }
    d.setDate(d.getDate() - 7); return getLocalDateStr(d)
  }
  const periodStart = getPeriodStart()

  const allGoalBlocks = blocks
    .filter(b => b.goalId === goal.id)
    .sort((a, b) => b.date.localeCompare(a.date) || toM(a.start) - toM(b.start))

  const totalMins = allGoalBlocks.reduce((s, b) => s + toM(b.end) - toM(b.start), 0)
  const totalHours = Math.round(totalMins / 60 * 10) / 10

  const periodBlocks = allGoalBlocks.filter(b => period === 'daily' ? b.date === periodStart : b.date >= periodStart)
  const periodMins = periodBlocks.reduce((s, b) => s + toM(b.end) - toM(b.start), 0)
  const periodActual = unit === 'minutes' ? periodMins : Math.round(periodMins / 60 * 10) / 10
  const periodPct = Math.min(100, Math.round((periodActual / goal.targetHours) * 100))

  // Last 12 weeks
  const targetH = unit === 'minutes' ? goal.targetHours / 60 : goal.targetHours
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const end = new Date(now); end.setDate(end.getDate() - i * 7)
    const start = new Date(end); start.setDate(start.getDate() - 6)
    const startStr = getLocalDateStr(start)
    const endStr = getLocalDateStr(end)
    const mins = blocks.filter(b => b.goalId === goal.id && b.date >= startStr && b.date <= endStr)
      .reduce((s, b) => s + toM(b.end) - toM(b.start), 0)
    const hours = Math.round(mins / 60 * 10) / 10
    return {
      label: i === 0 ? 'this wk' : i === 1 ? 'last wk' : `${i}w ago`,
      hours, pct: Math.min(100, Math.round((hours / targetH) * 100))
    }
  }).reverse()

  const maxH = Math.max(...weeks.map(w => w.hours), targetH, 0.5)
  const targetLinePct = (targetH / maxH) * 100

  // Streak: consecutive weeks from most recent hitting >=100%
  let streak = 0
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (weeks[i].pct >= 100) streak++
    else break
  }

  const displayBlocks = showAll ? allGoalBlocks : allGoalBlocks.slice(0, 8)

  const runInsights = async () => {
    setLoading(true); setError(''); setAppliedIdx(null)
    try {
      const res = await fetch('/api/goal-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: { name: goal.name, targetHours: goal.targetHours, targetUnit: unit, targetPeriod: period, description: goal.description },
          weeklyData: weeks.slice(-8).map(w => ({ label: w.label, hours: w.hours })),
          totalHours, sessionsCount: allGoalBlocks.length, streak,
          apiKey: anthropicKey || undefined
        })
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const data = await res.json()
      if (Array.isArray(data.insights)) setInsights(data.insights)
      else throw new Error('unexpected')
    } catch (e) {
      const msg = String(e)
      if (msg.includes('401')) setError('API key issue — check settings')
      else if (msg.includes('429')) setError('rate limited — try again shortly')
      else setError('could not load — try again')
    } finally { setLoading(false) }
  }

  const applyPrompt = (prompt: string, idx: number) => {
    setPendingAIPrompt(prompt); setView('mpd'); setAppliedIdx(idx)
    useStore.getState().showToast('prompt loaded — hit ✦ design my perfect day')
  }

  return (
    <div className="gdv-wrap">
      <button className="gdv-back" onClick={onBack}>← all goals</button>

      {/* Header */}
      <div className="gdv-hdr" style={{ '--gv-col': goal.color } as React.CSSProperties}>
        <div className="gdv-hdr-accent" style={{ background: goal.color }} />
        <div className="gdv-hdr-inner">
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <ProgressRing pct={periodPct} color={goal.color} size={72} stroke={6} />
            <div className="gdv-ring-center">
              <span className="gdv-ring-pct" style={{ color: goal.color }}>{periodPct}%</span>
            </div>
          </div>
          <div className="gdv-hdr-info">
            <div className="gdv-hdr-name">{goal.name}</div>
            {goal.description && <div className="gdv-hdr-desc">{goal.description}</div>}
            <div className="gdv-hdr-progress">
              <span style={{ color: goal.color, fontWeight: 700 }}>{periodActual}{unitLabel}</span>
              <span className="gdv-hdr-sep"> / {goal.targetHours}{unitLabel} {periodLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="gdv-kpis">
        <div className="gdv-kpi">
          <div className="gdv-kpi-val" style={{ color: goal.color }}>{totalHours}h</div>
          <div className="gdv-kpi-lbl">total logged</div>
        </div>
        <div className="gdv-kpi">
          <div className="gdv-kpi-val">{allGoalBlocks.length}</div>
          <div className="gdv-kpi-lbl">sessions</div>
        </div>
        <div className="gdv-kpi">
          <div className="gdv-kpi-val" style={{ color: streak > 0 ? goal.color : undefined }}>{streak}</div>
          <div className="gdv-kpi-lbl">week streak</div>
        </div>
        <div className="gdv-kpi">
          <div className="gdv-kpi-val">{periodPct}%</div>
          <div className="gdv-kpi-lbl">{periodLabel}</div>
        </div>
      </div>

      <div className="gdv-cols">
        <div className="gdv-col-main">

          {/* Weekly chart */}
          <div className="gdv-card">
            <div className="gdv-card-ttl">weekly hours · last 12 weeks</div>
            <div className="gdv-chart">
              <div className="gdv-target-line" style={{ bottom: `${targetLinePct}%` }}>
                <span className="gdv-target-lbl">target {targetH}h</span>
              </div>
              {weeks.map((w, i) => {
                const barH = maxH > 0 ? (w.hours / maxH) * 100 : 0
                const isThis = i === weeks.length - 1
                const hit = w.pct >= 100
                return (
                  <div key={i} className="gdv-bar-col">
                    <div className="gdv-bar-val">{w.hours > 0 ? `${w.hours}h` : ''}</div>
                    <div className="gdv-bar-track">
                      <div className="gdv-bar-fill" style={{
                        height: `${Math.max(barH, w.hours > 0 ? 3 : 0)}%`,
                        background: isThis ? goal.color : hit ? goal.color + 'bb' : 'var(--bd2)'
                      }} />
                    </div>
                    <div className={`gdv-bar-lbl${isThis ? ' this' : ''}`}>{w.label}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* AI coaching */}
          <div className="gdv-card">
            <div className="gdv-coach-hdr">
              <div>
                <div className="gdv-card-ttl">✦ AI coaching</div>
                <div className="gdv-card-sub">personalized tips for {goal.name}</div>
              </div>
              <button className={`av-insights-btn${loading ? ' loading' : ''}`} onClick={runInsights} disabled={loading}>
                {loading
                  ? <><div className="av-ins-dot"/><div className="av-ins-dot"/><div className="av-ins-dot"/><span>thinking…</span></>
                  : insights.length > 0 ? '↺ refresh' : '✦ coach me'}
              </button>
            </div>
            {error && <div className="av-ins-error">{error}</div>}
            {insights.length > 0 && (
              <div className="av-insight-cards" style={{ marginTop: 16 }}>
                {insights.map((ins, i) => (
                  <div key={i} className="av-insight-card">
                    <div className="av-ins-top">
                      <span className="av-ins-icon">{ins.icon}</span>
                      <div className="av-ins-content">
                        <div className="av-ins-title"><TypedText text={ins.title} speed={28} delay={i * 200} /></div>
                        <div className="av-ins-body"><TypedText text={ins.body} speed={8} delay={i * 200 + ins.title.length * 28} /></div>
                      </div>
                    </div>
                    {ins.prompt && (
                      <div className="av-ins-foot">
                        <div className="av-ins-prompt">"{ins.prompt}"</div>
                        <button className={`av-ins-apply${appliedIdx === i ? ' applied' : ''}`} onClick={() => applyPrompt(ins.prompt!, i)}>
                          {appliedIdx === i ? '✓ applied' : '→ use this'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {insights.length === 0 && !loading && !error && (
              <div className="av-ins-placeholder" style={{ marginTop: 16 }}>
                <div className="av-ins-ph-icon">✦</div>
                <div className="av-ins-ph-text">get personalized coaching on how to make faster progress on {goal.name}</div>
              </div>
            )}
          </div>

        </div>

        <div className="gdv-col-side">

          {/* Plan a session */}
          <div className="gdv-card gdv-plan-card" style={{ borderColor: goal.color + '55' }}>
            <div className="gdv-card-ttl">plan a session</div>
            <div className="gdv-card-sub">open the AI day builder pre-loaded with a prompt for this goal</div>
            <button className="gdv-plan-btn" style={{ background: goal.color }} onClick={() => {
              const t = unit === 'minutes' ? `${goal.targetHours}min` : `${goal.targetHours}h`
              setPendingAIPrompt(`Schedule a focused ${t} session for "${goal.name}"${goal.description ? ` — ${goal.description}` : ' — make meaningful progress on this goal'}`)
              setView('mpd')
              useStore.getState().showToast('prompt loaded — hit ✦ design my perfect day')
            }}>
              ✦ plan a session
            </button>
          </div>

          {/* Sessions log */}
          <div className="gdv-card">
            <div className="gdv-card-ttl">sessions log</div>
            {allGoalBlocks.length === 0 ? (
              <div className="gdv-empty">no sessions yet — link a block to this goal to start tracking</div>
            ) : (
              <>
                <div className="gdv-sessions">
                  {displayBlocks.map(b => {
                    const mins = toM(b.end) - toM(b.start)
                    const h = Math.floor(mins / 60), m = mins % 60
                    return (
                      <div key={b.id} className="gdv-session-row">
                        <div className="gdv-session-dot" style={{ background: goal.color }} />
                        <div className="gdv-session-info">
                          <div className="gdv-session-name">{b.name}</div>
                          <div className="gdv-session-meta">
                            {new Date(b.date + 'T12:00').toLocaleDateString('en', { month: 'short', day: 'numeric', weekday: 'short' })}
                            {' · '}{b.start}–{b.end}
                          </div>
                        </div>
                        <div className="gdv-session-dur" style={{ color: goal.color }}>
                          {h > 0 ? `${h}h` : ''}{m > 0 ? ` ${m}m` : ''}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {allGoalBlocks.length > 8 && (
                  <button className="av-types-seeall" onClick={() => setShowAll(s => !s)}>
                    {showAll ? '↑ show less' : `+ ${allGoalBlocks.length - 8} more sessions`}
                  </button>
                )}
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
