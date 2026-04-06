import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const { date, currentTime, blocks } = req.body || {}

  if (!blocks?.length) return res.status(400).json({ error: 'blocks required' })

  const blockText = blocks
    .map((b: any) => `${b.start}–${b.end}: ${b.name} (${b.type})`)
    .join('\n')

  const system = `You are a warm, practical schedule assistant for minutely. The user is running late and needs their remaining schedule reshuffled.

Current time: ${currentTime}
Date: ${date}

Remaining blocks to reschedule:
${blockText}

Reschedule these blocks starting from ${currentTime} with realistic 5-minute gaps between them. Keep the same order where possible. Keep durations similar to the originals. Don't push anything past midnight.

Return a JSON object with two fields:
{
  "blocks": [{"name": "...", "start": "HH:MM", "end": "HH:MM", "type": "..."}],
  "reasoning": "a warm, 1-2 sentence explanation of what you changed and why"
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
      messages: [{ role: 'user', content: `Reschedule my remaining blocks from ${currentTime}` }],
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
