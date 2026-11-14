import { useEffect, useRef, useState, type FormEvent } from 'react'
import './Chatbot.css'

type Provider = 'gemini' | 'website' | 'n8n'
type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string }
type WebsiteData = {
  animals: Array<{
    name: string
    scientificName: string
    category: string
    habitat: string
    status: string
    conservationStatus: string
    diet: string
    origin: string
    age?: number
    weight?: string
    gender?: string
    description?: string
  }>
  habitats: Array<{ name: string; location: string; capacity: number; cleanliness: string }>
  careTasks: Array<{ animalName: string; type: string; date: string; time: string; notes: string; done: boolean }>
}
type ChatSettings = { provider: Provider; model: string; n8nWebhookUrl: string }

const N8N_WEBHOOK_STORAGE_KEY = 'smart-zoo-n8n-chat-webhook'
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'
const initialSettings: ChatSettings = {
  provider: 'gemini',
  model: DEFAULT_GEMINI_MODEL,
  n8nWebhookUrl: localStorage.getItem(N8N_WEBHOOK_STORAGE_KEY) || import.meta.env.VITE_N8N_CHAT_WEBHOOK_URL || '',
}
const suggestedQueries = ['Cari satwa berstatus kritis', 'Satwa apa yang ada di Sabana?', 'Cari jadwal perawatan']
const assistantInstruction = 'Kamu adalah asisten Smart Zoo berbahasa Indonesia. Bantu pengguna mencari dan menjelaskan data yang tersedia di situs ini. Gunakan hanya data situs yang disediakan untuk pertanyaan terkait kebun binatang; jika tidak ada, katakan bahwa data tidak ditemukan.'

function normalizeSearchText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function searchWebsite(query: string, data: WebsiteData) {
  const ignoredTerms = new Set(['cari', 'temukan', 'tampilkan', 'tolong', 'yang', 'di', 'dalam', 'website', 'web', 'status'])
  const synonyms: Record<string, string> = { hewan: 'satwa', sakit: 'perawatan', dirawat: 'perawatan', kandang: 'habitat' }
  const terms = normalizeSearchText(query).split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2 && !ignoredTerms.has(term))
    .map((term) => synonyms[term] ?? term)
  if (!terms.length) return 'Tulis nama satwa, habitat, status, atau jadwal perawatan yang ingin dicari.'

  const records = [
    ...data.animals.map((animal) => ({ kind: 'Satwa', title: animal.name, text: `${animal.name} (${animal.scientificName}) · ${animal.category} · Habitat: ${animal.habitat} · Bobot: ${animal.weight || '—'} · Status: ${animal.status} · Konservasi: ${animal.conservationStatus} · Pakan: ${animal.diet} · Asal: ${animal.origin}${animal.description ? ` · ${animal.description}` : ''}` })),
    ...data.habitats.map((habitat) => ({ kind: 'Habitat', title: habitat.name, text: `${habitat.name} · Lokasi: ${habitat.location} · Kapasitas: ${habitat.capacity} satwa · Kebersihan: ${habitat.cleanliness}` })),
    ...data.careTasks.map((task) => ({ kind: 'Perawatan', title: `${task.type} — ${task.animalName}`, text: `${task.type} untuk ${task.animalName} · ${task.date} pukul ${task.time} · ${task.done ? 'Selesai' : 'Belum selesai'} · ${task.notes}` })),
  ]
  const matches = records.map((record) => {
    const searchableText = normalizeSearchText(`${record.kind} ${record.title} ${record.text}`)
    return { ...record, score: terms.reduce((score, term) => score + (searchableText.includes(term) ? 1 : 0), 0) }
  }).filter((record) => record.score > 0).sort((a, b) => b.score - a.score).slice(0, 6)

  if (!matches.length) return `Tidak ditemukan data yang cocok untuk “${query}”. Coba nama satwa, habitat, status kesehatan, atau jadwal perawatan.`
  return `Saya menemukan ${matches.length} data yang cocok di website:\n\n${matches.map((match, index) => `${index + 1}. [${match.kind}] ${match.text}`).join('\n\n')}`
}

function websiteContext(data: WebsiteData) {
  return JSON.stringify({ satwa: data.animals, habitat: data.habitats, jadwalPerawatan: data.careTasks }, null, 2)
}

async function getResponse(response: Response) {
  const result: unknown = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
      ? result.error
      : `Permintaan gagal (HTTP ${response.status}).`
    throw new Error(message)
  }
  if (!result || typeof result !== 'object' || !('text' in result) || typeof result.text !== 'string') {
    throw new Error('Server tidak mengembalikan jawaban AI.')
  }
  return result.text
}

