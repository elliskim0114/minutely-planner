import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { useStore } from '../store'
import { todayStr, toM } from '../utils'

const TYPE_BG: Record<string, string> = {
  focus: '#FFE8E0', routine: '#E6F4E8', study: '#EEF0FF', free: '#FFF8E8', gcal: '#F0EDE8', custom: '#F5F0FF',
}
const TYPE_BORDER: Record<string, string> = {
  focus: '#FFB8A0', routine: '#95CFA0', study: '#A0AAFF', free: '#F0D080', gcal: '#C8C0B0', custom: '#C0A8FF',
}
const TYPE_INK: Record<string, string> = {
  focus: '#8B2200', routine: '#1A4A22', study: '#1A2088', free: '#5A4000', gcal: '#3A3328', custom: '#3A1A88',
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function getDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

interface Props { onClose: () => void }

export default function ExportModal({ onClose }: Props) {
  const { blocks, cfg } = useStore()
  const cardRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [exportMode, setExportMode] = useState<'week' | 'day'>('week')

  const today = new Date()
  const td = todayStr()

  // Week dates (7 days starting from today's Monday or Sunday)
  const weekDates: { date: string; label: string; shortLabel: string }[] = []
  const startOffset = cfg.ws === 1 ? 1 : 0  // Mon or Sun
  const todayDow = today.getDay()
  const daysFromStart = (todayDow - startOffset + 7) % 7
  for (let i = 0; i < 7; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() - daysFromStart + i)
    const ds = getDateStr(d)
    weekDates.push({
      date: ds,
      label: DAYS[d.getDay()],
      shortLabel: DAYS[d.getDay()],
    })
  }

  const weekBlocks = blocks.filter(b => weekDates.some(d => d.date === b.date))
  const todayBlocks = blocks.filter(b => b.date === td).sort((a, b) => toM(a.start) - toM(b.start))
  const dayStart = toM(cfg.ds)
  const dayEnd = toM(cfg.de)
  const daySpan = dayEnd - dayStart

  const download = async () => {
    if (!cardRef.current) return
    setDownloading(true)
    try {
      const dataUrl = await toPng(cardRef.current, { cacheBust: true, pixelRatio: 2 })
      const link = document.createElement('a')
      link.download = `minutely-${exportMode}-${td}.png`
      link.href = dataUrl
      link.click()
    } finally {
      setDownloading(false)
    }
  }

  const copyToClipboard = async () => {
    if (!cardRef.current) return
    setDownloading(true)
    try {
      const dataUrl = await toPng(cardRef.current, { cacheBust: true, pixelRatio: 2 })
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      useStore.getState().showToast('copy failed — try download instead')
    } finally {
      setDownloading(false)
    }
  }

  const blockHeight = (b: { start: string; end: string }) => {
    const mins = toM(b.end) - toM(b.start)
    return Math.max(24, (mins / daySpan) * 560)
  }
  const blockTop = (b: { start: string }) => ((toM(b.start) - dayStart) / daySpan) * 560

  return (
    <div className="exp-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="exp-modal">
        <div className="exp-hdr">
          <div className="exp-title">📸 export schedule</div>
          <button className="exp-close" onClick={onClose}>×</button>
        </div>

        {/* Mode toggle */}
        <div className="exp-mode-seg">
          <button className={`exp-mode-btn${exportMode === 'week' ? ' on' : ''}`} onClick={() => setExportMode('week')}>this week</button>
          <button className={`exp-mode-btn${exportMode === 'day' ? ' on' : ''}`} onClick={() => setExportMode('day')}>today</button>
        </div>

        {/* Export card preview */}
        <div className="exp-preview-wrap">
          <div ref={cardRef} className="exp-card">
            {/* Card header */}
            <div className="exp-card-hdr">
              <div className="exp-card-logo">
                <span className="exp-card-dot" />
                minutely
              </div>
              <div className="exp-card-meta">
                {exportMode === 'week'
                  ? `week of ${MONTHS[new Date(weekDates[0].date + 'T12:00').getMonth()]} ${new Date(weekDates[0].date + 'T12:00').getDate()}`
                  : today.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
            </div>

            {exportMode === 'week' ? (
              // Week view: column per day
              <div className="exp-week-grid">
                {weekDates.map(({ date, label }) => {
                  const dayBlocks = blocks.filter(b => b.date === date).sort((a, b) => toM(a.start) - toM(b.start))
                  const isToday = date === td
                  return (
                    <div key={date} className={`exp-day-col${isToday ? ' today' : ''}`}>
                      <div className={`exp-day-lbl${isToday ? ' today' : ''}`}>{label}</div>
                      <div className="exp-day-blocks">
                        {dayBlocks.slice(0, 6).map((b, i) => (
                          <div
                            key={i}
                            className="exp-block"
                            style={{
                              background: TYPE_BG[b.type] || '#F5F5F5',
                              borderColor: TYPE_BORDER[b.type] || '#DDD',
                              color: TYPE_INK[b.type] || '#333',
                            }}
                          >
                            <div className="exp-block-name">{b.name}</div>
                            <div className="exp-block-time">{b.start}</div>
                          </div>
                        ))}
                        {dayBlocks.length === 0 && (
                          <div className="exp-day-empty">—</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              // Day view: timeline
              <div className="exp-day-timeline">
                <div className="exp-timeline-col">
                  {todayBlocks.length === 0 ? (
                    <div className="exp-day-empty" style={{ padding: '40px 0', textAlign: 'center' }}>no blocks today</div>
                  ) : (
                    todayBlocks.map((b, i) => (
                      <div
                        key={i}
                        className="exp-tl-block"
                        style={{
                          background: TYPE_BG[b.type] || '#F5F5F5',
                          borderColor: TYPE_BORDER[b.type] || '#DDD',
                          color: TYPE_INK[b.type] || '#333',
                        }}
                      >
                        <div className="exp-tl-time">{b.start}–{b.end}</div>
                        <div className="exp-tl-name">{b.name}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Card footer */}
            <div className="exp-card-footer">
              {exportMode === 'week'
                ? `${weekBlocks.length} blocks scheduled`
                : `${todayBlocks.length} blocks today`}
              {' · '}minutely.app
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="exp-actions">
          <button className="exp-btn" onClick={copyToClipboard} disabled={downloading}>
            {copied ? '✓ copied!' : '⎘ copy image'}
          </button>
          <button className="exp-btn primary" onClick={download} disabled={downloading}>
            {downloading ? 'saving…' : '↓ download PNG'}
          </button>
        </div>
      </div>
    </div>
  )
}
