import { useState } from 'react'
import { supabase } from '../supabase'
import { Wordmark } from './Logo'

const TITLES = { signin: 'Sign in', signup: 'Create your account', reset: 'Reset your password' }

function Login() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const go = (m) => { setMode(m); setMessage(null); setError(null) }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null); setMessage(null)
    const redirectTo = window.location.origin
    let res
    if (mode === 'signin') res = await supabase.auth.signInWithPassword({ email, password })
    else if (mode === 'signup') {
      res = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } })
      if (!res.error && !res.data.session) { setMode('signin'); setMessage('Account created. Check your email to confirm, then sign in.') }
    } else {
      res = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (!res.error) setMessage('If that email has an account, a reset link is on its way.')
    }
    if (res.error) setError(res.error.message)
    setBusy(false)
  }

  return (
    <div className="landing">
      <section className="landing-hero">
        <Wordmark style={{ fontSize: 34 }} />
        <h1>Every coach needs a <em>sidekick</em>.</h1>
        <p className="hero-sub">
          Your A.I. — <em>Assistant Instructor</em> — turns the curriculum PDFs you already have into rank-by-rank
          checklists your students actually use. You maintain control of curriculum access.
        </p>

        <ol className="how">
          <li><span>1</span><div><strong>Upload</strong> your curriculum PDFs: belts, kyu grades or levels, lists or tables.</div></li>
          <li><span>2</span><div><strong>Two agents</strong> build the checklists and check them against your document.</div></li>
          <li><span>3</span><div><strong>You approve</strong>. Students see only the belt curriculum you allow and can track their own progress.</div></li>
        </ol>

        <div className="preview" aria-hidden="true">
          <div className="preview-head"><span className="belt-swatch" style={{ background: '#7c3aed' }} /> Working toward Purple Belt
            <span className="preview-pct">16 / 23</span></div>
          <div className="progress"><div style={{ width: '70%' }} /></div>
          <div className="preview-items">
            <span className="on">✓ Harai Goshi</span><span className="on">✓ Hane Goshi</span><span className="on">✓ Tomoe Nage</span>
            <span>Taiotoshi</span><span className="on">✓ Sleeve grabs</span><span>Kick defense</span>
          </div>
          <div className="preview-flag"><span className="pill warning">Check</span> Checker agent: “Intro to no gi” also appears under Nage in your PDF.</div>
        </div>

        <div className="trust">
          <span>✓ Nothing published without your approval</span>
          <span>✓ Each school's data is private</span>
          <span>✓ Less than a penny of AI per import</span>
        </div>
      </section>
      <section className="landing-form">
        <form className="card auth stack" onSubmit={submit}>
          <div className="mobile-brand">
            <Wordmark style={{ fontSize: 30 }} />
            <p className="muted">Every coach needs a sidekick.</p>
          </div>
          <h2>{TITLES[mode]}</h2>
          <label className="field">Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          {mode !== 'reset' && (
            <label className="field">Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
            </label>
          )}
          {error && <p className="error">{error}</p>}
          {message && <p className="success">{message}</p>}
          <button className="btn primary" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          </button>
          <div className="row between">
            {mode === 'signin' ? (
              <>
                <button type="button" className="link" onClick={() => go('signup')}>New here? Create an account</button>
                <button type="button" className="link" onClick={() => go('reset')}>Forgot password?</button>
              </>
            ) : (
              <button type="button" className="link" onClick={() => go('signin')}>Back to sign in</button>
            )}
          </div>
        </form>
      </section>
    </div>
  )
}

export function SetNewPassword({ onDone }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setError(error.message)
    else onDone()
  }
  return (
    <main>
      <form className="card auth stack" style={{ margin: '40px auto' }} onSubmit={submit}>
        <h2>Choose a new password</h2>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        {error && <p className="error">{error}</p>}
        <button className="btn primary">Save password</button>
      </form>
    </main>
  )
}

export default Login
