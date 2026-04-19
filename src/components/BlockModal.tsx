import { useEffect, useRef, useState, useCallback } from 'react'
import { useStore } from '../store'
import { CCOLS } from '../constants'
import { toM, getFreeSlots } from '../utils'
import type { Block, Goal } from '../types'

// ── Smart type prediction ──────────────────────────────────────────────────
type Prediction = { type: string; customName?: string; label: string }

const TYPE_PATTERNS: Array<{ words: string[]; type: string }> = [
  { words: ['hang out','hangout','hang with','catching up','catch up','lunch with','dinner with','coffee with','drinks with','date with','meet with','chat with','birthday','party','game night','family time','friends','social','picnic','bbq','brunch with'], type: 'free' },
  { words: ['deep work','focus session','focus time','focused work','writing session','coding session','design session','work on','work session','build','implement','debug','ship','develop','programming','drafting','producing'], type: 'focus' },
  { words: ['standup','stand-up','all-hands','meeting','1:1','one on one','sync','client call','team call','interview','review session','check-in','admin','commute','appointment','errands','planning session'], type: 'routine' },
  { words: ['study','studying','learning','lesson','flashcards','homework','revision','revising','reading session','research session','tutorial','online course','workshop','practice session','training session'], type: 'study' },
  { words: ['gym','workout','run','running','yoga','pilates','walk','hike','hiking','swim','swimming','exercise','cycling','weights','strength training','cardio','stretching','sport','tennis','basketball','football'], type: 'free' },
  { words: ['rest','relax','break','nap','meditation','meditate','journal','journaling','wind down','self care','personal time','downtime','reading','read book'], type: 'free' },
]

function predictType(
  name: string,
  customLabels: string[],
  recentBlocks: Array<{ name: string; type: string; customName?: string | null }>,
): Prediction | null {
  if (!name.trim() || name.length < 3) return null
  const n = name.toLowerCase().trim()

  const counts: Record<string, number> = {}
  recentBlocks.forEach(b => {
    if (b.name.toLowerCase() === n) {
      const key = b.type + (b.customName ? ':' + b.customName : '')
      counts[key] = (counts[key] || 0) + 1
    }
  })
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  if (top) {
    const [typeKey, freq] = top
    if (freq >= 1) {
      const [type, customName] = typeKey.split(':')
      return { type, customName, label: customName || type }
    }
  }

  for (const { words, type } of TYPE_PATTERNS) {
    if (words.some(w => n.includes(w))) return { type, label: type }
  }

  const lbl = customLabels.find(l => {
    const ll = l.toLowerCase()
    return n.includes(ll) || ll.split(' ').some(w => w.length > 3 && n.includes(w))
  })
  if (lbl) return { type: 'custom', customName: lbl, label: lbl }

  return null
}

// ── Smart goal prediction ──────────────────────────────────────────────────
function predictGoal(
  name: string,
  recentBlocks: Array<{ name: string; goalId?: number | null }>,
  goals: Goal[],
): { id: number; name: string; color: string } | null {
  if (!name.trim() || goals.length === 0) return null
  const n = name.toLowerCase().trim()
  const counts: Record<number, number> = {}
  recentBlocks.forEach(b => {
    if (b.name.toLowerCase() === n && b.goalId) {
      counts[b.goalId] = (counts[b.goalId] || 0) + 1
    }
  })
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  if (!top) return null
  const gid = Number(top[0])
  const g = goals.find(x => x.id === gid)
  return g ? { id: g.id, name: g.name, color: g.color } : null
}

type BType = Block['type'] | 'custom'

const ALL_BUILTIN = [
  { key: 'focus' as const,   dot: 'tf' },
  { key: 'routine' as const, dot: 'tr' },
  { key: 'study' as const,   dot: 'ts' },
  { key: 'free' as const,    dot: 'tl' },
]
const TYPE_ACTIVE: Record<string, string> = {
  focus: 'af', routine: 'ar', study: 'as', free: 'al',
}
const TYPE_DOT_MAP: Record<string, string> = {
  focus: 'tf', routine: 'tr', study: 'ts', free: 'tl', gcal: 'tg2',
}
const DARK_THRESHOLD = ['Onyx', 'Plum', 'Forest', 'Espresso', 'Aubergine']

