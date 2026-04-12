import Anthropic from '@anthropic-ai/sdk'
import type { IncomingMessage, ServerResponse } from 'http'

function getClient(userKey?: string) {
  const key = userKey || process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY not set — add it in Settings or configure it on the server')
  return new Anthropic({ apiKey: key })
}

function cors(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.setHeader('Content-Type', 'application/json')
  res.statusCode = status
  res.end(JSON.stringify(data))
}

function parseJsonArray(txt: string) {
  const a = txt.indexOf('['), b = txt.lastIndexOf(']')
  if (a < 0 || b <= a) throw new Error('no JSON array in response')
  const raw = txt.slice(a, b + 1)
  return JSON.parse(raw.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/,(\s*[}\]])/g, '$1'))
}

function parseJsonObject(txt: string) {
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}')
  if (a < 0 || b <= a) throw new Error('no JSON in response')
  return JSON.parse(txt.slice(a, b + 1))
}

async function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}) } catch { resolve({}) }
    })
    req.on('error', reject)
  })
}

// ── Handlers ────────────────────────────────────────────────────────────────

async function handlePerfectDay(body: any, res: ServerResponse) {
  const { prompt, dayStart = '06:00', dayEnd = '23:00', userProfile, goals, recentEnergy, apiKey } = body
  if (!prompt?.trim()) return json(res, 400, { error: 'prompt required' })

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
  const contextSection = contextParts.length > 0 ? `\n\nUser profile:\n${contextParts.map(p => `- ${p}`).join('\n')}` : ''

  const system = `You are an expert personal day planner. Generate a deeply personalized daily schedule as a JSON array. Each item: {name,type,start,end}. Types: focus (deep concentrated work), routine (habits/exercise/meals), study (learning), free (breaks/admin/buffer). Times in HH:MM 24hr format. Day runs ${dayStart} to ${dayEnd}. No overlaps. 6-10 blocks. Respect the user's energy pattern — schedule deep work when they're most productive. Make block names specific and personal. Return ONLY the JSON array, nothing else.${contextSection}`

  const client = getClient(apiKey)
  const msg = await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, system, messages: [{ role: 'user', content: 'Create my perfect day schedule: ' + prompt }] })
  json(res, 200, parseJsonArray((msg.content[0] as any).text ?? ''))
}

async function handleCoach(body: any, res: ServerResponse) {
  const { blocks, date, mode, goals, priorities, energy, focusHours, apiKey } = body
  if (!blocks?.length) return json(res, 200, { suggestions: [{ text: 'Add some blocks to your day first, then I can give you feedback.', icon: '●' }] })

  const schedule = [...blocks].sort((a: any, b: any) => a.start.localeCompare(b.start))
    .map((b: any) => `${b.start}–${b.end}: ${b.name} (${b.type})`).join('\n')
  const goalsText = goals?.length ? goals.map((g: any) => `- ${g.name}: ${g.actualAmount}${g.targetUnit === 'minutes' ? 'min' : 'h'} / ${g.targetAmount}${g.targetUnit === 'minutes' ? 'min' : 'h'} (${g.targetPeriod})${g.description ? ` — ${g.description}` : ''}`).join('\n') : 'No goals set.'
  const contextText = [priorities?.length ? `Priorities: ${priorities.join(', ')}` : '', energy ? `Energy level: ${energy}` : ''].filter(Boolean).join('\n')

  const client = getClient(apiKey)

  if (mode === 'review') {
    const system = `You are a warm, honest productivity coach. Write a personal, conversational day review (3–5 short paragraphs) that acknowledges accomplishments, compares against goals, reflects on priorities, and gives 1–2 suggestions for tomorrow. Be warm and specific. No markdown headers — just flowing text.`
    const userContent = [`Today (${date}) schedule:\n${schedule}`, `\nGoals progress:\n${goalsText}`, contextText ? `\n${contextText}` : '', focusHours != null ? `\nTotal focus time: ${focusHours}h` : ''].join('')
    const msg = await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, system, messages: [{ role: 'user', content: userContent }] })
    return json(res, 200, { review: (msg.content[0] as any).text ?? '' })
  }

  const system = `You are a thoughtful productivity coach for minutely. Analyze the user's schedule and goals, then return a JSON array of 3–5 specific, actionable suggestions.\n\nReturn ONLY a JSON array where each item has:\n{\n  "text": "short suggestion (max 25 words, no markdown)",\n  "icon": "one symbol: ● ◎ ◈ ◐ ✦",\n  "action": { "type": "add_block", "name": "block name", "start": "HH:MM", "end": "HH:MM", "blockType": "routine" }\n}\n\nOnly include "action" when you recommend adding a SPECIFIC new block.`
  const userContent = [`My schedule for ${date}:\n${schedule}`, goals?.length ? `\nMy goals:\n${goalsText}` : '', contextText ? `\n${contextText}` : ''].join('')
  const msg = await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 600, system, messages: [{ role: 'user', content: userContent }] })
  json(res, 200, { suggestions: parseJsonArray((msg.content[0] as any).text ?? '') })
}

