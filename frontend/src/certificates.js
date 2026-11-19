// Rank certificates live in a private storage bucket at <school>/<student>/<rank>.pdf.
// Files are never publicly reachable: opening one downloads it with the signed-in user's session.
import { q, supabase } from './supabase'

const BUCKET = 'certificates'
const MAX_BYTES = 5 * 1024 * 1024

export async function uploadCertificate(schoolId, studentId, rankId, file) {
  if (file.type !== 'application/pdf') throw new Error('Certificates must be PDF files.')
  if (file.size > MAX_BYTES) throw new Error('Certificate is larger than 5 MB.')
  const path = `${schoolId}/${studentId}/${rankId}.pdf`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: 'application/pdf' })
  if (error) throw new Error(error.message)
  await q(supabase.from('certificates').upsert({ student_id: studentId, rank_id: rankId, path }))
}

// Fetch the PDF with the user's own session and show it in the browser's PDF viewer (not as a download).
export async function openCertificate(path) {
  const tab = window.open('', '_blank') // open first so pop-up blockers allow it
  if (tab) tab.document.write('<p style="font-family:sans-serif;padding:24px">Opening certificate…</p>')
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error) { tab?.close(); throw new Error(error.message) }
  const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
  if (tab) tab.location.href = url
  else window.location.assign(url)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function removeCertificate(cert) {
  const { error } = await supabase.storage.from(BUCKET).remove([cert.path])
  if (error) throw new Error(error.message)
  await q(supabase.from('certificates').delete().match({ student_id: cert.student_id, rank_id: cert.rank_id }))
}
