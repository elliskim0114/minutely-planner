import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { supabase, supabaseConfigured } from '../supabase'
import type { Config, UserProfile } from '../types'

const TIMEZONES = [
  { label: 'auto-detect (system)', value: '' },
  { label: 'UTC', value: 'UTC' },
  { label: 'US — Honolulu (HST)', value: 'Pacific/Honolulu' },
  { label: 'US — Anchorage (AKST)', value: 'America/Anchorage' },
  { label: 'US — Los Angeles (PST/PDT)', value: 'America/Los_Angeles' },
  { label: 'US — Denver (MST/MDT)', value: 'America/Denver' },
  { label: 'US — Chicago (CST/CDT)', value: 'America/Chicago' },
  { label: 'US — New York (EST/EDT)', value: 'America/New_York' },
  { label: 'Canada — Toronto (EST/EDT)', value: 'America/Toronto' },
  { label: 'Canada — Vancouver (PST/PDT)', value: 'America/Vancouver' },
  { label: 'Mexico — Mexico City (CST/CDT)', value: 'America/Mexico_City' },
  { label: 'Brazil — São Paulo (BRT)', value: 'America/Sao_Paulo' },
  { label: 'Argentina — Buenos Aires (ART)', value: 'America/Argentina/Buenos_Aires' },
  { label: 'UK — London (GMT/BST)', value: 'Europe/London' },
  { label: 'France — Paris (CET/CEST)', value: 'Europe/Paris' },
  { label: 'Germany — Berlin (CET/CEST)', value: 'Europe/Berlin' },
  { label: 'Sweden — Stockholm (CET/CEST)', value: 'Europe/Stockholm' },
  { label: 'Finland — Helsinki (EET/EEST)', value: 'Europe/Helsinki' },
  { label: 'Greece — Athens (EET/EEST)', value: 'Europe/Athens' },
  { label: 'Turkey — Istanbul (TRT)', value: 'Europe/Istanbul' },
  { label: 'Russia — Moscow (MSK)', value: 'Europe/Moscow' },
  { label: 'South Africa — Johannesburg (SAST)', value: 'Africa/Johannesburg' },
  { label: 'Nigeria — Lagos (WAT)', value: 'Africa/Lagos' },
  { label: 'Egypt — Cairo (EET)', value: 'Africa/Cairo' },
  { label: 'UAE — Dubai (GST)', value: 'Asia/Dubai' },
  { label: 'Israel — Jerusalem (IST)', value: 'Asia/Jerusalem' },
  { label: 'India — Mumbai (IST)', value: 'Asia/Kolkata' },
  { label: 'Bangladesh — Dhaka (BST)', value: 'Asia/Dhaka' },
  { label: 'Thailand — Bangkok (ICT)', value: 'Asia/Bangkok' },
  { label: 'Vietnam — Ho Chi Minh (ICT)', value: 'Asia/Ho_Chi_Minh' },
  { label: 'China — Shanghai (CST)', value: 'Asia/Shanghai' },
  { label: 'Hong Kong (HKT)', value: 'Asia/Hong_Kong' },
  { label: 'Singapore (SGT)', value: 'Asia/Singapore' },
  { label: 'Japan — Tokyo (JST)', value: 'Asia/Tokyo' },
  { label: 'South Korea — Seoul (KST)', value: 'Asia/Seoul' },
  { label: 'Australia — Perth (AWST)', value: 'Australia/Perth' },
  { label: 'Australia — Sydney (AEST/AEDT)', value: 'Australia/Sydney' },
  { label: 'New Zealand — Auckland (NZST/NZDT)', value: 'Pacific/Auckland' },
]

const OCCUPATION_PRESETS = [
  'software engineer', 'designer', 'student', 'freelancer',
  'founder / entrepreneur', 'manager', 'researcher', 'teacher',
]

const LIFESTYLE_OPTS = [
  { label: 'daily exercise', value: 'exercise', icon: '🏃' },
  { label: 'deep work blocks', value: 'deep-work', icon: '🎯' },
  { label: 'lots of meetings', value: 'meetings', icon: '📅' },
  { label: 'family time', value: 'family', icon: '🏠' },
  { label: 'daily commute', value: 'commute', icon: '🚇' },
  { label: 'meditation / mindfulness', value: 'meditation', icon: '🧘' },
  { label: 'side projects', value: 'side-projects', icon: '🚀' },
  { label: 'creative work', value: 'creative', icon: '🎨' },
]