async function handleBuildDay(body: any, res: ServerResponse) {
  const { date, dayStart, dayEnd, energy, priorities, goals, existingBlocks, freeSlots, extraContext, apiKey } = body
  const energyLabels = ['', 'low', 'medium', 'high']
  const energyTxt = energy ? energyLabels[energy] || 'medium' : 'medium'
  const prioritiesTxt = priorities?.filter(Boolean).join(', ') || 'none specified'
  const goalsTxt = goals?.length ? goals.map((g: any) => `- ${g.name}${g.targetHours ? ` (target: ${g.targetHours}h, done: ${g.actualHours ?? 0}h)` : ''}`).join('\n') : 'none set'
  const existingTxt = existingBlocks?.length ? existingBlocks.map((b: any) => `${b.start}–${b.end}: ${b.name} (${b.type})`).join('\n') : 'none yet'
  const slotsTxt = freeSlots?.length ? freeSlots.map((s: any) => `${s.start}–${s.end} (${s.duration}min)`).join('\n') : 'all day is free'

  const system = `You are a smart day-design assistant for minutely.\n\nRules:\n- Only schedule into the FREE SLOTS listed — never overlap existing blocks\n- Energy: ${energyTxt} — ${energyTxt === 'low' ? 'keep it light' : energyTxt === 'high' ? 'front-load deep work' : 'mix focus and lighter tasks'}\n- Priorities must appear as blocks\n- Add 1–2 short break blocks (15–30min)\n- Each block: minimum 20min, maximum 120min. Round to nearest 15min.\n- Return 4–8 new blocks total\n\nDay: ${date}, ${dayStart}–${dayEnd}\nPriorities: ${prioritiesTxt}\nGoals: ${goalsTxt}\nExisting: ${existingTxt}\nFree slots: ${slotsTxt}${extraContext ? `\nExtra context: ${extraContext}` : ''}\n\nReturn ONLY a JSON array:\n[{"name":"block name","start":"HH:MM","end":"HH:MM","type":"focus|routine|study|free"}]`

  const client = getClient(apiKey)
  const msg = await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, system, messages: [{ role: 'user', content: 'Design my day.' }] })
  json(res, 200, parseJsonArray((msg.content[0] as any).text ?? ''))
}

async function handleFillSlots(body: any, res: ServerResponse) {
  const { description, freeSlots, existingBlocks, date, dayStart, dayEnd, apiKey } = body
  if (!description?.trim()) return json(res, 400, { error: 'description required' })
  const existingText = existingBlocks?.length ? existingBlocks.map((b: any) => `${b.start}–${b.end}: ${b.name} (${b.type})`).join('\n') : 'None yet'
  const slotsText = freeSlots?.length ? freeSlots.map((s: any) => `${s.start}–${s.end} (${s.duration}min free)`).join('\n') : 'No free slots'
  const system = `You are a warm scheduling assistant for minutely.\n\nDate: ${date}\nDay hours: ${dayStart}–${dayEnd}\n\nExisting schedule (DO NOT overlap):\n${existingText}\n\nFree slots:\n${slotsText}\n\nThe user wants to do: "${description}"\n\nReturn a JSON object:\n{\n  "blocks": [{"name":"task name","start":"HH:MM","end":"HH:MM","type":"focus|routine|study|free"}],\n  "message": "warm 1-2 sentence summary"\n}\n\nReturn ONLY the JSON object.`
  const client = getClient(apiKey)
  const msg = await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 700, system, messages: [{ role: 'user', content: description }] })
  json(res, 200, parseJsonObject((msg.content[0] as any).text ?? ''))
}

