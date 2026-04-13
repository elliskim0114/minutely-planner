import { useEffect, useRef } from 'react'
import { useStore } from '../store'

const GOLD_COLORS = ['#FFD700', '#FFC200', '#FFE066', '#F5A623', '#FFBA40', '#FFE8A0', '#E8A000', '#FFF0B0']
const SHAPES = ['◆', '★', '✦', '●', '▲', '✧']
const COUNT = 55

interface Particle {
  el: HTMLSpanElement
  vx: number
  vy: number
  gravity: number
  x: number
  y: number
  rot: number
  rotV: number
  scale: number
  alpha: number
  decay: number
}

export default function GoldRain() {
  const goldRainKey = useStore(s => s.goldRainKey)
  const containerRef = useRef<HTMLDivElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (goldRainKey === 0) return
    const container = containerRef.current
    if (!container) return

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    particlesRef.current.forEach(p => p.el.remove())
    particlesRef.current = []

    // Fire from top-center spreading wide
    const ox = window.innerWidth / 2
    const oy = -20

    for (let i = 0; i < COUNT; i++) {
      const el = document.createElement('span')
      const color = GOLD_COLORS[Math.floor(Math.random() * GOLD_COLORS.length)]
      const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)]
      el.textContent = shape
      el.style.cssText = `
        position:fixed;
        left:${ox + (Math.random() - 0.5) * window.innerWidth * 0.8}px;
        top:${oy}px;
        color:${color};
        font-size:${8 + Math.random() * 14}px;
        pointer-events:none;
        z-index:9999;
        user-select:none;
        will-change:transform,opacity;
        text-shadow:0 0 6px ${color}88;
      `
      container.appendChild(el)

      const sx = parseFloat(el.style.left)
      const sy = parseFloat(el.style.top)
      particlesRef.current.push({
        el,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 5,
        gravity: 0.08 + Math.random() * 0.1,
        x: sx,
        y: sy,
        rot: Math.random() * 360,
        rotV: (Math.random() - 0.5) * 8,
        scale: 0.6 + Math.random() * 1.0,
        alpha: 1,
        decay: 0.006 + Math.random() * 0.008,
      })
    }

    const tick = () => {
      let alive = false
      particlesRef.current.forEach(p => {
        if (p.alpha <= 0) return
        p.x += p.vx
        p.y += p.vy
        p.vy += p.gravity
        p.vx *= 0.99
        p.rot += p.rotV
        p.alpha -= p.decay
        if (p.alpha < 0) p.alpha = 0
        else alive = true
        p.el.style.transform = `translate(${p.x - parseFloat(p.el.style.left)}px, ${p.y - parseFloat(p.el.style.top)}px) rotate(${p.rot}deg) scale(${p.scale})`
        p.el.style.opacity = String(p.alpha)
      })
      if (alive) rafRef.current = requestAnimationFrame(tick)
      else {
        particlesRef.current.forEach(p => p.el.remove())
        particlesRef.current = []
      }
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [goldRainKey])

  return <div ref={containerRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999 }} />
}
