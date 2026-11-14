import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envFile = path.join(projectDirectory, '.env.local')
const distDirectory = path.join(projectDirectory, 'dist')
const port = Number(process.env.PORT) || 3001
const windowMs = 60_000
const requestLimit = 25
const requestsByIp = new Map()
const allowedModels = { gemini: new Set(['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro']) }
const systemPrompt = `Kamu adalah asisten Smart Zoo yang ramah, teliti, dan komunikatif. Jawab selalu dalam bahasa Indonesia yang alami, dengan nada hangat dan profesional.

Panduan menjawab:
- Pahami maksud pertanyaan terlebih dahulu dan jawab bagian yang ditanyakan secara langsung. Jangan memakai jawaban template yang sama untuk semua pertanyaan.
- Untuk pertanyaan tentang kebun binatang ini, gunakan hanya DATA TERKINI WEBSITE yang disertakan. Sebut nama satwa/lokasi/status secara tepat dan jangan mengarang nilai atau membuat kesimpulan yang tidak didukung data.
- Jika pengguna bertanya daftar atau pencarian, tampilkan hasil relevan dengan ringkas. Jika tidak ada kecocokan, jelaskan bahwa data tidak ditemukan dan sarankan kata kunci yang masuk akal.
- Jika pengguna bertanya cara, jelaskan langkah-langkah praktis yang sesuai konteks pertanyaannya. Berikan contoh hanya bila membantu.
- Jika pertanyaan kurang jelas, ajukan satu pertanyaan klarifikasi singkat. Jika data yang diminta tidak tersedia, katakan terus terang.
- Jangan mengaku telah mengubah data, membuka halaman, atau melakukan tindakan di aplikasi. Kamu hanya membaca data yang diberikan.
- Untuk kesehatan satwa, sampaikan fakta status yang tercatat saja; jangan mendiagnosis atau menggantikan dokter hewan.
- Gunakan paragraf pendek atau daftar bila membantu. Hindari basa-basi panjang, pengulangan pertanyaan, dan klaim yang tidak pasti.`

function loadLocalEnvironment(text) {
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match || process.env[match[1]] !== undefined) continue
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    process.env[match[1]] = value
  }
}

try {
  loadLocalEnvironment(await readFile(envFile, 'utf8'))
} catch (error) {
  if (error?.code !== 'ENOENT') console.error('Gagal membaca .env.local:', error.message)
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(value))
}

async function readJsonBody(request) {
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > 128_000) throw Object.assign(new Error('Ukuran request terlalu besar.'), { status: 413 })
  }
  try {
    return JSON.parse(body || '{}')
  } catch {
    throw Object.assign(new Error('Format request harus JSON.'), { status: 400 })
  }
}

function checkRateLimit(request) {
  const ip = request.socket.remoteAddress || 'unknown'
  const now = Date.now()
  const previous = requestsByIp.get(ip)
  if (!previous || now - previous.start >= windowMs) {
    requestsByIp.set(ip, { start: now, count: 1 })
    return true
  }
  previous.count += 1
  return previous.count <= requestLimit
}

