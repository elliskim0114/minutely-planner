import { useState, useEffect, useRef } from 'react'

interface Props {
  text: string
  speed?: number
  delay?: number
  cursor?: boolean
  markdown?: boolean
  className?: string
}

// Simple inline markdown → HTML (bold, italic, code, line breaks)
export function renderMd(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>')
}

export default function TypedText({ text, speed = 16, delay = 0, cursor = true, markdown = false, className }: Props) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const toRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setDisplayed('')
    setDone(false)
    if (ivRef.current) clearInterval(ivRef.current)
    if (toRef.current) clearTimeout(toRef.current)
    if (!text) return

    const start = () => {
      let i = 0
      ivRef.current = setInterval(() => {
        i++
        setDisplayed(text.slice(0, i))
        if (i >= text.length) {
          setDone(true)
          clearInterval(ivRef.current!)
        }
      }, speed)
    }

    if (delay > 0) {
      toRef.current = setTimeout(start, delay)
    } else {
      start()
    }

    return () => {
      if (ivRef.current) clearInterval(ivRef.current)
      if (toRef.current) clearTimeout(toRef.current)
    }
  }, [text, speed, delay])

  if (markdown) {
    return (
      <span className={className}>
        <span dangerouslySetInnerHTML={{ __html: renderMd(displayed) }} />
        {cursor && !done && <span className="tw-cursor">▋</span>}
      </span>
    )
  }

  return (
    <span className={className}>
      {displayed}
      {cursor && !done && <span className="tw-cursor">▋</span>}
    </span>
  )
}
