// SideKick mark: a belt knot with trailing ends, in the brand red.
function Logo({ className }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#c8102e" />
      <path d="M10 26h44" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
      <rect x="25" y="19" width="14" height="14" rx="3" fill="#fff" />
      <path d="M29 33l-9 20M35 33l11 18" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
    </svg>
  )
}

export default Logo
