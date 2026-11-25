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
  photoUrl?: string
  createdAt: string
  updatedAt: string
}

const INCIDENTS_COLLECTION = 'zoo_incidents'
const INCIDENTS_CACHE_KEY = 'smartzoo_incidents_v1'

function formatDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Waktu tidak tersedia' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function extractPhoneNumber(text: string): string | null {
  if (!text) return null
  const match = text.match(/(?:HP|Kontak Pelapor|WA|Telepon)?[:\s]*((?:\+62|62|08)[0-9\s-]{8,16})/i)
  if (!match) return null
  const cleaned = match[1].replace(/[\s-]/g, '')
  if (cleaned.startsWith('08')) return cleaned
  if (cleaned.startsWith('+62')) return `0${cleaned.slice(3)}`
  if (cleaned.startsWith('62')) return `0${cleaned.slice(2)}`
  return cleaned
}

export default function IncidentCenter({ role, currentUserEmail }: { role: 'admin' | 'security'; currentUserEmail: string }) {
  const [incidents, setIncidents] = useState<ZooIncident[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  // State untuk Modal Kirim Kabar / Info via WhatsApp
  const [waModalOpen, setWaModalOpen] = useState(false)
  const [waTargetIncident, setWaTargetIncident] = useState<ZooIncident | null>(null)
  const [waRecipientName, setWaRecipientName] = useState('')
  const [waRecipientPhone, setWaRecipientPhone] = useState('')
  const [waTemplate, setWaTemplate] = useState<'found' | 'searching' | 'info' | 'custom'>('found')
  const [waCustomMessage, setWaCustomMessage] = useState('')

  useEffect(() => {
    const loadFromLocalStorage = () => {
      try {
        const cached = localStorage.getItem(INCIDENTS_CACHE_KEY)
        if (cached) {
          const parsed = JSON.parse(cached) as ZooIncident[]
          setIncidents((current) => {
            const idMap = new Map<string, ZooIncident>()
            if (Array.isArray(parsed)) parsed.forEach((item) => idMap.set(item.id, item))
            current.forEach((item) => idMap.set(item.id, item))
            return Array.from(idMap.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          })
        }
      } catch {}
    }

    loadFromLocalStorage()
    window.addEventListener('smartzoo:incident-reported', loadFromLocalStorage)
    window.addEventListener('storage', loadFromLocalStorage)
    window.addEventListener('rimbakita:data-changed', loadFromLocalStorage)

    const unsubscribe = subscribeToFirestore<ZooIncident>(INCIDENTS_COLLECTION, (items) => {
      const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      setIncidents(sorted)
      setError('')
      try { localStorage.setItem(INCIDENTS_CACHE_KEY, JSON.stringify(sorted)) } catch { /* cache penuh */ }
    }, (reason) => {
      // Jika sinkronisasi Firestore terkendala, tetap gunakan data lokal
      console.warn(`[Firebase] Sinkronisasi Firestore insiden: ${reason.message}`)
    })

    return () => {
      window.removeEventListener('smartzoo:incident-reported', loadFromLocalStorage)
      window.removeEventListener('storage', loadFromLocalStorage)
      window.removeEventListener('rimbakita:data-changed', loadFromLocalStorage)
      unsubscribe()
    }
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
    setIncidents((current) => {
      const next = current.map((item) => (item.id === incident.id ? updated : item))
      try {
        localStorage.setItem(INCIDENTS_CACHE_KEY, JSON.stringify(next))
        window.dispatchEvent(new Event('smartzoo:incident-reported'))
        window.dispatchEvent(new Event('rimbakita:data-changed'))
      } catch {}
      return next
    })

    const saved = await saveToFirestore(INCIDENTS_COLLECTION, updated)
    if (!saved) setNotice(`Status “${incident.title}” diperbarui menjadi ${status} di sistem lokal.`)
    else setNotice(`Insiden “${incident.title}” diperbarui menjadi ${status}.`)
  }

  async function removeIncident(incident: ZooIncident) {
    if (role !== 'admin' || !window.confirm(`Hapus laporan “${incident.title}”?`)) return
    setIncidents((current) => {
      const next = current.filter((item) => item.id !== incident.id)
      try {
        localStorage.setItem(INCIDENTS_CACHE_KEY, JSON.stringify(next))
        window.dispatchEvent(new Event('smartzoo:incident-reported'))
        window.dispatchEvent(new Event('rimbakita:data-changed'))
      } catch {}
      return next
    })

    const deleted = await deleteFromFirestore(INCIDENTS_COLLECTION, incident.id)
    if (!deleted) setNotice('Laporan insiden dihapus dari cache lokal.')
    else setNotice('Laporan insiden dihapus.')
  }

  function openWhatsAppModal(incident: ZooIncident) {
    const rawReporter = incident.reportedBy.replace(/^Pengunjung:\s*/i, '')
    const phone = extractPhoneNumber(incident.reportedBy + ' ' + incident.details) || ''
    const name = rawReporter.replace(/\(HP:.*?\)/i, '').trim() || 'Pengunjung'

    setWaTargetIncident(incident)
    setWaRecipientName(name)
    setWaRecipientPhone(phone)
    setWaTemplate('found')

    const defaultMsg = `Halo Kak ${name}, kami dari Tim Pengelola & Keamanan Smart Zoo mengabarkan terkait laporan Anda ("${incident.title}" di ${incident.location}):\n\nAlhamdulillah, anak / barang / satwa yang dilaporkan telah BERHASIL DITEMUKAN oleh petugas kami dan saat ini aman berada di Posko Informasi & Keamanan Utama Smart Zoo.\n\nSilakan menuju ke Posko Informasi Utama dengan membawa tanda pengenal/identitas untuk proses serah terima. Terima kasih!`
    setWaCustomMessage(defaultMsg)
    setWaModalOpen(true)
  }

  function handleTemplateChange(template: 'found' | 'searching' | 'info' | 'custom') {
    setWaTemplate(template)
    if (!waTargetIncident) return
    const name = waRecipientName
    const inc = waTargetIncident
    if (template === 'found') {
      setWaCustomMessage(`Halo Kak ${name}, kami dari Tim Pengelola & Keamanan Smart Zoo mengabarkan terkait laporan Anda ("${inc.title}" di ${inc.location}):\n\nAlhamdulillah, anak / barang / satwa yang dilaporkan telah BERHASIL DITEMUKAN oleh petugas kami dan saat ini aman berada di Posko Informasi & Keamanan Utama Smart Zoo.\n\nSilakan menuju ke Posko Informasi Utama dengan membawa tanda pengenal/identitas untuk proses serah terima. Terima kasih!`)
    } else if (template === 'searching') {
      setWaCustomMessage(`Halo Kak ${name}, laporan Anda mengenai "${inc.title}" di ${inc.location} saat ini sedang DITANGANI secara intensif oleh seluruh tim keamanan dan pemandu Smart Zoo di lapangan.\n\nMohon tetap berada di area informasi terdekat atau pantau arahan petugas kami. Kami akan segera menghubungi Anda kembali begitu ada perkembangan terbaru. Terima kasih atas kesabarannya.`)
    } else if (template === 'info') {
      setWaCustomMessage(`Halo Kak ${name}, terkait laporan Anda ("${inc.title}" di ${inc.location}) di Smart Zoo:\n\nMohon bantu informasikan foto atau ciri-ciri tambahan (seperti warna pakaian, ciri fisik, atau tanda khusus) untuk mempermudah identifikasi oleh tim kami di lapangan. Terima kasih!`)
    }
  }

  function sendWhatsAppAndResolve() {
    if (!waRecipientPhone.trim()) {
      alert('Nomor WhatsApp pelapor belum tersedia. Masukkan nomor yang dapat dihubungi terlebih dahulu.')
      return
    }
    const cleanPhone = waRecipientPhone.replace(/\D/g, '')
    const targetPhone = cleanPhone.startsWith('0') ? `62${cleanPhone.slice(1)}` : cleanPhone.startsWith('8') ? `62${cleanPhone}` : cleanPhone
    if (targetPhone.length < 10 || targetPhone.length > 15) {
      alert('Nomor WhatsApp tidak valid. Periksa kembali nomor pelapor.')
      return
    }

    const whatsappLink = document.createElement('a')
    whatsappLink.href = `https://wa.me/${targetPhone}?text=${encodeURIComponent(waCustomMessage)}`
    whatsappLink.target = '_blank'
    whatsappLink.rel = 'noopener noreferrer'
    whatsappLink.click()
    setNotice(`WhatsApp dibuka untuk ${waRecipientName}. Pesan belum terkirim sampai Anda menekan Kirim di WhatsApp.`)
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
            <label>Jenis<select name="type"><option>Keadaan darurat</option><option>Anak hilang</option><option>Barang hilang</option><option>Satwa lepas</option><option>Gangguan keamanan</option><option>Kesehatan pengunjung</option><option>Fasilitas rusak</option><option>Lainnya</option></select></label>
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
              {incidents.map((incident) => {
                const isVisitor = incident.reportedBy.toLowerCase().startsWith('pengunjung')
                return (
                  <article className={`incident-card incident-priority-${incident.priority.toLowerCase()}`} key={incident.id}>
                    <div className="incident-card-top">
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className={`incident-priority-tag priority-${incident.priority.toLowerCase()}`}>{incident.priority}</span>
                        {isVisitor && (
                          <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', padding: '3px 8px', borderRadius: '99px', fontSize: '8px', fontWeight: 800, letterSpacing: '.4px' }}>
                            👤 LAPORAN PENGUNJUNG
                          </span>
                        )}
                      </div>
                      <span className={`incident-status status-${incident.status.toLowerCase()}`}>{incident.status}</span>
                    </div>
                    <h4>{incident.title}</h4>
                    <p className="incident-location">⌖ {incident.location} <span>·</span> {incident.type}</p>
                    {isVisitor && (
                      <div style={{ margin: '8px 0', padding: '7px 11px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '7px', fontSize: '10px', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>👤</span>
                        <div>
                          <strong>Nama Pelapor (Pengunjung): </strong>
                          <span>{incident.reportedBy.replace(/^Pengunjung:\s*/i, '')}</span>
                        </div>
                      </div>
                    )}
                    <p className="incident-details">{incident.details}</p>
                    {incident.photoUrl && (
                      <div className="incident-evidence-box">
                        <div className="incident-evidence-header">
                          <span>📷 BUKTI FOTO KEHILANGAN / CIRI-CIRI:</span>
                          <small>Wujud yang dilaporkan pengunjung</small>
                        </div>
                        <div className="incident-evidence-preview">
                          <a href={incident.photoUrl} target="_blank" rel="noopener noreferrer" title="Klik untuk membuka ukuran penuh">
                            <img src={incident.photoUrl} alt={`Bukti foto ${incident.title}`} className="incident-evidence-img" />
                          </a>
                          <div className="incident-evidence-tip">🔍 Klik foto untuk melihat ukuran penuh / memperbesar</div>
                        </div>
                      </div>
                    )}
                    <div className="incident-card-meta">
                      <span>{isVisitor ? `Sumber: ${incident.reportedBy}` : `Petugas: ${incident.reportedBy}`}</span>
                      <time dateTime={incident.createdAt}>{formatDateTime(incident.createdAt)}</time>
                    </div>
                    <div className="incident-card-actions">
                      {incident.status === 'Baru' && <button type="button" onClick={() => void updateIncident(incident, 'Ditangani')}>Ambil penanganan</button>}
                      {incident.status !== 'Selesai' && <button type="button" className="incident-resolve" onClick={() => void updateIncident(incident, 'Selesai')}>Tandai selesai</button>}
                      {role === 'admin' && isVisitor && incident.status !== 'Selesai' && <button type="button" className="incident-whatsapp" onClick={() => openWhatsAppModal(incident)}>Kirim kabar via WhatsApp</button>}
                      {role === 'admin' && <button type="button" className="incident-delete" onClick={() => void removeIncident(incident)}>Hapus</button>}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
      {waModalOpen && waTargetIncident && <div className="incident-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setWaModalOpen(false) }}>
        <section className="incident-whatsapp-modal" role="dialog" aria-modal="true" aria-labelledby="incident-whatsapp-title">
          <button className="incident-modal-close" type="button" onClick={() => setWaModalOpen(false)} aria-label="Tutup">×</button>
          <p className="eyebrow">PEMBERITAHUAN PENGUNJUNG</p>
          <h3 id="incident-whatsapp-title">Kabar melalui WhatsApp</h3>
          <p className="incident-modal-copy">Laporan: <strong>{waTargetIncident.title}</strong> · {waTargetIncident.location}. Periksa nama dan nomor sebelum membuka WhatsApp.</p>
          {waTargetIncident.photoUrl && (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '10px 12px', background: '#f8faf8', border: '1px solid #dce8dd', borderRadius: '10px', margin: '4px 0' }}>
              <img src={waTargetIncident.photoUrl} alt="Foto Kehilangan" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #c2d6c4' }} />
              <div style={{ fontSize: '10px', color: '#4a5d4e', lineHeight: 1.4 }}>
                <strong style={{ display: 'block', color: '#273c2c', fontSize: '11px' }}>📷 Bukti Foto Tersedia</strong>
                <span>Pastikan wujud barang, anak, atau satwa yang ditemukan cocok dengan foto di samping sebelum proses serah terima.</span>
              </div>
            </div>
          )}
          <label>Nama penerima<input value={waRecipientName} onChange={(event) => setWaRecipientName(event.target.value)} maxLength={80} /></label>
          <label>Nomor WhatsApp<input value={waRecipientPhone} onChange={(event) => setWaRecipientPhone(event.target.value)} type="tel" inputMode="tel" placeholder="Contoh: 08123456789" /></label>
          <label>Isi kabar<select value={waTemplate} onChange={(event) => handleTemplateChange(event.target.value as 'found' | 'searching' | 'info' | 'custom')}>
            <option value="found">Barang / anak / satwa telah ditemukan</option>
            <option value="searching">Laporan sedang ditangani</option>
            <option value="info">Meminta informasi tambahan</option>
            <option value="custom">Pesan khusus</option>
          </select></label>
          <label>Pesan<textarea value={waCustomMessage} onChange={(event) => { setWaTemplate('custom'); setWaCustomMessage(event.target.value) }} rows={6} maxLength={1500} /></label>
          <p className="incident-modal-note">WhatsApp akan dibuka dengan pesan siap kirim. Admin harus menekan tombol <strong>Kirim</strong> di WhatsApp; pesan tidak dikirim otomatis. Setelah pesan dikirim, kembali ke laporan dan tandai selesai.</p>
          <div className="incident-modal-actions">
            <button type="button" className="incident-whatsapp-send" onClick={() => sendWhatsAppAndResolve()}>Buka WhatsApp</button>
            <button type="button" onClick={() => setWaModalOpen(false)}>Tutup</button>
          </div>
        </section>
      </div>}
      <p className="incident-disclaimer">Untuk demonstrasi sistem. Prosedur tanggap darurat resmi dan kontak darurat setempat tetap harus digunakan pada kondisi nyata.</p>
    </section>
  )
}
