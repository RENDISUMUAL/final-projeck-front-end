import { useEffect, useState, type FormEvent } from 'react'
import { deleteDoc, doc, setDoc } from 'firebase/firestore'
import { db, subscribeToFirestore } from './firebase'
import './IncidentCenter.css'

type ZooUserRole = { id: string; email: string; role: 'security'; displayName: string; assignedAt: string; assignedBy: string }
const ROLES_COLLECTION = 'zoo_user_roles'

export default function RoleManagement({ adminEmail }: { adminEmail: string }) {
  const [users, setUsers] = useState<ZooUserRole[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => subscribeToFirestore<ZooUserRole>(ROLES_COLLECTION, setUsers, (reason) => {
    setError(`Daftar petugas tidak dapat dimuat: ${reason.message}`)
  }), [])

  async function assignRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const email = String(data.get('email') ?? '').trim().toLowerCase()
    const displayName = String(data.get('displayName') ?? '').trim()
    if (!email || !displayName) return
    setSaving(true)
    setError('')
    try {
      await setDoc(doc(db, ROLES_COLLECTION, email), {
        email,
        displayName,
        role: 'security',
        assignedAt: new Date().toISOString(),
        assignedBy: adminEmail,
      }, { merge: true })
      setNotice(`Akses Petugas Keamanan untuk ${email} berhasil diberikan. Minta petugas login ulang.`)
      form.reset()
    } catch (reason) {
      setError(reason instanceof Error ? `Gagal menyimpan peran: ${reason.message}` : 'Gagal menyimpan peran. Periksa Firestore Rules.')
    } finally {
      setSaving(false)
    }
  }

  async function removeRole(member: ZooUserRole) {
    if (!window.confirm(`Cabut akses Petugas Keamanan untuk ${member.email}?`)) return
    try {
      await deleteDoc(doc(db, ROLES_COLLECTION, member.id))
      setNotice(`Akses ${member.email} dicabut.`)
    } catch (reason) {
      setError(reason instanceof Error ? `Gagal mencabut akses: ${reason.message}` : 'Gagal mencabut akses.')
    }
  }

  return (
    <section className="role-management">
      <header className="incident-heading">
        <div>
          <p className="eyebrow">KONTROL AKSES · RBAC</p>
          <h2>Manajemen Peran Pengelola</h2>
          <p>Admin mengelola akun petugas. Petugas Keamanan hanya mendapat ruang kerja insiden dan informasi lokasi yang diperlukan.</p>
        </div>
        <span className="role-admin-badge">🛡️ ADMIN</span>
      </header>
      {error && <div className="incident-error" role="alert">{error}</div>}
      {notice && <div className="incident-notice" role="status">✓ {notice}<button type="button" onClick={() => setNotice('')} aria-label="Tutup pemberitahuan">×</button></div>}
      <div className="role-grid">
        <form className="incident-form" onSubmit={assignRole}>
          <div><p className="eyebrow">TAMBAH AKUN LAPANGAN</p><h3>Berikan akses petugas</h3></div>
          <label>Nama petugas<input name="displayName" required maxLength={80} placeholder="Contoh: Budi Santoso" /></label>
          <label>Email Google petugas<input name="email" type="email" required maxLength={150} placeholder="petugas@contoh.com" /></label>
          <label>Peran<select value="security" disabled><option value="security">Petugas Keamanan</option></select></label>
          <button className="button-primary" type="submit" disabled={saving}>{saving ? 'Menyimpan…' : '＋ Berikan akses'}</button>
          <small>Petugas harus masuk menggunakan alamat email yang sama. Akses Firestore tetap dibatasi oleh Security Rules.</small>
        </form>
        <section className="role-users-panel">
          <div className="incident-feed-title"><div><p className="eyebrow">AKUN TERDAFTAR</p><h3>Petugas Keamanan</h3></div><span>{users.length} akun</span></div>
          {users.length === 0 ? <div className="incident-empty"><span>👮</span><strong>Belum ada akun petugas</strong><p>Tambahkan email Google petugas untuk mengaktifkan akses lapangan.</p></div> : (
            <div className="role-user-list">
              {users.map((member) => (
                <article className="role-user-row" key={member.id}>
                  <span className="role-user-avatar">🛡️</span>
                  <div><strong>{member.displayName}</strong><small>{member.email}</small></div>
                  <button type="button" onClick={() => void removeRole(member)}>Cabut akses</button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
      <div className="role-permission-note"><strong>Hak akses saat ini</strong><span>Admin: seluruh data dan konfigurasi peran.</span><span>Petugas Keamanan: melihat lokasi/insiden, membuat dan memperbarui laporan insiden. Tidak dapat mengubah inventaris, data pengunjung, tiket, atau data petugas.</span></div>
    </section>
  )
}
