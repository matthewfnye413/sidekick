import { useCallback, useEffect, useState } from 'react'
import { q, supabase } from '../supabase'
import AddStudent from './AddStudent'

function MembersTab({ school, me, myRole }) {
  const [members, setMembers] = useState(null)
  const [students, setStudents] = useState([])
  const [programs, setPrograms] = useState([])
  const [unlocks, setUnlocks] = useState([])
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const [m, s, p, u] = await Promise.all([
        q(supabase.from('memberships').select('*').eq('school_id', school.id).order('created_at', { ascending: false })),
        q(supabase.from('students').select('*').eq('school_id', school.id).order('name')),
        q(supabase.from('programs').select('id,name,starting_rank,ranks(id,sort,name)').eq('school_id', school.id)),
        q(supabase.from('rank_unlocks').select('student_id,rank_id')),
      ])
      setMembers(m); setStudents(s); setPrograms(p); setUnlocks(u)
    } catch (e) { setError(e.message) }
  }, [school.id])

  useEffect(() => { load() }, [load])

  const set = async (m, status, role = null) => {
    try {
      await q(supabase.rpc('set_membership', { p_school: school.id, p_user: m.user_id, p_status: status, p_role: role }))
      load()
    } catch (e) { setError(e.message) }
  }

  const removeStudent = async (s) => {
    if (!window.confirm(`Remove ${s.name} and their progress?`)) return
    await q(supabase.from('students').delete().eq('id', s.id))
    load()
  }

  if (!members) return <p className="muted">Loading…</p>
  const pending = members.filter((m) => m.status === 'pending')
  const prog = (id) => programs.find((p) => p.id === id)

  return (
    <>
      <h1>Members &amp; Roster</h1>
      {error && <p className="error">{error}</p>}
      <div className="card">
        <h3>Waiting for approval {pending.length > 0 && <span className="pill error">{pending.length}</span>}</h3>
        {pending.length === 0 ? <p className="muted">No one is waiting. Share your school code <code>{school.slug}</code> so students can join.</p> : (
          <table><tbody>
            {pending.map((m) => (
              <tr key={m.user_id}>
                <td><strong>{m.full_name || '(no name)'}</strong><div className="muted">{m.email}</div></td>
                <td className="row" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn primary" onClick={() => set(m, 'active')}>Approve</button>
                  <button className="btn" onClick={() => set(m, 'inactive')}>Deny</button>
                </td>
              </tr>
            ))}
          </tbody></table>
        )}
      </div>

      <div className="card">
        <h3>Members</h3>
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Status</th><th /></tr></thead>
          <tbody>
            {members.filter((m) => m.status !== 'pending').map((m) => (
              <tr key={m.user_id}>
                <td><strong>{m.full_name || '(no name)'}</strong><div className="muted">{m.email}</div></td>
                <td>{m.role}</td>
                <td><span className={`pill ${m.status === 'active' ? 'ok' : ''}`}>{m.status}</span></td>
                <td className="row" style={{ justifyContent: 'flex-end' }}>
                  {m.user_id !== me && m.role !== 'owner' && (
                    <>
                      {myRole === 'owner' && m.status === 'active' && (
                        <button className="link" onClick={() => set(m, null, m.role === 'instructor' ? 'student' : 'instructor')}>
                          {m.role === 'instructor' ? 'Make student' : 'Make instructor'}
                        </button>
                      )}
                      <button className="link" onClick={() => set(m, m.status === 'active' ? 'inactive' : 'active')}>
                        {m.status === 'active' ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="row between">
          <h3>Student roster ({students.length})</h3>
          {programs.length > 0 && <button className="btn" onClick={() => setAdding(!adding)}>{adding ? 'Close' : '+ Add student'}</button>}
        </div>
        <p className="muted">
          Families add their own students when they join (they start at the first rank); set each student's real
          rank here. Promotions are instructor-only.
        </p>
        {adding && <AddStudent school={school} programs={programs} staff onAdded={() => { setAdding(false); load() }} />}
        {programs.length === 0 && <p className="muted">Publish a curriculum first, then add students to it.</p>}
        <table><tbody>
          {students.map((s) => (
            <RosterRow key={s.id} student={s} program={prog(s.program_id)}
              unlocked={unlocks.filter((u) => u.student_id === s.id).map((u) => u.rank_id)}
              onChange={load} onRemove={() => removeStudent(s)} onError={setError} />
          ))}
        </tbody></table>
      </div>
    </>
  )
}

function RosterRow({ student, program, unlocked, onChange, onRemove, onError }) {
  const [open, setOpen] = useState(false)
  if (!program) return null
  const ranks = [...program.ranks].sort((a, b) => a.sort - b.sort)
  const higher = ranks.filter((r) => r.sort > student.current_rank_sort + 1)

  const promote = async (sort) => {
    try { await q(supabase.rpc('set_student_rank', { p_student: student.id, p_sort: sort })); onChange() } catch (e) { onError(e.message) }
  }
  const toggleUnlock = async (rankId, on) => {
    try {
      if (on) await q(supabase.from('rank_unlocks').delete().match({ student_id: student.id, rank_id: rankId }))
      else await q(supabase.from('rank_unlocks').insert({ student_id: student.id, rank_id: rankId }))
      onChange()
    } catch (e) { onError(e.message) }
  }

  return (
    <>
      <tr>
        <td><strong>{student.name}</strong></td>
        <td>{program.name}</td>
        <td>
          <select value={student.current_rank_sort} onChange={(e) => promote(Number(e.target.value))} aria-label="Current rank">
            <option value={0}>{program.starting_rank}</option>
            {ranks.map((r) => <option key={r.id} value={r.sort}>{r.name}</option>)}
          </select>
        </td>
        <td style={{ textAlign: 'right' }} className="row">
          {higher.length > 0 && (
            <button className="link" onClick={() => setOpen(!open)}>
              {unlocked.length ? `${unlocked.length} unlocked` : 'Unlock ranks'}
            </button>
          )}
          <button className="link" onClick={onRemove}>Remove</button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={4} style={{ background: 'var(--bg)' }}>
            <span className="muted">Let {student.name} see these higher ranks early:</span>
            <div className="row" style={{ marginTop: 6 }}>
              {higher.map((r) => {
                const on = unlocked.includes(r.id)
                return (
                  <label key={r.id} className="row" style={{ gap: 4, fontSize: 14 }}>
                    <input type="checkbox" checked={on} onChange={() => toggleUnlock(r.id, on)} /> {r.name}
                  </label>
                )
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default MembersTab
