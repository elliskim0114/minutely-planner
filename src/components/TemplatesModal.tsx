import { useState } from 'react'
import { useStore } from '../store'
import { todayStr, toM, weekStart, dateStr } from '../utils'

export default function TemplatesModal({ onClose }: { onClose: () => void }) {
  const { templates, deleteTemplate, applyTemplate, saveAsTemplate, selDate, blocks,
    weeklyTemplates, saveAsWeeklyTemplate, applyWeeklyTemplate, deleteWeeklyTemplate } = useStore()
  const [applyDate, setApplyDate] = useState(selDate || todayStr())
  const [startTime, setStartTime] = useState('09:00')
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'day' | 'week'>('day')
  const [weekSaveName, setWeekSaveName] = useState('')
  const [savingWeek, setSavingWeek] = useState(false)
  const [applyWeekStart, setApplyWeekStart] = useState(() => {
    const ws = weekStart(0)
    return dateStr(ws, 0)
  })

  const handleApply = (id: number) => {
    applyTemplate(id, applyDate, toM(startTime))
    onClose()
  }

  const todayBlocks = blocks.filter(b => b.date === (selDate || todayStr()))

  const handleSaveToday = () => {
    if (!saveName.trim()) return
    saveAsTemplate(saveName.trim(), todayBlocks.map(b => ({
      name: b.name,
      type: b.type,
      duration: toM(b.end) - toM(b.start),
      cc: b.cc ?? null,
      customName: b.customName ?? null,
    })))
    setSaveName('')
    setSaving(false)
    useStore.getState().showToast(`routine "${saveName.trim()}" saved`)
  }

  // Current week blocks (Mon–Sun based on weekStart(0))
  const thisWeekStart = weekStart(0)
  const thisWeekDates = Array.from({ length: 7 }, (_, i) => dateStr(thisWeekStart, i))
  const thisWeekBlocks = blocks.filter(b => thisWeekDates.includes(b.date))

  const handleSaveWeek = () => {
    if (!weekSaveName.trim()) return
    saveAsWeeklyTemplate(weekSaveName.trim(), thisWeekBlocks, thisWeekDates[0])
    setWeekSaveName('')
    setSavingWeek(false)
  }

  const handleApplyWeek = (id: number) => {
    applyWeeklyTemplate(id, applyWeekStart)
    onClose()
  }

  return (
    <div className="tmpl-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tmpl-box">
        <div className="tmpl-hdr">
          <div className="tmpl-title">routines</div>
          <button className="tmpl-close" onClick={onClose}>×</button>
        </div>

        <div className="tmpl-tabs">
          <button className={`tmpl-tab${tab === 'day' ? ' on' : ''}`} onClick={() => setTab('day')}>block routines</button>
          <button className={`tmpl-tab${tab === 'week' ? ' on' : ''}`} onClick={() => setTab('week')}>weekly routines</button>
        </div>

        {/* ── DAY TAB ── */}
        {tab === 'day' && (
          <>
            <div className="tmpl-sub">save block sequences as reusable routines — drop them onto any day at any start time</div>
            {todayBlocks.length > 0 && (
              <div className="tmpl-save-row">
                {saving ? (
                  <>
                    <input
                      className="tmpl-save-inp"
                      placeholder="routine name…"
                      value={saveName}
                      onChange={e => setSaveName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveToday(); if (e.key === 'Escape') setSaving(false) }}
                      autoFocus
                    />
                    <button className="tmpl-save-btn" onClick={handleSaveToday}>save</button>
                    <button className="tmpl-save-cancel" onClick={() => setSaving(false)}>cancel</button>
                  </>
                ) : (
                  <button className="tmpl-save-today" onClick={() => setSaving(true)}>
                    + save today as routine
                  </button>
                )}
              </div>
            )}

            <div className="tmpl-apply-row">
              <input className="tmpl-inp" type="date" value={applyDate} onChange={e => setApplyDate(e.target.value)} />
              <input className="tmpl-inp" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>

            {templates.length === 0 ? (
              <div className="tmpl-empty">no routines yet — use "+ routine" when editing a block, or save today's schedule above</div>
            ) : (
              <div className="tmpl-list">
                {templates.map(t => (
                  <div key={t.id} className="tmpl-item">
                    <div className="tmpl-info">
                      <div className="tmpl-name">{t.name}</div>
                      <div className="tmpl-meta">{t.blocks.length} block{t.blocks.length !== 1 ? 's' : ''} · {Math.round(t.blocks.reduce((s, b) => s + b.duration, 0) / 60 * 10) / 10}h total</div>
                      <div className="tmpl-block-list">
                        {t.blocks.slice(0, 3).map((b, i) => <span key={i} className="tmpl-blk-chip">{b.name}</span>)}
                        {t.blocks.length > 3 && <span className="tmpl-blk-chip tmpl-more">+{t.blocks.length - 3} more</span>}
                      </div>
                    </div>
                    <div className="tmpl-acts">
                      <button className="tmpl-apply-btn" onClick={() => handleApply(t.id)}>apply</button>
                      <button className="tmpl-del-btn" onClick={() => deleteTemplate(t.id)}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── WEEK TAB ── */}
        {tab === 'week' && (
          <>
            {thisWeekBlocks.length > 0 && (
              <div className="tmpl-save-row">
                {savingWeek ? (
                  <>
                    <input
                      className="tmpl-save-inp"
                      placeholder="weekly routine name…"
                      value={weekSaveName}
                      onChange={e => setWeekSaveName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveWeek(); if (e.key === 'Escape') setSavingWeek(false) }}
                      autoFocus
                    />
                    <button className="tmpl-save-btn" onClick={handleSaveWeek}>save</button>
                    <button className="tmpl-save-cancel" onClick={() => setSavingWeek(false)}>cancel</button>
                  </>
                ) : (
                  <button className="tmpl-save-today" onClick={() => setSavingWeek(true)}>
                    + save this week as routine
                  </button>
                )}
              </div>
            )}

            <div className="tmpl-apply-row">
              <span className="tmpl-apply-lbl">apply to week starting</span>
              <input className="tmpl-inp" type="date" value={applyWeekStart} onChange={e => setApplyWeekStart(e.target.value)} />
            </div>

            {weeklyTemplates.length === 0 ? (
              <div className="tmpl-empty">no weekly routines yet — plan a full week and save it here</div>
            ) : (
              <div className="tmpl-list">
                {weeklyTemplates.map(t => {
                  const days = [...new Set(t.blocks.map(b => b.weekday))].length
                  const totalMins = t.blocks.reduce((s, b) => s + b.duration, 0)
                  return (
                    <div key={t.id} className="tmpl-item">
                      <div className="tmpl-info">
                        <div className="tmpl-name">{t.name}</div>
                        <div className="tmpl-meta">{t.blocks.length} blocks · {days} day{days !== 1 ? 's' : ''} · {Math.round(totalMins / 60 * 10) / 10}h total</div>
                        <div className="tmpl-block-list">
                          {t.blocks.slice(0, 3).map((b, i) => <span key={i} className="tmpl-blk-chip">{b.name}</span>)}
                          {t.blocks.length > 3 && <span className="tmpl-blk-chip tmpl-more">+{t.blocks.length - 3} more</span>}
                        </div>
                      </div>
                      <div className="tmpl-acts">
                        <button className="tmpl-apply-btn" onClick={() => handleApplyWeek(t.id)}>apply</button>
                        <button className="tmpl-del-btn" onClick={() => deleteWeeklyTemplate(t.id)}>×</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
