import { useStore } from '../store'
import { todayStr, toM } from '../utils'

const MESSAGES = [
  "hey — how's the day going?",
  "checking in — still on track?",
  "quick check: feeling good about your plan?",
  "how's the energy? need any help reshuffling?",
  "hey, how's it going? day too packed or all good?",
]

export default function CoachCheckin() {
  const { closeCheckin, openCoachAt, blocks, cfg } = useStore()

  const now = new Date()
  const hour = now.getHours()
  // Pick message based on hour so it varies throughout the day
  const msg = MESSAGES[hour % MESSAGES.length]

  const td = todayStr()
  const nowM = now.getHours() * 60 + now.getMinutes()
  const todayBlocks = blocks.filter(b => b.date === td)
  const totalMins = todayBlocks.reduce((s, b) => s + toM(b.end) - toM(b.start), 0)
  const dayMins = toM(cfg.de) - toM(cfg.ds)
  const pct = dayMins > 0 ? Math.round((totalMins / dayMins) * 100) : 0

  // Show a contextual sub-hint
  const hint = pct > 90
    ? 'your day looks pretty stacked 👀'
    : pct < 20 && nowM > toM(cfg.ds) + 60
    ? 'day looks light — want help filling it in?'
    : null

  const handleOpenCoach = () => {
    closeCheckin()
    openCoachAt('analyze')
  }

  return (
    <div className="checkin-bubble">
      <div className="checkin-hdr">
        <span className="checkin-icon">🤖</span>
        <span className="checkin-msg">{msg}</span>
        <button className="checkin-dismiss" onClick={closeCheckin}>×</button>
      </div>
      {hint && <div className="checkin-hint">{hint}</div>}
      <div className="checkin-acts">
        <button className="checkin-btn checkin-btn-primary" onClick={handleOpenCoach}>open coach</button>
        <button className="checkin-btn checkin-btn-secondary" onClick={closeCheckin}>all good 👍</button>
      </div>
    </div>
  )
}
