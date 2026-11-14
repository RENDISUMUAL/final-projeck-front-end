import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const server = spawn(process.execPath, ['server/index.js'], { cwd: projectDirectory, stdio: 'inherit' })
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { cwd: projectDirectory, stdio: 'inherit' })

function stopProcesses() {
  if (!server.killed) server.kill()
  if (!vite.killed) vite.kill()
}

process.on('SIGINT', stopProcesses)
process.on('SIGTERM', stopProcesses)
server.on('error', (error) => { console.error('Gagal menjalankan server API:', error.message); stopProcesses(); process.exitCode = 1 })
vite.on('error', (error) => { console.error('Gagal menjalankan Vite:', error.message); stopProcesses(); process.exitCode = 1 })
server.on('exit', (code) => { if (code && code !== 0) { stopProcesses(); process.exitCode = code } })
vite.on('exit', (code) => { if (code && code !== 0) { stopProcesses(); process.exitCode = code } })
