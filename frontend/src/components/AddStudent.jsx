import { useState } from 'react'
import { q, supabase } from '../supabase'

export const rankName = (program, sort) => {
  if (!program) return ''
  if (sort === 0) return program.starting_rank
  return (program.ranks || []).find((r) => r.sort === sort)?.name || ''
}

// staff=true lets an instructor set the starting rank; families always start at the first rank
// (the database enforces this too) and an instructor sets the real rank.
function AddStudent({ school, programs, onAdded, staff = false, defaultName = '' }) {
  const [name, setName] = useState(defaultName)
  const [programId, setProgramId] = useState(programs[0]?.id || '')
  const [sort, setSort] = useState(0)
  const [error, setError] = useState(null)
  const program = programs.find((p) => p.id === programId)
  const ranks = [...(program?.ranks || [])].sort((a, b) => a.sort - b.sort)

  const submit = async (e) => {
    e.preventDefault()
    try {
      await q(supabase.from('students').insert({ school_id: school.id, name, program_id: programId, current_rank_sort: staff ? sort : 0 }))
      onAdded()
    } catch (err) { setError(err.message) }
  }

  return (
    <form className="row" style={{ alignItems: 'flex-end', margin: '10px 0' }} onSubmit={submit}>
      <label className="field">Student name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
      <label className="field">Program
        <select value={programId} onChange={(e) => { setProgramId(e.target.value); setSort(0) }}>
          {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {staff ? (
        <label className="field">Current rank
          <select value={sort} onChange={(e) => setSort(Number(e.target.value))}>
            <option value={0}>{program?.starting_rank}</option>
            {ranks.map((r) => <option key={r.sort} value={r.sort}>{r.name}</option>)}
          </select>
        </label>
      ) : (
        <p className="muted" style={{ maxWidth: 260 }}>Your instructor will set your current rank.</p>
      )}
      <button className="btn primary">Add</button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

export default AddStudent
