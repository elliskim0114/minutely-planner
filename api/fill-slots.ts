import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const { description, freeSlots, existingBlocks, date, dayStart, dayEnd } = req.body || {}

  if (!description?.trim()) return res.status(400).json({ error: 'description required' })

  const existingText = existingBlocks?.length
    ? existingBlocks.map((b: any) => `${b.start}–${b.end}: ${b.name} (${b.type})`).join('\n')
    : 'None yet'
  const slotsText = freeSlots?.length
    ? freeSlots.map((s: any) => `${s.start}–${s.end} (${s.duration}min free)`).join('\n')
    : 'No free slots'

  const system = `You are a warm scheduling assistant for minutely. The user wants to fit specific tasks into their day.

Date: ${date}
Day hours: ${dayStart}–${dayEnd}

Existing schedule (DO NOT overlap these):
${existingText}

Free time slots available:
${slotsText}

The user wants to do: "${description}"

Parse the tasks and durations from the description. Schedule them into the free slots. Rules:
- Respect all existing blocks — no overlaps
- Use the free slots efficiently
- Match task type: meetings/calls = routine, deep work/writing/coding = focus, learning/reading = study, breaks/walks/meals = free
- If a task doesn't fit exactly, round to nearest 15 minutes
- Only schedule tasks that fit within the available free slots

Return a JSON object:
{
  "blocks": [{"name": "task name", "start": "HH:MM", "end": "HH:MM", "type": "focus|routine|study|free"}],
  "message": "a warm 1-2 sentence summary of what was scheduled and any notes"
}

Return ONLY the JSON object.`

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' })
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 700,
      system,
      messages: [{ role: 'user', content: description }],
    })
    const txt = (msg.content[0] as any).text ?? ''
    const a = txt.indexOf('{')
    const b = txt.lastIndexOf('}')
    if (a < 0 || b <= a) throw new Error('no JSON in response')
    const result = JSON.parse(txt.slice(a, b + 1))
    return res.json(result)
  } catch (err: any) {
    return res.status(500).json({ error: String(err) })
  }
}
