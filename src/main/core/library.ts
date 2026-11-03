import { readdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { DownloadOptions, FileFormat, Track } from '../../shared/types'
import { normalize } from './match'
import { outputFile } from './paths'

const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.aac', '.wav', '.aif', '.aiff', '.flac', '.alac', '.ogg', '.opus', '.wma'])
// Words a file name can carry without being a different track. Version words like "extended" must not be here.
const HARMLESS_WORDS = ['original', 'mix', 'official', 'audio', 'video', 'lyric', 'lyrics', 'hq', 'hd', 'and', 'feat', 'ft']

interface IndexedFile {
  path: string
  extension: string
  words: string[]
}

export interface FolderIndex {
  files: IndexedFile[]
  paths: Set<string>
}

const wordsOf = (text: string) => normalize(text).split(' ').filter(Boolean)

export function buildIndex(paths: string[]): FolderIndex {
  return {
    paths: new Set(paths.map((path) => path.toLowerCase())),
    files: paths.map((path) => {
      const extension = extname(path).toLowerCase()
      const name = basename(path, extname(path)).replace(/^\d{1,3}[\s._-]+/, '')
      return { path, extension, words: wordsOf(name) }
    })
  }
}

function matcher(track: Track): (file: IndexedFile) => boolean {
  const titleWords = wordsOf(track.title.replace(/original mix/i, ' '))
  const artistWords = track.artists.map(wordsOf).filter((words) => words.length)
  const allowed = new Set([...titleWords, ...artistWords.flat(), ...HARMLESS_WORDS])
  return ({ words }) => {
    if (!titleWords.length) return false
    const present = new Set(words)
    const hasTitle = titleWords.every((word) => present.has(word))
    const hasArtist = !artistWords.length || artistWords.some((artist) => artist.every((word) => present.has(word)))
    return hasTitle && hasArtist && words.every((word) => allowed.has(word))
  }
}

export function findExisting(
  index: FolderIndex,
  track: Track,
  options: Pick<DownloadOptions, 'outDir' | 'splitByFormat' | 'format'>,
  playlistName: string
): string[] | null {
  const formats: FileFormat[] = options.format === 'both' ? ['m4a', 'mp3'] : [options.format]
  const expected = formats.map((format) => outputFile(options, playlistName, format, track))
  if (expected.every((path) => index.paths.has(path.toLowerCase()))) return expected
  // A numbered track shares its name with another version, so only its own file counts.
  if (track.variant) return null

  const matches = index.files.filter(matcher(track))
  if (!matches.length) return null
  const ofFormat = (format: FileFormat) => matches.find((file) => file.extension === `.${format}`)?.path
  if (options.format === 'both') {
    const both = formats.map(ofFormat)
    return both.every(Boolean) ? (both as string[]) : null
  }
  return [ofFormat(options.format as FileFormat) ?? matches[0].path]
}

export async function listAudioFiles(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => [])
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(folder, entry.name)
      if (entry.isDirectory()) return listAudioFiles(path)
      return entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase()) ? [path] : []
    })
  )
  return nested.flat()
}
