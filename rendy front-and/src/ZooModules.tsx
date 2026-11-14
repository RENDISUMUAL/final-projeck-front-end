import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import './ZooModules.css'
import { doc, setDoc } from 'firebase/firestore'
import { db, useFirestoreCollection } from './firebase'
import IncidentCenter from './IncidentCenter'
import RoleManagement from './RoleManagement'

// Tipe record untuk tiap modul operasional kebun binatang
export type AnimalInfo = {
  name: string
  scientificName?: string
  category?: string
  species: string
  habitat: string
  age?: number
  weight?: string
  gender?: string
  origin?: string
  entryDate?: string
  status?: string
  conservationStatus?: string
  imageUrl?: string
}

type Visitor = { id: string; name: string; phone: string; date: string; groupSize: number; category: string }
type Ticket = {
  id: string
  visitorName: string
  date: string
  quantity: number
  adultQty: number
  childQty: number
  total: number
  paymentMethod: string
  paymentStatus: 'Lunas' | 'Belum bayar'
  status: 'Belum digunakan' | 'Sudah digunakan'
}
type Staff = { id: string; name: string; role: string; phone: string; shift: string }
type Medical = { id: string; animalName: string; date: string; diagnosis: string; disease: string; vaccine: string; medicine: string; nextExam: string; vet: string }
type Feeding = { id: string; animalName: string; food: string; amount: string; time: string; frequency: string; assignedStaff: string; done: boolean }
type Conservation = { id: string; animalName: string; conservationStatus: string; births: number; lastBirth: string; notes: string }
type Attendance = { id: string; staffName: string; date: string; checkIn: string; status: string }

type ModuleView = 'visitors' | 'tickets' | 'staff' | 'medical' | 'feeding' | 'conservation' | 'map' | 'attendance' | 'reports' | 'incidents' | 'roles'
type TourRoute = 'highlights' | 'family'

const habitatGuides: Record<string, { path: string; directions: string[] }> = {
  sabana: {
    path: 'M90 349 C170 316 265 325 380 328 C350 300 311 278 264 273',
    directions: ['Mulai dari Pintu Masuk utama.', 'Ikuti jalur utama ke arah tengah taman.', 'Belok ke cabang utara sebelum Kandang Burung.', 'Zona Sabana berada di depan Anda.'],
  },
  'hutan hujan': {
    path: 'M90 349 C190 316 300 331 413 321 C474 323 531 312 600 320 C591 300 576 283 565 270',
    directions: ['Mulai dari Pintu Masuk utama.', 'Ikuti jalur utama melewati area makan.', 'Teruskan ke bagian tengah-utara taman.', 'Zona Hutan Hujan berada di depan Anda.'],
  },
  'danau buaya': {
    path: 'M90 349 C190 316 300 331 413 321 C570 321 740 316 900 350 C913 324 917 299 917 273',
    directions: ['Mulai dari Pintu Masuk utama.', 'Ikuti jalur utama ke arah timur taman.', 'Belok ke cabang menuju tepi danau.', 'Area Danau Buaya berada di depan Anda.'],
  },
  'rumah primata': {
    path: 'M90 349 C190 316 300 331 413 321 C468 322 535 311 600 320 C633 390 566 473 548 574 C573 557 595 534 609 513',
    directions: ['Mulai dari Pintu Masuk utama.', 'Ikuti jalur utama hingga persimpangan tengah.', 'Ambil cabang selatan menuju Rumah Primata.', 'Rumah Primata berada di sisi selatan jalur.'],
  },
  'kandang burung': {
    path: 'M90 349 C190 316 300 331 413 321 C410 386 365 453 391 514 C354 524 309 518 261 512',
    directions: ['Mulai dari Pintu Masuk utama.', 'Ikuti jalur utama hingga persimpangan barat.', 'Ambil cabang selatan menuju Kandang Burung.', 'Kandang Burung berada di depan Anda.'],
  },
}

const habitatMapPoints: Record<string, { x: number; y: number }> = {
  sabana: { x: 264, y: 273 },
  'hutan hujan': { x: 565, y: 270 },
  'danau buaya': { x: 917, y: 273 },
  'rumah primata': { x: 609, y: 513 },
  'kandang burung': { x: 261, y: 512 },
}

const tourRoutes: Record<TourRoute, { title: string; duration: string; distance: string; stops: string[]; path: string; markers: Array<{ x: number; y: number; number: number }> }> = {
  highlights: {
    title: 'Rute satwa unggulan',
    duration: '± 25 menit',
    distance: '± 850 m',
    stops: ['Mulai dari Pintu Masuk', 'Zona Sabana & Harimau', 'Kandang Burung', 'Rumah Primata', 'Danau Buaya', 'Selesai di Pintu Keluar'],
    path: 'M90 349 C170 316 265 325 380 328 C410 386 365 453 391 514 C421 470 365 375 380 328 C468 331 520 310 600 320 C633 390 566 473 548 574 C602 540 629 392 600 320 C711 313 800 337 900 350 C951 400 990 455 1032 501 C1010 431 951 378 900 350 C980 355 1044 341 1110 321',
    markers: [{ x: 90, y: 349, number: 1 }, { x: 264, y: 273, number: 2 }, { x: 261, y: 512, number: 3 }, { x: 609, y: 513, number: 4 }, { x: 917, y: 273, number: 5 }, { x: 1110, y: 321, number: 6 }],
  },
  family: {
    title: 'Rute santai keluarga',
    duration: '± 15 menit',
    distance: '± 520 m',
    stops: ['Mulai dari Pintu Masuk', 'Zona Sabana', 'Hutan Hujan', 'Area makan & istirahat', 'Toilet umum', 'Selesai di Pintu Keluar'],
    path: 'M90 349 C170 316 265 325 380 328 C350 290 310 270 264 273 C307 292 342 315 380 328 C459 329 497 319 555 320 C565 286 565 270 565 270 C593 285 605 302 600 320 C710 313 800 337 900 350 C948 368 1000 380 1040 391 C1035 368 1018 355 1000 352 C1042 350 1076 335 1110 321',
    markers: [{ x: 90, y: 349, number: 1 }, { x: 264, y: 273, number: 2 }, { x: 565, y: 270, number: 3 }, { x: 518, y: 346, number: 4 }, { x: 1071, y: 401, number: 5 }, { x: 1110, y: 321, number: 6 }],
  },
}

const today = () => new Date().toLocaleDateString('en-CA')
const timeNow = () => new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())

const id = () => crypto.randomUUID()

const seedStaff: Staff[] = [
  { id: 'p-01', name: 'drh. Siti Rahma', role: 'Dokter hewan', phone: '0812-3400-1122', shift: 'Pagi' },
  { id: 'p-02', name: 'Budi Santoso', role: 'Perawat satwa', phone: '0813-2200-4411', shift: 'Pagi' },
  { id: 'p-03', name: 'Dewi Lestari', role: 'Pemandu edukasi', phone: '0821-5500-3322', shift: 'Siang' },
  { id: 'p-04', name: 'Rian Pratama', role: 'Petugas kandang', phone: '0852-9900-8877', shift: 'Pagi' },
]

const seedVisitors: Visitor[] = [
  { id: 'v-01', name: 'Andi Pratama', phone: '0812-0000-1212', date: today(), groupSize: 2, category: 'Dewasa' },
  { id: 'v-02', name: 'Keluarga Putri', phone: '0813-0000-9898', date: today(), groupSize: 4, category: 'Keluarga' },
  { id: 'v-03', name: 'Rendy Sumual & Rekan', phone: '0878-1122-3344', date: today(), groupSize: 3, category: 'Dewasa' },
]

const seedMedical: Medical[] = [
  {
    id: 'm-01',
    animalName: 'Orangutan Kalimantan',
    date: today(),
    diagnosis: 'Pemeriksaan rutin gigi, mata, dan nafsu makan',
    disease: 'Pemulihan pasca adaptasi kanopi',
    vaccine: 'Hepatitis B & Tetanus Booster',
    medicine: 'Multivitamin probiotik & madu hutan',
    nextExam: today(),
    vet: 'drh. Siti Rahma',
  },
  {
    id: 'm-02',
    animalName: 'Harimau Sumatera',
    date: today(),
    diagnosis: 'Observasi area karantina dan sterilisasi cakar',
    disease: 'Luka goresan minor superfisial',
    vaccine: 'Rabies & FVRCP berkala',
    medicine: 'Salep antiseptik antibiotik',
    nextExam: today(),
    vet: 'drh. Siti Rahma',
  },
  {
    id: 'm-03',
    animalName: 'Buaya Muara',
    date: today(),
    diagnosis: 'Pengecekan kulit sisik dan keasaman kolam air',
    disease: 'Kondisi stabil masa adaptasi lingkungan',
    vaccine: '—',
    medicine: 'Elektrolit larutan mineral',
    nextExam: today(),
    vet: 'drh. Siti Rahma',
  },
]

const seedFeedings: Feeding[] = [
  { id: 'f-01', animalName: 'Singa Afrika', food: 'Daging sapi segar', amount: '7 kg', time: '09:00', frequency: '1x sehari', assignedStaff: 'Budi Santoso', done: false },
  { id: 'f-02', animalName: 'Gajah Sumatera', food: 'Rumput gajah, pisang & tebu', amount: '150 kg', time: '11:00', frequency: '2x sehari', assignedStaff: 'Budi Santoso', done: true },
  { id: 'f-03', animalName: 'Panda Raksasa', food: 'Rebung bambu segar & suplemen', amount: '15 kg', time: '14:00', frequency: '2x sehari', assignedStaff: 'Budi Santoso', done: false },
  { id: 'f-04', animalName: 'Harimau Sumatera', food: 'Daging unggas & sapi segar', amount: '6 kg', time: '16:00', frequency: '1x sehari', assignedStaff: 'Rian Pratama', done: false },
]

