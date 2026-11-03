import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import type { Track } from '../../shared/types'
import { buildIndex, findExisting, listAudioFiles } from './library'

const track = (over: Partial<Track> = {}): Track => ({ id: '1', title: 'Layla', artists: ['Cairokee'], ...over })
const m4a = { outDir: 'D:\\M', splitByFormat: false, format: 'm4a' as const }
const has = (files: string[], item: Track, options: Parameters<typeof findExisting>[2] = m4a) =>
  findExisting(buildIndex(files), item, options, 'Crate')

describe('finding a track in the folder', () => {
  test('finds a file from another playlist folder', () => {
    expect(has(['D:\\M\\Other\\Cairokee - Layla.m4a'], track())).toEqual(['D:\\M\\Other\\Cairokee - Layla.m4a'])
  })
  test('counts a different format as already having it', () => {
    expect(has(['D:\\M\\HQ\\Cairokee - Layla.mp3'], track())).toEqual(['D:\\M\\HQ\\Cairokee - Layla.mp3'])
  })
  test('prefers the format you asked for', () => {
    expect(has(['D:\\M\\a\\Cairokee - Layla.mp3', 'D:\\M\\b\\Cairokee - Layla.m4a'], track())).toEqual(['D:\\M\\b\\Cairokee - Layla.m4a'])
  })
  test('ignores case and punctuation', () => {
    expect(has(['D:\\M\\CAIROKEE_-_LAYLA.flac'], track())).toHaveLength(1)
  })
  test('finds files with a track number in front', () => {
    expect(has(['D:\\M\\03 - Cairokee - Layla.m4a'], track())).toHaveLength(1)
  })
  test('finds files named title first', () => {
    expect(has(['D:\\M\\Layla - Cairokee.m4a'], track())).toHaveLength(1)
  })
  test('finds a CSVMusic file with several artists', () => {
    const item = track({ title: 'Crash Bandicoot', artists: ['Komponente', 'Kurilo'] })
    expect(has(['D:\\HQ\\Discovery\\Komponente, Kurilo - Crash Bandicoot.mp3'], item)).toHaveLength(1)
  })
  test('matches titles the file system had to change', () => {
    const item = track({ title: 'Beat: Trippin?', artists: ['AC/DC'] })
    expect(has(['D:\\M\\AC DC - Beat Trippin.m4a'], item)).toHaveLength(1)
  })
  test('treats Original Mix as the same track', () => {
    expect(has(['D:\\M\\Cairokee - Layla (Original Mix).m4a'], track())).toHaveLength(1)
    expect(has(['D:\\M\\Cairokee - Layla.m4a'], track({ title: 'Layla - Original Mix' }))).toHaveLength(1)
  })
  test('works in other alphabets', () => {
    expect(has(['D:\\M\\حسين الجسمي - بشرة خير.m4a'], track({ title: 'بشرة خير', artists: ['حسين الجسمي'] }))).toHaveLength(1)
  })
})

describe('not mistaking a different track for one you have', () => {
  test('the same title by another artist', () => {
    expect(has(['D:\\M\\Mohamed Hamaki - Layla.m4a'], track())).toBeNull()
  })
  test('an extended version of a track you want the normal version of', () => {
    expect(has(['D:\\M\\Cairokee - Layla (Extended Mix).m4a'], track())).toBeNull()
  })
  test('the normal version of a remix you want', () => {
    expect(has(['D:\\M\\Cairokee - Layla.m4a'], track({ title: 'Layla (Dense Remix)' }))).toBeNull()
  })
  test('a longer title containing the same words', () => {
    expect(has(['D:\\M\\Cairokee - Layla Nights.m4a'], track())).toBeNull()
  })
  test('a second version with the same name only matches its own numbered file', () => {
    const second = track({ variant: 2 })
    const expected = join('D:\\M', 'Crate', 'Cairokee - Layla (2).m4a')
    expect(has(['D:\\M\\Crate\\Cairokee - Layla.m4a'], second)).toBeNull()
    expect(has([expected], second)).toEqual([expected])
  })
})

describe('when you asked for both formats', () => {
  const both = { ...m4a, format: 'both' as const }
  test('having one is not enough', () => {
    expect(has(['D:\\M\\Cairokee - Layla.m4a'], track(), both)).toBeNull()
  })
  test('having both is', () => {
    expect(has(['D:\\M\\Cairokee - Layla.m4a', 'D:\\M\\MP3\\Cairokee - Layla.mp3'], track(), both)).toHaveLength(2)
  })
})

describe('listAudioFiles', () => {
  const folder = mkdtempSync(join(tmpdir(), 'bitcrate-library-'))
  mkdirSync(join(folder, 'deep', 'er'), { recursive: true })
  writeFileSync(join(folder, 'a.m4a'), '')
  writeFileSync(join(folder, 'deep', 'b.MP3'), '')
  writeFileSync(join(folder, 'deep', 'er', 'c.wav'), '')
  writeFileSync(join(folder, 'cover.jpg'), '')
  writeFileSync(join(folder, 'list.m3u8'), '')
  writeFileSync(join(folder, 'half.m4a.part'), '')

  test('finds audio in every subfolder and nothing else', async () => {
    const names = (await listAudioFiles(folder)).map((file) => file.slice(folder.length + 1)).sort()
    expect(names).toEqual(['a.m4a', join('deep', 'b.MP3'), join('deep', 'er', 'c.wav')])
  })
  test('treats a missing folder as empty', async () => {
    expect(await listAudioFiles(join(folder, 'nope'))).toEqual([])
  })
})
