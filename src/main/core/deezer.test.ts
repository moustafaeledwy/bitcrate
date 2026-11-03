import { describe, expect, test } from 'vitest'
import type { Track } from '../../shared/types'
import { fillMissing, lookupDeezer, pickDeezerMatch } from './deezer'

const track: Track = { id: '1', title: 'Knights of the Jaguar', artists: ['Rolando'], durationMs: 397000 }
const hit = (over = {}) => ({
  id: 9,
  title: 'Knights of the Jaguar (Original Mix)',
  duration: 397,
  artist: { name: 'DJ Rolando' },
  album: { title: 'Paradise Garage', cover_xl: 'https://cdn/x.jpg' },
  ...over
})

describe('pickDeezerMatch', () => {
  test('accepts a matching title, artist and length', () => {
    expect(pickDeezerMatch(track, [hit()])?.id).toBe(9)
  })
  test('rejects the same title at a different length', () => {
    expect(pickDeezerMatch(track, [hit({ duration: 150 })])).toBeUndefined()
  })
  test('rejects a different artist', () => {
    expect(pickDeezerMatch(track, [hit({ artist: { name: 'Elvis' } })])).toBeUndefined()
  })
})

describe('lookupDeezer', () => {
  test('returns album, cover, ISRC, year, position and BPM', async () => {
    const fetcher = async (url: string | URL | Request) =>
      Response.json(
        String(url).includes('/search')
          ? { data: [hit()] }
          : { isrc: 'US123', release_date: '2004-02-01', track_position: 4, disk_number: 2, bpm: 128 }
      )
    expect(await lookupDeezer(track, fetcher)).toEqual({
      album: 'Paradise Garage',
      coverUrl: 'https://cdn/x.jpg',
      durationMs: 397000,
      isrc: 'US123',
      year: '2004',
      trackNumber: 4,
      discNumber: 2,
      bpm: 128
    })
  })
  test('returns nothing when there is no match or the service fails', async () => {
    expect(await lookupDeezer(track, async () => Response.json({ data: [] }))).toEqual({})
    expect(await lookupDeezer(track, async () => new Response('x', { status: 500 }))).toEqual({})
  })
  test('leaves out a BPM of zero', async () => {
    const fetcher = async (url: string | URL | Request) =>
      Response.json(String(url).includes('/search') ? { data: [hit()] } : { bpm: 0 })
    expect((await lookupDeezer(track, fetcher)).bpm).toBeUndefined()
  })
})

describe('fillMissing', () => {
  test('never overwrites what Spotify already gave us', () => {
    expect(fillMissing({ ...track, album: 'Spotify album' }, { album: 'Other', isrc: 'X' })).toEqual({ isrc: 'X' })
  })
})

describe('lookupDeezer length', () => {
  test('supplies the length from the matched track', async () => {
    const noLength: Track = { id: '1', title: 'Knights of the Jaguar', artists: ['Rolando'] }
    const fetcher = async (url: string | URL | Request) =>
      Response.json(String(url).includes('/search') ? { data: [hit()] } : {})
    expect((await lookupDeezer(noLength, fetcher)).durationMs).toBe(397000)
  })
})
