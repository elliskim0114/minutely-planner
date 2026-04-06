import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const { blocks, instruction, date, dayStart, dayEnd } = req.body || {}

  if (!blocks?.length) return res.status(400).json({ error: 'blocks required' })
  if (!instruction?.trim()) return res.status(400).json({ error: 'instruction required' })

  const blockText = blocks
    .map((b: any) => `[id:${b.id}] ${b.date} ${b.start}–${b.end}: ${b.name} (${b.type})`)
    .join('\n')

  const system = `You are a schedule editor for minutely. The user wants to make changes to their calendar blocks.

Today: ${date}
Day hours: ${dayStart}–${dayEnd}

Current blocks:
${blockText}

The user says: "${instruction}"

Understand their intent and return the COMPLETE modified block list. Rules:
- Keep each block's id unchanged
- You may change: name, start, end, date, type
- Times in HH:MM 24hr. Dates in YYYY-MM-DD.
- CRITICAL: No two blocks on the same day may overlap — not even by 1 minute. If adding or moving a block causes a conflict, cascade-shift the affected blocks forward in time to make room. Shorten blocks only as a last resort if they would exceed dayEnd.
- If the user asks to ADD a new block: insert it at the requested time, then push any conflicting blocks forward so everything still fits. Generate a new unique id > 100000 for the new block.
- If swapping two blocks, swap their start/end times (keep their dates)
- If moving something "to tomorrow" use the date after ${date}
- If compressing, remove gaps of ≥15 min between consecutive blocks on the same day
- Be practical — if a block would go past dayEnd, shorten it slightly

Return a JSON object:
{
  "blocks": [{"id": number, "name": "...", "start": "HH:MM", "end": "HH:MM", "date": "YYYY-MM-DD", "type": "..."}],
  "summary": "one warm sentence explaining what you changed"
}

Return ONLY the JSON object.`

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' })
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 800,
      system,
      messages: [{ role: 'user', content: instruction }],
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
