import { APP_URL } from '../config'

function GuideTab({ school }) {
  const joinLink = `${APP_URL}/?school=${school.slug}`
  return (
    <>
      <h1>Add SideKick to your website</h1>
      <p className="muted">Pick the level that fits. Most schools start with option 1 and take two minutes.</p>

      <div className="card">
        <h2>1. A "Member Login" button (any website builder)</h2>
        <p>Add a button or menu item to your site that links here. New students land on the join screen with your school code filled in:</p>
        <pre className="snippet">{joinLink}</pre>
        <ol className="steps">
          <li><strong>Wix:</strong> Editor → <em>+ Add Elements</em> → Button → <em>Change Text</em> "Member Login" → link icon → <em>Web Address</em> → paste the link → open in new tab → Publish.</li>
          <li><strong>Squarespace:</strong> Pages → Main Navigation → <em>+</em> → Link → title "Member Login" → paste the link → Save.</li>
          <li><strong>WordPress:</strong> Appearance → Menus (or Site Editor → Navigation) → add a Custom Link → paste the link → Save.</li>
          <li><strong>GoDaddy Website Builder:</strong> Edit Website → Site Navigation → <em>+</em> → Link → paste the link → Done → Publish.</li>
        </ol>
      </div>

      <div className="card">
        <h2>2. Your own address, like <code>members.yourschool.com</code></h2>
        <p>Looks like part of your site. You add one DNS record; we connect it and turn on HTTPS automatically.</p>
        <ol className="steps">
          <li>Email us the address you want (for example <code>members.yourschool.com</code>).</li>
          <li>Where your domain's DNS lives, add a <strong>CNAME</strong> record:
            <pre className="snippet">Host:  members{'\n'}Value: sidekick-dojo.netlify.app</pre>
            <span className="muted">Wix: Domains → ⋯ → Manage DNS Records → CNAME → Add Record. Squarespace: Domains → DNS → Add record. GoDaddy: My Products → DNS → Add.</span>
          </li>
          <li>Wait 5–60 minutes. We confirm, and your "Member Login" button points to your new address.</li>
        </ol>
      </div>

      <div className="card">
        <h2>Why not embed it inside a page?</h2>
        <p className="muted">
          Browsers increasingly block sign-ins inside embedded frames (third-party cookie and storage rules), so an
          embedded login breaks for many students. A button or your own subdomain always works.
        </p>
      </div>
    </>
  )
}

export default GuideTab
