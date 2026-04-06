import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const { date, dayStart, dayEnd, energy, priorities, goals, existingBlocks, freeSlots, extraContext } = req.body || {}

  const energyLabels = ['', 'low', 'medium', 'high']
  const energyTxt = energy ? energyLabels[energy] || 'medium' : 'medium'
  const prioritiesTxt = priorities?.filter(Boolean).join(', ') || 'none specified'
  const goalsTxt = goals?.length
    ? goals.map((g: any) => `- ${g.name}${g.targetHours ? ` (target: ${g.targetHours}h, done: ${g.actualHours ?? 0}h)` : ''}`).join('\n')
    : 'none set'
  const existingTxt = existingBlocks?.length
    ? existingBlocks.map((b: any) => `${b.start}–${b.end}: ${b.name} (${b.type})`).join('\n')
    : 'none yet'
  const slotsTxt = freeSlots?.length
    ? freeSlots.map((s: any) => `${s.start}–${s.end} (${s.duration}min)`).join('\n')
    : 'all day is free'

  const system = `You are a smart day-design assistant for minutely. Build a focused, realistic day schedule that fits around the user's existing blocks.

Rules:
- Only schedule into the FREE SLOTS listed — never overlap existing blocks
- Energy: ${energyTxt} — ${energyTxt === 'low' ? 'keep it light, avoid back-to-back focus' : energyTxt === 'high' ? 'this is peak time, front-load deep work' : 'mix focus and lighter tasks'}
- Priorities must appear as blocks in the schedule
- Respect goal context — include time blocks that advance under-tracked goals
- Match type: deep work/writing/coding = focus, meetings/errands = routine, learning/reading = study, breaks/meals/walks = free
- Add 1–2 short break blocks (15–30min) for breathing room
- Each block: minimum 20min, maximum 120min. Round all times to nearest 15min.
- Return 4–8 new blocks total (not counting existing ones)

Day: ${date}, ${dayStart}–${dayEnd}
Priorities: ${prioritiesTxt}
Goals: ${goalsTxt}
Existing: ${existingTxt}
Free slots: ${slotsTxt}${extraContext ? `\nExtra context: ${extraContext}` : ''}

Return ONLY a JSON array of new blocks:
[{"name": "block name", "start": "HH:MM", "end": "HH:MM", "type": "focus|routine|study|free"}]`

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' })
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 800,
      system,
      messages: [{ role: 'user', content: 'Design my day.' }],
    })
    const txt = (msg.content[0] as any).text ?? ''
    const a = txt.indexOf('[')
    const b = txt.lastIndexOf(']')
    if (a < 0 || b <= a) throw new Error('no JSON array in response')
    const raw = txt.slice(a, b + 1)
    const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/,(\s*[}\]])/g, '$1')
    const blocks = JSON.parse(cleaned)
    return res.json(blocks)
  } catch (err: any) {
    return res.status(500).json({ error: String(err) })
  }
}
