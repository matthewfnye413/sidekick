import { useCallback, useEffect, useState } from 'react'
import { api, fmtDate, fmtTokens, fmtUsd, q, supabase } from '../supabase'

const today = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local time

function PlannerTab({ school }) {
  const [students, setStudents] = useState([])
  const [present, setPresent] = useState(new Set())
  const [minutes, setMinutes] = useState(60)
  const [focus, setFocus] = useState('')
  const [mode, setMode] = useState('new')
  const [plan, setPlan] = useState(null)
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const [s, a, h] = await Promise.all([
      q(supabase.from('students').select('id,name').eq('school_id', school.id).order('name')),
      q(supabase.from('attendance').select('student_id').eq('school_id', school.id).eq('class_date', today())),
      q(supabase.from('lesson_plans').select('*').eq('school_id', school.id).order('created_at', { ascending: false }).limit(5)),
    ])
    setStudents(s); setPresent(new Set(a.map((r) => r.student_id))); setHistory(h)
  }, [school.id])

  useEffect(() => { load().catch((e) => setError(e.message)) }, [load])

  const toggle = async (id) => {
    const on = present.has(id)
    setPresent((p) => { const n = new Set(p); on ? n.delete(id) : n.add(id); return n })
    try {
      if (on) await q(supabase.from('attendance').delete().eq('student_id', id).eq('class_date', today()))
      else await q(supabase.from('attendance').insert({ school_id: school.id, student_id: id, class_date: today() }))
    } catch (e) { setError(e.message) }
  }

  const generate = async () => {
    setBusy(true); setError(null)
    try {
      const row = await api(`/api/schools/${school.id}/lesson-plan`, { body: { student_ids: [...present], minutes, focus, mode } })
      setPlan(row); load()
    } catch (e) { setError(e.message) }
    setBusy(false)
  }

  // Reopening a saved plan also restores the choices it was made with.
  const openPlan = (row) => { setPlan(row); setMinutes(row.request.minutes); setFocus(row.request.focus || ''); setMode(row.request.mode || 'new') }

  return (
    <>
      <h1>Class Planner</h1>
      <p className="muted">
        Optional. Check in who's on the mat and the <strong>Class Planner agent</strong> drafts a plan from
        what those students still need for their next rank, what they have already learned, or both. Type what you want
        to train, or leave it open. It only uses your published curriculum.
      </p>
      {error && <p className="error">{error}</p>}

      <div className="card">
        <div className="row between"><h3>Today's check-in ({present.size})</h3><span className="muted">{today()}</span></div>
        {students.length === 0 ? <p className="muted">Add students under Members &amp; Roster first.</p> : (
          <div className="roster">
            {students.map((s) => (
              <label key={s.id} className={present.has(s.id) ? 'on' : ''}>
                <input type="checkbox" checked={present.has(s.id)} onChange={() => toggle(s.id)} /> {s.name}
              </label>
            ))}
          </div>
        )}
        <div className="row" style={{ marginTop: 14, alignItems: 'flex-end' }}>
          <label className="field">Class length (min)
            <input type="number" min={15} max={180} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} style={{ width: 110 }} />
          </label>
          <label className="field">Plan around
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="new">New material they still need</option>
              <option value="review">Review what they already know</option>
              <option value="mix">A mix of both</option>
            </select>
          </label>
          <label className="field" style={{ flex: 1, minWidth: 220 }}>What do you want to train? (optional)
            <input value={focus} maxLength={300} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. Blue Belt throws, escapes from grabs, test prep" />
          </label>
          <button className="btn primary" disabled={busy || present.size === 0} onClick={generate}>
            {busy ? 'Planning…' : 'Draft a plan'}
          </button>
          {busy && <span className="spinner" />}
        </div>
      </div>

      {plan && <PlanView row={plan} />}

      {history.length > 0 && (
        <div className="card">
          <h3>Recent plans</h3>
          <table><tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td><button className="link" onClick={() => openPlan(h)}>{h.plan.title}</button></td>
                <td className="muted">{h.request.student_ids.length} students · {h.request.minutes} min{h.request.mode && h.request.mode !== 'new' ? ` · ${h.request.mode}` : ''}</td>
                <td className="muted">{fmtDate(h.created_at)}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
    </>
  )
}

function PlanView({ row }) {
  const { plan, usage = {} } = row
  return (
    <div className="card">
      <div className="row between">
        <h2>{plan.title}</h2>
        <span className="muted">{plan.total_minutes} min · {fmtTokens(usage.total_tokens)} tokens · {fmtUsd(usage.est_cost_usd)}</span>
      </div>
      <p><strong>Why:</strong> {plan.rationale}</p>
      {plan.segments.map((s, i) => (
        <div key={i} className="segment">
          <div className="row between"><strong>{s.title}</strong><span className="pill">{s.minutes} min</span></div>
          <div className="muted">{s.who}</div>
          {s.techniques.length > 0 && <div>{s.techniques.join(' · ')}</div>}
          {s.notes && <div className="muted">{s.notes}</div>}
        </div>
      ))}
      {usage.removed_invented?.length > 0 && (
        <p className="muted">
          <span className="pill warning">Guardrail</span> Removed {usage.removed_invented.length} technique(s) {row.request?.mode === 'review'
            ? 'that are not in your curriculum or that no one here has learned yet' : 'not in your curriculum'}: {usage.removed_invented.join(', ')}
        </p>
      )}
    </div>
  )
}

export default PlannerTab
