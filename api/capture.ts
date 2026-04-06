import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const { text, today } = req.body || {}

  if (!text?.trim()) return res.status(400).json({ error: 'text required' })

  const system = `You are a scheduling assistant for minutely. Extract all events, meetings, tasks, and deadlines from the text provided. Today is ${today}.

For each item found return a JSON object:
{
  "name": "clear event/task name",
  "date": "YYYY-MM-DD",
  "start": "HH:MM",
  "end": "HH:MM",
  "type": "focus|routine|study|free",
  "confidence": "high|medium|low"
}

Rules:
- Resolve relative dates: "tomorrow" → actual YYYY-MM-DD, "next Monday" → actual date, etc.
- If no time given: set start and end to null
- Estimate end time from duration clues ("30 min meeting" → start + 30m, "~2h task" → start + 2h). If no end and no duration, estimate 1h.
- type: meetings/calls/appointments = routine; deep work/writing/coding = focus; learning/reading = study; lunch/breaks/walks = free
- confidence: high = explicit time given, medium = date given but time estimated, low = no date/time
- Only include real events, not vague mentions
Return ONLY a JSON array, nothing else.`

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' })
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 800,
      system,
      messages: [{ role: 'user', content: text }],
    })
    const txt = (msg.content[0] as any).text ?? ''
    const a = txt.indexOf('[')
    const b = txt.lastIndexOf(']')
    if (a < 0 || b <= a) throw new Error('no JSON array in response')
    const raw = txt.slice(a, b + 1)
    const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/,(\s*[}\]])/g, '$1')
    const events = JSON.parse(cleaned)
    return res.json(events)
  } catch (err: any) {
    return res.status(500).json({ error: String(err) })
  }
}
