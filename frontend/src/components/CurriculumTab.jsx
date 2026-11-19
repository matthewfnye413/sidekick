import { useCallback, useEffect, useState } from 'react'
import { api, fmtDate, q, supabase } from '../supabase'
import ImportReview from './ImportReview'
import AgentSteps from './AgentSteps'

function CurriculumTab({ school }) {
  const [programs, setPrograms] = useState(null)
  const [imports, setImports] = useState([])
  const [reviewing, setReviewing] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const [p, i] = await Promise.all([
        q(supabase.from('programs').select('id,name,starting_rank,ranks(id,sort,name,color,timeframe,requirements)').eq('school_id', school.id).order('name')),
        q(supabase.from('imports').select('*').eq('school_id', school.id).order('created_at', { ascending: false }).limit(20)),
      ])
      p.forEach((prog) => prog.ranks.sort((a, b) => a.sort - b.sort))
      setPrograms(p)
      setImports(i)
    } catch (e) { setError(e.message) }
  }, [school.id])

  useEffect(() => { load() }, [load])

  if (reviewing) {
    return <ImportReview imp={reviewing} onClose={() => { setReviewing(null); load() }} />
  }

  const drafts = imports.filter((i) => i.status === 'draft')

  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h1>Curriculum</h1>
          <p className="muted">What your students see. New curricula come in through an import you review first.</p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      {/* New schools see the import first (with the sample highlighted); settings come after. */}
      <ImportForm school={school} sampleFirst={programs?.length === 0} onCreated={(row) => { setReviewing(row); load() }} />

      {programs?.length > 0 && <VisibilityCard school={school} />}

      {drafts.length > 0 && (
        <div className="card">
          <h3>Waiting for your review</h3>
          <table>
            <thead><tr><th>Program</th><th>Files</th><th>Flags</th><th>When</th><th /></tr></thead>
            <tbody>
              {drafts.map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.program_name}</strong></td>
                  <td className="muted">{d.files.join(', ')}</td>
                  <td><IssueCounts issues={d.issues} /></td>
                  <td className="muted">{fmtDate(d.created_at)}</td>
                  <td><button className="btn primary" onClick={() => setReviewing(d)}>Review</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {programs === null ? <p className="muted">Loading…</p> : programs.length === 0 ? (
        <div className="card empty">
          <h3>No curriculum published yet</h3>
          <p>Upload your rank requirements above. Most schools are done in under five minutes.</p>
        </div>
      ) : programs.map((p) => <ProgramView key={p.id} program={p} />)}
    </>
  )
}

const VISIBILITY = [
  { id: 'learned_and_current', label: "Everything they've learned + what they're working on now", note: 'Recommended' },
  { id: 'current_only', label: "Only what they're working on now", note: 'Strictest' },
  { id: 'full', label: 'The full curriculum, every rank', note: 'Open' },
]

