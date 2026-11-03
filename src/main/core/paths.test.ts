import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import type { Track } from '../../shared/types'
import { m3uContent, outputFile, playlistFolder, safeName, trackFileName } from './paths'

const track: Track = { id: '1', title: 'Beat: Trippin?', artists: ['Gorge', 'AC/DC'], durationMs: 369000 }

describe('safeName', () => {
  test('removes characters Windows forbids', () => {
    expect(safeName('a<b>c:d"e/f\\g|h?i*j')).toBe('a b c d e f g h i j')
  })
  test('removes trailing dots and spaces', () => {
    expect(safeName('Mr. Ho... ')).toBe('Mr. Ho')
  })
  test('avoids reserved device names', () => {
    expect(safeName('CON')).toBe('CON_')
  })
  test('never returns an empty name', () => {
    expect(safeName('???')).toBe('Untitled')
  })
  test('blocks folder traversal', () => {
    expect(safeName('..')).toBe('Untitled')
  })
  test('limits very long names', () => {
    expect(safeName('x'.repeat(400)).length).toBeLessThanOrEqual(120)
  })
})

describe('outputFile', () => {
  test('puts files in the playlist folder', () => {
    expect(outputFile({ outDir: 'D:\\M', splitByFormat: false }, 'Re-Onion', 'm4a', track)).toBe(
      join('D:\\M', 'Re-Onion', 'Gorge, AC DC - Beat Trippin.m4a')
    )
  })
  test('adds a format folder when splitting', () => {
    expect(outputFile({ outDir: 'D:\\M', splitByFormat: true }, 'Re-Onion', 'mp3', track)).toBe(
      join('D:\\M', 'Re-Onion', 'MP3', 'Gorge, AC DC - Beat Trippin.mp3')
    )
  })
})

describe('trackFileName', () => {
  test('uses artists and title', () => {
    expect(trackFileName(track, 'mp3')).toBe('Gorge, AC DC - Beat Trippin.mp3')
  })
})

describe('playlistFolder', () => {
  test('sanitizes the playlist name', () => {
    expect(playlistFolder('D:\\M', 'Bad/Name')).toBe(join('D:\\M', 'Bad Name'))
  })
})

describe('m3uContent', () => {
  test('lists relative files with length and title for rekordbox', () => {
    expect(m3uContent([{ track, file: 'Gorge - Beat.m4a' }])).toBe(
      '#EXTM3U\n#EXTINF:369,Gorge, AC/DC - Beat: Trippin?\nGorge - Beat.m4a\n'
    )
  })
})

describe('two versions with the same name', () => {
  test('a numbered variant gets its own file', () => {
    expect(trackFileName({ ...track, variant: 2 }, 'mp3')).toBe('Gorge, AC DC - Beat Trippin (2).mp3')
  })
})
