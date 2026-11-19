import { useState } from 'react'
import { q, supabase } from '../supabase'

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

function SchoolSetup({ onDone }) {
  const joinCode = new URLSearchParams(window.location.search).get('school') || ''
  const [mode, setMode] = useState(joinCode ? 'join' : 'create')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState(joinCode)
  const [fullName, setFullName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const id = mode === 'create'
        ? await q(supabase.rpc('create_school', { p_name: name, p_slug: slug, p_full_name: fullName }))
        : await q(supabase.rpc('join_school', { p_slug: slug, p_full_name: fullName }))
      onDone(id)
    } catch (err) {
      setError(err.message.includes('duplicate') ? 'That school code is taken. Try another.' : err.message)
    }
    setBusy(false)
  }

  return (
    <div className="card" style={{ maxWidth: 520, margin: '20px auto' }}>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className={`btn ${mode === 'create' ? 'dark' : ''}`} onClick={() => setMode('create')}>I run a school</button>
        <button className={`btn ${mode === 'join' ? 'dark' : ''}`} onClick={() => setMode('join')}>I'm a student or parent</button>
      </div>
      <form className="stack" onSubmit={submit}>
        <h2>{mode === 'create' ? 'Set up your school' : 'Join your school'}</h2>
        <label className="field">Your full name
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
        </label>
        {mode === 'create' && (
          <label className="field">School name
            <input value={name} onChange={(e) => { setName(e.target.value); setSlug(slugify(e.target.value)) }} required placeholder="e.g. Evolution Jujutsu" />
          </label>
        )}
        <label className="field">{mode === 'create' ? 'School code (students use this to join)' : 'School code (ask your instructor)'}
          <input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} required minLength={3} placeholder="evolution-jujutsu" />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'create' ? 'Create school' : 'Ask to join'}</button>
      </form>
    </div>
  )
}

export default SchoolSetup
