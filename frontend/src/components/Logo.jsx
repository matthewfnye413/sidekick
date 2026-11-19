// SideKick mark: a belt knot whose right tail snaps out like a side kick, with motion lines.
function Logo({ className }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" rx="22" fill="#c8102e" />
      <path d="M12 40 H88" stroke="#fff" strokeWidth="11" strokeLinecap="round" />
      <rect x="38" y="29" width="22" height="22" rx="5" fill="#fff" />
      <path d="M44 51 L34 82" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
      <path d="M55 51 L86 72" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
      <path d="M62 82 L74 88 M54 70 L60 74" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".75" />
    </svg>
  )
}

// Full lockup: mark + "SIDE" + speed lines + forward-leaning "KICK". Size follows the font size.
export function Wordmark({ style }) {
  return (
    <span className="brand" style={style} aria-label="SideKick">
      <Logo className="brand-mark" />
      <span className="wm" aria-hidden="true">
        <span className="wm-side">SIDE</span>
        <span className="wm-kick"><span className="wm-speed"><i /><i /><i /></span>KICK</span>
      </span>
    </span>
  )
}

export default Logo
