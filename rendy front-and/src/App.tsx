import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react'
import './App.css'
import ZooModules from './ZooModules'
import IncidentCenter from './IncidentCenter'
import VisitorPortal from './VisitorPortal'
import Chatbot from './Chatbot'
import { doc, getDoc } from 'firebase/firestore'
import {
  auth,
  db,
  getRedirectResult,
  googleProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  useFirestoreCollection,
} from './firebase'

const ADMIN_EMAILS = new Set(
  (import.meta.env.VITE_FIREBASE_ADMIN_EMAILS || import.meta.env.VITE_FIREBASE_ALLOWED_EMAIL || 'rendisumual322@gmail.com')
    .split(',').map((email: string) => email.trim().toLowerCase()).filter(Boolean),
)
type ManagerRole = 'admin' | 'security' | 'unassigned'

// Tipe data utama untuk inventaris satwa realistis dan operasional kebun binatang.
export type AnimalStatus = 'Sehat' | 'Dalam Perawatan' | 'Karantina'
export type AnimalCategory = 'Mamalia' | 'Reptil' | 'Aves' | 'Amfibi' | 'Pisces'
export type ConservationStatus = 'Kritis' | 'Terancam punah' | 'Rentan' | 'Risiko Rendah'

export type Animal = {
  id: string
  name: string
  scientificName: string
  category: AnimalCategory
  species: string
  habitat: string
  age: number
  weight: string
  status: AnimalStatus
  conservationStatus: ConservationStatus
  diet: string
  emoji: string
  imageUrl: string
  gender: 'Jantan' | 'Betina' | 'Belum diketahui'
  origin: string
  entryDate: string
  description?: string
  soundType?: 'roar' | 'trumpet' | 'chirp' | 'bark' | 'hiss' | 'growl'
}

type Habitat = {
  id: string
  name: string
  location: string
  capacity: number
  cleanliness: 'Bersih' | 'Perlu dibersihkan'
}

type CareTask = {
  id: string
  animalId: string
  animalName: string
  type: 'Pemberian pakan' | 'Pemeriksaan medis' | 'Pembersihan kandang'
  date: string
  time: string
  notes: string
  done: boolean
}

type View =
  | 'dashboard'
  | 'animals'
  | 'habitats'
  | 'care'
  | 'reports'
  | 'visitors'
  | 'tickets'
  | 'staff'
  | 'medical'
  | 'feeding'
  | 'conservation'
  | 'map'
  | 'attendance'
  | 'incidents'
  | 'roles'
  | 'chatbot'

// Kunci penyimpanan localStorage
const ANIMALS_KEY = 'wildlifepark_animals_v2'
const CARE_KEY = 'wildlifepark_care_v2'
const HABITATS_KEY = 'wildlifepark_habitats_v2'

const initialHabitats: Habitat[] = [
  { id: 'h1', name: 'Sabana', location: 'Zona Barat · Area terbuka padang rumput', capacity: 12, cleanliness: 'Bersih' },
  { id: 'h2', name: 'Hutan Hujan', location: 'Zona Utara · Kanopi hutan tropis lembap', capacity: 10, cleanliness: 'Bersih' },
  { id: 'h3', name: 'Danau Buaya', location: 'Zona Timur · Danau air payau & rawa', capacity: 8, cleanliness: 'Perlu dibersihkan' },
  { id: 'h4', name: 'Rumah Primata', location: 'Zona Selatan · Area panjat alami & teduh', capacity: 9, cleanliness: 'Bersih' },
  { id: 'h5', name: 'Kandang Burung', location: 'Zona Timur · Aviari kubah raksasa', capacity: 16, cleanliness: 'Bersih' },
]

function getTodayISODate() {
  const date = new Date()
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

// Preset satwa realistis lengkap dengan nama ilmiah (Latin), foto HD, taksonomi, dan deskripsi biologis
export const realisticPresets: Array<Omit<Animal, 'id'>> = [
  {
    name: 'Harimau Sumatera',
    scientificName: 'Panthera tigris sumatrae',
    category: 'Mamalia',
    species: 'Harimau',
    habitat: 'Hutan Hujan',
    age: 6,
    weight: '120 kg',
    status: 'Karantina',
    conservationStatus: 'Kritis',
    diet: 'Daging sapi & unggas segar (6 kg/hari)',
    emoji: '🐅',
    imageUrl: 'https://images.unsplash.com/photo-1534188753412-3e26d0d618d6?w=800&auto=format&fit=crop&q=80',
    gender: 'Jantan',
    origin: 'Taman Nasional Kerinci Seblat, Sumatera',
    entryDate: '2023-04-12',
    description: 'Subspesies harimau terkecil di dunia dengan corak loreng paling rapat dan warna jingga gelap. Merupakan satwa endemik pulau Sumatera yang statusnya sangat terancam punah.',
    soundType: 'roar',
  },
  {
    name: 'Singa Afrika',
    scientificName: 'Panthera leo',
    category: 'Mamalia',
    species: 'Singa',
    habitat: 'Sabana',
    age: 8,
    weight: '190 kg',
    status: 'Sehat',
    conservationStatus: 'Rentan',
    diet: 'Daging sapi segar (7 kg/hari)',
    emoji: '🦁',
    imageUrl: 'https://images.unsplash.com/photo-1546182990-dffeafbe841d?w=800&auto=format&fit=crop&q=80',
    gender: 'Jantan',
    origin: 'Serengeti, Tanzania (Konservasi Kerjasama)',
    entryDate: '2022-08-19',
    description: 'Pemangsa puncak sosial yang hidup dalam kawanan. Pejantan dewasa memiliki surai gelap lebat yang melindungi leher saat bertarung dan menandakan kesehatan serta kewibawaan kelompok.',
    soundType: 'roar',
  },
  {
    name: 'Gajah Sumatera',
    scientificName: 'Elephas maximus sumatranus',
    category: 'Mamalia',
    species: 'Gajah',
    habitat: 'Hutan Hujan',
    age: 14,
    weight: '3.500 kg',
    status: 'Sehat',
    conservationStatus: 'Kritis',
    diet: 'Rumput gajah, pisang, dedaunan tebu (150 kg/hari)',
    emoji: '🐘',
    imageUrl: 'https://images.unsplash.com/photo-1557050543-4d5f4e07ef46?w=800&auto=format&fit=crop&q=80',
    gender: 'Betina',
    origin: 'Pusat Latihan Gajah Way Kambas, Lampung',
    entryDate: '2021-02-10',
    description: 'Mamalia darat terbesar di Indonesia. Berperan sebagai insinyur ekosistem alami karena membuka jalur vegetasi dan menyebarkan biji-bijian pohon hutan tropis.',
    soundType: 'trumpet',
  },
  {
    name: 'Orangutan Kalimantan',
    scientificName: 'Pongo pygmaeus',
    category: 'Mamalia',
    species: 'Orangutan',
    habitat: 'Rumah Primata',
    age: 9,
    weight: '75 kg',
    status: 'Dalam Perawatan',
    conservationStatus: 'Kritis',
    diet: 'Buah tin, pisang, daun muda & madu (6 kg/hari)',
    emoji: '🦧',
    imageUrl: 'https://images.unsplash.com/photo-1534567153574-2b12153a87f0?w=800&auto=format&fit=crop&q=80',
    gender: 'Jantan',
    origin: 'Hutan Lindung Sebangau, Kalimantan Tengah',
    entryDate: '2023-11-05',
    description: 'Primata arboreal besar dengan rambut merah kecokelatan. Memiliki kecerdasan tinggi dalam memecahkan masalah, menggunakan ranting sebagai alat, dan merakit tempat tidur baru setiap malam di kanopi pohon.',
    soundType: 'bark',
  },
  {
    name: 'Buaya Muara',
    scientificName: 'Crocodylus porosus',
    category: 'Reptil',
    species: 'Buaya',
    habitat: 'Danau Buaya',
    age: 18,
    weight: '420 kg',
    status: 'Dalam Perawatan',
    conservationStatus: 'Risiko Rendah',
    diet: 'Ikan bandeng, ayam potong segar (12 kg/pekan)',
    emoji: '🐊',
    imageUrl: 'https://images.unsplash.com/photo-1522069169874-c58ec4b76be5?w=800&auto=format&fit=crop&q=80',
    gender: 'Jantan',
    origin: 'Muara Sungai Mahakam, Kalimantan Timur',
    entryDate: '2019-10-14',
    description: 'Reptil agresif dan sangat adaptif di ekosistem pesisir serta perairan tawar. Buaya muara berperan penting sebagai predator puncak yang menjaga keseimbangan rantai makanan di habitatnya.',
    soundType: 'hiss',
  },
  {
    name: 'Jerapah Afrika',
    scientificName: 'Giraffa camelopardalis',
    category: 'Mamalia',
    species: 'Jerapah',
    habitat: 'Sabana',
    age: 7,
    weight: '980 kg',
    status: 'Sehat',
    conservationStatus: 'Rentan',
    diet: 'Daun akasia, kangkung, wortel segar (30 kg/hari)',
    emoji: '🦒',
    imageUrl: 'https://images.unsplash.com/photo-1547721064-da6cfb341d50?w=800&auto=format&fit=crop&q=80',
    gender: 'Betina',
    origin: 'Sabana Kenya (Program Kerjasama Satwa Dunia)',
    entryDate: '2022-09-01',
    description: 'Satwa bertubuh paling jangkung di bumi dengan leher panjang anggun dan lidah kebiruan sepanjang 45 cm yang kebal terhadap duri pepohonan akasia.',
    soundType: 'growl',
  },
  {
    name: 'Zebra Dataran',
    scientificName: 'Equus quagga',
    category: 'Mamalia',
    species: 'Zebra',
    habitat: 'Sabana',
    age: 5,
    weight: '310 kg',
    status: 'Sehat',
    conservationStatus: 'Risiko Rendah',
    diet: 'Rumput kering, dedaunan, pelet serat (14 kg/hari)',
    emoji: '🦓',
    imageUrl: 'https://images.unsplash.com/photo-1501706362039-c06b2d715385?w=800&auto=format&fit=crop&q=80',
    gender: 'Betina',
    origin: 'Dataran Savanna Afrika Timur',
    entryDate: '2023-01-20',
    description: 'Hewan berkuku ganjil dengan motif belang monokrom yang unik pada setiap individu. Pola belangnya membantu mengacaukan penglihatan predator dalam rombongan.',
    soundType: 'bark',
  },
  {
    name: 'Panda Raksasa',
    scientificName: 'Ailuropoda melanoleuca',
    category: 'Mamalia',
    species: 'Panda',
    habitat: 'Rumah Primata',
    age: 4,
    weight: '105 kg',
    status: 'Sehat',
    conservationStatus: 'Rentan',
    diet: 'Rebung bambu segar & suplemen nutrisi (15 kg/hari)',
    emoji: '🐼',
    imageUrl: 'https://images.unsplash.com/photo-1527118732049-c88155f2107c?w=800&auto=format&fit=crop&q=80',
    gender: 'Jantan',
    origin: 'Pusat Konservasi Wolong, Sichuan',
    entryDate: '2024-03-10',
    description: 'Simbol konservasi global yang menggemaskan dengan corak bulu hitam-putih. Memiliki ibu jari semu pada cakar depannya untuk menggenggam batang bambu dengan kokoh.',
    soundType: 'chirp',
  },
  {
    name: 'Buaya Muara',
    scientificName: 'Crocodylus porosus',
    category: 'Reptil',
    species: 'Buaya',
    habitat: 'Danau Buaya',
    age: 18,
    weight: '420 kg',
    status: 'Dalam Perawatan',
    conservationStatus: 'Risiko Rendah',
    diet: 'Ikan bandeng, ayam potong segar (12 kg/pekan)',
    emoji: '🐊',
    imageUrl: 'https://images.unsplash.com/photo-1522069169874-c58ec4b76be5?w=800&auto=format&fit=crop&q=80',
    gender: 'Jantan',
    origin: 'Muara Sungai Mahakam, Kalimantan Timur',
    entryDate: '2019-10-14',
    description: 'Reptil terbesar dan pemangsa penyergap paling mematikan. Mengandalkan katup kedap air di kerongkongan untuk menyergap mangsa di perairan payau tanpa tersedak air.',
    soundType: 'hiss',
  },
  {
    name: 'Kakatua Raja',
    scientificName: 'Probosciger aterrimus',
    category: 'Aves',
    species: 'Kakatua',
    habitat: 'Kandang Burung',
    age: 6,
    weight: '1.1 kg',
    status: 'Sehat',
    conservationStatus: 'Terancam punah',
    diet: 'Biji sawit hutan, buah kenari, jagung manis (450 g/hari)',
    emoji: '🦜',
    imageUrl: 'https://images.unsplash.com/photo-1552728089-57bdde30beb3?w=800&auto=format&fit=crop&q=80',
    gender: 'Jantan',
    origin: 'Hutan Hujan Dataran Rendah Papua',
    entryDate: '2022-05-18',
    description: 'Burung kakatua terhebat dengan bulu hitam legam, jambul tegak dramatis, serta pipi merah merona yang bisa memerah lebih terang saat sedang antusias atau waspada.',
    soundType: 'chirp',
  },
  {
    name: 'Burung Merak Biru',
    scientificName: 'Pavo cristatus',
    category: 'Aves',
    species: 'Merak',
    habitat: 'Kandang Burung',
    age: 4,
    weight: '4.5 kg',
    status: 'Sehat',
    conservationStatus: 'Risiko Rendah',
    diet: 'Biji-bijian, serangga kecil, kecambah hijau (350 g/hari)',
    emoji: '🦚',
    imageUrl: 'https://images.unsplash.com/photo-1536514498073-50e69d39c6cf?w=800&auto=format&fit=crop&q=80',
    gender: 'Jantan',
    origin: 'Kawasan Suaka Margasatwa Konservasi Aves',
    entryDate: '2023-07-22',
    description: 'Burung eksotis bermahkota dengan ekor kipas kemilau berwarna hijau zamrud dan biru safir yang memancarkan kilau saat bermandikan sinar matahari pagi.',
    soundType: 'chirp',
  },
  {
    name: 'Beruang Madu',
    scientificName: 'Helarctos malayanus',
    category: 'Mamalia',
    species: 'Beruang',
    habitat: 'Hutan Hujan',
    age: 5,
    weight: '55 kg',
    status: 'Sehat',
    conservationStatus: 'Rentan',
    diet: 'Buah ara liar, larva rayap, sarang madu (4 kg/hari)',
    emoji: '🐻',
    imageUrl: 'https://images.unsplash.com/photo-1530595467537-0b5996c41f2d?w=800&auto=format&fit=crop&q=80',
    gender: 'Betina',
    origin: 'Kawasan Konservasi Hutan Bukit Barisan Selatan',
    entryDate: '2023-09-30',
    description: 'Beruang terkecil di dunia dengan tanda tapal kuda jingga di dada menyerupai matahari terbit. Memiliki kuku melengkung kokoh untuk memanjat pohon kanopi tinggi.',
    soundType: 'growl',
  },
]

const initialAnimals: Animal[] = realisticPresets.map((preset, index) => ({
  ...preset,
  id: `a${index + 1}`,
}))

const initialCare: CareTask[] = [
  { id: 'c1', animalId: 'a2', animalName: 'Singa Afrika', type: 'Pemberian pakan', date: getTodayISODate(), time: '09:00', notes: 'Porsi daging sapi segar 7 kg', done: false },
  { id: 'c2', animalId: 'a4', animalName: 'Orangutan Kalimantan', type: 'Pemeriksaan medis', date: getTodayISODate(), time: '10:30', notes: 'Kontrol kesehatan gigi & nafsu makan', done: false },
  { id: 'c3', animalId: 'a3', animalName: 'Gajah Sumatera', type: 'Pemberian pakan', date: getTodayISODate(), time: '11:00', notes: 'Rumput gajah & buah tebu segar', done: true },
  { id: 'c4', animalId: 'a1', animalName: 'Harimau Sumatera', type: 'Pembersihan kandang', date: getTodayISODate(), time: '13:00', notes: 'Sterilisasi area karantina', done: false },
  { id: 'c5', animalId: 'a8', animalName: 'Panda Raksasa', type: 'Pemberian pakan', date: getTodayISODate(), time: '14:00', notes: 'Bambu muda segar & suplemen', done: false },
]

// Simulator suara satwa alami menggunakan Web Audio API tanpa perlu file mp3 eksternal
function playAnimalSound(type?: string) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const now = ctx.currentTime

    if (type === 'roar') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(120, now)
      osc.frequency.exponentialRampToValueAtTime(45, now + 1.2)
      gain.gain.setValueAtTime(0.3, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 1.2)
    } else if (type === 'trumpet') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(260, now)
      osc.frequency.exponentialRampToValueAtTime(460, now + 0.3)
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.9)
      gain.gain.setValueAtTime(0.25, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.9)
    } else if (type === 'chirp') {
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        const t = now + i * 0.18
        osc.frequency.setValueAtTime(1600 + i * 200, t)
        osc.frequency.exponentialRampToValueAtTime(2800, t + 0.08)
        osc.frequency.exponentialRampToValueAtTime(1200, t + 0.15)
        gain.gain.setValueAtTime(0.2, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(t)
        osc.stop(t + 0.15)
      }
    } else if (type === 'hiss') {
      const bufferSize = Math.floor(ctx.sampleRate * 0.8)
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1
      }
      const noise = ctx.createBufferSource()
      noise.buffer = buffer
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.setValueAtTime(3200, now)
      filter.Q.setValueAtTime(3, now)
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.18, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8)
      noise.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)
      noise.start(now)
    } else {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(180, now)
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.7)
      gain.gain.setValueAtTime(0.25, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.7)
    }
  } catch {
    // Abaikan jika browser membatasi autoplay
  }
}

