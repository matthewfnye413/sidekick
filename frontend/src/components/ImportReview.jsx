import { useMemo, useState } from 'react'
import { fmtTokens, fmtUsd, q, supabase } from '../supabase'

const SEV_ORDER = { error: 0, warning: 1, info: 2 }
const SEV_LABEL = { error: 'Fix', warning: 'Check', info: 'FYI' }

// Review an agent draft: edit, see every flag next to the item it's about, then publish.
function ImportReview({ imp, onClose }) {
  const [draft, setDraft] = useState(imp.draft)
  const [dismissed, setDismissed] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(true)

  const issues = useMemo(
    () => imp.issues.map((x, i) => ({ ...x, i })).filter((x) => !dismissed.has(x.i))
      .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]),
    [imp.issues, dismissed],
  )
  const flagged = useMemo(() => {
    const m = new Map()
    issues.forEach((x) => x.item && m.set(`${x.belt}|${x.item}`, x.severity))
    return m
  }, [issues])

  const edit = (fn) => { setDraft((d) => { const c = structuredClone(d); fn(c); return c }); setSaved(false) }
  const setItem = (b, c, i, v) => edit((d) => { d.belts[b].requirements[c].items[i] = v })
  const delItem = (b, c, i) => edit((d) => { d.belts[b].requirements[c].items.splice(i, 1) })
  const setBelt = (b, k, v) => edit((d) => { d.belts[b][k] = v })

  const save = async () => {
    await q(supabase.from('imports').update({ draft }).eq('id', imp.id))
    setSaved(true)
  }

  const publish = async () => {
    const errors = issues.filter((x) => x.severity === 'error').length
    if (errors && !window.confirm(`${errors} issue(s) still marked "Fix". Publish anyway?`)) return
    setBusy(true); setError(null)
    try {
      if (!saved) await save()
      await q(supabase.rpc('publish_import', { p_import: imp.id }))
      onClose()
    } catch (e) { setError(e.message); setBusy(false) }
  }

  const discard = async () => {
    if (!window.confirm('Discard this import?')) return
    await q(supabase.from('imports').update({ status: 'discarded' }).eq('id', imp.id))
    onClose()
  }

  const u = imp.usage || {}

  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <button className="link" onClick={onClose}>← Back to curriculum</button>
          <h1>Review: {imp.program_name}</h1>
          <p className="muted">From {imp.files.join(', ')} · starts at {draft.starting_rank} · {draft.belts.length} ranks</p>
        </div>
        <div className="row">
          {!saved && <button className="btn" onClick={save}>Save edits</button>}
          <button className="btn" onClick={discard}>Discard</button>
          <button className="btn primary" disabled={busy} onClick={publish}>{busy ? 'Publishing…' : 'Approve & publish'}</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="review-layout">
        <div>
          {draft.belts.map((belt, b) => (
            <div key={b} className="rank">
              <div className="rank-head">
                <span className="belt-swatch" style={{ background: belt.color_hex }} />
                <input value={belt.name} onChange={(e) => setBelt(b, 'name', e.target.value)} style={{ fontWeight: 700, maxWidth: 220 }} />
                <input value={belt.timeframe || ''} placeholder="timeframe" onChange={(e) => setBelt(b, 'timeframe', e.target.value)} style={{ maxWidth: 260 }} />
              </div>
              <div className="rank-body">
                {belt.requirements.map((cat, c) => (
                  <div key={c} className="cat">
                    <h4>{cat.name}</h4>
                    <ul>
                      {cat.items.map((item, i) => {
                        const sev = flagged.get(`${belt.name}|${item}`)
                        return (
                          <li key={i} className={sev === 'error' ? 'flagged-error' : sev ? 'flagged' : ''}>
                            <div className="item-edit">
                              <input value={item} onChange={(e) => setItem(b, c, i, e.target.value)} />
                              <button className="x" title="Remove" onClick={() => delItem(b, c, i)}>×</button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <aside className="sticky">
          <div className="card">
            <h3>Checker's notes</h3>
            <p>{imp.summary}</p>
            {draft.uncertainties?.length > 0 && (
              <>
                <h4 style={{ margin: '10px 0 4px' }}>The Import agent wasn't sure about</h4>
                <ul className="muted">{draft.uncertainties.map((u, i) => <li key={i}>{u}</li>)}</ul>
              </>
            )}
          </div>
          <div className="card">
            <h3>Flags ({issues.length})</h3>
            {issues.length === 0 && <p className="success">Nothing left to review.</p>}
            <ul className="issues" style={{ paddingLeft: 0, listStyle: 'none' }}>
              {issues.map((x) => (
                <li key={x.i}>
                  <span className={`pill ${x.severity}`}>{SEV_LABEL[x.severity]}</span>{' '}
                  <span className="muted">{x.source === 'rule' ? 'auto-check' : 'Checker agent'}</span>
                  <div>
                    {x.belt && <strong>{x.belt}: </strong>}
                    {x.item && <em>“{x.item}” </em>}
                    {x.message}
                  </div>
                  {x.suggestion && <div className="muted">{x.suggestion}</div>}
                  <button className="link" onClick={() => setDismissed((s) => new Set(s).add(x.i))}>Dismiss</button>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h3>What this import cost</h3>
            <p className="muted">
              {fmtTokens(u.input_tokens)} input + {fmtTokens(u.output_tokens)} output tokens · {u.requests} model calls
              {u.revised ? ' · revised once after the Checker' : ''}{u.read_layout ? ' · page layout read' : ''}
            </p>
            <p className="stat">{fmtUsd(u.est_cost_usd)}</p>
          </div>
        </aside>
      </div>
    </>
  )
}

export default ImportReview
