import { useState } from 'react'
import { useStore } from '../store'
import { supabase, supabaseConfigured } from '../supabase'

export default function SignInModal() {
  const { closeSignIn, doLateSignIn } = useStore()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

  const handleSignIn = async () => {
    if (!email.trim()) { setError('email is required'); return }
    if (!isValidEmail(email.trim())) { setError('enter a valid email'); return }

    if (supabaseConfigured) {
      setLoading(true)
      const { error: sbError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          data: { name: name.trim() || email.split('@')[0] },
          emailRedirectTo: window.location.origin,
        },
      })
      setLoading(false)
      if (sbError) {
        setError(sbError.message)
      } else {
        setSent(true)
      }
    } else {
      doLateSignIn(email.trim(), name.trim() || email.split('@')[0])
    }
  }

  return (
    <div className="mb on" id="signin-m" onClick={e => { if (e.target === e.currentTarget) closeSignIn() }}>
      <div className="mbox">
        <div className="mhdr">
          <span className="mttl">sign in</span>
          <button className="mx" onClick={closeSignIn}>×</button>
        </div>

        {sent ? (
          <div style={{ padding: '20px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>📬</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>check your email</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.6 }}>
              we sent a magic link to <strong>{email}</strong>.<br />
              click it to sign in — no password needed.
            </div>
            <button className="mact-btn mcanc" style={{ marginTop: 20 }} onClick={closeSignIn}>close</button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--ink4)', marginBottom: 14, padding: '8px 10px', background: 'var(--bg2)', borderRadius: 'var(--r-sm)', lineHeight: 1.5 }}>
              🔒 sign in to back up your preferences across devices.
            </div>
            <span className="mlbl" style={{ marginTop: 0 }}>display name</span>
            <input
              className="minp"
              placeholder="your name (optional)"
              value={name}
              onChange={e => { setName(e.target.value); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleSignIn() }}
              autoFocus
            />
            <span className="mlbl">email</span>
            <input
              className="minp"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleSignIn() }}
            />
            {error && <div style={{ fontSize: 11, color: '#FF4D1C', marginTop: 4 }}>{error}</div>}
            <div className="macts" style={{ marginTop: 16 }}>
              <button className="mact-btn mcanc" onClick={closeSignIn}>cancel</button>
              <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                <button className="mact-btn mcanc" onClick={() => { doLateSignIn('', 'guest'); closeSignIn() }}>continue as guest</button>
                <button className="mact-btn msave" onClick={handleSignIn} disabled={loading}>
                  {loading ? 'sending…' : 'send magic link'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
