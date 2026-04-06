import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const { analytics, goals = [] } = req.body || {}

  const focusSummary = analytics.focusHoursPerDay
    ?.map((d: any) => `${d.label}: ${d.hours}h focus`)
    .join(', ') ?? ''

  const typeSummary = Object.entries(analytics.typeBreakdown || {})
    .map(([t, m]: [string, any]) => `${t}: ${Math.round(m / 60 * 10) / 10}h`)
    .join(', ')

  const healthSummary = analytics.healthScores
    ?.map((d: any) => `${d.label}: ${d.grade}`)
    .join(', ') ?? ''

  const goalsSummary = goals.length
    ? goals.map((g: any) => `${g.name}: ${g.actualHours}h / ${g.targetHours}h target (${g.pct}%)`).join(', ')
    : 'no goals set'

  const movedSummary = analytics.topMoved?.length
    ? analytics.topMoved.map(([n, c]: [string, number]) => `"${n}" moved ${c}x`).join(', ')
    : 'none'

  const avgHealth = analytics.avgHealth ?? 0
  const avgGrade = avgHealth >= 90 ? 'A' : avgHealth >= 75 ? 'B' : avgHealth >= 60 ? 'C' : avgHealth >= 45 ? 'D' : 'F'

  const system = `You are a thoughtful scheduling coach for "minutely", a time-blocking productivity app. Analyze the user's weekly scheduling data and provide 4-5 sharp, specific, actionable insights. Each insight must be directly grounded in their actual numbers.

Return a JSON object:
{
  "insights": [
    {
      "icon": "emoji",
      "title": "short punchy title (5-7 words)",
      "body": "2-3 sentences grounded in their specific data. Reference actual numbers. End with one concrete recommendation.",
      "prompt": "a ready-to-use prompt the user can send to the AI day builder (e.g. 'Schedule 2h of deep focus every morning Mon-Fri')"
    }
  ]
}

Guidelines:
- Be direct and specific. Say "your Mon/Tue sessions at 2.5h are your sweet spot" not "some days are better"
- Mix types: scheduling pattern, energy alignment, goal gap, balance observation, something to try this week
- The "prompt" field should be an actionable scheduling instruction the user can one-click apply
- Return ONLY the JSON object, no markdown`

  const userMsg = `My weekly data:
Focus by day: ${focusSummary}
Total focus this week: ${analytics.weekFocusH}h
Time by type: ${typeSummary}
Plan health: ${healthSummary} (avg: grade ${avgGrade})
Focus streak: ${analytics.currentStreak} days
Most rescheduled: ${movedSummary}
Goals: ${goalsSummary}`

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' })
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 900,
      system,
      messages: [{ role: 'user', content: userMsg }],
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
