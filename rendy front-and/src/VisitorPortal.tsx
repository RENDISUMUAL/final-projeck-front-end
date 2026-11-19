import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import './VisitorPortal.css'

type PortalTab = 'home' | 'news' | 'map' | 'animals' | 'staff' | 'feeding' | 'conservation' | 'tickets' | 'report'
type Animal = { id: string; name: string; scientificName?: string; category?: string; species?: string; habitat?: string; diet?: string; imageUrl?: string; conservationStatus?: string; description?: string }
type Staff = { id: string; name: string; role: string; shift?: string }
type Feeding = { id: string; animalName: string; food: string; amount: string; time: string; frequency: string; done?: boolean }
type Conservation = { id: string; animalName: string; conservationStatus: string; births: number; lastBirth: string; notes: string }
type Habitat = { id: string; name: string; location: string }
type TicketPrices = { adult: number; child: number }

const tabs: Array<{ id: PortalTab; label: string; icon: string }> = [
  { id: 'home', label: 'Beranda', icon: '⌂' },
  { id: 'news', label: 'Berita & Edukasi', icon: '✳' },
  { id: 'map', label: 'Peta Lokasi', icon: '⌖' },
  { id: 'animals', label: 'Jelajah Satwa', icon: '🐾' },
  { id: 'staff', label: 'Petugas', icon: '♙' },
  { id: 'feeding', label: 'Jadwal Pakan', icon: '🥬' },
  { id: 'conservation', label: 'Konservasi', icon: '🌱' },
  { id: 'tickets', label: 'Pesan Tiket', icon: '▣' },
  { id: 'report', label: 'Lapor Insiden', icon: '🚨' },
]

const articles = [
  { title: 'Mengapa koridor hutan penting bagi harimau?', category: 'KONSERVASI', image: 'https://images.unsplash.com/photo-1561731216-c3a4d99437d5?w=900&auto=format&fit=crop&q=85', alt: 'Harimau di habitat hutan', copy: 'Bentang alam yang terhubung membantu harimau bergerak di antara wilayah jelajah dan menjaga populasi satwa liar tetap sehat.', source: 'https://www.worldwildlife.org/species/tiger', sourceName: 'WWF · Tiger' },
  { title: 'Hutan menyediakan rumah dan pakan bagi orangutan', category: 'EDUKASI SATWA', image: 'https://images.unsplash.com/photo-1540573133985-87b6da6d54a9?w=900&auto=format&fit=crop&q=85', alt: 'Orangutan di pepohonan', copy: 'Perlindungan habitat membantu orangutan menemukan buah, bergerak di kanopi, dan membesarkan anak dengan aman.', source: 'https://www.worldwildlife.org/species/orangutan', sourceName: 'WWF · Orangutan' },
  { title: 'Buaya muara dan keseimbangan ekosistem perairan', category: 'FAKTA SPESIES', image: 'https://images.unsplash.com/photo-1522069169874-c58ec4b76be5?w=900&auto=format&fit=crop&q=85', alt: 'Buaya di habitat air payau', copy: 'Buaya muara menjaga keseimbangan rantai makanan di sungai, rawa, dan perairan pesisir dengan menjadi predator puncak yang menjaga ekosistem tetap sehat.', source: 'https://www.worldwildlife.org/species/crocodile', sourceName: 'WWF · Buaya' },
]

