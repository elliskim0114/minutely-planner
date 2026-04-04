import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { todayStr, toM, fmt } from '../utils'

const FOLLOW_UPS = [
  "I'm running behind",
  "I need a short break",
  "what's coming up next?",
  "I'm feeling overwhelmed",
  "help me refocus",
  "I finished early — what now?",
]

function nowTimeStr() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

function fmtMins(m: number, tf: '12' | '24') {
  const h = Math.floor(m / 60)
  const min = m % 60
  const t = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  return fmt(t, tf)
}

export default function WhatNowModal({ onClose }: { onClose: () => void }) {
  const { blocks, cfg, anthropicKey, userProfile, goals } = useStore()
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [followUpLoading, setFollowUpLoading] = useState(false)

  const date = todayStr()
  const nowStr = nowTimeStr()
  const nowMins = toM(nowStr)

  const todayBlocks = blocks
    .filter(b => b.date === date)
    .sort((a, b) => toM(a.start) - toM(b.start))

  const currentBlock = todayBlocks.find(b => toM(b.start) <= nowMins && toM(b.end) > nowMins)
  const nextBlock = todayBlocks.find(b => toM(b.start) > nowMins)
  const prevBlock = [...todayBlocks].reverse().find(b => toM(b.end) <= nowMins)

  const fetchWhatNow = async (extraContext?: string) => {
    if (loading || followUpLoading) return
    extraContext ? setFollowUpLoading(true) : setLoading(true)
    setError('')

    try {
      if (!anthropicKey) throw new Error('add your Anthropic API key in Settings to use What Now')

      const scheduleLines = todayBlocks.length
        ? todayBlocks.map(b => `${b.start}–${b.end}: ${b.name} (${b.type}${b.completed ? ', ' + b.completed : ''})`).join('\n')
        : 'No blocks scheduled today.'

      const profileParts: string[] = []
      if (userProfile?.occupation) profileParts.push(`Occupation: ${userProfile.occupation}`)
      if (userProfile?.energyPattern) profileParts.push(`Energy: ${userProfile.energyPattern} person`)
      if (goals?.length) profileParts.push(`Goals: ${goals.map(g => g.name).join(', ')}`)

      const systemPrompt = `You are an in-the-moment productivity coach. The user is asking what they should do RIGHT NOW at ${nowStr}.

Be direct, warm, specific. Give:
1. One sentence acknowledging their exact current situation
2. 2–3 concrete, specific actions for the next 30–60 minutes
3. One short encouraging line

Keep the total under 160 words. Write naturally with line breaks between parts, no bullet symbols or markdown headers.${profileParts.length ? `\n\nUser: ${profileParts.join(', ')}` : ''}`

      const userMsg = `It is ${nowStr}. Today's schedule:\n${scheduleLines}${extraContext ? `\n\nI want to say: "${extraContext}"` : ''}`

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMsg }],
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error.message || 'API error')
      const message = data.content?.[0]?.text?.trim() ?? ''
      if (!message) throw new Error('no response from AI')
      setText(message)
    } catch (e: any) {
      setError(e.message || 'something went wrong')
    } finally {
      setLoading(false)
      setFollowUpLoading(false)
    }
  }

  useEffect(() => { fetchWhatNow() }, [])

  const handleFollowUp = (prompt: string) => {
    setText('')
    fetchWhatNow(prompt)
  }

  return (
    <div className="wn-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="wn-panel">
        {/* Header */}
        <div className="wn-hdr">
          <div className="wn-hdr-left">
            <div className="wn-spark">⚡</div>
            <div>
              <div className="wn-title">what now?</div>
              <div className="wn-time">{fmt(nowStr, cfg.tf)}</div>
            </div>
          </div>
          <button className="wn-close" onClick={onClose}>×</button>
        </div>

        {/* Current moment context */}
        <div className="wn-context">
          {currentBlock ? (
            <div className="wn-block-now">
              <span className="wn-block-dot" data-type={currentBlock.type} />
              <div>
                <div className="wn-block-name">{currentBlock.name}</div>
                <div className="wn-block-until">until {fmt(currentBlock.end, cfg.tf)}</div>
              </div>
            </div>
          ) : (
            <div className="wn-block-now wn-free">
              <span className="wn-block-dot" />
              <div>
                <div className="wn-block-name">between blocks</div>
                {nextBlock && <div className="wn-block-until">next: {nextBlock.name} at {fmt(nextBlock.start, cfg.tf)}</div>}
              </div>
            </div>
          )}
          {nextBlock && currentBlock && (
            <div className="wn-next-pill">→ {nextBlock.name} at {fmt(nextBlock.start, cfg.tf)}</div>
          )}
        </div>

        {/* AI response */}
        <div className="wn-body">
          {loading && (
            <div className="wn-loading">
              <div className="wn-dot-row">
                <div className="wn-dot" /><div className="wn-dot" /><div className="wn-dot" />
              </div>
              <div className="wn-loading-lbl">reading your day…</div>
            </div>
          )}
          {error && <div className="wn-error">{error}</div>}
          {text && !loading && (
            <div className="wn-text">{text}</div>
          )}
        </div>

        {/* Follow-up prompts */}
        <div className="wn-followups">
          {FOLLOW_UPS.map(f => (
            <button
              key={f}
              className="wn-followup-btn"
              onClick={() => handleFollowUp(f)}
              disabled={loading || followUpLoading}
            >
              {followUpLoading ? '…' : f}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
