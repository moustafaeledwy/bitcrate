// Copies yt-dlp, FFmpeg and Deno from this PC into resources/bin so the app can ship with them.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const target = join(import.meta.dirname, '..', 'resources', 'bin')
mkdirSync(target, { recursive: true })

for (const name of ['yt-dlp.exe', 'ffmpeg.exe', 'deno.exe']) {
  const destination = join(target, name)
  const source = execFileSync('where.exe', [name], { encoding: 'utf8' }).split(/\r?\n/)[0].trim()
  if (!existsSync(source)) throw new Error(`${name} was not found on this PC. Install it with winget.`)
  if (existsSync(destination) && statSync(destination).size === statSync(source).size) continue
  copyFileSync(source, destination)
  console.log(`Copied ${name}`)
}
