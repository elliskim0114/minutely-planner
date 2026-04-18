import { useState } from 'react'
import { useStore } from '../store'
import { DAYS, MONTHS, ENERGY_TIPS } from '../constants'
import { todayStr, plannedMinutes, totalDayMinutes, toM, nowMinutes } from '../utils'


export default function Sidebar() {
  const {
    sbCol, toggleSidebar, toggleMode, mode, view, setView,
    blocks, focuses, setFocus, cfg, intentions, setEnergy, setPriority, setNote, lockIntentions, unlockIntentions, deleteDayPriorities, deleteDayNote, togglePriorityDone, setPriorityForce,
    userName, openNotif, openSignIn, openSettings,
    clearDay, addBlock, selDate,
    timeBlindn, setTimeBlindn, openReschedule, setRescheduleDelay,
    lockedDays, lockDay, unlockDay, blockMoveCounts,
    goals, openGoals,
    templates, openTemplates, applyTemplate,
    openCoachAt,
    focusStreak, focusStreakDate,
    focusGems,
  } = useStore()
  const [notesOpen, setNotesOpen] = useState(false)
  const [prioArchiveOpen, setPrioArchiveOpen] = useState(false)
  const [editingPrio, setEditingPrio] = useState<{ date: string; idx: number; val: string } | null>(null)

  const [lateMenuOpen, setLateMenuOpen] = useState(false)
  const [dismissedPatterns, setDismissedPatterns] = useState<Set<string>>(new Set())
  const [qcInput, setQcInput] = useState('')
  const [qcLoading, setQcLoading] = useState(false)


  // Mini calendar
  const [miniCalMonth, setMiniCalMonth] = useState(() => new Date())
  const miniCalFirst = new Date(miniCalMonth.getFullYear(), miniCalMonth.getMonth(), 1).getDay()
  const miniCalDays = new Date(miniCalMonth.getFullYear(), miniCalMonth.getMonth() + 1, 0).getDate()
  const blockDates = new Set(blocks.map(b => b.date))
  const blockCountByDate = blocks.reduce<Record<string, number>>((acc, b) => {
    acc[b.date] = (acc[b.date] || 0) + 1; return acc
  }, {})
  const todayDate = new Date()

  const goToMiniCalDate = (day: number) => {
    const ds = `${miniCalMonth.getFullYear()}-${String(miniCalMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    useStore.getState().setSelDate(ds)
    setView('day')
  }

  const today = new Date()
  const td = todayStr()
  const int = intentions[td] || { e: 0, p: ['', '', ''] }
  const pm = plannedMinutes(blocks, td)
  const tm = totalDayMinutes(cfg)
  const pct = Math.min(100, Math.round((pm / tm) * 100))
  const h = Math.floor(pm / 60)
  const m = pm % 60
  const circumference = 2 * Math.PI * 17
  const strokeDash = circumference - (pct / 100) * circumference



  // Tomorrow lock
  const tomorrowStr = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const tomorrowBlocks = blocks.filter(b => b.date === tomorrowStr)
  const isTomorrowLocked = !!lockedDays[tomorrowStr]

  // Goal hours — sum block durations for a given goalId in the last 7 days
  const goalHours = (gid: number): number => {
    const since = new Date()
    since.setDate(since.getDate() - 7)
    const sinceStr = since.toISOString().slice(0, 10)
    return blocks
      .filter(b => b.goalId === gid && b.date >= sinceStr)
      .reduce((sum, b) => {
        const [sh, sm] = b.start.split(':').map(Number)
        const [eh, em] = b.end.split(':').map(Number)
        return sum + ((eh * 60 + em) - (sh * 60 + sm)) / 60
      }, 0)
  }

  // Pattern insight
  const patternEntry = Object.entries(blockMoveCounts)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])[0]

  const handleEnergyAI = () => {
    openCoachAt('design')
  }

  const handleQuickCapture = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = qcInput.trim()
    if (!text || qcLoading) return
    setQcLoading(true)
    try {
      const s = useStore.getState()
      const res = await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, today: td, apiKey: s.anthropicKey || undefined }),
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        const timed = data.filter((b: any) => b.start && b.end)
        if (timed.length > 0) {
          timed.forEach((b: any) => {
            addBlock({
              name: b.name,
              date: b.date || td,
              start: b.start,
              end: b.end,
              type: b.type || 'routine',
              cc: null,
              customName: null,
            })
          })
          s.showToast(`${timed.length} block${timed.length !== 1 ? 's' : ''} added ✓`)
          setQcInput('')
        } else {
          s.showToast('no time found — opening smart capture')
          s.openCapture()
          setQcInput('')
        }
      } else {
        s.showToast('nothing parsed — try e.g. "standup 9am 30min"')
      }
    } catch {
      useStore.getState().showToast('capture failed — check server')
    } finally {
      setQcLoading(false)
    }
  }

  // Live block
  const nowM = nowMinutes()
  const liveBlock = blocks.filter(b => b.date === td && toM(b.start) <= nowM && toM(b.end) > nowM)[0]

  return (
    <>
    <div id="sb" className={sbCol ? 'col' : ''}>
      {/* Header */}
      <div id="sb-hdr">
        <div id="sb-logo">
          <span className="logo-txt">minutely</span>
        </div>
        {/* Desktop chevron */}
        <button id="sb-tog" className="sbibtn" onClick={toggleSidebar} title="toggle sidebar">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {/* Mobile close ×  */}
        <button className="sb-mob-close" onClick={toggleSidebar} title="close menu">×</button>
      </div>

      {/* User badge — click to open settings */}
      <div id="user-badge" onClick={openSettings} title="settings & preferences" style={{ cursor: 'pointer' }}>
        <div className="ub-av">{userName ? userName[0].toUpperCase() : '?'}</div>
        <div className="ub-info">
          <div className="ub-name">{userName || 'guest'}</div>
          <div className="ub-status">settings & preferences</div>
        </div>
        <svg className="ub-settings-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginLeft: 'auto', flexShrink: 0, opacity: .5 }}>
          <path d="M7 1.5C5.07 1.5 3.5 3.07 3.5 5S5.07 8.5 7 8.5 10.5 6.93 10.5 5 8.93 1.5 7 1.5zM1.5 12c0-2.2 2.46-4 5.5-4s5.5 1.8 5.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      </div>

      <div id="sb-body">

        {/* ── TODAY ── */}
        <>

            <div id="sb-today">
              <div className="sb-big-date">{today.getDate()} {MONTHS[today.getMonth()]}</div>
              <div className="sb-dn">{DAYS[today.getDay()].toUpperCase()} · {today.getFullYear()}</div>

              <div className="fill-row">
                <div className="fill-circle-wrap">
                  <svg viewBox="0 0 42 42" width="42" height="42">
                    <circle cx="21" cy="21" r="17" fill="none" stroke="var(--bd2)" strokeWidth="3" />
                    <circle cx="21" cy="21" r="17" fill="none" stroke="var(--acc)" strokeWidth="3"
                      strokeDasharray={circumference} strokeDashoffset={strokeDash} strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.22,1,.36,1)' }}
                    />
                  </svg>
                  <div className="fill-pct">{pct}%</div>
                </div>
                <div className="fill-lbl">
                  <div id="fl-main" className="flm">{h}h{m ? ` ${m}m` : ''} planned</div>

                  {(() => {
                    const today2 = new Date().toISOString().slice(0, 10)
                    const yesterday2 = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
                    const active = focusStreakDate === today2 || focusStreakDate === yesterday2
                    return active && focusStreak > 0 ? (
                      <div className="sb-streak" title={`${focusStreak}-day focus streak`}>
                        🔥 <span className="sb-streak-n">{focusStreak}</span>
                        <span className="sb-streak-lbl">day streak</span>
                      </div>
                    ) : null
                  })()}
                </div>
                <button className="clear-day-btn" title="clear all blocks for today (C)" onClick={() => clearDay(td)}>clear</button>
              </div>

              <span className="sblbl">today's focus</span>
              <input
                id="sb-focus"
                placeholder="what matters most today?"
                defaultValue={focuses[td] || ''}
                key={td}
                onChange={e => setFocus(td, e.target.value)}
                onBlur={e => setFocus(td, e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { setFocus(td, e.currentTarget.value); e.currentTarget.blur() } }}
              />
            </div>

            {/* Live block tracker */}
            {liveBlock && (() => {
              const elapsed = nowM - toM(liveBlock.start)
              const total = toM(liveBlock.end) - toM(liveBlock.start)
              const livePct = Math.min(100, Math.round((elapsed / total) * 100))
              const minsLeft = toM(liveBlock.end) - nowM
              return (
                <div className="live-block-strip">
                  <div className="lb-row">
                    <div className={`lb-dot tc ${liveBlock.type === 'focus' ? 'tf' : liveBlock.type === 'routine' ? 'tr' : liveBlock.type === 'study' ? 'ts' : 'tl'}`} />
                    <span className="lb-name">{liveBlock.name}</span>
                    <span className="lb-mins">{minsLeft}m left</span>
                    <button className={`lb-blind-btn${timeBlindn ? ' on' : ''}`} onClick={() => setTimeBlindn(!timeBlindn)} title={timeBlindn ? 'turn off nudges' : 'turn on 10-min nudges'}>
                      {timeBlindn ? '🔔' : '🔕'}
                    </button>
                  </div>
                  <div className="lb-bar"><div className="lb-fill" style={{ width: `${livePct}%` }} /></div>
                </div>
              )
            })()}

            {/* Energy */}
            <div id="sb-energy">
              <span className="sblbl">energy today</span>
              <div className="e-row">
                {['—', 'low', 'med', 'peak'].map((lbl, i) => (
                  <button key={i} className={`ebtn${int.e === i ? ' on' : ''}`} onClick={() => setEnergy(td, i)}>{lbl}</button>
                ))}
              </div>
              <div id="energy-tip">{ENERGY_TIPS[int.e] || ENERGY_TIPS[0]}</div>
              {int.e > 0 && (
                <button id="e-ai-btn" className="e-ai-btn show" onClick={handleEnergyAI}>
                  ✦ design day with coach
                </button>
              )}
            </div>

            {/* Priorities */}
            <div id="sb-prio">
              <div className="sb-prio-hdr">
                <span className="sblbl">priorities</span>
                <div className="sb-prio-hdr-acts">
                  <button className="sb-prio-archive-btn" onClick={() => setPrioArchiveOpen(true)}>history</button>
                  {int.locked && (
                    <button
                      className="sb-prio-unlock"
                      onClick={() => unlockIntentions(td)}
                    >unlock</button>
                  )}
                </div>
              </div>
              <div className={`plist${int.locked ? ' locked' : ''}`}>
                {[0, 1, 2].map(i => (
                  <div key={i} className="prow">
                    {int.locked ? (
                      <button
                        className={`pcheck${(int.done?.[i]) ? ' done' : ''}`}
                        onClick={() => togglePriorityDone(td, i)}
                        title={int.done?.[i] ? 'mark incomplete' : 'mark done'}
                      >
                        {int.done?.[i] ? '✓' : ''}
                      </button>
                    ) : (
                      <span className="pnum">{i + 1}</span>
                    )}
                    {int.locked ? (
                      <span className={`pinp-locked${int.done?.[i] ? ' done' : ''}`}>
                        {int.p[i] || <em className="pinp-empty">—</em>}
                      </span>
                    ) : (
                      <input
                        className="pinp"
                        placeholder={`priority ${i + 1}`}
                        defaultValue={int.p[i] || ''}
                        key={`${td}-${i}`}
                        onChange={e => setPriority(td, i, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                      />
                    )}
                  </div>
                ))}
              </div>
              {!int.locked && int.p.some(p => p.trim()) && (
                <button className="sb-prio-lock" onClick={() => lockIntentions(td)}>
                  🔒 lock in for today
                </button>
              )}
              {int.locked && (
                <div className="sb-prio-committed">
                  <span className="sb-prio-committed-dot" />
                  {(int.done || []).filter(Boolean).length === 3
                    ? 'all done 💎'
                    : `${(int.done || []).filter(Boolean).length}/3 done`}
                </div>
              )}
            </div>

            {/* Journal */}
            <div id="sb-journal">
              <div className="sb-journal-hdr">
                <span className="sblbl">journal</span>
                <button className="sb-notes-btn" onClick={() => setNotesOpen(true)}>all notes</button>
              </div>
              <textarea
                className="sb-journal-inp"
                placeholder="how's your day going…"
                value={int.note || ''}
                key={`note-${td}`}
                onChange={e => setNote(td, e.target.value)}
              />
            </div>

            {/* Goals section */}
            {goals.length > 0 && (
              <div className="sb-goals-section">
                <div className="sb-goals-hdr">
                  <span className="sblbl">goals</span>
                  <button className="sb-goals-edit" onClick={openGoals}>edit</button>
                </div>
                <div className="sb-goals-list">
                  {goals.map(g => {
                    const actual = goalHours(g.id)
                    const pct = g.targetHours > 0 ? Math.min(100, Math.round((actual / g.targetHours) * 100)) : 0
                    const isComplete = pct >= 100
                    return (
                      <button key={g.id} className={`sb-goal-chip${isComplete ? ' done' : ''}`} onClick={openGoals} title={`${actual.toFixed(1)}h / ${g.targetHours}h this week`}>
                        <div className="sgc-top">
                          <span className="sgc-dot" style={{ background: g.color }} />
                          <span className="sgc-name">{g.name}</span>
                          <span className="sgc-hrs">
                            <span style={{ color: g.color, fontWeight: 600 }}>{actual.toFixed(1)}</span>
                            <span className="sgc-target">/{g.targetHours}h</span>
                            {isComplete && <span className="sgc-done-mark">✓</span>}
                          </span>
                        </div>
                        <div className="sgc-bar">
                          <div className="sgc-fill" style={{ width: `${pct}%`, background: g.color }} />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {goals.length === 0 && (
              <div className="sb-goals-section">
                <div className="sb-goals-hdr">
                  <span className="sblbl">goals</span>
                </div>
                <button className="sb-goals-add" onClick={openGoals}>+ add goal</button>
              </div>
            )}

            {/* Routines section */}
            <div className="sb-tmpl-section">
              <div className="sb-goals-hdr">
                <span className="sblbl">routines</span>
                <button className="sb-goals-edit" onClick={openTemplates}>manage</button>
              </div>
              <div className="sb-tmpl-list">
                <button className="sb-tmpl-save" onClick={openTemplates}>+ save routine</button>
                {templates.map(t => (
                  <button key={t.id} className="sb-tmpl-chip" onClick={() => { applyTemplate(t.id, selDate || td, 0); useStore.getState().showToast(`"${t.name}" applied`) }} title={`apply "${t.name}" to ${selDate || td}`}>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

          {/* Running late emergency valve */}
          <div className="ev-wrap" style={{ marginTop: 6 }}>
            <button className={`ev-main-btn${lateMenuOpen ? ' open' : ''}`} onClick={() => setLateMenuOpen(v => !v)}>
              <span>🚨</span><span>i'm running late</span><span className="ev-arr">{lateMenuOpen ? '▲' : '▼'}</span>
            </button>
            {lateMenuOpen && (
              <div className="ev-options">
                <span className="ev-opts-lbl">how late?</span>
                {[15, 30, 45, 60].map(mins => (
                  <button key={mins} className="ev-opt" onClick={() => { setRescheduleDelay(mins); openReschedule(); setLateMenuOpen(false) }}>
                    +{mins >= 60 ? '1h' : `${mins}m`}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pattern insight */}
          {patternEntry && !dismissedPatterns.has(patternEntry[0]) && (
            <div className="pattern-card">
              <div className="pc-top">
                <span className="pc-icon">⟳</span>
                <span className="pc-ttl">pattern detected</span>
                <button className="pc-dismiss" onClick={() => setDismissedPatterns(p => { const s = new Set(p); s.add(patternEntry[0]); return s })}>×</button>
              </div>
              <div className="pc-body">
                <strong>{patternEntry[0]}</strong> moved {patternEntry[1]}× — find it a permanent slot.
              </div>
            </div>
          )}

          {/* Lock tomorrow */}
          {tomorrowBlocks.length > 0 && (
            <div className="lock-tmrw-wrap" style={{ marginTop: 6 }}>
              {isTomorrowLocked ? (
                <div className="lock-tmrw-locked">
                  <span className="lt-icon">🔒</span>
                  <span className="lt-lbl">tomorrow locked</span>
                  <button className="lt-unlock" onClick={() => unlockDay(tomorrowStr)}>unlock</button>
                </div>
              ) : (
                <button className="lock-tmrw-btn" onClick={() => { lockDay(tomorrowStr); useStore.getState().showToast("tomorrow's plan locked in") }}>
                  <span>🔒</span><span>lock in tomorrow</span>
                </button>
              )}
            </div>
          )}

          {/* Mini calendar */}
          <div id="mini-cal">
            <div className="mc2-hdr">
              <button className="mc2-nav" onClick={() => setMiniCalMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>‹</button>
              <span className="mc2-title">{MONTHS[miniCalMonth.getMonth()]} {miniCalMonth.getFullYear()}</span>
              <button className="mc2-nav" onClick={() => setMiniCalMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>›</button>
            </div>
            <div className="mc2-grid">
              {['S','M','T','W','T','F','S'].map((d, i) => <div key={i} className="mc2-dow">{d}</div>)}
              {Array.from({ length: miniCalFirst }).map((_, i) => <div key={`e${i}`} className="mc2-empty" />)}
              {Array.from({ length: miniCalDays }, (_, i) => i + 1).map(day => {
                const ds = `${miniCalMonth.getFullYear()}-${String(miniCalMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const isToday = day === todayDate.getDate() && miniCalMonth.getMonth() === todayDate.getMonth() && miniCalMonth.getFullYear() === todayDate.getFullYear()
                const isSel = ds === (selDate || td)
                const hasBlocks = blockDates.has(ds)
                return (
                  <button key={day} className={`mc2-day${isToday ? ' today' : ''}${isSel ? ' sel' : ''}${hasBlocks ? ' has-blocks' : ''}`} onClick={() => goToMiniCalDate(day)} title={ds}>
                    <span>{day}</span>
                    {hasBlocks && <span className="mc2-dot" title={`${blockCountByDate[ds]} blocks`}>{blockCountByDate[ds]}</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Quick NLP capture */}
          <div className="sb-quick-cap">
            <form className="sb-qc-form" onSubmit={handleQuickCapture}>
              <span className="sb-qc-icon">⚡</span>
              <input
                className="sb-qc-inp"
                placeholder="quick add… standup 9am 30min"
                value={qcInput}
                onChange={e => setQcInput(e.target.value)}
                disabled={qcLoading}
              />
              {qcLoading && <span className="sb-qc-spin">…</span>}
            </form>
          </div>

          {/* Nav buttons */}
          <div id="sb-nav">
            <button className={`snb${view === 'week' ? ' on' : ''}`} onClick={() => setView('week')}>
              <svg viewBox="0 0 15 15" fill="none">
                <rect x="1" y="3" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M1 7h13M5 3V1M10 3V1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <span className="snb-t">week</span>
              <span className="snb-k">W</span>
            </button>
            <button className={`snb${view === 'day' ? ' on' : ''}`} onClick={() => setView('day')}>
              <svg viewBox="0 0 15 15" fill="none">
                <rect x="2" y="3" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M2 7h11M5 3V1M10 3V1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <span className="snb-t">day</span>
              <span className="snb-k">D</span>
            </button>
            <button className={`snb${view === 'month' ? ' on' : ''}`} onClick={() => setView('month')}>
              <svg viewBox="0 0 15 15" fill="none">
                <rect x="1" y="2" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M1 6h13M5 2V0M10 2V0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <rect x="3" y="8" width="2" height="2" rx=".5" fill="currentColor" opacity=".6"/>
                <rect x="6.5" y="8" width="2" height="2" rx=".5" fill="currentColor" opacity=".6"/>
                <rect x="10" y="8" width="2" height="2" rx=".5" fill="currentColor" opacity=".6"/>
              </svg>
              <span className="snb-t">month</span>
              <span className="snb-k">M</span>
            </button>
          </div>
        </>

      </div>

      {/* Bottom bar */}
      <div id="sb-btm">
        {focusGems > 0 && (
          <div className={`sb-gem-badge${focusGems >= 100 ? ' master' : ''}`} title={`${focusGems} focus gems earned`}>
            <span className="sb-gem-icon">◆</span>
            <span className="sb-gem-n">{focusGems}</span>
            {focusGems >= 100 && <span className="sb-gem-lbl">master</span>}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button className="sbb" onClick={openNotif} title="notifications">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1.5C4.5 1.5 3 3.5 3 5.5v3l-1 1.5h10l-1-1.5v-3C11 3.5 9.5 1.5 7 1.5zM5.5 10a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
          </svg>
        </button>
        <button className="sbb" id="sb-mode" onClick={toggleMode} title={`theme: ${mode}`}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            {mode === 'light'
              ? <path d="M7 1v1M7 12v1M1 7H2M12 7h1M3 3l.7.7M10.3 10.3l.7.7M3 11l.7-.7M10.3 3.7l.7-.7M7 4a3 3 0 100 6 3 3 0 000-6z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              : mode === 'dark'
              ? <path d="M11 8A5 5 0 015 2a6 6 0 106 6z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              : mode === 'ember'
              ? <path d="M7 2C7 2 4 5 4 8a3 3 0 006 0c0-1.5-1-3-1-3s-.5 2-1.5 2c-.8 0-1-.8-1-1.5C6.5 4.5 7 2 7 2z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              : mode === 'ocean'
              ? <path d="M1 8c1.5-2 3-2 4.5 0s3 2 4.5 0M1 10.5c1.5-2 3-2 4.5 0s3 2 4.5 0M4 4.5a3 3 0 016 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              : mode === 'forest'
              ? <path d="M7 1L4 6H2L5 9H3L7 13L11 9H9L12 6H10L7 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none"/>
              : mode === 'aurora'
              ? <><path d="M1 9 C3 5 5 3 7 5 C9 7 11 5 13 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none"/><path d="M2 12 C4 8 6 6 7 8 C8 10 10 8 12 12" stroke="var(--acc2)" strokeWidth="1" strokeLinecap="round" fill="none" opacity=".7"/></>
              : mode === 'nebula'
              ? <><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2 1.5"/><circle cx="7" cy="7" r="1.5" fill="var(--acc)"/><path d="M3 3l.5.5M10.5 3l-.5.5M3 11l.5-.5M10.5 11l-.5-.5" stroke="var(--acc2)" strokeWidth="1" strokeLinecap="round"/></>
              : <path d="M7 1v1M7 12v1M1 7H2M12 7h1M3.5 3.5l.7.7M9.8 9.8l.7.7M3.5 10.5l.7-.7M9.8 4.2l.7-.7M5 7a2 2 0 104 0 2 2 0 00-4 0z" stroke="var(--acc)" strokeWidth="1.3" strokeLinecap="round"/>
            }
          </svg>
        </button>
      </div>
    </div>

    {/* Priority Archive modal */}
    {prioArchiveOpen && (
      <div className="notes-overlay" onClick={() => setPrioArchiveOpen(false)}>
        <div className="notes-modal" onClick={e => e.stopPropagation()}>
          <div className="notes-hdr">
            <span className="notes-title">🎯 priority history</span>
            <button className="notes-close" onClick={() => setPrioArchiveOpen(false)}>×</button>
          </div>
          <div className="notes-list">
            {Object.entries(intentions)
              .filter(([, v]) => v.p.some(p => p.trim()))
              .sort((a, b) => b[0].localeCompare(a[0]))
              .map(([date, v]) => {
                const d = new Date(date + 'T12:00')
                const label = d.toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' })
                const doneCount = (v.done || []).filter(Boolean).length
                const filledCount = v.p.filter(p => p.trim()).length
                return (
                  <div key={date} className="notes-entry">
                    <div className="notes-date" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {label}
                      {v.locked && filledCount > 0 && (
                        <span className={`pa-badge${doneCount === filledCount ? ' all' : ''}`}>
                          {doneCount === filledCount ? '💎 all done' : `${doneCount}/${filledCount}`}
                        </span>
                      )}
                      <button className="notes-del" onClick={() => deleteDayPriorities(date)} title="delete priorities for this day">×</button>
                    </div>
                    <div className="pa-plist">
                      {v.p.map((p, i) => {
                        const isEditing = editingPrio?.date === date && editingPrio?.idx === i
                        if (!p.trim() && !isEditing) return null
                        return (
                          <div key={i} className={`pa-prow${v.done?.[i] ? ' done' : ''}${isEditing ? ' editing' : ''}`}>
                            <span
                              className="pa-check"
                              onClick={() => togglePriorityDone(date, i)}
                              title={v.done?.[i] ? 'mark undone' : 'mark done'}
                            >{v.done?.[i] ? '✓' : '·'}</span>
                            {isEditing ? (
                              <input
                                className="pa-edit-inp"
                                value={editingPrio.val}
                                autoFocus
                                onChange={e => setEditingPrio(prev => prev ? { ...prev, val: e.target.value } : null)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' || e.key === 'Escape') {
                                    if (e.key === 'Enter') setPriorityForce(date, i, editingPrio.val.trim())
                                    setEditingPrio(null)
                                  }
                                }}
                                onBlur={() => {
                                  setPriorityForce(date, i, editingPrio.val.trim())
                                  setEditingPrio(null)
                                }}
                              />
                            ) : (
                              <span
                                className="pa-text"
                                onClick={() => setEditingPrio({ date, idx: i, val: p })}
                                title="click to edit"
                              >{p}</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            {Object.values(intentions).every(v => !v.p.some(p => p.trim())) && (
              <div className="notes-empty">no priorities logged yet — add some today</div>
            )}
          </div>
        </div>
      </div>
    )}

    {/* All Notes modal */}
    {notesOpen && (
      <div className="notes-overlay" onClick={() => setNotesOpen(false)}>
        <div className="notes-modal" onClick={e => e.stopPropagation()}>
          <div className="notes-hdr">
            <span className="notes-title">📝 journal</span>
            <button className="notes-close" onClick={() => setNotesOpen(false)}>×</button>
          </div>
          <div className="notes-list">
            {Object.entries(intentions)
              .filter(([, v]) => v.note?.trim())
              .sort((a, b) => b[0].localeCompare(a[0]))
              .map(([date, v]) => {
                const d = new Date(date + 'T12:00')
                const label = d.toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' })
                return (
                  <div key={date} className="notes-entry">
                    <div className="notes-date" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {label}
                      <button className="notes-del" onClick={() => deleteDayNote(date)} title="delete this note">×</button>
                    </div>
                    <div className="notes-body">{v.note}</div>
                  </div>
                )
              })}
            {Object.values(intentions).every(v => !v.note?.trim()) && (
              <div className="notes-empty">no journal entries yet — write something in today's journal</div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  )
}
