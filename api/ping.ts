import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req: any, res: any) {
  const hasKey = !!process.env.ANTHROPIC_API_KEY
  const keyPrefix = hasKey ? process.env.ANTHROPIC_API_KEY!.slice(0, 12) + '…' : null

  if (!hasKey) {
    return res.status(200).json({ ok: false, reason: 'ANTHROPIC_API_KEY not set in Vercel env vars', keyPrefix: null })
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Say "ok"' }],
    })
    const text = (msg.content[0] as any).text
    return res.status(200).json({ ok: true, keyPrefix, anthropicResponse: text })
  } catch (err: any) {
    return res.status(200).json({ ok: false, keyPrefix, anthropicError: String(err) })
  }
}