const CHALLENGE_OPTS = [
  { label: 'procrastination', value: 'procrastination', icon: '⏳' },
  { label: 'too many meetings', value: 'too-many-meetings', icon: '📞' },
  { label: 'easily distracted', value: 'distractions', icon: '📱' },
  { label: 'overcommitting', value: 'overcommitting', icon: '📋' },
  { label: 'unpredictable days', value: 'unpredictable', icon: '🌀' },
  { label: 'burnout / low energy', value: 'burnout', icon: '🔋' },
]

const ENERGY_OPTS: Array<{ v: UserProfile['energyPattern']; label: string; icon: string }> = [
  { v: 'morning',   label: 'morning person',   icon: '🌅' },
  { v: 'afternoon', label: 'afternoon focused', icon: '☀️' },
  { v: 'evening',   label: 'evening creative',  icon: '🌇' },
  { v: 'night',     label: 'night owl',         icon: '🌙' },
]

// ── Coach tab: step-by-step wizard ─────────────────────────────
const COACH_STEPS = 5

interface CoachStepProps {
  step: number
  occupation: string; setOccupation: (v: string) => void
  energyPattern: UserProfile['energyPattern'] | null; setEnergyPattern: (v: UserProfile['energyPattern'] | null) => void
  lifestyle: Set<string>; toggleLifestyle: (v: string) => void
  challenges: Set<string>; toggleChallenge: (v: string) => void
  bio: string; setBio: (v: string) => void
}

