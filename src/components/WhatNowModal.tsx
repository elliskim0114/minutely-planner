import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { todayStr, toM, fmt } from '../utils'
import TypedText from './TypedText'

const QUICK_PROMPTS = [
  "I'm running behind",
  "I need a short break",
  "I finished early — what now?",
  "I'm feeling overwhelmed",
  "help me refocus",
]

function nowTimeStr() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

export default function WhatNowModal({ onClose }: { onClose: () => void }) {
  const { blocks, cfg, anthropicKey, userProfile, goals } = useStore()

  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const threadEndRef = useRef<HTMLDivElement>(null)

  const date = todayStr()
  const nowStr = nowTimeStr()
  const nowMins = toM(nowStr)

  const todayBlocks = blocks
    .filter(b => b.date === date)
    .sort((a, b) => toM(a.start) - toM(b.start))

  const currentBlock = todayBlocks.find(b => toM(b.start) <= nowMins && toM(b.end) > nowMins)
  const nextBlock = todayBlocks.find(b => toM(b.start) > nowMins)

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = async (userText: string) => {
    if (loading || !userText.trim()) return
    setError('')
    const newMessages = [...messages, { role: 'user' as const, content: userText }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const profileParts: string[] = []
      if (userProfile?.occupation) profileParts.push(`Occupation: ${userProfile.occupation}`)
      if (userProfile?.energyPattern) profileParts.push(`Energy: ${userProfile.energyPattern} person`)
      if (goals?.length) profileParts.push(`Goals: ${goals.map(g => g.name).join(', ')}`)

      const res = await fetch('/api/coach-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          schedule: todayBlocks.map(b => ({ name: b.name, start: b.start, end: b.end, type: b.type, completed: b.completed })),
          date,
          currentTime: nowStr,
          userProfile: userProfile ? { occupation: userProfile.occupation, energyPattern: userProfile.energyPattern } : undefined,
          goals: goals?.map(g => ({ name: g.name })),
          apiKey: anthropicKey || undefined,
        }),
      })
      const raw = await res.text()
      let data: any
      try { data = JSON.parse(raw) } catch { throw new Error('AI service unavailable') }
      if (data.error) throw new Error(data.error)
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }])
    } catch (e: any) {
      setError(e.message || 'something went wrong')
      setMessages(prev => prev.slice(0, -1)) // remove the user message if call failed
    } finally {
      setLoading(false)
    }
  }

  // Auto-send initial "what now?" on mount
  useEffect(() => {
    sendMessage('what should I focus on right now?')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

        {/* Conversation thread */}
        <div className="wn-thread">
          {messages.map((msg, i) => (
            msg.role === 'assistant' ? (
              <div key={i} className="wn-msg wn-msg-ai">
                <TypedText text={msg.content} speed={10} delay={0} />
              </div>
            ) : i > 0 ? ( // skip showing the initial system message
              <div key={i} className="wn-msg wn-msg-user">{msg.content}</div>
            ) : null
          ))}
          {loading && (
            <div className="wn-msg wn-msg-ai wn-loading-msg">
              <div className="wn-dot-row">
                <div className="wn-dot" /><div className="wn-dot" /><div className="wn-dot" />
              </div>
            </div>
          )}
          {error && <div className="wn-error">{error}</div>}
          <div ref={threadEndRef} />
        </div>

        {/* Quick prompts */}
        <div className="wn-followups">
          {QUICK_PROMPTS.map(f => (
            <button
              key={f}
              className="wn-followup-btn"
              onClick={() => sendMessage(f)}
              disabled={loading}
            >{f}</button>
          ))}
        </div>

        {/* Free-text input */}
        <div className="wn-input-row">
          <input
            className="wn-inp"
            placeholder="ask anything…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) } }}
            disabled={loading}
          />
          <button
            className={`wn-send${loading ? ' loading' : ''}`}
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
          >
            {loading ? '…' : '↑'}
          </button>
        </div>
      </div>
    </div>
  )
}
