// Public settings (safe to ship in the browser). Override with VITE_* env vars if needed.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://oewmzdttlqspfxnbpgfh.supabase.co'
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_wC5z5UaXKF3yb166ITxUOA_7oxUBA9X'
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
export const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin
