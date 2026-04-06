import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const { goal, totalHours, deadline, date, dayStart, dayEnd, existingWeekBlocks } = req.body || {}

  if (!goal?.trim()) return res.status(400).json({ error: 'goal required' })

  const existingText = existingWeekBlocks?.length
    ? existingWeekBlocks.map((b: any) => `${b.date} ${b.start}–${b.end}: ${b.name}`).join('\n')
    : 'None yet'

  const system = `You are a warm planning assistant for minutely. Break down a goal into specific focused work sessions spread across the week.

Goal: "${goal}"
${totalHours ? `Total estimated hours: ${totalHours}h` : ''}
${deadline ? `Deadline: ${deadline}` : ''}
Starting from: ${date}
Day hours: ${dayStart}–${dayEnd}

Existing blocks this week (avoid conflicts):
${existingText}

Break this goal into 3–6 specific, well-named work sessions. Each session should have a concrete, specific name — NOT generic like "work on ${goal}" but specific like "outline and research – ch3", "write first draft sections 1-2", etc.

Spread sessions across the next few days. Keep each session 60-120 minutes. Find open time slots that don't conflict with existing blocks.

Return a JSON object:
{
  "blocks": [{"name": "specific session name", "start": "HH:MM", "end": "HH:MM", "date": "YYYY-MM-DD", "type": "focus", "note": "brief note on what to accomplish"}],
  "plan": "a warm 2-3 sentence overview of the plan"
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
      messages: [{ role: 'user', content: `Break down: ${goal}` }],
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