// School setting: how much of the curriculum students can see. Enforced by the database.
function VisibilityCard({ school }) {
  const [value, setValue] = useState(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    q(supabase.from('schools').select('curriculum_visibility').eq('id', school.id).single())
      .then((s) => setValue(s.curriculum_visibility)).catch((e) => setError(e.message))
  }, [school.id])

  const choose = async (id) => {
    const before = value
    setValue(id); setSaved(false); setError(null)
    try {
      await q(supabase.from('schools').update({ curriculum_visibility: id }).eq('id', school.id))
      setSaved(true)
    } catch (e) { setValue(before); setError(e.message) }
  }

  if (!value) return null
  return (
    <div className="card">
      <div className="row between">
        <h3>What students can see</h3>
        {saved && <span className="pill ok">Saved</span>}
      </div>
      <p className="muted">
        Instructors always see everything. You can also unlock a specific higher rank for one student under
        Members &amp; Roster (for example, someone preparing to test early).
      </p>
      <div className="stack" style={{ gap: 6 }}>
        {VISIBILITY.map((v) => (
          <label key={v.id} className="row" style={{ fontSize: 14 }}>
            <input type="radio" name="visibility" checked={value === v.id} onChange={() => choose(v.id)} />
            {v.label} <span className="muted">· {v.note}</span>
          </label>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

export function IssueCounts({ issues }) {
  const n = (s) => issues.filter((i) => i.severity === s).length
  return (
    <span className="row" style={{ gap: 4 }}>
      {n('error') > 0 && <span className="pill error">{n('error')} to fix</span>}
      {n('warning') > 0 && <span className="pill warning">{n('warning')} to check</span>}
      {n('error') + n('warning') === 0 && <span className="pill ok">Looks clean</span>}
    </span>
  )
}

const SAMPLE_URL = '/samples/sample-adult-curriculum.pdf'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

function ImportForm({ school, onCreated, sampleFirst = false }) {
  const [files, setFiles] = useState([])
  const [program, setProgram] = useState('')
  const [readLayout, setReadLayout] = useState(true)
  const [busy, setBusy] = useState(false)
  const [steps, setSteps] = useState([])
  const [error, setError] = useState(null)

  // Start the import, then follow the agents step by step until the draft is ready.
  const run = async (programName, fileList) => {
    setBusy(true); setError(null); setSteps([])
    const form = new FormData()
    form.append('program_name', programName)
    form.append('read_layout', readLayout ? 'true' : 'false')
    fileList.forEach((f) => form.append('files', f))
    try {
      const { job_id } = await api(`/api/schools/${school.id}/imports`, { form })
      for (let tries = 0; tries < 300; tries++) {
        await wait(1200)
        const job = await api(`/api/jobs/${job_id}`, { method: 'GET' })
        setSteps(job.steps)
        if (job.status === 'done') { setFiles([]); setProgram(''); setBusy(false); onCreated(job.result); return }
        if (job.status === 'error') throw new Error(job.error)
      }
      throw new Error('This is taking unusually long. Check back in a minute under "Waiting for your review".')
    } catch (err) { setError(err.message) }
    setBusy(false)
  }

  const submit = (e) => { e.preventDefault(); run(program, files) }

  const trySample = async () => {
    const blob = await (await fetch(SAMPLE_URL)).blob()
    run('Adult (sample)', [new File([blob], 'Sample Adult Curriculum.pdf', { type: 'application/pdf' })])
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <div className="row between">
        <h3 style={{ margin: 0 }}>Import a curriculum</h3>
        <button type="button" className={sampleFirst ? 'btn dark' : 'btn'} disabled={busy} onClick={trySample}>
          ▶ Try it with a sample curriculum
        </button>
      </div>
      <p className="muted">
        Upload the PDFs you already hand out (one file, or one per rank). The <strong>Import agent</strong> builds the
        rank-by-rank checklist and the <strong>Checker agent</strong> reviews it against your document. Nothing is
        published until you approve it. No PDF handy? Try the sample (a real 5-rank jujutsu curriculum).
      </p>
      <div className="grid2">
        <label className="field">Program name
          <input value={program} onChange={(e) => setProgram(e.target.value)} required placeholder="e.g. Adult, Kids, Kali" />
        </label>
        <label className="field">Curriculum files (PDF or text)
          <input type="file" multiple accept=".pdf,.txt,.md" onChange={(e) => setFiles([...e.target.files])} required />
        </label>
      </div>
      <label className="row" style={{ fontSize: 14 }}>
        <input type="checkbox" checked={readLayout} onChange={(e) => setReadLayout(e.target.checked)} />
        Read page layout too (best for tables and multi-column sheets; uses more AI tokens)
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="btn primary" disabled={busy || !files.length}>{busy ? 'Agents working…' : 'Import with SideKick'}</button>
      </div>
      {busy && <AgentSteps steps={steps} live />}
    </form>
  )
}

function ProgramView({ program }) {
  return (
    <div className="card">
      <div className="row between">
        <h2>{program.name}</h2>
        <span className="muted">Starts at {program.starting_rank} · {program.ranks.length} ranks</span>
      </div>
      {program.ranks.map((r) => (
        <details key={r.id} className="rank">
          <summary>
            <span className="belt-swatch" style={{ background: r.color }} />
            <strong>{r.name}</strong>
            <span className="muted">{r.timeframe}</span>
            <span className="spacer" style={{ flex: 1 }} />
            <span className="muted">{r.requirements.reduce((n, c) => n + c.items.length, 0)} items</span>
          </summary>
          <div className="rank-body">
            {r.requirements.map((c) => (
              <div key={c.name} className="cat"><h4>{c.name}</h4><ul>{c.items.map((i, k) => <li key={k}>{i}</li>)}</ul></div>
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}

export default CurriculumTab
