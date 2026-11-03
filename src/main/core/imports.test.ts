import { describe, expect, test } from 'vitest'
import { parseCsv, parseCsvmusicLibrary, parseCsvPlaylist } from './imports'

describe('parseCsv', () => {
  test('handles quotes, commas and newlines inside fields', () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi""\nthere"\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"\nthere']
    ])
  })
  test('ignores a byte order mark', () => {
    expect(parseCsv('﻿a\n1')[0][0]).toBe('a')
  })
})

describe('parseCsvPlaylist', () => {
  test('reads an Exportify file with full metadata', () => {
    const csv = [
      'Track URI,Track Name,Artist Name(s),Album Name,Album Release Date,Album Image URL,Disc Number,Track Number,Track Duration (ms),ISRC',
      'spotify:track:0Ws8BjDXw0wuzdghWrpxcj,Beat Trippin,Gorge;Someone,Move EP,2019-04-01,https://i.scdn.co/x,1,2,369744,DEABC1900001'
    ].join('\n')
    expect(parseCsvPlaylist(csv, 'My crate').tracks[0]).toEqual({
      id: '0Ws8BjDXw0wuzdghWrpxcj',
      title: 'Beat Trippin',
      artists: ['Gorge', 'Someone'],
      album: 'Move EP',
      year: '2019',
      coverUrl: 'https://i.scdn.co/x',
      discNumber: 1,
      trackNumber: 2,
      durationMs: 369744,
      isrc: 'DEABC1900001'
    })
  })
  test('reads a minimal file with other header names', () => {
    const playlist = parseCsvPlaylist('Song,Artist\nFather,"Luciano, Thomas Melchior"', 'Mix')
    expect(playlist.name).toBe('Mix')
    expect(playlist.tracks[0].title).toBe('Father')
    expect(playlist.tracks[0].artists).toEqual(['Luciano', 'Thomas Melchior'])
    expect(playlist.tracks[0].id).toBeTruthy()
  })
  test('explains what is missing when there is no title column', () => {
    expect(() => parseCsvPlaylist('foo,bar\n1,2', 'x')).toThrow(/track name/i)
  })
  test('skips rows with no title', () => {
    expect(parseCsvPlaylist('Title,Artist\n,Nobody\nReal,Someone', 'x').tracks).toHaveLength(1)
  })
})

describe('parseCsvmusicLibrary', () => {
  test('returns each saved playlist', () => {
    const lists = parseCsvmusicLibrary(
      JSON.stringify({
        playlists: [
          {
            name: 'Discovery',
            url: 'https://open.spotify.com/playlist/x',
            cover_url: 'https://i.scdn.co/p',
            tracks: [
              { title: 'Colt', artists: 'Dense & Pika, Other', album: 'Colt EP', sp_id: 'abc', cover_url: 'https://i.scdn.co/t', track_no: 3, disc_no: 1, duration_ms: 0, isrc: null, year: null }
            ]
          }
        ]
      })
    )
    expect(lists[0].name).toBe('Discovery')
    expect(lists[0].tracks[0]).toMatchObject({ id: 'abc', title: 'Colt', artists: ['Dense & Pika', 'Other'], album: 'Colt EP', coverUrl: 'https://i.scdn.co/t', trackNumber: 3 })
    expect(lists[0].tracks[0].durationMs).toBeUndefined()
  })
  test('rejects a file that is not a CSVMusic library', () => {
    expect(() => parseCsvmusicLibrary('{"foo":1}')).toThrow(/CSVMusic/)
  })
})