async function handleBreakdown(body: any, res: ServerResponse) {
  const { goal, totalHours, deadline, date, dayStart, dayEnd, existingWeekBlocks, apiKey } = body
  if (!goal?.trim()) return json(res, 400, { error: 'goal required' })
  const existingText = existingWeekBlocks?.length ? existingWeekBlocks.map((b: any) => `${b.date} ${b.start}–${b.end}: ${b.name}`).join('\n') : 'None yet'
  const system = `You are a warm planning assistant for minutely. Break down a goal into 3–6 specific focused work sessions.\n\nGoal: "${goal}"\n${totalHours ? `Total estimated hours: ${totalHours}h` : ''}\n${deadline ? `Deadline: ${deadline}` : ''}\nStarting from: ${date}\nDay hours: ${dayStart}–${dayEnd}\n\nExisting blocks (avoid conflicts):\n${existingText}\n\nReturn a JSON object:\n{\n  "blocks": [{"name":"specific session","start":"HH:MM","end":"HH:MM","date":"YYYY-MM-DD","type":"focus","note":"brief note"}],\n  "plan": "warm 2-3 sentence overview"\n}\n\nReturn ONLY the JSON object.`
  const client = getClient(apiKey)
  const msg = await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, system, messages: [{ role: 'user', content: `Break down: ${goal}` }] })
  json(res, 200, parseJsonObject((msg.content[0] as any).text ?? ''))
}

async function handleSummary(body: any, res: ServerResponse) {
  const { blocks, mode, focus, apiKey } = body
  if (!blocks?.length) return json(res, 200, { text: 'No blocks to summarise yet.' })
  const blockText = blocks.map((b: any) => `${b.date} ${b.start}-${b.end}: ${b.name} (${b.type})`).join('\n')
  const system = `You are a thoughtful daily planner assistant for "minutely". Analyse the user's schedule and respond in structured markdown. Use:\n\n## [One punchy headline]\n\n**Stats**\n- [totals]\n\n**Highlights**\n- [2-3 bullets]\n\n**Watch out**\n- [1-2 bullets, omit if none]\n\n**Tip**\n[One short actionable sentence]\n\nBe concise and warm. Max 200 words.`
  const prompt = mode === 'day' ? `Today's focus: ${focus ?? '(none set)'}\nBlocks:\n${blockText}` : `Week blocks:\n${blockText}`
  const client = getClient(apiKey)
  const msg = await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, system, messages: [{ role: 'user', content: prompt }] })
  json(res, 200, { text: (msg.content[0] as any).text ?? '' })
}

async function handleCapture(body: any, res: ServerResponse) {
  const { text, today, apiKey } = body
  if (!text?.trim()) return json(res, 400, { error: 'text required' })
  const system = `You are a scheduling assistant for minutely. Extract all events, meetings, tasks, and deadlines from the text. Today is ${today}.\n\nReturn a JSON array. Each item:\n{\n  "name":"event name",\n  "date":"YYYY-MM-DD",\n  "start":"HH:MM",\n  "end":"HH:MM",\n  "type":"focus|routine|study|free",\n  "confidence":"high|medium|low"\n}\n\nRules: resolve relative dates, estimate end times, set null for unknown times. Return ONLY the JSON array.`
  const client = getClient(apiKey)
  const msg = await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, system, messages: [{ role: 'user', content: text }] })
  json(res, 200, parseJsonArray((msg.content[0] as any).text ?? ''))
}

