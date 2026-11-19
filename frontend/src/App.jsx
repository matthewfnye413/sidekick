import { useCallback, useEffect, useState } from 'react'
import { q, supabase } from './supabase'
import Login, { SetNewPassword } from './components/Login'
import SchoolSetup from './components/SchoolSetup'
import CurriculumTab from './components/CurriculumTab'
import MembersTab from './components/MembersTab'
import PlannerTab from './components/PlannerTab'
import UsageTab from './components/UsageTab'
import GuideTab from './components/GuideTab'
import StudentView from './components/StudentView'
import Logo from './components/Logo'

const STAFF_TABS = [
  { id: 'curriculum', label: 'Curriculum' },
  { id: 'members', label: 'Members & Roster' },
  { id: 'planner', label: 'Class Planner' },
  { id: 'usage', label: 'AI Usage' },
  { id: 'guide', label: 'Add to Your Website' },
]

function App() {
  const [session, setSession] = useState(undefined)
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <p className="empty">Loading…</p>
  if (recovering) return <SetNewPassword onDone={() => setRecovering(false)} />
  if (!session) return <Login />
  return <Signed key={session.user.id} user={session.user} />
}

function Signed({ user }) {
  const [memberships, setMemberships] = useState(null)
  const [schoolId, setSchoolId] = useState(() => localStorage.getItem('sk_school'))
  const [tab, setTab] = useState('curriculum')
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const rows = await q(supabase.from('memberships').select('school_id,role,status,full_name,schools(id,name,slug)').eq('user_id', user.id))
      setMemberships(rows)
    } catch (e) {
      setError(e.message)
    }
  }, [user.id])

  useEffect(() => { load() }, [load])

  const choose = (id) => {
    setSchoolId(id)
    try { localStorage.setItem('sk_school', id) } catch { /* private mode */ }
    load()
  }

  if (error) return <p className="card error">{error}</p>
  if (!memberships) return <p className="empty">Loading…</p>

  const current = memberships.find((m) => m.school_id === schoolId) || memberships[0]
  const signOut = () => supabase.auth.signOut()

  if (!current) {
    return (
      <>
        <TopBar onSignOut={signOut} />
        <main><SchoolSetup user={user} onDone={choose} /></main>
      </>
    )
  }

  const isStaff = current.status === 'active' && current.role !== 'student'
  const switcher = memberships.length > 1 && (
    <select value={current.school_id} onChange={(e) => choose(e.target.value)} aria-label="Switch school">
      {memberships.map((m) => <option key={m.school_id} value={m.school_id}>{m.schools.name}</option>)}
    </select>
  )

  return (
    <>
      <TopBar school={current.schools.name} role={current.role} switcher={switcher} onSignOut={signOut} />
      {isStaff && (
        <div style={{ background: 'var(--ink)' }}>
          <nav className="tabs">
            {STAFF_TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </nav>
        </div>
      )}
      <main>
        {current.status === 'pending' && (
          <div className="card empty">
            <h2>Waiting for approval</h2>
            <p>You asked to join <strong>{current.schools.name}</strong>. An instructor will approve you shortly.</p>
            <button className="btn" onClick={load}>Check again</button>
          </div>
        )}
        {current.status === 'inactive' && <div className="card empty"><h2>Membership inactive</h2><p>Contact your school.</p></div>}
        {current.status === 'active' && !isStaff && <StudentView school={current.schools} />}
        {isStaff && tab === 'curriculum' && <CurriculumTab school={current.schools} />}
        {isStaff && tab === 'members' && <MembersTab school={current.schools} me={user.id} myRole={current.role} />}
        {isStaff && tab === 'planner' && <PlannerTab school={current.schools} />}
        {isStaff && tab === 'usage' && <UsageTab school={current.schools} />}
        {isStaff && tab === 'guide' && <GuideTab school={current.schools} />}
        {isStaff && (
          <p className="muted" style={{ marginTop: 30 }}>
            Add another school? <button className="link" onClick={() => choose('__new__')}>Create or join</button>
          </p>
        )}
        {schoolId === '__new__' && <SchoolSetup user={user} onDone={choose} />}
      </main>
    </>
  )
}

function TopBar({ school, role, switcher, onSignOut }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand"><Logo className="brand-mark" /><span>Side<span className="kick">Kick</span></span></div>
        {school && <span className="school">{school}{role && ` · ${role}`}</span>}
        {switcher}
        <span className="spacer" />
        <button className="link" onClick={onSignOut}>Sign out</button>
      </div>
    </header>
  )
}

export default App