type PickerTab = 'type' | 'repeat' | 'goal' | 'color' | 'note' | null

export default function BlockModal() {
  const {
    blockModal, closeBlockModal, saveBlockModal,
    customLabels, customLabelColors, addCustomLabel, removeCustomLabel, reorderCustomLabels,
    blocks, cfg, setTypeColorOverride, hideBuiltinCustom, setHideBuiltinCustom,
    hiddenBuiltinTypes, hideBuiltinType, showBuiltinType,
    goals, habits,
  } = useStore()
  const { isNew, isForPD, block, initStart, initEnd } = blockModal

  const nameRef = useRef<HTMLInputElement>(null)
  const newLabelRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(block?.name || '')
  const [start, setStart] = useState(initStart)
  const [end, setEnd] = useState(initEnd)
  const [type, setType] = useState<BType>(() => {
    if (!block) return 'focus'
    if (block.cc) return 'custom'
    return (block.type as BType) || 'focus'
  })
  const [ccIdx, setCcIdx] = useState(0)
  const [customName, setCustomName] = useState(block?.customName || '')
  const [repeat, setRepeat] = useState<Block['repeat']>(block?.repeat || 'none')
  const [goalId, setGoalId] = useState<number | null>(block?.goalId ?? null)
  const [note, setNote] = useState(block?.note || '')
  const [showNewLabelInput, setShowNewLabelInput] = useState(false)
  const [newLabelVal, setNewLabelVal] = useState('')
  const [suggestion, setSuggestion] = useState<Prediction | null>(null)
  const [goalSuggestion, setGoalSuggestion] = useState<{ id: number; name: string; color: string } | null>(null)
  const [openPicker, setOpenPicker] = useState<PickerTab>(null)
  const [lblUnlocked, setLblUnlocked] = useState(false)
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragFromIdx  = useRef<number | null>(null)
  const dragOverEl   = useRef<HTMLElement | null>(null)

  const togglePicker = (p: PickerTab) => setOpenPicker(prev => prev === p ? null : p)

  const onLblDragStart = useCallback((e: React.DragEvent<HTMLElement>, i: number) => {
    dragFromIdx.current = i
  }, [])
  const onLblDragOver = useCallback((e: React.DragEvent<HTMLElement>, i: number) => {
    e.preventDefault()
    const el = e.currentTarget
    if (dragOverEl.current && dragOverEl.current !== el) dragOverEl.current.classList.remove('drag-over-lbl')
    el.classList.add('drag-over-lbl')
    dragOverEl.current = el
  }, [])
  const onLblDrop = useCallback((e: React.DragEvent<HTMLElement>, i: number) => {
    e.currentTarget.classList.remove('drag-over-lbl')
    dragOverEl.current = null
    if (dragFromIdx.current !== null && dragFromIdx.current !== i) reorderCustomLabels(dragFromIdx.current, i)
    dragFromIdx.current = null
  }, [reorderCustomLabels])
  const onLblDragEnd = useCallback(() => {
    if (dragOverEl.current) { dragOverEl.current.classList.remove('drag-over-lbl'); dragOverEl.current = null }
    dragFromIdx.current = null
  }, [])

  const dateBlocks = isNew && blockModal.date
    ? blocks.filter(b => b.date === blockModal.date && (!block || b.id !== block.id))
    : []
  const freeSlots = isNew && blockModal.date
    ? getFreeSlots(dateBlocks, cfg.ds, cfg.de).slice(0, 3)
    : []

  useEffect(() => {
    if (block?.cc) {
      const idx = CCOLS.findIndex(c => c.bg === block.cc!.bg)
      if (idx >= 0) setCcIdx(idx)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isNew) nameRef.current?.focus()
      else nameRef.current?.select()
    }, 150)
    return () => clearTimeout(timer)
  }, [isNew])

  useEffect(() => {
    if (showNewLabelInput) setTimeout(() => newLabelRef.current?.focus(), 50)
  }, [showNewLabelInput])

  const title = isForPD
    ? (isNew ? 'add to blueprint' : 'edit blueprint block')
    : (isNew ? 'new block' : 'edit block')

  const pickSavedLabel = (lbl: string) => {
    setType('custom')
    setCustomName(lbl)
    const savedIdx = customLabelColors[lbl]
    if (savedIdx !== undefined) setCcIdx(savedIdx)
  }

  const commitNewLabel = () => {
    const lbl = newLabelVal.trim()
    if (lbl) { addCustomLabel(lbl, ccIdx); pickSavedLabel(lbl) }
    setShowNewLabelInput(false)
    setNewLabelVal('')
  }

  const applySuggestion = useCallback(() => {
    if (!suggestion) return
    setType(suggestion.type as BType)
    if (suggestion.customName) {
      setCustomName(suggestion.customName)
      const savedIdx = customLabelColors[suggestion.customName]
      if (savedIdx !== undefined) setCcIdx(savedIdx)
    } else {
      setCustomName('')
    }
    setSuggestion(null)
  }, [suggestion, customLabelColors])

  const handleSave = useCallback(() => {
    if (!name.trim()) { nameRef.current?.focus(); return }
    if (type === 'custom' && customName.trim()) addCustomLabel(customName.trim(), ccIdx)
    const effectiveCcIdx = type === 'custom' ? ccIdx : null
    saveBlockModal({
      name: name.trim(), start, end,
      type: type === 'custom' ? 'custom' : type,
      ccIdx: effectiveCcIdx,
      customName: type === 'custom' ? customName || null : null,
      repeat, goalId,
      note: note.trim() || null,
    })
  }, [name, type, customName, ccIdx, start, end, repeat, goalId, note, nameRef, addCustomLabel, saveBlockModal])

  const handleEnter = useCallback(() => {
    if (suggestion) { applySuggestion(); return }
    handleSave()
  }, [suggestion, applySuggestion, handleSave])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'TEXTAREA' || tag === 'BUTTON') return
      e.preventDefault()
      handleEnter()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleEnter])

  const isBuiltin = type !== 'custom' && ALL_BUILTIN.some(b => b.key === type)

  // Current type display
  const currentDot = type === 'custom' ? null : TYPE_DOT_MAP[type]
  const typeLabel = type === 'custom' ? (customName || 'custom') : type
  const repeatLabel = repeat === 'none' ? 'repeat' : repeat === 'weekdays' ? 'M–F' : repeat
  const goalLabel = goalId ? (goals.find(g => g.id === goalId)?.name || 'goal') : 'goal'

  return (
    <div className="mb on" id="bm"
      onClick={e => { if (e.target === e.currentTarget) closeBlockModal() }}
    >
      <div className="mbox">
        <div className="mhdr">
          <span className="mttl">{title}</span>
          <button className="mx" onClick={closeBlockModal}>×</button>
        </div>

        {/* Name */}
        <input
          ref={nameRef}
          className="minp"
          placeholder="block name"
          value={name}
          onChange={e => {
            const val = e.target.value
            setName(val)
            setSuggestion(null)
            setGoalSuggestion(null)
            if (suggestTimer.current) clearTimeout(suggestTimer.current)
            suggestTimer.current = setTimeout(() => {
              const pred = predictType(val, customLabels, blocks)
              if (pred && !(pred.type === type && pred.customName === customName)) setSuggestion(pred)
              if (!goalId) {
                const gPred = predictGoal(val, blocks, goals)
                if (gPred) setGoalSuggestion(gPred)
              }
            }, 420)
          }}
          onKeyDown={e => { if (e.key === 'Enter') handleEnter() }}
        />
        {suggestion && (
          <button className="blk-type-suggest" onClick={applySuggestion}>
            ✦ looks like <strong>{suggestion.label}</strong> — apply?
          </button>
        )}

        {/* Time row */}
        <div className="mrow mtrow">
          <input className="minp" type="time" value={start} onChange={e => setStart(e.target.value)} />
          <span className="mtrow-arr">→</span>
          <input className="minp" type="time" value={end} onChange={e => setEnd(e.target.value)} />
        </div>

        {/* ── Meta pills row ── */}
        <p className="mbm-hint">pick a type, set a goal, or add a note</p>
        <div className="mbm-row">
          {/* Type pill — label always "type", dot shows current selection */}
          <button
            className={`mbm-pill mbm-type-pill${openPicker === 'type' ? ' open' : ''}`}
            onClick={() => togglePicker('type')}
          >
            {currentDot
              ? <span className={`mbm-dot tc ${currentDot}`} />
              : <span className="mbm-dot" style={{ background: CCOLS[ccIdx].bg, border: `1px solid ${CCOLS[ccIdx].bd}` }} />
            }
            type
            <span className="mbm-chev">›</span>
          </button>

          {/* Goal pill */}
          {!isForPD && goals.length > 0 && (
            <button
              className={`mbm-pill${openPicker === 'goal' ? ' open' : ''}${goalId ? ' set' : ''}`}
              style={goalId ? { borderColor: goals.find(g => g.id === goalId)?.color, color: goals.find(g => g.id === goalId)?.color } : {}}
              onClick={() => togglePicker('goal')}
            >
              ◎ {goalLabel}
              <span className="mbm-chev">›</span>
            </button>
          )}

          {/* Color pill */}
          <button
            className={`mbm-pill mbm-color-pill${openPicker === 'color' ? ' open' : ''}`}
            onClick={() => togglePicker('color')}
          >
            <span className="mbm-cswatch" style={{ background: CCOLS[ccIdx].bg, borderColor: CCOLS[ccIdx].bd }} />
            color
            <span className="mbm-chev">›</span>
          </button>

          {/* Note pill */}
          {!isForPD && (
            <button
              className={`mbm-pill${openPicker === 'note' ? ' open' : ''}${note.trim() ? ' set' : ''}`}
              onClick={() => togglePicker('note')}
            >
              📝 {note.trim() ? 'note ✓' : 'note'}
              <span className="mbm-chev">›</span>
            </button>
          )}
        </div>

        {/* ── Expanded picker panel ── */}
        {openPicker && (
          <div className="mbm-panel">

            {/* TYPE PANEL */}
            {openPicker === 'type' && (
              <div className="mtyps">
                {ALL_BUILTIN.filter(({ key }) => !(hiddenBuiltinTypes || []).includes(key as string)).map(({ key, dot }) => (
                  <div key={key} className="mtyp-preset-wrap">
                    <button
                      className={`mtyp${type === key ? ` ${TYPE_ACTIVE[key]}` : ''}`}
                      onClick={() => { setType(key); setCustomName('') }}
                    >
                      <div className={`tc ${dot}`} style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0 }} />
                      {key}
                    </button>
                    <button className="mtyp-hide-btn" title={`hide ${key}`} onClick={e => {
                      e.stopPropagation()
                      hideBuiltinType(key as string)
                      if (type === key) setType(customLabels.length > 0 ? 'custom' : 'focus' as BType)
                    }}>×</button>
                  </div>
                ))}

                {ALL_BUILTIN.some(({ key }) => !(hiddenBuiltinTypes || []).includes(key as string)) && customLabels.length > 0 && (
                  <div className="mtyps-div" />
                )}

                {customLabels.map((lbl, i) => {
                  const savedColor = customLabelColors[lbl] !== undefined ? CCOLS[customLabelColors[lbl]] : null
                  const isActive = type === 'custom' && customName === lbl
                  return (
                    <div
                      key={lbl}
                      className={`mtyp saved-lbl-btn${isActive ? ' ad' : ''}${lblUnlocked ? ' unlocked' : ''}`}
                      style={savedColor && isActive ? { background: savedColor.bg, color: savedColor.ink } : {}}
                      draggable={lblUnlocked}
                      onDragStart={lblUnlocked ? e => onLblDragStart(e, i) : undefined}
                      onDragOver={lblUnlocked ? e => onLblDragOver(e, i) : undefined}
                      onDrop={lblUnlocked ? e => onLblDrop(e, i) : undefined}
                      onDragEnd={lblUnlocked ? onLblDragEnd : undefined}
                      onClick={() => { if (!lblUnlocked) pickSavedLabel(lbl) }}
                    >
                      {lblUnlocked && (
                        <span className="slb-drag" title="drag to reorder">
                          <svg width="8" height="12" viewBox="0 0 8 12" fill="none">
                            <circle cx="2" cy="2" r="1.2" fill="currentColor" opacity=".5"/>
                            <circle cx="6" cy="2" r="1.2" fill="currentColor" opacity=".5"/>
                            <circle cx="2" cy="6" r="1.2" fill="currentColor" opacity=".5"/>
                            <circle cx="6" cy="6" r="1.2" fill="currentColor" opacity=".5"/>
                            <circle cx="2" cy="10" r="1.2" fill="currentColor" opacity=".5"/>
                            <circle cx="6" cy="10" r="1.2" fill="currentColor" opacity=".5"/>
                          </svg>
                        </span>
                      )}
                      <span className="slb-dot" style={{
                        background: savedColor ? savedColor.bg : 'var(--bd2)',
                        border: `1px solid ${savedColor ? savedColor.bd : 'var(--bd)'}`,
                      }} />
                      {lbl}
                      {lblUnlocked && (
                        <button className="slb-rm" onClick={e => {
                          e.stopPropagation()
                          removeCustomLabel(lbl)
                          if (customName === lbl) { setCustomName(''); setType('custom') }
                        }} title="remove label">×</button>
                      )}
                    </div>
                  )
                })}

                <button className="mtyp new-lbl-btn" onClick={() => setShowNewLabelInput(v => !v)} title="add a new custom label">
                  {showNewLabelInput ? '×' : '+ new'}
                </button>
                {customLabels.length > 0 && (
                  <button className={`mtyp lbl-lock-btn${lblUnlocked ? ' unlocked' : ''}`}
                    onClick={() => setLblUnlocked(v => !v)}
                    title={lblUnlocked ? 'lock label order' : 'reorder / remove labels'}
                  >{lblUnlocked ? '🔓 done' : '⠿'}</button>
                )}
                {(hiddenBuiltinTypes || []).length > 0 && (
                  <button className="mtyp-restore" onClick={() => (hiddenBuiltinTypes || []).forEach(t => showBuiltinType(t))}>
                    restore {(hiddenBuiltinTypes || []).join(', ')}
                  </button>
                )}

                {/* New label input */}
                {showNewLabelInput && (
                  <div className="label-inp-row" style={{ marginTop: 8, width: '100%' }}>
                    <input
                      ref={newLabelRef}
                      placeholder="label name…"
                      value={newLabelVal}
                      onChange={e => setNewLabelVal(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitNewLabel()
                        if (e.key === 'Escape') { setShowNewLabelInput(false); setNewLabelVal('') }
                      }}
                    />
                    {newLabelVal.trim() && (
                      <button className="label-save-btn" onClick={commitNewLabel}>save</button>
                    )}
                  </div>
                )}

                {/* Custom label name input when custom selected with no name */}
                {type === 'custom' && !customName && !showNewLabelInput && (
                  <div className="label-inp-row" style={{ marginTop: 8, width: '100%' }}>
                    <input
                      placeholder="label name (e.g. meditation, meeting…)"
                      value={customName}
                      onChange={e => setCustomName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && customName.trim()) addCustomLabel(customName.trim(), ccIdx)
                      }}
                    />
                    {customName.trim() && (
                      <button className="label-save-btn" onClick={() => addCustomLabel(customName.trim(), ccIdx)}>save</button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* REPEAT PANEL */}
            {openPicker === 'repeat' && (
              <div className="mtyps">
                {(['none', 'daily', 'weekdays', 'weekly'] as const).map(r => (
                  <button key={r} className={`mtyp${repeat === r ? ' af' : ''}`} onClick={() => setRepeat(r)}>
                    {r === 'weekdays' ? 'M–F' : r}
                  </button>
                ))}
              </div>
            )}

            {/* GOAL PANEL */}
            {openPicker === 'goal' && (
              <>
                <div className="mtyps goal-chips">
                  <button className={`mtyp${!goalId ? ' af' : ''}`} onClick={() => { setGoalId(null); setGoalSuggestion(null) }}>none</button>
                  {goals.map(g => (
                    <button
                      key={g.id}
                      className={`mtyp goal-chip${goalId === g.id ? ' af' : ''}`}
                      style={goalId === g.id ? { background: g.color, borderColor: g.color, color: '#fff' } : { borderColor: g.color, color: g.color }}
                      onClick={() => { setGoalId(goalId === g.id ? null : g.id); setGoalSuggestion(null) }}
                    >{g.name}</button>
                  ))}
                </div>
                {goalSuggestion && !goalId && (
                  <button className="blk-goal-suggest" onClick={() => { setGoalId(goalSuggestion.id); setGoalSuggestion(null) }}>
                    ✦ usually tagged as <strong style={{ color: goalSuggestion.color }}>{goalSuggestion.name}</strong> — apply?
                  </button>
                )}
              </>
            )}

            {/* COLOR PANEL */}
            {openPicker === 'color' && (
              <>
                <div id="type-color-row">
                  {CCOLS.map((c, i) => (
                    <div
                      key={i}
                      className={`tcsw${ccIdx === i ? ' on' : ''}${DARK_THRESHOLD.includes(c.n) ? ' dark-swatch' : ''}`}
                      style={{ background: c.bg, borderColor: c.bd }}
                      title={c.n}
                      onClick={() => setCcIdx(i)}
                    />
                  ))}
                </div>
                <div className="tcsw-sel-name" style={{ background: CCOLS[ccIdx].bg, borderColor: CCOLS[ccIdx].bd, color: CCOLS[ccIdx].ink }}>
                  {CCOLS[ccIdx].n}
                </div>
                {isBuiltin && (
                  <button className="set-default-btn" onClick={() => {
                    setTypeColorOverride(type as string, ccIdx)
                    useStore.getState().showToast(`default color for ${type} updated`)
                  }}>set as default for {type}</button>
                )}
              </>
            )}

            {/* NOTE PANEL */}
            {openPicker === 'note' && (
              <textarea
                className="minp block-note-inp"
                placeholder="reflections, blockers, what happened…"
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
                autoFocus
              />
            )}
          </div>
        )}

        {/* Tracked time row */}
        {!isNew && !isForPD && block && (block.totalTracked || 0) > 0 && (
          <div className="blk-tracked-row">
            <span className="btr-lbl">tracked</span>
            <span className="btr-val">{Math.round((block.totalTracked! / 60))}m</span>
            <span className="btr-sep">vs</span>
            <span className="btr-planned">{toM(block.end) - toM(block.start)}m planned</span>
            {(block.totalTracked! / 60) < (toM(block.end) - toM(block.start)) * 0.8 && <span className="btr-hint">came up short</span>}
            {(block.totalTracked! / 60) > (toM(block.end) - toM(block.start)) * 1.1 && <span className="btr-hint">ran over</span>}
          </div>
        )}

        {/* Footer */}
        <div className="macts">
          <div className="msave-wrap">
            <button className="mact-btn mcanc" onClick={closeBlockModal}>cancel</button>
            <span className="msave-hint"><kbd className="msave-kbd">esc</kbd></span>
          </div>
          <div className="msave-wrap" style={{ marginLeft: 'auto' }}>
            <button className="mact-btn msave" onClick={handleSave}>save</button>
            <span className="msave-hint"><kbd className="msave-kbd">enter</kbd></span>
          </div>
        </div>
      </div>
    </div>
  )
}