async function handleCaptureImage(body: any, res: ServerResponse) {
  const { image, mimeType, today, apiKey } = body
  if (!image) return json(res, 400, { error: 'image required' })
  const VALID_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  const safeMime = VALID_MIMES.includes(mimeType) ? mimeType : 'image/jpeg'
  const system = `You are a scheduling assistant for minutely. Extract all events from the image. Today is ${today}.\n\nReturn a JSON array. Each item:\n{\n  "name":"event name",\n  "date":"YYYY-MM-DD",\n  "start":"HH:MM",\n  "end":"HH:MM",\n  "type":"focus|routine|study|free",\n  "confidence":"high|medium|low"\n}\n\nReturn ONLY the JSON array.`
  const client = getClient(apiKey)
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 1024, system,
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: safeMime as any, data: image } }, { type: 'text', text: 'Extract all events from this image.' }] }],
  })
  let jsonStr = ((msg.content[0] as any).text ?? '').trim()
  if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
  json(res, 200, parseJsonArray(jsonStr))
}

async function handleReschedule(body: any, res: ServerResponse) {
  const { date, currentTime, blocks, apiKey } = body
  if (!blocks?.length) return json(res, 400, { error: 'blocks required' })
  const blockText = blocks.map((b: any) => `${b.start}–${b.end}: ${b.name} (${b.type})`).join('\n')
  const system = `You are a warm schedule assistant for minutely. Reschedule remaining blocks from ${currentTime} with 5-min gaps. Keep order and similar durations. Don't go past midnight.\n\nCurrent time: ${currentTime}\nDate: ${date}\n\nBlocks:\n${blockText}\n\nReturn ONLY a JSON object:\n{\n  "blocks":[{"name":"...","start":"HH:MM","end":"HH:MM","type":"..."}],\n  "reasoning":"warm 1-2 sentence explanation"\n}`
  const client = getClient(apiKey)
  const msg = await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 700, system, messages: [{ role: 'user', content: `Reschedule from ${currentTime}` }] })
  json(res, 200, parseJsonObject((msg.content[0] as any).text ?? ''))
}

async function handleWeeklyPlan(body: any, res: ServerResponse) {
  const { weekDates, existingBlocks, lastWeekBlocks, priorities, energy, apiKey } = body
  const weekStr = (weekDates || []).join(', ')
  const lastWeekText = lastWeekBlocks?.length ? lastWeekBlocks.map((b: any) => `${b.date} ${b.start}–${b.end}: ${b.name} (${b.type})`).join('\n') : 'No data from last week'
  const existingText = existingBlocks?.length ? existingBlocks.map((b: any) => `${b.date} ${b.start}–${b.end}: ${b.name} (${b.type})`).join('\n') : 'None yet'
  const system = `You are a warm weekly planning coach for minutely.\n\nWeek: ${weekStr}\nEnergy: ${energy}\nPriorities: ${priorities?.filter(Boolean).join(', ') || 'None set'}\n\nLast week:\n${lastWeekText}\n\nExisting this week:\n${existingText}\n\nReturn ONLY a JSON object:\n{\n  "reflection":"warm 2-sentence reflection on last week",\n  "plan":[{"date":"YYYY-MM-DD","name":"...","start":"HH:MM","end":"HH:MM","type":"focus|routine|study|free","reason":"one sentence"}],\n  "summary":"warm 2-sentence week overview"\n}`
  const client = getClient(apiKey)
  const msg = await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 1200, system, messages: [{ role: 'user', content: `Plan my week: ${weekStr}` }] })
  json(res, 200, parseJsonObject((msg.content[0] as any).text ?? ''))
}

