const PIPELINE = ['Import agent', 'Automatic checks', 'Checker agent']

// Live (and saved) view of what each agent did: status, result, tokens, time.
function AgentSteps({ steps, live = false }) {
  const shown = [...steps]
  if (live) PIPELINE.forEach((p) => { if (!shown.some((s) => s.step === p)) shown.push({ step: p, status: 'waiting' }) })
  return (
    <ol className="agent-steps">
      {shown.map((s, i) => (
        <li key={i} className={`agent-step ${s.status}`}>
          <span className="agent-dot">{s.status === 'done' ? '✓' : s.status === 'running' ? <span className="spinner" /> : i + 1}</span>
          <div>
            <strong>{s.step}</strong>
            <div className="muted">{s.status === 'waiting' ? 'Waiting…' : s.detail}</div>
          </div>
          {s.status === 'done' && (
            <span className="muted agent-meta">{s.tokens ? `${s.tokens.toLocaleString()} tokens · ` : ''}{s.seconds}s</span>
          )}
        </li>
      ))}
    </ol>
  )
}

export default AgentSteps
