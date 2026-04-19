import { SLOT, SH } from './constants'
import type { Config } from './types'

export const toM = (t: string): number => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export const toT = (m: number): string => {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, m))
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

export const fmt = (t: string, tf: '12' | '24'): string => {
  if (tf === '24') return t
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'pm' : 'am'
  const hh = h > 12 ? h - 12 : h || 12
  return m ? `${hh}:${String(m).padStart(2, '0')}${ap}` : `${hh}${ap}`
}

export const snap = (m: number): number => Math.round(m / SLOT) * SLOT

export const m2y = (m: number, ds: string): number => ((m - toM(ds)) / SLOT) * SH

export const y2m = (y: number, ds: string): number => toM(ds) + Math.round(y / SH) * SLOT

export const totalHeight = (cfg: Config): number =>
  Math.ceil((toM(cfg.de) - toM(cfg.ds)) / SLOT) * SH

// ── Timezone support ──
// Call setAppTz() once on boot (from store) to keep date functions tz-aware.
let _appTz: string | null = null
export const setAppTz = (tz: string | null) => { _appTz = tz || null }

const nowInTz = (): { y: number; mo: number; d: number; h: number; min: number } => {
  if (_appTz) {
    const p = new Intl.DateTimeFormat('en', {
      timeZone: _appTz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date())
    const get = (t: string) => parseInt(p.find(x => x.type === t)?.value || '0')
    return { y: get('year'), mo: get('month') - 1, d: get('day'), h: get('hour'), min: get('minute') }
  }
  const n = new Date()
  return { y: n.getFullYear(), mo: n.getMonth(), d: n.getDate(), h: n.getHours(), min: n.getMinutes() }
}

export const todayStr = (): string => {
  const { y, mo, d } = nowInTz()
  return `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export const isToday = (s: string): boolean => s === todayStr()

export const nowMinutes = (): number => {
  const { h, min } = nowInTz()
  return h * 60 + min
}

export const weekStart = (off: number): Date => {
  const { y, mo, d } = nowInTz()
  const date = new Date(y, mo, d)
  date.setDate(date.getDate() - date.getDay() + off * 7)
  date.setHours(0, 0, 0, 0)
  return date
}

export const dateStr = (ws: Date, di: number): string => {
  const d = new Date(ws)
  d.setDate(d.getDate() + di)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const plannedMinutes = (blocks: Array<{ date: string; start: string; end: string }>, date: string): number =>
  blocks.filter(b => b.date === date).reduce((s, b) => s + toM(b.end) - toM(b.start), 0)

export const totalDayMinutes = (cfg: Config): number => toM(cfg.de) - toM(cfg.ds)

// Parse a YYYY-MM-DD string as LOCAL midnight (not UTC)
// Using new Date("2026-03-25") parses as UTC midnight → wrong day in western timezones
export const parseLocalDate = (dateStr: string): Date => new Date(dateStr + 'T00:00:00')

// ── Natural-language block parser (client-side, no API needed) ──────────────
// Handles: "deep work 2pm–4pm", "standup 9am 30min", "gym tomorrow 7am 1h"
export function parseNL(
  text: string,
  today: string,
  cfg: { ds: string; de: string },
): { name: string; start: string; end: string; type: 'focus' | 'routine' | 'study' | 'free'; date: string } | null {
  const raw = text.trim()
  if (!raw) return null

  const p2 = (n: number) => String(n).padStart(2, '0')
  const minsToStr = (m: number) => `${p2(Math.floor(m / 60))}:${p2(m % 60)}`
  const endM = toM(cfg.de)

  // Convert "H[:MM] [am|pm]" token to 24h minutes; ampm may be undefined
  const hToM = (h: number, m: number, ap?: string): number => {
    let hh = h
    if (ap) {
      const a = ap.toLowerCase()
      if (a === 'pm' && hh !== 12) hh += 12
      if (a === 'am' && hh === 12) hh = 0
    } else {
      // no am/pm hint — hours 1–7 → assume PM; 8–12 stay as-is
      if (hh >= 1 && hh <= 7) hh += 12
    }
    return hh * 60 + m
  }

  // ── Date extraction ──
  let date = today
  let working = raw

  if (/\btomorrow\b/i.test(working)) {
    const d = new Date(today + 'T12:00'); d.setDate(d.getDate() + 1)
    date = d.toISOString().slice(0, 10)
    working = working.replace(/\btomorrow\b/i, '').trim()
  } else {
    const DOWS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
    for (const [i, day] of DOWS.entries()) {
      if (new RegExp(`\\b${day}\\b`, 'i').test(working)) {
        const base = new Date(today + 'T12:00')
        let diff = i - base.getDay(); if (diff <= 0) diff += 7
        base.setDate(base.getDate() + diff)
        date = base.toISOString().slice(0, 10)
        working = working.replace(new RegExp(`\\b${day}\\b`, 'i'), '').trim()
        break
      }
    }
  }

  // ── Time extraction ──
  // Time range: "2pm-4pm", "14:00–16:00", "2:30pm to 4pm"
  const rangeRe = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-{1,2}|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i
  // Single time: "2pm", "14:30"
  const singleRe = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i
  // Duration: "1h", "30m", "45min", "1.5h", "1 hour"
  const durRe = /(\d+(?:\.\d+)?)\s*h(?:ours?|r)?\b|(\d+)\s*m(?:in(?:utes?)?)?\b/i

  let startMins: number | null = null
  let endMins: number | null = null
  let nameText = working

  const rangeM = working.match(rangeRe)
  if (rangeM) {
    const [full, h1, m1, ap1, h2, m2, ap2] = rangeM
    const inferredAp = ap1 || ap2  // propagate am/pm across range
    startMins = hToM(+h1, +(m1 || 0), ap1 || (ap2 && !ap1 ? inferredAp : undefined))
    endMins   = hToM(+h2, +(m2 || 0), ap2 || (ap1 && !ap2 ? inferredAp : undefined))
    if (endMins <= startMins) endMins += 12 * 60  // e.g. "11pm–1am"
    nameText = working.replace(full, '').trim()
  } else {
    const singleM = working.match(singleRe)
    if (singleM) {
      const [full, h, m, ap] = singleM
      startMins = hToM(+h, +(m || 0), ap)
      nameText = working.replace(full, '').trim()
      // Look for duration in remaining text
      const durM = nameText.match(durRe)
      if (durM) {
        const durMins = durM[1] ? Math.round(+durM[1] * 60) : +durM[2]
        endMins = startMins + durMins
        nameText = nameText.replace(durM[0], '').trim()
      } else {
        endMins = startMins + 60  // default 1h
      }
    }
  }

  if (startMins === null || endMins === null) return null
  endMins = Math.min(endMins, endM)
  if (endMins <= startMins) return null

  // ── Name cleanup ──
  const name = nameText.replace(/\s+/g, ' ').replace(/^[\s,.\-–]+|[\s,.\-–]+$/g, '').trim()
  if (!name) return null

  // ── Type detection from name ──
  const nl = name.toLowerCase()
  let type: 'focus' | 'routine' | 'study' | 'free' = 'routine'
  if (/deep work|focus|coding|design|writing|build|develop|implement|draft|produce/.test(nl)) type = 'focus'
  else if (/study|learn|homework|revision|reading session|research|practice|course|workshop/.test(nl)) type = 'study'
  else if (/gym|workout|run(?:ning)?|yoga|pilates|walk|hike|swim|exercise|sport|lunch|dinner|break|nap|rest|relax|media/.test(nl)) type = 'free'

  // Title-case name
  const titled = name.replace(/\b\w/g, c => c.toUpperCase())

  return { name: titled, start: minsToStr(startMins), end: minsToStr(endMins), type, date }
}

export function getFreeSlots(
  blocks: Array<{ start: string; end: string }>,
  ds: string,
  de: string,
  minDuration = 30
): Array<{ start: string; end: string; duration: number }> {
  const startM = toM(ds)
  const endM = toM(de)
  const occupied = blocks
    .map(b => ({ s: toM(b.start), e: toM(b.end) }))
    .sort((a, b) => a.s - b.s)

  const slots: Array<{ start: string; end: string; duration: number }> = []
  let cursor = startM

  for (const b of occupied) {
    if (b.s > cursor + minDuration) {
      slots.push({ start: toT(cursor), end: toT(b.s), duration: b.s - cursor })
    }
    cursor = Math.max(cursor, b.e)
  }
  if (endM > cursor + minDuration) {
    slots.push({ start: toT(cursor), end: toT(endM), duration: endM - cursor })
  }
  return slots
}