const seedConservation: Conservation[] = [
  { id: 'c-01', animalName: 'Harimau Sumatera', conservationStatus: 'Kritis', births: 2, lastBirth: '2025-03-10', notes: 'Program pembiakan terkontrol suaka satwa nasional untuk menjaga kemurnian genetik subspesies Sumatera.' },
  { id: 'c-02', animalName: 'Orangutan Kalimantan', conservationStatus: 'Kritis', births: 1, lastBirth: '2025-08-14', notes: 'Induk merawat anak dengan sangat protektif di kanopi buatan Rumah Primata.' },
  { id: 'c-03', animalName: 'Gajah Sumatera', conservationStatus: 'Kritis', births: 0, lastBirth: '—', notes: 'Pemantauan hormon reproduksi bersama Balai Konservasi Sumber Daya Alam.' },
  { id: 'c-04', animalName: 'Buaya Muara', conservationStatus: 'Risiko Rendah', births: 3, lastBirth: '2025-01-14', notes: 'Pemantauan habitat rawa dan rekayasa kolam menjaga kesehatan reproduksi serta keseimbangan ekosistem perairan.' },
  { id: 'c-05', animalName: 'Panda Raksasa', conservationStatus: 'Rentan', births: 1, lastBirth: '2025-06-02', notes: 'Program kerjasama diplomasi konservasi satwa internasional.' },
]

const storageKeys = {
  visitors: 'rimbakita_visitors_v1',
  tickets: 'rimbakita_tickets_v1',
  staff: 'rimbakita_staff_v1',
  medical: 'rimbakita_medical_v2',
  feeding: 'rimbakita_feeding_v2',
  conservation: 'rimbakita_conservation_v2',
  attendance: 'rimbakita_attendance_v1',
  prices: 'rimbakita_ticket_prices_v1',
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="module-field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function FormPanel({
  title,
  description,
  children,
  onSubmit,
  editing,
  onCancel,
  editKey,
}: {
  title: string
  description: string
  children: ReactNode
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  editing?: boolean
  onCancel?: () => void
  editKey?: string
}) {
  return (
    <form key={editKey ?? title} className="module-form-card" onSubmit={onSubmit}>
      <div>
        <p className="eyebrow">{editing ? 'UBAH DATA' : 'FORMULIR'}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="module-form-grid">{children}</div>
      <div className="module-form-actions">
        {editing && (
          <button className="button-secondary" type="button" onClick={onCancel}>
            Batal
          </button>
        )}
        <button className="button-primary" type="submit">
          {editing ? 'Simpan perubahan' : '＋ Simpan data'}
        </button>
      </div>
    </form>
  )
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="row-actions">
      <button type="button" aria-label="Edit data" onClick={onEdit}>Edit</button>
      <button type="button" aria-label="Hapus data" onClick={onDelete}>Hapus</button>
    </div>
  )
}

