import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const { blocks, mode, focus } = req.body || {}

  if (!blocks?.length) return res.json({ text: 'No blocks to summarise yet.' })

  const blockText = blocks
    .map((b: any) => `${b.date} ${b.start}-${b.end}: ${b.name} (${b.type})`)
    .join('\n')

  const system = `You are a thoughtful daily planner assistant for "minutely". Analyse the user's schedule and respond in structured markdown format. Use this exact structure:

## [One punchy headline about the day]

**Stats**
- [total time planned] across [N] blocks
- [X]h focus, [Y]h routine, etc.

**Highlights**
- [what's working well — 2-3 bullets]

**Watch out**
- [gaps, overlaps, or concerns — 1-2 bullets, omit section if none]

**Tip**
[One short actionable sentence]

Use ** for bold, - for bullets. Be concise and warm. Max 200 words.`

  const prompt =
    mode === 'day'
      ? `Today's focus: ${focus ?? '(none set)'}\nBlocks:\n${blockText}`
      : `Week blocks:\n${blockText}`

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' })
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 500,
      system,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = (msg.content[0] as any).text ?? 'Could not generate summary.'
    return res.json({ text })
  } catch (err: any) {
    return res.status(500).json({ error: String(err) })
  }
}
