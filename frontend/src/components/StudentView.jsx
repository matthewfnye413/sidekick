import { useCallback, useEffect, useState } from 'react'
import { q, supabase } from '../supabase'
import AddStudent, { rankName } from './AddStudent'

const keyOf = (category, item) => `${category}::${item}`

// What a student or parent sees: their student(s), the rank path, and the next-rank checklist.
// Which ranks show their content is decided by the school's visibility setting, enforced in the database.
function StudentView({ school }) {
  const [students, setStudents] = useState(null)
  const [programs, setPrograms] = useState([])
  const [current, setCurrent] = useState(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const [s, p] = await Promise.all([
        q(supabase.from('students').select('*').eq('school_id', school.id).eq('account_id', user.id).order('created_at')),
        q(supabase.from('programs').select('id,name,starting_rank').eq('school_id', school.id)),
      ])
      // Rank names for every program (for the "add student" form); requirements come per student below.
      await Promise.all(p.map(async (prog) => { prog.ranks = await q(supabase.rpc('student_curriculum', { p_program: prog.id })) }))
      setStudents(s); setPrograms(p)
      setCurrent((c) => (s.some((x) => x.id === c) ? c : s[0]?.id ?? null))
    } catch (e) { setError(e.message) }
  }, [school.id])

  useEffect(() => { load() }, [load])

  if (error) return <p className="error">{error}</p>
  if (!students) return <p className="muted">Loading…</p>
  if (programs.length === 0) return <div className="card empty"><h2>Almost there</h2><p>{school.name} hasn't published its curriculum yet.</p></div>

  if (students.length === 0 || adding) {
    return (
      <div className="card">
        <h2>Who's training?</h2>
        <p className="muted">Add yourself and/or each child. One account can track the whole family.</p>
        <AddStudent school={school} programs={programs} onAdded={() => { setAdding(false); load() }} />
      </div>
    )
  }

  const student = students.find((s) => s.id === current)
  const program = programs.find((p) => p.id === student.program_id)

  return (
    <>
      <div className="row between">
        <div className="row">
          {students.length > 1 ? (
            <select value={student.id} onChange={(e) => setCurrent(e.target.value)}>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : <h1 style={{ margin: 0 }}>{student.name}</h1>}
          <span className="muted">{program.name} · {rankName(program, student.current_rank_sort)}</span>
        </div>
        <button className="link" onClick={() => setAdding(true)}>+ Add a student</button>
      </div>
      <Checklist key={student.id} student={student} program={program} />
      <RankPath student={student} program={program} />
    </>
  )
}

function Checklist({ student, program }) {
  const [done, setDone] = useState(null)
  const [byCoach, setByCoach] = useState(new Set())
  const next = program.ranks.find((r) => r.sort === student.current_rank_sort + 1)

  useEffect(() => {
    q(supabase.from('progress').select('rank_id,item_key,checked_by').eq('student_id', student.id))
      .then((rows) => {
        setDone(new Set(rows.map((r) => `${r.rank_id}|${r.item_key}`)))
        // Items checked by someone other than this family's account were checked by an instructor.
        setByCoach(new Set(rows.filter((r) => r.checked_by && r.checked_by !== student.account_id).map((r) => `${r.rank_id}|${r.item_key}`)))
      })
  }, [student.id])

  const toggle = async (key) => {
    const id = `${next.id}|${key}`
    const on = done.has(id)
    const flip = (d) => { const n = new Set(d); if (n.has(id)) n.delete(id); else n.add(id); return n }
    setDone(flip)
    const row = { student_id: student.id, rank_id: next.id, item_key: key }
    const { error } = on ? await supabase.from('progress').delete().match(row) : await supabase.from('progress').insert(row)
    if (error) setDone(flip)
  }

  if (!done) return <p className="muted">Loading…</p>
  if (!next) return <div className="card empty"><h2>Top of the curriculum</h2><p>Nothing left on this path. Oss!</p></div>
  if (next.locked) return <div className="card empty"><h2>{next.name}</h2><p>Your instructor will open this rank's material.</p></div>

  const total = next.requirements.reduce((n, c) => n + c.items.length, 0)
  const count = next.requirements.reduce((n, c) => n + c.items.filter((i) => done.has(`${next.id}|${keyOf(c.name, i)}`)).length, 0)

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row"><span className="belt-swatch" style={{ background: next.color }} /><h2 style={{ margin: 0 }}>Working toward {next.name}</h2></div>
      <div className="progress"><div style={{ width: `${(count / total) * 100}%` }} /></div>
      <p className="muted">{count} of {total} practiced</p>
      <div className="rank-body" style={{ padding: 0 }}>
        {next.requirements.map((c) => (
          <div key={c.name} className="cat">
            <h4>{c.name}</h4>
            <ul className="checklist">
              {c.items.map((i) => {
                const k = keyOf(c.name, i)
                return (
                  <li key={k}><label>
                    <input type="checkbox" checked={done.has(`${next.id}|${k}`)} onChange={() => toggle(k)} /> {i}
                    {byCoach.has(`${next.id}|${k}`) && done.has(`${next.id}|${k}`) && <span className="pill info">instructor</span>}
                  </label></li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

// The whole path: open ranks can be expanded; locked ones show only their name.
function RankPath({ student, program }) {
  return (
    <div className="card">
      <h3>Your path</h3>
      {program.ranks.map((r) => {
        const status = r.sort <= student.current_rank_sort ? 'Earned' : r.sort === student.current_rank_sort + 1 ? 'Working on' : null
        return r.locked ? (
          <div key={r.id} className="rank"><div className="rank-head" style={{ cursor: 'default', opacity: 0.6 }}>
            <span className="belt-swatch" style={{ background: r.color }} /><strong>{r.name}</strong>
            {status === 'Earned'
              ? <><span className="pill ok">Earned</span><span className="muted">🔒 Hidden by your school's settings</span></>
              : <span className="muted">🔒 Opens when your instructor unlocks it</span>}
          </div></div>
        ) : (
          <details key={r.id} className="rank">
            <summary>
              <span className="belt-swatch" style={{ background: r.color }} /><strong>{r.name}</strong>
              {status && <span className={`pill ${status === 'Earned' ? 'ok' : 'error'}`}>{status}</span>}
            </summary>
            <div className="rank-body">
              {r.requirements.map((c) => (
                <div key={c.name} className="cat"><h4>{c.name}</h4><ul>{c.items.map((i, k) => <li key={k}>{i}</li>)}</ul></div>
              ))}
            </div>
          </details>
        )
      })}
    </div>
  )
}

export default StudentView