function getN8nAnswer(result: unknown): string {
  const firstResult = Array.isArray(result) ? result[0] : result
  if (typeof firstResult === 'string') return firstResult
  if (firstResult && typeof firstResult === 'object') {
    const record = firstResult as Record<string, unknown>
    for (const key of ['output', 'text', 'answer', 'response', 'message']) {
      if (typeof record[key] === 'string') return record[key]
    }
    if (record.data && typeof record.data === 'object') return getN8nAnswer(record.data)
    return JSON.stringify(firstResult, null, 2)
  }
  throw new Error('Webhook n8n tidak mengirim jawaban. Pastikan workflow mengembalikan output, text, answer, atau response.')
}

export default function Chatbot({ websiteData, compact = false }: { websiteData: WebsiteData; compact?: boolean }) {
  const [settings, setSettings] = useState<ChatSettings>(initialSettings)
  const [sessionId] = useState(() => {
    const storedId = sessionStorage.getItem('smart-zoo-n8n-chat-session')
    if (storedId) return storedId
    const newId = crypto.randomUUID()
    sessionStorage.setItem('smart-zoo-n8n-chat-session', newId)
    return newId
  })
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', content: 'Halo! Saya bisa mencari data satwa, habitat, dan jadwal perawatan di website. Pilih pencarian website atau Gemini, lalu tulis pertanyaanmu.' },
  ])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showSettings, setShowSettings] = useState(!compact)
  const conversationEnd = useRef<HTMLDivElement>(null)

  useEffect(() => {
    conversationEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy])

  async function sendMessage(event?: FormEvent<HTMLFormElement>, suggestedQuery?: string) {
    event?.preventDefault()
    const text = (suggestedQuery ?? draft).trim()
    if (!text || busy) return
    setError('')

    const history = [...messages.filter((message) => message.id !== 'welcome'), { id: crypto.randomUUID(), role: 'user' as const, content: text }]
    setMessages((current) => [...current, history[history.length - 1]])
    setDraft('')
    setBusy(true)

    try {
      let answer: string
      if (settings.provider === 'website') {
        answer = searchWebsite(text, websiteData)
      } else if (settings.provider === 'n8n') {
        if (!settings.n8nWebhookUrl.trim()) throw new Error('Masukkan URL Production Webhook dari node Chat Trigger/Webhook n8n terlebih dahulu.')
        let webhookUrl: URL
        try {
          webhookUrl = new URL(settings.n8nWebhookUrl.trim())
          if (webhookUrl.protocol !== 'https:' && webhookUrl.hostname !== 'localhost') throw new Error()
        } catch {
          throw new Error('URL webhook tidak valid. Gunakan URL https:// dari Production Webhook n8n.')
        }
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'sendMessage',
            chatInput: text,
            sessionId,
            history: history.map(({ role, content }) => ({ role, content })),
            websiteData,
          }),
        })
        const result: unknown = await response.json().catch(() => null)
        if (!response.ok) {
          const errorMessage = result && typeof result === 'object' && 'message' in result && typeof result.message === 'string'
            ? result.message
            : `Webhook n8n gagal (HTTP ${response.status}). Periksa URL dan konfigurasi CORS di n8n.`
          throw new Error(errorMessage)
        }
        answer = getN8nAnswer(result)
      } else {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'gemini',
            model: settings.model.trim() || DEFAULT_GEMINI_MODEL,
            history: history.map(({ role, content }) => ({ role, content })),
            websiteContext: `${assistantInstruction}\n\n${websiteContext(websiteData)}`,
          }),
        })
        answer = await getResponse(response)
      }
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: answer }])
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Terjadi kesalahan saat menghubungi AI.')
    } finally {
      setBusy(false)
    }
  }

  const providerName = settings.provider === 'gemini' ? 'Google Gemini' : settings.provider === 'n8n' ? 'n8n + AI' : 'Pencarian data website'

  return (
    <section className="assistant-workspace" aria-label="Chatbot pencarian website dan Gemini">
      <div className="assistant-topline">
        <div className="assistant-status"><span className="assistant-status-dot" /> Asisten integrasi <span className="assistant-status-divider">·</span> {providerName}</div>
        <button className="assistant-settings-toggle" type="button" onClick={() => setShowSettings((value) => !value)} aria-expanded={showSettings}>
          ⚙ {showSettings ? 'Sembunyikan konfigurasi' : 'Konfigurasi'}
        </button>
      </div>

      <div className={`assistant-layout ${showSettings ? '' : 'assistant-layout-chat-only'}`}>
        <section className="assistant-chat panel">
          <div className="assistant-chat-heading">
            <div className="assistant-avatar">✦</div>
            <div><strong>Asisten Website</strong><small>Pencarian data website dan chat AI</small></div>
            <span className="assistant-online"><i /> Siap</span>
          </div>
          <div className="assistant-messages" aria-live="polite">
            {messages.map((message) => (
              <article className={`assistant-message assistant-message-${message.role}`} key={message.id}>
                {message.role === 'assistant' && <span className="assistant-message-avatar">✦</span>}
                <div className="assistant-bubble"><small>{message.role === 'assistant' ? 'ASISTEN' : 'ANDA'}</small><p>{message.content}</p></div>
              </article>
            ))}
            {busy && <div className="assistant-message assistant-message-assistant"><span className="assistant-message-avatar">✦</span><div className="assistant-bubble assistant-typing"><span /><span /><span /></div></div>}
            <div ref={conversationEnd} />
          </div>
          {error && <div className="assistant-error" role="alert">⚠ {error}</div>}
          {messages.length < 3 && <div className="assistant-prompts">{suggestedQueries.map((query) => <button type="button" key={query} onClick={() => void sendMessage(undefined, query)} disabled={busy}>{query}</button>)}</div>}
          <form className="assistant-composer" onSubmit={(event) => void sendMessage(event)}>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage() } }} placeholder={settings.provider === 'website' ? 'Cari satwa, habitat, status, atau jadwal di website…' : 'Tanyakan sesuatu kepada asisten…'} rows={2} aria-label="Pesan" />
            <button type="submit" disabled={busy || !draft.trim()} aria-label="Kirim pesan">{busy ? '…' : '↑'}</button>
            <small>Enter untuk kirim · Shift + Enter untuk baris baru</small>
          </form>
        </section>

        {showSettings && <aside className="assistant-config panel">
          <div className="assistant-config-heading"><span>🔌</span><div><h2>Koneksi AI</h2><p>Pilih pencarian website atau Google Gemini.</p></div></div>
          <label className="assistant-field">Mode
            <select value={settings.provider} onChange={(event) => setSettings((current) => ({ ...current, provider: event.target.value as Provider }))}>
              <option value="website">Pencarian data website</option>
              <option value="n8n">n8n + AI / Google Sheets</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </label>
          {settings.provider === 'website' ? <div className="assistant-security-note"><span>🔎</span><p>Cari langsung data satwa, habitat, dan jadwal perawatan di website tanpa API key.</p></div> : <>
            {settings.provider === 'n8n' ? <>
              <label className="assistant-field">URL Production Webhook n8n
                <input type="url" value={settings.n8nWebhookUrl} onChange={(event) => {
                  const n8nWebhookUrl = event.target.value
                  setSettings((current) => ({ ...current, n8nWebhookUrl }))
                  localStorage.setItem(N8N_WEBHOOK_STORAGE_KEY, n8nWebhookUrl)
                }} placeholder="https://n8n.example.com/webhook/..." />
              </label>
              <div className={`assistant-security-note ${settings.n8nWebhookUrl.trim() ? '' : 'assistant-api-unconfigured'}`}><span>{settings.n8nWebhookUrl.trim() ? '🔗' : '⚙️'}</span><p>{settings.n8nWebhookUrl.trim() ? 'Pesan akan dikirim ke workflow n8n bersama sessionId dan data website. Aktifkan workflow dan izinkan origin website pada pengaturan CORS n8n.' : <>Di n8n, buat workflow <strong>Chat Trigger → OpenAI → (opsional) Google Sheets → Respond to Chat</strong>. Salin <strong>Production URL</strong> dari Chat Trigger atau Webhook ke kolom ini.</>}</p></div>
            </> : <>
              <label className="assistant-field">Model
                <select value={settings.model} onChange={(event) => setSettings((current) => ({ ...current, model: event.target.value }))}>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (cepat)</option>
                  <option value="gemini-2.5-pro">Gemini 2.5 Pro (paling pintar)</option>
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                </select>
              </label>
              <div className="assistant-security-note"><span>✅</span><p>Pesan diproses oleh Google Gemini melalui server agar API key tidak dikirim ke browser. Isi GEMINI_API_KEY di .env.local dengan API key dari https://aistudio.google.com/apikey, lalu mulai ulang server. Data website otomatis dipakai sebagai konteks jawaban.</p></div>
            </>}
          </>}
        </aside>}
      </div>
    </section>
  )
}
