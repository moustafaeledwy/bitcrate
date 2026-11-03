import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { describeFailure, type Tools } from './core/ytdlp'

const YT_DLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'

const bundledBin = () => (app.isPackaged ? join(process.resourcesPath, 'bin') : join(app.getAppPath(), 'resources', 'bin'))
const updatedBin = () => join(app.getPath('userData'), 'bin')

export function resolveTools(): Tools {
  const bundled = bundledBin()
  const updated = join(updatedBin(), 'yt-dlp.exe')
  const deno = join(bundled, 'deno.exe')
  return {
    ytDlp: existsSync(updated) ? updated : join(bundled, 'yt-dlp.exe'),
    ffmpeg: join(bundled, 'ffmpeg.exe'),
    deno: existsSync(deno) ? deno : undefined
  }
}

interface RunOptions {
  signal?: AbortSignal
  onLine?: (line: string) => void
  timeoutMs?: number
}

export function runTool(bin: string, args: string[], { signal, onLine, timeoutMs = 300000 }: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Cancelled'))
    // VS Code terminals set ELECTRON_RUN_AS_NODE, and yt-dlp needs UTF-8 for non-English titles.
    const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env
    const child = spawn(bin, args, { windowsHide: true, env: { ...env, PYTHONUTF8: '1' } })
    let output = ''
    let pending = ''

    const kill = () => {
      if (child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
    }
    const timer = setTimeout(kill, timeoutMs)
    signal?.addEventListener('abort', kill, { once: true })

    const onData = (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      output = (output + text).slice(-20000)
      pending += text
      const lines = pending.split(/\r?\n/)
      pending = lines.pop() ?? ''
      lines.forEach((line) => onLine?.(line))
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new Error(`Could not start ${bin}: ${error.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', kill)
      if (signal?.aborted) reject(new Error('Cancelled'))
      else if (code === 0) resolve(output)
      else reject(new Error(describeFailure(output)))
    })
  })
}

export async function updateYtDlp(): Promise<string> {
  const response = await fetch(YT_DLP_URL, { signal: AbortSignal.timeout(120000) })
  if (!response.ok) throw new Error(`Could not download the update (${response.status}).`)
  const folder = updatedBin()
  await mkdir(folder, { recursive: true })
  const partial = join(folder, 'yt-dlp.exe.part')
  await writeFile(partial, Buffer.from(await response.arrayBuffer()))
  await rename(partial, join(folder, 'yt-dlp.exe'))
  return (await runTool(resolveTools().ytDlp, ['--version'], { timeoutMs: 60000 })).trim()
}