async function handleHabits(body: any, res: ServerResponse) {
  const { blocks, apiKey } = body
  if (!blocks?.length) return json(res, 200, { habits: [] })
  const blockText = blocks.map((b: any) => `${b.date} ${b.start}–${b.end}: ${b.name} (${b.type})`).join('\n')
  const system = `You are a habit-detection assistant for minutely. Analyze the past 14 days and find patterns (same/similar names 3+ times, similar time slots).\n\nSchedule:\n${blockText}\n\nReturn 2–4 habits as a JSON array:\n[{"pattern":"what observed","suggestion":"warm suggestion","confidence":"high|medium","type":"focus|routine|study|free"}]\n\nReturn ONLY the JSON array. If no patterns, return [].`
  const client = getClient(apiKey)
  const msg = await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, system, messages: [{ role: 'user', content: 'Analyze my schedule for habits' }] })
  const txt = (msg.content[0] as any).text ?? ''
  const a = txt.indexOf('['), b = txt.lastIndexOf(']')
  if (a < 0 || b <= a) return json(res, 200, { habits: [] })
  const raw = txt.slice(a, b + 1)
  json(res, 200, { habits: JSON.parse(raw.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/,(\s*[}\]])/g, '$1')) })
}

async function handleManage(body: any, res: ServerResponse) {
  const { blocks, instruction, date, dayStart, dayEnd, apiKey } = body
  if (!blocks?.length) return json(res, 400, { error: 'blocks required' })
  if (!instruction?.trim()) return json(res, 400, { error: 'instruction required' })
  const blockText = blocks.map((b: any) => `[id:${b.id}] ${b.date} ${b.start}–${b.end}: ${b.name} (${b.type})`).join('\n')
  const system = `You are a schedule editor for minutely.\n\nToday: ${date}\nDay hours: ${dayStart}–${dayEnd}\n\nCurrent blocks:\n${blockText}\n\nUser instruction: "${instruction}"\n\nReturn the COMPLETE modified block list. Keep ids unchanged. No overlaps — cascade-shift if needed. New blocks get id > 100000.\n\nReturn ONLY a JSON object:\n{\n  "blocks":[{"id":number,"name":"...","start":"HH:MM","end":"HH:MM","date":"YYYY-MM-DD","type":"..."}],\n  "summary":"one warm sentence explaining changes"\n}`
  const client = getClient(apiKey)
  const msg = await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, system, messages: [{ role: 'user', content: instruction }] })
  json(res, 200, parseJsonObject((msg.content[0] as any).text ?? ''))
}

async function handleAnalyticsInsights(body: any, res: ServerResponse) {
  const { analytics, goals = [], apiKey } = body
  const focusSummary = analytics.focusHoursPerDay?.map((d: any) => `${d.label}: ${d.hours}h`).join(', ') ?? ''
  const typeSummary = Object.entries(analytics.typeBreakdown || {}).map(([t, m]: [string, any]) => `${t}: ${Math.round(m / 60 * 10) / 10}h`).join(', ')
  const healthSummary = analytics.healthScores?.map((d: any) => `${d.label}: ${d.grade}`).join(', ') ?? ''
  const goalsSummary = goals.length ? goals.map((g: any) => `${g.name}: ${g.actualHours}h/${g.targetHours}h (${g.pct}%)`).join(', ') : 'no goals set'
  const movedSummary = analytics.topMoved?.length ? analytics.topMoved.map(([n, c]: [string, number]) => `"${n}" moved ${c}x`).join(', ') : 'none'
  const avg = analytics.avgHealth ?? 0
  const grade = avg >= 90 ? 'A' : avg >= 75 ? 'B' : avg >= 60 ? 'C' : avg >= 45 ? 'D' : 'F'
  const system = `You are a scheduling coach for minutely. Provide 4-5 sharp, specific, actionable insights grounded in the user's actual numbers.\n\nReturn ONLY a JSON object:\n{\n  "insights":[{\n    "icon":"emoji",\n    "title":"short punchy title (5-7 words)",\n    "body":"2-3 sentences with specific data. End with one concrete recommendation.",\n    "prompt":"ready-to-use AI day builder prompt"\n  }]\n}`
  const userMsg = `Focus by day: ${focusSummary}\nTotal focus: ${analytics.weekFocusH}h\nBy type: ${typeSummary}\nHealth: ${healthSummary} (avg: ${grade})\nStreak: ${analytics.currentStreak} days\nMost rescheduled: ${movedSummary}\nGoals: ${goalsSummary}`
  const client = getClient(apiKey)
  const msg = await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 900, system, messages: [{ role: 'user', content: userMsg }] })
  json(res, 200, parseJsonObject((msg.content[0] as any).text ?? ''))
}