const money = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
const today = () => {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

export default function VisitorPortal({ onManagerLogin }: { onManagerLogin: () => void }) {
  const [tab, setTab] = useState<PortalTab>('home')
  const [animals, setAnimals] = useState<Animal[]>([])
  const [habitats, setHabitats] = useState<Habitat[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [feedings, setFeedings] = useState<Feeding[]>([])
  const [conservation, setConservation] = useState<Conservation[]>([])
  const [prices, setPrices] = useState<TicketPrices>({ adult: 50000, child: 35000 })
  const [search, setSearch] = useState('')
  const [adultQty, setAdultQty] = useState(1)
  const [childQty, setChildQty] = useState(0)
  const [receipt, setReceipt] = useState<{ code: string; name: string; date: string; total: number } | null>(null)
  const [reportSent, setReportSent] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [live, setLive] = useState(false)

  useEffect(() => {
    const subscriptions = [
      onSnapshot(collection(db, 'zoo_animals'), (snapshot) => setAnimals(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as Animal)), fail),
      onSnapshot(collection(db, 'zoo_habitats'), (snapshot) => setHabitats(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as Habitat)), fail),
      onSnapshot(doc(db, 'zoo_public_settings', 'staff'), (snapshot) => {
        const published = snapshot.data()?.items
        if (Array.isArray(published)) setStaff(published as Staff[])
      }, fail),
      onSnapshot(collection(db, 'zoo_feeding_schedules'), (snapshot) => setFeedings(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as Feeding)), fail),
      onSnapshot(collection(db, 'zoo_conservation_records'), (snapshot) => setConservation(snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as Conservation)), fail),
      onSnapshot(doc(db, 'zoo_public_settings', 'tickets'), (snapshot) => {
        if (snapshot.exists()) setPrices({ adult: Number(snapshot.data().adult) || 50000, child: Number(snapshot.data().child) || 35000 })
        setLive(true)
      }, fail),
    ]
    return () => subscriptions.forEach((unsubscribe) => unsubscribe())
    function fail(reason: Error) {
      setError(`Sebagian data belum dapat dimuat dari pusat. Periksa aturan Firestore: ${reason.message}`)
    }
  }, [])

  const filteredAnimals = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id-ID')
    return animals.filter((animal) => !query || [animal.name, animal.scientificName ?? '', animal.species ?? '', animal.habitat ?? ''].some((value) => value.toLocaleLowerCase('id-ID').includes(query)))
  }, [animals, search])

  async function submitTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const visitorName = String(data.get('name') ?? '').trim()
    const date = String(data.get('date') ?? '')
    const quantity = adultQty + childQty
    if (!visitorName || !date || quantity < 1) return
    const total = adultQty * prices.adult + childQty * prices.child
    const code = `RIM-${Date.now().toString(36).toUpperCase()}`
    setSaving(true)
    setError('')
    try {
      await setDoc(doc(db, 'zoo_tickets', code), {
        id: code,
        visitorName,
        date,
        quantity,
        adultQty,
        childQty,
        total,
        paymentMethod: String(data.get('paymentMethod') ?? 'QRIS'),
        paymentStatus: 'Belum bayar',
        status: 'Belum digunakan',
        createdAt: new Date().toISOString(),
        source: 'visitor-portal',
      })
      setReceipt({ code, name: visitorName, date, total })
      setTab('tickets')
      form.reset()
      setAdultQty(1)
      setChildQty(0)
    } catch (reason) {
      setError(reason instanceof Error ? `Pemesanan belum tersimpan: ${reason.message}` : 'Pemesanan belum tersimpan. Periksa koneksi.')
    } finally {
      setSaving(false)
    }
  }

  async function submitIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setSaving(true)
    setError('')
    try {
      const incidentId = crypto.randomUUID()
      const now = new Date().toISOString()
      const rawName = String(data.get('name') ?? '').trim()
      const reporterName = rawName || 'Pengunjung Anonim'
      const phone = String(data.get('phone') ?? '').trim()
      const reportedBy = phone ? `Pengunjung: ${reporterName} (HP: ${phone})` : `Pengunjung: ${reporterName}`
      const rawDetails = String(data.get('details') ?? '').trim()
      const fullDetails = phone ? `${rawDetails}\n\n[Nomor Kontak Pelapor: ${phone}]` : rawDetails

      const incidentData = {
        id: incidentId,
        title: String(data.get('title') ?? '').trim(),
        type: String(data.get('type') ?? 'Lainnya'),
        location: String(data.get('location') ?? '').trim(),
        priority: String(data.get('priority') ?? 'Sedang') as 'Kritis' | 'Tinggi' | 'Sedang',
        status: 'Baru' as const,
        details: fullDetails,
        reportedBy: reportedBy.slice(0, 100),
        createdAt: now,
        updatedAt: now,
      }

      // 1. Simpan ke localStorage agar Pusat Komando Admin langsung membaca seketika
      try {
        const cached = JSON.parse(localStorage.getItem('smartzoo_incidents_v1') || '[]')
        const updated = [incidentData, ...(Array.isArray(cached) ? cached.filter((item: { id: string }) => item.id !== incidentId) : [])]
        localStorage.setItem('smartzoo_incidents_v1', JSON.stringify(updated))
        window.dispatchEvent(new Event('smartzoo:incident-reported'))
        window.dispatchEvent(new Event('rimbakita:data-changed'))
      } catch (storageErr) {
        console.warn('Gagal simpan lokal cache insiden:', storageErr)
      }

      // 2. Simpan ke Cloud Firestore (zoo_incidents)
      try {
        const docRef = doc(db, 'zoo_incidents', incidentId)
        await setDoc(docRef, {
          title: incidentData.title,
          type: incidentData.type,
          location: incidentData.location,
          priority: incidentData.priority,
          status: 'Baru',
          details: incidentData.details,
          reportedBy: incidentData.reportedBy,
          createdAt: now,
          updatedAt: now,
        })
      } catch (firestoreErr) {
        console.warn('Penyimpanan Firestore gagal (laporan tetap tersimpan di lokal):', firestoreErr)
      }

      setReportSent(true)
      form.reset()
    } catch (reason) {
      setError(reason instanceof Error ? `Laporan belum terkirim: ${reason.message}` : 'Laporan belum terkirim. Periksa koneksi.')
    } finally {
      setSaving(false)
    }
  }

  function navigate(next: PortalTab) {
    setTab(next)
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="visitor-app">
      <header className="visitor-topbar">
        <a className="visitor-brand" href="#pengunjung" onClick={(event) => { event.preventDefault(); navigate('home') }}>
          <span>🌿</span><strong>Taman Satwa<br />Nusantara<small>SMART ZOO · AREA PENGUNJUNG</small></strong>
        </a>
        <nav className="visitor-nav" aria-label="Menu pengunjung">
          {tabs.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><span>{item.icon}</span>{item.label}</button>)}
        </nav>
        <button className="visitor-manager-link" onClick={onManagerLogin}>Masuk pengelola <span>↗</span></button>
      </header>

      <main className="visitor-main">
        <div className="visitor-welcome-row"><div><span className="visitor-live"><i /> {live ? 'TERHUBUNG KE PUSAT' : 'MENGHUBUNGKAN'}</span><p>Informasi pengunjung · diperbarui dari pusat pengelola</p></div><span>{new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span></div>
        {error && <div className="visitor-alert" role="alert">{error}<button onClick={() => setError('')} aria-label="Tutup">×</button></div>}

        {tab === 'home' && <>
          <section className="visitor-hero"><div className="visitor-hero-copy"><span className="visitor-kicker">🌏 SELAMAT DATANG DI TAMAN SATWA NUSANTARA</span><h1>Temukan cerita<br />di setiap habitat.</h1><p>Jelajahi satwa, rencanakan kunjungan, dan kenali upaya konservasi kami dalam satu tempat.</p><div><button className="visitor-primary" onClick={() => navigate('animals')}>Jelajahi satwa <span>→</span></button><button className="visitor-secondary" onClick={() => navigate('map')}>Lihat peta kawasan</button></div></div><div className="visitor-hero-art"><span className="visitor-sun" /><span>🐅</span><small>Rumah bagi kehidupan liar</small></div></section>
          <section className="visitor-quick-grid"><button onClick={() => navigate('tickets')}><span>🎟️</span><strong>Pesan tiket</strong><small>Harga & pemesanan</small></button><button onClick={() => navigate('map')}><span>🗺️</span><strong>Jelajahi peta</strong><small>Zona dan fasilitas</small></button><button onClick={() => navigate('feeding')}><span>🥬</span><strong>Jadwal pakan</strong><small>Waktu edukasi satwa</small></button><button onClick={() => navigate('report')}><span>🛟</span><strong>Butuh bantuan?</strong><small>Kirim laporan langsung</small></button></section>
          <NewsGrid onOpen={() => navigate('news')} compact />
          <section className="visitor-home-stats"><div><strong>{animals.length}</strong><span>satwa terdata</span></div><div><strong>{habitats.length}</strong><span>zona habitat</span></div><div><strong>{staff.length}</strong><span>petugas tercatat</span></div><div><strong>{conservation.length}</strong><span>program konservasi</span></div></section>
        </>}

        {tab === 'news' && <section className="visitor-section"><SectionTitle eyebrow="KABAR & EDUKASI" title="Cerita satwa dan konservasi" copy="Informasi edukatif untuk mengenal satwa serta menjaga habitatnya." /><NewsGrid /></section>}

        {tab === 'animals' && <section className="visitor-section"><SectionTitle eyebrow="ENSIKLOPEDIA PENGUNJUNG" title="Jelajah satwa" copy="Informasi umum koleksi satwa dan zona habitat. Data mengikuti pembaruan pengelola." /><label className="visitor-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama satwa, spesies, atau habitat…" /></label><div className="visitor-animal-grid">{filteredAnimals.map((animal) => <article className="visitor-animal-card" key={animal.id}><img src={animal.imageUrl || 'https://images.unsplash.com/photo-1534188753412-3e26d0d618d6?w=800'} alt={animal.name} loading="lazy"/><div><span className="visitor-animal-tag">{animal.category || animal.species || 'Satwa'} · {animal.habitat || 'Habitat'}</span><h3>{animal.name}</h3>{animal.scientificName && <em>{animal.scientificName}</em>}<p>{animal.description || `Kenali ${animal.name} dan habitat ${animal.habitat || 'alaminya'} bersama pemandu kami.`}</p><button onClick={() => navigate('map')}>Lihat lokasi di peta →</button></div></article>)}{filteredAnimals.length === 0 && <EmptyState title="Satwa belum tersedia" copy="Data yang dipublikasikan pengelola akan tampil di sini."/>}</div></section>}

        {tab === 'map' && <section className="visitor-section"><SectionTitle eyebrow="PANDUAN KAWASAN" title="Peta & arah kunjungan" copy="Peta ini merupakan denah ilustratif kawasan, bukan peta navigasi GPS."/><div className="visitor-map-layout"><div className="visitor-map-card"><svg viewBox="0 0 900 500" role="img" aria-label="Denah ilustratif taman satwa"><rect width="900" height="500" rx="25" fill="#edf4e5"/><path d="M42 43 Q200 15 330 40T610 38T855 55V440Q700 475 560 447T280 463T42 438Z" fill="#e6f0dc" stroke="#c5dbb9" strokeWidth="4"/><path d="M90 252 C240 208 360 245 475 230S690 257 810 218" fill="none" stroke="#fff8e9" strokeWidth="34" strokeLinecap="round"/><path d="M90 252 C240 208 360 245 475 230S690 257 810 218" fill="none" stroke="#d8c99e" strokeWidth="3" strokeDasharray="7 12"/><path d="M110 100Q205 65 305 105L320 208Q218 241 112 202Z M355 80Q470 60 565 98L555 207Q452 235 355 205Z M615 90Q728 65 805 108L795 206Q698 231 615 200Z M112 300Q220 272 323 313L310 400Q210 426 125 391Z M365 294Q466 270 568 307L562 398Q465 429 372 392Z M616 290Q715 273 800 305L790 398Q690 425 620 391Z" fill="#d5e8c5" stroke="#9fbe91" strokeWidth="3"/><ellipse cx="720" cy="145" rx="63" ry="34" fill="#8acdc4" stroke="white" strokeWidth="6"/><g fill="#557452" fontFamily="sans-serif" fontSize="12" fontWeight="700" textAnchor="middle"><text x="214" y="160">ZONA SABANA</text><text x="460" y="152">HUTAN HUJAN</text><text x="711" y="165">DANAU BUAYA</text><text x="210" y="355">KANDANG BURUNG</text><text x="464" y="355">RUMAH PRIMATA</text><text x="708" y="353">KONSERVASI</text></g><g fontSize="25" textAnchor="middle"><text x="210" y="198">🦁</text><text x="460" y="192">🐘</text><text x="711" y="200">🐊</text><text x="215" y="390">🦜</text><text x="465" y="390">🦧</text><text x="710" y="390">🦒</text></g><g fill="#fff" stroke="#d9ddc9"><rect x="61" y="224" width="64" height="46" rx="11"/><rect x="450" y="209" width="60" height="42" rx="11"/><rect x="802" y="193" width="58" height="42" rx="11"/></g><g fontSize="19" textAnchor="middle"><text x="93" y="254">🎟️</text><text x="480" y="238">🍽️</text><text x="831" y="222">🚪</text></g><g fill="#667a63" fontFamily="sans-serif" fontSize="11" fontWeight="700"><text x="55" y="292">PINTU MASUK</text><text x="784" y="257">PINTU KELUAR</text><text x="828" y="65">↑ U</text></g></svg><div className="visitor-map-caption">Denah ilustratif Taman Satwa Nusantara · tidak untuk navigasi darurat atau pengukuran lapangan.</div></div><aside className="visitor-map-legend"><h3>Rencanakan rute</h3><ol><li><b>1</b><span>Masuk dari loket utama</span></li><li><b>2</b><span>Jelajahi Zona Sabana</span></li><li><b>3</b><span>Teruskan ke area hutan hujan</span></li><li><b>4</b><span>Istirahat di area makan</span></li><li><b>5</b><span>Kunjungi Rumah Primata & konservasi</span></li><li><b>6</b><span>Akhiri perjalanan di pintu keluar</span></li></ol><p>Ikuti papan petunjuk di lokasi dan arahan petugas. Jarak pada denah tidak berskala.</p></aside></div><div className="visitor-habitat-links">{habitats.map((habitat) => <article key={habitat.id}><span>🌳</span><div><strong>{habitat.name}</strong><small>{habitat.location}</small></div></article>)}</div></section>}

        {tab === 'staff' && <section className="visitor-section"><SectionTitle eyebrow="TIM TAMAN" title="Petugas yang siap membantu" copy="Kenali tim kami. Demi keamanan, kontak pribadi tidak ditampilkan pada halaman publik."/><div className="visitor-staff-grid">{staff.map((person) => <article key={person.id}><span>👤</span><div><strong>{person.name}</strong><small>{person.role}{person.shift ? ` · Shift ${person.shift}` : ''}</small></div><i>Petugas</i></article>)}{!staff.length && <EmptyState title="Informasi petugas belum tersedia" copy="Daftar publik akan diperbarui pengelola."/>}</div></section>}

        {tab === 'feeding' && <section className="visitor-section"><SectionTitle eyebrow="AGENDA EDUKASI" title="Jadwal pakan satwa" copy="Jadwal dapat berubah mengikuti kesehatan dan kebutuhan satwa. Tanyakan kepada pemandu untuk sesi edukasi."/><div className="visitor-feeding-list">{[...feedings].sort((a,b)=>a.time.localeCompare(b.time)).map((item) => <article key={item.id}><time>{item.time}</time><span>🥬</span><div><strong>{item.animalName}</strong><small>{item.food} · {item.frequency}</small></div><b>{item.done ? 'Selesai' : 'Agenda'}</b></article>)}{!feedings.length && <EmptyState title="Jadwal belum dipublikasikan" copy="Silakan cek kembali nanti."/>}</div></section>}

        {tab === 'conservation' && <section className="visitor-section"><SectionTitle eyebrow="LINDUNGI KEANEKARAGAMAN" title="Program konservasi" copy="Ringkasan publik dari catatan konservasi pengelola. Informasi sensitif perawatan tidak ditampilkan."/><div className="visitor-conservation-grid">{conservation.map((item) => <article key={item.id}><span className="visitor-conservation-status">{item.conservationStatus}</span><h3>{item.animalName}</h3><div className="visitor-birth-stat"><strong>{item.births}</strong><span>kelahiran tercatat</span></div><p>{item.notes}</p>{item.lastBirth !== '—' && <small>Pembaruan kelahiran terakhir: {item.lastBirth}</small>}</article>)}{!conservation.length && <EmptyState title="Program konservasi belum tersedia" copy="Konten akan muncul setelah diperbarui pengelola."/>}</div><div className="visitor-ethics-note">🌿 Informasi ini disediakan untuk edukasi; satwa tidak boleh diberi makan atau diganggu di luar arahan petugas.</div></section>}

        {tab === 'tickets' && <section className="visitor-section"><SectionTitle eyebrow="KUNJUNGAN ANDA" title="Pesan tiket kunjungan" copy="Buat reservasi dan simpan kode pesanan. Pembayaran langsung belum terhubung ke payment gateway."/><div className="visitor-ticket-layout"><form className="visitor-ticket-form" onSubmit={(event) => void submitTicket(event)}><h3>Rincian tiket</h3><label>Nama pemesan<input name="name" required maxLength={100} placeholder="Nama lengkap"/></label><label>Tanggal kunjungan<input name="date" type="date" min={today()} defaultValue={today()} required/></label><div className="visitor-qty-row"><label>Dewasa <small>{money(prices.adult)} / orang</small><input type="number" min="0" max="20" value={adultQty} onChange={(event) => setAdultQty(Number(event.target.value))}/></label><label>Anak <small>{money(prices.child)} / orang</small><input type="number" min="0" max="20" value={childQty} onChange={(event) => setChildQty(Number(event.target.value))}/></label></div><label>Metode pembayaran saat kedatangan<select name="paymentMethod"><option>QRIS (simulasi)</option><option>Tunai di loket</option><option>Transfer (simulasi)</option></select></label><div className="visitor-ticket-total"><span>Total estimasi</span><strong>{money(adultQty * prices.adult + childQty * prices.child)}</strong></div><button className="visitor-primary" type="submit" disabled={saving}>{saving ? 'Menyimpan pesanan…' : 'Buat pesanan tiket'}</button><small className="visitor-payment-note">Demo reservasi: belum ada transaksi uang nyata. Pembayaran dan validasi tiket dilakukan di loket.</small></form><aside className="visitor-ticket-side"><span>🎟️</span><h3>Satu langkah menuju petualangan</h3><p>Pesanan tersimpan ke Firestore dan dapat dipantau pengelola. Bawa kode pesanan saat ke loket.</p>{receipt && <div className="visitor-receipt"><small>PESANAN TERSIMPAN</small><strong>{receipt.code}</strong><span>{receipt.name} · {receipt.date}</span><b>{money(receipt.total)}</b><img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(receipt.code)}`} alt={`QR referensi pesanan ${receipt.code}`}/><em>QR ini hanya kode referensi reservasi, bukan bukti pembayaran.</em></div>}</aside></div></section>}

        {tab === 'report' && <section className="visitor-section"><SectionTitle eyebrow="BANTUAN & KESELAMATAN" title="Sampaikan laporan kepada petugas" copy="Laporan dikirim langsung ke Pusat Komando dan muncul real-time. Untuk keadaan darurat, segera cari petugas terdekat."/><div className="visitor-report-layout"><form className="visitor-report-form" onSubmit={(event) => void submitIncident(event)}>
          <label>Nama pelapor (Pengunjung)<input name="name" required maxLength={60} placeholder="Tulis nama lengkap Anda (contoh: Rendy Sumual)"/></label>
          <label>Nomor HP / WhatsApp (opsional)<input name="phone" type="tel" maxLength={20} placeholder="Contoh: 08123456789 (agar petugas dapat menghubungi Anda)"/></label>
          <label>Jenis laporan<select name="type"><option>Keadaan darurat</option><option selected>Anak hilang</option><option>Barang hilang</option><option>Satwa lepas</option><option>Gangguan keamanan</option><option>Kesehatan pengunjung</option><option>Fasilitas rusak</option><option>Lainnya</option></select></label>
          <label>Prioritas<select name="priority"><option>Kritis</option><option>Tinggi</option><option selected>Sedang</option></select></label>
          <label>Lokasi kejadian<input name="location" required maxLength={100} placeholder="Contoh: Zona Sabana, dekat kandang jerapah"/></label>
          <label>Judul laporan<input name="title" required maxLength={100} placeholder="Contoh: Anak terpisah dari rombongan"/></label>
          <label>Detail & Ciri-ciri<textarea name="details" required rows={4} maxLength={1200} placeholder="Ceritakan situasi, ciri-ciri anak/satwa/barang, dan bantuan yang diperlukan…"/></label>
          <button className="visitor-primary" type="submit" disabled={saving}>{saving ? 'Mengirim ke Pusat Komando…' : 'Kirim laporan ke petugas'}</button>
          <small>Laporan ini langsung diteruskan ke Web Admin Pusat Komando agar petugas segera mengetahui siapa pelapornya.</small>
        </form><aside className="visitor-report-help"><span>🛟</span><h3>Perlu bantuan segera?</h3><p>Datangi petugas berseragam atau pos informasi terdekat. Laporan ini diteruskan ke pusat komando pengelola secara real-time.</p>{reportSent && <div className="visitor-report-success" role="status">✓ Laporan berhasil terkirim ke Pusat Komando! Nama pelapor dan detail telah masuk ke sistem admin.</div>}</aside></div></section>}

        <footer className="visitor-footer"><span>© 2026 Taman Satwa Nusantara · Smart Zoo</span><span>Informasi umum disinkronkan dari pengelola pusat</span></footer>
      </main>
      <nav className="visitor-mobile-nav" aria-label="Navigasi pengunjung mobile">{tabs.slice(0, 5).map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><span>{item.icon}</span><small>{item.label}</small></button>)}</nav>
    </div>
  )
}

function SectionTitle({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <header className="visitor-section-title"><div><p>{eyebrow}</p><h1>{title}</h1><span>{copy}</span></div><span className="visitor-live"><i/>PUSAT TERHUBUNG</span></header>
}

function NewsGrid({ onOpen, compact = false }: { onOpen?: () => void; compact?: boolean }) {
  return <div className={`visitor-news-grid ${compact ? 'compact' : ''}`}>{articles.map((article) => <article className="visitor-news-card" key={article.title}><a href={article.source} target="_blank" rel="noreferrer" className="visitor-news-image"><img src={article.image} alt={article.alt} loading="lazy"/><span>{article.category}</span></a><div><small>{article.sourceName}</small><h3>{article.title}</h3><p>{article.copy}</p><a href={article.source} target="_blank" rel="noreferrer">Baca sumber <b>↗</b></a></div></article>)}{compact && onOpen && <button className="visitor-news-more" onClick={onOpen}>Semua berita & edukasi <span>→</span></button>}</div>
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="visitor-empty"><span>🌱</span><strong>{title}</strong><p>{copy}</p></div>
}
