import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const { blocks, date, mode, goals, priorities, energy, focusHours } = req.body || {}

  if (!blocks?.length) {
    return res.json({ suggestions: [{ text: 'Add some blocks to your day first, then I can give you feedback.', icon: '●' }] })
  }

  const schedule = [...blocks]
    .sort((a: any, b: any) => a.start.localeCompare(b.start))
    .map((b: any) => `${b.start}–${b.end}: ${b.name} (${b.type})`)
    .join('\n')

  const goalsText = goals?.length
    ? goals.map((g: any) => `- ${g.name}: ${g.actualAmount}${g.targetUnit === 'minutes' ? 'min' : 'h'} / ${g.targetAmount}${g.targetUnit === 'minutes' ? 'min' : 'h'} (${g.targetPeriod})${g.description ? ` — ${g.description}` : ''}`).join('\n')
    : 'No goals set.'

  const contextText = [
    priorities?.length ? `Priorities: ${priorities.join(', ')}` : '',
    energy ? `Energy level: ${energy}` : '',
  ].filter(Boolean).join('\n')

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' })
    const client = new Anthropic({ apiKey })

    if (mode === 'review') {
      const system = `You are a warm, honest productivity coach. The user is reviewing their day. Write a personal, conversational day review (3–5 short paragraphs) that:
1. Acknowledges what they accomplished today based on their blocks
2. Compares their actual focus/work against their goals progress — be specific about which goals they moved forward on
3. Reflects on whether their priorities were addressed
4. Gives 1–2 kind, actionable suggestions for tomorrow
Be warm and specific. Reference actual block names and goal names. No markdown, no headers — just flowing text as if talking to them.`

      const userContent = [
        `Today (${date}) schedule:\n${schedule}`,
        `\nGoals progress:\n${goalsText}`,
        contextText ? `\n${contextText}` : '',
        focusHours != null ? `\nTotal focus time: ${focusHours}h` : '',
      ].join('')

      const msg = await client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 500,
        system,
        messages: [{ role: 'user', content: userContent }],
      })
      const review = (msg.content[0] as any).text ?? ''
      return res.json({ review })
    }

    // Default: analyze mode
    const system = `You are a thoughtful productivity coach for minutely, a day planner. Analyze the user's schedule and goals, then return a JSON array of 3–5 specific, actionable suggestions.

Consider: back-to-back focus blocks with no break (>90 min continuous), missing breaks, energy pacing, goal progress gaps, whether priorities are blocked in the schedule.

Return ONLY a JSON array where each item has:
{
  "text": "short suggestion (max 25 words, no markdown)",
  "icon": "one symbol: ● ◎ ◈ ◐ ✦",
  "action": { // ONLY include if you can specify exact new block details
    "type": "add_block",
    "name": "block name",
    "start": "HH:MM",
    "end": "HH:MM",
    "blockType": "routine"
  }
}

For "action": only include it when you recommend adding a SPECIFIC new block at a currently empty time. Be warm and precise.`

    const userContent = [
      `My schedule for ${date}:\n${schedule}`,
      goals?.length ? `\nMy goals:\n${goalsText}` : '',
      contextText ? `\n${contextText}` : '',
    ].join('')

    const msg = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: userContent }],
    })
    const txt = (msg.content[0] as any).text ?? ''
    const a = txt.indexOf('[')
    const b = txt.lastIndexOf(']')
    if (a < 0 || b <= a) throw new Error('no JSON array')
    const raw = txt.slice(a, b + 1)
    const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/,(\s*[}\]])/g, '$1')
    const suggestions = JSON.parse(cleaned)
    return res.json({ suggestions })
  } catch (err: any) {
    return res.status(500).json({ error: String(err) })
  }
}
