import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { useStore } from '../store'
import { toM, toT, fmt, weekStart, dateStr, todayStr, parseLocalDate } from '../utils'
import { MONTHS, DAYS } from '../constants'
import type { PDBlock } from '../types'
import PDWizardModal from './PDWizardModal'

const SLOT = 60 // hourly rows in MPD view

const TYPE_COLORS: Record<string, string> = {
  focus: 'var(--bfbd)',
  routine: 'var(--brbd)',
  study: 'var(--bsbd)',
  free: 'var(--blbd)',
  custom: 'var(--acc)',
}

function blkClass(b: PDBlock) {
  if (b.cc) return 'td'
  const map: Record<string, string> = { focus: 'tf', routine: 'tr', study: 'ts', free: 'tl', gcal: 'tg2', custom: 'td' }
  return map[b.type] || 'td'
}

export default function MPDView() {
  const {
    view, cfg, perfectDay, wOff, applyPDToday, applyPDTo,
    openBlockModalForPD, openBlockModalEditPD, setPerfectDay,
    openShare, showToast, pendingAIPrompt, setPendingAIPrompt,
    userProfile, goals, intentions, blocks,
    pdProfiles, activePdProfileId, savePdProfile, loadPdProfile, deletePdProfile, newDayPreset,
    applyBlocksToDate, anthropicKey,
    blueprintVisible, toggleBlueprintView,
  } = useStore()

  const handleApplyToday = () => {
    const today = new Date().toISOString().slice(0, 10)
    const todayHasBlocks = blocks.some(b => b.date === today)
    if (todayHasBlocks) {
      if (!window.confirm("Today already has blocks — applying your perfect day will replace them. Continue?")) return
    }
    applyPDToday()
  }
  const [wizardOpen, setWizardOpen] = useState(false)
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const aiInputRef = useRef<HTMLTextAreaElement>(null)

  // Profile switcher state
  const [profileSaveOpen, setProfileSaveOpen] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileEmoji, setProfileEmoji] = useState('✨')

  // Smart apply state
  const [smartApplyLoading, setSmartApplyLoading] = useState(false)

  // Drag-to-move state
  const [dragPDIdx, setDragPDIdx] = useState<number | null>(null)
  const [dragOverHour, setDragOverHour] = useState<number | null>(null)

  // Resize-by-drag state
  const [resizingIdx, setResizingIdx] = useState<number | null>(null)
  const resizeRef = useRef<{ idx: number; startY: number; origEndM: number; origStartM: number; mode: 'top' | 'bottom' } | null>(null)
  const pdRef = useRef(perfectDay)
  pdRef.current = perfectDay
  const cfgDeRef = useRef(toM(cfg.de))
  cfgDeRef.current = toM(cfg.de)

  // Global mouse handlers for resize (mounted once)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current) return
      const { idx, startY, origEndM, origStartM, mode } = resizeRef.current
      const deltaMin = Math.round(((e.clientY - startY) / 56) * 60 / 15) * 15
      const pd = [...pdRef.current]
      if (mode === 'bottom') {
        const newEndM = Math.max(origStartM + 15, Math.min(cfgDeRef.current, origEndM + deltaMin))
        pd[idx] = { ...pd[idx], end: toT(newEndM) }
      } else {
        const cfgDsM = toM(pd[idx].end) - 15  // keep at least 15m block
        const newStartM = Math.max(0, Math.min(cfgDsM, origStartM + deltaMin))
        pd[idx] = { ...pd[idx], start: toT(newStartM) }
      }
      setPerfectDay(pd)
    }
    const onUp = () => {
      resizeRef.current = null
      setResizingIdx(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const movePDBlock = useCallback((dragIdx: number, toHourM: number) => {
    const b = pdRef.current[dragIdx]
    const dur = toM(b.end) - toM(b.start)
    const newStartM = toHourM
    const newEndM = Math.min(cfgDeRef.current, newStartM + dur)
    const pd = [...pdRef.current]
    pd[dragIdx] = { ...pd[dragIdx], start: toT(newStartM), end: toT(newEndM) }
    setPerfectDay(pd)
  }, [setPerfectDay])

  // Consume energy→AI handoff prompt
  useEffect(() => {
    if (pendingAIPrompt && view === 'mpd') {
      setAiInput(pendingAIPrompt)
      setPendingAIPrompt(null)
      setTimeout(() => aiInputRef.current?.focus(), 100)
    }
  }, [pendingAIPrompt, view])

  const startM = toM(cfg.ds)
  const endM = toM(cfg.de)

  // Hour rows for the timeline
  const hours: number[] = []
  for (let m = startM; m < endM; m += SLOT) hours.push(m)

  // Week day buttons
  const ws = weekStart(wOff)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = dateStr(ws, i)
    const dt = parseLocalDate(date)
    return { date, label: `${DAYS[dt.getDay()].slice(0, 3)} ${dt.getDate()}` }
  })

  // Stats
  const total = perfectDay.reduce((s, b) => s + toM(b.end) - toM(b.start), 0)
  const totalH = Math.floor(total / 60)
  const totalMin = total % 60
  const by: Record<string, number> = { focus: 0, routine: 0, study: 0, free: 0, custom: 0 }
  perfectDay.forEach(b => { by[b.cc ? 'custom' : (b.type || 'free')] += toM(b.end) - toM(b.start) })

  const rmPDB = (idx: number) => {
    const pd = [...perfectDay]
    pd.splice(idx, 1)
    setPerfectDay(pd)
  }

  const runAI = async () => {
    const prompt = aiInput.trim() || personalizedPrompt
    if (!prompt) { aiInputRef.current?.focus(); return }
    setAiLoading(true)
    const sys = `You are a day planning assistant for minutely. Generate a daily schedule as a JSON array. Each item must have: name (string), type (one of: focus, routine, study, free), start (HH:MM), end (HH:MM). Day runs ${cfg.ds} to ${cfg.de}. No overlaps. 6-10 blocks. Return ONLY the JSON array, nothing else, no markdown.`
    try {
      const res = await fetch('/api/perfect-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, dayStart: cfg.ds, dayEnd: cfg.de, apiKey: anthropicKey || undefined }),
      })
      const raw = await res.text()
      let data: any
      try { data = JSON.parse(raw) } catch { throw new Error('AI service unavailable — try again shortly') }
      if (!res.ok) throw new Error(data?.error || 'HTTP ' + res.status)
      if (Array.isArray(data) && data.length > 0) {
        setPerfectDay(data)
        showToast('AI designed your perfect day')
      } else {
        throw new Error('empty schedule')
      }
    } catch (err) {
      const msg = String(err)
      if (msg.includes('401')) showToast('API key issue — try reloading')
      else if (msg.includes('429')) showToast('rate limited — wait a moment')
      else showToast('could not generate — try a different description')
    } finally {
      setAiLoading(false)
    }
  }

  const handleSmartApply = async () => {
    if (perfectDay.length === 0) { showToast('add blocks to your blueprint first'); return }
    const today = todayStr()
    const todayBlocks = blocks.filter(b => b.date === today)
    if (todayBlocks.length > 0) {
      if (!window.confirm("Today already has blocks — smart apply will replace them with an adapted schedule. Continue?")) return
    }
    setSmartApplyLoading(true)
    try {
      const todayDate = new Date()
      const dayOfWeek = DAYS[todayDate.getDay()]
      const energy = intentions[today]?.e ?? null
      const res = await fetch('/api/adapt-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blueprint: perfectDay,
          existingBlocks: todayBlocks.map(b => ({ start: b.start, end: b.end, name: b.name })),
          energy,
          dayOfWeek,
          dayStart: cfg.ds,
          dayEnd: cfg.de,
          apiKey: anthropicKey || undefined,
        }),
      })
      const raw = await res.text()
      let data: any
      try { data = JSON.parse(raw) } catch { throw new Error('AI service unavailable') }
      if (!res.ok) throw new Error(data?.error || 'HTTP ' + res.status)
      if (!Array.isArray(data.blocks) || data.blocks.length === 0) throw new Error('empty schedule')
      applyBlocksToDate(today, data.blocks)
    } catch (err) {
      const msg = String(err)
      if (msg.includes('429')) showToast('rate limited — wait a moment')
      else showToast('smart apply failed — try again')
    } finally {
      setSmartApplyLoading(false)
    }
  }

  const [applyOpen, setApplyOpen] = useState(false)

  // Build personalized prompt from profile + goals + recent history
  const { personalizedPrompt, recentEnergy } = useMemo(() => {
    const today = new Date()
    let totalE = 0, countE = 0
    for (let i = 0; i < 7; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      const int = intentions[key]
      if (int && int.e > 0) { totalE += int.e; countE++ }
    }
    const avgEnergy = countE > 0 ? totalE / countE : null

    const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 14)
    const recentBlks = blocks.filter(b => new Date(b.date) >= cutoff)
    const nameCounts: Record<string, number> = {}
    recentBlks.forEach(b => { nameCounts[b.name] = (nameCounts[b.name] || 0) + 1 })
    const topNames = Object.entries(nameCounts).sort((a, b) => b[1] - a[1]).map(([n]) => n).slice(0, 5)

    const parts: string[] = []
    if (userProfile?.occupation) parts.push(`I'm a ${userProfile.occupation}`)
    if (userProfile?.energyPattern) {
      const map = { morning: 'most productive in the morning', afternoon: 'most productive in the afternoon', evening: 'most creative in the evening', night: 'a night owl' }
      parts.push(map[userProfile.energyPattern])
    }
    if (userProfile?.lifestyle?.length) parts.push(`my daily life includes ${userProfile.lifestyle.map(l => l.replace(/-/g, ' ')).join(', ')}`)
    if (userProfile?.challenges?.length) parts.push(`I struggle with ${userProfile.challenges.map(c => c.replace(/-/g, ' ')).join(' and ')}`)
    if (goals?.length) parts.push(`my goals: ${goals.map(g => g.name).join(', ')}`)
    if (avgEnergy !== null) {
      const desc = avgEnergy < 1 ? 'low energy lately' : avgEnergy < 2 ? 'moderate energy' : 'high energy lately'
      parts.push(`I've had ${desc}`)
    }
    if (topNames.length) parts.push(`my recent schedule includes: ${topNames.join(', ')}`)
    if (userProfile?.bio) parts.push(userProfile.bio)

    return { personalizedPrompt: parts.length > 0 ? parts.join('. ') + '.' : '', recentEnergy: avgEnergy }
  }, [userProfile, goals, intentions, blocks])

  // ── Feature 3: Adherence Score ──────────────────────────────────────────────
  const adherenceData = useMemo(() => {
    if (perfectDay.length === 0) return null
    const today = new Date()
    const days: Array<{ label: string; score: number | null }> = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const dateKey = d.toISOString().slice(0, 10)
      const dayLabel = DAYS[d.getDay()].slice(0, 3)
      const dayBlocks = blocks.filter(b => b.date === dateKey)
      if (dayBlocks.length === 0) {
        days.push({ label: dayLabel, score: null })
        continue
      }
      let matched = 0
      for (const pb of perfectDay) {
        const pbStartM = toM(pb.start)
        const pbNameLower = pb.name.toLowerCase()
        const found = dayBlocks.some(db => {
          const nameLower = db.name.toLowerCase()
          const nameMatch = nameLower.includes(pbNameLower) || pbNameLower.includes(nameLower)
          const timeMatch = Math.abs(toM(db.start) - pbStartM) <= 60
          return nameMatch && timeMatch
        })
        if (found) matched++
      }
      days.push({ label: dayLabel, score: Math.round((matched / perfectDay.length) * 100) })
    }
    const scored = days.filter(d => d.score !== null)
    const avg = scored.length > 0 ? Math.round(scored.reduce((s, d) => s + (d.score ?? 0), 0) / scored.length) : null
    return { days, avg }
  }, [perfectDay, blocks])

  // ── Profile save handler ────────────────────────────────────────────────────
  const handleSaveProfile = () => {
    if (!profileName.trim()) return
    const savedName = profileName.trim()
    savePdProfile(null, savedName, profileEmoji)
    setProfileSaveOpen(false)
    setProfileName('')
    setProfileEmoji('✨')
    showToast(`"${savedName}" saved`)
  }

  const handleLoadProfile = (id: number) => {
    const profile = pdProfiles.find(p => p.id === id)
    if (!profile) return
    if (activePdProfileId !== id && perfectDay.length > 0) {
      if (!window.confirm(`Load "${profile.name}" preset? Your current blueprint will be replaced.`)) return
    }
    loadPdProfile(id)
    showToast(`loaded "${profile.name}"`)
  }

  const handleDeleteProfile = (id: number, name: string) => {
    if (!window.confirm(`Delete "${name}" preset?`)) return
    deletePdProfile(id)
    showToast(`"${name}" deleted`)
  }

  // suppress unused warning
  void openShare
  void MONTHS

  return (
    <div id="mpd-view" className={view === 'mpd' ? 'on' : ''}>
      {/* Hero */}
      <div id="mpd-hero">
        <div className="mpd-hero-inner">
          <div className="mpd-hero-left">
            <span className="mpd-tag">blueprint</span>
            <h1>my perfect day</h1>
            <p>design your ideal daily rhythm — apply it to any day.</p>
          </div>
          <div className="mpd-hero-acts">
            <div className="mpd-apply-wrap">
              <button className="mpd-apply" onClick={handleApplyToday}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                apply to today
              </button>
              <button
                className={`mpd-apply-more${applyOpen ? ' open' : ''}`}
                onClick={() => setApplyOpen(v => !v)}
                title="apply to another day"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d={applyOpen ? 'M2 6.5l3-3 3 3' : 'M2 3.5l3 3 3-3'} stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {applyOpen && (
                <div className="mpd-apply-dropdown">
                  {weekDays.map(({ date, label }) => (
                    <button key={date} className="mpd-apply-day" onClick={() => { applyPDTo(date); setApplyOpen(false) }}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="mpd-smart-apply"
              disabled={smartApplyLoading}
              onClick={handleSmartApply}
              title="AI adapts blueprint around today's existing events and energy"
            >
              {smartApplyLoading
                ? <><div className="ald" /><span>adapting…</span></>
                : <><span>✦</span><span>smart apply</span></>
              }
            </button>
            {perfectDay.length > 0 && (
              <button
                className={`mpd-overlay-tog${blueprintVisible ? ' on' : ''}`}
                onClick={toggleBlueprintView}
                title={blueprintVisible ? 'hide blueprint overlay on calendar' : 'show blueprint as ghost blocks on calendar'}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <rect x="1" y="2.5" width="11" height="2" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeDasharray="2 1.2"/>
                  <rect x="1" y="6" width="11" height="2" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeDasharray="2 1.2"/>
                  <rect x="1" y="9.5" width="7" height="2" rx="0.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeDasharray="2 1.2"/>
                </svg>
                {blueprintVisible ? 'overlay on' : 'calendar overlay'}
              </button>
            )}
          </div>
        </div>

        {/* Day presets */}
        <div className="mpd-profiles-section">
          <div className="mpd-profiles-header">
            <span className="mpd-profiles-label">day presets</span>
            <span className="mpd-profiles-hint" title="Save different versions of your perfect day — e.g. a 'work day', 'rest day', or 'travel day'. Switch between them any time.">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M6 5.5v3M6 4h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              save different versions of your perfect day to switch between
            </span>
          </div>
          <div className="mpd-profiles-row">
            {pdProfiles.map(p => (
              <span
                key={p.id}
                className={`mpd-profile-chip${activePdProfileId === p.id ? ' active' : ''}`}
                onClick={() => handleLoadProfile(p.id)}
                title={activePdProfileId === p.id ? 'active preset' : `load "${p.name}"`}
              >
                {p.emoji} {p.name}
                <button
                  className="mpd-profile-chip-del"
                  onClick={e => { e.stopPropagation(); handleDeleteProfile(p.id, p.name) }}
                  title="delete preset"
                >×</button>
              </span>
            ))}
            {/* New preset button — shown when canvas has content so user can start fresh */}
            {!profileSaveOpen && perfectDay.length > 0 && (
              <button
                className="mpd-profile-new-btn"
                onClick={() => {
                  if (activePdProfileId !== null || perfectDay.length > 0) {
                    if (!window.confirm('Start a new preset? Your current canvas will be cleared.')) return
                  }
                  newDayPreset()
                }}
                title="clear canvas and start a new day preset"
              >
                + new preset
              </button>
            )}
            {profileSaveOpen ? (
              <span className="mpd-profile-save-form">
                <input
                  className="mpd-profile-emoji-inp"
                  value={profileEmoji}
                  onChange={e => setProfileEmoji(e.target.value)}
                  maxLength={2}
                />
                <input
                  className="mpd-profile-name-inp"
                  placeholder="preset name…"
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveProfile(); if (e.key === 'Escape') setProfileSaveOpen(false) }}
                  autoFocus
                />
                <button className="mpd-profile-save-btn" onClick={handleSaveProfile}>save</button>
                <button className="mpd-profile-chip-del" style={{ fontSize: 16 }} onClick={() => setProfileSaveOpen(false)}>×</button>
              </span>
            ) : (
              <button className="mpd-profile-add-btn" onClick={() => setProfileSaveOpen(true)}>
                + save as day preset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div id="mpd-body">
        {/* Timeline */}
        <div id="mpd-tl">
          {hours.map(hourM => {
            const blocksInHour = perfectDay.filter(b => toM(b.start) >= hourM && toM(b.start) < hourM + SLOT)
            return (
              <div
                key={hourM}
                className={`mpd-hr${dragOverHour === hourM && dragPDIdx !== null ? ' drag-over' : ''}`}
                onClick={e => {
                  if ((e.target as HTMLElement).closest('.mpd-chip') || (e.target as HTMLElement).closest('.mpd-add')) return
                  openBlockModalForPD(hourM)
                }}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverHour(hourM) }}
                onDragLeave={e => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragOverHour(null) }}
                onDrop={e => {
                  e.preventDefault()
                  setDragOverHour(null)
                  if (dragPDIdx !== null) { movePDBlock(dragPDIdx, hourM); setDragPDIdx(null) }
                }}
              >
                <div className="mpd-hl">{fmt(toT(hourM), cfg.tf)}</div>
                <div className="mpd-chips">
                  {blocksInHour.map((b, relIdx) => {
                    const idx = perfectDay.indexOf(b)
                    const customStyle = b.cc
                      ? { background: b.cc.bg, borderColor: b.cc.bd, color: b.cc.ink }
                      : {}
                    return (
                      <div
                        key={idx}
                        className={`mpd-chip ${blkClass(b)}${dragPDIdx === idx ? ' dragging' : ''}${resizingIdx === idx ? ' resizing' : ''}${b.anchor ? ' anchored' : ''}`}
                        style={customStyle}
                        draggable
                        onDragStart={e => { e.stopPropagation(); setDragPDIdx(idx) }}
                        onDragEnd={() => { setDragPDIdx(null); setDragOverHour(null) }}
                        onClick={e => { e.stopPropagation(); if (dragPDIdx === null && resizingIdx === null) openBlockModalEditPD(idx) }}
                      >
                        <span className="mpd-drag">⠿</span>
                        <span
                          className={`mpd-anchor${b.anchor ? ' on' : ''}`}
                          title={b.anchor ? 'anchored — click to unlock' : 'click to anchor this block'}
                          onClick={e => {
                            e.stopPropagation()
                            const pd = [...perfectDay]
                            pd[idx] = { ...pd[idx], anchor: !b.anchor }
                            setPerfectDay(pd)
                          }}
                        >🔒</span>
                        {b.name}
                        <span className="mpd-ct">{fmt(b.start, cfg.tf)}–{fmt(b.end, cfg.tf)}</span>
                        <span
                          className="mpd-cx"
                          onClick={e => { e.stopPropagation(); rmPDB(idx) }}
                        >
                          ×
                        </span>
                        <span
                          className="mpd-resize-h mpd-resize-top"
                          title="drag to resize top"
                          onMouseDown={e => {
                            e.stopPropagation()
                            e.preventDefault()
                            resizeRef.current = { idx, startY: e.clientY, origEndM: toM(b.end), origStartM: toM(b.start), mode: 'top' }
                            setResizingIdx(idx)
                          }}
                        >↑</span>
                        <span
                          className="mpd-resize-h"
                          title="drag to resize bottom"
                          onMouseDown={e => {
                            e.stopPropagation()
                            e.preventDefault()
                            resizeRef.current = { idx, startY: e.clientY, origEndM: toM(b.end), origStartM: toM(b.start), mode: 'bottom' }
                            setResizingIdx(idx)
                          }}
                        >↕</span>
                      </div>
                    )
                    void relIdx
                  })}
                  <div
                    className="mpd-add"
                    onClick={e => { e.stopPropagation(); openBlockModalForPD(hourM) }}
                  >
                    <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
                      <path d="M5 2v6M2 5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    add
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Right panel */}
        <div id="mpd-r">
          {/* Adherence card */}
          {adherenceData && (
            <div className="mpd-adherence-card">
              <div className="mpd-adh-header">
                <div>
                  <div className="mpd-adh-ttl">blueprint adherence</div>
                  <div className="mpd-adh-sub">last 7 days — how closely you followed your blueprint</div>
                </div>
                {adherenceData.avg !== null && (
                  <div className="mpd-adh-score">
                    <div className="mpd-adh-score-num">{adherenceData.avg}%</div>
                    <div className="mpd-adh-score-lbl">avg match</div>
                  </div>
                )}
              </div>
              {adherenceData.days.every(d => d.score === null) ? (
                <div className="mpd-adh-empty">apply your blueprint to a day to start tracking how well you stick to it</div>
              ) : (
                <div className="mpd-adh-bars">
                  {adherenceData.days.map((d, i) => (
                    <div key={i} className="mpd-adh-col">
                      <div className="mpd-adh-val">{d.score !== null ? `${d.score}%` : ''}</div>
                      <div className="mpd-adh-track">
                        <div
                          className="mpd-adh-fill"
                          style={{ height: d.score !== null ? `${Math.max(d.score, 4)}%` : '0%' }}
                        />
                      </div>
                      <div className="mpd-adh-lbl">{d.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI input */}
          <div id="mpd-ai">
            <div className="ai-ttl-row">
              <div className="ai-ttl"><span>✦</span> AI day designer</div>
            </div>

            {/* Personalized card — shown when profile exists */}
            {personalizedPrompt && (
              <div className="ai-personal-card">
                <div className="ai-personal-hdr">
                  <span>✦</span> personalized for you
                </div>
                <p className="ai-personal-body">{personalizedPrompt}</p>
                <button
                  className="ai-personal-use"
                  onClick={() => { setAiInput(personalizedPrompt); setTimeout(() => aiInputRef.current?.focus(), 50) }}
                >edit & refine</button>
              </div>
            )}

            {!personalizedPrompt && perfectDay.length === 0 && (
              <div className="ai-ready-hint">
                ✦ your AI is ready — describe your ideal day and hit the button below
              </div>
            )}
            <textarea
              id="ai-inp"
              ref={aiInputRef}
              placeholder={personalizedPrompt ? 'refine the description above, or write your own…' : 'describe your ideal day, goals, and lifestyle…'}
              value={aiInput}
              onChange={e => setAiInput(e.target.value)}
            />
            <button id="ai-go" disabled={aiLoading} onClick={runAI}>
              {aiLoading
                ? <><div className="ald" /><div className="ald" /><div className="ald" /><span>designing…</span></>
                : '✦ design my perfect day'
              }
            </button>
          </div>

          {/* Stats */}
          <div id="mpd-stats">
            <div className="st-ttl">blueprint stats</div>
            <div className="st-tot">{totalH}h{totalMin ? ` ${totalMin}m` : ''}</div>
            <div className="st-sub">total planned time</div>
            {Object.entries(by)
              .filter(([, v]) => v > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([type, mins]) => {
                const pct = total > 0 ? Math.round((mins / total) * 100) : 0
                const rh = Math.floor(mins / 60)
                const rm = mins % 60
                return (
                  <div key={type} className="st-row">
                    <div className="st-rh">
                      <div className="st-dot" style={{ background: TYPE_COLORS[type] || 'var(--bd2)' }} />
                      <span className="st-nm">{type}</span>
                      <span className="st-vl">{rh}h{rm ? ` ${rm}m` : ''} · {pct}%</span>
                    </div>
                    <div className="st-bar">
                      <div className="st-fill" style={{ width: `${pct}%`, background: TYPE_COLORS[type] || 'var(--bd2)' }} />
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      </div>
      {wizardOpen && <PDWizardModal onClose={() => setWizardOpen(false)} />}
    </div>
  )
}