function ModuleTable({ headers, rows, empty }: { headers: string[]; rows: ReactNode[]; empty: string }) {
  return (
    <div className="module-table-wrap">
      <table className="module-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows : (
            <tr>
              <td className="module-empty" colSpan={headers.length}>
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function SectionHeading({ eyebrow, title, description, badge }: { eyebrow: string; title: string; description: string; badge?: string }) {
  return (
    <div className="module-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {badge && <span className="module-badge">{badge}</span>}
    </div>
  )
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
}

function exportCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escapeCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
  const content = `\uFEFF${[headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function ZooModules({ view, animals, role, currentUserEmail }: { view: string; animals: AnimalInfo[]; role: 'admin'; currentUserEmail: string }) {
  const [visitors, setVisitors] = useFirestoreCollection<Visitor>('zoo_visitors', storageKeys.visitors, seedVisitors)
  const [tickets, setTickets] = useFirestoreCollection<Ticket>('zoo_tickets', storageKeys.tickets, [])
  const [staff, setStaff] = useFirestoreCollection<Staff>('zoo_staff', storageKeys.staff, seedStaff)
  const [medical, setMedical] = useFirestoreCollection<Medical>('zoo_medical_records', storageKeys.medical, seedMedical)
  const [feedings, setFeedings] = useFirestoreCollection<Feeding>('zoo_feeding_schedules', storageKeys.feeding, seedFeedings)
  const [conservation, setConservation] = useFirestoreCollection<Conservation>('zoo_conservation_records', storageKeys.conservation, seedConservation)
  const [attendance, setAttendance] = useFirestoreCollection<Attendance>('zoo_attendance', storageKeys.attendance, [])
  const [prices, setPrices] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKeys.prices) || '{"adult":50000,"child":35000}') as { adult: number; child: number }
    } catch {
      return { adult: 50000, child: 35000 }
    }
  })
  const [notice, setNotice] = useState('')
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [visitorQuery, setVisitorQuery] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [reportCategory, setReportCategory] = useState<'animals' | 'visitors' | 'tickets' | 'medical' | 'conservation'>('animals')
  const [selectedTourRoute, setSelectedTourRoute] = useState<TourRoute>('highlights')
  const [mapSearch, setMapSearch] = useState('')
  const [selectedMapAnimal, setSelectedMapAnimal] = useState<AnimalInfo | null>(null)
  const [mapSearchFocused, setMapSearchFocused] = useState(false)
  const [editingVisitor, setEditingVisitor] = useState<Visitor | null>(null)
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null)
  const [editingMedical, setEditingMedical] = useState<Medical | null>(null)
  const [editingFeeding, setEditingFeeding] = useState<Feeding | null>(null)
  const [editingConservation, setEditingConservation] = useState<Conservation | null>(null)
  const [editingAttendance, setEditingAttendance] = useState<Attendance | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const ticketsRef = useRef(tickets)

  useEffect(() => {
    localStorage.setItem(storageKeys.prices, JSON.stringify(prices))
    const timer = window.setTimeout(() => {
      void setDoc(doc(db, 'zoo_public_settings', 'tickets'), { ...prices, updatedAt: new Date().toISOString() }, { merge: true })
        .catch((error: unknown) => console.warn('[Firebase] Harga tiket belum tersinkron ke portal pengunjung.', error))
    }, 350)
    return () => window.clearTimeout(timer)
  }, [prices])
  useEffect(() => {
    void setDoc(doc(db, 'zoo_public_settings', 'staff'), {
      items: staff.map(({ id: staffId, name, role, shift }) => ({ id: staffId, name, role, shift })),
      updatedAt: new Date().toISOString(),
    }, { merge: true }).catch((error: unknown) => console.warn('[Firebase] Daftar petugas publik belum tersinkron.', error))
  }, [staff])
  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 3500)
    return () => window.clearTimeout(timeout)
  }, [notice])
  useEffect(() => {
    ticketsRef.current = tickets
  }, [tickets])

  useEffect(() => {
    if (!scannerOpen || view !== 'tickets') return
    type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> }
    type DetectorConstructor = new (options?: { formats: string[] }) => Detector
    const DetectorAPI = (window as Window & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector
    if (!DetectorAPI) return
    let stopped = false
    let frame = 0
    let scanning = false
    let stream: MediaStream | undefined

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        const detector = new DetectorAPI({ formats: ['qr_code'] })
        const scanFrame = async () => {
          if (stopped) return
          if (video.readyState >= 2 && !scanning) {
            scanning = true
            try {
              const codes = await detector.detect(video)
              const ticketCode = codes.map((code) => code.rawValue.split('|')[1]).find((val) => val?.startsWith('RIM-'))
              if (ticketCode) {
                const ticket = ticketsRef.current.find((item) => item.id === ticketCode)
                if (ticket) {
                  if (ticket.status === 'Sudah digunakan') {
                    setNotice(`Tiket ${ticket.id} sudah pernah digunakan.`)
                  } else {
                    setTickets((current) => current.map((item) => (item.id === ticket.id ? { ...item, status: 'Sudah digunakan' } : item)))
                    setNotice(`Tiket valid. ${ticket.visitorName} berhasil diperiksa masuk.`)
                  }
                } else {
                  setNotice('Kode QR tidak ditemukan dalam daftar tiket.')
                }
                setScannerOpen(false)
                return
              }
            } catch {
              // Frame scan retry
            } finally {
              scanning = false
            }
          }
          frame = window.requestAnimationFrame(() => {
            void scanFrame()
          })
        }
        void scanFrame()
      } catch {
        setNotice('Kamera tidak dapat dibuka. Izinkan akses kamera atau gunakan pemeriksaan manual.')
        setScannerOpen(false)
      }
    }
    void startCamera()
    return () => {
      stopped = true
      window.cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [scannerOpen, view])

  const animalNames = useMemo(() => [...new Set(animals.map((animal) => animal.name))], [animals])
  const mapSearchResults = useMemo(() => {
    const query = mapSearch.trim().toLocaleLowerCase('id-ID')
    if (!query) return []
    return animals.filter((animal) => [animal.name, animal.scientificName ?? '', animal.species, animal.habitat]
      .some((value) => value.toLocaleLowerCase('id-ID').includes(query)))
      .slice(0, 6)
  }, [animals, mapSearch])
  const selectedHabitatGuide = selectedMapAnimal ? habitatGuides[selectedMapAnimal.habitat.trim().toLocaleLowerCase('id-ID')] : undefined

  const openQrScanner = () => {
    type DetectorConstructor = new (options?: { formats: string[] }) => unknown
    const detector = (window as Window & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector
    if (!detector) {
      setNotice('Pemindai QR tidak didukung browser ini. Gunakan tombol status tiket untuk pemeriksaan manual.')
      return
    }
    setScannerOpen(true)
  }

  const addVisitor = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const visitor: Visitor = {
      id: editingVisitor?.id ?? id(),
      name: String(data.get('name')).trim(),
      phone: String(data.get('phone')).trim(),
      date: String(data.get('date')),
      groupSize: Number(data.get('groupSize')),
      category: String(data.get('category')),
    }
    if (!visitor.name || !visitor.phone || visitor.groupSize < 1 || !Number.isInteger(visitor.groupSize)) {
      setNotice('Lengkapi data dan pastikan jumlah pengunjung minimal satu orang.')
      return
    }
    setVisitors((current) => (editingVisitor ? current.map((item) => (item.id === visitor.id ? visitor : item)) : [visitor, ...current]))
    event.currentTarget.reset()
    setEditingVisitor(null)
    setNotice(editingVisitor ? 'Data pengunjung berhasil diperbarui.' : 'Data pengunjung berhasil disimpan.')
  }

  const addStaff = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const person: Staff = {
      id: editingStaff?.id ?? id(),
      name: String(data.get('name')).trim(),
      role: String(data.get('role')),
      phone: String(data.get('phone')).trim(),
      shift: String(data.get('shift')),
    }
    if (!person.name || !person.phone) {
      setNotice('Nama dan nomor telepon petugas wajib diisi.')
      return
    }
    setStaff((current) => (editingStaff ? current.map((item) => (item.id === person.id ? person : item)) : [person, ...current]))
    event.currentTarget.reset()
    setEditingStaff(null)
    setNotice(editingStaff ? 'Data petugas berhasil diperbarui.' : 'Data petugas berhasil ditambahkan.')
  }

  const addMedical = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const record: Medical = {
      id: editingMedical?.id ?? id(),
      animalName: String(data.get('animalName')),
      date: String(data.get('date')),
      diagnosis: String(data.get('diagnosis')).trim(),
      disease: String(data.get('disease')).trim() || 'Tidak ada kelainan berat',
      vaccine: String(data.get('vaccine')).trim() || '—',
      medicine: String(data.get('medicine')).trim() || '—',
      nextExam: String(data.get('nextExam')),
      vet: String(data.get('vet')).trim(),
    }
    if (!record.diagnosis || !record.date || !record.nextExam || !record.vet) {
      setNotice('Lengkapi hasil pemeriksaan, tanggal kontrol, dan nama dokter.')
      return
    }
    setMedical((current) => (editingMedical ? current.map((item) => (item.id === record.id ? record : item)) : [record, ...current]))
    event.currentTarget.reset()
    setEditingMedical(null)
    setNotice(editingMedical ? 'Rekam medis berhasil diperbarui.' : 'Rekam medis berhasil dicatat.')
  }

  const addFeeding = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const feeding: Feeding = {
      id: editingFeeding?.id ?? id(),
      animalName: String(data.get('animalName')),
      food: String(data.get('food')).trim(),
      amount: String(data.get('amount')).trim(),
      time: String(data.get('time')),
      frequency: String(data.get('frequency')),
      assignedStaff: String(data.get('assignedStaff')),
      done: editingFeeding?.done ?? false,
    }
    if (!feeding.food || !feeding.amount || !feeding.time) {
      setNotice('Jenis makanan, porsi, dan waktu makan wajib diisi.')
      return
    }
    setFeedings((current) => (editingFeeding ? current.map((item) => (item.id === feeding.id ? feeding : item)) : [feeding, ...current]))
    event.currentTarget.reset()
    setEditingFeeding(null)
    setNotice(editingFeeding ? 'Jadwal pakan berhasil diperbarui.' : 'Jadwal pemberian makanan berhasil disimpan.')
  }

  const addConservation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const record: Conservation = {
      id: editingConservation?.id ?? id(),
      animalName: String(data.get('animalName')),
      conservationStatus: String(data.get('status')),
      births: Number(data.get('births')),
      lastBirth: String(data.get('lastBirth')) || '—',
      notes: String(data.get('notes')).trim(),
    }
    if (record.births < 0 || !Number.isInteger(record.births)) {
      setNotice('Jumlah kelahiran tidak boleh negatif.')
      return
    }
    setConservation((current) => (editingConservation ? current.map((item) => (item.id === record.id ? record : item)) : [record, ...current]))
    event.currentTarget.reset()
    setEditingConservation(null)
    setNotice(editingConservation ? 'Catatan konservasi berhasil diperbarui.' : 'Catatan konservasi berhasil disimpan.')
  }

  const createTicket = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const visitorName = String(data.get('visitorName')).trim()
    const adultQty = Number(data.get('adultQty'))
    const childQty = Number(data.get('childQty'))
    const quantity = adultQty + childQty
    if (quantity < 1) {
      setNotice('Jumlah tiket harus minimal satu.')
      return
    }
    const paymentStatus = String(data.get('paymentStatus')) as Ticket['paymentStatus']
    const total = adultQty * prices.adult + childQty * prices.child
    const ticket: Ticket = {
      id: `RIM-${Date.now().toString(36).toUpperCase()}`,
      visitorName,
      date: String(data.get('date')),
      quantity,
      adultQty,
      childQty,
      total,
      paymentMethod: String(data.get('paymentMethod')),
      paymentStatus,
      status: 'Belum digunakan',
    }
    setTickets((current) => [ticket, ...current])
    setSelectedTicket(ticket)
    setNotice(`Tiket berhasil dibuat untuk ${visitorName}.`)
  }

  const recordAttendance = (person: Staff) => {
    if (attendance.some((item) => item.staffName === person.name && item.date === today())) {
      setNotice(`${person.name} sudah melakukan absensi hari ini.`)
      return
    }
    setAttendance((current) => [{ id: id(), staffName: person.name, date: today(), checkIn: timeNow(), status: 'Hadir' }, ...current])
    setNotice(`Absensi ${person.name} berhasil dicatat.`)
  }

  const removeRecord = (label: string, remove: () => void) => {
    if (!window.confirm(`Hapus ${label}? Tindakan ini tidak dapat dibatalkan.`)) return
    remove()
    setNotice(`${label} berhasil dihapus.`)
  }

  const deleteVisitor = (item: Visitor) =>
    removeRecord(`data pengunjung ${item.name}`, () => {
      setVisitors((current) => current.filter((entry) => entry.id !== item.id))
      if (editingVisitor?.id === item.id) setEditingVisitor(null)
    })
  const deleteStaff = (item: Staff) =>
    removeRecord(`data petugas ${item.name}`, () => {
      setStaff((current) => current.filter((entry) => entry.id !== item.id))
      if (editingStaff?.id === item.id) setEditingStaff(null)
    })
  const deleteMedical = (item: Medical) =>
    removeRecord(`rekam medis ${item.animalName}`, () => {
      setMedical((current) => current.filter((entry) => entry.id !== item.id))
      if (editingMedical?.id === item.id) setEditingMedical(null)
    })
  const deleteFeeding = (item: Feeding) =>
    removeRecord(`jadwal pakan ${item.animalName}`, () => {
      setFeedings((current) => current.filter((entry) => entry.id !== item.id))
      if (editingFeeding?.id === item.id) setEditingFeeding(null)
    })
  const deleteConservation = (item: Conservation) =>
    removeRecord(`catatan konservasi ${item.animalName}`, () => {
      setConservation((current) => current.filter((entry) => entry.id !== item.id))
      if (editingConservation?.id === item.id) setEditingConservation(null)
    })
  const deleteAttendance = (item: Attendance) =>
    removeRecord(`absensi ${item.staffName}`, () => setAttendance((current) => current.filter((entry) => entry.id !== item.id)))
  const deleteTicket = (item: Ticket) =>
    removeRecord(`tiket ${item.id}`, () => {
      setTickets((current) => current.filter((entry) => entry.id !== item.id))
      if (selectedTicket?.id === item.id) setSelectedTicket(null)
    })

  const saveAttendanceEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingAttendance) return
    const data = new FormData(event.currentTarget)
    const checkIn = String(data.get('checkIn'))
    const attendanceStatus = String(data.get('status'))
    if (!checkIn) {
      setNotice('Jam absensi wajib diisi.')
      return
    }
    setAttendance((current) => current.map((item) => (item.id === editingAttendance.id ? { ...item, checkIn, status: attendanceStatus } : item)))
    setEditingAttendance(null)
    setNotice('Data absensi berhasil diperbarui.')
  }

  const addField = (label: string, fieldName: string, type = 'text', required = true, defaultValue?: string) => (
    <Field label={label} key={fieldName}>
      <input
        name={fieldName}
        type={type}
        required={required}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? 1 : undefined}
        defaultValue={defaultValue}
      />
    </Field>
  )

  const animalSelect = (label = 'Hewan', selectedName?: string) => (
    <Field label={label} key="animalName">
      <select name="animalName" required defaultValue={selectedName ?? animalNames[0]}>
        {animalNames.map((name) => (
          <option key={name}>{name}</option>
        ))}
      </select>
    </Field>
  )

  const staffSelect = (value?: string) => (
    <Field label="Dokter / petugas">
      <input name="vet" required defaultValue={value ?? staff.find((person) => person.role === 'Dokter hewan')?.name ?? 'drh. Siti Rahma'} />
    </Field>
  )

  const qrUrl = (ticket: Ticket) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(`RIMBAKITA|${ticket.id}|${ticket.date}|${ticket.quantity}|${ticket.total}`)}`

  if (!(['visitors', 'tickets', 'staff', 'medical', 'feeding', 'conservation', 'map', 'attendance', 'reports', 'incidents', 'roles'] as ModuleView[]).includes(view as ModuleView)) return null

  return (
    <div className="modules-page">
      {notice && (
        <div className="module-notice" role="status">
          ✓ {notice}
          <button onClick={() => setNotice('')} aria-label="Tutup">×</button>
        </div>
      )}

      {view === 'incidents' && <IncidentCenter role={role} currentUserEmail={currentUserEmail} />}
      {view === 'roles' && <RoleManagement adminEmail={currentUserEmail} />}

      {/* Data Pengunjung */}
      {view === 'visitors' && (
        <>
          <SectionHeading
            eyebrow="LAYANAN PENGUNJUNG"
            title="Data Pengunjung"
            description="Catat kunjungan harian dan kelola data reservasi tiket masuk."
            badge={`${visitors.length} data tersimpan`}
          />
          <div className="module-kpis">
            <div>
              <span>Pengunjung tercatat</span>
              <strong>{visitors.reduce((sum, item) => sum + item.groupSize, 0)}</strong>
              <small>total orang dalam daftar</small>
            </div>
            <div>
              <span>Kunjungan hari ini</span>
              <strong>{visitors.filter((item) => item.date === today()).reduce((sum, item) => sum + item.groupSize, 0)}</strong>
              <small>orang</small>
            </div>
            <div>
              <span>Reservasi</span>
              <strong>{visitors.length}</strong>
              <small>data kunjungan</small>
            </div>
          </div>
          <FormPanel
            title={editingVisitor ? 'Edit pengunjung' : 'Tambah pengunjung'}
            description="Isi data utama pemesan atau perwakilan rombongan wisatawan."
            onSubmit={addVisitor}
            editing={Boolean(editingVisitor)}
            onCancel={() => setEditingVisitor(null)}
            editKey={editingVisitor?.id ?? 'new-visitor'}
          >
            {addField('Nama pengunjung / rombongan', 'name', 'text', true, editingVisitor?.name)}
            {addField('Nomor telepon', 'phone', 'tel', true, editingVisitor?.phone)}
            {addField('Tanggal kunjungan', 'date', 'date', true, editingVisitor?.date ?? today())}
            {addField('Jumlah orang', 'groupSize', 'number', true, String(editingVisitor?.groupSize ?? 1))}
            <Field label="Kategori tiket">
              <select name="category" defaultValue={editingVisitor?.category ?? 'Dewasa'}>
                <option>Dewasa</option>
                <option>Anak-anak</option>
                <option>Keluarga</option>
              </select>
            </Field>
          </FormPanel>
          <div className="module-list-heading">
            <h3>Daftar kunjungan</h3>
            <input
              className="module-search"
              value={visitorQuery}
              onChange={(event) => setVisitorQuery(event.target.value)}
              placeholder="Cari nama pengunjung..."
            />
          </div>
          <ModuleTable
            headers={['PENGUNJUNG', 'KONTAK', 'TANGGAL', 'JUMLAH', 'KATEGORI', 'AKSI']}
            empty="Belum ada data pengunjung."
            rows={visitors
              .filter((item) => item.name.toLowerCase().includes(visitorQuery.toLowerCase()))
              .map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                    <small>{item.id.slice(0, 8).toUpperCase()}</small>
                  </td>
                  <td>{item.phone}</td>
                  <td>{item.date}</td>
                  <td>{item.groupSize} orang</td>
                  <td>{item.category}</td>
                  <td>
                    <RowActions onEdit={() => setEditingVisitor(item)} onDelete={() => deleteVisitor(item)} />
                  </td>
                </tr>
              ))}
          />
        </>
      )}

      {/* Tiket Masuk & QR */}
      {view === 'tickets' && (
        <>
          <SectionHeading
            eyebrow="LOKET DIGITAL"
            title="Informasi & Tiket Masuk"
            description="Atur tarif tiket masuk dan terbitkan e-tiket dengan QR Code pemeriksaan masuk otomatis."
            badge="QR siap dipindai"
          />
          <button className="button-secondary scanner-launch" onClick={openQrScanner}>
            ▣ Pindai QR tiket dengan kamera
          </button>
          {scannerOpen && (
            <div className="qr-scanner">
              <video ref={videoRef} autoPlay playsInline aria-label="Tampilan kamera pemindai QR" />
              <div>
                <strong>Arahkan QR tiket ke kamera</strong>
                <span>Pastikan kode tiket sudah diterbitkan oleh sistem Smart Zoo ini.</span>
              </div>
              <button className="button-secondary" onClick={() => setScannerOpen(false)}>
                Tutup pemindai
              </button>
            </div>
          )}
          <div className="ticket-price-grid">
            <label>
              Dewasa <span>Harga per orang</span>
              <div>
                <b>Rp</b>
                <input
                  type="number"
                  min="0"
                  value={prices.adult}
                  onChange={(event) => setPrices((current) => ({ ...current, adult: Number(event.target.value) }))}
                />
              </div>
            </label>
            <label>
              Anak-anak <span>Harga per orang</span>
              <div>
                <b>Rp</b>
                <input
                  type="number"
                  min="0"
                  value={prices.child}
                  onChange={(event) => setPrices((current) => ({ ...current, child: Number(event.target.value) }))}
                />
              </div>
            </label>
          </div>
          <FormPanel
            title="Terbitkan tiket digital"
            description="Pilih jumlah tiket dewasa/anak dan catat pembayaran. QR menyimpan kode transaksi dan tanggal kunjungan."
            onSubmit={createTicket}
          >
            <Field label="Nama pemegang tiket">
              <input name="visitorName" required list="visitor-names" placeholder="Nama pengunjung" />
              <datalist id="visitor-names">
                {visitors.map((item) => (
                  <option key={item.id} value={item.name} />
                ))}
              </datalist>
            </Field>
            {addField('Tanggal kunjungan', 'date', 'date', true, today())}
            {addField('Tiket dewasa', 'adultQty', 'number', true, '1')}
            {addField('Tiket anak-anak', 'childQty', 'number', true, '0')}
            <Field label="Metode pembayaran">
              <select name="paymentMethod">
                <option>Tunai</option>
                <option>QRIS</option>
                <option>Transfer bank</option>
                <option>Kartu debit</option>
              </select>
            </Field>
            <Field label="Status pembayaran">
              <select name="paymentStatus">
                <option>Lunas</option>
                <option>Belum bayar</option>
              </select>
            </Field>
          </FormPanel>
          {selectedTicket && (
            <article className="issued-ticket">
              <div>
                <p className="eyebrow">TIKET DIGITAL · {selectedTicket.paymentStatus ?? 'Lunas'}</p>
                <h3>{selectedTicket.visitorName}</h3>
                <p>
                  {selectedTicket.id} · {selectedTicket.date} · Dewasa {selectedTicket.adultQty ?? selectedTicket.quantity} · Anak {selectedTicket.childQty ?? 0}
                </p>
                <strong>{formatMoney(selectedTicket.total)}</strong>
                <small>Metode: {selectedTicket.paymentMethod ?? 'Tunai'}. Tunjukkan QR ini di gerbang masuk.</small>
              </div>
              <img src={qrUrl(selectedTicket)} alt={`QR Code tiket ${selectedTicket.id}`} />
              <button className="button-secondary" onClick={() => window.print()}>Cetak tiket</button>
            </article>
          )}
          <ModuleTable
            headers={['KODE TIKET', 'PEMEGANG', 'TANGGAL', 'RINCIAN', 'TOTAL / BAYAR', 'STATUS / QR', 'AKSI']}
            empty="Belum ada tiket yang diterbitkan."
            rows={tickets.map((ticket) => (
              <tr key={ticket.id}>
                <td><strong>{ticket.id}</strong></td>
                <td>{ticket.visitorName}</td>
                <td>{ticket.date}</td>
                <td>Dewasa {ticket.adultQty ?? ticket.quantity} · Anak {ticket.childQty ?? 0}</td>
                <td>
                  {formatMoney(ticket.total)}
                  <small>{ticket.paymentMethod ?? 'Tunai'}</small>
                  <button
                    className={`module-status-button ${(ticket.paymentStatus ?? 'Lunas') === 'Lunas' ? 'is-done' : ''}`}
                    onClick={() =>
                      setTickets((current) =>
                        current.map((item) =>
                          item.id === ticket.id
                            ? { ...item, paymentStatus: (item.paymentStatus ?? 'Lunas') === 'Lunas' ? 'Belum bayar' : 'Lunas' }
                            : item,
                        ),
                      )
                    }
                  >
                    {ticket.paymentStatus ?? 'Lunas'}
                  </button>
                </td>
                <td>
                  <div className="ticket-row-actions">
                    <button
                      className={`module-status-button ${ticket.status === 'Sudah digunakan' ? 'is-done' : ''}`}
                      onClick={() =>
                        setTickets((current) =>
                          current.map((item) =>
                            item.id === ticket.id
                              ? { ...item, status: item.status === 'Belum digunakan' ? 'Sudah digunakan' : 'Belum digunakan' }
                              : item,
                          ),
                        )
                      }
                    >
                      {ticket.status}
                    </button>
                    <button className="ticket-qr-button" onClick={() => setSelectedTicket(ticket)}>Tampilkan QR</button>
                  </div>
                </td>
                <td>
                  <button className="row-action-delete" onClick={() => deleteTicket(ticket)}>Batalkan / hapus</button>
                </td>
              </tr>
            ))}
          />
        </>
      )}

      {/* Petugas Kebun Binatang */}
      {view === 'staff' && (
        <>
          <SectionHeading
            eyebrow="SUMBER DAYA MANUSIA"
            title="Informasi Petugas"
            description="Daftar tim kebun binatang beserta peran, kontak, dan jadwal kerja operasional."
            badge={`${staff.length} petugas`}
          />
          <FormPanel
            title={editingStaff ? 'Edit data petugas' : 'Tambah petugas'}
            description="Tambahkan anggota tim perawat, dokter hewan, atau penjaga kandang."
            onSubmit={addStaff}
            editing={Boolean(editingStaff)}
            onCancel={() => setEditingStaff(null)}
            editKey={editingStaff?.id ?? 'new-staff'}
          >
            {addField('Nama lengkap', 'name', 'text', true, editingStaff?.name)}
            <Field label="Jabatan">
              <select name="role" defaultValue={editingStaff?.role ?? 'Perawat satwa'}>
                <option>Perawat satwa</option>
                <option>Dokter hewan</option>
                <option>Pemandu edukasi</option>
                <option>Petugas kandang</option>
                <option>Petugas loket</option>
              </select>
            </Field>
            {addField('Nomor telepon', 'phone', 'tel', true, editingStaff?.phone)}
            <Field label="Shift kerja">
              <select name="shift" defaultValue={editingStaff?.shift ?? 'Pagi'}>
                <option>Pagi</option>
                <option>Siang</option>
                <option>Malam</option>
              </select>
            </Field>
          </FormPanel>
          <ModuleTable
            headers={['NAMA PETUGAS', 'JABATAN', 'KONTAK', 'SHIFT', 'AKSI']}
            empty="Data petugas belum tersedia."
            rows={staff.map((person) => (
              <tr key={person.id}>
                <td>
                  <strong>{person.name}</strong>
                  <small>{person.id.slice(0, 8).toUpperCase()}</small>
                </td>
                <td>{person.role}</td>
                <td>{person.phone}</td>
                <td><span className="module-pill">{person.shift}</span></td>
                <td>
                  <RowActions onEdit={() => setEditingStaff(person)} onDelete={() => deleteStaff(person)} />
                </td>
              </tr>
            ))}
          />
        </>
      )}

      {/* Rekam Medis Satwa */}
      {view === 'medical' && (
        <>
          <SectionHeading
            eyebrow="KESEHATAN SATWA"
            title="Rekam Medis Hewan"
            description="Simpan diagnosis klinis, riwayat vaksinasi, terapi obat, dan jadwal kontrol dokter hewan."
            badge={`${medical.length} rekam medis`}
          />
          <FormPanel
            title={editingMedical ? 'Edit rekam medis' : 'Catat pemeriksaan medis baru'}
            description="Simpan diagnosis, tindakan, dokter penanggung jawab, dan tanggal kontrol lanjutan."
            onSubmit={addMedical}
            editing={Boolean(editingMedical)}
            onCancel={() => setEditingMedical(null)}
            editKey={editingMedical?.id ?? 'new-medical'}
          >
            {animalSelect('Satwa yang diperiksa', editingMedical?.animalName)}
            {addField('Tanggal pemeriksaan', 'date', 'date', true, editingMedical?.date ?? today())}
            {addField('Penyakit / keluhan', 'disease', 'text', false, editingMedical?.disease)}
            {addField('Hasil pemeriksaan & tindakan', 'diagnosis', 'text', true, editingMedical?.diagnosis)}
            {addField('Vaksinasi', 'vaccine', 'text', false, editingMedical?.vaccine)}
            {addField('Obat / suplemen', 'medicine', 'text', false, editingMedical?.medicine)}
            {addField('Jadwal kontrol berikutnya', 'nextExam', 'date', true, editingMedical?.nextExam ?? today())}
            {staffSelect(editingMedical?.vet)}
          </FormPanel>
          <ModuleTable
            headers={['SATWA', 'TANGGAL', 'PENYAKIT / TINDAKAN', 'VAKSINASI', 'OBAT', 'KONTROL', 'DOKTER', 'AKSI']}
            empty="Belum ada rekam medis tersimpan."
            rows={medical.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.animalName}</strong></td>
                <td>{item.date}</td>
                <td>
                  {item.disease ?? '—'}
                  <small>{item.diagnosis}</small>
                </td>
                <td>{item.vaccine}</td>
                <td>{item.medicine ?? '—'}</td>
                <td>{item.nextExam}</td>
                <td>{item.vet}</td>
                <td>
                  <RowActions onEdit={() => setEditingMedical(item)} onDelete={() => deleteMedical(item)} />
                </td>
              </tr>
            ))}
          />
        </>
      )}

      {/* Jadwal Pakan Satwa */}
      {view === 'feeding' && (
        <>
          <SectionHeading
            eyebrow="OPERASIONAL HARIAN"
            title="Jadwal Pemberian Makanan"
            description="Atur menu nutrisi, porsi harian, frekuensi makan, dan petugas penanggung jawab."
            badge={`${feedings.length} jadwal aktif`}
          />
          <FormPanel
            title={editingFeeding ? 'Edit jadwal pakan' : 'Tambah jadwal pakan baru'}
            description="Catat jenis bahan pakan, bobot porsi, jam pemberian, dan petugas perawat."
            onSubmit={addFeeding}
            editing={Boolean(editingFeeding)}
            onCancel={() => setEditingFeeding(null)}
            editKey={editingFeeding?.id ?? 'new-feeding'}
          >
            {animalSelect('Satwa', editingFeeding?.animalName)}
            {addField('Jenis pakan & nutrisi', 'food', 'text', true, editingFeeding?.food)}
            {addField('Porsi / bobot', 'amount', 'text', true, editingFeeding?.amount)}
            {addField('Waktu pemberian', 'time', 'time', true, editingFeeding?.time ?? '09:00')}
            <Field label="Frekuensi">
              <select name="frequency" defaultValue={editingFeeding?.frequency ?? '1x sehari'}>
                <option>1x sehari</option>
                <option>2x sehari</option>
                <option>3x sehari</option>
                <option>Sesuai instruksi dokter</option>
              </select>
            </Field>
            <Field label="Petugas penanggung jawab">
              <select name="assignedStaff" required defaultValue={editingFeeding?.assignedStaff ?? staff[0]?.name}>
                {staff.map((person) => (
                  <option key={person.id}>{person.name}</option>
                ))}
              </select>
            </Field>
          </FormPanel>
          <ModuleTable
            headers={['SATWA', 'MENU PAKAN', 'PORSI', 'JAM', 'FREKUENSI', 'PETUGAS', 'STATUS', 'AKSI']}
            empty="Jadwal pakan belum dibuat."
            rows={feedings.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.animalName}</strong></td>
                <td>{item.food}</td>
                <td>{item.amount}</td>
                <td>{item.time}</td>
                <td>{item.frequency}</td>
                <td>{item.assignedStaff ?? 'Belum ditentukan'}</td>
                <td>
                  <button
                    className={`module-status-button ${item.done ? 'is-done' : ''}`}
                    onClick={() =>
                      setFeedings((current) =>
                        current.map((feeding) => (feeding.id === item.id ? { ...feeding, done: !feeding.done } : feeding)),
                      )
                    }
                  >
                    {item.done ? '✓ Sudah diberikan' : 'Tandai diberikan'}
                  </button>
                </td>
                <td>
                  <RowActions onEdit={() => setEditingFeeding(item)} onDelete={() => deleteFeeding(item)} />
                </td>
              </tr>
            ))}
          />
        </>
      )}

      {/* Konservasi Satwa */}
      {view === 'conservation' && (
        <>
          <SectionHeading
            eyebrow="KONSERVASI SPESIES"
            title="Perkembangbiakan & Konservasi IUCN"
            description="Pantau kelahiran, silsilah keturunan, dan tingkat kepunahan satwa menurut standar konservasi."
            badge={`${conservation.length} catatan aktif`}
          />
          <FormPanel
            title={editingConservation ? 'Edit catatan konservasi' : 'Catat konservasi & kelahiran'}
            description="Catatan ini mendukung pelestarian plasma nutfah dan evaluasi reproduksi satwa di penangkaran."
            onSubmit={addConservation}
            editing={Boolean(editingConservation)}
            onCancel={() => setEditingConservation(null)}
            editKey={editingConservation?.id ?? 'new-conservation'}
          >
            {animalSelect('Satwa / Spesies', editingConservation?.animalName)}
            <Field label="Status konservasi IUCN">
              <select name="status" defaultValue={editingConservation?.conservationStatus ?? 'Kritis'}>
                <option>Kritis</option>
                <option>Terancam punah</option>
                <option>Rentan</option>
                <option>Risiko Rendah</option>
              </select>
            </Field>
            {addField('Jumlah anakan / kelahiran', 'births', 'number', true, String(editingConservation?.births ?? 0))}
            {addField(
              'Tanggal kelahiran terakhir',
              'lastBirth',
              'date',
              false,
              editingConservation?.lastBirth === '—' ? '' : editingConservation?.lastBirth,
            )}
            <Field label="Catatan program pembiakan">
              <textarea
                name="notes"
                rows={2}
                defaultValue={editingConservation?.notes ?? ''}
                placeholder="Metode inkubasi, pengawasan induk, dan program pelepasliaran..."
              />
            </Field>
          </FormPanel>
          <ModuleTable
            headers={['SATWA / SPESIES', 'STATUS KONSERVASI', 'KELAHIRAN', 'KELAHIRAN TERAKHIR', 'CATATAN', 'AKSI']}
            empty="Belum ada catatan konservasi."
            rows={conservation.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.animalName}</strong></td>
                <td>
                  <span className={`module-pill pill-${item.conservationStatus.toLowerCase().replace(/\s+/g, '-')}`}>
                    {item.conservationStatus}
                  </span>
                </td>
                <td>{item.births} anakan</td>
                <td>{item.lastBirth}</td>
                <td>{item.notes}</td>
                <td>
                  <RowActions onEdit={() => setEditingConservation(item)} onDelete={() => deleteConservation(item)} />
                </td>
              </tr>
            ))}
          />
        </>
      )}

      {/* Peta Interaktif & Zonasi */}
      {view === 'map' && (
        <>
          <SectionHeading
            eyebrow="PANDUAN ZONASI"
            title="Peta Lokasi & Denah Kebun Binatang"
            description="Denah ilustratif kawasan, jalur pengunjung, habitat, dan fasilitas kebun binatang."
            badge="Zonasi Lengkap"
          />
          <div className="map-layout">
            <div className="map-stage">
              <div className="map-stage-bar">
                <span><i /> TAMAN SATWA NUSANTARA · DENAH KAWASAN</span>
                <span className="map-open-hours">BUKA HARI INI · 08.00—17.00</span>
              </div>
              <div className="zoo-map">
                <svg className="zoo-map-art" viewBox="0 0 1200 700" role="img" aria-labelledby="zoo-map-title zoo-map-desc" preserveAspectRatio="xMidYMid meet">
                  <title id="zoo-map-title">Denah ilustratif Taman Satwa Nusantara</title>
                  <desc id="zoo-map-desc">Peta taman dengan jalur melingkar, danau, lima zona habitat satwa, area makan, klinik, toilet, loket, pintu masuk, dan pintu keluar.</desc>
                  <defs>
                    <linearGradient id="park-ground" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#eaf2dc"/><stop offset=".52" stopColor="#f3f4df"/><stop offset="1" stopColor="#dcebd8"/></linearGradient>
                    <linearGradient id="water-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#a9ded5"/><stop offset="1" stopColor="#70bdb5"/></linearGradient>
                    <filter id="map-shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#47654a" floodOpacity=".18"/></filter>
                    <pattern id="grass-dots" width="34" height="30" patternUnits="userSpaceOnUse"><circle cx="5" cy="8" r="1.3" fill="#a9c49b" opacity=".55"/><circle cx="25" cy="20" r="1" fill="#95b78d" opacity=".48"/><path d="M14 25l2-4m0 4 2-3" stroke="#9ab98d" strokeWidth="1" opacity=".5"/></pattern>
                    <g id="tree"><circle r="15" fill="#82aa78"/><circle cx="-5" cy="-4" r="8" fill="#9cbe8b"/><circle cx="6" cy="-3" r="9" fill="#719b6a"/><circle cy="5" r="8" fill="#8eb27e"/><path d="M0 12v8" stroke="#947b58" strokeWidth="3" strokeLinecap="round"/></g>
                    <g id="palm"><path d="M0 17Q2 2 0-5" fill="none" stroke="#947b58" strokeWidth="3"/><path d="M0-5Q-19-15-20-4Q-9-5 0-2Q-8-20 1-18Q6-13 3-3Q14-20 20-12Q16-5 4-2Q23-5 22 4Q13 4 3 0" fill="#5e9765" stroke="#4f8257" strokeWidth="1.5"/></g>
                    <g id="pin"><circle r="21" fill="#fff"/><circle r="17" fill="#2e7654"/><circle r="6" fill="#fff"/></g>
                  </defs>
                  <rect width="1200" height="700" fill="url(#park-ground)"/>
                  <rect width="1200" height="700" fill="url(#grass-dots)" opacity=".58"/>
                  <path d="M30 46Q210 9 410 42T812 39Q1036 11 1170 64L1179 625Q1020 675 834 648T419 662Q183 683 28 624Z" fill="#edf4e5" stroke="#c9ddbd" strokeWidth="4"/>
                  <path d="M45 95Q215 35 330 90T560 84Q740 41 852 99T1128 78M54 599Q217 536 360 589T640 580Q838 535 960 596T1145 571" fill="none" stroke="#d5e5ca" strokeWidth="3" strokeDasharray="3 12"/>
                  {/* Vegetation belts frame the visitor areas */}
                  {[[70,80],[115,68],[160,73],[205,62],[250,77],[300,66],[350,75],[400,66],[450,76],[500,62],[550,72],[600,64],[650,75],[700,63],[750,75],[800,66],[850,77],[900,63],[950,75],[1000,64],[1050,76],[1100,65],[1145,86],[78,615],[125,630],[178,606],[230,634],[285,616],[337,632],[390,610],[445,634],[500,615],[555,631],[610,608],[665,632],[720,614],[775,633],[830,610],[885,632],[940,615],[995,635],[1050,612],[1100,630],[1140,608],[83,160],[76,218],[88,276],[75,520],[1110,174],[1135,230],[1120,525],[1090,565]].map(([x,y], i) => <use key={`tree-${i}`} href="#tree" x={x} y={y} transform={`scale(${i % 3 === 0 ? 1.15 : 0.88})`} />)}
                  {/* Habitat boundaries */}
                  <path d="M134 143Q230 105 371 143L405 268Q337 326 171 290Q123 233 134 143Z" fill="#d8e9be" stroke="#9cbd89" strokeWidth="3"/>
                  <path d="M443 116Q573 93 688 140L684 283Q589 321 456 276Q421 206 443 116Z" fill="#cfe4c7" stroke="#91b58d" strokeWidth="3"/>
                  <path d="M764 116Q931 91 1065 146L1064 296Q950 339 786 291Q744 210 764 116Z" fill="#d7e9c2" stroke="#9dbb87" strokeWidth="3"/>
                  <path d="M128 367Q252 323 389 374L401 527Q282 572 144 524Q112 452 128 367Z" fill="#d9e8c8" stroke="#9eba8c" strokeWidth="3"/>
                  <path d="M467 383Q603 332 741 383L748 532Q620 578 477 528Q448 460 467 383Z" fill="#d0e5c9" stroke="#95b797" strokeWidth="3"/>
                  <path d="M815 387Q946 345 1068 393L1063 528Q948 565 827 525Q796 459 815 387Z" fill="#d3e8c2" stroke="#9ab889" strokeWidth="3"/>
                  {/* Main walking paths and branch paths */}
                  <path d="M90 337C190 301 311 332 412 321S619 289 739 325 930 362 1110 321" fill="none" stroke="#d8c99e" strokeWidth="62" strokeLinecap="round"/>
                  <path d="M90 337C190 301 311 332 412 321S619 289 739 325 930 362 1110 321" fill="none" stroke="#fff8e9" strokeWidth="48" strokeLinecap="round"/>
                  <path d="M597 342C558 412 572 490 548 574M714 326C781 390 781 474 829 575M384 323C359 387 365 453 391 514M931 348C958 403 990 454 1032 501" fill="none" stroke="#d8c99e" strokeWidth="36" strokeLinecap="round"/>
                  <path d="M597 342C558 412 572 490 548 574M714 326C781 390 781 474 829 575M384 323C359 387 365 453 391 514M931 348C958 403 990 454 1032 501" fill="none" stroke="#fff8e9" strokeWidth="26" strokeLinecap="round"/>
                  <path d="M111 337C228 311 300 337 413 321S620 292 739 325 936 359 1090 324" fill="none" stroke="#d5bd85" strokeWidth="2" strokeDasharray="8 14" opacity=".75"/>
                  {selectedMapAnimal && selectedHabitatGuide ? (
                    <g className="map-route-layer" aria-label={`Rute ke ${selectedMapAnimal.name}`}>
                      <path d={selectedHabitatGuide.path} className="map-route-underlay" />
                      <path d={selectedHabitatGuide.path} className="map-route-line" />
                      <g className="map-route-stop" transform="translate(90 349)"><circle r="15"/><text y="1">M</text></g>
                      {(() => {
                        const point = habitatMapPoints[selectedMapAnimal.habitat.trim().toLocaleLowerCase('id-ID')]
                        return point ? <g className="map-destination-pin" transform={`translate(${point.x} ${point.y})`}><circle r="27"/><circle r="18"/><text y="1">🐾</text></g> : null
                      })()}
                    </g>
                  ) : (
                    <g className="map-route-layer" aria-label={`Rute aktif: ${tourRoutes[selectedTourRoute].title}`}>
                      <path d={tourRoutes[selectedTourRoute].path} className="map-route-underlay" />
                      <path d={tourRoutes[selectedTourRoute].path} className="map-route-line" />
                      {tourRoutes[selectedTourRoute].markers.map((marker) => (
                        <g className="map-route-stop" key={`${selectedTourRoute}-stop-${marker.number}`} transform={`translate(${marker.x + 23} ${marker.y - 22})`}>
                          <circle r="15" />
                          <text y="1">{marker.number}</text>
                        </g>
                      ))}
                    </g>
                  )}
                  {/* Lake with small island and ripples */}
                  <path d="M875 171C913 137 1002 137 1037 171C1068 202 1037 254 991 268C945 283 873 252 863 221C858 202 861 186 875 171Z" fill="url(#water-fill)" stroke="#fff" strokeWidth="7" filter="url(#map-shadow)"/>
                  <ellipse cx="972" cy="195" rx="25" ry="13" fill="#d9edc9"/><path d="M895 220q18-9 36 0m55 19q17-9 32 0m-91-58q14-7 27 0" fill="none" stroke="#e8fbef" strokeWidth="3" opacity=".8"/>
                  <use href="#palm" x="968" y="192"/><use href="#palm" x="990" y="201" transform="scale(.7)"/>
                  {/* Trees inside habitats */}
                  {[[165,173],[212,158],[347,177],[368,235],[477,151],[535,139],[651,171],[657,240],[807,151],[1080,180],[827,256],[169,408],[362,474],[485,418],[712,491],[848,408],[1040,480]].map(([x,y],i)=><use key={`wood-${i}`} href={i%4===0?'#palm':'#tree'} x={x} y={y}/>)}
                  {/* Habitat titles */}
                  <g className="map-zone-label"><text x="268" y="222">ZONA SABANA</text><text x="560" y="219">HUTAN HUJAN</text><text x="911" y="224">DANAU BUAYA</text><text x="258" y="463">KANDANG BURUNG</text><text x="608" y="464">RUMAH PRIMATA</text><text x="934" y="466">AREA KONSERVASI</text></g>
                  {/* Animal markers */}
                  <g className="map-animal"><text x="264" y="273">🦁</text><text x="565" y="270">🐘</text><text x="917" y="273">🐊</text><text x="261" y="512">🦜</text><text x="609" y="513">🦧</text><text x="938" y="515">🦒</text></g>
                  {/* Facilities */}
                  <g className="map-building" filter="url(#map-shadow)"><rect x="90" y="325" width="64" height="48" rx="12"/><text x="122" y="356">🎟️</text><rect x="485" y="314" width="67" height="48" rx="12"/><text x="518" y="346">🍽️</text><rect x="747" y="307" width="67" height="48" rx="12"/><text x="780" y="339">☕</text><rect x="686" y="484" width="62" height="48" rx="12"/><text x="717" y="516">🏥</text><rect x="1040" y="369" width="62" height="48" rx="12"/><text x="1071" y="401">🚻</text></g>
                  {/* Entry and exit gates */}
                  <g className="map-gate"><path d="M67 345h23m-23-12v24m23-24v24"/><text x="70" y="402">PINTU MASUK</text><path d="M1108 321h31m-31-12v24m31-24v24"/><text x="1083" y="368">PINTU KELUAR</text></g>
                  {/* North arrow and route key */}
                  <g className="map-north"><circle cx="1137" cy="90" r="30"/><path d="M1137 108V73m0 0-10 13m10-13 10 13"/><text x="1137" y="57">U</text></g>
                  <g className="map-scale"><path d="M42 663h90m-90-7v14m45-14v14m45-14v14"/><text x="42" y="650">DENAH ILUSTRATIF · TIDAK BERSKALA</text></g>
                </svg>
                <div className="map-live-badge"><span /> TAMAN SATWA NUSANTARA</div>
              </div>
            </div>
            <aside className="map-legend">
              <h3>Legenda Zonasi & Fasilitas</h3>
              <div className="route-picker" aria-label="Pilih petunjuk jalan">
                <p className="route-picker-label">PETUNJUK JALAN</p>
                <button type="button" className={selectedTourRoute === 'highlights' && !selectedMapAnimal ? 'active' : ''} onClick={() => { setSelectedTourRoute('highlights'); setSelectedMapAnimal(null); setMapSearch('') }}>
                  <span className="route-button-icon">🐾</span><span><strong>Rute satwa unggulan</strong><small>± 25 menit · ± 850 m</small></span>
                </button>
                <button type="button" className={selectedTourRoute === 'family' && !selectedMapAnimal ? 'active' : ''} onClick={() => { setSelectedTourRoute('family'); setSelectedMapAnimal(null); setMapSearch('') }}>
                  <span className="route-button-icon">👨‍👩‍👧</span><span><strong>Rute santai keluarga</strong><small>± 15 menit · ± 520 m</small></span>
                </button>
                {!selectedMapAnimal && <ol className="route-steps">
                  {tourRoutes[selectedTourRoute].stops.map((stop, index) => <li key={`${selectedTourRoute}-${stop}`}><span>{index + 1}</span>{stop}</li>)}
                </ol>}
              </div>
              <p>🐾 <span>Zona Habitat Satwa Nyata</span></p>
              <p><i className="route-legend-line" /> <span>Jalur tur yang dipilih</span></p>
              <p>🍽️ <span>Area Makan & Minum</span></p>
              <p>☕ <span>Restoran Keluarga</span></p>
              <p>🚻 <span>Toilet & Fasilitas Sanitasi</span></p>
              <p>＋ <span>Klinik Hewan & Karantina</span></p>
              <p>🎟️ <span>Loket e-Tiket & Scanner QR</span></p>
              <p>🚪 <span>Pintu Masuk & Pintu Darurat</span></p>
              <div className="map-note">
                Jalur dan jarak merupakan panduan ilustratif di dalam denah, bukan navigasi GPS atau pengukuran lapangan.
              </div>
            </aside>
          </div>
          <section className="map-animal-search" aria-labelledby="map-search-title">
            <div className="map-search-intro">
              <span className="map-search-symbol">⌕</span>
              <div>
                <p className="eyebrow">PENCARI LOKASI SATWA</p>
                <h2 id="map-search-title">Cari satwa, ikuti petunjuknya</h2>
                <p>Ketik nama satwa atau habitat untuk melihat lokasinya dan rute dari pintu masuk.</p>
              </div>
            </div>
            <div className="map-search-control">
              <label htmlFor="map-animal-query">Nama satwa atau habitat</label>
              <div className="map-search-input-wrap">
                <span aria-hidden="true">⌕</span>
                <input
                  id="map-animal-query"
                  type="search"
                  value={mapSearch}
                  placeholder="Contoh: Harimau Sumatera atau Sabana"
                  autoComplete="off"
                  onFocus={() => setMapSearchFocused(true)}
                  onBlur={() => window.setTimeout(() => setMapSearchFocused(false), 120)}
                  onChange={(event) => {
                    setMapSearch(event.target.value)
                    setSelectedMapAnimal(null)
                  }}
                />
                {mapSearch && <button type="button" aria-label="Hapus pencarian" onClick={() => { setMapSearch(''); setSelectedMapAnimal(null); setMapSearchFocused(true) }}>×</button>}
              </div>
              {mapSearchFocused && mapSearch.trim() && (
                <div className="map-search-results" role="listbox" aria-label="Hasil pencarian satwa">
                  {mapSearchResults.length ? mapSearchResults.map((animal, index) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={selectedMapAnimal?.name === animal.name}
                      key={`${animal.name}-${animal.habitat}-${index}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setSelectedMapAnimal(animal)
                        setMapSearch(animal.name)
                        setMapSearchFocused(false)
                      }}
                    >
                      <span className="map-result-emoji">{animal.category === 'Aves' ? '🦜' : animal.category === 'Reptil' ? '🦎' : '🐾'}</span>
                      <span><strong>{animal.name}</strong><small>{animal.habitat}{animal.scientificName ? ` · ${animal.scientificName}` : ''}</small></span>
                      <span className="map-result-arrow">→</span>
                    </button>
                  )) : <p className="map-no-results">Satwa atau habitat tidak ditemukan. Coba nama lain.</p>}
                </div>
              )}
            </div>
            {selectedMapAnimal && (
              <div className="map-directions-panel" aria-live="polite">
                <div className="map-destination-card">
                  <span className="map-destination-icon">{selectedMapAnimal.category === 'Aves' ? '🦜' : selectedMapAnimal.category === 'Reptil' ? '🦎' : '🐾'}</span>
                  <div><span className="news-meta">TUJUAN ANDA</span><h3>{selectedMapAnimal.name}</h3><p>📍 {selectedMapAnimal.habitat}</p></div>
                  <span className="map-route-active-badge"><i /> Rute ditampilkan di peta</span>
                </div>
                {selectedHabitatGuide ? (
                  <div className="map-directions-content">
                    <div className="map-directions-title"><div><p className="eyebrow">PETUNJUK ARAH</p><h3>Dari Pintu Masuk ke {selectedMapAnimal.habitat}</h3></div><span>Rute ilustratif · sekitar 5–10 menit</span></div>
                    <ol className="map-directions-steps">
                      {selectedHabitatGuide.directions.map((direction, index) => <li key={`${selectedMapAnimal.name}-direction-${index}`}><span>{index === 0 ? '⌂' : index + 1}</span><p>{direction}</p></li>)}
                    </ol>
                    <p className="map-directions-note">Garis putus-putus pada denah menunjukkan rute dari pintu masuk ke habitat pilihan. Ikuti papan petunjuk dan arahan petugas di lokasi.</p>
                  </div>
                ) : (
                  <p className="map-directions-note">Lokasi satwa tercatat di habitat “{selectedMapAnimal.habitat}”, tetapi denah ini belum memiliki jalur khusus untuk area tersebut. Silakan tanyakan arah kepada petugas.</p>
                )}
              </div>
            )}
          </section>
        </>
      )}

      {/* Absensi Petugas */}
      {view === 'attendance' && (
        <>
          <SectionHeading
            eyebrow="KEHADIRAN TIM"
            title="Absensi Petugas Kebun Binatang"
            description="Pencatatan real-time jam kehadiran harian petugas perawat dan medis satwa."
            badge={new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date())}
          />
          <div className="attendance-cards">
            {staff.map((person) => {
              const present = attendance.some((record) => record.staffName === person.name && record.date === today())
              return (
                <article className="attendance-card" key={person.id}>
                  <div className="staff-avatar">{person.name.replace('drh. ', '').split(' ').map((p) => p[0]).slice(0, 2).join('')}</div>
                  <div>
                    <strong>{person.name}</strong>
                    <span>{person.role} · Shift {person.shift}</span>
                  </div>
                  <button
                    className={`button-secondary ${present ? 'attendance-done' : ''}`}
                    onClick={() => recordAttendance(person)}
                  >
                    {present ? '✓ Hadir' : 'Catat hadir'}
                  </button>
                </article>
              )
            })}
          </div>
          {editingAttendance && (
            <FormPanel
              title={`Edit absensi ${editingAttendance.staffName}`}
              description={`Perbarui jam atau status kehadiran tanggal ${editingAttendance.date}.`}
              onSubmit={saveAttendanceEdit}
              editing
              onCancel={() => setEditingAttendance(null)}
              editKey={editingAttendance.id}
            >
              <Field label="Jam masuk">
                <input type="time" name="checkIn" required defaultValue={editingAttendance.checkIn} />
              </Field>
              <Field label="Status">
                <select name="status" defaultValue={editingAttendance.status}>
                  <option>Hadir</option>
                  <option>Terlambat</option>
                  <option>Izin</option>
                  <option>Sakit</option>
                </select>
              </Field>
            </FormPanel>
          )}
          <ModuleTable
            headers={['PETUGAS', 'TANGGAL', 'JAM MASUK', 'STATUS', 'AKSI']}
            empty="Belum ada absensi tercatat hari ini."
            rows={attendance.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.staffName}</strong></td>
                <td>{item.date}</td>
                <td>{item.checkIn}</td>
                <td><span className="module-pill">{item.status}</span></td>
                <td>
                  <RowActions onEdit={() => setEditingAttendance(item)} onDelete={() => deleteAttendance(item)} />
                </td>
              </tr>
            ))}
          />
        </>
      )}

      {/* Laporan Terpadu */}
      {view === 'reports' && (
        <>
          <SectionHeading
            eyebrow="DATA OPERASIONAL & EKSPOR"
            title="Laporan Eksekutif Kebun Binatang"
            description="Rekapitulasi lengkap inventaris satwa realistis, reservasi pengunjung, transaksi tiket, rekam medis, dan konservasi."
            badge="Ekspor CSV & PDF"
          />
          <div className="report-metrics">
            <article>
              <span>🐾</span>
              <small>Satwa terdata</small>
              <strong>{animals.length}</strong>
            </article>
            <article>
              <span>👥</span>
              <small>Total Pengunjung</small>
              <strong>{visitors.reduce((sum, item) => sum + item.groupSize, 0)}</strong>
            </article>
            <article>
              <span>🎟️</span>
              <small>Transaksi Tiket</small>
              <strong>{tickets.length}</strong>
            </article>
            <article>
              <span>💰</span>
              <small>Pendapatan Lunas</small>
              <strong>{formatMoney(tickets.filter((t) => (t.paymentStatus ?? 'Lunas') === 'Lunas').reduce((sum, t) => sum + t.total, 0))}</strong>
            </article>
            <article>
              <span>🩺</span>
              <small>Rekam Medis</small>
              <strong>{medical.length}</strong>
            </article>
            <article>
              <span>🌱</span>
              <small>Data Konservasi</small>
              <strong>{conservation.length}</strong>
            </article>
            <article>
              <span>🥬</span>
              <small>Jadwal Pakan</small>
              <strong>{feedings.length}</strong>
            </article>
            <article>
              <span>🧑‍🌾</span>
              <small>Jumlah Petugas</small>
              <strong>{staff.length}</strong>
            </article>
          </div>

          <div className="module-report-panel">
            <div className="report-panel-header">
              <h3>Pratinjau Data Laporan</h3>
              <div className="report-export-actions">
                <button
                  className="button-secondary"
                  onClick={() =>
                    exportCsv(
                      `laporan-satwa-lengkap-${today()}.csv`,
                      ['Nama Satwa', 'Nama Ilmiah (Latin)', 'Kategori', 'Spesies', 'Usia', 'Bobot', 'Jenis Kelamin', 'Asal', 'Tanggal Masuk', 'Habitat', 'Kondisi', 'Status Konservasi'],
                      animals.map((a) => [
                        a.name,
                        a.scientificName || '—',
                        a.category || 'Mamalia',
                        a.species,
                        a.age ?? '',
                        a.weight || '—',
                        a.gender ?? 'Belum diketahui',
                        a.origin ?? '',
                        a.entryDate ?? '',
                        a.habitat,
                        a.status ?? 'Sehat',
                        a.conservationStatus || 'Risiko Rendah',
                      ]),
                    )
                  }
                >
                  ↓ Satwa CSV
                </button>
                <button
                  className="button-secondary"
                  onClick={() =>
                    exportCsv(
                      `laporan-pengunjung-${today()}.csv`,
                      ['Nama', 'Telepon', 'Tanggal', 'Jumlah', 'Kategori'],
                      visitors.map((item) => [item.name, item.phone, item.date, item.groupSize, item.category]),
                    )
                  }
                >
                  ↓ Pengunjung CSV
                </button>
                <button
                  className="button-secondary"
                  onClick={() =>
                    exportCsv(
                      `laporan-tiket-${today()}.csv`,
                      ['Kode', 'Pemegang', 'Tanggal', 'Dewasa', 'Anak', 'Metode', 'Status Bayar', 'Total', 'Status Masuk'],
                      tickets.map((item) => [
                        item.id,
                        item.visitorName,
                        item.date,
                        item.adultQty ?? item.quantity,
                        item.childQty ?? 0,
                        item.paymentMethod ?? '',
                        item.paymentStatus ?? 'Lunas',
                        item.total,
                        item.status,
                      ]),
                    )
                  }
                >
                  ↓ Tiket CSV
                </button>
                <button
                  className="button-secondary"
                  onClick={() =>
                    exportCsv(
                      `laporan-medis-${today()}.csv`,
                      ['Satwa', 'Tanggal', 'Penyakit', 'Diagnosis', 'Vaksin', 'Obat', 'Kontrol', 'Dokter'],
                      medical.map((item) => [item.animalName, item.date, item.disease ?? '', item.diagnosis, item.vaccine, item.medicine ?? '', item.nextExam, item.vet]),
                    )
                  }
                >
                  ↓ Medis CSV
                </button>
                <button
                  className="button-secondary"
                  onClick={() =>
                    exportCsv(
                      `laporan-konservasi-${today()}.csv`,
                      ['Spesies', 'Status IUCN', 'Kelahiran', 'Tanggal Kelahiran', 'Catatan'],
                      conservation.map((item) => [item.animalName, item.conservationStatus, item.births, item.lastBirth, item.notes]),
                    )
                  }
                >
                  ↓ Konservasi CSV
                </button>
                <button className="button-primary" onClick={() => window.print()}>
                  🖨️ Cetak / Simpan PDF
                </button>
              </div>
            </div>

            <div className="report-tabs" role="tablist" aria-label="Jenis laporan">
              {(['animals', 'visitors', 'tickets', 'medical', 'conservation'] as const).map((category) => (
                <button
                  key={category}
                  role="tab"
                  aria-selected={reportCategory === category}
                  className={reportCategory === category ? 'active' : ''}
                  onClick={() => setReportCategory(category)}
                >
                  {({
                    animals: 'Inventaris Satwa Realistis',
                    visitors: 'Data Pengunjung',
                    tickets: 'Penjualan Tiket Digital',
                    medical: 'Rekam Medis Satwa',
                    conservation: 'Konservasi Spesies',
                  })[category]}
                </button>
              ))}
            </div>

            {reportCategory === 'animals' && (
              <ModuleTable
                headers={['NAMA SATWA', 'NAMA ILMIAH (LATIN)', 'KATEGORI', 'SPESIES', 'BOBOT', 'HABITAT', 'STATUS IUCN', 'KONDISI']}
                empty="Belum ada data satwa."
                rows={animals.map((animal) => (
                  <tr key={animal.name}>
                    <td><strong>{animal.name}</strong></td>
                    <td><em>{animal.scientificName || animal.species}</em></td>
                    <td>{animal.category || 'Mamalia'}</td>
                    <td>{animal.species}</td>
                    <td>{animal.weight || '—'}</td>
                    <td>{animal.habitat}</td>
                    <td>
                      <span className={`module-pill pill-${(animal.conservationStatus || 'Risiko Rendah').toLowerCase().replace(/\s+/g, '-')}`}>
                        {animal.conservationStatus || 'Risiko Rendah'}
                      </span>
                    </td>
                    <td>{animal.status ?? 'Sehat'}</td>
                  </tr>
                ))}
              />
            )}

            {reportCategory === 'visitors' && (
              <ModuleTable
                headers={['PENGUNJUNG', 'KONTAK', 'TANGGAL', 'JUMLAH ORANG', 'KATEGORI']}
                empty="Belum ada data pengunjung."
                rows={visitors.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.phone}</td>
                    <td>{item.date}</td>
                    <td>{item.groupSize}</td>
                    <td>{item.category}</td>
                  </tr>
                ))}
              />
            )}

            {reportCategory === 'tickets' && (
              <ModuleTable
                headers={['KODE', 'PEMEGANG', 'TANGGAL', 'JUMLAH', 'PEMBAYARAN', 'TOTAL', 'STATUS']}
                empty="Belum ada transaksi tiket."
                rows={tickets.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.visitorName}</td>
                    <td>{item.date}</td>
                    <td>{item.quantity}</td>
                    <td>{item.paymentMethod ?? 'Tunai'} · {item.paymentStatus ?? 'Lunas'}</td>
                    <td>{formatMoney(item.total)}</td>
                    <td>{item.status}</td>
                  </tr>
                ))}
              />
            )}

            {reportCategory === 'medical' && (
              <ModuleTable
                headers={['HEWAN', 'TANGGAL', 'PENYAKIT', 'HASIL', 'VAKSIN', 'OBAT', 'KONTROL', 'DOKTER']}
                empty="Belum ada rekam medis."
                rows={medical.map((item) => (
                  <tr key={item.id}>
                    <td>{item.animalName}</td>
                    <td>{item.date}</td>
                    <td>{item.disease ?? '—'}</td>
                    <td>{item.diagnosis}</td>
                    <td>{item.vaccine}</td>
                    <td>{item.medicine ?? '—'}</td>
                    <td>{item.nextExam}</td>
                    <td>{item.vet}</td>
                  </tr>
                ))}
              />
            )}

            {reportCategory === 'conservation' && (
              <ModuleTable
                headers={['SPESIES', 'STATUS IUCN', 'KELAHIRAN', 'TANGGAL', 'CATATAN']}
                empty="Belum ada laporan konservasi."
                rows={conservation.map((item) => (
                  <tr key={item.id}>
                    <td>{item.animalName}</td>
                    <td>
                      <span className={`module-pill pill-${item.conservationStatus.toLowerCase().replace(/\s+/g, '-')}`}>
                        {item.conservationStatus}
                      </span>
                    </td>
                    <td>{item.births}</td>
                    <td>{item.lastBirth}</td>
                    <td>{item.notes}</td>
                  </tr>
                ))}
              />
            )}
          </div>

          <p className="module-disclaimer">
            Catatan: Sistem menggunakan penyimpanan lokal browser (localStorage) yang aman dan otomatis tersinkronisasi antar-modul. Data siap untuk presentasi Final Project sistem informasi kebun binatang.
          </p>
        </>
      )}
    </div>
  )
}
