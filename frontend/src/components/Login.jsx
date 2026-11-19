import { useState } from 'react'
import { supabase } from '../supabase'
import Logo from './Logo'

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
        <div className="brand" style={{ fontSize: 30 }}><Logo className="brand-mark" /><span>Side<span className="kick">Kick</span></span></div>
        <h1>Every sensei needs a <em>sidekick</em>.</h1>
        <p style={{ color: '#d4d7de', fontSize: 17 }}>Your A.I. — Assistant Instructor — for running a martial arts school.</p>
        <ul>
          <li><strong>Upload your curriculum</strong> as PDFs. SideKick's agents turn it into rank-by-rank checklists and flag anything that looks off.</li>
          <li><strong>You approve</strong> before students ever see it.</li>
          <li><strong>Students track their path</strong> to the next rank; you see who needs what.</li>
          <li><strong>Plan class</strong> around what the students on the mat actually need.</li>
        </ul>
      </section>
      <section className="landing-form">
        <form className="card auth stack" onSubmit={submit}>
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
