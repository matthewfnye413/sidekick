// Rank certificates live in a private storage bucket at <school>/<student>/<rank>.pdf.
// Opening one creates a short-lived signed link, so files are never publicly reachable.
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

export async function openCertificate(path) {
  const tab = window.open('', '_blank') // open first so pop-up blockers allow it
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300)
  if (error) { tab?.close(); throw new Error(error.message) }
  if (tab) tab.location = data.signedUrl
  else window.location.assign(data.signedUrl)
}

export async function removeCertificate(cert) {
  const { error } = await supabase.storage.from(BUCKET).remove([cert.path])
  if (error) throw new Error(error.message)
  await q(supabase.from('certificates').delete().match({ student_id: cert.student_id, rank_id: cert.rank_id }))
}
