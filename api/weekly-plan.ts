import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const { weekDates, existingBlocks, lastWeekBlocks, priorities, energy } = req.body || {}

  const weekStr = (weekDates || []).join(', ')
  const lastWeekText = lastWeekBlocks?.length
    ? lastWeekBlocks.map((b: any) => `${b.date} ${b.start}–${b.end}: ${b.name} (${b.type})`).join('\n')
    : 'No data from last week'
  const existingText = existingBlocks?.length
    ? existingBlocks.map((b: any) => `${b.date} ${b.start}–${b.end}: ${b.name} (${b.type})`).join('\n')
    : 'None yet'
  const prioText = priorities?.filter(Boolean).join(', ') || 'None set'

  const system = `You are a warm weekly planning coach for minutely.

Week dates: ${weekStr}
Energy level: ${energy}
This week's priorities: ${prioText}

Last week's schedule:
${lastWeekText}

Existing blocks this week:
${existingText}

Create a thoughtful week plan that:
- Front-loads important focus work early in the week (Mon/Tue)
- Includes recovery/wind-down blocks
- Respects energy level (high energy = more focus blocks, low = lighter tasks)
- Addresses the stated priorities
- Doesn't conflict with existing blocks
- Each block has a specific, meaningful name

Return a JSON object:
{
  "reflection": "a warm 2-sentence reflection on last week's pattern",
  "plan": [{"date": "YYYY-MM-DD", "name": "block name", "start": "HH:MM", "end": "HH:MM", "type": "focus|routine|study|free", "reason": "one sentence why"}],
  "summary": "a warm 2-sentence overview of the week plan"
}

Return ONLY the JSON object.`

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' })
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1200,
      system,
      messages: [{ role: 'user', content: `Plan my week: ${weekStr}` }],
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
