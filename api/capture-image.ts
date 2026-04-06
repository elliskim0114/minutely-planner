import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const { image, mimeType, today } = req.body || {}

  if (!image) return res.status(400).json({ error: 'image required' })

  const system = `You are a scheduling assistant for minutely. Extract all events, meetings, tasks, and deadlines from the image provided. Today is ${today}.

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
- Estimate end time from duration clues. If no end and no duration, estimate 1h.
- type: meetings/calls/appointments = routine; deep work/writing/coding = focus; learning/reading = study; lunch/breaks/walks = free
- confidence: high = explicit time given, medium = date given but time estimated, low = no date/time
- Only include real events, not decorative text or UI elements
Return ONLY a JSON array, nothing else.`

  const VALID_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  const safeMime = VALID_MIMES.includes(mimeType) ? mimeType : 'image/jpeg'

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' })
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: safeMime as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: image,
            },
          },
          { type: 'text', text: 'Extract all events, appointments, and tasks from this image.' },
        ],
      }],
    })
    const txt = (msg.content[0] as any).text ?? ''
    let jsonStr = txt.trim()
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
    }
    const a = jsonStr.indexOf('[')
    const b = jsonStr.lastIndexOf(']')
    if (a < 0 || b <= a) throw new Error('AI did not return valid JSON — try the text tab instead')
    const raw = jsonStr.slice(a, b + 1)
    const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/,(\s*[}\]])/g, '$1')
    const events = JSON.parse(cleaned)
    return res.json(events)
  } catch (err: any) {
    return res.status(500).json({ error: String(err) })
  }
}
