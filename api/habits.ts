import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const { blocks } = req.body || {}

  if (!blocks?.length) return res.json({ habits: [] })

  const blockText = blocks
    .map((b: any) => `${b.date} ${b.start}–${b.end}: ${b.name} (${b.type})`)
    .join('\n')

  const system = `You are a warm habit-detection assistant for minutely. Analyze the user's schedule from the past 14 days and find patterns.

Schedule data:
${blockText}

Look for:
- Blocks with the same or similar names appearing 3+ times
- Blocks appearing in similar time slots (within 60 minutes of each other)
- Weekly patterns (e.g., every Monday morning)

Return 2–4 habits as a JSON array:
[{
  "pattern": "what you observed",
  "suggestion": "warm suggestion",
  "confidence": "high|medium",
  "type": "the block type (focus/routine/study/free)"
}]

Return ONLY the JSON array. If no clear patterns exist, return [].`

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' })
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 500,
      system,
      messages: [{ role: 'user', content: 'Analyze my schedule for habit patterns' }],
    })
    const txt = (msg.content[0] as any).text ?? ''
    const a = txt.indexOf('[')
    const b = txt.lastIndexOf(']')
    if (a < 0 || b <= a) return res.json({ habits: [] })
    const raw = txt.slice(a, b + 1)
    const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/,(\s*[}\]])/g, '$1')
    const habits = JSON.parse(cleaned)
    return res.json({ habits })
  } catch (err: any) {
    return res.status(500).json({ error: String(err) })
  }
}
