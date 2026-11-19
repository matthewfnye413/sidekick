import { createClient } from '@supabase/supabase-js'
import { API_URL, SUPABASE_KEY, SUPABASE_URL } from './config'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Throw on Supabase errors so callers can use try/catch.
export async function q(promise) {
  const { data, error } = await promise
  if (error) throw new Error(error.message)
  return data
}

// Call the SideKick agent API with the user's own session token.
export async function api(path, { method = 'POST', body, form } = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(form ? {} : { 'Content-Type': 'application/json' }) },
    body: form || (body ? JSON.stringify(body) : undefined),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.detail || `Request failed (${res.status})`)
  return json
}

export const fmtTokens = (n) => (n ?? 0).toLocaleString()
export const fmtUsd = (n) => `$${Number(n ?? 0).toFixed(4)}`
export const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
