import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const { currentTime, todayBlocks, profileContext, extraContext } = req.body || {}

  const scheduleLines = (todayBlocks || [])
    .map((b: any) => `${b.start}–${b.end}: ${b.name} (${b.type}${b.completed ? ', ' + b.completed : ''})`)
    .join('\n')

  const systemPrompt = `You are an in-the-moment productivity coach for a day planner app. The user is asking what they should do RIGHT NOW at ${currentTime}.

Be direct, warm, specific. Give:
1. One sentence acknowledging their exact current situation (what block they're in, if any)
2. 2–3 concrete, specific actions for the next 30–60 minutes
3. One short encouraging line

Keep the total response under 160 words. Do not use markdown headers or bullet symbols — just write naturally, using line breaks between the 3 parts.${profileContext ? `\n\nUser profile: ${profileContext}` : ''}`

  const userMsg = `It is ${currentTime}. Here is today's schedule:\n${scheduleLines || 'No blocks scheduled today.'}${extraContext ? `\n\nUser says: "${extraContext}"` : ''}`

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' })
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    })
    const message = (msg.content[0] as any).text?.trim() ?? ''
    return res.json({ message })
  } catch (err: any) {
    return res.status(500).json({ error: String(err) })
  }
}