// Membaca data storage dengan migrasi otomatis ke satwa realistis
function readAnimalsStorage(): Animal[] {
  try {
    const stored = localStorage.getItem(ANIMALS_KEY)
    if (!stored) return initialAnimals
    const parsed = JSON.parse(stored) as Animal[]
    if (!Array.isArray(parsed) || parsed.length === 0 || !parsed[0].imageUrl || !parsed[0].scientificName) {
      return initialAnimals
    }
    return parsed
  } catch {
    return initialAnimals
  }
}

function readStorage<T,>(key: string, fallback: T[]): T[] {
  try {
    const stored = localStorage.getItem(key)
    return stored ? (JSON.parse(stored) as T[]) : fallback
  } catch {
    return fallback
  }
}

function ZooDashboard({ role, userEmail }: { role: 'admin'; userEmail: string }) {
  const [animals, setAnimals] = useFirestoreCollection<Animal>('zoo_animals', ANIMALS_KEY, readAnimalsStorage)
  const [habitats, setHabitats] = useFirestoreCollection<Habitat>('zoo_habitats', HABITATS_KEY, () => readStorage(HABITATS_KEY, initialHabitats))
  const [careTasks, setCareTasks] = useFirestoreCollection<CareTask>('zoo_care_tasks', CARE_KEY, () =>
    readStorage<CareTask>(CARE_KEY, initialCare).map((task) => ({ ...task, date: task.date || getTodayISODate() })),
  )
  const [view, setView] = useState<View>('dashboard')
  const [floatingChatOpen, setFloatingChatOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Semua status')
  const [categoryFilter, setCategoryFilter] = useState('Semua Kategori')
  const [conservationFilter, setConservationFilter] = useState('Semua Konservasi')
  const [notice, setNotice] = useState('')
  const [animalDialog, setAnimalDialog] = useState(false)
  const [careDialog, setCareDialog] = useState(false)
  const [selectedCareAnimalId, setSelectedCareAnimalId] = useState<string>('')
  const [editingAnimal, setEditingAnimal] = useState<Animal | null>(null)
  const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null)
  const [formPreset, setFormPreset] = useState<Omit<Animal, 'id'> | null>(null)
  const [habitatDialog, setHabitatDialog] = useState(false)
  const [editingHabitat, setEditingHabitat] = useState<Habitat | null>(null)
  const [, setModuleDataVersion] = useState(0)
  const [soundPlaying, setSoundPlaying] = useState<string | null>(null)

  const [activeIncidentsCount, setActiveIncidentsCount] = useState<number>(0)
  const [latestVisitorIncident, setLatestVisitorIncident] = useState<{ id: string; title: string; reporter: string; location: string } | null>(null)

  useEffect(() => {
    const checkIncidents = () => {
      try {
        const cached = localStorage.getItem('smartzoo_incidents_v1')
        if (cached) {
          const list = JSON.parse(cached)
          if (Array.isArray(list)) {
            const active = list.filter((i: { status?: string }) => i.status !== 'Selesai')
            setActiveIncidentsCount(active.length)
            const visitorReport = active.find((i: { reportedBy?: string }) => String(i.reportedBy || '').toLowerCase().startsWith('pengunjung'))
            if (visitorReport) {
              setLatestVisitorIncident({
                id: visitorReport.id,
                title: visitorReport.title,
                reporter: String(visitorReport.reportedBy || '').replace(/^Pengunjung:\s*/i, ''),
                location: visitorReport.location,
              })
            } else {
              setLatestVisitorIncident(null)
            }
          }
        }
      } catch {}
    }
    checkIncidents()
    window.addEventListener('smartzoo:incident-reported', checkIncidents)
    window.addEventListener('storage', checkIncidents)
    window.addEventListener('rimbakita:data-changed', checkIncidents)
    return () => {
      window.removeEventListener('smartzoo:incident-reported', checkIncidents)
      window.removeEventListener('storage', checkIncidents)
      window.removeEventListener('rimbakita:data-changed', checkIncidents)
    }
  }, [])

  useEffect(() => {
    const refresh = () => setModuleDataVersion((version) => version + 1)
    window.addEventListener('rimbakita:data-changed', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('rimbakita:data-changed', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 3500)
    return () => window.clearTimeout(timeout)
  }, [notice])

  // Pencarian multi-kriteria untuk katalog satwa
  const filteredAnimals = useMemo(() => {
    const query = search.trim().toLowerCase()
    return animals.filter((animal) => {
      const matchesQuery = [
        animal.name,
        animal.scientificName ?? '',
        animal.species,
        animal.category ?? '',
        animal.habitat,
        animal.gender ?? '',
        animal.origin ?? '',
        animal.conservationStatus ?? '',
      ].some((value) => value.toLowerCase().includes(query))

      const matchesStatus = statusFilter === 'Semua status' || animal.status === statusFilter
      const matchesCategory = categoryFilter === 'Semua Kategori' || animal.category === categoryFilter
      const matchesConservation = conservationFilter === 'Semua Konservasi' || animal.conservationStatus === conservationFilter

      return matchesQuery && matchesStatus && matchesCategory && matchesConservation
    })
  }, [animals, search, statusFilter, categoryFilter, conservationFilter])

  const todayLabel = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
  const todayISODate = getTodayISODate()
  const habitatNames = habitats.map((habitat) => habitat.name)
  const todayTasks = careTasks.filter((task) => task.date === todayISODate)
  const healthyCount = animals.filter((animal) => animal.status === 'Sehat').length
  const pendingTasks = todayTasks.filter((task) => !task.done).length
  const speciesCount = new Set(animals.map((animal) => animal.species)).size
  const visitorCountToday = readStorage<{ date: string; groupSize: number }>('rimbakita_visitors_v1', [{ date: todayISODate, groupSize: 2 }])
    .filter((visitor) => visitor.date === todayISODate)
    .reduce((total, visitor) => total + visitor.groupSize, 0)
  const visitorRecords = readStorage<{ date: string; groupSize: number }>('rimbakita_visitors_v1', [{ date: todayISODate, groupSize: 2 }])
  const ticketRecords = readStorage<{ date: string; total: number; paymentStatus?: string }>('rimbakita_tickets_v1', [])
  const sickCount = animals.filter((animal) => animal.status !== 'Sehat').length
  const endangeredCount = animals.filter((animal) => ['Kritis', 'Terancam punah'].includes(animal.conservationStatus)).length
  const revenueTotal = ticketRecords.filter((ticket) => ticket.paymentStatus !== 'Belum bayar').reduce((sum, ticket) => sum + ticket.total, 0)

  const monthlyVisitorStats = Array.from({ length: 6 }, (_, index) => {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() - (5 - index))
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    return {
      label: new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(date),
      count: visitorRecords.filter((record) => record.date.startsWith(key)).reduce((sum, record) => sum + record.groupSize, 0),
    }
  })
  const maxMonthlyVisitors = Math.max(1, ...monthlyVisitorStats.map((month) => month.count))

  function openAddAnimal() {
    setEditingAnimal(null)
    setFormPreset(null)
    setAnimalDialog(true)
  }

  function handlePlaySound(animal: Animal) {
    setSoundPlaying(animal.id)
    playAnimalSound(animal.soundType)
    setTimeout(() => setSoundPlaying(null), 1200)
  }

  function saveHabitat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const habitat: Habitat = {
      id: editingHabitat?.id ?? crypto.randomUUID(),
      name,
      location: String(data.get('location') ?? '').trim(),
      capacity: Number(data.get('capacity')),
      cleanliness: String(data.get('cleanliness')) as Habitat['cleanliness'],
    }
    if (!name || !habitat.location || habitat.capacity < 1) return
    const assignedAnimalCount = animals.filter((animal) => animal.habitat === (editingHabitat?.name ?? name)).length
    if (habitat.capacity < assignedAnimalCount) {
      setNotice(`Kapasitas tidak boleh lebih kecil dari ${assignedAnimalCount} satwa yang sudah menempati kandang.`)
      return
    }
    if (editingHabitat) {
      if (habitats.some((item) => item.name === name && item.id !== habitat.id)) {
        setNotice('Nama kandang sudah digunakan.')
        return
      }
      const oldName = editingHabitat.name
      setHabitats((current) => current.map((item) => (item.id === habitat.id ? habitat : item)))
      if (oldName !== name) setAnimals((current) => current.map((animal) => (animal.habitat === oldName ? { ...animal, habitat: name } : animal)))
      setNotice(`Data kandang ${name} berhasil diperbarui.`)
    } else {
      if (habitats.some((item) => item.name === name)) {
        setNotice('Nama kandang sudah digunakan.')
        return
      }
      setHabitats((current) => [habitat, ...current])
      setNotice(`Kandang ${name} berhasil ditambahkan.`)
    }
    setHabitatDialog(false)
    setEditingHabitat(null)
  }

  function deleteHabitat(habitat: Habitat) {
    if (animals.some((animal) => animal.habitat === habitat.name)) {
      setNotice('Kandang masih memiliki satwa. Pindahkan satwa terlebih dahulu sebelum menghapus kandang.')
      return
    }
    if (!window.confirm(`Hapus data kandang ${habitat.name}?`)) return
    setHabitats((current) => current.filter((item) => item.id !== habitat.id))
    setNotice(`Kandang ${habitat.name} berhasil dihapus.`)
  }

  function saveAnimal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const name = String(formData.get('name') ?? '').trim()
    const scientificName = String(formData.get('scientificName') ?? '').trim()
    const category = String(formData.get('category') ?? 'Mamalia') as AnimalCategory
    const species = String(formData.get('species') ?? '').trim()
    const habitat = String(formData.get('habitat') ?? '')
    const age = Number(formData.get('age'))
    const weight = String(formData.get('weight') ?? '').trim() || '—'
    const status = String(formData.get('status') ?? 'Sehat') as AnimalStatus
    const conservationStatus = String(formData.get('conservationStatus') ?? 'Risiko Rendah') as ConservationStatus
    const diet = String(formData.get('diet') ?? '').trim()
    const imageUrl = String(formData.get('imageUrl') ?? '').trim() || 'https://images.unsplash.com/photo-1534188753412-3e26d0d618d6?w=800&auto=format&fit=crop&q=80'
    const gender = String(formData.get('gender') ?? 'Belum diketahui') as Animal['gender']
    const origin = String(formData.get('origin') ?? '').trim()
    const entryDate = String(formData.get('entryDate') ?? '')
    const description = String(formData.get('description') ?? '').trim()
    const soundType = (String(formData.get('soundType') ?? 'growl')) as Animal['soundType']

    if (!name || !species || !habitat || !Number.isFinite(age) || age < 0 || !diet) return

    if (editingAnimal) {
      const updated: Animal = {
        ...editingAnimal,
        name,
        scientificName: scientificName || editingAnimal.scientificName || species,
        category,
        species,
        habitat,
        age,
        weight,
        status,
        conservationStatus,
        diet,
        imageUrl,
        gender,
        origin,
        entryDate,
        description,
        soundType,
      }
      setAnimals((current) => current.map((animal) => (animal.id === editingAnimal.id ? updated : animal)))
      if (selectedAnimal?.id === editingAnimal.id) setSelectedAnimal(updated)
      setNotice(`${name} berhasil diperbarui.`)
    } else {
      const animal: Animal = {
        id: crypto.randomUUID(),
        name,
        scientificName: scientificName || species,
        category,
        species,
        habitat,
        age,
        weight,
        status,
        conservationStatus,
        diet,
        imageUrl,
        gender,
        origin,
        entryDate,
        description,
        soundType,
        emoji: '🐾',
      }
      setAnimals((current) => [animal, ...current])
      setNotice(`${name} berhasil ditambahkan ke inventaris satwa.`)
    }
    setAnimalDialog(false)
    setEditingAnimal(null)
    setFormPreset(null)
  }

  function createAnimalDescriptionDraft(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form
    if (!form) return
    const data = new FormData(form)
    const name = String(data.get('name') ?? 'Satwa ini').trim()
    const scientificName = String(data.get('scientificName') ?? '').trim()
    const category = String(data.get('category') ?? '').trim().toLowerCase()
    const species = String(data.get('species') ?? '').trim()
    const habitat = String(data.get('habitat') ?? '').trim()
    const age = String(data.get('age') ?? '').trim()
    const diet = String(data.get('diet') ?? '').trim()
    const status = String(data.get('status') ?? '').trim().toLowerCase()
    const conservationStatus = String(data.get('conservationStatus') ?? '').trim()
    const origin = String(data.get('origin') ?? '').trim()
    const facts = [
      `${name}${scientificName ? ` (${scientificName})` : ''} merupakan ${category || 'satwa'}${species ? ` dari kelompok ${species}` : ''} yang tercatat dalam koleksi Taman Satwa Nusantara.`,
      habitat ? `Satwa ini ditempatkan di habitat ${habitat}.` : '',
      age ? `Usia yang tercatat saat ini ${age} tahun.` : '',
      diet ? `Pola pakan yang dicatat pengelola: ${diet}.` : '',
      status ? `Kondisi terkini berstatus ${status}.` : '',
      conservationStatus ? `Status konservasi yang dicatat: ${conservationStatus}.` : '',
      origin ? `Asal atau riwayat kedatangan: ${origin}.` : '',
      'Draf ini disusun dari data inventaris dan perlu ditinjau petugas sebelum dipublikasikan.',
    ].filter(Boolean)
    const descriptionField = form.elements.namedItem('description')
    if (descriptionField instanceof HTMLTextAreaElement) {
      descriptionField.value = facts.join(' ')
      descriptionField.dispatchEvent(new Event('input', { bubbles: true }))
      setNotice('Draf deskripsi dibuat dari data yang diisi. Tinjau fakta dan edit sebelum menyimpan.')
    }
  }

  function deleteAnimal(animal: Animal) {
    if (!window.confirm(`Hapus data ${animal.name} dari inventaris satwa?`)) return
    setAnimals((current) => current.filter((item) => item.id !== animal.id))
    setCareTasks((current) => current.filter((task) => task.animalId !== animal.id))
    if (selectedAnimal?.id === animal.id) setSelectedAnimal(null)
    setNotice(`Data ${animal.name} berhasil dihapus.`)
  }

  function saveCareTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const animal = animals.find((item) => item.id === String(formData.get('animalId')))
    if (!animal) return
    const task: CareTask = {
      id: crypto.randomUUID(),
      animalId: animal.id,
      animalName: animal.name,
      type: String(formData.get('type')) as CareTask['type'],
      date: String(formData.get('date')),
      time: String(formData.get('time')),
      notes: String(formData.get('notes') ?? '').trim(),
      done: false,
    }
    setCareTasks((current) => [...current, task].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)))
    setCareDialog(false)
    setNotice('Jadwal perawatan berhasil ditambahkan.')
  }

  function toggleTask(taskId: string) {
    setCareTasks((current) => current.map((task) => (task.id === taskId ? { ...task, done: !task.done } : task)))
  }

  function exportAnimals() {
    const escapeCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
    const rows = [
      ['ID', 'Nama Satwa', 'Nama Ilmiah (Latin)', 'Kategori', 'Spesies', 'Jenis Kelamin', 'Usia (tahun)', 'Berat Badan', 'Asal Hewan', 'Tanggal Masuk', 'Habitat', 'Kondisi', 'Status Konservasi', 'Jenis Pakan', 'URL Foto'],
      ...animals.map((animal) => [
        animal.id,
        animal.name,
        animal.scientificName,
        animal.category,
        animal.species,
        animal.gender ?? 'Belum diketahui',
        animal.age,
        animal.weight,
        animal.origin ?? '',
        animal.entryDate ?? '',
        animal.habitat,
        animal.status,
        animal.conservationStatus,
        animal.diet,
        animal.imageUrl ?? '',
      ]),
    ]
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `inventaris-satwa-realistis-${todayISODate}.csv`
    link.click()
    URL.revokeObjectURL(url)
    setNotice('Data inventaris lengkap berhasil diekspor ke CSV.')
  }

  const navItems: { id: View; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Ringkasan', icon: '⌂' },
    { id: 'animals', label: 'Data Satwa', icon: '◉' },
    { id: 'habitats', label: 'Data Kandang', icon: '♧' },
    { id: 'care', label: 'Perawatan', icon: '♡' },
    { id: 'medical', label: 'Rekam Medis', icon: '＋' },
    { id: 'feeding', label: 'Jadwal Pakan', icon: '🥬' },
    { id: 'conservation', label: 'Konservasi', icon: '🌱' },
    { id: 'visitors', label: 'Pengunjung', icon: '♙' },
    { id: 'tickets', label: 'Tiket & QR', icon: '▣' },
    { id: 'staff', label: 'Data Petugas', icon: '♟' },
    { id: 'attendance', label: 'Absensi Petugas', icon: '✓' },
    { id: 'incidents', label: 'Pusat Komando', icon: '🚨' },
    { id: 'roles', label: 'Hak Akses Petugas', icon: '🛡️' },
    { id: 'chatbot', label: 'Asisten API', icon: '✦' },
    { id: 'map', label: 'Peta Lokasi', icon: '⌖' },
    { id: 'reports', label: 'Laporan', icon: '▤' },
  ]

  const viewTitles: Record<View, { eyebrow: string; title: string; description: string }> = {
    dashboard: { eyebrow: 'PUSAT KENDALI', title: 'Selamat pagi, Pengelola 👋', description: 'Pantau kondisi satwa dan aktivitas kebun binatang hari ini.' },
    animals: { eyebrow: 'INVENTARIS SATWA REALISTIS', title: 'Ensiklopedia & Data Satwa', description: 'Koleksi satwa lengkap dengan nama ilmiah, foto HD, taksonomi, dan rekam biologis.' },
    habitats: { eyebrow: 'LINGKUNGAN SATWA', title: 'Habitat & Kandang', description: 'Pantau kapasitas dan jumlah satwa di setiap area konservasi.' },
    care: { eyebrow: 'OPERASIONAL HARIAN', title: 'Jadwal Perawatan', description: 'Atur pakan, pemeriksaan medis, dan kebersihan kandang.' },
    reports: { eyebrow: 'ANALISIS DATA', title: 'Laporan Kebun Binatang', description: 'Ringkasan inventaris dan kesehatan satwa secara keseluruhan.' },
    visitors: { eyebrow: 'LAYANAN PENGUNJUNG', title: 'Data Pengunjung', description: 'Catat kunjungan harian dan reservasi.' },
    tickets: { eyebrow: 'LOKET DIGITAL', title: 'Informasi & Tiket Masuk', description: 'Kelola harga tiket dan QR pemeriksaan masuk.' },
    staff: { eyebrow: 'SUMBER DAYA MANUSIA', title: 'Informasi Petugas', description: 'Kelola data dan jadwal kerja tim kebun binatang.' },
    medical: { eyebrow: 'KESEHATAN SATWA', title: 'Rekam Medis Hewan', description: 'Catat pemeriksaan, penyakit, vaksinasi, dan kontrol.' },
    feeding: { eyebrow: 'OPERASIONAL HARIAN', title: 'Jadwal Pemberian Makanan', description: 'Atur jenis, jumlah, dan jadwal pakan setiap hewan.' },
    conservation: { eyebrow: 'KONSERVASI IUCN', title: 'Perkembangbiakan & Konservasi', description: 'Pantau kelahiran dan status konservasi spesies.' },
    map: { eyebrow: 'PANDUAN AREA', title: 'Peta Lokasi Kebun Binatang', description: 'Temukan kandang dan fasilitas umum.' },
    attendance: { eyebrow: 'KEHADIRAN TIM', title: 'Absensi Petugas', description: 'Catat kehadiran harian petugas kebun binatang.' },
    incidents: { eyebrow: 'KOORDINASI LAPANGAN', title: 'Pusat Komando Insiden', description: 'Pantau dan koordinasikan laporan darurat secara real-time.' },
    roles: { eyebrow: 'KEAMANAN SISTEM', title: 'Hak Akses Petugas', description: 'Atur peran dan akses pengelola sesuai tanggung jawab.' },
    chatbot: { eyebrow: 'ASISTEN INTEGRASI', title: 'Chatbot REST API & AI', description: 'Hubungkan REST API atau gunakan ChatGPT dan Gemini untuk membantu integrasi.' },
  }

  // Isi data form saat preset diklik
  const currentFormData = formPreset || editingAnimal
  const chatbotWebsiteData = {
    animals: animals.map(({ name, scientificName, category, habitat, status, conservationStatus, diet, origin, age, weight, gender, description }) => ({
      name,
      scientificName,
      category,
      habitat,
      status,
      conservationStatus,
      diet,
      origin,
      age,
      weight,
      gender,
      description,
    })),
    habitats: habitats.map(({ name, location, capacity, cleanliness }) => ({ name, location, capacity, cleanliness })),
    careTasks: careTasks.map(({ animalName, type, date, time, notes, done }) => ({ animalName, type, date, time, notes, done })),
  }

  return (
    <div className="zoo-app">
      <aside className="sidebar">
        <a className="zoo-brand" href="#dashboard" onClick={() => setView('dashboard')}>
          <span className="brand-icon">🌿</span>
          <span title="Smart Zoo Management and Animal Information System">
            <strong>Smart Zoo<br /><span>Management</span></strong>
            <small>AND ANIMAL INFORMATION SYSTEM</small>
          </span>
        </a>
        <div className="sidebar-section-label">MENU UTAMA</div>
        <nav className="side-nav" aria-label="Navigasi utama">
          {navItems.map((item) => (
            <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => setView(item.id)}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}
              {item.id === 'care' && pendingTasks > 0 && <span className="nav-count">{pendingTasks}</span>}
              {item.id === 'incidents' && activeIncidentsCount > 0 && (
                <span className="nav-count" style={{ backgroundColor: '#dc2626', color: '#fff' }}>{activeIncidentsCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span>🌱</span>
            <strong>Konservasi Nyata,<br />Lindungi Keanekaragaman.</strong>
            <p>12 spesies realistis terdata dalam sistem suaka satwa.</p>
          </div>
          <div className="profile-row">
            <div className="profile-avatar">👩🏻‍💼</div>
            <div><strong>{role === 'admin' ? 'Admin Kebun Binatang' : 'Petugas Keamanan'}</strong><small>{userEmail}</small></div>
            <span className="profile-more">···</span>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">Smart Zoo <span>/</span> <strong>{navItems.find((item) => item.id === view)?.label}</strong></div>
          <div className="topbar-actions">
            <a
              href="https://canva.link/dc7x6v2djo3gc6l"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 11px',
                background: 'linear-gradient(135deg, #7d2ae8, #00c4cc)',
                color: '#fff',
                borderRadius: '7px',
                fontSize: '10px',
                fontWeight: 800,
                textDecoration: 'none',
                boxShadow: '0 2px 6px rgba(125,42,232,0.25)',
              }}
              title="Buka SMART ZOO PRESENTASI KELOMPOK 6 di Canva"
            >
              <span>📊</span> Slide Canva ↗
            </a>
            <span className="today-date">{todayLabel}</span>
            <button className="notification-button" aria-label="Notifikasi">♧<i /></button>
            <div className="topbar-avatar">👩🏻‍💼</div>
          </div>
        </header>

        <div className="page-content">
          {latestVisitorIncident && view !== 'incidents' && (
            <div style={{ margin: '0 0 16px', padding: '12px 18px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>🚨</span>
                <div>
                  <strong style={{ color: '#991b1b', fontSize: '13px' }}>Laporan Darurat Baru dari Pengunjung!</strong>
                  <p style={{ margin: '2px 0 0', color: '#b91c1c', fontSize: '12px' }}>
                    <strong>Pelapor:</strong> {latestVisitorIncident.reporter} · <strong>Kejadian:</strong> {latestVisitorIncident.title} (Lokasi: {latestVisitorIncident.location})
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setView('incidents')} style={{ padding: '7px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}>
                Buka Pusat Komando →
              </button>
            </div>
          )}

          {notice && (
            <div className="toast" role="status">
              <span>✓</span>{notice}
              <button onClick={() => setNotice('')} aria-label="Tutup pesan">×</button>
            </div>
          )}

          {habitatDialog && (
            <div
              className="modal-backdrop"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setHabitatDialog(false)
                  setEditingHabitat(null)
                }
              }}
            >
              <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="habitat-dialog-title">
                <div className="modal-heading">
                  <div>
                    <p className="eyebrow">DATA KANDANG</p>
                    <h2 id="habitat-dialog-title">{editingHabitat ? 'Edit kandang' : 'Tambah kandang'}</h2>
                  </div>
                  <button className="modal-close" onClick={() => { setHabitatDialog(false); setEditingHabitat(null) }} aria-label="Tutup">×</button>
                </div>
                <p className="modal-description">Lengkapi lokasi, kapasitas, dan status kebersihan kandang.</p>
                <form className="modal-form" onSubmit={saveHabitat}>
                  <label>Nama kandang<input name="name" required maxLength={60} defaultValue={editingHabitat?.name ?? ''} placeholder="Contoh: Zona Reptil" /></label>
                  <label>Lokasi kandang<input name="location" required maxLength={100} defaultValue={editingHabitat?.location ?? ''} placeholder="Contoh: Zona Timur · dekat klinik" /></label>
                  <div className="form-two-col">
                    <label>Kapasitas satwa<input name="capacity" type="number" min="1" required defaultValue={editingHabitat?.capacity ?? 10} /></label>
                    <label>Status kebersihan<select name="cleanliness" defaultValue={editingHabitat?.cleanliness ?? 'Bersih'}><option>Bersih</option><option>Perlu dibersihkan</option></select></label>
                  </div>
                  <div className="modal-actions">
                    <button type="button" className="button-secondary" onClick={() => { setHabitatDialog(false); setEditingHabitat(null) }}>Batal</button>
                    <button type="submit" className="button-primary">Simpan kandang</button>
                  </div>
                </form>
              </section>
            </div>
          )}

          {!['visitors', 'tickets', 'staff', 'medical', 'feeding', 'conservation', 'map', 'attendance'].includes(view) && (
            <section className="page-heading">
              <div>
                <p className="eyebrow">{viewTitles[view].eyebrow}</p>
                <h1>{viewTitles[view].title}</h1>
                <p>{viewTitles[view].description}</p>
              </div>
              <div className="heading-actions">
                {view === 'animals' && <button className="button-primary" onClick={openAddAnimal}><span>＋</span> Tambah Satwa Realistis</button>}
                {view === 'habitats' && <button className="button-primary" onClick={() => { setEditingHabitat(null); setHabitatDialog(true) }}><span>＋</span> Tambah Kandang</button>}
                {view === 'care' && <button className="button-primary" onClick={() => { setSelectedCareAnimalId(animals[0]?.id || ''); setCareDialog(true) }}><span>＋</span> Buat Jadwal</button>}
                {view === 'dashboard' && <button className="button-primary" onClick={openAddAnimal}><span>＋</span> Tambah Satwa</button>}
              </div>
            </section>
          )}

          {view === 'dashboard' && (
            <>
              <section className="hero-banner">
                <div className="hero-copy">
                  <span className="hero-tag">🌎 SUAKA KONSERVASI DIGITAL SATWA</span>
                  <h2>Pusat Konservasi<br />& Edukasi Satwa Realistis.</h2>
                  <p>Mendata 12 spesies satwa nyata dengan dokumentasi fotografi resolusi tinggi, status konservasi IUCN, dan jadwal perawatan terpadu.</p>
                  <button onClick={() => setView('animals')}>Buka Ensiklopedia Satwa <span>→</span></button>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <span className="sun" />
                  <span className="hill hill-back" />
                  <span className="hill hill-front" />
                  <span className="hero-animal">🐅</span>
                  <span className="hero-bird">🦜</span>
                </div>
                <div className="hero-decoration">✳</div>
              </section>

              <section className="improvements-section" aria-labelledby="improvements-title">
                <div className="improvements-heading">
                  <div><p className="eyebrow">PENINGKATAN SISTEM</p><h2 id="improvements-title">Dari kendala operasional ke solusi digital</h2></div>
                  <span>3 FITUR UTAMA</span>
                </div>
                <div className="improvements-grid">
                  <article className="improvement-card">
                    <span className="improvement-icon role-icon">🛡️</span><p className="improvement-label">01 · HAK AKSES</p>
                    <h3>Peran Admin & Keamanan</h3><p>Admin mengelola seluruh data dan akun. Petugas Keamanan mendapat ruang kerja lapangan terbatas.</p>
                    <button type="button" onClick={() => setView('roles')}>Atur hak akses <span>→</span></button>
                  </article>
                  <article className="improvement-card">
                    <span className="improvement-icon content-icon">✍️</span><p className="improvement-label">02 · INPUT TERBANTU</p>
                    <h3>Draf deskripsi otomatis</h3><p>Isi deskripsi awal dari nama, habitat, pakan, dan status satwa; Admin tetap dapat meninjau dan mengedit.</p>
                    <button type="button" onClick={openAddAnimal}>Coba input satwa <span>→</span></button>
                  </article>
                  <article className="improvement-card">
                    <span className="improvement-icon incident-icon">🚨</span><p className="improvement-label">03 · KOORDINASI LIVE</p>
                    <h3>Pusat Komando Insiden</h3><p>Laporan darurat tersimpan di Firestore dan pembaruan status tampil real-time pada perangkat yang terhubung.</p>
                    <button type="button" onClick={() => setView('incidents')}>Buka pusat komando <span>→</span></button>
                  </article>
                </div>
              </section>

              <section className="stats-grid" aria-label="Statistik kebun binatang">
                <article className="stat-card">
                  <div className="stat-icon stat-icon-green">🐾</div>
                  <span className="stat-label">Total satwa</span>
                  <strong>{animals.length}</strong>
                  <span className="stat-foot">Satwa terverifikasi aktif</span>
                  <span className="stat-trend">↗ Realistis & lengkap</span>
                </article>
                <article className="stat-card">
                  <div className="stat-icon stat-icon-blue">♧</div>
                  <span className="stat-label">Spesies terdata</span>
                  <strong>{speciesCount}</strong>
                  <span className="stat-foot">Mamalia, Reptil & Aves</span>
                  <span className="stat-trend trend-blue">● Taksonomi ilmiah</span>
                </article>
                <article className="stat-card">
                  <div className="stat-icon stat-icon-amber">♙</div>
                  <span className="stat-label">Pengunjung hari ini</span>
                  <strong>{visitorCountToday}</strong>
                  <span className="stat-foot">Orang tercatat berkunjung</span>
                  <span className="stat-trend trend-amber">Data reservasi</span>
                </article>
                <article className="stat-card">
                  <div className="stat-icon stat-icon-purple">♧</div>
                  <span className="stat-label">Kandang aktif</span>
                  <strong>{habitatNames.length}</strong>
                  <span className="stat-foot">Zona habitat terpantau</span>
                  <span className="stat-trend trend-purple">Area terjaga</span>
                </article>
                <article className="stat-card">
                  <div className="stat-icon stat-icon-amber">＋</div>
                  <span className="stat-label">Hewan perlu perhatian</span>
                  <strong>{sickCount}</strong>
                  <span className="stat-foot">Dalam perawatan / karantina</span>
                  <span className="stat-trend trend-amber">Pantau intensif</span>
                </article>
                <article className="stat-card">
                  <div className="stat-icon stat-icon-green">🌱</div>
                  <span className="stat-label">Pendapatan tiket</span>
                  <strong className="stat-money">{new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(revenueTotal)}</strong>
                  <span className="stat-foot">Akumulasi tiket digital</span>
                  <span className="stat-trend">Dari transaksi masuk</span>
                </article>
                <article className="stat-card">
                  <div className="stat-icon stat-icon-purple">🐅</div>
                  <span className="stat-label">Spesies terancam (IUCN)</span>
                  <strong>{endangeredCount}</strong>
                  <span className="stat-foot">Status Kritis & Terancam</span>
                  <span className="stat-trend trend-purple">Prioritas konservasi</span>
                </article>
              </section>

              <section className="visitor-chart panel">
                <div className="panel-title-row">
                  <div>
                    <p className="eyebrow">ANALITIK PENGUNJUNG</p>
                    <h2>Tren kunjungan 6 bulan</h2>
                  </div>
                  <span className="report-period">Total {monthlyVisitorStats.reduce((sum, month) => sum + month.count, 0)} orang</span>
                </div>
                <div className="visitor-bars" role="img" aria-label="Grafik jumlah pengunjung per bulan">
                  {monthlyVisitorStats.map((month) => (
                    <div className="visitor-bar-column" key={month.label}>
                      <strong>{month.count}</strong>
                      <div className="visitor-bar-track">
                        <span style={{ height: `${Math.max(4, (month.count / maxMonthlyVisitors) * 100)}%` }} />
                      </div>
                      <small>{month.label}</small>
                    </div>
                  ))}
                </div>
              </section>

              <div className="dashboard-grid">
                <section className="panel recent-panel">
                  <div className="panel-title-row">
                    <div>
                      <p className="eyebrow">INVENTARIS SATWA</p>
                      <h2>Satwa Unggulan Kebun Binatang</h2>
                    </div>
                    <button className="text-button" onClick={() => setView('animals')}>Lihat semua ({animals.length}) <span>→</span></button>
                  </div>
                  <div className="featured-list">
                    {animals.slice(0, 4).map((animal) => (
                      <AnimalRow key={animal.id} animal={animal} onClick={() => setSelectedAnimal(animal)} />
                    ))}
                  </div>
                </section>

                <section className="panel schedule-panel">
                  <div className="panel-title-row">
                    <div>
                      <p className="eyebrow">AGENDA HARI INI</p>
                      <h2>Jadwal perawatan</h2>
                    </div>
                    <button className="icon-plus" onClick={() => { setSelectedCareAnimalId(animals[0]?.id || ''); setCareDialog(true) }} aria-label="Tambah jadwal">＋</button>
                  </div>
                  <div className="mini-schedule">
                    {todayTasks.slice(0, 4).map((task) => (
                      <div className={`mini-task ${task.done ? 'task-done' : ''}`} key={task.id}>
                        <span className="task-time">{task.time}</span>
                        <span className="timeline-dot" />
                        <div>
                          <strong>{task.type}</strong>
                          <p>{task.animalName}</p>
                        </div>
                        <span className="task-check">{task.done ? '✓' : '·'}</span>
                      </div>
                    ))}
                    {todayTasks.length === 0 && <p className="schedule-empty">Belum ada jadwal untuk hari ini.</p>}
                  </div>
                  <button className="schedule-link" onClick={() => setView('care')}>Buka semua jadwal <span>→</span></button>
                </section>
              </div>

              <section className="habitat-strip">
                <div>
                  <span className="strip-icon">🌳</span>
                  <div>
                    <strong>Habitat alami terjaga, satwa sehat terlindungi</strong>
                    <p>{habitatNames.length} area habitat aktif dipantau oleh tim dokter hewan dan perawat satwa setiap hari.</p>
                  </div>
                </div>
                <button onClick={() => setView('habitats')}>Kelola habitat <span>→</span></button>
              </section>

              <section className="home-news-section" aria-labelledby="home-news-title">
                <div className="home-news-heading">
                  <div>
                    <p className="eyebrow">KABAR & EDUKASI KONSERVASI</p>
                    <h2 id="home-news-title">Cerita satwa yang perlu kita jaga</h2>
                    <p>Kenali tantangan konservasi spesies yang ada di koleksi Taman Satwa Nusantara.</p>
                  </div>
                  <span className="news-heading-icon">✳</span>
                </div>
                <div className="home-news-grid">
                  <article className="home-news-card">
                    <a className="home-news-image" href="https://www.worldwildlife.org/species/tiger" target="_blank" rel="noreferrer" aria-label="Baca tentang konservasi harimau di WWF">
                      <img src="https://images.unsplash.com/photo-1561731216-c3a4d99437d5?w=800&auto=format&fit=crop&q=85" alt="Harimau di habitat hutan" loading="lazy" />
                      <span className="news-category">KONSERVASI</span>
                    </a>
                    <div className="home-news-copy">
                      <span className="news-meta">🐅 · HARIMAU SUMATERA</span>
                      <h3>Koridor hutan penting bagi ruang jelajah harimau</h3>
                      <p>Hutan yang tersambung membantu satwa liar bergerak, mencari pakan, dan menjaga populasi tetap sehat.</p>
                      <a className="news-read-link" href="https://www.worldwildlife.org/species/tiger" target="_blank" rel="noreferrer">Baca info konservasi <span>↗</span></a>
                    </div>
                  </article>
                  <article className="home-news-card">
                    <a className="home-news-image" href="https://www.worldwildlife.org/species/orangutan" target="_blank" rel="noreferrer" aria-label="Baca tentang konservasi orangutan di WWF">
                      <img src="https://images.unsplash.com/photo-1540573133985-87b6da6d54a9?w=800&auto=format&fit=crop&q=85" alt="Orangutan di antara pepohonan" loading="lazy" />
                      <span className="news-category news-category-green">EDUKASI SATWA</span>
                    </a>
                    <div className="home-news-copy">
                      <span className="news-meta">🦧 · ORANGUTAN KALIMANTAN</span>
                      <h3>Hutan adalah rumah sekaligus sumber pakan orangutan</h3>
                      <p>Perlindungan habitat membantu orangutan menemukan buah dan tempat aman untuk membesarkan anak.</p>
                      <a className="news-read-link" href="https://www.worldwildlife.org/species/orangutan" target="_blank" rel="noreferrer">Baca info konservasi <span>↗</span></a>
                    </div>
                  </article>
                  <article className="home-news-card">
                    <a className="home-news-image" href="https://www.worldwildlife.org/species/crocodile" target="_blank" rel="noreferrer" aria-label="Baca tentang konservasi buaya di WWF">
                      <img src="https://images.unsplash.com/photo-1522069169874-c58ec4b76be5?w=800&auto=format&fit=crop&q=85" alt="Buaya berjemur di tepi perairan" loading="lazy" />
                      <span className="news-category news-category-amber">FAKTA SPESIES</span>
                    </a>
                    <div className="home-news-copy">
                      <span className="news-meta">🐊 · BUAYA MUARA</span>
                      <h3>Buaya muara, penjaga keseimbangan ekosistem perairan</h3>
                      <p>Sebagai predator puncak, buaya muara membantu menjaga keseimbangan rantai makanan di sungai, rawa, dan kawasan pesisir.</p>
                      <a className="news-read-link" href="https://www.worldwildlife.org/species/crocodile" target="_blank" rel="noreferrer">Baca info konservasi <span>↗</span></a>
                    </div>
                  </article>
                </div>
                <p className="news-source-note">Materi ringkas untuk edukasi; tautan membuka informasi dari organisasi konservasi.</p>
              </section>
            </>
          )}

          {view === 'animals' && (
            <section className="panel data-panel">
              {/* Category Filter Chips */}
              <div className="category-chips">
                <span className="chips-label">Kategori:</span>
                {(['Semua Kategori', 'Mamalia', 'Reptil', 'Aves'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`category-chip ${categoryFilter === cat ? 'active' : ''}`}
                    onClick={() => setCategoryFilter(cat)}
                  >
                    {cat}
                  </button>
                ))}
                <span className="chips-divider">|</span>
                <span className="chips-label">Konservasi:</span>
                {(['Semua Konservasi', 'Kritis', 'Terancam punah', 'Rentan', 'Risiko Rendah'] as const).map((stat) => (
                  <button
                    key={stat}
                    type="button"
                    className={`category-chip ${conservationFilter === stat ? 'active' : ''}`}
                    onClick={() => setConservationFilter(stat)}
                  >
                    {stat}
                  </button>
                ))}
              </div>

              <div className="data-toolbar">
                <div className="toolbar-caption">
                  <strong>{filteredAnimals.length} satwa</strong>
                  <span>·</span>
                  <span>Menampilkan dari total {animals.length} data inventaris satwa</span>
                </div>
                <div className="filters">
                  <label className="search-control">
                    <span>⌕</span>
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Cari nama, nama latin, habitat..."
                      aria-label="Cari satwa"
                    />
                  </label>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter kondisi">
                    <option>Semua status</option>
                    <option>Sehat</option>
                    <option>Dalam Perawatan</option>
                    <option>Karantina</option>
                  </select>
                  <button className="button-secondary export-button" onClick={exportAnimals}>↓ Ekspor CSV</button>
                </div>
              </div>

              <div className="animal-grid">
                {filteredAnimals.map((animal) => (
                  <AnimalCard
                    key={animal.id}
                    animal={animal}
                    onViewDetail={() => setSelectedAnimal(animal)}
                    onEdit={() => {
                      setEditingAnimal(animal)
                      setFormPreset(null)
                      setAnimalDialog(true)
                    }}
                    onDelete={() => deleteAnimal(animal)}
                    onPlaySound={() => handlePlaySound(animal)}
                    isPlayingSound={soundPlaying === animal.id}
                  />
                ))}
              </div>

              {filteredAnimals.length === 0 && (
                <div className="empty-state">
                  <span>🔎</span>
                  <h3>Satwa tidak ditemukan</h3>
                  <p>Ubah kata kunci atau reset filter untuk melihat koleksi satwa lainnya.</p>
                  <button
                    className="button-secondary"
                    style={{ marginTop: 12 }}
                    onClick={() => {
                      setSearch('')
                      setStatusFilter('Semua status')
                      setCategoryFilter('Semua Kategori')
                      setConservationFilter('Semua Konservasi')
                    }}
                  >
                    Reset Semua Filter
                  </button>
                </div>
              )}
            </section>
          )}

          {view === 'habitats' && (
            <section className="habitat-grid">
              {habitats.map((habitat, index) => {
                const residents = animals.filter((animal) => animal.habitat === habitat.name)
                const percentage = Math.min(100, Math.round((residents.length / habitat.capacity) * 100))
                const art = ['🌾', '🌴', '💧', '🌿', '🌺'][index % 5]
                return (
                  <article className="habitat-card" key={habitat.id}>
                    <div className={`habitat-cover cover-${index % 5}`}>
                      <span>{art}</span>
                      <small>AREA {String(index + 1).padStart(2, '0')}</small>
                      <div className="habitat-card-actions">
                        <button onClick={() => { setEditingHabitat(habitat); setHabitatDialog(true) }} aria-label={`Edit kandang ${habitat.name}`}>✎</button>
                        <button onClick={() => deleteHabitat(habitat)} aria-label={`Hapus kandang ${habitat.name}`}>×</button>
                      </div>
                    </div>
                    <div className="habitat-info">
                      <div className="habitat-name-row">
                        <div>
                          <p>KANDANG / HABITAT</p>
                          <h2>{habitat.name}</h2>
                        </div>
                        <span className={`habitat-status ${habitat.cleanliness === 'Perlu dibersihkan' ? 'habitat-dirty' : ''}`}>
                          <i /> {habitat.cleanliness}
                        </span>
                      </div>
                      <p className="habitat-location">⌖ {habitat.location}</p>
                      <div className="occupancy-row">
                        <span>Kapasitas terisi</span>
                        <strong>{residents.length} <small>/ {habitat.capacity} satwa</small></strong>
                      </div>
                      <div className="progress-track">
                        <span style={{ width: `${percentage}%` }} />
                      </div>
                      <div className="habitat-residents">
                        {residents.length ? (
                          residents.map((animal) => (
                            <img
                              key={animal.id}
                              src={animal.imageUrl}
                              alt={animal.name}
                              className="habitat-resident-thumb"
                              title={`${animal.name} (${animal.scientificName})`}
                              onClick={() => setSelectedAnimal(animal)}
                              onError={(e) => {
                                e.currentTarget.src = 'https://images.unsplash.com/photo-1534188753412-3e26d0d618d6?w=200'
                              }}
                            />
                          ))
                        ) : (
                          <span className="no-residents">Belum ada satwa di area ini</span>
                        )}
                        <span className="resident-count">{residents.length} satwa</span>
                      </div>
                      <div className="habitat-resident-names">
                        {residents.map((animal) => animal.name).join(' · ') || 'Lokasi satwa belum ditentukan'}
                      </div>
                    </div>
                  </article>
                )
              })}
            </section>
          )}

          {view === 'care' && (
            <section className="panel care-panel">
              <div className="care-summary">
                <div>
                  <span className="care-summary-icon">◷</span>
                  <div>
                    <strong>{pendingTasks} tugas perawatan</strong>
                    <p>menunggu diselesaikan hari ini untuk menjaga kesehatan satwa</p>
                  </div>
                </div>
                <span className="care-date">{todayLabel}</span>
              </div>
              <div className="care-table-head">
                <span>WAKTU</span>
                <span>JENIS PERAWATAN</span>
                <span>SATWA</span>
                <span>CATATAN</span>
                <span>STATUS</span>
              </div>
              {careTasks.length ? (
                careTasks.map((task) => (
                  <div className={`care-row ${task.done ? 'completed-row' : ''}`} key={task.id}>
                    <strong className="care-time-cell">
                      {task.time}
                      <small>{new Date(`${task.date}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</small>
                    </strong>
                    <span className="care-type">
                      <i className={task.type === 'Pemberian pakan' ? 'type-feed' : task.type === 'Pemeriksaan medis' ? 'type-medical' : 'type-clean'}>
                        {task.type === 'Pemberian pakan' ? '♧' : task.type === 'Pemeriksaan medis' ? '＋' : '✧'}
                      </i>
                      {task.type}
                    </span>
                    <span className="care-animal">{task.animalName}</span>
                    <span className="care-notes">{task.notes || '—'}</span>
                    <button className={`task-status ${task.done ? 'done' : ''}`} onClick={() => toggleTask(task.id)}>
                      {task.done ? '✓ Selesai' : 'Tandai selesai'}
                    </button>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <span>🗓️</span>
                  <h3>Belum ada jadwal</h3>
                  <p>Buat jadwal perawatan agar tim dapat memantau kebutuhan pakan dan medis satwa.</p>
                </div>
              )}
            </section>
          )}

          {view === 'reports' && (
            <div className="reports-layout">
              <section className="panel report-panel">
                <div className="panel-title-row">
                  <div>
                    <p className="eyebrow">KESEHATAN SATWA</p>
                    <h2>Ringkasan Kondisi Satwa</h2>
                  </div>
                  <span className="report-period">Data Real-time</span>
                </div>
                <div className="health-summary">
                  <div className="health-donut" style={{ '--health-percent': `${animals.length ? (healthyCount / animals.length) * 100 : 0}%` } as React.CSSProperties}>
                    <div>
                      <strong>{animals.length ? Math.round((healthyCount / animals.length) * 100) : 0}%</strong>
                      <span>Sehat</span>
                    </div>
                  </div>
                  <div className="health-legend">
                    <div>
                      <i className="legend-healthy" />
                      <span>Sehat</span>
                      <strong>{healthyCount} satwa</strong>
                    </div>
                    <div>
                      <i className="legend-care" />
                      <span>Dalam perawatan</span>
                      <strong>{animals.filter((animal) => animal.status === 'Dalam Perawatan').length} satwa</strong>
                    </div>
                    <div>
                      <i className="legend-quarantine" />
                      <span>Karantina</span>
                      <strong>{animals.filter((animal) => animal.status === 'Karantina').length} satwa</strong>
                    </div>
                  </div>
                </div>
              </section>

              <section className="panel report-panel species-panel">
                <div className="panel-title-row">
                  <div>
                    <p className="eyebrow">KEANEKARAGAMAN HAYATI</p>
                    <h2>Komposisi Kategori & Spesies</h2>
                  </div>
                  <span className="report-period">{speciesCount} Spesies</span>
                </div>
                <div className="species-list">
                  {(['Mamalia', 'Reptil', 'Aves'] as const).map((cat) => {
                    const count = animals.filter((animal) => animal.category === cat).length
                    return (
                      <div className="species-row" key={cat}>
                        <span className="species-emoji">{cat === 'Mamalia' ? '🦁' : cat === 'Reptil' ? '🐊' : '🦜'}</span>
                        <span><strong>{cat}</strong> <small>({animals.filter((a) => a.category === cat).map((a) => a.name).slice(0, 2).join(', ')}...)</small></span>
                        <strong>{count} <small>ekor</small></strong>
                        <div className="species-bar">
                          <i style={{ width: `${Math.max(14, (count / Math.max(1, animals.length)) * 100)}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="report-note">
                <span>💡</span>
                <p>
                  <strong>Standar Konservasi Satwa Internasional</strong><br />
                  Data mencatat nama ilmiah, bobot, pola nutrisi, dan status kepunahan IUCN untuk setiap satwa guna memenuhi standar pengelolaan fauna modern.
                </p>
              </section>
            </div>
          )}

          {view === 'chatbot' && <Chatbot websiteData={chatbotWebsiteData} />}

          {['visitors', 'tickets', 'staff', 'medical', 'feeding', 'conservation', 'map', 'attendance', 'reports', 'incidents', 'roles'].includes(view) && (
            <ZooModules
              view={view}
              role="admin"
              currentUserEmail={userEmail}
              animals={animals.map(({ name, scientificName, category, species, habitat, age, weight, gender, origin, entryDate, status, conservationStatus, imageUrl }) => ({
                name,
                scientificName,
                category,
                species,
                habitat,
                age,
                weight,
                gender,
                origin,
                entryDate,
                status,
                conservationStatus,
                imageUrl,
              }))}
            />
          )}

          <footer className="app-footer">
            <span>© 2025 Smart Zoo Management and Animal Information System — Final Project</span>
            <span>Ensiklopedia Konservasi dan Manajemen Satwa Terpadu <b>♥</b></span>
          </footer>
        </div>
        {view !== 'chatbot' && <div className="floating-chatbot">
          {floatingChatOpen && <section className="floating-chatbot-window" aria-label="Chatbot pencarian website">
            <div className="floating-chatbot-titlebar"><span><i /> Asisten Smart Zoo</span><button type="button" onClick={() => setFloatingChatOpen(false)} aria-label="Tutup chatbot">×</button></div>
            <Chatbot websiteData={chatbotWebsiteData} compact />
          </section>}
          <button className={`floating-chatbot-button ${floatingChatOpen ? 'is-open' : ''}`} type="button" onClick={() => setFloatingChatOpen((open) => !open)} aria-expanded={floatingChatOpen} aria-label={floatingChatOpen ? 'Tutup asisten chatbot' : 'Buka asisten chatbot'}>
            <span aria-hidden="true">{floatingChatOpen ? '×' : '✦'}</span><small>{floatingChatOpen ? 'Tutup' : 'Tanya AI'}</small>
          </button>
        </div>}
      </main>

      {/* POP-UP DETAIL SATWA LENGKAP & REALISTIS */}
      {selectedAnimal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedAnimal(null)
          }}
        >
          <section className="modal-card detail-modal-card" role="dialog" aria-modal="true" aria-labelledby="animal-detail-title">
            <div className="detail-modal-banner">
              <img
                src={selectedAnimal.imageUrl}
                alt={selectedAnimal.name}
                className="detail-modal-img"
                onError={(e) => {
                  e.currentTarget.src = 'https://images.unsplash.com/photo-1534188753412-3e26d0d618d6?w=800'
                }}
              />
              <div className="detail-banner-overlay">
                <div className="detail-banner-top">
                  <span className={`conservation-pill pill-${selectedAnimal.conservationStatus.toLowerCase().replace(/\s+/g, '-')}`}>
                    IUCN: {selectedAnimal.conservationStatus}
                  </span>
                  <button className="detail-close-btn" onClick={() => setSelectedAnimal(null)} aria-label="Tutup">×</button>
                </div>
                <div className="detail-banner-bottom">
                  <button className="detail-sound-btn" onClick={() => handlePlaySound(selectedAnimal)}>
                    {soundPlaying === selectedAnimal.id ? '🔊 Memutar suara...' : '🔊 Putar Suara Alami Satwa'}
                  </button>
                  <StatusBadge status={selectedAnimal.status} />
                </div>
              </div>
            </div>

            <div className="detail-modal-content">
              <div className="detail-title-block">
                <div>
                  <h2 id="animal-detail-title">{selectedAnimal.name}</h2>
                  <p className="detail-latin-name"><em>{selectedAnimal.scientificName}</em></p>
                </div>
                <span className="detail-category-badge">{selectedAnimal.category}</span>
              </div>

              {selectedAnimal.description && (
                <div className="detail-description-box">
                  <p>{selectedAnimal.description}</p>
                </div>
              )}

              <div className="detail-specs-grid">
                <div className="detail-spec-card">
                  <span>📅 Usia</span>
                  <strong>{selectedAnimal.age} Tahun</strong>
                </div>
                <div className="detail-spec-card">
                  <span>⚖️ Bobot Satwa</span>
                  <strong>{selectedAnimal.weight || '—'}</strong>
                </div>
                <div className="detail-spec-card">
                  <span>⚥ Jenis Kelamin</span>
                  <strong>{selectedAnimal.gender || 'Belum diketahui'}</strong>
                </div>
                <div className="detail-spec-card">
                  <span>🏡 Habitat / Kandang</span>
                  <strong>{selectedAnimal.habitat}</strong>
                </div>
              </div>

              <div className="detail-info-list">
                <div className="detail-info-row">
                  <strong>🥬 Diet & Pola Nutrisi</strong>
                  <span>{selectedAnimal.diet}</span>
                </div>
                <div className="detail-info-row">
                  <strong>📍 Asal Wilayah Konservasi</strong>
                  <span>{selectedAnimal.origin || 'Kawasan Konservasi Nasional'}</span>
                </div>
                <div className="detail-info-row">
                  <strong>🗓️ Tanggal Registrasi Masuk</strong>
                  <span>{selectedAnimal.entryDate || 'Terdaftar di basis data'}</span>
                </div>
              </div>

              {/* Status jadwal perawatan satwa ini */}
              <div className="detail-care-preview">
                <div className="detail-care-header">
                  <strong>Agenda Perawatan Hari Ini</strong>
                  <span className="detail-care-badge">
                    {careTasks.filter((t) => t.animalId === selectedAnimal.id && t.date === todayISODate).length} Tugas
                  </span>
                </div>
                <div className="detail-care-items">
                  {careTasks.filter((t) => t.animalId === selectedAnimal.id && t.date === todayISODate).map((task) => (
                    <div key={task.id} className="detail-care-item">
                      <span>{task.time} · {task.type}</span>
                      <small>{task.notes || 'Rutin harian'}</small>
                      <button
                        className={`mini-status-btn ${task.done ? 'done' : ''}`}
                        onClick={() => toggleTask(task.id)}
                      >
                        {task.done ? '✓ Selesai' : 'Tandai'}
                      </button>
                    </div>
                  ))}
                  {careTasks.filter((t) => t.animalId === selectedAnimal.id && t.date === todayISODate).length === 0 && (
                    <p className="detail-no-tasks">Tidak ada agenda perawatan tertunda hari ini.</p>
                  )}
                </div>
              </div>

              <div className="detail-actions">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    setSelectedCareAnimalId(selectedAnimal.id)
                    setCareDialog(true)
                  }}
                >
                  🗓️ Buat Jadwal Perawatan
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    setEditingAnimal(selectedAnimal)
                    setFormPreset(null)
                    setSelectedAnimal(null)
                    setAnimalDialog(true)
                  }}
                >
                  ✎ Edit Satwa
                </button>
                <button type="button" className="button-primary" onClick={() => setSelectedAnimal(null)}>
                  Tutup
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* FORMULIR TAMBAH / EDIT SATWA DENGAN TEMPLATE SATWA REALISTIS */}
      {animalDialog && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setAnimalDialog(false)
              setEditingAnimal(null)
              setFormPreset(null)
            }
          }}
        >
          <section className="modal-card modal-card-wide" role="dialog" aria-modal="true" aria-labelledby="animal-dialog-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">INVENTARIS SATWA REALISTIS</p>
                <h2 id="animal-dialog-title">{editingAnimal ? 'Edit data satwa' : 'Tambah satwa baru'}</h2>
              </div>
              <button
                className="modal-close"
                onClick={() => {
                  setAnimalDialog(false)
                  setEditingAnimal(null)
                  setFormPreset(null)
                }}
                aria-label="Tutup"
              >
                ×
              </button>
            </div>
            <p className="modal-description">
              Lengkapi nama ilmiah, foto satwa resolusi tinggi, status konservasi IUCN, dan panduan perawatan satwa.
            </p>

            {/* Quick Template Selector */}
            {!editingAnimal && (
              <div className="preset-selector-box">
                <div className="preset-label">
                  <span>⚡ PILIH CONTOH SATWA REALISTIS (OTOMATIS ISI):</span>
                </div>
                <div className="preset-chips">
                  {realisticPresets.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      className="preset-chip-btn"
                      onClick={() => setFormPreset(preset)}
                      title={`Pilih ${preset.name} (${preset.scientificName})`}
                    >
                      <img src={preset.imageUrl} alt={preset.name} className="preset-thumb" />
                      <span>{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form className="modal-form" onSubmit={saveAnimal} key={currentFormData?.name ?? 'new-form'}>
              <div className="form-two-col">
                <label>
                  Nama satwa umum
                  <input
                    name="name"
                    required
                    maxLength={60}
                    defaultValue={currentFormData?.name ?? ''}
                    placeholder="Contoh: Harimau Sumatera"
                  />
                </label>
                <label>
                  Nama ilmiah / Latin
                  <input
                    name="scientificName"
                    required
                    maxLength={80}
                    defaultValue={currentFormData?.scientificName ?? ''}
                    placeholder="Contoh: Panthera tigris sumatrae"
                  />
                </label>
              </div>

              <div className="form-three-col">
                <label>
                  Kategori
                  <select name="category" defaultValue={currentFormData?.category ?? 'Mamalia'}>
                    <option>Mamalia</option>
                    <option>Reptil</option>
                    <option>Aves</option>
                    <option>Amfibi</option>
                    <option>Pisces</option>
                  </select>
                </label>
                <label>
                  Spesies
                  <input
                    name="species"
                    required
                    maxLength={60}
                    defaultValue={currentFormData?.species ?? ''}
                    placeholder="Contoh: Harimau"
                  />
                </label>
                <label>
                  Habitat / Kandang
                  <select name="habitat" defaultValue={currentFormData?.habitat ?? habitatNames[0]} required>
                    {habitatNames.map((habitat) => (
                      <option key={habitat}>{habitat}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                URL Foto Satwa (HD)
                <input
                  name="imageUrl"
                  type="url"
                  required
                  defaultValue={currentFormData?.imageUrl ?? 'https://images.unsplash.com/photo-1534188753412-3e26d0d618d6?w=800&auto=format&fit=crop&q=80'}
                  placeholder="https://images.unsplash.com/photo-..."
                />
              </label>

              {currentFormData?.imageUrl && (
                <div className="form-photo-preview">
                  <img src={currentFormData.imageUrl} alt="Pratinjau foto" />
                  <small>✓ Pratinjau foto satwa realistis</small>
                </div>
              )}

              <div className="form-three-col">
                <label>
                  Usia (tahun)
                  <input name="age" type="number" required min="0" max="150" defaultValue={currentFormData?.age ?? 5} />
                </label>
                <label>
                  Bobot satwa
                  <input name="weight" maxLength={30} defaultValue={currentFormData?.weight ?? '120 kg'} placeholder="Contoh: 120 kg" />
                </label>
                <label>
                  Jenis kelamin
                  <select name="gender" defaultValue={currentFormData?.gender ?? 'Jantan'}>
                    <option>Jantan</option>
                    <option>Betina</option>
                    <option>Belum diketahui</option>
                  </select>
                </label>
              </div>

              <div className="form-two-col">
                <label>
                  Status kesehatan
                  <select name="status" defaultValue={currentFormData?.status ?? 'Sehat'}>
                    <option>Sehat</option>
                    <option>Dalam Perawatan</option>
                    <option>Karantina</option>
                  </select>
                </label>
                <label>
                  Status Konservasi IUCN
                  <select name="conservationStatus" defaultValue={currentFormData?.conservationStatus ?? 'Kritis'}>
                    <option>Kritis</option>
                    <option>Terancam punah</option>
                    <option>Rentan</option>
                    <option>Risiko Rendah</option>
                  </select>
                </label>
              </div>

              <div className="form-two-col">
                <label>
                  Asal hewan / wilayah
                  <input
                    name="origin"
                    required
                    maxLength={100}
                    defaultValue={currentFormData?.origin ?? 'Taman Nasional Kerinci Seblat, Sumatera'}
                    placeholder="Contoh: Hutan Lindung Sumatera"
                  />
                </label>
                <label>
                  Tanggal masuk
                  <input name="entryDate" type="date" required defaultValue={currentFormData?.entryDate ?? todayISODate} />
                </label>
              </div>

              <div className="form-two-col">
                <label>
                  Pola pakan & nutrisi
                  <input
                    name="diet"
                    required
                    maxLength={80}
                    defaultValue={currentFormData?.diet ?? 'Daging sapi segar (6 kg/hari)'}
                    placeholder="Contoh: Daging sapi segar (6 kg/hari)"
                  />
                </label>
                <label>
                  Simulator suara satwa
                  <select name="soundType" defaultValue={currentFormData?.soundType ?? 'roar'}>
                    <option value="roar">Auman (Karnivora / Kucing Besar)</option>
                    <option value="trumpet">Trompet Belalai (Gajah)</option>
                    <option value="chirp">Kicauan Melodis (Aves / Burung)</option>
                    <option value="hiss">Desisan (Reptil / Ular / Kadal)</option>
                    <option value="bark">Panggilan Kera (Primata)</option>
                    <option value="growl">Geraman Berat (Beruang / Herbivora)</option>
                  </select>
                </label>
              </div>

              <label>
                Deskripsi biologis & perilaku satwa
                <button className="description-draft-button" type="button" onClick={createAnimalDescriptionDraft}>✦ Buat draf dari data di atas</button>
                <textarea
                  name="description"
                  rows={3}
                  defaultValue={currentFormData?.description ?? ''}
                  placeholder="Karakteristik fisik, kebiasaan alami, dan informasi penting lainnya..."
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    setAnimalDialog(false)
                    setEditingAnimal(null)
                    setFormPreset(null)
                  }}
                >
                  Batal
                </button>
                <button type="submit" className="button-primary">
                  {editingAnimal ? 'Simpan perubahan' : 'Simpan data satwa'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* JADWAL PERAWATAN DIALOG */}
      {careDialog && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCareDialog(false)
          }}
        >
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="care-dialog-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">AGENDA HARIAN</p>
                <h2 id="care-dialog-title">Buat jadwal perawatan satwa</h2>
              </div>
              <button className="modal-close" onClick={() => setCareDialog(false)} aria-label="Tutup">×</button>
            </div>
            <p className="modal-description">Pilih satwa dan tambahkan tugas perawatan bagi tim konservasi.</p>
            <form className="modal-form" onSubmit={saveCareTask}>
              <label>
                Satwa yang dirawat
                <select name="animalId" required defaultValue={selectedCareAnimalId || animals[0]?.id}>
                  {animals.map((animal) => (
                    <option key={animal.id} value={animal.id}>
                      {animal.name} ({animal.scientificName})
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-two-col">
                <label>
                  Tanggal
                  <input type="date" name="date" required defaultValue={todayISODate} />
                </label>
                <label>
                  Waktu
                  <input type="time" name="time" required defaultValue="09:00" />
                </label>
              </div>
              <label>
                Jenis perawatan
                <select name="type">
                  <option>Pemberian pakan</option>
                  <option>Pemeriksaan medis</option>
                  <option>Pembersihan kandang</option>
                </select>
              </label>
              <label>
                Catatan khusus
                <input name="notes" maxLength={120} placeholder="Misal: Tambahan suplemen vitamin & timbang berat badan" />
              </label>
              <div className="modal-actions">
                <button type="button" className="button-secondary" onClick={() => setCareDialog(false)}>
                  Batal
                </button>
                <button type="submit" className="button-primary" disabled={!animals.length}>
                  Simpan jadwal
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

function AnimalRow({ animal, onClick }: { animal: Animal; onClick: () => void }) {
  return (
    <button className="featured-row" onClick={onClick}>
      <img
        src={animal.imageUrl}
        alt={animal.name}
        className="animal-thumb-photo"
        onError={(e) => {
          e.currentTarget.src = 'https://images.unsplash.com/photo-1534188753412-3e26d0d618d6?w=200'
        }}
      />
      <span className="featured-name">
        <strong>{animal.name}</strong>
        <small><em>{animal.scientificName}</em> · {animal.habitat}</small>
      </span>
      <StatusBadge status={animal.status} />
      <span className="row-arrow">→</span>
    </button>
  )
}

function StatusBadge({ status }: { status: AnimalStatus }) {
  const className = status === 'Sehat' ? 'healthy' : status === 'Karantina' ? 'quarantine' : 'in-care'
  return (
    <span className={`status-badge ${className}`}>
      <i />{status}
    </span>
  )
}

function AnimalCard({
  animal,
  onViewDetail,
  onEdit,
  onDelete,
  onPlaySound,
  isPlayingSound,
}: {
  animal: Animal
  onViewDetail: () => void
  onEdit: () => void
  onDelete: () => void
  onPlaySound: () => void
  isPlayingSound: boolean
}) {
  return (
    <article className="animal-card">
      <div className="animal-card-art">
        <img
          className="animal-card-photo"
          src={animal.imageUrl}
          alt={animal.name}
          loading="lazy"
          onError={(event) => {
            event.currentTarget.src = 'https://images.unsplash.com/photo-1534188753412-3e26d0d618d6?w=800'
          }}
        />
        <span className="animal-age">{animal.age} tahun</span>

        <span className={`animal-conservation-tag pill-${animal.conservationStatus.toLowerCase().replace(/\s+/g, '-')}`}>
          {animal.conservationStatus}
        </span>

        <button
          className={`animal-card-sound-btn ${isPlayingSound ? 'playing' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onPlaySound()
          }}
          title="Dengarkan suara alami satwa"
          aria-label="Putar suara satwa"
        >
          {isPlayingSound ? '🔊' : '🔉'}
        </button>

        <div className="animal-actions">
          <button onClick={onEdit} aria-label={`Edit ${animal.name}`} title="Edit data satwa">✎</button>
          <button onClick={onDelete} aria-label={`Hapus ${animal.name}`} title="Hapus data satwa">×</button>
        </div>
      </div>

      <div className="animal-card-body">
        <div className="animal-title-line">
          <div>
            <h3>{animal.name}</h3>
            <p className="card-latin-name"><em>{animal.scientificName}</em></p>
          </div>
          <span className="animal-category-pill">{animal.category}</span>
        </div>

        <div className="animal-card-meta">
          <span>⌖ {animal.habitat}</span>
          <span>⚖️ {animal.weight || '—'}</span>
          <span>🥬 {animal.diet}</span>
          <span>⚥ {animal.gender ?? 'Belum diketahui'} · Asal: {animal.origin || 'Konservasi'}</span>
        </div>

        <button className="btn-view-detail" onClick={onViewDetail}>
          🔍 Lihat Detail Satwa Lengkap
        </button>

        <div className="animal-card-footer">
          <StatusBadge status={animal.status} />
          <span>ID · {animal.id.slice(0, 6).toUpperCase()}</span>
        </div>
      </div>
    </article>
  )
}

export default function App() {
  const [visitorMode, setVisitorMode] = useState(false)
  const [user, setUser] = useState<import('firebase/auth').User | null>(null)
  const [userRole, setUserRole] = useState<ManagerRole | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authMessage, setAuthMessage] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  async function resolveUserRole(nextUser: import('firebase/auth').User | null) {
    setUser(nextUser)
    if (!nextUser?.email) {
      setUserRole(null)
      setAuthReady(true)
      return
    }
    setAuthReady(false)
    const email = nextUser.email.toLowerCase()
    setAuthMessage('')
    if (ADMIN_EMAILS.has(email)) {
      setUserRole('admin')
      setAuthReady(true)
      return
    }
    try {
      const assignment = await getDoc(doc(db, 'zoo_user_roles', email))
      if (assignment.exists() && assignment.data().email?.toLowerCase() === email && assignment.data().role === 'security') {
        setUserRole('security')
      } else {
        setUserRole('unassigned')
        setAuthMessage(`Akun ${email} belum diberi peran. Minta Admin menambahkannya melalui menu Hak Akses Petugas.`)
      }
    } catch (error) {
      setUserRole('unassigned')
      setAuthMessage(error instanceof Error ? `Peran akun tidak dapat diperiksa: ${error.message}` : 'Peran akun tidak dapat diperiksa. Cek Firestore Rules.')
    } finally {
      setAuthReady(true)
    }
  }

  useEffect(() => onAuthStateChanged(auth, (nextUser) => { void resolveUserRole(nextUser) }), [])

  useEffect(() => {
    const redirectPending = sessionStorage.getItem('smart-zoo:google-redirect-pending') === 'true'
    getRedirectResult(auth).then(async (result) => {
      sessionStorage.removeItem('smart-zoo:google-redirect-pending')
      if (result?.user) {
        await resolveUserRole(result.user)
      } else if (redirectPending) {
        setAuthMessage('Google belum mengembalikan sesi login. Pastikan memilih akun Google yang benar, izinkan cookies, lalu coba lagi.')
      }
      setAuthReady(true)
    }).catch((error: unknown) => {
      sessionStorage.removeItem('smart-zoo:google-redirect-pending')
      console.error('[Firebase Auth] Google redirect sign-in failed:', error)
      setAuthMessage(error instanceof Error ? `Login Google gagal: ${error.message}` : 'Login Google gagal. Coba lagi.')
      setAuthReady(true)
    })
  }, [])

  if (visitorMode) {
    return <VisitorPortal onManagerLogin={() => setVisitorMode(false)} />
  }

  async function handleGoogleSignIn() {
    setSigningIn(true)
    setAuthMessage('')
    try {
      const credential = await signInWithPopup(auth, googleProvider)
      await resolveUserRole(credential.user)
    } catch (error) {
      const authError = error as { code?: string }
      if (authError.code !== 'auth/popup-blocked') {
        setAuthMessage(error instanceof Error ? `Login Google gagal: ${error.message}` : 'Login Google gagal. Coba lagi.')
        setSigningIn(false)
        return
      }
      sessionStorage.setItem('smart-zoo:google-redirect-pending', 'true')
      try {
        await signInWithRedirect(auth, googleProvider)
      } catch (redirectError) {
        sessionStorage.removeItem('smart-zoo:google-redirect-pending')
        setAuthMessage(redirectError instanceof Error ? `Login Google gagal: ${redirectError.message}` : 'Login Google gagal. Coba lagi.')
      }
    } finally {
      setSigningIn(false)
    }
  }

  if (!authReady) {
    return <main className="auth-screen"><section className="auth-card"><span className="auth-emoji">🦁</span><h1>Smart Zoo</h1><p>Memeriksa sesi login…</p></section></main>
  }

  if (!user) {
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <span className="auth-emoji">🦁</span>
          <p className="eyebrow">SISTEM MANAJEMEN KEBUN BINATANG</p>
          <h1>Smart Zoo</h1>
          <p>Pilih pengalaman pengunjung, atau masuk sebagai pengelola.</p>
          <button className="visitor-entry-button" type="button" onClick={() => setVisitorMode(true)}>🌿 Buka website pengunjung</button>
          <span className="auth-divider">AKSES PENGELOLA</span>
          {authMessage && <div className="auth-error" role="alert">{authMessage}</div>}
          <button className="button-primary auth-login-button" type="button" onClick={handleGoogleSignIn} disabled={signingIn}>
            {signingIn ? 'Menghubungkan…' : 'Masuk dengan Google'}
          </button>
        </section>
      </main>
    )
  }

  if (userRole === 'unassigned') {
    return (
      <main className="auth-screen"><section className="auth-card">
        <span className="auth-emoji">🛡️</span><p className="eyebrow">KONTROL AKSES PENGELOLA</p><h1>Akses belum diberikan</h1>
        <p>{authMessage || `Akun ${user.email ?? ''} belum memiliki peran.`}</p>
        <button className="button-primary auth-login-button" type="button" onClick={() => void resolveUserRole(user)}>Periksa akses lagi</button>
        <button className="auth-signout-link" type="button" onClick={() => void signOut(auth)}>Keluar / ganti akun</button>
      </section></main>
    )
  }

  if (userRole === 'security') {
    return <SecurityWorkspace userEmail={user.email ?? ''} onSignOut={() => void signOut(auth)} />
  }

  return (
    <>
      <div className="auth-account-bar">
        <span>{user.email}</span>
        <button type="button" onClick={() => setVisitorMode(true)}>Mode pengunjung</button>
        <button type="button" onClick={() => void signOut(auth)}>Keluar</button>
      </div>
      <ZooDashboard role="admin" userEmail={user.email ?? ''} />
    </>
  )
}

function SecurityWorkspace({ userEmail, onSignOut }: { userEmail: string; onSignOut: () => void }) {
  return (
    <div className="zoo-app security-workspace">
      <aside className="sidebar">
        <a className="zoo-brand" href="#security"><span className="brand-icon">🛡️</span><span><strong>Smart Zoo<br /><span>Keamanan</span></strong><small>RUANG KERJA LAPANGAN</small></span></a>
        <div className="sidebar-section-label">OPERASIONAL LAPANGAN</div>
        <nav className="side-nav" aria-label="Menu petugas keamanan"><span className="nav-item active"><span className="nav-icon">🚨</span>Pusat Komando</span></nav>
        <div className="sidebar-bottom"><div className="sidebar-tip"><span>📡</span><strong>Koordinasi langsung</strong><p>Laporan insiden dibagikan real-time dengan Admin pusat.</p></div><div className="profile-row"><div className="profile-avatar">🛡️</div><div><strong>Petugas Keamanan</strong><small>{userEmail}</small></div></div></div>
      </aside>
      <main className="main-area">
        <header className="topbar"><div className="breadcrumb">Smart Zoo <span>/</span> <strong>Pusat Komando</strong></div><div className="topbar-actions"><span className="today-date">{new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(new Date())}</span><button className="security-signout" type="button" onClick={onSignOut}>Keluar</button></div></header>
        <div className="page-content"><IncidentCenter role="security" currentUserEmail={userEmail} /></div>
      </main>
    </div>
  )
}