function CoachStep(p: CoachStepProps) {
  if (p.step === 0) return (
    <div className="sm-coach-step">
      <div className="sm-coach-q">what do you do?</div>
      <div className="sm-coach-hint">your coach uses this to shape your schedule</div>
      <input
        className="sm-inp sm-coach-inp"
        type="text"
        value={p.occupation}
        onChange={e => p.setOccupation(e.target.value)}
        placeholder="e.g. software engineer, student, freelancer…"
        autoFocus
      />
      <div className="sm-chip-row">
        {OCCUPATION_PRESETS.map(preset => (
          <button
            key={preset}
            className={`sm-chip${p.occupation === preset ? ' active' : ''}`}
            onClick={() => p.setOccupation(p.occupation === preset ? '' : preset)}
          >{preset}</button>
        ))}
      </div>
    </div>
  )

  if (p.step === 1) return (
    <div className="sm-coach-step">
      <div className="sm-coach-q">when are you most productive?</div>
      <div className="sm-coach-hint">deep work gets scheduled around your peak hours</div>
      <div className="sm-energy-grid">
        {ENERGY_OPTS.map(opt => (
          <button
            key={opt.v}
            className={`sm-energy-card${p.energyPattern === opt.v ? ' active' : ''}`}
            onClick={() => p.setEnergyPattern(p.energyPattern === opt.v ? null : opt.v)}
          >
            <span className="sm-energy-icon">{opt.icon}</span>
            <span className="sm-energy-lbl">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  )

  if (p.step === 2) return (
    <div className="sm-coach-step">
      <div className="sm-coach-q">what's typically part of your day?</div>
      <div className="sm-coach-hint">pick everything that applies — your coach will fit these in</div>
      <div className="sm-chip-row sm-chip-row-lg">
        {LIFESTYLE_OPTS.map(opt => (
          <button
            key={opt.value}
            className={`sm-chip${p.lifestyle.has(opt.value) ? ' active' : ''}`}
            onClick={() => p.toggleLifestyle(opt.value)}
          >{opt.icon} {opt.label}</button>
        ))}
      </div>
    </div>
  )

  if (p.step === 3) return (
    <div className="sm-coach-step">
      <div className="sm-coach-q">what gets in the way?</div>
      <div className="sm-coach-hint">your coach will build in guardrails for these</div>
      <div className="sm-chip-row sm-chip-row-lg">
        {CHALLENGE_OPTS.map(opt => (
          <button
            key={opt.value}
            className={`sm-chip${p.challenges.has(opt.value) ? ' active' : ''}`}
            onClick={() => p.toggleChallenge(opt.value)}
          >{opt.icon} {opt.label}</button>
        ))}
      </div>
    </div>
  )

  if (p.step === 4) return (
    <div className="sm-coach-step">
      <div className="sm-coach-q">anything else your coach should know?</div>
      <div className="sm-coach-hint">the more context, the more personal your days will be</div>
      <textarea
        className="sm-inp sm-coach-bio"
        placeholder="e.g. I have a 1-year-old, I work from home, I'm trying to write a novel on the side…"
        value={p.bio}
        onChange={e => p.setBio(e.target.value)}
        autoFocus
      />
    </div>
  )

  return null
}

// ── Main modal ──────────────────────────────────────────────────
type Tab = 'profile' | 'coach' | 'rewards'

const TYPE_ICON_OPTIONS: Record<string, string[]> = {
  focus:   ['🎯','💻','🔥','⚡','🧠','✍️','🏋️','🔬'],
  routine: ['⚡','🌅','☕','🏃','🍎','🚿','🧘','💊'],
  study:   ['📖','📚','🎓','✏️','🔭','💡','🗒️','🧩'],
  free:    ['☁️','🌿','🎮','🎵','☕','🌙','🛋️','🌊'],
}

const LABEL_EMOJI_KEYWORD_SETS: Array<{ keywords: string[]; emojis: string[] }> = [
  { keywords: ['school','class','homework','lesson','lecture','course','teacher','grade','campus'], emojis: ['🏫','📚','✏️','🎒','📐','🖊️','🎓','📝','🔬','💡','📏','🗒️','🖍️','📌'] },
  { keywords: ['club','team','sport','soccer','basket','football','swim','gym','practice','match','game'], emojis: ['🏆','⚽','🏀','🏈','🎽','🥊','🏊','🧗','🛹','🎾','🏐','🥋','🤸','🎯'] },
  { keywords: ['meal','eat','food','lunch','dinner','breakfast','cook','snack','coffee','boba','cafe','kitchen'], emojis: ['🍽️','🥗','🍜','🍕','🥘','🫕','🍱','☕','🧁','🥐','🍳','🫙','🫖','🥑'] },
  { keywords: ['hang','friend','social','chill','vibe','chat','meet','call','date','catch'], emojis: ['🧑‍🤝‍🧑','💬','🎉','🫂','🤙','🍹','🎲','🪄','😄','🪩','🤳','🛋️','🥂','🌟'] },
  { keywords: ['work','job','office','meeting','client','professional','career','business','email'], emojis: ['💼','🖥️','📊','📋','🤝','📞','🗂️','✅','📧','💡','🗓️','🏢','📎','🖨️'] },
  { keywords: ['event','special','celebration','party','birthday','occasion','wedding','holiday','festival'], emojis: ['🎉','🎊','🎂','🥂','✨','🎁','🪅','🎆','🎗️','🌟','🪄','🎈','🍾','🎀'] },
  { keywords: ['brain','rot','scroll','doom','meme','tiktok','youtube','show','tv','series','movie','watch','netflix'], emojis: ['📱','🤳','😵‍💫','🎮','🛌','🍿','😂','🌀','📺','🧸','🛁','😅','🌚','💀'] },
  { keywords: ['health','gym','workout','fitness','exercise','run','swim','walk','yoga','meditat'], emojis: ['💪','🏃','🧘','❤️‍🔥','🥊','🏊','🚴','🩺','🥗','🫀','🩹','🏋️','🌿','💦'] },
  { keywords: ['music','song','listen','band','concert','piano','guitar','sing','record','drum'], emojis: ['🎵','🎸','🎹','🎤','🥁','🎻','🎺','🎧','🎼','🎙️','🎶','🎷','🪗','🪘'] },
  { keywords: ['read','book','write','journal','blog','story','author','novel','poetry','essay'], emojis: ['📖','✍️','📝','🖊️','📰','📓','🗒️','📜','🖋️','📚','🔖','📕','🪶','📰'] },
  { keywords: ['art','draw','paint','design','sketch','create','craft','photo','film','video'], emojis: ['🎨','✏️','🖌️','🖼️','📸','🎬','🪡','✂️','🖍️','🪆','🎭','🪴','🗿','🧵'] },
  { keywords: ['travel','trip','fly','drive','commute','walk','bike','hike','camp','road'], emojis: ['✈️','🚗','🚂','🚲','🏕️','🗺️','🧭','🎒','🌍','⛰️','🏖️','🚢','🛤️','🌄'] },
  { keywords: ['volunteer','charity','help','community','church','mosque','temple','service','donate'], emojis: ['🤝','❤️','🌱','🕊️','⭐','🏘️','🫶','💛','🌻','🕌','⛪','🙏','🌈','💝'] },
  { keywords: ['project','build','code','dev','app','software','hack','program','tech','ai'], emojis: ['💻','🛠️','⚙️','🔧','🧩','🚀','🤖','💾','🖥️','📡','🧬','🔌','🪛','💡'] },
]

const LABEL_EMOJI_FALLBACK = ['⭐','🌈','💫','🔮','🌊','🌸','🌀','🎯','🦋','🌙','🔑','🌟','🎪','🫧','🪬','✨']

function getCustomLabelEmojis(label: string): string[] {
  const lower = label.toLowerCase()
  for (const set of LABEL_EMOJI_KEYWORD_SETS) {
    if (set.keywords.some(k => lower.includes(k))) return set.emojis
  }
  return LABEL_EMOJI_FALLBACK
}

export default function SettingsModal() {
  const {
    closeSettings, cfg, setCfg, userName, setUserName, mode,
    focusGems, unlockedModes, unlockedCelebrations,
    setMode, triggerCelebration, userProfile, setUserProfile,
    signOut, deleteAccount, typeIcons, setTypeIcon, customLabels,
    notifSettings, toggleNotif, setPushTime,
  } = useStore()

  const [tab, setTab] = useState<Tab>('profile')
  const [saved, setSaved] = useState(false)
  const [iconPickerOpen, setIconPickerOpen] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  // Profile tab state
  const [nameDraft, setNameDraft]   = useState(userName || '')
  const [cfgDraft, setCfgDraft]     = useState<Config>({ ...cfg })

  // Coach tab state
  const [coachStep, setCoachStep]           = useState(0)
  const [occupation, setOccupation]         = useState(userProfile?.occupation || '')
  const [energyPattern, setEnergyPattern]   = useState<UserProfile['energyPattern'] | null>(userProfile?.energyPattern || null)
  const [lifestyle, setLifestyle]           = useState<Set<string>>(new Set(userProfile?.lifestyle || []))
  const [challenges, setChallenges]         = useState<Set<string>>(new Set(userProfile?.challenges || []))
  const [bio, setBio]                       = useState(userProfile?.bio || '')
  const [coachSaved, setCoachSaved]         = useState(false)
  const [showUpdateWizard, setShowUpdateWizard] = useState(false)

  const toggleLifestyle = (v: string) => setLifestyle(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n })
  const toggleChallenge = (v: string) => setChallenges(p => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSettings() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [closeSettings])

  const saveProfile = () => {
    if (nameDraft.trim()) setUserName(nameDraft.trim())
    setCfg(cfgDraft)
    setSaved(true)
    setTimeout(() => { setSaved(false); closeSettings() }, 800)
  }

  const saveCoach = () => {
    const hasData = occupation.trim() || energyPattern || lifestyle.size > 0 || challenges.size > 0 || bio.trim()
    setUserProfile(hasData ? {
      occupation: occupation.trim(),
      energyPattern: energyPattern || 'morning',
      lifestyle: [...lifestyle],
      challenges: [...challenges],
      bio: bio.trim(),
    } : null)
    setCoachSaved(true)
    setTimeout(() => setCoachSaved(false), 1800)
  }

  const gemMilestones: Array<{
    gems: number; reward: string; emoji: string
    type: 'theme' | 'animal' | 'legendary'
    unlocked: boolean; themeKey?: string; animalKey?: string
  }> = [
    { gems: 5,   reward: 'ember theme',        emoji: '🔥', type: 'theme',     unlocked: unlockedModes.includes('ember'),  themeKey: 'ember' },
    { gems: 10,  reward: 'unicorn',             emoji: '🦄', type: 'animal',    unlocked: (unlockedCelebrations || []).includes('unicorn'), animalKey: 'unicorn' },
    { gems: 12,  reward: 'ocean theme',         emoji: '🌊', type: 'theme',     unlocked: unlockedModes.includes('ocean'),  themeKey: 'ocean' },
    { gems: 20,  reward: 'forest theme + fox',  emoji: '🌿', type: 'theme',     unlocked: unlockedModes.includes('forest'), themeKey: 'forest' },
    { gems: 35,  reward: 'aurora theme + meteor',   emoji: '🌠', type: 'theme',     unlocked: unlockedModes.includes('aurora'),  themeKey: 'aurora' },
    { gems: 50,  reward: 'dragon + crimson theme',  emoji: '🐉', type: 'theme',     unlocked: unlockedModes.includes('crimson'), themeKey: 'crimson' },
    { gems: 75,  reward: 'nebula theme + rocket',   emoji: '🚀', type: 'theme',     unlocked: unlockedModes.includes('nebula'),  themeKey: 'nebula' },
    { gems: 100, reward: 'gold theme + golden goose', emoji: '🪿', type: 'theme', unlocked: unlockedModes.includes('gold'), themeKey: 'gold', animalKey: 'goldengoose' },
  ]

  return (
    <div className="sm-overlay" onClick={e => { if (e.target === e.currentTarget) closeSettings() }}>
      <div className="sm-panel">

        {/* Header */}
        <div className="sm-hdr">
          <div className="sm-hdr-left">
            <div className="sm-avatar">{(userName || 'U')[0].toUpperCase()}</div>
            <div>
              <div className="sm-hdr-name">{userName || 'your profile'}</div>
              {focusGems >= 100
                ? <div className="sm-hdr-master">✦ focus master</div>
                : <div className="sm-hdr-sub">settings & preferences</div>
              }
            </div>
          </div>
          <button className="sm-close" onClick={closeSettings}>×</button>
        </div>

        {/* Tabs */}
        <div className="sm-tabs">
          {(['profile', 'coach', 'rewards'] as Tab[]).map(t => (
            <button
              key={t}
              className={`sm-tab${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'profile' && '⚙ '}
              {t === 'coach'   && '✦ '}
              {t === 'rewards' && '◆ '}
              {t}
            </button>
          ))}
        </div>

        {/* ── Tab: profile ── */}
        {tab === 'profile' && (
          <div className="sm-body">
            <div className="sm-section">
              <div className="sm-sec-label">profile</div>
              <div className="sm-field">
                <label className="sm-lbl">your name</label>
                <input
                  className="sm-inp"
                  type="text"
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveProfile() }}
                  placeholder="how should we call you?"
                  autoFocus
                />
              </div>
            </div>

            <div className="sm-section">
              <div className="sm-sec-label">your day</div>
              <div className="sm-fields-row">
                <div className="sm-field">
                  <label className="sm-lbl">day starts</label>
                  <input className="sm-inp sm-inp-time" type="time" value={cfgDraft.ds}
                    onChange={e => setCfgDraft(d => ({ ...d, ds: e.target.value }))} />
                </div>
                <div className="sm-field">
                  <label className="sm-lbl">day ends</label>
                  <input className="sm-inp sm-inp-time" type="time" value={cfgDraft.de}
                    onChange={e => setCfgDraft(d => ({ ...d, de: e.target.value }))} />
                </div>
              </div>
            </div>

            <div className="sm-section">
              <div className="sm-sec-label">timezone</div>
              <div className="sm-field">
                <label className="sm-lbl">your location</label>
                <select className="sm-inp sm-select" value={cfgDraft.tz || ''}
                  onChange={e => setCfgDraft(d => ({ ...d, tz: e.target.value || undefined }))}>
                  {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </div>
            </div>

            <div className="sm-section">
              <div className="sm-sec-label">
                block type icons
                <span className="sm-sec-hint">shown in analytics & stats</span>
              </div>
              {([...(['focus', 'routine', 'study', 'free'] as const), ...customLabels]).map(type => {
                const emojis = (['focus','routine','study','free'] as string[]).includes(type)
                  ? TYPE_ICON_OPTIONS[type as keyof typeof TYPE_ICON_OPTIONS]
                  : getCustomLabelEmojis(type)
                return (
                  <div key={type} className="sm-icon-row">
                    <span className="sm-icon-type">{type}</span>
                    <div className="sm-icon-picker-wrap">
                      <button
                        className="sm-icon-trigger"
                        title="change icon"
                        onClick={() => setIconPickerOpen(iconPickerOpen === type ? null : type)}
                      >{typeIcons[type] || '·'}</button>
                      {iconPickerOpen === type && (
                        <>
                          <div className="sm-icon-picker-backdrop" onClick={() => setIconPickerOpen(null)} />
                          <div className="sm-icon-popover">
                            {emojis.map(emoji => (
                              <button
                                key={emoji}
                                className={`sm-icon-btn${typeIcons[type] === emoji ? ' active' : ''}`}
                                onClick={() => { setTypeIcon(type, emoji); setIconPickerOpen(null) }}
                              >{emoji}</button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="sm-section">
              <div className="sm-sec-label">daily summary</div>
              <div className="sm-notif-card">
                <div className="sm-notif-row">
                  <div className="sm-notif-info">
                    <span className="sm-notif-title">morning reminder</span>
                    <span className="sm-notif-sub">push notification each morning with your day plan</span>
                  </div>
                  <button
                    className={`sm-switch${notifSettings.pushEnabled ? ' on' : ''}`}
                    onClick={async () => {
                      const enabling = !notifSettings.pushEnabled
                      if (enabling) {
                        const perm = await Notification.requestPermission()
                        if (perm !== 'granted') return
                        const reg = await navigator.serviceWorker.ready
                        const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
                        const sub = await reg.pushManager.subscribe({
                          userVisibleOnly: true,
                          applicationServerKey: vapidKey,
                        })
                        await fetch('/api/subscribe-push', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            subscription: sub.toJSON(),
                            notifyTime: notifSettings.pushTime,
                            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                          }),
                        })
                      } else {
                        const reg = await navigator.serviceWorker.ready
                        const sub = await reg.pushManager.getSubscription()
                        if (sub) {
                          await fetch('/api/unsubscribe-push', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ endpoint: sub.endpoint }),
                          })
                          await sub.unsubscribe()
                        }
                      }
                      toggleNotif('pushEnabled')
                    }}
                    aria-label="toggle morning reminder"
                  ><span className="sm-switch-knob" /></button>
                </div>
                {notifSettings.pushEnabled && (
                  <div className="sm-notif-time-row">
                    <span className="sm-lbl">send at</span>
                    <input
                      className="sm-inp sm-inp-time sm-notif-time-inp"
                      type="time"
                      value={notifSettings.pushTime}
                      onChange={e => setPushTime(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="sm-section">
              <div className="sm-sec-label">display</div>
              <div className="sm-fields-row">
                <div className="sm-field">
                  <label className="sm-lbl">time format</label>
                  <div className="sm-seg">
                    {(['12', '24'] as const).map(tf => (
                      <button key={tf} className={`sm-seg-btn${cfgDraft.tf === tf ? ' active' : ''}`}
                        onClick={() => setCfgDraft(d => ({ ...d, tf }))}>
                        {tf === '12' ? '12h' : '24h'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="sm-field">
                  <label className="sm-lbl">week starts</label>
                  <div className="sm-seg">
                    {([0, 1] as const).map(ws => (
                      <button key={ws} className={`sm-seg-btn${cfgDraft.ws === ws ? ' active' : ''}`}
                        onClick={() => setCfgDraft(d => ({ ...d, ws }))}>
                        {ws === 0 ? 'sun' : 'mon'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: coach ── */}
        {tab === 'coach' && (
          <div className="sm-body sm-coach-body">
            {userProfile && !showUpdateWizard ? (
              <>
                {/* Profile summary card */}
                <div className="sm-profile-card">
                  <div className="sm-profile-card-hdr">your coach profile ✦</div>
                  {userProfile.occupation && (
                    <div className="sm-profile-row">
                      <span className="sm-profile-lbl">occupation</span>
                      <span className="sm-profile-val">{userProfile.occupation}</span>
                    </div>
                  )}
                  {userProfile.energyPattern && (
                    <div className="sm-profile-row">
                      <span className="sm-profile-lbl">energy pattern</span>
                      <span className="sm-profile-val">
                        {ENERGY_OPTS.find(o => o.v === userProfile.energyPattern)?.icon}{' '}
                        {ENERGY_OPTS.find(o => o.v === userProfile.energyPattern)?.label}
                      </span>
                    </div>
                  )}
                  {userProfile.lifestyle && userProfile.lifestyle.length > 0 && (
                    <div className="sm-profile-row sm-profile-row-chips">
                      <span className="sm-profile-lbl">lifestyle</span>
                      <div className="sm-profile-chips">
                        {userProfile.lifestyle.map(v => {
                          const opt = LIFESTYLE_OPTS.find(o => o.value === v)
                          return opt ? (
                            <span key={v} className="sm-profile-chip">{opt.icon} {opt.label}</span>
                          ) : null
                        })}
                      </div>
                    </div>
                  )}
                  {userProfile.challenges && userProfile.challenges.length > 0 && (
                    <div className="sm-profile-row sm-profile-row-chips">
                      <span className="sm-profile-lbl">challenges</span>
                      <div className="sm-profile-chips">
                        {userProfile.challenges.map(v => {
                          const opt = CHALLENGE_OPTS.find(o => o.value === v)
                          return opt ? (
                            <span key={v} className="sm-profile-chip">{opt.icon} {opt.label}</span>
                          ) : null
                        })}
                      </div>
                    </div>
                  )}
                  {userProfile.bio && (
                    <div className="sm-profile-row">
                      <span className="sm-profile-lbl">bio</span>
                      <span className="sm-profile-val sm-profile-bio">{userProfile.bio}</span>
                    </div>
                  )}
                </div>
                <button
                  className="sm-coach-update-btn"
                  onClick={() => { setShowUpdateWizard(true); setCoachStep(0) }}
                >
                  update profile
                </button>
              </>
            ) : (
              <>
                {/* Progress dots */}
                <div className="sm-coach-dots">
                  {Array.from({ length: COACH_STEPS }, (_, i) => (
                    <button
                      key={i}
                      className={`sm-coach-dot${i === coachStep ? ' active' : i < coachStep ? ' done' : ''}`}
                      onClick={() => setCoachStep(i)}
                    />
                  ))}
                </div>

                {/* Step content */}
                <CoachStep
                  step={coachStep}
                  occupation={occupation} setOccupation={setOccupation}
                  energyPattern={energyPattern} setEnergyPattern={setEnergyPattern}
                  lifestyle={lifestyle} toggleLifestyle={toggleLifestyle}
                  challenges={challenges} toggleChallenge={toggleChallenge}
                  bio={bio} setBio={setBio}
                />

                {/* Step nav */}
                <div className="sm-coach-nav">
                  <button
                    className="sm-coach-back"
                    onClick={() => setCoachStep(s => s - 1)}
                    style={{ visibility: coachStep > 0 ? 'visible' : 'hidden' }}
                  >← back</button>
                  <span className="sm-coach-step-lbl">{coachStep + 1} / {COACH_STEPS}</span>
                  {coachStep < COACH_STEPS - 1
                    ? <button className="sm-coach-next" onClick={() => setCoachStep(s => s + 1)}>next →</button>
                    : <button className={`sm-coach-save${coachSaved ? ' saved' : ''}`} onClick={() => { saveCoach(); setShowUpdateWizard(false) }}>
                        {coachSaved ? '✓ saved!' : 'save profile'}
                      </button>
                  }
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Tab: rewards ── */}
        {tab === 'rewards' && (
          <div className="sm-body">
            <div className="sm-section">
              <div className="sm-sec-label">
                <span>focus gems</span>
                <span className="sm-gems-count">◆ {focusGems}</span>
              </div>
              <div className="sm-milestones">
                {gemMilestones.map(m => (
                  <div key={m.gems} className={`sm-milestone${m.unlocked ? ' unlocked' : ''}`}>
                    <div className="sm-ms-gems">
                      <span className="sm-ms-gem-icon">◆</span>
                      <span className="sm-ms-gem-n">×{m.gems}</span>
                    </div>
                    <span className="sm-ms-emoji">{m.emoji}</span>
                    <div className="sm-ms-reward">{m.reward}</div>
                    {m.unlocked ? (
                      <button
                        className={`sm-ms-try${m.themeKey === mode ? ' active' : ''}`}
                        onClick={() => {
                          if (m.type === 'theme' && m.themeKey) { setMode(m.themeKey as any); closeSettings() }
                          else if (m.type === 'animal' && m.animalKey) { triggerCelebration(m.animalKey); closeSettings() }
                        }}
                        title={m.type === 'theme' ? 'apply this theme' : 'preview this celebration'}
                      >
                        {m.type === 'theme' ? (m.themeKey === mode ? '✓ active' : 'try it') : 'preview'}
                      </button>
                    ) : (
                      <div className="sm-ms-status">{focusGems}/{m.gems}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer — only on profile tab */}
        {tab === 'profile' && (
          <>
            <div className="sm-footer">
              <button className="sm-cancel" onClick={closeSettings}>cancel</button>
              <button className={`sm-save${saved ? ' saved' : ''}`} onClick={saveProfile}>
                {saved ? '✓ saved!' : 'save changes'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
