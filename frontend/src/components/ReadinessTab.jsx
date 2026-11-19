import { useCallback, useEffect, useMemo, useState } from 'react'
import { q, supabase } from '../supabase'
import { rankName } from './AddStudent'

const keyOf = (category, item) => `${category}::${item}`

const band = (pct) =>
  pct >= 90 ? { label: 'Ready to test', cls: 'ok' } : pct >= 60 ? { label: 'Getting close', cls: 'warning' } : { label: 'Building', cls: '' }

// Who's closest to their next rank, from the techniques students have checked off. No AI involved.
function ReadinessTab({ school }) {
  const [students, setStudents] = useState(null)
  const [programs, setPrograms] = useState([])
  const [progress, setProgress] = useState([])
  const [programFilter, setProgramFilter] = useState('all')
  const [open, setOpen] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        q(supabase.from('students').select('*').eq('school_id', school.id).order('name')),
        q(supabase.from('programs').select('id,name,starting_rank,ranks(id,sort,name,color,requirements)').eq('school_id', school.id)),
      ])
      const pr = s.length ? await q(supabase.from('progress').select('student_id,rank_id,item_key,checked_by').in('student_id', s.map((x) => x.id))) : []
      setStudents(s); setPrograms(p); setProgress(pr)
    } catch (e) { setError(e.message) }
  }, [school.id])

  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    if (!students) return []
    const done = new Map(progress.map((p) => [`${p.student_id}|${p.rank_id}|${p.item_key}`, p.checked_by]))
    return students.map((s) => {
      const program = programs.find((p) => p.id === s.program_id)
      const next = program?.ranks.find((r) => r.sort === s.current_rank_sort + 1)
      if (!next) return { s, program, next: null, pct: 100, count: 0, total: 0, missing: [], done }
      const items = next.requirements.flatMap((c) => c.items.map((i) => ({ c: c.name, i })))
      const missing = items.filter(({ c, i }) => !done.has(`${s.id}|${next.id}|${keyOf(c, i)}`))
      const total = items.length
      return { s, program, next, total, count: total - missing.length, pct: total ? Math.round(((total - missing.length) / total) * 100) : 0, missing, done }
    }).filter((r) => programFilter === 'all' || r.program?.id === programFilter)
      .sort((a, b) => b.pct - a.pct)
  }, [students, programs, progress, programFilter])

  const promote = async (r) => {
    if (!window.confirm(`Promote ${r.s.name} to ${r.next.name}?`)) return
    try { await q(supabase.rpc('set_student_rank', { p_student: r.s.id, p_sort: r.s.current_rank_sort + 1 })); load() }
    catch (e) { setError(e.message) }
  }

  if (error) return <p className="error">{error}</p>
  if (!students) return <p className="muted">Loading…</p>

  const ready = rows.filter((r) => r.next && r.pct >= 90).length
  const close = rows.filter((r) => r.next && r.pct >= 60 && r.pct < 90).length

  return (
    <>
      <div className="row between">
        <div>
          <h1>Promotion Readiness</h1>
          <p className="muted">Each student's progress toward their next rank, from the techniques they've checked off.</p>
        </div>
        {programs.length > 1 && (
          <select value={programFilter} onChange={(e) => setProgramFilter(e.target.value)} aria-label="Program">
            <option value="all">All programs</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      <div className="grid3">
        <div className="card"><div className="muted">Students</div><div className="stat">{rows.length}</div></div>
        <div className="card"><div className="muted">Ready to test (90%+)</div><div className="stat" style={{ color: 'var(--ok)' }}>{ready}</div></div>
        <div className="card"><div className="muted">Getting close (60–89%)</div><div className="stat" style={{ color: 'var(--warn)' }}>{close}</div></div>
      </div>

      {rows.length === 0 ? (
        <div className="card empty"><h3>No students yet</h3><p>Students appear here once they join (or you add them under Members &amp; Roster).</p></div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="readiness">
            <thead><tr><th>Student</th><th>Working toward</th><th style={{ width: '34%' }}>Progress</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <ReadinessRow key={r.s.id} r={r} open={open === r.s.id} onToggle={() => setOpen(open === r.s.id ? null : r.s.id)}
                  onPromote={() => promote(r)} onChange={load} onError={setError} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function ReadinessRow({ r, open, onToggle, onPromote, onChange, onError }) {
  if (!r.next) {
    return (
      <tr><td><strong>{r.s.name}</strong><div className="muted">{r.program?.name} · {rankName(r.program, r.s.current_rank_sort)}</div></td>
        <td colSpan={4} className="muted">Top of the curriculum</td></tr>
    )
  }
  const b = band(r.pct)
  return (
    <>
      <tr>
        <td><strong>{r.s.name}</strong><div className="muted">{r.program?.name} · {rankName(r.program, r.s.current_rank_sort)}</div></td>
        <td><span className="row" style={{ gap: 6 }}><span className="belt-swatch" style={{ background: r.next.color }} />{r.next.name}</span></td>
        <td>
          <div className="progress" style={{ margin: '0 0 4px' }}><div style={{ width: `${r.pct}%` }} /></div>
          <span className="muted">{r.count} of {r.total} · {r.pct}%</span>
        </td>
        <td>{b.label && <span className={`pill ${b.cls}`}>{b.label}</span>}</td>
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <button className="link" onClick={onToggle}>{open ? 'Close checklist' : 'Checklist'}</button>{' '}
          <button className="btn" onClick={onPromote}>Promote</button>
        </td>
      </tr>
      {open && (
        <tr><td colSpan={5} style={{ background: 'var(--bg)' }}>
          <StaffChecklist r={r} onChange={onChange} onError={onError} />
        </td></tr>
      )}
    </>
  )
}

// Instructors can correct any student's checklist. Items an instructor checked are marked.
function StaffChecklist({ r, onChange, onError }) {
  const [busy, setBusy] = useState(null)
  const toggle = async (key) => {
    const id = `${r.s.id}|${r.next.id}|${key}`
    const row = { student_id: r.s.id, rank_id: r.next.id, item_key: key }
    setBusy(key)
    try {
      if (r.done.has(id)) await q(supabase.from('progress').delete().match(row))
      else await q(supabase.from('progress').insert(row))
      await onChange()
    } catch (e) { onError(e.message) }
    setBusy(null)
  }
  return (
    <div>
      <div className="row between">
        <strong>{r.s.name} · {r.next.name} checklist</strong>
        <span className="muted">Changes save immediately. <span className="pill info">instructor</span> = checked by an instructor</span>
      </div>
      <div className="rank-body" style={{ padding: '8px 0 0' }}>
        {r.next.requirements.map((c) => (
          <div key={c.name} className="cat">
            <h4>{c.name}</h4>
            <ul className="checklist">
              {c.items.map((i) => {
                const key = keyOf(c.name, i)
                const by = r.done.get(`${r.s.id}|${r.next.id}|${key}`)
                return (
                  <li key={key}>
                    <label style={{ opacity: busy === key ? 0.5 : 1 }}>
                      <input type="checkbox" checked={r.done.has(`${r.s.id}|${r.next.id}|${key}`)} disabled={busy !== null} onChange={() => toggle(key)} />
                      {i} {by && by !== r.s.account_id && <span className="pill info">instructor</span>}
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ReadinessTab
