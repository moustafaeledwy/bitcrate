import { join } from 'node:path'
import type { FileFormat, Track } from '../../shared/types'

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

export function safeName(name: string): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .replace(/[. ]+$/, '')
  if (!cleaned) return 'Untitled'
  return RESERVED.test(cleaned) ? `${cleaned}_` : cleaned
}

export function trackFileName(track: Track, format: FileFormat): string {
  const number = track.variant ? ` (${track.variant})` : ''
  return `${safeName(`${track.artists.join(', ')} - ${track.title}`)}${number}.${format}`
}

export function playlistFolder(outDir: string, playlistName: string): string {
  return join(outDir, safeName(playlistName))
}

export function outputFile(
  options: { outDir: string; splitByFormat: boolean },
  playlistName: string,
  format: FileFormat,
  track: Track
): string {
  const folder = playlistFolder(options.outDir, playlistName)
  return options.splitByFormat
    ? join(folder, format.toUpperCase(), trackFileName(track, format))
    : join(folder, trackFileName(track, format))
}

export function m3uContent(entries: { track: Track; file: string }[]): string {
  const lines = ['#EXTM3U']
  for (const { track, file } of entries) {
    const seconds = track.durationMs ? Math.floor(track.durationMs / 1000) : -1
    lines.push(`#EXTINF:${seconds},${track.artists.join(', ')} - ${track.title}`, file)
  }
  return `${lines.join('\n')}\n`
}
