import { useEffect, useState, type FormEvent } from 'react'
import { deleteFromFirestore, saveToFirestore, subscribeToFirestore } from './firebase'
import './IncidentCenter.css'

export type IncidentPriority = 'Kritis' | 'Tinggi' | 'Sedang'
export type IncidentStatus = 'Baru' | 'Ditangani' | 'Selesai'

export type ZooIncident = {
  id: string
  title: string
  type: string
  location: string
  priority: IncidentPriority
  status: IncidentStatus
  details: string
  reportedBy: string
  createdAt: string
  updatedAt: string
}

const INCIDENTS_COLLECTION = 'zoo_incidents'
const INCIDENTS_CACHE_KEY = 'smartzoo_incidents_v1'

function formatDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Waktu tidak tersedia' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export default function IncidentCenter({ role, currentUserEmail }: { role: 'admin' | 'security'; currentUserEmail: string }) {
  const [incidents, setIncidents] = useState<ZooIncident[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    try {
      const cached = localStorage.getItem(INCIDENTS_CACHE_KEY)
      if (cached) setIncidents(JSON.parse(cached) as ZooIncident[])
    } catch {
      // Cache lokal opsional; snapshot Firestore tetap menjadi sumber data.
    }
    return subscribeToFirestore<ZooIncident>(INCIDENTS_COLLECTION, (items) => {
      const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      setIncidents(sorted)
      setError('')
      try { localStorage.setItem(INCIDENTS_CACHE_KEY, JSON.stringify(sorted)) } catch { /* cache penuh */ }
    }, (reason) => setError(`Sinkronisasi real-time gagal: ${reason.message}`))
  }, [])

  async function reportIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const now = new Date().toISOString()
    const incident: ZooIncident = {
      id: crypto.randomUUID(),
      title: String(data.get('title') ?? '').trim(),
      type: String(data.get('type') ?? 'Keadaan darurat'),
      location: String(data.get('location') ?? '').trim(),
      priority: String(data.get('priority') ?? 'Sedang') as IncidentPriority,
      status: 'Baru',
      details: String(data.get('details') ?? '').trim(),
      reportedBy: currentUserEmail,
      createdAt: now,
      updatedAt: now,
    }
    if (!incident.title || !incident.location || !incident.details) return
    setSaving(true)
    const saved = await saveToFirestore(INCIDENTS_COLLECTION, incident)
    setSaving(false)
    if (!saved) {
      setError('Laporan belum terkirim. Periksa login dan Firestore Rules, lalu coba lagi.')
      return
    }
    setNotice('Laporan insiden terkirim. Perubahan akan tampil real-time pada perangkat yang terhubung.')
    form.reset()
  }

  async function updateIncident(incident: ZooIncident, status: IncidentStatus) {
    const updated = { ...incident, status, updatedAt: new Date().toISOString() }
    const saved = await saveToFirestore(INCIDENTS_COLLECTION, updated)
    if (!saved) setError('Status belum tersimpan. Periksa koneksi dan izin akses Firestore.')
    else setNotice(`Insiden “${incident.title}” diperbarui menjadi ${status}.`)
  }

  async function removeIncident(incident: ZooIncident) {
    if (role !== 'admin' || !window.confirm(`Hapus laporan “${incident.title}”?`)) return
    const deleted = await deleteFromFirestore(INCIDENTS_COLLECTION, incident.id)
    if (!deleted) setError('Laporan tidak dapat dihapus. Periksa izin Firestore.')
    else setNotice('Laporan insiden dihapus.')
  }

  const activeCount = incidents.filter((item) => item.status !== 'Selesai').length
  const criticalCount = incidents.filter((item) => item.priority === 'Kritis' && item.status !== 'Selesai').length

  return (
    <section className="incident-center">
      <header className="incident-heading">
        <div>
          <p className="eyebrow">KOORDINASI LAPANGAN · LIVE</p>
          <h2>Pusat Komando Insiden</h2>
          <p>Laporan keamanan, satwa lepas, anak hilang, dan keadaan darurat tersinkron langsung untuk Admin dan Petugas Keamanan.</p>
        </div>
        <span className="incident-live"><i /> REAL-TIME</span>
      </header>

      <div className="incident-stats">
        <div><span>Insiden aktif</span><strong>{activeCount}</strong></div>
        <div><span>Prioritas kritis</span><strong className={criticalCount ? 'incident-critical-number' : ''}>{criticalCount}</strong></div>
        <div><span>Laporan tersimpan</span><strong>{incidents.length}</strong></div>
      </div>

      {error && <div className="incident-error" role="alert">{error}</div>}
      {notice && <div className="incident-notice" role="status">✓ {notice}<button type="button" onClick={() => setNotice('')} aria-label="Tutup pemberitahuan">×</button></div>}

      <div className="incident-columns">
        <form className="incident-form" onSubmit={reportIncident}>
          <div>
            <p className="eyebrow">LAPORAN BARU</p>
            <h3>Kirim pembaruan lapangan</h3>
          </div>
          <label>Judul insiden<input name="title" required maxLength={100} placeholder="Contoh: Pengunjung anak terpisah dari rombongan" /></label>
          <div className="incident-form-row">
            <label>Jenis<select name="type"><option>Keadaan darurat</option><option>Anak hilang</option><option>Satwa lepas</option><option>Gangguan keamanan</option><option>Kesehatan pengunjung</option><option>Fasilitas rusak</option><option>Lainnya</option></select></label>
            <label>Prioritas<select name="priority"><option>Kritis</option><option>Tinggi</option><option selected>Sedang</option></select></label>
          </div>
          <label>Lokasi<input name="location" required maxLength={100} placeholder="Contoh: Zona Sabana, dekat Gerbang Utara" /></label>
          <label>Detail & tindakan yang sudah dilakukan<textarea name="details" required rows={4} maxLength={1200} placeholder="Jelaskan situasi singkat, waktu kejadian, dan bantuan yang diperlukan…" /></label>
          <button className="button-primary" type="submit" disabled={saving}>{saving ? 'Mengirim laporan…' : 'Kirim laporan ke pusat komando'}</button>
          <small>Pelapor: {currentUserEmail} · Semua perubahan dicatat pada database bersama.</small>
        </form>

        <section className="incident-feed" aria-live="polite">
          <div className="incident-feed-title"><div><p className="eyebrow">PEMANTAUAN LANGSUNG</p><h3>Linimasa insiden</h3></div><span>{activeCount} aktif</span></div>
          {incidents.length === 0 ? (
            <div className="incident-empty"><span>🛡️</span><strong>Belum ada laporan insiden</strong><p>Laporan baru dari petugas akan muncul di sini secara langsung.</p></div>
          ) : (
            <div className="incident-list">
              {incidents.map((incident) => (
                <article className={`incident-card incident-priority-${incident.priority.toLowerCase()}`} key={incident.id}>
                  <div className="incident-card-top"><span className={`incident-priority-tag priority-${incident.priority.toLowerCase()}`}>{incident.priority}</span><span className={`incident-status status-${incident.status.toLowerCase()}`}>{incident.status}</span></div>
                  <h4>{incident.title}</h4>
                  <p className="incident-location">⌖ {incident.location} <span>·</span> {incident.type}</p>
                  <p className="incident-details">{incident.details}</p>
                  <div className="incident-card-meta"><span>Oleh {incident.reportedBy}</span><time dateTime={incident.createdAt}>{formatDateTime(incident.createdAt)}</time></div>
                  <div className="incident-card-actions">
                    {incident.status === 'Baru' && <button type="button" onClick={() => void updateIncident(incident, 'Ditangani')}>Ambil penanganan</button>}
                    {incident.status !== 'Selesai' && <button type="button" className="incident-resolve" onClick={() => void updateIncident(incident, 'Selesai')}>Tandai selesai</button>}
                    {role === 'admin' && <button type="button" className="incident-delete" onClick={() => void removeIncident(incident)}>Hapus</button>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
      <p className="incident-disclaimer">Untuk demonstrasi sistem. Prosedur tanggap darurat resmi dan kontak darurat setempat tetap harus digunakan pada kondisi nyata.</p>
    </section>
  )
}
