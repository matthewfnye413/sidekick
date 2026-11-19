import { useEffect, useState } from 'react'
import { fmtDate, fmtTokens, fmtUsd, q, supabase } from '../supabase'

function UsageTab({ school }) {
  const [events, setEvents] = useState(null)
  const [budget, setBudget] = useState(0)
  const [error, setError] = useState(null)

  useEffect(() => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    Promise.all([
      q(supabase.from('usage_events').select('*').eq('school_id', school.id).gte('created_at', monthStart).order('created_at', { ascending: false })),
      q(supabase.from('schools').select('monthly_token_budget').eq('id', school.id).single()),
    ]).then(([e, s]) => { setEvents(e); setBudget(s.monthly_token_budget) }).catch((e) => setError(e.message))
  }, [school.id])

  if (error) return <p className="error">{error}</p>
  if (!events) return <p className="muted">Loading…</p>

  const sum = (k) => events.reduce((n, e) => n + Number(e[k]), 0)
  const tokens = sum('input_tokens') + sum('output_tokens')
  const pct = budget ? Math.min(100, (tokens / budget) * 100) : 0

  return (
    <>
      <h1>AI Usage</h1>
      <p className="muted">Every agent run is logged here (append-only). The school's monthly token budget is a hard stop.</p>
      <div className="grid2">
        <div className="card"><div className="muted">Tokens this month</div><div className="stat">{fmtTokens(tokens)}</div>
          <div className="progress"><div style={{ width: `${pct}%` }} /></div>
          <div className="muted">{pct.toFixed(1)}% of {fmtTokens(budget)} budget</div></div>
        <div className="card"><div className="muted">Estimated cost this month</div><div className="stat">{fmtUsd(sum('est_cost_usd'))}</div>
          <div className="muted">gpt-6-luna · {events.length} runs</div></div>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>When</th><th>Agent run</th><th>Input</th><th>Cached</th><th>Output</th><th>Cost</th></tr></thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className="muted">{fmtDate(e.created_at)}</td>
                <td>{e.kind === 'import' ? 'Curriculum import' : 'Class plan'}</td>
                <td>{fmtTokens(e.input_tokens)}</td><td>{fmtTokens(e.cached_input_tokens)}</td>
                <td>{fmtTokens(e.output_tokens)}</td><td>{fmtUsd(e.est_cost_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {events.length === 0 && <p className="empty">No AI runs yet this month.</p>}
      </div>
    </>
  )
}

export default UsageTab
