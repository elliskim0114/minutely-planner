import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const { prompt, dayStart = '06:00', dayEnd = '23:00',
    userProfile, goals, recentEnergy } = req.body || {}

  if (!prompt?.trim()) return res.status(400).json({ error: 'prompt required' })

  const contextParts: string[] = []
  if (userProfile?.occupation) contextParts.push(`Occupation: ${userProfile.occupation}`)
  if (userProfile?.energyPattern) {
    const map: Record<string, string> = { morning: 'Morning (most productive early)', afternoon: 'Afternoon', evening: 'Evening (creative peak)', night: 'Night owl (best work late)' }
    contextParts.push(`Energy pattern: ${map[userProfile.energyPattern] || userProfile.energyPattern}`)
  }
  if (userProfile?.lifestyle?.length) contextParts.push(`Daily life includes: ${userProfile.lifestyle.map((l: string) => l.replace(/-/g, ' ')).join(', ')}`)
  if (userProfile?.challenges?.length) contextParts.push(`Scheduling challenges: ${userProfile.challenges.map((c: string) => c.replace(/-/g, ' ')).join(', ')}`)
  if (goals?.length) contextParts.push(`Current goals: ${goals.map((g: any) => `${g.name} (${g.targetHours}h/week)`).join(', ')}`)
  if (recentEnergy != null) {
    const desc = recentEnergy < 1 ? 'low' : recentEnergy < 2 ? 'moderate' : 'high'
    contextParts.push(`Recent energy level: ${desc} (${recentEnergy.toFixed(1)}/3)`)
  }
  if (userProfile?.bio) contextParts.push(`Additional context: ${userProfile.bio}`)

  const contextSection = contextParts.length > 0
    ? `\n\nUser profile:\n${contextParts.map((p: string) => `- ${p}`).join('\n')}`
    : ''

  const system = `You are an expert personal day planner. Generate a deeply personalized daily schedule as a JSON array. Each item: {name,type,start,end}. Types: focus (deep concentrated work), routine (habits/exercise/meals), study (learning), free (breaks/admin/buffer). Times in HH:MM 24hr format. Day runs ${dayStart} to ${dayEnd}. No overlaps. 6-10 blocks. Respect the user's energy pattern — schedule deep work when they're most productive. Account for their goals and lifestyle. If they have challenges like procrastination, build in accountability blocks. Make block names specific and personal, not generic (e.g. "morning run" not just "exercise"). Return ONLY the JSON array, nothing else.${contextSection}`

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' })
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 800,
      system,
      messages: [{ role: 'user', content: 'Create my perfect day schedule: ' + prompt }],
    })
    const txt = (msg.content[0] as any).text ?? ''
    const a = txt.indexOf('[')
    const b = txt.lastIndexOf(']')
    if (a < 0 || b <= a) throw new Error('no JSON array in response')
    const raw = txt.slice(a, b + 1)
    const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/,(\s*[}\]])/g, '$1')
    const schedule = JSON.parse(cleaned)
    return res.json(schedule)
  } catch (err: any) {
    return res.status(500).json({ error: String(err) })
  }
}
