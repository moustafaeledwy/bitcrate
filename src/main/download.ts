import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Candidate, DownloadOptions, FileFormat, Track } from '../shared/types'
import { outputFile } from './core/paths'
import { downloadArgs, parseProgress, tagArgs, type Tools } from './core/ytdlp'
import { runTool } from './tools'

async function fetchCover(url: string | undefined, folder: string, signal: AbortSignal): Promise<string | undefined> {
  if (!url?.startsWith('https://')) return undefined
  try {
    const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) })
    if (!response.ok) return undefined
    const file = join(folder, 'cover.img')
    await writeFile(file, Buffer.from(await response.arrayBuffer()))
    return file
  } catch {
    return undefined
  }
}

// Copies through a .part file, so an interrupted copy never looks like a finished track.
async function moveInto(source: string, destination: string): Promise<void> {
  await mkdir(dirname(destination), { recursive: true })
  const partial = `${destination}.part`
  await copyFile(source, partial)
  await rename(partial, destination)
}

export async function downloadTrack(
  track: Track,
  candidate: Candidate,
  options: DownloadOptions,
  playlistName: string,
  tools: Tools,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
  force = false
): Promise<string[]> {
  const formats: FileFormat[] = options.format === 'both' ? ['m4a', 'mp3'] : [options.format]
  const outputs = formats.map((format) => ({ format, file: outputFile(options, playlistName, format, track) }))
  if (!force && outputs.every(({ file }) => existsSync(file))) return outputs.map(({ file }) => file)

  const job = await mkdtemp(join(tmpdir(), 'bitcrate-'))
  try {
    await runTool(tools.ytDlp, downloadArgs(candidate.videoId, formats[0], join(job, 'audio.%(ext)s'), tools), {
      signal,
      onLine: (line) => {
        const fraction = parseProgress(line)
        if (fraction !== null) onProgress(fraction * 0.9)
      }
    })
    const audio = (await readdir(job)).find((name) => name.startsWith('audio.'))
    if (!audio) throw new Error('The download finished but no audio file was saved.')

    const cover = await fetchCover(track.coverUrl, job, signal)
    for (const { format, file } of outputs) {
      const tagged = join(job, `tagged.${format}`)
      const request = { input: join(job, audio), output: tagged, format, track, videoId: candidate.videoId }
      await runTool(tools.ffmpeg, tagArgs({ ...request, cover }), { signal }).catch(async (error) => {
        // A bad cover image should cost the cover, not the track.
        if (!cover || signal.aborted) throw error
        await runTool(tools.ffmpeg, tagArgs(request), { signal })
      })
      await moveInto(tagged, file)
    }
    return outputs.map(({ file }) => file)
  } finally {
    await rm(job, { recursive: true, force: true }).catch(() => {})
  }
}