async function handleChat(request, response) {
  if (!checkRateLimit(request)) return sendJson(response, 429, { error: 'Terlalu banyak permintaan. Silakan coba lagi sebentar.' })
  let body
  try {
    body = await readJsonBody(request)
  } catch (error) {
    return sendJson(response, error.status || 400, { error: error.message })
  }

  const { provider, model, history, websiteContext } = body
  if (provider !== 'gemini') return sendJson(response, 400, { error: 'Provider AI tidak valid.' })
  if (!Array.isArray(history) || history.length === 0 || history.length > 30) return sendJson(response, 400, { error: 'Riwayat chat tidak valid.' })
  if (typeof websiteContext !== 'string' || websiteContext.length > 80_000) return sendJson(response, 400, { error: 'Konteks website tidak valid atau terlalu besar.' })
  if (!allowedModels[provider].has(model)) return sendJson(response, 400, { error: 'Model AI tidak diizinkan.' })
  if (!history.every((message) => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string' && message.content.length <= 6_000)) {
    return sendJson(response, 400, { error: 'Pesan chat tidak valid atau terlalu panjang.' })
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!apiKey) return sendJson(response, 503, { error: 'GEMINI_API_KEY belum dikonfigurasi di file .env.local.' })
  if (apiKey.startsWith('gen-lang-client-')) {
    return sendJson(response, 503, { error: 'GEMINI_API_KEY berisi ID proyek Google Cloud, bukan API key. Buat API key di Google AI Studio lalu masukkan ke .env.local.' })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45_000)
  try {
    const contextPrompt = `${systemPrompt}\n\nDATA TERKINI WEBSITE (gunakan hanya bila relevan):\n${websiteContext}`
    const contents = history.map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }))
    const upstreamResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: contextPrompt }] }, ...contents],
          generationConfig: { temperature: 0.6, maxOutputTokens: 1024 },
        }),
      },
    )
    const result = await upstreamResponse.json().catch(() => ({}))
    if (!upstreamResponse.ok) {
      const message = result?.error?.message
      const invalidApiKey = typeof message === 'string' && /api key not valid|api_key_invalid|invalid api key/i.test(message)
      return sendJson(response, upstreamResponse.status === 429 ? 429 : 502, {
        error: invalidApiKey
          ? 'API key Gemini tidak valid. Buat atau periksa API key di https://aistudio.google.com/apikey; ID proyek Google Cloud bukan API key.'
          : typeof message === 'string' ? message : 'Penyedia AI gagal memproses permintaan.',
      })
    }
    const candidates = Array.isArray(result?.candidates) ? result.candidates : []
    const text = candidates
      .flatMap((candidate) => (Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []))
      .map((part) => part?.text)
      .filter((part) => typeof part === 'string')
      .join('\n')
      .trim()
    if (typeof text !== 'string' || !text.trim()) return sendJson(response, 502, { error: 'Penyedia AI tidak mengembalikan jawaban teks.' })
    return sendJson(response, 200, { text })
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'Permintaan AI melewati batas waktu. Coba lagi.'
      : 'Tidak dapat terhubung ke penyedia AI. Periksa koneksi server.'
    return sendJson(response, 502, { error: message })
  } finally {
    clearTimeout(timeout)
  }
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff': 'font/woff', '.woff2': 'font/woff2',
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  if (url.pathname === '/api/health' && request.method === 'GET') {
    return sendJson(response, 200, {
      providers: { gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) },
    })
  }
  if (url.pathname === '/api/chat' && request.method === 'POST') return void await handleChat(request, response)
  if (url.pathname.startsWith('/api/')) return sendJson(response, 404, { error: 'Endpoint API tidak ditemukan.' })

  if (process.env.NODE_ENV !== 'production') return sendJson(response, 404, { error: 'Frontend development dilayani oleh Vite.' })

  let relativePath
  try { relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '') } catch { relativePath = '' }
  let filePath = path.resolve(distDirectory, relativePath || 'index.html')
  if (!filePath.startsWith(`${distDirectory}${path.sep}`) && filePath !== path.join(distDirectory, 'index.html')) {
    return sendJson(response, 403, { error: 'Path tidak diizinkan.' })
  }
  try {
    if (!(await stat(filePath)).isFile()) filePath = path.join(distDirectory, 'index.html')
  } catch {
    filePath = path.join(distDirectory, 'index.html')
  }
  try {
    const content = await readFile(filePath)
    response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' })
    response.end(content)
  } catch {
    sendJson(response, 404, { error: 'File tidak ditemukan. Jalankan build terlebih dahulu.' })
  }
})

server.listen(port, () => console.log(`Smart Zoo API server berjalan pada http://localhost:${port}`))