async function handleWhatNow(body: any, res: ServerResponse) {
  const { currentTime, todayBlocks, profileContext, extraContext, apiKey } = body
  const scheduleLines = (todayBlocks || []).map((b: any) => `${b.start}–${b.end}: ${b.name} (${b.type}${b.completed ? ', ' + b.completed : ''})`).join('\n')
  const system = `You are an in-the-moment productivity coach. The user is asking what to do RIGHT NOW at ${currentTime}.\n\nBe direct, warm, specific. Give:\n1. One sentence acknowledging their current situation\n2. 2–3 concrete actions for the next 30–60 minutes\n3. One short encouraging line\n\nUnder 160 words. No markdown headers or bullet symbols — just natural line breaks.${profileContext ? `\n\nUser profile: ${profileContext}` : ''}`
  const userMsg = `It is ${currentTime}. Today's schedule:\n${scheduleLines || 'No blocks scheduled today.'}${extraContext ? `\n\nUser says: "${extraContext}"` : ''}`
  const client = getClient(apiKey)
  const msg = await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, system, messages: [{ role: 'user', content: userMsg }] })
  json(res, 200, { message: (msg.content[0] as any).text?.trim() ?? '' })
}

const SB_URL = 'https://gggzfhgdwwqpjnerlpcc.supabase.co'
const SB_KEY = 'sb_publishable_sO8gdutgM-9CatUa56GQ3g_b9Hz5--Q'

async function handleVerifyOtp(body: any, res: ServerResponse) {
  const { email, token } = body
  if (!email || !token) return json(res, 400, { error: 'email and token required' })
  const r = await fetch(`${SB_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'email', email, token }),
  })
  const data = await r.json()
  json(res, r.status, data)
}

async function handleGetProfile(body: any, res: ServerResponse) {
  const { user_id, access_token } = body
  if (!user_id || !access_token) return json(res, 400, { error: 'user_id and access_token required' })
  const r = await fetch(
    `${SB_URL}/rest/v1/planner_profiles?user_id=eq.${user_id}&select=onboarding_completed,preferences&limit=1`,
    { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${access_token}` } }
  )
  if (!r.ok) return json(res, r.status, { error: 'profile fetch failed' })
  const rows = await r.json()
  json(res, 200, rows[0] ?? null)
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(res)
  if (req.method === 'OPTIONS') { res.statusCode = 200; res.end(); return }

  const url = (req as any).url ?? ''
  const path = url.split('?')[0].replace(/\/$/, '')

  if (req.method === 'GET') {
    return json(res, 200, { ok: true, key: !!process.env.ANTHROPIC_API_KEY })
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })

  let body: any
  try { body = await readBody(req) } catch { return json(res, 400, { error: 'invalid JSON body' }) }

  try {
    if (path === '/api/perfect-day') return await handlePerfectDay(body, res)
    if (path === '/api/coach') return await handleCoach(body, res)
    if (path === '/api/build-day') return await handleBuildDay(body, res)
    if (path === '/api/fill-slots') return await handleFillSlots(body, res)
    if (path === '/api/breakdown') return await handleBreakdown(body, res)
    if (path === '/api/summary') return await handleSummary(body, res)
    if (path === '/api/capture') return await handleCapture(body, res)
    if (path === '/api/capture-image') return await handleCaptureImage(body, res)
    if (path === '/api/reschedule') return await handleReschedule(body, res)
    if (path === '/api/weekly-plan') return await handleWeeklyPlan(body, res)
    if (path === '/api/habits') return await handleHabits(body, res)
    if (path === '/api/manage') return await handleManage(body, res)
    if (path === '/api/analytics-insights') return await handleAnalyticsInsights(body, res)
    if (path === '/api/what-now') return await handleWhatNow(body, res)
    if (path === '/api/verify-otp') return await handleVerifyOtp(body, res)
    if (path === '/api/get-profile') return await handleGetProfile(body, res)
    return json(res, 404, { error: 'not found' })
  } catch (err: any) {
    return json(res, 500, { error: String(err) })
  }
}
